// OpenCode — the open-source coding agent — for the open models: OpenRouter,
// Kimi, DeepSeek, Qwen, GLM, Grok, Mistral, Groq, and models running on this
// computer with Ollama. It runs on the person's own OpenCode: whatever they
// added with `opencode auth login` (its own store, which y3kode never opens),
// plus any open-model key they gave y3kode, plus Ollama. Driven through
// `opencode serve` (HTTP + a server-sent event stream), pinned against 1.18.32
// (fixture: test/fixtures/code/opencode-1.18.32-turn.ndjson).
//
// How it is kept honest:
//   - one server per session, on 127.0.0.1, behind a random password — its own
//     config endpoints echo API keys, so nothing but this engine may reach it
//   - permissions come from OPENCODE_PERMISSION, which OpenCode applies LAST, so
//     a repository's own opencode.json cannot loosen them
//   - its free hosted provider is switched off, vendor keys that merely sit in
//     the environment are removed, and titles use the chosen model: nothing
//     goes to a provider the person did not choose
//   - modes: ask, plan, accept edits. OpenCode's only other setting approves
//     everything, which y3k Code never offers — so no "auto" here

import { randomBytes } from 'node:crypto';
import { spawnChild, stopChild, childEnv, resolveBin, run } from '../proc.mjs';
import { editPreview, writePreview, parseUnified, countChanges } from '../diff.mjs';
import { capOutput, resultText } from './base.mjs';

export const CAPS = Object.freeze({
  modes: ['ask', 'plan', 'acceptEdits'], permissionPrompts: true, questions: true, planApproval: false,
  todos: true, subagents: false, diffs: true, contextUsage: true, limits: false, cost: true, mcpLive: false,
  resume: true, fork: true, models: true, effort: false, images: true,
});
export const EFFORTS = [];

// y3k's names for the model providers → OpenCode's ids, and a sensible first model.
export const VIA = {
  openrouter: { id: 'openrouter', model: 'qwen/qwen3-coder-plus' },
  kimi: { id: 'moonshotai', model: 'kimi-k2.7-code' },
  deepseek: { id: 'deepseek', model: 'deepseek-v4-pro' },
  qwen: { id: 'alibaba-cn', model: 'qwen3-coder-plus' },
  glm: { id: 'zhipuai', model: 'glm-5.3' },
  xai: { id: 'xai', model: 'grok-4.7' },
  mistral: { id: 'mistral', model: 'devstral-small-2507' },
  groq: { id: 'groq', model: 'openai/gpt-oss-120b' },
};

const NOTHING = 'Add a key for one of OpenCode\'s providers (OpenRouter, Kimi, DeepSeek, Qwen, GLM, Grok, Mistral, Groq), sign in with `opencode auth login`, or start Ollama on this computer.';

// What each mode lets OpenCode do without asking. Frozen all the way down,
// and checked whole by test/code-opencode.test.mjs: one 'allow' in the wrong
// place would skip the person's say on that mode.
export const PERMISSION = Object.freeze({
  ask: Object.freeze({ edit: 'ask', bash: 'ask', webfetch: 'ask', websearch: 'ask', external_directory: 'ask' }),
  plan: Object.freeze({ edit: 'deny', bash: 'ask', webfetch: 'ask', websearch: 'ask', external_directory: 'ask' }),
  acceptEdits: Object.freeze({ edit: 'allow', bash: 'ask', webfetch: 'ask', websearch: 'ask', external_directory: 'ask' }),
});

const MODEL = /^[a-z0-9][a-z0-9._-]{0,40}\/[A-Za-z0-9._:/-]{1,120}$/;
const SESSION = /^ses_[A-Za-z0-9]{16,40}$/;
export const isModel = (s) => typeof s === 'string' && MODEL.test(s) && !s.includes('..');
export const isSessionId = (s) => typeof s === 'string' && SESSION.test(s);

export async function detect({ override, env } = {}) {
  const bin = resolveBin('opencode', { override, env });
  if (!bin) return { installed: false };
  const v = await run(bin, ['--version'], { env, timeout: 20000 });
  return { installed: v.code === 0, bin, version: (v.stdout.match(/\d+\.\d+\.\d+/) || [null])[0] };
}

// Has the person added anything to OpenCode's own store? `opencode auth list`
// prints each stored provider's name and kind, then "N credentials" — never a
// key — and only that count is kept. (With the environment's vendor keys
// removed, as for a session, its second list — keys from the environment —
// does not count.)
export async function authList(bin, env) {
  const r = await run(bin, ['auth', 'list'], { env: envFor(env), timeout: 20000 });
  const said = `${r.stdout}\n${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
  const m = /(\d+)\s+credentials?\b/i.exec(said);
  if (!m) return { state: 'unknown', method: null };
  const n = Number(m[1]);
  return { state: n > 0 ? 'signed-in' : 'signed-out', method: null, count: n };
}

const OTHER_KEYS = /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|CODEX_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|MOONSHOT_API_KEY|KIMI_API_KEY|XAI_API_KEY|MISTRAL_API_KEY|GROQ_API_KEY|DASHSCOPE_API_KEY|ZHIPU_API_KEY|OPENCODE_\w+)$/;
// Every vendor key in the person's environment is removed; the ones chosen are
// set by the adapter, under names only its config refers to.
export const envFor = (base) => childEnv(base, { dropPattern: OTHER_KEYS });

const KIND = { bash: 'bash', edit: 'edit', apply_patch: 'edit', write: 'write', read: 'read', glob: 'search', grep: 'search', list: 'search', webfetch: 'web', websearch: 'web', task: 'task', todowrite: 'todo', question: 'question' };
const kindOf = (tool) => KIND[tool] || (String(tool).startsWith('mcp') ? 'mcp' : 'other');
const RISK = { bash: 'exec', edit: 'write', write: 'write', web: 'network', mcp: 'mcp' };

function unified(diff) {
  if (!diff) return null;
  const files = parseUnified(/^diff --git /m.test(diff) ? diff : `diff --git a/x b/x\n${diff}`);
  return files.length ? files.map((f) => ({ ...f, ...countChanges(f.hunks) })) : null;
}

// OpenCode's event stream → protocol events, for one session. Pure: the
// adapter feeds it; the test feeds it a recording.
//
// A subagent (its task tool) runs in a session of its own on the same server.
// The server is this session's alone (one per y3k session, behind its own
// password), so any other session on it is one of its subagents. A subagent's
// asks are the person's to answer like any other; its words and tools go
// inside the Task card that started it; and its idle, its errors and its usage
// never end, fail or measure the turn.
export function createMapper({ emit, cwd = '', sessionId = null, modelLimit = null } = {}) {
  const msgs = new Map();   // messageID → { started, ended, blocks }
  const parts = new Map();  // partID → { messageID, block, kind }
  const tools = new Map();  // callID → { announced, preview, kind }
  const under = new Map();  // a subagent's sessionID → the task call it runs in
  let aborted = false;
  let failed = null;
  let cost = 0;

  const msg = (id, parentCallId = null) => {
    if (!msgs.has(id)) { msgs.set(id, { started: true, ended: false, blocks: 0 }); emit({ type: 'message.start', id, model: null, parentCallId }); }
    return msgs.get(id);
  };
  const part = (p, parentCallId = null) => {
    if (!parts.has(p.id)) parts.set(p.id, { messageID: p.messageID, block: msg(p.messageID, parentCallId).blocks++, kind: p.type === 'reasoning' ? 'thinking' : 'text' });
    return parts.get(p.id);
  };

  function toolPart(p, parentCallId = null) {
    const st = p.state || {};
    const kind = kindOf(p.tool);
    const input = st.input || {};
    // the task tool names its subagent's session before the subagent starts
    if (p.tool === 'task' && typeof st.metadata?.sessionId === 'string') under.set(st.metadata.sessionId, p.callID);
    let t = tools.get(p.callID);
    if (!t && (st.status === 'running' || st.status === 'completed' || st.status === 'error') && Object.keys(input).length) {
      let preview = {};
      try {
        if (p.tool === 'edit') preview = { path: input.filePath, diff: [editPreview(input.filePath, input.oldString, input.newString, !!input.replaceAll)].filter(Boolean) };
        else if (p.tool === 'write') preview = { path: input.filePath, diff: [writePreview(input.filePath, input.content)] };
        else if (kind === 'bash') preview = { command: input.command, cwd: input.workdir || cwd, description: input.description || null };
        else if (kind === 'web') preview = { url: input.url || null, query: input.query || null };
      } catch { preview = {}; }
      t = { announced: true, preview, kind };
      tools.set(p.callID, t);
      const title = kind === 'bash' ? (input.description || input.command) : input.filePath || input.pattern || input.url || input.description || st.title || p.tool;
      emit({ type: 'tool.call', callId: p.callID, messageId: p.messageID, parentCallId, name: p.tool, kind, title: String(title || '').slice(0, 200), input, preview });
    }
    if (!t) return;
    if (st.status === 'running' && kind === 'bash' && st.metadata?.output) emit({ type: 'tool.progress', callId: p.callID, text: String(st.metadata.output).slice(-2000) });
    if (st.status === 'completed') {
      const diff = unified(st.metadata?.filediff?.patch || st.metadata?.diff) || (p.tool === 'write' ? t.preview.diff : null);
      emit({ type: 'tool.result', callId: p.callID, status: 'ok', output: capOutput(resultText(st.output ?? '')), diff: diff || null, exitCode: typeof st.metadata?.exit === 'number' ? st.metadata.exit : null });
      if (diff) emit({ type: 'files.changed', paths: diff.map((d) => d.path).filter(Boolean) });
    } else if (st.status === 'error') {
      emit({ type: 'tool.result', callId: p.callID, status: /rejected permission|denied/i.test(st.error || '') ? 'denied' : 'error', output: capOutput(String(st.error || '')), diff: null, exitCode: null });
    }
  }

  function handle(e) {
    const p = e?.properties || {};
    const sid = p.sessionID || p.info?.sessionID || p.part?.sessionID || null;
    const sub = !!(sessionId && sid && sid !== sessionId);
    const parentCallId = sub ? under.get(sid) || null : null;
    switch (e?.type) {
      case 'message.updated': {
        const info = p.info || {};
        if (info.role !== 'assistant') return;
        const m = msg(info.id, parentCallId);
        if (info.time?.completed && !m.ended) {
          m.ended = true;
          const tk = info.tokens || {};
          const input = (tk.input | 0) + (tk.cache?.read | 0);
          const output = (tk.output | 0) + (tk.reasoning | 0);
          emit({ type: 'message.end', id: info.id, stopReason: info.finish || null });
          if (!sub) emit({ type: 'usage.turn', inputTokens: input, outputTokens: output, cacheRead: tk.cache?.read | 0, cacheWrite: tk.cache?.write | 0, costUsd: info.cost ?? null, durationMs: 0, model: `${info.providerID}/${info.modelID}` });
          if (!sub && modelLimit && input + output) emit({ type: 'usage.context', used: input + output, limit: modelLimit, percent: Math.round((100 * (input + output)) / modelLimit), source: 'context' });
          // what a subagent spends is the session's spend too
          if (typeof info.cost === 'number') { cost += info.cost; emit({ type: 'usage.cost', totalUsd: cost, apiEquivalent: false }); }
          if (sub) return;
          if (info.error?.name === 'MessageAbortedError') aborted = true;
          else if (info.error) failed = info.error.data?.message || info.error.message || info.error.name;
        }
        return;
      }
      case 'message.part.updated': {
        const pt = p.part || {};
        if (pt.type === 'text' || pt.type === 'reasoning') {
          if (pt.synthetic || pt.ignored) return;
          const rec = part(pt, parentCallId);
          if (pt.time?.end) emit({ type: 'message.block', id: pt.messageID, block: rec.block, kind: rec.kind, text: pt.text || '', parentCallId });
          return;
        }
        if (pt.type === 'tool') return toolPart(pt, parentCallId);
        if (pt.type === 'patch') { if (pt.files?.length) emit({ type: 'files.changed', paths: pt.files }); return; }
        if (pt.type === 'retry') { emit({ type: 'notice', level: 'info', code: 'retry', text: `Retrying (${pt.attempt}): ${String(pt.error?.data?.message || '').slice(0, 160)}` }); return; }
        return;
      }
      case 'message.part.delta': {
        if (p.field && p.field !== 'text') return;
        const rec = parts.get(p.partID) || part({ id: p.partID, messageID: p.messageID, type: 'text' }, parentCallId);
        emit({ type: 'message.delta', id: p.messageID, block: rec.block, kind: rec.kind, text: p.delta || '' });
        return;
      }
      case 'permission.asked': {
        const kind = p.permission === 'edit' ? 'edit' : p.permission === 'bash' ? 'bash' : /web/.test(p.permission) ? 'web' : 'other';
        const md = p.metadata || {};
        const diff = kind === 'edit' ? unified(md.diff) : null;
        emit({
          type: 'permission.request', requestId: p.id, callId: p.tool?.callID || null, tool: p.permission, kind, title: (p.patterns || []).join(', '),
          input: md, risk: RISK[kind] || 'read', reason: null,
          preview: kind === 'edit' ? { path: md.filepath, diff: diff || [] } : kind === 'bash' ? { command: md.command || (p.patterns || [])[0], cwd } : kind === 'web' ? { url: (p.patterns || [])[0] } : {},
          suggestions: (p.always || []).length ? [{ label: `Always allow ${p.always.join(', ')}`, scope: 'always' }] : [],
        });
        return;
      }
      case 'permission.replied':
        emit({ type: 'permission.resolved', requestId: p.requestID, decision: p.reply === 'reject' ? 'deny' : 'allow', scope: p.reply === 'always' ? 'always' : 'once', by: 'agent' });
        return;
      case 'question.asked':
        emit({ type: 'question.request', requestId: p.id, callId: null, questions: (p.questions || []).map((q) => ({ header: q.header || '', question: q.question, multiSelect: !!q.multiple, options: (q.options || []).map((o) => ({ label: o.label, description: o.description || '' })) })) });
        return;
      case 'todo.updated':
        if (sub) return; // the list is the session's own
        emit({ type: 'todo.update', items: (p.todos || []).map((t) => ({ text: t.content, status: t.status === 'cancelled' ? 'completed' : t.status, activeForm: null })) });
        return;
      case 'session.status':
        if (sub) return;
        if (p.status?.type === 'retry') emit({ type: 'notice', level: 'info', code: 'retry', text: `Retrying (${p.status.attempt}): ${String(p.status.message || '').slice(0, 160)}` });
        return;
      case 'session.error':
        if (sub) return;
        if (p.error?.name === 'MessageAbortedError') aborted = true;
        else failed = p.error?.data?.message || p.error?.message || p.error?.name || 'OpenCode reported an error.';
        return;
      case 'session.idle': {
        if (sub) return;
        for (const [id, m] of msgs) if (!m.ended) { m.ended = true; emit({ type: 'message.end', id, stopReason: null }); }
        emit({ type: 'turn.ended', turnId: null, status: aborted ? 'interrupted' : failed ? 'error' : 'success', error: failed ? String(failed).slice(0, 300) : null });
        aborted = false;
        failed = null;
        return;
      }
      default: return;
    }
  }
  return { handle, setLimit: (n) => { modelLimit = n; }, setSession: (id) => { sessionId = id || null; } };
}

// --- the server ------------------------------------------------------------------

// Ollama on this computer (Y3K_OLLAMA_URL for another port — loopback only).
const ollamaBase = (env) => {
  const u = String(env?.Y3K_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  return /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(u) ? u : 'http://127.0.0.1:11434';
};

export async function ollamaModels(env) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 700);
    const r = await fetch(`${ollamaBase(env)}/api/tags`, { signal: ac.signal });
    clearTimeout(t);
    const j = await r.json();
    return (j.models || []).map((m) => m.name).filter((n) => typeof n === 'string' && /^[\w.:/-]{1,120}$/.test(n));
  } catch { return []; }
}

export function createAdapter({ sid, cwd, emit, audit, bin, env, opts = {}, provider = 'opencode' }) {
  let mode = PERMISSION[opts.mode] ? opts.mode : 'ask';
  let model = opts.model || null;
  let child = null;
  let base = null;
  let auth = null;
  let sessionId = null;
  let state = 'idle';
  let ended = false;
  let stopping = false;
  let events = null;
  let restarting = false;          // a mode change restarts the server; that exit is not the session's end
  let usingKeys = false;           // open-model keys from y3kode, rather than only OpenCode's own store
  const password = randomBytes(24).toString('base64url');
  const mapper = createMapper({ emit: (e) => { if (e.type === 'turn.ended') setState('idle'); emit(e); }, cwd });
  const pending = new Set(); // permission/question ids waiting on the person

  const setState = (s) => { if (s !== state) { state = s; emit({ type: 'session.state', state: s }); } };
  const q = (path) => `${base}${path}${path.includes('?') ? '&' : '?'}directory=${encodeURIComponent(cwd)}`;
  async function api(method, path, body) {
    const r = await fetch(q(path), { method, headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!r.ok) throw new Error(j?.data?.message || j?.message || j?.name || `OpenCode answered ${r.status}`);
    return j;
  }

  function config(ids, ollama, chosen) {
    const ollamaUrl = `${ollamaBase(env)}/v1`;
    // No `enabled_providers`: what the person added with `opencode auth login`
    // is theirs to use here too. Only OpenCode's own hosted provider is off.
    const cfg = { $schema: 'https://opencode.ai/config.json', ...(chosen ? { model: chosen, small_model: chosen } : {}), disabled_providers: ['opencode'], provider: {}, share: 'disabled', autoupdate: false };
    for (const id of ids) cfg.provider[id] = { options: { apiKey: `{env:Y3K_KEY_${id.replace(/\W/g, '_').toUpperCase()}}` } };
    if (ollama.length) {
      cfg.provider.ollama = { npm: '@ai-sdk/openai-compatible', name: 'Ollama (this computer)', options: { baseURL: ollamaUrl },
        models: Object.fromEntries(ollama.map((m) => [m, { name: m, tool_call: true, cost: { input: 0, output: 0 }, limit: { context: 32768, output: 8192 } }])) };
    }
    // y3k's orb tool (orb.mjs), beside whatever MCP servers their own config has
    if (opts.orb?.url) cfg.mcp = { [opts.orb.name]: { type: 'remote', url: opts.orb.url, headers: opts.orb.headers || {}, enabled: true } };
    return cfg;
  }

  async function serve() {
    const keys = opts.viaKeys || {};
    const ids = Object.keys(keys).filter((k) => VIA[k]).map((k) => VIA[k].id);
    const ollama = await ollamaModels(env);
    if (!ids.length && !ollama.length && opts.ownAuth === false) throw new Error(NOTHING);
    usingKeys = ids.length > 0;
    if (!model) {
      const first = Object.keys(keys).find((k) => VIA[k]);
      model = first ? `${VIA[first].id}/${VIA[first].model}` : ollama.length ? `ollama/${ollama[0]}` : null;
    }
    const set = {
      OPENCODE_SERVER_PASSWORD: password, OPENCODE_CONFIG_CONTENT: JSON.stringify(config(ids, ollama, model)),
      OPENCODE_PERMISSION: JSON.stringify(PERMISSION[mode]), OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_SHARE: 'true',
    };
    for (const [k, v] of Object.entries(keys)) if (VIA[k]) set[`Y3K_KEY_${VIA[k].id.replace(/\W/g, '_').toUpperCase()}`] = v;
    const args = ['serve', '--hostname', '127.0.0.1', '--port', '0'];
    audit?.write('session.spawn', { sid, provider, cwd, args, providers: ids, ollama: ollama.length, model, mode });
    child = spawnChild(bin, args, { cwd, env: { ...env, ...set } });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 8000) stderr += d; });
    child.on('error', (err) => finish(err.code === 'ENOENT' ? 'not-installed' : 'spawn-error', null, String(err.message || err)));
    child.on('exit', (code, signal) => { if (!restarting) finish(stopping ? 'stopped' : code === 0 ? 'exited' : 'crashed', code ?? signal, stopping ? null : stderr.trim().slice(-1000)); });
    base = await new Promise((resolve, reject) => {
      let out = '';
      const t = setTimeout(() => reject(new Error('OpenCode did not start.')), 45000);
      child.stdout.setEncoding('utf8').on('data', (d) => {
        out += d;
        const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
        if (m) { clearTimeout(t); resolve(m[1]); }
      });
      child.once('exit', () => { clearTimeout(t); reject(new Error(stderr.trim().split('\n').pop() || 'OpenCode stopped while starting.')); });
    });
    auth = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
    listen();
  }

  // The event stream, reconnected while the session lives.
  function listen() {
    const ac = new AbortController();
    events = ac;
    (async () => {
      while (!ended && events === ac) {
        try {
          const r = await fetch(q('/event'), { headers: { authorization: auth }, signal: ac.signal });
          const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line.startsWith('data:')) continue;
              let e;
              try { e = JSON.parse(line.slice(5)); } catch { continue; }
              // a subagent's ask too (see createMapper): it waits on the person all the same
              if (e.type === 'permission.asked' || e.type === 'question.asked') { if (e.properties?.id) { pending.add(e.properties.id); setState('waiting'); } }
              if (e.type === 'permission.replied') pending.delete(e.properties?.requestID);
              if (e.type === 'session.status' && e.properties?.sessionID === sessionId && e.properties.status?.type === 'busy' && state !== 'waiting') setState('running');
              mapper.handle(e);
            }
          }
        } catch { /* dropped — retry */ }
        if (!ended && events === ac) await new Promise((r) => setTimeout(r, 500));
      }
    })();
  }

  async function start() {
    emit({ type: 'session.started', provider, cwd, model, effort: null, mode, providerSessionId: opts.resumeId || null, resumeOf: opts.resumeId || null, forkOf: opts.fork ? opts.resumeId : null, title: opts.title || null });
    try {
      await serve();
      const cat = await api('GET', '/config/providers').catch(() => null);
      // Nothing chosen here (no open-model key, no Ollama): the person's own
      // OpenCode decides — their configured model, else the first provider in
      // their store with its default model.
      if (!model) {
        const own = await api('GET', '/config').catch(() => null);
        const first = cat?.providers?.find((p) => p.id !== 'opencode');
        const def = first && cat?.default?.[first.id];
        model = typeof own?.model === 'string' && isModel(own.model) ? own.model : def ? `${first.id}/${def}` : null;
        if (!model || !isModel(model)) throw new Error(NOTHING);
      }
      const [pid, ...rest] = model.split('/');
      const found = cat?.providers?.find((p) => p.id === pid)?.models?.[rest.join('/')];
      if (cat && !found) {
        const prov = cat.providers?.find((p) => p.id === pid);
        const alt = prov && Object.values(prov.models || {}).find((m) => m.capabilities?.toolcall !== false);
        if (alt) { emit({ type: 'notice', level: 'info', text: `${model} is not offered; using ${pid}/${alt.id}.` }); model = `${pid}/${alt.id}`; }
      }
      const limit = (found || cat?.providers?.find((p) => p.id === model.split('/')[0])?.models?.[model.split('/').slice(1).join('/')])?.limit?.context || null;
      mapper.setLimit(limit);
      emit({ type: 'provider.status', provider, models: (cat?.providers || []).flatMap((p) => Object.values(p.models || {}).filter((m) => m.capabilities?.toolcall !== false && m.status !== 'deprecated').slice(0, 30).map((m) => ({ id: `${p.id}/${m.id}`, label: `${p.name || p.id} · ${m.name || m.id}`, description: '', efforts: [] }))) });
      let s;
      if (opts.resumeId && opts.fork) s = await api('POST', `/session/${opts.resumeId}/fork`, {});
      else if (opts.resumeId) s = await api('GET', `/session/${opts.resumeId}`);
      else s = await api('POST', '/session', { title: opts.name || 'y3kode' });
      sessionId = s.id;
      mapper.setSession(sessionId);
      emit({ type: 'session.ready', providerSessionId: sessionId, tools: [], mcp: [], model, mode, cwd, version: null, auth: usingKeys ? 'apiKey' : 'subscription' });
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
    events?.abort();
    for (const id of pending) emit({ type: 'permission.resolved', requestId: id, decision: 'cancelled', by: 'cancelled' });
    pending.clear();
    setState('ended');
    emit({ type: 'session.ended', reason, exitCode: exitCode ?? null, detail: detail || null });
    audit?.write('session.ended', { sid, reason, exitCode });
  }

  function send({ text, attachments = [] }) {
    if (ended || !sessionId) return { ok: false, error: 'This session is not ready.' };
    const parts = [{ type: 'text', text }];
    for (const a of attachments || []) if (a?.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(a.mediaType)) parts.push({ type: 'file', mime: a.mediaType, filename: 'image', url: `data:${a.mediaType};base64,${a.data}` });
    const [providerID, ...rest] = model.split('/');
    emit({ type: 'turn.started', turnId: null });
    setState('running');
    api('POST', `/session/${sessionId}/prompt_async`, { parts, model: { providerID, modelID: rest.join('/') }, agent: mode === 'plan' ? 'plan' : 'build' })
      .catch((err) => { emit({ type: 'turn.ended', turnId: null, status: 'error', error: String(err?.message || err).slice(0, 300) }); setState('idle'); });
    return { ok: true };
  }

  async function interrupt() {
    try { await api('POST', `/session/${sessionId}/abort`); audit?.write('session.interrupt', { sid, ok: true }); return { ok: true }; } catch (err) { return { ok: false, error: String(err?.message || err) }; }
  }

  function stop() {
    stopping = true;
    events?.abort();
    if (!child) { finish('stopped', null, null); return { ok: true }; }
    stopChild(child, 5000);
    return { ok: true };
  }

  // Permissions are fixed when the server starts (that is what keeps a repo
  // from loosening them), so a new mode is a quick restart onto the same session.
  async function setMode(m) {
    if (!PERMISSION[m]) return { ok: false, error: m === 'auto' ? 'OpenCode has no "auto" mode — only one that approves everything, which y3kode never offers.' : 'unknown mode' };
    if (state === 'running' || state === 'waiting') return { ok: false, error: 'Change the mode between turns.' };
    mode = m;
    restarting = true;
    const old = child;
    events?.abort();
    await new Promise((r) => { old.once('exit', r); stopChild(old, 3000); });
    restarting = false;
    try {
      await serve();
      await api('GET', `/session/${sessionId}`);
    } catch (err) { finish('crashed', null, String(err?.message || err)); return { ok: false, error: String(err?.message || err) }; }
    emit({ type: 'mode.changed', mode });
    audit?.write('mode.set', { sid, mode: m, ok: true });
    return { ok: true };
  }

  async function setModel(mdl) {
    if (!isModel(mdl)) return { ok: false, error: 'unknown model' };
    model = mdl;
    emit({ type: 'model.changed', model: mdl });
    return { ok: true };
  }

  async function answerPermission({ requestId, decision, scope, message }) {
    if (!pending.has(requestId)) return { ok: false, error: 'That request is no longer waiting.' };
    const reply = decision !== 'allow' ? 'reject' : scope === 'always' || scope === 'session' ? 'always' : 'once';
    try {
      // a reason keeps the agent going (without one, OpenCode stops the turn)
      await api('POST', `/permission/${requestId}/reply`, { reply, ...(reply === 'reject' ? { message: message || 'The person declined this.' } : {}) });
    } catch (err) { return { ok: false, error: String(err?.message || err) }; }
    pending.delete(requestId);
    audit?.write('permission', { sid, tool: 'opencode', decision, scope: scope || 'once' });
    if (!pending.size && state === 'waiting') setState('running');
    return { ok: true };
  }

  async function answerQuestion({ requestId, answers }) {
    if (!pending.has(requestId)) return { ok: false, error: 'That question is no longer waiting.' };
    try { await api('POST', `/question/${requestId}/reply`, { answers: Object.values(answers).map((a) => String(a).split(', ')) }); } catch (err) { return { ok: false, error: String(err?.message || err) }; }
    pending.delete(requestId);
    emit({ type: 'question.resolved', requestId, answers });
    if (!pending.size && state === 'waiting') setState('running');
    return { ok: true };
  }

  const unsupported = async () => ({ ok: false, error: 'OpenCode does not offer that here.' });
  return {
    caps: CAPS, start, send, interrupt, stop, setMode, setModel, setEffort: unsupported, answerPermission, answerQuestion,
    contextUsage: async () => ({ ok: true }), limits: async () => ({ ok: true }), mcpToggle: unsupported, mcpReconnect: unsupported,
    get state() { return state; }, get providerSessionId() { return sessionId; },
  };
}
