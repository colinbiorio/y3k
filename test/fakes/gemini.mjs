#!/usr/bin/env node
// A stand-in for `gemini --acp` (0.61.0's ACP: NDJSON JSON-RPC 2.0, agent
// request ids start at 0, a permission needed means NO tool_call before it and
// nothing after a rejection, mode changes arrive as "[MODE_UPDATE] x" text).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('0.61.0'); process.exit(0); }
const LOG = process.env.FAKE_GEMINI_LOG;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify(o) + '\n'); };
log({ kind: 'spawn', argv: args, home: process.env.GEMINI_CLI_HOME || null, hasKey: !!process.env.GEMINI_API_KEY, envNames: Object.keys(process.env).sort(), cwd: process.cwd() });

const out = (o) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...o }) + '\n');
const update = (sessionId, u) => out({ method: 'session/update', params: { sessionId, update: u } });
let next = 0;
const waiting = new Map();
const ask = (method, params) => new Promise((resolve) => { const id = next++; waiting.set(id, resolve); out({ id, method, params }); });
let session = null;
let cwd = process.cwd();
let prompt = null; // { id, cancelled }

async function run(id, text) {
  prompt = { id, cancelled: false };
  const sid = session;
  update(sid, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: '**Planning**\nRead, then edit.' } });
  update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Looking at it.' } });
  if (/slow/.test(text)) return; // until cancelled
  update(sid, { sessionUpdate: 'tool_call', toolCallId: 'read-1', status: 'in_progress', title: 'hello.txt', kind: 'read', content: [], locations: [{ path: join(cwd, 'hello.txt') }] });
  update(sid, { sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'hello\nworld\n' } }] });
  const f = join(cwd, 'hello.txt');
  const old = readFileSync(f, 'utf8');
  const res = await ask('session/request_permission', { sessionId: sid, toolCall: { toolCallId: 'edit-1', status: 'pending', title: 'Edit hello.txt', kind: 'edit', content: [{ type: 'diff', path: f, oldText: old, newText: old.replace('world', 'y3k'), _meta: { kind: 'modify' } }], locations: [{ path: f }] },
    options: [{ optionId: 'proceed_always', name: 'Allow for this session', kind: 'allow_always' }, { optionId: 'proceed_once', name: 'Allow', kind: 'allow_once' }, { optionId: 'cancel', name: 'Reject', kind: 'reject_once' }] });
  log({ kind: 'answer', result: res });
  if (prompt.cancelled) return;
  if (res.outcome?.outcome === 'selected' && res.outcome.optionId !== 'cancel') {
    writeFileSync(f, old.replace('world', 'y3k'));
    update(sid, { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'completed', content: [{ type: 'diff', path: f, oldText: old, newText: old.replace('world', 'y3k'), _meta: { kind: 'modify' } }] });
  }
  update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' Done.' } });
  out({ id, result: { stopReason: 'end_turn', _meta: { quota: { token_count: { input_tokens: 1200, output_tokens: 80 }, model_usage: [] } } } });
  prompt = null;
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  log({ kind: 'in', msg: m });
  if (m.id != null && !m.method) { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.result || {}); } return; }
  const reply = (result) => out({ id: m.id, result });
  switch (m.method) {
    case 'initialize': return reply({ protocolVersion: 1, authMethods: [{ id: 'oauth-personal', name: 'Log in with Google' }, { id: 'gemini-api-key', name: 'Gemini API key' }, { id: 'vertex-ai', name: 'Vertex AI' }], agentInfo: { name: 'gemini-cli', version: '0.61.0' }, agentCapabilities: { loadSession: true, promptCapabilities: { image: true } } });
    case 'authenticate': return reply({});
    case 'session/new': case 'session/load':
      if (!Array.isArray(m.params.mcpServers)) return out({ id: m.id, error: { code: -32603, message: 'Internal error', data: [{ path: ['mcpServers'] }] } });
      session = m.method === 'session/load' ? m.params.sessionId : '6a1b2c3d-0000-4000-8000-0000000000aa';
      cwd = m.params.cwd;
      return reply({ ...(m.method === 'session/new' ? { sessionId: session } : {}), modes: { currentModeId: 'default', availableModes: [{ id: 'default' }, { id: 'autoEdit' }, { id: 'yolo' }, { id: 'plan' }] }, models: { currentModelId: 'gemini-2.5-pro', availableModels: [{ modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }, { modelId: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' }] } });
    case 'session/set_mode':
      if (m.params.modeId === 'yolo') log({ kind: 'YOLO' });
      reply({});
      return update(session, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `[MODE_UPDATE] ${m.params.modeId}` } });
    case 'session/set_model': return reply({});
    case 'session/prompt': return run(m.id, m.params.prompt?.[0]?.text || '');
    case 'session/cancel':
      if (prompt) { prompt.cancelled = true; out({ id: prompt.id, result: { stopReason: 'cancelled' } }); prompt = null; }
      return;
    default: return out({ id: m.id, error: { code: -32601, message: `"Method not found": ${m.method}` } });
  }
});
rl.on('close', () => process.exit(0));
