// HOW FAST IT WROTE (2026-10-19). Colin: "as an ai harness, i wonder about
// token speed and cross-model collaboration -- could we display tokens per
// second and also figure out how to maximize that number?"
//
// Every place a rate is made, each with its clock held still or faked: the
// provider's stream (speed.mjs), y3kode beside Claude Code (y3k-code/brain.mjs,
// with a stand-in CLI that writes on a timer), the relay that carries it
// (cleanSpeed), the page's readout (src/speed.js), and kode (src/code/state.js,
// the Claude adapter's per-turn API time).
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamClock, turnSpeed, cleanSpeed } from '../speed.mjs';
import { speedOf, tokenOf, deltaOf, thinkWithClaude } from '../y3k-code/brain.mjs';
import { turnApiMs } from '../y3k-code/adapters/claude.mjs';
import { createSpeedReadout, liveRate, fmtRate, fmtSec, detail, recent, remember, byModel, KEEP, testModels, testSpeed, shown, setShown } from '../src/speed.js';
import { createState, apply, turnRate, writingRate, harnessRate, noteWritten, RATE_WINDOW_MS } from '../src/code/state.js';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

console.log('\nthe provider\'s stream (speed.mjs):');

await ok('the clock times from the ask to the first token, and from the first token to the last', () => {
  let t = 1000;
  const c = streamClock(() => t);
  assert.deepEqual(c.read(), { firstMs: null, genMs: null }, 'nothing written, nothing timed');
  t = 1600; c.token(); t = 1700; c.token(); t = 3600; c.token();
  assert.deepEqual(c.read(), { firstMs: 600, genMs: 2000 });
});

await ok('the rate counts every output token, thinking included, over the writing; hidden reasoning is set aside', () => {
  assert.equal(turnSpeed({ usage: { out: 201 }, speed: { firstMs: 400, genMs: 2000 } }, 'claude-opus-5-5').tps, 100);
  // OpenAI's reasoning tokens are billed but never streamed: timed on what was shown
  assert.equal(turnSpeed({ usage: { out: 301, think: 100 }, speed: { firstMs: 400, genMs: 2000 } }, 'o4').tps, 100);
  assert.equal(turnSpeed({ usage: { out: 9 }, speed: { firstMs: 400, genMs: 150 } }, 'x').tps, null, 'too short to time');
  assert.equal(turnSpeed({ usage: { out: 9 } }, 'x'), null, 'no clock, no line');
  // y3kode's own rate (the own sign-in) is kept as it came
  const own = turnSpeed({ usage: { out: 200 }, speed: { tps: 84.44, firstMs: 900, genMs: 2300, model: 'claude-opus-5-5' } }, 'ledger-model');
  assert.equal(own.tps, 84.4);
  assert.equal(own.model, 'claude-opus-5-5', 'the model that ran, not the ledger\'s name for the route');
});

await ok('the relay keeps a page\'s numbers only when they are numbers, in range, and a model only when it is a name', () => {
  const c = cleanSpeed({ out: 200, tps: 88.44, firstMs: -1, wordMs: 1e12, model: 'claude-opus-5-5', evil: '<b>' });
  assert.deepEqual(c, { out: 200, think: null, firstMs: null, wordMs: null, genMs: null, apiMs: null, tps: 88.4, rough: false, model: 'claude-opus-5-5' });
  assert.equal(cleanSpeed({ model: '<script>alert(1)</script>' }).model, null);
  assert.equal(cleanSpeed('fast'), null);
  assert.equal(cleanSpeed(null), null);
});

console.log('\ny3kode, beside Claude Code (y3k-code/brain.mjs):');

await ok('a stream line is a token of any kind, and only a text delta adds words', () => {
  const ev = (delta) => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta } });
  assert.deepEqual(tokenOf(ev({ type: 'thinking_delta', thinking: 'hm' })), { token: true, text: '' });
  assert.deepEqual(tokenOf(ev({ type: 'text_delta', text: 'Hi' })), { token: true, text: 'Hi' });
  assert.deepEqual(tokenOf(JSON.stringify({ type: 'system', subtype: 'init' })), { token: false, text: '' });
  assert.deepEqual(tokenOf('not json'), { token: false, text: '' });
  assert.equal(deltaOf(ev({ type: 'text_delta', text: 'Hi' })), 'Hi', 'deltaOf is unchanged for the page');
});

await ok('speedOf: the waits a person feels, the model\'s own rate, and the rough one when there was no stream', () => {
  const res = { usage: { output_tokens: 1001, output_tokens_details: { thinking_tokens: 400 } }, duration_api_ms: 12000 };
  const s = speedOf({ startAt: 0, firstAt: 1200, textAt: 5200, lastAt: 11200 }, res);
  assert.deepEqual(s, { out: 1001, think: 400, firstMs: 1200, wordMs: 5200, genMs: 10000, apiMs: 12000, tps: 100, rough: false });
  const rough = speedOf({}, res);
  assert.equal(rough.tps, 83.4);
  assert.equal(rough.rough, true);
  assert.equal(speedOf({}, {}).tps, null);
});

await ok('a real stream is timed as it arrives: a stand-in Claude Code that thinks, then writes, on a timer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'y3k-speed-'));
  const bin = join(dir, 'claude');
  // 0.3 s of thinking, then six words 0.1 s apart, then the result
  writeFileSync(bin, `#!/usr/bin/env node
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const d = (delta) => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  process.stdin.resume(); process.stdin.on('data', () => {});
  out({ type: 'system', subtype: 'init' });
  out(d({ type: 'thinking_delta', thinking: 'let me see' }));
  await sleep(300);
  for (const w of ['The ', 'sea ', 'at ', 'night ', 'is ', 'black.']) { out(d({ type: 'text_delta', text: w })); await sleep(100); }
  out({ type: 'result', subtype: 'success', is_error: false, result: 'The sea at night is black.', duration_api_ms: 900,
    usage: { input_tokens: 10, output_tokens: 61, output_tokens_details: { thinking_tokens: 30 } }, modelUsage: { 'claude-haiku-4-5': {} } });
  process.exit(0);
})();
`);
  chmodSync(bin, 0o755);
  const parts = [];
  const r = await thinkWithClaude({ bin, env: process.env, tmpDir: dir, system: 's', prompt: 'p', onPart: (t) => parts.push(t) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.text, 'The sea at night is black.');
  assert.equal(parts.at(-1), 'The sea at night is black.');
  const s = r.speed;
  assert.equal(s.model, 'claude-haiku-4-5');
  assert.equal(s.out, 61);
  assert.equal(s.think, 30);
  assert.ok(s.wordMs - s.firstMs >= 250, `the thinking came before the first word (${s.firstMs} → ${s.wordMs})`);
  assert.ok(s.genMs >= 700 && s.genMs < 2500, `the writing took about 0.8 s (${s.genMs})`);
  assert.ok(s.tps > 20 && s.tps < 100, `about 60 tokens over about 0.8 s (${s.tps})`);
  assert.equal(s.rough, false);
});

await ok('kode\'s per-turn API time is the growth of Claude Code\'s running total, and a total that resets is taken as given', () => {
  // as measured on 2.1.286, 2026-10-19: 1501, then 3047
  assert.equal(turnApiMs(1501, 0), 1501);
  assert.equal(turnApiMs(3047, 1501), 1546);
  assert.equal(turnApiMs(800, 3047), 800, 'a new process counting again');
  const adapter = readFileSync(new URL('../y3k-code/adapters/claude.mjs', import.meta.url), 'utf8');
  assert.match(adapter, /const apiMs = turnApiMs\(apiTotal, apiMsSoFar\);\n\s*apiMsSoFar = apiTotal;/);
  assert.match(adapter, /durationMs: e\.duration_ms \| 0, apiMs, model:/);
});

console.log('\nthe page (src/speed.js):');

const fakeEl = () => ({ textContent: '', title: '', hidden: true, attrs: {}, cls: new Set(), setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, on) { fakeEl.last?.cls[on ? 'add' : 'delete'](c); } } });

await ok('the readout counts the words while they arrive (~), then shows the measured rate, and keeps it', () => {
  const el = fakeEl(); fakeEl.last = el;
  let t = 0;
  const kept = [];
  const r = createSpeedReadout({ el, now: () => t, isShown: () => true, keep: (e) => kept.push(e) });
  r.start();
  t = 1200; r.text('The sea ');          // the first word: 1.2 s after the ask
  assert.equal(el.hidden, true, 'one piece is too little to divide');
  t = 2200; r.text('x'.repeat(392));     // 400 characters in 1 s ≈ 100 tokens a second
  assert.equal(el.textContent, '~100 tok/s');
  t = 2600;
  const e = r.done({ tps: 84.4, out: 210, think: 30, firstMs: 900, model: 'claude-opus-5-5' });
  assert.equal(el.textContent, '84 tok/s');
  assert.ok(el.cls.has('done'));
  assert.equal(e.wordMs, 1200);
  assert.match(el.title, /first word 1\.2 s · first token 0\.9 s · 210 tokens, 30 thinking · claude-opus-5-5/);
  assert.equal(kept.length, 1);
});

await ok('no measured rate home (an older y3kode): the estimate stands, marked; nothing at all: nothing shown', () => {
  const el = fakeEl(); fakeEl.last = el;
  let t = 0;
  const r = createSpeedReadout({ el, now: () => t, isShown: () => true, keep: () => {} });
  r.start(); t = 500; r.text('a'.repeat(200)); t = 1500; r.text('b'.repeat(200));
  const e = r.done(null);
  assert.equal(e.rough, true);
  assert.match(el.textContent, /^~\d+ tok\/s$/);
  r.start();
  assert.equal(r.done(null), null);
  assert.equal(el.hidden, true);
});

await ok('switched off, nothing is painted, and the rate is still kept for Settings', () => {
  const el = fakeEl(); fakeEl.last = el;
  const kept = [];
  let t = 0;
  const r = createSpeedReadout({ el, now: () => t, isShown: () => false, keep: (e) => kept.push(e) });
  r.start(); t = 900; r.text('hello there'); t = 2000; r.text('y'.repeat(400));
  r.done({ tps: 70 });
  assert.equal(el.hidden, true);
  assert.equal(kept.length, 1);
  const s = memStore();
  assert.equal(shown(s), true, 'on unless switched off');
  setShown(false, s); assert.equal(shown(s), false);
  setShown(true, s); assert.equal(shown(s), true);
});

await ok('the log keeps the newest few, and only entries with a rate', () => {
  const s = memStore();
  for (let i = 0; i < KEEP + 5; i++) remember({ model: 'm' + i, tps: i + 1 }, s);
  remember({ model: 'none' }, s);
  const r = recent(s);
  assert.equal(r.length, KEEP);
  assert.equal(r[0].model, 'm' + (KEEP + 4), 'newest first');
  s.setItem('y3k.speeds', 'not json');
  assert.deepEqual(recent(s), []);
});

await ok('Settings shows one line per model: the median of its answers, the most recently used first', () => {
  const rows = byModel([
    { model: 'opus', tps: 80, wordMs: 1400 }, { model: 'haiku', tps: 110, wordMs: 1900 },
    { model: 'opus', tps: 20, wordMs: 9000, rough: true }, { model: 'opus', tps: 84, wordMs: 1300 },
  ]);
  assert.deepEqual(rows.map((r) => r.model), ['opus', 'haiku']);
  assert.equal(rows[0].tps, 80, 'one slow turn does not name it slow');
  assert.equal(rows[0].wordMs, 1400);
  assert.equal(rows[0].n, 3);
  assert.equal(rows[0].rough, false, 'rough only when every answer was');
  assert.deepEqual(byModel(null), []);
});

await ok('the numbers read plainly', () => {
  assert.equal(fmtRate(84.4), '84');
  assert.equal(fmtRate(1234), '1.2k');
  assert.equal(fmtRate(null), '');
  assert.equal(fmtSec(1240), '1.2 s');
  assert.equal(fmtSec(12400), '12 s');
  assert.equal(liveRate(400, 300), null, 'too soon to say');
  assert.equal(liveRate(400, 1000), 100);
  assert.equal(detail({ wordMs: 1500, model: 'm' }), 'first word 1.5 s · m');
});

await ok('Test speed: the newest of each family, never "default", one turn each through y3kode, fastest first', async () => {
  const list = [{ id: 'default' }, { id: 'claude-fable-5-1' }, { id: 'claude-opus-5-5' }, { id: 'claude-opus-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-4-5' }];
  assert.deepEqual(testModels(list).map((m) => m.id), ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1']);
  assert.deepEqual(testModels([{ id: 'default' }, { id: 'opus', label: 'Opus' }, { id: 'haiku', label: 'Haiku' }]).map((m) => m.id), ['haiku', 'opus'], 'aliases, as Claude Code names them');
  const asked = [];
  const cmd = async (c) => {
    asked.push(c);
    if (c.model === 'claude-opus-5-5') return { ok: false, error: 'busy' };
    return { ok: true, speed: { tps: c.model === 'claude-haiku-4-5' ? 110 : 90, wordMs: 1500, firstMs: 1100, out: 200 } };
  };
  const rows = await testSpeed({ models: testModels(list).slice(0, 3), cmd });
  assert.deepEqual(rows.map((r) => r.id), ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
  assert.equal(rows[2].ok, false);
  for (const c of asked) {
    assert.equal(c.cmd, 'brain.complete');
    assert.ok(c.tag, 'a tag, so y3kode streams the turn and its clock runs');
    assert.equal(c.effort, 'low');
  }
});

console.log('\nkode (src/code/state.js):');

await ok('a turn\'s rate: the tool\'s output over the model\'s own time, or over the whole turn, marked rough', () => {
  assert.deepEqual(turnRate({ tout: 1000, apiMs: 10000 }, 25000), { tps: 100, tpsRough: false });
  assert.deepEqual(turnRate({ tout: 1000, apiMs: 0 }, 20000), { tps: 50, tpsRough: true });
  assert.deepEqual(turnRate({ tout: 1, apiMs: 900 }, 900), { tps: null });
  assert.deepEqual(turnRate({ tout: 50, apiMs: 0 }, null), { tps: null });
});

await ok('the summary of a finished turn carries the rate, from usage.turn\'s apiMs', () => {
  const S = createState();
  const ev = (o) => apply(S, { sid: 's1', ...o });
  ev({ type: 'session.started', provider: 'claude', t: 1 });
  ev({ type: 'turn.started', t: 1000 });
  ev({ type: 'usage.turn', inputTokens: 100, outputTokens: 900, durationMs: 30000, apiMs: 9000 });
  ev({ type: 'turn.ended', status: 'success', t: 31000 });
  const sum = S.sessions.get('s1').items.find((it) => it.kind === 'turn-sum');
  assert.equal(sum.tps, 100);
  assert.equal(sum.tpsRough, false);
});

await ok('live: what each coder streamed in the last few seconds, and every coder together', () => {
  const S = createState();
  const ev = (sid, o) => apply(S, { sid, ...o });
  for (const sid of ['a', 'b']) { ev(sid, { type: 'session.started', provider: 'claude', t: 1 }); ev(sid, { type: 'turn.started', t: 1 }); }
  // a: 400 characters a second for 4 s; b: 200 a second
  for (let t = 1000; t <= 4000; t += 1000) {
    ev('a', { type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'x'.repeat(400), t });
    ev('b', { type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'y'.repeat(200), t });
  }
  const a = S.sessions.get('a');
  assert.equal(Math.round(writingRate(a, 4000)), 133, '1600 characters (400 tokens) over 3 s');
  const all = harnessRate(S, 4000);
  assert.equal(all.writing, 2);
  assert.equal(Math.round(all.tps), 200);
  assert.equal(writingRate(a, 4000 + RATE_WINDOW_MS + 1), null, 'quiet for a window: nothing shown');
  // words read back from disk are old words, never a rate
  const S2 = createState();
  apply(S2, { sid: 'c', type: 'session.started', provider: 'claude', t: 1 });
  apply(S2, { sid: 'c', type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'z'.repeat(999), t: 5000 }, { replay: true });
  assert.equal(writingRate(S2.sessions.get('c'), 5000), null);
  const s = {}; noteWritten(s, 1, 0); noteWritten(s, NaN, 5);
  assert.equal(s.rate, undefined, 'nothing written, nothing noted');
});

console.log('\nthe wiring:');

await ok('the done event carries it, the page reads it, the readout sits in the model mark, and kode shows it', () => {
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const srv = read('server.mjs');
  assert.match(srv, /const speedOut = turnSpeed\(out, useModel\);\n\s*clearInterval\(heartbeat\);\n\s*sse\('done'/);
  assert.match(srv, /\.\.\.\(speedOut \? \{ speed: speedOut \} : \{\}\) \}\);/);
  assert.equal((srv.match(/return streamErr \? \{ ok: false, status: 'stream', detail: streamErr \} : \{ ok: true, usage, speed: clock\.read\(\) \};/g) || []).length, 3, 'every streaming provider hands its clock back');
  const relay = read('own-relay.mjs');
  assert.match(relay, /const speed = cleanSpeed\(b\.speed\);/);
  assert.match(read('src/own-brain.js'), /usage: r\.usage \|\| null, \.\.\.\(r\.speed \? \{ speed: r\.speed \} : \{\}\)/);
  assert.match(read('src/brain.js'), /if \(p\.speed && typeof p\.speed === 'object'\) speed = p\.speed;/);
  const main = read('src/main.js');
  for (const call of ['speedReadout.start();', 'speedReadout.text(t);', 'speedReadout.done(result?.speed);']) assert.ok(main.includes(call), call);
  assert.match(read('index.html'), /<span class="home-model-name mercury"><\/span>\n\s*<span id="home-speed" class="home-speed" hidden><\/span>/);
  assert.match(read('src/code/render/items.js'), /if \(it\.tps\) parts\.push/);
  assert.match(read('src/code/code-view.js'), /harnessRate\(S, now\)/);
});

console.log(`\n${passed} checks passed.`);
