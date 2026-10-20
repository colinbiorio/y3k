// LOOK AT THE ROOMS. Signs in as the founder on a LOCAL server (never the live
// site) and photographs the home in each room asked for — and, with TAP, again
// a moment after a tap, so each world's answer can be seen as well as its
// stillness. Written 2026-10-19 for the four new rooms: a sky shader can pass
// every test and still be ugly, and only a look says which. For eyes, not for
// CI: it needs Chrome and a running `node server.mjs`.
//
//   Y3K_URL=http://127.0.0.1:5201 ROOMS=moon,storm node scripts/room-shot.mjs
//   W=1400 H=900          the window (MOBILE=1 W=430 H=932 for a phone: touch is
//                         emulated, so the lighter build is the one drawn)
//   TAP=1.2,3             also shoot 1.2s and 3s after a tap
//   WAIT=8                seconds a world is given to settle before its picture
//   THUMBS=1              also save the Room tab's photographs (512px), no orb
//   GFX=high|mid|low|smooth   OUT=/tmp/y3k-shot   TAG=suffix for the file names
//   Y3K_PASSWORD          the founder's password (else FOUNDER_PASSWORD from .env)
//   Y3K_CDP_PORT, Y3K_PROFILE   Chrome's port and profile (see cdp.mjs)
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const W = Number(process.env.W || 1400), H = Number(process.env.H || 900);
const ROOMS = (process.env.ROOMS || 'space').split(',').map((s) => s.trim()).filter(Boolean);
const TAPS = (process.env.TAP || '').split(',').map(Number).filter((n) => n > 0);
const WAIT = Number(process.env.WAIT || 8) * 1000;
const OUT = process.env.OUT || '/tmp/y3k-shot';
const TAG = process.env.TAG ? '-' + process.env.TAG : '';
const mobile = !!process.env.MOBILE;
let password = process.env.Y3K_PASSWORD || '';
if (!password) {
  try { password = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env')).FOUNDER_PASSWORD || ''; } catch { /* none */ }
}
mkdirSync(OUT, { recursive: true });

const b = await launch({ width: W, height: H, mobile });
try {
  await b.goto(base + '/');
  await b.sleep(1000);
  const login = await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(password)}})}).then(r=>r.status)`);
  const agree = await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  console.log('login', login, 'agree', agree);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:${JSON.stringify(ROOMS[0])}})); 'ok'`);
  await b.goto(base + '/?gfx=' + (process.env.GFX || 'high'));
  for (let i = 0; i < 90; i++) {
    await b.sleep(1000);
    const c = await b.evaluate('document.body.className');
    if (/in-home/.test(c) && await b.evaluate('!!(window.Y3K && window.Y3K.settings && window.__y3kScene)')) break;
  }
  console.log('classes:', await b.evaluate('document.body.className'),
    'coarse:', await b.evaluate(`matchMedia('(pointer: coarse)').matches`),
    'tier:', await b.evaluate('window.Y3K?.gfx?.profile?.()?.tier'));
  for (const id of ROOMS) {
    await b.evaluate(`window.Y3K.settings.setRoom({ env: ${JSON.stringify(id)} }); 'ok'`);
    await b.sleep(WAIT);
    const now = await b.evaluate('window.__y3kScene.envs.current');
    if (now !== id) console.log(`! asked for ${id}, the page is in ${now}`);
    await b.shot(join(OUT, `room-${id}${TAG}.png`));
    console.log('shot', join(OUT, `room-${id}${TAG}.png`));
    if (TAPS.length) {
      // THE WORLD'S CLOCK, HELD. On software GL a frame's step is clamped to
      // 0.1s (body.js) and a screenshot alone costs the world most of a
      // second, so no wall-clock wait can catch a strike that lasts one. The
      // page's own calls to envs.tick are held, and the world is stepped by
      // hand, a thirtieth at a time, to each moment asked for; then a frame
      // draws that moment and it is photographed.
      const t0 = await b.evaluate(`(() => {
        const e = window.__y3kScene.envs;
        let last = 0;
        if (!e.__tick) { e.__tick = e.tick; e.tick = (dt, t) => { if (!e.__held) e.__tick(dt, t); }; }
        window.__y3kScene.scene.traverse((o) => { const u = o.material && o.material.uniforms; if (u && u.uTap && u.uTime && o.parent && o.parent.parent) last = u.uTime.value; });
        e.__held = true;
        e.tap();
        return last;
      })()`);
      let at = t0;
      for (const sec of TAPS) {
        const to = t0 + sec;
        await b.evaluate(`(() => { const e = window.__y3kScene.envs; let t = ${at}; while (t < ${to} - 1e-6) { const dt = Math.min(1 / 30, ${to} - t); t += dt; e.__tick(dt, t); } return t; })()`);
        at = to;
        await b.sleep(1200);   // a frame or two, to draw it
        const p = join(OUT, `room-${id}-tap${sec}${TAG}.png`);
        await b.shot(p);
        console.log('shot', p, `(the world held ${sec}s after the tap)`);
      }
      await b.evaluate('window.__y3kScene.envs.__held = false; "ok"');
    }
  }
  if (process.env.THUMBS) {
    const shots = await b.evaluate('window.__y3kScene.envs.thumbnailsAsync(512)');
    for (const s of shots || []) {
      if (!ROOMS.includes(s.id) && process.env.THUMBS !== 'all') continue;
      const p = join(OUT, `thumb-${s.id}${TAG}.png`);
      writeFileSync(p, Buffer.from(String(s.url).split(',')[1] || '', 'base64'));
      console.log('thumb', p);
    }
  }
  const errs = b.logs.filter((l) => /^\[(error|exception)\]/.test(l) && !/404/.test(l));
  if (errs.length) console.log('ERRORS:\n' + errs.slice(-12).join('\n'));
  const warns = b.logs.filter((l) => /THREE|shader|WebGL|GL_/i.test(l));
  if (warns.length) console.log('GL:\n' + warns.slice(-12).join('\n'));
} finally { await b.close(); }
