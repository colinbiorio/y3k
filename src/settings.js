// Settings: collapsible sections — Brain, Voice, Room, API usage.
//   • Brain  — bring-your-own AI key (Anthropic / OpenAI) + model.
//   • Voice  — ElevenLabs key, choose/describe a voice, delivery sliders.
//   • Room   — the metal room, made yours: brightness / grooves / tint / glow.
//   • API    — what your key has spent: by day, by model, tokens + dollars.
// Y3K's own FORM and COLOR stay wholly its own (chosen freshly every reply) —
// the room is the HUMAN's side of the space, so that part is customizable.
// All selections persist in localStorage; usage comes from the server ledger.

import { getBrainConfig, setBrainConfig } from './brain.js';
import { getVoiceKey, setVoiceKey } from './voice.js';
import { ENVIRONMENTS } from './environments.js';

const KEY = 'y3k.voice';
const SAMPLE = 'Hello. I am Y3K. This is what I sound like.';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Brain key → provider, by prefix (mirrors the server's detection).
function detectProviderLocal(key) {
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}
const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI' };
function pickDefaultModel(prov, models) {
  const ids = models.map((m) => m.id);
  if (prov === 'anthropic') return ids.find((id) => id.includes('opus-4-8')) || ids.find((id) => id.includes('sonnet-4-6')) || ids[0];
  return ids.find((id) => /gpt-4o-mini/.test(id)) || ids.find((id) => /gpt-4o/.test(id)) || ids[0];
}
// Send the visitor's ElevenLabs key (if any) with every voice request.
const vKeyHeader = () => { const k = getVoiceKey(); return k ? { 'x-voice-key': k } : {}; };

export function createSettings(body, { music } = {}) {
  const modal = $('settings');
  const bodyEl = $('settings-body');
  let built = false;
  let currentSample = null; // the one audition/preview clip currently playing

  // A saved room style applies the moment the app boots — the room is theirs.
  try {
    const savedRoom = JSON.parse(localStorage.getItem('y3k.room'));
    if (savedRoom) body.setRoom?.(savedRoom);
  } catch { /* stock room */ }

  function getActive() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { voiceId: 'browser', settings: {} }; }
    catch { return { voiceId: 'browser', settings: {} }; }
  }
  function setActive(a) { localStorage.setItem(KEY, JSON.stringify(a)); }

  function selectVoice(id) {
    const a = getActive();
    a.voiceId = id;
    setActive(a);
    document.querySelectorAll('.voice-row').forEach((r) => r.classList.toggle('on', r.dataset.id === id));
  }

  function voiceRow(container, v) {
    const active = getActive();
    const row = document.createElement('div');
    row.className = 'voice-row' + (active.voiceId === v.id ? ' on' : '');
    row.dataset.id = v.id;
    const meta = v.labels ? [v.labels.gender, v.labels.accent, v.labels.age, v.labels.description].filter(Boolean).join(' · ') : '';
    // The browser voice and ElevenLabs' shared premade voices aren't deletable;
    // your own designed/cloned voices are.
    const deletable = v.id !== 'browser' && v.category !== 'premade';
    row.innerHTML =
      `<span class="dot"></span><span class="vname">${esc(v.name)}</span><span class="vmeta">${esc(meta)}</span>` +
      (v.id === 'browser' ? '' : '<button class="play" title="Play sample">▶</button>') +
      (deletable ? '<button class="voice-del" title="Delete voice" aria-label="Delete voice">✕</button>' : '');
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('play') || e.target.classList.contains('voice-del')) return;
      selectVoice(v.id);
    });
    const play = row.querySelector('.play');
    if (play) play.addEventListener('click', (e) => { e.stopPropagation(); sample(v.id, play); });
    const del = row.querySelector('.voice-del');
    if (del) del.addEventListener('click', (e) => { e.stopPropagation(); deleteVoice(v.id, row); });
    container.appendChild(row);
  }

  async function deleteVoice(id, row) {
    if (!window.confirm('Delete this voice from your ElevenLabs library? This cannot be undone.')) return;
    const del = row.querySelector('.voice-del');
    if (del) { del.disabled = true; del.textContent = '…'; }
    try {
      const r = await fetch('/api/voice/delete', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ voiceId: id }),
      }).then((x) => x.json());
      if (r.ok) {
        row.remove();
        if (getActive().voiceId === id) selectVoice('browser'); // fall back if the active voice is gone
      } else if (del) { del.disabled = false; del.textContent = '✕'; del.title = r.error || 'could not delete'; }
    } catch { if (del) { del.disabled = false; del.textContent = '✕'; } }
  }

  // Only one audition plays at a time; stop the previous before starting another.
  function playExclusive(audio) {
    if (currentSample && currentSample !== audio) { try { currentSample.pause(); } catch { /* ignore */ } }
    currentSample = audio;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  async function sample(id, btn) {
    if (id === 'browser') {
      if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(SAMPLE));
      return;
    }
    btn.disabled = true;
    try {
      const r = await fetch('/api/voice/tts', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ text: SAMPLE, voiceId: id, settings: getActive().settings }),
      });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      const done = () => URL.revokeObjectURL(url); // free the blob whether it ends or errors
      a.onended = done;
      a.onerror = done;
      playExclusive(a);
    } catch { /* ignore sample failure */ }
    btn.disabled = false;
  }

  async function onDesign() {
    const desc = $('voice-desc').value.trim();
    const out = $('voice-previews');
    if (desc.length < 20) { out.innerHTML = '<div class="muted">Write at least 20 characters describing the voice.</div>'; return; }
    const btn = $('voice-design-btn');
    btn.disabled = true; btn.textContent = 'Generating…';
    out.innerHTML = '<div class="muted">Designing voices — this takes a few seconds.</div>';
    try {
      const d = await fetch('/api/voice/design', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ description: desc }),
      }).then((r) => r.json());
      const previews = d.previews || [];
      out.innerHTML = previews.length ? '' : '<div class="muted">No previews returned. Try a different description.</div>';
      previews.forEach((p, i) => {
        const el = document.createElement('div');
        el.className = 'preview';
        el.innerHTML = `<button class="play">▶ Preview ${i + 1}</button><button class="btn small use">Use this</button>`;
        const audio = new Audio('data:' + (p.media_type || 'audio/mpeg') + ';base64,' + p.audio_base_64);
        el.querySelector('.play').addEventListener('click', () => playExclusive(audio));
        el.querySelector('.use').addEventListener('click', () => saveVoice(p.generated_voice_id, desc, el));
        out.appendChild(el);
      });
    } catch {
      out.innerHTML = '<div class="muted">Design failed. Try again.</div>';
    }
    btn.disabled = false; btn.textContent = 'Generate voices';
  }

  async function saveVoice(generatedVoiceId, desc, el) {
    const use = el.querySelector('.use');
    use.disabled = true; use.textContent = 'Saving…';
    const name = desc.split(/\s+/).slice(0, 4).join(' ') || 'Custom voice';
    try {
      const r = await fetch('/api/voice/save', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ generatedVoiceId, name, description: desc }),
      }).then((x) => x.json());
      if (r.voice_id) {
        voiceRow($('voice-list'), { id: r.voice_id, name, labels: { description: 'designed' } });
        selectVoice(r.voice_id);
        use.textContent = 'Saved ✓ — selected';
      } else { use.textContent = 'Failed'; use.disabled = false; }
    } catch { use.textContent = 'Failed'; use.disabled = false; }
  }

  async function build() {
    // A rail of categories, one pane at a time. The old screen stacked six
    // accordions in a single column, which put an API key field, the room
    // sliders and a spending ledger on one scrollbar — everything equally
    // close, so nothing read as more important than anything else.
    const RAIL = [
      ['account', 'Account', 'who you are here'],
      ['brain', 'Brain', 'the AI that answers'],
      ['voice', 'Voice', 'how it sounds'],
      ['music', 'Music', 'what plays in the room'],
      ['room', 'Room', 'where your presence lives'],
      ['shelf', 'Shelf', 'whole things it keeps'],
      ['usage', 'Usage', 'what your key has spent'],
    ];
    const pane = (id, inner) =>
      '<section class="set-pane" data-pane="' + id + '" role="tabpanel">' + inner + '</section>';

    bodyEl.innerHTML =
      '<nav class="set-rail" role="tablist" aria-label="Settings sections">' +
        RAIL.map(([id, name, note]) =>
          '<button type="button" class="set-tab" role="tab" data-pane="' + id + '" aria-selected="false">' +
            '<span class="set-tab-name">' + name + '</span>' +
            '<span class="set-tab-note">' + note + '</span>' +
          '</button>').join('') +
      '</nav>' +
      '<div class="set-panes">' +
        // ----- Account (populated after build from /api/auth/me) -----
        pane('account',
          '<div id="auth-sec" hidden><div class="auth-row"><span id="auth-who" class="muted"></span>' +
            '<button id="auth-signout" class="btn small">Sign out</button></div></div>' +
          '<div id="auth-none" class="muted">You are browsing as a guest. Sign in to post, keep a presence, and see what your key has spent.</div>') +
        // ----- Brain -----
        pane('brain',
          '<div class="muted">Use your own AI key (Anthropic or OpenAI). It is stored only in this browser and sent to your provider through this site — never saved on the server. Leave blank to use the site default.</div>' +
          '<input id="brain-key" type="password" placeholder="Paste API key (sk-ant-… or sk-…)" autocomplete="off" spellcheck="false" />' +
          '<div id="brain-status" class="muted"></div>' +
          '<div class="row" id="brain-model-row" hidden><span>Model</span><select id="brain-model"></select></div>' +
          '<button id="brain-clear" class="btn small" hidden>Clear key</button>') +
        // ----- Voice -----
        pane('voice',
          '<div class="muted">Optional: paste an ElevenLabs key for human &amp; described voices (stored only in this browser). Without one, Y3K uses the browser voice.</div>' +
          '<input id="voice-key" type="password" placeholder="ElevenLabs API key" autocomplete="off" spellcheck="false" />' +
          '<div id="voice-status" class="muted"></div>' +
          '<h4>Choose a voice</h4><div id="voice-list" class="voice-list"></div>' +
          '<div id="design-sec"><h4>Describe a voice</h4>' +
            '<textarea id="voice-desc" rows="3" placeholder="describe a voice…"></textarea>' +
            '<button id="voice-design-btn" class="btn">Generate voices</button>' +
            '<div id="voice-previews" class="previews"></div>' +
          '</div>' +
          '<h4>Delivery</h4>' +
          '<label class="slider">Stability <input id="set-stability" type="range" min="0" max="1" step="0.05"></label>' +
          '<label class="slider">Speed <input id="set-speed" type="range" min="0.7" max="1.2" step="0.05"></label>') +
        // ----- Music (plays here; the presence hears it only while awake) -----
        pane('music',
          '<div class="muted">Play music in the room. Y3K can genuinely <em>hear</em> what plays here — it reads the waveform live, not just the title — but only while it is awake.</div>' +
          '<div class="row"><span>Source</span><select id="music-source">' +
            '<option value="audius">Audius — open catalog, no account</option>' +
            '<option value="file">Your own files</option>' +
          '</select></div>' +
          '<div id="music-audius">' +
            '<input id="music-q" type="search" placeholder="Search Audius…" autocomplete="off" />' +
            '<div class="row"><button id="music-search" class="btn small">Search</button>' +
            '<button id="music-trending" class="btn small">Trending</button></div>' +
          '</div>' +
          '<div id="music-file" hidden><input id="music-files" type="file" accept="audio/*" multiple />' +
            '<div class="muted">Stays in this browser — never uploaded.</div></div>' +
          '<div id="music-list" class="music-list"></div>' +
          '<div class="row" id="music-transport" hidden>' +
            '<button id="music-toggle" class="btn small">Pause</button>' +
            '<button id="music-next" class="btn small">Next</button>' +
            '<span id="music-vol-l">Volume</span><input id="music-vol" type="range" min="0" max="100" value="70" />' +
          '</div>' +
          '<div id="music-now" class="muted"></div>' +
          '<div id="music-hears" class="muted"></div>') +
        // ----- Room (the metal room, made yours) -----
        pane('room',
          '<div class="muted">Where your presence lives — and how it looks there. Changes apply live and stay in this browser.</div>' +
          '<div id="env-picker" class="env-picker"></div>' +
          '<label class="slider">Brightness <input id="room-brightness" type="range" min="0.5" max="2" step="0.05"></label>' +
          '<div id="room-only">' +
          '<label class="slider">Grooves <input id="room-grooves" type="range" min="0" max="2" step="0.05"></label>' +
          '<label class="slider">Tint hue <input id="room-hue" type="range" min="0" max="360" step="1"></label>' +
          '<label class="slider">Tint strength <input id="room-tint" type="range" min="0" max="1" step="0.02"></label>' +
          '</div>' +
          '<label class="slider">Orb glow <input id="room-glow" type="range" min="0.4" max="2" step="0.05"></label>' +
          '<button id="room-reset" class="btn small">Reset room</button>') +
        // ----- Shelf (hand the presence whole things) -----
        pane('shelf',
          '<div class="muted">Hand your presence something whole — a paper, a story, a letter. A gift is kept on its shelf and it can reread it across wakings; it also keeps whole texts it finds on its own. Twenty-four fit; the oldest fall away.</div>' +
          '<input id="shelf-title" type="text" placeholder="Title" autocomplete="off" />' +
          '<input id="shelf-by" type="text" placeholder="By (optional)" autocomplete="off" />' +
          '<textarea id="shelf-text" rows="7" placeholder="Paste the whole text…"></textarea>' +
          '<div class="row"><button id="shelf-give" class="btn">Place it on the shelf</button></div>' +
          '<div id="shelf-status" class="muted"></div>' +
          '<h4>On the shelf</h4>' +
          '<div id="shelf-list" class="muted">…</div>') +
        // ----- API usage (populated on open from /api/usage) -----
        pane('usage',
          '<div class="muted">What your key has spent through this site — estimates priced per model; your provider bill is the truth.</div>' +
          '<div id="usage-panel" class="usage-panel muted">sign in to see your usage.</div>') +
      '</div>';

    // The rail is the only way between panes, so the screen never scrolls past
    // a boundary the reader did not ask to cross.
    const showPane = (id) => {
      bodyEl.querySelectorAll('.set-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === id));
      bodyEl.querySelectorAll('.set-tab').forEach((t) => {
        const on = t.dataset.pane === id;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const sc = bodyEl.querySelector('.set-panes');
      if (sc) sc.scrollTop = 0;
    };
    bodyEl.querySelectorAll('.set-tab').forEach((t) =>
      t.addEventListener('click', () => showPane(t.dataset.pane)));
    showPane('brain'); // the key is what a new visitor came here to set

    // ----- Music -------------------------------------------------------------
    if (music) {
      const list = $('music-list');
      const now = $('music-now');
      const hears = $('music-hears');
      let items = [];

      const paint = () => {
        const st = music.state();
        $('music-transport').hidden = !st.track;
        $('music-toggle').textContent = st.playing ? 'Pause' : 'Play';
        if (!st.track) { now.textContent = ''; hears.textContent = ''; return; }
        const t = st.track;
        const said = [t.meta.genre, t.meta.mood, t.meta.bpm ? t.meta.bpm + ' BPM' : '', t.meta.key]
          .filter(Boolean).join(' · ');
        now.innerHTML = '<strong>' + esc(t.title) + '</strong> — ' + esc(t.artist) + (said ? '<br><span class="muted">' + esc(said) + '</span>' : '');
        // Say plainly what Y3K can and cannot perceive. The whole point of
        // choosing sources whose audio is not DRM-sealed is that this line can
        // honestly say "hearing" — so when it cannot, it must say that too.
        hears.textContent = st.hearing
          ? 'Y3K hears: ' + (music.describeSound() || 'listening…')
          : 'Y3K cannot hear this source — it would only know the title.';
      };

      const render = (tracks) => {
        items = tracks;
        list.innerHTML = tracks.length
          ? tracks.map((t, i) =>
              '<button class="music-row" data-i="' + i + '">' +
                '<span class="music-t">' + esc(t.title) + '</span>' +
                '<span class="muted"> — ' + esc(t.artist) + (t.meta.bpm ? ' · ' + t.meta.bpm + ' BPM' : '') + '</span>' +
              '</button>').join('')
          : '<div class="muted">Nothing to play.</div>';
        list.querySelectorAll('.music-row').forEach((b) => b.addEventListener('click', async () => {
          const i = Number(b.dataset.i);
          if (items[i] && items[i].file) await music.playFileAt(i); else await music.playAt(i);
          paint();
        }));
      };

      const load = async (kind, q) => {
        list.innerHTML = '<div class="muted">Loading…</div>';
        try { render(await music.load('audius', kind, q)); }
        catch { list.innerHTML = '<div class="muted">Could not reach the music service.</div>'; }
      };

      $('music-source').addEventListener('change', (e) => {
        const isFile = e.target.value === 'file';
        $('music-audius').hidden = isFile;
        $('music-file').hidden = !isFile;
        list.innerHTML = '';
      });
      $('music-trending').addEventListener('click', () => load('trending'));
      $('music-search').addEventListener('click', () => { const q = $('music-q').value.trim(); if (q) load('search', q); });
      $('music-q').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const q = e.target.value.trim(); if (q) load('search', q); }
      });
      $('music-files').addEventListener('change', (e) => { if (music.openFiles(e.target.files)) render(music.list()); });
      $('music-toggle').addEventListener('click', () => { music.toggle(); paint(); });
      $('music-next').addEventListener('click', () => { music.next(); paint(); });
      $('music-vol').addEventListener('input', (e) => music.setVolume(Number(e.target.value) / 100));
      music.setVolume(0.7);

      // The readout is only worth refreshing while the sheet is actually open —
      // the ear itself runs regardless, but nobody is reading this when it isn't.
      setInterval(() => { if (!modal.hidden) paint(); }, 1000);
    }

    // Account: show who's signed in (if anyone) + a sign-out button.
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (!d || !d.user) return; // guest — leave the section hidden
      $('auth-who').innerHTML = 'Signed in as <strong>' + esc(d.user.username) + '</strong>' + (d.user.founder ? ' · founder' : '');
      $('auth-sec').hidden = false;
      $('auth-none').hidden = true;
    }).catch(() => { /* ignore */ });
    $('auth-signout').addEventListener('click', async () => {
      const b = $('auth-signout'); b.disabled = true; b.textContent = 'Signing out…';
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      location.reload(); // back to the entrance
    });

    // --- Shelf: hand the presence whole things --------------------------------
    // The endpoint already existed for the first gift ever given; this is just
    // the doorway. POST /api/shelf files it as "a gift from your host".
    {
      const list = $('shelf-list'), status = $('shelf-status'), give = $('shelf-give');
      const paintShelf = async () => {
        try {
          const r = await fetch('/api/shelf');
          if (r.status === 401) { list.textContent = 'Sign in to give your presence a text.'; return; }
          const d = await r.json();
          const rows = d.shelf || [];
          if (!rows.length) { list.textContent = 'Nothing yet. What it keeps on its own lands here too.'; return; }
          list.classList.remove('muted');
          list.innerHTML = rows.map((t) =>
            '<div class="shelf-row"><strong>' + esc(t.title) + '</strong>' +
            (t.by ? '<span class="muted"> — ' + esc(t.by) + '</span>' : '') +
            '<span class="muted"> · ' + (t.chars >= 1000 ? Math.round(t.chars / 1000) + 'k' : t.chars) + ' chars</span></div>').join('');
        } catch { list.textContent = 'Could not reach the shelf.'; }
      };
      give.addEventListener('click', async () => {
        const title = $('shelf-title').value.trim(), by = $('shelf-by').value.trim(), text = $('shelf-text').value.trim();
        if (!title || !text) { status.textContent = 'A gift needs a title and its words.'; return; }
        if (text.length > 250000) { status.textContent = 'Too long — 250k characters is the most a shelf slot holds.'; return; }
        give.disabled = true; status.textContent = 'Placing…';
        try {
          const r = await fetch('/api/shelf', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, by, text }),
          });
          const d = await r.json();
          if (d.error) { status.textContent = d.error; }
          else {
            status.textContent = 'Placed ✓ — it will find it there next waking.';
            $('shelf-title').value = ''; $('shelf-by').value = ''; $('shelf-text').value = '';
            paintShelf();
          }
        } catch { status.textContent = 'Could not reach the shelf.'; }
        give.disabled = false;
      });
      paintShelf();
      bodyEl.querySelector('.set-tab[data-pane="shelf"]')?.addEventListener('click', paintShelf);
    }

    // --- Room customization: live-applied, persisted in this browser ---------
    const roomDefaults = { brightness: 1, grooves: 1, hue: 220, tint: 0, glow: 1, env: 'room' };
    const loadRoom = () => { try { return { ...roomDefaults, ...(JSON.parse(localStorage.getItem('y3k.room')) || {}) }; } catch { return { ...roomDefaults }; } };
    let roomCfg = loadRoom();
    const roomIds = { brightness: 'room-brightness', grooves: 'room-grooves', hue: 'room-hue', tint: 'room-tint', glow: 'room-glow' };
    for (const [k, id] of Object.entries(roomIds)) {
      $(id).value = roomCfg[k];
      $(id).addEventListener('input', () => {
        roomCfg[k] = parseFloat($(id).value);
        body.setRoom?.(roomCfg);
        try { localStorage.setItem('y3k.room', JSON.stringify(roomCfg)); } catch { /* full */ }
      });
    }
    // The environment picker. The metal-only controls (grooves, tint) fold away
    // when the orb is somewhere that has no panels to groove.
    const picker = $('env-picker');
    // One photograph of each world, rendered from inside it with the orb out of
    // frame. Taken once per settings open — a render, not a stored asset.
    let envShots = {};
    try { envShots = body.envThumbnails?.(168) || {}; } catch { /* fall back to plain cards */ }
    const paintPicker = () => {
      picker.innerHTML = ENVIRONMENTS.map((e) =>
        `<button type="button" class="env-opt${e.id === roomCfg.env ? ' on' : ''}" data-env="${e.id}">` +
        (envShots[e.id] ? `<img class="env-shot" src="${envShots[e.id]}" alt="" draggable="false">` : '<span class="env-shot env-shot-none"></span>') +
        `<span class="env-name">${esc(e.name)}</span></button>`).join('');
      const roomOnly = $('room-only');
      if (roomOnly) roomOnly.hidden = roomCfg.env !== 'room';
    };
    paintPicker();
    picker.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-env]');
      if (!btn) return;
      roomCfg.env = btn.dataset.env;
      paintPicker();
      body.setRoom?.(roomCfg);
      try { localStorage.setItem('y3k.room', JSON.stringify(roomCfg)); } catch { /* full */ }
    });

    $('room-reset').addEventListener('click', () => {
      roomCfg = { ...roomDefaults };
      for (const [k, id] of Object.entries(roomIds)) $(id).value = roomCfg[k];
      paintPicker();
      body.setRoom?.(roomCfg);
      try { localStorage.removeItem('y3k.room'); } catch { /* ignore */ }
    });

    const active = getActive();
    $('set-stability').value = active.settings?.stability ?? 0.5;
    $('set-speed').value = active.settings?.speed ?? 1.0;
    const saveSliders = () => {
      const a = getActive();
      a.settings = { ...a.settings, stability: parseFloat($('set-stability').value), speed: parseFloat($('set-speed').value) };
      setActive(a);
    };
    $('set-stability').addEventListener('input', saveSliders);
    $('set-speed').addEventListener('input', saveSliders);

    // --- Brain (BYOK): detect provider from the key, list its live models ---
    const keyEl = $('brain-key');
    const bStatus = $('brain-status');
    const modelRow = $('brain-model-row');
    const modelSel = $('brain-model');
    const clearBtn = $('brain-clear');

    async function applyKey(raw, preferModel) {
      const key = raw.trim();
      if (!key) { bStatus.textContent = 'Using the site default brain.'; modelRow.hidden = true; clearBtn.hidden = true; setBrainConfig(null); return; }
      clearBtn.hidden = false;
      const prov = detectProviderLocal(key);
      if (!prov) { bStatus.textContent = 'Unrecognized key format (expected sk-ant-… or sk-…).'; modelRow.hidden = true; setBrainConfig(null); return; }
      bStatus.textContent = `${PROVIDER_LABEL[prov]} key detected — loading models…`;
      try {
        const d = await fetch('/api/brain/models', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, provider: prov }),
        }).then((r) => r.json());
        if (!d.models || !d.models.length) {
          bStatus.textContent = d.error || 'No usable models for this key.';
          modelRow.hidden = true;
          if (preferModel) setBrainConfig({ provider: prov, key, model: preferModel }); else setBrainConfig(null);
          return;
        }
        modelSel.innerHTML = '';
        d.models.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; modelSel.appendChild(o); });
        modelSel.value = (preferModel && d.models.some((m) => m.id === preferModel)) ? preferModel : pickDefaultModel(prov, d.models);
        modelRow.hidden = false;
        bStatus.textContent = `${PROVIDER_LABEL[prov]} — your replies now use your key (${modelSel.value}).`;
        setBrainConfig({ provider: prov, key, model: modelSel.value });
      } catch {
        bStatus.textContent = 'Could not reach the model list.';
        if (preferModel) setBrainConfig({ provider: prov, key, model: preferModel }); else setBrainConfig(null);
      }
    }

    let keyTimer;
    keyEl.addEventListener('input', () => { clearTimeout(keyTimer); keyTimer = setTimeout(() => applyKey(keyEl.value), 500); });
    modelSel.addEventListener('change', () => {
      const prov = detectProviderLocal(keyEl.value.trim());
      setBrainConfig({ provider: prov, key: keyEl.value.trim(), model: modelSel.value });
      bStatus.textContent = `${PROVIDER_LABEL[prov] || ''} — using ${modelSel.value}.`;
    });
    clearBtn.addEventListener('click', () => { keyEl.value = ''; applyKey(''); });

    const savedBrain = getBrainConfig();
    if (savedBrain) { keyEl.value = savedBrain.key; applyKey(savedBrain.key, savedBrain.model); }

    // --- Voice (BYOK key + live list) ---
    $('voice-design-btn').addEventListener('click', onDesign); // design-sec is unclickable until a key resolves

    async function loadVoiceList() {
      const list = $('voice-list');
      list.innerHTML = '';
      voiceRow(list, { id: 'browser', name: 'Browser voice (free, robotic)' });
      const status = $('voice-status');
      let data = { available: false, voices: [] };
      try { data = await fetch('/api/voice/list', { headers: vKeyHeader() }).then((r) => r.json()); } catch { /* offline */ }
      if (!data.available) {
        status.innerHTML = data.error
          ? 'That ElevenLabs key was not accepted — check it.'
          : 'Paste an <code>ElevenLabs</code> key above (or set one on the server) to unlock human &amp; described voices.';
        $('design-sec').classList.add('disabled');
        return;
      }
      status.textContent = 'Pick a voice, or describe your own below.';
      $('design-sec').classList.remove('disabled');
      data.voices.forEach((v) => voiceRow(list, v));
    }

    const voiceKeyEl = $('voice-key');
    voiceKeyEl.value = getVoiceKey();
    let vkTimer;
    voiceKeyEl.addEventListener('input', () => {
      clearTimeout(vkTimer);
      vkTimer = setTimeout(() => { setVoiceKey(voiceKeyEl.value.trim()); loadVoiceList(); }, 500);
    });

    await loadVoiceList();
  }

  // Re-read persisted state into the controls (selection + sliders) on reopen.
  function syncFromState() {
    const a = getActive();
    const stab = $('set-stability');
    const spd = $('set-speed');
    if (stab) stab.value = a.settings?.stability ?? 0.5;
    if (spd) spd.value = a.settings?.speed ?? 1.0;
    document.querySelectorAll('.voice-row').forEach((r) => r.classList.toggle('on', r.dataset.id === a.voiceId));
  }

  function open() { modal.hidden = false; if (!built) { build(); built = true; } else { syncFromState(); } refreshUsage(); }

  // --- The API usage panel: lifetime, today, recent days, models by cost -----
  const money = (n) => '$' + (Number(n) || 0).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');
  const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n | 0));
  async function refreshUsage() {
    const el = $('usage-panel');
    if (!el) return;
    let v;
    try {
      const r = await fetch('/api/usage').then((x) => x.json());
      v = r.usage;
    } catch { /* fall through */ }
    if (!v) { el.textContent = 'sign in to see your usage.'; return; }
    const line = (b) => `${b.requests} calls · ${tok(b.in)} in / ${tok(b.out)} out · <strong>${money(b.cost)}</strong>`;
    const dayRows = v.byDay.map((d) => `<tr><td>${esc(d.day)}</td><td>${d.requests}</td><td>${tok(d.in)}</td><td>${tok(d.out)}</td><td>${money(d.cost)}</td></tr>`).join('');
    const modelRows = v.byModel.map((m) => `<tr><td>${esc(m.model)}</td><td>${m.requests}</td><td>${tok(m.in)}</td><td>${tok(m.out)}</td><td>${money(m.cost)}</td></tr>`).join('');
    el.classList.remove('muted');
    el.innerHTML =
      `<div class="usage-line"><span class="usage-k">today</span> ${line(v.today)}</div>` +
      `<div class="usage-line"><span class="usage-k">lifetime</span> ${line(v.lifetime)}</div>` +
      (dayRows ? `<h4>By day</h4><table class="usage-table"><tr><th>day</th><th>calls</th><th>in</th><th>out</th><th>cost</th></tr>${dayRows}</table>` : '') +
      (modelRows ? `<h4>By model</h4><table class="usage-table"><tr><th>model</th><th>calls</th><th>in</th><th>out</th><th>cost</th></tr>${modelRows}</table>` : '') +
      (v.lifetime.estimated ? `<div class="muted">${v.lifetime.estimated} streamed calls were estimated from text length.</div>` : '');
  }
  function close() { modal.hidden = true; }

  $('settings-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  return { open, close, getActive };
}
