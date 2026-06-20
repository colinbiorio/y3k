// Voice in and out.
//   - In:  Web Speech API (SpeechRecognition) transcribes the mic; a parallel
//          mic analyser feeds live energy to the body while it listens.
//   - Out: two paths. speakAudio() streams real (human or designed) audio from
//          the ElevenLabs proxy and drives the body from the actual waveform via
//          an AnalyserNode. speak() is the free browser-TTS fallback.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// A visitor's ElevenLabs key lives only in this browser, sent as a header per request.
const VOICE_KEY = 'y3k.voicekey';
export function getVoiceKey() { try { return localStorage.getItem(VOICE_KEY) || ''; } catch { return ''; } }
export function setVoiceKey(k) { if (k) localStorage.setItem(VOICE_KEY, k); else localStorage.removeItem(VOICE_KEY); }
function voiceKeyHeader() { const k = getVoiceKey(); return k ? { 'x-voice-key': k } : {}; }

export function createVoice({ onTranscript, onListeningChange, onLevel }) {
  const sttSupported = Boolean(SpeechRecognition);
  let recog = null;
  let listening = false;

  let audioCtx = null;        // shared between the mic meter and audio playback
  let micStream = null;
  let rafId = 0;

  function getCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // --- Mic meter (drives the body while listening) ---------------------------
  function startMeter(stream) {
    const ctx = getCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      onLevel?.(Math.min(Math.sqrt(sum / buf.length) * 3.2, 1));
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopMeter() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    onLevel?.(0);
  }

  async function startListening() {
    if (listening || !sttSupported) return;
    listening = true;
    onListeningChange?.(true);

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startMeter(micStream);
    } catch { /* no meter, recognition still works */ }

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

  // --- Out: ElevenLabs audio, body driven by the real waveform ---------------
  async function speakAudio(text, voiceId, settings, { onStart, onLevel: onLvl, onEnd } = {}) {
    try {
      const resp = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...voiceKeyHeader() },
        body: JSON.stringify({ text, voiceId, settings }),
      });
      if (!resp.ok) throw new Error('tts ' + resp.status);
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
      src.onended = () => { cancelAnimationFrame(raf); onLvl?.(0); onEnd?.(); };
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
  function speaker({ voiceId, settings, onLevel: onLvl, onStart, onEnd } = {}) {
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
        onEnd?.();
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
        const text = queue.shift();
        if (browserFallback) { pushBrowser(text); continue; }
        try {
          const r = await fetch('/api/voice/tts', {
            method: 'POST', headers: { 'content-type': 'application/json', ...voiceKeyHeader() },
            body: JSON.stringify({ text, voiceId, settings }),
          });
          if (!r.ok) throw new Error('tts ' + r.status);
          const audioBuf = await ctx.decodeAudioData(await r.arrayBuffer());
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
          src.onended = () => { active -= 1; maybeFinish(); };
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
      push(text) { const t = (text || '').trim(); if (!t) return; if (browser) pushBrowser(t); else { queue.push(t); worker(); } },
      end() { ended = true; maybeFinish(); },
    };
  }

  return {
    sttSupported,
    ttsSupported: 'speechSynthesis' in window,
    isListening: () => listening,
    startListening,
    stopListening,
    toggle() { listening ? stopListening() : startListening(); },
    speak,
    speakAudio,
    speaker,
  };
}
