// LOOK AT THE SAND PLATE WHILE IT IS SPOKEN TO. Signs in as the founder on a
// LOCAL server (never the live site), goes to the sand plate, and speaks a
// line into it the way the presence's voice does: real speech (the Mac's own
// `say`, the voice Chrome's speechSynthesis uses here) played through an
// fftSize-512 AnalyserNode and handed to the page's own bus each frame —
// window.Y3K.body.setAudioLevel(level, hz), exactly what voice.js's meters
// call — so the figure follows the words and the grains lift. Photographs it
// mid-sentence, at the moments asked for, then again once it has settled.
// Written 2026-10-22 because a service voice needs a key this script must
// not spend, and the browser's voice plays outside Web Audio (nothing to
// measure); this is the real path from the body down, with the real sound.
// For eyes, not for CI: needs Chrome, macOS and a running `node server.mjs`.
//
//   Y3K_URL=http://127.0.0.1:5213 node scripts/plate-shot.mjs
//   AT=1.2,2.6        seconds into the sentence to photograph (default 1.4,3.2)
//   SETTLE=4          seconds after it to photograph the settled sand
//   W=1400 H=900 MOBILE=1 GFX=high OUT=/tmp/y3k-shot TAG=suffix VOICE=Samantha TEXT='…'
//   Y3K_PASSWORD (else FOUNDER_PASSWORD from .env); Y3K_CDP_PORT, Y3K_PROFILE (cdp.mjs)
import { launch, dotenv } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const W = Number(process.env.W || 1400), H = Number(process.env.H || 900);
const AT = (process.env.AT || '1.4,3.2').split(',').map(Number).filter((n) => n > 0);
const SETTLE = Number(process.env.SETTLE || 4);
const OUT = process.env.OUT || '/tmp/y3k-shot';
const TAG = process.env.TAG ? '-' + process.env.TAG : '';
const VOICE = process.env.VOICE || 'Samantha';
const TEXT = process.env.TEXT || 'The sand gathers where the plate is still. Every figure is a place the plate does not move, and the voice that draws it never touches it.';
const mobile = !!process.env.MOBILE;
let password = process.env.Y3K_PASSWORD || '';
if (!password) {
  try { password = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env')).FOUNDER_PASSWORD || ''; } catch { /* none */ }
}
mkdirSync(OUT, { recursive: true });
const aiff = join(OUT, 'plate-shot.aiff'), wav = join(OUT, 'plate-shot.wav');
execFileSync('say', ['-v', VOICE, '-o', aiff, TEXT]);
execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', '-c', '1', aiff, wav]);
const b64 = readFileSync(wav).toString('base64');

const b = await launch({ width: W, height: H, mobile });
try {
  await b.goto(base + '/');
  await b.sleep(1000);
  const login = await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(password)}})}).then(r=>r.status)`);
  const agree = await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  console.log('login', login, 'agree', agree);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:'plate'})); 'ok'`);
  await b.goto(base + '/?gfx=' + (process.env.GFX || 'high'));
  for (let i = 0; i < 90; i++) {
    await b.sleep(1000);
    const c = await b.evaluate('document.body.className');
    if (/in-home/.test(c) && await b.evaluate('!!(window.Y3K && window.Y3K.body && window.__y3kScene)')) break;
  }
  await b.evaluate(`window.Y3K.settings.setRoom({ env: 'plate' }); 'ok'`);
  await b.sleep(6000);
  console.log('in', await b.evaluate('window.__y3kScene.envs.current'));
  // speak into it: the sound through an analyser, the numbers through the body's own bus
  await b.evaluate(`(async () => {
    const { dominantHz } = await import('/src/plate.mjs');
    const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
    const ctx = new AudioContext();
    try { await ctx.resume(); } catch {}
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const an = ctx.createAnalyser(); an.fftSize = 512;
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(an); an.connect(ctx.destination);
    const td = new Uint8Array(an.frequencyBinCount), fd = new Uint8Array(an.frequencyBinCount);
    const binHz = ctx.sampleRate / an.fftSize;
    window.__plateSaid = [];
    const t0 = performance.now();
    window.Y3K.body.setSpeaking(true);
    src.start();
    const tick = () => {
      an.getByteTimeDomainData(td);
      let s = 0; for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; s += v * v; }
      const level = Math.min(Math.sqrt(s / td.length) * 3.4, 1);
      an.getByteFrequencyData(fd);
      const hz = dominantHz(fd, binHz);
      window.Y3K.body.setAudioLevel(level, hz);
      window.__plateSaid.push([Math.round(performance.now() - t0), +level.toFixed(2), Math.round(hz)]);
      if (performance.now() - t0 < buf.duration * 1000) setTimeout(tick, 16);
      else { window.Y3K.body.setSpeaking(false); window.Y3K.body.setAudioLevel(0); window.__plateDone = true; }
    };
    tick();
    window.__plateT0 = t0;
    return buf.duration;
  })()`).then((d) => console.log('speaking', d.toFixed(2), 's'));
  let last = 0;
  for (const sec of AT) {
    await b.sleep(Math.max(0, sec * 1000 - last * 1000));
    last = sec;
    const p = join(OUT, `plate-say${sec}${TAG}.png`);
    await b.shot(p);
    const now = await b.evaluate(`(() => { const r = window.__plateSaid; const l = r[r.length - 1] || []; const u = window.__y3kScene.envs; return JSON.stringify({ at: l[0], level: l[1], hz: l[2], frames: r.length }); })()`);
    console.log('shot', p, now);
  }
  for (let i = 0; i < 40; i++) { if (await b.evaluate('!!window.__plateDone')) break; await b.sleep(500); }
  await b.sleep(SETTLE * 1000);
  const p = join(OUT, `plate-settled${TAG}.png`);
  await b.shot(p);
  console.log('shot', p);
  const said = await b.evaluate('JSON.stringify(window.__plateSaid.filter((r, i) => i % 8 === 0))');
  console.log('every ~130ms (ms,level,hz):', said);
  const errs = b.logs.filter((l) => /^\[(error|exception)\]/.test(l) && !/404/.test(l));
  if (errs.length) console.log('ERRORS:\n' + errs.slice(-12).join('\n'));
} finally { await b.close(); }
