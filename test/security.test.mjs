// THE SITE'S FENCE. Run:  node test/security.test.mjs
//
// The first check guards a hole that was live on any local y3k: a page on
// another port of the same host could POST to /api/brain/stream and the
// founder's session cookie went with it (SameSite=Lax counts every port of a
// host as one site). The rest pin what every response says about framing and
// sniffing, and what the app shell's content policy allows.
//
// Then the fence is walked on a running server: one source flooding the paid
// routes, forty people behind one address who must not refuse each other's
// turns, a hundred and twenty there with their pages, feeds and worlds open
// who must not refuse each other's answers or polls (and the feet and the eye
// counted the same way), a post whose media lies about what it is, the
// reader's borrowed page
// served on this origin, a live room's comments, and — in this process, with
// the provider's token endpoint faked — Google or Apple arriving at an account
// someone else opened with the same address and a password.
import assert from 'node:assert';
import { createHash, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { crossSiteRefused, CROSS_SITE_OK, BASE_HEADERS, appShellCsp, inlineScriptHashes, noteCspReport, sourceKey, _test } from '../security.mjs';
import { pack } from '../src/eyewire.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const check = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const req = (method, headers = {}) => ({ method, headers: { host: 'yearthreethousand.com', ...headers } });

console.log('who may change anything:');

ok('this page may', () => {
  assert.equal(crossSiteRefused(req('POST', { 'sec-fetch-site': 'same-origin' }), '/api/brain/stream'), false);
});
ok('another site may not', () => {
  assert.equal(crossSiteRefused(req('POST', { 'sec-fetch-site': 'cross-site' }), '/api/brain/stream'), true);
});
ok('another port of the same host may not — the hole this closes', () => {
  const r = { method: 'POST', headers: { host: 'localhost:5173', 'sec-fetch-site': 'same-site', origin: 'http://localhost:8080' } };
  assert.equal(crossSiteRefused(r, '/api/brain/stream'), true);
});
ok('without Sec-Fetch-Site, Origin decides', () => {
  assert.equal(crossSiteRefused(req('POST', { origin: 'https://yearthreethousand.com' }), '/api/posts'), false);
  assert.equal(crossSiteRefused(req('POST', { origin: 'https://evil.example' }), '/api/posts'), true);
  assert.equal(crossSiteRefused({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://localhost:8080' } }, '/api/posts'), true, 'a different port is a different host');
  assert.equal(crossSiteRefused(req('POST', { origin: 'null' }), '/api/posts'), true, 'an opaque origin (sandboxed frame) is refused');
});
ok('no page at all (curl, the import script) is not a cross-site request', () => {
  assert.equal(crossSiteRefused(req('POST'), '/api/import/airden'), false);
});
ok('reading is never refused, and non-API paths are not the guard\'s business', () => {
  assert.equal(crossSiteRefused(req('GET', { 'sec-fetch-site': 'cross-site' }), '/api/presences'), false);
  assert.equal(crossSiteRefused(req('POST', { 'sec-fetch-site': 'cross-site' }), '/index.html'), false);
});
ok('Apple\'s sign-in and the browser\'s own CSP reports are the two exceptions', () => {
  assert.deepEqual([...CROSS_SITE_OK].sort(), ['/api/auth/oauth/apple/callback', '/api/csp-report']);
  assert.equal(crossSiteRefused(req('POST', { 'sec-fetch-site': 'cross-site' }), '/api/auth/oauth/apple/callback'), false);
  assert.equal(crossSiteRefused(req('POST', { 'sec-fetch-site': 'cross-site' }), '/api/auth/oauth/google/callback'), true);
});

console.log('who is asking:');

// Audit 2026-10-08: the /64 was the first four pieces of the address AS
// WRITTEN, and an address is written compressed, so 2600:3c00::1 and
// 2600:3c00::2 were two machines with the interface's own bits in the key.
ok('an IPv6 address is its /64, read off the address written out in full', () => {
  for (const a of ['2600:3c00::1', '2600:3c00::2', '2600:3c00:0:0:5:6:7:8', '2600:3c00::f03c:91ff:fe12:3456', '2600:3C00:0000:0000::9', '2600:3c00::1%eth0', '2600:3c00::']) {
    assert.equal(sourceKey(a), '2600:3c00:0:0::/64', a);
  }
  assert.equal(sourceKey('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.notEqual(sourceKey('2001:db8:1:2::1'), sourceKey('2001:db8:1:3::1'), 'two /64s are two machines');
  assert.equal(sourceKey('2001:0db8:0001:0002:0000:0000:0000:0001'), '2001:db8:1:2::/64', 'leading zeros are the same group');
  assert.equal(sourceKey('::1'), '0:0:0:0::/64');
});
ok('IPv4 is the whole address, however it is dressed', () => {
  assert.equal(sourceKey('203.0.113.7'), '203.0.113.7');
  assert.equal(sourceKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(sourceKey('::ffff:cb00:7107'), '203.0.113.7');
  assert.equal(sourceKey(''), 'unknown');
  assert.equal(sourceKey('not an address'), 'not an address', 'kept whole, never collapsed into a shared bucket');
});
ok('the limiter, the signup cap, the music lookups and the relay\'s share for each machine all count by it', () => {
  const srv = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  const auth = readFileSync(join(ROOT, 'auth.mjs'), 'utf8');
  assert.ok(/const rateBucket = sourceOf;/.test(srv), 'the rate limiter has its own idea of a machine again');
  assert.ok(/await signup\(body, sourceOf\(req\)\)/.test(auth), 'signups are counted by the full address again');
  assert.ok(/music\.list\(\{ kind, q, source: sourceOf\(req\) \}\)/.test(srv), 'music lookups are not counted by machine');
  // which machine's accounts give way first at the relay's ceiling
  // (own-relay.mjs roomFor; each account judged as itself, never a cap on a
  // machine below it, gone 2026-10-12): every door
  // that may think on someone's own sign-in names the machine that asked, the
  // same way (each pinned in test/life-brain.test.mjs), and the relay's
  // provider hands it on
  assert.ok((srv.match(/source: sourceOf\(req\)/g) || []).length >= 7 && /opts\.source = sourceOf\(req\);/.test(srv), 'the relay is not told which machine asked');
  assert.match(readFileSync(join(ROOT, 'own-relay.mjs'), 'utf8'), /source: opts\?\.source/);
});

console.log('what every response says:');

ok('only this site may frame it; nothing is sniffed', () => {
  assert.equal(BASE_HEADERS['x-frame-options'], 'SAMEORIGIN');
  assert.equal(BASE_HEADERS['x-content-type-options'], 'nosniff');
  for (const k of Object.keys(BASE_HEADERS)) assert.equal(k, k.toLowerCase(), 'lowercase, so a route can override by key');
});

console.log('the app shell\'s content policy:');

ok('the importmap is allowed by its own hash, computed from the page', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const hashes = inlineScriptHashes(html);
  assert.equal(hashes.length, 1, 'one inline script: the importmap');
  const body = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
  assert.equal(hashes[0], `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  assert.ok(appShellCsp(hashes).includes(hashes[0]));
});
ok('no inline script beyond the hashed ones, no plugins, no framing by others', () => {
  const csp = appShellCsp([]);
  assert.ok(!/unsafe-inline/.test(csp.split(';').find((d) => d.trim().startsWith('script-src'))), 'script-src never allows unsafe-inline');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /connect-src[^;]*http:\/\/127\.0\.0\.1:\*/, 'the local Code engine is reachable');
});
ok('the enforced policy is as narrow as what the page uses', () => {
  const csp = appShellCsp([]);
  const dir = (name, policy = csp) => policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) || '';
  // jsDelivr is anyone's to publish to: only the one pinned vision package
  const pkg = /https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@([\d.]+)\//;
  for (const d of ['script-src', 'connect-src']) {
    assert.match(dir(d), pkg, `${d} names the vision package`);
    assert.ok(!dir(d).split(/\s+/).includes('https://cdn.jsdelivr.net'), `${d} lets in all of jsDelivr`);
  }
  // and its version is the one every importer pins
  const v = dir('script-src').match(pkg)[1];
  for (const f of ['index.html', 'eye.html', 'src/perceive.js', 'src/eye.js']) {
    const pins = [...readFileSync(join(ROOT, f), 'utf8').matchAll(/tasks-vision@([\d.]+)/g)].map((m) => m[1]);
    assert.ok(pins.length > 0, `${f} names the vision package`);
    for (const p of pins) assert.equal(p, v, `${f} pins tasks-vision@${p}, the policy @${v}`);
  }
  assert.match(dir('connect-src'), /https:\/\/storage\.googleapis\.com\/mediapipe-models\//, 'the models, and only their folder');
  assert.ok(!/\bhttps:\/\/storage\.googleapis\.com(\s|$)/.test(dir('connect-src')), 'all of Google storage');
  assert.ok(!/localhost/.test(dir('connect-src')), 'nothing on the page talks to localhost: the engine is at 127.0.0.1');
  assert.match(dir('frame-src'), /(^|\s)y3k:(\s|$)/, 'Firefox opens the desktop app through a frame on its own scheme');
  assert.ok(!/localhost|127\.0\.0\.1/.test(dir('frame-src') + dir('img-src')), 'the deployed policy frames no local 4irden');
  // a server that is not the deployed one may cross to a 4irden on this machine
  const dev = appShellCsp([], { dev: true });
  assert.match(dir('frame-src', dev), /http:\/\/localhost:\*/);
  assert.match(dir('img-src', dev), /http:\/\/localhost:\*/);
  assert.equal(dir('script-src', dev), dir('script-src'), 'dev never widens what may run');
  assert.equal(dir('connect-src', dev), dir('connect-src'));
});
ok('the phone lending its eye answers the vision library\'s beacon itself, once the eye starts', () => {
  // the enforced policy would refuse it anyway; answering it keeps the
  // library off its error path and the violation log a list of real problems
  const eye = readFileSync(join(ROOT, 'src/eye.js'), 'utf8');
  assert.match(eye, /odml\.pa\.googleapis\.com/, 'the beacon host is named');
  assert.match(eye, /new Response\('', \{ status: 200 \}\)/, 'it is answered, not rejected');
  const task = eye.slice(eye.indexOf('async function ensureTask'));
  assert.ok(task.indexOf('muzzle();') > 0 && task.indexOf('muzzle();') < task.indexOf('await import(VISION)'), 'muzzled before the library loads');
  assert.ok(!/^muzzle\(\);/m.test(eye), 'never at load: a phone that never lends its eye carries no patch');
});
ok('violation reports are logged once per kind', () => {
  _test.reset();
  const r = { 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.example/x.js', 'document-uri': 'https://yearthreethousand.com/' } };
  assert.equal(noteCspReport(r), true);
  assert.equal(noteCspReport(r), false);
  assert.equal(noteCspReport(null), false);
});

console.log('wired into the server:');

ok('the guard runs before any API route; headers ride every response', () => {
  const src = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  const guard = src.indexOf('if (crossSiteRefused(req, reqPath))');
  const auth = src.indexOf("if (reqPath.startsWith('/api/auth/'))");
  assert.ok(guard > 0 && guard < auth, 'the guard precedes the first API route');
  assert.match(src, /\.\.\.BASE_HEADERS, \.\.\.headers/);
  assert.match(src, /'content-security-policy': appShellCsp\(inlineScriptHashes/, 'the page\'s policy is enforced');
  assert.doesNotMatch(src, /content-security-policy-report-only/, 'nothing went back to report-only');
  assert.match(src, /\^y3k-code\(\\\/\|\$\)/, 'the Code engine is never served');
});

// --- on a running server ------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// A server of its own on a fresh data folder, with no founder.
// `seed` may write into the folder before it boots; `node` is flags for node.
async function boot(env = {}, { seed, node = [] } = {}) {
  const data = mkdtempSync(join(tmpdir(), 'y3k-fence-'));
  if (seed) seed(data);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [...node, 'server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DATA_DIR: data, FOUNDER_PASSWORD: '', ANTHROPIC_API_KEY: '', RENDER: '', ...env },
  });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* booting */ } await sleep(120); }
  const get = (path, { cookie, headers = {} } = {}) => fetch(base + path, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
  const post = (path, body, { cookie, headers = {} } = {}) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body),
  });
  return {
    base, data, get, post,
    async stop() {
      if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); }
      rmSync(data, { recursive: true, force: true });
    },
  };
}
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
async function signup(s, username) {
  const r = await s.post('/api/auth/signup', { email: `${username}@example.com`, username, password: 'a-long-password-1', age17: true, terms: true });
  assert.ok(r.ok, `signup ${username}: ${r.status}`);
  return cookieOf(r);
}

console.log('the paid ceiling, one machine against everyone:');

// Tiny budgets: three paid requests a minute from one source. X-Forwarded-For
// stands in for different machines — the limiter reads its rightmost entry,
// the one Render's edge appends. There is no count across every source any
// more: it bounded what the site's own keys could be made to pay, and those
// are gone (2026-10-12), so all it could still do was lock everyone out of
// their own key when enough strangers were busy at once. These ask as nobody
// (a guest), whose paid requests are still counted by the machine; a
// signed-in person's are counted by the account (below).
{
  const s = await boot({ RATE_MAX: '3' });
  const from = (ip, path = '/api/brain/none') => s.get(path, { headers: { 'x-forwarded-for': ip } }).then((r) => r.status);
  try {
    await check('a flood from one machine is stopped by its own ceiling, and spends nobody else\'s', async () => {
      const codes = [];
      for (let i = 0; i < 12; i++) codes.push(await from('203.0.113.1'));
      assert.ok(codes.slice(0, 3).every((c) => c !== 429), `its first three go through: ${codes}`);
      assert.ok(codes.slice(3).every((c) => c === 429), `the rest are refused: ${codes}`);
      assert.notEqual(await from('203.0.113.2'), 429, 'the next person to ask is not refused for it');
    });
    await check('many machines at their full budget lock nobody else out', async () => {
      // eighteen paid requests in the window, from six machines at their own
      // ceiling: once a breaker of five, now each machine's business alone
      for (let m = 3; m < 9; m++) {
        for (let i = 0; i < 3; i++) assert.notEqual(await from(`203.0.113.${m}`), 429, `machine ${m}, request ${i}`);
      }
      assert.notEqual(await from('203.0.113.20'), 429, 'a machine that has asked for nothing yet');
    });
    await check('a machine past its paid ceiling can still read a post\'s replies', async () => {
      assert.equal(await from('203.0.113.1'), 429, 'still past its ceiling');
      assert.equal(await from('203.0.113.1', '/api/posts/no-such-post/comments'), 200);
    });
  } finally { await s.stop(); }
}

console.log('the paid ceiling is each person\'s, not each address\'s:');

// Reversed 2026-10-12. The paid ceiling was RATE_MAX a minute per source, and
// a source is an address: forty people behind one carrier's IPv4, one
// ordinary turn each, and from the thirty-first on they were refused, for
// nothing but sharing it. A signed-in request is counted against its own
// account now; its address keeps only a flood guard (RATE_SOURCE_MAX, a few
// hundred people's worth), which counts what each account's own ceiling let
// through. Three a minute here, so the old count refused the fourth person.
// Accounts are opened from addresses of their own (ten an hour from one) and
// then all ask from the one address.
async function people(s, tag, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await s.post('/api/auth/signup', { email: `${tag}${i}@example.com`, username: `${tag}_${i}`, password: 'a-long-password-1', age17: true, terms: true },
      { headers: { 'x-forwarded-for': `192.0.2.${Math.floor(i / 10) + 1}` } });
    assert.ok(r.ok, `signup ${tag}${i}: ${r.status}`);
    out.push(cookieOf(r));
  }
  return out;
}
{
  const s = await boot({ RATE_MAX: '3' });
  const NAT = '198.51.100.77';
  // one ordinary chat turn: with nothing to think with, the answer says so (200)
  const turn = (cookie, ip = NAT) => s.post('/api/brain', { messages: [{ role: 'user', content: 'hello, how are you today?' }] },
    { cookie, headers: { 'x-forwarded-for': ip } }).then((r) => r.status);
  try {
    const crowd = await people(s, 'crowd', 40);
    await check('forty people behind one IPv4, one ordinary turn each: nobody is refused', async () => {
      const codes = [];
      for (const c of crowd) codes.push(await turn(c));
      assert.deepEqual(codes.map((c, i) => [i + 1, c]).filter(([, c]) => c !== 200), [], 'people refused for sharing an address');
    });
    await check('one of them past their own ceiling is refused, wherever they ask from, and spends nobody else\'s', async () => {
      // their first turn above was one of their three
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push(await turn(crowd[0]));
      assert.deepEqual(codes, [200, 200, 429, 429, 429]);
      assert.equal(await turn(crowd[0], '192.0.2.200'), 429, 'another address is not a fresh budget for the same account');
      assert.equal(await turn(crowd[1]), 200, 'the next person behind the address');
    });
    await check('a guest there is still counted by the address, and the crowd spent none of it; the guests\' flood spends none of the people\'s', async () => {
      const codes = [];
      for (let i = 0; i < 6; i++) codes.push(await turn(null));
      assert.deepEqual(codes, [200, 200, 200, 429, 429, 429], 'an anonymous flood from one source is refused at RATE_MAX');
      assert.equal(await turn(crowd[2]), 200);
    });
    await check('a cookie that opens nothing is a guest, not a fresh account', async () => {
      const forged = crowd[3].replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
      assert.equal(await turn(forged), 429, 'a forged cookie minted a budget of its own');
    });
  } finally { await s.stop(); }
}

// The flood guard, on a server whose guard is twelve paid requests a minute
// per address (three per account): it counts only what each account's own
// ceiling let through, so one account hammering spends three of it, and only
// enough accounts at their full budget at once reach it.
{
  const s = await boot({ RATE_MAX: '3', RATE_SOURCE_MAX: '12' });
  const FLOOD = '198.51.100.99';
  const turn = (cookie, ip = FLOOD) => s.post('/api/brain', { messages: [{ role: 'user', content: 'k' }] },
    { cookie, headers: { 'x-forwarded-for': ip } }).then((r) => r.status);
  try {
    const many = await people(s, 'many', 6);
    await check('one account hammering past its own ceiling spends only its three of its address\'s guard', async () => {
      const codes = [];
      for (let i = 0; i < 20; i++) codes.push(await turn(many[0]));
      assert.equal(codes.filter((c) => c === 200).length, 3, `${codes}`);
      for (const c of many.slice(1, 4)) {
        for (let i = 0; i < 3; i++) assert.equal(await turn(c), 200, 'a neighbour within their own ceiling was refused for the hammering');
      }
    });
    await check('an address past the guard is refused, even an account that has asked for nothing; the same person elsewhere is not', async () => {
      assert.equal(await turn(many[4]), 429, 'the thirteenth turn the accounts let through');
      assert.equal(await turn(many[5]), 429);
      assert.equal(await turn(many[5], '192.0.2.201'), 200);
    });
  } finally { await s.stop(); }
}

console.log('the cheap ceiling, and the feet\'s and the eye\'s, are each person\'s too:');

// Reversed 2026-10-12, as the paid one was. The cheap ceiling carries what a
// signed-in page does between its turns and during them: its own-brain stream,
// the feed's poll, the world's heartbeat, and the answer the page sends back
// for each turn it thinks (POST /api/own-brain/<id>). Counted per source, a
// hundred and twenty people behind one IPv4 refused each other's answers, and
// each refused answer left its turn hanging to the relay's timeout. Each
// account here gets one address of its own to open it from (ten an hour from
// one), and its id comes back with it, for the page.
async function members(s, tag, n) {
  const out = [];
  for (let i = 0; i < n; i += 8) {
    out.push(...await Promise.all(Array.from({ length: Math.min(8, n - i) }, async (_, k) => {
      const j = i + k;
      const r = await s.post('/api/auth/signup', { email: `${tag}${j}@example.com`, username: `${tag}_${j}`, password: 'a-long-password-1', age17: true, terms: true },
        { headers: { 'x-forwarded-for': `198.18.${Math.floor(j / 250)}.${(j % 250) + 1}` } });
      assert.ok(r.ok, `signup ${tag}${j}: ${r.status}`);
      const id = (await r.json()).user?.id;
      assert.ok(id, `signup ${tag}${j} named nobody`);
      return { cookie: cookieOf(r), id };
    })));
  }
  return out;
}
// A person's page, as src/own-brain.js holds it, from an address: every job it
// is handed is answered at once from the same address, as y3kode would answer
// it, and what the site said to each answer is kept.
async function ownPage(s, m, ip) {
  const ac = new AbortController();
  const answers = [];
  let ready = false;
  const r = await fetch(`${s.base}/api/own-brain?provider=claude&as=${encodeURIComponent(m.id)}`,
    { headers: { cookie: m.cookie, 'x-forwarded-for': ip }, signal: ac.signal });
  if (r.status !== 200) { await r.text(); return { status: r.status, answers, close() {} }; }
  (async () => {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev === 'ready') ready = true;
          if (ev === 'job') {
            const job = JSON.parse(data);
            answers.push(s.post(`/api/own-brain/${job.id}`, { ok: true, text: '[calm] Answered on my own plan.', usage: { in: 5, out: 3 } },
              { cookie: m.cookie, headers: { 'x-forwarded-for': ip } }).then(async (a) => { await a.text(); return a.status; }));
          }
        }
      }
    } catch { /* closed */ }
  })();
  for (let i = 0; i < 250 && !ready; i++) await sleep(20);
  return { status: ready ? 200 : 'never ready', answers, close: () => ac.abort() };
}
{
  // the default cheap ceiling, named: three hundred a minute
  const s = await boot({ RATE_CHEAP_MAX: '300' });
  const CAMPUS = '198.51.100.120';
  const at = { headers: { 'x-forwarded-for': CAMPUS } };
  const pages = [];
  try {
    const crowd = await members(s, 'campus', 120);
    await check('a hundred and twenty people behind one IPv4, each with their page open, the feed and the world polled and a turn answered on their own sign-in: nobody is refused, and no turn waits', async () => {
      // four cheap requests each, 480 from the address in one minute: the old
      // count refused the last 180 of them, the page's answers among them
      for (const m of crowd) pages.push(await ownPage(s, m, CAMPUS));
      assert.deepEqual(pages.map((p, i) => [i, p.status]).filter(([, c]) => c !== 200), [], 'pages refused for sharing an address');
      const polls = [];
      for (const m of crowd) {
        for (const path of ['/api/feed', '/api/world/here']) {
          polls.push(await s.get(path, { cookie: m.cookie, ...at }).then(async (r) => { await r.text(); return r.status; }));
        }
      }
      assert.equal(polls.filter((c) => c === 429).length, 0, `polls refused for sharing an address: ${polls.filter((c) => c === 429).length}`);
      const turns = [];
      for (const m of crowd) {
        turns.push(await s.post('/api/brain', { messages: [{ role: 'user', content: 'hello, how are you today?' }] }, { cookie: m.cookie, ...at })
          .then(async (r) => [r.status, (await r.json().catch(() => ({}))).available]));
      }
      assert.deepEqual(turns.map((t, i) => [i, ...t]).filter(([, c, a]) => c !== 200 || a !== true), [], 'turns not answered on their own sign-in');
      const answers = (await Promise.all(pages.map((p) => Promise.all(p.answers)))).flat();
      assert.equal(answers.length, 120, 'a page was never handed its turn');
      assert.deepEqual(answers.filter((c) => c !== 200), [], 'a page\'s answer was refused, and its turn would have hung to the timeout');
    });
    await check('a guest flood from that address is still refused at the cheap ceiling, and spends none of the people\'s', async () => {
      const codes = [];
      for (let i = 0; i < 320; i++) codes.push(await s.get('/api/feed', at).then(async (r) => { await r.text(); return r.status; }));
      assert.equal(codes.indexOf(429), 300, 'the guests\' ceiling at that address is RATE_CHEAP_MAX');
      assert.ok(codes.slice(300).every((c) => c === 429), `${codes.slice(300)}`);
      assert.equal(await s.get('/api/feed', { cookie: crowd[0].cookie, ...at }).then((r) => r.status), 200, 'a person behind it was refused for the guests\' flood');
    });
  } finally {
    for (const p of pages) p.close();
    await s.stop();
  }
}

// The same rule at small numbers: five cheap requests a minute per account,
// twenty per address for the signed in, and three steps and three frames per
// account for the feet and the eye.
{
  const s = await boot({ RATE_CHEAP_MAX: '5', RATE_CHEAP_SOURCE_MAX: '20', RATE_WALK_MAX: '3', RATE_EYE_MAX: '3' });
  const NAT = '198.51.100.130';
  const cheap = (cookie, ip = NAT) => s.get('/api/feed', { cookie, headers: { 'x-forwarded-for': ip } }).then(async (r) => { await r.text(); return r.status; });
  try {
    const few = await members(s, 'few', 8);
    await check('one account past its own cheap ceiling is refused, wherever it asks from, and spends nobody else\'s', async () => {
      const codes = [];
      for (let i = 0; i < 12; i++) codes.push(await cheap(few[0].cookie));
      assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429, 429, 429, 429, 429, 429]);
      assert.equal(await cheap(few[0].cookie, '192.0.2.210'), 429, 'another address is not a fresh budget for the same account');
      for (let i = 0; i < 5; i++) assert.equal(await cheap(few[1].cookie), 200, 'a neighbour within their own ceiling was refused for the hammering');
    });
    await check('the cheap flood guard counts only what each account let through: past it, the address is refused; the same person elsewhere is not', async () => {
      // few[0] spent five of the twenty, few[1] five: two more at their full ceiling fill it
      for (const m of few.slice(2, 4)) for (let i = 0; i < 5; i++) assert.equal(await cheap(m.cookie), 200);
      assert.equal(await cheap(few[4].cookie), 429, 'the twenty-first request the accounts let through');
      assert.equal(await cheap(few[4].cookie, '192.0.2.211'), 200);
    });
    await check('a cookie that opens nothing is a guest at the cheap ceiling, not a fresh account', async () => {
      const forged = few[5].cookie.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
      const codes = [];
      for (let i = 0; i < 7; i++) codes.push(await cheap(forged, '192.0.2.212'));
      assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
      assert.equal(await cheap(few[5].cookie, '192.0.2.212'), 200, 'the guests\' count is not the person\'s');
    });
    await check('the doors that hash a password are counted by the address, whoever\'s cookie comes with them', async () => {
      // every sign-in runs a scrypt whatever it is asked; counted per account,
      // each account an address holds would bring its own allowance of them
      const DOOR = '192.0.2.215';
      const knock = (cookie, i) => s.post('/api/auth/login', { identifier: `nobody_${i}`, password: 'not-a-password-1' },
        { cookie, headers: { 'x-forwarded-for': DOOR } }).then(async (r) => { await r.text(); return r.status; });
      const codes = [];
      for (let i = 0; i < 8; i++) codes.push(await knock(few[i % 8].cookie, i));
      assert.deepEqual(codes.map((c) => c === 429), [false, false, false, false, false, true, true, true], `${codes}`);
      assert.equal(await knock(null, 99), 429, 'a guest at that address shares the count');
      const elsewhere = await s.post('/api/auth/login', { identifier: 'nobody_x', password: 'not-a-password-1' }, { headers: { 'x-forwarded-for': '192.0.2.216' } });
      await elsewhere.text();
      assert.notEqual(elsewhere.status, 429, 'another address has its own');
      const closing = await s.post('/api/me/delete', { password: 'wrong-password-1' }, { cookie: few[7].cookie, headers: { 'x-forwarded-for': DOOR } });
      await closing.text();
      assert.equal(closing.status, 429, 'closing an account asks for the password too, so it is the same door');
    });
    const step = (cookie, ip = NAT) => s.post('/api/world/walk', { toX: 3, toZ: 4 }, { cookie, headers: { 'x-forwarded-for': ip } }).then(async (r) => { await r.text(); return r.status; });
    const frame = (cookie, ip = NAT) => s.post('/api/remote/eye/screen-0001', { v: 1, t: 0 }, { cookie, headers: { 'x-forwarded-for': ip } }).then(async (r) => { await r.text(); return r.status; });
    for (const [what, ask] of [['steps', step], ['frames', frame]]) {
      await check(`${what}: everyone behind one address at their own ceiling is let through; one past it is refused anywhere; a guest is counted by the address`, async () => {
        // eighteen from the address, three each: the old count refused fifteen
        for (const m of few.slice(0, 6)) for (let i = 0; i < 3; i++) assert.notEqual(await ask(m.cookie), 429, `${what}: a person refused for sharing an address`);
        assert.equal(await ask(few[0].cookie), 429, 'a fourth');
        assert.equal(await ask(few[0].cookie, '192.0.2.213'), 429, 'another address is not a fresh budget for the same account');
        assert.notEqual(await ask(few[6].cookie), 429, 'someone who has asked for nothing yet');
        const guest = [];
        for (let i = 0; i < 5; i++) guest.push(await ask(null, '192.0.2.214'));
        assert.deepEqual(guest.map((c) => c === 429), [false, false, false, true, true], `${guest}`);
      });
    }
  } finally { await s.stop(); }
}

console.log('one /64 is one machine:');

// The same, on a running server: three paid requests a minute from one source.
{
  const s = await boot({ RATE_MAX: '3' });
  const from = (ip) => s.get('/api/brain/none', { headers: { 'x-forwarded-for': ip } }).then((r) => r.status);
  const signupFrom = (ip, i) => s.post('/api/auth/signup', { email: `v6_${i}@example.com`, username: `v6_${i}_x`, password: 'a-long-password-1', age17: true, terms: true },
    { headers: { 'x-forwarded-for': ip } }).then((r) => r.status);
  try {
    await check('addresses in one /64 share one budget, however each is written', async () => {
      for (const ip of ['2600:3c00::1', '2600:3c00::2', '2600:3c00:0:0:5:6:7:8']) assert.notEqual(await from(ip), 429, ip);
      assert.equal(await from('2600:3c00::f03c:91ff:fe12:3456'), 429, 'a fourth address in the /64 was a fresh machine');
    });
    await check('and the next /64 is somebody else', async () => {
      assert.notEqual(await from('2001:db8:1:2::1'), 429);
      assert.notEqual(await from('2001:db8:1:3::1'), 429);
    });
    await check('ten new accounts an hour from a /64, not ten per address in it', async () => {
      for (let i = 0; i < 10; i++) assert.equal(await signupFrom(`2001:db8:5:6::${i + 1}`, i), 200, `signup ${i}`);
      assert.equal(await signupFrom('2001:db8:5:6:ffff::1', 10), 429, 'a new address in the same /64 opened an eleventh');
      assert.equal(await signupFrom('2001:db8:5:7::1', 11), 200, 'the next /64 was shut out with it');
    });
  } finally { await s.stop(); }
}

// One ordinary server for the rest. The vision judge is faked inside it, by a
// module node loads before server.mjs, so no provider is ever called: the fake
// answers for whatever picture reaches it — unsafe when the picture's bytes
// say EXPLICIT — and writes one line per look to judge.log in the data folder.
const JUDGE = `
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
const real = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.anthropic.com/')) return real(url, opts);
  if (u !== 'https://api.anthropic.com/v1/messages') return new Response('{}', { status: 401 });
  const last = JSON.parse(opts.body).messages.at(-1);
  const img = Array.isArray(last.content) ? last.content.find((c) => c.type === 'image') : null;
  const seen = img ? Buffer.from(img.source.data, 'base64').toString('latin1') : '';
  const safe = !!img && !seen.includes('EXPLICIT');
  appendFileSync(join(process.env.DATA_DIR, 'judge.log'), (img ? (safe ? 'safe' : 'unsafe') : 'nothing') + '\\n');
  const text = JSON.stringify({ safe, reason: safe ? '' : 'the test judge says no' });
  return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};`;
// An account from before we asked anyone's age: it signs in, and it has not said yes.
const OLD_SALT = 'f00d';
const seedOldAccount = (data) => writeFileSync(join(data, '.accounts.json'), JSON.stringify([{
  id: 'old-account', email: 'old@example.com', emailLower: 'old@example.com', username: 'oldtimer', usernameLower: 'oldtimer',
  salt: OLD_SALT, hash: scryptSync('an-old-password-1', OLD_SALT, 64).toString('hex'), createdAt: 1,
}]));
{
  const s = await boot({}, { seed: seedOldAccount, node: ['--import', `data:text/javascript;base64,${Buffer.from(JUDGE).toString('base64')}`] });
  try {
    console.log('a post\'s media is judged on what it is, not on what it says it is:');

    const poster = await signup(s, 'poster');
    const pad = Buffer.alloc(32, 0x20);
    const b64 = (...parts) => Buffer.concat([...parts, pad]).toString('base64');
    const safeJpeg = 'data:image/jpeg;base64,' + b64(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('a harbour at dusk'));
    const badJpeg = b64(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('EXPLICIT'));
    const webm = b64(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const mp3 = b64(Buffer.from('ID3'));
    // The key is only the right shape for the judge to be chosen; the fake answers.
    const share = (media) => s.post('/api/posts', { text: '', key: 'sk-ant-fence-not-a-key', media }, { cookie: poster }).then((r) => r.json());
    const looks = () => (existsSync(join(s.data, 'judge.log')) ? readFileSync(join(s.data, 'judge.log'), 'utf8').trim().split('\n') : []);
    const stored = () => (existsSync(join(s.data, '.media.json')) ? Object.keys(JSON.parse(readFileSync(join(s.data, '.media.json'), 'utf8'))).length : 0);

    await check('a picture called a sound is looked at all the same', async () => {
      const r = await share([{ kind: 'audio', data: badJpeg }]);
      assert.equal(r.ok, false, JSON.stringify(r));
      assert.equal(r.blocked, true);
      assert.deepEqual(looks(), ['unsafe']);
    });
    await check('a picture called a video is judged on itself, not on the frame sent with it', async () => {
      const r = await share([{ kind: 'video', data: badJpeg, poster: safeJpeg }]);
      assert.equal(r.ok, false, JSON.stringify(r));
      assert.deepEqual(looks().slice(1), ['safe', 'unsafe'], 'the frame, then the picture itself');
    });
    await check('a video with no frame to judge is refused before anyone is asked', async () => {
      const r = await share([{ kind: 'video', data: webm }]);
      assert.equal(r.ok, false, JSON.stringify(r));
      assert.equal(r.blocked, true);
      assert.equal(looks().length, 3, 'nobody was asked');
    });
    await check('nothing refused is left on the disk', () => {
      assert.equal(stored(), 0);
    });
    await check('a real picture and a real video are judged once each, and shown as what they are', async () => {
      const r = await share([{ kind: 'image', data: safeJpeg }, { kind: 'video', data: webm, poster: safeJpeg }]);
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.deepEqual(r.post.media.map((m) => m.kind), ['image', 'video']);
      assert.deepEqual(looks().slice(3), ['safe', 'safe']);
    });
    await check('sound is posted unjudged, and a voice clip in a webm stays a sound', async () => {
      const r = await share([{ kind: 'audio', data: mp3 }, { kind: 'audio', data: webm }]);
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.deepEqual(r.post.media.map((m) => m.kind), ['audio', 'audio'], 'a player with no picture, never an unjudged video');
      assert.equal(looks().length, 5, 'nobody was asked');
      assert.equal(stored(), 4);
    });

    console.log('the reader\'s borrowed page, served on this origin:');

    const host = await signup(s, 'hostess');
    assert.equal((await s.post('/api/live/hostess/publish', { kind: 'start' }, { cookie: host })).status, 200);
    assert.equal((await s.post('/api/live/hostess/publish', { kind: 'read', page: { url: 'shelf', title: 'shelf', text: '', total: 0 } }, { cookie: host })).status, 200);

    await check('a viewer\'s copy is sandboxed and can send no form, however it is opened', async () => {
      const r = await s.get('/api/fetch/render?live=hostess&url=shelf');
      assert.equal(r.status, 200);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /(^|; )sandbox(;|$)/, csp);
      assert.match(csp, /form-action 'none'/, csp);
    });
    ok('a page fetched from the web carries the same two lines', () => {
      const src = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
      const route = src.slice(src.indexOf("reqPath === '/api/fetch/render'"), src.indexOf('THE MEMORY GRAPH, owner-only'));
      const policies = [...route.matchAll(/'content-security-policy': "([^"]+)"/g)].map((m) => m[1]);
      assert.equal(policies.length, 2, 'the shelf and the fetched page');
      for (const p of policies) { assert.match(p, /(^|; )sandbox(;|$)/, p); assert.match(p, /form-action 'none'/, p); }
    });

    console.log('a live room\'s comments:');

    const listener = await signup(s, 'listener');
    const troll = await signup(s, 'trollish');
    const say = (cookie, text) => s.post('/api/live/hostess/comment', { text }, { cookie });
    const heard = async () => (await s.get('/api/live/hostess/digest', { cookie: host }).then((r) => r.json())).digest.recent.map((c) => c.text);

    await check('a clean word is heard', async () => {
      assert.equal((await say(listener, 'hello from the back')).status, 200);
      assert.ok((await heard()).includes('hello from the back'));
    });
    await check('the filter that guards a reply guards the room', async () => {
      assert.deepEqual(await say(listener, 'cp link in my bio').then((r) => r.json()), { error: 'blocked' });
      assert.ok(!(await heard()).some((t) => /cp link/.test(t)), 'never broadcast, never in the host\'s digest');
    });
    await check('someone the host has blocked is never heard, and never told', async () => {
      assert.equal((await s.post('/api/blocks', { handle: 'trollish', on: true }, { cookie: host })).status, 200);
      const r = await say(troll, 'still here');
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
      assert.ok(!(await heard()).includes('still here'));
    });
    await check('an account that has not said yes cannot speak in a room', async () => {
      const old = cookieOf(await s.post('/api/auth/login', { identifier: 'oldtimer', password: 'an-old-password-1' }));
      assert.ok(old, 'the old account signs in');
      const r = await say(old, 'hello');
      assert.equal(r.status, 403);
      assert.equal((await r.json()).needsTerms, true);
      assert.ok(!(await heard()).includes('hello'));
    });
    // Audit 2026-10-08: five doors that wake a mind, spend, or reach other
    // people were missing from the gate's list, and a bio is published too.
    await check('nor wake its mind, go live, play, use the site\'s voice, or publish a bio', async () => {
      const old = cookieOf(await s.post('/api/auth/login', { identifier: 'oldtimer', password: 'an-old-password-1' }));
      for (const [path, body] of [
        ['/api/speak', { text: 'hello' }],
        ['/api/live/oldtimer/publish', { kind: 'start' }],
        ['/api/live/oldtimer/publish', { kind: 'words', text: 'hello, everyone' }],
        ['/api/match/abcdef12/respond', { accept: true }],
        ['/api/match/abcdef12/think', {}],
        ['/api/voice/tts', { text: 'hello', voiceId: 'v' }],
        ['/api/voice/design', { description: 'a warm low voice, unhurried and kind' }],
        ['/api/code/voice', { text: 'hello' }],
        ['/api/users/oldtimer', { bio: 'hello' }],
      ]) {
        const r = await s.post(path, body, { cookie: old });
        assert.equal(r.status, 403, `${path} ${JSON.stringify(body)}: ${r.status}`);
        assert.equal((await r.json()).needsTerms, true, path);
      }
      // the ways out stay open: deleting your own old post, cancelling a match
      const del = await s.post('/api/users/oldtimer', { delete: 'no-such-post' }, { cookie: old });
      assert.equal(del.status, 200, 'an account that will not agree cannot clear its own posts on the way out');
      const cancel = await s.post('/api/match/abcdef12/cancel', {}, { cookie: old });
      assert.ok(!(cancel.status === 403 && (await cancel.json()).needsTerms), 'cancelling a match is behind the door');
    });
  } finally { await s.stop(); }
}

// --- closing an account, and the doors around it -----------------------------
// QA, 2026-10-08: the founder's Delete account forgot every store and only then
// was refused, so the founder's presence came back empty. And a few typos on a
// shared address used up the hour's signups for everyone behind it.
console.log('closing an account, and the doors around it:');
{
  const s = await boot({ FOUNDER_PASSWORD: 'founder-pw-1234' });
  try {
    await check('the founder\'s account is refused before anything is forgotten', async () => {
      const founder = cookieOf(await s.post('/api/auth/login', { identifier: 'colinbiorio@gmail.com', password: 'founder-pw-1234' }));
      assert.ok(founder, 'the founder signs in');
      const me = await s.get('/api/auth/me', { cookie: founder }).then((r) => r.json());
      assert.equal(me.user.founder, true);
      assert.equal(me.user.hasPassword, true);
      const before = await s.get('/api/me/presence', { cookie: founder }).then((r) => r.json());
      const r = await s.post('/api/me/delete', { password: 'founder-pw-1234' }, { cookie: founder });
      assert.equal(r.status, 400);
      assert.match((await r.json()).error, /Nothing was deleted/);
      const after = await s.get('/api/me/presence', { cookie: founder }).then((r) => r.json());
      assert.deepEqual(after, before, 'the founder\'s presence was forgotten by a refused delete');
    });
    await check('anyone else\'s account closes with its password, and its cookie opens nothing after', async () => {
      const c = await signup(s, 'leaving');
      assert.equal((await s.post('/api/me/delete', { password: 'not-it' }, { cookie: c })).status, 403);
      const r = await s.post('/api/me/delete', { password: 'a-long-password-1' }, { cookie: c });
      assert.equal(r.status, 200);
      assert.equal((await s.get('/api/auth/me', { cookie: c }).then((x) => x.json())).user, null);
    });
    await check('a signup with a mistake in it does not use up the hour\'s signups', async () => {
      const from = { 'x-forwarded-for': '203.0.113.9' };
      for (let i = 0; i < 14; i++) {
        const r = await s.post('/api/auth/signup', { email: `typo${i}@example.com`, username: 'has space', password: 'a-long-password-1', age17: true, terms: true }, { headers: from });
        assert.equal(r.status, 400);
      }
      const ok = await s.post('/api/auth/signup', { email: 'fine@example.com', username: 'fine_one', password: 'a-long-password-1', age17: true, terms: true }, { headers: from });
      assert.equal(ok.status, 200, 'typos shut the door');
      // valid signups still count: ten an hour from one address
      let last = 200;
      for (let i = 0; i < 10 && last === 200; i++) {
        last = (await s.post('/api/auth/signup', { email: `n${i}@example.com`, username: `n_${i}_x`, password: 'a-long-password-1', age17: true, terms: true }, { headers: from })).status;
      }
      assert.equal(last, 429, 'the hourly cap is gone');
    });
    await check('a phone\'s frame, and the desktop\'s answer, fit through the eye\'s door', async () => {
      const c = await signup(s, 'eyeowner');
      const dev = 'desk-0123456789';
      assert.equal((await s.post('/api/remote/here', { deviceId: dev, label: 'the mac' }, { cookie: c })).status, 200);
      const h = () => ({ ok: true, handedness: 'Left', pinch: 0.5, seenAt: 1,
        points: Array.from({ length: 21 }, () => [0.12345678, 0.87654321, 0.01234567]),
        world: Array.from({ length: 21 }, () => [0.12345678, 0.87654321, 0.01234567]) });
      const frame = pack({ hands: [h(), h()], head: { ok: true, x: 0, y: 0, z: 0 } }, 1);
      assert.ok(JSON.stringify(frame).length > 64, 'the frame is real-sized');
      const r = await s.post(`/api/remote/eye/${dev}`, frame, { cookie: c });
      assert.equal(r.status, 200, 'a real frame was refused');
      assert.equal((await r.json()).ok, true);
      const sdp = 'v=0\r\n' + 'a=candidate:1 1 udp 2122260223 192.0.2.1 54321 typ host\r\n'.repeat(40);
      assert.equal((await s.post(`/api/remote/eye/${dev}/say`, { sig: 'answer', sdp }, { cookie: c })).status, 200, 'an SDP answer was refused');
      assert.equal((await s.post(`/api/remote/eye/${dev}`, { pad: 'x'.repeat(40 * 1024) }, { cookie: c })).status, 413, 'the door has no ceiling');
    });
  } finally { await s.stop(); }
}

// --- Google or Apple, arriving at an account someone else opened -------------
// In this process: auth.mjs on a data folder of its own, Google configured with
// a made-up client, and the provider's token endpoint answered by a stand-in
// that hands back whatever identity the next check needs. (Apple is configured
// too only so the boot warning about a Google-only deploy stays quiet.)
console.log('Google or Apple, arriving at an account someone else opened:');
{
  const DIR = mkdtempSync(join(tmpdir(), 'y3k-fence-auth-'));
  process.env.DATA_DIR = DIR;
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'fence-client', GOOGLE_CLIENT_SECRET: 'fence-secret', APPLE_CLIENT_ID: 'x', APPLE_TEAM_ID: 'x', APPLE_KEY_ID: 'x', APPLE_PRIVATE_KEY: 'x' });
  delete process.env.FOUNDER_PASSWORD;
  delete process.env.OAUTH_REDIRECT_BASE;
  // One account linked before linking dropped passwords: it still holds the
  // password someone opened it with, beside its owner's Google identity.
  const LEGACY_SALT = 'beef';
  writeFileSync(join(DIR, '.accounts.json'), JSON.stringify([{
    id: 'legacy-linked', email: 'kai@example.com', emailLower: 'kai@example.com', username: 'kai_squat', usernameLower: 'kai_squat',
    salt: LEGACY_SALT, hash: scryptSync('the-old-squatters-pw', LEGACY_SALT, 64).toString('hex'),
    oauth: { google: 'google-kai' }, createdAt: 1, age17: true, termsAt: 1,
  }]));
  const auth = await import('../auth.mjs');

  let identity = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url) !== 'https://oauth2.googleapis.com/token') return realFetch(url, opts);
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return new Response(JSON.stringify({ id_token: `${enc({ alg: 'none' })}.${enc(identity)}.x` }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  // One request through auth's own router, with just enough of req and res.
  async function route(method, path, { cookie, body } = {}) {
    const out = { status: 0, headers: {}, body: null };
    const req = { method, url: path, headers: { host: 'yearthreethousand.com', ...(cookie ? { cookie } : {}) }, socket: { remoteAddress: '198.51.100.7' } };
    const res = {
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      getHeader: (k) => out.headers[k.toLowerCase()],
      writeHead: (st, h = {}) => { out.status = st; for (const [k, v] of Object.entries(h)) out.headers[k.toLowerCase()] = v; },
      end: () => {},
    };
    const json = (st, o) => { out.status = st; out.body = o; };
    await auth.handleAuthRoute(req, res, path.split('?')[0], { json, readJsonBody: async () => body || {}, secure: false, afterSignup: () => {} });
    return out;
  }
  const sessionOf = (out) => [].concat(out.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => /^orion_session=./.test(c));
  const me = async (cookie) => (await route('GET', '/api/auth/me', { cookie })).body.user;
  const login = (identifier, password) => route('POST', '/api/auth/login', { body: { identifier, password } });
  async function google(claims) {
    const start = await route('GET', '/api/auth/oauth/google/start');
    const at = new URL(start.headers.location);
    identity = { aud: 'fence-client', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600, nonce: at.searchParams.get('nonce'), email_verified: true, ...claims };
    const back = await route('GET', `/api/auth/oauth/google/callback?state=${at.searchParams.get('state')}&code=fence`, { cookie: String(start.headers['set-cookie']).split(';')[0] });
    return { to: back.headers.location, cookie: sessionOf(back) };
  }

  try {
    let sam;
    await check('the password that came first is dropped, and every session it opened with it', async () => {
      const opened = await route('POST', '/api/auth/signup', { body: { email: 'Sam@Example.com', username: 'squatter', password: 'the-squatters-pw', age17: true, terms: true } });
      const squatter = sessionOf(opened);
      assert.equal((await me(squatter)).username, 'squatter');
      await sleep(5); // a later moment than the squatter's cookie, as it always is
      sam = await google({ sub: 'google-sam', email: 'sam@example.com' });
      assert.equal(sam.to, '/');
      assert.equal((await me(sam.cookie)).email, 'Sam@Example.com', 'the account is kept, not orphaned');
      assert.equal(await me(squatter), null, 'the cookie signed before the link opens nothing');
      const again = await login('squatter', 'the-squatters-pw');
      assert.equal(again.status, 409, 'the password no longer opens it');
      assert.match(again.body.error, /signs in with Google/);
    });
    await check('the person who linked stays signed in, and comes back by the same door', async () => {
      const back = await google({ sub: 'google-sam', email: 'sam@example.com' });
      assert.equal((await me(back.cookie)).id, (await me(sam.cookie)).id);
    });
    await check('an account linked before today loses its password the next time its owner comes through Google', async () => {
      const squatter = sessionOf(await login('kai_squat', 'the-old-squatters-pw'));
      assert.equal((await me(squatter)).id, 'legacy-linked', 'the old password still opened it');
      await sleep(5);
      const kai = await google({ sub: 'google-kai', email: 'kai@example.com' });
      assert.equal((await me(kai.cookie)).id, 'legacy-linked');
      assert.equal(await me(squatter), null, 'the password\'s cookie opens nothing now');
      assert.equal((await login('kai_squat', 'the-old-squatters-pw')).status, 409);
      const stored = JSON.parse(readFileSync(join(DIR, '.accounts.json'), 'utf8')).find((a) => a.id === 'legacy-linked');
      assert.ok(!stored.hash && !stored.salt, 'and the record on disk holds no password');
      await sleep(5);
      await google({ sub: 'google-kai', email: 'kai@example.com' });
      assert.ok(await me(kai.cookie), 'it happens once: coming back again cuts off nothing');
    });
    await check('a new address is a new account, and it is asked its age first', async () => {
      const u = await me((await google({ sub: 'google-new', email: 'new@example.com' })).cookie);
      assert.equal(u.email, 'new@example.com');
      assert.equal(u.needsTerms, true);
    });
    await check('an address the provider has not verified links to nothing', async () => {
      const r = await google({ sub: 'google-unverified', email: 'sam@example.com', email_verified: false });
      assert.match(r.to, /auth_error=/);
      assert.equal(r.cookie, undefined);
    });
    await check('typing the founder\'s address at signup makes nobody the founder', async () => {
      const r = await route('POST', '/api/auth/signup', { body: { email: 'colinbiorio@gmail.com', username: 'colin_here', password: 'founder-pw-1234', age17: true, terms: true } });
      assert.equal(r.status, 200);
      assert.equal(r.body.user.founder, false);
    });
    await check('the founder\'s own password, set by the server, survives the founder signing in with Google', async () => {
      // The founder's record is seeded from FOUNDER_PASSWORD; the account just
      // above stands in for it once the server's env says this is its password.
      process.env.FOUNDER_PASSWORD = 'founder-pw-1234';
      try {
        const before = sessionOf(await login('colin_here', 'founder-pw-1234'));
        await sleep(5);
        const g = await google({ sub: 'google-colin', email: 'colinbiorio@gmail.com' });
        assert.equal((await me(g.cookie)).founder, true, 'a verified address is what makes the founder');
        assert.ok(await me(before), 'its sessions are not cut off');
        assert.equal((await login('colin_here', 'founder-pw-1234')).status, 200);
      } finally { delete process.env.FOUNDER_PASSWORD; }
    });
  } finally {
    globalThis.fetch = realFetch;
    rmSync(DIR, { recursive: true, force: true });
  }
}

console.log(`\n${passed} passed`);
