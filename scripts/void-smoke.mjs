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
//   node scripts/void-smoke.mjs <desk|pad|phone|bodies|fine> [small] [gpu] [firefox|webkit] [dpr=N] [--shots <dir>]
//
//   desk   the keys and the mouse, the pointer held, the controls sheet, a key
//          rebound, the three lights, the societies and back, leaving the tab
//   pad    a controller (a made-up one: navigator.getGamepads answers for it)
//   phone  a thumb on glass, 390 x 844 at two pixels a point, and frame times
//   bodies the body sheet: the five kinds worn in turn, each of the 125 options put on once, the arrow keys,
//          the sheet clear of the body, each kind walked; `small` does it at a phone's size, by touch
//   build  the shelter (stage 3): built with the key in front of the body, walked into through its door,
//          its walls holding the body in, the eye kept inside, the room dim but for what gets in, at night
//          its hearth; walked out again, taken down. Then the house, chosen from the bar's build list: up
//          its steps and in, its ladder climbed to the loft and back down, taken down
//   fight  the ring and the bots (combat.js, fight.js): the bar's list of five levels, a drifter come up out of
//          the water, the eye turned to it, a cast striking it, the ring spun up and let go breaking it; a
//          sentinel from the list and another with the key at the level chosen, the guard turning their bolts
//          aside, the whirl, a slam from a jump; the binding holding one and throwing it; the bow drawn and a volley; the bell tolled; the thread lashed and a bot snared; seven bots and more up and the frames; the list clearing them
//   wall   the wall run: a house from the list, walked round to its back wall, run along (faster than a run, held
//          up, the body leaning into it) to its corner; run again and leapt off, out and up
//   island the first place of the map (src/game/island/): the controls sheet's map tab offering the void and Lord
//          Howe Island, the island chosen and come to (its ground fetched and inflated), the body on its beach facing
//          Mount Gower, walked inland and up, into the lagoon's shallows (rings on the water), flown out over the
//          deep sea and let down into it to swim with its head out; its palms, birds, woodhens and turtles counted;
//          the map with where the body is; the frames;
//          and back to the void
//   fine   how fine it is drawn (src/game/fine.js), at two pixels a point: the room's own remembered `low` is not
//          the void's; with `gpu`, a page slow with its own work and a browser held to thirty a second both
//          keep their sharp picture (fewer pixels tried and given back); without, the drawing is the cause and
//          is turned down to its last step, then plain; a person's own ?gfx=low is kept
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
const scene = ['desk', 'pad', 'phone', 'bodies', 'fine', 'build', 'fight', 'wall', 'island', 'ship'].find((s) => argv.includes(s)) || 'desk';
const small = scene === 'bodies' && argv.includes('small');
const gpu = argv.includes('gpu');
const engine = ['firefox', 'webkit'].find((e) => argv.includes(e)) || 'chromium';
const dpr = +(argv.find((a) => a.startsWith('dpr='))?.slice(4) || (scene === 'phone' || scene === 'fine' || small ? 2 : 1));
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
const dog = setTimeout(() => { out.errors.push('watchdog: took too long'); end(3); }, scene === 'bodies' ? 1500000 : scene === 'ship' ? 900000 : 420000);      // the bodies scene presses 125 options; the ship scene flies five, the carrier slow to start and stop
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
  const phone = scene === 'phone' || small;
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const listen = (pg) => {
    pg.on('pageerror', (e) => out.errors.push('page: ' + String(e.message).slice(0, 300)));
    // an init script of this smoke's own is refused in a sandboxed blank frame: Chromium says so, and it is not the page's
    pg.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /^Blocked script execution in 'about:blank' because the document's frame is sandboxed/.test(t)) { if (!out.notes.includes('a sandboxed blank frame refused the smoke\'s init script')) out.notes.push('a sandboxed blank frame refused the smoke\'s init script'); } else if (m.type() === 'error') out.errors.push('console: ' + t.slice(0, 400)); else if (m.type() === 'warning' && /THREE|WebGL|shader|void/i.test(t)) out.warnings.push(t.slice(0, 300)); });
    pg.on('requestfailed', (r) => { if (r.url().includes('/src/')) out.errors.push('failed: ' + r.url()); });
    pg.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/src/')) out.errors.push(r.status() + ': ' + r.url()); });
  };
  // a guest comes in and opens the world tab
  const arrive = async (pg, path = '/') => {
    await pg.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction(() => document.body.classList.contains('entered'), null, { timeout: 60000 }); await sleep(1200);
    await pg.locator('#login-skip').click(); await pg.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 30000 }); await sleep(1200);
    await pg.locator('#arrive-later').click({ timeout: 4000 }).catch(() => {});
    await pg.locator('#nav-world').click();
    await pg.waitForSelector('.game-root canvas', { timeout: 30000 });
  };
  // the fine scene: the room is made to remember that it stepped down to `low`, by its own guess and a moment ago
  if (scene === 'fine') await ctx.addInitScript(() => { try { localStorage.setItem('y3k.gfx', 'low'); localStorage.setItem('y3k.gfx.at', String(Date.now())); } catch { /* no storage */ } });
  const page = await ctx.newPage(); listen(page);
  await arrive(page);
  const read = () => page.evaluate(() => window.Y3K?.game?.read?.() || null);
  const shot = async (name) => { await page.screenshot({ path: join(SHOTS, scene + (small ? '-small-' : '-') + name + '.png') }); out.reads[name] = await read(); };
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

  if (scene === 'island') {
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const faceYaw = async (target) => { for (let i = 0; i < 5; i++) { const d = wrap(target - (await read()).yaw); if (Math.abs(d) < 0.03) break; await drag(Math.max(-900, Math.min(900, -d / 0.0024)), 0); await sleep(120); } };
    const sheet = async () => { await page.locator('#game-controls').click(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 }); await page.locator('#game-menu [data-tab="map"]').click(); await sleep(300); };
    await sheet();
    out.places = await page.locator('#game-menu [data-place]').evaluateAll((els) => els.map((e) => [e.dataset.place, e.getAttribute('aria-pressed')]));
    check('the map tab offers the void (here now) and Lord Howe Island', JSON.stringify(out.places) === JSON.stringify([['void', 'true'], ['island', 'false']]), out.places);
    out.mapDrawn = await page.evaluate(() => { const svg = document.querySelector('#game-menu .game-map-svg'); return svg ? { paths: svg.querySelectorAll('path').length, peaks: [...svg.querySelectorAll('.peak text')].map((t) => t.textContent) } : null; });
    check('and draws the island, its peaks named', out.mapDrawn && out.mapDrawn.paths > 4 && out.mapDrawn.peaks.some((t) => /Mount Gower/.test(t)), out.mapDrawn);
    await shot('01-map');
    await page.locator('#game-menu [data-place="island"]').click();
    let r = await until((r) => r.world.place === 'island', 30000); await sleep(1500 * slow);
    check('the island chosen, the body is there, on its beach', r.world.place === 'island' && r.world.ground > 1 && r.world.ground < 8 && Math.abs(r.p[1] - r.world.ground) < 0.01, { place: r.world.place, p: r.p, ground: r.world.ground });
    await shot('02-arrived');
    // inland (east) and up
    await faceYaw(-Math.PI / 2); const g0 = (await read()).world.ground;
    await key.down('KeyW'); await sleep(2600); await key.up('KeyW'); r = await until((r) => speed(r) < 0.1, 3000);
    check('walked inland, the ground rises under it', r.world.ground > g0 + 1 && Math.abs(r.p[1] - r.world.ground) < 0.05, { from: g0, to: r.world.ground });
    await sleep(2500); r = await read(); out.life = r.world.life;
    check('its life is there: palms round the body, terns in the air, tropicbirds on the cliffs, woodhens near, turtles in the lagoon', r.world.life && r.world.life.palms > 200 && r.world.life.terns > 100 && r.world.life.tropicbirds === 8 && r.world.life.hens >= 6 && r.world.life.turtles === 6, r.world.life);
    out.frames = { island: await frames(2500) };
    await shot('03-inland');
    // a house on the island: facing downhill (the beach, west), its way in at the ground's height, walked into
    await faceYaw(Math.PI / 2); await key.down('KeyW'); await sleep(350); await key.up('KeyW'); await until((r) => speed(r) < 0.1, 3000);   // a step that way turns the body to it
    await page.locator('#game-build').click(); await sleep(250); await page.locator('#game-build-list [data-build="house"]').click(); await sleep(300);
    out.houseSaid = await hintText();
    r = await until((r) => r.world.buildings.some((b) => b.kind === 'house' && b.built), 15000);
    const hb = r.world.buildings.find((b) => b.kind === 'house');
    check('a house goes up on the island, raised to its ground', !!hb && hb.y > 1, { hb, said: out.houseSaid });
    await shot('03b-island-house');
    if (hb) {
      // round to its front and in (it faces the body: its front is toward where the body stood)
      await faceYaw(hb.yaw); await key.down('KeyW'); r = await until((r) => r.world.inside === 'house', 9000); await sleep(300); await key.up('KeyW'); r = await read();
      check('walked up its steps and in, standing on its floor at its height', r.world.inside === 'house' && Math.abs(r.p[1] - (hb.y + 0.5)) < 0.01, { inside: r.world.inside, y: r.p[1], floor: hb.y + 0.5 });
      await shot('03c-in-the-island-house');
      await key.press('KeyB'); await until((r) => !r.world.buildings.some((b) => b.kind === 'house' && b.down < 0), 6000);
    }
    // a bot over the island's land: it hovers over the ground, not inside it
    await page.locator('#game-bots').click(); await sleep(250); await page.locator('#game-bot-list [data-bot="1"]').click();
    r = await until((r) => r.fight.bots[0]?.mode === 'fight', 6000); await sleep(800); r = await read();
    check('a bot called on the island hovers over its ground', r.fight.bots[0] && r.fight.bots[0].over > 0.6 && r.fight.bots[0].over < 4, r.fight.bots[0]);
    await page.locator('#game-bots').click(); await sleep(250); await page.locator('#game-bot-list [data-bot="clear"]').click(); await sleep(300);
    // back west into the lagoon's shallows
    await faceYaw(Math.PI / 2); await key.down('KeyW'); r = await until((r) => r.world.depth > 0.12, 9000); await sleep(300); await key.up('KeyW');
    r = await read();
    check('into the lagoon: it wades in shallow water', r.world.depth > 0.1 && r.world.depth < 4 && !r.world.swim && r.p[1] < 0, { depth: r.world.depth, swim: r.world.swim, y: r.p[1] });
    await shot('04-wading');
    // up and out over the deep sea, east of the island, and let down into it
    await key.press('KeyG'); await sleep(150); await key.press('KeyF'); await sleep(200);
    await page.evaluate(() => { const g = window.Y3K.game; return g && g.read(); });
    await key.down('Space'); await sleep(1800); await key.up('Space');
    // east: the island is narrow here and the sea off its east side is deep close in
    await faceYaw(-Math.PI / 2); await key.down('ShiftLeft'); await key.down('KeyW'); r = await until((r) => r.world.ground < -14, 40000); await key.up('KeyW'); await key.up('ShiftLeft');
    await key.down('KeyC'); r = await until((r) => !r.flying, 15000); await key.up('KeyC'); await sleep(700);
    r = await read();
    check('let down into the deep sea, it swims with its head out', r.world.swim && Math.abs(r.p[1] + 1.35) < 0.02 && r.world.depth > 10, { p: r.p, depth: r.world.depth, swim: r.world.swim, flying: r.flying });
    await shot('05-swimming');
    await sheet(); out.you = await page.evaluate(() => !!document.querySelector('#game-menu .game-map-svg .you'));
    check('the map marks where the body is', out.you, out.you);
    await page.locator('#game-menu [data-place="void"]').click();
    r = await until((r) => r.world.place === 'void', 10000); await sleep(600);
    check('and back to the void', r.world.place === 'void' && Math.abs(r.p[1]) < 0.01 && r.world.ground === 0, { place: r.world.place, p: r.p });
    check('the island\'s frames keep up', out.frames.island.median < 20, out.frames.island);
  }

  if (scene === 'wall') {
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const faceYaw = async (target) => { for (let i = 0; i < 5; i++) { const d = wrap(target - (await read()).yaw); if (Math.abs(d) < 0.03) break; await drag(Math.max(-900, Math.min(900, -d / 0.0024)), 0); await sleep(120); } };
    const house = (r) => r.world.buildings.find((b) => b.kind === 'house');
    const local = (r) => { const b = house(r), dx = r.p[0] - b.x, dz = r.p[2] - b.z, c = Math.cos(b.yaw), sn = Math.sin(b.yaw); return [c * dx - sn * dz, sn * dx + c * dz]; };
    const world = (b, lx, lz) => [b.x + Math.cos(b.yaw) * lx + Math.sin(b.yaw) * lz, b.z - Math.sin(b.yaw) * lx + Math.cos(b.yaw) * lz];
    const goto = async (lx, lz) => {
      for (let i = 0; i < 30; i++) {
        const r = await read(), [tx, tz] = world(house(r), lx, lz), dx = tx - r.p[0], dz = tz - r.p[2], dist = Math.hypot(dx, dz);
        if (dist < 0.3) break;
        await faceYaw(Math.atan2(-dx, -dz));
        await key.down('KeyW'); await sleep(Math.max(60, Math.min(700, (dist / 5.6) * 1000 * 0.8))); await key.up('KeyW'); await until((r) => speed(r) < 0.1, 3000);
      }
    };
    await page.locator('#game-build').click(); await sleep(250); await page.locator('#game-build-list [data-build="house"]').click(); await sleep(300);
    let r = await until((r) => house(r)?.built, 15000);
    check('a house to run along', !!house(r)?.built, r.world);
    await goto(-5.2, 6.5); await goto(-5.2, -5.7); await goto(-2.7, -5.7);
    const b = house(await read()), along = Math.atan2(-Math.cos(b.yaw), Math.sin(b.yaw));      // the eye looking along the back wall, toward its +x
    await faceYaw(along); await key.down('KeyD'); await sleep(700); await key.up('KeyD'); await until((r) => speed(r) < 0.1, 3000);
    r = await read(); out.start = { at: local(r) };
    check('behind it, at its back wall', Math.abs(local(r)[1] + 4.8) < 0.05 && local(r)[0] < -1.8, out.start);
    await key.down('KeyD'); await key.down('KeyW'); await sleep(200); await key.press('Space');
    r = await until((r) => r.world.wallrun, 1500); const x0 = local(r)[0];
    check('jumped at along it, the body runs along the wall', r.world.wallrun === true, { at: local(r), y: r.p[1] });
    await sleep(90); r = await read(); await shot('01-wall-run');
    out.wallEye = { eyeD: r.world.eyeD, eye: r.world.eye, p: r.p, pitch: r.pitch, yaw: r.yaw, zoom: r.zoom, at: local(r) };
    check('faster than a run, held up', r.world.wallrun && Math.hypot(r.v[0], r.v[2]) > 7 && r.p[1] > 1, { v: r.v, y: r.p[1] });
    r = await until((r) => !r.world.wallrun, 3000); const x1 = local(r)[0];
    r = await until((r) => r.grounded, 3000); await key.up('KeyW'); await key.up('KeyD');
    check('to its corner, and down', x1 > 2.4 && r.grounded, { from: x0, to: x1 });
    // again, and leapt off
    await goto(-2.7, -5.7); await faceYaw(along); await key.down('KeyD'); await sleep(700); await key.up('KeyD'); await until((r) => speed(r) < 0.1, 3000);
    await key.down('KeyD'); await key.down('KeyW'); await sleep(200); await key.press('Space');
    r = await until((r) => r.world.wallrun, 1500); await sleep(150);
    await key.press('Space'); await sleep(60); r = await read(); await shot('02-leapt-off');
    const lz = local(r)[1];
    await sleep(250); const r2 = await read(); await key.up('KeyW'); await key.up('KeyD');
    check('a jump leaps off it, out and up', !r.world.wallrun && local(r2)[1] < lz - 0.6 && r2.p[1] > 1.2, { z: [lz, local(r2)[1]], y: r2.p[1] });
    await until((r) => r.grounded, 4000);
  }

  if (scene === 'fight') {
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const faceYaw = async (target) => { for (let i = 0; i < 5; i++) { const d = wrap(target - (await read()).yaw); if (Math.abs(d) < 0.03) break; await drag(Math.max(-900, Math.min(900, -d / 0.0024)), 0); await sleep(120); } };
    const aimAt = async () => { const r = await read(), b = r.fight.bots[0]; if (b) await faceYaw(Math.atan2(-(b.p[0] - r.p[0]), -(b.p[2] - r.p[2]))); };
    const pick = async (level) => { await page.locator('#game-bots').click(); await sleep(250); await page.locator(`#game-bot-list [data-bot="${level}"]`).click(); await sleep(200); };
    await page.locator('#game-bots').click(); await sleep(250);
    const listed = await page.locator('#game-bot-list button').evaluateAll((els) => els.map((e) => e.dataset.bot));
    check('the bots list offers the five levels', listed.join() === '1,2,3,4,5', listed);
    await page.locator('#game-bot-list [data-bot="1"]').click(); await sleep(200);
    let r = await until((r) => r.fight.bots[0]?.mode === 'fight', 6000);
    const b0 = r.fight.bots[0], far = Math.hypot(b0.p[0] - r.p[0], b0.p[2] - r.p[2]);
    check('a drifter comes up out of the water ahead and hovers', b0.level === 1 && b0.p[1] > 1 && far > 6 && far < 17, { b0, far });
    out.hud = await page.evaluate(() => ({ on: document.querySelector('.game-hud').classList.contains('on'), hp: document.querySelector('.game-hud').classList.contains('hp'), foes: document.querySelector('.game-foes').textContent }));
    check('the mark, the body\'s health and the count are shown', out.hud.on && out.hud.hp && /1 bot/.test(out.hud.foes), out.hud);
    await aimAt(); await sleep(150 * slow); await shot('01-drifter');
    const hp0 = (await read()).fight.bots[0].hp;
    await key.down('KeyJ'); await sleep(40); await key.up('KeyJ');
    r = await until((r) => (r.fight.bots[0]?.hp ?? 0) < hp0, 3000);
    check('a cast strikes it', (r.fight.bots[0]?.hp ?? 0) === hp0 - 34, r.fight.bots[0]);
    await until((r) => r.fight.ring === 'held', 4000);
    // in creative from here: what follows is about the ring, and nothing should be struck down in the middle of it
    await key.press('KeyG'); await sleep(200);
    await aimAt(); await key.down('KeyJ'); await sleep(1000); r = await read();
    check('held, the ring spins up', r.fight.ring === 'charging' && r.fight.charge > 0.8, r.fight);
    await shot('02-spun-up'); await key.up('KeyJ');
    r = await until((r) => r.fight.broken >= 1, 4000); await sleep(250);
    check('let go, it breaks the drifter', r.fight.broken === 1 && r.fight.bots.length === 0, r.fight);
    await shot('03-broken');
    await pick(3); r = await until((r) => r.fight.bots[0]?.mode === 'fight', 6000);
    await key.press('KeyN'); r = await until((r) => r.fight.bots.length === 2, 3000);
    check('a sentinel from the list, and the key calls another at the level chosen', r.fight.level === 3 && r.fight.bots.every((b) => b.level === 3), r.fight.bots);
    await until((r) => r.fight.bots.every((b) => b.mode === 'fight'), 4000);
    await aimAt(); await key.down('KeyL'); await sleep(250); r = await read(); check('the guard comes up', r.fight.guard === true, r.fight);
    await shot('04-guard');
    r = await until((r) => r.fight.turned >= 1, 9000); await key.up('KeyL');
    check('the guard turns their bolts aside', r.fight.turned >= 1, r.fight);
    await key.press('KeyE'); r = await until((r) => r.fight.ring === 'whirl', 1500); await sleep(120); await shot('05-whirl');
    check('the whirl goes round', r.fight.ring === 'whirl', r.fight.ring);
    await until((r) => r.fight.ring === 'held', 2000);
    await key.down('Space'); await sleep(420); r = await read(); const top = r.p[1];
    await key.press('KeyJ'); r = await until((r) => r.fight.ring === 'slam' || r.grounded, 1500); const slam = r.fight.ring === 'slam';
    const t0 = Date.now(); r = await until((r) => r.grounded, 3000); const fell = Date.now() - t0; await key.up('Space');
    check('a slam from a jump drives the body down', slam && top > 1.2 && r.grounded && fell < 600, { slam, top, fell });
    await sleep(200); await shot('06-after-slam');
    // the binding: held, it takes the bot looked at and holds it, up beside the head; let go, it is thrown where the eye looks
    await key.press('KeyN'); r = await until((r) => r.fight.bots.length > 0 && r.fight.bots.every((b) => b.mode === 'fight'), 6000);
    await aimAt(); await key.down('KeyX'); await sleep(900); r = await read();
    const held = r.fight.bots.find((b) => b.mode === 'bound');
    check('the binding takes the bot looked at and holds it up beside the head', !!held && held.p[1] > r.p[1] + 1.2 && Math.hypot(held.p[0] - r.p[0], held.p[2] - r.p[2]) < 5.5, r.fight.bots);
    await shot('07-bound'); await key.up('KeyX'); await sleep(80); r = await read();
    check('let go, it is thrown', r.fight.bots.some((b) => b.mode === 'flung' || b.mode === 'tumble') || !r.fight.bots.some((b) => b.id === held?.id), r.fight.bots);
    await sleep(600); await shot('08-thrown');
    // the bow: chosen from the bar's weapons list; held, it draws; let go, its arrow strikes; the whirl's key, a volley
    const pickWeapon = async (w) => { await page.locator('#game-weapons').click(); await sleep(200); await page.locator(`#game-weapon-list [data-weapon="${w}"]`).click(); await sleep(150); };
    await pickWeapon('bow'); r = await read();
    check('the weapons list puts the bow in hand', r.fight.weapon === 'bow' && r.fight.ring === 'held', r.fight);
    const nb = r.fight.bots.length; await key.press('KeyN'); r = await until((r) => r.fight.bots.length > nb && r.fight.bots.every((b) => b.mode === 'fight'), 6000);
    const worth = (r) => r.fight.bots.reduce((a, b) => a + b.hp, 0) - 1000 * r.fight.broken, w0 = worth(r);
    await aimAt(); await key.down('KeyJ'); await sleep(900); r = await read();
    check('held, the bow draws', r.fight.bow === 'drawing' && r.fight.draw > 0.8, r.fight);
    await shot('09-drawn'); await aimAt(); await key.up('KeyJ');
    r = await until((r) => worth(r) < w0, 3000);
    check('let go, its arrow strikes', worth(r) < w0, { w0, w: worth(r), bots: r.fight.bots });
    await sleep(450); await key.press('KeyE'); await sleep(60); r = await read();
    check('the whirl\'s key looses a volley', r.fight.bolts >= 5, r.fight);
    await sleep(300); await shot('10-volley');
    // the bell: held, its tone builds; let go, it tolls, and the ring of its tone strikes what it passes; T goes on round
    await pickWeapon('bell'); r = await until((r) => r.fight.tones === 0 && r.fight.bolts === 0, 3000);
    check('the bell in hand', r.fight.weapon === 'bell', r.fight.weapon);
    const w1 = worth(r);
    await key.down('KeyJ'); await sleep(1150); r = await read();
    check('held, the bell\'s tone builds', r.fight.bell === 'ringing' && r.fight.power > 0.9, r.fight);
    await shot('11-tolling'); await key.up('KeyJ'); await sleep(50); r = await read();
    check('let go, it tolls: a ring of its tone goes out', r.fight.rang >= 1 && r.fight.tones >= 1, r.fight);
    r = await until((r) => worth(r) < w1, 3000);
    check('and strikes what it passes', worth(r) < w1, { w1, w: worth(r), bots: r.fight.bots });
    await sleep(150); await shot('12-toll');
    // the thread: T from the bell; held, its spindle spins up; let go, it lashes out at the bot looked at and, spun all
    // the way, snares it; T goes on round, to the bow and the ring
    await key.press('KeyT'); await sleep(150); r = await until((r) => r.fight.tones === 0, 3000);
    check('T goes on round: from the bell to the thread', r.fight.weapon === 'thread', r.fight.weapon);
    // a fresh warden to lash: one the lash does not break outright, so there is something left to snare
    const ids0 = new Set(r.fight.bots.map((b) => b.id));
    await pick(5); await key.press('KeyN');
    r = await until((r) => r.fight.bots.some((b) => !ids0.has(b.id) && b.mode === 'fight'), 6000);
    const warden = r.fight.bots.find((b) => !ids0.has(b.id)) || r.fight.bots[0];
    const aimWarden = async () => { const r2 = await read(), b = r2.fight.bots.find((x) => x.id === warden?.id) || r2.fight.bots[0]; if (b) await faceYaw(Math.atan2(-(b.p[0] - r2.p[0]), -(b.p[2] - r2.p[2]))); };
    const w2 = worth(r);
    await aimWarden(); await key.down('KeyJ'); await sleep(1100); r = await read();
    check('held, the thread\'s spindle spins up', r.fight.thread === 'spinning' && r.fight.spin > 0.9, r.fight);
    await aimWarden(); await key.up('KeyJ'); await sleep(40); await shot('12b-lash');
    r = await until((r) => worth(r) < w2, 3000);
    check('let go, it lashes out and strikes', worth(r) < w2, { w2, w: worth(r), bots: r.fight.bots });
    r = await until((r) => r.fight.snare != null, 600);
    check('spun all the way, it snares the bot it meets', r.fight.snare != null, r.fight);
    await sleep(350); await shot('12c-snared');
    await key.press('KeyT'); await sleep(150); const after1 = (await read()).fight.weapon; await key.press('KeyT'); await sleep(150); r = await read();
    check('T goes on round: the bow, then the ring', after1 === 'bow' && r.fight.weapon === 'ring', { after1, now: r.fight.weapon });
    const n0 = (await read()).fight.bots.length, more = Math.max(5, 7 - n0);   // as many as are left, and enough more for seven
    await pick(5); for (let i = 1; i < more; i++) { await key.press('KeyN'); await sleep(150); }
    r = await until((r) => r.fight.bots.length >= n0 + more && r.fight.bots.every((b) => b.mode === 'fight'), 6000);
    await aimAt(); out.frames = { seven: await frames(2500) };
    check('seven bots and more up, and every frame keeps up', r.fight.bots.length === n0 + more && r.fight.bots.length >= 7 && out.frames.seven.median < 20, { n0, more, n: r.fight.bots.length, frames: out.frames.seven });
    await shot('07-seven');
    await page.locator('#game-bots').click(); await sleep(250); await page.locator('#game-bot-list [data-bot="clear"]').click();
    r = await until((r) => r.fight.bots.length === 0, 2000);
    check('the list clears them', r.fight.bots.length === 0, r.fight);
  }

  if (scene === 'build') {
    out.frames ||= {};
    const W = (r) => r.world;
    await key.press('KeyB'); await sleep(200);
    let r = await read();
    const b = W(r).buildings[0];
    check('the build key puts a shelter up in front of the body, its door toward it', W(r).buildings.length === 1 && b.kind === 'shelter' && Math.hypot(b.x - r.p[0], b.z - r.p[2]) > 3 && Math.hypot(b.x - r.p[0], b.z - r.p[2]) < 4, { b, p: r.p });
    out.sayBuilt = await hintText();
    await sleep(1600 * slow); await shot('01-going-up');
    r = await until((r) => r.world.buildings[0]?.built, 15000); await sleep(400);
    check('it goes up in a few seconds', r.world.buildings[0]?.built === true, r.world.buildings[0]);
    await shot('02-built');
    out.frames.outside = await frames(2000);
    await key.down('KeyW'); r = await until((r) => r.world.inside, 8000); await sleep(900 * slow);
    check('walked in through its door', r.world.inside === 'shelter' && Math.abs(r.p[1] - 0.03) < 0.005, { inside: r.world.inside, p: r.p });
    await sleep(1800 * slow); r = await read(); await key.up('KeyW');
    check('its far wall holds the body in', r.world.inside === 'shelter', r.p);
    await until((r) => speed(r) < 0.1); await sleep(600 * slow); r = await read();
    check('inside, the body is seen by what gets in', r.world.indoor < 0.8, r.world);
    check('inside, the eye has come into the room', r.world.eyeD < 2.5, r.world);
    await shot('03-inside');
    out.frames.inside = await frames(2000);
    await drag(-700, 0); await sleep(600 * slow); await shot('04-inside-turned');
    await drag(-500, 60); await sleep(600 * slow); await shot('05-inside-turned-again');
    // the night: the hearth's light
    await page.locator('#game-controls').click(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 });
    await page.locator('#game-menu [data-light="night"]').click(); await sleep(300); await page.locator('#game-menu-close').click(); await sleep(700 * slow);
    await shot('06-inside-night');
    // the hearth, close: turned toward it (the far side of the room)
    await drag(500, -60); await sleep(600 * slow); r = await read();
    check('inside, the eye stays in the room and clear of the body', r.world.inside && r.world.eyeD >= 0.9, r.world);
    await shot('06b-inside-night-hearth');
    // out again: the eye turned back the way it came in, and the body walked backward
    await drag(700, 0); await sleep(400 * slow);
    await key.down('KeyS'); r = await until((r) => !r.world.inside && Math.hypot(r.p[0] - r.world.buildings[0].x, r.p[2] - r.world.buildings[0].z) > 2.4, 8000); await key.up('KeyS');
    out.outAgain = { p: r.p, inside: r.world.inside };
    check('and out again through the doorway', !r.world.inside && Math.abs(r.p[1]) < 0.001, out.outAgain);
    await until((r) => speed(r) < 0.1); await sleep(500 * slow); await shot('07-outside-night');
    await key.press('KeyB'); r = await until((r) => r.world.buildings.length === 0, 6000);
    check('the key again, near it, takes it down', r.world.buildings.length === 0, r.world);
    await shot('08-taken-down');
    check('no frame slower than the screen while it stands', out.frames.outside.median < 20 && out.frames.inside.median < 20, out.frames);

    // ---- the house, from the build list
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const faceYaw = async (target) => { for (let i = 0; i < 4; i++) { const d = wrap(target - (await read()).yaw); if (Math.abs(d) < 0.03) break; await drag(Math.max(-900, Math.min(900, -d / 0.0024)), 0); await sleep(120); } };
    const house = (r) => r.world.buildings.find((b) => b.kind === 'house');
    const local = (r) => { const b = house(r), dx = r.p[0] - b.x, dz = r.p[2] - b.z, c = Math.cos(b.yaw), sn = Math.sin(b.yaw); return [c * dx - sn * dz, sn * dx + c * dz]; };
    await page.locator('#game-build').click(); await sleep(250);
    const listed = await page.locator('#game-build-list button').evaluateAll((els) => els.map((e) => [e.dataset.build, e.disabled]));
    out.listed = listed;
    check('the build list offers the five, all of them made', listed.length === 5 && listed.filter(([, d]) => !d).map(([k]) => k).join() === 'shelter,house,workshop,tower,hall', listed);
    await page.locator('#game-build-list [data-build="house"]').click(); await sleep(300);
    r = await until((r) => house(r)?.built, 15000);
    check('the house goes up', !!house(r)?.built && r.world.choice === 'house', r.world);
    await faceYaw(Math.atan2(-(house(r).x - r.p[0]), -(house(r).z - r.p[2]))); await sleep(400 * slow);
    await shot('09-house');
    await key.down('KeyW'); r = await until((r) => r.world.inside === 'house' && local(r)[1] < 1.4, 10000); await key.up('KeyW');
    check('up its steps, across the porch and in at the door', r.world.inside === 'house' && Math.abs(r.p[1] - 0.5) < 0.001, { inside: r.world.inside, p: r.p, at: local(r) });
    await until((r) => speed(r) < 0.1); await faceYaw(house(r).yaw); await sleep(300);
    // to the ladder at a walk (V), so the hands stop where they mean to
    await key.down('KeyV'); await key.down('KeyA'); r = await until((r) => local(r)[0] < -0.95, 6000); await key.up('KeyA');
    await until((r) => speed(r) < 0.1); await sleep(200);
    await shot('10-house-room');
    out.frames.house = await frames(2000);
    await key.down('KeyW'); r = await until((r) => r.world.climbing, 6000); await key.up('KeyV');
    check('at the ladder, pushed toward it, the body climbs', r.world.climbing === true, { at: local(r), y: r.p[1] });
    r = await until((r) => !r.world.climbing && r.grounded && r.p[1] > 3.1, 8000); await sleep(300); await key.up('KeyW');
    r = await read();
    check('and steps off onto the loft', Math.abs(r.p[1] - 3.12) < 0.001 && local(r)[1] < -1.6, { y: r.p[1], at: local(r) });
    await until((r) => speed(r) < 0.1); await sleep(500 * slow);
    await shot('11-house-loft');
    await key.down('KeyS'); r = await until((r) => r.grounded && !r.world.climbing && r.p[1] < 0.51, 9000); await key.up('KeyS');
    check('pushed away from it at the top, it climbs back down', Math.abs(r.p[1] - 0.5) < 0.001, { y: r.p[1], at: local(r) });
    await key.press('KeyB'); r = await until((r) => !house(r), 6000);
    check('and the key near it takes the house down', !house(r), r.world);
    check('the house\'s frames keep up', out.frames.house.median < 20, out.frames.house);

    // ---- the workshop, from the build list: its glass shut while the body is away, sliding open as it comes; in at the
    // opening to its stone floor; the kiln's light at night; the key inside takes it down
    const shop = (r) => r.world.buildings.find((b) => b.kind === 'workshop');
    const sLocal = (r) => { const b = shop(r), dx = r.p[0] - b.x, dz = r.p[2] - b.z, c = Math.cos(b.yaw), sn = Math.sin(b.yaw); return [c * dx - sn * dz, sn * dx + c * dz]; };
    await page.locator('#game-build').click(); await sleep(250);
    await page.locator('#game-build-list [data-build="workshop"]').click(); await sleep(300);
    r = await until((r) => shop(r)?.built, 15000);
    check('the workshop goes up', !!shop(r)?.built && r.world.choice === 'workshop', r.world);
    await faceYaw(Math.atan2(-(shop(r).x - r.p[0]), -(shop(r).z - r.p[2]))); await sleep(300);
    await key.down('KeyS'); r = await until((r) => sLocal(r)[1] > 11, 6000); await key.up('KeyS');
    r = await until((r) => speed(r) < 0.1 && shop(r).open < 0.05, 5000);
    check('its glass is shut while the body is away', shop(r).open < 0.05, { open: shop(r).open, at: sLocal(r) });
    await shot('12-workshop');
    await key.down('KeyW'); r = await until((r) => sLocal(r)[1] < 7.6, 6000);
    out.shopOpening = shop(r).open;
    r = await until((r) => r.world.inside === 'workshop' && sLocal(r)[1] < 2, 8000); await key.up('KeyW');
    check('it slides open as the body comes, and the body walks up the steps and in to the stone floor', out.shopOpening > 0.2 && shop(r).open > 0.9 && r.world.inside === 'workshop' && Math.abs(r.p[1] - 0.5) < 0.001, { opening: out.shopOpening, open: shop(r).open, inside: r.world.inside, p: r.p, at: sLocal(r) });
    await until((r) => speed(r) < 0.1); await sleep(500 * slow);
    await shot('13-workshop-in');
    out.frames.workshop = await frames(2000);
    await page.locator('#game-controls').click(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 });
    await page.locator('#game-menu [data-light="night"]').click(); await sleep(300); await page.locator('#game-menu-close').click(); await sleep(700 * slow);
    await shot('14-workshop-night');
    await key.press('KeyB'); r = await until((r) => !shop(r), 6000);
    check('the key inside it takes the workshop down', !shop(r), r.world);
    check('the workshop\'s frames keep up', out.frames.workshop.median < 20, out.frames.workshop);
    await page.locator('#game-controls').click(); await page.waitForFunction(() => !document.getElementById('game-menu').hidden, null, { timeout: 5000 });
    await page.locator('#game-menu [data-light="pale"]').click(); await sleep(300); await page.locator('#game-menu-close').click(); await sleep(400 * slow);

    // ---- the tower, from the build list: in at its door to its stone floor; looking up its well the eye stays inside
    // and over the floor; the key inside takes it down
    const tower = (r) => r.world.buildings.find((b) => b.kind === 'tower');
    await page.locator('#game-build').click(); await sleep(250);
    await page.locator('#game-build-list [data-build="tower"]').click(); await sleep(300);
    r = await until((r) => tower(r)?.built, 15000);
    check('the tower goes up', !!tower(r)?.built && r.world.choice === 'tower', r.world);
    await faceYaw(Math.atan2(-(tower(r).x - r.p[0]), -(tower(r).z - r.p[2]))); await sleep(300);
    await shot('15-tower');
    await key.down('KeyW'); r = await until((r) => r.world.inside === 'tower' && Math.hypot(r.p[0] - tower(r).x, r.p[2] - tower(r).z) < 1.2, 8000); await key.up('KeyW');
    check('in at its door to its stone floor', r.world.inside === 'tower' && Math.abs(r.p[1] - 0.3) < 0.001, { inside: r.world.inside, p: r.p });
    await until((r) => speed(r) < 0.1); await sleep(400 * slow);
    await drag(0, -450); await sleep(700 * slow); r = await read();
    const tw = tower(r), eyeR = Math.hypot(r.world.eye[0] - tw.x, r.world.eye[2] - tw.z);
    check('looking up its well, the eye stays inside it and over its floor', eyeR < 2.5 && r.world.eye[1] > 0.3, { eye: r.world.eye, eyeR, pitch: r.pitch });
    await shot('16-tower-up');
    out.frames.tower = await frames(2000);
    await drag(0, 450); await sleep(300);
    await key.press('KeyB'); r = await until((r) => !tower(r), 6000);
    check('the key inside it takes the tower down', !tower(r), r.world);
    check('the tower\'s frames keep up', out.frames.tower.median < 20, out.frames.tower);

    // ---- the hall, from the build list: into the hangar under its terraces and out; up a lower flight, across, up the
    // middle flights and in at its door; the key inside takes it down
    const hall = (r) => r.world.buildings.find((b) => b.kind === 'hall');
    const hallW = (h, lx, lz) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw); return [h.x + c * lx + s * lz, h.z - s * lx + c * lz]; };
    const goTo = async (lx, lz, ms = 9000) => {
      const t0 = Date.now();
      for (;;) {
        const r = await read(), [x, z] = hallW(hall(r), lx, lz), dx = x - r.p[0], dz = z - r.p[2], d = Math.hypot(dx, dz);
        if (d < 0.6 || Date.now() - t0 > ms) return r;
        await faceYaw(Math.atan2(-dx, -dz)); await key.down('KeyW'); await sleep(Math.max(80, Math.min(500, (d / 5.6) * 700))); await key.up('KeyW'); await sleep(150);
      }
    };
    await page.locator('#game-build').click(); await sleep(250);
    await page.locator('#game-build-list [data-build="hall"]').click(); await sleep(300);
    r = await until((r) => hall(r)?.built, 20000);
    check('the hall goes up', !!hall(r)?.built && r.world.choice === 'hall', r.world);
    await faceYaw(Math.atan2(-(hall(r).x - r.p[0]), -(hall(r).z - r.p[2]))); await sleep(300);
    await shot('17-hall');
    await goTo(0, 36); r = await goTo(0, 20);
    check('into the hangar in its lowest terrace', r.world.inside === 'hall' && Math.abs(r.p[1] - 0.05) < 0.001, { inside: r.world.inside, p: r.p });
    await shot('18-hall-hangar');
    await goTo(0, 37); await goTo(-14, 42); r = await goTo(-14, 31);
    check('up a lower flight beside the hangar\'s mouth', Math.abs(r.p[1] - 4.6) < 0.001, r.p);
    await goTo(0, 31); r = await goTo(0, 23);
    check('across, and up the middle flights to the top terrace', Math.abs(r.p[1] - 7) < 0.001, r.p);
    r = await goTo(0, 12);
    check('in at the hall\'s door', r.world.inside === 'hall' && Math.abs(r.p[1] - 7) < 0.001, { inside: r.world.inside, p: r.p });
    await until((r) => speed(r) < 0.1); await sleep(500 * slow);
    await shot('19-hall-in');
    out.frames.hall = await frames(2000);
    await key.press('KeyB'); r = await until((r) => !hall(r), 8000);
    check('the key inside it takes the hall down', !hall(r), r.world);
    check('the hall\'s frames keep up', out.frames.hall.median < 20, out.frames.hall);
  }

  if (scene === 'ship') {
    // the skiff (stage 4): called down from the bar's ships list, boarded with R, driven, lifted, let be, stepped off
    out.frames ||= {};
    await page.locator('#game-ships').click(); await sleep(250);
    const listed = await page.locator('#game-ship-list button').evaluateAll((els) => els.map((e) => [e.dataset.ship, e.disabled]));
    out.shipsListed = listed;
    check('the ships list offers the five, all made', listed.length === 5 && listed.filter(([, d]) => !d).map(([k]) => k).join() === 'skiff,dart,dhow,ark,carrier', listed);
    await page.locator('#game-ship-list [data-ship="skiff"]').click(); await sleep(500);
    let r = await read();
    check('a skiff comes down in front of the body', r.world.ships.length === 1 && r.world.ships[0].kind === 'skiff' && Math.hypot(r.world.ships[0].p[0] - r.p[0], r.world.ships[0].p[2] - r.p[2]) < 4, r.world.ships);
    await shot('01-skiff');
    await key.press('KeyR'); await sleep(400); r = await read();
    check('R boards it: the body sits in it', r.world.aboard === true && r.world.seated === true, { aboard: r.world.aboard, seated: r.world.seated });
    out.shipHint = await hintText();
    await key.down('KeyW'); await sleep(1800 * slow); r = await read();
    check('W drives it at its speed', r.world.ships[0].speed > 20, r.world.ships[0]);
    out.frames.flying = await frames(2000);
    await shot('02-flying'); await key.up('KeyW');
    await key.down('Space'); await sleep(800); await key.up('Space'); r = await read();
    check('jump lifts it', r.world.ships[0].p[1] > 4, r.world.ships[0]);
    r = await until((r) => r.world.ships[0].speed < 0.5, 5000);
    check('let be, it slows to a hover where it is', r.world.ships[0].speed < 0.5 && r.world.ships[0].p[1] > 4, r.world.ships[0]);
    await shot('03-hover');
    await key.press('KeyR'); r = await until((r) => !r.world.aboard && r.grounded, 4000);
    check('R again steps off: beside it, down to the water', !r.world.aboard && !r.world.seated && Math.abs(r.p[1]) < 0.05, { p: r.p, aboard: r.world.aboard, seated: r.world.seated });
    await shot('04-off');
    check('its frames keep up, flying', out.frames.flying.median < 20, out.frames.flying);
    // the dart: put beside the body, boarded, driven faster, stepped off
    await page.locator('#game-ships').click(); await sleep(250);
    await page.locator('#game-ship-list [data-ship="dart"]').click(); await sleep(500);
    r = await read();
    check('a dart comes down beside the body, in place of the skiff', r.world.ships.length === 1 && r.world.ships[0].kind === 'dart', r.world.ships);
    await sleep(1200); await shot('05-dart');
    await key.press('KeyR'); await sleep(400); r = await read();
    check('R boards the dart', r.world.aboard === true && r.world.seated === true, { aboard: r.world.aboard });
    await key.down('KeyW'); await sleep(2000 * slow); r = await read();
    check('W drives the dart faster than the skiff', r.world.ships[0].speed > 35, r.world.ships[0]);
    out.frames.dart = await frames(2000);
    await shot('06-dart-flying'); await key.up('KeyW');
    await until((r) => r.world.ships[0].speed < 0.5, 6000);
    await key.press('KeyR'); r = await until((r) => !r.world.aboard && r.grounded, 4000);
    check('and off it again', !r.world.aboard && !r.world.seated, { aboard: r.world.aboard, seated: r.world.seated });
    check('its frames keep up, flying the dart', out.frames.dart.median < 20, out.frames.dart);
    // the dhow: put beside, its helm taken from the water, sailed, stepped off
    await page.locator('#game-ships').click(); await sleep(250);
    await page.locator('#game-ship-list [data-ship="dhow"]').click(); await sleep(500);
    r = await read();
    check('a dhow comes down beside the body', r.world.ships.length === 1 && r.world.ships[0].kind === 'dhow', r.world.ships);
    await sleep(1500); await shot('07-dhow');
    await key.press('KeyR'); await sleep(500); r = await read();
    check('R takes its helm, high on the stern cabin', r.world.aboard === true && r.p[1] > 6, { aboard: r.world.aboard, p: r.p });
    await key.down('KeyW'); await sleep(3500 * slow); r = await read();
    check('W sails it, heavy, up to its speed', r.world.ships[0].speed > 12, r.world.ships[0]);
    out.frames.dhow = await frames(2000);
    await shot('08-dhow-sailing'); await key.up('KeyW');
    await until((r) => r.world.ships[0].speed < 0.5, 9000);
    await key.press('KeyR'); r = await until((r) => !r.world.aboard && r.grounded, 5000);
    check('and off it again, down to the water', !r.world.aboard && Math.abs(r.p[1]) < 0.05, { aboard: r.world.aboard, p: r.p });
    check('its frames keep up, sailing the dhow', out.frames.dhow.median < 20, out.frames.dhow);
    // the ark: put beside, the body lifted from the water up into its dome, flown, stepped off
    await page.locator('#game-ships').click(); await sleep(250);
    await page.locator('#game-ship-list [data-ship="ark"]').click(); await sleep(300);
    out.arkSaid = await hintText(); r = await read();
    const ahead = r.world.ships[0] ? (r.world.ships[0].p[0] - r.p[0]) * -Math.sin(r.yaw) + (r.world.ships[0].p[2] - r.p[2]) * -Math.cos(r.yaw) : 0;
    check('an ark comes down ahead of the body, and it says so', r.world.ships.length === 1 && r.world.ships[0].kind === 'ark' && ahead > 40 && /^an ark comes down ahead of you/.test(out.arkSaid), { ships: r.world.ships, ahead, said: out.arkSaid });
    await sleep(2500); await shot('09-ark');
    await key.press('KeyR'); await sleep(500); r = await read();
    check('R lifts the body up into its dome, high on the prow', r.world.aboard === true && r.p[1] > 15, { aboard: r.world.aboard, p: r.p });
    await key.down('KeyW'); await sleep(5000 * slow); r = await read();
    check('W flies it, the heaviest, up toward its speed', r.world.ships[0].speed > 12, r.world.ships[0]);
    out.frames.ark = await frames(2000);
    await shot('10-ark-flying'); await key.up('KeyW');
    await until((r) => r.world.ships[0].speed < 0.5, 12000);
    await key.press('KeyR'); r = await until((r) => !r.world.aboard && r.grounded, 8000);
    check('and off the ark, down to the water', !r.world.aboard && Math.abs(r.p[1]) < 0.05, { aboard: r.world.aboard, p: r.p });
    check('its frames keep up, flying the ark', out.frames.ark.median < 20, out.frames.ark);
    // the carrier: put far ahead, the body lifted from the water up to its helm on the top terrace, flown, stepped off
    await page.locator('#game-ships').click(); await sleep(250);
    await page.locator('#game-ship-list [data-ship="carrier"]').click(); await sleep(300);
    out.carrierSaid = await hintText(); r = await read();
    const far = r.world.ships[0] ? (r.world.ships[0].p[0] - r.p[0]) * -Math.sin(r.yaw) + (r.world.ships[0].p[2] - r.p[2]) * -Math.cos(r.yaw) : 0;
    check('a carrier comes down far ahead of the body, and it says so', r.world.ships.length === 1 && r.world.ships[0].kind === 'carrier' && far > 300 && /^a carrier comes down ahead of you/.test(out.carrierSaid), { ships: r.world.ships, far, said: out.carrierSaid });
    await sleep(2500); await shot('11-carrier');
    await key.press('KeyR'); await sleep(500); r = await read();
    check('R lifts the body up to its helm, high on the top terrace', r.world.aboard === true && r.p[1] > 50, { aboard: r.world.aboard, p: r.p });
    await key.down('KeyW'); await sleep(5000 * slow); r = await read();
    check('W moves it, the slowest of all, toward its speed', r.world.ships[0].speed > 6, r.world.ships[0]);
    out.frames.carrier = await frames(2000);
    await shot('12-carrier-under-way'); await key.up('KeyW');
    await until((r) => r.world.ships[0].speed < 0.5, 15000);
    await key.press('KeyR'); r = await until((r) => !r.world.aboard && r.grounded, 12000);
    check('and off the carrier, down to the water', !r.world.aboard && Math.abs(r.p[1]) < 0.05, { aboard: r.world.aboard, p: r.p });
    check('its frames keep up, flying the carrier', out.frames.carrier.median < 20, out.frames.carrier);
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

  if (scene === 'fine') {
    // Colin, 15 Nov 2026: "is the pixelation necessary?" The void had taken its measure from the room's tier, which
    // begins in the middle and only ever steps down. Here the room is made to remember that it stepped down (the
    // init script above): the void is drawn with the screen's own pixels all the same, its edges smoothed.
    const top = Math.min(dpr, 2);
    const glass = (pg) => pg.evaluate(() => { const p = window.Y3K.gfx.profile(), c = document.querySelector('.game-root canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      return { tier: p.tier, manual: p.manual, wide: c.clientWidth, smoothed: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES), fine: window.Y3K.game.read().fine }; });
    // what the canvas holds, read in a frame once the game has drawn it: of a hundred points across it, how many are lit, and how many shades
    const picture = (pg) => pg.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
      const c = document.querySelector('.game-root canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'), px = new Uint8Array(4), shades = new Set(); let lit = 0;
      for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { gl.readPixels(Math.floor((i + 0.5) * c.width / 10), Math.floor((j + 0.5) * c.height / 10), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (px[0] + px[1] + px[2] > 12) lit += 1; shades.add((px[0] >> 3) + ' ' + (px[1] >> 3) + ' ' + (px[2] >> 3)); }
      res({ lit, shades: shades.size });
    })));
    const whole = (g) => !!g.fine && Math.abs(g.fine.px[0] / g.wide - g.fine.ratio) < 0.01;      // the canvas has the pixels its step says
    const first = await glass(page); out.first = first;
    check('the room begins on the tier it remembers, and that is its own guess', ['low', 'smooth'].includes(first.tier) && first.manual === false, [first.tier, first.manual]);
    check('the void is drawn with the screen\'s own pixels all the same', whole(first) && first.fine.ratio <= top + 1e-9 && (!gpu || (first.fine.ratio === top && first.fine.level === 0 && !first.fine.plain)), first.fine);
    check('its edges are smoothed', first.smoothed === true && first.samples >= 2, [first.smoothed, first.samples]);
    await shot('1-opened');
    if (gpu) {
      out.frames = await frames(3000);
      check('at that, the frames are not long', out.frames.median < 21, out.frames);
      // The page is made slow until its frames are long (its processor held back over Chromium's own protocol): its
      // own work is the cause, and fewer pixels would buy nothing. They are tried, briefly, and given back; the
      // picture is not left turned down, and its stuff is not made plain.
      const cdp = await ctx.newCDPSession(page); out.throttle = [];
      for (const rate of [20, 60, 180]) { await cdp.send('Emulation.setCPUThrottlingRate', { rate }); const f = await frames(2500); out.throttle.push({ rate, ...f }); if (f.median > 30) break; }
      const tried = await until((r) => r.fine.trials >= 1 && !r.fine.trying, 60000);
      await sleep(1000);
      const busy = await read(); out.busy = busy.fine;
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      check('a page slow with its own work: fewer pixels tried, given back, nothing made plain', tried.fine.trials >= 1 && busy.fine.level === 0 && !busy.fine.plain, busy.fine);
      await sleep(2500); out.framesAfter = await frames(3000);
      check('…and with the page itself again, the frames are good, and the picture as fine as it began', out.framesAfter.median < 21 && (await read()).fine.level === 0, out.framesAfter);
      await shot('2-kept-sharp');
      // A browser that holds its pages to thirty a second (saving power), imitated: the page's frames are run every
      // other turn of the screen. A first rule turned the void down here for nothing and never back up (16 Nov 2026).
      const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
      await ctx3.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window), waiting = []; let turn = 0;
        const pump = (now) => { raf(pump); turn += 1; if (turn % 2) return; for (const cb of waiting.splice(0)) cb(now); };
        window.requestAnimationFrame = (cb) => { waiting.push(cb); return waiting.length; };
        window.cancelAnimationFrame = () => {};
        raf(pump);
      });
      const page3 = await ctx3.newPage(); listen(page3);
      await arrive(page3);
      const read3 = () => page3.evaluate(() => window.Y3K?.game?.read?.() || null);
      const t0 = Date.now(); let r3 = await read3();
      while (Date.now() - t0 < 45000 && !(r3 && r3.fine.trials >= 1 && !r3.fine.trying)) { await sleep(250); r3 = await read3(); }
      await sleep(1000); r3 = await read3(); out.held = r3.fine;
      check('held to thirty a second: fewer pixels tried and given back; the picture is not left turned down', r3.fine.trials >= 1 && r3.fine.level === 0 && !r3.fine.plain && r3.fine.mean > 25, r3.fine);
      await page3.screenshot({ path: join(SHOTS, 'fine-3-held-to-thirty.png') });
      await ctx3.close();
    } else {
      // software drawing: the drawing is the cause. Down to its last step, the canvas with it, and then plain
      const low = await until((r) => r.fine.level === r.fine.steps - 1, 120000);
      const g1 = await glass(page); out.turnedDown = g1;
      check('a drawing that is the cause is turned down to its last step, and the canvas with it', low.fine.level === low.fine.steps - 1 && low.fine.steps > 1 && whole(g1) && g1.fine.ratio < first.fine.ratio + 1e-9, [low.fine, g1.fine]);
      await shot('2-turned-down');
      const pl = await until((r) => r.fine.plain, 120000);
      check('at the bottom its stuff is made plain', pl.fine.plain, pl.fine);
      await sleep(4000); await shot('3-plain'); out.picturePlain = await picture(page);
      check('made plain, it is still drawn', out.picturePlain.lit > 50 && out.picturePlain.shades > 5, out.picturePlain);
    }
    // a person's own choice of a lighter page is kept (?gfx=low, for one load): fewer pixels a point, plain
    // stuff, and the edges smoothed as ever
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    const page2 = await ctx2.newPage(); listen(page2);
    await arrive(page2, '/?gfx=low'); await sleep(2500 * slow);
    const own = await glass(page2); out.chosen = own;
    check('a person\'s own choice of a lighter page is kept', own.manual === true && own.tier === 'low' && own.fine.plain === true && whole(own) && (gpu ? own.fine.ratio === Math.min(dpr, 1.25) : own.fine.ratio <= 1.25 + 1e-9) && own.smoothed === true, own);
    await page2.screenshot({ path: join(SHOTS, 'fine-4-chosen.png') });
    out.pictureChosen = await picture(page2);
    check('chosen so, it is drawn', out.pictureChosen.lit > 50 && out.pictureChosen.shades > 5, out.pictureChosen);
  }

  if (scene === 'bodies') {
    // Colin, 13 Nov 2026: "5 different types of customizable characters ... all should have 5 different types of
    // customization, with 5 subset levels"
    const { KINDS, freshLook } = await import(pathToFileURL(join(ROOT, 'src', 'game', 'kinds.js')).href);
    const press = (sel) => (phone ? page.locator(sel).tap() : page.locator(sel).click());
    const sheet = () => page.evaluate(() => {
      const s = document.getElementById('game-body'), b = s.querySelector('.sheet').getBoundingClientRect(), bar = document.querySelector('.game-bar').getBoundingClientRect();
      return { open: !s.hidden, inside: s.contains(document.activeElement), kinds: s.querySelectorAll('.body-kind').length, rows: s.querySelectorAll('.body-row').length,
        opts: s.querySelectorAll('.body-opt').length, on: [...s.querySelectorAll('.body-opt.on')].map((x) => x.dataset.option), box: [b.left, b.top, b.right, b.bottom].map(Math.round), bar: Math.round(bar.bottom),
        size: [innerWidth, innerHeight], pictures: [...s.querySelectorAll('.body-kind img')].filter((i) => i.complete && i.naturalWidth > 0).length,
        cut: [...s.querySelectorAll('.body-opt span, .body-kind span')].filter((x) => x.scrollWidth > x.parentElement.clientWidth).map((x) => x.textContent) };
    });
    // the sheet's rows scrolled to their end: is its X still on the sheet, and is it what a finger there would press?
    const wayOut = () => page.evaluate(() => {
      const s = document.querySelector('#game-body .sheet'), body = document.getElementById('game-body-body'); s.scrollTop = s.scrollHeight; body.scrollTop = body.scrollHeight;
      const b = s.getBoundingClientRect(), x = document.getElementById('game-body-close').getBoundingClientRect(), at = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
      return { on: x.top >= b.top - 1 && x.bottom <= b.bottom + 1 && x.width > 0, pressed: !!at?.closest('#game-body-close'), x: [x.left, x.top, x.right, x.bottom].map(Math.round), box: [b.left, b.top, b.right, b.bottom].map(Math.round), scrolled: Math.round(Math.max(s.scrollTop, body.scrollTop)) };
    });
    await shot('01-as-it-came');
    await press('#game-body-open'); await page.waitForFunction(() => !document.getElementById('game-body').hidden, null, { timeout: 5000 }); await sleep(1400 * slow);
    const first = await sheet(), r0 = await read();
    out.sheet = first;
    check('the body sheet opens with five kinds and five rows of five, one of each on', first.open && first.kinds === 5 && first.rows === 5 && first.opts === 25 && first.on.length === 5, first);
    check('the five pictures arrived', first.pictures === 5, first.pictures);
    check('no name in the sheet is cut', first.cut.length === 0, first.cut);
    check('the focus goes into the sheet', first.inside, first.inside);
    check('the game is posing, and the body is the human as it came', r0.posing && r0.kind === 'human' && JSON.stringify(r0.look) === JSON.stringify(freshLook('human')), r0);
    // the body stands in what the sheet leaves: beside it on a desk, over it on a phone, and under the bar
    const clear = (r) => (phone ? r.seen[1] < first.box[1] - 40 : r.seen[0] < first.box[0] - 60) && r.seen[1] > first.bar && r.seen[0] > 30 && r.seen[0] < first.size[0] - 30;
    check('the body stands clear of the sheet', clear(r0), [r0.seen, first.box, first.bar]);
    const turnTo = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    check('the body has turned to face the eye', turnTo(r0.facing, r0.yaw) < 0.15, [r0.facing, r0.yaw]);
    await shot('02-human');
    // each kind is worn, and each of its 25 options is put on once
    for (const k of KINDS) {
      await press(`.body-kind[data-kind="${k.id}"]`); await sleep(900 * slow);
      const r = await read(); check(`the ${k.id} is worn`, r.kind === k.id, r.kind);
      check(`the ${k.id} stands clear of the sheet`, clear(r), r.seen);
      if (k.id !== 'human') await shot(`02-${k.id}`);
      const missed = [];
      for (const c of k.choices) for (const o of c.options) {
        await press(`.body-opt[data-choice="${c.id}"][data-option="${o}"]`); await sleep(140 * slow);
        const g = await read(); if (g.kind !== k.id || g.look[c.id] !== o) missed.push(c.id + ':' + o);
      }
      check(`every option of the ${k.id} is put on`, missed.length === 0, missed);
      const cut = (await sheet()).cut; check(`no name of the ${k.id}'s is cut`, cut.length === 0, cut);
      const way = await wayOut(); check(`the ${k.id}'s sheet keeps its way out in reach, its rows scrolled to their end`, way.on && way.pressed, way); out.sheet.scrolled = Math.max(out.sheet.scrolled || 0, way.scrolled);
      await sleep(700 * slow); await shot(`03-${k.id}-last`);
    }
    // the keys: along a row by the arrows, choosing as they go; then the two buttons under the rows
    if (!phone) {
      const c = KINDS.at(-1).choices[0];
      await page.locator(`.body-opt[data-choice="${c.id}"][data-option="${c.options.at(-1)}"]`).focus();
      await key.press('ArrowRight'); await sleep(200 * slow);
      const a1 = await read(), f1 = await page.evaluate(() => document.activeElement?.dataset?.option || '');
      check('an arrow key goes round the row and chooses', a1.look[c.id] === c.options[0] && f1 === c.options[0], [a1.look[c.id], f1]);
      await key.press('ArrowLeft'); await sleep(200 * slow);
      check('and back', (await read()).look[c.id] === c.options.at(-1), (await read()).look[c.id]);
    }
    const before = await read();
    await press('#game-body-left'); await sleep(900 * slow);
    const after = await read(); check('the turn button turns the body an eighth of the way round', Math.abs(turnTo(after.facing, before.facing) - Math.PI / 4) < 0.12, [before.facing, after.facing]);
    await shot('04-turned');
    await press('#game-body-fresh'); await sleep(500 * slow);
    const fresh = await read(); check('as it came: the first of each', JSON.stringify(fresh.look) === JSON.stringify(freshLook(fresh.kind)), fresh.look);
    // closed by Escape (a thumb presses the X): the game goes on, with the body that was chosen, and it is kept
    if (phone) await press('#game-body-close'); else await key.press('Escape');
    await page.waitForFunction(() => document.getElementById('game-body').hidden, null, { timeout: 5000 }); await sleep(900 * slow);
    const shut = await read(), kept = await page.evaluate(() => JSON.parse(localStorage.getItem('y3k.game.state') || 'null'));
    check('the sheet closes and the game goes on', !shut.posing && shut.kind === KINDS.at(-1).id, shut);
    check('the body is kept for the next visit', kept?.kind === KINDS.at(-1).id && Object.keys(kept.looks || {}).length === 5, kept);
    if (!phone) check('the focus goes home to the canvas', (await page.evaluate(() => document.activeElement?.tagName)) === 'CANVAS', await page.evaluate(() => document.activeElement?.tagName));
    // each kind walks (a thumb's stick is the phone scene's; here the sheet is what is looked at)
    if (!phone) {
      out.frames = {};
      for (const k of [...KINDS].reverse()) {
        if (k.id !== KINDS.at(-1).id) {
          await press('#game-body-open'); await page.waitForFunction(() => !document.getElementById('game-body').hidden, null, { timeout: 5000 });
          await press(`.body-kind[data-kind="${k.id}"]`); await sleep(300 * slow); await key.press('Escape');
          await page.waitForFunction(() => document.getElementById('game-body').hidden, null, { timeout: 5000 }); await sleep(600 * slow);
        }
        await key.down('KeyW'); const run = await until((r) => speed(r) > 5.2, 8000); await sleep(900 * slow);
        check(`the ${k.id} runs`, run.kind === k.id && speed(run) > 5.2, [run.kind, speed(run)]);
        out.frames[k.id] = await frames(1500); await shot(`05-${k.id}-run`);
        await key.down('Space'); await sleep(260); await key.up('Space'); await sleep(250); await shot(`06-${k.id}-jump`);
        await key.up('KeyW'); await until((r) => r.grounded && speed(r) < 0.1, 8000);
      }
    }
  }
} catch (e) { out.errors.push('script: ' + String(e?.message || e).split('\n')[0].slice(0, 300)); }
clearTimeout(dog);
await end(out.errors.length ? 1 : 0);
