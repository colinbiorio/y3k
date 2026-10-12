#!/usr/bin/env node
// YOUR PRESENCE ON YOUR OWN SIGN-IN, END TO END, in Chromium: the site with NO
// key of its own and no local brain (as the hosted site is), the engine in
// this process with the stand-in `claude` (test/fakes/claude.mjs) and this
// browser already paired with it, and the founder signed in with "Your own
// subscription" chosen in Settings → Brain. A message typed in the chat has to
// go site → this page → y3kode → claude -p → back, and the orb has to say what
// the stand-in said. Then, with the choice turned off, the orb says to add an
// AI provider instead of answering.
//
//   node scripts/own-brain-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { createPairing } from '../y3k-code/pair.mjs';
import { createHttp } from '../y3k-code/http.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'own-brain-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-ownbrain-'));
mkdirSync(join(tmp, 'data'));
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;
let serverLog = '';
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder',
    ANTHROPIC_API_KEY: '', Y3K_LOCAL_CLAUDE_CODE: '', RENDER: '' },
});
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

// the engine, with the stand-in claude, and this browser already paired
const LOG = join(tmp, 'fake.log');
const store = createStore(join(tmp, 'engine'));
store.setConfig({ signIn: true });
const asked = [];
const engine = createEngine({ store, consent: async (kind) => { asked.push(kind); return true; }, env: { ...process.env, FAKE_CLAUDE_LOG: LOG, ANTHROPIC_API_KEY: 'sk-ant-must-not-be-used' }, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') } });
const pairing = createPairing({ load: store.tokens, save: store.setTokens });
const http = createHttp({ engine, pairing, origins: [SITE] });
const enginePort = await http.listen(0);
const token = pairing.mint({ origin: SITE, agent: 'smoke', preapproved: true });
const thinks = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'think') : []);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
// Paired, and nothing else: no choice is stored, so this is the founder's
// default (Colin: "i'm signed in with y3kode but it still says sign in").
await page.addInitScript(([port, tok]) => {
  if (window !== window.top) return;   // the page's own sandboxed frames have no storage
  localStorage.setItem('y3k-code:pair', JSON.stringify({ port, token: tok }));
}, [enginePort, token]);
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const caption = () => page.evaluate(() => document.getElementById('caption')?.textContent || '');

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 });
  // a browser that has never signed in here meets "create an account" first (2026-10-08)
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 20000 });
  const health = await page.evaluate(async () => { for (let i = 0; i < 40; i++) { const h = await (await fetch('/api/health', { cache: 'no-store' })).json(); if (h.ownBrain) return h; await new Promise((r) => setTimeout(r, 250)); } return (await fetch('/api/health')).json(); });
  check('the site has no key of its own, and the founder\'s page offers their own sign-in', health.brain === false && health.ownBrain === true, JSON.stringify({ brain: health.brain, ownBrain: health.ownBrain }));

  const before = thinks().length;
  await page.fill('#chat-input', 'what is up');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /I heard:/.test(document.getElementById('caption')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const said = await caption();
  await shot('1-own-sign-in');
  // the stand-in echoes the conversation's last line, which the site stamps with when it was said
  check('the orb answers in the stand-in\'s words, through y3kode on this computer', /I heard: (\(just now\) )?what is up/.test(said), said);
  const t = thinks().slice(before);
  check('one turn of claude -p: the presence\'s own system prompt, the message last', t.length === 1 && /yearthreethousand|orion|presence/i.test(t[0].system) && /what is up$/.test(t[0].input.trim()), JSON.stringify(t.map((x) => ({ sys: x.system.slice(0, 80), input: x.input.slice(-40) }))));
  check('asked once on the computer', asked.filter((k) => k === 'brain.own').length === 1, JSON.stringify(asked));
  const spawnLine = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'spawn' && x.argv.includes('-p')).pop();
  check('on the sign-in: the key in the engine\'s environment never reached it', spawnLine && !spawnLine.envNames.includes('ANTHROPIC_API_KEY'), JSON.stringify(spawnLine?.envNames?.filter((n) => /KEY|TOKEN/.test(n))));

  // Settings → Brain: Claude Code is the provider, and the card says Connected
  await page.click('#nav-settings');
  await page.waitForSelector('.set-tab[data-pane="brain"]', { timeout: 20000 });
  await page.click('.set-tab[data-pane="brain"]');
  await page.waitForFunction(() => document.getElementById('cc-pill')?.dataset.state === 'connected', null, { timeout: 15000 }).catch(() => {});
  const pane = await page.evaluate(() => ({ provider: document.getElementById('brain-provider').value, shown: !document.getElementById('cc-sec').hidden,
    pill: document.getElementById('cc-pill').textContent, line: document.getElementById('cc-line').textContent,
    options: [...document.getElementById('brain-provider').options].map((o) => o.value) }));
  await shot('2-settings-brain');
  check('Settings → Brain: Claude Code chosen, signed in through y3kode, Connected', pane.provider === 'claude' && pane.shown && pane.pill === 'Connected', JSON.stringify(pane));
  check('every provider in one list', ['claude', 'anthropic', 'openai', 'openrouter'].every((v) => pane.options.includes(v)), JSON.stringify(pane.options));

  // another provider chosen from the list: the stream closes, and with no key
  // the orb says what is missing instead of answering
  await page.click('.gs:has(#brain-provider) .gs-btn');
  await page.waitForSelector('.gs-opt .gs-label', { timeout: 5000 });
  await page.waitForTimeout(300);
  await shot('2b-provider-list');
  await page.click('.gs-opt:has(.gs-label:text-is("Anthropic"))');
  await page.waitForTimeout(300);
  const keyShown = await page.evaluate(() => ({ provider: document.getElementById('brain-provider').value, key: !document.getElementById('key-sec').hidden, card: !document.getElementById('cc-sec').hidden }));
  check('choosing Anthropic shows its key field instead of the card', keyShown.provider === 'anthropic' && keyShown.key && !keyShown.card, JSON.stringify(keyShown));
  await page.keyboard.press('Escape');
  await page.waitForFunction(async () => !(await (await fetch('/api/health', { cache: 'no-store' })).json()).ownBrain, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.fill('#chat-input', 'hello?');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /AI provider/.test(document.getElementById('caption')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const off = await caption();
  await shot('3-no-provider');
  check('turned off, with no key anywhere: "add an AI provider", not a canned line', /In order to use y3k, you must add an AI provider in Settings → Brain\./.test(off), off);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  await shot('error').catch(() => {});
  if (process.env.SMOKE_VERBOSE) console.log(serverLog.slice(-3000));
} finally {
  await browser.close().catch(() => {});
  engine.shutdown();
  await http.close();
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll own-brain checks passed.');
process.exit(failures ? 1 : 0);
