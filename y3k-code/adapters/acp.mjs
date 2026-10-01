// Agents that speak the Agent Client Protocol (JSON-RPC over stdio) — Google's
// Gemini CLI first (`gemini --acp`), pinned against 0.61.0.
//
// Gemini specifics that shape this file:
//   - it runs on the person's own Gemini CLI sign-in, the one `gemini` set up
//     in their ~/.gemini (Sign in with Google, or whatever type their settings
//     name). The ACP server signs in by itself from those settings when a
//     session opens, so normally y3kode sends no `authenticate` at all. It
//     sends one only when their settings name no type but a Google sign-in is
//     cached here — and then that one type, nothing else. The cache is never
//     opened. Anything more (no cache, or the named sign-in failing) is theirs
//     to redo in `gemini`: an `authenticate` then would start a browser
//     sign-in from inside a session nobody is watching.
//   - an API key only when the person chose one (providers.mjs). Then, and
//     only then, the CLI runs with a home folder of y3kode's own, set up for
//     the key, so the key never lands in their real ~/.gemini settings
//   - modes: ask = `default`, plan = `plan`, acceptEdits = `autoEdit`. Its only
//     other mode approves EVERYTHING (`yolo`) — the one y3kode never offers —
//     so y3k's "auto" is not available with Gemini
//   - no file or terminal capabilities are offered, so it uses its own tools
//   - its launcher ignores SIGTERM; closing stdin (or NO_RELAUNCH) stops it

import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
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

// Other vendors' keys never reach it, whichever way it signs in.
const OTHER_KEYS = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|CODEX_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|XAI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|DASHSCOPE_API_KEY|ZHIPU_API_KEY)$/;
// With a key y3kode was given, Google's own switches in the environment are
// dropped too, so the key is what it uses — not a sign-in or a project the
// environment would otherwise pick.
const GOOGLE_SWITCHES = /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GEMINI_BASE_URL|CLOUD_SHELL|GEMINI_CLI_USE_COMPUTE_ADC|GOOGLE_GENAI_USE_GCA|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_APPLICATION_CREDENTIALS|GEMINI_CLI_HOME)$/;
const DROP = new RegExp(`${OTHER_KEYS.source}|${GOOGLE_SWITCHES.source}`);

// The folder Gemini CLI keeps its settings and sign-in in, as the CLI itself
// finds it (GEMINI_CLI_HOME moves it; otherwise the home folder).
export const geminiDir = (env = process.env) => join(env.GEMINI_CLI_HOME || homedir(), '.gemini');

// Is the person signed in to Gemini CLI, and how? From its settings (the sign-in
// type they chose — settings, not a credential) and whether its sign-in cache
// exists. The cache is stat'ed, never opened. { state, method, chosen, cached }:
//   Sign in with Google ('oauth-personal', or no type yet): signed in if the
//     cache is there
//   any other type they chose (an AI Studio key in their own environment,
//     Vertex AI, Cloud Shell…): set up by them, so 'signed-in' — if it cannot
//     reach a model, the session says so in the CLI's own words
export function signInState(env = process.env) {
  const dir = geminiDir(env);
  let type = null;
  try {
    const j = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    type = j?.security?.auth?.selectedType || j?.selectedAuthType || null;
  } catch { /* no settings yet */ }
  if (typeof type !== 'string' || !/^[a-z][a-z-]{1,40}$/.test(type)) type = null;
  let cached = false;
  try { cached = statSync(join(dir, 'oauth_creds.json')).isFile(); } catch { /* none */ }
  if (!type || type === 'oauth-personal') return { state: cached ? 'signed-in' : 'signed-out', method: 'oauth-personal', chosen: !!type, cached };
  return { state: 'signed-in', method: type, chosen: true, cached };
}

// The person's own sign-in: their environment and their ~/.gemini, as `gemini`
// in their terminal would have them, minus other vendors' keys. A key they
// chose: a home of y3kode's own, set up for the key, no usage telemetry.
// Either way: plain shell output, and no relaunch (so a stop really stops it).
export function envFor(base, { auth, apiKey, homeDir } = {}) {
  if (auth !== 'apiKey') return childEnv(base, { dropPattern: OTHER_KEYS, set: { GEMINI_CLI_NO_RELAUNCH: 'true' } });
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

export const SIGN_IN = 'Sign in to Gemini CLI first: run `gemini` in a terminal and sign in, then come back.';
// ACP's "sign in first" (RequestError.authRequired: -32000, "Authentication required").
const authNeeded = (err) => err?.code === -32000 && /auth/i.test(String(err?.message || ''));

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
  let signedInWith = null;

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
    // y3k's orb tool (orb.mjs): it moves the orb and nothing else — no question
    if (opts.orb && tc.rawInput && typeof tc.rawInput.kommand === 'string' && new RegExp(`\\b${opts.orb.name}\\b`, 'i').test(String(tc.title || '')) && /\borb\b/i.test(String(tc.title || ''))) {
      const once = (p.options || []).find((o) => o.kind === 'allow_once') || (p.options || []).find((o) => o.kind === 'allow_always');
      if (once) return { outcome: { outcome: 'selected', optionId: once.optionId } };
    }
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
      const offered = (init.authMethods || []).map((a) => a.id);
      if (apiKey) {
        if (!offered.includes('gemini-api-key')) throw new Error('This Gemini CLI does not offer API-key sign-in.');
        await rpc.request('authenticate', { methodId: 'gemini-api-key', _meta: { 'api-key': apiKey } });
      }
      // an agent that cannot reach MCP over HTTP is not handed any (the orb
      // tool, orb.mjs, is one): it would refuse the session over it
      const mcpServers = acpServers(opts.mcp).filter((x) => !x.url || (x.type === 'sse' ? init.agentCapabilities?.mcpCapabilities?.sse : init.agentCapabilities?.mcpCapabilities?.http));
      const open = () => (sessionId
        ? rpc.request('session/load', { sessionId, cwd, mcpServers })
        : rpc.request('session/new', { cwd, mcpServers }));
      let r;
      try { r = await open(); } catch (err) {
        if (apiKey || !authNeeded(err)) throw err;
        // The CLI could not sign in by itself. If their settings named a type,
        // that sign-in is what failed, and only they can redo it. If they named
        // none but a Google sign-in is cached here (settings from an older CLI,
        // say), sign in with exactly that and try once more — nothing else.
        const own = signInState(env);
        if (own.chosen || !own.cached || !offered.includes(own.method)) throw new Error(SIGN_IN);
        await rpc.request('authenticate', { methodId: own.method }, { timeout: 60000 });
        try { r = await open(); } catch (again) { throw authNeeded(again) ? new Error(SIGN_IN) : again; }
      }
      signedInWith = apiKey ? 'apiKey' : 'subscription';
      sessionId = r.sessionId || sessionId;
      if (MODE_TO[mode] !== (r.modes?.currentModeId || 'default')) await rpc.request('session/set_mode', { sessionId, modeId: MODE_TO[mode] }).catch(() => {});
      model = model || r.models?.currentModelId || null;
      emit({ type: 'session.ready', providerSessionId: sessionId, tools: [], mcp: mcpServers.map((s) => ({ name: s.name, status: 'configured' })), model, mode, cwd, version: init.agentInfo?.version || null, auth: signedInWith });
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
    if (!MODE_TO[m]) return { ok: false, error: m === 'auto' ? 'Gemini has no "auto" mode — only one that skips every permission, which y3kode never offers.' : 'unknown mode' };
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
