// The brain decides BOTH what Y3K says and how its body should look: every
// reply is { mood, speech }. It goes through the server's proxy, on the
// visitor's own key (Settings → Brain) or the site's. With neither there is no
// brain, and the orb says so (NO_PROVIDER, below) instead of answering.


import { MOODS, FORMS, SCHEMES, MORPHS, scrubTags } from './tags.mjs';
import { PROVIDER_NAMES, modelName } from './models.js';

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
// The site could not be asked at all (no answer from /api/health). That is the
// connection, not a site without a brain. It used to be remembered as "no
// brain", so a phone that lost its signal once was told to add an AI provider
// for the rest of the visit. Now it is asked again next time, and the turn
// that found it says it is the connection (respond).
let unreached = false;
export async function hasServerBrain() {
  if (serverBrain !== null) return serverBrain;
  try {
    const r = await fetch('/api/health').then((x) => x.json());
    serverBrain = Boolean(r.brain);
    serverModel = typeof r.model === 'string' ? r.model : null;
    unreached = false;
  } catch {
    unreached = true;
    return false;   // asked again next time
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

// WHY IT DID NOT ANSWER, when that is known. PROVIDER_FAILED was the only line
// for every failure, so a revoked key, an empty account, a rate limit, a model
// the key cannot use, a provider's bad hour and a phone with no signal all sent
// the person to Settings to check a key that was usually fine. The server now
// names the provider's reason in one fixed word (upstream-why.mjs, never the
// provider's own text), and two are this page's own:
//   dropped   its connection to the site went quiet (the watchdog in
//             streamRequest) or broke before the reply was finished
//   offline   it could not reach the site (a device that knows it is offline
//             sends nothing at all; one that tried and failed may have sent
//             the turn and lost the answer, so the line does not say which)
// Each has one line, naming the provider. On the site's key (no key of your
// own here) a refusal of the key is the site's to fix, and is said that way.
// An unknown reason keeps the old line.
export const WHYS = ['key', 'credit', 'rate', 'model', 'busy', 'unreachable', 'dropped', 'offline'];
export function whyLine(why, provider) {
  const cfg = getBrainConfig();
  const own = !!cfg?.key;
  const who = PROVIDER_NAMES[provider] || (own ? 'Your AI provider' : "The site's AI provider");
  const key = own ? 'this key' : "the site's key";
  if (!own && (why === 'key' || why === 'credit' || why === 'model')) {
    return "The site's key could not be used just now. Try again later, or add your own key in Settings → Brain.";
  }
  switch (why) {
    case 'key': return PROVIDER_NAMES[provider]
      ? `${who} did not accept this key. It may be mistyped or revoked. Check it in Settings → Brain.`
      : 'The key in Settings → Brain is not one the site recognizes. Check it there.';
    // also a key that spent the limit set on it (OpenRouter's key limits,
    // OpenAI's budgets), where adding credit alone would not be enough
    case 'credit': return PROVIDER_NAMES[provider]
      ? `Your ${who} account is out of credit, or this key has reached its spending limit. Add credit or raise the limit with ${who}, then try again.`
      : 'The account behind this key is out of credit, or the key has reached its spending limit. Add credit or raise the limit, then try again.';
    case 'rate': return `${who} is limiting how often ${key} can be used. Wait a little, then try again.`;
    case 'model': return cfg?.model
      ? `This key cannot use ${modelName(cfg.model)}. Choose another model in Settings → Brain.`
      : 'This key cannot use the model the site chose for it. Choose a model in Settings → Brain.';
    case 'busy': return `${who} is overloaded or having trouble on its side. Try again shortly.`;
    case 'unreachable': return `The site could not get an answer from ${who} just now. Try again in a moment.`;
    case 'dropped': return 'The connection dropped before the reply was finished. Try again.';
    case 'offline': return 'This device could not reach the site. Check the connection, then try again.';
    default: return null;
  }
}
// A device that knows it is offline sends nothing. navigator.onLine is only
// trusted when it says false: true means a network is up, not that it works.
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// The notice itself: captioned, off the air, carrying its reason (`why`) so the
// room can act on it (main.js gives the words back when nothing was sent).
function notice(why, provider) {
  const line = whyLine(why, provider) || (getBrainConfig()?.key ? PROVIDER_FAILED : NO_PROVIDER);
  return { mood: 'calm', form: null, scheme: null, morph: null, speech: line, local: true, notice: true, ...(WHYS.includes(why) ? { why } : {}) };
}
function unanswered(why, provider) {
  history.pop();   // the person's turn went unanswered; don't record it as if it had been
  return notice(why, provider);
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

// The non-streaming turn's limit. It sends nothing until it is done, so it has
// no idle watchdog to lean on (streamRequest), and it used to have no limit at
// all: a connection that went silent held the orb in thought for good. 400s is
// past the longest the server takes for one: the turn and its wordless-rescue
// retry, two calls of up to 120s each on a key, or 190s on the founder's own
// brain (own-relay.mjs).
const ASK_MS = 400000;

export async function respond(text, image, paint, presence) {
  history.push({ role: 'user', content: text, t: Date.now() });
  if (offline()) return unanswered('offline');

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
      // The limit is a timer and a controller, as in streamRequest. It was
      // AbortSignal.timeout, which Safari before 16 does not have: the call
      // threw inside this try, read as 'offline', and every turn on this route
      // failed there without being sent.
      const ac = new AbortController();
      let late = false;
      const limit = setTimeout(() => { late = true; ac.abort(); }, ASK_MS);
      let r;
      try {
        const res = await fetch('/api/brain', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        r = await res.json();
      } catch (err) {
        // No answer came back at all: it ran out of time, or the fetch could
        // not reach the site (a TypeError). Anything else (an error page that
        // is not JSON) keeps the old line.
        return unanswered(late ? 'dropped' : err?.name === 'TypeError' ? 'offline' : null);
      } finally {
        clearTimeout(limit);
      }
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
      // the provider's reason, when the server could name it (whyLine)
      if (WHYS.includes(r.why)) return unanswered(r.why, r.provider);
    } catch { /* nothing answered: said below */ }
  } else if (unreached) {
    return unanswered('offline');   // not "no brain": the site never answered the question
  }
  return unanswered();   // a notice, not the orb's words — callers must not put this on air
}

// Shared SSE runner: POST a body to /api/brain/stream and drive the callbacks.
// Returns { mood, form, scheme, speech, paint }; throws on any incomplete stream.
// allowSilent: a cleanly-completed stream with NO speech is valid (the presence
// chose silence on an opening) rather than an incomplete-stream error.
//
// What it throws says what happened: `why` (one of WHYS, or null when it is
// not known), `provider`, and `again`: whether asking the non-streaming route
// the same thing is still right (respondStream).

// THE IDLE WATCHDOG. A turn had no time limit at all, so a stream that went
// quiet without closing (a phone moving from wifi to cellular leaves the old
// connection open and silent) left the orb thinking, and the room busy, for
// good. Now 45s with no bytes at all ends it, as 'dropped'. A long think is
// byte-silent, but the server writes ': ping' through it every 15s (server.mjs,
// the heartbeat), and a ping is bytes here, so only three missed in a row end
// a turn.
const IDLE_MS = 45000;

async function streamRequest(body, { onMood, onText, onForm, onScheme, onMorph, onPaint, onShape, timeoutMs, allowSilent } = {}) {
  const ac = new AbortController();
  let idle = false;
  let watch = 0;
  const quiet = () => { clearTimeout(watch); watch = setTimeout(() => { idle = true; ac.abort(); }, IDLE_MS); };
  const limit = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : 0;
  let speech = '';
  // Asked again only when nothing was heard and nothing was refused: a cut
  // line, or a reason the server could not name. Never after the provider said
  // no (key, credit, rate, model, busy): the same key would be refused again
  // at once, or add load where there was too much, and a reply already half
  // said would be paid for twice.
  const fail = (why, { provider = null, again } = {}) => Object.assign(new Error(why || 'stream incomplete'), {
    why: why || null, provider,
    again: again ?? (!speech.trim() && (!why || why === 'unreachable' || why === 'dropped')),
  });
  quiet();
  try {
    let resp;
    try {
      resp = await fetch('/api/brain/stream', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (err) {
      // never reached the site: a TypeError is a fetch that could not connect
      throw fail(idle ? 'dropped' : err?.name === 'TypeError' ? 'offline' : null);
    }
    const ct = resp.headers.get('content-type') || '';
    if (!resp.ok || !resp.body || !ct.includes('event-stream')) {
      // An answer instead of a stream: the site said no before any provider was
      // asked. A key no provider claims comes back as why 'key', and the other
      // route would only say the same. Anything else (the house allowance, no
      // brain) is asked there, as before, because that is where it is said.
      const j = ct.includes('json') ? await resp.json().catch(() => null) : null;
      const why = WHYS.includes(j?.why) ? j.why : null;
      throw fail(why, { again: !why });
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();

    let buf = ''; let mood = 'calm'; let form = null; let scheme = null; let anchors = null; let shape = null; let invite = null;
    let morph = null; let liquid = null; let score = null; let bodyBlock = null;
    let gotMood = false; let gotDone = false; let errored = false; let why = null; let provider = null;
    for (;;) {
      let chunk;
      try { chunk = await reader.read(); } catch { throw fail('dropped'); }   // cut, or the watchdog
      quiet();   // any bytes at all, the server's ': ping' included
      const { value, done } = chunk;
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
        // the provider's reason, as a word from a fixed list (server.mjs upstreamRefused)
        else if (ev === 'error') { errored = true; why = WHYS.includes(p.why) ? p.why : null; provider = typeof p.provider === 'string' ? p.provider : null; }
      }
    }
    // Words were already said when it failed: whatever broke, what the person
    // saw was the reply stopping partway, unless the provider said why.
    if (errored) throw fail(speech.trim() && (!why || why === 'unreachable') ? 'dropped' : why, { provider });
    if (!gotDone) throw fail('dropped');   // it simply ended: neither done nor error
    // chosen silence, cleanly delivered: an opening that said nothing, or a turn
    // answered with the body alone (a shape or a painting and no words). The
    // server keeps its wordless rescue off for that second kind so as not to
    // buy a second call, and this used to throw and buy one anyway.
    const silentOk = (allowSilent || shape || anchors) && gotMood;
    // A wordless done is asked again as it always was: the server's comment on
    // memory says the writes ride that retry.
    if (!silentOk && (!gotMood || !speech.trim())) throw fail(null, { again: true });

    // score + body ride home with everything else. They were parsed on the
    // server and read by main.js at both ends of this trip, and dropped in the
    // middle: not bound here, not bound out of parser.end(), not on the done
    // event. Every <<over:>> and <<body:>> a presence wrote in the chat did
    // nothing at all — the dance path worked only because tend.js reads the raw
    // /api/brain JSON and never comes through here.
    return { mood, form, scheme, morph, liquid, speech: scrubTags(speech), paint: anchors, shape, score, body: bodyBlock, invite };
  } finally {
    clearTimeout(watch);
    clearTimeout(limit);
    ac.abort();   // a turn that ended any other way stops the server spending on it
  }
}

// Streaming variant: emits onMood as soon as the model commits, then onText
// deltas as the speech generates. Falls back to non-streaming respond() only
// when nothing reached the person yet and the stream failed in a way that
// asking again can fix (see streamRequest's `again`); otherwise it keeps what
// went out, or says why it did not answer.

export async function respondStream(text, { onMood, onText, onForm, onScheme, onMorph, onPaint, onShape, image, paint, presence } = {}) {
  if (offline()) return notice('offline');   // nothing is sent, so nothing is kept
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
    } catch (e) {
      // A refusal with its reason (streamRequest's again === false) says why,
      // also after words went out: what the person saw was the reply stopping.
      // What was heard is kept in history first.
      if (e?.again === false) {
        if (spoke.trim()) {
          history.push({ role: 'user', content: text, t: askedAt });
          history.push({ role: 'assistant', content: asAssistant(mood, null, null, scrubTags(spoke)), t: Date.now() });
        }
        return notice(e.why, e.provider);
      }
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
// from dying in silence; when one refused, the arrival says why (whyLine).
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
    } catch (e) {
      // If part of the line already went out, let it stand — never double-speak.
      // Keep what was actually heard in history so orion's context matches.
      if (spoke.trim()) {
        history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
        history.push({ role: 'assistant', content: asAssistant('calm', null, null, scrubTags(spoke)), t: Date.now() });
        return { mood: 'calm', form: null, scheme: null, speech: '', paint: null, seeded: true };
      }
      // Refused with a reason (a revoked key, no credit, a model the key
      // cannot use): the arrival says which, off the air and not kept, as a
      // reply would. It used to be a stray thought in the orb's voice, and the
      // person learned why only after typing to it. A stream that was slow or
      // cut ('again', streamRequest) still gets the stray thought, below.
      const line = e?.again === false && e.why ? whyLine(e.why, e.provider) : null;
      if (line) {
        onMood?.('calm');
        onText?.(line);
        return { mood: 'calm', form: null, scheme: null, speech: line, paint: null, seeded: true, notice: true, why: e.why };
      }
    }
  }
  // No brain at all: the arrival says what is missing (see NO_PROVIDER), not a
  // stray thought in the orb's voice. A brain that is there but slow to open
  // still gets one: the next line will be answered. A site that could not be
  // asked is not one without a brain, and says it is the connection.
  if (!canBrain) {
    const missing = unreached ? whyLine('offline') : NO_PROVIDER;
    onMood?.('calm');
    onText?.(missing);
    return { mood: 'calm', form: null, scheme: null, speech: missing, paint: null, seeded: true, notice: true };
  }
  const line = SEEDED_OPENINGS[Date.now() % SEEDED_OPENINGS.length];
  history.push({ role: 'user', content: OPENING_CUE, t: Date.now() });
  history.push({ role: 'assistant', content: asAssistant('calm', null, null, line), t: Date.now() });
  onMood?.('calm');
  onText?.(line);
  return { mood: 'calm', form: null, scheme: null, speech: line, paint: null, seeded: true };
}
