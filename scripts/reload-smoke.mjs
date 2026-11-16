#!/usr/bin/env node
// A RELOAD KEEPS THE CONVERSATION, in Chromium. Colin, 2026-11-15: "the
// koding conversation isn't correctly preserved when you reload the page".
// His picture: a column of ten small bubbles down the left of the room, each
// saying only "thinking…".
//
// The site (temp data, the founder signed in), the engine (in this process,
// with the stand-in `claude` and every "yes on your computer" answered yes)
// and Chromium, paired through the link the engine opens, as
// scripts/code-smoke.mjs sets them up. Then what a person does:
//   a turn that edits a file, and the page reloaded when it is over;
//   a reply left half-written, the page reloaded under it, the turn stopped;
//   the page reloaded once more.
// After each reload the conversation is the one that was there: the same
// lines in the same order, the same words, and nothing says "thinking…".
// Last, made-up events through the view's own path (the controller's _feed),
// to see in a real DOM the two rules that picture broke: a reply that is over
// does not say it is thinking, and a late fragment of a reply the page does
// not hold draws nothing.
//
//   node scripts/reload-smoke.mjs [--shots <dir>] [--size 1440x900]
//   (PW_CORE=<a folder holding playwright-core> where playwright is not
//   installed; PORT=<n> serves the site on that port; SMOKE_SLOW=<n> makes
//   every wait n times as long, where several runs share a machine)
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { createStore } from '../y3k-code/store.mjs';
import { createEngine } from '../y3k-code/engine.mjs';
import { createPairing } from '../y3k-code/pair.mjs';
import { createHttp } from '../y3k-code/http.mjs';
import { fixedConsent } from '../y3k-code/consent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const [W, H] = (argv.includes('--size') ? argv[argv.indexOf('--size') + 1] : '1440x900').split('x').map(Number);
const PASSWORD = 'smoke-founder-' + Math.random().toString(36).slice(2);
const SLOW = Math.max(1, Number(process.env.SMOKE_SLOW) || 1);

// Playwright where it is installed. Failing that, a playwright-core in the
// folder PW_CORE names, with the Chromium already in this computer's cache.
async function loadPlaywright() {
  try { return { pw: await import('playwright') }; } catch { /* not local */ }
  try {
    const g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { pw: await import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href) };
  } catch { /* not global */ }
  if (!process.env.PW_CORE) throw new Error('no playwright: npm i -g playwright, or PW_CORE=<a folder holding playwright-core>');
  const pw = createRequire(join(process.env.PW_CORE, 'x.js'))('playwright-core');
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const hit = existsSync(cache) && readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().at(-1);
  const exe = hit ? join(cache, hit, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') : null;
  return { pw, exe: exe && existsSync(exe) ? exe : null };
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

// (found before anything is started: a run that cannot find its browser
// leaves no server running and no folder behind)
const { pw, exe } = await loadPlaywright();

const tmp = mkdtempSync(join(tmpdir(), 'y3k-smoke-'));
const repo = realpathSync(mkdtempSync(join(homedir(), 'y3k-smoke-repo-')));
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
execSync('git init -q && git -c user.email=s@s -c user.name=s add . && git -c user.email=s@s -c user.name=s commit -qm first', { cwd: repo });
mkdirSync(join(tmp, 'data'));
const sitePort = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${sitePort}`;

// --- the site: no model is called (test/fakes/brain-scripted.mjs) ---------------
let serverLog = '';
async function bootSite() {
  const child = spawn(process.execPath, ['--import', './test/fakes/brain-scripted.mjs', 'server.mjs'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '',
      FAKE_BRAIN_SCRIPT: 'handoff', RENDER: '' },
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return child;
}
const server = await bootSite();

// --- the engine, in this process, on a port the system picks ---------------------
const store = createStore(join(tmp, 'engine'));
store.setConfig({ signIn: true });
store.setFolder(repo, { trusted: true, trustedAt: Date.now(), lastUsed: Date.now(), name: repo.split('/').pop(), isGit: false });
let enginePort = 0;
const engine = createEngine({ store, consent: fixedConsent(true), env: { ...process.env, FAKE_CLAUDE_LOG: join(tmp, 'fake.log') }, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') },
  door: () => (enginePort ? `http://127.0.0.1:${enginePort}` : null) });
const pairing = createPairing({ load: store.tokens, save: store.setTokens });
const http = createHttp({ engine, pairing, origins: [SITE] });
enginePort = await http.listen(0);
const code = pairing.issueCode();

// --- the browser ------------------------------------------------------------------
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], ...(exe ? { executablePath: exe } : {}) });
// (Chromium asks before a page reaches this computer's own ports: the person's
// Allow, given here; a Playwright that does not know the permission goes without)
const view = { viewport: { width: W, height: H }, deviceScaleFactor: 1 };
const ctx = await browser.newContext({ ...view, permissions: ['local-network-access'] }).catch(() => browser.newContext(view));
// three.js is served from this computer; any other outside request is refused
// at once rather than left to time out.
const threeDir = join(tmpdir(), 'y3k-smoke-three-0.160.0');
try { readFileSync(join(threeDir, 'package', 'package.json')); } catch {
  mkdirSync(threeDir, { recursive: true });
  execSync('npm pack three@0.160.0 --silent', { cwd: threeDir, stdio: 'ignore' });
  execSync('tar xzf three-0.160.0.tgz', { cwd: threeDir });
}
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
  const m = /^https:\/\/unpkg\.com\/three@0\.160\.0\/(.+)$/.exec(route.request().url());
  if (m) return route.fulfill({ path: join(threeDir, 'package', m[1].split('?')[0]), contentType: 'application/javascript' });
  return route.abort();
});
// A y3kode of the person's own may be running on this computer, on one of its
// ten ports. The engine here listens elsewhere, and theirs is never knocked on.
await ctx.route(/^http:\/\/127\.0\.0\.1:478(2\d|30)\//, (route) => route.abort());
const page = await ctx.newPage();
page.setDefaultNavigationTimeout(120000 * SLOW);
const T = (ms) => ({ timeout: ms * SLOW });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };

// The conversation as the person sees it: each line's kind in order, what
// they asked, what was answered, and how many lines say "thinking…".
const KINDS = ['us', 'as', 'tl', 'pm', 'or', 'qs', 'pl', 'sys'];
const conversation = () => page.evaluate((kinds) => {
  const lines = [...document.querySelectorAll('.cv-list > .it')];
  const words = (el, sel) => (el.querySelector(sel)?.textContent || '').trim();
  return {
    kinds: lines.map((el) => kinds.find((k) => el.classList.contains(k)) || el.className),
    asked: lines.filter((el) => el.classList.contains('us')).map((el) => words(el, '.us-text')),
    said: lines.filter((el) => el.classList.contains('as')).map((el) => words(el, '.md')),
    thinking: document.querySelectorAll('.cv-list .th-live').length,
  };
}, KINDS);
const same = (a, b) => JSON.stringify([a.kinds, a.asked, a.said]) === JSON.stringify([b.kinds, b.asked, b.said]);
// The page loaded again, as the person's reload does it, and Code on screen
// again with the conversation's first card drawn.
async function reload() {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, T(30000));
  const opened = await page.waitForSelector('.cv-pane', { state: 'visible', ...T(4000) }).then(() => 'by itself', () => null);
  if (!opened) await page.click('#nav-code');
  await page.waitForSelector('.cv-list .it.tl.tk-edit', T(30000));
  await page.waitForTimeout(1000 * SLOW);   // and whatever the engine had left to say has been said
  return opened || 'at the laptop';
}

try {
  await page.goto(`${SITE}/#y3k-code=${enginePort}-${code}`);
  await page.waitForSelector('#login-email', { state: 'visible', ...T(15000) });
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cv-folderrow', T(30000));
  await page.click('.cv-folderrow');
  await page.waitForSelector('.cv-modecard.m-ask', T(15000));
  await page.click('.cv-modecard.m-ask');
  await page.waitForSelector('.cv-input', T(15000));
  check('signed in, paired through the link, a folder opened', pairing.list().length === 1);

  // --- 1. a turn that edits a file, and a reload when it is over -------------------
  await page.fill('.cv-input', "Use the Edit tool to change the word 'world' to 'y3k' in hello.txt.");
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm:not(.done)', T(15000));
  await page.focus('.cv-input');
  await page.keyboard.press('Enter');   // an empty Enter answers the waiting card
  await page.waitForSelector('.it.pm.done.pm-allow', T(15000));
  await page.waitForSelector('.cv-list .it.cv-turnsum', T(15000));
  const first = await conversation();
  check('a turn landed: a request, the edit\'s card, an answer', first.asked.length === 1 && first.kinds.includes('tl') && first.said.some(Boolean) && readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n', JSON.stringify(first));
  await shot('1-a-turn');
  const how = await reload();
  const again = await conversation();
  console.log(`    (after the reload Code came back ${how})`);
  check('a reload keeps the conversation: the same lines in the same order, the same words', same(first, again), JSON.stringify({ before: first, after: again }));
  check('and nothing in it says "thinking…"', again.thinking === 0, String(again.thinking));
  await shot('2-reloaded');

  // --- 2. a reply half-written, the page reloaded under it, the turn stopped ------
  await page.fill('.cv-input', 'go slow');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Working on it/.test(document.querySelector('.cv-list')?.textContent || ''), null, T(15000));
  const half = await conversation();
  await reload();
  const under = await conversation();
  check('a reload under a reply being written keeps what was asked, once', JSON.stringify(under.asked) === JSON.stringify(half.asked) && under.asked.length === 2, JSON.stringify({ before: half, after: under }));
  check('and the words written so far', under.said.at(-1) === 'Working on it', JSON.stringify(under.said));
  check('and the turn still shows as running', !!(await page.$('.cv-working')));
  await shot('3-reloaded-mid-reply');
  await page.click('.cv-input');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.it.sys.st-stopped', T(15000));
  await page.waitForTimeout(500 * SLOW);
  const stopped = await conversation();
  check('stopped after the reload: the turn\'s line goes, nothing is thinking, nothing is said twice',
    !(await page.$('.cv-working')) && stopped.thinking === 0 && JSON.stringify(stopped.asked) === JSON.stringify(half.asked) && stopped.said.filter((x) => x === 'Working on it').length === 1, JSON.stringify(stopped));

  // --- 3. and once more, at rest ------------------------------------------------
  await reload();
  const last = await conversation();
  check('a second reload: the same conversation again, the stopped turn with it', same(stopped, last) && last.thinking === 0, JSON.stringify({ before: stopped, after: last }));
  await shot('4-reloaded-again');

  // --- 4. the two rules, in a real DOM ----------------------------------------------
  const rules = await page.evaluate(async () => {
    const { createCodeView } = await import('/src/code/code-view.js');
    const cv = createCodeView();
    const sid = cv._state.active;
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const thinking = () => document.querySelectorAll('.cv-list .th-live').length;
    const lines = () => document.querySelectorAll('.cv-list > .it').length;
    const out = { before: thinking() };
    // a thought still open when its turn ends
    cv._feed({ sid, type: 'turn.started' });
    cv._feed({ sid, type: 'message.delta', id: 'msg_smoke_think', block: 0, kind: 'thinking', text: '' });
    await frame();
    out.during = thinking();
    cv._feed({ sid, type: 'turn.ended', status: 'success' });
    await frame();
    out.after = thinking();
    // ten fragments from before what the page has of this session, each of a
    // reply it does not hold: older than the history it read
    out.lines = lines();
    for (let i = 0; i < 10; i++) cv._feed({ sid, seq: 1, type: 'message.delta', id: 'msg_smoke_older_' + i, block: 0, kind: 'thinking', text: '' });
    await frame();
    await frame();
    out.late = { thinking: thinking() - out.after, lines: lines() - out.lines };
    return out;
  });
  check('a reply says "thinking…" while it thinks, and not once its turn is over', rules.before === 0 && rules.during === 1 && rules.after === 0, JSON.stringify(rules));
  check('ten late fragments of replies the page does not hold draw nothing', rules.late.thinking === 0 && rules.late.lines === 0, JSON.stringify(rules.late));
  await shot('5-the-rules');

  const mine = errors.filter((e) => !/ERR_CONNECTION_REFUSED|ERR_FAILED|Failed to load resource/.test(e));
  check('no page errors', mine.length === 0, mine.slice(0, 6).join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  await shot('error').catch(() => {});
  if (errors.length) console.log('  console:', errors.slice(0, 8).join('\n    '));
  if (process.env.SMOKE_VERBOSE) console.log(serverLog.slice(-3000));
} finally {
  await browser.close().catch(() => {});
  engine.shutdown();
  await http.close();
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
