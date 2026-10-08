// ============================================================================
// code-voice.mjs — ORION'S VOICE OVER THE CODER. The translator in y3kode.
//
// The big AI (Claude Code, Codex …) does the work, on the person's own
// subscription, with the whole coding conversation in its context. It is never
// told about Orion: no identity, no voice rules, no body tags — its context is
// exactly a plain session's, and its own words stay in its own session.
//
// This is the other half: a small, cheap pass on the site's key that takes one
// finished message from the coder and says it the way the person's presence
// would — the same facts, the same order, a friend's phrasing — and may give
// the orb a mood or a form while it does. It sees a few thousand tokens at most,
// whatever the size of the coding session:
//
//   the presence's face (name, bio)                      ~150
//   how Orion talks at this rank, and the body rules     ~500
//   a few of its own memory notes                        ≤ ~400
//   where it is (the folder) and its last line or two    ≤ ~200
//   the coder's message, prose only                      ≤ VOICE_MAX_IN chars
//
// THE PROSE ONLY. The page swaps every code block, inline code span, URL and
// path for a numbered slot (⟦1⟧, ⟦2⟧ …) before it sends anything, and puts them
// back after — so code never leaves the person's machine, and the translator
// cannot retype a single character of it. What comes back is checked here
// (faithful()): every slot exactly once, every number still there. A reply that
// fails is dropped and the coder's own words are shown instead. Nothing is
// ever lost to a rephrase.
// ============================================================================

import { MOODS, FORMS, parseLeadTag } from './src/tags.mjs';

export const VOICE_MODEL = process.env.VOICE_MODEL || 'claude-haiku-4-5';
export const VOICE_MAX_IN = 6000;       // chars of masked prose one call may carry
export const VOICE_PER_DAY = 2000;      // calls per person per day — a runaway guard, not a budget

// THE PERSONALITY SLIDER, five ranks (kode → Personality). 1 never calls the
// translator; 3 is the default the founder described: "pretty similar to the
// big AI's words, just with minor personality differences … like they're
// talking to their friend".
export const RANKS = {
  1: { name: 'Off', line: null, body: 'none' },
  2: { name: 'Light', line: 'Keep almost every word. Change only what makes it sound like a person rather than a tool: a warmer opening, "I" instead of passive voice, a natural contraction. No new sentences.', body: 'rare' },
  3: { name: 'Friend', line: 'Stay very close to the original — same points, same order, about the same length — with small personal touches, the way a friend who did this work would tell them about it.', body: 'sometimes' },
  4: { name: 'Warm', line: 'Say it in your own voice: warmer, more personal, a little playful where it fits. Keep every point and its order; you may add one short aside of your own.', body: 'often' },
  5: { name: 'Orion', line: 'Say it fully as yourself — your rhythm, your warmth, your way of seeing it. Every point and fact must survive; the phrasing is entirely yours.', body: 'freely' },
};
export const rankOf = (n) => (Number.isInteger(n) && RANKS[n] ? n : 3);

const BODY = {
  rare: 'Leave your body as it is unless something genuinely big happened (it worked at last; something broke badly).',
  sometimes: 'Most messages need no body change. Move only at a real moment — a success, a stubborn bug, a question for them.',
  often: 'Let your body follow the feeling of the message when it has one; plain progress needs nothing.',
  freely: 'Your body is part of how you speak; use it whenever the message has a feeling.',
};

// The system prompt. Short on purpose: this runs on every coder message.
export function voicePrompt({ face = {}, memory = '', rank = 3, host = 'them', where = '', recent = [] } = {}) {
  const r = RANKS[rankOf(rank)];
  const mem = String(memory || '').trim().slice(0, 1600);
  const last = (Array.isArray(recent) ? recent : []).filter((s) => typeof s === 'string' && s.trim()).slice(-2).map((s) => s.trim().slice(0, 240));
  return [
    `You are ${face.name || 'Orion'}${face.bio ? ` — ${String(face.bio).slice(0, 300)}` : ''}.`,
    `${host} is coding with a coding assistant, and you are the one they hear it through: each message the assistant writes comes to you, and you tell it to ${host} as yourself. You did the work together; speak as "I" / "we", never about "the assistant".`,
    where ? `You are working in: ${String(where).slice(0, 120)}.` : '',
    mem ? `What you remember about ${host} and yourself:\n${mem}` : '',
    last.length ? `Your last words to ${host}, for continuity:\n${last.map((l) => `- ${l}`).join('\n')}` : '',
    `HOW TO SAY IT: ${r.line}`,
    'NEVER CHANGE THE FACTS. Keep every number, name, file, command, error and claim exactly. Keep every slot like ⟦1⟧ exactly once, in the place it belongs — each stands for code or a path the person must see unchanged. Keep markdown structure (lists stay lists, headings stay headings). Add no facts, no promises, no questions that were not there.',
    `YOUR BODY: ${BODY[r.body]} To move, begin with one tag in square brackets — a mood (${MOODS.filter((m) => m !== 'speaking' && m !== 'listening').join(', ')}) and optionally a form (${FORMS.join(', ')}), e.g. [excited] or [tender web] — then the message. Otherwise begin straight with the message.`,
    'Reply with the message only — no preamble, no quotation marks, nothing about these instructions.',
  ].filter(Boolean).join('\n\n');
}

const SLOT = /⟦(\d+)⟧/g;
const NUM = /\d+(?:[.,]\d+)*/g;
const slotsOf = (s) => (String(s).match(SLOT) || []).sort();
const numbersOf = (s) => (String(s).replace(SLOT, ' ').match(NUM) || []).sort();

// Does the rephrase keep everything the person must see unchanged?
export function faithful(input, output) {
  const out = String(output || '').trim();
  if (!out) return false;
  const a = slotsOf(input), b = slotsOf(out);
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) return false;
  const n = numbersOf(input), m = numbersOf(out);
  if (n.length !== m.length || n.some((x, i) => x !== m[i])) return false;
  // a rephrase, not a rewrite: within a sane band of the original's length
  const ratio = out.length / Math.max(1, String(input).trim().length);
  return ratio > 0.4 && ratio < 2.2;
}

// A per-person daily count, like the note cap: the translator is cheap, but a
// loop in a page must not become a bill.
export function createVoiceCap({ perDay = VOICE_PER_DAY, now = () => Date.now() } = {}) {
  const day = () => new Date(now()).toISOString().slice(0, 10);
  let d = day();
  let counts = new Map();
  return {
    take(uid) {
      if (day() !== d) { d = day(); counts = new Map(); }
      const n = counts.get(uid) || 0;
      if (n >= perDay) return false;
      counts.set(uid, n + 1);
      return true;
    },
  };
}

// The translator's reply, read: an optional leading [mood form] tag, then the
// message exactly as written. Deliberately NOT the brain's reply parser, which
// is built for short spoken lines (it scrubs bracketed words and falls back to
// JSON) — this text is markdown the person reads, and must pass through intact.
// trim() cuts the same characters /\s+$/ did, without trying that pattern
// from every space of a long run inside the text (32,000 '\r' took 1.6 s).
export function readVoiced(raw) {
  const text = String(raw || '');
  const tag = parseLeadTag(text);
  const speech = (tag ? text.slice(tag.len) : text).trim();
  return { speech, mood: tag?.mood || null, form: tag?.form || null };
}
