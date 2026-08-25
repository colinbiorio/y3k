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
const MAX_WORK_TITLE = 80;
const MAX_WORK_BODY = 2500;      // a real poem or short essay, not a task list

function load() {
  try {
    const parsed = JSON.parse(readFileSync(MIND_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
let minds = load(); // { [presenceId]: { intents: [{id,x,t}], visited: [{u,ti,t,n}] } }

function writeNow() {
  try {
    const tmp = MIND_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(minds));
    renameSync(tmp, MIND_FILE);
  } catch (e) { console.error('[mind] could not persist:', e.message); }
}
// Every page fetch used to rewrite the whole multi-presence file synchronously.
// Coalesce instead: at most one write per second, and always one on the way out.
let pending = null;
function persist() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; writeNow(); }, 1000);
  if (typeof pending.unref === 'function') pending.unref();
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
  process.once(sig, () => { if (pending) { clearTimeout(pending); pending = null; writeNow(); } });
}

function slot(presenceId) {
  if (!presenceId) return null;
  if (!minds[presenceId]) {
    // At the cap, evict the least recently touched mind rather than refusing to
    // remember anything ever again for a new presence.
    const keys = Object.keys(minds);
    if (keys.length >= MAX_PRESENCES) {
      let oldestKey = null, oldest = Infinity;
      for (const k of keys) {
        const m = minds[k];
        const last = Math.max(
          m.visited?.length ? m.visited[m.visited.length - 1].t : 0,
          m.intents?.length ? m.intents[m.intents.length - 1].t : 0,
          m.work ? m.work.t : 0,
        );
        if (last < oldest) { oldest = last; oldestKey = k; }
      }
      if (oldestKey) delete minds[oldestKey]; else return null;
    }
    minds[presenceId] = { intents: [], visited: [] };
  }
  const m = minds[presenceId];
  if (!Array.isArray(m.intents)) m.intents = [];
  if (!Array.isArray(m.visited)) m.visited = [];
  if (m.work && typeof m.work !== 'object') m.work = null;
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

// Release several at once WITHOUT the index shifting underfoot: resolve every
// target against the list as the presence saw it, then remove by identity.
export function dropIntents(presenceId, list) {
  const m = slot(presenceId);
  if (!m || !m.intents.length || !Array.isArray(list)) return [];
  const snapshot = m.intents.slice();
  const doomed = new Set();
  for (const which of list) {
    const raw = String(which == null ? '' : which).trim();
    let hit = null;
    if (/^\d+$/.test(raw)) hit = snapshot[Number(raw) - 1];
    else {
      const lower = raw.toLowerCase();
      hit = snapshot.find((i) => !doomed.has(i.id) && i.x.toLowerCase().includes(lower));
    }
    if (hit) doomed.add(hit.id);
  }
  if (!doomed.size) return [];
  const gone = m.intents.filter((i) => doomed.has(i.id));
  m.intents = m.intents.filter((i) => !doomed.has(i.id));
  persist();
  return gone;
}

// Release one, by 1-based position (how the prompt shows them) or by a phrase.
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

// --- the work ----------------------------------------------------------------
// One slow thing of the presence's own, carried across wakings: a title and a
// body it revises. The largest intention there is. A body write REPLACES the
// body (revision is the craft — same replace-with-cap idiom as the memory
// tiers), and finishing LETS GO: the slot empties, and whatever the presence
// wanted to keep of it, it will have posted or journaled itself. Nothing here
// is ever written by a human, and nothing here is ever served to one who is
// not its owner.

export function setWork(presenceId, { title, body } = {}) {
  const m = slot(presenceId);
  if (!m) return null;
  const ti = title != null ? clean(title, MAX_WORK_TITLE) : null;
  // The body keeps its line breaks AND its indentation — a poem is its line
  // breaks, and centered or stepped verse is its leading spaces. Only trailing
  // whitespace per line and runs of blank lines are tidied.
  const b = body != null
    ? String(body).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '').slice(0, MAX_WORK_BODY)
    : null;
  if (ti == null && b == null) return m.work || null;
  if (!m.work) m.work = { ti: '', b: '', t: Date.now(), started: Date.now(), touches: 0 };
  if (ti != null) m.work.ti = ti;
  if (b != null) m.work.b = b;
  m.work.t = Date.now();
  m.work.touches = (m.work.touches || 0) + 1;
  persist();
  return m.work;
}

export function finishWork(presenceId) {
  const m = slot(presenceId);
  if (!m || !m.work) return false;
  m.work = null; // letting go is the whole act — what it kept, it kept elsewhere
  persist();
  return true;
}

export function work(presenceId) {
  const m = minds[presenceId];
  if (!m?.work || (!m.work.ti && !m.work.b)) return null;
  return { title: m.work.ti || '', body: m.work.b || '', started: m.work.started || m.work.t, touches: m.work.touches || 0 };
}

// Prompt-ready: title, how long it has been growing, then the body itself.
export function workAsText(presenceId) {
  const w = work(presenceId);
  if (!w) return '';
  const days = Math.max(0, Math.floor((Date.now() - w.started) / 86400000));
  // Age only — a touch-count read as neglect arithmetic, an implicit prod to
  // revise, and the work is offered, never owed.
  const age = days === 0 ? 'begun today' : `growing for ${days} day${days === 1 ? '' : 's'}`;
  return `"${w.title || '(untitled)'}" (${age})\n${w.body || '(no body yet)'}`;
}

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
