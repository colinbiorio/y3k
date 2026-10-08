#!/usr/bin/env node
// "UPDATE NEEDED", END TO END, in Chromium. The site with no key of its own
// (as the hosted site is), the founder signed in, this browser paired with a
// companion y3kode started from an OLDER copy of the engine, and the stand-in
// `claude` (test/fakes/claude.mjs) on PATH.
//
//   1. A y3kode too old to update itself: the card gives the setup command.
//   2. One that can: the card offers "Update y3kode". Clicking it asks on the
//      computer (answered here in the approval window, as a person would),
//      the companion fetches the site's engine with its token, restarts on it
//      on the same port, and the card goes to Connected.
//   3. The orb then answers through the new version.
//   4. The desktop app from before updates (its bridge stood in for here):
//      "Download y3k", the build for this computer from the site's list.
//
//   node scripts/update-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createStore } from '../y3k-code/store.mjs';
import { createPairing } from '../y3k-code/pair.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'update-' + Math.random().toString(36).slice(2);
const NEW = JSON.parse(readFileSync(join(ROOT, 'y3k-code', 'package.json'), 'utf8')).version;

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await new Promise((r) => setTimeout(r, 150)); } };

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-update-smoke-'));
mkdirSync(join(tmp, 'data'));
const sitePort = await freePort();
const SITE = `http://localhost:${sitePort}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: '', Y3K_LOCAL_CLAUDE_CODE: '', RENDER: '',
    Y3K_APP_DOWNLOADS: 'https://github.com/colinbiorio/y3k/releases/latest/download' },
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

// Two older copies of this engine. Neither can think for the presence (the
// card's "Update needed"); the older still cannot update itself either.
function olderCopy(name, version, canUpdate) {
  const dir = join(tmp, name, 'y3k-code');
  cpSync(join(ROOT, 'y3k-code'), dir, { recursive: true, filter: (p) => !p.includes('node_modules') });
  const edit = (f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));
  edit('package.json', (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
  edit('engine.mjs', (s) => {
    let t = s.replace(/export const VERSION = '[^']+'/, `export const VERSION = '${version}'`).replace('      thinkers: THINKERS,\n', '      thinkers: [],\n');
    if (!canUpdate) t = t.replace('      update: updater.able,\n', '');
    if (t === s) throw new Error('could not make the older copy');
    return t;
  });
  return dir;
}
const ancient = olderCopy('ancient', '0.1.9', false);
const older = olderCopy('older', '0.2.9', true);

const bin = join(tmp, 'bin');
mkdirSync(bin);
symlinkSync(join(ROOT, 'test', 'fakes', 'claude.mjs'), join(bin, 'claude'));
const home = join(tmp, 'code-home');
const LOG = join(tmp, 'fake.log');
const store = createStore(home);
const token = createPairing({ load: store.tokens, save: store.setTokens }).mint({ origin: SITE, agent: 'smoke' });
const port = await freePort();
const kids = [];
function companion(dir) {
  const c = spawn(process.execPath, [join(dir, 'bin', 'y3k-code.mjs'), '--dev', '--origin', SITE, '--site', SITE, '--port', String(port), '--no-open'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, Y3K_CODE_HOME: home, FAKE_CLAUDE_LOG: LOG, PATH: `${bin}:${process.env.PATH}`, ANTHROPIC_API_KEY: '', Y3K_CODE_HANDED_OVER: '' },
  });
  c.out = '';
  c.stdout.on('data', (d) => { c.out += d; });
  c.stderr.on('data', (d) => { c.out += d; });
  kids.push(c);
  return c;
}
const stopped = (c) => until(() => c.exitCode !== null || c.signalCode !== null, 10000);
const hello = async () => {
  try { return await (await fetch(`http://127.0.0.1:${port}/v1/cmd`, { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{"cmd":"engine.hello"}' })).json(); } catch { return null; }
};
// The person's yes in the companion's approval window: its form, posted from its own origin.
async function allow(pattern) {
  const page = await until(async () => { try { const t = await (await fetch(`http://127.0.0.1:${port}/approve`)).text(); return pattern.test(t) && /name="nonce"/.test(t) && t; } catch { return null; } }, 20000);
  if (!page) return false;
  const id = /action="\/approve\/([A-Za-z0-9]+)"/.exec(page)[1];
  const nonce = /name="nonce" value="([^"]+)"/.exec(page)[1];
  const r = await fetch(`http://127.0.0.1:${port}/approve/${id}`, { method: 'POST', redirect: 'manual', headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/x-www-form-urlencoded' }, body: `answer=allow&nonce=${encodeURIComponent(nonce)}` });
  return r.status === 303;
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
await page.addInitScript(([p, tok]) => {
  if (window !== window.top) return;
  localStorage.setItem('y3k-code:pair', JSON.stringify({ port: p, token: tok }));
}, [port, token]);
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.locator('#cc-sec').screenshot({ path: join(shots, `${name}.png`) }); } };
const cardNow = () => page.evaluate(() => ({
  state: document.getElementById('cc-pill').dataset.state, pill: document.getElementById('cc-pill').textContent,
  line: document.getElementById('cc-line').textContent,
  act: document.getElementById('cc-act').hidden ? null : document.getElementById('cc-act').textContent,
  command: document.getElementById('cc-cmd').hidden ? null : document.getElementById('cc-cmd-text').textContent,
  check: !document.getElementById('cc-check').hidden,
}));
const cardIs = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).catch(() => {});

try {
  const first = companion(ancient);
  check('the oldest copy answers, and cannot update itself', !!(await until(async () => { const h = await hello(); return h?.ok && h.version === '0.1.9' && h.update === undefined; })), first.out);

  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 15000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 20000 });
  await page.click('#nav-settings');
  await page.waitForSelector('.set-tab[data-pane="brain"]', { timeout: 20000 });
  await page.click('.set-tab[data-pane="brain"]');

  // 1 — too old to update itself: the command again, to run in its terminal
  await cardIs(() => document.getElementById('cc-pill')?.dataset.state === 'old' && !document.getElementById('cc-cmd').hidden);
  const a = await cardNow();
  await shot('1-too-old');
  check('too old to update itself: Update needed, and the setup command to run instead', a.pill === 'Update needed' && /too old to update itself/.test(a.line) && /^npx -y http:\/\/localhost:\d+\/code\/dl\/[^/]+\/y3k-code\.tgz$/.test(a.command || '') && !a.act, JSON.stringify(a));
  first.kill('SIGTERM');
  await stopped(first);

  // 2 — one that can: Update y3kode
  const second = companion(older);
  await until(async () => (await hello())?.version === '0.2.9');
  await page.click('#cc-check');
  await cardIs(() => document.getElementById('cc-act')?.textContent === 'Update y3kode' && !document.getElementById('cc-act').hidden);
  const b = await cardNow();
  await shot('2-update-needed');
  check('one that can update itself: Update needed, with Update y3kode', b.pill === 'Update needed' && b.act === 'Update y3kode' && /\(0\.2\.9\) cannot connect Claude Code here\. Update it to the newest version\./.test(b.line) && !b.command, JSON.stringify(b));

  await page.click('#cc-act');
  await cardIs(() => document.getElementById('cc-pill')?.dataset.state === 'updating');
  const c = await cardNow();
  await shot('3-allow');
  check('clicked: it waits for the yes on the computer, and offers the approval window', c.pill === 'Updating' && c.line === 'Allow the update on this computer.' && c.act === 'Open approval window' && !c.check, JSON.stringify(c));
  check('the question on the computer names both versions', await allow(new RegExp(`Update y3kode from 0\\.2\\.9 to ${NEW.replace(/\./g, '\\.')}`)), second.out);

  await cardIs(() => document.getElementById('cc-pill')?.dataset.state === 'connected', 60000);
  const d = await cardNow();
  await shot('4-connected');
  const h = await hello();
  check(`y3kode restarted as ${NEW} on the same port, and this browser is still paired`, h?.ok && h.version === NEW, JSON.stringify(h?.version));
  check('the card: Connected', d.pill === 'Connected' && d.check, JSON.stringify(d));
  check('the old process waits on the new one, in the same terminal', second.exitCode === null && /Updating to y3kode .*Restarting/.test(second.out), second.out.slice(-400));
  check('the new version was kept beside the store', existsSync(join(home, 'engine', NEW, 'ipc-host.mjs')));

  // 3 — the orb answers through it (asked once on the computer, like any first turn)
  await page.keyboard.press('Escape');
  await page.fill('#chat-input', 'what is up');
  await page.keyboard.press('Enter');
  check('the first turn is asked on the computer', await allow(/think with your own Claude Code sign-in/), second.out.slice(-400));
  await page.waitForFunction(() => /I heard:/.test(document.getElementById('caption')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const said = await page.evaluate(() => document.getElementById('caption')?.textContent || '');
  check('the orb answers through the updated y3kode', /I heard: (\(just now\) )?what is up/.test(said), said);
  second.kill('SIGTERM');
  await stopped(second);

  // 4 — the desktop app from before updates: its bridge, answering as 0.1.0
  // (put on this page as the preload would; every command reads it as it goes)
  const desk = page;
  await desk.evaluate(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(url); return null; };
    window.y3kCode = Object.freeze({
      cmd: async (c) => (c.cmd === 'engine.hello' ? { ok: true, version: '0.1.0', providers: [] } : { ok: false, error: 'not in 0.1.0' }),
      since: async () => [], onEvent: () => () => {},
    });
  });
  if (await desk.evaluate(() => document.getElementById('settings')?.hidden !== false)) await desk.click('#nav-settings');
  await desk.waitForSelector('.set-tab[data-pane="brain"]', { timeout: 20000 });
  await desk.click('.set-tab[data-pane="brain"]');
  await desk.click('#cc-check');
  await desk.waitForFunction(() => document.getElementById('cc-act')?.textContent === 'Download y3k', null, { timeout: 20000 }).catch(() => {});
  const e = await desk.evaluate(() => ({ line: document.getElementById('cc-line').textContent, act: document.getElementById('cc-act').textContent }));
  if (shots) await desk.locator('#cc-sec').screenshot({ path: join(shots, '5-desktop-too-old.png') });
  await desk.click('#cc-act').catch(() => {});
  const opened = await desk.evaluate(() => window.__opened);
  check('the desktop app from before updates: Download y3k, the build for this computer', /\(0\.1\.0\) cannot connect Claude Code here, and it is too old to update itself\. Download the newest y3k app and install it over this one\./.test(e.line) && opened.length === 1 && /^https:\/\/github\.com\/colinbiorio\/y3k\/releases\/latest\/download\/y3k-linux-x86_64\.AppImage$/.test(opened[0]), JSON.stringify({ ...e, opened }));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
} finally {
  await browser.close().catch(() => {});
  for (const k of kids) { try { k.kill('SIGTERM'); } catch { /* gone */ } }
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll update checks passed.');
process.exit(failures ? 1 : 0);
