#!/usr/bin/env node
// y3k Code, end to end in a real browser: the site (temp data, founder signed
// in), the engine (in this process, with the fake `claude` and every "yes on
// your computer" answered yes), and Chromium. It pairs through the link the
// engine opens, picks a folder, chooses a mode, and then checks what the
// person would see:
//   the diff on the permission card BEFORE its buttons, the file untouched
//   until allowed, the amber dot on the laptop while it waits, green/red rows,
//   the context ring, the 5-hour and weekly bars, the cost, todos, a subagent
//   with its own tool nested inside, Esc stopping a turn, the orb still on
//   screen in its column, six glyphs on each rail, and no page errors.
//
//   node scripts/code-smoke.mjs [--shots <dir>] [--size 1440x900]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
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

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-smoke-'));
const repo = realpathSync(mkdtempSync(join(homedir(), 'y3k-smoke-repo-')));
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
mkdirSync(join(tmp, 'data'));
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;

// --- the site ---------------------------------------------------------------
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '', LOCAL_CLAUDE_CODE: '' },
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 150));
}

// --- the engine -----------------------------------------------------------------
const store = createStore(join(tmp, 'engine'));
store.setConfig({ signIn: true });
store.setFolder(repo, { trusted: true, trustedAt: Date.now(), lastUsed: Date.now(), name: repo.split('/').pop(), isGit: false });
const engine = createEngine({ store, consent: fixedConsent(true), env: { ...process.env, FAKE_CLAUDE_LOG: join(tmp, 'fake.log') }, bins: { claude: join(ROOT, 'test', 'fakes', 'claude.mjs') } });
const pairing = createPairing({ load: store.tokens, save: store.setTokens });
const http = createHttp({ engine, pairing, origins: [SITE] });
const enginePort = await http.listen(0);
const code = pairing.issueCode();

// --- the browser ------------------------------------------------------------------
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// The page imports three.js from unpkg (index.html's importmap). Where that host
// is out of reach (a sandbox), serve the same version from the npm registry's
// copy instead, unpacked once into a cache; every other outside request is
// refused at once rather than left to time out.
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
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };

try {
  await page.goto(`${SITE}/#y3k-code=${enginePort}-${code}`);
  await page.waitForFunction(() => !location.hash, null, { timeout: 5000 }).catch(() => {});
  check('the pairing code left the address bar at once', !(await page.evaluate(() => location.hash)).includes('y3k-code'));
  // sign in the way a person does, through the card
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 10000 });
  check('the founder signs in', true);

  await page.waitForSelector('#nav-code:not([hidden])', { timeout: 15000 });
  check('the laptop shows for the founder', true);
  const rails = await page.evaluate(() => ['home-nav', 'home-nav-right'].map((id) => [...document.querySelectorAll(`#${id} .nav-btn`)].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id)));
  check('six glyphs on each rail', rails[0].length === 6 && rails[1].length === 6, JSON.stringify(rails));
  check('go live is on the left rail', rails[0].includes('broadcast') && !rails[1].includes('broadcast'));

  // the engine's link carried us straight into Code, which paired
  await page.waitForSelector('.cv-folderrow', { timeout: 20000 });
  check('paired through the link, with a yes on the computer', pairing.list().length === 1);
  await shot('1-folders');

  await page.click('.cv-folderrow');
  await page.waitForSelector('.cv-modecard.m-ask', { timeout: 5000 });
  check('a first visit to a folder asks for a mode', true);
  await shot('2-mode');
  await page.click('.cv-modecard.m-ask');
  await page.waitForSelector('.cv-input', { timeout: 8000 });
  check('the mode is remembered for the folder', store.folders()[repo]?.mode === 'ask');

  // the orb keeps its column
  const geo = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const pane = document.querySelector('.cv-pane').getBoundingClientRect();
    const cv = document.querySelector('#stage canvas')?.getBoundingClientRect();
    return { st: [st.left, st.width, st.height], pane: [pane.left, pane.right], cv: cv ? [cv.left, cv.width] : null, vw: innerWidth };
  });
  check('the orb has its own column to the right of the pane', geo.st[1] >= 230 && geo.st[1] <= 410 && geo.pane[1] <= geo.st[0] + 1, JSON.stringify(geo));
  check('the orb\'s canvas fills that column (so the orb is centred in it)', geo.cv && Math.abs(geo.cv[0] - geo.st[0]) < 2 && Math.abs(geo.cv[1] - geo.st[1]) < 2, JSON.stringify(geo.cv));

  await page.fill('.cv-input', "Use the Edit tool to change the word 'world' to 'y3k' in hello.txt.");
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm:not(.done)', { timeout: 10000 });
  const card = await page.evaluate(() => {
    const pm = document.querySelector('.it.pm:not(.done)');
    const what = pm.querySelector('.pm-what');
    const acts = pm.querySelector('.pm-acts');
    return {
      del: [...pm.querySelectorAll('.df-del .df-code')].map((e) => e.textContent),
      add: [...pm.querySelectorAll('.df-add .df-code')].map((e) => e.textContent),
      diffFirst: !!(what && acts && (what.compareDocumentPosition(acts) & Node.DOCUMENT_POSITION_FOLLOWING)),
      q: pm.querySelector('.pm-q')?.textContent,
      dot: document.getElementById('nav-code').classList.contains('needs-you'),
    };
  });
  check('the card shows the change: − world, + y3k', card.del.join() === 'world' && card.add.join() === 'y3k', JSON.stringify(card));
  check('the change comes before the buttons', card.diffFirst);
  check('it says who wants what', /Claude wants to edit/.test(card.q || ''), card.q);
  check('the laptop wears the amber dot while it waits', card.dot);
  check('nothing has changed on disk while it asks', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\nworld\n');
  await shot('3-permission');

  await page.focus('.cv-input');
  await page.keyboard.press('Enter'); // an empty Enter answers the waiting card
  await page.waitForSelector('.it.pm.done.pm-allow', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.mt-ctx .mt-num')?.textContent === '11%', null, { timeout: 8000 }).catch(() => {});
  const after = await page.evaluate(() => ({
    file: null,
    edit: !!document.querySelector('.it.tl.tk-edit.st-ok .df-add'),
    ctx: document.querySelector('.mt-ctx .mt-num')?.textContent,
    lims: [...document.querySelectorAll('.mt-lim')].map((e) => e.textContent),
    cost: document.querySelector('.mt-cost')?.textContent,
    dot: document.getElementById('nav-code').classList.contains('needs-you'),
    text: document.querySelector('.cv-list .it.as:last-of-type')?.textContent,
  }));
  check('allowed: the file changed', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n');
  check('the edit\'s card keeps its green/red diff', after.edit);
  check('context ring 11%', after.ctx === '11%', after.ctx);
  check('5-hour and weekly bars', after.lims.length === 2 && /5h/.test(after.lims[0]) && /wk/.test(after.lims[1]), JSON.stringify(after.lims));
  check('cost', /^\$\d/.test(after.cost || ''), after.cost);
  check('the dot goes when nothing waits', !after.dot);
  await shot('4-allowed');

  await page.fill('.cv-input', 'now plan it');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.cv-todos', { timeout: 8000 });
  await page.waitForSelector('.it.tl.tk-task .tl-children .tk-search', { timeout: 8000 });
  const rich = await page.evaluate(() => ({
    todos: document.querySelector('.cv-todos summary')?.textContent,
    nested: document.querySelectorAll('.it.tl.tk-task .tl-children .it').length,
    code: document.querySelector('.cv-list .it.as:last-child .md-code')?.textContent,
    bullets: document.querySelectorAll('.cv-list .it.as:last-child li').length,
  }));
  check('todos: 1 of 3 done', /1 of 3 done/.test(rich.todos || ''), rich.todos);
  check('the subagent\'s tool and words are nested inside its card', rich.nested >= 2, String(rich.nested));
  check('markdown: inline code and a list', rich.code === 'the plan' && rich.bullets === 2, JSON.stringify(rich));
  await shot('5-rich');

  await page.fill('.cv-input', 'go slow');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Working on it/.test(document.querySelector('.cv-list')?.textContent || ''), null, { timeout: 8000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.it.sys.st-stopped', { timeout: 8000 });
  check('Esc stops a running turn', true);

  const md = await page.evaluate(async () => {
    const { markdown } = await import('/src/code/render/markdown.js');
    const el = markdown('![x](https://evil.example/x.png) [bad](javascript:alert(1)) <img src=x onerror=alert(1)> [ok](https://example.com)\n\n```js\nconst a = "<b>";\n```');
    return { imgs: el.querySelectorAll('img').length, hrefs: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')), bold: el.querySelectorAll('b').length, code: el.querySelector('pre')?.textContent };
  });
  check('markdown never loads an image', md.imgs === 0, JSON.stringify(md));
  check('markdown links are http(s) only', md.hrefs.every((h) => /^https:/.test(h)) && md.hrefs.length === 2, JSON.stringify(md.hrefs));
  check('markup in a message stays text', md.bold === 0 && md.code === 'const a = "<b>";', JSON.stringify(md));

  // leaving and coming back keeps the session
  await page.click('#nav-feed');
  await page.waitForFunction(() => !document.querySelector('.code-root'), null, { timeout: 5000 });
  const stageBack = await page.evaluate(() => [document.getElementById('stage').getBoundingClientRect().width, innerWidth]);
  check('leaving Code gives the orb the whole room again', stageBack[0] === stageBack[1], String(stageBack));
  await page.click('#nav-code');
  await page.waitForSelector('.cv-list .it.tl.tk-edit', { timeout: 8000 });
  check('coming back, the session is still there', true);

  await page.waitForTimeout(400);
  const csp = await page.evaluate(() => window.__csp);
  const codeErrors = errors.filter((e) => /code|y3k-code|127\.0\.0\.1/i.test(e));
  check('no page errors from Code', codeErrors.length === 0, codeErrors.join(' | '));
  check('no content-policy violations', csp.length === 0, csp.join(' | '));
  if (errors.length) console.log('  (other console errors:', errors.slice(0, 5).join(' | '), ')');
  await shot('6-final');
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
