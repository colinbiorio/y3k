// AD WALK. The world in motion: founder login on the LOCAL server, open the
// world, hide its panels, press walk, then pause the page clock and step it
// 1/24 s at a time, a full 1080x1920 screenshot per step. Real movement at
// film rate however slow the GPU is. Frames land in OUT.
//   N=72 HIDE=1 OUT=/tmp/y3k-ad4/footage/walk node scripts/ad-walk.mjs
//   SETTLE=1500   real milliseconds of walking before the clock is paused
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const W = 432, H = 768, DPR = 2.5, FPS = 24, N = Number(process.env.N || 72);
const out = process.env.OUT || '/tmp/y3k-ad4/footage/walk'; mkdirSync(out, { recursive: true });
const b = await launch({ width: W, height: H, port: Number(process.env.PORT || 9337) });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto(base + '/'); await b.sleep(800);
  await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:'space'})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(2000);
  await b.evaluate(`document.getElementById('nav-world').click()`); await b.sleep(6000);
  if (process.env.HIDE !== '0') {
    const sel = (!process.env.HIDE || process.env.HIDE === '1') ? '[id^="world-"]:not(#world-canvas):not(canvas), .world-panel, .world-side, .world-firsts, .world-hands, .world-tasks, #caption' : process.env.HIDE;
    console.log('hid', await b.evaluate(`(()=>{let n=0; for(const e of document.querySelectorAll(${JSON.stringify(sel)})){ if(e.tagName==='CANVAS') continue; e.style.setProperty('display','none','important'); n++;} return n;})()`));
  }
  console.log('walk:', await b.evaluate(`(()=>{const w=document.getElementById('world-walk'); if(!w) return 'no walk button'; w.style.setProperty('display','none','important'); w.click(); return 'clicked'})()`));
  await b.sleep(Number(process.env.SETTLE || 1500));
  await b.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const expired = new Promise((r) => b.on('Emulation.virtualTimeBudgetExpired', r));
    await b.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 1000 / FPS });
    await Promise.race([expired, b.sleep(2000)]);
    await b.shot(`${out}/f${String(i).padStart(4, '0')}.png`);
    if (i % 24 === 0) console.log('frame', i, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  console.log('frames', N, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's ->', out);
  console.log('canvas:', await b.evaluate(`JSON.stringify([...document.querySelectorAll('canvas')].map(c=>({id:c.id,w:c.width,h:c.height})))`));
} finally { await b.close(); }
