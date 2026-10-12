#!/usr/bin/env node
// WHY THE VOICE CHANGED, in Chromium (2026-10-08). The site with the three voice
// services faked (test/fakes/voice-upstream.mjs, each refusing the way it
// really does) and the founder's own brain a stand-in `claude`
// (test/fakes/speak-claude.mjs). The founder's own ElevenLabs key is out of
// characters:
//   - a reply is said in the browser's voice, and a toast says why, once
//   - Settings → Voice shows the last refusal, with its time
//   - airden, with a browser voice that never starts, says once that it is
//     reading instead, and reads
//
//   node scripts/voice-why-smoke.mjs [--shots <dir>] [--port <n>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 47200 + Math.floor(Math.random() * 100);
const PASSWORD = 'voice-why-' + Math.random().toString(36).slice(2);
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` (${detail})` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-voice-why-'));
mkdirSync(join(tmp, 'data'));
const VOICE_LOG = join(tmp, 'voice.log');
const SITE = `http://localhost:${port}`;
const env = { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
  ELEVENLABS_API_KEY: '', Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'speak-claude.mjs'),
  FAKE_BRAIN_LOG: join(tmp, 'brain.log'), FAKE_VOICE_LOG: VOICE_LOG, RENDER: '' };
async function boot() {
  const child = spawn(process.execPath, ['--import', './test/fakes/voice-upstream.mjs', 'server.mjs'], { cwd: ROOT, stdio: 'ignore', env });
  for (let i = 0; i < 600 && child.exitCode === null; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) return child; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
  console.log(`  ✗ the site did not start on port ${port} (in use? pass --port)`);
  child.kill('SIGTERM');
  process.exit(1);
}
// the founder is seeded on the first boot, orion on the next (scripts/airden-smoke.mjs)
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
const exited = new Promise((r) => server.once('exit', r));
server.kill('SIGTERM');
await exited;
server = await boot();
const speech = () => (existsSync(VOICE_LOG) ? readFileSync(VOICE_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
  .filter((x) => x.path.startsWith('/v1/text-to-speech/'));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(120000);   // a slow machine, drawing the orb in software
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
// The founder's own ElevenLabs key, now out of characters, and one of its
// voices chosen. Every toast the page shows is kept, in order.
await page.addInitScript(() => {
  if (window !== window.top) return;
  window.__toasts = [];
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('toast');
    if (t) new MutationObserver((recs) => { if (recs.some((r) => r.addedNodes.length)) window.__toasts.push(t.textContent); }).observe(t, { childList: true });
  });
  if (sessionStorage.getItem('voice-why-seeded')) return;
  sessionStorage.setItem('voice-why-seeded', '1');
  localStorage.setItem('y3k.voicekey', 'el-empty');
  localStorage.setItem('y3k.voice', JSON.stringify({ voiceId: 'own-nb', voiceName: 'River friend', provider: 'elevenlabs', models: {}, settings: {} }));
});
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const toasts = () => page.evaluate(() => window.__toasts.slice());
const ring = () => page.evaluate(() => [...document.querySelectorAll('#chat-history .hl')].map((n) => n.textContent.trim()).filter(Boolean));
const idle = () => page.waitForFunction(() => !document.body.classList.contains('thinking'), null, { timeout: 60000 }).catch(() => {});
const say = async (text) => {
  await page.fill('#chat-input', text, { timeout: 120000 });
  await page.press('#chat-input', 'Enter', { timeout: 120000 });
};
const CREDITS = "ElevenLabs says your account is out of characters. Your presence is using the browser's voice until you top up or choose another in Settings → Voice.";
const READING = '(my voice did not start, so I am reading this instead)';

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 300000 });
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  await idle();

  console.log('a reply, with your ElevenLabs account out of characters:');
  await say('hello, can you hear me?');
  await page.waitForFunction((s) => window.__toasts.includes(s), CREDITS, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot('1-toast');
  const t1 = await toasts();
  check('a toast says why, in the words asked for', t1.includes(CREDITS), JSON.stringify(t1));
  check('the service was asked with your key', speech().length >= 1 && speech().every((x) => x.headers['xi-api-key'] === 'el-empty'), String(speech().length));
  const r1 = await ring();
  check('the reply is still said and shown', r1.some((t) => /I heard you, and I am answering before I go on\./.test(t)), JSON.stringify(r1.slice(-3)));
  check('nothing the service wrote is on the page', !/quota of|credits remaining|quota_exceeded/.test(await page.evaluate(() => document.body.innerText)));
  await page.waitForTimeout(12000);   // the toast and the turn settle
  await idle();

  const asked = speech().length;
  await say('and again?');
  await page.waitForFunction((n) => [...document.querySelectorAll('#chat-history .hl')].filter((x) => /I heard you/.test(x.textContent)).length >= n, 2, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const t2 = await toasts();
  check('the next reply asks the service again', speech().length > asked, `${asked} → ${speech().length}`);
  check('and is not told again', t2.filter((t) => t === CREDITS).length === 1, JSON.stringify(t2));
  await idle();

  console.log('\nSettings → Voice:');
  await page.click('#nav-settings');
  await page.click('.set-tab[data-pane="voice"]');
  await page.waitForFunction(() => /Last answer from/.test(document.getElementById('voice-status')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('2-settings-voice');
  const status = await page.evaluate(() => ({ text: document.getElementById('voice-status').innerText, last: document.querySelector('#voice-status .voice-last')?.textContent || '' }));
  check('the last refusal shows under the list\'s line, with its time', /^Last answer from ElevenLabs, \d\d:\d\d: out of characters\.$/.test(status.last), JSON.stringify(status));
  check('and the list still says what it says', /^Choose a voice, or design one below\./.test(status.text), JSON.stringify(status));
  await page.evaluate(() => document.getElementById('settings-close').click());
  await page.waitForTimeout(800);

  console.log('\nairden, with a voice that never starts:');
  // the service refuses, and this browser's own voice never begins a sentence
  await page.evaluate(() => { window.speechSynthesis.speak = () => {}; });
  await page.evaluate(() => fetch('/api/presences/orion/budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ set: 5 }) }));
  await page.click('#chat-air');
  await page.waitForFunction((s) => [...document.querySelectorAll('#chat-history .hl')].some((n) => n.textContent.trim() === s), READING, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => /Stretch \d+ opens here\./.test(document.getElementById('chat-history')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('3-airden-reading');
  const r3 = await ring();
  const at = r3.lastIndexOf(READING);
  check('it says once that its voice did not start', r3.filter((t) => t === READING).length === 1, JSON.stringify(r3.slice(-4)));
  check('and reads the stretch below it', at >= 0 && r3.slice(at + 1).some((t) => /Stretch \d+ opens here\./.test(t)), JSON.stringify(r3.slice(-4)));
  await page.waitForTimeout(20000);   // it reads on, into the next stretch
  const r4 = await ring();
  check('still once, as it reads on', r4.filter((t) => t === READING).length === 1, JSON.stringify(r4.slice(-4)));
  await shot('4-airden-read-on');
  await page.click('#chat-air');
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
