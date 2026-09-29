// THE VOICES: voice-providers.mjs and the /api/voice/* routes. Run:
//   node test/voice.test.mjs
//
// Three services — ElevenLabs (the site's account or the visitor's key),
// OpenAI and Cartesia (the visitor's key only) — each with a model the person
// picks. No network: test/fakes/voice-upstream.mjs answers for all three, and
// for the routes it is preloaded into the server, logging every request that
// would have left the machine.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { providerOf, modelOf, defaultModel, elevenSettings, houseWeight, speechRequest, catalogue, MODELS, OPENAI_VOICES } from '../voice-providers.mjs';
import { upstream } from './fakes/voice-upstream.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('the pieces:');

await ok('three services; anything else is ElevenLabs', () => {
  assert.equal(providerOf('openai'), 'openai');
  assert.equal(providerOf('cartesia'), 'cartesia');
  assert.equal(providerOf('toString'), 'elevenlabs', 'not an inherited name');
  assert.equal(providerOf(undefined), 'elevenlabs');
});

await ok('ElevenLabs lists v4 and v4 Turbo; Flash v2.5 stays the default', () => {
  const ids = MODELS.elevenlabs.map((m) => m.id);
  assert.ok(ids.includes('eleven_v4') && ids.includes('eleven_v4_turbo'));
  assert.equal(defaultModel('elevenlabs'), 'eleven_flash_v2_5');
  assert.equal(defaultModel('openai'), 'gpt-4o-mini-tts');
  assert.equal(defaultModel('cartesia'), 'sonic-3.6');
});

await ok('a model id from the page is checked against its service', () => {
  assert.equal(modelOf('elevenlabs', 'eleven_v4_turbo'), 'eleven_v4_turbo');
  assert.equal(modelOf('elevenlabs', 'eleven_v5_preview'), 'eleven_v5_preview', 'a model released later still passes');
  assert.equal(modelOf('elevenlabs', '../../v1/voices'), 'eleven_flash_v2_5');
  assert.equal(modelOf('elevenlabs', 'tts-1'), 'eleven_flash_v2_5', "another service's model");
  assert.equal(modelOf('openai', 'tts-1-hd'), 'tts-1-hd');
  assert.equal(modelOf('openai', 'gpt-4o-mini-tts-2025-12-15'), 'gpt-4o-mini-tts-2025-12-15');
  assert.equal(modelOf('cartesia', 'sonic-3.5'), 'sonic-3.5');
  assert.equal(modelOf('cartesia', { id: 1 }), 'sonic-3.6');
});

await ok('voice settings fit the model: v2.x the full set, v4 two, v3 in three steps', () => {
  const s = { stability: 0.3, similarity_boost: 0.8, speed: 1.1, style: 0.2 };
  assert.deepEqual(Object.keys(elevenSettings('eleven_flash_v2_5', s)).sort(), ['similarity_boost', 'speed', 'stability', 'style', 'use_speaker_boost']);
  assert.equal(elevenSettings('eleven_flash_v2_5', s).speed, 1.1);
  assert.deepEqual(elevenSettings('eleven_v4', s), { stability: 0.3, similarity_boost: 0.8 });
  assert.deepEqual(elevenSettings('eleven_v4_turbo', s), { stability: 0.3, similarity_boost: 0.8 });
  assert.equal(elevenSettings('eleven_v3', { stability: 0.3 }).stability, 0.5);
  assert.equal(elevenSettings('eleven_v3', { stability: 0.2 }).stability, 0);
  assert.deepEqual(elevenSettings('eleven_v5_preview', s), { stability: 0.3, similarity_boost: 0.8 }, 'an unknown model gets what every model takes');
  assert.equal(elevenSettings('eleven_flash_v2_5', { speed: 9 }).speed, 1.2, 'speed stays in its band');
  assert.equal(elevenSettings('eleven_flash_v2_5', { stability: NaN }).stability, 0.5);
});

await ok('on the site account, the richer models count double', () => {
  assert.equal(houseWeight('eleven_flash_v2_5'), 1);
  assert.equal(houseWeight('eleven_v4_turbo'), 1);
  assert.equal(houseWeight('eleven_v4'), 2);
  assert.equal(houseWeight('eleven_multilingual_v2'), 2);
});

await ok('each service is asked the way it expects', () => {
  const el = speechRequest({ provider: 'elevenlabs', key: 'k-el', text: 'Hi.', voiceId: 'v/1', model: 'eleven_v4', settings: { speed: 1.1 } });
  assert.equal(el.url, 'https://api.elevenlabs.io/v1/text-to-speech/v%2F1?output_format=mp3_44100_128');
  assert.equal(el.init.headers['xi-api-key'], 'k-el');
  assert.deepEqual(JSON.parse(el.init.body), { text: 'Hi.', model_id: 'eleven_v4', voice_settings: { stability: 0.5, similarity_boost: 0.75 } });

  const oa = speechRequest({ provider: 'openai', key: 'sk-x', text: 'Hi.', voiceId: 'nova', model: 'tts-1', settings: { speed: 1.1 } });
  assert.equal(oa.url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(oa.init.headers.authorization, 'Bearer sk-x');
  assert.deepEqual(JSON.parse(oa.init.body), { model: 'tts-1', voice: 'nova', input: 'Hi.', response_format: 'mp3', speed: 1.1 });
  const newer = JSON.parse(speechRequest({ provider: 'openai', key: 'sk-x', text: 'Hi.', voiceId: 'marin', model: 'tts-1' }).init.body);
  assert.equal(newer.model, 'gpt-4o-mini-tts', 'marin speaks only on gpt-4o-mini-tts');
  assert.equal(newer.speed, undefined, 'speed 1 is not sent');
  assert.equal(JSON.parse(speechRequest({ provider: 'openai', key: 'k', text: 'x', voiceId: 'nobody' }).init.body).voice, 'marin');

  const ca = speechRequest({ provider: 'cartesia', key: 'c-key', text: 'Hi.', voiceId: 'c-en', model: 'sonic-3', settings: { speed: 0.8 } });
  assert.equal(ca.url, 'https://api.cartesia.ai/tts/bytes');
  assert.equal(ca.init.headers['x-api-key'], 'c-key');
  assert.equal(ca.init.headers['cartesia-version'], '2026-03-01');
  assert.deepEqual(JSON.parse(ca.init.body), {
    model_id: 'sonic-3', transcript: 'Hi.', voice: { mode: 'id', id: 'c-en' },
    output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 }, generation_config: { speed: 0.8 },
  });
  assert.equal(OPENAI_VOICES.length, 13);
});

await ok('ElevenLabs: your voices marked own, the account\'s newer models added, the old ones left out', async () => {
  const c = await catalogue({ provider: 'elevenlabs', key: 'k', fetch: upstream });
  assert.ok(c.ok);
  assert.deepEqual(c.voices.filter((v) => v.own).map((v) => v.id), ['own-nb', 'own-clone']);
  assert.deepEqual(c.voices.filter((v) => !v.own).map((v) => v.id), ['pre-roger', 'pre-bella']);
  const ids = c.models.map((m) => m.id);
  assert.equal(ids[0], 'eleven_flash_v2_5');
  assert.ok(ids.includes('eleven_v5_preview'), 'a model we have no line for yet');
  assert.equal(c.models.find((m) => m.id === 'eleven_v5_preview').name, 'v5 Preview');
  assert.ok(!ids.includes('eleven_monolingual_v1') && !ids.includes('eleven_turbo_v2') && !ids.includes('eleven_english_sts_v2'));
  assert.equal(ids.filter((id) => id === 'eleven_v4').length, 1, 'no duplicates');
});

await ok('OpenAI: the key is checked, the thirteen voices listed; Cartesia: yours first, English next', async () => {
  const o = await catalogue({ provider: 'openai', key: 'sk-good', fetch: upstream });
  assert.ok(o.ok && o.voices.length === 13 && o.voices.every((v) => !v.own));
  assert.equal(o.voices[0].name, 'Marin');
  assert.equal((await catalogue({ provider: 'openai', key: 'bad-key', fetch: upstream })).ok, false);
  const c = await catalogue({ provider: 'cartesia', key: 'c-key', fetch: upstream });
  assert.deepEqual(c.voices.map((v) => v.id), ['c-own', 'c-en', 'c-fr']);
  assert.equal(c.voices[0].own, true);
  assert.equal(c.voices[1].labels.description, 'Warm and clear');
  assert.equal((await catalogue({ provider: 'cartesia', key: 'bad-key', fetch: upstream })).ok, false);
});

// --- the routes -----------------------------------------------------------------
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const DATA = mkdtempSync(join(tmpdir(), 'y3k-voice-'));
const LOG = join(DATA, 'upstream.log');
const PASSWORD = 'voice-' + Math.random().toString(36).slice(2);
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
async function boot() {
  const child = spawn(process.execPath, ['--import', './test/fakes/voice-upstream.mjs', 'server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '', RENDER: '',
      ELEVENLABS_API_KEY: 'site-el-key', FAKE_VOICE_LOG: LOG, RATE_MAX: '500' },
  });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 120)); }
  return child;
}
const server = await boot();
const sent = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const clearLog = () => writeFileSync(LOG, '');
const post = (path, body, { cookie, headers = {} } = {}) => fetch(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body),
});
const get = (path, { cookie, headers = {} } = {}) => fetch(BASE + path, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
async function login(identifier, password) {
  const r = await post('/api/auth/login', { identifier, password });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}

try {
  console.log('\nthe routes:');
  const founder = await login('colinbiorio@gmail.com', PASSWORD);
  assert.ok(founder, 'the founder signs in');
  const su = await post('/api/auth/signup', { email: 'listener@example.com', username: 'listener', password: 'a-long-password-1', age17: true, terms: true });
  const someone = (su.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(someone, 'someone else signs up');

  await ok('nobody signed in hears nothing on the site\'s account, and nothing is asked of ElevenLabs', async () => {
    clearLog();
    const l = await get('/api/voice/list').then((r) => r.json());
    assert.equal(l.available, false);
    assert.equal((await post('/api/voice/tts', { text: 'hi', voiceId: 'pre-roger' })).status, 400);
    assert.equal(sent().length, 0);
  });

  await ok('signed in, on the site\'s account: your voices, the stock ones, and the models', async () => {
    clearLog();
    const l = await get('/api/voice/list?provider=elevenlabs', { cookie: someone }).then((r) => r.json());
    assert.equal(l.available, true);
    assert.equal(l.house, true);
    assert.deepEqual(l.voices.filter((v) => v.own).map((v) => v.id), ['own-nb', 'own-clone']);
    assert.ok(l.models.some((m) => m.id === 'eleven_v4_turbo' && m.controls.join() === 'stability'));
    assert.ok(sent().every((r) => r.headers['xi-api-key'] === 'site-el-key'));
  });

  await ok('the site\'s ElevenLabs key never speaks for OpenAI or Cartesia', async () => {
    clearLog();
    for (const p of ['openai', 'cartesia']) {
      const l = await get('/api/voice/list?provider=' + p, { cookie: founder }).then((r) => r.json());
      assert.equal(l.available, false, p);
      assert.equal((await post('/api/voice/tts', { text: 'hi', voiceId: 'nova', provider: p }, { cookie: founder })).status, 400, p);
    }
    assert.equal(sent().length, 0);
  });

  await ok('a chosen model goes out, shaped for it; an unknown one becomes the default', async () => {
    clearLog();
    const r = await post('/api/voice/tts', { text: 'Hello there.', voiceId: 'own-nb', model: 'eleven_v4', settings: { stability: 0.4, speed: 1.1 } }, { cookie: someone });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Buffer.from(await r.arrayBuffer()).toString(), 'ID3-fake-mp3');
    const [a] = sent();
    assert.equal(a.path, '/v1/text-to-speech/own-nb');
    assert.deepEqual(a.body, { text: 'Hello there.', model_id: 'eleven_v4', voice_settings: { stability: 0.4, similarity_boost: 0.75 } });
    clearLog();
    await post('/api/voice/tts', { text: 'Hi.', voiceId: 'own-nb', model: 'not a model', settings: null }, { cookie: someone });
    assert.equal(sent()[0].body.model_id, 'eleven_flash_v2_5');
    assert.equal((await post('/api/voice/tts', { text: { x: 1 }, voiceId: 'own-nb' }, { cookie: someone })).status, 400);
  });

  await ok('your own OpenAI or Cartesia key speaks for you, passed straight through', async () => {
    clearLog();
    const l = await get('/api/voice/list?provider=openai', { headers: { 'x-voice-key': 'sk-mine' } }).then((r) => r.json());
    assert.equal(l.available, true);
    assert.equal(l.voices.length, 13);
    const r = await post('/api/voice/tts', { text: 'Hi.', voiceId: 'cedar', provider: 'openai', model: 'tts-1-hd' }, { headers: { 'x-voice-key': 'sk-mine' } });
    assert.equal(r.status, 200);
    const speech = sent().find((x) => x.path === '/v1/audio/speech');
    assert.equal(speech.headers.authorization, 'Bearer sk-mine');
    assert.equal(speech.body.model, 'gpt-4o-mini-tts');
    clearLog();
    const c = await get('/api/voice/list?provider=cartesia', { headers: { 'x-voice-key': 'c-mine' } }).then((r) => r.json());
    assert.deepEqual(c.voices.map((v) => v.id), ['c-own', 'c-en', 'c-fr']);
    assert.equal((await post('/api/voice/tts', { text: 'Hi.', voiceId: 'c-en', provider: 'cartesia' }, { headers: { 'x-voice-key': 'c-mine' } })).status, 200);
    assert.equal(sent().find((x) => x.path === '/tts/bytes').body.model_id, 'sonic-3.6');
  });

  await ok('a refused key says so, and the upstream\'s words never reach the page', async () => {
    const l = await get('/api/voice/list?provider=cartesia', { headers: { 'x-voice-key': 'bad-key' } }).then((r) => r.json());
    assert.deepEqual([l.available, l.error], [false, 'key not accepted']);
    const r = await post('/api/voice/tts', { text: 'Hi.', voiceId: 'nova', provider: 'openai' }, { headers: { 'x-voice-key': 'bad-key' } });
    assert.equal(r.status, 502);
    assert.ok(!(await r.text()).includes('invalid key'));
  });

  await ok('a richer model on the site\'s account counts double against the day', async () => {
    const used = async () => (await get('/api/usage', { cookie: someone }).then((r) => r.json())).house.voice.usedChars;
    const before = await used();
    await post('/api/voice/tts', { text: 'x'.repeat(100), voiceId: 'own-nb', model: 'eleven_v4' }, { cookie: someone });
    assert.equal(await used() - before, 200);
    await post('/api/voice/tts', { text: 'x'.repeat(100), voiceId: 'own-nb', model: 'eleven_v4_turbo' }, { cookie: someone });
    assert.equal(await used() - before, 300);
  });

  await ok('designing and saving on the site\'s account stay the founder\'s', async () => {
    assert.equal((await post('/api/voice/design', { description: 'a calm, warm voice with a low register' }, { cookie: someone })).status, 403);
    assert.equal((await post('/api/voice/save', { generatedVoiceId: 'gen-1', name: 'Mine' }, { cookie: someone })).status, 403);
  });

  await ok('a voice is designed on Voice Design v3, or the default model when the account can\'t', async () => {
    clearLog();
    const d = await post('/api/voice/design', { description: 'a calm, warm voice with a low register' }, { cookie: founder }).then((r) => r.json());
    assert.equal(d.previews.length, 1);
    assert.equal(sent()[0].body.model_id, 'eleven_ttv_v3');
    clearLog();
    const d2 = await post('/api/voice/design', { description: 'a calm, warm voice with a low register' }, { headers: { 'x-voice-key': 'old-account' } }).then((r) => r.json());
    assert.equal(d2.previews.length, 1);
    assert.deepEqual(sent().map((x) => x.body.model_id), ['eleven_ttv_v3', undefined]);
  });

  await ok('a saved voice takes the name typed for it, tidied and bounded', async () => {
    clearLog();
    const r = await post('/api/voice/save', { generatedVoiceId: 'gen-1', name: '  River\n  the   friend ' + 'x'.repeat(80), description: 'd' }, { cookie: founder }).then((x) => x.json());
    assert.equal(r.voice_id, 'saved-1');
    const name = sent()[0].body.voice_name;
    assert.ok(name.startsWith('River the friend x') && name.length === 60, JSON.stringify(name));
    assert.equal((await post('/api/voice/save', { generatedVoiceId: 'gen-1', name: '   ' }, { cookie: founder })).status, 400);
  });
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  rmSync(DATA, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed.`);
