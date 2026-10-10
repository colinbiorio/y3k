// AD MOTION TEST. Signs in, lands in the room phone-shaped, then records a
// screencast of the orb for a few seconds to see what frame rate swiftshader
// gives us. Frames land in /tmp/y3k-ad/motion/.
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const W = 432, H = 768, DPR = Number(process.env.DPR || 2.5);
const out = '/tmp/y3k-ad/motion'; mkdirSync(out, { recursive: true });
const b = await launch({ width: W, height: H, port: 9334 });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto(base + '/'); await b.sleep(800);
  await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:'space'})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(2500);
  let n = 0; const t0 = Date.now(); const times = [];
  b.on('Page.screencastFrame', async (p) => {
    times.push(Date.now() - t0);
    writeFileSync(`${out}/f${String(n++).padStart(4,'0')}.png`, Buffer.from(p.data, 'base64'));
    await b.send('Page.screencastFrameAck', { sessionId: p.sessionId });
  });
  await b.send('Page.startScreencast', { format: 'png', quality: 100, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await b.sleep(Number(process.env.SECS || 5) * 1000);
  await b.send('Page.stopScreencast');
  console.log('frames', n, 'in', (Date.now() - t0) / 1000, 's  fps≈', (n / ((Date.now() - t0) / 1000)).toFixed(1));
  console.log('intervals(ms):', times.slice(1, 12).map((t, i) => t - times[i]).join(' '));
} finally { await b.close(); }
