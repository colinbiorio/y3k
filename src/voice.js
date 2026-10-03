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

// The words of a refusal that is the site's voice allowance, or ''. The
// server's per-minute limiter answers 429 too, with only 'rate limited', and
// that one is over within the minute.
export async function usedUpMessage(r) {
  if (!r || r.status !== 429) return '';
  let said = '';
  try { said = (await r.json())?.error; } catch { /* no body */ }
  return typeof said === 'string' && said !== 'rate limited' ? said : '';
}

// What the site's voice said when it stopped for today, while it rests and is
// the one that would speak for `provider`; '' otherwise.
export function houseVoiceResting(provider) {
  if (houseRest && Date.now() >= houseRest.until) houseRest = null;
  return houseRest && onHouseVoice(provider) ? houseRest.said : '';
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

  // A failed /api/voice/tts: when it was the site's voice saying no for today,
  // it rests until UTC midnight, and the first refusal of the day is told.
  async function refused(r, provider) {
    if (!onHouseVoice(provider)) return;
    const said = await usedUpMessage(r);
    if (!said) return;
    const news = !houseVoiceResting(provider);
    const now = new Date();
    houseRest = { until: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1), said };
    if (news) onNotice?.(said);
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
  function speaker({ voiceId, provider, model, settings, onLevel: onLvl, onStart, onEnd } = {}) {
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
      const done = () => { active -= 1; maybeFinish(); };
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
          nextStart = at + audioBuf.duration;
          if (!started) { started = true; onStart?.(); }
          active += 1;
          sources.push(src);
          src.onended = () => { active -= 1; const i = sources.indexOf(src); if (i >= 0) sources.splice(i, 1); maybeFinish(); };
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
