// The kode pane on its own, in a real browser: no room behind it and no
// pairing. The engine runs here with the stand-in `claude`
// (test/fakes/claude.mjs), and the page reaches it the way the desktop app's
// preload does (window.y3kCode: cmd, onEvent, since), so nothing waits on the
// page's 1.5s knock on 127.0.0.1. scripts/code-smoke.mjs drives the whole site;
// on a machine busy drawing other rooms in software that knock can lose to a
// starved main thread (a 0ms timer measured 3s late), and this one still runs.
//
// What it walks: a turn's summary under its reply, the turn's own line while
// it works, a fresh start (/new) asking first mid-turn, Esc stopping the turn,
// and /clear stopping the conversation it leaves for the folders. (Until 9 Nov
// it also walked tabs: a session closed from its tab, four running and a fifth
// refused. kode is one conversation now, with no tabs.)
//
//   node scripts/code-pane-smoke.mjs [--shots <dir>] [--size 1280x800]
//   (PORT=<n> serves the page on that port; SMOKE_SLOW=<n> makes every wait
//   n times as long)
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, statSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const [W, H] = (argv.includes('--size') ? argv[argv.indexOf('--size') + 1] : '1280x800').split('x').map(Number);
const SLOW = Math.max(1, Number(process.env.SMOKE_SLOW) || 1);
const T = (ms) => ms * SLOW;

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  try {
    const g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return await import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
  } catch { /* not global */ }
  // a playwright-core in the folder PW_CORE names, with the headless Chromium already in this computer's cache
  // (a core newer than the cache asks for a build that is not there, so it is handed the path)
  if (!process.env.PW_CORE) throw new Error('no playwright: npm i -g playwright, or PW_CORE=<a folder holding playwright-core>');
  const pw = createRequire(join(process.env.PW_CORE, 'x.js'))('playwright-core');
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const hit = existsSync(cache) && readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().at(-1);
  const exe = hit && join(cache, hit, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
  if (exe && existsSync(exe)) { const launch = pw.chromium.launch.bind(pw.chromium); pw.chromium.launch = (o = {}) => launch({ executablePath: exe, ...o }); }
  return pw;
}

// --- a folder, the engine, the stand-in coder -----------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'y3k-pane-smoke-'));
const repo = realpathSync(mkdtempSync(join(homedir(), 'y3k-pane-smoke-repo-')));
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
execSync('git init -q && git -c user.email=s@s -c user.name=s add . && git -c user.email=s@s -c user.name=s commit -qm first', { cwd: repo });
const store = createStore(join(tmp, 'engine'));
store.setConfig({ signIn: true });
store.setFolder(repo, { trusted: true, trustedAt: Date.now(), lastUsed: Date.now(), name: repo.split('/').pop(), isGit: true });
const engine = createEngine({ store, consent: fixedConsent(true), env: { ...process.env, FAKE_CLAUDE_LOG: join(tmp, 'fake.log') },
  bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') }, door: () => null });

// --- the page: the stylesheet and the pane, nothing else -------------------------
// Only styles.css and src/ are served, read-only, by their own types.
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>kode pane</title>
<link rel="stylesheet" href="/styles.css">
<style>
  html { background: radial-gradient(120% 90% at 70% 40%, #3a3f4a, #15171c 70%); min-height: 100%; }
  body { margin: 0; min-height: 100vh; background: transparent; }
  #toast { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 99; padding: 8px 14px; border-radius: 12px;
    background: rgba(20, 22, 28, 0.92); color: #e7e9ee; font: 13px system-ui, sans-serif; display: none; }
</style></head>
<body class="in-code"><div id="toast"></div>
<script type="module">
  // the desktop app's bridge, over the smoke's own two functions
  const subs = new Set();
  let last = 0;
  window.y3kCode = {
    cmd: (o) => window.__cmd(o),
    onEvent: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    since: async (n) => { const list = (await window.__since(n)) || []; for (const e of list) last = Math.max(last, e.seq); return list; },
  };
  setInterval(async () => { const list = (await window.__since(last)) || []; for (const e of list) { last = Math.max(last, e.seq); for (const fn of subs) fn(e); } }, 100);
  window.__toasts = [];
  const { createCodeView } = await import('/src/code/code-view.js');
  const box = document.getElementById('toast');
  const cv = createCodeView({ toast: (m) => { window.__toasts.push(m); box.textContent = m; box.style.display = 'block'; } });
  cv.open();
  window.__cv = cv;
</script></body></html>`;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/' || path === '/pane.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  const file = resolve(ROOT, '.' + path);
  const ok = file === join(ROOT, 'styles.css') || file.startsWith(join(ROOT, 'src') + sep);
  try {
    if (!ok || !statSync(file).isFile()) throw new Error('no');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
const port = await new Promise((r) => server.listen(Number(process.env.PORT) || 0, '127.0.0.1', () => r(server.address().port)));
const SITE = `http://127.0.0.1:${port}`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());   // fonts and the like: refused at once
const page = await ctx.newPage();
page.setDefaultTimeout(T(30000));
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.exposeFunction('__cmd', (o) => engine.handle(o));
await page.exposeFunction('__since', (n) => engine.since(n));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const until = async (fn, ms) => { for (const end = Date.now() + T(ms); Date.now() < end;) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const toast = () => page.evaluate(() => window.__toasts.at(-1) || '');
const send = async (text) => { await page.fill('.cv-input', text); await page.keyboard.press('Enter'); };

try {
  await page.goto(SITE + '/pane.html', { timeout: T(60000) });
  await page.click('.cv-folderrow', { timeout: T(30000) });
  await page.click('.cv-modecard.m-ask', { timeout: T(15000) });
  await page.waitForSelector('.cv-input', { timeout: T(15000) });
  check('a session, from the folder', engine.sessionCount === 1, String(engine.sessionCount));

  // A TURN THAT LANDS SAYS WHAT IT CAME TO. The stand-in's first turn edits
  // hello.txt and asks first; an empty Enter allows it.
  await send("Use the Edit tool to change the word 'world' to 'y3k' in hello.txt.");
  await page.waitForSelector('.it.pm:not(.done)', { timeout: T(15000) });
  await page.focus('.cv-input');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cv-list .it.cv-turnsum', { timeout: T(20000) });
  const sum = await page.textContent('.cv-list .it.cv-turnsum');
  check('under its reply: how long, its file, its tokens, its cost, who pays', /^Worked \S+ · 1 file \+1 −1 · \d[\d.]*k? tokens( · \d+ tok\/s)? · \$\d+\.\d\d covered$/.test(sum || ''), sum);
  check('and only one', (await page.$$('.cv-list .it.cv-turnsum')).length === 1);
  check('no working line once it has landed', !(await page.$('.cv-working')));
  await shot('1-turn-summary');
  await page.click('.cv-turnsum .cv-turnfiles');
  check('its files open the folder\'s changes', await until(() => page.evaluate(() => { const d = document.querySelector('.cv-drawer'); return !!d && !d.hidden && /Changes on/.test(d.textContent); }), 10000));
  await shot('2-turn-files');
  await page.click('.cv-drawerhead .cv-iconbtn');   // the drawer's own ×

  // THE TURN'S OWN LINE: the stand-in writes "Working on it" and then waits
  await send('go slow');
  await page.waitForSelector('.cv-working', { timeout: T(15000) });
  const w0 = await page.textContent('.cv-working');
  await until(async () => (await page.textContent('.cv-working')) !== w0, 6000);
  const w1 = await page.textContent('.cv-working');
  check('while it works: for how long, and at what; the clock moves', /^Working 0:\d\d · Writing( · ~\d+ tok\/s)?$/.test(w0 || '') && /^Working 0:\d\d · Writing( · ~\d+ tok\/s)?$/.test(w1 || '') && w1 !== w0, `${w0} → ${w1}`);
  check('at the head of the strip, over the composer', await page.evaluate(() => document.querySelector('.cv-strip')?.firstElementChild?.classList.contains('cv-working')));
  await shot('3-working');

  // a fresh start mid-turn asks first; Cancel leaves it working
  await send('/new');
  await page.waitForSelector('.cv-dlg', { timeout: T(10000) });
  const dlg = await page.evaluate(() => [document.querySelector('.cv-dlg-title')?.textContent, document.querySelector('.cv-dlg-text')?.textContent]);
  check('a fresh start mid-turn asks first', /^Stop Claude in y3k-pane-smoke-repo-\w+\?$/.test(dlg[0] || '') && dlg[1] === 'It is in the middle of a turn. What it has done to files stays done, and the conversation is kept.', JSON.stringify(dlg));
  await page.waitForTimeout(800);   // its fade in, before the picture
  await shot('4-stop-asks');
  await page.click('.cv-dlg-no');
  check('Cancel: still working, still there', !(await page.$('.cv-dlg')) && !!(await page.$('.cv-working')) && engine.sessionCount === 1);
  await page.focus('.cv-input');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.it.sys.st-stopped', { timeout: T(10000) });
  check('Esc stops the turn, and its line goes with it', await until(async () => !(await page.$('.cv-working')), 5000));

  // /clear stops the session it leaves (it used to stay running in its tab)
  await page.waitForSelector('.cv-input:not([disabled])', { timeout: T(15000) });
  await send('/clear');
  check('/clear: the conversation it leaves is stopped, and the folders come up', await until(async () => engine.sessionCount === 0 && !!(await page.$('.cv-folderrow')), 10000), String(engine.sessionCount));
  await shot('8-cleared');

  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check(String(err.message || err).split('\n')[0], false);
  await shot('error').catch(() => {});
} finally {
  await browser.close();
  engine.shutdown?.();
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll pane checks passed.');
process.exit(failures ? 1 : 0);
