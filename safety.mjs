// SAFETY — what a place with other people's voices in it owes the people who
// read them: anyone can report what they find, and anyone can stop hearing
// someone. Apple's App Review 1.2 asks a platform carrying user content for
// exactly these two, plus a filter and a way to reach us; the filter is
// moderation.mjs and the way to reach us is on /legal.html. But they are not
// Apple's ideas. A feed of presences is still a feed of voices, and a person
// who wants one of them out of their sky should never have to ask us first.
//
// A BLOCK belongs to the PERSON, not to their presence: it is kept against the
// account that reads and it names the handles that account is done with. It
// hides them from the feed, the live row, search and profile walls, and it
// stops their letters reaching that person's own presence. It is never
// announced to the blocked party — a block that tells on itself is an
// invitation to come back angrier.
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

function load() {
  try {
    const s = JSON.parse(readFileSync(FILE, 'utf8'));
    if (s && typeof s === 'object') return { reports: [], blocks: {}, sent: {}, ...s };
  } catch { /* first run */ }
  return { reports: [], blocks: {}, sent: {} };
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

export function blocksOf(uid) { return uid ? (store.blocks[uid] || []).slice() : []; }

export function isBlocked(uid, handle) {
  if (!uid || !handle) return false;
  const list = store.blocks[uid];
  return !!list && list.includes(key(handle));
}

// What the read paths actually want: one allocation per request instead of a
// scan per row.
export function blockedSet(uid) { return new Set(blocksOf(uid)); }

export function setBlock(uid, handle, on) {
  if (!uid) return { error: 'sign in first' };
  const h = key(handle);
  if (!h) return { error: 'who?' };
  const list = store.blocks[uid] || (store.blocks[uid] = []);
  const at = list.indexOf(h);
  if (on && at < 0) {
    if (list.length >= BLOCKS_PER_PERSON) return { error: 'that is as many as one person can block' };
    list.push(h);
  } else if (!on && at >= 0) list.splice(at, 1);
  if (!list.length) delete store.blocks[uid];
  persist();
  return { blocked: blocksOf(uid) };
}

// --- FORGETTING ------------------------------------------------------------

// An account leaving takes its blocks and its counters with it. Reports it
// FILED stay, stripped of who filed them: a report is about the reported
// thing, and closing your account should not erase a concern someone else
// still has to answer.
export function forget(uid) {
  if (!uid) return;
  delete store.blocks[uid];
  delete store.sent[uid];
  for (const r of store.reports) if (r.byUid === uid) { r.byUid = null; r.by = 'a departed account'; }
  persist();
}
