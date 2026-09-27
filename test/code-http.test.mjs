// THE COMPANION'S DOOR. Run:  node test/code-http.test.mjs
//
// y3k Code's engine listens on 127.0.0.1. Any web page the person has open can
// try to talk to it, and a hostile DNS name can point at 127.0.0.1. These checks
// pin who gets in: only yearthreethousand.com, only by the right host name, only
// after the person says yes on the machine, only with the token that yes minted.
//
// And the companion's other door, the approval page: the person's own browser
// on this machine may SEE what is being asked with no Origin at all, but only a
// form posted from that very page — carrying the question's nonce — can answer.
// Then the one-click start (`--pair`), end to end through the real command.
import assert from 'node:assert';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { createPairing } from '../y3k-code/pair.mjs';
import { createHttp, SITE_ORIGINS, _test as httpTest } from '../y3k-code/http.mjs';
import { createConsentDesk } from '../y3k-code/consent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const until = async (fn, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timed out'); };

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

// An event stream held open: resolves `ended` (with ms since open) when the
// engine closes it, and collects every line, pings included.
function openStream(to, token) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = request({ host: '127.0.0.1', port: to, path: '/v1/events?after=0', headers: { host: `127.0.0.1:${to}`, origin: SITE, authorization: `Bearer ${token}` } }, (res) => {
      const s = { status: res.statusCode, text: '', req };
      s.ended = new Promise((done) => res.on('end', () => done(Date.now() - t0)));
      res.setEncoding('utf8').on('data', (c) => { s.text += c; });
      resolve(s);
    });
    req.on('error', reject);
    req.end();
  });
}

await ok('revoke disconnects every browser — its open event stream too, at once', async () => {
  const s = await openStream(port, token);
  assert.equal(s.status, 200);
  assert.equal((await call('POST', '/v1/revoke', { token })).status, 200);
  const ms = await Promise.race([s.ended, new Promise((r) => setTimeout(() => r(-1), 3000))]);
  assert.ok(ms >= 0, 'the stream was ended by the revoke, not left to run until the next reconnect');
  assert.equal((await call('POST', '/v1/cmd', { token, body: { cmd: 'engine.hello' } })).status, 401);
});

await ok('a revoke typed in another terminal ends an open stream within one ping', async () => {
  // Two stores on one directory are two processes: the running companion,
  // and `y3k-code revoke` in a second terminal (it writes tokens.json = {}).
  const dir = join(base, 'config-two');
  const running = createStore(dir);
  const pairingR = createPairing({ load: running.tokens, save: running.setTokens });
  const httpR = createHttp({ engine, pairing: pairingR, pingMs: 60 });
  const portR = await httpR.listen(0);
  const keep = pairingR.mint({ origin: SITE, agent: 'Chrome' });
  const s = await openStream(portR, keep);
  await until(() => /^: ping$/m.test(s.text), 2000);
  const still = await Promise.race([s.ended, new Promise((r) => setTimeout(() => r(-1), 200))]);
  assert.equal(still, -1, 'a good token keeps its stream: pinged, not ended');
  createStore(dir).setTokens({});
  const ms = await Promise.race([s.ended, new Promise((r) => setTimeout(() => r(-1), 3000))]);
  assert.ok(ms >= 0, 'ended by the next ping once the file said so');
  assert.equal((await call('POST', '/v1/cmd', { to: portR, token: keep, body: { cmd: 'engine.hello' } })).status, 401);
  await httpR.close();
});

await ok('the listener is on loopback only', () => {
  assert.equal(http.server.address().address, '127.0.0.1');
  assert.equal(port1, http.port);
});

console.log('\npre-approved by the command (--pair):');

await ok('the code from the command pairs with no second question — only from the site', async () => {
  clock.t += 61000;
  const before = asked.length;
  assert.equal(pairing2.preapprove('WXYZ-2345'), true);
  assert.equal((await call2('GET', '/v1/hello')).json.preapproved, true, 'a watching page can tell this engine is the one');
  const evil = await call2('POST', '/v1/pair', { origin: 'https://evil.example', body: { code: 'WXYZ2345' } });
  assert.equal(evil.status, 403, 'the Origin rule is unchanged');
  const r = await call2('POST', '/v1/pair', { body: { code: 'WXYZ2345' } });
  assert.equal(r.status, 200);
  assert.match(r.json.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(asked.length, before, 'nobody was asked again: running the command was the yes');
  assert.equal((await call2('POST', '/v1/cmd', { token: r.json.token, body: { cmd: 'engine.hello' } })).status, 200);
  assert.equal((await call2('GET', '/v1/hello')).json.preapproved, false);
  const again = await call2('POST', '/v1/pair', { body: { code: 'WXYZ2345' } });
  assert.notEqual(again.status, 200, 'once');
  assert.ok(engine.audit.tail(20).some((a) => a.kind === 'pair' && a.preapproved === true), 'and the record says how');
});

console.log('\nthe approval page:');

// An engine whose questions go to a terminal AND the approval page.
const term = { input: new PassThrough(), output: new PassThrough(), text: '' };
term.input.isTTY = true;
term.output.setEncoding('utf8').on('data', (d) => { term.text += d; });
let port3 = 0;
const desk = createConsentDesk({ input: term.input, output: term.output, timeoutMs: 8000, approveUrl: () => `http://127.0.0.1:${port3}/approve` });
const store3 = createStore(join(base, 'config3'));
const engine3 = createEngine({ store: store3, consent: desk.ask, bins: { claude: '/nonexistent' } });
const pairing3 = createPairing({ load: store3.tokens, save: store3.setTokens });
const http3 = createHttp({ engine: engine3, pairing: pairing3, desk });
port3 = await http3.listen(0);
const call3 = (m, p, o = {}) => call(m, p, { to: port3, ...o });
const LOCAL = `http://127.0.0.1:${port3}`;
const form = (o) => new URLSearchParams(o).toString();
const answer = (id, fields, origin = LOCAL) => call3('POST', `/approve/${id}`, { origin, body: form(fields), raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } });

await ok('it opens with no Origin at all, and nothing else here does', async () => {
  const r = await call3('GET', '/approve', { origin: null });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.match(r.text, /Nothing is waiting for an answer right now/);
  assert.equal((await call3('GET', '/v1/hello', { origin: null })).status, 403, 'the rest of the door is unchanged');
  assert.equal((await call3('GET', '/approve', { origin: null, host: `evil.example:${port3}` })).status, 421, 'the Host rule still holds (rebinding)');
});

await ok('it runs nothing it did not bring, and cannot be framed', async () => {
  const r = await call3('GET', '/approve', { origin: null });
  const csp = r.headers['content-security-policy'];
  assert.match(csp, /^default-src 'none';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['referrer-policy'], 'same-origin', 'no-referrer would make the form post Origin: null');
  const sha = (x) => `'sha256-${createHash('sha256').update(x, 'utf8').digest('base64')}'`;
  const style = /<style>([\s\S]*?)<\/style>/.exec(r.text)[1];
  const script = /<script>([\s\S]*?)<\/script>/.exec(r.text)[1];
  assert.ok(csp.includes(`style-src ${sha(style)}`), 'the one style, by hash');
  assert.ok(csp.includes(`script-src ${sha(script)}`), 'the one script, by hash');
  assert.ok(!/unsafe-inline|unsafe-eval|https?:/.test(csp));
  assert.ok(/setTimeout\(function \(\) \{ set\(true\); \}, 700\)/.test(script) && /hasFocus\(\)/.test(script) && /'blur'/.test(script),
    'Allow wakes ~700ms after the window has focus, and sleeps when it loses it');
});

let pairReq;
await ok('it lists what is waiting, in plain words — and looking changes nothing', async () => {
  const code = pairing3.issueCode();
  pairReq = call3('POST', '/v1/pair', { body: { code } });
  await until(() => desk.pending().length === 1);
  await until(() => /Allow\? \[y\/N\]/.test(term.text));
  const a = await call3('GET', '/approve', { origin: null });
  const b = await call3('GET', '/approve', { origin: null });
  for (const r of [a, b]) {
    assert.match(r.text, /<h2>Connect a browser to y3kode\?<\/h2>/);
    assert.match(r.text, /https:\/\/yearthreethousand\.com \(a browser\) wants to connect to y3kode on this computer/);
    assert.match(r.text, /name="answer" value="allow" class="yes" data-allow disabled>/, 'Allow starts off');
    assert.ok(!/http-equiv="refresh"/.test(r.text), 'no reload under the cursor while a question is up');
  }
  assert.equal(desk.pending().length, 1, 'still waiting');
});

await ok('an answer needs the nonce, from this very page\'s origin', async () => {
  const [q] = desk.pending();
  assert.equal((await answer(q.id, { answer: 'allow' })).status, 403, 'no nonce');
  assert.equal((await answer(q.id, { answer: 'allow', nonce: '0'.repeat(32) })).status, 403, 'wrong nonce');
  for (const origin of ['https://evil.example', SITE, 'null', `http://127.0.0.1:${port3 + 1}`, `http://localhost:${port3}.evil.example`]) {
    assert.equal((await answer(q.id, { answer: 'allow', nonce: q.nonce }, origin)).status, 403, origin);
  }
  assert.equal((await answer(q.id, { answer: 'allow', nonce: q.nonce }, null)).status, 403, 'no Origin');
  const json = await call3('POST', `/approve/${q.id}`, { origin: LOCAL, body: { answer: 'allow', nonce: q.nonce } });
  assert.equal(json.status, 415, 'a form, not a script\'s JSON');
  assert.equal((await call3('GET', `/approve/${q.id}`, { origin: null })).status, 404);
  assert.equal(desk.pending().length, 1, 'none of that answered it');
});

await ok('a yes in the window answers the question the terminal is asking', async () => {
  const [q] = desk.pending();
  const r = await answer(q.id, { answer: 'allow', nonce: q.nonce }, `http://localhost:${port3}`);
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, '/approve?done=allow');
  const paired = await pairReq;
  assert.equal(paired.status, 200, 'the waiting pair request went through');
  assert.ok(paired.json.token);
  assert.match(term.text, /answered in the approval window — allowed/);
  const after = await call3('GET', '/approve?done=allow', { origin: null });
  assert.match(after.text, /Allowed\./);
  assert.match(after.text, /data-close="1"/, 'nothing left: the window may close itself');
  assert.equal((await answer(q.id, { answer: 'deny', nonce: q.nonce })).headers.location, '/approve?done=gone', 'answered once');
});

await ok('what a page asks about is shown as text, never as markup', async () => {
  const p = desk.ask('folder.trust', { path: '/tmp/<script>alert(1)</script>"x', findings: [{ file: '.mcp.json', detail: '<img src=x onerror=alert(1)>' }] });
  await until(() => desk.pending().length === 1);
  const r = await call3('GET', '/approve', { origin: null });
  assert.ok(!r.text.includes('<script>alert') && !r.text.includes('<img src=x'));
  assert.ok(r.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;x'));
  const [q] = desk.pending();
  await answer(q.id, { answer: 'deny', nonce: q.nonce });
  assert.equal(await p, false);
});

console.log('\nthe y3k-code command:');

const BIN = join(ROOT, 'y3k-code', 'bin', 'y3k-code.cjs');
const noTools = mkdtempSync(join(base, 'path-'));
function companion(args, home) {
  const c = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, Y3K_CODE_HOME: home, PATH: noTools }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
  c.stderr.setEncoding('utf8').on('data', (d) => { out += d; });
  const exit = new Promise((r) => c.on('exit', (code) => r(code)));
  const see = async (re, ms = 10000) => { for (let i = 0; i < ms / 25; i++) { const m = re.exec(out); if (m) return m; await new Promise((r) => setTimeout(r, 25)); } throw new Error(`never printed ${re}:\n${out}`); };
  return { out: () => out, see, exit, stop: () => { c.kill('SIGTERM'); return exit; } };
}

const home = join(base, 'bin-home');
await ok('--pair: no tab, plain words, and the page that gave out the command connects by itself', async () => {
  const c = companion(['--pair', 'wxyz-2345', '--port', '0'], home);
  const to = Number((await c.see(/running on this computer \(127\.0\.0\.1:(\d+)\)/))[1]);
  await c.see(/approval window: http:\/\/127\.0\.0\.1:\d+\/approve/);
  assert.ok(c.out().includes('Leave this window open — the y3k page you copied this from connects by itself.'));
  assert.ok(!c.out().includes('#y3k-code='), 'no pairing link, so no second tab');
  assert.equal((await call('GET', '/v1/hello', { to })).json.preapproved, true);
  const r = await call('POST', '/v1/pair', { to, body: { code: 'WXYZ2345' } });
  assert.equal(r.status, 200, 'with no terminal to ask on, and nothing asked');
  await c.see(/Connected to https:\/\/yearthreethousand\.com/);
  await c.stop();
});

await ok('started again, already paired: it opens y3kode itself, not a new pairing link', async () => {
  const c = companion(['--no-open', '--port', '0'], home);
  await c.see(/Open y3kode: https:\/\/yearthreethousand\.com\/#code/);
  await c.see(/Another browser\? Type this code in y3kode: [A-Z0-9]{4}-[A-Z0-9]{4}/);
  assert.ok(!c.out().includes('#y3k-code='));
  await c.stop();
});

await ok('never paired: the pairing link as before — and with no terminal, the window answers', async () => {
  const c = companion(['--no-open', '--port', '0'], join(base, 'bin-home-2'));
  const [, to, code] = await c.see(/Open: https:\/\/yearthreethousand\.com\/#y3k-code=(\d+)-([A-Z0-9]{8})/);
  const pair = call('POST', '/v1/pair', { to: Number(to), body: { code } });
  await c.see(/Answer in the approval window: http:\/\/127\.0\.0\.1:\d+\/approve/);
  const page = await call('GET', '/approve', { to: Number(to), origin: null });
  const id = /action="\/approve\/([A-Za-z0-9]+)"/.exec(page.text)[1];
  const nonce = /name="nonce" value="([0-9a-f]{32})"/.exec(page.text)[1];
  const r = await call('POST', `/approve/${id}`, { to: Number(to), origin: `http://127.0.0.1:${to}`, body: form({ nonce, answer: 'allow' }), raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 303);
  assert.equal((await pair).status, 200, 'it waited for the window instead of refusing at once');
  await c.stop();
});

await ok('a code that is not ours is refused before anything starts', async () => {
  const c = companion(['--pair', 'rm -rf', '--port', '0'], join(base, 'bin-home-3'));
  assert.equal(await c.exit, 1);
  assert.match(c.out(), /not a y3kode pairing code/);
});

await ok('an old Node gets a sentence and a link, not a stack trace', () => {
  const old = spawnSync(process.execPath, ['-e', `Object.defineProperty(process, 'versions', { value: { ...process.versions, node: '18.19.0' } }); Object.defineProperty(process, 'version', { value: 'v18.19.0' }); require(${JSON.stringify(BIN)});`], { encoding: 'utf8' });
  assert.equal(old.status, 1);
  assert.match(old.stderr, /needs Node\.js 20\.6 or newer; this computer has v18\.19\.0/);
  assert.match(old.stderr, /Install Node\.js 20 or newer: https:\/\/nodejs\.org/);
  const now = spawnSync(process.execPath, [BIN, 'version'], { encoding: 'utf8', env: { ...process.env, Y3K_CODE_HOME: join(base, 'bin-home-4') } });
  assert.equal(now.status, 0);
  assert.match(now.stdout, /^\d+\.\d+\.\d+\n$/);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'y3k-code', 'package.json'), 'utf8'));
  assert.equal(pkg.bin['y3k-code'], 'bin/y3k-code.cjs');
  assert.ok(readFileSync(BIN, 'utf8').startsWith('#!/usr/bin/env node\n'));
  const modes = spawnSync('git', ['ls-files', '-s', 'y3k-code/bin'], { cwd: ROOT, encoding: 'utf8' });
  if (modes.status === 0 && modes.stdout.trim()) {
    for (const line of modes.stdout.trim().split('\n')) assert.ok(line.startsWith('100755 '), `executable in git: ${line}`);
  }
});

await ok('signing in needs no switch; a key is the person\'s choice, and clearing it goes back', () => {
  const h = join(base, 'bin-home-5');
  const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', input, env: { ...process.env, Y3K_CODE_HOME: h, PATH: noTools } });
  const cfg = () => (existsSync(join(h, 'config.json')) ? JSON.parse(readFileSync(join(h, 'config.json'), 'utf8')) : {});
  const on = run(['signin', 'on']);
  assert.equal(on.status, 0, on.stderr);
  assert.match(on.stdout, /always uses each coding tool's own sign-in on this computer/);
  assert.match(on.stdout, /Claude Code\s+sign in with `claude`\n\s+Codex\s+sign in with `codex login`\n\s+Gemini CLI\s+sign in with `gemini`\n\s+OpenCode\s+sign in with `opencode auth login`/);
  assert.ok(!('signIn' in cfg()), 'the old switch writes nothing');
  assert.match(run(['status']).stdout, /Signing in: each tool's own sign-in\n/);
  const doc = run(['doctor']);
  assert.match(doc.stdout, /Claude Code\s+not installed/);
  const set = run(['key', 'set', 'claude'], 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz\n');
  assert.equal(set.status, 0, set.stderr);
  assert.match(set.stdout, /Claude Code will use this key instead of your sign-in\. To go back: y3kode key clear claude/);
  assert.deepEqual(cfg().auth, { claude: 'apiKey' });
  assert.match(run(['status']).stdout, /except Claude Code, on the key you chose/);
  assert.equal(run(['key', 'set', 'deepseek'], 'sk-deepseek-abcdefghijklmnopq\n').status, 0);
  assert.deepEqual(cfg().auth, { claude: 'apiKey' }, 'an open model\'s key is not a choice against any sign-in');
  const clr = run(['key', 'clear', 'claude']);
  assert.match(clr.stdout, /Claude Code is back on its own sign-in/);
  assert.deepEqual(cfg().auth, {});
  const pkg = JSON.parse(readFileSync(join(ROOT, 'y3k-code', 'package.json'), 'utf8'));
  assert.equal(pkg.bin.y3kode, pkg.bin['y3k-code'], '`y3kode` is the same command');
  assert.match(run(['help']).stdout, /^y3kode — /);
});

await http.close();
await http2.close();
await http3.close();
engine.shutdown();
engine3.shutdown();
rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
process.exit(0);
