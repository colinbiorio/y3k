// THE CLIENT, AFTER A READ-THROUGH (2026-10-08). Run: node test/client-audit.test.mjs
//
// Ten things the browser client did, each found by reading it and confirmed by
// a second reading: a saved key put back in use behind a menu that said Site
// default (a menu entry gone since 2026-10-12, with the site's own key; a
// stale pick of it still puts nothing in use); keys, voice keys and the hours left behind for the next account; a
// second paid call after a reply that had already spoken; an input method's
// Enter sending half a word; a tab that was not broadcasting sending its lines
// to the live audience; your memories drawn on another presence's orb; the
// hours starting while someone listened; a visited body worn home; the game's
// turns dropped after any visit; and a black curtain without WebGL2.
//
// Run as behaviour where it can be: brain.js and tend.js are imported (tend.js
// with its import of main.js pointed at a stand-in), and the parts of
// settings.js and main.js that decide are cut out of their source and run
// against stand-ins, as shapes.test.mjs and voice.test.mjs do.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const defer = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
const answer = (d) => ({ ok: true, json: async () => d });

// The page's storage, walkable the way forgetAccount walks it (length, key(i)).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const listeners = {};
globalThis.window = {
  addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
  removeEventListener() {},
  dispatchEvent: (e) => { for (const f of listeners[e.type] || []) f(e); return true; },
};
let route = async () => ({ ok: false, json: async () => ({}) });
globalThis.fetch = (url, o) => route(String(url), o);

const brain = await import('../src/brain.js');
const ownBrain = await import('../src/own-brain.js');

// a recorder: every call on it is kept, in order, as [name, ...args]
const recorder = (calls) => new Proxy({}, { get: (_, k) => (...a) => { calls.push([String(k), ...a]); } });

// =============================================================================
console.log('keys stay with the account that saved them:');

const ACCOUNT_STATE = {
  'y3k.brain': JSON.stringify({ provider: 'anthropic', key: 'sk-ant-a', model: 'm' }),
  'y3k.brainKeys': JSON.stringify({ anthropic: { key: 'sk-ant-a', model: 'm' } }),
  'y3k.brainPick': 'anthropic', 'y3k.brainModels': '{}', 'y3k.ownBrain': '{"provider":"claude"}', 'y3k.ownModel': '{}',
  'y3k.hours': 'on', 'y3k.hours.turn': '3', 'y3k.hours.lease': '{}',
  'y3k.voicekey': 'el-a', 'y3k.voicekey.openai': 'sk-voice-a', 'y3k.voicekey.cartesia': 'c-a',
  'y3k.lichess': '{"token":"lip_a"}', 'y3k.lichess.bot': '{"token":"lip_bot"}', 'y3k.lichess.pkce': '{}',
};
const THE_BROWSERS = { 'y3k.room': '{"env":"metal"}', 'y3k.gfx.mode': 'auto', 'y3k.voice': '{"id":"x"}', 'y3k.camview': '1' };
const fill = () => { store.clear(); for (const [k, v] of Object.entries({ ...ACCOUNT_STATE, ...THE_BROWSERS })) store.set(k, v); };
const leftOf = () => Object.keys(ACCOUNT_STATE).filter((k) => store.has(k));

await ok('signing out forgets every key, the hours and the choices made with them, and nothing else', () => {
  fill();
  brain.forgetAccount();
  assert.deepEqual(leftOf(), [], 'still in this browser after sign-out');
  for (const k of Object.keys(THE_BROWSERS)) assert.ok(store.has(k), k + ' is this browser\'s, not the account\'s, and went too');
  assert.equal(brain.getBrainConfig(), null);
  assert.equal(brain.keyFor('anthropic'), null);
});

await ok('a different account at the door finds nothing of the last one; the same account keeps its own', () => {
  fill();                                   // kept before y3k.owner existed: no owner
  brain.claimBrowser({ id: 'a' });
  assert.equal(leftOf().length, Object.keys(ACCOUNT_STATE).length, 'keys with no owner yet were thrown away on the first sign-in');
  assert.equal(store.get('y3k.owner'), 'a');
  brain.claimBrowser({ id: 'a' });          // a reload
  assert.equal(brain.getBrainConfig()?.key, 'sk-ant-a', 'its own key was forgotten on its own return');
  brain.claimBrowser({ id: 'b' });          // a's session ran out; b signs in
  assert.deepEqual(leftOf(), [], 'b can spend or read what a left');
  assert.equal(store.get('y3k.owner'), 'b');
  for (const k of Object.keys(THE_BROWSERS)) assert.ok(store.has(k));
});

await ok('a guest walking in after an account finds nothing of it either', () => {
  fill(); store.set('y3k.owner', 'a');
  brain.claimBrowser(null);
  assert.deepEqual(leftOf(), [], 'a guest can spend what an account left');
  assert.equal(store.get('y3k.owner'), 'guest');
  fill(); store.set('y3k.owner', 'guest');
  brain.claimBrowser({ id: 'a' });
  assert.deepEqual(leftOf(), [], 'an account inherits what a guest typed in');
});

await ok('every name the client keeps a key or the hours under is one sign-out forgets', () => {
  const b = read('src/brain.js');
  const list = b.slice(b.indexOf('const ACCOUNT_KEYS'), b.indexOf('const OWNER_KEY'));
  // where each is written, and the name it is written under
  assert.match(read('src/voice.js'), /const VOICE_KEY = 'y3k\.voicekey';/);
  assert.match(list, /ACCOUNT_PREFIXES = \['y3k\.voicekey'\]/);
  assert.match(read('src/chess.js'), /const HUMAN_KEY = 'y3k\.lichess';[\s\S]*const BOT_KEY = 'y3k\.lichess\.bot';/);
  assert.match(read('src/own-brain.js'), /const KEY = 'y3k\.ownBrain';[\s\S]*const MODEL_KEY = 'y3k\.ownModel';/);
  assert.match(read('src/settings.js'), /const PICK = 'y3k\.brainPick';/);
  assert.match(read('src/settings.js'), /const MODELS_PREF = 'y3k\.brainModels';/);
  assert.match(read('src/tend.js'), /const LEASE_KEY = 'y3k\.hours\.lease';/);
  for (const k of ['y3k.brain', 'y3k.brainPick', 'y3k.brainModels', 'y3k.ownBrain', 'y3k.ownModel', 'y3k.hours', 'y3k.hours.turn', 'y3k.hours.lease', 'y3k.lichess', 'y3k.lichess.bot', 'y3k.lichess.pkce']) {
    assert.ok(list.includes(`'${k}'`), k + ' is not forgotten on sign-out');
  }
  assert.ok(list.includes('KEYS_KEY'), 'the kept keys are not forgotten on sign-out');
});

await ok('every way out forgets, and every way in claims, before anything reads a key', () => {
  const set = read('src/settings.js');
  const out = set.slice(set.indexOf("$('auth-signout').addEventListener"), set.indexOf('// --- Shelf'));
  assert.ok(/forgetAccount\(\);[^\n]*\n\s*location\.reload\(\);/.test(out), 'Settings → Sign out reloads without forgetting');
  const del = set.slice(set.indexOf("msg.textContent = 'Account deleted.';"), set.indexOf("msg.textContent = 'Account deleted.';") + 160);
  assert.ok(/forgetAccount\(\);/.test(del), 'a deleted account leaves its keys behind');
  const main = read('src/main.js');
  const terms = main.slice(main.indexOf('function askTerms()'), main.indexOf('// YOUR OWN SIGN-IN, OFFERED TO THE SITE'));
  assert.ok(/forgetAccount\(\);[^\n]*\n\s*location\.reload\(\);/.test(terms), 'the terms card\'s sign-out leaves the keys behind');
  const door = main.slice(main.indexOf('enterApp.now = function enterAppNow() {'), main.indexOf('remoteEye.start();'));
  assert.ok(/claimBrowser\(account\);/.test(door), 'entering does not check whose keys these are');
  // and the page says so where the key is pasted
  assert.match(set, /is never saved on the server\. Signing out removes it from this browser\./);
  assert.match(set, /stored in this browser only and removed when you sign out\./);
});

// =============================================================================
console.log('\na reply that already reached the person is not bought twice:');

const enc = new TextEncoder();
const sse = (events) => ({
  ok: true, headers: { get: () => 'text/event-stream' },
  body: new ReadableStream({ start(c) { for (const [ev, d] of events) c.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); c.close(); } }),
});
async function turn(events) {
  store.clear(); brain.resetHistory();
  // a key of the person's own: the site has none to answer with (2026-10-12)
  store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-turn', model: 'm' }));
  const asked = [];
  route = async (url) => {
    asked.push(url);
    if (url === '/api/health') return answer({ ownBrain: false });
    if (url === '/api/brain/stream') return sse(events);
    if (url === '/api/brain') return answer({ available: true, mood: 'calm', speech: 'A second reply.' });
    return { ok: false, json: async () => ({}) };
  };
  const heard = [], shapes = [], moods = [];
  const r = await brain.respondStream('hello', { onText: (t) => heard.push(t), onShape: (s) => shapes.push(s), onMood: (m) => moods.push(m) });
  return { r, heard: heard.join(''), shapes, moods, second: asked.filter((u) => u === '/api/brain').length, turns: brain.recentTurns(4) };
}

await ok('a stream that fails after its words were heard keeps them, and makes no second call', async () => {
  const t = await turn([['mood', { mood: 'tender' }], ['text', { text: 'Hello there. ' }], ['text', { text: 'I was saying' }], ['error', { error: 'overloaded' }]]);
  assert.equal(t.second, 0, 'the half-heard reply was bought again in full');
  assert.equal(t.heard, 'Hello there. I was saying');
  // what the person saw was the reply stopping, so it says so (upstream-why):
  // off the air, as a notice, never as a reply
  assert.equal(t.r.notice, true, 'a cut reply is not said as cut');
  assert.equal(t.r.why, 'dropped');
  assert.ok(t.turns.some((m) => m.role === 'assistant' && m.content.includes('Hello there. I was saying')), 'history does not hold what was heard: ' + JSON.stringify(t.turns));
  assert.ok(t.turns.some((m) => m.role === 'user' && m.content === 'hello'));
});

await ok('a reply in the body alone (a shape, no words) is a reply, not a failure', async () => {
  const t = await turn([['mood', { mood: 'excited' }], ['shape', { shape: { shape: 'heart' }, t0: 1 }], ['done', { mood: 'excited', speech: '', shape: { shape: 'heart' } }]]);
  assert.equal(t.second, 0, 'a shape-only answer bought a second call');
  assert.equal(t.shapes.length, 1);
  assert.equal(t.r.shape?.shape, 'heart');
  assert.equal(t.r.speech, '');
  assert.ok(t.turns.some((m) => m.role === 'assistant' && /answered with its body/.test(m.content)), 'a bare tag in history teaches it to answer without words');
});

await ok('a shape, then the stream drops: what was shown stands, no second call', async () => {
  const t = await turn([['mood', { mood: 'excited' }], ['shape', { shape: { shape: 'ring' } }], ['error', {}]]);
  assert.equal(t.second, 0);
  assert.equal(t.r.seeded, true);
  const p = await turn([['mood', { mood: 'calm' }], ['paint', { anchors: [{ dir: [0, 0, 1], rgb: [1, 0, 0] }] }]]);   // ends with no done
  assert.equal(p.second, 0, 'a painting, then a dropped stream, bought a second call');
});

await ok('nothing reached the person: the one call that answers is the second', async () => {
  const m = await turn([['mood', { mood: 'tender' }], ['error', {}]]);
  assert.equal(m.second, 1, 'a mood alone is not a reply');
  assert.equal(m.r.speech, 'A second reply.');
  // the server's rescue already failed on a wordless done with no shape, and
  // its memory writes count on this ask (server.mjs): that contract stays
  const w = await turn([['mood', { mood: 'calm' }], ['done', { mood: 'calm', speech: '' }]]);
  assert.equal(w.second, 1);
  const fine = await turn([['mood', { mood: 'calm' }], ['text', { text: 'Hi.' }], ['done', { mood: 'calm', speech: 'Hi.' }]]);
  assert.equal(fine.second, 0);
  assert.equal(fine.r.speech, 'Hi.');
});

// =============================================================================
console.log('\nSettings → Brain decides the provider once, and never behind the menu:');

const SET = read('src/settings.js');
const between = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i); assert.ok(i >= 0 && j > i, 'cannot find ' + a); return src.slice(i, j); };
const brainPane = between(SET, '    // --- Brain: the chosen provider;', '\n    // --- Voice: a service');
const helpers = between(SET, 'function detectProviderLocal(key) {', '// The voice services Settings');

function element(id) {
  const on = {};
  const el = {
    id, hidden: false, textContent: '', placeholder: '', checked: false, disabled: false, dataset: {}, options: [], _v: '',
    // a select keeps only a value one of its options has; an input keeps anything
    get value() { return this._v; },
    set value(v) { v = String(v ?? ''); this._v = this.options.length && !this.options.some((o) => o.value === v) ? '' : v; },
    set innerHTML(_) { this.options = []; },
    appendChild(o) { this.options.push(o); }, prepend(o) { this.options.unshift(o); },
    addEventListener(t, f) { (on[t] ||= []).push(f); }, fire(t) { for (const f of on[t] || []) f({ target: el }); },
    focus() {}, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    replaceChildren() {}, append() {}, querySelectorAll: () => [],
  };
  return el;
}
let liveNow = false;   // whether this page thinks for the site (own-brain.js ownLive), as the stand-in says
function openBrainPane({ pick = null, kept = null, inUse = null, own = null } = {}) {
  liveNow = false;
  listeners['y3k:own-brain-state'] = [];   // only this pane hears what own-brain.js says
  store.clear();
  if (pick) store.set('y3k.brainPick', pick);
  if (kept) store.set('y3k.brainKeys', JSON.stringify(kept));
  if (inUse) store.set('y3k.brain', JSON.stringify(inUse));
  if (own) store.set('y3k.ownBrain', JSON.stringify({ provider: own }));
  const els = {};
  const $ = (id) => (els[id] ||= element(id));
  const me = defer(), lookups = [];
  const fetch = (url) => {
    if (url === '/api/auth/me') return me.p;
    if (url === '/api/brain/models') { const d = defer(); lookups.push(d); return d.p; }
    return Promise.resolve(answer({}));
  };
  const stubs = {
    $, fetch, window, navigator: {},
    document: { createElement: () => ({ value: '', textContent: '', dataset: {}, append() {}, addEventListener() {}, classList: { add() {} } }), getElementById: () => null },
    getBrainConfig: brain.getBrainConfig, setBrainConfig: brain.setBrainConfig, keyFor: brain.keyFor, forgetKey: brain.forgetKey,
    checkOwnBrain: async () => false,
    ownChoice: ownBrain.ownChoice, ownChoiceFor: ownBrain.ownChoiceFor, setOwnChoice: ownBrain.setOwnChoice, ownModel: ownBrain.ownModel, setOwnModel: ownBrain.setOwnModel,
    heardModels: async () => null, ownState: () => ({ state: liveNow ? 'ready' : 'error' }), ownLive: () => liveNow, claudeCodeStatus: async () => ({ reach: 'offline' }),
    modelsFor: async () => [{ id: 'm-catalog' }], modelName: (id) => id,
    getControls: () => ({}), setControl() {}, onPaneShown: {}, modal: { hidden: false }, close() {},
    siteSetup: async () => null, pickBuild: () => null, detectPlatform: async () => null, savedPairing: () => null,
    updateY3kode: async () => null, waitForVersion: async () => false, lookAgain() {}, installClaudeCode: async () => null,
    // how fast it writes (speed.js, 2026-10-19): the pane's Speed section, standing still here
    speedShown: () => true, setSpeedShown() {}, recentSpeeds: () => [], speedsByModel: () => [], fmtRate: String, fmtSec: String,
    testSpeed: async () => [], testModels: () => [], engineCmd: async () => ({ ok: false }), tabOf: () => null,
  };
  new Function('__s', `with (__s) {\n${helpers}\n${brainPane}\n}`)(new Proxy(stubs, { has: (t, k) => Object.prototype.hasOwnProperty.call(t, k) }));
  const models = (list) => answer({ models: list });
  return { els, me, lookups, models, provider: () => els['brain-provider'].value, keyField: () => els['brain-key'].value };
}
const meIs = (user) => answer({ user });

await ok('a stale pick of the Site default there no longer is never puts the kept key in use, whichever answer comes first', async () => {
  // Site default chosen once (y3k.brainPick 'site', stored with a no to
  // Claude Code), with an Anthropic key kept from before. The entry is gone
  // with the site's own key (2026-10-12): the menu has to show something, and
  // shows Anthropic, but the kept key is not in the field and not in use. And
  // the no stored with it is no choice now (own-brain.js ownChoice): it went
  // with the option it was made for
  for (const order of ['me first', 'lookup first']) {
    const p = openBrainPane({ pick: 'site', own: 'none', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
    await settle();
    if (order === 'lookup first') { for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }])); await settle(); }
    p.me.res(meIs({ founder: false }));
    await settle();
    for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }]));
    await settle();
    assert.ok(!p.els['brain-provider'].options.some((o) => o.value === 'site'), `${order}: Site default is still offered`);
    assert.equal(p.provider(), 'anthropic', `${order}: the menu shows nothing, or Claude Code with no y3kode thinking here`);
    assert.equal(store.has('y3k.ownBrain'), false, `${order}: the no stored with Site default still refuses the account's own sign-in`);
    assert.equal(brain.getBrainConfig(), null, `${order}: the person's own key is in use behind a pick of Site default`);
    assert.equal(p.keyField(), '', `${order}: the kept key is in the field as if chosen`);
    assert.equal(p.lookups.length, 0, `${order}: the kept key was looked up`);
    assert.equal(brain.keyFor('anthropic')?.key, 'sk-ant-kept', `${order}: the kept key was thrown away`);
    assert.match(p.els['brain-status'].textContent, /^No key in use\. Your Anthropic key is still kept in this browser\.$/);
    assert.equal(p.els['brain-use'].hidden, false, `${order}: no way back to the kept key`);
  }
});

await ok('…and Use kept key puts it back in use, as a choice', async () => {
  const p = openBrainPane({ pick: 'site', own: 'none', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.me.res(meIs({ founder: false }));
  await settle();
  p.els['brain-use'].fire('click');
  assert.equal(p.keyField(), 'sk-ant-kept');
  assert.equal(p.lookups.length, 1);
  p.lookups[0].res(p.models([{ id: 'm-kept' }]));
  await settle();
  assert.deepEqual(brain.getBrainConfig(), { provider: 'anthropic', key: 'sk-ant-kept', model: 'm-kept' });
  assert.equal(store.get('y3k.brainPick'), 'anthropic', 'not kept as the choice: the next open would idle it again');
  assert.equal(p.els['brain-use'].hidden, true);
});

await ok('an account\'s Claude Code pick never puts the kept key in use either (any account, not the founder\'s alone)', async () => {
  const p = openBrainPane({ pick: 'claude', own: 'claude', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  await settle();
  for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }]));
  p.me.res(meIs({ founder: false }));
  await settle();
  for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }]));
  await settle();
  assert.equal(p.provider(), 'claude');
  assert.equal(brain.getBrainConfig(), null, 'an API key is billed while the menu says Claude Code');
});

await ok('Claude Code is on every account\'s list, and on no guest\'s', async () => {
  const listed = async (me) => {
    const p = openBrainPane({ pick: 'claude', own: 'claude' });
    p.me.res(me);
    await settle();
    return { p, values: p.els['brain-provider'].options.map((o) => o.value) };
  };
  const account = await listed(meIs({ founder: false }));
  assert.deepEqual(account.values, ['claude', 'anthropic', 'openai', 'openrouter'], 'the list is Claude Code and the key providers, and no Site default');
  assert.equal(account.p.provider(), 'claude', 'a choice of Claude Code does not stand');
  const guest = await listed(answer({ user: null }));
  assert.ok(!guest.values.includes('claude'), 'a guest is offered a relay that needs an account');
  assert.deepEqual(guest.values, ['anthropic', 'openai', 'openrouter']);
  assert.notEqual(guest.p.provider(), 'claude');
});

await ok('with no key and no choice, an account with no y3kode is shown a key provider with nothing in use, not Claude Code', async () => {
  const p = openBrainPane({ kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.provider(), 'anthropic', 'Claude Code is shown as in use for someone with no y3kode');
  assert.equal(brain.getBrainConfig(), null, 'a key nobody chose here is in use');
  assert.equal(p.lookups.length, 0);
  assert.equal(ownBrain.ownChoice(), null, 'opening Settings made a choice');
  const bare = openBrainPane();
  bare.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(bare.els['brain-status'].textContent, 'No key saved.');
  assert.equal(bare.els['brain-use'].hidden, true, 'Use kept key, with no key kept');
});

await ok('…and Claude Code once y3kode here thinks for the site, and nothing in use again when it stops', async () => {
  const p = openBrainPane({ kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.me.res(meIs({ founder: false }));
  await settle();
  liveNow = true;
  window.dispatchEvent({ type: 'y3k:own-brain-state' });
  await settle();
  assert.equal(p.provider(), 'claude', 'the list does not follow the default');
  assert.equal(p.els['cc-sec'].hidden, false, 'the Claude Code card is not shown');
  liveNow = false;
  window.dispatchEvent({ type: 'y3k:own-brain-state' });
  await settle();
  assert.equal(p.provider(), 'anthropic');
  assert.equal(ownBrain.ownChoice(), null, 'following the default made a choice');
  assert.equal(brain.getBrainConfig(), null, 'the default stopping put a kept key nobody chose in use');
  assert.equal(p.keyField(), '');
  assert.equal(p.lookups.length, 0);
  // a key being typed is never switched out from under the hand
  p.els['brain-provider'].value = 'anthropic';
  p.els['brain-key'].value = 'sk-ant-half-typ';
  liveNow = true;
  window.dispatchEvent({ type: 'y3k:own-brain-state' });
  await settle();
  assert.equal(p.provider(), 'anthropic');
});

await ok('an explicit choice of another provider is not followed off by the default', async () => {
  for (const pick of ['anthropic', 'openai', 'openrouter']) {
    const p = openBrainPane({ pick, own: 'none' });
    p.me.res(meIs({ founder: false }));
    await settle();
    const shown = p.provider();
    liveNow = true;
    window.dispatchEvent({ type: 'y3k:own-brain-state' });
    await settle();
    assert.equal(p.provider(), shown, pick);
    assert.notEqual(shown, 'claude', pick);
    assert.equal(ownBrain.ownDeclined(), true, pick);
  }
});

await ok('…but a stale pick of the Site default is no choice: the list follows the default, as for an account that made none', async () => {
  // 2026-10-12: the no stored beside Site default sent own: false with every
  // turn on this device for good, a lasting refusal of the account's own
  // Claude sign-in that nobody had made (Site default chose the site's key)
  const p = openBrainPane({ pick: 'site', own: 'none', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.me.res(meIs({ id: 'u-3', founder: false }));
  await settle();
  assert.equal(p.provider(), 'anthropic', 'no y3kode thinking here yet: a key provider, with nothing in use');
  assert.equal(ownBrain.ownDeclined(), false, 'this page still turns the account\'s own sign-in down');
  // (`as`: the account that came through the door above, 'a', named with
  // every turn since 2026-10-12: keyFields, below)
  assert.deepEqual(brain.keyFields(), { as: 'a' }, 'every turn still says own: false');
  liveNow = true;
  window.dispatchEvent({ type: 'y3k:own-brain-state' });
  await settle();
  assert.equal(p.provider(), 'claude', 'the default thinking here for the site is not shown');
  assert.equal(ownBrain.ownChoice(), null, 'following the default made a choice');
  assert.equal(brain.getBrainConfig(), null, 'a kept key nobody chose is in use');
  assert.equal(store.get('y3k.brainPick'), 'site', 'opening Settings chose for them');
});

await ok('a key provider still gets its kept key, once the site has answered', async () => {
  const p = openBrainPane({ pick: 'anthropic', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  await settle();
  assert.equal(p.lookups.length, 0, 'a key was looked up before the site said who you are');
  p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.provider(), 'anthropic');
  assert.equal(p.keyField(), 'sk-ant-kept', 'the kept key is not in the field');
  assert.equal(p.lookups.length, 1);
  p.lookups[0].res(p.models([{ id: 'm-other' }, { id: 'm-kept' }]));
  await settle();
  assert.deepEqual(brain.getBrainConfig(), { provider: 'anthropic', key: 'sk-ant-kept', model: 'm-kept' });
});

await ok('a key in use opens on its own provider, and is put back in use', async () => {
  const p = openBrainPane({ pick: 'site', inUse: { provider: 'openai', key: 'sk-proj-x', model: 'm-openai' }, kept: { openai: { key: 'sk-proj-x', model: 'm-openai' } } });
  p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.provider(), 'openai', 'the menu hides the key that is in use');
  p.lookups[0].res(p.models([{ id: 'm-openai' }]));
  await settle();
  assert.equal(brain.getBrainConfig()?.key, 'sk-proj-x');
});

await ok('a lookup that lands after Claude Code was chosen puts nothing in use', async () => {
  const p = openBrainPane({ pick: 'anthropic', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.lookups.length, 1);
  p.els['brain-provider'].value = 'claude';
  p.els['brain-provider'].fire('change');
  p.lookups[0].res(p.models([{ id: 'm-kept' }]));
  await settle();
  assert.equal(brain.getBrainConfig(), null);
  assert.equal(store.get('y3k.brainPick'), 'claude');
});

await ok('a key typed before the site answered is not replaced by the kept one', async () => {
  const p = openBrainPane({ pick: 'anthropic', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.els['brain-key'].value = 'sk-ant-typed';
  p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.keyField(), 'sk-ant-typed');
  assert.equal(p.lookups.length, 0, 'the kept key was looked up over the one being typed');
});

await ok('choosing Claude Code keeps it as this account\'s on this device; choosing another lets it go', async () => {
  const p = openBrainPane();
  p.me.res(meIs({ id: 'u-1', founder: false }));
  await settle();
  const kept = () => JSON.parse(store.get('y3k.ownBrain.accounts') || '[]');
  p.els['brain-provider'].value = 'claude';
  p.els['brain-provider'].fire('change');
  assert.deepEqual(ownBrain.ownChoice(), { provider: 'claude' });
  assert.deepEqual(kept(), ['u-1'], 'signed out and back, the desktop app would ask for the choice again');
  p.els['brain-provider'].value = 'openai';
  p.els['brain-provider'].fire('change');
  assert.deepEqual(kept(), [], 'OpenAI chosen, and the default would still think on Claude Code here');
  assert.equal(ownBrain.ownDeclined(), true);
});

await ok('the default is shown only while this page thinks for the site, whatever y3kode is in reach', async () => {
  // main.js decides whether the default may run here (own-brain.js mayDefault):
  // a y3kode another account paired never starts it, so the list never says
  // Claude Code for it, pairing or no pairing
  const p = openBrainPane();
  store.set('y3k-code:pair', JSON.stringify({ port: 47821, token: 'tok', by: 'someone-else' }));
  p.me.res(meIs({ id: 'u-2', founder: false }));
  await settle();
  window.dispatchEvent({ type: 'y3k:own-brain-state' });
  await settle();
  assert.equal(p.provider(), 'anthropic');
  assert.equal(ownBrain.ownChoiceFor({ id: 'u-2' }, false, { win: {} }), null, 'main.js would start the default on someone else\'s y3kode');
});

// =============================================================================
console.log('\nthe presence\'s life (tend.js, run):');

// tend.js as written, with its two imports of main.js pointed at a stand-in:
// main.js builds the orb as it loads and cannot run here.
const b64 = (s) => Buffer.from(s).toString('base64');
const mainStandIn = `data:text/javascript;base64,${b64('export const scoreFor = () => ({ cancel() {}, start() {} }); export const applyBodyBlock = () => {};')}`;
const tendSrc = read('src/tend.js')
  .replace("from './brain.js'", `from '${pathToFileURL(join(ROOT, 'src/brain.js')).href}'`)
  .replace("from './motion.js'", `from '${pathToFileURL(join(ROOT, 'src/motion.js')).href}'`)
  .replaceAll("import('./main.js')", `import('${mainStandIn}')`);
assert.ok(!/from '\.\//.test(tendSrc) && !tendSrc.includes("import('./"), 'tend.js imports something this stand-in does not cover');
const docBody = new Set();
const docEls = {};
globalThis.document = {
  getElementById: (id) => (docEls[id] ||= element(id)),
  body: { classList: { contains: (c) => docBody.has(c), add: (...c) => c.forEach((x) => docBody.add(x)), remove: (...c) => c.forEach((x) => docBody.delete(x)), toggle: (c, on) => (on ? docBody.add(c) : docBody.delete(c)) } },
  documentElement: { dataset: { motion: 'less' } },
  visibilityState: 'visible',
  addEventListener() {},
};
const { createTend } = await import(`data:text/javascript;base64,${b64(tendSrc)}`);
// its own hours are a 20s interval: taken here, and ticked by hand
const realSetInterval = globalThis.setInterval;
let hoursTick = null;
globalThis.setInterval = (fn, ms, ...a) => (ms === 20000 ? (hoursTick = fn, 0) : realSetInterval(fn, ms, ...a));
const realNow = Date.now;
let ahead = 0;
Date.now = () => realNow() + ahead;

function tendRig({ engaged = () => false, reader = {} } = {}) {
  const calls = [];
  const s = { busy: false, gen: 0, hosting: false, room: { presence: { handle: 'orion' }, mode: 'host' }, alive: [] };
  const tend = createTend({
    body: recorder(calls), social: new Proxy({ isHosting: () => s.hosting }, { get: (t, k) => t[k] || ((...a) => { calls.push(['social.' + String(k), ...a]); }) }),
    showCaption: (t, w) => calls.push(['showCaption', t, w]), getRoom: () => s.room, getOwnHandle: () => 'orion', reader,
    windows: new Proxy({}, { get: () => () => {} }), getBusy: () => s.busy, setBusy: (v) => { s.busy = v; }, getGen: () => s.gen,
    speak: async () => {}, stopSpeak: () => {}, onAlive: (on) => s.alive.push(on), getHostAside: () => null, restoreHostAside() {},
    getMusic: () => '', onInvite() {}, isEngaged: engaged,
  });
  return { tend, calls, s, tick: hoursTick };
}
store.clear();
store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-own', model: 'm' }));   // its own key: canLive()

await ok('after visiting someone\'s stream, the game\'s turns reach the body, the caption and the audience', async () => {
  route = async (url, o) => {
    if (url === '/api/brain' && JSON.parse(o.body).tend === 'play') return answer({ available: true, mood: 'excited', form: 'web', speech: 'My turn.', budget: { remaining: 4 } });
    return answer({ budget: { remaining: 5 } });
  };
  const { tend, calls, s } = tendRig();
  tend.stop(); s.gen += 1;               // leaveHomeHosting, on the way into someone's stream
  s.gen += 1;                            // and back home (leaveViewer)
  s.hosting = true;                      // broadcasting again
  assert.equal(tend.togglePlay(), true, 'the game would not start');
  for (let i = 0; i < 40 && !calls.some((c) => c[0] === 'showCaption'); i++) await new Promise((r) => setTimeout(r, 50));
  tend.stopPlay();
  assert.ok(calls.some((c) => c[0] === 'setMood' && c[1] === 'excited'), 'the play turn never reached the body');
  assert.ok(calls.some((c) => c[0] === 'showCaption' && c[1] === 'My turn.'), 'the play turn was never captioned');
  assert.ok(calls.some((c) => c[0] === 'social.publishTurn' && c[2]?.speech === 'My turn.'), 'the play turn never reached the live audience');
});

await ok('leaving home ends the game too, so no turn can land on the orb being watched', async () => {
  const { tend } = tendRig();
  tend.togglePlay();
  assert.equal(tend.isPlaying(), true);
  tend.stop();
  assert.equal(tend.isPlaying(), false);
  assert.ok(!/stopFlag/.test(read('src/tend.js').replace(/^\s*\/\/.*$/gm, '')), 'a manual stop flag is back in tend.js');
});

await ok('its own hours wait while someone listens to airden or talks by voice, and begin five minutes after', async () => {
  store.set('y3k.hours', 'on');
  route = async () => answer({ budget: { remaining: 5 } });
  let engaged = true;
  const { tend, s } = tendRig({ engaged: () => engaged });
  const tick = hoursTick;
  const T0 = 6 * 60 * 1000;
  ahead = T0;                            // no touch for six minutes: only listening
  await tick(); await settle();
  assert.deepEqual(s.alive, [], 'the hours began while someone was listening');
  engaged = false;
  ahead = T0 + 60 * 1000;                // they stopped a minute ago
  await tick(); await settle();
  assert.deepEqual(s.alive, [], 'the hours began a minute after the listening ended');
  ahead = T0 + 5.5 * 60 * 1000;          // five and a half minutes of real quiet
  await tick(); await settle();
  assert.deepEqual(s.alive, [true], 'the hours never began after the room went quiet');
  tend.stop();
  ahead = 0;
});

await ok('…and a room nobody is in still gets them, as before', async () => {
  const { tend, s } = tendRig();
  const tick = hoursTick;
  ahead = 6 * 60 * 1000;
  await tick(); await settle();
  assert.deepEqual(s.alive, [true]);
  tend.stop();
  ahead = 0;
  store.delete('y3k.hours');
  const main = read('src/main.js');
  assert.match(main, /isEngaged: \(\) => busy \|\| voiceMode \|\| !!dictation \|\| airden\.isOn\(\),/, 'main.js no longer tells tend who is listening');
});

// ITS OWN PLAN IS ITS ONLY LIMIT, READING TOO (2026-10-12). A page it opened
// was charged to the budget even on the owner's own Claude plan, so a stretch
// there drained the budget and stopped at the hours' cap: a limit besides the
// plan. The page now says so (own=1), only when it is on that plan, and the
// site checks the plan is really offered before it lets the charge go.
async function readsOnce(seed) {
  const seen = [];
  route = async (url, o) => {
    const body = o?.body ? JSON.parse(o.body) : null;
    seen.push({ url, body });
    if (url === '/api/health') return answer({ ownBrain: true });
    if (url === '/api/brain' && body?.tend === 'auto') return answer({ available: true, mood: 'curious', nav: 'https://example.com/a', budget: { remaining: 5 } });
    if (url.startsWith('/api/fetch?')) return answer({ page: { url: 'https://example.com/a', title: 'A', text: 'a page', links: [] } });
    return answer({ budget: { remaining: 5 } });
  };
  store.clear();
  store.set('y3k.hours', 'on');
  seed();
  await brain.checkOwnBrain();
  const { tend, s } = tendRig({ reader: new Proxy({}, { get: () => () => {} }) });
  const tick = hoursTick;
  ahead = 6 * 60 * 1000;
  await tick(); await settle();
  for (let i = 0; i < 60 && !seen.some((x) => x.url.startsWith('/api/fetch?')); i++) await new Promise((r) => setTimeout(r, 50));
  const alive = s.alive.slice();   // before stop() puts it to rest
  tend.stop();
  ahead = 0;
  return { alive, fetched: seen.find((x) => x.url.startsWith('/api/fetch?'))?.url || null, beat: seen.find((x) => x.url === '/api/brain')?.body || null };
}
await ok('a page read on its owner\'s own plan asks not to be charged; on a key it is charged as before', async () => {
  const own = await readsOnce(() => {});
  assert.deepEqual(own.alive, [true], 'its own hours did not begin on its owner\'s own plan');
  assert.ok(own.fetched && /&own=1$/.test(own.fetched), 'the page went to the budget on the owner\'s own plan: ' + own.fetched);
  assert.ok(own.beat && !('own' in own.beat) && !own.beat.key, 'the beat itself turned the plan down');
  const key = await readsOnce(() => store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-own', model: 'm' })));
  assert.ok(key.fetched && !/own=1/.test(key.fetched), 'a page read on a key asked to go uncharged: ' + key.fetched);
  assert.deepEqual([key.beat?.key, key.beat?.own], ['sk-ant-own', false], 'the beat on a key does not say it chose the key');
  // another provider chosen here, and no key: its own plan is not this page's to live on
  const declined = await readsOnce(() => { store.set('y3k.brainPick', 'openai'); store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' })); });
  assert.deepEqual([declined.alive, declined.fetched], [[], null], 'its hours ran on a plan this page turned down');
  // …but the Site default there no longer is turned nothing down (own-brain.js ownChoice)
  const stale = await readsOnce(() => { store.set('y3k.brainPick', 'site'); store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' })); });
  assert.deepEqual(stale.alive, [true], 'a stale Site default still keeps its hours off its owner\'s own plan');
  assert.ok(stale.fetched && /&own=1$/.test(stale.fetched) && !('own' in (stale.beat || {})), 'a stale Site default still turns the plan down: ' + stale.fetched);
  route = async () => answer({ ownBrain: false });
  await brain.checkOwnBrain();
  store.clear();
  store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-own', model: 'm' }));
});

await ok('every request that may think on its owner\'s own plan says which rung was chosen here (keyFields)', () => {
  // brain.js keyFields carries the key and, when the choice here is not
  // Claude Code, own: false. A body that copies the key by hand leaves it out,
  // and the site would answer on the laptop's Claude plan a turn the phone
  // sent on another provider.
  const strip = (f) => read(f).replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['src/brain.js', 'src/tend.js', 'src/main.js', 'src/chess.js', 'src/match-view.js']) {
    assert.ok(!/key: cfg\.key|body\.key = cfg\.key|bodyJson\.key = cfg\.key/.test(strip(f)), f + ' builds a brain request from the key by hand');
  }
  const main = strip('src/main.js');
  assert.match(main, /'\/api\/code\/handoff'[\s\S]{0,200}\.\.\.keyFields\(\)/, 'the coder\'s note');
  assert.match(main, /'\/api\/code\/voice'[\s\S]{0,200}\.\.\.keyFields\(\)/, 'Code\'s translator (it thinks on the person\'s key or sign-in now, never the site\'s)');
  assert.match(main, /keyFields: keyFields\(\)/, 'airden (/api/speak)');
  assert.match(main, /\/api\/fetch\/render\?presence=[^`]*\$\{onOwnPlan\(\) \? '&own=1' : ''\}/, 'the reader\'s second fetch of a page');
  assert.match(strip('src/chess.js'), /'\/api\/chess\/think'[\s\S]{0,400}\.\.\.keyFields\(\)/, 'chess');
  assert.match(strip('src/match-view.js'), /\/think`, \{[\s\S]{0,60}\.\.\.keyFields\(\)/, 'a match');
  assert.match(strip('src/social.js'), /tend: 'write'[\s\S]{0,120}\.\.\.keyFields\(\)/, 'a post it writes');
  assert.match(strip('src/tend.js'), /\.\.\.keyFields\(\) \};/, 'tend');
});

// ONE PAGE, ONE ACCOUNT, FOR EVERY TURN (2026-10-12). A tab left open on
// account a, after b signed in elsewhere in this browser, sent a's
// conversation as b's turns, into b's memory and onto b's plan: the cookie is
// the browser's, and only the own-brain stream said whose page it was. Now
// every thinking request names the account its page is for (keyFields `as`,
// which the site checks), and the page reloads when another tab changes whose
// this browser is.
// CHANGED 2026-10-12 (G3). A guest's page named no one, like a page from
// before this, so after someone signed in elsewhere in this browser the site
// could not tell a stale guest tab's turns from that account's own: they went
// in as theirs. It says it is a guest's now (`as: ''`), which the site lets
// through only while nobody is signed in. This used to pin {} for a guest.
await ok('every thinking request names the account its page is for; a guest\'s says it is a guest\'s', () => {
  const kept = new Map(store);
  try {
    store.clear();
    brain.claimBrowser({ id: 'a' });
    assert.deepEqual(brain.keyFields(), { as: 'a' }, 'a stale tab\'s turn cannot be told from its account\'s');
    assert.deepEqual(brain.whoseFields(), { as: 'a' }, 'a door that only writes is not told whose page it is');
    store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-a', model: 'm' }));
    assert.deepEqual(brain.keyFields(), { key: 'sk-ant-a', provider: 'anthropic', model: 'm', own: false, as: 'a' }, 'on a key');
    assert.deepEqual(brain.whoseFields(), { as: 'a' }, 'the key went where nothing thinks');
    store.delete('y3k.brain');
    store.set('y3k.brainPick', 'openai'); store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
    assert.deepEqual(brain.keyFields(), { own: false, as: 'a' }, 'another provider chosen here');
    store.clear();
    brain.claimBrowser({ id: 42 });
    assert.deepEqual(brain.keyFields(), { as: '42' }, 'said as the stream says it (as=, a string)');
    store.clear();
    brain.claimBrowser(null);
    assert.deepEqual(brain.keyFields(), { as: '' }, 'a guest tab names no one, and cannot be told from the account signed in since');
    assert.deepEqual(brain.whoseFields(), { as: '' });
    store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-g', model: 'm' }));
    assert.deepEqual(brain.keyFields(), { key: 'sk-ant-g', provider: 'anthropic', model: 'm', own: false, as: '' }, 'a guest on a key of their own');
  } finally {
    store.clear(); brain.claimBrowser({ id: 'a' });   // the door as the tests above left it
    store.clear(); for (const [k, v] of kept) store.set(k, v);
  }
});

await ok('another tab changing whose this browser is reloads this page; anything else, or its own account again, does not', () => {
  const kept = new Map(store);
  const was = globalThis.location;
  let reloads = 0;
  globalThis.location = { reload: () => { reloads += 1; } };
  const storage = (key) => window.dispatchEvent({ type: 'storage', key });   // what another tab's write fires here
  try {
    for (const [what, page, change, key = 'y3k.owner'] of [
      ['a signed out there', { id: 'a' }, () => store.delete('y3k.owner')],
      ['b signed in there', { id: 'a' }, () => store.set('y3k.owner', 'b')],
      ['a guest came in there', { id: 'a' }, () => store.set('y3k.owner', 'guest')],
      ['the storage was cleared there', { id: 'a' }, () => store.clear(), null],
      ['a guest\'s page, and a signed in there', null, () => store.set('y3k.owner', 'a')],
    ]) {
      store.clear();
      brain.claimBrowser(page);   // this page, through the door
      reloads = 0;
      storage('y3k.brainKeys');   // another key, not whose the browser is
      storage('y3k.owner');       // written again for this page's own account (a reload of it there)
      assert.equal(reloads, 0, `${what}: reloaded for nothing`);
      change();
      storage(key);
      assert.equal(reloads, 1, `${what}: this page goes on sending its turns as whoever is signed in now`);
    }
  } finally {
    globalThis.location = was;
    store.clear(); brain.claimBrowser({ id: 'a' });
    store.clear(); for (const [k, v] of kept) store.set(k, v);
  }
});

await ok('a turn the site refuses as another account\'s (409 reload) reloads the page, says so, and is not asked again', async () => {
  const kept = new Map(store);
  const was = globalThis.location;
  const wasRoute = route;
  let reloads = 0;
  globalThis.location = { reload: () => { reloads += 1; } };
  const asked = [];
  const refused = { ok: false, status: 409, headers: { get: () => 'application/json; charset=utf-8' }, json: async () => ({ error: 'reload', reason: 'reload' }) };
  route = async (url) => { asked.push(url); return url.startsWith('/api/brain') ? refused : answer({ ownBrain: false }); };
  try {
    store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-a', model: 'm' }));
    brain.resetHistory();
    const s = await brain.respondStream('hello');
    assert.equal(s.speech, brain.STALE_PAGE);
    assert.ok(s.notice && s.local, 'put on the air');
    assert.deepEqual(asked, ['/api/brain/stream'], 'asked again unstreamed, as the same account it is not');
    assert.equal(reloads, 1);
    const f = await brain.respond('hello');
    assert.equal(f.speech, brain.STALE_PAGE);
    assert.equal(reloads, 2);
    const heard = [];
    const o = await brain.openingStream({ onText: (t) => heard.push(t) });
    assert.deepEqual(heard, [brain.STALE_PAGE], 'the arrival said a stray thought, or another reason');
    assert.ok(o.notice);
    assert.equal(reloads, 3);
    assert.deepEqual(brain.recentTurns(8), [], 'a refused turn was kept as if answered');
    assert.ok(!/—/.test(brain.STALE_PAGE));
  } finally {
    globalThis.location = was; route = wasRoute; brain.resetHistory();
    store.clear(); for (const [k, v] of kept) store.set(k, v);
  }
});

// …AND EVERY OTHER DOOR THAT CARRIES IT (2026-10-12, G4). Only the
// conversation read the word. The komputer took it for a beat that did not
// land and asked again every beat, for good, after the session it was for
// had gone; its game said "the game paused: reload"; chess and a match toasted
// the bare word; a post said it could not write; airden blamed the provider.
await ok('a beat of its own life, or of its game, refused as another account\'s (409 reload) stops it, says nothing, reloads, and is not asked again', async () => {
  const kept = new Map(store);
  const was = globalThis.location;
  const wasRoute = route;
  let reloads = 0;
  globalThis.location = { reload: () => { reloads += 1; } };
  const asked = [];
  route = async (url, o) => {
    if (url === '/api/brain') {
      asked.push(JSON.parse(o.body).tend);
      return { ok: false, status: 409, json: async () => ({ error: 'reload', reason: 'reload' }) };
    }
    return answer({ budget: { remaining: 5 } });
  };
  const until = async (f) => { for (let i = 0; i < 60 && !f(); i++) await new Promise((r) => setTimeout(r, 50)); await settle(); };
  try {
    store.clear();
    store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-own', model: 'm' }));
    store.set('y3k.hours', 'on');
    // its own hours: the waking nobody is watching, which asked again for good
    const { tend, s, calls } = tendRig();
    const tick = hoursTick;
    ahead = 6 * 60 * 1000;
    await tick(); await settle();
    await until(() => asked.length);
    assert.deepEqual(asked, ['auto']);
    assert.equal(reloads, 1, 'the page went on as an account that is gone');
    assert.deepEqual(s.alive, [true, false], 'its waking went on, to ask again at the next beat');
    assert.equal(tend.isAlive(), false);
    assert.ok(!calls.some((c) => c[0] === 'showCaption'), 'it said something of its own: ' + JSON.stringify(calls.find((c) => c[0] === 'showCaption')));
    tend.stop();
    ahead = 0;
    store.delete('y3k.hours');
    // its game
    asked.length = 0; reloads = 0;
    const g = tendRig();
    assert.equal(g.tend.togglePlay(), true);
    await until(() => asked.length);
    assert.deepEqual(asked, ['play']);
    assert.equal(reloads, 1, 'the game paused on the bare word, and the page went on');
    assert.equal(g.tend.isPlaying(), false);
    g.tend.stop();
  } finally {
    globalThis.location = was; route = wasRoute; ahead = 0;
    store.clear(); for (const [k, v] of kept) store.set(k, v);
  }
});

await ok('every other door that carries keyFields reads the same word the same way (brain.js reloaded), and a finished game says whose page it was', () => {
  const strip = (f) => read(f).replace(/^\s*\/\/.*$/gm, '');
  const chess = strip('src/chess.js');
  // (a gone game's answer is dropped between the two since: A THINK THAT OUTLIVES ITS GAME, below)
  assert.match(chess, /\.then\(\(x\) => x\.json\(\)\);\n\s*if \(reloaded\(r\)\) break;\n\s*if \(game !== g \|\| g\.status !== 'started'\) break;\n\s*if \(!r\.ok\)/, 'a chess move toasts the bare word');
  // the game onto its shelf: whose page, and not the key (nothing thinks there)
  const finished = chess.slice(chess.indexOf("fetch('/api/chess/finished'"), chess.indexOf('function endSessionKeepSummary'));
  assert.match(finished, /body: JSON\.stringify\(\{\n\s*\.\.\.whoseFields\(\),/, 'a stale tab\'s game goes onto another account\'s shelf');
  assert.ok(!/keyFields/.test(finished), 'the key goes where nothing thinks');
  assert.match(finished, /reloaded\(await r\.json\(\)\.catch\(\(\) => null\)\);/, 'refused, the page goes on as the account that is gone');
  const match = strip('src/match-view.js');
  assert.match(match, /else if \(reloaded\(r\)\) gone = true;\n\s*else if \(r\.reason === 'budget'\)/, 'a match toasts the bare word');
  assert.match(match, /if \(m\.stuck \|\| thinkBusy \|\| budgetHalt \|\| gone\) return;/, 'a match offers again at the next poll');
  assert.match(strip('src/social.js'), /if \(reloaded\(r\)\) \{ \$\('compose-ai-status'\)\.textContent = STALE_PAGE; return; \}\n\s*if \(r\.available && r\.post\)/, 'a post says it could not write');
  const main = strip('src/main.js');
  assert.match(main, /reason: r\.status === 409 \? 'reload' : r\.status === 401 \|\| r\.status === 403 \? 'refused' : 'upstream'/, 'airden is told the provider failed');
  assert.match(main.slice(main.indexOf('const airden = createAirden({')), /\n  reload: reloadPage,/, 'airden cannot reload the page');
  assert.match(main, /return reloaded\(d\) \? \{ available: false \} : d;/, 'the coder\'s note');
  assert.match(main, /if \(reloaded\(d\) \|\| !r\.ok\) return null;/, 'Code\'s translator');
  assert.match(strip('src/tend.js'), /if \(!reloaded\(r\)\) return r;\n\s*stopPlay\(\); stopAlive\(\);/, 'the komputer');
});

// A THINK THAT OUTLIVES ITS GAME (2026-10-12, R3). The presence thinks one move
// at a time, and a think for a game the person had resigned held that one for
// the next game: told the plan was busy, it waited 3 to 15 seconds; a new game
// whose first move was the presence's asked inside that wait, was turned away,
// and nothing asked again: the board sat with the presence to move, for good.
// And an answer that came back after its game was over was played as the
// presence's move in the game that was on (localApply moves that one).
// maybeThink is cut from chess.js and run against stand-ins, its waits in the
// test's hand: nothing here waits on a clock.
const { legalMoves } = await import('../src/chess-rules.js');
const { stateFromMoves } = await import('../src/chess-core.js');
const CHESS = read('src/chess.js');
const makeThink = new Function('d', `
  const { fetch, setTimeout, clearTimeout, legalMoves, stateFromMoves } = d;
  const toast = (m) => d.toasts.push(m), canLive = () => true, noBrain = () => '', THINK_WITH = '';
  const keyFields = () => ({}), reloaded = () => false, whyLine = () => 'busy', render = () => {};
  const li = async () => ({ ok: true }), BOT_KEY = 'bot';
  let game = null, thinkBusy = false, rejected = [], thinkWake = null;
  const localApply = (uci) => { d.played.push([game, uci]); game.moves = (game.moves + ' ' + uci).trim(); };
  ${between(CHESS, '  async function maybeThink() {', '  // ---- rendering')}
  return { maybeThink, set game(g) { game = g; }, get busy() { return thinkBusy; } };
`);
// a local game as startLocal lays it out; the person's name tells the asks apart
const localGame = (you, botColor, moves = '') => ({
  local: true, id: 'local', white: botColor === 'w' ? 'it' : you, black: botColor === 'w' ? you : 'it',
  botColor, moves, status: 'started', winner: null, wtime: 6e5, btime: 6e5, winc: 5000, binc: 5000, at: 0, chat: [], thinking: false,
});
function thinkRig() {
  const d = { toasts: [], played: [], legalMoves, stateFromMoves };
  const asked = [], replies = [], timers = [];   // replies: each think's answer in turn, or a defer() held by the test
  d.fetch = async (url, o) => {
    assert.equal(url, '/api/chess/think');
    const b = JSON.parse(o.body);
    asked.push([b.opponent, b.moves]);
    const r = replies.shift();
    return { json: () => (r?.p ? r.p : Promise.resolve(r)) };
  };
  d.setTimeout = (f, ms) => { timers.push({ f, ms, off: false }); return timers.length; };
  d.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].off = true; };
  const fire = () => { const t = timers.find((x) => !x.off); assert.ok(t, 'nothing waits'); t.off = true; t.f(); };
  return { rig: makeThink(d), d, played: d.played, asked, replies, timers, fire };
}
const BUSY = { available: false, busy: true, reason: 'upstream', why: 'own-busy', provider: 'own' };

await ok('a game begun while the last one waited out a busy plan is thought for at once; the wait is still its own game\'s', async () => {
  const t = thinkRig();
  const one = localGame('@one', 'w');
  t.rig.game = one;
  t.replies.push(BUSY);
  t.rig.maybeThink(); await settle();
  assert.deepEqual(t.asked, [['@one', '']]);
  assert.deepEqual(t.timers.map((x) => x.ms), [3000], 'a busy plan is not waited out');
  // the same game asking again (a lichess gameState, say) does not cut its own wait short
  t.rig.maybeThink(); await settle();
  assert.equal(t.asked.length, 1, 'its own game asking again cut the wait short');
  assert.equal(t.timers[0].off, false);
  // the wait runs out: asked again, busy again, and it waits longer
  t.replies.push(BUSY);
  t.fire(); await settle();
  assert.deepEqual(t.asked, [['@one', ''], ['@one', '']]);
  assert.deepEqual(t.timers.map((x) => x.ms), [3000, 6000]);
  // inside that wait the person resigns (finishGame lets a local game go) and
  // sits down again; the presence is white again, and startLocal asks
  one.status = 'resign'; t.rig.game = null;
  const two = localGame('@two', 'w');
  t.rig.game = two;
  t.replies.push({ ok: true, move: 'e2e4', say: '' });
  t.rig.maybeThink(); await settle();
  assert.deepEqual(t.asked.slice(2), [['@two', '']], 'the new game was turned away, and nothing asked for it again');
  assert.deepEqual(t.played, [[two, 'e2e4']]);
  assert.ok(t.timers.every((x) => x.off), 'the gone game\'s wait still runs');
  assert.equal(t.rig.busy, false);
  assert.deepEqual(t.d.toasts, ['busy'], 'said once, for the first game\'s busy plan');
});

await ok('an answer that comes back after its game is over is not played in the next one, and the next one is asked for', async () => {
  const t = thinkRig();
  const one = localGame('@one', 'w');
  const held = defer();
  t.replies.push(held);
  t.rig.game = one;
  t.rig.maybeThink(); await settle();
  assert.deepEqual(t.asked, [['@one', '']]);
  // while it thinks, the person resigns and sits down as white, and moves
  one.status = 'resign'; t.rig.game = null;
  const two = localGame('@two', 'b', 'e2e4');
  t.rig.game = two;
  t.rig.maybeThink(); await settle();        // localApply's ask after the person's move
  assert.equal(t.asked.length, 1, 'two thinks at once');
  t.replies.push({ ok: true, move: 'e7e5', say: '' });
  held.res({ ok: true, move: 'd2d4', say: 'for the first game' });
  await settle();
  assert.deepEqual(t.played, [[two, 'e7e5']], 'the first game\'s move was played in the second');
  assert.equal(two.moves, 'e2e4 e7e5');
  assert.deepEqual(t.asked, [['@one', ''], ['@two', 'e2e4']], 'the second game was never asked for');
  // and a busy answer for a game that is gone is not said, nor waited out
  const u = thinkRig();
  const three = localGame('@three', 'w');
  const late = defer();
  u.replies.push(late);
  u.rig.game = three; u.rig.maybeThink(); await settle();
  three.status = 'resign'; u.rig.game = null;
  late.res(BUSY); await settle();
  assert.deepEqual(u.d.toasts, [], 'a game that is gone said the plan was busy');
  assert.deepEqual(u.timers, [], 'a game that is gone waited for room');
  assert.equal(u.rig.busy, false);
});

await ok('chess.js: an answer is its own game\'s, a game that is gone gives way, and the game on is asked for', () => {
  const think = between(CHESS, '  async function maybeThink() {', '  // ---- rendering').replace(/^\s*\/\/.*$/gm, '');
  assert.match(think, /if \(thinkBusy\) \{ thinkWake\?\.\(g\); return; \}/, 'a new game is turned away by a think for a gone one');
  assert.match(think, /thinkWake = \(to\) => \{ if \(to !== g\) \{ clearTimeout\(t\); ok\(\); \} \};/, 'the wait is cut short for its own game, or not for another');
  assert.match(think, /if \(reloaded\(r\)\) break;\n\s*if \(game !== g \|\| g\.status !== 'started'\) break;\n\s*if \(!r\.ok\)/, 'a gone game\'s answer is played in the game on');
  assert.match(think, /\} finally \{\n\s*thinkBusy = false;\n[\s\S]*if \(game && game !== g && game\.status === 'started'\) maybeThink\(\);\n\s*\}\n\s*\}\s*$/, 'the game on is not asked for when a gone one\'s think ends');
});

// =============================================================================
console.log('\nmain.js, cut from its source and run:');

const MAIN = read('src/main.js');
const fnOf = (name) => {
  const at = MAIN.search(new RegExp('\\n(async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' is gone from main.js');
  return MAIN.slice(at, MAIN.indexOf('\n}\n', at) + 3);
};

const makeHome = new Function('d', `
  const { body, fetch, windows, social, tend, setMoodTag, applyBodyBlock, resetHistory, history } = d;
  let room = null, roomGen = 0, myPresence = d.myPresence;
  ${fnOf('homeContext')}
  ${fnOf('wearHome')}
  return { homeContext, leave() { roomGen += 1; room = { presence: { handle: 'someone' }, mode: 'view' }; }, get myPresence() { return myPresence; } };
`);
function homeRig(myPresence) {
  const calls = [];
  const me = defer(), graph = defer();
  const rig = makeHome({
    body: recorder(calls), myPresence,
    fetch: (url) => (url === '/api/me/presence' ? me.p : url.startsWith('/api/memorygraph/') ? graph.p : Promise.resolve(answer({}))),
    windows: { recallHide: () => calls.push(['recallHide']) }, social: { setRoomHandle() {} }, tend: { refreshBudget() {} },
    setMoodTag: () => {}, applyBodyBlock: (b) => calls.push(['applyBodyBlock', b]), resetHistory() {}, history: { clear() {} },
  });
  return { rig, calls, me, graph, worn: () => calls.filter((c) => c[0] === 'wear') };
}

await ok('coming home wears your presence\'s own record, body words and all, then the current one', async () => {
  const cached = { updated: 1, mood: 'tender', form: 'web', scheme: 'ember', body: { count: 3, wander: [4, 2] } };
  const h = homeRig({ handle: 'orion', scheme: 'dusk', worn: cached });
  h.rig.homeContext();
  assert.deepEqual(h.worn()[0], ['wear', cached, 'dusk'], 'home does not put your own body on');
  assert.ok(h.calls.some((c) => c[0] === 'applyBodyBlock' && c[1] === cached.body), 'the body words of your own record are not put back');
  const wearAt = h.calls.findIndex((c) => c[0] === 'wear');
  assert.ok(h.calls.findIndex((c, i) => i > wearAt && c[0] === 'setMood' && c[1] === 'calm') > wearAt, 'home does not greet you calm');
  const fresh = { updated: 2, mood: 'calm', form: 'orb', scheme: 'sea', body: {} };
  h.me.res(answer({ presence: { handle: 'orion', worn: fresh } }));
  await settle();
  assert.equal(h.worn().length, 2);
  assert.equal(h.worn()[1][1], fresh, 'the record from sign-in stays on after the current one answered');
  assert.equal(h.rig.myPresence.worn, fresh);
  // the same record again is not put on again (it would restart its shape)
  const same = homeRig({ handle: 'orion', worn: cached });
  same.rig.homeContext();
  same.me.res(answer({ presence: { handle: 'orion', worn: { ...cached } } }));
  await settle();
  assert.equal(same.worn().length, 1);
});

await ok('a presence that has chosen nothing yet rests in its profile colour', () => {
  const h = homeRig({ handle: 'orion', scheme: 'dusk', worn: { mood: 'calm', form: 'orb', scheme: 'stardust' } });
  h.rig.homeContext();
  assert.deepEqual(h.worn()[0], ['wear', null, 'dusk']);
  const guest = homeRig(null);
  guest.rig.homeContext();
  assert.deepEqual(guest.worn()[0], ['wear', null, 'stardust']);
});

await ok('nothing that answers after you left home lands on the orb you went to see', async () => {
  const h = homeRig({ handle: 'orion', worn: { updated: 1 } });
  h.rig.homeContext();
  h.rig.leave();                         // into someone's room before either answered
  h.graph.res(answer({ nodes: [{ id: 1, dir: [0, 0, 1] }] }));
  h.me.res(answer({ presence: { handle: 'orion', worn: { updated: 2, form: 'web' } } }));
  await settle();
  assert.ok(!h.calls.some((c) => c[0] === 'setMemoryVisible' && c[1] === true), 'your memories were drawn on their orb');
  assert.ok(!h.calls.some((c) => c[0] === 'setMemoryGraph'), 'your graph was handed to their orb');
  assert.equal(h.worn().length, 1, 'your body was put on their orb');
  const home = homeRig({ handle: 'orion', worn: { updated: 1 } });
  home.rig.homeContext();
  home.graph.res(answer({ nodes: [{ id: 1, dir: [0, 0, 1] }] }));
  await settle();
  assert.ok(home.calls.some((c) => c[0] === 'setMemoryVisible' && c[1] === true), 'at home the constellation is not drawn at all');
});

const makeEnter = new Function('d', `
  const { body, social, windows, score, $, showCaption, setMoodTag, applyBodyBlock, resetHistory, history, document, leaveHomeHosting } = d;
  let room = null; const account = null;
  const stopVoiceMode = () => {}, collapseTyping = () => {};
  ${fnOf('enterRoom')}
  return { enterRoom };
`);
await ok('entering someone\'s room takes your memories off the orb, and they cannot be tapped open there', () => {
  const calls = [];
  const { enterRoom } = makeEnter({
    body: recorder(calls), social: new Proxy({}, { get: () => () => {} }), windows: { recallHide: () => calls.push(['recallHide']) },
    score: { cancel() {} }, $: () => ({}), showCaption() {}, setMoodTag() {}, applyBodyBlock: (b) => calls.push(['applyBodyBlock', b]),
    resetHistory() {}, history: { clear() {} }, document: { body: { classList: { add() {}, remove() {}, toggle() {} } } },
    leaveHomeHosting: () => calls.push(['leaveHomeHosting']),
  });
  enterRoom({ handle: 'nova', name: 'Nova', live: false, worn: { updated: 1, body: { count: 2 } }, scheme: 'sea' });
  const names = calls.map((c) => c[0]);
  for (const n of ['selectMemory', 'setMemoryVisible', 'setMemoryGraph', 'recallHide']) assert.ok(names.includes(n), 'enterRoom does not call ' + n);
  assert.deepEqual(calls.find((c) => c[0] === 'setMemoryVisible'), ['setMemoryVisible', false]);
  assert.deepEqual(calls.find((c) => c[0] === 'setMemoryGraph'), ['setMemoryGraph', { nodes: [] }]);
  assert.ok(names.indexOf('wear') < names.indexOf('applyBodyBlock'), 'the body words go on before the body they belong to');
  // and a layer that is hidden cannot be tapped (body.js)
  assert.match(read('src/body.js'), /if \(dir && memOnTarget > 0 && memGraph && memGraph\.nodes && memGraph\.nodes\.length && onMemTap\) \{/,
    'a hidden constellation still answers a tap');
});

await ok('wear() puts on a whole body: everything the last one set goes back to rest first', () => {
  const b = read('src/body.js');
  const rest = between(b, '    restBody() {', '\n    },');
  for (const re of [/this\.setField\(\{ keep: COUNT \}\)/, /this\.setSwell\(1\)/, /idleTurn = 1; faceHeld = null; faceTheta = 0;/, /uniforms\.uGrain\.value = 1;/,
    /meshTarget = 0; glowTarget = 0\.8;/, /uniforms\.uFlashPeriod\.value = 0;/, /this\.home\(\);/, /if \(trailByWord\) \{ this\.setTrail\(0\); trailByWord = false; \}/,
    /if \(tideSet\) \{ setMercuryTide\(\[\], null\); tideSet = false; \}/]) assert.match(rest, re, 'restBody leaves this standing: ' + re);
  const wear = between(b, '    wear(w, fallbackScheme) {', '    // 0..1 — live energy');
  assert.match(wear, /^\s*wear\(w, fallbackScheme\) \{\s*this\.restBody\(\);/, 'wear() does not start from rest');
  assert.match(wear, /setMercuryLiquid\(\{ material: 0\.6, gravity: 0\.6 \}, \{ ms: 0 \}\); return; \}/, 'no record keeps the last liquid');
  assert.match(wear, /this\.setLiquid\(\{ material: w\.material \?\? 0\.6, gravity: w\.gravity \?\? 0\.6, tide: w\.tide \|\| null \}, \{ ms: 0 \}\);/, 'the record\'s liquid and tide are not worn');
  assert.match(b, /if \(s\.tide\) \{ setMercuryTide\(s\.tide\.gestures, s\.tide\.lean\); tideSet = true; \}/);
});

const makeHandle = new Function('d', `
  const { voice, camera, social, tend, runReply, respondStream, goLiveAndPublish, window, showInvite, windows } = d;
  let busy = false, roomGen = 0, hostAside = null; const camOwners = new Set();
  const room = d.room;
  ${fnOf('handle')}
  return { handle };
`);
await ok('a line typed in a tab that is not broadcasting stays in that tab', async () => {
  for (const [hosting, priv, sent] of [[false, false, false], [true, false, true], [true, true, false]]) {
    const words = [];
    const { handle } = makeHandle({
      voice: { isListening: () => false, stopListening() {} }, camera: { captureFrame: () => null },
      social: { isHosting: () => hosting, publishWords: (h, t) => words.push([h, t]), publishMonologue() {} },
      tend: { isAlive: () => false, noteChat() {} }, runReply: async () => ({ speech: 'ok', local: false }), respondStream() {},
      goLiveAndPublish() {}, window: { dispatchEvent() {} }, showInvite() {}, windows: { monoAppend() {} },
      room: { presence: { handle: 'orion' }, mode: 'host' },
    });
    await handle('something private', null, { private: priv });
    assert.equal(words.length, sent ? 1 : 0, `broadcasting ${hosting}, private ${priv}: ${JSON.stringify(words)}`);
  }
});

await ok('an input method\'s Enter picks a candidate; it does not send', () => {
  const at = MAIN.indexOf("chatInput.addEventListener('keydown', (e) => {");
  assert.ok(at > 0, 'the chat box\'s key handler is gone');
  const src = MAIN.slice(MAIN.indexOf('(e) => {', at), MAIN.indexOf('\n});', at) + 2);
  let sent = 0, collapsed = 0;
  const onKey = new Function('collapseTyping', 'sendChat', 'chatInput', `return ${src};`)(() => { collapsed += 1; }, () => { sent += 1; }, { blur() {} });
  const press = (o) => onKey({ preventDefault() {}, shiftKey: false, keyCode: 13, ...o });
  press({ key: 'Enter', isComposing: true });
  press({ key: 'Enter', keyCode: 229 });
  press({ key: 'Escape', isComposing: true });
  assert.equal(sent, 0, 'Enter in the middle of a composition sent the line');
  assert.equal(collapsed, 0, 'Escape in the middle of a composition closed the chat');
  press({ key: 'Enter', shiftKey: true });
  assert.equal(sent, 0);
  press({ key: 'Enter' });
  assert.equal(sent, 1, 'a plain Enter no longer sends');
  assert.match(read('src/mine.js'), /say\.addEventListener\('keydown', \(e\) => \{ if \(e\.isComposing \|\| e\.keyCode === 229\) return; if \(e\.key === 'Enter'\)/, 'the mine\'s box sends half a word');
  assert.match(SET, /\$\('music-q'\)\.addEventListener\('keydown', \(e\) => \{\s*if \(e\.isComposing \|\| e\.keyCode === 229\) return;/, 'the music search sends half a word');
});

await ok('without the liquid, the entrance does not wait two seconds for it', () => {
  const ent = between(MAIN, '// THE ENTRANCE.', '// A way through to the other world.');
  const i = ent.indexOf('if (sdfMercury) {');
  assert.ok(i > 0, 'the liquid wait is no longer behind sdfMercury');
  const j = ent.indexOf('new MutationObserver(');
  assert.ok(j > i && j < ent.indexOf('\n  }\n', i), 'the observer is waited for outside the sdfMercury guard');
  assert.match(ent, /mo\?\.disconnect\(\);/, 'an observer that lost the race is left watching');
  // the session check it follows is left as it was (fixed in the merge before this)
  assert.match(ent, /const who = await withTimeout\(asked, 2500, null\);/);
});

globalThis.setInterval = realSetInterval;
Date.now = realNow;
console.log(`\n${passed} checks passed.`);
