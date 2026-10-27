// WAKE IT IN ONE CLICK (2026-10-26). A presence thinks on its owner's own key
// or plan, and the site has none of its own (2026-10-12); a new person used to
// fetch an API key from a console and paste it (Colin, 2026-10-25: "copying
// and pasting keys is not user-friendly"). OpenRouter hands a site a key of
// the person's own through OAuth with PKCE, and its free models cost nothing.
//
// What is held here: the PKCE maths (RFC 7636's own example), the address the
// window opens, the return page's half (a code traded once, with the verifier
// kept for it, refused for another browser's state or a stale start), the
// page's half run with stand-ins (consent first; the window opened, or the
// whole page when it is blocked; the key taken once, checked by the site, a
// free model chosen unless the account has bought credit, kept when it could
// not be checked), and the lines that keep it honest: the consent note and the
// terms say the same things, the page may reach OpenRouter and nothing more of
// it, the key and the verifier are forgotten with the account, and the room
// offers the click where nothing was chosen to think on.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import {
  OR_AUTH, OR_KEYS, RETURN_PATH, PKCE_SLOT, KEY_SLOT, CONSENT, CONSENT_GUEST, CONSENT_KIND, SLOT_MS,
  b64url, challengeOf, pkcePair, authUrl, isFreeModel, pickFreeModel, pickPaidModel, connectModel, oneClickHere,
  finishReturn, createWake,
} from '../src/openrouter.js';
import { appShellCsp } from '../security.mjs';
import { moderateImage, pickFreeJudge } from '../moderation.mjs';
import { upstreamWhy } from '../upstream-why.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), has: (k) => m.has(k), raw: m }; };
const json = (d, okk = true) => ({ ok: okk, json: async () => d });
const settle = () => new Promise((r) => setTimeout(r, 0));

// today's free list on OpenRouter (2026-10-26), and a few paid ones beside it
const TODAY = [
  'cohere/north-mini-code:free', 'dots-studio/dots-3-note-preview:free', 'google/gemma-4-26b-a4b-it:free', 'google/gemma-4-31b-it:free',
  'liquid/lfm-2.5-2.6b:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3.5-content-safety:free', 'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3.5-super-vl:free', 'poolside/laguna-s-2.1:free', 'poolside/laguna-xs-2.1:free', 'recursive/flint-v1.0:free',
  'thinkingmachines/inkling-small:free', 'thinkingmachines/inkling:free', 'xingchen-agi/xing4.0-29b-a4b:free',
  'anthropic/claude-sonnet-5.5', 'openai/gpt-4o-mini', 'openai/gpt-5.5',
].map((id) => ({ id, label: id }));

console.log('\nthe key, asked for the PKCE way (src/openrouter.js):');

await ok('the challenge is RFC 7636\'s own example, and a pair is fresh, long enough and self-consistent', async () => {
  assert.equal(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', webcrypto), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(b64url(new Uint8Array([251, 255, 254])), '-__-', 'base64url, unpadded');
  const a = await pkcePair(webcrypto), b = await pkcePair(webcrypto);
  assert.match(a.verifier, /^[A-Za-z0-9_-]{64}$/, 'RFC 7636 asks for 43 to 128 unreserved characters');
  assert.match(a.state, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(a.challenge, await challengeOf(a.verifier, webcrypto));
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.state, b.state);
});

await ok('the window opens OpenRouter\'s own page, and asks to come back to this site\'s return page', () => {
  const u = new URL(authUrl({ challenge: 'CH', state: 'ST', origin: 'https://yearthreethousand.com/' }));
  assert.equal(u.origin + u.pathname, OR_AUTH);
  assert.equal(u.searchParams.get('callback_url'), 'https://yearthreethousand.com' + RETURN_PATH);
  assert.equal(u.searchParams.get('code_challenge'), 'CH');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('state'), 'ST');
  assert.equal(u.searchParams.get('key_label'), 'yearthreethousand', 'the key is named on the person\'s OpenRouter account');
  assert.equal(new URL(authUrl({ challenge: 'c', state: 's', origin: 'http://localhost:5199' })).searchParams.get('callback_url'), 'http://localhost:5199/openrouter.html');
});

await ok('the desktop app is not offered a click it cannot finish (its windows open in the system browser), nor a browser with no secure random numbers', () => {
  assert.equal(oneClickHere({ userAgent: 'Mozilla/5.0 (Macintosh) Chrome/156.0 Safari/537.36' }, webcrypto), true);
  assert.equal(oneClickHere({ userAgent: 'Mozilla/5.0 (Macintosh) Chrome/156.0 Electron/38.1.0 Safari/537.36 y3k-desktop/0.4.2' }, webcrypto), false);
  assert.equal(oneClickHere({ userAgent: 'Mozilla/5.0' }, {}), false, 'an insecure page (no crypto.subtle) began a connection it cannot');
  assert.match(read('desktop/main.cjs'), /setUserAgent\(`\$\{w\.webContents\.getUserAgent\(\)\} y3k-desktop\/\$\{VERSION\}`\)/, 'the marker this reads is gone from the app');
  // and the lines say only the ways that work there
  const b = read('src/brain.js');
  assert.match(b, /const accountLine = \(to\) => \(oneClickHere\(\)/);
  assert.match(b, /: `\$\{to\}, add your own API key or choose Claude Code in Settings → Brain\. The site has no AI key of its own\.`\);/);
  assert.match(b, /const guestLine = \(to\) => \(oneClickHere\(\)/);
});

console.log('\nthe return page\'s half (finishReturn):');

const started = (store, extra = {}) => store.setItem(PKCE_SLOT, JSON.stringify({ verifier: 'VER', state: 'STATE', at: 1000, popup: true, page: 'PAGE', who: 'guest', ...extra }));

await ok('the code is traded once, with the verifier kept for it, and the key is left for the tab that asked', async () => {
  const store = memStore(); started(store);
  const asked = [];
  const fetchFn = async (url, init) => { asked.push([url, JSON.parse(init.body), init.method]); return json({ key: 'sk-or-v1-abc' }); };
  const r = await finishReturn({ search: '?code=CODE&state=STATE', store, fetchFn, now: () => 2000 });
  assert.deepEqual(r, { ok: true, popup: true });
  assert.deepEqual(asked, [[OR_KEYS, { code: 'CODE', code_verifier: 'VER', code_challenge_method: 'S256' }, 'POST']]);
  assert.deepEqual(JSON.parse(store.getItem(KEY_SLOT)), { key: 'sk-or-v1-abc', at: 2000, page: 'PAGE', who: 'guest' }, 'the key does not say which page asked, for whom');
  assert.equal(store.has(PKCE_SLOT), false, 'the verifier outlived its one use');
  const s2 = memStore(); started(s2, { popup: false });
  assert.deepEqual(await finishReturn({ search: '?code=C2&state=STATE', store: s2, fetchFn, now: () => 2000 }), { ok: true, popup: false });
});

await ok('…and refused, with nothing kept and nothing asked, for another browser\'s state, a stale start, no start, or no code', async () => {
  let asked = 0;
  const fetchFn = async () => { asked += 1; return json({ key: 'sk-or-v1-x' }); };
  const cases = [
    ['?code=C&state=OTHER', (s) => started(s), 2000, /not for this browser/],
    // no state at all: a code begun with no challenge, planted in a link while a verifier waits, would trade
    // for the planter's key and the presence would think on an account they can read (review, 2026-10-26)
    ['?code=PLANTED', (s) => started(s), 2000, /not for this browser/],
    ['?code=PLANTED&state=', (s) => started(s), 2000, /not for this browser/],
    ['?code=C&state=STATE', (s) => started(s), 1000 + SLOT_MS + 1, /too long ago/],
    ['?code=C&state=STATE', () => {}, 2000, /too long ago, or in another browser/],
    ['?error=access_denied', (s) => started(s), 2000, /sent no key back/],
  ];
  for (const [search, setup, at, line] of cases) {
    const store = memStore(); setup(store);
    const r = await finishReturn({ search, store, fetchFn, now: () => at });
    assert.equal(r.ok, false, search);
    assert.match(r.line, line, search);
    assert.equal(store.has(KEY_SLOT), false, search);
    assert.equal(store.has(PKCE_SLOT), false, `${search}: a verifier that failed is kept for another try`);
  }
  assert.equal(asked, 0, 'a code was traded for a start that was not this browser\'s');
});

await ok('…and a refusal from OpenRouter, a broken answer, or something that is not an OpenRouter key keeps nothing', async () => {
  for (const fetchFn of [async () => json({ error: 'bad code' }, false), async () => { throw new TypeError('fetch failed'); }, async () => json({ key: 'sk-ant-not-theirs' }), async () => json({})]) {
    const store = memStore(); started(store);
    const r = await finishReturn({ search: '?code=C&state=STATE', store, fetchFn, now: () => 2000 });
    assert.equal(r.ok, false);
    assert.equal(store.has(KEY_SLOT), false);
  }
});

console.log('\nthe model it wakes on:');

await ok('an account that never bought credit wakes on a free model made for talking, served by its makers — today, Inkling', () => {
  assert.equal(pickFreeModel(TODAY), 'thinkingmachines/inkling:free');
  assert.equal(connectModel(TODAY, true), 'thinkingmachines/inkling:free');
  assert.equal(connectModel(TODAY, undefined), 'thinkingmachines/inkling:free', 'not knowing is not paying: a paid model is refused with 402 there');
  // Gemma's free models answer only through Google AI Studio (which has refused Gemma a system prompt): after the makers' own
  const noMakers = TODAY.filter((m) => !/^thinkingmachines\/inkling:free$|super-vl/.test(m.id));
  assert.equal(pickFreeModel(noMakers), 'google/gemma-4-31b-it:free');
  // an account that has paid before may have nothing left now (is_free_tier says only that): the one click
  // wakes it on a free model too, and never fails for want of credit (review, 2026-10-26)
  assert.equal(connectModel(TODAY, false), 'thinkingmachines/inkling:free');
  assert.ok(isFreeModel('x/y:free') && !isFreeModel('x/y') && !isFreeModel(null));
});

await ok('…never a classifier or a model made for code, whatever the list holds, and nothing when nothing is free', () => {
  const odd = ['cohere/north-mini-code:free', 'nvidia/nemotron-3.5-content-safety:free', 'meta-llama/llama-guard-4:free', 'acme/chat-7b:free'].map((id) => ({ id }));
  assert.equal(pickFreeModel(odd), 'acme/chat-7b:free');
  assert.equal(pickFreeModel([{ id: 'nvidia/nemotron-3.5-content-safety:free' }]), null);
  assert.equal(pickFreeModel(['thinkingmachines/inkling:free', 'nvidia/nemotron-3.5-super-vl:free']), 'thinkingmachines/inkling:free', 'ids as plain strings too');
  assert.equal(connectModel([{ id: 'openai/gpt-5.5' }], true), null, 'a free account handed a paid model');
  assert.equal(connectModel([{ id: 'openai/gpt-5.5' }], undefined), 'openai/gpt-5.5');
  assert.equal(connectModel([{ id: 'openai/gpt-4o-mini' }, { id: 'openai/gpt-5.5' }], false), 'openai/gpt-4o-mini', 'no free model, an account that has paid: what Settings → Brain has always chosen');
  assert.equal(pickPaidModel([{ id: 'z/z' }, { id: 'anthropic/claude-sonnet-5.5' }]), 'anthropic/claude-sonnet-5.5');
});

console.log('\nthe page\'s half (createWake), with stand-ins:');

function page({ answer = 'once', blocked = false, models = TODAY, free = true, daily = { limit: 50, remaining: 50 }, modelsFail = false, whoIs = 'acct-1', store: shared = null } = {}) {
  const store = shared || memStore();
  const seen = { consent: [], opened: [], assigned: [], configs: [], kept: [], chose: [], connected: [], failed: [], lookups: [] };
  const listeners = {};
  const win = {
    location: { origin: 'https://yearthreethousand.com', assign: (u) => seen.assigned.push(u) },
    open: (u, name, feat) => { seen.opened.push([u, name, feat]); return blocked ? null : {}; },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
  };
  const fetchFn = async (url, init) => {
    seen.lookups.push([url, JSON.parse(init.body)]);
    if (modelsFail) throw new TypeError('fetch failed');
    return json({ provider: 'openrouter', models, ...(free !== undefined ? { free } : {}), ...(daily ? { daily } : {}) });
  };
  const wake = createWake({
    consent: async (c) => { seen.consent.push(c); return answer; },
    setBrainConfig: (c) => seen.configs.push(c),
    keepKey: (p, k) => seen.kept.push([p, k]),
    choose: (v) => seen.chose.push(v),
    onConnected: (c) => seen.connected.push(c),
    onFailed: (l) => seen.failed.push(l),
    who: () => whoIs,
    store, win, fetchFn, cryptoImpl: webcrypto, now: () => 5000,
  });
  return { wake, store, seen, fire: (t, e) => (listeners[t] || []).forEach((f) => f(e)) };
}

await ok('the press asks first, then opens OpenRouter in a small window, with the verifier kept for its return', async () => {
  const p = page();
  await p.wake.prepare();
  assert.equal(await p.wake.wake(), true);
  assert.deepEqual(p.seen.consent, [CONSENT]);
  const guest = page({ whoIs: 'guest' });
  await guest.wake.wake();
  assert.deepEqual(guest.seen.consent, [CONSENT_GUEST], 'a guest is not told the key goes at the next sign-in');
  assert.equal(p.seen.opened.length, 1);
  const [url, name, feat] = p.seen.opened[0];
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, OR_AUTH);
  assert.equal(name, 'y3k-openrouter');
  assert.match(feat, /popup/);
  const slot = JSON.parse(p.store.getItem(PKCE_SLOT));
  assert.equal(slot.state, u.searchParams.get('state'));
  assert.equal(await challengeOf(slot.verifier, webcrypto), u.searchParams.get('code_challenge'), 'the challenge sent is not the verifier kept');
  assert.equal(slot.popup, true);
  assert.equal(slot.at, 5000);
  assert.equal(slot.page, p.wake.page, 'the start does not say which page asked');
  assert.equal(slot.who, 'acct-1', 'the start does not say whose the key will be');
  assert.deepEqual(p.seen.assigned, [], 'the page left as well as opening the window');
  // a second press is a second connection, with a pair of its own
  await p.wake.wake();
  assert.notEqual(new URL(p.seen.opened[1][0]).searchParams.get('state'), u.searchParams.get('state'));
});

await ok('…cancel opens nothing and keeps nothing; a blocked window sends the whole page instead', async () => {
  const c = page({ answer: null });
  assert.equal(await c.wake.wake(), false);
  assert.deepEqual(c.seen.opened, []);
  assert.equal(c.store.has(PKCE_SLOT), false);
  const b = page({ blocked: true });
  await b.wake.wake();
  assert.equal(b.seen.assigned.length, 1);
  assert.equal(b.seen.assigned[0], b.seen.opened[0][0]);
  assert.equal(JSON.parse(b.store.getItem(PKCE_SLOT)).popup, false, 'the return page would wait to close a window that is not there');
});

await ok('the key is taken once: checked by the site, a free model chosen, OpenRouter chosen, and said', async () => {
  const p = page();
  p.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-k', at: 4000, page: p.wake.page, who: 'acct-1' }));
  const [r1, r2] = await Promise.all([p.wake.take(), p.wake.take()]);
  assert.deepEqual(r1, { model: 'thinkingmachines/inkling:free' });
  assert.equal(r2, r1, 'two takes at once took it twice');
  assert.deepEqual(p.seen.lookups, [['/api/brain/models', { key: 'sk-or-v1-k', provider: 'openrouter' }]]);
  assert.deepEqual(p.seen.configs, [{ provider: 'openrouter', key: 'sk-or-v1-k', model: 'thinkingmachines/inkling:free' }]);
  assert.deepEqual(p.seen.chose, ['openrouter']);
  assert.equal(p.seen.connected.length, 1);
  assert.equal(p.seen.connected[0].model, 'thinkingmachines/inkling:free');
  assert.deepEqual(p.seen.connected[0].daily, { limit: 50, remaining: 50 });
  assert.equal(p.store.has(KEY_SLOT), false, 'the handoff outlived its taking');
  assert.equal(await p.wake.take(), null, 'taken again');
  // on an account that has bought credit, still a free model: its balance may be nothing now
  const paid = page({ free: false });
  paid.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-p', at: 4000, page: paid.wake.page, who: 'acct-1' }));
  assert.deepEqual(await paid.wake.take(), { model: 'thinkingmachines/inkling:free' });
});

await ok('…only by the page that asked, or at the door for the person it was asked for — never another tab\'s, never another person\'s', async () => {
  const shared = memStore();
  const a = page({ store: shared }), b = page({ store: shared });
  assert.notEqual(a.wake.page, b.wake.page);
  shared.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-a', at: 4000, page: a.wake.page, who: 'acct-1' }));
  assert.equal(await b.wake.take(), null, 'another tab took the key its window brought back');
  assert.ok(shared.has(KEY_SLOT), 'another tab threw away the key it left alone');
  assert.deepEqual(await a.wake.take(), { model: 'thinkingmachines/inkling:free' });
  // the page that asked is gone (the whole page went to OpenRouter): the door takes it for the same person
  shared.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-r', at: 4000, page: 'a-page-long-gone', who: 'acct-1' }));
  assert.equal(await b.wake.take(), null);
  assert.deepEqual(await b.wake.take({ any: true }), { model: 'thinkingmachines/inkling:free' });
  // …but a key begun for someone else is not handed to whoever is at the door now: it is dropped unused
  const c = page({ whoIs: 'acct-2' });
  c.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-x', at: 4000, page: 'gone', who: 'acct-1' }));
  assert.equal(await c.wake.take({ any: true }), null);
  assert.deepEqual(c.seen.configs, [], 'the next person through the door thinks on the last one\'s key');
  assert.deepEqual(c.seen.lookups, []);
  assert.equal(c.store.has(KEY_SLOT), false);
  const g = page({ whoIs: 'guest' });
  g.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-x', at: 4000, page: g.wake.page }));
  assert.equal(await g.wake.take(), null, 'a key that says for nobody was taken');
});

await ok('…a stale or foreign handoff is dropped unread; a key the site could not check is kept, not used, and said', async () => {
  for (const slot of [{ key: 'sk-or-v1-k', at: 5000 - SLOT_MS - 1 }, { key: 'sk-ant-x', at: 4000 }, { at: 4000 }]) {
    const p = page();
    p.store.setItem(KEY_SLOT, JSON.stringify({ ...slot, page: p.wake.page, who: 'acct-1' }));
    assert.equal(await p.wake.take(), null);
    assert.deepEqual(p.seen.lookups, [], 'a stale or foreign key was sent to the site');
    assert.deepEqual(p.seen.configs, []);
    assert.equal(p.store.has(KEY_SLOT), false);
  }
  const f = page({ modelsFail: true });
  f.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-k', at: 4000, page: f.wake.page, who: 'acct-1' }));
  assert.equal(await f.wake.take(), null);
  assert.deepEqual(f.seen.configs, [], 'a key nobody could check was put in use');
  assert.deepEqual(f.seen.kept, [['openrouter', 'sk-or-v1-k']], 'the person\'s key was thrown away');
  assert.match(f.seen.failed[0], /kept in this browser: Settings → Brain can put it to use/);
  const none = page({ models: [{ id: 'openai/gpt-5.5' }], free: true });
  none.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-k', at: 4000, page: none.wake.page, who: 'acct-1' }));
  assert.equal(await none.wake.take(), null);
  assert.match(none.seen.failed[0], /no free model/);
});

await ok('…and a key landing while the page is open is heard (the window\'s storage event), once listening, and only its own', async () => {
  const p = page();
  p.store.setItem(KEY_SLOT, JSON.stringify({ key: 'sk-or-v1-k', at: 4000, page: p.wake.page, who: 'acct-1' }));
  p.fire('storage', { key: KEY_SLOT, newValue: '{}' });
  await settle(); await settle();
  assert.deepEqual(p.seen.configs, [], 'a page still at the door heard the key (main.js listens only past it)');
  p.wake.listen(); p.wake.listen();
  p.fire('storage', { key: 'other', newValue: 'x' });
  p.fire('storage', { key: KEY_SLOT, newValue: null });
  await settle();
  assert.deepEqual(p.seen.configs, [], 'a removal, or another key, was taken as the handoff');
  p.fire('storage', { key: KEY_SLOT, newValue: '{}' });
  await settle(); await settle();
  assert.equal(p.seen.configs.length, 1, 'heard twice, or not at all');
});

console.log('\na picture posted on a key with no credit (the screening\'s judge):');

await ok('a refused judge says why to the server (never to the page), and a want of credit is read as credit', async () => {
  const refusing = { chat: async () => ({ ok: false, status: 402, detail: 'Insufficient credits. Add more using https://openrouter.ai/credits' }) };
  const v = await moderateImage(refusing, 'sk-or-v1-x', 'openai/gpt-4o-mini', 'aGVsbG8=');
  assert.equal(v.safe, false, 'a judge that did not answer let the picture through');
  assert.equal(v.reason, "couldn't check the image");
  assert.equal(upstreamWhy({ ok: false, status: v.status, detail: v.detail }), 'credit');
  const daily = { chat: async () => ({ ok: false, status: 429, detail: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day' }) };
  const d = await moderateImage(daily, 'sk-or-v1-x', 'google/gemma-4-31b-it:free', 'aGVsbG8=');
  assert.equal(upstreamWhy({ ok: false, status: d.status, detail: d.detail }), 'daily');
  const fine = { chat: async () => ({ ok: true, text: '{"safe": true, "reason": ""}' }) };
  assert.deepEqual(await moderateImage(fine, 'sk-or-v1-x', 'google/gemma-4-31b-it:free', 'aGVsbG8='), { safe: true, reason: '' });
});

await ok('the free judge sees pictures, follows an instruction, and is the server\'s pick from the catalog (today Nemotron 3.5 Super VL)', () => {
  const vision = (id) => ({ id, architecture: { input_modalities: ['text', 'image'] } });
  const today = { data: [
    vision('nvidia/nemotron-3.5-content-safety:free'), vision('dots-studio/dots-3-note-preview:free'), vision('nvidia/nemotron-3.5-super-vl:free'),
    vision('google/gemma-4-26b-a4b-it:free'), vision('google/gemma-4-31b-it:free'), vision('openai/gpt-4o-mini'),
    { id: 'nvidia/nemotron-3.5-lightning:free', architecture: { input_modalities: ['text'] } }, { id: 'acme/no-modalities:free' },
  ] };
  assert.equal(pickFreeJudge(today), 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(pickFreeJudge(today.data), 'nvidia/nemotron-3.5-super-vl:free', 'the list itself, too');
  assert.equal(pickFreeJudge(today.data.filter((m) => !/super-vl/.test(m.id))), 'google/gemma-4-31b-it:free', 'after the makers\' own, Gemma');
  assert.equal(pickFreeJudge({ data: [vision('nvidia/nemotron-3.5-content-safety:free'), { id: 'x/text-only:free', architecture: { input_modalities: ['text'] } }] }), null,
    'a classifier with a format of its own, or a model that cannot see, was made the judge');
  assert.equal(pickFreeJudge({ data: [vision('acme/see-7b:free')] }), 'acme/see-7b:free');
  assert.equal(pickFreeJudge(null), null);
  // the route: the pinned judge first, the free one only on a want of credit, the day's end said as itself, both screenings through it
  const srv = read('server.mjs');
  const route = srv.slice(srv.indexOf("if (req.method === 'POST' && reqPath === '/api/posts') {"), srv.indexOf('// ===== Chess'));
  assert.match(route, /let v = await moderateImage\(judge, b\.key, judge\.defaultModel\(\), img\);/);
  assert.match(route, /pid === 'openrouter' && upstreamWhy\(\{ ok: false, status: v\.status, detail: v\.detail \}\) === 'credit'\) \{\s*const free = await freeJudgeModel\(\);\s*if \(free\) v = await moderateImage\(judge, b\.key, free, img\);/);
  assert.match(route, /=== 'daily'\) \{\s*v = \{ safe: false, reason: "today's free OpenRouter requests are used up, so it could not be checked" \};/);
  assert.equal((route.match(/moderateImage\(/g) || []).length, 2, 'a screening that does not go through screen()');
  assert.match(route, /const verdict = await screen\(frame\);/);
  assert.match(route, /const verdict = await screen\(item\.data\);/);
  assert.ok(!/detail/.test(route.slice(route.indexOf('const verdict = await screen(frame);'))), 'the judge\'s own words reach the page');
});

console.log('\nwhat keeps it honest:');

await ok('the consent note and the terms say the same things, and the terms carry their own field', () => {
  assert.equal(CONSENT.kind, CONSENT_KIND);
  const legal = read('legal.html');
  const m = /<li id="terms-openrouter">([\s\S]*?)<\/li>/.exec(legal);
  assert.ok(m, 'no field for it in the terms');
  const terms = m[1];
  for (const [what, inNote, inTerms] of [
    ['what it opens', /opens OpenRouter/, /opens OpenRouter/],
    ['where the key is kept', /back to this browser only/, /back to your browser only/],
    ['that the site keeps none', /never saved on the server/, /never saved on our server/],
    ['who bills it', /OpenRouter bills/, /OpenRouter bills/],
    ['what free costs', /free models cost nothing, up to 50 requests a day \(1,000 once you have bought at least 10 credits there\)/, /free models cost nothing[\s\S]*50, or 1,000 once you have bought at least 10 credits/],
    ['that it wakes on a free model', /it wakes on a free model/, /it wakes on a free model/],
    ['how to stop it', /delete the key on OpenRouter/, /delete the key on OpenRouter/],
    ['and signing out', /signing out removes it from this browser/, /signing out removes it from this browser/],
    ['and a shared computer', /On a shared computer, sign out of OpenRouter too\./, /on a shared computer, sign out of OpenRouter too/],
  ]) {
    assert.match(CONSENT.note, inNote, `the note does not say ${what}`);
    assert.match(terms, inTerms, `the terms do not say ${what}`);
  }
  assert.match(terms, /you may allow it once or always; pressing it is agreeing to this/);
  // and a guest is told, there and in the terms, that a guest's key is forgotten at the next sign-in, theirs included
  assert.match(CONSENT_GUEST.note, /As a guest, the key stays in this browser until someone signs in here, you included; then it is forgotten/);
  assert.match(terms, /If you connect as a guest, the key stays in your browser until someone signs in there, you included; then it is forgotten/);
  assert.equal(CONSENT_GUEST.kind, CONSENT.kind, 'a guest\'s always would be remembered apart');
  // the wording OpenRouter's limits page uses: 1,000 needs at least 10 credits bought, not any credit
  for (const f of ['src/openrouter.js', 'src/brain.js', 'src/settings.js', 'legal.html', 'README.md']) assert.ok(!/until (?:you add|the account adds) credits|then 1,000/.test(read(f)), `${f} says any credit unlocks 1,000`);
  // and the privacy page no longer says the site thinks on a key of its own (gone 2026-10-12)
  assert.ok(!/talks on y3k's own Anthropic key|daily\s+allowance per account that we pay for/.test(legal), 'the privacy page says the site pays for a brain');
  assert.match(legal, /The site has no AI key and no voice account of its own/);
});

await ok('the page may reach OpenRouter, and only its host: the key comes from there, not through this site', () => {
  const dir = appShellCsp([]).split('; ').find((d) => d.startsWith('connect-src '));
  assert.ok(dir.split(' ').includes('https://openrouter.ai'), 'the return page cannot trade its code');
  assert.ok(!/openrouter\.ai\/|\*\.openrouter/.test(dir), 'more of OpenRouter than its host');
});

await ok('the return page is small, takes the code out of the address bar first, and loads nothing of the room', () => {
  const html = read('openrouter.html');
  assert.match(html, /<script type="module" src="\/src\/openrouter-return\.js"><\/script>/);
  const tags = html.replace(/<!--[\s\S]*?-->/g, '');   // what loads, not what the comments say
  assert.ok(!/type="importmap"|src="[^"]*(?:main\.js|three)|href="[^"]*styles\.css"/.test(tags), 'the room loads in the window');
  assert.deepEqual([...tags.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]), ['/src/openrouter-return.js']);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'an inline script (the page allows them by hash only)');
  const js = read('src/openrouter-return.js');
  assert.ok(js.indexOf('history.replaceState') < js.indexOf('finishReturn({'), 'the single-use code stays in the address bar while it is traded');
  assert.equal(RETURN_PATH, '/openrouter.html');
});

await ok('the key and its verifier are the person\'s, forgotten with them like every key', () => {
  const b = read('src/brain.js');
  const list = b.slice(b.indexOf('const ACCOUNT_KEYS'), b.indexOf('const OWNER_KEY'));
  for (const k of [KEY_SLOT, PKCE_SLOT, `y3k.consent.${CONSENT_KIND}`]) assert.ok(list.includes(`'${k}'`), `${k} outlives the account`);
});

await ok('the room offers the click where nothing was chosen, Settings → Brain has it, and the key waits for the door', () => {
  const main = read('src/main.js');
  assert.match(main, /if \(r\?\.nobrain && !priv\) showWake\(\);/, 'a turn with nothing chosen does not offer it');
  // the line the card replaces is never said: not captioned, not in the column, not spoken (review, 2026-10-26)
  assert.match(main, /const byCard = wake && !!result\?\.nobrain && wakeCanShow\(\);/);
  assert.match(main, /if \(speech && !byCard\) showCaption\(speech, 'y3k'\);/);
  assert.match(main, /else if \(speech && !byCard\) pushSpeak\(speech\);/);
  assert.match(main, /presence: hosting \}\), undefined, \{ wake: !priv \}\);/, 'a private (kode) line would be left unsaid for a card that never shows');
  // …and the reply runner hands the mark on (it returns a chosen set of fields: the first run in a browser lost it)
  assert.match(main, /invite: result\?\.invite \|\| null, nobrain: !!result\?\.nobrain \};/);
  // the conversation column is as it was: nothing to take back
  assert.ok(!/dropLast/.test(main) && !/dropLast/.test(read('src/history.js')));
  assert.match(main, /else setTimeout\(\(\) => \{ if \(!canLive\(\) && nothingChosen\(\)\) showWake\(\); \}, 2500\);/, 'an account coming home to nothing is not offered it');
  // taken only after whoever came in has claimed the browser: a key left for someone else is forgotten first
  const door = main.slice(main.indexOf('enterApp.now = function enterAppNow()'));
  assert.ok(door.indexOf('claimBrowser(account);') < door.indexOf('wakeFlow.take({ any: true });'), 'the key is taken before the door forgets what is not theirs');
  assert.ok(door.indexOf('wakeFlow.take({ any: true });') < door.indexOf('wakeFlow.listen();'), 'the page listens before the door');
  assert.equal(main.split('wakeFlow.listen();').length, 2, 'the page listens somewhere other than the door');
  assert.match(main, /who: \(\) => \(account\?\.id \? String\(account\.id\) : 'guest'\),/);
  assert.match(main, /viewing\(\) \|\| !\$\('wake'\)\?\.hidden\) return;/, 'the guest\'s arrival card can land on the wake card');
  assert.match(main, /createSettings\(body, \{[^}]*wake: oneClickHere\(\) \? \(\) => wakeFlow\.wake\(\) : null \}\)/);
  assert.match(main, /if \(!\$\('wake'\) \|\| !oneClickHere\(\)\) return false;/, 'the desktop app is offered a click it cannot finish');
  const html = read('index.html');
  for (const id of ['wake', 'wake-line', 'wake-go', 'wake-later']) assert.ok(html.includes(`id="${id}"`), `#${id} is missing`);
  const set = read('src/settings.js');
  assert.match(set, /orConnect\.hidden = v !== 'openrouter' \|\| !wake;/);
  assert.match(set, /return KEY_PROVIDERS\.find\(\(\[id\]\) => keyFor\(id\)\)\?\.\[0\] \|\| \(wake \? 'openrouter' : KEY_PROVIDERS\[0\]\[0\]\);/, 'nothing chosen does not land on the one-click provider');
  // and the server says whether the account has bought credit, without trusting the shape
  const srv = read('server.mjs');
  assert.match(srv, /const free = typeof info\.is_free_tier === 'boolean' \? info\.is_free_tier : undefined;/);
  assert.match(srv, /return \{ ok: true, models, free, daily \};/);
});

console.log(`\n${passed} checks passed`);
