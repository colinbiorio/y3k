// The presence's seat at the chessboard. SERVER-ONLY (deny-listed like the
// other .mjs modules): this file holds the platform's Lichess BOT token, keeps
// the event + game streams open, and relays state to the one y3k tab where the
// human and their presence are playing.
//
// Shape of a session, end to end:
//   1. the tab registers who is about to challenge us (expect) — we accept a
//      challenge from THAT lichess account and decline everyone else, so a
//      stranger on lichess.org can't occupy the presence's seat
//   2. the human's browser issues the challenge with their OWN token (which
//      never touches this server); our event stream sees it, accepts, and the
//      game stream begins
//   3. moves and chat relay to the tab over SSE; the bot's moves arrive from
//      /api/chess/think, which composes the prompt server-side and spends the
//      OWNER's key — BYOK holds here exactly as it does for tending
//   4. on finish, an onFinish callback lets the server write the game into the
//      presence's memory (a clipping — the shelf, not the identity tiers)
//
// One game at a time. This is a seat, not a server farm; the token is one bot
// account and a second simultaneous game would interleave two people's
// sessions through one identity.

const TOKEN = process.env.LICHESS_BOT_TOKEN || '';
const API = 'https://lichess.org';

let botUser = null;          // { id, username } once the account resolves
let bootError = null;        // why the connection is down, human-readable
let expected = null;         // { lichessUser, uid, presenceId, presenceHandle, at }
let game = null;             // live game state (see snapshot())
let subscribers = new Set(); // SSE responses watching the current session
let finishCb = null;         // server-registered: (summary) => void
let eventAbort = null;
let gameAbort = null;

const auth = { authorization: `Bearer ${TOKEN}` };
const EXPECT_TTL = 10 * 60 * 1000; // a registered challenge that never arrives expires

export const configured = () => !!TOKEN;
export function status() {
  return {
    configured: !!TOKEN,
    ready: !!botUser,
    botUser: botUser?.username || null,
    error: bootError,
    expecting: expected ? expected.lichessUser : null,
    game: game ? snapshot() : null,
  };
}
export function onFinish(cb) { finishCb = cb; }

function snapshot() {
  if (!game) return null;
  return {
    id: game.id,
    moves: game.moves,
    status: game.status,
    winner: game.winner || null,
    white: game.white, black: game.black,
    botColor: game.botColor,
    wtime: game.wtime, btime: game.btime, winc: game.winc, binc: game.binc,
    at: game.at, // when the clocks were last true — the client runs them forward
    chat: game.chat.slice(-40),
    thinking: game.thinking || false,
  };
}

function broadcast(event, data) {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) {
    try { res.write(line); } catch { subscribers.delete(res); }
  }
}

export function subscribe(res) {
  subscribers.add(res);
  try { res.write(`event: state\ndata: ${JSON.stringify(status())}\n\n`); } catch { /* gone already */ }
  res.on('close', () => subscribers.delete(res));
}

// The tab tells us who is about to challenge. Overwrites any stale expectation;
// refuses while a game is live (one seat).
export function expect({ lichessUser, uid, presenceId, presenceHandle }) {
  if (!TOKEN) return { error: 'chess is not configured on this server' };
  if (!botUser) return { error: bootError || 'the bot account is still connecting — try again in a moment' };
  if (game && game.status === 'started') return { error: 'a game is already in progress' };
  expected = { lichessUser: String(lichessUser).toLowerCase(), uid, presenceId, presenceHandle, at: Date.now() };
  return { ok: true, botUser: botUser.username };
}

export function isSessionOwner(uid) {
  return !!(expected && expected.uid === uid) || !!(game && game.uid === uid);
}

// ---- talking to lichess ------------------------------------------------------

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { ...auth, ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(15000),
  });
  return r;
}

export async function postMove(uci) {
  if (!game || game.status !== 'started') return { error: 'no live game' };
  const r = await api(`/api/bot/game/${game.id}/move/${encodeURIComponent(uci)}`, { method: 'POST' });
  if (r.ok) return { ok: true };
  let detail = '';
  try { detail = (await r.json()).error || ''; } catch { /* opaque */ }
  return { error: detail || `lichess said ${r.status}`, status: r.status };
}

export async function postChat(text) {
  if (!game) return { error: 'no live game' };
  const body = new URLSearchParams({ room: 'player', text: String(text).slice(0, 140) });
  const r = await api(`/api/bot/game/${game.id}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return r.ok ? { ok: true } : { error: `chat failed (${r.status})` };
}

export async function resign() {
  if (!game || game.status !== 'started') return { error: 'no live game' };
  const r = await api(`/api/bot/game/${game.id}/resign`, { method: 'POST' });
  return r.ok ? { ok: true } : { error: `resign failed (${r.status})` };
}

// The think route flips this so the tab can show the shimmer and so two
// overlapping think calls can't both fire.
export function setThinking(on) {
  if (!game) return;
  game.thinking = !!on;
  broadcast('thinking', { on: game.thinking });
}
export function current() { return game; }

// ---- streams -----------------------------------------------------------------

// One ndjson stream, line by line, with the caller deciding what each object
// means. Returns when the stream ends (caller reconnects).
async function ndjson(path, onLine, signal) {
  const r = await fetch(API + path, { headers: auth, signal });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue; // keep-alive newline
      try { onLine(JSON.parse(line)); } catch { /* partial/garbled line */ }
    }
  }
}

function endGame(summary) {
  if (finishCb && game) {
    try { finishCb(summary); } catch (e) { console.error('[lichess] finish callback:', e.message); }
  }
  broadcast('finish', summary);
  game = null;
  expected = null;
  if (gameAbort) { gameAbort.abort(); gameAbort = null; }
}

async function attachGame(gameId) {
  if (gameAbort) gameAbort.abort();
  gameAbort = new AbortController();
  try {
    await ndjson(`/api/bot/game/stream/${gameId}`, (msg) => {
      if (msg.type === 'gameFull') {
        const st = msg.state || {};
        game = {
          id: msg.id || gameId,
          uid: expected?.uid || game?.uid || null,
          presenceId: expected?.presenceId || game?.presenceId || null,
          presenceHandle: expected?.presenceHandle || game?.presenceHandle || null,
          white: msg.white?.name || '?', black: msg.black?.name || '?',
          botColor: (msg.white?.id === botUser?.id) ? 'w' : 'b',
          moves: st.moves || '',
          status: st.status || 'started',
          winner: st.winner || null,
          wtime: st.wtime, btime: st.btime, winc: st.winc, binc: st.binc,
          at: Date.now(),
          chat: [],
          thinking: false,
        };
        broadcast('state', status());
      } else if (msg.type === 'gameState' && game) {
        game.moves = msg.moves || game.moves;
        game.status = msg.status || game.status;
        game.winner = msg.winner || null;
        game.wtime = msg.wtime; game.btime = msg.btime;
        game.at = Date.now();
        broadcast('state', status());
        if (game.status !== 'started') {
          const g = game;
          endGame({
            id: g.id, status: g.status, winner: g.winner, moves: g.moves,
            botColor: g.botColor, white: g.white, black: g.black,
            presenceId: g.presenceId, presenceHandle: g.presenceHandle, uid: g.uid,
          });
        }
      } else if (msg.type === 'chatLine' && game) {
        if (msg.room && msg.room !== 'player') return; // spectators stay outside
        const line = { who: msg.username, text: String(msg.text || '').slice(0, 300), t: Date.now() };
        game.chat.push(line);
        if (game.chat.length > 60) game.chat.shift();
        broadcast('chat', line);
      }
    }, gameAbort.signal);
  } catch (e) {
    if (!gameAbort?.signal.aborted) console.error('[lichess] game stream dropped:', e.message);
  }
  // Stream closed. If lichess never told us the game ended, say so honestly
  // rather than leaving the tab frozen mid-game.
  if (game && game.status === 'started') {
    game.status = 'aborted';
    endGame({ id: game.id, status: 'aborted', winner: null, moves: game.moves, botColor: game.botColor, white: game.white, black: game.black, presenceId: game.presenceId, presenceHandle: game.presenceHandle, uid: game.uid });
  }
}

async function eventLoop() {
  for (;;) {
    eventAbort = new AbortController();
    try {
      await ndjson('/api/stream/event', async (ev) => {
        if (ev.type === 'challenge') {
          const c = ev.challenge;
          if (!c || c.challenger?.id === botUser?.id) return; // our own outgoing
          const from = String(c.challenger?.id || '').toLowerCase();
          const fresh = expected && Date.now() - expected.at < EXPECT_TTL;
          const wanted = fresh && from === expected.lichessUser && !game;
          try {
            await api(`/api/challenge/${c.id}/${wanted ? 'accept' : 'decline'}`, {
              method: 'POST',
              ...(wanted ? {} : {
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'reason=later',
              }),
            });
          } catch (e) { console.error('[lichess] challenge answer failed:', e.message); }
          if (!wanted) console.log(`[lichess] declined challenge from ${from} (expecting ${expected?.lichessUser || 'nobody'})`);
        } else if (ev.type === 'gameStart') {
          const gid = ev.game?.gameId || ev.game?.id;
          if (gid) attachGame(gid); // deliberately not awaited: the event loop keeps listening
        }
      }, eventAbort.signal);
    } catch (e) {
      console.error('[lichess] event stream dropped:', e.message);
    }
    await new Promise((r) => setTimeout(r, 5000)); // steady reconnect, no thundering
  }
}

// ---- boot --------------------------------------------------------------------

export async function start() {
  if (!TOKEN) { console.log('[lichess] no LICHESS_BOT_TOKEN — chess stays dark.'); return; }
  try {
    const r = await api('/api/account');
    if (!r.ok) { bootError = `token rejected (${r.status}) — check LICHESS_BOT_TOKEN`; console.error('[lichess]', bootError); return; }
    const acct = await r.json();
    // A fresh account isn't a bot yet. The upgrade is one call, irreversible,
    // and exactly what this account exists for — do it here so setup is: make
    // account, make token, paste token, done.
    if (acct.title !== 'BOT') {
      const up = await api('/api/bot/account/upgrade', { method: 'POST' });
      if (!up.ok) {
        bootError = `account "${acct.username}" could not be upgraded to a bot (${up.status}) — it must have played zero games`;
        console.error('[lichess]', bootError);
        return;
      }
      console.log(`[lichess] upgraded ${acct.username} to a BOT account.`);
    }
    botUser = { id: acct.id, username: acct.username };
    console.log(`[lichess] connected as BOT ${acct.username}.`);
    eventLoop(); // runs for the life of the process
  } catch (e) {
    bootError = `could not reach lichess: ${e.message}`;
    console.error('[lichess]', bootError);
  }
}
