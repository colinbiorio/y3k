#!/usr/bin/env node
// PLAY MOVES THE WORLD, END TO END, in Chromium: the founder on the world
// screen, the brain their own local Claude Code with a stand-in `claude`
// (test/fakes/play-claude.mjs) that answers every beat with four world verbs.
// Pressing the world's own button has to start play, and the first play beat
// has to change the ground: the course turns north, sprite 1 goes out for
// coal, the society lives by the way it named. The next beat has to be told
// what the last one did. Until 2026-10-08 none of it happened (world-verbs.mjs).
//
//   PORT=47231 node scripts/play-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'play-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };
const until = async (fn, ms, step = 500) => {
  for (const end = Date.now() + ms; Date.now() < end;) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); }
  return null;
};

const tmp = mkdtempSync(join(tmpdir(), 'y3k-play-'));
mkdirSync(join(tmp, 'data'));
const LOG = join(tmp, 'brain.log');
const sitePort = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${sitePort}`;
const env = { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
  Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'play-claude.mjs'), FAKE_BRAIN_LOG: LOG, RENDER: '' };
async function boot() {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
  return child;
}
// the founder is seeded on the first boot, orion on the next
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await boot();
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const plays = () => calls().filter((c) => c.system.includes('YOUR TURN IN THE WORLD'));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
// generous: the machine this runs on is shared, and the world draws in software GL
page.setDefaultTimeout(180000);
page.setDefaultNavigationTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const here = () => page.evaluate(() => fetch('/api/world/here').then((r) => r.json()));

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible' });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => fetch('/api/presences/orion/budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ set: 5 }) }));

  await page.click('#nav-world');
  await page.waitForSelector('.world-root #world-wake', { state: 'visible' });
  // the ground streams in and the first poll lands; software GL is slow
  await page.waitForTimeout(8000);
  const before = await here();
  check('orion keeps ground, settled, with its sprites at home', !!before.me?.course && before.sprites?.length >= 3 && !before.sprites.some((s) => s.job),
    JSON.stringify(before.me?.course));
  await shot('1-world-before-play');

  // what a hand pressing the mark would land on (the mark is poured metal over
  // the button, so the topmost element there must be the button or inside it)
  const hit = await page.evaluate(() => {
    const b = document.getElementById('world-wake'), r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { onIt: !!top && (top === b || b.contains(top)), top: top ? `${top.tagName}#${top.id}.${top.className}` : null };
  });
  check('the world\'s play button is what a press there lands on', hit.onIt, JSON.stringify(hit));
  await page.click('#world-wake', { force: true });
  check('the world\'s button starts play', await until(() => page.evaluate(() => document.body.classList.contains('playing')), 10000) === true);
  const first = await until(() => plays().length >= 1, 60000);
  check('a play beat reached the brain', !!first, `${calls().length} calls`);
  const moved = await until(async () => { const h = await here(); return h.sprites?.find((s) => s.n === 1)?.job ? h : null; }, 30000);
  check('sprite 1 went out for coal', !!moved && /coal/.test(moved.sprites.find((s) => s.n === 1).job.looking), JSON.stringify(moved?.sprites?.[0]?.job));
  check('the course turned north', !!moved && moved.me.course.toZ !== before.me.course.toZ && moved.me.course.toX === before.me.course.toX,
    JSON.stringify({ was: before.me.course, now: moved?.me?.course }));
  check('the society lives by the way it named', !!moved && moved.ways.some((w) => w.own && /walls low/.test(w.text)), JSON.stringify(moved?.ways));

  // the next beat is told what the last one did: tend.js notes it on the
  // game's own thread (notePlay), and the next play beat carries that thread
  const second = await until(() => plays().length >= 2 && plays()[1], 60000);
  check('the next beat hears that it led its people and sent a sprite',
    !!second && second.input.includes('you led your society: go north') && /you sent #1 \S+ to look for coal/.test(second.input),
    second ? second.input.slice(-600) : 'no second beat');
  check('…and that its call across found no one to hear it', !!second && second.input.includes('you called out, but no awake society within sight to hear you'));

  // let the poll carry the new course and the sprite's walk to the screen
  await page.waitForTimeout(12000);
  await shot('2-world-after-play');
  await page.click('#world-showmap', { force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot('3-world-map-after-play');

  await page.click('#world-wake', { force: true }).catch(() => {});
  check('pressing it again pauses the game', await until(() => page.evaluate(() => !document.body.classList.contains('playing')), 10000) === true);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.log('  ✗ the smoke stopped:', e.message);
  await shot('x-failure').catch(() => {});
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} failed.` : '\nall good.');
process.exit(failures ? 1 : 0);
