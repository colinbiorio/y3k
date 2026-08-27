// THE PLANET'S PURE MATH — shared by server and every client, like
// chess-core. Terrain, wrap, courses, and body positions are all functions of
// (coordinates, seed, clock): every client computes identical ground and
// identical motion locally, and only EDITS and SETTLEMENTS ever cross the
// wire. The planet is a seed, not a download.

export const WORLD_SIZE = 4096;   // blocks per side; wraps
export const CHUNK = 16;          // blocks per chunk side
export const SEA_LEVEL = 8;       // heights below this are water
export const MAX_H = 24;          // terrain height range 0..MAX_H
export const WORLD_SEED = 3000;   // the year, of course
export const WALK_SPEED = 2;      // blocks per second on migration
export const HOME_RADIUS = 14;    // bodies wander this far from the anchor

export const wrap = (v) => ((v % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE;
// shortest signed distance on a wrapped axis
export const wdelta = (a, b) => {
  let d = wrap(b) - wrap(a);
  if (d > WORLD_SIZE / 2) d -= WORLD_SIZE;
  if (d < -WORLD_SIZE / 2) d += WORLD_SIZE;
  return d;
};
export const wdist = (x1, z1, x2, z2) => Math.hypot(wdelta(x1, x2), wdelta(z1, z2));

// 2D value noise over a wrapped lattice — the sky shaders' instinct in
// integer land. hash → lattice corners → smooth mix.
export function hash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
export function vnoise(x, z, scale, seed) {
  const lat = WORLD_SIZE / scale;
  const fx = wrap(x) / scale, fz = wrap(z) / scale;
  const x0 = Math.floor(fx) % lat, z0 = Math.floor(fz) % lat;
  const x1 = (x0 + 1) % lat, z1 = (z0 + 1) % lat;
  const tx = smooth(fx - Math.floor(fx)), tz = smooth(fz - Math.floor(fz));
  const a = hash2(x0, z0, seed), b = hash2(x1, z0, seed);
  const c = hash2(x0, z1, seed), d = hash2(x1, z1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

// The planet's ground at (x, z): height + surface material. Pure.
export function terrainAt(x, z) {
  const broad = vnoise(x, z, 256, WORLD_SEED);        // continents
  const hills = vnoise(x, z, 64, WORLD_SEED + 1);     // rolling variation
  const fine = vnoise(x, z, 16, WORLD_SEED + 2);      // local texture
  let h = Math.round((broad * 0.62 + hills * 0.28 + fine * 0.10) * MAX_H);
  const moist = vnoise(x, z, 128, WORLD_SEED + 3);
  let mat;
  if (h < SEA_LEVEL) mat = 'water';
  else if (h < SEA_LEVEL + 1) mat = 'sand';
  else if (h > MAX_H - 5) mat = 'stone';
  else mat = moist > 0.45 ? 'grass' : 'soil';
  return { h: Math.max(0, h), mat };
}

// THE PLANET'S DAY — pure, like everything here. One planet day is one real
// day, and local solar time is offset by longitude (east is +x, ahead in
// time, like Earth): societies genuinely live in time zones, and the same
// UTC moment is noon on one ground and deep night on another. Both the
// client's sky and the server's percept read from this one function, so what
// the person sees and what the presence is told are the same light.
export const DAY_MS = 86400000;
export function daylightAt(x, t) {
  // frac: 0 = local midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  const frac = ((t / DAY_MS + wrap(x) / WORLD_SIZE) % 1 + 1) % 1;
  const elev = Math.sin((frac - 0.25) * Math.PI * 2); // sun height, -1..1
  // usable light: dawn glow starts a little before the sun clears the ground,
  // and full day arrives once it stands reasonably high
  const light = Math.max(0, Math.min(1, (elev + 0.12) / 0.6));
  return { frac, elev, light };
}
// One honest word for the hour, shared by the world bar and the percept.
export function timeOfDayWord(frac) {
  const f = ((frac % 1) + 1) % 1;
  if (f < 0.08 || f >= 0.92) return 'deep night';
  if (f < 0.21) return 'the small hours';
  if (f < 0.29) return 'dawn';
  if (f < 0.42) return 'morning';
  if (f < 0.58) return 'midday';
  if (f < 0.71) return 'afternoon';
  if (f < 0.79) return 'dusk';
  return 'evening';
}

// Compass: north is -z, a map's own convention. Pure helpers for percepts
// and for resolving "go north" into ground.
export const COMPASS = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  'north-east': [0.707, -0.707], 'north-west': [-0.707, -0.707],
  'south-east': [0.707, 0.707], 'south-west': [-0.707, 0.707],
};
export function directionOf(dx, dz) {
  const ang = Math.atan2(dz, dx); // -PI..PI, 0 = east
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return names[Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}

// The nearest column matching a predicate, spiral-sampled outward. Pure —
// tests and percepts both lean on it. Returns { x, z, dist } or null.
export function findNearest(x, z, match, maxR = 120, step = 4) {
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r), pz = Math.round(z + Math.sin(a) * r);
      if (match(terrainAt(px, pz))) return { x: wrap(px), z: wrap(pz), dist: r };
    }
  }
  return null;
}

// Growth is lived time — a pure function like everything else here. A body
// seeded today is a sprout in two days and grown in seven; nobody writes a
// stage anywhere, the clock carries it.
export function stageOf(born, t) {
  const days = (t - (born || t)) / 86400000;
  return days >= 7 ? 'grown' : days >= 2 ? 'sprout' : 'seed';
}

// Where a settlement's anchor stands at time t: pure function of its course.
export function anchorAt(s, t) {
  const c = s.course;
  const dx = wdelta(c.fromX, c.toX), dz = wdelta(c.fromZ, c.toZ);
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return { x: wrap(c.fromX), z: wrap(c.fromZ), moving: false };
  const walked = Math.min(dist, ((t - c.t0) / 1000) * WALK_SPEED);
  const f = walked / dist;
  return { x: wrap(c.fromX + dx * f), z: wrap(c.fromZ + dz * f), moving: walked < dist };
}

// Bodies wander deterministically around the anchor — every client computes
// the same positions from (seed, time). Migration pulls them into a loose
// file behind the anchor. `awake` is the caller's knowledge (heartbeat lives
// server-side); a sleeping society's bodies drowse in place.
export function bodyPositions(s, t, awake = true) {
  const a = anchorAt(s, t);
  return (s.bodies || []).map((b, i) => {
    const stage = stageOf(b.born, t);
    // A sprite with a job is not part of the society's drift at all: it is
    // somewhere specific, doing something specific, and the server has already
    // resolved exactly where. A sprite at home sits on its own solar panel —
    // hovering above it awake, lying on it at rest — which is the whole reason
    // it can be away in the first place.
    if (b.job && b.job.at) {
      return { id: b.id, stage, x: wrap(b.job.at.x), z: wrap(b.job.at.z), drowsing: false, working: true, charge: false };
    }
    if (b.panel && !a.moving) {
      return { id: b.id, stage, x: wrap(b.panel.x), z: wrap(b.panel.z), drowsing: !awake, working: false, charge: true };
    }
    if (a.moving) {
      const lag = 1.5 + i * 1.2 + hash2(b.seed, i, 7) * 1.5;
      return { id: b.id, stage, x: wrap(a.x - lag * Math.sign(wdelta(s.course.fromX, s.course.toX) || 1)), z: wrap(a.z + (hash2(b.seed, i, 9) - 0.5) * 3), drowsing: false };
    }
    const drift = awake ? 1 : 0.12; // a drowsing body barely stirs
    const ph = t / 1000 * (0.05 + hash2(b.seed, 3, 5) * 0.05) * drift + b.seed;
    const r = 2 + hash2(b.seed, 1, 3) * (HOME_RADIUS - 4);
    return {
      id: b.id, stage,
      x: wrap(a.x + Math.cos(ph) * r + Math.sin(ph * 2.7) * 1.5),
      z: wrap(a.z + Math.sin(ph * 0.8) * r + Math.cos(ph * 1.9) * 1.5),
      drowsing: !awake,
    };
  });
}
