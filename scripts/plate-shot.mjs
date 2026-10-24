// LOOK AT THE SAND PLATE WHILE IT IS SPOKEN TO. Signs in as the founder on a
// LOCAL server (never the live site), goes to the sand plate, and speaks a
// line into it the way the presence's voice does: real speech (the Mac's own
// `say`, the voice Chrome's speechSynthesis uses here) played through an
// fftSize-512 AnalyserNode and read as voice.js reads one — the level, and
// src/plate.mjs's dominantHz — then handed to the page's own bus,
// window.Y3K.body.setAudioLevel(level, hz), the call voice.js's meters make.
// Written 2026-10-22 because a service voice needs a key this script must
// not spend, and the browser's voice plays outside Web Audio (nothing to
// measure); this is the real path from the body down, with real sound in it.
//
// THE WORLD'S CLOCK, HELD (as room-shot.mjs holds it for a tap). On software
// GL a screenshot alone costs the page seconds, so the sentence is first
// played and measured in full, and then REPLAYED: the page's own calls to
// envs.tick are held, and the world is stepped by hand, a sixtieth at a time,
// with each frame's measured level and frequency put on the bus as it goes,
// to each moment asked for; a frame draws that moment and it is photographed.
// Then the sentence ends, the plate is stepped on in silence, and the settled
// sand is photographed. For eyes, not for CI: needs Chrome, macOS and a
// running `node server.mjs`.
//
//   Y3K_URL=http://127.0.0.1:5213 node scripts/plate-shot.mjs
//   AT=1.4,3.2        seconds into the sentence to photograph (default 1.4,3.2)
//   SETTLE=4          seconds of silence after it before the settled picture
//   W=1400 H=900 MOBILE=1 GFX=high OUT=/tmp/y3k-shot TAG=suffix VOICE=Samantha TEXT='…'
//   Y3K_PASSWORD (else FOUNDER_PASSWORD from .env); Y3K_CDP_PORT, Y3K_PROFILE (cdp.mjs)
import { launch, dotenv } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const W = Number(process.env.W || 1400), H = Number(process.env.H || 900);
const AT = (process.env.AT || '1.4,3.2').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
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

  // 1. THE SENTENCE, HEARD: through the analyser, as voice.js hears one
  const heard = await b.evaluate(`(async () => {
    const { dominantHz } = await import('/src/plate.mjs');
    const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
    const ctx = new AudioContext();
    try { await ctx.resume(); } catch {}
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const an = ctx.createAnalyser(); an.fftSize = 512;
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
        rows.push([Math.round(performance.now() - t0), +level.toFixed(3), Math.round(dominantHz(fd, binHz))]);
        if (performance.now() - t0 < buf.duration * 1000 + 100) setTimeout(tick, 16); else done();
      };
      tick();
    });
    return { duration: buf.duration, state: ctx.state, rows };
  })()`);
  console.log(`heard ${heard.duration.toFixed(2)}s of ${VOICE} (context ${heard.state}, ${heard.rows.length} frames)`);

  // 2. THE SENTENCE, REPLAYED INTO THE PLATE with the world's clock held
  const t0 = await b.evaluate(`(() => {
    const e = window.__y3kScene.envs;
    let last = 0;
    if (!e.__tick) { e.__tick = e.tick; e.tick = (dt, t) => { if (!e.__held) e.__tick(dt, t); }; }
    window.__y3kScene.scene.traverse((o) => { const u = o.material && o.material.uniforms; if (u && u.uAgit && u.uTime) last = u.uTime.value; });
    e.__held = true;
    window.__plateRows = ${JSON.stringify(heard.rows)};
    window.Y3K.body.setSpeaking(true);
    return last;
  })()`);
  // step the world from `from` to `to` seconds into the sentence, the bus fed from the rows
  const stepTo = (from, to, spoken) => b.evaluate(`(() => {
    const e = window.__y3kScene.envs, rows = window.__plateRows;
    let s = ${from}, i = 0;
    while (s < ${to} - 1e-6) {
      const dt = Math.min(1 / 60, ${to} - s);
      s += dt;
      if (${spoken}) {
        const ms = s * 1000;
        while (i < rows.length - 1 && rows[i + 1][0] <= ms) i++;
        window.Y3K.body.setAudioLevel(rows[i][1], rows[i][2]);
      }
      e.__tick(dt, ${t0} + s);
    }
    return s;
  })()`);
  let at = 0;
  for (const sec of AT) {
    const to = Math.min(sec, heard.duration);
    await stepTo(at, to, true);
    at = to;
    await b.sleep(1500);   // a frame or two, to draw it
    const p = join(OUT, `plate-say${sec}${TAG}.png`);
    await b.shot(p);
    const row = heard.rows.find((r) => r[0] >= sec * 1000) || heard.rows[heard.rows.length - 1];
    console.log('shot', p, `(${sec}s in: level ${row[1]}, ${row[2]} Hz)`);
  }
  await stepTo(at, heard.duration, true);
  await b.evaluate(`window.Y3K.body.setSpeaking(false); window.Y3K.body.setAudioLevel(0); 'ok'`);
  await stepTo(heard.duration, heard.duration + SETTLE, false);
  await b.sleep(1500);
  const p = join(OUT, `plate-settled${TAG}.png`);
  await b.shot(p);
  console.log('shot', p, `(${SETTLE}s of silence after it)`);
  await b.evaluate('window.__y3kScene.envs.__held = false; "ok"');
  console.log('every ~130ms (ms,level,hz):', JSON.stringify(heard.rows.filter((r, i) => i % 8 === 0)));
  const errs = b.logs.filter((l) => /^\[(error|exception)\]/.test(l) && !/404/.test(l));
  if (errs.length) console.log('ERRORS:\n' + errs.slice(-12).join('\n'));
} finally { await b.close(); }
