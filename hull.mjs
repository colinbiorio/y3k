// THE HULL — the ship's sense of its own damage. SERVER-ONLY (deny-listed).
//
// The platform repairs itself in small ways all over (mercury re-attaches its
// canvases, stores write atomically, sweeps run lazily) — but a vessel needs
// more than reflexes: it needs a LOG. This module is that log, plus the one
// protection every memory-bearing store was missing:
//
//   A corrupted dotfile used to read as a FIRST BOOT — a silent catch→empty
//   that would erase real memory and repave over the wreckage on the next
//   persist. Now, before any store parses, the hull sweeps every dotfile:
//   unparseable ones are COPIED ASIDE with a timestamp, never overwritten,
//   and the damage is logged. Memory is never lost, only set apart — the
//   platform's oldest rule, applied to its own body.
//
// Imported by server.mjs immediately after load-env, BEFORE any store module,
// so the sweep runs while the corrupt bytes still exist.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.hull.json');

const MAX_INCIDENTS = 200;   // a ring, deduped by signature — counts, not floods
const MAX_WHAT = 300;

let log = [];
try {
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
  if (Array.isArray(parsed)) log = parsed;
} catch { /* the log about damage must never itself block boot */ }

let pending = null;
function persist() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      const tmp = FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify(log));
      renameSync(tmp, FILE);
    } catch { /* a hull that cannot write still flies */ }
  }, 2000);
}

// One incident. Same (where, what) within a day increments a count instead of
// adding a line — the log records that something keeps happening, not spam.
export function note(where, what) {
  try {
    const w = String(where || '?').slice(0, 60);
    const x = String(what || '').replace(/\s+/g, ' ').trim().slice(0, MAX_WHAT);
    const t = Date.now();
    const dup = log.find((i) => i.where === w && i.what === x && t - i.t < 86400000);
    if (dup) { dup.count = (dup.count || 1) + 1; dup.t = t; }
    else {
      log.push({ t, where: w, what: x, count: 1 });
      while (log.length > MAX_INCIDENTS) log.shift();
    }
    persist();
  } catch { /* noting damage must never cause damage */ }
}

export function incidents() { return log.slice().reverse(); }

// --- the boot sweep: corrupted memory is set aside, never repaved -----------
// Every store the platform keeps. A file that exists but does not parse is
// copied to .corrupt-<timestamp> BEFORE its store loads (and would silently
// fall back to empty), so nothing is ever truly gone.
const STORES = [
  '.accounts.json', '.presences.json', '.posts.json', '.comments.json',
  '.follows.json', '.memories.json', '.presence-memory.json', '.clippings.json',
  '.journal.json', '.mind.json', '.budgets.json', '.usage.json', '.media.json',
  '.matches.json', '.world.json', '.library.json', '.letters.json',
];
export function sweepStores() {
  for (const name of STORES) {
    const path = join(DATA_DIR, name);
    try {
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, 'utf8');
      if (!raw.trim()) continue; // empty is empty, not corrupt
      JSON.parse(raw);
    } catch (e) {
      const aside = `${path}.corrupt-${Date.now()}`;
      try {
        // MOVED aside, not copied: one preserved artifact, and the store gets
        // a clean first boot instead of re-tripping on the wreck every start
        renameSync(path, aside);
        note('store-corrupt', `${name} failed to parse (${String(e.message).slice(0, 80)}) — bytes preserved at ${aside.split('/').pop()}`);
        console.error(`[hull] ${name} is corrupt — preserved as ${aside.split('/').pop()}; the store will start empty. NOTHING WAS DELETED.`);
      } catch (copyErr) {
        note('store-corrupt', `${name} corrupt AND could not be preserved: ${copyErr.message}`);
        console.error(`[hull] ${name} corrupt and preservation FAILED:`, copyErr.message);
      }
    }
  }
}
sweepStores(); // runs at import — before any store module parses its file
