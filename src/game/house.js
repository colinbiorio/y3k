// house.js — THE SECOND BUILDING, AS NUMBERS: its frame, what of it is solid,
// where the light gets in, how it goes up. No page, no three (the suite runs
// it); buildings/house.js draws it.
//
// GAME.md, stage 3: "about six by nine metres on low stone piers: a timber
// frame, walls of woven reed and lime plaster, a steep thatched roof whose
// ridge is a line of dark glass solar tiles, a covered porch, one round window.
// Inside: a main room and a loft, a wooden table and two stools, a bed with a
// woven blanket, a ladder, a small ceramic stove with a ring of light."
//
// Its own frame: the middle of its floor plan at the origin, Y up, the porch
// and its steps at +Z (it is built facing whoever builds it). Metres. The six
// by nine metres are the platform on its piers; the roof reaches past it.
// The porch is the platform's front 1.8 m, under the roof, open on three sides;
// behind it the room, open to the roof but for the loft over its back.
import { solveBoxes, inBox, rayBox } from './solids.js';

export const HOUSE = {
  half: 3.0, wall: 0.2,                     // the side walls' outer faces at x = ±3, a fifth of a metre thick
  back: -4.5, front: 4.5, porch: 2.7,       // z: the platform's back and front; the room's front wall's outer face (the porch before it)
  floor: 0.5,                               // the floor's top, on stone piers over the water
  top: 3.0,                                 // the walls' top (the wall plate), and the porch ceiling's underside
  pitch: 52,                                // the roof's slope, in degrees: steep, as thatch must be
  plate: 2.9,                               // where on each side the rafters rest on the wall plate (|x|)
  thatch: 0.35,                             // the thatch's depth
  eave: 3.55, end: 4.95,                    // how far the roof reaches: |x| at its eaves, |z| at its ends
  door: { half: 0.5, high: 2.6 },           // the doorway in the room's front wall: a metre wide, 2.1 m above the floor
  window: { z: -0.4, y: 2.05, r: 0.42 },    // the round window, in the right wall (+x)
  loft: { z: -1.6, under: 3.0, top: 3.12 }, // the loft over the room's back, to z; its underside and its floor's top
  ladder: { x: -1.0, half: 0.25, z: -1.52 },// against the loft's front edge: its middle, half its width, the face a body climbs
  stove: { x: -2.2, z: 1.9, ring: 1.45 },   // the stove's middle, and the height of its ring of light
  build: { piers: 1.0, frame: 2.4, walls: 3.6, roof: 5.0, done: 6.2, down: 1.8 },   // seconds
};
const H = HOUSE, IN = H.half - H.wall, ROOM = { z0: H.back + H.wall, z1: H.porch - H.wall };
export const TAN = Math.tan((H.pitch * Math.PI) / 180), RISE = H.thatch / Math.cos((H.pitch * Math.PI) / 180);
// the roof's underside and its top, at a distance ax = |x| from the ridge's line
export const roofIn = (ax) => H.top + (H.plate - ax) * TAN;
export const roofOut = (ax) => roofIn(ax) + RISE;
export const RIDGE = roofOut(0);
export const FOOT = 6.4;                    // m: a circle round its middle that holds all of it (for building beside another)
export const REACH_Z = 5.1;                 // its front: the outer step's edge

const box = (x0, x1, z0, z1, y0, y1, part = '') => ({ x0, x1, z0, z1, y0, y1, part });
export const RAIL = H.plate - (H.loft.top + 0.9 - H.top) / TAN;      // |x| where the roof's underside comes down to the rail's top
// what a body meets (and what the eye may not enter): the platform and its steps, the walls, the porch, the loft and the things
export const SOLIDS = [
  box(-H.half, H.half, H.back, H.front, 0, H.floor, 'platform'),
  box(-H.half, H.half, H.front, 4.8, 0, 0.34, 'step'), box(-H.half, H.half, 4.8, REACH_Z, 0, 0.17, 'step'),
  box(-H.half, -IN, H.back, H.porch, H.floor, H.top, 'wall'), box(IN, H.half, H.back, H.porch, H.floor, H.top, 'wall'),
  box(-H.half, H.half, H.back, ROOM.z0, H.floor, RIDGE, 'gable'),
  box(-H.half, -H.door.half, ROOM.z1, H.porch, H.floor, RIDGE, 'gable'), box(H.door.half, H.half, ROOM.z1, H.porch, H.floor, RIDGE, 'gable'),
  box(-H.door.half, H.door.half, ROOM.z1, H.porch, H.door.high, RIDGE, 'lintel'),
  box(-IN, IN, ROOM.z0, H.loft.z, H.loft.under, H.loft.top, 'loft'),
  // the loft's rail, from the ladder's gap out to where the roof comes down to meet it (beyond, no one stands)
  box(-RAIL, -1.4, H.loft.z - 0.06, H.loft.z, H.loft.top, H.loft.top + 0.85, 'rail'), box(-0.6, RAIL, H.loft.z - 0.06, H.loft.z, H.loft.top, H.loft.top + 0.85, 'rail'),
  box(H.ladder.x - H.ladder.half, H.ladder.x + H.ladder.half, H.loft.z, H.ladder.z, H.floor, H.loft.top, 'ladder'),
  box(-2.98, -2.78, 4.28, 4.48, H.floor, H.top, 'post'), box(2.78, 2.98, 4.28, 4.48, H.floor, H.top, 'post'),
  box(-H.half, H.half, H.porch, H.front, H.top, H.top + 0.1, 'ceiling'),
  box(-H.door.half - 0.03, -H.door.half + 0.1, H.porch - H.wall - 0.95, H.porch - H.wall, H.floor, H.door.high, 'door'),     // the door, open against the wall inside
  box(1.0, 1.8, -0.3, 1.1, H.floor, H.floor + 0.76, 'table'),
  box(1.22, 1.58, 1.25, 1.61, H.floor, H.floor + 0.45, 'stool'), box(1.22, 1.58, -0.81, -0.45, H.floor, H.floor + 0.45, 'stool'),
  box(H.stove.x - 0.33, H.stove.x + 0.33, H.stove.z - 0.33, H.stove.z + 0.33, H.floor, H.floor + 0.95, 'stove'),
  box(0.2, 1.2, -4.2, -2.2, H.loft.top, H.loft.top + 0.48, 'bed'),
];

// a world point in the house's own frame, and back (b: { x, z, yaw }; its front faces +Z turned by yaw)
export function toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
export function toWorld(b, lx, lz) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + c * lx + s * lz, b.z - s * lx + c * lz]; }

// built facing whoever builds it, its steps a stride and a half in front
export function placeHouse(body, gap = 1.5) {
  const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw), d = REACH_Z + gap;
  return { kind: 'house', x: body.p[0] + fx * d, z: body.p[2] + fz * d, yaw: body.yaw + Math.PI, t: 0, down: -1 };
}
export const doorWorld = (b) => toWorld(b, 0, H.porch);

// the room's air: inside its walls and under its roof, not in the loft's floor
export function inRoom(lx, y, lz, m = 0) {
  if (Math.abs(lx) > IN - m || lz < ROOM.z0 + m || lz > ROOM.z1 - m || y < H.floor + m || y > roofIn(Math.abs(lx)) - m) return false;
  return !(lz < H.loft.z + m && y > H.loft.under - m && y < H.loft.top + m);
}
// the porch's air: under its ceiling, between its posts
export const inPorch = (lx, y, lz, m = 0) => Math.abs(lx) < H.half - m && lz > H.porch + m && lz < H.front + 0.4 && y > H.floor + m && y < H.top - m;
// the doorway's air
export const inDoorway = (lx, y, lz, m = 0) => Math.abs(lx) < H.door.half - m && lz > ROOM.z1 - 0.3 && lz < H.porch + 0.3 && y > H.floor + m && y < H.door.high - m;

// INSIDE: a body's feet (at y) in the room
export function inside(b, x, z, y = 0) { const [lx, lz] = toLocal(b, x, z); return inRoom(lx, Math.max(y, H.floor) + 0.05, lz); }

// What a body may not go into, and what it stands on (as shelter.js's solve). The boxes do most of it (solids.js);
// the roof's slope keeps a head under it in the room and is stood on from above; a ladder is climbed (s.climb).
export function solve(b, p, was, rad = 0.3, tall = 1.7, stepUp = 0.35) {
  let [lx, lz] = toLocal(b, p[0], p[2]);
  const y = p[1];
  if (Math.abs(lx) > H.eave + rad + 0.6 || lz > REACH_Z + rad + 0.6 || lz < -H.end - rad - 0.6) return { p, floor: 0, ceiling: Infinity, hit: false, climb: null };
  const [wx, wz] = toLocal(b, was[0], was[2]), wy = was[1];
  let floor = 0, ceiling = Infinity, hit = false;
  const roomBefore = inRoom(wx, wy + 0.05, wz);
  // the roof from above: whatever was over it stands on it
  const overRoof = Math.abs(wx) < H.eave + rad && Math.abs(wz) < H.end + rad && wy >= roofOut(Math.max(0, Math.abs(wx) - rad * 0.5)) - 0.05 && wy > H.top;
  if (overRoof) {
    floor = Math.max(floor, roofOut(Math.max(0, Math.abs(lx) - rad * 0.5)));
  } else {
    const r = solveBoxes(SOLIDS, lx, lz, y, wy, rad, tall, stepUp);
    lx = r.lx; lz = r.lz; hit = r.hit;
    if (r.floor > -Infinity) floor = Math.max(floor, r.floor);
    ceiling = Math.min(ceiling, r.ceiling);
    if (roomBefore) {
      // in the room the roof comes down to the walls: the head keeps under it
      const head = Math.max(y, wy) + tall, lim = Math.min(IN, H.plate - Math.max(0, head - H.top) / TAN) - rad;
      if (lim > 0 && Math.abs(lx) > lim) { lx = Math.sign(lx) * lim; hit = true; }
      ceiling = Math.min(ceiling, roofIn(Math.min(IN, Math.abs(lx) + rad)));
    } else if (y + tall > H.top - 0.3 && Math.abs(lx) < H.eave + rad && Math.abs(lz) < H.end + rad && y < roofOut(Math.max(0, Math.abs(lx) - rad))) {
      // outside, at the roof's height (flying): out of the thatch the short way, across or along
      const ax = Math.abs(lx), toSide = H.plate + (H.top + RISE - y) / TAN + rad - ax, toEnd = H.end + rad - Math.abs(lz);
      if (toSide > 0 && toEnd > 0) { if (toSide < toEnd) lx = Math.sign(lx || 1) * (ax + toSide); else lz = Math.sign(lz || 1) * (H.end + rad); hit = true; }
    }
  }
  // the ladder: a body in front of it, inside the room, may climb it (body.js)
  const L = H.ladder, atLadder = roomBefore && Math.abs(lx - L.x) < L.half + 0.15 && lz > L.z - 0.05 && lz < L.z + rad + 0.25 && y < H.loft.top + 0.05;
  const [x, z] = toWorld(b, lx, lz);
  return { p: [x, y, z], floor, ceiling, hit, climb: atLadder ? { dir: [-Math.sin(b.yaw), -Math.cos(b.yaw)], top: H.loft.top, base: H.floor } : null };
}

// What of a point is solid to the eye: in a wall, the roof, the floor or a thing; not the room's air, the porch's or the doorway's.
export function solid(b, q, m = 0.15) {
  const [lx, lz] = toLocal(b, q[0], q[2]), y = q[1], ax = Math.abs(lx);
  if (inRoom(lx, y, lz, m) || inPorch(lx, y, lz, m) || inDoorway(lx, y, lz, m)) {
    for (const s of SOLIDS) if (s.part !== 'gable' && s.part !== 'wall' && s.part !== 'platform' && inBox(s, lx, y, lz, m * 0.5)) return true;
    return false;
  }
  if (ax < H.eave + m && Math.abs(lz) < H.end + m && y > roofIn(ax) - m && y < roofOut(ax) + m) return true;            // the thatch
  if (ax < H.half + m && lz > H.back - m && lz < H.front + m && y < roofOut(ax) + m && y > -1) return true;               // the walls, the floor
  for (const s of SOLIDS) if (inBox(s, lx, y, lz, m)) return true;
  return false;
}
// Where the eye may stand, looking at a body from `from` toward `to`: a body in the room keeps the eye in the room
// with it; elsewhere it is kept out of what is solid.
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

// The sun in the room: from a point in it, toward the sun (a unit vector, up positive), does the ray leave by the
// round window, or by the doorway and then out of the porch beneath its ceiling? 1 lit, 0 in the house's shade.
export function sunIn(b, x, y, z, sun, doorOpen = 1) {
  if (sun[1] <= 0) return 0;
  const [lx, lz] = toLocal(b, x, z), c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const d = [c * sun[0] - s * sun[2], sun[1], s * sun[0] + c * sun[2]];
  return sunLocal(lx, y, lz, d, doorOpen);
}
export function sunLocal(lx, y, lz, d, doorOpen = 1) {
  if (d[1] <= 0) return 0;
  const W = H.window;
  // the ray's way out of the room: a side wall, an end wall, or the roof on the side it is going
  const tx = d[0] > 1e-9 ? (IN - lx) / d[0] : d[0] < -1e-9 ? (-IN - lx) / d[0] : Infinity;
  const tz = d[2] > 1e-9 ? (ROOM.z1 - lz) / d[2] : d[2] < -1e-9 ? (ROOM.z0 - lz) / d[2] : Infinity;
  let tr = Infinity;
  for (const sg of [1, -1]) {                                                  // the roof's two planes: y + TAN·sg·x = top + plate·TAN
    const den = d[1] + TAN * sg * d[0], t = den > 1e-9 ? (H.top + H.plate * TAN - y - TAN * sg * lx) / den : Infinity;
    if (t > 0 && t < tr && sg * (lx + d[0] * t) >= -1e-6) tr = t;
  }
  // the loft's floor in the way
  const loft = { x0: -IN, x1: IN, z0: ROOM.z0, z1: H.loft.z, y0: H.loft.under, y1: H.loft.top };
  const tl = rayBox(loft, [lx, y, lz], d);
  const t = Math.min(tx, tz, tr);
  if (tl < t) return 0;
  const ex = lx + d[0] * t, ey = y + d[1] * t, ez = lz + d[2] * t;
  if (t === tx && d[0] > 0) return Math.hypot(ez - W.z, ey - W.y) < W.r ? 1 : 0;              // the round window
  if (t === tz && d[2] > 0 && Math.abs(ex) < H.door.half && ey < H.door.high) {
    // through the doorway, then out of the porch: by its open front or sides, or not, by its ceiling
    const pz = (H.front - ez) / d[2], px = Math.abs(d[0]) > 1e-9 ? (Math.sign(d[0]) * H.half - ex) / d[0] : Infinity, py = (H.top - ey) / d[1];
    return py < Math.min(pz, px) ? 0 : doorOpen;
  }
  return 0;
}

// How it goes up: the piers, the frame, the walls, the roof, the rest (0..1 each); taken down, all go together
export function phase(b) {
  const B = H.build, k = (a, z, t) => Math.max(0, Math.min(1, (t - a) / (z - a)));
  if (b.down >= 0) { const u = 1 - Math.min(1, b.down / B.down); return { piers: u, frame: u, walls: u, roof: u, rest: u, gone: b.down >= B.down }; }
  return { piers: k(0, B.piers, b.t), frame: k(B.piers, B.frame, b.t), walls: k(B.frame, B.walls, b.t), roof: k(B.walls, B.roof, b.t), rest: k(B.roof, B.done, b.t), gone: false };
}
// what it rests on is dry ground: its platform and its steps
export const dry = (b, x, z) => { const [lx, lz] = toLocal(b, x, z); return Math.abs(lx) < H.half && lz > H.back && lz < REACH_Z; };
