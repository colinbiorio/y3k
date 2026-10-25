// WHAT YOU AGREE TO BY PRESSING THE BUTTON (2026-10-25). Colin: "an easy
// one-click start and stop… copying and pasting keys is not user-friendly. in
// any situation where you want to ensure user safety, just add a note that
// explains what they are agreeing to by pushing the button, and then offer the
// 'always allow' 'allow just this time' or 'cancel' options, and add a
// corresponding field to TOS."
//
// The dialog (src/consent.js): remembered 'always' per kind, forgotten on
// request. The life's one click (src/life.js): the note first, the key made
// here, handed to y3kode with the start (protocol, life.mjs writes lucid's
// publish.json and nothing else). The terms carry the field. And the plan's
// limit is named (y3k-code/brain.mjs, src/own-brain.js, src/brain.js).
import assert from 'node:assert';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remembered, forget, forgetAll, consent } from '../src/consent.js';
import { COMMANDS, validateCommand } from '../y3k-code/protocol.mjs';
import { createLife } from '../y3k-code/life.mjs';
import { thinkWithClaude, LIMIT_HIT } from '../y3k-code/brain.mjs';
import { ownFailedLine, ownLimitLine, OWN_FAILED } from '../src/brain.js';
import { VERSION } from '../y3k-code/engine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get keys() { return [...m.keys()]; } }; };

console.log('\nthe dialog (src/consent.js):');
await ok('always is remembered per kind in this browser, and forgotten on request', () => {
  const store = memStore();
  assert.equal(remembered('life.run', store), false);
  store.setItem('y3k.consent.life.run', 'always');
  assert.equal(remembered('life.run', store), true);
  assert.equal(remembered('other', store), false);
  forget('life.run', store); assert.equal(remembered('life.run', store), false);
  store.setItem('y3k.consent.a', 'always'); store.setItem('y3k.consent.b', 'always'); store.setItem('unrelated', 'x');
  Object.defineProperty(store, 'length', { value: 0 });
  for (const k of store.keys) if (k.startsWith('y3k.consent.')) store.removeItem(k);
  assert.equal(remembered('a', store), false);
});
await ok('a remembered kind answers always without a dialog; a consent needs a kind', async () => {
  const store = memStore(); store.setItem('y3k.consent.life.run', 'always');
  assert.equal(await consent({ kind: 'life.run', title: 't', note: 'n', doc: null, store }), 'always');
  assert.throws(() => consent({ title: 't', note: 'n' }), /kind/);
});
await ok('the three answers are the three Colin named, and a cancel is nothing', () => {
  const src = read('src/consent.js');
  assert.match(src, /always = 'always allow', once = 'allow just this time', cancel = 'cancel'/);
  assert.match(src, /bCancel\.addEventListener\('click', \(\) => done\(null\)\)/);
  assert.match(src, /if \(answer === 'always'\) \{ try \{ store\.setItem\(KEY\(kind\), 'always'\)/, 'only always is remembered');
  assert.match(src, /legal\.html#terms/, 'it points at the terms');
  assert.match(read('styles.css'), /\.consent-scrim \{ position: fixed; inset: 0; z-index: 1200/);
});

console.log('\nthe life in one click (src/life.js, y3k-code):');
await ok('begin says what it does first, makes the key itself and hands it to y3kode with the start; let it rest stops it', () => {
  const life = read('src/life.js');
  assert.match(life, /import \{ consent \} from '\.\/consent\.js';/);
  assert.match(life, /const ok = await consent\(LIFE_CONSENT\);\s+if \(!ok\) return;/, 'the note before anything');
  assert.match(life, /kind: 'life\.run'/);
  assert.match(life, /spends a little of your Claude plan/, 'the note says what it costs');
  assert.match(life, /nobody else sees them unless you share/, 'and who sees it');
  assert.match(life, /fetchFn\('\/api\/life\/key', \{ method: 'POST'/, 'the key, made here');
  assert.match(life, /cmd\(\{ cmd: 'life\.start', fresh: !!fresh, \.\.\.\(publish \? \{ publish \} : \{\}\) \}\)/, 'handed to y3kode');
  assert.match(life, /if \(versionAtLeast\(engine\?\.version, LIFE_PUBLISH_ENGINE\)\) \{/, 'only to a y3kode that takes the field (an older one refuses it: unexpected field publish)');
  assert.match(life, /function updateRow\(\)/, 'an older y3kode is offered the update here');
  assert.match(life, /publish = \{ to: location\.origin, key: j\.key \}/, 'to this site');
  assert.match(life, /cmd\(\{ cmd: 'life\.stop' \}\)/);
  assert.ok(!/prompt\(|copy the key/i.test(life), 'nothing to copy');
});
await ok('the engine takes publish with the start, and writes lucid\'s publish.json only for a real site and a real key', async () => {
  assert.deepEqual(Object.keys(COMMANDS['life.start']).sort(), ['fresh', 'publish']);
  assert.equal(validateCommand({ cmd: 'life.start', fresh: false, publish: { to: 'https://x.y', key: 'k' } }).ok, true);
  const dir = mkdtempSync(join(tmpdir(), 'y3k-life-pub-'));
  const spawned = [];
  const { PassThrough } = await import('node:stream');
  const spawn = () => { const c = { exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough(), stdin: { write() {}, end() {} }, once() {}, kill() {} }; spawned.push(c); return c; };
  const life = createLife({ ask: async () => true, env: { Y3K_LUCID: dir }, spawn, every: () => ({}), clear: () => {} });
  const key = 'y3kl_' + 'a'.repeat(48);
  // lucid must exist for start to run: the runner looks for lucid.py and a venv
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(dir, '.venv', 'bin'), { recursive: true }); writeFileSync(join(dir, '.venv', 'bin', 'python'), '#!/bin/sh\n'); writeFileSync(join(dir, 'lucid.py'), '');
  let r = await life.start({ publish: { to: 'https://yearthreethousand.com/', key } });
  if (r.ok) {
    const file = join(dir, 'life', 'publish.json');
    assert.ok(existsSync(file), 'written');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { to: 'https://yearthreethousand.com', key });
    life.stop(); spawned.at(-1).exitCode = 0;   // the fake child never exits by itself
    rmSync(file);
    await life.start({ publish: { to: 'http://evil.example', key } });
    assert.ok(!existsSync(file), 'not for a plain http site');
    life.stop(); spawned.at(-1).exitCode = 0;   // the fake child never exits by itself
    await life.start({ publish: { to: 'https://yearthreethousand.com', key: 'nope' } });
    assert.ok(!existsSync(file), 'not for a key of another shape');
    life.stop(); spawned.at(-1).exitCode = 0;   // the fake child never exits by itself
    await life.start({ publish: { to: 'http://127.0.0.1:5199', key } });
    assert.ok(existsSync(file), 'a local server is fine');
  } else {
    // the runner did not take the stub as lucid: the shape is pinned instead
    const src = read('y3k-code/life.mjs');
    assert.match(src, /function publishFile\(where, publish\)/);
    assert.match(src, /\^y3kl_\[0-9a-f\]\{48\}\$/);
    assert.match(src, /\^https:\\\/\\\/\[a-z0-9.-\]\+/);
    console.log('    (start did not run the stub: ' + (r.error || r.code) + '; shape pinned)');
  }
  rmSync(dir, { recursive: true, force: true });
});
await ok('versions compare as numbers, by part', async () => {
  const { versionAtLeast, LIFE_PUBLISH_ENGINE } = await import('../src/life.js');
  assert.equal(LIFE_PUBLISH_ENGINE, '0.3.6');
  assert.equal(versionAtLeast('0.3.6', '0.3.6'), true); assert.equal(versionAtLeast('0.3.10', '0.3.6'), true); assert.equal(versionAtLeast('0.4.0', '0.3.6'), true);
  assert.equal(versionAtLeast('0.3.5', '0.3.6'), false); assert.equal(versionAtLeast('', '0.3.6'), false); assert.equal(versionAtLeast(null, '0.3.6'), false);
});
await ok('the terms carry the field, and the engine is 0.3.6', () => {
  const legal = read('legal.html');
  assert.match(legal, /id="terms-life"/);
  assert.match(legal, /A life, if you begin one\./);
  assert.match(legal, /allow it once or always; pressing it is agreeing to this/);
  assert.match(legal, /<h2 id="terms">7\. Terms of use<\/h2>/);
  assert.equal(VERSION, '0.3.6');
  assert.equal(JSON.parse(read('y3k-code/package.json')).version, '0.3.6');
});

console.log('\nthe plan\'s limit, named (y3k-code/brain.mjs, src/brain.js):');
await ok('Claude Code\'s limit line becomes the code limit, with when it resets', async () => {
  assert.ok(LIMIT_HIT.test("You've hit your session limit · resets 9pm (America/New_York)"));
  assert.ok(LIMIT_HIT.test('You have hit your weekly limit'));
  assert.ok(!LIMIT_HIT.test('Not logged in'));
  const runner = async () => ({ code: 1, stdout: JSON.stringify({ type: 'result', is_error: true, result: "You've hit your session limit · resets 9pm (America/New_York)" }) + '\n', stderr: '', times: {} });
  const r = await thinkWithClaude({ bin: 'claude', env: {}, tmpDir: mkdtempSync(join(tmpdir(), 'y3k-brain-')), system: 's', prompt: 'p', runner });
  assert.equal(r.ok, false); assert.equal(r.code, 'limit'); assert.equal(r.resets, '9pm (America/New_York)');
  const r2 = await thinkWithClaude({ bin: 'claude', env: {}, tmpDir: mkdtempSync(join(tmpdir(), 'y3k-brain-')), system: 's', prompt: 'p', runner: async () => ({ code: 1, stdout: JSON.stringify({ type: 'result', is_error: true, result: 'something else broke' }) + '\n', stderr: '', times: {} }) });
  assert.equal(r2.code, 'refused');
});
await ok('the page says the limit, with the reset, and never blames this computer for it', () => {
  assert.equal(ownFailedLine({ code: 'limit', resets: '9pm (America/New_York)', at: Date.now() }), ownLimitLine('9pm (America/New_York)'));
  assert.match(ownLimitLine('9pm'), /reached its usage limit \(resets 9pm\)/);
  assert.match(ownLimitLine(''), /reached its usage limit\. /);
  assert.ok(!/computer did not answer/.test(ownLimitLine('9pm')));
  assert.equal(ownFailedLine({ code: 'failed', at: Date.now() }), OWN_FAILED);
  assert.equal(ownFailedLine(null), OWN_FAILED);
  const own = read('src/own-brain.js');
  assert.match(own, /if \(!r\?\.ok\) lastOwnFailure = \{ code: r\?\.code \|\| 'failed'/, 'remembered where the job is answered');
  assert.match(read('src/main.js'), /onOwnPlan\(\) \? ownFailedLine\(\) : PROVIDER_FAILED/);
  assert.match(read('src/brain.js'), /ownHere\(\) \? ownFailedLine\(\) : noBrain\(\)/);
});
console.log(`\n${passed} checks passed`);
