// HOW MUCH ROOM THIS MACHINE CAN AFFORD. Run: node test/gfx.test.mjs
//
// The governor is pure — frame intervals in, a tier out — so it can be held to
// what it actually decides rather than to a person waving at a camera for four
// seconds. Which matters here more than usual: the failure mode of a thing like
// this is not a crash, it is a room that quietly pulses between two looks, or
// one that decides a machine is slow because a garbage collection happened.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createGfx, TIERS } from '../src/gfx.js';

const ROOT = new URL('..', import.meta.url);
const css = readFileSync(new URL('styles.css', ROOT), 'utf8');
const bodySrc = readFileSync(new URL('src/body.js', ROOT), 'utf8');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const rig = () => {
  const el = { dataset: {} };
  const mem = {};
  let bloom = true;
  const g = createGfx({
    body: { setBloom: (o) => { bloom = o; } },
    root: el,
    storage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } },
  });
  return { g, el, mem, bloom: () => bloom };
};
const frames = (ms, n = 60) => Array.from({ length: n }, () => ms);
const SLOW = frames(33.3), FAST = frames(16.7);

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

console.log('\nwhat a tier actually switches:');

ok('mid drops the three viewport-scale blurs and nothing else', () => {
  // The standing rule is that every text box wears the nav-bar frost. A tier
  // that quietly took that away would be deleting the app's material and
  // calling it an optimization.
  // THE RULES THEMSELVES, not everything between two anchors. A slice that ends
  // at the next tier's name happens to work only while nothing is ever added in
  // between; the `low` check below was sliced to the END OF THE FILE, and the
  // first unrelated rule appended after it — a button with `background: none` —
  // failed it. Fourth time in this repo that an unbounded slice has lied.
  const rulesFor = (tier) => (css.match(new RegExp(':root\\[data-gfx="' + tier + '"\\][^{]*\\{[^}]*\\}', 'g')) || []).join('\n');
  const mid = rulesFor('mid');
  assert.ok(mid.length > 0, 'the mid tier has no rules at all — every check below would pass on an empty string');
  for (const sel of ['#home', '#nav-sheet', '.chat-menu::before']) {
    assert.ok(mid.includes(sel), `mid no longer drops ${sel}, which is a full-viewport blur`);
  }
  assert.ok(!/\.field|\.sheet|\.login-card/.test(mid), 'mid is taking the frost off the small things too');
});

ok('low takes the live blur and leaves the material', () => {
  const low = (css.match(/:root\[data-gfx="low"\][^{]*\{[^}]*\}/g) || []).join('\n');
  assert.ok(low.length > 0, 'the lightest tier has no rules at all — every check below would pass on an empty string');
  assert.ok(/backdrop-filter: none !important/.test(low), 'the lightest tier still blurs');
  assert.ok(!/--frost-grain: none|background: none/.test(low),
    'the lightest tier is stripping the grain and gradients — it is the live blur that costs, not the material');
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
