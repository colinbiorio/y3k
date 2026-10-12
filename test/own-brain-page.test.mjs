// YOUR PRESENCE ON YOUR OWN SIGN-IN — THE PAGE'S HALF (src/own-brain.js).
// Run: node test/own-brain-page.test.mjs
//
// Colin, 2026-10-07: "i'm signed in with y3kode but it still says sign in." It
// waited behind a checkbox nobody had ticked. These pin what replaced it: the
// founder with no key thinks on Claude Code by default and an explicit choice
// stands; the page offers a brain only once y3kode answers and can think, and
// stops offering it when y3kode goes away; and Settings → Brain reads what
// y3kode says about Claude Code into one state with one next step.
import assert from 'node:assert';
import { ownChoice, ownChoiceFor, setOwnChoice, claudeCodeStatus, startOwnBrain, updateY3kode, waitForVersion, lookAgain, ownState } from '../src/own-brain.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

console.log('the choice:');

await ok('the founder with no key thinks on Claude Code by default; anyone else does not', () => {
  store.clear();
  assert.equal(ownChoice(), null);
  assert.deepEqual(ownChoiceFor(true, false), { provider: 'claude', auto: true });
  assert.equal(ownChoiceFor(true, true), null, 'a key of their own comes first');
  assert.equal(ownChoiceFor(false, false), null, 'nobody else is offered it');
});

await ok('an explicit choice stands: Claude Code, or another provider (stored as none)', () => {
  store.clear();
  setOwnChoice({ provider: 'claude' });
  assert.deepEqual(ownChoiceFor(true, true), { provider: 'claude' });
  setOwnChoice(null);
  assert.deepEqual(ownChoice(), { provider: 'none' });
  assert.equal(ownChoiceFor(true, false), null, 'choosing another provider turns the default off');
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
