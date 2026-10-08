#!/usr/bin/env node
// THE ROOM SAYS WHEN IT LIGHTENS ITSELF, in Chromium (2026-10-08). Boots the
// site on temp data, signs the founder in through the card (the harness from
// perf-smoke.mjs), and watches the toast while the governor steps down:
//   - a step down is said once, as the toast, and never at the entrance, in
//     the warm-up, during a hold, or while Settings → Graphics is open;
//   - each kind (tier, frame rate, resolution) is said at most once a load;
//   - a click on the toast opens Settings → Graphics, whose note carries the
//     same sentence with the time it happened.
// Under SwiftShader the governor may step down on its own, or (on a loaded
// machine, measured: both runs on 2026-10-08) draw too few frames a window to
// judge anything. When it has not stepped within a minute, two bad windows are
// handed to it through gfx._feed, the same door the unit test uses.
//
//   node scripts/gfx-notice-smoke.mjs [--port <n>] [--shots <dir>] [--wait 180000]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, dflt = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const SHOTS = arg('--shots');
const WAIT_MS = Number(arg('--wait', 180000));
const PASSWORD = 'notice-founder-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const step = (what) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)}s] ${what}`);
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-notice-'));
mkdirSync(join(tmp, 'data'));
const port = Number(arg('--port')) || await freePort();
const SITE = `http://localhost:${port}`;

let serverLog = '';
async function bootSite() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '', RENDER: '' },
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  // A server that dies on the way up (a port someone else holds) is said at
  // once, not waited on and then mistaken for the page being slow.
  let gone = false;
  child.once('exit', () => { gone = true; });
  for (let i = 0; i < 300 && !gone; i++) {
    try { if ((await fetch(`${SITE}/api/health`)).ok) return child; } catch { /* booting */ }
    await sleep(200);
  }
  console.error(`the server did not come up on ${port}:\n` + serverLog.split('\n').slice(-12).join('\n'));
  process.exit(2);
}
// the founder is seeded on the first boot
let server = await bootSite();
await sleep(1500);
await new Promise((r) => { server.once('exit', r); server.kill('SIGTERM'); });
server = await bootSite();

// EVERY TOAST, as it appears, with what the page was doing at that moment:
// the rules are about when it may speak, so the moment is the evidence.
const WATCH = () => {
  window.__notices = [];
  // THE NOTICE STAYS UNTIL IT IS CLICKED, here only. Its nine seconds are a
  // person's nine seconds; under SwiftShader on a loaded machine one
  // screenshot can take longer than that, and the first run of this smoke
  // photographed an empty room and clicked the orb's frame where the toast
  // had been. Only the timer main.js sets while the toast holds a notice is
  // stretched; every other timer runs as written.
  const later = window.setTimeout;
  window.setTimeout = function (fn, ms, ...rest) {
    const t = document.getElementById('toast');
    if (ms === 9000 && t && /^Frames were arriving late/.test(t.textContent)) ms = 10 * 60 * 1000;
    return later.call(this, fn, ms, ...rest);
  };
  const graphicsOpen = () => {
    const m = document.getElementById('settings');
    return Boolean(m && !m.hidden && document.querySelector('.set-tab.on')?.dataset.pane === 'graphics');
  };
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('toast');
    if (!t) return;
    let was = '';
    new MutationObserver(() => {
      const shown = t.classList.contains('show');
      const key = shown ? `${t.classList.contains('act')}|${t.textContent}` : '';
      if (key === was) return;
      was = key;
      if (!shown) return;
      const st = window.Y3K?.gfx?.state?.() || null;
      window.__notices.push({
        at: Math.round(performance.now()), text: t.textContent, act: t.classList.contains('act'),
        gated: document.body.classList.contains('gated'), hidden: document.hidden, graphicsOpen: graphicsOpen(),
        settling: st ? st.settling : null, held: st ? st.held : null, step: st ? st.lastStep : null,
      });
    }).observe(t, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  });
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
const page = await ctx.newPage();
// Every action and screenshot gets the long wait: under SwiftShader on a busy
// machine a click can sit behind a frame for longer than Playwright's 30s.
page.setDefaultTimeout(WAIT_MS);
await page.addInitScript(WATCH);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = async (name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch((e) => console.log(`  (no ${name} shot: ${e.message})`));
};

// Into the room, whatever the door does (perf-smoke.mjs: the card can come
// back on a loaded machine, so every load waits for the room or the card).
const enter = async (url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  const which = await page.waitForFunction(() => {
    if (document.body.classList.contains('in-home')) return 'home';
    const e = document.getElementById('login-email');
    return e && e.offsetParent && getComputedStyle(e).visibility === 'visible' && document.body.classList.contains('entered') ? 'card' : false;
  }, null, { timeout: WAIT_MS }).then((h) => h.jsonValue());
  if (which === 'card') {
    const outcomeExpr = `(() => {
      if (document.body.classList.contains('in-home')) return 'in';
      const err = document.getElementById('login-error');
      return err && !err.hidden && err.textContent.trim() ? 'error: ' + err.textContent.trim() : false;
    })()`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
      await page.fill('#login-email', 'colinbiorio@gmail.com');
      await page.fill('#login-pass', PASSWORD);
      await page.keyboard.press('Enter');
      const outcome = await page.waitForFunction(outcomeExpr, null, { timeout: WAIT_MS }).then((h) => h.jsonValue());
      if (outcome === 'in') break;
      step(`sign-in attempt ${attempt}: ${outcome}`);
      await sleep(2000);
    }
  }
  await page.waitForFunction(() => document.body.classList.contains('in-home') && window.Y3K?.gfx?.state, null, { timeout: WAIT_MS });
};
// Two bad windows straight into the judge, for a machine that has not stepped
// down by itself (one that holds sixty under SwiftShader would be a surprise).
const feedBad = () => page.evaluate(() => {
  const g = window.Y3K.gfx;
  const slot = 1000 / (g.profile().fps || 60);
  const bad = Array.from({ length: 60 }, (_, i) => (i % 10 === 0 ? 120 : slot * 2.2));
  g._feed(bad, performance.now(), { slotMs: slot });
  g._feed(bad, performance.now() + 5000, { slotMs: slot });
  return g.state().lastStep;
});
const notices = () => page.evaluate(() => window.__notices.filter((n) => n.act));
const SENTENCE = /^Frames were arriving late, so (the room switched to (Lighter|Lightest|Smooth) graphics|Smooth dropped to 30 frames a second|Smooth lowered the resolution to (75|50)%, which makes the room look softer)\. Change this in Settings\s→\sGraphics\.$/;
const kindOf = (text) => (/switched to/.test(text) ? 'tier' : /frames a second/.test(text) ? 'fps' : 'scale');

try {
  step('signing in');
  await enter(SITE);

  step('waiting for the governor to step down');
  const stepped = await page.waitForFunction(() => window.Y3K.gfx.state().lastStep, null, { timeout: 60000 }).then(() => true, () => false);
  if (!stepped) { step('no step by itself in a minute: feeding two bad windows'); await feedBad(); }
  const first = await page.waitForFunction(() => window.__notices.find((n) => n.act), null, { timeout: 90000 })
    .then((h) => h.jsonValue(), () => null);
  check('a step down is said as a toast', Boolean(first), JSON.stringify(await page.evaluate(() => ({ step: window.Y3K.gfx.state(), notices: window.__notices }))));
  if (first) {
    check('in plain words, naming where to change it', SENTENCE.test(first.text), first.text);
    check('and not at the entrance, in the warm-up or during a hold', !first.gated && first.settling === false && first.held?.length === 0, JSON.stringify(first));
    await sleep(500);
    await shot('1-toast-desktop');
    // A real click, at the toast's own pixels: #toast is pointer-events:none
    // unless it leads somewhere, and a synthetic click would not know.
    const box = await page.locator('#toast').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const landed = await page.waitForFunction(() => !document.getElementById('settings').hidden
      && document.querySelector('.set-pane.on')?.dataset.pane === 'graphics', null, { timeout: WAIT_MS }).then(() => true, () => false);
    check('a click on it opens Settings → Graphics', landed);
    const note = await page.evaluate(() => document.getElementById('gfx-note')?.textContent || '');
    check('whose note says the same thing with the time', /At \d{1,2}:\d{2}(\s?[AP]M)?, frames were arriving late, so /.test(note), note);
    check('and the toast went when it was clicked', await page.evaluate(() => !document.getElementById('toast').classList.contains('show')));
    await sleep(1200);
    await shot('2-settings-graphics');

    // While the pane is open, whatever steps next is the pane's to say. The
    // sheet's first build holds the judge for 1.5s, and the 2s after a hold
    // are not judged either, so the next window has to wait them out.
    step('stepping down again with Settings → Graphics open');
    await page.waitForFunction(() => !window.Y3K.gfx.state().held.length, null, { timeout: WAIT_MS }).catch(() => {});
    await sleep(2500);
    const before = (await notices()).length;
    const was = await page.evaluate(() => window.Y3K.gfx.state().lastStep?.at);
    await feedBad();
    await page.waitForFunction((t) => (window.Y3K.gfx.state().lastStep?.at || 0) !== t, was, { timeout: 60000 }).catch(() => {});
    await sleep(2500);
    const during = await notices();
    check('nothing is toasted over Settings → Graphics', during.length === before, JSON.stringify(during.slice(before)));
    const note2 = await page.evaluate(() => document.getElementById('gfx-note')?.textContent || '');
    const last = await page.evaluate(() => window.Y3K.gfx.state().lastStep);
    check('the note follows the newest step', last ? note2.includes(last.kind === 'tier' ? 'switched to' : last.kind === 'fps' ? '30 frames a second' : `resolution to ${Math.round(last.to * 100)}%`) : true, `${JSON.stringify(last)} / ${note2}`);
    await page.click('#settings-close');
    await page.waitForFunction(() => document.getElementById('settings').hidden, null, { timeout: WAIT_MS });

    // Down the rest of the ladder: each kind once, at most. A notice that is
    // up is put away first (it stays until clicked here, see WATCH), so the
    // next one is not simply waiting behind it.
    step('walking the rest of the ladder');
    for (let i = 0; i < 5; i++) {
      await sleep(2500);
      await page.evaluate(() => document.getElementById('toast').classList.remove('show', 'act'));
      await feedBad();
    }
    await sleep(2000);
    const all = await notices();
    for (const n of all) check(`said well: "${n.text.slice(0, 64)}…"`, SENTENCE.test(n.text) && !n.gated && n.settling === false && !n.held?.length && !n.graphicsOpen, JSON.stringify(n));
    const kinds = all.map((n) => kindOf(n.text));
    check('each kind at most once a load', new Set(kinds).size === kinds.length, kinds.join(', '));
    const st = await page.evaluate(() => ({ tier: window.Y3K.gfx.tier(), profile: window.Y3K.gfx.profile() }));
    check('and the governor did reach the bottom of its ladder', st.tier === 'smooth' && st.profile.scale === 0.5, JSON.stringify(st));
    console.log('  said: ' + all.map((n) => `[${kindOf(n.text)}] ${n.text}`).join('\n        '));
  }

  // A phone, and a fresh load: the told set is per load, so the next step says
  // itself again (the tier is remembered as Smooth, so it is the frame rate).
  step('a phone-sized reload');
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(SITE);
  // (Smooth is the bottom tier, so whatever steps from here is its own
  // ladder: a tier step, or a tier sentence, would be the boot talking.)
  const boot = await page.evaluate(() => ({ step: window.Y3K.gfx.state().lastStep, tier: window.Y3K.gfx.tier(), said: window.__notices.filter((n) => n.act).map((n) => n.text) }));
  check('the remembered tier is not said as a step', boot.tier === 'smooth' && boot.step?.kind !== 'tier' && !boot.said.some((t) => /switched to/.test(t)), JSON.stringify(boot));
  const stepped2 = await page.waitForFunction(() => window.Y3K.gfx.state().lastStep, null, { timeout: 45000 }).then(() => true, () => false);
  if (!stepped2) await feedBad();
  const phone = await page.waitForFunction(() => window.__notices.find((n) => n.act), null, { timeout: 90000 }).then((h) => h.jsonValue(), () => null);
  check('a new load says its own step', Boolean(phone) && SENTENCE.test(phone.text), JSON.stringify(phone));
  if (phone) {
    const fits = await page.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 0; });
    check('the toast fits a phone', fits);
    // ...and between the rails, where it does not cover their glyphs.
    const clear = await page.evaluate(() => {
      const r = document.getElementById('toast').getBoundingClientRect();
      const rails = [...document.querySelectorAll('.nav-btn')].map((el) => el.getBoundingClientRect()).filter((b) => b.width);
      return rails.every((b) => b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom);
    });
    check('and clear of the rails', clear);
    await sleep(500);
    await shot('3-toast-phone');
    await sleep(15000);
    await shot('4-phone-later');
  }
} catch (e) {
  console.error('gfx-notice-smoke failed:', e.message.split('\n')[0]);
  failures++;
  await shot('failure');
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}

if (errors.length) {
  console.log(`\npage errors (${errors.length}):`);
  for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ' + e);
}
if (failures && serverLog) console.error(serverLog.split('\n').slice(-20).join('\n'));
console.log(failures ? `\n${failures} check(s) failed.` : '\nall checks passed.');
process.exit(failures ? 1 : 0);
