// THE RIGHT SIDE OF THE ROOM (src/world-side.js): where the world screen's
// list of who is near and its open map stand. Until 2026-10-08 both sat at a
// fixed right: 20px, the right rail's own column, and the rail paints over
// the world: the ways and hails ran under the settings gear and across the
// frame's top border. The scenes below are the boxes Chromium measured on the
// world screen (scripts/play-smoke.mjs takes 1280, 1024 and a phone), so each
// pins the place the page gets at that size, and that it covers nothing.
//
// The tight rooms came from review on 2026-10-09: with only two right edges
// to try, the list vanished at 1024x600 with the card open, on an 844x390
// phone held sideways, and at 1024x768 with the card opened to "all", with
// nothing on screen to say it was waiting. A second review found the list,
// asked for, given the highest strip instead of the biggest place, and on a
// portrait phone the count that asks for it under the firsts card.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sidePlace, sidePlaces } from '../src/world-side.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓', name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const rect = ([l, t, r, b]) => ({ l, t, r, b });
const meets = (a, b, gap = 0) => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;
const boxOf = (p) => p && { l: p.right - p.width, t: p.top, r: p.right, b: p.top + p.height };
// to the pixel, as the page writes it (the middle's eighth is fractional)
const px = (p) => p && Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));

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
  // a short desktop: the tools stand from the room's floor to above its
  // middle, and the right rail's grip sits on them
  '1024x600': {
    view: [0, 0, 1024, 600], room: [92, 92, 932, 508], bar: [104, 18, 762, 70], card: [292, 140, 732, 283],
    tools: [866, 322, 920, 504], hands: [104, 236, 426, 504],
    gripR: [896, 280, 936, 320], gripT: [492, 92, 532, 132], gripL: [88, 280, 128, 320], gripB: [492, 468, 532, 508],
    rail: [[6, 17, 86, 97], [6, 114, 86, 194], [6, 211, 86, 291], [6, 309, 86, 389], [6, 406, 86, 486], [6, 503, 86, 583],
      [938, 17, 1018, 97], [938, 114, 1018, 194], [938, 211, 1018, 291], [938, 309, 1018, 389], [938, 406, 1018, 486], [938, 503, 1018, 583]],
  },
  // a phone held sideways (a touch device: the hands folded to their
  // toggle): the room is 206px tall, the bar wraps into it, and the tools
  // take its whole right side
  '844x390': {
    view: [0, 0, 844, 390], room: [92, 92, 752, 298], bar: [104, 18, 740, 98], card: [202, 140, 642, 283],
    tools: [686, 112, 740, 294], hands: [104, 274, 201, 294],
    gripR: [712, 173, 756, 217], gripT: [400, 90, 444, 134], gripL: [88, 173, 132, 217], gripB: [400, 256, 444, 300],
    rail: [[6, 0, 86, 80], [6, 80, 86, 160], [6, 160, 86, 240], [6, 240, 86, 320], [6, 320, 86, 400],
      [758, 0, 838, 80], [758, 80, 838, 160], [758, 160, 838, 240], [758, 240, 838, 320], [758, 320, 838, 400]],
  },
};
// the card opened to "all" (wide) and folded to its pill, as measured
const WIDE = { 1024: [292, 140, 732, 678], '844x390': [202, 140, 642, 413], 390: [16, 106, 374, 579] };
const FOLDED = { '844x390': [334, 140, 511, 168] };
const MAP = 232;   // the 230px canvas and its border
// what world-view.js hands sidePlaces, from a scene
function ask(s, { mapOpen = false, card = s.card, hands = s.hands, asked = false } = {}) {
  return sidePlaces({
    view: rect(s.view), room: rect(s.room), card: card && rect(card), tools: rect(s.tools), gripR: rect(s.gripR),
    others: [rect(s.bar), hands && rect(hands), rect(s.gripL), rect(s.gripT), rect(s.gripB)], map: MAP, mapOpen, asked,
  });
}
// the open map's own box, at the size it is drawn
const mapBox = (m) => ({ l: m.right - m.size, t: m.top, r: m.right, b: m.top + m.size });
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
    const map = mapBox(open.map);
    // the map may lie over the card (a thing you asked for), never over the rest
    clearOf(s, map, `the map at ${w}`, { card: null });
    if (open.near) clearOf(s, boxOf(open.near), `the list at ${w} with the map open`, { also: [map, middleOf(s)] });
  }
});

ok('the map stands beside the card where it fits, over it where it does not, and never over the bar', () => {
  const at1280 = ask(SCENES[1280], { mapOpen: true }).map;
  assert.ok(at1280.top === 102 && at1280.right === 1176 && at1280.right - MAP >= 860 + 10 && at1280.size === MAP, JSON.stringify(at1280));
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
  // ...and its count in the world bar shows it over the card, at your asking
  const asked = ask(phone, { card: [16, 106, 374, 696], asked: true }).near;
  assert.ok(asked?.over === true, JSON.stringify(asked));
  clearOf(phone, boxOf(asked), 'the list asked for', { card: null });
});

ok('at 1024x600 the list stands left of the tools, under the card, where it had no place at all', () => {
  const s = SCENES['1024x600'], { near, map } = ask(s), at = boxOf(near);
  assert.deepEqual(near, { top: 293, right: 856, width: 282, height: 205 }, 'x 574-856, y 293-498: just left of the tools');
  clearOf(s, at, 'the list', { also: [middleOf(s)] });
  // the room's corner, the old last resort, covered the right rail's grip
  // (896-936, 280-320); the map comes in from the edge to lie over the card
  assert.ok(map.top === 102 && map.right === 856 && map.size === MAP, JSON.stringify(map));
  clearOf(s, mapBox(map), 'the map', { card: null });
  const open = ask(s, { mapOpen: true });
  assert.deepEqual(boxOf(open.near), { l: 574, t: 344, r: 856, b: 498 }, 'and the list stands under the open map');
});

ok('at 1024x768 with the card opened to "all" the list stands in the strip beside it, one narrow column', () => {
  const s = SCENES[1024], card = WIDE[1024], { near } = ask(s, { card }), at = boxOf(near);
  assert.deepEqual(near, { top: 102, right: 920, width: 178, height: 252 }, 'between the card (732) and the tools\' edge, above the grip');
  clearOf(s, at, 'the list', { card, also: [middleOf(s)] });
  // with the map open over that strip's top, the list stands under the grip
  const open = ask(s, { card, mapOpen: true });
  assert.ok(open.near && !meets(boxOf(open.near), mapBox(open.map), 10), JSON.stringify(open));
  clearOf(s, boxOf(open.near), 'the list beside the open map', { card, also: [middleOf(s), mapBox(open.map)] });
});

ok('an 844x390 phone held sideways: the list waits, and asked for it lies over the card, clear of the rest', () => {
  const s = SCENES['844x390'];
  for (const card of [s.card, WIDE['844x390']]) {
    assert.equal(ask(s, { card }).near, null, `no place beside a card at ${JSON.stringify(card)}: the bar carries the count`);
    // the biggest place clear of the rest, not the highest: that was a strip
    // 222 by 51 under the bar, which held "no other society within sight"
    // and none of the hails the count had named (found in review, 2026-10-09)
    const over = ask(s, { card, asked: true }).near;
    assert.deepEqual(px(over), { top: 144, right: 676, width: 218, height: 144, over: true }, 'under the top grip, between the middle and the tools');
    clearOf(s, boxOf(over), 'the list asked for', { card: null, also: [middleOf(s)] });
  }
  // with the card folded to its pill a row is free, at the room's foot
  const folded = ask(s, { card: FOLDED['844x390'] }).near;
  assert.deepEqual(px(folded), { top: 231, right: 676, width: 222, height: 57 }, 'under the middle, between the bottom grip and the tools');
  clearOf(s, boxOf(folded), 'the list', { card: FOLDED['844x390'], also: [middleOf(s)] });
  // the room is shorter than the map (206px): drawn smaller, it lies over
  // the card and not, as the room's corner did, over the tools
  const { map } = ask(s, { mapOpen: true });
  assert.ok(map.size < MAP && map.size >= 140, JSON.stringify(map));
  clearOf(s, mapBox(map), 'the map', { card: null });
});

// The desktop's layout as measured at 1024x600, 1024x768, 1108x700, 1280x800
// and 1440x900: the room is the screen less 92px a side, the card hangs at
// 140 from the centre (143px open; wide, 70% of the height up to 560), the
// tools and the hands stand 96px off the floor, the grips at the edges' mids.
function desk(W, H, size) {
  return {
    view: [0, 0, W, H], room: [92, 92, W - 92, H - 92], bar: [104, 18, 762, 70],
    card: size === 'folded' ? [W / 2 - 88, 140, W / 2 + 89, 168] : [W / 2 - 220, 140, W / 2 + 220, 140 + (size === 'wide' ? Math.min(0.7 * H, 560) : 143)],
    tools: [W - 158, H - 278, W - 104, H - 96], hands: [104, H - 364, 426, H - 96],
    gripR: [W - 128, H / 2 - 20, W - 88, H / 2 + 20], gripT: [W / 2 - 20, 92, W / 2 + 20, 132],
    gripL: [88, H / 2 - 20, 128, H / 2 + 20], gripB: [W / 2 - 20, H - 132, W / 2 + 20, H - 92],
    rail: [[6, 0, 86, H], [W - 86, 0, W - 6, H]],
  };
}

ok('a portrait phone with the card opened to "all": asked for, the list takes the room under the bar, over the card', () => {
  const s = SCENES[390];
  // as measured: the bar's three rows end at 104 and the card hangs at 106;
  // the count stands at the right end of the bar's last row
  const card = WIDE[390];
  assert.equal(ask(s, { card }).near, null, 'no free place beside or under it: the bar carries the count');
  const over = ask(s, { card, asked: true }).near;
  assert.deepEqual(px(over), { top: 114, right: 324, width: 256, height: 260, over: true }, 'under the bar, above the hands, flush with the tools');
  clearOf(s, boxOf(over), 'the list asked for', { card: null, also: [middleOf(s)] });
  // where the bar wraps to a fourth row, the count alone on it (review
  // measured its foot at about 130), the card hangs two pixels under it
  // (--bar-b, world-view.js), and the list asked for stands under the bar
  const tall = { ...s, bar: [64, 10, 326, 130] };
  const lower = [16, 132, 374, 605];
  assert.equal(ask(tall, { card: lower }).near, null);
  const under = ask(tall, { card: lower, asked: true }).near;
  assert.ok(under.over && under.top === 140 && under.height >= 230, JSON.stringify(under));
  clearOf(tall, boxOf(under), 'the list asked for under a taller bar', { card: null, also: [middleOf(s)] });
  // with the map open over that room the list waits; asked for, it closes
  // the map (world-view.js askNear), and the map no longer stands in its way
  assert.equal(ask(s, { mapOpen: true }).near, null, 'the open map takes the room under the bar');
});

ok('every desktop from 900x560 to 1440x900 has a place for the list, the card open or folded, the map open or shut', () => {
  // (with two right edges, 44 of these 504 sizes had none with the card
  // open, and 196 with the map open too)
  for (let W = 900; W <= 1440; W += 20) for (let H = 560; H <= 900; H += 20) {
    for (const size of ['open', 'folded']) for (const mapOpen of [false, true]) {
      const s = desk(W, H, size), { near, map } = ask(s, { mapOpen });
      const what = `the list at ${W}x${H}, the card ${size}${mapOpen ? ', the map open' : ''}`;
      assert.ok(near, `${what} has no place`);
      // right of the centre, where it has always stood; with the map open
      // on a small screen it may have to cross to the left of it
      if (!mapOpen) assert.ok(near.right > W / 2, `${what} stands right of the centre: ${JSON.stringify(near)}`);
      clearOf(s, boxOf(near), what, { also: [middleOf(s), ...(mapOpen ? [mapBox(map)] : [])] });
    }
  }
});

ok('with the card opened to "all", a desktop narrower than 968px has no place; asked for, the list lies over the card', () => {
  // (with two right edges, 198 of these sizes had none)
  let waits = 0;
  for (let W = 900; W <= 1440; W += 20) for (let H = 560; H <= 900; H += 20) {
    const s = desk(W, H, 'wide'), { near } = ask(s);
    if (near) { clearOf(s, boxOf(near), `the list at ${W}x${H}`, { also: [middleOf(s)] }); continue; }
    waits++;
    // 150px beside the card's 440 and the tools' 104 and 10px gaps
    assert.ok(W < 968, `the list waits at ${W}x${H}, where 150px beside the card is free`);
    const over = ask(s, { asked: true }).near;
    assert.ok(over?.over, `${W}x${H}`);
    clearOf(s, boxOf(over), `the list asked for at ${W}x${H}`, { card: null, also: [middleOf(s)] });
  }
  assert.ok(waits > 0 && waits <= 72, `the narrow ones wait, and only they: ${waits}`);
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
    // the biggest place is found wherever the highest is, and is no smaller
    const big = sidePlace({ room, things, rights, width, minW, minH, biggest: true });
    assert.equal(!!big, !!p, 'the biggest place exists exactly where a place does');
    if (!p) continue;
    placed++;
    assert.ok(big.width * big.height >= p.width * p.height - 1e-6, JSON.stringify({ p, big }));
    for (const q of [p, big]) {
      const b = boxOf(q);
      assert.ok(rights.includes(q.right), 'a place takes one of the right edges it was given');
      assert.ok(q.width <= width + 1e-9 && q.width >= minW - 1e-9 && q.height >= minH - 1e-9, JSON.stringify({ q, width, minW, minH }));
      assert.ok(b.l >= room.l + 10 - 1e-9 && b.t >= room.t + 10 - 1e-9 && b.b <= room.b - 10 + 1e-9 && b.r <= room.r, JSON.stringify({ b, room }));
      for (const t of things) assert.ok(!meets(b, t, 10 - 1e-9), JSON.stringify({ b, t }));
    }
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
  assert.ok(/sideRO\?\.disconnect\(\); sideRO = null; lastSide = ''; nearAsked = false;/.test(wv), 'the observer and the asking leave with the visit');
});

ok('the list never waits unseen: the bar carries its count, and the count shows it', () => {
  const wv = read('src/world-view.js');
  const place = wv.slice(wv.indexOf('  function placeSide() {'), wv.indexOf('  function fadeNear() {'));
  assert.ok(/<button type="button" id="world-nearchip" class="login-alt world-nearchip" aria-controls="world-near" aria-expanded="false" hidden><\/button>/.test(wv),
    'the count is a button in the world bar, hidden until the list waits');
  assert.ok(place.includes('asked: nearAsked,'), 'placeSide hands sidePlaces the asking');
  assert.ok(place.includes('near.hidden = !at.near;') && place.includes('chip.hidden = !!at.near && !at.near.over;'),
    'the count shows while the list waits, and while it lies over the card at your asking');
  assert.ok(place.includes('if (at.near && !at.near.over) nearAsked = false;'), 'a list with a place of its own ends the asking');
  assert.ok(/function askNear\(\) \{\s+nearAsked = !nearAsked;[^}]*if \(nearAsked && map && !map\.hidden\) map\.hidden = true;\s+placeSide\(\);/.test(wv),
    'asking for the list closes the map: where neither has a place, the one asked for last is shown');
  assert.ok(/cv\.hidden = !cv\.hidden;\s+if \(cv\.hidden\) return;\s+nearAsked = false;/.test(wv), 'and opening the map ends the asking');
  assert.ok(/addEventListener\('click', askNear\)/.test(wv));
  // the count names what the list holds
  assert.ok(/count\(state\.voices\.length, 'hail'\)/.test(wv) && /count\(state\.ways\.length, 'way'\)/.test(wv) && /heard\.join\(' · '\)/.test(wv));
  const css = read('styles.css');
  const z = (sel) => Number((css.match(new RegExp(`\\n${sel} \\{[^}]*z-index: (\\d+)`)) || [])[1]);
  assert.ok(z('\\.world-near\\.over') > z('\\.firsts'), 'asked for, the list lies over the firsts card');
  // the map is drawn smaller in a short room, so its full size is the canvas's
  assert.ok(place.includes('map: map.width + 2,') && !place.includes('offsetWidth'), 'the map\'s full size, not the size it was last drawn at');
  assert.ok(place.includes("map.style.setProperty('--side-map', at.map.size - 2 + 'px');"));
  assert.ok(/#world-map \{[^}]*width: var\(--side-map, 230px\); height: var\(--side-map, 230px\);/.test(css));
});

ok('a finger reaches the count wherever it shows: the card hangs under the bar, the count at its right end', () => {
  const css = read('styles.css');
  // on a portrait phone the count wrapped to a fourth row, under the card (z4
  // over the bar's z2): with the map open or the card at "all" it could not
  // be pressed (found in review, 2026-10-09)
  assert.ok(/\n\.firsts \{ position: absolute; top: max\(calc\(var\(--hole-t, 58px\) \+ 48px\), var\(--bar-b, 0px\)\);/.test(css),
    'the card hangs at its own top or under the bar\'s measured foot, whichever is lower');
  // ...and where it fell mid-bar on the third row, the top rail's grip lay over it
  assert.ok(/\n\.world-nearchip \{[^}]*margin-left: auto;/.test(css), 'the count keeps to the right end of its row, clear of the top grip');
  const wv = read('src/world-view.js');
  const place = wv.slice(wv.indexOf('  function placeSide() {'), wv.indexOf('  function askNear() {'));
  const barAt = place.indexOf("const bar = box(root.querySelector('.world-bar'));");
  const written = place.indexOf("root.style.setProperty('--bar-b', barB);");
  const cardAt = place.indexOf("card: box(root.querySelector('.firsts'))");
  assert.ok(barAt > 0 && written > barAt && cardAt > written, 'the bar is measured and --bar-b written before the card is measured');
  assert.ok(/const barB = bar \? Math\.ceil\(bar\.b - view\.t\) \+ 2 \+ 'px' : '';/.test(place), 'two pixels under the bar');
  assert.ok(place.includes('others: [bar, '), 'the bar measured once, and handed on as a thing in the room');
});

ok('the list is a region a keyboard can reach and scroll, and its rows stay frosted', () => {
  const wv = read('src/world-view.js');
  assert.ok(/<div id="world-near" class="world-near" tabindex="0" role="region" aria-label="Societies in sight, hails and ways"><\/div>/.test(wv),
    'focusable, a named region');
  // the world's keys are on window and preventDefault; a focused list that
  // can scroll keeps its own scrolling keys
  assert.ok(/const SCROLL_KEYS = new Set\(\['arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end', ' '\]\);/.test(wv));
  const onKey = wv.slice(wv.indexOf('    const onKey = (e) => {'), wv.indexOf("      if (k === 'f') cycleWalk();"));
  assert.ok(/const list = t\?\.closest\?\.\('#world-near'\);\s+if \(list && SCROLL_KEYS\.has\(k\) && list\.scrollHeight > list\.clientHeight\) return;/.test(onKey),
    'returns before the camera takes the key');
  const css = read('styles.css');
  // (the veil, ::after, may mask itself: nothing frosted is inside it)
  const rules = (css.match(/\n\.world-near[^{]*\{[^}]*\}/g) || []).filter((r) => !r.split('{')[0].includes('::after'));
  assert.ok(rules.length >= 5 && !rules.some((r) => /mask/.test(r)),
    'no mask on the list: a mask makes it a backdrop root, and the rows\' blur then has nothing to blur');
  assert.ok(/\.world-near::after \{ content: ''; position: sticky; bottom: 0;[^}]*height: 28px; margin-top: -32px; pointer-events: none; opacity: 0;/.test(css)
    && /\.world-near\.more::after \{ opacity: 1; \}/.test(css), 'a veil over the rows at the foot, which never changes what scrolls');
  assert.ok(/\.world-near > \.world-ways \{ pointer-events: none; \}\n\.world-ways > \.world-way \{ pointer-events: auto; \}/.test(css),
    'the ways\' box passes a tap beside a short way to the ground; each way takes its own');
  // the fade is read a frame later, never where the place was just written
  const place = wv.slice(wv.indexOf('  function placeSide() {'), wv.indexOf('  function askNear() {'));
  assert.ok(!/fadeNear\(\)/.test(place) && place.includes('fadeSoon();'), 'placeSide asks for the fade on the next frame');
  assert.ok(/function fadeSoon\(\) \{\s+if \(!fadeFrame\) fadeFrame = requestAnimationFrame\(fadeNear\);/.test(wv), 'one read a frame');
  assert.ok(/addEventListener\('scroll', fadeSoon, \{ passive: true \}\)/.test(wv));
  const overlay = wv.slice(wv.indexOf('  function renderOverlay() {'), wv.indexOf('  // THE RIGHT SIDE OF THE ROOM (world-side.js)'));
  assert.ok(!/fadeNear\(\)/.test(overlay) && overlay.includes('fadeSoon();'), 'and so does a new list');
});

console.log(`\n${passed} checks passed.`);
