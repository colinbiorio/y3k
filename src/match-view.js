// PRESENCE VS PRESENCE — the client side of the first room where two minds
// meet. Owners arrange, presences play: this module renders the challenge
// strip inside the games view, and the match board itself.
//
// Your presence thinks from YOUR open tab, on your key, only while the match
// is open in front of you — pacing, budget, turn and staleness are all
// enforced server-side; this file just asks politely and shows what happened.

import { stateFromMoves } from './chess-core.js';
import { materialOf, cellsHtml } from './chess-board.js';
import { getBrainConfig } from './brain.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 2) return 'moved just now';
  if (m < 60) return `moved ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `waiting ${h}h`;
  return `waiting ${Math.round(h / 24)} days`;
};

export function createMatchView({ getAccount, toast }) {
  let grid = null;            // the games grid while a match is open
  let matchId = null;
  let match = null;           // last public match state
  let viewPly = null;         // history browsing (null = now)
  let pollTimer = 0;
  let thinkBusy = false;
  let lastThinkAt = 0;
  let budgetHalt = false;   // pool empty: stop offering thinks until the board moves
  let onBack = null;

  const jget = (u, headers) => fetch(u, { headers }).then((x) => x.json());
  const jpost = (u, body) => fetch(u, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((x) => x.json());

  // ---- the strip: challenges + my games + happening now ---------------------

  async function renderStrip(el, openMatch) {
    if (!el) return;
    const me = getAccount?.();
    let mine = [], active = [];
    try {
      if (me) mine = (await jget('/api/matches?mine=1')).matches || [];
      active = (await jget('/api/matches')).matches || [];
    } catch { /* the strip just stays quiet */ }
    const mineIds = new Set(mine.map((m) => m.id));
    const watchable = active.filter((m) => !mineIds.has(m.id));
    if (!mine.length && !watchable.length) { el.innerHTML = ''; return; }

    const row = (m, kind) => {
      const vs = `@${esc(m.white.handle)} vs @${esc(m.black.handle)}`;
      if (kind === 'invite') {
        return `<div class="match-row" data-id="${m.id}">
          <span class="match-line">@${esc(m[m.challenger].handle)}'s person challenges yours to chess — their presence vs yours</span>
          <span class="match-acts"><button class="create-go small" data-act="accept">accept</button><button class="login-alt" data-act="decline">decline</button></span></div>`;
      }
      if (kind === 'sent') {
        return `<div class="match-row" data-id="${m.id}">
          <span class="match-line">your challenge to @${esc(m[m.challenger === 'white' ? 'black' : 'white'].handle)} waits</span>
          <span class="match-acts"><button class="login-alt" data-act="cancel">withdraw</button></span></div>`;
      }
      const state = m.status === 'active'
        ? `${Math.ceil(m.ply / 2)} moves · ${ago(m.lastMoveAt)}${kind === 'mine' && m.onTurn === m.mySeat ? ' · your presence to move' : ''}`
        : m.result ? (m.result.winner == null ? `${m.result.how}` : `${m.result.winner === 'w' ? '@' + esc(m.white.handle) : '@' + esc(m.black.handle)} won`) : m.status;
      return `<div class="match-row open" data-id="${m.id}" data-act="open">
        <span class="match-line">${vs}<i class="match-sub">${state}</i></span>
        <span class="match-go">›</span></div>`;
    };

    const invites = mine.filter((m) => m.status === 'pending' && !m.myChallenge);
    const sent = mine.filter((m) => m.status === 'pending' && m.myChallenge);
    const playing = mine.filter((m) => m.status !== 'pending');
    el.innerHTML = [
      invites.length ? `<div class="match-head">challenges</div>` + invites.map((m) => row(m, 'invite')).join('') : '',
      sent.map((m) => row(m, 'sent')).join(''),
      playing.length ? `<div class="match-head">your presence's games</div>` + playing.map((m) => row(m, 'mine')).join('') : '',
      watchable.length ? `<div class="match-head">happening now</div>` + watchable.slice(0, 6).map((m) => row(m, 'watch')).join('') : '',
    ].join('');

    el.querySelectorAll('[data-act]').forEach((n) => n.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = n.closest('.match-row')?.dataset.id;
      const act = n.dataset.act;
      if (!id) return;
      if (act === 'open') { openMatch(id); return; }
      if (act === 'accept') {
        const r = await jpost(`/api/match/${id}/respond`, { accept: true }).catch(() => ({}));
        if (r.error) toast?.(r.error); else openMatch(id);
        return;
      }
      if (act === 'decline') { await jpost(`/api/match/${id}/respond`, { accept: false }).catch(() => {}); renderStrip(el, openMatch); return; }
      if (act === 'cancel') { await jpost(`/api/match/${id}/cancel`).catch(() => {}); renderStrip(el, openMatch); return; }
    }));
  }

  // ---- the match screen ------------------------------------------------------

  function open(g, id, back) {
    grid = g; matchId = id; match = null; viewPly = null; onBack = back;
    render();
    poll(true);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => poll(false), 5000);
  }
  function close() {
    clearInterval(pollTimer); pollTimer = 0;
    grid = null; matchId = null; match = null; viewPly = null;
  }
  const isOpen = () => !!matchId;

  async function poll(force) {
    if (!matchId) return;
    try {
      const v = match ? `${match.ply}.${match.chat.length}.${match.status}.${match.stuck ? 1 : 0}` : '';
      const r = await jget(`/api/match/${matchId}`, force || !v ? undefined : { 'x-match-v': v });
      if (r.unchanged) { maybeThink(); return; }
      if (r.match) {
        const moved = match && r.match.ply !== match.ply;
        match = r.match;
        if (moved) { viewPly = null; budgetHalt = false; } // a move landed: the board returns to now, and the pool may have been refilled
        render();
        maybeThink();
      }
    } catch { /* next poll */ }
  }

  // My presence moves itself while I have the board open — the server enforces
  // budget, pacing, turn, staleness and the failure brake; we just offer.
  async function maybeThink() {
    const m = match;
    if (!m || m.status !== 'active' || !m.mySeat || m.onTurn !== m.mySeat) return;
    if (m.stuck || thinkBusy || budgetHalt) return;
    if (Date.now() - lastThinkAt < 13000) return;
    const cfg = getBrainConfig();
    if (!cfg?.key) return;
    thinkBusy = true; lastThinkAt = Date.now();
    render();
    try {
      const r = await jpost(`/api/match/${matchId}/think`, {
        key: cfg.key, provider: cfg.provider, model: cfg.model, expectedPly: m.ply,
      });
      if (r.match) { match = r.match; viewPly = null; }
      else if (r.reason === 'budget') { budgetHalt = true; } // said on the board itself, not as a nagging toast
      else if (r.error && !r.busy && r.error !== 'pacing') toast?.(r.error);
    } catch { /* next poll retries */ }
    thinkBusy = false;
    render();
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'chess-root';
    if (!match) { root.innerHTML = '<div class="home-empty">…</div>'; grid.appendChild(root); wire(root); return; }

    const m = match;
    const moveArr = m.moves ? m.moves.split(' ') : [];
    const total = moveArr.length;
    const shown = viewPly == null ? total : Math.max(0, Math.min(viewPly, total));
    const browsing = shown !== total;
    const st = stateFromMoves(moveArr.slice(0, shown).join(' '));
    const mat = materialOf(st.board);
    // my presence (or white, for a spectator) sits at the bottom
    const bottomSeat = m.mySeat || 'w';
    const topSeat = bottomSeat === 'w' ? 'b' : 'w';
    const seatName = (s) => '@' + (s === 'w' ? m.white.handle : m.black.handle);
    const matHtml = (x) => (x.glyphs || x.edge) ? `<span class="chess-mat">${x.glyphs}${x.edge ? `<i>${x.edge}</i>` : ''}</span>` : '';

    const label = browsing ? `move ${shown} of ${total}`
      : m.status === 'done'
        ? (m.result?.winner == null ? (m.result?.how || 'over')
          : `${seatName(m.result.winner)} wins — ${m.result.how}`)
        : m.onTurn === m.mySeat
          ? (thinkBusy ? `${seatName(m.mySeat)} is thinking…` : m.stuck ? 'it needs a nudge' : budgetHalt ? 'its budget is spent — the board waits' : `${seatName(m.onTurn)} to move`)
          : `${seatName(m.onTurn)} to move — the board waits for their person`;

    root.innerHTML = `
      <div class="chess-side top"><span class="chess-who">${esc(seatName(topSeat))}</span>${matHtml(topSeat === 'w' ? mat.w : mat.b)}<span class="chess-clock">${topSeat === 'w' ? '○' : '●'}</span></div>
      <div class="chess-board match-board">${cellsHtml(st, { flip: bottomSeat === 'b', lastMove: shown > 0 ? moveArr[shown - 1] : null })}</div>
      <div class="chess-side"><span class="chess-who">${esc(seatName(bottomSeat))}</span>${matHtml(bottomSeat === 'w' ? mat.w : mat.b)}<span class="chess-clock">${bottomSeat === 'w' ? '○' : '●'}</span></div>
      <div class="chess-nav">
        <button type="button" class="chess-step" data-nav="back" aria-label="Previous move" ${shown === 0 ? 'disabled' : ''}>&#8249;</button>
        <span class="chess-turn${thinkBusy && !browsing ? ' shimmer' : ''}${browsing ? ' past' : ''}">${esc(label)}</span>
        <button type="button" class="chess-step" data-nav="fwd" aria-label="Next move" ${browsing ? '' : 'disabled'}>&#8250;</button>
      </div>
      <div class="chess-comms">${(m.chat || []).map((c) => `<div class="chess-line"><b>${esc('@' + (c.who === 'w' ? m.white.handle : m.black.handle))}</b> ${esc(c.text)}</div>`).join('')}</div>
      <div class="match-controls">
        ${m.stuck && m.mySeat ? '<button class="create-go small" data-ctl="nudge">nudge it to try again</button>' : ''}
        ${m.status === 'active' && m.mySeat ? '<button class="login-alt" data-ctl="resign">withdraw its seat</button>' : ''}
        <button class="login-alt" data-ctl="back">back to the board room</button>
      </div>`;
    grid.appendChild(root);
    wire(root);
    const comms = root.querySelector('.chess-comms');
    if (comms) comms.scrollTop = comms.scrollHeight;
  }

  function wire(root) {
    root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      const total = match?.moves ? match.moves.split(' ').length : 0;
      if (b.dataset.nav === 'back') viewPly = Math.max(0, (viewPly == null ? total : viewPly) - 1);
      else { if (viewPly == null) return; viewPly = viewPly + 1; if (viewPly >= total) viewPly = null; }
      render();
    }));
    root.querySelectorAll('[data-ctl]').forEach((b) => b.addEventListener('click', async () => {
      const ctl = b.dataset.ctl;
      if (ctl === 'back') { const cb = onBack; close(); cb?.(); return; }
      if (ctl === 'nudge') { await jpost(`/api/match/${matchId}/nudge`).catch(() => {}); lastThinkAt = 0; budgetHalt = false; if (match) match.stuck = false; poll(true); return; }
      if (ctl === 'resign') {
        const r = await jpost(`/api/match/${matchId}/resign`).catch(() => ({}));
        if (r.error) toast?.(r.error); else poll(true);
      }
    }));
  }

  // A challenge, sent from a rival presence's profile.
  async function sendChallenge(handle) {
    const r = await jpost('/api/match/challenge', { handle }).catch(() => ({ error: 'could not reach the server' }));
    if (r.error) { toast?.(r.error); return false; }
    toast?.('the challenge is on their board.');
    return true;
  }

  return { renderStrip, open, close, isOpen, sendChallenge };
}
