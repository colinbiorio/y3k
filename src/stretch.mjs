// ============================================================================
// stretch.mjs — AIRDEN'S WORDS, BETWEEN THE MODEL AND THE ROOM. Shared by the
// server (/api/speak cleans a stretch with it) and the page (src/airden.js cuts
// its word bank into sentences and plays each one's tags on the word they come
// before). Pure, so the two sides — and the tests — agree on every cut.
//
// From airden (colinbiorio/airden, mind/): one think wrote a long stretch into
// a word bank, the reader drew the bank down, and it was refilled before it ran
// dry. Its faces rode inline — "[zippy] i'm into this, [genuine] and i mean
// it" — and changed on the word they preceded. Here the same tags are the
// presence's own [mood form color], and the same ~beats~ the chat already has.
// ============================================================================

import { parseLeadTag, isControlTag, BEATS } from './tags.mjs';

export const MAX_STRETCH = 6000;     // characters of one stretch the room takes
export const MAX_SENTENCE = 420;     // a run-on is cut at a comma (or a space) past this

const ENDS = '.!?…';
const CLOSERS = '"\'”’)]';

// The model's whole reply → what may be said. The silent <<blocks>> go (the
// server has already applied the few a stretch may carry), and code fences,
// and a block the end cut off; the [tags] and ~beats~ stay, so the room can
// move on the word they were written before.
export function cleanStretch(raw) {
  let t = String(raw || '');
  t = t.replace(/```[\s\S]*?(?:```|$)/g, ' ');
  // Closed blocks are looked for only up to the last '>>'. Past it none can
  // close, and the lazy scan read to the end from every '<<' out there
  // (64,000 '<' took 1.4 s).
  const close = t.lastIndexOf('>>');
  const end = close < 0 ? 0 : close + 2;
  t = t.slice(0, end).replace(/<<[\s\S]*?>>/g, ' ') + t.slice(end);
  const open = t.indexOf('<<');
  if (open >= 0) t = t.slice(0, open);
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > MAX_STRETCH) {
    t = t.slice(0, MAX_STRETCH);
    const end = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '));
    if (end > MAX_STRETCH / 2) t = t.slice(0, end + 1);
  }
  return t;
}

// A long sentence is said in breaths: cut at the last comma, semicolon or dash
// before the limit, or at a space if it has none.
function breaths(t) {
  const out = [];
  let rest = t;
  while (rest.length > MAX_SENTENCE) {
    const head = rest.slice(0, MAX_SENTENCE);
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(' — '));
    if (cut < MAX_SENTENCE / 3) cut = head.lastIndexOf(' ');
    if (cut <= 0) cut = MAX_SENTENCE;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// One sentence → what the room plays, in order: { tag } (a change of body,
// landing on the word after it), { beat, n } (a moment in the field), { word }.
// A bracket that is honest speech — "(by the way)" — stays as words.
export function piecesOf(sentence) {
  const out = [];
  const re = /[[{(<]\s*([a-z]+(?:[\s,/|:]+[a-z]+)*)\s*[\]})>]|~\s*([a-z]+)(?:\s+(\d))?\s*~|\S+/gi;
  for (const m of String(sentence || '').matchAll(re)) {
    if (m[1] !== undefined && isControlTag(m[1])) {
      const t = parseLeadTag(`[${m[1]}]`);
      if (t) { const { len, ...tag } = t; out.push({ tag }); }
      continue;
    }
    if (m[2] !== undefined && Object.prototype.hasOwnProperty.call(BEATS, m[2].toLowerCase())) {
      out.push({ beat: m[2].toLowerCase(), n: m[3] == null ? 5 : Math.max(0, Math.min(9, +m[3])) });
      continue;
    }
    for (const w of m[0].split(/\s+/)) if (w) out.push({ word: w });
  }
  return out;
}

// What is said out loud: the words, and nothing else.
export const spokenOf = (pieces) => pieces.filter((p) => p.word).map((p) => p.word).join(' ');

// A stretch → its sentences, in order. A sentence ends at . ! ? or … (and any
// closing quote or bracket) before a space or the end, or at a line break. A
// tag written after a full stop opens the next sentence, which is where the cut
// puts it; a tag standing alone joins the sentence it comes before.
export function sentencesOf(text) {
  const s = String(text || '');
  const raw = [];
  let start = 0;
  const cut = (a, b) => { const t = s.slice(a, b).trim(); if (t) raw.push(...breaths(t)); };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\n') { cut(start, i); start = i + 1; continue; }
    if (!ENDS.includes(c)) continue;
    let j = i + 1;
    while (j < s.length && ENDS.includes(s[j])) j++;
    while (j < s.length && CLOSERS.includes(s[j])) j++;
    // "it is not the view... it is the waiting" is one sentence holding its breath
    const trailing = /…|\.\./.test(s.slice(i, j)) && /^\s+[a-z]/.test(s.slice(j, j + 3));
    if ((j >= s.length || /\s/.test(s[j])) && !trailing) { cut(start, j); start = j; }
    i = j - 1;   // the whole run of marks is one ending, cut or not
  }
  cut(start, s.length);
  const out = [];
  let carry = '';
  for (const t of raw) {
    const joined = carry ? `${carry} ${t}` : t;
    if (!spokenOf(piecesOf(joined))) { carry = joined; continue; }   // only tags or beats so far
    out.push(joined);
    carry = '';
  }
  if (carry && out.length) out[out.length - 1] += ` ${carry}`;
  return out;
}
