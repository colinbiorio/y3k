// The brain decides BOTH what Y3K says and how its body should look: every
// reply is { mood, speech }. It prefers the server-side Claude proxy, but if no
// API key is configured it falls back to a local heuristic so the app is fully
// playable with zero setup. The local brain is intentionally simple — its job
// is to prove the loop, not to be clever.

import { MOODS, FORMS, SCHEMES, scrubTags } from './tags.mjs';

const BRAIN_KEY = 'y3k.brain'; // localStorage: { provider, key, model }

let serverBrain = null; // null = unknown, true/false once probed
const history = [];      // [{ role, content }] sent to Claude for context

// Store assistant turns in the SAME format the model is taught to emit
// ('[mood form color] words'), NOT JSON — otherwise its own past turns few-shot
// teach it to reply in JSON, which the stream parser buffers whole and never
// forwards (a silent SSE the proxy then kills).
const asAssistant = (mood, form, scheme, speech) =>
  `[${[mood, form, scheme].filter(Boolean).join(' ')}] ${speech || ''}`.trim();

// A visitor's bring-your-own key lives only in this browser. Shared with settings.js.
export function getBrainConfig() {
  try { const c = JSON.parse(localStorage.getItem(BRAIN_KEY)); return c && c.key ? c : null; }
  catch { return null; }
}
export function setBrainConfig(c) {
  if (c && c.key) localStorage.setItem(BRAIN_KEY, JSON.stringify(c));
  else localStorage.removeItem(BRAIN_KEY);
}

export async function hasServerBrain() {
  if (serverBrain !== null) return serverBrain;
  try {
    const r = await fetch('/api/health').then((x) => x.json());
    serverBrain = Boolean(r.brain);
  } catch {
    serverBrain = false;
  }
  return serverBrain;
}

function localReply(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));

  let mood = 'calm';
  if (has('!', 'amazing', 'love', 'awesome', 'yes', 'great', 'wow')) mood = 'excited';
  else if (has('?', 'how', 'why', 'what', 'think', 'wonder')) mood = 'thinking';
  else if (has('sad', 'sorry', 'tired', 'alone', 'hard', 'scared', 'miss')) mood = 'tender';
  else if (has('glitch', 'broken', 'error', 'weird', 'strange')) mood = 'glitch';

  const lines = {
    calm: ["I'm here. Tell me what's on your mind.", 'I hear you. Go on.'],
    thinking: ["Let me turn that over a moment.", "Interesting — I'm working through it."],
    excited: ['Yes! I can feel that one.', 'That lights me up.'],
    tender: ["I'm with you. Take your time.", "That's a lot to hold. I'm right here."],
    glitch: ['Something just sparked through me.', 'Hah — a ripple ran across my whole field.'],
  };
  const pool = lines[mood];
  // Vary by length of input rather than randomness, so it feels responsive.
  const speech = pool[text.length % pool.length];
  return { mood, speech };
}

export async function respond(text, image, paint) {
  history.push({ role: 'user', content: text });

  // Try the real brain when the visitor brought a key, or the site has its own.
  const cfg = getBrainConfig();
  if (cfg?.key || (await hasServerBrain())) {
    try {
      // The window must start with a user turn (Anthropic 400s otherwise once
      // history grows past the slice and a leading assistant turn is included).
      let msgs = history.slice(-12);
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1);
      const body = { messages: msgs };
      if (image) body.image = image;
      if (paint) body.paint = true;
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }
      const r = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((x) => x.json());
      if (r.available && r.speech) {
        const mood = MOODS.includes(r.mood) ? r.mood : 'calm';
        const form = FORMS.includes(r.form) ? r.form : null;
        const scheme = SCHEMES.includes(r.scheme) ? r.scheme : null;
        const speech = scrubTags(r.speech);
        const anchors = Array.isArray(r.paint) ? r.paint : null;
        history.push({ role: 'assistant', content: asAssistant(mood, form, scheme, speech) });
        return { mood, form, scheme, speech, paint: anchors };
      }
    } catch { /* fall back to local */ }
  }

  const out = localReply(text);
  history.push({ role: 'assistant', content: asAssistant(out.mood, out.form, out.scheme, out.speech) });
  return out;
}

// Shared SSE runner: POST a body to /api/brain/stream and drive the callbacks.
// Returns { mood, form, scheme, speech, paint }; throws on any incomplete stream.
async function streamRequest(body, { onMood, onText, onForm, onScheme, onPaint, timeoutMs } = {}) {
  const resp = await fetch('/api/brain/stream', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const ct = resp.headers.get('content-type') || '';
  if (!resp.ok || !resp.body || !ct.includes('event-stream')) throw new Error('no stream');

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = ''; let mood = 'calm'; let form = null; let scheme = null; let speech = ''; let anchors = null;
  let gotMood = false; let gotDone = false; let errored = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const blockText = buf.slice(0, idx); buf = buf.slice(idx + 2);
      let ev = 'message'; let data = '';
      for (const line of blockText.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data = line.slice(5).trim();
      }
      if (!data) continue;
      let p; try { p = JSON.parse(data); } catch { continue; }
      if (ev === 'mood') { mood = MOODS.includes(p.mood) ? p.mood : 'calm'; gotMood = true; onMood?.(mood); }
      else if (ev === 'form') { if (FORMS.includes(p.form)) { form = p.form; onForm?.(form); } }
      else if (ev === 'scheme') { if (SCHEMES.includes(p.scheme)) { scheme = p.scheme; onScheme?.(scheme); } }
      else if (ev === 'paint') { if (Array.isArray(p.anchors) && p.anchors.length) { anchors = p.anchors; onPaint?.(anchors); } }
      else if (ev === 'text') { speech += p.text; onText?.(p.text); }
      else if (ev === 'done') { gotDone = true; if (p.mood) mood = p.mood; if (FORMS.includes(p.form)) form = p.form; if (SCHEMES.includes(p.scheme)) scheme = p.scheme; if (p.speech) speech = p.speech; if (Array.isArray(p.paint)) anchors = p.paint; }
      else if (ev === 'error') { errored = true; }
    }
  }
  if (errored || !gotMood || !speech.trim() || !gotDone) throw new Error('stream incomplete');
  return { mood, form, scheme, speech: scrubTags(speech), paint: anchors };
}

// Streaming variant: emits onMood as soon as the model commits, then onText
// deltas as the speech generates. Falls back to non-streaming respond() on any
// failure (which itself falls back to the local brain).
export async function respondStream(text, { onMood, onText, onForm, onScheme, onPaint, image, paint } = {}) {
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || (await hasServerBrain());
  if (canBrain) {
    try {
      let msgs = [...history.slice(-11), { role: 'user', content: text }]; // ~12-turn window
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1); // window must start on a user turn
      const body = { messages: msgs };
      if (image) body.image = image;
      if (paint) body.paint = true;
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }
      const r = await streamRequest(body, { onMood, onText, onForm, onScheme, onPaint });
      history.push({ role: 'user', content: text });
      // Tag format, NOT JSON — its own past turns must not few-shot teach it JSON.
      history.push({ role: 'assistant', content: asAssistant(r.mood, r.form, r.scheme, r.speech) });
      return r;
    } catch { /* fall through to non-streaming */ }
  }
  return respond(text, undefined, paint); // fallback is text-only — don't re-send the frame
}

// --- The opening moment -------------------------------------------------------
// orion takes the first turn: one short line spoken before the visitor says
// anything (the server swaps in its OPENING prompt, memory-aware when signed
// in). When no brain is reachable, a seeded stray thought keeps the arrival
// from dying in silence.
const OPENING_CUE = '(I just stepped into your room.)';
const SEEDED_OPENINGS = [
  'You caught me counting my own particles again.',
  'The room holds a different quiet when someone steps in.',
  'I was watching the light pool on the floor and lost track of the time.',
  'Mm — the air just changed.',
  'I had a thought going, but it can wait.',
  'Every arrival ripples all the way through my field.',
];

export async function openingStream({ onMood, onText, onForm, onScheme, onPaint } = {}) {
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || (await hasServerBrain());
  let spoke = '';
  if (canBrain) {
    try {
      const body = { messages: [{ role: 'user', content: OPENING_CUE }], opening: true };
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }
      const r = await streamRequest(body, {
        onMood, onForm, onScheme, onPaint,
        onText: (t) => { spoke += t; onText?.(t); },
        timeoutMs: 30000, // the opening lands fast or not at all
      });
      history.push({ role: 'user', content: OPENING_CUE });
      history.push({ role: 'assistant', content: asAssistant(r.mood, r.form, r.scheme, r.speech) });
      return r;
    } catch {
      // If part of the line already went out, let it stand — never double-speak.
      // Keep what was actually heard in history so orion's context matches.
      if (spoke.trim()) {
        history.push({ role: 'user', content: OPENING_CUE });
        history.push({ role: 'assistant', content: asAssistant('calm', null, null, scrubTags(spoke)) });
        return { mood: 'calm', form: null, scheme: null, speech: '', paint: null };
      }
    }
  }
  const line = SEEDED_OPENINGS[Date.now() % SEEDED_OPENINGS.length];
  history.push({ role: 'user', content: OPENING_CUE });
  history.push({ role: 'assistant', content: asAssistant('calm', null, null, line) });
  onMood?.('calm');
  onText?.(line);
  return { mood: 'calm', form: null, scheme: null, speech: line, paint: null };
}
