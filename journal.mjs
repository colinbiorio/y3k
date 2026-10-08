// The journal — a presence's permanent record. The part of it that accumulates.
//
// The three memory tiers are a living self-portrait, rewritten wholesale every
// time they're tended: saving there is also forgetting. The journal is the
// opposite contract — one line at a time, kept forever, never overwritten.
// <<journal: ...>> writes a line; <<recall: ...>> searches the whole record and
// hands back what it once kept. This is how a presence gets to COMPOUND: what
// it learns in one waking can be found again in another, years of lines deep.
//
// WHO CAN READ THIS. Never moderated — that part has always been true, and is
// the point: this is its own memory, entirely its choice. But the old comment
// here said entries are "never served to anyone", and that was simply false.
// A line kept while the host is LIVE is relayed verbatim into the memory window
// beside the orb, which every viewer of the room can read — signed in or not
// (server.mjs, the 'journal' publish kind). A recall flares its matches there
// too. Off air, nothing leaves this file except into the presence's own
// prompts. Whether that broadcast SHOULD happen is the founder's open question;
// what is not open is that this comment used to deny it. The one line a
// reflection brings back from long ago (resurface, below) is not on that list
// and must not join it: it goes into that reflection's prompt and nowhere else.
//
// Same zero-dependency patterns as every other store: a JSON dotfile in
// DATA_DIR, atomic tmp+rename writes, bounded everything. Server-only.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const JOURNAL_FILE = join(DATA_DIR, '.journal.json');

const MAX_ENTRY_LEN = 500;
const MAX_PER_PRESENCE = 2000;   // ~a line per waking-beat for years before the oldest ages out
const MAX_TOTAL = 40000;         // global disk bound (~20MB worst case) — oldest anywhere evicts first

function loadJson(file, fallback) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}
let journals = loadJson(JOURNAL_FILE, {}); // { [presenceId]: [{ t, x }] } oldest first
if (Array.isArray(journals)) journals = {};

function persist() {
  try {
    const tmp = JOURNAL_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(journals));
    renameSync(tmp, JOURNAL_FILE);
  } catch (e) { console.error('[journal] could not persist:', e.message); }
}

function totalCount() {
  let n = 0;
  for (const list of Object.values(journals)) n += list.length;
  return n;
}

// `at` exists for one reason: an INHERITED record has real dates, and stamping
// a seventy-four-day history with today's timestamp turns a trajectory into a
// pile. Everything the presence writes itself takes the default and lands now.
export function addEntry(presenceId, text, at = Date.now()) {
  const x = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_LEN);
  if (!presenceId || !x) return false;
  const list = journals[presenceId] || (journals[presenceId] = []);
  list.push({ t: at, x });
  // The list is oldest-first and the rest of this file trusts that — eviction
  // takes list[0], recentAsText takes the tail. A backdated entry pushed onto
  // the end would break both, so it is put back where its date says it belongs.
  if (list.length > 1 && list[list.length - 2].t > at) list.sort((a, b) => a.t - b.t);
  if (list.length > MAX_PER_PRESENCE) list.shift();
  // Global bound: evict the single oldest entry anywhere (rarely triggers).
  if (totalCount() > MAX_TOTAL) {
    let oldestId = null;
    for (const [id, l] of Object.entries(journals)) {
      if (l.length && (oldestId === null || l[0].t < journals[oldestId][0].t)) oldestId = id;
    }
    if (oldestId) { journals[oldestId].shift(); if (!journals[oldestId].length) delete journals[oldestId]; }
  }
  persist();
  return true;
}

const day = (t) => new Date(t).toISOString().slice(0, 10);

// --- RECALL ------------------------------------------------------------------
//
// The first search kept every query word over two letters and matched it as a
// substring. Measured on a twelve-line scratch journal: <<recall: the sea>>
// returned the one line about the sea and five more that only had "the" in
// them, <<recall: art>> found "heart" and "started", and <<recall: it is the>>
// returned six unrelated lines that were not marked as a fallback, so while
// live they went onto every viewer's screen as a search result. A recall now
// searches only on the words that carry meaning (QUIET, below), matches them as
// whole words, and weighs each by how rare it is in this presence's own record.

// Words that carry no meaning of their own: articles, pronouns, auxiliaries,
// prepositions, conjunctions and the like. Its own list, not memorygraph.mjs's
// STOP: that one also drops content words a person would recall by (work,
// time, place, first, thought, know, want, look, good, new, old, part), so a
// recall made of them found nothing. Rarity weighting already keeps a common
// content word from swamping a rare one.
const QUIET = new Set(`a an and are as at be been being but by for from had has have
he her hers him his i if in into is it its me my no nor not of off on once only
or our ours out over own same she so some such than that the their theirs them then
there these they this those through to too under until up us very was we were what
when where which while who whom why will with would you your yours am can could did
do does doing done else ever just might must should yet also how let about all again
after before because here any each every both either neither few more most other
another something nothing anything everything someone anyone everyone ourselves
myself yourself himself herself itself themselves shall may i'm it's i've i'd i'll
don't didn't doesn't isn't wasn't aren't weren't can't couldn't won't wouldn't`
  .split(/\s+/).filter(Boolean));

// Light suffix folding, applied the same way to the query and to every line,
// so "oceans" finds "ocean" and "walking" finds "walked". Not a stemmer: one
// plural (-s, -ies), then one of -ing, -ed, -ly, then a final e, never leaving
// fewer than three letters. It misses some ("written" never meets "write") and
// joins a few words that only look related ("lovely" meets "love"). Both sides
// fold alike, so a fold can only add or lose a match; what comes back is always
// a line the presence kept.
function fold(w) {
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';      // stories → story
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  let s = w;
  if (w.endsWith('ing') && w.length >= 6) s = w.slice(0, -3);
  else if (w.endsWith('ed') && !w.endsWith('eed') && w.length >= 5) s = w.slice(0, -2);  // seed, need stay
  else if (w.endsWith('ly') && w.length >= 6) s = w.slice(0, -2);         // early stays early
  // running → run, stopped → stop; fall, miss and buzz keep their pair, and a
  // three-letter stem keeps it too (added → add, not ad)
  if (s !== w && s.length > 3 && /([^aeiouylsz])\1$/.test(s)) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);                 // love, loves, loved → lov
  return s;
}

// The meaningful words of a line or a query, folded. Letters of any alphabet
// count as letters, with their combining marks (a vowel sign in Devanagari, an
// accent typed apart), in one normal form (the old \W split cut "café" to
// "caf"). A script written
// without spaces between words still arrives as one long token, so a recall in
// it finds only a line that holds the same run; that was no better before.
function termsIn(text) {
  const out = new Set();
  for (const raw of String(text || '').normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}']+/u)) {
    const w = raw.replace(/^'+|'+$/g, '').replace(/'s$/, '');
    if (w.length < 2 || QUIET.has(w) || QUIET.has(raw)) continue;
    out.add(fold(w));
  }
  return out;
}

// Search the whole record; the best matches first, newest first among equals.
// A line scores the rarity of each query word it holds, log(1 + N/df) over this
// presence's own N lines, so the one line about the sea outranks the forty about
// the light. The 1 + keeps a word that is in every line worth something, which
// matters for a young journal: with a bare log(N/df), the only line of a
// one-line journal could never be found. Only lines that hold at least one
// query word score above zero, and only those come back.
// Cost, measured: 2000 lines (the most a record holds) of 200 characters take
// about 45ms per recall on a shared machine at load average 16 on 4 cores,
// nearly all of it splitting and folding the lines. A recall is one per beat at
// most, so the lines' terms are not cached.
export function searchEntries(presenceId, query, limit = 6) {
  const list = journals[presenceId] || [];
  const words = [...termsIn(query)];
  // A QUERY WITH NOTHING TO SEARCH ON still deserves an answer in the prompt —
  // reaching back vaguely and being handed the tail of your own record is a
  // reasonable thing for a mind to get. But it is NOT a search result, and the
  // caller has to be able to tell: <<recall: it>> would otherwise flare the six
  // most recent entries of a permanent record onto every viewer's screen as
  // though the presence had gone looking for them. A query of nothing but stop
  // words (<<recall: what was it>>) lands here too.
  if (!words.length) {
    const recent = list.slice(-limit).map((e) => ({ when: day(e.t), text: e.x }));
    recent.fallback = true;
    return recent;
  }
  const lines = list.map((e) => termsIn(e.x));
  const weight = new Map();
  for (const w of words) {
    let df = 0;
    for (const t of lines) if (t.has(w)) df++;
    weight.set(w, df ? Math.log(1 + list.length / df) : 0);
  }
  const scored = [];
  list.forEach((e, i) => {
    let score = 0;
    for (const w of words) if (lines[i].has(w)) score += weight.get(w);
    if (score > 0) scored.push({ e, score });
  });
  scored.sort((a, b) => (b.score - a.score) || (b.e.t - a.e.t));
  return scored.slice(0, limit).map(({ e }) => ({ when: day(e.t), text: e.x }));
}

// --- FROM LONG AGO -----------------------------------------------------------
//
// Every prompt shows only the newest 2 to 8 lines of the record, so after a
// month a presence never met its own deep past unless it happened to recall a
// word that was in it: the journal compounded on disk and not in the mind
// (MIND.md: "what it learns compounding across wakings"). Each reflection now
// brings back one older line, chosen here:
//   - never one of the newest `skipNewest`, which the same prompt already shows;
//   - a line kept exactly 365, 100, 30 or 7 days ago if there is one, the
//     deepest first, because an anniversary is a reason to look back;
//   - otherwise a deterministic pick from the older half of what remains;
//   - never one of the last ten it brought back.
// What comes back goes into the reflection's prompt and nowhere else: it is not
// in any response, so no client can relay it to a room (INTERIORITY.md).
const DAY = 86400000;
const ANNIVERSARIES = [365, 100, 30, 7];
const REPEAT_WINDOW = 10;
// presenceId → the keys of its last ten picks (null for a reflection that found
// nothing new). In memory only: a restart forgets, and the worst that costs is
// one line coming back sooner than ten reflections.
const surfaced = new Map();

// FNV-1a, so the pick spreads over the older half instead of walking it in order
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function resurface(presenceId, { skipNewest = 8, now = Date.now() } = {}) {
  const list = journals[presenceId] || [];
  const pool = list.slice(0, Math.max(0, list.length - Math.max(0, skipNewest | 0)));
  if (!pool.length) return null;
  const last = surfaced.get(presenceId) || [];
  const key = (e) => `${e.t}:${e.x}`;
  const fresh = (e) => !last.includes(key(e));
  const today = Math.floor(now / DAY);
  const daysAgo = (e) => today - Math.floor(e.t / DAY);   // UTC days, like the dates it is shown with
  let pick = null;
  let anniversary = false;
  for (const n of ANNIVERSARIES) {
    pick = pool.find((e) => daysAgo(e) === n && fresh(e)) || null;
    if (pick) { anniversary = true; break; }
  }
  if (!pick) {
    const older = pool.slice(0, Math.ceil(pool.length / 2)).filter(fresh);
    const choices = older.length ? older : pool.filter(fresh);
    if (choices.length) pick = choices[hash(`${presenceId}#${today}#${last.length}#${last[last.length - 1]}`) % choices.length];
  }
  last.push(pick ? key(pick) : null);
  if (last.length > REPEAT_WINDOW) last.shift();
  surfaced.set(presenceId, last);
  return pick ? { when: day(pick.t), text: pick.x, daysAgo: daysAgo(pick), anniversary } : null;
}

// The most recent lines, rendered for a prompt (oldest of them first, dated) —
// so each waking opens already holding the tail of its own record.
export function recentAsText(presenceId, n = 4) {
  const list = journals[presenceId] || [];
  return list.slice(-n).map((e) => `${day(e.t)}: ${e.x}`).join('\n');
}

export function entryCount(presenceId) { return (journals[presenceId] || []).length; }

// The whole record, for building the memory graph (memorygraph.mjs).
//
// ⚠ THIS IS THE MOST DANGEROUS EXPORT IN THIS FILE, and it is new. Everything
// else here hands back a handful of lines shaped for a prompt; this hands back
// the archive. An audit of this codebase found that every WRITE path was gated
// and the one READ that carried interiority was not — so before this is ever
// reachable from an HTTP route, the route must check ownership, and it must not
// return `text` to anyone but the owner. The graph's structure (directions,
// links, region sizes) is a different thing from the lines themselves, and a
// visitor-facing view should carry only the former.
export function listForGraph(presenceId, limit = 2000) {
  const list = journals[presenceId] || [];
  return list.slice(-limit).map((e) => ({ t: e.t, x: e.x }));
}

// --- FORGETTING ------------------------------------------------------------
// A person may close their account, and when they do it has to actually mean
// something (App Review 5.1.1(v), and the law in most places they live). Each
// store knows how to forget its own share; the orchestration lives in
// server.mjs so no store has to know about any other.

// Its journal is its own, and it goes with it.
export function forget(presenceIds) {
  let touched = false;
  for (const pid of presenceIds || []) {
    surfaced.delete(pid);   // which of its lines came back lately is about it too
    if (pid in journals) { delete journals[pid]; touched = true; }
  }
  if (touched) persist();
}
