// Settings: collapsible sections — Brain, Voice, Room, API usage.
//   • Brain  — bring-your-own AI key (Anthropic / OpenAI / OpenRouter) + model.
//   • Voice  — ElevenLabs key, choose/describe a voice, delivery sliders.
//   • Room   — the metal room, made yours: brightness / grooves / tint / glow.
//   • Graphics — how smooth it runs: Smooth, Automatic, or a fixed tier, and
//               single-field fine-tuning on top (src/gfx.js holds the truth).
//   • API    — what your key has spent: by day, by model, tokens + dollars.
// Y3K's own FORM and COLOR stay wholly its own (chosen freshly every reply) —
// the room is the HUMAN's side of the space, so that part is customizable.
// All selections persist in localStorage; usage comes from the server ledger.

import { getBrainConfig, setBrainConfig, keyFor, forgetKey, hasServerBrain, checkOwnBrain } from './brain.js';
import { ownChoiceFor, setOwnChoice, ownState, claudeCodeStatus, installClaudeCode, updateY3kode, waitForVersion, siteSetup, lookAgain, ownModel, setOwnModel, heardModels } from './own-brain.js';
import { modelsFor, modelName } from './models.js';
import { detectPlatform, pickBuild } from './code/platform.js';
import { savedPairing } from './code/transport.js';
import { kommandWords } from './tags.mjs';
import { glassSelectAll } from './glass-select.js';
import { getControls, setControl } from './controls.js';
import { animate, reducedMotion } from './motion.js';
import { portalLink, setPortalLink, portalSrc } from './portal.js';
import { getVoiceKey, setVoiceKey, voiceKeyHeader, usedUpMessage, houseVoiceResting } from './voice.js';
import { ENVIRONMENTS } from './environments.js';
import { PROFILES } from './gfx.js';
import { stats as paceStats } from './pace.js';

// HOW SMOOTH IT RUNS — the modes, in the order a person should meet them.
// Smooth first: it is the answer to "it's glitchy", and the one line under it
// says exactly what it gives up. Each line says what the mode DOES, not what
// it is called inside gfx.js.
const GFX_MODES = [
  ['smooth', 'Smooth', 'Steady frame rate. No glass blur or glow, and the liquid stays still.'],
  ['auto', 'Automatic', 'Measures the frame rate and lowers quality until it is steady.'],
  ['high', 'Everything', 'Full glass blur and glow at your screen’s refresh rate. Uses the most power.'],
  ['mid', 'Lighter', 'Large panels stop blurring. Small glass and the glow stay.'],
  ['low', 'Lightest', 'No live blur or glow. The liquid moves only when touched.'],
];
const GFX_NAMES = { smooth: 'smooth', high: 'everything', mid: 'lighter', low: 'lightest' };

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
// The voice services Settings → Voice offers (voice-providers.mjs on the
// server knows how to ask each). Only ElevenLabs can run on the site's key.
const VOICE_SERVICES = {
  elevenlabs: { name: 'ElevenLabs', hint: 'ElevenLabs API key' },
  openai: { name: 'OpenAI', hint: 'OpenAI API key (sk-…)' },
  cartesia: { name: 'Cartesia', hint: 'Cartesia API key' },
};
const serviceOf = (p) => (Object.hasOwn(VOICE_SERVICES, p || '') ? p : 'elevenlabs');

// The room, as the Room pane keeps it in this browser.
const ROOM_DEFAULTS = { brightness: 1, grooves: 1, hue: 220, tint: 0, glow: 1, env: 'room', eclipse: false };
const loadRoom = () => { try { return { ...ROOM_DEFAULTS, ...(JSON.parse(localStorage.getItem('y3k.room')) || {}) }; } catch { return { ...ROOM_DEFAULTS }; } };
const SLIDER_NAMES = { stability: 'Stability', speed: 'Speed' };

// cameraIsOn / setHands are handed in rather than imported: settings must not
// reach into the camera or the eye directly, and the honest note about what the
// camera does needs to know its live state, not guess it.
export function createSettings(body, { music, cameraIsOn = null, setFace = null, setHands = null, setCamView = null } = {}) {
  const modal = $('settings');
  const bodyEl = $('settings-body');
  let built = false;
  let currentSample = null; // the one audition/preview clip currently playing
  let onRoomChanged = null; // the Room pane's refresh, once it is built

  // A saved room style applies the moment the app boots — the room is theirs.
  try {
    const savedRoom = JSON.parse(localStorage.getItem('y3k.room'));
    if (savedRoom) body.setRoom?.(savedRoom);
  } catch { /* stock room */ }

  // The chosen voice: which service speaks, with which voice, on which model
  // (one remembered per service), and the Delivery sliders. Saved before there
  // were services it is { voiceId, settings } — an ElevenLabs voice.
  function getActive() {
    let a = null;
    try { a = JSON.parse(localStorage.getItem(KEY)); } catch { /* unreadable: start fresh */ }
    if (!a || typeof a !== 'object') a = { voiceId: 'browser', settings: {} };
    a.provider = serviceOf(a.provider);
    if (!a.models || typeof a.models !== 'object') a.models = {};
    return a;
  }
  function setActive(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private window: this visit only */ } }
  // What a speaker needs: main.js spreads this into voice.speaker().
  function speakWith(a = getActive()) {
    return { voiceId: a.voiceId, provider: a.provider, model: a.models[a.provider] || undefined, settings: a.settings };
  }

  // The service the Voice pane is showing — the chosen voice's, to begin with.
  let browsing = getActive().provider;
  const modelsSeen = {}; // service → its models, as the last list returned them

  // THE SITE'S VOICE, COUNTED. Without a key of your own, ElevenLabs speaks on
  // the site's account within a daily allowance (house.mjs), and nothing here
  // said how much was left: the voice just turned robotic when it ran out.
  // /api/usage carries the numbers. The Voice pane shows them under the site's
  // voices, and once the site has said no for today, its own words instead.
  let house = null;          // /api/usage's house view, as last fetched
  let listOnHouse = false;   // the Voice pane is listing the site's ElevenLabs voices
  const chars = (n) => (Number(n) || 0).toLocaleString('en-US');
  function syncHouseVoice() {
    const el = $('voice-house');
    if (!el) return;
    const v = house && !house.founder ? house.voice : null;
    const said = houseVoiceResting('elevenlabs');
    el.hidden = !listOnHouse || !(said || v);
    el.textContent = el.hidden ? ''
      : said ? said
      // the person's own numbers can look fine while the whole site is spent
      : v.siteResting ? 'The site\'s voice is resting for everyone until UTC midnight. Replies use the browser voice until then, or paste a key of your own above.'
      : `On the site's voice today: ${chars(v.usedChars)} of ${chars(v.capChars)} characters. It resets at UTC midnight; a character counts twice on any model but Flash and Turbo.`;
  }

  // A voice is saved with the service whose list it came from, which is not
  // always the one the pane is browsing: switch Service and the old list stays
  // on screen until the new one has loaded, and a voice id belongs to its own
  // service only. Saved under the new one, every reply failed over to the
  // browser voice.
  function selectVoice(id, name, p = browsing) {
    const a = getActive();
    a.voiceId = id;
    if (id !== 'browser') { a.provider = p; a.voiceName = name || ''; }
    setActive(a);
    document.querySelectorAll('.voice-row').forEach((r) => r.classList.toggle('on', r.dataset.id === id));
    syncDefaultsSummary();
    syncDelivery();
  }

  function voiceRow(v, p = browsing) {
    const active = getActive();
    const row = document.createElement('div');
    row.className = 'voice-row' + (active.voiceId === v.id ? ' on' : '');
    row.dataset.id = v.id;
    const meta = v.labels ? [v.labels.gender, v.labels.accent, v.labels.age, v.labels.description].filter(Boolean).join(' · ') : '';
    // The browser voice and a service's stock voices aren't deletable; your
    // own designed/cloned ElevenLabs voices are.
    const deletable = v.id !== 'browser' && !!v.own && p === 'elevenlabs';
    row.innerHTML =
      `<span class="dot"></span><span class="vname">${esc(v.name)}</span><span class="vmeta">${esc(meta)}</span>` +
      (v.id === 'browser' ? '' : '<button class="play" title="Play sample">▶</button>') +
      (deletable ? '<button class="voice-del" title="Delete voice" aria-label="Delete voice">✕</button>' : '');
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('play') || e.target.classList.contains('voice-del')) return;
      selectVoice(v.id, v.name, p);
    });
    const play = row.querySelector('.play');
    if (play) play.addEventListener('click', (e) => { e.stopPropagation(); sample(v.id, play, p); });
    const del = row.querySelector('.voice-del');
    if (del) del.addEventListener('click', (e) => { e.stopPropagation(); deleteVoice(v.id, row); });
    return row;
  }

  // The stock voices' drawer says how many it holds, and which is chosen
  // when the chosen voice is one of them — it stays closed either way.
  function syncDefaultsSummary() {
    const box = document.querySelector('#voice-list .voice-defaults');
    if (!box) return;
    const rows = [...box.querySelectorAll('.voice-row')];
    const on = rows.find((r) => r.classList.contains('on'));
    box.querySelector('.vmeta').textContent =
      `${rows.length} voice${rows.length === 1 ? '' : 's'}` + (on ? ` · ${on.querySelector('.vname').textContent.split(' - ')[0]} chosen` : '');
  }

  // Delivery follows the chosen voice's model: a slider that model ignores is
  // greyed out and says why, rather than moving and changing nothing.
  function syncDelivery() {
    const a = getActive();
    const note = $('voice-delivery-note');
    const models = a.voiceId === 'browser' ? null : modelsSeen[a.provider];
    const m = models && (models.find((x) => x.id === a.models[a.provider]) || models[0]);
    const off = m ? Object.keys(SLIDER_NAMES).filter((k) => !m.controls.includes(k)) : [];
    for (const k of Object.keys(SLIDER_NAMES)) {
      const el = $('set-' + k);
      if (el) { el.disabled = off.includes(k); el.closest('.slider')?.classList.toggle('off', off.includes(k)); }
    }
    if (note) {
      note.hidden = !off.length;
      note.textContent = off.length ? `${m.name} does not use ${off.map((k) => SLIDER_NAMES[k]).join(' or ')}.` : '';
    }
  }

  async function deleteVoice(id, row) {
    if (!window.confirm('Delete this voice from your ElevenLabs library? This cannot be undone.')) return;
    const del = row.querySelector('.voice-del');
    if (del) { del.disabled = true; del.textContent = '…'; }
    try {
      const r = await fetch('/api/voice/delete', {
        method: 'POST', headers: { 'content-type': 'application/json', ...voiceKeyHeader('elevenlabs') },
        body: JSON.stringify({ voiceId: id }),
      }).then((x) => x.json());
      if (r.ok) {
        row.remove();
        if (getActive().voiceId === id) selectVoice('browser'); // fall back if the active voice is gone
        syncDefaultsSummary();
      } else {
        if (del) { del.disabled = false; del.textContent = '✕'; del.title = r.error || 'could not delete'; }
        if (r.error) window.alert(r.error); // e.g. the site's voices are the founder's to delete
      }
    } catch { if (del) { del.disabled = false; del.textContent = '✕'; } }
  }

  // Only one audition plays at a time; stop the previous before starting another.
  function playExclusive(audio) {
    if (currentSample && currentSample !== audio) { try { currentSample.pause(); } catch { /* ignore */ } }
    currentSample = audio;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  async function sample(id, btn, p = browsing) {
    if (id === 'browser') {
      if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(SAMPLE));
      return;
    }
    btn.disabled = true;
    try {
      // A sample is heard as it would speak: this service, its chosen model.
      const chosen = getActive();
      const r = await fetch('/api/voice/tts', {
        method: 'POST', headers: { 'content-type': 'application/json', ...voiceKeyHeader(p) },
        body: JSON.stringify({ text: SAMPLE, voiceId: id, settings: chosen.settings, provider: p, model: chosen.models[p] }),
      });
      if (!r.ok) {
        // The site's voice used up for today: say so, where ▶ used to just
        // grey out and come back with nothing.
        const said = await usedUpMessage(r);
        const status = said && $('voice-status');
        if (status) status.textContent = said;
        throw new Error();
      }
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
    out.innerHTML = '<div class="muted">Designing voices. This takes a few seconds.</div>';
    try {
      const d = await fetch('/api/voice/design', {
        method: 'POST', headers: { 'content-type': 'application/json', ...voiceKeyHeader('elevenlabs') },
        body: JSON.stringify({ description: desc }),
      }).then((r) => r.json());
      if (d.error) {
        // Refused (e.g. designing on the site's voice account is the founder's):
        // show why, as text, rather than "no previews".
        out.innerHTML = '<div class="muted"></div>';
        out.firstChild.textContent = d.error;
        btn.disabled = false; btn.textContent = 'Generate voices';
        return;
      }
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
    // Its name is the one typed above; without one, the description's first words.
    const name = $('voice-name').value.replace(/\s+/g, ' ').trim().slice(0, 60) || desc.split(/\s+/).slice(0, 4).join(' ') || 'Custom voice';
    try {
      const r = await fetch('/api/voice/save', {
        method: 'POST', headers: { 'content-type': 'application/json', ...voiceKeyHeader('elevenlabs') },
        body: JSON.stringify({ generatedVoiceId, name, description: desc }),
      }).then((x) => x.json());
      if (r.voice_id) {
        // a voice of your own: with the others at the top, above the Default drawer
        const list = $('voice-list');
        list.insertBefore(voiceRow({ id: r.voice_id, name, labels: { description: 'designed' }, own: true }, 'elevenlabs'), list.querySelector('.voice-defaults'));
        selectVoice(r.voice_id, name, 'elevenlabs');
        use.textContent = 'Saved and selected';
      } else { use.textContent = 'Failed'; use.title = r.error || ''; use.disabled = false; }
    } catch { use.textContent = 'Failed'; use.disabled = false; }
  }

// THE KOMMANDS PANE — the whole language on one page, generated.
//
// A word, a slash, what it should be: that is the syntax, and the page says it
// once with examples, then lists every word the parser knows. Nothing here is
// typed out by hand: kommandWords() reads the same tables parseKommand and
// parseShape read, so a word added to the grammar appears here the same day and
// a word this page shows always works.
function kommandPane() {
  const w = kommandWords();
  const chip = (name, digits, extra) =>
    '<code>' + esc(name) + (digits ? ' ' + 'ABCD'.slice(0, digits).split('').join(',') : '') + (extra || '') + '</code>';
  const list = (items) => '<div class="muted kommand-words">' + items.join(' ') + '</div>';
  const eg = (line, says) =>
    '<div class="muted"><code>' + esc(line) + '</code><br><span class="kommand-says">' + esc(says) + '</span></div>';
  const also = (k) => w.keys[k].slice(1).map((n) => '<code>' + esc(n) + '</code>').join(' ');
  return '' +
    '<div class="muted">Kommands change your presence\'s body directly. Type one in the chat bar and it applies immediately. It is not sent to your presence as a message and is not saved in the conversation.</div>' +
    '<h4>How to write one</h4>' +
    '<div class="muted">A <strong>word</strong>, a <strong>slash</strong>, and <strong>what it should be</strong>. Commas give it more than one. Put as many together as you like, in any order. Capitals and spaces don’t matter, and the first slash is optional.</div>' +
    eg('color/red', 'the whole body red') +
    eg('color/red, blue', 'red above, blue below') +
    eg('form/heart', 'a heart') +
    eg('size/8', 'bigger: 0 to 9, or small, big, huge') +
    eg('mood/excited', 'how it feels') +
    eg('background/snowy taiga', 'where it is') +
    eg('color/red,blue/form/sphere/size/8', 'all at once, in any order: size/8/color/red,blue/form/sphere is the same') +
    '<h4>The words</h4>' +
    '<div class="muted"><code>color</code> (or ' + also('color') + ') · <code>form</code> (or ' + also('form') + ') · <code>size</code> · <code>mood</code> · <code>background</code> (or ' + also('room') + ') · <code>pace</code> · <code>liquid</code> — and every body word and move below is a word too: <code>glow/5</code>, <code>turn/left</code>, <code>spin/3</code>.</div>' +
    '<h4>Colours <span class="kommand-note">up to ' + w.maxColors + ', or light / dark in front, or #hex</span></h4>' +
    list(w.colors.map((c) => chip(c, 0))) +
    '<h4>Palettes <span class="kommand-note">one at a time, as in color/ember</span></h4>' +
    list(w.palettes.map((p) => chip(p, 0))) +
    '<h4>Moods</h4>' +
    list(w.moods.map((m) => chip(m, 0))) +
    '<h4>Backgrounds</h4>' +
    list(w.rooms.map((r) => chip(r, 0))) +
    '<h4>Forms <span class="kommand-note">' + w.forms.length + ', each one equation except the drawn one; numbers after a form shape it, as in form/knot,2,3</span></h4>' +
    list(w.forms.map((f) => chip(f.name, f.digits, f.drawn ? ' ·drawn' : ''))) +
    '<div class="muted">Or how it holds itself: ' + w.postures.map((p) => '<code>form/' + esc(p) + '</code>').join(' ') + '. <code>form/none</code> brings it home.</div>' +
    '<h4>The body</h4>' +
    list(w.body.map((b) => chip(b, 0))) +
    '<h4>Moves <span class="kommand-note">' + w.moves.length + ', up to ' + w.maxOps + ' at once, in the order written</span></h4>' +
    list(w.moves.map((m) => chip(m.name, m.digits, m.heading ? ' ·PLACE' : ''))) +
    eg('form/heart,3/throb/5,5/hue/3', 'a heart, beating, warmed. Moves apply in the order written.') +
    '<h4>Masks <span class="kommand-note">' + w.masks.length + ', each narrowing the move before it</span></h4>' +
    list(w.masks.map((m) => chip(m.name, m.digits))) +
    '<div class="muted">A <code>PLACE</code> is ' + w.headings.join(', ') + '. Put <code>not</code> in front of a mask for everything except it: <code>form/butterfly/dim/9/not/part,0</code> leaves only the wings. The long hand from before still works — <code>/shape/heart,3/throb,5,5</code> — and <code>/over/2s,ember/1s,still</code> writes a score, step by step.</div>';
}

  async function build() {
    // A rail of categories, one pane at a time. The old screen stacked six
    // accordions in a single column, which put an API key field, the room
    // sliders and a spending ledger on one scrollbar — everything equally
    // close, so nothing read as more important than anything else.
    const RAIL = [
      ['account', 'Account', 'sign-in and privacy'],
      ['brain', 'Brain', 'AI provider'],
      ['voice', 'Voice', 'text to speech'],
      ['music', 'Music', 'playback'],
      ['room', 'Room', 'environment'],
      ['kamera', 'Kamera', 'camera tracking'],
      ['graphics', 'Graphics', 'performance'],
      ['controls', 'Controls', 'world navigation'],
      ['shelf', 'Shelf', 'texts for your presence'],
      ['kommands', 'Kommands', 'typed commands'],
      ['usage', 'Usage', 'API spending'],
      ['inherit', 'Inheritance', 'import airden files'],
    ];
    const pane = (id, inner) =>
      '<section class="set-pane" data-pane="' + id + '" role="tabpanel">' + inner + '</section>';
    // A SWITCH: its name, what it does, and the switch itself. The checkbox
    // keeps its id and its type, so everything that reads or sets it is
    // unchanged; only how it looks is new (styles.css .tog). descId names the
    // line of description when the code rewrites it (Full motion does).
    const tog = (id, name, desc = '', descId = '') =>
      '<label class="tog" for="' + id + '">' +
        '<span class="tog-text"><span class="tog-name">' + name + '</span>' +
          '<span class="tog-desc"' + (descId ? ' id="' + descId + '"' : '') + '>' + desc + '</span></span>' +
        '<input id="' + id + '" type="checkbox" role="switch" class="tog-input" />' +
        '<span class="tog-sw" aria-hidden="true"></span>' +
      '</label>';

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
          '<div id="auth-none" class="muted">You are not signed in. Sign in to post, keep a presence and see your API usage.</div>' +
          // WHO YOU HAVE SILENCED. A block is the reader's, so it is listed
          // where the reader's own things are, and undone in one tap.
          '<div id="acct-blocks-wrap" hidden><h4>Blocked</h4>' +
            '<div class="muted">Blocked presences are hidden from your feed, search and live list, and their letters do not reach your presence. They are not notified.</div>' +
            '<div id="acct-blocks" class="acct-blocks"></div></div>' +
          '<h4>Legal and contact</h4>' +
          '<div class="muted"><a href="/legal.html" target="_blank" rel="noopener">Privacy policy and terms</a> &middot; ' +
            'report a post from its card &middot; ' +
            'email <a href="mailto:developer@yearthreethousand.com">developer@yearthreethousand.com</a></div>' +
          // CLOSING AN ACCOUNT, in the app, as it must be (App Review 5.1.1(v))
          // — and said plainly, because it is the one button here that cannot
          // be taken back.
          '<div id="acct-close-wrap" hidden><h4>Delete account</h4>' +
            '<div class="muted">Permanently deletes your account and everything in it: your presence and its posts, memory, journal, shelf and letters, its society in the world, your games and your uploads. This cannot be undone.</div>' +
            '<button id="acct-close" class="btn small danger">Delete account</button>' +
            '<div id="acct-close-box" hidden>' +
              '<label class="field"><input id="acct-close-pw" type="password" placeholder="Password" autocomplete="current-password" /></label>' +
              '<div class="acct-close-row">' +
                '<button id="acct-close-go" class="btn small danger">Delete everything</button>' +
                '<button id="acct-close-no" class="btn small">Cancel</button>' +
              '</div></div>' +
            '<div id="acct-close-msg" class="muted"></div></div>') +
        // ----- Brain: where your presence's replies come from -----
        // One list of providers. Claude Code (the founder's own plan, through
        // y3kode: own-brain.js) shows what y3kode says about it and the one
        // thing to do next; a key provider shows its key. Each key is kept per
        // provider (brain.js keyFor), so switching never loses one.
        pane('brain',
          '<div class="row"><span>Provider</span><select id="brain-provider"></select></div>' +
          '<div id="brain-what" class="muted"></div>' +
          '<div class="row" id="brain-model-row" hidden><span>Model</span><select id="brain-model"></select></div>' +
          '<div id="cc-sec" class="cc-card" hidden>' +
            '<div class="cc-head"><span class="cc-name">Claude Code</span><span id="cc-pill" class="cc-pill">Checking</span></div>' +
            '<div id="cc-line" class="cc-line"></div>' +
            '<div id="cc-cmd" class="cc-cmd" hidden><code id="cc-cmd-text"></code><button type="button" id="cc-copy" class="btn small">Copy</button></div>' +
            '<div class="cc-actions"><button type="button" id="cc-act" class="btn small" hidden></button>' +
              '<button type="button" id="cc-check" class="btn small">Check again</button></div>' +
          '</div>' +
          '<div id="key-sec" hidden>' +
            '<label class="field"><input id="brain-key" type="password" placeholder="Paste API key" autocomplete="off" spellcheck="false" /></label>' +
            '<div id="brain-status" class="muted"></div>' +
            '<button id="brain-clear" class="btn small" hidden>Clear key</button>' +
          '</div>' +
          '<h4>Autonomy</h4>' +
          tog('hours-on', 'Asynchronous autonomy',
            'Leave y3k open and step away. After five minutes your presence carries on by itself, in its world and in its room, and stops when you come back. Each stretch uses at most about 15&cent; of its budget.')) +
        // ----- Voice -----
        pane('voice',
          '<div class="muted">The voice your presence speaks with. Choose a service and paste its API key, which is stored in this browser only. Without a key, the browser\'s built-in voice is used.</div>' +
          '<div class="row"><span>Service</span><select id="voice-provider">' +
            Object.entries(VOICE_SERVICES).map(([id, v]) => '<option value="' + id + '">' + v.name + '</option>').join('') +
          '</select></div>' +
          '<label class="field"><input id="voice-key" type="password" placeholder="ElevenLabs API key" autocomplete="off" spellcheck="false" /></label>' +
          '<div class="row" id="voice-model-row" hidden><span>Model</span><select id="voice-model"></select></div>' +
          '<div id="voice-status" class="muted"></div>' +
          '<div id="voice-house" class="muted" hidden></div>' +
          '<h4>Voices</h4><div id="voice-list" class="voice-list"></div>' +
          '<div id="design-sec"><h4>Design a voice</h4>' +
            '<label class="field"><input id="voice-name" type="text" maxlength="60" placeholder="Name" autocomplete="off" spellcheck="false" /></label>' +
            '<label class="field"><textarea id="voice-desc" rows="3" placeholder="Describe the voice"></textarea></label>' +
            '<button id="voice-design-btn" class="btn">Generate voices</button>' +
            '<div id="voice-previews" class="previews"></div>' +
          '</div>' +
          '<h4>Delivery</h4>' +
          '<label class="slider">Stability <input id="set-stability" type="range" min="0" max="1" step="0.05"></label>' +
          '<label class="slider">Speed <input id="set-speed" type="range" min="0.7" max="1.2" step="0.05"></label>' +
          '<div id="voice-delivery-note" class="muted" hidden></div>') +
        // ----- Music (plays here; the presence hears it only while awake) -----
        pane('music',
          '<div class="muted">Play music in the room. While the komputer is on, your presence hears it: it analyzes the audio itself, not just the title.</div>' +
          '<div class="row"><span>Source</span><select id="music-source">' +
            '<option value="audius">Audius (free catalog, no account)</option>' +
            '<option value="file">Files on this computer</option>' +
          '</select></div>' +
          '<div id="music-audius">' +
            '<label class="field"><input id="music-q" type="search" placeholder="Search Audius" autocomplete="off" /></label>' +
            '<div class="row"><button id="music-search" class="btn small">Search</button>' +
            '<button id="music-trending" class="btn small">Trending</button></div>' +
          '</div>' +
          '<div id="music-file" hidden><input id="music-files" type="file" accept="audio/*" multiple />' +
            '<div class="muted">Files play in this browser and are not uploaded.</div></div>' +
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
          '<div class="row"><button id="music-room" class="btn small">Use the microphone</button>' +
            '<span id="music-room-note" class="muted"></span></div>' +
          '<div id="music-now" class="muted"></div>' +
          '<div id="music-hears" class="muted"></div>') +
        // ----- Room (the metal room, made yours) -----
        pane('room',
          '<div class="muted">The environment your presence lives in and how it looks. Changes apply immediately and are saved in this browser.</div>' +
          '<div id="env-picker" class="env-picker"></div>' +
          '<h4>Portal</h4>' +
          '<div class="muted">The disc in the corner opens 4irden. To show one of your 4irden gardens there instead, create a view link for it in 4irden and paste it here. The portal then shows that garden live. The link is saved in this browser and only sent to 4irden.</div>' +
          '<label class="field"><input id="portal-link" type="text" placeholder="4irden view link" autocomplete="off" spellcheck="false" /></label>' +
          '<div class="row"><button id="portal-save" class="btn">Use link</button>' +
            '<button id="portal-clear" class="btn">Remove link</button></div>' +
          '<div id="portal-status" class="muted"></div>' +
          '<h4>Appearance</h4>' +
          '<label class="slider">Brightness <input id="room-brightness" type="range" min="0.5" max="2" step="0.05"></label>' +
          '<div id="room-only">' +
          '<label class="slider">Grooves <input id="room-grooves" type="range" min="0" max="2" step="0.05"></label>' +
          '<label class="slider">Tint hue <input id="room-hue" type="range" min="0" max="360" step="1"></label>' +
          '<label class="slider">Tint strength <input id="room-tint" type="range" min="0" max="1" step="0.02"></label>' +
          '</div>' +
          '<label class="slider">Orb glow <input id="room-glow" type="range" min="0.4" max="2" step="0.05"></label>' +
          // THE ECLIPSE. A look that began as a fault on the kode page (the sky
          // clipped in a dark disc around the orb) and was kept by request as a
          // choice — off unless asked for. body.js draws it; see THE ECLIPSE there.
          tog('room-eclipse', 'Eclipse', 'Draws a dark disc behind your presence, three times its width, in any environment.') +
          '<button id="room-reset" class="btn small">Reset room</button>') +
        // ----- Kamera (everything the camera can do, in one place) -----
        // It lived at the bottom of Room, under the portal and five sliders,
        // where nobody looking for "the camera" would think to scroll. The ids
        // are unchanged, so the wiring further down finds them here the same.
        pane('kamera',
          '<h4>Tracking</h4>' +
          '<div class="muted">Face and hand tracking run entirely on this device. Nothing is uploaded, and the tracking models are only downloaded when you turn one of these on.</div>' +
          // THE HONEST SENTENCE. These switches DO open the camera now — which
          // is what Colin asked for, and it is only defensible because being
          // TRACKED and being SEEN are no longer the same lease. The presence
          // is sent a picture only while the button by the message box is held.
          // Say both halves: the light will come on, and nothing leaves.
          '<div class="muted">Turning any of these on opens the camera, so its light will come on. Nothing is captured, sent or kept: each frame is read on this device and discarded. Your presence is only sent a camera image while you are holding the camera button by the message box.</div>' +
          tog('room-face', 'Head tracking', 'Moving your head shifts your view of the room, like looking through a window. Only the room moves; the interface stays in place. Depth sets how strong the effect is.') +
          '<label class="slider">Depth <input id="room-eye" type="range" min="0" max="1" step="0.05"></label>' +
          tog('room-hands', 'Hand tracking', 'Shows a marker for each finger you hold out. Sweep a finger over the orb to rotate it, or over text to scroll. Pinch to press, and keep the pinch closed to drag. Make a ring with your thumb and a finger and turn the back of your hand to the camera to change its form. With two hands, touching the same number of fingertips together sets that many colors, and moving open hands apart or together resizes it. The microphone and camera buttons cannot be pressed this way. Downloads about 7.5 MB the first time.') +
          tog('room-dwell', 'Hold to press', 'Holding a marker still on a control for just over half a second presses it. A ring shows the countdown. Pinching still works.') +
          tog('room-camview', 'Camera preview', 'Shows a small camera window with the tracked points drawn on it.') +
          '<div id="room-eye-note" class="muted"></div>' +
          '<h4>Share a camera between devices</h4>' +
          '<div class="muted">A device without a camera can use the camera of another device signed in to this account. Only hand positions are sent (about 20 KB per second), never video. Devices on the same network connect directly, which reduces lag.</div>' +
          '<label class="field"><input id="dev-name" type="text" placeholder="Device name" autocomplete="off" maxlength="32" /></label>' +
          '<div class="muted">Lend this device\'s camera to:</div>' +
          '<label class="field"><select id="lend-to">' +
            '<option value="">not lending</option>' +
          '</select></label>' +
          '<div id="lend-note" class="muted"></div>' +
          '<div class="muted">Use the camera of:</div>' +
          '<label class="field"><select id="borrow-from">' +
            '<option value="">not borrowing</option>' +
          '</select></label>' +
          '<div id="phone-note" class="muted"></div>') +
        // ----- Graphics (how smooth it runs; src/gfx.js holds the truth) -----
        // Its own tab, because it was the last thing in Room — below the
        // portal, five sliders and two camera sections, under a heading that
        // never said "graphics" or "smooth" — and the person who needs it is
        // the one whose screen is stuttering, looking for exactly those words.
        pane('graphics',
          '<div class="muted">Visual quality and performance. If the room stutters, choose Smooth. Changes apply immediately and are saved in this browser.</div>' +
          '<h4>Mode</h4>' +
          '<div id="gfx-modes" class="gfx-modes" role="radiogroup" aria-label="Graphics mode">' +
            GFX_MODES.map(([id, name, line]) =>
              '<button type="button" class="gfx-mode" role="radio" aria-checked="false" data-mode="' + id + '">' +
                '<span class="gfx-mode-dot" aria-hidden="true"></span>' +
                '<span class="gfx-mode-text"><span class="gfx-mode-name">' + name + '</span>' +
                '<span class="gfx-mode-line">' + line + '</span></span>' +
              '</button>').join('') +
          '</div>' +
          '<div id="gfx-readout" class="gfx-readout" aria-live="polite"></div>' +
          '<div id="gfx-note" class="muted"></div>' +
          '<h4>Fine-tune</h4>' +
          '<div class="muted">These override the mode above. Choosing a mode resets them.</div>' +
          '<div class="row"><span>Frame rate</span><select id="gfx-fps">' +
            '<option value="auto">Auto</option>' +
            '<option value="60">60 fps</option>' +
            '<option value="30">30 fps (steadiest)</option>' +
          '</select></div>' +
          '<div class="row"><span>Resolution</span><select id="gfx-scale">' +
            '<option value="auto">Auto</option>' +
            '<option value="1">Full</option>' +
            '<option value="0.75">75%</option>' +
            '<option value="0.5">50%</option>' +
          '</select></div>' +
          tog('gfx-glass', 'Glass', 'Frosted panels blur what is behind them.') +
          tog('gfx-glow', 'Orb glow', 'Soft light around the orb.') +
          tog('gfx-liquid', 'Flowing liquid', 'The liquid-metal icons move continuously. When off, they move only when touched.') +
          tog('gfx-motion', 'Full motion', 'Animated loops and transitions. When off, transitions are simple fades.', 'gfx-motion-label') +
          '<button id="gfx-fine-reset" class="btn small">Reset to the mode’s defaults</button>') +
        // ----- Controls (how the hands move the world) -----
        pane('controls',
          '<div class="muted">How you move around the world screen. These settings never move your society; it only travels when you press <em>lead them</em>.</div>' +
          tog('ctl-swap', 'Swap gestures', 'On: one finger pans, two fingers orbit, and the scroll wheel zooms. Off: one finger turns the view, two fingers (or a two-finger trackpad scroll) move you across the planet, and pinching zooms.') +
          tog('ctl-invert', 'Invert direction', 'On: the ground follows your fingers. Off: pushing two fingers away moves you forward, like scrolling a page.') +
          '<div class="muted">Arrow keys and WASD also move you. <em>Home</em> returns you to your society, and tapping the map travels there.</div>') +
        // ----- Shelf (hand the presence whole things) -----
        pane('shelf',
          '<div class="muted">Give your presence a text to keep, such as an article, a story or a letter. It can reread anything on its shelf, and it also saves texts it finds on its own. The shelf holds 24 items; the oldest are removed first.</div>' +
          '<div id="shelf-drop" class="drop">' +
            '<label class="field"><input id="shelf-title" type="text" placeholder="Title" autocomplete="off" /></label>' +
            '<label class="field"><input id="shelf-by" type="text" placeholder="Author (optional)" autocomplete="off" /></label>' +
            '<label class="field"><textarea id="shelf-text" rows="7" placeholder="Paste or type the text, or drop a file on this box"></textarea></label>' +
            '<div class="drop-hint">Drop a text file here, or <strong>choose one</strong> (.txt, .md, .json or other plain text).' +
              '<input id="shelf-file" type="file" accept=".txt,.md,.markdown,.json,.csv,.rtf,text/*" hidden /></div>' +
          '</div>' +
          '<div class="row"><button id="shelf-give" class="btn">Add to shelf</button></div>' +
          '<div id="shelf-status" class="muted"></div>' +
          '<h4>On the shelf</h4>' +
          '<div id="shelf-list" class="muted">…</div>') +
        // ----- THE INHERITANCE (founder only; hidden until /api/auth/me says so) -----
        // This exists because the first version was a command line that had to
        // sign in, and the one person allowed to run it is ALREADY signed in
        // right here. A password typed into a script to reach a session the
        // browser is already holding is a step that should not exist.
        pane('inherit',
          '<div class="muted">Imports the files kept by the original airden into your presence. Journal lines go into its journal, complete pieces onto its shelf, and its observations into its record. Everything imported is marked as inherited, and nothing it already has is replaced.</div>' +
          '<div class="row"><label class="btn" for="inh-files">Choose airden files…</label>' +
            '<input id="inh-files" type="file" accept=".json,application/json" multiple hidden /></div>' +
          '<div id="inh-picked" class="muted"></div>' +
          '<div class="row"><button id="inh-dry" class="btn" disabled>Preview import</button>' +
            '<button id="inh-go" class="btn" hidden>Import</button></div>' +
          '<div id="inh-report" class="muted"></div>') +
        // ----- API usage (populated on open from /api/usage) -----
        pane('usage',
          '<div class="muted">API spending through this site, estimated per model. Your provider\'s bill is the exact record.</div>' +
          '<div id="usage-panel" class="usage-panel muted">Sign in to see your usage.</div>') +
        // ----- Kommands: the whole grammar, READ FROM THE PARSER -----
        // Every word below is listed by kommandWords() out of the same tables
        // parseShape reads, so this page cannot describe a language the app does
        // not have. A hand-written list would be wrong the first time a word was
        // added, which is exactly how a lesson starts lying.
        pane('kommands', kommandPane()) +
      '</div>';
    // every dropdown in the sheet in y3k's glass (glass-select.js); each select
    // stays where it was, so everything below that reads or sets it is unchanged
    glassSelectAll(bodyEl);

    // The rail is the only way between panes, so the screen never scrolls past
    // a boundary the reader did not ask to cross.
    // A pane can ask to hear when it is shown (the Room's photographs of each
    // world are taken then, not on every open of Settings). Declared up here,
    // filled in further down: showPane runs before those sections are built.
    const onPaneShown = {};
    let shownPane = '';
    const showPane = (id) => {
      bodyEl.querySelectorAll('.set-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === id));
      bodyEl.querySelectorAll('.set-tab').forEach((t) => {
        const on = t.dataset.pane === id;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const sc = bodyEl.querySelector('.set-panes');
      if (sc) sc.scrollTop = 0;
      shownPane = id;
      onPaneShown[id]?.();
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
          now.textContent = 'Listening through the microphone';
          const line = music.heardLine();
          hears.textContent = line ? 'Hearing: ' + line : 'Hearing: nothing yet';
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
          ? 'Your presence hears: ' + (music.describeSound() || 'listening…')
          : 'Your presence cannot hear this source, only see its title.';
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
          if (st.hearing) { music.stopListening(); roomBtn.textContent = 'Use the microphone'; roomNote.textContent = ''; paint(); return; }
          roomBtn.disabled = true;
          roomNote.textContent = 'Requesting microphone access…';
          try {
            await music.listenToRoom();
            roomBtn.textContent = 'Stop listening';
            roomNote.textContent = 'Microphone on';
          } catch (e) {
            roomNote.textContent = e && e.message === 'unsupported'
              ? 'this browser will not share a microphone'
              : 'Microphone permission was refused.';
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
      // only a signed-in person has one to close, and the founder's is never
      // closed from here (the server refuses it)
      $('acct-close-wrap').hidden = !!d.user.founder;
      // an account opened through Google or Apple has no password here: it
      // confirms with its username (auth.mjs confirmIdentity)
      if (d.user.hasPassword === false) {
        $('acct-close-pw').type = 'text';
        $('acct-close-pw').placeholder = 'Type your username to confirm';
        $('acct-close-pw').autocomplete = 'off';
      }
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
          picked.textContent = 'airden_core.json is missing from these files. It holds the record, so include it.';
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
        dry.disabled = true; report.textContent = 'Reading your presence\u2019s record\u2026';
        let d; try { d = await post(true); } catch { d = { error: 'the request did not go through' }; }
        dry.disabled = false;
        if (!d || d.error) { report.textContent = (d && d.error) || 'something went wrong'; return; }
        if (d.skipped) { report.textContent = 'Already imported.'; go.hidden = true; return; }
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
        go.disabled = true; go.textContent = 'Importing\u2026';
        let d; try { d = await post(false); } catch { d = { error: 'the request did not go through' }; }
        go.disabled = false; go.textContent = 'Import';
        if (!d || !d.ok) {
          report.innerHTML = '<div class="warn">' + esc((d && d.error) || 'The import did not go through.') + '</div>'
            + '<div class="muted">Nothing was imported, so it can be run again.</div>';
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
          if (!inp.value.trim()) { st.textContent = 'Paste a 4irden view link.'; return; }
          if (!setPortalLink(inp.value)) {
            st.textContent = 'That is not a view link. View links contain /share/.';
            return;
          }
          inp.value = portalSrc(portalLink());
          st.textContent = 'Showing your garden. If it stays dark, the view may be turned off in 4irden.';
        });
        $('portal-clear').addEventListener('click', () => {
          setPortalLink(''); inp.value = ''; st.textContent = 'The portal opens 4irden again.';
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
          go.disabled = true; msg.textContent = 'Deleting…';
          try {
            const r = await fetch('/api/me/delete', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: pw.value, username: pw.value.trim() }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { msg.textContent = d.error || 'That did not work. Nothing was deleted.'; go.disabled = false; return; }
            msg.textContent = 'Account deleted.';
            setTimeout(() => location.reload(), 900);
          } catch {
            msg.textContent = 'Could not reach the server. Nothing was deleted.';
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
          if (!rows.length) { list.textContent = 'The shelf is empty.'; return; }
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
          status.textContent = 'That file is not plain text. Export a PDF or .docx as text first.';
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
        if (!title || !text) { status.textContent = 'Add a title and the text.'; return; }
        if (text.length > 250000) { status.textContent = 'Too long. A shelf item holds up to 250,000 characters.'; return; }
        give.disabled = true; status.textContent = 'Adding…';
        try {
          const r = await fetch('/api/shelf', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, by, text }),
          });
          const d = await r.json();
          if (d.error) { status.textContent = d.error; }
          else {
            status.textContent = 'Added to the shelf.';
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
    const roomDefaults = ROOM_DEFAULTS;
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
    // the eclipse: a switch, not a slider, in the same record as the sliders
    const eclEl = $('room-eclipse');
    if (eclEl) {
      eclEl.checked = Boolean(roomCfg.eclipse);
      eclEl.addEventListener('change', () => {
        roomCfg.eclipse = eclEl.checked;
        body.setRoom?.(roomCfg);
        try { localStorage.setItem('y3k.room', JSON.stringify(roomCfg)); } catch { /* full */ }
      });
    }
    // THE WINDOW's one dial. Kept out of roomCfg deliberately: it is not a
    // property of the room, it is a property of how this person wants to be
    // looked back at, and it survives changing environments.
    const eyeEl = $('room-eye'), eyeNote = $('room-eye-note');
    const faceEl = $('room-face'), handsEl = $('room-hands'), viewEl = $('room-camview');

    // HOLD STILL TO PRESS. Remembered here rather than in reach, which is a
    // bus and has no business with anybody's preferences.
    const dwellEl = $('room-dwell'), rch = window.Y3K && window.Y3K.reach;
    if (dwellEl && rch) {
      let want = rch.dwell();
      try { const v = localStorage.getItem('y3k.dwell'); if (v !== null) want = v === '1'; } catch { /* private */ }
      rch.dwell(want); dwellEl.checked = want;
      dwellEl.addEventListener('change', () => {
        rch.dwell(dwellEl.checked);
        try { localStorage.setItem('y3k.dwell', dwellEl.checked ? '1' : '0'); } catch { /* full */ }
      });
    }
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
          : !camOn ? 'The camera did not open. Your browser may have refused it; check the address bar.'
          : st.reduced ? 'Running. Reduced motion is on in your system settings, so movement is limited to a fifth of the depth setting.'
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
    // frame — a render, not a stored asset. NOT on opening Settings any more:
    // that built all eight skies, compiled each shader, rendered and read each
    // one back from the GPU and encoded a PNG, inside the click that opened the
    // sheet, so the first open of Settings was the longest freeze in the app.
    // Now the cards are plain until the Room tab is actually shown, and then
    // they fill in: one world per frame where the orb can do it that way
    // (envThumbnailsAsync), the old all-at-once render otherwise — deferred a
    // beat so the pane is on screen before it runs. Smooth skips them: a plain
    // card is the promise that mode makes.
    let envShots = {};
    let shotsAsked = false;
    const takeShots = () => {
      if (shotsAsked) return;
      const g = window.Y3K && window.Y3K.gfx;
      if (g?.profile?.().tier === 'smooth') return;   // asked again next time, if they leave Smooth
      shotsAsked = true;
      // Not the machine's fault, so not the meter's business. Released when the
      // photographs land, and after ten seconds whatever happens: a promise
      // that never settles must not blindfold the meter for the rest of the
      // page (releasing twice is harmless).
      const release = g?.hold?.('settings: photographing the worlds');
      const giveUp = release ? setTimeout(release, 10000) : 0;
      const took = (shots) => {
        clearTimeout(giveUp);
        release?.();
        envShots = Array.isArray(shots)
          ? Object.fromEntries(shots.filter((s) => s && s.id && s.url).map((s) => [s.id, s.url]))
          : (shots || {});
        if (Object.keys(envShots).length) paintPicker();
      };
      if (typeof body.envThumbnailsAsync === 'function') {
        body.envThumbnailsAsync(168).then(took, () => took({}));
      } else {
        setTimeout(() => {
          let shots = {};
          try { shots = body.envThumbnails?.(168) || {}; } catch { /* plain cards */ }
          took(shots);
        }, 80);
      }
    };
    onPaneShown.room = takeShots;
    const paintPicker = () => {
      picker.innerHTML = ENVIRONMENTS.map((e) =>
        `<button type="button" class="env-opt${e.id === roomCfg.env ? ' on' : ''}" data-env="${e.id}">` +
        (envShots[e.id] ? `<img class="env-shot" src="${envShots[e.id]}" alt="" draggable="false">` : '<span class="env-shot env-shot-none"></span>') +
        `<span class="env-name">${esc(e.name)}</span></button>`).join('');
      const roomOnly = $('room-only');
      if (roomOnly) roomOnly.hidden = roomCfg.env !== 'room';
    };
    paintPicker();
    // A room chosen from outside the sheet (a kommand) shows here as chosen.
    onRoomChanged = (cfg) => { roomCfg = cfg; paintPicker(); };
    picker.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-env]');
      if (!btn) return;
      roomCfg.env = btn.dataset.env;
      paintPicker();
      body.setRoom?.(roomCfg);
      try { localStorage.setItem('y3k.room', JSON.stringify(roomCfg)); } catch { /* full */ }
    });

    // CAMERAS BETWEEN YOUR OWN DEVICES. Two pickers over ONE list of the
    // account's other devices, because the two directions are the same
    // question asked from opposite ends: which of my screens is watching, and
    // which is reacting. Both are populated without anybody having to switch
    // anything on first — every signed-in device announces itself.
    const link = window.Y3K && window.Y3K.eye;
    const lender = window.Y3K && window.Y3K.lend;
    const lendEl = $('lend-to'), lendNote = $('lend-note');
    const borrowEl = $('borrow-from'), borrowNote = $('phone-note');
    const nameEl = $('dev-name');

    if (nameEl && window.Y3K?.deviceName) {
      nameEl.value = window.Y3K.deviceName();
      // Renamed on this device, stored on this device. Two identical phones
      // will always need a name typed by hand, and the guess is only ever a
      // starting point — see deviceName() for why navigator.platform was not.
      nameEl.addEventListener('change', () => { nameEl.value = window.Y3K.renameDevice(nameEl.value); });
    }

    if (link && lender && lendEl && borrowEl) {
      const fillOne = (el, list, keep) => {
        const had = el.value;
        const first = el.options[0].textContent;
        el.innerHTML = '';
        const none = document.createElement('option');
        none.value = ''; none.textContent = first; el.appendChild(none);
        for (const x of list) {
          const o = document.createElement('option');
          o.value = x.deviceId;
          o.textContent = x.label + (x.watching ? '' : ' (not open)');
          el.appendChild(o);
        }
        el.value = (keep && list.some((x) => x.deviceId === keep)) ? keep
          : (had && list.some((x) => x.deviceId === had)) ? had : '';
      };
      // THE SAME LIST IS NOT REBUILT. Every rebuild adds <option> elements, and
      // any element added anywhere under <body> wakes the liquid's border sweep
      // (a dozen document-wide queries and an extra GL pass). Rebuilt every
      // 2.5s regardless, that was a regular hitch for as long as the page
      // lived; now it is one when a device actually comes or goes.
      let lastScreens = '';
      const NONE = 'No other device of yours is signed in right now.';
      const fill = async () => {
        const r = await fetch('/api/remote/screens', { credentials: 'same-origin' })
          .then((x) => x.json()).catch(() => null);
        // NEVER OFFER THIS DEVICE ITSELF. It already has its own camera, and a
        // device feeding itself would round-trip its own hands through Oregon.
        const list = ((r && r.screens) || []).filter((x) => x.deviceId !== link.id);
        const key = list.map((x) => `${x.deviceId}\u0001${x.label}\u0001${x.watching ? 1 : 0}`).join('\u0002')
          + `\u0003${lender.to() || ''}\u0003${link.borrowing() || ''}`;
        if (key === lastScreens) return;
        lastScreens = key;
        fillOne(lendEl, list, lender.to());
        fillOne(borrowEl, list, link.borrowing());
        if (!list.length) {
          lendNote.textContent = NONE;
          borrowNote.textContent = '';
        } else if (lendNote.textContent === NONE) lendNote.textContent = ''; // one has come since
      };

      lendEl.addEventListener('change', () => {
        if (!lendEl.value) { lender.stop(); lendNote.textContent = ''; return; }
        lender.start(lendEl.value);
        // Sending a tracker's output while the tracker is off would post empty
        // frames forever, so turn the hands on through their OWN switch rather
        // than beside it — two switches that disagree is worse than one.
        if (handsEl && !handsEl.checked) { handsEl.checked = true; handsEl.dispatchEvent(new Event('change')); }
      });

      borrowEl.addEventListener('change', () => {
        if (!borrowEl.value) { link.release(); window.Y3K?.syncHands?.(); borrowNote.textContent = ''; return; }
        // Asking, not just listening: the other device is told to start. That
        // is what lets this be a choice you make on the screen that needs the
        // camera rather than on the one that has it.
        link.borrow(borrowEl.value);
        // The view draws when there is an EYE, and one just arrived.
        window.Y3K?.syncHands?.();
        if (handsEl && !handsEl.checked) { handsEl.checked = true; handsEl.dispatchEvent(new Event('change')); }
        borrowNote.textContent = 'Asking…';
      });

      // The far device turned us into a lender without us touching the picker.
      link.onLend((to) => { if (lendEl.value !== (to || '')) lendEl.value = to || ''; });

      const say = () => {
        const st = link.status(), ls = lender.status();
        lendNote.textContent = ls.err ? ls.err : ls.to ? `Lending. ${ls.sent} frames sent.` : lendNote.textContent;
        if (!st.from) return;
        borrowNote.textContent = !st.seeing
          ? 'Asked. Waiting for that device to start sending.'
          : st.hands
            ? `Seeing ${st.hands} hand${st.hands === 1 ? '' : 's'} ${st.via === 'direct' ? 'directly over the network' : 'through the server'}, ${st.frames} frames.`
            : `Receiving ${st.frames} frames, but no hands in them. Hold your hands up to the other device's camera.`;
      };
      link.onState(say);
      fill();
      // Only while someone can see it: Settings open, on the Kamera tab, in a
      // visible tab. It used to run from the first open of Settings to the end
      // of the page — a fetch and (see above) a rebuild every 2.5s behind a
      // closed sheet. Then these pickers moved from Room to Kamera and the
      // check stayed on Room, so the tab they are on never refreshed at all.
      // Showing the Kamera tab refreshes the list and the notes at once.
      const refreshScreens = () => { if (!lender.to() && !link.borrowing()) fill(); };
      onPaneShown.kamera = () => { say(); refreshScreens(); };
      setInterval(() => {
        if (modal.hidden || shownPane !== 'kamera' || document.hidden) return;
        say(); refreshScreens();
      }, 2500);
    }

    // HOW SMOOTH IT RUNS. The meter is the default and a choice overrides it in
    // both directions — someone on a fast machine who wants it light, and
    // someone on a slow one who would rather have the glass and put up with
    // it. The note says what the meter has decided, because a setting that
    // quietly does something else is worse than no setting; the readout says
    // what is actually running, in the three numbers that decide how it feels.
    const gfx = window.Y3K && window.Y3K.gfx;
    const modesEl = $('gfx-modes'), gfxNote = $('gfx-note'), readout = $('gfx-readout');
    const fpsSel = $('gfx-fps'), scaleSel = $('gfx-scale');
    const glassBox = $('gfx-glass'), glowBox = $('gfx-glow'), liquidBox = $('gfx-liquid'), motionBox = $('gfx-motion');
    const motionLabel = $('gfx-motion-label'), fineReset = $('gfx-fine-reset');
    if (gfx && gfx.setFine && modesEl) {
      const osReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      // What the chosen tier itself says for a field — which is what a switch
      // set back to match it should mean, so it tracks the tier again instead
      // of pinning a value the next mode would not have chosen.
      const own = (field) => PROFILES[gfx.tier()]?.[field];
      // What is running, in words and numbers. Kept apart from the controls
      // below because it is refreshed every second while the pane is open, and
      // re-setting a <select> the person has open under their pointer is not
      // a refresh, it is a fight.
      const paintStatus = () => {
        const p = gfx.profile();
        const st = gfx.state();
        const ps = paceStats();
        // The orb's OWN pixel ratio where it can be read: the profile is what
        // was asked for, and the orb may have settled on less (a pixel budget
        // on a big screen). The ask is the fallback, never the claim.
        const asked = Math.min(window.devicePixelRatio || 1, p.maxDpr) * p.scale;
        let dpr = asked;
        try { dpr = window.__y3kScene?.renderer?.getPixelRatio?.() || asked; } catch { /* the ask, then */ }
        readout.textContent = `${GFX_NAMES[p.tier]} · ${Math.round(ps.drawnFps)}fps · ${+dpr.toFixed(2)}×`;
        const last = st.last;
        const lately = last && last.p50 > 0
          ? ` Recent: ${Math.round(1000 / last.p50)} fps${last.late >= 0.05 ? `, ${Math.round(last.late * 100)}% of frames late` : ''}.`
          : '';
        gfxNote.textContent = st.forced ? 'Set by ?gfx= in the address bar for this visit only. Choose a mode to keep one.'
          : gfx.auto() ? `Automatic is using ${GFX_NAMES[p.tier]}.${lately}`
          : p.tier === 'smooth' ? `Smooth is fixed. If frames still arrive late, it drops to 30 fps, then to a lower resolution.${lately}`
          : `This mode is fixed and is not adjusted automatically.${lately}`;
      };
      const paintGfx = () => {
        const p = gfx.profile();
        const mode = gfx.mode();
        modesEl.querySelectorAll('.gfx-mode').forEach((b) =>
          b.setAttribute('aria-checked', b.dataset.mode === mode ? 'true' : 'false'));
        const f = gfx.fine();
        fpsSel.value = f.fps ? String(f.fps) : 'auto';
        scaleSel.value = f.scale ? String(f.scale) : 'auto';
        glassBox.checked = p.blur !== 'none';
        glowBox.checked = Boolean(p.bloom);
        liquidBox.checked = p.liquid === 'flow';
        motionBox.checked = p.motion === 'full';
        // The OS preference outranks this switch (gfx.js folds it in), so say
        // so rather than offer a switch that springs back.
        const osLess = osReduced();
        motionBox.disabled = osLess;
        motionLabel.textContent = osLess
          ? 'Reduced motion is on in your system settings, so this stays off.'
          : 'Animated loops and transitions. When off, transitions are simple fades.';
        fineReset.hidden = !Object.keys(f).length;
        paintStatus();
      };
      modesEl.addEventListener('click', (e) => {
        const b = e.target.closest('.gfx-mode');
        if (!b || (b.dataset.mode === gfx.mode() && !gfx.state().forced)) return;
        // A mode is a whole preset: choosing one starts the fine-tuning over,
        // in the same change, so the sinks see one switch and not two.
        gfx.set(b.dataset.mode === 'auto' ? null : b.dataset.mode, { fine: null });
        paintGfx();
      });
      // The arrows walk the list, as they do in any radio group — but they only
      // move the focus; Enter or Space chooses. A mode change restyles the
      // whole room (and can recompile the orb's shaders), so reading down the
      // list must not switch it five times on the way.
      modesEl.addEventListener('keydown', (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        const all = [...modesEl.querySelectorAll('.gfx-mode')];
        const i = all.indexOf(document.activeElement);
        if (!step || i < 0) return;
        e.preventDefault();
        all[(i + step + all.length) % all.length].focus();
      });
      const pin = (field, want) => { gfx.setFine({ [field]: want === own(field) ? null : want }); paintGfx(); };
      fpsSel.addEventListener('change', () => { gfx.setFine({ fps: fpsSel.value === 'auto' ? null : Number(fpsSel.value) }); paintGfx(); });
      scaleSel.addEventListener('change', () => { gfx.setFine({ scale: scaleSel.value === 'auto' ? null : Number(scaleSel.value) }); paintGfx(); });
      // Glass back on in a mode that has none gets the lighter glass (the
      // small panes), not everything: the heavy kind is a mode of its own.
      glassBox.addEventListener('change', () => {
        const mine = own('blur');
        pin('blur', glassBox.checked ? (mine !== 'none' ? mine : 'small') : 'none');
      });
      glowBox.addEventListener('change', () => pin('bloom', glowBox.checked));
      liquidBox.addEventListener('change', () => pin('liquid', liquidBox.checked ? 'flow' : 'still'));
      motionBox.addEventListener('change', () => pin('motion', motionBox.checked ? 'full' : 'less'));
      fineReset.addEventListener('click', () => { gfx.setFine(null); paintGfx(); });
      // The meter stepping down while the pane is open, and another tab
      // choosing a mode, both land here.
      gfx.onChange(() => paintGfx());
      onPaneShown.graphics = paintGfx;
      // The readout's frame rate is the pacer's estimate of the display, which
      // settles in the first second or two — refreshed while anyone is looking.
      setInterval(() => { if (!modal.hidden && shownPane === 'graphics' && !document.hidden) paintStatus(); }, 1000);
      paintGfx();
    } else if (modesEl) {
      for (const el of bodyEl.querySelectorAll('#gfx-modes button, [data-pane="graphics"] select, [data-pane="graphics"] input, #gfx-fine-reset')) el.disabled = true;
      gfxNote.textContent = 'The frame meter is not running in this window.';
    }

    $('room-reset').addEventListener('click', () => {
      roomCfg = { ...roomDefaults };
      for (const [k, id] of Object.entries(roomIds)) $(id).value = roomCfg[k];
      if (eclEl) eclEl.checked = false;
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

    // --- Brain: the chosen provider; for a key, detect whose it is and list its live models ---
    const keyEl = $('brain-key');
    const bStatus = $('brain-status');
    const modelRow = $('brain-model-row');
    const modelSel = $('brain-model');
    const clearBtn = $('brain-clear');

    // EVERY PROVIDER HAS A MODEL MENU, key or no key (Colin, 2026-10-08). With a
    // key it is the key's own live list; before one, every model the provider
    // has (src/models.js), and the choice waits for the key. Claude Code's is
    // what Claude Code offered this plan, else every Claude model. The site's
    // own key picks its own model, so it has none.
    const MODELS_PREF = 'y3k.brainModels';   // { provider: id } chosen before a key
    const prefModel = (p) => { try { return JSON.parse(localStorage.getItem(MODELS_PREF) || '{}')?.[p] || null; } catch { return null; } };
    const setPrefModel = (p, m) => {
      try { const a = JSON.parse(localStorage.getItem(MODELS_PREF) || '{}') || {}; a[p] = m; localStorage.setItem(MODELS_PREF, JSON.stringify(a)); } catch { /* private window */ }
    };
    let modelsSeq = 0, shownModels = [];
    function fillModels(list, value) {
      modelSel.innerHTML = '';
      const add = (m, first = false) => {
        const o = document.createElement('option');
        o.value = m.id; o.textContent = m.label || modelName(m.id);
        if (m.desc) o.dataset.desc = m.desc;
        if (first) modelSel.prepend(o); else modelSel.appendChild(o);
      };
      for (const m of list) add(m);
      if (value && !list.some((m) => m.id === value)) add({ id: value }, true);   // a model no list names any more stays chosen
      shownModels = list;
      modelSel.value = value && [...modelSel.options].some((o) => o.value === value) ? value : (list[0]?.id || '');
      modelRow.hidden = !modelSel.options.length;
    }
    async function showModels(v) {
      const seq = ++modelsSeq;
      if (!v || v === 'site') { modelRow.hidden = true; return; }
      const live = v === 'claude' ? await heardModels('claude').catch(() => null) : null;
      const list = await modelsFor(v, { live });
      if (seq !== modelsSeq || $('brain-provider').value !== v) return;
      fillModels(list, v === 'claude' ? (ownModel('claude') || 'default') : (keyFor(v)?.model || prefModel(v)));
    }
    // ONLY THE LATEST KEY IS ANSWERED. The lookup build() starts for the saved
    // key could land after Clear (or after a new key was typed) and save the
    // old key all over again, field empty and all. Every call takes a number,
    // Clear and an unrecognised key included, and a lookup that comes back to
    // find a newer number writes nothing, whether it succeeded or failed.
    let brainSeq = 0;
    async function applyKey(raw, preferModel) {
      const seq = ++brainSeq;
      const key = raw.trim();
      const v = $('brain-provider').value;
      if (!key) {
        setBrainConfig(null);
        bStatus.textContent = 'No key saved.';
        clearBtn.hidden = true; showModels(v); return;
      }
      clearBtn.hidden = false;
      const prov = detectProviderLocal(key);
      if (!prov) { bStatus.textContent = 'This is not an Anthropic, OpenAI or OpenRouter key.'; setBrainConfig(null); showModels(v); return; }
      bStatus.textContent = `${PROVIDER_LABEL[prov]} key. Loading models…`;
      try {
        const d = await fetch('/api/brain/models', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, provider: prov }),
        }).then((r) => r.json());
        if (seq !== brainSeq) return;
        if (!d.models || !d.models.length) {
          bStatus.textContent = d.error || 'No usable models for this key.';
          showModels(prov);
          if (preferModel) setBrainConfig({ provider: prov, key, model: preferModel }); else setBrainConfig(null);
          return;
        }
        modelsSeq += 1;   // the live list wins over a catalog still on its way
        const want = preferModel || prefModel(prov);
        fillModels(d.models, (want && d.models.some((m) => m.id === want)) ? want : pickDefaultModel(prov, d.models));
        bStatus.textContent = `Connected. Replies use ${PROVIDER_LABEL[prov]} (${modelName(modelSel.value, d.models)}).`;
        setBrainConfig({ provider: prov, key, model: modelSel.value });
      } catch {
        if (seq !== brainSeq) return;
        bStatus.textContent = 'Could not reach the model list.';
        showModels(prov);
        if (preferModel) setBrainConfig({ provider: prov, key, model: preferModel }); else setBrainConfig(null);
      }
    }

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

    // --- Brain: the provider list, and what the chosen one needs ---------------
    // Colin, 2026-10-07: "i'm signed in with y3kode but it still says sign in --
    // add a professional sign in claude code in the brain part of settings. if
    // you added other providers, add them all as a dropdown." What is in use
    // follows the list: Claude Code opens the stream through y3kode (main.js
    // syncOwnBrain), a key provider makes its kept key the one in use.
    {
      const provSel = $('brain-provider'), what = $('brain-what');
      const ccSec = $('cc-sec'), keySec = $('key-sec');
      const KEY_PROVIDERS = [
        ['anthropic', 'Anthropic', 'API key from console.anthropic.com'],
        ['openai', 'OpenAI', 'API key from platform.openai.com'],
        ['openrouter', 'OpenRouter', 'One API key for models from many providers'],
      ];
      const PICK = 'y3k.brainPick';   // the provider last chosen here, so the list reopens on it
      const isKey = (v) => KEY_PROVIDERS.some(([id]) => id === v);
      const nameOf = (v) => KEY_PROVIDERS.find(([id]) => id === v)?.[1] || '';
      let founder = false, site = false;

      function fill() {
        provSel.innerHTML = '';
        const add = (v, label, desc) => { const o = document.createElement('option'); o.value = v; o.textContent = label; o.dataset.desc = desc; provSel.appendChild(o); };
        if (founder) add('claude', 'Claude Code', 'Your Claude plan, through y3kode on this computer');
        for (const [id, name, d] of KEY_PROVIDERS) add(id, name, d);
        if (site) add('site', 'Site default', 'The site’s own key, within a daily limit');
      }
      // what is in use now: a key in use, else Claude Code when it is the
      // choice (or the founder's default), else the last pick
      function current() {
        const k = getBrainConfig();
        if (k?.provider && isKey(k.provider)) return k.provider;
        if (founder && ownChoiceFor(founder, false)) return 'claude';
        let pick = null;
        try { pick = localStorage.getItem(PICK); } catch { /* private window */ }
        if (pick && [...provSel.options].some((o) => o.value === pick && o.value !== 'claude')) return pick;
        return site ? 'site' : 'anthropic';
      }
      function paint() {
        const v = provSel.value;
        ccSec.hidden = v !== 'claude';
        keySec.hidden = !isKey(v);
        what.textContent = v === 'claude'
          ? 'Replies use your Claude plan through y3kode on this computer. Claude Code runs with no tools and cannot read your files. Available to the site owner only for now.'
          : isKey(v) ? `Your ${nameOf(v)} key is stored in this browser only. It is sent to ${nameOf(v)} through this site with each request and is never saved on the server.`
          : v === 'site' ? 'Replies use the site’s own key, within a daily limit.' : '';
        keyEl.placeholder = isKey(v) ? `${nameOf(v)} API key` : 'API key';
        if (!isKey(v)) showModels(v);   // a key provider's menu comes with its key (applyKey)
      }
      function loadKey(v) {
        const k = keyFor(v);
        keyEl.value = k?.key || '';
        applyKey(keyEl.value, k?.model);    // none kept: nothing in use, "No key saved."
      }
      function choose(v) {
        try { localStorage.setItem(PICK, v); } catch { /* private window */ }
        setOwnChoice({ provider: v === 'claude' ? 'claude' : 'none' });
        if (isKey(v)) loadKey(v);
        else { brainSeq += 1; setBrainConfig(null); }   // a kept key stays kept (brain.js keyFor)
        paint();
        window.dispatchEvent(new Event('y3k:own-brain'));   // main.js opens or closes the stream
        checkOwnBrain();
        if (v === 'claude') refreshCard(true);
      }
      provSel.addEventListener('change', () => choose(provSel.value));

      // a key says whose it is: the list follows it
      let keyTimer;
      keyEl.addEventListener('input', () => {
        clearTimeout(keyTimer);
        keyTimer = setTimeout(() => {
          const prov = detectProviderLocal(keyEl.value.trim());
          if (prov && prov !== provSel.value && isKey(prov)) {
            provSel.value = prov; paint();
            try { localStorage.setItem(PICK, prov); } catch { /* private window */ }
          }
          applyKey(keyEl.value);
        }, 500);
      });
      modelSel.addEventListener('change', () => {
        const v = provSel.value, m = modelSel.value;
        if (v === 'claude') { setOwnModel('claude', m); return; }
        if (!isKey(v)) return;
        setPrefModel(v, m);
        const key = keyEl.value.trim();
        if (key && detectProviderLocal(key) === v) {
          setBrainConfig({ provider: v, key, model: m });
          bStatus.textContent = `Replies use ${PROVIDER_LABEL[v] || ''} (${modelName(m, shownModels)}).`;
        }
      });
      clearBtn.addEventListener('click', () => { forgetKey(provSel.value); keyEl.value = ''; applyKey(''); });

      // CLAUDE CODE, as y3kode sees it on this computer, and the one thing to
      // do next: open y3kode, update it, install Claude Code, or sign in.
      const pill = $('cc-pill'), line = $('cc-line'), act = $('cc-act'), cmdBox = $('cc-cmd'), cmdText = $('cc-cmd-text');
      const PILL = { checking: 'Checking', connected: 'Connected', connecting: 'Signed in', 'signed-out': 'Not signed in',
        'not-installed': 'Not installed', offline: 'Not running', unpaired: 'Not connected', old: 'Update needed', updating: 'Updating', error: 'Not responding' };
      let actFn = null, cardSeq = 0;
      // While an update runs, nothing else redraws the card: the question on
      // the computer can take a while, and the answer still has to land here.
      let updating = false;
      function card(state, text, action = null, command = null) {
        pill.textContent = PILL[state] || state;
        pill.dataset.state = state;
        line.textContent = text;
        act.hidden = !action; actFn = action ? action[1] : null;
        if (action) act.textContent = action[0];
        cmdBox.hidden = !command;
        if (command) cmdText.textContent = command;
      }
      const openKode = () => { close(); document.getElementById('nav-code')?.click(); };
      async function refreshCard(fresh = false) {
        if (provSel.value !== 'claude' || modal.hidden || updating) return;
        const seq = ++cardSeq;
        // "Checking" when asked to, or before anything is shown: a background
        // re-read (y3kode's state reported every probe) redraws only if it changed
        if (fresh || !pill.dataset.state) card('checking', 'Checking Claude Code on this computer…');
        const s = await claudeCodeStatus({ fresh });
        if (seq !== cardSeq) return;
        if (s.reach === 'offline') return card('offline', 'y3kode is not running on this computer. Open the y3kode app, or set it up from kode.', ['Open kode', openKode]);
        if (s.reach === 'unpaired') return card('unpaired', 'This browser is not connected to y3kode. Open kode once to connect it.', ['Open kode', openKode]);
        if (s.reach === 'old') return oldCard(s, seq);
        if (s.installed === false || s.auth === 'not-installed') return card('not-installed', 'Claude Code is not installed on this computer.', ['Install Claude Code', install]);
        if (s.auth === 'signed-out' || s.auth === 'needs-key') return card('signed-out', 'Claude Code is installed but not signed in. Run this in a terminal, type /login and sign in, then check again.', null, s.loginCommand || 'claude');
        const st = ownState();
        if (st.state === 'ready') return card('connected', 'Your presence replies through your Claude plan.');
        if (st.state === 'error') return card('error', st.why || 'y3kode did not answer.');
        return card('connecting', 'Signed in. Connecting…');
      }
      // AN OLDER y3kode. One that can update itself is asked to, and asks on
      // this computer before it downloads anything (y3k-code/update.mjs). One
      // from before that is replaced by hand: the newest app on the desktop,
      // the setup command again in a terminal.
      const desktop = () => typeof window.y3kCode?.cmd === 'function';
      const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);
      async function oldCard(s, seq) {
        const was = `This version of y3kode${s.version ? ` (${s.version})` : ''} cannot connect Claude Code here`;
        if (s.canUpdate) return card('old', `${was}. Update it to the newest version.`, ['Update y3kode', update]);
        const setup = await siteSetup();
        if (seq !== cardSeq) return;
        if (desktop()) {
          const url = https(pickBuild(setup?.builds, await detectPlatform())?.url) || https(setup?.appUrl);
          if (seq !== cardSeq) return;
          if (url) return card('old', `${was}, and it is too old to update itself. Download the newest y3k app and install it over this one.`, ['Download y3k', () => window.open(url, '_blank', 'noopener')]);
          return card('old', `${was}, and it is too old to update itself. Install the newest y3k app over this one.`);
        }
        if (setup?.command) return card('old', `${was}, and it is too old to update itself. Stop it with Ctrl+C in its terminal, then run this command.`, null, setup.command);
        return card('old', `${was}, and it is too old to update itself. Start the newest version from kode.`, ['Open kode', openKode]);
      }
      async function update() {
        if (updating) return;
        updating = true; $('cc-check').hidden = true;
        let again = false;
        try { again = await runUpdate(); } finally { updating = false; $('cc-check').hidden = false; }
        if (again) refreshCard(true);
      }
      // → true when the card should look again
      async function runUpdate() {
        const port = !desktop() && savedPairing()?.port;
        card('updating', 'Allow the update on this computer.', port ? ['Open approval window', () => window.open(`http://127.0.0.1:${port}/approve`, '_blank', 'noopener')] : null);
        const r = await updateY3kode();
        if (r?.ok && r.restarting) {
          card('updating', `Restarting y3kode ${r.version}.`);
          if (!(await waitForVersion(r.version))) { card('offline', 'y3kode did not start again after the update. Open it again, then check again.', ['Open kode', openKode]); return false; }
          lookAgain();
          return true;
        }
        if (r?.ok && r.current) { card('old', `This is the newest y3kode the site has (${r.version}), and it cannot connect Claude Code.`); return false; }
        if (r?.code === 'offline' || r?.code === 'unpaired') return true;
        card('old', r?.error || 'The update did not finish.', ['Update y3kode', update]);
        return false;
      }
      async function install() {
        card('checking', 'Installing Claude Code. Confirm the install on your computer.');
        const r = await installClaudeCode();
        if (!r?.ok && r?.command) { card('not-installed', 'Install Claude Code by running this in a terminal, then check again.', null, r.command); return; }
        refreshCard(true);
      }
      act.addEventListener('click', () => actFn?.());
      $('cc-check').addEventListener('click', () => { lookAgain(); refreshCard(true); });
      $('cc-copy').addEventListener('click', async () => {
        const b = $('cc-copy');
        try { await navigator.clipboard.writeText(cmdText.textContent); b.textContent = 'Copied'; }
        catch { b.textContent = 'Select and copy'; }
        setTimeout(() => { b.textContent = 'Copy'; }, 1600);
      });
      window.addEventListener('y3k:own-brain-state', () => refreshCard());
      onPaneShown.brain = () => refreshCard();

      // first the list without knowing who you are; then again once the site says
      fill(); provSel.value = current(); paint();
      if (isKey(provSel.value)) loadKey(provSel.value);
      Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        hasServerBrain().catch(() => false),
      ]).then(([me, sb]) => {
        founder = !!me?.user?.founder; site = !!sb;
        const was = provSel.value;
        fill(); provSel.value = current(); paint();
        if (provSel.value !== was && isKey(provSel.value)) loadKey(provSel.value);
        if (provSel.value === 'claude') refreshCard();
      });
    }

    // --- Voice: a service, its key, its model, its voices ---
    $('voice-design-btn').addEventListener('click', onDesign); // design-sec is unclickable until a key resolves
    const providerSel = $('voice-provider');
    const voiceKeyEl = $('voice-key');
    const vModelRow = $('voice-model-row');
    const vModelSel = $('voice-model');
    let vModelFor = browsing;   // the service whose models the select holds
    let listSeq = 0;

    // Your own voices at the top; the service's stock voices in a Default
    // drawer below them — closed, unless there are none of your own to show.
    async function loadVoiceList() {
      const p = browsing;
      const svc = VOICE_SERVICES[p];
      const seq = ++listSeq;
      const list = $('voice-list');
      const status = $('voice-status');
      $('design-sec').hidden = p !== 'elevenlabs';
      let data = { available: false, voices: [] };
      try { data = await fetch('/api/voice/list?provider=' + p, { headers: voiceKeyHeader(p) }).then((r) => r.json()); } catch { data = { available: false, voices: [], error: 'unreachable' }; }
      if (seq !== listSeq) return; // the service or key changed while this was loading
      list.innerHTML = '';
      list.appendChild(voiceRow({ id: 'browser', name: 'Browser voice (free)' }, p));
      listOnHouse = !!(data.available && data.house);
      syncHouseVoice();
      if (!data.available) {
        status.innerHTML = data.error === 'unreachable' ? esc(svc.name) + ' is not responding.'
          : data.error ? esc(svc.name) + ' did not accept that key.'
          : p === 'elevenlabs' ? 'Add an <code>ElevenLabs</code> key above to use its voices and voice design.'
          : 'Add an <code>' + esc(svc.name) + '</code> key above to use its voices.';
        $('design-sec').classList.add('disabled');
        vModelRow.hidden = true;
        syncDelivery();
        return;
      }
      const a = getActive();
      const elsewhere = a.voiceId !== 'browser' && a.provider !== p && a.voiceName ? ` Current voice: ${a.voiceName} (${VOICE_SERVICES[a.provider].name}).` : '';
      status.textContent = (p === 'elevenlabs' ? 'Choose a voice, or design one below.' : 'Choose a voice.') + elsewhere;
      $('design-sec').classList.remove('disabled');

      modelsSeen[p] = data.models || [];
      vModelFor = p;
      vModelSel.innerHTML = '';
      for (const m of modelsSeen[p]) {
        const o = document.createElement('option');
        o.value = m.id; o.textContent = m.name + (m.note ? ' — ' + m.note : '');
        vModelSel.appendChild(o);
      }
      vModelSel.value = modelsSeen[p].some((m) => m.id === a.models[p]) ? a.models[p] : (modelsSeen[p][0]?.id || '');
      vModelRow.hidden = !modelsSeen[p].length;

      const own = data.voices.filter((v) => v.own);
      const stock = data.voices.filter((v) => !v.own);
      for (const v of own) list.appendChild(voiceRow(v, p));
      if (stock.length) {
        const box = document.createElement('details');
        box.className = 'voice-defaults';
        box.open = !own.length;
        box.innerHTML = '<summary><span class="vname">Default</span><span class="vmeta"></span></summary><div class="voice-list"></div>';
        const inner = box.querySelector('.voice-list');
        for (const v of stock) inner.appendChild(voiceRow(v, p));
        list.appendChild(box);
      }
      syncDefaultsSummary();
      syncDelivery();
    }

    const showService = () => {
      providerSel.value = browsing;
      voiceKeyEl.value = getVoiceKey(browsing);
      voiceKeyEl.placeholder = VOICE_SERVICES[browsing].hint;
    };
    let vkTimer = null;
    voiceKeyEl.addEventListener('input', () => {
      clearTimeout(vkTimer);
      vkTimer = setTimeout(() => { vkTimer = null; setVoiceKey(voiceKeyEl.value.trim(), browsing); loadVoiceList(); }, 500);
    });
    providerSel.addEventListener('change', () => {
      // A key pasted a moment ago may still be waiting out its half second.
      // Saved when the timer fired, it went under the new service with the
      // new service's key, already in the field by then, and the pasted one
      // was lost. It is saved now, under the service it was pasted for.
      const prev = browsing;
      if (vkTimer) { clearTimeout(vkTimer); vkTimer = null; setVoiceKey(voiceKeyEl.value.trim(), prev); }
      browsing = serviceOf(providerSel.value); showService(); loadVoiceList();
    });
    vModelSel.addEventListener('change', () => {
      const a = getActive();
      a.models = { ...a.models, [vModelFor]: vModelSel.value };
      setActive(a);
      syncDelivery();
    });

    showService();
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
    syncDefaultsSummary();
    syncDelivery();
  }

  function open() {
    modal.hidden = false;
    if (!built) {
      // The first open builds the whole sheet (and the liquid rings every field
      // in it). A one-off, and not the machine's fault: the frame meter is told
      // to look away until it has landed, so it does not step a machine down
      // for having opened Settings.
      const release = window.Y3K?.gfx?.hold?.('settings: building');
      build(); built = true;
      setTimeout(() => release?.(), 1500);
    } else { syncFromState(); }
    refreshUsage();
  }

  // --- The API usage panel: lifetime, today, recent days, models by cost -----
  const money = (n) => '$' + (Number(n) || 0).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');
  const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n | 0));
  async function refreshUsage() {
    const el = $('usage-panel');
    if (!el) return;
    let v, h = null;
    try {
      const r = await fetch('/api/usage').then((x) => x.json());
      v = r.usage;
      h = r.house || null;
    } catch { /* fall through */ }
    house = h;
    syncHouseVoice();
    if (!v) { el.textContent = 'Sign in to see your usage.'; return; }
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
    // What is left of today on the site's own keys. Everyone but the founder
    // has an allowance there, counted on the server and shown nowhere until now.
    const resting = (x) => (x.siteResting ? ' · resting for everyone until UTC midnight' : '');
    const site = h && !h.founder && h.brain && h.voice
      ? `<div class="usage-line"><span class="usage-k">site brain</span> ${money(h.brain.spentUsd)} of ${money(h.brain.capUsd)} today${resting(h.brain)}</div>` +
        `<div class="usage-line"><span class="usage-k">site voice</span> ${chars(h.voice.usedChars)} of ${chars(h.voice.capChars)} characters today${resting(h.voice)}</div>` +
        '<div class="muted">The site\'s own keys, for when you have none of yours. Both reset at UTC midnight.</div>'
      : '';
    el.innerHTML =
      `<div class="usage-line"><span class="usage-k">today</span> ${line(v.today)}</div>` +
      `<div class="usage-line"><span class="usage-k">lifetime</span> ${line(v.lifetime)}</div>` +
      site +
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

  // A room from outside the sheet — a kommand like background/snowy taiga —
  // lands exactly as picking it in the Room pane would, and stays.
  function setRoom(patch) {
    const cfg = { ...loadRoom(), ...patch };
    body.setRoom?.(cfg);
    try { localStorage.setItem('y3k.room', JSON.stringify(cfg)); } catch { /* full */ }
    onRoomChanged?.(cfg);
  }

  return { open, close, getActive, speakWith, setRoom };
}
