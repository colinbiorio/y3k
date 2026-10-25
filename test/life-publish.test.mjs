// A LIFE, PUBLISHED (2026-10-24). Colin: "if it's possible to make life
// viewable from web enable that as well". The store (life-publish.mjs): a key
// kept only as its hash, moments clipped and bounded, pictures that must be
// JPEGs and are kept to a number, the inbox taken once. The doors
// (server.mjs): a key made by the signed-in account, a moment posted with the
// key alone, the newest read by the account or — only once shared — by anyone
// by username, the picture served as what it is, words waiting in the inbox.
import assert from 'node:assert';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = mkdtempSync(join(tmpdir(), 'y3k-life-pub-'));
process.env.DATA_DIR = DATA;
const pub = await import('../life-publish.mjs');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jpeg = (n = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]).toString('base64');

console.log('\nthe store (life-publish.mjs):');

await ok('a key stands for one account, is kept only as its hash, and a new one retires the old', () => {
  const k1 = pub.makeKey('u1');
  assert.match(k1, /^y3kl_[0-9a-f]{48}$/);
  assert.equal(pub.uidOf(k1), 'u1');
  assert.equal(pub.uidOf('y3kl_' + '0'.repeat(48)), null);
  assert.equal(pub.uidOf(''), null); assert.equal(pub.uidOf(null), null);
  const file = readFileSync(join(DATA, '.life-keys.json'), 'utf8');
  assert.ok(!file.includes(k1), 'the key itself is never written');
  const k2 = pub.makeKey('u1');
  assert.equal(pub.uidOf(k1), null, 'the old key stops');
  assert.equal(pub.uidOf(k2), 'u1');
  assert.ok(pub.hasKey('u1')); assert.ok(!pub.hasKey('u2'));
});
await ok('a moment is clipped to what a moment needs; a picture must be a JPEG under the limit', () => {
  assert.equal(pub.publish('u1', null).ok, false);
  assert.equal(pub.publish('u1', { n: -1 }).ok, false);
  assert.equal(pub.publish('u1', { n: 1, frame: Buffer.from('not a jpeg').toString('base64') }).ok, false);
  assert.equal(pub.publish('u1', { n: 1, frame: 'x'.repeat(pub.FRAME_MAX * 2) }).ok, false);
  const r = pub.publish('u1', { n: 1, thought: 'a'.repeat(5000), say: 'hi\u0007there', who: 'who?', pace: 'x', frame: jpeg(), extra: 'dropped' });
  assert.deepEqual(r, { ok: true, n: 1, frame: true });
  const l = pub.latest('u1');
  assert.equal(l.thought.length, 2000); assert.equal(l.say, 'hithere'); assert.equal(l.who, 'claude'); assert.equal(l.pace, null);
  assert.equal(l.frameN, 1); assert.equal(l.frameUrl, '000001.jpg'); assert.equal('extra' in l, false);
  assert.ok(Number.isInteger(l.at));
});
await ok('the journal gains a line when the moment advances, not when the same moment is posted again; the picture stays known', () => {
  pub.publish('u1', { n: 1, thought: 'again' });
  pub.publish('u1', { n: 2, thought: 'next, no picture yet' });
  const rec = pub.recent('u1', 10);
  assert.deepEqual(rec.map((m) => m.n), [1, 2]);
  assert.equal(pub.latest('u1').frameN, 1, 'the last picture is still 1');
  pub.publish('u1', { n: 2, frame: jpeg() });
  assert.equal(pub.latest('u1').frameN, 2);
  assert.deepEqual(pub.recent('u1', 10).map((m) => m.n), [1, 2], 'no second line for 2');
});
await ok('pictures are kept to a number, oldest dropped; a picture is read by its number only', () => {
  pub.KEEP.frames = 3;
  for (let n = 3; n <= 7; n++) pub.publish('u1', { n, frame: jpeg(n) });
  assert.deepEqual(readdirSync(join(DATA, 'life', 'u1', 'frames')).sort(), ['000005.jpg', '000006.jpg', '000007.jpg']);
  assert.equal(pub.frame('u1', 7).length, 4 + 7);
  assert.equal(pub.frame('u1', 3), null);
  assert.equal(pub.frame('u1', '../latest.json'), null);
  assert.equal(pub.frame('../u1', 7), null);
});
await ok('the journal is bounded too', () => {
  pub.KEEP.journal = 5;
  for (let n = 8; n <= 20; n++) pub.publish('u1', { n });
  const lines = readFileSync(join(DATA, 'life', 'u1', 'journal.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length <= 6 && lines.length >= 5, `kept ${lines.length}`);
  assert.equal(pub.recent('u1', 2).map((m) => m.n).join(','), '19,20');
});
await ok('words from the web wait in the inbox, bounded, and are taken once', () => {
  assert.equal(pub.say('u1', 'colin', '   '), false);
  assert.ok(pub.say('u1', 'colin', 'hello in there'));
  pub.KEEP.inbox = 2;
  pub.say('u1', 'colin', 'one'); pub.say('u1', 'colin', 'two'); pub.say('u1', 'colin', 'three');
  const got = pub.takeInbox('u1');
  assert.deepEqual(got.map((l) => l.text), ['two', 'three']);
  assert.deepEqual(pub.takeInbox('u1'), [], 'taken');
});
await ok('shared is off until set; forgetting an account removes its life and key', () => {
  assert.equal(pub.isShared('u1'), false);
  assert.equal(pub.setShared('u1', true), true); assert.equal(pub.isShared('u1'), true);
  pub.forget('u1');
  assert.equal(pub.latest('u1'), null); assert.equal(pub.hasKey('u1'), false); assert.equal(pub.isShared('u1'), false);
  assert.ok(!existsSync(join(DATA, 'life', 'u1')));
});

console.log('\nthe doors (server.mjs):');
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
const SDATA = mkdtempSync(join(tmpdir(), 'y3k-life-srv-'));
const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: SDATA, FOUNDER_PASSWORD: 'life-' + Math.random().toString(36).slice(2), RATE_MAX: '1000', RATE_CHEAP_MAX: '5000', RENDER: '', CODE_ROLLOUT: '', MODEL: '' } });
for (let i = 0; i < 150; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await sleep(120); }
const stop = async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); } };
const post = (path, body, cookie, headers = {}) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const signup = async (username) => {
  const r = await post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  assert.ok(r.ok, `signup ${username}: ${r.status}`);
  return cookieOf(r);
};
try {
  const ann = await signup('ann'), bob = await signup('bob');
  let key = '';
  await ok('the signed-in account makes its key and gets the line to run; a guest cannot', async () => {
    assert.equal((await post('/api/life/key', {})).status, 401);
    const r = await post('/api/life/key', {}, ann);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.match(j.key, /^y3kl_/); key = j.key;
    assert.ok(j.command.includes(`--to http://127.0.0.1:${port} --key ${key}`), j.command);
  });
  await ok('a moment is posted with the key alone — no cookie, no origin — and refused with a wrong key', async () => {
    const r0 = await post('/api/life/publish', { n: 1 }, null, { authorization: 'Bearer y3kl_nope' });
    assert.equal(r0.status, 401);
    const r = await post('/api/life/publish', { n: 1, thought: 'first', say: 'hello', place: 'the street', who: 'me', frame: jpeg(100) }, null, { authorization: `Bearer ${key}` });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, n: 1, frame: true });
    const bad = await post('/api/life/publish', { n: 2, frame: 'bm90IGEganBlZw==' }, null, { authorization: `Bearer ${key}` });
    assert.equal(bad.status, 400);
  });
  await ok('the account reads its newest moment and the picture, as a JPEG that is only ever a JPEG', async () => {
    const r = await fetch(`${BASE}/api/life/latest`, { headers: { cookie: ann } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.mine, true); assert.equal(j.shared, false); assert.equal(j.key, true); assert.equal(j.user, 'ann');
    assert.equal(j.life.n, 1); assert.equal(j.life.thought, 'first'); assert.equal(j.life.who, 'me');
    assert.equal(j.life.frameUrl, '/life/ann/000001.jpg');
    assert.equal(j.recent.length, 1);
    const f = await fetch(BASE + j.life.frameUrl, { headers: { cookie: ann } });
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-type'), 'image/jpeg');
    assert.equal(f.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await f.arrayBuffer()).byteLength, 104);
  });
  await ok('nobody else sees it until it is shared; then anyone may, by username; a guest reads nothing of their own', async () => {
    assert.equal((await fetch(`${BASE}/api/life/latest?user=ann`, { headers: { cookie: bob } })).status, 404);
    assert.equal((await fetch(`${BASE}/life/ann/000001.jpg`, { headers: { cookie: bob } })).status, 404);
    assert.equal((await fetch(`${BASE}/life/ann/000001.jpg`)).status, 404);
    assert.equal((await fetch(`${BASE}/api/life/latest`)).status, 401);
    const s = await post('/api/life/share', { shared: true }, ann);
    assert.deepEqual(await s.json(), { ok: true, shared: true });
    const r = await fetch(`${BASE}/api/life/latest?user=ann`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.mine, false); assert.equal(j.key, undefined); assert.equal(j.life.n, 1);
    assert.equal((await fetch(`${BASE}/life/ann/000001.jpg`)).status, 200);
    assert.equal((await fetch(`${BASE}/life/ann/000009.jpg`)).status, 404);
    assert.equal((await fetch(`${BASE}/api/life/latest?user=nobody`)).status, 404);
  });
  await ok('words said on the page wait in the inbox for the life, which takes them with its key', async () => {
    assert.equal((await post('/api/life/say', { text: 'you are welcome' })).status, 401);
    assert.equal((await post('/api/life/say', { text: '' }, ann)).status, 400);
    assert.equal((await post('/api/life/say', { text: 'you are welcome' }, ann)).status, 200);
    assert.equal((await fetch(`${BASE}/api/life/inbox`)).status, 401);
    const r = await fetch(`${BASE}/api/life/inbox`, { headers: { authorization: `Bearer ${key}` } });
    const j = await r.json();
    assert.equal(j.lines.length, 1); assert.equal(j.lines[0].text, 'you are welcome'); assert.equal(j.lines[0].from, 'ann');
    assert.equal((await (await fetch(`${BASE}/api/life/inbox`, { headers: { authorization: `Bearer ${key}` } })).json()).lines.length, 0);
  });
  await ok('the life\'s folder is never served raw, and a closed account takes its life with it', async () => {
    assert.equal((await fetch(`${BASE}/life/ann/latest.json`)).status, 404);
    const srv = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
    assert.match(srv, /lifePub\.forget\(uid\);/, 'forgotten with the account');
    assert.match(srv, /lifePub\.uidOf\(bearer\)/, 'the key is the daemon\'s only door');
    assert.match(srv, /LIFE_PUB_PATHS\.has\(reqPath\) \|\| LIFE_FRAME\.test\(reqPath\)/, 'only the named doors: /api/life/moment (the record) is not shadowed');
    assert.ok(!/LIFE_PUB_PATHS = new Set\(\[[^\]]*moment/.test(srv));
    assert.equal((await fetch(`${BASE}/api/life/moment`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ann }, body: '{}' })).status !== 404, true, 'the record\'s door still answers (it was 404 behind the first draft of these doors)');
  });
} finally { await stop(); rmSync(SDATA, { recursive: true, force: true }); rmSync(DATA, { recursive: true, force: true }); }
console.log(`\n${passed} checks passed`);
