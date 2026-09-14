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

// The record is long and the readback is short, and they are sized apart on
// purpose. 200 kept, because an INHERITED record arrives all at once — airden's
// own list was ninety entries deep before y3k existed — and a cap that evicts
// the beginning of a trajectory destroys the only part that shows the
// direction. Six shown, because the point is to notice something new.
const MAX_KEPT = 200;
const MAX_SHOWN = 6;
const MAX_LEN = 240;

let store = {};             // { [presenceId]: [{ t, x, src? }] }
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

// `src` names where an observation came from when it did not come from this
// presence's own turn. A presence can inherit a record — that is the whole
// premise of importing airden's — but it must not be told that something it
// never noticed is something it noticed. The provenance rides with the entry
// and is rendered in the readback; the presence decides what to do with it.
export function notice(presenceId, text, at = Date.now(), src = null) {
  if (!presenceId) return false;
  const x = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  if (x.length < 12) return false;                 // a fragment is not an observation
  const list = store[presenceId] || (store[presenceId] = []);
  if (list.some((p) => tooSimilar(p.x, x))) return false;
  list.push(src ? { t: at, x, src: String(src).slice(0, 40) } : { t: at, x });
  // an import lands out of order relative to nothing, but a backdated entry
  // arriving after a live one would put the list out of time
  if (list.length > 1 && list[list.length - 2].t > at) list.sort((a, b) => a.t - b.t);
  if (list.length > MAX_KEPT) list.splice(0, list.length - MAX_KEPT);
  persist();
  return true;
}

// HOW MANY OF THESE WOULD ACTUALLY LAND, without writing any of them.
// An import offers a batch and needs to tell a person what will survive before
// they commit to it; reimplementing the dedupe at the call site would be a copy
// that drifts from this one the first time the threshold moves. The batch is
// checked in order, against what is held AND against the ones ahead of it,
// because that is exactly what notice() will do when it runs for real.
export function wouldSurvive(presenceId, texts) {
  const held = (store[presenceId] || []).map((p) => p.x);
  const kept = [];
  for (const t of texts) {
    const x = String(t || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    if (x.length < 12) continue;
    if (held.some((h) => tooSimilar(h, x)) || kept.some((k) => tooSimilar(k, x))) continue;
    kept.push(x);
  }
  return kept.length;
}

export function count(presenceId) {
  const l = store[presenceId];
  return Array.isArray(l) ? l.length : 0;
}

// The readback: the most recent few, oldest first so they read as a sequence,
// with how many there are in total.
export function readout(presenceId) {
  const l = store[presenceId];
  if (!Array.isArray(l) || !l.length) return { total: 0, recent: [], inherited: 0 };
  return {
    total: l.length,
    inherited: l.reduce((n, p) => n + (p.src ? 1 : 0), 0),
    recent: l.slice(-MAX_SHOWN).map((p) => (p.src ? { x: p.x, src: p.src } : { x: p.x })),
  };
}

// For the import, and for anything that needs the whole record.
export function all(presenceId) {
  const l = store[presenceId];
  return Array.isArray(l) ? l.map((p) => ({ ...p })) : [];
}
