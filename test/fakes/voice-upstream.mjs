// The three voice services, faked: ElevenLabs, OpenAI and Cartesia answer from
// here instead of the network. Imported by test/voice.test.mjs for the pieces,
// and preloaded into a spawned server (node --import) for the routes — then
// every request that would have left the machine is appended to
// FAKE_VOICE_LOG as one JSON line, so the test can read exactly what went out.
//
// A key of 'bad-key' is refused (401). An ElevenLabs key of 'old-account'
// can't use Voice Design v3 (422), to exercise the fallback.
//
// Speech is refused the way each service refuses it (REFUSED below), for the
// reasons voice-providers.mjs refusalOf reads, each answer carrying the kind of
// account detail a real one does (a quota, an organisation, a voice id) that
// must never reach the page. 'offline-key' gets no answer at all.
import { appendFileSync } from 'node:fs';

const HOSTS = new Set(['api.elevenlabs.io', 'api.openai.com', 'api.cartesia.ai']);
const AUDIO = Buffer.from('ID3-fake-mp3');
const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const EL_QUOTA = { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000. You have 3 credits remaining, while 120 credits are required for this request.' } };
const REFUSED = {
  // ElevenLabs: the reason is in detail.status
  'api.elevenlabs.io el-empty': [401, EL_QUOTA],
  'api.elevenlabs.io voice:spent': [401, EL_QUOTA],
  'api.elevenlabs.io voice:gone': [404, { detail: { status: 'voice_not_found', message: 'A voice with voice_id gone-acct-42 was not found.' } }],
  'api.elevenlabs.io voice:gone400': [400, { detail: { status: 'voice_not_found', message: 'A voice with voice_id gone-acct-42 was not found.' } }],
  'api.elevenlabs.io busy-key': [429, { detail: { status: 'too_many_concurrent_requests', message: 'Too many concurrent requests for workspace ws-acct-42.' } }],
  // OpenAI: the same 429 for money and for pace, told apart by error.code
  'api.openai.com sk-empty': [429, { error: { message: 'You exceeded your current quota, please check your plan and billing details. org-acct-42', type: 'insufficient_quota', code: 'insufficient_quota' } }],
  'api.openai.com busy-key': [429, { error: { message: 'Rate limit reached in organization org-acct-42 on requests per min.', type: 'requests', code: 'rate_limit_exceeded' } }],
  // Cartesia: the status alone
  'api.cartesia.ai c-empty': [402, { error: 'Insufficient credits for org-acct-42' }],
  'api.cartesia.ai c-banned': [403, { error: 'API key acct-42 is not allowed' }],
  'api.cartesia.ai voice:c-gone': [404, { error: 'Voice c-gone-acct-42 not found' }],
  // any of them: their side, and an answer nothing here reads
  '* down-key': [503, { message: 'upstream connect error for acct-42' }],
  '* teapot-key': [418, { message: 'I am a teapot, acct-42' }],
};

export function isUpstream(url) {
  try { return HOSTS.has(new URL(String(url)).host); } catch { return false; }
}

export async function upstream(url, init = {}) {
  const u = new URL(String(url));
  const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const body = init.body ? JSON.parse(init.body) : null;
  if (process.env.FAKE_VOICE_LOG) {
    appendFileSync(process.env.FAKE_VOICE_LOG, JSON.stringify({ host: u.host, path: u.pathname, query: u.search, method: init.method || 'GET', headers: h, body }) + '\n');
  }
  const key = h['xi-api-key'] || h['x-api-key'] || String(h.authorization || '').replace(/^Bearer /, '');
  if (key === 'offline-key') throw new TypeError('fetch failed');
  if (!key || key === 'bad-key') return jsonRes(401, { detail: 'invalid key' });
  const speech = /^\/v1\/text-to-speech\/|^\/v1\/audio\/speech$|^\/tts\/bytes$/.test(u.pathname);
  const voice = u.host === 'api.elevenlabs.io' ? decodeURIComponent(u.pathname.split('/')[3] || '') : body?.voice?.id || body?.voice;
  const no = speech && (REFUSED[`${u.host} ${key}`] || REFUSED[`${u.host} voice:${voice}`] || REFUSED[`* ${key}`]);
  if (no) return jsonRes(no[0], no[1]);

  if (u.host === 'api.elevenlabs.io') {
    if (u.pathname === '/v2/voices') {
      return jsonRes(200, { voices: [
        { voice_id: 'pre-roger', name: 'Roger - Laid-Back, Casual, Resonant', category: 'premade', labels: { gender: 'male', accent: 'american' } },
        { voice_id: 'own-nb', name: 'River friend', category: 'generated', labels: {} },
        { voice_id: 'pre-bella', name: 'Bella - Professional, Bright, Warm', category: 'premade', labels: { gender: 'female' } },
        { voice_id: 'own-clone', name: 'My clone', category: 'cloned', labels: {} },
      ] });
    }
    if (u.pathname === '/v1/models') {
      return jsonRes(200, [
        { model_id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5', can_do_text_to_speech: true },
        { model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true },
        { model_id: 'eleven_v5_preview', name: 'Eleven v5 Preview', can_do_text_to_speech: true },
        { model_id: 'eleven_monolingual_v1', name: 'Eleven English v1', can_do_text_to_speech: true },
        { model_id: 'eleven_turbo_v2', name: 'Eleven Turbo v2', can_do_text_to_speech: true },
        { model_id: 'eleven_english_sts_v2', name: 'Eleven English STS v2', can_do_text_to_speech: false },
      ]);
    }
    if (u.pathname.startsWith('/v1/text-to-speech/')) return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    if (u.pathname === '/v1/text-to-voice/design') {
      if (key === 'old-account' && body?.model_id === 'eleven_ttv_v3') return jsonRes(422, { detail: 'model not available' });
      return jsonRes(200, { previews: [{ generated_voice_id: 'gen-1', audio_base_64: AUDIO.toString('base64'), media_type: 'audio/mpeg' }] });
    }
    if (u.pathname === '/v1/text-to-voice') return jsonRes(200, { voice_id: 'saved-1', name: body?.voice_name });
    return jsonRes(404, {});
  }

  if (u.host === 'api.openai.com') {
    if (u.pathname === '/v1/models') return jsonRes(200, { data: [{ id: 'gpt-4o-mini-tts' }] });
    if (u.pathname === '/v1/audio/speech') return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    return jsonRes(404, {});
  }

  // Cartesia
  if (u.pathname === '/voices') {
    const mine = u.searchParams.get('is_owner') === 'true';
    return jsonRes(200, { has_more: false, data: mine
      ? [{ id: 'c-own', name: 'Studio me', language: 'en', is_owner: true, tagline: '' }]
      : [
        { id: 'c-fr', name: 'Élodie', language: 'fr', is_owner: false, gender: 'feminine', tagline: 'Parisian host' },
        { id: 'c-own', name: 'Studio me', language: 'en', is_owner: true, tagline: '' },
        { id: 'c-en', name: 'Maya', language: 'en', is_owner: false, gender: 'feminine', tagline: 'Warm and clear' },
      ] });
  }
  if (u.pathname === '/tts/bytes') return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  return jsonRes(404, {});
}

// Preloaded into a server: only the voice services are faked; everything else
// (the test's own calls, anything local) goes to the real fetch.
if (process.env.FAKE_VOICE_LOG) {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (isUpstream(url) ? upstream(url, init) : real(url, init));
}
