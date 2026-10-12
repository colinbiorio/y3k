#!/usr/bin/env node
// "UPDATE NEEDED" IN THE REAL DESKTOP APP (Electron), against a local site.
// The app is this repo's desktop/ shell, carrying an OLDER copy of the engine
// (one that can update itself but cannot think for the presence), with the
// stand-in `claude` on PATH. The native question is stubbed in the main
// process, as code-desktop-smoke.mjs does: a test cannot click it.
//
// What it proves:
//   - the app tells its engine where the site is and where versions go, so
//     the card offers "Update y3kode"
//   - clicking it asks natively, defaulting to no, naming both versions
//   - the engine fetches the site's version, the app restarts it from
//     <userData>/engine/<version>/, and the card goes to Connected
//   - the choice is kept: the app, started again, runs the fetched version
//
//   xvfb-run -a node scripts/update-desktop-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, copyFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const ELECTRON = process.env.ELECTRON_BIN || join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron');
if (!existsSync(ELECTRON)) { console.error(`No Electron at ${ELECTRON} (set ELECTRON_BIN).`); process.exit(2); }
const NEW = JSON.parse(readFileSync(join(ROOT, 'y3k-code', 'package.json'), 'utf8')).version;
const PATIENCE = Number(process.env.DSMOKE_PATIENCE) || 3;

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-update-desktop-'));
const PASSWORD = 'udsmoke-' + Math.random().toString(36).slice(2);
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(sitePort), DATA_DIR: (mkdirSync(join(tmp, 'data')), join(tmp, 'data')), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '', Y3K_LOCAL_CLAUDE_CODE: '', RENDER: '' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

// The app as it would be installed a version ago: this shell, beside an
// older engine. In development the shell runs its engine from ../y3k-code.
const appDir = join(tmp, 'app', 'desktop');
mkdirSync(appDir, { recursive: true });
for (const f of ['main.cjs', 'policy.cjs', 'preload.cjs', 'code-host.cjs', 'package.json']) copyFileSync(join(ROOT, 'desktop', f), join(appDir, f));
const engine = join(tmp, 'app', 'y3k-code');
cpSync(join(ROOT, 'y3k-code'), engine, { recursive: true, filter: (p) => !p.includes('node_modules') });
const edit = (f, fn) => writeFileSync(join(engine, f), fn(readFileSync(join(engine, f), 'utf8')));
edit('package.json', (s) => s.replace(/"version": "[^"]+"/, '"version": "0.2.9"'));
edit('engine.mjs', (s) => s.replace(/export const VERSION = '[^']+'/, "export const VERSION = '0.2.9'").replace('      thinkers: THINKERS,\n', '      thinkers: [],\n'));

const threeDir = join(tmpdir(), 'y3k-smoke-three-0.160.0');
if (!existsSync(join(threeDir, 'package', 'package.json'))) {
  mkdirSync(threeDir, { recursive: true });
  execSync('npm pack three@0.160.0 --silent', { cwd: threeDir, stdio: 'ignore' });
  execSync('tar xzf three-0.160.0.tgz', { cwd: threeDir });
}
const bin = join(tmp, 'bin');
mkdirSync(bin);
symlinkSync(join(ROOT, 'test', 'fakes', 'claude.mjs'), join(bin, 'claude'));
const config = join(tmp, 'config');          // the app's userData lands in here (XDG_CONFIG_HOME/y3k)
const userData = join(config, 'y3k');
const env = { ...process.env, Y3K_URL: SITE, Y3K_CODE_HOME: join(tmp, 'code-home'), XDG_CONFIG_HOME: config, FAKE_CLAUDE_LOG: join(tmp, 'fake.log'), SHELL: '/bin/false', PATH: `${bin}:${process.env.PATH}`, ANTHROPIC_API_KEY: '' };
delete env.ELECTRON_RUN_AS_NODE;

const { _electron } = await loadPlaywright();
async function launch() {
  const app = await _electron.launch({ executablePath: ELECTRON, args: ['--no-sandbox', appDir], env });
  await app.evaluate(({ dialog }) => {
    globalThis.__asked = [];
    dialog.showMessageBox = async (_w, opts) => { globalThis.__asked.push({ message: opts.message, detail: opts.detail, buttons: opts.buttons, defaultId: opts.defaultId }); return { response: 0 }; };
  });
  await app.context().route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    const m = /^https:\/\/unpkg\.com\/three@0\.160\.0\/(.+)$/.exec(route.request().url());
    if (m) return route.fulfill({ path: join(threeDir, 'package', m[1].split('?')[0]), contentType: 'application/javascript' });
    return route.abort();
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000 * PATIENCE);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 * PATIENCE });
  return { app, page };
}
const hello = (page) => page.evaluate(() => window.y3kCode.cmd({ cmd: 'engine.hello' }));

let app = null;
try {
  let page;
  ({ app, page } = await launch());
  const h0 = await hello(page);
  check('the app runs the engine it carries, and that engine can update itself', h0?.version === '0.2.9' && h0.update === true, JSON.stringify({ v: h0?.version, u: h0?.update }));

  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 * PATIENCE });
  // a browser that has never signed in here meets "create an account" first (2026-10-08)
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 20000 * PATIENCE });
  await page.click('#nav-settings');
  await page.waitForSelector('.set-tab[data-pane="brain"]', { timeout: 20000 * PATIENCE });
  await page.click('.set-tab[data-pane="brain"]');
  await page.waitForFunction(() => document.getElementById('cc-act')?.textContent === 'Update y3kode' && !document.getElementById('cc-act').hidden, null, { timeout: 20000 * PATIENCE }).catch(() => {});
  const line = await page.evaluate(() => document.getElementById('cc-line').textContent);
  if (shots) { mkdirSync(shots, { recursive: true }); await page.locator('#cc-sec').screenshot({ path: join(shots, 'desktop-update-needed.png') }); }
  check('Settings → Brain: Update needed, with Update y3kode', /\(0\.2\.9\) cannot connect Claude Code here\. Update it to the newest version\./.test(line), line);

  await page.click('#cc-act');
  await page.waitForFunction(() => document.getElementById('cc-pill')?.dataset.state === 'connected', null, { timeout: 60000 * PATIENCE }).catch(() => {});
  const asked = await app.evaluate(() => globalThis.__asked);
  const q = asked.find((a) => /^Update y3kode/.test(a.message));
  check('asked natively, naming both versions, defaulting to no', q && q.message === `Update y3kode from 0.2.9 to ${NEW}?` && /downloaded from localhost:\d+/.test(q.detail) && q.buttons[q.defaultId] === "Don't allow", JSON.stringify(asked));
  const h1 = await hello(page);
  const pill = await page.evaluate(() => document.getElementById('cc-pill').textContent);
  if (shots) await page.locator('#cc-sec').screenshot({ path: join(shots, 'desktop-connected.png') });
  check(`the app restarted its engine as ${NEW}, and the card says Connected`, h1?.version === NEW && h1.thinkers?.includes('claude') && pill === 'Connected', JSON.stringify({ v: h1?.version, pill }));
  check('fetched into the app\'s own folder, and the choice kept', existsSync(join(userData, 'engine', NEW, 'ipc-host.mjs')) && JSON.parse(readFileSync(join(userData, 'engine', 'current.json'), 'utf8')).version === NEW);

  await app.close();
  app = null;
  ({ app, page } = await launch());
  const h2 = await hello(page);
  check('started again, the app runs the fetched version, not the one it carries', h2?.version === NEW, JSON.stringify(h2?.version));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
} finally {
  await app?.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll desktop update checks passed.');
process.exit(failures ? 1 : 0);
