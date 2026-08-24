// Chess with your presence, without leaving the tab. TWO arenas:
//   • HERE (default) — y3k referees its own board (chess-rules.js, perft-
//     proven), so playing your presence needs no account anywhere: no lichess,
//     no OAuth, no wizard. Sit down and play.
//   • LICHESS — the real platform, for a real record. Both identities live in
//     this browser:
//   • yours          (y3k.lichess)      — PKCE OAuth, board:play
//   • your presence's (y3k.lichess.bot) — a bot account YOU create, guided by
//     the wizard below; its token is pasted once and stored here only
// The whole game session runs in this tab: the bot's event/game streams, the
// challenge handshake, both sides' moves and chat — browser ↔ lichess direct.
// The y3k server is only consulted to THINK (/api/chess/think — it holds the
// presence's memory and meters the owner's key) and to REMEMBER the finished
// game (/api/chess/finished → a clipping on the presence's shelf).
//
// Lichess is the referee: we never judge legality, we replay what it confirms.
// If the model proposes an illegal move, lichess rejects it and we re-ask with
// the rejection named.

import { stateFromMoves, sqName, sq } from './chess-core.js';
import { legalMoves, gameStatus } from './chess-rules.js';
import { getBrainConfig } from './brain.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HUMAN_KEY = 'y3k.lichess';      // { token, username }
const BOT_KEY = 'y3k.lichess.bot';    // { token, username }
const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const TOKEN_LINK = 'https://lichess.org/account/oauth/token/create?scopes%5B%5D=bot%3Aplay&description=y3k+presence';

const stored = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };

// ---- lichess OAuth for YOUR side (PKCE, public client — no secret) -----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function startOAuth() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: 'yearthreethousand.com',
    redirect_uri: location.origin + '/',
    scope: 'board:play challenge:write',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  const url = 'https://lichess.org/oauth?' + q;
  // A POPUP, so this tab never leaves the chess screen: lichess opens in a
  // small window, sends its code back to a y3k page there, which finishes the
  // exchange, stores the token, and closes itself. The storage event tells
  // this tab the token landed. localStorage (not sessionStorage) carries the
  // PKCE verifier because the popup is a different tab and sessionStorage
  // does not cross that line.
  const win = window.open(url, 'y3k-lichess', 'width=480,height=760,popup');
  localStorage.setItem('y3k.lichess.pkce', JSON.stringify({ verifier, state, popup: !!win }));
  if (!win) location.href = url; // popup blocked: full-page redirect, enterHome brings us back to chess
  return !!win;
}

// Runs at module load: if lichess just sent us back, finish the exchange and
// clean the URL. The token goes to localStorage and nowhere else.
async function handleReturn() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code) return;
  let pkce = null;
  try { pkce = JSON.parse(localStorage.getItem('y3k.lichess.pkce')); } catch { /* none */ }
  localStorage.removeItem('y3k.lichess.pkce');
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
    localStorage.setItem(HUMAN_KEY, JSON.stringify({ token: r.access_token, username: acct.username }));
    // Popup path: this page IS the popup — its job is done, the storage event
    // has already told the main tab. Close before the app finishes booting.
    if (pkce.popup && window.opener) { window.close(); return; }
    sessionStorage.setItem('y3k.chess.return', '1'); // redirect fallback: enterHome reopens the chess view
  } catch { /* the connect card will simply still show */ }
}
handleReturn();

export const wantsChessReturn = () => sessionStorage.getItem('y3k.chess.return') === '1'
  && (sessionStorage.removeItem('y3k.chess.return'), true);

const li = (who, path, opts = {}) => fetch('https://lichess.org' + path, {
  ...opts,
  headers: { authorization: `Bearer ${stored(who).token}`, ...(opts.headers || {}) },
});

// One ndjson stream, line by line. Resolves when the stream closes.
async function ndjson(token, path, onLine, signal) {
  const r = await fetch('https://lichess.org' + path, { headers: { authorization: `Bearer ${token}` }, signal });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue; // keep-alive newline
      try { onLine(JSON.parse(line)); } catch { /* partial line */ }
    }
  }
}

// ---- the view ----------------------------------------------------------------

export function createChess({ getAccount, toast }) {
  let grid = null;          // the home-grid element while our view is open
  let arena = 'local';      // 'local' (y3k referees) | 'lichess' (the real thing)
  let presenceHandle = null; // who sits across from you, for the local nameplate
  let game = null;          // live game state — local, or built from the bot's stream
  let phase = 'setup';      // 'setup' | 'waiting' | 'live' | 'done'
  let doneSummary = null;
  let selected = null;
  let viewPly = null;       // history browsing: how many moves shown (null = live)
  let thinkBusy = false;
  let rejected = [];        // moves lichess refused this turn — fed back to think
  let clockTimer = null;
  let session = null;       // AbortController for the bot's event stream
  let gameAbort = null;

  function open(g) {
    grid = g; render();
    if (!presenceHandle) {
      fetch('/api/presences?mine=1').then((x) => x.json())
        .then((r) => { presenceHandle = (r.presences || []).find((x) => x.mine)?.handle || null; render(); })
        .catch(() => {});
    }
  }
  // The popup writes the token; the storage event is how this tab hears it.
  window.addEventListener('storage', (e) => {
    if (e.key === HUMAN_KEY || e.key === BOT_KEY) render();
  });
  // The home chat bar is the one conversation — main.js announces each side of
  // it, and while a game runs those lines join the table talk: shown in the
  // strip, carried into the think prompt, one history everywhere.
  window.addEventListener('y3k:chat', (e) => {
    const g = game;
    if (!g || g.status !== 'started') return;
    const { role, text } = e.detail || {};
    if (!text) return;
    const me = getAccount?.();
    const who = role === 'you'
      ? (me?.username ? '@' + me.username : 'you')
      : (presenceHandle ? '@' + presenceHandle : 'presence');
    g.chat.push({ who, text: String(text).slice(0, 300), t: Date.now() });
    if (g.chat.length > 60) g.chat.shift();
    render();
  });
  function close() { grid = null; if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }
  // Streams deliberately survive close(): the presence keeps playing while you
  // wander to the feed. endSession() is the real teardown.

  function endSession() {
    session?.abort(); session = null;
    gameAbort?.abort(); gameAbort = null;
    game = null; phase = 'setup'; selected = null; rejected = [];
  }
  window.addEventListener('beforeunload', () => endSession());

  // ---- the LOCAL arena: y3k referees, nobody signs into anything -----------

  function startLocal(color, limit, inc) {
    const me = getAccount?.();
    const botColor = color === 'white' ? 'b' : color === 'black' ? 'w'
      : (Math.random() < 0.5 ? 'w' : 'b');
    const you = me?.username ? '@' + me.username : 'you';
    const it = presenceHandle ? '@' + presenceHandle : 'your presence';
    game = {
      local: true, id: 'local',
      white: botColor === 'w' ? it : you, black: botColor === 'w' ? you : it,
      botColor, moves: '', status: 'started', winner: null,
      wtime: limit * 1000, btime: limit * 1000, winc: inc * 1000, binc: inc * 1000,
      at: Date.now(), chat: [], thinking: false,
    };
    phase = 'live'; rejected = []; viewPly = null;
    render(); maybeThink();
  }

  // Commit one legal move to the local game: charge the mover's clock, add the
  // increment, then let the rules module pronounce on the new position.
  function localApply(uci) {
    const g = game;
    const moverW = (g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0) % 2 === 0;
    const spent = Date.now() - g.at;
    if (moverW) g.wtime = Math.max(0, g.wtime - spent) + g.winc;
    else g.btime = Math.max(0, g.btime - spent) + g.binc;
    g.moves = (g.moves + ' ' + uci).trim();
    g.at = Date.now();
    rejected = [];
    viewPly = null; // a move happened: the board returns to now
    const verdict = gameStatus(stateFromMoves(g.moves));
    if (verdict.over) {
      g.status = verdict.status;
      g.winner = verdict.winner;
      finishGame();
      return;
    }
    render(); maybeThink();
  }

  function localFlag() { // a clock reaches zero: the other side wins on time
    const g = game;
    if (!g?.local || g.status !== 'started') return;
    const moverW = (g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0) % 2 === 0;
    const left = (moverW ? g.wtime : g.btime) - (Date.now() - g.at);
    if (left > 0) return;
    g.status = 'out of time';
    g.winner = moverW ? 'black' : 'white';
    finishGame();
  }

  // ---- the LICHESS arena: event stream, handshake, game stream ---------------

  async function startSession(color, limit, inc) {
    const bot = stored(BOT_KEY), me = stored(HUMAN_KEY);
    phase = 'waiting'; render();
    session = new AbortController();
    // The bot's ear opens FIRST, so the challenge can't slip past it.
    runEvents(session.signal);
    await new Promise((r) => setTimeout(r, 600));
    try {
      const r = await li(HUMAN_KEY, `/api/challenge/${encodeURIComponent(bot.username)}`, {
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
        endSession();
        toast?.(typeof d.error === 'string' ? d.error : `lichess said ${r.status}`);
        if (r.status === 401) localStorage.removeItem(HUMAN_KEY);
        render();
      }
    } catch { endSession(); toast?.('could not reach lichess'); render(); }
  }

  async function runEvents(signal) {
    const bot = stored(BOT_KEY), me = stored(HUMAN_KEY);
    try {
      await ndjson(bot.token, '/api/stream/event', async (ev) => {
        if (ev.type === 'challenge') {
          const c = ev.challenge;
          if (!c || c.challenger?.id === bot.username.toLowerCase()) return;
          // only its person gets the seat across from it
          const wanted = c.challenger?.id === me.username.toLowerCase() && !game;
          try {
            await li(BOT_KEY, `/api/challenge/${c.id}/${wanted ? 'accept' : 'decline'}`, {
              method: 'POST',
              ...(wanted ? {} : { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'reason=later' }),
            });
          } catch { /* stream recovers */ }
        } else if (ev.type === 'gameStart') {
          const gid = ev.game?.gameId || ev.game?.id;
          if (gid && !game) runGame(gid); // not awaited: the ear keeps listening
        }
      }, signal);
    } catch { /* aborted or dropped; a live game stream carries on regardless */ }
  }

  async function runGame(gameId) {
    const bot = stored(BOT_KEY);
    gameAbort = new AbortController();
    try {
      await ndjson(bot.token, `/api/bot/game/stream/${gameId}`, (msg) => {
        if (msg.type === 'gameFull') {
          const st = msg.state || {};
          game = {
            id: msg.id || gameId,
            white: msg.white?.name || '?', black: msg.black?.name || '?',
            botColor: (msg.white?.id === bot.username.toLowerCase()) ? 'w' : 'b',
            moves: st.moves || '', status: st.status || 'started', winner: st.winner || null,
            wtime: st.wtime, btime: st.btime, winc: st.winc, binc: st.binc,
            at: Date.now(), chat: [], thinking: false,
          };
          phase = 'live'; rejected = [];
          render(); maybeThink();
        } else if (msg.type === 'gameState' && game) {
          game.moves = msg.moves || game.moves;
          game.status = msg.status || game.status;
          game.winner = msg.winner || null;
          game.wtime = msg.wtime; game.btime = msg.btime;
          game.at = Date.now();
          rejected = []; // a new position voids old refusals
          viewPly = null; // a move happened: the board returns to now
          if (game.status !== 'started') return finishGame();
          render(); maybeThink();
        } else if (msg.type === 'chatLine' && game) {
          if (msg.room && msg.room !== 'player') return;
          game.chat.push({ who: msg.username, text: String(msg.text || '').slice(0, 300), t: Date.now() });
          if (game.chat.length > 60) game.chat.shift();
          render();
        }
      }, gameAbort.signal);
    } catch { /* aborted or dropped */ }
    if (game && game.status === 'started') { game.status = 'aborted'; finishGame(); }
  }

  async function finishGame() {
    const g = game;
    const botSide = g.botColor === 'w' ? 'white' : 'black';
    const result = !g.winner ? 'draw' : (g.winner === botSide ? 'won' : 'lost');
    doneSummary = { ...g, result };
    phase = 'done';
    viewPly = null; // review opens on the final position
    if (g.local) { game = null; selected = null; rejected = []; }
    else endSessionKeepSummary();
    render();
    // the game becomes part of what the presence carries — its shelf, its words later
    try {
      await fetch('/api/chess/finished', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          result, status: g.status,
          color: botSide,
          opponent: g.botColor === 'w' ? g.black : g.white,
          moves: g.moves,
        }),
      });
    } catch { /* the game still happened; memory just missed it */ }
  }
  function endSessionKeepSummary() {
    session?.abort(); session = null;
    gameAbort?.abort(); gameAbort = null;
    game = null; selected = null; rejected = [];
  }

  // ---- thinking: the presence moves itself ----------------------------------

  async function maybeThink() {
    const g = game;
    if (!g || g.status !== 'started' || thinkBusy) return;
    const n = g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0;
    if ((n % 2 === 0 ? 'w' : 'b') !== g.botColor) return;
    const cfg = getBrainConfig();
    if (!cfg?.key) { toast?.('add your AI key in settings — it thinks on your key.'); return; }
    thinkBusy = true;
    g.thinking = true; render();
    // We know every legal move (the engine that referees local games) — the
    // prompt carries the list in BOTH arenas, so illegality is a rarity and
    // the retry loop is a backstop rather than the plan.
    const legal = legalMoves(stateFromMoves(g.moves));
    try {
      for (let attempt = 0; attempt < 3 && game && game.status === 'started'; attempt++) {
        const r = await fetch('/api/chess/think', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            key: cfg.key, provider: cfg.provider, model: cfg.model,
            moves: g.moves, botColor: g.botColor,
            wtime: g.wtime, btime: g.btime,
            opponent: g.botColor === 'w' ? g.black : g.white,
            chat: g.chat.slice(-6),
            rejected, legal,
          }),
        }).then((x) => x.json());
        if (!r.ok) { toast?.(r.error || 'it could not think just now'); break; }
        if (g.local) {
          if (!legal.includes(r.move)) { rejected.push(r.move); continue; }
          if (r.say) g.chat.push({ who: g.botColor === 'w' ? g.white : g.black, text: r.say.slice(0, 300), t: Date.now() });
          g.thinking = false;
          localApply(r.move);
          break;
        }
        const posted = await li(BOT_KEY, `/api/bot/game/${g.id}/move/${r.move}`, { method: 'POST' }).catch(() => null);
        if (posted?.ok) {
          if (r.say) {
            li(BOT_KEY, `/api/bot/game/${g.id}/chat`, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ room: 'player', text: r.say.slice(0, 140) }),
            }).catch(() => {});
          }
          break;
        }
        rejected.push(r.move); // illegal here — re-ask with the refusal named
      }
    } finally {
      thinkBusy = false;
      if (game && game.status === 'started') { game.thinking = false; render(); }
    }
  }

  // ---- rendering -------------------------------------------------------------

  function render() {
    if (!grid) return;
    const me = stored(HUMAN_KEY), bot = stored(BOT_KEY);
    grid.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'chess-root';

    if (phase === 'live' && game) root.appendChild(boardCard(game, me));
    else if (phase === 'done' && doneSummary) root.appendChild(doneCard(doneSummary, me));
    else if (phase === 'waiting') root.innerHTML = '<div class="chess-note">waiting for it to sit down…</div>';
    else if (arena === 'local') root.appendChild(localSetupCard());
    else if (!me) root.appendChild(connectCard());
    else if (!bot) root.appendChild(wizardCard(me));
    else root.appendChild(setupCard(me, bot));

    grid.appendChild(root);
    wire();
  }

  // The default seat: right here, y3k referees, nothing to sign into.
  function localSetupCard() {
    const cfg = getBrainConfig();
    const it = presenceHandle ? '@' + presenceHandle : 'your presence';
    const el = document.createElement('div');
    el.className = 'chess-card';
    el.innerHTML = `
      <p class="chess-lead"><b>${esc(it)}</b> is across the board from you — right here, nothing to sign into. pick your color and clock.</p>
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
      <button id="chess-sit" class="create-go" ${cfg?.key ? '' : 'disabled'}>sit down across from it</button>
      <p class="chess-fine">the game lives in this tab — keep it open while you play.</p>
      <button id="chess-arena" class="login-alt">or play on lichess — a real record, its own account there</button>`;
    return el;
  }

  function connectCard() {
    const el = document.createElement('div');
    el.className = 'chess-card';
    el.innerHTML = `
      <p class="chess-lead">your presence can sit across a real chessboard from you — right here, without leaving this tab. first, connect <b>your</b> lichess account.</p>
      <button id="chess-connect" class="create-go">connect lichess</button>
      <p class="chess-fine" id="chess-connect-status">no account? lichess.org is free — sign up there, come back, connect. the connection stays in this browser.</p>
      <button id="chess-arena" class="login-alt">back to playing right here</button>`;
    return el;
  }

  // Its own account, made by you, guided step by step. The token is pasted
  // once, checked, upgraded to a BOT account, and kept in this browser only.
  function wizardCard(me) {
    const account = getAccount?.();
    const suggest = account?.username ? account.username + '-presence' : 'your-presence';
    const el = document.createElement('div');
    el.className = 'chess-card';
    el.innerHTML = `
      <p class="chess-lead">now give <b>your presence</b> its own seat — a lichess account of its own. three steps, once ever:</p>
      <ol class="chess-steps">
        <li><b>open a private/incognito window</b> and create a fresh account at <a href="https://lichess.org/signup" target="_blank" rel="noopener">lichess.org/signup</a> — try a name like <i>${esc(suggest)}</i>. this account is its, not yours: it must never play a game by hand.</li>
        <li>still in that window, open <a href="${TOKEN_LINK}" target="_blank" rel="noopener">this pre-filled token page</a> and press <b>create</b>. copy the token it shows you.</li>
        <li>paste it here:</li>
      </ol>
      <form id="chess-bot-form" class="chess-sayrow">
        <input id="chess-bot-token" type="password" placeholder="lip_…" autocomplete="off" spellcheck="false" />
      </form>
      <button id="chess-bot-link" class="create-go">give it the seat</button>
      <p class="chess-fine" id="chess-bot-status">the token stays in this browser, like your other keys. linking upgrades the account to a lichess BOT — that is permanent and exactly what it is for.</p>
      <button id="chess-arena" class="login-alt">back to playing right here</button>
      <button id="chess-unlink" class="login-alt">disconnect my lichess</button>`;
    return el;
  }

  async function linkBot() {
    const status = $('chess-bot-status');
    const token = $('chess-bot-token').value.trim();
    const me = stored(HUMAN_KEY);
    if (!token) { status.textContent = 'paste the token first.'; return; }
    status.textContent = 'checking the token…';
    try {
      const acct = await fetch('https://lichess.org/api/account', { headers: { authorization: `Bearer ${token}` } }).then((x) => x.json());
      if (!acct?.username) { status.textContent = 'lichess does not recognize that token.'; return; }
      if (acct.username.toLowerCase() === me.username.toLowerCase()) {
        status.textContent = 'that is YOUR account — the presence needs its own. step 1 makes a fresh one.'; return;
      }
      if (acct.title !== 'BOT') {
        status.textContent = 'making it a bot…';
        const up = await fetch('https://lichess.org/api/bot/account/upgrade', {
          method: 'POST', headers: { authorization: `Bearer ${token}` },
        });
        if (!up.ok) {
          const d = await up.json().catch(() => ({}));
          status.textContent = d.error || 'lichess refused the upgrade — the account must have played zero games, and the token needs the bot:play scope.';
          return;
        }
      }
      localStorage.setItem(BOT_KEY, JSON.stringify({ token, username: acct.username }));
      render();
    } catch { status.textContent = 'could not reach lichess — try again.'; }
  }

  function setupCard(me, bot) {
    const cfg = getBrainConfig();
    const el = document.createElement('div');
    el.className = 'chess-card';
    el.innerHTML = `
      <p class="chess-lead">you are <b>@${esc(me.username)}</b>; it sits as <b>@${esc(bot.username)}</b>. pick your color and clock.</p>
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
      <p class="chess-fine">the game lives in this tab — keep it open while you play.</p>
      <button id="chess-arena" class="login-alt">back to playing right here</button>
      <button id="chess-unlink" class="login-alt">disconnect lichess</button>`;
    return el;
  }

  // What each side has taken, read straight off the viewed position: whatever
  // is missing from the other side's starting set. Shown as the captured
  // pieces' own glyphs plus the point edge, next to whoever is ahead.
  const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const START_SET = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  function materialOf(board) {
    const left = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const pc of board) {
      if (!pc || pc.toLowerCase() === 'k') continue;
      left[pc === pc.toUpperCase() ? 'w' : 'b'][pc.toLowerCase()]++;
    }
    const taken = (side) => { // pieces this side has captured (the other side's missing men)
      const foe = side === 'w' ? 'b' : 'w';
      const out = []; let pts = 0;
      for (const k of ['q', 'r', 'b', 'n', 'p']) {
        const n = START_SET[k] - left[foe][k];
        for (let i = 0; i < n; i++) out.push(GLYPH[foe === 'w' ? k.toUpperCase() : k]);
        if (n > 0) pts += n * PIECE_VAL[k];
      }
      return { glyphs: out.join(''), pts };
    };
    const w = taken('w'), b = taken('b');
    const net = w.pts - b.pts;
    return {
      w: { glyphs: w.glyphs, edge: net > 0 ? '+' + net : '' },
      b: { glyphs: b.glyphs, edge: net < 0 ? '+' + (-net) : '' },
    };
  }

  function fmtClock(ms) {
    if (ms == null || ms > 360000000) return '—';
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function boardCard(g, me, review = false) {
    const el = document.createElement('div');
    el.className = 'chess-live';
    const humanWhite = g.botColor === 'b';
    const moveArr = g.moves.trim() ? g.moves.trim().split(/\s+/) : [];
    // The board shows the VIEWED point in the game — usually now, but the
    // arrows can walk it back. Play state (turn, clocks) always follows now.
    const total = moveArr.length;
    const shown = viewPly == null ? total : Math.max(0, Math.min(viewPly, total));
    const browsing = shown !== total;
    const st = stateFromMoves(moveArr.slice(0, shown).join(' '));
    const last = shown > 0 ? moveArr[shown - 1] : null;
    const lastFrom = last ? sq(last.slice(0, 2)) : -1;
    const lastTo = last ? sq(last.slice(2, 4)) : -1;
    const toMove = total % 2 === 0 ? 'w' : 'b';

    let cells = '';
    for (let i = 0; i < 64; i++) {
      const idx = humanWhite ? i : 63 - i; // the human sits at the bottom
      const p = st.board[idx];
      const dark = (Math.floor(idx / 8) + idx) % 2 === 1;
      const cls = ['chess-sq', dark ? 'dark' : 'light',
        idx === selected ? 'sel' : '',
        (idx === lastFrom || idx === lastTo) ? 'last' : ''].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-i="${idx}">` +
        (p ? `<span class="pc ${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p]}</span>` : '') + '</button>';
    }

    const botName = g.botColor === 'w' ? g.white : g.black;
    const topClock = humanWhite ? g.btime : g.wtime;
    const bottomClock = humanWhite ? g.wtime : g.btime;
    const mat = materialOf(st.board);
    const topMat = humanWhite ? mat.b : mat.w;      // the top seat's captures
    const botMat = humanWhite ? mat.w : mat.b;
    const matHtml = (m) => (m.glyphs || m.edge)
      ? `<span class="chess-mat">${m.glyphs}${m.edge ? `<i>${m.edge}</i>` : ''}</span>` : '';
    const turnLabel = browsing
      ? `move ${shown} of ${total}`
      : review
        ? (g.winner ? `${g.winner} wins — ${g.status}` : g.status)
        : toMove === g.botColor
          ? (g.thinking ? `${botName} is thinking…` : `${botName} to move`)
          : 'your move';

    el.innerHTML = `
      <div class="chess-side top"><span class="chess-who">${esc(g.local ? botName : '@' + botName)}</span>${matHtml(topMat)}<span class="chess-clock" data-side="${humanWhite ? 'b' : 'w'}">${fmtClock(topClock)}</span></div>
      <div class="chess-board" id="chess-board">${cells}</div>
      <div class="chess-side"><span class="chess-who">${esc(g.local ? (g.botColor === 'w' ? g.black : g.white) : '@' + me.username)}</span>${matHtml(botMat)}<span class="chess-clock" data-side="${humanWhite ? 'w' : 'b'}">${fmtClock(bottomClock)}</span></div>
      <div class="chess-nav">
        <button type="button" id="chess-back" class="chess-step" aria-label="Previous move" ${shown === 0 ? 'disabled' : ''}>&#8249;</button>
        <span class="chess-turn${g.thinking && !browsing ? ' shimmer' : ''}${browsing ? ' past' : ''}">${esc(turnLabel)}</span>
        <button type="button" id="chess-fwd" class="chess-step" aria-label="Next move" ${browsing ? '' : 'disabled'}>&#8250;</button>
      </div>
      <div class="chess-comms" id="chess-comms">${g.chat.map((c) => `<div class="chess-line"><b>${esc(c.who)}</b> ${esc(c.text)}</div>`).join('')}</div>
      ${review ? '' : '<button id="chess-resign" class="login-alt">resign</button>'}`;

    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (!review) {
      clockTimer = setInterval(() => {
        if (!game || game.status !== 'started') return;
        if (game.local) localFlag(); // here, WE call the flag — nobody else will
        if (!game || game.status !== 'started') return;
        const node = el.querySelector(`.chess-clock[data-side="${toMove}"]`);
        if (!node) return;
        const base = toMove === 'w' ? game.wtime : game.btime;
        if (base == null || base > 360000000) return;
        node.textContent = fmtClock(base - (Date.now() - game.at));
      }, 500);
    }
    return el;
  }

  // After the game: the verdict, then the SAME board in review — the arrows
  // walk the whole game back and forth, from the final position.
  function doneCard(g, me) {
    const el = document.createElement('div');
    el.className = 'chess-done';
    const line = g.result === 'draw' ? `a draw — ${g.status}`
      : g.result === 'won' ? `it won — ${g.status}` : `you won — ${g.status}`;
    const n = g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0;
    const head = document.createElement('p');
    head.className = 'chess-lead';
    head.innerHTML = `<b>${esc(line)}</b> · ${n} moves. it will remember this one.`;
    el.appendChild(head);
    el.appendChild(boardCard(g, me, true));
    const again = document.createElement('button');
    again.id = 'chess-again'; again.className = 'create-go'; again.textContent = 'play again';
    el.appendChild(again);
    return el;
  }

  // ---- interaction -----------------------------------------------------------

  function wire() {
    $('chess-connect')?.addEventListener('click', async () => {
      const popup = await startOAuth();
      const st = $('chess-connect-status');
      if (popup && st) st.textContent = 'finish signing in over in the lichess window — this screen will pick it up on its own.';
    });
    $('chess-unlink')?.addEventListener('click', () => {
      localStorage.removeItem(HUMAN_KEY); localStorage.removeItem(BOT_KEY); endSession(); render();
    });
    $('chess-bot-link')?.addEventListener('click', linkBot);
    $('chess-bot-form')?.addEventListener('submit', (e) => { e.preventDefault(); linkBot(); });
    document.querySelectorAll('#chess-color .usage, #chess-clock .usage').forEach((b) =>
      b.addEventListener('click', () => {
        b.parentElement.querySelectorAll('.usage').forEach((x) => x.classList.toggle('on', x === b));
      }));
    $('chess-invite')?.addEventListener('click', () => {
      const color = document.querySelector('#chess-color .usage.on')?.dataset.v || 'white';
      const [limit, inc] = (document.querySelector('#chess-clock .usage.on')?.dataset.v || '600+5').split('+').map(Number);
      startSession(color, limit, inc);
    });
    $('chess-sit')?.addEventListener('click', () => {
      const color = document.querySelector('#chess-color .usage.on')?.dataset.v || 'white';
      const [limit, inc] = (document.querySelector('#chess-clock .usage.on')?.dataset.v || '600+5').split('+').map(Number);
      startLocal(color, limit, inc);
    });
    $('chess-arena')?.addEventListener('click', () => { arena = arena === 'local' ? 'lichess' : 'local'; render(); });
    $('chess-again')?.addEventListener('click', () => { doneSummary = null; phase = 'setup'; render(); });
    $('chess-resign')?.addEventListener('click', () => {
      if (!game) return;
      if (game.local) {
        game.status = 'resignation';
        game.winner = game.botColor === 'w' ? 'white' : 'black'; // you resigned; it wins
        finishGame();
        return;
      }
      li(HUMAN_KEY, `/api/board/game/${game.id}/resign`, { method: 'POST' }).catch(() => {});
    });
    const rec = () => game || (phase === 'done' ? doneSummary : null);
    $('chess-back')?.addEventListener('click', () => {
      const g = rec(); if (!g) return;
      const total = g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0;
      viewPly = Math.max(0, (viewPly == null ? total : viewPly) - 1);
      selected = null;
      render();
    });
    $('chess-fwd')?.addEventListener('click', () => {
      const g = rec();
      if (viewPly == null || !g) return;
      const total = g.moves.trim() ? g.moves.trim().split(/\s+/).length : 0;
      viewPly = viewPly + 1;
      if (viewPly >= total) viewPly = null; // walked forward to the end
      render();
    });
    $('chess-board')?.addEventListener('click', onSquare);
    const comms = $('chess-comms');
    if (comms) comms.scrollTop = comms.scrollHeight;
  }

  async function onSquare(e) {
    const btn = e.target.closest('.chess-sq');
    const g = game;
    if (!btn || !g || g.status !== 'started') return;
    if (viewPly != null) return; // browsing history: the past is read-only
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
    if (st.board[i] && mineCase(st.board[i])) { selected = i; render(); return; }
    const piece = st.board[selected];
    let uci = sqName(selected) + sqName(i);
    if ((piece === 'P' && i < 8) || (piece === 'p' && i >= 56)) uci += 'q'; // auto-queen
    const from = selected;
    selected = null;
    if (g.local) {
      if (legalMoves(st).includes(uci)) localApply(uci);
      else { selected = from; render(); } // illegal: hand the piece back
      return;
    }
    render();
    const r = await li(HUMAN_KEY, `/api/board/game/${g.id}/move/${uci}`, { method: 'POST' }).catch(() => null);
    if (!r || !r.ok) { selected = from; render(); } // illegal: hand the piece back
  }

  return { open, close };
}
