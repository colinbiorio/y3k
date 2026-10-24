// SHIPPED, AND ON THE SCREEN (2026-10-24). Colin: "give yourself the ability to
// push changes to the website and reload lmao -- frictionless is the goal --
// obviously only give that ability to me tho lmao".
//
// The page's half (src/ship.js): what a health answer means, when the founder's
// page reloads itself, that nobody else's does. The machine's half
// (scripts/ship.mjs): what each answer means while waiting for a pushed
// commit, when the wait ends, how the tabs here are reloaded, and that nothing
// of it reaches the site as something anyone could call.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, createVersionWatch, EVERY_MS } from '../src/ship.js';
import { judge, waitLive, reloadTabs, RELOAD_SCRIPTS, fmt, SITE } from '../scripts/ship.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const tick = () => new Promise((r) => setTimeout(r, 0));

console.log('\nthe page (src/ship.js):');

await ok('the first commit heard is the version this page is; the same again is nothing', () => {
  assert.deepEqual(decide(null, { ok: true, commit: 'aaa' }), { known: 'aaa', reload: false });
  assert.deepEqual(decide('aaa', { ok: true, commit: 'aaa' }), { known: 'aaa', reload: false });
});
await ok('a different commit, once one is known, is a reload', () => {
  assert.deepEqual(decide('aaa', { ok: true, commit: 'bbb' }), { known: 'aaa', reload: true });
});
await ok('no answer, a 502, a server that cannot say, or ok:false is never a change', () => {
  for (const h of [null, undefined, {}, { ok: true }, { ok: true, commit: '' }, { ok: false, commit: 'bbb' }, { ok: true, commit: 7 }]) {
    assert.deepEqual(decide('aaa', h), { known: 'aaa', reload: false }, JSON.stringify(h));
    assert.deepEqual(decide(null, h), { known: null, reload: false }, JSON.stringify(h));
  }
});
await ok('the watch learns its version, waits through the deploy, notes the new one and reloads', async () => {
  const answers = [{ ok: true, commit: 'aaa' }, null, { status: 502 }, { ok: true, commit: 'aaa' }, { ok: true, commit: 'bbb' }];
  const fetchFn = async () => { const a = answers.shift(); if (a === null) throw new Error('down'); if (a?.status) return { ok: false }; return { ok: true, json: async () => a }; };
  let reloaded = 0, noted = null;
  const doc = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const w = createVersionWatch({ fetchFn, reload: () => { reloaded += 1; }, note: (c) => { noted = c; }, doc, delay: 0, every: 60_000 });
  assert.equal(await w.tick(), false); assert.equal(w.known, 'aaa');
  assert.equal(await w.tick(), false, 'no answer: the deploy is in flight');
  assert.equal(await w.tick(), false, '502: still in flight');
  assert.equal(await w.tick(), false, 'back on the same version: nothing');
  assert.equal(await w.tick(), true, 'back on another: reload');
  assert.equal(noted, 'aaa', 'the note is given the version this page was');
  await tick(); await tick();
  assert.equal(reloaded, 1);
  assert.equal(await w.tick(), false, 'stopped: it asks no more');
});
await ok('a hidden tab asks nothing', async () => {
  let asked = 0;
  const doc = { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {} };
  const w = createVersionWatch({ fetchFn: async () => { asked += 1; return { ok: true, json: async () => ({ ok: true, commit: 'aaa' }) }; }, doc, reload() {} });
  assert.equal(await w.tick(), false); assert.equal(asked, 0);
  doc.visibilityState = 'visible';
  await w.tick(); assert.equal(asked, 1);
});
await ok('it asks every twenty seconds, not more', () => assert.equal(EVERY_MS, 20_000));
await ok('main.js starts the watch for the founder and for no one else; it is the only caller', () => {
  const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  const line = main.split('\n').find((l) => l.includes('createVersionWatch('));
  assert.ok(line, 'main.js starts the watch');
  assert.match(line, /account\?\.founder/, 'gated on the founder');
  const page = readFileSync(join(ROOT, 'src/ship.js'), 'utf8');
  assert.equal((page.match(/fetchFn\(/g) || []).length, 1, 'one fetch, of /api/health');
  assert.ok(page.includes("'/api/health'"));
});
await ok('the server names the commit it runs, and never a secret', () => {
  const srv = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  assert.match(srv, /commit: COMMIT, since: SINCE/, 'health carries commit and since');
  assert.match(srv, /process\.env\.RENDER_GIT_COMMIT/, 'from Render on a deploy');
  assert.doesNotMatch(srv.slice(srv.indexOf('const COMMIT'), srv.indexOf('const COMMIT') + 600), /PASSWORD|SECRET|KEY/, 'nothing secret near it');
});

console.log('\nthe machine (scripts/ship.mjs):');

await ok('each answer while waiting: down, old, blind, live', () => {
  assert.equal(judge('bbb', null), 'down');
  assert.equal(judge('bbb', { ok: false }), 'down');
  assert.equal(judge('bbb', { ok: true }), 'blind');
  assert.equal(judge('bbb', { ok: true, commit: 'aaa' }), 'old');
  assert.equal(judge('bbb', { ok: true, commit: 'bbb' }), 'live');
});
const fake = (seq) => {
  let i = 0; const log = [];
  const fetchFn = async () => { const a = seq[Math.min(i++, seq.length - 1)]; if (a === null) throw new Error('down'); if (a?.status) return { ok: false }; return { ok: true, json: async () => a }; };
  let t = 0;
  return { fetchFn, log, now: () => t, sleep: async (ms) => { t += ms; }, logFn: (l) => log.push(l) };
};
await ok('the wait ends on the new commit heard twice in a row, with the deploy told as it went', async () => {
  const f = fake([{ ok: true, commit: 'aaa' }, null, { status: 502 }, { ok: true, commit: 'bbb' }, { ok: true, commit: 'bbb' }]);
  const got = await waitLive('bbb', { fetchFn: f.fetchFn, every: 5000, now: f.now, sleep: f.sleep, log: f.logFn });
  assert.deepEqual(got, { ok: true, ms: 20_000, how: 'commit' });
  assert.deepEqual(f.log.map((l) => l.trim().replace(/^\d+:\d\d\s+/, '')), ['up, still the version before', 'no answer: deploying', 'live on the new commit']);
});
await ok('one answer on the new commit followed by a fall is not live yet', async () => {
  const f = fake([{ ok: true, commit: 'bbb' }, null, { ok: true, commit: 'bbb' }, { ok: true, commit: 'bbb' }]);
  const got = await waitLive('bbb', { fetchFn: f.fetchFn, every: 5000, now: f.now, sleep: f.sleep, log: () => {} });
  assert.deepEqual(got, { ok: true, ms: 15_000, how: 'commit' });
});
await ok('a site from before this script, which cannot name its commit, is live once it has gone down and come back', async () => {
  const f = fake([{ ok: true }, null, null, { ok: true }]);
  const got = await waitLive('bbb', { fetchFn: f.fetchFn, every: 5000, now: f.now, sleep: f.sleep, log: () => {} });
  assert.deepEqual(got, { ok: true, ms: 15_000, how: 'blind' });
});
await ok('a wait has an end', async () => {
  const f = fake([{ ok: true, commit: 'aaa' }]);
  const got = await waitLive('bbb', { fetchFn: f.fetchFn, every: 5000, limit: 12_000, now: f.now, sleep: f.sleep, log: () => {} });
  assert.deepEqual(got, { ok: false, ms: 15_000, how: 'old' });
});
await ok('the tabs here: Safari and Chrome asked by name, counted when they answer, nothing off a Mac', () => {
  const asked = [];
  const run = (args) => { asked.push(args[1]); return args[1].includes('Safari') ? { status: 0, stdout: '2\n' } : { status: 1, stdout: '' }; };
  assert.deepEqual(reloadTabs('yearthreethousand.com', run, 'darwin'), [{ app: 'Safari', tabs: 2 }]);
  assert.equal(asked.length, 2);
  assert.ok(asked[0].includes('contains "yearthreethousand.com"'));
  assert.deepEqual(reloadTabs('yearthreethousand.com', run, 'linux'), []);
  assert.match(RELOAD_SCRIPTS('x.com').Safari, /set URL of t to \(URL of t\)/, 'Safari reloads by its own address, no Develop setting');
  assert.match(RELOAD_SCRIPTS('x.com')['Google Chrome'], /reload t/);
});
await ok('times read as minutes and seconds', () => { assert.equal(fmt(0), '0:00'); assert.equal(fmt(130_000), '2:10'); });
await ok('the script reads no .env and adds nothing to the site; it is npm run ship; README says so', () => {
  const src = readFileSync(join(ROOT, 'scripts/ship.mjs'), 'utf8');
  assert.doesNotMatch(src, /load-env|'\.env'|readFile|FOUNDER_PASSWORD|ANTHROPIC/, 'no .env, no file read, no secret');
  assert.ok(SITE.startsWith('https://'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.ship, 'node scripts/ship.mjs');
  assert.ok(pkg.scripts.test.includes('node test/ship.test.mjs'));
  const srv = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  assert.doesNotMatch(srv, /\/api\/ship|\/api\/reload|\/api\/deploy/, 'no endpoint for any of it');
  assert.ok(readFileSync(join(ROOT, 'README.md'), 'utf8').includes('npm run ship'));
});

console.log(`\n${passed} checks passed`);
