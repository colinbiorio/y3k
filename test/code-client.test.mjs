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
console.log(`\n${passed} checks passed.`);
process.exit(0);
