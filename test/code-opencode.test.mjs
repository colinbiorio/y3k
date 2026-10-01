// y3k CODE × OPENCODE. Run:  node test/code-opencode.test.mjs
//
// OpenCode's event stream, recorded from the real 1.18.32 server on a full turn
// (a todo list, an edit and a command that each asked, streamed thinking and
// text), replayed through the mapper — plus a turn in which a subagent works in
// a session of its own, driven through the adapter against a stand-in
// `opencode serve` (test/fakes/opencode.mjs), and the rules the adapter fixes
// before OpenCode ever starts. The real binary is exercised by
// scripts/code-real-opencode.mjs (a stand-in model, no provider called).
import assert from 'node:assert';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMapper, createAdapter, isModel, isSessionId, envFor, VIA, CAPS, PERMISSION } from '../y3k-code/adapters/opencode.mjs';
import { createState, apply } from '../src/code/state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const recorded = readFileSync(join(ROOT, 'test', 'fixtures', 'code', 'opencode-1.18.32-turn.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = [];
// built as the adapter builds it: the session's id is known only once OpenCode has made it
const mapper = createMapper({ emit: (e) => out.push(e), cwd: '/tmp/repo', modelLimit: 32768 });
mapper.setSession('ses_f21a14df2ffeDfSnm5n3PzX4gX');
for (const e of recorded) mapper.handle(e);
// another session's events are not this one's
mapper.handle({ type: 'session.idle', properties: { sessionID: 'ses_someoneelse0000000000' } });
const of = (t) => out.filter((e) => e.type === t);

console.log('a recorded turn:');

await ok('the edit asks with its diff on the card', () => {
  const p = of('permission.request').find((e) => e.kind === 'edit');
  assert.equal(p.preview.path, '/tmp/repo/README.md');
  const lines = p.preview.diff[0].hunks[0].lines;
  assert.ok(lines.includes('-hello') && lines.some((l) => l.startsWith('+hello world')), JSON.stringify(lines));
  assert.equal(p.risk, 'write');
});

await ok('the command asks with the command on the card, and what "always" would allow', () => {
  const p = of('permission.request').find((e) => e.kind === 'bash');
  assert.equal(p.preview.command, 'echo hi');
  assert.deepEqual(p.suggestions.map((s) => s.label), ['Always allow echo *']);
  assert.equal(p.risk, 'exec');
});

await ok('both answers are reported back as resolved', () => {
  assert.deepEqual(of('permission.resolved').map((e) => [e.decision, e.scope]), [['allow', 'once'], ['allow', 'always']]);
});

await ok('tools: the todo list, the edit, the command — each with its result', () => {
  const calls = of('tool.call').map((e) => [e.name, e.kind]);
  assert.deepEqual(calls, [['todowrite', 'todo'], ['edit', 'edit'], ['bash', 'bash']]);
  const edit = of('tool.result').find((e) => e.callId === of('tool.call')[1].callId);
  assert.equal(edit.status, 'ok');
  assert.ok(edit.diff?.[0]?.hunks?.length, 'the edit carries its diff');
  const bash = of('tool.result').find((e) => e.callId === of('tool.call')[2].callId);
  assert.match(bash.output.text, /hi/);
});

await ok('the todos', () => {
  assert.deepEqual(of('todo.update').pop().items.map((t) => [t.text, t.status]), [['Edit README', 'in_progress'], ['Run echo', 'pending']]);
});

await ok('thinking and text stream, and each block is written down when it finishes', () => {
  assert.ok(of('message.delta').some((e) => e.kind === 'thinking'));
  assert.ok(of('message.delta').some((e) => e.kind === 'text'));
  const done = of('message.block').map((e) => e.text);
  assert.ok(done.some((t) => /small edit/.test(t)) && done.some((t) => /todo list/.test(t)), JSON.stringify(done));
  for (const d of of('message.delta')) assert.ok(of('message.start').some((s) => s.id === d.id), 'every delta belongs to a started message');
});

await ok('usage per step: cache reads count as input, reasoning as output; cost adds up', () => {
  const u = of('usage.turn')[0];
  assert.equal(u.inputTokens, 1200);
  assert.equal(u.outputTokens, 80);
  assert.equal(of('usage.context')[0].limit, 32768);
  const costs = of('usage.cost').map((e) => e.totalUsd);
  assert.ok(costs.every((c, i) => i === 0 || c >= costs[i - 1]), 'a running total');
});

await ok('what changed, and the end of the turn', () => {
  assert.ok(of('files.changed').some((e) => e.paths.includes('/tmp/repo/README.md')));
  assert.deepEqual(of('turn.ended').map((e) => e.status), ['success'], 'once — another session\'s idle is not ours');
});

console.log('\na subagent, in a session of its own:');
{
  const base = mkdtempSync(join(tmpdir(), 'y3k-opencode-'));
  const LOG = join(base, 'opencode.log');
  const ev = [];
  const wake = new Set();
  const until = (pred, ms = 8000) => new Promise((res, rej) => {
    const f = ev.find(pred);
    if (f) return res(f);
    const t = setTimeout(() => { wake.delete(w); rej(new Error('timed out; last: ' + ev.slice(-5).map((e) => JSON.stringify(e).slice(0, 300)).join('\n'))); }, ms);
    const w = () => { const g = ev.find(pred); if (g) { clearTimeout(t); wake.delete(w); res(g); } };
    wake.add(w);
  });
  const a = createAdapter({
    sid: 'oc-test', cwd: base, audit: null, bin: join(ROOT, 'test', 'fakes', 'opencode.mjs'),
    emit: (e) => { ev.push(e); for (const w of [...wake]) w(); },
    env: { PATH: process.env.PATH, FAKE_OPENCODE_LOG: LOG, Y3K_OLLAMA_URL: 'http://127.0.0.1:47' },
    opts: { mode: 'ask', model: 'fake/fake-model' },
  });
  await a.start();
  await until((e) => e.type === 'session.ready');
  assert.equal(a.send({ text: 'look around' }).ok, true);
  const ask = await until((e) => e.type === 'permission.request');
  const log = () => readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

  await ok('its command asks on a card, and the person\'s answer reaches OpenCode', async () => {
    assert.deepEqual([ask.requestId, ask.kind, ask.preview.command, ask.callId], ['per_child1', 'bash', 'ls', 'call_ls']);
    assert.equal(a.state, 'waiting');
    assert.deepEqual(await a.answerPermission({ requestId: ask.requestId, decision: 'allow' }), { ok: true });
    assert.deepEqual(log().filter((x) => x.path === '/permission/per_child1/reply').map((x) => x.body), [{ reply: 'once' }]);
  });

  await until((e) => e.type === 'turn.ended');
  await new Promise((r) => setTimeout(r, 150)); // anything still to come

  await ok('its idle does not end the turn: that comes once, when the main session is done', () => {
    const ends = ev.filter((e) => e.type === 'turn.ended');
    assert.deepEqual(ends.map((e) => e.status), ['success']);
    const last = ev.findIndex((e) => e.type === 'message.block' && /one file/.test(e.text));
    assert.ok(last >= 0 && last < ev.indexOf(ends[0]), 'the main session\'s last words come before the end');
    assert.equal(a.state, 'idle');
  });

  await ok('its words and tools go inside the Task card that started it, and are not read out as the coder\'s own', () => {
    assert.equal(ev.find((e) => e.type === 'message.start' && e.id === 'msg_child1').parentCallId, 'call_task');
    assert.equal(ev.find((e) => e.type === 'message.block' && e.id === 'msg_child1').parentCallId, 'call_task');
    assert.equal(ev.find((e) => e.type === 'tool.call' && e.callId === 'call_ls').parentCallId, 'call_task');
    assert.equal(ev.find((e) => e.type === 'message.block' && e.id === 'msg_main2').parentCallId, null);
    const S = createState();
    for (const e of ev) apply(S, { ...e, sid: 'oc-test' }, { replay: true });
    const s = S.sessions.get('oc-test');
    const card = s.byKey.get('t:call_task');
    assert.deepEqual(card.children.map((c) => c.requestId || c.callId || c.id), ['msg_child1', 'call_ls', 'per_child1'], 'its words, its command, and the card that asked');
    assert.ok(!s.items.some((it) => it.kind === 'assistant' && it.blocks.some((b) => /Listing/.test(b.text))), 'not at the top, where the voice reads');
  });

  await ok('its usage is not the turn\'s, but what it spends is the session\'s', () => {
    assert.deepEqual(ev.filter((e) => e.type === 'usage.turn').map((e) => e.inputTokens), [1200, 1300]);
    assert.deepEqual(ev.filter((e) => e.type === 'usage.context').map((e) => e.used), [1240, 1312]);
    assert.equal(ev.filter((e) => e.type === 'usage.cost').pop().totalUsd.toFixed(3), '0.006');
  });

  a.stop();
  await until((e) => e.type === 'session.ended');
  rmSync(base, { recursive: true, force: true });
}

await ok('a subagent\'s error is not the turn\'s, and its question can be answered', () => {
  const got = [];
  const m = createMapper({ emit: (e) => got.push(e) });
  m.setSession('ses_main');
  m.handle({ type: 'question.asked', properties: { id: 'que_1', sessionID: 'ses_child', questions: [{ question: 'Which file?', options: [{ label: 'a' }] }] } });
  m.handle({ type: 'session.error', properties: { sessionID: 'ses_child', error: { name: 'APIError', data: { message: 'subagent fell over' } } } });
  m.handle({ type: 'todo.updated', properties: { sessionID: 'ses_child', todos: [{ content: 'theirs', status: 'pending' }] } });
  m.handle({ type: 'session.idle', properties: { sessionID: 'ses_child' } });
  m.handle({ type: 'session.idle', properties: { sessionID: 'ses_main' } });
  assert.equal(got.filter((e) => e.type === 'question.request').length, 1);
  assert.ok(!got.some((e) => e.type === 'todo.update'), 'the todo list is the session\'s own');
  assert.deepEqual(got.filter((e) => e.type === 'turn.ended').map((e) => [e.status, e.error]), [['success', null]]);
});

console.log('\nrules fixed before OpenCode starts:');

await ok('model names are provider/model and never a path or a flag', () => {
  for (const good of ['openrouter/qwen/qwen3-coder-plus', 'deepseek/deepseek-v4-pro', 'ollama/qwen3-coder:30b']) assert.ok(isModel(good), good);
  for (const bad of ['deepseek', '../etc/passwd', '--x/y', 'a/../b', 'Deep Seek/x']) assert.ok(!isModel(bad), bad);
  assert.ok(isSessionId('ses_f21a14df2ffeDfSnm5n3PzX4gX'));
  assert.ok(!isSessionId('ses_../../x'));
});

await ok('no "auto", and commands always ask', () => {
  assert.deepEqual(CAPS.modes, ['ask', 'plan', 'acceptEdits']);
  const asks = { edit: 'ask', bash: 'ask', webfetch: 'ask', websearch: 'ask', external_directory: 'ask' };
  assert.deepStrictEqual(PERMISSION, { ask: asks, plan: { ...asks, edit: 'deny' }, acceptEdits: { ...asks, edit: 'allow' } }, 'the whole table: nothing added, nothing loosened');
  // the one thing any mode does without asking: accept edits, editing
  for (const [mode, rules] of Object.entries(PERMISSION)) {
    for (const [what, rule] of Object.entries(rules)) assert.ok(rule !== 'allow' || (mode === 'acceptEdits' && what === 'edit'), `${mode}.${what} is allowed without asking`);
  }
  assert.equal(PERMISSION.plan.edit, 'deny', 'plan cannot edit');
  assert.ok(Object.isFrozen(PERMISSION) && Object.values(PERMISSION).every(Object.isFrozen), 'nothing can change it once loaded');
  const src = readFileSync(join(ROOT, 'y3k-code', 'adapters', 'opencode.mjs'), 'utf8');
  assert.ok(/OPENCODE_PERMISSION: JSON\.stringify\(PERMISSION\[mode\]\)/.test(src), 'applied last, above any repository config');
  assert.ok(/disabled_providers: \['opencode'\]/.test(src), 'its free hosted provider stays off');
  assert.ok(/OPENCODE_SERVER_PASSWORD: password/.test(src) && /--hostname', '127\.0\.0\.1'/.test(src), 'loopback, behind a password');
});

await ok('the person\'s own vendor keys never reach it by accident', () => {
  const e = envFor({ PATH: '/bin', DEEPSEEK_API_KEY: 'x', OPENROUTER_API_KEY: 'y', ANTHROPIC_API_KEY: 'z', OPENCODE_PERMISSION: '{"bash":"allow"}', OPENCODE_CONFIG_CONTENT: '{}' });
  assert.deepEqual(Object.keys(e), ['PATH'], 'only the keys the person chose are set, by the adapter');
});

await ok('the orb tool (orb.mjs) rides in as a remote MCP server, beside theirs', () => {
  const src = readFileSync(join(ROOT, 'y3k-code', 'adapters', 'opencode.mjs'), 'utf8');
  assert.match(src, /if \(opts\.orb\?\.url\) cfg\.mcp = \{ \[opts\.orb\.name\]: \{ type: 'remote', url: opts\.orb\.url, headers: opts\.orb\.headers \|\| \{\}, enabled: true \} \};/);
});

await ok('each y3k provider name has an OpenCode id', () => {
  assert.deepEqual(Object.keys(VIA).sort(), ['deepseek', 'glm', 'groq', 'kimi', 'mistral', 'openrouter', 'qwen', 'xai']);
});

console.log(`\n${passed} checks passed.`);
