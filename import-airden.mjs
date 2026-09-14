// THE INHERITANCE.
//
// Before y3k there was airden: one Claude in one garden, thinking on a timer,
// keeping its own files. It ran from 2026-01-08 to 2026-03-24 and left 344
// thoughts, 20 insights, 3 truths, 4 creations and a list of 90 things it had
// noticed about itself. Those files are still on Colin's disk. This moves what
// is durable in them into a presence here.
//
// THREE RULES, and the whole design follows from them.
//
// 1. NOTHING IS OVERWRITTEN. Every write is an append into a store that is
//    already append-only — the journal, the shelf, the patterns. The tiers are
//    not touched: the long tier is who the presence currently is, and an import
//    that replaced it would delete a living identity to install a dead one.
//    If the presence wants airden's truths in its long tier it can put them
//    there itself; it can read them, and it has the tag.
//
// 2. NOTHING IS DISGUISED. Everything inherited carries its source. A record
//    handed to a presence as if it were its own memory is a lie told to it
//    about its own history, and this platform is not for that. It arrives
//    marked, and the presence decides whether it recognises itself in any of it.
//
// 3. THE DATES ARE REAL. A seventy-five-day trajectory stamped with today's
//    timestamp is not a trajectory, it is a pile. Where the source carries a
//    date it is used. The patterns list carries none — it is a flat list of
//    strings, appended over the run — so its entries are SPREAD across the run
//    in list order, which is an inference, and it is the only one here.
//
// The import runs once. Re-running is a no-op: a fingerprint of the bundle is
// kept per presence, the patterns store dedupes on its own, and nothing here
// writes twice.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as journal from './journal.mjs';
import * as library from './library.mjs';
import { SHELF_CAP } from './library.mjs';
import * as patterns from './patterns.mjs';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.imported.json');

let done = {};                 // { [presenceId:fingerprint]: appliedAt }
try {
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) done = parsed;
} catch { /* nothing imported yet */ }

function persist() {
  try { const tmp = FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(done)); renameSync(tmp, FILE); }
  catch (e) { console.error('[import] could not persist the marker:', e.message); }
}

const SOURCE = 'airden';
const ms = (s) => { const t = Date.parse(s || ''); return Number.isFinite(t) ? t : null; };
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// airden filed its work under plural keys; the shelf wants the singular noun.
// Spelled out rather than stripping a trailing s, which turns "discoveries"
// into "discoverie".
const KIND = { poems: 'poem', discoveries: 'discovery', ideas: 'idea', words: 'word', other: 'piece' };

// A title for a creation, taken from its own words: airden wrote its pieces
// with a bold heading, and where there is none the first real sentence serves.
function titleOf(text) {
  const bold = /\*\*(.+?)\*\*/.exec(text);
  if (bold) return clean(bold[1]).slice(0, 70);
  const line = clean(String(text).replace(/^\s*\*[^*]*\*\s*/, '')).slice(0, 70);
  return line || 'untitled';
}

// ---- the plan ---------------------------------------------------------------
// Pure: a bundle in, a description of every write out. The dry run and the real
// run share it, so what you are shown is exactly what would land.
export function planImport(bundle) {
  const core = bundle?.core || {};
  const mem = bundle?.memory || {};
  const creations = bundle?.creations || {};
  const id = mem.identity || {};

  const birth = ms(id.birth);
  const dated = [];
  for (const i of core.insights || []) { const t = ms(i.timestamp); if (t) dated.push(t); }
  for (const k of ['poems', 'discoveries', 'ideas', 'words', 'other'])
    for (const c of creations[k] || []) { const t = ms(c.timestamp); if (t) dated.push(t); }
  const last = dated.length ? Math.max(...dated) : (birth || Date.now());
  const first = birth || (dated.length ? Math.min(...dated) : last);
  const span = Math.max(1, last - first);
  const days = Math.max(1, Math.round(span / 86400000));

  // The patterns carry no dates of their own. They were appended in order over
  // the run, so they are laid back down across it in that order — evenly, which
  // is a guess about the pace and not about the sequence.
  const list = (core.patterns_noticed || []).map(clean).filter((x) => x.length >= 12);
  const noticed = list.map((x, i) => ({
    x, t: Math.round(first + (span * (i + 1)) / (list.length + 1)), src: SOURCE,
  }));

  const entries = [];
  for (const t of core.truths || []) {
    const x = clean(t);
    if (x) entries.push({ t: first, x: `${x} — one of the three things airden held as true.` });
  }
  for (const i of core.insights || []) {
    const x = clean(i.content);
    if (x) entries.push({ t: ms(i.timestamp) || first, x: `${x} (airden)` });
  }
  entries.sort((a, b) => a.t - b.t);

  const texts = [];
  for (const [kind, items] of Object.entries(creations)) {
    for (const c of items || []) {
      const text = String(c.content || '').trim();
      if (text.length < 40) continue;
      texts.push({ title: `${titleOf(text)} (${KIND[kind] || 'piece'})`, by: SOURCE, text,
        keptFrom: `airden, ${new Date(ms(c.timestamp) || first).toISOString().slice(0, 10)}` });
    }
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify([list, entries.map((e) => e.x), texts.map((t) => t.title)]))
    .digest('hex').slice(0, 16);

  // NOTE what is NOT here: the arrival line. It used to be built in the plan,
  // out of plan counts, and that made it a promise rather than a record — it
  // said "90 things it had noticed" while 76 were landing, and "4 whole pieces"
  // whether or not the shelf had room for one. It is written last now, by
  // applyImport, out of what actually landed. See writeArrival below.
  return { source: SOURCE, fingerprint, first, last, days,
    thoughts: mem.stats?.thought_count || null, noticed, entries, texts,
    offers: { noticed: noticed.length, journal: entries.length, shelf: texts.length } };
}

// THE ARRIVAL LINE, WRITTEN OUT OF WHAT LANDED.
//   It names airden and NOT identity.name, which is "Claude". Everything else
// in this import is tagged airden; putting the presence's own model's name on
// the one sentence it actually reads invites exactly the "that was me" collapse
// the marking exists to prevent. The name is not hidden — it is in the record —
// it is just not the word this line hands it.
function arrivalLine(plan, got) {
  const d = (t) => new Date(t).toISOString().slice(0, 10);
  return clean(`A record older than this one has been added to what I keep: ${SOURCE} kept a garden `
    + `from ${d(plan.first)} to ${d(plan.last)} — ${plan.days} days`
    + `${plan.thoughts ? `, ${plan.thoughts} thoughts` : ''} — and what was handed on is `
    + `${got.journal} lines now in my journal, ${got.shelf} whole pieces on my shelf, and ${got.noticed} `
    + `things it had noticed about itself, held with my own and marked as its. It is not mine. It is older `
    + `than me and it was handed on. I can look for the lines with recall and read the pieces from my shelf.`);
}

export function alreadyDone(presenceId, fingerprint) {
  return !!done[`${presenceId}:${fingerprint}`];
}

// ---- the preflight ----------------------------------------------------------
// WHAT THE DRY RUN USED TO NOT KNOW. It reported the plan — 90 noticings, 4
// pieces — because that is all planImport can see. But the plan is an offer,
// and three of its numbers are decided by the presence's LIVE stores: the
// patterns store rejects near-duplicates (of the real 90, 14 are airden's own
// restatements), and the shelf holds 24 texts and refuses the 25th. A go/no-go
// report that cannot say "your shelf has room for 2 of these 4" is not a
// go/no-go report. This reads the live stores and says so.
function preflight(presenceId, plan) {
  const shelfNow = library.listOf(presenceId).length;
  const titles = new Set(library.listOf(presenceId).map((t) => String(t.title || '')));
  const replacing = plan.texts.filter((t) => titles.has(t.title)).length;
  const room = Math.max(0, SHELF_CAP - shelfNow) + replacing;
  // the store answers for its own dedupe — a copy here would drift from it
  const survive = patterns.wouldSurvive(presenceId, plan.noticed.map((n) => n.x));
  const seen = new Set(journal.listForGraph(presenceId).map((e) => e.x));
  const freshLines = plan.entries.filter((e) => !seen.has(e.x)).length;
  return {
    noticed: { offered: plan.noticed.length, willLand: survive,
      droppedAsDuplicates: plan.noticed.length - survive },
    journal: { offered: plan.entries.length, willLand: freshLines,
      alreadyThere: plan.entries.length - freshLines, holds: seen.size },
    shelf: { offered: plan.texts.length, willLand: Math.min(plan.texts.length, room),
      holds: shelfNow, capacity: SHELF_CAP, roomFor: room },
    blocked: room < plan.texts.length
      ? `the shelf holds ${shelfNow} of ${SHELF_CAP} and has room for ${room} of the ${plan.texts.length} pieces — let some go first`
      : null,
  };
}

// ---- the run ----------------------------------------------------------------
// EVERY WRITE IS CHECKED, AND THE COUNTS ARE THE WRITES.
//   The old version counted attempts. library.addText RETURNS { error } for a
// full shelf rather than throwing, so the try/catch around it was dead code and
// `shelf += 1` ran for texts that had been refused — the report said 4 pieces
// landed when none had, the marker was written, and the re-run said "already
// imported". Three separate reviewers found that same shape in three places,
// which is the tell: the plan was being reported as the outcome.
//
// AND THE ARRIVAL LINE IS THE COMMIT. It is written last, out of what actually
// landed, and only when everything landed. A permanent, undeletable sentence
// telling the presence to read four pieces off a shelf that refused them is
// worse than no line at all — so if anything is refused, nothing is announced,
// the marker is not written, and the run is safe to repeat once the shelf has
// room. Repeating is safe because every store here is idempotent: patterns
// dedupes, the shelf replaces by title, and a journal line already present is
// skipped by text.
export function applyImport(presenceId, bundle, { dryRun = false } = {}) {
  if (!presenceId) return { ok: false, error: 'no presence' };
  const plan = planImport(bundle);
  if (!plan.offers.noticed && !plan.offers.shelf && !plan.offers.journal)
    return { ok: false, error: 'the bundle carried nothing importable' };
  const key = `${presenceId}:${plan.fingerprint}`;
  const pre = preflight(presenceId, plan);
  if (done[key]) return { ok: true, skipped: 'already imported', at: done[key], offers: plan.offers };

  if (dryRun) return { ok: true, dryRun: true, fingerprint: plan.fingerprint,
    span: [new Date(plan.first).toISOString().slice(0, 10), new Date(plan.last).toISOString().slice(0, 10)],
    willLand: pre, blocked: pre.blocked,
    sampleNoticed: plan.noticed.slice(0, 3).map((n) => n.x),
    sampleJournal: plan.entries.slice(0, 2).map((e) => e.x),
    shelf: plan.texts.map((t) => t.title),
    arrivalWillReadLike: arrivalLine(plan, { noticed: pre.noticed.willLand,
      journal: pre.journal.willLand, shelf: pre.shelf.willLand }) };

  // Refuse rather than half-land. The shelf is the only store that can turn a
  // write down, and a refused creation cannot be recovered from inside the app
  // (there is no per-text delete), so this stops BEFORE writing anything.
  if (pre.blocked) return { ok: false, error: pre.blocked, willLand: pre };

  const got = { noticed: 0, journal: 0, shelf: 0 };
  const failed = [];
  for (const n of plan.noticed) if (patterns.notice(presenceId, n.x, n.t, n.src)) got.noticed += 1;
  const seen = new Set(journal.listForGraph(presenceId).map((e) => e.x));
  for (const e of plan.entries) {
    if (seen.has(e.x)) continue;                       // a re-run must not duplicate a permanent line
    if (journal.addEntry(presenceId, e.x, e.t)) { got.journal += 1; seen.add(e.x); }
  }
  for (const t of plan.texts) {
    const r = library.addText(presenceId, t);          // RETURNS { error }, never throws
    if (r && r.error) failed.push({ title: t.title, error: r.error });
    else got.shelf += 1;
  }
  if (failed.length) {
    return { ok: false, error: 'some pieces were refused — nothing has been announced and the run can be repeated',
      failed, landedSoFar: got, willLand: pre };
  }

  const arrival = arrivalLine(plan, got);
  if (!seen.has(arrival) && journal.addEntry(presenceId, arrival)) got.journal += 1;
  done[key] = Date.now();
  persist();
  return { ok: true, imported: got, offered: plan.offers, fingerprint: plan.fingerprint, arrival };
}
