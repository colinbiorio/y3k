// THE RIGHT SIDE OF THE ROOM (src/world-side.js): where the world screen's
// list of who is near and its open map stand. Until 2026-10-08 both sat at a
// fixed right: 20px, the right rail's own column, and the rail paints over
// the world: the ways and hails ran under the settings gear and across the
// frame's top border. The scenes below are the boxes Chromium measured on the
// world screen (scripts/play-smoke.mjs takes the same three widths), so each
// pins the place the page gets at that width, and that it covers nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sidePlace, sidePlaces } from '../src/world-side.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const rect = ([l, t, r, b]) => ({ l, t, r, b });
const meets = (a, b, gap = 0) => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;
const boxOf = (p) => p && { l: p.right - p.width, t: p.top, r: p.right, b: p.top + p.height };

// [l, t, r, b] as measured, the founder's world screen with the firsts card
// open and the hands unfolded (a desktop pointer)
const SCENES = {
  1280: {
    view: [0, 0, 1280, 800], room: [92, 92, 1188, 708], bar: [104, 18, 765, 70], card: [420, 140, 860, 283],
    tools: [1122, 522, 1176, 704], hands: [104, 436, 426, 704],
    gripR: [1152, 380, 1192, 420], gripT: [620, 92, 660, 132], gripL: [88, 380, 128, 420], gripB: [620, 668, 660, 708],
    rail: [[1194, 46, 1274, 126], [1194, 171, 1274, 251], [1194, 297, 1274, 377], [1194, 423, 1274, 503], [1194, 549, 1274, 629], [1194, 674, 1274, 754]],
  },
  1024: {
    view: [0, 0, 1024, 768], room: [92, 92, 932, 676], bar: [104, 18, 765, 70], card: [292, 140, 732, 283],
    tools: [866, 490, 920, 672], hands: [104, 404, 426, 672],
    gripR: [896, 364, 936, 404], gripT: [492, 92, 532, 132], gripL: [88, 364, 128, 404], gripB: [492, 636, 532, 676],
    rail: [[938, 41, 1018, 121], [938, 162, 1018, 242], [938, 283, 1018, 363], [938, 405, 1018, 485], [938, 526, 1018, 606], [938, 647, 1018, 727]],
  },
  768: {
    view: [0, 0, 768, 1024], room: [92, 92, 676, 932], bar: [104, 18, 664, 98], card: [164, 140, 604, 283],
    tools: [610, 746, 664, 928], hands: [104, 660, 426, 928],
    gripR: [640, 492, 680, 532], gripT: [364, 92, 404, 132], gripL: [88, 492, 128, 532], gripB: [364, 892, 404, 932],
    rail: [[682, 78, 762, 158], [682, 235, 762, 315], [682, 393, 762, 473], [682, 551, 762, 631], [682, 709, 762, 789], [682, 866, 762, 946]],
  },
  390: {
    view: [0, 0, 390, 844], room: [58, 58, 332, 786], bar: [64, 10, 326, 104], card: [16, 106, 374, 245],
    tools: [180, 704, 324, 748], hands: [104, 384, 326, 692],
    gripR: [296, 402, 336, 442], gripT: [175, 58, 215, 98], gripL: [54, 402, 94, 442], gripB: [175, 746, 215, 786],
    rail: [[338, 81, 384, 127], [338, 208, 384, 254], [338, 335, 384, 381], [338, 463, 384, 509], [338, 590, 384, 636], [338, 717, 384, 763]],
  },
};
const MAP = 232;   // the 230px canvas and its border
// what world-view.js hands sidePlaces, from a scene
function ask(s, { mapOpen = false, card = s.card, hands = s.hands } = {}) {
  return sidePlaces({
    view: rect(s.view), room: rect(s.room), card: card && rect(card), tools: rect(s.tools), gripR: rect(s.gripR),
    others: [rect(s.bar), hands && rect(hands), rect(s.gripL), rect(s.gripT), rect(s.gripB)], map: MAP, mapOpen,
  });
}
// everything a place must keep clear of: what stands in the room and the
// rail's own buttons, which paint over the world
function clearOf(s, place, what, { card = s.card, hands = s.hands, also = [] } = {}) {
  const room = rect(s.room);
  // (the right edge may be the tools', 8px in from the room's edge on a phone)
  assert.ok(place.l >= room.l + 10 && place.r <= room.r - 8 && place.t >= room.t + 10 && place.b <= room.b - 10,
    `${what} at ${JSON.stringify(place)} must stand inside the room ${JSON.stringify(room)}`);
  const things = { bar: s.bar, card, tools: s.tools, hands, gripR: s.gripR, gripT: s.gripT, gripL: s.gripL, gripB: s.gripB };
  for (const [name, r] of Object.entries(things)) {
    if (r) assert.ok(!meets(place, rect(r), 10), `${what} at ${JSON.stringify(place)} meets the ${name} ${JSON.stringify(r)}`);
  }
  for (const r of s.rail) assert.ok(!meets(place, rect(r)), `${what} at ${JSON.stringify(place)} lies under a rail button ${JSON.stringify(r)}`);
  for (const r of also) assert.ok(!meets(place, r, 10), `${what} at ${JSON.stringify(place)} meets ${JSON.stringify(r)}`);
}
const middleOf = (s) => {
  const [vl, vt, vr, vb] = s.view, [l, t, r, b] = s.room, k = Math.min(r - l, b - t) / 8;
  return { l: (vl + vr) / 2 - k, t: (vt + vb) / 2 - k, r: (vl + vr) / 2 + k, b: (vt + vb) / 2 + k };
};

console.log('\nthe right side of the room:');

ok('at 1280 the list stands beside the firsts card at the top of the room, flush with the tools', () => {
  const s = SCENES[1280], { near } = ask(s), at = boxOf(near);
  assert.equal(near.top, 102, 'the top of the room, not the frame\'s top band (18px)');
  assert.equal(near.right, 1176, 'flush with the tools (right: 104px), not under the rail (right: 20px)');
  assert.equal(at.l, 870, 'beside the card, ten pixels clear of it');
  assert.ok(near.height >= 260, `room for the ways and the hails: ${near.height}px`);
  clearOf(s, at, 'the list', { also: [middleOf(s)] });
});

ok('at 1024 there is no room beside the card: the list stands under it, clear of the rail\'s grip', () => {
  const s = SCENES[1024], { near } = ask(s), at = boxOf(near);
  assert.equal(near.top, 293, 'under the card (its foot is 283)');
  assert.equal(near.right, 886, 'left of the right rail\'s grip (896), which stands inside the room at mid-height');
  assert.ok(at.l >= middleOf(s).r + 10, 'and clear of the middle, where the society stands');
  assert.ok(near.height >= 96, `three rows at least: ${near.height}px`);
  clearOf(s, at, 'the list', { also: [middleOf(s)] });
});

ok('on a phone the top band is the card\'s: the list stands under it, above the grips', () => {
  const s = SCENES[390], { near } = ask(s), at = boxOf(near);
  assert.equal(near.top, 255, 'under the card (its foot is 245)');
  assert.equal(near.right, 324, 'flush with the phone\'s row of tools, inside the hole');
  assert.ok(at.b <= 392, 'above the grips at mid-height');
  clearOf(s, at, 'the list', { also: [middleOf(s)] });
  // a touch device folds the hands to their toggle, and the list is the
  // same place or taller, never under the toggle
  const folded = [104, 668, 200, 692];
  const f = boxOf(ask(s, { hands: folded }).near);
  assert.ok(f.t === 255 && f.b >= at.b, JSON.stringify(f));
  clearOf(s, f, 'the list', { hands: folded, also: [middleOf(s)] });
});

ok('every width: the list and the open map cover nothing, and the list yields to the map', () => {
  for (const [w, s] of Object.entries(SCENES)) {
    const closed = ask(s);
    if (closed.near) clearOf(s, boxOf(closed.near), `the list at ${w}`, { also: [middleOf(s)] });
    const open = ask(s, { mapOpen: true });
    const map = { l: open.map.right - MAP, t: open.map.top, r: open.map.right, b: open.map.top + MAP };
    // the map may lie over the card (a thing you asked for), never over the rest
    clearOf(s, map, `the map at ${w}`, { card: null });
    if (open.near) clearOf(s, boxOf(open.near), `the list at ${w} with the map open`, { also: [map, middleOf(s)] });
  }
});

ok('the map stands beside the card where it fits, over it where it does not, and never over the bar', () => {
  const at1280 = ask(SCENES[1280], { mapOpen: true }).map;
  assert.ok(at1280.top === 102 && at1280.right === 1176 && at1280.right - MAP >= 860 + 10, JSON.stringify(at1280));
  const at1024 = ask(SCENES[1024], { mapOpen: true }).map;
  assert.ok(at1024.top === 102 && at1024.right === 920, `at 1024 over the card's corner: ${JSON.stringify(at1024)}`);
  // on a phone the bar wraps into the room, and "the map" is on its last row
  const phone = ask(SCENES[390], { mapOpen: true }).map;
  assert.ok(phone.top >= 104 + 10, `the open map would cover the button that closes it: ${JSON.stringify(phone)}`);
});

ok('a card folded to its pill leaves the top of the room; a card opened wide takes it', () => {
  const s = SCENES[1024];
  const pill = ask(s, { card: [400, 140, 624, 170] }).near;
  assert.ok(pill.top < 293, `with the card folded the list rises: ${JSON.stringify(pill)}`);
  clearOf(s, boxOf(pill), 'the list', { card: [400, 140, 624, 170], also: [middleOf(s)] });
  const phone = SCENES[390];
  const wide = ask(phone, { card: [16, 106, 374, 696] }).near;
  assert.equal(wide, null, 'the whole list of firsts on a phone leaves no free place: the list waits');
});

ok('a place covers nothing it was given, whatever the room (random rooms)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let placed = 0;
  for (let i = 0; i < 4000; i++) {
    const W = 300 + rnd() * 1700, H = 300 + rnd() * 900;
    const room = { l: 40 + rnd() * 60, t: 40 + rnd() * 60, r: W - 40 - rnd() * 60, b: H - 40 - rnd() * 60 };
    const things = Array.from({ length: Math.floor(rnd() * 8) }, () => {
      const l = rnd() * W, t = rnd() * H;
      return { l, t, r: l + 20 + rnd() * 400, b: t + 20 + rnd() * 300 };
    });
    const rights = [room.r - 12, room.r - 12 - rnd() * 80];
    const minH = 40 + rnd() * 120, width = 230 + rnd() * 200, minW = 100 + rnd() * 130;
    const p = sidePlace({ room, things, rights, width, minW, minH });
    if (!p) continue;
    placed++;
    const b = boxOf(p);
    assert.ok(rights.includes(p.right), 'a place takes one of the right edges it was given');
    assert.ok(p.width <= width + 1e-9 && p.width >= minW - 1e-9 && p.height >= minH - 1e-9, JSON.stringify({ p, width, minW, minH }));
    assert.ok(b.l >= room.l + 10 - 1e-9 && b.t >= room.t + 10 - 1e-9 && b.b <= room.b - 10 + 1e-9 && b.r <= room.r, JSON.stringify({ b, room }));
    for (const t of things) assert.ok(!meets(b, t, 10 - 1e-9), JSON.stringify({ b, t }));
  }
  assert.ok(placed > 1000, `the rooms must mostly have a place, or this proves little: ${placed}`);
});

ok('the page measures and the stylesheet follows: no fixed corner under the rail', () => {
  const side = read('src/world-side.js');
  assert.ok(!/document|window|getBoundingClientRect|innerWidth/.test(side.replace(/^\s*\/\/.*$/gm, '')),
    'world-side.js is pure: rectangles in, places out');
  const css = read('styles.css');
  assert.ok(!/(#world-map|\.world-near) \{[^}]*right: max\(20px/.test(css), 'the list and the map no longer sit at right: 20px, under the rail');
  for (const sel of ['#world-map', '\\.world-near']) {
    const rule = (css.match(new RegExp(`\\n${sel} \\{[^}]*\\}`)) || [''])[0];
    assert.ok(/right: var\(--side-right, max\(104px, calc\(env\(safe-area-inset-right\) \+ 104px\)\)\);/.test(rule), `${sel} reads its measured edge, falling back to the tools' 104px`);
    assert.ok(/top: var\(--side-top, calc\(var\(--hole-t, 92px\) \+ 12px\)\);/.test(rule), `${sel} reads its measured top, falling back to the room's top`);
  }
  assert.ok(/\.world-near, #world-map \{ right: var\(--side-right, calc\(var\(--hole-r, 58px\) \+ 8px\)\); \}/.test(css),
    'on a phone the fallback edge is the phone tools\' (inside the hole)');
  assert.ok(/max-width: var\(--side-w, 300px\); max-height: var\(--side-h, 40vh\);\s+overflow-y: auto;/.test(css), 'the list is as tall as its place and scrolls past it');
  assert.ok(/\.world-near\[hidden\] \{ display: none; \}/.test(css), 'an explicit display beats [hidden]; the list says so');
  assert.ok(/\.world-near \{[^}]*pointer-events: none;/.test(css) && /\.world-near > \* \{ pointer-events: auto; \}/.test(css),
    'only the list\'s rows take a pointer; a tap beside them reaches the ground (world-tap)');
  const z = (sel) => Number((css.match(new RegExp(`\\n${sel} \\{[^}]*z-index: (\\d+)`)) || [])[1]);
  assert.ok(z('#world-map') > z('\\.firsts'), `the open map (z ${z('#world-map')}) lies over the firsts card (z ${z('\\.firsts')})`);
  assert.ok(z('\\.world-tag') >= z('#world-map'), 'a tapped thing\'s tag still reads over the map');
  const wv = read('src/world-view.js');
  const place = wv.slice(wv.indexOf('  function placeSide() {'), wv.indexOf('  function fadeNear() {'));
  for (const sel of ["'.firsts'", "'.world-tools'", "'.nav-collapse-right'", "'.world-bar'", "'.hands'", "'.nav-collapse', '.nav-collapse-top', '.nav-collapse-bottom'"]) {
    assert.ok(place.includes(sel), `placeSide must measure ${sel}`);
  }
  assert.ok(/room: box\(\$\('nav-hole'\)\)/.test(place), 'the room is the hole the frame leaves');
  assert.ok(/for \(const el of \[\$\('nav-hole'\), root\.querySelector\('\.world-bar'\), root\.querySelector\('\.firsts'\),\s+root\.querySelector\('#world-map'\), root\.querySelector\('\.hands'\), tools\]\) if \(el\) sideRO\.observe\(el\);/.test(wv),
    'placed again when the hole, the bar, the card, the map, the hands or the tools change size');
  assert.ok(/sideRO\?\.disconnect\(\); sideRO = null; lastSide = '';/.test(wv), 'the observer leaves with the visit');
});

console.log(`\n${passed} checks passed.`);
