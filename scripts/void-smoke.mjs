#!/usr/bin/env node
// THE VOID, LOOKED AT (GAME.md, "How it is looked at"). The modules that draw
// the void import three, so the suite can only read them as text; what they
// draw, and what the hands do in it, is looked at here: a real browser against
// a throwaway server that dies with this script. A guest opens the world tab
// and the body is walked through what Colin asked of it on 13 Nov 2026 ("tap
// to jump or hold to jump higher -- allowing the character to defy gravity by
// 2x", "omnidirectional dash", flight "only in 'creative' mode", "options for
// both controller and keyboard/mouse, with a dedicated 'controls' menu").
//
//   node scripts/void-smoke.mjs <desk|pad|phone> [gpu] [firefox|webkit] [dpr=N] [--shots <dir>]
//
//   desk   the keys and the mouse, the pointer held, the controls sheet, a key
//          rebound, the three lights, the societies and back, leaving the tab
//   pad    a controller (a made-up one: navigator.getGamepads answers for it)
//   phone  a thumb on glass, 390 x 844 at two pixels a point, and frame times
//   gpu    the machine's own chip (the full Chromium, --use-angle=metal)
//          instead of software drawing: only there do frame times mean anything
//   firefox, webkit   another engine than Chromium, for desk and pad (the
//          phone's touches are sent over Chromium's own protocol)
//
// It prints one JSON object (checks, reads, errors, where the pictures went)
// and exits 1 on a failed check, a console error, a page error or a file of
// the game's that did not arrive. Look at the pictures too: a check cannot
// see a white coin in the sky (there was one, on the phone).
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const scene = ['desk', 'pad', 'phone'].find((s) => argv.includes(s)) || 'desk';
const gpu = argv.includes('gpu');
const engine = ['firefox', 'webkit'].find((e) => argv.includes(e)) || 'chromium';
const dpr = +(argv.find((a) => a.startsWith('dpr='))?.slice(4) || (scene === 'phone' ? 2 : 1));
const tmp = mkdtempSync(join(tmpdir(), 'y3k-void-'));
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : join(tmp, 'shots');
const DATA = join(tmp, 'data');
mkdirSync(SHOTS, { recursive: true }); mkdirSync(DATA);

// Playwright where the house's other smokes find it. Failing that, a
// playwright-core in the folder PW_CORE names; and for Chromium, whichever
// build is already in this Mac's cache (a core newer than the cache asks for
// a build that is not there, so it is handed the path).
async function loadPlaywright() {
  try { return { pw: await import('playwright') }; } catch { /* not local */ }
  try {
    const g = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { pw: await import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href) };
  } catch { /* not global */ }
  if (!process.env.PW_CORE) throw new Error('no playwright: npm i -g playwright, or PW_CORE=<a folder holding playwright-core>');
  const pw = createRequire(join(process.env.PW_CORE, 'x.js'))('playwright-core');
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const build = (prefix, tail) => {
    const hit = existsSync(cache) && readdirSync(cache).filter((d) => d.startsWith(prefix)).sort().at(-1);
    return hit && existsSync(join(cache, hit, tail)) ? join(cache, hit, tail) : null;
  };
  return { pw, exe: gpu ? build('chromium-', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
    : build('chromium_headless_shell-', 'chrome-headless-shell-mac-arm64/chrome-headless-shell') };
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const PORT = Number(process.env.PORT) || await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slow = gpu ? 1 : 2.5;                              // software drawing is slow: the waits stretch
const out = { scene, engine, gpu, dpr, shots: SHOTS, errors: [], warnings: [], reads: {}, notes: [], checks: {} };
const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), ANTHROPIC_API_KEY: '', RENDER: '' }; delete env.FOUNDER_PASSWORD;
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env, stdio: 'ignore' });
let browser = null;
// whatever this script started dies with it, however it ends
process.on('exit', () => { try { server.kill('SIGKILL'); } catch { /* gone */ } });
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(1));
const end = async (code) => {
  try { await browser?.close(); } catch { /* gone */ }
  try { server.kill('SIGKILL'); } catch { /* gone */ }
  rmSync(DATA, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 1));
  process.exit(code);
};
const dog = setTimeout(() => { out.errors.push('watchdog: took too long'); end(3); }, 420000);
const check = (name, ok, got) => { out.checks[name] = ok ? 'ok' : 'NO: ' + JSON.stringify(got); if (!ok) out.errors.push('check failed: ' + name + ' ' + JSON.stringify(got)); };
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode != null) throw new Error('the server exited at boot');
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  if (engine !== 'chromium' && scene === 'phone') throw new Error('the phone scene needs Chromium: its touches are sent over CDP');
  const { pw, exe } = await loadPlaywright();
  // another engine is given this run's folder as its home, so it cannot read or write the person's own Firefox or Safari
  browser = engine !== 'chromium' ? await pw[engine].launch({ headless: true, env: { ...process.env, HOME: tmp, CFFIXED_USER_HOME: tmp } })
    : await pw.chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : gpu ? { channel: 'chromium' } : {}),
      args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const phone = scene === 'phone';
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push('page: ' + String(e.message).slice(0, 300)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') out.errors.push('console: ' + t.slice(0, 400)); else if (m.type() === 'warning' && /THREE|WebGL|shader|void/i.test(t)) out.warnings.push(t.slice(0, 300)); });
  page.on('requestfailed', (r) => { if (r.url().includes('/src/')) out.errors.push('failed: ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/src/')) out.errors.push(r.status() + ': ' + r.url()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.classList.contains('entered'), null, { timeout: 60000 }); await sleep(1200);
  await page.locator('#login-skip').click(); await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 30000 }); await sleep(1200);
  await page.locator('#arrive-later').click({ timeout: 4000 }).catch(() => {});
  await page.locator('#nav-world').click();
  await page.waitForSelector('.game-root canvas', { timeout: 30000 });
  const read = () => page.evaluate(() => window.Y3K?.game?.read?.() || null);
  const shot = async (name) => { await page.screenshot({ path: join(SHOTS, scene + '-' + name + '.png') }); out.reads[name] = await read(); };
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await read(); if (r && fn(r)) return r; await sleep(50); } out.notes.push('timed out waiting: ' + fn); return read(); };
  const peak = (ms) => page.evaluate(async (ms) => { let m = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { m = Math.max(m, window.Y3K.game.read().p[1]); await new Promise(requestAnimationFrame); } return Math.round(m * 1000) / 1000; }, ms);
  const frames = (ms = 2000) => page.evaluate(async (ms) => { const d = []; let last = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const n = await new Promise(requestAnimationFrame); if (last) d.push(n - last); last = n; } d.sort((x, y) => x - y); const at = (q) => Math.round(d[Math.min(d.length - 1, Math.floor(q * d.length))] * 10) / 10; return { n: d.length, median: at(0.5), p95: at(0.95), worst: at(1) }; }, ms);
  const hintText = () => page.evaluate(() => { const h = document.querySelector('.game-hint'); return h && !h.hidden ? h.textContent : ''; });
  const speed = (r) => Math.hypot(r.v[0], r.v[2]);
  out.renderer = await page.evaluate(() => { const c = document.querySelector('.game-root canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  await sleep(1500 * slow);
  const key = page.keyboard, box = phone ? { x: 195, y: 420 } : { x: 640, y: 420 };
  const free = () => page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); });
  // In another engine the lock is refused for the length of a drag, and the drag looks instead, as it does wherever
  // there is no lock to be had. Firefox measures a held pointer from the middle of its window, where a real mouse has
  // just been put back and a script's has not: under its lock a script's drag turns the eye by running sums (measured
  // 13 Nov 2026: ten steps of -52 px read -52, -104, -52, -52, -52, -52, -364, -416, -468, -520). The lock itself is
  // taken below with a click and one move, which reads true in both.
  const refuseLock = (on) => engine === 'chromium' ? null : page.evaluate((on) => {
    const P = Element.prototype;
    if (on) { P.heldLock = P.requestPointerLock; P.requestPointerLock = () => Promise.reject(new Error('refused for a drag')); } else if (P.heldLock) { P.requestPointerLock = P.heldLock; delete P.heldLock; }
  }, on);
  const drag = async (dx, dy) => { await refuseLock(true); await page.mouse.move(box.x, box.y); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(box.x + (dx * i) / 10, box.y + (dy * i) / 10); await sleep(16); } await page.mouse.up(); await refuseLock(false); await free(); await sleep(60); };
  const start = await page.evaluate(() => ({ focus: document.activeElement?.tagName, inVoid: document.body.classList.contains('in-void'), air: getComputedStyle(document.getElementById('chat-air')).visibility,
    hint: (() => { const b = document.querySelector('.game-hint').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; })(),
    grip: (() => { const g = document.querySelector('.nav-collapse-bottom'); if (!g) return null; const b = g.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; })(),
    chat: (() => { const b = document.getElementById('chat').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; })() }));
  out.start = start;
  check('the canvas holds the focus when the void opens', start.focus === 'CANVAS', start.focus);
  check('the air mark is put away', start.air === 'hidden', start.air);

  if (scene === 'desk') {
    check('the hint stands over the grip', !start.grip || start.hint[1] <= start.grip[0], [start.hint, start.grip]);
    await shot('01-stand');
    // the keys, with no click anywhere first
    await key.down('Space'); await sleep(50); await key.up('Space'); const tap = await peak(1300);
    check('a tap jumps a little over 1.5 m', tap >= 1.49 && tap < 1.8, tap);
    await until((r) => r.grounded);
    await key.down('Space'); const held = await peak(1900); await key.up('Space');
    check('a held jump rises 3 m', Math.abs(held - 3) < 0.08, held);
    await until((r) => r.grounded);
    await key.down('KeyW'); await until((r) => speed(r) > 5.2); await sleep(700 * slow); await shot('02-run');
    await key.down('ShiftLeft'); const sp = await until((r) => speed(r) > 8.2); check('sprint is 8.6 m/s', Math.abs(speed(sp) - 8.6) < 0.5, speed(sp)); await key.up('ShiftLeft');
    await key.down('Space'); await until((r) => r.p[1] > 2.4); await shot('04-jump-held'); await key.up('Space');
    await until((r) => r.grounded); await sleep(80); await shot('05-landed');
    const before = await read(); await key.press('KeyQ'); await until((r) => r.dashing, 3000); await shot('06-dash'); await sleep(500);
    const after = await read(); check('a dash covers ground', Math.abs(after.p[2] - before.p[2]) > 6, [before.p[2], after.p[2]]);
    await key.up('KeyW'); await until((r) => speed(r) < 0.1); await sleep(600 * slow);
    await drag(-520, 40); await sleep(500 * slow); await shot('07-from-the-front');
    await drag(260, -120); await sleep(500 * slow); await shot('08-from-the-side-low');
    // the pointer, held: a click on the canvas, then the mouse turns the eye without a button down
    await page.mouse.click(box.x, box.y); await sleep(500);
    out.locked = await page.evaluate(() => !!document.pointerLockElement);
    if (out.locked) {
      const y0 = (await read()).yaw; await page.mouse.move(box.x + 120, box.y); await sleep(200); out.lockTurn = (await read()).yaw - y0;
      out.hintLocked = await hintText();
      await key.press('Escape'); await sleep(400);
      out.afterLockEscape = await page.evaluate(() => ({ locked: !!document.pointerLockElement, menuOpen: !document.getElementById('game-menu').hidden }));
      if (out.afterLockEscape.menuOpen) { await key.press('Escape'); await sleep(400); out.afterLockEscape.menuOpenAfterSecond = await page.evaluate(() => !document.getElementById('game-menu').hidden); }
      check('escape frees the pointer and leaves no sheet behind a second press', !out.afterLockEscape.locked && !out.afterLockEscape.menuOpenAfterSecond, out.afterLockEscape);
    }
    await free(); await sleep(100);
    out.hintStanding = await hintText();
    await key.press('KeyG'); await sleep(200); await key.press('KeyF'); await key.down('Space'); await until((r) => r.p[1] > 6); await key.up('Space');
    check('creative flies', (await read()).flying === true, await read());
    await key.down('KeyW'); await key.down('ShiftLeft'); await until((r) => speed(r) > 30); await sleep(500 * slow); await shot('09-fly');
    await key.up('ShiftLeft'); await key.up('KeyW');
    await key.press('KeyM'); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 }); await sleep(600); await shot('10-menu');
    out.menu = await page.evaluate(() => ({ rows: document.querySelectorAll('#game-menu .game-bind').length, keys: document.querySelectorAll('#game-menu .game-key').length, rootInert: document.querySelector('.game-root').inert, focusIn: !!document.activeElement?.closest?.('#game-menu') }));
    // rebind jump's second box to J, and see it jump after the sheet closes
    await page.locator('#game-menu .game-key[data-act="jump"][data-slot="1"]').click(); await sleep(150); await key.press('KeyJ'); await sleep(250);
    out.rebind = await page.evaluate(() => ({ box: document.querySelector('#game-menu .game-key[data-act="jump"][data-slot="1"]').textContent, stored: localStorage.getItem('y3k.game.controls')?.includes('KeyJ') }));
    check('a box takes the next key', /j/i.test(out.rebind.box) && out.rebind.stored, out.rebind);
    await page.locator('#game-menu [data-light="dusk"]').click(); await sleep(300); await key.press('Escape'); await sleep(500 * slow);
    out.afterEscape = await page.evaluate(() => ({ menuHidden: document.getElementById('game-menu').hidden, rootInert: document.querySelector('.game-root').inert, focus: document.activeElement?.tagName }));
    check('escape closes the sheet and does not reopen it', out.afterEscape.menuHidden, out.afterEscape);
    await shot('11-dusk-flying');
    await key.press('KeyG'); await until((r) => r.grounded, 30000); await sleep(500 * slow); await shot('12-dusk-stand');
    await key.down('KeyJ'); await sleep(50); await key.up('KeyJ'); const jp = await peak(1300); check('the new key jumps', jp >= 1.49 && jp < 1.8, jp);
    await page.locator('#game-controls').click(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 });
    await page.locator('#game-defaults').click(); await sleep(250);
    await page.locator('#game-menu [data-light="night"]').click(); await sleep(300); await page.locator('#game-menu-close').click(); await sleep(500 * slow);
    out.afterClose = await page.evaluate(() => ({ focus: document.activeElement?.tagName, id: document.activeElement?.id, stored: localStorage.getItem('y3k.game.controls') }));
    await key.down('KeyW'); await until((r) => speed(r) > 5.2); await sleep(900 * slow); await shot('13-night-run'); await key.up('KeyW');
    await until((r) => speed(r) < 0.1); await drag(-560, 30); await sleep(500 * slow); await shot('13b-night-front');
    await page.locator('#game-societies').click(); await page.waitForSelector('.world-root', { timeout: 20000 }); await sleep(1500);
    out.societies = await page.evaluate(() => ({ gameRoot: !!document.querySelector('.game-root'), worldRoot: !!document.querySelector('.world-root'), voidButton: !!document.getElementById('world-void'), which: localStorage.getItem('y3k.world.which'), inVoid: document.body.classList.contains('in-void'), air: getComputedStyle(document.getElementById('chat-air')).visibility }));
    check('the societies open and the void is put down', out.societies.worldRoot && !out.societies.gameRoot && !out.societies.inVoid && out.societies.air === 'visible', out.societies);
    await page.locator('#world-void').click(); await page.waitForSelector('.game-root canvas', { timeout: 20000 }); await sleep(1000);
    out.back = await page.evaluate(() => ({ gameRoot: !!document.querySelector('.game-root'), worldRoot: !!document.querySelector('.world-root'), which: localStorage.getItem('y3k.world.which'), state: localStorage.getItem('y3k.game.state') }));
    check('and back', out.back.gameRoot && !out.back.worldRoot && out.back.which === 'void', out.back);
    await shot('15-back-in-the-void');
    // leaving the tab and coming back: the void closes with the tab and is there on return
    await page.locator('#nav-frequencies').click({ timeout: 5000 }); await sleep(900);
    out.left = await page.evaluate(() => ({ gameRoot: !!document.querySelector('.game-root'), inWorld: document.body.classList.contains('in-world'), inVoid: document.body.classList.contains('in-void'), air: getComputedStyle(document.getElementById('chat-air')).visibility }));
    check('leaving the tab puts the void down', !out.left.gameRoot && !out.left.inVoid, out.left);
    await page.locator('#nav-world').click(); await page.waitForSelector('.game-root canvas', { timeout: 20000 }); await sleep(600);
    const again = await read(); check('and it is where it was on return', again && Math.abs(again.p[2] - out.reads['15-back-in-the-void'].p[2]) < 0.5 && again.light === 'night', again);
  }

  if (scene === 'pad') {
    const setPad = (axes, pressed = []) => page.evaluate(([axes, pressed]) => {
      const pad = { id: 'Look Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes,
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
    }, [axes, pressed]);
    await setPad([0, -1, 0, 0]); const run = await until((r) => speed(r) > 5.2, 6000);
    check('the stick pushed all the way runs', Math.abs(speed(run) - 5.6) < 0.3 && run.v[2] < 0, run);
    await sleep(400); out.padHint = await hintText(); out.padDevice = (await read()).device;
    check('the game knows it is a controller', out.padDevice === 'pad', out.padDevice);
    await shot('01-run');
    await setPad([0, -0.45, 0, 0]); await sleep(900); const walk = await read(); check('the stick part way walks', speed(walk) > 1 && speed(walk) < 3.2, speed(walk));
    await setPad([0, 0, 0, 0]); await until((r) => speed(r) < 0.1, 4000);
    await setPad([0, 0, 0, 0], [0]); const held = await peak(1900); await setPad([0, 0, 0, 0]);
    check('A held rises 3 m', Math.abs(held - 3) < 0.08, held);
    await until((r) => r.grounded);
    const y0 = (await read()).yaw; await setPad([0, 0, 1, 0]); await sleep(500); await setPad([0, 0, 0, 0]); const y1 = (await read()).yaw;
    check('the right stick turns the eye right', y1 < y0 - 0.3, [y0, y1]);
    await setPad([1, 0, 0, 0], [1]); await until((r) => r.dashing, 3000); await setPad([1, 0, 0, 0]); await sleep(400); await setPad([0, 0, 0, 0]);
    await page.locator('#game-controls').click(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 }); await sleep(500);
    out.padLine = await page.evaluate(() => document.getElementById('game-pad-line')?.textContent);
    // a controller box takes the next controller button
    await page.locator('#game-menu .game-key[data-act="walk"][data-slot="pad"]').click(); await sleep(200); await setPad([0, 0, 0, 0], [5]); await sleep(400); await setPad([0, 0, 0, 0]); await sleep(200);
    out.padBind = await page.evaluate(() => document.querySelector('#game-menu .game-key[data-act="walk"][data-slot="pad"]').textContent);
    check('a controller box takes a controller button', /R1|RB|5/i.test(out.padBind), out.padBind);
    out.scroller = await page.evaluate(() => { const els = [document.querySelector('#game-menu .sheet'), document.getElementById('game-menu-body'), document.getElementById('game-menu')]; const e = els.find((x) => x && x.scrollHeight > x.clientHeight + 4); if (e) e.scrollTop = 99999; return e ? (e.id || e.className) + ' ' + e.scrollHeight + '/' + e.clientHeight : 'none scrolls'; }); await sleep(300); await shot('02-menu-foot');
  }

  if (scene === 'phone') {
    out.phone = await page.evaluate(() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      return { touchShown: !document.querySelector('.game-touch').hidden, jump: r('#game-t-jump'), dash: r('#game-t-dash'), bar: r('.game-bar'), chat: r('#chat'), hint: r('.game-hint'), hole: [getComputedStyle(document.body).getPropertyValue('--hole-t'), getComputedStyle(document.body).getPropertyValue('--hole-b')] }; });
    await shot('01-stand');
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    // a thumb on the left: pushed up, the body goes forward
    await touch('touchStart', [[90, 520, 1]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[90, 520 - i * 9, 1]]); await sleep(20); }
    const run = await until((r) => speed(r) > 5.2, 6000); check('a thumb pushed up runs forward', speed(run) > 5.2 && run.v[2] < 0, run);
    await sleep(500 * slow); await shot('02-run'); out.framesRun = await frames();
    // a second finger on the jump button while the thumb holds
    const jb = out.phone.jump; await touch('touchStart', [[90, 448, 1], [(jb[0] + jb[2]) / 2, (jb[1] + jb[3]) / 2, 2]]); const held = await peak(1900);
    await touch('touchEnd', [[90, 448, 1]]); await touch('touchEnd', []);
    check('the jump button held rises 3 m', Math.abs(held - 3) < 0.08, held);
    await until((r) => r.grounded && speed(r) < 0.1, 8000);
    // a finger on the right half looks
    const y0 = (await read()).yaw; await touch('touchStart', [[300, 400, 3]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[300 - i * 12, 400, 3]]); await sleep(20); } await touch('touchEnd', []);
    await sleep(200); const y1 = (await read()).yaw; check('a finger on the right turns the eye', Math.abs(y1 - y0) > 0.2, [y0, y1]);
    out.phoneDevice = (await read()).device; out.phoneHint = await hintText();
    await page.locator('#game-controls').tap(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 }); await sleep(600); await shot('03-menu'); out.framesMenu = await frames();
    out.scroller = await page.evaluate(() => { const els = [document.querySelector('#game-menu .sheet'), document.getElementById('game-menu-body'), document.getElementById('game-menu')]; const e = els.find((x) => x && x.scrollHeight > x.clientHeight + 4); if (e) e.scrollTop = 99999; return e ? (e.id || e.className) + ' ' + e.scrollHeight + '/' + e.clientHeight : 'none scrolls'; }); await sleep(300); await shot('03b-menu-foot');
    out.menuBox = await page.evaluate(() => { const b = document.querySelector('#game-menu .sheet').getBoundingClientRect(); const k = document.querySelector('#game-menu .game-key').getBoundingClientRect(); return { sheet: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], key: [Math.round(k.width), Math.round(k.height)], wide: document.documentElement.scrollWidth }; });
    await page.locator('#game-menu-close').tap(); await sleep(400);
    await page.locator('#game-mode').tap(); await sleep(400); out.creative = await page.evaluate(() => ({ mode: window.Y3K.game.read().mode, sinkShown: !document.getElementById('game-t-sink').hidden, hint: document.querySelector('.game-hint').textContent }));
    await shot('04-creative'); out.framesAfter = await frames();
  }
} catch (e) { out.errors.push('script: ' + String(e?.message || e).split('\n')[0].slice(0, 300)); }
clearTimeout(dog);
await end(out.errors.length ? 1 : 0);
