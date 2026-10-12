// y3kode, UPDATED FROM THE SITE (y3k-code/update.mjs) — the engine's half.
// Run: node test/update.test.mjs
//
// Colin, 2026-10-08: on "Update needed", a button that asks permission to
// download the newest y3kode. These pin what makes that safe and what makes it
// work: the file is read strictly and only ever comes from the engine's own
// site; nothing is fetched before the person says yes on the computer; the
// host restarts on the new version only after the page has its answer; and a
// real companion, started from an older copy, comes back as the new version on
// the same port with this browser still paired.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, cpSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { untar, install, newer, siteOrigin, restartArgs, newestInstalled, createUpdater, NEEDED } from '../y3k-code/update.mjs';
import { tar, engineTarball } from '../code-download.mjs';
import { describe, title, KINDS } from '../y3k-code/consent.mjs';
import { validateCommand } from '../y3k-code/protocol.mjs';
import { createEngine, VERSION } from '../y3k-code/engine.mjs';
import { createStore } from '../y3k-code/store.mjs';
import { createPairing } from '../y3k-code/pair.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DIR = join(ROOT, 'y3k-code');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const tmp = mkdtempSync(join(tmpdir(), 'y3k-update-'));
const TOKEN = 'dTE.' + 'mabcdef'.slice(0, 7) + '.' + 'A'.repeat(43);
const packed = await engineTarball(ENGINE_DIR);
const files = untar(gunzipSync(packed.buf));

console.log('reading the file:');

await ok('the site\'s own tarball reads back whole: every file it packed, byte for byte', () => {
  assert.deepEqual([...files.keys()].sort(), packed.files.slice().sort());
  for (const f of NEEDED) assert.ok(files.has(f), f);
  assert.equal(files.get('engine.mjs').toString(), readFileSync(join(ENGINE_DIR, 'engine.mjs'), 'utf8'));
});

await ok('anything that is not a plain engine file is refused, not skipped', () => {
  const one = (path, extra = {}) => tar([{ path, data: Buffer.from('x'), mode: 0o644, ...extra }]);
  for (const bad of ['package/../evil.mjs', '/etc/evil.mjs', 'other/evil.mjs', 'package/run.sh', 'package/.hidden.mjs', 'package//x.mjs', 'package/a\\b.mjs', 'package/sub/package.json', 'package/C:x.mjs']) {
    assert.throws(() => untar(one(bad)), /not part of y3kode/, bad);
  }
  // a link (type 2) is refused even with a harmless name
  const link = one('package/engine.mjs');
  link[156] = '2'.charCodeAt(0);
  let sum = 0;
  link.fill(0x20, 148, 156);
  for (let i = 0; i < 512; i++) sum += link[i];
  link.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  assert.throws(() => untar(link), /not part of y3kode/);
  // the same file twice
  const twice = tar([{ path: 'package/a.mjs', data: Buffer.from('1'), mode: 0o644 }, { path: 'package/a.mjs', data: Buffer.from('2'), mode: 0o644 }]);
  assert.throws(() => untar(twice), /not part of y3kode/);
});

await ok('a damaged or cut-short file is refused', () => {
  const good = tar([{ path: 'package/a.mjs', data: Buffer.from('hello'), mode: 0o644 }]);
  const bent = Buffer.from(good); bent[10] ^= 1;
  assert.throws(() => untar(bent), /damaged/);
  assert.throws(() => untar(good.subarray(0, 600)), /incomplete/);
  assert.throws(() => untar(good.subarray(0, 512 + 512)), /incomplete/, 'no end blocks');
});

console.log('\nputting it in place:');

await ok('unpacked into <root>/<version>, bins runnable, older versions cleared, the running one kept', () => {
  const root = join(tmp, 'versions-a');
  mkdirSync(join(root, '0.1.0'), { recursive: true });
  mkdirSync(join(root, '0.2.0'), { recursive: true });
  mkdirSync(join(root, '.incoming-0.2.5-dead'), { recursive: true });
  const v = JSON.parse(files.get('package.json')).version;
  const dir = install(files, { root, version: v, keep: '0.2.0' });
  assert.equal(dir, join(root, v));
  for (const f of NEEDED) assert.ok(existsSync(join(dir, f)), f);
  if (process.platform !== 'win32') assert.equal(statSync(join(dir, 'bin', 'y3k-code.mjs')).mode & 0o777, 0o755);
  assert.deepEqual(readdirSync(root).sort(), ['0.2.0', v].sort(), 'older than the running one, and half-written ones, are gone');
});

await ok('a file that is not y3kode at the version asked about is not put anywhere', () => {
  const root = join(tmp, 'versions-b');
  assert.throws(() => install(files, { root, version: '9.9.9', keep: VERSION }), /not y3kode 9\.9\.9/);
  const noHost = new Map(files); noHost.delete('ipc-host.mjs');
  const v = JSON.parse(files.get('package.json')).version;
  assert.throws(() => install(noHost, { root, version: v, keep: VERSION }), /missing ipc-host\.mjs/);
  assert.ok(!existsSync(join(root, v)));
});

await ok('the newest complete version is found; an incomplete one is not', () => {
  const root = join(tmp, 'versions-c');
  const v = JSON.parse(files.get('package.json')).version;
  install(files, { root, version: v, keep: '0.0.1' });
  mkdirSync(join(root, '99.0.0'), { recursive: true });   // nothing in it
  assert.deepEqual(newestInstalled(root, '0.0.1'), { version: v, dir: join(root, v) });
  assert.equal(newestInstalled(root, v), null, 'nothing newer than itself');
  assert.equal(newestInstalled(join(tmp, 'nowhere'), '0.0.1'), null);
});

await ok('versions compare as numbers; the site is https, or http on this computer', () => {
  assert.ok(newer('0.10.0', '0.9.9') && newer('1.0.0', '0.99.99') && !newer('0.3.0', '0.3.0') && !newer('0.2.9', '0.3.0'));
  assert.equal(siteOrigin('https://yearthreethousand.com/x'), 'https://yearthreethousand.com');
  assert.equal(siteOrigin('http://localhost:5173'), 'http://localhost:5173');
  for (const bad of ['http://yearthreethousand.com', 'file:///etc', 'javascript:1', '', null]) assert.equal(siteOrigin(bad), null, String(bad));
});

await ok('the companion\'s next version gets the same flags, its port, no tab and no pairing code', () => {
  assert.deepEqual(restartArgs(['--pair', 'ABCD1234', '--dev', '--origin', 'http://localhost:1', '--port', '47821'], 47822),
    ['--dev', '--origin', 'http://localhost:1', '--port', '47822', '--no-open']);
  assert.deepEqual(restartArgs(['start', '--no-open'], 47821), ['start', '--port', '47821', '--no-open']);
});

console.log('\nasking first, then fetching:');

function updater(over = {}) {
  const log = { asked: [], fetched: [], restarts: [], later: [] };
  const u = createUpdater({
    site: 'https://yearthreethousand.com', root: join(tmp, 'versions-u-' + Math.random().toString(36).slice(2)), current: '0.2.9',
    ask: async (kind, d) => { log.asked.push([kind, d]); return over.allow ?? true; },
    fetchFn: async (url, o) => { log.fetched.push([url, o]); return over.res || { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => packed.buf }; },
    restart: (x) => log.restarts.push(x), later: (f) => log.later.push(f), ...over.opts,
  });
  return { u, log };
}
const v = JSON.parse(files.get('package.json')).version;

await ok('a host that cannot restart says so; a bad version or token is refused before anything is asked', async () => {
  const none = createUpdater({ site: null, root: null, current: '0.2.9', ask: async () => true });
  assert.equal(none.able, false);
  assert.equal((await none.run({ token: TOKEN, version: v })).code, 'unsupported');
  const { u, log } = updater();
  for (const args of [{ token: TOKEN, version: '1.0' }, { token: TOKEN, version: '1.0.0-beta' }, { token: 'x/../y', version: v }, { token: TOKEN + '/../../x', version: v }]) {
    assert.equal((await u.run(args)).code, 'invalid', JSON.stringify(args));
  }
  assert.equal(log.asked.length + log.fetched.length, 0);
});

await ok('the same or an older version: nothing to do, nothing asked', async () => {
  const { u, log } = updater();
  assert.deepEqual(await u.run({ token: TOKEN, version: '0.2.9' }), { ok: true, current: true, version: '0.2.9' });
  assert.equal((await u.run({ token: TOKEN, version: '0.1.0' })).current, true);
  assert.equal(log.asked.length + log.fetched.length, 0);
});

await ok('a no on the computer: nothing is downloaded', async () => {
  const { u, log } = updater({ allow: false });
  const r = await u.run({ token: TOKEN, version: v });
  assert.equal(r.code, 'declined');
  assert.deepEqual(log.asked, [['engine.update', { from: '0.2.9', to: v, site: 'yearthreethousand.com' }]]);
  assert.equal(log.fetched.length, 0);
});

await ok('a yes: fetched from the engine\'s own site with the token, unpacked, and the restart waits for the answer', async () => {
  const { u, log } = updater();
  const r = await u.run({ token: TOKEN, version: v });
  assert.deepEqual(r, { ok: true, restarting: true, version: v });
  assert.equal(log.fetched[0][0], `https://yearthreethousand.com/code/dl/${TOKEN}/y3k-code.tgz`);
  assert.equal(log.fetched[0][1].redirect, 'error', 'never followed somewhere else');
  assert.equal(log.restarts.length, 0, 'not before the page has its answer');
  log.later[0]();
  assert.equal(log.restarts.length, 1);
  assert.equal(log.restarts[0].version, v);
  assert.ok(existsSync(join(log.restarts[0].dir, 'ipc-host.mjs')));
  // a second click while it restarts: the same answer, not a second question
  assert.deepEqual(await u.run({ token: TOKEN, version: v }), { ok: true, restarting: true, version: v });
  assert.equal(log.asked.length, 1);
});

await ok('a download that fails or is not what was asked for: said plainly, and no restart', async () => {
  const gone = updater({ res: { ok: false, status: 410, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) } });
  assert.match((await gone.u.run({ token: TOKEN, version: v })).error, /link expired/);
  const other = updater();
  assert.match((await other.u.run({ token: TOKEN, version: '9.9.9' })).error, /not y3kode 9\.9\.9/);
  const junk = updater({ res: { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => gzipSync(Buffer.from('not a tar')) } });
  assert.equal((await junk.u.run({ token: TOKEN, version: v })).code, 'failed');
  for (const x of [gone, other, junk]) assert.equal(x.log.later.length + x.log.restarts.length, 0);
});

await ok('the question on the computer says which versions, from where, and that sessions stop', () => {
  assert.ok(KINDS.includes('engine.update'));
  assert.equal(title('engine.update'), 'Update y3kode?');
  const text = describe('engine.update', { from: '0.2.0', to: '0.3.0', site: 'yearthreethousand.com' });
  assert.equal(text.split('\n')[0], 'Update y3kode from 0.2.0 to 0.3.0?');
  assert.match(text, /downloaded from yearthreethousand\.com/);
  assert.match(text, /Coding sessions running now will stop\./);
});

await ok('the command takes a token and a version and nothing else; hello says whether it can update', async () => {
  assert.equal(validateCommand({ cmd: 'engine.update', token: TOKEN, version: '0.3.0' }).ok, true);
  assert.equal(validateCommand({ cmd: 'engine.update', token: TOKEN, version: '0.3.0', url: 'https://evil.example' }).ok, false);
  assert.equal(validateCommand({ cmd: 'engine.update', version: '0.3.0' }).ok, false);
  const store = createStore(join(tmp, 'store-hello'));
  const plain = createEngine({ store, consent: async () => false });
  assert.equal(plain.hello().update, false);
  assert.equal((await plain.handle({ cmd: 'engine.update', token: TOKEN, version: '99.0.0' })).code, 'unsupported');
  plain.shutdown();
  const able = createEngine({ store, consent: async () => false, update: { site: 'https://yearthreethousand.com', root: join(tmp, 'v-e'), restart: () => {} } });
  assert.equal(able.hello().update, true);
  assert.equal((await able.handle({ cmd: 'engine.update', token: TOKEN, version: '99.0.0' })).code, 'declined', 'asked through the engine\'s own consent');
  able.shutdown();
});

console.log('\na real companion, from an older copy:');

// An older y3kode: this one, calling itself 0.2.9. The site: a server that
// hands out the real tarball for one token, the way server.mjs does.
const old = join(tmp, 'old', 'y3k-code');
cpSync(ENGINE_DIR, old, { recursive: true, filter: (p) => !p.includes('node_modules') });
writeFileSync(join(old, 'package.json'), readFileSync(join(old, 'package.json'), 'utf8').replace(/"version": "[^"]+"/, '"version": "0.2.9"'));
writeFileSync(join(old, 'engine.mjs'), readFileSync(join(old, 'engine.mjs'), 'utf8').replace(/export const VERSION = '[^']+'/, "export const VERSION = '0.2.9'"));
const free = () => new Promise((res) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const downloads = [];
const site = createServer((req, res) => {
  downloads.push(req.url);
  if (req.url === `/code/dl/${TOKEN}/y3k-code.tgz`) { res.writeHead(200, { 'content-type': 'application/gzip', 'content-length': packed.buf.length }); return res.end(packed.buf); }
  res.writeHead(404); res.end();
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${site.address().port}`;
const home = join(tmp, 'companion-home');
const store = createStore(home);
const bearer = createPairing({ load: store.tokens, save: store.setTokens }).mint({ origin: SITE, agent: 'test' });
const port = await free();
const kids = [];
const startOld = () => {
  const c = spawn(process.execPath, [join(old, 'bin', 'y3k-code.mjs'), '--dev', '--origin', SITE, '--site', SITE, '--port', String(port), '--no-open'],
    { env: { ...process.env, Y3K_CODE_HOME: home, Y3K_CODE_HANDED_OVER: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  c.out = '';
  c.stdout.on('data', (d) => { c.out += d; });
  c.stderr.on('data', (d) => { c.out += d; });
  kids.push(c);
  return c;
};
const cmd = async (body) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/cmd`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
    return r.status === 401 ? { ok: false, code: 'unpaired' } : await r.json();
  } catch { return { ok: false, code: 'offline' }; }
};
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await new Promise((r) => setTimeout(r, 100)); } };
// The person's yes, in the approval window: the form's id and nonce, posted from that window's own origin.
async function allowOnComputer() {
  const page = await until(async () => { try { const t = await (await fetch(`http://127.0.0.1:${port}/approve`)).text(); return /name="nonce"/.test(t) && t; } catch { return null; } });
  assert.ok(page, 'the question reached the approval window');
  assert.match(page, /Update y3kode from 0\.2\.9 to /);
  const id = /action="\/approve\/([A-Za-z0-9]+)"/.exec(page)[1];
  const nonce = /name="nonce" value="([^"]+)"/.exec(page)[1];
  const r = await fetch(`http://127.0.0.1:${port}/approve/${id}`, { method: 'POST', redirect: 'manual', headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/x-www-form-urlencoded' }, body: `answer=allow&nonce=${encodeURIComponent(nonce)}` });
  assert.equal(r.status, 303);
}

try {
  const first = startOld();
  const h0 = await until(async () => { const h = await cmd({ cmd: 'engine.hello' }); return h.ok && h; });
  assert.ok(h0, 'the old companion answers: ' + first.out);

  await ok('the old companion says it can update itself, and asks before it downloads', async () => {
    assert.equal(h0.version, '0.2.9');
    assert.equal(h0.update, true);
    const asking = cmd({ cmd: 'engine.update', token: TOKEN, version: v });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(downloads.length, 0, 'nothing fetched while the question is open');
    await allowOnComputer();
    assert.deepEqual(await asking, { ok: true, restarting: true, version: v });
    assert.deepEqual(downloads, [`/code/dl/${TOKEN}/y3k-code.tgz`]);
  });

  await ok('it comes back as the new version, on the same port, with this browser still paired', async () => {
    const h = await until(async () => { const x = await cmd({ cmd: 'engine.hello' }); return x.ok && x.version === v && x; }, 20000);
    assert.ok(h, 'back at ' + v + ': ' + first.out);
    assert.ok(existsSync(join(home, 'engine', v, 'ipc-host.mjs')));
    assert.match(first.out, new RegExp(`Updating to y3kode ${v.replace(/\./g, '\\.')}\\. Restarting`));
    assert.equal(first.exitCode, null, 'the first process waits for the new one, in the same terminal');
  });

  await ok('stopping it stops both', async () => {
    first.kill('SIGTERM');
    const code = await until(() => first.exitCode !== null || first.signalCode !== null, 10000);
    assert.ok(code, 'the first process is gone');
    assert.ok(await until(async () => (await cmd({ cmd: 'engine.hello' })).code === 'offline', 10000), 'and the new one with it');
  });

  await ok('the old command, run again, starts the newer version it already fetched', async () => {
    const again = startOld();
    const h = await until(async () => { const x = await cmd({ cmd: 'engine.hello' }); return x.ok && x; });
    assert.equal(h?.version, v, again.out);
    assert.equal(downloads.length, 1, 'nothing fetched again');
    again.kill('SIGTERM');
    await until(() => again.exitCode !== null || again.signalCode !== null, 10000);
  });
} finally {
  for (const k of kids) { try { k.kill('SIGKILL'); } catch { /* gone */ } }
  site.close();
}

console.log(`\n${passed} checks passed.`);
process.exit(0);
