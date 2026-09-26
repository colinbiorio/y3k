// y3k CODE, THE FOLDER'S TOOLS. Run:  node test/code-tools.test.mjs
//
// git (status after every turn, a file's diff), GitHub through the person's own
// `gh` (list, search, clone into ~/y3k-code — then the trust card, which shows
// what the clone carries), connectors (added only on a yes at the computer,
// secrets never echoed), and installing a coding tool (a yes, then npm).
// Fakes stand in for claude, gh and npm; HOME is a temp folder.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = mkdtempSync(join(tmpdir(), 'y3k-code-tools-'));
const HOME = join(base, 'home');
mkdirSync(HOME);
process.env.HOME = HOME; // os.homedir() — clones land under this, not the real one
const bin = join(base, 'bin');
mkdirSync(bin);
symlinkSync(join(ROOT, 'test', 'fakes', 'gh.mjs'), join(bin, 'gh'));
symlinkSync(join(ROOT, 'test', 'fakes', 'npm.mjs'), join(bin, 'npm'));

const { createStore } = await import('../y3k-code/store.mjs');
const { createEngine } = await import('../y3k-code/engine.mjs');
const { checkServer, publicList } = await import('../y3k-code/mcp.mjs');
const { REPO_RE, cloneDest } = await import('../y3k-code/github.mjs');

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const repo = join(base, 'repo');
mkdirSync(repo);
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
execFileSync('git', ['init', '-q', repo]);
execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.']);
execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first']);

const store = createStore(join(base, 'config'));
store.setConfig({ signIn: true });
let answer = true;
const asked = [];
const env = { ...process.env, HOME, PATH: `${bin}:${process.env.PATH}`, FAKE_CLAUDE_LOG: join(base, 'claude.log'), FAKE_NPM_LOG: join(base, 'npm.log') };
const engine = createEngine({ store, consent: async (kind, d) => { asked.push({ kind, d }); return answer; }, env, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') } });
const events = [];
engine.subscribe((e) => events.push(e));
const cmd = (c) => engine.handle(c, { via: 'test' });
const until = (pred, ms = 8000) => new Promise((res, rej) => {
  if (events.some(pred)) return res(events.find(pred));
  const t = setTimeout(() => { un(); rej(new Error('timed out')); }, ms);
  const un = engine.subscribe((e) => { if (pred(e)) { clearTimeout(t); un(); res(e); } });
});

console.log('git:');

await cmd({ cmd: 'workspace.open', path: repo });
const st = await cmd({ cmd: 'session.start', provider: 'claude', cwd: repo, mode: 'acceptEdits' });
await cmd({ cmd: 'session.send', sid: st.sid, text: 'edit it' });
const perm = await until((e) => e.type === 'permission.request');
await cmd({ cmd: 'permission.answer', sid: st.sid, requestId: perm.requestId, decision: 'allow' });
const gs = await until((e) => e.type === 'git.status' && e.sid === st.sid);

await ok('after a turn, the branch and what changed', () => {
  assert.ok(gs.branch, 'a branch');
  assert.deepEqual(gs.files.map((f) => f.path), ['hello.txt']);
  assert.equal(gs.files[0].work, 'M');
});

await ok('a file\'s diff comes back already read, in the one diff shape', async () => {
  const r = await cmd({ cmd: 'git.diff', cwd: repo, path: 'hello.txt' });
  assert.equal(r.ok, true);
  assert.equal(r.files[0].path, 'hello.txt');
  assert.deepEqual(r.files[0].hunks[0].lines, [' hello', '-world', '+y3k']);
});

await ok('git runs with the repository\'s own programs switched off', async () => {
  // an fsmonitor that would run a program on `git status`
  execFileSync('git', ['-C', repo, 'config', 'core.fsmonitor', `touch ${join(base, 'FSMONITOR-RAN')}`]);
  await cmd({ cmd: 'git.status', cwd: repo });
  assert.ok(!existsSync(join(base, 'FSMONITOR-RAN')));
  execFileSync('git', ['-C', repo, 'config', '--unset', 'core.fsmonitor']);
});

await ok('git needs a trusted folder', async () => {
  const r = await cmd({ cmd: 'git.status', cwd: base });
  assert.equal(r.ok, false);
});

await cmd({ cmd: 'session.stop', sid: st.sid });

console.log('\nGitHub:');

await ok('names are checked; clones get a fresh folder', () => {
  assert.ok(REPO_RE.test('colinbiorio/y3k'));
  for (const bad of ['../x', 'a/b/c', '-x/y', 'x/..', 'x/.', 'x y/z', '', '--upload-pack=x/y']) assert.ok(!REPO_RE.test(bad), bad);
  assert.equal(cloneDest('colinbiorio/y3k', '/nowhere'), '/nowhere/y3k');
});

await ok('their repositories, through their own gh', async () => {
  const r = await cmd({ cmd: 'github.repos' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.repos.map((x) => x.repo), ['colinbiorio/y3k', 'colinbiorio/p-vs-np'], 'a malformed name is dropped');
  assert.equal(r.repos[1].private, true);
  const s = await cmd({ cmd: 'github.repos', q: 'orb' });
  assert.equal(s.repos[0].repo, 'someone/found');
});

await ok('a clone lands in ~/y3k-code, and is not trusted until the trust card', async () => {
  const r = await cmd({ cmd: 'github.clone', repo: 'colinbiorio/y3k' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.path, join(HOME, 'y3k-code', 'y3k'));
  assert.equal((await cmd({ cmd: 'session.start', provider: 'claude', cwd: r.path, mode: 'ask' })).code, 'untrusted');
  const before = asked.length;
  answer = false;
  const t = await cmd({ cmd: 'workspace.open', path: r.path });
  assert.equal(t.ok, false);
  const card = asked[before];
  assert.equal(card.kind, 'folder.trust');
  assert.ok(card.d.findings.some((f) => f.kind === 'hooks'), 'the card shows the hook the repository carries');
  answer = true;
  const again = await cmd({ cmd: 'github.clone', repo: 'colinbiorio/y3k' });
  assert.equal(again.path, join(HOME, 'y3k-code', 'y3k-2'), 'never over an existing folder');
});

await ok('a bad name never reaches gh', async () => {
  const r = await cmd({ cmd: 'github.clone', repo: '--upload-pack=touch x/y' });
  assert.equal(r.ok, false);
});

console.log('\nconnectors:');

await ok('checked before anyone is asked', () => {
  assert.ok(checkServer({ name: 'bad name', transport: 'stdio', command: 'x' }).error);
  assert.ok(checkServer({ name: 'x', transport: 'stdio', command: 'a\nb' }).error);
  assert.ok(checkServer({ name: 'x', transport: 'http', url: 'http://evil.example/mcp' }).error, 'plain http only on this computer');
  assert.ok(checkServer({ name: 'x', transport: 'http', url: 'javascript:alert(1)' }).error);
  assert.ok(checkServer({ name: 'x', transport: 'http', url: 'https://mcp.example/x', headers: { 'X-Key': 'a\r\nb' } }).error);
  assert.equal(checkServer({ name: 'x', transport: 'http', url: 'http://127.0.0.1:3000/mcp' }).server.url, 'http://127.0.0.1:3000/mcp');
});

await ok('added only on a yes at the computer, with the exact command shown', async () => {
  answer = false;
  const no = await cmd({ cmd: 'mcp.add', name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'ghp_secret123' } });
  assert.equal(no.ok, false);
  const q = asked.at(-1);
  assert.equal(q.kind, 'mcp.add');
  assert.equal(q.d.command, 'npx');
  assert.deepEqual(q.d.args, ['-y', '@modelcontextprotocol/server-github']);
  assert.deepEqual(store.mcp().mcpServers, {});
  answer = true;
  const yes = await cmd({ cmd: 'mcp.add', name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_TOKEN: 'ghp_secret123' } });
  assert.equal(yes.ok, true);
  assert.ok(!JSON.stringify(yes).includes('ghp_secret123'), 'the secret is never echoed');
  assert.deepEqual(yes.servers[0].env, ['GITHUB_TOKEN']);
  assert.equal(store.mcp().mcpServers.gh.env.GITHUB_TOKEN, 'ghp_secret123', 'but it is kept, for the session');
});

await ok('new sessions get them', async () => {
  const s2 = await cmd({ cmd: 'session.start', provider: 'claude', cwd: repo, mode: 'ask' });
  for (let i = 0; i < 50 && !readFileSync(join(base, 'claude.log'), 'utf8').includes(s2.sid.slice(0, 0) + '--mcp-config'); i++) await new Promise((r) => setTimeout(r, 50));
  const spawns = readFileSync(join(base, 'claude.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'spawn');
  assert.ok(spawns.at(-1).argv.includes('--mcp-config'));
  await cmd({ cmd: 'session.stop', sid: s2.sid });
});

await ok('removed', async () => {
  const r = await cmd({ cmd: 'mcp.remove', name: 'gh' });
  assert.equal(r.ok, true);
  assert.deepEqual(publicList(store.mcp()), []);
});

console.log('\ninstalling a coding tool:');

await ok('a yes at the computer, then the vendor\'s own npm package — nothing else', async () => {
  answer = false;
  const no = await cmd({ cmd: 'provider.install', provider: 'codex' });
  assert.equal(no.code, 'declined');
  assert.equal(asked.at(-1).kind, 'provider.install');
  assert.equal(asked.at(-1).d.command, 'npm install -g @openai/codex');
  assert.ok(!existsSync(join(base, 'npm.log')), 'npm never ran');
  answer = true;
  const yes = await cmd({ cmd: 'provider.install', provider: 'codex' });
  assert.equal(yes.ok, true, yes.error);
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'npm.log'), 'utf8').trim()), ['install', '-g', '@openai/codex']);
  assert.ok(events.some((e) => e.type === 'notice' && e.code === 'install' && /added 1 package/.test(e.text)));
});

await ok('the record has all of it', () => {
  const kinds = engine.audit.tail(300).map((a) => a.kind);
  for (const k of ['github.clone', 'mcp.add', 'mcp.remove', 'install']) assert.ok(kinds.includes(k), k);
  assert.ok(!JSON.stringify(engine.audit.tail(300)).includes('ghp_secret123'));
});

engine.shutdown();
await new Promise((r) => setTimeout(r, 300));
rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
process.exit(0);
