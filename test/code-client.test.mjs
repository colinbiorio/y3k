// y3k CODE, THE SCREEN'S SIDE. Run:  node test/code-client.test.mjs
//
// The page and the engine speak one language (checked word for word); the
// screen never parses the engine's text as HTML and never publishes; the laptop
// sits on the right rail and "go live" on the left; and the screen's state,
// built only from events, comes out right when a real session (the engine
// driving the fake `claude`) is replayed through it.
import assert from 'node:assert';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engineProto from '../y3k-code/protocol.mjs';
import * as pageProto from '../src/code/protocol.js';
import { createState, apply, needsYou, openRequest, activeSession } from '../src/code/state.js';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => (statSync(join(ROOT, dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const CODE_FILES = walk('src/code').filter((f) => f.endsWith('.js'));

console.log('one language:');

await ok('the page\'s events, commands and modes are the engine\'s, word for word', () => {
  assert.deepEqual(pageProto.EVENTS, engineProto.EVENTS);
  assert.deepEqual(pageProto.COMMANDS, Object.keys(engineProto.COMMANDS));
  assert.deepEqual(pageProto.MODES, engineProto.MODES);
  assert.equal(pageProto.PROTOCOL, engineProto.PROTOCOL);
  for (const m of pageProto.MODES) assert.ok(pageProto.MODE_INFO[m]?.hint, m);
});

console.log('\nwhat the screen may do:');

await ok('nothing under src/code parses a string as HTML', () => {
  for (const f of CODE_FILES) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|srcdoc|\beval\(|new Function\(/.test(src), f);
  }
});

await ok('it talks to the engine on this computer and nothing else — never the site, never publishing', () => {
  for (const f of CODE_FILES) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    if (!f.endsWith('transport.js')) assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(src), `${f} reaches the network`);
    assert.ok(!/\/api\/|\bpublish\w*\(|startHosting|\bsocial\.|\/posts/.test(src), `${f} touches the site`);
  }
  const t = read('src/code/transport.js');
  for (const m of t.matchAll(/fetch\(`([^`]*)`/g)) assert.ok(m[1].startsWith('${base(port)}'), m[1]);
  assert.match(t, /const base = \(port\) => `http:\/\/127\.0\.0\.1:\$\{port\}`/);
  assert.ok(!/credentials: 'include'/.test(t), 'never cookies');
});

await ok('links are http(s) only and images are never loaded', () => {
  const md = read('src/code/render/markdown.js');
  assert.match(md, /SAFE_URL = \/\^https\?:/);
  assert.ok(!/createElement\('img'\)|h\('img/.test(md), 'markdown never makes an <img>');
});

await ok('the pairing code leaves the address bar at once', () => {
  const t = read('src/code/transport.js');
  assert.match(t, /replaceState/);
  assert.match(read('src/main.js'), /takePairingFromHash\(\);/);
});

console.log('\nwhere it lives:');

await ok('the laptop is on the right rail, go live on the left after live now', () => {
  const html = read('index.html');
  const left = html.slice(html.indexOf('<nav id="home-nav"'), html.indexOf('</nav>', html.indexOf('<nav id="home-nav"')));
  const right = html.slice(html.indexOf('<nav id="home-nav-right"'), html.indexOf('</nav>', html.indexOf('<nav id="home-nav-right"')));
  const ids = (s) => [...s.matchAll(/<button id="([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids(left), ['nav-profile', 'nav-feed', 'nav-post', 'nav-live', 'broadcast', 'nav-search']);
  assert.deepEqual(ids(right), ['nav-settings', 'nav-code', 'nav-world', 'nav-games', 'nav-mine', 'nav-orb']);
  assert.match(right, /id="nav-code"[^>]*hidden/, 'hidden until the rollout allows it');
});

await ok('its glyph is poured last, so no other glyph changes its seed', () => {
  const src = read('src/mercury-mount.js');
  const plans = src.slice(src.indexOf('const plans = ['), src.indexOf('];', src.indexOf('const plans = [')));
  const ids = [...plans.matchAll(/\['([\w-]+)'/g)].map((m) => m[1]);
  assert.equal(ids.at(-1), 'nav-code');
  assert.equal(ids.at(-2), 'nav-mine');
});

await ok('the room: in-code class, lit glyph, loaded only when opened, orb column', () => {
  const social = read('src/social.js');
  assert.match(social, /toggle\('in-code', v === 'code'\)/);
  assert.match(social, /import\('\.\/code\/code-view\.js'\)/);
  assert.match(social, /if \(v !== 'code' && codeView\?\.isOpen\(\)\) \{ codeView\.close\(\);/);
  const css = read('styles.css');
  assert.match(css, /body\.in-code #stage \{ inset: 0 var\(--hole-r\) 0 auto; width: var\(--code-orb-w\)/);
  assert.match(css, /\.code-root \{ position: fixed;[^}]*z-index: 31;/);
  assert.match(read('src/history.js'), /'\.code-root'/);
});

await ok('code is private: no going live from inside it, no opening it while live', () => {
  const main = read('src/main.js');
  assert.match(main, /in-code[\s\S]{0,80}code is private — leave code to go live/);
  assert.match(main, /social\.isHosting\(\)\) \{ toast\('code is private — end your broadcast first\.'\)/);
});

await ok('talking to the presence from Code never publishes, not even to your own room', () => {
  const main = read('src/main.js');
  assert.match(main, /handle\(t, null, \{ private: true \}\)/);
  assert.match(main, /if \(hosting && !priv && text && !text\.startsWith\('\('\)\) social\.publishWords/);
  assert.match(main, /if \(!priv\) goLiveAndPublish\(/);
  assert.match(main, /queuedPrivate = true; return;/);
});

await ok('the site only says who may see it; the default is the founder', () => {
  const server = read('server.mjs');
  assert.match(server, /CODE_ROLLOUT = \['off', 'founder', 'all'\]\.includes\(process\.env\.CODE_ROLLOUT\) \? process\.env\.CODE_ROLLOUT : 'founder'/);
  assert.match(server, /code: CODE_ROLLOUT \}\);/);
  assert.match(read('src/main.js'), /rollout === 'founder' && !!account\.founder/);
});

console.log('\nthe screen\'s state, from a real session:');

const base = mkdtempSync(join(tmpdir(), 'y3k-code-client-'));
const repo = join(base, 'repo');
mkdirSync(repo);
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
const store = createStore(join(base, 'config'));
store.setConfig({ signIn: true });
const engine = createEngine({ store, consent: fixedConsent(true), env: { ...process.env, FAKE_CLAUDE_LOG: join(base, 'log') }, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') } });
const S = createState();
const seen = [];
engine.subscribe((e) => { seen.push(e); apply(S, e); });
const until = (pred, ms = 8000) => new Promise((res, rej) => {
  if (seen.some(pred)) return res();
  const t = setTimeout(() => { un(); rej(new Error('timed out')); }, ms);
  const un = engine.subscribe((e) => { if (pred(e)) { clearTimeout(t); un(); res(); } });
});
await engine.handle({ cmd: 'workspace.open', path: repo });
const st = await engine.handle({ cmd: 'session.start', provider: 'claude', cwd: repo, mode: 'ask' });
S.active = st.sid;
await engine.handle({ cmd: 'session.send', sid: st.sid, text: 'change world to y3k' });
await until((e) => e.type === 'permission.request');
const s = activeSession(S);

await ok('a permission waiting lights the glyph and is the card the keyboard answers', () => {
  assert.equal(needsYou(S), true);
  const req = openRequest(s);
  assert.equal(req.kind, 'permission');
  assert.equal(req.tkind, 'edit');
  assert.deepEqual(req.preview.diff[0].hunks[0].lines, [' hello', '-world', '+y3k']);
  const tool = s.byKey.get('t:' + req.callId);
  assert.equal(tool.status, 'waiting');
});

await engine.handle({ cmd: 'permission.answer', sid: st.sid, requestId: openRequest(s).requestId, decision: 'allow' });
await until((e) => e.type === 'turn.ended');
await until((e) => e.type === 'usage.context' && e.source === 'context');

await ok('after allowing: the transcript reads in order, the edit carries its diff', () => {
  const kinds = s.items.map((i) => (i.kind === 'tool' ? `tool:${i.name}` : i.kind));
  assert.equal(kinds[0], 'user');
  assert.ok(kinds.indexOf('tool:Read') < kinds.indexOf('tool:Edit'), kinds.join(' '));
  assert.ok(kinds.indexOf('tool:Edit') < kinds.indexOf('permission'));
  assert.equal(kinds.at(-1), 'assistant');
  const edit = s.items.find((i) => i.kind === 'tool' && i.name === 'Edit');
  assert.equal(edit.status, 'ok');
  assert.deepEqual(edit.diff[0].hunks[0].lines, [' hello', '-world', '+y3k']);
  assert.equal(s.items.find((i) => i.kind === 'permission').resolved, 'allow');
  assert.equal(needsYou(S), false);
  assert.equal(openRequest(s), null);
});

await ok('the meters: context, 5-hour and weekly limits, cost', () => {
  assert.equal(s.usage.context.used, 21218);
  assert.equal(s.usage.context.percent, 11);
  assert.deepEqual(s.usage.limits.windows.map((w) => w.kind), ['five_hour', 'seven_day']);
  assert.ok(s.usage.cost.totalUsd > 0);
  assert.equal(s.state, 'idle');
});

await ok('streamed text and the finished block agree', () => {
  const last = s.items.filter((i) => i.kind === 'assistant').at(-1);
  const text = last.blocks.filter((b) => b.kind === 'text').map((b) => b.text).join('');
  assert.ok(text.length > 0);
  assert.equal(last.done, true);
});

await engine.handle({ cmd: 'session.send', sid: st.sid, text: 'now plan it' });
await until((e) => e.type === 'turn.ended' && e.seq > seen.find((x) => x.type === 'message.user' && x.text === 'now plan it').seq);

await ok('todos and a subagent with its own tool, nested under it', () => {
  assert.deepEqual(s.todos.map((t) => t.status), ['completed', 'in_progress', 'pending']);
  const task = s.items.find((i) => i.kind === 'tool' && i.name === 'Task');
  assert.ok(task, 'the Task card');
  assert.equal(task.tkind, 'task');
  assert.ok(task.children.some((c) => c.kind === 'tool' && c.name === 'Grep' && c.status === 'ok'), 'Grep nested inside');
  assert.ok(task.children.some((c) => c.kind === 'assistant'), 'the subagent\'s words nested inside');
  assert.ok(!s.items.some((i) => i.kind === 'tool' && i.name === 'Grep'), 'not at the top level');
  assert.equal(task.status, 'ok');
  assert.equal(s.agents.size, 1, 'one subagent, announced once');
  assert.equal([...s.agents.values()][0].status, 'completed');
});

await engine.handle({ cmd: 'session.send', sid: st.sid, text: 'go slow' });
await until((e) => e.type === 'message.delta' && /Working/.test(e.text));
await engine.handle({ cmd: 'session.interrupt', sid: st.sid });
await until((e) => e.type === 'turn.ended' && e.status === 'interrupted');

await ok('stopping mid-turn says so', () => {
  assert.equal(s.items.at(-1).kind, 'turn-end');
  assert.equal(s.items.at(-1).status, 'interrupted');
});

await ok('a session reloaded from disk builds the same transcript', async () => {
  const r = await engine.handle({ cmd: 'session.load', sid: st.sid });
  const S2 = createState();
  for (const e of r.events) apply(S2, e, { replay: true });
  const s2 = S2.sessions.get(st.sid);
  const shape = (x) => x.items.map((i) => `${i.kind}:${i.name || ''}:${i.status || i.resolved || ''}`);
  assert.deepEqual(shape(s2), shape(s));
  const txt = (x) => x.items.filter((i) => i.kind === 'assistant').map((i) => i.blocks.map((b) => b.text).join('')).join('|');
  assert.equal(txt(s2), txt(s));
});

await ok('events already seen are ignored (a reconnect may replay them)', () => {
  const before = s.items.length;
  for (const e of seen.slice(-20)) apply(S, e);
  assert.equal(s.items.length, before);
});

await engine.handle({ cmd: 'session.stop', sid: st.sid });
await until((e) => e.type === 'session.ended');
engine.shutdown();
rmSync(base, { recursive: true, force: true });

// --- y3kode's front door (src/code/onboard.js) --------------------------------
// The first-run card, the copied command, the watch that pairs by itself, and
// sign-in over keys — drawn into a small stand-in DOM (enough for dom.js's h()).
console.log('\ny3kode\'s front door:');
{
  class FakeNode {
    constructor() { this.childNodes = []; this.parentNode = null; }
    appendChild(c) { c.parentNode?.removeChild(c); this.childNodes.push(c); c.parentNode = this; return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
    remove() { this.parentNode?.removeChild(this); }
    get firstChild() { return this.childNodes[0] || null; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === fakeBody; }
    get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; this.appendChild(new FakeText(String(v))); }
  }
  class FakeText extends FakeNode { constructor(t) { super(); this.data = t; } get textContent() { return this.data; } }
  class FakeEl extends FakeNode {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.attrs = {}; this.className = ''; this.style = {}; this.dataset = {}; this.on = {}; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(t, f) { (this.on[t] ||= []).push(f); }
    removeEventListener() {}
    click() { for (const f of this.on.click || []) f({ currentTarget: this, preventDefault() {} }); }
    select() {}
  }
  const fakeBody = new FakeEl('body');
  globalThis.Node = FakeNode;
  globalThis.document = { body: fakeBody, createElement: (t) => new FakeEl(t), createElementNS: (ns, t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), execCommand: () => false, addEventListener() {}, removeEventListener() {} };
  const opened = [];
  globalThis.window = { open: (url, name) => { opened.push([url, name]); return {}; }, addEventListener() {}, removeEventListener() {} };
  const clipboard = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { clipboard.push(t); } } });
  const all = (el, pred, out = []) => { for (const c of el.childNodes || []) { if (c instanceof FakeEl) { if (pred(c)) out.push(c); all(c, pred, out); } } return out; };
  const byClass = (el, cls) => all(el, (e) => e.className.split(' ').includes(cls));
  const byText = (el, tag, text) => all(el, (e) => e.tagName === tag && e.textContent.includes(text));
  const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

  const { createOnboard, authOf, needsSetup, startCommand, watchForEngine, SIGN_IN_TOOLS } = await import('../src/code/onboard.js');
  const { randomCode, PAIR_ALPHABET } = await import('../src/code/transport.js');
  const CODE8 = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

  await ok('the laptop glyph\'s hover name is "kode"; the product is y3kode', () => {
    const btn = /<button id="nav-code"[^>]*>/.exec(read('index.html'))[0];
    assert.match(btn, /title="kode"/);
    assert.match(btn, /aria-label="kode"/);
    // Line by line, not by pairing quotes across the file: one stray quote or
    // backtick (a regex, an apostrophe in a template) shifts every pair after it.
    const code = (f) => read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, ''));
    for (const l of code('src/code/onboard.js')) assert.ok(!/y3k Code/.test(l), `onboard.js: ${l.trim()}`);
    const view = code('src/code/code-view.js').join('\n');
    for (const s of ['Not connected to y3kode on this computer.', 'Connecting to y3kode on this computer…', 'y3kode is not answering on this computer',
      'The first time, y3kode asks you', 'y3kode remembers it for this folder.', 'y3kode starts the tool you signed into']) assert.ok(view.includes(s), s);
    const tr = code('src/code/transport.js').join('\n');
    assert.ok(tr.includes('Could not reach y3kode on this computer.') && tr.includes('y3kode on this computer is not answering.'));
    assert.ok(!/'[^'\n]*y3k Code[^'\n]*'/.test(tr), 'transport.js shows no "y3k Code"');
  });

  await ok('the page makes the pairing code: 8 letters from the alphabet, every letter equally likely', () => {
    assert.equal(PAIR_ALPHABET.length, 31);
    for (let i = 0; i < 200; i++) assert.match(randomCode(), CODE8);
    // bytes of 248 and up are dropped (256 is not a multiple of 31)
    const feed = [[255, 248, 0, 30, 31, 61, 62, 247, 1, 2, 3, 4, 5, 6, 7, 8]];
    // 255, 248 dropped · 0 A · 30 9 · 31 A · 61 9 · 62 A · 247 9 · 1 B · 2 C
    assert.equal(randomCode(() => feed.shift() || new Array(16).fill(0)), 'A9A9A9BC');
  });

  await ok('a tool\'s state: signed in, signed out (and the older signin-off), not installed, checking', () => {
    assert.equal(authOf({ id: 'claude', installed: true, auth: 'ok' }), 'ok');
    assert.equal(authOf({ id: 'claude', installed: true, auth: 'signed-out' }), 'signed-out');
    assert.equal(authOf({ id: 'claude', installed: true, auth: 'signin-off' }), 'signed-out');
    assert.equal(authOf({ id: 'codex', installed: false, auth: 'signed-out' }), 'not-installed');
    assert.equal(authOf({ id: 'gemini', installed: null, auth: ['apiKey'] }), 'checking');
    assert.equal(authOf({ id: 'claude', installed: true, auth: ['apiKey', 'subscription'], account: { state: 'signed-in' } }), 'ok');
    assert.equal(authOf({ id: 'claude', installed: true, auth: ['apiKey', 'subscription'], account: { state: 'signed-out' } }), 'signed-out');
    assert.ok(needsSetup({ id: 'claude', installed: true, auth: 'signed-out' }));
    assert.ok(!needsSetup({ id: 'opencode', installed: true, auth: 'unknown' }), 'an unknown state never blocks a start');
    assert.deepEqual([...SIGN_IN_TOOLS].sort(), ['claude', 'codex', 'gemini']);
  });

  await ok('the watch pairs with the code only where the engine says it was started with one', async () => {
    const asked = [];
    let polls = 0;
    const probeFn = async (port, o = {}) => {
      if (o.token) return null;
      if (port === 5001) return { port, name: 'y3k-code' };                         // started some other way
      if (port === 5002 && polls >= 2) return { port, name: 'y3k-code', preapproved: true };
      return null;
    };
    const found = await new Promise((resolve) => {
      watchForEngine({ code: 'ABCD2345', ports: [5001, 5002], every: 1, probeFn, wait: async () => { polls++; await tick(1); },
        pairFn: async (port, code) => { asked.push([port, code]); return { ok: true, token: 't0k' }; }, onFound: resolve });
    });
    assert.deepEqual(found, { port: 5002, token: 't0k', how: 'code' });
    assert.deepEqual(asked, [[5002, 'ABCD2345']], 'the engine not started with the code is never sent it');
    const back = await new Promise((resolve) => {
      watchForEngine({ code: 'ABCD2345', token: 'saved', ports: [5003], probeFn: async (port, o = {}) => ({ port, name: 'y3k-code', paired: o.token === 'saved' }),
        pairFn: async () => assert.fail('a saved token that still works needs no code'), onFound: resolve });
    });
    assert.deepEqual(back, { port: 5003, token: 'saved', how: 'token' });
    let ended = false;
    let now = 0;
    await new Promise((resolve) => {
      watchForEngine({ code: 'ABCD2345', ports: [5004], probeFn: async () => null, now: () => now, forMs: 10, wait: async () => { now += 5; }, onEnd: () => { ended = true; resolve(); } });
    });
    assert.ok(ended, 'it stops looking after its time');
  });

  const setupAnswer = { ok: true, command: 'npx -y https://site.test/code/dl/T0KEN/y3k-code.tgz', download: '/api/code/engine.tgz', appUrl: null };
  const mkOb = (extra = {}) => {
    const box = new FakeEl('div');
    fakeBody.appendChild(box);
    const watches = [];
    const env = { setup: async () => setupAnswer, cmd: async () => ({ ok: true }), toast() {}, redraw: () => { draw(); }, redrawTools() {}, providersChanged() {},
      connected() {}, pairWith() {}, forgetPairing() {}, retryDesktop() {}, watchFn: (o) => { watches.push(o); return { live: true, stop() {} }; }, ...extra };
    const ob = createOnboard(env);
    let view = () => ob.firstRun();
    function draw() { box.childNodes = []; box.appendChild(view()); }
    return { ob, box, watches, draw, show(fn) { view = fn; draw(); } };
  };

  await ok('the first-run card offers both ways in, one button each', async () => {
    const t = mkOb();
    t.draw();
    await tick();
    const text = t.box.textContent;
    assert.match(text, /Get y3kode on this computer/);
    assert.match(text, /Use the y3k app — y3kode is built in/);
    assert.match(text, /Or start it from Terminal/);
    assert.equal(byText(t.box, 'BUTTON', 'Open the y3k app').length, 1);
    assert.equal(byText(t.box, 'BUTTON', 'Copy the start command').length, 1);
    assert.match(text, /Needs Node\.js 20 or newer/);
    assert.equal(all(t.box, (e) => e.tagName === 'A' && e.attrs.href === 'https://nodejs.org').length, 1, 'Get Node.js');
    assert.equal(all(t.box, (e) => e.tagName === 'A' && e.attrs.href === '/api/code/engine.tgz' && /Download the file instead/.test(e.textContent)).length, 1);
  });

  await ok('Copy the start command copies the command ending in --pair <its own code>, then waits by itself', async () => {
    const t = mkOb();
    t.draw();
    await tick();
    clipboard.length = 0;
    byText(t.box, 'BUTTON', 'Copy the start command')[0].click();
    await tick();
    assert.equal(clipboard.length, 1);
    const m = /^npx -y https:\/\/site\.test\/code\/dl\/T0KEN\/y3k-code\.tgz --pair ([A-Z2-9]{8})$/.exec(clipboard[0]);
    assert.ok(m && CODE8.test(m[1]), clipboard[0]);
    assert.equal(t.watches.length, 1, 'the watch starts on the click');
    assert.equal(t.watches[0].code, m[1], 'and pairs with the code it copied');
    assert.equal(byClass(t.box, 'ob-steps')[0].childNodes.length, 3, 'Open Terminal · Paste · Press Return');
    assert.match(t.box.textContent, /Waiting for y3kode to start/);
    assert.equal(byClass(t.box, 'ob-cmd')[0].textContent, clipboard[0]);
    assert.equal(startCommand({ command: ' npx -y x ' }, 'ABCD2345'), 'npx -y x --pair ABCD2345');
  });

  await ok('no start command from the site: the older way, with its code box', async () => {
    const t = mkOb({ setup: async () => null });
    t.draw();
    await tick();
    assert.match(t.box.textContent, /node y3k-code\/bin\/y3k-code\.mjs/);
    assert.equal(byText(t.box, 'BUTTON', 'Copy the start command').length, 0);
    assert.equal(byClass(t.box, 'cv-code').length, 1, 'the code box');
  });

  const claudeOut = { id: 'claude', label: 'Claude Code', vendor: 'Anthropic', ready: true, installed: true, auth: 'signed-out', loginCommand: 'claude', keySet: false, keyUrl: 'https://console.anthropic.com/settings/keys' };
  await ok('a signed-out Claude Code shows the sign-in steps with `claude` — and no key field', async () => {
    const t = mkOb();
    t.show(() => t.ob.toolRow(claudeOut));
    const text = t.box.textContent;
    assert.match(text, /Sign in to Claude Code first: open Terminal, run claude, sign in, then come back\./);
    assert.equal(byClass(byClass(t.box, 'ob-signin')[0], 'cm')[0].textContent, 'claude');
    assert.equal(all(t.box, (e) => e.tagName === 'INPUT').length, 0, 'no key field');
    assert.equal(byText(t.box, 'BUTTON', 'Check again').length, 1);
    assert.equal(byText(t.box, 'BUTTON', 'Copy').length, 1);
    assert.equal(byClass(t.box, 'ob-usekey').length, 1, 'a key only if they ask for one');
    t.show(() => t.ob.toolGate(claudeOut));
    assert.match(t.box.textContent, /^Sign in to Claude Code first/);
    assert.equal(all(t.box, (e) => e.tagName === 'INPUT').length, 0);
    t.show(() => t.ob.toolRow({ ...claudeOut, auth: 'ok' }));
    assert.match(t.box.textContent, /Signed in ✓/);
  });

  await ok('a key chosen for Claude Code and none saved: the key field, and the way back to the sign-in', async () => {
    const sent = [];
    let got = null;
    const t = mkOb({ cmd: async (o) => { sent.push(o); return { ok: true, providers: [{ ...claudeOut, auth: 'ok' }] }; }, providersChanged: (l) => { got = l; } });
    t.show(() => t.ob.toolRow({ ...claudeOut, auth: 'needs-key' }));
    assert.equal(all(t.box, (e) => e.tagName === 'INPUT' && e.attrs.type === 'password').length, 1, 'the key they chose to use');
    byText(t.box, 'BUTTON', 'Use my sign-in instead')[0].click();
    await tick();
    assert.deepEqual(sent, [{ cmd: 'provider.clearKey', provider: 'claude' }]);
    assert.equal(got?.[0]?.auth, 'ok');
    const oc = { id: 'opencode', label: 'OpenCode', vendor: 'OpenCode', ready: true, installed: true, auth: 'needs-key', keySet: false };
    t.show(() => t.ob.toolSetup(oc));
    assert.equal(byText(t.box, 'BUTTON', 'Use my sign-in instead').length, 0, 'the open models have no sign-in to go back to');
  });

  await ok('an open-model provider through OpenCode still asks for its key', async () => {
    const t = mkOb();
    const oc = { id: 'opencode', label: 'OpenCode', vendor: 'OpenCode', ready: true, installed: true, auth: 'needs-key', via: [
      { id: 'openrouter', label: 'OpenRouter', keySet: false, keyUrl: 'https://openrouter.ai/keys' }, { id: 'deepseek', label: 'DeepSeek', keySet: false }, { id: 'ollama', label: 'Ollama', local: true }] };
    t.show(() => t.ob.toolRow(oc));
    const keys = all(t.box, (e) => e.tagName === 'INPUT' && e.attrs.type === 'password');
    assert.equal(keys.length, 2, 'one per keyed provider, none for Ollama');
    t.show(() => t.ob.toolGate(oc));
    assert.equal(all(t.box, (e) => e.tagName === 'INPUT').length, 2);
  });

  await ok('a consent pending on a companion offers the approval window; the app says look at your computer', async () => {
    const t = mkOb();
    t.show(() => t.ob.consentNote({ kind: 'folder.trust' }, { kind: 'companion', port: 47823 }));
    const b = byText(t.box, 'BUTTON', 'Open the approval window');
    assert.equal(b.length, 1);
    opened.length = 0;
    b[0].click();
    assert.deepEqual(opened, [['http://127.0.0.1:47823/approve', 'y3k-approve']]);
    t.show(() => t.ob.consentNote({ kind: 'folder.trust' }, { kind: 'desktop' }));
    assert.equal(byText(t.box, 'BUTTON', 'Open the approval window').length, 0);
    assert.match(t.box.textContent, /Look at your computer/);
    t.show(() => t.ob.pairingScreen({ status: 'asking', port: 47824 }, { retry() {}, back() {} }));
    opened.length = 0;
    byText(t.box, 'BUTTON', 'Open the approval window')[0].click();
    assert.deepEqual(opened, [['http://127.0.0.1:47824/approve', 'y3k-approve']]);
  });

  await ok('the pairing screen keeps its error, and tries again with the port it had', async () => {
    const t = mkOb();
    const tried = [];
    t.show(() => t.ob.pairingScreen({ status: 'error', port: 47825, code: 'ABCD2345', msg: 'That code expired.', http: 410 }, { retry: (c) => tried.push(c), back() {} }));
    assert.match(t.box.textContent, /That code expired\./);
    byText(t.box, 'BUTTON', 'Try again')[0].click();
    assert.deepEqual(tried, ['ABCD2345']);
    assert.match(t.box.textContent, /port 47825/);
  });

  await ok('one click back to work: Continue in <folder> · <tool> · <mode>', () => {
    const t = mkOb();
    let went = 0;
    t.show(() => t.ob.continueButton({ folder: 'y3k', tool: 'Claude', mode: 'ask', onGo: () => { went++; } }));
    const b = byClass(t.box, 'ob-continue')[0];
    assert.equal(b.textContent, 'Continue in y3k · Claude · ask');
    b.click();
    assert.equal(went, 1);
  });

  await ok('Open the y3k app: the app taking the front says so (late is fine); Firefox goes through a hidden frame', async () => {
    const heard = {};
    const realAdd = globalThis.window.addEventListener;
    globalThis.window.addEventListener = (type, f) => { (heard[type] ||= []).push(f); };
    try {
      const t = mkOb({ setup: async () => ({ ...setupAnswer, appUrl: 'https://site.test/app' }) });
      t.draw();
      await tick();
      byText(t.box, 'BUTTON', 'Open the y3k app')[0].click();
      assert.match(t.box.textContent, /Opening the y3k app…/);
      for (const f of heard.blur) f();
      assert.match(t.box.textContent, /The y3k app is open/);
      byText(t.box, 'BUTTON', 'Didn\'t open?')[0].click();
      assert.equal(all(t.box, (e) => e.tagName === 'A' && e.attrs.href === 'https://site.test/app' && e.textContent === 'Download the app').length, 1);
      for (const f of heard.blur) f();   // the browser's own "Open y3k?" answered late
      assert.match(t.box.textContent, /The y3k app is open/);
      Object.defineProperty(globalThis.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/131.0' });
      byText(t.box, 'BUTTON', 'Open the y3k app')[0].click();
      const frames = all(fakeBody, (e) => e.tagName === 'IFRAME');
      assert.equal(frames.length, 1);
      assert.equal(frames[0].attrs.src, 'y3k://code');
      frames[0].remove();
    } finally {
      globalThis.window.addEventListener = realAdd;
      delete globalThis.navigator.userAgent;
    }
  });

  await ok('"Try again" finds the paired engine on another port, and forgets the pairing only when an engine says so', async () => {
    const { findPaired } = await import('../src/code/transport.js');
    const realFetch = globalThis.fetch;
    let tokenAnswer = 'reply';   // reply | hang (the answer with the token never comes back in time)
    globalThis.fetch = async (url, o = {}) => {
      if (!url.startsWith('http://127.0.0.1:47826/v1/hello')) throw new TypeError('Failed to fetch'); // nobody on the other nine
      const bearer = o.headers?.authorization;
      if (bearer && tokenAnswer === 'hang') throw new DOMException('aborted', 'AbortError');
      return { json: async () => ({ name: 'y3k-code', paired: bearer === 'Bearer good' }) };
    };
    try {
      const hit = await findPaired('good');
      assert.equal(hit.engine?.port, 47826, 'the engine came back on another of the ten');
      assert.deepEqual(await findPaired('stale'), { refused: true }, 'it answered, and does not know this token');
      tokenAnswer = 'hang';
      assert.deepEqual(await findPaired('good'), {}, 'a slow answer is not a no: the pairing stays');
      assert.deepEqual(await findPaired(null), {});
    } finally { globalThis.fetch = realFetch; }
  });

  await ok('main.js: #code opens y3kode after sign-in; its modules are fetched soon after the glyph shows', () => {
    const main = read('src/main.js');
    assert.match(main, /let codeAsked = location\.hash === '#code';/);
    assert.match(main, /if \(pendingPairing\(\) \|\| codeAsked\) \{ codeAsked = false; openCodeRoom\(\); return; \}/);
    // y3k://code into an app window already on the room: the fragment changes, no reload
    const onHash = main.slice(main.indexOf("window.addEventListener('hashchange'"));
    assert.ok(onHash.length < main.length, 'a hashchange listener');
    assert.match(onHash.slice(0, 400), /location\.hash !== '#code'[\s\S]*hidden === false\) openCodeRoom\(\); else codeAsked = true;/);
    assert.match(main, /setTimeout\(\(\) => \{ import\('\.\/code\/code-view\.js'\)/);
    assert.ok(!/requestIdleCallback/.test(main.slice(main.indexOf('async function revealCode'), main.indexOf('function openCodeRoom')).replace(/^\s*\/\/.*$/gm, '')));
    assert.match(main, /fetch\('\/api\/code\/setup'/, 'the site is asked from main.js, never from src/code');
  });
  delete globalThis.document; delete globalThis.window; delete globalThis.Node;
}
console.log(`\n${passed} checks passed.`);
process.exit(0);
