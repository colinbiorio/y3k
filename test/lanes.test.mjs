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

ok('either dash folds BOTH halves, and folding retires the work too', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const mount = readFileSync(new URL('../src/mercury-mount.js', import.meta.url), 'utf8');
  // ONE DASH ON EACH SIDE, and either one takes both columns. They are one
  // conversation on one timeline, so folding the presence's half and leaving
  // yours would be a claim about the past that is not true.
  for (const id of ['chat-fold-y3k', 'chat-fold-you']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is not in the markup`);
    // A MOUNT, not just the svg: .mercury hides its own source on the
    // assumption a canvas has taken over, so an unmounted one is 0x0 and is
    // simply not on the screen at all.
    assert.ok(mount.includes(`['${id}',`), `${id} is never poured — .mercury hides its own svg, so it would render at nothing`);
  }
  assert.ok(/document\.body\.classList\.toggle\('chat-folded'\)/.test(src), 'neither dash folds anything');
  assert.equal((src.match(/classList\.toggle\('chat-folded'\)/g) || []).length, 1,
    'each side folds its own half — there is one conversation, not two');
  // VISIBILITY, NOT OPACITY. An invisible column is still a column being laid
  // out and transformed sixty times a second to produce what nobody can see —
  // the same trap #home was in with its backdrop-filter.
  assert.ok(/body\.chat-folded #chat-history \{ visibility: hidden; \}/.test(css),
    'the folded conversation is hidden by opacity or display — one goes on working, the other cannot transition');
  // ...and the dashes ride the lanes rather than sitting in a screen corner,
  // so they follow the columns through every layout this file can produce.
  assert.ok(/function placeFolds\(L\)/.test(src), 'the dashes are not placed from the lanes');
  assert.ok(/placeFolds\(L\);/.test(src), 'placeFolds is never called');
  assert.ok(src.indexOf('placeFolds(L);') > src.indexOf('function positionPass()'),
    'the dashes are placed outside the pass that knows where the lanes are');
  // MERGED IS ONE REGION for both speakers, so the second dash would land
  // exactly on the first.
  assert.ok(/L\.merged \? null :/.test(src), 'both dashes are drawn in the merged layout — they would sit on top of each other');
  assert.ok(/\.chat-fold\.solo \{ display: none; \}/.test(css), 'the stood-down dash is still drawn');
});

ok('the discover wall says there is more below it', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const reach = readFileSync(new URL('../src/reach.js', import.meta.url), 'utf8');
  // macOS hides overlay scrollbars until something is already scrolling, which
  // on a wall of presences means there is no sign there is more and nothing for
  // a hand to aim at. Asking for a width turns the classic one back on.
  const home = css.slice(css.indexOf('#home { position: fixed'), css.indexOf('body.gated #home'));
  assert.ok(home.length > 100, 'the #home block cannot be located — this check would pass on nothing');
  assert.ok(/scrollbar-width: thin/.test(home), 'the discover wall has no scrollbar of its own');
  const w = css.match(/#home::-webkit-scrollbar \{ width: (\d+)px; \}/);
  assert.ok(w, 'the overlay scrollbar is left hidden in Chromium');
  assert.ok(+w[1] >= 6, `a ${w[1]}px scrollbar is not one you can see or aim a hand at`);
  // ...and a hand drags it. Found by its OVERFLOW, never by its id, so every
  // pane in this app gets it — including ones that do not exist yet.
  // ...against the CODE, with the comments taken out. reach.js names #home in
  // its own prose explaining why it does NOT name it in a selector, and a naive
  // grep finds its own explanation. Fifth time; strip the comments.
  const code = reach.replace(/\/\/[^\n]*/g, '');
  // ...and #home, not #home-BRAND, which is the wordmark and is named there on
  // purpose. A bare substring match calls the two the same thing.
  assert.ok(!/#home(?![-\w])/.test(code), 'the pane is named in the pointer bus — every other scroller would need naming too');
  assert.ok(/function scrollerAt\(el\)/.test(code), 'nothing finds a scroller by its overflow');
});

console.log(`\n${passed} checks passed.`);
