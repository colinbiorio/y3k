// AD BODY. The body's language on film: founder login on the LOCAL server, a
// room, then the page clock is paused and stepped 1/24 s at a time while
// kommands (color/ember, form/heart ...) are typed into the chat box at given
// frames, exactly as a person would type them. Every frame is a full
// 1080x1920 screenshot of the real page, so the morph between two forms is
// the body's own, not an edit. The caption lane is hidden so the typed words
// do not sit on the footage (what is filmed is the body, not the typing).
//
//   ENV=room N=96 SCRIPT='0:form/heart,48:form/knot' OUT=/tmp/y3k-ad4/footage/body-room node scripts/ad-body.mjs
//   PRE='color/aurora'   a kommand applied before the clock is paused (lets a colour settle)
//   HIDE='#caption'      selectors hidden for the whole capture (default: the caption)
//   ENV: room | space | ocean | taiga | dunes | cavern | cloudsea | ember
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const W = 432, H = 768, DPR = 2.5, FPS = 24, N = Number(process.env.N || 48);
const ENV = process.env.ENV || 'room';
const out = process.env.OUT || `/tmp/y3k-ad4/footage/body-${ENV}`; mkdirSync(out, { recursive: true });
const HIDE = process.env.HIDE || '#caption';
const script = new Map((process.env.SCRIPT || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf(':'); return [Number(s.slice(0, i)), s.slice(i + 1)]; }));
const b = await launch({ width: W, height: H, port: Number(process.env.PORT || 9334) });
const type = (text) => b.evaluate(`(()=>{const t=document.getElementById('chat-input'); t.value=${JSON.stringify(text)}; document.getElementById('chat-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})); return t.value===''?'sent':'refused:'+t.value;})()`);
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto(base + '/'); await b.sleep(800);
  const login = await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:${JSON.stringify(ENV)}})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(3000);
  console.log('login', login, 'classes:', await b.evaluate('document.body.className'));
  console.log('hid', await b.evaluate(`(()=>{let n=0; for(const e of document.querySelectorAll(${JSON.stringify(HIDE)})){e.style.setProperty('display','none','important'); n++;} return n;})()`));
  if (process.env.PRE) { console.log('pre', process.env.PRE, '->', await type(process.env.PRE)); await b.sleep(2500); }
  await b.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    if (script.has(i)) console.log('frame', i, script.get(i), '->', await type(script.get(i)));
    const expired = new Promise((r) => b.on('Emulation.virtualTimeBudgetExpired', r));
    await b.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 1000 / FPS });
    await Promise.race([expired, b.sleep(2000)]);
    await b.shot(`${out}/f${String(i).padStart(4, '0')}.png`);
    if (i % 24 === 0) console.log('frame', i, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  console.log('frames', N, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's ->', out);
  console.log(b.logs.filter((l) => /exception|error/i.test(l)).slice(0, 5).join('\n'));
} finally { await b.close(); }
