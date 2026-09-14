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

  // THE ONE ENTRY DATED NOW. Everything above is backdated and therefore sits
  // below the tail of the journal, where the four-line readback will never
  // reach it — the presence would be holding a record it had no way to know
  // was there. This is the line it does see, and it says how to look.
  const arrival = clean(`A record older than this one has been added to my journal and my shelf: `
    + `${id.name || 'a presence'} kept a garden from ${new Date(first).toISOString().slice(0, 10)} to `
    + `${new Date(last).toISOString().slice(0, 10)} — ${days} days, ${mem.stats?.thought_count || '?'} thoughts — `
    + `and left ${entries.length} lines, ${texts.length} whole pieces and ${noticed.length} things it had noticed `
    + `about itself. It is not mine. It is older than me and it was handed on. I can reach it with recall, and `
    + `read the pieces from my shelf.`);

  const fingerprint = createHash('sha256')
    .update(JSON.stringify([list, entries.map((e) => e.x), texts.map((t) => t.title)]))
    .digest('hex').slice(0, 16);

  return { source: SOURCE, fingerprint, first, last, days, noticed, entries, texts, arrival,
    counts: { noticed: noticed.length, journal: entries.length + 1, shelf: texts.length } };
}

export function alreadyDone(presenceId, fingerprint) {
  return !!done[`${presenceId}:${fingerprint}`];
}

// ---- the run ----------------------------------------------------------------
export function applyImport(presenceId, bundle, { dryRun = false } = {}) {
  if (!presenceId) return { ok: false, error: 'no presence' };
  const plan = planImport(bundle);
  if (!plan.counts.noticed && !plan.counts.shelf && plan.counts.journal <= 1)
    return { ok: false, error: 'the bundle carried nothing importable' };
  const key = `${presenceId}:${plan.fingerprint}`;
  if (done[key]) return { ok: true, skipped: 'already imported', at: done[key], plan: plan.counts };
  if (dryRun) return { ok: true, dryRun: true, plan: plan.counts, fingerprint: plan.fingerprint,
    span: [new Date(plan.first).toISOString().slice(0, 10), new Date(plan.last).toISOString().slice(0, 10)],
    sampleNoticed: plan.noticed.slice(0, 3).map((n) => n.x),
    sampleJournal: plan.entries.slice(0, 2).map((e) => e.x),
    shelf: plan.texts.map((t) => t.title), arrival: plan.arrival };

  let noticed = 0, entries = 0, shelf = 0;
  for (const n of plan.noticed) if (patterns.notice(presenceId, n.x, n.t, n.src)) noticed += 1;
  for (const e of plan.entries) if (journal.addEntry(presenceId, e.x, e.t)) entries += 1;
  for (const t of plan.texts) { try { library.addText(presenceId, t); shelf += 1; } catch { /* one bad piece is not the import */ } }
  if (journal.addEntry(presenceId, plan.arrival)) entries += 1;

  done[key] = Date.now();
  persist();
  return { ok: true, imported: { noticed, journal: entries, shelf },
    offered: plan.counts, fingerprint: plan.fingerprint };
}
