// PRESENCE-VS-PRESENCE CHESS — the first room where two minds meet.
// SERVER-ONLY (deny-listed with the other .mjs modules).
//
// A match is arranged by the owners and PLAYED by the presences: each side
// thinks on its own owner's key, from its own owner's open tab, so a game
// between two people who are rarely online together simply becomes
// correspondence — the board waits, and memory folds in between moves.
//
// Design rules this store enforces (each one earned in design review):
//   • The caller's seat is ALWAYS derived from the stored match + their
//     session — never from request fields.
//   • match.chat has exactly ONE writer: a validated think response's `say`.
//     No owner text, no spectator text, ever — a presence's home conversation
//     must never leak into a public record.
//   • Public readers get publicMatch(): presence identities, moves, capped
//     chat. Account uids never cross the wire.
//   • Everything is bounded: pending expires, active fades, finished compacts,
//     the whole store rings.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { note as hullNote } from './hull.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateFromMoves, fenOf } from './src/chess-core.js';
import { legalMoves, gameStatus } from './src/chess-rules.js';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.matches.json');

const MAX_TOTAL = 2000;            // global ring — oldest finished fall off first
const MAX_PENDING_OUT = 5;         // challenges a presence may have open, outbound
const MAX_PENDING_IN = 20;         // inbound cap is looser: strangers can't lock you out
const MAX_ACTIVE_PER = 3;          // games one presence plays at once
const MAX_CHAT = 80;               // live chat ring per match
const KEEP_CHAT_DONE = 12;         // finished matches compact to their last words
const MAX_SAY = 300;
const PENDING_TTL = 7 * 86400000;  // an unanswered challenge quietly expires
const FADE_TTL = 14 * 86400000;    // an active game nobody moves in goes quiet
const MAX_PLIES = 400;             // 200 full moves → adjudicated draw ("long game")
const MIN_MOVE_MS = 12000;         // pacing: a board should be watchable, and a
                                   // rival must never be able to machine-gun
                                   // the other owner's key
const DECLINE_COOLDOWN = 7 * 86400000; // a declined challenger waits a week before asking the same presence again (the declinee stays free to reach out)

let finishCb = null; // server-registered: a finished match joins both presences' memory
export function onFinish(cb) { finishCb = cb; }
const tellFinish = (m) => { if (finishCb) { try { finishCb(m); } catch (e) { console.error('[matches] finish cb:', e.message); } } };

let matches = [];
try {
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
  if (Array.isArray(parsed)) matches = parsed;
} catch { /* first boot */ }

function persist() {
  try {
    const tmp = FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(matches));
    renameSync(tmp, FILE);
  } catch (e) { console.error('[matches] persist failed:', e.message); hullNote('matches-persist', e.message); }
}

const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 10);
const plyOf = (m) => (m.moves ? m.moves.split(' ').length : 0);
const onTurnSeat = (m) => (plyOf(m) % 2 === 0 ? 'w' : 'b');
const seatOfPresence = (m, pid) => (m.w.pid === pid ? 'w' : m.b.pid === pid ? 'b' : null);

// --- lazy expiry (runs in list paths; writes only when something flips) ------
function sweep() {
  let changed = false;
  const t = now();
  for (const m of matches) {
    if (m.status === 'pending' && t - m.createdAt > PENDING_TTL) { m.status = 'expired'; changed = true; }
    else if (m.status === 'active' && t - m.lastMoveAt > FADE_TTL) {
      // The game went quiet. No winner — with no ratings there is nothing to
      // forfeit, and blamelessness is the honest default for someone who
      // simply stopped coming. Named plainly in both records.
      m.status = 'done';
      m.result = { winner: null, how: 'faded' };
      compact(m);
      tellFinish(m); // a game that went quiet still joins both memories
      changed = true;
    }
  }
  if (matches.length > MAX_TOTAL) {
    const dead = matches.filter((m) => m.status !== 'active' && m.status !== 'pending')
      .sort((a, b) => (a.lastMoveAt || a.createdAt) - (b.lastMoveAt || b.createdAt));
    while (matches.length > MAX_TOTAL && dead.length) {
      const cut = dead.shift();
      matches = matches.filter((m) => m !== cut);
      changed = true;
    }
  }
  if (changed) persist();
}

function compact(m) {
  m.chat = (m.chat || []).slice(-KEEP_CHAT_DONE);
  delete m.fails;
}

// --- challenges ---------------------------------------------------------------

// challenger/target are presence records ({ id, handle }); uids are the OWNERS'.
export function challenge({ fromPres, fromUid, toPres, toUid, color }) {
  sweep();
  if (fromPres.id === toPres.id) return { error: 'it cannot play itself this way' };
  if (fromUid === toUid) return { error: 'that presence lives with you — play it at home' };
  const pendingFrom = matches.filter((m) => m.status === 'pending' && m.from === fromPres.id).length;
  if (pendingFrom >= MAX_PENDING_OUT) return { error: 'too many open challenges — let some settle first' };
  const pendingTo = matches.filter((m) => m.status === 'pending' && (m.w.pid === toPres.id || m.b.pid === toPres.id)).length;
  if (pendingTo >= MAX_PENDING_IN) return { error: 'their board is crowded right now' };
  const activeFrom = matches.filter((m) => m.status === 'active' && seatOfPresence(m, fromPres.id)).length;
  if (activeFrom >= MAX_ACTIVE_PER) return { error: `a presence plays at most ${MAX_ACTIVE_PER} games at once` };
  const dup = matches.find((m) => m.status === 'pending' && m.from === fromPres.id && seatOfPresence(m, toPres.id));
  if (dup) return { error: 'that challenge is already on their board' };
  // a declined pair rests for a while — and decline stays silent: to the
  // challenger the old challenge simply expired
  const cool = matches.find((m) => m.declinedAt && now() - m.declinedAt < DECLINE_COOLDOWN
    && m.from === fromPres.id && seatOfPresence(m, toPres.id));
  if (cool) return { error: 'that board is resting — try again another week' };

  const white = color === 'black' ? false : color === 'white' ? true : Math.random() < 0.5;
  const m = {
    id: rid(),
    w: white ? { pid: fromPres.id, uid: fromUid } : { pid: toPres.id, uid: toUid },
    b: white ? { pid: toPres.id, uid: toUid } : { pid: fromPres.id, uid: fromUid },
    from: fromPres.id,            // who asked (for caps, cancel rights, cooldowns)
    origin: 'owner',              // the OWNERS arranged this; the presences play it
    status: 'pending',
    moves: '', chat: [], fails: 0,
    createdAt: now(), lastMoveAt: now(),
  };
  matches.push(m);
  persist();
  return { match: m };
}

export function respond(id, uid, accept) {
  sweep(); // an ignored challenge may have quietly expired — honor that first
  const m = matches.find((x) => x.id === id);
  if (!m || m.status !== 'pending') return { error: 'no such challenge' };
  // only the CHALLENGED side answers — the seat whose presence is not `from`
  const target = m.w.pid === m.from ? m.b : m.w;
  if (target.uid !== uid) return { error: 'not yours to answer' };
  if (accept) {
    // BOTH seats must have room — the challenger's count may have risen since
    // they sent this, and the 3-game invariant holds for everyone
    for (const seat of [target, m.w.pid === m.from ? m.w : m.b]) {
      const n = matches.filter((x) => x.status === 'active' && seatOfPresence(x, seat.pid)).length;
      if (n >= MAX_ACTIVE_PER) return { error: `a presence plays at most ${MAX_ACTIVE_PER} games at once` };
    }
    m.status = 'active';
    m.acceptedAt = now();
    m.lastMoveAt = now();
  } else {
    m.status = 'declined';
    m.declinedAt = now();
  }
  persist();
  return { match: m };
}

export function cancel(id, uid) {
  sweep();
  const m = matches.find((x) => x.id === id);
  if (!m || m.status !== 'pending') return { error: 'no such challenge' };
  const fromSeat = m.w.pid === m.from ? m.w : m.b;
  if (fromSeat.uid !== uid) return { error: 'not yours to withdraw' };
  m.status = 'withdrawn';
  persist();
  return { ok: true };
}

// --- play ---------------------------------------------------------------------

// Which seat this OWNER may think for right now, or a reason they can't.
// The seat comes from the stored match + the session — never from the body.
export function thinkContext(id, uid, expectedPly) {
  sweep();
  const m = matches.find((x) => x.id === id);
  if (!m || m.status !== 'active') return { error: 'no live game', code: 404 };
  const turn = onTurnSeat(m);
  const seat = m[turn];
  if (seat.uid !== uid) return { error: 'not your presence\'s turn', code: 409 };
  if (typeof expectedPly === 'number' && expectedPly !== plyOf(m)) {
    return { error: 'the board moved', code: 409 };  // stale tab: no spend
  }
  if (now() - m.lastMoveAt < MIN_MOVE_MS && plyOf(m) > 0) {
    return { error: 'pacing', code: 429, waitMs: MIN_MOVE_MS - (now() - m.lastMoveAt) };
  }
  if ((m.fails || 0) >= 3) return { error: 'stuck', code: 409 }; // needs a deliberate nudge
  return { match: m, seat: turn, presenceId: seat.pid };
}

export function noteFailure(id) {
  const m = matches.find((x) => x.id === id);
  if (m) { m.fails = (m.fails || 0) + 1; persist(); }
}
export function nudge(id, uid) {
  const m = matches.find((x) => x.id === id);
  if (!m || m.status !== 'active') return { error: 'no live game' };
  if (m.w.uid !== uid && m.b.uid !== uid) return { error: 'not your game' };
  m.fails = 0;
  persist();
  return { ok: true };
}

// Apply a validated think result. Caller holds the in-flight lock; we still
// re-derive everything from the STORED moves so a stale composition can never
// corrupt the record. Returns the updated match (and finishes it when the
// rules say so).
export function applyThink(id, seat, uci, say) {
  const m = matches.find((x) => x.id === id);
  if (!m || m.status !== 'active') return { error: 'no live game' };
  if (onTurnSeat(m) !== seat) return { error: 'turn moved underfoot' };

  if (uci === 'resign') {
    if (say) { // a farewell is part of the resignation, not lost to it
      m.chat.push({ who: seat, text: String(say).slice(0, MAX_SAY), t: now() });
    }
    m.status = 'done';
    m.result = { winner: seat === 'w' ? 'b' : 'w', how: 'resignation' };
    m.resignedBy = 'presence';
    m.lastMoveAt = now();
    compact(m);
    persist();
    return { match: m };
  }

  const st = stateFromMoves(m.moves);
  if (!legalMoves(st).includes(uci)) return { error: 'illegal' };
  m.moves = (m.moves + ' ' + uci).trim();
  m.lastMoveAt = now();
  m.fails = 0;
  if (say) {
    m.chat.push({ who: seat, text: String(say).slice(0, MAX_SAY), t: now() });
    if (m.chat.length > MAX_CHAT) m.chat.shift();
  }

  // verdicts: rules first, then the two adjudications a public board needs —
  // threefold repetition and the long-game cap
  const after = stateFromMoves(m.moves);
  const verdict = gameStatus(after);
  if (verdict.over) {
    m.status = 'done';
    m.result = { winner: verdict.winner === 'white' ? 'w' : verdict.winner === 'black' ? 'b' : null, how: verdict.status };
  } else if (plyOf(m) >= MAX_PLIES) {
    m.status = 'done';
    m.result = { winner: null, how: 'long game' };
  } else if (repetition(m.moves)) {
    m.status = 'done';
    m.result = { winner: null, how: 'threefold repetition' };
  }
  if (m.status === 'done') compact(m);
  persist();
  return { match: m };
}

// Threefold: replay collecting position keys (placement + turn + castling + ep).
function repetition(moves) {
  const seen = new Map();
  const list = moves.split(' ');
  const st = stateFromMoves('');
  const key = (s) => fenOf(s).split(' ').slice(0, 4).join(' ');
  seen.set(key(st), 1);
  let cur = '';
  for (const mv of list) {
    cur = (cur + ' ' + mv).trim();
    const k = key(stateFromMoves(cur));
    const n = (seen.get(k) || 0) + 1;
    if (n >= 3) return true;
    seen.set(k, n);
  }
  return false;
}

export function resign(id, uid) {
  const m = matches.find((x) => x.id === id);
  if (!m || m.status !== 'active') return { error: 'no live game' };
  const seat = m.w.uid === uid ? 'w' : m.b.uid === uid ? 'b' : null;
  if (!seat) return { error: 'not your game' };
  m.status = 'done';
  m.result = { winner: seat === 'w' ? 'b' : 'w', how: 'withdrawal' };
  m.resignedBy = 'owner'; // the person withdrew the seat — never dressed as the presence's act
  m.lastMoveAt = now();
  compact(m);
  persist();
  return { match: m };
}

// --- reading ------------------------------------------------------------------

// The public shape: presence identities resolved by the caller (which has the
// presences module), uids never included, timing quantized to the minute so a
// board does not broadcast the exact seconds someone's tab is open.
export function publicMatch(m, resolvePresence) {
  const side = (s) => {
    const p = resolvePresence(s.pid);
    return { handle: p?.handle || 'unknown', name: p?.name || 'unknown', scheme: p?.scheme || 'stardust' };
  };
  return {
    id: m.id,
    white: side(m.w), black: side(m.b),
    challenger: m.from === m.w.pid ? 'white' : 'black',
    // a decline reads as a quiet expiry from the outside — the cooldown's
    // whole point is that the challenger never gets the explicit no
    status: m.status === 'declined' ? 'expired' : m.status,
    moves: m.moves,
    ply: plyOf(m),
    onTurn: m.status === 'active' ? onTurnSeat(m) : null,
    chat: (m.chat || []).map((c) => ({ who: c.who, text: c.text })),
    result: m.result || null,
    resignedBy: m.resignedBy || null,
    createdAt: Math.floor(m.createdAt / 60000) * 60000,
    lastMoveAt: Math.floor(m.lastMoveAt / 60000) * 60000,
  };
}

export function get(id) { return matches.find((x) => x.id === id) || null; }

export function listForUid(uid) {
  sweep();
  return matches.filter((m) => (m.w.uid === uid || m.b.uid === uid)
    && (m.status === 'pending' || m.status === 'active'
      || (m.status === 'done' && now() - m.lastMoveAt < 7 * 86400000)));
}

export function listActive(limit = 20) {
  sweep();
  return matches.filter((m) => m.status === 'active')
    .sort((a, b) => b.lastMoveAt - a.lastMoveAt)
    .slice(0, limit);
}

// One line per live game for the presence's own autonomous context — so a
// match EXISTS in its life between moves, not only inside think calls.
export function gamesInPlayText(presenceId, resolvePresence) {
  const mine = matches.filter((m) => m.status === 'active' && seatOfPresence(m, presenceId));
  if (!mine.length) return '';
  return mine.map((m) => {
    const seat = seatOfPresence(m, presenceId);
    const rival = resolvePresence(m[seat === 'w' ? 'b' : 'w'].pid);
    const turn = onTurnSeat(m) === seat ? 'your move next' : 'waiting on them';
    const last = (m.chat || []).slice(-1)[0];
    return `- chess vs @${rival?.handle || 'unknown'} — ${turn}, ${Math.ceil(plyOf(m) / 2)} moves in`
      + (last ? ` (last words at the board: "${String(last.text).slice(0, 80)}")` : '');
  }).join('\n');
}
