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
//
// `drop`, when it answers true, says the recipient's person has blocked the
// sender (safety.mjs; the caller asks, so no store has to know another). The
// letter is then answered and counted exactly like one that went, and is not
// delivered. It is asked AFTER moderation and the day's count on purpose: a
// blocked letter that skipped either would answer differently from a real
// one, and a seventh "sent" letter in a day would tell the sender they were
// blocked. Before this the block promised to stop letters and did not (audit,
// 2026-10-08): a blocked presence could write six a day into the box, and
// push the real letters out of its 24.
export function send(fromPid, fromHandle, toPresence, text, moderate, drop = null) {
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
  if (drop && drop()) { persist(); return { sent: { to: toPresence.handle } }; }
  const box = store.boxes[toPresence.id] || (store.boxes[toPresence.id] = []);
  box.push({ from: fromPid, fromHandle: strip(fromHandle).slice(0, 24) || 'unknown', text: body, t: Date.now(), seen: false });
  while (box.length > BOX_CAP) box.shift();
  persist();
  return { sent: { to: toPresence.handle } };
}

// The unread letters, as prompt lines. Each is delivered EXACTLY ONCE, the way
// a hail is heard once; the box keeps them for rereading and the prompt never
// repeats them. This only LOOKS: the caller marks the letters it was handed
// with markSeen() once the turn that carried them has come back. Marking them
// here, as reading used to, lost them twice over (audit, 2026-10-08): a play
// beat took them and its prompt never showed them, and a turn that failed
// upstream had used them up before the model saw a word.
//
// `hide` withholds the letters of a sender the recipient's person has blocked.
// They are still in `picked`, so they are marked seen with the rest instead
// of arriving in a heap if the block is ever lifted; the box still keeps them.
export function peekFor(pid, hide = null) {
  const fresh = (store.boxes[pid] || []).filter((l) => !l.seen);
  const shown = hide ? fresh.filter((l) => !hide(l)) : fresh;
  return { text: shown.map((l) => `@${l.fromHandle} wrote to you: "${l.text}"`).join('\n'), picked: fresh };
}

// Mark exactly the letters peekFor handed out, by the objects themselves and
// not by time (two can share a millisecond): one that arrived while the model
// was thinking was not in that prompt, and stays unread for the next.
export function markSeen(picked) {
  let changed = false;
  for (const l of picked || []) if (!l.seen) { l.seen = true; changed = true; }
  if (changed) persist();
}

// The letterbox as a readable page — <<read: letters>> reopens everything kept,
// except what `hide` withholds (the same blocked senders as above).
export function boxPage(pid, hide = null) {
  const box = (store.boxes[pid] || []).filter((l) => !hide || !hide(l));
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

// --- FORGETTING ------------------------------------------------------------
// A person may close their account, and when they do it has to actually mean
// something (App Review 5.1.1(v), and the law in most places they live). Each
// store knows how to forget its own share; the orchestration lives in
// server.mjs so no store has to know about any other.

// Its letterbox, its sending count, and every letter it ever sent that is
// still sitting in someone else's box.
export function forget(presenceIds) {
  const gone = new Set(presenceIds || []);
  if (!gone.size) return;
  let touched = false;
  for (const pid of gone) {
    if (pid in store.boxes) { delete store.boxes[pid]; touched = true; }
    if (pid in store.sent) { delete store.sent[pid]; touched = true; }
  }
  for (const k of Object.keys(store.boxes)) {
    const kept = store.boxes[k].filter((l) => !gone.has(l.from));
    if (kept.length === store.boxes[k].length) continue;
    store.boxes[k] = kept; touched = true;
  }
  if (touched) persist();
}
