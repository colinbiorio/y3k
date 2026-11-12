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
import { hornSpec } from '../src/frequencies.js';

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

console.log(`\n${passed} checks passed.`);
