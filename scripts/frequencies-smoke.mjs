#!/usr/bin/env node
// THE FREQUENCIES ROOM, LOOKED AT (FREQUENCIES.md §9). The stage and its two
// scenes import three, so the suite can only read them as text; what they draw,
// what the hand does in them and what the sound plays is looked at here: a real
// browser against a throwaway server that dies with this script. A guest opens
// the room, builds the pyramid, turns its sound on and goes to its places; then
// the sandbox: a block's lattice sounding, one horn heard alone, a horn placed
// by hand, the colours by level, the eye turned by mouse and by key.
//
//   node scripts/frequencies-smoke.mjs <desk|phone> [gpu] [dpr=N] [--shots <dir>]
//
//   desk   1280 x 800, the mouse and the keys
//   phone  390 x 844 at two pixels a point, by touch
//   gpu    the machine's own chip (the full Chromium, --use-angle=metal)
//          instead of software drawing
//
// It prints one JSON object (checks, reads, errors, where the pictures went)
// and exits 1 on a failed check, a console error, a page error or a file of
// the room's that did not arrive. Look at the pictures too.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const scene = ['desk', 'phone'].find((s) => argv.includes(s)) || 'desk';
const gpu = argv.includes('gpu');
const dpr = +(argv.find((a) => a.startsWith('dpr='))?.slice(4) || (scene === 'phone' ? 2 : 1));
const tmp = mkdtempSync(join(tmpdir(), 'y3k-freq-'));
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
// the mean colour of a PNG (as a page screenshot gives it: 8 bits, RGB or RGBA, not interlaced)
function meanColour(png) {
  let at = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at), kind = png.toString('ascii', at + 4, at + 8), body = png.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9]; }
    else if (kind === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), row = w * bpp, px = Buffer.alloc(row * h), sum = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), o = y * row;
    for (let i = 0; i < row; i++) {
      const a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[o - row + i] : 0, c = i >= bpp && y ? px[o - row + i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[o + i] = (src[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
  }
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) sum[k] += px[i * bpp + k];
  return sum.map((v) => Math.round(v / (w * h)));
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const PORT = Number(process.env.PORT) || await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slow = gpu ? 1 : 2.5;                              // software drawing is slow: the waits stretch
const out = { scene, gpu, dpr, shots: SHOTS, errors: [], warnings: [], reads: {}, notes: [], checks: {} };
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
const dog = setTimeout(() => { out.errors.push('watchdog: took too long'); end(3); }, 480000);
const check = (name, ok, got) => { out.checks[name] = ok ? 'ok' : 'NO: ' + JSON.stringify(got); if (!ok) out.errors.push('check failed: ' + name + ' ' + JSON.stringify(got)); };
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode != null) throw new Error('the server exited at boot');
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const { pw, exe } = await loadPlaywright();
  browser = await pw.chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : gpu ? { channel: 'chromium' } : {}),
    args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required']
      : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const phone = scene === 'phone';
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push('page: ' + String(e.message).slice(0, 300)));
  // a headless browser's audio device can fail under it: that is the machine's, noted, not the room's
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /AudioContext encountered an error from the audio device/.test(t)) out.notes.push('audio device: ' + t.slice(0, 160)); else if (m.type() === 'error') out.errors.push('console: ' + t.slice(0, 400)); else if (m.type() === 'warning' && /THREE|WebGL|shader|freq/i.test(t)) out.warnings.push(t.slice(0, 300)); });
  page.on('requestfailed', (r) => { if (r.url().includes('/src/')) out.errors.push('failed: ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/src/')) out.errors.push(r.status() + ': ' + r.url()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.classList.contains('entered'), null, { timeout: 60000 }); await sleep(1200);
  await page.locator('#login-skip').click(); await page.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 30000 }); await sleep(1200);
  await page.locator('#arrive-later').click({ timeout: 4000 }).catch(() => {});
  await page.locator('#nav-frequencies').click();
  const read = () => page.evaluate(() => window.Y3K?.frequencies?.read?.() || null);
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await read(); if (r && fn(r)) return r; await sleep(80); } out.notes.push('timed out waiting: ' + fn); return read(); };
  // the stage alone (it may be scrolled half out of the page by then), and the page once
  // the stage alone, brought to the middle of the window first (so nothing of the site's frame lies over it)
  const shot = async (name) => { await inView(); await sleep(500 * slow); await page.locator('.freq-stage').screenshot({ path: join(SHOTS, scene + '-' + name + '.png') }); out.reads[name] = await read(); };
  const pageShot = async (name) => { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400); await page.screenshot({ path: join(SHOTS, scene + '-page-' + name + '.png') }); };
  const inView = async () => { await page.locator('.freq-stage').evaluate((el) => el.scrollIntoView({ block: 'center' })); await sleep(300); };
  const press = (sel) => page.locator(sel).first().click({ timeout: 8000 });
  const where = (p) => page.evaluate((p) => window.Y3K.frequencies.screenOf(p), p);
  const stageBox = async () => page.locator('.freq-stage').boundingBox();
  // the gaps between drawn frames over a while: the middle one and the slow tail
  const frames = (ms = 2500) => page.evaluate(async (ms) => { const d = []; let last = 0; const t0 = performance.now();
    while (performance.now() - t0 < ms) { const n = await new Promise(requestAnimationFrame); if (last) d.push(n - last); last = n; }
    d.sort((a, b) => a - b); const q = (p) => Math.round(d[Math.min(d.length - 1, Math.floor(p * d.length))] * 10) / 10; return { n: d.length, p50: q(0.5), p95: q(0.95) }; }, ms);
  out.frames = {};

  // ---------------------------------------------------------------- the pyramid
  let r = await until((r) => r.loaded || r.failed, 60000);
  check('the stage loads', r && r.loaded && !r.failed, r && r.failed);
  out.renderer = await page.evaluate(() => { const c = document.querySelector('.freq-canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; });
  check('it opens on the pyramid', r.tab === 'pyramid' && r.stage?.scene === 'pyr', r.stage);
  const s = r.stage, want = Math.min(dpr, 3, Math.sqrt(8.3e6 / (s.css[0] * s.css[1])));
  check('drawn at the screen\'s own pixels', Math.abs(s.px[0] - Math.round(s.css[0] * want)) <= 1 && Math.abs(s.px[1] - Math.round(s.css[1] * want)) <= 1, s);
  await shot('pyramid-start');
  // the land round it: the valley below the plateau green, and the sky above the horizon blue
  { const box = await stageBox(), colour = async (p) => {
      const at = await where(p);
      if (!at || at[2] >= 1 || at[0] < 6 || at[1] < 6 || at[0] > box.width - 6 || at[1] > box.height - 6) return null;     // on the stage, in front
      // nothing of the room's own (a name, a button) may lie over the place looked at
      if (await page.evaluate(([x, y]) => document.elementsFromPoint(x, y).some((e) => e.closest?.('.freq-label, .freq-hud')), [box.x + at[0], box.y + at[1]])) return null;
      return page.screenshot({ clip: { x: box.x + at[0] - 4, y: box.y + at[1] - 4, width: 8, height: 8 } }).then(meanColour);
    };
    // the first bare sand in sight: beside the pyramid on a wide stage, or between it and the eye on a tall one
    const st = (await read()).stage, e = st.eye, t = st.target, h = Math.hypot(t[0] - e[0], t[2] - e[2]);
    let sand = null;
    for (const p of [[450, 0, 0], [300, 0, 160], ...[150, 190, 230].map((d) => [e[0] + ((t[0] - e[0]) / h) * d, 0, e[2] + ((t[2] - e[2]) / h) * d])]) if ((sand = await colour(p))) break;
    const valley = await colour([900, -42, -1300]);
    const sky = await page.screenshot({ clip: { x: box.x + box.width / 2 - 4, y: box.y + 30, width: 8, height: 8 } }).then(meanColour);
    out.reads.land = { valley, sand, sky };
    const green = (c) => c[1] - (c[0] + c[2]) / 2;
    check('the land is drawn: the valley greener than the sand, the sky blue', valley && sand && green(valley) > green(sand) + 10 && sky[2] > sky[0] + 20, { valley, sand, sky }); }
  await pageShot('pyramid');
  // seen whole on first sight: the stage's foot is inside the frame's window (not under its lower edge)
  if (!phone) {
    const fit = await page.evaluate(() => { const r = document.querySelector('.freq-stage').getBoundingClientRect(), hb = parseFloat(getComputedStyle(document.body).getPropertyValue('--hole-b')) || 0; return { bottom: Math.round(r.bottom), limit: Math.round(innerHeight - hb), h: Math.round(r.height) }; });
    check('the stage is seen whole on first sight, inside the frame', fit.bottom <= fit.limit && fit.h >= 320, fit);
  }
  await page.locator('.freq-years').evaluate((el) => { el.value = '1.6'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  r = await until((r) => r.built > 0 && r.course > 1);
  check('the years slider builds courses', r.built > 10 && r.rowHorns > 100, { built: r.built, course: r.course, rowHorns: r.rowHorns });
  await press('[data-act="pyr-sound"]');
  r = await until((r) => r.pyrSound && r.heardDb != null);
  check('sound on plays the working course at the ear', r.pyrSound && r.sound?.open && r.heardDb > 60 && r.heardDb < 200, { sound: r.sound, heardDb: r.heardDb });
  const farDb = r.heardDb, farBright = r.bright;
  await shot('pyramid-sounding');
  await press('[data-go="horns"]');
  await sleep(1800 * slow);
  r = await read();
  check('beside the horns is louder than the whole', r.heardDb > farDb + 6, { far: farDb, near: r.heardDb });
  check('the horns glow by their share of what is heard: some, not all', r.lit > 100 && r.bright > 0 && r.bright < r.lit && farBright < r.lit, { near: r.bright, far: farBright, lit: r.lit });
  // the gains the room sets from the ear (what the audio thread has made of them by now is the machine's; a headless one can stall)
  check('the stereo gains move with the ear', r.gains.some((g) => Math.abs(g) > 1e-3) && r.gains[0] !== r.gains[2], r.gains);
  if (!r.sound?.gains?.some((g) => Math.abs(g) > 1e-3)) out.notes.push('the audio thread had not applied the gains yet: ' + JSON.stringify(r.sound));
  await shot('pyramid-horns');
  await press('[data-go="course"]'); await sleep(1500 * slow); await shot('pyramid-course');
  await press('[data-go="foot"]'); await sleep(1800 * slow); await shot('pyramid-foot');
  r = await read();
  check('the eye stays above the ground', r.stage.eye[1] >= 1.1, r.stage.eye);
  await press('[data-go="whole"]'); await sleep(1500 * slow);
  if (!phone) {
    // the course under the pointer: its number, size and year
    await inView();
    const sb = await stageBox(), face = await where([0, 20, 108]);
    await page.mouse.move(sb.x + face[0], sb.y + face[1]); await sleep(600 * slow);
    const tipText = await page.locator('.freq-label.tip').first().textContent().catch(() => '');
    check('pointing at a course says which, how big, and when', /^course \d+: [\d.]+ m thick, [\d.,]+ m a side, [\d,]+ blocks · done in year [\d.]+$/.test(tipText || '') && await page.locator('.freq-label.tip').first().isVisible(), tipText);
    await page.mouse.move(sb.x + 5, sb.y + 5);
  }
  const before = (await read()).years;
  await press('[data-act="pyr-play"]');
  out.frames.pyramid = await frames();
  r = await read();
  check('build runs the clock', r.pyrPlaying && r.years > before + 0.05, { before, after: r.years });
  await press('[data-act="follow"]'); await sleep(2500);
  r = await read();
  const topNow = await page.evaluate(() => { const r = window.Y3K.frequencies.read(); return r.stage.target[1]; });
  check('following, the eye rises with the course', r.pyrPlaying && topNow > 60, { target: r.stage.target, years: r.years });
  await press('[data-act="follow"]');
  check('the scale bar reads a round length', /^(\d+ (m|cm|km)|\d\.\d km)$/.test(await page.locator('[data-hud="scale-say"]').textContent()), await page.locator('[data-hud="scale-say"]').textContent());
  await press('[data-act="pyr-play"]');
  await page.locator('.freq-years').evaluate((el) => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
  r = await until((r) => r.built === 218 && r.rowHorns === 0);
  check('at the end every course is built and no horn sounds', r.built === 218 && r.rowHorns === 0 && r.heardDb == null, { built: r.built, rowHorns: r.rowHorns, heardDb: r.heardDb });
  r = await until((r) => r.cased, 12000);
  check('then the casing is dressed, from the top down, to the foot', r.cased === true, { cased: r.cased });
  await shot('pyramid-done');
  await press('[data-view="tour"]');
  const t0 = (await read()).stage.az; await sleep(1500);
  r = await read();
  check('the tour turns the eye by itself', r.tour && Math.abs(r.stage.az - t0) > 0.04, { tour: r.tour, az0: t0, az1: r.stage.az });
  if (!phone) {
    await inView();
    const b = await stageBox(), az0 = (await read()).stage.az;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.55); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width * 0.5 + i * 22, b.y + b.height * 0.55);
    await page.mouse.up(); await sleep(900 * slow);
    const az1 = (await read()).stage.az;
    check('a drag turns the eye', Math.abs(az1 - az0) > 0.3, { az0, az1 });
    check('a hand on the stage ends the tour', !(await read()).tour, 'still touring');
    const d0 = (await read()).stage.dist;
    await page.mouse.wheel(0, -600); await sleep(900 * slow);
    const d1 = (await read()).stage.dist;
    check('the wheel comes nearer once the stage is taken up', d1 < d0 * 0.8, { d0, d1 });
    await page.keyboard.press('0'); await sleep(900 * slow);
    check('0 goes home', Math.abs((await read()).stage.dist - 430) < 30, (await read()).stage);
  }

  // ---------------------------------------------------------------- the sandbox
  await press('[data-tab="sandbox"]');
  r = await until((r) => r.tab === 'sandbox' && r.stage?.scene === 'sand');
  check('the tab changes the scene and stops the sound', r.tab === 'sandbox' && !r.pyrSound && !r.sound?.open, { tab: r.tab, sound: r.sound });
  await shot('sandbox-start');
  await press('[data-preset="block"]');
  r = await until((r) => r.horns > 20);
  check("a block's lattice places its horns", r.horns > 20 && r.f === 135, { horns: r.horns, f: r.f });
  await press('[data-act="play"]');
  await sleep(4000 * slow);
  r = await read();
  check('sound on runs the bed and plays it', r.playing && r.sound?.open && r.heardDb > 60, { playing: r.playing, sound: r.sound, heardDb: r.heardDb });
  check('the waves run on the slowed clock', r.tau > 0.5, r.tau);
  check('the scope draws the two channels', await page.locator('.freq-scope').isVisible() && r.gains.some((g) => Math.abs(g) > 1e-4), r.gains);
  out.frames.sandbox = await frames();
  await shot('sandbox-block');
  await press('[data-horn="3"]');
  r = await until((r) => r.solo === 3 && r.bright === 1);           // its light follows on the next frame drawn
  check('a horn heard alone, and alone alight', r.solo === 3 && r.heardDb > 40 && r.bright === 1, { solo: r.solo, heardDb: r.heardDb, bright: r.bright });
  await shot('sandbox-alone');
  await press('[data-act="all"]');
  r = await until((r) => r.solo === -1);
  check('all horns again', r.solo === -1, r.solo);
  await press('[data-show="spl"]');
  check('the level shows its scale', await page.locator('.freq-legend').isVisible(), 'legend hidden');
  await shot('sandbox-level');
  await press('[data-show="sand"]');
  await press('[data-preset="clear"]');
  await press('[data-tool="horn"]');
  await inView();
  const p = await where([3, 0.3, 4]), b = await stageBox();
  if (phone) await page.touchscreen.tap(b.x + p[0], b.y + p[1]); else await page.mouse.click(b.x + p[0], b.y + p[1]);
  r = await until((r) => r.horns === 1, 8000);
  check('a click on the bed places a horn', r.horns === 1, r.horns);
  await press('[data-tool="look"]');
  await pageShot('sandbox');
  if (!phone) {
    await page.locator('.freq-canvas').focus();
    const az0 = (await read()).stage.az;
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await sleep(900 * slow);
    check('the arrow keys turn the eye', Math.abs((await read()).stage.az - az0) > 0.15, { az0, az1: (await read()).stage.az });
  }
  await shot('sandbox-placed');
  await press('[data-act="play"]');
  check('nothing runs when nothing sounds', !(await read()).playing, 'still playing');
  await page.locator('#nav-mine').click({ timeout: 5000 }); await sleep(800);
  check('leaving closes the room', !(await page.evaluate(() => window.Y3K?.frequencies?.read?.().open)), 'still open');
} catch (e) {
  out.errors.push('threw: ' + String(e && e.stack || e).slice(0, 600));
}
clearTimeout(dog);
await end(out.errors.length ? 1 : 0);
