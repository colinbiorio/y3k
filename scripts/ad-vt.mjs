// AD VIRTUAL-TIME TEST. Lands in the room phone-shaped, pauses the page clock,
// then advances it 1/24 s at a time and screenshots at full 1080x1920 after
// each step: deterministic orb motion at any resolution, however slow the GPU.
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
const base = 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const W = 432, H = 768, DPR = 2.5, FPS = 24, N = Number(process.env.N || 24);
const out = process.env.OUT || '/tmp/y3k-ad/vt'; mkdirSync(out, { recursive: true });
const b = await launch({ width: W, height: H, port: 9334 });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto(base + '/'); await b.sleep(800);
  await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:${JSON.stringify(process.env.ENV || 'space')}})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(3000);
  if (process.env.PRE) console.log('pre:', await b.evaluate(process.env.PRE));
  await b.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const expired = new Promise((r) => b.on('Emulation.virtualTimeBudgetExpired', r));
    await b.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 1000 / FPS });
    await Promise.race([expired, b.sleep(2000)]);
    await b.shot(`${out}/f${String(i).padStart(4, '0')}.png`);
  }
  console.log('frames', N, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
} finally { await b.close(); }
