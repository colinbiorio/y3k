// What the Code screen knows, built only from the engine's events. `apply()`
// folds one event in and says what changed, so the view redraws just those
// items — a long session is thousands of events and must not re-render whole.
//
// No DOM here: test/code-client.test.mjs replays recorded sessions through it.

export function createState() {
  return {
    conn: 'off',          // off | connecting | connected | reconnecting | unpaired | offline
    epoch: null, seq: 0,
    providers: [], recent: [], models: {},
    consent: new Map(),   // id → { kind, text } while the person is being asked on their computer
    sessions: new Map(),  // sid → session
    order: [],            // sids, newest last
    active: null,
    notices: [],
  };
}

function newSession(sid, e = {}) {
  return {
    sid, provider: e.provider || 'claude', cwd: e.cwd || '', title: e.title || null,
    mode: e.mode || null, model: e.model || null, effort: e.effort || null,
    state: 'starting', ended: null, version: null, providerSessionId: e.providerSessionId || null,
    items: [],            // top-level transcript items, in order
    byKey: new Map(),     // 'm:<id>' | 't:<callId>' | 'p:<requestId>' → item
    todos: [], agents: new Map(), files: [], mcp: [], tools: [],
    usage: { context: null, limits: null, cost: null, lastTurn: null, turns: 0 },
    waiting: 0,           // permission/question/plan cards open
    unread: false,
  };
}

let itemNo = 0;
const item = (kind, fields) => ({ uid: ++itemNo, kind, ...fields });

// Put an item where it belongs: inside the subagent that produced it, or at the top.
function place(s, it, parentCallId) {
  const parent = parentCallId ? s.byKey.get('t:' + parentCallId) : null;
  if (parent) { (parent.children ||= []).push(it); it.parentUid = parent.uid; return parent; }
  s.items.push(it);
  return null;
}

// → { sid, changed: [items], meta: bool, engine: bool }
// `replay`: events reloaded from the engine's disk for one session — they carry
// old sequence numbers and must not move the live stream's position.
export function apply(S, e, { replay = false } = {}) {
  const out = { sid: e.sid || null, changed: [], meta: false, engine: false };
  if (!replay) {
    if (typeof e.seq === 'number') { if (e.seq <= S.seq && e.epoch === S.epoch) return out; S.seq = e.seq; }
    if (e.epoch) S.epoch = e.epoch;
  }
  const touch = (...its) => { for (const it of its) if (it && !out.changed.includes(it)) out.changed.push(it); };

  // --- engine-wide ------------------------------------------------------------
  switch (e.type) {
    case 'engine.hello': out.engine = true; return out;
    case 'provider.status':
      if (Array.isArray(e.providers)) S.providers = e.providers;
      if (e.provider && Array.isArray(e.models)) S.models = { ...S.models, [e.provider]: e.models };
      out.engine = true;
      return out;
    case 'workspace.recent': S.recent = e.folders || []; out.engine = true; return out;
    case 'consent.pending': S.consent.set(e.id, { kind: e.kind, text: e.text }); out.engine = true; return out;
    case 'consent.resolved': S.consent.delete(e.id); out.engine = true; return out;
    default: break;
  }
  if (!e.sid) {
    if (e.type === 'notice' || e.type === 'error') { S.notices.push({ level: e.level || 'error', text: e.text || e.error || '' }); S.notices = S.notices.slice(-20); out.engine = true; }
    return out;
  }

  let s = S.sessions.get(e.sid);
  if (!s) {
    s = newSession(e.sid, e);
    S.sessions.set(e.sid, s);
    S.order.push(e.sid);
    out.meta = true;
  }

  switch (e.type) {
    case 'session.started':
      Object.assign(s, { provider: e.provider, cwd: e.cwd, mode: e.mode || s.mode, model: e.model || s.model, effort: e.effort || s.effort, providerSessionId: e.providerSessionId || s.providerSessionId, title: e.title || s.title });
      out.meta = true;
      break;
    case 'session.ready':
      Object.assign(s, { version: e.version, model: e.model || s.model, mode: e.mode || s.mode, tools: e.tools || [], providerSessionId: e.providerSessionId || s.providerSessionId });
      if (e.mcp) s.mcp = e.mcp;
      out.meta = true;
      break;
    case 'session.state': s.state = e.state; out.meta = true; break;
    case 'session.title': s.title = e.title; out.meta = true; break;
    case 'session.ended': {
      s.ended = { reason: e.reason, detail: e.detail || null };
      s.state = 'ended';
      // anything still asking can no longer be answered
      for (const it of s.byKey.values()) if (/^(permission|question|plan)$/.test(it.kind) && !it.resolved) { it.resolved = 'cancelled'; touch(it); }
      for (const it of s.byKey.values()) if (it.kind === 'tool' && it.status === 'running') { it.status = 'stopped'; touch(it); }
      s.waiting = 0;
      if (e.reason && !/^(exited|stopped)$/.test(e.reason)) {
        const n = item('notice', { level: 'error', text: e.reason === 'not-installed' ? 'The coding tool is not installed on this computer.' : `The session ended (${e.reason})${e.detail ? ': ' + String(e.detail).split('\n').slice(-3).join(' ') : ''}` });
        s.items.push(n); touch(n);
      }
      out.meta = true;
      break;
    }

    case 'turn.started': s.state = 'running'; out.meta = true; break;
    case 'turn.ended': {
      s.usage.turns++;
      for (const it of s.byKey.values()) if (it.kind === 'assistant' && !it.done) { it.done = true; touch(it); }
      if (e.status !== 'success') {
        const n = item('turn-end', { status: e.status, error: e.error || null });
        s.items.push(n); touch(n);
      }
      if (s.state !== 'ended') s.state = 'idle';
      out.meta = true;
      break;
    }

    case 'message.user': {
      const it = item('user', { text: e.text, images: e.images || 0, withNote: !!e.withNote });
      s.items.push(it); touch(it);
      break;
    }
    case 'message.start': {
      let it = s.byKey.get('m:' + e.id);
      if (!it) {
        it = item('assistant', { id: e.id, model: e.model || null, blocks: [], done: false });
        s.byKey.set('m:' + e.id, it);
        touch(place(s, it, e.parentCallId));
      }
      touch(it);
      break;
    }
    case 'message.delta': case 'message.block': {
      let it = s.byKey.get('m:' + e.id);
      if (!it) {
        it = item('assistant', { id: e.id, model: null, blocks: [], done: false });
        s.byKey.set('m:' + e.id, it);
        touch(place(s, it, e.parentCallId));
      }
      const i = e.block | 0;
      let b = it.blocks.find((x) => x.i === i);
      if (!b) { b = { i, kind: e.kind, text: '', done: false }; it.blocks.push(b); it.blocks.sort((a, c) => a.i - c.i); }
      if (e.type === 'message.delta') b.text += e.text || '';
      else { b.text = e.text || b.text; b.done = true; b.kind = e.kind; }
      touch(it);
      break;
    }
    case 'message.end': {
      const it = s.byKey.get('m:' + e.id);
      if (it) { it.done = true; for (const b of it.blocks) b.done = true; touch(it); }
      break;
    }

    case 'tool.call': {
      let it = s.byKey.get('t:' + e.callId);
      if (!it) {
        it = item('tool', { callId: e.callId, name: e.name, tkind: e.kind, title: e.title, input: e.input, preview: e.preview || {}, status: 'running', output: null, diff: null, children: [], at: e.t || Date.now() });
        s.byKey.set('t:' + e.callId, it);
        touch(place(s, it, e.parentCallId));
      }
      touch(it);
      break;
    }
    case 'tool.progress': {
      const it = s.byKey.get('t:' + e.callId);
      if (it) { it.progress = e.text; touch(it); }
      break;
    }
    case 'tool.result': {
      const it = s.byKey.get('t:' + e.callId);
      if (it) {
        Object.assign(it, { status: e.status, output: e.output || null, diff: e.diff || it.diff, exitCode: e.exitCode ?? null, ms: e.t && it.at ? e.t - it.at : null });
        touch(it);
      }
      break;
    }

    case 'permission.request': {
      const it = item('permission', { requestId: e.requestId, callId: e.callId, tool: e.tool, tkind: e.kind, title: e.title, input: e.input, preview: e.preview || {}, suggestions: e.suggestions || [], risk: e.risk, reason: e.reason || null, resolved: null });
      s.byKey.set('p:' + e.requestId, it);
      const tool = e.callId ? s.byKey.get('t:' + e.callId) : null;
      touch(place(s, it, tool?.parentUid ? findCallOf(s, tool.parentUid) : null));
      if (tool) { tool.status = 'waiting'; touch(tool); }
      s.waiting++;
      touch(it);
      out.meta = true;
      break;
    }
    case 'permission.resolved': {
      const it = s.byKey.get('p:' + e.requestId);
      if (it && !it.resolved) {
        it.resolved = e.decision; it.scope = e.scope || 'once';
        s.waiting = Math.max(0, s.waiting - 1);
        const tool = it.callId ? s.byKey.get('t:' + it.callId) : null;
        if (tool && tool.status === 'waiting') { tool.status = e.decision === 'allow' ? 'running' : 'denied'; touch(tool); }
        touch(it);
        out.meta = true;
      }
      break;
    }
    case 'question.request': {
      const it = item('question', { requestId: e.requestId, callId: e.callId, questions: e.questions || [], resolved: null, answers: null });
      s.byKey.set('p:' + e.requestId, it);
      s.items.push(it); s.waiting++; touch(it); out.meta = true;
      break;
    }
    case 'question.resolved': {
      const it = s.byKey.get('p:' + e.requestId);
      if (it && !it.resolved) { it.resolved = 'answered'; it.answers = e.answers; s.waiting = Math.max(0, s.waiting - 1); touch(it); out.meta = true; }
      break;
    }
    case 'plan.proposed': {
      const it = item('plan', { requestId: e.requestId, callId: e.callId, plan: e.plan || '', resolved: null });
      s.byKey.set('p:' + e.requestId, it);
      s.items.push(it); s.waiting++; touch(it); out.meta = true;
      break;
    }

    case 'todo.update': s.todos = e.items || []; out.meta = true; break;
    case 'subagent.started': {
      s.agents.set(e.taskId, { taskId: e.taskId, callId: e.callId, description: e.description, agentType: e.agentType, status: 'running', text: '' });
      const t = e.callId && s.byKey.get('t:' + e.callId);
      if (t) { t.agent = s.agents.get(e.taskId); touch(t); }
      out.meta = true;
      break;
    }
    case 'subagent.progress': { const a = s.agents.get(e.taskId); if (a) { a.text = e.text; out.meta = true; } break; }
    case 'subagent.ended': {
      const a = s.agents.get(e.taskId);
      if (a) { a.status = e.status; a.summary = e.summary; const t = a.callId && s.byKey.get('t:' + a.callId); if (t) touch(t); }
      out.meta = true;
      break;
    }

    case 'usage.context': s.usage.context = { used: e.used, limit: e.limit, percent: e.percent ?? (e.used && e.limit ? Math.round((100 * e.used) / e.limit) : null), breakdown: e.breakdown || null }; out.meta = true; break;
    case 'usage.limits': s.usage.limits = { status: e.status, windows: e.windows || [] }; out.meta = true; break;
    case 'usage.cost': s.usage.cost = { totalUsd: e.totalUsd, apiEquivalent: !!e.apiEquivalent }; out.meta = true; break;
    case 'usage.turn': s.usage.lastTurn = e; out.meta = true; break;

    case 'mode.changed': s.mode = e.mode; out.meta = true; break;
    case 'model.changed': s.model = e.model; out.meta = true; break;
    case 'effort.changed': s.effort = e.effort; out.meta = true; break;
    case 'mcp.status': s.mcp = e.servers || []; out.meta = true; break;
    case 'files.changed': s.files = e.paths || []; out.meta = true; break;
    case 'compact': { const it = item('compact', { trigger: e.trigger, preTokens: e.preTokens }); s.items.push(it); touch(it); break; }
    case 'notice': case 'error': {
      const it = item('notice', { level: e.level || (e.type === 'error' ? 'error' : 'info'), text: e.text || e.error || '' });
      s.items.push(it); touch(it);
      break;
    }
    default: break;
  }
  if (out.changed.length && S.active !== s.sid) s.unread = true;
  return out;
}

function findCallOf(s, uid) {
  for (const [k, v] of s.byKey) if (v.uid === uid && k.startsWith('t:')) return v.callId;
  return null;
}

// --- selectors ----------------------------------------------------------------
export const activeSession = (S) => (S.active ? S.sessions.get(S.active) : null);
export const needsYou = (S) => [...S.sessions.values()].some((s) => s.waiting > 0);
export const liveSessions = (S) => [...S.sessions.values()].filter((s) => s.state !== 'ended');

// The open card the keyboard answers: the newest unanswered one.
export function openRequest(s) {
  if (!s) return null;
  let found = null;
  for (const it of s.byKey.values()) if (/^(permission|question|plan)$/.test(it.kind) && !it.resolved) found = it;
  return found;
}

export function limitLabel(kind) {
  return kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'weekly' : kind === 'seven_day_opus' ? 'weekly Opus' : kind === 'seven_day_sonnet' ? 'weekly Sonnet' : kind.replace(/_/g, ' ');
}

export function shortPath(p, home) {
  if (!p) return '';
  const s = home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
  return s;
}
