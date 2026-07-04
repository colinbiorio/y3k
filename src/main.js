// Wiring. Turns input (voice or text) into a brain reply, then drives the body
// and the voice together so shape, color, and words land as one gesture.

import { createBody } from './body.js';
import { createVoice } from './voice.js';
import { createCamera } from './camera.js';
import { createSettings } from './settings.js';
import { respondStream, hasServerBrain } from './brain.js';
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

function enterApp(greet) {
  if (!loginEl || loginEl.classList.contains('gone')) return;
  // The orb flares to greet you, then eases back to calm as the card clears.
  body.setMood('excited');
  body.setAudioLevel(1);
  body.setSpeaking(true);
  setTimeout(() => { body.setSpeaking(false); body.setAudioLevel(0); body.setMood('calm'); }, 1000);
  loginEl.classList.add('gone');           // card zooms through + blurs away; the light blooms
  document.body.classList.remove('gated'); // app chrome fades in
  setTimeout(() => { loginEl.style.display = 'none'; }, 1300);
  if (greet) setTimeout(() => showCaption(greet, 'y3k'), 750);
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
    setTimeout(() => enterApp(`welcome, ${account.username}.`), 480);
  } catch { showLoginError('Could not reach the server.'); authBusy = false; }
}
loginForm?.addEventListener('submit', (e) => { e.preventDefault(); submitAuth(); });
$('login-skip')?.addEventListener('click', () => enterApp()); // guest — no account

// Recognize a returning session: skip the card and greet by name.
fetch('/api/auth/me').then((r) => r.json()).then((d) => {
  if (d && d.user) { account = d.user; enterApp(`welcome back, ${d.user.username}.`); }
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

function setMoodTag(name) {
  $('mood-tag').textContent = 'orion | ' + name;
}

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

async function handle(text) {
  if (busy) return;
  busy = true;
  body.setMood('thinking');
  setMoodTag('thinking');

  // If the camera is on, let Y3K see this moment too.
  const image = camera.isOn() ? camera.captureFrame() : null;

  // Single autonomous mode: Y3K always drives its own posture AND its own color
  // — it can name one of the preset palettes (onScheme) or paint its own (onPaint).
  const autoForm = true;
  const paintMode = true;

  const active = settings.getActive();

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
  };

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

  const { mood, speech, form, scheme, paint } = await respondStream(text, {
    onMood: (m) => { currentMood = m; body.setMood(m); setMoodTag(m); },
    onForm: (f) => { if (autoForm) body.setForm(f); },
    onScheme: (s) => body.setScheme(s),
    onPaint: (anchors) => { if (paintMode) body.paintColors(anchors); },
    onText: (t) => { gotStream = true; captionText += t; showCaption(scrubTags(captionText), 'y3k'); pending += t; flush(false); },
    image,
    paint: paintMode,
  });

  currentMood = mood;
  body.setMood(mood);
  setMoodTag(mood);
  if (autoForm && form) body.setForm(form); // settle on Y3K's chosen posture
  if (scheme) body.setScheme(scheme); // ...its chosen palette
  if (paintMode && paint) body.paintColors(paint); // ...or the colors it painted
  showCaption(speech, 'y3k');

  if (gotStream) flush(true);   // speak the trailing partial sentence
  else pushSpeak(speech);       // non-stream / local-brain fallback: speak the whole reply
  speaker.end();

  // Safety net: never strand the UI on busy if speech callbacks never fire.
  watchdog = setTimeout(finish, Math.max(15000, speech.length * 220));
}

// --- Controls ---------------------------------------------------------------

$('mic').addEventListener('click', () => {
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
      if (!busy && camera.captureFrame()) { handle('(I just turned my camera on, so you can see me now.)'); return; }
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
window.Y3K = { body, voice, camera, settings, say: handle };
