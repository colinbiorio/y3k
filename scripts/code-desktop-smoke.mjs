#!/usr/bin/env node
// y3k Code in the REAL desktop app (Electron), against a local site, with the
// fake `claude` on PATH. Needs Electron (ELECTRON_BIN, or desktop/node_modules)
// and a display (run under xvfb-run on Linux).
//
// What it proves, beyond the browser smoke:
//   - the page reaches the engine through the local bridge, with no pairing
//   - the folder comes from the OS picker; trust is a native dialog
//     (both are stubbed in the main process here — a test cannot click them)
//   - reloading the window (how the app picks up a deploy) keeps the session
//   - a y3k://code link moves the open window to #code without a reload, and
//     a link carrying anything else moves nothing; the page can see the shell
//     in its user agent
//   - quitting the app leaves no coding tool running
//
//   xvfb-run -a node scripts/code-desktop-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const ELECTRON = process.env.ELECTRON_BIN || join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron');
if (!existsSync(ELECTRON)) { console.error(`No Electron at ${ELECTRON} (set ELECTRON_BIN).`); process.exit(2); }

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// Every wait below is a ceiling, not a delay, so a generous one costs nothing
// when things pass. A reload waits for the document, not for 'load' (every
// last subresource): with SwiftShader and a busy 4-CPU box, 'load' alone
// took over 30s at a load average of 25, in the base commit as much as here.
const PATIENCE = Number(process.env.DSMOKE_PATIENCE) || 3;
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-dsmoke-'));
const repo = realpathSync(mkdtempSync(join(tmp, 'repo-')));
writeFileSync(join(repo, 'hello.txt'), 'hello\nworld\n');
const bin = join(tmp, 'bin');
mkdirSync(bin);
symlinkSync(join(ROOT, 'test', 'fakes', 'claude.mjs'), join(bin, 'claude'));
const codeHome = join(tmp, 'code-home');
mkdirSync(codeHome, { mode: 0o700 });
// No settings at all: the fake `claude` says it is signed in, and its own
// sign-in is what every tool runs on by default — nothing to switch on.
const LOG = join(tmp, 'fake.log');
const PASSWORD = 'dsmoke-' + Math.random().toString(36).slice(2);
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(sitePort), DATA_DIR: (mkdirSync(join(tmp, 'data')), join(tmp, 'data')), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

const threeDir = join(tmpdir(), 'y3k-smoke-three-0.160.0');
if (!existsSync(join(threeDir, 'package', 'package.json'))) {
  mkdirSync(threeDir, { recursive: true });
  execSync('npm pack three@0.160.0 --silent', { cwd: threeDir, stdio: 'ignore' });
  execSync('tar xzf three-0.160.0.tgz', { cwd: threeDir });
}

const { _electron } = await loadPlaywright();
const env = { ...process.env, Y3K_URL: SITE, Y3K_CODE_HOME: codeHome, FAKE_CLAUDE_LOG: LOG, SHELL: '/bin/false', PATH: `${bin}:${process.env.PATH}` };
delete env.ELECTRON_RUN_AS_NODE;
// A packaged app (ELECTRON_BIN=desktop/dist/linux-unpacked/y3k, DSMOKE_PACKAGED=1)
// carries its own code and its own y3kode, so it is given no folder to run.
const packaged = process.env.DSMOKE_PACKAGED === '1';
const app = await _electron.launch({ executablePath: ELECTRON, args: packaged ? ['--no-sandbox'] : ['--no-sandbox', join(ROOT, 'desktop')], env });
let pids = [];
try {
  // the dialogs a person would answer: the OS folder picker picks the repo,
  // and every native question is answered "Allow" — recording what was asked
  await app.evaluate(({ dialog }, repoPath) => {
    globalThis.__asked = [];
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [repoPath] });
    dialog.showMessageBox = async (_w, opts) => { globalThis.__asked.push({ message: opts.message, buttons: opts.buttons, defaultId: opts.defaultId }); return { response: 0 }; };
  }, repo);
  const ctx = app.context();
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    const m = /^https:\/\/unpkg\.com\/three@0\.160\.0\/(.+)$/.exec(route.request().url());
    if (m) return route.fulfill({ path: join(threeDir, 'package', m[1].split('?')[0]), contentType: 'application/javascript' });
    return route.abort();
  });
  const page = await app.firstWindow();
  // Clicks and fills too: a click waits for the page to settle after it, and
  // under that same load the settling alone ran past Playwright's 30s default.
  page.setDefaultTimeout(30000 * PATIENCE);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 * PATIENCE });
  const shot = async (n) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `desktop-${n}.png`) }); } };

  check('the window has the bridge, and only it', await page.evaluate(() => typeof window.y3kCode?.cmd === 'function' && Object.isFrozen(window.y3kCode) && Object.keys(window.y3kCode).sort().join() === 'cmd,onEvent,since' && typeof window.require === 'undefined' && typeof window.process === 'undefined'));

  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 * PATIENCE });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#nav-code:not([hidden])', { timeout: 15000 * PATIENCE });
  await page.click('#nav-code');
  await page.waitForSelector('.cv-home .btn', { timeout: 15000 * PATIENCE });
  check('Code connects through the bridge, with no pairing code', !(await page.$('.cv-code')));

  await page.click('.cv-home .cv-pick');   // Choose a folder… → the OS picker
  await page.waitForSelector('.cv-modecard.m-ask', { timeout: 10000 * PATIENCE });
  const asked = await app.evaluate(() => globalThis.__asked);
  check('trust was a native dialog, defaulting to no', asked.length === 1 && /^Trust /.test(asked[0].message) && asked[0].buttons[asked[0].defaultId] === "Don't allow", JSON.stringify(asked));
  await page.click('.cv-modecard.m-ask');
  await page.waitForSelector('.cv-input', { timeout: 10000 * PATIENCE });
  await page.fill('.cv-input', "change 'world' to 'y3k'");
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm:not(.done) .df-add', { timeout: 10000 * PATIENCE });
  check('the permission card shows the diff first', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\nworld\n');
  await shot('permission');

  // ⌘R: how the app picks up a new deploy. The session lives in the engine,
  // not the page, so it is still there — still waiting on the same question.
  if (process.env.DSMOKE_DEBUG) console.log('  cookies before reload:', (await ctx.cookies()).map((c) => `${c.name} ${c.domain} ${c.path}`).join(', '));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 * PATIENCE });
  if (process.env.DSMOKE_DEBUG) {
    await page.waitForTimeout(1500);
    console.log('  cookies after reload:', (await ctx.cookies()).map((c) => c.name).join(', '));
    console.log('  me:', await page.evaluate(() => fetch('/api/auth/me').then((r) => r.status + ' ' + r.headers.get('content-type')).catch((e) => String(e))));
  }
  // Under a software GL renderer the page can miss its own 2.5s "am I signed
  // in" window after a reload and show the card; signing in again is fine —
  // what is being proved is that the ENGINE kept the session.
  await page.waitForSelector('#nav-code:not([hidden]), #login-email:visible', { timeout: 20000 * PATIENCE });
  if (await page.isVisible('#login-email')) {
    await page.fill('#login-email', 'colinbiorio@gmail.com');
    await page.fill('#login-pass', PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#nav-code:not([hidden])', { timeout: 15000 * PATIENCE });
  }
  await page.click('#nav-code');
  await page.waitForSelector('.it.pm:not(.done) .df-add', { timeout: 15000 * PATIENCE });
  check('after a reload the session is still there, still asking', true);
  await page.focus('.cv-input');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm.done.pm-allow', { timeout: 10000 * PATIENCE });
  for (let i = 0; i < 40 * PATIENCE && readFileSync(join(repo, 'hello.txt'), 'utf8') !== 'hello\ny3k\n'; i++) await new Promise((r) => setTimeout(r, 100));
  check('answered after the reload: the edit happened', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n');
  await shot('allowed');

  // the coder moves the orb here too: the app's engine has a door of its own
  // for the orb tool (and only for it), handed to the coding tool in its config
  const spawned = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'spawn').pop();
  const orbCfg = JSON.parse(readFileSync(spawned.argv[spawned.argv.indexOf('--mcp-config') + 1], 'utf8')).mcpServers.y3k;
  const orbRes = await (await fetch(orbCfg.url, { method: 'POST', headers: { ...orbCfg.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'orb', arguments: { kommand: 'mood/excited/color/cyan' } } }) })).json();
  check('the coder moves the orb in the app: the window did it, and said so back', /^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]{16}$/.test(orbCfg.url) && orbRes.result?.content?.[0]?.text === 'The orb moved: mood/excited/color/cyan', JSON.stringify(orbRes));

  const version = JSON.parse(readFileSync(join(ROOT, 'desktop', 'package.json'), 'utf8')).version;
  check('the page can tell it is in the app, and which version', await page.evaluate((v) => navigator.userAgent.endsWith(` y3k-desktop/${v}`), version));

  // y3k://code, as Windows and Linux deliver it (a second copy's argv) and as
  // macOS does (open-url). On the room already, it is a fragment move: the
  // page is the same document afterwards, so nothing was reloaded.
  await page.evaluate(() => { window.__sameDoc = true; });
  const before = page.url();
  await app.evaluate(({ app: a }) => { a.emit('open-url', { preventDefault() {} }, 'y3k://code?run=rm'); a.emit('second-instance', {}, ['y3k', '--x', 'y3k://pair/ABCD2345'], '/'); });
  await page.waitForTimeout(400);
  check('a link carrying anything else moves nothing', page.url() === before, page.url());
  await app.evaluate(({ app: a }) => a.emit('second-instance', {}, ['y3k', 'y3k://code'], '/'));
  await page.waitForFunction(() => location.hash === '#code', null, { timeout: 5000 * PATIENCE });
  check('y3k://code moves the open window to #code, without a reload', await page.evaluate(() => window.__sameDoc === true && location.hash === '#code'));
  await page.evaluate(() => history.replaceState(null, '', location.pathname + location.search));
  await app.evaluate(({ app: a }) => a.emit('open-url', { preventDefault() {} }, 'y3k://code'));
  await page.waitForFunction(() => location.hash === '#code', null, { timeout: 5000 * PATIENCE });
  check('…and the same from macOS\'s open-url', await page.evaluate(() => window.__sameDoc === true));

  pids = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'spawn').map((x) => x.pid);
  check('a coding tool is running before quitting', pids.some(alive), JSON.stringify(pids));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  const page = await app.firstWindow().catch(() => null);
  if (page && shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, 'desktop-error.png') }).catch(() => {}); }
  if (page) console.log('  body:', await page.evaluate(() => document.body.className).catch(() => '?'));
} finally {
  if (!pids.length && existsSync(LOG)) pids = readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'spawn').map((x) => x.pid);
  await app.close().catch(() => {});
  for (let i = 0; i < 80 && pids.some(alive); i++) await new Promise((r) => setTimeout(r, 100));
  check('quitting the app leaves no coding tool running', !pids.some(alive), JSON.stringify(pids.filter(alive)));
  for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll desktop smoke checks passed.');
process.exit(failures ? 1 : 0);
