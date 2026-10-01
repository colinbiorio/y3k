#!/usr/bin/env node
// WHAT EACH GRAPHICS TIER ACTUALLY DOES, COUNTED. Boots the site (temp data,
// founder signed in through the card, the same harness as code-smoke.mjs),
// then loads the home screen once per tier (?gfx=high|mid|low|smooth), rests
// the pointer over the orb, lets it settle, and counts a fixed window.
//
// COUNTS, NOT TIMES. This runs Chromium on SwiftShader — the GPU is emulated
// on the CPU, so a frame time here says nothing about a real machine. What
// stays true under emulation is how much WORK a tier asks for, and those are
// the columns:
//   frames    rAF callbacks the page got in the window (its vsyncs)
//   drawn     frames in which the orb's renderer drew anything; skipped = the
//             rest (the pacer resting, or the orb paused)
//   binds/f   renderer.setRenderTarget per frame — the bloom chain is ~16 of
//             these, each a chance to stall against the compositor (body.js)
//   blits/f   drawImage out of the shared liquid canvas per frame — each one
//             flushes GL and resolves the whole drawing buffer (perf-hud.js)
//   rects/f   getBoundingClientRect per frame (forced layout when dirty)
//   long      main-thread tasks over 50ms: count / total ms
//   layout, style   CDP Performance.getMetrics LayoutCount / RecalcStyleCount
//                   over the window
//   task s, script s  CDP TaskDuration / ScriptDuration over the window
//
// BEFORE AND AFTER. --site-root points the server at another checkout, so the
// same script measures the baseline and a change:
//   node scripts/perf-smoke.mjs --site-root /path/to/base
//   node scripts/perf-smoke.mjs
// A checkout that predates ?gfx= is switched with Y3K.gfx.set() after load
// instead; a tier it does not have is reported as such, not measured as
// something else.
//
//   node scripts/perf-smoke.mjs [--site-root <dir>] [--tiers high,mid,low,smooth]
//     [--window 5000] [--settle 4000] [--size 1440x900] [--json <file>] [--wait 180000]
//     [--shots <dir>]   (a screenshot of each tier's home, and of Settings → Graphics)
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const SITE_ROOT = resolve(arg('--site-root', HERE));
const TIERS = arg('--tiers', 'high,mid,low,smooth').split(',').map((s) => s.trim()).filter(Boolean);
const WINDOW_MS = Number(arg('--window', 5000));
const SETTLE_MS = Number(arg('--settle', 4000));
const [W, H] = arg('--size', '1440x900').split('x').map(Number);
const JSON_OUT = arg('--json', null);
const SHOTS = arg('--shots', null);
// Generous by default: SwiftShader on a busy machine can take a minute to
// get a WebGL page to its first frame, and a timeout here is not a finding.
const WAIT_MS = Number(arg('--wait', 180000));
const PASSWORD = 'perf-founder-' + Math.random().toString(36).slice(2);

if (!existsSync(join(SITE_ROOT, 'server.mjs'))) {
  console.error(`no server.mjs in ${SITE_ROOT}`);
  process.exit(2);
}

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const step = (what) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)}s] ${what}`);

const tmp = mkdtempSync(join(tmpdir(), 'y3k-perf-'));
mkdirSync(join(tmp, 'data'));
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;

// --- the site ---------------------------------------------------------------
let serverLog = '';
async function bootSite() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: SITE_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '',
      Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(HERE, 'test', 'fakes', 'brain-claude.mjs'), RENDER: '' },
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ }
    await sleep(150);
  }
  return child;
}
// the founder is seeded on the first boot, orion on the next
let server = await bootSite();
await sleep(1500);
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await bootSite();

// --- the counters, installed before any page script runs --------------------
// Prototype wraps, so whoever calls them and whenever they were looked up, the
// call is counted. The orb's renderer is wrapped per page once it exists.
const COUNTERS = () => {
  const P = window.__perfSmoke = { blits: 0, rects: 0, binds: 0, frames: 0, drawn: 0, long: 0, longMs: 0 };
  const proto = CanvasRenderingContext2D.prototype;
  const draw = proto.drawImage;
  proto.drawImage = function (img, ...rest) { if (img && img.__mercShared) P.blits++; return draw.call(this, img, ...rest); };
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { P.rects++; return rect.call(this); };
  let frameId = 0, drawnId = -1;
  const tick = () => { frameId++; P.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // One drawn frame per frame, however many passes the composer makes in it.
  P.markDrawn = () => { if (drawnId !== frameId) { drawnId = frameId; P.drawn++; } };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) { P.long++; P.longMs += e.duration; } })
      .observe({ type: 'longtask' });
  } catch { /* no longtask here */ }
};

// --- the browser ------------------------------------------------------------
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// Everything the room needs is served locally; anything outside (the camera's
// vision bundle, fonts) is refused at once rather than left to time out.
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
const page = await ctx.newPage();
await page.addInitScript(COUNTERS);
const errors = [];
let muted = false;   // the one load that refuses main.js on purpose
page.on('pageerror', (e) => { if (!muted) errors.push('pageerror: ' + e.message); });
page.on('console', (m) => { if (!muted && m.type() === 'error') errors.push('console: ' + m.text()); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const shot = async (name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch((e) => console.log(`  (no ${name} shot: ${e.message})`));
};
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const results = [];
let code = 0;
const uiChecks = [];
const ui = (name, pass, detail = '') => { uiChecks.push({ name, pass: Boolean(pass), detail }); if (!pass) code = 1; };
// INTO THE ROOM, whatever the door does. A returning visitor normally skips
// the card, but the page gives /api/auth/me 2.5s to answer before it decides
// this is a guest (main.js, THE ENTRANCE) — and on a loaded machine running
// SwiftShader that can lose, which shows the card again. So every load waits
// for either the room or the card, and signs in through the card if it came.
const enter = async (url, ready = () => document.body.classList.contains('in-home')) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  const which = await page.waitForFunction(() => {
    if (document.body.classList.contains('in-home')) return 'home';
    const e = document.getElementById('login-email');
    return e && e.offsetParent && getComputedStyle(e).visibility === 'visible' && document.body.classList.contains('entered') ? 'card' : false;
  }, null, { timeout: WAIT_MS }).then((h) => h.jsonValue());
  if (which === 'card') {
    // Twice at most: a sign-in that comes back with an error line (a server
    // slow to answer on a loaded machine) is tried once more rather than
    // waited on for three minutes. The check is an expression string, not a
    // function built in the page: the page's CSP has no 'unsafe-eval'.
    const outcomeExpr = `(() => {
      if ((${ready.toString()})()) return 'in';
      const err = document.getElementById('login-error');
      return err && !err.hidden && err.textContent.trim() ? 'error: ' + err.textContent.trim() : false;
    })()`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.fill('#login-email', 'colinbiorio@gmail.com');
      await page.fill('#login-pass', PASSWORD);
      await page.keyboard.press('Enter');
      const outcome = await page.waitForFunction(outcomeExpr, null, { timeout: WAIT_MS }).then((h) => h.jsonValue());
      if (outcome === 'in') return;
      step(`sign-in attempt ${attempt}: ${outcome}`);
      await sleep(2000);
    }
  }
  await page.waitForFunction(ready, null, { timeout: WAIT_MS });
};

try {
  step('signing in');
  await enter(SITE);

  for (const tier of TIERS) {
    step(`loading ?gfx=${tier}`);
    await enter(`${SITE}/?gfx=${tier}`, () => document.body.classList.contains('in-home') && window.Y3K?.gfx && window.__y3kScene?.renderer);
    // A checkout without ?gfx= gets the tier the old way; one without the
    // tier at all is reported, not silently measured at another tier.
    const got = await page.evaluate((t) => {
      const g = window.Y3K.gfx;
      if (g.tier() !== t) g.set(t);
      return g.tier();
    }, tier);
    if (got !== tier) { results.push({ tier, missing: true }); console.log(`  ${tier}: this checkout has no such tier`); continue; }
    await page.evaluate(() => {
      const P = window.__perfSmoke;
      const r = window.__y3kScene.renderer;
      if (r.__perfSmoke) return;
      r.__perfSmoke = true;
      const bind = r.setRenderTarget.bind(r);
      r.setRenderTarget = (...a) => { P.binds++; return bind(...a); };
      const render = r.render.bind(r);
      r.render = (...a) => { P.markDrawn(); return render(...a); };
    });
    // At rest, pointer resting over the orb: the hover case the liquid's
    // idle gates have to get right, and the state a person sits in.
    await page.mouse.move(W / 2, H / 2);
    await sleep(SETTLE_MS);
    const snap = () => page.evaluate(() => { const { markDrawn, ...c } = window.__perfSmoke; return c; });
    const [c0, m0] = [await snap(), await metrics()];
    await sleep(WINDOW_MS);
    const [c1, m1] = [await snap(), await metrics()];
    const d = (k) => c1[k] - c0[k];
    const frames = d('frames');
    const per = (k) => (frames ? d(k) / frames : 0);
    const state = await page.evaluate(() => ({
      gfx: document.documentElement.dataset.gfx || '',
      glass: document.documentElement.dataset.glass || '',
      motion: document.documentElement.dataset.motion || '',
      profile: window.Y3K.gfx.profile?.() || null,
    }));
    results.push({
      tier, ...state, frames, drawn: d('drawn'), skipped: frames - d('drawn'),
      bindsPerFrame: per('binds'), blitsPerFrame: per('blits'), rectsPerFrame: per('rects'),
      longTasks: d('long'), longMs: d('longMs'),
      layouts: m1.LayoutCount - m0.LayoutCount, styles: m1.RecalcStyleCount - m0.RecalcStyleCount,
      taskS: m1.TaskDuration - m0.TaskDuration, scriptS: m1.ScriptDuration - m0.ScriptDuration,
    });
    await shot(`home-${tier}`);
    step(`${tier}: measured`);
  }

  step('Settings → Graphics');
  // --- Settings → Graphics, driven the way a person drives it ----------------
  // Not a measurement: a check that the pane does what it says, in a real
  // browser, with no page errors. Skipped on a checkout that has no such pane.
  await enter(SITE, () => document.body.classList.contains('in-home') && window.Y3K?.gfx);
  await page.click('#nav-settings');
  const hasPane = await page.waitForSelector('.set-tab[data-pane="graphics"]', { timeout: 20000 }).then(() => true, () => false);
  if (hasPane) {
    await page.click('.set-tab[data-pane="graphics"]');
    await sleep(800);
    await shot('settings-graphics-before');
    await page.click('.gfx-mode[data-mode="smooth"]');
    const a = await page.evaluate(() => ({
      gfx: document.documentElement.dataset.gfx, glass: document.documentElement.dataset.glass,
      motion: document.documentElement.dataset.motion, mode: localStorage.getItem('y3k.gfx.mode'),
      checked: document.querySelector('.gfx-mode[aria-checked="true"]')?.dataset.mode,
      readout: document.getElementById('gfx-readout')?.textContent || '',
      ringsGone: getComputedStyle(document.getElementById('nav-sheet')).backdropFilter,
    }));
    ui('choosing Smooth applies it and keeps it', a.gfx === 'smooth' && a.mode === 'smooth' && a.checked === 'smooth', JSON.stringify(a));
    ui('smooth has no glass and less motion', a.glass === 'none' && a.motion === 'less' && a.ringsGone === 'none', JSON.stringify(a));
    ui('the readout says what is running', /^smooth · \d+fps · [\d.]+×$/.test(a.readout), a.readout);
    await sleep(800);
    await shot('settings-graphics-smooth');
    await page.click('#gfx-glass');
    const b = await page.evaluate(() => ({ glass: document.documentElement.dataset.glass, fine: localStorage.getItem('y3k.gfx.fine') }));
    ui('Glass on in Smooth brings the small glass back, stored', b.glass === 'small' && JSON.parse(b.fine || '{}').blur === 'small', JSON.stringify(b));
    // the frame-rate list is y3k glass now (glass-select.js): open it, pick
    await page.click('.gs:has(#gfx-fps) .gs-btn');
    await page.click('.gs-pop .gs-opt:has-text("30 a second")');
    ui('a 30fps pin reaches the profile', await page.evaluate(() => window.Y3K.gfx.profile().fps === 30));
    // boot-gfx.js ALONE: main.js is refused for this load, so whatever is on
    // <html> was put there by the <head> script, before the first paint.
    muted = true;
    await page.route('**/src/main.js', (r) => r.abort());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: WAIT_MS });
    const early = await page.evaluate(() => [document.documentElement.dataset.gfx, document.documentElement.dataset.glass, typeof window.Y3K]);
    ui('the choice is on <html> before main.js runs (boot-gfx.js)', early[0] === 'smooth' && early[1] === 'small' && early[2] === 'undefined', early.join('/'));
    await page.unroute('**/src/main.js');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: WAIT_MS });
    muted = false;
    await page.waitForFunction(() => window.Y3K?.gfx, null, { timeout: WAIT_MS });
    ui('and gfx.js agrees once it runs', await page.evaluate(() => window.Y3K.gfx.mode() === 'smooth' && window.Y3K.gfx.profile().fps === 30));
    await page.evaluate(() => window.Y3K.gfx.set(null, { fine: null }));
  } else {
    console.log('  (no Settings → Graphics pane in this checkout)');
  }
} catch (e) {
  console.error('perf-smoke failed:', e.message.split('\n')[0]);
  // Where it stood, so a timeout says what it was waiting FOR.
  const where = await page.evaluate(() => ({
    url: location.pathname + location.search, body: document.body?.className || '',
    y3k: typeof window.Y3K, gfx: typeof window.Y3K?.gfx, scene: Boolean(window.__y3kScene?.renderer),
    loginError: document.getElementById('login-error')?.hidden === false ? document.getElementById('login-error').textContent : '',
    terms: document.getElementById('terms-card')?.hidden === false,
    email: document.getElementById('login-email')?.value || '',
  })).catch((err) => ({ unreadable: err.message }));
  console.error('  page state:', JSON.stringify(where));
  await shot('failure');
  code = 1;
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}

// --- the table --------------------------------------------------------------
const cols = [
  ['tier', (r) => r.tier],
  ['html', (r) => (r.missing ? '—' : `${r.gfx}/${r.glass}/${r.motion}`)],
  ['frames', (r) => r.frames],
  ['drawn', (r) => r.drawn],
  ['skipped', (r) => r.skipped],
  ['binds/f', (r) => r.bindsPerFrame.toFixed(1)],
  ['blits/f', (r) => r.blitsPerFrame.toFixed(2)],
  ['rects/f', (r) => r.rectsPerFrame.toFixed(1)],
  ['long n/ms', (r) => `${r.longTasks}/${Math.round(r.longMs)}`],
  ['layout', (r) => r.layouts],
  ['style', (r) => r.styles],
  ['task s', (r) => r.taskS.toFixed(2)],
  ['script s', (r) => r.scriptS.toFixed(2)],
];
const rows = results.map((r) => cols.map(([, f], i) => (r.missing && i > 1 ? 'n/a' : String(f(r)))));
const widths = cols.map(([h], i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
const line = (cells) => cells.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
console.log(`\n${SITE_ROOT}  (${W}x${H}, ${WINDOW_MS / 1000}s window after ${SETTLE_MS / 1000}s settle, SwiftShader: counts are real, times are not)`);
console.log(line(cols.map(([h]) => h)));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of rows) console.log(line(row));
if (uiChecks.length) {
  console.log('\nSettings → Graphics:');
  for (const c of uiChecks) console.log(`${c.pass ? '  ✓' : '  ✗'} ${c.name}${!c.pass && c.detail ? ` — ${c.detail}` : ''}`);
}
if (errors.length) {
  console.log(`\npage errors (${errors.length}):`);
  for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ' + e);
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ siteRoot: SITE_ROOT, size: [W, H], windowMs: WINDOW_MS, results, ui: uiChecks, errors }, null, 2));
if (code && serverLog) console.error(serverLog.split('\n').slice(-20).join('\n'));
process.exit(code);
