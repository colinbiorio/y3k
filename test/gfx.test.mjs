// HOW MUCH ROOM THIS MACHINE CAN AFFORD. Run: node test/gfx.test.mjs
//
// The governor is pure — frame intervals in, a tier out — so it can be held to
// what it actually decides rather than to a person waving at a camera for four
// seconds. Which matters here more than usual: the failure mode of a thing like
// this is not a crash, it is a room that quietly pulses between two looks, or
// one that decides a machine is slow because a garbage collection happened.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createGfx, TIERS, PROFILES } from '../src/gfx.js';
import { stats as paceStats } from '../src/pace.js';

const ROOT = new URL('..', import.meta.url);
const css = readFileSync(new URL('styles.css', ROOT), 'utf8');
const bodySrc = readFileSync(new URL('src/body.js', ROOT), 'utf8');
const bootSrc = readFileSync(new URL('src/boot-gfx.js', ROOT), 'utf8');
const html = readFileSync(new URL('index.html', ROOT), 'utf8');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// `mem` can be handed in to play a second page load over the same storage.
const rig = ({ mem = {}, search = '' } = {}) => {
  const el = { dataset: {} };
  let bloom = true;
  const orb = [], liquid = [];
  const g = createGfx({
    body: { setBloom: (o) => { bloom = o; }, setQuality: (p) => orb.push(p) },
    mercury: { setQuality: (p) => liquid.push(p) },
    root: el,
    search,
    storage: {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
    },
  });
  return { g, el, mem, bloom: () => bloom, orb, liquid };
};
const frames = (ms, n = 60) => Array.from({ length: n }, () => ms);
const SLOW = frames(33.3), FAST = frames(16.7);
// THE GLITCH, as numbers: a median that is a single vsync, and one frame in
// ten a 100ms stall — what mercury-buttons.js recorded on the founder's machine.
const HITCHY = [...frames(16.7, 54), ...frames(100, 6)];
const DAY = 24 * 3600 * 1000;

console.log('\nthe governor:');

ok('a first visit does not start at the top', () => {
  // Measured on an Apple Silicon Mac — near the fast end of what anyone will
  // bring — "high" holds 27.5 fps with a median frame of two vsyncs. If the
  // best case cannot hold sixty at the top tier, the top tier is a preference
  // and not a default.
  const { g, el } = rig();
  g.start();
  assert.notEqual(g.tier(), 'high', 'a first-time visitor is dropped straight into thirty frames a second');
  assert.equal(el.dataset.gfx, g.tier(), 'the tier is not written where the stylesheet can see it');
  g.stop();
});

ok('it steps down on frames a person can see, and not before', () => {
  const { g } = rig();
  g.start();
  const was = g.tier();
  g._feed(SLOW, 20000);
  assert.equal(g.tier(), was, 'one bad window is enough — a garbage collection would restyle the room');
  g._feed(SLOW, 30000);
  assert.notEqual(g.tier(), was, 'it never steps down, however bad it gets');
  g.stop();
});

ok('a median of two vsyncs counts as slow', () => {
  // THE THRESHOLD IS NOT 33ms, and this is the trap. Frame times quantise to
  // vsync multiples: "high" measured 33.3ms and "mid" 31.9ms, which are both
  // simply two frames. A 33ms floor steps down exactly once, lands on the other
  // side of the same coin, and declares victory at thirty frames a second.
  const { g } = rig();
  g.start();
  g._feed(frames(31.9), 20000); g._feed(frames(31.9), 30000);
  assert.equal(g.tier(), 'low', 'a 31.9ms median passed as smooth — the threshold is on a vsync boundary');
  g.stop();
});

ok('it NEVER climbs back on its own', () => {
  // The oscillation: drop a tier, the frame rate recovers BECAUSE of the drop,
  // restore it, the frame rate falls again — and the room pulses forever.
  const { g } = rig();
  g.start();
  g._feed(SLOW, 20000); g._feed(SLOW, 30000);
  const dropped = g.tier();
  for (let t = 40000; t < 120000; t += 10000) g._feed(FAST, t);
  assert.equal(g.tier(), dropped, 'it climbed back — the room will pulse between two looks');
  g.stop();
});

ok('it stops at the bottom rather than running off the end', () => {
  const { g } = rig();
  g.start();
  for (let t = 20000; t < 200000; t += 10000) g._feed(SLOW, t);
  assert.equal(g.tier(), TIERS[TIERS.length - 1], 'it did not reach the bottom tier');
  assert.ok(TIERS.includes(g.tier()), 'it walked off the end of the tier list');
  g.stop();
});

ok('the bottom tier is the one that turns the bloom off', () => {
  // Because the bloom is not a stylesheet, and a tier that only changed CSS
  // would leave the second-largest cost on the page running.
  const { g, bloom } = rig();
  g.start();
  assert.equal(bloom(), true, 'the glow is off at the default tier');
  g.set('low');
  assert.equal(bloom(), false, 'the lightest tier still renders the bloom chain');
  g.set('mid');
  assert.equal(bloom(), true, 'the glow never comes back');
  g.stop();
});

ok('startup is not judged', () => {
  // The mercury bake alone is 1.5s, and the first frames of any WebGL page are
  // the worst it will ever be. Judging those would step every machine down.
  const { g } = rig();
  g.start();
  const was = g.tier();
  g._feed(SLOW, 100); g._feed(SLOW, 2000); g._feed(SLOW, 4000);
  assert.equal(g.tier(), was, 'the first seconds are judged — every machine gets demoted at boot');
  g.stop();
});

ok('a thin window is not evidence', () => {
  // Four seconds that produced six frames says the tab was hidden, not that
  // the machine is slow.
  const { g } = rig();
  g.start();
  const was = g.tier();
  g._feed(frames(33.3, 6), 20000); g._feed(frames(33.3, 6), 30000);
  assert.equal(g.tier(), was, 'a handful of frames was taken as a verdict');
  g.stop();
});

ok('a person outranks the meter, in both directions', () => {
  const { g, bloom } = rig();
  g.start();
  g.set('high');
  assert.equal(g.auto(), false);
  g._feed(SLOW, 20000); g._feed(SLOW, 30000); g._feed(SLOW, 40000);
  assert.equal(g.tier(), 'high', 'the meter overrode a choice');
  assert.equal(bloom(), true, 'the chosen tier was not actually applied');
  g.set(null);
  assert.equal(g.auto(), true, 'there is no way to hand it back');
  g.stop();
});

ok('what a slow machine learned is the next visit starting point', () => {
  const { g, mem } = rig();
  g.start();
  g._feed(SLOW, 20000); g._feed(SLOW, 30000);
  assert.equal(mem['y3k.gfx'], g.tier(), 'the decision is forgotten on reload');
  g.stop();
});

ok('a browser that refuses storage does not take the room with it', () => {
  // A private window throws on setItem rather than returning false.
  const el = { dataset: {} };
  const g = createGfx({
    body: {}, root: el,
    storage: { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); } },
  });
  g.start();
  g._feed(SLOW, 20000); g._feed(SLOW, 30000);
  assert.ok(TIERS.includes(g.tier()), 'a storage error broke the governor');
  g.stop();
});

ok('smooth is the floor, and the meter can reach it', () => {
  // Appended, not inserted: the default must still step through 'low' first.
  assert.deepEqual(TIERS, ['high', 'mid', 'low', 'smooth']);
  const { g } = rig();
  g.start();
  assert.equal(g.tier(), 'mid', 'the first visit moved off mid');
  g._feed(SLOW, 20000); g._feed(SLOW, 30000);
  assert.equal(g.tier(), 'low');
  g._feed(SLOW, 40000); g._feed(SLOW, 50000);
  assert.equal(g.tier(), 'smooth', 'the automatic floor is not smooth');
  g.stop();
});

ok('a median of three vsyncs goes straight to the floor', () => {
  // Nobody should sit through another eight bad seconds on 'low' when the
  // median is already three frames long.
  const { g } = rig();
  g.start();
  g._feed(frames(50), 20000); g._feed(frames(50), 30000);
  assert.equal(g.tier(), 'smooth', 'it stepped one tier at a time from a 50ms median');
  g.stop();
});

ok('hitching counts even when the median is fine', () => {
  const { g } = rig();
  g.start();
  g._feed(HITCHY, 20000); g._feed(HITCHY, 30000);
  assert.equal(g.tier(), 'low', 'a 16.7ms median with 100ms stalls was judged smooth');
  assert.ok(g.state().last.late >= 0.1, 'the late share is not on the record');
});

ok('one freeze in each of two windows counts; clean windows do not', () => {
  const a = rig();
  a.g.start();
  a.g._feed(FAST, 20000, { stalls: 1 }); a.g._feed(FAST, 30000, { stalls: 1 });
  assert.equal(a.g.tier(), 'low', 'quarter-second freezes are invisible to it');
  const b = rig();
  b.g.start();
  b.g._feed(FAST, 20000); b.g._feed(FAST, 30000);
  assert.equal(b.g.tier(), 'mid', 'it stepped down on clean frames');
});

ok('an even thirty is judged against its own slot, not as a missed sixty', () => {
  const { g } = rig();
  g.start();
  for (let t = 20000; t < 80000; t += 10000) g._feed(frames(33.4), t, { slotMs: 33.4 });
  assert.equal(g.tier(), 'mid', 'a locked thirty read as a machine missing every other frame');
});

ok('a manual choice survives a reload, as a choice', () => {
  const first = rig();
  first.g.start();
  first.g.set('high');
  first.g.stop();
  const second = rig({ mem: first.mem });
  second.g.start();
  assert.equal(second.g.tier(), 'high', 'the choice was forgotten on reload');
  assert.equal(second.g.auto(), false, 'the choice came back as a guess the meter may overrule');
  second.g._feed(SLOW, 20000); second.g._feed(SLOW, 30000);
  assert.equal(second.g.tier(), 'high', 'the meter overrode a remembered choice');
  // Automatic again hands back the LEARNED tier, not whatever was last chosen.
  second.g.set(null);
  assert.equal(second.mem['y3k.gfx.mode'], 'auto');
  assert.equal(second.g.tier(), 'mid');
  const third = rig({ mem: second.mem });
  third.g.start();
  assert.equal(third.g.auto(), true);
});

ok('a lesson a week old is tried one tier higher; a fresh one is kept', () => {
  const stale = rig({ mem: { 'y3k.gfx': 'smooth', 'y3k.gfx.at': String(Date.now() - 8 * DAY) } });
  stale.g.start();
  assert.equal(stale.g.tier(), 'low', 'an old lesson is a life sentence');
  const fresh = rig({ mem: { 'y3k.gfx': 'smooth', 'y3k.gfx.at': String(Date.now() - DAY) } });
  fresh.g.start();
  assert.equal(fresh.g.tier(), 'smooth', 'yesterday’s lesson was thrown away');
  // Never ABOVE the first-visit start: an old lesson is re-tested, not promoted.
  const top = rig({ mem: { 'y3k.gfx': 'mid', 'y3k.gfx.at': String(Date.now() - 30 * DAY) } });
  top.g.start();
  assert.equal(top.g.tier(), 'mid');
});

ok('?gfx= forces a tier for one page load and is never stored', () => {
  const { g, mem } = rig({ search: '?perf&gfx=smooth' });
  g.start();
  assert.equal(g.tier(), 'smooth');
  assert.equal(g.auto(), false);
  assert.equal(mem['y3k.gfx.mode'], undefined, 'a URL override was written down');
  assert.equal(mem['y3k.gfx'], undefined);
  g._feed(SLOW, 20000); g._feed(SLOW, 30000);
  assert.equal(g.tier(), 'smooth', 'the meter moved a forced tier');
});

ok('every sink gets the whole profile, and every tier means what the contract says', () => {
  const { g, el, orb, liquid } = rig();
  const heard = [];
  g.onChange((p) => heard.push(p));
  g.start();
  const FIELDS = ['tier', 'manual', 'bloom', 'blur', 'fps', 'scale', 'maxDpr', 'liquid', 'detail', 'motion'];
  for (const p of [orb.at(-1), liquid.at(-1), g.profile()]) assert.deepEqual(Object.keys(p).sort(), FIELDS.slice().sort());
  assert.deepEqual(orb.at(-1), liquid.at(-1), 'the orb and the liquid were told different things');
  assert.equal(heard.length, 1, 'a listener missed the first profile');
  for (const tier of TIERS) {
    g.set(tier);
    const p = g.profile();
    assert.equal(p.tier, tier); assert.equal(p.manual, true);
    assert.equal(el.dataset.gfx, tier); assert.equal(el.dataset.motion, p.motion); assert.equal(el.dataset.glass, p.blur);
    assert.deepEqual(orb.at(-1), p); assert.deepEqual(liquid.at(-1), p); assert.deepEqual(heard.at(-1), p);
  }
  assert.equal(PROFILES.high.fps, 0, 'the top tier is not at the display’s own rate');
  assert.equal(PROFILES.low.bloom, false); assert.equal(PROFILES.low.blur, 'none'); assert.equal(PROFILES.low.liquid, 'still');
  assert.deepEqual(
    [PROFILES.smooth.bloom, PROFILES.smooth.blur, PROFILES.smooth.liquid, PROFILES.smooth.detail, PROFILES.smooth.motion],
    [false, 'none', 'still', 'lite', 'less'], 'smooth is not the whole list');
  // The pacer is a sink too.
  g.set('smooth'); g.setFine({ fps: 30 });
  assert.equal(paceStats().fpsTarget, 30, 'the frame-rate ceiling never reached the pacer');
  g.setFine(null); g.set('high');
  assert.equal(paceStats().fpsTarget, 0);
  // No change, no call: a resolution change is a reallocation.
  const n = orb.length;
  g.set('high');
  assert.equal(orb.length, n, 'an unchanged profile was handed out again');
  g.stop();
});

ok('a sink that has not learned setQuality is skipped, not fatal', () => {
  const el = { dataset: {} };
  const g = createGfx({ body: {}, mercury: {}, root: el, storage: null });
  g.start();
  g.set('smooth');
  assert.equal(el.dataset.gfx, 'smooth');
  g.stop();
});

ok('a hold pauses the judge, and a release gives it time to settle', () => {
  const { g } = rig();
  g.start();
  const release = g.hold('building');
  g._feed(SLOW, 20000); g._feed(SLOW, 30000); g._feed(SLOW, 40000);
  assert.equal(g.tier(), 'mid', 'it judged frames it was asked not to');
  assert.deepEqual(g.state().held, ['building']);
  g._feed(SLOW, 50000);   // one bad window while held...
  release(); release();   // (twice is harmless)
  g._feed(SLOW, 60000);   // ...and one after: not two IN A ROW
  assert.equal(g.tier(), 'mid', 'windows either side of a hold were counted as consecutive');
  g._feed(SLOW, 70000);
  assert.equal(g.tier(), 'low', 'the judge never came back after the release');
});

ok('fine-tune overrides merge over the tier, persist, and junk is ignored', () => {
  const mem = { 'y3k.gfx.fine': JSON.stringify({ bloom: false, fps: 30, scale: 0.3, liquid: 'lava', evil: 1 }) };
  const { g, orb } = rig({ mem });
  g.start();
  const p = g.profile();
  assert.equal(p.tier, 'mid');
  assert.equal(p.bloom, false, 'a stored override was not merged');
  assert.equal(p.fps, 30);
  assert.equal(p.scale, 1, 'an out-of-range value reached a sink');
  assert.equal(p.liquid, 'flow');
  assert.ok(!('evil' in p));
  assert.equal(orb.at(-1).bloom, false, 'the orb was told the tier, not the override');
  g.setFine({ blur: 'none', bloom: null });
  assert.equal(g.profile().bloom, true, 'clearing one field did not hand it back to the tier');
  assert.equal(g.profile().blur, 'none');
  assert.deepEqual(JSON.parse(mem['y3k.gfx.fine']), { fps: 30, blur: 'none' });
  // Choosing a mode is a whole preset: it starts the fine-tuning over.
  g.set('smooth', { fine: null });
  assert.equal(mem['y3k.gfx.fine'], undefined);
  assert.equal(g.profile().fps, 60);
});

ok('smooth goes to an even thirty, then fewer pixels, and never back', () => {
  const { g } = rig();
  g.start();
  g.set('smooth');
  const seen = [];
  for (let t = 20000; t < 90000; t += 10000) {
    g._feed(HITCHY, t, { slotMs: 1000 / g.profile().fps });
    seen.push(`${g.profile().fps}@${g.profile().scale}`);
  }
  assert.equal(g.profile().fps, 30, 'smooth never tried an even thirty');
  assert.equal(g.profile().scale, 0.5, 'smooth never took pixels away');
  assert.ok(seen.indexOf('30@1') < seen.indexOf('30@0.75'), 'fewer pixels came before the even thirty: ' + seen.join(' '));
  for (let t = 90000; t < 150000; t += 10000) g._feed(FAST, t);
  assert.equal(g.profile().scale, 0.5, 'it climbed back — the look would pulse');
  // A person's own frame-rate pin is theirs: the ladder does not touch it.
  const pinned = rig();
  pinned.g.start(); pinned.g.set('smooth'); pinned.g.setFine({ fps: 60 });
  pinned.g._feed(HITCHY, 20000); pinned.g._feed(HITCHY, 30000);
  assert.equal(pinned.g.profile().fps, 60, 'the ladder overrode a pinned frame rate');
  assert.equal(pinned.g.profile().scale, 0.75);
});

ok('the page before main.js runs agrees with gfx.js (boot-gfx.js)', () => {
  // Run the classic <head> script over the same storage gfx.start() reads,
  // and compare the three attributes it writes before the first paint.
  const boot = (mem, search = '') => {
    const attrs = {};
    const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
    const window = { localStorage: { getItem: (k) => (k in mem ? mem[k] : null) } };
    vm.runInNewContext(bootSrc, { document, window, location: { search }, Date, JSON, Number });
    return attrs;
  };
  const cases = [
    [{}, ''],
    [{ 'y3k.gfx': 'low', 'y3k.gfx.at': String(Date.now()) }, ''],
    [{ 'y3k.gfx': 'smooth', 'y3k.gfx.at': String(Date.now() - 9 * DAY) }, ''],
    [{ 'y3k.gfx': 'smooth', 'y3k.gfx.at': String(Date.now()) }, ''],
    [{ 'y3k.gfx': 'low', 'y3k.gfx.mode': 'high' }, ''],
    [{ 'y3k.gfx.mode': 'smooth', 'y3k.gfx.fine': JSON.stringify({ blur: 'small', motion: 'full' }) }, ''],
    [{ 'y3k.gfx.mode': 'high', 'y3k.gfx.fine': '{not json' }, ''],
    [{ 'y3k.gfx.mode': 'mid' }, '?gfx=smooth'],
    [{ 'y3k.gfx': 'nonsense', 'y3k.gfx.mode': 'nonsense' }, ''],
  ];
  for (const [mem, search] of cases) {
    const early = boot({ ...mem }, search);
    const { g, el } = rig({ mem: { ...mem }, search });
    g.start();
    const label = JSON.stringify(mem) + search;
    assert.equal(early['data-gfx'], el.dataset.gfx, 'boot-gfx picked another tier for ' + label);
    assert.equal(early['data-glass'], el.dataset.glass, 'boot-gfx picked other glass for ' + label);
    assert.equal(early['data-motion'], el.dataset.motion, 'boot-gfx picked other motion for ' + label);
    g.stop();
  }
  // Loaded where it can run before the body is parsed: a classic, external
  // script in <head> (inline scripts are allowed only by hash).
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(/<script src="src\/boot-gfx\.js"><\/script>/.test(head), 'boot-gfx.js is not a plain <script> in <head>');
  assert.ok(!/boot-gfx\.js"[^>]*\b(defer|async|type="module")/.test(head), 'boot-gfx.js waits for the parse it is meant to beat');
});

{
  // One switch for the stylesheet and the scripts: Smooth, Motion: less and
  // the OS preference all land on <html data-motion>, and the springs ask
  // reducedMotion(). Without a document it still answers (the OS query only).
  const { reducedMotion } = await import('../src/motion.js');
  ok('less motion reaches the scripts too (motion.js reducedMotion)', () => {
    assert.equal(reducedMotion(), false);
    globalThis.document = { documentElement: { dataset: { motion: 'less' } } };
    try {
      assert.equal(reducedMotion(), true, 'Smooth or Motion: less still springs');
      globalThis.document.documentElement.dataset.motion = 'full';
      assert.equal(reducedMotion(), false);
    } finally { delete globalThis.document; }
  });
}

console.log('\nwhat a tier actually switches:');

// The blur rules key on data-glass, not the tier, so Settings → Graphics →
// Glass can turn the glass back on in Smooth (or off in Everything). Each tier
// names its glass in PROFILES; these checks hold each tier's glass to its rules.
// THE RULES THEMSELVES, not everything between two anchors. A slice that ends
// at the next tier's name happens to work only while nothing is ever added in
// between; the `low` check below was sliced to the END OF THE FILE, and the
// first unrelated rule appended after it — a button with `background: none` —
// failed it. Fourth time in this repo that an unbounded slice has lied.
const rulesFor = (attr, value) =>
  (css.match(new RegExp(':root\\[data-' + attr + '="' + value + '"\\][^{]*\\{[^}]*\\}', 'g')) || []).join('\n');
const CODE_AT = css.indexOf('/* ===== y3k CODE');
const cssNoComments = (css.slice(0, CODE_AT > 0 ? CODE_AT : css.length)).replace(/\/\*[\s\S]*?\*\//g, '');

ok('mid drops the viewport-scale blurs and nothing else', () => {
  // The standing rule is that every text box wears the nav-bar frost. A tier
  // that quietly took that away would be deleting the app's material and
  // calling it an optimization.
  assert.equal(PROFILES.mid.blur, 'small');
  const mid = rulesFor('glass', PROFILES.mid.blur);
  assert.ok(mid.length > 0, 'the mid tier has no rules at all — every check below would pass on an empty string');
  for (const sel of ['#home', '#nav-sheet', '.chat-menu::before', '.modal']) {
    assert.ok(mid.includes(sel), `mid no longer drops ${sel}, which is a full-viewport blur`);
  }
  assert.ok(/backdrop-filter: none !important/.test(mid));
  assert.ok(!/\.field|\.sheet|\.login-card/.test(mid), 'mid is taking the frost off the small things too');
});

ok('low takes the live blur and leaves the material', () => {
  assert.equal(PROFILES.low.blur, 'none');
  assert.equal(PROFILES.smooth.blur, 'none');
  const low = rulesFor('glass', PROFILES.low.blur);
  assert.ok(low.length > 0, 'the lightest tier has no rules at all — every check below would pass on an empty string');
  assert.ok(/backdrop-filter: none !important/.test(low), 'the lightest tier still blurs');
  assert.ok(!/--frost-grain: none|background: none/.test(low),
    'the lightest tier is stripping the grain and gradients — it is the live blur that costs, not the material');
  // The chat stadium's frost is on a ::before. `*` alone never matched it.
  for (const sel of ['*', '*::before', '*::after']) {
    assert.ok(new RegExp(':root\\[data-glass="none"\\] ' + sel.replace(/[*]/g, '\\*') + '\\s*[,{]').test(css),
      `glass:none does not reach ${sel}`);
  }
});

ok('smooth: solid panes, grain kept, no blur filters, no loops', () => {
  const smooth = rulesFor('gfx', 'smooth');
  assert.ok(smooth.length > 0, 'smooth has no rules');
  const swap = (css.match(/:root\[data-gfx="smooth"\]\[data-glass="none"\] \{[^}]*\}/) || [''])[0];
  for (const v of ['--frost-rail', '--frost-body', '--frost-body-xl']) assert.ok(swap.includes(v), `smooth does not swap ${v}`);
  assert.ok(!/--frost-grain/.test(swap), 'smooth took the grain away — it is a static raster and costs nothing per frame');
  assert.ok(!/(^|[^-])filter:[^;}]*blur\(/.test(smooth), 'smooth brings a blur filter back');
  assert.ok(!/infinite/.test(smooth), 'smooth starts a loop');
  assert.ok(/\.portal-view \{ display: none; \}/.test(smooth), 'smooth still draws the portal\u2019s far side');
  // The frame snaps: no layout property transitions on the frame in smooth.
  assert.ok(/:root\[data-gfx="smooth"\] :is\([^)]*#nav-sheet[^)]*#nav-hole[^)]*\) \{ transition: none; \}/.test(css),
    'smooth still animates the frame\u2019s geometry');
  assert.ok(!/transition:[^;}]*\b(left|right|top|bottom|height|width|clip-path)\b/.test(smooth),
    'a smooth rule animates layout');
});

ok('less motion is ONE list, and it holds every loop', () => {
  // data-motion="less" is written for Smooth, for Motion: less, and whenever
  // the OS asks for reduced motion, so this list is the single place decorative
  // loops stop. Any infinite animation outside the Code block (which honours
  // the attribute itself) that is not named in it is a loop Smooth forgot.
  const less = rulesFor('motion', 'less');
  const named = new Set((css.match(/:root\[data-motion="less"\] [^,{]+/g) || []).map((x) => x.replace(/^:root\[data-motion="less"\] /, '').trim()));
  const loops = [];
  for (const m of cssNoComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\binfinite\b/.test(m[2]) || /:root\[data-/.test(m[1])) continue;
    for (const sel of m[1].split(',')) loops.push(sel.trim().replace(/\s+/g, ' '));
  }
  assert.ok(loops.length >= 10, 'the loop scan found almost nothing — it is not reading the stylesheet');
  for (const sel of loops) assert.ok(named.has(sel), `the loop on "${sel}" keeps running with less motion`);
  assert.ok(/animation: none/.test(less));
});

ok('hidden frost is retired, not merely transparent', () => {
  // opacity:0 does NOT retire a backdrop-filter: the compositor goes on
  // re-reading and re-blurring the whole viewport underneath to produce
  // something nobody can see. visibility DOES.
  assert.ok(/#home \{[\s\S]*?visibility: hidden;/.test(css), '#home blurs the viewport while invisible again');
  assert.ok(/body\.in-home\.panel-open:not\(\.gated\) #home \{\s*\n?\s*visibility: visible/.test(css),
    'the panel can never become visible');
  assert.ok(/body:not\(\.nav-collapsed-bottom\) \.chat-menu::before \{ visibility: hidden; \}/.test(css),
    'the chat stadium blurs while invisible');
  assert.ok(/\.budget-pop \{ visibility: hidden; \}/.test(css), 'the budget pop blurs while invisible');
  // The comment column holds a frosted field and a blur per line, and is
  // invisible nearly always.
  assert.ok(/#comments \{[^}]*visibility: hidden;/.test(css), 'the comment column blurs while invisible');
  assert.ok(/body\.streaming:not\(\.in-home\) #comments \{ visibility: visible;/.test(css), 'the comment column can never show');
  // and the fade has to survive: visibility must be delayed by its length
  assert.ok(/transition: opacity 0\.4s ease, visibility 0s linear 0\.4s/.test(css),
    '#home now vanishes instead of fading');
});

ok('the bloom is one switchable call the brand layer can still bracket', () => {
  assert.ok(/setBloom\(on\) \{ bloomOn = Boolean\(on\); \}/.test(bodySrc), 'the bloom cannot be switched');
  assert.ok(/const draw = \(\) => \{ if \(bloomOn\) composer\.render\(\); else renderer\.render\(scene, camera\); \};/.test(bodySrc),
    'the render is not one call — a bracket around one branch drops the mark on the other');
  assert.ok(/brandLayer\.before\(\);\s*draw\(\);/.test(bodySrc), 'the brand layer no longer brackets the render');
  const decl = bodySrc.indexOf('let bloomOn = true;');
  assert.ok(decl > 0 && decl < bodySrc.indexOf('const draw = () =>'),
    'bloomOn is declared below its earliest reader — the TDZ rule, for the seventh time');
});

console.log(`\n${passed} checks passed.`);
