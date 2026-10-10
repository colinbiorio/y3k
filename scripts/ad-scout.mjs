// AD SCOUT. Signs in as the founder on the LOCAL server, then walks every nav
// button and screenshots each view, phone-shaped (432x768 css px at 2.5x =
// 1080x1920) or desktop. For choosing ad footage, not for CI.
//   MODE=phone|desk node scripts/ad-scout.mjs
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const MODE = process.env.MODE || 'phone';
const phone = MODE === 'phone';
const W = phone ? 432 : 1440, H = phone ? 768 : 900, DPR = phone ? 2.5 : 1;
const out = '/tmp/y3k-ad/scout'; mkdirSync(out, { recursive: true });
const b = await launch({ width: W, height: H });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: phone });
  await b.goto(base + '/'); await b.sleep(800);
  const login = await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  const agree = await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  console.log('login', login, 'agree', agree);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:${JSON.stringify(process.env.ENV || 'space')}})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); const c = await b.evaluate('document.body.className'); if (/has-presence/.test(c)) break; }
  await b.sleep(2500);
  console.log('home classes:', await b.evaluate('document.body.className'));
  await b.shot(`${out}/${MODE}-home.png`);
  const navs = (process.env.NAVS || 'nav-feed,nav-live,nav-world,nav-games,nav-mine,nav-orb,nav-profile,nav-search,nav-post,nav-settings,nav-code').split(',');
  for (const id of navs) {
    const ok = await b.evaluate(`(()=>{const n=document.getElementById('${id}'); if(!n) return 'missing'; n.hidden=false; n.click(); return 'clicked';})()`);
    await b.sleep(id === 'nav-code' ? 6000 : 3500);
    console.log(id, ok, 'classes:', await b.evaluate('document.body.className'), 'url:', await b.evaluate('location.href'));
    await b.shot(`${out}/${MODE}-${id.replace('nav-','')}.png`);
    // back to the room
    await b.evaluate(`(()=>{const back=document.querySelector('[aria-label="Back to home"],[aria-label="Back"],[aria-label="Close"]'); if(back){back.click(); return 'back'} history.back(); return 'hist'})()`);
    await b.sleep(1500);
  }
  console.log(b.logs.filter(l=>/exception|error/i.test(l)).slice(0,10).join('\n'));
} finally { await b.close(); }
