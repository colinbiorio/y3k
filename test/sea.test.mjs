// THE SEA (src/game/island/sea.js, water.js, and what terrain.js and island.js draw with them): what can be held without
// a GPU. The water's optics against what clear ocean water is measured to give back; the light out of the lagoon over its
// sand; the swash's film and the wet beach the same at the water's edge; Fresnel's equations; the FFT the GPU runs, against
// a plain sum; the wind's sea against its spectrum; the swell; the reef's map against the island's own lagoon; the
// shaders' numbers are the module's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import * as SEA from '../src/game/island/sea.js';
import { parseHead, heightsOf, HEAD, seaSheet, SEA_RINGS } from '../src/game/island/ground.js';
import { SHAPE } from '../src/game/island/lordhowe-shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const within = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v} not in ${lo}..${hi}`);
const O = SEA.OPTICS, Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

ok('pure water absorbs as Pope and Fry measured it, at the sky\'s three wavelengths (their table, between its rows)', () => {
  // their table (1/cm): 610 nm 0.002644, 620 nm 0.002755; 540 0.000474, 550 0.000565; 460 0.0000979, 470 0.000106
  const lerp = (a, b, t) => a + (b - a) * t;
  assert.ok(Math.abs(SEA.PURE_A[0] - lerp(0.2644, 0.2755, 0.1)) < 5e-4);
  assert.ok(Math.abs(SEA.PURE_A[1] - lerp(0.0474, 0.0565, 0.9)) < 5e-4);
  assert.ok(Math.abs(SEA.PURE_A[2] - lerp(0.00979, 0.0106, 0.4)) < 5e-4);
  assert.deepEqual(SEA.LAMBDA, [611, 549, 464], 'the sky\'s own three (air.js)');
});

ok('the deep sea gives back what clear oceanic water is measured to: about a hundredth of its blue light (sr^-1), a sixth of that in green, almost no red', () => {
  const R = O.map((o) => SEA.rrsAbove(o.rDeep));
  console.log(`    deep water, light out over light in (sr^-1): ${R.map((x) => x.toFixed(5)).join(', ')} (red, green, blue)`);
  within(R[2], 0.004, 0.012, 'blue'); within(R[1], 0.001, 0.0025, 'green'); within(R[0], 0, 0.0006, 'red');
  within(R[2] / R[1], 3, 6, 'blue over green (clear oceanic water at about 0.1 mg/m3 of chlorophyll)');
  // as an albedo (pi R) the open sea is under one percent: navy, beside a beach that gives back half
  assert.ok(Math.PI * Y(R) < 0.01);
});

ok('over the lagoon\'s white sand the water is turquoise, bluer as it deepens, navy past the reef\'s drop (Lee et al. 1999)', () => {
  const sand = [0.58, 0.53, 0.43].map((x) => x * 0.78);                 // the sand's graded albedo (terrain.js MEAN), its pores full of water
  const at = (H) => O.map((o, i) => SEA.rrsAbove(SEA.rrsBelow(o, H, sand[i], 0.97, 0.98)));
  const two = at(2), ten = at(10), deep = at(40);
  console.log(`    over sand at 2 m: ${two.map((x) => x.toFixed(4)).join(', ')}; at 10 m: ${ten.map((x) => x.toFixed(4)).join(', ')}`);
  assert.ok(two[1] > two[0] * 2 && two[2] > two[0] * 2, 'the red is taken first: turquoise');
  within(two[2] / two[1], 0.8, 1.2, 'green and blue near equal at 2 m');
  assert.ok(ten[2] > ten[1] * 1.2, 'blue by 10 m');
  assert.ok(Y(deep) < Y(ten) && Y(ten) < Y(two), 'darker as it deepens');
  // the limits: no water, the floor; deep, the water alone
  O.forEach((o) => { assert.ok(Math.abs(SEA.rrsBelow(o, 0, 0.4) - 0.4 / Math.PI) < 1e-12); assert.ok(Math.abs(SEA.rrsBelow(o, 500, 0.4) - o.rDeep) < 1e-6); });
});

ok('at the water\'s edge the two drawings meet: sand under a film of water gives back what the wet beach does (Lekner and Dorf\'s 0.45 of dry)', () => {
  const dry = 0.53, film = Math.PI * SEA.rrsAbove(SEA.rrsBelow(O[1], 0.005, dry * 0.78));
  const terrain = read('src/game/island/terrain.js'), wet = JSON.parse(terrain.match(/const WET = (\[[^\]]*\]);/)[1])[0];
  console.log(`    sand under a film: ${(film / dry).toFixed(3)} of dry; the wet beach (terrain.js WET): ${wet}`);
  within(film / dry, wet * 0.85, wet * 1.15, 'the film over sand against the wet strip');
});

ok('Fresnel\'s equations for seawater: 2.1% straight down, all of it at a graze; Snell\'s cosine under the water', () => {
  assert.ok(Math.abs(SEA.fresnel(1) - ((SEA.SEA.n - 1) / (SEA.SEA.n + 1)) ** 2) < 1e-9);
  within(SEA.fresnel(1), 0.020, 0.022, 'straight down'); assert.equal(SEA.fresnel(0), 1);
  within(SEA.fresnel(Math.cos((80 * Math.PI) / 180)), 0.33, 0.36, 'at 80 degrees');
  for (let c = 0.05; c < 1; c += 0.05) assert.ok(SEA.fresnel(c) > SEA.fresnel(c + 0.05) - 1e-12, 'falls as the look steepens');
  within(SEA.underCos(0), Math.sqrt(1 - 1 / SEA.SEA.n ** 2) - 1e-9, Math.sqrt(1 - 1 / SEA.SEA.n ** 2) + 1e-9, 'a grazing line enters at the critical angle');
});

ok('the FFT the GPU runs (Stockham\'s radix 2, natural order in and out) is the plain sum of its waves', () => {
  for (const N of [8, 16, 128]) {
    const re = Array.from({ length: N }, (_, i) => Math.sin(i * 1.3) + 0.2 * i), im = Array.from({ length: N }, (_, i) => Math.cos(i * 0.7));
    const [r, i2] = SEA.inverseFFT(re, im); let err = 0;
    for (let x = 0; x < N; x++) { let sr = 0, si = 0; for (let k = 0; k < N; k++) { const a = (2 * Math.PI * k * x) / N; sr += re[k] * Math.cos(a) - im[k] * Math.sin(a); si += re[k] * Math.sin(a) + im[k] * Math.cos(a); } err = Math.max(err, Math.abs(sr - r[x]), Math.abs(si - i2[x])); }
    assert.ok(err < 1e-9 * N, `N = ${N}: ${err}`);
  }
  // the shader's stage is the same lines (water.js FFT_FRAG): its index, its pair half a row apart, its twiddle's sign
  const water = read('src/game/island/water.js');
  assert.match(water, /int r = \( o - \( o \/ \( 2 \* uNs \) \) \* 2 \* uNs \) >= uNs \? 1 : 0, m = o - \( o \/ uNs \) \* uNs, j = \( o \/ \( 2 \* uNs \) \) \* uNs \+ m;/);
  assert.match(water, /float a = 6\.28318530718 \* float\( m \) \/ float\( 2 \* uNs \);/);
});

ok('the wind\'s sea (JONSWAP for 6.5 m/s, spread by Donelan and Banner): its three bands carry the spectrum\'s energy; the spreading sums to one; what they cannot draw is Cox and Munk\'s remainder', () => {
  const sea = SEA.startingSea(), wp = SEA.peakOmega();
  let total = 0; for (let w = 0.05; w < 80; w += 0.0005) total += SEA.jonswap(w) * 0.0005;
  const bands = sea.variance.reduce((a, b) => a + b, 0);
  console.log(`    the sea's height: ${(4 * Math.sqrt(total)).toFixed(2)} m significant, peak period ${((2 * Math.PI) / wp).toFixed(1)} s; the bands carry ${(100 * bands / total).toFixed(1)}%; slope variance drawn ${sea.slope.reduce((a, b) => a + b, 0).toFixed(4)} of Cox and Munk's ${SEA.coxMunk(6.5).toFixed(4)}`);
  within(4 * Math.sqrt(total), 0.8, 1.2, 'significant height (m): a near fully grown sea for 6.5 m/s');
  within(bands / total, 0.9, 1.05, 'the bands\' share of the spectrum');
  for (const x of [0.6, 1, 1.4, 2.5]) { let s = 0; for (let t = -Math.PI; t < Math.PI; t += 0.001) s += SEA.spreading(t, x * wp, wp) * 0.001; within(s, 0.99, 1.01, `spreading at ${x} of the peak`); }
  // its waves' heights, drawn at random: each wave's square over what its share of the spectrum should give it averages one
  // (so the sea's variance is the spectrum's: Parseval), and each texel carries the conjugate of its mirror's
  const N = SEA.SEA.N, W = sea.width; let r = 0, n = 0, sum = 0;
  for (let k = 0; k < W * N; k++) if (sea.expect[k] > 0) { const o = 4 * k; r += (sea.data[o] ** 2 + sea.data[o + 1] ** 2) / sea.expect[k]; n += 1; sum += sea.expect[k]; }
  within(r / n, 0.97, 1.03, 'each wave drawn at its share, on average'); within((2 * sum) / bands, 0.999, 1.001, 'the shares (each wave and its mirror) are the spectrum\'s');
  { const j = 5, i = 9, o = (j * W + i) * 4, m = ((N - j) * W + (N - i)) * 4; assert.equal(sea.data[o + 2], sea.data[m]); assert.equal(sea.data[o + 3], -sea.data[m + 1]); }
  assert.ok(sea.slope.reduce((a, b) => a + b, 0) < SEA.coxMunk(6.5), 'the bands draw less slope than the whole');
  assert.equal(SEA.coxMunk(0), 0.003);
});

ok('the swell: nine long waves of 9.8 to 13 s from the south-west, 1.5 m significant, sets out of their beats; the same sea every SEA.loop seconds', () => {
  const sw = SEA.SWELL, e = sw.reduce((a, w) => a + w.amp * w.amp, 0);
  within(4 * Math.sqrt(e / 2), 1.499, 1.501, 'significant height (m)');
  for (const w of sw) { const T = (2 * Math.PI) / w.omega; within(T, 9.5, 13.5, 'period'); assert.ok(Math.abs((w.omega * SEA.SEA.loop) / (2 * Math.PI) - Math.round((w.omega * SEA.SEA.loop) / (2 * Math.PI))) < 1e-9, 'whole turns in the loop'); assert.ok(w.dir[0] > 0 && w.dir[1] < 0, 'going north-east'); }
  assert.ok(sw.reduce((a, w) => a + w.k * w.amp * w.q, 0) < 1, 'never folding');
  const a = SEA.swellAt(130, -70, 17), b = SEA.swellAt(130, -70, 17 + SEA.SEA.loop);
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-9));
  let m = 0; for (let t = 0; t < SEA.SEA.loop; t += 0.5) m += SEA.swellAt(-2500, -1300, t)[1] ** 2;
  within(4 * Math.sqrt(m / (SEA.SEA.loop / 0.5)), 1.35, 1.65, 'its height as a buoy would record it');
});

ok('at the reef the swell shoals and turns in: its phase grows outward as the depth lets its waves lengthen; it stands higher over shallow water', () => {
  const t = SEA.shoreTables();
  for (let i = 1; i < SEA.SHORE.n; i++) assert.ok(t.phase[i] > t.phase[i - 1], 'the phase grows outward');
  const at = (D) => t.shoal[Math.round((D - SEA.SHORE.from) / SEA.SHORE.step)];
  within(at(1200), 0.85, 1.0, 'far out (m over its deep-water height)'); assert.ok(at(24) > 1.3, 'near the crest it stands higher');
  within(SEA.reefDepth(0), 0.39, 0.41, 'the crest (lordhowe-build.mjs: 0.4 m outside it)'); within(SEA.reefDepth(-200), 2.3, 2.5, 'the lagoon behind it');
});

ok('the reef\'s map: the lagoon is the island\'s own (lordhowe-build.mjs\'s rule, the shape\'s 11 km2); its beach is behind the crest, the open sea outside it; the east reef faces the wind\'s sea', () => {
  const bytes = new Uint8Array(readFileSync(join(ROOT, 'src/game/island/lordhowe.bin'))), head = parseHead(bytes), hts = heightsOf(head, new Uint8Array(inflateSync(bytes.subarray(HEAD))));
  const m = SEA.seaMap(hts.main, head.w, head.h, head.spacing, { x0: head.x0, z0: head.z0, reef: SHAPE.reef, lagoonSouth: SHAPE.lagoonSouth });
  let lagoon = 0; for (let k = 0; k < head.w * head.h; k++) if (hts.main[k] < 0 && !m.open[k]) lagoon += 1;
  const km2 = (lagoon * head.spacing ** 2) / 1e6; console.log(`    the lagoon: ${km2.toFixed(2)} km2 (the shape: ${SHAPE.lagoonKm2})`);
  within(km2 / SHAPE.lagoonKm2, 0.97, 1.03, 'its area');
  const sd = (x, z) => m.data[4 * (Math.round((z - head.z0) / head.spacing) * head.w + Math.round((x - head.x0) / head.spacing))];
  assert.ok(sd(SHAPE.arrive.x - 150, SHAPE.arrive.z) < -1000, 'the lagoon at the beach is well behind the crest');
  assert.ok(sd(-1800, -1296) < 0 && sd(-2300, -1296) > 0, 'across the west reef the sign changes at the crest');
  assert.ok(sd(2500, 64) > 0 && sd(2100, 64) < 0, 'and across the east reef');
});

ok('the shaders\' numbers are the module\'s: the water\'s k, its deep reflectance, the two path factors, the index', () => {
  const g = SEA.SEA_OPTICS_GLSL, num = (name) => g.match(new RegExp(`const vec3 ${name} = vec3\\( ([^,]+), ([^,]+), ([^ )]+) \\)`)).slice(1).map(Number);
  for (const [name, key] of [['SEA_K', 'kappa'], ['SEA_RDEEP', 'rDeep'], ['SEA_DC', 'Dc'], ['SEA_DB', 'Db']]) num(name).forEach((x, i) => assert.ok(Math.abs(x - O[i][key]) < 1e-6 * Math.max(1, O[i][key]), name));
  assert.match(g, /const float SEA_N = 1\.34/);
  assert.match(g, /return 0\.5 \* up \/ max\( 1\.0 - 1\.5 \* r, vec3\( 0\.25 \) \);/, 'Lee et al. eq. 2');
});

ok('the sheet round the eye reaches past 45 km, fine near the eye (a sixteenth of the distance), in tens of thousands of points', () => {
  const { pos } = seaSheet(), R = SEA_RINGS;
  let far = 0; for (let i = 0; i < pos.length; i += 3) far = Math.max(far, Math.hypot(pos[i], pos[i + 2]));
  assert.ok(far > 45000, 'far: ' + Math.round(far)); assert.ok(R.grow <= 1.07, 'rings close'); assert.ok(R.rings * R.segs < 60000, 'points: ' + R.rings * R.segs);
});

ok('the island draws its sea so: the land only where it stands above the water or meets it, then the sea over the floor in one drawing, not over what stands in the water; the true sky hands it its light', () => {
  const island = read('src/game/island/island.js'), terrain = read('src/game/island/terrain.js'), sky = read('src/game/sky.js');
  assert.match(island, /const SHORE_CELL = -1\.5;/); assert.match(island, /gridMesh\(ground\.hts\.main, head\.w, head\.h, head\.x0, head\.z0, S, SHORE_CELL\)/);
  assert.match(island, /land\.renderOrder = 1;/); assert.match(island, /sea\.renderOrder = 2;/);
  assert.match(island, /sea\.position\.set\(camera\.position\.x, 0, camera\.position\.z\);/, 'the sheet follows the eye');
  assert.match(terrain, /stencilFunc: THREE\.NotEqualStencilFunc, stencilRef: 2/, 'the sea is not drawn over what stands in the water');
  assert.match(terrain, /stencilRef: 2, stencilFunc: THREE\.AlwaysStencilFunc, stencilZPass: THREE\.ReplaceStencilOp/, 'which marks itself');
  assert.match(sky, /sea\.uSeaE\.value\.set\(L\.ground\[0\] \* exposure, L\.ground\[1\] \* exposure, L\.ground\[2\] \* exposure\);/, 'everything on level ground, in the picture\'s units');
  assert.match(sky, /sea\.uSun\?\.value\.set\(K\.dir\[0\], K\.dir\[1\], K\.dir\[2\]\);/, 'and where the key light is');
  // nothing of the sea reads the sky's files: with the switch off it is drawn under the present sky's light
  for (const f of ['src/game/island/sea.js', 'src/game/island/water.js']) assert.ok(!/sky\.js|solar\//.test(read(f).replace(/^\s*\/\/.*$/gm, '')), f);
});

console.log(`\n${passed} checks passed.`);
