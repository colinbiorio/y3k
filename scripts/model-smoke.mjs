#!/usr/bin/env node
// WHAT IS THINKING, AND EVERY MODEL, in Chromium (Colin, 2026-10-08). The site
// with no key of its own, the engine in this process with the stand-in
// `claude` (test/fakes/claude.mjs) and this browser paired with it, the
// founder signed in (the setup is own-brain-smoke.mjs's).
//   - under the wordmark: the maker's real mark and the model's name, each its
//     own pour of the metal, each spinnable on its own, clear of the top grip
//   - Settings → Brain: a model menu for Claude Code (no key) with its default
//     and every Claude model; choosing one renames the line, and the next turn
//     runs claude -p --model with it
//   - the key providers list their models before any key
//
//   node scripts/model-smoke.mjs [--shots <dir>]
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


const lineNow = () => page.evaluate(() => {
  const el = document.getElementById('home-model');
  const r = el?.getBoundingClientRect(), b = document.getElementById('home-brand')?.getBoundingClientRect();
  return { hidden: !el || el.hidden, label: el?.getAttribute('aria-label') || '', canvases: el ? el.querySelectorAll('canvas').length : 0,
    spin: [...(el?.querySelectorAll('.home-model-logo, .home-model-name') || [])].map((x) => x.style.touchAction),
    below: r && b ? Math.round(r.top - b.bottom) : null, centred: r ? Math.round(r.left + r.width / 2 - innerWidth / 2) : null,
    clearOfGrip: (() => { const g = document.getElementById('nav-collapse-top')?.getBoundingClientRect(); return !g || !r || r.top >= g.bottom || r.bottom <= g.top; })() };
});
const shotTop = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`), clip: { x: 1280 / 2 - 260, y: 0, width: 520, height: 230 } }); } };
// the bakes land in order: the logo's stand-in (its own svg) hides when its
// bake does, and the name's is next in the queue
const poured = async () => {
  await page.waitForFunction(() => { const s = document.querySelector('#home-model .home-model-logo > svg'); return s && getComputedStyle(s).display === 'none'; }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
};
const optionsOf = () => page.evaluate(() => [...document.getElementById('brain-model').options].map((o) => o.value));
const pickModel = async (label) => {
  await page.click('.gs:has(#brain-model) .gs-btn');
  await page.waitForSelector('.gs-opt .gs-label', { timeout: 5000 });
  await page.click(`.gs-opt:has(.gs-label:text-is("${label}"))`);
  await page.waitForTimeout(300);
};
const pickProvider = async (label) => {
  await page.click('.gs:has(#brain-provider) .gs-btn');
  await page.waitForSelector('.gs-opt .gs-label', { timeout: 5000 });
  await page.click(`.gs-opt:has(.gs-label:text-is("${label}"))`);
  await page.waitForTimeout(600);
};

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 20000 });
  await page.waitForFunction(() => !document.getElementById('home-model')?.hidden && document.querySelectorAll('#home-model canvas').length >= 2, null, { timeout: 30000 }).catch(() => {});
  await poured();
  const a = await lineNow();
  await shotTop('1-claude-code');
  check('under the wordmark: Claude\'s mark and "Claude Code", once the stream is up', !a.hidden && a.label === 'Claude Claude Code', JSON.stringify(a));
  check('each poured on its own, each spinnable on its own', a.canvases >= 2 && a.spin.every((t) => t === 'none') && a.spin.length === 2, JSON.stringify(a));
  check('hung under the name, on its centre line, clear of the top bar\'s grip', a.below !== null && a.below > -30 && a.below < 60 && Math.abs(a.centred) <= 2 && a.clearOfGrip, JSON.stringify(a));

  await page.click('#nav-settings');
  await page.waitForSelector('.set-tab[data-pane="brain"]', { timeout: 20000 });
  await page.click('.set-tab[data-pane="brain"]');
  await page.waitForFunction(() => !document.getElementById('brain-model-row').hidden && document.getElementById('brain-model').options.length > 5, null, { timeout: 15000 }).catch(() => {});
  const cc = await optionsOf();
  check('Claude Code, with no key: Default and every Claude model', cc[0] === 'default' && ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-haiku-4-5'].every((m) => cc.includes(m)), JSON.stringify(cc));
  await page.click('.gs:has(#brain-model) .gs-btn');
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: join(shots, '2-claude-code-models.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await pickModel('Claude Opus 5.5');
  const chosen = await page.evaluate(() => JSON.parse(localStorage.getItem('y3k.ownModel') || '{}'));
  check('the choice is kept for Claude Code', chosen.claude === 'claude-opus-5-5', JSON.stringify(chosen));

  for (const [label, want] of [['Anthropic', ['claude-opus-5-5', 'claude-fable-5-1']], ['OpenAI', ['gpt-5', 'gpt-4.1', 'o3']]]) {
    await pickProvider(label);
    await page.waitForFunction(() => !document.getElementById('brain-model-row').hidden, null, { timeout: 8000 }).catch(() => {});
    const opts = await optionsOf();
    check(`${label}, before any key: its models listed`, want.every((m) => opts.includes(m)), JSON.stringify(opts.slice(0, 12)));
  }
  await pickProvider('Claude Code');
  await page.click('#settings-close');
  await page.waitForFunction(() => /Opus 5\.5/.test(document.getElementById('home-model')?.getAttribute('aria-label') || ''), null, { timeout: 20000 }).catch(() => {});
  await poured();
  const b = await lineNow();
  await shotTop('3-claude-opus');
  check('back on Claude Code, the line under the wordmark says the chosen model', b.label === 'Claude Claude Opus 5.5' && b.canvases >= 2, JSON.stringify(b));

  const before = thinks().length;
  await page.fill('#chat-input', 'what is up');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /I heard:/.test(document.getElementById('caption')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const spawns = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'spawn' && x.argv.includes('-p'));
  const last = spawns.pop();
  check('the next turn runs on it: claude -p --model claude-opus-5-5', thinks().length > before && last && last.argv[last.argv.indexOf('--model') + 1] === 'claude-opus-5-5', JSON.stringify(last?.argv));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  await page.screenshot({ path: join(tmp, 'error.png') }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  engine.shutdown();
  await http.close();
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll model checks passed.');
process.exit(failures ? 1 : 0);
