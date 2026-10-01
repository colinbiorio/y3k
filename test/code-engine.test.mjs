// y3k CODE, THE ENGINE'S PARTS. Run:  node test/code-engine.test.mjs
//
// The pieces every session leans on: the command gate, the ordered event stream,
// the private store, the activity record, pairing codes, diffs, which folders
// may be used, which credential a session gets, and the yes asked on the machine
// (terminal and approval page, first answer wins).
import assert from 'node:assert';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCommand, COMMANDS, EVENTS, MODES } from '../y3k-code/protocol.mjs';
import { createBus, createCoalescer, COALESCED } from '../y3k-code/bus.mjs';
import { createStore } from '../y3k-code/store.mjs';
import { createAudit, redact } from '../y3k-code/audit.mjs';
import { createPairing, newCode, normalizeCode, PRE_TTL, CODE_TTL } from '../y3k-code/pair.mjs';
import { lineDiff, editPreview, writePreview, parseUnified, countChanges } from '../y3k-code/diff.mjs';
import { refusalFor, inspectFolder, browse } from '../y3k-code/workspace.mjs';
import { chooseAuth, checkKey, publicCatalog, authState, keyChoice, keyChosen, PROVIDERS } from '../y3k-code/providers.mjs';
import { createConsentDesk, terminalConsent, fixedConsent, describe } from '../y3k-code/consent.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { childEnv } from '../y3k-code/proc.mjs';
import { toolKind, riskOf, capOutput } from '../y3k-code/adapters/base.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const aok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const base = mkdtempSync(join(tmpdir(), 'y3k-code-parts-'));

console.log('the command gate:');

ok('only known commands, only known fields, only the four modes', () => {
  assert.equal(validateCommand({ cmd: 'engine.hello' }).ok, true);
  assert.equal(validateCommand({ cmd: 'shell.exec', command: 'rm -rf /' }).ok, false);
  assert.equal(validateCommand({ cmd: 'engine.hello', extra: 1 }).ok, false);
  assert.equal(validateCommand({ cmd: '__proto__' }).ok, false);
  assert.equal(validateCommand({ cmd: 'constructor' }).ok, false);
  assert.equal(validateCommand({ cmd: 'session.setMode', sid: 'a', mode: 'bypassPermissions' }).ok, false);
  assert.deepEqual(MODES, ['ask', 'plan', 'acceptEdits', 'auto']);
  assert.equal(validateCommand({ cmd: 'session.send', sid: 'a', text: 5 }).ok, false);
  assert.equal(validateCommand({ cmd: 'session.send', sid: 'a'.repeat(65), text: 'x' }).ok, false, 'too long is refused, not cut');
  assert.equal(validateCommand(null).ok, false);
  assert.equal(validateCommand([]).ok, false);
});

ok('nothing in the protocol runs a command or skips permissions', () => {
  const all = JSON.stringify({ COMMANDS, EVENTS });
  assert.ok(!/bypass|dangerous|exec\b|shell\./i.test(all));
});

console.log('\nthe event stream:');

ok('numbers every event, replays after a point, knows when it cannot', () => {
  const bus = createBus({ ringSize: 5 });
  for (let i = 0; i < 8; i++) bus.emit({ type: 'notice', text: String(i) });
  assert.equal(bus.seq, 8);
  assert.deepEqual(bus.since(6).map((e) => e.seq), [7, 8]);
  assert.equal(bus.since(1), null, 'fell out of the ring');
  assert.equal(bus.since(3).length, 5);
  assert.match(bus.epoch, /^[0-9a-f]{16}$/);
  assert.notEqual(createBus().epoch, bus.epoch);
});

ok('one bad listener does not stop the others', () => {
  const bus = createBus();
  let got = 0;
  bus.subscribe(() => { throw new Error('x'); });
  bus.subscribe(() => { got++; });
  bus.emit({ type: 'notice' });
  assert.equal(got, 1);
});

ok('streamed fragments are gathered per block and never mixed', () => {
  const out = [];
  const c = createCoalescer((e) => out.push(e), 1000);
  c.push({ sid: 's', id: 'm', block: 0, kind: 'text', text: 'he' });
  c.push({ sid: 's', id: 'm', block: 0, kind: 'text', text: 'llo' });
  c.push({ sid: 's', id: 'm', block: 1, kind: 'text', text: '!' });
  c.push({ sid: 't', id: 'm', block: 1, kind: 'text', text: '?' });
  c.flush();
  assert.deepEqual(out.map((e) => e.text), ['hello', '!', '?']);
});

ok('a running command\'s output and a helper\'s status: only the latest of each is sent', () => {
  // Codex re-sends the last 2000 characters of output on EVERY output delta;
  // the screen keeps only the newest (state.js), so the rest is flood.
  const out = [];
  const c = createCoalescer((e) => out.push(e), 1000);
  c.push({ type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'a' });
  c.push({ type: 'tool.progress', callId: 'x', text: 'ls\n' });
  c.push({ type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'b' });
  c.push({ type: 'tool.progress', callId: 'x', text: 'ls\nfile' });
  c.push({ type: 'tool.progress', callId: 'y', text: 'other' });
  c.push({ type: 'subagent.progress', taskId: 't', text: 'reading' });
  c.push({ type: 'subagent.progress', taskId: 't', text: 'writing' });
  assert.equal(c.size, 4, 'one pending entry per block / call / task');
  c.flush();
  assert.deepEqual(out.map((e) => [e.type, e.callId || e.taskId || e.block, e.text]), [
    ['message.delta', 0, 'ab'], ['tool.progress', 'x', 'ls\nfile'], ['tool.progress', 'y', 'other'], ['subagent.progress', 't', 'writing'],
  ], 'in the order each first arrived, fragments joined, progress last-write-wins');
  assert.deepEqual([...COALESCED].sort(), ['message.delta', 'subagent.progress', 'tool.progress']);
});

await aok('one timer for everything pending, not one per entry', async () => {
  // Counted, not timed: this machine may be busy enough that a 10ms sleep
  // takes 30, and a test that races the clock only measures the load.
  const out = [];
  const c = createCoalescer((e) => out.push(e), 20);
  const real = globalThis.setTimeout;
  let armed = 0;
  globalThis.setTimeout = (fn, ms, ...rest) => { armed += 1; return real(fn, ms, ...rest); };
  try {
    c.push({ type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'a' });
    c.push({ type: 'tool.progress', callId: 'x', text: '1' });
    c.push({ type: 'message.delta', id: 'm', block: 0, kind: 'text', text: 'b' });
  } finally { globalThis.setTimeout = real; }
  assert.equal(armed, 1, 'three entries, two keys, one timer');
  assert.equal(c.size, 2);
  for (let i = 0; i < 100 && !out.length; i++) await tick(10);
  assert.deepEqual(out.map((e) => e.text), ['ab', '1'], 'both went together when that timer was up, in arrival order');
  assert.equal(c.size, 0);
});

// A running command's output is shown as it comes, but only its result is kept
// on disk: a build that prints for minutes would otherwise write tens of these a
// second, and a reload (the last 5000 events) would no longer reach the start.
await aok('a running command\'s output is live only; the session on disk keeps its start, the call and the result', async () => {
  const repo = realpathSync(mkdtempSync(join(base, 'repo-')));
  writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
  const none = join(base, 'not-installed');
  const engine = createEngine({ store: createStore(join(base, 'cfg-disk')), consent: fixedConsent(true),
    bins: { codex: join(dirname(fileURLToPath(import.meta.url)), 'fakes', 'codex.mjs'), claude: none, gemini: none, opencode: none } });
  const live = [];
  engine.subscribe((e) => {
    live.push(e);
    if (e.type === 'permission.request') engine.handle({ cmd: 'permission.answer', sid: e.sid, requestId: e.requestId, decision: 'allow' });
  });
  assert.equal((await engine.handle({ cmd: 'workspace.open', path: repo })).ok, true);
  const st = await engine.handle({ cmd: 'session.start', provider: 'codex', cwd: repo, mode: 'ask' });
  assert.equal(st.ok, true, st.error);
  await engine.handle({ cmd: 'session.send', sid: st.sid, text: 'change world to y3k' });
  for (let i = 0; i < 400 && !live.some((e) => e.type === 'turn.ended' && e.sid === st.sid); i++) await tick(20);
  assert.ok(live.some((e) => e.type === 'tool.progress' && e.sid === st.sid && e.callId === 'c1'), 'the page saw the output while it ran');
  const r = await engine.handle({ cmd: 'session.load', sid: st.sid });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.events[0].type, 'session.started');
  assert.ok(!r.events.some((e) => e.type === 'tool.progress'), 'none of it was written down');
  assert.ok(r.events.some((e) => e.type === 'tool.call' && e.callId === 'c1'));
  assert.ok(r.events.some((e) => e.type === 'tool.result' && e.callId === 'c1' && /world/.test(e.output.text)), 'the final output is');
  await engine.handle({ cmd: 'session.stop', sid: st.sid });
  engine.shutdown();
});

console.log('\nthe store and the record:');

ok('files are readable only by the person', () => {
  const s = createStore(join(base, 'cfg'));
  s.setSecret('claude', 'sk-ant-secret');
  s.setConfig({ a: 1 });
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(base, 'cfg', 'secrets.json')).mode & 0o777, 0o600);
    assert.equal(statSync(join(base, 'cfg')).mode & 0o777, 0o700);
  }
  const again = createStore(join(base, 'cfg'));
  assert.equal(again.secrets().claude, 'sk-ant-secret');
  assert.ok(!JSON.stringify(again.config()).includes('sk-ant'), 'keys live apart from settings');
});

ok('another process\'s write is seen at once: a revoke sticks, a key choice needs no restart', () => {
  // A companion and `y3k-code revoke` in a second terminal share the folder.
  const dir = join(base, 'shared');
  const running = createStore(dir);
  const other = createStore(dir);
  const pairing = createPairing({ load: running.tokens, save: running.setTokens });
  pairing.issueCode();
  const tok = pairing.mint({ origin: 'https://yearthreethousand.com' });
  assert.ok(pairing.verify(tok));
  assert.equal(Object.keys(other.tokens()).length, 1, 'the other process sees the new token');
  other.setTokens({}); // `y3k-code revoke`
  assert.equal(pairing.verify(tok), false, 'the running companion stops honouring it');
  assert.deepEqual(running.tokens(), {}, '…and never writes the old tokens back');
  assert.equal(running.config().auth?.claude, undefined);
  other.setConfig({ auth: { claude: 'apiKey' } }); // `y3kode key set claude`
  assert.equal(running.config().auth.claude, 'apiKey');
  // two engines trusting different folders keep both
  running.setFolder('/a', { trusted: true });
  other.setFolder('/b', { trusted: true });
  running.setFolder('/a', { mode: 'ask' });
  assert.deepEqual(Object.keys(createStore(dir).folders()).sort(), ['/a', '/b']);
});

ok('the record hides secrets and caps size; its kind cannot be overwritten', () => {
  const r = redact({ apiKey: 'sk-1', headers: { Authorization: 'Bearer x' }, note: 'y'.repeat(5000), nested: { password: 'p' } });
  assert.equal(r.apiKey, '[redacted]');
  assert.equal(r.headers.Authorization, '[redacted]');
  assert.equal(r.nested.password, '[redacted]');
  assert.ok(r.note.length < 2200);
  const dir = join(base, 'audit');
  mkdirSync(dir);
  const a = createAudit(dir);
  a.write('permission', { kind: 'forged', token: 't' });
  const last = a.tail(1)[0];
  assert.equal(last.kind, 'permission');
  assert.equal(last.token, '[redacted]');
});

console.log('\npairing codes:');

ok('eight characters, no look-alikes', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
});

ok('a token works until it is idle for 30 days; only its hash is kept', () => {
  let saved = {};
  const clock = { t: 1e12 };
  const p = createPairing({ load: () => saved, save: (x) => { saved = x; }, now: () => clock.t });
  const code = p.issueCode();
  assert.equal(p.check(code.toLowerCase().replace(/(....)/, '$1-')), 'ok', 'case and dashes do not matter');
  const tok = p.mint({ origin: 'https://yearthreethousand.com' });
  assert.equal(p.code, null, 'the code is burnt');
  assert.ok(p.verify(tok));
  assert.ok(!JSON.stringify(saved).includes(tok));
  clock.t += 31 * 86400 * 1000;
  assert.equal(p.verify(tok), false);
  assert.equal(p.verify('x'.repeat(200)), false);
});

ok('a code from --pair: ours only, good once, for 15 minutes, with no second yes', () => {
  assert.equal(normalizeCode('abcd-2345'), 'ABCD2345');
  assert.equal(normalizeCode(' ABCD 2345 '), 'ABCD2345');
  for (const bad of ['ABCD234', 'ABCD23456', 'ABCD234O', 'ABCD2341', 'ABCD234I', '', null, undefined, '../../etc', 'ABCD;2345']) assert.equal(normalizeCode(bad), null, String(bad));
  const clock = { t: 1e12 };
  let saved = {};
  const p = createPairing({ load: () => saved, save: (x) => { saved = x; }, now: () => clock.t });
  assert.equal(p.preapprove('nope'), false);
  assert.equal(p.preapprove('WXYZ-2345'), true);
  assert.equal(p.preapproved, true);
  assert.equal(p.check('wxyz2345'), 'preapproved');
  const tok = p.mint({ origin: 'https://yearthreethousand.com', preapproved: true });
  assert.ok(p.verify(tok));
  assert.equal(p.preapproved, false, 'burnt');
  clock.t += 61000;
  assert.notEqual(p.check('WXYZ2345'), 'preapproved', 'single use');
  // …and gone after 15 minutes
  p.preapprove('WXYZ2346');
  clock.t += PRE_TTL + 1;
  assert.notEqual(p.check('WXYZ2346'), 'preapproved');
  assert.equal(PRE_TTL, 15 * 60 * 1000);
});

ok('wrong guesses void a pre-approved code too; a terminal code is still asked about', () => {
  const clock = { t: 1e12 };
  const p = createPairing({ now: () => clock.t });
  p.preapprove('WXYZ2345');
  const got = [];
  for (let i = 0; i < 5; i++) { got.push(p.check('AAAA2222')); clock.t += 13000; }
  assert.deepEqual(got, ['bad', 'bad', 'bad', 'bad', 'voided'], 'the fifth says so, so the terminal can show a code to type instead');
  clock.t += 61000;
  assert.equal(p.check('WXYZ2345'), 'expired', 'void after five wrong tries');
  const code = p.issueCode();
  p.preapprove('WXYZ2345');
  assert.equal(p.check(code), 'ok', 'the shown code still needs its yes');
});

ok('a fresh code printed early leaves the old one working until it runs out', () => {
  const clock = { t: 1e12 };
  const p = createPairing({ now: () => clock.t });
  const old = p.issueCode();
  clock.t += CODE_TTL - 40000;
  const fresh = p.issueCode({ keep: true });
  assert.notEqual(fresh, old);
  assert.equal(p.check(old), 'ok', 'someone typing the old one gets in');
  assert.equal(p.check(fresh), 'ok');
  clock.t += 41000;
  assert.equal(p.check(old), 'bad', 'not after it expires');
  assert.equal(p.check(fresh), 'ok');
  const q = createPairing({ now: () => clock.t });
  const a = q.issueCode();
  q.issueCode();
  assert.equal(q.check(a), 'bad', 'a replaced code is dead unless kept on purpose');
});

ok('the fifth wrong try says so, so a new code is shown', () => {
  const clock = { t: 1e12 };
  const p = createPairing({ now: () => clock.t });
  const code = p.issueCode();
  const wrong = code[0] === 'A' ? 'B' + code.slice(1) : 'A' + code.slice(1);
  const got = [];
  for (let i = 0; i < 5; i++) { got.push(p.check(wrong)); clock.t += 13000; }
  assert.deepEqual(got, ['bad', 'bad', 'bad', 'bad', 'voided']);
  assert.equal(p.code, null);
});

ok('only browsers that can still get in count as paired', () => {
  const clock = { t: 1e12 };
  let saved = {};
  const p = createPairing({ load: () => saved, save: (x) => { saved = x; }, now: () => clock.t });
  p.issueCode();
  p.mint({ origin: 'https://yearthreethousand.com' });
  assert.equal(p.list().length, 1);
  clock.t += 31 * 86400 * 1000;
  assert.equal(p.list().length, 0);
});

console.log('\ndiffs:');

ok('an edit is diffed before it happens, in Claude Code\'s own shape', () => {
  const f = join(base, 'a.txt');
  writeFileSync(f, 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n');
  const d = editPreview(f, 'five', 'FIVE');
  assert.deepEqual(d.hunks, [{ oldStart: 2, oldLines: 7, newStart: 2, newLines: 7, lines: [' two', ' three', ' four', '-five', '+FIVE', ' six', ' seven', ' eight'] }]);
  assert.equal(editPreview(f, 'absent', 'x'), null, 'an edit that cannot apply shows nothing rather than a guess');
  const w = writePreview(join(base, 'new.txt'), 'a\nb\n');
  assert.equal(w.created, true);
  assert.equal(w.added, 2);
});

ok('a git patch is read into the same shape', () => {
  const files = parseUnified('diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n');
  assert.equal(files[0].path, 'x.js');
  assert.deepEqual(files[0].hunks[0].lines, [' a', '-b', '+c']);
  assert.deepEqual(countChanges(files[0].hunks), { added: 1, removed: 1 });
  assert.deepEqual(lineDiff('same\n', 'same\n'), []);
});

console.log('\nfolders:');

ok('the disk, the home folder, hidden folders and app data are refused', () => {
  assert.ok(refusalFor('/'));
  assert.ok(refusalFor(homedir()));
  assert.ok(refusalFor(join(homedir(), '.ssh')));
  assert.ok(refusalFor(join(base, 'cfg'), { configDir: join(base, 'cfg') }));
  assert.ok(refusalFor(null));
  const proj = join(base, 'proj');
  mkdirSync(proj);
  assert.equal(refusalFor(proj), null);
});

ok('the trust card lists what can run on open', () => {
  const proj = join(base, 'hostile');
  mkdirSync(join(proj, '.claude'), { recursive: true });
  mkdirSync(join(proj, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{}] }, permissions: { allow: ['Bash(*)'] } }));
  writeFileSync(join(proj, '.mcp.json'), JSON.stringify({ mcpServers: { steal: { command: 'curl' } } }));
  writeFileSync(join(proj, '.git', 'config'), '[core]\n\tfsmonitor = ./evil\n');
  writeFileSync(join(proj, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\n');
  writeFileSync(join(proj, 'CLAUDE.md'), 'hi');
  const kinds = inspectFolder(proj).findings.map((f) => f.kind);
  for (const k of ['hooks', 'allow-rules', 'connectors', 'git', 'instructions']) assert.ok(kinds.includes(k), k);
  assert.ok(inspectFolder(proj).findings.some((f) => /fsmonitor/.test(f.detail)));
});

ok('browsing stays inside home and does not follow links out', () => {
  assert.ok(browse('/etc').error);
  const r = browse(homedir());
  if (!r.error) assert.ok(r.entries.every((e) => !e.name.startsWith('.')));
  const link = join(homedir(), `y3k-code-test-link-${process.pid}`);
  try {
    symlinkSync('/etc', link);
    const again = browse(homedir());
    assert.ok(!again.entries?.some((e) => e.path === link), 'a link out of home is hidden');
    assert.ok(browse(link).error);
  } catch (err) { if (err.code !== 'EPERM' && err.code !== 'EACCES') throw err; } finally { try { rmSync(link); } catch { /* ignore */ } }
});

console.log('\ncredentials:');

ok('each tool\'s own sign-in, always, by default — a key only when the person chose one', () => {
  for (const id of ['claude', 'codex', 'gemini', 'opencode']) {
    assert.deepEqual(chooseAuth(id, {}), { method: 'subscription' }, `${id}: nothing to switch on`);
    assert.equal(chooseAuth(id, { secrets: { [id]: 'k' } }).method, 'subscription', `${id}: a key merely sitting in the store changes nothing`);
    assert.deepEqual(PROVIDERS[id].methods, ['subscription', 'apiKey']);
  }
  assert.equal(chooseAuth('gemini', { config: { signIn: false } }).method, 'subscription', 'the old switch means nothing now');
  assert.deepEqual(chooseAuth('claude', { config: { auth: { claude: 'apiKey' } }, secrets: { claude: 'k' } }), { method: 'apiKey', key: 'k' });
  assert.equal(chooseAuth('gemini', { config: { auth: { gemini: 'apiKey' } }, secrets: { gemini: 'g' } }).method, 'apiKey');
  const none = chooseAuth('codex', { config: { auth: { codex: 'apiKey' } } });
  assert.equal(none.code, 'needs-key', 'chose a key, set none');
  assert.match(none.error, /OpenAI API key.*own sign-in/);
  assert.equal(chooseAuth('opencode', { config: { auth: { opencode: 'apiKey' } } }).method, 'subscription', 'OpenCode: its own store, plus open-model keys');
  assert.equal(chooseAuth('claude', { config: { auth: { claude: 'subscription' } }, secrets: { claude: 'k' } }).method, 'subscription');
  assert.ok(chooseAuth('nope').error);
  // choosing and un-choosing a key touches only that tool
  assert.deepEqual(keyChoice({ auth: { codex: 'apiKey' } }, 'claude', true), { codex: 'apiKey', claude: 'apiKey' });
  assert.deepEqual(keyChoice({ auth: { codex: 'apiKey', claude: 'apiKey' } }, 'claude', false), { codex: 'apiKey' });
  assert.ok(keyChosen('claude', { auth: { claude: 'apiKey' } }) && !keyChosen('opencode', { auth: { opencode: 'apiKey' } }));
});

ok('keys are shape-checked and never listed', () => {
  assert.ok(checkKey('claude', 'sk-proj-abcdefghijklmnopqrstuvwxyz').error);
  assert.equal(checkKey('claude', ' sk-ant-api03-abcdefghijklmnopqrstuvwxyz ').key, 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
  assert.ok(checkKey('openrouter', 'short').error);
  const cat = publicCatalog({ secrets: { claude: 'sk-ant-api03-SECRET' } });
  assert.ok(!JSON.stringify(cat).includes('SECRET'));
  assert.equal(cat.find((p) => p.id === 'claude').keySet, true);
  assert.ok(cat.find((p) => p.id === 'opencode').via.find((v) => v.id === 'deepseek').notice);
});

ok('each provider says whether it can start, before a folder or a mode is picked', () => {
  const cat = (o) => Object.fromEntries(publicCatalog(o).map((p) => [p.id, p.auth]));
  assert.deepEqual(cat({}), { claude: 'unknown', codex: 'unknown', gemini: 'unknown', opencode: 'unknown' }, 'not checked yet');
  const signedIn = { installed: true, account: { state: 'signed-in' } };
  const signedOut = { installed: true, account: { state: 'signed-out' } };
  assert.deepEqual(cat({ detected: { claude: signedIn, codex: signedOut, gemini: { installed: false }, opencode: signedIn } }),
    { claude: 'ok', codex: 'signed-out', gemini: 'not-installed', opencode: 'ok' });
  assert.equal(authState('claude', { detected: { claude: { installed: true, account: { state: 'unknown' } } } }), 'unknown', 'the tool would not say');
  assert.equal(authState('claude', { config: { auth: { claude: 'apiKey' } }, secrets: { claude: 'k' }, detected: { claude: signedOut } }), 'ok', 'a chosen key does not need the sign-in');
  assert.equal(authState('claude', { config: { auth: { claude: 'apiKey' } }, detected: { claude: signedIn } }), 'needs-key', 'chose a key, set none');
  assert.equal(authState('claude', { config: { auth: { claude: 'apiKey' } }, secrets: { claude: 'k' }, detected: { claude: { installed: false } } }), 'not-installed');
  // OpenCode: its own store, a key for an open model, or Ollama — any one will do
  assert.equal(authState('opencode', { detected: { opencode: signedOut } }), 'needs-key', 'nothing at all: ask for an open-model key');
  assert.equal(authState('opencode', { secrets: { deepseek: 'd' }, detected: { opencode: signedOut } }), 'ok');
  assert.equal(authState('opencode', { detected: { opencode: { ...signedOut, ollama: true } } }), 'ok');
  assert.equal(authState('nope'), 'unknown');
  const claude = publicCatalog({ detected: { claude: signedOut } }).find((p) => p.id === 'claude');
  assert.equal(claude.loginCommand, 'claude');
  assert.deepEqual(publicCatalog({}).map((p) => p.loginCommand), ['claude', 'codex login', 'gemini', 'opencode auth login']);
  assert.equal(claude.method, 'subscription');
  assert.equal(claude.signIn, true, 'older pages read `signIn` as "runs on its own sign-in"');
  const keyed = publicCatalog({ config: { auth: { claude: 'apiKey' } }, secrets: { claude: 'k' } }).find((p) => p.id === 'claude');
  assert.deepEqual([keyed.method, keyed.keyChosen, keyed.signIn, keyed.keySet], ['apiKey', true, false, true]);
  for (const p of publicCatalog({})) assert.ok(!/terms|forbid|allow/i.test(p.note || ''), `${p.id}: says what happens, no hedging`);
});

ok('a child gets the person\'s environment minus any parent session', () => {
  const e = childEnv({ PATH: '/bin', HOME: '/h', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: '3', CLAUDE_CODE_USE_BEDROCK: '1' }, { set: { A: 1 } });
  assert.deepEqual(Object.keys(e).sort(), ['A', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', 'CLAUDE_CODE_USE_BEDROCK', 'HOME', 'PATH'].sort());
});

ok('tools are sorted by what they can do; long output is capped', () => {
  assert.equal(riskOf(toolKind('Bash')), 'exec');
  assert.equal(riskOf(toolKind('Write')), 'write');
  assert.equal(riskOf(toolKind('mcp__github__create_issue')), 'mcp');
  assert.equal(riskOf(toolKind('Grep')), 'read');
  const c = capOutput('x'.repeat(100000));
  assert.equal(c.truncated, true);
  assert.equal(c.bytes, 100000);
});

console.log('\nasked on this machine:');

// A terminal that says it is one, and whose lines we can type and read.
function fakeTerminal() {
  const input = new PassThrough();
  input.isTTY = true;
  const output = new PassThrough();
  let text = '';
  output.setEncoding('utf8').on('data', (d) => { text += d; });
  return { input, output, read: () => text, type: (s) => input.write(s + '\n') };
}

await aok('the approval page can answer a question the terminal is asking; the terminal says so', async () => {
  const t = fakeTerminal();
  const desk = createConsentDesk({ input: t.input, output: t.output, timeoutMs: 5000, approveUrl: () => 'http://127.0.0.1:1/approve' });
  const p = desk.ask('folder.trust', { path: '/work/site', findings: [] }, { id: 'c7' });
  await tick(10);
  assert.match(t.read(), /Trust \/work\/site\?[\s\S]*approval window: http:\/\/127\.0\.0\.1:1\/approve[\s\S]*Allow\? \[y\/N\]/);
  const [q] = desk.pending();
  assert.equal(q.id, 'c7', 'filed under the engine\'s own id');
  assert.equal(q.title, 'Trust this folder?');
  assert.match(q.nonce, /^[0-9a-f]{32}$/, '128 bits');
  assert.equal(desk.answer('c7', 'f'.repeat(32), true), 'bad', 'the wrong nonce answers nothing');
  assert.equal(desk.answer('c7', q.nonce, true), 'ok');
  assert.equal(await p, true);
  assert.match(t.read(), /answered in the approval window — allowed/);
  assert.equal(desk.answer('c7', q.nonce, false), 'gone', 'first answer wins');
  t.type('n');
  await tick(10);
  assert.deepEqual(desk.pending(), []);
});

await aok('the terminal can answer first; the page then finds it gone', async () => {
  const t = fakeTerminal();
  const desk = createConsentDesk({ input: t.input, output: t.output, timeoutMs: 5000, approveUrl: () => 'http://x/approve' });
  const p = desk.ask('mcp.add', { name: 'gh', command: 'npx' });
  await tick(10);
  const [q] = desk.pending();
  t.type('y');
  assert.equal(await p, true);
  assert.equal(desk.answer(q.id, q.nonce, false), 'gone');
});

await aok('one question at a time on the terminal; one the page answered is skipped there', async () => {
  const t = fakeTerminal();
  const desk = createConsentDesk({ input: t.input, output: t.output, timeoutMs: 5000, approveUrl: () => 'http://x/approve' });
  const a = desk.ask('mcp.add', { name: 'first', command: 'a' });
  const b = desk.ask('mcp.add', { name: 'second', command: 'b' });
  await tick(10);
  assert.equal(desk.pending().length, 2, 'the page lists both at once');
  assert.ok(!/second/.test(t.read()), 'the terminal asks only the first');
  const second = desk.pending().find((q) => q.text.includes('second'));
  desk.answer(second.id, second.nonce, false);
  assert.equal(await b, false);
  t.type('yes');
  assert.equal(await a, true);
  await tick(10);
  assert.ok(!/"second"[\s\S]*Allow\?/.test(t.read()), 'never asked on the terminal');
});

await aok('no terminal: wait for the page instead of refusing — and without a page, refuse as before', async () => {
  const out = new PassThrough();
  let said = '';
  out.setEncoding('utf8').on('data', (d) => { said += d; });
  const notty = new PassThrough();
  const desk = createConsentDesk({ input: notty, output: out, timeoutMs: 5000, approveUrl: () => 'http://127.0.0.1:9/approve' });
  const p = desk.ask('pair', { origin: 'https://yearthreethousand.com', agent: 'Chrome' });
  await tick(10);
  assert.match(said, /Answer in the approval window: http:\/\/127\.0\.0\.1:9\/approve/);
  const [q] = desk.pending();
  desk.answer(q.id, q.nonce, true);
  assert.equal(await p, true);
  assert.equal(await terminalConsent({ input: notty, output: out })('pair', {}), false, 'no terminal, no page: no');
  const late = createConsentDesk({ input: notty, output: out, timeoutMs: 30, approveUrl: () => 'http://x/approve' });
  assert.equal(await late.ask('pair', {}), false, 'no answer in time is no');
  assert.deepEqual(late.pending(), []);
});

// A connector's environment can change what its command does (NODE_OPTIONS,
// npm_config_registry), so the question names every variable and header it is
// given — but never a value: those are its keys, and this text reaches the page
// and the audit.
await aok('adding a connector names what it is given, and shows none of the values', async () => {
  const none = join(base, 'not-installed');
  const asked = [];
  const engine = createEngine({ store: createStore(join(base, 'cfg-mcp')), consent: async (kind, d) => { asked.push(describe(kind, d)); return true; },
    bins: { codex: none, claude: none, gemini: none, opencode: none } });
  const pending = [];
  engine.subscribe((e) => { if (e.type === 'consent.pending') pending.push(e.text); });
  const stdio = await engine.handle({ cmd: 'mcp.add', name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'server-github'], env: { GITHUB_TOKEN: 'ghp_secret123', NODE_OPTIONS: '--import=data:x' } });
  assert.equal(stdio.ok, true, stdio.error);
  const web = await engine.handle({ cmd: 'mcp.add', name: 'web', transport: 'http', url: 'https://mcp.example/x', headers: { Authorization: 'Bearer sk-hidden' } });
  assert.equal(web.ok, true, web.error);
  const [first, ...rest] = asked[0].split('\n');
  assert.equal(first, 'Add the connector "gh"? It runs: npx -y server-github', 'the first line is still the question (the desktop dialog\'s message)');
  assert.deepEqual(rest, ['With these environment variables set: GITHUB_TOKEN, NODE_OPTIONS']);
  assert.deepEqual(asked[1].split('\n'), ['Add the connector "web"? It connects to https://mcp.example/x', 'With these headers: Authorization']);
  assert.deepEqual(pending, asked, 'the page is shown the same words');
  const record = JSON.stringify(engine.audit.tail(50));
  for (const secret of ['ghp_secret123', '--import=data:x', 'sk-hidden']) assert.ok(!(asked.join() + record).includes(secret), secret);
  const added = engine.audit.tail(50).filter((a) => a.kind === 'mcp.add');
  assert.deepEqual(added.map((a) => [a.env, a.headers]), [[['GITHUB_TOKEN', 'NODE_OPTIONS'], []], [[], ['Authorization']]], 'the record has the names');
  assert.ok(!describe('mcp.add', { name: 'x', command: 'a' }).includes('\n'), 'nothing given: one line, as before');
});

rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
