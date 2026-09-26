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

function createController({ toast = () => {}, onNeedsYou = () => {}, getAccount = () => null } = {}) {
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
    ui.scroll.addEventListener('scroll', () => { ui.scroll.classList.toggle('scrolled', ui.scroll.scrollTop > 4); });
    const pend = pendingPairing();
    if (pend && !transport) autoPair(pend);
    renderChrome();
    renderDock();
    rebuildTranscript();
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
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
    const hist = h('button.cv-iconbtn', { type: 'button', title: 'Past sessions' }, icon('history'));
    hist.addEventListener('click', () => toggleDrawer('history'));
    const keys = h('button.cv-iconbtn', { type: 'button', title: 'Coding tools and keys' }, icon('key'));
    keys.addEventListener('click', () => toggleDrawer('providers'));
    right.append(hist, keys);

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
    return h('span.cv-branch', icon('branch'), s.branch);
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
    for (const m of MODES) {
      const b = h('button.cv-mode.m-' + m + (s.mode === m ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(s.mode === m), title: MODE_INFO[m].hint, disabled: s.state === 'ended' || !!viewingSid }, MODE_INFO[m].label);
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
    companionName: 'your companion',
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
    const ta = h('textarea.cv-input', {
      rows: 1, placeholder: ended ? 'This session has ended.' : running ? 'Add to what it is doing… (Esc to stop)' : `Tell ${AGENT_NAME[s.provider] || 'it'} what to do…`,
      disabled: ended, 'aria-label': 'Message', spellcheck: true,
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
    const box = h('div.cv-composer' + (running ? '.running' : ''), clip, pick, ta, act);
    swap(ui.dock, strip.length ? h('div.cv-strip', strip) : null, attachments.length ? chips : null, box, ended ? endedBar(s) : hint);
    requestAnimationFrame(fit);
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
    const r = await cmd({ cmd: 'session.send', sid: s.sid, text: text || '(image)', attachments: attachments.length ? attachments.map((a) => ({ type: 'image', mediaType: a.mediaType, data: a.data })) : undefined });
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
    const browse = h('button.btn', { type: 'button' }, icon('folder'), ' Choose a folder…');
    browse.addEventListener('click', () => { home.screen = 'browse'; home.browse = null; loadBrowse(null); });
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
        S.recent.length ? recent : h('div.muted.cv-small', 'No folders yet.'), h('div.cv-acts', browse)));
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
    const r = await cmd({ cmd: 'workspace.open', path });
    if (!r.ok) { home.error = r.code === 'declined' ? 'Not trusted — nothing was started.' : r.error; home.screen = 'folders'; renderHome(); return; }
    home.pending = { path: r.path, name: r.name, findings: r.findings || [], mode: r.mode };
    if (r.mode) return start(r.mode);
    home.screen = 'mode';
    renderHome();
  }

  function modeScreen() {
    const p = home.pending;
    const cards = MODES.map((m) => {
      const b = h('button.cv-modecard.m-' + m + (m === 'ask' ? '.rec' : ''), { type: 'button' }, h('b', MODE_INFO[m].long), h('span', MODE_INFO[m].hint), m === 'ask' ? h('i.cv-rec', 'a good start') : null);
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
    swap(ui.drawer, drawerHead('Past sessions'), rows.length ? h('div.cv-hist', rows) : h('div.muted.cv-small', 'None yet.'));
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
        p.signIn && p.login && p.installed ? h('div.muted.cv-small', 'Sign in with ', h('code.cm', p.login), ' in a terminal.') : null,
        p.ready || p.id !== 'opencode' ? h('div.cv-keyrow', key, save, clr, p.keyUrl ? h('a.cv-link', { href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'get a key') : null) : null,
        p.via ? h('div.cv-via', p.via.map((v) => h('span.cv-viachip' + (v.keySet ? '.on' : ''), { title: v.notice || '' }, v.label))) : null);
    });
    const refresh = h('button.btn', { type: 'button' }, 'Check again');
    refresh.addEventListener('click', async () => { const r = await cmd({ cmd: 'provider.refresh' }); if (r.ok) { S.providers = r.providers; renderProviders(); } });
    const unpair = transport?.kind === 'companion' ? h('button.cv-link', { type: 'button' }, 'Disconnect this browser') : null;
    unpair?.addEventListener('click', async () => { await transport.revoke(); transport.close(); transport = null; S.conn = 'off'; hello = null; toggleDrawer('providers'); renderHome(); renderChrome(); });
    swap(ui.drawer, drawerHead('Coding tools'), h('div.muted.cv-small', 'Keys are kept on your computer by y3k Code, readable only by you. They never reach yearthreethousand.com.'), rows, h('div.cv-acts', refresh, unpair));
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
