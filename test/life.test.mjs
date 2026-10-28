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
import { phaseOf, LIFE_ENGINE, sourceOf, agoText, oneSentence, LIFE_DOOR_ENGINE } from '../src/life.js';

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
  assert.match(life, /btn\('update y3kode', 'create-go', \(\) => doUpdate\(\)\)/, 'the button is on the life page');
  assert.match(life, /cmd: 'engine\.hello'/, 'it asks y3kode whether it can update itself before offering');
  assert.match(life, /else if \(engine\?\.update\) \{/, 'offered only to a y3kode that can');
  assert.match(life, /get the app/, 'else the app, which has y3kode inside');
  assert.match(life, /waitFor\(r\.version/, 'after the restart it waits for the new version');
  assert.match(life, /_blank', 'noopener,noreferrer'/, 'the app opens in its own tab, with no handle back');
  assert.equal(LIFE_ENGINE, '0.3.4');
});

await ok('the published life: which source the page shows, how old a moment reads, and the page\'s pins (Colin, 2026-10-24: "make life viewable from web")', () => {
  assert.equal(sourceOf('living', { ok: true, life: { n: 1 } }), 'local', 'a life living here comes first');
  assert.equal(sourceOf('resting', { ok: true, life: { n: 1 } }), 'web');
  assert.equal(sourceOf('unpaired', { ok: true, life: { n: 1 } }), 'web', 'no engine needed to watch');
  assert.equal(sourceOf('unpaired', { ok: true, life: null }), 'none');
  assert.equal(sourceOf('resting', { ok: false, status: 401 }), 'none');
  assert.equal(agoText(1000, 4000), '3s ago'); assert.equal(agoText(0, 90_000), '1 min ago'); assert.equal(agoText(0, 7200_000), '2 h ago'); assert.equal(agoText(0, 2 * 86400_000), '2 d ago');
  const life = readFileSync(new URL('../src/life.js', import.meta.url), 'utf8');
  assert.match(life, /\/api\/life\/latest\?user=\$\{encodeURIComponent\(watch\)\}/, 'someone else\'s by username, encoded');
  assert.match(life, /if \(!watch\) poll\(\);/, 'watching someone else asks nothing of this computer');
  assert.match(life, /\/api\/life\/key'/, 'the key is made from the page'); assert.match(life, /\/api\/life\/share'/); assert.match(life, /\/api\/life\/say'/);
  assert.match(life, /lived through the door/, 'who was at the door is said');
  assert.match(life, /function card\(source\)/, 'one card, only when something stands in the way');
  assert.match(life, /el\.share\.hidden = !\(mine && pub\.life\);/, 'sharing is the owner\'s only, one small word');
  assert.match(life, /return \{ open, close, setWatch, hear \};/, 'the chat bar reaches it through hear');
  // 2026-10-25, Colin: "formatting of life should be fixed so that nothing overlaps" — one column above the chat bar's measured top
  assert.match(life, /el\.under\.append\(el\.words, el\.line, el\.acts\);/, 'the words, the line and the buttons are one column');
  assert.match(life, /root\.style\?\.setProperty\?\.\('--life-chat-top'/, 'anchored to where the chat bar is');
  assert.match(life, /for \(const id of \['chat', 'chat-air', 'nav-collapse-bottom', 'caption'\]\)/, 'above the bar, its air mark, its fold button and a caption alike');
  // 2026-10-26, Colin: one sentence on the screen; nothing carried over; a way to hide the words; "go to sleep" that reaches the life or says why not
  assert.equal(oneSentence('Set back again, but the street is still under the bars. The wings are back and I won\'t stare at them.'), 'Set back again, but the street is still under the bars.');
  assert.equal(oneSentence('  Can you hear me?  I only want to talk.'), 'Can you hear me?');
  assert.equal(oneSentence('no end to this'), 'no end to this'); assert.equal(oneSentence(''), '');
  assert.match(life, /setText\(el\.thought, said \? '' : oneSentence\(thought\)\);/, 'its words if it spoke, else the first sentence of its thought');
  assert.match(life, /el\.veil\.addEventListener\('click', \(\) => \{\s+quiet = !quiet;/, 'a tap on the picture hides the words');
  assert.match(life, /cs\.opacity === '0' \|\| cs\.visibility === 'hidden' \|\| cs\.display === 'none'\)\) continue;/, 'an invisible caption takes no room');
  assert.match(read('styles.css'), /body\.panel-open\.in-life #caption \{ opacity: 0; pointer-events: none; \}/, 'the home\'s caption is not the life\'s');
  assert.equal(LIFE_DOOR_ENGINE, '0.3.7');
  assert.match(life, /if \(life\.status === 'asleep'\) return false;/, 'its last word says asleep');
  assert.match(life, /else if \(afar && !r\.door\) \{/, 'a press that reached nothing says why');
  assert.match(life, /else if \(afar && r\.door\) sleptAt = Date\.now\(\);/, 'a press that reached it flips the buttons at once');
  assert.match(life, /const placeOf = \(p\) => \{ const t = String\(p \|\| ''\)\.trim\(\); return t\.length > 44/, 'a long place name is clipped on the line');
  assert.match(read('styles.css'), /\.life-under \{ position: absolute; left: 50%; transform: translateX\(-50%\); bottom: calc\(100% - var\(--life-chat-top, 80%\) \+ 26px\);/);
  assert.match(read('styles.css'), /-webkit-line-clamp: 3/, 'the thought is at most three lines');
  const social = readFileSync(new URL('../src/social.js', import.meta.url), 'utf8');
  assert.match(social, /searchParams\.get\('life'\)/, '?life= is read once');
  assert.match(social, /lifeWatch \? 'life' : 'orb'/, 'and the page opens on the life');
  assert.match(readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), /user\.id === uid\)\)\) return json\(404/, 'a picture of an unshared life is nobody else\'s');
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
  // for the presence's record — and, since 2026-10-24 (Colin: "make life
  // viewable from web"), the page reads the PUBLISHED life (/api/life/latest,
  // in a ternary the regex does not see), makes the key that lets the living
  // process publish, shares it, and says a line to it. All of that is the
  // person's own doing (the key); nothing of a life living here leaves but
  // the record.
  assert.deepEqual([...life.matchAll(/fetch\w*\('([^']+)'/g)].map((x) => x[1]), ['/api/life/moment', '/api/life/share', '/api/life/say', '/api/life/key']   /* 2026-10-25: wake makes the key itself (one click) */, 'the life view reaches the site for something besides the record and the published life');
  assert.match(life, /'\/api\/life\/latest'/, 'the newest published moment');
  assert.match(life, /cmd\(\{ cmd: 'life\.state', since \}\)/);
});

// THE PAGE, RUN (2026-10-25). Every pin above reads the source; none ran it, and
// a name that did not exist (`hear`, gone with the voice bridge) threw in paint()
// on every poll, so the life tab was an empty panel on the live site (Colin:
// "when i click on life from web nothing shows up just grey screen"). The view
// opens under a stand-in DOM, with y3kode unreachable and the site saying 401,
// and must draw its card without throwing.
await ok('the view opens as a stage on the body and draws, with no engine here and no published life, without throwing', async () => {
  const { installDom, serialize } = await import('./fakes/mini-dom.mjs');
  installDom();
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.location = { origin: 'https://yearthreethousand.com', href: 'https://yearthreethousand.com/' };
  const { createLifeView } = await import('../src/life.js');
  const thrown = [];
  const catchIt = (e) => thrown.push(e);
  process.on('uncaughtException', catchIt); process.on('unhandledRejection', catchIt);
  try {
    const view = createLifeView({
      toast: () => {}, speak: null, openKode: () => {},
      cmd: async (c) => ({ ok: false, code: 'unpaired', error: 'y3kode is not connected in this browser.' }),
      fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ error: 'sign in' }) }),
      setup: async () => ({}),
      schedule: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), unschedule: clearTimeout,
    });
    try { view.open(); } catch (e) { thrown.push(e); }
    for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(thrown.map((e) => String(e?.stack || e).split('\n').slice(0, 2).join(' ')), [], 'nothing thrown while it polled');
    const root = document.body.querySelector('.life-root');
    assert.ok(root, 'the stage is on the body, the whole screen');
    const html = serialize(root);
    assert.match(html, /a life lives on your own computer/, 'the card for a browser with no y3kode');
    assert.match(html, /open kode/, 'with the way in');
    assert.equal(view.hear('hello'), false, 'nothing here can hear: the chat bar talks to the presence instead');
    view.close();
    assert.ok(!document.body.querySelector('.life-root'), 'closed, the stage is gone');
  } finally { process.off('uncaughtException', catchIt); process.off('unhandledRejection', catchIt); }
});

await ok('a published life of your own, awake: the picture, its thought and words, one line, and the chat bar reaches it', async () => {
  const { serialize } = await import('./fakes/mini-dom.mjs');
  const { createLifeView } = await import('../src/life.js');
  const posts = [];
  const life = { n: 2551, at: Date.now() - 20_000, thought: 'Sixty-two moments, and it holds.', say: 'The rain is back.', place: 'The lantern colonnade', who: 'claude', frameUrl: '/life/y3klay/002551.jpg' };
  const said = [];
  const view = createLifeView({
    toast: () => {}, speak: (t) => { said.push(t); return undefined; }, openKode: () => {},
    cmd: async () => ({ ok: false, code: 'unpaired' }),
    fetchFn: async (url, opts) => { if (opts?.method === 'POST') { posts.push([url, JSON.parse(opts.body)]); return { ok: true, json: async () => ({ ok: true }) }; } return { ok: true, json: async () => ({ ok: true, user: 'y3klay', mine: true, shared: false, key: true, life, recent: [] }) }; },
    setup: async () => ({}), schedule: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), unschedule: clearTimeout,
  });
  view.open();
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 5));
  const root = document.body.querySelector('.life-root');
  const html = serialize(root);
  // one sentence on the screen (2026-10-26): when it spoke, its words alone; the thought stays in the journal and its voice
  assert.ok(!/Sixty-two moments/.test(html), 'the thought is not drawn beside its words');
  assert.match(html, /“The rain is back\.”/, 'its words');
  assert.match(html, /moment 2551 · The lantern colonnade · living on its own/, 'one line');
  assert.match(html, /only you can see it/, 'sharing, one small word');
  assert.ok(!/a life lives on your own computer/.test(html), 'no card over a life that is showing');
  assert.deepEqual(said, ['The rain is back.'], 'its words are said once, in the presence\'s voice');
  // and a moment with no words: the first sentence of its thought, only
  life.say = ''; life.thought = 'Set back again, but the street is still under the bars. The wings are back and I will not stare at them.'; life.n = 2552;
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5));
  const html2 = serialize(document.body.querySelector('.life-root'));
  assert.match(html2, /Set back again, but the street is still under the bars\./, 'the first sentence');
  assert.ok(!/The wings are back/.test(html2), 'and no more');
  assert.equal(view.hear('hello in there'), true, 'the chat bar reaches it');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(posts, [['/api/life/say', { text: 'hello in there' }]]);
  view.close();
});

// THE FLOW (2026-10-27): a living life sends a view about every 0.7s. Asked
// every 400ms here; each picture fades over most of the recent gap; one that
// comes while a fade runs waits for it, the newest only; a published life's
// views are watched by their tag, an unchanged one not shown again, and when
// they stop the moment's own picture comes back.
await ok('the flow: views flow into each other here and from afar, never swapping a layer mid-fade', async () => {
  const { createLifeView, fadeFor, FADE_MIN, FADE_MAX, VIEW_MS } = await import('../src/life.js');
  assert.equal(fadeFor([]), FADE_MAX, 'one picture a moment: the slow dissolve');
  assert.equal(fadeFor([700, 650, 720]), Math.round(0.85 * 700), 'views: most of the gap');
  assert.equal(fadeFor([50, 60]), FADE_MIN);
  assert.equal(fadeFor([20000]), FADE_MAX);
  // a hand-run clock: nothing scheduled runs until the test runs it
  const q = []; let ids = 0;
  const schedule = (fn, ms) => { const id = ++ids; q.push({ id, fn, ms }); return id; };
  const unschedule = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
  const run = async (pick) => { const i = q.findIndex(pick); assert.ok(i >= 0, 'nothing like that is waiting: ' + q.map((x) => x.ms).join(',')); const [x] = q.splice(i, 1); await x.fn(); for (let j = 0; j < 4; j++) await new Promise((r) => setTimeout(r, 1)); };
  let k = 0;
  const view = createLifeView({
    toast: () => {}, speak: null, openKode: () => {}, schedule, unschedule,
    cmd: async (c) => (c.cmd === 'life.state' ? { ok: true, installed: true, running: true, frameN: ++k, frame: 'F' + k, moment: { n: k, thought: 't' + k } }
      : c.cmd === 'engine.hello' ? { ok: true, version: '0.3.7' } : { ok: true }),
    fetchFn: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    setup: async () => ({}),
  });
  view.open();
  for (let j = 0; j < 6; j++) await new Promise((r) => setTimeout(r, 1));
  const [a, b] = document.body.querySelectorAll('img.life-frame');
  const url = (n) => 'data:image/jpeg;base64,F' + n;
  const holding = () => [a.src || '', b.src || ''];
  assert.ok(holding().includes(url(1)), 'the first view is on a layer');
  assert.ok(q.some((x) => x.ms === 400), 'a living life is asked again in 400ms');
  const first = holding().indexOf(url(1)) === 0 ? a : b;
  first.onload();   // it has loaded: its fade runs
  await run((x) => x.ms === 400);
  assert.ok(!holding().includes(url(2)), 'a view that comes mid-fade waits');
  await run((x) => x.ms === 400);
  assert.ok(!holding().includes(url(3)), 'still waiting');
  const wait = q.find((x) => x.ms > 400 && x.ms <= FADE_MAX);
  assert.ok(wait, 'it waits for the fade to end');
  await run((x) => x === wait);
  assert.ok(holding().includes(url(3)) && !holding().includes(url(2)), 'the newest only, when the fade is done: ' + holding());
  view.close();

  // from afar: a published life making views
  q.length = 0; k = 0;
  const at = Date.now() - 2000;
  let tag = '"v1"', gone = false;
  const asked = [];
  const pubLife = () => ({ n: 9, at, thought: 'here', say: '', place: 'the street', who: 'claude', frameUrl: '/life/ann/000009.jpg', ...(gone ? {} : { view: { url: '/life/ann/view.jpg', seq: 1, at } }) });
  const far = createLifeView({
    toast: () => {}, speak: null, openKode: () => {}, schedule, unschedule,
    cmd: async () => ({ ok: false, code: 'unpaired' }),
    fetchFn: async (u, o) => {
      asked.push([u, o?.cache || '']);
      if (u === '/life/ann/view.jpg') return gone ? { ok: false, status: 404 } : { ok: true, status: 200, headers: { get: (h) => (h === 'etag' ? tag : null) }, blob: async () => new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 1])], { type: 'image/jpeg' }) };
      return { ok: true, json: async () => ({ ok: true, user: 'ann', mine: true, shared: false, key: true, life: pubLife(), recent: [] }) };
    },
    setup: async () => ({}),
  });
  far.open();
  for (let j = 0; j < 8; j++) await new Promise((r) => setTimeout(r, 1));
  const [fa, fb] = document.body.querySelectorAll('img.life-frame');
  const shownNow = () => [fa.src || '', fb.src || ''].filter(Boolean);
  assert.ok(asked.some(([u, c]) => u === '/life/ann/view.jpg' && c === 'no-cache'), 'its views are asked by their tag: ' + JSON.stringify(asked));
  assert.ok(shownNow().some((s) => s.startsWith('blob:')), 'a view is shown, not the moment: ' + shownNow());
  assert.ok(q.some((x) => x.ms === VIEW_MS), 'asked again about once a second');
  const before = shownNow().join();
  await run((x) => x.ms === VIEW_MS);
  assert.equal(shownNow().join(), before, 'the same tag: not shown again');
  gone = true;
  await run((x) => x.ms === VIEW_MS);
  assert.ok(shownNow().includes('/life/ann/000009.jpg'), 'views stopped: the moment\'s own picture again: ' + shownNow());
  assert.ok(!q.some((x) => x.ms === VIEW_MS), 'and they are not asked for');
  far.close();
});

await ok('a wake that waits on the computer\'s own question says where to answer it', async () => {
  const { ASK_AFTER_MS, ASK_HERE } = await import('../src/life.js');
  const src = readFileSync(new URL('../src/life.js', import.meta.url), 'utf8');
  assert.match(src, /schedule\(\(\) => \{ if \(!starting \|\| !root\) return; askedHere = true; paint\(\); toast\(ASK_HERE\); \}, ASK_AFTER_MS\)/, 'a start still waiting says so');
  assert.match(src, /unschedule\(hint\);/, 'and stops saying it once answered');
  assert.match(src, /askedHere \? 'allow it on your computer…' : 'waking…'/, 'the button says where');
  assert.ok(ASK_AFTER_MS < 5000 && /Terminal/.test(ASK_HERE));
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
