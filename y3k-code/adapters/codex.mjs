// OpenAI Codex, driven through `codex app-server` (JSON-RPC over stdio), the
// same way the Codex IDE extensions drive it. Protocol pinned against
// codex-cli 0.157.1's own generated schema (see test/code-codex.test.mjs).
//
// y3k's four modes, in Codex's two knobs (sandbox × approval policy):
//   ask          read-only sandbox, asks when it needs more (on-request)
//   plan         read-only sandbox, never asks — it can look, not change
//   acceptEdits  may write in the folder; asks before commands it does not trust
//   auto         may write in the folder; asks only when it decides it must
// Full disk access (danger-full-access) is never used, whatever is asked.
//
// Sign-in: the person's own `codex login` (their ~/.codex) when they turned
// sign-in on, on this machine. With an API key, Codex keeps the key in its home
// folder — so a key session runs with a home folder of y3k Code's own, and the
// person's own login is never overwritten.

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import { spawnChild, stopChild, childEnv, resolveBin, run } from '../proc.mjs';
import { createRpc } from '../jsonrpc.mjs';
import { lineDiff, countChanges, parseUnified } from '../diff.mjs';
import { capOutput } from './base.mjs';

export const CAPS = Object.freeze({
  modes: ['ask', 'plan', 'acceptEdits', 'auto'], permissionPrompts: true, questions: true, planApproval: false,
  todos: true, subagents: false, diffs: true, contextUsage: true, limits: true, cost: false, mcpLive: false,
  resume: true, fork: true, models: true, effort: true, images: true,
});
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const MODE = {
  ask: { sandbox: 'read-only', sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'on-request' },
  plan: { sandbox: 'read-only', sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never' },
  acceptEdits: { sandbox: 'workspace-write', sandboxPolicy: { type: 'workspaceWrite', networkAccess: false }, approvalPolicy: 'untrusted' },
  auto: { sandbox: 'workspace-write', sandboxPolicy: { type: 'workspaceWrite', networkAccess: false }, approvalPolicy: 'on-request' },
};
const PLAN_NOTE = 'The person chose plan mode: look around and propose a plan, but do not change any files or run commands that change anything.';

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
export const isSessionId = (s) => typeof s === 'string' && THREAD_ID.test(s);
export const isModel = (s) => typeof s === 'string' && MODEL.test(s);

export async function detect({ override, env } = {}) {
  const bin = resolveBin('codex', { override, env });
  if (!bin) return { installed: false };
  const v = await run(bin, ['--version'], { env, timeout: 15000 });
  return { installed: v.code === 0, bin, version: (v.stdout.match(/\d+\.\d+\.\d+/) || [null])[0] };
}

const OTHER_KEYS = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|XAI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|DASHSCOPE_API_KEY|ZHIPU_API_KEY)$/;
// Key sessions get a Codex home of their own (see above).
export function envFor(base, { auth, homeDir } = {}) {
  const set = {};
  if (auth !== 'subscription' && homeDir) { mkdirSync(homeDir, { recursive: true, mode: 0o700 }); set.CODEX_HOME = homeDir; }
  return childEnv(base, { dropPattern: OTHER_KEYS, set });
}

// Codex's file changes → the one diff shape.
export function changeDiffs(changes = [], cwd = '') {
  return (changes || []).map((c) => {
    const path = c.path && !isAbsolute(c.path) && cwd ? resolvePath(cwd, c.path) : c.path;
    const t = c.kind?.type;
    let hunks;
    if (t === 'add') hunks = lineDiff('', c.diff || '');
    else if (t === 'delete') hunks = lineDiff(c.diff || '', '');
    else hunks = parseUnified(`diff --git a/x b/x\n${/^(---|\+\+\+) /m.test(c.diff || '') ? '' : '--- a/x\n+++ b/x\n'}${c.diff || ''}`)[0]?.hunks || [];
    return { path, hunks, ...countChanges(hunks), created: t === 'add', deleted: t === 'delete', movedTo: c.kind?.move_path || null };
  });
}

export function createAdapter({ sid, cwd, emit, audit, bin, env, opts = {}, apiKey }) {
  let mode = opts.mode || 'ask';
  let model = opts.model || null;
  let effort = opts.effort || null;
  let pendingOverrides = {};         // applied on the next turn/start (Codex makes them stick)
  let child = null;
  let rpc = null;
  let threadId = opts.resumeId && !opts.fork ? opts.resumeId : null;
  let turnId = null;
  let state = 'idle';
  let ended = false;
  let stopping = false;
  let limits = {};
  const items = new Map();          // item id → { type, changes, output }
  const asks = new Map();           // our request id → { resolve, kind, itemId }
  let askNo = 0;

  const setState = (s) => { if (s !== state) { state = s; emit({ type: 'session.state', state: s }); } };

  function onNotify(method, p) {
    switch (method) {
      case 'turn/started': turnId = p.turn?.id || turnId; return;
      case 'item/started': return itemStarted(p.item || {});
      case 'item/completed': return itemCompleted(p.item || {});
      case 'item/agentMessage/delta': return emit({ type: 'message.delta', id: p.itemId, block: 0, kind: 'text', text: p.delta || '' });
      case 'item/reasoning/summaryTextDelta': return emit({ type: 'message.delta', id: p.itemId, block: p.summaryIndex | 0, kind: 'thinking', text: p.delta || '' });
      case 'item/commandExecution/outputDelta': {
        const it = items.get(p.itemId);
        if (it) { it.output = (it.output + (p.delta || '')).slice(-8000); emit({ type: 'tool.progress', callId: p.itemId, text: it.output.slice(-2000) }); }
        return;
      }
      case 'item/fileChange/patchUpdated': {
        const it = items.get(p.itemId);
        if (it) it.changes = p.changes;
        return;
      }
      case 'turn/plan/updated':
        return emit({ type: 'todo.update', items: (p.plan || []).map((x) => ({ text: x.step, status: x.status === 'inProgress' ? 'in_progress' : x.status, activeForm: null })) });
      case 'thread/tokenUsage/updated': {
        const u = p.tokenUsage || {};
        const used = u.last?.totalTokens ?? null;
        const limit = u.modelContextWindow ?? null;
        emit({ type: 'usage.context', used, limit, percent: used != null && limit ? Math.round((100 * used) / limit) : null, source: 'context' });
        lastUsage = u.last || null;
        return;
      }
      case 'account/rateLimits/updated': return onLimits(p.rateLimits, true);
      case 'turn/completed': {
        const t = p.turn || {};
        if (lastUsage) emit({ type: 'usage.turn', inputTokens: lastUsage.inputTokens | 0, outputTokens: lastUsage.outputTokens | 0, cacheRead: lastUsage.cachedInputTokens | 0, cacheWrite: 0, costUsd: null, durationMs: t.durationMs | 0, model });
        emit({ type: 'turn.ended', turnId: t.id, status: t.status === 'completed' ? 'success' : t.status === 'interrupted' ? 'interrupted' : 'error', error: t.error?.message || null });
        turnId = null;
        setState('idle');
        return;
      }
      case 'error':
        if (p.willRetry) emit({ type: 'notice', level: 'info', code: 'retry', text: `Retrying: ${String(p.error?.message || '').slice(0, 160)}` });
        else emit({ type: 'notice', level: 'error', text: String(p.error?.message || 'Codex reported an error.').slice(0, 500) });
        return;
      case 'warning': case 'guardianWarning': case 'deprecationNotice':
        return emit({ type: 'notice', level: 'warn', text: String(p.message || p.summary || '').slice(0, 300) });
      case 'model/rerouted': return emit({ type: 'model.changed', model: p.toModel });
      case 'serverRequest/resolved': {
        for (const [id, a] of asks) if (String(a.rpcId) === String(p.requestId)) { asks.delete(id); emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' }); }
        return;
      }
      default: return;
    }
  }
  let lastUsage = null;

  function onLimits(rl, sparse) {
    if (!rl) return;
    if (sparse) { for (const [k, v] of Object.entries(rl)) if (v != null) limits[k] = v; } else limits = { ...rl };
    const w = (x, fallback) => (x ? { kind: x.windowDurationMins === 300 ? 'five_hour' : x.windowDurationMins === 10080 ? 'seven_day' : fallback, utilization: (x.usedPercent ?? 0) / 100, resetsAt: x.resetsAt ? x.resetsAt * 1000 : null } : null);
    emit({ type: 'usage.limits', provider: 'codex', status: limits.rateLimitReachedType || null, windows: [w(limits.primary, 'five_hour'), w(limits.secondary, 'seven_day')].filter(Boolean) });
  }

  function itemStarted(it) {
    items.set(it.id, { type: it.type, changes: it.changes || [], output: '' });
    switch (it.type) {
      case 'agentMessage': return emit({ type: 'message.start', id: it.id, model, parentCallId: null });
      case 'reasoning': emit({ type: 'message.start', id: it.id, model, parentCallId: null }); return emit({ type: 'message.delta', id: it.id, block: 0, kind: 'thinking', text: '' });
      case 'commandExecution':
        return emit({ type: 'tool.call', callId: it.id, name: 'shell', kind: 'bash', title: it.command, input: { command: it.command, cwd: it.cwd }, preview: { command: it.command, cwd: it.cwd } });
      case 'fileChange': {
        const diffs = changeDiffs(it.changes, cwd);
        return emit({ type: 'tool.call', callId: it.id, name: 'apply_patch', kind: 'edit', title: diffs.map((d) => String(d.path).split(/[\\/]/).pop()).join(', '), input: { files: diffs.map((d) => d.path) }, preview: { diff: diffs } });
      }
      case 'mcpToolCall':
        return emit({ type: 'tool.call', callId: it.id, name: `mcp__${it.server}__${it.tool}`, kind: 'mcp', title: `${it.server} · ${it.tool}`, input: it.arguments || {}, preview: {} });
      case 'webSearch':
        return emit({ type: 'tool.call', callId: it.id, name: 'web_search', kind: 'web', title: it.query || '', input: { query: it.query }, preview: { query: it.query } });
      case 'contextCompaction':
        return emit({ type: 'compact', trigger: 'auto', preTokens: null });
      default: return;
    }
  }

  function itemCompleted(it) {
    const rec = items.get(it.id) || {};
    switch (it.type) {
      case 'agentMessage':
        emit({ type: 'message.block', id: it.id, block: 0, kind: 'text', text: it.text || '' });
        return emit({ type: 'message.end', id: it.id, stopReason: null });
      case 'reasoning':
        emit({ type: 'message.block', id: it.id, block: 0, kind: 'thinking', text: (it.summary || []).join('\n\n') });
        return emit({ type: 'message.end', id: it.id, stopReason: null });
      case 'commandExecution':
        return emit({ type: 'tool.result', callId: it.id, status: it.status === 'completed' ? (it.exitCode ? 'error' : 'ok') : it.status === 'declined' ? 'denied' : 'error', output: capOutput(it.aggregatedOutput ?? rec.output ?? ''), exitCode: it.exitCode ?? null, diff: null });
      case 'fileChange': {
        const diffs = changeDiffs(it.changes?.length ? it.changes : rec.changes, cwd);
        emit({ type: 'tool.result', callId: it.id, status: it.status === 'completed' ? 'ok' : it.status === 'declined' ? 'denied' : 'error', output: capOutput(''), diff: diffs, exitCode: null });
        if (it.status === 'completed') emit({ type: 'files.changed', paths: diffs.map((d) => d.path) });
        return;
      }
      case 'mcpToolCall': {
        const text = it.error?.message || (it.result?.content || []).map((c) => (c?.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
        return emit({ type: 'tool.result', callId: it.id, status: it.status === 'completed' ? 'ok' : 'error', output: capOutput(text), diff: null, exitCode: null });
      }
      case 'webSearch':
        return emit({ type: 'tool.result', callId: it.id, status: 'ok', output: capOutput(''), diff: null, exitCode: null });
      default: return;
    }
  }

  // The agent asks; the card shows what would happen; the person answers.
  function ask(rpcId, kind, card) {
    const requestId = `cx-${++askNo}`;
    return new Promise((resolve) => {
      asks.set(requestId, { resolve, kind, rpcId, itemId: card.callId });
      emit({ type: 'permission.request', requestId, ...card });
      setState('waiting');
    });
  }

  async function onRequest(method, p, rpcId) {
    const cmdCard = (command, cwdHere, reason) => ({
      callId: p.itemId || null, tool: 'shell', kind: 'bash', title: command, input: { command, cwd: cwdHere }, risk: 'exec',
      preview: { command, cwd: cwdHere }, reason: reason || null,
      suggestions: [{ label: 'Allow commands like this for this session', scope: 'session' }],
    });
    switch (method) {
      case 'item/commandExecution/requestApproval': {
        const a = await ask(rpcId, 'command', cmdCard(p.command || '', p.cwd || cwd, p.reason));
        return { decision: a.decision === 'allow' ? (a.scope === 'once' ? 'accept' : 'acceptForSession') : 'decline' };
      }
      case 'item/fileChange/requestApproval': {
        const rec = items.get(p.itemId);
        const diffs = changeDiffs(rec?.changes || [], cwd);
        const a = await ask(rpcId, 'edit', {
          callId: p.itemId, tool: 'apply_patch', kind: 'edit', title: diffs.map((d) => String(d.path).split(/[\\/]/).pop()).join(', ') || 'files', input: { files: diffs.map((d) => d.path) }, risk: 'write',
          preview: { diff: diffs, path: diffs[0]?.path }, reason: p.reason || null,
          suggestions: [{ label: 'Allow edits for this session', scope: 'session' }],
        });
        return { decision: a.decision === 'allow' ? (a.scope === 'once' ? 'accept' : 'acceptForSession') : 'decline' };
      }
      case 'item/permissions/requestApproval': {
        const want = p.permissions || {};
        const what = [want.network?.enabled ? 'use the network' : null, ...(want.fileSystem?.write || []).map((x) => `write in ${x}`), ...(want.fileSystem?.read || []).map((x) => `read ${x}`)].filter(Boolean);
        const a = await ask(rpcId, 'permissions', { callId: p.itemId, tool: 'permissions', kind: 'other', title: what.join(', ') || 'more access', input: want, risk: want.network?.enabled ? 'network' : 'write', preview: {}, reason: p.reason || null, suggestions: [] });
        return a.decision === 'allow' ? { permissions: want, scope: 'turn' } : { permissions: {}, scope: 'turn' };
      }
      case 'execCommandApproval': {
        const a = await ask(rpcId, 'command', cmdCard((p.command || []).join(' '), p.cwd || cwd, p.reason));
        return { decision: a.decision === 'allow' ? (a.scope === 'once' ? 'approved' : 'approved_for_session') : { denied: { rejection: a.message || 'The person declined this.' } } };
      }
      case 'applyPatchApproval': {
        const changes = Object.entries(p.fileChanges || {}).map(([path, c]) => ({ path, kind: { type: c.type, move_path: c.move_path || null }, diff: c.unified_diff || c.content || '' }));
        const diffs = changeDiffs(changes, cwd);
        const a = await ask(rpcId, 'edit', { callId: p.callId || null, tool: 'apply_patch', kind: 'edit', title: diffs.map((d) => String(d.path).split(/[\\/]/).pop()).join(', '), input: {}, risk: 'write', preview: { diff: diffs }, reason: p.reason || null, suggestions: [] });
        return { decision: a.decision === 'allow' ? (a.scope === 'once' ? 'approved' : 'approved_for_session') : { denied: { rejection: a.message || 'The person declined this.' } } };
      }
      case 'mcpServer/elicitation/request':
        emit({ type: 'notice', level: 'info', text: `${p.serverName || 'A connector'} asked for input y3k Code cannot show yet; it was declined.` });
        return { action: 'decline', content: null, _meta: null };
      default:
        return undefined;
    }
  }

  async function start() {
    audit?.write('session.spawn', { sid, provider: 'codex', cwd, args: ['app-server'] });
    child = spawnChild(bin, ['app-server'], { cwd, env });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 8000) stderr += d; });
    rpc = createRpc(child, { onNotify, onRequest, onBad: (line) => emit({ type: 'raw', provider: 'codex', event: { line } }) });
    child.on('error', (err) => finish(err.code === 'ENOENT' ? 'not-installed' : 'spawn-error', null, String(err.message || err)));
    child.on('exit', (code, signal) => finish(stopping ? 'stopped' : code === 0 ? 'exited' : 'crashed', code ?? signal, stopping ? null : stderr.trim().slice(-1000)));
    emit({ type: 'session.started', provider: 'codex', cwd, model, effort, mode, providerSessionId: threadId, resumeOf: opts.resumeId || null, forkOf: opts.fork ? opts.resumeId : null, title: opts.title || null });
    try {
      await rpc.request('initialize', { clientInfo: { name: 'y3k-code', title: 'y3k Code', version: '0.1.0' }, capabilities: { experimentalApi: false } }, { timeout: 30000 });
      rpc.notify('initialized', {});
      const acct = await rpc.request('account/read', {}).catch(() => null);
      if (!acct?.account) {
        if (apiKey) await rpc.request('account/login/start', { type: 'apiKey', apiKey });
        else throw new Error('Sign in to Codex first: run `codex login` in a terminal (or add an OpenAI API key).');
      }
      const m = MODE[mode] || MODE.ask;
      const base = { cwd, approvalPolicy: m.approvalPolicy, sandbox: m.sandbox, ...(model ? { model } : {}), ...(effort ? { config: { model_reasoning_effort: effort } } : {}), ...(mode === 'plan' ? { developerInstructions: PLAN_NOTE } : {}) };
      const r = opts.resumeId
        ? await rpc.request(opts.fork ? 'thread/fork' : 'thread/resume', { threadId: opts.resumeId, ...base })
        : await rpc.request('thread/start', base);
      threadId = r.thread?.id || threadId;
      model = r.model || model;
      emit({ type: 'session.ready', providerSessionId: threadId, tools: [], mcp: [], model, mode, cwd: r.cwd || cwd, version: null, auth: acct?.account?.type || (apiKey ? 'apiKey' : null) });
      rpc.request('model/list', {}).then((ml) => emit({ type: 'provider.status', provider: 'codex', models: (ml.data || []).filter((x) => !x.hidden).map((x) => ({ id: x.id, label: x.displayName, description: x.description, efforts: (x.supportedReasoningEfforts || []).map((e) => e.reasoningEffort).filter((e) => EFFORTS.includes(e)) })) })).catch(() => {});
      rpc.request('account/rateLimits/read', {}).then((x) => onLimits(x.rateLimits, false)).catch(() => {});
      setState('idle');
    } catch (err) {
      emit({ type: 'notice', level: 'error', text: String(err?.message || err).slice(0, 400) });
      stop();
    }
    return { providerSessionId: threadId };
  }

  function finish(reason, exitCode, detail) {
    if (ended) return;
    ended = true;
    for (const [id, a] of asks) { a.resolve({ decision: 'deny' }); emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' }); }
    asks.clear();
    setState('ended');
    emit({ type: 'session.ended', reason, exitCode: exitCode ?? null, detail: detail || null });
    audit?.write('session.ended', { sid, reason, exitCode });
  }

  function send({ text, attachments = [] }) {
    if (ended || !threadId) return { ok: false, error: 'This session is not ready.' };
    const input = [{ type: 'text', text }];
    for (const a of attachments || []) if (a?.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(a.mediaType)) input.push({ type: 'image', url: `data:${a.mediaType};base64,${a.data}` });
    const m = MODE[mode] || MODE.ask;
    const params = { threadId, input, approvalPolicy: m.approvalPolicy, sandboxPolicy: m.sandboxPolicy, ...pendingOverrides };
    pendingOverrides = {};
    emit({ type: 'turn.started', turnId: null });
    setState('running');
    rpc.request('turn/start', params).then((r) => { turnId = r.turn?.id || turnId; }).catch((err) => {
      emit({ type: 'turn.ended', turnId: null, status: 'error', error: String(err?.message || err).slice(0, 300) });
      setState('idle');
    });
    return { ok: true };
  }

  async function interrupt() {
    if (!threadId || !turnId) return { ok: false, error: 'Nothing is running.' };
    try { await rpc.request('turn/interrupt', { threadId, turnId }); audit?.write('session.interrupt', { sid, ok: true }); return { ok: true }; } catch (err) { return { ok: false, error: String(err?.message || err) }; }
  }

  function stop() {
    if (!child) return { ok: true };
    stopping = true;
    try { child.stdin.end(); } catch { /* ignore */ }
    stopChild(child, 5000);
    return { ok: true };
  }

  // Codex applies these with the next turn, and keeps them after.
  async function setMode(m) {
    if (!MODE[m]) return { ok: false, error: 'unknown mode' };
    mode = m;
    emit({ type: 'mode.changed', mode });
    audit?.write('mode.set', { sid, mode: m, ok: true });
    return { ok: true };
  }
  async function setModel(mdl) {
    if (!isModel(mdl)) return { ok: false, error: 'unknown model' };
    model = mdl; pendingOverrides.model = mdl;
    emit({ type: 'model.changed', model: mdl });
    return { ok: true };
  }
  async function setEffort(e) {
    if (!EFFORTS.includes(e)) return { ok: false, error: 'unknown effort' };
    effort = e; pendingOverrides.effort = e;
    emit({ type: 'effort.changed', effort: e });
    return { ok: true };
  }

  function answerPermission({ requestId, decision, scope, message }) {
    const a = asks.get(requestId);
    if (!a) return { ok: false, error: 'That request is no longer waiting.' };
    asks.delete(requestId);
    a.resolve({ decision: decision === 'allow' ? 'allow' : 'deny', scope: scope || 'once', message });
    emit({ type: 'permission.resolved', requestId, decision: decision === 'allow' ? 'allow' : 'deny', scope: scope || 'once', by: 'user' });
    audit?.write('permission', { sid, tool: a.kind, decision, scope: scope || 'once' });
    if (!asks.size && state === 'waiting') setState('running');
    return { ok: true };
  }

  const unsupported = async () => ({ ok: false, error: 'Codex does not offer that here.' });
  return {
    caps: CAPS, start, send, interrupt, stop, setMode, setModel, setEffort, answerPermission,
    answerQuestion: unsupported, contextUsage: async () => ({ ok: true }), limits: async () => { try { onLimits((await rpc.request('account/rateLimits/read', {})).rateLimits, false); return { ok: true }; } catch { return { ok: false }; } },
    mcpToggle: unsupported, mcpReconnect: unsupported,
    get state() { return state; }, get providerSessionId() { return threadId; },
  };
}

export const _test = { MODE, randomUUID };
