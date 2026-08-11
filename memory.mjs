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
