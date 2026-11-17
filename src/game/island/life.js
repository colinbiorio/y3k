// life.js — WHAT GROWS AND LIVES ON LORD HOWE, AS NUMBERS. No page, no three:
// the suite runs it; island.js draws it.
//
// Colin, 17 Nov 2026: "just the general shape and size and expected fauna of a
// small island of your choice". What is expected there, as the island's own
// naturalists list it, and as it is here:
//
//   · KENTIA PALMS (Howea forsteriana), the island's forests: grown on forest
//     ground round the body (land between the beach and Gower's mist forest,
//     not too steep), one to each 7 m cell that the cell's own number allows,
//     a few scattered on the grass flats, so the same palm stands in the same
//     place every time. Their trunks are in a body's way.
//   · SOOTY TERNS, in their tens of thousands there in summer: flocks wheeling
//     over the sea off the island's north end, over the lagoon, and off its
//     south.
//   · RED-TAILED TROPICBIRDS, white, two long red streamers for a tail, gliding
//     along the cliffs of Mount Gower and Mount Lidgbird where they nest.
//   · THE WOODHEN, a flightless rail found nowhere else, brown, the size of a
//     hen: on the forest floor round the body; curious (a body standing still
//     draws them to a few steps off, where they peck), and quick to scurry
//     from a body that dashes at them.
//   · GREEN TURTLES, in the lagoon: cruising its shallows, coming up to
//     breathe.
//
// Birds in the air go as pure functions of time (where a flock's bird is at t);
// the woodhens and turtles are stepped, with a seeded random, so the suite can
// hold them to their ground.
export const PALM = { cell: 7, chance: 0.72, near: 170, trunk: 0.22 };

// a number for a place (or anything counted), the same every time: [0, 1)
export function hash(i, j, k = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// a smooth noise on a lattice (island.js colours the ground by the same one, so the palms grow where it paints forest)
export function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
// the ground's own word for what grows: 'forest', 'grass', 'rock', 'moss', 'beach' or 'sea' (island.js paints by it)
export function cover(ground, x, z) {
  const h = ground.height(x, z);
  if (h < 0) return 'sea';
  const [sx, sz] = ground.slope(x, z, 4), s = Math.hypot(sx, sz);
  if (s > 0.95) return 'rock';
  if (h < 2.9) return 'beach';
  if (h > 640) return 'moss';
  const n = vnoise(x / 70, z / 70) * 0.7 + vnoise(x / 17, z / 17) * 0.3;
  if (h < 26 && s < 0.2 && n > 0.45) return 'grass';
  return s > 0.8 ? 'rock' : 'forest';
}

// ---- the palms
// every palm whose cell lies within r of (x, z): where, how tall, which way it leans and turns
export function palmsNear(ground, x, z, r = PALM.near) {
  const c = PALM.cell, out = [];
  const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (hash(i, j, 1) > PALM.chance) continue;
    const px = (i + 0.15 + 0.7 * hash(i, j, 2)) * c, pz = (j + 0.15 + 0.7 * hash(i, j, 3)) * c;
    if ((px - x) ** 2 + (pz - z) ** 2 > r * r) continue;
    const kind = cover(ground, px, pz);
    if (kind !== 'forest' && !(kind === 'grass' && hash(i, j, 7) < 0.22)) continue;    // the forest; a palm here and there on the flats
    out.push({ x: px, z: pz, y: ground.height(px, pz), h: 7 + 7 * hash(i, j, 4), lean: 0.12 * hash(i, j, 5), turn: 6.283 * hash(i, j, 6), id: i * 100003 + j });
  }
  return out;
}
// the trunks a body at (x, z) could touch (the cells round it)
export function trunksNear(ground, x, z) { return palmsNear(ground, x, z, 2.5); }

// ---- the birds of the air: pure functions of time
// the flocks' places: off the island's north end, over the lagoon off the beach where a body arrives, and south of
// Mount Gower, all over water
export function flocksOf(shape) {
  const e = shape.extent, a = shape.arrive;
  return [
    { id: 1, x: e.x1 - 600, z: e.z0 - 900, r: 85, alt: 32, n: 46 },
    { id: 2, x: a.x - 700, z: a.z - 200, r: 95, alt: 34, n: 40 },
    { id: 3, x: (e.x0 + e.x1) / 2 + 300, z: e.z1 + 1000, r: 95, alt: 38, n: 36 },
  ];
}
// where a flock's kth tern is at t, and which way it flies (yaw: body.js's, forward (sin, cos)) and how it banks
export function ternAt(f, k, t) {
  const R = f.r * (0.45 + 0.75 * hash(f.id, k, 1)), dir = hash(f.id, k, 2) < 0.5 ? 1 : -1, w = (dir * (10 + 4 * hash(f.id, k, 3))) / R;
  const a = 6.283 * hash(f.id, k, 4) + w * t;
  const cx = f.x + 70 * Math.sin(t * 0.011 + f.id), cz = f.z + 70 * Math.cos(t * 0.009 + 2 * f.id);
  const x = cx + R * Math.cos(a), z = cz + R * Math.sin(a), y = f.alt + 22 * hash(f.id, k, 5) + 5 * Math.sin(t * 0.6 + k);
  // flying round anticlockwise (dir 1, seen from above with z south) the way is the circle's tangent
  const vx = -Math.sin(a) * w, vz = Math.cos(a) * w;
  return { x, y, z, yaw: Math.atan2(vx, vz), bank: -dir * 0.45, flap: hash(f.id, k, 6) };
}
// a band of terns that keeps near the body wherever it goes on the island, wheeling over it (they work over the land as
// well as the sea): a dozen on circles of 60 to 110 m round a centre that follows the body slowly
export const NEAR_TERNS = 14;
export function nearTernAt(centre, k, t) {
  const R = 60 + 50 * hash(9, k, 1), dir = hash(9, k, 2) < 0.5 ? 1 : -1, w = (dir * (9 + 4 * hash(9, k, 3))) / R, a = 6.283 * hash(9, k, 4) + w * t;
  const x = centre[0] + R * Math.cos(a), z = centre[1] + R * Math.sin(a), y = centre[2] + 26 + 16 * hash(9, k, 5) + 4 * Math.sin(t * 0.7 + k);
  return { x, y, z, yaw: Math.atan2(-Math.sin(a) * w, Math.cos(a) * w), bank: -dir * 0.45 };
}

// the tropicbirds: long slow ellipses along the cliffs of the two mountains, high on them, never into them
export function tropicsOf(shape) {
  const gower = shape.peaks.find((p) => p.name === 'Mount Gower'), lid = shape.peaks.find((p) => p.name === 'Mount Lidgbird');
  const birds = [];
  for (let k = 0; k < 8; k++) {
    const P = k < 5 ? gower : lid, side = hash(7, k, 1) < 0.6 ? 1 : -1;
    birds.push({ id: k, cx: P.x + side * (380 + 160 * hash(7, k, 2)), cz: P.z + 240 * (hash(7, k, 3) - 0.5), rx: 150 + 120 * hash(7, k, 4), rz: 260 + 160 * hash(7, k, 5),
      alt: Math.max(140, P.h * (0.35 + 0.4 * hash(7, k, 6))), w: (hash(7, k, 7) < 0.5 ? 1 : -1) * (0.05 + 0.03 * hash(7, k, 8)), p: 6.283 * hash(7, k, 9) });
  }
  return birds;
}
export function tropicAt(b, t, ground) {
  const a = b.p + b.w * t, x = b.cx + b.rx * Math.cos(a), z = b.cz + b.rz * Math.sin(a);
  const y = Math.max(b.alt + 18 * Math.sin(t * 0.21 + b.p), (ground ? ground.height(x, z) : 0) + 45);
  const vx = -b.rx * Math.sin(a) * b.w, vz = b.rz * Math.cos(a) * b.w;
  return { x, y, z, yaw: Math.atan2(vx, vz), bank: -Math.sign(b.w) * 0.3 };
}

// ---- the woodhens: stepped, round the body
export const HEN = { n: 10, near: [22, 60], far: 90, wander: 0.55, curious: 14, keep: 3.4, toward: 1.3, scurry: 4.6, fright: 6 };
export function createHens(seed = 1) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { rand, hens: Array.from({ length: HEN.n }, (_, k) => ({ k, x: 0, z: 0, y: 0, yaw: 0, placed: false, mode: 'wander', t: 0, peck: 0 })) };
}
// a place for a hen on forest ground near the body, behind it where it can (out of the eye's way); null if none is found
function henPlace(H, ground, body) {
  for (let tries = 0; tries < 24; tries++) {
    const a = body.yaw + Math.PI + (H.rand() - 0.5) * 3.2, d = HEN.near[0] + (HEN.near[1] - HEN.near[0]) * H.rand();
    const x = body.p[0] + Math.sin(a) * d, z = body.p[2] + Math.cos(a) * d;
    if (cover(ground, x, z) === 'forest') return [x, z];
  }
  return null;
}
const henGround = (ground, x, z) => { const c = cover(ground, x, z); return c === 'forest' || c === 'grass'; };
export function stepHens(H, ground, body, dt) {
  const dashing = body.dashT > 0;
  for (const h of H.hens) {
    if (!h.placed || Math.hypot(h.x - body.p[0], h.z - body.p[2]) > HEN.far) {
      const at = henPlace(H, ground, body);
      if (!at) continue;
      h.x = at[0]; h.z = at[1]; h.yaw = H.rand() * 6.283; h.placed = true; h.mode = 'wander'; h.t = 0;
    }
    const dx = body.p[0] - h.x, dz = body.p[2] - h.z, d = Math.hypot(dx, dz);
    h.t -= dt;
    if (dashing && d < HEN.fright) { h.mode = 'scurry'; h.t = 1.4; h.yaw = Math.atan2(-dx, -dz) + (H.rand() - 0.5) * 0.8; }
    else if (h.mode !== 'scurry' || h.t <= 0) {
      if (d < HEN.curious && !body.flying) { h.mode = d > HEN.keep ? 'curious' : 'peck'; if (h.mode === 'curious') h.yaw = Math.atan2(dx, dz); }
      else if (h.t <= 0) { h.mode = H.rand() < 0.35 ? 'peck' : 'wander'; h.t = 1.5 + 3 * H.rand(); if (h.mode === 'wander') h.yaw += (H.rand() - 0.5) * 2.2; }
    }
    const speed = h.mode === 'scurry' ? HEN.scurry : h.mode === 'curious' ? HEN.toward : h.mode === 'wander' ? HEN.wander : 0;
    h.peck = h.mode === 'peck' ? (h.peck + dt * 3) % 1 : 0;
    if (speed > 0) {
      const nx = h.x + Math.sin(h.yaw) * speed * dt, nz = h.z + Math.cos(h.yaw) * speed * dt;
      if (henGround(ground, nx, nz)) { h.x = nx; h.z = nz; } else { h.yaw += Math.PI * (0.5 + H.rand()); if (h.mode === 'curious') h.mode = 'peck'; }
    }
    h.y = ground.height(h.x, h.z);
  }
  return H;
}

// ---- the turtles: stepped, in the lagoon
export const TURTLE = { n: 6, speed: 0.55, shallow: 0.9, deep: 4.2, breathe: 38 };
export function createTurtles(ground, shape, seed = 3) {
  const a = shape.arrive, out = [];
  for (let k = 0; out.length < TURTLE.n && k < 400; k++) {
    const x = a.x - 180 - 900 * hash(seed, k, 1), z = a.z + 1400 * (hash(seed, k, 2) - 0.5), d = ground.depth(x, z);
    if (d > 1.2 && d < 3.8) out.push({ k: out.length, x, z, y: -0.6, yaw: 6.283 * hash(seed, k, 3), phase: TURTLE.breathe * hash(seed, k, 4), up: 0 });
  }
  return out;
}
// one step for each turtle: on along its way, turning back from the shallows and the reef's edge; now and then up to breathe
// (answers those that broke the surface this step, for their rings on the water)
export function stepTurtles(turtles, ground, dt, t) {
  const breaths = [];
  for (const u of turtles) {
    u.yaw += Math.sin(t * 0.13 + u.k * 1.7) * 0.25 * dt;
    const nx = u.x + Math.sin(u.yaw) * TURTLE.speed * dt, nz = u.z + Math.cos(u.yaw) * TURTLE.speed * dt, d = ground.depth(nx, nz);
    if (d < TURTLE.shallow || d > TURTLE.deep) u.yaw += Math.PI * 0.6 * dt * 4; else { u.x = nx; u.z = nz; }
    const cycle = (t + u.phase) % TURTLE.breathe, was = u.up;
    u.up = cycle < 3 ? 1 : 0;
    const depth = ground.depth(u.x, u.z), under = Math.min(depth - 0.35, 0.7 + 0.25 * Math.sin(t * 0.4 + u.k));
    u.y = u.up ? -0.1 : -Math.max(0.3, under);
    if (u.up && !was) breaths.push([u.x, u.z]);
  }
  return breaths;
}
