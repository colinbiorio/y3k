// rocks.js — LORD HOWE ISLAND'S ROCKS AND WHAT THE SEA LEAVES ON ITS BEACHES, AS NUMBERS. No page, no three: the suite
// runs it; stones.js draws it.
//
// The island is two eroded basalt volcanoes. Its southern mountains, Mount Lidgbird and Mount Gower, end in walls of
// stacked lava flows hundreds of metres high; what falls from them lies below as TALUS: angular blocks, the largest
// nearest the wall, smaller further down, half buried, under the palm forest that grows up to the walls' feet, bare
// where a fall is fresh. Where the mountains and the headlands meet the open sea the shore is BOULDERS: the same rock
// rounded by the surf, grey when dry and black where the swash wets it, with ledges of rock the swash runs over. The
// lagoon's beaches are clean coral sand: a WRACK LINE at the top of the swash that is a few lumps of dead coral, a shell,
// a bleached stick, once in a long way a drift log; and patches of coral rubble where the beach meets the water. (Judged
// against photographs of the places; none is in the game.)
//
// rockField(ground, shape): made once: for every point of the island's 16 m grid, how far it lies below a wall and how
// great that wall is (its talus), and how rocky its shore is. rocksIn and wrackIn then say, for any rectangle, what
// stands in it: each rock or thing by its cell's own number, so the same block lies in the same place every time.
import { hash, vnoise, cover, palmsNear } from './life.js';
import { seaMap } from './sea.js';

export const ROCKS = {
  wall: 1.0,                 // a grid point steeper than this (rise over run: 45 degrees) with two such beside it is a wall's
  wallMin: 10,               // and higher than this (m)
  reach: 125,                // m below a wall its talus lies
  drop: 5,                   // m a point must lie under its nearest wall to be below it
  talusCell: 5.4,            // m: one great block at most to each cell of the talus, with its family round it
  screeCell: 2.1,            // and one small piece to each of these, where the talus lies thickest
  shoreCell: 1.9,            // a boulder shore's great boulders, each with its family
  cobbleCell: 1.1,           // and the cobbles between them
  shoreBand: [-1.3, 3.3],    // m over the mean water: from knee-deep to the storm ridge; thickest at the water's edge
  wrackCell: 0.8,            // the beach's things
  small: 0.28, great: 4.6,   // m: the smallest block drawn as a block (smaller is the ground's own texture), the greatest
  far: 480,                  // a rock is drawn out to this many of its own lengths (a few pixels high there); a small one less
  solid: 0.9,                // m: a rock this long or longer is in a body's way
};
// the models (rocks-build.mjs MODELS, by name) and each one's three sides as scanned (m: across, up, along; it stands on
// y = 0, its middle over the origin); a rock's size is its longest side
export const MODELS = ['slab', 'chunk', 'shard', 'boulder', 'cobble', 'stick', 'log', 'shell', 'coral'];
export const DIMS = { slab: [2.41, 1.47, 3.07], chunk: [0.17, 0.14, 0.32], shard: [0.074, 0.033, 0.145], boulder: [0.67, 0.65, 1.21], cobble: [1.36, 0.54, 0.75],
  stick: [0.25, 0.44, 0.23], log: [3.05, 0.29, 0.28], shell: [0.14, 0.05, 0.07], coral: [0.15, 0.07, 0.09] };
export const LONGEST = Object.fromEntries(Object.entries(DIMS).map(([k, d]) => [k, Math.max(...d)]));
// what the ground is at a rock's foot, as terrain.js's surfaces' mean colours (linear): it climbs the foot
export const FOOT = { sand: [0.55, 0.5, 0.41], litter: [0.085, 0.066, 0.042], grass: [0.07, 0.115, 0.036], rock: [0.125, 0.116, 0.104], shore: [0.15, 0.142, 0.128] };

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// how far off a rock of length s (m) is still drawn (m): ROCKS.far of its lengths, a small one much less (a pebble shore
// is the ground's own texture from a little way off; a boulder field is seen from across the lagoon)
export const farOf = (s) => ROCKS.far * s * Math.min(1, Math.max(0.3, (s - 0.2) / 0.5));
// how high the swash reaches over the mean water where the sea's map says a point is (water.js seaReach, the same numbers)
export const reachOf = (sd) => 0.08 + (0.34 - 0.08) * sm(-700, -60, sd);

// THE FIELD: Uint8 grids over the island's own (w x h, 16 m): `talus` (0..255: how thick the fallen rock lies), `great`
// (how great the wall above is), `shore` (how rocky the shore is), and `sd`, the sea's own map's first number (m outside
// the reef's crest; on the land and in the lagoon, negative)
export function rockField(ground, shape = null, map = null) {
  const head = ground.head, w = head.w, h = head.h, S = head.spacing, a = ground.hts.main, n = w * h;
  const slope = new Float32Array(n), wall = new Uint8Array(n);
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const k = j * w + i; slope[k] = Math.hypot(a[k + 1] - a[k - 1], a[k + w] - a[k - w]) / (2 * S); }
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i; if (slope[k] <= ROCKS.wall || a[k] < ROCKS.wallMin) continue;
    let c = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && slope[k + dj * w + di] > ROCKS.wall) c++;
    if (c >= 2) wall[k] = 1;
  }
  // how great each wall point's wall is: the wall points within 3 cells of it (of 49)
  const mass = new Uint8Array(n);
  for (let j = 3; j < h - 3; j++) for (let i = 3; i < w - 3; i++) {
    const k = j * w + i; if (!wall[k]) continue;
    let c = 0; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) c += wall[k + dj * w + di];
    mass[k] = Math.min(255, Math.round((255 * Math.min(1, (c - 3) / 22))));
  }
  // every point's nearest wall point (two sweeps carrying the nearest one's place: Danielsson's)
  const near = new Int32Array(n).fill(-1);
  const d2 = (k, q) => { const dx = (k % w) - (q % w), dz = Math.floor(k / w) - Math.floor(q / w); return dx * dx + dz * dz; };
  const take = (k, from) => { const q = near[from]; if (q < 0) return; if (near[k] < 0 || d2(k, q) < d2(k, near[k])) near[k] = q; };
  for (let k = 0; k < n; k++) if (wall[k]) near[k] = k;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const k = j * w + i; take(k, k - 1); take(k, k - w); take(k, k - w - 1); take(k, k - w + 1); }
  for (let j = h - 2; j > 0; j--) for (let i = w - 2; i > 0; i--) { const k = j * w + i; take(k, k + 1); take(k, k + w); take(k, k + w + 1); take(k, k + w - 1); }
  if (!map) map = seaMap(a, w, h, S, { x0: head.x0, z0: head.z0, reef: shape?.reef || null, lagoonSouth: shape?.lagoonSouth ?? Infinity });
  const talus = new Uint8Array(n), great = new Uint8Array(n), shore = new Uint8Array(n), sd = new Float32Array(n), dist = new Float32Array(n).fill(1e6);
  for (let k = 0; k < n; k++) {
    sd[k] = map.data[4 * k];
    const q = near[k]; if (q < 0) continue;
    dist[k] = S * Math.sqrt(d2(k, q));
    if (wall[k] || slope[k] > 1.12 || a[k] < -2 || a[q] - a[k] < ROCKS.drop || dist[k] >= ROCKS.reach) continue;
    const t = 1 - dist[k] / ROCKS.reach;
    talus[k] = Math.round(255 * t * (0.35 + 0.65 * mass[q] / 255)); great[k] = mass[q];
  }
  // a rocky shore: where the land behind the water's edge is steep (a headland, a mountain's foot), or a wall stands
  // within a few hundred metres, on the open sea's side; in the lagoon only its steepest points
  for (let j = 3; j < h - 3; j++) for (let i = 3; i < w - 3; i++) {
    const k = j * w + i; if (a[k] < -3 || a[k] > 6) continue;
    let steep = 0; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const q = k + dj * w + di; if (a[q] > 0.4 && slope[q] > steep) steep = slope[q]; }
    const open = sm(-420, -90, sd[k]);
    const r = Math.max(sm(0.3, 0.6, steep), sm(280, 130, dist[k])) * open + 0.75 * sm(0.5, 0.82, steep) * (1 - open);
    shore[k] = Math.round(255 * Math.min(1, r));
  }
  return { w, h, S, x0: head.x0, z0: head.z0, talus, great, shore, sd, wall };
}
// a field's number at a point (between its four grid points), 0..1; off the grid, 0
function at(F, grid, x, z) {
  const gx = (x - F.x0) / F.S, gz = (z - F.z0) / F.S;
  if (!(gx >= 0 && gz >= 0 && gx < F.w - 1 && gz < F.h - 1)) return 0;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, k = j * F.w + i;
  return ((grid[k] * (1 - fx) + grid[k + 1] * fx) * (1 - fz) + (grid[k + F.w] * (1 - fx) + grid[k + F.w + 1] * fx) * fz) / (grid === F.sd ? 1 : 255);
}
export const fieldAt = (F, x, z) => ({ talus: at(F, F.talus, x, z), great: at(F, F.great, x, z), shore: at(F, F.shore, x, z), sd: at(F, F.sd, x, z) });
// whether any of a rectangle's grid points has talus or a rocky shore (a tile with neither is not looked through)
export function anyIn(F, x0, z0, x1, z1) {
  const i0 = Math.max(0, Math.floor((x0 - F.x0) / F.S)), i1 = Math.min(F.w - 1, Math.ceil((x1 - F.x0) / F.S)), j0 = Math.max(0, Math.floor((z0 - F.z0) / F.S)), j1 = Math.min(F.h - 1, Math.ceil((z1 - F.z0) / F.S));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * F.w + i; if (F.talus[k] || F.shore[k]) return true; }
  return false;
}

// a rock, by its own numbers (`i`, `j`, `salt`: its cell's and, for one of a family, its place in it): which model, how
// it lies (its upright the ground's own normal, leaned from it by `lean` toward `leanTo`, turned about it by `yaw`; some
// rolled onto another face: a quarter turn puts its side up, a half its underside), its three sides' own stretch, how
// tall it stands as it lies and how much of that is sunk in the ground (more on steep ground: a block on a slope is
// dug in, not perched), its shade and its leaning toward rust, the moss on it, and what is at its foot
function rock(ground, i, j, salt, x, z, y, size, model, o = {}) {
  const u = (q) => hash(i, j, salt + q), k = size / LONGEST[model], D = DIMS[model];
  const roll = o.roll ?? (u(4) < (o.rolled ?? 0.3) ? (u(5) < 0.5 ? 1 : 2) : 0);
  // (the splinter is a hand-sized flake as scanned: as a block it is given more body)
  const stretch = [0.88 + 0.26 * u(6), (o.flat ?? (model === 'shard' ? 1.7 : 1)) * (0.85 + 0.3 * u(7)), 0.88 + 0.26 * u(8)];
  const tall = roll === 1 ? D[2] * k * stretch[2] : D[1] * k * stretch[1];
  const [sx, sz] = ground.slope(x, z, Math.max(1, size * 0.5)), steep = Math.hypot(sx, sz);
  const sink = Math.min(0.62, (o.sink ?? 0.22) + 0.18 * u(9) + 0.3 * Math.min(1, steep));
  return {
    x, z, y, size, model, yaw: 6.2832 * u(1), lean: (o.lean ?? 0.5) * u(2), leanTo: 6.2832 * u(3), roll, stretch, tall, sink,
    // how far along its upright its model's origin stands from the ground: less what is sunk, and for a rolled one the
    // lift that sets it on its new foot
    lift: (roll === 1 ? 0.5 * tall : roll === 2 ? tall : 0) - sink * tall,
    tint: 0.62 + 0.46 * u(10), rust: u(11) < 0.14 ? 0.3 + 0.5 * u(12) : 0.1 * u(12), moss: o.moss ?? 0, foot: o.foot || 'rock', slope: [sx, sz], kind: o.kind || 'talus', id: (i * 73856093) ^ (j * 19349663) ^ (salt * 83492791),
  };
}

// THE TALUS AND THE BOULDER SHORES whose cells lie in the rectangle [x0, x1) by [z0, z1). Neither is a sprinkling: a
// fallen block breaks and brings smaller ones with it, and more lodge against it afterwards; a great boulder on a shore
// holds a nest of smaller ones. So each is laid as FAMILIES (a great one by its cell's number, and round it, touching
// and overlapping it, its smaller ones: nearer and more of them the thicker the field is there), with small pieces
// between the families where the field is thickest: thickest at the wall's foot and at the water's edge, thinning away.
// (One of a family may lie just outside the rectangle: it is its great one's.)
// `min`: only the rocks at least this long (m): a square seen from far off is asked for its great ones alone.
export function rocksIn(F, ground, x0, z0, x1, z1, min = 0) {
  const out = [];
  if (!anyIn(F, x0 - 8, z0 - 8, x1 + 8, z1 + 8)) return out;
  const tongueAt = (x, z) => sm(0.34, 0.62, vnoise(x / 23, z / 23) * 0.6 + vnoise(x / 8 + 5, z / 8) * 0.4);
  const floorOf = (x, z, y) => { const kind = y < 2.9 ? 'beach' : cover(ground, x, z); return { foot: kind === 'beach' ? 'shore' : kind === 'forest' || kind === 'moss' ? 'litter' : kind === 'grass' ? 'grass' : 'rock', moss: kind === 'moss' ? 0.9 : kind === 'forest' ? 0.25 + 0.5 * vnoise(x / 6, z / 6) : 0.08 }; };
  // ---- the talus: its great blocks, the largest nearest the wall, each with what came down with it
  let c = ROCKS.talusCell;
  for (let j = Math.ceil(z0 / c); j * c < z1; j++) for (let i = Math.ceil(x0 / c); i * c < x1; i++) {
    const x = (i + 0.1 + 0.8 * hash(i, j, 21)) * c, z = (j + 0.1 + 0.8 * hash(i, j, 22)) * c, t = at(F, F.talus, x, z);
    if (t < 0.03) continue;
    const thick = Math.min(1, 2.1 * Math.pow(t, 1.25) * (0.22 + 0.78 * tongueAt(x, z)) + 0.1 * t);
    if (hash(i, j, 23) > thick) continue;
    const y = ground.height(x, z); if (y < -0.9) continue;
    const most = 1.0 + ROCKS.great * t * (0.35 + 0.65 * at(F, F.great, x, z)), size = 0.75 * Math.pow(most / 0.75, Math.pow(hash(i, j, 24), 1.5));
    const fl = floorOf(x, z, y), head = rock(ground, i, j, 100, x, z, y, size, size > 1.3 && hash(i, j, 25) < 0.72 ? 'slab' : 'chunk', { ...fl, lean: 0.4, rolled: 0.45 });
    if (size >= min) out.push(head);
    if (size * 0.5 < min) continue;                                       // (none of its family is so long)
    // its family: down the slope from it more than up, the smaller the further
    const n = 2 + Math.floor((3 + 7 * thick) * hash(i, j, 26)), [gx, gz] = head.slope;
    for (let q = 0; q < n; q++) {
      const a = 6.2832 * hash(i, j, 400 + q), far = hash(i, j, 440 + q), d = size * (0.36 + 0.95 * Math.pow(far, 1.4));
      const cx = x + Math.cos(a) * d - gx * 0.35 * size * far, cz = z + Math.sin(a) * d - gz * 0.35 * size * far, cy = ground.height(cx, cz);
      if (cy < -0.9) continue;
      const cs = Math.max(ROCKS.small, size * (0.13 + 0.3 * Math.pow(hash(i, j, 480 + q), 1.6)) * (1.15 - 0.4 * far)), pick = hash(i, j, 520 + q);
      if (cs >= min) out.push(rock(ground, i, j, 1000 + 40 * q, cx, cz, cy, cs, cs > 1.1 ? 'slab' : cs < 0.5 && pick < 0.4 ? 'shard' : 'chunk', { ...floorOf(cx, cz, cy), lean: 0.5, rolled: 0.5, sink: 0.2 }));
    }
  }
  // (the scree between the families, where the talus lies thickest: small pieces, one to a small cell)
  c = ROCKS.screeCell;
  if (min < 0.73) for (let j = Math.ceil(z0 / c); j * c < z1; j++) for (let i = Math.ceil(x0 / c); i * c < x1; i++) {
    const x = (i + hash(i, j, 61)) * c, z = (j + hash(i, j, 62)) * c, t = at(F, F.talus, x, z);
    if (t < 0.3 || hash(i, j, 63) > 0.7 * sm(0.3, 0.85, t) * (0.25 + 0.75 * tongueAt(x, z))) continue;
    const y = ground.height(x, z); if (y < -0.9) continue;
    const size = ROCKS.small * Math.pow(2.6, Math.pow(hash(i, j, 64), 1.5));
    if (size >= min) out.push(rock(ground, i, j, 600, x, z, y, size, hash(i, j, 65) < 0.45 ? 'shard' : 'chunk', { ...floorOf(x, z, y), lean: 0.6, rolled: 0.5, sink: 0.2, kind: 'scree' }));
  }
  // ---- the boulder shores: sea-rounded, thickest at the water's edge, thinning up to the storm ridge and out into the
  // water; a fallen angular block among them; low at the water, ledges the swash runs over
  const bandOf = (y) => sm(ROCKS.shoreBand[0], -0.15, y) * (0.22 + 0.78 * sm(ROCKS.shoreBand[1], 0.9, y)) * sm(ROCKS.shoreBand[1] + 0.4, ROCKS.shoreBand[1] - 0.6, y);
  const round = (pick, size) => (pick < 0.12 ? (size > 0.9 ? 'slab' : 'chunk') : pick < 0.6 ? 'boulder' : 'cobble');
  c = ROCKS.shoreCell;
  for (let j = Math.ceil(z0 / c); j * c < z1; j++) for (let i = Math.ceil(x0 / c); i * c < x1; i++) {
    const x = (i + 0.08 + 0.84 * hash(i, j, 31)) * c, z = (j + 0.08 + 0.84 * hash(i, j, 32)) * c, r = at(F, F.shore, x, z);
    if (r < 0.06) continue;
    const y = ground.height(x, z), band = bandOf(y); if (band <= 0) continue;
    const thick = r * band * (0.4 + 0.6 * sm(0.3, 0.58, vnoise(x / 13, z / 13) * 0.65 + vnoise(x / 4.3 + 9, z / 4.3) * 0.35));
    if (hash(i, j, 33) > thick * 1.15) continue;
    const pick = hash(i, j, 35), u = hash(i, j, 34);
    if (pick < 0.03 && y > -0.5 && y < 0.7) { out.push(rock(ground, i, j, 200, x, z, y, 2.6 + 3.4 * u, 'slab', { flat: 0.42, sink: 0.4, lean: 0.1, rolled: 0, foot: 'shore', kind: 'ledge' })); continue; }
    const size = 0.7 * Math.pow(2.4 / 0.7, Math.pow(u, 1.6));
    if (size >= min) out.push(rock(ground, i, j, 200, x, z, y, size, round(pick, size), { sink: 0.26, lean: 0.8, rolled: 0.5, foot: 'shore', kind: 'shore' }));
    if (size * 0.6 < min) continue;
    const n = 4 + Math.floor((3 + 9 * thick) * hash(i, j, 36));
    for (let q = 0; q < n; q++) {
      const a = 6.2832 * hash(i, j, 700 + q), far = hash(i, j, 740 + q), d = size * (0.34 + 0.8 * Math.pow(far, 1.3));
      const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, cy = ground.height(cx, cz);
      if (cy < ROCKS.shoreBand[0] || cy > ROCKS.shoreBand[1] + 0.3) continue;
      const cs = Math.max(ROCKS.small, size * (0.2 + 0.4 * Math.pow(hash(i, j, 780 + q), 1.4)));
      if (cs >= min) out.push(rock(ground, i, j, 2000 + 40 * q, cx, cz, cy, cs, round(hash(i, j, 820 + q), cs), { sink: 0.24, lean: 0.9, rolled: 0.5, foot: 'shore', kind: 'shore' }));
    }
  }
  c = ROCKS.cobbleCell;
  if (min < 0.64) for (let j = Math.ceil(z0 / c); j * c < z1; j++) for (let i = Math.ceil(x0 / c); i * c < x1; i++) {
    const x = (i + hash(i, j, 71)) * c, z = (j + hash(i, j, 72)) * c, r = at(F, F.shore, x, z);
    if (r < 0.2) continue;
    const y = ground.height(x, z), band = bandOf(y);
    if (band <= 0 || hash(i, j, 73) > 0.9 * r * band) continue;
    const size = ROCKS.small * Math.pow(2.3, Math.pow(hash(i, j, 74), 1.4));
    if (size >= min) out.push(rock(ground, i, j, 800, x, z, y, size, hash(i, j, 75) < 0.55 ? 'cobble' : 'boulder', { sink: 0.26, lean: 0.9, rolled: 0.5, foot: 'shore', kind: 'cobbles' }));
  }
  return out;
}

// THE BEACH'S THINGS in a rectangle: along the top of the swash a sparse line (lumps of dead coral, a shell, a
// bleached stick; a drift log once in a long way), and in the lagoon's edge patches of coral rubble
export function wrackIn(F, ground, x0, z0, x1, z1) {
  const out = [], c = ROCKS.wrackCell;
  for (let j = Math.ceil(z0 / c); j * c < z1; j++) for (let i = Math.ceil(x0 / c); i * c < x1; i++) {
    const x = (i + hash(i, j, 41)) * c, z = (j + hash(i, j, 42)) * c, y = ground.height(x, z);
    if (y < -0.35 || y > 1.3) continue;
    const f = fieldAt(F, x, z); if (f.shore > 0.3) continue;                       // (a boulder shore keeps its own)
    const [sx, sz] = ground.slope(x, z, 1.5); if (Math.hypot(sx, sz) > 0.3) continue;
    // the line: the swash's reach here and a hand more (the last, highest runs leave it), wandering a little along the beach
    const line = reachOf(f.sd) + 0.1 + 0.12 * (vnoise(x / 9, z / 9) - 0.5), off = Math.abs(y - line), u = hash(i, j, 43), pick = hash(i, j, 44);
    if (off < 0.045) {
      // a log, once in some hundred and fifty metres of beach (a coarser cell's own number, at one place along it)
      const li = Math.floor(x / 38), lj = Math.floor(z / 38);
      if (hash(li, lj, 45) < 0.3 && Math.abs(x - (li + 0.5) * 38) < 1.2 * c && Math.abs(z - (lj + 0.2 + 0.6 * hash(li, lj, 46)) * 38) < 0.6 * c) { out.push({ ...rock(ground, i, j, 300, x, z, y, 1.9 + 1.5 * hash(li, lj, 47), 'log', { sink: 0.2, lean: 0.06, rolled: 0, foot: 'sand', kind: 'wrack' }), rough: 0.78 }); continue; }
      if (u > 0.2) continue;
      const model = pick < 0.6 ? 'coral' : pick < 0.82 ? 'stick' : pick < 0.93 ? 'shell' : 'coral';
      const size = model === 'coral' ? 0.05 + 0.13 * hash(i, j, 48) ** 2 : model === 'stick' ? 0.3 + 0.75 * hash(i, j, 48) : 0.08 + 0.09 * hash(i, j, 48);
      out.push({ ...rock(ground, i, j, 300, x, z, y, size, model, { sink: model === 'stick' ? 0.3 : 0.25, lean: model === 'stick' ? 0.15 : 0.6, ...(model === 'stick' ? { roll: 1 } : { rolled: 0.5 }), foot: 'sand', kind: 'wrack' }), rough: model === 'shell' ? 0.34 : model === 'stick' ? 0.8 : 0.9 });
    } else if (y < 0.14 && f.sd < -200) {
      // coral rubble where the lagoon's beach meets the water: in patches a few metres across
      const patch = sm(0.6, 0.72, vnoise(x / 6.5 + 31, z / 6.5) * 0.7 + vnoise(x / 2.1, z / 2.1 + 7) * 0.3);
      if (u > 0.55 * patch) continue;
      out.push({ ...rock(ground, i, j, 300, x, z, y, 0.05 + 0.16 * hash(i, j, 48) ** 1.6, pick < 0.9 ? 'coral' : 'shell', { sink: 0.3, lean: 0.8, rolled: 0.5, foot: 'sand', kind: 'rubble' }), rough: 0.9 });
    }
  }
  return out;
}

// HOW A ROCK LIES, as a matrix's sixteen numbers (column-major, as three keeps them): its model's unit made its size and
// stretched, rolled onto another face if it is, its upright the ground's own normal with its own lean, turned about it,
// and sunk along it (not straight down: on a slope a block is dug into the slope)
export function placeOf(r, out = new Float32Array(16), o = 0) {
  const k = r.size / LONGEST[r.model], [qx, qy, qz] = r.stretch;
  const nl = Math.hypot(r.slope[0], 1, r.slope[1]), s = Math.sin(r.lean) * 0.5;
  let lx = -r.slope[0] / nl + Math.sin(r.leanTo) * s, lz = -r.slope[1] / nl + Math.cos(r.leanTo) * s;
  const lh = Math.hypot(lx, lz); if (lh > 0.92) { lx *= 0.92 / lh; lz *= 0.92 / lh; }
  const ly = Math.sqrt(1 - lx * lx - lz * lz);
  // a frame about that upright, turned by yaw: across (made square to the upright), then along = across x up
  let ax = Math.cos(r.yaw), ay = 0, az = -Math.sin(r.yaw);
  const d = ax * lx + az * lz; ax -= lx * d; ay -= ly * d; az -= lz * d; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
  const X = [ax, ay, az], U = [lx, ly, lz], A = [ay * lz - az * ly, az * lx - ax * lz, ax * ly - ay * lx];
  // where the model's own up and along go: as they are; or its along up and its up along (its side up: a quarter turn
  // about its across); or both turned over
  const Y = r.roll === 1 ? [-A[0], -A[1], -A[2]] : r.roll === 2 ? [-U[0], -U[1], -U[2]] : U, Z = r.roll === 1 ? U : r.roll === 2 ? [-A[0], -A[1], -A[2]] : A;
  const kx = k * qx, ky = k * qy, kz = k * qz;
  out[o] = X[0] * kx; out[o + 1] = X[1] * kx; out[o + 2] = X[2] * kx; out[o + 3] = 0;
  out[o + 4] = Y[0] * ky; out[o + 5] = Y[1] * ky; out[o + 6] = Y[2] * ky; out[o + 7] = 0;
  out[o + 8] = Z[0] * kz; out[o + 9] = Z[1] * kz; out[o + 10] = Z[2] * kz; out[o + 11] = 0;
  out[o + 12] = r.x + U[0] * r.lift; out[o + 13] = r.y + U[1] * r.lift; out[o + 14] = r.z + U[2] * r.lift; out[o + 15] = 1;
  return out;
}

// the rocks a body at (x, z) could touch: those long enough to be in its way, as life.js's trunks are ({ x, z, y, h, r })
export function blocksNear(F, ground, x, z) {
  const out = [];
  for (const r of rocksIn(F, ground, x - 9, z - 9, x + 9, z + 9)) {
    if (r.size < ROCKS.solid || r.kind === 'ledge' || Math.hypot(r.x - x, r.z - z) > 6) continue;
    out.push({ x: r.x, z: r.z, y: r.y - r.sink * r.tall, h: r.tall, r: 0.34 * r.size });
  }
  return out;
}
// no block where a palm's trunk stands (stones.js asks it of the near ones only: the palms within a block's own length)
export function clearOfPalms(ground, r) {
  for (const p of palmsNear(ground, r.x, r.z, 0.5 * r.size + 0.4)) if (Math.hypot(p.x - r.x, p.z - r.z) < 0.42 * r.size + 0.3) return false;
  return true;
}
