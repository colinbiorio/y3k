// YOUR ORB ON YOUR OWN CLAUDE LOGIN. Run:  node test/local-claude-code.test.mjs
//
// The bridge is only allowed to exist inside a few lines: founder only, this
// machine only, no tools, and never the site's API key. These prove each line
// against a fake `claude` binary, so nothing here touches the network or a real
// account.
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'y3k-cc-test-'));
const seen = join(dir, 'seen.json');
const fake = join(dir, 'fake-claude.mjs');
// The fake records what it was given, then answers the way `claude -p
// --output-format stream-json --include-partial-messages` does: thinking and
// text deltas on one channel, the whole message again, then a result line.
writeFileSync(fake, `#!/usr/bin/env node
import { writeFileSync, readFileSync } from 'node:fs';
let stdin = '';
process.stdin.on('data', (c) => { stdin += c; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const sys = args.includes('--system-prompt-file') ? readFileSync(args[args.indexOf('--system-prompt-file') + 1], 'utf8') : null;
  writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ args, stdin, sys, cwd: process.cwd(), env: Object.keys(process.env) }));
  const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
  if (stdin.includes('FAIL')) { out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Not logged in' }); process.exit(1); }
  if (stdin.includes('LIMIT')) {
    // How the CLI reports its own trouble: a '<synthetic>' message, then an error result.
    out({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: "You've hit your usage limit" }] } });
    out({ type: 'result', subtype: 'success', is_error: true, terminal_reason: 'api_error', result: "You've hit your usage limit" });
    process.exit(1);
  }
  out({ type: 'system', subtype: 'init', tools: [], mcp_servers: [] });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'SECRET THOUGHT' } } });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '[calm sphere blue slow] Hello ' } } });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'there.' } } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: '[calm sphere blue slow] Hello there.' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, result: '[calm sphere blue slow] Hello there.', usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 5 } });
});
`);
chmodSync(fake, 0o755);

process.env.Y3K_LOCAL_CLAUDE_CODE = '1';
process.env.Y3K_CLAUDE_BIN = fake;
process.env.ANTHROPIC_API_KEY = 'sk-ant-site-key-must-not-leak';
process.env.ELEVENLABS_API_KEY = 'el-must-not-leak';
process.env.CLAUDE_CODE_OAUTH_TOKEN = 'the-persons-own-login';
delete process.env.RENDER;
const cc = await import('../local-claude-code.mjs');

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };
const req = (addr, headers = {}) => ({ socket: { remoteAddress: addr }, headers: { host: 'localhost:5173', ...headers } });
const founder = { id: 'u1', founder: true };
const visitor = { id: 'u2', founder: false };

console.log('who may use it:');

await ok('the founder, on this machine', () => {
  assert.ok(cc.allowed(req('127.0.0.1'), founder));
  assert.ok(cc.allowed(req('::1'), founder));
});
await ok('nobody else, from anywhere', () => {
  assert.equal(cc.allowed(req('127.0.0.1'), visitor), false);
  assert.equal(cc.allowed(req('127.0.0.1'), null), false);
});
await ok('not the founder from another machine, and not through a proxy', () => {
  assert.equal(cc.allowed(req('192.168.1.20'), founder), false);
  assert.equal(cc.allowed(req('127.0.0.1', { 'x-forwarded-for': '8.8.8.8' }), founder), false);
});
await ok('not under another name that points at this machine', () => {
  assert.ok(cc.allowed(req('127.0.0.1', { host: '127.0.0.1:5173' }), founder));
  assert.ok(cc.allowed(req('::1', { host: '[::1]:5173' }), founder));
  assert.equal(cc.allowed(req('127.0.0.1', { host: 'evil.example:5173' }), founder), false);
  assert.equal(cc.allowed(req('127.0.0.1', { host: '' }), founder), false);
});

console.log('what the orb is given:');

const p = cc.provider({ systemFor: (paint, opts) => opts?.system || 'SYSTEM PROMPT', replyFrom: (text) => ({ speech: text.replace(/^\[[^\]]*\]\s*/, '') }) });

await ok('a streamed turn delivers the words and never the thinking', async () => {
  const deltas = [];
  const r = await p.chatStream(null, 'x', [
    { role: 'user', content: 'hi orb' },
    { role: 'assistant', content: '[calm] hello' },
    { role: 'user', content: 'how are you?' },
  ], (t) => deltas.push(t), null, false, undefined, { system: 'ORB SYSTEM' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(deltas.join(''), '[calm sphere blue slow] Hello there.', 'exactly the text, once');
  assert.ok(!deltas.join('').includes('SECRET'), 'thinking is never spoken');
  assert.deepEqual(r.usage, { in: 900, out: 40, cacheRead: 5, cacheWrite: 0 });
});

const s = JSON.parse(readFileSync(seen, 'utf8'));

await ok('no tools, no MCP, no settings, no saved session', () => {
  const at = (f) => s.args.indexOf(f);
  assert.equal(s.args[at('--tools') + 1], '', '--tools ""');
  for (const f of ['-p', '--restricted', '--strict-mcp-config', '--safe-mode', '--no-session-persistence', '--disable-slash-commands']) assert.ok(at(f) >= 0, f);
  assert.equal(s.args[at('--output-format') + 1], 'stream-json');
});
await ok('the site prompt replaces Claude Code\'s, and travels by file, not argv', () => {
  assert.ok(s.sys.startsWith('ORB SYSTEM'), 'the site prompt comes first');
  assert.match(s.sys, /no tools here/, 'and the orb is told what the CLI\'s own notes are');
  assert.ok(!s.args.includes('ORB SYSTEM'));
});
await ok('the conversation arrives as a transcript, newest message last', () => {
  assert.ok(s.stdin.includes('Them: hi orb') && s.stdin.includes('You: [calm] hello'));
  assert.ok(s.stdin.trimEnd().endsWith('how are you?'));
});
await ok('a message starting with "/" is never read as a Claude Code command', () => {
  const prompt = cc._test.toPrompt([{ role: 'user', content: '/help me' }], null);
  assert.ok(!prompt.startsWith('/'), prompt);
});
await ok('the site\'s keys never reach the child; the person\'s own login does', () => {
  assert.ok(!s.env.includes('ANTHROPIC_API_KEY'), 'a leaked API key would silently bill the site');
  assert.ok(!s.env.includes('ELEVENLABS_API_KEY'));
  assert.ok(s.env.includes('CLAUDE_CODE_OAUTH_TOKEN'));
});
await ok('routing and parent-session variables are dropped', () => {
  process.env.CLAUDE_CODE_USE_BEDROCK = '1'; process.env.CLAUDECODE = '1'; process.env.ANTHROPIC_BASE_URL = 'https://elsewhere';
  process.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN = 'mine';
  const env = cc._test.childEnv();
  for (const k of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDECODE', 'ANTHROPIC_BASE_URL']) assert.ok(!(k in env), k);
  assert.equal(env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN, 'mine');
  for (const k of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDECODE', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN']) delete process.env[k];
});
await ok('it runs in an empty private directory', () => {
  assert.ok(s.cwd.includes('y3k-claude-code-'), s.cwd);
});

console.log('when it goes wrong:');

await ok('a failed login comes back as a clean refusal, not a crash', async () => {
  const r = await p.chat(null, 'x', [{ role: 'user', content: 'FAIL please' }], null, false, {});
  assert.equal(r.ok, false);
  assert.match(r.detail, /Not logged in/);
});
await ok('the CLI\'s own notices are never spoken as the orb', async () => {
  const deltas = [];
  const r = await p.chatStream(null, 'x', [{ role: 'user', content: 'LIMIT' }], (t) => deltas.push(t), null, false, undefined, {});
  assert.equal(r.ok, false);
  assert.equal(deltas.join(''), '', 'nothing reached the listener');
  assert.match(r.detail, /usage limit/);
});
await ok('a missing binary says so', async () => {
  const saved = process.env.Y3K_CLAUDE_BIN;
  process.env.Y3K_CLAUDE_BIN = join(dir, 'no-such-claude');
  const fresh = await import('../local-claude-code.mjs?missing'); // re-reads the env
  process.env.Y3K_CLAUDE_BIN = saved;
  const q = fresh.provider({ systemFor: () => 'S', replyFrom: (t) => ({ speech: t }) });
  const r = await q.chat(null, 'x', [{ role: 'user', content: 'hi' }], null, false, {});
  assert.equal(r.ok, false);
  assert.equal(r.status, 'not-installed');
});
await ok('an aborted turn stops', async () => {
  const ac = new AbortController();
  ac.abort();
  const r = await p.chatStream(null, 'x', [{ role: 'user', content: 'hi' }], () => {}, null, false, ac.signal, {});
  assert.equal(r.ok, false);
  assert.equal(r.status, 'aborted');
});
await ok('a camera frame is admitted to, not pretended', () => {
  const prompt = cc._test.toPrompt([{ role: 'user', content: 'look at me' }], 'base64data');
  assert.ok(/cannot see it/.test(prompt));
});

console.log('\nthe presence\'s life on it (server.mjs lifeBrain, 2026-10-07):');

const SERVER = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const fnSrc = (name) => SERVER.slice(SERVER.indexOf(`function ${name}(`), SERVER.indexOf('\n}\n', SERVER.indexOf(`function ${name}(`)) + 3);
const lifeSrc = fnSrc('lifeBrain');
// the founder's own brain, wherever they are: this machine, or their page through y3kode (own-relay.mjs)
const ownSrc = fnSrc('ownFor');

await ok('who pays for a life: the owner\'s key first, then the founder\'s own subscription — never the site\'s key', () => {
  const allowedFor = new Set();
  const pageOpen = new Set();
  const life = new Function('BRAIN_PROVIDERS', 'detectProvider', 'localClaudeCode', 'LOCAL_CC', 'ownRelay', 'OWN_PROMPTS', 'OWN_MODEL', `${ownSrc}\n${lifeSrc}\nreturn lifeBrain;`)(
    { anthropic: { defaultModel: () => 'claude-x' } }, (k) => (k.startsWith('sk-ant-') ? 'anthropic' : null),
    { allowed: (r, user) => allowedFor.has(user?.id), LEDGER_MODEL: 'claude-code' }, { local: true },
    { connected: (user) => pageOpen.has(user?.id), provider: (user) => ({ relayFor: user.id }) }, {}, 'own:claude-code');
  assert.equal(life({}, founder, {}), null, 'nothing to pay with: the caller says "add a key"');
  pageOpen.add(founder.id);
  const relayed = life({}, founder, {});
  assert.ok(relayed.pid === 'own' && relayed.p.relayFor === founder.id && relayed.key === null && relayed.model === 'own:claude-code', 'on the hosted site: through their own page and y3kode');
  allowedFor.add(founder.id);
  const own = life({}, founder, {});
  assert.equal(own.pid, 'claude-code', 'on their own machine, the site\'s own Claude Code first');
  assert.ok(own.p.local && own.key === null && own.model === 'claude-code');
  assert.equal(life({}, founder, { key: 'sk-ant-mine' }).pid, 'anthropic', 'a key of their own is used first');
  assert.equal(life({}, visitor, {}), null, 'anyone else: no subscription');
  assert.deepEqual(life({}, founder, { key: 'what-is-this' }), { error: 'unrecognized key' });
  assert.ok(!/API_KEY|house\./.test(lifeSrc), 'the site key is nowhere in it');
});

await ok('chess, matches and the autonomous beats use it; the mine still digs only on a key', () => {
  const route = (from, to) => SERVER.slice(SERVER.indexOf(from), SERVER.indexOf(to, SERVER.indexOf(from)));
  assert.match(route("reqPath === '/api/chess/think'", '// ===== PHRASZLE'), /const own = lifeBrain\(req, user, b\);[\s\S]*own\.p\.chat\(own\.key/);
  assert.match(SERVER, /const own = lifeBrain\(req, user, b\);\n        if \(!own\) return json\(200, \{ available: false, reason: 'byok', error: 'your presence thinks on your own key/);
  const mine = route("reqPath === '/api/phraszle/chat'", "reqPath === '/api/phraszle/guess'") + route("reqPath === '/api/phraszle/guess'", 'const spend = ');
  assert.ok(mine.length > 500 && !/lifeBrain|localClaudeCode|LOCAL_CC/.test(mine), 'the mine\'s attempts are paid work: a key, always');
  assert.match(SERVER, /if \(tendMode && !\(key && typeof key === 'string'\) && !ownFor\(req, user\)\)/, 'tend: a key, or the founder\'s own subscription');
  assert.match(SERVER, /const out = tendMode\n            \? await own\.p\.chat\(null, own\.model, tendMessages, image, paint, o\)/, 'a beat as on a key: fenced messages, no rescue retry');
});

await ok('a life on the subscription still draws its budget at API prices; the person\'s ledger is charged nothing', () => {
  assert.match(SERVER, /const OWN_PID = new Set\(\['claude-code', 'own'\]\);/);
  assert.match(SERVER, /const ledgerCost = \(pid, model, usage\) => \(OWN_PID\.has\(pid\) \? 0 : posts\.estimateCost\(model, usage\.in, usage\.out\)\);/);
  // the match think: the budget at the estimate, whoever pays; the ledger at what was paid
  assert.match(SERVER, /posts\.recordSpend\(pres\.id, Math\.max\(cost, 0\.0002\)\);\n              apiUsage\.record\(user\.id, \{ provider: pid2, model: useModel, inTok: out\.usage\.in, outTok: out\.usage\.out, cost: ledgerCost\(pid2, useModel, out\.usage\) \}\);/);
  // tend: finish() draws the budget at the price of the model that ran, for every brain
  assert.match(SERVER, /posts\.recordSpend\(presence\.id, Math\.max\(posts\.estimateCost\(meteredModel, inTok, outTok\), 0\.0002\)\);/);
  assert.match(SERVER, /ownBrain: !!ownFor\(req, sessionUser\(req\)\)/, 'the page is told, for this session only');
});

console.log(`\n${passed} passed`);
