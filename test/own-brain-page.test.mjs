// YOUR PRESENCE ON YOUR OWN SIGN-IN — THE PAGE'S HALF (src/own-brain.js).
// Run: node test/own-brain-page.test.mjs
//
// Colin, 2026-10-07: "i'm signed in with y3kode but it still says sign in." It
// waited behind a checkbox nobody had ticked. These pin what replaced it, for
// every signed-in account since 2026-10-12 (it was the founder's alone): an
// account with no key thinks on Claude Code by default, a guest never, and an
// explicit choice stands; the page offers a brain only once y3kode answers and
// can think, and stops offering it when y3kode goes away; the default also
// waits for Claude Code itself and lets go of a computer that cannot think;
// and Settings → Brain reads what y3kode says about Claude Code into one state
// with one next step.
//
// And since the review of 2026-10-12: the default is only for the account
// whose y3kode it is (the pairing and y3kode's yes belong to the computer, so
// on a shared browser or desktop app the next account would have thought on
// the last one's Claude plan), and a choice of another provider made here is
// said with every turn, so another page of the account cannot override it.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ownChoice, ownChoiceFor, setOwnChoice, ownDeclined, mayDefault, claudeCodeStatus, startOwnBrain, updateY3kode, waitForVersion, lookAgain, ownState, ownLive } from '../src/own-brain.js';
import { pair, movePairing, forgetPairing, savedPairing } from '../src/code/transport.js';
import { watchForEngine } from '../src/code/onboard.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
// this browser's pairing with y3kode, as kode saves it (src/code/transport.js)
const paired = (by) => store.set('y3k-code:pair', JSON.stringify({ port: 47821, token: 'tok', ...(by ? { by } : {}) }));
const A = { id: 'acct-a' }, B = { id: 'acct-b' };
const browser = {};                                   // a page with no desktop bridge
const desktop = { y3kCode: { cmd: async () => ({ ok: true }) } };   // the y3k app's (preload.cjs)
// another provider chosen in Settings → Brain, as it writes it: the pick, and
// the no to Claude Code with it (settings.js choose)
const chooseKeyProvider = (pick = 'openai', o) => { store.set('y3k.brainPick', pick); setOwnChoice({ provider: 'none' }, o); };

console.log('the choice:');

await ok('any account with no key thinks on Claude Code by default, on a y3kode it paired here; a guest does not', () => {
  store.clear();
  paired(A.id);
  assert.equal(ownChoice(), null);
  assert.deepEqual(ownChoiceFor(A, false, { win: browser }), { provider: 'claude', auto: true }, 'the founder\'s default is every account\'s');
  assert.equal(ownChoiceFor(A, true, { win: browser }), null, 'a key of their own comes first');
  assert.equal(ownChoiceFor(null, false, { win: browser }), null, 'a guest has no relay to offer it through');
});

await ok('an explicit choice stands: Claude Code, or another provider (stored as none)', () => {
  store.clear();
  setOwnChoice({ provider: 'claude' });
  assert.deepEqual(ownChoiceFor(A, true, { win: browser }), { provider: 'claude' });
  assert.deepEqual(ownChoiceFor(B, false, { win: desktop }), { provider: 'claude' }, 'a choice needs no pairing of its own: it was made at the computer');
  assert.equal(ownChoiceFor(null, true), null, 'not for a guest, even one this browser remembers choosing it');
  store.set('y3k.brainPick', 'anthropic');
  setOwnChoice(null);
  assert.deepEqual(ownChoice(), { provider: 'none' });
  paired(A.id);
  assert.equal(ownChoiceFor(A, false, { win: browser }), null, 'choosing another provider turns the default off');
});

await ok('a no left by the Site default there no longer is, or by the checkbox before the list, is no choice at all', async () => {
  // 2026-10-12: Site default stored y3k.brainPick 'site' and a no to Claude
  // Code beside it, and the checkbox before the list stored the no alone. Both
  // chose the site's key, which is gone: on that device every turn said
  // own: false for good, and the account's own sign-in was refused there.
  const brain = await import('../src/brain.js');
  for (const pick of ['site', null, 'claude']) {
    store.clear();
    paired(A.id);
    if (pick) store.set('y3k.brainPick', pick);
    store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
    assert.equal(ownChoice(), null, `${pick}: a lasting no to the account's own sign-in`);
    assert.equal(store.has('y3k.ownBrain'), false, `${pick}: kept, to be read as a no again`);
    store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
    assert.equal(ownDeclined(), false, `${pick}: this page still turns the account's own sign-in down`);
    store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
    assert.deepEqual(brain.keyFields(), {}, `${pick}: every turn still says own: false, so another page's offer is refused`);
    store.set('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
    assert.deepEqual(ownChoiceFor(A, false, { win: browser }), { provider: 'claude', auto: true }, `${pick}: the default does not apply on its own y3kode`);
  }
  // beside a pick of a key provider, the no stands
  for (const pick of ['anthropic', 'openai', 'openrouter']) {
    store.clear();
    paired(A.id);
    chooseKeyProvider(pick);
    assert.deepEqual(ownChoice(), { provider: 'none' }, pick);
    assert.equal(ownDeclined(), true, pick);
    assert.deepEqual(brain.keyFields(), { own: false }, pick);
    assert.equal(ownChoiceFor(A, false, { win: browser }), null, pick);
  }
  // and Claude Code chosen stands, whatever a stale pick says
  store.clear();
  store.set('y3k.brainPick', 'site');
  setOwnChoice({ provider: 'claude' });
  assert.deepEqual(ownChoice(), { provider: 'claude' });
  store.clear();
});

console.log('\nwhose y3kode it is:');

await ok('a y3kode another account paired in this browser is never the default', () => {
  store.clear();
  paired(A.id);
  assert.equal(ownChoiceFor(B, false, { win: browser }), null, 'B, signed in on A\'s browser, would think on A\'s Claude plan');
  assert.equal(mayDefault(B.id, { win: browser }), false);
  assert.equal(ownChoiceFor({ username: 'no-id' }, false, { win: browser }), null, 'an account whose id is not known is nobody\'s');
  // a pairing from before the account was kept with it is nobody's to default to
  paired(null);
  assert.equal(ownChoiceFor(A, false, { win: browser }), null);
  // and no pairing at all: nothing to think through by default
  store.clear();
  assert.equal(ownChoiceFor(A, false, { win: browser }), null);
});

await ok('the desktop app\'s y3kode is nobody\'s default until the account chooses Claude Code there', () => {
  store.clear();
  paired(A.id);   // even a pairing of A's in the same storage: the bridge is what is used there
  assert.equal(ownChoiceFor(A, false, { win: desktop }), null, 'whoever installed the app, nobody signed in here said yes');
  setOwnChoice({ provider: 'claude' }, { by: A.id });
  store.delete('y3k.ownBrain');   // signed out (brain.js forgetAccount) and back: the choice itself is gone
  assert.equal(ownChoice(), null);
  assert.deepEqual(ownChoiceFor(A, false, { win: desktop }), { provider: 'claude', auto: true }, 'A chose it here: the default is A\'s');
  assert.equal(ownChoiceFor(B, false, { win: desktop }), null, 'and never the next account\'s');
});

await ok('an account that chose Claude Code on this device keeps the default; choosing another drops it', () => {
  store.clear();
  paired(A.id);
  setOwnChoice({ provider: 'claude' }, { by: B.id });
  store.delete('y3k.ownBrain');
  assert.deepEqual(ownChoiceFor(B, false, { win: browser }), { provider: 'claude', auto: true }, 'B chose it at this computer');
  assert.deepEqual(ownChoiceFor(A, false, { win: browser }), { provider: 'claude', auto: true }, 'A still has its own pairing');
  setOwnChoice({ provider: 'none' }, { by: B.id });
  store.delete('y3k.ownBrain');
  assert.equal(ownChoiceFor(B, false, { win: browser }), null, 'B chose another provider here since');
  setOwnChoice({ provider: 'claude' });   // a choice with no account to keep it under keeps none
  store.delete('y3k.ownBrain');
  assert.equal(ownChoiceFor(B, false, { win: browser }), null);
  assert.ok(!store.get('y3k.ownBrain.accounts')?.includes('null'));
});

await ok('kode keeps the account that made a pairing; another port keeps it; a new token is a new pairing', async () => {
  store.clear();
  const told = [];
  globalThis.window = { dispatchEvent: (e) => { told.push(e.type); return true; } };
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^http:\/\/127\.0\.0\.1:47821\/v1\/pair$/);
    return { ok: true, status: 200, json: async () => ({ token: 'tok-1' }) };
  };
  try {
    const r = await pair(47821, 'ABCDEFGH', { by: A.id });
    assert.equal(r.ok, true);
    assert.deepEqual(savedPairing(), { port: 47821, token: 'tok-1', by: A.id });
    assert.deepEqual(told, ['y3k:pairing'], 'the page is not told, and a default waiting for this pairing never starts');
    assert.equal(mayDefault(A.id, { win: browser }), true);
    movePairing(47822, 'tok-1');   // the engine came back on another port: the same pairing
    assert.deepEqual(savedPairing(), { port: 47822, token: 'tok-1', by: A.id });
    movePairing(47823, 'tok-2');   // a token it was not made with is not A's
    assert.deepEqual(savedPairing(), { port: 47823, token: 'tok-2' });
    assert.equal(mayDefault(A.id, { win: browser }), false);
    await pair(47821, 'ABCDEFGH');  // made with nobody signed in: nobody's
    assert.equal(savedPairing().by, undefined);
    forgetPairing();
    assert.equal(savedPairing(), null);
    assert.equal(told.length, 5, 'every change is told');
  } finally { delete globalThis.window; delete globalThis.fetch; }
});

await ok('the watch that pairs from the start command pairs as the account signed in', async () => {
  const asked = [];
  await new Promise((resolve) => {
    watchForEngine({ code: 'ABCDEFGH', by: A.id, ports: [47821], every: 1, forMs: 1000,
      probeFn: async () => ({ port: 47821, preapproved: true }),
      pairFn: async (port, code, o) => { asked.push([port, code, o]); return { ok: true, token: 't0k' }; }, onFound: resolve });
  });
  assert.deepEqual(asked, [[47821, 'ABCDEFGH', { by: A.id }]]);
});

await ok('kode itself, and the code screen, tell transport.js who is pairing', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (f) => readFileSync(new URL('../src/code/' + f, import.meta.url), 'utf8');
  const view = src('code-view.js');
  assert.match(view, /await pair\(port, code, \{ by: getAccount\(\)\?\.id \|\| null \}\)/, 'a code typed into kode pairs as nobody');
  assert.match(view, /by: \(\) => getAccount\(\)\?\.id \|\| null,/, 'the start command\'s watch pairs as nobody');
  assert.match(src('onboard.js'), /code, token, by: env\.by\?\.\(\) \|\| null,/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /window\.addEventListener\('y3k:pairing', syncOwnBrain\);/, 'a pairing made in kode does not start the default until the page reloads');
});

console.log('\nthe choice travels with each turn:');

await ok('another provider chosen here is said with every turn; Claude Code, or no choice, leaves it to the site', async () => {
  const brain = await import('../src/brain.js');
  store.clear();
  assert.equal(ownDeclined(), false);
  assert.deepEqual(brain.keyFields(), {}, 'nothing chosen: the account\'s default, wherever it is offered');
  setOwnChoice({ provider: 'claude' });
  assert.equal(ownDeclined(), false);
  assert.deepEqual(brain.keyFields(), {});
  chooseKeyProvider();   // a key provider with no key yet
  assert.equal(ownDeclined(), true);
  assert.deepEqual(brain.keyFields(), { own: false }, 'a phone set to another provider is answered by the laptop\'s Claude plan');
  store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-x', model: 'm' }));
  assert.deepEqual(brain.keyFields(), { key: 'sk-ant-x', provider: 'anthropic', model: 'm', own: false }, 'a key in use is a choice too');
  store.delete('y3k.brain');
});

await ok('…and this page does not count the account\'s own sign-in as its brain once it chose another', async () => {
  const brain = await import('../src/brain.js');
  store.clear();
  globalThis.fetch = async () => ({ json: async () => ({ ownBrain: true }) });
  try {
    assert.equal(await brain.checkOwnBrain(), true, 'another page of the account offers it');
    assert.deepEqual([brain.canLive(), brain.onOwnPlan()], [true, true]);
    chooseKeyProvider();
    assert.deepEqual([brain.canLive(), brain.onOwnPlan()], [false, false], 'its life would run on a plan this page turned down, and its pages go uncharged');
    store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-x', model: 'm' }));
    assert.deepEqual([brain.canLive(), brain.onOwnPlan()], [true, false]);
  } finally {
    globalThis.fetch = async () => ({ json: async () => ({ ownBrain: false }) });
    await brain.checkOwnBrain();
    delete globalThis.fetch;
    store.clear();
  }
});

await ok('a conversation\'s turns carry it: the stream, its fallback, and the opening; with nothing chosen here to think on, nothing goes out', async () => {
  const brain = await import('../src/brain.js');
  const sent = [];
  globalThis.fetch = async (url, o) => {
    if (url === '/api/health') return { json: async () => ({ ownBrain: true }) };   // another page of the account offers its sign-in
    sent.push([url, JSON.parse(o.body)]);
    // the stream refused before any provider was asked, so the turn is asked again unstreamed
    if (url === '/api/brain/stream') return { ok: false, body: null, headers: { get: () => 'application/json' }, json: async () => ({}) };
    return { json: async () => ({ available: false }) };
  };
  try {
    store.clear();
    // Another provider chosen here, and no key for it yet. The site has no key
    // of its own (2026-10-12) and this page turned the plan down, so there is
    // nothing to ask: no stream, no fallback, no opening, and the orb says what
    // is missing. (It used to send them all, own: false, to the site's key.)
    chooseKeyProvider();
    const r = await brain.respondStream('hello');
    const o = await brain.openingStream({});
    assert.deepEqual(sent, [], 'a turn went out with nothing chosen here to think on it');
    assert.deepEqual([r.speech, o.speech], [brain.NO_PROVIDER, brain.NO_PROVIDER]);
    // a key in use: every request carries it, and the choice
    store.set('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-x', model: 'm' }));
    await brain.respondStream('hello');
    await brain.openingStream({});
    assert.deepEqual(sent.map(([u]) => u), ['/api/brain/stream', '/api/brain', '/api/brain/stream']);
    for (const [u, b] of sent) assert.deepEqual([b.key, b.own], ['sk-ant-x', false], u + ' was sent without the choice made here');
    sent.length = 0;
    store.delete('y3k.brain');
    // Claude Code chosen: the first turn waits for the site to say the sign-in
    // is offered (/api/health), and goes without `own`
    setOwnChoice({ provider: 'claude' });
    await brain.respondStream('hello');
    assert.deepEqual(sent.map(([u]) => u), ['/api/brain/stream', '/api/brain'], 'the first turn did not wait for the sign-in to be offered');
    for (const [u, b] of sent) assert.ok(!('own' in b), u + ': Claude Code chosen, and the site was told no');
  } finally {
    globalThis.fetch = async () => ({ json: async () => ({ ownBrain: false }) });
    await brain.checkOwnBrain();
    delete globalThis.fetch; brain.resetHistory(); store.clear();
  }
});

await ok('on the person\'s own plan, a turn the relay refused as busy or full says so, not the plan\'s limit', async () => {
  // A busy coding session's translator took both of the turns y3kode takes at
  // once, the person's own line was refused 'busy', and the orb said
  // OWN_FAILED: "If your Claude plan has reached its usage limit". The site
  // names the relay's own refusals (own-relay.mjs OWN_WHYS), and each has its
  // own line.
  const brain = await import('../src/brain.js');
  const enc = new TextEncoder();
  const sse = (text) => {
    const parts = [enc.encode(text)];
    return { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: async () => (parts.length ? { value: parts.shift(), done: false } : { done: true }) }) } };
  };
  const asked = [];
  let why;
  globalThis.fetch = async (url) => {
    asked.push(url);
    if (url === '/api/health') return { json: async () => ({ ownBrain: true }) };   // a page of the account offers its sign-in
    if (url === '/api/brain/stream') return sse(`event: error\ndata: ${JSON.stringify({ error: 'unavailable', reason: 'upstream', ...(why ? { why } : {}) })}\n\n`);
    return { json: async () => ({ available: false, reason: 'upstream', ...(why ? { why } : {}) }) };
  };
  try {
    store.clear();
    assert.equal(await brain.checkOwnBrain(), true);
    for (why of ['own-busy', 'own-full']) {
      asked.length = 0;
      const r = await brain.respondStream('hello');
      assert.equal(r.speech, brain.whyLine(why), why);
      assert.equal(r.why, why);
      assert.deepEqual(asked, ['/api/brain/stream'], `${why}: asked again unstreamed, one more turn where there was no room`);
      const f = await brain.respond('hello');
      assert.equal(f.speech, brain.whyLine(why), why);
      for (const x of [r, f]) {
        assert.ok(x.notice && x.local, `${why}: put on the air`);
        assert.notEqual(x.speech, brain.OWN_FAILED);
        assert.ok(!/usage limit|plan/i.test(x.speech), `${why} blames the plan: ${x.speech}`);
        assert.ok(!/—/.test(x.speech));
      }
    }
    // own-busy is also the relay's own MAX_JOBS, which refuses before y3kode
    // is asked (and was, until 2026-10-12, a shared address holding its whole
    // share of the relay): the line says what is true of each
    assert.match(brain.whyLine('own-busy'), /^Your presence is already thinking as much as it can at once\./);
    assert.ok(!/y3kode/.test(brain.whyLine('own-busy')), 'own-busy blames y3kode for the relay\'s own bound');
    assert.match(brain.whyLine('own-full'), /^The site is holding as many turns as it can for everyone just now\./);
    assert.ok(!brain.WHYS.some((w) => brain.OWN_WHYS.includes(w)), 'a reason that names no provider is in the list of those that do');
    // a turn on the plan that failed for a reason the site could not name keeps OWN_FAILED
    why = undefined;
    asked.length = 0;
    assert.equal((await brain.respondStream('hello')).speech, brain.OWN_FAILED);
    assert.deepEqual(asked, ['/api/brain/stream', '/api/brain'], 'an unnamed failure is asked again, as before');
  } finally {
    globalThis.fetch = async () => ({ json: async () => ({ ownBrain: false }) });
    await brain.checkOwnBrain();
    delete globalThis.fetch; brain.resetHistory(); store.clear();
  }
});

console.log('\nwhat Settings shows:');

const engine = (hello, refresh) => async (c) => (c.cmd === 'engine.hello' ? hello : c.cmd === 'provider.refresh' ? refresh : { ok: false });
const claude = (o) => ({ id: 'claude', loginCommand: 'claude', install: 'npm install -g @anthropic-ai/claude-code', ...o });

await ok('y3kode not running, or this browser not connected to it', async () => {
  assert.equal((await claudeCodeStatus({ cmd: async () => ({ ok: false, code: 'offline' }) })).reach, 'offline');
  assert.equal((await claudeCodeStatus({ cmd: async () => ({ ok: false, code: 'unpaired' }) })).reach, 'unpaired');
});

await ok('a y3kode from before brain.complete is told apart, so the card can say "update"', async () => {
  const s = await claudeCodeStatus({ cmd: engine({ ok: true, version: '0.1.0', providers: [claude({ installed: true, auth: 'ok' })] }) });
  assert.equal(s.reach, 'old');
  assert.equal(s.version, '0.1.0');
});

await ok('whether that y3kode can update itself (engine.update), so the card can offer it', async () => {
  const s = await claudeCodeStatus({ cmd: engine({ ok: true, version: '0.2.9', update: true, providers: [claude({ installed: true, auth: 'ok' })] }) });
  assert.deepEqual([s.reach, s.canUpdate], ['old', true]);
  const t = await claudeCodeStatus({ cmd: engine({ ok: true, version: '0.1.0', providers: [] }) });
  assert.equal(t.canUpdate, false, 'one from before engine.update');
});

await ok('installed and signed in, signed out, or not installed — with the command to sign in', async () => {
  const hello = (p) => ({ ok: true, version: '0.2.0', thinkers: ['claude'], providers: [claude(p)] });
  const a = await claudeCodeStatus({ cmd: engine(hello({ installed: true, auth: 'ok' })) });
  assert.deepEqual([a.reach, a.installed, a.auth], ['ok', true, 'ok']);
  const b = await claudeCodeStatus({ cmd: engine(hello({ installed: true, auth: 'signed-out' })) });
  assert.deepEqual([b.auth, b.loginCommand], ['signed-out', 'claude']);
  const c = await claudeCodeStatus({ cmd: engine(hello({ installed: false, auth: 'not-installed' })) });
  assert.equal(c.installed, false);
});

await ok('an unknown sign-in is looked up afresh rather than guessed', async () => {
  let refreshed = 0;
  const cmd = async (c) => {
    if (c.cmd === 'engine.hello') return { ok: true, thinkers: ['claude'], providers: [claude({ installed: true, auth: 'unknown' })] };
    if (c.cmd === 'provider.refresh') { refreshed += 1; return { ok: true, providers: [claude({ installed: true, auth: 'ok' })] }; }
    return { ok: false };
  };
  const s = await claudeCodeStatus({ cmd });
  assert.equal(refreshed, 1);
  assert.equal(s.auth, 'ok');
});

console.log('\nthe stream:');

function fakeES() {
  const made = [];
  class ES {
    constructor(url) { this.url = url; this.readyState = 1; this.on = {}; this.closed = false; made.push(this); }
    addEventListener(t, f) { (this.on[t] ||= []).push(f); }
    emit(t, data) { for (const f of this.on[t] || []) f({ data: JSON.stringify(data) }); }
    close() { this.closed = true; this.readyState = 2; }
  }
  return { ES, made };
}
function clock() {
  const tasks = [];
  return { set: (f, ms) => { tasks.push({ f, ms }); return tasks.length; }, clear: (i) => { if (tasks[i - 1]) tasks[i - 1].f = null; }, run: () => { const t = tasks.splice(0); for (const x of t) x.f?.(); }, count: () => tasks.length };
}

await ok('no y3kode: no stream is opened and the page says why, and looks again later', async () => {
  const { ES, made } = fakeES();
  const states = [];
  const t = clock();
  const stop = startOwnBrain({ ES, timer: t, cmd: async () => ({ ok: false, code: 'offline', error: 'y3kode is not running on this computer.' }), onState: (s, w) => states.push([s, w]) });
  await settle();
  assert.equal(made.length, 0, 'the site is not told there is a brain');
  assert.deepEqual(states.at(-1), ['error', 'y3kode is not running on this computer.']);
  assert.equal(t.count(), 1, 'it will look again');
  stop();
});

await ok('an older y3kode: no stream, and the reason is the update', async () => {
  const { ES, made } = fakeES();
  const states = [];
  const stop = startOwnBrain({ ES, timer: clock(), cmd: async () => ({ ok: true, version: '0.1.0' }), onState: (s, w) => states.push([s, w]) });
  await settle();
  assert.equal(made.length, 0);
  assert.match(states.at(-1)[1], /Update y3kode/);
  stop();
});

await ok('y3kode answers and can think: the stream opens, and a job is answered through it', async () => {
  const { ES, made } = fakeES();
  const posted = [];
  const cmd = async (c) => (c.cmd === 'engine.hello' ? { ok: true, thinkers: ['claude'] } : c.cmd === 'brain.complete' ? { ok: true, text: '[calm] hi', usage: { in: 1, out: 1 } } : { ok: false });
  const stop = startOwnBrain({ ES, timer: clock(), cmd, fetchFn: async (url, o) => { posted.push([url, JSON.parse(o.body)]); return {}; } });
  await settle();
  assert.equal(made.length, 1);
  assert.equal(made[0].url, '/api/own-brain?provider=claude');
  made[0].emit('job', { id: 'a'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.deepEqual(posted[0], ['/api/own-brain/' + 'a'.repeat(32), { ok: true, text: '[calm] hi', usage: { in: 1, out: 1 } }]);
  stop();
  assert.ok(made[0].closed);
});

await ok('a turn the site let go of while y3kode thought (cancel) is not answered; the others are, and a cancel for nothing here keeps nothing', async () => {
  const { ES, made } = fakeES();
  const posted = [];
  const done = new Map();   // job prompt → let y3kode answer it
  const cmd = async (c) => {
    if (c.cmd === 'engine.hello') return { ok: true, thinkers: ['claude'] };
    if (c.cmd !== 'brain.complete') return { ok: false };
    await new Promise((r) => done.set(c.prompt, r));
    return { ok: true, text: `[calm] ${c.prompt}`, usage: { in: 1, out: 1 } };
  };
  const stop = startOwnBrain({ ES, timer: clock(), cmd, fetchFn: async (url) => { posted.push(url); return {}; } });
  await settle();
  const [gone, kept] = ['c'.repeat(32), 'd'.repeat(32)];
  made[0].emit('job', { id: gone, provider: 'claude', system: 's', prompt: 'gone' });
  made[0].emit('job', { id: kept, provider: 'claude', system: 's', prompt: 'kept' });
  await settle();
  made[0].emit('cancel', { id: gone });
  made[0].emit('cancel', { id: 'e'.repeat(32) });   // not one this page is thinking
  done.get('gone')(); done.get('kept')();
  await settle();
  assert.deepEqual(posted, ['/api/own-brain/' + kept], 'an answer nobody waits for was sent, or a wanted one was not');
  // the same id asked again later (it never is, but nothing lingers for it)
  made[0].emit('job', { id: gone, provider: 'claude', system: 's', prompt: 'again' });
  await settle();
  done.get('again')();
  await settle();
  assert.deepEqual(posted, ['/api/own-brain/' + kept, '/api/own-brain/' + gone], 'a cancel stayed behind for a turn that had ended');
  stop();
});

// AN ANSWER REFUSED FOR NOW IS SENT AGAIN (2026-10-12). The page's answer went
// out once and what the site said to it was never read (.catch on a 429 that
// resolved): 120 people behind one IPv4 at three turns a minute had 60 answers
// refused by the address's ceiling, and each of those turns, already thought
// on the person's own plan, waited out the relay's 190s timeout.
const answers = async (c) => (c.cmd === 'engine.hello' ? { ok: true, thinkers: ['claude'] }
  : c.cmd === 'brain.complete' ? { ok: true, text: '[calm] hi', usage: { in: 1, out: 1 } } : { ok: false });
// the site's reply to each answer in turn: a status, or 'network' for none at all
function site(replies) {
  const posted = [];
  const fetchFn = async (url, o) => {
    posted.push([url, JSON.parse(o.body)]);
    const r = replies.length > 1 ? replies.shift() : replies[0];
    if (r === 'network') throw new TypeError('Failed to fetch');
    return { status: r, ok: r >= 200 && r < 300, json: async () => ({ ok: true }) };
  };
  return { posted, fetchFn };
}
// a clock that also keeps how long each thing set on it was to wait
function timed() {
  const t = clock(), waits = [];
  return { ...t, waits, set: (f, ms) => { waits.push(ms); return t.set(f, ms); } };
}
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

await ok('an answer the site refused for now (429, a 5xx, no answer at all) is sent again, each wait longer, until it arrives', async () => {
  const { ES, made } = fakeES();
  const t = timed();
  const { posted, fetchFn } = site([429, 503, 'network', 502, 200]);
  const states = [];
  const stop = startOwnBrain({ ES, timer: t, cmd: answers, fetchFn, onState: (s) => states.push(s) });
  await settle();
  made[0].emit('ready', {});
  const id = '7'.repeat(32);
  made[0].emit('job', { id, provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.equal(posted.length, 1);
  for (let n = 2; n <= 5; n++) {
    assert.equal(t.count(), 1, `try ${n - 1} refused for now, and nothing set to send it again: the turn hangs to the relay's timeout`);
    t.run(); await settle();
    assert.equal(posted.length, n);
  }
  assert.equal(t.count(), 0, 'sent again after it arrived');
  for (const [url, body] of posted) assert.deepEqual([url, body], ['/api/own-brain/' + id, { ok: true, text: '[calm] hi', usage: { in: 1, out: 1 } }], 'the same answer each time');
  for (let i = 1; i < t.waits.length; i++) assert.ok(t.waits[i] > t.waits[i - 1], `each wait is longer than the last: ${t.waits}`);
  assert.ok(t.waits[0] >= 1000 && t.waits[0] <= 1500, `the first wait is short: ${t.waits[0]}`);
  assert.deepEqual(states, ['ready'], 'a refusal for now is nothing to tell the person');
  assert.ok(!made[0].closed && ownLive());
  stop();
});

await ok('…and is given up quietly after a few tries, past one rate window and inside the turn\'s own timeout', async () => {
  const { ES, made } = fakeES();
  const t = timed();
  const { posted, fetchFn } = site([429]);
  const states = [];
  const stop = startOwnBrain({ ES, timer: t, cmd: answers, fetchFn, onState: (s) => states.push(s) });
  await settle();
  made[0].emit('ready', {});
  made[0].emit('job', { id: '8'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  for (let n = 0; n < 20 && t.count(); n++) { t.run(); await settle(); }
  assert.equal(t.count(), 0, 'an answer the site keeps refusing is sent again for good');
  assert.ok(posted.length >= 4 && posted.length <= 8, `a few tries, not ${posted.length}`);
  const window = Number(src('server.mjs').match(/const RATE_WINDOW_MS = ([\d_]+);/)[1].replace(/_/g, ''));
  const turn = Number(src('own-relay.mjs').match(/timeoutMs = (\d+)/)[1]);
  const waited = t.waits.reduce((a, b) => a + b, 0);
  assert.ok(waited > window, `the last try came before the window that refused the first could have started over: ${waited}ms`);
  assert.ok(waited < turn, `tried long after the turn could have been waiting: ${waited}ms`);
  assert.deepEqual(states, ['ready'], 'giving up is quiet: the relay\'s timeout says it');
  assert.ok(!made[0].closed && ownLive(), 'the page goes on thinking for the site');
  stop();
});

await ok('an answer the site took, or one it no longer waits for (404), or one from a page signed out, is not sent again', async () => {
  for (const status of [200, 404, 401, 403, 400, 413]) {
    const { ES, made } = fakeES();
    const t = timed();
    const { posted, fetchFn } = site([status]);
    const stop = startOwnBrain({ ES, timer: t, cmd: answers, fetchFn });
    await settle();
    made[0].emit('job', { id: '9'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
    await settle();
    assert.equal(posted.length, 1, String(status));
    assert.equal(t.count(), 0, `${status}: a final answer was set to be sent again`);
    stop();
  }
});

await ok('nor once its turn cannot be waiting: the site let it go, the stream it came on ended, or the page stopped', async () => {
  const id = 'a'.repeat(32);
  const job = { id, provider: 'claude', system: 's', prompt: 'p' };
  // let go (cancel) while it waited to be sent again
  {
    const { ES, made } = fakeES();
    const t = timed();
    const { posted, fetchFn } = site([429, 200]);
    const stop = startOwnBrain({ ES, timer: t, cmd: answers, fetchFn });
    await settle();
    made[0].emit('job', job);
    await settle();
    made[0].emit('cancel', { id });
    t.run(); await settle();
    assert.equal(posted.length, 1, 'sent again after the site let the turn go');
    // and nothing of it stays behind: the same id asked again is answered
    made[0].emit('job', job);
    await settle();
    assert.equal(posted.length, 2, 'a cancel stayed behind for an answer given up');
    stop();
  }
  // the newest pages took over, or the page stopped, while it waited
  for (const end of [(s) => s.emit('replaced', {}), (_s, stop) => stop()]) {
    const { ES, made } = fakeES();
    const t = timed();
    const { posted, fetchFn } = site([429, 200]);
    const stop = startOwnBrain({ ES, timer: t, cmd: answers, fetchFn });
    await settle();
    made[0].emit('job', job);
    await settle();
    end(made[0], stop);
    t.run(); await settle();
    assert.equal(posted.length, 1, 'sent again on a stream whose turns the site failed as gone');
    stop();
  }
});

await ok('what a failed turn says of y3kode is acted on at once, not after its refused answer is tried again', async () => {
  const { ES, made } = fakeES();
  const t = timed();
  let up = true;
  const cmd = async (c) => (c.cmd === 'engine.hello' ? (up ? { ok: true, thinkers: ['claude'] } : { ok: false, code: 'offline', error: 'gone' })
    : c.cmd === 'brain.complete' ? { ok: false, code: 'offline', error: 'y3kode is not running on this computer.' } : { ok: false });
  const { posted, fetchFn } = site([429, 200]);
  const states = [];
  const stop = startOwnBrain({ ES, timer: t, cmd, fetchFn, onState: (s, w) => states.push([s, w]) });
  await settle();
  made[0].emit('ready', {});
  made[0].emit('job', { id: 'b'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.ok(made[0].closed, 'the stream stayed open, offering a y3kode that went away, while the answer waited');
  assert.deepEqual(states.at(-1), ['error', 'y3kode is not running on this computer.']);
  assert.equal(posted[0][1].code, 'offline', 'the site hears why at once');
  t.run(); await settle();
  assert.equal(posted.length, 1, 'the stream it came on ended: its turns failed as gone, and nothing waits for this');
  assert.equal(made.length, 2, 'and it looks for y3kode again as before');
  stop();
});

await ok('y3kode goes away mid-stream: the turn fails, the stream closes, and it looks again', async () => {
  const { ES, made } = fakeES();
  let up = true;
  const t = clock();
  const states = [];
  const cmd = async (c) => (c.cmd === 'engine.hello' ? (up ? { ok: true, thinkers: ['claude'] } : { ok: false, code: 'offline', error: 'gone' })
    : c.cmd === 'brain.complete' ? { ok: false, code: 'offline', error: 'y3kode is not running on this computer.' } : { ok: false });
  const posted = [];
  const stop = startOwnBrain({ ES, timer: t, cmd, fetchFn: async (url, o) => { posted.push(JSON.parse(o.body)); return {}; }, onState: (s, w) => states.push([s, w]) });
  await settle();
  up = false;
  made[0].emit('job', { id: 'b'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.equal(posted[0].ok, false, 'the site hears the turn failed');
  assert.ok(made[0].closed, 'and the page stops offering a brain');
  assert.equal(states.at(-1)[0], 'error');
  up = true; t.run(); await settle();
  assert.equal(made.length, 2, 'back when y3kode is');
  stop();
});

await ok('newer pages of the same account took over: the stream closes for good, and comes back only when asked', async () => {
  const { ES, made } = fakeES();
  const t = clock();
  const states = [];
  const stop = startOwnBrain({ ES, timer: t, cmd: async (c) => (c.cmd === 'engine.hello' ? { ok: true, thinkers: ['claude'] } : { ok: false }), onState: (s, w) => states.push([s, w]) });
  await settle();
  made[0].emit('ready', { provider: 'claude' });
  assert.equal(ownLive(), true);
  // the site lets the oldest of five pages go (own-relay.mjs, MAX_PAGES)
  made[0].emit('replaced', {});
  assert.ok(made[0].closed, 'an EventSource left open reconnects, and pushes the next oldest out in turn');
  assert.equal(ownLive(), false);
  assert.equal(states.at(-1)[0], 'error');
  assert.match(states.at(-1)[1], /Another page of yours/);
  assert.equal(t.count(), 0, 'nor does it come back on its own at the next probe');
  // Check again (lookAgain): this page offers again, as the newest
  lookAgain();
  await settle();
  assert.equal(made.length, 2);
  stop();
});

// ONE PAGE, ONE ACCOUNT (2026-10-12). A tab left open after A signed out in
// another tab, and B signed in there, reconnected its stream with B's cookie,
// and B's turns ran on the y3kode A's tab reached: A's computer, A's plan.
const thinks = async (c) => (c.cmd === 'engine.hello' ? { ok: true, thinkers: ['claude'] } : { ok: false });
function fakeWin() {
  const on = {};
  return {
    on, addEventListener: (t, f) => { (on[t] ||= []).push(f); },
    removeEventListener: (t, f) => { on[t] = (on[t] || []).filter((g) => g !== f); },
    storage: (key, newValue) => { for (const f of [...(on.storage || [])]) f({ key, newValue }); },
  };
}

await ok('the stream says whose page it is, and a site that refuses it to anyone else stops it for good', async () => {
  const { ES, made } = fakeES();
  const t = clock();
  const states = [];
  const stop = startOwnBrain({ ES, timer: t, as: A.id, win: fakeWin(), cmd: thinks, onState: (s) => states.push(s) });
  await settle();
  assert.equal(made[0].url, '/api/own-brain?provider=claude&as=acct-a', 'the site cannot tell a stale tab\'s stream from its account\'s');
  made[0].emit('ready', { provider: 'claude' });
  assert.equal(ownLive(), true);
  // the stream ended and the EventSource opened it again with the cookie the
  // browser holds now, someone else's: the site answers 403, and an
  // EventSource refused that way is closed for good (readyState 2)
  made[0].readyState = 2;
  made[0].emit('error', {});
  assert.equal(ownLive(), false);
  assert.equal(states.at(-1), 'off');
  assert.equal(t.count(), 0, 'it would look for y3kode again and offer it to whoever is signed in');
  assert.equal(made.length, 1);
  stop();
  // with no account to say (an older caller), the stream is opened as before
  const old = fakeES();
  const stop2 = startOwnBrain({ ES: old.ES, timer: clock(), win: fakeWin(), cmd: thinks });
  await settle();
  assert.equal(old.made[0].url, '/api/own-brain?provider=claude');
  stop2();
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /startOwnBrain\(\{ as: account\.id, /, 'the page does not say which account it was loaded for');
});

await ok('another tab changing whose this browser is stops this page offering, before any reconnect', async () => {
  for (const [what, change] of [
    ['A signed out there', () => { store.delete('y3k.owner'); return [['y3k.owner', null]]; }],
    ['B signed in there', () => { store.set('y3k.owner', B.id); return [['y3k.owner', B.id]]; }],
    ['a guest came in there', () => { store.set('y3k.owner', 'guest'); return [['y3k.owner', 'guest']]; }],
    ['the storage was cleared', () => { store.clear(); return [[null, null]]; }],
  ]) {
    store.clear();
    store.set('y3k.owner', A.id);
    const { ES, made } = fakeES();
    const win = fakeWin();
    const states = [];
    const stop = startOwnBrain({ ES, timer: clock(), as: A.id, win, cmd: thinks, onState: (s) => states.push(s) });
    await settle();
    made[0].emit('ready', {});
    // what is not whose the browser is changes nothing, nor A coming back in
    win.storage('y3k.brainKeys', '{}');
    win.storage('y3k.owner', A.id);
    assert.ok(!made[0].closed && ownLive(), `${what}: another key, or A's own, stopped it`);
    for (const [k, v] of change()) win.storage(k, v);
    assert.ok(made[0].closed, `${what}: the stream stayed open for whoever is signed in now`);
    assert.equal(ownLive(), false, what);
    assert.equal(states.at(-1), 'off', what);
    assert.deepEqual(win.on.storage, [], `${what}: still listening after it stopped`);
    lookAgain();
    await settle();
    assert.equal(made.length, 1, `${what}: Check again offered this page again`);
    stop();
  }
  // and stop() lets go of the listener too
  store.set('y3k.owner', A.id);
  const win = fakeWin();
  const stop = startOwnBrain({ ES: fakeES().ES, timer: clock(), as: A.id, win, cmd: thinks });
  assert.equal(win.on.storage.length, 1);
  stop();
  assert.deepEqual(win.on.storage, []);
  store.clear();
});

await ok('the name it watches is the one the door writes (brain.js claimBrowser, forgetAccount)', async () => {
  const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  assert.match(src('brain.js'), /const OWNER_KEY = 'y3k\.owner';/);
  assert.match(src('own-brain.js'), /const OWNER_KEY = 'y3k\.owner';/);
});

console.log('\nthe default, for any account:');

// y3kode that can think, with Claude Code as it says it stands on this computer
const helloWith = (claudeIs) => ({ ok: true, version: '0.3.1', thinkers: ['claude'], providers: [claude(claudeIs)] });

await ok('the default waits for Claude Code itself: missing or signed out, no stream, and it looks again', async () => {
  for (const [is, why] of [[{ installed: false, auth: 'not-installed' }, /not installed/], [{ installed: true, auth: 'signed-out' }, /not signed in/], [{ installed: true, auth: 'needs-key' }, /key/]]) {
    const { ES, made } = fakeES();
    const states = [];
    const t = clock();
    const stop = startOwnBrain({ ES, timer: t, auto: () => true, cmd: async (c) => (c.cmd === 'engine.hello' ? helloWith(is) : { ok: false }), onState: (st, w) => states.push([st, w]) });
    await settle();
    assert.equal(made.length, 0, `${is.auth}: someone who uses kode with another client was offered as a brain that cannot think`);
    assert.equal(states.at(-1)[0], 'error');
    assert.match(states.at(-1)[1], why);
    assert.equal(t.count(), 1, 'it will look again (they may sign in)');
    stop();
  }
  // an unknown sign-in is not a no (y3kode's own sessions go ahead on it too)
  const { ES, made } = fakeES();
  const stop = startOwnBrain({ ES, timer: clock(), auto: () => true, cmd: async (c) => (c.cmd === 'engine.hello' ? helloWith({ installed: true, auth: 'unknown' }) : { ok: false }) });
  await settle();
  assert.equal(made.length, 1);
  stop();
});

await ok('…while Claude Code chosen in Settings opens the stream regardless, so the card can say what to do', async () => {
  const { ES, made } = fakeES();
  const stop = startOwnBrain({ ES, timer: clock(), auto: () => false, cmd: async (c) => (c.cmd === 'engine.hello' ? helloWith({ installed: true, auth: 'signed-out' }) : { ok: false }) });
  await settle();
  assert.equal(made.length, 1);
  stop();
});

await ok('whether this page thinks for the site is the stream the site took, not the last thing said', async () => {
  const { ES, made } = fakeES();
  const cmd = async (c) => (c.cmd === 'engine.hello' ? helloWith({ installed: true, auth: 'ok' })
    : c.cmd === 'brain.complete' ? (c.prompt === 'fails' ? { ok: false, code: 'refused', error: 'Claude usage limit reached.' } : { ok: true, text: 'hi' }) : { ok: false });
  const stop = startOwnBrain({ ES, timer: clock(), auto: () => true, cmd, fetchFn: async () => ({}) });
  await settle();
  assert.equal(ownLive(), false, 'live before the site took the stream');
  made[0].emit('ready', { provider: 'claude' });
  assert.equal(ownLive(), true);
  assert.equal(ownState().state, 'ready');
  // a plan's own limit: the turn fails and is said, and the page goes on thinking for the site
  made[0].emit('job', { id: 'c'.repeat(32), provider: 'claude', system: 's', prompt: 'fails' });
  await settle();
  assert.deepEqual(ownState(), { state: 'error', why: 'Claude usage limit reached.' });
  assert.ok(!made[0].closed, 'the plan\'s limit let go of the stream: the next turn would go to the site\'s key');
  assert.equal(ownLive(), true);
  // and the next turn that answers clears it
  made[0].emit('job', { id: 'd'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.equal(ownState().state, 'ready');
  stop();
  assert.equal(ownLive(), false);
});

await ok('the default lets go of a computer whose turn shows it cannot think there, and looks again later', async () => {
  const { ES, made } = fakeES();
  const t = clock();
  const cmd = async (c) => (c.cmd === 'engine.hello' ? helloWith({ installed: true, auth: 'ok' })
    : c.cmd === 'brain.complete' ? { ok: false, code: 'signed-out', error: 'Claude Code is signed out on this computer: run `claude`, then /login.' } : { ok: false });
  const posted = [];
  const stop = startOwnBrain({ ES, timer: t, auto: () => true, cmd, fetchFn: async (u, o) => { posted.push(JSON.parse(o.body)); return {}; } });
  await settle();
  made[0].emit('ready', {});
  made[0].emit('job', { id: 'e'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.deepEqual([posted[0].ok, posted[0].code], [false, 'signed-out'], 'the site hears why');
  assert.ok(made[0].closed, 'every turn after would have failed the same way');
  assert.equal(ownLive(), false);
  assert.equal(t.count(), 1, 'and it looks again (they may sign in)');
  stop();
  // a choice is not let go of: the card says what to do instead
  const chosen = fakeES();
  const stop2 = startOwnBrain({ ES: chosen.ES, timer: clock(), auto: () => false, cmd, fetchFn: async () => ({}) });
  await settle();
  chosen.made[0].emit('job', { id: 'f'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.ok(!chosen.made[0].closed);
  stop2();
});

await ok('a default declined on the computer is not put to them again, until it is looked for again', async () => {
  const { ES, made } = fakeES();
  const t = clock();
  let asked = 0;
  const cmd = async (c) => (c.cmd === 'engine.hello' ? helloWith({ installed: true, auth: 'ok' })
    : c.cmd === 'brain.complete' ? (asked++, { ok: false, code: 'declined', error: 'Not allowed on the computer.' }) : { ok: false });
  const stop = startOwnBrain({ ES, timer: t, auto: () => true, cmd, fetchFn: async () => ({}) });
  await settle();
  made[0].emit('job', { id: '1'.repeat(32), provider: 'claude', system: 's', prompt: 'p' });
  await settle();
  assert.ok(made[0].closed);
  assert.equal(t.count(), 0, 'it would come back and ask again');
  assert.deepEqual(ownState(), { state: 'error', why: 'Not allowed on the computer.' });
  stop();
  // started again in this page (a key saved and cleared): still not offered
  const again = fakeES();
  const stop2 = startOwnBrain({ ES: again.ES, timer: clock(), auto: () => true, cmd, fetchFn: async () => ({}) });
  await settle();
  assert.equal(again.made.length, 0, 'the same question would be put to them again');
  // looked for again (Claude Code chosen in Settings, or Check again): offered
  lookAgain();
  await settle();
  assert.equal(again.made.length, 1);
  stop2();
  assert.equal(asked, 1);
});

await ok('a state is told when it changes, not at every probe of a computer with no y3kode', async () => {
  const states = [];
  const t = clock();
  const stop = startOwnBrain({ ES: fakeES().ES, timer: t, auto: () => true, cmd: async () => ({ ok: false, code: 'unpaired', error: 'y3kode is not connected in this browser.' }), onState: (st) => states.push(st) });
  await settle();
  for (let i = 0; i < 3; i++) { t.run(); await settle(); }
  assert.deepEqual(states, ['error'], 'every probe told the page again (and main.js asks the site each time)');
  stop();
  assert.deepEqual(states, ['error', 'off']);
});

console.log('\nthe update:');

await ok('Update asks y3kode with the site\'s version and token, and nothing else', async () => {
  const sent = [];
  const fetchFn = async (url) => { assert.equal(url, '/api/code/setup'); return { ok: true, json: async () => ({ ok: true, token: 'tok', engine: '0.3.0', command: 'npx -y x' }) }; };
  const r = await updateY3kode({ fetchFn, cmd: async (c) => { sent.push(c); return { ok: true, restarting: true, version: '0.3.0' }; } });
  assert.deepEqual(sent, [{ cmd: 'engine.update', token: 'tok', version: '0.3.0' }]);
  assert.equal(r.restarting, true);
  const none = await updateY3kode({ fetchFn: async () => ({ ok: false }), cmd: async () => { throw new Error('not asked'); } });
  assert.equal(none.code, 'site');
});

await ok('after the restart, it waits for y3kode to answer at the new version', async () => {
  let n = 0;
  const cmd = async () => (++n < 3 ? { ok: false, code: 'offline' } : n < 4 ? { ok: true, version: '0.2.9' } : { ok: true, version: '0.3.0' });
  assert.equal(await waitForVersion('0.3.0', { cmd, sleep: async () => {} }), true);
  assert.equal(n, 4);
  assert.equal(await waitForVersion('0.3.0', { cmd: async () => ({ ok: false }), sleep: async () => {}, tries: 3 }), false);
});

await ok('looking again after an update opens the stream at once, not at the next probe', async () => {
  const { ES, made } = fakeES();
  let thinkers = [];
  const t = clock();
  const stop = startOwnBrain({ ES, timer: t, cmd: async (c) => (c.cmd === 'engine.hello' ? { ok: true, version: '0.3.0', thinkers } : { ok: false }) });
  await settle();
  assert.equal(made.length, 0, 'an older one: no stream');
  thinkers = ['claude'];
  lookAgain();
  assert.equal(ownState().state, 'checking', 'the card does not keep the old reason meanwhile');
  await settle();
  assert.equal(made.length, 1, 'opened without waiting a minute');
  lookAgain();
  await settle();
  assert.equal(made.length, 1, 'an open stream is left alone');
  stop();
  lookAgain();
  await settle();
  assert.equal(made.length, 1, 'and nothing after stop');
});

console.log(`\n${passed} checks passed.`);
