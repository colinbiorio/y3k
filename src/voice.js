// Voice in and out.
//   - In:  Web Speech API (SpeechRecognition) transcribes the mic; a parallel
//          mic analyser feeds live energy to the body while it listens.
//   - Out: two paths. speakAudio() streams real (human or designed) audio from
//          the ElevenLabs proxy and drives the body from the actual waveform via
//          an AnalyserNode. speak() is the free browser-TTS fallback.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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
        headers: { 'content-type': 'application/json' },
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

  return {
    sttSupported,
    ttsSupported: 'speechSynthesis' in window,
    isListening: () => listening,
    startListening,
    stopListening,
    toggle() { listening ? stopListening() : startListening(); },
    speak,
    speakAudio,
  };
}
