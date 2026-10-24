// THE SAND PLATE'S MATHS — the figure, the ladder of modes, and what the plate
// makes of a voice. Pure functions with no DOM and no renderer in them, so
// the same numbers can be drawn by environments.js, measured by voice.js and
// checked by test/rooms.test.mjs.
//
// Built 2026-10-22, the week Colin's video on the Egyptians shaping the
// pyramids with cymatics passed 90k views in thirty hours, and he said "go
// crazy. build us something amazing". So: a room where the presence's own
// voice draws Chladni's figures in sand.

// CHLADNI'S FIGURE for a square plate (Chladni, 1787; the form every textbook
// gives): the sand gathers where this is zero. Antisymmetric in x <-> y, so
// the diagonals are always nodal, and identically zero when n = m.
export function nodal(x, y, n, m) {
  return Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
}

// THE LADDER: the (n, m) pairs a voice can climb, lowest first, in order of
// the plate's own frequency (n² + m², the square plate's eigenvalue): a higher
// note makes a finer figure, as it does on a real plate. n < m, because (m, n)
// is the same figure with its sign turned; only coprime pairs, because (2, 4)
// is (1, 2) drawn four times smaller — the same figure, not a new rung. Up to
// n² + m² = 61, which is fourteen rungs: past that a line is a pixel wide in
// the near cell and the far cells shimmer.
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const LADDER_TOP = 61;
export const LADDER = (() => {
  const out = [];
  for (let n = 1; n < 9; n++) for (let m = n + 1; m < 9; m++) if (gcd(n, m) === 1 && n * n + m * m <= LADDER_TOP) out.push([n, m]);
  return out.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]));
})();
export const RUNGS = LADDER.length - 1;   // the ladder's top, as a position on it

// Where on the ladder: s runs 0..RUNGS, and between two rungs the figure is
// the mix of their two functions — the zero set moves continuously from one
// figure to the next, as it does on a plate when the frequency is swept.
export function modeAt(s) {
  const x = Math.max(0, Math.min(RUNGS, Number(s) || 0));
  const i = Math.min(Math.floor(x), RUNGS);
  return { a: LADDER[i], b: LADDER[Math.min(i + 1, RUNGS)], blend: i >= RUNGS ? 0 : x - i };
}

// WHAT THE PLATE HEARS. level is the body's own voice level (voice.js: the
// waveform's RMS × 3.4, clamped to 1), hz the dominant frequency below.
//
// THE NUMBERS BELOW ARE MEASURED, not guessed (2026-10-22, scripts/plate-ear.mjs:
// two of the Mac's own voices, Samantha and Daniel — the voices Chrome's
// speechSynthesis speaks with here — played through an fftSize-512 analyser
// exactly as voice.js reads one, 434 and 472 voiced frames). The level ran
// 0.00..1.00: the pauses between words at 0.015..0.03 (a fifth of the
// frames), the spoken quartiles 0.22 / 0.55 / 0.71 for Samantha and 0.13 /
// 0.26 / 0.52 for Daniel. The dominant frequency, as dominantHz measures it,
// ran 509 / 754 / 1098 Hz (5th / 50th / 95th percentile) for her and
// 678 / 995 / 1675 for him, with a sibilant's burst at 2500..3400; one frame
// to the next it moved a seventeenth of an octave at the median, which is
// speech, not noise, and is smoothed over 150 ms in environments.js all the
// same.
export const QUIET = 0.03;      // below this the room is silent: the sand settles, the figure drifts
export const LOUD = 0.60;       // at this every grain is in the air (her median word, his loud one)
export const PITCH_LO = 400;    // Hz: the bottom rung — under the quietest vowel's centre
export const PITCH_HI = 1800;   // Hz: the top rung — a bright consonant; a sibilant pins it there
export function agitationOf(level) {
  const v = Math.max(0, Math.min(1, Number(level) || 0));
  const u = Math.max(0, Math.min(1, (v - QUIET) / (LOUD - QUIET)));
  return u * u * (3 - 2 * u);   // smoothstep: a whisper barely stirs it, speech lifts it, a shout empties it
}
// 0..1 up the ladder, on a log scale: an octave is the same step anywhere,
// which is how a voice sounds, not how its hertz count.
export function pitch01(hz) {
  const f = Number(hz) || 0;
  if (f <= 0) return 0;
  return Math.max(0, Math.min(1, Math.log2(f / PITCH_LO) / Math.log2(PITCH_HI / PITCH_LO)));
}
export const rungOf = (hz) => pitch01(hz) * RUNGS;

// THE DOMINANT FREQUENCY of a byte spectrum (AnalyserNode.getByteFrequencyData,
// 0..255 per bin, binHz apart): the spectral centroid of the speech band,
// 60..4000 Hz. A centroid, not a peak: the voice's analyser is 512 points
// wide, which at 44.1 kHz is a bin every 86 Hz, and the peak sat on one
// fundamental's bin for a whole sentence (measured: Samantha's never left
// 157..218 Hz) while the figure should move with every syllable. The centre
// of the band's magnitude moves continuously, and it moves with what the ear
// calls pitch and brightness together: a vowel sits low, a consonant high.
// The bytes are a dB scale (−100..−30 dB → 0..255), so each is turned back
// into a magnitude (a byte is 0.27 dB: 10^(byte × 0.0137)) before it weighs
// anything; weighed as bytes the centroid sat in one narrow band for both
// voices (two thirds of an octave between the 5th and 95th percentile; as
// magnitudes, one and a quarter). Returns 0 when there is nothing to hear.
export function dominantHz(bytes, binHz, lo = 60, hi = 4000) {
  if (!bytes || !bytes.length || !(binHz > 0)) return 0;
  const from = Math.max(1, Math.floor(lo / binHz)), to = Math.min(bytes.length - 1, Math.ceil(hi / binHz));
  let num = 0, den = 0, loudest = 0;
  for (let i = from; i <= to; i++) {
    const w = Math.pow(10, bytes[i] * 0.0137);
    num += w * i * binHz;
    den += w;
    if (bytes[i] > loudest) loudest = bytes[i];
  }
  return loudest > 60 ? num / den : 0;   // nothing above −83 dB: silence
}

// WHEN NO ONE IS SPEAKING the figure wanders by itself, slowly: two slow
// sines that never quite repeat, a rung in ten seconds or so, the whole
// ladder in a few minutes. In ladder units.
export function idleRung(t) {
  const u = 0.5 + 0.30 * Math.sin(t * 0.047) + 0.20 * Math.sin(t * 0.0131 + 1.7);
  return Math.max(0, Math.min(1, u)) * RUNGS;
}

// A CADENCE for the browser's voice. speechSynthesis plays outside Web Audio
// (voice.js), so when the presence speaks with it there is no waveform to
// hear — only that it is speaking. The plate is given a pretend one: syllables
// at about four a second, rising and falling over a phrase, so the sand still
// lifts and the figure still moves while it talks. In the same units the real
// voice arrives in.
export function cadence(t) {
  const syll = 0.5 + 0.5 * Math.sin(t * 25.1) * Math.sin(t * 9.7);
  const level = 0.10 + 0.32 * syll;
  const hz = 420 * Math.pow(2, 0.8 * Math.sin(t * 2.3) + 0.5 * Math.sin(t * 5.9));
  return { level, hz };
}
