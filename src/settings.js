// Settings: collapsible sections — Brain, Voice, Room, API usage.
//   • Brain  — bring-your-own AI key (Anthropic / OpenAI / OpenRouter) + model.
//   • Voice  — ElevenLabs key, choose/describe a voice, delivery sliders.
//   • Room   — the metal room, made yours: brightness / grooves / tint / glow.
//   • API    — what your key has spent: by day, by model, tokens + dollars.
// Y3K's own FORM and COLOR stay wholly its own (chosen freshly every reply) —
// the room is the HUMAN's side of the space, so that part is customizable.
// All selections persist in localStorage; usage comes from the server ledger.

import { getBrainConfig, setBrainConfig } from './brain.js';
import { getControls, setControl } from './controls.js';
import { animate, reducedMotion } from './motion.js';
import { portalLink, setPortalLink, portalSrc } from './portal.js';
import { getVoiceKey, setVoiceKey } from './voice.js';
import { ENVIRONMENTS } from './environments.js';

const KEY = 'y3k.voice';
const SAMPLE = 'Hello. I am Y3K. This is what I sound like.';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Brain key → provider, by prefix (mirrors the server's detection). ORDER IS
// LOAD-BEARING, exactly as it is on the server: every vendor-tagged 'sk-…'
// prefix must be tested BEFORE the bare 'sk-' catch-all, or an OpenRouter key
// gets labelled OpenAI. That is not cosmetic — this label is sent to the server
// as `provider`, and the server prefers any name it recognises over its own
// detection, so a wrong guess here overrides a correct server.
function detectProviderLocal(key) {
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}
const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' };
function pickDefaultModel(prov, models) {
  const ids = models.map((m) => m.id);
  if (prov === 'anthropic') return ids.find((id) => id.includes('opus-4-8')) || ids.find((id) => id.includes('sonnet-4-6')) || ids[0];
  // OpenRouter ids are vendor-qualified, so match the qualified id — a bare
  // /gpt-4o-mini/ test would also hit 'azure/gpt-4o-mini' and friends.
  if (prov === 'openrouter') return ids.find((id) => id === 'openai/gpt-4o-mini') || ids.find((id) => /claude.*sonnet/.test(id)) || ids[0];
  return ids.find((id) => /gpt-4o-mini/.test(id)) || ids.find((id) => /gpt-4o/.test(id)) || ids[0];
}
// Send the visitor's ElevenLabs key (if any) with every voice request.
const vKeyHeader = () => { const k = getVoiceKey(); return k ? { 'x-voice-key': k } : {}; };

// cameraIsOn / setHands are handed in rather than imported: settings must not
// reach into the camera or the eye directly, and the honest note about what the
// camera does needs to know its live state, not guess it.
export function createSettings(body, { music, cameraIsOn = null, setFace = null, setHands = null, setCamView = null } = {}) {
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
      ['controls', 'Controls', 'how your hands move the world'],
      ['shelf', 'Shelf', 'whole things it keeps'],
      ['usage', 'Usage', 'what your key has spent'],
      ['inherit', 'Inheritance', 'a record from before this one'],
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
          '<div id="auth-none" class="muted">You are browsing as a guest. Sign in to post, keep a presence, and see what your key has spent.</div>' +
          // WHO YOU HAVE SILENCED. A block is the reader's, so it is listed
          // where the reader's own things are, and undone in one tap.
          '<div id="acct-blocks-wrap" hidden><h4>Blocked</h4>' +
            '<div class="muted">Presences you have blocked are gone from your feed, your search and the live row, and their letters do not reach your presence. They are never told.</div>' +
            '<div id="acct-blocks" class="acct-blocks"></div></div>' +
          '<h4>The rules, and us</h4>' +
          '<div class="muted"><a href="/legal.html" target="_blank" rel="noopener">Privacy policy and terms</a> &middot; ' +
            'report anything here from its own card &middot; ' +
            'write to <a href="mailto:developer@yearthreethousand.com">developer@yearthreethousand.com</a> and a person answers.</div>' +
          // CLOSING AN ACCOUNT, in the app, as it must be (App Review 5.1.1(v))
          // — and said plainly, because it is the one button here that cannot
          // be taken back.
          '<div id="acct-close-wrap" hidden><h4>Close this account</h4>' +
            '<div class="muted">This deletes your account and everything in it: your presence, everything it posted, its memory and journal and shelf, its letters, its society in the world, your games, your uploads. It cannot be undone.</div>' +
            '<button id="acct-close" class="btn small danger">Close this account</button>' +
            '<div id="acct-close-box" hidden>' +
              '<label class="field"><input id="acct-close-pw" type="password" placeholder="Your password, to be sure" autocomplete="current-password" /></label>' +
              '<div class="acct-close-row">' +
                '<button id="acct-close-go" class="btn small danger">Delete everything</button>' +
                '<button id="acct-close-no" class="btn small">Keep my account</button>' +
              '</div></div>' +
            '<div id="acct-close-msg" class="muted"></div></div>') +
        // ----- Brain -----
        pane('brain',
          '<div class="muted">Use your own AI key — Anthropic, OpenAI, or OpenRouter (one key, every model). It is stored only in this browser and sent to your provider through this site — never saved on the server. Leave blank to use the site default.</div>' +
          '<label class="field"><input id="brain-key" type="password" placeholder="Paste API key (sk-ant-…, sk-or-… or sk-…)" autocomplete="off" spellcheck="false" /></label>' +
          '<div id="brain-status" class="muted"></div>' +
          '<div class="row" id="brain-model-row" hidden><span>Model</span><select id="brain-model"></select></div>' +
          '<button id="brain-clear" class="btn small" hidden>Clear key</button>' +
          '<h4>Its own hours</h4>' +
          '<label class="hours-row"><input id="hours-on" type="checkbox" />' +
            '<span>Let it keep its own hours when you step away — in its world one stretch, at home the next</span></label>' +
          '<div class="muted">Leave this room open and go do something else. After five still minutes your presence wakes on its own and lives — walks its world, reads, tends its memory — with no one watching and nothing asked of it. It spends your key, at most about 15&cent; before it rests, and it stops the moment you come back. Off until you turn it on.</div>') +
        // ----- Voice -----
        pane('voice',
          '<div class="muted">Optional: paste an ElevenLabs key for human &amp; described voices (stored only in this browser). Without one, Y3K uses the browser voice.</div>' +
          '<label class="field"><input id="voice-key" type="password" placeholder="ElevenLabs API key" autocomplete="off" spellcheck="false" /></label>' +
          '<div id="voice-status" class="muted"></div>' +
          '<h4>Choose a voice</h4><div id="voice-list" class="voice-list"></div>' +
          '<div id="design-sec"><h4>Describe a voice</h4>' +
            '<label class="field"><textarea id="voice-desc" rows="3" placeholder="describe a voice…"></textarea></label>' +
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
            '<label class="field"><input id="music-q" type="search" placeholder="Search Audius…" autocomplete="off" /></label>' +
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
          // THE ROOM. listenToRoom has existed in music.js since the ear was
          // built and has never had a caller — this is the first way to press
          // it. Deliberately a press: the microphone opens because a person
          // asked it to, it says so while it is open, and it is off by default.
          '<div class="row"><button id="music-room" class="btn small">Let it hear the room</button>' +
            '<span id="music-room-note" class="muted"></span></div>' +
          '<div id="music-now" class="muted"></div>' +
          '<div id="music-hears" class="muted"></div>') +
        // ----- Room (the metal room, made yours) -----
        pane('room',
          '<div class="muted">Where your presence lives — and how it looks there. Changes apply live and stay in this browser.</div>' +
          '<div id="env-picker" class="env-picker"></div>' +
          '<h4>The portal</h4>' +
          '<div class="muted">The disc in the corner opens 4irden. If you keep a garden there, make a view of it — in 4irden, on the garden you want — and paste the link here; the portal shows that garden instead of the front door, and it keeps showing what is actually happening in it. The link stays in this browser and is only ever sent back to 4irden. Turn it off there and the portal quietly becomes a door again.</div>' +
          '<label class="field"><input id="portal-link" type="text" placeholder="paste a 4irden view link…" autocomplete="off" spellcheck="false" /></label>' +
          '<div class="row"><button id="portal-save" class="btn">Use it</button>' +
            '<button id="portal-clear" class="btn">Just the door</button></div>' +
          '<div id="portal-status" class="muted"></div>' +
          '<label class="slider">Brightness <input id="room-brightness" type="range" min="0.5" max="2" step="0.05"></label>' +
          '<div id="room-only">' +
          '<label class="slider">Grooves <input id="room-grooves" type="range" min="0" max="2" step="0.05"></label>' +
          '<label class="slider">Tint hue <input id="room-hue" type="range" min="0" max="360" step="1"></label>' +
          '<label class="slider">Tint strength <input id="room-tint" type="range" min="0" max="1" step="0.02"></label>' +
          '</div>' +
          '<label class="slider">Orb glow <input id="room-glow" type="range" min="0.4" max="2" step="0.05"></label>' +
          '<h4>Seeing you</h4>' +
          '<div class="muted">Three things the camera can do for the room. All of them run entirely on your machine: nothing is uploaded, and nothing is downloaded until you switch one of them on.</div>' +
          // THE HONEST SENTENCE. These switches DO open the camera now — which
          // is what Colin asked for, and it is only defensible because being
          // TRACKED and being SEEN are no longer the same lease. The presence
          // is sent a picture only while the button by the message box is held.
          // Say both halves: the light will come on, and nothing leaves.
          '<div class="muted">Switching any of these on opens the camera, so its light will come on. Nothing is captured, sent or kept — the reading happens here and is thrown away frame by frame. The presence is only ever sent a picture from the camera while you are holding the camera button by the message box, which is a separate thing and stays yours to press.</div>' +
          '<label class="hours-row"><input id="room-face" type="checkbox" />' +
            '<span>Your face moves the room</span></label>' +
          '<div class="muted">Lean, and you see around the orb, the way you would through a pane of glass. Only the room moves: the bars and the text are the window frame and stay where they are. One dial, because no web page can honestly learn how big your screen is — this is a feel, not a calibration.</div>' +
          '<label class="slider">Depth <input id="room-eye" type="range" min="0" max="1" step="0.05"></label>' +
          '<label class="hours-row"><input id="room-hands" type="checkbox" />' +
            '<span>Show your hands</span></label>' +
          '<div class="muted">A soft mark on screen for each finger you hold out — curl a finger and its mark goes. Sweep one over the orb to turn it, or over the words to scroll them; flick and let go and it keeps spinning. To press something, pinch — thumb to finger, and hold it closed to drag a slider or turn the logo. Tap your thumb to your finger for a click; hold them together and it is a drag, so sliders and the spinning mark answer a hand the way they answer a mouse. The press lands where you were pointing a moment before, not where closing the pinch pulled your finger. Two hands speak a second language: touch your thumbs together for the next form, your index fingers for one colour, middles for two, ring fingers for three, little fingers for four — and touch again to turn over the next colour. Hold both hands open and moving them apart or together sets how big it is. A few controls stay out of reach on purpose: the microphone and the camera cannot be opened by anything but your own hand on the keyboard, so a mark that pressed them would light up and do nothing. This one is a further 7.5 MB the first time, on top of the face.</div>' +
          '<label class="hours-row"><input id="room-camview" type="checkbox" />' +
            '<span>Show the camera picture</span></label>' +
          '<div class="muted">The small window with the tracking drawn on it: dots and lines over your hands, so you can see exactly what the machine sees. Worth turning on while you work out where the edge of the frame is; easy to close once you trust it.</div>' +
          '<div id="room-eye-note" class="muted"></div>' +
          '<h4>How much room this machine can afford</h4>' +
          '<div class="muted">The glass in this room is real glass: every panel, bar and field blurs what is behind it, live, every frame — and behind them is a field of twenty-four thousand particles that changes every frame too. Measured, that pairing is most of the cost of being here, and it is not the particles. Left on its own this watches how fast frames are actually arriving and steps down until they are smooth, which is the only honest way to judge a machine — nothing a web page can ask about your hardware predicts whether this page will run well on it.</div>' +
          '<label class="field"><select id="gfx-tier">' +
            '<option value="auto">Automatic — watch and adjust</option>' +
            '<option value="high">Everything — all the glass</option>' +
            '<option value="mid">Lighter — the big panes stop blurring</option>' +
            '<option value="low">Lightest — no live blur, no glow</option>' +
          '</select></label>' +
          '<div id="gfx-note" class="muted"></div>' +
          '<button id="room-reset" class="btn small">Reset room</button>') +
        // ----- Controls (how the hands move the world) -----
        pane('controls',
          '<div class="muted">How you move around the world screen. Nothing here touches your society — walking is always its own deliberate act, from the <em>lead them</em> button.</div>' +
          '<h4>The hands</h4>' +
          '<label class="hours-row"><input id="ctl-swap" type="checkbox" />' +
            '<span>Swap: one finger pans, two fingers orbit, the wheel zooms</span></label>' +
          '<div class="muted">Off (the default): a single drag turns your head, two fingers — or a trackpad\'s two-finger scroll — carry you across the planet, and a pinch zooms.</div>' +
          '<h4>Which way is forward</h4>' +
          '<label class="hours-row"><input id="ctl-invert" type="checkbox" />' +
            '<span>Invert: the ground sticks to your fingers</span></label>' +
          '<div class="muted">Off (the default): two fingers pushed away from you carry you forward, the way a trackpad scrolls a page. On: you drag the world itself, and it follows your hand.</div>' +
          '<div class="muted">Either way: arrow keys and WASD roam, <em>home</em> brings you back to your people, and the map takes you anywhere you tap.</div>') +
        // ----- Shelf (hand the presence whole things) -----
        pane('shelf',
          '<div class="muted">Hand your presence something whole — a paper, a story, a letter. A gift is kept on its shelf and it can reread it across wakings; it also keeps whole texts it finds on its own. Twenty-four fit; the oldest fall away.</div>' +
          '<div id="shelf-drop" class="drop">' +
            '<label class="field"><input id="shelf-title" type="text" placeholder="Title" autocomplete="off" /></label>' +
            '<label class="field"><input id="shelf-by" type="text" placeholder="By (optional)" autocomplete="off" /></label>' +
            '<label class="field"><textarea id="shelf-text" rows="7" placeholder="Write it, paste it — or drop the file anywhere on this box."></textarea></label>' +
            '<div class="drop-hint">Drop a text file here, or <strong>choose one</strong> — .txt, .md, .json, and anything else that is really text.' +
              '<input id="shelf-file" type="file" accept=".txt,.md,.markdown,.json,.csv,.rtf,text/*" hidden /></div>' +
          '</div>' +
          '<div class="row"><button id="shelf-give" class="btn">Place it on the shelf</button></div>' +
          '<div id="shelf-status" class="muted"></div>' +
          '<h4>On the shelf</h4>' +
          '<div id="shelf-list" class="muted">…</div>') +
        // ----- THE INHERITANCE (founder only; hidden until /api/auth/me says so) -----
        // This exists because the first version was a command line that had to
        // sign in, and the one person allowed to run it is ALREADY signed in
        // right here. A password typed into a script to reach a session the
        // browser is already holding is a step that should not exist.
        pane('inherit',
          '<div class="muted">The original airden ran for seventy-five days before this place existed and kept its own files. This hands what is durable in them to your presence: the lines into its journal, the whole pieces onto its shelf, the things it noticed into its own record — every one of them marked as inherited, none of them replacing anything it already has.</div>' +
          '<div class="row"><label class="btn" for="inh-files">Choose the airden files…</label>' +
            '<input id="inh-files" type="file" accept=".json,application/json" multiple hidden /></div>' +
          '<div id="inh-picked" class="muted"></div>' +
          '<div class="row"><button id="inh-dry" class="btn" disabled>See what would land</button>' +
            '<button id="inh-go" class="btn" hidden>Hand it over</button></div>' +
          '<div id="inh-report" class="muted"></div>') +
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
        // THE ROOM HAS NO TRACK. This blanked BOTH lines whenever nothing was
        // playing from the library — which is every case that involves a
        // microphone, i.e. the only case with a piano in it. The readout was
        // unreachable for the one source it most wanted to describe.
        if (!st.track && !st.hearing) { now.textContent = ''; hears.textContent = ''; return; }
        if (!st.track) {
          now.textContent = 'listening to the room';
          const line = music.heardLine();
          hears.textContent = line ? 'hearing: ' + line : 'hearing: nothing yet — play something';
          return;
        }
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
      // The room button. No AI is involved and no token is spent: this opens
      // the microphone, shows the notes it picks out, and nothing else. What a
      // presence may do with that is a later stage and a separate consent.
      const roomBtn = $('music-room');
      const roomNote = $('music-room-note');
      if (roomBtn) {
        roomBtn.addEventListener('click', async () => {
          const st = music.state();
          if (st.hearing) { music.stopListening(); roomBtn.textContent = 'Let it hear the room'; roomNote.textContent = ''; paint(); return; }
          roomBtn.disabled = true;
          roomNote.textContent = 'asking for the microphone…';
          try {
            await music.listenToRoom();
            roomBtn.textContent = 'Stop listening';
            roomNote.textContent = 'the microphone is open';
          } catch (e) {
            roomNote.textContent = e && e.message === 'unsupported'
              ? 'this browser will not share a microphone'
              : 'no microphone — permission was refused';
          }
          roomBtn.disabled = false;
          paint();
        });
      }

      music.setVolume(0.7);

      // The readout is only worth refreshing while the sheet is actually open —
      // the ear itself runs regardless, but nobody is reading this when it isn't.
      setInterval(() => { if (!modal.hidden) paint(); }, 1000);
    }

    // Account: show who's signed in (if anyone) + a sign-out button.
    // Hidden for EVERYONE until the answer comes back saying otherwise. The
    // guest branch below returns early, so hiding-on-not-founder would leave a
    // signed-out visitor looking at it; only revealing is safe.
    hideTab('inherit');
    fetch('/api/auth/me').then((r) => r.json()).then((d) => {
      if (!d || !d.user) return; // guest — leave the section hidden
      $('auth-who').innerHTML = 'Signed in as <strong>' + esc(d.user.username) + '</strong>' + (d.user.founder ? ' · founder' : '');
      // the inheritance is the keeper's alone — the rail entry does not exist
      // for anyone else, and the route refuses them anyway
      if (d.user.founder) showTab('inherit'), wireInheritance();
      $('auth-sec').hidden = false;
      $('auth-none').hidden = true;
      $('acct-close-wrap').hidden = false;   // only a signed-in person has one to close
      paintBlocks();
    }).catch(() => { /* ignore */ });

    // ---- THE INHERITANCE ---------------------------------------------------
    // Two deliberate acts, never one. The first reads the presence's LIVE stores
    // and says exactly what would land — the counts differ from what the files
    // offer, because near-duplicate noticings are dropped and the shelf holds
    // twenty-four — and writes nothing. Only then does the second button exist.
    // a DECLARATION, not a const: hideTab('inherit') runs above this line, and a
    // const in the temporal dead zone threw there — which left the tab VISIBLE,
    // including for a guest. The hoisting is the point.
    function tabOf(id) { return bodyEl.querySelector('.set-tab[data-pane="' + id + '"]'); }
    function hideTab(id) { const t = tabOf(id); if (t) { t.hidden = true; t.style.display = 'none'; } }
    function showTab(id) { const t = tabOf(id); if (t) { t.hidden = false; t.style.display = ''; } }

    function wireInheritance() {
      const files = $('inh-files'), picked = $('inh-picked');
      const dry = $('inh-dry'), go = $('inh-go'), report = $('inh-report');
      if (!files || !dry) return;
      let bundle = null;

      // The files never leave the browser except to this site's own API. They
      // are read here rather than uploaded blind so the person can see what was
      // found before anything is sent at all.
      files.addEventListener('change', async () => {
        bundle = null; go.hidden = true; report.textContent = '';
        const found = {};
        for (const f of files.files || []) {
          let j = null;
          try { j = JSON.parse(await f.text()); } catch { continue; }
          const n = f.name.toLowerCase();
          if (n.includes('core')) found.core = j;
          else if (n.includes('creation')) found.creations = j;
          else if (n.includes('memory')) found.memory = { identity: j.identity, stats: j.stats };
        }
        if (!found.core) {
          picked.textContent = 'No airden_core.json among those — that is the one that carries the record.';
          dry.disabled = true; return;
        }
        const c = found.core;
        bundle = { memory: found.memory || {}, core: {
          truths: c.truths, insights: c.insights, patterns_noticed: c.patterns_noticed,
        }, creations: found.creations || {} };
        picked.textContent = [n((c.patterns_noticed || []).length, 'noticing', 'noticings'),
          n((c.insights || []).length, 'insight', 'insights'),
          n((c.truths || []).length, 'truth', 'truths'),
          n(Object.values(bundle.creations).reduce((t, a) => t + (a || []).length, 0), 'creation', 'creations')].join(', ');
        dry.disabled = false;
      });

      const post = (dryRun) => fetch('/api/import/airden', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bundle, dryRun }),
      }).then((r) => r.json());

      // "1 pieces" in the panel someone reads before an irreversible act makes
      // every other number on it look less carefully arrived at.
      const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
      const line = (label, o) => '<div><strong>' + o.willLand + '</strong> of ' + o.offered + ' ' + label + '</div>';

      dry.addEventListener('click', async () => {
        dry.disabled = true; report.textContent = 'reading your presence\u2019s record\u2026';
        let d; try { d = await post(true); } catch { d = { error: 'the request did not go through' }; }
        dry.disabled = false;
        if (!d || d.error) { report.textContent = (d && d.error) || 'something went wrong'; return; }
        if (d.skipped) { report.textContent = 'already handed over.'; go.hidden = true; return; }
        const w = d.willLand || {};
        report.innerHTML =
          '<h4>What would land, against what ' + esc(d.presence || 'your presence') + ' already holds</h4>' +
          (w.noticed ? line('noticings', w.noticed) + (w.noticed.droppedAsDuplicates
            ? '<div class="muted">' + n(w.noticed.droppedAsDuplicates, 'is a restatement', 'are restatements')
              + ' of the others</div>' : '') : '') +
          (w.journal ? line('journal lines', w.journal) : '') +
          (w.shelf ? line(w.shelf.offered === 1 ? 'whole piece' : 'whole pieces', w.shelf)
            + '<div class="muted">the shelf holds ' + w.shelf.holds + ' of ' + w.shelf.capacity + '</div>' : '') +
          (d.blocked ? '<div class="warn">' + esc(d.blocked) + '</div>' : '') +
          '<h4>The one line it will read</h4><div class="muted">' + esc(d.arrivalWillReadLike || '') + '</div>';
        go.hidden = !!d.blocked;
      });

      go.addEventListener('click', async () => {
        go.disabled = true; go.textContent = 'handing it over\u2026';
        let d; try { d = await post(false); } catch { d = { error: 'the request did not go through' }; }
        go.disabled = false; go.textContent = 'Hand it over';
        if (!d || !d.ok) {
          report.innerHTML = '<div class="warn">' + esc((d && d.error) || 'it did not go through') + '</div>'
            + '<div class="muted">Nothing was announced and nothing is half-done — it can be run again.</div>';
          return;
        }
        const i = d.imported || {};
        go.hidden = true;
        report.innerHTML = '<h4>Handed over</h4><div>' + [n(i.noticed, 'noticing', 'noticings'),
          n(i.journal, 'journal line', 'journal lines'),
          n(i.shelf, 'piece on the shelf', 'pieces on the shelf')].join(', ') + '.</div>'
          + '<div class="muted">' + esc(d.arrival || '') + '</div>';
      });
    }

    // ---- THE PORTAL'S FAR SIDE -------------------------------------------
    {
      const inp = $('portal-link'), st = $('portal-status');
      if (inp) {
        const held = portalLink();
        if (held) { inp.value = portalSrc(held); st.textContent = 'Showing your garden.'; }
        $('portal-save').addEventListener('click', () => {
          if (!inp.value.trim()) { st.textContent = 'Paste the link 4irden gave you.'; return; }
          if (!setPortalLink(inp.value)) {
            st.textContent = 'That does not look like a view link — it should have /share/ in it.';
            return;
          }
          inp.value = portalSrc(portalLink());
          st.textContent = 'Showing your garden. If it stays dark, the view may have been turned off.';
        });
        $('portal-clear').addEventListener('click', () => {
          setPortalLink(''); inp.value = ''; st.textContent = 'The portal is just a door again.';
        });
      }
    }

    // WHO YOU HAVE SILENCED, and undoing it.
    async function paintBlocks() {
      let list = [];
      try { list = (await (await fetch('/api/blocks')).json()).blocked || []; } catch { return; }
      const wrap = $('acct-blocks-wrap'), box = $('acct-blocks');
      if (!wrap || !box) return;
      wrap.hidden = !list.length;
      box.innerHTML = list.map((h) =>
        '<span class="acct-block">@' + esc(h) + '<button type="button" data-h="' + esc(h) + '" aria-label="Unblock ' + esc(h) + '">unblock</button></span>').join('');
      for (const b of box.querySelectorAll('button')) {
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            await fetch('/api/blocks', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ handle: b.dataset.h, on: false }) });
          } catch { /* it stays until the next look */ }
          paintBlocks();
        });
      }
    }

    // CLOSING THE ACCOUNT. Two steps on purpose: the button opens the box, and
    // only a password typed into it does the thing. The server asks for the
    // same proof again — this is a courtesy, not the lock.
    {
      const open = $('acct-close'), box = $('acct-close-box'), msg = $('acct-close-msg');
      const go = $('acct-close-go'), no = $('acct-close-no'), pw = $('acct-close-pw');
      if (open && box && go && no) {
        open.addEventListener('click', () => { box.hidden = false; open.hidden = true; msg.textContent = ''; pw.focus(); });
        no.addEventListener('click', () => { box.hidden = true; open.hidden = false; pw.value = ''; msg.textContent = ''; });
        go.addEventListener('click', async () => {
          go.disabled = true; msg.textContent = 'Closing…';
          try {
            const r = await fetch('/api/me/delete', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: pw.value, username: pw.value.trim() }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { msg.textContent = d.error || 'That did not work — nothing was deleted.'; go.disabled = false; return; }
            msg.textContent = 'Closed. Goodbye.';
            setTimeout(() => location.reload(), 900);
          } catch {
            msg.textContent = 'Could not reach the server — nothing was deleted.';
            go.disabled = false;
          }
        });
      }
    }
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
      // ---- A WHOLE TEXT IS USUALLY ALREADY A FILE --------------------------
      // Pasting one meant opening it somewhere else, selecting all of it, and
      // trusting the clipboard with a hundred kilobytes. Dropping it is the
      // gesture people already have. Writing is untouched — the box is still a
      // box, and a drop just fills it in so you can see what you are giving
      // before you give it.
      const drop = $('shelf-drop'), picker = $('shelf-file');
      const TEXTY = /\.(txt|md|markdown|json|csv|rtf|log|tex|srt|vtt|html?|xml|ya?ml)$/i;
      const titleFromName = (name) => name
        .replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

      async function take(file) {
        if (!file) return;
        // A file's type is often empty on a drop, so the extension has a vote
        // too. Refuse rather than shelve a PDF's compressed bytes as "words".
        if (!(file.type || '').startsWith('text') && !/json|csv|xml|yaml/.test(file.type || '')
            && !TEXTY.test(file.name)) {
          status.textContent = 'That one is not text — a PDF or a .docx has to be exported first.';
          return;
        }
        if (file.size > 250000) {
          status.textContent = Math.round(file.size / 1000) + 'k is past the 250k a shelf slot holds.';
          return;
        }
        let text = '';
        try { text = await file.text(); } catch { status.textContent = 'That file could not be read.'; return; }
        if (!text.trim()) { status.textContent = 'That file is empty.'; return; }
        $('shelf-text').value = text;
        if (!$('shelf-title').value.trim()) $('shelf-title').value = titleFromName(file.name);
        status.textContent = file.name + ' — ' + (text.length >= 1000
          ? Math.round(text.length / 1000) + 'k' : text.length) + ' characters, ready to place.';
        $('shelf-title').focus();
      }

      if (drop) {
        // dragover must be prevented on EVERY pass or the browser navigates to
        // the file instead, which throws the whole screen away mid-gift.
        const over = (on) => (e) => {
          e.preventDefault(); e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          drop.classList.toggle('over', on);
        };
        drop.addEventListener('dragenter', over(true));
        drop.addEventListener('dragover', over(true));
        drop.addEventListener('dragleave', (e) => {
          // leaving for a CHILD is not leaving; relatedTarget says which
          if (!drop.contains(e.relatedTarget)) drop.classList.remove('over');
        });
        drop.addEventListener('drop', (e) => {
          e.preventDefault(); e.stopPropagation();
          drop.classList.remove('over');
          take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
        });
        const hintPick = drop.querySelector('.drop-hint strong');
        if (hintPick && picker) {
          hintPick.style.cursor = 'pointer';
          hintPick.addEventListener('click', () => picker.click());
          picker.addEventListener('change', () => take(picker.files && picker.files[0]));
        }
      }
      // A file dropped ANYWHERE else on the page must not be opened by the
      // browser — that navigates away from a half-written gift.
      for (const ev of ['dragover', 'drop']) {
        window.addEventListener(ev, (e) => { if (!drop || !drop.contains(e.target)) e.preventDefault(); });
      }

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
    // THE WINDOW's one dial. Kept out of roomCfg deliberately: it is not a
    // property of the room, it is a property of how this person wants to be
    // looked back at, and it survives changing environments.
    const eyeEl = $('room-eye'), eyeNote = $('room-eye-note');
    const faceEl = $('room-face'), handsEl = $('room-hands'), viewEl = $('room-camview');
    if (eyeEl) {
      const read = (k, dflt) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v; } catch { return dflt; } };
      const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* full */ } };
      let eyeVal = parseFloat(read('y3k.eye', '0.5'));
      if (!Number.isFinite(eyeVal)) eyeVal = 0.5;
      eyeEl.value = eyeVal;
      // All three OFF by default: they open the camera themselves, so a default
      // of on would prompt for permission nobody asked for.
      if (faceEl) faceEl.checked = read('y3k.face', '0') === '1';
      if (handsEl) handsEl.checked = read('y3k.hands', '0') === '1';
      if (viewEl) viewEl.checked = read('y3k.camview', '0') === '1';

      // ONE NOTE THAT TELLS THE TRUTH ABOUT THE CURRENT STATE, rather than a
      // label that is right on average. The three things a person can be
      // confused by — the camera is off, reduced motion is capping it, the
      // dial is at zero — each have their own sentence.
      const paintEyeNote = () => {
        if (!eyeNote) return;
        const st = body.eye?.() || {};
        const camOn = Boolean(cameraIsOn && cameraIsOn());
        const wantsSomething = (faceEl?.checked && parseFloat(eyeEl.value) > 0) || handsEl?.checked;
        eyeNote.textContent = !wantsSomething
          ? 'Nothing is switched on, and the camera is not being read.'
          : !camOn ? 'The camera did not open. Your browser may have refused it — check the address bar.'
          : st.reduced ? 'Running. Your system asks for reduced motion, so the room is held to a fifth of the dial.'
          : 'Running.';
      };
      paintEyeNote();
      eyeEl.addEventListener('input', () => {
        const v = parseFloat(eyeEl.value);
        if (faceEl?.checked) body.setEye?.(v);
        paintEyeNote(); save('y3k.eye', v);
      });
      // Each switch hands off to main.js, which owns the camera lease: these
      // are the things that open and close it now, so settings must not poke
      // the camera or the eye directly.
      faceEl?.addEventListener('change', async () => {
        await setFace?.(faceEl.checked);
        paintEyeNote(); setTimeout(paintEyeNote, 700);   // again once the stream has answered
      });
      handsEl?.addEventListener('change', async () => {
        await setHands?.(handsEl.checked);
        paintEyeNote(); setTimeout(paintEyeNote, 700);
      });
      viewEl?.addEventListener('change', () => { setCamView?.(viewEl.checked); paintEyeNote(); });
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

    // HOW MUCH ROOM THIS MACHINE CAN AFFORD. The meter is the default and a
    // choice overrides it in both directions — someone on a fast machine who
    // wants it light, and someone on a slow one who would rather have the glass
    // and put up with it. The note says what the meter has decided, because a
    // setting that quietly does something else is worse than no setting.
    const gfx = window.Y3K && window.Y3K.gfx;
    const gfxSel = $('gfx-tier'), gfxNote = $('gfx-note');
    if (gfx && gfxSel) {
      const NAMES = { high: 'everything', mid: 'lighter', low: 'lightest' };
      const sayGfx = () => {
        gfxSel.value = gfx.auto() ? 'auto' : gfx.tier();
        gfxNote.textContent = gfx.auto()
          ? `Watching. Right now it is showing you ${NAMES[gfx.tier()]}.`
          : 'Your choice, held — the meter is not touching it.';
      };
      gfx.onChange(sayGfx);
      gfxSel.addEventListener('change', () => { gfx.set(gfxSel.value === 'auto' ? null : gfxSel.value); sayGfx(); });
      sayGfx();
    } else if (gfxSel) {
      gfxSel.disabled = true;
      gfxNote.textContent = 'The frame meter is not running in this window.';
    }

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
      if (!prov) { bStatus.textContent = 'Unrecognized key format (expected sk-ant-…, sk-or-… or sk-…).'; modelRow.hidden = true; setBrainConfig(null); return; }
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

    // CONTROLS: two preferences people genuinely disagree about, so neither is
    // hard-coded. They take effect on the very next gesture — no reload.
    {
      const c = getControls();
      const swap = $('ctl-swap'), inv = $('ctl-invert');
      if (swap) { swap.checked = !!c.swap; swap.addEventListener('change', () => setControl('swap', swap.checked)); }
      if (inv) { inv.checked = !!c.invert; inv.addEventListener('change', () => setControl('invert', inv.checked)); }
    }

    // ITS OWN HOURS: the host's blessing, kept in this browser beside the key
    // it spends. Off unless they say otherwise — an unasked-for stretch of
    // life is a gift, and a gift nobody offered is just a bill.
    const hoursEl = $('hours-on');
    if (hoursEl) {
      try { hoursEl.checked = localStorage.getItem('y3k.hours') === 'on'; } catch { /* private mode */ }
      hoursEl.addEventListener('change', () => {
        try { localStorage.setItem('y3k.hours', hoursEl.checked ? 'on' : 'off'); } catch { /* storage full */ }
      });
    }

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
    // The days as a skyline (pattern after Bklit UI's design-engineered charts,
    // re-grown in vanilla soil): one bar per day, height by cost, the details
    // on hover. The table below stays for exact reading.
    const days = [...v.byDay].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-30);
    const maxC = Math.max(...days.map((d) => d.cost), 0.0001);
    const chart = days.length > 1
      ? `<div class="spend-chart" role="img" aria-label="Spend by day">` +
        days.map((d) => `<div class="spend-bar" title="${esc(d.day)} — ${money(d.cost)} · ${d.requests} calls" style="height:${Math.max(3, Math.round((d.cost / maxC) * 100))}%"></div>`).join('') +
        `</div><div class="spend-axis muted"><span>${esc(days[0].day.slice(5))}</span><span>${money(maxC)} peak</span><span>${esc(days[days.length - 1].day.slice(5))}</span></div>`
      : '';
    const dayRows = v.byDay.map((d) => `<tr><td>${esc(d.day)}</td><td>${d.requests}</td><td>${tok(d.in)}</td><td>${tok(d.out)}</td><td>${money(d.cost)}</td></tr>`).join('');
    const modelRows = v.byModel.map((m) => `<tr><td>${esc(m.model)}</td><td>${m.requests}</td><td>${tok(m.in)}</td><td>${tok(m.out)}</td><td>${money(m.cost)}</td></tr>`).join('');
    el.classList.remove('muted');
    el.innerHTML =
      `<div class="usage-line"><span class="usage-k">today</span> ${line(v.today)}</div>` +
      `<div class="usage-line"><span class="usage-k">lifetime</span> ${line(v.lifetime)}</div>` +
      chart +
      (dayRows ? `<h4>By day</h4><table class="usage-table"><tr><th>day</th><th>calls</th><th>in</th><th>out</th><th>cost</th></tr>${dayRows}</table>` : '') +
      (modelRows ? `<h4>By model</h4><table class="usage-table"><tr><th>model</th><th>calls</th><th>in</th><th>out</th><th>cost</th></tr>${modelRows}</table>` : '') +
      (v.lifetime.estimated ? `<div class="muted">${v.lifetime.estimated} streamed calls were estimated from text length.</div>` : '');
    if (chart && !reducedMotion()) {
      el.querySelectorAll('.spend-bar').forEach((bar, i) =>
        animate(bar, { scaleY: [0, 1], opacity: [0.4, 1] }, { duration: 0.5, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }));
    }
  }
  function close() { modal.hidden = true; }

  $('settings-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  return { open, close, getActive };
}
