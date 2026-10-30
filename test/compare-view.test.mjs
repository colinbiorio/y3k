// KODE'S COMPARE VIEW. Run:  node test/compare-view.test.mjs
//
// Colin asked about "cross-model collaboration" (2026-10-19) and said kode
// "can be majorly improved" (2026-10-21). /compare put each second opinion in
// a tab of its own; now a group holds them, a strip says how many are still
// answering, and a view shows the answers side by side with "use this" and
// "stop the others". Checked here, with no DOM: the group's life (opened,
// closed by the person, ended when every aside ends), the answers assembled
// from the sessions' own items (text, state, model, tok/s, cost), a failed
// and a stopped aside; and, as text, that "use this" writes the composer and
// never sends (CODE.md, line 1: the person drives the coder — not the
// presence, and not a second coder). Then the screen itself, under the
// stand-in DOM: the strip, the columns, use this, stop the others, Esc.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState, apply, openCompare, closeCompare, compareOf, compareEnded, compareAnswers, stillAnswering, ANSWERING } from '../src/code/state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
// `replay`: as events read back from the engine's file go in (no live writing
// rate is kept for those); false feeds them as the stream would
const feed = (S, sid, list, replay = true) => { for (const e of list) apply(S, { sid, ...e }, { replay }); return S.sessions.get(sid); };

const Q = 'why is the build slow?';
// a session that took the question and answered it, with the tool's own
// numbers: `cost` is the running total before and after the turn (null: a
// tool that reports none)
const answered = (provider, model, words, { tout = 300, apiMs = 3000, cost = [0.4, 0.52] } = {}) => [
  { type: 'session.started', provider, cwd: '/w', mode: 'plan' },
  { type: 'session.ready', model },
  { type: 'session.state', state: 'idle' },
  { type: 'message.user', text: Q },
  ...(cost ? [{ type: 'usage.cost', totalUsd: cost[0] }] : []),
  { type: 'turn.started', t: 1000 },
  { type: 'message.start', id: 'm1', model },
  ...words.map((w) => ({ type: 'message.delta', id: 'm1', block: 0, kind: 'text', text: w, t: 1500 })),
  { type: 'message.end', id: 'm1' },
  { type: 'usage.turn', inputTokens: 1000, outputTokens: tout, durationMs: 5000, apiMs },
  ...(cost ? [{ type: 'usage.cost', totalUsd: cost[1] }] : []),
  { type: 'turn.ended', status: 'success', t: 6000 },
];

console.log('the group:');

await ok('a group holds the question, the session asked from and the asides; compareOf finds it for each, and nothing else', () => {
  const S = createState();
  assert.ok(S.compares instanceof Map, 'createState has the groups');
  const g = openCompare(S, { question: Q, main: 'main1', asides: ['a1'], at: 123 });
  assert.deepEqual(Object.keys(g).sort(), ['asides', 'at', 'closed', 'id', 'main', 'question']);
  assert.equal(g.question, Q); assert.equal(g.main, 'main1'); assert.deepEqual(g.asides, ['a1']); assert.equal(g.at, 123); assert.equal(g.closed, false);
  assert.equal(S.compares.get(g.id), g);
  assert.equal(compareOf(S, 'main1'), g);
  assert.equal(compareOf(S, 'a1'), g);
  assert.equal(compareOf(S, 'other'), null);
  assert.equal(compareOf(S, null), null);
  // the asides join as they start: the array is the group's own
  g.asides.push('a2');
  assert.equal(compareOf(S, 'a2'), g);
  // a second group for the same main: the newest is its own
  const g2 = openCompare(S, { question: 'and the tests?', main: 'main1' });
  assert.notEqual(g2.id, g.id);
  assert.equal(compareOf(S, 'main1'), g2);
  assert.equal(compareOf(S, 'a1'), g, 'the aside is only in the first');
});

await ok('a group with no asides yet is not ended (they are being started); closed by the person, it is', () => {
  const S = createState();
  const g = openCompare(S, { question: Q, main: 'm' });
  assert.equal(compareEnded(S, g), false);
  assert.equal(compareOf(S, 'm'), g);
  assert.equal(closeCompare(S, g.id), g);
  assert.equal(g.closed, true);
  assert.equal(compareEnded(S, g), true);
  assert.equal(compareOf(S, 'm'), null, 'closed: no longer anyone\'s');
  assert.equal(closeCompare(S, 'nope'), null);
  assert.equal(compareEnded(S, null), true);
});

await ok('a group ends when every aside session has ended — not before', () => {
  const S = createState();
  feed(S, 'm', [{ type: 'session.started', provider: 'claude', cwd: '/w', mode: 'ask' }]);
  feed(S, 'a1', [{ type: 'session.started', provider: 'codex', cwd: '/w', mode: 'plan' }]);
  feed(S, 'a2', [{ type: 'session.started', provider: 'gemini', cwd: '/w', mode: 'plan' }]);
  const g = openCompare(S, { question: Q, main: 'm', asides: ['a1', 'a2'] });
  assert.equal(compareEnded(S, g), false);
  feed(S, 'a1', [{ type: 'session.ended', reason: 'stopped' }]);
  assert.equal(compareEnded(S, g), false, 'one of two ended');
  assert.equal(compareOf(S, 'm'), g);
  feed(S, 'm', [{ type: 'session.ended', reason: 'stopped' }]);
  assert.equal(compareEnded(S, g), false, 'the main ending does not end it: the second opinions are still there to read');
  feed(S, 'a2', [{ type: 'session.ended', reason: 'exited' }]);
  assert.equal(compareEnded(S, g), true, 'every aside ended');
  assert.equal(compareOf(S, 'm'), null);
  assert.equal(compareOf(S, 'a2'), null);
  // an aside the page never heard of counts as not ended (its events are on the way)
  const g2 = openCompare(S, { question: Q, main: 'm', asides: ['ghost'] });
  assert.equal(compareEnded(S, g2), false);
});

console.log('\nthe answers:');

await ok('answers are assembled from the sessions\' items, the one asked from first: label, model, text, state, tok/s and cost', () => {
  const S = createState();
  S.providers = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex' }, { id: 'gemini', label: 'Gemini CLI' }];
  // the main: an older exchange first, then the question
  feed(S, 'm', [
    { type: 'session.started', provider: 'claude', cwd: '/w', mode: 'ask', model: 'claude-sonnet-4-5' },
    { type: 'message.user', text: 'hello' }, { type: 'turn.started', t: 1 }, { type: 'message.block', id: 'm0', block: 0, kind: 'text', text: 'Hi.' }, { type: 'turn.ended', status: 'success', t: 2 },
    ...answered('claude', 'claude-opus-4-1', ['The build runs ', 'every test twice.\n\n', '- drop the second run'], { tout: 200, apiMs: 2000, cost: [0.25, 0.75] }).slice(3),
  ]);
  feed(S, 'a1', answered('codex', 'gpt-5-codex', ['Cache the ', 'dependencies.'], { tout: 150, apiMs: 0, cost: null }));
  // still writing, as the stream brings it (not a replay: the live rate counts)
  feed(S, 'a2', [
    { type: 'session.started', provider: 'gemini', cwd: '/w', mode: 'plan', model: 'gemini-2.5-pro' },
    { type: 'session.ready', model: 'gemini-2.5-pro' }, { type: 'session.state', state: 'idle' },
    { type: 'message.user', text: Q }, { type: 'turn.started', t: 1000 },
    { type: 'message.delta', id: 'g1', block: 0, kind: 'thinking', text: 'hmm', t: 1200 },
    { type: 'message.delta', id: 'g1', block: 1, kind: 'text', text: 'Parallelise the', t: 1400 },
  ], false);
  const g = openCompare(S, { question: Q, main: 'm', asides: ['a1', 'a2'] });
  const out = compareAnswers(S, g, 1500);
  assert.deepEqual(out.map((a) => a.sid), ['m', 'a1', 'a2'], 'the main first, then the asides in order');
  const [m, c, ge] = out;
  for (const a of out) assert.deepEqual(Object.keys(a).sort(), ['cost', 'label', 'live', 'main', 'model', 'ms', 'plan', 'provider', 'sid', 'state', 'text', 'tokens', 'tps', 'tpsRough']);
  assert.equal(m.main, true); assert.equal(c.main, false);
  assert.deepEqual([m.provider, m.label, m.model], ['claude', 'Claude Code', 'claude-opus-4-1'], 'the model the reply was written with, not the one it started on');
  assert.equal(m.text, 'The build runs every test twice.\n\n- drop the second run', 'only what came after the question');
  assert.equal(m.state, 'done');
  assert.equal(m.tps, 100, '200 output tokens over the model\'s own 2s');
  assert.equal(m.tpsRough, false);
  assert.equal(m.cost, 0.5, 'the running total after less before');
  assert.equal(m.tokens, 1200); assert.equal(m.ms, 5000);
  assert.deepEqual([c.label, c.model, c.text, c.state], ['Codex', 'gpt-5-codex', 'Cache the dependencies.', 'done']);
  assert.equal(c.tps, 30, 'no model time: the whole turn, marked rough');
  assert.equal(c.tpsRough, true);
  assert.equal(c.cost, null, 'a tool that reports no total gives no cost');
  assert.deepEqual([ge.label, ge.model, ge.text, ge.state, ge.plan], ['Gemini CLI', 'gemini-2.5-pro', 'Parallelise the', 'writing', false], 'thinking is not the answer; a text block open is writing');
  assert.equal(ge.tps, null); assert.equal(ge.cost, null);
  assert.ok(ge.live > 0, 'how fast it is writing now, while it is');
  assert.equal(stillAnswering(ge), true); assert.equal(stillAnswering(m), false);
  assert.deepEqual([...ANSWERING].sort(), ['starting', 'thinking', 'waiting', 'writing']);
});

await ok('the states: starting before the question is taken, thinking before words, waiting on a card, a plan proposed is done, and the answer stops at your next message', () => {
  const S = createState();
  feed(S, 'a', [{ type: 'session.started', provider: 'codex', cwd: '/w', mode: 'plan' }]);
  const g = openCompare(S, { question: Q, main: 'm', asides: ['a'] });
  let [m, a] = compareAnswers(S, g);
  assert.deepEqual([m.sid, m.state, m.text, m.provider, m.label], ['m', 'starting', '', null, ''], 'a session the page does not hold yet');
  assert.equal(a.state, 'starting', 'the question not yet taken');
  feed(S, 'a', [{ type: 'session.state', state: 'idle' }, { type: 'message.user', text: Q }]);
  assert.equal(compareAnswers(S, g)[1].state, 'thinking', 'taken, nothing said yet');
  feed(S, 'a', [{ type: 'turn.started', t: 1 }]);
  assert.equal(compareAnswers(S, g)[1].state, 'thinking');
  feed(S, 'a', [{ type: 'permission.request', requestId: 'p1', tool: 'Bash', kind: 'bash', input: { command: 'ls' } }]);
  assert.equal(compareAnswers(S, g)[1].state, 'waiting');
  feed(S, 'a', [{ type: 'permission.resolved', requestId: 'p1', decision: 'allow' }]);
  feed(S, 'a', [{ type: 'plan.proposed', requestId: 'p2', plan: '1. cache\n2. parallelise' }]);
  [, a] = compareAnswers(S, g);
  assert.deepEqual([a.state, a.plan, a.text], ['done', true, '1. cache\n2. parallelise'], 'a plan proposed is the answer, though its card waits in its tab');
  // the main: words after the question, then a follow-up of yours — the answer stops there
  feed(S, 'm', [
    { type: 'session.started', provider: 'claude', cwd: '/w', mode: 'ask' },
    { type: 'message.user', text: Q }, { type: 'turn.started', t: 1 }, { type: 'message.block', id: 'x1', block: 0, kind: 'text', text: 'First answer.' }, { type: 'turn.ended', status: 'success', t: 2 },
    { type: 'message.user', text: 'go on' }, { type: 'turn.started', t: 3 }, { type: 'message.block', id: 'x2', block: 0, kind: 'text', text: 'More.' }, { type: 'turn.ended', status: 'success', t: 4 },
  ]);
  [m] = compareAnswers(S, g);
  assert.deepEqual([m.text, m.state], ['First answer.', 'done']);
});

await ok('a failed aside, a stopped one, and one whose session ended before it answered', () => {
  const S = createState();
  feed(S, 'bad', [
    { type: 'session.started', provider: 'codex', cwd: '/w', mode: 'plan' }, { type: 'message.user', text: Q },
    { type: 'turn.started', t: 1 }, { type: 'message.delta', id: 'b1', block: 0, kind: 'text', text: 'I was', t: 2 },
    { type: 'turn.ended', status: 'error', error: 'boom', t: 3 },
  ]);
  feed(S, 'cut', [
    { type: 'session.started', provider: 'gemini', cwd: '/w', mode: 'plan' }, { type: 'message.user', text: Q },
    { type: 'turn.started', t: 1 }, { type: 'message.delta', id: 'c1', block: 0, kind: 'text', text: 'Half an', t: 2 },
    { type: 'turn.ended', status: 'interrupted', t: 3 },
  ]);
  feed(S, 'gone', [{ type: 'session.started', provider: 'opencode', cwd: '/w', mode: 'plan' }, { type: 'session.ended', reason: 'not-installed' }]);
  feed(S, 'said', [
    { type: 'session.started', provider: 'claude', cwd: '/w', mode: 'plan' }, { type: 'message.user', text: Q },
    { type: 'turn.started', t: 1 }, { type: 'message.block', id: 's1', block: 0, kind: 'text', text: 'All of it.' }, { type: 'turn.ended', status: 'success', t: 2 },
    { type: 'session.ended', reason: 'stopped' },
  ]);
  const g = openCompare(S, { question: Q, main: 'said', asides: ['bad', 'cut', 'gone'] });
  const [said, bad, cut, gone] = compareAnswers(S, g);
  assert.deepEqual([bad.state, bad.text], ['failed', 'I was'], 'what it wrote before it failed is kept');
  assert.deepEqual([cut.state, cut.text], ['stopped', 'Half an']);
  assert.deepEqual([gone.state, gone.text], ['failed', '']);
  assert.deepEqual([said.state, said.text], ['done', 'All of it.'], 'a session that ended after answering still answered');
  assert.equal(compareAnswers(S, g).filter(stillAnswering).length, 0);
  assert.equal(compareEnded(S, g), false, 'bad and cut are still running sessions');
  assert.deepEqual(compareAnswers(S, null), []);
});

console.log('\nwhat the view may do (code-view.js, as text):');
const view = read('src/code/code-view.js');
const between = (a, b) => { const i = view.indexOf(a); const j = view.indexOf(b, i + 1); assert.ok(i >= 0 && j > i, `${a} … ${b}`); return view.slice(i, j); };

await ok('"use this" puts the answer in the composer as a draft, under one line saying whose it is, and never sends it', () => {
  const use = between('function useAnswer(g, sid) {', 'async function stopOthers(g) {');
  assert.match(use, /setDraft\(`Plan from \$\{coderName\(a\)\}, from \/compare:\\n\\n\$\{a\.text\}`\);/);
  assert.ok(!/session\.send/.test(use), 'use this never sends');
  assert.ok(!/cmd\(/.test(use), 'use this asks the engine for nothing at all');
  // into the MAIN session's composer: it goes to that tab first
  assert.match(use, /if \(currentSession\(\)\?\.sid !== g\.main\) showSession\(g\.main\);/);
  assert.match(use, /talkTo = 'coder';/, 'to the coder, not the presence');
  // and the whole of the compare view sends nothing: only interrupts, on the person's press
  const whole = between('const cmp = { key: null, view: null, gid: null, cols: new Map() };', '\n  async function interrupt(s) {');
  assert.ok(!/session\.send/.test(whole), 'nothing in the compare view sends');
  assert.deepEqual([...whole.matchAll(/cmd: '([\w.]+)'/g)].map((m) => m[1]), ['session.interrupt'], 'the one command it gives the engine');
  assert.match(whole, /stop\.addEventListener\('click', \(\) => stopOthers\(g\)\);/);
  assert.match(whole, /use\.addEventListener\('click', \(\) => useAnswer\(g, a\.sid\)\);/);
});

await ok('the group is opened as /compare starts its asides, each joining as it starts and leaving if it never took the question; none asked closes it', () => {
  const cmp = between('async function compare(s, question, handoff) {', '// THE ANSWERS SIDE BY SIDE');
  assert.match(cmp, /const g = openCompare\(S, \{ question, main: s\.sid \}\);/);
  assert.match(cmp, /g\.asides\.push\(r\.sid\); moved\(\);/);
  assert.match(cmp, /if \(!\(await readyIn\(r\.sid\)\)\) \{ missed\.push\(name\); drop\(r\.sid\); moved\(\); continue; \}/);
  assert.match(cmp, /if \(q\.ok\) asked\.push\(name\); else \{ missed\.push\(name\); drop\(r\.sid\); moved\(\); \}/);
  assert.match(cmp, /if \(!asked\.length\) closeCompare\(S, g\.id\);/);
  // the strip and the view follow every session in a group, whichever tab it is in
  assert.match(view, /if \(out\.sid && S\.compares\.size\) cmpDirty = true;/);
  assert.match(view, /if \(cmpDirty \|\| switched\) \{ cmpDirty = false; renderCompareStrip\(\); renderCompareView\(\); \}/);
});

await ok('Esc closes the view before anything else and stops nothing; the strip stays; /compare alone opens it; the keys list says so', () => {
  const esc = view.indexOf("if (cmp.view && e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); closeCompareView(true); return; }");
  assert.ok(esc > 0);
  assert.ok(esc < view.indexOf('const s = currentSession();\n    if (!s || viewingSid) return;', view.indexOf('function onKey(e) {')), 'before the room\'s own Escape');
  assert.ok(!/closeCompare\(/.test(between('function closeCompareView(refocus = false) {', 'function renderCompareView() {')), 'closing the view does not end the comparison');
  assert.match(view, /const COMPARE_VIEW = \/\^\\\/compare\\s\*\$\/i;/);
  assert.match(view, /if \(COMPARE_VIEW\.test\(text\) && !attachments\.length\) \{\n\s+setDraft\(''\); recall\.i = -1; renderDock\(\);\n\s+if \(compareOf\(S, s\.sid\)\) openCompareView\(true\);/);
  assert.match(view, /\['\/compare', 'their answers side by side \(Esc closes\)'\],/);
  assert.match(view, /x\.addEventListener\('click', \(\) => endCompare\(g\)\);/, 'the strip\'s × ends the comparison');
  assert.match(between('function endCompare(g) {', 'function openCompareView('), /closeCompare\(S, g\.id\);/);
  assert.match(view, /ui\.pane\.append\(ui\.barWrap, ui\.cmp, ui\.banner, ui\.main, ui\.dock\);/, 'the strip sits under the toolbar');
  assert.match(read('package.json'), /node test\/compare-view\.test\.mjs/, 'in the chain');
  const css = read('styles.css');
  assert.match(css, /\.cv-cmpcols \{ flex: 1; min-height: 0; display: grid; grid-auto-flow: column;/);
  assert.match(css, /@media \(max-width: 900px\) \{\n  \.cv-cmpcols \{ display: flex; flex-direction: column; overflow-y: auto; \}/, 'narrow: the columns stack');
  assert.match(css, /\.cv-cmpbody \{ flex: 1; min-height: 0; overflow-y: auto;/, 'each column scrolls on its own');
  assert.match(css, /:root\[data-gfx="smooth"\] \.cv-cmp, :root\[data-gfx="low"\] \.cv-cmp \{ backdrop-filter: none;/);
});

// --- the screen itself, under the stand-in DOM (test/fakes/mini-dom.mjs) -------------
console.log('\nthe screen:');
{
  const { installDom } = await import('./fakes/mini-dom.mjs');
  installDom();
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, innerWidth: 1400 };
  globalThis.MessageChannel = undefined;
  const tick = () => { for (const f of frames.splice(0)) f(0); };
  const settle = async (n = 5) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };
  const sent = [];
  window.y3kCode = { cmd: async (o) => { sent.push(o); return { ok: true }; }, onEvent: () => () => {}, since: async () => [] };
  const asked = (c) => sent.filter((o) => o.cmd === c);
  // the keys' own selectors are lists ('input, select, …'); the stand-in DOM matches one at a time
  const proto = Object.getPrototypeOf(document.createElement('div'));
  const matchOne = proto.matches;
  proto.matches = function (sel) { return sel.split(',').some((one) => matchOne.call(this, one)); };
  const toasts = [];
  const { createCodeView } = await import('../src/code/code-view.js');
  const cv = createCodeView({ toast: (m) => toasts.push(m) });
  const S = cv._state;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  // the document's listeners, as installDom keeps them
  const addL = document.addEventListener;
  document._on = {};
  document.addEventListener = (t, fn) => { (document._on[t] ||= []).push(fn); addL(t, fn); };
  const rmL = document.removeEventListener;
  document.removeEventListener = (t, fn) => { document._on[t] = (document._on[t] || []).filter((f) => f !== fn); rmL(t, fn); };
  // a key as a browser has it: the page's capture listener, then the target's own
  const key = (k, extra = {}) => {
    let stopped = false;
    const target = extra.target || document.activeElement || document.body;
    const ev = { type: 'keydown', key: k, target, defaultPrevented: false, preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { stopped = true; }, ...extra };
    for (const fn of (document._on.keydown || []).slice()) fn(ev);
    if (!stopped) for (const fn of [...(target.listeners?.keydown || [])]) fn(ev);
    return ev;
  };

  cv._feed({ sid: 'main', type: 'session.started', provider: 'claude', cwd: '/tmp/cmp', mode: 'ask', model: 'claude-opus-4-1' });
  cv.open();
  tick();
  await settle();

  await ok('the screen: no strip until a comparison is open; then "comparing: … · N answering" under the toolbar, in the main and in each aside', () => {
    assert.ok($('div.cv-cmpstrip').hidden, 'hidden with no comparison');
    cv._feed({ sid: 'main', type: 'message.user', text: Q });
    cv._feed({ sid: 'main', type: 'turn.started', t: 1 });
    const g = openCompare(S, { question: Q, main: 'main' });
    cv._feed({ sid: 'a1', type: 'session.started', provider: 'codex', cwd: '/tmp/cmp', mode: 'plan', model: 'gpt-5-codex', title: 'Compare: ' + Q });
    g.asides.push('a1');
    cv._feed({ sid: 'a2', type: 'session.started', provider: 'gemini', cwd: '/tmp/cmp', mode: 'plan', model: 'gemini-2.5-pro', title: 'Compare: ' + Q });
    g.asides.push('a2');
    tick();
    const strip = $('div.cv-cmpstrip');
    assert.equal(strip.hidden, false);
    assert.equal(strip.querySelector('span.cv-cmplab').textContent + strip.querySelector('span.cv-cmpq').textContent + strip.querySelector('span.cv-cmpn').textContent, `comparing: ${Q} · 3 answering`);
    assert.equal(strip.previousSibling, $('div.cv-barwrap'), 'right under the toolbar');
    assert.ok($('button.cv-cmpopen'), 'with a button that opens the view');
    assert.ok(!$('div.cv-cmp'), 'the view is not open by itself');
  });
  const stripSays = () => $('div.cv-cmpstrip').querySelector('span.cv-cmpn').textContent;

  await ok('the screen: the view shows one column per coder, the main first, with mark, model, streaming words, status, tok/s and cost', () => {
    $('button.cv-cmpopen').click();
    const v = $('div.cv-cmp');
    assert.ok(v, 'the view');
    assert.equal(v.parentNode, $('div.cv-main'), 'over the transcript');
    let cols = $$('div.cv-cmpcol');
    assert.equal(cols.length, 3);
    assert.deepEqual(cols.map((c) => c.getAttribute('data-sid')), ['main', 'a1', 'a2']);
    assert.deepEqual(cols.map((c) => c.className), ['cv-cmpcol mk-anthropic main', 'cv-cmpcol mk-openai', 'cv-cmpcol mk-google']);
    assert.deepEqual(cols.map((c) => c.querySelector('span.cv-cmpname').textContent), ['Claude', 'Codex', 'Gemini']);
    assert.deepEqual(cols.map((c) => c.querySelector('span.cv-cmpmodel').textContent), ['Opus 4.1', 'GPT-5 Codex', '2.5 Pro']);
    assert.ok(cols[0].querySelector('svg.mk-anthropic') && cols[1].querySelector('svg.mk-openai') && cols[2].querySelector('svg.mk-google'), 'each maker\'s mark');
    assert.equal(cols[0].querySelector('span.ag-chip').textContent, 'yours');
    assert.deepEqual(cols.map((c) => c.querySelector('span.cv-cmpstate').textContent), ['thinking', 'starting', 'starting']);
    assert.ok(cols.every((c) => c.querySelector('button.cv-cmpuse').disabled), 'nothing to use yet');
    // words stream into their own column, as the transcript's markdown (the
    // engine's clock is the wall clock: the live rate reads the last seconds)
    cv._feed({ sid: 'a1', type: 'session.state', state: 'idle' });
    cv._feed({ sid: 'a1', type: 'message.user', text: Q });
    cv._feed({ sid: 'a1', type: 'usage.cost', totalUsd: 0.05 });
    cv._feed({ sid: 'a1', type: 'turn.started', t: Date.now() - 2000 });
    for (const w of ['Cache the **dependencies**', ' between runs.\n\n- one\n- two']) cv._feed({ sid: 'a1', type: 'message.delta', id: 'c1', block: 0, kind: 'text', text: w, t: Date.now() });
    tick();
    cols = $$('div.cv-cmpcol');
    assert.equal(cols.length, 3);
    assert.equal(cols[1].querySelector('div.cv-cmpbody').textContent.replace(/^\s+/, ''), 'Cache the dependencies between runs.onetwo');
    assert.ok(cols[1].querySelector('div.md strong'), 'rendered, not plain');
    assert.ok(cols[1].querySelector('div.md ul') || cols[1].querySelector('div.md ol') || cols[1].querySelector('div.md li'), 'a list');
    assert.equal(cols[1].querySelector('span.cv-cmpstate').textContent, 'writing');
    assert.match(cols[1].querySelector('span.cv-cmpnums').textContent, /^~\d+ tok\/s$/, 'how fast it writes now');
    assert.equal(cols[1].querySelector('button.cv-cmpuse').disabled, false);
    assert.equal($('div.cv-cmp span.cv-cmpn').textContent, ' · 3 answering');
    // the turn lands: the tool's own numbers
    cv._feed({ sid: 'a1', type: 'message.end', id: 'c1' });
    cv._feed({ sid: 'a1', type: 'usage.turn', inputTokens: 900, outputTokens: 120, durationMs: 4000, apiMs: 2000 });
    cv._feed({ sid: 'a1', type: 'usage.cost', totalUsd: 0.17 });
    cv._feed({ sid: 'a1', type: 'turn.ended', status: 'success', t: Date.now() });
    tick();
    cols = $$('div.cv-cmpcol');
    assert.equal(cols[1].querySelector('span.cv-cmpstate').textContent, 'done');
    assert.equal(cols[1].querySelector('span.cv-cmpnums').textContent, '60 tok/s · $0.12', '120 output tokens over the model\'s 2s; the total after less before');
    assert.equal(stripSays(), ' · 2 answering');
    assert.equal(cols[1].querySelector('div.cv-cmpbody').textContent.replace(/^\s+/, ''), 'Cache the dependencies between runs.onetwo', 'the finished render says the same');
  });

  await ok('the screen: "stop the others" interrupts the asides still writing, and only those', async () => {
    cv._feed({ sid: 'a2', type: 'session.state', state: 'idle' });
    cv._feed({ sid: 'a2', type: 'message.user', text: Q });
    cv._feed({ sid: 'a2', type: 'turn.started', t: 1000 });
    tick();
    const stop = $('button.cv-cmpstop');
    assert.equal(stop.disabled, false);
    stop.click();
    await settle();
    assert.deepEqual(asked('session.interrupt').map((o) => o.sid), ['a2'], 'a1 has answered, the main is yours');
    assert.equal(asked('session.send').length, 0);
    cv._feed({ sid: 'a2', type: 'turn.ended', status: 'interrupted', t: 2000 });
    tick();
    assert.equal($$('div.cv-cmpcol')[2].querySelector('span.cv-cmpstate').textContent, 'stopped');
    assert.equal($('button.cv-cmpstop').disabled, true);
  });

  await ok('the screen: "open" puts a second opinion\'s own session on screen (no tabs: it is how what it asks gets answered); the column already on screen has none (2026-10-29)', () => {
    const cols = $$('div.cv-cmpcol');
    assert.ok(cols.length >= 2);
    assert.equal(cols[0].querySelector('button.cv-cmpgo').hidden, true, 'the main is on screen: nothing to open');
    assert.equal(cols[1].querySelector('button.cv-cmpgo').hidden, false);
    cols[1].querySelector('button.cv-cmpgo').click();
    tick();
    assert.equal(S.active, 'a1', 'the second opinion, on screen');
    assert.ok(!$('div.cv-cmp'), 'the view closed to show it');
    assert.equal($('div.cv-cmpstrip').hidden, false, 'the strip stays: the same comparison');
    // opened again from there: its own column has no "open"; the main's does
    $('button.cv-cmpopen').click();
    tick();
    const again = $$('div.cv-cmpcol');
    assert.equal(again[1].querySelector('button.cv-cmpgo').hidden, true);
    assert.equal(again[0].querySelector('button.cv-cmpgo').hidden, false);
  });

  await ok('the screen: "use this" puts the answer in the main session\'s composer, prefixed, and sends nothing', async () => {
    // from an aside's tab: the same comparison, so the view stays (and the
    // strip, which says what the view's head says, waits behind it)
    S.active = 'a1'; tick(); cv._feed({ sid: 'a1', type: 'session.state', state: 'idle' }); tick();
    assert.ok($('div.cv-cmp'), 'the view stays open across the comparison\'s own tabs');
    assert.equal($('div.cv-cmpstrip').hidden, true, 'one at a time: the strip is behind the view');
    const cols = $$('div.cv-cmpcol');
    cols[1].querySelector('button.cv-cmpuse').click();
    await settle();
    tick();
    assert.equal(S.active, 'main', 'back in the session the question was asked from');
    const ta = $('textarea.cv-input');
    assert.equal(ta.value, 'Plan from Codex, from /compare:\n\nCache the **dependencies** between runs.\n\n- one\n- two');
    assert.equal(asked('session.send').length, 0, 'never sent');
    assert.ok(!$('div.cv-cmp'), 'the view closed; the draft is the thing to read');
    assert.equal($('div.cv-cmpstrip').hidden, false, 'the strip stays');
    ta.value = '';
  });

  await ok('the screen: Esc closes the view and stops nothing; /compare alone opens it; the strip\'s × ends the comparison', async () => {
    const before = asked('session.interrupt').length;
    $('button.cv-cmpopen').click();
    assert.ok($('div.cv-cmp'));
    $('textarea.cv-input').focus();
    const ev = key('Escape');
    assert.equal(ev.defaultPrevented, true);
    assert.ok(!$('div.cv-cmp'), 'closed');
    assert.equal(asked('session.interrupt').length, before, 'the main coder was not stopped');
    assert.equal($('div.cv-cmpstrip').hidden, false);
    // /compare alone
    const ta = $('textarea.cv-input');
    ta.value = '/compare'; ta.dispatch('input');
    key('Enter', { target: ta });
    await settle();
    tick();
    assert.ok($('div.cv-cmp'), '/compare alone opens the view');
    assert.equal(asked('session.send').length, 0, 'and is not sent to the coder');
    assert.equal(ta.value, '');
    // the strip's ×: the comparison ends, the view goes, the tabs stay
    $('button.cv-cmpx').click();
    tick();
    assert.ok(!$('div.cv-cmp'));
    assert.equal($('div.cv-cmpstrip').hidden, true);
    assert.equal(S.sessions.size, 3, 'no session was stopped or closed');
    assert.equal(asked('session.stop').length, 0);
    assert.equal(asked('session.interrupt').length, before);
    ta.value = '/compare'; ta.dispatch('input');
    key('Enter', { target: ta });
    await settle();
    assert.ok(!$('div.cv-cmp'));
    assert.match(toasts[toasts.length - 1], /Nothing to compare yet/);
    cv.close();
  });
  delete window.y3kCode;
}

console.log(`\n${passed} passed`);
