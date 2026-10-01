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
import { renderItem, updateItem, childrenOf, agentLine, todoList } from './render/items.js';
import { updateRing, updateBars, updateCost, billingOf } from './render/meters.js';
import { contextPanel } from './render/context-panel.js';
import { makerOf, makerMark, modelName } from './render/maker.js';
import { glassSelect } from '../glass-select.js';
import { renderDiff } from './render/diff.js';
import { contextRing, limitBars, costChip } from './render/meters.js';
import {
  createCompanion, createDesktop, hasDesktopBridge, savedPairing, pendingPairing, clearPending, pair, probe, forgetPairing, movePairing,
} from './transport.js';
import { createOnboard, authOf, needsSetup } from './onboard.js';
import { createVoicer, getRank, setRank, RANK_NAMES, RANK_LINES } from './voice.js';

const AGENT_NAME = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', opencode: 'OpenCode' };
const EFFORT_LABEL = { low: 'low', medium: 'medium', high: 'high', xhigh: 'extra high', max: 'max' };
const MAX_DOM_ITEMS = 400;
// Opening a long session: the newest SYNC_ITEMS are drawn at once, the rest (up
// to MAX_DOM_ITEMS) above them in slices of SLICE_MS, so opening Code, switching
// tabs or a reconnect is never one long task (it was up to 400 items of
// markdown, colour and diffs in one go, landing on the same frames as the orb's
// canvas reallocating). 'show earlier' adds PAGE more at a time, the same way.
const SYNC_ITEMS = 30;
const SLICE_MS = 8;
const PAGE = 100;
const ENTER_LAST = 4;      // on a rebuild only the newest few rise in

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
  // home.pairing: { status: probing|asking|error, port, code, msg } while this
  // browser pairs — drawn by renderHome like every other home screen, so
  // nothing that redraws home can paint over it.
  let home = { screen: 'folders', browse: null, pending: null, pastSessions: null, error: null, pairing: null };
  const els = new Map();   // top-level item uid → element
  // ...and every subagent child drawn inside a Task card too, so a change deep
  // in a subagent patches that one element instead of redrawing the whole card.
  let dirty = new Set();
  let metaDirty = false;
  let engineDirty = false;
  let tabsDirty = false;          // only a background tab's light changed
  const agentDirty = new Set();   // subagents whose progress line moved (taskIds)
  const fresh = new Set();        // uids drawn during this flush — already current
  let shown = null;               // the session object the transcript shows
  let shownAs = null;             // ...and the viewingSid it was drawn under
  let lastUid = 0;              // its newest top-level item on screen
  let shownFrom = 0;              // index in shown.items of its oldest on screen
  let rebuildGen = 0;             // bumped by every rebuild: stale slices stop
  let prepending = false;
  let atBottom = true;            // the reader is at the newest line (see follow)
  let ro = null;
  let raf = 0;
  let hello = null;
  let viewingSid = null;   // a past session opened read-only
  const notes = new Map(); // sid → the presence's note: { state: writing|ready|none, text, presence, include }
  let talkTo = 'coder';    // who the composer speaks to: the coder, or the presence
  let orionAt = 0;         // when something was last said to the presence from here
  let lastReact = null;
  const companion = () => link?.companion?.() || null;
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };
  let downAt = 0;          // when the companion stopped answering (0: it answers)
  // ORION'S VOICE OVER THE CODER (voice.js · code-voice.mjs). Each finished text
  // block of a main-agent reply is said as the presence would say it, at the
  // Personality rank; the coder's own words stay in its own session.
  // Only a reply drawn on screen is patched when its voice comes back: one from
  // a session in another tab was appended to the transcript in view, as if
  // this session's coder had said it. One not drawn yet takes its voice when it
  // is (renderItem reads b.voice).
  const voicer = createVoicer({ link, onVoiced: (it) => { if (els.has(it.uid)) { dirty.add(it); frame(); } }, express: (x) => link?.express?.(x) });

  // The front door — first run, pairing, "isn't running", sign-in — drawn by
  // onboard.js; these are the only ways it reaches back in here.
  const ob = createOnboard({
    cmd: (o) => cmd(o),
    toast: (m) => toast(m),
    setup: () => link?.setup?.() ?? null,
    connected: (port, token) => { movePairing(port, token); usePairing(); },
    pairWith: (port, code) => doPair(port, code),
    providersChanged: (list) => { if (Array.isArray(list)) S.providers = list; redrawHome(); if (ui && drawerKind === 'providers') renderProviders(); },
    redraw: () => redrawHome(),
    redrawTools: () => { if (ui && drawerKind === 'providers') renderProviders(); },
    forgetPairing: () => { forgetPairing(); transport?.close(); transport = null; hello = null; S.conn = 'unpaired'; redrawHome(); },
    retryDesktop: () => { transport?.close(); transport = null; hello = null; connect(); redrawHome(); },
  });

  // --- connection ---------------------------------------------------------------
  function connect() {
    if (transport) return;
    const handlers = {
      onEvent,
      onStatus: (st) => {
        S.conn = st;
        if (st === 'connected') { downAt = 0; refreshHello(); }
        if (st === 'unpaired') { transport?.close(); transport = null; forgetPairing(); }
        // A blip (an engine restart) is back within a second; home says
        // "isn't running" only once it has been gone for 3.
        if ((st === 'reconnecting' || st === 'offline') && !downAt) { downAt = Date.now(); setTimeout(() => schedule('engine'), 3100); }
        schedule('engine');
      },
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
    if (!transport) return Promise.resolve({ ok: false, error: 'Not connected to y3kode on this computer.', code: 'offline' });
    return transport.cmd(obj);
  }

  function onEvent(e) {
    if (e.type === 'orb.move') { moveOrb(e); return; }
    const was = e.sid ? S.sessions.get(e.sid) : null;
    const wasUnread = !!was?.unread;
    const out = apply(S, e);
    if (out.engine) engineDirty = true;
    if (e.type === 'message.block' && e.kind === 'text' && !e.parentCallId) {
      const s = S.sessions.get(e.sid);
      const it = s?.byKey.get('m:' + e.id);
      const b = it?.blocks.find((x) => x.i === (e.block | 0));
      if (it && b && it.parentUid == null) voicer.block({ item: it, block: b, where: s.cwd ? folderName(s.cwd) : '' });
    }
    if (out.sid && !S.active && !viewingSid && e.type === 'session.started') S.active = out.sid;
    const here = !!out.sid && out.sid === currentSession()?.sid;
    // A session in another tab changes only its tab: its state, its question,
    // its unread light. Its words, and its meta events too (a subagent's
    // progress line, usage, state), used to mark the whole toolbar and the
    // composer for rebuilding, so two sessions streaming at once meant both
    // redrawn up to 60 times a second — an open <select> snapped shut, the
    // composer lost its caret, every pulse restarted — to light a tab that was
    // usually lit already. (Plan limits are the account's, shown from whichever
    // session heard them last, so those still reach the meters.)
    if (out.meta) { if (!out.sid || here || e.type === 'usage.limits') metaDirty = true; else tabsDirty = true; }
    // only the session on screen redraws; the others catch up when opened
    if (here) {
      for (const it of out.changed) dirty.add(it);
      if (e.type === 'subagent.progress' && e.taskId) agentDirty.add(e.taskId);
    } else if (out.sid && out.changed.length && !wasUnread) tabsDirty = true;
    onNeedsYou(needsYou(S));
    reactTo(e);
    if (e.type === 'session.ended') offerNoteBack(S.sessions.get(e.sid));
    frame();
  }

  // THE CODER MOVING THE ORB (y3k-code/orb.mjs): its words go to the house's
  // own kommands, exactly as if typed in the chat, and what they understood
  // goes back to the coder. A reconnect replays the engine's recent events, so
  // a move is played once, and only while it is fresh.
  const orbMoves = new Set();
  function moveOrb(e) {
    if (!e.id || orbMoves.has(e.id)) return;
    orbMoves.add(e.id);
    if (orbMoves.size > 200) orbMoves.delete(orbMoves.values().next().value);
    if (e.at && Math.abs(Date.now() - e.at) > 10000) return;
    const r = link?.kommand ? link.kommand(String(e.kommand || '')) : { ok: false, why: 'This page has no orb.' };
    cmd({ cmd: 'orb.done', move: String(e.id).slice(0, 20), ok: !!r?.ok, ...(r?.said ? { said: String(r.said).slice(0, 400) } : {}), ...(r?.why ? { why: String(r.why).slice(0, 600) } : {}) }).catch(() => {});
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

  // One pass per frame, writes only: the toolbar and the dock are patched in
  // place, each changed item is patched where it stands (a reply keeps its
  // element for its whole life), and following the newest line is left to the
  // scroll listener and a ResizeObserver (see follow) — nothing here reads the
  // layout. It used to read it twice per flush (scrollHeight before the item
  // swaps and again after), each a full synchronous layout of the pane.
  function flush() {
    raf = 0;
    if (!root) { dirty.clear(); agentDirty.clear(); return; }
    const s = currentSession();
    if (engineDirty) { engineDirty = false; renderChrome(); if (!s) renderHome(); }
    else if (metaDirty) renderBar(s);
    else if (tabsDirty) renderTabs(s);
    if (metaDirty) renderDock();
    metaDirty = false;
    tabsDirty = false;
    // a session became the one to show without anyone asking for it (started
    // from another page, or by the engine): draw it, don't patch into another
    if (s && (s !== shown || viewingSid !== shownAs)) rebuildTranscript();
    else if (s && (dirty.size || agentDirty.size)) {
      fresh.clear();
      for (const it of dirty) patchItem(it);
      for (const id of agentDirty) {
        const a = s.agents.get(id);
        const t = a?.callId && s.byKey.get('t:' + a.callId);
        if (t) agentLine(els.get(t.uid), a.text);
      }
      fresh.clear();
      if (!ro && atBottom) ui.scroll.scrollTop = ui.scroll.scrollHeight; // no ResizeObserver: the old way
    }
    dirty.clear();
    agentDirty.clear();
  }

  const currentSession = () => (viewingSid ? S.sessions.get(viewingSid) : activeSession(S));

  // --- the frame ------------------------------------------------------------------
  function open() {
    connect();
    // Already open: a pairing link that arrived since (main.js, hashchange)
    // is still this screen's to act on.
    if (root) { pairFromLink(); if (home.pairing) redrawHome(); return; }
    dropLeaving();
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
    // (the orb's column is hidden while it resizes by social.showView, in the
    // same task that moves it — see body.code-shifting there)
    follow();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('y3k:chat', onChat);
    ui.scroll.addEventListener('scroll', () => { ui.scroll.classList.toggle('scrolled', ui.scroll.scrollTop > 4); });
    pairFromLink();
    renderChrome();
    renderDock();
    rebuildTranscript();
  }

  function close() {
    closePanel();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('y3k:chat', onChat);
    lastReact = null;
    leave(root);
    root = null; ui = null;
    els.clear();
    ro?.disconnect(); ro = null;
    rebuildGen++; prepending = false;
    shown = null; bar = null; dockUi = null;
    tabEls.clear();
  }

  // Leaving fades the room out (0.2s, the same as the orb's column fades back
  // in) instead of cutting to the room behind; it takes no clicks meanwhile.
  let leaving = null;
  function leave(el) {
    if (!el) return;
    dropLeaving();
    leaving = el;
    el.classList.add('leaving');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(() => { el.remove(); if (leaving === el) leaving = null; }, 220);
  }
  function dropLeaving() { leaving?.remove(); leaving = null; }

  // --- toolbar -----------------------------------------------------------------------
  function renderChrome() {
    if (!ui) return;
    const s = currentSession();
    renderBar(s);
    renderBanners(s);
  }

  // THE CONTEXT PANEL (render/context-panel.js): Claude's context-window
  // popover, in y3k's glass. The ring and the plan bars open it; it asks for
  // fresh numbers as it opens, follows them while open, and closes on Escape,
  // a click elsewhere, or the same click again.
  const panel = { open: false, details: false, el: null };
  function togglePanel() { if (panel.open) closePanel(); else openPanel(); }
  function openPanel() {
    const s = currentSession();
    if (!s || !ui) return;
    panel.open = true;
    cmd({ cmd: 'session.contextUsage', sid: s.sid }).catch(() => {});
    cmd({ cmd: 'session.limits', sid: s.sid }).catch(() => {});
    renderPanel();
  }
  function closePanel() {
    panel.open = false;
    panel.el?.remove();
    panel.el = null;
  }
  function renderPanel() {
    const s = currentSession();
    if (!panel.open || !s || !ui || !bar?.ring) { if (panel.open) closePanel(); return; }
    const plan = billingOf({ authSource: s.authSource, account: S.accounts?.[s.provider] }).plan;
    const el = contextPanel({
      ctx: s.usage.context, limits: s.usage.limits || lastLimits(), plan, open: panel.details, busy: s.state === 'running',
      onToggle: () => { panel.details = !panel.details; renderPanel(); },
      onCompact: async () => {
        closePanel();
        const r = await cmd({ cmd: 'session.send', sid: s.sid, text: '/compact' });
        if (!r?.ok) toast(r?.error || 'could not compact the session');
      },
    });
    // fixed, under the ring, its right edge on the toolbar's right edge
    const at = bar.ring.getBoundingClientRect();
    const right = bar.right?.getBoundingClientRect?.() || at;
    el.style.top = Math.round(at.bottom + 8) + 'px';
    el.style.right = Math.max(12, Math.round(window.innerWidth - right.right)) + 'px';
    if (panel.el) panel.el.replaceWith(el); else root.appendChild(el);
    panel.el = el;
  }
  // a click outside closes it — the ring and bars toggle it themselves
  document.addEventListener('pointerdown', (e) => {
    if (!panel.open || !panel.el) return;
    if (panel.el.contains(e.target) || e.target.closest?.('.mt-ctx, .mt-limits')) return;
    closePanel();
  }, true);

  // THE TOOLBAR IS PATCHED, NOT REBUILT. It was torn down and made again on
  // every meta event — usage, git, todos, each subagent's progress line — and,
  // through its tabs, on every delta from a session in another tab. That
  // snapped an open model or effort <select> shut under the cursor, restarted
  // every pulse on the tabs, and left the meters no element that lived long
  // enough for their sweep and width transitions to run. Now the bar is built
  // once per open(); each session keeps its tab and only its classes change;
  // the meters move in place; each control is redrawn only when what it shows
  // changes (its key), and a <select> never while it has focus.
  let bar = null;
  const tabEls = new Map();   // sid → its tab
  function renderBar(s) {
    if (!ui) return;
    if (!bar) {
      const plus = h('button.cv-tab.cv-new', { type: 'button', title: 'New session' }, icon('plus'));
      plus.addEventListener('click', () => { viewingSid = null; S.active = null; home.screen = 'folders'; rebuildTranscript(); renderChrome(); renderDock(); });
      const right = toolButtons();
      bar = {
        tabs: h('div.cv-tabs', { role: 'tablist' }), plus, right, tools: [...right.children],
        ring: null, bars: null, cost: null, tell: slot(),
        row2: h('div.cv-controls'), folder: slot(), provider: slot(), model: slot(), effort: slot(), modes: slot(), persona: slot(),
      };
      bar.row = h('div.cv-row', bar.tabs, right);
      bar.right = right;
      // the ring and the plan bars open the context panel
      right.addEventListener('click', (e) => { if (e.target.closest('.mt-ctx, .mt-limits')) togglePanel(); });
      right.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.mt-ctx, .mt-limits')) { e.preventDefault(); togglePanel(); } });
      // a <select> whose redraw waited for it to lose focus gets it now
      bar.row2.addEventListener('focusout', () => schedule('meta'));
    }
    renderTabs(s);
    renderMeters(s);
    renderControls(s);
    arrange(ui.bar, [bar.row, s ? bar.row2 : null]);
  }

  // tabs: every running session, plus the one being viewed
  function renderTabs(s) {
    if (!ui) return;
    if (!bar) { renderBar(s); return; }
    const list = S.order.map((sid) => S.sessions.get(sid)).filter((x) => x && (x.state !== 'ended' || x.sid === S.active || x.sid === viewingSid));
    const kids = [];
    for (const x of list) {
      let t = tabEls.get(x.sid);
      if (!t) {
        const sid = x.sid;
        t = h('button.cv-tab', { type: 'button', role: 'tab' }, h('i.cv-tabdot'), h('span.cv-tabname'));
        t.addEventListener('click', () => { const y = S.sessions.get(sid); if (!y) return; viewingSid = null; S.active = sid; y.unread = false; rebuildTranscript(); renderChrome(); renderDock(); });
        tabEls.set(sid, t);
      }
      const on = !!s && x.sid === s.sid;
      // `unread`: something happened there since you last looked — the dot lights
      put(t, 'className', 'cv-tab' + (on ? ' on' : '') + (x.waiting ? ' ask' : '') + (x.state === 'running' ? ' run' : '') + (x.state === 'ended' ? ' ended' : '') + (x.unread && !on ? ' unread' : ''));
      if (t.getAttribute('aria-selected') !== String(on)) t.setAttribute('aria-selected', String(on));
      put(t, 'title', `${x.title || 'new session'} — ${x.cwd}`);
      put(t.lastChild, 'textContent', x.title || folderName(x.cwd) || 'new session');
      kids.push(t);
    }
    for (const sid of [...tabEls.keys()]) if (!list.some((x) => x.sid === sid)) tabEls.delete(sid);
    kids.push(bar.plus);
    arrange(bar.tabs, kids);
  }

  function renderMeters(s) {
    const lim = s ? (s.usage.limits || lastLimits()) : lastLimits();
    if (s) {
      if (bar.ring) updateRing(bar.ring, s.usage.context); else { bar.ring = contextRing(s.usage.context); bar.ring.tabIndex = 0; bar.ring.setAttribute('role', 'button'); }
      const billing = billingOf({ authSource: s.authSource, account: S.accounts?.[s.provider] });
      if (bar.cost) updateCost(bar.cost, s.usage.cost, billing); else bar.cost = costChip(s.usage.cost, billing);
    }
    if (s || lim) {
      const next = bar.bars ? updateBars(bar.bars, lim) : limitBars(lim);
      if (bar.bars && next !== bar.bars) bar.bars.replaceWith(next);
      bar.bars = next;
    }
    const comp = companion();
    keyed(bar.tell, s && comp && s.usage.turns && !told.has(s.sid) && !s.noteBack ? `${s.sid}|${comp.name}` : null, () => {
      const tell = h('button.cv-iconbtn.cv-tell', { type: 'button', title: `Tell ${comp.name} about this session` }, h('span.or-dot'));
      tell.addEventListener('click', () => { s.noteBack = { text: draftBack(s) }; renderDock(); renderMeters(currentSession()); });
      return tell;
    });
    arrange(bar.right, [s ? bar.ring : null, s || lim ? bar.bars : null, s ? bar.cost : null, bar.tell.el, ...bar.tools]);
    if (bar.bars && !bar.bars.hasAttribute('tabindex')) { bar.bars.tabIndex = 0; bar.bars.setAttribute('role', 'button'); }
    if (panel.open) renderPanel();
  }

  function renderControls(s) {
    if (!s) return;
    const off = s.state === 'ended' || !!viewingSid;
    const p = S.providers.find((x) => x.id === s.provider);
    keyed(bar.folder, [s.sid, s.cwd, s.branch, s.git?.files?.length || 0, s.git?.ahead || 0].join('|'),
      () => h('span.cv-chip.cv-folder', { title: s.cwd }, icon('folder'), h('span', folderName(s.cwd)), gitChip(s)));
    keyed(bar.provider, [s.sid, s.provider, s.state === 'ended' ? 'off' : s.state === 'running' ? 'run' : 'ok', p?.label, p?.version].join('|'), () => providerChip(s));
    if (!holds(bar.model)) keyed(bar.model, [s.sid, s.model, off, JSON.stringify(modelOptions(s.provider))].join('|'), () => modelSelect(s));
    if (!holds(bar.effort)) keyed(bar.effort, [s.sid, s.model, s.effort, off, JSON.stringify(modelOptions(s.provider).find((o) => o.id === s.model)?.efforts || null)].join('|'), () => effortSelect(s));
    keyed(bar.modes, [s.sid, s.mode, off, s.provider, (p?.modes || MODES).join()].join('|'), () => modeSwitch(s));
    keyed(bar.persona, 'persona', personaSlider);   // built once: its own input keeps it current
    arrange(bar.row2, [bar.folder.el, bar.provider.el, bar.model.el, bar.effort.el, bar.modes.el, bar.persona.el]);
  }

  // --- patching helpers ----------------------------------------------------------------
  // A slot shows one piece that is redrawn only when its key changes; a null key
  // shows nothing. Where it sits is arrange()'s business.
  function slot() { return { key: undefined, el: null }; }
  function keyed(sl, key, build) {
    if (sl.key === key) return sl.el;
    sl.key = key;
    const el = key == null ? null : build() || null;
    if (sl.el?.parentNode && el) sl.el.replaceWith(el);
    else sl.el?.remove();
    sl.el = el;
    return el;
  }
  // focus inside: the person is using it (an open <select>, a half-made choice)
  const holds = (sl) => !!sl.el && ((!!document.activeElement && sl.el.contains(document.activeElement)) || !!sl.el.querySelector?.('.gs.open'));
  const put = (o, k, v) => { if (o[k] !== v) o[k] = v; };
  // Make `parent`'s children exactly `kids` (nulls skipped), in order, moving
  // only what is out of place: an element that stays is never taken out and put
  // back, so its focus, caret and running animation all survive.
  function arrange(parent, kids) {
    let at = parent.firstChild;
    for (const k of kids) {
      if (!k) continue;
      if (k === at) at = at.nextSibling;
      else parent.insertBefore(k, at);
    }
    while (at) { const n = at.nextSibling; parent.removeChild(at); at = n; }
  }

  // The toolbar's own buttons, made once with the bar.
  function toolButtons() {
    const right = h('div.cv-meters');
    const hist = h('button.cv-iconbtn', { type: 'button', title: 'Past sessions' }, icon('history'));
    hist.addEventListener('click', () => toggleDrawer('history'));
    const keys = h('button.cv-iconbtn', { type: 'button', title: 'Coding tools and keys' }, icon('key'));
    keys.addEventListener('click', () => toggleDrawer('providers'));
    const plug = h('button.cv-iconbtn', { type: 'button', title: 'Connectors' }, icon('plug'));
    plug.addEventListener('click', () => toggleDrawer('connectors'));
    const act = h('button.cv-iconbtn', { type: 'button', title: 'What y3k Code did on this computer' }, icon('activity'));
    act.addEventListener('click', () => toggleDrawer('activity'));
    right.append(plug, act, hist, keys);
    return right;
  }

  // Redrawn with the rest of the chrome (engine events, switching sessions),
  // not on the meta events of a running turn.
  function renderBanners(s) {
    // banners: asking on the computer, connection
    const banners = [];
    for (const [, c] of S.consent) banners.push(ob.consentNote(c, transport));
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
    if (fromSession?.length) return fromSession.map((m) => ({ id: m.id, label: m.label || m.id, description: m.description || '', efforts: m.efforts || [] }));
    const p = S.providers.find((x) => x.id === provider);
    return (p?.models || [{ id: 'default', label: 'Default' }]).map((m) => ({ id: m.id, label: m.label, description: m.description || '', efforts: [] }));
  }

  function modelSelect(s) {
    const opts = modelOptions(s.provider);
    const cur = s.model || 'default';
    const sel = h('select.cv-select', { title: 'Model', disabled: s.state === 'ended' || !!viewingSid, 'aria-label': 'Model' });
    let has = false;
    for (const o of opts) {
      const op = h('option', { value: o.id }, o.label);
      if (o.description) op.dataset.desc = o.description;
      if (o.id === cur || (cur && o.id !== 'default' && cur.includes(o.id))) { op.selected = true; has = true; }
      sel.appendChild(op);
    }
    if (!has && cur) { const op = h('option', { value: cur }, prettyModel(cur)); op.selected = true; sel.prepend(op); }
    const setModel = async (model) => {
      const r = await cmd({ cmd: 'session.setModel', sid: s.sid, model });
      if (!r.ok) toast(r.error || 'could not change the model');
    };
    sel.addEventListener('change', () => setModel(sel.value));
    // every model the tool offers, each with its line; and any other by name
    const pick = glassSelect(sel, { other: { label: 'Another model…', placeholder: 'type a model name, then Return', pick: setModel } });
    return h('span.cv-sel', icon('agent'), pick);
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
    return h('span.cv-sel', glassSelect(sel));
  }

  // PERSONALITY: how much of the presence is in what the coder says (voice.js).
  // Five ranks, remembered on this device; it applies to the next message.
  function personaSlider() {
    const name = h('span.cv-persona-name', RANK_NAMES[getRank()]);
    const input = h('input.cv-persona-range', { type: 'range', min: '1', max: '5', step: '1', value: String(getRank()), 'aria-label': 'Personality' });
    const wrap = h('label.cv-persona', { title: RANK_LINES[getRank()] }, h('span.cv-persona-label', 'Personality'), input, name);
    input.addEventListener('input', () => { const r = setRank(input.value); name.textContent = RANK_NAMES[r]; wrap.title = RANK_LINES[r]; });
    return wrap;
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
      setDraft(String(text || '').trim());
      renderDock();
      const ta = dockUi?.ta;
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    },
    // A Task card asks for its subagent's items as it builds its body: the ones
    // already drawn are handed back and move into the new card, so redrawing a
    // card's head never redraws everything the subagent did.
    renderChild: (it) => els.get(it.uid) || draw(it),
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

  function draw(it) {
    const el = renderItem(it, ctx);
    el.dataset.uid = String(it.uid);
    els.set(it.uid, el);
    fresh.add(it.uid);
    return el;
  }

  // The rise-in plays once, when an item first appears. It used to be on every
  // .it, and every change drew a new element — so a streaming reply restarted
  // it 30-60 times a second, sitting at a third of its opacity and a few pixels
  // low, flickering, until the stream paused. The class comes off when the
  // animation ends (or a second later, if it never runs), so an element that is
  // later moved — into a redrawn Task card — does not rise again.
  function enter(el) {
    el.classList.add('enter');
    // its own settling, not the glint on its glass (::before) nor anything inside it
    const off = (e) => { if (e && (e.target !== el || e.pseudoElement)) return; el.classList.remove('enter'); el.removeEventListener('animationend', off); };
    el.addEventListener('animationend', off);
    setTimeout(off, 1000);
  }

  // One changed item, patched where it stands.
  function patchItem(it) {
    if (fresh.has(it.uid)) return;
    const el = els.get(it.uid);
    if (el) {
      const next = updateItem(it, el, ctx);
      if (next !== el) { next.dataset.uid = String(it.uid); els.set(it.uid, next); el.replaceWith(next); }
      return;
    }
    if (it.parentUid != null) {
      // new in a subagent: added to its card's list — if the card is on screen
      // and has been opened (a shut card draws its children when it opens)
      const kids = childrenOf(els.get(it.parentUid));
      if (kids) { const c = draw(it); enter(c); kids.appendChild(c); }
      return;
    }
    // an older item — trimmed away, or in a slice not drawn yet — is drawn as it
    // is by then, if it ever is
    if (!ui || it.uid <= lastUid) return;
    ui.list.querySelector(':scope > .cv-empty')?.remove(); // the conversation has begun
    const c = draw(it);
    enter(c);
    ui.list.appendChild(c);
    lastUid = it.uid;
    trim();
  }

  // An element leaving the transcript takes its subagent children's entries
  // with it.
  function forget(el) {
    els.delete(Number(el.dataset.uid));
    for (const d of el.querySelectorAll('[data-uid]')) els.delete(Number(d.dataset.uid));
  }

  // The DOM holds the newest few hundred; older ones are one click away. Never
  // while the person is reading back up the page: lines taken from above a
  // reader move what they are reading.
  // (Nor while older items are still going in above: they would be taken off
  // the top as fast as the slices put them there.)
  function trim() {
    if (!atBottom || prepending || ui.list.childElementCount <= MAX_DOM_ITEMS + 1) return;
    for (let el = ui.list.querySelector(':scope > .it'); el && ui.list.childElementCount > MAX_DOM_ITEMS; el = ui.list.querySelector(':scope > .it')) {
      forget(el);
      el.remove();
      shownFrom++;
    }
    olderButton();
  }

  // "show N earlier", above the oldest item on screen, while there are any.
  function olderButton() {
    const n = shown ? shownFrom : 0;
    if (n > 0) {
      if (!ui.older) {
        ui.older = h('button.cv-older', { type: 'button' });
        ui.older.addEventListener('click', showEarlier);
      }
      put(ui.older, 'textContent', `show ${n} earlier`);
      if (ui.list.firstChild !== ui.older) ui.list.prepend(ui.older);
    } else ui.older?.remove();
  }

  // Older items go in above the oldest one on screen, drawn newest-first in
  // slices of SLICE_MS on their own tasks (MessageChannel; setTimeout where it
  // is missing — never requestIdleCallback, which older iOS WebKit lacks). A
  // reader who is not at the bottom keeps their place: the first item's
  // position is measured before and after, once per slice, not per frame.
  function prepend(s, from, done) {
    const gen = rebuildGen;
    prepending = true;
    const step = () => {
      if (gen !== rebuildGen || !ui || shown !== s) return;
      const t0 = performance.now();
      const anchor = ui.list.querySelector(':scope > .it');
      const keep = !atBottom && anchor ? anchor.getBoundingClientRect().top : null;
      const made = [];
      let i = shownFrom;
      while (i > from && (!made.length || performance.now() - t0 < SLICE_MS)) made.push(draw(s.items[--i]));
      const frag = document.createDocumentFragment();
      for (let k = made.length - 1; k >= 0; k--) frag.appendChild(made[k]);
      ui.list.insertBefore(frag, anchor);
      fresh.clear();
      shownFrom = i;
      if (keep != null) { const moved = anchor.getBoundingClientRect().top - keep; if (moved) ui.scroll.scrollTop += moved; }
      olderButton();
      if (i > from) later(step);
      else { prepending = false; done?.(); }
    };
    later(step);
  }

  function showEarlier() {
    if (!ui || !shown || prepending || shownFrom <= 0) return;
    prepend(shown, Math.max(0, shownFrom - PAGE));
  }

  // Draw the session on screen from scratch: opening Code, another tab, a
  // session started or continued. The same session already on screen is left
  // as it is — a reconnect (sleep and wake, a dropped stream) used to redraw
  // everything and yank a reader who had scrolled up back to the bottom.
  function rebuildTranscript() {
    if (!ui) return;
    const s = currentSession();
    // (a past session continued under the same sid is drawn again: it was
    // drawn read-only, without the buttons a live one has)
    if (s && s === shown && viewingSid === shownAs) { s.unread = false; renderDock(); return; }
    rebuildGen++;
    prepending = false;
    clear(ui.list);
    els.clear();
    ui.older = null;
    shown = s || null;
    shownAs = viewingSid;
    ui.scroll.hidden = !s;
    ui.homeEl.hidden = !!s;
    if (!s) { renderHome(); return; }
    s.unread = false;
    const items = s.items;
    const from = Math.max(0, items.length - MAX_DOM_ITEMS);
    const sync = Math.max(from, items.length - SYNC_ITEMS);
    for (let i = sync; i < items.length; i++) {
      const el = draw(items[i]);
      if (i >= items.length - ENTER_LAST) enter(el);
      ui.list.appendChild(el);
    }
    fresh.clear();
    shownFrom = sync;
    lastUid = items.length ? items[items.length - 1].uid : 0;
    if (!items.length) ui.list.appendChild(emptySession(s));
    olderButton();
    if (sync > from) prepend(s, from);
    renderDock();
    pin();
  }

  function emptySession(s) {
    return h('div.cv-empty', h('div.cv-emptymark', icon('laptop')), h('div.cv-emptytitle', `${AGENT_NAME[s.provider] || 'The coder'} is ready in ${folderName(s.cwd)}`),
      h('div.muted', `${MODE_INFO[s.mode]?.long || ''} — ${MODE_INFO[s.mode]?.hint || ''}`));
  }

  // FOLLOWING THE NEWEST LINE, without asking the layout. The scroll listener
  // keeps `atBottom` (reading scrollTop there is free: the layout is clean when
  // scroll events fire), and a ResizeObserver on the list — which runs after
  // layout — pins the view to the bottom whenever the transcript grows and the
  // reader was there. It also catches growth nothing else sees: a fold opened,
  // the final pass of a reply, the composer getting taller. Scrolling UP leaves
  // the bottom at once (within 8px); coming back down within 120px rejoins it.
  function follow() {
    atBottom = true;
    let lastTop = 0;
    const sc = ui.scroll;
    sc.addEventListener('scroll', () => {
      const gap = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
      atBottom = sc.scrollTop < lastTop - 1 ? gap < 8 : gap < 120;
      lastTop = sc.scrollTop;
    }, { passive: true });
    if (typeof ResizeObserver !== 'function') return;
    ro = new ResizeObserver(() => { if (atBottom && ui) ui.scroll.scrollTop = ui.scroll.scrollHeight; });
    ro.observe(ui.list);
    ro.observe(ui.scroll);
  }
  // To the bottom, and stay there. Observing afresh makes the observer report
  // after the next layout even if nothing changed size, so this never forces a
  // layout itself.
  function pin() {
    atBottom = true;
    if (!ui) return;
    if (ro) { ro.unobserve(ui.list); ro.observe(ui.list); return; }
    requestAnimationFrame(() => { if (ui && atBottom) ui.scroll.scrollTop = ui.scroll.scrollHeight; });
  }
  const scrollToBottom = pin;

  // --- dock: todos, agents, composer --------------------------------------------------------
  // THE COMPOSER IS BUILT ONCE per open() and patched in place. It was rebuilt —
  // textarea and all — on every meta event, and a running turn is a steady
  // stream of them (state, todos, usage, git, each subagent's progress line):
  // anyone typing "Add to what it is doing…" lost focus, caret, IME composition
  // and undo history at random moments, and the running orbit restarted from
  // 0° each time. Now the textarea lives as long as the room; the placeholder,
  // the classes and the send/stop button change in place, its handlers ask
  // which session is current when they run, and the strip above it (todos,
  // agents, the presence's cards) is redrawn only when what it shows changes.
  let draft = '';
  let attachments = [];
  let attachVer = 0;            // bumped whenever attachments change
  let dockUi = null;
  // Chromium 123+ grows a textarea with its text in CSS (field-sizing), with no
  // measuring at all; elsewhere fit() measures, and only when the text changes.
  const FIELD_SIZING = typeof CSS !== 'undefined' && !!CSS.supports?.('field-sizing', 'content');

  function buildDock() {
    const ta = h('textarea.cv-input', { rows: 1, 'aria-label': 'Message', spellcheck: true });
    ta.value = draft;
    ta.addEventListener('input', () => { draft = ta.value; fit(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); const s = currentSession(); if (s) send(s, ta); }
    });
    ta.addEventListener('paste', (e) => {
      for (const f of e.clipboardData?.files || []) if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { e.preventDefault(); addImage(f); }
    });
    const pick = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, hidden: true });
    pick.addEventListener('change', () => { for (const f of pick.files) addImage(f); pick.value = ''; });
    const clip = h('button.cv-iconbtn', { type: 'button', title: 'Attach an image' }, icon('image'));
    clip.addEventListener('click', () => pick.click());
    const act = h('button.cv-send', { type: 'button' });
    act.addEventListener('click', () => {
      const s = currentSession();
      if (!s) return;
      if (act.dataset.kind === 'stop') interrupt(s); else send(s, ta);
    });
    // the running orbit: a layer turned by transform (see .cv-orbit)
    const orbit = h('i.cv-orbit', { 'aria-hidden': 'true' });
    const d = { ta, pick, clip, act, orbit, box: h('div.cv-composer'), strip: h('div.cv-strip'),
      todos: slot(), agents: slot(), card: slot(), to: slot(), chips: slot(), foot: slot() };
    if (draft && !FIELD_SIZING) requestAnimationFrame(fit);
    return d;
  }

  function fit() {
    if (FIELD_SIZING || !dockUi) return;
    const ta = dockUi.ta;
    ta.style.height = 'auto';
    ta.style.height = Math.min(280, ta.scrollHeight) + 'px';
  }
  // Words put into the composer from here (pass to, sent, cleared).
  function setDraft(text) {
    draft = text;
    if (dockUi && dockUi.ta.value !== text) { dockUi.ta.value = text; fit(); }
  }

  function renderDock() {
    if (!ui) return;
    const s = currentSession();
    if (!s) { ui.dock.hidden = true; return; }
    ui.dock.hidden = false;
    const d = dockUi ||= buildDock();
    const ended = s.state === 'ended' || !!viewingSid;
    const running = s.state === 'running' || s.state === 'waiting';
    const comp = companion();
    const toOrion = talkTo === 'orion' && !!comp;

    // the strip: todos, the agents at work, the presence's cards
    keyed(d.todos, s.todos.length ? s.sid + JSON.stringify(s.todos) : null, () => {
      const done = s.todos.filter((t) => t.status === 'completed').length;
      const el = h('details.cv-todos', { open: s.todosOpen !== false },
        h('summary', icon('todo'), `${done} of ${s.todos.length} done`, h('span.cv-todonow', (s.todos.find((t) => t.status === 'in_progress') || {}).activeForm || '')),
        todoList(s.todos));
      el.addEventListener('toggle', () => { s.todosOpen = el.open; });
      return el;
    });
    const agents = [...s.agents.values()].filter((a) => a.status === 'running');
    const ag = keyed(d.agents, agents.length ? s.sid + agents.map((a) => `|${a.taskId}:${a.description}:${a.agentType}`).join('') : null,
      () => h('div.cv-agents', agents.map((a) => h('span.ag-chip.run', h('i.td-spin'), a.description || a.agentType || 'agent'))));
    if (ag) agents.forEach((a, i) => { if (ag.children[i]) put(ag.children[i], 'title', a.text || a.description || ''); });
    const n = notes.get(s.sid);
    keyed(d.card, [s.sid, comp?.name, viewingSid, n ? `${n.state}:${n.include}:${s.items.some((i) => i.kind === 'user')}` : '', s.noteBack && !told.has(s.sid) ? 'back' : ''].join('|'),
      () => noteCard(s) || noteBackCard(s));
    arrange(d.strip, [d.todos.el, d.agents.el, d.card.el]);

    keyed(d.chips, attachments.length ? 'a' + attachVer : null, () => h('div.cv-attach', attachments.map((a, i) => h('span.cv-att', h('img', { src: a.url, alt: '' }),
      h('button', { type: 'button', title: 'Remove', onclick: () => { attachments.splice(i, 1); attachVer++; renderDock(); } }, icon('close'))))));

    // the composer. At its edge, who answers: the maker's mark and the model
    // (it codes, and moves the orb) — pressed, a small orb: the presence alone.
    // The button lives while the model does, so the turn from one to the other
    // is a transition, not a redraw.
    const model = modelName(lastModel(s) || s.model);
    const who = keyed(d.to, `${makerOf(s.provider, lastModel(s) || s.model)}|${model}|${comp?.name || ''}`, () => whoButton(s, model));
    if (who) {
      const agent = AGENT_NAME[s.provider] || 'The coder';
      who.classList.toggle('orion', toOrion);
      if (who.getAttribute('aria-pressed') !== String(toOrion)) who.setAttribute('aria-pressed', String(toOrion));
      put(who, 'title', toOrion ? `Talking to ${comp.name} alone — no hands on the computer. Press to bring back ${agent}.`
        : comp ? `${agent} · ${model} — it codes, and moves the orb. Press to talk to ${comp.name} alone.` : `${agent} · ${model}`);
      put(who.lastChild, 'textContent', toOrion ? comp.name : model);
    }
    d.box.classList.toggle('running', running && !toOrion);
    d.box.classList.toggle('to-orion', toOrion);
    put(d.ta, 'placeholder', toOrion ? `Say something to ${comp.name}…` : ended ? 'This session has ended.' : running ? 'Add to what it is doing… (Esc to stop)' : `Tell ${AGENT_NAME[s.provider] || 'it'} what to do…`);
    put(d.ta, 'disabled', ended && !toOrion);
    put(d.clip, 'disabled', ended);
    const kind = running && !toOrion ? 'stop' : 'send';
    if (d.act.dataset.kind !== kind) {
      d.act.dataset.kind = kind;
      d.act.classList.toggle('stop', kind === 'stop');
      d.act.title = kind === 'stop' ? 'Stop (Esc)' : 'Send (Enter)';
      swap(d.act, icon(kind));
    }
    put(d.act, 'disabled', kind === 'send' && ended && !toOrion);
    arrange(d.box, [d.orbit, who, d.clip, d.pick, d.ta, d.act]);

    keyed(d.foot, ended ? `end|${s.sid}|${s.ended?.reason || ''}|${s.providerSessionId || ''}` : `hint|${s.mode || ''}`,
      () => (ended ? endedBar(s) : h('div.cv-hint', h('span.cv-modehint.m-' + (s.mode || 'ask'), MODE_INFO[s.mode]?.long || ''), h('span.muted', ' · shift+tab to change · shift+enter for a new line'))));
    arrange(ui.dock, [d.strip.firstChild ? d.strip : null, d.chips.el, d.box, d.foot.el]);
  }

  // The model that answered last (what the tool actually ran, where it says),
  // else the one chosen.
  function lastModel(s) {
    for (let i = s.items.length - 1, n = 0; i >= 0 && n < 300; i--, n++) {
      const it = s.items[i];
      if (it.kind === 'assistant' && it.model && !/^<.*>$/.test(it.model)) return it.model;
    }
    return null;
  }

  function whoButton(s, model) {
    const maker = makerOf(s.provider, lastModel(s) || s.model);
    const b = h('button.cv-who.mk-' + maker, { type: 'button', 'aria-pressed': 'false' },
      h('span.cv-whoface', { 'aria-hidden': 'true' }, h('span.cv-whomark', makerMark(maker)), h('span.cv-whoorb')),
      h('span.cv-whoname', model));
    b.addEventListener('click', () => {
      if (!companion() && talkTo !== 'orion') { toast('Sign in to y3k to talk to your presence here'); return; }
      talkTo = talkTo === 'orion' ? 'coder' : 'orion';
      renderDock();
      dockUi?.ta.focus();
    });
    return b;
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
      attachVer++;
      renderDock();
    };
    reader.readAsDataURL(file);
  }

  async function send(s, ta) {
    const text = ta.value.trim();
    if (!text && !attachments.length) {
      // An empty Enter answers the card that is waiting, in the coder's own
      // composer only: talking to the presence, a second Enter after a line
      // to it allowed whatever the coder was asking, a command included.
      if (talkTo === 'orion' && companion()) return;
      const req = openRequest(s);
      if (req?.kind === 'permission' || req?.kind === 'plan') ctx.answerPermission(req, 'allow', 'once');
      return;
    }
    if (text === '/clear' || text === '/new') { setDraft(''); S.active = null; rebuildTranscript(); renderChrome(); return; }
    if (talkTo === 'orion' && companion()) {
      if (!text) return;
      orionAt = Date.now();
      link.talk(text);
      const out = apply(S, { sid: s.sid, type: 'local.orion', who: 'you', text, name: companion().name }, { replay: true });
      for (const it of out.changed) dirty.add(it);
      setDraft(''); frame(); renderDock(); scrollToBottom();
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
    setDraft('');
    attachments = [];
    attachVer++;
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
    // A key pressed outside the room (the Settings modal over it, a dropdown's
    // list, which lives on body) is not the room's to answer.
    const away = e.target !== document.body && e.target !== document.documentElement && !root.contains(e.target);
    if (e.key === 'Tab' && e.shiftKey && !inField && !away) {
      e.preventDefault();
      const i = MODES.indexOf(s.mode);
      setMode(s, MODES[(i + 1) % MODES.length]);
      return;
    }
    const req = openRequest(s);
    // Escape is first for whatever it was pressed in: an IME composition being
    // cancelled, an open dropdown or its "Another model…" field, a form field,
    // a drawer, anything outside the room. As a capture listener this ran
    // before all of them, so closing a dropdown stopped the turn or declined
    // the card. Only the composer ("Esc to stop"), while it speaks to the
    // coder, and the room itself stop the coder or decline its card; in a
    // card's own note it declines that card with what was typed, as its
    // Decline button does.
    if (e.key === 'Escape') {
      if (e.isComposing || e.keyCode === 229) return;
      if (panel.open) { e.preventDefault(); closePanel(); return; }
      if (e.target.classList?.contains('pm-note')) { declineWithNote(s, e); return; }
      if (away || (isComposer ? talkTo === 'orion' && !!companion() : !!e.target.closest?.('input, select, textarea, .gs.open, .cv-drawer'))) return;
      if (req && req.kind !== 'question') { e.preventDefault(); ctx.answerPermission(req, 'deny', 'once'); return; }
      if (s.state === 'running' || s.state === 'waiting') { e.preventDefault(); interrupt(s); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); interrupt(s); return; }
    // Enter in the composer is send() — which answers the card itself when empty.
    if (e.key === 'Enter' && req && req.kind !== 'question' && !inField && !isComposer && !away && !e.shiftKey) {
      e.preventDefault();
      ctx.answerPermission(req, 'allow', 'once');
    }
  }

  // The card whose note Escape was pressed in, declined with what was typed.
  function declineWithNote(s, e) {
    const uid = Number(e.target.closest?.('.it')?.dataset.uid);
    for (const it of s.byKey.values()) {
      if (it.uid !== uid || it.resolved || !/^(permission|plan)$/.test(it.kind)) continue;
      e.preventDefault();
      ctx.answerPermission(it, 'deny', 'once', String(e.target.value || '').trim());
    }
  }

  // --- home: connect, choose a folder, choose a mode ----------------------------------------
  // Home is drawn again only when something it shows has changed. Every engine
  // event (each line of an install's output, a consent coming and going, each
  // hello) used to rebuild it, which threw away what was typed in the GitHub
  // search and reset the folder list's scroll. Home's own changes go through
  // redrawHome(); everything else is compared with what is on screen first.
  let homeRev = 0;
  let homeSig = '';
  let homeFor = null; // the element homeSig was drawn into (a new one after close/open)
  function redrawHome() { homeRev++; renderHome(); }

  function renderHome() {
    if (!ui || currentSession()) return;
    ui.scroll.hidden = true;
    ui.homeEl.hidden = false;
    ui.dock.hidden = true;
    const down = isDown();
    const sig = [homeRev, home.screen, home.pending ? 1 : 0, home.pairing?.status || '', S.conn, hello ? 1 : 0, transport?.kind || '', transport?.port || '', down,
      JSON.stringify(S.providers), JSON.stringify(S.recent)].join('|');
    if (sig === homeSig && homeFor === ui.homeEl && ui.homeEl.firstChild) return;
    homeSig = sig;
    homeFor = ui.homeEl;
    swap(ui.homeEl, homeScreen(down));
    // "Continue in …" answers Enter — unless the person is typing somewhere.
    const cont = ui.homeEl.querySelector('.ob-continue');
    if (cont && !document.activeElement?.closest?.('input, textarea, select, [contenteditable]')) cont.focus({ preventScroll: true });
  }

  function homeScreen(down) {
    if (home.pairing) return ob.pairingScreen(home.pairing, { retry: (code) => autoPair({ port: home.pairing.port, code }), back: () => { home.pairing = null; redrawHome(); } });
    if (!transport || S.conn === 'off' || S.conn === 'unpaired') return ob.firstRun({ unpaired: S.conn === 'unpaired' });
    if (down) return ob.notRunning({ transport });
    if (S.conn === 'connecting' && !hello) return h('div.cv-center', h('div.th-shimmer', 'Connecting to y3kode on this computer…'));
    if (home.screen === 'browse') return browseScreen();
    if (home.screen === 'github') return githubScreen();
    if (home.screen === 'mode' && home.pending) return modeScreen();
    return folderScreen();
  }

  // The engine is not there: a companion that has stopped answering (at once
  // if it never answered, after 3 s if it did), or the app's engine that did not start.
  function isDown() {
    if (transport?.kind === 'desktop') return S.conn === 'offline';
    if (transport?.kind !== 'companion' || (S.conn !== 'reconnecting' && S.conn !== 'offline')) return false;
    return !hello || (downAt > 0 && Date.now() - downAt >= 3000);
  }

  function hero(title, sub) {
    return h('div.cv-hero', h('div.cv-heromark', icon('laptop')), h('h2.cv-title', title), sub ? h('p.cv-sub', sub) : null);
  }

  // A pairing is saved (y3k-code:pair): connect with it, dropping whatever was
  // trying before (a companion on a port nobody answers any more).
  function usePairing() {
    ob.paired();
    home.pairing = null;
    transport?.close();
    transport = null;
    hello = null;
    downAt = 0;
    connect();
    redrawHome();
  }

  // Arriving from the engine's own link (…/#y3k-code=<port>-<code>). If this
  // browser's saved token still works there, that is all it takes; otherwise
  // pair with the link's code. The pairing screen goes up at once, before
  // open() draws home, so it is what the person sees.
  function pairFromLink() {
    const pend = pendingPairing();
    if (!pend) return;
    if (transport?.kind === 'desktop') { clearPending(); return; }
    const token = savedPairing()?.token;
    if (!token) { autoPair(pend); return; }
    const at = home.pairing = { status: 'probing', port: pend.port, code: pend.code };
    probe(pend.port, { token }).then((e) => {
      if (home.pairing !== at) return;
      if (e?.paired) { clearPending(); movePairing(pend.port, token); usePairing(); return; }
      autoPair(pend);
    });
  }

  async function autoPair(p) {
    clearPending();
    const at = home.pairing = { status: 'probing', port: p.port, code: p.code };
    redrawHome();
    if (!(await probe(p.port))) {
      if (home.pairing === at) { home.pairing = { status: 'error', port: p.port, code: p.code, msg: 'y3kode is not answering on this computer. Is it still running?' }; redrawHome(); }
      return;
    }
    if (home.pairing === at) await doPair(p.port, p.code);
  }

  // The engine asks the person on their computer before it hands over a token
  // (unless the code came with the command they ran: then that was the yes).
  async function doPair(port, code) {
    const at = home.pairing = { status: 'asking', port, code };
    redrawHome();
    const r = await pair(port, code);
    // A yes is a yes even if they went Back meanwhile: the token is saved.
    if (r.ok) { usePairing(); return true; }
    if (home.pairing === at) { home.pairing = { status: 'error', port, code, msg: r.error, http: r.status || 0 }; redrawHome(); }
    return false;
  }

  // The tool new sessions use: the one last picked here (this browser keeps
  // it), else the one the last folder used, else Claude Code.
  function chosenProvider() {
    const want = home.provider || pref('y3k-code:provider') || S.recent[0]?.provider || 'claude';
    return !S.providers.length || S.providers.some((p) => p.id === want) ? want : 'claude';
  }

  function folderScreen() {
    const known = S.providers;
    const chosen = chosenProvider();
    const tool = known.find((p) => p.id === chosen) || null;
    const recent = h('div.cv-folders');
    for (const f of S.recent) {
      const b = h('button.cv-folderrow', { type: 'button', title: f.path },
        icon('folder'), h('span.cv-fname', f.name || folderName(f.path)), h('span.cv-fpath.muted', f.path),
        f.mode ? h('span.cv-modehint.m-' + f.mode, MODE_INFO[f.mode]?.label) : null, h('span.muted.cv-small', f.lastUsed ? timeAgo(f.lastUsed) : ''));
      b.addEventListener('click', () => chooseFolder(f.path));
      recent.appendChild(b);
    }
    const gh = h('button.btn', { type: 'button' }, icon('github'), ' From GitHub…');
    gh.addEventListener('click', () => { home.screen = 'github'; home.gh = null; home.ghTyped = undefined; loadRepos(''); });
    const browse = h('button.btn.cv-pick', { type: 'button' }, icon('folder'), ' Choose a folder…');
    // In the desktop app the OS's own picker chooses (the page never names the
    // path); in a browser, a list of the folders in your home folder.
    browse.addEventListener('click', async () => {
      if (transport?.kind === 'desktop') { afterOpen(await cmd({ cmd: 'workspace.pick' })); return; }
      home.screen = 'browse'; home.browse = null; loadBrowse(null);
    });
    const provider = h('select.cv-select', { 'aria-label': 'Coding tool' });
    for (const p of known) {
      const st = authOf(p);
      const why = p.ready === false ? ' — soon' : st === 'not-installed' ? ' — not installed' : st === 'checking' ? ' — checking…'
        : st === 'signed-out' ? ' — sign in first' : st === 'needs-key' ? ' — needs a key' : '';
      const op = h('option', { value: p.id, disabled: p.ready === false }, `${p.label}${why}`);
      if (p.id === chosen) op.selected = true;
      provider.appendChild(op);
    }
    provider.addEventListener('change', () => { home.provider = provider.value; home.gateFor = null; pref('y3k-code:provider', provider.value); redrawHome(); });

    // Sign in (or install, or — for open models — add a key) BEFORE picking a
    // folder and a mode, not after both have been picked and the start failed.
    const gateTool = known.find((p) => p.id === home.gateFor) || tool;
    const gate = gateTool && needsSetup(gateTool) ? ob.toolGate(gateTool) : null;
    // One click back to work: the last folder, with the tool and mode it had.
    const last = S.recent[0];
    const lastTool = last ? known.find((p) => p.id === (last.provider || chosen)) || null : null;
    const cont = last && !gate && !(lastTool && needsSetup(lastTool))
      ? ob.continueButton({ folder: last.name || folderName(last.path), tool: AGENT_NAME[lastTool?.id] || lastTool?.label || AGENT_NAME[chosen] || chosen,
        mode: last.mode ? MODE_INFO[last.mode]?.label : null, onGo: () => chooseFolder(last.path, lastTool?.id || chosen) })
      : null;
    const noneReady = !gate && known.length > 0 && known.every((p) => p.ready === false || p.installed === false);
    return h('div.cv-center.cv-wide', hero('Where are we working?', 'Pick a folder on your computer. The first time, y3kode asks you — on your computer — to trust it.'),
      home.error ? h('div.cv-note.err', home.error) : null,
      gate,
      cont ? h('div.ob-controw', cont) : null,
      noneReady ? h('div.cv-note.warn', 'No coding tool is on this computer yet. ', linkBtn('Set one up', () => toggleDrawer('providers'))) : null,
      h('div.cv-card', h('div.cv-cardhead', h('b', 'Recent'), h('span.cv-grow'), h('span.cv-sel', 'with ', glassSelect(provider))),
        S.recent.length ? recent : h('div.muted.cv-small', 'No folders yet.'), h('div.cv-acts', gh, browse)));
  }

  const linkBtn = (label, fn) => { const b = h('button.cv-link', { type: 'button' }, label); b.addEventListener('click', fn); return b; };

  async function loadBrowse(path) {
    const r = await cmd({ cmd: 'workspace.browse', path: path || undefined });
    home.browse = r.ok ? r : { error: r.error, entries: [] };
    redrawHome();
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
    back.addEventListener('click', () => { home.screen = 'folders'; redrawHome(); });
    return h('div.cv-center.cv-wide', h('div.cv-card', crumbs, b.error ? h('div.cv-note.err', b.error) : null, list, h('div.cv-acts', back, use)));
  }

  // `provider`: the tool this folder should open with — "Continue" passes the
  // one it used last; everything else takes the one chosen on the folder screen.
  async function chooseFolder(path, provider) {
    home.error = null;
    afterOpen(await cmd({ cmd: 'workspace.open', path }), provider);
  }

  function afterOpen(r, provider) {
    if (r.code === 'cancelled') return;
    if (!r.ok) { home.error = r.code === 'declined' ? 'Not trusted — nothing was started.' : r.error; home.screen = 'folders'; redrawHome(); return; }
    home.pending = { path: r.path, name: r.name, findings: r.findings || [], mode: r.mode, provider: provider || chosenProvider() };
    if (r.mode) return start(r.mode);
    home.screen = 'mode';
    redrawHome();
  }

  function modeScreen() {
    const p = home.pending;
    const prov = S.providers.find((x) => x.id === (p.provider || chosenProvider()));
    const offered = prov?.modes || MODES;
    const cards = MODES.map((m) => {
      const can = offered.includes(m);
      const b = h('button.cv-modecard.m-' + m + (m === 'ask' ? '.rec' : ''), { type: 'button', disabled: !can }, h('b', MODE_INFO[m].long), h('span', can ? MODE_INFO[m].hint : `Not available with ${prov?.label || 'this tool'} — its only "auto" would skip every permission.`), m === 'ask' ? h('i.cv-rec', 'a good start') : null);
      b.addEventListener('click', () => start(m));
      return b;
    });
    const back = h('button.btn', { type: 'button' }, 'Back');
    back.addEventListener('click', () => { home.screen = 'folders'; home.pending = null; redrawHome(); });
    return h('div.cv-center.cv-wide', hero(`How much may it do on its own in ${p.name}?`, 'You can change this any time (Shift+Tab). y3kode remembers it for this folder.'),
      p.findings.length ? h('div.cv-note.warn', h('b', 'This folder can change how coding tools behave: '), p.findings.map((f) => `${f.file} (${f.detail})`).join('; ')) : null,
      h('div.cv-modecards', cards), h('div.cv-acts', back));
  }

  async function start(mode) {
    const p = home.pending;
    if (!p) return;
    const provider = p.provider || chosenProvider();
    const r = await cmd({ cmd: 'session.start', provider, cwd: p.path, mode });
    if (!r.ok && r.code === 'mode-unavailable') { home.error = r.error; home.screen = 'mode'; redrawHome(); return; }
    if (!r.ok) {
      home.error = r.error;
      home.screen = 'folders';
      // Not signed in, not installed, no key: the folder screen puts that
      // tool's own steps first (onboard.toolGate) — no drawer to go hunting in.
      if (/key|sign|login|auth|install/i.test(r.code || '')) home.gateFor = provider;
      redrawHome();
      return;
    }
    home.pending = null;
    home.screen = 'folders';
    home.error = null;
    home.gateFor = null;
    // Home is out of sight now; the error and the gate it showed are gone, so
    // the next time it is shown ("+", a session ending) it is drawn afresh
    // rather than kept as it was.
    homeRev++;
    S.active = r.sid;
    askForNote(r.sid);
    if (!S.sessions.has(r.sid)) apply(S, { sid: r.sid, type: 'session.started', provider, cwd: p.path, mode }, { replay: true });
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
    redrawHome();
    const r = await cmd({ cmd: 'github.repos', q: q || undefined });
    home.gh = r.ok ? { repos: r.repos, q } : { error: r.error, code: r.code, q };
    if (home.screen === 'github') redrawHome();
  }

  function githubScreen() {
    const g = home.gh || {};
    // What is typed lives in home, so a redraw (a repository list arriving)
    // puts it back rather than the last query searched.
    const q = h('input.cv-keyin', { type: 'search', placeholder: 'your repositories — or search GitHub', value: home.ghTyped ?? g.q ?? '', 'aria-label': 'Search GitHub' });
    q.addEventListener('input', () => { home.ghTyped = q.value; });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRepos(q.value.trim()); });
    const list = h('div.cv-folders.cv-browse');
    for (const r of g.repos || []) {
      const row = h('button.cv-folderrow.cv-repo', { type: 'button', title: r.description || r.repo },
        icon('github'), h('span.cv-fname', r.repo), h('span.cv-fpath.muted', r.description || ''), r.private ? h('span.cv-pstate', 'private') : null, h('span.muted.cv-small', r.language || ''));
      row.addEventListener('click', () => cloneRepo(r.repo));
      list.appendChild(row);
    }
    const back = h('button.btn', { type: 'button' }, 'Back');
    back.addEventListener('click', () => { home.screen = 'folders'; redrawHome(); });
    return h('div.cv-center.cv-wide', hero('From GitHub', 'Cloned into ~/y3k-code with your own GitHub sign-in (gh). You trust it on your computer before anything runs there.'),
      h('div.cv-card', h('div.cv-keyrow', q, (() => { const b = h('button.btn', { type: 'button' }, 'Search'); b.addEventListener('click', () => loadRepos(q.value.trim())); return b; })()),
        g.loading ? h('div.th-shimmer', 'Asking GitHub…') : g.error ? h('div.cv-note.warn', g.error) : list,
        home.cloning ? h('div.cv-note', h('span.th-shimmer', `Cloning ${home.cloning}…`)) : null,
        h('div.cv-acts', back)));
  }

  async function cloneRepo(repo) {
    if (home.cloning) return;
    home.cloning = repo;
    redrawHome();
    const r = await cmd({ cmd: 'github.clone', repo });
    home.cloning = null;
    if (!r.ok) { home.gh = { ...(home.gh || {}), error: r.error }; redrawHome(); return; }
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
      h('div.cv-prov', h('b', 'Add a connector'), h('div.cv-keyrow', name, glassSelect(kind)), what, secret, h('div.cv-acts', add),
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

  // Each coding tool as it stands on this computer: signed in, or the one
  // command that signs it in; installed, or how to install it. The rows are
  // onboard.toolRow — the same steps the folder screen shows before a start.
  function renderProviders() {
    const rows = S.providers.map((p) => ob.toolRow(p));
    const refresh = h('button.btn', { type: 'button' }, 'Check again');
    refresh.addEventListener('click', async () => { const r = await cmd({ cmd: 'provider.refresh' }); if (r.ok) { S.providers = r.providers; renderProviders(); redrawHome(); } });
    const unpair = transport?.kind === 'companion' ? h('button.cv-link', { type: 'button' }, 'Disconnect this browser') : null;
    unpair?.addEventListener('click', async () => { await transport.revoke(); transport.close(); transport = null; S.conn = 'off'; hello = null; toggleDrawer('providers'); redrawHome(); renderChrome(); });
    const comp = companion();
    const notesRow = comp ? h('div.cv-prov', h('div.cv-provhead', h('b', `${comp.name}'s notes`), h('span.cv-grow'),
      (() => { const on = notesOn(); const b = h('button.cv-link', { type: 'button' }, on ? 'turn off' : 'turn on'); b.addEventListener('click', () => { pref('y3k-code:notes', on ? 'off' : 'on'); renderProviders(); }); return b; })()),
      h('div.muted.cv-small', `When a session starts, ${comp.name} writes the coder a short note from what it knows of you. You read it first; it goes only with your first message.`),
      pref('y3k-code:noteback') === 'always' ? h('div.cv-small', 'Lines back are sent without asking. ', (() => { const b = h('button.cv-link', { type: 'button' }, 'ask me again'); b.addEventListener('click', () => { pref('y3k-code:noteback', 'ask'); renderProviders(); }); return b; })()) : null) : null;
    swap(ui.drawer, drawerHead('Coding tools'),
      h('div.muted.cv-small', 'Each tool runs on its own sign-in, on this computer — y3kode starts the tool you signed into and never sees the sign-in. A key, where one is needed, stays on your computer and never reaches yearthreethousand.com.'),
      rows, notesRow, h('div.cv-acts', refresh, unpair));
  }

  return {
    open, close,
    isOpen: () => !!root,
    needsYou: () => needsYou(S),
    // for the site: is anything running (the broadcast lock asks this)
    busy: () => liveSessions(S).length > 0,
    _state: S,
    // scripts/code-smoke.mjs feeds made-up events through the same path as the
    // engine's, to watch the screen draw them
    _feed: (e) => onEvent(e),
  };
}

// Run fn on a task of its own, soon: a MessageChannel message (no 4ms clamp),
// or setTimeout where there is none. Used for the transcript's slices.
const later = (() => {
  if (typeof MessageChannel !== 'function') return (fn) => setTimeout(fn, 0);
  const ch = new MessageChannel();
  const q = [];
  ch.port1.onmessage = () => { const fn = q.shift(); if (fn) fn(); };
  return (fn) => { q.push(fn); ch.port2.postMessage(0); };
})();

function folderName(p) { return String(p || '').split(/[\\/]/).filter(Boolean).pop() || p || ''; }
function prettyModel(m) { return String(m).replace(/^claude-/, '').replace(/-\d{8}$/, ''); }
