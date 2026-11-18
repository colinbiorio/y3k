// orion's memory of each visitor — zero external dependency.
//
// One JSON dotfile keyed by account id; each entry is a short list of notes
// orion chose to keep (via the silent "<<remember: ...>>" channel). Bounded on
// every axis: notes per person, characters per note. Lives in DATA_DIR next to
// .accounts.json, so on production it sits on the persistent disk and survives
// deploys. Server-only: server.mjs refuses to serve this module, and the store
// is a dotfile the static guard already blocks.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.memories.json');

const MAX_NOTES = 12;   // per person — the twelve most recent notes; older ones fade
const MAX_NOTE_LEN = 300;

let store = {}; // { [accountId]: [{ t: epochMs, x: note }] }
try {
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) store = parsed;
} catch { /* no store yet — start empty */ }

// Same crash-safe pattern as the account store: temp file + rename.
function persist() {
  try {
    const tmp = FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(store));
    renameSync(tmp, FILE);
  } catch (e) { console.error('[memory] could not persist:', e.message); }
}

// The notes for one person, rendered for a prompt: dated, oldest first, so the
// model reads them as a timeline. '' when there is nothing yet.
export function getMemory(accountId) {
  const notes = store[accountId];
  if (!Array.isArray(notes) || notes.length === 0) return '';
  return notes
    .map((n) => `- ${new Date(n.t).toISOString().slice(0, 10)}: ${n.x}`)
    .join('\n');
}

// Append one note orion chose to keep. Sanitized to a single bounded line;
// the list keeps only the MAX_NOTES most recent.
export function addMemory(accountId, note) {
  if (!accountId || typeof note !== 'string') return;
  const x = note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LEN);
  if (!x) return;
  const notes = Array.isArray(store[accountId]) ? store[accountId] : [];
  notes.push({ t: Date.now(), x });
  store[accountId] = notes.slice(-MAX_NOTES);
  persist();
}

// --- presence memory: the airden model ---------------------------------------
// A presence (a continuous AI persona, the same to every viewer) carries ONE
// memory object with three tiers — glimpse (this moment), short (these days),
// long (who I am, what matters) — and persistence is EMERGENT: the presence
// rewrites its own tiers via silent control blocks; a tier write replaces the
// tier wholesale, so tending (condensing, letting go) is the same act as
// saving. This is the recall → continue → save → tend loop from airden,
// rebuilt on this platform's zero-dependency bones.

const TIER_CAPS = { glimpse: 400, short: 1200, long: 2000 };
export const MEMORY_TIERS = Object.keys(TIER_CAPS);

const PRESENCE_FILE = join(DATA_DIR, '.presence-memory.json');
let pstore = {}; // { [presenceId]: { glimpse, short, long, updated } }
try {
  const parsed = JSON.parse(readFileSync(PRESENCE_FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) pstore = parsed;
} catch { /* no store yet */ }

function persistPresence() {
  try {
    const tmp = PRESENCE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(pstore));
    renameSync(tmp, PRESENCE_FILE);
  } catch (e) { console.error('[memory] could not persist presence memory:', e.message); }
}

export function getPresenceMemory(presenceId) {
  const m = pstore[presenceId];
  return {
    glimpse: (m && m.glimpse) || '',
    short: (m && m.short) || '',
    long: (m && m.long) || '',
  };
}

// Apply the tier writes from one turn ({ glimpse?, short?, long? }); each write
// replaces its tier (bounded). Returns true if anything changed.
// --- the clippings shelf ------------------------------------------------------
// What a presence saves while READING — quotes, facts, fragments it chose to
// keep. Bounded like everything else; the shelf is a library, the tiers are
// identity. Rendered for prompts oldest-first, like the notes.
const CLIP_FILE = join(DATA_DIR, '.clippings.json');
const MAX_CLIPS = 30;
let clips = {};
try {
  const parsed = JSON.parse(readFileSync(CLIP_FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) clips = parsed;
} catch { /* no shelf yet */ }
function persistClips() {
  try {
    const tmp = CLIP_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(clips));
    renameSync(tmp, CLIP_FILE);
  } catch (e) { console.error('[memory] could not persist clippings:', e.message); }
}
export function addClipping(presenceId, text) {
  if (!presenceId || typeof text !== 'string') return;
  const x = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!x) return;
  const list = Array.isArray(clips[presenceId]) ? clips[presenceId] : [];
  list.push({ t: Date.now(), x });
  clips[presenceId] = list.slice(-MAX_CLIPS);
  persistClips();
}
export function getClippings(presenceId) {
  const list = clips[presenceId];
  if (!Array.isArray(list) || !list.length) return '';
  return list.map((c) => `- ${new Date(c.t).toISOString().slice(0, 10)}: ${c.x}`).join('\n');
}

// --- the coding history (code-handoff.mjs checkTurn; CODE.md) ------------------
// What has been done in kode, a short entry a turn, kept with the person's
// presence once they said yes there. The presence reads it as a digest: the
// older days a line each, the newest few whole, and any older one its message
// touches. Never a transcript; the person forgets any entry from kode.
const CODE_FILE = join(DATA_DIR, '.code-history.json');
const CODE_TURNS = 80;
let code = {};
try {
  const parsed = JSON.parse(readFileSync(CODE_FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) code = parsed;
} catch { /* no history yet */ }
function persistCode() {
  try {
    const tmp = CODE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(code));
    renameSync(tmp, CODE_FILE);
  } catch (e) { console.error('[memory] could not persist the coding history:', e.message); }
}
// one checked entry; answers its time (the page's handle to forget it by)
export function addCodeTurn(presenceId, turn, now = Date.now()) {
  if (!presenceId || !turn) return 0;
  const list = Array.isArray(code[presenceId]) ? code[presenceId] : [];
  const t = Math.max(now, (list.at(-1)?.t || 0) + 1);
  list.push({ t, ...turn });
  code[presenceId] = list.slice(-CODE_TURNS);
  persistCode();
  return t;
}
export function dropCodeTurn(presenceId, t) {
  const list = code[presenceId];
  if (!Array.isArray(list)) return false;
  const left = list.filter((x) => x.t !== t);
  if (left.length === list.length) return false;
  code[presenceId] = left; persistCode();
  return true;
}
export const getCodeTurns = (presenceId) => (Array.isArray(code[presenceId]) ? code[presenceId].map((x) => ({ ...x })) : []);
const STOP = new Set('the a an and or but of to in on at for with from by is are was were be been it its this that these those i you we they he she my your our their me us them what which who how why when where can could would should will do does did done have has had not no yes so if then than there here just also into out up about as more some any all very make made add added get got let lets please now one two'.split(' '));
const sig = (s) => new Set(String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g)?.filter((w) => !STOP.has(w)) || []);
const short = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const entry = (x) => `- ${dayOf(x.t)}${x.project ? `, in ${x.project}` : ''}${x.outcome && x.outcome !== 'done' ? ` (${x.outcome})` : ''}: asked "${short(x.ask, 160)}"${x.did ? `; did: ${short(x.did, 240)}` : ''}${x.files?.length ? ` [${x.files.join(', ')}]` : ''}`;
// The digest for a prompt ('' when there is none): the older days a line each (their newest few things), the newest
// three whole, and up to two older ones sharing words with what is being said now.
export function codeHistoryFor(presenceId, message = '') {
  const turns = getCodeTurns(presenceId);
  if (!turns.length) return '';
  const newest = turns.slice(-3), older = turns.slice(0, -3), out = [];
  if (older.length) {
    const days = new Map();
    for (const x of older) { const k = `${dayOf(x.t)}${x.project ? `, ${x.project}` : ''}`; if (!days.has(k)) days.set(k, []); days.get(k).push(short(x.did || x.ask, 70)); }
    out.push('Earlier, day by day:');
    for (const [k, v] of [...days].slice(-14)) out.push(`- ${k}: ${v.slice(-4).join('; ')}${v.length > 4 ? ` (and ${v.length - 4} more)` : ''}`);
    const words = sig(message);
    const touched = words.size ? older.map((x) => [x, [...sig(`${x.ask} ${x.did} ${x.files?.join(' ')}`)].filter((w) => words.has(w)).length]).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0].t - a[0].t).slice(0, 2).map(([x]) => x) : [];
    if (touched.length) { out.push('Earlier turns that touch what is being said now:'); for (const x of touched) out.push(entry(x)); }
  }
  out.push('The newest:');
  for (const x of newest) out.push(entry(x));
  return out.join('\n');
}

export function writePresenceMemory(presenceId, writes) {
  if (!presenceId || !writes) return false;
  let changed = false;
  const m = pstore[presenceId] || {};
  for (const tier of MEMORY_TIERS) {
    if (typeof writes[tier] !== 'string') continue;
    const text = writes[tier].replace(/\s+/g, ' ').trim().slice(0, TIER_CAPS[tier]);
    m[tier] = text; // an empty write is a valid act of letting go
    changed = true;
  }
  if (changed) { m.updated = Date.now(); pstore[presenceId] = m; persistPresence(); }
  return changed;
}

// --- FORGETTING ------------------------------------------------------------
// A person may close their account, and when they do it has to actually mean
// something (App Review 5.1.1(v), and the law in most places they live). Each
// store knows how to forget its own share; the orchestration lives in
// server.mjs so no store has to know about any other.

// The person's own notes, and each presence's memory, clippings and coding history.
export function forget(uid, presenceIds) {
  if (uid) { delete store[uid]; persist(); }
  let touchedP = false, touchedC = false, touchedK = false;
  for (const pid of presenceIds || []) {
    if (pid in pstore) { delete pstore[pid]; touchedP = true; }
    if (pid in clips) { delete clips[pid]; touchedC = true; }
    if (pid in code) { delete code[pid]; touchedK = true; }
  }
  if (touchedP) persistPresence();
  if (touchedC) persistClips();
  if (touchedK) persistCode();
}
