// THE VOICES: voice-providers.mjs and the /api/voice/* routes. Run:
//   node test/voice.test.mjs
//
// Three services — ElevenLabs (the site's account or the visitor's key),
// OpenAI and Cartesia (the visitor's key only) — each with a model the person
// picks. No network: test/fakes/voice-upstream.mjs answers for all three, and
// for the routes it is preloaded into the server, logging every request that
// would have left the machine.
//
// Why the voice changed (2026-10-08): a refused sentence is read into one of
// five reasons (refusalOf), the route says it in a fixed sentence and never in
// the service's own words, the page tells it once per service and reason (rate
// and down only after three in a row), Settings → Voice keeps the last one
// until that service speaks again.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { providerOf, modelOf, defaultModel, elevenSettings, houseWeight, speechRequest, catalogue, MODELS, OPENAI_VOICES,
  refusalOf, refusalError, REFUSALS, SPENT, VOICE_PROVIDERS } from '../voice-providers.mjs';
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

await ok('refusalOf: each service\'s refusal is one of five reasons', () => {
  const j = (o) => JSON.stringify(o);
  const quota = j({ detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000.' } });
  const table = [
    // ElevenLabs: 401 is the key unless detail.status says the quota is spent
    ['elevenlabs', 401, quota, 'credits'],
    ['elevenlabs', 401, j({ detail: { code: 'quota_exceeded' } }), 'credits'],
    ['elevenlabs', 401, j({ detail: 'invalid key' }), 'key'],
    ['elevenlabs', 401, j({ detail: { status: 'invalid_api_key' } }), 'key'],
    ['elevenlabs', 401, '', 'key'],
    ['elevenlabs', 404, j({ detail: { status: 'voice_not_found' } }), 'voice'],
    ['elevenlabs', 404, 'Not Found', 'voice'],
    ['elevenlabs', 400, j({ detail: { status: 'voice_not_found' } }), 'voice'],
    ['elevenlabs', 400, j({ detail: { status: 'invalid_text' } }), 'down'],
    ['elevenlabs', 429, j({ detail: { status: 'too_many_concurrent_requests' } }), 'rate'],
    // OpenAI: one 429 for money and for pace, told apart by the error's code
    ['openai', 401, j({ error: { code: 'invalid_api_key' } }), 'key'],
    ['openai', 429, j({ error: { code: 'insufficient_quota', type: 'insufficient_quota' } }), 'credits'],
    ['openai', 429, j({ error: { type: 'insufficient_quota' } }), 'credits'],
    ['openai', 429, j({ error: { code: 'rate_limit_exceeded', message: 'check your plan and billing details' } }), 'rate'],
    ['openai', 429, 'not json', 'rate'],
    ['openai', 404, j({ error: { code: 'model_not_found' } }), 'down'],
    // Cartesia: the status alone
    ['cartesia', 401, '', 'key'],
    ['cartesia', 403, '', 'key'],
    ['cartesia', 402, j({ error: 'Insufficient credits' }), 'credits'],
    ['cartesia', 404, '', 'voice'],
    ['cartesia', 429, '', 'rate'],
    // their side, no answer in time, and an answer not read here
    ['elevenlabs', 500, '', 'down'],
    ['openai', 503, '', 'down'],
    ['cartesia', 0, '', 'down'],
    ['elevenlabs', undefined, '', 'down'],
    ['openai', 418, '', 'down'],
    ['toString', 401, quota, 'credits'],
  ];
  for (const [p, status, body, want] of table) assert.equal(refusalOf(p, status, body), want, `${p} ${status} ${body}`);
  assert.deepEqual(REFUSALS, ['key', 'credits', 'voice', 'rate', 'down']);
});

await ok('the route\'s sentence for each reason is fixed, and names whose account it was', () => {
  assert.equal(refusalError('elevenlabs', 'credits'), 'ElevenLabs says the account is out of characters.');
  assert.equal(refusalError('elevenlabs', 'credits', true), "ElevenLabs says the site's account is out of characters.");
  assert.equal(refusalError('openai', 'credits'), 'OpenAI says the account is out of credits.');
  assert.equal(refusalError('cartesia', 'key'), 'Cartesia did not accept the key.');
  assert.equal(refusalError('elevenlabs', 'key', true), "ElevenLabs did not accept the site's key.");
  assert.equal(refusalError('openai', 'voice'), 'OpenAI could not find that voice.');
  assert.equal(refusalError('cartesia', 'rate'), 'Cartesia says too many requests are being made at once.');
  assert.equal(refusalError('elevenlabs', 'down'), 'ElevenLabs could not speak that sentence.');
  assert.equal(refusalError('elevenlabs', 'anything else'), 'ElevenLabs could not speak that sentence.');
  for (const p of Object.keys(VOICE_PROVIDERS)) for (const r of REFUSALS) assert.ok(!/—/.test(refusalError(p, r)), 'no em dash');
});

// --- Settings, cut from its source --------------------------------------------
// settings.js builds its whole sheet in a browser (and brings three.js with it),
// so the parts that decide what is saved and shown are cut out of the source
// and run against stand-ins, the way mercury.test.mjs runs the liquid's.
console.log('\nSettings, run from its source:');
const SET = readFileSync(join(ROOT, 'src/settings.js'), 'utf8');
const cut = (from, to = '\n    }\n') => {
  const a = SET.indexOf(from);
  assert.ok(a >= 0, 'settings.js has no ' + from);
  const b = SET.indexOf(to, a);
  assert.ok(b > a, 'no end after ' + from);
  return SET.slice(a, b + to.length);
};
const settle = () => new Promise((r) => setTimeout(r, 0));

await ok('Brain: Clear, or a newer key, wins over a model lookup still in flight', async () => {
  const src = cut('    let brainSeq = 0;');
  const detect = cut('function detectProviderLocal(key) {', '\n}\n');
  const rig = (own = false) => {
    const saved = [];   // every setBrainConfig, in order
    const asked = [];   // the lookups in flight
    const ui = { bStatus: { textContent: '' }, modelRow: { hidden: true }, clearBtn: { hidden: true },
      modelSel: { value: '', options: [], set innerHTML(v) { this.options = []; }, appendChild(o) { this.options.push(o); } } };
    const fetch = (url, o) => new Promise((resolve, reject) => asked.push({ key: JSON.parse(o.body).key, answer: (d) => resolve({ json: async () => d }), fail: reject }));
    // the model menu's own helpers (shown separately in the page): a key's live
    // list fills it, and anything else hands it back to the provider's full list
    const menus = [];
    const fillModels = (list, value) => { ui.modelSel.value = value; ui.modelRow.hidden = false; };
    const showModels = (v) => { menus.push(v); };
    const applyKey = new Function('bStatus', 'modelRow', 'modelSel', 'clearBtn', 'setBrainConfig', 'PROVIDER_LABEL', 'pickDefaultModel', 'fetch', 'document', 'canLive',
      '$', 'fillModels', 'showModels', 'prefModel', 'modelName', 'modelsSeq',
      `${detect}\n${src}\nreturn applyKey;`)(ui.bStatus, ui.modelRow, ui.modelSel, ui.clearBtn, (c) => saved.push(c),
      { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' }, (p, ms) => ms[0].id, fetch, { createElement: () => ({}) }, () => own,
      () => ({ value: 'anthropic' }), fillModels, showModels, () => null, (id) => id, 0);
    return { applyKey, saved, asked, ui, menus };
  };
  // build() asks for the saved key's models; Clear is pressed before they come
  const landings = {
    'a model list': (q) => q.answer({ models: [{ id: 'm-old', label: 'Old' }] }),
    'no models': (q) => q.answer({ models: [], error: 'key not accepted' }),
    'no network': (q) => q.fail(new TypeError('Failed to fetch')),
  };
  for (const [what, land] of Object.entries(landings)) {
    const { applyKey, saved, asked, ui, menus } = rig();
    const boot = applyKey('sk-ant-old', 'm-old');
    await applyKey('');
    land(asked[0]);
    await boot; await settle();
    assert.equal(saved.at(-1), null, `${what}: the cleared key was saved again`);
    assert.equal(ui.bStatus.textContent, 'No key saved.', what);
    assert.ok(ui.clearBtn.hidden, what);
    assert.deepEqual(menus.slice(0, 1), ['anthropic'], `${what}: the menu goes back to the provider's full list`);
    assert.notEqual(ui.modelSel.value, 'm-old', `${what}: the late answer does not fill the menu`);
  }
  // a new key typed while the saved one is still being looked up
  const { applyKey, saved, asked } = rig();
  const boot = applyKey('sk-ant-old', 'm-old');
  const typed = applyKey('sk-ant-new');
  asked[1].answer({ models: [{ id: 'm-new', label: 'New' }] });
  await typed;
  asked[0].answer({ models: [{ id: 'm-old', label: 'Old' }] });
  await boot; await settle();
  assert.deepEqual(saved.at(-1), { provider: 'anthropic', key: 'sk-ant-new', model: 'm-new' }, 'the key typed last is kept, whichever answer lands last');
  // clearing a key leaves nothing in use, and says so (the provider list above
  // the key, not this line, says what replies use instead)
  const own = rig(true);
  await own.applyKey('');
  assert.equal(own.saved.at(-1), null);
  assert.equal(own.ui.bStatus.textContent, 'No key saved.');
});

await ok('Kamera: the device list and the lend/borrow notes refresh while the Kamera tab shows, and only then', async () => {
  const src = cut('    if (link && lender && lendEl && borrowEl) {');
  const select = (first) => ({ value: '', options: [{ value: '', textContent: first }], on: {},
    set innerHTML(v) { this.options = []; }, appendChild(o) { this.options.push(o); }, addEventListener(t, f) { this.on[t] = f; } });
  const lendEl = select('not lending'), borrowEl = select('not borrowing');
  const lendNote = { textContent: '' }, borrowNote = { textContent: '' };
  let screens = [], asks = 0, borrowing = null, eye = { from: null };
  const fetch = async () => { asks += 1; return { json: async () => ({ screens }) }; };
  const link = { id: 'mac', borrowing: () => borrowing, status: () => eye, onState() {}, onLend() {}, borrow(id) { borrowing = id; }, release() { borrowing = null; } };
  const lender = { to: () => null, status: () => ({}), start() {}, stop() {} };
  let tick = null;
  const modal = { hidden: false }, doc = { hidden: false, createElement: () => ({}) }, onPaneShown = {};
  const pane = new Function('link', 'lender', 'lendEl', 'lendNote', 'borrowEl', 'borrowNote', 'handsEl', 'modal', 'document', 'onPaneShown', 'fetch', 'setInterval', 'window',
    `let shownPane = 'kamera';\n${src}\nreturn (p) => { shownPane = p; };`)(
    link, lender, lendEl, lendNote, borrowEl, borrowNote, null, modal, doc, onPaneShown, fetch, (fn) => { tick = fn; }, {});
  await settle();
  assert.equal(lendNote.textContent, 'No other device of yours is signed in right now.');
  // the phone signs in while the Mac's Kamera tab is open
  screens = [{ deviceId: 'phone', label: 'Phone', watching: true }];
  tick(); await settle();
  assert.deepEqual(borrowEl.options.map((o) => o.value), ['', 'phone'], 'the phone shows up without a tab switch');
  assert.equal(lendNote.textContent, '', 'and the note no longer says there is no other device');
  // borrowing it: the note follows the frames as they arrive
  borrowEl.value = 'phone';
  borrowEl.on.change();
  assert.equal(borrowNote.textContent, 'Asking…');
  eye = { from: 'phone', seeing: true, hands: 0, frames: 12 };
  tick();
  assert.match(borrowNote.textContent, /^Receiving 12 frames/);
  eye = { ...eye, frames: 40 };
  tick();
  assert.match(borrowNote.textContent, /^Receiving 40 frames/);
  // nobody looking: another tab, a closed sheet, a hidden page
  borrowing = null;
  const before = asks;
  pane('room'); tick();
  modal.hidden = true; pane('kamera'); tick();
  modal.hidden = false; doc.hidden = true; tick();
  assert.equal(asks, before, 'no fetch while nobody can see the list');
  doc.hidden = false;
  // coming back to the tab brings the notes up to date at once
  borrowing = 'phone';
  eye = { ...eye, frames: 55 };
  onPaneShown.kamera();
  assert.match(borrowNote.textContent, /^Receiving 55 frames/);
  const room = SET.slice(SET.indexOf('onPaneShown.room'), SET.indexOf('\n', SET.indexOf('onPaneShown.room')));
  assert.ok(!/refreshScreens|fill\(/.test(room), 'showing Room, where these controls are not, fetches nothing for them');
});

await ok('Voice: a row from the old service\'s list, and a key pasted just before switching, stay with their own service', async () => {
  // Service switched to Cartesia; the ElevenLabs rows are still on screen
  let stored = { voiceId: 'browser', provider: 'cartesia', models: { elevenlabs: 'eleven_v4' }, settings: {} };
  const getActive = () => JSON.parse(JSON.stringify(stored));
  const setActive = (a) => { stored = a; };
  const selectVoice = new Function('getActive', 'setActive', 'document', 'syncDefaultsSummary', 'syncDelivery', 'browsing',
    `${cut('  function selectVoice(', '\n  }\n')}\nreturn selectVoice;`)(getActive, setActive, { querySelectorAll: () => [] }, () => {}, () => {}, 'cartesia');
  selectVoice('rachel', 'Rachel', 'elevenlabs');
  assert.deepEqual([stored.voiceId, stored.provider], ['rachel', 'elevenlabs'], 'saved under the service it was listed by');
  const asked = [], spokeOn = [];
  const sample = new Function('getActive', 'fetch', 'voiceKeyHeader', 'SAMPLE', 'window', 'URL', 'Audio', 'playExclusive', 'browsing', '$', 'voiceSpoke',
    `${cut('  async function sample(', '\n  }\n')}\nreturn sample;`)(getActive, async (url, o) => { asked.push(o); return { ok: true, status: 200, blob: async () => ({}) }; },
    (p) => ({ 'x-voice-key': 'key-' + p }), 'Hello.', {}, { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, class { }, () => {}, 'cartesia', () => null, (p) => spokeOn.push(p));
  await sample('rachel', { disabled: false }, 'elevenlabs');
  assert.deepEqual(spokeOn, ['elevenlabs'], 'a sample that sounds is that service speaking again');
  assert.equal(JSON.parse(asked[0].body).provider, 'elevenlabs', '▶ asks the row\'s own service');
  assert.equal(JSON.parse(asked[0].body).model, 'eleven_v4');
  assert.equal(asked[0].headers['x-voice-key'], 'key-elevenlabs');
  // each row is made knowing its service, and passes it on
  const row = cut('  function voiceRow(', '\n  }\n');
  assert.match(row, /selectVoice\(v\.id, v\.name, p\)/);
  assert.match(row, /sample\(v\.id, play, p\)/);
  const load = cut('    async function loadVoiceList() {');
  assert.equal((load.match(/voiceRow\([^;]*, p\)\)/g) || []).length, 3, 'the browser row, your voices and the Default drawer');
  assert.match(SET, /voiceRow\(\{ id: r\.voice_id[^;]*'elevenlabs'\)/, 'a designed voice is ElevenLabs\'s, whatever is browsed when it saves');
  // the Model select still holds ElevenLabs's models while Cartesia's load
  assert.match(load, /modelsSeen\[p\] = data\.models \|\| \[\];\n\s*vModelFor = p;/);
  const vModelSel = { value: 'eleven_v4_turbo', on: {}, addEventListener(t, f) { this.on[t] = f; } };
  new Function('getActive', 'setActive', 'vModelSel', 'syncDelivery', 'vModelFor', 'browsing', cut("    vModelSel.addEventListener('change'", '\n    });\n'))(
    getActive, setActive, vModelSel, () => {}, 'elevenlabs', 'cartesia');
  vModelSel.on.change();
  assert.deepEqual(stored.models, { elevenlabs: 'eleven_v4_turbo' }, 'a model is remembered for the service it belongs to');

  // a key pasted for OpenAI, then Service switched inside the half second
  const keys = { openai: '', cartesia: 'c-key' };
  const timers = [];
  const field = (value) => ({ value, on: {}, addEventListener(t, f) { this.on[t] = f; } });
  const voiceKeyEl = field(''), providerSel = field('openai');
  const wire = new Function('voiceKeyEl', 'providerSel', 'setVoiceKey', 'getVoiceKey', 'loadVoiceList', 'serviceOf', 'VOICE_SERVICES', 'setTimeout', 'clearTimeout',
    `let browsing = 'openai';\n${cut('    const showService = () => {', '\n    };\n')}${cut('    let vkTimer = null;', '\n    });\n')}${cut("    providerSel.addEventListener('change'", '\n    });\n')}`);
  wire(voiceKeyEl, providerSel, (k, p) => { keys[p] = k; }, (p) => keys[p] || '', () => {}, (p) => p,
    { openai: { hint: '' }, cartesia: { hint: '' } },
    (fn) => { timers.push({ fn, live: true }); return timers.length; }, (id) => { if (timers[id - 1]) timers[id - 1].live = false; });
  voiceKeyEl.value = 'sk-pasted';
  voiceKeyEl.on.input();
  providerSel.value = 'cartesia';
  providerSel.on.change();
  for (const t of timers) if (t.live) t.fn();
  assert.equal(keys.openai, 'sk-pasted', 'the pasted key is kept, for OpenAI');
  assert.equal(keys.cartesia, 'c-key', 'and Cartesia\'s is untouched');
  assert.equal(voiceKeyEl.value, 'c-key', 'the field shows the service now chosen');
});

// --- the site's voice allowance, in the page -------------------------------------
// voice.js runs in a page; here it gets just enough of one: a speechSynthesis
// that says each line at once, an AudioContext it never plays through, and a
// fetch that answers the way /api/voice/tts does once the day is spent.
console.log('\nthe site\'s voice, used up:');
{
  const USED_UP = "Today's voice on the site's account is used up. It resets at midnight UTC, or add your own voice key in settings.";
  const realFetch = globalThis.fetch, realWarn = console.warn, realNow = Date.now;
  const spoken = [], asked = [], store = {};
  let answer = null;
  // A sentence the service does speak is decoded and played at once.
  const played = [];
  globalThis.window = {
    speechSynthesis: { speak(u) { spoken.push(u.text); u.onend?.(); }, getVoices: () => [], cancel() {} },
    AudioContext: class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      async decodeAudioData() { return { duration: 0.01 }; }
      createAnalyser() { return { fftSize: 0, frequencyBinCount: 4, connect() {}, disconnect() {}, getByteTimeDomainData() {} }; }
      createBufferSource() { const s = { connect() {}, stop() {}, start() { played.push(1); setTimeout(() => s.onended?.(), 0); } }; return s; }
    },
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true,
    value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
  globalThis.fetch = async (url, o) => { asked.push({ headers: o.headers, body: JSON.parse(o.body) }); return answer(); };
  const refusal = (error, status = 429) => () => ({ ok: false, status, json: async () => ({ error }) });
  console.warn = () => {}; // each failed sentence is logged on its way to the browser voice
  try {
    const V = await import('../src/voice.js');
    const { createVoice, houseVoiceResting, readRefusal } = V;
    const notices = [];
    const voice = createVoice({ onNotice: (m) => notices.push(m) });
    const reply = (lines, { voiceId = 'pre-roger', provider = 'elevenlabs' } = {}) => new Promise((done) => {
      const sp = voice.speaker({ voiceId, provider, onEnd: done });
      for (const l of lines) sp.push(l);
      sp.end();
    });

    await ok('the per-minute limiter\'s 429 is not the day\'s allowance: nothing rests, nothing is told', async () => {
      answer = refusal('rate limited');
      await reply(['One moment.']);
      assert.deepEqual(spoken, ['One moment.'], 'still spoken, by the browser');
      assert.equal(notices.length, 0);
      assert.equal(houseVoiceResting('elevenlabs'), '');
      await reply(['And again.']);
      assert.equal(asked.length, 2, 'the next reply asks again');
    });

    await ok('used up: told once, every word still spoken, and the site\'s voice not asked again until midnight', async () => {
      asked.length = 0; spoken.length = 0;
      answer = refusal(USED_UP);
      await reply(['Hello there.', 'How are you today?']);
      assert.deepEqual(spoken, ['Hello there.', 'How are you today?'], 'the browser voice says the whole reply');
      assert.deepEqual(notices, [USED_UP], 'the server\'s own words, once');
      assert.equal(asked.length, 1);
      await reply(['A second reply.']);
      await reply(['A heartbeat line.']);
      assert.deepEqual(spoken.slice(2), ['A second reply.', 'A heartbeat line.']);
      assert.equal(asked.length, 1, 'no request that could only be refused');
      assert.equal(notices.length, 1, 'not told again on every reply');
      assert.equal(await voice.speakAudio('Hi.', 'pre-roger', {}, { provider: 'elevenlabs' }), false, 'speakAudio hands it to the browser voice too');
      assert.equal(asked.length, 1);
      assert.equal(houseVoiceResting('elevenlabs'), USED_UP);
    });

    await ok('the page shows the notice as a toast held long enough to read, not as the presence\'s caption', () => {
      const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
      const at = main.indexOf('const voice = createVoice({');
      assert.ok(at >= 0, 'main.js makes the voice');
      const made = main.slice(at, main.indexOf('\n});\n', at));
      const hold = made.match(/onNotice: \(said\) => toast\(said, Math\.max\((\d+), said\.length \* (\d+)\)\)/);
      assert.ok(hold, 'main.js hands onNotice to the toast');
      assert.ok(Number(hold[1]) >= USED_UP.length * 60, 'about a second for every sixteen characters');
      assert.ok(Number(hold[2]) >= 60, 'and a longer notice (voice.js refusalNotice) longer');
      assert.match(main, /function toast\(msg, ms = 3200\) \{[^}]*setTimeout\([^\n]*, ms\);/);
    });

    await ok('a key of your own, or another service, is never held back by the site\'s rest; midnight lifts it', async () => {
      asked.length = 0;
      answer = refusal('voice service unavailable', 502);
      await reply(['Mine.'], { voiceId: 'nova', provider: 'openai' });
      assert.equal(asked.length, 1, 'OpenAI is asked');
      store['y3k.voicekey'] = 'el-mine';
      assert.equal(houseVoiceResting('elevenlabs'), '');
      await reply(['Mine too.']);
      assert.equal(asked.length, 2, 'your own ElevenLabs key is asked');
      assert.equal(asked[1].headers['x-voice-key'], 'el-mine');
      delete store['y3k.voicekey'];
      assert.equal(houseVoiceResting('elevenlabs'), USED_UP, 'without it, the site\'s voice is still resting');
      Date.now = () => realNow() + 25 * 3600e3;
      assert.equal(houseVoiceResting('elevenlabs'), '', 'a new day');
      await reply(['Morning.']);
      assert.equal(asked.length, 3, 'and the site\'s voice is asked again');
    });

    await ok('Settings: ▶ says why, and the Voice and Usage panes show the day\'s numbers', async () => {
      Date.now = realNow;
      // ▶ on a voice once the day is spent: the server's words, as text
      const els = {};
      const $ = (id) => (els[id] ||= { id, textContent: '', innerHTML: '', hidden: false, classList: { remove() {} }, querySelectorAll: () => [] });
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const sample = new Function('getActive', 'fetch', 'voiceKeyHeader', 'SAMPLE', 'window', 'URL', 'Audio', 'playExclusive', 'browsing', '$',
        'readRefusal', 'noteRefusal', 'voiceSpoke', 'sayVoiceStatus', 'esc',
        `${cut('  async function sample(', '\n  }\n')}\nreturn sample;`)(() => ({ settings: {}, models: {} }), async () => refusal('<b>' + USED_UP)(),
        () => ({}), 'Hello.', {}, {}, class { }, () => {}, 'elevenlabs', $,
        readRefusal, () => assert.fail('the day\'s allowance is not a service refusal'), () => assert.fail('nothing spoke'), (html) => { $('voice-status').innerHTML = html; }, esc);
      const play = { disabled: false };
      await sample('pre-roger', play, 'elevenlabs');
      assert.equal(els['voice-status'].innerHTML, '&lt;b&gt;' + USED_UP, 'said in #voice-status, escaped');
      assert.equal(play.disabled, false);

      // the house numbers from /api/usage
      let usage = null, resting = '';
      const empty = { requests: 0, in: 0, out: 0, cost: 0 };
      const pane = new Function('$', 'fetch', 'houseVoiceResting', 'esc', 'reducedMotion', 'animate',
        `${cut('  let house = null;', '\n  }\n')}\n${cut('  const money = (n)', '\n  }\n')}\nreturn { refreshUsage, onHouse: (b) => { listOnHouse = b; syncHouseVoice(); } };`)(
        $, async () => ({ json: async () => usage }), () => resting, (s) => String(s), () => true, () => {});
      const day = (voice, extra = {}) => ({ usage: { lifetime: empty, today: empty, byDay: [], byModel: [] },
        house: { founder: false, brain: { spentUsd: 0.42, capUsd: 2, siteResting: false }, voice, resets: 'UTC midnight', ...extra } });
      pane.onHouse(true);
      usage = day({ usedChars: 20000, capChars: 20000, siteResting: false });
      await pane.refreshUsage();
      assert.match(els['usage-panel'].innerHTML, /site voice<\/span> 20,000 of 20,000 characters today/);
      assert.match(els['usage-panel'].innerHTML, /site brain<\/span> \$0\.42 of \$2\.00 today/);
      assert.match(els['usage-panel'].innerHTML, /reset at UTC midnight/);
      assert.equal(els['voice-house'].hidden, false);
      assert.match(els['voice-house'].textContent, /^On the site's voice today: 20,000 of 20,000 characters\. It resets at UTC midnight/);
      // once a reply has been refused, the server's own words
      resting = USED_UP;
      pane.onHouse(true);
      assert.equal(els['voice-house'].textContent, USED_UP);
      resting = '';
      // the person's numbers look fine, but the whole site is spent
      usage = day({ usedChars: 300, capChars: 20000, siteResting: true });
      await pane.refreshUsage();
      assert.match(els['usage-panel'].innerHTML, /300 of 20,000 characters today · resting for everyone until UTC midnight/);
      assert.match(els['voice-house'].textContent, /resting for everyone/);
      // listing another service, or with a key of your own: not the site's voice
      pane.onHouse(false);
      assert.ok(els['voice-house'].hidden && !els['voice-house'].textContent);
      // the founder has no allowance; signed out, there is nothing to show
      pane.onHouse(true);
      usage = day({ usedChars: 0, capChars: 20000, siteResting: false }, { founder: true });
      await pane.refreshUsage();
      assert.ok(!/site voice|site brain/.test(els['usage-panel'].innerHTML));
      assert.equal(els['voice-house'].hidden, true);
      usage = { error: 'sign in' };
      await pane.refreshUsage();
      assert.equal(els['usage-panel'].textContent, 'Sign in to see your usage.');
      assert.equal(els['voice-house'].hidden, true);
      // the Voice pane says which list it is: the site's voices, or not
      const load = cut('    async function loadVoiceList() {');
      assert.match(load, /listOnHouse = !!\(data\.available && data\.house\);\n\s*syncHouseVoice\(\);\n\s*if \(!data\.available\)/);
    });

    // --- why the voice changed ----------------------------------------------
    console.log('\nwhy the voice changed, in the page:');
    Date.now = realNow;
    store['y3k.voicekey'] = 'el-mine';   // ElevenLabs on a key of your own: the site's rest never applies
    const said = [];
    const v2 = createVoice({ onNotice: (m) => said.push(m) });
    // what /api/voice/tts answers when the service said no (server.mjs)
    const no = (reason, provider, extra = {}) => () => ({ ok: false, status: 502,
      json: async () => ({ error: 'fixed sentence', reason, provider, upstream: 401, house: false, ...extra }) });
    const sound = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) });
    const say = (line, provider, voiceId = 'v-1') => new Promise((done) => {
      const sp = v2.speaker({ voiceId, provider, onEnd: done });
      sp.push(line); sp.end();
    });
    const CREDITS_EL = "ElevenLabs says your account is out of characters. Your presence is using the browser's voice until you top up or choose another in Settings → Voice.";

    await ok('a refusal is told once per service and reason in this tab, and every word is still spoken', async () => {
      spoken.length = 0; asked.length = 0;
      answer = no('credits', 'elevenlabs');
      await say('Hello there.', 'elevenlabs');
      await say('Still here.', 'elevenlabs');
      assert.deepEqual(spoken, ['Hello there.', 'Still here.'], 'the browser voice says each one');
      assert.equal(asked.length, 2, 'each reply asks the service first');
      assert.deepEqual(said, [CREDITS_EL], 'told once');
      answer = no('key', 'elevenlabs');
      await say('Again.', 'elevenlabs');
      assert.equal(said.length, 2, 'another reason is news');
      assert.match(said[1], /^ElevenLabs did not accept your key\. /);
      answer = no('credits', 'openai');
      await say('Hi.', 'openai', 'nova');
      assert.equal(said[2], "OpenAI says your account is out of credits. Your presence is using the browser's voice until you top up or choose another in Settings → Voice.");
      // a second voice in the same tab (airden's, a reply's) does not tell it again
      const v3 = createVoice({ onNotice: (m) => said.push(m) });
      await new Promise((done) => { const sp = v3.speaker({ voiceId: 'nova', provider: 'openai', onEnd: done }); sp.push('Once more.'); sp.end(); });
      assert.equal(said.length, 3);
    });

    await ok('rate and down are told only when three sentences in a row are refused; one that speaks starts the count again', async () => {
      said.length = 0;
      answer = no('rate', 'cartesia');
      await say('One.', 'cartesia'); await say('Two.', 'cartesia');
      assert.equal(said.length, 0, 'two in a row pass without a word');
      answer = sound;
      await say('Three, heard.', 'cartesia');
      assert.equal(spoken.at(-1), 'Two.', 'that one was the service\'s own voice');
      answer = no('rate', 'cartesia');
      await say('Four.', 'cartesia'); await say('Five.', 'cartesia');
      assert.equal(said.length, 0, 'the count started again');
      await say('Six.', 'cartesia');
      assert.deepEqual(said, ["Cartesia says too many requests are being made at once. Your presence is using the browser's voice until it accepts them again."]);
      await say('Seven.', 'cartesia');
      assert.equal(said.length, 1, 'and not again');
      // another service keeps its own count (OpenAI's starts again here: its
      // credits were refused twice above, and those count too)
      answer = sound;
      await say('Heard.', 'openai', 'nova');
      answer = no('down', 'openai', { upstream: 503 });
      await say('A.', 'openai', 'nova'); await say('B.', 'openai', 'nova');
      assert.equal(said.length, 1, 'two in a row on OpenAI');
      answer = no('down', 'cartesia', { upstream: 0 });
      await say('C.', 'cartesia');
      assert.equal(said.at(-1), "Cartesia could not speak the last three sentences. Your presence is using the browser's voice until it answers again.",
        'Cartesia had three refusals in a row, of either reason');
      answer = no('down', 'openai', { upstream: 503 });
      await say('D.', 'openai', 'nova');
      assert.equal(said.at(-1), "OpenAI could not speak the last three sentences. Your presence is using the browser's voice until it answers again.");
    });

    await ok('Settings: the last refusal is kept with its time until that service speaks again', async () => {
      const seen = [];
      const unwatch = V.watchRefusal((x) => seen.push(x));
      answer = no('voice', 'elevenlabs', { upstream: 404 });
      await say('Where did it go?', 'elevenlabs');
      const kept = V.lastRefusal();
      assert.deepEqual({ ...kept, at: 0 }, { provider: 'elevenlabs', reason: 'voice', upstream: 404, house: false, at: 0 });
      assert.ok(Math.abs(kept.at - Date.now()) < 5000);
      assert.equal(seen.at(-1), kept, 'the pane is told as it happens');
      V.voiceSpoke('openai');
      assert.equal(V.lastRefusal(), kept, 'another service speaking does not clear it');
      answer = sound;
      await say('Here it is.', 'elevenlabs');
      assert.equal(V.lastRefusal(), null, 'ElevenLabs spoke: it goes');
      assert.equal(seen.at(-1), null);
      unwatch();
      // the line itself
      const at = new Date(2026, 9, 8, 14, 2).getTime();
      const line = (x) => V.refusalLine({ provider: 'elevenlabs', reason: 'credits', upstream: 401, house: false, at, ...x });
      assert.equal(line(), 'Last answer from ElevenLabs, 14:02: out of characters.');
      assert.equal(line({ house: true }), "Last answer from ElevenLabs, 14:02: out of characters (the site's account).");
      assert.equal(line({ provider: 'openai' }), 'Last answer from OpenAI, 14:02: out of credits.');
      assert.equal(line({ reason: 'key' }), 'Last answer from ElevenLabs, 14:02: key not accepted.');
      assert.equal(line({ reason: 'voice' }), 'Last answer from ElevenLabs, 14:02: voice not found.');
      assert.equal(line({ reason: 'rate' }), 'Last answer from ElevenLabs, 14:02: too many requests.');
      assert.equal(line({ reason: 'down', upstream: 503 }), 'Last answer from ElevenLabs, 14:02: error 503.', 'the status code, here only');
      assert.equal(line({ reason: 'down', upstream: 0, provider: 'cartesia' }), 'Last try with Cartesia, 14:02: no answer.');
      assert.equal(V.refusalLine(null), '');
    });

    await ok('Settings → Voice shows it under the list\'s line, and ▶ notes its own without a toast', async () => {
      const els = {};
      const $ = (id) => (els[id] ||= { id, innerHTML: '' });
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const sayVoiceStatus = new Function('$', 'esc', 'refusalLine', 'lastRefusal', 'watchRefusal',
        `${cut('  let voiceSaid = ', '\n  watchRefusal(() => sayVoiceStatus());\n')}\nreturn sayVoiceStatus;`)($, esc, V.refusalLine, V.lastRefusal, V.watchRefusal);
      sayVoiceStatus(esc('Choose a voice.'));
      assert.equal(els['voice-status'].innerHTML, 'Choose a voice.');
      // ▶ on a voice whose key was refused
      const before = said.length;
      const sample = new Function('getActive', 'fetch', 'voiceKeyHeader', 'SAMPLE', 'window', 'URL', 'Audio', 'playExclusive', 'browsing', '$',
        'readRefusal', 'noteRefusal', 'voiceSpoke', 'sayVoiceStatus', 'esc',
        `${cut('  async function sample(', '\n  }\n')}\nreturn sample;`)(() => ({ settings: {}, models: {} }), async () => no('key', 'cartesia')(),
        () => ({}), 'Hello.', {}, {}, class { }, () => {}, 'cartesia', $, V.readRefusal, V.noteRefusal, V.voiceSpoke, sayVoiceStatus, esc);
      await sample('c-en', { disabled: false }, 'cartesia');
      assert.match(els['voice-status'].innerHTML, /^Choose a voice\.<div class="voice-last">Last answer from Cartesia, \d\d:\d\d: key not accepted\.<\/div>$/);
      assert.equal(said.length, before, 'no toast for ▶');
      // the list is drawn again (a key typed, the service switched): the line stays
      sayVoiceStatus('Add an <code>Cartesia</code> key above to use its voices.');
      assert.match(els['voice-status'].innerHTML, /<\/code> key above to use its voices\.<div class="voice-last">Last answer from Cartesia/);
      // a reply on Cartesia speaks: it goes, with the sheet open
      answer = sound;
      await say('Fine now.', 'cartesia');
      assert.equal(els['voice-status'].innerHTML, 'Add an <code>Cartesia</code> key above to use its voices.');
      // the list writes through sayVoiceStatus, never straight into #voice-status
      const load = cut('    async function loadVoiceList() {');
      assert.ok(!/status\.(textContent|innerHTML)|\$\('voice-status'\)/.test(load));
      assert.equal((load.match(/sayVoiceStatus\(/g) || []).length, 2);
    });

    await ok('readRefusal reads only what the route sends: a known service and one of the five reasons', async () => {
      const read = (status, body) => readRefusal({ status, json: async () => (body instanceof Error ? Promise.reject(body) : body) });
      assert.deepEqual(await read(502, { error: 'x', reason: 'credits', provider: 'openai', upstream: '429', house: 'yes' }),
        { usedUp: '', no: { provider: 'openai', reason: 'credits', upstream: 429, house: false } });
      assert.equal((await read(502, { reason: 'credits', provider: 'toString' })).no, null);
      assert.equal((await read(502, { reason: 'constructor', provider: 'openai' })).no, null);
      assert.equal((await read(502, { error: 'voice service unavailable' })).no, null);
      assert.deepEqual(await read(502, new SyntaxError('not json')), { usedUp: '', no: null });
      assert.deepEqual(await read(429, { error: 'rate limited' }), { usedUp: '', no: null }, 'the per-minute limiter');
      assert.equal((await read(429, { error: USED_UP })).usedUp, USED_UP);
    });

    await ok('every notice is plain: no em dash, the service by name, and what happens next', () => {
      assert.deepEqual(V.VOICE_NAMES, Object.fromEntries(Object.entries(VOICE_PROVIDERS).map(([k, x]) => [k, x.name])), 'the server\'s names');
      assert.deepEqual(V.VOICE_SPENT, SPENT);
      for (const provider of Object.keys(VOICE_PROVIDERS)) {
        for (const reason of REFUSALS) {
          for (const house of [false, true]) {
            const n = V.refusalNotice({ provider, reason, house });
            assert.ok(!/—|–/.test(n), n);
            assert.ok(n.startsWith(VOICE_PROVIDERS[provider].name) || n.startsWith("The site's " + VOICE_PROVIDERS[provider].name), n);
            assert.match(n, /Your presence is using the browser's voice until /, n);
          }
        }
      }
      assert.equal(V.refusalNotice({ provider: 'elevenlabs', reason: 'credits', house: false }), CREDITS_EL);
      assert.equal(V.refusalNotice({ provider: 'elevenlabs', reason: 'credits', house: true }),
        "The site's ElevenLabs account is out of characters. Your presence is using the browser's voice until it is topped up, or until you add a key of your own in Settings → Voice.");
      assert.equal(V.refusalNotice({ provider: 'cartesia', reason: 'voice' }),
        "Cartesia could not find the voice you chose. Your presence is using the browser's voice until you choose another in Settings → Voice.");
      delete store['y3k.voicekey'];
    });
  } finally {
    globalThis.fetch = realFetch; console.warn = realWarn; Date.now = realNow;
    delete globalThis.window; delete globalThis.SpeechSynthesisUtterance; delete globalThis.localStorage;
    delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
  }
}

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

  await ok('a refused sentence says why, in a fixed sentence; the service\'s own words stay in the server log', async () => {
    // [service, key, voice, reason, the service's status]  (test/fakes/voice-upstream.mjs REFUSED)
    const cases = [
      ['elevenlabs', 'el-empty', 'own-nb', 'credits', 401],
      ['elevenlabs', 'bad-key', 'own-nb', 'key', 401],
      ['elevenlabs', 'el-mine', 'gone', 'voice', 404],
      ['elevenlabs', 'el-mine', 'gone400', 'voice', 400],
      ['elevenlabs', 'busy-key', 'own-nb', 'rate', 429],
      ['openai', 'sk-empty', 'nova', 'credits', 429],
      ['openai', 'busy-key', 'nova', 'rate', 429],
      ['openai', 'bad-key', 'nova', 'key', 401],
      ['cartesia', 'c-empty', 'c-en', 'credits', 402],
      ['cartesia', 'c-banned', 'c-en', 'key', 403],
      ['cartesia', 'c-mine', 'c-gone', 'voice', 404],
      ['cartesia', 'down-key', 'c-en', 'down', 503],
      ['openai', 'teapot-key', 'nova', 'down', 418],
      ['elevenlabs', 'offline-key', 'own-nb', 'down', 0],
    ];
    for (const [provider, key, voiceId, reason, upstream] of cases) {
      const r = await post('/api/voice/tts', { text: 'Hi.', voiceId, provider }, { headers: { 'x-voice-key': key } });
      const raw = await r.text();
      assert.equal(r.status, 502, `${provider} ${key}`);
      assert.deepEqual(JSON.parse(raw), { error: refusalError(provider, reason), reason, provider, upstream, house: false }, `${provider} ${key}`);
      assert.ok(!/acct-42|quota of|remaining|billing|teapot|invalid key|fetch failed/i.test(raw), raw);
    }
  });

  await ok('the site\'s account out of characters: said as the site\'s, and the day is not charged for it', async () => {
    const used = async () => (await get('/api/usage', { cookie: someone }).then((r) => r.json())).house.voice.usedChars;
    const before = await used();
    const r = await post('/api/voice/tts', { text: 'x'.repeat(50), voiceId: 'spent' }, { cookie: someone });
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { error: "ElevenLabs says the site's account is out of characters.", reason: 'credits', provider: 'elevenlabs', upstream: 401, house: true });
    assert.equal(await used(), before, 'a refused sentence spoke nothing');
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
