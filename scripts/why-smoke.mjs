#!/usr/bin/env node
// WHY THE BRAIN DID NOT ANSWER, in Chromium. The site with the three brain
// providers faked (test/fakes/brain-upstream.mjs, each failing the way it
// really does), the founder signed in with a key kept in this browser:
//   - a key Anthropic turns away: the arrival says so, by name, instead of a
//     stray thought in the orb's voice; so does the turn after it, and the
//     site asks Anthropic once, not again on the non-streaming route
//   - an OpenRouter account with no credit: said as that
//   - this device offline: nothing is sent, the line says it is the
//     connection, and the words go back in the box
//
//   node scripts/why-smoke.mjs [--shots <dir>] [--port <n>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 47200 + Math.floor(Math.random() * 100);
const PASSWORD = 'why-' + Math.random().toString(36).slice(2);
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` (${detail})` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-why-'));
mkdirSync(join(tmp, 'data'));
const LOG = join(tmp, 'upstream.log');
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['--import', './test/fakes/brain-upstream.mjs', 'server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
    Y3K_LOCAL_CLAUDE_CODE: '', RENDER: '', FAKE_BRAIN_LOG: LOG },
});
for (let i = 0; i < 600; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
const upstream = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(120000);   // a slow machine, drawing the orb in software
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const brainCalls = [];
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/brain')) brainCalls.push(u.pathname); });
// A key kept in this browser that its provider has since revoked, and Claude
// Code not chosen, so the key is what thinks.
await page.addInitScript(() => {
  if (window !== window.top) return;
  if (sessionStorage.getItem('why-smoke-seeded')) return;
  sessionStorage.setItem('why-smoke-seeded', '1');
  localStorage.setItem('y3k.brain', JSON.stringify({ provider: 'anthropic', key: 'sk-ant-revoked-smoke', model: '' }));
  localStorage.setItem('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
});
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const ring = () => page.evaluate(() => [...document.querySelectorAll('#chat-history .hl')].map((n) => n.textContent.trim()).filter(Boolean));
// fill and press, no click: on a slow machine with software GL the canvas
// keeps a click waiting long after the box is ready
const say = async (text) => {
  await page.fill('#chat-input', text, { timeout: 120000 });
  await page.press('#chat-input', 'Enter', { timeout: 120000 });
};
const waitRing = (re, ms = 120000) => page.waitForFunction((src) => [...document.querySelectorAll('#chat-history .hl')].some((n) => new RegExp(src).test(n.textContent)), re.source, { timeout: ms }).catch(() => {});
// …or for a line to have been said n times
const waitSaid = (line, n, ms = 120000) => page.waitForFunction(([l, k]) => [...document.querySelectorAll('#chat-history .hl')].filter((x) => x.textContent.trim() === l).length >= k, [line, n], { timeout: ms }).catch(() => {});
const KEY_LINE = 'Anthropic did not accept this key. It may be mistyped or revoked. Check it in Settings → Brain.';
const idle = () => page.waitForFunction(() => !document.body.classList.contains('thinking'), null, { timeout: 30000 }).catch(() => {});

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 300000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com', { timeout: 120000 });
  await page.fill('#login-pass', PASSWORD, { timeout: 120000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 300000 });

  console.log('a key Anthropic turned away:');
  // the arrival's own turn is refused first, and says so
  await waitSaid(KEY_LINE, 1);
  await page.waitForTimeout(800);
  await shot('0-opening-key-refused');
  const r0 = await ring();
  check('the arrival says Anthropic did not accept the key, not a stray thought', r0.filter((t) => t === KEY_LINE).length === 1, JSON.stringify(r0.slice(-3)));
  await page.waitForTimeout(16000);   // the room's own turn watchdog lets the notice settle
  await idle();

  const beforeUp = upstream().length;
  brainCalls.length = 0;
  await say('hello, are you there?');
  await waitSaid(KEY_LINE, 2);
  await page.waitForTimeout(800);
  await shot('1-key-refused');
  const r1 = await ring();
  check('the turn says it too', r1.filter((t) => t === KEY_LINE).length === 2, JSON.stringify(r1.slice(-3)));
  check('the page asked once: the stream, and not the non-streaming route after it', brainCalls.join(',') === '/api/brain/stream', brainCalls.join(','));
  check('Anthropic was asked once', upstream().length - beforeUp === 1, String(upstream().length - beforeUp));
  check('nothing the provider wrote is on the page', !r1.some((t) => /invalid x-api-key|sk-ant-revoked/.test(t)));

  console.log('\nan OpenRouter account with no credit:');
  await page.evaluate(() => localStorage.setItem('y3k.brain', JSON.stringify({ provider: 'openrouter', key: 'sk-or-broke', model: '' })));
  brainCalls.length = 0;
  await page.waitForTimeout(16000);   // the room's own turn watchdog lets the last notice settle
  await say('one more try');
  await waitRing(/out of credit/);
  await page.waitForTimeout(800);
  await shot('2-credit');
  const r2 = await ring();
  check('said as credit, with whose', r2.some((t) => t === 'Your OpenRouter account is out of credit, or this key has reached its spending limit. Add credit or raise the limit with OpenRouter, then try again.'), JSON.stringify(r2.slice(-3)));
  check('asked once', brainCalls.join(',') === '/api/brain/stream', brainCalls.join(','));

  console.log('\nthis device offline:');
  await page.waitForTimeout(16000);
  await ctx.setOffline(true);
  brainCalls.length = 0;
  await say('are you still there');
  await waitRing(/could not reach the site/);
  await page.waitForTimeout(800);
  await shot('3-offline');
  const r3 = await ring();
  const box = await page.inputValue('#chat-input');
  check('the line says it is the connection', r3.some((t) => t === 'This device could not reach the site. Check the connection, then try again.'), JSON.stringify(r3.slice(-3)));
  check('nothing was sent', brainCalls.length === 0, brainCalls.join(','));
  check('the words are back in the box', box === 'are you still there', JSON.stringify(box));
  await ctx.setOffline(false);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, 'error.png') }).catch(() => {}); }
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
