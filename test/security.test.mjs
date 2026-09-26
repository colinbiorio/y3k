// THE SITE'S FENCE. Run:  node test/security.test.mjs
//
// The first check guards a hole that was live on any local y3k: a page on
// another port of the same host could POST to /api/brain/stream and the
// founder's session cookie went with it (SameSite=Lax counts every port of a
// host as one site). The rest pin what every response says about framing and
// sniffing, and what the app shell's content policy allows.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crossSiteRefused, CROSS_SITE_OK, BASE_HEADERS, appShellCsp, inlineScriptHashes, noteCspReport, _test } from '../security.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
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

console.log(`\n${passed} passed`);
