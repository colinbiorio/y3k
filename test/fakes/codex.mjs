#!/usr/bin/env node
// A stand-in for `codex app-server` (0.157.1's protocol: one JSON object per
// line, no "jsonrpc" key, notifications carry emittedAtMs). One turn: a
// reasoning summary, a command that asks approval, a file change that asks
// approval (applied only if accepted), a plan, token usage, rate limits, and a
// reply. Everything the engine sends is logged to $FAKE_CODEX_LOG.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.157.1'); process.exit(0); }
const LOG = process.env.FAKE_CODEX_LOG;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify(o) + '\n'); };
log({ kind: 'spawn', argv: args, codexHome: process.env.CODEX_HOME || null, envNames: Object.keys(process.env).sort(), cwd: process.cwd() });

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const note = (method, params) => out({ method, params, emittedAtMs: Date.now() });
let loggedIn = !process.env.FAKE_CODEX_NOAUTH;
let thread = null;
let cwd = process.cwd();
let n = 100;
const waiting = new Map();
const ask = (method, params) => new Promise((resolve) => { const id = n++; waiting.set(id, resolve); out({ id, method, params }); });
let interrupted = false;

async function turn(turnId, input) {
  interrupted = false;
  note('turn/started', { threadId: thread, turn: { id: turnId, status: 'inProgress', items: [] } });
  note('item/started', { threadId: thread, turnId, item: { id: 'r1', type: 'reasoning', summary: [], content: [] } });
  note('item/reasoning/summaryTextDelta', { threadId: thread, turnId, itemId: 'r1', delta: 'Checking the file first.', summaryIndex: 0 });
  note('item/completed', { threadId: thread, turnId, item: { id: 'r1', type: 'reasoning', summary: ['Checking the file first.'], content: [] } });
  if (/slow/.test(input)) { note('item/started', { threadId: thread, turnId, item: { id: 'm0', type: 'agentMessage', text: '' } }); note('item/agentMessage/delta', { threadId: thread, turnId, itemId: 'm0', delta: 'Working' }); return; }
  const cmd = { id: 'c1', type: 'commandExecution', command: 'cat hello.txt', cwd, status: 'inProgress', commandActions: [] };
  note('item/started', { threadId: thread, turnId, item: cmd });
  const d1 = await ask('item/commandExecution/requestApproval', { threadId: thread, turnId, itemId: 'c1', startedAtMs: Date.now(), kind: 'command', environmentId: null, command: 'cat hello.txt', cwd, reason: 'read the file' });
  log({ kind: 'answer', method: 'item/commandExecution/requestApproval', result: d1 });
  if (interrupted) return;
  if (d1.decision === 'accept' || d1.decision === 'acceptForSession') {
    note('item/commandExecution/outputDelta', { threadId: thread, turnId, itemId: 'c1', delta: 'hello\nworld\n' });
    note('item/completed', { threadId: thread, turnId, item: { ...cmd, status: 'completed', exitCode: 0, aggregatedOutput: 'hello\nworld\n' } });
  } else note('item/completed', { threadId: thread, turnId, item: { ...cmd, status: 'declined' } });
  const change = { id: 'f1', type: 'fileChange', status: 'inProgress', changes: [{ path: join(cwd, 'hello.txt'), kind: { type: 'update', move_path: null }, diff: '@@ -1,2 +1,2 @@\n hello\n-world\n+y3k\n' }] };
  note('item/started', { threadId: thread, turnId, item: change });
  const d2 = await ask('item/fileChange/requestApproval', { threadId: thread, turnId, itemId: 'f1', startedAtMs: Date.now(), reason: null, grantRoot: null });
  log({ kind: 'answer', method: 'item/fileChange/requestApproval', result: d2 });
  if (d2.decision === 'accept' || d2.decision === 'acceptForSession') {
    const f = join(cwd, 'hello.txt');
    writeFileSync(f, readFileSync(f, 'utf8').replace('world', 'y3k'));
    note('item/completed', { threadId: thread, turnId, item: { ...change, status: 'completed' } });
  } else note('item/completed', { threadId: thread, turnId, item: { ...change, status: 'declined' } });
  note('turn/plan/updated', { threadId: thread, turnId, explanation: null, plan: [{ step: 'Read hello.txt', status: 'completed' }, { step: 'Change the word', status: 'inProgress' }] });
  note('thread/tokenUsage/updated', { threadId: thread, turnId, tokenUsage: { total: { totalTokens: 5200, inputTokens: 5000, cachedInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 50 }, last: { totalTokens: 5200, inputTokens: 5000, cachedInputTokens: 1000, outputTokens: 200, reasoningOutputTokens: 50 }, modelContextWindow: 400000 } });
  note('account/rateLimits/updated', { rateLimits: { primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: 1790444400 } } });
  note('item/started', { threadId: thread, turnId, item: { id: 'm1', type: 'agentMessage', text: '' } });
  note('item/agentMessage/delta', { threadId: thread, turnId, itemId: 'm1', delta: 'Done — ' });
  note('item/agentMessage/delta', { threadId: thread, turnId, itemId: 'm1', delta: 'changed it.' });
  note('item/completed', { threadId: thread, turnId, item: { id: 'm1', type: 'agentMessage', text: 'Done — changed it.' } });
  note('turn/completed', { threadId: thread, turn: { id: turnId, status: 'completed', items: [], error: null, durationMs: 1234 } });
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  log({ kind: 'in', msg: m });
  if (m.id != null && !m.method) { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.result || {}); } return; }
  if (m.method && m.params === undefined && m.id != null) return out({ id: m.id, error: { code: -32600, message: 'Invalid request: missing field `params`' } });
  const reply = (result) => out({ id: m.id, result });
  switch (m.method) {
    case 'initialize': return reply({ userAgent: 'y3k-code/0.157.1', codexHome: process.env.CODEX_HOME || '~/.codex', platformFamily: 'unix', platformOs: 'linux' });
    case 'initialized': return;
    case 'account/read': return reply({ account: loggedIn ? { type: 'chatgpt', email: 'c@example.com', planType: 'pro' } : null, requiresOpenaiAuth: !loggedIn });
    case 'account/login/start': loggedIn = m.params.type === 'apiKey' && !!m.params.apiKey; return reply({ type: 'apiKey' });
    case 'account/rateLimits/read': return reply({ rateLimits: { primary: { usedPercent: 21, windowDurationMins: 300, resetsAt: 1790444400 }, secondary: { usedPercent: 9, windowDurationMins: 10080, resetsAt: 1790884800 } } });
    case 'model/list': return reply({ data: [{ id: 'gpt-6-astra', displayName: 'GPT-6-Astra', description: 'default', hidden: false, isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }, { reasoningEffort: 'ultra' }] }], nextCursor: null });
    case 'thread/start': case 'thread/resume': case 'thread/fork':
      if (m.params.sandbox === 'danger-full-access') { log({ kind: 'DANGER' }); }
      thread = m.method === 'thread/resume' ? m.params.threadId : '0199a000-0000-7000-8000-00000000c0de';
      cwd = m.params.cwd || cwd;
      return reply({ thread: { id: thread, cwd }, model: m.params.model || 'gpt-6-astra', cwd, approvalPolicy: m.params.approvalPolicy, sandbox: { type: 'readOnly' } });
    case 'turn/start': { const turnId = `t-${n++}`; reply({ turn: { id: turnId, status: 'inProgress', items: [] } }); turn(turnId, m.params.input?.[0]?.text || ''); return; }
    case 'turn/interrupt':
      interrupted = true;
      reply({});
      for (const [id, w] of waiting) { waiting.delete(id); w({ decision: 'cancel' }); }
      return note('turn/completed', { threadId: thread, turn: { id: m.params.turnId, status: 'interrupted', items: [], error: null } });
    default: return out({ id: m.id, error: { code: -32600, message: `Invalid request: unknown variant \`${m.method}\`` } });
  }
});
rl.on('close', () => process.exit(0));
