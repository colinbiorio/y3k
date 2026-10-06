// THE ORB, FOR THE CODER (y3k-code/orb.mjs). Run: node test/code-orb.test.mjs
//
// Every coding session is handed one tool of y3k's own — `orb` — served by the
// engine as a tiny MCP server, so whichever AI is coding can move the orb in
// the chat's own kommand words. These pin: the door lets in only the client
// the engine started (its session's token, no Origin, no page), the tool
// reaches the page and the page's answer reaches the coder, a coder with no
// page open is told so, Claude Code is given the tool and never asked about
// it, and every word the tool teaches is one the page understands.
import assert from 'node:assert';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrb, TOOL, WORDS, ORB_TOOL_ID, KOMMAND_MAX } from '../y3k-code/orb.mjs';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { createPairing } from '../y3k-code/pair.mjs';
import { createHttp, createOrbServer } from '../y3k-code/http.mjs';
import { denyRules } from '../y3k-code/adapters/claude.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';
import { parseKommand } from '../src/tags.mjs';
import { EVENTS as PAGE_EVENTS, COMMANDS as PAGE_COMMANDS } from '../src/code/protocol.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = join(ROOT, 'test', 'fakes', 'claude.mjs');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

console.log('the tool:');

await ok('every word it teaches is a word the page understands', () => {
  for (const c of WORDS.colors) assert.ok(parseKommand(`color/${c}`)?.ok, c);
  for (const p of WORDS.palettes) assert.ok(parseKommand(`color/${p}`)?.ok, p);
  for (const f of WORDS.forms) assert.ok(parseKommand(`form/${f}`)?.ok, f);
  for (const m of WORDS.moods) assert.ok(parseKommand(`mood/${m}`)?.ok, m);
  for (const p of WORDS.paces) assert.ok(parseKommand(`pace/${p}`)?.ok, p);
  for (const r of WORDS.rooms) assert.ok(parseKommand(`background/${r}`)?.ok, r);
  // and every example in its description
  const ex = /Examples: (.+)\n/.exec(TOOL.description)[1].split(' · ');
  assert.ok(ex.length >= 4);
  for (const k of ex) assert.ok(parseKommand(k)?.ok, k);
  assert.ok(parseKommand('size/8')?.ok && parseKommand('form/home')?.ok);
  assert.equal(TOOL.inputSchema.properties.kommand.maxLength, KOMMAND_MAX);
});

await ok('MCP: it introduces itself, lists the one tool, ignores notifications', async () => {
  const orb = createOrb({ emit: () => {}, hasPage: () => true });
  const init = await orb.rpc('s', rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } }));
  assert.equal(init.result.protocolVersion, '2025-03-26', 'the version the client asked for, when known');
  assert.ok(init.result.capabilities.tools);
  assert.equal(init.result.serverInfo.name, 'y3k');
  assert.equal((await orb.rpc('s', rpc('initialize', { protocolVersion: '1999-01-01' }))).result.protocolVersion, '2025-06-18');
  assert.equal(await orb.rpc('s', { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await orb.rpc('s', rpc('tools/list', {}, 2));
  assert.deepEqual(list.result.tools.map((t) => t.name), ['orb']);
  assert.equal((await orb.rpc('s', rpc('resources/list', {}, 3))).error.code, -32601);
  assert.equal((await orb.rpc('s', rpc('tools/call', { name: 'shell', arguments: {} }, 4))).error.code, -32602);
  const batch = await orb.rpc('s', [rpc('ping', null, 5), { jsonrpc: '2.0', method: 'notifications/initialized' }]);
  assert.deepEqual(batch, [{ jsonrpc: '2.0', id: 5, result: {} }]);
});

await ok('a move goes to the page, and the page\'s answer comes back to the coder', async () => {
  const sent = [];
  const orb = createOrb({ emit: (e) => sent.push(e), hasPage: () => true, now: () => 1234 });
  const p = orb.rpc('s1', rpc('tools/call', { name: 'orb', arguments: { kommand: '  color/gold/form/heart\n' } }));
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1);
  assert.deepEqual({ ...sent[0], id: undefined }, { type: 'orb.move', sid: 's1', id: undefined, kommand: 'color/gold/form/heart', at: 1234 });
  assert.equal(orb.done({ id: sent[0].id, ok: true, said: 'color/gold/form/heart' }), true);
  assert.equal(orb.done({ id: sent[0].id, ok: true }), false, 'the first answer wins');
  const r = await p;
  assert.equal(r.result.isError, false);
  assert.match(r.result.content[0].text, /^The orb moved: color\/gold\/form\/heart$/);
  // the page did not understand: the coder hears why, and what to try
  const q = orb.rpc('s1', rpc('tools/call', { name: 'orb', arguments: { kommand: 'form/blob' } }));
  await new Promise((res) => setImmediate(res));
  orb.done({ id: sent[1].id, ok: false, why: 'there is no form called blob — try sphere, heart, ring or knot' });
  const rq = await q;
  assert.equal(rq.result.isError, true);
  assert.match(rq.result.content[0].text, /did not move: there is no form called blob/);
});

await ok('no page open: told at once; a page that never answers: told it was sent', async () => {
  const none = createOrb({ emit: () => { throw new Error('nothing to emit to'); }, hasPage: () => false });
  const r = await none.rpc('s', rpc('tools/call', { name: 'orb', arguments: { kommand: 'mood/calm' } }));
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /No y3k window is open/);
  const quiet = createOrb({ emit: () => {}, hasPage: () => true, answerMs: 30 });
  const q = await quiet.rpc('s', rpc('tools/call', { name: 'orb', arguments: { kommand: 'mood/calm' } }));
  assert.equal(q.result.isError, false);
  assert.match(q.result.content[0].text, /^Sent to the orb: mood\/calm$/);
  assert.equal(quiet.waiting, 0);
  // nothing to say, or too much
  assert.equal((await quiet.rpc('s', rpc('tools/call', { name: 'orb', arguments: { kommand: '  ' } }))).result.isError, true);
  assert.equal((await quiet.rpc('s', rpc('tools/call', { name: 'orb', arguments: { kommand: 'x'.repeat(KOMMAND_MAX + 1) } }))).result.isError, true);
});

console.log('\nthe door:');

const base = mkdtempSync(join(tmpdir(), 'y3k-code-orb-'));
const repo = join(base, 'repo');
const LOG = join(base, 'fake.log');
mkdirSync(repo);
writeFileSync(join(repo, 'a.txt'), 'a\n');
const store = createStore(join(base, 'config'));
store.setConfig({ signIn: true });
let port = 0;
const env = { ...process.env, FAKE_CLAUDE_LOG: LOG };
const engine = createEngine({ store, consent: fixedConsent(true), env, bins: { claude: FAKE }, door: () => (port ? `http://127.0.0.1:${port}` : null) });
const pairing = createPairing({ load: store.tokens, save: store.setTokens });
const http = createHttp({ engine, pairing });
port = await http.listen(0);

function post(path, body, { headers = {}, method = 'POST', to = port } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const h = { host: `127.0.0.1:${to}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers };
    const req = request({ host: '127.0.0.1', port: to, method, path, headers: h }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* none */ } resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const SID = '0123456789abcdef';
const entry = engine.orb.server(SID, `http://127.0.0.1:${port}`);
const auth = { authorization: entry.headers.Authorization };

await ok('only the session\'s own token, never a page, never another session\'s', async () => {
  assert.equal(entry.url, `http://127.0.0.1:${port}/mcp/${SID}`);
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'))).status, 401, 'no token');
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'), { headers: { authorization: 'Bearer nope' } })).status, 401, 'a wrong token');
  const other = engine.orb.server('fedcba9876543210', `http://127.0.0.1:${port}`);
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'), { headers: { authorization: other.headers.Authorization } })).status, 401, 'another session\'s token');
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'), { headers: { ...auth, origin: 'https://yearthreethousand.com' } })).status, 403, 'any page, even the site');
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'), { headers: { ...auth, host: `evil.example:${port}` } })).status, 421, 'DNS rebinding');
  assert.equal((await post(`/mcp/${SID}`, undefined, { method: 'GET', headers: auth })).status, 405, 'no event stream');
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'), { headers: { ...auth, 'content-type': 'text/plain' } })).status, 415);
  const good = await post(`/mcp/${SID}`, rpc('ping', null, 9), { headers: auth });
  assert.equal(good.status, 200);
  assert.deepEqual(good.json, { jsonrpc: '2.0', id: 9, result: {} });
  assert.equal((await post(`/mcp/${SID}`, { jsonrpc: '2.0', method: 'notifications/initialized' }, { headers: auth })).status, 202);
});

await ok('a call through the door reaches a listening page; its orb.done answers it', async () => {
  const un = engine.subscribe(async (e) => {
    if (e.type !== 'orb.move') return;
    assert.equal(e.sid, SID);
    const r = await engine.handle({ cmd: 'orb.done', move: e.id, ok: true, said: 'mood/excited' }, { via: 'test' });
    assert.equal(r.ok, true);
  });
  const r = await post(`/mcp/${SID}`, rpc('tools/call', { name: 'orb', arguments: { kommand: 'mood/excited' } }, 3), { headers: auth });
  un();
  assert.equal(r.status, 200);
  assert.equal(r.json.result.content[0].text, 'The orb moved: mood/excited');
  assert.ok(PAGE_EVENTS.includes('orb.move') && PAGE_COMMANDS.includes('orb.done'), 'the page speaks it too');
});

await ok('the desktop app\'s engine: a door of its own, the orb and nothing else', async () => {
  const d = createOrbServer({ engine });
  const p = await d.listen();
  assert.ok(p > 0 && p !== port);
  assert.equal((await post(`/mcp/${SID}`, rpc('ping', null, 1), { headers: auth, to: p })).status, 200);
  assert.equal((await post('/v1/hello', undefined, { method: 'GET', to: p })).status, 404, 'not the page\'s door');
  assert.equal((await post(`/mcp/${SID}`, rpc('ping'), { headers: { ...auth, host: `localhost.evil:${p}` }, to: p })).status, 421);
  await d.close();
});

console.log('\nthe coders get it:');

await ok('Claude Code is handed the orb with its session\'s token, and is never asked about it', async () => {
  assert.ok(denyRules('/cfg').permissions.allow.includes(ORB_TOOL_ID));
  assert.equal((await engine.handle({ cmd: 'workspace.open', path: repo })).ok, true);
  const r = await engine.handle({ cmd: 'session.start', provider: 'claude', cwd: repo, mode: 'ask' });
  assert.equal(r.ok, true, r.error);
  let spawn = null;
  for (let i = 0; i < 100 && !spawn; i++) { spawn = (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []).find((x) => x.kind === 'spawn'); if (!spawn) await new Promise((res) => setTimeout(res, 50)); }
  assert.ok(spawn, 'claude started');
  const at = spawn.argv.indexOf('--mcp-config');
  assert.ok(at > 0, 'an MCP config is passed');
  const cfg = JSON.parse(readFileSync(spawn.argv[at + 1], 'utf8'));
  const y3k = cfg.mcpServers.y3k;
  assert.equal(y3k.type, 'http');
  assert.equal(y3k.url, `http://127.0.0.1:${port}/mcp/${r.sid}`);
  assert.ok(engine.orb.allowed(r.sid, y3k.headers.Authorization), 'the token in the config is that session\'s');
  const settings = JSON.parse(readFileSync(spawn.argv[spawn.argv.indexOf('--settings') + 1], 'utf8'));
  assert.ok(settings.permissions.allow.includes('mcp__y3k__orb'));
  await engine.handle({ cmd: 'session.stop', sid: r.sid });
  for (let i = 0; i < 100 && engine.orb.allowed(r.sid, y3k.headers.Authorization); i++) await new Promise((res) => setTimeout(res, 50));
  assert.equal(engine.orb.allowed(r.sid, y3k.headers.Authorization), false, 'its token dies with the session');
});

engine.shutdown();
await http.close();
console.log(`\n${passed} checks passed.`);
process.exit(0);
