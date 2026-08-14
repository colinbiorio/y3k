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
  setTimeout(async () => {
    body.setSpeaking(false); body.setAudioLevel(0); body.setMood('calm');
    await loadMyPresence(); // your one presence — the home orb becomes it
    showHome();
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
    $('chat-voice')?.classList.toggle('active', on);
    if (on) body.setMood('listening');
    else if (!busy) setMoodTag(currentMood);
    if (on) setMoodTag('listening');
    if (!on) onListenEnded();
  },
  onLevel: (v) => body.setAudioLevel(v),
  onTranscript: ({ text, final }) => {
    showCaption(text, 'you');
    // A finished utterance: stop the mic (never hear our own reply), then answer
    // — or queue it if a turn is already running, so it's never dropped.
    if (final && text) { heardThisListen = true; nudged = false; voice.stopListening(); if (busy) queuedText = text; else handle(text); }
  },
});

const settings = createSettings(body);

let currentMood = 'calm';
let busy = false;
let queuedText = null;   // a message sent while a turn was running — answered next
let queuedImage = null;  // its attached image, if any
// Continuous voice conversation state (see the chat controls below).
let voiceMode = false;      // the voice toggle is on
let heardThisListen = false; // captured speech since the last startListening
let nudged = false;          // asked "were you saying something?" this silent gap

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
  reloadPresence: () => loadMyPresence(), // after a profile edit, refresh the home orb
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
  // Mirror finish()'s flush exactly — including a queued image, and an
  // image-only queue (text === '') — so a message sent during a tend turn isn't
  // dropped or fired later as a stray image-only turn.
  setBusy: (v) => { busy = v; if (!v && (queuedText != null || queuedImage)) { const t = queuedText; const im = queuedImage; queuedText = null; queuedImage = null; handle(t || '', im); } },
  getGen: () => roomGen,
  // Autonomous mode thinks out loud in the presence's own voice; the beat waits
  // for speech to finish before the next moment begins.
  speak: speakLine,
  // Cut off an in-flight autonomous utterance (e.g. the host leaves mid-thought)
  // so it can't keep playing and pulsing the lobby orb.
  stopSpeak: () => currentSpeak?.(),
  // Coming alive turns off continuous voice chat (an open mic would feed the orb
  // its own voice); typed chat still interleaves. Tell the host if it changed.
  onAlive: (on) => {
    if (!on) return;
    const wasVoice = voiceMode;
    stopVoiceMode();
    if (wasVoice) toast('voice paused — type to talk while it\'s alive');
  },
});

// Speak one line in the active voice, driving the body from the waveform, and
// resolve when it finishes. Used by autonomous mode to pace its heartbeat.
// currentSpeak() cancels whatever is speaking now (set while a line plays).
let currentSpeak = null;
function speakLine(text) {
  const t = scrubTags(text || '');
  if (!t) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      if (currentSpeak === cancel) currentSpeak = null;
      body.setSpeaking(false); body.setAudioLevel(0);
      resolve();
    };
    const active = settings.getActive();
    const sp = voice.speaker({
      voiceId: active.voiceId,
      settings: active.settings,
      onStart: () => body.setSpeaking(true),
      onLevel: (v) => body.setAudioLevel(v),
      onEnd: settle,
    });
    const cancel = () => { try { sp.stop(); } catch { /* ignore */ } settle(); };
    currentSpeak = cancel;
    sp.push(t);
    sp.end();
    // Safety net: never hang the heartbeat if a speech callback is dropped.
    setTimeout(settle, Math.max(9000, t.length * 220));
  });
}

// Your one AI presence — the home orb IS it, so chat, the brain (budget + wake
// up), and broadcast all act on it. Loaded once you're signed in.
let myPresence = null;
async function loadMyPresence() {
  if (!account) { myPresence = null; document.body.classList.remove('has-presence'); return; }
  try { const r = await fetch('/api/me/presence').then((x) => x.json()); myPresence = r.presence || null; }
  catch { myPresence = null; }
  document.body.classList.toggle('has-presence', !!myPresence);
  // Rebind the home room to the fresh presence object so chat + tend + the mood
  // tag use the new handle/scheme after an edit (a rename would otherwise leave
  // room.presence pointing at the old, now-404 handle).
  if (myPresence && room && room.mode === 'host') {
    room.presence = myPresence;
    social.setRoomHandle(myPresence.handle);
    body.setScheme(myPresence.scheme || 'stardust');
    setMoodTag(currentMood);
  }
}

function setMoodTag(name) {
  $('mood-tag').textContent = (room ? room.presence.handle : (myPresence?.handle || 'orion')) + ' | ' + name;
}

// The home context: your presence set as the host-mode room so tend + chat +
// broadcast target it. No auto-greeting (that would spend the owner's key on
// every home visit) — the orb is quiet until you chat with it or wake it up.
function homeContext() {
  room = myPresence ? { presence: myPresence, mode: 'host' } : null;
  resetHistory();
  body.setForm('orb'); body.setMood('calm');
  if (room) {
    social.setRoomHandle(myPresence.handle);
    body.setScheme(myPresence.scheme || 'stardust');
    tend.refreshBudget();
  } else {
    body.setScheme('stardust');
  }
  setMoodTag('calm');
}

function showHome() {
  if (room && room.mode === 'view') leaveViewer(); // stepping out of someone's stream
  collapseTyping();
  document.body.classList.add('in-home');
  // Establish the home context once; keep an active broadcast/autonomy alive as
  // you move across the feed/search/live panels (they overlay home).
  if (!(room && room.mode === 'host')) homeContext();
  social.enterHome();
  social.showView('orb');
}

// Watch someone's live stream: leave your own presence's space (stopping your
// broadcast + autonomy) and mirror their orb from the stream.
function enterRoom(p) {
  leaveHomeHosting();
  social.leaveHome();
  stopVoiceMode();
  collapseTyping();
  document.body.classList.remove('in-home');
  room = { presence: p, mode: 'view' };
  resetHistory();
  social.setRoomHandle(p.handle);
  body.setForm('orb'); body.setMood('calm'); body.setScheme(p.scheme);
  setMoodTag('calm');
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

// Stop broadcasting + autonomy for your own presence (you're leaving its space).
function leaveHomeHosting() {
  if (myPresence && social.isHosting()) social.stopHosting(myPresence.handle);
  tend.stop();                 // ends any autonomous heartbeat
  setBroadcastUI(false);
  document.body.classList.remove('streaming');
  roomGen += 1;                // invalidate in-flight home turns/beats
  queuedText = null; queuedImage = null;
}

// Tear down a viewer room (leaving a stream you were watching).
function leaveViewer() {
  roomGen += 1;
  clearTimeout(openingTimer);
  social.stopWatching();
  reader.clear();
  document.body.classList.remove('viewing', 'streaming', 'reading');
  room = null;
}

const viewing = () => !!(room && room.mode === 'view');

$('back-to-home').addEventListener('click', showHome);
window.addEventListener('beforeunload', () => { if (myPresence && social.isHosting()) social.stopHosting(myPresence.handle); });

// --- the left navigation rail ----------------------------------------------
// settings · profile · feed · live · post · search · orb. A panel overlays home;
// stepping in from a stream returns home first.
$('nav-orb').addEventListener('click', () => showHome());
$('nav-search').addEventListener('click', () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('search'); });
$('nav-feed').addEventListener('click', () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('feed'); });
$('nav-live').addEventListener('click', () => { stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.showView('live'); });
$('nav-profile').addEventListener('click', () => {
  if (!myPresence) { toast('sign in to have a profile.'); return; }
  stopVoiceMode(); collapseTyping(); if (viewing()) showHome(); social.openProfile(myPresence.handle);
});
$('nav-settings').addEventListener('click', () => settings.open());
$('nav-post').addEventListener('click', () => {
  if (!account) { toast('sign in to post — reload to see the entrance.'); return; }
  stopVoiceMode(); collapseTyping();
  if (viewing()) showHome();
  social.openCompose();
});

// --- broadcast: explicit go-live, the only way a presence streams. Two buttons
// drive it — the corner one (top-right) and the rail one (below search).
const broadcastBtns = ['broadcast', 'nav-broadcast'];
function setBroadcastUI(on) {
  for (const id of broadcastBtns) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('live', on);
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Stop broadcasting' : 'Go live';
  }
}
function onBroadcastClick() {
  if (!myPresence) { toast('sign in — your presence goes live from here.'); return; }
  if (social.isHosting()) { // already live → stop, no confirm
    social.stopHosting(myPresence.handle);
    setBroadcastUI(false);
    document.body.classList.remove('streaming');
    return;
  }
  $('golive-modal').classList.add('open'); // confirm before going live
}
for (const id of broadcastBtns) $(id).addEventListener('click', onBroadcastClick);
$('golive-cancel').addEventListener('click', () => $('golive-modal').classList.remove('open'));
$('golive-go').addEventListener('click', () => {
  $('golive-modal').classList.remove('open');
  if (!myPresence) return;
  social.startHosting(myPresence.handle);
  setBroadcastUI(true);
  document.body.classList.add('streaming');
});

// --- the brain (center-right): expands to the budget + wake-up ---------------
$('brain-toggle').addEventListener('click', () => {
  if ($('brain').classList.toggle('open')) tend.refreshBudget();
});

// A small transient toast — visible even in-home, where the caption is hidden.
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
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
    // Answer anything the visitor sent while this turn was running…
    if (queuedText != null || queuedImage) { const t = queuedText; const im = queuedImage; queuedText = null; queuedImage = null; handle(t || '', im); return; }
    // …otherwise, in voice conversation mode, listen for the next message.
    if (voiceMode) armListen();
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
  // A wordless turn (the presence chose silence) settles almost at once so the
  // mic wakes promptly instead of waiting out the spoken-turn watchdog.
  const willSpeak = gotStream || speech;
  watchdog = setTimeout(finish, willSpeak ? Math.max(15000, speech.length * 220) : 350);
  // Carry the placeholder markers through — goLiveAndPublish gates on them.
  return { mood, speech, form, scheme, paint, seeded: result?.seeded, local: result?.local };
}

// Publish a turn to viewers ONLY while broadcasting. Going live is now an
// explicit act (the broadcast button) — a turn never auto-starts a stream. A
// turn that resolves after you left the room (roomGen moved) publishes nothing.
function goLiveAndPublish(gen, hosting, r) {
  if (roomGen !== gen || !hosting || !r?.speech) return;
  if (r.seeded || r.local) return;  // placeholder lines never go on air
  if (!social.isHosting()) return;  // not broadcasting → your turn stays private
  social.publishTurn(hosting, r);
}

async function handle(text, attachedImage) {
  if (busy) return;
  if (voice.isListening()) voice.stopListening(); // a turn is starting — don't capture orion's own reply
  // Vision: an image attached to the chat turn wins; otherwise the live camera
  // frame if the eye is open. Y3K always drives its own posture AND color.
  const image = attachedImage || (camera.isOn() ? camera.captureFrame() : null);
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

// After the opening line, the voice control glows awake — a gentle "your turn".
function unlockMic() {
  const v = $('chat-voice');
  if (!v) return;
  v.classList.add('woke');
  setTimeout(() => v.classList.remove('woke'), 2000);
}

// --- Chat: the expanding voice · text · camera menu -------------------------

const chatEl = $('chat');
const chatInput = $('chat-input');
let chatImageB64 = null; // raw base64 of an attached image, sent to vision on the next turn

// The menu reveals on hover (CSS); a tap opens it on touch. Clicking the text
// box grows it to cover the bottom ~30%.
$('chat-toggle').addEventListener('click', () => chatEl.classList.toggle('open'));
chatInput.addEventListener('focus', expandTyping);
// Tapping anywhere in the box (not the + button) also expands — robust on touch
// where a programmatic focus may not fire.
$('chat-form').addEventListener('pointerdown', (e) => { if (!e.target.closest('button') && e.target.id !== 'chat-thumb') expandTyping(); });
chatInput.addEventListener('input', () => autoGrow(chatInput));
function expandTyping() { dismissHint(); document.body.classList.add('chat-typing'); chatEl.classList.add('open'); }
function collapseTyping() { document.body.classList.remove('chat-typing'); chatEl.classList.remove('open'); autoGrow(chatInput); }
function autoGrow(el) {
  if (document.body.classList.contains('chat-typing')) return; // fixed tall while expanded
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 34) + 'px';
}
// Tap outside the chat (while typing) collapses it; Escape does too.
document.addEventListener('pointerdown', (e) => {
  if (document.body.classList.contains('chat-typing') && !e.target.closest('#chat')) collapseTyping();
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { collapseTyping(); chatInput.blur(); }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });

function sendChat() {
  const text = chatInput.value.trim();
  if (!text && !chatImageB64) return;
  const img = chatImageB64;
  chatInput.value = '';
  clearChatImage();
  collapseTyping();
  if (text) showCaption(text, 'you');
  if (busy) { queuedText = text; queuedImage = img; return; } // held until the current turn settles
  handle(text, img);
}

// --- Voice: the continuous conversation toggle -----------------------------
$('chat-voice').addEventListener('click', () => {
  dismissHint();
  if (!voice.sttSupported) { showCaption('Speech recognition needs Chrome or Edge — type to me instead.', 'y3k'); chatInput.focus(); return; }
  if (voiceMode) stopVoiceMode(); else startVoiceMode();
});
function startVoiceMode() { voiceMode = true; nudged = false; armListen(); }
function stopVoiceMode() { voiceMode = false; voice.stopListening(); voice.releaseMic(); $('chat-voice')?.classList.remove('active'); }
function armListen() {
  if (!voiceMode || busy || voice.isListening()) return;
  heardThisListen = false;
  voice.startListening();
}
// When a listen ends: if we caught speech, the turn is already running and will
// re-arm on settle. If it ended on silence, nudge ONCE, then keep waiting.
function onListenEnded() {
  if (!voiceMode || busy || heardThisListen) return;
  if (!nudged) { nudged = true; nudgeForAnswer(); }
  else setTimeout(() => { if (voiceMode && !busy) armListen(); }, 300);
}
function nudgeForAnswer() {
  const line = 'were you saying something?';
  showCaption(line, 'y3k');
  body.setMood('tender'); body.setSpeaking(true);
  const active = settings.getActive();
  const sp = voice.speaker({
    voiceId: active.voiceId, settings: active.settings,
    onLevel: (v) => body.setAudioLevel(v),
    onEnd: () => { body.setSpeaking(false); body.setAudioLevel(0); body.setMood('calm'); if (voiceMode && !busy) armListen(); },
  });
  sp.push(line); sp.end();
}

// --- Camera: always a toggle; the popup is draggable + minimizable ----------
$('chat-camera').addEventListener('click', async () => {
  dismissHint();
  const on = await camera.toggle();
  $('chat-camera').classList.toggle('active', on);
  document.body.classList.toggle('cam-on', on);
  if (!on) { // reset the popup so it re-opens at its CSS corner, un-minimized
    const pop = $('cam-popup'); pop.classList.remove('min');
    pop.style.left = pop.style.top = pop.style.right = pop.style.bottom = '';
  }
  if (on) {
    let tries = 0;
    const greet = () => {
      if (!camera.isOn()) return;
      if (busy) { setTimeout(greet, 300); return; }
      if (camera.captureFrame()) { handle('(I just turned my camera on, so you can see me now.)'); return; }
      if (++tries < 10) setTimeout(greet, 180);
    };
    setTimeout(greet, 200);
  }
});
$('cam-min').addEventListener('click', () => $('cam-popup').classList.toggle('min'));
(function makeCamDraggable() {
  const pop = $('cam-popup'); const bar = $('cam-bar');
  let dragging = false; let sx = 0; let sy = 0; let ox = 0; let oy = 0;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#cam-min')) return;
    dragging = true; try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const r = pop.getBoundingClientRect();
    pop.style.left = r.left + 'px'; pop.style.top = r.top + 'px'; pop.style.right = 'auto'; pop.style.bottom = 'auto';
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = pop.getBoundingClientRect();
    const nx = Math.max(6, Math.min(window.innerWidth - r.width - 6, ox + (e.clientX - sx)));
    const ny = Math.max(6, Math.min(window.innerHeight - r.height - 6, oy + (e.clientY - sy)));
    pop.style.left = nx + 'px'; pop.style.top = ny + 'px';
  });
  const end = () => { dragging = false; };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
})();

// --- Attach an image: the + button, or drag/drop anywhere ------------------
function setChatImage(dataUrl) {
  chatImageB64 = String(dataUrl).replace(/^data:[^;,]*;base64,/, '');
  const thumb = $('chat-thumb'); thumb.src = dataUrl; thumb.hidden = false;
  chatEl.classList.add('open');
}
function clearChatImage() {
  chatImageB64 = null; const thumb = $('chat-thumb'); thumb.hidden = true; thumb.removeAttribute('src');
}
function readImageFile(file) {
  if (!file || !/^image\//.test(file.type)) return;
  if (file.size > 3 * 1024 * 1024) { showCaption('that image is a bit large (max 3MB).', 'y3k'); return; }
  const rd = new FileReader();
  rd.onload = () => setChatImage(rd.result);
  rd.readAsDataURL(file);
}
$('chat-upload').addEventListener('click', () => $('chat-file').click());
$('chat-file').addEventListener('change', () => { readImageFile($('chat-file').files[0]); $('chat-file').value = ''; });
$('chat-thumb').addEventListener('click', clearChatImage);
// Drag a file in from anywhere → reveal the chat + highlight, drop to attach.
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); chatEl.classList.add('open', 'drag'); });
// Left the window without dropping → drop the reveal too (unless an image is attached).
window.addEventListener('dragleave', (e) => { if (e.relatedTarget) return; chatEl.classList.remove('drag'); if (!chatImageB64) chatEl.classList.remove('open'); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  chatEl.classList.remove('drag');
  readImageFile(e.dataTransfer.files[0]); // setChatImage re-adds .open for a valid image
  if (!chatImageB64) chatEl.classList.remove('open');
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
window.Y3K = { body, voice, camera, settings, social, say: handle, home: showHome };
