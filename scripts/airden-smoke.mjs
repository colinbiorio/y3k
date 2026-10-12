#!/usr/bin/env node
// AIRDEN IN Y3K, END TO END, in Chromium: the founder at home, the brain their
// own local Claude Code with a stand-in `claude` (test/fakes/speak-claude.mjs),
// and the mark at the top of the chat box pressed. It has to start speaking on
// its own — words arriving a few at a time, the body turning with its tags —
// ask for the next stretch before the bank runs dry, let a typed message wait
// for the end of the sentence and answer it, pick the stream back up fresh,
// and stop when the mark is pressed again.
//
//   node scripts/airden-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'airden-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-airden-'));
mkdirSync(join(tmp, 'data'));
const LOG = join(tmp, 'brain.log');
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;
const env = { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
  Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'speak-claude.mjs'), FAKE_BRAIN_LOG: LOG, RENDER: '' };
async function boot() {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
  return child;
}
// the founder is seeded on the first boot, orion on the next
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await boot();
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const speaks = () => calls().filter((c) => c.kind === 'speak');

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const ring = () => page.evaluate(() => document.getElementById('chat-history')?.textContent || '');

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 });
  // a browser that has never signed in here meets "create an account" first (2026-10-08)
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => fetch('/api/presences/orion/budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ set: 5 }) }));

  const mark = await page.evaluate(() => {
    const b = document.getElementById('chat-air').getBoundingClientRect();
    const f = document.getElementById('chat-form').getBoundingClientRect();
    return { label: document.getElementById('chat-air').getAttribute('aria-label'), centre: b.x + b.width / 2, formCentre: f.x + f.width / 2, above: b.y < f.y };
  });
  check('the mark is set into the top of the box, on the bar\'s centre line', mark.label === 'airden' && Math.abs(mark.centre - mark.formCentre) < 1 && mark.above, JSON.stringify(mark));

  // press it, and watch the words arrive
  await page.click('#chat-air');
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const t = await ring();
    if (t !== seen.at(-1)) seen.push(t);
    if (/Stretch 1 opens here\..*The second thought/.test(t)) break;
    await page.waitForTimeout(120);
  }
  const on = await page.evaluate(() => ({ cls: document.body.classList.contains('airden'), pressed: document.getElementById('chat-air').getAttribute('aria-pressed'), mood: document.getElementById('mood-tag')?.textContent || '' }));
  check('pressed, it is on: the body says so and the mark is pressed', on.cls && on.pressed === 'true', JSON.stringify(on));
  check('it speaks on its own: its first stretch arrives in the ring', /Stretch 1 opens here\./.test(seen.at(-1) || ''), (seen.at(-1) || '').slice(-200));
  check('a few words at a time, not the whole stretch at once', seen.some((t) => /Stretch 1/.test(t) && !/opens here\./.test(t)) || seen.filter((t) => /Stretch 1/.test(t)).length >= 3, String(seen.length));
  check('the body takes the stretch\'s tag', /tender/.test(on.mood) || /excited/.test(on.mood), on.mood);
  await shot('1-speaking');
  const s = speaks();
  check('the first stretch was short, and the next — long — was asked for while it spoke', s.length >= 2 && /3 to 5 sentences/.test(s[0].input) && /10 to 16/.test(s[1].input), JSON.stringify(s.map((x) => x.input.slice(-60))));
  check('the tags are never said', !/\[tender|\[excited|<<|>>/.test(await ring()));

  // type while it speaks: the sentence finishes, it answers, and the stream comes back fresh
  const before = speaks().length;
  await page.fill('#chat-input', 'wait, hold on a second');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /I heard you, and I am answering before I go on\./.test(document.getElementById('chat-history')?.textContent || ''), null, { timeout: 45000 }).catch(() => {});
  const answered = await ring();
  check('typing mid-speech: it finishes its sentence and answers you', /I heard you, and I am answering before I go on\./.test(answered), answered.slice(-300));
  const chat = calls().filter((c) => c.kind === 'chat').at(-1);
  check('the answer knows what it had been saying aloud', chat && /you were speaking on your own/.test(chat.input) && /Stretch 1 opens here/.test(chat.input), chat?.input?.slice(-400));
  await page.waitForFunction((n) => true, before);
  const t1 = Date.now();
  let fresh = null;
  while (Date.now() - t1 < 30000) {
    fresh = speaks().slice(before).find((x) => /hold on a second/.test(x.input));
    if (fresh) break;
    await page.waitForTimeout(250);
  }
  check('then it picks the stream back up, fresh and short, turned toward what you said', fresh && /3 to 5 sentences/.test(fresh.input) && /Carry the stream on/.test(fresh.input), fresh ? fresh.input.slice(-300) : 'no fresh stretch');
  await page.waitForFunction((n) => new RegExp(`Stretch ${n} opens here`).test(document.getElementById('chat-history')?.textContent || ''), fresh?.n || 99, { timeout: 30000 }).catch(() => {});
  check('and speaks it', fresh && new RegExp(`Stretch ${fresh.n} opens here`).test(await ring()));
  await shot('2-after-reply');
  const lines = await page.evaluate(() => [...document.querySelectorAll('#chat-history .hl-ai')].map((n) => n.textContent.trim()).filter(Boolean));
  const copies = lines.filter((a, i) => lines.some((b, j) => i !== j && (b === a ? i > j : b.startsWith(a))));
  check('no line of its speech is ever written out twice in the ring', copies.length === 0, JSON.stringify(copies));

  // press again: it stops
  await page.click('#chat-air');
  await page.waitForTimeout(300);
  const offAt = speaks().length;
  await page.waitForTimeout(4000);
  const off = await page.evaluate(() => ({ cls: document.body.classList.contains('airden'), pressed: document.getElementById('chat-air').getAttribute('aria-pressed') }));
  check('pressed again, it stops and asks for nothing more', !off.cls && off.pressed === 'false' && speaks().length === offAt, JSON.stringify({ ...off, more: speaks().length - offAt }));
  const budget = await page.evaluate(() => fetch('/api/presences/orion/budget').then((r) => r.json()));
  check('what it spoke was paid from the presence\'s budget', budget.budget.remaining < 5, JSON.stringify(budget));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  if (errors.length) console.log('    page errors: ' + errors.join(' | '));
  await shot('error').catch(() => {});
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll airden checks passed.');
process.exit(failures ? 1 : 0);
