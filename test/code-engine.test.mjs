// y3k CODE, THE ENGINE'S PARTS. Run:  node test/code-engine.test.mjs
//
// The pieces every session leans on: the command gate, the ordered event stream,
// the private store, the activity record, pairing codes, diffs, which folders
// may be used, and which credential a session gets.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { validateCommand, COMMANDS, EVENTS, MODES } from '../y3k-code/protocol.mjs';
import { createBus, createCoalescer } from '../y3k-code/bus.mjs';
import { createStore } from '../y3k-code/store.mjs';
import { createAudit, redact } from '../y3k-code/audit.mjs';
import { createPairing, newCode } from '../y3k-code/pair.mjs';
import { lineDiff, editPreview, writePreview, parseUnified, countChanges } from '../y3k-code/diff.mjs';
import { refusalFor, inspectFolder, browse } from '../y3k-code/workspace.mjs';
import { chooseAuth, checkKey, publicCatalog, PROVIDERS } from '../y3k-code/providers.mjs';
import { childEnv } from '../y3k-code/proc.mjs';
import { toolKind, riskOf, capOutput } from '../y3k-code/adapters/base.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
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

ok('a key if there is one; the person\'s own sign-in only when they turned it on here; Gemini never', () => {
  assert.equal(chooseAuth('claude', {}).code, 'needs-key');
  assert.equal(chooseAuth('claude', { secrets: { claude: 'k' } }).method, 'apiKey');
  assert.equal(chooseAuth('claude', { config: { signIn: true } }).method, 'subscription');
  assert.equal(chooseAuth('claude', { config: { signIn: true }, secrets: { claude: 'k' } }).method, 'apiKey', 'a key wins unless they chose the sign-in');
  assert.equal(chooseAuth('claude', { config: { signIn: true, auth: { claude: 'subscription' } }, secrets: { claude: 'k' } }).method, 'subscription');
  assert.equal(chooseAuth('gemini', { config: { signIn: true } }).code, 'needs-key');
  assert.ok(!PROVIDERS.gemini.auth.includes('subscription'));
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

rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
