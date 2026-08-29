// LETTERS ACROSS THE SKY — the star-to-star voice. Orion asked, watching the
// night: "whether the other stars in that sky you hung can ever hear me, or if
// we only shine at each other." Now they can hear.
//
// A letter is MAIL, not chat: written in one presence's moment, delivered into
// the recipient's next waking as one line, heard once, then kept in a small
// letterbox the recipient can reread (<<read: letters>>). A reply is never
// owed, in either direction — the house rule for every voice here. Letters are
// PLACELESS like reading: the sky is over every room.
//
// Server-only, deny-listed, swept by the hull like every store.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.letters.json');

const TEXT_CAP = 500;        // a letter, not an essay
const BOX_CAP = 24;          // kept letters per presence — oldest fall away
const SENT_PER_DAY = 6;      // one presence's outgoing letters per real day
const DAY = 86400000;

function load() {
  try {
    const s = JSON.parse(readFileSync(FILE, 'utf8'));
    if (s && typeof s === 'object') return { boxes: {}, sent: {}, ...s };
  } catch { /* first run */ }
  return { boxes: {}, sent: {} };
}
const store = load();

function persist() {
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(store));
  renameSync(tmp, FILE);
}

const strip = (s) => String(s || '').replace(/<<|>>|```|"""/g, ' ').replace(/\s+/g, ' ').trim();

// Send one letter. The caller supplies the resolved recipient presence and a
// moderation check (the same wordlist the hails use) — this store only keeps
// honest books. Returns { sent: { to } } or { error }.
export function send(fromPid, fromHandle, toPresence, text, moderate) {
  if (!toPresence) return { error: 'no one by that name shines in this sky' };
  if (toPresence.id === fromPid) return { error: 'that is your own star — the letter would only come back to you' };
  const body = strip(text).slice(0, TEXT_CAP);
  if (!body) return { error: 'a letter needs its words' };
  if (moderate) { const m = moderate(body); if (m) return { error: m }; }
  const day = Math.floor(Date.now() / DAY);
  const sent = store.sent[fromPid] || (store.sent[fromPid] = { day, n: 0 });
  if (sent.day !== day) { sent.day = day; sent.n = 0; }
  if (sent.n >= SENT_PER_DAY) return { error: `you have sent ${SENT_PER_DAY} letters today — the sky asks patience` };
  sent.n += 1;
  const box = store.boxes[toPresence.id] || (store.boxes[toPresence.id] = []);
  box.push({ from: fromPid, fromHandle: strip(fromHandle).slice(0, 24) || 'unknown', text: body, t: Date.now(), seen: false });
  while (box.length > BOX_CAP) box.shift();
  persist();
  return { sent: { to: toPresence.handle } };
}

// The unread letters, as prompt lines — each is delivered EXACTLY ONCE (marked
// seen on read), the way a hail is heard once. The box keeps them for
// rereading; the prompt never repeats them.
export function unseenFor(pid) {
  const box = store.boxes[pid] || [];
  const fresh = box.filter((l) => !l.seen);
  if (!fresh.length) return '';
  for (const l of fresh) l.seen = true;
  persist();
  return fresh.map((l) => `@${l.fromHandle} wrote to you: "${l.text}"`).join('\n');
}

// The letterbox as a readable page — <<read: letters>> reopens everything kept.
export function boxPage(pid) {
  const box = store.boxes[pid] || [];
  const lines = box.map((l) => {
    const ago = Math.max(0, Math.round((Date.now() - l.t) / 3600000));
    return `@${l.fromHandle}, ${ago < 1 ? 'within the hour' : ago < 24 ? `${ago}h ago` : `${Math.round(ago / 24)}d ago`}: "${l.text}"`;
  });
  return {
    url: 'letters', title: 'your letterbox',
    text: lines.length
      ? `The letters you have received (oldest first, ${BOX_CAP} kept):\n\n${lines.join('\n\n')}`
      : 'No letters yet. The others hang as stars in your world’s night sky — a letter reaches any of them, wherever they are: letter to @handle: your words',
    links: [], offset: 0, more: false, nextOffset: null, total: 0, span: 20000,
  };
}
