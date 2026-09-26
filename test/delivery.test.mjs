// HOW THE SITE'S FILES TRAVEL (delivery.mjs). Run:  node test/delivery.test.mjs
//
// Three promises, each checked here against a running server:
//  - text is compressed (brotli, else gzip) and the bytes decompress to exactly
//    what is on disk; media never is;
//  - every file carries a strong ETag — its content's hash — and a browser
//    holding it gets a 304, whichever encoding it holds;
//  - index.html lists its whole static module graph as <link rel=modulepreload>,
//    every link is a real file, nothing dynamic is in it, and the page's
//    inline-script CSP hash is the file's own (links are not scripts).
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, utimesSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { brotliDecompressSync, gunzipSync, brotliCompressSync } from 'node:zlib';
import {
  negotiate, notModified, staticImports, maskSource, resolveSpecifier, moduleEntries, injectPreloads,
  describe, encoded, cached, settled, etagOf, tagFor,
} from '../delivery.mjs';
import { inlineScriptHashes } from '../security.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('the pieces:');

await ok('brotli where the browser takes it, gzip otherwise, and q=0 means no', () => {
  assert.equal(negotiate('gzip, deflate, br, zstd'), 'br');
  assert.equal(negotiate('gzip, deflate'), 'gzip', 'Chrome over plain http');
  assert.equal(negotiate('br;q=0, gzip;q=0.5'), 'gzip');
  assert.equal(negotiate('gzip;q=0'), null);
  assert.equal(negotiate('identity'), null);
  assert.equal(negotiate(''), null);
  assert.equal(negotiate(undefined), null);
  assert.equal(negotiate('*'), 'br');
});

await ok('a held copy is good by tag first, by clock only when no tag is sent', () => {
  const etag = etagOf(Buffer.from('x'));
  const req = (headers, method = 'GET') => ({ method, headers });
  const t = Date.parse('2026-09-26T10:00:00Z');
  assert.equal(notModified(req({ 'if-none-match': etag }), etag, t), etag);
  assert.equal(notModified(req({ 'if-none-match': `"nope", ${tagFor(etag, 'br')}` }), etag, t), tagFor(etag, 'br'), 'any encoding of the same content');
  assert.equal(notModified(req({ 'if-none-match': 'W/' + tagFor(etag, 'gzip') }), etag, t), tagFor(etag, 'gzip'), 'a proxy\'s W/ is fine');
  assert.equal(notModified(req({ 'if-none-match': tagFor(etag, 'br', true) }), etag, t), tagFor(etag, 'br', true), 'the quick brotli copy too');
  assert.equal(notModified(req({ 'if-none-match': '"other"', 'if-modified-since': new Date(t + 1e6).toUTCString() }), etag, t), null, 'a tag that differs wins over any clock');
  assert.equal(notModified(req({ 'if-modified-since': new Date(t).toUTCString() }), etag, t + 400), etag, 'second resolution');
  assert.equal(notModified(req({ 'if-modified-since': new Date(t - 1000).toUTCString() }), etag, t), null);
  assert.equal(notModified(req({ 'if-none-match': etag }, 'POST'), etag, t), null);
  assert.notEqual(tagFor(etag, 'br'), tagFor(etag, 'gzip'));
  assert.match(etag, /^"[0-9a-f]{32}"$/, 'hex, so no hash can end in -br or -gz itself');
});

await ok('static imports and re-exports, in every form, and nothing else', () => {
  const src = `
import a from './a.js';
import { b,
  c as d } from "./b.js";
import * as e from './e.js'
import f, { g } from '../f.js';
import './side-effect.js';
import{h}from'./h.js';
export * from './star.js';
export * as ns from './ns.js';
export { i } from './i.js';
export { j };
export const k = 1;
// import no from './comment.js';
/* export * from './block.js'; */
const s = "import no from './string.js'";
const t = \`import no from './template.js' \${ x ? { y: \`import no from './nested.js'\` } : 1 } done\`;
const r = /import no from '.\\/regex.js'["'\`]/g;
const q = a / 2; const w = b / 3; // not a regex: import no from './div.js'
const lazy = () => import('./lazy.js');
const meta = import.meta.url;
function important() {} importantThing from './not-import.js';
import three from 'three';
`;
  assert.deepEqual(staticImports(src), ['./a.js', './b.js', './e.js', '../f.js', './side-effect.js', './h.js', './star.js', './ns.js', './i.js', 'three']);
  assert.equal(maskSource(src).length, src.length, 'offsets are kept');
});

await ok('specifiers resolve the way the browser resolves them', () => {
  const imports = { three: '/src/vendor/three/three.min.js', 'three/addons/': '/src/vendor/three/jsm/', '@mediapipe/tasks-vision': 'https://cdn.jsdelivr.net/x.mjs' };
  assert.equal(resolveSpecifier('./b.js', '/src/main.js', imports), '/src/b.js');
  assert.equal(resolveSpecifier('../c.js', '/src/code/a.js', imports), '/src/c.js');
  assert.equal(resolveSpecifier('/src/d.js', '/src/code/a.js', imports), '/src/d.js');
  assert.equal(resolveSpecifier('three', '/src/body.js', imports), '/src/vendor/three/three.min.js');
  assert.equal(resolveSpecifier('three/addons/postprocessing/Pass.js', '/src/body.js', imports), '/src/vendor/three/jsm/postprocessing/Pass.js');
  assert.equal(resolveSpecifier('@mediapipe/tasks-vision', '/src/perceive.js', imports), null, 'another origin');
  assert.equal(resolveSpecifier('https://example.com/x.js', '/src/a.js', imports), null);
  assert.equal(resolveSpecifier('unmapped', '/src/a.js', imports), null);
  assert.deepEqual(moduleEntries('<script src="a.js"></script><script type="module" src="src/main.js"></script><script src="/m.js" type=module></script>'), ['/src/main.js', '/m.js']);
});

await ok('preload links go in the head and move no inline-script hash', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const out = injectPreloads(html, ['/src/main.js', '/src/a&b.js']);
  assert.deepEqual(inlineScriptHashes(out), inlineScriptHashes(html));
  assert.ok(out.indexOf('rel="modulepreload" href="/src/main.js"') < out.indexOf('</head>'));
  assert.ok(out.indexOf('<script type="importmap">') < out.indexOf('rel="modulepreload"'), 'after the importmap, which must come first');
  assert.ok(out.includes('href="/src/a&amp;b.js"'));
  assert.equal(injectPreloads(html, []), html);
});

await ok('a tag follows the content, not the clock', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'y3k-delivery-'));
  const f = join(dir, 'a.js');
  writeFileSync(f, 'export const a = 1;\n');
  const one = await describe(f, statSync(f));
  assert.ok(one.data, 'a miss reads the bytes once and hands them back');
  const again = await describe(f, statSync(f));
  assert.equal(again.etag, one.etag);
  assert.equal(again.data, null, 'a hit reads nothing');
  utimesSync(f, new Date(), new Date(Date.now() + 5000)); // a deploy: new mtime, same bytes
  assert.equal((await describe(f, statSync(f))).etag, one.etag, 'a redeploy of the same bytes keeps its tag');
  writeFileSync(f, 'export const a = 2;\n');
  assert.notEqual((await describe(f, statSync(f))).etag, one.etag);
  rmSync(dir, { recursive: true, force: true });
});

await ok('compressed once, quick first, then brotli at its best swapped in', async () => {
  const data = readFileSync(join(ROOT, 'src', 'body.js'));
  const etag = etagOf(data);
  const [first, twin] = await Promise.all([encoded(data, etag, 'br'), encoded(data, etag, 'br')]);
  assert.equal(first, twin, 'two requests at once share one compression');
  assert.deepEqual(brotliDecompressSync(first.buf), data);
  assert.equal(first.tag, tagFor(etag, 'br', true), 'the quick bytes have their own tag');
  await settled();
  const best = cached(etag, 'br');
  assert.ok(best.buf.length < first.buf.length, `${best.buf.length} < ${first.buf.length}`);
  assert.equal(best.tag, tagFor(etag, 'br'), 'and the best bytes theirs');
  assert.deepEqual(brotliDecompressSync(best.buf), data);
  assert.ok(best.buf.length <= brotliCompressSync(data).length * 1.001, 'as small as quality 11');
  const gz = await encoded(data, etag, 'gzip');
  assert.deepEqual(gunzipSync(gz.buf), data);
  assert.equal(gz.tag, tagFor(etag, 'gzip'));
});

// --- the server -----------------------------------------------------------------
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const DATA = mkdtempSync(join(tmpdir(), 'y3k-delivery-data-'));
const port = await freePort();
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: DATA, FOUNDER_PASSWORD: 'delivery-' + Math.random().toString(36).slice(2), ANTHROPIC_API_KEY: '', RENDER: '' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 120)); }

// Raw bytes as sent (fetch would quietly decompress them).
const raw = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const r = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  r.on('error', reject);
  r.end();
});
const decode = (res) => (res.headers['content-encoding'] === 'br' ? brotliDecompressSync(res.body) : res.headers['content-encoding'] === 'gzip' ? gunzipSync(res.body) : res.body);

try {
  console.log('\nthe wire:');

  const THREE = '/src/vendor/three@0.160.0/build/three.module.min.js';

  await ok('text goes brotli or gzip, and decompresses to exactly the file', async () => {
    for (const path of ['/src/main.js', '/src/tags.mjs', '/styles.css', THREE, '/legal.html']) {
      const disk = readFileSync(join(ROOT, path));
      const br = await raw(path, { 'accept-encoding': 'gzip, deflate, br' });
      assert.equal(br.headers['content-encoding'], 'br', path);
      assert.equal(Number(br.headers['content-length']), br.body.length);
      assert.ok(br.body.length < disk.length / 2.5, `${path}: ${br.body.length} of ${disk.length}`);
      assert.deepEqual(decode(br), disk, path);
      const gz = await raw(path, { 'accept-encoding': 'gzip' });
      assert.equal(gz.headers['content-encoding'], 'gzip', path);
      assert.deepEqual(decode(gz), disk, path);
      const plain = await raw(path);
      assert.equal(plain.headers['content-encoding'], undefined);
      assert.deepEqual(plain.body, disk);
      for (const r of [br, gz, plain]) assert.match(r.headers.vary || '', /Accept-Encoding/i, 'caches keep the encodings apart');
    }
  });

  await ok('a file under a kilobyte goes as it is', async () => {
    const r = await raw('/manifest.webmanifest', { 'accept-encoding': 'br' });
    assert.ok(r.body.length < 1024);
    assert.equal(r.headers['content-encoding'], undefined);
    assert.deepEqual(r.body, readFileSync(join(ROOT, 'manifest.webmanifest')));
  });

  await ok('media is never recompressed', async () => {
    for (const path of ['/icon.png', '/fonts/Supreme-Variable.woff2']) {
      const r = await raw(path, { 'accept-encoding': 'br, gzip' });
      assert.equal(r.status, 200, path);
      assert.equal(r.headers['content-encoding'], undefined, path);
      assert.deepEqual(r.body, readFileSync(join(ROOT, path)));
      assert.match(r.headers.etag, /^"[0-9a-f]{32}"$/);
    }
  });

  await ok('a copy the browser holds is answered with a 304, by tag or by clock', async () => {
    const first = await raw('/src/body.js', { 'accept-encoding': 'br' });
    assert.match(first.headers.etag, /^"[0-9a-f]{32}-br5?"$/);
    for (const inm of [first.headers.etag, 'W/' + first.headers.etag, first.headers.etag.replace(/-br5?"/, '"'), first.headers.etag.replace(/-br5?"/, '-gz"'), `"x", ${first.headers.etag}`]) {
      const r = await raw('/src/body.js', { 'accept-encoding': 'br', 'if-none-match': inm });
      assert.equal(r.status, 304, inm);
      assert.equal(r.body.length, 0);
      assert.equal(r.headers['cache-control'], 'no-cache', 'still revalidated on every load: a refresh is the new code');
    }
    assert.equal((await raw('/src/body.js', { 'if-none-match': '"stale"', 'if-modified-since': new Date(Date.now() + 1e7).toUTCString() })).status, 200, 'a tag that differs wins over the clock');
    assert.equal((await raw('/src/body.js', { 'if-modified-since': first.headers['last-modified'] })).status, 304, 'a browser from before tags still gets its 304');
    const vend = await raw(THREE);
    assert.match(vend.headers['cache-control'], /immutable/);
  });

  await ok('server code is still never served, including the two new modules', async () => {
    for (const p of ['/delivery.mjs', '/code-download.mjs', '/server.mjs', '/.gitignore', '/y3k-code/engine.mjs']) assert.equal((await raw(p)).status, 403, p);
    assert.equal((await raw('/src/')).status, 404, 'a folder is not a file');
  });

  console.log('\nthe page:');

  const page = await raw('/', { 'accept-encoding': 'br' });
  const html = decode(page).toString('utf8');
  const links = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)" \/>/g)].map((m) => m[1]);

  await ok('index.html lists its whole static module graph, once each, in the head', () => {
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-encoding'], 'br');
    assert.ok(links.length >= 40, `${links.length} links`);
    assert.equal(new Set(links).size, links.length, 'no duplicates');
    assert.equal(links[0], '/src/main.js');
    assert.ok(links.includes(THREE), 'three through the importmap');
    assert.ok(links.includes('/src/vendor/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js'), 'three/addons/ through the importmap');
    assert.ok(!links.includes('/src/code/code-view.js'), 'a dynamic import stays lazy');
    assert.ok(html.lastIndexOf('rel="modulepreload"') < html.indexOf('</head>'));
    assert.equal((html.match(/<\/head>/g) || []).length, 1);
  });

  await ok('every link is a real file the server hands out', async () => {
    for (const href of links) {
      assert.ok(existsSync(join(ROOT, href)), href);
      assert.equal((await raw(href, { 'accept-encoding': 'br' })).status, 200, href);
    }
  });

  await ok('the graph is closed: every relative static import of a linked file is linked too', () => {
    const set = new Set(links);
    for (const href of links) {
      const src = readFileSync(join(ROOT, href), 'utf8');
      // independent of delivery.mjs: import/export … from at the start of a line
      for (const m of src.matchAll(/^(?:import|export)\s[^;'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|^import\s*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
        const dep = new URL(m[1] || m[2], 'http://x' + href).pathname;
        assert.ok(set.has(dep), `${href} imports ${dep}`);
      }
    }
  });

  await ok('the page\'s content policy still hashes the file\'s own importmap', () => {
    const disk = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const body = disk.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    assert.ok(page.headers['content-security-policy-report-only'].includes(hash));
    assert.deepEqual(inlineScriptHashes(html), inlineScriptHashes(disk));
  });

  await ok('the page revalidates by its served bytes', async () => {
    assert.match(page.headers.etag, /^"[0-9a-f]{32}-br5?"$/);
    assert.equal((await raw('/', { 'accept-encoding': 'br', 'if-none-match': page.headers.etag })).status, 304);
    assert.equal((await raw('/index.html', { 'accept-encoding': 'br', 'if-none-match': page.headers.etag })).status, 304);
    const plain = await raw('/');
    assert.equal(plain.body.toString('utf8'), html, 'the same page, uncompressed');
    assert.equal(plain.headers['cache-control'], 'no-cache');
  });
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
  rmSync(DATA, { recursive: true, force: true });
}
console.log(`\n${passed} checks passed.`);
process.exit(0);
