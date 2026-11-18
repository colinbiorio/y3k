// hall.js — THE FIFTH BUILDING, AS NUMBERS: its terraces and stairs, the
// hangar in the lowest of them, the hall on top, what of it is solid, where
// the light gets in, how it goes up. No page, no three (the suite runs it);
// buildings/hall.js draws it.
//
// GAME.md, stage 3: "a great hall on a stepped platform: three broad terraces
// of pale limestone planted with low gardens, wide stairs up the middle, on top
// a long hall about thirty by forty metres with tall laminated-timber arches, a
// band of clear glass under a roof of dark solar tiles, and in the lowest
// terrace a wide arched hangar mouth. Inside: a vast long room under the timber
// arches, a long wooden table, a central stone hearth with a steady plasma
// flame, stone columns, woven hangings."
//
// Its own frame: the middle of its plan at the origin, Y up, its stairs at +Z
// (it is built facing whoever builds it). Metres. The lowest terrace is the
// tallest: it holds the hangar, whose arched mouth opens in the middle of its
// front, and two flights of stairs climb it either side of the mouth; from its
// top the stairs go on up the middle of the two lower terraces above to the
// hall's door. Along each terrace's edge runs a garden bed. The hall's stone
// walls rise to a band of glass along both sides under the eaves; its roof
// rests on seven timber arches springing from stone columns. A body may stand
// on the roof from above, as on the house's.
import { solveBoxes, inBox } from './solids.js';

export const HALL = {
  terraces: [{ hx: 27, hz: 32, top: 4.6 }, { hx: 23, hz: 28, top: 5.8 }, { hx: 19, hz: 24, top: 7.0 }],   // half sizes; tops
  half: 15, wall: 0.6, back: -20, front: 20,  // the hall's walls' outer faces
  high: 4.5, band: 2.0,                       // its stone walls' height over its floor, and the glass over them
  eave: 15.6, end: 20.6, ridge: 17.0, thick: 0.45,   // the roof: its reach across and along; its ridge's underside over the floor
  door: { half: 2.0, high: 5.0 },             // the door in the front gable
  columns: { x: 12.5, zs: [-15, -10, -5, 0, 5, 10, 15], r: 0.4, high: 5.0 },   // the arches spring from their tops
  table: { half: 1.0, z0: -17, z1: -5, top: 0.78 },
  bench: { x: 1.55, half: 0.22, top: 0.46 },
  hearth: { z: 3, half: 1.3, top: 0.5 },
  hangar: { half: 11, mouth: 9, back: 0, ceil: 4.0, spring: 2.2, front: 0.6 },   // inside half-width; the mouth's; its back; its ceiling; the arch
  lower: { x0: 11, x1: 17, rise: 0.23, going: 0.45, steps: 20 },     // the two flights up the lowest terrace, either side of the mouth
  upper: { half: 6, rise: 0.24, going: 0.45, steps: 5 },             // the middle flights up the two terraces above
  bed: { wide: 1.6, high: 0.4 },              // the garden beds along the terraces' edges
  build: { base: 2.0, walls: 4.0, arches: 5.5, roof: 7.0, done: 8.5, down: 2.5 },   // seconds
};
const W = HALL, [T1, T2, T3] = W.terraces, HG = W.hangar, D = W.door, LO = W.lower, UP = W.upper;
export const P = T3.top;                       // the hall's floor
export const IN = W.half - W.wall, BACK_IN = W.back + W.wall, FRONT_IN = W.front - W.wall;
export const WALL_TOP = P + W.high, EAVE_Y = P + W.high + W.band;
export const TAN = (W.ridge - W.high - W.band) / W.eave, RISE = W.thick * Math.sqrt(1 + TAN * TAN);
export const roofIn = (ax) => EAVE_Y + (W.eave - ax) * TAN;
export const roofOut = (ax) => roofIn(ax) + RISE;
export const RIDGE = roofOut(0);
export const REACH_Z = T1.hz + LO.steps * LO.going;          // its front: the foot of the lower flights (41)
export const FOOT = 45;                                      // m: a circle round its middle that holds all of it
// the hangar mouth's arch over a point across it
export const archTop = (x) => HG.spring + (HG.ceil - HG.spring) * Math.sqrt(Math.max(0, 1 - (x / HG.mouth) ** 2));

const box = (x0, x1, z0, z1, y0, y1, part = '') => ({ x0, x1, z0, z1, y0, y1, part });
const S = [];
// the lowest terrace round the hangar, its roof, the mouth's jambs, the hangar's floor; the two terraces above
S.push(box(-T1.hx, -HG.half, -T1.hz, T1.hz, 0, T1.top, 'terrace'), box(HG.half, T1.hx, -T1.hz, T1.hz, 0, T1.top, 'terrace'),
  box(-HG.half, HG.half, -T1.hz, HG.back, 0, T1.top, 'terrace'), box(-HG.half, HG.half, HG.back, T1.hz, HG.ceil, T1.top, 'vault'),
  box(-HG.half, -HG.mouth, T1.hz - HG.front, T1.hz, 0, HG.ceil, 'jamb'), box(HG.mouth, HG.half, T1.hz - HG.front, T1.hz, 0, HG.ceil, 'jamb'),
  box(-HG.half, HG.half, HG.back, T1.hz, 0, 0.05, 'apron'),
  box(-T2.hx, T2.hx, -T2.hz, T2.hz, T1.top, T2.top, 'terrace'), box(-T3.hx, T3.hx, -T3.hz, T3.hz, T2.top, T3.top, 'terrace'));
// the stairs: the lower flights, from the ground at their foot to the lowest terrace's top; the middle flights above
for (let k = 1; k <= LO.steps; k++) for (const sx of [-1, 1]) {
  const z0 = T1.hz + (LO.steps - k) * LO.going, xa = sx > 0 ? LO.x0 : -LO.x1, xb = sx > 0 ? LO.x1 : -LO.x0;
  S.push(box(xa, xb, z0, z0 + LO.going, 0, k * LO.rise, 'step'));
}
for (const [t, base] of [[T2, T1.top], [T3, T2.top]]) for (let k = 1; k <= UP.steps; k++) {
  const z0 = t.hz + (UP.steps - k) * UP.going; S.push(box(-UP.half, UP.half, z0, z0 + UP.going, base, base + k * UP.rise, 'step'));
}
// the garden beds along each terrace's edge (but where the stairs come and go: the lowest terrace's front is clear between
// its two flights, for the way across to the middle stairs)
const B = W.bed;
for (const [t, top, gaps] of [[T1, T1.top, [[-LO.x1, LO.x1]]], [T2, T2.top, [[-UP.half, UP.half]]], [T3, T3.top, [[-UP.half, UP.half]]]]) {
  const y0 = top, y1 = top + B.high, cuts = [-t.hx, ...gaps.flat(), t.hx];
  for (let i = 0; i < cuts.length; i += 2) S.push(box(cuts[i], cuts[i + 1], t.hz - B.wide, t.hz, y0, y1, 'bed'));
  S.push(box(-t.hx, t.hx, -t.hz, -t.hz + B.wide, y0, y1, 'bed'));
  for (const sx of [-1, 1]) S.push(box(sx > 0 ? t.hx - B.wide : -t.hx, sx > 0 ? t.hx : -t.hx + B.wide, -t.hz + B.wide, t.hz - B.wide, y0, y1, 'bed'));
}
// the hall: its side walls (and the glass over them), its gables up to the ridge, the door's lintel
S.push(box(-W.half, -IN, W.back, W.front, P, EAVE_Y, 'wall'), box(IN, W.half, W.back, W.front, P, EAVE_Y, 'wall'),
  box(-W.half, W.half, W.back, BACK_IN, P, RIDGE, 'gable'),
  box(-W.half, -D.half, FRONT_IN, W.front, P, RIDGE, 'gable'), box(D.half, W.half, FRONT_IN, W.front, P, RIDGE, 'gable'),
  box(-D.half, D.half, FRONT_IN, W.front, P + D.high, RIDGE, 'lintel'));
// the columns, the long table and its two benches, the hearth
const C = W.columns;
for (const sx of [-1, 1]) for (const z of C.zs) S.push(box(sx * C.x - C.r, sx * C.x + C.r, z - C.r, z + C.r, P, P + C.high, 'column'));
S.push(box(-W.table.half, W.table.half, W.table.z0, W.table.z1, P, P + W.table.top, 'table'));
for (const sx of [-1, 1]) S.push(box(sx * W.bench.x - W.bench.half, sx * W.bench.x + W.bench.half, W.table.z0, W.table.z1, P, P + W.bench.top, 'bench'));
S.push(box(-W.hearth.half, W.hearth.half, W.hearth.z - W.hearth.half, W.hearth.z + W.hearth.half, P, P + W.hearth.top, 'hearth'));
export const SOLIDS = S;
const THINGS = new Set(['column', 'table', 'bench', 'hearth']);

// a world point in the hall's own frame, and back (b: { x, z, yaw }; its front faces +Z turned by yaw)
export function toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
export function toWorld(b, lx, lz) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + c * lx + s * lz, b.z - s * lx + c * lz]; }

// built facing whoever builds it, the foot of its stairs a stride and a half in front
export function placeHall(body, gap = 1.5) {
  const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw), d = REACH_Z + gap;
  return { kind: 'hall', x: body.p[0] + fx * d, z: body.p[2] + fz * d, yaw: body.yaw + Math.PI, t: 0, down: -1 };
}
export const doorWorld = (b) => toWorld(b, 0, W.front);
export const mouthWorld = (b) => toWorld(b, 0, T1.hz);
// whether a body at p is near enough the hall's door for its leaves to swing open (within 4 m of it, or inside the hall's walls)
export function opens(b, p) { const [lx, lz] = toLocal(b, p[0], p[2]); return Math.hypot(lx, lz - W.front) < 4 || (Math.abs(lx) < IN && lz > BACK_IN && lz < FRONT_IN); }

// the hall's air, under its roof; the hangar's; the mouth's, under its arch; the doorway's
export const inRoom = (lx, y, lz, m = 0) => Math.abs(lx) < IN - m && lz > BACK_IN + m && lz < FRONT_IN - m && y > P + m && y < roofIn(Math.abs(lx)) - m;
export const inHangar = (lx, y, lz, m = 0) => Math.abs(lx) < HG.half - m && lz > HG.back + m && lz < T1.hz - HG.front - m && y > 0.05 + m && y < HG.ceil - m;
const inMouth = (lx, y, lz, m = 0) => Math.abs(lx) < HG.mouth - m && lz > T1.hz - HG.front - 0.3 && lz < T1.hz + 0.4 && y > 0.05 + m && y < archTop(lx) - m;
const inDoorway = (lx, y, lz, m = 0) => Math.abs(lx) < D.half - m && lz > FRONT_IN - 0.3 && lz < W.front + 0.3 && y > P + m && y < P + D.high - m;

// INSIDE: a body's feet (at y) in the hall or in the hangar
export function inside(b, x, z, y = 0) {
  const [lx, lz] = toLocal(b, x, z);
  return inRoom(lx, Math.max(y, P) + 0.05, lz) || (y < HG.ceil - 1 && inHangar(lx, Math.max(y, 0.05) + 0.05, lz));
}

// What a body may not go into, and what it stands on (as house.js's solve): the boxes do most of it (solids.js); the
// roof keeps a head under it in the hall and is stood on from above; the mouth's arch is a ceiling from below.
export function solve(b, p, was, rad = 0.3, tall = 1.7, stepUp = 0.35) {
  let [lx, lz] = toLocal(b, p[0], p[2]);
  const y = p[1];
  if (Math.abs(lx) > T1.hx + rad + 0.6 || lz > REACH_Z + rad + 0.6 || lz < -T1.hz - rad - 0.6) return { p, floor: 0, ceiling: Infinity, hit: false, climb: null };
  const [wx, wz] = toLocal(b, was[0], was[2]), wy = was[1];
  let floor = 0, ceiling = Infinity, hit = false;
  const roomBefore = inRoom(wx, wy + 0.05, wz);
  const overRoof = Math.abs(wx) < W.eave + rad && Math.abs(wz) < W.end + rad && wy >= roofOut(Math.max(0, Math.abs(wx) - rad * 0.5)) - 0.05 && wy > EAVE_Y;
  if (overRoof) {
    floor = Math.max(floor, roofOut(Math.max(0, Math.abs(lx) - rad * 0.5)));
  } else {
    const r = solveBoxes(SOLIDS, lx, lz, y, wy, rad, tall, stepUp);
    lx = r.lx; lz = r.lz; hit = r.hit;
    if (r.floor > -Infinity) floor = Math.max(floor, r.floor);
    ceiling = Math.min(ceiling, r.ceiling);
    if (roomBefore) {
      // in the hall the roof comes down to the walls: a head (flying) keeps under it
      const head = Math.max(y, wy) + tall, lim = Math.min(IN, W.eave - Math.max(0, head - EAVE_Y) / TAN) - rad;
      if (lim > 0 && Math.abs(lx) > lim) { lx = Math.sign(lx) * lim; hit = true; }
      ceiling = Math.min(ceiling, roofIn(Math.min(IN, Math.abs(lx) + rad)));
    } else if (Math.abs(lx) < W.eave + rad && Math.abs(lz) < W.end + rad && y < roofOut(Math.max(0, Math.abs(lx) - rad)) && y + tall > EAVE_Y - 0.3) {
      const under = (ax) => roofIn(Math.min(W.eave, ax + rad));
      if (wy + tall <= under(Math.abs(wx)) + 0.02) ceiling = Math.min(ceiling, under(Math.abs(lx)));      // under the eaves, from below
      else {
        // at the roof's height (flying): out of it the short way, across or along
        const ax = Math.abs(lx), toSide = W.eave + (EAVE_Y + RISE - y) / TAN + rad - ax, toEnd = W.end + rad - Math.abs(lz);
        if (toSide > 0 && toEnd > 0) { if (toSide < toEnd) lx = Math.sign(lx || 1) * (ax + toSide); else lz = Math.sign(lz || 1) * (W.end + rad); hit = true; }
      }
    }
    // the hangar's mouth: its arch is a ceiling to whatever comes up under it, and kept out of from beside
    if (Math.abs(lx) < HG.mouth && lz > T1.hz - HG.front - rad && lz < T1.hz + rad && y < HG.ceil) {
      const top = archTop(Math.min(HG.mouth, Math.abs(lx) + rad));
      if (wy + tall <= top + 0.02) ceiling = Math.min(ceiling, top);
      else if (y + tall > top) { lz = wz > T1.hz - HG.front / 2 ? T1.hz + rad : T1.hz - HG.front - rad; hit = true; }
    }
  }
  const [x, z] = toWorld(b, lx, lz);
  return { p: [x, y, z], floor, ceiling, hit, climb: null };
}

// A wall a body could run along (body.js): the nearest of the terraces' faces and the hall's walls whose face the body's
// middle is beside (from 0.5 m over its feet to 1.2 m), within `reach` of its side. As house.js's wall.
export function wall(b, p, rad = 0.3, reach = 0.22) {
  const [lx, lz] = toLocal(b, p[0], p[2]), lo = p[1] + 0.5, hi = p[1] + 1.2;
  let best = null;
  for (const s of SOLIDS) {
    if (s.part !== 'terrace' && s.part !== 'wall' && s.part !== 'gable') continue;
    const cx = Math.max(s.x0, Math.min(lx, s.x1)), cz = Math.max(s.z0, Math.min(lz, s.z1)), dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz);
    const top = s.part === 'gable' ? Math.min(s.y1, roofIn(Math.abs(cx)) + 0.15) : s.y1;
    if (s.y0 > lo || top < hi || d < 1e-6 || d > rad + reach) continue;
    if (!best || d < best.d) best = { d, x: dx / d, z: dz / d };
  }
  if (!best) return null;
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  return { d: best.d, n: [c * best.x + sn * best.z, -sn * best.x + c * best.z] };
}

// What of a point is solid to the eye: the hall's walls and roof, the terraces, stairs and beds, the things; not the
// hall's air, its doorway's, the hangar's or its mouth's.
export function solid(b, q, m = 0.15) {
  const [lx, lz] = toLocal(b, q[0], q[2]), y = q[1], ax = Math.abs(lx);
  if (inRoom(lx, y, lz, m) || inDoorway(lx, y, lz, m) || inHangar(lx, y, lz, m) || inMouth(lx, y, lz, m)) {
    for (const s of SOLIDS) if (THINGS.has(s.part) && inBox(s, lx, y, lz, m * 0.5)) return true;
    return false;
  }
  if (ax < W.eave + m && Math.abs(lz) < W.end + m && y > roofIn(ax) - m && y < roofOut(ax) + m) return true;          // the roof
  if (ax < W.half + m && lz > W.back - m && lz < W.front + m && y > P - m && y < roofIn(ax)) return true;                // the walls
  for (const s of SOLIDS) if (inBox(s, lx, y, lz, m)) return true;
  return false;
}
// Where the eye may stand, looking at a body from `from` toward `to`: a body in the hall keeps the eye in the hall with
// it (it is big enough to); elsewhere the eye is kept out of what is solid.
export function eyeRoom(b, from, to, m = 0.15) {
  const [fx, fz] = toLocal(b, from[0], from[2]), roomed = inRoom(fx, from[1], fz, m);
  const bad = roomed ? (q) => { const [lx, lz] = toLocal(b, q[0], q[2]); return !inRoom(lx, q[1], lz, m) || solid(b, q, m); } : (q) => solid(b, q, m);
  const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  let lo = 0, hi = 1, found = false;
  for (let i = 1; i <= 40; i++) { const t = i / 40; if (bad(at(t))) { hi = t; lo = (i - 1) / 40; found = true; break; } }
  if (!found) return 1;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (bad(at(mid))) hi = mid; else lo = mid; }
  return lo;
}

// The sun inside: in the hangar, only by its mouth; in the hall, by the glass over its side walls (and on out under the
// eaves) or by the open door. 1 lit, 0 not.
export function sunIn(b, x, y, z, sun, doorOpen = 1) {
  if (sun[1] <= 0) return 0;
  const [lx, lz] = toLocal(b, x, z), c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return sunLocal(lx, y, lz, [c * sun[0] - s * sun[2], sun[1], s * sun[0] + c * sun[2]], doorOpen);
}
export function sunLocal(lx, y, lz, d, doorOpen = 1) {
  if (d[1] <= 0) return 0;
  if (y < HG.ceil + 0.05) {
    // the hangar: the ray must reach the mouth's plane before its side walls or its ceiling
    if (d[2] <= 1e-9) return 0;
    const t = (T1.hz - lz) / d[2], ex = lx + d[0] * t, ey = y + d[1] * t;
    const tw = Math.abs(d[0]) > 1e-9 ? (Math.sign(d[0]) * HG.half - lx) / d[0] : Infinity, tc = (HG.ceil - y) / d[1];
    return Math.min(tw, tc) > t - (HG.front + 0.01) / d[2] && Math.abs(ex) < HG.mouth && ey < archTop(ex) ? 1 : 0;
  }
  const tx = d[0] > 1e-9 ? (IN - lx) / d[0] : d[0] < -1e-9 ? (-IN - lx) / d[0] : Infinity;
  const tz = d[2] > 1e-9 ? (FRONT_IN - lz) / d[2] : d[2] < -1e-9 ? (BACK_IN - lz) / d[2] : Infinity;
  let tr = Infinity;
  for (const sg of [1, -1]) {                                                 // the roof's two planes: y + TAN·sg·x = EAVE_Y + eave·TAN
    const den = d[1] + TAN * sg * d[0], t = den > 1e-9 ? (EAVE_Y + W.eave * TAN - y - TAN * sg * lx) / den : Infinity;
    if (t > 0 && t < tr && sg * (lx + d[0] * t) >= -1e-6) tr = t;
  }
  const t = Math.min(tx, tz, tr);
  if (t === tx) {
    const ey = y + d[1] * t;
    if (ey < WALL_TOP || ey > EAVE_Y) return 0;                                 // the stone wall, or (never) the roof
    const te = (W.eave - Math.abs(lx)) / Math.abs(d[0]);
    return y + d[1] * te < EAVE_Y ? 1 : 0;                                      // on out under the eaves
  }
  if (t === tz && d[2] > 0) { const ex = lx + d[0] * t, ey = y + d[1] * t; return Math.abs(ex) < D.half && ey < P + D.high ? doorOpen : 0; }
  return 0;
}

// How it goes up: the terraces and their stairs, the hall's walls and columns, the arches one after another, the roof
// and the glass, the things and the gardens. Taken down, it goes the same way backward.
export function phase(b) {
  const Bd = W.build, k = (a, z, t) => Math.max(0, Math.min(1, (t - a) / (z - a)));
  const t = b.down >= 0 ? Bd.done * (1 - Math.min(1, b.down / Bd.down)) : b.t;
  return { base: k(0, Bd.base, t), walls: k(Bd.base, Bd.walls, t), arches: k(Bd.walls, Bd.arches, t), roof: k(Bd.arches, Bd.roof, t), rest: k(Bd.roof, Bd.done, t), gone: b.down >= Bd.down };
}
// what it rests on is dry ground: its terraces and its stairs
export const dry = (b, x, z) => { const [lx, lz] = toLocal(b, x, z); return Math.abs(lx) < T1.hx && lz > -T1.hz && lz < REACH_Z; };
