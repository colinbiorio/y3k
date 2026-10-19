// AD CHESS. A real game on the real board: founder login on the LOCAL server
// (with Y3K_LOCAL_CLAUDE_CODE=1 the presence thinks on the founder's own Claude
// login), open games, sit down as white, play an opening by clicking squares,
// and screenshot the board every second while the presence thinks and moves.
// Real time, not virtual time: the moves come from a real model. Frames land in
// OUT with a log of the moves as they happened.
//   PLIES=10 OUT=/tmp/y3k-ad4/footage/chess node scripts/ad-chess.mjs
import { launch, dotenv } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.Y3K_URL || 'http://127.0.0.1:5173';
const env = dotenv(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const W = 432, H = 768, DPR = 2.5, PLIES = Number(process.env.PLIES || 10);
const out = process.env.OUT || '/tmp/y3k-ad4/footage/chess'; mkdirSync(out, { recursive: true });
// my candidate moves, in order of preference, tried against the board each turn
const PLAN = [['e2e4'], ['g1f3', 'd2d4'], ['f1c4', 'f1b5', 'd2d4'], ['d2d3', 'b1c3', 'e1g1'], ['e1g1', 'b1c3', 'd2d3'], ['b1c3', 'c2c3', 'h2h3'], ['h2h3', 'a2a3', 'c2c3']];
const sq = (name) => (7 - (name.charCodeAt(1) - 49)) * 8 + (name.charCodeAt(0) - 97);
const b = await launch({ width: W, height: H, port: Number(process.env.PORT || 9339) });
let n = 0; const log = [];
const shot = async (tag) => { await b.shot(`${out}/f${String(n).padStart(4, '0')}.png`); log.push([n, Date.now(), tag]); n++; };
const board = () => b.evaluate(`JSON.stringify([...document.querySelectorAll('#chess-board .chess-sq')].map(e => e.textContent.trim()))`);
const moves = () => b.evaluate(`(document.querySelector('#chess-moves, .chess-moves, #chess-list')?.textContent || '').trim().slice(0, 200)`);
const click = (i) => b.evaluate(`(()=>{const e=document.querySelector('#chess-board .chess-sq[data-i="${i}"]'); if(!e) return 'no sq'; e.click(); return 'ok';})()`);
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.goto(base + '/'); await b.sleep(800);
  await b.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'y3klay',password:${JSON.stringify(env.FOUNDER_PASSWORD || '')}})}).then(r=>r.status)`);
  await b.evaluate(`fetch('/api/auth/agree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({age17:true,terms:true})}).then(r=>r.status)`);
  await b.evaluate(`localStorage.setItem('y3k.room', JSON.stringify({env:'room'})); localStorage.setItem('y3k.hands','1'); 'ok'`);
  await b.goto(base + '/?gfx=high');
  for (let i = 0; i < 30; i++) { await b.sleep(1000); if (/has-presence/.test(await b.evaluate('document.body.className'))) break; }
  await b.sleep(2500);
  console.log('ownBrain:', await b.evaluate(`fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(j=>j.ownBrain)`));
  await b.evaluate(`document.getElementById('nav-games').click()`); await b.sleep(3500);
  await shot('setup');
  console.log('sit:', await b.evaluate(`(()=>{const s=document.getElementById('chess-sit'); if(!s) return 'no button'; if(s.disabled) return 'disabled'; s.click(); return 'clicked';})()`));
  await b.sleep(1500);
  await shot('board');
  let before = await board();
  for (let ply = 0; ply < PLIES; ply++) {
    // my move: try the plan's candidates until the board changes
    let mine = null;
    for (const uci of PLAN[Math.min(Math.floor(ply / 2), PLAN.length - 1)]) {
      await click(sq(uci.slice(0, 2))); await b.sleep(150);
      await click(sq(uci.slice(2, 4))); await b.sleep(400);
      const after = await board();
      if (after !== before) { mine = uci; before = after; break; }
      await click(sq(uci.slice(0, 2))); await b.sleep(100); // deselect if it stuck
    }
    if (!mine) { console.log('no planned move was legal at ply', ply); break; }
    console.log('me:', mine, '| moves:', await moves());
    await shot('me:' + mine);
    // its move: shoot every second until the board changes (or 90 s pass)
    const t0 = Date.now(); let moved = false;
    while (Date.now() - t0 < 90000) {
      await b.sleep(1000); await shot('thinking');
      const now = await board();
      if (now !== before) { before = now; moved = true; break; }
    }
    if (!moved) { console.log('it did not move within 90 s at ply', ply); break; }
    console.log('it moved after', ((Date.now() - t0) / 1000).toFixed(1), 's | moves:', await moves());
    await shot('it'); await b.sleep(800); await shot('it-hold');
  }
  writeFileSync(`${out}/log.json`, JSON.stringify(log, null, 1));
  console.log('frames', n, '->', out);
  console.log(b.logs.filter((l) => /exception|error|think/i.test(l)).slice(0, 8).join('\n'));
} finally { await b.close(); }
