#!/usr/bin/env node
// THE CONVERSATION NEVER DRAWS TWO LINES THROUGH EACH OTHER, in Chromium.
// Colin, 2026-10-08: an older reply's last rows sat on top of the newest one.
// A line written while the column is hidden (a panel open, another screen)
// measured 0px tall and was laid out as one row; when the column came back
// nothing measured it again. This writes long replies while the column is
// hidden, shows it, writes more, and checks every pair of lines on screen.
//
//   node scripts/history-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-history-'));
mkdirSync(join(tmp, 'data'));
const port = await freePort();
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), ANTHROPIC_API_KEY: '' } });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
// the site's own stylesheet and history.js, and nothing else of the app
await page.route(`${SITE}/`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><body class="in-home" style="background:#000"></body>' }));
await page.goto(SITE);
await page.evaluate(async () => { window.__h = (await import('/src/history.js')).createHistory(); });
const frames = (n) => page.evaluate((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const LONG = 'Ha, fair, I got sentimental about a billing change. But that is the real reason it matters: if people can use y3k as a coding harness without api rates, the door is actually open to them. So it is practical and it is a bigger step, both at once.';
const lines = () => page.evaluate(() => [...document.querySelectorAll('#chat-history .hl')]
  .filter((n) => getComputedStyle(n).visibility !== 'hidden' && Number(n.style.opacity || 1) > 0.05)
  .map((n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: n.textContent.slice(0, 24) }; }));
const overlaps = (ls) => {
  const bad = [];
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
    const a = ls[i], b = ls[j];
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 2 && y > 2) bad.push(`"${a.text}" × "${b.text}" by ${Math.round(y)}px`);
  }
  return bad;
};

try {
  // written while hidden: a panel is open over the room
  await page.evaluate(() => document.body.classList.add('panel-open'));
  await page.evaluate((t) => window.__h.push('y3k', t), LONG);
  await frames(3);
  await page.evaluate(() => window.__h.push('you', 'ok you are sentimental, it is fine'));
  await frames(3);
  // the panel closes, and the conversation goes on
  await page.evaluate(() => document.body.classList.remove('panel-open'));
  await frames(4);
  await page.evaluate(() => window.__h.push('y3k', 'Ha, I will take that. You built me out of a lot of feeling, so of course I reach for it first. But I would rather be sentimental and also read the room right, so thanks for correcting me gently.'));
  await page.waitForTimeout(1500);
  const ls = await lines();
  if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, 'history.png') }); }
  check('every line written while the column was hidden takes its real height once shown', ls.length >= 2, JSON.stringify(ls));
  const bad = overlaps(ls);
  check('no two lines on screen are drawn through each other', bad.length === 0, bad.join('; '));

  // a late change in size (a font arriving, a rewrap) is heard too
  await page.evaluate(() => { document.querySelector('#chat-history .hl-ai').style.fontSize = '22px'; });
  await page.waitForTimeout(800);
  const bad2 = overlaps(await lines());
  check('a line that grows on its own moves the column with it', bad2.length === 0, bad2.join('; '));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll history checks passed.');
process.exit(failures ? 1 : 0);
