// Chess with your presence, without leaving the tab. The board renders here,
// the presence thinks through /api/chess/think (on the owner's key), and the
// human's own moves go straight from this browser to lichess with a token that
// never touches the y3k server — the same custody rule as the brain key.
//
// Lichess is the referee: we never judge legality, we replay what it confirms.

import { stateFromMoves, sqName, sq } from './chess-core.js';
import { getBrainConfig } from './brain.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS_KEY = 'y3k.lichess'; // { token, username } — this browser only
const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

function linked() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
}

// ---- lichess OAuth (PKCE, public client — no registration, no secret) --------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function startOAuth() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem('y3k.lichess.pkce', JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: 'yearthreethousand.com',
    redirect_uri: location.origin + '/',
    scope: 'board:play challenge:write',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  location.href = 'https://lichess.org/oauth?' + q;
}

// Runs at module load: if lichess just sent us back, finish the exchange and
// clean the URL. The token goes to localStorage and nowhere else.
async function handleReturn() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code) return;
  let pkce = null;
  try { pkce = JSON.parse(sessionStorage.getItem('y3k.lichess.pkce')); } catch { /* none */ }
  sessionStorage.removeItem('y3k.lichess.pkce');
  history.replaceState(null, '', location.pathname); // the code is single-use — never leave it in the URL
  if (!pkce || q.get('state') !== pkce.state) return;
  try {
    const r = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: pkce.verifier,
        redirect_uri: location.origin + '/',
        client_id: 'yearthreethousand.com',
      }),
    }).then((x) => x.json());
    if (!r.access_token) return;
    const acct = await fetch('https://lichess.org/api/account', { headers: { authorization: `Bearer ${r.access_token}` } }).then((x) => x.json());
    localStorage.setItem(LS_KEY, JSON.stringify({ token: r.access_token, username: acct.username }));
    sessionStorage.setItem('y3k.chess.return', '1'); // main-flow hint: reopen the chess view
  } catch { /* the connect card will simply still show */ }
}
handleReturn();

export const wantsChessReturn = () => sessionStorage.getItem('y3k.chess.return') === '1'
  && (sessionStorage.removeItem('y3k.chess.return'), true);

const human = (path, opts = {}) => {
  const l = linked();
  return fetch('https://lichess.org' + path, {
    ...opts,
    headers: { authorization: `Bearer ${l.token}`, ...(opts.headers || {}) },
  });
};

// ---- the view ----------------------------------------------------------------

export function createChess({ getAccount, toast }) {
  let grid = null;          // the home-grid element while our view is open
  let es = null;            // the one EventSource for the session
  let snap = null;          // latest server status() snapshot
  let selected = null;      // origin square index awaiting a target
  let thinkBusy = false;
  let clockTimer = null;
  const seenChat = [];      // dedupe: the bot's say comes back as a chatLine echo too

  function open(g) { grid = g; connect(); render(); }
  function close() { grid = null; if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }
  // The SSE stays open across views while a game runs — the presence keeps
  // playing if you wander to the feed; the board is simply re-rendered on return.

  function connect() {
    if (es) return;
    es = new EventSource('/api/chess/stream');
    es.addEventListener('state', (e) => { snap = JSON.parse(e.data); onState(); });
    es.addEventListener('thinking', (e) => { if (snap?.game) { snap.game.thinking = JSON.parse(e.data).on; render(); } });
    es.addEventListener('chat', (e) => {
      const line = JSON.parse(e.data);
      const key = line.who + ':' + line.text;
      if (seenChat.includes(key)) return;
      seenChat.push(key); if (seenChat.length > 12) seenChat.shift();
      if (snap?.game) { snap.game.chat = [...(snap.game.chat || []), line]; render(); }
    });
    es.addEventListener('finish', (e) => {
      const f = JSON.parse(e.data);
      if (snap) { snap.game = { ...(snap.game || {}), ...f, thinking: false }; }
      render();
    });
    es.onerror = () => { /* EventSource reconnects itself */ };
  }

  function onState() {
    render();
    maybeThink();
  }

  // The presence moves itself: whenever the state says it is its turn, one
  // think call goes out. The server re-checks the turn, so a stale client can
  // never move early; the busy flags stop double-fire.
  async function maybeThink() {
    const g = snap?.game;
    if (!g || g.status !== 'started' || g.thinking || thinkBusy) return;
    const n = g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0;
    if ((n % 2 === 0 ? 'w' : 'b') !== g.botColor) return;
    const cfg = getBrainConfig();
    if (!cfg?.key) return; // the setup card already said why
    thinkBusy = true;
    try {
      const r = await fetch('/api/chess/think', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: cfg.key, provider: cfg.provider, model: cfg.model }),
      }).then((x) => x.json());
      if (r.error && !r.busy) toast?.(r.error);
    } catch { /* next state event retries */ }
    thinkBusy = false;
  }

  // ---- rendering -------------------------------------------------------------

  function render() {
    if (!grid) return;
    const l = linked();
    const g = snap?.game;
    grid.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'chess-root';

    if (!snap) { root.innerHTML = '<div class="home-empty">…</div>'; grid.appendChild(root); return; }

    if (!snap.configured) {
      root.innerHTML = '<div class="chess-note">chess is not switched on for this server yet — it needs a lichess bot account (LICHESS_BOT_TOKEN).</div>';
    } else if (snap.error) {
      root.innerHTML = `<div class="chess-note">${esc(snap.error)}</div>`;
    } else if (!l) {
      root.innerHTML = `
        <div class="chess-card">
          <p class="chess-lead">your presence has a seat at a real chessboard. connect your lichess account to sit down across from it — the connection stays in this browser, and you never have to leave this tab.</p>
          <button id="chess-connect" class="create-go">connect lichess</button>
          <p class="chess-fine">no lichess account? it is free at lichess.org — make one, come back, connect.</p>
        </div>`;
    } else if (!g || (g.status && g.status !== 'started' && !g.id)) {
      root.appendChild(setupCard(l));
    } else {
      root.appendChild(boardCard(g, l));
    }
    grid.appendChild(root);
    wire();
  }

  function setupCard(l) {
    const cfg = getBrainConfig();
    const el = document.createElement('div');
    el.className = 'chess-card';
    el.innerHTML = `
      <p class="chess-lead">you are <b>@${esc(l.username)}</b> on lichess. pick your color and clock, and invite it to the board.</p>
      ${cfg?.key ? '' : '<p class="chess-warn">it thinks on your API key — add one in settings → brain before you start.</p>'}
      <div class="chess-opts" id="chess-color">
        <button data-v="white" class="usage on"><b>white</b><span>you move first</span></button>
        <button data-v="black" class="usage"><b>black</b><span>it moves first</span></button>
        <button data-v="random" class="usage"><b>either</b><span>coin flip</span></button>
      </div>
      <div class="chess-opts" id="chess-clock">
        <button data-v="600+5" class="usage on"><b>10+5</b><span>rapid</span></button>
        <button data-v="900+10" class="usage"><b>15+10</b><span>unhurried</span></button>
        <button data-v="1800+0" class="usage"><b>30+0</b><span>a long sit</span></button>
      </div>
      <button id="chess-invite" class="create-go" ${cfg?.key ? '' : 'disabled'}>invite it to the board</button>
      <p class="chess-fine" id="chess-setup-status"></p>
      <button id="chess-unlink" class="login-alt">disconnect lichess</button>`;
    return el;
  }

  function fmtClock(ms) {
    if (ms == null || ms > 360000000) return '—';
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function boardCard(g, l) {
    const el = document.createElement('div');
    el.className = 'chess-live';
    const st = stateFromMoves(g.moves);
    const humanWhite = g.botColor === 'b';
    const moveArr = g.moves.trim() ? g.moves.trim().split(/\s+/) : [];
    const last = moveArr[moveArr.length - 1];
    const lastFrom = last ? sq(last.slice(0, 2)) : -1;
    const lastTo = last ? sq(last.slice(2, 4)) : -1;
    const toMove = moveArr.length % 2 === 0 ? 'w' : 'b';
    const over = g.status && g.status !== 'started';

    let cells = '';
    for (let i = 0; i < 64; i++) {
      // flip the board so the human sits at the bottom
      const idx = humanWhite ? i : 63 - i;
      const p = st.board[idx];
      const dark = (Math.floor(idx / 8) + idx) % 2 === 1;
      const cls = ['chess-sq', dark ? 'dark' : 'light',
        idx === selected ? 'sel' : '',
        (idx === lastFrom || idx === lastTo) ? 'last' : ''].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-i="${idx}" ${over ? 'disabled' : ''}>` +
        (p ? `<span class="pc ${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p]}</span>` : '') + '</button>';
    }

    const botName = g.botColor === 'w' ? g.white : g.black;
    const presLabel = snap.game.presenceHandle ? '@' + snap.game.presenceHandle : botName;
    const topClock = humanWhite ? g.btime : g.wtime;
    const botClock = humanWhite ? g.wtime : g.btime;
    const turnLabel = over
      ? (g.winner ? `${g.winner} wins — ${g.status}` : `${g.status}`)
      : (toMove === g.botColor
        ? (g.thinking ? `${presLabel} is thinking…` : `${presLabel} to move`)
        : 'your move');

    el.innerHTML = `
      <div class="chess-side top"><span class="chess-who">${esc(presLabel)}</span><span class="chess-clock" data-side="${humanWhite ? 'b' : 'w'}">${fmtClock(topClock)}</span></div>
      <div class="chess-board" id="chess-board">${cells}</div>
      <div class="chess-side"><span class="chess-who">@${esc(l.username)}</span><span class="chess-clock" data-side="${humanWhite ? 'w' : 'b'}">${fmtClock(botClock)}</span></div>
      <div class="chess-turn${g.thinking ? ' shimmer' : ''}">${esc(turnLabel)}</div>
      <div class="chess-comms" id="chess-comms">${(g.chat || []).map((c) => `<div class="chess-line"><b>${esc(c.who)}</b> ${esc(c.text)}</div>`).join('')}</div>
      ${over ? '<button id="chess-again" class="create-go">play again</button>'
        : `<form id="chess-say" class="chess-sayrow"><input id="chess-say-in" type="text" maxlength="140" placeholder="say something…" autocomplete="off" /></form>
           <button id="chess-resign" class="login-alt">resign</button>`}`;

    // the clocks run forward locally between server truths
    if (clockTimer) clearInterval(clockTimer);
    if (!over) {
      clockTimer = setInterval(() => {
        const active = toMove === 'w' ? 'w' : 'b';
        const node = el.querySelector(`.chess-clock[data-side="${active}"]`);
        if (!node || snap?.game?.status !== 'started') return;
        const base = active === 'w' ? snap.game.wtime : snap.game.btime;
        if (base == null || base > 360000000) return;
        node.textContent = fmtClock(base - (Date.now() - snap.game.at));
      }, 500);
    }
    return el;
  }

  // ---- interaction -----------------------------------------------------------

  function wire() {
    $('chess-connect')?.addEventListener('click', startOAuth);
    $('chess-unlink')?.addEventListener('click', () => { localStorage.removeItem(LS_KEY); render(); });
    document.querySelectorAll('#chess-color .usage, #chess-clock .usage').forEach((b) =>
      b.addEventListener('click', () => {
        b.parentElement.querySelectorAll('.usage').forEach((x) => x.classList.toggle('on', x === b));
      }));
    $('chess-invite')?.addEventListener('click', invite);
    $('chess-again')?.addEventListener('click', () => { snap.game = null; render(); });
    $('chess-resign')?.addEventListener('click', async () => {
      await fetch('/api/chess/resign', { method: 'POST' });
    });
    $('chess-say')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = $('chess-say-in');
      const text = inp.value.trim();
      if (!text || !snap?.game?.id) return;
      inp.value = '';
      await human(`/api/board/game/${snap.game.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ room: 'player', text }),
      }).catch(() => toast?.('lichess did not take that message'));
    });
    $('chess-board')?.addEventListener('click', onSquare);
    const comms = $('chess-comms');
    if (comms) comms.scrollTop = comms.scrollHeight;
  }

  async function invite() {
    const status = $('chess-setup-status');
    const color = document.querySelector('#chess-color .usage.on')?.dataset.v || 'white';
    const [limit, inc] = (document.querySelector('#chess-clock .usage.on')?.dataset.v || '600+5').split('+').map(Number);
    const l = linked();
    status.textContent = 'taking a seat…';
    const ex = await fetch('/api/chess/expect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lichessUser: l.username }),
    }).then((x) => x.json()).catch(() => ({ error: 'could not reach the server' }));
    if (ex.error) { status.textContent = ex.error; return; }
    status.textContent = `challenging ${ex.botUser}…`;
    try {
      const r = await human(`/api/challenge/${encodeURIComponent(ex.botUser)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          rated: 'false',
          'clock.limit': String(limit), 'clock.increment': String(inc),
          color,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        status.textContent = d.error ? JSON.stringify(d.error) : `lichess said ${r.status}`;
        if (r.status === 401) { localStorage.removeItem(LS_KEY); render(); }
        return;
      }
      status.textContent = 'waiting for it to sit down…';
    } catch { status.textContent = 'could not reach lichess'; }
  }

  async function onSquare(e) {
    const btn = e.target.closest('.chess-sq');
    const g = snap?.game;
    if (!btn || !g || g.status !== 'started') return;
    const i = Number(btn.dataset.i);
    const moveArr = g.moves.trim() ? g.moves.trim().split(/\s+/) : [];
    const toMove = moveArr.length % 2 === 0 ? 'w' : 'b';
    if (toMove === g.botColor) return; // not your turn
    const st = stateFromMoves(g.moves);
    const mineCase = toMove === 'w' ? (p) => p === p.toUpperCase() : (p) => p === p.toLowerCase();

    if (selected == null) {
      if (st.board[i] && mineCase(st.board[i])) { selected = i; render(); }
      return;
    }
    if (i === selected) { selected = null; render(); return; }
    if (st.board[i] && mineCase(st.board[i])) { selected = i; render(); return; } // re-pick
    const piece = st.board[selected];
    let uci = sqName(selected) + sqName(i);
    // auto-queen: the honest default; underpromotion can come later
    if ((piece === 'P' && i < 8) || (piece === 'p' && i >= 56)) uci += 'q';
    const from = selected;
    selected = null;
    render();
    const r = await human(`/api/board/game/${g.id}/move/${uci}`, { method: 'POST' }).catch(() => null);
    if (!r || !r.ok) {
      // illegal or unreachable: put the selection back so the piece "shakes off" the try
      selected = from;
      render();
    }
  }

  return { open, close };
}
