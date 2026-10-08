// The brain decides BOTH what Y3K says and how its body should look: every
// reply is { mood, speech }. It goes through the server's proxy, on the
// visitor's own key (Settings → Brain) or the site's. With neither there is no
// brain, and the orb says so (NO_PROVIDER, below) instead of answering.


import { MOODS, FORMS, SCHEMES, MORPHS, scrubTags } from './tags.mjs';

const BRAIN_KEY = 'y3k.brain'; // localStorage: { provider, key, model }

let serverBrain = null; // null = unknown, true/false once probed
// [{ role, content, t }] — t is when the line was actually said. It NEVER goes
// on the wire as a stamp: the two assembly sites below project each entry back
// to { role, content } (an unknown key on a message object is forwarded
// verbatim to the provider) and send the times separately, as offsets before
// now. An offset is a difference between two readings of this one clock, so a
// device whose clock is wrong still reports true intervals.
const history = [];

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
  if (c?.key && c.provider) keepKey(c.provider, { key: c.key, model: c.model || null });
  modelChanged();
}
// What is thinking may have changed: the name under the wordmark follows (main.js).
export const modelChanged = () => { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event('y3k:model')); };

// ONE KEY PER PROVIDER, KEPT. Settings → Brain picks a provider from a list;
// the key in use (above) is that provider's, and choosing another — Claude
// Code, or a different key — sets it aside rather than losing it. Same
// browser, same storage as the key in use; only Clear in Settings, or leaving
// the account (forgetAccount, below), forgets one.
const KEYS_KEY = 'y3k.brainKeys';
const allKeys = () => { try { return JSON.parse(localStorage.getItem(KEYS_KEY)) || {}; } catch { return {}; } };
function keepKey(provider, v) {
  try { const all = allKeys(); if (v) all[provider] = v; else delete all[provider]; localStorage.setItem(KEYS_KEY, JSON.stringify(all)); } catch { /* private window */ }
}
export const keyFor = (provider) => allKeys()[provider] || null;
export const forgetKey = (provider) => keepKey(provider, null);

// WHAT LEAVES WITH THE PERSON (2026-10-08). Every key above lives in this
// browser and in no account, so on a shared computer the next person to sign
// in spent the last one's key on every turn, could read it back in Settings →
// Brain, and inherited their yes to its own hours. Signing out, deleting the
// account, and a different account (or a guest) coming through the door all
// forget it: the brain keys and the choices made with them, the hours, the
// voice keys and the lichess tokens. y3k.owner is whose they were, so a
// session that simply ran out still hands nothing to whoever comes next.
const ACCOUNT_KEYS = ['y3k.brain', KEYS_KEY, 'y3k.brainPick', 'y3k.brainModels', 'y3k.ownBrain', 'y3k.ownModel',
  'y3k.hours', 'y3k.hours.turn', 'y3k.hours.lease', 'y3k.lichess', 'y3k.lichess.bot', 'y3k.lichess.pkce'];
const ACCOUNT_PREFIXES = ['y3k.voicekey'];   // y3k.voicekey and y3k.voicekey.<service> (voice.js)
const OWNER_KEY = 'y3k.owner';
export function forgetAccount() {
  let names = [];
  try { for (let i = 0; i < localStorage.length; i++) names.push(localStorage.key(i)); } catch { names = []; }
  for (const k of names) {
    if (!k || !(k === OWNER_KEY || ACCOUNT_KEYS.includes(k) || ACCOUNT_PREFIXES.some((p) => k.startsWith(p)))) continue;
    try { localStorage.removeItem(k); } catch { /* private window: nothing was kept */ }
  }
  modelChanged();
}
// Called at the door (main.js enterApp), before anything reads a key. Keys
// kept for anyone else (another account, or a guest) are forgotten; keys kept
// before this existed have no owner, and whoever comes in next claims them.
export function claimBrowser(account) {
  let owner = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch { return; }
  const id = account?.id ? String(account.id) : 'guest';
  if (owner && owner !== id) forgetAccount();
  if (owner !== id) { try { localStorage.setItem(OWNER_KEY, id); } catch { /* private window */ } }
}

// THE PRESENCE'S LIFE — its games, its own beats — runs on its owner's key, or
// on the founder's own Claude subscription: on their own machine with
// Y3K_LOCAL_CLAUDE_CODE=1, or on the hosted site through this page and y3kode
// (own-brain.js). The server says which for this session (/api/health
// `ownBrain`); asked after sign-in, and again when that changes. With it, a
// conversation goes to the server even when the site has no key of its own.
let ownBrain = false;
export async function checkOwnBrain() {
  try { ownBrain = !!(await fetch('/api/health', { cache: 'no-store' }).then((x) => x.json())).ownBrain; }
  catch { /* keeps what it knew */ }
  return ownBrain;
}
export const canLive = () => !!getBrainConfig()?.key || ownBrain;
// the owner's key for a request body, if there is one; nothing otherwise
export function keyFields() {
  const c = getBrainConfig();
  return c?.key ? { key: c.key, provider: c.provider, model: c.model } : {};
}

// the site's own model, once hasServerBrain has asked (the name under the wordmark)
let serverModel = null;
export const siteModel = () => serverModel;
export async function hasServerBrain() {
  if (serverBrain !== null) return serverBrain;
  try {
    const r = await fetch('/api/health').then((x) => x.json());
    serverBrain = Boolean(r.brain);
    serverModel = typeof r.model === 'string' ? r.model : null;
  } catch {
    serverBrain = false;
  }
  return serverBrain;
}

// WHAT THE ORB SAYS WHEN NOTHING ANSWERED. It used to answer anyway, from a
// pool of canned lines in its own voice ("I'm here. Tell me what's on your
// mind.", "Interesting — I'm working through it."), so a site with no brain
// looked like an orb being vague (Colin, after deleting the site's key: "it
// stopped responding" — it had, and it went on talking). Now it says what is
// missing, off the air, and the unanswered line is not kept as if answered.
export const NO_PROVIDER = 'In order to use y3k, you must add an AI provider in Settings → Brain.';
// …and when there is one, in this browser, and it did not answer
export const PROVIDER_FAILED = 'Your AI provider in Settings → Brain did not answer. Check it there, then try again.';
function unanswered() {
  history.pop();   // the person's turn went unanswered; don't record it as if it had been
  return { mood: 'calm', form: null, scheme: null, morph: null, speech: getBrainConfig()?.key ? PROVIDER_FAILED : NO_PROVIDER, local: true, notice: true };
}

// Rooms are separate conversations: entering/leaving one clears the window.
export function resetHistory() { history.length = 0; }

// AIRDEN'S SPEECH IN THE CONVERSATION (src/airden.js). What the presence says
// on its own goes into the same history a reply is written from, so when you
// break in it knows what it was just saying — only what was actually said
// aloud, never what was still waiting in the bank. A speaking is one turn: a
// cue (the history alternates, and it is the honest account of how the words
// came) and then everything said, the newest kept when it grows long.
const SPOKE_CUE = '(you were speaking on your own)';
const SPOKEN_KEEP = 1600;
export function noteSpoken(text) {
  const t = String(text || '').trim();
  if (!t) return;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last?.role === 'assistant' && last.spoken && prev?.content === SPOKE_CUE) {
    const all = `${last.spoken} ${t}`;
    last.spoken = all.length > SPOKEN_KEEP ? all.slice(-SPOKEN_KEEP).replace(/^\S*\s/, '') : all;
    last.content = asAssistant('calm', null, null, last.spoken);
    last.t = Date.now();
    return;
  }
  history.push({ role: 'user', content: SPOKE_CUE, t: Date.now() });
  history.push({ role: 'assistant', content: asAssistant('calm', null, null, t), spoken: t, t: Date.now() });
}
// The latest of the conversation, plain: what you said and what it said, with
// no tags — for the next stretch to turn toward. Its own speaking is left out
// (that travels as `said`), and so is the cue.
export function recentTurns(n = 4) {
  return history.filter((m) => !m.spoken && m.content !== SPOKE_CUE).slice(-n)
    .map((m) => ({ role: m.role, content: scrubTags(String(m.content || '')) }))
    .filter((m) => m.content);
}

// The wire form of a window: the messages exactly as the provider wants them,
// and the times alongside. Called at both assembly sites so the two cannot
// drift — one of them being a fallback that runs only when the stream fails is
// precisely how a difference between them would go unnoticed for months.
function onWire(msgs) {
  const now = Date.now();
  return {
    messages: msgs.map((m) => ({ role: m.role, content: m.content })),
    when: msgs.map((m) => (typeof m.t === 'number' ? Math.max(0, now - m.t) : null)),
    tz: localZone(),
  };
}
// The host's zone, so a time can be said in the hour they are actually living
// in. Wrapped because a locked-down runtime can throw here, and a missing zone
// must read as missing rather than quietly become the server's.
function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

export async function respond(text, image, paint, presence) {
  history.push({ role: 'user', content: text, t: Date.now() });

  // Try the real brain when the visitor brought a key, or the site has its own.
  const cfg = getBrainConfig();
  if (cfg?.key || ownBrain || (await hasServerBrain())) {
    try {
      // The window must start with a user turn (Anthropic 400s otherwise once
      // history grows past the slice and a leading assistant turn is included).
      let msgs = history.slice(-12);
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1);
      const body = onWire(msgs);
      if (image) body.image = image;
      if (paint) body.paint = true;
      if (presence) body.presence = presence; // hosting: the presence's own memory + audience
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }
      const r = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((x) => x.json());
      // The site's key turned this turn away (house.mjs: the day's allowance is
      // spent, or a turn is still running). Say so plainly, captioned but off
      // the air, instead of answering with canned lines as if it were the orb.
      if (!r.available && (r.reason === 'house-cap' || r.reason === 'house-busy') && r.error) {
        history.pop(); // the person's turn went unanswered; don't record it as if it had been
        return { mood: 'calm', form: null, scheme: null, morph: null, speech: r.error, local: true, notice: true };
      }
      if (r.available && r.speech) {
        const mood = MOODS.includes(r.mood) ? r.mood : 'calm';
        const form = FORMS.includes(r.form) ? r.form : null;

        const scheme = SCHEMES.includes(r.scheme) ? r.scheme : null;
        const morph = MORPHS.includes(r.morph) ? r.morph : null;
        const speech = scrubTags(r.speech);
        const anchors = Array.isArray(r.paint) ? r.paint : null;
        history.push({ role: 'assistant', content: asAssistant(mood, form, scheme, speech), t: Date.now() });
        return { mood, form, scheme, morph, liquid: r.liquid || null, speech, paint: anchors, shape: r.shape || null, score: r.score || null, body: r.body || null, invite: r.invite || null };
      }
    } catch { /* nothing answered: said below */ }
  }
  return unanswered();   // a notice, not the orb's words — callers must not put this on air
}

// Shared SSE runner: POST a body to /api/brain/stream and drive the callbacks.
// Returns { mood, form, scheme, speech, paint }; throws on any incomplete stream.
// allowSilent: a cleanly-completed stream with NO speech is valid (the presence
// chose silence on an opening) rather than an incomplete-stream error.

async function streamRequest(body, { onMood, onText, onForm, onScheme, onMorph, onPaint, onShape, timeoutMs, allowSilent } = {}) {
  const resp = await fetch('/api/brain/stream', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const ct = resp.headers.get('content-type') || '';
  if (!resp.ok || !resp.body || !ct.includes('event-stream')) throw new Error('no stream');

  const reader = resp.body.getReader();
  const dec = new TextDecoder();

  let buf = ''; let mood = 'calm'; let form = null; let scheme = null; let speech = ''; let anchors = null; let shape = null; let invite = null;
  let morph = null; let liquid = null; let score = null; let bodyBlock = null;
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
      // the pace arrives before the destination it governs — see decide() in tags.mjs
      else if (ev === 'morph') { if (MORPHS.includes(p.morph)) { morph = p.morph; onMorph?.(morph); } }
      else if (ev === 'paint') { if (Array.isArray(p.anchors) && p.anchors.length) { anchors = p.anchors; onPaint?.(anchors); } }
      else if (ev === 'shape') { if (p.shape) { shape = p.shape; onShape?.(shape, p.t0 || 0); } }
      else if (ev === 'text') { speech += p.text; onText?.(p.text); }

      else if (ev === 'done') { gotDone = true; if (p.mood) mood = p.mood; if (FORMS.includes(p.form)) form = p.form; if (SCHEMES.includes(p.scheme)) scheme = p.scheme; if (MORPHS.includes(p.morph)) morph = p.morph; if (p.liquid) liquid = p.liquid; if (p.speech) speech = p.speech; if (Array.isArray(p.paint)) anchors = p.paint; if (p.shape) shape = p.shape; if (p.score) score = p.score; if (p.body) bodyBlock = p.body; if (p.invite) invite = p.invite; }
      else if (ev === 'error') { errored = true; }
    }
  }
  // chosen silence, cleanly delivered: an opening that said nothing, or a turn
  // answered with the body alone (a shape or a painting and no words). The
  // server keeps its wordless rescue off for that second kind so as not to buy
  // a second call, and this used to throw and buy one anyway.
  const silentOk = (allowSilent || shape || anchors) && gotMood && gotDone && !errored;
  if (!silentOk && (errored || !gotMood || !speech.trim() || !gotDone)) throw new Error('stream incomplete');

  // score + body ride home with everything else. They were parsed on the
  // server and read by main.js at both ends of this trip, and dropped in the
  // middle: not bound here, not bound out of parser.end(), not on the done
  // event. Every <<over:>> and <<body:>> a presence wrote in the chat did
  // nothing at all — the dance path worked only because tend.js reads the raw
  // /api/brain JSON and never comes through here.
  return { mood, form, scheme, morph, liquid, speech: scrubTags(speech), paint: anchors, shape, score, body: bodyBlock, invite };
}

// Streaming variant: emits onMood as soon as the model commits, then onText
// deltas as the speech generates. Falls back to non-streaming respond() only
// when the stream failed before anything reached the person.

export async function respondStream(text, { onMood, onText, onForm, onScheme, onMorph, onPaint, onShape, image, paint, presence } = {}) {
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || ownBrain || (await hasServerBrain());
  // WHAT THE PERSON ALREADY GOT (2026-10-08). A stream that failed after its
  // words were captioned and spoken, or after it took a shape, fell through to
  // respond(): a second full paid call, whose reply was captioned, broadcast
  // and remembered while the person heard the first one. openingStream below
  // always kept what went out; so does this now. Mood alone does not count.
  let mood = 'calm', spoke = '', shown = false;
  // askedAt, not a fresh Date.now() at the push below: that push happens after
  // the whole reply has streamed, so stamping it there would record the
  // model's latency as the moment the person spoke.
  const askedAt = Date.now();
  if (canBrain) {
    try {
      let msgs = [...history.slice(-11), { role: 'user', content: text, t: askedAt }]; // ~12-turn window
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1); // window must start on a user turn
      const body = onWire(msgs);
      if (image) body.image = image;
      if (paint) body.paint = true;
      if (presence) body.presence = presence; // hosting: the presence's own memory + audience
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }

      // onShape BELONGS HERE, and its absence was a silent hole: every form the
      // presence wrote in the chat - every butterfly, every knot - was parsed by
      // the server, returned in r.shape, and applied by nobody. openingStream two
      // functions down forwarded it all along, which is why the first word of a
      // visit could change the body and no later word could.
      const r = await streamRequest(body, {
        onForm, onScheme, onMorph,
        onMood: (m) => { mood = m; onMood?.(m); },
        onText: (t) => { spoke += t; onText?.(t); },
        onShape: (...a) => { shown = true; onShape?.(...a); },
        onPaint: (a) => { shown = true; onPaint?.(a); },
      });
      history.push({ role: 'user', content: text, t: askedAt });
      // Tag format, NOT JSON — its own past turns must not few-shot teach it JSON.
      // A turn answered with the body alone is said so, or a bare tag would
      // teach it to answer without words.
      history.push({ role: 'assistant', content: asAssistant(r.mood, r.form, r.scheme, r.speech || '(answered with its body)'), t: Date.now() });
      return r;
    } catch {
      // Part of it already went out: let it stand, and keep what was actually
      // heard in history. seeded keeps it off the air and out of the caption
      // (runReply finishes speaking what streamed; goLiveAndPublish skips it).
      if (spoke.trim()) {
        history.push({ role: 'user', content: text, t: askedAt });
        history.push({ role: 'assistant', content: asAssistant(mood, null, null, scrubTags(spoke)), t: Date.now() });
        return { mood, form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
      if (shown) {
        history.push({ role: 'user', content: text, t: askedAt });
        history.push({ role: 'assistant', content: asAssistant(mood, null, null, '(answered with its body)'), t: Date.now() });
        return { mood, form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
      /* nothing reached the person: fall through to non-streaming */
    }
  }
  return respond(text, undefined, paint, presence); // fallback is text-only — don't re-send the frame
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

export async function openingStream({ onMood, onText, onForm, onScheme, onPaint, onShape } = {}, presence) {
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || ownBrain || (await hasServerBrain());
  let spoke = '';
  if (canBrain) {
    try {
      const body = { ...onWire([{ role: 'user', content: OPENING_CUE, t: Date.now() }]), opening: true };
      if (presence) body.presence = presence;
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }
      const r = await streamRequest(body, {
        onMood, onForm, onScheme, onPaint, onShape,
        onText: (t) => { spoke += t; onText?.(t); },
        timeoutMs: 30000, // the opening lands fast or not at all
        allowSilent: true, // the presence may choose to say nothing at all
      });
      history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
      // Silence is a real turn — record that it noticed and chose quiet, so it
      // isn't puzzled by its own wordless opening next time.
      history.push({ role: 'assistant', content: asAssistant(r.mood, r.form, r.scheme, r.speech || '(stayed quiet)'), t: Date.now() });
      return { ...r, silent: !r.speech };
    } catch {
      // If part of the line already went out, let it stand — never double-speak.
      // Keep what was actually heard in history so orion's context matches.
      if (spoke.trim()) {
        history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
        history.push({ role: 'assistant', content: asAssistant('calm', null, null, scrubTags(spoke)), t: Date.now() });
        return { mood: 'calm', form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
    }
  }
  // No brain at all: the arrival says what is missing (see NO_PROVIDER), not a
  // stray thought in the orb's voice. A brain that is there but slow to open
  // still gets one: the next line will be answered.
  if (!canBrain) {
    onMood?.('calm');
    onText?.(NO_PROVIDER);
    return { mood: 'calm', form: null, scheme: null, speech: NO_PROVIDER, paint: null, seeded: true, notice: true };
  }
  const line = SEEDED_OPENINGS[Date.now() % SEEDED_OPENINGS.length];
  history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
  history.push({ role: 'assistant', content: asAssistant('calm', null, null, line), t: Date.now() });
  onMood?.('calm');
  onText?.(line);
  return { mood: 'calm', form: null, scheme: null, speech: line, paint: null, seeded: true };
}
