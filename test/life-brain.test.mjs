// WHO PAYS FOR WHAT, THE FOUNDER INCLUDED. Run:  node test/life-brain.test.mjs
//
// Colin, 2026-10-11: delete the presence thinking on a Claude Code
// subscription, both ways it did (own-relay.mjs through the founder's page and
// y3kode; local-claude-code.mjs on the founder's own machine) — "just treat me
// as a normal user". So, for every account:
//   - a presence's LIFE (chess, matches, airden, every tend mode) runs on the
//     owner's own key and nothing else: lifeBrain reads only the key the body
//     sent, and with none the answer is "byok". Never the site's key, never
//     the house allowance.
//   - a CONVERSATION (/api/brain, /api/brain/stream, kode's note) runs on the
//     person's key, else the house allowance on the site's key — metered and
//     capped for the founder exactly as for anyone (house.mjs).
//   - nothing of the subscription brain is left to come back through: no
//     route, no health flag, no free ledger line.
//
// The source checks hold the shape; the server, booted with a site key and a
// stand-in for Anthropic's API (test/fakes/brain-scripted.mjs), shows it.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const SERVER = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
const fnSrc = (name) => SERVER.slice(SERVER.indexOf(`function ${name}(`), SERVER.indexOf('\n}\n', SERVER.indexOf(`function ${name}(`)) + 3);
const route = (from, to) => SERVER.slice(SERVER.indexOf(from), SERVER.indexOf(to, SERVER.indexOf(from)));
const lifeSrc = fnSrc('lifeBrain');

console.log('lifeBrain (server.mjs):');

await ok('it reads the key the body sent, and nothing about who is asking', () => {
  assert.match(lifeSrc, /^function lifeBrain\(\{ key, provider, model \} = \{\}\) \{/, 'lifeBrain takes the request or the user again');
  assert.ok(!/\breq\b|\buser\b|founder|API_KEY|house\.|ownFor|claude-code|subscription/.test(lifeSrc.replace(/^function lifeBrain\([^)]*\)/, '')),
    'lifeBrain reaches for something besides the key it was handed');
});

await ok('the owner\'s key, or nobody pays — for everyone alike', () => {
  const life = new Function('BRAIN_PROVIDERS', 'detectProvider', `${lifeSrc}\nreturn lifeBrain;`)(
    { anthropic: { defaultModel: () => 'claude-x' }, openai: { defaultModel: () => 'gpt-x' } },
    (k) => (k.startsWith('sk-ant-') ? 'anthropic' : k.startsWith('sk-') ? 'openai' : null));
  assert.equal(life(), null, 'nothing to pay with: the caller says "add a key"');
  assert.equal(life({}), null);
  assert.equal(life({ key: '' }), null);
  assert.equal(life({ key: 42 }), null, 'only a string is a key');
  const mine = life({ key: 'sk-ant-mine' });
  assert.deepEqual({ pid: mine.pid, key: mine.key, model: mine.model }, { pid: 'anthropic', key: 'sk-ant-mine', model: 'claude-x' });
  assert.equal(life({ key: 'sk-ant-mine', model: 'claude-y' }).model, 'claude-y', 'the model it asked for');
  assert.equal(life({ key: 'sk-whatever', provider: 'anthropic' }).pid, 'anthropic', 'a provider it named, when there is one');
  assert.equal(life({ key: 'sk-ant-mine', provider: 'toString' }).pid, 'anthropic', 'a name that is no provider\'s is not looked up');
  assert.deepEqual(life({ key: 'what-is-this' }), { error: 'unrecognized key' });
});

await ok('chess, matches and airden ask it, with only what the body sent', () => {
  const calls = SERVER.match(/lifeBrain\([^)]*\)/g).filter((c) => !c.startsWith('lifeBrain({ key, provider, model } = {})'));
  assert.deepEqual(calls.sort(), ['lifeBrain(b)', 'lifeBrain(b)', 'lifeBrain({ key: b.key, provider: b.provider, model: b.model })'].sort(), calls.join(', '));
  assert.match(route("reqPath === '/api/chess/think'", '// ===== PHRASZLE'),
    /const own = lifeBrain\(b\);\n\s*if \(!own\) return json\(200, \{ available: false, reason: 'byok'[\s\S]*own\.p\.chat\(own\.key/);
  assert.match(SERVER, /const own = lifeBrain\(b\);\n\s*if \(!own\) return json\(200, \{ available: false, reason: 'byok', error: 'your presence thinks on your own key — add one in settings\.' \}\);/);
  assert.match(route("req.url === '/api/speak'", "req.url === '/api/brain'"), /const brain = lifeBrain\(\{ key: b\.key, provider: b\.provider, model: b\.model \}\);\n\s*if \(!brain\) return json\(200, \{ available: false, reason: 'byok' \}\);/);
});

await ok('the mine still digs only on a key, and never through lifeBrain', () => {
  const mine = route("reqPath === '/api/phraszle/chat'", "reqPath === '/api/phraszle/guess'") + route("reqPath === '/api/phraszle/guess'", 'const spend = ');
  assert.ok(mine.length > 500 && !/lifeBrain|API_KEY|house\./.test(mine), 'the mine\'s attempts are paid work: a key, always');
});

await ok('tend needs a key, with no exception for anyone, so it never reaches the house', () => {
  const brain = route("req.url === '/api/brain')", "req.url === '/api/brain/stream'");
  const gate = brain.indexOf("if (tendMode && !(key && typeof key === 'string')) {\n        return json(200, { available: false, reason: 'byok'");
  assert.ok(gate > 0, 'the tend gate changed');
  assert.ok(gate < brain.indexOf('house.brainRefusal('), 'the gate no longer stands before the house');
  // the BYOK branch always returns, so a tend turn that passed the gate ends there
  const byok = brain.slice(brain.indexOf("if (key && typeof key === 'string') {", gate), brain.indexOf('house.brainRefusal('));
  assert.match(byok, /return await finish\(out, useModel, pid\);/);
});

await ok('a life draws its budget at the price of the model that ran, and every ledger line is priced', () => {
  assert.match(SERVER, /posts\.recordSpend\(presence\.id, Math\.max\(posts\.estimateCost\(meteredModel, inTok, outTok\), 0\.0002\)\);/);
  assert.match(SERVER, /posts\.recordSpend\(pres\.id, Math\.max\(cost, 0\.0002\)\);\n\s*apiUsage\.record\(user\.id, \{ provider: pid2, model: useModel, inTok: out\.usage\.in, outTok: out\.usage\.out, cost \}\);/);
  assert.match(SERVER, /posts\.recordSpend\(presence\.id, Math\.max\(posts\.estimateCost\(brain\.model, u\.in \|\| 0, u\.out \|\| 0\), 0\.0002\)\);/);
  const records = SERVER.split('apiUsage.record(').slice(1).map((s) => s.slice(0, s.indexOf('});') + 3));
  assert.ok(records.length >= 5, `${records.length} ledger lines`);
  for (const r of records) assert.ok(/cost(: posts\.estimateCost\(| \})/.test(r) && !/\? 0 :/.test(r), 'a ledger line that can be free: ' + r);
});

await ok('the subscription brain stays gone', () => {
  for (const f of ['local-claude-code.mjs', 'own-relay.mjs', 'test/fakes/brain-claude.mjs', 'test/fakes/speak-claude.mjs', 'test/fakes/play-claude.mjs', 'test/fakes/recall-claude.mjs']) {
    assert.ok(!existsSync(join(ROOT, f)), f + ' is back');
  }
  for (const word of ['own-relay', 'local-claude-code', 'localClaudeCode', 'createRelay', 'ownRelay', 'ownFor', 'LOCAL_CC', 'OWN_PID', 'OWN_PROMPTS',
    'OWN_MODEL', 'ledgerCost', 'providerFor', '/api/own-brain', 'ownBrain', 'Y3K_LOCAL_CLAUDE_CODE', 'Y3K_CLAUDE_BIN']) {
    assert.ok(!SERVER.includes(word), `server.mjs mentions ${word} again`);
  }
  // nothing else at the top level reaches for it either
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.mjs'))) {
    assert.ok(!/from '\.\/(local-claude-code|own-relay)\.mjs'/.test(readFileSync(join(ROOT, f), 'utf8')), f + ' imports the subscription brain');
  }
  // it listens as it did before there was a local brain to keep on loopback
  assert.match(SERVER, /server\.listen\(PORT, \(\) => \{/);
});

// --- the server ---------------------------------------------------------------
console.log('\nthe server, with a site key:');
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const DATA = mkdtempSync(join(tmpdir(), 'y3k-life-brain-'));
const LOG = join(DATA, 'brain.log');
const PASSWORD = 'life-' + Math.random().toString(36).slice(2);
const SITE_KEY = 'sk-ant-house-test';
const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
async function boot() {
  const child = spawn(process.execPath, ['--import', './test/fakes/brain-scripted.mjs', 'server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    // three house turns of the default model ($0.0075 each here) fit in the
    // day; a fourth does not — the founder's day included
    env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: SITE_KEY, MODEL: '',
      HOUSE_DAILY_USD: '0.02', FAKE_BRAIN_SCRIPT: 'speak', FAKE_BRAIN_LOG: LOG, RENDER: '', CODE_ROLLOUT: '' },
  });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 120)); }
  return child;
}
// The founder is seeded on the first boot; orion, on a boot that finds the founder.
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await boot();

const post = (path, body, cookie) => fetch(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

try {
  const login = await post('/api/auth/login', { identifier: 'colinbiorio@gmail.com', password: PASSWORD });
  const founder = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(founder, 'the founder could not sign in');
  const usage = () => fetch(`${BASE}/api/usage`, { headers: { cookie: founder } }).then((r) => r.json());
  const spent = async () => (await usage()).house.brain.spentUsd;
  const hi = [{ role: 'user', content: 'hello there' }];

  await ok('/api/health says whether the site has a key, and nothing about anyone\'s own brain', async () => {
    for (const cookie of [null, founder]) {
      const h = await fetch(`${BASE}/api/health`, { headers: cookie ? { cookie } : {} }).then((r) => r.json());
      assert.equal(h.brain, true);
      assert.ok(!('ownBrain' in h), JSON.stringify(h));
    }
    assert.equal((await fetch(`${BASE}/api/own-brain`, { headers: { cookie: founder } })).status, 404, 'the relay\'s door is closed');
  });

  await ok('the founder\'s presence lives on a key, as anyone\'s: no key is "byok", and nothing is called, the site key notwithstanding', async () => {
    await post('/api/presences/orion/budget', { set: 5 }, founder);
    const before = calls().length;
    for (const tend of ['read', 'write', 'auto', 'reflect', 'dance', 'play']) {
      const r = await post('/api/brain', { messages: hi, presence: 'orion', tend, oneShot: tend === 'write' }, founder).then((x) => x.json());
      assert.equal(r.available, false, tend);
      assert.equal(r.reason, 'byok', tend);
    }
    const chess = await post('/api/chess/think', { moves: '', botColor: 'w' }, founder).then((x) => x.json());
    assert.equal(chess.reason, 'byok', JSON.stringify(chess));
    const speak = await post('/api/speak', { presence: 'orion' }, founder).then((x) => x.json());
    assert.equal(speak.reason, 'byok', JSON.stringify(speak));
    assert.equal(calls().length, before, 'a life reached a brain without a key of its owner\'s');
    assert.equal(await spent(), 0, 'a life touched the house allowance');
  });

  await ok('a tend beat on the owner\'s key thinks on that key, and leaves the house alone', async () => {
    const r = await post('/api/brain', { messages: hi, presence: 'orion', tend: 'auto', key: 'sk-ant-owner' }, founder).then((x) => x.json());
    assert.equal(r.available, true, JSON.stringify(r));
    assert.equal(calls().at(-1).key, 'sk-ant-owner');
    assert.equal(await spent(), 0);
  });

  await ok('a conversation with no key of theirs is the house\'s, and the founder is metered for it', async () => {
    const r = await post('/api/brain', { messages: hi }, founder).then((x) => x.json());
    assert.equal(r.available, true, JSON.stringify(r));
    assert.equal(calls().at(-1).key, SITE_KEY);
    const h = (await usage()).house;
    assert.ok(h.brain.spentUsd > 0 && h.brain.spentUsd < 0.01, JSON.stringify(h));
    assert.ok(!('founder' in h), 'the meter carries no founder flag');
  });

  await ok('…the streaming one too', async () => {
    const before = await spent();
    const r = await post('/api/brain/stream', { messages: hi }, founder);
    const text = await r.text();
    assert.match(text, /event: done/, text.slice(0, 300));
    assert.equal(calls().at(-1).key, SITE_KEY);
    assert.equal(calls().at(-1).stream, true);
    assert.ok(await spent() > before, 'the stream was not metered');
  });

  await ok('a key someone saved is theirs, even when it is the site\'s own string: it never spends the house', async () => {
    const before = await spent();
    const r = await post('/api/brain/stream', { messages: hi, key: SITE_KEY }, founder);
    assert.match(await r.text(), /event: done/);
    assert.equal(calls().at(-1).key, SITE_KEY);
    assert.equal(await spent(), before, 'a turn on a saved key was held against the house');
  });

  await ok('…and kode\'s note: their key, else the house', async () => {
    const before = await spent();
    const r = await post('/api/code/handoff', { presence: 'orion' }, founder).then((x) => x.json());
    assert.ok(typeof r.note === 'string' && r.note.length > 0, JSON.stringify(r));
    assert.equal(calls().at(-1).key, SITE_KEY);
    assert.ok(await spent() > before);
  });

  await ok('and when the founder\'s day is spent, the house says so to them as to anyone', async () => {
    const before = calls().length;
    const r = await post('/api/brain', { messages: hi }, founder).then((x) => x.json());
    assert.deepEqual({ available: r.available, reason: r.reason }, { available: false, reason: 'house-cap' }, JSON.stringify(r));
    const s = await post('/api/brain/stream', { messages: hi }, founder).then((x) => x.json());
    assert.equal(s.reason, 'house-cap');
    assert.equal(calls().length, before, 'a capped turn reached the brain');
    // a key of their own still works, as it does for anyone
    const own = await post('/api/brain', { messages: hi, key: 'sk-ant-owner' }, founder).then((x) => x.json());
    assert.equal(own.available, true);
    assert.equal(calls().at(-1).key, 'sk-ant-owner');
  });
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  rmSync(DATA, { recursive: true, force: true });
}

console.log(`\n${passed} passed`);
