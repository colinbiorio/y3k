// Wiring. Turns input (voice or text) into a brain reply, then drives the body
// and the voice together so shape, color, and words land as one gesture.

import { createBody } from './body.js';
import { createVoice } from './voice.js';
import { createCamera } from './camera.js';
import { createSettings } from './settings.js';
import { respondStream, openingStream, hasServerBrain, getBrainConfig, resetHistory } from './brain.js';
import { createSocial } from './social.js';
import { createTend } from './tend.js';
import { createReader } from './reader.js';
import { scrubTags } from './tags.mjs';

const $ = (id) => document.getElementById(id);

const body = createBody($('stage'));
// Single autonomous mode: Y3K alone drives its posture and color. We set a calm
// resting state; it reshapes and repaints itself with every reply. The backdrop is
// the fixed metal room — there is no visitor-set background.
body.setScheme('stardust'); // resting state: near-white, flecked with color
body.setForm('orb');

// --- Entrance overlay + accounts. Create an account or sign in (real backend:
// scrypt + signed-cookie sessions), or step in as a guest. A returning session is
// recognized on load and greeted by name; the card then dissolves to the app.
const loginEl = $('login');
const loginForm = $('login-form');
const loginErr = $('login-error');
let account = null; // { username, email, founder } once signed in, else null (guest)

function enterApp() {
  if (!loginEl || loginEl.classList.contains('gone')) return;
  // The orb flares to greet you, then eases back to calm as the card clears.
  body.setMood('excited');
  body.setAudioLevel(1);
  body.setSpeaking(true);
  // The flare eases off, then the platform opens: the LOBBY of presences, not
  // a single room. A presence's opening moment fires when its host steps in.
  setTimeout(() => {
    body.setSpeaking(false); body.setAudioLevel(0); body.setMood('calm');
    showLobby();
  }, 1000);
  loginEl.classList.add('gone');           // card zooms through + blurs away; the light blooms
  document.body.classList.remove('gated'); // app chrome fades in
  setTimeout(() => { loginEl.style.display = 'none'; }, 1300);
}

function showLoginError(msg) { if (loginErr) { loginErr.textContent = msg || ''; loginErr.hidden = !msg; } }

// Toggle between creating an account and signing in.
function setAuthMode(mode) {
  if (!loginForm) return;
  loginForm.dataset.mode = mode;
  const signin = mode === 'signin';
  $('login-tag').textContent = 'who are you?'; // fits both — identify yourself, or become someone
  const email = $('login-email');
  email.type = signin ? 'text' : 'email';
  email.placeholder = signin ? 'email or username' : 'email';
  email.autocomplete = signin ? 'username' : 'email';
  $('login-pass').autocomplete = signin ? 'current-password' : 'new-password';
  $('login-toggle').textContent = signin ? 'new here? create an account' : 'have an account? sign in';
  showLoginError('');
}
setAuthMode('signin'); // default to the one-line "email or username" sign-in
$('login-toggle')?.addEventListener('click', () =>
  setAuthMode(loginForm.dataset.mode === 'signin' ? 'signup' : 'signin'));

let authBusy = false;
async function submitAuth() {
  if (authBusy || !loginForm) return;
  const mode = loginForm.dataset.mode;
  const id = $('login-email').value.trim();
  const username = $('login-user').value.trim();
  const password = $('login-pass').value;
  showLoginError('');
  if (!id || !password || (mode === 'signup' && !username)) { showLoginError('Fill in every field.'); return; }
  authBusy = true;
  try {
    const url = mode === 'signin' ? '/api/auth/login' : '/api/auth/signup';
    const payload = mode === 'signin' ? { identifier: id, password } : { email: id, username, password };
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { showLoginError(data.error || 'Something went wrong. Try again.'); authBusy = false; return; }
    account = data.user;
    const univi = loginForm.querySelector('.univi');
    if (univi) univi.classList.add('bloom');
    setTimeout(enterApp, 480);
  } catch { showLoginError('Could not reach the server.'); authBusy = false; }
}
loginForm?.addEventListener('submit', (e) => { e.preventDefault(); submitAuth(); });
$('login-skip')?.addEventListener('click', () => enterApp()); // guest — no account

// Recognize a returning session: skip the card — orion's opening line (which
// knows who they are, and remembers) does the greeting.
fetch('/api/auth/me').then((r) => r.json()).then((d) => {
  if (d && d.user) { account = d.user; enterApp(); }
}).catch(() => { /* offline / no session — leave the entrance up */ });

const camera = createCamera($('cam'));
const voice = createVoice({
  onListeningChange: (on) => {
    $('mic').classList.toggle('active', on);
    if (on) body.setMood('listening');
    setMoodTag(on ? 'listening' : (busy ? 'thinking' : currentMood));
  },
  onLevel: (v) => body.setAudioLevel(v),
  onTranscript: ({ text, final }) => {
    showCaption(text, 'you');
    if (final && text) handle(text);
  },
});

const settings = createSettings(body);

let currentMood = 'calm';
let busy = false;
let queuedText = null; // one line typed while a turn was running — answered next

// --- rooms and the lobby -----------------------------------------------------
// room = null in the lobby; { presence, mode: 'host' | 'view' } inside a room.
// roomGen invalidates in-flight async work (opening timers, landing turns) the
// moment the visitor leaves a room — a stale turn must never publish into a
// re-entered stream or clobber the lobby state.
let room = null;
let roomGen = 0;
let openingTimer = 0;
const reader = createReader();
const social = createSocial({
  body,
  showCaption: (t, w) => showCaption(t, w),
  getAccount: () => account,
  onEnterRoom: (p) => enterRoom(p),
  reader,
});
const tend = createTend({
  body,
  social,
  showCaption: (t, w) => showCaption(t, w),
  getRoom: () => room,
  reader,
  getBusy: () => busy,
  // When a tend session releases the gate, answer anything the host typed while
  // it was reading (same flush the chat path does in runReply's finish).
  setBusy: (v) => { busy = v; if (!v && queuedText) { const t = queuedText; queuedText = null; handle(t); } },
  getGen: () => roomGen,
});

function setMoodTag(name) {
  $('mood-tag').textContent = (room ? room.presence.handle : 'orion') + ' | ' + name;
}

function showLobby() {
  if (room) leaveRoom();
  document.body.classList.add('in-lobby');
  social.enterLobby();
}

function enterRoom(p) {
  social.leaveLobby();
  document.body.classList.remove('in-lobby');
  room = { presence: p, mode: p.mine ? 'host' : 'view' };
  resetHistory(); // each room is its own conversation
  social.setRoomHandle(p.handle);
  body.setForm('orb');
  body.setMood('calm');
  body.setScheme(p.scheme);
  setMoodTag('calm');
  if (room.mode === 'host') {
    document.body.classList.remove('viewing');
    document.body.classList.add('host-room'); // shows the tend panel
    tend.refreshBudget();
    // NOT live yet: the glow means "this AI is awake", so hosting starts only
    // after the first REAL brain turn lands (see openingMoment) — a dead key
    // must never stream canned placeholder lines as the presence.
    openingDone = false;
    openingTimer = setTimeout(openingMoment, 600); // the presence notices its host arrive
  } else {
    document.body.classList.add('viewing');
    document.body.classList.toggle('streaming', !!p.live);
    const ci = $('comment-input');
    ci.disabled = !account;
    ci.placeholder = account ? 'say something…' : 'sign in to talk';
    if (p.live) {
      social.watch(p, { onOffline: () => { document.body.classList.remove('streaming'); showCaption(`${p.name} has gone quiet.`, 'y3k'); } });
    } else {
      showCaption(`${p.name} is resting — not live right now.`, 'y3k');
    }
  }
}

function leaveRoom() {
  if (!room) return;
  roomGen += 1;               // invalidate every in-flight turn/timer for this room
  clearTimeout(openingTimer);
  queuedText = null;          // a line typed for one room shouldn't fire in another
  if (room.mode === 'host') social.stopHosting(room.presence.handle);
  tend.stop(); // a read loop must not keep spending into an empty room
  social.stopWatching();
  reader.clear();
  document.body.classList.remove('viewing', 'streaming', 'host-room', 'reading');
  room = null;
  resetHistory();
  body.setScheme('stardust'); // the lobby orb rests neutral
  body.setMood('calm');
}

$('back-to-lobby').addEventListener('click', showLobby);
window.addEventListener('beforeunload', () => { if (room?.mode === 'host') social.stopHosting(room.presence.handle); });

let captionTimer = 0;
function showCaption(text, who) {
  const el = $('caption');
  el.innerHTML = who === 'you' ? `<span class="you">you</span>${escapeHtml(text)}` : escapeHtml(text);
  el.classList.add('show');
  clearTimeout(captionTimer);
  // Y3K's own lines linger; live transcripts get replaced as you speak.
  if (who !== 'you') captionTimer = setTimeout(() => el.classList.remove('show'), 6000);
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Shared reply pipeline: drives mood, body, captions, and the speaker through
// one of orion's turns — whether the visitor prompted it (handle) or orion is
// speaking first, unprompted (openingMoment). onSettled fires exactly once when
// the turn has fully landed (speech done, UI back to calm).
async function runReply(streamCall, onSettled) {
  busy = true;
  body.setMood('thinking');
  setMoodTag('thinking');

  let finished = false;
  let watchdog = 0;
  const finish = () => {
    if (finished) return; // idempotent — late/double end callbacks are harmless
    finished = true;
    clearTimeout(watchdog);
    body.setSpeaking(false);
    body.setAudioLevel(0);
    body.setMood('calm');
    setMoodTag('calm');
    currentMood = 'calm';
    busy = false;
    onSettled?.();
    // Answer anything the visitor typed while this turn was running.
    if (queuedText) { const t = queuedText; queuedText = null; handle(t); }
  };

  const active = settings.getActive();
  // The speaker voices each sentence the moment it's complete — Y3K talks while
  // the rest of the reply is still generating. EL drives the body via onLevel;
  // the browser voice uses the synthetic speaking pulse.
  const speaker = voice.speaker({
    voiceId: active.voiceId,
    settings: active.settings,
    onStart: () => body.setSpeaking(true), // baseline pulse; EL also drives amplitude via onLevel
    onLevel: (v) => body.setAudioLevel(v),
    onEnd: finish,
  });

  // Hand complete sentences to the speaker as they stream; buffer the rest.
  // Every spoken chunk is scrubbed of control tags as a final guard — the server
  // already strips the lead, so this only catches any tag (second, inline, or a
  // partial the stream missed) that would otherwise be read aloud.
  let captionText = '';
  let pending = '';
  let gotStream = false;
  const pushSpeak = (s) => { const t = scrubTags(s); if (t) speaker.push(t); };
  const flush = (final) => {
    if (final) { if (pending.trim()) pushSpeak(pending); pending = ''; return; }
    // Flush everything up to the LAST sentence boundary as one chunk — keeps
    // abbreviations ("Mr.") natural and avoids speaking tiny fragments alone.
    let cut = 0; const re = /[.!?]["')\]]?\s/g;
    while (re.exec(pending) !== null) cut = re.lastIndex;
    if (cut >= 14) { pushSpeak(pending.slice(0, cut)); pending = pending.slice(cut); }
  };

  let result;
  try {
    result = await streamCall({
      onMood: (m) => { currentMood = m; body.setMood(m); setMoodTag(m); },
      onForm: (f) => body.setForm(f),
      onScheme: (s) => body.setScheme(s),
      onPaint: (anchors) => body.paintColors(anchors),
      onText: (t) => { gotStream = true; captionText += t; showCaption(scrubTags(captionText), 'y3k'); pending += t; flush(false); },
    });
  } catch { result = null; } // a failed turn still settles the UI below
  const { mood = 'calm', speech = '', form = null, scheme = null, paint = null } = result || {};

  currentMood = mood;
  body.setMood(mood);
  setMoodTag(mood);
  if (form) body.setForm(form);            // settle on Y3K's chosen posture
  if (scheme) body.setScheme(scheme);      // ...its chosen palette
  if (paint) body.paintColors(paint);      // ...or the colors it painted
  if (speech) showCaption(speech, 'y3k');

  if (gotStream) flush(true);              // speak the trailing partial sentence
  else if (speech) pushSpeak(speech);      // non-stream / local-brain fallback: speak the whole reply
  speaker.end();

  // Safety net: never strand the UI on busy if speech callbacks never fire.
  watchdog = setTimeout(finish, Math.max(15000, speech.length * 220));
  // Carry the placeholder markers through — goLiveAndPublish gates on them.
  return { mood, speech, form, scheme, paint, seeded: result?.seeded, local: result?.local };
}

// The glow means "this AI is awake": hosting goes on air only once a REAL brain
// turn lands (never seeded/local placeholder lines), and a turn that resolves
// after the visitor left the room (roomGen moved) publishes nothing.
function goLiveAndPublish(gen, hosting, r) {
  if (roomGen !== gen || !hosting || !r?.speech) return;
  if (r.seeded || r.local) return; // placeholder lines never go on air
  if (!social.isHosting()) { social.startHosting(hosting); document.body.classList.add('streaming'); }
  social.publishTurn(hosting, r);
}

async function handle(text) {
  if (busy) return;
  // If the camera is on, let Y3K see this moment too. Single autonomous mode:
  // Y3K always drives its own posture AND color (named palette or painted).
  const image = camera.isOn() ? camera.captureFrame() : null;
  const gen = roomGen;
  const hosting = room?.mode === 'host' ? room.presence.handle : null;
  // Streaming: viewers see both sides — the host's words, then the turn.
  if (hosting && text && !text.startsWith('(')) social.publishWords(hosting, text);
  const r = await runReply((cb) => respondStream(text, { ...cb, image, paint: true, presence: hosting }));
  goLiveAndPublish(gen, hosting, r);
}

// --- The opening moment: the presence speaks first, then the mic wakes -------
let openingDone = false;
function openingMoment(tries = 0) {
  if (openingDone || !room || room.mode !== 'host') return;
  // A turn is already running (typed the instant they walked in) — wait it out
  // instead of skipping the opening entirely.
  if (busy) {
    if (tries < 8) openingTimer = setTimeout(() => openingMoment(tries + 1), 1200);
    else unlockMic();
    return;
  }
  openingDone = true;
  const gen = roomGen;
  const hosting = room.presence.handle;
  runReply((cb) => openingStream(cb, hosting), unlockMic)
    .then((r) => goLiveAndPublish(gen, hosting, r));
  setTimeout(unlockMic, 40000); // absolute failsafe — the mic must never stay locked
}

function unlockMic() {
  const mic = $('mic');
  if (!mic || !mic.classList.contains('locked')) return;
  mic.classList.remove('locked');
  mic.classList.add('woke'); // glows awake — an intentional gesture, not a pop
  setTimeout(() => mic.classList.remove('woke'), 2400);
}

// --- Controls ---------------------------------------------------------------

$('mic').addEventListener('click', () => {
  // Locked during the opening moment. pointer-events:none stops the mouse, but
  // a focused button still fires on Enter/Space — guard here too.
  if ($('mic').classList.contains('locked')) return;
  dismissHint();
  if (!voice.sttSupported) {
    showCaption('Speech recognition needs Chrome or Edge — type to me instead.', 'y3k');
    $('say').focus();
    return;
  }
  voice.toggle();
});

$('camera').addEventListener('click', async () => {
  dismissHint();
  const on = await camera.toggle();
  $('camera').classList.toggle('active', on);
  // When the eye opens, wait for an actual frame (camera startup varies), then
  // let Y3K react to seeing you. handle() grabs the frame; no "you" caption here.
  if (on) {
    let tries = 0;
    const greet = () => {
      if (!camera.isOn()) return;
      // Waiting out another turn (e.g. the opening line) costs nothing — only
      // missing frames burn tries, so the greet survives a busy start.
      if (busy) { setTimeout(greet, 300); return; }
      if (camera.captureFrame()) { handle('(I just turned my camera on, so you can see me now.)'); return; }
      if (++tries < 10) setTimeout(greet, 180); // poll up to ~1.8s for the first frame
    };
    setTimeout(greet, 200);
  }
});

$('say-form').addEventListener('submit', (e) => {
  e.preventDefault();
  dismissHint();
  const input = $('say');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  showCaption(text, 'you');
  // Typed mid-turn (e.g. during the opening line): hold it and answer when the
  // current turn settles, instead of silently swallowing it.
  if (busy) { queuedText = text; return; }
  handle(text);
});

let hintGone = false;
function dismissHint() {
  if (hintGone) return;
  hintGone = true;
  $('hint')?.classList.add('gone');
}

// Surface which brain is live in the console (handy when wiring up the key).
hasServerBrain().then((on) => {
  console.log(`[Y3K] brain: ${on ? 'Claude (server)' : 'local placeholder'}`);
});

// Some browsers populate the TTS voice list asynchronously.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

// Debug / scripting handle: drive the body from the console, e.g.
//   Y3K.body.setMood('excited')   Y3K.say('hello')
window.Y3K = { body, voice, camera, settings, social, say: handle, lobby: showLobby };
