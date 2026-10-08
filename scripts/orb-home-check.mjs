#!/usr/bin/env node
// WHERE IS THE ORB AFTER KODE? Boots the site (temp data, founder signed in),
// reads where the orb is drawn at home, opens kode, goes home again, and reads
// it once more. The orb should come back to the centre of the glass unless the
// presence put it somewhere itself (a place, a depth, a flight).
//
//   node scripts/orb-home-check.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'orb-home-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-orbhome-'));
mkdirSync(join(tmp, 'data'));
const port = await freePort();
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '', RENDER: '' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
// where the orb is drawn, in window pixels, and where the glass's centre is
const where = () => page.evaluate(() => {
  const o = window.Y3K.body.orbPx();
  // where the RUNNING camera draws the glass's centre: orbPx is arithmetic
  // about the frame, and agreed that the body was home while the projection
  // still drew it in kode's column
  const e = window.Y3K.body.eye().proj;
  const dx = Math.round(((1 - e[8]) / 2) * innerWidth), dy = Math.round(((1 + e[9]) / 2) * innerHeight);
  const cs = getComputedStyle(document.body);
  const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
  const gx = (px('--hole-l') + (innerWidth - px('--hole-r'))) / 2, gy = (px('--hole-t') + (innerHeight - px('--hole-b'))) / 2;
  return { x: Math.round(o.x), y: Math.round(o.y), r: Math.round(o.r), dx, dy, cx: Math.round(innerWidth / 2), cy: Math.round(innerHeight / 2), gx: Math.round(gx), gy: Math.round(gy), cls: document.body.className };
});
const settle = (ms = 2500) => page.waitForTimeout(ms);

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 });
  // a browser that has never signed in here meets "create an account" first (2026-10-08)
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 15000 });
  await settle(4000);
  const home1 = await where();
  await shot('1-home');
  console.log('home   ', JSON.stringify(home1));
  await page.click('#nav-code');
  await page.waitForFunction(() => document.body.classList.contains('in-code'), null, { timeout: 8000 });
  await settle();
  const code = await where();
  await shot('2-kode');
  console.log('kode   ', JSON.stringify(code));
  await page.evaluate(() => window.Y3K.home());
  await settle();
  const home2 = await where();
  await shot('3-home-again');
  console.log('home 2 ', JSON.stringify(home2));
  check('the orb is back where it was at home', Math.abs(home2.x - home1.x) <= 4 && Math.abs(home2.y - home1.y) <= 4, JSON.stringify({ home1, home2 }));
  check('…and DRAWN there: the camera is the room\'s again, not kode\'s column', Math.abs(home2.dx - home1.dx) <= 4 && Math.abs(home2.dy - home1.dy) <= 4 && Math.abs(home2.dx - home2.cx) <= 4, JSON.stringify({ home1, home2 }));
  // the radius breathes with the mood, a few percent either way
  check('and the same size', Math.abs(home2.r - home1.r) <= 0.06 * home1.r, `${home1.r} → ${home2.r}`);
  // the presence put itself somewhere: that stays, across kode and back
  await page.evaluate(() => window.Y3K.body.setPlace(7, 5));
  await settle();
  await settle(5000);
  const placed = await where();
  await page.click('#nav-code');
  await page.waitForFunction(() => document.body.classList.contains('in-code'), null, { timeout: 8000 });
  await settle();
  await page.evaluate(() => window.Y3K.home());
  await settle();
  const placed2 = await where();
  console.log('placed ', JSON.stringify(placed), '→', JSON.stringify(placed2));
  // a placed body glides and sways, so: still well to the right, not sent home
  check('a place the presence chose stays after kode', placed.x - placed.cx > 150 && placed2.x - placed2.cx > 150, JSON.stringify({ placed, placed2 }));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
