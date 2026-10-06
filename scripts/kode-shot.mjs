// LOOK AT KODE. Signs in as the founder on a LOCAL server (never the live
// site), accepts the gate, sets a room, opens kode, screenshots it, and dumps
// the layout. For eyes, not for CI: it needs Chrome, a running `node
// server.mjs`, and FOUNDER_PASSWORD in .env.
//
//   Y3K_URL=http://127.0.0.1:5173 node scripts/kode-shot.mjs
//   ENV=space|room|taiga… W=1400 H=900 TAG=name EXTRA='<js run after kode opens>'
//
// Pictures land in /tmp/y3k-shot/. Kill a stale Chrome on port 9333 if a run
// hangs (pkill -f remote-debugging-port=9333): two runs sharing one port talk
// to the same old page, and the login looks flaky when it is not.
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const W = Number(process.env.W || 1400), H = Number(process.env.H || 900);
const tag = process.env.TAG || 'a';
const ENV = process.env.ENV || 'space';
const EXTRA = process.env.EXTRA || '';          // JS run after kode opens
const b = await launch({ width: W, height: H });
try {
  await b.goto(base + '/');
  await b.sleep(1000);
  const login = await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  const agree = await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  console.log('login', login, 'agree', agree);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:${JSON.stringify(ENV)}})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=' + (process.env.GFX || 'high'));
  for (let i = 0; i < 30; i++) { await b.sleep(1000); const c = await b.evaluate('document.body.className'); if (/has-presence/.test(c) && /in-home/.test(c)) break; }
  await b.sleep(1500);
  console.log('home classes:', await b.evaluate('document.body.className'), 'me:', await b.evaluate(`fetch('/api/auth/me').then(r=>r.status)`), 'cookie:', await b.evaluate('document.cookie.length'));
  if (process.env.HOME_SHOT) await b.shot(`/tmp/y3k-shot/home-${tag}.png`);
  await b.evaluate(`(()=>{const n=document.getElementById('nav-code'); n.hidden=false; n.click();})()`);
  await b.sleep(5000);
  if (EXTRA) console.log('extra:', await b.evaluate(EXTRA));
  console.log('kode classes:', await b.evaluate('document.body.className'));
  console.log(await b.evaluate(`JSON.stringify({
    stage: document.getElementById('stage')?.getBoundingClientRect().toJSON(),
    pane: document.querySelector('.cv-pane')?.getBoundingClientRect().toJSON(),
    tier: window.Y3K?.gfx?.profile?.()?.tier, hands: localStorage.getItem('y3k.hands'),
    handsLayer: !!document.getElementById('hand-cursors'), camOn: document.body.classList.contains('cam-on'),
  })`));
  await b.shot(`/tmp/y3k-shot/kode-${tag}.png`);
  const errs = b.logs.filter((l) => /^\[(error|exception)\]/.test(l) && !/404/.test(l));
  if (errs.length) console.log('ERRORS:\n' + errs.slice(-10).join('\n'));
} finally { await b.close(); }
