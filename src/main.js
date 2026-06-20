// Wiring. Turns input (voice or text) into a brain reply, then drives the body
// and the voice together so shape, color, and words land as one gesture.

import { createBody, getTheme } from './body.js';
import { createVoice } from './voice.js';
import { createCamera } from './camera.js';
import { createSettings } from './settings.js';
import { respondStream, hasServerBrain } from './brain.js';
import { scrubTags } from './tags.mjs';

const $ = (id) => document.getElementById(id);

const body = createBody($('stage'));
// Apply the saved theme (background + field scheme) before anything else.
const theme0 = getTheme();
body.setScheme(theme0.scheme);
body.setBackground(theme0.bgHue, theme0.bgTint);
// Apply the saved form (or a resting 'orb' when Y3K chooses its own posture).
body.setForm(theme0.form === 'auto' ? 'orb' : theme0.form);

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
  $('mood-tag').textContent = name;
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

  // When the form is on Auto, Y3K drives its own posture; a pinned form locks it.
  const autoForm = getTheme().form === 'auto';

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

  const { mood, speech, form } = await respondStream(text, {
    onMood: (m) => { currentMood = m; body.setMood(m); setMoodTag(m); },
    onForm: (f) => { if (autoForm) body.setForm(f); },
    onText: (t) => { gotStream = true; captionText += t; showCaption(scrubTags(captionText), 'y3k'); pending += t; flush(false); },
    image,
  });

  currentMood = mood;
  body.setMood(mood);
  setMoodTag(mood);
  if (autoForm && form) body.setForm(form); // settle on Y3K's chosen posture
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
  $('hint').classList.add('gone');
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
