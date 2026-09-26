// y3k CODE IN THE DESKTOP APP. Run:  node test/code-desktop.test.mjs
//
// Drives y3k-code/ipc-host.mjs exactly as Electron's utility process would —
// through a parent port — with the fake `claude`. The page's commands arrive,
// the engine's questions go out to be asked natively and nothing is trusted
// without the answer, events flow back, and a shutdown stops every tool
// before saying goodbye.
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHost } from '../y3k-code/ipc-host.mjs';
import { createStore } from '../y3k-code/store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const base = mkdtempSync(join(tmpdir(), 'y3k-code-desktop-'));
const repo = join(base, 'repo');
mkdirSync(repo);
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');

// Electron's parentPort: messages in as { data }, out through postMessage.
const toMain = [];
const port = new EventEmitter();
port.postMessage = (m) => { toMain.push(m); port.emit('out', m); };
let exited = null;
const store = createStore(join(base, 'config'));
store.setConfig({ signIn: true });
const { engine } = startHost(port, { env: { ...process.env, FAKE_CLAUDE_LOG: join(base, 'log') }, store, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') }, exit: (c) => { exited = c; } });

let id = 0;
const send = (m) => port.emit('message', { data: m });
const call = (cmd) => new Promise((resolve) => {
  const mine = ++id;
  const on = (m) => { if (m.type === 'reply' && m.id === mine) { port.off('out', on); resolve(m.result); } };
  port.on('out', on);
  send({ type: 'cmd', id: mine, cmd });
});
const next = (pred, ms = 8000) => new Promise((resolve, reject) => {
  const hit = toMain.find(pred);
  if (hit) return resolve(hit);
  const t = setTimeout(() => { port.off('out', on); reject(new Error('timed out')); }, ms);
  const on = (m) => { if (pred(m)) { clearTimeout(t); port.off('out', on); resolve(m); } };
  port.on('out', on);
});

console.log('the desktop engine host:');

await ok('commands in, answers out', async () => {
  const r = await call({ cmd: 'engine.hello' });
  assert.equal(r.ok, true);
  assert.equal(r.name, 'y3k-code');
  await next((m) => m.type === 'event' && m.event.type === 'provider.status');
});

await ok('a folder is trusted only on a yes from the native dialog', async () => {
  const pending = call({ cmd: 'workspace.open', path: repo });
  const q = await next((m) => m.type === 'consent');
  assert.equal(q.kind, 'folder.trust');
  assert.match(q.text, /^Trust /);
  send({ type: 'consent', id: q.id, allowed: false });
  const no = await pending;
  assert.equal(no.ok, false);
  assert.equal(no.code, 'declined');
  const again = call({ cmd: 'workspace.open', path: repo });
  const q2 = await next((m) => m.type === 'consent' && m.id !== q.id);
  send({ type: 'consent', id: q2.id, allowed: true });
  assert.equal((await again).ok, true);
});

await ok('the page cannot answer for the person', async () => {
  // a consent message only resolves a question the engine is actually asking
  send({ type: 'consent', id: 999, allowed: true });
  const r = await call({ cmd: 'provider.list' });
  assert.equal(r.ok, true);
});

await ok('a session runs, and catching up returns what was missed', async () => {
  const s = await call({ cmd: 'session.start', provider: 'claude', cwd: repo, mode: 'acceptEdits' });
  assert.equal(s.ok, true, s.error);
  await call({ cmd: 'session.send', sid: s.sid, text: 'hi' });
  await next((m) => m.type === 'event' && m.event.type === 'permission.request');
  const mine = ++id;
  send({ type: 'since', id: mine, after: 0 });
  const r = await next((m) => m.type === 'reply' && m.id === mine);
  assert.ok(Array.isArray(r.result) && r.result.some((e) => e.type === 'session.started'));
});

await ok('shutdown stops every tool, then says goodbye', async () => {
  assert.ok(engine.liveChildren() > 0, 'a tool is running');
  send({ type: 'shutdown' });
  await next((m) => m.type === 'bye', 10000);
  assert.equal(engine.liveChildren(), 0);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(exited, 0);
});

rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
process.exit(0);
