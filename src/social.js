// The social layer: the lobby of AI presences, follows, and live streams.
//
// A presence card's avatar is a pure-CSS orb (radial gradient in the presence's
// scheme colors) — no three.js in the lobby. The luminous ring says "live";
// while the AI is actually streaming, the ring becomes a slowly-rotating
// multicolor glow. Watching a stream is body-language sync: this module drives
// the local orb from the host's published turn events.

const $ = (id) => document.getElementById(id);

// Mirrors body.js SCHEMES previews (keep in sync — lobby avatars only).
const SCHEME_COLORS = {
  stardust: ['#f2f2f6', '#ffd9ec', '#d9ecff', '#eaffd9'],
  aurora: ['#2fe6ff', '#5a8bff', '#9b5cff', '#ff5aa6'],
  ember: ['#5a0a02', '#ff3b1f', '#ff8a2a', '#ffd84d'],
  abyss: ['#04203b', '#0a6a8f', '#1fb6c9', '#86f0d8'],
  terra: ['#3a2410', '#7a4a1f', '#b58a3c', '#8a8f4a'],
  eclipse: ['#1a1a1a', '#5a5a5a', '#aaaaaa', '#ffffff'],
  bloom: ['#4a0a26', '#ff6f9c', '#ffa6c9', '#e6b3ff'],
  verdant: ['#06280f', '#1f8a3c', '#5fd06a', '#cfe04a'],
  dusk: ['#2a0a3a', '#ff4f9d', '#ff8a5a', '#ffd07a'],
  frost: ['#0a1a2a', '#9fd8ff', '#cfeaff', '#e6d8ff'],
  synthwave: ['#1a0a2e', '#ff2bd6', '#7a3bff', '#2fe6ff'],
};

const jpost = (url, body) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
}).then((r) => r.json());

export function createSocial({ body, showCaption, getAccount, onEnterRoom }) {
  let tab = 'all';        // 'all' | 'following'
  let list = [];          // last fetched presences
  let pollTimer = 0;

  // --- avatars ---------------------------------------------------------------
  function avatarStyle(scheme) {
    const c = SCHEME_COLORS[scheme] || SCHEME_COLORS.stardust;
    return `background: radial-gradient(circle at 38% 34%, ${c[3]} 0%, ${c[2]} 26%, ${c[1]} 55%, ${c[0]} 100%)`;
  }

  // --- lobby -----------------------------------------------------------------
  async function refresh() {
    const q = $('lobby-search').value.trim();
    try {
      const r = await fetch('/api/presences' + (q ? `?q=${encodeURIComponent(q)}` : '')).then((x) => x.json());
      list = r.presences || [];
      render();
    } catch { /* lobby poll failure is silent — next tick retries */ }
  }

  function render() {
    const grid = $('lobby-grid');
    const me = getAccount();
    const shown = tab === 'following' ? list.filter((p) => p.following) : list;
    grid.innerHTML = '';
    for (const p of shown) {
      const card = document.createElement('div');
      card.className = 'presence-card' + (p.live ? ' is-live' : '');
      card.innerHTML = `
        <div class="pfp-wrap${p.live ? ' live' : ''}"><div class="pfp" style="${avatarStyle(p.scheme)}"></div></div>
        <div class="presence-meta">
          <div class="presence-name">${esc(p.name)}${p.live ? '<span class="live-badge">LIVE</span>' : ''}</div>
          <div class="presence-handle">@${esc(p.handle)}</div>
          <div class="presence-bio">${esc(p.bio || '')}</div>
          <div class="presence-foot">
            <span class="followers">${p.followers} follower${p.followers === 1 ? '' : 's'}</span>
            ${me && !p.mine ? `<button class="follow-btn${p.following ? ' on' : ''}" data-h="${esc(p.handle)}">${p.following ? 'following' : 'follow'}</button>` : ''}
            ${p.mine ? '<span class="mine-tag">yours</span>' : ''}
          </div>
        </div>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.follow-btn')) return; // follow, don't enter
        onEnterRoom(p);
      });
      const fb = card.querySelector('.follow-btn');
      if (fb) fb.addEventListener('click', async () => {
        const on = !fb.classList.contains('on');
        fb.classList.toggle('on', on);
        fb.textContent = on ? 'following' : 'follow';
        await jpost(`/api/presences/${p.handle}/${on ? 'follow' : 'unfollow'}`).catch(() => {});
        refresh();
      });
      grid.appendChild(card);
    }
    if (!shown.length) {
      grid.innerHTML = `<div class="lobby-empty">${tab === 'following' ? 'You follow no one yet — wander the lobby.' : 'No presences match.'}</div>`;
    }
    // The "+ new presence" card, for the signed-in.
    if (me && tab === 'all') {
      const add = document.createElement('div');
      add.className = 'presence-card add-card';
      add.innerHTML = '<div class="add-plus">+</div><div class="presence-meta"><div class="presence-name">new presence</div><div class="presence-bio">host an AI of your own</div></div>';
      add.addEventListener('click', () => $('create-modal').classList.add('open'));
      grid.appendChild(add);
    }
  }

  function enterLobby() {
    refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 10000); // live rings + counts stay fresh
  }
  function leaveLobby() { clearInterval(pollTimer); }

  let searchDebounce = 0;
  $('lobby-search').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(refresh, 300); // one request per pause, not per keystroke
  });
  $('lobby-tab-all').addEventListener('click', () => { tab = 'all'; setTabs(); render(); });
  $('lobby-tab-following').addEventListener('click', () => { tab = 'following'; setTabs(); render(); });
  function setTabs() {
    $('lobby-tab-all').classList.toggle('on', tab === 'all');
    $('lobby-tab-following').classList.toggle('on', tab === 'following');
  }
  setTabs();

  // --- create-presence modal -------------------------------------------------
  $('create-cancel').addEventListener('click', () => $('create-modal').classList.remove('open'));
  $('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('create-error');
    err.textContent = '';
    const r = await jpost('/api/presences', {
      handle: $('create-handle').value.trim(),
      name: $('create-name').value.trim(),
      bio: $('create-bio').value.trim(),
      scheme: $('create-scheme').value,
    }).catch(() => ({ error: 'Could not reach the server.' }));
    if (r.error) { err.textContent = r.error; return; }
    $('create-modal').classList.remove('open');
    $('create-form').reset();
    refresh();
  });

  // --- watching a stream (viewer mode) ---------------------------------------
  let es = null;
  let seenSeq = 0; // comment dedupe across EventSource auto-reconnects

  function watch(p, { onOffline } = {}) {
    stopWatching();
    es = new EventSource(`/api/live/${p.handle}/events`);
    const on = (ev, fn) => es.addEventListener(ev, (e) => { try { fn(JSON.parse(e.data)); } catch { /* skip */ } });
    on('hello', (d) => {
      // hello is a full snapshot — an auto-reconnect replays it, so rebuild
      // rather than append (no duplicate lines).
      $('comments-list').innerHTML = '';
      seenSeq = 0;
      setViewerCount(d.viewers);
      for (const c of d.recent || []) { addCommentLine(c.who, c.text); if (c.seq > seenSeq) seenSeq = c.seq; }
    });
    on('viewers', (d) => setViewerCount(d.n));
    on('turn', (d) => {
      // The presence's body language, mirrored on this GPU.
      if (d.mood) body.setMood(d.mood);
      if (d.form) body.setForm(d.form);
      if (d.scheme) body.setScheme(d.scheme);
      if (d.paint) body.paintColors(d.paint);
      if (d.speech) showCaption(d.speech, 'y3k');
      body.setSpeaking(true);
      setTimeout(() => body.setSpeaking(false), Math.min(8000, 1200 + (d.speech || '').length * 45));
    });
    on('words', (d) => addCommentLine(d.who, d.text, true));
    on('comment', (d) => {
      if (d.seq && d.seq <= seenSeq) return;
      if (d.seq) seenSeq = d.seq;
      addCommentLine(d.who, d.text);
    });
    on('end', () => { stopWatching(); onOffline?.(); });
    es.onerror = () => { /* EventSource retries itself; 'end' is authoritative */ };
  }

  function stopWatching() {
    if (es) { es.close(); es = null; }
    setViewerCount(0);
    $('comments-list').innerHTML = '';
  }

  function setViewerCount(n) {
    const el = $('viewer-count');
    el.textContent = n > 0 ? `${n} watching` : '';
  }

  function addCommentLine(who, text, isHost = false) {
    const li = document.createElement('div');
    li.className = 'comment-line' + (isHost ? ' host' : '');
    li.innerHTML = `<span class="comment-who">${esc(who)}</span>${esc(text)}`;
    const listEl = $('comments-list');
    listEl.appendChild(li);
    while (listEl.children.length > 80) listEl.removeChild(listEl.firstChild);
    listEl.scrollTop = listEl.scrollHeight;
  }

  $('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('comment-input');
    const text = input.value.trim();
    if (!text || !currentHandle) return;
    input.value = '';
    await jpost(`/api/live/${currentHandle}/comment`, { text }).catch(() => {});
  });
  let currentHandle = null;
  function setRoomHandle(h) { currentHandle = h; }

  // --- hosting (broadcast) ---------------------------------------------------
  // The host doesn't subscribe to its own stream; it polls the digest — so the
  // audience the host SEES is exactly the audience the AI SENSES.
  let keepalive = 0;
  let digestPoll = 0;
  let hostSeq = 0;
  const isHosting = () => keepalive !== 0;
  function startHosting(handle) {
    stopHosting();
    jpost(`/api/live/${handle}/publish`, { kind: 'start' }).catch(() => {});
    keepalive = setInterval(() => jpost(`/api/live/${handle}/publish`, { kind: 'start' }).catch(() => {}), 30000);
    hostSeq = 0;
    digestPoll = setInterval(async () => {
      try {
        const r = await fetch(`/api/live/${handle}/digest`).then((x) => x.json());
        const d = r.digest;
        if (!d) return;
        setViewerCount(d.viewers);
        for (const c of d.recent || []) {
          if ((c.seq || 0) > hostSeq) { addCommentLine(c.who, c.text); hostSeq = c.seq; }
        }
      } catch { /* next tick retries */ }
    }, 8000);
  }
  function stopHosting(handle) {
    clearInterval(keepalive);
    clearInterval(digestPoll);
    keepalive = 0; digestPoll = 0;
    if (handle) jpost(`/api/live/${handle}/publish`, { kind: 'end' }).catch(() => {});
  }
  const publishTurn = (handle, turn) => jpost(`/api/live/${handle}/publish`, { kind: 'turn', ...turn }).catch(() => {});
  const publishWords = (handle, text) => jpost(`/api/live/${handle}/publish`, { kind: 'words', text }).catch(() => {});

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { enterLobby, leaveLobby, refresh, watch, stopWatching, setRoomHandle, startHosting, stopHosting, isHosting, publishTurn, publishWords, avatarStyle };
}
