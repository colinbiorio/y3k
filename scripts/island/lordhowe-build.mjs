// lordhowe-build.mjs — LORD HOWE ISLAND, MADE INTO THE GAME'S GROUND.
//
//   node scripts/island/lordhowe-build.mjs <tiles folder> <out folder>
//
// Colin, 17 Nov 2026: "generating just a small environment, the first of our
// map -- let's pick a random small island on earth ... just the general shape
// and size and expected fauna of a small island of your choice". The island
// chosen is Lord Howe (31.55 S, 159.08 E), a crescent eleven kilometres long
// in the Tasman Sea, two sheer mountains at its south end, a coral lagoon in
// its hollow.
//
// The land is the AWS Terrain Tiles' (Mapzen terrarium; over this island,
// SRTM at about 30 m), zoom 13, read by tiles.mjs and resampled onto a square
// grid of 16 m in a local frame: x east, z south, metres from (LAT0, LON0).
// The sea in those tiles is far too coarse to show a lagoon (it comes from a
// global relief of about two kilometres a sample), so the sea floor is made
// here by rule, the way such islands are: inside the island's convex hull
// (its hollow, on the west) a shallow sandy lagoon closed by a reef crest
// along the hull's edge; outside, the floor falling away from the land and the
// reef to the island's shelf, some forty metres down. The lagoon is kept where
// the island's own lies: north of Mount Lidgbird's foot and within 1.4 km of
// the shore (the hull alone would carry it down Mount Gower's west side, where
// the cliffs drop into deep water). Ball's Pyramid, the sea stack 23 km to the
// south-east, is not in the tiles (they read 30 m where it stands 551 m): it is
// modelled on a grid of its own from its published size, 551 m high, about
// 1,100 m long and 300 m wide, its long axis running a little east of south.
//
// Out: lordhowe.bin (a small header and the heights, row by row as
// differences, in decimetres, deflated) and lordhowe-shape.js (what the map
// draws and the tests read: the coast as lines, the reef, the peaks, the
// place to arrive). Both are made again from the same tiles to the byte.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { mosaic } from './tiles.mjs';

const [TILES, OUT] = process.argv.slice(2);
if (!TILES || !OUT) { console.error('usage: node lordhowe-build.mjs <tiles folder> <out folder>'); process.exit(2); }
const LAT0 = -31.5503, LON0 = 159.0761;                 // the island's middle (the centroid of its land, rounded)
const M_LAT = 110879, M_LON = 94960;                     // metres a degree of latitude and of longitude here
const S = 16;                                            // metres between samples
const GRID = { x0: -5696, z0: -7600, w: 676, h: 894 };   // the island and 1.5 km of sea round it
const PYR = { lat: -31.7541, lon: 159.2517, half: 900, h: 551, len: 1100, wide: 300, axis: 0.28 };   // Ball's Pyramid: where, its grid's half side, its size, its long axis (rad east of south)
const LAGOON = { shore: 1400 };                          // m: the lagoon reaches no further from the shore than this
const LAND = 2;                                          // m: above this the tiles' ground is land (lower is the sea's blur)
const m = mosaic(TILES, 13);
const ll = (x, z) => [LAT0 - z / M_LAT, LON0 + x / M_LON];

// ---- the land, sampled
function sample(g) {
  const a = new Float32Array(g.w * g.h);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const [lat, lon] = ll(g.x0 + i * S, g.z0 + j * S), h = m.height(lat, lon);
    if (!Number.isFinite(h)) throw new Error(`no tile under ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    a[j * g.w + i] = h;
  }
  return a;
}
// land cells; specks smaller than `least` cells (the sea's noise) are not land
function landOf(g, hts, least = 8) {
  const n = g.w * g.h, land = new Uint8Array(n), comp = new Int32Array(n).fill(-1), sizes = [];
  for (let k = 0; k < n; k++) land[k] = hts[k] > LAND ? 1 : 0;
  for (let k = 0; k < n; k++) {
    if (!land[k] || comp[k] >= 0) continue;
    const id = sizes.length, stack = [k]; comp[k] = id; let size = 0;
    while (stack.length) {
      const c = stack.pop(); size++;
      const i = c % g.w, j = (c - i) / g.w;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue;
        const q = jj * g.w + ii; if (land[q] && comp[q] < 0) { comp[q] = id; stack.push(q); }
      }
    }
    sizes.push(size);
  }
  for (let k = 0; k < n; k++) if (land[k] && sizes[comp[k]] < least) land[k] = 0;
  const main = sizes.indexOf(Math.max(...sizes));
  return { land, comp, sizes, main };
}
// the exact distance (m) from every cell to the nearest cell of `on` (Felzenszwalb and Huttenlocher's two passes)
function distance(g, on) {
  const INF = 1e12, f = new Float64Array(Math.max(g.w, g.h)), d = new Float64Array(Math.max(g.w, g.h)), v = new Int32Array(Math.max(g.w, g.h)), zz = new Float64Array(Math.max(g.w, g.h) + 1);
  const pass = (n) => { let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF; for (let q = 1; q < n; q++) { let s; while (true) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= zz[k]) { k--; continue; } break; } k++; v[k] = q; zz[k] = s; zz[k + 1] = INF; } k = 0; for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } };
  const out = new Float64Array(g.w * g.h);
  for (let i = 0; i < g.w; i++) { for (let j = 0; j < g.h; j++) f[j] = on[j * g.w + i] ? 0 : INF; pass(g.h); for (let j = 0; j < g.h; j++) out[j * g.w + i] = d[j]; }
  for (let j = 0; j < g.h; j++) { for (let i = 0; i < g.w; i++) f[i] = out[j * g.w + i]; pass(g.w); for (let i = 0; i < g.w; i++) out[j * g.w + i] = Math.sqrt(d[i]) * S; }
  return out;
}
// a smooth noise (for the sand's ripples and the coral heads): value noise on a lattice, seeded
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the convex hull of the main island's land (Andrew's monotone chain), as [x, z] in metres
function hullOf(g, L) {
  const pts = [];
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (L.land[j * g.w + i] && L.comp[j * g.w + i] === L.main) pts.push([g.x0 + i * S, g.z0 + j * S]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const toSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const toPoly = (poly, x, z) => { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, toSeg(x, z, poly[i], poly[(i + 1) % poly.length])); return d; };

// ---- the island's grid: the land as it is, the sea floor by rule
const hts = sample(GRID), L = landOf(GRID, hts), dLand = distance(GRID, L.land), hull = hullOf(GRID, L);
// the lagoon's south end: 700 m north of Mount Lidgbird (the second of the southern summits, found from the land as it is)
const southPeaks = (() => { const order = []; for (let k = 0; k < hts.length; k++) if (L.land[k] && hts[k] > 300) order.push(k); order.sort((p, q) => hts[q] - hts[p]); const got = [];
  for (const k of order) { const x = GRID.x0 + (k % GRID.w) * S, z = GRID.z0 + Math.floor(k / GRID.w) * S; if (got.every((p) => Math.hypot(p.x - x, p.z - z) > 700)) got.push({ x, z }); if (got.length >= 2) break; } return got; })();
const LAGOON_SOUTH = Math.min(...southPeaks.map((p) => p.z)) - 700;
const out = new Float32Array(GRID.w * GRID.h);
let lagoonCells = 0;
for (let j = 0; j < GRID.h; j++) for (let i = 0; i < GRID.w; i++) {
  const k = j * GRID.w + i, x = GRID.x0 + i * S, z = GRID.z0 + j * S;
  if (L.land[k]) { out[k] = hts[k]; continue; }
  const dl = dLand[k], de = toPoly(hull, x, z), sand = noise(x / 90, z / 90) - 0.5, heads = Math.max(0, noise(x / 23 + 50, z / 23) - 0.62);
  // how far inside the lagoon's edge: the hull's, the reach from the shore, its south end (negative: outside it)
  const edge = inside(hull, x, z) ? Math.min(de, LAGOON.shore - dl, LAGOON_SOUTH - z) : -de;
  let depth;
  if (edge > 0) {
    // the lagoon: shallow sand deepening a little away from the beach, rippled; the reef crest along its edge, coral heads near it
    lagoonCells++;
    const floor = 0.5 + 2.4 * smooth(0, 380, dl) + 0.7 * sand;
    depth = floor + (0.35 - floor) * smooth(170, 25, edge) - 2.2 * heads * smooth(420, 60, edge);
  } else {
    // outside: falling away from the land and the reef to the shelf
    const d = Math.min(dl, -edge);
    depth = 0.4 + 31 * (1 - Math.exp(-d / 300)) + 12 * smooth(1200, 4200, d) + 1.5 * sand;
  }
  out[k] = -Math.min(48, Math.max(0.25, depth));
}

// ---- Ball's Pyramid, modelled on a grid of its own: a blade of rock, its summit a little north of its middle and a
// lower ridge running on south, its sides near sheer, broken by gullies; the sea round its foot falling away fast
const pyrCentre = [(PYR.lon - LON0) * M_LON, (LAT0 - PYR.lat) * M_LAT];
const PG = { x0: Math.round((pyrCentre[0] - PYR.half) / S) * S, z0: Math.round((pyrCentre[1] - PYR.half) / S) * S, w: Math.round((2 * PYR.half) / S) + 1, h: Math.round((2 * PYR.half) / S) + 1 };
const pout = new Float32Array(PG.w * PG.h), pl = new Uint8Array(PG.w * PG.h);
for (let j = 0; j < PG.h; j++) for (let i = 0; i < PG.w; i++) {
  const x = PG.x0 + i * S - pyrCentre[0], z = PG.z0 + j * S - pyrCentre[1], c = Math.cos(PYR.axis), sn = Math.sin(PYR.axis);
  const a = c * z + sn * x, b = c * x - sn * z;                                       // along its axis (+ south) and across it
  const along = PYR.h * Math.exp(-((a + 90) ** 2) / (2 * 175 ** 2)) + 190 * Math.exp(-((a - 300) ** 2) / (2 * 150 ** 2));
  const half = (PYR.wide / 2) * Math.pow(Math.min(1, along / 260), 0.3) + 8;
  const gully = 0.82 + 0.3 * noise(a / 38, b / 26 + 7) + 0.1 * noise(a / 9, b / 9);
  const hgt = along * Math.max(0, 1 - Math.pow(Math.abs(b) / half, 1.7)) * gully;
  pout[j * PG.w + i] = hgt; pl[j * PG.w + i] = hgt > LAND ? 1 : 0;
}
// its summit is its published height
const pmax = Math.max(...pout); for (let k = 0; k < pout.length; k++) if (pl[k]) pout[k] *= PYR.h / pmax;
const pd = distance(PG, pl);
for (let k = 0; k < pout.length; k++) if (!pl[k]) pout[k] = -Math.min(48, 4 + 42 * (1 - Math.exp(-pd[k] / 160)));

// ---- the coast as lines (marching squares at the sea's edge), simplified (Douglas and Peucker, 6 m)
function coast(g, a, level = 0) {
  const segs = [], at = (i, j) => a[j * g.w + i] - level, P = (i, j) => [g.x0 + i * S, g.z0 + j * S];
  const lerp = (p, q, va, vb) => { const t = va / (va - vb); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
  for (let j = 0; j < g.h - 1; j++) for (let i = 0; i < g.w - 1; i++) {
    const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], p = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    const e = [];
    for (let s = 0; s < 4; s++) { const a1 = v[s], b1 = v[(s + 1) % 4]; if ((a1 > 0) !== (b1 > 0)) e.push(lerp(p[s], p[(s + 1) % 4], a1, b1)); }
    if (e.length === 2) segs.push(e); else if (e.length === 4) { segs.push([e[0], e[1]]); segs.push([e[2], e[3]]); }
  }
  // join the pieces end to end into lines
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`, ends = new Map();
  segs.forEach((s, n) => { for (const p of s) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(n); } });
  const used = new Uint8Array(segs.length), lines = [];
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue;
    used[n] = 1; const line = [segs[n][0], segs[n][1]];
    for (const dir of [1, -1]) {
      while (true) {
        const tip = dir > 0 ? line[line.length - 1] : line[0], next = (ends.get(key(tip)) || []).find((q) => !used[q]);
        if (next === undefined) break;
        used[next] = 1; const s = segs[next], far = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir > 0) line.push(far); else line.unshift(far);
      }
    }
    lines.push(line);
  }
  const dp = (pts, tol) => {
    if (pts.length < 3) return pts;
    let far = 0, fi = 0; for (let k = 1; k < pts.length - 1; k++) { const d = toSeg(pts[k][0], pts[k][1], pts[0], pts[pts.length - 1]); if (d > far) { far = d; fi = k; } }
    return far <= tol ? [pts[0], pts[pts.length - 1]] : dp(pts.slice(0, fi + 1), tol).slice(0, -1).concat(dp(pts.slice(fi), tol));
  };
  return lines.filter((l) => l.length > 3).map((l) => dp(l, 6).map(([x, z]) => [Math.round(x), Math.round(z)])).sort((a, b) => b.length - a.length);
}

// ---- the peaks: the highest point, then each next highest at least 700 m from those before
function peaks(g, a, n = 6) {
  const order = [];
  for (let k = 0; k < a.length; k++) if (a[k] > 60) order.push(k);
  order.sort((p, q) => a[q] - a[p]);
  const got = [];
  for (const k of order) {
    const x = g.x0 + (k % g.w) * S, z = g.z0 + Math.floor(k / g.w) * S;
    if (got.every((p) => Math.hypot(p.x - x, p.z - z) > 700)) got.push({ x, z, h: Math.round(a[k]) });
    if (got.length >= n) break;
  }
  return got;
}
const top = peaks(GRID, out, 40);
// named as the island names them: the two great mountains in the south, the two hills of the north (Mount Eliza the
// more westerly, at North Bay; Malabar Hill east of it)
const south = top.filter((p) => p.z > 0), north = top.filter((p) => p.z < -2000 && p.h > 90).slice(0, 2);
const named = [
  south[0] && { name: 'Mount Gower', real: 875, ...south[0] },
  south.find((p) => p !== south[0] && p.z < south[0].z) && { name: 'Mount Lidgbird', real: 777, ...south.find((p) => p !== south[0] && p.z < south[0].z) },
  north[0] && { name: north[0].x < north[1]?.x ? 'Mount Eliza' : 'Malabar Hill', ...north[0] },
  north[1] && { name: north[0].x < north[1].x ? 'Malabar Hill' : 'Mount Eliza', ...north[1] },
].filter(Boolean);

// ---- the place to arrive: the lagoon's beach in the island's middle, looking south over the lagoon to the mountains
let arrive = null;
for (let j = Math.round((-1300 - GRID.z0) / S); j <= Math.round((-300 - GRID.z0) / S) && !arrive; j++) {
  for (let i = 0; i < GRID.w - 1; i++) {
    const k = j * GRID.w + i;
    if (L.land[k] && L.comp[k] === L.main && out[k] > 2 && out[k] < 6 && !L.land[k - 1] && inside(hull, GRID.x0 + (i - 2) * S, GRID.z0 + j * S)) { arrive = { x: GRID.x0 + (i + 1) * S, z: GRID.z0 + j * S }; break; }
  }
}
if (!arrive) throw new Error('no beach on the lagoon found to arrive at');
const gower = named[0];
arrive.facing = Math.atan2(gower.x - arrive.x, gower.z - arrive.z);   // body.js's yaw: forward is (sin, cos)

// ---- written: the heights as decimetres, each row as differences along it, deflated after a small header
function rows(g, a) {
  const d = new Int16Array(g.w * g.h);
  for (let j = 0; j < g.h; j++) { let was = 0; for (let i = 0; i < g.w; i++) { const v = Math.max(-32000, Math.min(32000, Math.round(a[j * g.w + i] * 10))); d[j * g.w + i] = v - was; was = v; } }
  return Buffer.from(d.buffer);
}
const head = Buffer.alloc(48);
head.write('LHI1', 0, 'latin1'); head.writeUInt16LE(GRID.w, 4); head.writeUInt16LE(GRID.h, 6); head.writeFloatLE(S, 8);
head.writeFloatLE(GRID.x0, 12); head.writeFloatLE(GRID.z0, 16); head.writeUInt16LE(PG.w, 20); head.writeUInt16LE(PG.h, 22);
head.writeFloatLE(PG.x0, 24); head.writeFloatLE(PG.z0, 28); head.writeFloatLE(LAT0, 32); head.writeFloatLE(LON0, 36);
const body = deflateSync(Buffer.concat([rows(GRID, out), rows(PG, pout)]), { level: 9 });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'lordhowe.bin'), Buffer.concat([head, body]));

const landCells = L.land.reduce((s, v) => s + v, 0), mainCells = L.sizes[L.main];
const lines = coast(GRID, out), plines = coast(PG, pout);
const ext = (pred) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let k = 0; k < out.length; k++) if (pred(k)) { const x = GRID.x0 + (k % GRID.w) * S, z = GRID.z0 + Math.floor(k / GRID.w) * S; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; };
const mainExt = ext((k) => L.land[k] && L.comp[k] === L.main);
const shape = {
  name: 'Lord Howe Island', lat: LAT0, lon: LON0, spacing: S, lagoonSouth: LAGOON_SOUTH,
  grid: { ...GRID }, pyramidGrid: { ...PG },
  landKm2: Math.round((landCells * S * S) / 1e4) / 100, mainKm2: Math.round((mainCells * S * S) / 1e4) / 100, islets: L.sizes.filter((s, n) => n !== L.main && s >= 4).length,
  length: Math.round(Math.hypot(mainExt.x1 - mainExt.x0, mainExt.z1 - mainExt.z0)), extent: mainExt,
  lagoonKm2: Math.round((lagoonCells * S * S) / 1e4) / 100,
  peaks: named, arrive: { x: arrive.x, z: arrive.z, facing: Math.round(arrive.facing * 1000) / 1000 },
  reef: hull.map(([x, z]) => [x, z]),
  coast: lines, pyramid: { name: "Ball's Pyramid", x: Math.round(pyrCentre[0]), z: Math.round(pyrCentre[1]), h: Math.round(Math.max(...pout)), real: 551, modelled: true, coast: plines },
};
const js = `// lordhowe-shape.js — MADE BY scripts/island/lordhowe-build.mjs from the AWS Terrain Tiles (zoom 13); not edited by hand.
// Lord Howe Island in the game's frame: x east, z south, metres from ${LAT0}, ${LON0}. The coast as lines, the reef (the
// island's convex hull, where its lagoon is closed), the peaks, the place to arrive, and Ball's Pyramid.
export const SHAPE = ${JSON.stringify(shape)};
`;
writeFileSync(join(OUT, 'lordhowe-shape.js'), js);
console.log(JSON.stringify({ bin: Buffer.concat([head, body]).length, shape: js.length, landKm2: shape.landKm2, mainKm2: shape.mainKm2, islets: shape.islets, length: shape.length, lagoonKm2: shape.lagoonKm2, peaks: named.map((p) => `${p.name} ${p.h} m`), arrive: shape.arrive, pyramid: shape.pyramid.h, coastLines: lines.length, coastPoints: lines.reduce((s, l) => s + l.length, 0) }, null, 1));
