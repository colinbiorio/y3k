// Voice in and out.
//   - In:  Web Speech API (SpeechRecognition) transcribes the mic; a parallel
//          mic analyser feeds live energy to the body while it listens.
//   - Out: two paths. speakAudio() streams real (human or designed) audio from
//          the ElevenLabs proxy and drives the body from the actual waveform via
//          an AnalyserNode. speak() is the free browser-TTS fallback.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// A visitor's voice keys live only in this browser, one per service, sent as a
// header with each request to that service. ElevenLabs' stays where it always was.
const VOICE_KEY = 'y3k.voicekey';
const keyName = (provider) => (!provider || provider === 'elevenlabs' ? VOICE_KEY : `${VOICE_KEY}.${provider}`);
export function getVoiceKey(provider) { try { return localStorage.getItem(keyName(provider)) || ''; } catch { return ''; } }
export function setVoiceKey(k, provider) {
  try { if (k) localStorage.setItem(keyName(provider), k); else localStorage.removeItem(keyName(provider)); } catch { /* private window */ }
}
export function voiceKeyHeader(provider) { const k = getVoiceKey(provider); return k ? { 'x-voice-key': k } : {}; }

// THE SITE'S VOICE HAS A DAILY ALLOWANCE (house.mjs). Without a key of your
// own, ElevenLabs speaks on the site's account, and once today's characters
// are spent every /api/voice/tts answers 429 until UTC midnight. That answer
// was treated like any failed sentence: the voice turned robotic in the middle
// of a conversation with no word why, and every later reply asked again first.
// Now its words are kept and handed once to createVoice's onNotice, and until
// midnight the site's voice is not asked at all. A key of your own, or another
// service, is never held back by it.
let houseRest = null;   // { until, said } once the site's voice has said no for today
const onHouseVoice = (provider) => (!provider || provider === 'elevenlabs') && !getVoiceKey('elevenlabs');

// What the site's voice said when it stopped for today, while it rests and is
// the one that would speak for `provider`; '' otherwise.
export function houseVoiceResting(provider) {
  if (houseRest && Date.now() >= houseRest.until) houseRest = null;
  return houseRest && onHouseVoice(provider) ? houseRest.said : '';
}

// WHY THE VOICE CHANGED (2026-10-08). Any other refused sentence went to the
// browser's voice with a console.warn and nothing more, so someone whose own
// ElevenLabs credits ran out heard their presence turn robotic on every reply
// and was never told why. The route now says why, in one of five reasons
// (voice-providers.mjs refusalOf): key, credits, voice, rate, down. Each is
// told once per service and reason in this tab, through createVoice's
// onNotice. 'rate' and 'down' pass by themselves, so they are told only once
// three sentences in a row have been refused. The last refusal is kept, with
// its time, for Settings → Voice, until a sentence speaks again.
const REASONS = ['key', 'credits', 'voice', 'rate', 'down'];
// The names voice-providers.mjs gives the services, and what each account
// spends (a test keeps both equal to the server's).
export const VOICE_NAMES = { elevenlabs: 'ElevenLabs', openai: 'OpenAI', cartesia: 'Cartesia' };
export const VOICE_SPENT = { elevenlabs: 'characters', openai: 'credits', cartesia: 'credits' };
const SPENT = VOICE_SPENT;
const serviceOf = (p) => (Object.hasOwn(VOICE_NAMES, p || '') ? p : 'elevenlabs'); // as the route reads it
const told = new Set();       // 'provider:reason', once told in this tab
const inARow = {};            // provider → sentences refused since one last spoke
let lastNo = null;            // { provider, reason, upstream, house, at }
const watchers = new Set();

// A failed /api/voice/tts, read once (a body can be read only once):
//   usedUp  the site's allowance spent for today, in the server's words, or ''.
//           The per-minute limiter answers 429 too, with only 'rate limited',
//           and that one is over within the minute.
//   no      the service's refusal as the route gave it, or null.
export async function readRefusal(r) {
  let said = null;
  try { said = await r.json(); } catch { /* no body */ }
  const error = typeof said?.error === 'string' ? said.error : '';
  const usedUp = r?.status === 429 && error && error !== 'rate limited' ? error : '';
  const no = REASONS.includes(said?.reason) && Object.hasOwn(VOICE_NAMES, said?.provider || '')
    ? { provider: said.provider, reason: said.reason, upstream: Number(said.upstream) || 0, house: said.house === true }
    : null;
  return { usedUp, no };
}

export function lastRefusal() { return lastNo; }
export function watchRefusal(fn) { watchers.add(fn); return () => watchers.delete(fn); }
// Keep a refusal for Settings (null clears it). Settings' ▶ notes its own here
// too, without a toast: the person is looking at the answer already.
export function noteRefusal(no) {
  lastNo = no ? { ...no, at: Date.now() } : null;
  for (const fn of watchers) { try { fn(lastNo); } catch { /* a watcher must not stop the voice */ } }
}
// A sentence spoke on `provider`: its count starts again, and its kept refusal
// goes. Another service's stays: it is still that service's last answer.
export function voiceSpoke(provider) {
  const p = serviceOf(provider);
  inARow[p] = 0;
  if (lastNo?.provider === p) noteRefusal(null);
}

// The toast for a refusal. What happens next is what speaker() does: each
// reply asks the service first and falls to the browser's voice when it is
// refused, so the browser's voice is heard until the service speaks again.
export function refusalNotice({ provider, reason, house }) {
  const name = VOICE_NAMES[provider] || 'The voice service';
  const using = "Your presence is using the browser's voice";
  if (reason === 'key') {
    return house
      ? `${name} did not accept the site's key. ${using} until that is fixed, or until you add a key of your own in Settings → Voice.`
      : `${name} did not accept your key. ${using} until you paste one that works or choose another voice in Settings → Voice.`;
  }
  if (reason === 'credits') {
    return house
      ? `The site's ${name} account is out of ${SPENT[provider]}. ${using} until it is topped up, or until you add a key of your own in Settings → Voice.`
      : `${name} says your account is out of ${SPENT[provider]}. ${using} until you top up or choose another in Settings → Voice.`;
  }
  if (reason === 'voice') return `${name} could not find the voice you chose. ${using} until you choose another in Settings → Voice.`;
  if (reason === 'rate') return `${name} says too many requests are being made at once. ${using} until it accepts them again.`;
  return `${name} could not speak the last three sentences. ${using} until it answers again.`;
}

// The line Settings → Voice shows: 'Last answer from ElevenLabs, 14:02: out
// of characters.' The status code is said here only, for an answer that
// refusalOf did not recognise.
export function refusalLine(no) {
  if (!no) return '';
  const name = VOICE_NAMES[no.provider] || 'the voice service';
  const d = new Date(no.at);
  const at = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const what = no.reason === 'key' ? 'key not accepted'
    : no.reason === 'credits' ? `out of ${SPENT[no.provider]}`
    : no.reason === 'voice' ? 'voice not found'
    : no.reason === 'rate' ? 'too many requests'
    : no.upstream ? `error ${no.upstream}` : '';
  if (!what) return `Last try with ${name}, ${at}: no answer.`;
  return `Last answer from ${name}, ${at}: ${what}${no.house ? " (the site's account)" : ''}.`;
}

export function createVoice({ onTranscript, onListeningChange, onLevel, onNotice }) {
  const sttSupported = Boolean(SpeechRecognition);
  let recog = null;
  let listening = false;

  let audioCtx = null;        // shared between the mic meter and audio playback
  let micStream = null;
  let meterAnalyser = null;
  let meterSrc = null;
  let rafId = 0;

  function getCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // --- Mic meter (drives the body while listening) ---------------------------
  // Acquire the mic ONCE and keep it for the session: continuous voice re-arms
  // many times, and re-getUserMedia every utterance flickers the OS mic
  // indicator. releaseMic() frees it when voice mode ends.
  async function ensureMic() {
    if (micStream) return true;
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return false; }
    const ctx = getCtx();
    meterSrc = ctx.createMediaStreamSource(micStream);
    meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 512;
    meterSrc.connect(meterAnalyser); // read-only: never connected to destination
    return true;
  }
  function startMeter() {
    if (rafId || !meterAnalyser) return;
    const buf = new Uint8Array(meterAnalyser.frequencyBinCount);
    const tick = () => {
      meterAnalyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      onLevel?.(Math.min(Math.sqrt(sum / buf.length) * 3.2, 1));
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopMeter() { cancelAnimationFrame(rafId); rafId = 0; onLevel?.(0); } // keeps the stream alive
  function releaseMic() {
    stopMeter();
    try { meterSrc?.disconnect(); meterAnalyser?.disconnect(); } catch { /* ignore */ }
    meterSrc = null; meterAnalyser = null;
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
  }

  async function startListening() {
    if (listening || !sttSupported) return;
    listening = true;
    onListeningChange?.(true);

    await ensureMic(); // best-effort meter; recognition works even if this fails
    startMeter();

    recog = new SpeechRecognition();
    recog.lang = 'en-US';
    recog.interimResults = true;
    recog.continuous = false;
    let finalText = '';
    let firedFinal = false; // so onend doesn't re-dispatch a final already sent by onresult

    recog.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (finalText) firedFinal = true;
      onTranscript?.({ text: (finalText || interim).trim(), final: Boolean(finalText) });
    };
    recog.onerror = () => stopListening();
    recog.onend = () => {
      if (!firedFinal && finalText.trim()) onTranscript?.({ text: finalText.trim(), final: true });
      stopListening();
    };
    recog.start();
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    try { recog?.stop(); } catch { /* already stopped */ }
    recog = null;
    stopMeter();
    onListeningChange?.(false);
  }

  // A failed /api/voice/tts. When it was the site's voice saying no for today,
  // it rests until UTC midnight, and the first refusal of the day is told.
  // When the service said no, the reason is kept for Settings and told once
  // (see WHY THE VOICE CHANGED above).
  async function refused(r, provider) {
    const { usedUp, no } = await readRefusal(r);
    if (usedUp) {
      if (!onHouseVoice(provider)) return;
      const news = !houseVoiceResting(provider);
      const now = new Date();
      houseRest = { until: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1), said: usedUp };
      if (news) onNotice?.(usedUp);
      return;
    }
    if (!no) return;
    const n = (inARow[no.provider] = (inARow[no.provider] || 0) + 1);
    noteRefusal(no);
    if ((no.reason === 'rate' || no.reason === 'down') && n < 3) return;
    const k = `${no.provider}:${no.reason}`;
    if (told.has(k)) return;
    told.add(k);
    onNotice?.(refusalNotice(no));
  }

  // --- Out: a voice service's audio, body driven by the real waveform --------
  async function speakAudio(text, voiceId, settings, { onStart, onLevel: onLvl, onEnd, provider, model } = {}) {
    if (houseVoiceResting(provider)) return false; // the caller's browser voice speaks instead
    try {
      const resp = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...voiceKeyHeader(provider) },
        body: JSON.stringify({ text, voiceId, settings, provider, model }),
      });
      if (!resp.ok) { await refused(resp, provider); throw new Error('tts ' + resp.status); }
      const bytes = await resp.arrayBuffer();

      const ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const audioBuf = await ctx.decodeAudioData(bytes);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyser.connect(ctx.destination);

      const arr = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(arr);
        let sum = 0;
        for (let i = 0; i < arr.length; i++) { const v = (arr[i] - 128) / 128; sum += v * v; }
        onLvl?.(Math.min(Math.sqrt(sum / arr.length) * 3.4, 1));
        raf = requestAnimationFrame(tick);
      };

      onStart?.();
      src.start();
      voiceSpoke(provider);
      tick();
      src.onended = () => { cancelAnimationFrame(raf); try { analyser.disconnect(); } catch { /* ignore */ } onLvl?.(0); onEnd?.(); };
      return true;
    } catch (e) {
      console.warn('[voice] ElevenLabs playback failed, falling back to browser TTS', e);
      return false;
    }
  }

  // --- Out: browser TTS fallback ---------------------------------------------
  function speak(text, { onStart, onEnd } = {}) {
    if (!('speechSynthesis' in window) || !text) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const pick = voices.find((v) => /samantha|google us english|jenny|aria/i.test(v.name));
    if (pick) u.voice = pick;
    u.onstart = () => onStart?.();
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  }

  // --- Out: streaming speaker — speak sentences as they arrive, gaplessly ------
  // push(sentence) repeatedly while the reply streams; end() when no more coming.
  // ElevenLabs chunks are scheduled back-to-back on one analyser (body follows the
  // real waveform); browser TTS just queues utterances. Falls back to browser if
  // the first ElevenLabs chunk fails.
  // onChunk(text, 'start' | 'end', ms) — each pushed chunk as it is actually
  // heard: 'start' when its sound begins (ms = how long it lasts, when known)
  // and 'end' when it stops. airden.js shows each sentence as it is said and
  // keeps the next one queued behind it, so a long run of speech is gapless.
  function speaker({ voiceId, provider, model, settings, onLevel: onLvl, onStart, onEnd, onChunk } = {}) {
    const browser = !voiceId || voiceId === 'browser';
    let ended = false;        // end() called — no more chunks coming
    let active = 0;           // scheduled/playing chunks or utterances
    let started = false;
    let browserFallback = false;

    const ctx = getCtx();
    let analyser = null;
    let raf = 0;
    let nextStart = 0;        // gapless scheduling clock
    const queue = [];
    let working = false;
    let cancelled = false;    // stop() called — abandon everything in flight
    let notified = false;     // onEnd fired once (from finish OR stop, never both)
    const sources = [];       // live ElevenLabs buffer nodes, so stop() can kill them

    const fireEnd = () => { if (notified) return; notified = true; onEnd?.(); };

    function meterLoop() {
      const arr = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(arr);
        let s = 0;
        for (let i = 0; i < arr.length; i++) { const v = (arr[i] - 128) / 128; s += v * v; }
        onLvl?.(Math.min(Math.sqrt(s / arr.length) * 3.4, 1));
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function maybeFinish() {
      if (ended && active === 0 && queue.length === 0 && !working) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; onLvl?.(0); }
        // Detach the analyser from the shared AudioContext so it can be GC'd — a
        // fresh speaker is built per reply, so an un-disconnected node would leak
        // one per turn for the tab's life.
        if (analyser) { try { analyser.disconnect(); } catch { /* ignore */ } analyser = null; }
        fireEnd();
      }
    }
    function pushBrowser(text) {
      if (!('speechSynthesis' in window)) return;
      active += 1;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0; u.pitch = 1.0;
      const pick = window.speechSynthesis.getVoices().find((v) => /samantha|google us english|jenny|aria/i.test(v.name));
      if (pick) u.voice = pick;
      if (!started) { started = true; onStart?.(); }
      const done = () => { active -= 1; if (!cancelled) onChunk?.(text, 'end'); maybeFinish(); };
      u.onstart = () => { if (!cancelled) onChunk?.(text, 'start', 0); };
      u.onend = done; u.onerror = done;
      window.speechSynthesis.speak(u);
    }
    async function worker() {
      if (working) return;
      working = true;
      while (queue.length) {
        if (cancelled) break; // stop() emptied the intent — abandon the rest
        const text = queue.shift();
        // resting till midnight: no request that can only be refused
        if (browserFallback || houseVoiceResting(provider)) { pushBrowser(text); continue; }
        try {
          const r = await fetch('/api/voice/tts', {
            method: 'POST', headers: { 'content-type': 'application/json', ...voiceKeyHeader(provider) },
            body: JSON.stringify({ text, voiceId, settings, provider, model }),
          });
          if (!r.ok) { await refused(r, provider); throw new Error('tts ' + r.status); }
          const audioBuf = await ctx.decodeAudioData(await r.arrayBuffer());
          if (cancelled) break; // stopped while the chunk was in flight — don't schedule it
          if (ctx.state === 'suspended') await ctx.resume();
          if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.connect(ctx.destination); meterLoop(); }
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(analyser);
          const at = Math.max(ctx.currentTime + 0.02, nextStart);
          src.start(at);
          voiceSpoke(provider);   // the service answered with sound: the kept refusal goes
          nextStart = at + audioBuf.duration;
          if (!started) { started = true; onStart?.(); }
          active += 1;
          sources.push(src);
          if (onChunk) setTimeout(() => { if (!cancelled) onChunk(text, 'start', audioBuf.duration * 1000); }, Math.max(0, (at - ctx.currentTime) * 1000));
          src.onended = () => { active -= 1; const i = sources.indexOf(src); if (i >= 0) sources.splice(i, 1); if (!cancelled) onChunk?.(text, 'end'); maybeFinish(); };
        } catch (e) {
          // Speak any failed sentence via the browser voice so none is lost; the
          // first failure also switches the rest of the reply to the browser voice.
          if (!started) browserFallback = true;
          console.warn('[voice] tts chunk failed → browser voice', e);
          pushBrowser(text);
        }
      }
      working = false;
      maybeFinish();
    }

    return {
      push(text) { const t = (text || '').trim(); if (!t || cancelled) return; if (browser) pushBrowser(t); else { queue.push(t); worker(); } },
      end() { ended = true; maybeFinish(); },
      // Cut speech off now: drop the queue, silence every scheduled/playing buffer
      // and any browser utterance, tear down the meter, and fire onEnd exactly once.
      stop() {
        if (cancelled) return;
        cancelled = true; ended = true;
        queue.length = 0;
        for (const s of sources) { try { s.onended = null; s.stop(); } catch { /* already stopped */ } }
        sources.length = 0;
        active = 0;
        try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch { /* ignore */ }
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (analyser) { try { analyser.disconnect(); } catch { /* ignore */ } analyser = null; }
        onLvl?.(0);
        fireEnd();
      },
    };
  }

  return {
    sttSupported,
    ttsSupported: 'speechSynthesis' in window,
    isListening: () => listening,
    startListening,
    stopListening,
    releaseMic, // free the persistent mic when a voice session fully ends
    toggle() { listening ? stopListening() : startListening(); },
    speak,
    speakAudio,
    speaker,
  };
}
