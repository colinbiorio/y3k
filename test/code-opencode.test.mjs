// y3k CODE × OPENCODE. Run:  node test/code-opencode.test.mjs
//
// OpenCode's event stream, recorded from the real 1.18.32 server on a full turn
// (a todo list, an edit and a command that each asked, streamed thinking and
// text), replayed through the mapper — plus the rules the adapter fixes before
// OpenCode ever starts. The real binary is exercised by
// scripts/code-real-opencode.mjs (a stand-in model, no provider called).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMapper, isModel, isSessionId, envFor, VIA, CAPS } from '../y3k-code/adapters/opencode.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const recorded = readFileSync(join(ROOT, 'test', 'fixtures', 'code', 'opencode-1.18.32-turn.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = [];
const mapper = createMapper({ emit: (e) => out.push(e), cwd: '/tmp/repo', sessionId: 'ses_f21a14df2ffeDfSnm5n3PzX4gX', modelLimit: 32768 });
for (const e of recorded) mapper.handle(e);
// another session's events are not this one's
mapper.handle({ type: 'session.idle', properties: { sessionID: 'ses_someoneelse0000000000' } });
const of = (t) => out.filter((e) => e.type === t);

console.log('a recorded turn:');

ok('the edit asks with its diff on the card', () => {
  const p = of('permission.request').find((e) => e.kind === 'edit');
  assert.equal(p.preview.path, '/tmp/repo/README.md');
  const lines = p.preview.diff[0].hunks[0].lines;
  assert.ok(lines.includes('-hello') && lines.some((l) => l.startsWith('+hello world')), JSON.stringify(lines));
  assert.equal(p.risk, 'write');
});

ok('the command asks with the command on the card, and what "always" would allow', () => {
  const p = of('permission.request').find((e) => e.kind === 'bash');
  assert.equal(p.preview.command, 'echo hi');
  assert.deepEqual(p.suggestions.map((s) => s.label), ['Always allow echo *']);
  assert.equal(p.risk, 'exec');
});

ok('both answers are reported back as resolved', () => {
  assert.deepEqual(of('permission.resolved').map((e) => [e.decision, e.scope]), [['allow', 'once'], ['allow', 'always']]);
});

ok('tools: the todo list, the edit, the command — each with its result', () => {
  const calls = of('tool.call').map((e) => [e.name, e.kind]);
  assert.deepEqual(calls, [['todowrite', 'todo'], ['edit', 'edit'], ['bash', 'bash']]);
  const edit = of('tool.result').find((e) => e.callId === of('tool.call')[1].callId);
  assert.equal(edit.status, 'ok');
  assert.ok(edit.diff?.[0]?.hunks?.length, 'the edit carries its diff');
  const bash = of('tool.result').find((e) => e.callId === of('tool.call')[2].callId);
  assert.match(bash.output.text, /hi/);
});

ok('the todos', () => {
  assert.deepEqual(of('todo.update').pop().items.map((t) => [t.text, t.status]), [['Edit README', 'in_progress'], ['Run echo', 'pending']]);
});

ok('thinking and text stream, and each block is written down when it finishes', () => {
  assert.ok(of('message.delta').some((e) => e.kind === 'thinking'));
  assert.ok(of('message.delta').some((e) => e.kind === 'text'));
  const done = of('message.block').map((e) => e.text);
  assert.ok(done.some((t) => /small edit/.test(t)) && done.some((t) => /todo list/.test(t)), JSON.stringify(done));
  for (const d of of('message.delta')) assert.ok(of('message.start').some((s) => s.id === d.id), 'every delta belongs to a started message');
});

ok('usage per step: cache reads count as input, reasoning as output; cost adds up', () => {
  const u = of('usage.turn')[0];
  assert.equal(u.inputTokens, 1200);
  assert.equal(u.outputTokens, 80);
  assert.equal(of('usage.context')[0].limit, 32768);
  const costs = of('usage.cost').map((e) => e.totalUsd);
  assert.ok(costs.every((c, i) => i === 0 || c >= costs[i - 1]), 'a running total');
});

ok('what changed, and the end of the turn', () => {
  assert.ok(of('files.changed').some((e) => e.paths.includes('/tmp/repo/README.md')));
  assert.deepEqual(of('turn.ended').map((e) => e.status), ['success'], 'once — another session\'s idle is not ours');
});

console.log('\nrules fixed before OpenCode starts:');

ok('model names are provider/model and never a path or a flag', () => {
  for (const good of ['openrouter/qwen/qwen3-coder-plus', 'deepseek/deepseek-v4-pro', 'ollama/qwen3-coder:30b']) assert.ok(isModel(good), good);
  for (const bad of ['deepseek', '../etc/passwd', '--x/y', 'a/../b', 'Deep Seek/x']) assert.ok(!isModel(bad), bad);
  assert.ok(isSessionId('ses_f21a14df2ffeDfSnm5n3PzX4gX'));
  assert.ok(!isSessionId('ses_../../x'));
});

ok('no "auto", and commands always ask', () => {
  assert.deepEqual(CAPS.modes, ['ask', 'plan', 'acceptEdits']);
  const src = readFileSync(join(ROOT, 'y3k-code', 'adapters', 'opencode.mjs'), 'utf8');
  const table = src.slice(src.indexOf('const PERMISSION = {'), src.indexOf('};', src.indexOf('const PERMISSION = {')));
  assert.ok(!/bash: 'allow'/.test(table), 'bash is never allowed without asking');
  assert.ok(/plan: \{ edit: 'deny'/.test(table), 'plan cannot edit');
  assert.ok(/OPENCODE_PERMISSION: JSON\.stringify\(PERMISSION\[mode\]\)/.test(src), 'applied last, above any repository config');
  assert.ok(/disabled_providers: \['opencode'\]/.test(src), 'its free hosted provider stays off');
  assert.ok(/OPENCODE_SERVER_PASSWORD: password/.test(src) && /--hostname', '127\.0\.0\.1'/.test(src), 'loopback, behind a password');
});

ok('the person\'s own vendor keys never reach it by accident', () => {
  const e = envFor({ PATH: '/bin', DEEPSEEK_API_KEY: 'x', OPENROUTER_API_KEY: 'y', ANTHROPIC_API_KEY: 'z', OPENCODE_PERMISSION: '{"bash":"allow"}', OPENCODE_CONFIG_CONTENT: '{}' });
  assert.deepEqual(Object.keys(e), ['PATH'], 'only the keys the person chose are set, by the adapter');
});

ok('each y3k provider name has an OpenCode id', () => {
  assert.deepEqual(Object.keys(VIA).sort(), ['deepseek', 'glm', 'groq', 'kimi', 'mistral', 'openrouter', 'qwen', 'xai']);
});

console.log(`\n${passed} checks passed.`);
