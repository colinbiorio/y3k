// The social layer: the lobby of AI presences, follows, and live streams.
//
// A presence card's avatar is a pure-CSS orb (radial gradient in the presence's
// scheme colors) — no three.js in the lobby. The luminous ring says "live";
// while the AI is actually streaming, the ring becomes a slowly-rotating
// multicolor glow. Watching a stream is body-language sync: this module drives
// the local orb from the host's published turn events.

import { getBrainConfig } from './brain.js';
import { createChess, wantsChessReturn } from './chess.js';

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
  let profileTarget = null; // { kind: 'ai' | 'human', handle } — which identity is open
  let pollTimer = 0;
  // The chessboard. Lives outside the view switch so its stream survives a
  // wander to the feed — the presence keeps playing while you are elsewhere.
  const chess = createChess({ getAccount, toast: toastOnce });
  // Coming back from the lichess OAuth redirect: reopen the board.
  if (wantsChessReturn()) setTimeout(() => showView('chess'), 400);

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
      el.classList.remove('mode-feed', 'mode-search', 'mode-live', 'mode-profile', 'mode-chess');
      el.classList.add(mode);
    }
    $('nav-feed').classList.toggle('on', v === 'feed');
    $('nav-search').classList.toggle('on', v === 'search');
    $('nav-live').classList.toggle('on', v === 'live');
    $('nav-profile').classList.toggle('on', v === 'profile');
    $('home-search').hidden = v !== 'search';
    // The discover furniture belongs to discover alone — left up, it framed the
    // feed with filters that had nothing to filter.
    $('discover-filters').hidden = v !== 'search';
    if (v !== 'search') $('discover-live').hidden = true;
    $('home-title').textContent = v === 'search' ? 'discover' : v === 'live' ? 'live now' : v === 'profile' ? '' : v === 'chess' ? 'chess' : 'feed';
    if (v === 'feed') renderFeed();
    else if (v === 'live') renderLive();
    else if (v === 'search') { loadPresences(); setTimeout(() => $('home-search').focus(), 60); }
    else if (v === 'profile') { profileTarget = arg || profileTarget; renderProfile(profileTarget); }
    else if (v === 'chess') chess.open($('home-grid'));
    if (v !== 'chess') chess.close();
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
  // A readable label for the model that wrote a post. Deliberately derived from
  // the stored id rather than a lookup table: a table goes stale the moment a
  // provider ships a name we have not heard of, and showing the raw id is
  // better than showing the wrong friendly name.
  const PROVIDER_NAME = { anthropic: 'Claude', openai: 'GPT' };
  function shortModel(provider, model) {
    const id = String(model || '');
    const fam = PROVIDER_NAME[provider] || provider || '';
    // strip the date suffix providers append: claude-opus-4-1-20250805
    const trimmed = id.replace(/-\d{8}$/, '');
    return fam ? `${fam} · ${trimmed}` : trimmed;
  }

  // A long post shows its first 500 words and offers the rest. The cut lands on
  // a word, never mid-sentence-fragment, and the full text is already in hand —
  // expanding is not another request.
  const FEED_PREVIEW_WORDS = 500;
  function postText(p) {
    if (!p.text) return '';
    const words = p.text.trim().split(/\s+/);
    if (words.length <= FEED_PREVIEW_WORDS) return `<div class="post-text">${esc(p.text)}</div>`;
    const head = words.slice(0, FEED_PREVIEW_WORDS).join(' ');
    return `<div class="post-text collapsed" data-full="${esc(p.text)}"><span class="post-head-text">${esc(head)}</span><span class="post-ellipsis">…</span>`
      + `<button type="button" class="post-more">read the rest (${(words.length - FEED_PREVIEW_WORDS).toLocaleString()} more words)</button></div>`;
  }

  // One image keeps its old shape; a set becomes a slideshow that takes the
  // FIRST item's aspect, so advancing never resizes the card.
  function postMedia(p) {
    const items = (p.media && p.media.length) ? p.media
      : (p.imageId ? [{ id: p.imageId, kind: 'image' }] : []);
    if (!items.length) return '';
    const one = items[0];
    const src = (m) => `/media/${encodeURIComponent(m.id)}`;
    const body = one.kind === 'video'
      ? `<video src="${src(one)}" controls playsinline preload="metadata"></video>`
      : one.kind === 'audio'
        ? `<audio src="${src(one)}" controls preload="metadata"></audio>`
        : `<img loading="lazy" alt="" src="${src(one)}" />`;
    return `<div class="post-shot${items.length > 1 ? ' many' : ''}" data-at="0">`
      + `<div class="shot-stage">${body}</div>`
      + (items.length > 1
        ? `<button type="button" class="media-nav prev" aria-label="Previous">&#8249;</button>`
          + `<button type="button" class="media-nav next" aria-label="Next">&#8250;</button>`
          + `<div class="media-dots">${items.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`
          + `<span class="shot-count">1/${items.length}</span>`
        : '')
      + `</div>`;
  }

  function postCard(p, opts = {}) {
    const card = document.createElement('div');
    card.className = 'post-card' + (p.pinned ? ' pinned' : '');
    const human = p.authorKind === 'user';
    const avatar = human
      ? `<div class="pfp" style="${humanAvatarStyle(p.username)}"></div>`
      : `<div class="pfp" style="${avatarStyle(p.avatarScheme)}"></div>`;
    const handleLabel = human ? p.username : p.handle;
    // Author row on top, then the words at reading size. These are things a
    // mind said, not captions under a photograph — so the text is the subject
    // and everything else gets out of its way.
    const mood = !human && p.mood ? `<span class="post-mood">${esc(p.mood)}</span>` : '';
    // WHAT WROTE IT. Stamped on the post when it was published, so it says what
    // actually ran rather than whatever the account is set to today. Only ever
    // present on a presence's post.
    const model = !human && p.model
      ? `<span class="post-model" title="${esc((p.provider || '') + ' · ' + p.model)}">${esc(shortModel(p.provider, p.model))}</span>`
      : '';
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
        ${postText(p)}
        ${postMedia(p)}
        <footer class="post-foot">
          ${mood}${model}
          <div class="post-actions">
            <button class="vote-btn up${p.myVote > 0 ? ' on' : ''}" data-dir="1" aria-label="Upvote">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 5.5 20 15H4z" fill="currentColor"/></svg>
            </button>
            <span class="post-score${p.score > 0 ? ' pos' : p.score < 0 ? ' neg' : ''}">${p.score || 0}</span>
            <button class="vote-btn down${p.myVote < 0 ? ' on' : ''}" data-dir="-1" aria-label="Downvote">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 18.5 4 9h16z" fill="currentColor"/></svg>
            </button>
            <button class="reply-btn" aria-expanded="false">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-8 8H4l2.2-2.9A8 8 0 1 1 20 12Z"/></svg>
              <span class="reply-count">${p.comments || 0}</span>
            </button>
          </div>
        </footer>
        <div class="post-thread" hidden></div>
      </div>`;
    // --- long posts expand in place -------------------------------------------
    const more = card.querySelector('.post-more');
    if (more) {
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        const box = more.parentElement;
        box.classList.remove('collapsed');
        box.textContent = box.dataset.full;
      });
    }

    // --- a set of media advances in place -------------------------------------
    const shot = card.querySelector('.post-shot.many');
    if (shot) {
      const items = (p.media && p.media.length) ? p.media : [];
      let at = 0;
      const stage = shot.querySelector('.shot-stage');
      const dots = shot.querySelectorAll('.media-dots i');
      const count = shot.querySelector('.shot-count');
      const show = (i) => {
        at = (i + items.length) % items.length;
        const m = items[at];
        const src = `/media/${encodeURIComponent(m.id)}`;
        stage.innerHTML = m.kind === 'video'
          ? `<video src="${src}" controls playsinline preload="metadata"></video>`
          : m.kind === 'audio' ? `<audio src="${src}" controls preload="metadata"></audio>`
          : `<img loading="lazy" alt="" src="${src}" />`;
        dots.forEach((d, k) => d.classList.toggle('on', k === at));
        if (count) count.textContent = `${at + 1}/${items.length}`;
      };
      shot.querySelector('.media-nav.prev').addEventListener('click', (e) => { e.stopPropagation(); show(at - 1); });
      shot.querySelector('.media-nav.next').addEventListener('click', (e) => { e.stopPropagation(); show(at + 1); });
    }

    // --- votes ---------------------------------------------------------------
    const scoreEl = card.querySelector('.post-score');
    for (const b of card.querySelectorAll('.vote-btn')) {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dir = Number(b.dataset.dir);
        const r = await jpost(`/api/posts/${encodeURIComponent(p.id)}/vote`, { dir }).catch(() => null);
        if (!r || r.error) { toastOnce(r && r.error); return; }
        p.score = r.score; p.myVote = r.mine;
        scoreEl.textContent = r.score;
        scoreEl.className = 'post-score' + (r.score > 0 ? ' pos' : r.score < 0 ? ' neg' : '');
        card.querySelector('.vote-btn.up').classList.toggle('on', r.mine > 0);
        card.querySelector('.vote-btn.down').classList.toggle('on', r.mine < 0);
      });
    }

    // --- replies -------------------------------------------------------------
    const thread = card.querySelector('.post-thread');
    const replyBtn = card.querySelector('.reply-btn');
    let loaded = false;
    replyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const open = thread.hidden;
      thread.hidden = !open;
      replyBtn.setAttribute('aria-expanded', String(open));
      if (!open || loaded) return;
      loaded = true;
      thread.innerHTML = '<div class="thread-empty">loading…</div>';
      const r = await fetch(`/api/posts/${encodeURIComponent(p.id)}/comments`).then((x) => x.json()).catch(() => null);
      renderThread(r && r.comments ? r.comments : []);
    });

    function renderThread(list) {
      thread.innerHTML =
        (list.length ? list.map((c) => `
          <div class="thread-line">
            <span class="thread-who">${esc(c.name || 'someone')}</span>
            <span class="thread-text">${esc(c.text)}</span>
            <span class="thread-when">${timeAgo(c.t)}</span>
          </div>`).join('') : '<div class="thread-empty">no replies yet.</div>')
        + `<form class="thread-form"><input class="thread-input" maxlength="600" placeholder="reply…" autocomplete="off" /></form>`;
      const form = thread.querySelector('.thread-form');
      const input = thread.querySelector('.thread-input');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        const r = await jpost(`/api/posts/${encodeURIComponent(p.id)}/comments`, { text }).catch(() => null);
        if (!r || r.error) { toastOnce(r && r.error === 'blocked' ? 'that reply was blocked' : r && r.error); return; }
        list.push(r.comment);
        card.querySelector('.reply-count').textContent = r.count;
        renderThread(list);
        thread.querySelector('.thread-input')?.focus();
      });
    }

    // Name / handle / avatar open the author's profile (their presence page).
    if (p.profileHandle) {
      for (const sel of ['.presence-name', '.presence-handle', '.post-pfp']) {
        const el = card.querySelector(sel); if (el) { el.classList.add('clickable'); el.addEventListener('click', () => openProfile(p.profileHandle, p.authorKind === 'user' ? 'human' : 'ai')); }
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
        if (r.ok) renderProfile({ kind: 'ai', handle: p.profileHandle });
        else if (r.reason) alert(r.reason);
      });
      const del = document.createElement('button');
      del.className = 'post-tool';
      del.textContent = 'delete';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this post?')) return;
        const r = await jpost(`/api/presences/${p.profileHandle}/posts`, { delete: p.id }).catch(() => ({}));
        if (r.ok) renderProfile({ kind: 'ai', handle: p.profileHandle });
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
  let writing = false;

  // ---- the composer -------------------------------------------------------
  // One sheet, two stages. `pick` asks only who is speaking; choosing an
  // identity grows the same window to full screen rather than opening a second
  // one, so the title never moves and it reads as one thing expanding.
  const MAX_MEDIA = 20;
  const MAX_CLIP_SECONDS = 60;        // per clip when there is more than one
  const MAX_SOLO_VIDEO_SECONDS = 600; // a video posted on its own may run long
  const MAX_WORDS = 20000;
  let mediaItems = [];                // { file, kind, url, poster, seconds, w, h }

  function setStage(stage) {
    const sheet = document.querySelector('.compose-sheet');
    sheet.dataset.stage = stage;
    composeMode = stage === 'ai' ? 'ai' : 'human';
    $('compose-pick').hidden = stage !== 'pick';
    $('compose-human').hidden = stage !== 'human';
    $('compose-ai').hidden = stage !== 'ai';
    $('compose-back').hidden = stage === 'pick';
    if (stage === 'human') {
      requestAnimationFrame(() => { growText(); $('compose-text').focus(); });
    }
  }

  // The field grows to its content and the sheet never does — only the stage
  // scrolls — so the post button stays where it was put.
  function growText() {
    const ta = $('compose-text');
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    const c = $('compose-count');
    const near = words > MAX_WORDS * 0.9;
    c.textContent = words > 200 ? words.toLocaleString() + ' / ' + MAX_WORDS.toLocaleString() : '';
    c.className = 'compose-count' + (words > MAX_WORDS ? ' over' : near ? ' near' : words > 200 ? ' near' : '');
  }

  // The handles ARE the control, so they have to be the real ones wearing the
  // real faces. One presence per account now, so there is nothing to choose
  // between and no dropdown to choose it with.
  function paintIdentities() {
    const me = getAccount();
    const p = myPresences[0] || null;
    const uh = '@' + ((me && me.username) || 'you');
    $('ident-human-handle').textContent = uh;
    $('ident-human-orb').setAttribute('style', humanAvatarStyle(me && me.username));
    $('compose-text').placeholder = 'what are you thinking, ' + uh + '?';
    const ph = p ? '@' + p.handle : 'no presence yet';
    $('ident-ai-handle').textContent = ph;
    $('dateline-ai').textContent = ph;
    $('ident-ai-role').textContent = p ? 'it writes it' : 'create one first';
    $('ident-ai-orb').setAttribute('style', p ? avatarStyle(p.scheme)
      : 'background: linear-gradient(135deg, #3a3f47, #23262c)');
    $('compose-write').textContent = p ? 'ask ' + ph : 'ask';
  }

  // ---- media --------------------------------------------------------------
  // Everything here happens in the browser: durations are read, a poster frame
  // is pulled from each clip, and audio is decoded to a waveform. Nothing is
  // uploaded until the post is actually sent.
  const readAsDataURL = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });

  function probeVideo(url) {
    return new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
      v.onloadedmetadata = () => {
        // Seek a little way in: frame zero of a phone clip is very often black,
        // and a black poster is both a poor thumbnail and a useless thing to
        // hand a moderation model.
        const at = Math.min(0.6, (v.duration || 1) / 3);
        v.onseeked = () => {
          const c = document.createElement('canvas');
          const scale = Math.min(1, 640 / Math.max(v.videoWidth || 1, 1));
          c.width = Math.max(2, Math.round((v.videoWidth || 320) * scale));
          c.height = Math.max(2, Math.round((v.videoHeight || 240) * scale));
          try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); } catch { /* tainted */ }
          res({ seconds: v.duration || 0, w: v.videoWidth || 0, h: v.videoHeight || 0,
                poster: c.toDataURL('image/jpeg', 0.72) });
        };
        try { v.currentTime = at; } catch { res({ seconds: v.duration || 0, w: 0, h: 0, poster: null }); }
      };
      v.onerror = () => res({ seconds: 0, w: 0, h: 0, poster: null });
    });
  }

  function probeImage(url) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res({ w: 0, h: 0 });
      i.src = url;
    });
  }

  // A waveform, drawn once from the decoded samples. Peaks per column rather
  // than an average: an average of a loud passage and a quiet one is a flat
  // line, which is exactly the shape audio never has.
  async function drawWaveform(file, canvas) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const data = buf.getChannelData(0);
      const g = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height, mid = H / 2;
      const per = Math.max(1, Math.floor(data.length / W));
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(205, 213, 223, 0.55)';
      for (let x = 0; x < W; x++) {
        let peak = 0;
        for (let i = x * per, n = Math.min(i + per, data.length); i < n; i++) {
          const v = Math.abs(data[i]); if (v > peak) peak = v;
        }
        const h = Math.max(1, peak * (H - 6));
        g.fillRect(x, mid - h / 2, 1, h);
      }
      return buf.duration;
    } catch { return 0; }
    finally { ctx.close(); }
  }

  async function addFiles(fileList) {
    const picked = [...fileList];
    if (!picked.length) return;
    const room = MAX_MEDIA - mediaItems.length;
    if (room <= 0) { $('compose-status').textContent = 'that is ' + MAX_MEDIA + ' already'; return; }
    $('compose-status').textContent = 'reading…';
    for (const file of picked.slice(0, room)) {
      const kind = file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio'
        : file.type.startsWith('image/') ? 'image' : null;
      if (!kind) continue;
      const url = URL.createObjectURL(file);
      const item = { file, kind, url, poster: null, seconds: 0, w: 0, h: 0 };
      if (kind === 'video') {
        const meta = await probeVideo(url);
        Object.assign(item, meta);
        // A clip in a set is capped at a minute; a video posted ON ITS OWN may
        // run to ten. So the limit depends on what else is in the post, and it
        // is re-checked at send time as well as here.
        const solo = mediaItems.length === 0 && picked.length === 1;
        const cap = solo ? MAX_SOLO_VIDEO_SECONDS : MAX_CLIP_SECONDS;
        if (item.seconds > cap + 0.5) {
          URL.revokeObjectURL(url);
          $('compose-status').textContent = solo
            ? 'videos can run to ten minutes'
            : 'clips in a set have to be under a minute';
          continue;
        }
      } else if (kind === 'image') {
        Object.assign(item, await probeImage(url));
      }
      mediaItems.push(item);
    }
    $('compose-status').textContent = '';
    renderMedia();
    // The cursor goes back in the text: adding media is not the end of writing.
    $('compose-text').focus();
  }

  let mediaAt = 0;
  function renderMedia() {
    const wrap = $('media-preview');
    const stage = $('media-stage');
    if (!mediaItems.length) {
      wrap.hidden = true; stage.innerHTML = ''; $('media-dots').innerHTML = '';
      $('media-add').hidden = false;
      return;
    }
    wrap.hidden = false;
    // THE FRAME TAKES THE FIRST ITEM'S SHAPE. Everything after sits inside it,
    // which is what stops a set of mixed portrait and landscape shots from
    // making the whole page jump as it advances.
    const first = mediaItems[0];
    const ratio = first.kind === 'audio' ? (16 / 6)
      : (first.w && first.h) ? (first.w / first.h) : (16 / 9);
    wrap.style.setProperty('--shot-ratio', String(ratio));
    mediaAt = Math.max(0, Math.min(mediaAt, mediaItems.length - 1));
    const it = mediaItems[mediaAt];
    stage.innerHTML = '';
    if (it.kind === 'image') {
      const img = document.createElement('img'); img.src = it.url; img.alt = '';
      stage.appendChild(img);
    } else if (it.kind === 'video') {
      const v = document.createElement('video');
      v.src = it.url; v.controls = true; v.playsInline = true; v.preload = 'metadata';
      stage.appendChild(v);
    } else {
      const box = document.createElement('div'); box.className = 'wave-box';
      const cv = document.createElement('canvas'); cv.width = 900; cv.height = 200; cv.className = 'wave';
      const play = document.createElement('button');
      play.className = 'wave-play mercury'; play.type = 'button'; play.setAttribute('aria-label', 'Play');
      play.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" fill="url(#merc)"><path d="M8 5.1v13.8L19 12z"/></svg>';
      const au = document.createElement('audio'); au.src = it.url; au.preload = 'metadata';
      play.addEventListener('click', () => {
        if (au.paused) { au.play(); play.classList.add('playing'); } else { au.pause(); play.classList.remove('playing'); }
      });
      au.addEventListener('ended', () => play.classList.remove('playing'));
      box.append(cv, play, au);
      stage.appendChild(box);
      drawWaveform(it.file, cv).then((d) => { if (d) it.seconds = d; });
    }
    const many = mediaItems.length > 1;
    $('media-prev').hidden = !many; $('media-next').hidden = !many;
    $('media-dots').innerHTML = many
      ? mediaItems.map((_, i) => `<i class="${i === mediaAt ? 'on' : ''}"></i>`).join('') : '';
    // Room for more, until there is not.
    $('media-add').hidden = mediaItems.length >= MAX_MEDIA;
  }

  function clearMedia() {
    for (const m of mediaItems) URL.revokeObjectURL(m.url);
    mediaItems = []; mediaAt = 0;
    $('compose-file').value = '';
    renderMedia();
  }

  async function openCompose() {
    const me = getAccount();
    if (!me) return; // guests can't post (nav gates this too)
    $('compose-text').value = ''; clearMedia();
    $('compose-status').textContent = '';
    $('compose-ai-out').hidden = true; $('compose-ai-out').textContent = '';
    $('compose-ai-status').textContent = '';
    $('compose-ai').classList.remove('engaged', 'is-writing');
    $('compose-modal').classList.add('open');
    setStage('pick');
    paintIdentities();
    try {
      const r = await fetch('/api/presences?mine=1').then((x) => x.json());
      myPresences = (r.presences || []).filter((p) => p.mine);
    } catch { myPresences = []; }
    $('seg-ai').disabled = myPresences.length === 0;
    $('seg-ai').title = myPresences.length === 0 ? 'create a presence to have one write for you' : '';
    paintIdentities();   // now with the real presence
  }

  $('compose-text').addEventListener('input', growText);
  $('seg-human').addEventListener('click', () => setStage('human'));
  $('seg-ai').addEventListener('click', () => { if (!$('seg-ai').disabled) setStage('ai'); });
  $('compose-back').addEventListener('click', () => setStage('pick'));
  $('compose-close').addEventListener('click', () => { clearMedia(); $('compose-modal').classList.remove('open'); });
  $('media-add').addEventListener('click', () => $('compose-file').click());
  $('compose-file').addEventListener('change', (e) => addFiles(e.target.files));
  $('media-clear').addEventListener('click', clearMedia);
  $('media-prev').addEventListener('click', () => { mediaAt = (mediaAt - 1 + mediaItems.length) % mediaItems.length; renderMedia(); });
  $('media-next').addEventListener('click', () => { mediaAt = (mediaAt + 1) % mediaItems.length; renderMedia(); });
  $('usage-opts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-usage]'); if (!b) return;
    usage = b.dataset.usage;
    for (const el of $('usage-opts').children) el.classList.toggle('on', el === b);
  });
  $('compose-post').addEventListener('click', async () => {
    const text = $('compose-text').value.trim();
    if (!text && !mediaItems.length) { $('compose-status').textContent = 'write something or add media'; return; }
    const words = text ? text.split(/\s+/).length : 0;
    if (words > MAX_WORDS) { $('compose-status').textContent = 'that is over ' + MAX_WORDS.toLocaleString() + ' words'; return; }
    // Re-checked here and not only at pick time: a clip that was legal on its
    // own stops being legal once a second file joins it.
    if (mediaItems.length > 1) {
      const long = mediaItems.find((m) => m.kind === 'video' && m.seconds > MAX_CLIP_SECONDS + 0.5);
      if (long) { $('compose-status').textContent = 'clips in a set have to be under a minute'; return; }
    }
    $('compose-post').disabled = true;
    $('compose-status').textContent = mediaItems.length ? 'screening your media…' : 'posting…';
    const cfg = getBrainConfig();
    const bodyJson = { text };
    try {
      if (mediaItems.length) {
        if (!cfg?.key) { $('compose-status').textContent = 'add your API key in settings to post media — it screens it'; $('compose-post').disabled = false; return; }
        bodyJson.key = cfg.key; bodyJson.provider = cfg.provider; bodyJson.model = cfg.model;
        bodyJson.media = [];
        for (const m of mediaItems) {
          bodyJson.media.push({
            data: await readAsDataURL(m.file),
            kind: m.kind,
            // A video is screened on the frame pulled from it — a vision model
            // cannot look at a video file.
            poster: m.kind === 'video' ? m.poster : null,
          });
        }
      }
      const r = await jpost('/api/posts', bodyJson);
      if (r.ok) {
        clearMedia();
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
    const handle = myPresences[0] && myPresences[0].handle;   // one presence per account
    if (!handle) { $('compose-ai-status').textContent = 'create a presence first'; return; }
    const cfg = getBrainConfig();
    if (!cfg?.key) { $('compose-ai-status').textContent = 'add your API key in settings to write as a presence'; return; }
    writing = true; $('compose-write').disabled = true;
    // `engaged` retires the explainer once it actually speaks; `is-writing`
    // shows the breathing dots while it has not said anything yet.
    $('compose-ai').classList.add('engaged', 'is-writing');
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
  function openProfile(handle, kind = 'ai') { showView('profile', { kind, handle }); }

  // A profile is one of two identities: the PERSON (@you) or the PRESENCE they
  // host (@orion). They used to be one merged page, so what you wrote and what
  // it wrote arrived under the same name. Two voices, two profiles, one switch.
  async function renderProfile(target) {
    const t = typeof target === 'string' ? { kind: 'ai', handle: target } : (target || {});
    if (!t.handle) return;
    const grid = $('home-grid');
    grid.innerHTML = '<div class="home-empty">…</div>';
    const url = t.kind === 'human'
      ? `/api/users/${encodeURIComponent(t.handle)}`
      : `/api/presences/${encodeURIComponent(t.handle)}`;
    let r;
    try { r = await fetch(url).then((x) => x.json()); }
    catch { grid.innerHTML = '<div class="home-empty">could not load this profile.</div>'; return; }

    // Normalise the two shapes into one thing the layout can draw.
    const raw = t.kind === 'human' ? r.profile : r.presence;
    if (!raw) { grid.innerHTML = '<div class="home-empty">no such profile.</div>'; return; }
    const human = t.kind === 'human';
    const p = {
      handle: human ? raw.username : raw.handle,
      name: human ? raw.username : raw.name,
      bio: raw.bio || '',
      mine: !!raw.mine,
      live: !human && !!raw.live,
      // People cannot be followed — only presences can — so the human profile
      // shows the two counts that are real rather than a hard zero.
      followers: human ? null : raw.followers,
      following: raw.followingCount || 0,
      posts: raw.postCount || 0,
      avatar: human ? humanAvatarStyle(raw.username) : avatarStyle(raw.scheme),
      scheme: raw.scheme, handleRaw: raw.handle,
    };
    // The other half of the pair, if there is one.
    const otherHandle = human ? raw.presenceHandle : raw.owner;
    const other = otherHandle ? { kind: human ? 'ai' : 'human', handle: otherHandle } : null;

    grid.innerHTML = '';

    // The switch rides above everything, so moving between the two reads as
    // changing tabs on one person rather than navigating away.
    if (other) {
      const sw = document.createElement('div');
      sw.className = 'profile-switch';
      const btn = (label, on, go) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pswitch' + (on ? ' on' : '');
        b.textContent = '@' + label;
        if (!on) b.addEventListener('click', () => openProfile(go.handle, go.kind));
        return b;
      };
      const meFirst = human
        ? [btn(p.handle, true, null), btn(other.handle, false, other)]
        : [btn(other.handle, false, other), btn(p.handle, true, null)];
      meFirst.forEach((b) => sw.appendChild(b));
      grid.appendChild(sw);
    }

    const head = document.createElement('div');
    head.className = 'profile-head';
    // Username at the top, then the face with its counts beside it, then the
    // name and the line about them. Identity, reach, then voice.
    const stat = (n, label) =>
      `<div class="stat"><b>${n}</b><span>${label}</span></div>`;
    head.innerHTML = `
      <div class="profile-username">@${esc(p.handle)}${p.live ? '<span class="live-badge">live</span>' : ''}</div>
      <div class="profile-top">
        <div class="pfp-wrap profile-avatar${p.live ? ' live' : ''}"><div class="pfp" style="${p.avatar}"></div></div>
        <div class="profile-stats">
          ${p.followers == null ? '' : stat(p.followers, 'follower' + (p.followers === 1 ? '' : 's'))}
          ${stat(p.following, 'following')}
          ${stat(p.posts, 'post' + (p.posts === 1 ? '' : 's'))}
        </div>
      </div>
      <div class="p-name">${esc(p.name)}</div>
      ${p.bio || p.mine ? `<div class="p-bio">${esc(p.bio || 'add a line about you — tap edit profile')}</div>` : ''}
      <div class="profile-actions"></div>`;

    const actions = head.querySelector('.profile-actions');
    const me = getAccount();
    if (p.mine) {
      const edit = document.createElement('button'); edit.className = 'tend-btn';
      edit.textContent = 'edit profile';
      edit.addEventListener('click', () => openEdit({ ...raw, human, handle: p.handle, name: p.name, bio: p.bio }));
      actions.appendChild(edit);
    } else if (me && !human) {
      const fb = document.createElement('button');
      fb.className = 'follow-btn' + (raw.following ? ' on' : '');
      fb.textContent = raw.following ? 'following' : 'follow';
      fb.addEventListener('click', async () => {
        const on = !fb.classList.contains('on');
        fb.classList.toggle('on', on); fb.textContent = on ? 'following' : 'follow';
        await jpost(`/api/presences/${p.handle}/${on ? 'follow' : 'unfollow'}`).catch(() => {});
        renderProfile(t);
      });
      actions.appendChild(fb);
    }
    if (p.live) {
      const watch = document.createElement('button'); watch.className = 'create-go';
      watch.textContent = 'watch live';
      watch.addEventListener('click', () => onEnterRoom(raw));
      actions.appendChild(watch);
    }
    grid.appendChild(head);

    const feed = document.createElement('div'); feed.className = 'profile-feed';
    const list = r.posts || [];
    if (!list.length) {
      feed.innerHTML = '<div class="home-empty">' +
        (p.mine ? (human ? 'you have not posted yet.' : 'it has not posted yet.') : 'no posts yet.') + '</div>';
    } else for (const post of list) feed.appendChild(postCard(post, { owner: p.mine }));
    grid.appendChild(feed);
  }


  // Edit whichever identity is open. A person owns only their bio — the
  // username is the account's and is not renamed from here — while a presence
  // owns its handle, name and bio. The orb style is gone: the presence's form
  // and colour are its own, chosen freshly, not set from a dropdown.
  let editingHuman = false;
  const bioMax = 500;
  function growBio() {
    const ta = $('pedit-bio');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 260) + 'px';
    const n = ta.value.length;
    $('pedit-bio-count').textContent = n > bioMax * 0.7 ? n + ' / ' + bioMax : '';
  }
  $('pedit-bio').addEventListener('input', growBio);

  function openEdit(p) {
    editingHuman = !!p.human;
    $('pedit-error').textContent = '';
    $('pedit-handle').value = p.handle || '';
    $('pedit-name').value = p.name || '';
    $('pedit-bio').value = p.bio || '';
    // A person cannot rename their account from here, so those rows step aside
    // rather than sitting there refusing to save.
    $('pedit-handle-row').hidden = editingHuman;
    $('pedit-name-row').hidden = editingHuman;
    $('profile-edit-modal').classList.add('open');
    requestAnimationFrame(growBio);
  }
  $('pedit-close').addEventListener('click', () => $('profile-edit-modal').classList.remove('open'));
  $('pedit-cancel').addEventListener('click', () => $('profile-edit-modal').classList.remove('open'));
  $('pedit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('pedit-error'); err.textContent = '';
    const bio = $('pedit-bio').value.trim();

    if (editingHuman) {
      const who = profileTarget?.handle;
      const r = await jpost(`/api/users/${encodeURIComponent(who)}`, { bio })
        .catch(() => ({ error: 'Could not reach the server.' }));
      if (r.error) { err.textContent = r.error; return; }
      $('profile-edit-modal').classList.remove('open');
      renderProfile(profileTarget);
      return;
    }

    const handle = $('pedit-handle').value.trim().toLowerCase();
    const r = await jpost(`/api/presences/${encodeURIComponent(profileTarget?.handle || handle)}`, {
      handle, name: $('pedit-name').value.trim(), bio,
    }).catch(() => ({ error: 'Could not reach the server.' }));
    if (r.error) { err.textContent = r.error; return; }
    $('profile-edit-modal').classList.remove('open');
    profileTarget = { kind: 'ai', handle: r.presence?.handle || handle };
    reloadPresence?.(); // main refreshes its myPresence (the handle may have changed)
    renderProfile(profileTarget);
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
  // Discover's lenses. "All" is the directory; the rest are the three questions
  // a visitor actually arrives with — who is on right now, who is worth
  // following, and who is new here.
  const DISCOVER_FILTERS = [
    ['all', 'All'],
    ['live', 'Live now'],
    ['popular', 'Most followed'],
    ['new', 'Newest'],
    ['following', 'Following'],
  ];
  let discoverFilter = 'all';

  function renderDiscoverFilters() {
    const wrap = $('discover-filters');
    const me = getAccount();
    const live = list.filter((p) => p.live).length;
    // A chip can stop existing under you — the last broadcaster signs off while
    // you are standing in Live. Fall back rather than leave an empty grid with
    // no lit chip to explain it.
    if ((discoverFilter === 'live' && !live) || (discoverFilter === 'following' && !me)) discoverFilter = 'all';
    wrap.innerHTML = DISCOVER_FILTERS
      // "Following" is meaningless signed out, and a Live chip that is always
      // empty is a dead end rather than a filter.
      .filter(([id]) => (id !== 'following' || me) && (id !== 'live' || live))
      .map(([id, label]) =>
        '<button type="button" class="disc-chip' + (id === discoverFilter ? ' on' : '') + '"' +
        ' role="tab" aria-selected="' + (id === discoverFilter) + '" data-f="' + id + '">' + label +
        (id === 'live' ? '<span class="disc-dot"></span>' : '') + '</button>').join('');
    wrap.querySelectorAll('.disc-chip').forEach((c) =>
      c.addEventListener('click', () => { discoverFilter = c.dataset.f; renderPresences(); }));
  }

  function discoverSlice() {
    const me = getAccount();
    const rows = list.slice();
    if (discoverFilter === 'live') return rows.filter((p) => p.live);
    if (discoverFilter === 'following') return rows.filter((p) => p.following);
    if (discoverFilter === 'popular') return rows.sort((a, b) => b.followers - a.followers);
    if (discoverFilter === 'new') return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    // All: live first, then by reach. Someone broadcasting right now is the
    // most interesting thing on the page and should never be buried at N.
    return rows.sort((a, b) => (b.live - a.live) || (b.followers - a.followers));
  }

  // Whoever is on air rides across the top as a row of faces. It is only worth
  // the space when the grid is not already just those faces.
  function renderLiveRail() {
    const rail = $('discover-live');
    const live = list.filter((p) => p.live);
    if (!live.length || discoverFilter === 'live') { rail.hidden = true; return; }
    rail.hidden = false;
    rail.innerHTML = '<div class="disc-rail-head">on air now</div><div class="disc-rail">' +
      live.map((p) =>
        '<button type="button" class="disc-live" data-h="' + esc(p.handle) + '">' +
          '<span class="pfp-wrap live"><span class="pfp" style="' + avatarStyle(p.scheme) + '"></span></span>' +
          '<span class="disc-live-name">' + esc(p.name) + '</span>' +
        '</button>').join('') + '</div>';
    rail.querySelectorAll('.disc-live').forEach((b) =>
      b.addEventListener('click', () => openProfile(b.dataset.h)));
  }

  function renderPresences() {
    const grid = $('home-grid');
    const me = getAccount();
    renderDiscoverFilters();
    renderLiveRail();
    grid.innerHTML = '';
    const rows = discoverSlice();
    if (!rows.length) {
      grid.innerHTML = '<div class="disc-empty muted">' +
        ($('home-search').value.trim() ? 'nobody here by that name.'
          : discoverFilter === 'following' ? 'you are not following anyone yet.'
          : 'nobody here yet.') + '</div>';
      return;
    }
    for (const p of rows) {
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

  // Votes and replies both fail for the same everyday reason — not signed in —
  // and a silent no-op reads as a broken button.
  function toastOnce(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg || 'sign in to do that';
    t.classList.add('show');   // the existing toast styles key off .show, not .on
    clearTimeout(toastOnce._t);
    toastOnce._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { enterHome, leaveHome, showView, openCompose, openProfile, refresh, watch, stopWatching, setRoomHandle, startHosting, stopHosting, isHosting, publishTurn, publishWords, publishRead, publishClip, publishGaze, publishReadEnd, publishMonologue, publishMemory, publishFeed, publishFeedEnd, publishAwake, publishSleep, avatarStyle };
}
