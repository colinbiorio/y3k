// Agents that speak the Agent Client Protocol (JSON-RPC over stdio) — Google's
// Gemini CLI first (`gemini --acp`), pinned against 0.61.0.
//
// Gemini specifics that shape this file:
//   - an API key ONLY: Google's terms do not let other software use the Gemini
//     CLI's own Google sign-in, so the `oauth-personal` method is never chosen,
//     and the CLI runs with a home folder of y3k Code's own (its `authenticate`
//     rewrites settings there, and would delete a cached Google login if it ran
//     against the person's real ~/.gemini)
//   - modes: ask = `default`, plan = `plan`, acceptEdits = `autoEdit`. Its only
//     other mode approves EVERYTHING (`yolo`) — the one y3k Code never offers —
//     so y3k's "auto" is not available with Gemini
//   - no file or terminal capabilities are offered, so it uses its own tools
//   - its launcher ignores SIGTERM; closing stdin (or NO_RELAUNCH) stops it

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnChild, stopChild, childEnv, resolveBin, run } from '../proc.mjs';
import { createRpc } from '../jsonrpc.mjs';
import { lineDiff, countChanges } from '../diff.mjs';
import { capOutput } from './base.mjs';

export const CAPS = Object.freeze({
  modes: ['ask', 'plan', 'acceptEdits'], permissionPrompts: true, questions: false, planApproval: false,
  todos: true, subagents: false, diffs: true, contextUsage: false, limits: false, cost: false, mcpLive: false,
  resume: true, fork: false, models: true, effort: false, images: true,
});
export const EFFORTS = [];
const MODE_TO = { ask: 'default', plan: 'plan', acceptEdits: 'autoEdit' };
const MODE_FROM = { default: 'ask', plan: 'plan', autoEdit: 'acceptEdits', auto_edit: 'acceptEdits' };
const KIND = { execute: 'bash', edit: 'edit', delete: 'edit', move: 'edit', read: 'read', search: 'search', fetch: 'web', think: 'task', other: 'other', switch_mode: 'plan' };
const RISK = { bash: 'exec', edit: 'write', web: 'network', mcp: 'mcp' };

const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
export const isSessionId = (s) => typeof s === 'string' && SESSION.test(s);
export const isModel = (s) => typeof s === 'string' && MODEL.test(s);

export async function detect({ override, env } = {}) {
  const bin = resolveBin('gemini', { override, env });
  if (!bin) return { installed: false };
  const v = await run(bin, ['--version'], { env: { ...env, GEMINI_CLI_NO_RELAUNCH: 'true' }, timeout: 20000 });
  return { installed: v.code === 0, bin, version: (v.stdout.match(/\d+\.\d+\.\d+/) || [null])[0] };
}

const DROP = /^(GOOGLE_GEMINI_BASE_URL|CLOUD_SHELL|GEMINI_CLI_USE_COMPUTE_ADC|GOOGLE_GENAI_USE_GCA|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_APPLICATION_CREDENTIALS|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|CODEX_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|XAI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|DASHSCOPE_API_KEY|ZHIPU_API_KEY)$/;

// Its own home, set up for the API key, no usage telemetry, plain shell output.
export function envFor(base, { apiKey, homeDir } = {}) {
  const set = { GEMINI_CLI_NO_RELAUNCH: 'true', GEMINI_API_KEY: apiKey || '' };
  if (homeDir) {
    const dot = join(homeDir, '.gemini');
    mkdirSync(dot, { recursive: true, mode: 0o700 });
    const settings = join(dot, 'settings.json');
    if (!existsSync(settings)) {
      writeFileSync(settings, JSON.stringify({ security: { auth: { selectedType: 'gemini-api-key' } }, privacy: { usageStatisticsEnabled: false }, tools: { shell: { enableInteractiveShell: false } } }, null, 2), { mode: 0o600 });
    }
    set.GEMINI_CLI_HOME = homeDir;
  }
  return childEnv(base, { dropPattern: DROP, set });
}

// ACP's diff content → the one diff shape.
export function acpDiffs(content = []) {
  return (content || []).filter((c) => c?.type === 'diff').map((c) => {
    const hunks = lineDiff(c.oldText || '', c.newText || '');
    return { path: c.path, hunks, ...countChanges(hunks), created: !c.oldText, deleted: c._meta?.kind === 'delete' };
  });
}
const textOf = (content = []) => (content || []).map((c) => (c?.type === 'content' && c.content?.type === 'text' ? c.content.text : '')).filter(Boolean).join('\n');

// y3k's connectors → ACP's shape (every array present, as the agent requires).
export function acpServers(mcp = {}) {
  return Object.entries(mcp.mcpServers || {}).map(([name, c]) => (c.url
    ? { type: c.type === 'sse' ? 'sse' : 'http', name, url: c.url, headers: Object.entries(c.headers || {}).map(([n, v]) => ({ name: n, value: v })) }
    : { name, command: c.command, args: c.args || [], env: Object.entries(c.env || {}).map(([n, v]) => ({ name: n, value: v })) }));
}

export function createAdapter({ sid, cwd, emit, audit, bin, env, opts = {}, apiKey, provider = 'gemini' }) {
  let mode = MODE_TO[opts.mode] ? opts.mode : 'ask';
  let model = opts.model || null;
  let child = null;
  let rpc = null;
  let sessionId = opts.resumeId || null;
  let state = 'idle';
  let ended = false;
  let stopping = false;
  let turn = 0;
  let msgId = null;               // the assistant message being streamed
  let msgN = 0;
  const calls = new Map();        // toolCallId → { kind, announced }
  const asks = new Map();         // requestId → { resolve, options, callId, kind }
  let askNo = 0;

  const setState = (s) => { if (s !== state) { state = s; emit({ type: 'session.state', state: s }); } };
  const endMessage = () => { if (msgId) { emit({ type: 'message.end', id: msgId, stopReason: null }); msgId = null; } };
  const ensureMessage = () => { if (!msgId) { msgId = `${provider}-${turn}-${++msgN}`; emit({ type: 'message.start', id: msgId, model, parentCallId: null }); } return msgId; };

  function announce(tc, status) {
    const kind = KIND[tc.kind] || 'other';
    if (!calls.has(tc.toolCallId)) {
      calls.set(tc.toolCallId, { kind, announced: true });
      endMessage();
      const diffs = acpDiffs(tc.content);
      emit({ type: 'tool.call', callId: tc.toolCallId, name: tc.kind || 'tool', kind, title: tc.title || '', input: { locations: (tc.locations || []).map((l) => l.path) },
        preview: kind === 'bash' ? { command: tc.title, cwd } : diffs.length ? { diff: diffs, path: diffs[0].path } : {} });
    }
    return calls.get(tc.toolCallId);
  }

  function onNotify(method, p) {
    if (method !== 'session/update') return;
    const u = p.update || {};
    switch (u.sessionUpdate) {
      case 'agent_message_chunk': {
        const t = u.content?.type === 'text' ? u.content.text : '';
        const m = /^\[MODE_UPDATE\] (\w+)/.exec(t || '');
        if (m) { if (MODE_FROM[m[1]]) { mode = MODE_FROM[m[1]]; emit({ type: 'mode.changed', mode }); } return; }
        if (t) emit({ type: 'message.delta', id: ensureMessage(), block: 1, kind: 'text', text: t });
        return;
      }
      case 'agent_thought_chunk': {
        const t = u.content?.type === 'text' ? u.content.text : '';
        if (t) emit({ type: 'message.delta', id: ensureMessage(), block: 0, kind: 'thinking', text: t + '\n' });
        return;
      }
      case 'tool_call': {
        announce(u, u.status);
        if (u.status === 'completed' || u.status === 'failed') result(u);
        return;
      }
      case 'tool_call_update': {
        if (!calls.has(u.toolCallId)) announce({ ...u, kind: u.kind || 'other' });
        if (u.status === 'completed' || u.status === 'failed') result(u);
        return;
      }
      case 'plan':
        return emit({ type: 'todo.update', items: (u.entries || []).map((e) => ({ text: e.content, status: e.status === 'in_progress' ? 'in_progress' : e.status, activeForm: null })) });
      case 'current_mode_update':
        if (MODE_FROM[u.currentModeId]) { mode = MODE_FROM[u.currentModeId]; emit({ type: 'mode.changed', mode }); }
        return;
      default: return;
    }
  }

  function result(u) {
    const diffs = acpDiffs(u.content);
    emit({ type: 'tool.result', callId: u.toolCallId, status: u.status === 'completed' ? 'ok' : 'error', output: capOutput(textOf(u.content)), diff: diffs.length ? diffs : null, exitCode: null });
    if (u.status === 'completed' && diffs.length) emit({ type: 'files.changed', paths: diffs.map((d) => d.path) });
  }

  async function onRequest(method, p) {
    if (method !== 'session/request_permission') return undefined; // fs/*, terminal/* are not offered
    const tc = p.toolCall || {};
    const rec = announce(tc, 'pending');
    const diffs = acpDiffs(tc.content);
    const always = (p.options || []).filter((o) => o.kind === 'allow_always');
    const requestId = `acp-${++askNo}`;
    const answer = await new Promise((resolve) => {
      asks.set(requestId, { resolve, options: p.options || [], callId: tc.toolCallId, kind: rec.kind });
      emit({
        type: 'permission.request', requestId, callId: tc.toolCallId, tool: tc.title || tc.kind || 'tool', kind: rec.kind, title: tc.title || '', input: {},
        preview: rec.kind === 'bash' ? { command: tc.title, cwd } : diffs.length ? { diff: diffs, path: diffs[0].path } : {},
        suggestions: always.map((o) => ({ label: o.name, scope: 'session', optionId: o.optionId })), risk: RISK[rec.kind] || 'read', reason: null,
      });
      setState('waiting');
    });
    if (answer.optionId === null) {
      // declined: the agent sends nothing more for this call, so say so here
      emit({ type: 'tool.result', callId: tc.toolCallId, status: 'denied', output: capOutput(answer.message || ''), diff: null, exitCode: null });
      return { outcome: { outcome: 'cancelled' } };
    }
    return { outcome: { outcome: 'selected', optionId: answer.optionId } };
  }

  async function start() {
    const args = ['--acp', '--skip-trust', ...(model ? ['-m', model] : [])];
    audit?.write('session.spawn', { sid, provider, cwd, args });
    child = spawnChild(bin, args, { cwd, env });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 8000) stderr += d; });
    rpc = createRpc(child, { onNotify, onRequest, onBad: (line) => emit({ type: 'raw', provider, event: { line } }) });
    child.on('error', (err) => finish(err.code === 'ENOENT' ? 'not-installed' : 'spawn-error', null, String(err.message || err)));
    child.on('exit', (code, signal) => finish(stopping ? 'stopped' : code === 0 ? 'exited' : 'crashed', code ?? signal, stopping ? null : stderr.trim().slice(-1000)));
    emit({ type: 'session.started', provider, cwd, model, effort: null, mode, providerSessionId: sessionId, resumeOf: opts.resumeId || null, forkOf: null, title: opts.title || null });
    try {
      const init = await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'y3k-code', version: '0.1.0' } }, { timeout: 60000 });
      const keyMethod = (init.authMethods || []).find((a) => a.id === 'gemini-api-key');
      if (!keyMethod) throw new Error('This Gemini CLI does not offer API-key sign-in.');
      if (!apiKey) throw new Error('Add a Gemini API key (from Google AI Studio) to use Gemini.');
      await rpc.request('authenticate', { methodId: 'gemini-api-key', _meta: { 'api-key': apiKey } });
      const mcpServers = acpServers(opts.mcp);
      const r = sessionId
        ? await rpc.request('session/load', { sessionId, cwd, mcpServers })
        : await rpc.request('session/new', { cwd, mcpServers });
      sessionId = r.sessionId || sessionId;
      if (MODE_TO[mode] !== (r.modes?.currentModeId || 'default')) await rpc.request('session/set_mode', { sessionId, modeId: MODE_TO[mode] }).catch(() => {});
      model = model || r.models?.currentModelId || null;
      emit({ type: 'session.ready', providerSessionId: sessionId, tools: [], mcp: mcpServers.map((s) => ({ name: s.name, status: 'configured' })), model, mode, cwd, version: init.agentInfo?.version || null, auth: 'apiKey' });
      emit({ type: 'provider.status', provider, models: (r.models?.availableModels || []).map((x) => ({ id: x.modelId, label: x.name, description: x.description || '', efforts: [] })) });
      setState('idle');
    } catch (err) {
      emit({ type: 'notice', level: 'error', text: String(err?.message || err).slice(0, 400) });
      stop();
    }
    return { providerSessionId: sessionId };
  }

  function finish(reason, exitCode, detail) {
    if (ended) return;
    ended = true;
    for (const [id, a] of asks) { a.resolve({ optionId: null }); emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' }); }
    asks.clear();
    endMessage();
    setState('ended');
    emit({ type: 'session.ended', reason, exitCode: exitCode ?? null, detail: detail || null });
    audit?.write('session.ended', { sid, reason, exitCode });
  }

  function send({ text, attachments = [] }) {
    if (ended || !sessionId) return { ok: false, error: 'This session is not ready.' };
    const prompt = [{ type: 'text', text }];
    for (const a of attachments || []) if (a?.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(a.mediaType)) prompt.push({ type: 'image', mimeType: a.mediaType, data: a.data });
    turn++;
    msgId = null;
    emit({ type: 'turn.started', turnId: turn });
    setState('running');
    rpc.request('session/prompt', { sessionId, prompt }, { timeout: 60 * 60 * 1000 }).then((r) => {
      endMessage();
      const q = r?._meta?.quota?.token_count;
      if (q) emit({ type: 'usage.turn', inputTokens: q.input_tokens | 0, outputTokens: q.output_tokens | 0, cacheRead: 0, cacheWrite: 0, costUsd: null, durationMs: 0, model });
      emit({ type: 'turn.ended', turnId: turn, status: r?.stopReason === 'cancelled' ? 'interrupted' : 'success', error: null });
      setState('idle');
    }).catch((err) => {
      endMessage();
      // Gemini passes the API's own error through, often as a JSON document.
      let msg = String(err?.message || err);
      try { const j = JSON.parse(msg); msg = (Array.isArray(j) ? j[0] : j)?.error?.message || msg; } catch { const m = /"message"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(msg); if (m) msg = m[1]; }
      emit({ type: 'turn.ended', turnId: turn, status: 'error', error: (err?.code === 429 ? 'Gemini is rate-limited right now: ' : '') + msg.slice(0, 300) });
      setState('idle');
    });
    return { ok: true };
  }

  async function interrupt() {
    if (!sessionId) return { ok: false, error: 'Nothing is running.' };
    rpc.notify('session/cancel', { sessionId });
    // a question left open would hold the turn forever
    for (const [id, a] of asks) { a.resolve({ optionId: null }); asks.delete(id); emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' }); }
    audit?.write('session.interrupt', { sid, ok: true });
    return { ok: true };
  }

  function stop() {
    if (!child) return { ok: true };
    stopping = true;
    try { child.stdin.end(); } catch { /* ignore */ }
    stopChild(child, 5000);
    return { ok: true };
  }

  async function setMode(m) {
    if (!MODE_TO[m]) return { ok: false, error: m === 'auto' ? 'Gemini has no "auto" mode — only one that skips every permission, which y3k Code never offers.' : 'unknown mode' };
    try { await rpc.request('session/set_mode', { sessionId, modeId: MODE_TO[m] }); } catch (err) { return { ok: false, error: String(err?.message || err) }; }
    mode = m;
    emit({ type: 'mode.changed', mode });
    audit?.write('mode.set', { sid, mode: m, ok: true });
    return { ok: true };
  }

  async function setModel(mdl) {
    if (!isModel(mdl)) return { ok: false, error: 'unknown model' };
    try { await rpc.request('session/set_model', { sessionId, modelId: mdl }); } catch (err) { return { ok: false, error: String(err?.message || err) }; }
    model = mdl;
    emit({ type: 'model.changed', model: mdl });
    return { ok: true };
  }

  function answerPermission({ requestId, decision, scope, message }) {
    const a = asks.get(requestId);
    if (!a) return { ok: false, error: 'That request is no longer waiting.' };
    asks.delete(requestId);
    let optionId = null;
    if (decision === 'allow') {
      const kindWanted = scope === 'session' || scope === 'always' ? 'allow_always' : 'allow_once';
      optionId = (a.options.find((o) => o.kind === kindWanted) || a.options.find((o) => o.kind === 'allow_once'))?.optionId || null;
    }
    a.resolve({ optionId, message });
    emit({ type: 'permission.resolved', requestId, decision: optionId ? 'allow' : 'deny', scope: scope || 'once', by: 'user' });
    audit?.write('permission', { sid, tool: a.kind, decision: optionId ? 'allow' : 'deny', scope: scope || 'once' });
    if (!asks.size && state === 'waiting') setState('running');
    return { ok: true };
  }

  const unsupported = async () => ({ ok: false, error: 'Gemini does not offer that here.' });
  return {
    caps: CAPS, start, send, interrupt, stop, setMode, setModel, setEffort: unsupported, answerPermission,
    answerQuestion: unsupported, contextUsage: async () => ({ ok: true }), limits: async () => ({ ok: true }),
    mcpToggle: unsupported, mcpReconnect: unsupported,
    get state() { return state; }, get providerSessionId() { return sessionId; },
  };
}
