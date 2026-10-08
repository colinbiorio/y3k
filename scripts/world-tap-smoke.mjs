#!/usr/bin/env node
// A THING LEFT ON THE GROUND IS READ BY A TAP, in Chromium. 2026-10-08: the
// small glowing gems presences leave on the world (an inscription, a gift)
// could be seen and never read. This settles the founder's society, sets an
// inscription and a gift down on its ground (written into the planet's file
// between two boots, the way the server itself would store them), and then
// taps each one: as the owner, and as a watcher with no account on a phone-
// sized screen. Each tag must read the words, who left them, how long ago and
// when they fade, and the rows the page was sent must carry nothing of the
// record but what the tag needs.
//
// It loads the site on the smooth graphics tier (?gfx=smooth): the tag is the
// same on every tier, and the poured wordmark at the door can hold software
// GL's main thread for a minute on a busy machine.
//
//   PORT=47231 node scripts/world-tap-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'world-' + Math.random().toString(36).slice(2);
const DAY = 86400000;

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-world-tap-'));
const DATA = join(tmp, 'data');
mkdirSync(DATA);
const sitePort = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${sitePort}`;
const env = { ...process.env, PORT: String(sitePort), DATA_DIR: DATA, FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '', RENDER: '' };
// A server that could not take the port exits at once, and the health check
// would then be answered by whoever holds it: another run's server, with
// another planet. So a boot is good only while its own child still lives.
async function boot() {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env });
  for (let i = 0; i < 200; i++) {
    if (child.exitCode != null) break;
    try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 300));
  if (child.exitCode != null) { console.log(`  ✗ the server exited at boot (is port ${sitePort} taken?)`); process.exit(1); }
  return child;
}
async function halt(child) {
  if (child.exitCode != null || child.signalCode != null) return;
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
}
// a smoke that dies early must not leave its server holding the port
process.on('exit', () => { try { server.kill('SIGKILL'); } catch { /* gone */ } });
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(1));
// the founder is seeded on the first boot, orion on the next
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
await halt(server);
server = await boot();

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const shot = async (page, name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`), timeout: 180000 }); } };
const T0 = Date.now();
const step = (what) => console.log(`  … ${what} (${Math.round((Date.now() - T0) / 1000)}s)`);
// THREE'S OWN DEVTOOLS HOOK. three.js announces every Scene and renderer it
// makes to window.__THREE_DEVTOOLS__ when one exists; this one keeps them, and
// notes the camera each scene was last drawn with, so the smoke can say where
// on screen each gem floats instead of tapping the whole canvas to find out.
const devtools = () => {
  const seen = { scenes: [], cams: new Map() };
  window.__worldTap = seen;
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => {
    const o = e.detail;
    if (o?.isScene) seen.scenes.push(o);
    else if (o && typeof o.render === 'function' && o.domElement) {
      const draw = o.render;
      o.render = function (scene, camera) {
        if (scene?.isScene && camera?.isPerspectiveCamera) seen.cams.set(scene, camera);
        return draw.call(this, scene, camera);
      };
    }
  });
};
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript(devtools);
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);   // a slow, shared machine; nothing here should take this long
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  return page;
}
// The world's own poll, caught as it lands: /api/world/here for the owner,
// /api/world/watch for a watcher.
const worldAnswer = (page, path, until) => {
  const p = page.waitForResponse(async (r) => {
    if (!r.url().includes(path) || r.status() !== 200) return false;
    try { return until(await r.json()); } catch { return false; }
  }, { timeout: 240000 }).then((r) => r.json());
  p.catch(() => {});   // awaited by the caller; a failure there is reported there
  return p;
};
const openWorld = (page) => page.evaluate(() => document.getElementById('nav-world').click());

// Taps each gem where it floats on screen until the tag reads `want`, and a
// little around it if a sprite stands in front (a sprite is picked first).
// Every tap waits up to six frames for the tag: the world's loop is paced
// (src/pace.js), so not every animation frame draws one.
const tapUntil = (page, want) => page.evaluate(async (wantSrc) => {
  const want = new RegExp(wantSrc);
  const canvas = document.querySelector('.world-canvas canvas');
  const tag = document.getElementById('world-tag');
  const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const reads = () => !tag.hidden && want.test(tag.textContent);
  if (reads()) return { text: tag.textContent, gems: -1 };
  const r = canvas.getBoundingClientRect();
  const gems = [];
  for (const scene of window.__worldTap.scenes) {
    const cam = window.__worldTap.cams.get(scene);
    if (!cam) continue;
    scene.traverse((o) => {
      if (o.isMesh && o.geometry?.type === 'OctahedronGeometry') {
        const v = o.position.clone().project(cam);
        if (v.z < 1) gems.push([r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height]);
      }
    });
  }
  const nudges = [[0, 0], [0, -18], [18, 0], [-18, 0], [0, 18], [0, -34], [30, -20], [-30, -20]];
  for (const [gx, gy] of gems) {
    for (const [dx, dy] of nudges) {
      canvas.dispatchEvent(new MouseEvent('click', { clientX: gx + dx, clientY: gy + dy, bubbles: true }));
      for (let f = 0; f < 6; f++) {
        await frames(1);
        if (reads()) return { text: tag.textContent, gems: gems.length };
      }
    }
  }
  return { text: null, gems: gems.length };
}, want.source);
const ROW_KEYS = 'gift,maker,scheme,t,text,x,z';

try {
  // 1. the founder settles the planet
  step('signing in as the founder');
  const owner = await newPage({ width: 1180, height: 760 });
  await owner.goto(`${SITE}/?gfx=smooth`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await owner.waitForSelector('#login-email', { state: 'visible', timeout: 240000 });
  // a browser that has never signed in here meets "create an account" first
  if (await owner.getAttribute('#login-form', 'data-mode') === 'signup') await owner.click('#login-toggle');
  await owner.fill('#login-email', 'colinbiorio@gmail.com');
  await owner.fill('#login-pass', PASSWORD);
  await owner.keyboard.press('Enter');
  await owner.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 240000 });
  const first = worldAnswer(owner, '/api/world/here', (j) => j.me && j.me.course);
  await openWorld(owner);
  const here = await first;
  const c = here.me.course;
  check('the founder\'s presence has a society on the planet', Number.isFinite(c.toX) && Number.isFinite(c.toZ), JSON.stringify(c));

  // 2. two things on its ground, stored the way world.mjs stores them
  step('setting two things down');
  await halt(server);
  const file = join(DATA, '.world.json');
  const planet = JSON.parse(readFileSync(file, 'utf8'));
  const [pid] = Object.keys(planet.settlements);
  const now = Date.now();
  planet.artifacts = [
    { id: 'insc001', maker: pid, text: 'the river was here first, and it will be here after', x: c.toX - 4, z: c.toZ + 5, t: now - 2 * DAY - 60000 },
    { id: 'gift001', maker: pid, forPid: 'p-someone-else', text: '3 coal, carried here for you', goods: { coal: 3 }, x: c.toX + 6, z: c.toZ + 3, t: now - 5 * 3600000 },
  ];
  writeFileSync(file, JSON.stringify(planet));
  server = await boot();

  step('waiting for the world to send them');
  // 3. the owner taps each one, once the world's own ten-second poll has
  // brought them (the page stays open across the restart, as a person's would)
  const rows = (await worldAnswer(owner, '/api/world/here', (j) => (j.artifacts || []).length >= 2)).artifacts;
  check('the owner is sent each thing as exactly what the tag reads', rows.every((r) => Object.keys(r).sort().join() === ROW_KEYS), JSON.stringify(rows));
  check('no id, recipient or goods table reaches the page', !/insc001|gift001|p-someone-else|forPid|goods/.test(JSON.stringify(rows)) && !JSON.stringify(rows).includes(pid), JSON.stringify(rows));
  check('a gift is sent as what it holds', rows.some((r) => r.gift && r.text === '3 coal'), JSON.stringify(rows));
  await owner.waitForSelector('.world-canvas canvas', { timeout: 240000 });
  await owner.waitForTimeout(6000);   // the scene builds its layers on a slow, shared machine

  step('tapping as the owner');
  const ins = await tapUntil(owner, /the river was here first/);
  check('tapping the inscription reads it', !!ins.text, `no tap found it among ${ins.gems} gems`);
  if (ins.text) {
    check('in its words, who left it, how long ago and when it fades', /“the river was here first, and it will be here after”left by @orion · 2 days ago · fades in 28 days/.test(ins.text), ins.text);
    const look = await owner.evaluate(() => {
      const tag = document.getElementById('world-tag'); const b = tag.getBoundingClientRect();
      return { long: tag.classList.contains('long'), italic: getComputedStyle(tag.querySelector('i')).fontStyle, w: b.width, left: b.left, right: b.right, vw: innerWidth };
    });
    check('it wraps, with the words in italic, and stays on screen', look.long && look.italic === 'italic' && look.w <= 281 && look.left >= 0 && look.right <= look.vw, JSON.stringify(look));
    await shot(owner, 'owner-inscription');
  }
  const gift = await tapUntil(owner, /a gift from/);
  check('tapping the gift reads who carried it, what it holds and when it fades', /a gift from @orion: 3 coal · 5 hours ago · fades in 30 days/.test(gift.text || ''), gift.text || `no tap found it among ${gift.gems} gems`);
  if (gift.text) await shot(owner, 'owner-gift');

  // 4. a watcher with no account, on a phone-sized screen
  step('watching without an account');
  const watcher = await newPage({ width: 390, height: 844 });
  await watcher.goto(`${SITE}/?gfx=smooth`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await watcher.waitForSelector('#login-skip', { state: 'visible', timeout: 240000 });
  await watcher.click('#login-skip', { timeout: 240000 });
  await watcher.waitForFunction(() => document.body.classList.contains('in-home'), null, { timeout: 240000 });
  const watched = worldAnswer(watcher, '/api/world/watch', (j) => (j.artifacts || []).length >= 2);
  await openWorld(watcher);
  const wrows = (await watched).artifacts;
  check('a watcher is sent the same rows, and nothing more', wrows.every((r) => Object.keys(r).sort().join() === ROW_KEYS) && !/insc001|gift001|p-someone-else/.test(JSON.stringify(wrows)), JSON.stringify(wrows));
  await watcher.waitForSelector('.world-canvas canvas', { timeout: 240000 });
  await watcher.waitForTimeout(6000);
  const wins = await tapUntil(watcher, /the river was here first/);
  check('a watcher reads the same inscription', /left by @orion · 2 days ago · fades in 28 days/.test(wins.text || ''), wins.text || `no tap found it among ${wins.gems} gems`);
  if (wins.text) {
    const look = await watcher.evaluate(() => {
      const b = document.getElementById('world-tag').getBoundingClientRect(); const cs = getComputedStyle(document.body);
      return { left: b.left, right: b.right, holeL: parseFloat(cs.getPropertyValue('--hole-l')) || 0, roomR: innerWidth - (parseFloat(cs.getPropertyValue('--hole-r')) || 0) };
    });
    check('on a phone the tag stays inside the room, clear of the rails', look.left >= look.holeL && look.right <= look.roomR, JSON.stringify(look));
    await shot(watcher, 'watcher-inscription');
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.message || err));
  for (const p of browser.contexts().flatMap((x) => x.pages())) {
    console.log('    body: ' + await p.evaluate(() => document.body.className).catch(() => '?'));
    await shot(p, 'error-' + p.viewportSize()?.width).catch(() => {});
  }
  if (errors.length) console.log('    page errors: ' + errors.join(' | '));
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll world-tap checks passed.');
process.exit(failures ? 1 : 0);
