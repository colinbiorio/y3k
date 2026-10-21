// THE SERVER, HARDENED. Run:  node test/harden.test.mjs
//
// The read proxy connects only to an address it judged: a name that answers
// public when asked first and loopback when asked again cannot steer it inside
// (DNS rebinding), because the connection itself asks, once, and is handed only
// what passed. Each hop of a redirect is asked the same way, an address written
// into the URL is judged as written, and TLS and the Host header still name the
// host.
import assert from 'node:assert';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import dc from 'node:diagnostics_channel';
import { _test as proxy } from '../fetchproxy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const check = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// A server of the test's own on loopback, counting who reached it.
async function serve(handler) {
  const s = { hits: 0 };
  const srv = createServer((req, res) => { s.hits += 1; handler(req, res); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  s.port = srv.address().port;
  s.close = () => new Promise((r) => srv.close(r));
  return s;
}
// Every address the process tries to connect to, while `fn` runs.
async function attemptsDuring(fn) {
  const seen = [];
  const watch = ({ socket }) => socket.on('connectionAttempt', (ip) => seen.push(ip));
  dc.subscribe('net.client.socket', watch);
  try { return { out: await fn(), seen }; } finally { dc.unsubscribe('net.client.socket', watch); }
}
const answer = (...addrs) => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
const read = (url, opts) => proxy.fetchPage(url, opts).catch((e) => ({ error: e.message }));

console.log('the read proxy connects only where it checked:');

const trap = await serve((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>inside</title>the inside of the house'); });
try {
  await check('a name that answers public first and loopback after is never followed inside: it is asked once, and only the public answer is tried', async () => {
    let asked = 0;
    const rebinding = { ...proxy.GUARD, resolve: (host, cb) => { asked += 1; cb(null, asked === 1 ? answer('203.0.113.7') : answer('127.0.0.1')); } };
    // 203.0.113.0/24 is the documentation block: public to the guard, and
    // nobody's, so the one attempt goes nowhere and is cut off by the timer
    const { out, seen } = await attemptsDuring(() => read(`http://rebind.example:${trap.port}/`, { guard: rebinding, timeoutMs: 800 }));
    assert.ok(out.error, `it read something: ${JSON.stringify(out).slice(0, 120)}`);
    assert.equal(trap.hits, 0, 'the second answer was used: the inside was reached');
    assert.equal(asked, 1, 'the name was resolved twice, and the second answer could differ from the one checked');
    assert.deepEqual([...new Set(seen)], ['203.0.113.7'], `connected to what was not checked: ${seen}`);
  });

  await check('an answer with any private address in it is refused whole, before anything connects', async () => {
    for (const addrs of [answer('127.0.0.1'), answer('203.0.113.7', '127.0.0.1'), answer('2001:db8::1', '::ffff:169.254.169.254'), answer('169.254.169.254'), answer('fd00:ec2::254')]) {
      const guard = { ...proxy.GUARD, resolve: (host, cb) => cb(null, addrs) };
      const { out, seen } = await attemptsDuring(() => read(`http://mixed.example:${trap.port}/`, { guard }));
      assert.equal(out.error, 'address is not public', JSON.stringify(addrs));
      assert.deepEqual(seen, [], `a connection was attempted for ${JSON.stringify(addrs)}`);
    }
    assert.equal(trap.hits, 0);
  });

  await check('an address written into the URL is judged as written, in every spelling, without asking the resolver', async () => {
    let asked = 0;
    const guard = { ...proxy.GUARD, resolve: (host, cb) => { asked += 1; cb(null, answer('203.0.113.7')); } };
    for (const host of ['127.0.0.1', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '0x7f.1', '2130706433', '0', '169.254.169.254', '[fd00:ec2::254]', '[64:ff9b::7f00:1]', '192.0.0.192', '198.18.0.1']) {
      const { out, seen } = await attemptsDuring(() => read(`http://${host}:${trap.port}/`, { guard }));
      assert.equal(out.error, 'address is not public', host);
      assert.deepEqual(seen, [], `${host} was connected to`);
    }
    assert.equal(asked, 0);
    assert.equal(trap.hits, 0);
  });

  ok('the ranges: loopback, private, link-local, metadata, and every IPv6 dressing of them', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.100.100.200', '0.0.0.0',
      '192.0.0.192', '198.18.0.1', '198.19.255.255', '224.0.0.1', '255.255.255.255', '::', '::1', 'fd00:ec2::254', 'fc00::1', 'fe80::1', 'ff02::1',
      '::ffff:10.0.0.1', '::ffff:a00:1', '::10.0.0.1', '64:ff9b::a9fe:a9fe', '64:ff9b::169.254.169.254', '64:ff9b:1::a9fe:a9fe']) {
      assert.equal(proxy.isPrivateAddr(a), true, a);
    }
    for (const a of ['203.0.113.7', '93.184.215.14', '1.1.1.1', '172.32.0.1', '192.0.1.1', '198.20.0.1', '2606:4700::1111', '64:ff9b::1.1.1.1']) {
      assert.equal(proxy.isPrivateAddr(a), false, a);
    }
  });

  ok('the lookup a connection makes answers as dns.lookup does, with and without `all`, and refuses as it should', () => {
    const got = [];
    const lookup = proxy.checkedLookup({ resolve: (h, cb) => cb(null, answer('2001:db8::1', '203.0.113.7')), isPrivate: proxy.isPrivateAddr });
    lookup('x.example', { all: true }, (err, list) => got.push([err, list]));
    lookup('x.example', {}, (err, a, f) => got.push([err, a, f]));
    lookup('x.example', { family: 4 }, (err, a, f) => got.push([err, a, f]));
    lookup('x.example', (err, a, f) => got.push([err, a, f]));
    assert.deepEqual(got, [
      [null, answer('2001:db8::1', '203.0.113.7')],
      [null, '2001:db8::1', 6],
      [null, '203.0.113.7', 4],
      [null, '2001:db8::1', 6],
    ]);
    const failed = [];
    proxy.checkedLookup({ resolve: (h, cb) => cb(new Error('ENOTFOUND')), isPrivate: proxy.isPrivateAddr })('x', {}, (e) => failed.push(e.message));
    proxy.checkedLookup({ resolve: (h, cb) => cb(null, []), isPrivate: proxy.isPrivateAddr })('x', {}, (e) => failed.push(e.message));
    proxy.checkedLookup({ resolve: (h, cb) => cb(null, answer('203.0.113.7', '10.0.0.1')), isPrivate: proxy.isPrivateAddr })('x', { all: true }, (e) => failed.push(e.message));
    assert.deepEqual(failed, ['could not resolve host', 'could not resolve host', 'address is not public']);
  });

  // The rest reach a page of the test's own, so their guard lets exactly that
  // one address through, and judges every other the real way.
  const names = { 'reader.example': '127.0.0.1', 'metadata.example': '169.254.169.254', 'inside.example': '10.0.0.5' };
  const local = {
    resolve: (host, cb) => cb(null, names[host] ? answer(names[host]) : []),
    isPrivate: (a, f) => a !== '127.0.0.1' && proxy.isPrivateAddr(a, f),
  };
  const PAGE = '<html><head><title>A page</title></head><body><p>First <b>words</b>.</p><a href="/next">Next part</a></body></html>';
  const site = await serve((req, res) => {
    const u = req.url;
    if (u === '/gz') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); return res.end(gzipSync(PAGE)); }
    if (u === '/br') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'br' }); return res.end(brotliCompressSync(PAGE)); }
    if (u === '/odd') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'zstd' }); return res.end('(\xb5/\xfd'); }
    if (u.startsWith('/hop/')) { const n = Number(u.slice(5)); res.writeHead(302, { location: n > 0 ? `/hop/${n - 1}` : '/' }); return res.end(); }
    if (u === '/to-metadata') { res.writeHead(301, { location: 'http://metadata.example/latest/meta-data/' }); return res.end(); }
    if (u === '/to-inside') { res.writeHead(307, { location: `http://inside.example:${trap.port}/` }); return res.end(); }
    // written-in addresses the test's guard does not wave through (it lets
    // 127.0.0.1 itself through, to reach this page)
    if (u === '/to-literal') { res.writeHead(302, { location: `http://10.0.0.5:${trap.port}/` }); return res.end(); }
    if (u === '/to-v6-literal') { res.writeHead(302, { location: `http://[::1]:${trap.port}/` }); return res.end(); }
    if (u === '/picture') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end('png'); }
    if (u === '/missing') { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('no'); }
    if (u === '/huge') { res.writeHead(200, { 'content-type': 'text/plain' }); const mb = Buffer.alloc(1024 * 1024, 'a'); res.write(mb); res.write(mb); res.write(mb); return res.end(mb); }
    if (u === '/slow') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<p>a start'); return; }   // never ends
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE.replace('</body>', `<p>host=${req.headers.host} ae=${req.headers['accept-encoding']} ua=${req.headers['user-agent']}</p></body>`));
  });
  const at = (path) => `http://reader.example:${site.port}${path}`;
  try {
    await check('an ordinary page reads as before, sent with the name as its Host', async () => {
      const r = await read(at('/'), { guard: local });
      assert.equal(r.url, at('/'));
      const page = proxy.extractReadable(r.html, r.url);
      assert.equal(page.title, 'A page');
      assert.match(page.text, /First words/);
      assert.match(page.text, new RegExp(`host=reader\\.example:${site.port} ae=gzip, br ua=orion-reader/1\\.0`));
      assert.deepEqual(page.links, [{ url: `http://reader.example:${site.port}/next`, label: 'Next part' }]);
    });
    await check('gzip and brotli are opened, as fetch() opened them; an encoding it cannot open is not passed on as text', async () => {
      for (const p of ['/gz', '/br']) assert.equal(proxy.extractReadable((await read(at(p), { guard: local })).html, at(p)).title, 'A page', p);
      assert.equal((await read(at('/odd'), { guard: local })).error, 'not a text page');
    });
    await check('redirects are followed, four at most, and each hop is judged by the connection that makes it', async () => {
      const r = await read(at('/hop/3'), { guard: local });
      assert.equal(r.url, at('/'));
      assert.equal((await read(at('/hop/4'), { guard: local })).error, 'too many redirects');
      const { out, seen } = await attemptsDuring(() => read(at('/to-metadata'), { guard: local }));
      assert.equal(out.error, 'address is not public');
      assert.deepEqual(seen, ['127.0.0.1'], 'the metadata hop was connected to');
      for (const p of ['/to-inside', '/to-literal', '/to-v6-literal']) assert.equal((await read(at(p), { guard: local })).error, 'address is not public', p);
      assert.equal(trap.hits, 0, 'a redirect reached the inside');
    });
    await check('text only, a 2xx only, 2MB at most, and a page that never finishes is let go', async () => {
      assert.equal((await read(at('/picture'), { guard: local })).error, 'not a text page');
      assert.equal((await read(at('/missing'), { guard: local })).error, 'the page answered 404');
      const huge = await read(at('/huge'), { guard: local });
      assert.ok(huge.html.length >= 2 * 1024 * 1024 && huge.html.length <= 3 * 1024 * 1024, `kept ${huge.html.length} bytes of a 4MB page`);
      const t = Date.now();
      assert.equal((await read(at('/slow'), { guard: local, timeoutMs: 600 })).error, 'the page took too long to answer');
      assert.ok(Date.now() - t < 5000);
    });
    await check('the exported readers take no guard: loopback and the metadata address are refused through them', async () => {
      const { fetchReadable, fetchRenderable } = await import('../fetchproxy.mjs');
      for (const u of [`http://127.0.0.1:${trap.port}/`, 'http://169.254.169.254/latest/meta-data/', `http://localhost:${trap.port}/`]) {
        assert.ok((await fetchReadable(u)).error, u);
        assert.ok((await fetchRenderable(u)).error, u);
      }
      assert.equal(trap.hits, 0);
    });
  } finally { await site.close(); }

  // TLS still names the host. A certificate made here for reader.example, and
  // trusted only by a child process (NODE_EXTRA_CA_CERTS): the proxy there
  // reaches it on loopback by that name, and a certificate for another name
  // is refused. Skipped where there is no openssl to make one.
  const dir = mkdtempSync(join(tmpdir(), 'y3k-harden-tls-'));
  try {
    const made = (name) => spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${name}`,
      '-addext', `subjectAltName=DNS:${name}`, '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.pem`)], { stdio: 'ignore' }).status === 0;
    if (!made('reader.example')) {
      console.log('  - (no openssl here: the TLS check is skipped)');
    } else {
      await check('over TLS the certificate is checked against the name, and the name is what SNI and Host say', async () => {
        const seen = {};
        const tls = createTlsServer({
          key: readFileSync(join(dir, 'reader.example.key')), cert: readFileSync(join(dir, 'reader.example.pem')),
        }, (req, res) => { seen.sni = req.socket.servername; seen.host = req.headers.host; res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>secure</title>over tls'); });
        await new Promise((r) => tls.listen(0, '127.0.0.1', r));
        const port = tls.address().port;
        const child = (host) => new Promise((resolve) => {
          const code = `
            const { _test: p } = await import(${JSON.stringify(pathToFileURL(join(ROOT, 'fetchproxy.mjs')).href)});
            const guard = { resolve: (h, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]), isPrivate: (a, f) => a !== '127.0.0.1' && p.isPrivateAddr(a, f) };
            const r = await p.fetchPage('https://${host}:${port}/', { guard }).catch((e) => ({ error: e.message, code: e.code }));
            process.stdout.write(JSON.stringify(r));`;
          const c = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'reader.example.pem') } });
          let out = '';
          c.stdout.on('data', (d) => { out += d; });
          c.on('close', () => resolve(JSON.parse(out || '{}')));
        });
        try {
          const good = await child('reader.example');
          assert.match(good.html || '', /over tls/, JSON.stringify(good));
          assert.equal(seen.sni, 'reader.example', 'SNI was not the name');
          assert.equal(seen.host, `reader.example:${port}`, 'the Host header was not the name');
          // the same address under a name the certificate does not carry
          const wrong = await child('other.example');
          assert.ok(wrong.error && /altnames|certificate|hostname/i.test(wrong.error + wrong.code), `a certificate for another name was accepted: ${JSON.stringify(wrong)}`);
        } finally { await new Promise((r) => tls.close(r)); }
      });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
} finally { await trap.close(); }

console.log(`\n${passed} passed`);
