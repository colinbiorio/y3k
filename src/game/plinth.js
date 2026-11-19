// plinth.js — GROUND MADE FIT TO BUILD ON (Colin, 19 Nov 2026: "if the ground is not flat, instead of telling the
// user they can't build there, give them an option to level the ground around it or build a flat platform to place
// the building on top of"). No page, no three: the suite runs it; island/island.js draws the levelled ground and
// buildings/plinth.js the platform.
//
// A building's PAD is the rectangle it stands on, in its own frame (x across it, z from its back to its door at +z),
// a little wider than its walls and its own steps.
//
//   LEVELLED, the ground over the pad is brought to the building's level (the ground's at its door, as a building
//   always stands), and round the pad eased back to the ground as it was over a width that keeps the new slope
//   gentle (LEVEL.slope, rise over run). The earth moves first, as the building is begun, and goes back as it comes
//   down: the levelling is the building's, and lasts as long as it stands.
//   ON A PLATFORM, a slab of dressed stone over the pad: its top a little over the highest ground under it (and not
//   under the door's), its sides carried down past the lowest, and a flight of steps from its front edge down to the
//   ground before the door. It rises out of the ground first, and the building goes up on it.
//
// Either way the building waits for its ground: its clock starts GROW seconds back.
export const PADS = {
  shelter: [-2.7, 2.7, -2.7, 3.1],
  house: [-3.6, 3.6, -5.1, 5.7],
  workshop: [-5.7, 5.7, -6.7, 8.0],
  tower: [-3.9, 3.9, -3.9, 3.9],
  hall: [-27.6, 27.6, -32.6, 41.6],
};
export const STAIR = { shelter: 0.9, house: 1.1, workshop: 2.4, tower: 0.9, hall: 6 };   // half the width of a platform's steps
export const GROW = 1.4;                       // s: the earth moved, or the platform risen, before the building is begun
export const LEVEL = { round: 1.0, slope: 0.55, min: 3, max: 18, most: 12 };   // the pad's corners; the eased edge; the most earth moved
export const PLATFORM = { over: 0.12, bury: 0.4, rise: 0.2, going: 0.34, most: 12 };     // over the highest ground; past the lowest; a step; the tallest

const padOf = (b) => PADS[b.kind] || PADS.shelter;
// a world point in a building's frame, and back (as shelter.js's toLocal, toWorld)
export function toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
export function toWorld(b, lx, lz) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + c * lx + s * lz, b.z - s * lx + c * lz]; }
// how far a point is outside the pad's rounded rectangle (less than 0 inside it)
export function padDistance(pad, lx, lz, r = LEVEL.round) {
  const cx = (pad[0] + pad[1]) / 2, cz = (pad[2] + pad[3]) / 2, hx = (pad[1] - pad[0]) / 2 - r, hz = (pad[3] - pad[2]) / 2 - r;
  const qx = Math.abs(lx - cx) - hx, qz = Math.abs(lz - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the ground under a pad, sampled on a grid over it (and its corners): the lowest and the highest
export function padSite(height, b, n = 9) {
  const pad = padOf(b);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const [x, z] = toWorld(b, pad[0] + ((pad[1] - pad[0]) * i) / (n - 1), pad[2] + ((pad[3] - pad[2]) * j) / (n - 1));
    const h = Math.max(0, height(x, z));                     // the sea's level over water
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { lo, hi };
}

// THE LEVELLING of a building at a level: the pad, its eased edge, and how far it is come (k, 0 to 1)
export function levelFor(height, b, level) {
  const s = padSite(height, b), most = Math.max(s.hi - level, level - s.lo);
  if (most > LEVEL.most) return null;                        // a cliff, not a site: no levelling makes it one
  const blend = Math.min(LEVEL.max, Math.max(LEVEL.min, most / LEVEL.slope));
  const pad = padOf(b), reach = Math.hypot(Math.max(-pad[0], pad[1]), Math.max(-pad[2], pad[3])) + blend + 1;
  return { x: b.x, z: b.z, yaw: b.yaw, pad, level, blend, reach, k: 0, most };
}
// the ground's height at a point with a levelling over it (h: the height without it)
export function levelled(f, x, z, h) {
  if (!f.k || Math.abs(x - f.x) > f.reach || Math.abs(z - f.z) > f.reach) return h;
  const [lx, lz] = toLocal(f, x, z), w = 1 - smooth(0, f.blend, padDistance(f.pad, lx, lz));
  return h + f.k * w * (f.level - h);
}

// THE PLATFORM for a building whose door's ground is at `at`: its top, its foot, and its steps
export function platformFor(height, b, at) {
  const s = padSite(height, b), pad = padOf(b);
  const top = Math.max(at, s.hi + PLATFORM.over), foot = s.lo - PLATFORM.bury;
  if (top - s.lo > PLATFORM.most) return null;
  // the steps: from the front edge down to the ground before it, as many as its height asks
  const [fx, fz] = toWorld(b, 0, pad[3] + 0.6), before = Math.max(0, height(fx, fz)), drop = top - before;
  const steps = drop > 0.35 ? Math.min(60, Math.ceil(drop / PLATFORM.rise)) : 0;
  return { top, foot, steps, rise: steps ? drop / steps : 0, half: STAIR[b.kind] || 1, rose: 0, most: top - s.lo };
}
// what of a platform is solid, in its building's frame and the world's heights: the slab and each step
export function platformBoxes(b) {
  const P = b.plinth, pad = padOf(b); if (!P) return [];
  const up = P.foot + (P.top - P.foot) * P.rose;            // as far as it has risen
  const boxes = [{ x0: pad[0], x1: pad[1], z0: pad[2], z1: pad[3], y0: P.foot, y1: up }];
  for (let i = 0; i < P.steps; i++) {
    const y1 = P.foot + (P.top - (i + 1) * P.rise - P.foot) * P.rose;      // risen as the slab is (buildings/plinth.js draws it so)
    if (y1 <= P.foot + 1e-6) break;
    boxes.push({ x0: -P.half, x1: P.half, z0: pad[3] + i * PLATFORM.going, z1: pad[3] + (i + 1) * PLATFORM.going, y0: P.foot, y1 });
  }
  return boxes;
}
// whether a point (x, z) is over a platform's slab or its steps
export function onPlatform(b, x, z) {
  if (!b.plinth) return false;
  const [lx, lz] = toLocal(b, x, z), pad = padOf(b), P = b.plinth;
  if (lx > pad[0] && lx < pad[1] && lz > pad[2] && lz < pad[3]) return true;
  return Math.abs(lx) < P.half && lz >= pad[3] && lz < pad[3] + P.steps * PLATFORM.going;
}
// how far the ground's work is come for a building: its earth moved as it is begun, put back as it comes down
export function grown(b, downTime = 1.5) {
  if (b.down >= 0) return Math.max(0, 1 - b.down / downTime);
  return smooth(0, 1, (b.t + GROW) / GROW);
}
