// FREQUENCIES — real physics is the invariant. Run:  node test/frequencies.test.mjs
//
// Every number the room shows is pinned here to a value a physicist can check
// against a textbook or a standard (ISO 9613-1, Rayleigh's piston, Bagnold 1941,
// Gor'kov 1962, Petrie 1883, Davidovits 2006), and the sand engine's rules are
// checked for the behaviour they claim: grains move only above threshold, gather
// at the quiet of a standing wave half a wavelength apart, hold their angle of
// repose, hold a damp face, set to stone, and pack under pressure. The room's
// wiring is pinned too, so it cannot come apart quietly.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from '../src/frequencies/acoustics.mjs';
import * as P from '../src/frequencies/pyramid.mjs';
import * as S from '../src/frequencies/sand.mjs';
import * as O from '../src/frequencies/orbit.mjs';
import * as G from '../src/frequencies/giza.mjs';
import * as SUN from '../src/frequencies/sun.mjs';
import { hornSpec, WAVE_HZ, buildAt, courseHorns } from '../src/frequencies.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const near = (x, want, tol, what) => assert.ok(Math.abs(x - want) <= tol, `${what}: ${x} is not within ${tol} of ${want}`);
const within = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x} is not in [${lo}, ${hi}]`);

console.log('frequencies, the physics:');

ok('the decibel scale: 94 dB is one pascal, 160 dB is two kilopascals, and back', () => {
  near(A.splToPa(94), 1.0, 0.005, '94 dB');
  near(A.splToPa(160), 2000, 10, '160 dB');
  near(A.paToSpl(A.splToPa(123.4)), 123.4, 1e-9, 'round trip');
  near(A.particleVelocity(2000), 2000 / (1.204 * 343.2), 1e-6, 'u = p/ρc');
  near(A.intensity(2000), 4e6 / (1.204 * 343.2), 1e-3, 'I = p²/ρc');
});

ok('atmospheric absorption is ISO 9613-1: about 4.7 dB/km at 1 kHz, 20 °C, 50 % RH; ~0.3 at 100 Hz; ~160 at 10 kHz', () => {
  within(1000 * A.absorptionDbPerM(1000), 4.3, 5.0, '1 kHz');
  within(1000 * A.absorptionDbPerM(100), 0.1, 0.5, '100 Hz');
  within(1000 * A.absorptionDbPerM(10000), 140, 180, '10 kHz');
  assert.ok(A.absorptionDbPerM(4000) > A.absorptionDbPerM(1000), 'absorption rises with frequency');
});

ok("Rayleigh's piston: J1 peaks at 0.5819 (x = 1.8412), the directivity's first zero is at ka·sinθ = 3.8317, and it is 1 on axis", () => {
  near(A.besselJ1(1.8412), 0.5819, 0.001, 'J1 max');
  assert.ok(A.pistonDirectivity(3.8317, Math.PI / 2) < 1e-4, 'first zero');
  assert.equal(A.pistonDirectivity(10, 0), 1);
  assert.ok(A.pistonDirectivity(5, 0.3) < 1 && A.pistonDirectivity(5, 0.3) > 0, 'off axis, less');
});

ok("the horn: a mouth's circumference is one wavelength at cut-off (135 Hz → 81 cm; 50 Hz → 2.2 m), power is conserved across it, the throat stops at 170 dB", () => {
  near(A.mouthDiameterFor(135), 0.809, 0.005, 'mouth for 135 Hz');
  near(A.mouthDiameterFor(50), 2.18, 0.02, 'mouth for 50 Hz');
  near(A.cutoffFor(A.mouthDiameterFor(135)), 135, 1e-9, 'round trip');
  const dt = 0.1, D = 0.81;
  const mouthDb = A.mouthSpl(170, dt, D);
  near(A.acousticPower(mouthDb, D), A.intensity(A.splToPa(170)) * Math.PI * (dt / 2) ** 2, 1, 'power through the horn');
  assert.equal(A.THROAT_MAX_DB, 170);
  near(A.acousticPower(160, 0.81), 4990, 60, '160 dB over an 81 cm mouth is ~5 kW');
  near(A.inputPower(5000), 20000, 1e-6, '25 % efficient');
});

ok('nonlinearity: a 160 dB tone at 135 Hz shocks about 17 m out, at 1 kHz about 2.3 m (x = ρc³/βωP)', () => {
  near(A.shockDistance(160, 135), 16.9, 0.5, 'x_s 160 dB 135 Hz');
  near(A.shockDistance(160, 1000), 2.28, 0.1, 'x_s 160 dB 1 kHz');
  assert.ok(A.shockDistance(170, 135) < A.shockDistance(160, 135), 'louder shocks sooner');
});

ok("grains: Bagnold's threshold u* for 0.25 mm sand is 0.23 m/s; the drag balance puts the surface wind at ~1.45 m/s, i.e. an incident 143 dB; bigger grains need more", () => {
  near(A.bagnoldThreshold(2.5e-4), 0.232, 0.005, 'u*_t');
  within(A.thresholdVelocity(2.5e-4), 1.3, 1.6, 'u_t 0.25 mm');
  assert.ok(A.thresholdVelocity(1e-3) > A.thresholdVelocity(2.5e-4) && A.thresholdVelocity(2.5e-4) > A.thresholdVelocity(1e-4), 'monotonic in size');
  within(A.thresholdSpl(2.5e-4), 142, 145, 'threshold SPL');
  near(A.bagnoldFlux(0.4), 0.0141, 0.0008, 'q at u* = 0.4');
  near(A.bagnoldFlux(0.4) / A.bagnoldFlux(0.2), 8, 1e-6, 'q ∝ u*³');
});

ok("Gor'kov: levitating a stone grain in a standing wave takes ~163 dB at 20 kHz, more at lower tones (∝ 1/f), 185 dB at the block-scale 135 Hz", () => {
  near(A.gorkovPhi(2650), 5 / 6, 0.01, 'Φ for stone in air');
  within(A.levitationSpl(20000), 161.5, 164.5, '20 kHz');
  assert.ok(A.levitationSpl(1000) > A.levitationSpl(20000) && A.levitationSpl(135) > A.levitationSpl(1000), 'harder at low tones');
  assert.ok(A.levitationSpl(135) > A.THROAT_MAX_DB, 'past what air can carry');
  // E ∝ 1/k: a tenfold lower tone needs 10 dB more
  near(A.levitationSpl(2000) - A.levitationSpl(20000), 10, 0.05, '10 dB per decade');
});

ok('compaction: 160 dB incident is Γ ≈ 3.8 on the top 10 cm of loose calcite sand; 150 dB about 1.2', () => {
  near(A.gammaOf(A.splToPa(160)), 3.8, 0.2, 'Γ at 160');
  near(A.gammaOf(A.splToPa(150)), 1.2, 0.1, 'Γ at 150');
});

ok('the field on the ground: a horn on axis is its mouth level + 6 dB at the mouth (the rigid ground), −6 dB per doubling beyond, less off axis; two opposed horns make velocity minima λ/2 apart', () => {
  const D = A.mouthDiameterFor(135);
  const h = { x: 0, y: 0, z: 0, aimX: 1, aimY: 0, aimZ: 0, mouthDb: 160, mouthDiameter: D, phase: 0 };
  near(A.paToSpl(A.fieldAt([h], 135, D / 2, 0).p), 166, 0.2, 'at the mouth, doubled');
  const p2 = A.fieldAt([h], 135, 2, 0).p, p4 = A.fieldAt([h], 135, 4, 0).p;
  near(20 * Math.log10(p2 / p4), 6, 0.3, '6 dB per doubling');
  assert.ok(A.fieldAt([h], 135, 2, 1.5).p < p2, 'off axis is quieter');
  const bed = S.createBed({ width: 8, depth: 4, cell: 0.05 });
  S.computeField(bed, S.presetPair(bed, { f: 135, mouthDb: 160, mouthDiameter: D }), 135);
  const j = Math.floor(bed.ny / 2), us = [];
  for (let i = 0; i < bed.nx; i++) us.push(bed.u[j * bed.nx + i]);
  const mins = []; for (let i = 2; i < bed.nx - 2; i++) if (us[i] < us[i - 1] && us[i] <= us[i + 1]) mins.push((i + 0.5) * bed.cell);
  const gaps = mins.slice(1).map((m, i) => m - mins[i]).filter((g) => g > 0.6);
  assert.ok(gaps.length >= 4, 'a standing wave');
  for (const g of gaps) near(g, A.wavelength(135) / 2, 0.13, 'half a wavelength apart');
});

console.log('frequencies, the sand:');

ok('nothing moves below threshold; above it the loud ground is swept and mass is conserved within the walls', () => {
  const D = A.mouthDiameterFor(135);
  const quiet = S.createBed({ width: 8, depth: 4, cell: 0.05 });
  S.computeField(quiet, S.presetPair(quiet, { f: 135, mouthDb: 135, mouthDiameter: D }), 135);
  for (let s = 0; s < 50; s++) S.step(quiet, 0.1);
  assert.equal(S.readings(quiet).mobileShare, 0); assert.equal(S.readings(quiet).displaced, 0);
  const loud = S.createBed({ width: 8, depth: 4, cell: 0.05 });
  const mass = (b) => { let m = 0; for (let k = 0; k < b.nx * b.ny; k++) m += b.h[k] * b.phi[k]; return m; };
  const m0 = mass(loud);
  S.computeField(loud, S.presetPair(loud, { f: 135, mouthDb: 160, mouthDiameter: D }), 135);
  for (let s = 0; s < 600; s++) S.step(loud, 0.1);
  const R = S.readings(loud);
  assert.ok(R.mobileShare > 0.3 && R.displaced > 100, `the loud bed moves: ${JSON.stringify(R)}`);
  const j = Math.floor(loud.ny / 2);
  assert.ok(loud.h[j * loud.nx + Math.round(0.75 / 0.05)] < 0.28, 'the ground in front of a horn is swept lower');
  near(mass(loud) / m0, 1, 1e-6, 'mass within the walls');
});

ok('a damp heap holds a face a dry one cannot; poured binder sets to stone that no wind moves', () => {
  const D = A.mouthDiameterFor(135);
  const dry = S.createBed({ width: 6, depth: 4, cell: 0.05 }), damp = S.createBed({ width: 6, depth: 4, cell: 0.05 });
  for (const b of [dry, damp]) S.addSand(b, 3, 2, 0.6, 0.35);   // a 0.35 m drop: under what a damp face holds (0.4 m)
  S.pour(damp, 3, 2, 0.6);
  for (let s = 0; s < 20; s++) { S.step(dry, 0.1); S.step(damp, 0.1); }
  // the heap is a 0.6 m round, 0.35 m above the bed: its vertical rim cannot stand dry
  const rim = (b) => { let lo = Infinity; for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) { const x = (i + 0.5) * b.cell - 3, y = (j + 0.5) * b.cell - 2; if (x * x + y * y <= 0.36) lo = Math.min(lo, b.h[j * b.nx + i]); } return lo; };
  const c = (b) => b.h[S.idx(b, 60, 40)];
  assert.ok(rim(dry) < 0.64, `dry sand's rim slumps toward its angle of repose: ${rim(dry)}`);
  assert.ok(rim(damp) > 0.649, `damp sand stands: ${rim(damp)}`);
  S.computeField(damp, S.presetPair(damp, { f: 135, mouthDb: 165, mouthDiameter: D }), 135);
  for (let s = 0; s < 100; s++) S.step(damp, 3600);
  assert.equal(S.readings(damp).setCells, S.readings(damp).wetCells, 'set after 100 h');
  assert.ok(S.readings(damp).setCells > 0);
  near(P.strengthAt(100), 18.8, 0.2, 'strength at 100 h');
  const before = c(damp);
  for (let s = 0; s < 50; s++) S.step(damp, 0.1);
  near(c(damp), before, 1e-6, 'stone does not move');
  assert.ok(before > 0.5, `the damp heap is still a heap when it sets (packed down from 0.65 by Γ > 1): ${before}`);
});

ok('under 160 dB the packing creeps toward random close packing and the bed settles', () => {
  const D = A.mouthDiameterFor(135);
  const bed = S.createBed({ width: 4, depth: 2, cell: 0.05 });
  S.computeField(bed, [{ x: 0.2, y: 1, z: 0.5, aimX: 1, aimY: 0, aimZ: -0.3, mouthDb: 165, mouthDiameter: D, phase: 0 }], 135);
  const k = S.idx(bed, 20, 20);
  assert.ok(A.gammaOf(bed.p[k] / 2) > 1, 'Γ > 1 a metre out');
  for (let s = 0; s < 600; s++) S.step(bed, 0.1);
  assert.ok(bed.phi[k] > 0.6 && bed.phi[k] <= A.PACKING.close, `packing ${bed.phi[k]}`);
});

ok("a block's lattice: lines of horns on four sides at 155 dB lay ridges at the block pitch in 300 s; at a quiet level, nothing", () => {
  const D = A.mouthDiameterFor(135);
  const bed = S.createBed({ width: 6, depth: 6, cell: 0.05 });
  const horns = S.presetBlock(bed, { mouthDb: 155, mouthDiameter: D });
  assert.equal(horns.length, 24, 'six a side');
  S.computeField(bed, horns, 135);
  assert.ok(A.paToSpl(Math.max(...bed.p)) < A.THROAT_MAX_DB, 'the bed stays under the shock limit');
  assert.equal(S.latticePitch(bed), null, 'a flat bed has no lattice');
  for (let s = 0; s < 3000; s++) S.step(bed, 0.1);
  const lat = S.latticePitch(bed);
  assert.ok(lat && lat.strength > 0.3, `a lattice formed: ${JSON.stringify(lat)}`);
  near(lat.pitch, A.wavelength(135) / 2, 0.2, 'at the block pitch');
  const quiet = S.createBed({ width: 6, depth: 6, cell: 0.05 });
  S.computeField(quiet, S.presetBlock(quiet, { mouthDb: 130, mouthDiameter: D }), 135);
  for (let s = 0; s < 300; s++) S.step(quiet, 0.1);
  assert.equal(S.latticePitch(quiet), null, 'below threshold no lattice forms');
});

console.log('frequencies, the pyramid:');

ok("Petrie's pyramid: base 230.35 m, height 146.71 m, 51° 52′ (tan = 2H/b), 203 surveyed courses summing to 5451.8 in, the first 58.6 in, the 35th 49.8 in", () => {
  near(P.BASE_M, 230.35, 0.01, 'base'); near(P.HEIGHT_M, 146.71, 0.01, 'height');
  near(Math.tan(P.ANGLE), (2 * P.HEIGHT_M) / P.BASE_M, 0.003, 'the survey is consistent');
  assert.equal(P.COURSE_THICKNESS_IN.length, 203);
  near(P.COURSE_THICKNESS_IN.reduce((a, b) => a + b, 0), 5451.8, 0.1, 'top of masonry');
  assert.equal(P.COURSE_THICKNESS_IN[0], 58.6); near(P.COURSE_THICKNESS_IN[34], 49.8, 0.05, 'course 35');
  near(Math.min(...P.COURSE_THICKNESS_IN), 19.7, 0.05, 'thinnest');
  assert.ok(P.COURSE_THICKNESS_IN.every((t) => t > 0));
  const all = P.allCourses();
  near(all.reduce((a, b) => a + b, 0), P.HEIGHT_M, 0.06, 'extrapolated to the apex');
  assert.ok(all.length >= 210 && all.length <= 220, `${all.length} courses`);
});

ok('derived: 2.59 million m³, about 6 million tonnes at 2.3 t/m³, two million blocks on a 1.27 m module; the frustum sum matches the pyramid formula', () => {
  near(P.TOTAL_VOLUME_M3 / 1e6, 2.595, 0.005, 'volume');
  const t = P.totals();
  near(t.volume / P.TOTAL_VOLUME_M3, 1, 0.002, 'course sum');
  within(t.mass / 1e9, 5.8, 6.1, 'mass, Mt');
  within(t.blocks / 1e6, 1.9, 2.5, 'blocks');
  assert.ok(P.courseTable()[0].blocks > P.courseTable()[99].blocks, 'fewer blocks higher up');
});

ok("Davidovits' stone: 160 kg clay, 60 natron, 80 lime, 2 m³ water to 4500 kg limestone; 6.25 % binder solids; a 2.5 t block's share", () => {
  assert.deepEqual(P.RECIPE, { limestone: 4500, kaolinite: 160, natron: 60, lime: 80, water: 2000 });
  near(P.BINDER_SOLIDS_FRACTION, 0.0625, 1e-9, 'binder fraction');
  const r = P.recipeFor(4800);
  near(r.natron, 60, 1e-9, 'the recipe scales'); near(r.water, 2000, 1e-9, 'its water');
  near(P.recipeFor(2500).natron, 31.25, 0.01, 'natron per block');
  near(P.strengthAt(0), 0, 1e-9, 'no strength at the pour');
  assert.ok(P.strengthAt(1e6) > P.SET.strengthMPa * 0.999);
});

ok('the sound work: the lattice tone is c/2·1.27 m ≈ 135 Hz; the plan reads its wind from the field, flux follows Bagnold, and louder horns finish sooner', () => {
  near(P.LATTICE_HZ, 135.1, 0.3, 'lattice tone');
  const plan = P.hornPlan({ mouthDb: 160 });
  near(plan.mouthDiameter, 0.809, 0.005, 'the horns');
  assert.ok(plan.surfaceDb > 160 && plan.surfaceDb < 170, `a coherent line a metre out: ${plan.surfaceDb} dB`);
  near(plan.flux, A.bagnoldFlux(plan.uSurface / A.U_STAR_RATIO), 1e-9, "Bagnold's rate at the surface wind");
  assert.equal(P.hornPlan({ mouthDb: 120 }).flux, 0, 'below threshold nothing is carried');
  const s160 = P.schedule(P.hornPlan({ mouthDb: 160 })), s155 = P.schedule(P.hornPlan({ mouthDb: 155 }));
  assert.ok(s160.years > 0 && Number.isFinite(s160.years) && s155.years > s160.years, 'louder, sooner');
  assert.ok(s160.rows[0].horns > s160.rows.at(-1).horns, 'fewer horns on a smaller course');
});

ok('a horn is sized by its physics: 5 kW at 135 Hz is an 81 cm mouth, a 26 cm throat at 170 dB, 160 dB at the mouth, a 46 cm flare', () => {
  const h = hornSpec(135, 5000);
  near(h.mouthDiameter, 0.809, 0.005, 'mouth'); near(h.throatDiameter, 0.257, 0.01, 'throat');
  near(h.mouthDb, 160, 0.3, 'mouth level'); near(A.acousticPower(h.mouthDb, h.mouthDiameter), 5000, 50, 'power kept');
  near(h.length, 0.46, 0.03, 'flare');
  assert.ok(hornSpec(135, 20000).throatDiameter > h.throatDiameter && hornSpec(50, 5000).mouthDiameter > h.mouthDiameter, 'more power, a wider throat; a lower tone, a wider mouth');
});

console.log('frequencies, the room:');

ok("the glyph is on the right rail after the mine, called frequencies; the view opens, closes, lights its glyph, names itself, and the metal pours it", () => {
  const html = read('index.html');
  const rail = html.slice(html.indexOf('id="home-nav-right"'), html.indexOf('</nav>', html.indexOf('id="home-nav-right"')));
  const ids = [...rail.matchAll(/<button id="([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.slice(-3), ['nav-mine', 'nav-frequencies', 'nav-orb']);
  assert.match(rail, /id="nav-frequencies"[^>]*title="frequencies"[^>]*aria-label="frequencies"/);
  const social = read('src/social.js');
  for (const line of ["import { createFrequencies } from './frequencies.js';", "const frequencies = createFrequencies({ toast: toastOnce });", "'mode-frequencies'",
    "$('nav-frequencies')?.classList.toggle('on', v === 'frequencies');", "v === 'frequencies' ? 'frequencies'", "else if (v === 'frequencies') frequencies.open($('home-grid'));", "if (v !== 'frequencies') frequencies.close();"]) {
    assert.ok(social.includes(line), `social.js lacks: ${line}`);
  }
  assert.ok(read('src/main.js').includes("$('nav-frequencies')?.addEventListener('click'"), 'the glyph does nothing');
  assert.ok(read('src/mercury-mount.js').includes("['nav-frequencies', (el) => ({ svgEl: svgOf(el), size: S(70) })]"), 'not poured in metal');
  assert.ok(read('styles.css').includes('.home-grid.mode-frequencies {'), 'no room width');
  assert.ok(read('package.json').includes('node test/frequencies.test.mjs'), 'not in the chain');
});

console.log('\nfrequencies, in the round (17 Nov 2026):');

const hornAt = (x, y, aimX, aimY, mouthDb = 150, f = 135) => ({ x, y, z: 0.5, aimX, aimY, aimZ: -0.25, mouthDb, mouthDiameter: A.mouthDiameterFor(f), phase: 0 });

ok('the pressure anywhere: on the ground it is the field the sand feels; its phasor is its size; horns add as phasors', () => {
  const hs = [hornAt(0, 0, 1, 0), hornAt(6, 3, -1, 0.2)];
  for (const [x, y] of [[3, 0.5], [5, 2], [1, -4]]) {
    const q = A.pressureAt(hs, 135, x, y, 0), fa = A.fieldAt(hs, 135, x, y);
    near(q.p, fa.p, fa.p * 1e-9, 'pressureAt on the ground against fieldAt');
    near(Math.hypot(q.re, q.im), q.p, q.p * 1e-12, 'the phasor\'s size');
    const a = A.pressureAt([hs[0]], 135, x, y, 1.6), b = A.pressureAt([hs[1]], 135, x, y, 1.6), ab = A.pressureAt(hs, 135, x, y, 1.6);
    near(ab.re, a.re + b.re, Math.abs(ab.p) * 1e-12 + 1e-9, 'superposition (re)');
    near(ab.im, a.im + b.im, Math.abs(ab.p) * 1e-12 + 1e-9, 'superposition (im)');
  }
});

ok('a standing wave heard: between opposed horns the ear finds a node a quarter wavelength from the middle', () => {
  const lam = A.wavelength(135), L = 10, hs = [hornAt(0, 0, 1, 0), hornAt(L, 0, -1, 0)];
  const ear = (x) => ({ x, y: 0, z: 0.5, rx: 0, ry: -1, rz: 0 });
  const mid = A.hear(hs, 135, ear(L / 2)).p, node = A.hear(hs, 135, ear(L / 2 + lam / 4)).p;
  assert.ok(node < mid / 4, `node ${node} against the middle ${mid}`);
});

ok('the two speakers: a horn on the right is in the right one; the four gains are as loud as played() says; turning round swaps them', () => {
  const one = [hornAt(4, 0, -1, 0)];
  const facing = A.hear(one, 135, { x: 0, y: 0, z: 0.5, rx: 1, ry: 0, rz: 0 }), g = A.stereo(facing);
  const left = Math.hypot(g[0], g[1]), right = Math.hypot(g[2], g[3]);
  assert.ok(right > 5 * left, `right ${right} against left ${left}`);
  near(Math.hypot(...g), A.played(Math.hypot(...facing.L, ...facing.R)), 1e-12, 'the loudness');
  const back = A.stereo(A.hear(one, 135, { x: 0, y: 0, z: 0.5, rx: -1, ry: 0, rz: 0 }));
  assert.ok(Math.hypot(back[0], back[1]) > 5 * Math.hypot(back[2], back[3]), 'turned round, it is not on the left');
  assert.deepEqual(A.stereo({ L: [0, 0], R: [0, 0], p: 0 }), [0, 0, 0, 0]);
});

ok('where the sound comes from: each horn\'s own share at the listener is what it would be heard alone', () => {
  const hs = [hornAt(0, 0, 1, 0), hornAt(6, 3, -1, 0.2), hornAt(2, -5, 0, 1, 156)], ear = { x: 3, y: 1, z: 1.4, rx: 0, ry: -1, rz: 0 };
  const each = new Float32Array(3), all = A.hear(hs, 135, ear, each);
  hs.forEach((h, i) => near(each[i], A.hear([h], 135, ear).p, A.hear([h], 135, ear).p * 1e-6, `horn ${i + 1}`));
  near(A.hear(hs, 135, ear).p, all.p, 1e-12, 'the sum unchanged by the shares');
  const room = read('src/frequencies.js'), kit = read('src/frequencies/kit.js');
  assert.ok(kit.includes("fragment: 'totalEmissiveRadiance += uGlow * vGlow;'") && room.includes('scene.glow(glowW);'), 'the share is not shown as light');
  for (const f of ['src/frequencies/sandbox3d.js', 'src/frequencies/pyramid3d.js']) assert.ok(/glowing\(bronze\((\), air)?\)/.test(read(f)) && read(f).includes('withGlow(hornGeometry('), f + ' horns cannot glow');
});

ok('how loud the room plays: full at the air\'s 170 dB limit, every 20 dB of field is 10 dB at the speakers, never past full', () => {
  near(A.played(A.splToPa(170)), 1, 1e-12, '170 dB');
  assert.equal(A.played(A.splToPa(190)), 1);
  near(20 * Math.log10(A.played(A.splToPa(150)) / A.played(A.splToPa(170))), -10, 1e-9, '150 dB');
  near(20 * Math.log10(A.played(A.splToPa(110)) / A.played(A.splToPa(130))), -10, 1e-9, '110 dB');
  assert.ok(A.played(A.splToPa(120)) < A.played(A.splToPa(121)) && A.played(0) === 0);
});

ok('take away: sand dug from a round goes, to the floor at most, and nowhere else changes', () => {
  const bed = S.createBed({ width: 2, depth: 2, cell: 0.05 }), before = Float32Array.from(bed.h);
  S.takeSand(bed, 1, 1, 0.3, 0.1);
  let inside = 0, outside = 0;
  for (let j = 0; j < bed.ny; j++) for (let i = 0; i < bed.nx; i++) {
    const k = j * bed.nx + i, x = (i + 0.5) * bed.cell - 1, y = (j + 0.5) * bed.cell - 1;
    if (x * x + y * y <= 0.09) { near(before[k] - bed.h[k], 0.1, 1e-6, 'dug'); inside++; } else { assert.equal(bed.h[k], before[k]); outside++; }
  }
  assert.ok(inside > 100 && outside > 1000);
  S.takeSand(bed, 1, 1, 0.3, 5);
  assert.ok(Math.min(...bed.h) >= 0, 'dug below the floor');
});

ok('the eye: where it stands; a slide goes with the hand; nearer toward a point keeps that point; it settles; the keys; the floor', () => {
  const o = O.createOrbit({ target: [1, 2, 3], dist: 10, polar: Math.PI / 2, az: 0, maxPolar: 1.6 });
  O.pose(o).forEach((v, i) => near(v, [1, 2, 13][i], 1e-9, 'pose'));
  O.pose({ target: [0, 0, 0], dist: 5, polar: 0.02, az: 1 }).forEach((v, i) => near(v, [0, 5, 0][i], 0.11, 'from above'));
  const t0 = [...o.target];
  O.pan(o, 100, 0, 800);
  assert.ok(o.target[0] < t0[0], 'a drag to the right moves the ground right, so the point looked at goes left');
  const p = [3, 0, -2], eye0 = O.pose(o), dir0 = p.map((v, i) => v - eye0[i]), n0 = Math.hypot(...dir0);
  O.zoom(o, 0.5, p);
  const eye1 = O.pose(o), dir1 = p.map((v, i) => v - eye1[i]), n1 = Math.hypot(...dir1);
  dir0.forEach((v, i) => near(dir1[i] / n1, v / n0, 1e-9, 'the point stays where it is on the screen'));
  near(n1, n0 * 0.5, 1e-9, 'and comes half as far');
  for (let i = 0; i < 400 && O.settle(o, 1 / 60); i++);
  assert.ok(!O.settle(o, 1 / 60), 'never settles');
  O.pose(o.now).forEach((v, i) => near(v, O.pose(o)[i], 1e-6, 'settled where asked'));
  assert.ok(O.key(o, '+') && o.dist < 5 && O.key(o, '0') && o.dist === 10 && !O.key(o, 'q'));
  const low = O.createOrbit({ target: [0, 20, 0], dist: 40, polar: 1, maxPolar: 2.5, floor: 1.2 });
  O.turn(low, 0, 3);
  assert.ok(O.pose(low)[1] >= 1.2 - 1e-9 && low.polar > Math.PI / 2, 'looking up, the eye stays above the floor');
  const boxed = O.go(O.createOrbit({ box: [[-1, 0, -1], [1, 1, 1]] }), { target: [5, 5, 5], dist: 3 });
  assert.deepEqual(boxed.target, [1, 1, 1]);
});

ok('drawn at the screen\'s own pixels: up to three a point and 8.3 million a frame, whatever the site\'s graphics tier', () => {
  assert.equal(O.pixelRatio(2, 1280, 720), 2);
  assert.equal(O.pixelRatio(4, 100, 100), 3);
  assert.equal(O.pixelRatio(0, 100, 100), 1);
  near(O.pixelRatio(3, 2560, 1440), Math.sqrt(8.3e6 / (2560 * 1440)), 1e-12, 'a big screen');
  assert.ok(read('src/frequencies/stage.js').includes('steps = ladder(window.devicePixelRatio, w, h);') && read('src/frequencies/stage.js').includes('ratio = step.ratio;'), 'the stage takes another ratio');
  assert.ok(!/gfx|profile\(\)/.test(read('src/frequencies/stage.js')), 'the stage reads the site\'s tier');
});

ok('the build at any time: the courses done, the one being made, its surface; then all of them, and no horns', () => {
  const plan = P.hornPlan({ mouthDb: 160 }), sched = P.schedule(plan), r0 = sched.rows[0];
  let b = buildAt(sched.rows, 0);
  assert.ok(b.built === 0 && b.current.course === 1 && b.part === 0 && b.top === 0 && !b.setting);
  b = buildAt(sched.rows, r0.moveHours / 2 / 8766);
  near(b.part, 0.5, 1e-9, 'half carried in'); near(b.top, r0.thickness / 2, 1e-9, 'half its thickness');
  b = buildAt(sched.rows, (r0.moveHours + 10) / 8766);
  assert.ok(b.setting && b.part === 1); near(b.setLeft, r0.setHours - 10, 1e-6, 'setting');
  b = buildAt(sched.rows, sched.years + 1e-9);
  assert.ok(b.built === 218 && b.current === null); near(b.top, P.HEIGHT_M, 0.01, 'the top');
  let last = -1;
  for (let y = 0; y <= sched.years; y += sched.years / 997) { const t = buildAt(sched.rows, y).top; assert.ok(t >= last - 1e-9, `the surface fell at ${y} y`); last = t; }
  assert.equal(WAVE_HZ, 0.5);
});

ok('the working course\'s horns: the plan\'s count, shoulder to shoulder on its four edges, aimed across it, half a metre up', () => {
  const plan = P.hornPlan({ mouthDb: 160 }), sched = P.schedule(plan);
  for (const row of [sched.rows[0], sched.rows[100], sched.rows[200]]) {
    const hs = courseHorns(row, plan), edge = row.side / 2 + 0.1;
    within(hs.length, row.horns - 4, row.horns + 4, `course ${row.course}`);
    within(row.side / (hs.length / 4), plan.spacing, plan.spacing * 1.02, 'shoulder to shoulder, mouths never overlapping');
    for (const h of hs) {
      near(Math.max(Math.abs(h.x), Math.abs(h.y)), edge, 1e-9, 'on an edge');
      assert.ok(h.x * h.aimX + h.y * h.aimY < 0 && h.z === 0.5 && h.aimZ === -0.3 && h.mouthDb === plan.mouthDb && h.mouthDiameter === plan.mouthDiameter);
    }
  }
});

ok('the room in the round is wired: three.js stays out of the first load; the tone is the field at the camera; every control has a name', () => {
  const room = read('src/frequencies.js');
  assert.ok(!/^import[^;]*from 'three/m.test(room), 'three is imported with the site');
  assert.ok(room.includes("import('./frequencies/stage.js')"), 'the stage is not loaded');
  assert.ok(room.includes('const heard = hear(list, hz, earNow(zero), each);') && room.includes('gainsNow = stereo(heard);') && room.includes('sound?.set(gainsNow);'), 'the tone is not the field at the camera');
  assert.equal((room.match(/sound\.start\(/g) || []).length, 1, 'sound may only begin in startSound, from a click');
  assert.ok(/function startSound[\s\S]{0,200}sound\.start\(hz\)/.test(room));
  for (const m of room.matchAll(/<input [^>]*>/g)) assert.match(m[0], /aria-label="[^"]+"/, 'an input without a name: ' + m[0].slice(0, 60));
  assert.ok(room.includes('data-view="${k}" aria-label="${say}"'), 'the view buttons are nameless');
  for (const id of ['The tone.', 'The horns.', 'The rate.', 'The stone.', 'The set.', 'What sound does not do here.']) assert.ok(room.includes(`<li><b>${id}</b>`), 'the method lost: ' + id);
  assert.ok(room.includes("<p class=\"muted\">Petrie's survey is the pyramid:"), 'the survey line lost');
  const stage = read('src/frequencies/stage.js'), kit = read('src/frequencies/kit.js');
  const sky = stage.slice(stage.indexOf('const sky = new THREE.Mesh'), stage.indexOf('sky.renderOrder'));
  assert.ok(sky.includes('#include <colorspace_fragment>') && !sky.includes('tonemapping_fragment'), 'the sky is tone-mapped: it would not meet the fog');
  assert.ok(kit.includes("material.customProgramCacheKey = () => 'freq-' + name + (air ? '-air' : '');"), 'two patched materials could share one program');
  for (const f of ['src/frequencies/sandbox3d.js', 'src/frequencies/pyramid3d.js']) assert.ok(!read(f).includes("from './stage.js'"), f + ' imports the stage');
  assert.ok(read('styles.css').includes('.freq-stage:fullscreen') && read('styles.css').includes('touch-action: none'), 'the stage cannot fill the screen or be held');
});

ok('the land: the pyramid on level ground at the plateau\'s north-east corner, the valley 42 m below, the river, the hills across, the Earth\'s curve', () => {
  for (let a = 0; a < 6.3; a += 0.3) for (const r of [0, 60, 120, 170]) near(G.groundAt(r * Math.cos(a), r * Math.sin(a)), 0, 0.01, 'the base is level');
  near(G.groundAt(3000, -3000), -G.DROP, 1.2, 'the valley floor');
  assert.equal(G.valleyAt(0, 300), 0); assert.equal(G.valleyAt(-200, -200), 0);
  assert.ok(G.valleyAt(0, -700) > 0.99 && G.valleyAt(1100, 0) > 0.99, 'the valley north and east, within a kilometre');
  for (let x = -60; x <= 260; x += 20) { const a = G.valleyAt(G.lineX(G.DESERT_EDGE, 0) + x - 10, 0), b = G.valleyAt(G.lineX(G.DESERT_EDGE, 0) + x + 10, 0); assert.ok(b >= a, 'the scarp only falls, going east'); }
  assert.ok(G.waterAt(5800 + 210 * Math.sin(1.1), 0) && G.waterAt(G.BASIN.x, G.BASIN.z), 'the river and the basin are water');
  for (const [x, z] of [[0, 0], [500, 0], [-3000, 2000], [G.ELDERS[0].x, G.ELDERS[0].z]]) assert.ok(!G.waterAt(x, z), 'no water on the desert');
  assert.ok(G.groundAt(15000, 0) > 100, 'the hills stand above the plateau across the valley');
  near(G.groundAt(20000, 5000) - G.heightAt(20000, 5000), (20000 ** 2 + 5000 ** 2) / (2 * G.EARTH_R), 1e-6, 'the curve');
  const r = G.rings();
  assert.ok(r[0] === 0 && r.at(-1) >= G.REACH && r.every((v, i) => !i || (v > r[i - 1] && v <= r[i - 1] * 1.046 + 41)), 'the rings');
});

ok('the elder pyramids stand where the sites are: Djoser\'s 14.4 km away at 146°, Sneferu\'s Red 20.2 km at 160° and Bent 22.2 km at 161°', () => {
  const at = (lat, lon) => [(lon - 31.13417) * 96487, -(lat - 29.97917) * 110852];       // metres east and south of the Great Pyramid
  const sites = { djoser: at(29.87127, 31.21639), red: at(29.80833, 31.20583), bent: at(29.79032, 31.20938) };
  for (const e of G.ELDERS) { near(e.x, sites[e.key][0], 2, e.key + ' east'); near(e.z, sites[e.key][1], 2, e.key + ' south'); }
  const bearing = (e) => (Math.atan2(e.x, -e.z) * 180) / Math.PI, km = (e) => Math.hypot(e.x, e.z) / 1000, [dj, red, bent] = G.ELDERS;
  near(km(dj), 14.35, 0.05, 'Djoser'); near(bearing(dj), 146.4, 0.3, 'Djoser');
  near(km(red), 20.16, 0.05, 'Red'); near(bearing(red), 159.9, 0.3, 'Red');
  near(km(bent), 22.16, 0.05, 'Bent'); near(bearing(bent), 160.9, 0.3, 'Bent');
  assert.ok(G.ELDERS.every((e) => G.valleyAt(e.x, e.z) === 0), 'all three on the desert');
  near(red.height, 105, 1, 'the Red'); near(bent.height, 104.7, 0.5, 'the Bent'); near(dj.height, 62.5, 0.5, 'Djoser');
});

ok('the land and the air are wired: the pyramid stands on its land under its haze; the sky and the haze share one colour of the air', () => {
  const pyr = read('src/frequencies/pyramid3d.js'), stage = read('src/frequencies/stage.js'), land = read('src/frequencies/land.js'), air = read('src/frequencies/air.js');
  assert.ok(pyr.includes('const land = createLand(air);') && /land: true/.test(pyr) && /haze: \[/.test(pyr), 'the pyramid has no land or no haze');
  assert.ok(stage.includes('scene.fog = s.haze ? null : fog;') && stage.includes('ground.visible = !s.land;'), 'the stage does not give way to a scene\'s own land and air');
  assert.ok(stage.includes('${SKY_HEAD}') && air.includes('vec3 skyAt(vec3 d)') && air.includes('linearToOutputTexel(vec4(hzC, 1.0))'), 'the haze is not the sky\'s colour');
  assert.ok(land.includes("import * as G from './giza.mjs';") && land.includes('G.heightAt(x, z)'), 'the land is not giza.mjs\'s');
  for (const m of ["'stone', {\n    air,", "'working', {\n    air,", 'glowing(bronze(), air)', "'post', air", "'outline', air", "'person', air"]) assert.ok(pyr.includes(m), 'not hazed: ' + m);
});

ok('the course being made: ridges at dry sand\'s angle of repose where the sound reaches, then the binder wet, then stone with the joints where the ridges were', () => {
  const pyr = read('src/frequencies/pyramid3d.js');
  near(S.DRY_SLOPE, Math.tan((34 * Math.PI) / 180), 1e-12, 'tan 34°');
  assert.ok(pyr.includes("import { DRY_SLOPE } from './sand.mjs';") && (pyr.match(/\$\{DRY_SLOPE\.toFixed\(4\)\}/g) || []).length === 3, 'the ridges are not at the sand\'s own slope');
  assert.ok(pyr.includes('float reached = exp(-max(uHalf - max(abs(vWp.x), abs(vWp.z)), 0.0) / uReach);') && /float A = [^;]*\* reached \*/.test(pyr), 'ridges where the sound does not reach');
  assert.ok(pyr.includes('wave.uPart.value = current ? part : 0; wave.uWet.value = current && setPart > 0 ? 1 : 0; wave.uSet.value = setPart;'), 'the course does not follow the schedule');
  assert.ok(/float mob = uOn \* reached \* onTop \* \(1\.0 - uWet\)/.test(pyr), 'grains hop when no tone sounds, or in wet paste');
});

ok('the casing: on the ideal faces in the courses\' bands, shown only once every course is in, dressed from the top down a course at a time (at once for a reader who asks for less motion)', () => {
  const pyr = read('src/frequencies/pyramid3d.js'), room = read('src/frequencies.js');
  assert.ok(pyr.includes('half = (y) => b2 * Math.max(0, 1 - y / HEIGHT_M)') && pyr.includes('for (let i = 0; i < rows.length; i++) {\n      const y0 = rows[i].bottom, y1 = Math.min(rows[i].top, HEIGHT_M)'), 'the casing is not on the ideal faces, course by course');
  assert.ok(pyr.includes('const done = !current && built >= rows.length;') && pyr.includes('casing.visible = done; outline.visible = !done;'), 'the casing shows before the last course');
  assert.ok(pyr.includes('while (k > 0 && rows[k - 1].top > yf + 1e-6) k--;') && pyr.includes('courses.count = k; casingU.uFront.value = k ? rows[k - 1].top : 0;'), 'the front does not step down a whole course at a time');
  assert.ok(pyr.includes("matchMedia?.('(prefers-reduced-motion: reduce)')") && pyr.includes('const r = still ? 1 :'), 'the dressing ignores reduced motion');
  assert.ok(room.includes('return pyrPlaying || pyrSound || !!dressing ||') && room.includes('cased: !!pyr?.cased'), 'the stage stops drawing mid-dressing, or the room cannot say it is cased');
});

ok('when its frames are long the stage steps down (fewer pixels, then a coarser shadow, then none and a plainer land), never under half a pixel a point nor above the screen\'s own; far horns in fewer facets', () => {
  for (const [dpr, w, h] of [[2, 938, 469], [3, 390, 844], [1, 938, 469], [1, 2560, 1440], [2, 3840, 2160]]) {
    const L = O.ladder(dpr, w, h), top = O.pixelRatio(dpr, w, h);
    assert.equal(L.length, O.LADDER.length);
    near(L[0].ratio, top, 1e-12, 'it begins at the screen\'s own pixels');
    assert.ok(L.every((s, i) => s.ratio <= top + 1e-12 && s.ratio >= Math.min(top, 0.5) - 1e-12 && (!i || s.ratio <= L[i - 1].ratio)), JSON.stringify(L));
    assert.ok(L[0].shadow === 2048 && !L[0].lite && L.at(-1).shadow === 0 && L.at(-1).lite, 'the last step is the plainest');
  }
  near(O.ringDistance([0, 50, 0], 40, 50), 40, 1e-12, 'from the middle of the course: half its side');
  near(O.ringDistance([30, 50, 0], 40, 50), 10, 1e-12, 'inside, from the nearer edge');
  near(O.ringDistance([43, 50, 44], 40, 50), 5, 1e-12, 'outside a corner, level with the horns: 3 and 4 make 5');
  near(O.ringDistance([43, 62, 44], 40, 50), 13, 1e-12, 'and 12 above them: 13');
  near(O.ringDistance([0, 80, 100], 40, 50), Math.hypot(60, 30), 1e-12, 'outside a side, and above');
  const stage = read('src/frequencies/stage.js'), pyr = read('src/frequencies/pyramid3d.js');
  assert.ok(stage.includes("import { createWatch, watch, rest } from '../game/fine.js';") && stage.includes("else if (steps && watch(fine, since, steps) === 'ratio') size();") && stage.includes("if (!since) { if (rest(fine) === 'ratio') size(); }"), 'the stage does not watch its frames');
  assert.ok(stage.includes('sun.castShadow = sunUp && step.shadow > 0;') && stage.includes('cur?.lite?.(step.lite);'), 'a step down changes only the pixels');
  assert.ok(pyr.includes("farGeo.setAttribute('aGlow', horns.geometry.getAttribute('aGlow'));") && pyr.includes('hornsFar.instanceMatrix = horns.instanceMatrix;') && pyr.includes('< HORN_NEAR;'), 'the far horns are not the same horns');
});

ok('the sun over Giza: the seasons\' declinations, south at noon at 90° − latitude + declination, from the east in the morning; 17 November\'s day; the light by the sun\'s height', () => {
  near(SUN.declination(172), 23.44, 0.15, 'the June solstice'); near(SUN.declination(355), -23.44, 0.15, 'the December solstice');
  near(SUN.declination(80), 0, 0.5, 'the March equinox'); near(SUN.declination(266), 0, 0.5, 'the September equinox');
  near(SUN.declination(321), -18.8, 0.4, '17 November');
  for (const day of [1, 100, 200, 321]) {
    const noon = SUN.sunAt(12, day);
    near(noon.elevation, 90 - SUN.GIZA.lat + SUN.declination(day, 12), 1e-9, 'noon height'); near(noon.azimuth, 180, 1e-9, 'due south at noon');
    const [rise, set] = SUN.daylight(day);
    near(rise + set, 24, 1e-9, 'the day is even about noon');
    near(SUN.sunAt(rise, day).elevation, -0.833, 0.05, 'at sunrise the sun\'s upper edge is on the horizon');
  }
  const morning = SUN.sunAt(8.25), dir = SUN.sunDirection(morning);
  near(Math.hypot(...dir), 1, 1e-12, 'a unit vector');
  assert.ok(dir[0] > 0 && dir[2] > 0 && dir[1] > 0, 'a November morning\'s sun is in the south-east, and up: ' + dir);
  within(morning.elevation, 15, 19, 'a quarter past eight'); within(morning.azimuth, 120, 130, 'its bearing');
  const len = (day) => { const [a, b] = SUN.daylight(day, 30); return (b - a) * 60; };
  near(len(172), 14 * 60 + 5, 3, 'June at 30° N: 14 h 05'); near(len(355), 10 * 60 + 13, 3, 'December at 30° N: 10 h 13');
  assert.equal(SUN.clock(8.25), '8:15'); assert.equal(SUN.clock(17.0), '17:00');
  const day = SUN.lightFor(30), dusk = SUN.lightFor(-4), night = SUN.lightFor(-12);
  assert.ok(day.power > 3 && dusk.power === 0 && night.power === 0, 'no sunlight once the sun is down');
  assert.ok(dusk.top.reduce((a, v) => a + v) < day.top.reduce((a, v) => a + v) && night.top.reduce((a, v) => a + v) <= dusk.top.reduce((a, v) => a + v), 'the sky darkens as the sun goes down');
  assert.ok(SUN.lightFor(1).warm[0] > SUN.lightFor(1).warm[2] + 100, 'the horizon under a low sun is warm');
  for (let e = -12; e <= 70; e += 0.5) { const L = SUN.lightFor(e); assert.ok([...L.top, ...L.mid, ...L.low, ...L.warm, ...L.sun].every((v) => v >= 0 && v <= 255) && L.exposure > 0, 'a colour out of range at ' + e); }
  const room = read('src/frequencies.js'), stage = read('src/frequencies/stage.js'), pyr = read('src/frequencies/pyramid3d.js');
  assert.ok(room.includes('class="freq-sun"') && /class="freq-sun"[^>]*aria-label="[^"]+"/.test(room) && room.includes('pyr?.sky(sunHours);'), 'the sun has no control, or it moves nothing');
  assert.ok(pyr.includes('const first = skyAt(hours);') && pyr.includes('sky(h) { const k = skyAt(h); stage.sky(k.look, k.dir); return k.at; },'), 'the pyramid\'s sun is not the sun\'s');
  assert.ok(stage.includes('sunUp = L.sun[1] > 0;') && stage.includes('sun.castShadow = sunUp && step.shadow > 0;'), 'a sun under the horizon still casts shadows');
});

console.log(`\n${passed} checks passed.`);
