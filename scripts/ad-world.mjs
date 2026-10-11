// AD WORLD. Founder login on the LOCAL server, open the world, list its
// overlays, hide them, walk in, and shoot a few moments. /tmp/y3k-ad3/world/.
//   MODE=phone|desk HIDE=1 node scripts/ad-world.mjs
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
const base = 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const MODE = process.env.MODE || 'phone', phone = MODE === 'phone';
const W = phone ? 432 : 1440, H = phone ? 768 : 900, DPR = phone ? 2.5 : 1;
const out = '/tmp/y3k-ad3/world'; mkdirSync(out, { recursive: true });
const b = await launch({ width: W, height: H, port: 9337 });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: phone });
  await b.goto(base + '/'); await b.sleep(800);
  await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:'space'})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(2000);
  await b.evaluate(`document.getElementById('nav-world').click()`); await b.sleep(6000);
  // what is on top of the world?
  console.log(await b.evaluate(`JSON.stringify([...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); const s=getComputedStyle(e); return r.width>60&&r.height>40&&s.visibility!=='hidden'&&s.display!=='none'&&(e.id||e.className)&&/world|firsts|hands|wld|chest|task|side/i.test(e.id+' '+e.className)}).slice(0,40).map(e=>(e.tagName+'#'+e.id+'.'+String(e.className).replace(/\\s+/g,'.')).slice(0,70)))`));
  if (process.env.HIDE) {
    const sel = process.env.HIDE === '1' ? '[id^="world-"]:not(#world-canvas):not(canvas), .world-panel, .world-side, .world-firsts, .world-hands, .world-tasks' : process.env.HIDE;
    console.log('hid', await b.evaluate(`(()=>{let n=0; for(const e of document.querySelectorAll(${JSON.stringify(sel)})){ if(e.tagName==='CANVAS') continue; e.style.setProperty('display','none','important'); n++;} return n;})()`));
  }
  await b.sleep(500); await b.shot(`${out}/${MODE}-a.png`);
  console.log('walk:', await b.evaluate(`(()=>{const w=document.getElementById('world-walk'); if(!w) return 'no walk button'; w.click(); return w.textContent;})()`));
  for (const [k, ms] of [['b', 2500], ['c', 3000], ['d', 3000]]) { await b.sleep(ms); await b.shot(`${out}/${MODE}-${k}.png`); }
  console.log('canvas:', await b.evaluate(`JSON.stringify([...document.querySelectorAll('canvas')].map(c=>({id:c.id,cls:c.className,w:c.width,h:c.height})))`));
} finally { await b.close(); }
