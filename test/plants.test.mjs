// THE ISLAND'S PLANTS (src/game/island/kentia.js, plants.js, far.js, life.js): what can be held without a GPU. The Kentia
// palm's numbers against the botanists' measures; its leaflets hang; the far forest plants the same palms as the near; the
// shaders' numbers are the module's numbers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KENTIA, crownOf, spineOf, leafletsOf, leafletAt, leafletWidth, leafletLength, reachOf } from '../src/game/island/kentia.js';
import { palmsNear, palmsIn, PALM } from '../src/game/island/life.js';
import { parseHead, heightsOf, createGround, HEAD } from '../src/game/island/ground.js';
import { SHAPE } from '../src/game/island/lordhowe-shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const bytes = new Uint8Array(readFileSync(join(ROOT, 'src/game/island/lordhowe.bin')));
const head = parseHead(bytes), ground = createGround(head, heightsOf(head, inflateSync(bytes.subarray(HEAD))));
const crowns = Array.from({ length: 6 }, (_, v) => crownOf(9001 + v * 7, { dead: v < 3 }));

ok('a grown crown holds 12 to 18 open fronds, the youngest rising steeply, the oldest hanging; each 2.4 to 4.3 m with about 46 leaflets a side', () => {
  for (const c of crowns) {
    assert.ok(c.n >= 12 && c.n <= 18, 'fronds: ' + c.n);
    const open = c.fronds.filter((f) => !f.dead);
    assert.ok(open[0].rise > (55 * Math.PI) / 180, 'the youngest rises: ' + ((open[0].rise * 180) / Math.PI).toFixed(0));
    assert.ok(open[open.length - 1].rise < 0, 'the oldest green one is below level');
    for (const f of c.fronds) { const L = f.petiole + f.rachis; assert.ok(L > 2.4 && L < 4.3, 'frond ' + L.toFixed(2)); assert.equal(leafletsOf(f).length, 2 * KENTIA.frond.leaflets); }
  }
});

ok('its leaflets: longest a third of the way out (about 0.8 m on a 2.35 m rachis), drawn out to a point, 2 to 5 cm wide', () => {
  let best = 0, at = 0; for (let x = 0; x <= 1; x += 0.01) { const l = leafletLength(x); if (l > best) { best = l; at = x; } }
  assert.ok(at > 0.25 && at < 0.45, 'longest at ' + at.toFixed(2));
  assert.ok(leafletLength(0) < 0.6 && leafletLength(1) < 0.35, 'shorter at the base and the tip');
  assert.equal(leafletWidth(1), 0, 'a point'); assert.ok(leafletWidth(0) < leafletWidth(0.2), 'narrow where it joins');
  const f = { petiole: 1, rachis: 2.35, age: 0.5, dead: false, seed: 7 };
  for (const lf of leafletsOf(f)) { assert.ok(lf.len <= 0.78 * 1.1 + 1e-9, 'long ' + lf.len.toFixed(3)); assert.ok(lf.wide >= 0.012 && lf.wide <= 0.05, 'wide ' + lf.wide.toFixed(3)); }
});

ok('its leaflets hang: they leave the rachis down and outward (a shallow ^) and their tips hang below where they join, the more the older the frond', () => {
  const drops = [];
  for (const f of crowns[0].fronds.filter((q) => !q.dead)) {
    const sp = spineOf(f), lfs = leafletsOf(f);
    let d = 0; for (const lf of lfs) { const b = leafletAt(sp, lf, 0), e = leafletAt(sp, lf, 1); d += b.p[1] - e.p[1]; }
    drops.push([f.age, d / lfs.length]);
  }
  for (const [age, d] of drops) if (age > 0.3) assert.ok(d > 0.15, `age ${age.toFixed(2)}: tips ${d.toFixed(2)} m below`);
  assert.ok(drops[drops.length - 1][1] > drops[0][1], 'an old frond hangs more than a young one');
});

ok('a crown 5 to 8 m across as it is placed (3 to 7 m in the descriptions, the widest of ours a little over), its fronds reaching 3 to 4.5 m below the trunk\'s top when one hangs dead', () => {
  for (const c of crowns) {
    const r = reachOf(c);
    for (const s of [0.78 + 0.018 * 2.5, 0.78 + 0.018 * 14]) assert.ok(2 * r.r * s > 5 && 2 * r.r * s < 8.2, 'across ' + (2 * r.r * s).toFixed(2));
    if (c.dead) assert.ok(-r.low > 3 && -r.low < 4.6, 'hangs ' + (-r.low).toFixed(2));
  }
});

ok('the far forest plants the same palms as the near (palmsIn and palmsNear agree), every palm on the island in its squares', () => {
  for (const [x, z, r] of [[-60, -1296, 60], [-1500, -4000, 90], [300, 2600, 80]]) {
    const a = palmsNear(ground, x, z, r).map((p) => p.id).sort((m, n) => m - n);
    const b = palmsIn(ground, x - r - 7, z - r - 7, x + r + 7, z + r + 7).filter((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= r * r).map((p) => p.id).sort((m, n) => m - n);
    assert.deepEqual(a, b, `at ${x}, ${z}`);
  }
  const far = read('src/game/island/far.js'), T = +far.match(/tile: (\d+),/)[1], e = SHAPE.extent;
  assert.ok(Math.floor(e.x0 / T) * T <= e.x0 && Math.floor(e.z0 / T) * T <= e.z0, 'the squares begin at or before the island');
  let n = 0; for (let z = Math.floor(e.z0 / T) * T; z < e.z1; z += T) for (let x = Math.floor(e.x0 / T) * T; x < e.x1; x += T) n += palmsIn(ground, x, z, x + T, z + T).length;
  assert.ok(n > 150000 && n < 260000, 'palms on the island: ' + n);
  console.log(`    ${n} palms on the island, one to each ${PALM.cell} m cell that its number and its ground allow`);
});

ok('the shaders\' numbers are the module\'s: the frond picture\'s leaflet width, the far pictures\' hemi-octahedral grid, the far forest\'s reach in the ground', () => {
  const plants = read('src/game/island/plants.js'), far = read('src/game/island/far.js'), terrain = read('src/game/island/terrain.js');
  assert.match(plants, /float lfWidth\( float u \) \{ return u < 0\.18 \? 0\.45 \+ 0\.55 \* sin\( 1\.5707963 \* u \/ 0\.18 \) : max\( 0\.0, 1\.0 - pow\( \( u - 0\.18 \) \/ 0\.82, 1\.35 \) \); \}/);
  assert.match(read('src/game/island/kentia.js'), /u < 0\.18 \? 0\.45 \+ 0\.55 \* Math\.sin\(\(Math\.PI \/ 2\) \* \(u \/ 0\.18\)\) : Math\.max\(0, 1 - Math\.pow\(\(u - 0\.18\) \/ 0\.82, 1\.35\)\)/);
  // farWay (GLSL) and hemiOctWay (JS): the same decoding of the square to the half-sphere
  assert.match(far, /vec2 f = o \* 2\.0 - 1\.0; float x = \( f\.x \+ f\.y \) \* 0\.5, z = \( f\.x - f\.y \) \* 0\.5; return normalize\( vec3\( x, 1\.0 - abs\( x \) - abs\( z \), z \) \);/);
  assert.match(far, /const fx = o\[0\] \* 2 - 1, fy = o\[1\] \* 2 - 1, x = \(fx \+ fy\) \/ 2, z = \(fx - fy\) \/ 2, y = 1 - Math\.abs\(x\) - Math\.abs\(z\)/);
  assert.match(terrain, /smoothstep\( uIsleForest\.y, uIsleForest\.z, isleDist/, 'the canopy\'s colour only past where the far crowns fade');
  assert.match(read('src/game/island/island.js'), /look\.forest = life\.far \? \[B\.mid, F\.end - F\.fade, F\.end\]/);
});

console.log(`\n${passed} checks passed.`);
