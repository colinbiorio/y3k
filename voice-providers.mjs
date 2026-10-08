// ============================================================================
// voice-providers.mjs — THE VOICES Y3K CAN SPEAK WITH, and how to ask each one.
//
// ElevenLabs was the only voice, and every word went out on one model
// (Flash v2.5). Now the person picks the service and the model in Settings →
// Voice; this file is everything the server needs to know about each:
//
//   elevenlabs  the site's own voice account (EL_KEY) or the visitor's key;
//               designed voices, the widest library, v4 (2026-09-28)
//   openai      the visitor's OpenAI key; thirteen built-in voices
//   cartesia    the visitor's Cartesia key; Sonic, the quickest to first sound
//
// Only ElevenLabs ever runs on the site's key. The others are the visitor's
// own key or nothing — the server passes it through for one call and forgets it.
//
// Each request is BUILT here and SENT by the route, so a test can read exactly
// what would leave the machine (speechRequest) without a network.
// ============================================================================

export const VOICE_PROVIDERS = {
  elevenlabs: { name: 'ElevenLabs', hint: 'ElevenLabs API key', design: true },
  openai: { name: 'OpenAI', hint: 'OpenAI API key (sk-…)', design: false },
  cartesia: { name: 'Cartesia', hint: 'Cartesia API key', design: false },
};
export const providerOf = (p) => (typeof p === 'string' && Object.hasOwn(VOICE_PROVIDERS, p) ? p : 'elevenlabs');

const EL_BASE = 'https://api.elevenlabs.io';
const OPENAI_BASE = 'https://api.openai.com';
const CARTESIA_BASE = 'https://api.cartesia.ai';
const CARTESIA_VERSION = '2026-03-01';

// THE MODELS, as the dropdown shows them: the first is each service's default.
// `controls` is which Delivery sliders the model honours — v4 takes stability
// and similarity only (no speed, no style), so the page greys Speed out rather
// than letting a slider do nothing.
//
// ElevenLabs' default stays Flash v2.5: it is the quickest to first sound, and
// designed voices perform best on the models they were designed for. v4 and
// v4 Turbo are one choice away.
export const MODELS = {
  elevenlabs: [
    { id: 'eleven_flash_v2_5', name: 'Flash v2.5', note: 'fastest', controls: ['stability', 'speed'] },
    { id: 'eleven_v4_turbo', name: 'v4 Turbo', note: 'new · expressive, still quick', controls: ['stability'] },
    { id: 'eleven_v4', name: 'v4', note: 'new · most expressive, slower to start', controls: ['stability'] },
    { id: 'eleven_v3', name: 'v3', note: 'expressive, slower', controls: ['stability'] },
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', note: 'quick, a little fuller', controls: ['stability', 'speed'] },
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2', note: 'steady and lifelike', controls: ['stability', 'speed'] },
  ],
  openai: [
    { id: 'gpt-4o-mini-tts', name: 'GPT-4o mini TTS', note: 'natural', controls: ['speed'] },
    { id: 'tts-1', name: 'TTS-1', note: 'quickest', controls: ['speed'] },
    { id: 'tts-1-hd', name: 'TTS-1 HD', note: 'clearer, slower', controls: ['speed'] },
  ],
  cartesia: [
    { id: 'sonic-3.6', name: 'Sonic 3.6', note: 'newest · fast and natural', controls: ['speed'] },
    { id: 'sonic-3.5', name: 'Sonic 3.5', note: '', controls: ['speed'] },
    { id: 'sonic-3', name: 'Sonic 3', note: '', controls: ['speed'] },
  ],
};
export const defaultModel = (provider) => MODELS[providerOf(provider)][0].id;

// A model id from the page, checked: one of ours, or (ElevenLabs) any id the
// account's live list offered — a model released next month appears in the
// dropdown without a deploy. Anything else is the service's default.
const MODEL_SHAPE = {
  elevenlabs: /^eleven_[a-z0-9_]{1,40}$/,
  openai: /^(?:gpt-[a-z0-9.-]{1,40}-tts(?:-[0-9-]{1,12})?|tts-1(?:-hd)?)$/,
  cartesia: /^sonic[a-z0-9.-]{0,30}$/,
};
export function modelOf(provider, id) {
  const p = providerOf(provider);
  return typeof id === 'string' && MODEL_SHAPE[p].test(id) ? id : defaultModel(p);
}

// Old ElevenLabs models the live list still returns, kept out of the dropdown.
const EL_LEGACY = /_v1$|^eleven_(?:turbo|flash)_v2$|^eleven_english/;

const unit = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const within = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

// ElevenLabs voice_settings, shaped to what the model takes. The v2.x models
// take the full set, as they always have. v4 takes stability and similarity
// only. v3 takes stability in three steps (Creative 0, Natural 0.5, Robust 1).
// A model we don't know yet gets the two every model accepts.
export function elevenSettings(model, s = {}) {
  const stability = unit(s.stability, 0.5);
  const similarity_boost = unit(s.similarity_boost, 0.75);
  if (model === 'eleven_v3') return { stability: Math.round(stability * 2) / 2, similarity_boost };
  const known = MODELS.elevenlabs.find((m) => m.id === model);
  if (!known || !known.controls.includes('speed')) return { stability, similarity_boost };
  return {
    stability, similarity_boost,
    style: unit(s.style, 0.0),
    use_speaker_boost: s.use_speaker_boost !== false,
    speed: within(s.speed, 0.7, 1.2, 1.0),
  };
}

// On the site's voice account, a character on the richer models costs twice
// what it does on Flash or Turbo; the daily allowance counts it that way.
export const houseWeight = (model) => (/flash|turbo/.test(String(model)) ? 1 : 2);

// OpenAI's built-in voices. The newer four speak only on gpt-4o-mini-tts, so a
// person who picks one with TTS-1 selected is spoken to on gpt-4o-mini-tts.
export const OPENAI_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
const OPENAI_NEWER = new Set(['marin', 'cedar', 'ballad', 'verse']);
const OPENAI_BEST = new Set(['marin', 'cedar']);

// The one request that speaks `text`. Returns { url, init } for fetch.
export function speechRequest({ provider, key, text, voiceId, model, settings = {} }) {
  const p = providerOf(provider);
  const m = modelOf(p, model);
  const json = (headers, body) => ({ method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (p === 'openai') {
    const voice = OPENAI_VOICES.includes(voiceId) ? voiceId : 'marin';
    const useModel = OPENAI_NEWER.has(voice) && /^tts-1/.test(m) ? 'gpt-4o-mini-tts' : m;
    const body = { model: useModel, voice, input: text, response_format: 'mp3' };
    const speed = within(settings.speed, 0.7, 1.2, 1.0);
    if (speed !== 1) body.speed = speed;
    return { url: `${OPENAI_BASE}/v1/audio/speech`, init: json({ authorization: `Bearer ${key}` }, body) };
  }
  if (p === 'cartesia') {
    const body = {
      model_id: m,
      transcript: text,
      voice: { mode: 'id', id: String(voiceId) },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    };
    const speed = within(settings.speed, 0.7, 1.2, 1.0);
    if (speed !== 1) body.generation_config = { speed };
    return { url: `${CARTESIA_BASE}/tts/bytes`, init: json({ 'x-api-key': key, 'cartesia-version': CARTESIA_VERSION }, body) };
  }
  return {
    url: `${EL_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    init: json({ 'xi-api-key': key }, { text, model_id: m, voice_settings: elevenSettings(m, settings) }),
  };
}

// WHY A SERVICE SAID NO (2026-10-08). Every refused sentence reached the page
// as one 502, 'voice service unavailable', so a bad key, an empty account and
// a deleted voice all looked the same there: the presence's voice turned to
// the browser's and nothing said why. refusalOf reads the service's answer
// into one of five reasons:
//
//   key      the key was refused
//   credits  the account has nothing left to spend
//   voice    no voice with that id on this account
//   rate     too many requests at once; over within the minute
//   down     a server error, no answer in time, or an answer not read here
//
// ElevenLabs puts a status in `detail` (quota_exceeded, voice_not_found),
// OpenAI an error code (insufficient_quota), Cartesia only the HTTP status.
// The route sends the page the reason and a fixed sentence for it, never the
// service's own words: they can carry account details (a quota, a voice id).
// An answer not recognised here is 'down', and its status code goes to
// Settings → Voice only.
export const REFUSALS = ['key', 'credits', 'voice', 'rate', 'down'];

export function refusalOf(provider, status, bodyText) {
  const p = providerOf(provider);
  const s = Number(status) || 0;
  if (!s || s >= 500) return 'down';
  let said = null;
  try { said = JSON.parse(String(bodyText || '')); } catch { /* not JSON: the status alone */ }
  if (p === 'openai') {
    const e = said?.error;
    if (s === 401) return 'key';
    if (s === 429) return e?.code === 'insufficient_quota' || e?.type === 'insufficient_quota' ? 'credits' : 'rate';
    return 'down';
  }
  if (p === 'cartesia') {
    if (s === 401 || s === 403) return 'key';
    if (s === 402) return 'credits';
    if (s === 404) return 'voice';
    if (s === 429) return 'rate';
    return 'down';
  }
  // ElevenLabs. Older answers carry detail.status, newer ones detail.code too.
  const d = said?.detail && typeof said.detail === 'object' ? said.detail : {};
  const code = d.status || d.code || '';
  if (s === 401) return code === 'quota_exceeded' ? 'credits' : 'key';
  if (s === 404 || (s === 400 && code === 'voice_not_found')) return 'voice';
  if (s === 429) return 'rate';
  return 'down';
}

// The route's fixed sentence for a reason. `house`: it was the site's
// ElevenLabs account, not the visitor's, that said no. SPENT is what each
// account runs out of (src/voice.js says it the same way).
export const SPENT = { elevenlabs: 'characters', openai: 'credits', cartesia: 'credits' };
export function refusalError(provider, reason, house = false) {
  const p = providerOf(provider);
  const name = VOICE_PROVIDERS[p].name;
  if (reason === 'key') return `${name} did not accept ${house ? "the site's key" : 'the key'}.`;
  if (reason === 'credits') return `${name} says ${house ? "the site's account" : 'the account'} is out of ${SPENT[p]}.`;
  if (reason === 'voice') return `${name} could not find that voice.`;
  if (reason === 'rate') return `${name} says too many requests are being made at once.`;
  return `${name} could not speak that sentence.`;
}

// A voice as the page lists it. `own` puts it at the top of the list; the
// service's stock voices sit in the Default drawer below.
const row = (id, name, labels, own, category) => ({ id, name, labels, own, ...(category ? { category } : {}) });

// The service's voices and models for this key, or { ok: false } when the key
// is refused or the service can't be reached. Both lists in one round trip.
export async function catalogue({ provider, key, fetch = globalThis.fetch }) {
  const p = providerOf(provider);
  const timeout = () => AbortSignal.timeout(20000);
  const models = MODELS[p].map(({ id, name, note, controls }) => ({ id, name, note, controls }));

  if (p === 'openai') {
    // No voice list to fetch: a cheap authenticated call just to learn whether
    // the key is good, so a bad one says so here rather than at the first word.
    const r = await fetch(`${OPENAI_BASE}/v1/models`, { headers: { authorization: `Bearer ${key}` }, signal: timeout() });
    if (!r.ok) return { ok: false, status: r.status };
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    return { ok: true, models, voices: OPENAI_VOICES.map((v) => row(v, cap(v), OPENAI_BEST.has(v) ? { description: 'recommended' } : {}, false)) };
  }

  if (p === 'cartesia') {
    const headers = { 'x-api-key': key, 'cartesia-version': CARTESIA_VERSION };
    const get = (q) => fetch(`${CARTESIA_BASE}/voices?${q}`, { headers, signal: timeout() });
    const [mine, all] = await Promise.all([get('limit=100&is_owner=true'), get('limit=100')]);
    if (!all.ok) return { ok: false, status: all.status };
    const list = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
    const own = mine.ok ? list(await mine.json().catch(() => null)) : [];
    const seen = new Set();
    const voices = [];
    for (const v of [...own.map((x) => ({ ...x, is_owner: true })), ...list(await all.json().catch(() => null))]) {
      if (!v?.id || seen.has(v.id)) continue;
      seen.add(v.id);
      const labels = { gender: typeof v.gender === 'string' ? v.gender.replace(/_/g, ' ') : '', description: v.tagline || '' };
      voices.push({ ...row(v.id, String(v.name || 'Voice'), labels, !!v.is_owner), en: v.language === 'en' });
    }
    // English first among the stock voices; the page reads the rest in order.
    voices.sort((a, b) => (b.own - a.own) || (b.en - a.en));
    return { ok: true, models, voices: voices.map(({ en, ...v }) => v) };
  }

  const headers = { 'xi-api-key': key };
  const [vr, mr] = await Promise.all([
    fetch(`${EL_BASE}/v2/voices?page_size=100`, { headers, signal: timeout() }),
    fetch(`${EL_BASE}/v1/models`, { headers, signal: timeout() }).catch(() => null),
  ]);
  if (!vr.ok) return { ok: false, status: vr.status };
  const d = await vr.json();
  const voices = (d.voices || []).map((v) => row(v.voice_id, v.name, v.labels || {}, v.category !== 'premade', v.category));
  // Models the account offers that we have no line for yet — listed by their
  // own name after ours, so a new release is choosable the day it ships.
  if (mr?.ok) {
    const live = await mr.json().catch(() => []);
    for (const m of Array.isArray(live) ? live : []) {
      const id = m?.model_id;
      if (!id || !m.can_do_text_to_speech || EL_LEGACY.test(id) || !MODEL_SHAPE.elevenlabs.test(id)) continue;
      if (models.some((x) => x.id === id)) continue;
      models.push({ id, name: String(m.name || id).replace(/^Eleven\s*/i, ''), note: '', controls: ['stability'] });
    }
  }
  return { ok: true, models, voices };
}
