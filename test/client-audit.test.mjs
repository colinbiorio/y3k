// THE CLIENT, AFTER A READ-THROUGH (2026-10-08). Run: node test/client-audit.test.mjs
//
// Ten things the browser client did, each found by reading it and confirmed by
// a second reading: a saved key put back in use behind a menu that said Site
// default; keys, voice keys and the hours left behind for the next account; a
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
  const terms = main.slice(main.indexOf('function askTerms()'), main.indexOf('// THE FOUNDER\'S OWN SIGN-IN'));
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
  const asked = [];
  route = async (url) => {
    asked.push(url);
    if (url === '/api/health') return answer({ brain: true });
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
  assert.equal(t.r.speech, '', 'a second caption would replace the words that were heard');
  assert.equal(t.r.seeded, true, 'it would go on air as a reply');
  assert.equal(t.r.mood, 'tender');
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
  };
  return el;
}
function openBrainPane({ pick = null, kept = null, inUse = null, own = null } = {}) {
  store.clear();
  if (pick) store.set('y3k.brainPick', pick);
  if (kept) store.set('y3k.brainKeys', JSON.stringify(kept));
  if (inUse) store.set('y3k.brain', JSON.stringify(inUse));
  if (own) store.set('y3k.ownBrain', JSON.stringify({ provider: own }));
  const els = {};
  const $ = (id) => (els[id] ||= element(id));
  const me = defer(), site = defer(), lookups = [];
  const fetch = (url) => {
    if (url === '/api/auth/me') return me.p;
    if (url === '/api/brain/models') { const d = defer(); lookups.push(d); return d.p; }
    return Promise.resolve(answer({}));
  };
  const stubs = {
    $, fetch, window, navigator: {},
    document: { createElement: () => ({ value: '', textContent: '', dataset: {} }) },
    getBrainConfig: brain.getBrainConfig, setBrainConfig: brain.setBrainConfig, keyFor: brain.keyFor, forgetKey: brain.forgetKey,
    hasServerBrain: () => site.p, checkOwnBrain: async () => false,
    ownChoiceFor: ownBrain.ownChoiceFor, setOwnChoice: ownBrain.setOwnChoice, ownModel: ownBrain.ownModel, setOwnModel: ownBrain.setOwnModel,
    heardModels: async () => null, ownState: () => ({ state: 'off' }), claudeCodeStatus: async () => ({ reach: 'offline' }),
    modelsFor: async () => [{ id: 'm-catalog' }], modelName: (id) => id,
    getControls: () => ({}), setControl() {}, onPaneShown: {}, modal: { hidden: false }, close() {},
    siteSetup: async () => null, pickBuild: () => null, detectPlatform: async () => null, savedPairing: () => null,
    updateY3kode: async () => null, waitForVersion: async () => false, lookAgain() {}, installClaudeCode: async () => null,
  };
  new Function('__s', `with (__s) {\n${helpers}\n${brainPane}\n}`)(new Proxy(stubs, { has: (t, k) => Object.prototype.hasOwnProperty.call(t, k) }));
  const models = (list) => answer({ models: list });
  return { els, me, site, lookups, models, provider: () => els['brain-provider'].value, keyField: () => els['brain-key'].value };
}
const meIs = (user) => answer({ user });

await ok('a saved pick of Site default never puts the kept key in use, whichever answer comes first', async () => {
  for (const order of ['site first', 'lookup first']) {
    const p = openBrainPane({ pick: 'site', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
    await settle();
    if (order === 'lookup first') { for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }])); await settle(); }
    p.site.res(true); p.me.res(meIs({ founder: false }));
    await settle();
    for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }]));
    await settle();
    assert.equal(p.provider(), 'site', `${order}: the menu does not say Site default`);
    assert.equal(brain.getBrainConfig(), null, `${order}: the person's own key is in use behind Site default`);
    assert.equal(brain.keyFor('anthropic')?.key, 'sk-ant-kept', `${order}: the kept key was thrown away`);
  }
});

await ok('the founder\'s Claude Code pick never puts the kept key in use either', async () => {
  const p = openBrainPane({ pick: 'claude', own: 'claude', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  await settle();
  for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }]));
  p.site.res(false); p.me.res(meIs({ founder: true }));
  await settle();
  for (const d of p.lookups) d.res(p.models([{ id: 'm-kept' }]));
  await settle();
  assert.equal(p.provider(), 'claude');
  assert.equal(brain.getBrainConfig(), null, 'an API key is billed while the menu says Claude Code');
});

await ok('a key provider still gets its kept key, once the site has answered', async () => {
  const p = openBrainPane({ pick: 'anthropic', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  await settle();
  assert.equal(p.lookups.length, 0, 'a key was looked up before the site said who you are');
  p.site.res(true); p.me.res(meIs({ founder: false }));
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
  p.site.res(true); p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.provider(), 'openai', 'the menu hides the key that is in use');
  p.lookups[0].res(p.models([{ id: 'm-openai' }]));
  await settle();
  assert.equal(brain.getBrainConfig()?.key, 'sk-proj-x');
});

await ok('a lookup that lands after Site default was chosen puts nothing in use', async () => {
  const p = openBrainPane({ pick: 'anthropic', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.site.res(true); p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.lookups.length, 1);
  p.els['brain-provider'].value = 'site';
  p.els['brain-provider'].fire('change');
  p.lookups[0].res(p.models([{ id: 'm-kept' }]));
  await settle();
  assert.equal(brain.getBrainConfig(), null);
  assert.equal(store.get('y3k.brainPick'), 'site');
});

await ok('a key typed before the site answered is not replaced by the kept one', async () => {
  const p = openBrainPane({ pick: 'anthropic', kept: { anthropic: { key: 'sk-ant-kept', model: 'm-kept' } } });
  p.els['brain-key'].value = 'sk-ant-typed';
  p.site.res(true); p.me.res(meIs({ founder: false }));
  await settle();
  assert.equal(p.keyField(), 'sk-ant-typed');
  assert.equal(p.lookups.length, 0, 'the kept key was looked up over the one being typed');
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

function tendRig({ engaged = () => false } = {}) {
  const calls = [];
  const s = { busy: false, gen: 0, hosting: false, room: { presence: { handle: 'orion' }, mode: 'host' }, alive: [] };
  const tend = createTend({
    body: recorder(calls), social: new Proxy({ isHosting: () => s.hosting }, { get: (t, k) => t[k] || ((...a) => { calls.push(['social.' + String(k), ...a]); }) }),
    showCaption: (t, w) => calls.push(['showCaption', t, w]), getRoom: () => s.room, getOwnHandle: () => 'orion', reader: {},
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
