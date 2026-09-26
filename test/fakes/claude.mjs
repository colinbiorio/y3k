#!/usr/bin/env node
// A stand-in for the `claude` binary, for tests. It replays a recording of the
// real CLI (test/fixtures/code/claude-2.1.283-edit-allow.ndjson) — Read, then an
// Edit that asks permission — with the recording's /tmp/repo turned into its own
// working folder, and it CHECKS what the engine sends back:
//   - answers our control requests the way the real CLI does
//   - waits for the permission answer, applies the edit only if allowed
//   - records argv, env names, cwd and every line it received in $FAKE_CLAUDE_LOG
// FAKE_CLAUDE_SCENARIO=deny makes the recorded Edit be refused.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write('2.1.283 (Claude Code)\n'); process.exit(0); }
if (args[0] === 'auth') { process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }) + '\n'); process.exit(0); }

const LOG = process.env.FAKE_CLAUDE_LOG;
const log = (rec) => { if (LOG) appendFileSync(LOG, JSON.stringify(rec) + '\n'); };
log({ kind: 'spawn', argv: args, envNames: Object.keys(process.env).sort(), cwd: process.cwd() });

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'code', 'claude-2.1.283-edit-allow.ndjson');
const sessionId = args[args.indexOf('--session-id') + 1] || args[args.indexOf('--resume') + 1] || '00000000-0000-4000-8000-000000000009';
const cwdJson = JSON.stringify(process.cwd()).slice(1, -1);
const lines = readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean)
  .map((l) => l.split('/tmp/repo').join(cwdJson).split('00000000-0000-4000-8000-000000000001').join(sessionId));
const ev = lines.map((l) => JSON.parse(l));
const PERM = ev.findIndex((e) => e.type === 'control_request');
const RESULT = ev.findIndex((e) => e.type === 'result');
const CTX = ev.find((e) => e.type === 'control_response' && e.response.request_id === 'ctx-1').response.response;
const USAGE = ev.find((e) => e.type === 'control_response' && e.response.request_id === 'usage-1').response.response;

const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const ok = (request_id, response = {}) => out({ type: 'control_response', response: { subtype: 'success', request_id, response } });
let mode = args.includes('--permission-mode') ? args[args.indexOf('--permission-mode') + 1] : 'default';
let turns = 0;
let waiting = null; // { id, resolve }
let interrupted = false;

async function turn(text) {
  turns++;
  interrupted = false;
  if (turns > 1 && /plan it/.test(text)) return rich();
  if (turns > 1 && /slow/.test(text)) {
    const id = `msg_fake_${turns}`;
    out({ type: 'stream_event', event: { type: 'message_start', message: { id, model: 'claude-haiku-4-5-20251001' } }, parent_tool_use_id: null });
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Working on it' } }, parent_tool_use_id: null });
    return; // until interrupted
  }
  if (turns > 1) {
    const id = `msg_fake_${turns}`;
    out({ type: 'stream_event', event: { type: 'message_start', message: { id, model: 'claude-haiku-4-5-20251001' } }, parent_tool_use_id: null });
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'again: ' } }, parent_tool_use_id: null });
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, 20) } }, parent_tool_use_id: null });
    out({ type: 'assistant', message: { id, content: [{ type: 'text', text: 'again: ' + text.slice(0, 20) }] }, parent_tool_use_id: null });
    out({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, parent_tool_use_id: null });
    out({ type: 'stream_event', event: { type: 'message_stop' }, parent_tool_use_id: null });
    out({ ...ev[RESULT], total_cost_usd: 0.001 });
    return;
  }
  for (let i = 0; i < PERM; i++) {
    const e = ev[i];
    if (e.type === 'user' && e.isReplay) { out({ ...e, message: { role: 'user', content: text } }); continue; }
    if (e.type === 'system' && e.subtype === 'init') { out({ ...e, permissionMode: mode }); continue; }
    out(e);
  }
  const req = ev[PERM];
  out(req);
  const answer = await new Promise((resolve) => { waiting = { id: req.request_id, resolve }; });
  log({ kind: 'permission-answer', answer });
  if (interrupted) return;
  if (answer.behavior === 'allow') {
    const inp = answer.updatedInput;
    const before = readFileSync(inp.file_path, 'utf8');
    writeFileSync(inp.file_path, before.replace(inp.old_string, inp.new_string));
    for (let i = PERM + 1; i <= RESULT; i++) out(ev[i]);
  } else {
    const toolId = req.request.tool_use_id;
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, is_error: true, content: "The user doesn't want to proceed with this tool use. The tool use was rejected." }] }, parent_tool_use_id: null, tool_use_result: 'Error: The user doesn\'t want to proceed with this tool use.' });
    out({ type: 'assistant', message: { id: 'msg_fake_deny', content: [{ type: 'text', text: 'Understood — left it alone.' }] }, parent_tool_use_id: null });
    out({ ...ev[RESULT] });
  }
}

// A turn with the things the recording lacks: a todo list, and a subagent that
// runs a tool of its own and reports back.
function rich() {
  const P = (parent) => ({ parent_tool_use_id: parent, session_id: sessionId });
  const todos = [
    { content: 'Read the code', status: 'completed', activeForm: 'Reading the code' },
    { content: 'Write the tests', status: 'in_progress', activeForm: 'Writing the tests' },
    { content: 'Ship it', status: 'pending', activeForm: 'Shipping it' },
  ];
  out({ type: 'assistant', message: { id: 'msg_rich_1', content: [{ type: 'tool_use', id: 'toolu_todo1', name: 'TodoWrite', input: { todos } }] }, ...P(null) });
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_todo1', content: 'Todos have been modified successfully.' }] }, ...P(null) });
  out({ type: 'assistant', message: { id: 'msg_rich_2', content: [{ type: 'tool_use', id: 'toolu_task1', name: 'Task', input: { description: 'Look for flaky tests', subagent_type: 'Explore', prompt: 'find flaky tests' } }] }, ...P(null) });
  out({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'toolu_task1', description: 'Look for flaky tests', task_type: 'Explore', session_id: sessionId });
  out({ type: 'assistant', message: { id: 'msg_sub_1', content: [{ type: 'tool_use', id: 'toolu_g1', name: 'Grep', input: { pattern: 'flaky' } }] }, ...P('toolu_task1') });
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_g1', content: 'test/a.test.mjs:3: // flaky' }] }, ...P('toolu_task1') });
  out({ type: 'assistant', message: { id: 'msg_sub_2', content: [{ type: 'text', text: 'Found one flaky test.' }] }, ...P('toolu_task1') });
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_task1', content: [{ type: 'text', text: 'One flaky test, in **test/a.test.mjs**.' }] }] }, ...P(null) });
  out({ type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed', summary: 'One flaky test', session_id: sessionId });
  out({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_rich_3', model: 'claude-haiku-4-5-20251001' } }, ...P(null) });
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'All set. ' } }, ...P(null) });
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Here is `the plan`:\n\n- one\n- two' } }, ...P(null) });
  out({ type: 'assistant', message: { id: 'msg_rich_3', content: [{ type: 'text', text: 'All set. Here is `the plan`:\n\n- one\n- two' }] }, ...P(null) });
  out({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, ...P(null) });
  out({ type: 'stream_event', event: { type: 'message_stop' }, ...P(null) });
  out({ ...ev[RESULT], total_cost_usd: 0.061 });
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m;
  try { m = JSON.parse(line); } catch { log({ kind: 'bad-line', line }); return; }
  log({ kind: 'in', msg: m });
  if (m.type === 'user') {
    const c = m.message?.content;
    const text = Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : String(c || '');
    turn(text);
  } else if (m.type === 'control_response') {
    if (waiting && m.response?.request_id === waiting.id) { const w = waiting; waiting = null; w.resolve(m.response.response); }
  } else if (m.type === 'control_request') {
    const r = m.request || {};
    switch (r.subtype) {
      case 'initialize': return ok(m.request_id, { models: [{ value: 'default', displayName: 'Default', description: 'fake', supportedEffortLevels: ['low', 'medium', 'high'] }], account: { subscriptionType: 'max' } });
      case 'get_context_usage': return ok(m.request_id, CTX);
      case 'get_usage': return ok(m.request_id, USAGE);
      case 'set_permission_mode':
        mode = r.mode;
        ok(m.request_id, { mode });
        return out({ type: 'system', subtype: 'status', status: null, permissionMode: mode, session_id: sessionId });
      case 'interrupt':
        interrupted = true;
        if (waiting) { out({ type: 'control_cancel_request', request_id: waiting.id }); waiting.resolve({ behavior: 'deny' }); waiting = null; }
        ok(m.request_id);
        return out({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'aborted', session_id: sessionId, usage: {}, total_cost_usd: 0 });
      default: return ok(m.request_id);
    }
  }
});
rl.on('close', () => process.exit(0));
