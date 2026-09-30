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

// --- RENDERING: smooth, flicker-free, keeps your typing -------------------------------
// The screen itself, run under a small stand-in DOM (test/fakes/mini-dom.mjs):
// a streaming reply is drawn into one element whose finished blocks are drawn
// once and which reads, at every step, as a whole render of the same text
// would; nothing already on screen replays its rise; the composer, the toolbar
// and a scrolled-up reader all survive the events of a running turn; a long
// session opens in slices. scripts/code-smoke.mjs checks the same in Chromium.
console.log('\nrendering: smooth, flicker-free, keeps your typing:');
const { installDom, serialize } = await import('./fakes/mini-dom.mjs');
installDom();
const { markdown, mdStream, scanBlocks } = await import('../src/code/render/markdown.js');
const { renderItem, updateItem, childrenOf, agentLine } = await import('../src/code/render/items.js');
const meters = await import('../src/code/render/meters.js');
const kidsOf = (el) => el.childNodes.map(serialize).join('');

// Everything the block renderer knows: paragraphs, loose and nested lists, a
// list running into a fence, both fence kinds, an indented fence, a quote, a
// table, a heading, a rule, task boxes, and an unclosed fence at the end.
const MD_CORPUS = [
  'Here is the plan.\n\n1. Read the file\n2. Change the line\n\n   still item two, indented\n\n3. Run the tests\n   - nested one\n   - nested two\n\nThen:\n\n```js\nconst x = 1;\nfunction f(a) { return a * 2; }\n```\n\n> a quote\n> over two lines\n\n| a | b |\n|---|:-:|\n| 1 | 2 |\n\n## Done\n---\ntext right after\n~~~~py\ndef g():\n    return "```"\n~~~~\n  ```sh\n  echo indented fence\n  ```\n- a\n- b\n\n- c after a blank\ntail words',
  'para one\npara one continued\n```\nunclosed fence body\nmore',
  '- item\n```\ncode right after a list\n```\n\n- [ ] task\n- [x] done task\n\nplain',
  '* a\n  continuation\n\n  more indented para\n* b',
];

await ok('scanBlocks cuts only where drawing the two halves apart draws the same', () => {
  let n = 0;
  for (const full of MD_CORPUS) {
    for (let i = 1; i <= full.length; i++) {
      const text = full.slice(0, i);
      const st = scanBlocks(text);
      if (st.fence) continue; // an open fence is drawn live, not by markdown()
      assert.equal(kidsOf(markdown(text.slice(0, st.cut))) + kidsOf(markdown(text.slice(st.cut))), kidsOf(markdown(text)), JSON.stringify(text));
      n++;
    }
  }
  assert.ok(n > 300, 'enough prefixes were checked: ' + n);
});

await ok('a streaming reply reads as a whole render at every step, and its finished blocks are drawn once', () => {
  for (const full of MD_CORPUS) {
    for (const step of [1, 4, 11]) {
      const m = mdStream();
      let first = null;
      let firstMoved = 0;
      for (let i = step; i < full.length + step; i += step) {
        const text = full.slice(0, Math.min(i, full.length));
        m.update(text, false);
        const st = scanBlocks(text);
        if (!st.fence) assert.equal(kidsOf(m.el), kidsOf(markdown(text)), `step ${step}: ${JSON.stringify(text.slice(-30))}`);
        // once the first block is finished (a cut lies past it), it is never drawn again
        if (first && m.el.firstChild !== first) firstMoved++;
        if (!first && st.cut > 0) first = m.el.firstChild;
      }
      assert.equal(firstMoved, 0, 'the first finished block was redrawn');
      m.update(full, true);
      assert.equal(kidsOf(m.el), kidsOf(markdown(full)), 'the final pass is the whole render');
    }
  }
});

await ok('an open code fence is one text node that grows in place, and is coloured when it closes', () => {
  const m = mdStream();
  m.update('Intro.\n\n```js\nconst a = 1;\nlet b', false);
  const code = m.el.querySelector('pre.md-pre code');
  assert.ok(code, 'the fence shows while it is still open');
  assert.equal(code.childNodes.length, 1);
  const t = code.firstChild;
  assert.equal(t.nodeType, 3, 'plain text while it streams');
  assert.equal(t.data, 'const a = 1;\nlet b');
  m.update('Intro.\n\n```js\nconst a = 1;\nlet b = 2;\n``', false);
  assert.equal(m.el.querySelector('pre.md-pre code').firstChild, t, 'the same node, not a new one');
  assert.equal(t.data, 'const a = 1;\nlet b = 2;', 'a closing fence half-typed is not shown as code');
  assert.equal(m.el.querySelectorAll('span.tk-k').length, 0, 'not coloured mid-stream');
  m.update('Intro.\n\n```js\nconst a = 1;\nlet b = 2;\n```\n\nAfter', false);
  assert.ok(m.el.querySelectorAll('span.tk-k').length >= 2, 'coloured once it closed');
  assert.equal(kidsOf(m.el), kidsOf(markdown('Intro.\n\n```js\nconst a = 1;\nlet b = 2;\n```\n\nAfter')));
});

const noCtx = { agentName: 'Claude', companionName: 'orion', canPass: false, passTo() {}, renderChild: (c) => renderItem(c, noCtx), answerPermission() {}, answerQuestion() {} };

await ok('signed out: the fix as steps, with what to type set apart; the turn says it was not sent', () => {
  const el = renderItem({ uid: 9100, kind: 'notice', level: 'error', code: 'signed-out', text: 'x' }, noCtx);
  assert.ok(el.classList.contains('cv-signedout'));
  assert.match(el.textContent, /Claude Code is signed out on this computer\./);
  assert.deepEqual([...el.querySelectorAll('code')].map((c) => c.textContent), ['claude', '/login']);
  const end = renderItem({ uid: 9101, kind: 'turn-end', status: 'error', error: 'Failed to authenticate. API Error: 401 …', auth: true }, noCtx);
  assert.equal(end.textContent, 'Not sent — Claude Code needs you to sign in again (see above).');
  assert.doesNotMatch(end.textContent, /API Error/);
});

await ok('a reply keeps its element for its whole life; thinking grows in place', () => {
  const it = { uid: 9001, kind: 'assistant', id: 'm1', blocks: [{ i: 0, kind: 'thinking', text: 'hmm', done: false, open_th: true }], done: false };
  const el = renderItem(it, noCtx);
  assert.ok(el.classList.contains('live'));
  const thought = el.querySelector('div.th-body').firstChild;
  it.blocks[0].text += ', let me see';
  it.blocks.push({ i: 1, kind: 'text', text: 'Hello **there**', done: false });
  assert.equal(updateItem(it, el, noCtx), el, 'patched, not replaced');
  assert.equal(el.querySelector('div.th-body').firstChild, thought, 'the thought is the same text node');
  assert.equal(thought.data, 'hmm, let me see');
  it.blocks[1].text += ' and more';
  it.done = true; it.blocks.forEach((b) => { b.done = true; });
  assert.equal(updateItem(it, el, noCtx), el);
  assert.ok(!el.classList.contains('live'));
  assert.equal(el.querySelector('span.th-head').textContent, 'thought');
  assert.equal(kidsOf(el.querySelector('div.md')), kidsOf(markdown('Hello **there** and more')));
  assert.ok(!el.classList.contains('enter'), 'the renderer never adds the rise; the view does, once');
});

await ok('folds build their body on first open; a long output colours only what shows until "show all"', () => {
  const body = Array.from({ length: 200 }, (_, k) => `const v${k} = ${k};`).join('\n');
  const read = { uid: 9002, kind: 'tool', tkind: 'read', name: 'Read', input: { file_path: 'a.js' }, status: 'ok', output: { text: body }, children: [] };
  const el = renderItem(read, noCtx);
  const fb = el.querySelector('div.fold-body');
  assert.equal(fb.childNodes.length, 0, 'a shut Read card holds none of its file');
  el.querySelector('button.fold-head').click();
  assert.ok(fb.childNodes.length > 0, 'built when opened');
  const code = fb.querySelector('pre.tl-out code');
  const coloured = code.querySelectorAll('span.tk-k').length;
  assert.ok(coloured > 0 && coloured <= 24, 'only the first lines are coloured: ' + coloured);
  assert.equal(code.textContent, body, 'every line is there, as text');
  fb.querySelector('button.tl-more').click();
  assert.equal(fb.querySelector('pre.tl-out code').querySelectorAll('span.tk-k').length, 200, 'all of it once asked');
});

await ok('a subagent\'s card: new items go into its list, its progress line changes in place', () => {
  const child = { uid: 9004, kind: 'user', text: 'inside' };
  const task = { uid: 9003, kind: 'tool', tkind: 'task', name: 'Task', input: { description: 'look around' }, status: 'running', children: [child], agent: { agentType: 'Explore', text: 'reading' } };
  const drawn = new Map();
  const ctx = { ...noCtx, renderChild: (c) => drawn.get(c.uid) || (drawn.set(c.uid, renderItem(c, noCtx)), drawn.get(c.uid)) };
  const el = renderItem(task, ctx);
  const kids = childrenOf(el);
  assert.ok(kids && kids.firstChild === drawn.get(9004), 'the child is the element the view handed over');
  agentLine(el, 'grepping');
  const prog = el.querySelector('span.ag-prog');
  assert.equal(prog.textContent, 'grepping');
  agentLine(el, 'reading more');
  assert.equal(el.querySelector('span.ag-prog'), prog, 'the same line, new words');
  // the head redrawn (the task finished): its children move across, not redrawn
  task.status = 'ok';
  const el2 = updateItem(task, el, ctx);
  assert.notEqual(el2, el);
  assert.equal(childrenOf(el2).firstChild, drawn.get(9004));
});

await ok('the model says no change for what nothing draws, nor for the card around a new subagent item', () => {
  const S3 = createState();
  const sid = 'r1';
  apply(S3, { sid, type: 'session.started', provider: 'claude', cwd: '/x', mode: 'ask' });
  apply(S3, { sid, type: 'tool.call', callId: 'c1', name: 'Bash', kind: 'bash', input: { command: 'ls' } });
  assert.deepEqual(apply(S3, { sid, type: 'tool.progress', callId: 'c1', text: 'a\nb' }).changed, [], 'progress is not drawn, so it changes nothing');
  apply(S3, { sid, type: 'tool.call', callId: 't1', name: 'Task', kind: 'task', input: {} });
  const out = apply(S3, { sid, type: 'message.delta', id: 'sub1', block: 0, kind: 'text', text: 'hi', parentCallId: 't1' });
  assert.deepEqual(out.changed.map((i) => i.kind), ['assistant'], 'the Task card is not redrawn for it');
  assert.equal(S3.sessions.get(sid).byKey.get('t:t1').children.length, 1);
  assert.equal(openRequest(S3.sessions.get(sid)), null);
});

await ok('the meters move in place, so their sweep and width transitions run', () => {
  const ring = meters.contextRing({ used: 1000, limit: 10000, percent: 10 });
  const dash = ring.querySelector('circle.mt-fill').getAttribute('stroke-dasharray');
  assert.equal(meters.updateRing(ring, { used: 5000, limit: 10000, percent: 50 }), ring);
  assert.notEqual(ring.querySelector('circle.mt-fill').getAttribute('stroke-dasharray'), dash);
  assert.equal(ring.querySelector('span.mt-num').textContent, '50%');
  const lim = { windows: [{ kind: 'five_hour', utilization: 0.2 }, { kind: 'seven_day', utilization: 0.5 }] };
  const bars = meters.limitBars(lim);
  const fill = bars.querySelector('span.mt-barfill');
  assert.equal(meters.updateBars(bars, { windows: [{ kind: 'five_hour', utilization: 0.4 }, { kind: 'seven_day', utilization: 0.5 }] }), bars);
  assert.equal(bars.querySelector('span.mt-barfill'), fill);
  assert.equal(fill.style.width, '40%');
  assert.notEqual(meters.updateBars(bars, { windows: [{ kind: 'seven_day', utilization: 0.5 }] }), bars, 'other windows: a new set');
  const cost = meters.costChip({ totalUsd: 0.5 });
  assert.equal(meters.updateCost(cost, { totalUsd: 1.25 }), cost);
  assert.equal(cost.textContent, '$1.25');
});

// The view itself, fed through its own event path, with a frame clock of our
// own. No ResizeObserver, no MessageChannel, no CSS.supports here: the
// fallbacks the view keeps for browsers without them are what run.
{
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  globalThis.MessageChannel = undefined;
  const tick = () => { for (const f of frames.splice(0)) f(0); };
  const tasks = async (pred, n = 400) => { for (let k = 0; k < n && !pred(); k++) await new Promise((r) => setTimeout(r, 0)); };
  const { createCodeView } = await import('../src/code/code-view.js');
  const cv = createCodeView({});
  const sid = 'view1';
  cv._feed({ sid, type: 'session.started', provider: 'claude', cwd: '/tmp/view1', mode: 'ask' });
  cv.open();
  tick();
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  await ok('the view: a streaming reply is one element, and rises in once', () => {
    let el0 = null;
    let rises = 0;
    const full = 'Streaming words arrive a few at a time, and **nothing** flickers.\n\n```js\nconst x = 1;\n```\n\n- one\n- two\n\nDone.';
    for (const w of full.match(/[\s\S]{1,6}/g)) {
      cv._feed({ sid, type: 'message.delta', id: 'mv1', block: 0, kind: 'text', text: w });
      tick();
      const el = $('div.cv-list > div.it.as');
      if (!el0) { el0 = el; rises = el.classList.contains('enter') ? 1 : 0; }
      assert.equal(el, el0, 'the reply was replaced mid-stream');
    }
    cv._feed({ sid, type: 'message.end', id: 'mv1' });
    tick();
    assert.equal($('div.cv-list > div.it.as'), el0);
    assert.equal(rises, 1, 'it rose in when it first appeared');
    assert.equal(kidsOf(el0.querySelector('div.md')), kidsOf(markdown(full)));
  });

  await ok('the view: typing survives a running turn — one textarea, focus, words; the toolbar is patched', () => {
    const ta = $('textarea.cv-input');
    ta.focus();
    ta.value = 'half a thought';
    ta.dispatch('input');
    const sel = $('div.cv-controls select');
    const tab = $('button.cv-tab.on');
    sel.focus();
    // the model list changes while its <select> is in use: the redraw waits
    cv._feed({ type: 'provider.status', provider: 'claude', models: [{ id: 'm-a', label: 'A' }, { id: 'm-b', label: 'B' }] });
    tick();
    assert.equal($('div.cv-controls select'), sel, 'a <select> in use is not redrawn');
    ta.focus();
    for (const e of [{ type: 'turn.started' }, { type: 'usage.context', used: 30000, limit: 200000 }, { type: 'todo.update', items: [{ content: 'a', status: 'in_progress', activeForm: 'doing a' }] },
      { type: 'usage.cost', totalUsd: 0.5 }, { type: 'git.status', branch: 'main', files: [] }, { type: 'session.state', state: 'running' }, { type: 'turn.ended', status: 'success' }]) {
      cv._feed({ sid, ...e });
      tick();
    }
    assert.equal($('textarea.cv-input'), ta, 'the same textarea');
    assert.equal(document.activeElement, ta, 'still focused');
    assert.equal(ta.value, 'half a thought');
    assert.equal($('button.cv-tab.on'), tab, 'the same tab');
    assert.ok($('details.cv-todos'), 'the todos came in beside it');
    ta.value = ''; ta.dispatch('input');
  });

  await ok('the view: a session in another tab lights its tab and touches nothing else', () => {
    const ta = $('textarea.cv-input');
    const row = $('div.cv-bar').firstChild;
    cv._feed({ sid: 'bg1', type: 'session.started', provider: 'claude', cwd: '/tmp/bg1', mode: 'ask' });
    tick();
    const before = $('div.cv-list').childNodes.slice();
    for (let k = 0; k < 5; k++) { cv._feed({ sid: 'bg1', type: 'message.delta', id: 'bgm', block: 0, kind: 'text', text: 'words ' }); tick(); }
    const bgTab = [...$$('button.cv-tab')].find((t) => t.title.includes('/tmp/bg1'));
    assert.ok(bgTab?.classList.contains('unread'), 'its tab is lit');
    assert.equal($('textarea.cv-input'), ta);
    assert.equal($('div.cv-bar').firstChild, row);
    assert.deepEqual($('div.cv-list').childNodes, before, 'the transcript on screen is untouched');
  });

  await ok('the view: a reader scrolled up is not pulled down, and a reconnect does not redraw', () => {
    const sc = $('div.cv-scroll');
    Object.assign(sc, { scrollHeight: 5000, clientHeight: 500, scrollTop: 1000 });
    sc.dispatch('scroll');
    const list = $('div.cv-list').childNodes.slice();
    cv._feed({ sid, type: 'message.delta', id: 'mv2', block: 0, kind: 'text', text: 'more' });
    tick();
    assert.equal(sc.scrollTop, 1000, 'left where they were reading');
    // the same session asked for again (a reconnect's hello; its own tab clicked)
    $('button.cv-tab.on').click();
    tick();
    assert.deepEqual($('div.cv-list').childNodes.slice(0, list.length), list, 'nothing drawn again');
    sc.scrollTop = 4500; sc.dispatch('scroll');
  });

  await ok('the view: a long session opens with a few items at once and the rest in slices; "show earlier" adds a page', async () => {
    cv._feed({ sid: 'long1', type: 'session.started', provider: 'claude', cwd: '/tmp/long1', mode: 'ask' });
    for (let i = 0; i < 800; i++) {
      cv._feed({ sid: 'long1', type: 'message.user', text: 'question ' + i });
      cv._feed({ sid: 'long1', type: 'message.block', id: 'l' + i, block: 0, kind: 'text', text: `answer **${i}**` });
      cv._feed({ sid: 'long1', type: 'message.end', id: 'l' + i });
    }
    tick();
    [...$$('button.cv-tab')].find((t) => t.title.includes('/tmp/long1')).click();
    const count = () => $$('div.cv-list > div.it').length;
    const atOnce = count();
    assert.ok(atOnce > 0 && atOnce <= 30, 'drawn at once: ' + atOnce);
    assert.ok($$('div.cv-list > div.it.enter').length <= 4, 'only the newest few rise in');
    await tasks(() => count() >= 400);
    assert.equal(count(), 400, 'the rest, in slices');
    assert.equal($('button.cv-older').textContent, 'show 1200 earlier');
    $('button.cv-older').click();
    await tasks(() => count() >= 500);
    assert.equal(count(), 500, 'one page more, not everything');
    assert.equal($('div.cv-list > div.it .us-text').textContent, 'question 550');
    assert.equal($('button.cv-older').textContent, 'show 1100 earlier');
  });
  cv.close();
}

await ok('the stylesheet: a rise only on entry, no frosted pane, motion on the compositor, stilled in smooth', () => {
  const css = read('styles.css');
  const code = css.slice(css.indexOf('/* ===== y3k CODE'));
  assert.match(code, /\n\.it \{ min-width: 0; \}/, '.it itself does not animate');
  assert.match(code, /\n\.it\.enter \{ animation: cv-rise /);
  const pane = code.slice(code.indexOf('.cv-pane {'), code.indexOf('}', code.indexOf('.cv-pane {')));
  assert.ok(!/backdrop-filter/.test(pane), 'the pane blurs nothing (its backdrop is opaque)');
  assert.ok(!/@property --cv-ang/.test(css), 'no registered-property orbit');
  assert.match(code, /@keyframes cv-orbit \{ from \{ transform: [^}]*\} to \{ transform: [^}]*rotate\(360deg\)/);
  assert.match(code, /@keyframes cv-ring \{ from \{ transform: scale\(1\); opacity: 1; \}/);
  assert.match(code, /\.th-shimmer \{[^}]*animation: cv-breathe/);
  assert.ok(!/@keyframes cv-shimmer/.test(code), 'the shimmer is not a moving background');
  const still = ':root:is([data-gfx="smooth"], [data-motion="less"])';
  for (const sel of [' .cv-orbit::before', ' .code-root .pm-pulse::after', ' .code-root :is(.th-shimmer, .td-spin, .cv-tabdot, .tl-status i, .cv-live)']) assert.ok(code.includes(still + sel), sel);
  assert.match(code, /\.cv-scroll \{ contain: strict; \}/);
  assert.match(code, /content-visibility: auto; contain-intrinsic-size: auto 160px;/);
  assert.match(code, /body\.code-shifting #stage \{ opacity: 0; \}/);
  assert.match(code, /body:is\(\.code-shifting, \.code-settling\) #stage \{ transition: opacity 0\.2s ease; \}/);
  assert.match(code, /animation: cv-in 0\.2s ease; \}/);
  assert.match(code, /\.code-root\.leaving \{ opacity: 0; transition: opacity 0\.2s ease;/);
});

await ok('entering or leaving Code: the orb column hides in the same task that moves it, and comes back when the orb has drawn', () => {
  const social = read('src/social.js');
  const at = social.indexOf("b.classList.add('code-shifting')");
  assert.ok(at > 0 && at < social.indexOf("toggle('in-code', v === 'code')"), 'code-shifting is set before in-code');
  assert.match(social, /window\.addEventListener\('y3k:orb-resized', onDrawn\)/);
  assert.match(social, /setTimeout\(\(\) => \{ window\.removeEventListener\('y3k:orb-resized', onDrawn\); drawn = true; show\(\); \}, 500\)/, 'and a timeout, if it never says');
  assert.ok(!/classList\.add\('code-shifting'\)/.test(read('src/code/code-view.js')), 'no second, later hide from the view');
});

await ok('the view: one composer; flush writes and never reads the layout; no idle callbacks', () => {
  const view = read('src/code/code-view.js');
  assert.equal(view.split("h('textarea.cv-input'").length, 2, 'the composer\'s textarea is made in one place');
  assert.ok(view.indexOf("h('textarea.cv-input'") > view.indexOf('function buildDock()'));
  const flushSrc = view.slice(view.indexOf('  function flush() {'), view.indexOf('\n  }\n', view.indexOf('  function flush() {')));
  assert.ok(!/getBoundingClientRect|nearBottom|offsetHeight|clientHeight/.test(flushSrc), 'flush reads no layout');
  assert.match(flushSrc, /if \(!ro && atBottom\)/, 'scrollHeight only where there is no ResizeObserver');
  for (const f of CODE_FILES) assert.ok(!/requestIdleCallback\(/.test(read(f).replace(/^\s*\/\/.*$/gm, '')), f);
});

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
      connected() {}, pairWith() {}, forgetPairing() {}, retryDesktop() {}, watchFn: (o) => { watches.push(o); return { live: true, stop() {} }; },
      platformFn: async () => ({ os: 'mac', arch: 'arm64', sure: true }), accessFn: async () => 'ok', ...extra };
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
    assert.match(text, /y3kode is better on desktop/);
    assert.match(text, /Or start it from Terminal/);
    assert.equal(byText(t.box, 'BUTTON', 'Open the y3k app').length, 1);
    assert.equal(byText(t.box, 'BUTTON', 'Copy the start command').length, 1);
    assert.match(text, /Needs Node\.js 20 or newer/);
    assert.equal(all(t.box, (e) => e.tagName === 'A' && e.attrs.href === 'https://nodejs.org').length, 1, 'Get Node.js');
    assert.equal(all(t.box, (e) => e.tagName === 'A' && e.attrs.href === '/api/code/engine.tgz' && /Download the file instead/.test(e.textContent)).length, 1);
  });

  const BUILDS = [
    ['mac', 'arm64', 'Mac · Apple silicon', 'y3k-mac-arm64.dmg'], ['mac', 'x64', 'Mac · Intel', 'y3k-mac-x64.dmg'],
    ['win', 'x64', 'Windows', 'y3k-win-x64.exe'], ['win', 'arm64', 'Windows on Arm', 'y3k-win-arm64.exe'],
    ['linux', 'x64', 'Linux', 'y3k-linux-x64.AppImage'], ['linux', 'arm64', 'Linux on Arm', 'y3k-linux-arm64.AppImage'],
  ];
  const builds = (base) => BUILDS.map(([os, arch, label, file]) => ({ os, arch, label, url: base ? base + '/' + file : null }));
  const dlLink = (box) => all(box, (e) => e.tagName === 'A' && /\bob-dl\b/.test(e.className || ''))[0];

  await ok('y3kode is better on desktop: the build for this computer is chosen, the other five one click away', async () => {
    const t = mkOb({ setup: async () => ({ ...setupAnswer, builds: builds('https://dl.test/latest') }),
      platformFn: async () => ({ os: 'mac', arch: 'x64', sure: true }) });
    t.draw();
    await tick(); await tick();
    let a = dlLink(t.box);
    assert.equal(a.attrs.href, 'https://dl.test/latest/y3k-mac-x64.dmg', 'the Intel Mac got another build');
    assert.equal(a.textContent, 'Download for Mac · Intel');
    const chips = all(t.box, (e) => e.tagName === 'BUTTON' && /\bob-build\b/.test(e.className || ''));
    assert.equal(chips.length, 6);
    assert.deepEqual(chips.filter((c) => c.attrs['aria-pressed'] === 'true').map((c) => c.textContent), ['Mac · Intelthis computer']);
    assert.match(t.box.textContent, /Chosen for this computer\./);
    // another computer, one click
    chips.find((c) => c.textContent.startsWith('Windows on Arm')).click();
    a = dlLink(t.box);
    assert.equal(a.attrs.href, 'https://dl.test/latest/y3k-win-arm64.exe');
    assert.equal(a.textContent, 'Download for Windows on Arm');
    // downloading says what the first open will say (the builds are not signed yet)
    a.click();
    assert.match(t.box.textContent, /Downloading y3k for Windows on Arm\. If Windows says it protected your PC, press More info, then Run anyway\./);
    assert.equal(byText(t.box, 'BUTTON', 'Open the y3k app').length, 1, 'having it already is still one click');
  });

  await ok('a guess says how to check; nothing published says so; a phone is told to use a computer', async () => {
    let t = mkOb({ setup: async () => ({ ...setupAnswer, builds: builds('https://dl.test') }), platformFn: async () => ({ os: 'mac', arch: 'arm64', sure: false }) });
    t.draw(); await tick(); await tick();
    assert.equal(dlLink(t.box).attrs.href, 'https://dl.test/y3k-mac-arm64.dmg');
    assert.match(t.box.textContent, /Our best guess for this computer\. To check: Apple menu → About This Mac/);
    t = mkOb({ setup: async () => ({ ...setupAnswer, builds: builds(null) }) });
    t.draw(); await tick(); await tick();
    const off = all(t.box, (e) => e.tagName === 'BUTTON' && /\bob-dl\b/.test(e.className || ''))[0];
    assert.ok(off && off.disabled, 'an unpublished build is a link to nothing');
    assert.match(t.box.textContent, /The desktop app isn’t published yet|The desktop app isn't published yet/);
    assert.equal(dlLink(t.box), undefined);
    t = mkOb({ setup: async () => ({ ...setupAnswer, builds: builds('https://dl.test') }), platformFn: async () => ({ os: 'ios', arch: null, sure: true }) });
    t.draw(); await tick(); await tick();
    assert.match(t.box.textContent, /open yearthreethousand\.com on your Mac or PC/);
    assert.equal(all(t.box, (e) => /\bob-(dl|build)\b/.test(e.className || '')).length, 0, 'a phone is offered a desktop download');
    assert.doesNotMatch(t.box.textContent, /Or start it from Terminal/, 'a phone is told to paste into a Terminal it does not have');
    // a url the page would not trust is never a link
    t = mkOb({ setup: async () => ({ ...setupAnswer, builds: builds(null).map((b) => ({ ...b, url: 'javascript:alert(1)' })) }) });
    t.draw(); await tick(); await tick();
    assert.equal(dlLink(t.box), undefined);
  });

  await ok('when the browser is the wall, the page says so: Safari never, Chrome after a No, and a heads-up before it asks', async () => {
    let t = mkOb({ accessFn: async () => 'blocked' });
    t.draw(); await tick(); await tick();
    assert.match(t.box.textContent, /Safari can't connect this page to y3kode\./);
    assert.match(t.box.textContent, /Open yearthreethousand\.com in Chrome, Edge or Firefox/);
    t = mkOb({ accessFn: async () => 'denied' });
    t.draw(); await tick(); await tick();
    assert.match(t.box.textContent, /Your browser is blocking this page from reaching y3kode\./);
    assert.match(t.box.textContent, /"Local network access"/);
    assert.equal(byText(t.box, 'BUTTON', 'Reload this page').length, 1);
    t = mkOb({ accessFn: async () => 'ok' });
    t.draw(); await tick(); await tick();
    assert.equal(all(t.box, (e) => /\bob-access\b/.test(e.className || '')).length, 0, 'a browser that lets it through is warned anyway');
  });

  await ok('a paired browser whose y3kode is not running is offered the desktop app too', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
      const t = mkOb({ setup: async () => ({ ...setupAnswer, builds: builds('https://dl.test') }), accessFn: async () => 'denied' });
      t.show(() => t.ob.notRunning({ transport: { kind: 'http', port: 47821 } }));
      await tick(); await tick();
      const text = t.box.textContent;
      assert.match(text, /y3kode isn't running on this computer/);
      assert.match(text, /y3kode is better on desktop/);
      assert.equal(dlLink(t.box).attrs.href, 'https://dl.test/y3k-mac-arm64.dmg');
      assert.match(text, /Your browser is blocking this page from reaching y3kode\./);
      assert.equal(byText(t.box, 'BUTTON', 'Try again').length, 1);
      assert.equal(byText(t.box, 'BUTTON', 'Open the y3k app').length, 1, 'once, in the card');
    } finally { globalThis.fetch = realFetch; }
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
      assert.equal(all(t.box, (e) => e.tagName === 'A' && e.attrs.href === 'https://site.test/app' && e.textContent === 'Download the y3k app').length, 1);
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
    assert.match(onHash.slice(0, 800), /location\.hash !== '#code'[\s\S]*hidden === false\) openCodeRoom\(\); else codeAsked = true;/);
    assert.match(onHash.slice(0, 800), /y3k-code=[\s\S]*takePairingFromHash\(\)/, 'a pairing link landing on an open tab is taken too');
    assert.match(main, /setTimeout\(\(\) => \{ import\('\.\/code\/code-view\.js'\)/);
    assert.ok(!/requestIdleCallback/.test(main.slice(main.indexOf('async function revealCode'), main.indexOf('function openCodeRoom')).replace(/^\s*\/\/.*$/gm, '')));
    assert.match(main, /fetch\('\/api\/code\/setup'/, 'the site is asked from main.js, never from src/code');
  });
  delete globalThis.document; delete globalThis.window; delete globalThis.Node;
}
console.log(`\n${passed} checks passed.`);
process.exit(0);
