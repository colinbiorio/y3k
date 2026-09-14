// THE TWO LANES OF THE CONVERSATION — a seam test, not a layout test.
//
// The bug this exists to catch shipped twice. `lanes()` computed a perfectly
// good rectangle for each speaker — the presence above the orb, you below it —
// and `positionPass()` then laid every line out on ONE cursor, reading the lane
// only for its x and its width. Both halves of the file read correct on their
// own. The vertical half of the rect was simply never asked for, so "stacked"
// rendered as one column and the presence's words appeared under yours.
//
// There is no DOM here, so this does not measure pixels. It asserts the seam:
// every branch of lanes() must describe a vertical rect, and positionPass()
// must read it. Break either end and this fails BY NAME.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

const src = readFileSync(new URL('../src/history.js', import.meta.url), 'utf8');
// The slice, with its comments taken out — every assertion below is about what
// the code DOES, and half of these comments are about the bug itself.
const between = (from, to) => {
  const i = src.indexOf(from); assert.ok(i > 0, `found ${from}`);
  const j = src.indexOf(to, i); assert.ok(j > i, `found the end of ${from}`);
  return src.slice(i, j).replace(/^\s*\/\/.*$/gm, '');
};

console.log('\nthe two lanes:');

ok('every lane every layout returns has a top AND a bottom', () => {
  const body = between('  function lanes() {', '\n  // ---- layout');
  const lanes = [...body.matchAll(/\b(?:y3k|you):\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(lanes.length >= 6, `expected a y3k and a you lane in all three layouts, found ${lanes.length}`);
  for (const L of lanes) {
    assert.ok(/\btop[,:]/.test(L), `a lane with no top: — the vertical rect is what got dropped last time: {${L.trim()}}`);
    assert.ok(/\bbottom[,:]/.test(L), `a lane with no bottom: — lines are anchored to it: {${L.trim()}}`);
    assert.ok(/\bx[,:]/.test(L) && /\bw[,:]/.test(L), `a lane with no x/w: {${L.trim()}}`);
  }
});

ok('the layout pass actually reads the lane it was handed', () => {
  const pass = between('  function positionPass() {', '\n    return rewrapped;');
  // THE ANCHOR. A line's y comes off ITS OWN lane's floor. Reading lane.bottom
  // somewhere in the function is not enough — the shipped bug read it for the
  // fade and still anchored every line to the band — so name the assignment.
  assert.ok(/\bconst top = lane\.bottom \+/.test(pass),
    'the line anchor is not lane.bottom — this is the bug: lanes() describes a ' +
    'rect per speaker and the layout stacks everyone on one cursor anyway');
  assert.ok(!/band\.bottom/.test(pass),
    'a line is standing on the BAND\'s floor again — in the stacked layout that ' +
    "floor is under the orb, so the presence's words land on top of yours");
  assert.ok(/lane\.top/.test(pass),
    'positionPass never reads lane.top — nothing then fades or clips at the lane edge');
  // and it must clip, not merely fade: a ghost of a line lying across the orb
  // is still a line lying across the orb
  assert.ok(/clipPath/.test(pass),
    'nothing clips a line to its lane — a scrolling line will cross the orb at ' +
    'partial opacity, which is exactly what "never overlapping" rules out');
});

ok('a stacked lane keeps its own stack, and merged shares one', () => {
  const pass = between('  function positionPass() {', '\n    return rewrapped;');
  assert.ok(/perLane\s*=\s*!L\.split\s*&&\s*!L\.merged/.test(pass),
    'the per-lane ruler must be OFF in the merged layout — two independent ' +
    'stacks in one rectangle draw straight through each other');
});

ok('the scroll reach is measured against a lane, never against the orb', () => {
  const fn = between('  function maxScroll() {', '\n  // The wheel');
  assert.ok(!/R\(\)/.test(fn),
    'maxScroll is back to using the orb radius as a stand-in for a lane height — ' +
    'in a short lane that stops short of the oldest line');
  assert.ok(/bottom\s*-\s*l\.top|bottom - lane\.top/.test(fn), 'maxScroll must size the reach off a lane');
});

ok('the wheel can reach the lanes wherever the layout put them', () => {
  const fn = between('  const inColumn =', '\n  function maxScroll');
  assert.ok(/lane\.x/.test(fn) && /lane\.bottom/.test(fn),
    'inColumn only knows the old corridor around the orb — in the two-column ' +
    'layout the lanes sit outside it and the wheel does nothing over the text');
});

ok('the you-prefix belongs to the merged layout alone', () => {
  assert.ok(/classList\.toggle\('merged'/.test(src),
    "the container's class must say merged, not stacked — in the stacked layout " +
    'the side of the orb still says who spoke');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.ok(/#chat-history\.merged \.hl-you::before/.test(css),
    'styles.css still hangs the "you — " prefix off a class the layout no longer sets');
});

ok('the portal costs a lane height, never width', () => {
  const band = between('  function safeBand() {', '\n  // Where the portal is');
  assert.ok(!/portal/i.test(band),
    'safeBand is reserving room for the portal again — taking its WIDTH out of ' +
    'the band narrows both columns everywhere, including the 700px of lane ' +
    'nowhere near it, until neither clears MIN_COL and the layout collapses');
  const d = between('  function duck(lane) {', '\n  const ducked =');
  assert.ok(/\{ \.\.\.lane, bottom:/.test(d), 'duck must return the lane with a new bottom');
  assert.ok(!/\bx:/.test(d) && !/\bw:/.test(d),
    'duck is moving a lane sideways — the whole point is that it does not');
  const body = between('  function lanes() {', '\n  // ---- layout');
  assert.equal((body.match(/return ducked\(\{/g) || []).length, 3,
    'every layout lanes() can return must go out through ducked() — the one that ' +
    'skips it is the one where the portal lands on the words');
});

console.log(`\n${passed} checks passed.`);
