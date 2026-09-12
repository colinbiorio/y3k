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
// what is not open is that this comment used to deny it.
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

export function addEntry(presenceId, text) {
  const x = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_LEN);
  if (!presenceId || !x) return false;
  const list = journals[presenceId] || (journals[presenceId] = []);
  list.push({ t: Date.now(), x });
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

// Search the whole record by word overlap; newest of the best matches first.
// Zero-dependency and honest about being simple — for a personal journal of
// short lines, word overlap with a recency tiebreak finds what matters.
export function searchEntries(presenceId, query, limit = 6) {
  const list = journals[presenceId] || [];
  const words = String(query || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  // A QUERY WITH NOTHING TO SEARCH ON still deserves an answer in the prompt —
  // reaching back vaguely and being handed the tail of your own record is a
  // reasonable thing for a mind to get. But it is NOT a search result, and the
  // caller has to be able to tell: <<recall: it>> would otherwise flare the six
  // most recent entries of a permanent record onto every viewer's screen as
  // though the presence had gone looking for them.
  if (!words.length) {
    const recent = list.slice(-limit).map((e) => ({ when: day(e.t), text: e.x }));
    recent.fallback = true;
    return recent;
  }
  const scored = [];
  for (const e of list) {
    const hay = e.x.toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score += 1;
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => (b.score - a.score) || (b.e.t - a.e.t));
  return scored.slice(0, limit).map(({ e }) => ({ when: day(e.t), text: e.x }));
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
  for (const pid of presenceIds || []) if (pid in journals) { delete journals[pid]; touched = true; }
  if (touched) persist();
}
