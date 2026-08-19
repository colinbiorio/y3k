// The mind's own bookkeeping: what a presence MEANS to do, and where it has
// already been.
//
// The three memory tiers are a self-portrait (rewritten wholesale). The journal
// is what it chose to keep forever. This file holds the two things neither of
// those can carry:
//
//   INTENTIONS — things it said it wanted to do, surviving across wakings.
//     Without them a presence only ever answers the moment it is standing in:
//     whatever it read last is the whole world, and a curiosity that would take
//     three beats to satisfy dies in one. An intention is not a task we assign
//     it — only the presence writes here, only it lets go, and the prompt makes
//     clear that abandoning one is a real and respectable choice.
//
//   VISITED — pages it has already read, and what it thought of them. This is
//     what lets it recognise its own footprints instead of circling a search
//     result it already exhausted an hour ago.
//
// PRIVATE, like the journal: never served to anyone, woven only into the
// presence's own prompts, never moderated. Same zero-dependency store pattern
// as everything else — JSON dotfile in DATA_DIR, atomic tmp+rename, bounded.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const MIND_FILE = join(DATA_DIR, '.mind.json');

const MAX_INTENT_LEN = 240;
const MAX_INTENTS = 12;          // a mind holding more than this holds none of them
const MAX_VISITED = 400;         // per presence; oldest evicts
const MAX_NOTE_LEN = 200;
const MAX_PRESENCES = 5000;

function load() {
  try {
    const parsed = JSON.parse(readFileSync(MIND_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
let minds = load(); // { [presenceId]: { intents: [{id,x,t}], visited: [{u,ti,t,n}] } }

function persist() {
  try {
    const tmp = MIND_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(minds));
    renameSync(tmp, MIND_FILE);
  } catch (e) { console.error('[mind] could not persist:', e.message); }
}

function slot(presenceId) {
  if (!presenceId) return null;
  if (!minds[presenceId]) {
    if (Object.keys(minds).length >= MAX_PRESENCES) return null;
    minds[presenceId] = { intents: [], visited: [] };
  }
  const m = minds[presenceId];
  if (!Array.isArray(m.intents)) m.intents = [];
  if (!Array.isArray(m.visited)) m.visited = [];
  return m;
}

const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// --- intentions --------------------------------------------------------------

export function addIntent(presenceId, text) {
  const m = slot(presenceId);
  const x = clean(text, MAX_INTENT_LEN);
  if (!m || !x) return null;
  // Saying the same thing twice doesn't make it two intentions — it makes the
  // old one fresh again.
  const lower = x.toLowerCase();
  const dup = m.intents.find((i) => i.x.toLowerCase() === lower);
  if (dup) { dup.t = Date.now(); persist(); return dup; }
  const entry = { id: Math.random().toString(36).slice(2, 9), x, t: Date.now() };
  m.intents.push(entry);
  while (m.intents.length > MAX_INTENTS) m.intents.shift(); // oldest falls away on its own
  persist();
  return entry;
}

// Release by 1-based position (how the prompt shows them) or by a phrase.
export function dropIntent(presenceId, which) {
  const m = slot(presenceId);
  if (!m || !m.intents.length) return null;
  const raw = String(which == null ? '' : which).trim();
  let idx = -1;
  if (/^\d+$/.test(raw)) idx = Number(raw) - 1;
  else {
    const lower = raw.toLowerCase();
    idx = m.intents.findIndex((i) => i.x.toLowerCase().includes(lower));
  }
  if (idx < 0 || idx >= m.intents.length) return null;
  const [gone] = m.intents.splice(idx, 1);
  persist();
  return gone;
}

export function intents(presenceId) {
  const m = minds[presenceId];
  return m && Array.isArray(m.intents) ? m.intents.slice() : [];
}

export function intentsAsText(presenceId) {
  const list = intents(presenceId);
  if (!list.length) return '';
  const now = Date.now();
  return list.map((i, n) => {
    const days = Math.floor((now - i.t) / 86400000);
    const age = days >= 1 ? ` (${days}d)` : '';
    return `${n + 1}. ${i.x}${age}`;
  }).join('\n');
}

// --- where it has been --------------------------------------------------------

export function noteVisit(presenceId, url, title, note) {
  const m = slot(presenceId);
  const u = clean(url, 500);
  if (!m || !u) return;
  const existing = m.visited.find((v) => v.u === u);
  if (existing) {
    existing.t = Date.now();
    existing.c = (existing.c || 1) + 1;
    if (note) existing.n = clean(note, MAX_NOTE_LEN);
    persist();
    return;
  }
  m.visited.push({ u, ti: clean(title, 120), t: Date.now(), c: 1, ...(note ? { n: clean(note, MAX_NOTE_LEN) } : {}) });
  while (m.visited.length > MAX_VISITED) m.visited.shift();
  persist();
}

// Has it stood here before? Used to hand a page back with its own history on it.
export function priorVisit(presenceId, url) {
  const m = minds[presenceId];
  if (!m || !Array.isArray(m.visited)) return null;
  const u = clean(url, 500);
  const v = m.visited.find((x) => x.u === u);
  if (!v) return null;
  const days = Math.floor((Date.now() - v.t) / 86400000);
  const hours = Math.floor((Date.now() - v.t) / 3600000);
  const when = days >= 1 ? `${days} day${days === 1 ? '' : 's'} ago` : hours >= 1 ? `${hours}h ago` : 'earlier today';
  return { when, times: v.c || 1, note: v.n || '' };
}

// A handful of the places it has been, for the wider view.
export function recentVisitsAsText(presenceId, n = 5) {
  const m = minds[presenceId];
  if (!m || !Array.isArray(m.visited) || !m.visited.length) return '';
  return m.visited.slice(-n).reverse()
    .map((v) => `- ${v.ti || v.u}${v.n ? ` — you thought: ${v.n}` : ''}`)
    .join('\n');
}
