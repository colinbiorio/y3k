// THE SITE'S FENCE. Run:  node test/security.test.mjs
//
// The first check guards a hole that was live on any local y3k: a page on
// another port of the same host could POST to /api/brain/stream and the
// founder's session cookie went with it (SameSite=Lax counts every port of a
// host as one site). The rest pin what every response says about framing and
// sniffing, and what the app shell's content policy allows.
//
// Then the fence is walked on a running server: one source flooding the paid
// routes, a post whose media lies about what it is, the reader's borrowed page
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
import { crossSiteRefused, CROSS_SITE_OK, BASE_HEADERS, appShellCsp, inlineScriptHashes, noteCspReport, _test } from '../security.mjs';

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
  assert.match(src, /'content-security-policy-report-only': appShellCsp\(inlineScriptHashes/);
  assert.match(src, /\^y3k-code\(\\\/\|\$\)/, 'the Code engine is never served');
});

// --- on a running server ------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// A server of its own on a fresh data folder, with no founder and no site key.
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

console.log('the paid breaker, one machine against everyone:');

// Tiny budgets: three paid requests a minute from one source, five from
// everyone. X-Forwarded-For stands in for different machines — the limiter
// reads its rightmost entry, the one Render's edge appends.
{
  const s = await boot({ RATE_MAX: '3', RATE_GLOBAL_MAX: '5' });
  const from = (ip, path = '/api/brain/none') => s.get(path, { headers: { 'x-forwarded-for': ip } }).then((r) => r.status);
  try {
    await check('a flood from one machine is stopped by its own ceiling, and spends nobody else\'s', async () => {
      const codes = [];
      for (let i = 0; i < 12; i++) codes.push(await from('203.0.113.1'));
      assert.ok(codes.slice(0, 3).every((c) => c !== 429), `its first three go through: ${codes}`);
      assert.ok(codes.slice(3).every((c) => c === 429), `the rest are refused: ${codes}`);
      assert.notEqual(await from('203.0.113.2'), 429, 'the next person to ask is not refused for it');
    });
    await check('many machines at their full budget still trip the breaker', async () => {
      // counted so far: three from the flood and one from its neighbour
      assert.notEqual(await from('203.0.113.3'), 429, 'the fifth counted request is the last');
      assert.equal(await from('203.0.113.3'), 429, 'under its own ceiling, refused by everyone\'s');
      assert.equal(await from('203.0.113.4'), 429, 'and a machine that has asked for nothing yet');
    });
    await check('while it is tripped, a post\'s replies can still be read', async () => {
      assert.equal(await from('203.0.113.4', '/api/posts/no-such-post/comments'), 200);
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
