// ============================================================================
// The land the pyramid room stands its pyramid on, as plain numbers (no
// three.js, no page), so the tests hold it. Drawn from the map, not surveyed:
// the north-east corner of the Giza plateau, where the Great Pyramid stands;
// the valley 42 m below it to the north and the east, a branch of the Nile at
// the plateau's foot (after Sheisha et al., PNAS 2022) and the river beyond;
// the Muqattam hills across the valley; the desert rising to the west, with
// dunes far out; and, on the southern horizon, the pyramids that already
// stood when this one was begun. The Earth's curve is in it.
//
// Metres. X east, Z south, Y up; the pyramid's centre at the origin and its
// base at Y = 0. The lines below run north to south (Z rising) so a point's
// side of one is where it is across from the line at its own Z.
// ============================================================================
export const DROP = 42;                                    // the plateau above the valley floor (about 60 m above the sea, and 18)
export const EARTH_R = 6371000;
export const REACH = 45000;                                // the land drawn out to here: the horizon from 160 m up

// where the desert ends and the valley begins (the valley to the east of it)
export const DESERT_EDGE = [[-9000, -45000], [-3200, -12000], [-2300, -7000], [-1300, -2500], [-900, -700], [-300, -440], [400, -430],
  [660, -300], [700, 300], [1200, 1800], [2800, 4200], [5600, 7600], [8700, 11000], [9200, 14000], [8800, 18000], [9300, 24000], [9800, 45000]];
// where the valley ends at the hills across it (the hills to the east)
export const HILLS_EDGE = [[11000, -45000], [11500, -15000], [12300, -6000], [13000, 0], [13800, 5000], [14800, 9000], [15200, 14000], [15800, 22000], [16500, 45000]];
// the Nile's course then (further west than today's), and its width
export const RIVER = [[7000, -45000], [6000, -16000], [5600, -6000], [5800, 0], [6900, 5000], [9200, 9000], [11800, 13000], [13200, 18000], [13600, 26000], [14000, 45000]];
export const RIVER_HALF = 300;
// a branch to the plateau's foot, and the basin there
export const BRANCH = [[6900, 5000], [3800, 3600], [1800, 1600], [1150, 300], [1100, -900], [1800, -3000], [4000, -5500], [5600, -6500]];
export const BRANCH_HALF = 70;
export const BASIN = { x: 1330, z: 160, r: 230 };

// the pyramids already standing (WGS84 from the sites, turned to metres from the Great Pyramid's
// centre at 29.97917 N, 31.13417 E: 110,852 m a degree north, 96,487 m a degree east)
export const ELDERS = [
  { key: 'djoser', name: 'Djoser’s, at Saqqara', x: 7935, z: 11961, kind: 'step', base: [121, 109], height: 62.5, steps: 6 },
  { key: 'red', name: 'Sneferu’s Red, at Dahshur', x: 6914, z: 18938, kind: 'true', base: [220, 220], height: 105 },
  { key: 'bent', name: 'Sneferu’s Bent, at Dahshur', x: 7257, z: 20934, kind: 'bent', base: [189.4, 189.4], height: 104.7, knee: 47.07 },
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// the shortest way from (x, z) to a line of points
export function distanceTo(line, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az;
    const h = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * h, z - az - dz * h));
  }
  return best;
}
// where a north-to-south line crosses a given Z
export function lineX(line, z) {
  if (z <= line[0][1]) return line[0][0];
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    if (z <= bz) return ax + ((bx - ax) * (z - az)) / Math.max(bz - az, 1e-9);
  }
  return line[line.length - 1][0];
}
// metres from a north-to-south line, east of it positive
export const across = (line, x, z) => (x > lineX(line, z) ? 1 : -1) * distanceTo(line, x, z);

// value noise: smooth, repeatable, 0..1 (the shader has the same)
function hash(i, j) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// how far the valley has the ground: 0 up on the desert, 1 down on the floor; between, the scarp:
// a cliff of the plateau's limestone, then the scree below it
export const scarp = (d) => 0.55 * smoothstep(-15, 45, d) + 0.45 * smoothstep(20, 220, d);
export const valleyAt = (x, z) => scarp(across(DESERT_EDGE, x, z));
// metres from the nearest water's edge (the river, which wanders a little about its line; the branch;
// the basin), less than nothing on the water; and what is water, down on the valley floor
export function fromWater(x, z) {
  const wob = 210 * Math.sin(z / 2300 + 1.1) + 80 * Math.sin(z / 870);
  return Math.min(distanceTo(RIVER, x - wob, z) - RIVER_HALF, distanceTo(BRANCH, x, z) - BRANCH_HALF, Math.hypot(x - BASIN.x, z - BASIN.z) - BASIN.r);
}
export const waterAt = (x, z) => valleyAt(x, z) >= 0.999 && fromWater(x, z) < 0;

// the height of the land, before the Earth's curve
export function groundAt(x, z) {
  const r = Math.hypot(x, z), v = valleyAt(x, z);
  // the desert: level where the pyramid stands, rising to the west and south-west; drifts a few metres high;
  // far out, long dunes running north and south (the wind is from the north); never on an elder's ground
  const lift = 45 * (1 - Math.exp(-Math.max(0, -0.8 * x + 0.35 * z - 250) / 2600));
  const drift = 3.2 * (noise(x / 520, z / 520) - 0.5) + 1.4 * (noise(x / 170 + 9.1, z / 170 + 3.7) - 0.5);
  let clear = 1;
  for (const e of ELDERS) clear = Math.min(clear, smoothstep(260, 900, Math.hypot(x - e.x, z - e.z)));
  const ridge = 1 - Math.abs(2 * noise(x / 420 + 0.35 * Math.sin(z / 1700), z / 2900) - 1);
  const dunes = 26 * ridge * ridge * smoothstep(1800, 5200, r) * clear;
  const desert = smoothstep(240, 900, r) * (lift + drift) + dunes;
  // the valley floor: nearly flat, the water a metre below the fields
  const floor = -DROP + 0.6 * (noise(x / 900, z / 900) - 0.5) - (waterAt(x, z) ? 1 : 0);
  // across the valley the hills rise, steep at first
  const e = across(HILLS_EDGE, x, z);
  const hills = e > -300 ? (195 + 70 * (noise(x / 2600, z / 2600) - 0.5)) * smoothstep(-300, 1300, e) * (0.85 + 0.15 * noise(x / 600, z / 600)) : 0;
  return desert * (1 - v) + floor * v + hills;
}
// and as the eye sees it, the Earth curving away
export const heightAt = (x, z) => groundAt(x, z) - (x * x + z * z) / (2 * EARTH_R);

// the land is drawn as rings about the pyramid's centre: four across its own ground, then each about
// 4.5 % wider than the last, out to REACH (land.js lays 320 points round each)
export function rings() {
  const r = [0, 40, 80, 120];
  while (r[r.length - 1] < REACH) r.push(r[r.length - 1] * 1.045 + 1.5);
  return r;
}
