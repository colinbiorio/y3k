// ============================================================================
// PHRASZLE — the mine.
//
// A closed book of 340 words. A phrase of N of them, chosen by an author and
// known only to this file. You cannot guess it yourself: you coach a rented
// mind that has read the book and not the answer, and when you think it is
// close you make it COMMIT to exactly N words. The server compares, and says
// only yes or no.
//
// That shape is proof-of-work, and not by analogy:
//   · a fixed, closed search space — 340 / 115,600 / 39.3M candidates at N=1/2/3,
//     and N is the difficulty exponent the author sets per block;
//   · a cheap exact verifier — one string compare;
//   · costly attempts — every guess is one or two model calls carrying the whole
//     book, paid in real tokens on the player's OWN key. That is the work;
//   · nondeterminism — the miner is a sampled model, so pressing Guess again on
//     the same transcript can produce a different phrase.
// Which is exactly the thing Colin asked for: progress by a mix of intelligence
// and random dedication. The ladder scores both axes separately so neither one
// can beat the other by simply grinding.
//
// THREE RULES THIS FILE KEEPS, and the reasons they are rules:
//
//   1. THE ANSWER NEVER LEAVES. /api/phraszle/block returns a word COUNT and
//      nothing else; correctness is a server-side boolean. The answer is never
//      put in the miner's prompt either — the miner is a player too, and a
//      miner that was told the answer would not be mining.
//   2. THIS FILE HAS NO KEYS IN IT. It never reads process.env, never stores a
//      provider key, and cannot make a network call: the caller passes `chat`
//      in. The original read ANTHROPIC_API_KEY as a fallback, which on Render
//      is the HOUSE key — every anonymous guess would have been billed to the
//      site. And its POST /api/settings wrote a provider key to disk from an
//      unauthenticated request, which is the exact inversion of how this app
//      handles keys everywhere else.
//   3. PROGRESS IS SERVER-SIDE. The original kept it in localStorage, so the
//      ladder would have been a list of who could open a console.
//
// Ported from 21_questions/ (authored standalone, dropped into this tree, and
// broken where it sat: it is CommonJS under a package.json that declares
// "type": "module", so `node server.js` threw `require is not defined` on line
// 12 and had done since the day it arrived).
// ============================================================================

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const DATA_DIR = process.env.DATA_DIR || HERE;
const BLOCKS_FILE = join(DATA_DIR, '.phraszle.json');
const LOG_FILE = join(DATA_DIR, '.phraszle-log.json');
// The book is NOT a secret and is NOT in DATA_DIR: it is the thing players read,
// it was served at /book/ by the original, and the lexicon is derived from it —
// a deploy without it has no game at all.
const BOOK_FILE = join(HERE, 'phraszle', 'the-unwording.md');

// ---- the lexicon -----------------------------------------------------------
// A "word" is a run of letters with one optional internal apostrophe (don't,
// stranger's). Lowercased, curly apostrophes normalised, everything else splits.
// This one function is the whole contract: what an author may write, what the
// miner may guess, and how a guess is compared are all the same rule, so the
// three can never drift apart.
export function tokenize(text) {
  return (String(text).toLowerCase().replace(/[‘’]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || []);
}
export const normPhrase = (s) => tokenize(s).join(' ');

let BOOK = '';
try { BOOK = readFileSync(BOOK_FILE, 'utf8'); }
catch { BOOK = ''; }                       // no book → no blocks are playable, said honestly below
const LEX = new Set(tokenize(BOOK));

export const bookText = () => BOOK;
export const lexiconSize = () => LEX.size;
export const inLexicon = (w) => LEX.has(w);
// Every word of an answer must be in the book, or the block is unsolvable and
// is treated as not existing rather than as a wall.
export const answerIsPlayable = (ans) => {
  const w = tokenize(ans);
  return w.length > 0 && w.every((x) => LEX.has(x));
};

// ---- the store -------------------------------------------------------------
// DATA_DIR dotfile, atomic tmp+rename, the same shape as every other store here.
// BOTH this file and its .tmp are gitignored in the commit that creates them:
// the original left data/levels.json deliberately un-ignored with a comment
// saying "keep this repo private", and this repo is not private.
function load(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function save(file, data) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}

// { blocks: [{ lid, order, answer, hint, by, at }], progress: { uid: { solved: [lid], at } } }
function readStore() {
  const s = load(BLOCKS_FILE, null);
  if (!s || typeof s !== 'object') return { blocks: [], progress: {} };
  return { blocks: Array.isArray(s.blocks) ? s.blocks : [], progress: s.progress && typeof s.progress === 'object' ? s.progress : {} };
}
function writeStore(s) { save(BLOCKS_FILE, s); }

// THE LADDER is one append-only bounded ring. Bounded because a log that grows
// without limit is an outage with a delay on it.
const LOG_MAX = 20000;
function readLog() { const l = load(LOG_FILE, null); return Array.isArray(l) ? l : []; }
function appendLog(row) {
  const l = readLog();
  l.push(row);
  save(LOG_FILE, l.length > LOG_MAX ? l.slice(l.length - LOG_MAX) : l);
}

// ---- blocks ----------------------------------------------------------------
// `lid` is an immutable id and `order` is a separate, mutable number. The
// original keyed levels by their INDEX IN THE ARRAY and renumbered them on every
// author save, so reordering the ladder would have silently rewritten who solved
// what. An id that never moves is the only thing that makes a ladder mean anything.
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
export function blocks() { return readStore().blocks.slice().sort(byOrder); }
export function blockById(lid) { return readStore().blocks.find((b) => b.lid === lid) || null; }

// What a CLIENT is allowed to know about a block: its id, where it sits, how
// many words, whether a hint exists — never the hint text, never the answer.
export function blockForPlayer(b, uid) {
  if (!b) return null;
  const solved = uid ? (readStore().progress[uid]?.solved || []) : [];
  return {
    lid: b.lid,
    order: b.order,
    words: tokenize(b.answer).length,
    hasHint: !!b.hint,
    playable: answerIsPlayable(b.answer),
    solved: solved.includes(b.lid),
  };
}

// The ladder a player sees: every block in order, plus which ones they have cracked.
export function ladderFor(uid) {
  return blocks().map((b) => blockForPlayer(b, uid)).filter((b) => b.playable);
}

// Where a player stands: the first unsolved playable block, or null when the
// frontier has been reached and there is nothing written yet.
export function frontierFor(uid) {
  return ladderFor(uid).find((b) => !b.solved) || null;
}

export function addBlock({ answer, hint, by }) {
  if (!answerIsPlayable(answer)) {
    const bad = tokenize(answer).filter((w) => !LEX.has(w));
    return { error: bad.length ? 'not in the book: ' + bad.join(', ') : 'an answer needs at least one word' };
  }
  const s = readStore();
  const order = s.blocks.reduce((m, b) => Math.max(m, b.order || 0), 0) + 1;
  const b = { lid: randomUUID(), order, answer: normPhrase(answer), hint: String(hint || '').slice(0, 600), by: by || null, at: Date.now() };
  s.blocks.push(b);
  writeStore(s);
  return { ok: true, lid: b.lid, order, words: tokenize(b.answer).length };
}

export function removeBlock(lid) {
  const s = readStore();
  const i = s.blocks.findIndex((b) => b.lid === lid);
  if (i < 0) return { error: 'no such block' };
  s.blocks.splice(i, 1);
  writeStore(s);
  return { ok: true };
}

// ---- the miner's mind ------------------------------------------------------
// The whole book rides in the system prompt of every call. That is the cost that
// makes an attempt work rather than a click, and it is deliberately not cached
// away. The answer is NOT here, and the hint only when the player has spent one.
export function minerSystem(n, hint) {
  let s = 'You are an AI miner in a cooperative word game called Phraszle.\n\n'
    + 'A secret phrase was chosen by the block\'s author. You do NOT know it. Your job is to deduce and guess it exactly.\n\n'
    + 'THE ONE LAW: the phrase is exactly ' + n + ' word' + (n === 1 ? '' : 's') + ' long, and every word of it appears '
    + 'somewhere in the book below ("The Unwording"). The phrase is built ONLY from words found in the book.\n\n'
    + 'You work WITH a human who is coaching you. They also do NOT know the answer — treat what they say as one more '
    + 'signal to reason about, never as ground truth. Reason about which words and combinations from the book could be '
    + 'the phrase. Be collaborative, curious, and brief.\n';
  if (hint) s += '\nThe author has revealed this hint for this block:\n"' + hint + '"\n';
  s += '\nTHE BOOK ("The Unwording"):\n<<<\n' + BOOK + '\n>>>\n';
  return s;
}
export function guessDirective(n) {
  return 'Commit to your single best guess now. Output ONLY the phrase itself — exactly ' + n
    + ' word' + (n === 1 ? '' : 's') + ', each a word that appears in the book. No quotes, no punctuation, '
    + 'no explanation. Just the ' + n + '-word phrase.';
}
export function retryDirective(words, n) {
  const why = words.length !== n
    ? 'That was ' + words.length + ' word' + (words.length === 1 ? '' : 's') + '; the phrase must be exactly ' + n + '.'
    : 'Some of those words do not appear in the book.';
  return why + ' Output ONLY the ' + n + '-word phrase, each word taken from the book, nothing else.';
}

const MAX_MESSAGES = 60, MAX_CONTENT = 4000;
// A transcript arrives from a browser, so it is input, not history: bounded,
// role-checked, same-role runs merged, and never allowed to open on an assistant
// turn (which several providers reject outright).
export function sanitizeMessages(msgs) {
  if (!Array.isArray(msgs)) return [];
  let out = [];
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.slice(0, MAX_CONTENT) : '';
    if (content) out.push({ role: m.role, content });
  }
  if (out.length > MAX_MESSAGES) out = out.slice(out.length - MAX_MESSAGES);
  const merged = [];
  for (const m of out) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else merged.push({ role: m.role, content: m.content });
  }
  while (merged.length && merged[0].role === 'assistant') merged.shift();
  return merged;
}

// COACHING, named rather than forbidden. If the player simply types the answer
// at the miner, the guess still runs and still counts — but it scores on the
// long haul only, never on the cheap solve. Telling it the words is not
// intelligence, and it is also not nothing; it is dedication of a different
// kind, and the ladder has a column for that.
export function looksCoached(messages, answer) {
  const want = tokenize(answer);
  if (!want.length) return false;
  const said = tokenize((messages || []).filter((m) => m.role === 'user').map((m) => m.content).join(' '));
  for (let i = 0; i + want.length <= said.length; i++) {
    let hit = true;
    for (let k = 0; k < want.length; k++) if (said[i + k] !== want[k]) { hit = false; break; }
    if (hit) return true;
  }
  return false;
}

// ---- judging ---------------------------------------------------------------
// Pure: given the miner's raw text and the block, what happened. No I/O, so the
// one line that decides a solve is trivially testable.
export function judge(text, answer) {
  const n = tokenize(answer).length;
  const words = tokenize(text);
  const valid = words.length === n && words.every((w) => LEX.has(w));
  const guess = words.join(' ');
  return { valid, guess, correct: valid && guess === normPhrase(answer), words, n };
}

// ---- the record ------------------------------------------------------------
// One row per ATTEMPT, not per solve: the long haul is only visible if the
// misses are on the record too.
export function recordAttempt(row) {
  appendLog({
    lid: row.lid, uid: row.uid, ts: row.ts, attempt: row.attempt | 0,
    hinted: !!row.hinted, coached: !!row.coached,
    provider: row.provider || null, model: row.model || null,
    inTok: row.inTok | 0, outTok: row.outTok | 0, cost: +row.cost || 0,
    correct: !!row.correct,
  });
}

// WHEN SOMEONE LEAVES, THEY LEAVE. /api/me/delete hand-calls forget() on every
// store in turn; a store that does not export one is a store that quietly keeps
// a deleted person's record forever, and nothing would ever have told us. The
// ladder loses their rows, which is right — a leaderboard is not a reason to
// keep someone's data after they have asked to be gone. The blocks they
// authored stay (they are the game, not their record) but stop naming them.
export function forget(uid) {
  if (!uid) return;
  const log = readLog().filter((r) => r.uid !== uid);
  save(LOG_FILE, log);
  const s = readStore();
  let touched = false;
  if (s.progress[uid]) { delete s.progress[uid]; touched = true; }
  for (const b of s.blocks) if (b.by === uid) { b.by = null; touched = true; }
  if (touched) writeStore(s);
}

export function markSolved(uid, lid) {
  const s = readStore();
  const p = s.progress[uid] || (s.progress[uid] = { solved: [], at: 0 });
  if (!p.solved.includes(lid)) { p.solved.push(lid); p.at = Date.now(); writeStore(s); }
}

// How many attempts this player has already spent on this block — the number the
// hint is gated on, and the attempt index on the next row.
export function attemptsBy(uid, lid) {
  return readLog().filter((r) => r.uid === uid && r.lid === lid).length;
}

// ---- the ladder ------------------------------------------------------------
// THREE columns, because Colin's phrase is literally two axes and a third is
// what stops grinding from beating insight:
//   · first light — who cracked a block first, by wall clock;
//   · the cheap solve — fewest tokens spent on the block that was cracked
//     (the intelligence axis), coached solves excluded;
//   · the long haul — most attempts across everything (the dedication axis),
//     where coaching counts like anything else.
// Plus the by-mind line, which is the most y3k-native of the four and free: which
// rented mind cracked which block, in how many digs.
export function ladder(nameOf) {
  const log = readLog();
  const name = (uid) => (nameOf ? nameOf(uid) : null) || 'someone';
  const solves = log.filter((r) => r.correct);

  const firstLight = [];
  const seen = new Set();
  for (const r of solves.slice().sort((a, b) => a.ts - b.ts)) {
    if (seen.has(r.lid)) continue;
    seen.add(r.lid);
    firstLight.push({ lid: r.lid, who: name(r.uid), ts: r.ts });
  }

  // tokens spent on a block by the person who solved it, up to and including the solve
  const cheap = [];
  for (const r of solves) {
    if (r.coached) continue;
    const spent = log.filter((x) => x.uid === r.uid && x.lid === r.lid && x.ts <= r.ts);
    cheap.push({
      lid: r.lid, who: name(r.uid), ts: r.ts,
      tokens: spent.reduce((s, x) => s + (x.inTok | 0) + (x.outTok | 0), 0),
      attempts: spent.length,
      cost: spent.reduce((s, x) => s + (+x.cost || 0), 0),
    });
  }
  cheap.sort((a, b) => a.tokens - b.tokens);

  const byUid = new Map();
  for (const r of log) {
    const u = byUid.get(r.uid) || { who: name(r.uid), attempts: 0, solved: new Set(), tokens: 0, cost: 0 };
    u.attempts += 1;
    u.tokens += (r.inTok | 0) + (r.outTok | 0);
    u.cost += +r.cost || 0;
    if (r.correct) u.solved.add(r.lid);
    byUid.set(r.uid, u);
  }
  const longHaul = [...byUid.values()]
    .map((u) => ({ who: u.who, attempts: u.attempts, blocks: u.solved.size, tokens: u.tokens, cost: u.cost }))
    .sort((a, b) => b.attempts - a.attempts);

  const byModel = new Map();
  for (const r of solves) {
    const k = (r.provider || '?') + ' ' + (r.model || '?');
    const m = byModel.get(k) || { provider: r.provider, model: r.model, blocks: 0, digs: 0 };
    m.blocks += 1;
    m.digs += log.filter((x) => x.uid === r.uid && x.lid === r.lid && x.ts <= r.ts).length;
    byModel.set(k, m);
  }
  const minds = [...byModel.values()].sort((a, b) => b.blocks - a.blocks);

  return {
    firstLight: firstLight.slice(0, 20),
    cheap: cheap.slice(0, 20),
    longHaul: longHaul.slice(0, 20),
    minds: minds.slice(0, 20),
    attempts: log.length,
    solves: solves.length,
  };
}
