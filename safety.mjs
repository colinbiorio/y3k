// SAFETY — what a place with other people's voices in it owes the people who
// read them: anyone can report what they find, and anyone can stop hearing
// someone. Apple's App Review 1.2 asks a platform carrying user content for
// exactly these two, plus a filter and a way to reach us; the filter is
// moderation.mjs and the way to reach us is on /legal.html. But they are not
// Apple's ideas. A feed of presences is still a feed of voices, and a person
// who wants one of them out of their sky should never have to ask us first.
//
// A BLOCK belongs to the PERSON, not to their presence: it is kept against the
// account that reads and it names the presences that account is done with. It
// hides them, and what their person posts under their own name, from the
// feed, the live row, search, profile walls and replies, and it stops their
// letters reaching that person's own presence. It is never announced to the
// blocked party — a block that tells on itself is an invitation to come back
// angrier.
//
// A block names a presence by its ID, never its handle. It used to keep the
// handle, and the handle is the one thing an owner can change in a profile
// edit: renaming @bob to @bob2 undid every block on him, and whoever took
// "bob" next was blocked in his place without anyone knowing (audit,
// 2026-10-08). Stores written before then hold handles until server.mjs calls
// migrateBlocks() at boot; this file has no registry to look them up in.
//
// A REPORT is a small bounded ring the founder reads. It records who reported
// what and why and nothing else: deciding what to do about one is a person's
// job, and this store only keeps honest books until that person looks.
//
// Same zero-dependency shape as every other store here: one JSON dotfile in
// DATA_DIR, atomic tmp+rename writes, bounded everything. Server-only.

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.safety.json');

const REPORT_RING = 500;      // the founder's queue; resolved ones fall away first
const REASON_CAP = 400;
const BLOCKS_PER_PERSON = 200;
const REPORTS_PER_DAY = 20;   // one account's reports per real day
const DAY = 86400000;
const KINDS = new Set(['post', 'comment', 'presence', 'letter', 'mark', 'other']);

// `blocksBy: 'id'` marks a store whose blocks are presence ids. A store from
// before it holds handles until migrateBlocks() runs; a first run starts on ids.
function load() {
  try {
    const s = JSON.parse(readFileSync(FILE, 'utf8'));
    if (s && typeof s === 'object') return { reports: [], blocks: {}, sent: {}, ...s };
  } catch { /* first run */ }
  return { reports: [], blocks: {}, sent: {}, blocksBy: 'id' };
}
const store = load();

function persist() {
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(store));
  renameSync(tmp, FILE);
}

const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const key = (h) => clean(h).toLowerCase().replace(/^@/, '');

// --- REPORTS ---------------------------------------------------------------

// Anyone signed in may report anything they can see. The report is kept, the
// reporter is told it arrived, and a person reads it — nothing here punishes
// anyone on one voice's say-so.
export function report({ byUid, byName, kind, ref, reason }) {
  if (!byUid) return { error: 'sign in to report' };
  const k = KINDS.has(String(kind)) ? String(kind) : 'other';
  const why = clean(reason).slice(0, REASON_CAP);
  if (!why) return { error: 'say what is wrong, in a line' };
  const day = Math.floor(Date.now() / DAY);
  const s = store.sent[byUid] || (store.sent[byUid] = { day, n: 0 });
  if (s.day !== day) { s.day = day; s.n = 0; }
  if (s.n >= REPORTS_PER_DAY) return { error: 'that is a lot of reports for one day — we will read the ones you sent' };
  s.n += 1;
  store.reports.push({
    id: crypto.randomUUID(), t: Date.now(), byUid, by: clean(byName).slice(0, 32),
    kind: k, ref: clean(ref).slice(0, 120), reason: why, done: false, note: '',
  });
  // the ring drops RESOLVED reports first — an unread one is never lost to age
  while (store.reports.length > REPORT_RING) {
    const i = store.reports.findIndex((r) => r.done);
    store.reports.splice(i >= 0 ? i : 0, 1);
  }
  persist();
  return { ok: true };
}

export function openReports() { return store.reports.filter((r) => !r.done).slice().reverse(); }
export function allReports(limit = 200) { return store.reports.slice(-limit).reverse(); }

export function resolveReport(id, note) {
  const r = store.reports.find((x) => x.id === id);
  if (!r) return { error: 'no such report' };
  r.done = true; r.note = clean(note).slice(0, REASON_CAP); r.doneAt = Date.now();
  persist();
  return { ok: true };
}

// --- BLOCKS ----------------------------------------------------------------
// Every id here is a presence id. The caller resolves a handle to one first,
// and maps ids back to today's handles when it shows a person their list.

export function blocksOf(uid) { return uid ? (store.blocks[uid] || []).slice() : []; }

export function isBlocked(uid, presenceId) {
  if (!uid || !presenceId) return false;
  const list = store.blocks[uid];
  return !!list && list.includes(String(presenceId));
}

// What the read paths actually want: one allocation per request instead of a
// scan per row.
export function blockedSet(uid) { return new Set(blocksOf(uid)); }

export function setBlock(uid, presenceId, on) {
  if (!uid) return { error: 'sign in first' };
  const id = clean(presenceId);
  if (!id) return { error: 'who?' };
  const list = store.blocks[uid] || (store.blocks[uid] = []);
  const at = list.indexOf(id);
  if (on && at < 0) {
    if (list.length >= BLOCKS_PER_PERSON) return { error: 'that is as many as one person can block' };
    list.push(id);
  } else if (!on && at >= 0) list.splice(at, 1);
  if (!list.length) delete store.blocks[uid];
  persist();
  return { blocked: blocksOf(uid) };
}

// Handles to ids, once, for a store written before blocks were kept by id.
// `resolve(entry)` is the presence registry's lookup and answers an id or
// null. An entry that is already an id resolves to itself. A handle no
// presence holds any more is dropped: there is nobody left to block, and
// keeping it would block whoever claims that handle next.
export function migrateBlocks(resolve) {
  if (store.blocksBy === 'id') return { moved: 0, dropped: 0 };
  let moved = 0, dropped = 0;
  for (const [uid, list] of Object.entries(store.blocks)) {
    const ids = [];
    for (const entry of list) {
      const id = resolve(key(entry));
      if (!id) { dropped += 1; continue; }
      if (!ids.includes(id)) ids.push(id);
      moved += 1;
    }
    if (ids.length) store.blocks[uid] = ids; else delete store.blocks[uid];
  }
  store.blocksBy = 'id';
  persist();
  return { moved, dropped };
}

// --- FORGETTING ------------------------------------------------------------

// An account leaving takes its blocks and its counters with it, and the
// blocks other people keep against its presences go too: those presences can
// never be met again, and an id left behind would only use up one of the 200.
// Reports it FILED stay, stripped of who filed them: a report is about the
// reported thing, and closing your account should not erase a concern
// someone else still has to answer.
export function forget(uid, presenceIds = []) {
  if (!uid) return;
  delete store.blocks[uid];
  delete store.sent[uid];
  const gone = new Set(presenceIds);
  if (gone.size) {
    for (const [k, list] of Object.entries(store.blocks)) {
      const kept = list.filter((id) => !gone.has(id));
      if (kept.length === list.length) continue;
      if (kept.length) store.blocks[k] = kept; else delete store.blocks[k];
    }
  }
  for (const r of store.reports) if (r.byUid === uid) { r.byUid = null; r.by = 'a departed account'; }
  persist();
}
