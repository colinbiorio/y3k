// What the Code screen knows, built only from the engine's events. `apply()`
// folds one event in and says what changed, so the view redraws just those
// items — a long session is thousands of events and must not re-render whole.
//
// No DOM here: test/code-client.test.mjs replays recorded sessions through it.

export function createState() {
  return {
    conn: 'off',          // off | connecting | connected | reconnecting | unpaired | offline
    epoch: null, seq: 0,
    providers: [], recent: [], models: {}, commands: {},
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
    turn: null,           // the turn under way (openTurn), until it ends
  };
}

let itemNo = 0;
const item = (kind, fields) => ({ uid: ++itemNo, kind, ...fields });
// an item the view makes itself (the line between a conversation and the one it continues)
export const localItem = (kind, fields) => item(kind, fields);

// Put an item where it belongs: inside the subagent that produced it, or at the top.
// The Task card it lands in is NOT marked changed: the view adds the new item to
// that card's list of children itself. Marking the card redrew the whole card —
// every child's markdown, every Read's coloured output — once per frame for as
// long as a subagent was writing.
function place(s, it, parentCallId) {
  const parent = parentCallId ? s.byKey.get('t:' + parentCallId) : null;
  if (parent) { (parent.children ||= []).push(it); it.parentUid = parent.uid; return parent; }
  s.items.push(it);
  return null;
}

// THE TURN UNDER WAY (2026-10-08). The view draws its line while it works
// (code-view.js workLine) and items.js its summary when it lands, from what
// the tools already say and nothing else: the files each edit's diff touched,
// the tokens and the time in `usage.turn`, and the session's running cost
// before and after. Events read back from the engine's file carry no times,
// so a reloaded turn has the tool's own duration or none.
// `mark`: the newest item when it began; every item of this turn is newer.
function openTurn(s, at, queued = 0) {
  return { at: at || null, mark: itemNo, files: new Map(), tin: 0, tout: 0, ms: 0, costFrom: s.usage.cost?.totalUsd ?? null, costTo: null, queued };
}

function countFile(t, d) {
  if (!d?.path) return;
  let added = d.added, removed = d.removed;
  if (!Number.isFinite(added) || !Number.isFinite(removed)) {
    added = 0; removed = 0;
    for (const hk of d.hunks || []) for (const l of hk.lines || []) { if (l[0] === '+') added++; else if (l[0] === '-') removed++; }
  }
  const f = t.files.get(d.path) || { path: d.path, added: 0, removed: 0 };
  f.added += added; f.removed += removed;
  t.files.set(d.path, f);
}

// What a turn amounted to, or null when no tool said anything about it.
export function turnSummary(t, endedAt) {
  const ms = t.ms > 0 ? t.ms : t.at && endedAt > t.at ? endedAt - t.at : null;
  const files = [...t.files.values()];
  const tokens = t.tin + t.tout || null;
  const cost = turnCost(t.costFrom, t.costTo);
  if (ms == null && !files.length && tokens == null && cost == null) return null;
  return { ms, files, tokens, tin: t.tin, tout: t.tout, cost };
}

// THE COST OF ONE TURN, NEVER ESTIMATED. Claude Code and OpenCode report the
// session's running total, so a turn's cost is the total after it less the
// total before. A tool that said no total during the turn gives none (null:
// the summary leaves it out). A total that went DOWN is not a running total
// (a tool that reports each query on its own, or one that started counting
// again), so it is taken as given rather than subtracted into a negative.
export function turnCost(from, to) {
  if (typeof to !== 'number' || !Number.isFinite(to)) return null;
  if (typeof from !== 'number' || !Number.isFinite(from) || to < from) return to;
  return to - from;
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
      if (e.provider && Array.isArray(e.commands)) S.commands = { ...S.commands, [e.provider]: e.commands };
      // the plan a tool is signed in on (Claude Code: max, pro, …) — what the cost chip needs to say who pays
      if (e.provider && e.account !== undefined) S.accounts = { ...(S.accounts || {}), [e.provider]: e.account };
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
      if (!s.startedAt) s.startedAt = e.t || Date.now();
      Object.assign(s, { provider: e.provider, cwd: e.cwd, mode: e.mode || s.mode, model: e.model || s.model, effort: e.effort || s.effort, providerSessionId: e.providerSessionId || s.providerSessionId, title: e.title || s.title });
      // continuing another session (Continue it, or gone back to before a
      // message): which one, and up to which of the person's messages — the
      // view draws that conversation above this one (code-view.js linkPrior)
      if (e.prior) { s.prior = e.prior; s.priorCut = Number.isInteger(e.priorCut) ? e.priorCut : null; }
      out.meta = true;
      break;
    case 'session.ready':
      Object.assign(s, { version: e.version, model: e.model || s.model, mode: e.mode || s.mode, tools: e.tools || [], providerSessionId: e.providerSessionId || s.providerSessionId });
      if (e.auth !== undefined) s.authSource = e.auth;   // Claude Code's apiKeySource: 'none' is its own sign-in, anything else a key
      if (e.mcp) s.mcp = e.mcp;
      out.meta = true;
      break;
    case 'session.state': s.state = e.state; out.meta = true; break;
    case 'session.title': s.title = e.title; out.meta = true; break;
    case 'session.ended': {
      s.ended = { reason: e.reason, detail: e.detail || null };
      s.state = 'ended';
      s.turn = null;
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

    case 'turn.started':
      // A message sent while it works does not start the clock again. If the
      // tool then ends a second turn for it (a second result), that turn is
      // counted from where this one ended.
      if (s.turn && (s.state === 'running' || s.state === 'waiting')) s.turn.queued++;
      else s.turn = openTurn(s, e.t);
      s.state = 'running'; s.changedThisTurn = false; out.meta = true;
      break;
    case 'turn.ended': {
      s.usage.turns++;
      for (const it of s.byKey.values()) if (it.kind === 'assistant' && !it.done) { it.done = true; touch(it); }
      if (e.status !== 'success') {
        const n = item('turn-end', { status: e.status, error: e.error || null, auth: !!e.auth });
        s.items.push(n); touch(n);
      }
      const t = s.turn;
      const sum = t && e.status === 'success' ? turnSummary(t, e.t) : null;
      if (sum) { const n = item('turn-sum', sum); s.items.push(n); touch(n); }
      s.turn = t?.queued && e.status === 'success' ? openTurn(s, e.t, t.queued - 1) : null;
      if (s.state !== 'ended') s.state = 'idle';
      out.meta = true;
      break;
    }

    case 'message.user': {
      const it = item('user', { text: e.text, images: e.images || 0, withNote: !!e.withNote });
      s.items.push(it); touch(it);
      break;
    }
    // Where a message of the person's stands in the coder's own conversation
    // (adapters/claude.mjs): `after` is what going back to just before it
    // resumes from (null: it was the first). The echoes come in the order the
    // messages went, so each anchors the oldest message still without one —
    // never one drawn from a conversation this one continues (before priorLen).
    case 'message.anchor': {
      let target = null;
      for (let i = s.items.length - 1; i >= (s.priorLen || 0); i--) {
        const it = s.items[i];
        if (it.kind !== 'user') continue;
        if (it.after !== undefined) break;
        target = it;
      }
      if (target) { target.after = e.after ?? null; target.uuid = e.uuid || null; touch(target); }
      break;
    }
    case 'message.start': {
      let it = s.byKey.get('m:' + e.id);
      if (!it) {
        it = item('assistant', { id: e.id, model: e.model || null, blocks: [], done: false });
        s.byKey.set('m:' + e.id, it);
        place(s, it, e.parentCallId);
      }
      touch(it);
      break;
    }
    case 'message.delta': case 'message.block': {
      let it = s.byKey.get('m:' + e.id);
      if (!it) {
        it = item('assistant', { id: e.id, model: null, blocks: [], done: false });
        s.byKey.set('m:' + e.id, it);
        place(s, it, e.parentCallId);
      }
      const i = e.block | 0;
      let b = it.blocks.find((x) => x.i === i);
      if (!b) { b = { i, kind: e.kind, text: '', done: false }; it.blocks.push(b); it.blocks.sort((a, c) => a.i - c.i); }
      // A block the coder sent whole takes no more fragments: one that comes
      // after it is a late copy (held while the session was read from disk,
      // which already had the whole block) and would write its words twice.
      // One only ever streamed (Gemini CLI's, over ACP) and closed by its
      // message's end still takes them: its file has none of its words, so a
      // held fragment is the only copy there is.
      if (e.type === 'message.delta') { if (b.whole) break; b.text += e.text || ''; }
      else { b.text = e.text || b.text; b.done = true; b.whole = true; b.kind = e.kind; }
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
        place(s, it, e.parentCallId);
      }
      touch(it);
      break;
    }
    // Kept, but not a change on screen: nothing draws `progress`, and Codex and
    // OpenCode send one per chunk of a command's output — each was redrawing
    // the tool card (or the whole Task card around it) for nothing.
    case 'tool.progress': {
      const it = s.byKey.get('t:' + e.callId);
      if (it) it.progress = e.text;
      break;
    }
    case 'tool.result': {
      const it = s.byKey.get('t:' + e.callId);
      if (it) {
        Object.assign(it, { status: e.status, output: e.output || null, diff: e.diff || it.diff, exitCode: e.exitCode ?? null, ms: e.t && it.at ? e.t - it.at : null });
        touch(it);
      }
      // what this turn's edits did, file by file, for its summary
      if (s.turn && Array.isArray(e.diff) && e.status !== 'error' && e.status !== 'denied') for (const d of e.diff) countFile(s.turn, d);
      break;
    }

    case 'permission.request': {
      const it = item('permission', { requestId: e.requestId, callId: e.callId, tool: e.tool, tkind: e.kind, title: e.title, input: e.input, preview: e.preview || {}, suggestions: e.suggestions || [], risk: e.risk, reason: e.reason || null, resolved: null });
      s.byKey.set('p:' + e.requestId, it);
      const tool = e.callId ? s.byKey.get('t:' + e.callId) : null;
      place(s, it, tool?.parentUid ? findCallOf(s, tool.parentUid) : null);
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

    // Claude Code's end-of-turn reading knows only the window's size (used:
    // null) and the full one follows a moment later; taken whole, it emptied
    // the ring and an open context panel for that round trip. A count already
    // known is kept until the next one.
    case 'usage.context':
      if (e.used == null && s.usage.context?.used != null) break;
      s.usage.context = { used: e.used, limit: e.limit, percent: e.percent ?? (e.used && e.limit ? Math.round((100 * e.used) / e.limit) : null), breakdown: e.breakdown || null };
      out.meta = true;
      break;
    case 'usage.limits': s.usage.limits = { status: e.status, windows: e.windows || [] }; out.meta = true; break;
    case 'usage.cost':
      s.usage.cost = { totalUsd: e.totalUsd, apiEquivalent: !!e.apiEquivalent };
      if (s.turn && typeof e.totalUsd === 'number' && Number.isFinite(e.totalUsd)) s.turn.costTo = e.totalUsd;
      out.meta = true;
      break;
    case 'usage.turn':
      s.usage.lastTurn = e;
      if (s.turn) {
        s.turn.tin += e.inputTokens | 0; s.turn.tout += e.outputTokens | 0;
        if (e.durationMs > 0) s.turn.ms = e.durationMs;
      }
      out.meta = true;
      break;

    case 'mode.changed': s.mode = e.mode; out.meta = true; break;
    case 'model.changed': s.model = e.model; out.meta = true; break;
    case 'effort.changed': s.effort = e.effort; out.meta = true; break;
    case 'mcp.status': s.mcp = e.servers || []; out.meta = true; break;
    case 'files.changed': s.files = e.paths || []; s.changedThisTurn = true; out.meta = true; break;
    case 'git.status': s.git = { branch: e.branch, ahead: e.ahead | 0, behind: e.behind | 0, files: e.files || [] }; s.branch = e.branch; out.meta = true; break;
    // Said to or by the presence from the Code screen. Local to this page —
    // never sent to the engine, never on the coder's transcript.
    case 'local.orion': {
      const it = item('orion', { who: e.who, text: e.text, name: e.name || null });
      s.items.push(it); touch(it);
      break;
    }
    case 'compact': { const it = item('compact', { trigger: e.trigger, preTokens: e.preTokens }); s.items.push(it); touch(it); break; }
    case 'notice': case 'error': {
      const it = item('notice', { level: e.level || (e.type === 'error' ? 'error' : 'info'), text: e.text || e.error || '', code: e.code || null });
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
// Asked on every event and every keystroke, so no arrays are made to answer.
export function needsYou(S) {
  for (const s of S.sessions.values()) if (s.waiting > 0) return true;
  return false;
}
export const liveSessions = (S) => [...S.sessions.values()].filter((s) => s.state !== 'ended');

// The open card the keyboard answers: the newest unanswered one. `waiting`
// counts the open cards, so a session asking nothing is not walked at all.
export function openRequest(s) {
  if (!s || !s.waiting) return null;
  let found = null;
  for (const it of s.byKey.values()) if (/^(permission|question|plan)$/.test(it.kind) && !it.resolved) found = it;
  return found;
}

// WHAT IT IS DOING NOW, for the turn's own line: read from the transcript,
// with no event of its own. A card waiting on the person first; then the
// newest tool of this turn still running (inside a subagent's card, the
// subagent's own newest); then a thought or a reply still being written.
// Only this turn's items are read (newer than its mark), and the newest 80 at
// most: it is asked once a second.
export function nowDoing(s) {
  if (!s) return '';
  if (s.waiting > 0) return 'Waiting on you';
  const mark = s.turn ? s.turn.mark : Infinity;
  const recent = [];
  for (let i = s.items.length - 1; i >= 0 && recent.length < 80; i--) {
    const it = s.items[i];
    if (it.uid <= mark || it.code === 'prior') break;
    recent.push(it);
  }
  const tool = recent.find((it) => it.kind === 'tool' && it.status === 'running');
  if (tool) return toolDoing(innermost(tool));
  for (const it of recent) {
    if (it.kind !== 'assistant' || it.done) continue;
    const b = it.blocks[it.blocks.length - 1];
    if (b && !b.done) return b.kind === 'thinking' ? 'Thinking' : 'Writing';
  }
  return '';
}

function innermost(t) {
  if (t.tkind !== 'task' || !t.children?.length) return t;
  for (let i = t.children.length - 1; i >= 0; i--) {
    const c = t.children[i];
    if (c.kind === 'tool' && c.status === 'running') return innermost(c);
  }
  return t;
}

const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
const clip = (t, n = 60) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
function toolDoing(t) {
  const inp = t.input || {};
  const file = baseName(inp.file_path || inp.path || inp.notebook_path || t.preview?.path);
  switch (t.tkind) {
    case 'bash': { const c = String(inp.command || '').trim().split('\n')[0]; return c ? 'Running ' + clip(c) : 'Running a command'; }
    case 'edit': case 'write': return file ? 'Editing ' + file : 'Editing a file';
    case 'read': return file ? 'Reading ' + file : 'Reading a file';
    case 'search': return 'Searching';
    case 'web': return 'On the web';
    case 'task': return inp.description ? 'Running a subagent: ' + clip(String(inp.description)) : 'Running a subagent';
    case 'todo': return 'Updating its todo list';
    case 'mcp': return 'Using ' + String(t.name || '').replace(/^mcp__/, '').replace(/__/, ' · ');
    default: return t.name ? 'Using ' + t.name : '';
  }
}

// `label`: the server's own name for a model's weekly window, where it gave one.
export function limitLabel(kind, label) {
  if (typeof label === 'string' && label) return 'weekly ' + label;
  if (kind === 'five_hour') return '5-hour';
  if (kind === 'seven_day') return 'weekly';
  // a window of its own for one model: seven_day_opus, seven_day_fable, …
  const m = /^seven_day_([a-z0-9]+)$/.exec(String(kind));
  if (m) return 'weekly ' + m[1][0].toUpperCase() + m[1].slice(1);
  return String(kind).replace(/_/g, ' ');
}

export function shortPath(p, home) {
  if (!p) return '';
  const s = home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
  return s;
}
