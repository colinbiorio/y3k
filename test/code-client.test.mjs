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
  // 2026-10-06: THE STAGE STAYS THE WHOLE WINDOW. The orb's column is the
  // FRAME (#orb-frame, measured by body.js), not a shrunken stage — the sky
  // runs behind the pane with no seam, and the far plane stops clipping the
  // dome. The stage must never be shrunk to the column again.
  assert.ok(!/body\.in-code #stage \{ inset: 0 var\(--hole-r\) 0 auto; width: var\(--code-orb-w\)/.test(css), 'the stage is shrunk to the column again — the sky breaks at the pane and the dome clips (the black void)');
  assert.match(css, /body\.in-code #orb-frame \{ display: block; inset: 0 var\(--hole-r\) 0 auto; width: var\(--code-orb-w\); \}/, 'the orb has no frame in Code');
  assert.match(read('index.html'), /<div id="orb-frame" aria-hidden="true"><\/div>/, 'the frame element is gone');
  assert.match(read('src/body.js'), /getElementById\('orb-frame'\)/, 'body.js no longer measures the frame');
  assert.match(css, /\.code-root \{ position: fixed;[^}]*z-index: 31;/);
  assert.match(css, /\.code-root \{[^}]*background: transparent;/, 'the code root has a ground of its own again — the hard break');
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
  assert.match(main, /queueMessage\(t, null, true\); return;/);
  // nor through the waking: the aside and the thread both feed autonomous
  // beats, and a beat can post to the feed (2026-10-02)
  assert.match(main, /if \(hosting && !priv && tend\.isAlive\(\) && text/, 'a Code line becomes the host aside the next beat reads');
  const awake = main.slice(main.indexOf('if (roomGen === gen && hosting && tend.isAlive()'), main.indexOf('// --- The opening moment'));
  assert.ok(awake.length > 100 && awake.length < 800, 'the awake block of handle() cannot be located');
  assert.match(awake, /if \(!priv\) \{\s*tend\.noteChat\(r\.speech\);\s*if \(social\.isHosting\(\)\) social\.publishMonologue\(hosting, r\.speech\);\s*\}/,
    'a reply to Code goes into the waking\'s thread, or onto the air');
  assert.equal(main.split('tend.noteChat(').length, 2, 'the waking hears a chat from a second place, past the !priv gate');
  // and held lines never change privacy: one entry per kind (run in shapes.test.mjs)
  assert.match(main, /if \(last && last\.private === priv\) \{/);
  // nor through the chessboard's table talk, which goes into the think prompt;
  // on Lichess the presence's say is posted where the opponent reads it, and a
  // game keeps running while you code (2026-10-03). Its listener is cut out of
  // chess.js and run.
  assert.match(main, /'y3k:chat', \{ detail: \{ role: 'you', text: t, private: true \} \}/, 'a line said from Code is announced as public');
  assert.match(main, /'y3k:chat', \{ detail: \{ role: 'presence', text: r\.speech, private: priv \} \}/, 'a reply to Code is announced as public');
  const chess = read('src/chess.js');
  const at = chess.indexOf("window.addEventListener('y3k:chat', (e) => {");
  assert.ok(at > 0, 'the table talk no longer listens to the chat');
  const listener = chess.slice(at, chess.indexOf('\n  });', at) + 6);
  let heard = null;
  const game = { status: 'started', chat: [] };
  new Function('d', `const { window, getAccount, render, game } = d; const presenceHandle = 'orion';\n${listener}`)({
    window: { addEventListener: (type, fn) => { if (type === 'y3k:chat') heard = fn; } },
    getAccount: () => ({ username: 'colin' }), render() {}, game,
  });
  for (const detail of [{ role: 'you', text: 'a typed line' }, { role: 'you', text: 'a line from Code', private: true },
    { role: 'presence', text: 'the answer to Code', private: true }, { role: 'presence', text: 'the answer to the typed line', private: false }])
    heard({ detail });
  assert.deepEqual(game.chat.map((c) => [c.who, c.text]), [['@colin', 'a typed line'], ['@orion', 'the answer to the typed line']],
    'a private line joined the table talk');
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
  // the newest numbers win: Claude Code was asked for them (get_usage), and a
  // Max plan's answer carries a weekly window for one model too
  // (and not the windows the server keeps under internal code names)
  assert.deepEqual(s.usage.limits.windows.map((w) => w.kind), ['five_hour', 'seven_day', 'seven_day_model']);
  assert.equal(s.usage.limits.windows[2].label, 'Fable');
  assert.deepEqual(s.usage.limits.windows.map((w) => w.utilization), [0.13, 0.93, 1]);
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

await ok('the context panel: Claude\'s popover in y3k glass — the window by part, until auto-compact, the plan, the breakdown', async () => {
  const cp = await import('../src/code/render/context-panel.js');
  const byText = (el, tag, text) => [...el.querySelectorAll(tag.toLowerCase())].filter((e) => e.textContent.includes(text));
  assert.deepEqual([671800, 1e6, 4000, 291400, 950, 1.25e6].map(cp.fmtTokens), ['671.8k', '1M', '4k', '291.4k', '950', '1.3M']);
  const now = Date.parse('2026-10-01T10:00:00Z');
  assert.equal(cp.resetsIn(now + (2 * 60 + 19) * 60000, now), 'Resets in 2 hr 19 min');
  assert.equal(cp.resetsIn(now + 25 * 60000, now), 'Resets in 25 min');
  assert.equal(cp.resetsIn(now + 3 * 86400000, now), 'Resets in 3 days');
  assert.deepEqual([['five_hour'], ['seven_day'], ['seven_day_model', 'Fable'], ['seven_day_opus']].map(([k, l]) => cp.windowLabel(k, l)), ['5-hour limit', 'Weekly · all models', 'Weekly · Fable', 'Weekly · Opus']);
  const ctx = { used: 676500, limit: 1e6, percent: 68, breakdown: [
    { name: 'Messages', tokens: 619100, kind: 'used' }, { name: 'System tools', tokens: 24300, kind: 'used' },
    { name: 'MCP tools', tokens: 16400, kind: 'used' }, { name: 'Free space', tokens: 291400, kind: 'free' },
    { name: 'System tools (deferred)', tokens: 22100, kind: 'deferred' }] };
  const limits = { windows: [{ kind: 'five_hour', utilization: 0.13, resetsAt: now + 8340000 }, { kind: 'seven_day', utilization: 0.93, resetsAt: now + 63000000 }] };
  let toggled = 0, compacted = 0;
  const closed = cp.contextPanel({ ctx, limits, plan: 'Max', now, onToggle: () => toggled++, onCompact: () => compacted++ });
  const text = closed.textContent;
  assert.match(text, /Context window676\.5k \/ 1M \(68%\)/);
  assert.match(text, /291\.4k until auto-compact/);
  assert.match(text, /Plan usage limits · Max/);
  assert.match(text, /5-hour limitResets in 2 hr 19 min13%/);
  assert.match(text, /Weekly · all models.*93%/);
  assert.equal(closed.querySelectorAll('span.cx-seg').length, 3, 'free and deferred are not drawn in the bar');
  assert.equal(closed.querySelector('div.cx-parts'), null, 'closed, the breakdown is hidden');
  assert.ok(closed.querySelector('div.cx-limit').classList.contains('ok') && closed.querySelectorAll('div.cx-limit')[1].classList.contains('hot'));
  byText(closed, 'BUTTON', 'See detailed breakdown')[0].click();
  byText(closed, 'BUTTON', 'Compact session')[0].click();
  assert.deepEqual([toggled, compacted], [1, 1]);
  const open = cp.contextPanel({ ctx, limits, plan: 'Max', now, open: true });
  const rows = open.querySelectorAll('div.cx-part');
  assert.equal(rows.length, 5);
  assert.match(rows[0].textContent, /Messages619\.1k61\.9%/);
  assert.match(rows[4].textContent, /System tools \(deferred\)22\.1k—/);
  assert.equal(byText(open, 'BUTTON', 'Hide breakdown').length, 1);
  assert.ok(byText(cp.contextPanel({ ctx, limits, busy: true }), 'BUTTON', 'Compact session')[0].disabled, 'no compacting mid-turn');
});

await ok('the cost says who pays: a Claude plan covers it, an API key is billed, unknown stays as it was', () => {
  // Claude Code's apiKeySource is 'none' when it runs on its own sign-in (a plan)
  const covered = meters.billingOf({ authSource: 'none', account: { type: 'max' } });
  assert.deepEqual(covered, { who: 'covered', plan: 'Max' });
  const c = meters.costChip({ totalUsd: 0.69, apiEquivalent: true }, covered);
  assert.equal(c.textContent, '$0.69 · covered');
  assert.ok(c.classList.contains('covered'));
  assert.match(c.title, /^Not charged\..*your Claude Max plan.*5-hour and weekly limits/);
  // the same chip, a key now paying
  const billed = meters.billingOf({ authSource: 'ANTHROPIC_API_KEY' });
  assert.equal(meters.updateCost(c, { totalUsd: 0.7, apiEquivalent: true }, billed), c);
  assert.equal(c.textContent, '$0.70 · billed');
  assert.match(c.title, /Charged to the API key/);
  assert.equal(meters.costChip({ totalUsd: 0.5 }, meters.billingOf({})).textContent, '$0.50', 'nothing said: no claim either way');
  assert.equal(meters.billingOf({ authSource: 'none' }).plan, null, 'a plan it did not name is "your Claude plan"');
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

// The same view again, a controller of its own for each check below (the view
// keeps one per page, so each imports its own copy of the module), with what
// main.js would hand it — a presence, its voice, an engine — and the page's
// keys pressed on the document, where the view listens for them.
{
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  const tick = () => { for (const f of frames.splice(0)) f(0); };
  const settle = async (n = 5) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };
  const docKeys = [];
  const addDoc = document.addEventListener;
  const removeDoc = document.removeEventListener;
  document.addEventListener = (t, fn, c) => { if (t === 'keydown') docKeys.push(fn); addDoc(t, fn, c); };
  document.removeEventListener = (t, fn, c) => { const i = docKeys.indexOf(fn); if (t === 'keydown' && i >= 0) docKeys.splice(i, 1); removeDoc(t, fn, c); };
  const press = (target, key, more = {}) => {
    const ev = { type: 'keydown', key, target, defaultPrevented: false, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() {}, ...more };
    for (const fn of docKeys.slice()) fn(ev);
    return ev;
  };
  // the room on screen (one just closed fades out for a moment, still in the body)
  const room = () => document.body.children.filter((c) => c.classList.contains('code-root') && !c.classList.contains('leaving')).pop();
  const $ = (sel) => room().querySelector(sel);
  const $$ = (sel) => room().querySelectorAll(sel);
  const tabOf = (cwd) => [...$$('button.cv-tab')].find((t) => t.title.includes(cwd));
  const viewWith = async (tag, opts) => (await import(`../src/code/code-view.js?${tag}`)).createCodeView(opts);

  await ok('the view: a reply voiced in a session in another tab stays in that tab; one on screen is voiced in place', async () => {
    const asks = [];
    const cv = await viewWith('voiced', { link: { voice: () => new Promise((resolve) => asks.push(resolve)) } });
    cv._feed({ sid: 'vA', type: 'session.started', provider: 'claude', cwd: '/tmp/vA', mode: 'ask' });
    cv.open();
    cv._feed({ sid: 'vB', type: 'session.started', provider: 'claude', cwd: '/tmp/vB', mode: 'ask' });
    tick();
    const list = $('div.cv-list');
    const before = list.childNodes.slice();
    cv._feed({ sid: 'vB', type: 'message.block', id: 'vb1', block: 0, kind: 'text', text: 'I deleted the old migrations folder and ran the tests again.' });
    cv._feed({ sid: 'vB', type: 'message.end', id: 'vb1' });
    tick();
    assert.equal(asks.length, 1, 'its block went to be voiced');
    asks[0]({ text: 'The old migrations folder is gone, and the tests ran again.' });
    await settle();
    tick();
    assert.deepEqual(list.childNodes, before, 'the transcript on screen is untouched');
    assert.ok(!/migrations/.test(list.textContent));
    // the one on screen: the same element, now in the presence's words
    cv._feed({ sid: 'vA', type: 'message.block', id: 'va1', block: 0, kind: 'text', text: 'I read the config file and it looks fine.' });
    cv._feed({ sid: 'vA', type: 'message.end', id: 'va1' });
    tick();
    const mine = $('div.cv-list > div.it.as');
    asks[1]({ text: 'The config file reads fine to me.' });
    await settle();
    tick();
    assert.equal($('div.cv-list > div.it.as'), mine, 'patched where it stands');
    assert.ok(mine.querySelector('.voiced'), 'voiced');
    assert.match(mine.textContent, /reads fine to me/);
    // and the other tab shows its own, voiced, when it is opened
    tabOf('/tmp/vB').click();
    tick();
    const theirs = $('div.cv-list > div.it.as');
    assert.match(theirs.textContent, /migrations folder is gone/);
    assert.ok(theirs.querySelector('.voiced'));
    cv.close();
  });

  // The engine, as the desktop app's bridge hands it to the page: each command
  // the view sends is kept here, and answered yes.
  const bridge = () => {
    const sent = [];
    window.y3kCode = { cmd: async (o) => { sent.push(o); return { ok: true }; }, onEvent: () => () => {}, since: async () => [] };
    return (c) => sent.filter((o) => o.cmd === c);
  };
  // the keys' own selectors are lists ('input, select, …'); the stand-in DOM matches one at a time
  const proto = Object.getPrototypeOf(document.createElement('div'));
  const matchOne = proto.matches;
  proto.matches = function (sel) { return sel.split(',').some((one) => matchOne.call(this, one)); };

  await ok('the view: Escape is for what it was pressed in; only the coder\'s own composer and the room stop it or answer its card', async () => {
    const asked = bridge();
    const cv = await viewWith('keys', { link: { companion: () => ({ name: 'Orion' }), talk: () => {} } });
    const sid = 'k1';
    cv._feed({ sid, type: 'session.started', provider: 'claude', cwd: '/tmp/k1', mode: 'ask' });
    cv.open();
    await settle();
    cv._feed({ sid, type: 'turn.started' });
    tick();
    const ta = $('textarea.cv-input');
    // an IME composition being cancelled, in the composer
    press(ta, 'Escape', { isComposing: true });
    press(ta, 'Escape', { keyCode: 229 });
    // the model dropdown, open: Escape closes it (its own handler) and stops nothing
    const pick = $('div.cv-controls .gs-btn');
    pick.click();
    assert.ok($('div.cv-controls .gs.open'), 'the dropdown is open');
    press(pick, 'Escape');
    press(document.querySelector('div.gs-pop'), 'Escape');
    pick.click();
    // a field outside the room (the Settings modal over it)
    const away = document.createElement('input');
    document.body.appendChild(away);
    press(away, 'Escape');
    assert.equal(asked('session.interrupt').length, 0, 'none of those stopped the turn');
    press(ta, 'Escape');
    await settle();
    assert.equal(asked('session.interrupt').length, 1, 'the composer still stops it');
    // a card waiting: Escape in its note declines it, with what was typed
    cv._feed({ sid, type: 'tool.call', callId: 'c1', name: 'Bash', kind: 'bash', title: 'ls', input: { command: 'ls' } });
    cv._feed({ sid, type: 'permission.request', requestId: 'r1', callId: 'c1', tool: 'Bash', kind: 'bash', title: 'ls', input: { command: 'ls' }, preview: { command: 'ls' }, risk: 'run' });
    tick();
    pick.click();
    press(pick, 'Escape');
    pick.click();
    press(away, 'Enter');
    await settle();
    assert.equal(asked('permission.answer').length, 0, 'a dropdown or a field elsewhere answers nothing');
    const note = $('input.pm-note');
    note.value = 'use git ls-files instead';
    press(note, 'Escape');
    await settle();
    assert.deepEqual(asked('permission.answer').map((o) => [o.requestId, o.decision, o.message]), [['r1', 'deny', 'use git ls-files instead']]);
    // talking to the presence alone: its composer answers no card and stops nothing
    cv._feed({ sid, type: 'permission.resolved', requestId: 'r1', decision: 'deny' });
    cv._feed({ sid, type: 'permission.request', requestId: 'r2', callId: 'c1', tool: 'Bash', kind: 'bash', title: 'rm -rf build', input: { command: 'rm -rf build' }, preview: { command: 'rm -rf build' }, risk: 'run' });
    tick();
    $('button.cv-who').click();
    assert.match(ta.placeholder, /Orion/);
    ta.dispatch('keydown', { key: 'Enter' });
    $('button.cv-send').click();
    press(ta, 'Escape');
    await settle();
    assert.equal(asked('permission.answer').length, 1, 'an empty Enter, the send button or Escape there allowed nothing');
    assert.equal(asked('session.interrupt').length, 1);
    // back to the coder, an empty Enter answers the card as before
    $('button.cv-who').click();
    ta.dispatch('keydown', { key: 'Enter' });
    await settle();
    assert.deepEqual(asked('permission.answer').map((o) => [o.requestId, o.decision]).at(-1), ['r2', 'allow']);
    away.remove();
    cv.close();
    delete window.y3kCode;
  });

  await ok('the view: "/" opens the coder\'s own commands; arrows, Tab, Return and Esc do what they do in Claude Code (2026-10-07)', async () => {
    const asked = bridge();
    const cv = await viewWith('slash', { link: { companion: () => ({ name: 'Orion' }), talk: () => {} } });
    const sid = 'sl1';
    cv._feed({ type: 'provider.status', provider: 'claude', commands: [
      { name: 'compact', hint: '<optional custom summarization instructions>', description: 'Free up context by summarizing the conversation so far', aliases: [], builtin: true },
      { name: 'context', hint: '', description: 'Show current context usage', aliases: [], builtin: true },
      { name: 'code-review', hint: '', description: 'Review the current diff', aliases: [], builtin: false },
      { name: 'usage', hint: '', description: 'Show session cost, plan usage', aliases: ['cost', 'stats'], builtin: true },
    ] });
    cv._feed({ sid, type: 'session.started', provider: 'claude', cwd: '/tmp/sl1', mode: 'ask' });
    cv.open();
    await settle();
    tick();
    const ta = $('textarea.cv-input');
    // typing, as a browser has it: the caret ends up after what was typed
    const type = (v) => { ta.value = v; ta.selectionStart = ta.selectionEnd = v.length; ta.dispatch('input'); };
    const names = () => { const m = $('div.cv-slash'); return m && m.parentNode ? m.childNodes.map((r) => r.childNodes[0].textContent) : []; };
    const lit = () => { const m = $('div.cv-slash'); return m ? m.childNodes.findIndex((r) => r.classList.contains('on')) : -1; };
    type('/co');
    assert.deepEqual(names(), ['/compact', '/context', '/code-review', '/usage'], 'name prefixes first (Claude Code\'s own before the rest), then an alias');
    assert.equal(lit(), 0);
    press(ta, 'ArrowDown'); press(ta, 'ArrowDown'); press(ta, 'ArrowUp');
    assert.equal(lit(), 1, 'the arrows move the lit row');
    press(ta, 'ArrowUp');
    // a command that takes words: Return completes it and sends nothing
    press(ta, 'Enter');
    await settle();
    assert.equal(ta.value, '/compact ', 'completed, with room for its words');
    assert.equal(names().length, 0, 'and the menu is gone');
    assert.equal(asked('session.send').length, 0, 'nothing sent yet');
    // a command that takes nothing: Return runs it
    type('/cont');
    assert.deepEqual(names(), ['/context', '/compact'], 'the name first; then what it does ("Free up context…")');
    press(ta, 'Enter');
    await settle();
    assert.deepEqual(asked('session.send').map((o) => o.text), ['/context'], 'run, as its text');
    // Tab completes; Esc closes and stops nothing; typing on opens it again
    type('/us');
    press(ta, 'Tab');
    assert.equal(ta.value, '/usage ');
    type('/');
    assert.equal(names().length, 4, 'a bare slash lists them all');
    press(ta, 'Escape');
    await settle();
    assert.equal(names().length, 0, 'Esc closes the menu');
    assert.equal(asked('session.interrupt').length, 0, 'and does not stop the coder');
    type('/c');
    assert.ok(names().length > 0, 'typing on opens it again');
    // a click (or a hand's) puts the command in the box, and sends nothing
    $('div.cv-slash').childNodes[1].click();
    assert.equal(ta.value, '/context ');
    assert.equal(asked('session.send').length, 1);
    // "@" is the same menu for the folder's files, asked of the engine
    const plain = window.y3kCode.cmd;
    const listed = [];
    window.y3kCode.cmd = async (o) => { if (o.cmd === 'workspace.files') { listed.push(o); return { ok: true, files: ['src/', 'src/main.js', 'src/code/'] }; } return plain(o); };
    const paths = () => { const m = $('div.cv-slash'); return m && m.parentNode ? m.childNodes.map((r) => r.childNodes[1].textContent) : []; };
    type('look at @ma');
    await settle();
    assert.deepEqual(listed.map((o) => [o.cwd, o.q]), [['/tmp/sl1', 'ma']], 'the session\'s folder, and what was typed after @');
    assert.deepEqual(paths(), ['src/', 'src/main.js', 'src/code/']);
    press(ta, 'ArrowDown');
    press(ta, 'Enter');
    await settle();
    assert.equal(ta.value, 'look at @src/main.js ', 'the file, in place of what was typed');
    assert.equal(paths().length, 0, 'and the menu is gone');
    assert.equal(asked('session.send').length, 1, 'Return put it in the box; it sent nothing');
    // a folder keeps the menu open, to be walked into
    type('see @s');
    await settle();
    press(ta, 'Tab');
    await settle();
    assert.equal(ta.value, 'see @src/');
    assert.ok(paths().length > 0, 'still open inside the folder');
    assert.deepEqual(listed.at(-1).q, 'src/');
    press(ta, 'Escape');
    assert.equal(paths().length, 0);
    // not after a word: an address is not a mention
    const before = listed.length;
    type('mail colin@ex');
    await settle();
    assert.equal(listed.length, before, 'colin@ex is not a file mention');
    // talking to the presence: no menu
    $('button.cv-who').click();
    type('/co');
    assert.equal(names().length, 0, 'the presence has no commands');
    type('see @s');
    await settle();
    assert.equal(listed.length, before, 'nor files');
    cv.close();
    delete window.y3kCode;
  });

  await ok('the view: hands-free is a conversation — what is said goes, the reply is read aloud as prose, then it listens again (2026-10-07)', async () => {
    const asked = bridge();
    const spoken = [], hushed = [], again = [];
    let lease = null, released = 0;
    const link = {
      companion: () => ({ name: 'Orion' }), talk: () => {}, canDictate: () => true,
      dictate: (handlers) => { lease = handlers; handlers.onState(true); return () => { released++; }; },
      listenAgain: () => { again.push(1); lease?.onState(true); },
      hush: () => { hushed.push(1); lease?.onState(false); },
      speak: (text, { onEnd } = {}) => { spoken.push({ text, onEnd }); return () => {}; },
    };
    const cv = await viewWith('handsfree', { link });
    const sid = 'hf1';
    cv._feed({ sid, type: 'session.started', provider: 'claude', cwd: '/tmp/hf1', mode: 'ask' });
    cv.open();
    await settle();
    tick();
    $('button.cv-mic').dispatch('click', { shiftKey: true });
    assert.ok(lease, 'shift-click takes the microphone, hands-free');
    lease.onText({ text: 'fix the far plane', final: true });
    await settle();
    assert.deepEqual(asked('session.send').map((o) => o.text), ['fix the far plane'], 'a finished utterance is sent as it lands');
    lease.onState(false);   // the listen that heard it ends
    cv._feed({ sid, type: 'message.user', id: 'u1', text: 'fix the far plane' });
    cv._feed({ sid, type: 'turn.started' });
    cv._feed({ sid, type: 'message.start', id: 'a1' });
    cv._feed({ sid, type: 'message.block', id: 'a1', block: 0, kind: 'text', text: 'Fixed in `src/body.js`:\n\n```js\nconst far = 220;\n```\n\nThe **void** is gone.' });
    cv._feed({ sid, type: 'message.end', id: 'a1' });
    cv._feed({ sid, type: 'turn.ended', status: 'success' });
    await settle();
    tick();
    assert.equal(spoken.length, 1, 'the reply is read aloud once the turn ends');
    assert.equal(spoken[0].text, 'Fixed in: The void is gone.', 'prose only: no code, no path, no markdown');
    assert.ok(!/far = 220|src\/body/.test(spoken[0].text), 'code never goes to the voice');
    assert.ok(hushed.length >= 1, 'the microphone stops listening while it speaks');
    const before = again.length;
    spoken[0].onEnd();
    assert.equal(again.length, before + 1, 'and listens again when the reply has been read');
    // Esc stops it all and lets the microphone go
    lease.onState(false);
    press($('textarea.cv-input'), 'Escape');
    assert.equal(released, 1, 'the lease is given back');
    // one utterance (a plain click) never reads anything aloud
    $('button.cv-mic').click();
    cv._feed({ sid, type: 'turn.ended', status: 'success' });
    await settle();
    assert.equal(spoken.length, 1, 'only hands-free reads replies');
    cv.close();
    delete window.y3kCode;
  });

  await ok('the view: what is said aloud is the prose — code, paths, links and markdown taken out, a long reply cut at a sentence', async () => {
    const { spokenProse } = await import('../src/code/code-view.js');
    assert.equal(spokenProse('## Done\n\nI changed `a.js` and [the docs](https://x.y/z).\n\n- Tests pass'), 'Done. I changed and the docs. Tests pass.',
      'a heading and a list item are sentences; a link is its words; inline code is not said');
    const long = spokenProse('This is a sentence that goes on. '.repeat(40));
    assert.ok(long.length < 700 && /The rest is on screen\.$/.test(long), 'a long reply is cut and says so');
    assert.ok(/on\. The rest/.test(long), 'at a sentence');
    assert.equal(spokenProse('```\nonly code\n```'), '', 'nothing to say when it is all code');
  });

  await ok('the view: the context panel is one element while open, redrawn only when what it shows changes, the keyboard kept in it', async () => {
    const asked = bridge();
    const realNow = Date.now;
    Date.now = () => Date.parse('2026-10-01T10:00:30Z');   // one minute throughout: "Resets in" is part of what it shows
    try {
      const cv = await viewWith('panel', {});
      const sid = 'p1';
      const parts = (used) => [{ name: 'Messages', tokens: used, kind: 'used' }, { name: 'Free space', tokens: 200000 - used, kind: 'free' }];
      cv._feed({ sid, type: 'session.started', provider: 'claude', cwd: '/tmp/p1', mode: 'ask' });
      cv._feed({ sid, type: 'usage.context', used: 30000, limit: 200000, breakdown: parts(30000) });
      cv._feed({ sid, type: 'permission.request', requestId: 'pr1', tool: 'Bash', kind: 'bash', title: 'ls', input: { command: 'ls' }, preview: { command: 'ls' }, risk: 'run' });
      cv.open();
      await settle();
      tick();
      // Enter on the ring opens the panel, and answers nothing else; the keyboard goes into it
      const ring = $('div.mt-ctx');
      ring.focus();
      press(ring, 'Enter');
      $('div.cv-meters').dispatch('keydown', { key: 'Enter', target: ring });
      await settle();
      assert.equal(asked('permission.answer').length, 0, 'Enter on the ring allowed the waiting card');
      const el = $('div.cx-panel');
      assert.ok(el, 'open');
      assert.equal(ring.getAttribute('aria-expanded'), 'true');
      assert.equal(document.activeElement, el.querySelector('button.cx-head'), 'focus went into it');
      // what it does not show changes nothing in it
      const head = el.querySelector('button.cx-head');
      for (const e of [{ type: 'todo.update', items: [{ content: 'a', status: 'in_progress', activeForm: 'doing a' }] }, { type: 'git.status', branch: 'main', files: [] }, { type: 'usage.cost', totalUsd: 0.2 }, { type: 'files.changed', paths: ['a.js'] }]) {
        cv._feed({ sid, ...e });
        tick();
      }
      assert.equal($('div.cx-panel'), el, 'the same panel');
      assert.equal(el.querySelector('button.cx-head'), head, 'nothing in it drawn again');
      assert.equal(document.activeElement, head);
      // new numbers go into the same element, and the keyboard stays on its control
      el.querySelector('button.cx-more').focus();
      cv._feed({ sid, type: 'usage.context', used: 90000, limit: 200000, breakdown: parts(90000) });
      tick();
      assert.equal($('div.cx-panel'), el);
      assert.match(el.textContent, /90k \/ 200k \(45%\)/);
      assert.equal(document.activeElement, el.querySelector('button.cx-more'), 'focus kept on "See detailed breakdown"');
      el.querySelector('button.cx-more').click();
      assert.equal($('div.cx-panel'), el);
      assert.ok(el.querySelector('div.cx-parts'), 'the breakdown, in the same panel');
      assert.equal(document.activeElement, el.querySelector('button.cx-more'));
      // Claude Code's end-of-turn reading has no count: what was shown stays
      cv._feed({ sid, type: 'usage.context', used: null, limit: 200000, percent: null, source: 'modelUsage' });
      tick();
      assert.match(el.textContent, /90k \/ 200k \(45%\)/);
      assert.equal(ring.querySelector('span.mt-num').textContent, '45%');
      // on the panel itself (a click on its glass), the keyboard is left there
      el.focus();
      cv._feed({ sid, type: 'usage.context', used: 92000, limit: 200000, breakdown: parts(92000) });
      tick();
      assert.match(el.textContent, /92k \/ 200k \(46%\)/);
      assert.equal(document.activeElement, el, 'not moved to its head');
      // Escape closes it, and the keyboard goes back to the ring
      press(document.activeElement, 'Escape');
      assert.equal($('div.cx-panel'), null);
      assert.equal(ring.getAttribute('aria-expanded'), 'false');
      assert.equal(document.activeElement, ring);
      assert.equal(asked('permission.answer').length, 0, 'Escape there closed only the panel');
      cv.close();
    } finally {
      Date.now = realNow;
      delete window.y3kCode;
    }
  });

  // A companion (y3k-code on 127.0.0.1) this browser is paired with, whose
  // event stream and answers are in the test's hands: `send` writes to the
  // open stream, `end` drops it, and each command waits in `cmds` for `answer`
  // (or is answered at once by `auto`, by its name).
  const companionEngine = () => {
    const enc = new TextEncoder();
    const eng = { cmds: [], stream: null, streams: 0, auto: {} };
    globalThis.localStorage = { getItem: (k) => (k === 'y3k-code:pair' ? JSON.stringify({ port: 47821, token: 'tok' }) : null), setItem() {}, removeItem() {} };
    globalThis.fetch = async (url, o = {}) => {
      if (url.startsWith('http://127.0.0.1:47821/v1/events')) {
        eng.streams += 1;
        return new Response(new ReadableStream({ start(c) { eng.stream = c; } }), { status: 200 });
      }
      if (url === 'http://127.0.0.1:47821/v1/cmd') {
        const c = JSON.parse(o.body);
        return new Promise((resolve) => {
          c.answer = (j) => resolve(new Response(JSON.stringify(j), { status: 200 }));
          if (eng.auto[c.cmd]) c.answer(eng.auto[c.cmd](c)); else eng.cmds.push(c);
        });
      }
      throw new TypeError('Failed to fetch');
    };
    eng.send = (data, ev) => eng.stream.enqueue(enc.encode(`${ev ? `event: ${ev}\n` : ''}data: ${JSON.stringify(data)}\n\n`));
    eng.end = () => eng.stream.close();
    eng.waiting = (name) => eng.cmds.filter((c) => c.cmd === name);
    return eng;
  };
  const until = async (pred, ms = 3000) => {
    for (const t = Date.now(); !pred() && Date.now() - t < ms;) await new Promise((r) => setTimeout(r, 2));
    assert.ok(pred(), 'timed out');
  };
  const offline = () => { delete globalThis.localStorage; delete globalThis.fetch; };
  const realFetch = globalThis.fetch;
  const sid = 'a1b2c3d4e5f60718';
  const EPOCH = 'e1';
  // what the engine's file has for the session: its start, a request, a
  // reply, and an edit waiting on the person
  const onDisk = [
    { type: 'session.started', provider: 'claude', cwd: '/tmp/live1', mode: 'ask', seq: 101 },
    { type: 'turn.started', seq: 102 },
    { type: 'message.user', text: 'change world to y3k', seq: 103 },
    { type: 'message.start', id: 'm1', seq: 104 },
    { type: 'message.block', id: 'm1', block: 0, kind: 'text', text: 'Looking at hello.txt first.', seq: 106 },
    { type: 'message.end', id: 'm1', seq: 107 },
    { type: 'tool.call', callId: 'c1', name: 'Edit', kind: 'edit', title: 'hello.txt', input: { file_path: 'hello.txt' }, seq: 108 },
    { type: 'permission.request', requestId: 'r1', callId: 'c1', tool: 'Edit', kind: 'edit', title: 'hello.txt', input: { file_path: 'hello.txt' }, preview: {}, risk: 'write', seq: 109 },
  ].map((e) => ({ sid, ...e }));
  const live = (e) => ({ v: 1, epoch: EPOCH, sid, t: Date.now(), ...e });
  const count = (s, kind) => s.items.filter((i) => i.kind === kind).length;

  await ok('the view: a page loaded while the engine\'s ring has rolled shows a live session once, and a later gap adds only what it missed, keeping what only the page had', async () => {
    const eng = companionEngine();
    const disk = onDisk.slice();
    // and a second session, in the other tab: a Gemini CLI one
    const sid2 = 'f0e1d2c3b4a59687';
    const disk2 = [
      { type: 'session.started', provider: 'gemini', cwd: '/tmp/live2', mode: 'ask', seq: 90 },
      { type: 'message.user', text: 'look around', seq: 91 },
    ].map((e) => ({ sid: sid2, ...e }));
    const running = [{ sid: sid2, state: 'idle' }, { sid, state: 'waiting' }];
    const files = { [sid]: () => disk.slice(), [sid2]: () => disk2.slice() };
    eng.auto['engine.hello'] = () => ({ ok: true, name: 'y3k-code', providers: [], recent: [], sessions: running.slice() });
    eng.auto['session.load'] = (c) => ({ ok: true, sid: c.sid, live: true, meta: null, events: files[c.sid]() });
    const asks = [];
    try {
      const cv = await viewWith('reset-a', { link: { voice: () => new Promise((resolve) => asks.push(resolve)), companion: () => ({ name: 'Orion' }), talk: () => {} } });
      cv.open();
      await until(() => eng.stream);
      // a fresh load with a rolled ring: 'connected', and at once a reset
      eng.send({ epoch: EPOCH, seq: 120 }, 'reset');
      const S = cv._state;
      await until(() => S.sessions.get(sid)?.items.length && !eng.cmds.length);
      await settle(20);
      tick();
      const s = S.sessions.get(sid);
      assert.deepEqual(['user', 'permission'].map((k) => count(s, k)), [1, 1], 'each card once');
      assert.equal(count(s, 'assistant'), 1);
      assert.equal(s.waiting, 1);
      assert.equal(s.cwd, '/tmp/live1');
      assert.equal($$('div.cv-list > div.it.us').length, 1, 'drawn once');
      assert.equal($$('div.cv-list div.it.pm').length, 1);
      // answered on the computer: nothing is left waiting
      eng.send(live({ type: 'permission.resolved', requestId: 'r1', decision: 'allow', seq: 121 }));
      await until(() => s.waiting === 0);
      assert.equal(cv.needsYou(), false);
      // a reply, said over in the presence's voice; and the other tab read
      eng.send(live({ type: 'message.start', id: 'm3', seq: 122 }));
      eng.send(live({ type: 'message.block', id: 'm3', block: 0, kind: 'text', text: 'I changed the greeting and the tests pass now.', seq: 123 }));
      eng.send(live({ type: 'message.end', id: 'm3', seq: 124 }));
      await until(() => asks.length === 1);
      asks[0]({ text: 'The greeting is changed, and the tests pass.' });
      await settle();
      tick();
      assert.ok($$('div.cv-list > div.it.as').pop().querySelector('.voiced'));
      // a reply that is only ever streamed, as Gemini CLI's are over ACP: its
      // words are never in the file
      eng.send(live({ type: 'message.start', id: 'g1', seq: 125 }));
      eng.send(live({ type: 'message.delta', id: 'g1', block: 1, kind: 'text', text: 'This repo is ', seq: 126 }));
      eng.send(live({ type: 'message.delta', id: 'g1', block: 1, kind: 'text', text: 'a social site.', seq: 127 }));
      eng.send(live({ type: 'message.end', id: 'g1', seq: 128 }));
      await until(() => s.byKey.get('m:g1')?.done);
      // and a line to the presence, never sent to the engine
      $('button.cv-who').click();
      const ta = $('textarea.cv-input');
      ta.value = 'what is this repo?';
      ta.dispatch('keydown', { key: 'Enter' });
      $('button.cv-who').click();
      await settle();
      tick();
      assert.deepEqual(s.items.map((i) => i.kind), ['user', 'assistant', 'tool', 'permission', 'assistant', 'assistant', 'orion']);
      const other = S.sessions.get(sid2);
      other.unread = false;
      // the stream drops, and comes back after more than the ring holds. The
      // file has what was missed, and none of the streamed words; the other
      // tab's has grown past the 5000 events session.load sends back, so its
      // start is not in what comes back. A third session began meanwhile;
      // its file is as long, and the engine's index says how it began.
      disk.push(...[
        { type: 'permission.resolved', requestId: 'r1', decision: 'allow', seq: 121 },
        { type: 'message.start', id: 'm3', seq: 122 },
        { type: 'message.block', id: 'm3', block: 0, kind: 'text', text: 'I changed the greeting and the tests pass now.', seq: 123 },
        { type: 'message.end', id: 'm3', seq: 124 },
        { type: 'message.start', id: 'g1', seq: 125 },
        { type: 'message.end', id: 'g1', seq: 128 },
        { type: 'message.user', text: 'now add a test', seq: 5000 },
        { type: 'notice', level: 'info', text: 'compacted', seq: 5001 },
      ].map((e) => ({ sid, ...e })));
      files[sid2] = () => disk2.slice(1);
      const sid3 = '0123456789abcdef';
      running.push({ sid: sid3, state: 'running' });
      files[sid3] = () => [{ sid: sid3, type: 'message.user', text: 'tidy the docs', seq: 11000 }];
      const loadOne = eng.auto['session.load'];
      eng.auto['session.load'] = (c) => (c.sid === sid3 ? { ...loadOne(c), meta: { sid: sid3, provider: 'codex', cwd: '/tmp/live3', mode: 'ask', title: 'tidy the docs', started: 1 } } : loadOne(c));
      const streams = eng.streams;
      eng.end();
      await until(() => eng.streams > streams && eng.stream, 3000);
      eng.send({ epoch: EPOCH, seq: 12000 }, 'reset');
      await until(() => count(S.sessions.get(sid), 'user') === 2 && S.sessions.has(sid3));
      await settle(20);
      tick();
      const again = S.sessions.get(sid);
      assert.equal(again, s, 'the session on screen is the one it was, not one read over it');
      assert.deepEqual(again.items.map((i) => i.kind), ['user', 'assistant', 'tool', 'permission', 'assistant', 'assistant', 'orion', 'user', 'notice'], 'what it missed, after what it had');
      assert.equal(again.waiting, 0);
      assert.equal(S.order.filter((x) => x === sid).length, 1, 'one tab');
      assert.equal($$('div.cv-list > div.it.us').length, 2);
      // what the page knew and the file does not: the presence's words over
      // the reply, the streamed reply's own, the line to the presence, and
      // that the other tab has nothing new
      assert.equal(again.byKey.get('m:m3').blocks[0].voice, 'The greeting is changed, and the tests pass.');
      const said = [...$$('div.cv-list > div.it.as')].find((el) => /greeting/.test(el.textContent));
      assert.ok(said.querySelector('.voiced'));
      assert.match(said.textContent, /The greeting is changed/);
      assert.deepEqual(again.byKey.get('m:g1').blocks.map((b) => b.text), ['This repo is a social site.']);
      assert.ok([...$$('div.cv-list > div.it.as')].some((el) => /This repo is a social site\./.test(el.textContent)), 'the streamed reply still drawn');
      assert.equal(again.items.find((i) => i.kind === 'orion').text, 'what is this repo?');
      assert.equal($$('div.cv-list > div.it.or').length, 1, 'the line to the presence still drawn');
      const two = S.sessions.get(sid2);
      assert.equal(two, other, 'the other tab is the one it was');
      assert.deepEqual([two.provider, two.cwd, two.mode], ['gemini', '/tmp/live2', 'ask'], 'its tool and folder, though its start was not read back');
      assert.equal(two.unread, false, 'and is not lit as unread');
      const three = S.sessions.get(sid3);
      assert.deepEqual([three.provider, three.cwd, three.mode, three.title], ['codex', '/tmp/live3', 'ask', 'tidy the docs'], 'begun as the index says');
      assert.deepEqual(three.items.map((i) => i.kind), ['user']);
      assert.deepEqual(S.order, [sid2, sid, sid3], 'each tab where it was');
      // a fragment held across the reset for a reply its file only closed
      // (Gemini CLI's, again) is the only copy of its words, and goes in
      eng.send(live({ type: 'message.start', id: 'g2', seq: 12001 }));
      eng.send(live({ type: 'message.delta', id: 'g2', block: 1, kind: 'text', text: 'Added.', seq: 12002 }));
      await until(() => again.byKey.get('m:g2')?.blocks.length);
      const streams2 = eng.streams;
      eng.end();
      await until(() => eng.streams > streams2 && eng.stream, 3000);
      eng.send({ epoch: EPOCH, seq: 13000 }, 'reset');
      eng.send(live({ type: 'message.delta', id: 'g2', block: 1, kind: 'text', text: ' The test passes.', seq: 13001 }));
      disk.push(...[
        { type: 'message.start', id: 'g2', seq: 12001 },
        { type: 'message.end', id: 'g2', seq: 13002 },
      ].map((e) => ({ sid, ...e })));
      eng.send(live({ type: 'message.end', id: 'g2', seq: 13002 }));
      await until(() => again.byKey.get('m:g2')?.done);
      await settle(20);
      assert.equal(S.sessions.get(sid), again);
      assert.deepEqual(again.byKey.get('m:g2').blocks.map((b) => b.text), ['Added. The test passes.']);
      cv.close();
    } finally { offline(); globalThis.fetch = realFetch; }
  });

  await ok('the view: a session the engine no longer lists has ended, and is never picked as the one to show', async () => {
    const eng = companionEngine();
    eng.auto['engine.hello'] = null;
    try {
      const cv = await viewWith('gone', {});
      cv.open();
      await until(() => eng.stream && eng.waiting('engine.hello').length);
      // the first hello: one session running, read from its file
      for (const c of eng.waiting('engine.hello')) c.answer({ ok: true, name: 'y3k-code', providers: [], recent: [], sessions: [{ sid, state: 'waiting' }] });
      eng.cmds = eng.cmds.filter((c) => c.cmd !== 'engine.hello');
      await until(() => eng.waiting('session.load').length);
      for (const c of eng.waiting('session.load')) c.answer({ ok: true, sid, live: true, events: onDisk });
      eng.cmds = [];
      const S = cv._state;
      await until(() => S.sessions.get(sid)?.cwd === '/tmp/live1');
      // the person goes to the folders (a new session)
      $('button.cv-tab.cv-new').click();
      tick();
      assert.equal(S.active, null);
      // another engine answers now (a restart, or this browser paired again):
      // it runs nothing, and the old session is not chosen in its place
      eng.send({ epoch: 'e2', seq: 3 }, 'reset');
      await until(() => eng.waiting('engine.hello').length);
      for (const c of eng.waiting('engine.hello')) c.answer({ ok: true, name: 'y3k-code', providers: [], recent: [], sessions: [] });
      eng.cmds = [];
      await until(() => S.sessions.get(sid)?.state === 'ended');
      await settle(10);
      tick();
      assert.equal(S.active, null, 'the folders stay on screen');
      assert.equal(S.sessions.get(sid).items.find((i) => i.kind === 'permission').resolved, 'cancelled', 'its question can no longer be answered');
      assert.ok(!$('div.cv-home').hidden, 'the folders are showing');
      cv.close();
    } finally { offline(); globalThis.fetch = realFetch; }
  });

  await ok('the view: what streams in while a reset reads a session is played after its history, once', async () => {
    const eng = companionEngine();
    eng.auto['engine.hello'] = null;
    try {
      const cv = await viewWith('reset-b', {});
      cv.open();
      await until(() => eng.stream && eng.waiting('engine.hello').length);
      eng.send({ epoch: EPOCH, seq: 120 }, 'reset');
      // the reply in progress: a fragment before the hello is answered…
      eng.send(live({ type: 'message.start', id: 'm2', seq: 121 }));
      eng.send(live({ type: 'message.delta', id: 'm2', block: 0, kind: 'text', text: 'Done: hello.txt ', seq: 122 }));
      await settle(10);
      for (const c of eng.waiting('engine.hello')) c.answer({ ok: true, name: 'y3k-code', providers: [], recent: [], sessions: [{ sid, state: 'running' }] });
      eng.cmds = eng.cmds.filter((c) => c.cmd !== 'engine.hello');
      await until(() => eng.waiting('session.load').length);
      // …and while the file is read: the rest of that block, the block itself
      // finished (the file will have it), the next block begun, and a notice
      // the file will have too
      eng.send(live({ type: 'message.delta', id: 'm2', block: 0, kind: 'text', text: 'now says y3k.', seq: 123 }));
      eng.send(live({ type: 'message.block', id: 'm2', block: 0, kind: 'text', text: 'Done: hello.txt now says y3k.', seq: 124 }));
      eng.send(live({ type: 'message.delta', id: 'm2', block: 1, kind: 'text', text: 'Running the tests', seq: 125 }));
      eng.send(live({ type: 'notice', level: 'info', text: 'hooks ran', seq: 126 }));
      await settle(10);
      const disk = [...onDisk, ...[
        { type: 'message.start', id: 'm2', seq: 121 },
        { type: 'message.block', id: 'm2', block: 0, kind: 'text', text: 'Done: hello.txt now says y3k.', seq: 124 },
        { type: 'notice', level: 'info', text: 'hooks ran', seq: 126 },
      ].map((e) => ({ sid, ...e }))];
      for (const c of eng.waiting('session.load')) c.answer({ ok: true, sid, live: true, events: disk });
      eng.cmds = [];
      const S = cv._state;
      await until(() => S.sessions.get(sid)?.cwd === '/tmp/live1');
      await settle(20);
      tick();
      const s = S.sessions.get(sid);
      assert.equal(s.cwd, '/tmp/live1', 'its folder, from the file');
      assert.equal(s.provider, 'claude');
      assert.deepEqual(s.items.map((i) => i.kind), ['user', 'assistant', 'tool', 'permission', 'assistant', 'notice'], 'its history first, then the reply in progress, each once');
      assert.deepEqual(s.items[4].blocks.map((b) => b.text), ['Done: hello.txt now says y3k.', 'Running the tests'], 'the streamed words, once each');
      assert.equal(s.waiting, 1);
      assert.match($$('div.cv-list > div.it.as').pop().textContent, /^Done: hello\.txt now says y3k\.Running the tests$/);
      assert.equal(S.order.filter((x) => x === sid).length, 1, 'one tab');
      cv.close();
    } finally { offline(); globalThis.fetch = realFetch; }
  });

  await ok('the view: a reset that lands while a session is read keeps its streamed words in the order they came', async () => {
    const eng = companionEngine();
    eng.auto['engine.hello'] = () => ({ ok: true, name: 'y3k-code', providers: [], recent: [], sessions: [{ sid, state: 'running' }] });
    const disk = [...onDisk, ...[
      { type: 'message.start', id: 'm2', seq: 121 },
      { type: 'notice', level: 'info', text: 'hooks ran', seq: 124 },
    ].map((e) => ({ sid, ...e }))];
    const moved = [];
    try {
      const cv = await viewWith('reset-c', { link: { kommand: (k) => { moved.push(k); return { ok: true, said: k }; } } });
      cv.open();
      // a fresh load: the running session is read from its file, and streams
      // on while it is
      await until(() => eng.waiting('session.load').length === 1);
      eng.send(live({ type: 'message.start', id: 'm2', seq: 121 }));
      eng.send(live({ type: 'message.delta', id: 'm2', block: 0, kind: 'text', text: 'Done: ', seq: 122 }));
      // the coder moves the orb meanwhile: never in the file, so never "read
      // from it already", and not kept waiting
      eng.send(live({ type: 'orb.move', id: 'o1', kommand: 'color/gold', at: Date.now(), seq: 123 }));
      await settle(10);
      assert.deepEqual(moved, ['color/gold'], 'the orb moved at once');
      // the stream drops before the file comes back, and returns past the ring
      const streams = eng.streams;
      eng.end();
      await until(() => eng.streams > streams && eng.stream, 3000);
      eng.send({ epoch: EPOCH, seq: 12000 }, 'reset');
      eng.send(live({ type: 'message.delta', id: 'm2', block: 0, kind: 'text', text: 'hello.txt says y3k.', seq: 12001 }));
      await settle(10);
      eng.auto['session.load'] = () => ({ ok: true, sid, live: true, events: disk.slice() });
      for (const c of eng.waiting('session.load')) c.answer({ ok: true, sid, live: true, events: disk.slice() });
      eng.cmds = [];
      const S = cv._state;
      await until(() => S.sessions.get(sid)?.byKey.get('m:m2')?.blocks.length);
      await settle(20);
      tick();
      const s = S.sessions.get(sid);
      assert.deepEqual(s.items.map((i) => i.kind), ['user', 'assistant', 'tool', 'permission', 'assistant', 'notice'], 'its history first, then the reply in progress');
      assert.deepEqual(s.byKey.get('m:m2').blocks.map((b) => b.text), ['Done: hello.txt says y3k.'], 'in order, once');
      assert.match($$('div.cv-list > div.it.as').pop().textContent, /^Done: hello\.txt says y3k\.$/);
      assert.deepEqual(moved, ['color/gold'], 'and once');
      cv.close();
    } finally { offline(); globalThis.fetch = realFetch; }
  });

  await ok('the view: a live session that streamed in ahead of its start (the desktop app, its ring rolled) is read from its file, keeping its streamed words and the lines to the presence', async () => {
    let push = null;
    let answerHello = null;
    const sent = [];
    const disk = [...onDisk, { sid, type: 'message.start', id: 'g1', seq: 130 }];
    window.y3kCode = {
      cmd: async (o) => {
        sent.push(o);
        if (o.cmd === 'engine.hello') return new Promise((resolve) => { answerHello = () => resolve({ ok: true, name: 'y3k-code', providers: [], recent: [], sessions: [{ sid, state: 'running' }] }); });
        if (o.cmd === 'session.load') return { ok: true, sid: o.sid, live: true, meta: null, events: disk.slice() };
        return { ok: true };
      },
      onEvent: (fn) => { push = fn; return () => {}; },
      // the ring has rolled past the session's start: its newest events only,
      // a reply only ever streamed (Gemini CLI's, over ACP)
      since: async () => [
        live({ type: 'message.start', id: 'g1', seq: 130 }),
        live({ type: 'message.delta', id: 'g1', block: 1, kind: 'text', text: 'This repo is ', seq: 131 }),
        live({ type: 'message.delta', id: 'g1', block: 1, kind: 'text', text: 'a social site.', seq: 132 }),
      ],
    };
    try {
      const cv = await viewWith('bare', { link: { companion: () => ({ name: 'Orion' }), talk: () => {} } });
      cv.open();
      const S = cv._state;
      await until(() => answerHello);
      tick();
      assert.equal(S.sessions.get(sid).cwd, '', 'bare: no folder, no history');
      // opened, and a line said to the presence there, before the hello is answered
      $('button.cv-tab').click();
      tick();
      $('button.cv-who').click();
      const ta = $('textarea.cv-input');
      ta.value = 'what is this repo?';
      ta.dispatch('keydown', { key: 'Enter' });
      $('button.cv-who').click();
      answerHello();
      await until(() => S.sessions.get(sid)?.cwd === '/tmp/live1');
      await settle(20);
      tick();
      const s = S.sessions.get(sid);
      assert.deepEqual(s.items.map((i) => i.kind), ['user', 'assistant', 'tool', 'permission', 'assistant', 'orion'], 'its history, then what the page had');
      assert.deepEqual(s.byKey.get('m:g1').blocks.map((b) => b.text), ['This repo is a social site.'], 'the streamed words, never in its file');
      assert.equal(s.items.at(-1).text, 'what is this repo?');
      assert.equal(s.waiting, 1);
      assert.equal(sent.filter((o) => o.cmd === 'session.load').length, 1, 'read once');
      // what streams on goes in after it, once
      push(live({ type: 'message.delta', id: 'g1', block: 1, kind: 'text', text: ' Mostly.', seq: 133 }));
      push(live({ type: 'message.end', id: 'g1', seq: 134 }));
      await settle();
      tick();
      assert.deepEqual(s.byKey.get('m:g1').blocks.map((b) => b.text), ['This repo is a social site. Mostly.']);
      assert.ok([...$$('div.cv-list > div.it.as')].some((el) => /This repo is a social site\. Mostly\./.test(el.textContent)));
      assert.equal($$('div.cv-list > div.it.or').length, 1);
      cv.close();
    } finally { delete window.y3kCode; }
  });
}

await ok('the stylesheet: a rise only on entry, a pane frosted only at the top tier, motion on the compositor, stilled in smooth', () => {
  const css = read('styles.css');
  const code = css.slice(css.indexOf('/* ===== y3k CODE'));
  assert.match(code, /\n\.it \{ min-width: 0; \}/, '.it itself does not animate');
  assert.match(code, /\n\.it\.enter \{ animation: cv-rise /);
  // 2026-10-06: the room runs behind the pane now, so the pane is glass — but
  // the blur is a viewport-scale one and follows the tier: only at
  // data-glass="all", never in the base rule, solid in smooth.
  const pane = code.slice(code.indexOf('.cv-pane {'), code.indexOf('}', code.indexOf('.cv-pane {')));
  assert.ok(!/backdrop-filter/.test(pane), 'the pane blurs at every tier — gfx.js measured that at 12 → 20 fps');
  assert.match(code, /html\[data-glass="all"\] \.cv-pane \{[^}]*backdrop-filter: blur/, 'the pane is not frosted at the top tier');
  assert.match(code, /html\[data-gfx="smooth"\] \.cv-pane \{ background: var\(--lg-1\), linear-gradient\(180deg, #171a21, #0b0d11\); \}/, 'the pane is not solid in smooth');
  // and the last word on the ground is the room's: the liquid-glass block
  // paints its own still ground, and this rule, after it, takes it away
  const last = code.lastIndexOf('.code-root { background: transparent; }');
  assert.ok(last > code.indexOf('y3kode IN LIQUID GLASS'), 'the kode root has a ground of its own again, after the glass — the hard break at the orb\'s column');
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

await ok('liquid glass: every action its own panel, drawn not blurred, settling in on the compositor, stilled for less motion', () => {
  const css = read('styles.css');
  const lg = css.slice(css.indexOf('/* ===== y3kode IN LIQUID GLASS'), css.indexOf('/* ===== A FINGER IS NOT A CURSOR'));
  assert.ok(lg.length > 2000, 'the glass block is there');
  // every kind of item wears the rim, and so do the composer, send/stop and the mark
  const rim = lg.slice(0, lg.indexOf('{', lg.indexOf('/* the rim:')));
  for (const sel of ['.it.us::after', '.it.as::after', '.it.tl::after', '.it.or::after', '.it.sys::after', '.it.pm::after', '.it.qs::after', '.it.pl::after',
    '.cv-pane::after', '.cv-bar::after', '.cv-composer::after', '.cv-whoface::after', '.cv-send::after']) assert.ok(rim.includes(sel), sel + ' has no rim');
  // drawn, not computed: the one live blur is the drawer's, and only where the
  // glass is all. It runs the pane's full height over a transcript that moves on
  // every frame of a turn, so it is a viewport-scale blur, and small (mid, the
  // default tier) drops those.
  const blurs = (lg.match(/[^;{}]*backdrop-filter:[^;]*/g) || []).filter((b) => !/backdrop-filter: none$/.test(b));
  assert.ok(blurs.every((b) => /blur\(24px\)/.test(b)) && blurs.length === 2, 'a panel blurs: ' + blurs.join(' | '));
  assert.match(lg, /\n\.cv-drawer \{[^}]*backdrop-filter: blur\(24px\)/);
  const unfrosted = /\n:root:is\(\[data-glass="small"\], \[data-glass="none"\]\) \.cv-drawer \{([^}]*)\}/.exec(lg);
  assert.ok(unfrosted, 'the drawer still re-blurs a streaming turn at small, every frame');
  assert.match(unfrosted[1], /backdrop-filter: none; -webkit-backdrop-filter: none;/);
  // drawn glass, dense: a thin body would show the transcript through it sharp
  const body = [...unfrosted[1].matchAll(/rgba\((?!255, 255, 255)\d+, \d+, \d+, ([\d.]+)\)/g)].map((m) => +m[1]);
  assert.ok(body.length >= 2 && body.every((a) => a >= 0.94), 'the unfrosted drawer is see-through: ' + body.join(', '));
  // settling in moves only transform and opacity (the blur-melt only on high, never with less motion)
  const kf = (name) => (lg.match(new RegExp(`@keyframes ${name} \\{[^\\n]*`)) || [''])[0];
  assert.ok(kf('lg-in') && !/filter|top|left|height|width|margin/.test(kf('lg-in').replace(/@keyframes lg-in/, '')), kf('lg-in'));
  assert.match(lg, /:root\[data-gfx="high"\]:not\(\[data-motion="less"\]\) \.code-root \.it\.enter \{ animation-name: lg-melt; \}/);
  assert.match(lg, /:root\[data-motion="less"\] \.code-root \.it\.enter::before \{ display: none; \}/);
  // less motion and Smooth still the entry (the Code block's own list covers .it)
  assert.ok(css.includes(':root:is([data-gfx="smooth"], [data-motion="less"]) :is(.code-root, .code-root .it, .cv-drawer),'));
  // the glint is not the item's settling: enter() waits for the item's own animation
  assert.match(read('src/code/code-view.js'), /e\.target !== el \|\| e\.pseudoElement/);
  // send is a clear bead, stop a red one
  assert.match(lg, /\.cv-pane \.cv-send \{[^}]*radial-gradient/);
  assert.match(lg, /\.cv-pane \.cv-send\.stop \{[^}]*rgba\(255, 81, 71/);
});

await ok('who answers: the maker\'s mark and the model; pressed, a small orb — the presence alone', async () => {
  const { makerOf, modelName, makerMark } = await import('../src/code/render/maker.js');
  assert.equal(makerOf('claude'), 'anthropic');
  assert.equal(makerOf('codex'), 'openai');
  assert.equal(makerOf('gemini'), 'google');
  assert.equal(makerOf('opencode', 'anthropic/claude-x'), 'anthropic', 'OpenCode wears the mark of the model it runs');
  assert.equal(makerOf('opencode', 'openai/gpt-x'), 'openai');
  assert.equal(makerOf('opencode', 'ollama/some-model'), 'opencode');
  assert.equal(modelName('claude-sonnet-7-2-20990101'), 'Sonnet 7.2');
  assert.equal(modelName('claude-opus-8[1m]'), 'Opus 8');
  assert.equal(modelName('gpt-9-codex'), 'GPT-9 Codex');
  assert.equal(modelName('gemini-9.5-pro'), '9.5 Pro');
  assert.equal(modelName('anthropic/claude-haiku-6-1'), 'Haiku 6.1');
  assert.equal(modelName(null), 'default');
  assert.equal(modelName('default'), 'default');
  for (const m of ['anthropic', 'openai', 'google', 'opencode']) assert.equal(makerMark(m).tagName.toLowerCase(), 'svg');
  const view = read('src/code/code-view.js');
  assert.ok(!/cv-tobtn|'div\.cv-to'/.test(view), 'the two-way switch is gone');
  assert.match(view, /talkTo = talkTo === 'orion' \? 'coder' : 'orion'/, 'one press each way');
  assert.match(view, /who\.classList\.toggle\('orion', toOrion\)/, 'the same button turns, so the turn is a transition');
  const css = read('styles.css');
  assert.match(css, /\.cv-who\.orion \.cv-whomark \{ opacity: 0;/);
  assert.match(css, /\.cv-who\.orion \.cv-whoorb \{ opacity: 1; transform: none; \}/);
  assert.match(css, /:root\[data-motion="less"\] \.cv-who\.orion \.cv-whoorb::before \{ animation: none; \}/);
});

await ok('the coder moving the orb: a bead in the orb\'s colours, with why when it did not', () => {
  const ok1 = renderItem({ uid: 9200, kind: 'tool', tkind: 'mcp', name: 'mcp__y3k__orb', title: 'y3k · orb', input: { kommand: 'color/gold/form/heart' }, status: 'ok', output: { text: 'The orb moved: color/gold/form/heart' } }, noCtx);
  assert.ok(ok1.classList.contains('orbcall'));
  assert.match(ok1.textContent, /moved the orb/);
  assert.equal(ok1.querySelector('.orb-k').textContent, 'color/gold/form/heart');
  const no = renderItem({ uid: 9201, kind: 'tool', tkind: 'mcp', name: 'y3k_orb', input: { kommand: 'form/blob' }, status: 'error', output: { text: 'The orb did not move: there is no form called blob — try sphere' } }, noCtx);
  assert.match(no.textContent, /the orb did not move/);
  assert.equal(no.querySelector('.orb-why').textContent, 'there is no form called blob — try sphere');
  // anyone else's tool that happens to be called orb is still a tool card
  const other = renderItem({ uid: 9202, kind: 'tool', tkind: 'mcp', name: 'mcp__weather__orb', input: { kommand: 'x' }, status: 'ok' }, noCtx);
  assert.ok(!other.classList.contains('orbcall'));
  // and a move from the engine goes to the house's kommands, answered back; replays are not played again
  const view = read('src/code/code-view.js');
  assert.match(view, /if \(e\.type === 'orb\.move'\) \{ moveOrb\(e\); return; \}/);
  assert.match(view, /cmd\(\{ cmd: 'orb\.done', move:/);
  assert.match(view, /Math\.abs\(Date\.now\(\) - e\.at\) > 10000/);
  const main = read('src/main.js');
  const k = main.slice(main.indexOf('  kommand(text) {'), main.indexOf('  async setup() {'));
  assert.match(k, /if \(busy\) return \{ ok: false/, 'never over the presence\'s own turn');
  assert.match(k, /isHosting\(\)\) return \{ ok: false/, 'never over a broadcast');
  assert.match(k, /applyKommand\(/);
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

// --- y3k's dropdown (src/glass-select.js) ---------------------------------------
// The toolbar's Model and Thinking, and every select in Settings, under the same
// stand-in DOM. Keys arrive as a browser delivers them: at the focused element,
// then up through its parents until a listener stops them.
console.log('\ny3k\'s dropdown:');
{
  const realWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1200, innerHeight: 800 };
  // a value set from code goes through the select's own setter, as in a browser
  const elProto = Object.getPrototypeOf(document.createElement('select'));
  globalThis.HTMLSelectElement = function HTMLSelectElement() {};
  Object.defineProperty(globalThis.HTMLSelectElement.prototype, 'value', Object.getOwnPropertyDescriptor(elProto, 'value'));
  const { glassSelect } = await import('../src/glass-select.js');
  const press = (key) => {
    let stopped = false;
    const at = document.activeElement;
    const ev = { type: 'keydown', key, target: at, preventDefault() {}, stopPropagation() { stopped = true; } };
    for (let n = at; n && !stopped; n = n.parentNode) for (const fn of [...(n.listeners?.keydown || [])]) fn({ ...ev, currentTarget: n });
  };
  const dropdown = (n, { label = 'Model', row = null, other = null } = {}) => {
    const sel = document.createElement('select');
    if (label) sel.setAttribute('aria-label', label);
    for (let k = 0; k < n; k++) { const o = document.createElement('option'); o.value = 'm' + k; o.textContent = 'Model ' + k; sel.appendChild(o); }
    sel.value = 'm0';
    const changes = [];
    sel.dispatchEvent = (e) => { changes.push(sel.value); sel.dispatch(e.type); };
    // the stand-in has no replaceChild; a row in Settings holds its select already
    if (row) { row.replaceChild = (n, was) => { row.insertBefore(n, was); return row.removeChild(was); }; row.appendChild(sel); }
    const wrap = glassSelect(sel, other ? { other } : {});
    if (!row) document.body.appendChild(wrap);
    return { sel, wrap, btn: wrap.querySelector('button.gs-btn'), changes };
  };
  const pop = () => document.querySelector('div.gs-pop');
  const optRows = () => [...document.querySelectorAll('div.gs-pop div.gs-opt')];
  const lit = () => optRows().findIndex((r) => r.classList.contains('active'));

  await ok('the dropdown: arrows move one row at a time, from the filter of a long list as from the button of a short one', () => {
    const long = dropdown(12);
    long.btn.click();
    assert.equal(document.activeElement.className, 'gs-filter', 'twelve options grow a filter, and it has focus');
    assert.equal(lit(), 0);
    press('ArrowDown'); assert.equal(lit(), 1, 'one ArrowDown, one row');
    press('ArrowDown'); assert.equal(lit(), 2);
    press('ArrowUp'); assert.equal(lit(), 1);
    press('Enter');
    assert.deepEqual(long.changes, ['m1'], 'Enter picks the lit row, once');
    assert.ok(!pop() && document.activeElement === long.btn, 'the list closes back to its button');
    long.btn.click();
    const f = document.activeElement;
    f.value = 'model 1';
    f.dispatch('input');
    assert.deepEqual(optRows().map((r) => r.textContent), ['Model 1', 'Model 10', 'Model 11']);
    press('ArrowDown'); assert.equal(lit(), 1, 'filtered, still one row');
    press('Escape');
    const short = dropdown(5);
    short.btn.focus();
    press('ArrowDown');
    assert.ok(pop() && document.activeElement === short.btn, 'five options: no filter, focus stays on the button');
    press('ArrowDown'); assert.equal(lit(), 1);
    press('ArrowDown'); assert.equal(lit(), 2);
    press('ArrowUp'); assert.equal(lit(), 1);
    press('Escape');
    long.wrap.remove(); short.wrap.remove();
  });

  await ok('the dropdown is heard: its name carries the choice, the arrows name the row, Tab goes on from the button', () => {
    const d = dropdown(12, { other: { label: 'Another model…', placeholder: 'a model name', pick() {} } });
    assert.equal(d.btn.getAttribute('role'), 'combobox');
    assert.equal(d.btn.getAttribute('aria-label'), 'Model, Model 0', 'the label and the value it shows');
    d.sel.value = 'm3';
    assert.equal(d.btn.getAttribute('aria-label'), 'Model, Model 3', 'a value set from code renames it');
    d.btn.click();
    const list = document.querySelector('div.gs-pop div.gs-list');
    assert.equal(pop().getAttribute('role'), null, 'the filter is not inside the listbox');
    assert.equal(list.getAttribute('role'), 'listbox');
    assert.equal(list.getAttribute('aria-label'), 'Model');
    assert.equal(d.btn.getAttribute('aria-controls'), list.getAttribute('id'));
    const f = document.activeElement;
    assert.deepEqual([f.getAttribute('role'), f.getAttribute('aria-controls'), f.getAttribute('aria-autocomplete')], ['combobox', list.getAttribute('id'), 'list']);
    press('ArrowDown');
    const row = optRows()[lit()];
    assert.equal(f.getAttribute('aria-activedescendant'), row.getAttribute('id'), 'the focused filter names the lit row');
    assert.equal(row.getAttribute('role'), 'option');
    const ids = optRows().map((r) => r.getAttribute('id'));
    assert.ok(ids.every(Boolean) && new Set(ids).size === ids.length, 'every row, "Another model…" too, has its own id');
    assert.equal(optRows().at(-1).getAttribute('aria-selected'), 'false');
    press('Tab');
    assert.ok(!pop() && document.activeElement === d.btn, 'Tab from the filter leaves from the button, not from nowhere');
    assert.equal(d.btn.getAttribute('aria-expanded'), 'false');
    assert.equal(d.btn.getAttribute('aria-activedescendant'), null);
    // a short list: the button itself is the one that names the row
    const s = dropdown(4, { label: 'Thinking effort' });
    s.btn.focus();
    press('ArrowDown'); press('ArrowDown');
    assert.equal(s.btn.getAttribute('aria-activedescendant'), optRows()[1].getAttribute('id'));
    press('Enter');
    assert.equal(s.btn.getAttribute('aria-label'), 'Thinking effort, Model 1', 'a pick renames it');
    // typing "Another model…" and tabbing away closes the list too
    d.btn.click();
    optRows().at(-1).click();
    const typed = document.activeElement;
    assert.equal(typed.className, 'gs-input');
    assert.ok(typed.getAttribute('aria-label'));
    press('Tab');
    assert.ok(!pop() && document.activeElement === d.btn);
    // in Settings the words beside a select are its label
    const r = document.createElement('div');
    r.className = 'row';
    const words = document.createElement('span');
    words.textContent = 'Frame rate';
    r.appendChild(words);
    document.body.appendChild(r);
    const fps = dropdown(3, { label: null, row: r });
    assert.equal(fps.btn.getAttribute('aria-label'), 'Frame rate, Model 0');
    d.wrap.remove(); s.wrap.remove(); r.remove();
  });
  delete globalThis.HTMLSelectElement;
  globalThis.window = realWindow;
}

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
    // `history` in main.js is the conversation (createHistory), so the bare name
    // made dropHash and the ?auth_error cleanup a TypeError: #code stayed, and
    // every reload opened Code again (2026-10-02)
    assert.match(main, /const dropHash = \(\) => \{ try \{ window\.history\.replaceState\(/);
    assert.match(main, /showLoginError\(err\);\s*window\.history\.replaceState\(null, '', location\.pathname\);/);
    assert.ok(!/(?<![\w.])history\.(replaceState|pushState|back|forward|go)\(/.test(main), 'a History call through the conversation\'s name');
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
  await ok('the microphone (2026-10-06): one button in the composer, the words go to the composer and nowhere else', () => {
    const main = read('src/main.js');
    const cv = read('src/code/code-view.js');
    // THE DICTATION LEASE. While Code holds it, a transcript goes to Code's
    // handler and returns BEFORE the caption and the presence's turn: the
    // coder's words never become a turn of orion's, and orion never hears them.
    const onT = main.slice(main.indexOf('onTranscript: ({ text, final }) => {'), main.indexOf('onTranscript: ({ text, final }) => {') + 400);
    assert.ok(onT.indexOf('if (dictation)') > 0 && onT.indexOf('if (dictation)') < onT.indexOf("showCaption(text, 'you')"), 'a dictated word reaches the caption or the presence');
    assert.match(onT, /if \(dictation\) \{[^\n]*dictation\.onText\(\{ text, final \}\)[^\n]*return; \}/, 'the lease does not take the words');
    assert.match(main, /^let dictation = null;/m, 'no lease');
    assert.match(main, /^function dictate\(handlers\) \{/m, 'nothing hands the lease out');
    assert.match(main, /stopVoiceMode\(\);\s*\/\/ the chat's continuous mode/, 'taking the lease does not end the chat\'s own voice mode — two owners of one microphone');
    assert.match(main, /^  dictate,\n  listenAgain: \(\) => armDictation\(\),\n  canDictate: \(\) => voice\.sttSupported,/m, 'the lease is not on the code link');
    // the composer: a mic button, lit while listening, hands-free on shift
    assert.match(cv, /h\('button\.cv-iconbtn\.cv-mic'/, 'no microphone in the composer');
    assert.match(cv, /micBtn\.addEventListener\('click', \(e\) => toggleMic\(e\.shiftKey\)\);/, 'shift-click is not hands-free');
    assert.match(cv, /if \(mic\.loop\) \{\s*if \(target\) \{ mic\.base = ''; target\.send\(\); return; \}\s*const s = currentSession\(\);\s*if \(s\) \{ mic\.base = ''; send\(s, ta\); \}/, 'hands-free does not send a finished utterance');
    assert.match(cv, /if \(mic\.release\) stopMic\(\);\s*\/\/ the microphone is never left open behind a closed room/, 'leaving Code can leave the microphone open');
    assert.match(cv, /if \(e\.key === 'Escape'\) \{\s*if \(e\.isComposing \|\| e\.keyCode === 229\) return;\s*if \(mic\.release\) \{ e\.preventDefault\(\); stopMic\(\); return; \}/, 'Esc does not stop the microphone first (after the IME guard)');
    // a hand cannot press it (synthetic clicks cannot open a microphone)
    assert.ok(read('src/reach.js').match(/const REFUSED = '([^']+)'/)[1].includes('.cv-mic'), 'a hand can press the microphone button');
  });

  await ok('the model menu marks the session\'s own model, not every id it contains; mid-session it asks first (2026-10-07)', () => {
    const cv = read('src/code/code-view.js');
    // the matcher, cut out and run against what Claude Code's initialize
    // actually returned on this machine on 2026-10-06
    const at = cv.indexOf('  function pickOption(opts, cur) {');
    assert.ok(at > 0, 'pickOption is gone');
    const src = cv.slice(at, cv.indexOf('\n  }\n', at) + 4);
    const pickOption = new Function(src + '\nreturn pickOption;')();
    const opts = [
      { id: 'default', label: 'Default (recommended)', resolved: 'claude-opus-5-5' },
      { id: 'opus', label: 'Opus', resolved: 'claude-opus-5-5' },
      { id: 'claude-fable-5-1[1m]', label: 'Fable', resolved: 'claude-fable-5-1' },
      { id: 'sonnet', label: 'Sonnet', resolved: 'claude-sonnet-5-5' },
      { id: 'haiku', label: 'Haiku', resolved: 'claude-haiku-4-5-20251001' },
    ];
    assert.equal(pickOption(opts, 'claude-fable-5-1[1m]')?.label, 'Fable', 'the id as the menu sent it');
    assert.equal(pickOption(opts, 'claude-fable-5-1')?.label, 'Fable', 'the id without its window suffix');
    assert.equal(pickOption(opts, 'claude-sonnet-5-5')?.label, 'Sonnet', 'the resolved id of an alias');
    assert.equal(pickOption(opts, 'opus')?.label, 'Opus');
    // the bug: a longer id containing a shorter one lit both, and the last won
    const two = [{ id: 'claude-fable-5', label: 'Fable 5' }, { id: 'claude-fable-5-1', label: 'Fable 5.1' }];
    assert.equal(pickOption(two, 'claude-fable-5-1')?.label, 'Fable 5.1', 'Fable 5.1 drawn as Fable 5');
    assert.equal(pickOption([...two].reverse(), 'claude-fable-5-1')?.label, 'Fable 5.1', 'the order of the list decides it');
    assert.equal(pickOption(two, 'claude-fable-5-1-20991231')?.label, 'Fable 5.1', 'a dated id is matched by the longest option it contains');
    assert.equal(pickOption(two, 'gpt-9'), null, 'a model the list does not have is not guessed');
    // only one option is ever selected
    assert.ok(/if \(o === chosen\) op\.selected = true;/.test(cv), 'the menu marks more than one option');
    // mid-session, a change is asked first, and Cancel puts the menu back
    const set = cv.slice(cv.indexOf('    const setModel = async (model) => {'), cv.indexOf("    sel.dataset.was = sel.value;"));
    assert.match(set, /const spoken = s\.items\.some\(\(i\) => i\.kind === 'user'\);/, 'the warning is not tied to there being a conversation');
    assert.match(set, /if \(spoken\) \{[\s\S]*?await confirmDialog\(/, 'a change mid-session is not asked');
    assert.match(set, /if \(!go\) \{ back\(\); return; \}/, 'Cancel does not put the menu back');
    assert.ok(set.indexOf('confirmDialog') < set.indexOf("cmd({ cmd: 'session.setModel'"), 'the model changes before the question is answered');
    // the dialog has the keyboard while open, and is never left behind
    assert.match(cv, /function onKey\(e\) \{\n    if \(!root\) return;\n    if \(onDialogKey\(e\)\) return;/, 'the room\'s keys act behind an open question');
    assert.match(cv, /if \(dialog\.el\) closeDialog\(false\);\n    closeSlash\(\); slash\.el = null;\n    closePanel\(\);/, 'leaving Code can leave a question (or the slash menu) open');
    // and the adapter passes the resolved id along, for the match above
    assert.match(read('y3k-code/adapters/claude.mjs'), /resolved: m\.resolvedModel \|\| ''/, 'the resolved id is dropped');
  });

  await ok('planning with the presence (2026-10-06): a thread before there is a coder, and a line of it becomes the prompt by the person\'s hand', () => {
    const cv = read('src/code/code-view.js');
    assert.match(cv, /^  let plan = \{ items: \[\], draft: '', waiting: false, rev: 0/m, 'no planning thread');
    assert.match(cv, /function planCard\(\) \{/, 'no planning card');
    // every screen without a session carries it: planning needs no engine
    assert.match(cv, /const withPlan = \(screen\) => \{ const card = planCard\(\);/, 'the card is not on the setup screens');
    assert.match(cv, /return withPlan\(ob\.firstRun\(/, 'the first-run screen has no planning card');
    assert.match(cv, /planCard\(\),\s*draft\.trim\(\) \? h\('div\.cv-note'/, 'the folders screen has no planning card, or does not say a prompt is waiting');
    // what is said goes to the presence as a private turn, through the link — never to the engine
    const send = cv.slice(cv.indexOf('function planSend()'), cv.indexOf('function planUse('));
    assert.match(send, /link\.talk\(text\);/, 'the plan does not talk to the presence');
    assert.ok(!/cmd\(/.test(send), 'the planning thread reaches the engine');
    // the reply lands in the thread only when no session is on screen
    const chat = cv.slice(cv.indexOf('function onChat(ev)'), cv.indexOf('function schedule('));
    assert.match(chat, /if \(!s\) \{[\s\S]*?if \(!plan\.waiting\) return;[\s\S]*?plan\.items\.push\(\{ who: 'presence'/, 'a reply with no session on screen is dropped, or lands when nothing was asked');
    // a line becomes the prompt by being copied into the draft — the person sends it
    const use = cv.slice(cv.indexOf('function planUse('), cv.indexOf('function planMicDraw('));
    assert.match(use, /setDraft\(String\(text \|\| ''\)\.trim\(\)\);/, 'use-as-prompt does not go into the composer');
    assert.ok(!/send\(|cmd\(/.test(use), 'use-as-prompt sends on its own');
    assert.match(cv, /`In the message box for the coder — pick a folder and send it\.`/, 'the person is not told where the words went');
    // it never thinks forever
    assert.match(send, /plan\.timer = setTimeout\(/, 'no timeout on the presence\'s answer');
  });
  delete globalThis.document; delete globalThis.window; delete globalThis.Node;
}
console.log(`\n${passed} checks passed.`);
process.exit(0);
