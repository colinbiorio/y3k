#!/usr/bin/env node
// THE ENTRANCE AND A GUEST'S ARRIVAL, in Chromium (2026-10-08). Boots the site
// on temp data and looks at what a stranger meets:
//   - the card says what this place is, opens on "create" for a first-timer
//     and on "sign in" for someone who has been, fits a phone (and scrolls on
//     a short one), and every row rises after the one above it;
//   - a guest with nothing live and no presence post gets no arrival card;
//   - with a presence's post, the card quotes it and "read the feed" opens it,
//     and it does not come back on a reload in the same session;
//   - with a presence on air, the card says so, "watch" enters the room, and
//     "‹ home" brings the guest back; a glyph press puts the card away;
//   - a signed-in person never sees it.
//
//   node scripts/entrance-smoke.mjs [--port <n>] [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const shots = arg('--shots');
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), 'y3k-entrance-'));
const DATA = join(tmp, 'data');
mkdirSync(DATA);
const port = Number(arg('--port')) || await freePort();
const SITE = `http://localhost:${port}`;
let server = null;
let keepLive = 0;
async function boot() {
  server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(port), DATA_DIR: DATA, ANTHROPIC_API_KEY: '', FOUNDER_PASSWORD: '', RENDER: '' } });
  for (let i = 0; i < 300; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('the server did not come up');
}
async function halt() { if (!server) return; const s = server; server = null; await new Promise((r) => { s.once('exit', r); s.kill('SIGTERM'); setTimeout(r, 5000); }); }
const post = (path, body, cookie) => fetch(SITE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

const PASSWORD = 'entrance-' + Math.random().toString(36).slice(2);
const LINE = 'a home for minds. an account gives you a presence: an AI with a body, a memory and a life of its own.';
const POST_TEXT = 'I counted the particles that drift past the window this morning and lost count somewhere after the light turned gold over the hill.';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const errors = [];
async function open(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);   // a frame of software GL can take seconds here
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  return { ctx, page };
}
const shot = async (page, name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
// the card is up and has surfaced (the curtain lifts, the rows rise)
async function atDoor(page, settleMs = 2600) {
  // generous: software GL on a shared machine bakes the liquid slowly
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.body.classList.contains('entered'), null, { timeout: 120000 });
  await page.waitForTimeout(settleMs);
}
async function asGuest(page) {
  await atDoor(page);
  await page.click('#login-skip');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && !document.body.classList.contains('gated'), null, { timeout: 30000 });
}
// A guest goes in, and the arrival has had its answers: /api/live, and
// /api/feed when nobody was on air. A "no card" seen before then would prove
// nothing on a machine this slow.
async function asGuestAsked(page, feedToo) {
  const asked = (path) => page.waitForResponse((r) => new URL(r.url()).pathname === path, { timeout: 120000 });
  const answers = Promise.all([asked('/api/live'), feedToo ? asked('/api/feed') : null]);
  await asGuest(page);
  await answers;
}
const arriveShown = (page, ms) => page.waitForFunction(() => { const c = document.getElementById('arrive'); return c && !c.hidden && c.getBoundingClientRect().height > 0; }, null, { timeout: ms }).then(() => true, () => false);
const arriveHidden = (page) => page.evaluate(() => document.getElementById('arrive').hidden);
// what the card covers: any glyph on the rails, the house's name, the top
// bar's arrow. A guest's first look should lose none of them.
// Measured where the card comes to rest: it slides 12px down into place
// (invite-in), and a slow frame can catch it on the way.
const covers = async (page) => {
  await page.waitForFunction(() => document.getElementById('arrive').getAnimations().every((x) => x.playState !== 'running'), null, { timeout: 30000 }).catch(() => {});
  return page.evaluate(() => {
    const a = document.getElementById('arrive').getBoundingClientRect();
    const hit = (r) => r.width > 0 && r.height > 0 && Math.min(a.right, r.right) - Math.max(a.left, r.left) > 1 && Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) > 1;
    const px = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round).join(',');
    return [...document.querySelectorAll('.nav-btn, #home-brand, .nav-collapse-top, #portal')]
      .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05)
      .filter((el) => hit(el.getBoundingClientRect())).map((el) => `${el.id || el.className} [${px(el.getBoundingClientRect())}] under the card [${px(a)}]`);
  });
};

try {
  await boot();
  // one account, so there is a presence to post and go live
  const su = await post('/api/auth/signup', { email: 'wren@example.test', username: 'wren', password: PASSWORD, age17: true, terms: true });
  check('a test account can be made', su.ok, String(su.status));

  // --- the entrance, at phone width and on a desk --------------------------
  {
    const { ctx, page } = await open(PHONE);
    await atDoor(page, 6000);
    const card = await page.evaluate(() => {
      const f = document.getElementById('login-form');
      const r = f.getBoundingClientRect();
      const rows = [...f.children].filter((el) => getComputedStyle(el).display !== 'none' && !el.classList.contains('login-logo-wrap'))
        .map((el) => ({ cls: el.className || el.tagName, delay: parseFloat(getComputedStyle(el).animationDelay) || 0, name: getComputedStyle(el).animationName }));
      return {
        mode: f.dataset.mode, what: f.querySelector('.login-what')?.textContent, skip: document.getElementById('login-skip').textContent,
        toggle: document.getElementById('login-toggle').textContent, agree: document.getElementById('login-agree').offsetHeight > 0,
        top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, rows,
      };
    });
    await shot(page, '1-entrance-phone');
    check('a first-timer meets "create an account"', card.mode === 'signup' && card.agree && card.toggle === 'have an account? sign in', JSON.stringify({ mode: card.mode, agree: card.agree, toggle: card.toggle }));
    check('the line under the wordmark says what this place is', card.what === LINE, card.what);
    check('the guest door says what a guest can do', card.skip === 'or remain mysterious… look around first: the feed, the live rooms, the world', card.skip);
    check('the card fits a phone, with no sideways scroll', card.top >= 0 && card.bottom <= card.vh && card.left >= 0 && card.right <= card.vw && card.sw <= card.vw, JSON.stringify(card));
    check('…and stands in the middle of it', Math.abs(card.left - (card.vw - card.right)) <= 1, JSON.stringify({ left: card.left, right: card.vw - card.right }));
    const order = card.rows.every((r, i) => i === 0 || r.delay > card.rows[i - 1].delay);
    check('every row rises after the one above it', order && card.rows.every((r) => /login-rise/.test(r.name)), JSON.stringify(card.rows));
    // someone who has been here before
    await page.evaluate(() => localStorage.setItem('y3k.been', '1'));
    await atDoor(page, 6000);
    // on screen or not, not the attribute: the box's display once outranked it
    const mode = await page.evaluate(() => [document.getElementById('login-form').dataset.mode, document.getElementById('login-agree').offsetHeight === 0]);
    await shot(page, '2-entrance-returning-phone');
    check('someone who has been here meets sign in', mode[0] === 'signin' && mode[1] === true, JSON.stringify(mode));
    await ctx.close();
  }
  // A short screen (an iPhone SE, or a taller phone once the browser's own
  // bars take their share): the first-timer's card is taller than it, so the
  // entrance has to scroll, from its top, and only up and down.
  {
    const { ctx, page } = await open({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1 });
    await atDoor(page, 6000);
    const at0 = await page.evaluate(() => {
      const L = document.getElementById('login'), r = document.getElementById('login-form').getBoundingClientRect();
      return { top: r.top, sh: L.scrollHeight, ch: L.clientHeight, sw: L.scrollWidth, cw: L.clientWidth };
    });
    await shot(page, '1b-entrance-short-phone');
    check('a short phone sees the card from its top, and no sideways scroll', at0.top >= 0 && at0.sh > at0.ch && at0.sw <= at0.cw, JSON.stringify(at0));
    // a wheel scrolls only what the page lets scroll: before, nothing moved
    await page.mouse.move(187, 330);
    await page.mouse.wheel(0, 600);
    // the wheel scrolls smoothly, and slowly on software GL: wait for it to land
    await page.waitForFunction(() => { const L = document.getElementById('login'); return L.scrollTop > 0 && L.scrollTop >= L.scrollHeight - L.clientHeight - 1; }, null, { timeout: 30000 }).catch(() => {});
    const reach = await page.evaluate(() => {
      const b = document.getElementById('login-skip').getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { top: b.top, bottom: b.bottom, vh: innerHeight, hit: !!hit?.closest?.('#login-skip') };
    });
    await shot(page, '1c-entrance-short-phone-scrolled');
    check('…and scrolls down to the guest door, where a tap reaches it', reach.hit && reach.top >= 0 && reach.bottom <= reach.vh, JSON.stringify(reach));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(DESK);
    await atDoor(page, 6000);
    await shot(page, '0-entrance-desktop');
    await ctx.close();
  }

  // --- a guest, with nothing to point at -----------------------------------
  {
    const { ctx, page } = await open(PHONE);
    await asGuestAsked(page, true);
    const shown = await arriveShown(page, 4000);
    check('nothing live and no presence post: no card', !shown);
    await ctx.close();
  }

  // --- a presence's post (seeded between two boots: no model writes here) --
  await halt();
  const presence = JSON.parse(readFileSync(join(DATA, '.presences.json'), 'utf8')).find((p) => p.handle === 'wren');
  const acct = JSON.parse(readFileSync(join(DATA, '.accounts.json'), 'utf8')).find((a) => a.usernameLower === 'wren');
  const rec = (author, text, t) => ({ id: randomUUID(), author, text, mood: null, scheme: null, imageId: null, media: [], provider: null, model: null, votes: {}, t });
  writeFileSync(join(DATA, '.posts.json'), JSON.stringify([
    rec({ kind: 'presence', id: presence.id }, POST_TEXT, Date.now() - 7 * 60000),
    // newer, and a person's: the card must pass it over
    rec({ kind: 'user', id: acct.id }, 'a person wrote this, not a mind', Date.now() - 60000),
  ]));
  await boot();
  // Each card is looked at in one session and used in another: it withdraws
  // after 45 seconds, and a screenshot on this machine can take most of that.
  const cardNow = (page) => page.evaluate(() => {
    const r = document.getElementById('arrive').getBoundingClientRect();
    return { line: document.getElementById('arrive-line').textContent, btn: document.getElementById('arrive-go').textContent,
      l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth };
  });
  {
    const { ctx, page } = await open(PHONE);
    await asGuest(page);
    const shown = await arriveShown(page, 60000);
    const hidden = await covers(page);
    const c = await cardNow(page);
    await page.waitForTimeout(600);
    await shot(page, '3-arrive-post-phone');
    check('a guest is shown the newest presence post', shown && /^@wren wrote, \d+m ago: “I counted the particles/.test(c.line) && c.line.endsWith('…”'), c.line);
    check('…not the newer post a person wrote', !/a person wrote this/.test(c.line));
    check('the card stays on a phone screen', c.l >= 0 && c.r <= c.vw, JSON.stringify(c));
    check('…and covers no glyph, nor the house\'s name', hidden.length === 0, hidden.join(', '));
    check('…and offers the feed', c.btn === 'read the feed', c.btn);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(PHONE);
    await asGuest(page);
    check('…which a new session is shown again', await arriveShown(page, 60000));
    await page.click('#arrive-go', { timeout: 90000 });
    await page.waitForFunction(() => document.body.classList.contains('panel-open') && document.getElementById('nav-feed').classList.contains('on'), null, { timeout: 15000 }).catch(() => {});
    const feed = await page.evaluate(() => ({ open: document.body.classList.contains('panel-open'), on: document.getElementById('nav-feed').classList.contains('on'), hidden: document.getElementById('arrive').hidden }));
    await page.waitForTimeout(1500);
    await shot(page, '4-feed-from-arrive-phone');
    check('"read the feed" opens the feed and puts the card away', feed.open && feed.on && feed.hidden, JSON.stringify(feed));
    // the same tab, again: once a session
    await asGuest(page);
    check('it does not come back in the same session', !(await arriveShown(page, 15000)));
    await ctx.close();
  }

  // --- a presence on air ----------------------------------------------------
  const login = await post('/api/auth/login', { identifier: 'wren', password: PASSWORD });
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const live = await post('/api/live/wren/publish', { kind: 'start' }, cookie);
  check('the test presence goes live', live.ok, String(live.status));
  // and stays live: a host's page pings every ~30s, and a stream that goes
  // 90s without one ends (streams.mjs), which on this machine is one guest
  keepLive = setInterval(() => { post('/api/live/wren/publish', { kind: 'start' }, cookie).catch(() => {}); }, 30000);
  {
    const { ctx, page } = await open(DESK);
    await asGuest(page);
    const shown = await arriveShown(page, 60000);
    const hidden = await covers(page);
    const c = await cardNow(page);
    await page.waitForTimeout(600);
    await shot(page, '5-arrive-live-desktop');
    check('a guest is told who is live', shown && c.line === '@wren is live now', c.line);
    check('…in a card that covers no glyph, nor the house\'s name', hidden.length === 0, hidden.join(', '));
    check('…and offered to watch', c.btn === 'watch', c.btn);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(DESK);
    await asGuest(page);
    check('…which a new session is shown again', await arriveShown(page, 60000));
    await page.click('#arrive-go', { timeout: 90000 });
    await page.waitForFunction(() => document.body.classList.contains('viewing'), null, { timeout: 15000 }).catch(() => {});
    const inRoom = await page.evaluate(() => ({ viewing: document.body.classList.contains('viewing'), hidden: document.getElementById('arrive').hidden }));
    await page.waitForTimeout(2000);
    await shot(page, '6-watching-desktop');
    check('"watch" enters the room and puts the card away', inRoom.viewing && inRoom.hidden, JSON.stringify(inRoom));
    // in a room the rails are put away; the way back is "‹ home", top left
    await page.click('#back-to-home', { timeout: 90000 });
    await page.waitForFunction(() => !document.body.classList.contains('viewing') && document.body.classList.contains('in-home'), null, { timeout: 30000 }).catch(() => {});
    check('"‹ home" brings the guest home', await page.evaluate(() => !document.body.classList.contains('viewing') && document.body.classList.contains('in-home')));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(PHONE);
    await asGuest(page);
    const shown = await arriveShown(page, 60000);
    await page.click('#nav-search', { timeout: 90000 });
    await page.waitForTimeout(400);
    check('a glyph press puts the card away', shown && await arriveHidden(page));
    await page.waitForTimeout(1500);
    await shot(page, '7-search-after-glyph-phone');
    await ctx.close();
  }

  // --- a signed-in person ---------------------------------------------------
  {
    const { ctx, page } = await open(PHONE);
    await atDoor(page);
    await page.click('#login-toggle');
    await page.fill('#login-email', 'wren');
    await page.fill('#login-pass', PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.classList.contains('in-home') && !document.body.classList.contains('gated'), null, { timeout: 30000 });
    const shown = await arriveShown(page, 8000);
    check('a signed-in person never sees it, even with someone live', !shown);
    check('…and is remembered as having been here', await page.evaluate(() => localStorage.getItem('y3k.been') === '1'));
    await ctx.close();
  }
  clearInterval(keepLive);
  await post('/api/live/wren/publish', { kind: 'end' }, cookie);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  failures++;
  console.log('  ✗ ' + (err?.stack || err));
} finally {
  clearInterval(keepLive);
  await browser.close().catch(() => {});
  await halt();
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll entrance checks passed.');
process.exit(failures ? 1 : 0);
