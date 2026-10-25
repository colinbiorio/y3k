// LIFE (2026-10-20). Colin: "add it as a new glyph on yearthreethousand.com ...
// add your new mode with name 'life' on the top right." The bridge in y3kode
// (y3k-code/life.mjs) that runs lucid on this computer, the page's view of it
// (src/life.js), and the wiring between. When lucid itself is installed here,
// the real thing runs too: its scripted brain and its placeholder dreamer, in
// a scratch life, so no plan is spent and no real life is touched.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { lucidAt, lineFor, extraArgs, createLife, MOVES } from '../y3k-code/life.mjs';
import { COMMANDS, validateCommand } from '../y3k-code/protocol.mjs';
import { KINDS, describe } from '../y3k-code/consent.mjs';
import { phaseOf, LIFE_ENGINE } from '../src/life.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

console.log('\nthe bridge (y3k-code/life.mjs):');

await ok('lucid is found where it is set, else in ~/y3k-code/lucid, and runs only with its own Python and script', () => {
  const home = mkdtempSync(join(tmpdir(), 'life-home-'));
  const at = lucidAt({ env: {}, home, platform: 'darwin' });
  assert.equal(at.dir, join(home, 'y3k-code', 'lucid'));
  assert.equal(at.installed, false);
  mkdirSync(join(at.dir, '.venv', 'bin'), { recursive: true });
  writeFileSync(join(at.dir, '.venv', 'bin', 'python'), '');
  assert.equal(lucidAt({ env: {}, home, platform: 'darwin' }).installed, false, 'a Python with no lucid.py is not lucid');
  writeFileSync(join(at.dir, 'lucid.py'), '');
  assert.equal(lucidAt({ env: {}, home, platform: 'darwin' }).installed, true);
  assert.equal(lucidAt({ env: { Y3K_LUCID: '/x' }, home }).dir, '/x', 'Y3K_LUCID wins');
  assert.equal(lucidAt({ env: {}, config: { life: { dir: '/y' } }, home }).dir, '/y');
  assert.ok(lucidAt({ env: {}, home, platform: 'win32' }).python.endsWith(join('.venv', 'Scripts', 'python.exe')));
  rmSync(home, { recursive: true, force: true });
});

await ok('what reaches the life is what lucid\'s own window allows, and nothing else', () => {
  assert.deepEqual(lineFor({ do: 'mode', to: 'human' }), { do: 'mode', mode: 'human' });
  assert.deepEqual(lineFor({ do: 'mode', to: 'autonomous' }), { do: 'mode', mode: 'autonomous' });
  assert.equal(lineFor({ do: 'mode', to: 'god' }), null);
  for (const m of MOVES) assert.deepEqual(lineFor({ do: 'move', move: m }), { do: 'move', move: m });
  assert.equal(lineFor({ do: 'move', move: 'teleport' }), null);
  assert.deepEqual(lineFor({ do: 'say', text: '  hello\u0007 there  ' }), { do: 'say', text: 'hello  there' });
  assert.equal(lineFor({ do: 'say', text: 'x'.repeat(900) }).text.length, 500);
  assert.equal(lineFor({ do: 'say', text: '   ' }), null);
  assert.deepEqual(lineFor({ do: 'pace', delta: 99 }), { do: 'pace', delta: 5 });
  assert.equal(lineFor({ do: 'pace', delta: 0 }), null);
  assert.equal(lineFor({ do: 'exec', cmd: 'rm -rf /' }), null);
  assert.equal(lineFor(null), null);
});

await ok('Y3K_LUCID_ARGS are words, never a shell: anything else is dropped', () => {
  assert.deepEqual(extraArgs({ Y3K_LUCID_ARGS: '--brain scripted --dream none --life /tmp/x $(rm -rf) ;ls' }), ['--brain', 'scripted', '--dream', 'none', '--life', '/tmp/x']);
  assert.deepEqual(extraArgs({}), []);
});

// a stand-in for spawnChild: a child whose stdout the test writes and whose stdin it reads
function fakeSpawn() {
  const calls = [];
  const spawn = (bin, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.exitCode = null; child.signalCode = null; child.pid = 4242;
    child.written = [];
    child.stdin.on('data', (d) => { for (const l of String(d).split('\n').filter(Boolean)) child.written.push(JSON.parse(l)); });
    child.exit = (code = 0) => { child.exitCode = code; child.emit('exit', code, null); };
    calls.push({ bin, args, opts, child });
    return child;
  };
  return { spawn, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

await ok('it is asked on the computer first, once, then runs lucid --serve on the sign-in, never a key', async () => {
  const home = mkdtempSync(join(tmpdir(), 'life-'));
  const dir = join(home, 'lucid');
  mkdirSync(join(dir, '.venv', 'bin'), { recursive: true });
  writeFileSync(join(dir, '.venv', 'bin', 'python'), ''); writeFileSync(join(dir, 'lucid.py'), '');
  const { spawn, calls } = fakeSpawn();
  let asked = 0, answer = false;
  const life = createLife({ ask: async (kind) => { assert.equal(kind, 'life.run'); asked += 1; return answer; }, env: { Y3K_LUCID: dir, ANTHROPIC_API_KEY: 'sk-ant-not-yours', PATH: '/usr/bin', Y3K_LUCID_ARGS: '--effort low' }, spawn, every: () => ({}), clear: () => {} });
  assert.equal((await life.start()).code, 'declined');
  assert.equal(calls.length, 0, 'nothing ran on a no');
  answer = true;
  assert.equal((await life.start()).ok, true);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.bin, join(dir, '.venv', 'bin', 'python'));
  assert.deepEqual(c.args, [join(dir, 'lucid.py'), '--serve', '--effort', 'low']);
  assert.equal(c.opts.cwd, dir);
  assert.equal(c.opts.env.ANTHROPIC_API_KEY, undefined, 'a key in the environment would bill it instead of the sign-in');
  assert.equal(c.opts.env.PATH, '/usr/bin');
  c.child.exit(0); await tick();
  await life.start({ fresh: true });
  assert.equal(asked, 2, 'asked again only after the no, not on every start');
  assert.ok(calls[1].args.includes('--new'), 'a new life asks lucid for one');
  rmSync(home, { recursive: true, force: true });
});

await ok('the page gets each moment, and a picture only when it has not got it yet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'life-'));
  mkdirSync(join(dir, '.venv', 'bin'), { recursive: true });
  writeFileSync(join(dir, '.venv', 'bin', 'python'), ''); writeFileSync(join(dir, 'lucid.py'), '');
  const { spawn, calls } = fakeSpawn();
  const life = createLife({ ask: async () => true, env: { Y3K_LUCID: dir }, spawn, every: () => ({}), clear: () => {} });
  await life.start();
  const child = calls[0].child;
  child.stdout.write(JSON.stringify({ type: 'hello', life: '/l', moment: 3, brain: 'claude', mode: 'autonomous', pace: 6 }) + '\n');
  child.stdout.write('not json\n');
  child.stdout.write(JSON.stringify({ type: 'moment', n: 3, mode: 'autonomous', thought: 'a lit doorway', say: '', status: 'awake', frame: 'AAAA' }) + '\n');
  await tick();
  let s = life.state({ since: -1 });
  assert.equal(s.running, true);
  assert.equal(s.hello.moment, 3);
  assert.equal(s.moment.thought, 'a lit doorway');
  assert.equal(s.moment.frame, undefined, 'the picture rides apart from the moment');
  assert.equal(s.frame, 'AAAA');
  assert.equal(s.frameN, 1);
  s = life.state({ since: 1 });
  assert.equal(s.frame, undefined, 'a picture the page already has is not sent again');
  // the window's controls go through; anything else does not
  assert.equal(life.act({ do: 'mode', to: 'human' }).ok, true);
  assert.equal(life.act({ do: 'move', move: 'left' }).ok, true);
  assert.equal(life.act({ do: 'nope' }).ok, false);
  await tick();
  assert.deepEqual(child.written, [{ do: 'mode', mode: 'human' }, { do: 'move', move: 'left' }]);
  // stop: asked first, the way lucid's window is closed
  life.stop();
  await tick();
  assert.deepEqual(child.written.at(-1), { do: 'stop' });
  child.exit(0); await tick();
  const after = life.state({});
  assert.equal(after.running, false);
  assert.equal(after.ended.why, 'you let it rest');
  rmSync(dir, { recursive: true, force: true });
});

await ok('a life nobody watches rests by itself, and an uninstalled one says where it looked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'life-'));
  mkdirSync(join(dir, '.venv', 'bin'), { recursive: true });
  writeFileSync(join(dir, '.venv', 'bin', 'python'), ''); writeFileSync(join(dir, 'lucid.py'), '');
  const { spawn, calls } = fakeSpawn();
  let t = 0, tickFn = null;
  const life = createLife({ ask: async () => true, env: { Y3K_LUCID: dir }, spawn, now: () => t, every: (fn) => { tickFn = fn; return {}; }, clear: () => {}, idleMs: 1000 });
  await life.start();
  t = 900; tickFn();
  assert.equal(calls[0].child.written.length, 0, 'it rested while someone was still watching');
  t = 2001; tickFn();
  await tick();
  assert.deepEqual(calls[0].child.written.at(-1), { do: 'stop' });
  calls[0].child.exit(0); await tick();   // lucid leaves when asked, as the real one does
  assert.equal(life.state({}).ended.why, 'it rested when nobody was watching');
  const none = createLife({ ask: async () => true, env: { Y3K_LUCID: join(dir, 'nowhere') }, spawn, every: () => ({}), clear: () => {} });
  const r = await none.start();
  assert.equal(r.code, 'not-installed');
  assert.ok(r.error.includes(join(dir, 'nowhere')));
  rmSync(dir, { recursive: true, force: true });
});

await ok('one language: the engine knows life.*, asks with its own words, and the life\'s mode is `to`', () => {
  for (const c of ['life.status', 'life.start', 'life.state', 'life.do', 'life.stop']) assert.ok(COMMANDS[c], c);
  assert.equal(validateCommand({ cmd: 'life.do', do: 'mode', to: 'human' }).ok, true);
  // `mode` is every command's permission mode, checked against kode's MODES:
  // this is why the life's mode travels as `to`
  assert.equal(validateCommand({ cmd: 'life.do', do: 'mode', mode: 'human' }).ok, false);
  assert.ok(KINDS.includes('life.run'));
  assert.match(describe('life.run', {}), /Claude plan/);
  const page = read('src/code/protocol.js');
  for (const c of ['life.status', 'life.start', 'life.state', 'life.do', 'life.stop']) assert.ok(page.includes(`'${c}'`), `the page does not know ${c}`);
});

console.log('\nthe page (src/life.js, social.js, main.js):');

await ok('an old y3kode is offered its update here, not sent to kode (Colin, 2026-10-24: "no option to update or download")', () => {
  const life = readFileSync(new URL('../src/life.js', import.meta.url), 'utf8');
  assert.match(life, /import \{ engineCmd, updateY3kode, waitForVersion, siteSetup \} from '\.\/own-brain\.js'/, 'the same update Settings → Brain runs');
  assert.doesNotMatch(life, /Open kode and it will offer the update/, 'kode never offered one');
  assert.match(life, /id="life-update"/, 'the button is on the life page');
  assert.match(life, /cmd: 'engine\.hello'/, 'it asks y3kode whether it can update itself before offering');
  assert.match(life, /if \(engine\?\.update\) return/, 'offered only to a y3kode that can');
  assert.match(life, /get the app/, 'else the app, which has y3kode inside');
  assert.match(life, /waitFor\(r\.version/, 'after the restart it waits for the new version');
  assert.match(life, /_blank', 'noopener,noreferrer'/, 'the app opens in its own tab, with no handle back');
  assert.equal(LIFE_ENGINE, '0.3.4');
});

await ok('what the engine says becomes one of the view\'s states', () => {
  assert.equal(phaseOf({ ok: false, code: 'unpaired' }), 'unpaired');
  assert.equal(phaseOf({ ok: false, code: 'offline' }), 'unpaired');
  assert.equal(phaseOf({ ok: false, error: 'unknown command life.state' }), 'old');
  assert.equal(phaseOf({ ok: true, installed: false }), 'missing');
  assert.equal(phaseOf({ ok: true, installed: true, running: false }), 'resting');
  assert.equal(phaseOf({ ok: true, installed: true, running: true }), 'living');
});

await ok('the moon opens life and a second press goes home; life is a view like the others, and its voice is the presence\'s own', () => {
  const main = read('src/main.js'), social = read('src/social.js'), life = read('src/life.js');
  assert.match(main, /\$\('nav-life'\)\?\.addEventListener\('click', \(\) => \{[\s\S]{0,160}social\.showView\(document\.body\.classList\.contains\('in-life'\) \? 'orb' : 'life'\);/);
  assert.match(social, /else if \(v === 'life'\) lifeView\.open\(\$\('home-grid'\)\);/);
  assert.match(social, /if \(v !== 'life'\) lifeView\.close\(\);/);
  assert.match(social, /document\.body\.classList\.toggle\('in-life', v === 'life'\);/);
  // the presence's own voice (2026-10-21, one mind in two places: the one
  // living there is the presence), through the path Code's replies are read
  // on, never over a turn of its own; the view itself moves nothing of the
  // orb: that is main.js's (test/life-mind.test.mjs holds the rest)
  assert.match(main, /speak: \(t, o\) => \(busy \|\| currentSpeak \? null : codeLink\.speak\(t, o\)\),/);
  assert.ok(!/body\.(setMood|setSpeaking|beat)/.test(life), 'the life moves the orb');
  // it asks the engine on this computer; the site hears each moment's words,
  // for the presence's record, and nothing else
  assert.deepEqual([...life.matchAll(/fetch\w*\('([^']+)'/g)].map((x) => x[1]), ['/api/life/moment'], 'the life view reaches the site for something besides the record');
  assert.match(life, /cmd\(\{ cmd: 'life\.state', since \}\)/);
});

// THE REAL THING, when it is here: lucid's scripted brain and placeholder
// dreamer in a scratch life (no model, no plan, no real life touched), through
// the bridge exactly as y3kode runs it.
const real = lucidAt({ env: process.env });
if (!real.installed) {
  console.log('  (lucid is not installed here: the live run is skipped)');
} else {
  await ok('lucid itself, served: moments and pictures arrive, the controls reach it, and it rests on stop', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'life-real-'));
    const life = createLife({ ask: async () => true, env: { ...process.env, Y3K_LUCID_ARGS: `--brain scripted --dream none --pace 1 --life ${scratch}` } });
    assert.equal((await life.start()).ok, true);
    let s = null;
    for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 100)); s = life.state({ since: -1 }); if (s.frame && (s.moment?.n | 0) >= 2) break; }
    assert.ok(s?.frame?.startsWith('/9j/'), 'no JPEG came from lucid');
    assert.equal(s.hello.life, scratch, 'the life was not kept where it was told');
    assert.equal(life.act({ do: 'mode', to: 'human' }).ok, true);
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); s = life.state({}); if (s.moment?.mode === 'human') break; }
    assert.equal(s.moment.mode, 'human');
    life.stop();
    for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 100)); if (!life.state({}).running) break; }
    assert.equal(life.state({}).running, false, 'lucid did not rest when asked');
    life.dispose();
    rmSync(scratch, { recursive: true, force: true });
  });
}

console.log(`\n${passed} checks passed.`);
