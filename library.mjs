// THE SHELF OF WHOLE THINGS — orion asked for this by name: "a way to hold
// whole things — texts I can keep and return to." Clippings hold fragments and
// the journal holds its own lines; the shelf holds COMPLETE texts, kept by the
// presence from a page it is reading (<<keep>>) or set there by its owner as a
// gift. A shelf text is read back through the same eyes as any page: the
// /api/fetch route serves `shelf:N` with the exact window shape fetchproxy
// uses, so the reader, the gaze, and every watcher work unchanged.
//
// Server-only (deny-listed from static serving like every store).

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.library.json');

const TEXT_CAP = 250000;      // chars per text — a long paper, not a corpus
const SHELF_CAP = 24;         // texts per presence
const GLOBAL_CAP = 8_000_000; // chars across everyone — persist() writes the whole store synchronously on the request path, so this bound IS the latency ceiling
const SPAN = 20000;           // window size, matching fetchproxy's MAX_TEXT

function load() {
  try {
    const s = JSON.parse(readFileSync(FILE, 'utf8'));
    if (s && typeof s === 'object') return { shelves: {}, ...s };
  } catch { /* first run */ }
  return { shelves: {} };
}
const store = load();

function persist() {
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(store));
  renameSync(tmp, FILE);
}

function globalChars() {
  let n = 0;
  for (const list of Object.values(store.shelves)) for (const t of list) n += t.text.length;
  return n;
}

const clean = (s, cap) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, cap);

// Resolve a ref to a text: a PURE number is an id; anything else searches
// titles — so "2001: a space odyssey" finds by name instead of dying as a
// failed id-2001 lookup, while "shelf 2" still opens text 2.
function findText(list, ref) {
  const r = String(ref || '').trim();
  if (/^\d+$/.test(r)) return list.find((x) => x.id === Number(r)) || null;
  const q = r.toLowerCase();
  return list.find((x) => x.title.toLowerCase().includes(q)) || null;
}

// Put a whole text on a presence's shelf. Same title = the text is replaced
// (a new edition, not a duplicate). Returns { text } or { error }.
export function addText(pid, { title, by, text, keptFrom }) {
  if (!pid) return { error: 'no presence' };
  const t = clean(title, 120);
  if (!t) return { error: 'a text needs a title' };
  const body = String(text || '').replace(/\r/g, '').trim();
  if (!body) return { error: 'a text needs its words' };
  if (body.length > TEXT_CAP) return { error: `too long to hold whole (${body.length} chars; the shelf takes up to ${TEXT_CAP})` };
  const list = store.shelves[pid] || (store.shelves[pid] = []);
  const existing = list.findIndex((x) => x.title.toLowerCase() === t.toLowerCase());
  if (existing === -1 && list.length >= SHELF_CAP) {
    return { error: `the shelf holds ${SHELF_CAP} texts — let one go before keeping another` };
  }
  const displaced = existing === -1 ? 0 : list[existing].text.length;
  if (globalChars() - displaced + body.length > GLOBAL_CAP) {
    return { error: 'the library is full' }; // replace counts its delta — growing an old text is not free
  }
  const entry = {
    id: existing === -1 ? (list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1) : list[existing].id,
    title: t, by: clean(by, 80) || null, text: body,
    keptFrom: clean(keptFrom, 300) || null, addedAt: Date.now(),
  };
  if (existing === -1) list.push(entry); else list[existing] = entry;
  persist();
  return { text: { id: entry.id, title: entry.title, chars: body.length } };
}

export function listOf(pid) {
  return (store.shelves[pid] || []).map((t) => ({
    id: t.id, title: t.title, by: t.by, chars: t.text.length, addedAt: t.addedAt,
  }));
}

// The shelf as prompt lines — what the presence sees beside its clippings.
export function shelfAsLines(pid) {
  const list = store.shelves[pid] || [];
  if (!list.length) return '';
  return list.map((t) => `${t.id}. "${t.title}"${t.by ? ` — ${t.by}` : ''} (${Math.round(t.text.length / 1000)}k chars)`).join('\n');
}

// One window of a shelf text, in EXACTLY fetchproxy's page shape — so the
// reader and the gaze treat a kept text like any page on the open web.
export function windowOf(pid, ref, offset = 0) {
  const list = store.shelves[pid] || [];
  const t = findText(list, ref);
  if (!t) {
    return { error: list.length ? `nothing on your shelf matches "${ref}" — it holds: ${list.map((x) => `${x.id}. ${x.title}`).join('; ')}` : 'your shelf is empty — <<keep>> saves the page you are reading' };
  }
  const at = Math.max(0, Math.min(Number(offset) || 0, t.text.length));
  const text = t.text.slice(at, at + SPAN);
  const more = t.text.length > at + SPAN;
  return {
    url: `shelf:${t.id}`, title: `${t.title}${t.by ? ` — ${t.by}` : ''} (your shelf)`,
    text, links: [], offset: at, more,
    nextOffset: more ? at + text.length : null,
    total: t.text.length, span: SPAN,
  };
}

// The whole body of one text — the render route shows a kept text complete.
export function fullTextOf(pid, ref) {
  const t = findText(store.shelves[pid] || [], ref);
  return t ? `${t.title}${t.by ? `\n${t.by}` : ''}\n\n${t.text}` : null;
}

// The shelf itself, as a readable page — <<read: shelf>> opens the index.
export function indexPage(pid) {
  const lines = shelfAsLines(pid);
  return {
    url: 'shelf', title: 'your shelf of whole texts',
    text: lines
      ? `The texts you hold, whole:\n${lines}\n\nOpen one with your silent read block: read: shelf 1`
      : 'Your shelf is empty. While reading a page, <<keep>> saves it here whole — a text you can return to across wakings.',
    links: [], offset: 0, more: false, nextOffset: null, total: 0, span: SPAN,
  };
}

// Keep a WHOLE page from the open web: walk its windows through the injected
// fetcher (the SSRF-guarded fetchReadable in production) until the end or the
// cap. Returns { text } or { error }.
export async function keepFromUrl(pid, url, fetcher, titleOverride = null) {
  if (!/^https?:\/\//i.test(String(url || ''))) {
    return { error: 'only a page from the open web can be kept whole' };
  }
  let body = '', title = null, offset = 0;
  for (let hop = 0; hop < 16; hop++) {
    const page = await fetcher(url, offset);
    if (page?.error) return { error: page.error };
    if (!page?.text) break;
    if (title === null) title = page.title || url;
    body += page.text; // windows are exact continuations (nextOffset = at + text.length) — no seam
    if (!page.more || body.length >= TEXT_CAP) break;
    offset = page.nextOffset;
  }
  if (!body) return { error: 'the page gave no text to keep' };
  return addText(pid, { title: titleOverride || title, by: null, text: body.slice(0, TEXT_CAP), keptFrom: url });
}
