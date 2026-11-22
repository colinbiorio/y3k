// THE TRUE SKY, ITS FIRST PART: THE AIR AND THE SUN (src/game/solar/clock.js, air.js, daylight.js; src/game/sky.js
// draws it; SOLAR.md "Step 2"). Colin, 20 November 2026: "model the solar system as accurately as possible and make
// it explorable"; 21 November: "ultra-high quality experience rather than quantity of output".
//
// What is pinned here is the physics that can be checked without a GPU, against the model's own closed forms and
// against published measurements:
//
//   - the world's clock: the real UTC instant, an offset, and a pin from the page's address for pictures;
//   - the air: the standard atmosphere's density, the depth of the clear air, the two tables the picture reads
//     (transmittance, multiple scattering), and that scattering never makes light;
//   - the Sun: its illuminance above the air, its place (the clockwork's own), what is left of it at the ground;
//   - the sky from Lord Howe Island on 21 November 2026: the zenith's luminance and the light on level ground at
//     noon, at sunset and at the end of civil twilight, within ranges stated from published measurements;
//   - the eye: the exposure, and that it follows the light faster than the dark.
//
// The numbers these checks measure are printed at the end, and are the table in SOLAR.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as A from '../src/game/solar/air.js';
import { createClock, pinOf } from '../src/game/solar/clock.js';
import { createDaylight, skyAsked } from '../src/game/solar/daylight.js';
import { sky, refraction, AU, BODIES } from '../src/game/solar/ephemeris.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} ± ${eps}`);
const within = (a, lo, hi, msg) => assert.ok(a >= lo && a <= hi, `${msg}: ${a} is not in ${lo} .. ${hi}`);
const D2R = Math.PI / 180, LAT = -31.5503, LON = 159.0761;      // the island (src/game/island/lordhowe-shape.js)
const measured = [];
const sig = (x, n = 3) => (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6 ? Number(x).toExponential(n - 1).replace(/\.?0+e/, 'e').replace('e+', 'e') : String(Number(Number(x).toPrecision(n))));
const fig = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 1 ? x.toFixed(x >= 10 ? 1 : 2) : x.toPrecision(2));

// ------------------------------------------------------------------------------------------------- the clock
ok('the clock is the real UTC instant, and an offset moves it', () => {
  let now = Date.UTC(2026, 10, 21, 7, 0, 0);
  const c = createClock({ now: () => now });
  assert.equal(c.when(), now); assert.equal(c.pinned, null); assert.equal(c.offset, 0);
  now += 5000; assert.equal(c.when(), now, 'it runs');
  c.shift(3600e3); assert.equal(c.when(), now + 3600e3, 'an hour on');
  c.set(Date.UTC(2024, 3, 8, 18, 17, 18)); assert.equal(c.when(), Date.UTC(2024, 3, 8, 18, 17, 18), 'set to an instant');
  now += 2000; assert.equal(c.when(), Date.UTC(2024, 3, 8, 18, 17, 20), 'and it runs on from there');
  c.back(); assert.equal(c.when(), now, 'and back to the real time');
  c.shift(NaN); c.set('x'); assert.equal(c.when(), now, 'nonsense moves nothing');
});

ok('the clock is pinned by ?at= in the address (for tests and pictures), read as UTC', () => {
  const at = Date.UTC(2026, 10, 21, 7, 10, 0);
  assert.equal(pinOf('?at=2026-11-21T07:10:00Z'), at);
  assert.equal(pinOf('?sky=true&at=2026-11-21T07:10:00Z&x=1'), at, 'among others');
  assert.equal(pinOf('?at=2026-11-21T07:10:00'), at, 'no zone is UTC, never the reader\'s own');
  assert.equal(pinOf('?at=2026-11-21T07:10'), at);
  assert.equal(pinOf('?at=2026-11-21T18:10:00+11:00'), at, 'the island\'s own clock');
  assert.equal(pinOf('?at=2026-11-21T18:10:00%2B11:00'), at);
  assert.equal(pinOf('?at=2026-11-21'), Date.UTC(2026, 10, 21), 'a date alone is its midnight, UTC');
  for (const junk of ['', '?', '?at=', '?at=now', '?at=12', '?at=2026-13-45T99:00:00Z', '?at=<script>', '?sky=true']) assert.equal(pinOf(junk), null, 'not an instant: ' + junk);
  let now = 5;
  const c = createClock({ now: () => now, search: '?at=2026-11-21T07:10:00Z' });
  assert.equal(c.pinned, at); assert.equal(c.when(), at);
  now = 1e12; assert.equal(c.when(), at, 'a pinned clock does not run');
  c.shift(60e3); assert.equal(c.when(), at + 60e3, 'but it can still be moved');
  c.pin(null); c.back(); assert.equal(c.when(), 1e12, 'let go, it is the real time again');
});

// ------------------------------------------------------------------------------------------------- the air
ok('the clear air thins with height as the U.S. Standard Atmosphere (1976) does', () => {
  // its own table (density, kg/m3, at geometric heights; 1.2250 at the sea)
  const table = { 5: 0.73643, 10: 0.41351, 20: 0.088910, 30: 0.018410, 40: 0.0039957, 50: 0.0010269, 60: 0.00030968, 70: 0.000082829, 80: 0.000018458 };
  let worst = 0;
  for (const [km, rho] of Object.entries(table)) { const e = Math.abs(A.airDensity(+km) / (rho / 1.225) - 1); worst = Math.max(worst, e); }
  assert.ok(worst < 2e-3, `the worst of nine heights is ${worst}`);
  assert.equal(A.airDensity(0), 1);
  // the whole column, were it all as dense as at the sea: P / (rho g)
  let col = 0; const n = 20000; for (let i = 0; i < n; i += 1) col += A.airDensity((i + 0.5) * 100 / n) * 100 / n;
  near(col, A.AIR.rayleigh.column, 0.001, 'the column in km');
  within(A.AIR.rayleigh.column, 8.43, 8.47, 'P / (rho g) is 8.43 km; gravity eases with height');
  // one exponential of the same column is what the paper has; it is three times too dense at 45 km
  within(Math.exp(-45 / A.AIR.rayleigh.column) / A.airDensity(45), 2.5, 3.5, 'an exponential over the true density at 45 km');
  measured.push(`the standard atmosphere's density, nine heights from 5 to 80 km against its own table: within ${(worst * 100).toFixed(3)}%; its column ${col.toFixed(3)} km of sea-level air`);
});

ok('the air\'s depth straight up is the measured one: Rayleigh, the sea\'s haze, the ozone layer', () => {
  const d = A.AIR.rayleigh.depth;
  near(A.rayleighDepth(0.55), 0.0973, 0.0002, 'Rayleigh at 550 nm (Hansen and Travis; Bodhaine et al. give 0.0973 at 1013 hPa)');
  assert.deepEqual(A.WAVES, [0.611, 0.549, 0.464], 'the screen\'s own red, green and blue');
  near(d[0], 0.0634, 0.0005, '611 nm'); near(d[1], 0.0981, 0.0005, '549 nm'); near(d[2], 0.1952, 0.001, '464 nm');
  // ozone: 300 Dobson units; its cross-sections between the bins of the measured table (strongest in the orange)
  near(A.ozoneCross(0.605), 5.019e-25, 1e-30, 'a bin\'s middle is its own value'); near(A.ozoneCross(0.55), (3.091e-25 + 3.5e-25) / 2, 1e-30, 'between two');
  for (let c = 0; c < 3; c += 1) near(A.AIR.ozone.absorb[c] * 15, A.ozoneCross(A.WAVES[c]) * 300 * 2.687e20, 1e-9, 'the layer holds 300 Dobson units: its depth is the cross-section times the molecules over a square metre');
  assert.ok(A.AIR.ozone.absorb[0] > A.AIR.ozone.absorb[1] && A.AIR.ozone.absorb[1] > 5 * A.AIR.ozone.absorb[2], 'it takes red and green and leaves blue');
  assert.equal(A.AIR.mie.depth, 0.06); near(A.AIR.mie.extinct * A.AIR.mie.scale, 0.06, 1e-12, 'the haze');
  near(A.AIR.ground, 6371.008, 0.001, 'the Earth\'s mean radius, from bodies.js');
  // the table against the closed form: Rayleigh's depth, the haze's, 15 km of ozone at its peak
  const want = [0, 1, 2].map((c) => d[c] + 0.06 * (1 - Math.exp(-100 / 1.2)) + A.AIR.ozone.absorb[c] * 15);
  const T = A.transmittance(0, 1), od = A.opticalDepth(0, 1);
  for (let c = 0; c < 3; c += 1) { near(od[c], want[c], 2e-4, 'the integral, colour ' + c); near(-Math.log(T[c]), want[c], 1.5e-3, 'the table, colour ' + c); }
  within(A.luminance(T), 0.82, 0.85, 'a Sun overhead keeps five sixths of its light');
  measured.push(`depth straight up (611, 549, 464 nm): ${want.map((x) => x.toFixed(4)).join(', ')}; a Sun overhead arrives with ${(A.luminance(T) * 100).toFixed(1)}% of its light`);
});

ok('the transmittance table: grazing the sea it agrees with a slow sum, and with the air mass people measure', () => {
  const lut = A.transmittanceLUT();
  assert.deepEqual([lut.w, lut.h], A.LUT.T);
  for (let i = 0; i < lut.data.length; i += 1) assert.ok(lut.data[i] >= 0 && lut.data[i] <= 1, 'a transmittance is between 0 and 1');
  // a slow sum along the ray that grazes the sea (the table's own corner): 200,000 steps
  const h0 = 0, len = A.toTop(h0, 0), n = 200000; let ray = 0, mie = 0, ozo = 0;
  for (let i = 0; i < n; i += 1) { const h = A.heightAlong(h0, 0, (i + 0.5) * len / n); ray += A.airDensity(h); mie += Math.exp(-h / 1.2); ozo += Math.max(0, 1 - Math.abs(h - 25) / 15); }
  ray *= len / n; mie *= len / n; ozo *= len / n;
  const slow = [0, 1, 2].map((c) => A.AIR.rayleigh.scatter[c] * ray + A.AIR.mie.extinct * mie + A.AIR.ozone.absorb[c] * ozo), T = A.transmittance(h0, 0);
  for (let c = 0; c < 3; c += 1) near(-Math.log(T[c]) / slow[c], 1, 0.002, 'the table at the horizon, colour ' + c);
  // between its entries (an eye 2 m up, looking level) it is read to within 3% of the depth
  const eye = A.opticalDepth(0.002, 0, [0, 0, 0], 4000), Te = A.transmittance(0.002, 0);
  for (let c = 0; c < 3; c += 1) near(-Math.log(Te[c]) / eye[c], 1, 0.03, 'between entries, colour ' + c);
  // how many times the overhead air a grazing ray passes: Kasten and Young (1989) measure 38.09 with the air's
  // bending; a straight ray through the standard atmosphere passes a little less
  const mass = ray / A.AIR.rayleigh.column;
  within(mass, 34, 39, 'the air mass at the horizon');
  // and it only ever falls toward the horizon
  let was = 1; for (let alt = 90; alt >= 0; alt -= 0.5) { const t = A.transmittance(0.002, Math.sin(alt * D2R))[1]; assert.ok(t <= was + 1e-9, 'less light at ' + alt); was = t; }
  measured.push(`grazing the sea: ${mass.toFixed(1)} times the overhead air (Kasten and Young measure 38.1, with the air's bending); the table is within 0.2% of a slow sum there; what is left of the Sun on the horizon: ${T.map((x) => sig(x, 2)).join(', ')}`);
});

ok('multiple scattering never makes light: the series converges everywhere, and the ground gets less than the Sun sent', () => {
  const m = A.multiScatteringLUT();
  assert.deepEqual([m.w, m.h], [A.LUT.MS, A.LUT.MS]);
  let fmax = 0; for (let i = 0; i < m.f.length; i += 1) { assert.ok(m.f[i] >= 0, 'a share is not negative'); fmax = Math.max(fmax, m.f[i]); }
  assert.ok(fmax < 0.5, `the most of a uniform glow that is scattered on is ${fmax}: the series 1 / (1 - f) is far from running away`);
  for (let i = 0; i < m.data.length; i += 4) for (let c = 0; c < 3; c += 1) assert.ok(Number.isFinite(m.data[i + c]) && m.data[i + c] >= 0 && m.data[i + c] < 0.1, 'the glow is finite and small');
  // level ground: Sun and sky together, over what the Sun sends to the top of the air above it
  const rows = [];
  for (const alt of [90, 60, 30, 10, 5, 2]) {
    const up = Math.sin(alt * D2R), direct = A.luminance(A.sunThrough(0.002, up)) * up, skyE = A.luminance(A.skyIrradiance(0.002, up));
    assert.ok(direct + skyE < up, `more light at the ground than above the air, Sun at ${alt}`);
    assert.ok(skyE < up - direct, `the sky gives back more than the air took out of the beam, Sun at ${alt}`);
    assert.ok(skyE > 0.3 * (up - direct) * (alt > 20 ? 1 : 0), 'and not strangely little');
    rows.push(`${alt}°: ${((direct + skyE) / up * 100).toFixed(0)}%`);
  }
  measured.push(`of the light sent to level ground, what arrives (Sun and sky): ${rows.join(', ')}; the most of a uniform glow scattered on: ${fmax.toFixed(3)}`);
});

// ------------------------------------------------------------------------------------------------- the Sun
ok('the Sun above the air: the solar constant times the efficacy of sunlight, by its true distance', () => {
  near(A.sunIlluminance(AU), 1361 * 133800 / 1366.1, 1e-6); within(A.sunIlluminance(AU), 133000, 133600, 'lux at one astronomical unit');
  near(A.sunIlluminance(0.9833 * AU) / A.sunIlluminance(1.0167 * AU), 1.069, 0.001, 'January over July');
  // its disc: the mean luminance, and the limb darkening that keeps that mean
  const L = A.sunLuminance(133300, 0.2666); within(L, 1.9e9, 2.0e9, 'cd/m2');
  for (const a of A.SUN.limb) { let s = 0; const n = 4000; for (let i = 0; i < n; i += 1) { const r = (i + 0.5) / n, mu = Math.sqrt(1 - r * r); s += (a + 2) / 2 * Math.pow(mu, a) * 2 * r / n; } near(s, 1, 2e-3, 'the darkened disc sends what the plain one would'); }
  assert.ok(A.SUN.limb[2] > A.SUN.limb[1] && A.SUN.limb[1] > A.SUN.limb[0], 'the limb is redder than the middle');
  measured.push(`the Sun above the air at 1 au: ${Math.round(A.sunIlluminance(AU)).toLocaleString('en-US')} lux; its disc's mean luminance ${sig(L)} cd/m2; limb darkening exponents (611, 549, 464 nm) ${A.SUN.limb.map((x) => x.toFixed(3)).join(', ')}`);
});

const D = createDaylight({ lat: LAT, lon: LON });
const altAt = (ms) => sky(LAT, LON, ms, {}, { ids: ['sun'] }).sun.alt;
const find = (target, lo, hi) => { for (let i = 0; i < 60; i += 1) { const m = (lo + hi) / 2; if ((altAt(m) - target) * (altAt(lo) - target) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
const NOON = Date.UTC(2026, 10, 21, 1, 9, 25);      // the Sun due north over the island (SOLAR.md: 12:09:25, UTC+11)

ok('the Sun stands where the clockwork says, in the island\'s frame (x east, y up, z south)', () => {
  for (const ms of [NOON, NOON + 3 * 3600e3, NOON + 6.9 * 3600e3, NOON - 5 * 3600e3, Date.UTC(2024, 5, 21, 2, 0, 0)]) {
    const r = { ...sky(LAT, LON, ms, {}, { ids: ['sun'], height: 2 }).sun }, L = D.at(ms, 2);
    near(L.sun[0], r.east, 1e-12); near(L.sun[1], r.up, 1e-12); near(L.sun[2], -r.north, 1e-12);
    near(Math.hypot(...L.sun), 1, 1e-12); near(Math.hypot(...L.trueSun), 1, 1e-12);
    near(L.alt, r.alt, 1e-12); near(L.radius, r.diameter / 2, 1e-12);
    // where it is, and where it is seen: the same azimuth, lower by the air's lift
    near(Math.asin(L.sun[1]) / D2R - Math.asin(L.trueSun[1]) / D2R, r.lifted, 1e-9, 'the lift');
    near(Math.atan2(L.sun[0], -L.sun[2]), Math.atan2(L.trueSun[0], -L.trueSun[2]), 1e-9, 'the azimuth');
    near(L.lux, A.sunIlluminance(r.distance), 1e-6);
  }
  const L = D.at(NOON, 2);
  near(L.alt, 78.33, 0.02, 'noon on 21 November'); assert.ok(Math.abs(L.sun[0]) < 0.001 && L.sun[2] < 0, 'due north');
  within(L.lux, 136000, 137000, 'the Earth is near the Sun in November');
});

ok('on the horizon the Sun is flattened: the air lifts its lower limb more than its upper', () => {
  const ms = find(0.2, NOON, NOON + 8 * 3600e3), L = D.at(ms, 2), t = L.alt - L.lifted;      // seen 0.2 degrees up
  const top = t + L.radius + refraction(t + L.radius), bottom = t - L.radius + refraction(t - L.radius);
  within((top - bottom) / (2 * L.radius), 0.78, 0.9, 'its height over its width');
  measured.push(`the Sun seen ${L.alt.toFixed(1)}° up is ${((top - bottom) * 60).toFixed(1)}' high and ${(2 * L.radius * 60).toFixed(1)}' wide`);
});

// --------------------------------------------------------------------- the sky from the island, 21 November 2026
// The light on level ground is compared with the fits in the Explanatory Supplement to the Astronomical Almanac
// (P. K. Seidelmann, ed., 1992, section 9.33, after Brown 1952), which are for an average clear sky; the island's
// sea air is cleaner, so a low Sun comes through it brighter.
const supplement = (alt) => { const x = alt / 90, c = alt >= 20 ? [3.74, 3.97, -4.07, 1.47] : alt >= 5 ? [3.05, 13.28, -45.98, 64.33] : alt >= -0.8 ? [2.88, 22.26, -207.64, 1034.30] : alt >= -5 ? [2.88, 21.81, -258.11, -858.36] : alt >= -12 ? [2.70, 12.17, -431.69, -1899.83] : [13.84, 262.72, 1447.42, 2797.93]; return 10 ** (c[0] + x * (c[1] + x * (c[2] + x * c[3]))); };
const moments = [
  // what, the Sun's height as seen, the zenith's luminance (cd/m2), the light on level ground over the Supplement's
  ['noon', null, [8000, 22000], [0.9, 1.2]],
  ['the Sun 20° up', 20, [600, 2000], [1.1, 1.6]],
  ['the Sun 5° up', 5, [250, 1000], [1.0, 1.7]],
  ['sunset (the Sun seen on the horizon)', 0, [60, 400], [1.0, 2.2]],
  ['the end of civil twilight', -6, [0.15, 1.5], [0.5, 2]],
  ['the end of nautical twilight', -12, [2e-4, 5e-3], [0.3, 2]],
];
ok('the zenith and the light on level ground: noon, a low Sun, sunset, the end of civil and nautical twilight', () => {
  for (const [what, alt, zen, ratio] of moments) {
    const ms = alt === null ? NOON : find(alt, NOON, NOON + 11 * 3600e3), L = D.at(ms, 2), z = A.luminance(D.toward([0, 1, 0], [0, 0, 0], 32)), E = A.luminance(L.level);
    const want = supplement(L.alt - L.lifted);
    within(z, zen[0], zen[1], `the zenith at ${what}`);
    within(E / want, ratio[0], ratio[1], `level ground at ${what}: ${E} lux against the Supplement's ${want}`);
    const local = new Date(ms + 11 * 3600e3).toISOString().slice(11, 19);
    measured.push(`| ${what} | ${local} | ${(Math.abs(L.alt) < 0.005 ? 0 : L.alt).toFixed(2)}° | ${fig(A.luminance(L.direct))} | ${fig(A.luminance(L.sky))} | ${fig(E)} | ${fig(want)} | ${fig(z)} |`);
  }
});

ok('the light\'s colour: a high Sun is nearly white, a low one reddens; the zenith is the sky\'s own blue, and deeper in twilight', () => {
  const hue = (c) => [c[0] / c[1], c[2] / c[1]];
  const noon = hue(D.at(NOON, 2).direct); within(noon[0], 1.0, 1.06, 'red over green at noon'); within(noon[1], 0.88, 0.97, 'blue over green at noon');
  let was = noon;
  for (const alt of [30, 10, 3, 0.5]) { const h = hue(D.at(find(alt, NOON, NOON + 8 * 3600e3), 2).direct); assert.ok(h[0] > was[0] && h[1] < was[1], 'redder at ' + alt); was = h; }
  within(was[0], 1.8, 5, 'on the horizon the red is twice the green and more'); within(was[1], 0.01, 0.3, 'and the blue is nearly gone');
  // a blue sky is a daylight of 15,000 to 25,000 K (the CIE's daylight locus: x 0.261 to 0.250, y 0.270 to 0.255):
  // in the screen's own numbers, red over green 0.73 to 0.67 and blue over green 1.67 to 1.89
  D.at(NOON + 4 * 3600e3, 2); const day = hue(D.toward([0, 1, 0])); within(day[0], 0.6, 0.85, 'the zenith by day: red over green'); within(day[1], 1.45, 2.05, 'blue over green');
  D.at(find(-6, NOON, NOON + 9 * 3600e3), 2); const dusk = hue(D.toward([0, 1, 0]));
  assert.ok(dusk[1] > day[1] * 1.3 && dusk[0] < day[0], 'ozone takes the red and green out of twilight: the zenith is a deeper blue than by day, not a purple');
  measured.push(`the Sun's own colour at the ground (red and blue over green): noon ${noon.map((x) => x.toFixed(2)).join(', ')}; seen half a degree up ${was.map((x) => x.toFixed(2)).join(', ')}; the zenith by day ${day.map((x) => x.toFixed(2)).join(', ')} (a blue sky of 15,000 to 25,000 K on the CIE's daylight locus is 0.73 to 0.67, 1.67 to 1.89), at the end of civil twilight ${dusk.map((x) => x.toFixed(2)).join(', ')}`);
});

ok('the Earth\'s shadow rises opposite a set Sun, with the pink band over it (the Belt of Venus)', () => {
  const ms = find(-2, NOON, NOON + 9 * 3600e3), L = D.at(ms, 2), n = Math.hypot(L.sun[0], L.sun[2]), away = [-L.sun[0] / n, 0, -L.sun[2] / n];
  const look = (alt) => { const c = Math.cos(alt * D2R); return D.toward([away[0] * c, Math.sin(alt * D2R), away[2] * c], [0, 0, 0], 32); };
  const low = A.luminance(look(2)), band = A.luminance(look(12)), high = A.luminance(look(40));
  assert.ok(band > low * 1.8, `the band (${band}) over the shadow (${low})`);
  assert.ok(band > high * 1.2, 'and the band is brighter than the sky higher up');
  // the band is pink: it is lit by light that has lost its blue on a long way through the air; the shadow under it
  // is grey-blue, and the sky over it blue
  const pink = look(8), grey = look(3), blue = look(40);
  assert.ok(pink[0] / pink[2] > grey[0] / grey[2] * 1.3, 'the band is redder than the shadow under it');
  assert.ok(pink[0] / pink[2] > blue[0] / blue[2] * 1.5, 'and than the sky above it');
  assert.ok(pink[0] > pink[1], 'in the band red is over green: pink, where the rest of the sky is blue');
  // twice as many samples along each look change nothing: the shadow's edge is found, not stepped over
  for (const alt of [2, 5, 12]) { const c = Math.cos(alt * D2R), d = [away[0] * c, Math.sin(alt * D2R), away[2] * c]; near(A.luminance(A.skyRay(L.height, d, L.sun, 32)) / A.luminance(A.skyRay(L.height, d, L.sun, 64)), 1, 0.02, 'samples at ' + alt); }
  measured.push(`opposite a Sun 2° down: the Earth's shadow 2° up ${fig(low)} cd/m2, the band 12° up ${fig(band)}, the sky 40° up ${fig(high)}; red over blue ${(grey[0] / grey[2]).toFixed(2)} in the shadow, ${(pink[0] / pink[2]).toFixed(2)} in the band, ${(blue[0] / blue[2]).toFixed(2)} above it`);
  // the same, as a table: luminance and colour (the CIE's x, y) at four heights opposite the Sun, as it goes down
  const xy = (c) => { const X = 0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2], Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]; return [X / (X + Y + Z), Y / (X + Y + Z)]; };
  const rows = {};
  for (const down of [1, 2, 3, 4]) {
    const Lq = D.at(find(-down, NOON, NOON + 9 * 3600e3), 2), m = Math.hypot(Lq.sun[0], Lq.sun[2]), opp = [-Lq.sun[0] / m, 0, -Lq.sun[2] / m], cells = [];
    rows[down] = [2, 6, 12, 30].map((alt) => { const c = D.toward([opp[0] * Math.cos(alt * D2R), Math.sin(alt * D2R), opp[2] * Math.cos(alt * D2R)], [0, 0, 0], 48), q = xy(c); cells.push(`${fig(A.luminance(c))}; ${q[0].toFixed(3)}, ${q[1].toFixed(3)}`); return { Y: A.luminance(c), x: q[0], y: q[1] }; });
    measured.push(`| ${down}° down | ${cells.join(' | ')} |`);
  }
  // a degree and two degrees down, the shadow is half as bright as the band over it and bluer (x and y both lower), and
  // the band is the warmest thing in that sky; three degrees down the two have run together (within a quarter), and
  // at four the sky only darkens upward: the model's band is gone a little sooner than the sky's own
  for (const down of [1, 2]) { const [a, b, c, d] = rows[down]; assert.ok(c.Y > 1.9 * a.Y, 'the band over the shadow, ' + down); assert.ok(b.x > a.x + 0.015 && b.y > a.y + 0.008, 'the band is warmer than the shadow, ' + down); assert.ok(b.x > d.x + 0.02, 'and than the blue above it, ' + down); }
  { const [a, b, c, d] = rows[3]; assert.ok(Math.max(a.Y, b.Y, c.Y, d.Y) / Math.min(a.Y, b.Y, c.Y, d.Y) < 1.3, 'three degrees down the band has run into the shadow'); }
  { const [a, b, c, d] = rows[4]; assert.ok(a.Y > b.Y && b.Y > c.Y && c.Y > d.Y, 'four degrees down the sky only darkens upward'); }
});

// ------------------------------------------------------------------------------------------------- the eye
const srgb = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.min(1, x), 1 / 2.4) - 0.055));
ok('the eye: a bright scene is drawn bright and a dark one dark (Krawczyk\'s key), and a curve holds what the screen cannot reach', () => {
  // the key: the scene value given to the level the eye is adapted to
  near(A.krawczyk(0), 0.03, 1e-12); within(A.keyFor(6000), 0.67, 0.70, 'full day'); within(A.keyFor(1), 0.15, 0.17, 'the end of civil twilight'); within(A.keyFor(1e-3), 0.03, 0.031, 'night');
  let was = Infinity; for (const l of [1e5, 1e4, 1e3, 100, 10, 1, 0.1, 0.01, 1e-3]) { const k = A.keyFor(l); assert.ok(k < was, 'a dimmer scene is shown dimmer'); was = k; }
  assert.equal(A.exposureFor(0), A.exposureFor(A.EYE.floor), 'below the night sky\'s own glow the exposure holds'); assert.equal(A.exposureFor(1e-9), A.exposureFor(A.EYE.floor));
  // the curve: Reinhard's, on the luminance; half-way up at 1, white at W and never past it, rising all the way
  assert.equal(A.EYE.curve, 'reinhard'); near(A.shown(1), 0.5 * (1 + 1 / 64), 1e-12); near(A.shown(A.EYE.white), 1, 1e-12); assert.equal(A.shown(1e6), 1); assert.equal(A.shown(0), 0);
  was = -1; for (let x = 0; x <= 8; x += 0.05) { const y = A.shown(x); assert.ok(y > was && y <= 1); was = y; }
  for (const y of [0.05, 0.3, 0.8, 0.99]) near(A.shown(A.sceneValue(y)), y, 1e-9, 'there and back');
  // a colour keeps its hue; what the screen cannot reach gives up saturation, not hue; the heart of a glare is white
  const sky = A.shownColour([0.28, 0.42, 0.89]); near(sky[0] / sky[1], 0.28 / 0.42, 1e-9); near(sky[2] / sky[1], 0.89 / 0.42, 1e-9);
  const glow = A.shownColour([2.5, 0.9, 0.1]); near(glow[0], 1, 1e-9); assert.ok(glow[0] > glow[1] && glow[1] > glow[2], 'an orange past the screen\'s reach is still orange'); near((glow[0] - glow[1]) / (glow[1] - glow[2]), (2.5 - 0.9) / (0.9 - 0.1), 1e-6, 'the same hue');
  assert.deepEqual(A.shownColour([40, 14, 1.5]), [1, 1, 1]); assert.deepEqual(A.shownColour([0, 0, 0]), [0, 0, 0]);
  for (const c of A.CURVES) { assert.ok(A.keyFor(6000, c) > A.keyFor(1, c)); within(A.skyHold(c), 0.5, 4, 'the sky held under white by ' + c); }
  near(A.shown(A.keyFor(6000, 'agx'), 'agx'), A.shown(A.keyFor(6000, 'reinhard'), 'reinhard'), 2e-3, 'the curves are compared at the same brightness of the adapted level');
  // NOON ON THE BEACH, as played (looking along it, a little down): what the screen shows
  const L = D.at(NOON, 2), fwd = [0, -Math.sin(0.1), Math.cos(0.1)], scene = D.scene(fwd, [-1, 0, 0], [0, Math.cos(0.1), Math.sin(0.1)], 0.8, 0.52), e = A.exposureFor(scene);
  within(scene, 3000, 9000, 'the scene at noon, cd/m2');
  const at = (alt) => A.shownColour(D.toward([0, Math.sin(alt * D2R), Math.cos(alt * D2R)], [0, 0, 0], 32).map((x) => x * e)).map(srgb);      // the sky to the south, away from the Sun
  const high = at(20), low = at(3);
  within(high[0], 100, 130, 'the sky 20 degrees up: red'); within(high[1], 125, 155, 'green'); within(high[2], 165, 215, 'blue: a luminous blue');
  assert.ok(low[0] > high[0] + 15 && low[1] > high[1] + 10 && low[2] > high[2], 'the horizon is clearly paler than the sky above it');
  // white sand in that Sun (it gives back 40% of the light: 16,000 cd/m2) is bright and under white; a white sheet too
  const sand = A.shown(0.4 * A.luminance(L.level) / Math.PI * e), sheet = A.shown(A.luminance(L.level) / Math.PI * e);
  within(sand, 0.55, 0.8, 'sand'); within(sheet, 0.8, 0.95, 'a white sheet lying in the Sun'); assert.ok(sheet < 1);
  // adaptation: half the way (in stops) to a scene a hundred times brighter, and to one a hundred times darker
  const half = (from, to) => { let a = from, t = 0; while (Math.abs(Math.log(a / to)) > Math.abs(Math.log(from / to)) / 2) { a = A.adapt(a, to, 1 / 60); t += 1 / 60; } return t; };
  const up = half(10, 1000), down = half(1000, 10);
  within(up, 0.25, 0.5, 'to the light'); within(down, 1.4, 2.1, 'to the dark'); assert.ok(down > 3 * up);
  near(A.adapt(0, 500, 1 / 60), 500, 1e-9, 'an eye just opened is already adapted');
  // the meter: one bright patch does not rule it; what is given more weight counts more
  near(A.meter([100, 100, 100, 100]), 100, 1e-9); assert.ok(A.meter([100, 100, 100, 1e6]) < 1100);
  near(A.meter([10, 1000], [1, 1]), 100, 1e-9); assert.ok(A.meter([10, 1000], [3, 1]) < 40);
  // looking at the land shows the land, looking up shows the sky: at sunset the eye opens further for the dark
  // ground at its feet than for the bright sky
  const set = find(0.5, NOON, NOON + 8 * 3600e3), S = D.at(set, 2), n = Math.hypot(S.sun[0], S.sun[2]), f = [S.sun[0] / n, 0, S.sun[2] / n], r = [-f[2], 0, f[0]];
  const tip = (p) => [[f[0] * Math.cos(p), Math.sin(p), f[2] * Math.cos(p)], r, [-f[0] * Math.sin(p), Math.cos(p), -f[2] * Math.sin(p)]];
  const atFeet = D.scene(...tip(-0.35), 0.8, 0.52), atSky = D.scene(...tip(0.16), 0.8, 0.52);
  assert.ok(atFeet < atSky, 'the ground at its feet reads darker than the sunset');
  // and facing a low Sun it is never so open that the sky in view is, taken together, shown past seven tenths of white
  for (const alt of [20, 5, 1]) {
    const ms = find(alt, NOON, NOON + 8 * 3600e3), Lq = D.at(ms, 2), m = Math.hypot(Lq.sun[0], Lq.sun[2]), ff = [Lq.sun[0] / m, 0, Lq.sun[2] / m], rr = [-ff[2], 0, ff[0]], p = -0.1;
    const F = [ff[0] * Math.cos(p), Math.sin(p), ff[2] * Math.cos(p)], Uv = [-ff[0] * Math.sin(p), Math.cos(p), -ff[2] * Math.sin(p)], sc = D.scene(F, rr, Uv, 0.8, 0.52);
    let sum = 0, cnt = 0;
    for (let j = -1; j <= 1; j += 1) for (let i = -2; i <= 2; i += 1) { const d = [F[0] + rr[0] * i * 0.32 + Uv[0] * j * 0.312, F[1] + Uv[1] * j * 0.312, F[2] + rr[2] * i * 0.32 + Uv[2] * j * 0.312], k = Math.hypot(...d); if (d[1] / k > 0.004) { sum += A.luminance(D.toward(d.map((x) => x / k), [0, 0, 0], 10)); cnt += 1; } }
    assert.ok(cnt > 0 && A.shown(sum / cnt * A.exposureFor(sc)) <= 0.73, `facing a Sun ${alt} degrees up, the sky in view is shown at ${A.shown(sum / cnt * A.exposureFor(sc))}`);
  }
  D.at(NOON, 2);
  measured.push(`noon on the beach, as played: the scene reads ${fig(scene)} cd/m2 and is given the scene value ${A.keyFor(scene).toFixed(2)} (exposure ${sig(e)} per cd/m2); the sky to the south is shown at sRGB ${high.join(', ')} 20° up and ${low.join(', ')} at 3°; sand that gives back 40% of the light at ${(sand * 100).toFixed(0)}% of white, a white sheet at ${(sheet * 100).toFixed(0)}%; half-way to a brighter scene in ${up.toFixed(2)} s, to a darker in ${down.toFixed(2)} s`);
});

ok('the eye\'s own veil round the Sun (the CIE\'s disability glare) falls off as it should', () => {
  near(A.veil(1), 10 + (5 + 0.05) * (1 + (30 / 62.5) ** 4) + 0.00125, 1e-9);
  assert.equal(A.veil(0.01), A.veil(0.1), 'nearer than a tenth of a degree it is held');
  let was = Infinity; for (const t of [0.1, 0.5, 1, 3, 10, 30, 60, 100]) { assert.ok(A.veil(t) < was); was = A.veil(t); }
  within(A.veil(10), 0.05, 0.08, 'per lux, ten degrees off'); within(A.veil(30) / (10 / 900), 0.5, 0.9, 'Stiles and Holladay\'s 10 / angle^2, near enough, at 30');
});

// ------------------------------------------------------------------------------------- how it is written
ok('the GPU reads the same numbers: its chunk is written from the constants, and carries the same layers', () => {
  const g = A.AIR_GLSL;
  for (const n of [A.AIR.ground, A.AIR.height, A.AIR.mie.g, A.AIR.albedo]) assert.ok(g.includes(Number(n).toPrecision(9).replace(/^(\d+)$/, '$1.0')), 'the constant ' + n);
  for (const c of A.AIR.rayleigh.scatter) assert.ok(g.includes(Number(c).toPrecision(9)), 'Rayleigh ' + c);
  assert.equal((g.match(/return [0-9.e-]+ \* (pow|exp)\(/g) || []).length, 8, 'eight layers of the standard atmosphere');
  for (const fn of ['airT', 'airMS', 'airRho', 'airShadow', 'airMarch', 'airToGround', 'airToTop']) assert.ok(new RegExp(`\\b(vec[23]|float) ${fn}\\(`).test(g), fn);
  assert.ok(!/NaN|undefined|Infinity/.test(g), 'no number failed to print');
  // every literal a GLSL float
  for (const m of g.matchAll(/const float \w+ = ([^;]+);/g)) assert.match(m[1], /^-?\d+\.\d*(e[-+]?\d+)?$|^-?\d*\.\d+(e[-+]?\d+)?$/, 'a float: ' + m[0]);
});

ok('no page and no three in the numbers; the clockwork still asks no clock; the reference\'s notice is kept', () => {
  for (const f of ['air.js', 'daylight.js', 'clock.js']) {
    const code = read('src/game/solar/' + f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/from 'three'|document\.|window\./.test(code), 'no page and no three in ' + f);
  }
  for (const f of ['air.js', 'daylight.js']) assert.ok(!/Date\.now\(|Math\.random\(|new Date\(/.test(read('src/game/solar/' + f).replace(/^\s*\/\/.*$/gm, '')), f + ' asks no clock: the caller says when');
  assert.match(read('src/game/solar/clock.js'), /Date\.now\(\)/, 'the clock is the one place the real time is read');
  const air = read('src/game/solar/air.js');
  assert.match(air, /Hillaire[^]*EGSR 2020[^]*github\.com\/sebh\/UnrealEngineSkyAtmosphere/);
  assert.match(air, /MIT License\n\/\/\n\/\/ Copyright \(c\) 2020 Epic Games, Inc\.[^]*Permission is hereby granted[^]*THE SOFTWARE IS PROVIDED "AS IS"/);
  for (const src of ['Hansen', 'Standard Atmosphere', 'Smirnov', 'Bruneton', 'Bremen', 'Darula', 'Hestroffer', 'Krawczyk', 'Reinhard', 'CIE 146:2002', 'ISO 12232']) assert.ok(air.includes(src), 'the source is named: ' + src);
  assert.equal(BODIES.earth.atmosphere.pressure, 101400, 'the pressure the depth is scaled to is the Earth\'s own record');
});

ok('behind a switch, and off: only ?sky=true in the address asks for the true sky; the island and the void are otherwise as they were', () => {
  assert.equal(skyAsked('?sky=true'), true); assert.equal(skyAsked('?at=2026-11-21T07:10:00Z&sky=true'), true);
  for (const no of ['', '?', '?sky', '?sky=', '?sky=1', '?sky=TRUE', '?sky=false', '?sky=yes', '?skyx=true', undefined, null]) assert.equal(skyAsked(no), false, 'not asked: ' + no);
  const view = read('src/game/view.js'), island = read('src/game/island/island.js'), sky = read('src/game/sky.js');
  assert.match(view, /const TRUE_SKY = skyAsked\(globalThis\.location\?\.search\);/);
  assert.equal((view.match(/createIsland\(\{[^}]*sky: TRUE_SKY \}\)/g) || []).length, 2, 'both places the island is made hand the switch on');
  assert.match(island, /export function createIsland\(\{ renderer, lite = false, light = 'pale', ground, shape, sky = false \}\)/, 'the island is not under the true sky unless asked');
  assert.match(island, /const air = sky && canDrawTrueSky\(renderer\) \? createTrueSky\(/, 'nor on a machine that cannot draw it');
  // with the switch off every line that draws is the line it was: the old sky's dome, its fog, its three lights, its sea
  assert.match(island, /scene\.add\(air \? air\.dome : dome\);/); assert.match(island, /scene\.fog = air \? air\.fog : new THREE\.FogExp2\(0xffffff, 3\.6e-5\);/);
  assert.match(island, /if \(air\) return lightName;/); assert.match(island, /const seaLit = air \? 'uBodyAmt' : 'uSkyAmt', seaSky = air \? 'skyOver\(r, normalize\(uSun\)\)' : 'mix\(uHorizon, uZenith, pow\(r\.y, 0\.55\)\) \* uSkyAmt'/);
  for (const f of ['src/game/void.js', 'src/game/lights.js', 'src/game/figure.js', 'src/game/world.js']) assert.ok(!/sky\.js|solar\//.test(read(f)), f + ' knows nothing of the true sky');
  // what the drawing leans on: materials adopted once, the wrapped sky's level put back when the sky is let go, the
  // tables over the sky's own light, the GPU asked about the Sun's disc
  assert.match(sky, /const ADOPTED = new WeakSet\(\);/); assert.match(sky, /material\.customProgramCacheKey = \(\) => key \+ '\|air:' \+ kind;/);
  assert.match(sky, /SHARED\.uAirEnv\.value = 1; SHARED\.uAirAP\.value = null;/, 'a body that leaves for the void takes no trace of the sky with it');
  assert.match(sky, /U\.sky\.uNorm\.value = 1 \/ per;/); assert.match(sky, /gl\.beginQuery\(gl\.ANY_SAMPLES_PASSED, q\.query\)/);
  assert.match(sky, /from '\.\/solar\/air\.js'/); assert.match(sky, /from '\.\/solar\/daylight\.js'/); assert.match(sky, /from '\.\/solar\/clock\.js'/);
  assert.ok(!/Date\.now\(|new Date\(/.test(sky.replace(/^\s*\/\/.*$/gm, '')), 'the sky asks the world\'s clock, not its own');
  assert.match(read('package.json'), /node test\/solar\.test\.mjs && node test\/sky\.test\.mjs"/);
});

// `node test/sky.test.mjs --measured` prints only the lines measured so far, for writing them into SOLAR.md
if (process.argv.includes('--measured')) { for (const line of measured) console.log(line); process.exit(0); }

ok('SOLAR.md, GAME.md and the README say what was built, in Colin\'s words and in the numbers these checks just measured', () => {
  const md = read('SOLAR.md'), game = read('GAME.md'), readme = read('README.md');
  assert.match(md, /## Step 2, first part: the air and the Sun \(22 November 2026\)/);
  for (const words of ['model the solar system as accurately as possible and make it explorable', 'ultra-high quality experience rather than quantity of output']) { assert.ok(md.includes(words)); assert.ok(game.includes(words), 'GAME.md quotes: ' + words); }
  for (const part of ['It is behind a switch, and off', '?sky=true', 'Hillaire', 'EGSR 2020', 'github.com/sebh/UnrealEngineSkyAtmosphere', 'MIT', 'Epic', 'U.S. Standard Atmosphere, 1976', 'Hansen', 'Smirnov', 'Bruneton', 'Bremen', 'Darula', 'Hestroffer', 'Saemundsson', 'Krawczyk', 'Reinhard', 'CIE 146:2002', 'Explanatory Supplement', '&curve=none',
    '### What is approximated', 'No cast shadows', 'Three wavelengths', 'Straight rays', '### What the next parts need from here', 'EYE.floor']) assert.ok(md.includes(part), 'SOLAR.md says: ' + part);
  // every line and row these checks measured is in the file: it cannot say more than was found
  for (const line of measured) assert.ok(md.includes(line.startsWith('|') ? line : line[0].toUpperCase() + line.slice(1)), 'SOLAR.md is behind the measurement: ' + line);
  assert.match(game, /### The true sky over the island, its first part: the air and the Sun \(22 November 2026\)/);
  for (const part of ['It is behind a switch, and off', '?sky=true', 'What changed in the look under the switch, and why', 'What is rough, seen in the pictures', 'Nothing casts a shadow', 'Krawczyk', '| `sky.js` |']) assert.ok(game.includes(part), 'GAME.md says: ' + part);
  assert.match(readme, /- \*\*2026-11-22\*\* — \*\*The true sky over the island, its first part: the air and\n  the Sun, behind a switch\*\*/);
  assert.ok(readme.indexOf('2026-11-22** — **The true sky') < readme.indexOf('**Landing gear**'), 'newest first');
});

console.log('\n  what was measured (SOLAR.md keeps these):');
for (const line of measured) console.log('    ' + line);
console.log(`\n${passed} checks passed.`);
