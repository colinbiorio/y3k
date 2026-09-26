// THE COMPANION'S DOOR. Run:  node test/code-http.test.mjs
//
// y3k Code's engine listens on 127.0.0.1. Any web page the person has open can
// try to talk to it, and a hostile DNS name can point at 127.0.0.1. These checks
// pin who gets in: only yearthreethousand.com, only by the right host name, only
// after the person says yes on the machine, only with the token that yes minted.
import assert from 'node:assert';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { createPairing } from '../y3k-code/pair.mjs';
import { createHttp, SITE_ORIGINS } from '../y3k-code/http.mjs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const base = mkdtempSync(join(tmpdir(), 'y3k-code-http-'));
const store = createStore(join(base, 'config'));
let consentAnswer = true;
const asked = [];
const engine = createEngine({ store, consent: async (kind, d) => { asked.push({ kind, d }); return consentAnswer; }, bins: { claude: '/nonexistent' } });
const pairing = createPairing({ load: store.tokens, save: store.setTokens });
const newCodes = [];
const http = createHttp({ engine, pairing, onPairCode: (c, why) => newCodes.push({ c, why }) });
const port = await http.listen(0);
const SITE = SITE_ORIGINS[0];

function call(method, path, { to = port, host = `127.0.0.1:${to}`, origin = SITE, token, body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const h = { host, ...headers };
    if (origin) h.origin = origin;
    if (token) h.authorization = `Bearer ${token}`;
    let data = null;
    if (body !== undefined) { data = raw ? body : JSON.stringify(body); h['content-type'] = h['content-type'] || 'application/json'; h['content-length'] = Buffer.byteLength(data); }
    const req = request({ host: '127.0.0.1', port: to, method, path, headers: h }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode, headers: res.headers, json, text }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Read an event stream until `n` data events (or a reset) have arrived.
function stream(path, token, { n = 1, ms = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}`, origin: SITE, authorization: `Bearer ${token}` } }, (res) => {
      let buf = '';
      const got = [];
      let reset = null;
      const done = () => { clearTimeout(t); req.destroy(); resolve({ status: res.statusCode, headers: res.headers, events: got, reset }); };
      const t = setTimeout(done, ms);
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!data) continue;
          if (ev === 'reset') reset = JSON.parse(data); else got.push(JSON.parse(data));
          if (got.length >= n) return done();
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

console.log('who can knock:');

await ok('every other web page is refused', async () => {
  for (const origin of ['https://evil.example', 'http://yearthreethousand.com', 'https://yearthreethousand.com.evil.example', 'null', 'http://localhost:5173']) {
    const r = await call('GET', '/v1/hello', { origin });
    assert.equal(r.status, 403, origin);
    assert.ok(!r.headers['access-control-allow-origin'], `${origin} gets no CORS grant`);
  }
  assert.equal((await call('GET', '/v1/hello', { origin: null })).status, 403, 'no Origin at all');
});

await ok('a hostile DNS name pointed at 127.0.0.1 is refused (rebinding)', async () => {
  for (const host of ['evil.example', `evil.example:${port}`, `127.0.0.1:${port + 1}`, `0.0.0.0:${port}`, `[::1]:${port}`]) {
    assert.equal((await call('GET', '/v1/hello', { host })).status, 421, host);
  }
});

await ok('the site may knock; preflight grants private-network access and nothing more', async () => {
  const r = await call('OPTIONS', '/v1/cmd', { headers: { 'access-control-request-method': 'POST', 'access-control-request-private-network': 'true' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], SITE);
  assert.equal(r.headers['access-control-allow-private-network'], 'true');
  assert.ok(!r.headers['access-control-allow-credentials'], 'cookies never');
  const h = await call('GET', '/v1/hello');
  assert.equal(h.status, 200);
  assert.equal(h.json.paired, false);
  assert.equal(h.headers['cache-control'], 'no-store');
  assert.equal(h.headers['x-content-type-options'], 'nosniff');
  assert.match(h.headers['content-security-policy'], /frame-ancestors 'none'/);
});

await ok('nothing works without a token', async () => {
  assert.equal((await call('POST', '/v1/cmd', { body: { cmd: 'engine.hello' } })).status, 401);
  assert.equal((await call('POST', '/v1/cmd', { body: { cmd: 'engine.hello' }, token: 'A'.repeat(43) })).status, 401);
  assert.equal((await call('GET', '/v1/events')).status, 401);
});

console.log('\npairing:');

await ok('a wrong code is refused, and at most five tries a minute are heard', async () => {
  const code = pairing.issueCode();
  const wrong = code[0] === 'A' ? 'B' + code.slice(1) : 'A' + code.slice(1);
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/v1/pair', { body: { code: wrong } })).status, 403);
  assert.equal((await call('POST', '/v1/pair', { body: { code } })).status, 429, 'even the right code, once the minute is spent');
  assert.equal(asked.length, 0, 'the person was never bothered');
});

// The claim limit is per minute; move the clock instead of waiting.
const clock = { t: Date.now() };
const pairing2 = createPairing({ load: store.tokens, save: store.setTokens, now: () => clock.t });
const http2 = createHttp({ engine, pairing: pairing2, onPairCode: (c, why) => newCodes.push({ c, why }) });
const port2 = await http2.listen(0);
const call2 = (m, p, o = {}) => call(m, p, { to: port2, ...o });
const port1 = port;

await ok('five wrong tries void the code and a new one is shown on the machine', async () => {
  const code = pairing2.issueCode();
  const wrong = code[0] === 'A' ? 'B' + code.slice(1) : 'A' + code.slice(1);
  for (let i = 0; i < 5; i++) assert.equal((await call2('POST', '/v1/pair', { body: { code: wrong } })).status, 403);
  assert.ok(newCodes.some((x) => x.why === 'voided'));
  clock.t += 61000;
  const r = await call2('POST', '/v1/pair', { body: { code } });
  assert.equal(r.status, 403, 'the old code is dead');
});

await ok('an expired code is refused and replaced', async () => {
  clock.t += 61000;
  const code = pairing2.issueCode();
  clock.t += 5 * 60 * 1000 + 1;
  const r = await call2('POST', '/v1/pair', { body: { code } });
  assert.equal(r.status, 410);
  assert.ok(newCodes.some((x) => x.why === 'expired'));
});

await ok('the right code still needs a yes on the machine', async () => {
  clock.t += 61000;
  consentAnswer = false;
  const code = pairing2.issueCode();
  const r = await call2('POST', '/v1/pair', { body: { code } });
  assert.equal(r.status, 403);
  assert.equal(asked.at(-1).kind, 'pair');
  assert.equal(asked.at(-1).d.origin, SITE);
  assert.ok(!r.json.token);
});

let token;
await ok('yes mints a token, once; the code cannot be reused', async () => {
  clock.t += 61000;
  consentAnswer = true;
  const code = pairing2.issueCode();
  const r = await call2('POST', '/v1/pair', { body: { code } });
  assert.equal(r.status, 200);
  token = r.json.token;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(store.tokens()).includes(token), 'only its hash is stored');
  const again = await call2('POST', '/v1/pair', { body: { code } });
  assert.notEqual(again.status, 200);
});

console.log('\nonce paired:');

await ok('commands work, and are validated', async () => {
  const r = await call('POST', '/v1/cmd', { token, body: { id: 'a1', cmd: 'engine.hello' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.id, 'a1');
  assert.equal(r.json.name, 'y3k-code');
  assert.ok(Array.isArray(r.json.providers));
  assert.ok(!JSON.stringify(r.json).includes('secrets'));
  const bad = await call('POST', '/v1/cmd', { token, body: { cmd: 'session.start', provider: 'claude', cwd: '/', mode: 'bypassPermissions' } });
  assert.equal(bad.json.ok, false);
  assert.equal(bad.json.code, 'invalid');
  const extra = await call('POST', '/v1/cmd', { token, body: { cmd: 'engine.hello', eval: 'x' } });
  assert.equal(extra.json.ok, false);
  assert.equal((await call('POST', '/v1/cmd', { token, body: 'nope', raw: true })).status, 400);
  assert.equal((await call('POST', '/v1/cmd', { token, body: { cmd: 'engine.hello' }, headers: { 'content-type': 'text/plain' } })).status, 415);
});

await ok('a key set from the page is kept on the machine and never echoed', async () => {
  const r = await call('POST', '/v1/cmd', { token, body: { cmd: 'provider.setKey', provider: 'claude', key: 'sk-ant-api03-' + 'x'.repeat(40) } });
  assert.equal(r.json.ok, true);
  assert.ok(!r.text.includes('x'.repeat(40)));
  assert.equal(r.json.providers.find((p) => p.id === 'claude').keySet, true);
  const bad = await call('POST', '/v1/cmd', { token, body: { cmd: 'provider.setKey', provider: 'claude', key: 'hello' } });
  assert.equal(bad.json.ok, false);
});

await ok('the event stream replays from where the page left off', async () => {
  const all = await stream('/v1/events?after=0', token, { n: 1 });
  assert.equal(all.status, 200);
  assert.match(all.headers['content-type'], /text\/event-stream/);
  assert.equal(all.events[0].type, 'engine.hello');
  const epoch = all.events[0].epoch;
  const later = await stream(`/v1/events?after=${all.events[0].seq}&epoch=${epoch}`, token, { n: 1, ms: 300 });
  assert.ok(later.events.every((e) => e.seq > all.events[0].seq));
  assert.equal(later.reset, null);
});

await ok('a page from an older engine is told to reload', async () => {
  const r = await stream('/v1/events?after=12&epoch=0000000000000000', token, { n: 1, ms: 300 });
  assert.equal(r.reset.epoch, engine.epoch);
});

await ok('revoke disconnects every browser', async () => {
  assert.equal((await call('POST', '/v1/revoke', { token })).status, 200);
  assert.equal((await call('POST', '/v1/cmd', { token, body: { cmd: 'engine.hello' } })).status, 401);
});

await ok('the listener is on loopback only', () => {
  assert.equal(http.server.address().address, '127.0.0.1');
  assert.equal(port1, http.port);
});

await http.close();
await http2.close();
engine.shutdown();
rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
process.exit(0);
