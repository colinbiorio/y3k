// ============================================================================
// listen.js — the ear.
//
// Turns any audio the browser will actually give us into a short, honest
// description of what it SOUNDS like: how loud, how bright, how busy, and how
// fast. This is deliberately separate from "what is playing", which is a
// metadata question answered by a music connector.
//
// The distinction matters and is load-bearing for honesty. A DRM stream
// (Spotify, Apple Music) plays through Encrypted Media Extensions: the decoded
// audio is never exposed to JavaScript, so an AnalyserNode on it reads pure
// silence. We therefore never pretend to hear those. What we CAN hear:
//   • a tab or the system, when the user shares it (getDisplayMedia)
//   • the microphone — the actual room
//   • audio files the user opens here
// Anything else reports `hearing: false`, and the AI is told so plainly.
//
// Nothing is recorded. No audio leaves the browser. Only the derived numbers
// below — loudness, brightness, onset rate, tempo — ever go anywhere, and only
// when the host has switched listening on.
// ============================================================================

// A fixed analysis hop, NOT requestAnimationFrame. Tempo is recovered by
// autocorrelating the onset envelope, which assumes evenly spaced samples —
// rAF jitter (and the orb's own frame drops, which is exactly when music is
// playing) would smear the correlation peaks and invent wrong tempos. A plain
// interval keeps the hop uniform even while the scene stutters.
const HOP_HZ = 50;
const HOP_MS = 1000 / HOP_HZ;
const WINDOW_S = 8;                      // envelope memory for tempo
const ENV_N = HOP_HZ * WINDOW_S;         // 400 samples
// Lag bounds → tempo range. bpm = 60 * HOP_HZ / lag.
const LAG_MIN = Math.round(60 * HOP_HZ / 190);  // ~16 → 190 bpm
const LAG_MAX = Math.round(60 * HOP_HZ / 50);   // 60 → 50 bpm

import { yin, harmonicGuard, chroma, estimateKey, noteOf, MIN_NOTE_MS } from './ear.mjs';

// THE PITCH CHAIN runs beside the loudness one, not instead of it.
// fftSize 1024 is right for telling a kick from a hi-hat and useless for
// telling C4 from C#4 — at 48 kHz that is ~47 Hz per bin, and a semitone down
// there is 15 Hz. So pitch gets its own, longer window, and its own decimated
// rate: YIN's cost is O(N x lags), and lags scale with the rate, so running it
// at 48 kHz would cost sixteen times what it costs at 12 for no more accuracy.
const PITCH_FFT = 4096;      // native-rate window, decimated below
const CHROMA_FFT = 8192;     // ~5.9 Hz per bin at 48k — enough to place a partial
const PITCH_EVERY = 2;       // every other hop; YIN is the expensive part
const NOTE_AGREE = 3;        // hops that must agree before it is called a note
const VOICED_RMS = 0.012;    // below this there is nothing to hear
const PHRASE_MAX = 24;       // notes kept for the fingerprint

export function createListener() {
  let ctx = null;                 // created on first attach, never before
  const elSources = new WeakMap();  // <audio> → its one and only source node
  let analyser = null;
  let source = null;              // MediaStreamAudioSourceNode | MediaElementAudioSourceNode
  let stream = null;              // held so we can stop its tracks on detach
  let timer = 0;
  let spec = null, prevSpec = null, time = null;
  let onChange = null;

  const env = new Float32Array(ENV_N);   // onset-strength envelope, ring buffer
  let envI = 0, envFilled = 0;
  let rms = 0, rmsAvg = 0, centroid = 0, flux = 0, bass = 0, mid = 0, treble = 0;
  let binBass = 8, binMid = 80;
  // Energy-weighted running averages of the spectral shape. Same trap the
  // loudness envelope fell into: between two kicks the spectrum is genuinely
  // all zeros, so a single instantaneous read almost always lands in a gap and
  // reports "dark, no highs" for bright music. These only update on hops that
  // actually carry signal, so silence abstains from the description instead of
  // voting in it.
  let centAvg = 0, bassAvg = 0, midAvg = 0, trebAvg = 0, shapeSeen = 0;
  let bpm = 0, bpmConf = 0, onsets = 0, lastOnsetT = 0;
  // setInterval is not a clock. Browsers clamp it under load and in background
  // tabs, and this runs beside a WebGL scene that is busiest exactly when music
  // is playing. Assuming the nominal hop would then scale every tempo by
  // whatever the drift happened to be. Measure the real spacing instead and let
  // the tempo formula use it.
  let lastStepT = 0, hopMs = HOP_MS;
  let silentSince = 0, sourceKind = '';
  // the ear's own state, all of it discardable
  let pitchAnalyser = null, chromaAnalyser = null, lp1 = null, lp2 = null, hp = null;
  let pitchBuf = null, chromaSpec = null, decim = 1, pitchSr = 12000, hopN = 0;
  let candMidi = 0, candHops = 0, noteMidi = 0, noteStartT = 0;
  let phrase = [], lastNoteT = 0, dropped = 0;
  let keyNow = null, chromaAcc = null, chromaHops = 0;
  let polyphonic = false;

  const ensureCtx = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

  function wire(node, kind) {
    detachGraph();
    sourceKind = kind;
    analyser = ctx.createAnalyser();
    // 1024 bins over ~48kHz → ~47Hz per bin: enough resolution to separate a
    // kick from a hi-hat, small enough to stay cheap next to a WebGL scene.
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;   // we do our own smoothing; the built-in
                                          // one destroys the onset transients
    node.connect(analyser);
    spec = new Uint8Array(analyser.frequencyBinCount);
    prevSpec = new Uint8Array(analyser.frequencyBinCount);
    time = new Uint8Array(analyser.fftSize);
    // Band edges must be FREQUENCIES, not bin indices. A bin's width is
    // sampleRate / fftSize, so a fixed index means one thing at 48kHz and
    // something else entirely at 22kHz — the same music would be described
    // differently depending on the source's sample rate.
    const perBin = ctx.sampleRate / analyser.fftSize;
    binBass = Math.max(1, Math.round(250 / perBin));    // < 250 Hz
    binMid = Math.max(binBass + 1, Math.round(4000 / perBin)); // 250 Hz - 4 kHz
    // THE EAR'S OWN CHAIN. A gentle high-pass takes out rumble and DC, two
    // cascaded low-passes make the skirt steep enough that decimating does not
    // alias a cymbal down onto a note, and only then do we take the window.
    hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45;
    lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass';
    lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass';
    // THE RATE IS DERIVED, NEVER ASSUMED. A hard-coded 12000 against a 44,100
    // context reports C4 as 287 Hz — a semitone and a half sharp, at clarity
    // 0.99. This file already carries that lesson about its band edges.
    decim = Math.max(1, Math.round(ctx.sampleRate / 12000));
    pitchSr = ctx.sampleRate / decim;
    lp1.frequency.value = pitchSr * 0.45;
    lp2.frequency.value = pitchSr * 0.45;
    pitchAnalyser = ctx.createAnalyser();
    pitchAnalyser.fftSize = PITCH_FFT;
    pitchAnalyser.smoothingTimeConstant = 0;
    chromaAnalyser = ctx.createAnalyser();
    chromaAnalyser.fftSize = CHROMA_FFT;
    // A LITTLE smoothing here and none on the pitch analyser: chroma wants a
    // stable picture of what is sounding, pitch wants this instant.
    chromaAnalyser.smoothingTimeConstant = 0.3;
    node.connect(hp); hp.connect(lp1); lp1.connect(lp2); lp2.connect(pitchAnalyser);
    node.connect(chromaAnalyser);
    pitchBuf = new Float32Array(PITCH_FFT);
    chromaSpec = new Uint8Array(chromaAnalyser.frequencyBinCount);
    chromaAcc = new Float64Array(12);
    hopN = 0; candMidi = 0; candHops = 0; noteMidi = 0; phrase = []; dropped = 0;
    keyNow = null; chromaHops = 0; polyphonic = false;

    source = node;
    env.fill(0); envI = 0; envFilled = 0; shapeSeen = 0;
    bpm = 0; bpmConf = 0; onsets = 0;
    clearInterval(timer);
    timer = setInterval(step, HOP_MS);
  }

  function detachGraph() {
    clearInterval(timer); timer = 0;
    // Disconnect the ANALYSER only. Calling source.disconnect() would also tear
    // down a cached element source's path to ctx.destination, so stopping the
    // listener would silence the music the host is playing — the listener must
    // be able to stop without touching playback.
    try { analyser && source && source.disconnect(analyser); } catch { /* not connected */ }
    try { analyser && analyser.disconnect(); } catch { /* already gone */ }
    // AND THE EAR'S CHAIN. attachEar re-taps on every track, and element
    // sources are cached for the life of the page — so without this, each
    // play() left an orphan filter chain and two orphan analysers (one holding
    // an 8192-point FFT) still being fed by a live source. Targeted
    // disconnects only, for the reason the comment above gives.
    try { source && lp2 && source.disconnect(hp); } catch { /* not connected */ }
    try { source && chromaAnalyser && source.disconnect(chromaAnalyser); } catch { /* not connected */ }
    for (const n of [hp, lp1, lp2, pitchAnalyser, chromaAnalyser]) { try { n && n.disconnect(); } catch { /* already gone */ } }
    hp = null; lp1 = null; lp2 = null; pitchAnalyser = null; chromaAnalyser = null;
    pitchBuf = null; chromaSpec = null;
    source = null; analyser = null; lastStepT = 0;
  }

  // --- THE EAR ---------------------------------------------------------------
  // One hop's worth of listening for a NOTE, as opposed to a noise. Everything
  // here is gated: a pitch has to be loud enough to be real, clear enough to be
  // periodic, and corroborated by its own harmonics before it is allowed to be
  // called anything at all.
  function hearNote() {
    pitchAnalyser.getFloatTimeDomainData(pitchBuf);
    // decimate — the low-passes above are what make this safe
    const n = Math.floor(PITCH_FFT / decim);
    const small = new Float32Array(n);
    for (let i = 0; i < n; i++) small[i] = pitchBuf[i * decim];

    chromaAnalyser.getByteFrequencyData(chromaSpec);
    const ch = chroma(chromaSpec, ctx.sampleRate, CHROMA_FFT);
    for (let i = 0; i < 12; i++) chromaAcc[i] += ch[i];
    chromaHops += 1;
    if (chromaHops >= 24) {                 // ~2s of harmony before naming a key
      const avg = new Float64Array(12);
      for (let i = 0; i < 12; i++) avg[i] = chromaAcc[i] / chromaHops;
      keyNow = estimateKey(avg);
      chromaAcc.fill(0); chromaHops = 0;
    }

    // THE VOICED GATE READS INSTANTANEOUS rms, NOT rmsAvg. rmsAvg is a
    // fast-attack/slow-release envelope that takes about a second to fall, so
    // "ended after three unvoiced hops" could never fire and every note would
    // run into the next one. rmsAvg stays what it is for describing loudness.
    if (rms < VOICED_RMS) { candMidi = 0; candHops = 0; endNote(); return; }

    const { f0, clarity } = yin(small, pitchSr);
    const heard = clarity > 0.80 && harmonicGuard(chromaSpec, ctx.sampleRate, CHROMA_FFT, f0)
      ? noteOf(f0) : null;
    if (!heard) {
      // Something is sounding and it is not one line. That is the honest
      // reading of a chord, and it is worth remembering rather than dropping.
      if (clarity > 0.80) { polyphonic = true; dropped += 1; }
      candMidi = 0; candHops = 0; endNote();
      return;
    }
    polyphonic = false;
    if (heard.midi === candMidi) candHops += 1;
    else { candMidi = heard.midi; candHops = 1; }
    if (candHops === NOTE_AGREE && candMidi !== noteMidi) {
      endNote();
      noteMidi = candMidi;
      noteStartT = Date.now();
    }
  }

  function endNote() {
    if (!noteMidi) return;
    // MIN_NOTE_MS is the floor three agreeing hops can even represent; a
    // shorter run is a glitch, not a note, and gets counted rather than kept.
    if (Date.now() - noteStartT >= MIN_NOTE_MS) {
      phrase.push(noteMidi);
      while (phrase.length > PHRASE_MAX) phrase.shift();
      lastNoteT = Date.now();
    } else dropped += 1;
    noteMidi = 0;
  }

  function endPhrase() { endNote(); candMidi = 0; candHops = 0; }

  // --- the analysis hop ------------------------------------------------------
  function step() {
    if (!analyser) return;
    const nowT = performance.now();
    if (lastStepT) {
      const dtMs = nowT - lastStepT;
      // Ignore absurd gaps (tab was hidden); they are not a hop, they are a hole.
      if (dtMs < HOP_MS * 8) hopMs = hopMs * 0.9 + dtMs * 0.1;
    }
    // A HOP THAT IS NOT A HOP MUST NOT JOIN TWO NOTES. A hidden tab clamps
    // setInterval to 1 Hz — exactly when the presence is alive and the host has
    // stepped away — so three "consecutive" hops could span three seconds and
    // fabricate a melody out of unrelated sounds. The gap is measured above;
    // here it abandons whatever phrase was open.
    if (lastStepT && nowT - lastStepT > HOP_MS * PITCH_EVERY * 1.5) endPhrase();
    lastStepT = nowT;
    hopN += 1;
    analyser.getByteFrequencyData(spec);
    analyser.getByteTimeDomainData(time);

    // loudness: RMS of the waveform about the 128 midpoint
    let sum = 0;
    for (let i = 0; i < time.length; i++) { const v = (time[i] - 128) / 128; sum += v * v; }
    rms = Math.sqrt(sum / time.length);
    // Percussive music is mostly silence between hits: at 128bpm a kick fills
    // ~9% of the hop. Sampling RMS instantaneously therefore reports "very
    // faint" for a loud track and trips the silence detector on every gap.
    // Track a fast-attack / slow-release envelope instead — it follows a hit up
    // immediately and decays over ~1s, which is what "how loud is this" means.
    rmsAvg = rms > rmsAvg ? rms : rmsAvg * 0.94 + rms * 0.06;
    // the ear rides the same hop, at half its rate — YIN is the expensive part
    if (pitchAnalyser && hopN % PITCH_EVERY === 0) hearNote();

    // spectral flux (positive change only) = the onset signal, and the
    // brightness centroid, in one pass over the bins
    let f = 0, wsum = 0, msum = 0, b = 0, m = 0, t = 0;
    for (let i = 0; i < spec.length; i++) {
      const v = spec[i];
      const d = v - prevSpec[i];
      if (d > 0) f += d;
      wsum += v * i; msum += v;
      if (i < binBass) b += v; else if (i < binMid) m += v; else t += v;
    }
    prevSpec.set(spec);
    flux = f / spec.length;
    const loudEnough = msum > spec.length * 2;   // ~2/255 average bin: real signal
    if (loudEnough) {
      centroid = (wsum / msum) / spec.length;    // 0..1
      const tot = b + m + t || 1;
      bass = b / tot; mid = m / tot; treble = t / tot;
      const k = shapeSeen < 20 ? 0.25 : 0.06;    // settle fast, then hold steady
      centAvg = centAvg * (1 - k) + centroid * k;
      bassAvg = bassAvg * (1 - k) + bass * k;
      midAvg = midAvg * (1 - k) + mid * k;
      trebAvg = trebAvg * (1 - k) + treble * k;
      shapeSeen++;
    }

    env[envI] = flux;
    envI = (envI + 1) % ENV_N;
    if (envFilled < ENV_N) envFilled++;

    if (rmsAvg < 0.005) { if (!silentSince) silentSince = Date.now(); }
    else silentSince = 0;

    // Tempo is only re-estimated once a second: autocorrelation over 400
    // samples × 45 lags is ~18k multiply-adds, which is nothing once a second
    // and pointless 50 times a second — the estimate cannot move that fast.
    if (envFilled >= ENV_N && envI % HOP_HZ === 0) estimateTempo();
  }

  // Onset-envelope autocorrelation. The envelope is mean-removed first, or the
  // DC component dominates every lag and the peak lands wherever the window
  // happens to end.
  function estimateTempo() {
    const n = ENV_N;
    const buf = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) { buf[i] = env[(envI + i) % n]; mean += buf[i]; }
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) { buf[i] -= mean; energy += buf[i] * buf[i]; }
    if (energy < 1e-6) { bpm = 0; bpmConf = 0; return; }

    // Correlate once, keep the whole curve — the runner-up has to be chosen
    // with knowledge of where the peak landed, which a single streaming pass
    // cannot do.
    const corr = new Float32Array(LAG_MAX + 1);
    let bestLag = 0, best = 0;
    for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
      let acc = 0;
      for (let i = 0; i + lag < n; i++) acc += buf[i] * buf[i + lag];
      acc /= (n - lag);                    // normalise: long lags overlap less
      corr[lag] = acc;
      if (acc > best) { best = acc; bestLag = lag; }
    }
    // The runner-up must come from OUTSIDE the peak's own shoulder. Taking the
    // second-highest lag anywhere compares lag 42 against lag 43, which are
    // nearly identical for any real signal — so confidence collapsed to ~0 on
    // actual music while looking fine on synthetic clicks, where the peak is a
    // spike with no shoulder at all. Excluding a +/-15% window measures what was
    // actually intended: how much this tempo beats a genuinely DIFFERENT one.
    let second = 0;
    const lo = bestLag * 0.85, hi = bestLag * 1.15;
    for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
      if (lag >= lo && lag <= hi) continue;
      if (corr[lag] > second) second = corr[lag];
    }
    if (!bestLag || best <= 0) { bpm = 0; bpmConf = 0; return; }
    const raw = 60000 / (bestLag * hopMs);   // measured hop, not the nominal one
    // Autocorrelation cannot tell a beat from its half or double. Fold into the
    // range most music actually sits in rather than reporting a confident 61bpm
    // for a 122bpm track.
    let v = raw;
    while (v < 70) v *= 2;
    while (v > 180) v /= 2;
    bpm = Math.round(v);
    // Confidence = how much the winning lag beat the runner-up. A flat
    // correlation surface means "no steady pulse", which we must not dress up
    // as a tempo.
    bpmConf = second > 0 ? Math.max(0, Math.min(1, 1 - second / best)) : 1;
    if (onChange) onChange(read());
  }

  // --- public --------------------------------------------------------------
  async function listenToStream(s, kind) {
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    stopStream();
    stream = s;
    // Video tracks come along for the ride with getDisplayMedia and cost real
    // memory for something nobody watches — drop them immediately.
    for (const tr of s.getVideoTracks()) { tr.stop(); s.removeTrack(tr); }
    if (!s.getAudioTracks().length) throw new Error('no-audio-track');
    // If the user stops sharing from the browser's own bar, we must notice.
    s.getAudioTracks()[0].addEventListener('ended', () => { stop(); if (onChange) onChange(read()); });
    wire(ctx.createMediaStreamSource(s), kind);
    return true;
  }

  return {
    // Tab or system audio. The one path that can hear a DRM service — not by
    // breaking the DRM, but because the USER chooses to share their own output.
    // Chromium only; Safari gives no audio here and Firefox has no tab audio.
    async listenToTab() {
      const md = navigator.mediaDevices;
      if (!md || !md.getDisplayMedia) throw new Error('unsupported');
      const s = await md.getDisplayMedia({
        video: true,                       // required: audio-only is rejected
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      return listenToStream(s, 'tab');
    },
    // The room itself.
    async listenToMic() {
      const md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) throw new Error('unsupported');
      // noiseSuppression MUST be off. Chrome defaults it to true, and it is a
      // speech-optimised nonlinear gate: it high-passes around 80 Hz and
      // attenuates exactly the sustained content a piano note becomes after its
      // attack. listenToTab already says so; the room deserves the same ears.
      const s = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      return listenToStream(s, 'mic');
    },
    // A file the host opened here: the only source we both play AND hear.
    // An element can be handed to createMediaElementSource exactly ONCE, ever —
    // a second call on the same element throws and takes the player down with
    // it. Since the player reuses one <audio> for every track, the node is
    // cached per element and simply re-tapped.
    listenToElement(el, kind = 'file') {
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      let node = elSources.get(el);
      if (!node) {
        node = ctx.createMediaElementSource(el);
        node.connect(ctx.destination);     // still audible; the analyser taps it
        elSources.set(el, node);
      }
      wire(node, kind);
      return true;
    },
    stop,
    onUpdate(fn) { onChange = fn; },
    read,
    // WHAT IT HEARD AS MUSIC, kept apart from read()'s loudness/brightness the
    // same way music.js keeps authored metadata apart from measured sound.
    // Everything here is either true or absent — there is no middle setting.
    readMusical() {
      if (!pitchAnalyser) return { hearing: false };
      const names = phrase.map((m) => noteOf(440 * (2 ** ((m - 69) / 12))).name);
      return {
        hearing: true,
        notes: names,
        midis: phrase.slice(),
        // the shape, which is what actually identifies a tune across keys
        intervals: phrase.slice(1).map((m, i) => m - phrase[i]),
        key: keyNow && keyNow.confident ? keyNow.name : null,
        keyDetail: keyNow,
        // an honest name for "something is sounding and it is not one line"
        chords: polyphonic && !phrase.length,
        dropped,
        since: lastNoteT ? Date.now() - lastNoteT : 0,
      };
    },
    // The rolling string the settings readout shows — last eight notes.
    heardLine() {
      if (!pitchAnalyser) return '';
      if (!phrase.length) return polyphonic ? 'chords — no single line to follow' : '';
      const tail = phrase.slice(-8).map((m) => noteOf(440 * (2 ** ((m - 69) / 12))).name).join(' ');
      const k = keyNow && keyNow.confident ? ' · ' + keyNow.name : '';
      const d = dropped ? ` · ${dropped} too short or too high to name` : '';
      return tail + k + d;
    },
    get hearing() { return !!analyser; },
    get kind() { return sourceKind; },
  };

  function stopStream() {
    if (!stream) return;
    for (const tr of stream.getTracks()) { try { tr.stop(); } catch { /* already stopped */ } }
    stream = null;
  }
  function stop() {
    detachGraph(); stopStream(); sourceKind = '';
    bpm = 0; bpmConf = 0; rms = 0; rmsAvg = 0;
    centAvg = 0; bassAvg = 0; midAvg = 0; trebAvg = 0; shapeSeen = 0;
  }

  function read() {
    if (!analyser) return { hearing: false };
    const quiet = silentSince && Date.now() - silentSince > 1500;
    return {
      hearing: true, source: sourceKind, silent: !!quiet,
      loudness: +rmsAvg.toFixed(4), brightness: +centAvg.toFixed(3),
      bass: +bassAvg.toFixed(3), mid: +midAvg.toFixed(3), treble: +trebAvg.toFixed(3),
      bpm: bpmConf > 0.12 ? bpm : 0, bpmConfidence: +bpmConf.toFixed(2),
    };
  }
}

// ---------------------------------------------------------------------------
// Words, not numbers.
//
// The AI gets a phrase, not a feature vector — but every phrase below is tied
// to a stated threshold, so it can never describe something the ear did not
// actually measure. Note what is NOT here: no genre, no mood, no instrument, no
// song title. None of that is recoverable from an FFT, and guessing it would be
// the AI hallucinating with a straight face.
// ---------------------------------------------------------------------------
export function describe(f) {
  if (!f || !f.hearing) return '';
  if (f.silent) return 'silence';
  const w = [];
  if (f.loudness > 0.28) w.push('loud');
  else if (f.loudness > 0.12) w.push('full');
  else if (f.loudness > 0.04) w.push('quiet');
  else w.push('very faint');

  // Brightness and band balance are separate measurements and must not be
  // conflated: a mid-forward mix reads LOW on the centroid while carrying almost
  // no bass, and calling that "bass-heavy" contradicts the very numbers it came
  // from. Brightness describes where the energy sits; the band phrase only
  // appears when one band genuinely dominates.
  if (f.brightness > 0.32) w.push('bright');
  else if (f.brightness > 0.16) w.push('balanced');
  else w.push('dark');

  if (f.bass > 0.5) w.push('heavy low end');
  else if (f.treble > 0.4) w.push('lots of top end');
  else if (f.mid > 0.6) w.push('mid-forward');

  if (f.bpm) {
    const steady = f.bpmConfidence > 0.35 ? 'steady' : 'loose';
    w.push(`a ${steady} pulse around ${f.bpm} bpm`);
  } else {
    w.push('no clear pulse');
  }
  return w.join(', ');
}
