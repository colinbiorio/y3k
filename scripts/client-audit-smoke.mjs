#!/usr/bin/env node
// THE CLIENT FIXES OF 2026-10-08, in Chromium (test/client-audit.test.mjs runs
// the same code piece by piece; this runs it in the real page). The site with
// a key of its own (so Site default is offered), the founder signed in, a
// second account broadcasting.
//   - an Anthropic key kept from before and Site default chosen: opening
//     Settings → Brain shows Site default and puts no key in use
//   - a visited presence's body (a thin field, a wander, coarse grain, a
//     mesh) does not come home on your own orb
//   - Enter while an input method is composing does not send
//   - signing out forgets the keys, and keeps what is the browser's
//   - without WebGL2 the entrance lifts without waiting two seconds
//
//   PORT=47261 node scripts/client-audit-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'audit-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-audit-'));
mkdirSync(join(tmp, 'data'));
const port = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, CODE_ROLLOUT: 'founder', ANTHROPIC_API_KEY: 'sk-ant-smoke-site-key', RENDER: '' },
});
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

// a second account, broadcasting, for the founder to go and watch
const other = 'nova' + Math.random().toString(36).slice(2, 7);
const signup = await fetch(`${SITE}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: `${other}@example.com`, username: other, password: 'a-long-password-1', age17: true, terms: true }) });
const cookie = (signup.headers.get('set-cookie') || '').split(';')[0];
const hers = (await (await fetch(`${SITE}/api/me/presence`, { headers: { cookie } })).json()).presence;
const goLive = () => fetch(`${SITE}/api/live/${hers.handle}/publish`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'start' }) });
await goLive();
const keepLive = setInterval(goLive, 20000);

const { chromium } = await loadPlaywright();
const launch = (args = []) => chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', ...args] });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
// what the founder left in this browser last time: an Anthropic key kept, and
// Site default chosen (the keys were saved before y3k.owner existed)
await ctx.addInitScript(() => {
  if (window !== window.top) return;   // the reader's sandboxed frames have no storage
  try {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('y3k.brainKeys', JSON.stringify({ anthropic: { key: 'sk-ant-smoke-kept', model: 'm-smoke-kept' } }));
    localStorage.setItem('y3k.brainPick', 'site');
    localStorage.setItem('y3k.ownBrain', JSON.stringify({ provider: 'none' }));
    localStorage.setItem('y3k.voicekey.openai', 'sk-voice-smoke');
    localStorage.setItem('y3k.room', JSON.stringify({ env: 'metal' }));
  } catch { /* nothing to seed */ }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name, p = page) => { if (shots) { mkdirSync(shots, { recursive: true }); await p.screenshot({ path: join(shots, `${name}.png`) }); } };
const wait = (ms) => page.waitForTimeout(ms);
const bodyNow = () => page.evaluate(() => {
  const b = window.Y3K.body;
  return { keep: b.field().keep, most: b.field().most, place: b.place(), grain: b.grain(), mesh: b.mesh(), turn: b.turn(), size: b.size() };
});

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 30000 });
  await wait(4000);
  check('the founder claims the keys kept before there was an owner', await page.evaluate(() => localStorage.getItem('y3k.owner') && !!localStorage.getItem('y3k.brainKeys')));

  // --- Settings → Brain: Site default stays Site default --------------------
  await page.click('#nav-settings');
  await page.click('.set-tab[data-pane="brain"]');
  await wait(6000);   // the session check, the site's brain, and any lookup
  const brainState = await page.evaluate(() => ({
    shown: document.getElementById('brain-provider').value,
    inUse: localStorage.getItem('y3k.brain'),
    keyField: document.getElementById('brain-key').value,
    keySecHidden: document.getElementById('key-sec').hidden,
    what: document.getElementById('brain-what').textContent,
  }));
  await shot('1-settings-brain-site-default');
  check('Settings → Brain opens on Site default', brainState.shown === 'site', JSON.stringify(brainState));
  check('…and the kept key is not put in use behind it', brainState.inUse === null, brainState.inUse);
  check('…nor loaded into the hidden key field', brainState.keyField === '' && brainState.keySecHidden, JSON.stringify(brainState));
  // choosing Anthropic loads the kept key, and the page says where it lives
  // (the native select sits under the glass one, glass-select.js: chosen as it chooses)
  const pickProvider = (v) => page.evaluate((v) => { const el = document.getElementById('brain-provider'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await pickProvider('anthropic');
  await wait(4000);
  const anth = await page.evaluate(() => ({ keyField: document.getElementById('brain-key').value, what: document.getElementById('brain-what').textContent }));
  await shot('2-settings-brain-anthropic');
  check('choosing Anthropic brings its kept key back', anth.keyField === 'sk-ant-smoke-kept', JSON.stringify(anth));
  check('…and says signing out removes it', /Signing out removes it from this browser\./.test(anth.what), anth.what);
  await pickProvider('site');
  await wait(1500);
  check('back on Site default, no key is in use', await page.evaluate(() => localStorage.getItem('y3k.brain')) === null);
  await page.evaluate(() => document.getElementById('settings-close').click());
  await wait(800);

  // --- An input method's Enter does not send ---------------------------------
  const ime = await page.evaluate(() => {
    const el = document.getElementById('chat-input');
    el.focus();
    el.value = 'こんにちは';
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    return el.value;
  });
  check('Enter while composing leaves the line in the box', ime === 'こんにちは', ime);
  await page.evaluate(() => { const el = document.getElementById('chat-input'); el.value = ''; el.blur(); });

  // --- A visited body does not come home -------------------------------------
  const home0 = await bodyNow();
  await shot('3a-home-before');
  await page.click('#nav-live');
  await page.waitForSelector('.presence-card.is-live', { timeout: 20000 });
  await page.click('.presence-card.is-live');
  await page.waitForFunction(() => document.body.classList.contains('viewing'), null, { timeout: 20000 });
  await wait(2500);
  // what a visited presence's stream can set on the body while you watch
  await page.evaluate(() => {
    const b = window.Y3K.body;
    b.setCount(2); b.setFlight({ kind: 'wander', w: 6, r: 5 }); b.setGrain(9); b.setMesh(9); b.setTurn({ dir: 'left', speed: 8 }); b.setSize(8);
  });
  await wait(2500);
  const there = await bodyNow();
  await shot('3b-watching-a-wisp');
  check('in the room, the visited body is worn', there.keep < 500 && there.place?.wander, JSON.stringify(there));
  await page.evaluate(() => window.Y3K.home());
  await page.waitForFunction(() => document.body.classList.contains('in-home') && !document.body.classList.contains('viewing'), null, { timeout: 20000 });
  await wait(4000);
  const back = await bodyNow();
  await wait(4000);
  await shot('4-home-again');
  check('home again, the field is whole', back.keep === back.most, JSON.stringify(back));
  check('…not wandering, and at the centre', back.place === null, JSON.stringify(back.place));
  check('…in its own grain, mesh, turn and size', back.grain === home0.grain && back.mesh === home0.mesh && back.turn.dir === home0.turn.dir && back.turn.speed === home0.turn.speed && back.size === home0.size,
    JSON.stringify({ home0, back }));

  // --- Signing out forgets the keys ------------------------------------------
  await page.click('#nav-settings');
  await page.click('.set-tab[data-pane="account"]');
  await wait(800);
  await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click('#auth-signout')]);
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 30000 });
  await wait(1500);
  const after = await page.evaluate(() => Object.fromEntries(['y3k.brainKeys', 'y3k.brainPick', 'y3k.voicekey.openai', 'y3k.owner', 'y3k.room'].map((k) => [k, localStorage.getItem(k)])));
  await shot('5-signed-out');
  check('signing out forgets the kept keys, the pick, the voice key and the owner', !after['y3k.brainKeys'] && !after['y3k.brainPick'] && !after['y3k.voicekey.openai'] && !after['y3k.owner'], JSON.stringify(after));
  check('…and keeps what is the browser\'s', !!after['y3k.room'], JSON.stringify(after));
  check('no page errors along the way', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  await shot('x-failed').catch(() => {});
} finally {
  await browser.close().catch(() => {});
}

// --- Without WebGL2: the curtain lifts without the two-second wait ------------
// Timed on a loaded machine with software GL, the first frames hold the main
// thread for a second or two either way (measured 2026-10-08: about 2.0s from
// the session check's answer to the lift with this fix, about 4.0s without),
// so what is checked is the wait itself: no watch for html.liquid-on is set
// up when the liquid did not mount. The timing is printed.
try {
  const b2 = await launch(['--disable-webgl2']);
  const c2 = await b2.newContext({ viewport: { width: 420, height: 300 } });
  await c2.addInitScript(() => {
    if (window !== window.top) return;
    window.__liquidWaits = 0;
    const MO = window.MutationObserver;
    window.MutationObserver = class extends MO {
      observe(target, o) { if (target === document.documentElement && o?.attributeFilter?.includes('class')) window.__liquidWaits += 1; return super.observe(target, o); }
    };
    const watch = new MO(() => { if (document.body && !document.body.classList.contains('entering') && !window.__lift) window.__lift = performance.now(); });
    const arm = () => { if (document.body) watch.observe(document.body, { attributes: true, attributeFilter: ['class'] }); else requestAnimationFrame(arm); };
    document.addEventListener('readystatechange', arm, { once: true });
  });
  const p2 = await c2.newPage();
  await p2.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await p2.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p2.waitForFunction(() => window.__lift, null, { timeout: 120000 });
  await p2.waitForTimeout(2500);
  const t = await p2.evaluate(() => ({
    gl2: !!document.createElement('canvas').getContext('webgl2'),
    sdf: document.body.classList.contains('merc-sdf'),
    liquidWaits: window.__liquidWaits,
    lift: Math.round(window.__lift),
    me: Math.round(performance.getEntriesByType('resource').find((e) => e.name.endsWith('/api/auth/me'))?.responseEnd || -1),
  }));
  await shot('6-no-webgl2-entrance', p2);
  console.log('  (no WebGL2:', JSON.stringify({ ...t, afterSessionCheck: t.lift - t.me }), ')');
  check('this browser really has no WebGL2, and the liquid fell back', !t.gl2 && !t.sdf, JSON.stringify(t));
  check('the entrance does not wait for a liquid that never mounted', t.liquidWaits === 0, JSON.stringify(t));
  await b2.close();
} catch (err) {
  failures++;
  console.log('  ✗ no-WebGL2 run: ' + (err?.message || err));
}
clearInterval(keepLive);
server.kill('SIGTERM');
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
