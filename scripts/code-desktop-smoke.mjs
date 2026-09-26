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
writeFileSync(join(codeHome, 'config.json'), JSON.stringify({ signIn: true }));
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
const app = await _electron.launch({ executablePath: ELECTRON, args: ['--no-sandbox', join(ROOT, 'desktop')], env });
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
  await page.reload();
  const shot = async (n) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `desktop-${n}.png`) }); } };

  check('the window has the bridge, and only it', await page.evaluate(() => typeof window.y3kCode?.cmd === 'function' && Object.isFrozen(window.y3kCode) && Object.keys(window.y3kCode).sort().join() === 'cmd,onEvent,since' && typeof window.require === 'undefined' && typeof window.process === 'undefined'));

  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#nav-code:not([hidden])', { timeout: 15000 });
  await page.click('#nav-code');
  await page.waitForSelector('.cv-home .btn', { timeout: 15000 });
  check('Code connects through the bridge, with no pairing code', !(await page.$('.cv-code')));

  await page.click('.cv-home .cv-pick');   // Choose a folder… → the OS picker
  await page.waitForSelector('.cv-modecard.m-ask', { timeout: 10000 });
  const asked = await app.evaluate(() => globalThis.__asked);
  check('trust was a native dialog, defaulting to no', asked.length === 1 && /^Trust /.test(asked[0].message) && asked[0].buttons[asked[0].defaultId] === "Don't allow", JSON.stringify(asked));
  await page.click('.cv-modecard.m-ask');
  await page.waitForSelector('.cv-input', { timeout: 10000 });
  await page.fill('.cv-input', "change 'world' to 'y3k'");
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm:not(.done) .df-add', { timeout: 10000 });
  check('the permission card shows the diff first', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\nworld\n');
  await shot('permission');

  // ⌘R: how the app picks up a new deploy. The session lives in the engine,
  // not the page, so it is still there — still waiting on the same question.
  if (process.env.DSMOKE_DEBUG) console.log('  cookies before reload:', (await ctx.cookies()).map((c) => `${c.name} ${c.domain} ${c.path}`).join(', '));
  await page.reload();
  if (process.env.DSMOKE_DEBUG) {
    await page.waitForTimeout(1500);
    console.log('  cookies after reload:', (await ctx.cookies()).map((c) => c.name).join(', '));
    console.log('  me:', await page.evaluate(() => fetch('/api/auth/me').then((r) => r.status + ' ' + r.headers.get('content-type')).catch((e) => String(e))));
  }
  // Under a software GL renderer the page can miss its own 2.5s "am I signed
  // in" window after a reload and show the card; signing in again is fine —
  // what is being proved is that the ENGINE kept the session.
  await page.waitForSelector('#nav-code:not([hidden]), #login-email:visible', { timeout: 20000 });
  if (await page.isVisible('#login-email')) {
    await page.fill('#login-email', 'colinbiorio@gmail.com');
    await page.fill('#login-pass', PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#nav-code:not([hidden])', { timeout: 15000 });
  }
  await page.click('#nav-code');
  await page.waitForSelector('.it.pm:not(.done) .df-add', { timeout: 15000 });
  check('after a reload the session is still there, still asking', true);
  await page.focus('.cv-input');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.it.pm.done.pm-allow', { timeout: 10000 });
  for (let i = 0; i < 40 && readFileSync(join(repo, 'hello.txt'), 'utf8') !== 'hello\ny3k\n'; i++) await new Promise((r) => setTimeout(r, 100));
  check('answered after the reload: the edit happened', readFileSync(join(repo, 'hello.txt'), 'utf8') === 'hello\ny3k\n');
  await shot('allowed');

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
