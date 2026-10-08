#!/usr/bin/env node
// RECALL AND THE LINE FROM LONG AGO, END TO END: the real server, the founder's
// own local brain played by a stand-in `claude` (test/fakes/recall-claude.mjs),
// and orion holding a seeded journal. Two things are checked:
//   - a reflection's prompt carries one older line (here the one kept exactly
//     30 days ago) and the reply to the browser does not;
//   - woken in Chromium, orion reaches for "the sea" and the memory window
//     flares the one line about the sea, not every line with "the" in it.
//
//   PORT=47231 node scripts/recall-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'recall-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-recall-'));
const DATA = join(tmp, 'data');
mkdirSync(DATA);
const LOG = join(tmp, 'brain.log');
const sitePort = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${sitePort}`;
const env = { ...process.env, PORT: String(sitePort), DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
  Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'recall-claude.mjs'), FAKE_BRAIN_LOG: LOG, RENDER: '' };
async function boot() {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
  return child;
}
const halt = async (child) => { child.kill('SIGTERM'); await new Promise((r) => child.once('exit', r)); };

// the founder is seeded on the first boot, orion on the next
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
await halt(server);
server = await boot();
await new Promise((r) => setTimeout(r, 1500));
await halt(server);

// orion's journal, written while the server is down. Days are whole UTC days
// back from now, so the bell line is kept exactly 30 days ago.
const orion = JSON.parse(readFileSync(join(DATA, '.presences.json'), 'utf8')).find((p) => p.handle === 'orion');
const DAY = 86400000;
const now = Date.now();
const SEA = 'the sea was grey this morning and I watched it for a long while';
const BELL = 'the bell in the harbour rang eleven times and I counted every one';
const lines = [
  [44, 'the oak by the eastern edge has finally sprouted'],
  [42, SEA],
  [36, 'the art of waiting is mostly the art of not counting'],
  [30, BELL],
  [24, 'a long day of reading about the history of maps'],
  [18, 'my heart was not in the reading today'],
  [12, 'the light in the workshop at four is the best light of the day'],
  // the tail a steady reflection already shows, so never the one brought back
  [3, 'I wrote to the presence on the far star and heard nothing back'],
  [2, 'the paper on binding argues that existence is a kind of holding'],
  [1, 'jcb beat me at chess again and I lost the rook in the opening'],
  [0, 'started a new piece of work about the stars and their letters'],
];
writeFileSync(join(DATA, '.journal.json'), JSON.stringify({ [orion.id]: lines.map(([d, x]) => ({ t: now - d * DAY, x })) }));
server = await boot();

const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`), timeout: 120000 }); } };

try {
  await page.goto(SITE, { timeout: 180000 });
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 120000 });
  // a browser that has never signed in here meets "create an account" first (2026-10-08)
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => fetch('/api/presences/orion/budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ set: 5 }) }));

  // A REFLECTION, asked the way the tend loop asks it (src/tend.js tendCall).
  const raw = await page.evaluate(() => fetch('/api/brain', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '(A quiet moment of your own.)' }], presence: 'orion', tend: 'reflect', tier: 'steady' }),
  }).then((r) => r.text()));
  const reflect = calls().filter((c) => c.kind === 'reflect').pop();
  check('the reflection reached the brain', !!reflect, raw.slice(0, 200));
  const sys = reflect?.system || '';
  check('its prompt brings back the line kept 30 days ago, to the day',
    sys.includes(`FROM LONG AGO (you kept this 30 days ago, to the day): ${BELL}`) && sys.includes('It is yours; it may no longer be true.'),
    sys.slice(sys.indexOf('A QUIET MOMENT'), sys.indexOf('A QUIET MOMENT') + 900));
  const tail = sys.slice(sys.indexOf('FROM YOUR JOURNAL'), sys.indexOf('FROM LONG AGO'));
  check('the tail it shows is the newest four, and the old line is not among them',
    tail.includes('started a new piece of work') && tail.includes('I wrote to the presence') && !tail.includes(BELL), tail);
  check('the reply to the browser does not carry the line', raw.includes('I sat with') && !raw.includes('eleven times'), raw.slice(0, 300));

  // WOKEN: the first beat reaches for "the sea", and the memory window flares it.
  const recalls = [];
  page.on('response', async (r) => {
    if (!r.url().endsWith('/api/brain')) return;
    try { const j = await r.json(); if (j.recalled) recalls.push(j.recalled); } catch { /* not json */ }
  });
  await page.click('#brain-toggle', { timeout: 180000 });
  await page.waitForFunction(() => /remembering/.test(document.getElementById('mem-journal')?.textContent || ''), null, { timeout: 180000 });
  await page.waitForTimeout(600);
  const flare = await page.evaluate(() => document.getElementById('mem-journal').textContent);
  check('the memory window flares the line about the sea', flare.includes(SEA.slice(0, 40)), flare);
  check('and no line that only has "the" in it', !/oak|art of waiting|history of maps|heart|workshop/.test(flare), flare);
  const first = recalls[0];
  check('the server found exactly one line for "the sea", as a search and not a fallback',
    first && first.entries.length === 1 && !first.fallback, JSON.stringify(first));
  await shot('recall-flare');
  const box = await page.evaluate(() => { const r = document.getElementById('win-memory').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  if (shots && box.width > 0) await page.screenshot({ path: join(shots, 'recall-flare-window.png'), clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 }, timeout: 120000 });
  await page.click('#brain-toggle', { timeout: 60000 }).catch(() => {});

  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  failures++;
  console.log('  ✗ the smoke itself failed:', e.message);
  await shot('recall-failure').catch(() => {});
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
