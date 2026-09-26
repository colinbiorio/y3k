// y3k CODE × CODEX AND GEMINI. Run:  node test/code-providers.test.mjs
//
// The same promises Claude Code keeps, kept by the other two: the change (or
// the command) is on the card before it is allowed, nothing is changed without
// a yes, the mode that skips every permission is never used, a person's own
// sign-in is never overwritten, Gemini runs on an API key only (never the
// Google sign-in), and each vendor gets only its own key. Driven through the
// engine against fakes built from each CLI's own protocol (codex-cli 0.157.1's
// schema; gemini-cli 0.61.0's ACP).
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';
import { changeDiffs } from '../y3k-code/adapters/codex.mjs';
import { acpDiffs, acpServers } from '../y3k-code/adapters/acp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const base = mkdtempSync(join(tmpdir(), 'y3k-code-providers-'));
const repo = realpathSync(mkdtempSync(join(base, 'repo-')));
const reset = () => writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
reset();
const CODEX_LOG = join(base, 'codex.log');
const GEMINI_LOG = join(base, 'gemini.log');
const logOf = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

function world({ config = { signIn: true }, secrets = {}, extraEnv = {} } = {}) {
  const store = createStore(mkdtempSync(join(base, 'cfg-')));
  store.setConfig(config);
  for (const [k, v] of Object.entries(secrets)) store.setSecret(k, v);
  const env = { ...process.env, FAKE_CODEX_LOG: CODEX_LOG, FAKE_GEMINI_LOG: GEMINI_LOG, ANTHROPIC_API_KEY: 'sk-ant-not-for-you', OPENAI_API_KEY: 'sk-not-for-gemini', GOOGLE_GENAI_USE_GCA: 'true', ...extraEnv };
  const engine = createEngine({ store, consent: fixedConsent(true), env, bins: { codex: join(ROOT, 'test', 'fakes', 'codex.mjs'), gemini: join(ROOT, 'test', 'fakes', 'gemini.mjs') } });
  const events = [];
  engine.subscribe((e) => events.push(e));
  const until = (pred, ms = 8000) => new Promise((res, rej) => {
    const f = events.find(pred);
    if (f) return res(f);
    const t = setTimeout(() => { un(); rej(new Error('timed out; last: ' + events.slice(-5).map((e) => e.type).join(', '))); }, ms);
    const un = engine.subscribe((e) => { if (pred(e)) { clearTimeout(t); un(); res(e); } });
  });
  return { store, engine, events, until, cmd: (c) => engine.handle(c, { via: 'test' }) };
}

console.log('the pieces:');

await ok('Codex file changes become the one diff shape', () => {
  const [d] = changeDiffs([{ path: 'hello.txt', kind: { type: 'update', move_path: null }, diff: '@@ -1,2 +1,2 @@\n hello\n-world\n+y3k\n' }], '/r');
  assert.equal(d.path, '/r/hello.txt');
  assert.deepEqual(d.hunks[0].lines, [' hello', '-world', '+y3k']);
  const [a] = changeDiffs([{ path: '/r/new.txt', kind: { type: 'add' }, diff: 'one\ntwo\n' }]);
  assert.equal(a.created, true);
  assert.equal(a.added, 2);
});

await ok('ACP diffs and connectors', () => {
  const [d] = acpDiffs([{ type: 'content', content: { type: 'text', text: 'x' } }, { type: 'diff', path: '/r/a', oldText: 'a\nb\n', newText: 'a\nc\n' }]);
  assert.deepEqual(d.hunks[0].lines, [' a', '-b', '+c']);
  const s = acpServers({ mcpServers: { gh: { type: 'stdio', command: 'npx', args: ['x'], env: { T: '1' } }, web: { type: 'http', url: 'https://m', headers: { A: 'b' } } } });
  assert.deepEqual(s[0], { name: 'gh', command: 'npx', args: ['x'], env: [{ name: 'T', value: '1' }] });
  assert.deepEqual(s[1], { type: 'http', name: 'web', url: 'https://m', headers: [{ name: 'A', value: 'b' }] });
});

// --- Codex --------------------------------------------------------------------------
console.log('\nCodex, with the person\'s own sign-in:');
{
  const w = world();
  await w.cmd({ cmd: 'workspace.open', path: repo });
  const st = await w.cmd({ cmd: 'session.start', provider: 'codex', cwd: repo, mode: 'ask' });
  await w.until((e) => e.type === 'session.ready' && e.sid === st.sid);

  await ok('starts on their own login, in a read-only sandbox that asks — never full access', () => {
    assert.equal(st.ok, true, st.error);
    const spawn = logOf(CODEX_LOG).filter((x) => x.kind === 'spawn').pop();
    assert.equal(spawn.codexHome, null, 'their own ~/.codex, untouched');
    assert.deepEqual(spawn.argv, ['app-server']);
    assert.ok(!spawn.envNames.includes('ANTHROPIC_API_KEY'), 'never another vendor\'s key');
    const start = logOf(CODEX_LOG).find((x) => x.kind === 'in' && x.msg.method === 'thread/start').msg.params;
    assert.equal(start.sandbox, 'read-only');
    assert.equal(start.approvalPolicy, 'on-request');
    assert.equal(start.cwd, repo);
    assert.ok(!logOf(CODEX_LOG).some((x) => x.kind === 'DANGER'));
  });

  await ok('its models and plan limits arrive', async () => {
    await w.until((e) => e.type === 'provider.status' && e.provider === 'codex');
    const lim = await w.until((e) => e.type === 'usage.limits' && e.provider === 'codex');
    assert.deepEqual(lim.windows.map((x) => [x.kind, x.utilization]), [['five_hour', 0.21], ['seven_day', 0.09]]);
  });

  await w.cmd({ cmd: 'session.send', sid: st.sid, text: 'change world to y3k' });
  const p1 = await w.until((e) => e.type === 'permission.request' && e.sid === st.sid);

  await ok('a command is on the card, with where it runs, before it runs', () => {
    assert.equal(p1.kind, 'bash');
    assert.equal(p1.preview.command, 'cat hello.txt');
    assert.equal(p1.preview.cwd, repo);
    assert.ok(w.events.some((e) => e.type === 'tool.call' && e.callId === 'c1' && e.kind === 'bash'));
  });

  await w.cmd({ cmd: 'permission.answer', sid: st.sid, requestId: p1.requestId, decision: 'allow' });
  const p2 = await w.until((e) => e.type === 'permission.request' && e.requestId !== p1.requestId);

  await ok('the edit is a diff on the card, and the file is untouched while it asks', () => {
    assert.equal(p2.kind, 'edit');
    assert.deepEqual(p2.preview.diff[0].hunks[0].lines, [' hello', '-world', '+y3k']);
    assert.equal(readFileSync(join(repo, 'hello.txt'), 'utf8'), 'hello\nworld\n');
    const ans = logOf(CODEX_LOG).find((x) => x.kind === 'answer' && x.method === 'item/commandExecution/requestApproval');
    assert.deepEqual(ans.result, { decision: 'accept' }, 'allow once → accept');
  });

  await w.cmd({ cmd: 'permission.answer', sid: st.sid, requestId: p2.requestId, decision: 'allow', scope: 'session' });
  await w.until((e) => e.type === 'turn.ended' && e.sid === st.sid);

  await ok('allowed for the session → acceptForSession; the edit lands; everything shows', () => {
    assert.deepEqual(logOf(CODEX_LOG).find((x) => x.kind === 'answer' && x.method === 'item/fileChange/requestApproval').result, { decision: 'acceptForSession' });
    assert.equal(readFileSync(join(repo, 'hello.txt'), 'utf8'), 'hello\ny3k\n');
    const ev = w.events.filter((e) => e.sid === st.sid);
    assert.ok(ev.some((e) => e.type === 'tool.result' && e.callId === 'c1' && e.status === 'ok' && /world/.test(e.output.text)));
    assert.ok(ev.some((e) => e.type === 'tool.result' && e.callId === 'f1' && e.diff?.[0]?.added === 1));
    assert.ok(ev.some((e) => e.type === 'message.block' && e.kind === 'thinking' && /Checking/.test(e.text)));
    assert.equal(ev.filter((e) => e.type === 'message.delta' && e.kind === 'text').map((e) => e.text).join(''), 'Done — changed it.');
    assert.deepEqual(ev.filter((e) => e.type === 'todo.update').pop().items.map((i) => i.status), ['completed', 'in_progress']);
    const ctx = ev.filter((e) => e.type === 'usage.context').pop();
    assert.equal(ctx.limit, 400000);
    assert.equal(ctx.used, 5200);
    assert.equal(ev.filter((e) => e.type === 'usage.limits').pop().windows[0].utilization, 0.23, 'a sparse update merges');
    assert.equal(ev.filter((e) => e.type === 'turn.ended').pop().status, 'success');
  });

  await ok('a mode change goes with the next turn, as Codex expects', async () => {
    assert.equal((await w.cmd({ cmd: 'session.setMode', sid: st.sid, mode: 'acceptEdits' })).ok, true);
    reset();
    await w.cmd({ cmd: 'session.send', sid: st.sid, text: 'again' });
    const p = await w.until((e) => e.type === 'permission.request' && e.kind === 'bash' && e.requestId !== p1.requestId);
    const ts = logOf(CODEX_LOG).filter((x) => x.kind === 'in' && x.msg.method === 'turn/start').pop().msg.params;
    assert.equal(ts.approvalPolicy, 'untrusted');
    assert.deepEqual(ts.sandboxPolicy, { type: 'workspaceWrite', networkAccess: false });
    await w.cmd({ cmd: 'permission.answer', sid: st.sid, requestId: p.requestId, decision: 'deny' });
    const pe = await w.until((e) => e.type === 'permission.request' && e.kind === 'edit' && e.requestId !== p2.requestId);
    await w.cmd({ cmd: 'permission.answer', sid: st.sid, requestId: pe.requestId, decision: 'deny' });
    await w.until((e) => e.type === 'turn.ended' && e.seq > pe.seq);
    assert.equal(readFileSync(join(repo, 'hello.txt'), 'utf8'), 'hello\nworld\n', 'declined: untouched');
    assert.ok(w.events.some((e) => e.type === 'tool.result' && e.callId === 'f1' && e.status === 'denied'));
    assert.deepEqual(logOf(CODEX_LOG).filter((x) => x.kind === 'answer').slice(-2).map((x) => x.result.decision), ['decline', 'decline']);
  });

  await ok('Esc interrupts the turn', async () => {
    await w.cmd({ cmd: 'session.send', sid: st.sid, text: 'go slow' });
    await w.until((e) => e.type === 'message.delta' && e.text === 'Working');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await w.cmd({ cmd: 'session.interrupt', sid: st.sid })).ok, true);
    const end = await w.until((e) => e.type === 'turn.ended' && e.status === 'interrupted');
    assert.ok(end);
  });

  await w.cmd({ cmd: 'session.stop', sid: st.sid });
  await w.until((e) => e.type === 'session.ended' && e.sid === st.sid);
  w.engine.shutdown();
}

console.log('\nCodex, with an API key:');
{
  reset();
  const w = world({ config: {}, secrets: { codex: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123' }, extraEnv: { FAKE_CODEX_NOAUTH: '1' } });
  await w.cmd({ cmd: 'workspace.open', path: repo });
  const st = await w.cmd({ cmd: 'session.start', provider: 'codex', cwd: repo, mode: 'auto' });
  await w.until((e) => e.type === 'session.ready' && e.sid === st.sid);

  await ok('the key goes to a Codex home of y3k Code\'s own, never over their login', () => {
    const spawn = logOf(CODEX_LOG).filter((x) => x.kind === 'spawn').pop();
    assert.ok(spawn.codexHome && spawn.codexHome.includes(join('homes', 'codex')), spawn.codexHome);
    const login = logOf(CODEX_LOG).filter((x) => x.kind === 'in' && x.msg.method === 'account/login/start').pop().msg.params;
    assert.deepEqual(login, { type: 'apiKey', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123' });
    const start = logOf(CODEX_LOG).filter((x) => x.kind === 'in' && x.msg.method === 'thread/start').pop().msg.params;
    assert.equal(start.sandbox, 'workspace-write');
    assert.equal(start.approvalPolicy, 'on-request', 'auto still asks when it decides it must');
  });

  await w.cmd({ cmd: 'session.stop', sid: st.sid });
  await w.until((e) => e.type === 'session.ended' && e.sid === st.sid);
  w.engine.shutdown();
}

// --- Gemini ------------------------------------------------------------------------
console.log('\nGemini:');
{
  reset();
  const noKey = world();
  await noKey.cmd({ cmd: 'workspace.open', path: repo });
  await ok('no key, no Gemini — its own sign-in is never used', async () => {
    const r = await noKey.cmd({ cmd: 'session.start', provider: 'gemini', cwd: repo, mode: 'ask' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'needs-key');
  });
  noKey.engine.shutdown();

  const w = world({ secrets: { gemini: 'AIzaSyD-this-is-a-fake-gemini-key-000000' } });
  await w.cmd({ cmd: 'workspace.open', path: repo });

  await ok('"auto" is not offered — Gemini\'s only one skips every permission', async () => {
    const r = await w.cmd({ cmd: 'session.start', provider: 'gemini', cwd: repo, mode: 'auto' });
    assert.equal(r.code, 'mode-unavailable');
  });

  const st = await w.cmd({ cmd: 'session.start', provider: 'gemini', cwd: repo, mode: 'acceptEdits' });
  await w.until((e) => e.type === 'session.ready' && e.sid === st.sid);

  await ok('an API key, a home of its own, no Google sign-in, no other vendor\'s key', () => {
    assert.equal(st.ok, true, st.error);
    const spawn = logOf(GEMINI_LOG).filter((x) => x.kind === 'spawn').pop();
    assert.ok(spawn.home.includes(join('homes', 'gemini')));
    assert.ok(spawn.argv.includes('--acp') && spawn.argv.includes('--skip-trust'));
    assert.ok(spawn.hasKey);
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENAI_USE_GCA']) assert.ok(!spawn.envNames.includes(k), k);
    const ins = logOf(GEMINI_LOG).filter((x) => x.kind === 'in').map((x) => x.msg);
    const init = ins.find((m) => m.method === 'initialize').params;
    assert.deepEqual(init.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, 'it uses its own tools');
    const auth = ins.find((m) => m.method === 'authenticate').params;
    assert.equal(auth.methodId, 'gemini-api-key');
    assert.ok(!ins.some((m) => m.params?.methodId === 'oauth-personal'));
    assert.equal(ins.find((m) => m.method === 'session/set_mode').params.modeId, 'autoEdit');
    assert.ok(!logOf(GEMINI_LOG).some((x) => x.kind === 'YOLO'));
    const settings = JSON.parse(readFileSync(join(spawn.home, '.gemini', 'settings.json'), 'utf8'));
    assert.equal(settings.security.auth.selectedType, 'gemini-api-key');
    assert.equal(settings.privacy.usageStatisticsEnabled, false);
  });

  await ok('its "[MODE_UPDATE]" line is a mode change, not words', async () => {
    await w.until((e) => e.type === 'mode.changed' && e.mode === 'acceptEdits');
    assert.ok(!w.events.some((e) => e.type === 'message.delta' && /MODE_UPDATE/.test(e.text)));
  });

  await w.cmd({ cmd: 'session.send', sid: st.sid, text: 'change world to y3k' });
  const perm = await w.until((e) => e.type === 'permission.request' && e.sid === st.sid);

  await ok('the edit is a diff on the card before it happens', () => {
    assert.equal(perm.kind, 'edit');
    assert.deepEqual(perm.preview.diff[0].hunks[0].lines, [' hello', '-world', '+y3k']);
    assert.equal(readFileSync(join(repo, 'hello.txt'), 'utf8'), 'hello\nworld\n');
    assert.deepEqual(perm.suggestions.map((s) => s.label), ['Allow for this session']);
    assert.ok(w.events.some((e) => e.type === 'tool.call' && e.callId === 'edit-1'), 'announced even though Gemini sends no tool_call before asking');
  });

  await w.cmd({ cmd: 'permission.answer', sid: st.sid, requestId: perm.requestId, decision: 'allow' });
  await w.until((e) => e.type === 'turn.ended' && e.sid === st.sid);

  await ok('allowed once → proceed_once; the edit lands; thoughts, text, the read and usage show', () => {
    assert.deepEqual(logOf(GEMINI_LOG).find((x) => x.kind === 'answer').result, { outcome: { outcome: 'selected', optionId: 'proceed_once' } });
    assert.equal(readFileSync(join(repo, 'hello.txt'), 'utf8'), 'hello\ny3k\n');
    const ev = w.events.filter((e) => e.sid === st.sid);
    assert.ok(ev.some((e) => e.type === 'message.delta' && e.kind === 'thinking' && /Planning/.test(e.text)));
    assert.ok(ev.some((e) => e.type === 'tool.result' && e.callId === 'read-1' && /world/.test(e.output.text)));
    assert.ok(ev.some((e) => e.type === 'tool.result' && e.callId === 'edit-1' && e.diff?.[0]?.added === 1));
    assert.equal(ev.filter((e) => e.type === 'usage.turn').pop().inputTokens, 1200);
    assert.equal(ev.filter((e) => e.type === 'turn.ended').pop().status, 'success');
  });

  await ok('declined: nothing changes, and the card says so (Gemini sends nothing after a no)', async () => {
    reset();
    await w.cmd({ cmd: 'session.send', sid: st.sid, text: 'again' });
    const p = await w.until((e) => e.type === 'permission.request' && e.requestId !== perm.requestId);
    await w.cmd({ cmd: 'permission.answer', sid: st.sid, requestId: p.requestId, decision: 'deny' });
    await w.until((e) => e.type === 'turn.ended' && e.seq > p.seq);
    assert.equal(readFileSync(join(repo, 'hello.txt'), 'utf8'), 'hello\nworld\n');
    assert.deepEqual(logOf(GEMINI_LOG).filter((x) => x.kind === 'answer').pop().result, { outcome: { outcome: 'cancelled' } });
    assert.ok(w.events.some((e) => e.type === 'tool.result' && e.callId === 'edit-1' && e.status === 'denied' && e.seq > p.seq));
  });

  await ok('Esc cancels, and a question left open is answered so the turn can end', async () => {
    await w.cmd({ cmd: 'session.send', sid: st.sid, text: 'go slow' });
    await w.until((e) => e.type === 'message.delta' && /Looking/.test(e.text) && e.seq > 0);
    await w.cmd({ cmd: 'session.interrupt', sid: st.sid });
    const end = await w.until((e) => e.type === 'turn.ended' && e.status === 'interrupted');
    assert.ok(end);
    assert.ok(logOf(GEMINI_LOG).some((x) => x.kind === 'in' && x.msg.method === 'session/cancel' && x.msg.id === undefined), 'a notification, as ACP requires');
  });

  await ok('the mode can go to plan, never to "auto"', async () => {
    assert.equal((await w.cmd({ cmd: 'session.setMode', sid: st.sid, mode: 'plan' })).ok, true);
    const no = await w.cmd({ cmd: 'session.setMode', sid: st.sid, mode: 'auto' });
    assert.equal(no.ok, false);
    assert.match(no.error, /never offers/);
    assert.ok(!logOf(GEMINI_LOG).some((x) => x.kind === 'YOLO'));
  });

  await w.cmd({ cmd: 'session.stop', sid: st.sid });
  const ended = await w.until((e) => e.type === 'session.ended' && e.sid === st.sid);
  await ok('stop ends it (by closing its input — its launcher ignores SIGTERM)', () => assert.equal(ended.reason, 'stopped'));
  w.engine.shutdown();
}

await new Promise((r) => setTimeout(r, 200));
rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
process.exit(0);
