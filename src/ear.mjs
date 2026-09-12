// THE EAR — turning sound into the only thing a presence can afford to hear:
// note names.
//
// Colin asked whether it could listen to a piano and say "that's Für Elise" or
// "that was not in key". The honest answer splits in two, and this file is
// built around the split rather than papering over it.
//
// ONE LINE AT A TIME — a melody, a whistle, a hummed phrase — is a solved
// problem, and YIN solves it well. TWO HANDS AT ONCE is not: polyphonic
// transcription is a research problem, and worse, the failure is a confident
// one. YIN on a C4+E4 dyad returns C2 with clarity 0.93, because the chord's
// waveform genuinely repeats at the greatest common divisor of its periods.
// The algorithm is right; the report would be a lie. So every pitch here has
// to survive a harmonic corroboration test before it is allowed to be called
// a note, and what a chord produces instead is an honest "chords are sounding;
// I cannot pick a line out of them".
//
// Nothing in this file touches the microphone, the DOM, or an AudioContext. It
// is pure arithmetic over buffers a caller supplies, which is what lets the
// whole risky half of the feature be proven by `node test/ear.test.mjs` before
// anything is wired to a real room.

// A note is not a note until three consecutive hops agree on it. 1024 samples
// at 12 kHz is 85.3 ms, and three hops at 40 ms spans 165 from the onset —
// so passages faster than about six notes a second are simply invisible here,
// and the design says so out loud rather than inventing them.
export const MIN_NOTE_MS = 165;

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// --- PITCH -------------------------------------------------------------------

// YIN (de Cheveigné & Kawahara 2002), with the one deviation that matters.
//
// THE SAMPLE RATE IS AN ARGUMENT AND MUST STAY ONE. A hard-coded 12000 against
// a 44,100 Hz context reports C4 as 287 Hz — a semitone and a half sharp, with
// clarity 0.99, on half the Macs in the world. listen.js already carries the
// comment forbidding exactly this sin about its band edges; this is the same
// sin one layer down.
export function yin(buf, sr, { tauMin, tauMax, threshold = 0.12 } = {}) {
  const N = buf.length;
  const tMin = Math.max(2, tauMin || Math.floor(sr / 1500));
  const tMax = Math.min(tauMax || Math.ceil(sr / 30), Math.floor(N / 2));
  if (tMax <= tMin) return { f0: 0, clarity: 0 };

  // squared difference over the whole lag range
  const d = new Float64Array(tMax + 1);
  for (let tau = 1; tau <= tMax; tau++) {
    let sum = 0;
    for (let j = 0, n = N - tau; j < n; j++) { const diff = buf[j] - buf[j + tau]; sum += diff * diff; }
    d[tau] = sum;
  }

  // Cumulative mean normalised difference, ACCUMULATED FROM tau = 1 — not from
  // tauMin. Starting the running mean at the search floor inflates it for the
  // first lags considered, which drags the normalised curve down exactly where
  // high notes live: that alone was the difference between D#6 reading −1196
  // cents (an octave error) and +3.
  const cmnd = new Float64Array(tMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // first dip below the absolute threshold, walked down to its local minimum
  let tau = -1;
  for (let t = tMin; t <= tMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tMax && cmnd[t + 1] < cmnd[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau < 0) {                       // nothing convincing: take the best dip we have
    let best = tMin;
    for (let t = tMin; t <= tMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    tau = best;
  }

  // parabolic interpolation around the minimum — this is what buys sub-bin
  // accuracy, and without it one integer lag is 38 cents at C4
  let refined = tau;
  if (tau > 1 && tau + 1 <= tMax) {
    const s0 = cmnd[tau - 1], s1 = cmnd[tau], s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s0 - s2);
    if (Math.abs(denom) > 1e-12) refined = tau + (s2 - s0) / denom;
  }
  return {
    f0: refined > 0 ? sr / refined : 0,
    clarity: Math.max(0, Math.min(1, 1 - cmnd[tau])),
  };
}

// THE PHANTOM GUARD, and it is the difference between a feature and a liar.
//
// Energy at f0 alone is not enough. It separates a real note (0.91) from a
// chord's GCD phantom (0.02) in silence — but 60 Hz mains hum at −26 dBFS
// lifts the phantom to 0.131, over any sane threshold, and the presence
// announces a C2 that nobody played. So we also require the PARTIALS: a real
// note has energy at 2f0 and 3f0, while a phantom's "harmonics" are the actual
// notes being played, which sit somewhere else entirely and leave 2f0 and 3f0
// empty. Cost is two three-bin scans.
export function harmonicGuard(mag, sr, fftSize, f0, { floor = 0.12, partial = 0.06, peaky = 4 } = {}) {
  if (!(f0 > 0) || !mag || !mag.length) return false;
  let peak = 0, sum = 0;
  for (let i = 0; i < mag.length; i++) { if (mag[i] > peak) peak = mag[i]; sum += mag[i]; }
  if (!(peak > 0)) return false;
  // THE SPECTRUM MUST BE PEAKY AT ALL. Found by a test, and obvious in
  // hindsight: under flat broadband noise every bin EQUALS the peak, so both
  // ratios below are 1.0 and hiss sails through as a confident note. A tone
  // stands far above the floor; noise, by definition, does not.
  if (peak * mag.length < peaky * sum) return false;
  const at = (f) => {
    const b = Math.round((f * fftSize) / sr);
    let m = 0;
    for (let k = b - 1; k <= b + 1; k++) if (k >= 0 && k < mag.length && mag[k] > m) m = mag[k];
    return m / peak;
  };
  return at(f0) >= floor && Math.max(at(f0 * 2), at(f0 * 3)) >= partial;
}

// The note a frequency is nearest to, and how far off it sits. `cents` is here
// for gating only — it is never reported. One integer lag at 12 kHz is 38
// cents at C4 and 77 at C5, and piano inharmonicity adds a uniform bias the
// algorithm cannot separate from real tuning, so any claim about a note being
// "slightly sharp" would be invented.
export function noteOf(freq) {
  if (!(freq > 0)) return null;
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  if (midi < 12 || midi > 120) return null;
  return {
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1),
    cents: Math.round((exact - midi) * 100),
  };
}

// The shape of a melody, which is what actually identifies a tune: Für Elise
// is the same piece in any key, and a model recognises it from its intervals
// far more reliably than from absolute pitches it may have heard transposed.
export function intervalsOf(midis) {
  const out = [];
  for (let i = 1; i < midis.length; i++) out.push(midis[i] - midis[i - 1]);
  return out;
}

// --- HARMONY -----------------------------------------------------------------

// A twelve-bin pitch-class profile. PEAK-PICKED on purpose: summing every bin
// lets broadband noise and the room's own hum smear across all twelve and
// flatten the profile into mush, which is precisely when key estimation starts
// inventing answers. Only local maxima — actual partials — get a vote.
export function chroma(mag, sr, fftSize, { fMin = 55, fMax = 2200 } = {}) {
  const out = new Float64Array(12);
  const lo = Math.max(1, Math.floor((fMin * fftSize) / sr));
  const hi = Math.min(mag.length - 2, Math.ceil((fMax * fftSize) / sr));
  for (let k = lo; k <= hi; k++) {
    if (!(mag[k] > mag[k - 1] && mag[k] >= mag[k + 1])) continue;
    const f = (k * sr) / fftSize;
    const midi = 69 + 12 * Math.log2(f / 440);
    out[((Math.round(midi) % 12) + 12) % 12] += mag[k];
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += out[i];
  if (sum > 0) for (let i = 0; i < 12; i++) out[i] /= sum;
  return out;
}

// Krumhansl–Kessler probe-tone profiles: how strongly each scale degree is
// felt as "belonging" in a key. Correlating a chroma against all 24 rotations
// is the standard estimator, and it works on polyphonic audio — which is why
// "that was not in key" survives when "that was a C major chord" does not.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
  ma /= 12; mb /= 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

// THE GATE IS THE FEATURE. Krumhansl–Kessler gets Für Elise wrong — it prefers
// E minor at r=0.695 over the true A minor at 0.598 — and a five-note phrase
// cannot pin a key at all. So this abstains loudly rather than guessing: a key
// is only "confident" when it beats the runner-up by a clear margin, correlates
// well in absolute terms, and has enough distinct pitch classes to be talking
// about music at all. Abstention is what stops a presence correcting Beethoven.
export function estimateKey(ch, { minGap = 0.10, minR = 0.70, minDistinct = 6 } = {}) {
  const distinct = Array.from(ch).filter((v) => v > 0.02).length;
  const scored = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rot = new Array(12);
    for (let i = 0; i < 12; i++) rot[i] = ch[(i + tonic) % 12];
    scored.push({ tonic, mode: 'major', r: pearson(rot, KK_MAJOR) });
    scored.push({ tonic, mode: 'minor', r: pearson(rot, KK_MINOR) });
  }
  scored.sort((a, b) => b.r - a.r);
  const best = scored[0];
  const gap = best.r - scored[1].r;
  // the tonic must actually be sounding — a key whose own root is absent from
  // the audio is a correlation artefact, not a key
  const tonicStrong = ch[best.tonic] >= 0.08;
  return {
    tonic: best.tonic,
    mode: best.mode,
    name: `${NOTE_NAMES[best.tonic]} ${best.mode}`,
    r: best.r,
    gap,
    distinct,
    tonicStrong,
    confident: gap >= minGap && best.r >= minR && distinct >= minDistinct && tonicStrong,
  };
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

// "That was not in key" needs a HIGHER bar than knowing the key at all, and
// deliberately so. Für Elise's true key survives the abstention gate by four
// thousandths of a correlation unit; if it tipped, a presence would tell Colin
// that Beethoven had put a wrong note in. Blue notes, chromatic passing tones
// and deliberate modulation are all normal music that this would otherwise
// scold. So: only inside a key we are markedly sure of, and only for a note
// genuinely outside its scale.
export function outOfKey(midi, key, { minGap = 0.20 } = {}) {
  if (!key || !key.confident || !key.tonicStrong || key.gap < minGap) return false;
  const scale = key.mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const degree = (((midi - key.tonic) % 12) + 12) % 12;
  return !scale.includes(degree);
}
