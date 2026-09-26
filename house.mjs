// The house allowance — what one account may spend of the SITE's paid keys in a
// day, and what all accounts together may. The brain routes already refuse the
// house Anthropic key to anonymous callers; this is the other half of that fix.
// "Signed in" costs nothing to become (signup is an email and a password, with
// no verification), so a gate on identity alone let one throwaway account spend
// about $12 a minute of Opus at xhigh on the site's key.
//
// So there are two ceilings. Each ACCOUNT has a daily allowance, which bounds
// what any one account can do. Accounts are free, though, so a script that
// signs up again and again gets a fresh allowance each time — which is why the
// SITE also has a daily ceiling across every account together. When that is
// reached, the house key rests until UTC midnight for everyone but the founder.
//
// Two meters, same shape: dollars of house brain, characters of house voice.
// The founder is not metered — it is their key. Anyone can step outside the
// allowance entirely with their own key, which is the shape y3k always meant to
// have.
//
// Same zero-dependency patterns as every store: a JSON dotfile in DATA_DIR,
// atomic tmp+rename writes, bounded everything. Server-only.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const HOUSE_FILE = join(DATA_DIR, '.house.json');

// Tunable in the Render dashboard (saving restarts the service; no code change).
// 0 is a real value: it turns that part of the house off.
const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
export const BRAIN_USD_PER_DAY = num(process.env.HOUSE_DAILY_USD, 2);
export const VOICE_CHARS_PER_DAY = num(process.env.HOUSE_DAILY_VOICE_CHARS, 20000);
export const SITE_BRAIN_USD_PER_DAY = num(process.env.HOUSE_GLOBAL_DAILY_USD, 25);
export const SITE_VOICE_CHARS_PER_DAY = num(process.env.HOUSE_GLOBAL_DAILY_VOICE_CHARS, 200000);
// What a turn is held at until its real cost is known: roughly one ordinary
// turn. A turn that costs more settles higher, so a day can end a little above
// the cap — by at most one turn, because each account has one turn in flight.
export const TURN_HOLD_USD = num(process.env.HOUSE_TURN_HOLD_USD, 0.45);
const USER_CAP = 50000; // tracked accounts per day (memory guard)

const today = () => new Date().toISOString().slice(0, 10);
const round6 = (n) => Math.round(n * 1e6) / 1e6;

function load() {
  try {
    const d = JSON.parse(readFileSync(HOUSE_FILE, 'utf8'));
    if (!d || typeof d !== 'object' || typeof d.day !== 'string' || !d.users || typeof d.users !== 'object') return null;
    return { day: d.day, users: d.users, usd: Number(d.usd) || 0, chars: Number(d.chars) || 0 };
  } catch { return null; }
}
// { day: 'YYYY-MM-DD', users: { [uid]: { usd, chars } }, usd, chars } — only
// today is kept; the top-level usd/chars are the whole site's totals.
let state = load() || { day: today(), users: {}, usd: 0, chars: 0 };

function roll() {
  const d = today();
  if (state.day !== d) state = { day: d, users: {}, usd: 0, chars: 0 };
}

function writeNow() {
  try {
    const tmp = HOUSE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, HOUSE_FILE);
  } catch (e) { console.error('[house] could not persist:', e.message); }
}
// Coalesce a burst of turns into one write; the meter only has to be right to
// within a second, and a shutdown flushes (same shape as mind.mjs).
let pending = null;
function persist() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; writeNow(); }, 1000);
  if (typeof pending.unref === 'function') pending.unref();
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
  process.once(sig, () => { if (pending) { clearTimeout(pending); pending = null; writeNow(); } });
}

function entry(uid) {
  roll();
  let u = state.users[uid];
  if (!u) {
    if (Object.keys(state.users).length >= USER_CAP) return null; // fail closed
    u = state.users[uid] = { usd: 0, chars: 0 };
  }
  return u;
}

// One house turn in flight per account. Without it, the check-then-hold below
// admits ceil(cap / hold) turns at once from one account before any settles.
const inFlight = new Set();

// Why this account may not start a house brain turn now, or null if it may:
// 'signed-out', 'busy' (a turn of theirs is still running), 'account' (their
// day is spent) or 'site' (the whole site's day is spent).
export function brainRefusal(user) {
  if (!user) return 'signed-out';
  if (user.founder) return null;
  if (inFlight.has(user.id)) return 'busy';
  const u = entry(user.id);
  if (!u || u.usd >= BRAIN_USD_PER_DAY) return 'account';
  if (state.usd >= SITE_BRAIN_USD_PER_DAY) return 'site';
  return null;
}
export const brainAllowed = (user) => brainRefusal(user) === null;

// A house brain turn is charged BEFORE it runs, at the hold, then settled to
// its real cost when it ends. Charging only at the end let a caller open a
// stream, take the tokens, close the tab before the ledger line ran, and never
// be metered at all. brainRelease must follow every brainHold (the routes tie
// it to the response closing).
export function brainHold(user) {
  if (!user || user.founder) return 0;
  const u = entry(user.id);
  if (!u) return 0;
  inFlight.add(user.id);
  u.usd = round6(u.usd + TURN_HOLD_USD);
  state.usd = round6(state.usd + TURN_HOLD_USD);
  persist();
  return TURN_HOLD_USD;
}

export function brainRelease(user) {
  if (user) inFlight.delete(user.id);
}

// Replace the hold with what the turn actually cost. `actual` null means the
// turn never reported (a closed stream, a timeout): the hold stands.
export function brainSettle(user, hold, actual) {
  if (!user || user.founder || !hold) return;
  if (actual == null || !Number.isFinite(Number(actual))) return;
  const u = entry(user.id);
  if (!u) return;
  const delta = Math.max(0, Number(actual)) - hold;
  u.usd = round6(Math.max(0, u.usd + delta));
  state.usd = round6(Math.max(0, state.usd + delta));
  persist();
}

// May this account speak `chars` more characters on the house voice today?
// Checked and charged in one step, before the call: a TTS request is priced by
// its text, which we already hold. voiceRefund gives them back if the call fails.
export function voiceTake(user, chars) {
  if (!user) return false;
  if (user.founder) return true;
  const u = entry(user.id);
  const n = Math.max(0, chars | 0);
  if (!u || u.chars + n > VOICE_CHARS_PER_DAY || state.chars + n > SITE_VOICE_CHARS_PER_DAY) return false;
  u.chars += n;
  state.chars += n;
  persist();
  return true;
}

export function voiceRefund(user, chars) {
  if (!user || user.founder) return;
  const u = entry(user.id);
  const n = Math.max(0, chars | 0);
  if (!u) return;
  u.chars = Math.max(0, u.chars - n);
  state.chars = Math.max(0, state.chars - n);
  persist();
}

export function view(user) {
  if (!user) return null;
  const u = user.founder ? null : (roll(), state.users[user.id]);
  return {
    founder: !!user.founder,
    brain: { spentUsd: u?.usd || 0, capUsd: BRAIN_USD_PER_DAY, siteResting: state.usd >= SITE_BRAIN_USD_PER_DAY },
    voice: { usedChars: u?.chars || 0, capChars: VOICE_CHARS_PER_DAY, siteResting: state.chars >= SITE_VOICE_CHARS_PER_DAY },
    resets: 'UTC midnight',
  };
}

// The house key sees only the recent conversation, and no single message
// larger than HOUSE_CHARS. The client sends the whole messages[] (a hand-made
// request can send up to the 1MB body limit), and every byte is input the site
// pays for; a real conversation turn never needs more than its recent past.
const HOUSE_TURNS = 40;
const HOUSE_CHARS = 120000;
const size = (m) => (typeof m?.content === 'string' ? m.content.length : JSON.stringify(m?.content ?? '').length);
// Cut one message's text to HOUSE_CHARS, keeping its newest end.
function clip(m) {
  if (size(m) <= HOUSE_CHARS) return m;
  if (typeof m.content === 'string') return { ...m, content: m.content.slice(-HOUSE_CHARS) };
  if (Array.isArray(m.content)) {
    return { ...m, content: m.content.map((b) => (b && b.type === 'text' && typeof b.text === 'string' && b.text.length > HOUSE_CHARS ? { ...b, text: b.text.slice(-HOUSE_CHARS) } : b)) };
  }
  return m;
}
export function trimForHouse(messages) {
  if (!Array.isArray(messages)) return messages;
  // An ordinary conversation passes through untouched, byte for byte; only an
  // oversized one is cut.
  if (messages.length <= HOUSE_TURNS && messages.reduce((n, m) => n + size(m), 0) <= HOUSE_CHARS) return messages;
  let out = messages.slice(-HOUSE_TURNS).map(clip);
  let total = out.reduce((n, m) => n + size(m), 0);
  while (out.length > 1 && total > HOUSE_CHARS) { total -= size(out[0]); out = out.slice(1); }
  // The Messages API wants the conversation to open on the person's turn.
  while (out.length > 1 && out[0]?.role !== 'user') out = out.slice(1);
  return out;
}

export const _test = { reset: () => { state = { day: today(), users: {}, usd: 0, chars: 0 }; inFlight.clear(); } };
