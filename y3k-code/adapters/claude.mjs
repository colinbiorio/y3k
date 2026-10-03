// Claude Code, driven through the UNMODIFIED `claude` binary — not the Agent SDK —
// in its long-lived streaming mode, answering its permission prompts from the
// y3k Code screen.
//
// Why the binary and not the SDK: the binary is the Claude Code the person
// installed and signed into. y3kode drives it as it is — on their own `claude`
// login, the default — or, only if they chose one on this machine, on an API
// key of theirs. Never set from the page (CODE.md).
//
// The protocol (verified against claude 2.1.283, fixture in
// test/fixtures/code/claude-2.1.283-edit-allow.ndjson):
//   stdin:  {"type":"user","message":{role,content},"parent_tool_use_id":null}
//           {"type":"control_request","request_id","request":{"subtype":…}}
//           {"type":"control_response","response":{"subtype":"success","request_id","response":…}}
//   stdout: system/init, stream_event (partial deltas), assistant (one content
//           block per event), user (tool_result + tool_use_result), result,
//           rate_limit_event, control_request (can_use_tool, …), control_response.
//
// The person's own configuration applies — their CLAUDE.md, memory, hooks and
// connectors — so none of --safe-mode, --bare, --restricted, --strict-mcp-config
// or --tools is ever passed, and neither is anything that skips permissions.

import { randomUUID } from 'node:crypto';
import { resolve as resolvePath, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnChild, stopChild, childEnv, ndjson, resolveBin, run, tempFile } from '../proc.mjs';
import { editPreview, writePreview, fromStructuredPatch, countChanges, parseUnified } from '../diff.mjs';
import { toolKind, riskOf, resultText, capOutput, toolTitle } from './base.mjs';
import { ORB_TOOL_ID } from '../orb.mjs';

// y3k's generic modes → Claude Code's. ('default' is what the control channel
// calls the mode that asks; newer CLIs name it 'manual' on the command line.)
const MODE_TO_CLAUDE = { ask: 'default', plan: 'plan', acceptEdits: 'acceptEdits', auto: 'auto' };
const CLAUDE_TO_MODE = { default: 'ask', manual: 'ask', plan: 'plan', acceptEdits: 'acceptEdits', auto: 'auto', dontAsk: 'ask' };

export const CAPS = Object.freeze({
  modes: ['ask', 'plan', 'acceptEdits', 'auto'], permissionPrompts: true, questions: true, planApproval: true,
  todos: true, subagents: true, diffs: true, contextUsage: true, limits: true, cost: true, mcpLive: true,
  resume: true, fork: true, models: true, effort: true, images: true,
});

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Never sent, whatever a caller asks for. Checked by test/code-claude.test.mjs.
export const FORBIDDEN_ARGS = ['--safe-mode', '--bare', '--restricted', '--strict-mcp-config', '--tools', '--setting-sources',
  '--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', 'bypassPermissions'];

export async function detect({ override, env } = {}) {
  const bin = resolveBin('claude', { override, env });
  if (!bin) return { installed: false };
  const v = await run(bin, ['--version'], { timeout: 10000 });
  return { installed: v.code === 0, bin, version: (v.stdout.match(/\d+\.\d+\.\d+/) || [null])[0] };
}

export async function authStatus(bin, env) {
  const r = await run(bin, ['auth', 'status', '--json'], { env, timeout: 15000 });
  try {
    const j = JSON.parse(r.stdout);
    return { state: j.loggedIn || j.authenticated ? 'signed-in' : 'signed-out', method: j.authMethod || j.method || null, account: j.email || j.account || null, raw: j };
  } catch { return { state: 'unknown', method: null }; } // an older CLI without `auth status` says nothing either way
}

// The folders every session is kept out of, whatever mode: keys, cloud
// credentials, and y3k Code's own settings.
export function denyRules(configDir) {
  const home = homedir();
  const dirs = ['.ssh', '.aws', '.gnupg', '.config/gcloud', '.kube', '.docker'].map((d) => join(home, d));
  if (configDir) dirs.push(configDir);
  const rules = [];
  for (const d of dirs) for (const t of ['Read', 'Edit', 'Write']) rules.push(`${t}(${d}/**)`);
  // y3k's own tool, the orb (orb.mjs), is never asked about: it moves the orb
  // beside the chat and touches nothing on the computer
  return { permissions: { deny: rules, allow: [ORB_TOOL_ID] } };
}

// Values that reach the command line come from the page, so each must look like
// what it claims to be — above all, never like a flag.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,119}$/;
export const isSessionId = (s) => typeof s === 'string' && SESSION_ID.test(s);
export const isModel = (s) => typeof s === 'string' && MODEL.test(s);

// EXTRAS a Claude Code version may not have. Each makes the screen richer —
// live text as it is written, the person's own message echoed back, a
// subagent's words as it works, a named session, a thinking level — and none is
// needed for a session to run. Versions differ (a person's install is rarely
// the one this was built against, and some of these are hidden from --help, so
// asking --help cannot tell), so an extra the binary rejects at startup is
// dropped and the session is started again without it (see start() below).
const UNSUPPORTED = new Map();   // bin path → Set of extras it rejected
export const OPTIONAL_FLAGS = ['--include-partial-messages', '--replay-user-messages', '--forward-subagent-text', '-n', '--effort'];

export function buildArgs({ mode, model, effort, name, sessionId, resumeId, fork, mcpConfigPath, settingsPath, skip = null } = {}) {
  if (model != null && !isModel(model)) throw new Error('bad model name');
  if (resumeId != null && !isSessionId(resumeId)) throw new Error('bad session id');
  if (sessionId != null && !isSessionId(sessionId)) throw new Error('bad session id');
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-prompt-tool', 'stdio', '--replay-user-messages', '--forward-subagent-text'];
  const m = MODE_TO_CLAUDE[mode];
  if (m && m !== 'default') args.push('--permission-mode', m);
  if (model) args.push('--model', model);
  if (effort && EFFORTS.includes(effort)) args.push('--effort', effort);
  if (name) args.push('-n', name.replace(/^-+/, ''));
  if (resumeId) {
    args.push('--resume', resumeId);
    if (fork) args.push('--fork-session', '--session-id', sessionId || randomUUID());
  } else {
    args.push('--session-id', sessionId || randomUUID());
  }
  if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
  if (settingsPath) args.push('--settings', settingsPath);
  for (const a of args) if (FORBIDDEN_ARGS.some((f) => a === f || a.startsWith(f + '='))) throw new Error(`refusing to pass ${a}`);
  if (!skip || !skip.size) return args;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (!skip.has(args[i])) { out.push(args[i]); continue; }
    if (args[i] === '-n' || args[i] === '--effort') i++;   // its value goes with it
  }
  return out;
}

// Build the env for the child. Their own login (the default): an API key in the
// environment would silently win over it and bill that key instead, so it is
// removed. A key they chose here: that key, from the engine's store. Never
// another provider's key.
export function claudeEnv(base, { auth, apiKey } = {}) {
  const OTHER = /^(OPENAI_API_KEY|CODEX_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|XAI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|DASHSCOPE_API_KEY|ZHIPU_API_KEY)$/;
  const drop = auth === 'subscription' ? ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] : [];
  const env = childEnv(base, { drop, dropPattern: OTHER });
  if (auth !== 'subscription' && apiKey) env.ANTHROPIC_API_KEY = apiKey;
  return env;
}

// SIGNED OUT MID-SESSION. Claude Code keeps its sign-in on the computer, and it
// can lapse — an OAuth token that expired and would not refresh. Then every
// turn fails the same way: ten "Retrying: authentication_failed" lines and a
// raw "API Error: 401 OAuth access token has expired". Retrying cannot fix it
// and a status code tells nobody what to do, so it is said once, in words,
// with the fix — which is Claude Code's own, on the computer.
export const AUTH_FAIL = /authentication_failed|\bAPI Error: 401\b|OAuth (?:access )?token|invalid (?:x-)?api[ -]?key|please run \/login|re-?authenticate/i;
export const SIGNED_OUT_TEXT = 'Claude Code\'s sign-in on this computer has expired, so your message never reached Claude. To fix it: open Terminal, type claude and press Return, then type /login and sign in. Then send your message again here.';

// THE PLAN'S WINDOWS, AS CLAUDE CODE ITSELF SHOWS THEM. get_usage's
// rate_limits carries the 5-hour and weekly windows, a weekly window for each
// model the server names (model_scoped, with the server's own label), and,
// beside them, windows kept under the server's internal code names. Those were
// drawn as they came: Colin's plan panel grew a row called "iguana necktie",
// at 0%, resetting in 33 days. Claude Code's own /usage leaves them out — they
// have no name a person would know — so they are left out here too: only the
// windows it names itself, and the server's labelled ones.
const NAMED_WINDOWS = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'];
export function planWindows(rl) {
  if (!rl || typeof rl !== 'object') return [];
  const rows = [];
  for (const kind of NAMED_WINDOWS) {
    const w = rl[kind];
    if (w && typeof w === 'object' && typeof w.utilization === 'number') rows.push({ kind, utilization: w.utilization, resetsAt: w.resets_at || null });
  }
  for (const m of Array.isArray(rl.model_scoped) ? rl.model_scoped : []) {
    const label = String(m?.display_name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
    if (!label || typeof m.utilization !== 'number') continue;
    // a model already among the named windows (seven_day_opus) is not drawn twice
    if (rows.some((w) => w.kind.slice(10).toLowerCase() === label.toLowerCase())) continue;
    rows.push({ kind: 'seven_day_model', label, utilization: m.utilization, resetsAt: m.resets_at || null });
  }
  return rows;
}

export function createClaudeAdapter({ sid, cwd, emit, audit, bin, env, tmpDir, configDir, opts = {} }) {
  if (opts.resumeId && !isSessionId(opts.resumeId)) throw new Error('bad session id');
  const sessionId = opts.fork || !opts.resumeId ? randomUUID() : opts.resumeId;
  let mode = opts.mode || 'ask';
  let model = opts.model || null;
  let effort = opts.effort || null;
  let child = null;
  let state = 'idle';
  let ended = false;
  let stopping = false;
  let reqNo = 0;
  const pendingOurs = new Map();   // our control requests → resolver
  const pendingTheirs = new Map(); // CLI's permission/question/plan requests → {tool, input, kind, callId}
  const calls = new Map();         // tool_use_id → {name, input, kind, parentCallId, preview}
  const streaming = new Map();     // parent call id ('' for the main agent) → message id streaming now
  let turnNo = 0;
  let signedOutSaid = false;   // said once per failing stretch; a good turn resets it
  // THE PLAN'S METER, KEPT CURRENT. Claude Code reports the 5-hour and weekly
  // windows of its own accord only now and then (a rate_limit_event), so the
  // bars sat on whatever it said last while the plan moved on — a turn here, a
  // chat on claude.ai, another session (Colin: "why does it still say 92% if it
  // went up to 93%"). So they are asked for: once the session is up, after
  // every turn, and every few minutes while it is open — at most once in ten
  // seconds, since each ask is one small request to Anthropic.
  let limitsTimer = null, limitsAt = 0;
  const freshLimits = () => {
    if (ended || Date.now() - limitsAt < 10000) return;
    limitsAt = Date.now();
    limits().catch(() => { /* the bars keep their last numbers */ });
  };
  const signedOut = () => { if (signedOutSaid) return; signedOutSaid = true; emit({ type: 'notice', level: 'error', code: 'signed-out', text: SIGNED_OUT_TEXT }); };
  let files = [];                  // temp files to remove at the end
  const changed = new Set();
  const agentsSeen = new Set();    // subagent ids already announced
  // The CLI sends each finished block as its own `assistant` event, so a block's
  // place in its message comes from the stream (content_block_start order),
  // falling back to a count when there was no stream.
  const blockOrder = new Map();    // message id → { starts: [index…], next }
  const partial = new Map();       // 'id:block' → streamed text not yet finished
  const taskAlias = new Map();     // the CLI's task id → the Task call's id

  const setState = (s) => { if (s !== state) { state = s; emit({ type: 'session.state', state: s }); } };

  // What was written to a process that has not said a word yet: if it turns
  // out to be one that refuses an extra at startup (start(), below), the next
  // one is handed the same words — the first message is never lost to a retry.
  let early = [];
  let heardFromChild = false;
  function write(obj) {
    if (!child || child.stdin.destroyed) return false;
    if (!heardFromChild) early.push(obj);
    try { child.stdin.write(JSON.stringify(obj) + '\n'); return true; } catch { return false; }
  }

  function control(request, timeoutMs = 15000) {
    const request_id = `y3k-${++reqNo}`;
    return new Promise((resolve) => {
      const t = setTimeout(() => { pendingOurs.delete(request_id); resolve({ ok: false, error: 'timeout' }); }, timeoutMs);
      t.unref?.();
      pendingOurs.set(request_id, (r) => { clearTimeout(t); resolve(r); });
      if (!write({ type: 'control_request', request_id, request })) { clearTimeout(t); pendingOurs.delete(request_id); resolve({ ok: false, error: 'not running' }); }
    });
  }

  function reply(request_id, response) {
    write({ type: 'control_response', response: { subtype: 'success', request_id, response } });
  }

  // --- the preview shown on a permission card, computed BEFORE asking ---------
  function previewFor(name, input = {}) {
    const kind = toolKind(name);
    const abs = (p) => (p ? (isAbsolute(p) ? p : resolvePath(cwd, p)) : p);
    try {
      if (name === 'Edit') {
        const d = editPreview(abs(input.file_path), input.old_string, input.new_string, !!input.replace_all);
        return { path: input.file_path, diff: d ? [d] : null };
      }
      if (name === 'MultiEdit') {
        return { path: input.file_path, diff: null, edits: (input.edits || []).length };
      }
      if (name === 'Write') return { path: input.file_path, diff: [writePreview(abs(input.file_path), input.content)] };
      if (kind === 'bash') return { command: input.command, cwd, description: input.description || null, background: !!input.run_in_background };
      if (kind === 'web') return { url: input.url || null, query: input.query || null };
      if (kind === 'search') return { pattern: input.pattern || input.query || null, path: input.path || null };
      if (kind === 'read') return { path: input.file_path || input.path };
    } catch { /* a preview that cannot be computed is simply absent */ }
    return {};
  }

  // --- stdout ----------------------------------------------------------------
  function onEvent(e) {
    const t = e?.type;
    if (t === 'system') return onSystem(e);
    if (t === 'stream_event') return onStream(e);
    if (t === 'assistant') return onAssistant(e);
    if (t === 'user') return onUser(e);
    if (t === 'result') return onResult(e);
    if (t === 'rate_limit_event') return onRateLimit(e.rate_limit_info || e);
    if (t === 'control_request') return onControlRequest(e);
    if (t === 'control_response') {
      const r = e.response || {};
      const fn = pendingOurs.get(r.request_id);
      if (fn) { pendingOurs.delete(r.request_id); fn(r.subtype === 'success' ? { ok: true, response: r.response } : { ok: false, error: r.error || 'error' }); }
      return; // otherwise: the echo of one of our own replies
    }
    if (t === 'control_cancel_request') {
      const id = e.request_id;
      if (pendingTheirs.has(id)) { pendingTheirs.delete(id); emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' }); }
    }
  }

  function onSystem(e) {
    switch (e.subtype) {
      case 'init':
        mode = CLAUDE_TO_MODE[e.permissionMode] || mode;
        model = e.model || model;
        emit({ type: 'session.ready', providerSessionId: e.session_id || sessionId, tools: e.tools || [], mcp: e.mcp_servers || [], model: e.model, mode, cwd: e.cwd, version: e.claude_code_version, auth: e.apiKeySource || null });
        emit({ type: 'mcp.status', servers: (e.mcp_servers || []).map((s) => ({ name: s.name, status: s.status, source: s.source || null })) });
        return;
      case 'status':
        if (e.permissionMode) { const m = CLAUDE_TO_MODE[e.permissionMode] || mode; if (m !== mode) { mode = m; emit({ type: 'mode.changed', mode }); } }
        return;
      case 'compact_boundary':
        emit({ type: 'compact', trigger: e.compact_metadata?.trigger || null, preTokens: e.compact_metadata?.pre_tokens || null });
        return;
      case 'api_retry':
        if (AUTH_FAIL.test(String(e.error || ''))) { signedOut(); return; }   // retrying will not sign anyone in
        emit({ type: 'notice', level: 'info', code: 'retry', text: `Retrying (${e.attempt || '?'}${e.max_retries ? '/' + e.max_retries : ''})${e.error ? ': ' + String(e.error).slice(0, 120) : ''}` });
        return;
      // One subagent, two announcements: the Task tool call, and the CLI's own
      // task events. The tool call's id is the one the screen nests under.
      case 'task_started': {
        const tid = e.tool_use_id || e.task_id;
        taskAlias.set(e.task_id, tid);
        if (!agentsSeen.has(tid)) { agentsSeen.add(tid); emit({ type: 'subagent.started', taskId: tid, callId: e.tool_use_id || null, description: e.description || '', agentType: e.task_type || null }); }
        return;
      }
      case 'task_progress':
        emit({ type: 'subagent.progress', taskId: taskAlias.get(e.task_id) || e.task_id, text: String(e.description || e.summary || '').slice(0, 300) });
        return;
      case 'task_notification':
        emit({ type: 'subagent.ended', taskId: taskAlias.get(e.task_id) || e.task_id, status: e.status || 'completed', summary: String(e.summary || '').slice(0, 500) });
        return;
      default:
        return;
    }
  }

  // Subagents stream alongside the main agent (--forward-subagent-text), so the
  // message being streamed is tracked per parent.
  function onStream(e) {
    const ev = e.event || {};
    const parentCallId = e.parent_tool_use_id || null;
    const key = parentCallId || '';
    const id = streaming.get(key);
    if (ev.type === 'message_start') {
      const mid = ev.message?.id || `m-${Date.now()}`;
      streaming.set(key, mid);
      emit({ type: 'message.start', id: mid, model: ev.message?.model || model, parentCallId });
    } else if (ev.type === 'content_block_start' && id) {
      const bo = blockOrder.get(id) || { starts: [], next: 0 };
      bo.starts.push(ev.index | 0);
      blockOrder.set(id, bo);
      // The thinking itself may be withheld; the screen still shows that it is happening.
      if (ev.content_block?.type === 'thinking') emit({ type: 'message.delta', id, block: ev.index | 0, kind: 'thinking', text: ev.content_block.thinking || '' });
    } else if (ev.type === 'content_block_delta' && id) {
      const d = ev.delta || {};
      const kind = d.type === 'text_delta' ? 'text' : d.type === 'thinking_delta' ? 'thinking' : null;
      const text = kind === 'text' ? d.text : kind === 'thinking' ? d.thinking : '';
      if (kind && text) {
        const key = `${id}:${ev.index | 0}`;
        const p = partial.get(key) || { id, block: ev.index | 0, kind, text: '', parentCallId };
        p.text += text;
        partial.set(key, p);
        emit({ type: 'message.delta', id, block: ev.index | 0, kind, text });
      }
    } else if (ev.type === 'message_delta' && id) {
      if (ev.delta?.stop_reason) emit({ type: 'message.end', id, stopReason: ev.delta.stop_reason, usage: ev.usage || null });
    } else if (ev.type === 'message_stop') {
      streaming.delete(key);
    }
  }

  function onAssistant(e) {
    const msg = e.message || {};
    // Claude Code reports an API failure as a message of its own (model
    // '<synthetic>'); a sign-in failure is said in words instead
    if (msg.model === '<synthetic>' || e.error || e.isApiErrorMessage) {
      const said = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
      if (e.error === 'authentication_failed' || AUTH_FAIL.test(said)) { signedOut(); return; }
    }
    const parentCallId = e.parent_tool_use_id || null;
    const bo = blockOrder.get(msg.id) || { starts: [], next: 0, count: 0 };
    blockOrder.set(msg.id, bo);
    for (const b of msg.content || []) {
      const i = bo.next < bo.starts.length ? bo.starts[bo.next++] : (bo.count = (bo.count || bo.starts.length) + 1) - 1;
      partial.delete(`${msg.id}:${i}`);
      if (b.type === 'text') emit({ type: 'message.block', id: msg.id, block: i, kind: 'text', text: b.text, parentCallId });
      else if (b.type === 'thinking') emit({ type: 'message.block', id: msg.id, block: i, kind: 'thinking', text: b.thinking || '', parentCallId });
      else if (b.type === 'tool_use') {
        const kind = toolKind(b.name);
        const preview = previewFor(b.name, b.input);
        calls.set(b.id, { name: b.name, input: b.input, kind, parentCallId, preview });
        emit({ type: 'tool.call', callId: b.id, messageId: msg.id, parentCallId, name: b.name, kind, title: toolTitle(b.name, b.input), input: b.input, preview });
        audit?.write('tool.call', { sid, tool: b.name, input: b.input });
        if (b.name === 'TodoWrite' && Array.isArray(b.input?.todos)) {
          emit({ type: 'todo.update', items: b.input.todos.map((x) => ({ text: x.content, status: x.status, activeForm: x.activeForm || null })) });
        }
        if (kind === 'task' && !agentsSeen.has(b.id)) { agentsSeen.add(b.id); emit({ type: 'subagent.started', taskId: b.id, callId: b.id, description: b.input?.description || '', agentType: b.input?.subagent_type || null }); }
      }
    }
  }

  function onUser(e) {
    if (e.isReplay) return; // our own message, echoed back
    const blocks = Array.isArray(e.message?.content) ? e.message.content : [];
    const tur = e.tool_use_result;
    for (const b of blocks) {
      if (b.type !== 'tool_result') continue;
      const call = calls.get(b.tool_use_id) || {};
      const text = resultText(b.content);
      let diff = null;
      if (tur && typeof tur === 'object') {
        if (Array.isArray(tur.structuredPatch) && tur.structuredPatch.length) {
          const hunks = fromStructuredPatch(tur.structuredPatch);
          diff = [{ path: tur.filePath || call.input?.file_path, hunks, ...countChanges(hunks), created: tur.type === 'create' }];
        } else if (tur.gitDiff?.patch) {
          diff = parseUnified(`diff --git a/x b/${tur.gitDiff.filename}\n${tur.gitDiff.patch}`);
        }
      }
      if (diff) for (const d of diff) if (d.path) changed.add(d.path);
      const status = b.is_error ? (/denied|rejected|permission/i.test(text) ? 'denied' : 'error') : 'ok';
      emit({
        type: 'tool.result', callId: b.tool_use_id, status, output: capOutput(text), diff,
        exitCode: typeof tur?.exitCode === 'number' ? tur.exitCode : (tur?.interrupted ? 130 : null),
      });
      if (call.kind === 'task') emit({ type: 'subagent.ended', taskId: b.tool_use_id, status: status === 'ok' ? 'completed' : status, summary: text.slice(0, 500) });
    }
    if (changed.size) emit({ type: 'files.changed', paths: [...changed].slice(-50) });
  }

  // Text streamed but never finished (the turn was stopped) is written down as a
  // finished block, so the session reads the same after a reload.
  function settlePartial() {
    for (const p of partial.values()) emit({ type: 'message.block', id: p.id, block: p.block, kind: p.kind, text: p.text, parentCallId: p.parentCallId });
    partial.clear();
    blockOrder.clear();
  }

  function onResult(e) {
    settlePartial();
    const u = e.usage || {};
    const mu = e.modelUsage && typeof e.modelUsage === 'object' ? Object.entries(e.modelUsage)[0] : null;
    emit({ type: 'usage.turn', inputTokens: u.input_tokens | 0, outputTokens: u.output_tokens | 0, cacheRead: u.cache_read_input_tokens | 0, cacheWrite: u.cache_creation_input_tokens | 0, costUsd: e.total_cost_usd ?? null, durationMs: e.duration_ms | 0, model: mu ? mu[0] : model });
    if (e.total_cost_usd != null) emit({ type: 'usage.cost', totalUsd: e.total_cost_usd, apiEquivalent: true });
    const status = e.is_error ? (e.terminal_reason === 'aborted' || /interrupt/i.test(e.subtype || '') ? 'interrupted' : 'error') : 'success';
    const auth = !!e.is_error && AUTH_FAIL.test(String(e.result || ''));
    if (auth) signedOut();
    else if (status === 'success') signedOutSaid = false;
    emit({ type: 'turn.ended', turnId: turnNo, status, error: e.is_error ? String(e.result || e.subtype || '').slice(0, 500) : null, ...(auth ? { auth: true } : {}) });
    setState('idle');
    if (mu && mu[1]?.contextWindow) emit({ type: 'usage.context', used: null, limit: mu[1].contextWindow, percent: null, source: 'modelUsage' });
    contextUsage();
    freshLimits();
  }

  function onRateLimit(info) {
    if (!info) return;
    const windows = [];
    const uw = info.unifiedWindows || {};
    for (const [kind, w] of Object.entries(uw)) windows.push({ kind, utilization: w.utilization, resetsAt: w.resetsAt ? w.resetsAt * 1000 : null });
    if (!windows.length && info.rateLimitType) windows.push({ kind: info.rateLimitType, utilization: info.utilization ?? null, resetsAt: info.resetsAt ? info.resetsAt * 1000 : null });
    emit({ type: 'usage.limits', provider: 'claude', status: info.status || null, windows });
  }

  function onControlRequest(e) {
    const r = e.request || {};
    const id = e.request_id;
    if (r.subtype === 'can_use_tool') {
      const name = r.tool_name;
      const input = r.input || {};
      const call = calls.get(r.tool_use_id) || { name, input, kind: toolKind(name), preview: previewFor(name, input) };
      if (name === ORB_TOOL_ID) {
        // the orb: nothing to ask (and the allow rule above usually means Claude never does)
        reply(id, { behavior: 'allow', updatedInput: input });
        return;
      }
      if (name === 'AskUserQuestion') {
        pendingTheirs.set(id, { tool: name, input, kind: 'question', callId: r.tool_use_id });
        emit({ type: 'question.request', requestId: id, callId: r.tool_use_id || null, questions: (input.questions || []).map((q) => ({ header: q.header, question: q.question, multiSelect: !!q.multiSelect, options: (q.options || []).map((o) => ({ label: o.label, description: o.description || '' })) })) });
      } else if (name === 'ExitPlanMode') {
        pendingTheirs.set(id, { tool: name, input, kind: 'plan', callId: r.tool_use_id });
        emit({ type: 'plan.proposed', requestId: id, callId: r.tool_use_id || null, plan: String(input.plan || '') });
      } else {
        const kind = call.kind || toolKind(name);
        // Only suggestions Claude itself offered can become "always allow" — the
        // screen cannot invent a rule.
        pendingTheirs.set(id, { tool: name, input, kind, callId: r.tool_use_id, rules: r.permission_suggestions || [] });
        const suggestions = (r.permission_suggestions || []).map((s) => ({ label: suggestionLabel(s), scope: s.destination === 'session' ? 'session' : 'always', rule: s }));
        emit({ type: 'permission.request', requestId: id, callId: r.tool_use_id || null, tool: r.display_name || name, kind, title: r.description || toolTitle(name, input), input, preview: call.preview || previewFor(name, input), suggestions, risk: riskOf(kind), reason: r.decision_reason || null, blockedPath: r.blocked_path || null });
      }
      setState(pendingTheirs.size ? 'waiting' : state);
      return;
    }
    // Anything else the CLI asks the host that the screen does not handle yet is
    // declined at once and said out loud — never left hanging.
    reply(id, r.subtype === 'elicitation' ? { action: 'decline' } : { behavior: 'deny', message: 'Not available from y3kode yet.' });
    emit({ type: 'notice', level: 'info', code: 'unhandled-request', text: `Claude asked for something y3kode cannot show yet (${r.subtype}); it was declined.` });
  }

  function suggestionLabel(s) {
    if (s.type === 'setMode') return `Switch to ${CLAUDE_TO_MODE[s.mode] || s.mode} for this session`;
    if (s.type === 'addRules') return `Always allow ${(s.rules || []).map((x) => x.toolName + (x.ruleContent ? `(${x.ruleContent})` : '')).join(', ')}`;
    if (s.type === 'addDirectories') return `Allow access to ${(s.directories || []).join(', ')}`;
    return s.type;
  }

  // --- lifecycle ---------------------------------------------------------------
  async function start() {
    const settings = tempFile(tmpDir, 'settings.json', JSON.stringify(denyRules(configDir)));
    files.push(settings);
    let mcpConfigPath = null;
    if (opts.mcp && Object.keys(opts.mcp.mcpServers || {}).length) {
      const m = tempFile(tmpDir, 'mcp.json', JSON.stringify(opts.mcp));
      files.push(m);
      mcpConfigPath = m.path;
    }
    const launch = () => {
      const skip = UNSUPPORTED.get(bin) || new Set();
      const args = buildArgs({ mode, model, effort, name: opts.name, sessionId, resumeId: opts.resumeId, fork: opts.fork, mcpConfigPath, settingsPath: settings.path, skip });
      audit?.write('session.spawn', { sid, provider: 'claude', cwd, args });
      const me = child = spawnChild(bin, args, { cwd, env });
      let stderr = '';
      let heard = false;
      heardFromChild = false;
      me.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 8000) stderr += d; });
      ndjson(me.stdout, (e) => { if (!heard) { heard = heardFromChild = true; early = []; } onEvent(e); }, (line) => emit({ type: 'raw', provider: 'claude', event: { line: line.slice(0, 500) } }));
      me.on('error', (err) => finish(err.code === 'ENOENT' ? 'not-installed' : 'spawn-error', null, String(err.message || err)));
      me.on('exit', (code, signal) => {
        // An extra this Claude Code does not know: it refuses at startup,
        // before a word of output. Remember that for this binary, say so once,
        // and start again without it — the person never sees the crash.
        const flag = (/unknown option '(-{1,2}[\w-]+)'/.exec(stderr) || [])[1];
        if (!stopping && !heard && code !== 0 && flag && OPTIONAL_FLAGS.includes(flag) && !skip.has(flag)) {
          UNSUPPORTED.set(bin, new Set([...skip, flag]));
          emit({ type: 'notice', level: 'info', code: 'old-client', text: `Your Claude Code is an older version, so one newer option (${flag}) is off. Everything else works; to update it, run claude update in Terminal.` });
          const replay = early.filter((o) => !(o.type === 'control_request' && o.request?.subtype === 'initialize'));
          early = [];
          launch();
          initialize();
          for (const o of replay) write(o);
          return;
        }
        finish(stopping ? 'stopped' : code === 0 ? 'exited' : 'crashed', code ?? signal, stopping ? null : stderr.trim().slice(-1000));
      });
    };
    const initialize = () => control({ subtype: 'initialize' }, 20000).then((r) => {
      if (r.ok && r.response?.models) emit({ type: 'provider.status', provider: 'claude', models: r.response.models.map((m) => ({ id: m.value, label: m.displayName, description: m.description, efforts: m.supportedEffortLevels || [], autoMode: !!m.supportsAutoMode })), account: r.response.account ? { type: r.response.account.subscriptionType || null } : null });
    });
    launch();
    emit({ type: 'session.started', provider: 'claude', cwd, model, effort, mode, providerSessionId: sessionId, resumeOf: opts.resumeId || null, forkOf: opts.fork ? opts.resumeId : null, title: opts.title || null });
    setState('idle');
    initialize().then(() => freshLimits());
    limitsTimer = setInterval(freshLimits, opts.limitsEveryMs || 3 * 60 * 1000);
    limitsTimer.unref?.();
    return { providerSessionId: sessionId };
  }

  function finish(reason, exitCode, detail) {
    if (ended) return;
    ended = true;
    clearInterval(limitsTimer);
    settlePartial();
    for (const [id] of pendingTheirs) emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' });
    pendingTheirs.clear();
    for (const [, fn] of pendingOurs) fn({ ok: false, error: 'ended' });
    pendingOurs.clear();
    for (const f of files) f.remove();
    files = [];
    setState('ended');
    emit({ type: 'session.ended', reason, exitCode: exitCode ?? null, detail: detail || null });
    audit?.write('session.ended', { sid, reason, exitCode });
  }

  function send({ text, attachments = [] }) {
    if (ended) return { ok: false, error: 'This session has ended.' };
    const content = [];
    for (const a of attachments || []) {
      if (a?.type === 'image' && typeof a.data === 'string' && /^image\/(png|jpeg|gif|webp)$/.test(a.mediaType)) {
        content.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } });
      }
    }
    content.push({ type: 'text', text });
    turnNo++;
    emit({ type: 'turn.started', turnId: turnNo });
    setState('running');
    return write({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null }) ? { ok: true } : { ok: false, error: 'The session is not running.' };
  }

  async function interrupt() {
    const r = await control({ subtype: 'interrupt' }, 8000);
    audit?.write('session.interrupt', { sid, ok: r.ok });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  function stop() {
    if (!child) return { ok: true };
    stopping = true;
    try { child.stdin.end(); } catch { /* ignore */ }
    stopChild(child, 5000);
    return { ok: true };
  }

  async function setMode(m) {
    if (!MODE_TO_CLAUDE[m]) return { ok: false, error: 'unknown mode' };
    const r = await control({ subtype: 'set_permission_mode', mode: MODE_TO_CLAUDE[m] });
    if (r.ok) { mode = m; emit({ type: 'mode.changed', mode }); }
    audit?.write('mode.set', { sid, mode: m, ok: r.ok });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  async function setModel(mdl) {
    if (mdl && !isModel(mdl)) return { ok: false, error: 'unknown model' };
    const r = await control({ subtype: 'set_model', model: mdl || 'default' });
    if (r.ok) { model = mdl; emit({ type: 'model.changed', model: mdl }); }
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  async function setEffort(eff) {
    if (!EFFORTS.includes(eff)) return { ok: false, error: 'unknown effort' };
    const r = await control({ subtype: 'apply_flag_settings', settings: { effortLevel: eff } });
    if (r.ok) { effort = eff; emit({ type: 'effort.changed', effort: eff }); }
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  // The tool runs with exactly the input the card showed; the page cannot change it.
  function answerPermission({ requestId, decision, scope, message }) {
    const p = pendingTheirs.get(requestId);
    if (!p) return { ok: false, error: 'That request is no longer waiting.' };
    pendingTheirs.delete(requestId);
    let response;
    if (p.kind === 'plan') {
      response = decision === 'allow' ? { behavior: 'allow', updatedInput: p.input } : { behavior: 'deny', message: message || 'Not yet — keep planning.' };
    } else if (decision === 'allow') {
      response = { behavior: 'allow', updatedInput: p.input };
      if ((scope === 'always' || scope === 'session') && p.rules?.length) {
        response.updatedPermissions = scope === 'session' ? p.rules.map((r) => ({ ...r, destination: 'session' })) : p.rules;
      }
    } else {
      response = { behavior: 'deny', message: message || 'The person declined this.' };
    }
    reply(requestId, response);
    emit({ type: 'permission.resolved', requestId, decision: decision === 'allow' ? 'allow' : 'deny', scope: scope || 'once', by: 'user' });
    audit?.write('permission', { sid, tool: p.tool, decision, scope: scope || 'once', input: p.input });
    if (!pendingTheirs.size && state === 'waiting') setState('running');
    return { ok: true };
  }

  function answerQuestion({ requestId, answers }) {
    const p = pendingTheirs.get(requestId);
    if (!p || p.kind !== 'question') return { ok: false, error: 'That question is no longer waiting.' };
    pendingTheirs.delete(requestId);
    reply(requestId, { behavior: 'allow', updatedInput: { ...p.input, answers } });
    emit({ type: 'question.resolved', requestId, answers });
    audit?.write('question', { sid, answers });
    if (!pendingTheirs.size && state === 'waiting') setState('running');
    return { ok: true };
  }

  async function contextUsage() {
    const r = await control({ subtype: 'get_context_usage' });
    if (r.ok && r.response) {
      const c = r.response;
      emit({ type: 'usage.context', used: c.totalTokens ?? null, limit: c.maxTokens ?? null, percent: c.percentage ?? null, breakdown: (c.categories || []).map((x) => ({ name: x.name, tokens: x.tokens, kind: x.kind })), source: 'context' });
    }
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  async function limits() {
    const r = await control({ subtype: 'get_usage' });
    const rows = planWindows(r.ok ? r.response?.rate_limits : null);
    if (rows.length) {
      // percentages (13 for 13%), as Claude's /usage shows them — unless every
      // one is a fraction already; decided for the set, so 0.5% is not 50%
      const scale = rows.some((w) => w.utilization > 1) ? 100 : 1;
      const windows = rows.map((w) => ({ kind: w.kind, ...(w.label ? { label: w.label } : {}), utilization: Math.min(1, w.utilization / scale), resetsAt: w.resetsAt ? Date.parse(w.resetsAt) : null }));
      emit({ type: 'usage.limits', provider: 'claude', status: null, windows });
    }
    return { ok: r.ok };
  }

  async function mcpToggle(name, enabled) {
    const r = await control({ subtype: 'mcp_toggle', serverName: name, enabled: !!enabled });
    if (r.ok) { const s = await control({ subtype: 'mcp_status' }); if (s.ok) emit({ type: 'mcp.status', servers: (s.response?.mcpServers || []).map((x) => ({ name: x.name, status: x.status, source: x.source || null })) }); }
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  async function mcpReconnect(name) {
    const r = await control({ subtype: 'mcp_reconnect', serverName: name });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  return {
    caps: CAPS, start, send, interrupt, stop, setMode, setModel, setEffort, answerPermission, answerQuestion,
    contextUsage, limits, mcpToggle, mcpReconnect,
    get state() { return state; }, get providerSessionId() { return sessionId; },
  };
}

// The names every adapter module exports, for the engine.
export { createClaudeAdapter as createAdapter, claudeEnv as envFor };
