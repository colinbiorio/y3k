// y3k Code — the room. A coding terminal beside the orb: your own coding tools,
// running on your own computer, drawn here.
//
// The controller (connection + state) lives as long as the page, so sessions
// keep streaming and a waiting permission still lights the rail glyph while you
// are in another room. Only the DOM comes and goes with open()/close().
//
// Nothing here publishes anything (CODE.md, line 6): no feed, no live, no
// memory. The engine is reached only through transport.js.

import { h, icon, clear, swap, timeAgo } from './dom.js';
import { MODES, MODE_INFO } from './protocol.js';
import { createState, apply, activeSession, needsYou, openRequest, liveSessions } from './state.js';
import { renderItem, todoList } from './render/items.js';
import { renderDiff } from './render/diff.js';
import { contextRing, limitBars, costChip } from './render/meters.js';
import {
  createCompanion, createDesktop, hasDesktopBridge, savedPairing, pendingPairing, clearPending, pair, findEngine, probe, forgetPairing, cleanCode,
} from './transport.js';

const AGENT_NAME = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', opencode: 'OpenCode' };
const EFFORT_LABEL = { low: 'low', medium: 'medium', high: 'high', xhigh: 'extra high', max: 'max' };
const MAX_DOM_ITEMS = 400;

let controller = null;

export function createCodeView(opts = {}) {
  if (!controller) controller = createController(opts);
  return controller;
}

// `link` (from main.js) is how Code reaches the rest of the house — the
// presence's note, the line back, talking to the presence, the orb. src/code
// itself never calls the site.
function createController({ toast = () => {}, onNeedsYou = () => {}, getAccount = () => null, link = null } = {}) {
  const S = createState();
  let transport = null;
  let root = null;
  let ui = null;
  let home = { screen: 'folders', browse: null, pending: null, pastSessions: null, error: null };
  const els = new Map();   // top-level item uid → element
  const uidIndex = new Map();
  let dirty = new Set();
  let metaDirty = false;
  let engineDirty = false;
  let raf = 0;
  let hello = null;
  let viewingSid = null;   // a past session opened read-only
  const notes = new Map(); // sid → the presence's note: { state: writing|ready|none, text, presence, include }
  let talkTo = 'coder';    // who the composer speaks to: the coder, or the presence
  let orionAt = 0;         // when something was last said to the presence from here
  let lastReact = null;
  const companion = () => link?.companion?.() || null;
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };

  // --- connection ---------------------------------------------------------------
  function connect() {
    if (transport) return;
    const handlers = {
      onEvent,
      onStatus: (st) => { S.conn = st; if (st === 'connected') refreshHello(); if (st === 'unpaired') { transport?.close(); transport = null; forgetPairing(); } schedule('engine'); },
      onReset: () => { refreshHello(); },
    };
    if (hasDesktopBridge()) { transport = createDesktop(handlers); S.conn = 'connecting'; return; }
    const saved = savedPairing();
    if (saved?.token) { transport = createCompanion({ ...saved, ...handlers }); S.conn = 'connecting'; return; }
    S.conn = 'off';
  }

  async function refreshHello() {
    const r = await cmd({ cmd: 'engine.hello' });
    if (!r?.ok) return;
    hello = r;
    S.providers = r.providers || S.providers;
    S.recent = r.recent || S.recent;
    // sessions still running in the engine come back with their transcripts
    for (const live of r.sessions || []) {
      if (!S.sessions.has(live.sid)) await loadInto(live.sid);
      const s = S.sessions.get(live.sid);
      if (s) s.state = live.state;
    }
    if (!S.active) { const l = liveSessions(S); if (l.length) S.active = l[l.length - 1].sid; }
    schedule('engine'); schedule('meta'); rebuildTranscript();
  }

  async function loadInto(sid) {
    const r = await cmd({ cmd: 'session.load', sid });
    if (!r?.ok) return false;
    for (const e of r.events) apply(S, e, { replay: true });
    const s = S.sessions.get(sid);
    if (s && !r.live) s.state = 'ended';
    return true;
  }

  function cmd(obj) {
    if (!transport) return Promise.resolve({ ok: false, error: 'Not connected to y3k Code on this computer.', code: 'offline' });
    return transport.cmd(obj);
  }

  function onEvent(e) {
    const out = apply(S, e);
    if (out.engine) engineDirty = true;
    if (out.meta) metaDirty = true;
    if (out.sid && !S.active && !viewingSid && e.type === 'session.started') S.active = out.sid;
    // only the session on screen redraws; the others catch up when opened
    if (out.sid && out.sid === currentSession()?.sid) for (const it of out.changed) dirty.add(it);
    else if (out.sid && out.changed.length) metaDirty = true; // its tab lights up
    onNeedsYou(needsYou(S));
    reactTo(e);
    if (e.type === 'session.ended') offerNoteBack(S.sessions.get(e.sid));
    frame();
  }

  // The orb answers the session while Code is open: listening while it works,
  // patient while it waits on you, a flare when a turn lands a change.
  function reactTo(e) {
    if (!link?.react || !root) return;
    let st = needsYou(S) ? 'waiting' : liveSessions(S).some((x) => x.state === 'running') ? 'running' : 'idle';
    if (e.type === 'turn.ended') {
      const x = S.sessions.get(e.sid);
      if (e.status === 'success' && x?.changedThisTurn) st = 'done';
      else if (e.status === 'error') st = 'error';
    }
    if (st === lastReact || (st === 'idle' && lastReact === 'done')) return;
    lastReact = st;
    link.react(st);
  }

  // What was said to the presence from here comes back on the house's own chat
  // event; shown in this session's transcript, never sent to the coder.
  function onChat(ev) {
    const d = ev.detail || {};
    if (d.role !== 'presence' || !root || Date.now() - orionAt > 3 * 60 * 1000) return;
    const s = currentSession();
    if (!s) return;
    const out = apply(S, { sid: s.sid, type: 'local.orion', who: 'orion', text: String(d.text || ''), name: companion()?.name }, { replay: true });
    for (const it of out.changed) dirty.add(it);
    frame();
  }

  function schedule(kind) { if (kind === 'engine') engineDirty = true; else metaDirty = true; frame(); }
  function frame() { if (!raf) raf = requestAnimationFrame(flush); }

  function flush() {
    raf = 0;
    if (!root) { dirty.clear(); return; }
    const s = currentSession();
    if (engineDirty) { engineDirty = false; renderChrome(); if (!s) renderHome(); }
    if (metaDirty) { metaDirty = false; renderChrome(); renderDock(); }
    if (dirty.size && s) {
      const stick = nearBottom();
      const tops = new Set();
      for (const it of dirty) { const top = topOf(it); if (top) tops.add(top); }
      for (const it of tops) renderTop(it);
      if (stick) scrollToBottom();
    }
    dirty.clear();
  }

  const currentSession = () => (viewingSid ? S.sessions.get(viewingSid) : activeSession(S));
  // The top-level item to redraw for a change deep inside a subagent; null when
  // its ancestor is not on screen (scrolled out of the DOM window).
  function topOf(it) {
    let x = it;
    let guard = 0;
    while (x.parentUid != null && guard++ < 20) { const p = uidIndex.get(x.parentUid); if (!p) return null; x = p; }
    return x;
  }

  // --- the frame ------------------------------------------------------------------
  function open() {
    connect();
    if (root) return;
    root = h('div.code-root', { role: 'region', 'aria-label': 'y3k Code' });
    ui = {
      pane: h('div.cv-pane'),
      bar: h('div.cv-bar'),
      banner: h('div.cv-banner'),
      main: h('div.cv-main'),
      scroll: h('div.cv-scroll'),
      list: h('div.cv-list'),
      homeEl: h('div.cv-home'),
      dock: h('div.cv-dock'),
      drawer: h('div.cv-drawer', { hidden: true }),
    };
    ui.scroll.append(ui.list);
    ui.main.append(ui.scroll, ui.homeEl, ui.drawer);
    ui.pane.append(ui.bar, ui.banner, ui.main, ui.dock);
    root.append(ui.pane);
    // On BODY, like the world: the home panel carries transforms, and a
    // transformed ancestor quietly turns position:fixed into a small box.
    document.body.appendChild(root);
    document.body.classList.add('code-shifting');
    setTimeout(() => document.body.classList.remove('code-shifting'), 260);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('y3k:chat', onChat);
    ui.scroll.addEventListener('scroll', () => { ui.scroll.classList.toggle('scrolled', ui.scroll.scrollTop > 4); });
    const pend = pendingPairing();
    if (pend && !transport) autoPair(pend);
    renderChrome();
    renderDock();
    rebuildTranscript();
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('y3k:chat', onChat);
    lastReact = null;
    root?.remove();
    root = null; ui = null;
    els.clear();
    document.body.classList.add('code-shifting');
    setTimeout(() => document.body.classList.remove('code-shifting'), 260);
  }

  // --- toolbar -----------------------------------------------------------------------
  function renderChrome() {
    if (!ui) return;
    const s = currentSession();
    // tabs: every running session, plus the one being viewed
    const tabs = h('div.cv-tabs', { role: 'tablist' });
    const list = S.order.map((sid) => S.sessions.get(sid)).filter((x) => x && (x.state !== 'ended' || x.sid === S.active || x.sid === viewingSid));
    for (const x of list) {
      const on = s && x.sid === s.sid;
      const t = h('button.cv-tab' + (on ? '.on' : '') + (x.waiting ? '.ask' : '') + (x.state === 'running' ? '.run' : '') + (x.state === 'ended' ? '.ended' : ''),
        { type: 'button', role: 'tab', 'aria-selected': String(!!on), title: `${x.title || 'new session'} — ${x.cwd}` },
        h('i.cv-tabdot'), h('span.cv-tabname', x.title || folderName(x.cwd) || 'new session'));
      t.addEventListener('click', () => { viewingSid = null; S.active = x.sid; x.unread = false; rebuildTranscript(); renderChrome(); renderDock(); });
      tabs.appendChild(t);
    }
    const plus = h('button.cv-tab.cv-new', { type: 'button', title: 'New session' }, icon('plus'));
    plus.addEventListener('click', () => { viewingSid = null; S.active = null; home.screen = 'folders'; rebuildTranscript(); renderChrome(); renderDock(); });
    tabs.appendChild(plus);

    const right = h('div.cv-meters');
    if (s) right.append(contextRing(s.usage.context), limitBars(s.usage.limits || lastLimits()), costChip(s.usage.cost));
    else if (lastLimits()) right.append(limitBars(lastLimits()));
    const comp = companion();
    if (s && comp && s.usage.turns && !told.has(s.sid) && !s.noteBack) {
      const tell = h('button.cv-iconbtn.cv-tell', { type: 'button', title: `Tell ${comp.name} about this session` }, h('span.or-dot'));
      tell.addEventListener('click', () => { s.noteBack = { text: draftBack(s) }; renderDock(); });
      right.append(tell);
    }
    const hist = h('button.cv-iconbtn', { type: 'button', title: 'Past sessions' }, icon('history'));
    hist.addEventListener('click', () => toggleDrawer('history'));
    const keys = h('button.cv-iconbtn', { type: 'button', title: 'Coding tools and keys' }, icon('key'));
    keys.addEventListener('click', () => toggleDrawer('providers'));
    const plug = h('button.cv-iconbtn', { type: 'button', title: 'Connectors' }, icon('plug'));
    plug.addEventListener('click', () => toggleDrawer('connectors'));
    const act = h('button.cv-iconbtn', { type: 'button', title: 'What y3k Code did on this computer' }, icon('activity'));
    act.addEventListener('click', () => toggleDrawer('activity'));
    right.append(plug, act, hist, keys);

    const row2 = h('div.cv-controls');
    if (s) {
      row2.append(
        h('span.cv-chip.cv-folder', { title: s.cwd }, icon('folder'), h('span', folderName(s.cwd)), gitChip(s)),
        providerChip(s), modelSelect(s), effortSelect(s), modeSwitch(s));
    }
    swap(ui.bar, h('div.cv-row', tabs, right), s ? row2 : null);

    // banners: asking on the computer, connection
    const banners = [];
    for (const [, c] of S.consent) banners.push(h('div.cv-note.warn', h('span.pm-pulse'), h('div', h('b', 'Look at your computer. '), c.kind === 'folder.trust' ? 'y3k Code is asking you to trust this folder.' : c.kind === 'pair' ? 'y3k Code is asking whether this page may connect.' : 'y3k Code is asking you something.')));
    if (S.conn === 'reconnecting') banners.push(h('div.cv-note', 'Reconnecting to y3k Code on this computer…'));
    if (viewingSid && s) banners.push(h('div.cv-note', 'A past session, read-only. ', resumeButton(s)));
    swap(ui.banner, banners);
    ui.banner.hidden = !banners.length;
    root?.classList.toggle('has-session', !!s);
  }

  function lastLimits() {
    let found = null;
    for (const x of S.sessions.values()) if (x.usage.limits) found = x.usage.limits;
    return found;
  }

  function gitChip(s) {
    if (!s.branch) return null;
    const n = s.git?.files?.length || 0;
    const b = h('button.cv-branch.cv-gitbtn', { type: 'button', title: n ? `${n} changed file${n === 1 ? '' : 's'} — see the changes` : 'No uncommitted changes' },
      icon('branch'), s.branch, n ? h('span.cv-gitn', String(n)) : null, s.git?.ahead ? h('span.muted', ` ↑${s.git.ahead}`) : null);
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer('changes'); });
    return b;
  }

  function providerChip(s) {
    const p = S.providers.find((x) => x.id === s.provider);
    return h('span.cv-chip', { title: p ? `${p.label}${p.version ? ' ' + p.version : ''}` : s.provider }, h('i.cv-live.' + (s.state === 'ended' ? 'off' : s.state === 'running' ? 'run' : 'ok')), AGENT_NAME[s.provider] || s.provider);
  }

  function modelOptions(provider) {
    const fromSession = S.models[provider];
    if (fromSession?.length) return fromSession.map((m) => ({ id: m.id, label: m.label || m.id, efforts: m.efforts || [] }));
    const p = S.providers.find((x) => x.id === provider);
    return (p?.models || [{ id: 'default', label: 'Default' }]).map((m) => ({ id: m.id, label: m.label, efforts: [] }));
  }

  function modelSelect(s) {
    const opts = modelOptions(s.provider);
    const cur = s.model || 'default';
    const sel = h('select.cv-select', { title: 'Model', disabled: s.state === 'ended' || !!viewingSid, 'aria-label': 'Model' });
    let has = false;
    for (const o of opts) { const op = h('option', { value: o.id }, o.label); if (o.id === cur || (cur && o.id !== 'default' && cur.includes(o.id))) { op.selected = true; has = true; } sel.appendChild(op); }
    if (!has && cur) { const op = h('option', { value: cur }, prettyModel(cur)); op.selected = true; sel.prepend(op); }
    sel.addEventListener('change', async () => {
      const r = await cmd({ cmd: 'session.setModel', sid: s.sid, model: sel.value });
      if (!r.ok) toast(r.error || 'could not change the model');
    });
    return h('label.cv-sel', icon('agent'), sel);
  }

  function effortSelect(s) {
    const m = modelOptions(s.provider).find((o) => o.id === s.model) || null;
    const efforts = m?.efforts?.length ? m.efforts : ['low', 'medium', 'high', 'xhigh', 'max'];
    const sel = h('select.cv-select', { title: 'Thinking', disabled: s.state === 'ended' || !!viewingSid, 'aria-label': 'Thinking effort' });
    sel.appendChild(h('option', { value: '' }, 'thinking: default'));
    for (const e of efforts) { const op = h('option', { value: e }, 'thinking: ' + (EFFORT_LABEL[e] || e)); if (e === s.effort) op.selected = true; sel.appendChild(op); }
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      const r = await cmd({ cmd: 'session.setEffort', sid: s.sid, effort: sel.value });
      if (!r.ok) toast(r.error || 'could not change thinking');
    });
    return h('label.cv-sel', sel);
  }

  function modeSwitch(s) {
    const wrap = h('div.cv-modes', { role: 'radiogroup', 'aria-label': 'What it may do on its own', title: 'Shift+Tab to cycle' });
    const offered = S.providers.find((p) => p.id === s.provider)?.modes || MODES;
    for (const m of MODES) {
      const can = offered.includes(m);
      const b = h('button.cv-mode.m-' + m + (s.mode === m ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(s.mode === m), title: can ? MODE_INFO[m].hint : `Not available with ${AGENT_NAME[s.provider] || s.provider}`, disabled: !can || s.state === 'ended' || !!viewingSid }, MODE_INFO[m].label);
      b.addEventListener('click', () => setMode(s, m));
      wrap.appendChild(b);
    }
    return wrap;
  }

  async function setMode(s, m) {
    if (s.mode === m) return;
    const r = await cmd({ cmd: 'session.setMode', sid: s.sid, mode: m });
    if (!r.ok) toast(r.error || 'could not change the mode');
  }

  // --- transcript ----------------------------------------------------------------------
  const ctx = {
    get agentName() { const s = currentSession(); return AGENT_NAME[s?.provider] || 'The coder'; },
    get companionName() { return companion()?.name || 'your companion'; },
    get canPass() { return !!companion() && !viewingSid; },
    // "Pass to": copy words into the other composer — never sent on their own.
    passTo(target, text) {
      talkTo = target;
      draft = String(text || '').trim();
      renderDock();
      const ta = ui?.dock.querySelector('.cv-input');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    },
    renderChild: (it) => { uidIndex.set(it.uid, it); return renderItem(it, ctx); },
    answerPermission: async (it, decision, scope, message) => {
      const s = currentSession();
      if (!s || viewingSid) return;
      const r = await cmd({ cmd: 'permission.answer', sid: s.sid, requestId: it.requestId, decision, scope, message: message || undefined });
      if (!r.ok) toast(r.error || 'that answer did not go through');
    },
    answerQuestion: async (it, answers) => {
      const s = currentSession();
      if (!s || viewingSid) return;
      const r = await cmd({ cmd: 'question.answer', sid: s.sid, requestId: it.requestId, answers });
      if (!r.ok) toast(r.error || 'that answer did not go through');
    },
  };

  function renderTop(it) {
    ui.list.querySelector(':scope > .cv-empty')?.remove(); // the conversation has begun
    const el = renderItem(it, ctx);
    el.dataset.uid = String(it.uid);
    uidIndex.set(it.uid, it);
    const old = els.get(it.uid);
    if (old) old.replaceWith(el);
    else ui.list.appendChild(el);
    els.set(it.uid, el);
    trim();
  }

  function trim() {
    // the DOM holds the newest few hundred; older ones are one click away
    const kids = ui.list.children;
    if (kids.length <= MAX_DOM_ITEMS + 1) return;
    while (ui.list.children.length > MAX_DOM_ITEMS) {
      const first = ui.list.firstElementChild;
      if (first.classList.contains('cv-older')) { first.nextElementSibling?.remove(); continue; }
      els.delete(Number(first.dataset.uid));
      first.remove();
    }
    if (!ui.list.firstElementChild?.classList.contains('cv-older')) {
      const more = h('button.cv-older', { type: 'button' }, 'show earlier');
      more.addEventListener('click', () => rebuildTranscript(Infinity));
      ui.list.prepend(more);
    }
  }

  function rebuildTranscript(limit = MAX_DOM_ITEMS) {
    if (!ui) return;
    clear(ui.list);
    els.clear();
    const s = currentSession();
    ui.scroll.hidden = !s;
    ui.homeEl.hidden = !!s;
    if (!s) { renderHome(); return; }
    s.unread = false;
    const items = s.items.slice(-limit);
    if (items.length < s.items.length) {
      const more = h('button.cv-older', { type: 'button' }, `show ${s.items.length - items.length} earlier`);
      more.addEventListener('click', () => rebuildTranscript(Infinity));
      ui.list.appendChild(more);
    }
    for (const it of items) {
      const el = renderItem(it, ctx);
      el.dataset.uid = String(it.uid);
      uidIndex.set(it.uid, it);
      els.set(it.uid, el);
      ui.list.appendChild(el);
    }
    if (!s.items.length) ui.list.appendChild(emptySession(s));
    renderDock();
    requestAnimationFrame(scrollToBottom);
  }

  function emptySession(s) {
    return h('div.cv-empty', h('div.cv-emptymark', icon('laptop')), h('div.cv-emptytitle', `${AGENT_NAME[s.provider] || 'The coder'} is ready in ${folderName(s.cwd)}`),
      h('div.muted', `${MODE_INFO[s.mode]?.long || ''} — ${MODE_INFO[s.mode]?.hint || ''}`));
  }

  const nearBottom = () => !ui || ui.scroll.scrollHeight - ui.scroll.scrollTop - ui.scroll.clientHeight < 120;
  const scrollToBottom = () => { if (ui) ui.scroll.scrollTop = ui.scroll.scrollHeight; };

  // --- dock: todos, agents, composer --------------------------------------------------------
  let draft = '';
  let attachments = [];
  function renderDock() {
    if (!ui) return;
    const s = currentSession();
    if (!s) { clear(ui.dock); ui.dock.hidden = true; return; }
    ui.dock.hidden = false;
    const strip = [];
    if (s.todos.length) {
      const done = s.todos.filter((t) => t.status === 'completed').length;
      strip.push(h('details.cv-todos', { open: s.todosOpen !== false },
        h('summary', icon('todo'), `${done} of ${s.todos.length} done`, h('span.cv-todonow', (s.todos.find((t) => t.status === 'in_progress') || {}).activeForm || '')),
        todoList(s.todos)));
      strip[0].addEventListener('toggle', () => { s.todosOpen = strip[0].open; });
    }
    const agents = [...s.agents.values()].filter((a) => a.status === 'running');
    if (agents.length) strip.push(h('div.cv-agents', agents.map((a) => h('span.ag-chip.run', { title: a.text || a.description }, h('i.td-spin'), a.description || a.agentType || 'agent'))));

    const ended = s.state === 'ended' || !!viewingSid;
    const running = s.state === 'running' || s.state === 'waiting';
    const comp = companion();
    const toOrion = talkTo === 'orion' && !!comp;
    const card = noteCard(s) || noteBackCard(s);
    if (card) strip.push(card);
    const ta = h('textarea.cv-input', {
      rows: 1, placeholder: toOrion ? `Say something to ${comp.name}…` : ended ? 'This session has ended.' : running ? 'Add to what it is doing… (Esc to stop)' : `Tell ${AGENT_NAME[s.provider] || 'it'} what to do…`,
      disabled: ended && !toOrion, 'aria-label': 'Message', spellcheck: true,
    });
    ta.value = draft;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(280, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', () => { draft = ta.value; fit(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(s, ta); }
    });
    ta.addEventListener('paste', (e) => {
      for (const f of e.clipboardData?.files || []) if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { e.preventDefault(); addImage(f); }
    });
    const chips = h('div.cv-attach', attachments.map((a, i) => h('span.cv-att', h('img', { src: a.url, alt: '' }), h('button', { type: 'button', title: 'Remove', onclick: () => { attachments.splice(i, 1); renderDock(); } }, icon('close')))));
    const pick = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, hidden: true });
    pick.addEventListener('change', () => { for (const f of pick.files) addImage(f); pick.value = ''; });
    const clip = h('button.cv-iconbtn', { type: 'button', title: 'Attach an image', disabled: ended }, icon('image'));
    clip.addEventListener('click', () => pick.click());
    const act = running
      ? h('button.cv-send.stop', { type: 'button', title: 'Stop (Esc)' }, icon('stop'))
      : h('button.cv-send', { type: 'button', title: 'Send (Enter)', disabled: ended }, icon('send'));
    act.addEventListener('click', () => (running ? interrupt(s) : send(s, ta)));
    const hint = h('div.cv-hint', h('span.cv-modehint.m-' + (s.mode || 'ask'), MODE_INFO[s.mode]?.long || ''), h('span.muted', ' · shift+tab to change · shift+enter for a new line'));
    const to = comp ? h('div.cv-to', { role: 'radiogroup', 'aria-label': 'Talk to' },
      [['coder', AGENT_NAME[s.provider] || 'coder'], ['orion', comp.name]].map(([k, label]) => {
        const b = h('button.cv-tobtn' + (talkTo === k ? '.on' : '') + '.to-' + k, { type: 'button', role: 'radio', 'aria-checked': String(talkTo === k), title: k === 'orion' ? `Talk to ${comp.name} — the coder does not see this` : 'Talk to the coder' }, label);
        b.addEventListener('click', () => { talkTo = k; renderDock(); ui.dock.querySelector('.cv-input')?.focus(); });
        return b;
      })) : null;
    const box = h('div.cv-composer' + (running && !toOrion ? '.running' : '') + (toOrion ? '.to-orion' : ''), to, clip, pick, ta, toOrion ? h('button.cv-send', { type: 'button', title: 'Send (Enter)', onclick: () => send(s, ta) }, icon('send')) : act);
    swap(ui.dock, strip.length ? h('div.cv-strip', strip) : null, attachments.length ? chips : null, box, ended ? endedBar(s) : hint);
    requestAnimationFrame(fit);
  }

  // --- the presence's note, and the line back ------------------------------------------
  const notesOn = () => pref('y3k-code:notes') !== 'off';
  function askForNote(sid) {
    const comp = companion();
    if (!comp || !link?.writeNote || !notesOn()) return;
    notes.set(sid, { state: 'writing' });
    renderDock();
    link.writeNote().then((r) => {
      notes.set(sid, r?.note ? { state: 'ready', text: r.note, presence: r.presence || comp, include: true } : { state: 'none', why: r?.message || r?.error || null });
      if (currentSession()?.sid === sid) renderDock();
    }, () => notes.set(sid, { state: 'none' }));
  }

  function noteCard(s) {
    const n = notes.get(s.sid);
    const comp = companion();
    if (!n || !comp || s.items.some((i) => i.kind === 'user') || viewingSid) return null;
    const agent = AGENT_NAME[s.provider] || 'the coder';
    if (n.state === 'writing') return h('div.cv-notecard.writing', h('span.or-dot'), h('span.th-shimmer', `${comp.name} is writing ${agent} a note…`));
    if (n.state !== 'ready') return null;
    const ta = h('textarea.cv-noteta', { rows: 3, maxlength: 1200, 'aria-label': `${comp.name}'s note` });
    ta.value = n.text;
    ta.addEventListener('input', () => { n.text = ta.value; });
    const keep = h('button.cv-link', { type: 'button' }, n.include ? 'leave it out' : 'send it after all');
    keep.addEventListener('click', () => { n.include = !n.include; renderDock(); });
    const never = h('button.cv-link.muted', { type: 'button', title: 'You can turn it back on from the coding tools drawer' }, 'never write notes');
    never.addEventListener('click', () => { pref('y3k-code:notes', 'off'); notes.delete(s.sid); renderDock(); });
    return h('div.cv-notecard' + (n.include ? '' : '.off'),
      h('div.cv-notehead', h('span.or-dot'), h('b', `A note from ${comp.name} for ${agent}`), h('span.muted.cv-small', n.include ? ' — goes with your first message' : ' — left out'), h('span.cv-grow'), keep, never),
      n.include ? ta : null);
  }

  // The line back: a factual sentence about the session, for the presence's
  // shelf. Drafted here, read and changed by the person, sent only if they say.
  function draftBack(s) {
    const mins = Math.max(1, Math.round((Date.now() - (s.startedAt || Date.now())) / 60000));
    const files = [...new Set((s.files || []).map((p) => String(p).split(/[\\/]/).pop()))];
    const t = s.usage.turns;
    return `Coded with ${AGENT_NAME[s.provider] || s.provider}${s.model ? ` (${prettyModel(s.model)})` : ''} in ${folderName(s.cwd)} for ${mins} min: ${t} turn${t === 1 ? '' : 's'}${files.length ? `, changed ${files.length} file${files.length === 1 ? '' : 's'} (${files.slice(0, 5).join(', ')}${files.length > 5 ? '…' : ''})` : ', no files changed'}.`.slice(0, 400);
  }

  const told = new Set();
  function offerNoteBack(s) {
    if (!s || told.has(s.sid) || !companion() || !link?.sendBack || !s.usage.turns) return;
    if (pref('y3k-code:noteback') === 'always') { told.add(s.sid); link.sendBack(draftBack(s)).then((r) => toast(r.ok ? `told ${companion()?.name}` : r.error)); return; }
    s.noteBack = { text: draftBack(s) };
    if (currentSession()?.sid === s.sid) renderDock();
  }

  function noteBackCard(s) {
    const nb = s.noteBack;
    const comp = companion();
    if (!nb || !comp || told.has(s.sid)) return null;
    const ta = h('textarea.cv-noteta', { rows: 2, maxlength: 400, 'aria-label': `A line for ${comp.name}` });
    ta.value = nb.text;
    ta.addEventListener('input', () => { nb.text = ta.value; });
    const always = h('input', { type: 'checkbox', 'aria-label': 'Always send without asking' });
    const go = h('button.btn.btn-allow', { type: 'button' }, `Tell ${comp.name}`);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const r = await link.sendBack(ta.value);
      if (!r.ok) { go.disabled = false; toast(r.error); return; }
      if (always.checked) pref('y3k-code:noteback', 'always');
      told.add(s.sid); s.noteBack = null; renderDock(); toast(`told ${comp.name}`);
    });
    const skip = h('button.btn', { type: 'button' }, 'Not this time');
    skip.addEventListener('click', () => { told.add(s.sid); s.noteBack = null; renderDock(); });
    return h('div.cv-notecard.back',
      h('div.cv-notehead', h('span.or-dot'), h('b', `Tell ${comp.name} about it?`), h('span.muted.cv-small', ' A line for its shelf — it sees nothing else of this session.')),
      ta, h('div.cv-acts', h('label.cv-small.muted', always, ' always, without asking'), h('span.cv-grow'), skip, go));
  }

  function endedBar(s) {
    return h('div.cv-hint', h('span.muted', s.ended?.reason === 'stopped' ? 'Stopped. ' : 'This session has ended. '), resumeButton(s));
  }

  function resumeButton(s) {
    if (!s.providerSessionId) return null;
    const b = h('button.cv-link', { type: 'button' }, 'Continue it');
    b.addEventListener('click', async () => {
      const r = await cmd({ cmd: 'session.resume', provider: s.provider, cwd: s.cwd, providerSessionId: s.providerSessionId, sid: s.sid });
      if (!r.ok) { toast(r.error || 'could not continue it'); return; }
      viewingSid = null;
      S.active = r.sid;
      rebuildTranscript(); renderChrome();
    });
    return b;
  }

  function addImage(file) {
    if (attachments.length >= 4) { toast('four images at most'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('that image is over 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      attachments.push({ url, mediaType: file.type, data: url.split(',')[1] });
      renderDock();
    };
    reader.readAsDataURL(file);
  }

  async function send(s, ta) {
    const text = ta.value.trim();
    if (!text && !attachments.length) {
      // an empty Enter answers the card that is waiting
      const req = openRequest(s);
      if (req?.kind === 'permission' || req?.kind === 'plan') ctx.answerPermission(req, 'allow', 'once');
      return;
    }
    if (text === '/clear' || text === '/new') { draft = ''; S.active = null; rebuildTranscript(); renderChrome(); return; }
    if (talkTo === 'orion' && companion()) {
      if (!text) return;
      orionAt = Date.now();
      link.talk(text);
      const out = apply(S, { sid: s.sid, type: 'local.orion', who: 'you', text, name: companion().name }, { replay: true });
      for (const it of out.changed) dirty.add(it);
      draft = ''; ta.value = ''; frame(); renderDock(); scrollToBottom();
      return;
    }
    // The presence's note goes with the first message, if the person kept it.
    const note = notes.get(s.sid);
    const first = !s.items.some((i) => i.kind === 'user');
    const handoff = first && note?.state === 'ready' && note.include && note.text.trim()
      ? { name: note.presence?.name || companion()?.name, handle: note.presence?.handle || companion()?.handle, note: note.text.trim() } : undefined;
    const r = await cmd({ cmd: 'session.send', sid: s.sid, text: text || '(image)', handoff, attachments: attachments.length ? attachments.map((a) => ({ type: 'image', mediaType: a.mediaType, data: a.data })) : undefined });
    if (r.ok && first) notes.delete(s.sid);
    if (!r.ok) { toast(r.error || 'not sent'); return; }
    draft = '';
    attachments = [];
    ta.value = '';
    renderDock();
    scrollToBottom();
  }

  async function interrupt(s) {
    const r = await cmd({ cmd: 'session.interrupt', sid: s.sid });
    if (!r.ok) toast(r.error || 'could not stop it');
  }

  function onKey(e) {
    if (!root) return;
    const s = currentSession();
    if (!s || viewingSid) return;
    const isComposer = !!e.target.classList?.contains('cv-input');
    const inField = !!e.target.closest?.('input, select, textarea, button, a') && !isComposer;
    if (e.key === 'Tab' && e.shiftKey && !inField) {
      e.preventDefault();
      const i = MODES.indexOf(s.mode);
      setMode(s, MODES[(i + 1) % MODES.length]);
      return;
    }
    const req = openRequest(s);
    if (e.key === 'Escape') {
      if (req && req.kind !== 'question') { e.preventDefault(); ctx.answerPermission(req, 'deny', 'once'); return; }
      if (s.state === 'running' || s.state === 'waiting') { e.preventDefault(); interrupt(s); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); interrupt(s); return; }
    // Enter in the composer is send() — which answers the card itself when empty.
    if (e.key === 'Enter' && req && req.kind !== 'question' && !inField && !isComposer && !e.shiftKey) {
      e.preventDefault();
      ctx.answerPermission(req, 'allow', 'once');
    }
  }

  // --- home: connect, choose a folder, choose a mode ----------------------------------------
  function renderHome() {
    if (!ui || currentSession()) return;
    ui.scroll.hidden = true;
    ui.homeEl.hidden = false;
    ui.dock.hidden = true;
    if (!transport || S.conn === 'off' || S.conn === 'unpaired') return swap(ui.homeEl, connectScreen());
    if (S.conn === 'connecting' && !hello) return swap(ui.homeEl, h('div.cv-center', h('div.th-shimmer', 'Connecting to y3k Code on this computer…')));
    if (home.screen === 'browse') return swap(ui.homeEl, browseScreen());
    if (home.screen === 'github') return swap(ui.homeEl, githubScreen());
    if (home.screen === 'mode' && home.pending) return swap(ui.homeEl, modeScreen());
    return swap(ui.homeEl, folderScreen());
  }

  function hero(title, sub) {
    return h('div.cv-hero', h('div.cv-heromark', icon('laptop')), h('h2.cv-title', title), sub ? h('p.cv-sub', sub) : null);
  }

  function connectScreen() {
    const code = h('input.cv-code', { type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'XXXX-XXXX', maxlength: 9, 'aria-label': 'Pairing code' });
    code.addEventListener('input', () => { const c = cleanCode(code.value).slice(0, 8); code.value = c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c; });
    const status = h('div.cv-status');
    const go = h('button.btn.btn-allow', { type: 'button' }, 'Connect');
    const run = async () => {
      const c = cleanCode(code.value);
      if (c.length !== 8) { swap(status, h('span.lv-error', 'The code is the 8 letters and numbers y3k Code printed.')); return; }
      go.disabled = true;
      swap(status, h('span.th-shimmer', 'Looking for y3k Code on this computer…'));
      const eng = await findEngine();
      if (!eng) { go.disabled = false; swap(status, h('span.lv-error', 'y3k Code is not running on this computer (or this browser cannot reach it).')); return; }
      await doPair(eng.port, c, status);
      go.disabled = false;
    };
    go.addEventListener('click', run);
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    return h('div.cv-center', hero('Code, with your own tools', 'y3k Code runs Claude Code — and soon Codex, Gemini and open models — on your own computer, with your own sign-in. You see every step, every change before it happens, and nothing leaves your machine except what you choose to send.'),
      h('div.cv-card',
        h('div.cv-step', h('span.cv-stepno', '1'), h('div', h('b', 'Start y3k Code on this computer'),
          h('div.cv-cmdline', h('code.cm', 'npx y3k-code')),
          h('div.muted.cv-small', 'Before it is published, from the y3k folder: ', h('code.cm', 'node y3k-code/bin/y3k-code.mjs')))),
        h('div.cv-step', h('span.cv-stepno', '2'), h('div', h('b', 'It opens this page by itself. Or type the code it shows:'),
          h('div.cv-coderow', code, go), status)),
        h('div.cv-step', h('span.cv-stepno', '3'), h('div', h('b', 'Say yes in its window.'), h('div.muted.cv-small', 'A page can ask to connect; only you, at your computer, can let it.')))));
  }

  async function doPair(port, c, status) {
    swap(status, h('span', h('span.pm-pulse'), ' Look at the window where y3k Code is running and type ', h('b', 'y'), '.'));
    const r = await pair(port, c);
    if (!r.ok) { swap(status, h('span.lv-error', r.error)); return false; }
    swap(status, h('span.lv-ok', 'Connected.'));
    connect();
    renderHome();
    return true;
  }

  async function autoPair(p) {
    clearPending();
    const status = h('div.cv-status');
    if (ui) swap(ui.homeEl, h('div.cv-center', hero('Connecting y3k Code', null), h('div.cv-card', status)));
    if (!(await probe(p.port))) { swap(status, h('span.lv-error', 'y3k Code is not answering. Is it still running?')); return; }
    await doPair(p.port, p.code, status);
  }

  function folderScreen() {
    const ready = S.providers.filter((p) => p.ready && p.installed);
    const recent = h('div.cv-folders');
    for (const f of S.recent) {
      const b = h('button.cv-folderrow', { type: 'button', title: f.path },
        icon('folder'), h('span.cv-fname', f.name || folderName(f.path)), h('span.cv-fpath.muted', f.path),
        f.mode ? h('span.cv-modehint.m-' + f.mode, MODE_INFO[f.mode]?.label) : null, h('span.muted.cv-small', f.lastUsed ? timeAgo(f.lastUsed) : ''));
      b.addEventListener('click', () => chooseFolder(f.path));
      recent.appendChild(b);
    }
    const gh = h('button.btn', { type: 'button' }, icon('github'), ' From GitHub…');
    gh.addEventListener('click', () => { home.screen = 'github'; home.gh = null; loadRepos(''); });
    const browse = h('button.btn', { type: 'button' }, icon('folder'), ' Choose a folder…');
    // In the desktop app the OS's own picker chooses (the page never names the
    // path); in a browser, a list of the folders in your home folder.
    browse.addEventListener('click', async () => {
      if (transport?.kind === 'desktop') { afterOpen(await cmd({ cmd: 'workspace.pick' })); return; }
      home.screen = 'browse'; home.browse = null; loadBrowse(null);
    });
    const provider = h('select.cv-select', { 'aria-label': 'Coding tool' });
    for (const p of S.providers) {
      const op = h('option', { value: p.id, disabled: !p.ready || !p.installed }, `${p.label}${!p.ready ? ' — soon' : !p.installed ? ' — not installed' : ''}`);
      if (p.id === (home.provider || 'claude')) op.selected = true;
      provider.appendChild(op);
    }
    provider.addEventListener('change', () => { home.provider = provider.value; });
    return h('div.cv-center.cv-wide', hero('Where are we working?', 'Pick a folder on your computer. The first time, y3k Code asks you — on your computer — to trust it.'),
      home.error ? h('div.cv-note.err', home.error) : null,
      !ready.length ? h('div.cv-note.warn', 'No coding tool is ready yet. ', linkBtn('Set one up', () => toggleDrawer('providers'))) : null,
      h('div.cv-card', h('div.cv-cardhead', h('b', 'Recent'), h('span.cv-grow'), h('label.cv-sel', 'with ', provider)),
        S.recent.length ? recent : h('div.muted.cv-small', 'No folders yet.'), h('div.cv-acts', gh, browse)));
  }

  const linkBtn = (label, fn) => { const b = h('button.cv-link', { type: 'button' }, label); b.addEventListener('click', fn); return b; };

  async function loadBrowse(path) {
    const r = await cmd({ cmd: 'workspace.browse', path: path || undefined });
    home.browse = r.ok ? r : { error: r.error, entries: [] };
    renderHome();
  }

  function browseScreen() {
    const b = home.browse;
    if (!b) return h('div.cv-center', h('span.th-shimmer', 'Reading your folders…'));
    const crumbs = h('div.cv-crumbs');
    if (b.path) {
      const rel = b.home && b.path.startsWith(b.home) ? b.path.slice(b.home.length) : b.path;
      const parts = rel.split(/[\\/]/).filter(Boolean);
      const homeBtn = h('button.cv-crumb', { type: 'button' }, '~');
      homeBtn.addEventListener('click', () => loadBrowse(b.home));
      crumbs.appendChild(homeBtn);
      let acc = b.home || '';
      for (const part of parts) {
        acc += '/' + part;
        const target = acc;
        const c = h('button.cv-crumb', { type: 'button' }, part);
        c.addEventListener('click', () => loadBrowse(target));
        crumbs.append(h('span.muted', '/'), c);
      }
    }
    const list = h('div.cv-folders.cv-browse');
    if (b.parent) { const up = h('button.cv-folderrow', { type: 'button' }, icon('chevron', 'flip'), h('span.cv-fname', '..')); up.addEventListener('click', () => loadBrowse(b.parent)); list.appendChild(up); }
    for (const e of b.entries || []) {
      const row = h('button.cv-folderrow', { type: 'button' }, icon('folder'), h('span.cv-fname', e.name), e.git ? h('span.cv-branch', icon('branch'), 'git') : null);
      row.addEventListener('click', () => loadBrowse(e.path));
      list.appendChild(row);
    }
    const use = h('button.btn.btn-allow', { type: 'button', disabled: !b.path || b.path === b.home }, 'Use this folder');
    use.addEventListener('click', () => chooseFolder(b.path));
    const back = h('button.btn', { type: 'button' }, 'Back');
    back.addEventListener('click', () => { home.screen = 'folders'; renderHome(); });
    return h('div.cv-center.cv-wide', h('div.cv-card', crumbs, b.error ? h('div.cv-note.err', b.error) : null, list, h('div.cv-acts', back, use)));
  }

  async function chooseFolder(path) {
    home.error = null;
    afterOpen(await cmd({ cmd: 'workspace.open', path }));
  }

  function afterOpen(r) {
    if (r.code === 'cancelled') return;
    if (!r.ok) { home.error = r.code === 'declined' ? 'Not trusted — nothing was started.' : r.error; home.screen = 'folders'; renderHome(); return; }
    home.pending = { path: r.path, name: r.name, findings: r.findings || [], mode: r.mode };
    if (r.mode) return start(r.mode);
    home.screen = 'mode';
    renderHome();
  }

  function modeScreen() {
    const p = home.pending;
    const prov = S.providers.find((x) => x.id === (home.provider || 'claude'));
    const offered = prov?.modes || MODES;
    const cards = MODES.map((m) => {
      const can = offered.includes(m);
      const b = h('button.cv-modecard.m-' + m + (m === 'ask' ? '.rec' : ''), { type: 'button', disabled: !can }, h('b', MODE_INFO[m].long), h('span', can ? MODE_INFO[m].hint : `Not available with ${prov?.label || 'this tool'} — its only "auto" would skip every permission.`), m === 'ask' ? h('i.cv-rec', 'a good start') : null);
      b.addEventListener('click', () => start(m));
      return b;
    });
    const back = h('button.btn', { type: 'button' }, 'Back');
    back.addEventListener('click', () => { home.screen = 'folders'; home.pending = null; renderHome(); });
    return h('div.cv-center.cv-wide', hero(`How much may it do on its own in ${p.name}?`, 'You can change this any time (Shift+Tab). y3k Code remembers it for this folder.'),
      p.findings.length ? h('div.cv-note.warn', h('b', 'This folder can change how coding tools behave: '), p.findings.map((f) => `${f.file} (${f.detail})`).join('; ')) : null,
      h('div.cv-modecards', cards), h('div.cv-acts', back));
  }

  async function start(mode) {
    const p = home.pending;
    if (!p) return;
    const r = await cmd({ cmd: 'session.start', provider: home.provider || 'claude', cwd: p.path, mode });
    if (!r.ok && r.code === 'mode-unavailable') { home.error = r.error; home.screen = 'mode'; renderHome(); return; }
    if (!r.ok) {
      home.error = r.code === 'needs-key' ? `${r.error} (use the key button, top right)` : r.error;
      home.screen = 'folders';
      if (r.code === 'needs-key') toggleDrawer('providers');
      renderHome();
      return;
    }
    home.pending = null;
    home.screen = 'folders';
    S.active = r.sid;
    askForNote(r.sid);
    if (!S.sessions.has(r.sid)) apply(S, { sid: r.sid, type: 'session.started', provider: home.provider || 'claude', cwd: p.path, mode }, { replay: true });
    rebuildTranscript();
    renderChrome();
    setTimeout(() => ui?.dock.querySelector('.cv-input')?.focus(), 50);
  }

  // --- drawers: past sessions, providers and keys ---------------------------------------------
  let drawerKind = null;
  function toggleDrawer(kind) {
    if (!ui) return;
    drawerKind = drawerKind === kind ? null : kind;
    ui.drawer.hidden = !drawerKind;
    if (drawerKind === 'history') renderHistory();
    if (drawerKind === 'providers') renderProviders();
    if (drawerKind === 'changes') renderChanges();
    if (drawerKind === 'connectors') renderConnectors();
    if (drawerKind === 'activity') renderActivity();
  }

  function drawerHead(title) {
    const x = h('button.cv-iconbtn', { type: 'button', title: 'Close' }, icon('close'));
    x.addEventListener('click', () => toggleDrawer(drawerKind));
    return h('div.cv-drawerhead', h('b', title), h('span.cv-grow'), x);
  }

  async function renderHistory() {
    swap(ui.drawer, drawerHead('Past sessions'), h('div.th-shimmer', 'Loading…'));
    const r = await cmd({ cmd: 'session.list' });
    if (drawerKind !== 'history') return;
    const rows = (r.sessions || []).map((x) => {
      const b = h('button.cv-histrow', { type: 'button' },
        h('span.cv-histtitle', x.title || 'untitled'), h('span.muted.cv-small', `${folderName(x.cwd)} · ${x.started ? timeAgo(x.started) : ''}${x.live ? ' · running' : ''}`));
      b.addEventListener('click', async () => {
        if (x.live) { viewingSid = null; S.active = x.sid; }
        else {
          if (!S.sessions.has(x.sid) || !S.sessions.get(x.sid).items.length) { S.sessions.delete(x.sid); await loadInto(x.sid); }
          const s = S.sessions.get(x.sid);
          if (s) { s.state = 'ended'; if (!s.providerSessionId) s.providerSessionId = x.providerSessionId; if (!S.order.includes(x.sid)) S.order.push(x.sid); }
          viewingSid = x.sid;
        }
        toggleDrawer('history');
        rebuildTranscript(); renderChrome();
      });
      return b;
    });
    swap(ui.drawer, drawerHead('Past sessions'), rows.length ? h('div.cv-hist', rows) : h('div.muted.cv-small', 'None yet.'), cloudBox());
  }

  // A claude.ai/code session: open it there, or copy it here with teleport in a
  // terminal (then it appears above, and continues like any local session).
  function cloudBox() {
    const inp = h('input.cv-keyin', { type: 'url', placeholder: 'https://claude.ai/code/session_…', 'aria-label': 'Cloud session link' });
    const out = h('div.cv-cloudout');
    const go = h('button.btn', { type: 'button' }, 'Check');
    go.addEventListener('click', async () => {
      const s = currentSession();
      const r = await cmd({ cmd: 'cloud.check', ref: inp.value.trim(), cwd: s?.cwd || undefined });
      if (!r.ok) { swap(out, h('div.cv-note.err', r.error)); return; }
      swap(out,
        h('ul.todos', r.checks.map((c) => h('li.todo.td-' + (c.ok ? 'completed' : 'pending'), h('span.td-box', c.ok ? icon('check') : null), h('span.td-text', c.text)))),
        h('div.cv-small', 'To copy it here, in a terminal', r.folder ? ` in ${r.folder}` : ' in a clean clone of its repository', ':'),
        h('div.cv-cmdline', h('code.cm', r.teleport)),
        h('div.cv-acts', h('a.cv-link', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'open it on claude.ai')));
    });
    return h('div.cv-prov', h('b', 'A session from claude.ai'), h('div.cv-keyrow', inp, go), out);
  }

  // --- GitHub: their repositories, cloned onto this computer -------------------------------
  async function loadRepos(q) {
    home.gh = { loading: true, q };
    renderHome();
    const r = await cmd({ cmd: 'github.repos', q: q || undefined });
    home.gh = r.ok ? { repos: r.repos, q } : { error: r.error, code: r.code, q };
    if (home.screen === 'github') renderHome();
  }

  function githubScreen() {
    const g = home.gh || {};
    const q = h('input.cv-keyin', { type: 'search', placeholder: 'your repositories — or search GitHub', value: g.q || '', 'aria-label': 'Search GitHub' });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRepos(q.value.trim()); });
    const list = h('div.cv-folders.cv-browse');
    for (const r of g.repos || []) {
      const row = h('button.cv-folderrow.cv-repo', { type: 'button', title: r.description || r.repo },
        icon('github'), h('span.cv-fname', r.repo), h('span.cv-fpath.muted', r.description || ''), r.private ? h('span.cv-pstate', 'private') : null, h('span.muted.cv-small', r.language || ''));
      row.addEventListener('click', () => cloneRepo(r.repo));
      list.appendChild(row);
    }
    const back = h('button.btn', { type: 'button' }, 'Back');
    back.addEventListener('click', () => { home.screen = 'folders'; renderHome(); });
    return h('div.cv-center.cv-wide', hero('From GitHub', 'Cloned into ~/y3k-code with your own GitHub sign-in (gh). You trust it on your computer before anything runs there.'),
      h('div.cv-card', h('div.cv-keyrow', q, (() => { const b = h('button.btn', { type: 'button' }, 'Search'); b.addEventListener('click', () => loadRepos(q.value.trim())); return b; })()),
        g.loading ? h('div.th-shimmer', 'Asking GitHub…') : g.error ? h('div.cv-note.warn', g.error) : list,
        home.cloning ? h('div.cv-note', h('span.th-shimmer', `Cloning ${home.cloning}…`)) : null,
        h('div.cv-acts', back)));
  }

  async function cloneRepo(repo) {
    if (home.cloning) return;
    home.cloning = repo;
    renderHome();
    const r = await cmd({ cmd: 'github.clone', repo });
    home.cloning = null;
    if (!r.ok) { home.gh = { ...(home.gh || {}), error: r.error }; renderHome(); return; }
    toast(`cloned into ${r.path}`);
    chooseFolder(r.path); // the trust card, with whatever the repository carries
  }

  // --- the folder's changes -------------------------------------------------------------------
  async function renderChanges(path) {
    const s = currentSession();
    if (!s) return;
    const files = s.git?.files || [];
    const list = h('div.cv-hist', files.map((f) => {
      const b = h('button.cv-histrow.cv-change', { type: 'button' }, h('span', h('code.cm.cv-st.st-' + (f.work === '?' ? 'new' : f.work === 'D' || f.index === 'D' ? 'del' : 'mod'), f.work === '?' ? 'new' : (f.index !== '.' ? f.index : f.work)), ' ', f.path));
      b.addEventListener('click', () => renderChanges(f.path));
      return b;
    }));
    const body = [drawerHead(`Changes on ${s.branch || 'this folder'}`), files.length ? list : h('div.muted.cv-small', 'Nothing uncommitted.')];
    swap(ui.drawer, body);
    if (!path) return;
    const r = await cmd({ cmd: 'git.diff', cwd: s.cwd, path });
    if (drawerKind !== 'changes') return;
    const shown = r.ok && r.files?.length ? r.files.map((d) => renderDiff({ ...d, ...countOf(d.hunks) }, { header: true })) : [h('div.muted.cv-small', r.ok ? 'New file — not tracked yet, so there is nothing to compare it with.' : r.error)];
    swap(ui.drawer, ...body, h('div.cv-diffs', shown));
  }
  const countOf = (hunks = []) => { let added = 0; let removed = 0; for (const hk of hunks) for (const l of hk.lines) { if (l[0] === '+') added++; else if (l[0] === '-') removed++; } return { added, removed }; };

  // --- connectors -------------------------------------------------------------------------------
  async function renderConnectors() {
    const s = currentSession();
    const r = await cmd({ cmd: 'mcp.list' });
    if (drawerKind !== 'connectors') return;
    const mine = (r.servers || []).map((c) => {
      const rm = h('button.cv-link', { type: 'button' }, 'remove');
      rm.addEventListener('click', async () => { const x = await cmd({ cmd: 'mcp.remove', name: c.name }); if (!x.ok) toast(x.error); renderConnectors(); });
      return h('div.cv-prov', h('div.cv-provhead', icon('plug'), h('b', c.name), h('span.muted.cv-small', c.transport), h('span.cv-grow'), rm),
        h('div.cv-cmdline', h('code.cm', c.command ? [c.command, ...(c.args || [])].join(' ') : c.url)),
        c.env.length || c.headers.length ? h('div.muted.cv-small', `with ${[...c.env, ...c.headers].join(', ')} set`) : null);
    });
    const live = (s?.mcp || []).map((m) => {
      const on = m.status !== 'disabled';
      const t = h('button.cv-link', { type: 'button' }, on ? 'turn off' : 'turn on');
      t.addEventListener('click', async () => { const x = await cmd({ cmd: 'mcp.toggle', sid: s.sid, name: m.name, enabled: !on }); if (!x.ok) toast(x.error); });
      const re = h('button.cv-link', { type: 'button' }, 'reconnect');
      re.addEventListener('click', async () => { const x = await cmd({ cmd: 'mcp.reconnect', sid: s.sid, name: m.name }); if (!x.ok) toast(x.error); });
      return h('div.cv-histrow', h('span', h('i.cv-live.' + (m.status === 'connected' ? 'ok' : m.status === 'failed' ? 'off' : 'run')), ' ', h('b', m.name), h('span.muted.cv-small', ` ${m.status}${m.source ? ' · ' + m.source : ''}`)), s.state !== 'ended' ? h('span', t, ' · ', re) : null);
    });
    // add one: a command it runs, or an address it connects to
    const name = h('input.cv-keyin', { placeholder: 'name', maxlength: 64 });
    const kind = h('select.cv-select.cv-keyin', h('option', { value: 'stdio' }, 'runs a command'), h('option', { value: 'http' }, 'at an address'));
    const what = h('input.cv-keyin', { placeholder: 'npx -y @modelcontextprotocol/server-github   or   https://…', maxlength: 2000 });
    const secret = h('input.cv-keyin', { placeholder: 'KEY=value (optional — kept on your computer)', type: 'password', autocomplete: 'off' });
    const add = h('button.btn', { type: 'button' }, 'Add');
    add.addEventListener('click', async () => {
      const [k, ...v] = secret.value.split('=');
      const extra = secret.value.includes('=') ? { [k.trim()]: v.join('=').trim() } : {};
      const parts = what.value.trim().split(/\s+/);
      const body = kind.value === 'stdio'
        ? { cmd: 'mcp.add', name: name.value.trim(), transport: 'stdio', command: parts[0] || '', args: parts.slice(1), env: extra }
        : { cmd: 'mcp.add', name: name.value.trim(), transport: 'http', url: what.value.trim(), headers: extra };
      add.disabled = true; add.textContent = 'Asking on your computer…';
      const x = await cmd(body);
      if (!x.ok) toast(x.error); else toast(x.note || 'added');
      renderConnectors();
    });
    swap(ui.drawer, drawerHead('Connectors'),
      s?.mcp?.length ? [h('div.cv-small.muted', 'In this session'), h('div.cv-hist', live)] : null,
      h('div.cv-small.muted', 'Added here — new sessions get them (your own coding-tool settings still apply too)'),
      mine.length ? mine : h('div.muted.cv-small', 'None yet.'),
      h('div.cv-prov', h('b', 'Add a connector'), h('div.cv-keyrow', name, kind), what, secret, h('div.cv-acts', add),
        h('div.muted.cv-small', 'You will be asked on your computer, with the exact command or address shown.')));
  }

  // --- what was done on this computer ----------------------------------------------------------------
  async function renderActivity() {
    const r = await cmd({ cmd: 'audit.tail', n: 200 });
    if (drawerKind !== 'activity') return;
    const say = (a) => {
      switch (a.kind) {
        case 'permission': return `${a.decision === 'allow' ? 'Allowed' : 'Declined'} ${a.tool}${a.scope && a.scope !== 'once' ? ` (${a.scope})` : ''}`;
        case 'tool.call': return `${a.tool}: ${String(a.input?.command || a.input?.file_path || a.input?.pattern || a.input?.url || '').slice(0, 120)}`;
        case 'consent': return `${a.allowed ? 'You allowed' : 'You declined'}: ${a.consent}`;
        case 'session.start': return `Started ${a.provider} in ${a.cwd} (${a.mode})`;
        case 'session.ended': return `Session ended (${a.reason})`;
        case 'mode.set': return `Mode → ${a.mode}`;
        default: return a.cmd ? `${a.kind}: ${a.cmd}` : a.kind;
      }
    };
    const rows = (r.entries || []).slice().reverse().map((a) => h('div.cv-actrow', h('span.muted.cv-small', new Date(a.at).toLocaleTimeString()), h('span', say(a))));
    swap(ui.drawer, drawerHead('Activity on this computer'), h('div.muted.cv-small', 'y3k Code keeps this record on your computer for 30 days. It never leaves it.'), h('div.cv-acts-list', rows));
  }

  // One of the model providers OpenCode reaches, with the person's key for it.
  function viaRow(v) {
    if (v.local) return h('div.cv-via', h('span.cv-viachip.on', v.label), h('span.muted.cv-small', ' — no key: start Ollama on this computer and its models appear.'));
    const key = h('input.cv-keyin', { type: 'password', placeholder: v.keySet ? 'key saved — paste to replace' : `${v.label} key`, autocomplete: 'off', spellcheck: false, 'aria-label': `${v.label} key` });
    const save = h('button.btn', { type: 'button' }, 'Save');
    save.addEventListener('click', async () => {
      const r = await cmd({ cmd: 'provider.setKey', provider: v.id, key: key.value });
      key.value = '';
      if (!r.ok) { toast(r.error); return; }
      S.providers = r.providers; renderProviders(); toast('saved on your computer');
    });
    const clr = v.keySet ? h('button.cv-link', { type: 'button' }, 'remove') : null;
    clr?.addEventListener('click', async () => { const r = await cmd({ cmd: 'provider.clearKey', provider: v.id }); if (r.ok) { S.providers = r.providers; renderProviders(); } });
    return h('div.cv-via',
      h('div.cv-provhead', h('span.cv-viachip' + (v.keySet ? '.on' : ''), v.label), v.keyUrl ? h('a.cv-link.cv-small', { href: v.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'get a key') : null),
      v.notice ? h('div.muted.cv-small', v.notice) : null,
      h('div.cv-keyrow', key, save, clr));
  }

  function renderProviders() {
    const rows = S.providers.map((p) => {
      const key = h('input.cv-keyin', { type: 'password', placeholder: p.keySet ? 'key saved — paste to replace' : `${p.vendor} API key`, autocomplete: 'off', spellcheck: false, 'aria-label': `${p.label} API key` });
      const save = h('button.btn', { type: 'button' }, 'Save');
      save.addEventListener('click', async () => {
        const r = await cmd({ cmd: 'provider.setKey', provider: p.id, key: key.value });
        key.value = '';
        if (!r.ok) { toast(r.error); return; }
        S.providers = r.providers; renderProviders(); toast('saved on your computer');
      });
      const clr = p.keySet ? h('button.cv-link', { type: 'button' }, 'remove') : null;
      clr?.addEventListener('click', async () => { const r = await cmd({ cmd: 'provider.clearKey', provider: p.id }); if (r.ok) { S.providers = r.providers; renderProviders(); } });
      const state = !p.ready ? 'coming soon' : !p.installed ? 'not installed' : p.account?.state === 'signed-in' && p.signIn ? 'signed in' : p.keySet ? 'key saved' : p.signIn ? 'not signed in' : 'needs a key';
      return h('div.cv-prov' + (p.ready ? '' : '.soon'),
        h('div.cv-provhead', h('b', p.label), h('span.muted.cv-small', p.vendor), h('span.cv-grow'), h('span.cv-pstate.s-' + state.replace(/\s/g, '-'), state)),
        p.note ? h('div.muted.cv-small', p.note) : null,
        !p.installed && p.install ? h('div.cv-cmdline', h('code.cm', p.install)) : null,
        !p.installed && p.ready ? (() => { const b = h('button.btn', { type: 'button' }, `Install ${p.label}`); b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Asking on your computer…'; const r = await cmd({ cmd: 'provider.install', provider: p.id }); if (r.providers) S.providers = r.providers; if (!r.ok) toast(r.error); renderProviders(); }); return h('div.cv-acts', b); })() : null,
        p.signIn && p.login && p.installed ? h('div.muted.cv-small', 'Sign in with ', h('code.cm', p.login), ' in a terminal.') : null,
        !p.via ? h('div.cv-keyrow', key, save, clr, p.keyUrl ? h('a.cv-link', { href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'get a key') : null) : null,
        p.via ? h('div.cv-vias', p.via.map((v) => viaRow(v))) : null);
    });
    const refresh = h('button.btn', { type: 'button' }, 'Check again');
    refresh.addEventListener('click', async () => { const r = await cmd({ cmd: 'provider.refresh' }); if (r.ok) { S.providers = r.providers; renderProviders(); } });
    const unpair = transport?.kind === 'companion' ? h('button.cv-link', { type: 'button' }, 'Disconnect this browser') : null;
    unpair?.addEventListener('click', async () => { await transport.revoke(); transport.close(); transport = null; S.conn = 'off'; hello = null; toggleDrawer('providers'); renderHome(); renderChrome(); });
    const comp = companion();
    const notesRow = comp ? h('div.cv-prov', h('div.cv-provhead', h('b', `${comp.name}'s notes`), h('span.cv-grow'),
      (() => { const on = notesOn(); const b = h('button.cv-link', { type: 'button' }, on ? 'turn off' : 'turn on'); b.addEventListener('click', () => { pref('y3k-code:notes', on ? 'off' : 'on'); renderProviders(); }); return b; })()),
      h('div.muted.cv-small', `When a session starts, ${comp.name} writes the coder a short note from what it knows of you. You read it first; it goes only with your first message.`),
      pref('y3k-code:noteback') === 'always' ? h('div.cv-small', 'Lines back are sent without asking. ', (() => { const b = h('button.cv-link', { type: 'button' }, 'ask me again'); b.addEventListener('click', () => { pref('y3k-code:noteback', 'ask'); renderProviders(); }); return b; })()) : null) : null;
    swap(ui.drawer, drawerHead('Coding tools'), h('div.muted.cv-small', 'Keys are kept on your computer by y3k Code, readable only by you. They never reach yearthreethousand.com.'), rows, notesRow, h('div.cv-acts', refresh, unpair));
  }

  return {
    open, close,
    isOpen: () => !!root,
    needsYou: () => needsYou(S),
    // for the site: is anything running (the broadcast lock asks this)
    busy: () => liveSessions(S).length > 0,
    _state: S,
  };
}

function folderName(p) { return String(p || '').split(/[\\/]/).filter(Boolean).pop() || p || ''; }
function prettyModel(m) { return String(m).replace(/^claude-/, '').replace(/-\d{8}$/, ''); }
