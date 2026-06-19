// Wiring. Turns input (voice or text) into a brain reply, then drives the body
// and the voice together so shape, color, and words land as one gesture.

import { createBody } from './body.js';
import { createVoice } from './voice.js';
import { createCamera } from './camera.js';
import { createSettings } from './settings.js';
import { respondStream, hasServerBrain } from './brain.js';

const $ = (id) => document.getElementById(id);

const body = createBody($('stage'));
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

const settings = createSettings();

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

  // Stream the reply: the body morphs the instant the mood arrives, and the
  // caption types in as the words generate.
  let captionText = '';
  const { mood, speech } = await respondStream(text, {
    onMood: (m) => { currentMood = m; body.setMood(m); setMoodTag(m); },
    onText: (t) => { captionText += t; showCaption(captionText, 'y3k'); },
  });
  currentMood = mood;

  // Speak in the chosen mood, but layer "speaking" energy over its palette.
  body.setMood(mood);
  setMoodTag(mood);
  showCaption(speech, 'y3k');

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

  const speakBrowser = () => {
    voice.speak(speech, { onStart: () => body.setSpeaking(true), onEnd: finish });
    if (!voice.ttsSupported) finish(); // don't get stuck "busy" with no TTS
  };

  // Safety net: never strand the UI on busy if a speech end callback never fires.
  watchdog = setTimeout(finish, Math.max(8000, speech.length * 120));

  const active = settings.getActive();
  if (active.voiceId && active.voiceId !== 'browser') {
    // ElevenLabs voice — the body is driven by the real audio waveform.
    const ok = await voice.speakAudio(speech, active.voiceId, active.settings, {
      onLevel: (v) => body.setAudioLevel(v),
      onEnd: finish,
    });
    if (!ok) speakBrowser(); // key missing or request failed → fall back
  } else {
    speakBrowser();
  }
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
  if (camera.isOn() === false && on === false) { /* toggled off or denied */ }
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
