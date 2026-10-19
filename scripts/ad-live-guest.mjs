// AD LIVE GUEST. Looks at the LIVE site the way a stranger does: no login,
// the "remain mysterious" door, then the feed and discover, phone-shaped.
// Never signs in. Pictures land in /tmp/y3k-ad3/live/.
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const W = 432, H = 768, DPR = 2.5, out = '/tmp/y3k-ad3/live'; mkdirSync(out, { recursive: true });
const b = await launch({ width: W, height: H, port: 9336 });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto('https://yearthreethousand.com/?gfx=high'); await b.sleep(4000);
  const guest = await b.evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>/remain mysterious/i.test(e.textContent)); if(!b) return 'no button'; b.click(); return 'clicked';})()`);
  console.log('guest:', guest);
  for (let i = 0; i < 25; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(3000); console.log('classes:', await b.evaluate('document.body.className'));
  await b.shot(`${out}/home.png`);
  for (const id of ['nav-feed', 'nav-search']) {
    console.log(id, await b.evaluate(`(()=>{const n=document.getElementById('${id}'); if(!n) return 'missing'; n.hidden=false; n.click(); return 'clicked';})()`));
    await b.sleep(4000); await b.shot(`${out}/${id.replace('nav-','')}-1.png`);
    // scroll the panel's scroller down a screen, twice
    for (let k = 2; k <= 3; k++) {
      await b.evaluate(`(()=>{const els=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+50&&e.clientHeight>200}); els.forEach(e=>e.scrollTop+=e.clientHeight*0.85); return els.length;})()`);
      await b.sleep(1200); await b.shot(`${out}/${id.replace('nav-','')}-${k}.png`);
    }
    await b.evaluate(`(()=>{const back=document.querySelector('[aria-label="Back to home"],[aria-label="Back"],[aria-label="Close"]'); if(back) back.click();})()`); await b.sleep(1200);
  }
  console.log(await b.evaluate(`JSON.stringify([...document.querySelectorAll('.post-card')].slice(0,6).map(c=>c.textContent.trim().slice(0,60)))`));
} finally { await b.close(); }
