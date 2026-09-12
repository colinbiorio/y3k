// Adversarial tests for THE EAR — the arithmetic that decides whether a
// presence gets to say "that's Für Elise" or has to say "I can't pick a line
// out of chords". Run:  node test/ear.test.mjs
//
// Every one of these guards a way the detector could lie CONFIDENTLY, which is
// the only failure mode that matters here: a wrong note reported with high
// clarity is worse than no note at all, because the presence will say it out
// loud and mean it.
import assert from 'node:assert';
import { yin, harmonicGuard, noteOf, intervalsOf, chroma, estimateKey, outOfKey, MIN_NOTE_MS } from '../src/ear.mjs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// A note as an instrument really makes one: a fundamental plus decaying
// partials. A pure sine is an unfairly easy target and would hide octave errors.
function tone(freq, sr, n = 2048, partials = [1, 0.5, 0.33, 0.22, 0.15]) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 0; h < partials.length; h++) v += partials[h] * Math.sin((2 * Math.PI * freq * (h + 1) * i) / sr);
    buf[i] = v / partials.length;
  }
  return buf;
}
const mix = (a, b) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] + b[i]) / 2; return o; };
const cents = (a, b) => 1200 * Math.log2(a / b);
const hz = (midi) => 440 * (2 ** ((midi - 69) / 12));

// A magnitude spectrum with peaks where a set of partials would put them.
function spectrumOf(freqs, sr, fftSize, { hum = 0, noise = 0 } = {}) {
  const mag = new Float32Array(fftSize / 2);
  const put = (f, a) => { const b = Math.round((f * fftSize) / sr); if (b > 0 && b < mag.length) mag[b] = Math.max(mag[b], a); };
  for (const { f, a } of freqs) put(f, a);
  if (hum > 0) { put(60, hum); put(120, hum * 0.5); }
  if (noise > 0) for (let i = 0; i < mag.length; i++) mag[i] = Math.max(mag[i], noise);
  return mag;
}

console.log('pitch:');

ok('finds a note, and agrees with itself at every sample rate', () => {
  // THE TRAP THIS EXISTS FOR: a hard-coded 12000 against a 44,100 Hz context
  // reports C4 as 287 Hz — a semitone and a half sharp, at clarity 0.99, on
  // half the Macs in the world. The rate must be an argument, always.
  const read = [44100, 48000, 96000].map((sr) => yin(tone(440, sr, 4096), sr).f0);
  for (const f of read) assert.ok(Math.abs(cents(f, 440)) < 2, `440 Hz read as ${f.toFixed(2)}`);
  for (const f of read) assert.ok(Math.abs(cents(f, read[0])) < 2, 'the sample rates disagree with each other');
});

ok('holds across the range a piano actually covers', () => {
  const sr = 12000;
  // C2 up to C6. Above that, 1024 samples at 12 kHz stops being enough cycles
  // and the guard is what catches it — see the unpitched test below.
  for (let midi = 36; midi <= 84; midi += 3) {
    const f = hz(midi);
    const r = yin(tone(f, sr, 4096), sr);
    assert.ok(Math.abs(cents(r.f0, f)) < 25, `midi ${midi} (${f.toFixed(1)} Hz) read as ${r.f0.toFixed(1)}`);
    assert.ok(r.clarity > 0.8, `midi ${midi} clarity only ${r.clarity.toFixed(2)}`);
  }
});

ok('a note names itself the way a person would', () => {
  assert.equal(noteOf(440).name, 'A4');
  assert.equal(noteOf(440).midi, 69);
  assert.equal(noteOf(261.63).name, 'C4');
  assert.equal(noteOf(hz(75)).name, 'D#5');
  assert.equal(noteOf(0), null);
  assert.equal(noteOf(-5), null);
});

ok('a tune is its intervals, so a transposed one still reads', () => {
  // Für Elise's opening, and the same phrase moved up a tone. The shape — and
  // therefore what a model recognises — must be identical.
  const elise = [76, 75, 76, 75, 76, 71, 74, 72, 69];
  const up = elise.map((m) => m + 2);
  assert.deepEqual(intervalsOf(elise), intervalsOf(up));
  assert.deepEqual(intervalsOf(elise).slice(0, 5), [-1, 1, -1, 1, -5]);
});

console.log('\nthe phantom guard — the difference between a feature and a liar:');

ok('YIN really does hear a phantom under a two-note chord', () => {
  // Not a bug being fixed — a fact being documented. A C4+E4 dyad's waveform
  // genuinely repeats at the GCD of its periods, so the algorithm is CORRECT
  // to report ~C2. It is the reporting that would be the lie.
  const sr = 12000;
  const dyad = mix(tone(hz(60), sr, 4096), tone(hz(64), sr, 4096));   // C4 + E4
  const r = yin(dyad, sr);
  const phantom = noteOf(r.f0);
  assert.ok(phantom.midi < 55, `expected a low phantom, got ${phantom.name}`);
  assert.ok(r.clarity > 0.7, 'and it is CONFIDENT, which is what makes it dangerous');
});

ok('a real note passes, in silence and under mains hum', () => {
  const sr = 12000, fft = 4096;
  const f0 = hz(36);                                    // C2
  const parts = [{ f: f0, a: 1.0 }, { f: f0 * 2, a: 0.5 }, { f: f0 * 3, a: 0.33 }];
  assert.equal(harmonicGuard(spectrumOf(parts, sr, fft), sr, fft, f0), true, 'a clean note was rejected');
  // -20 dBFS of 60 Hz hum is a real room, not a hypothetical
  assert.equal(harmonicGuard(spectrumOf(parts, sr, fft, { hum: 0.1 }), sr, fft, f0), true, 'hum broke a real note');
});

ok('a phantom is rejected even when hum lifts it over the floor', () => {
  // THE MEASURED FAILURE: energy-at-f0 alone puts the phantom at 0.131 under
  // hum — over any sane threshold. Requiring the PARTIALS is what saves it: a
  // phantom's harmonics are the actual notes, which sit elsewhere entirely, so
  // 2f0 and 3f0 are empty.
  const sr = 12000, fft = 4096;
  const phantom = hz(36);                               // the C2 that YIN reports
  const real = [{ f: hz(60), a: 1.0 }, { f: hz(64), a: 0.9 },
    { f: hz(72), a: 0.4 }, { f: hz(76), a: 0.35 }];     // C4, E4 and their partials
  assert.equal(harmonicGuard(spectrumOf(real, sr, fft, { hum: 0.14 }), sr, fft, phantom), false,
    'the phantom got through — a presence would announce a note nobody played');
});

ok('silence and noise are never a note', () => {
  const sr = 12000, fft = 4096;
  assert.equal(harmonicGuard(new Float32Array(fft / 2), sr, fft, 220), false);
  assert.equal(harmonicGuard(spectrumOf([], sr, fft, { noise: 0.5 }), sr, fft, 220), false,
    'flat broadband noise has no peak to stand out from and must not pass');
  assert.equal(harmonicGuard(null, sr, fft, 220), false);
  assert.equal(harmonicGuard(spectrumOf([{ f: 220, a: 1 }], sr, fft), sr, fft, 0), false);
});

console.log('\nharmony — and knowing when to say nothing:');

const chromaOf = (midis, sr = 12000, fft = 8192) => chroma(
  spectrumOf(midis.flatMap((m) => [{ f: hz(m), a: 1 }, { f: hz(m) * 2, a: 0.45 }]), sr, fft), sr, fft,
);

ok('a full scale gives up its key', () => {
  const cMajor = estimateKey(chromaOf([60, 62, 64, 65, 67, 69, 71, 72]));
  assert.equal(cMajor.name, 'C major', `read ${cMajor.name} (r=${cMajor.r.toFixed(3)})`);
  assert.ok(cMajor.confident, 'a whole major scale should be confident');
  const aMinor = estimateKey(chromaOf([69, 71, 72, 74, 76, 77, 79, 81]));
  assert.equal(aMinor.tonic, 9, `read ${aMinor.name}`);
});

ok('it abstains rather than guessing at a fragment', () => {
  // Ode to Joy's opening uses five pitch classes. No estimator can pin a key
  // from that, and the honest answer is silence.
  const ode = estimateKey(chromaOf([64, 64, 65, 67, 67, 65, 64, 62]));
  assert.ok(!ode.confident, `claimed ${ode.name} from five pitch classes`);
  assert.ok(ode.distinct < 6, 'the distinct-class gate is what catches this');
  assert.ok(!estimateKey(new Float64Array(12)).confident, 'silence must never have a key');
});

ok('nothing is out of key until the key itself is beyond doubt', () => {
  const key = estimateKey(chromaOf([60, 62, 64, 65, 67, 69, 71, 72]));   // C major
  if (key.confident && key.gap >= 0.20) {
    assert.equal(outOfKey(61, key), true, 'C# is not in C major');   // an actual accidental
    assert.equal(outOfKey(64, key), false, 'E is in C major');
  }
  // the whole point: an unsure key can never scold anyone
  const unsure = { confident: false, tonicStrong: true, gap: 0.9, tonic: 0, mode: 'major' };
  assert.equal(outOfKey(61, unsure), false, 'an unconfident key must abstain');
  const narrow = { confident: true, tonicStrong: true, gap: 0.11, tonic: 0, mode: 'major' };
  assert.equal(outOfKey(61, narrow), false, 'a key that only just won must abstain — this is the Für Elise case');
  const rootless = { confident: true, tonicStrong: false, gap: 0.9, tonic: 0, mode: 'major' };
  assert.equal(outOfKey(61, rootless), false, 'a key whose own root is not sounding is an artefact');
  assert.equal(outOfKey(61, null), false);
});

ok('the segmentation floor is stated, not hidden', () => {
  // 1024 samples at 12 kHz is 85.3 ms; three agreeing hops at 40 ms spans 165.
  // Anything faster than about six notes a second is invisible, and the number
  // is exported so the caller cannot quietly pretend otherwise.
  assert.equal(MIN_NOTE_MS, 165);
});

console.log(`\n${passed} checks passed.`);
