#!/usr/bin/env node
// THE MUSIC PANE, AFTER THE LOOKUP WAS BOUNDED (2026-10-08), in Chromium.
// Audius is faked inside the server process (a module node loads before
// server.mjs), so the run never reaches the network and every list is known:
//   - a search shows its tracks
//   - the thirteenth new search in a minute from one machine is refused, and
//     the pane says so plainly rather than that the service is unreachable
//   - asking for a list already fetched is still answered
//
//   PORT=47231 node scripts/music-smoke.mjs [--shots <dir>]
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

// Audius, as far as the server can tell: three tracks per list, named after
// the words searched, each on a node that answers with the CORS header.
const AUDIUS = `
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const list = /audius\\.co\\/v1\\/tracks\\/(search|trending)\\?(?:query=([^&]*))?/.exec(u);
  if (list) {
    const q = decodeURIComponent(list[2] || 'trending');
    const data = [1, 2, 3].map((i) => ({ id: q + i, title: q + ' ' + i, user: { name: 'artist ' + i }, duration: 120, bpm: 90 + i }));
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (/audius\\.co\\/v1\\/tracks\\/[^/]+\\/stream/.test(u)) return new Response(null, { status: 302, headers: { location: 'https://node.invalid/a.mp3' } });
  if (u.startsWith('https://node.invalid/')) return new Response('x', { status: 206, headers: { 'access-control-allow-origin': '*' } });
  return real(url, opts);
};`;

const tmp = mkdtempSync(join(tmpdir(), 'y3k-music-'));
mkdirSync(join(tmp, 'data'));
const port = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(AUDIUS).toString('base64')}`, 'server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: '', ANTHROPIC_API_KEY: '', RENDER: '' },
});
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

const user = 'tune' + Math.random().toString(36).slice(2, 7);
await fetch(`${SITE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: `${user}@example.com`, username: user, password: 'a-long-password-1', age17: true, terms: true }) });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(120000);   // a frame of software GL can take seconds here
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const wait = (ms) => page.waitForTimeout(ms);
const listText = () => page.evaluate(() => document.getElementById('music-list').textContent);
const search = async (q) => {
  await page.fill('#music-q', q);
  await page.click('#music-search');
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('music-list').textContent), null, { timeout: 30000 });
  return listText();
};

try {
  // generous: software GL on a shared machine bakes the entrance slowly
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.classList.contains('entered'), null, { timeout: 180000 });
  await wait(2600);
  await page.click('#login-toggle');   // a browser that has never been here opens on "create"
  await page.fill('#login-email', `${user}@example.com`);
  await page.fill('#login-pass', 'a-long-password-1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && !document.body.classList.contains('gated'), null, { timeout: 120000 });
  await wait(3000);
  await page.click('#nav-settings');
  await page.click('.set-tab[data-pane="music"]');
  await wait(1500);

  const first = await search('rain');
  await shot('1-music-search');
  check('a search shows its tracks', /rain 1/.test(first) && /rain 3/.test(first), first);

  // Eleven more new searches from this machine at once, the list already
  // fetched asked again, and then the pane's own Search pressed, all in one
  // evaluate: the per-machine count is a minute long, and on software GL, on
  // a loaded machine, each round trip into the page can take many seconds.
  await page.fill('#music-q', 'one too many');
  const burst = await page.evaluate(async () => {
    const ask = (q) => fetch('/api/music/tracks?kind=search&q=' + encodeURIComponent(q)).then(async (x) => ({ status: x.status, n: (await x.json()).tracks.length }));
    const t = performance.now();
    const more = await Promise.all(Array.from({ length: 11 }, (_, i) => ask('more ' + i)));
    const again = await ask('rain');
    document.getElementById('music-search').click();
    return { more, again, ms: Math.round(performance.now() - t) };
  });
  console.log(`    (the burst and the thirteenth took ${burst.ms}ms)`);
  check('the first twelve new searches are answered', burst.more.every((r) => r.status === 200 && r.n === 3), JSON.stringify(burst.more));
  check('a list already fetched is still answered past the ceiling', burst.again.status === 200 && burst.again.n === 3, JSON.stringify(burst.again));
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('music-list').textContent), null, { timeout: 120000 });
  const refused = await listText();
  await shot('2-music-too-many');
  check('the thirteenth new search is refused, and the pane says what to do', /Too many new searches\. Try again in a minute\./.test(refused), refused);
  check('…not that the service is unreachable', !/Could not reach/.test(refused), refused);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('the run finished', false, String(e?.stack || e));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
