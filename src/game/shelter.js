// shelter.js — THE FIRST BUILDING, AS NUMBERS: its shape, what of it is solid,
// where light gets into it, and how it goes up. No page, no three (the suite
// runs it); buildings/shelter.js draws it.
//
// GAME.md, stage 3: "a low round dome about four metres across: a dry-stone
// base, walls and roof of smooth rammed earth, a round skylight of clear glass
// with a thin bronze rim, one small wooden door, a strip of dark solar cloth
// stretched as an awning. Inside: one round room, a woven sleeping mat, a low
// stone hearth holding a small steady plasma flame, one shelf with clay jars."
// Ancient (dry stone, rammed earth), present (glass, bronze, a solar awning)
// and to come (the plasma hearth) at once.
//
// Its own frame: the centre of its floor at the origin, Y up, the door at +Z
// (it is built facing whoever builds it). Metres. The world's floor is y = 0, under an inch of water (body.js); the
// shelter's floor is laid just above the water, so inside it is dry.

export const SHELTER = {
  out: 2.0, in: 1.75,              // the walls' outer and inner radius (four metres across, walls a quarter metre thick)
  base: 0.6,                       // the dry-stone ring's height
  top: 2.75, topIn: 2.55,          // the dome's height outside and inside
  floor: 0.03,                     // the floor inside, just above the water
  door: { half: 0.5, high: 1.85 }, // the doorway: a metre wide and 1.85 m high, through the wall at +Z
  sky: 0.32,                       // the skylight's radius
  hearth: { x: 0, z: -0.78, r: 0.42, flame: 0.34 },     // the hearth: where, how wide its stones, how high its flame
  awning: { half: 0.68, from: 1.52, to: 2.9, at: 2.05, drop: 0.12 },   // the solar cloth over the door: half its width, from and to (z), height, sag
  build: { base: 1.2, walls: 3.4, done: 4.4, down: 1.6 },               // seconds: the stones laid, the walls up, all done; taken down
};

// the dome's two surfaces are spheres centred on the axis, each through the top of the stone ring at its radius
// and through the dome's top: centre height c and radius s
function cap(r, base, top) { const c = (top * top - r * r - base * base) / (2 * (top - base)); return { c, s: top - c }; }
export const OUTER = cap(SHELTER.out, SHELTER.base, SHELTER.top);
export const INNER = cap(SHELTER.in, SHELTER.base, SHELTER.topIn);

// how far from the axis a surface is at a height (0 above its top)
export function outerR(y) {
  if (y <= SHELTER.base) return SHELTER.out;
  const d = y - OUTER.c;
  return y >= SHELTER.top ? 0 : Math.sqrt(Math.max(0, OUTER.s * OUTER.s - d * d));
}
export function innerR(y) {
  if (y <= SHELTER.base) return SHELTER.in;
  const d = y - INNER.c;
  return y >= SHELTER.topIn ? 0 : Math.sqrt(Math.max(0, INNER.s * INNER.s - d * d));
}
// how high a surface is at a distance from the axis
export const outerH = (r) => (r >= SHELTER.out ? 0 : OUTER.c + Math.sqrt(Math.max(0, OUTER.s * OUTER.s - r * r)));
export const innerH = (r) => (r >= SHELTER.in ? SHELTER.base : INNER.c + Math.sqrt(Math.max(0, INNER.s * INNER.s - r * r)));

// a world point in the shelter's own frame, and back (b: { x, z, yaw }; the door faces +Z turned by yaw)
export function toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
export function toWorld(b, lx, lz) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + c * lx + s * lz, b.z - s * lx + c * lz]; }

// Built facing whoever builds it, a few steps in front: its door toward them. `body`: { p, yaw }.
export function placeShelter(body, gap = 1.6) {
  const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw), d = SHELTER.out + gap;
  return { kind: 'shelter', x: body.p[0] + fx * d, z: body.p[2] + fz * d, yaw: body.yaw + Math.PI, t: 0, down: -1 };
}
// its door's local +Z, as the world's angle: the yaw that faces out of it (atan2 of the world direction)
export const doorWorld = (b) => toWorld(b, 0, SHELTER.out);

// In line with the doorway: in front of the room's middle, within the door's width (less a margin), not yet
// past the outer wall. The dome is cut away above it up to the lintel, so there the way is open to the outside.
export const inDoor = (lx, lz, m = 0) => lz > 0 && lz < SHELTER.out + 0.3 && Math.abs(lx) <= SHELTER.door.half - m;

// INSIDE: a point (feet at y) within the room.
export function inside(b, x, z, y = 0) {
  const [lx, lz] = toLocal(b, x, z), r = Math.hypot(lx, lz);
  return r < SHELTER.in && y < innerH(r);
}

// What a body may not go into, and what it stands on. A body is an upright cylinder of radius `rad` and
// height `tall`, its feet at p[1]; `was` is where it stood a step ago (which side of the walls it was on).
// Answers { p, floor, ceiling, hit }: p pushed out of what is solid; floor, the height it stands on there;
// ceiling, how high its head may reach (Infinity: open sky).
export function solve(b, p, was, rad = 0.3, tall = 1.7) {
  const S = SHELTER, open = S.door.half - rad;                           // how far from the doorway's middle a body may be in it
  let [lx, lz] = toLocal(b, p[0], p[2]), r = Math.hypot(lx, lz);
  const y = p[1];
  if (r > S.out + rad + 0.6) return { p, floor: 0, ceiling: Infinity, hit: false };      // nowhere near
  const [wx, wz] = toLocal(b, was[0], was[2]), wr = Math.hypot(wx, wz);
  const above = was[1] >= outerH(Math.max(0, wr - rad * 0.5)) - 0.05 && was[1] > S.base;  // it came from above: the dome is under it
  const wasIn = !above && (wr < S.in || (inDoor(wx, wz) && wr < S.out));
  let hit = false, floor = 0, ceiling = Infinity;
  if (above) {
    floor = outerH(Math.max(0, r - rad * 0.5));                          // on the dome itself
  } else if (wasIn) {
    // in the room (or its doorway): the floor is the room's; the dome comes down toward the wall, so how far out
    // a body may go is set by its head; the doorway's jambs keep it in the doorway's width; the hearth's stones
    const door = inDoor(lx, lz);
    floor = r < S.out ? S.floor : 0;
    ceiling = door ? Math.max(S.door.high, innerH(Math.min(r, S.in - 1e-3))) : innerH(Math.min(r, S.in - 1e-3));
    const reach = innerR(Math.min(y + tall, S.topIn - 1e-3)) - rad;
    if (door && lz > S.in - rad - 0.05 && Math.abs(lx) > open) { lx = Math.sign(lx) * open; hit = true; }     // the jambs
    else if (!door && reach > 0 && r > reach) { const k = reach / r; lx *= k; lz *= k; hit = true; }
    const hx = lx - S.hearth.x, hz = lz - S.hearth.z, hd = Math.hypot(hx, hz), hm = S.hearth.r + rad;
    if (hd < hm && y < 0.4) { const k = hm / Math.max(hd, 1e-6); lx = S.hearth.x + hx * k; lz = S.hearth.z + hz * k; hit = true; }
  } else {
    // outside: the dome is as wide as it is at the body's feet; the doorway lets it in, its jambs turn it into it
    const wide = outerR(Math.max(y, 0)) + rad;
    if (r < wide) {
      const fits = y + tall <= S.door.high + 0.2;
      if (lz > 0 && fits && Math.abs(lx) <= open) { if (r < S.out) floor = S.floor; }
      else if (lz > 0 && fits && Math.abs(lx) < S.door.half + rad && wide - r > S.door.half + rad - Math.abs(lx)) { lx = Math.sign(lx) * open; hit = true; }
      else { const k = wide / Math.max(r, 1e-6); lx *= k; lz *= k; hit = true; }
    }
    if (inDoor(lx, lz) && r < S.out + rad) ceiling = S.door.high;
  }
  const [x, z] = toWorld(b, lx, lz);
  return { p: [x, y, z], floor, ceiling, hit };
}

// What of a point is solid: in the walls or the dome, not the room, not the doorway (an eye's margin given).
export function solid(b, q, m = 0.15) {
  const [lx, lz] = toLocal(b, q[0], q[2]), r = Math.hypot(lx, lz), y = q[1];
  if (y > SHELTER.top + m || r > outerR(Math.max(y, 0)) + m) return false;             // outside it
  if (r < innerR(Math.max(y, 0)) - m && y < innerH(r) - m) return false;               // in the room
  return !(inDoor(lx, lz, m) && y < SHELTER.door.high - m);                            // the doorway
}
// Where the eye may stand, looking at a body from `from` (its head) toward `to`: the share of the way it may go.
// A body in the room keeps the eye in the room with it (it does not go out through the doorway to look back in);
// a body outside keeps it out of the walls and the dome.
export function eyeRoom(b, from, to, m = 0.15) {
  const room = (q) => { const [lx, lz] = toLocal(b, q[0], q[2]), r = Math.hypot(lx, lz); return r < innerR(Math.max(q[1], 0)) - m && q[1] < innerH(r) - m; };
  const bad = room(from) ? (q) => !room(q) : (q) => solid(b, q, m);
  const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  let lo = 0, hi = 1, found = false;
  for (let i = 1; i <= 40; i++) { const t = i / 40; if (bad(at(t))) { hi = t; lo = (i - 1) / 40; found = true; break; } }
  if (!found) return 1;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (bad(at(mid))) hi = mid; else lo = mid; }
  return lo;
}

// The sun inside: from a point in the room, toward the sun (`sun`, a unit vector, up positive), does the light
// come in through the skylight or the doorway (doorOpen: 0 shut, 1 open)? 1 lit, 0 in the dome's shade.
export function sunIn(b, x, y, z, sun, doorOpen = 1) {
  if (sun[1] <= 0) return 0;
  const [lx, lz] = toLocal(b, x, z), c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const sx = c * sun[0] - s * sun[2], sz = s * sun[0] + c * sun[2], sy = sun[1];
  // where the ray leaves the room: through the stone ring's inner face, or through the dome above it
  const a = sx * sx + sz * sz, bb = 2 * (lx * sx + lz * sz), cc = lx * lx + lz * lz - SHELTER.in * SHELTER.in;
  let t = a > 1e-9 ? (-bb + Math.sqrt(Math.max(0, bb * bb - 4 * a * cc))) / (2 * a) : Infinity;
  let ex = lx + sx * t, ey = y + sy * t, ez = lz + sz * t;
  if (!(ey <= SHELTER.base)) {
    // the far side of the inner sphere
    const oy = y - INNER.c, B2 = lx * sx + oy * sy + lz * sz, C2 = lx * lx + oy * oy + lz * lz - INNER.s * INNER.s;
    t = -B2 + Math.sqrt(Math.max(0, B2 * B2 - C2));
    ex = lx + sx * t; ey = y + sy * t; ez = lz + sz * t;
    if (Math.hypot(ex, ez) < SHELTER.sky) return 1;                         // the skylight
  }
  return ez > 0 && Math.abs(ex) < SHELTER.door.half && ey < SHELTER.door.high ? doorOpen : 0;     // the doorway
}

// How it goes up: the stones laid (0..1), the walls (0..1), the rest (0..1); taken down, all fall together
export function phase(b) {
  const B = SHELTER.build, k = (a, z, t) => Math.max(0, Math.min(1, (t - a) / (z - a)));
  if (b.down >= 0) { const u = 1 - Math.min(1, b.down / B.down); return { stones: u, walls: u, rest: u, gone: b.down >= B.down }; }
  return { stones: k(0, B.base, b.t), walls: k(B.base, B.walls, b.t), rest: k(B.walls, B.done, b.t), gone: false };
}
// what it stands on is dry: inside its outer wall
export const dry = (b, x, z) => Math.hypot(...toLocal(b, x, z)) < SHELTER.out;
export const FOOT = SHELTER.out + 0.9;      // m: a circle round its middle that holds all of it (its awning, the shade at its foot)
