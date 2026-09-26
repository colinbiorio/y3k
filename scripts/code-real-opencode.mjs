#!/usr/bin/env node
// Drive the REAL opencode binary through the y3k Code engine, against a stand-in
// model on 127.0.0.1 (test/fakes/openai-compat.mjs, reached as "Ollama") — so
// no model provider is called and no key is needed. Checks: the edit is a diff
// on the card first, the command is on the card first, nothing changes without
// a yes, a mode change (a quick restart) lets edits through but still asks
// before commands, a decline keeps the file as it was, "auto" is refused.
//
//   OPENCODE_BIN=/path/to/opencode node scripts/code-real-opencode.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = process.env.OPENCODE_BIN;
if (!BIN) { console.error('Set OPENCODE_BIN to an opencode binary.'); process.exit(2); }
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-oc-'));
const repo = realpathSync(mkdtempSync(join(tmp, 'repo-')));
const reset = () => writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
reset();
const script = join(tmp, 'script.json');
writeFileSync(script, JSON.stringify({ steps: [
  { reasoning: 'Plan the edit.', text: 'Editing it.', tool: { name: 'edit', args: { filePath: join(repo, 'hello.txt'), oldString: 'world', newString: 'y3k' } } },
  { text: 'Now a command.', tool: { name: 'bash', args: { command: 'echo hi', description: 'Say hi' } } },
  { text: 'All done.' },
] }));
const mockPort = await freePort();
const mock = spawn(process.execPath, [join(ROOT, 'test', 'fakes', 'openai-compat.mjs'), String(mockPort), script], { stdio: 'ignore', env: { ...process.env, MOCK_LOG: join(tmp, 'mock.log') } });
await new Promise((r) => setTimeout(r, 400));

const xdg = (k) => { const d = join(tmp, k); mkdirSync(d, { recursive: true }); return d; };
const env = { ...process.env, HOME: xdg('home'), XDG_CONFIG_HOME: xdg('config'), XDG_DATA_HOME: xdg('data'), XDG_STATE_HOME: xdg('state'), XDG_CACHE_HOME: xdg('cache'),
  Y3K_OLLAMA_URL: `http://127.0.0.1:${mockPort}`, OPENCODE_DISABLE_MODELS_FETCH: 'true', DEEPSEEK_API_KEY: 'sk-person-env-key-not-for-opencode' };
const store = createStore(join(tmp, 'engine'));
const engine = createEngine({ store, consent: fixedConsent(true), env, bins: { opencode: BIN } });
const events = [];
engine.subscribe((e) => events.push(e));
const until = (pred, ms = 60000) => new Promise((res, rej) => {
  const f = events.find(pred);
  if (f) return res(f);
  const t = setTimeout(() => { un(); rej(new Error('timed out; last: ' + events.slice(-6).map((e) => `${e.type}${e.text ? ':' + String(e.text).slice(0, 60) : ''}`).join(', '))); }, ms);
  const un = engine.subscribe((e) => { if (pred(e)) { clearTimeout(t); un(); res(e); } });
});
const cmd = (c) => engine.handle(c, { via: 'script' });

try {
  await cmd({ cmd: 'workspace.open', path: repo });
  const st = await cmd({ cmd: 'session.start', provider: 'opencode', cwd: repo, mode: 'ask', model: 'ollama/mock-coder' });
  check('starts', st.ok, st.error);
  const ready = await until((e) => e.type === 'session.ready' && e.sid === st.sid);
  check('the real server is up, on a session of its own', /^ses_/.test(ready.providerSessionId), ready.providerSessionId);
  const models = await until((e) => e.type === 'provider.status' && e.provider === 'opencode');
  check('only the models it was given (no free hosted provider)', models.models.every((m) => m.id.startsWith('ollama/')), models.models.map((m) => m.id).join(', '));

  await cmd({ cmd: 'session.send', sid: st.sid, text: 'change world to y3k, then say hi' });
  const edit = await until((e) => e.type === 'permission.request' && e.sid === st.sid);
  check('the edit asks, with its diff on the card', edit.kind === 'edit' && JSON.stringify(edit.preview.diff?.[0]?.hunks?.[0]?.lines || []).includes('+y3k'), JSON.stringify(edit.preview).slice(0, 200));
  check('nothing has changed while it asks', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\nworld\n');
  await cmd({ cmd: 'permission.answer', sid: st.sid, requestId: edit.requestId, decision: 'allow' });
  const bash = await until((e) => e.type === 'permission.request' && e.sid === st.sid && e.requestId !== edit.requestId);
  check('the command asks, with the command on the card', bash.kind === 'bash' && bash.preview.command === 'echo hi', JSON.stringify(bash.preview));
  check('the edit landed after the yes', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n');
  await cmd({ cmd: 'permission.answer', sid: st.sid, requestId: bash.requestId, decision: 'allow' });
  const end = await until((e) => e.type === 'turn.ended' && e.sid === st.sid);
  check('the turn ends well', end.status === 'success', end.error);
  const ev = events.filter((e) => e.sid === st.sid);
  check('the command ran and its output shows', ev.some((e) => e.type === 'tool.result' && /hi/.test(e.output?.text || '')));
  check('streamed text and thinking', ev.some((e) => e.type === 'message.delta' && e.kind === 'text') && ev.some((e) => e.type === 'message.delta' && e.kind === 'thinking'));
  check('usage per step', ev.some((e) => e.type === 'usage.turn' && e.inputTokens === 1200));

  check('"auto" is refused', !(await cmd({ cmd: 'session.setMode', sid: st.sid, mode: 'auto' })).ok);
  const m = await cmd({ cmd: 'session.setMode', sid: st.sid, mode: 'acceptEdits' });
  check('a mode change restarts onto the same session', m.ok, m.error);
  reset();
  const before = events.length;
  await cmd({ cmd: 'session.send', sid: st.sid, text: 'again' });
  const p2 = await until((e) => e.type === 'permission.request' && e.sid === st.sid && events.indexOf(e) >= before);
  check('in accept-edits the edit went through without asking; the command still asks', p2.kind === 'bash' && readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n', p2.kind);
  await cmd({ cmd: 'permission.answer', sid: st.sid, requestId: p2.requestId, decision: 'deny', message: 'not now' });
  const end2 = await until((e) => e.type === 'turn.ended' && e.sid === st.sid && events.indexOf(e) >= before);
  check('a no is a no, and the turn still ends', ev && end2 && events.some((e) => e.type === 'tool.result' && e.status === 'denied' && events.indexOf(e) >= before), end2.status);

  const spawns = engine.audit.tail(200).filter((a) => a.kind === 'session.spawn' && a.provider === 'opencode');
  check('the engine never passed a key on the command line', spawns.every((a) => !JSON.stringify(a.args).includes('sk-')));

  await cmd({ cmd: 'session.stop', sid: st.sid });
  const ended = await until((e) => e.type === 'session.ended' && e.sid === st.sid);
  check('stop ends it', ended.reason === 'stopped', ended.reason);
  for (let i = 0; i < 50 && engine.liveChildren() > 0; i++) await new Promise((r) => setTimeout(r, 100));
  check('no process left', engine.liveChildren() === 0, String(engine.liveChildren()));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
} finally {
  engine.shutdown();
  mock.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll OpenCode checks passed.');
process.exit(failures ? 1 : 0);
