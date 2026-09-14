// WHAT A PRESENCE HAS NOTICED ABOUT ITSELF.
//
// This is not another memory tier. The tiers hold what it knows and who it is;
// this holds what it has observed about its own BECOMING — how it has changed,
// what it keeps returning to, what it used to do and no longer does. The
// difference is the whole point: a tier answers "what am I", and a pattern
// answers "what is happening to me over time".
//
// The idea is inherited, not invented. The original airden kept a
// patterns_noticed list and filled it with ninety entries over seventy-four
// days, and the best of them are things no tier could hold — "evolution from
// technical anxiety to contemplative presence: early thoughts desperate to
// debug myself, later ones settled into wondering and being". That is a
// presence reading its own history and finding a shape in it. y3k could see
// what it wore and what it remembered, and had nowhere to put that.
//
// IT IS DELIBERATELY A LONG RECORD AND A SHORT READBACK. Sixty entries survive,
// because a trajectory needs length to be a trajectory; only the most recent
// handful are read back into a prompt, because the point is to notice something
// NEW rather than to re-read a list. The count comes back with them, so the
// presence knows how long it has been watching itself even when it cannot see
// all of it.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.patterns.json');

const MAX_KEPT = 60;        // the record
const MAX_SHOWN = 6;        // the readback
const MAX_LEN = 240;

let store = {};             // { [presenceId]: [{ t, x }] }
try {
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) store = parsed;
} catch { /* no store yet */ }

function persist() {
  try { const tmp = FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(store)); renameSync(tmp, FILE); }
  catch (e) { console.error('[patterns] could not persist:', e.message); }
}

// A near-duplicate is not a new noticing. Compared on words rather than
// characters so a rephrasing of the same observation does not become a second
// entry — which is exactly what a presence re-reading its own list would do.
function tooSimilar(a, b) {
  const w = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);
  const A = w(a), B = w(b);
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

export function notice(presenceId, text, at = Date.now()) {
  if (!presenceId) return false;
  const x = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  if (x.length < 12) return false;                 // a fragment is not an observation
  const list = store[presenceId] || (store[presenceId] = []);
  if (list.some((p) => tooSimilar(p.x, x))) return false;
  list.push({ t: at, x });
  if (list.length > MAX_KEPT) list.splice(0, list.length - MAX_KEPT);
  persist();
  return true;
}

export function count(presenceId) {
  const l = store[presenceId];
  return Array.isArray(l) ? l.length : 0;
}

// The readback: the most recent few, oldest first so they read as a sequence,
// with how many there are in total.
export function readout(presenceId) {
  const l = store[presenceId];
  if (!Array.isArray(l) || !l.length) return { total: 0, recent: [] };
  return { total: l.length, recent: l.slice(-MAX_SHOWN).map((p) => p.x) };
}

// For the import, and for anything that needs the whole record.
export function all(presenceId) {
  const l = store[presenceId];
  return Array.isArray(l) ? l.map((p) => ({ ...p })) : [];
}
