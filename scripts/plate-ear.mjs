// LISTEN THE WAY THE SAND PLATE DOES. Speaks a line with the Mac's own voice
// (`say`, the same system voice Chrome's speechSynthesis uses here), plays it
// in headless Chrome through an fftSize-512 AnalyserNode read exactly as
// voice.js reads the presence's voice — RMS × 3.4 for the level, and
// src/plate.mjs's dominantHz on the byte spectrum — and prints what the two
// numbers do over the sentence: percentiles while speaking, how much of the
// time is silence, and how far the frequency jumps from one frame to the
// next. Written 2026-10-22 so the plate's mapping (QUIET, LOUD, PITCH_LO,
// PITCH_HI in src/plate.mjs) could be chosen from measured values rather
// than guessed. For eyes, not for CI: needs Chrome, macOS and a running
// `node server.mjs` (any page of it: the module is fetched from it).
//
//   Y3K_URL=http://127.0.0.1:5213 node scripts/plate-ear.mjs
//   VOICE=Samantha TEXT='…' OUT=/tmp/y3k-shot   SERIES=1 prints every frame
//   Y3K_CDP_PORT, Y3K_PROFILE   Chrome's port and profile (see cdp.mjs)
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const TEXT = process.env.TEXT || 'The sand gathers where the plate is still. Every figure is a place the plate does not move, and the voice that draws it never touches it. Strike it, and it sings.';
const VOICE = process.env.VOICE || 'Samantha';
const OUT = process.env.OUT || '/tmp/y3k-shot';
mkdirSync(OUT, { recursive: true });
const aiff = join(OUT, 'plate-ear.aiff'), wav = join(OUT, 'plate-ear.wav');
execFileSync('say', ['-v', VOICE, '-o', aiff, TEXT]);
execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', '-c', '1', aiff, wav]);
const b64 = readFileSync(wav).toString('base64');

const b = await launch({ width: 800, height: 600 });
try {
  await b.goto(base + '/');
  await b.sleep(500);
  const got = await b.evaluate(`(async () => {
    const { dominantHz } = await import('/src/plate.mjs');
    const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
    const ctx = new AudioContext();
    try { await ctx.resume(); } catch {}
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const an = ctx.createAnalyser(); an.fftSize = 512;   // as voice.js builds its meters
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(an); an.connect(ctx.destination);
    const td = new Uint8Array(an.frequencyBinCount), fd = new Uint8Array(an.frequencyBinCount);
    const binHz = ctx.sampleRate / an.fftSize;
    const rows = [];
    const t0 = performance.now();
    src.start();
    await new Promise((done) => {
      const tick = () => {
        an.getByteTimeDomainData(td);
        let s = 0; for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; s += v * v; }
        const level = Math.min(Math.sqrt(s / td.length) * 3.4, 1);
        an.getByteFrequencyData(fd);
        rows.push([Math.round(performance.now() - t0), +level.toFixed(3), Math.round(dominantHz(fd, binHz)), Array.from(fd.subarray(0, 60))]);   // the first 60 bins (to ~5 kHz) kept for the offline look
        if (performance.now() - t0 < buf.duration * 1000 + 300) setTimeout(tick, 16); else done();
      };
      tick();
    });
    return { sampleRate: ctx.sampleRate, binHz, duration: buf.duration, state: ctx.state, rows };
  })()`);
  const { rows } = got;
  const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const line = (name, xs) => `${name}: n=${xs.length} p5=${pct(xs, 0.05)} p25=${pct(xs, 0.25)} p50=${pct(xs, 0.5)} p75=${pct(xs, 0.75)} p95=${pct(xs, 0.95)} max=${Math.max(0, ...xs)}`;
  const QUIET = 0.03;
  const voiced = rows.filter((r) => r[1] > QUIET);
  console.log(`voice ${VOICE}, ${got.duration.toFixed(2)}s, sampleRate ${got.sampleRate}, bin ${got.binHz.toFixed(1)} Hz, context ${got.state}, ${rows.length} frames`);
  console.log(line('level (all frames)', rows.map((r) => r[1])));
  console.log(line('level (level > QUIET)', voiced.map((r) => r[1])));
  console.log(`silent frames (level <= ${QUIET}): ${(100 * (rows.length - voiced.length) / rows.length).toFixed(0)}%`);
  console.log(line('hz (level > QUIET)', voiced.map((r) => r[2])));
  console.log(line('hz (level > 0.15)', rows.filter((r) => r[1] > 0.15).map((r) => r[2])));
  const jumps = [];
  for (let i = 1; i < voiced.length; i++) if (voiced[i][2] && voiced[i - 1][2]) jumps.push(Math.abs(Math.log2(voiced[i][2] / voiced[i - 1][2])));
  console.log(line('frame-to-frame |log2 ratio| of hz, voiced', jumps.map((j) => +j.toFixed(3))));
  const frames100 = rows.filter((r, i) => i % 6 === 0).map((r) => `${r[0]}:${r[1]}/${r[2]}`).join(' ');
  console.log('every ~100ms (ms:level/hz):', frames100);
  if (process.env.SERIES) console.log(JSON.stringify(rows.map((r) => r.slice(0, 3))));
  writeFileSync(join(OUT, `plate-ear-${VOICE}.json`), JSON.stringify(got));
  console.log('wrote', join(OUT, `plate-ear-${VOICE}.json`));
} finally { await b.close(); }
