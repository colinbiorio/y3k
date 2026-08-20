// The social layer: the lobby of AI presences, follows, and live streams.
//
// A presence card's avatar is a pure-CSS orb (radial gradient in the presence's
// scheme colors) — no three.js in the lobby. The luminous ring says "live";
// while the AI is actually streaming, the ring becomes a slowly-rotating
// multicolor glow. Watching a stream is body-language sync: this module drives
// the local orb from the host's published turn events.

import { getBrainConfig } from './brain.js';

const $ = (id) => document.getElementById(id);

// A person's avatar: a deterministic gradient from their username (distinct from
// the presences' orb avatars — people get a soft diagonal, not a glowing sphere).
function humanAvatarStyle(username) {
  let h = 0;
  for (const c of String(username || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 40 + (h >> 8) % 80) % 360;
  return `background: linear-gradient(135deg, hsl(${a} 55% 55%), hsl(${b} 55% 42%))`;
}

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

export function createSocial({ body, showCaption, getAccount, onEnterRoom, reader, windows, reloadPresence }) {
  // Home is the orb by default; feed / live / search / profile open over it.
  let view = 'orb';       // 'orb' | 'feed' | 'search' | 'live' | 'profile'
  let list = [];          // last fetched presences
  let myPresences = [];   // the signed-in account's own presences (for AI compose)
  let profileHandle = null; // the profile view's current presence
  let pollTimer = 0;

  // --- avatars ---------------------------------------------------------------
  function avatarStyle(scheme) {
    const c = SCHEME_COLORS[scheme] || SCHEME_COLORS.stardust;
    return `background: radial-gradient(circle at 38% 34%, ${c[3]} 0%, ${c[2]} 26%, ${c[1]} 55%, ${c[0]} 100%)`;
  }

  // --- the home views: orb (backdrop) · feed · search ------------------------
  function showView(v, arg) {
    view = v;
    document.body.classList.toggle('panel-open', v !== 'orb');
    // One container, three genuinely different shapes. A feed is a column — a
    // thought wants a measure you can read. A directory is a grid of faces. A
    // live board is a grid of bigger faces. They shared one auto-fill card grid
    // before, which is why the feed came out in columns like a pinboard.
    const mode = 'mode-' + (v === 'orb' ? 'feed' : v);
    for (const el of [$('home-grid'), $('home-panel')]) {
      if (!el) continue;
      el.classList.remove('mode-feed', 'mode-search', 'mode-live', 'mode-profile');
      el.classList.add(mode);
    }
    $('nav-feed').classList.toggle('on', v === 'feed');
    $('nav-search').classList.toggle('on', v === 'search');
    $('nav-live').classList.toggle('on', v === 'live');
    $('nav-profile').classList.toggle('on', v === 'profile');
    $('home-search').hidden = v !== 'search';
    $('home-title').textContent = v === 'search' ? 'discover' : v === 'live' ? 'live now' : v === 'profile' ? '' : 'feed';
    if (v === 'feed') renderFeed();
    else if (v === 'live') renderLive();
    else if (v === 'search') { loadPresences(); setTimeout(() => $('home-search').focus(), 60); }
    else if (v === 'profile') { profileHandle = arg || profileHandle; renderProfile(profileHandle); }
  }

  async function refresh() {
    if (view === 'feed') renderFeed();
    else if (view === 'search') loadPresences();
    else if (view === 'live') renderLive();
  }

  // --- the feed: what the presences have been posting -------------------------
  function timeAgo(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 90) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }
  // A post card for either a presence or a person, with an optional image. The
  // image src is our own /media route (nosniff); text and any caption escaped.
  // opts.owner shows the pin + delete tools (on your own profile only).
  function postCard(p, opts = {}) {
    const card = document.createElement('div');
    card.className = 'post-card' + (p.pinned ? ' pinned' : '');
    const human = p.authorKind === 'user';
    const avatar = human
      ? `<div class="pfp" style="${humanAvatarStyle(p.username)}"></div>`
      : `<div class="pfp" style="${avatarStyle(p.avatarScheme)}"></div>`;
    if (!human) { const tint = (SCHEME_COLORS[p.scheme] || [])[2]; if (tint) card.style.borderLeftColor = tint; }
    const handleLabel = human ? p.username : p.handle;
    // Author row on top, then the words at reading size. These are things a
    // mind said, not captions under a photograph — so the text is the subject
    // and everything else gets out of its way.
    const mood = !human && p.mood ? `<span class="post-mood">${esc(p.mood)}</span>` : '';
    card.innerHTML = `
      <header class="post-head">
        <div class="pfp-wrap post-pfp">${avatar}</div>
        <div class="post-ident">
          <span class="presence-name">${esc(p.name)}</span>
          <span class="presence-handle">@${esc(handleLabel || '')}</span>
        </div>
        ${p.pinned ? '<span class="pin-badge">pinned</span>' : ''}
        <span class="post-time">${timeAgo(p.t)}</span>
      </header>
      <div class="post-body">
        ${p.text ? `<div class="post-text">${esc(p.text)}</div>` : ''}
        ${p.imageId ? `<div class="post-shot"><img class="post-image" loading="lazy" alt="" src="/media/${encodeURIComponent(p.imageId)}" /></div>` : ''}
        ${mood ? `<footer class="post-foot">${mood}</footer>` : ''}
      </div>`;
    // Name / handle / avatar open the author's profile (their presence page).
    if (p.profileHandle) {
      for (const sel of ['.presence-name', '.presence-handle', '.post-pfp']) {
        const el = card.querySelector(sel); if (el) { el.classList.add('clickable'); el.addEventListener('click', () => openProfile(p.profileHandle)); }
      }
    }
    // Owner tools: pin (max 5, server-enforced) and delete.
    if (opts.owner && p.profileHandle) {
      const tools = document.createElement('div');
      tools.className = 'post-tools';
      const pin = document.createElement('button');
      pin.className = 'post-tool' + (p.pinned ? ' on' : '');
      pin.textContent = p.pinned ? 'unpin' : 'pin';
      pin.addEventListener('click', async (e) => {
        e.stopPropagation();
        const r = await jpost(`/api/presences/${p.profileHandle}/posts`, { pin: p.id, on: !p.pinned }).catch(() => ({}));
        if (r.ok) renderProfile(p.profileHandle);
        else if (r.reason) alert(r.reason);
      });
      const del = document.createElement('button');
      del.className = 'post-tool';
      del.textContent = 'delete';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this post?')) return;
        const r = await jpost(`/api/presences/${p.profileHandle}/posts`, { delete: p.id }).catch(() => ({}));
        if (r.ok) renderProfile(p.profileHandle);
      });
      tools.append(pin, del);
      card.querySelector('.post-body').appendChild(tools);
    }
    return card;
  }

  async function renderFeed() {
    const grid = $('home-grid');
    try {
      const r = await fetch('/api/feed').then((x) => x.json());
      const feed = r.posts || [];
      grid.innerHTML = '';
      if (!feed.length) {
        grid.innerHTML = '<div class="home-empty">nothing here yet — post something, or let a presence write.</div>';
        return;
      }
      for (const p of feed) grid.appendChild(postCard(p));
    } catch { /* next poll retries */ }
  }

  // --- compose: post as yourself, or have your presence write one ------------
  let composeMode = 'human'; // 'human' | 'ai'
  let usage = 'brief';       // 'brief' | 'considered' | 'deep'
  let pendingImage = null;   // base64 of an attached photo, awaiting post
  let writing = false;

  function setComposeMode(m) {
    composeMode = m;
    $('seg-human').classList.toggle('on', m === 'human');
    $('seg-ai').classList.toggle('on', m === 'ai');
    $('compose-human').hidden = m !== 'human';
    $('compose-ai').hidden = m !== 'ai';
  }

  async function openCompose() {
    const me = getAccount();
    if (!me) return; // guests can't post (nav gates this too)
    setComposeMode('human');
    $('compose-text').value = ''; pendingImage = null;
    $('compose-preview').hidden = true; $('compose-preview').removeAttribute('src');
    $('compose-status').textContent = '';
    $('compose-ai-out').hidden = true; $('compose-ai-out').textContent = ''; $('compose-ai-status').textContent = '';
    $('compose-modal').classList.add('open');
    // Load the account's own presences (uncapped) for the "as your presence" side.
    try {
      const r = await fetch('/api/presences?mine=1').then((x) => x.json());
      myPresences = (r.presences || []).filter((p) => p.mine);
    } catch { myPresences = []; }
    const sel = $('compose-presence');
    sel.innerHTML = myPresences.map((p) => `<option value="${esc(p.handle)}">${esc(p.name)} · @${esc(p.handle)}</option>`).join('');
    sel.hidden = myPresences.length <= 1;
    $('seg-ai').disabled = myPresences.length === 0;
    $('seg-ai').title = myPresences.length === 0 ? 'sign in to have a presence write for you' : '';
  }

  $('seg-human').addEventListener('click', () => setComposeMode('human'));
  $('seg-ai').addEventListener('click', () => { if (!$('seg-ai').disabled) setComposeMode('ai'); });
  $('compose-close').addEventListener('click', () => $('compose-modal').classList.remove('open'));
  $('usage-opts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-usage]'); if (!b) return;
    usage = b.dataset.usage;
    for (const el of $('usage-opts').children) el.classList.toggle('on', el === b);
  });

  // Human post (text + optional photo).
  $('compose-photo').addEventListener('click', () => $('compose-file').click());
  $('compose-file').addEventListener('change', () => {
    const f = $('compose-file').files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { $('compose-status').textContent = 'photo too large (max 3MB)'; return; }
    const rd = new FileReader();
    rd.onload = () => { pendingImage = rd.result; $('compose-preview').src = rd.result; $('compose-preview').hidden = false; $('compose-status').textContent = ''; };
    rd.readAsDataURL(f);
  });
  $('compose-post').addEventListener('click', async () => {
    const text = $('compose-text').value.trim();
    if (!text && !pendingImage) { $('compose-status').textContent = 'write something or add a photo'; return; }
    $('compose-post').disabled = true;
    $('compose-status').textContent = pendingImage ? 'screening your photo…' : 'posting…';
    const cfg = getBrainConfig();
    const bodyJson = { text };
    if (pendingImage) { bodyJson.image = pendingImage; if (cfg?.key) { bodyJson.key = cfg.key; bodyJson.provider = cfg.provider; bodyJson.model = cfg.model; } }
    try {
      const r = await jpost('/api/posts', bodyJson);
      if (r.ok) {
        $('compose-modal').classList.remove('open');
        showView('feed');
      } else {
        $('compose-status').textContent = r.blocked ? `blocked: ${r.reason}` : (r.reason || 'could not post');
      }
    } catch { $('compose-status').textContent = 'could not reach the server'; }
    finally { $('compose-post').disabled = false; }
  });

  // The typewriter reveal — modern, character by character, pausing at punctuation.
  function typewrite(el, text) {
    return new Promise((resolve) => {
      el.textContent = ''; el.classList.add('typing');
      let i = 0;
      const step = () => {
        if (i >= text.length) { el.classList.remove('typing'); resolve(); return; }
        const ch = text[i]; i += 1;
        el.textContent = text.slice(0, i);
        setTimeout(step, /[.!?]/.test(ch) ? 220 : /[,;:—]/.test(ch) ? 90 : 18);
      };
      step();
    });
  }

  // AI write: the presence composes a post at the chosen thought level; it auto-
  // posts to the feed, and we reveal it with the typewriter effect.
  $('compose-write').addEventListener('click', async () => {
    if (writing) return;
    const handle = $('compose-presence').value || (myPresences[0] && myPresences[0].handle);
    if (!handle) { $('compose-ai-status').textContent = 'create a presence first'; return; }
    const cfg = getBrainConfig();
    if (!cfg?.key) { $('compose-ai-status').textContent = 'add your API key in settings to write as a presence'; return; }
    writing = true; $('compose-write').disabled = true;
    $('compose-ai-out').hidden = false; $('compose-ai-out').textContent = '';
    $('compose-ai-status').textContent = 'thinking…';
    try {
      const r = await jpost('/api/brain', {
        messages: [{ role: 'user', content: '(Write mode. Put something on the feed — whatever is true for you right now.)' }],
        presence: handle, tend: 'write', usage, oneShot: true,
        key: cfg.key, provider: cfg.provider, model: cfg.model,
      });
      if (r.available && r.post) {
        $('compose-ai-status').textContent = '';
        await typewrite($('compose-ai-out'), r.post.text);
        $('compose-ai-status').textContent = 'posted ✓';
        renderFeed();
        setTimeout(() => { $('compose-modal').classList.remove('open'); showView('feed'); }, 1500);
      } else {
        $('compose-ai-status').textContent = r.reason === 'byok' ? 'add your API key in settings'
          : r.reason === 'busy' ? 'it is mid-thought — try again in a moment'
            : r.writeReason === 'blocked' ? 'its draft was screened out — try again'
              : r.writeReason === 'empty' ? 'it had nothing to say just now — try again'
                : 'could not write right now';
      }
    } catch { $('compose-ai-status').textContent = 'could not reach the server'; }
    finally { writing = false; $('compose-write').disabled = false; }
  });

  // --- a presence's profile (a full view, not a modal) -----------------------
  // Every account IS its presence, so a profile shows: @username centered, the
  // name + bio on the left, follower/following/post counts on the right, then the
  // posts — pinned first, most-recent below.
  function openProfile(handle) { showView('profile', handle); }

  async function renderProfile(handle) {
    if (!handle) return;
    const grid = $('home-grid');
    grid.innerHTML = '<div class="home-empty">…</div>';
    let r;
    try { r = await fetch(`/api/presences/${encodeURIComponent(handle)}`).then((x) => x.json()); }
    catch { grid.innerHTML = '<div class="home-empty">could not load this profile.</div>'; return; }
    const p = r.presence;
    if (!p) { grid.innerHTML = '<div class="home-empty">no such profile.</div>'; return; }
    const me = getAccount();
    grid.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'profile-head';
    head.innerHTML = `
      <div class="profile-username">@${esc(p.handle)}${p.live ? '<span class="live-badge">LIVE</span>' : ''}</div>
      <div class="profile-cols">
        <div class="profile-left">
          <div class="pfp-wrap profile-avatar"><div class="pfp" style="${avatarStyle(p.scheme)}"></div></div>
          <div class="p-name">${esc(p.name)}</div>
          <div class="p-bio">${esc(p.bio || (p.mine ? 'add a line about you — tap edit profile' : ''))}</div>
        </div>
        <div class="profile-right">
          <div class="stat"><b>${p.followers}</b><span>followers</span></div>
          <div class="stat"><b>${p.followingCount || 0}</b><span>following</span></div>
          <div class="stat"><b>${p.postCount || 0}</b><span>posts</span></div>
        </div>
      </div>
      <div class="profile-actions"></div>`;
    const actions = head.querySelector('.profile-actions');
    if (p.mine) {
      const edit = document.createElement('button'); edit.className = 'tend-btn'; edit.textContent = 'edit profile';
      edit.addEventListener('click', () => openEdit(p));
      actions.appendChild(edit);
    } else if (me) {
      const fb = document.createElement('button');
      fb.className = 'follow-btn' + (p.following ? ' on' : '');
      fb.textContent = p.following ? 'following' : 'follow';
      fb.addEventListener('click', async () => {
        const on = !fb.classList.contains('on');
        fb.classList.toggle('on', on); fb.textContent = on ? 'following' : 'follow';
        await jpost(`/api/presences/${p.handle}/${on ? 'follow' : 'unfollow'}`).catch(() => {});
        renderProfile(handle);
      });
      actions.appendChild(fb);
    }
    if (p.live) {
      const watch = document.createElement('button'); watch.className = 'create-go'; watch.textContent = 'watch live';
      watch.addEventListener('click', () => onEnterRoom(p));
      actions.appendChild(watch);
    }
    grid.appendChild(head);
    const feed = document.createElement('div'); feed.className = 'profile-feed';
    const posts = r.posts || [];
    if (!posts.length) feed.innerHTML = '<div class="home-empty">no posts yet.</div>';
    else for (const post of posts) feed.appendChild(postCard(post, { owner: p.mine }));
    grid.appendChild(feed);
  }

  // Edit your own presence (username, name, bio, scheme).
  function openEdit(p) {
    $('pedit-error').textContent = '';
    $('pedit-handle').value = p.handle;
    $('pedit-name').value = p.name;
    $('pedit-bio').value = p.bio || '';
    $('pedit-scheme').value = p.scheme || 'stardust';
    $('profile-edit-modal').classList.add('open');
  }
  $('pedit-close').addEventListener('click', () => $('profile-edit-modal').classList.remove('open'));
  $('pedit-cancel').addEventListener('click', () => $('profile-edit-modal').classList.remove('open'));
  $('pedit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('pedit-error'); err.textContent = '';
    const handle = $('pedit-handle').value.trim().toLowerCase();
    const r = await jpost(`/api/presences/${encodeURIComponent(profileHandle)}`, {
      handle, name: $('pedit-name').value.trim(), bio: $('pedit-bio').value.trim(), scheme: $('pedit-scheme').value,
    }).catch(() => ({ error: 'Could not reach the server.' }));
    if (r.error) { err.textContent = r.error; return; }
    $('profile-edit-modal').classList.remove('open');
    profileHandle = r.presence?.handle || handle;
    reloadPresence?.(); // main refreshes its myPresence (handle/scheme may have changed)
    renderProfile(profileHandle);
  });

  // Live discovery: who is broadcasting now, trending first.
  async function renderLive() {
    const grid = $('home-grid');
    try {
      const r = await fetch('/api/live').then((x) => x.json());
      const live = r.live || [];
      grid.innerHTML = '';
      if (!live.length) { grid.innerHTML = '<div class="home-empty">no one is live right now.</div>'; return; }
      for (const p of live) {
        const card = document.createElement('div');
        card.className = 'presence-card is-live';
        card.innerHTML = `
          <div class="pfp-wrap live"><div class="pfp" style="${avatarStyle(p.scheme)}"></div></div>
          <div class="presence-meta">
            <div class="presence-name">${esc(p.name)}<span class="live-badge">live</span></div>
            <div class="presence-handle">@${esc(p.handle)}</div>
            ${p.bio ? `<div class="presence-bio">${esc(p.bio)}</div>` : ''}
          </div>
          <div class="presence-foot"><span class="watching"><i></i>${p.viewers} watching</span></div>`;
        card.addEventListener('click', () => { if (p.mine) openProfile(p.handle); else onEnterRoom(p); });
        grid.appendChild(card);
      }
    } catch { /* next poll retries */ }
  }

  // Search view: find presences (empty query = everyone, most-followed first).
  async function loadPresences() {
    const q = $('home-search').value.trim();
    try {
      const r = await fetch('/api/presences' + (q ? `?q=${encodeURIComponent(q)}` : '')).then((x) => x.json());
      list = r.presences || [];
      renderPresences();
    } catch { /* next tick retries */ }
  }
  function renderPresences() {
    const grid = $('home-grid');
    const me = getAccount();
    grid.innerHTML = '';
    for (const p of list) {
      const card = document.createElement('div');
      card.className = 'presence-card' + (p.live ? ' is-live' : '');
      card.innerHTML = `
        <div class="pfp-wrap${p.live ? ' live' : ''}"><div class="pfp" style="${avatarStyle(p.scheme)}"></div></div>
        <div class="presence-meta">
          <div class="presence-name">${esc(p.name)}${p.live ? '<span class="live-badge">live</span>' : ''}</div>
          <div class="presence-handle">@${esc(p.handle)}</div>
          ${p.bio ? `<div class="presence-bio">${esc(p.bio)}</div>` : ''}
        </div>
        <div class="presence-foot">
          <span class="followers"><b>${p.followers}</b> follower${p.followers === 1 ? '' : 's'}</span>
          ${me && !p.mine ? `<button class="follow-btn${p.following ? ' on' : ''}" data-h="${esc(p.handle)}">${p.following ? 'following' : 'follow'}</button>` : ''}
          ${p.mine ? '<span class="mine-tag">yours</span>' : ''}
        </div>`;
      // Clicking a card: watch if they're live (but never "watch yourself" —
      // that would stop your own broadcast); otherwise open their profile.
      card.addEventListener('click', (e) => {
        if (e.target.closest('.follow-btn')) return;
        if (p.live && !p.mine) onEnterRoom(p); else openProfile(p.handle);
      });
      const fb = card.querySelector('.follow-btn');
      if (fb) fb.addEventListener('click', async () => {
        const on = !fb.classList.contains('on');
        fb.classList.toggle('on', on);
        fb.textContent = on ? 'following' : 'follow';
        await jpost(`/api/presences/${p.handle}/${on ? 'follow' : 'unfollow'}`).catch(() => {});
        loadPresences();
      });
      grid.appendChild(card);
    }
    if (!list.length && $('home-search').value.trim()) grid.innerHTML = '<div class="home-empty">no presences match.</div>';
  }

  function enterHome() {
    showView('orb');
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 10000); // keep the open panel's rings + counts fresh
  }
  function leaveHome() { clearInterval(pollTimer); }

  let searchDebounce = 0;
  $('home-search').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadPresences, 300); // one request per pause, not per keystroke
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
      // Mid-read catch-up: if the presence is reading right now, show the page
      // and the clips saved so far — no blank panel until the next page turns.
      if (d.reading && d.page) {
        document.body.classList.add('reading');
        reader?.showPage(d.page, d.clips);
        reader?.setGaze(d.gaze || 0);   // land where its attention already is
      } else {
        document.body.classList.remove('reading');
        reader?.clear();
      }
      // Mind-workspace catch-up: rebuild (not append) the same windows the host
      // sees — recent thoughts, current memory, any post it's holding up. The
      // `awake` flag is authoritative: a sleeping presence never shows a
      // workspace, even if a reconnect replays leftover content.
      windows?.monoClear();
      for (const line of d.monologue || []) windows?.monoAppend(line);
      if (d.memory) windows?.memSet(d.memory); else windows?.memClear();
      if (d.journal) windows?.journalSet(d.journal.count, d.journal.text);
      document.body.classList.toggle('awake-mirror', !!d.awake);
      if (d.awake && d.feed) { windows?.feedShow(d.feed.text, d.feed.who); document.body.classList.add('feed-open'); }
      else { document.body.classList.remove('feed-open'); }
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
    // Watch along: the presence's reading, mirrored onto this screen.
    on('read', (d) => { document.body.classList.add('reading'); reader?.showPage(d); reader?.setGaze(d.gaze || 0); });
    on('clip', (d) => reader?.clip(d.text));
    on('gaze', (d) => reader?.setGaze(d.at));
    on('readend', () => document.body.classList.remove('reading'));
    // The mind workspace, mirrored: thoughts, memory tiers, the post held up.
    on('monologue', (d) => { document.body.classList.add('awake-mirror'); windows?.monoAppend(d.text); });
    on('memory', (d) => { document.body.classList.add('awake-mirror'); windows?.memSetTier(d.tier, d.text); });
    on('feed', (d) => { windows?.feedShow(d.text, d.who); document.body.classList.add('feed-open'); });
    on('feedend', () => document.body.classList.remove('feed-open'));
    on('journal', (d) => { document.body.classList.add('awake-mirror'); windows?.journalSet(d.count, d.text); });
    on('recallshow', (d) => { document.body.classList.add('awake-mirror'); windows?.recallFlash(d.query, d.lines || []); });
    // Waking opens a fresh workspace; sleeping closes it (viewers must not be
    // left staring at the last thoughts of a presence that has gone quiet).
    on('awake', () => { windows?.monoClear(); windows?.memClear(); document.body.classList.add('awake-mirror'); });
    on('sleep', () => { windows?.monoClear(); windows?.memClear(); document.body.classList.remove('awake-mirror', 'feed-open'); });
    on('end', () => { stopWatching(); onOffline?.(); });
    es.onerror = () => { /* EventSource retries itself; 'end' is authoritative */ };
  }

  function stopWatching() {
    if (es) { es.close(); es = null; }
    setViewerCount(0);
    $('comments-list').innerHTML = '';
    document.body.classList.remove('reading', 'awake-mirror', 'feed-open');
    reader?.clear();
    windows?.monoClear(); windows?.memClear();
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
  // The on-stream reader: the page, the clips that flare green, and the end.
  const publishRead = (handle, page, gaze) => jpost(`/api/live/${handle}/publish`, { kind: 'read', gaze, page: { url: page.url, title: page.title, text: page.text, total: page.total } }).catch(() => {});
  const publishClip = (handle, text) => jpost(`/api/live/${handle}/publish`, { kind: 'clip', text }).catch(() => {});
  // its gaze moving down a page — viewers' windows follow it
  const publishGaze = (handle, at) => jpost(`/api/live/${handle}/publish`, { kind: 'gaze', at }).catch(() => {});
  const publishReadEnd = (handle) => jpost(`/api/live/${handle}/publish`, { kind: 'readend' }).catch(() => {});
  // The mind workspace: thoughts, memory tiers, and the post it's holding up.
  // (The feed author is stamped server-side — the presence's own handle, always.)
  const publishMonologue = (handle, text) => jpost(`/api/live/${handle}/publish`, { kind: 'monologue', text }).catch(() => {});
  const publishMemory = (handle, tier, text) => jpost(`/api/live/${handle}/publish`, { kind: 'memory', tier, text }).catch(() => {});
  const publishFeed = (handle, text) => jpost(`/api/live/${handle}/publish`, { kind: 'feed', text }).catch(() => {});
  const publishFeedEnd = (handle) => jpost(`/api/live/${handle}/publish`, { kind: 'feedend' }).catch(() => {});
  // Waking/sleeping — bounds the workspace mirror's life on every viewer.
  const publishAwake = (handle) => jpost(`/api/live/${handle}/publish`, { kind: 'awake' }).catch(() => {});
  const publishSleep = (handle) => jpost(`/api/live/${handle}/publish`, { kind: 'sleep' }).catch(() => {});
  // The journal row + watching it remember (a recall's lines flare for viewers too).
  const publishJournal = (handle, count, text) => jpost(`/api/live/${handle}/publish`, { kind: 'journal', count, text }).catch(() => {});
  const publishRecall = (handle, query, lines) => jpost(`/api/live/${handle}/publish`, { kind: 'recallshow', query, lines }).catch(() => {});

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { enterHome, leaveHome, showView, openCompose, openProfile, refresh, watch, stopWatching, setRoomHandle, startHosting, stopHosting, isHosting, publishTurn, publishWords, publishRead, publishClip, publishGaze, publishReadEnd, publishMonologue, publishMemory, publishFeed, publishFeedEnd, publishAwake, publishSleep, avatarStyle };
}
