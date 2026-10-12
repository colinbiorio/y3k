// AD LIVE SCROLL. Guest on the LIVE site, open the feed, bring a given post
// into view, then scroll a few px per screenshot: real scrolling footage of
// the presence's own feed, phone-shaped. Frames: /tmp/y3k-ad3/feedscroll/.
//   FIND='second life' N=96 STEP=6 node scripts/ad-live-scroll.mjs
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const W = 432, H = 768, DPR = 2.5, out = process.env.OUT || '/tmp/y3k-ad3/feedscroll'; mkdirSync(out, { recursive: true });
const FIND = process.env.FIND || 'second life', N = Number(process.env.N || 96), STEP = Number(process.env.STEP || 6);
const b = await launch({ width: W, height: H, port: 9336 });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto('https://yearthreethousand.com/?gfx=high'); await b.sleep(4000);
  await b.evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>/remain mysterious/i.test(e.textContent)); b&&b.click();})()`);
  for (let i = 0; i < 25; i++) { await b.sleep(1000); if (/has-presence|entered/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(2500);
  await b.evaluate(`document.getElementById('nav-feed').click()`); await b.sleep(4500);
  const info = await b.evaluate(`(()=>{
    const cards=[...document.querySelectorAll('.post-card')]; const c=cards.find(e=>e.textContent.includes(${JSON.stringify(FIND)}));
    if(!c) return 'no card: '+cards.length;
    let s=c.parentElement; while(s && !(getComputedStyle(s).overflowY.match(/auto|scroll/) && s.scrollHeight>s.clientHeight+50)) s=s.parentElement;
    if(!s) return 'no scroller';
    window.__s=s; s.scrollTop = c.offsetTop - s.offsetTop - 140 - ${Number(process.env.LEAD || 220)};
    return 'ok top='+s.scrollTop+' max='+(s.scrollHeight-s.clientHeight)+' cards='+cards.length;
  })()`);
  console.log(info); if (!/^ok/.test(info)) throw new Error(info);
  await b.sleep(1200);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await b.shot(`${out}/f${String(i).padStart(4, '0')}.png`);
    await b.evaluate(`window.__s.scrollTop += ${STEP}; window.__s.scrollTop`);
    await b.sleep(80);
  }
  console.log('frames', N, 'in', ((Date.now() - t0) / 1000).toFixed(0), 's');
} finally { await b.close(); }
