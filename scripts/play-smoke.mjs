#!/usr/bin/env node
// PLAY MOVES THE WORLD, END TO END, in Chromium: the founder on the world
// screen, the brain their own local Claude Code with a stand-in `claude`
// (test/fakes/play-claude.mjs) that answers every beat with four world verbs.
// Pressing the world's own button has to start play, and the first play beat
// has to change the ground: the course turns north, sprite 1 goes out for
// coal, the society lives by the way it named. The next beat has to be told
// what the last one did. Until 2026-10-08 none of it happened (world-verbs.mjs).
//
// Then the list that play fills (who is near, the hails, the ways) and the
// open map are looked at at 1280, 1024, a phone, and a phone held sideways:
// each has to stand inside the room, clear of every rail button and of
// everything else standing there (src/world-side.js). Both sat under the
// right rail until 2026-10-08, and play is what filled the list on every
// owner's screen. The list has to scroll by its own keys, and where the room
// has no place for it (sideways; a portrait phone with the map open or the
// firsts card opened to "all") the world bar has to say what it holds, where
// a finger reaches it, and show it when pressed.
//
//   PORT=47231 node scripts/play-smoke.mjs [--shots <dir>]
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const PASSWORD = 'play-' + Math.random().toString(36).slice(2);

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not local */ }
  const g = execSync('npm root -g').toString().trim();
  return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let failures = 0;
const check = (name, cond, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };
const until = async (fn, ms, step = 500) => {
  for (const end = Date.now() + ms; Date.now() < end;) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); }
  return null;
};

const tmp = mkdtempSync(join(tmpdir(), 'y3k-play-'));
mkdirSync(join(tmp, 'data'));
const LOG = join(tmp, 'brain.log');
const sitePort = Number(process.env.PORT) || await freePort();
const SITE = `http://localhost:${sitePort}`;
const env = { ...process.env, PORT: String(sitePort), DATA_DIR: join(tmp, 'data'), FOUNDER_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '',
  Y3K_LOCAL_CLAUDE_CODE: '1', Y3K_CLAUDE_BIN: join(ROOT, 'test', 'fakes', 'play-claude.mjs'), FAKE_BRAIN_LOG: LOG, RENDER: '' };
async function boot() {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, stdio: 'ignore', env });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }
  return child;
}
// the founder is seeded on the first boot, orion on the next
let server = await boot();
await new Promise((r) => setTimeout(r, 1500));
server.kill('SIGTERM');
await new Promise((r) => server.once('exit', r));
server = await boot();
const calls = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const plays = () => calls().filter((c) => c.system.includes('YOUR TURN IN THE WORLD'));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
// generous: the machine this runs on is shared, and the world draws in software GL
page.setDefaultTimeout(180000);
page.setDefaultNavigationTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
const shot = async (name) => { if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`) }); } };
const here = () => page.evaluate(() => fetch('/api/world/here').then((r) => r.json()));
// A press on the world bar after the first one is the button's own click. The
// bar's buttons shift sideways as its status line grows and shrinks with each
// walk ("— walking to …"), and a pointer click aimed before the shift landed
// on the neighbour: the pause press missed, and a press on "the map" landed
// on "ride". The first press below still proves, by a hit test, that a hand
// can reach the bar.
const press = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
const mapOpen = () => page.evaluate(() => !document.getElementById('world-map').hidden);
const mapTo = async (open) => {
  if (await mapOpen() !== open) await press('world-showmap');
  return until(async () => (await mapOpen()) === open, 30000);
};

try {
  await page.goto(SITE);
  await page.waitForSelector('#login-email', { state: 'visible' });
  // a browser that has never signed in here meets "create an account" first (2026-10-08)
  if (await page.getAttribute('#login-form', 'data-mode') === 'signup') await page.click('#login-toggle');
  await page.fill('#login-email', 'colinbiorio@gmail.com');
  await page.fill('#login-pass', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('in-home') && document.body.classList.contains('has-presence'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => fetch('/api/presences/orion/budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ set: 5 }) }));

  await page.click('#nav-world');
  await page.waitForSelector('.world-root #world-wake', { state: 'visible' });
  // the ground streams in and the first poll lands; software GL is slow
  await page.waitForTimeout(8000);
  const before = await here();
  check('orion keeps ground, settled, with its sprites at home', !!before.me?.course && before.sprites?.length >= 3 && !before.sprites.some((s) => s.job),
    JSON.stringify(before.me?.course));
  await shot('1-world-before-play');

  // what a hand pressing the mark would land on (the mark is poured metal over
  // the button, so the topmost element there must be the button or inside it)
  const hit = await page.evaluate(() => {
    const b = document.getElementById('world-wake'), r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { onIt: !!top && (top === b || b.contains(top)), top: top ? `${top.tagName}#${top.id}.${top.className}` : null };
  });
  check('the world\'s play button is what a press there lands on', hit.onIt, JSON.stringify(hit));
  await page.click('#world-wake', { force: true });
  check('the world\'s button starts play', await until(() => page.evaluate(() => document.body.classList.contains('playing')), 10000) === true);
  const first = await until(() => plays().length >= 1, 60000);
  check('a play beat reached the brain', !!first, `${calls().length} calls`);
  const moved = await until(async () => { const h = await here(); return h.sprites?.find((s) => s.n === 1)?.job ? h : null; }, 30000);
  check('sprite 1 went out for coal', !!moved && /coal/.test(moved.sprites.find((s) => s.n === 1).job.looking), JSON.stringify(moved?.sprites?.[0]?.job));
  check('the course turned north', !!moved && moved.me.course.toZ !== before.me.course.toZ && moved.me.course.toX === before.me.course.toX,
    JSON.stringify({ was: before.me.course, now: moved?.me?.course }));
  check('the society lives by the way it named', !!moved && moved.ways.some((w) => w.own && /walls low/.test(w.text)), JSON.stringify(moved?.ways));

  // the next beat is told what the last one did: tend.js notes it on the
  // game's own thread (notePlay), and the next play beat carries that thread
  const second = await until(() => plays().length >= 2 && plays()[1], 60000);
  check('the next beat hears that it led its people and sent a sprite',
    !!second && second.input.includes('you led your society: go north') && /you sent #1 \S+ to look for coal/.test(second.input),
    second ? second.input.slice(-600) : 'no second beat');
  check('…and that its call across found no one to hear it', !!second && second.input.includes('you called out, but no awake society within sight to hear you'));

  // let the poll carry the new course and the sprite's walk to the screen
  await page.waitForTimeout(12000);
  await shot('2-world-after-play');
  await mapTo(true);
  await page.waitForTimeout(2500);
  await shot('3-world-map-after-play');

  await press('world-wake');
  check('pressing it again pauses the game', await until(() => page.evaluate(() => !document.body.classList.contains('playing')), 10000) === true);

  // THE RIGHT SIDE OF THE ROOM. The ground a busy neighbourhood would send:
  // the way the beat named, two more ways and two hails heard across it, put
  // into the world's own ten-second answer, so the list is as long as it gets
  // in use and has to scroll where its place is short.
  const t0 = Date.now();
  // (a poll still in flight when the browser closes throws "Request context
  // disposed" from here, after every check has passed, and the unhandled
  // rejection failed the run: it is let go)
  await page.route('**/api/world/here', async (route) => {
    try {
      const res = await route.fetch();
      const j = await res.json().catch(() => null);
      if (!j?.me) { await route.fulfill({ response: res }); return; }
      j.voices = [...(j.voices || []),
        { from: 'vega', to: 'orion', text: 'then come and see the river before the frost takes it; we have room on the east bank', t: t0 - 120000 },
        { from: 'orion', to: 'vega', text: 'tomorrow, at first light', t: t0 - 30000 }];
      j.ways = [...(j.ways || []),
        { text: 'nobody eats until the sprites are home', own: false, from: 'vega', held: 2 },
        { text: 'what is found on the ground is shared before it is counted', own: true, held: 3 }];
      await route.fulfill({ response: res, json: j });
    } catch { /* the page or the browser closed under it */ }
  });
  const listed = await until(() => page.evaluate(() => {
    const t = document.getElementById('world-near')?.textContent || '';
    return /walls low/.test(t) && /first light/.test(t) && /shared before it is counted/.test(t);
  }), 30000);
  check('the list carries the way the beat named, the hails and the other ways', !!listed);
  // every box on the screen that the list and the map must keep clear of
  const look = () => page.evaluate(() => {
    const box = (el) => { const b = el?.getBoundingClientRect(); return b && b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    const near = document.getElementById('world-near'), map = document.getElementById('world-map');
    const chip = document.getElementById('world-nearchip');
    const rows = near && !near.hidden ? [...near.children].map((el) => box(el)).filter(Boolean) : [];
    // what a press lands on: a row of the list, and the map
    const top = (x, y) => document.elementFromPoint(x, y);
    const nb = box(near);
    return {
      w: innerWidth, cardSize: document.querySelector('.firsts')?.dataset.size,
      room: box(document.getElementById('nav-hole')),
      near: near && !near.hidden ? nb : null, rows, over: !!near?.classList.contains('over'),
      chip: chip && !chip.hidden ? { text: chip.textContent, on: chip.classList.contains('on'), ...box(chip) } : null,
      map: map && !map.hidden ? box(map) : null,
      rail: [...document.querySelectorAll('#home-nav > .nav-btn, #home-nav-right > .nav-btn, #home-nav-top .nav-btn, #home-nav-bottom .nav-btn')]
        .filter((b) => !b.hidden && getComputedStyle(b).visibility !== 'hidden' && Number(getComputedStyle(b).opacity) > 0)
        .map((b) => ({ id: b.id, ...box(b) })).filter((b) => b.r > b.l),
      things: {
        bar: box(document.querySelector('.world-bar')), firsts: box(document.querySelector('.firsts')),
        tools: box(document.querySelector('.world-tools')), hands: box(document.querySelector('.hands')),
        grip: box(document.querySelector('.nav-collapse')), gripRight: box(document.querySelector('.nav-collapse-right')),
        gripTop: box(document.querySelector('.nav-collapse-top')), gripBottom: box(document.querySelector('.nav-collapse-bottom')),
      },
      hitRow: rows[0] ? near.contains(top((rows[0].l + rows[0].r) / 2, (rows[0].t + rows[0].b) / 2)) : null,
      hitMap: map && !map.hidden ? top((box(map).l + box(map).r) / 2, (box(map).t + box(map).b) / 2) === map : null,
      hitChip: chip && !chip.hidden ? ((t) => t === chip || `${t?.tagName}.${t?.className}`)(top((box(chip).l + box(chip).r) / 2, (box(chip).t + box(chip).b) / 2)) : null,
    };
  });
  // A press beside a row shorter than the list must still reach the world,
  // where a left thing's tag is read. The ways' label is always shorter than
  // the ways' box, which is as wide as its widest way: it is scrolled into
  // view and pressed just left of it, inside that box (which took the press
  // until 2026-10-09: every child of the list took one, the ways' box too).
  const beside = () => page.evaluate(() => {
    const near = document.getElementById('world-near');
    const label = near.querySelector('.world-ways > i'), ways = near.querySelector('.world-ways');
    if (!label || !ways) return { why: 'no ways in the list' };
    near.scrollTop += label.getBoundingClientRect().top - near.getBoundingClientRect().top - 8;
    const l = label.getBoundingClientRect(), w = ways.getBoundingClientRect();
    if (l.left - w.left < 16) return { why: `the label is as wide as the ways (${Math.round(w.left)}-${Math.round(l.left)})` };
    const hit = document.elementFromPoint((w.left + l.left) / 2, (l.top + l.bottom) / 2);
    near.scrollTop = 0;
    return { tag: hit?.tagName, cls: hit?.className };
  });
  // The list scrolls past its place by its own keys (the camera took the
  // arrows until 2026-10-09), and its foot is veiled exactly while there is
  // more below (fadeNear, a frame after each scroll).
  const scrolls = async (w) => {
    const at = () => page.evaluate(() => {
      const n = document.getElementById('world-near');
      const last = n.lastElementChild?.getBoundingClientRect(), b = n.getBoundingClientRect();
      return { top: n.scrollTop, over: n.scrollHeight - n.clientHeight, more: n.classList.contains('more'), lastWhole: !!last && last.bottom <= b.bottom + 1 };
    });
    await page.evaluate(() => { const n = document.getElementById('world-near'); n.scrollTop = 0; n.focus(); });
    const start = await until(async () => { const a = await at(); return a.more === a.over > 1 ? a : null; }, 5000, 200);
    const first = start || await at();
    if (first.over <= 1) { check(`${w}: the list fits its place, and its foot is not veiled`, !first.more, JSON.stringify(first)); return false; }
    check(`${w}: more below than its place shows: the foot is veiled`, first.more === true, JSON.stringify(first));
    await page.keyboard.press('ArrowDown');
    check(`${w}: the arrow scrolls the focused list, not the camera`, !!await until(async () => (await at()).top > 0, 5000, 200));
    // (a beat still in flight can land a hail or a way meanwhile, and the
    // list grows under the scroll: End is pressed again for the new end)
    let end = null;
    for (let i = 0; i < 3 && !end; i++) {
      await page.keyboard.press('End');
      end = await until(async () => { const a = await at(); return a.top >= a.over - 1 && !a.more ? a : null; }, 4000, 200);
    }
    check(`${w}: scrolled to its end, the veil lifts and the last row stands whole`, !!end?.lastWhole, JSON.stringify(end || await at()));
    await page.keyboard.press('Home');
    check(`${w}: back at its top, the veil returns`, !!await until(async () => { const a = await at(); return a.top === 0 && a.more; }, 5000, 200));
    await page.evaluate(() => document.getElementById('world-near').blur());
    return true;
  };
  const meets = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const inside = (a, room) => !!a && !!room && a.l >= room.l && a.r <= room.r && a.t >= room.t && a.b <= room.b;
  const clear = (what, a, v, skip = []) => {
    const rails = v.rail.filter((b) => meets(a, b)).map((b) => b.id);
    check(`${v.w}: ${what} lies under no rail button`, rails.length === 0, `${JSON.stringify(a)} under ${rails.join(', ')}`);
    check(`${v.w}: ${what} stands inside the room`, inside(a, v.room), `${JSON.stringify(a)} in ${JSON.stringify(v.room)}`);
    const over = Object.entries(v.things).filter(([k, b]) => !skip.includes(k) && meets(a, b)).map(([k]) => k);
    check(`${v.w}: ${what} covers nothing else in the room`, over.length === 0, `${JSON.stringify(a)} over ${over.join(', ')}`);
  };
  // After a resize the frame slides to its new insets (0.42s) and the rails
  // pour again at the new size, and on this machine a slide can stand at its
  // first frame for seconds while the world draws at the new size; the list
  // moves again when the map opens. So the screen is looked at once the hole
  // and its grips have stopped sliding and the list and map have held still.
  const settled = async () => {
    let last = '';
    return await until(async () => {
      const sliding = await page.evaluate(() => ['#nav-hole', '.nav-collapse', '.nav-collapse-right', '.nav-collapse-top', '.nav-collapse-bottom']
        .some((s) => document.querySelector(s)?.getAnimations().length));
      const now = await look(), key = JSON.stringify([now.room, now.things.gripRight, now.near, now.map]);
      const still = !sliding && key === last;
      last = key;
      return still ? now : null;
    }, 60000, 1500) || look();
  };
  // the map is still open from the shot above; it is looked at closed first
  await mapTo(false);
  // what the bar says while the list waits: the hails and the ways it holds
  const counted = (t) => /^\d+ hails? · \d+ ways?$/.test(t || '');
  // Wherever the count shows, a finger has to reach it: the topmost thing at
  // its centre is the count itself. On a portrait phone it wrapped to a row
  // under the firsts card, and its own click() pressed it all the same (found
  // in review, 2026-10-09). So it is pressed where a finger lands: the hit
  // test and the click are one task in the page, and the bar cannot shift
  // between them (see press above).
  const reachable = (w, v, when) => {
    if (v?.chip) check(`${w}: ${when}, a finger on the count lands on it`, v.hitChip === true, `${v.hitChip} over ${JSON.stringify(v.chip)}`);
  };
  const pressChip = async (w, shown) => {
    const hit = await page.evaluate(() => {
      const chip = document.getElementById('world-nearchip');
      if (!chip || chip.hidden) return 'no count in the bar';
      const r = chip.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (t !== chip) return `${t?.tagName}.${t?.className}`;
      t.click();
      return true;
    });
    check(`${w}: a finger presses the count`, hit === true, String(hit));
    if (hit !== true) return null;
    return until(async () => { const v = await look(); return !!v.near === shown ? v : null; }, 10000, 300);
  };
  // the firsts card hangs under the bar wherever the bar ends (--bar-b)
  const cardClear = (w, v, when) => check(`${w}: ${when}, the firsts card hangs clear of the bar`,
    !meets(v.things.bar, v.things.firsts), JSON.stringify({ bar: v.things.bar, firsts: v.things.firsts }));
  let scrolled = 0;
  // (an 844x390 phone held sideways has no place for the list beside the
  // open firsts card: there the bar carries its count)
  for (const [w, h, name] of [[1280, 800, '4-side-1280'], [1024, 768, '5-side-1024'], [390, 844, '6-side-phone'], [844, 390, '7-side-sideways']]) {
    await page.setViewportSize({ width: w, height: h });
    // A phone held sideways is a touch device, and a touch device folds the
    // hands to their toggle (world-panel.js). Unfolded, with a mouse, at this
    // height they stand over the bar's second row, its count and the map.
    if (w === 844) await page.evaluate(() => { if (!document.querySelector('.hands-body')?.hidden) document.querySelector('.hands-toggle')?.click(); });
    const v = await settled();
    if (w !== 844) {
      check(`${w}: the list is drawn`, !!v.near && v.rows.length > 0, JSON.stringify(v.near));
      check(`${w}: and the bar carries no count`, !v.chip, JSON.stringify(v.chip));
    } else {
      check(`${w}: the list waits`, !v.near, JSON.stringify(v.near));
      check(`${w}: and the bar says what it holds`, !!v.chip && counted(v.chip.text), JSON.stringify(v.chip));
      await shot(name + '-waits');
      // pressed, the count shows the list over the firsts card
      const a = await pressChip(w, true);
      check(`${w}: pressed, the count shows the list over the firsts card`, !!a?.near && a.over && a.chip?.on === true, JSON.stringify(a && { near: a.near, over: a.over, chip: a.chip }));
      if (a?.near) {
        clear('the list asked for', a.near, a, ['firsts']);
        check(`${w}: a press on the list lands on it`, a.hitRow === true);
        // the place with the most room, not the highest: the strip under the
        // bar held "no other society within sight" and nothing that was asked
        // for (found in review, 2026-10-09)
        check(`${w}: asked for, the list has room for what was asked`, a.near.b - a.near.t >= 96, JSON.stringify(a.near));
        reachable(w, a, 'with the list shown');
      }
      await shot(name + '-asked');
      check(`${w}: pressed again, it waits again`, !!await pressChip(w, false));
    }
    reachable(w, v, 'the map shut');
    cardClear(w, v, 'the map shut');
    if (v.near) {
      clear('the list', v.near, v);
      check(`${w}: a press on the list lands on it`, v.hitRow === true);
      const b = await beside();
      check(`${w}: a press beside the ways' label reaches the ground`, b.tag === 'CANVAS', JSON.stringify(b));
      if (await scrolls(w)) scrolled++;
    }
    await shot(name);
    check(`${w}: the map opens`, await mapTo(true) === true);
    const m = await settled();
    if (m.map) {
      // where nothing else is free the map lies over the firsts card, which
      // is a thing you asked for doing what you asked; never over the rest
      clear('the open map', m.map, m, ['firsts']);
      check(`${w}: a press on the map lands on it`, m.hitMap === true);
    }
    if (m.near && m.map) check(`${w}: the list yields to the open map`, !meets(m.near, m.map), JSON.stringify({ near: m.near, map: m.map }));
    await shot(name + '-map');
    reachable(w, m, 'the map open');
    cardClear(w, m, 'the map open');
    if (!m.near) {
      // where neither has a place of its own, the one asked for last is shown
      check(`${w}: with the map open the bar says what the list holds`, !!m.chip && counted(m.chip.text), JSON.stringify(m.chip));
      const a = m.chip ? await pressChip(w, true) : null;
      check(`${w}: pressed, the count closes the map and shows the list`, !!a?.near && !a.map, JSON.stringify(a && { near: a.near, map: a.map }));
      if (a?.near) clear('the list asked for', a.near, a, a.over ? ['firsts'] : []);
      if (a?.over) await pressChip(w, false);
    }
    await mapTo(false);
    if (w === 390) {
      // The firsts card opened to "all" fills a portrait phone's room: the
      // list waits, and its count has to stand where a finger reaches it, not
      // under the card (found in review, 2026-10-09).
      await page.evaluate(() => document.querySelector('.firsts-more[data-size="wide"]')?.click());
      await until(async () => (await look()).cardSize === 'wide', 10000, 300);
      const all = await settled();
      check(`${w}: the firsts card opens to "all"`, all.cardSize === 'wide', all.cardSize);
      check(`${w}: with the card open to "all" the list waits`, !all.near, JSON.stringify(all.near));
      check(`${w}: and the bar says what it holds`, !!all.chip && counted(all.chip.text), JSON.stringify(all.chip));
      reachable(w, all, 'the card open to "all"');
      cardClear(w, all, 'the card open to "all"');
      await shot(name + '-all');
      const a = await pressChip(w, true);
      check(`${w}: pressed, the count shows the list over the card open to "all"`, !!a?.near && a.over && a.chip?.on === true, JSON.stringify(a && { near: a.near, over: a.over, chip: a.chip }));
      if (a?.near) {
        clear('the list asked for', a.near, a, ['firsts']);
        check(`${w}: a press on the list lands on it`, a.hitRow === true);
        reachable(w, a, 'with the list shown over the card');
      }
      await shot(name + '-all-asked');
      check(`${w}: pressed again, it waits again`, !!await pressChip(w, false));
      await page.evaluate(() => document.querySelector('.firsts-more[data-size="open"]')?.click());
      check(`${w}: the card goes back to the next two`, !!await until(async () => (await look()).cardSize === 'open', 10000, 300));
    }
  }
  check('the list scrolled past its place at one size at least', scrolled > 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.log('  ✗ the smoke stopped:', e.message);
  await shot('x-failure').catch(() => {});
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
console.log(failures ? `\n${failures} failed.` : '\nall good.');
process.exit(failures ? 1 : 0);
