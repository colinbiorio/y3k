// ============================================================================
// THE MINE — Phraszle, as a room of this house.
//
// You cannot guess the phrase. You hire a mind that has read the book and not
// the answer, you coach it, and when you think it is close you make it COMMIT.
// The server says yes or no and nothing else. Every dig is one or two model
// calls carrying the whole book, paid on YOUR key — that is the work, and it is
// why a ladder here means something.
//
// Renders into #home-grid the way chess does, NOT the way the world does. The
// world appends to document.body because it has position:fixed chrome and
// #home-panel carries transforms, which quietly turn a fixed box into a small
// one. This room is a panel-shaped room — a transcript, a line to type in, a
// ladder — so it has no fixed chrome and belongs in the grid.
//
// close() is idempotent on purpose: showView() calls it on EVERY view change,
// including hundreds of times for a room nobody has opened.
// ============================================================================

import { getBrainConfig } from './brain.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => (n >= 0.01 ? '$' + n.toFixed(2) : n > 0 ? '<$0.01' : '—');
const thousands = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n | 0));

export function createMine({ toast } = {}) {
  let grid = null;
  let state = null;          // the /state payload
  let lid = null;            // the block being dug
  let messages = [];         // the transcript with the miner — this browser's, not the server's
  let hinted = false;
  let busy = false;
  let board = null;          // the ladder, loaded lazily
  let tab = 'dig';
  let bench = null;         // the founder's own listing — answers in the clear, for the one person allowed to see them

  const api = async (path, opts) => {
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({ error: 'the mine did not answer' }));
    if (r.status === 401) j.error = j.error || 'sign in';
    return j;
  };
  // Every spending call carries the key from THIS browser. It is never stored
  // server-side and never defaulted to the house key.
  const withKey = (body) => {
    const c = getBrainConfig();
    return { ...body, key: c?.key || '', provider: c?.provider || null, model: c?.model || null };
  };

  // ---- drawing -------------------------------------------------------------
  function render() {
    if (!grid) return;
    grid.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'shaft-root';
    root.innerHTML = tab === 'ladder' ? ladderPane() : digPane();
    grid.appendChild(root);
    wire();
    const log = root.querySelector('.shaft-log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function header() {
    const n = state?.words || 0;
    return `
      <div class="shaft-head">
        <div class="shaft-tabs">
          <button type="button" class="login-alt${tab === 'dig' ? ' on' : ''}" data-tab="dig">the dig</button>
          <button type="button" class="login-alt${tab === 'ladder' ? ' on' : ''}" data-tab="ladder">the ladder</button>
        </div>
        <span class="muted shaft-lex">${n} words in <a href="/phraszle/the-unwording.md" target="_blank" rel="noopener">the book</a></span>
      </div>`;
  }

  function digPane() {
    if (!state) return header() + '<div class="shaft-sec"><p class="muted">opening the shaft…</p></div>';
    if (!state.signedIn) {
      return header() + `<div class="shaft-sec">
        <h4>the mine</h4>
        <p class="muted">A phrase of a few words, every one of them somewhere in the book. You do not guess it —
        you coach a rented mind that has read the book and not the answer, and when it sounds close you make it commit.
        Sign in to dig; what you spend is your own key, and what you find goes on the ladder.</p>
      </div>` + ladderPane(true);
    }
    const at = state.at;
    if (!at) {
      // Two different nothings, and saying the wrong one is a lie: a mine with
      // no blocks in it has not been solved.
      const empty = !(state.ladder || []).length;
      return header() + `<div class="shaft-sec">
        <h4>${empty ? 'nothing struck yet' : 'the frontier'}</h4>
        <p class="muted">${empty
          ? 'No blocks have been written into this seam yet. The author sets the phrase and how many words it runs to; until then there is nothing here to dig.'
          : 'Every block written so far is cracked. New ones appear as the book is read further.'}</p>
      </div>` + authorBench();
    }
    const cfg = getBrainConfig();
    const rows = messages.map((m) => `<div class="shaft-line ${m.role === 'user' ? 'you' : 'miner'}">${esc(m.content)}</div>`).join('');
    return header() + `
      <div class="shaft-sec shaft-pane">
        <h4>block ${at.order} · ${at.words} word${at.words === 1 ? '' : 's'}</h4>
        <p class="muted shaft-sub">The miner has read the book. It has not been told the phrase, and neither have you —
        what you know is what you can reason out of the same pages.</p>
        <div class="shaft-log">${rows || '<div class="muted shaft-empty">Say something to it and the dig begins.</div>'}</div>
        ${cfg ? '' : '<p class="warn shaft-warn">The miner runs on your own API key — add one in settings before you dig.</p>'}
        <label class="field shaft-field">
          <input id="shaft-say" type="text" autocomplete="off" placeholder="coach the miner…" ${busy || !cfg ? 'disabled' : ''} />
        </label>
        <div class="shaft-acts">
          <button type="button" class="login-alt" id="shaft-send" ${busy || !cfg ? 'disabled' : ''}>say</button>
          <button type="button" class="login-alt" id="shaft-hint" ${busy || !cfg || hinted || !at.hasHint ? 'disabled' : ''}>${hinted ? 'hint spent' : 'hint'}</button>
          <button type="button" class="login-alt shaft-dig" id="shaft-guess" ${busy || !cfg ? 'disabled' : ''}>make it commit</button>
        </div>
      </div>
      ${blockStrip()}
      ${authorBench()}`;
  }

  // THE AUTHOR'S BENCH. Founder only, and the server says 404 rather than 403
  // to anyone else — the way every other founder-only route here answers, since
  // a 403 confirms the thing exists. The answers live only in DATA_DIR and are
  // never in the repo, so a fresh deploy starts with an empty seam and this is
  // how it gets filled.
  function authorBench() {
    if (!state?.founder) return '';
    const rows = (bench || []).map((b) => `
      <tr><td>${b.order}</td><td>${esc(b.answer)}</td><td>${b.words}w</td>
      <td><button type="button" class="login-alt" data-drop="${esc(b.lid)}">drop</button></td></tr>`).join('');
    return `
      <div class="shaft-sec">
        <h4>the author's bench</h4>
        <p class="muted">Yours alone. Every word of a phrase has to appear in the book, and the word count IS the
        difficulty — one word is 340 candidates, two is 115,600, three is 39 million.</p>
        <label class="field shaft-field"><input id="shaft-answer" type="text" autocomplete="off" placeholder="the phrase…" /></label>
        <label class="field shaft-field"><input id="shaft-hint-text" type="text" autocomplete="off" placeholder="a hint, for whoever gets stuck…" /></label>
        <div class="shaft-acts"><button type="button" class="login-alt shaft-dig" id="shaft-write">write the block</button></div>
        ${rows ? `<table class="usage-table">${rows}</table>` : ''}
      </div>`;
  }

  function blockStrip() {
    const l = state?.ladder || [];
    if (!l.length) return '';
    return `<div class="shaft-strip">${l.map((b) => `
      <span class="shaft-block${b.solved ? ' done' : ''}${b.lid === lid ? ' here' : ''}" title="${b.words} word${b.words === 1 ? '' : 's'}">${b.order}</span>`).join('')}</div>`;
  }

  function ladderPane(embedded) {
    if (!board) return (embedded ? '' : header()) + '<div class="shaft-sec"><p class="muted">reading the ladder…</p></div>';
    const none = '<tr><td colspan="3" class="muted">nobody yet</td></tr>';
    const first = board.firstLight.map((r) => `<tr><td>${esc(r.who)}</td><td>block ${orderOf(r.lid)}</td><td class="muted">first</td></tr>`).join('');
    const cheap = board.cheap.map((r) => `<tr><td>${esc(r.who)}</td><td>block ${orderOf(r.lid)}</td><td>${thousands(r.tokens)} tok · ${r.attempts} dig${r.attempts === 1 ? '' : 's'}</td></tr>`).join('');
    const haul = board.longHaul.map((r) => `<tr><td>${esc(r.who)}</td><td>${r.attempts} dig${r.attempts === 1 ? '' : 's'}</td><td>${r.blocks} block${r.blocks === 1 ? '' : 's'} · ${money(r.cost)}</td></tr>`).join('');
    const minds = board.minds.map((r) => `<tr><td>${esc(r.model || '?')}</td><td class="muted">${esc(r.provider || '')}</td><td>${r.blocks} in ${r.digs} dig${r.digs === 1 ? '' : 's'}</td></tr>`).join('');
    return (embedded ? '' : header()) + `
      <div class="shaft-sec">
        <h4>first light</h4>
        <p class="muted">Who broke a block before anyone else did.</p>
        <table class="usage-table">${first || none}</table>
      </div>
      <div class="shaft-sec">
        <h4>the cheap solve</h4>
        <p class="muted">Fewest tokens spent on a block that came out. Coached digs are not listed here — telling the
        miner the words is not the same as working them out. Cost is estimated.</p>
        <table class="usage-table">${cheap || none}</table>
      </div>
      <div class="shaft-sec">
        <h4>the long haul</h4>
        <p class="muted">Most digs, however they went. This is the other axis on purpose: dedication should not be able
        to beat insight, and insight should not be able to beat showing up.</p>
        <table class="usage-table">${haul || none}</table>
      </div>
      <div class="shaft-sec">
        <h4>by mind</h4>
        <p class="muted">Which rented mind cracked which block, and in how many digs.</p>
        <table class="usage-table">${minds || none}</table>
      </div>`;
  }
  const orderOf = (id) => (state?.ladder || []).find((b) => b.lid === id)?.order ?? '?';

  // ---- doing ---------------------------------------------------------------
  function wire() {
    if (!grid) return;
    grid.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      render();
      if (tab === 'ladder') loadLadder();
    }));
    const say = grid.querySelector('#shaft-say');
    if (say) {
      say.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
      if (!busy) say.focus();
    }
    grid.querySelector('#shaft-write')?.addEventListener('click', writeBlock);
    grid.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => dropBlock(b.dataset.drop)));
    grid.querySelector('#shaft-send')?.addEventListener('click', send);
    grid.querySelector('#shaft-hint')?.addEventListener('click', hint);
    grid.querySelector('#shaft-guess')?.addEventListener('click', dig);
  }

  const push = (role, content) => { messages.push({ role, content }); };

  // The one place a coaching turn is spent. Both the typed line and the hint go
  // through it, because both are the same thing to the miner: another user turn
  // on the transcript it is reasoning over.
  async function ask() {
    busy = true; render();
    const j = await api('/api/phraszle/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(withKey({ lid, messages, hinted })),
    });
    busy = false;
    if (j.ok) push('assistant', j.reply);
    else { messages.pop(); toast?.(j.error || 'the miner went quiet'); }
    render();
  }

  async function send() {
    const el = grid?.querySelector('#shaft-say');
    const text = (el?.value || '').trim();
    if (!text || busy || !lid) return;
    push('user', text);
    await ask();
  }

  async function hint() {
    if (busy || hinted || !lid) return;
    busy = true; render();
    const j = await api('/api/phraszle/hint', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lid }),
    });
    busy = false;
    if (!j.ok) { toast?.(j.error || 'no hint'); render(); return; }
    hinted = true;
    // Hand it to the miner as a turn rather than just showing it: a hint you
    // read and the miner did not is a hint you then have to paraphrase at it,
    // which is coaching by another name.
    push('user', 'The author left a hint: "' + j.hint + '" — what does that tell you?');
    await ask();
  }

  // The dig. One press, one or two model calls, one row on the record whether
  // it lands or not — the long haul is only visible if the misses count too.
  async function dig() {
    if (busy || !lid) return;
    busy = true; render();
    const j = await api('/api/phraszle/guess', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(withKey({ lid, messages, hinted })),
    });
    busy = false;
    if (!j.ok) { toast?.(j.error || 'the dig collapsed'); render(); return; }
    if (j.valid) push('assistant', 'I commit: ' + j.guess);
    if (j.correct) {
      push('assistant', '— and that was it.');
      toast?.('block ' + (state?.at?.order ?? '') + ' is yours');
      await refresh();            // the frontier moves; the transcript starts again
      messages = []; hinted = false;
      lid = state?.at?.lid || null;
    } else if (!j.valid) {
      push('assistant', '(that was not a phrase from the book — it needs a nudge)');
    }
    board = null;                 // the ladder has changed under us
    render();
  }

  async function writeBlock() {
    const a = grid?.querySelector('#shaft-answer'), h = grid?.querySelector('#shaft-hint-text');
    const answer = (a?.value || '').trim();
    if (!answer) return;
    const j = await api('/api/phraszle/blocks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer, hint: (h?.value || '').trim() }),
    });
    if (j.error) { toast?.(j.error); return; }
    toast?.('block ' + j.order + ' · ' + j.words + ' word' + (j.words === 1 ? '' : 's'));
    await loadBench(); await refresh(); render();
  }
  async function dropBlock(id) {
    await api('/api/phraszle/blocks', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lid: id }),
    });
    await loadBench(); await refresh(); render();
  }
  async function loadBench() {
    if (!state?.founder) { bench = null; return; }
    const j = await api('/api/phraszle/blocks');
    bench = j.blocks || null;
  }

  async function loadLadder() {
    board = await api('/api/phraszle/ladder');
    if (tab === 'ladder') render();
  }

  async function refresh() {
    state = await api('/api/phraszle/state');
    if (!lid || !(state.ladder || []).some((b) => b.lid === lid && !b.solved)) lid = state.at?.lid || null;
  }

  // ---- the contract --------------------------------------------------------
  async function open(g) {
    grid = g;
    tab = 'dig';
    render();                      // something on screen before the round trip
    await refresh();
    if (!state?.signedIn) await loadLadder();
    await loadBench();
    render();
  }

  // Idempotent: showView calls this on every single view change, whether or not
  // this room was ever opened.
  function close() {
    grid = null;
    board = null;
    bench = null;
    busy = false;
  }

  return { open, close };
}
