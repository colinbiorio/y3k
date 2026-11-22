// THE TRUE SKY, ITS THIRD PART: THE MOON (src/game/solar/moon.js, moonmaps.js and the two maps beside them; sky.js
// draws it; SOLAR.md "Step 2, third part"). Colin, 22 November 2026: "the ultimate goal is the most realistic game ever
// made"; "i would FAR prefer quality over quantity".
//
// What is pinned here is what can be checked without a GPU:
//
//   - the two maps are the files measured, and their bytes decode to what the generator wrote;
//   - the face is turned by the IAU's rotation: the point under the eye and the north pole's angle are the clockwork's
//     own (which it measured against JPL Horizons), and from Lord Howe the Moon is "upside down";
//   - the bright limb faces the Sun as the clockwork says;
//   - the light law, integrated over the near side's albedo (the fixture's 2 degree cells), gives the clockwork's
//     magnitude law, and the waxing Moon is brighter than the waning, as it is;
//   - the earthshine: the Earth's light at the Moon from the clockwork's magnitude law for the Earth, against the
//     published ten-thousandth of sunlight; its colour; how it compares with the crescent as seen;
//   - the eye's rule for the Moon; the GLSL written from the constants; behind the switch.
//
// The numbers these checks measure are printed at the end, and are the lines in SOLAR.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as Mo from '../src/game/solar/moon.js';
import { MOON_MAPS, PHI, PHI_STEP, MOON_CREDIT } from '../src/game/solar/moonmaps.js';
import { createDaylight } from '../src/game/solar/daylight.js';
import { sky, AU, BODIES } from '../src/game/solar/ephemeris.js';
import { luminance, sunIlluminance, shown } from '../src/game/solar/air.js';
import { magLux } from '../src/game/solar/night.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} ± ${eps}`);
const within = (a, lo, hi, msg) => assert.ok(a >= lo && a <= hi, `${msg}: ${a} is not in ${lo} .. ${hi}`);
const D2R = Math.PI / 180, R2D = 180 / Math.PI, LAT = -31.5503, LON = 159.0761;      // the island
const measured = [];
const sig = (x, n = 3) => (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6 ? Number(x).toExponential(n - 1).replace(/\.?0+e/, 'e').replace('e+', 'e') : String(Number(Number(x).toPrecision(n))));
const wrap180 = (a) => ((a % 360) + 540) % 360 - 180;
const fx = JSON.parse(read('test/fixtures/solar/moon.json'));

// ------------------------------------------------------------------------------------------------- the maps
ok('the two maps are the files the fixture was read from, small enough, and their bytes decode to what was written', () => {
  for (const k of ['albedo', 'relief']) {
    const m = MOON_MAPS[k], buf = readFileSync(join(ROOT, 'src/game/solar', m.file));
    const sha = createHash('sha256').update(buf).digest('hex');
    assert.equal(sha, m.sha256, k + ': the file is the one moonmaps.js describes'); assert.equal(sha, fx.files[k].sha256, k + ': and the one the fixture was read from');
    assert.equal(buf.length, m.bytes); assert.equal(m.w, 2 * m.h, 'a whole sphere, plate carree');
  }
  assert.equal(MOON_MAPS.albedo.w, 2048); assert.equal(MOON_MAPS.relief.w, 1024);
  assert.ok(MOON_MAPS.albedo.bytes + MOON_MAPS.relief.bytes < 1.6e6, 'both together under 1.6 MB');
  assert.equal(fx.RHO_MAX, MOON_MAPS.RHO_MAX); assert.equal(fx.H0, MOON_MAPS.H0); assert.equal(fx.H1, MOON_MAPS.H1);
  const lin = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  for (const t of fx.texels) {
    // the place's texel in each map (column 0 at longitude -180, row 0 at +90)
    assert.equal(t.albedo.x, Math.floor((t.lon + 180) / 360 * MOON_MAPS.albedo.w) % MOON_MAPS.albedo.w, t.name); assert.equal(t.albedo.y, Math.min(MOON_MAPS.albedo.h - 1, Math.floor((90 - t.lat) / 180 * MOON_MAPS.albedo.h)), t.name);
    for (let c = 0; c < 3; c += 1) near(MOON_MAPS.RHO_MAX * lin(t.albedo.bytes[c]), t.albedo.rho[c], 1e-5, t.name + ': rho');
    const e = t.relief.bytes[0] / 255 * 2 - 1, n = t.relief.bytes[1] / 255 * 2 - 1;
    near(e, t.relief.normal[0], 1e-5); near(n, t.relief.normal[1], 1e-5); near(Math.hypot(e, n, t.relief.normal[2]), 1, 1e-4, 'a unit normal');
    near(MOON_MAPS.H0 + t.relief.bytes[2] / 255 * (MOON_MAPS.H1 - MOON_MAPS.H0), t.relief.km, 1e-4, t.name + ': height');
  }
  const by = Object.fromEntries(fx.texels.map((t) => [t.name, t]));
  // the maria dark, the young rayed craters bright; the far side's highest place high, South Pole-Aitken low
  const Y = (t) => luminance(t.albedo.rho);
  assert.ok(Y(by['Mare Tranquillitatis']) < 0.08 && Y(by['Mare Crisium']) < 0.09, 'the maria are dark');
  assert.ok(Y(by['Aristarchus']) > 0.2 && Y(by['Tycho, its floor']) > 0.2, 'Aristarchus and Tycho are bright');
  assert.ok(by['the highest place (far side)'].relief.km > 6, 'the far side\'s highest place'); assert.ok(by['Antoniadi (South Pole-Aitken)'].relief.km < -5, 'Antoniadi, in the deepest basin');
  near(luminance(MOON_MAPS.rhoMean), 0.123, 0.002, 'the near side\'s mean albedo (the Moon\'s geometric albedo, as the law needs at full)');
  assert.ok(MOON_MAPS.rhoMean[0] > MOON_MAPS.rhoMean[1] && MOON_MAPS.rhoMean[1] > MOON_MAPS.rhoMean[2], 'redder than sunlight');
  within(MOON_MAPS.bright, 1.3, 1.6, 'its brightest tenth over its mean');
  measured.push(`the maps: the albedo ${MOON_MAPS.albedo.w} x ${MOON_MAPS.albedo.h} (${(MOON_MAPS.albedo.bytes / 1024).toFixed(0)} KB), the relief ${MOON_MAPS.relief.w} x ${MOON_MAPS.relief.h} (${(MOON_MAPS.relief.bytes / 1024).toFixed(0)} KB, heights ${MOON_MAPS.H0} to ${MOON_MAPS.H1} km in steps of ${((MOON_MAPS.H1 - MOON_MAPS.H0) / 255 * 1000).toFixed(1)} m); the near side's mean albedo ${luminance(MOON_MAPS.rhoMean).toFixed(4)} (red, green, blue ${MOON_MAPS.rhoMean.map((x) => x.toFixed(4)).join(', ')}), its brightest tenth ${MOON_MAPS.bright.toFixed(3)} times that; Mare Tranquillitatis ${Y(by['Mare Tranquillitatis']).toFixed(3)}, Aristarchus ${Y(by.Aristarchus).toFixed(3)}`);
});

ok('the phase law: PHI from the fitted table, 1 at full, falling to 160 degrees and held past it', () => {
  assert.equal(PHI.length, 91); assert.equal(PHI_STEP, 2);
  near(Mo.phi(0), 1, 2e-4); near(Mo.phi(90), PHI[45], 1e-12); near(Mo.phi(91), (PHI[45] + PHI[46]) / 2, 1e-12);
  let was = Infinity; for (let a = 0; a <= 156; a += 2) { const p = Mo.phi(a); assert.ok(p < was, 'falling at ' + a); was = p; }
  near(Mo.phi(170), Mo.phi(160), 1e-12, 'held');
  near(Mo.moonLuminance(1, 1, 0, 1, 1), 1 / Math.PI * Mo.phi(0), 1e-12);
  near(Mo.lommelSeeliger(0.5, 0.5), 1, 1e-12, 'seen and lit from the same way, as bright as a white plate'); near(Mo.lommelSeeliger(1e-9, 1e-9), 1, 1e-6, 'and to the limb');
  assert.equal(Mo.lommelSeeliger(0, 0.5), 0); assert.equal(Mo.lommelSeeliger(-0.1, 0.5), 0);
});

// ------------------------------------------------------------------------------------------------- the face, turned
const D = createDaylight({ lat: LAT, lon: LON, stars: null }), MF = createMoonFace();
function createMoonFace() { return Mo.createMoonFace(); }
// a direction's angle on the sky round the Moon, from "up" (the zenith's direction there), as sky() gives position
// angles' differences (limb - zenith, axis - zenith)
function fromUp(v, m) {
  const proj = (a) => { const k = a[0] * m[0] + a[1] * m[1] + a[2] * m[2], p = [a[0] - k * m[0], a[1] - k * m[1], a[2] - k * m[2]], n = Math.hypot(p[0], p[1], p[2]); return p.map((x) => x / n); };
  const a = proj(v), u = proj([0, 1, 0]), c = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
  return -Math.atan2(c[0] * m[0] + c[1] * m[1] + c[2] * m[2], u[0] * a[0] + u[1] * a[1] + u[2] * a[2]) * R2D;
}
const INSTANTS = ['2026-11-24T13:00:00Z', '2026-11-24T08:14:00Z', '2026-11-17T09:30:00Z', '2026-11-12T09:00:00Z', '2026-12-06T02:08:29Z', '2026-07-01T12:00:00Z', '2026-03-03T11:00:00Z', '2027-05-10T18:00:00Z', '2030-01-01T00:00:00Z', '1999-08-11T11:00:00Z'];
ok('the face is turned by the IAU\'s rotation: the point under the eye and the north pole\'s angle are the clockwork\'s, and from Lord Howe the Moon is upside down', () => {
  let worstSub = 0, worstAxis = 0, worstLimb = 0;
  for (const t of INSTANTS) {
    const ms = Date.parse(t), L = D.at(ms, 2), F = MF.at(ms, L, LAT, LON), s = sky(LAT, LON, ms, {}, { ids: ['sun', 'moon'], height: 2 }).moon, m = L.moon.trueDir;
    // the point under the eye (the librations): the clockwork's own, which it measured against Horizons
    worstSub = Math.max(worstSub, Math.abs(wrap180(F.subLon - s.subLon)) * 3600, Math.abs(F.subLat - s.subLat) * 3600);
    // the north pole (the Moon's z axis) on the sky, from up
    const z = [F.frame[6], F.frame[7], F.frame[8]];
    worstAxis = Math.max(worstAxis, Math.abs(wrap180(fromUp(z, m) - (s.axis - s.zenith))));
    // the bright limb: toward the Sun from the Moon, on the sky
    const S = [0, 1, 2].map((k) => L.trueSun[k] * L.sunDistance - m[k] * L.moon.distance);
    worstLimb = Math.max(worstLimb, Math.abs(wrap180(fromUp(S, m) - (s.limb - s.zenith))));
    // the frame is a rotation
    const fr = F.frame, row = (i) => [fr[3 * i], fr[3 * i + 1], fr[3 * i + 2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (let i = 0; i < 3; i += 1) { near(dot(row(i), row(i)), 1, 1e-12); for (let j = i + 1; j < 3; j += 1) near(dot(row(i), row(j)), 0, 1e-12); }
  }
  assert.ok(worstSub < 30, `the point under the eye, ${worstSub} arcsec from the clockwork's (aberration, which turns the whole disc and not its face, is left out: 20.5 arcsec)`);
  assert.ok(worstAxis < 0.001, 'the north pole\'s angle: ' + worstAxis);
  assert.ok(worstLimb < 0.001, 'the bright limb\'s angle: ' + worstLimb);
  // the full Moon of 24 November 2026 at midnight, due north 32 degrees up: its north pole points down (a northern eye
  // sees it the other way up), and we see past its south pole (libration in latitude -7.3 degrees)
  const full = Date.parse('2026-11-24T13:00:00Z'), L = D.at(full, 2), F = MF.at(full, L, LAT, LON), s = sky(LAT, LON, full, {}, { ids: ['moon'], height: 2 }).moon;
  const up = fromUp([F.frame[6], F.frame[7], F.frame[8]], L.moon.trueDir);
  assert.ok(Math.abs(up) > 150, 'its north pole within 30 degrees of straight down: ' + up);
  within(F.subLat, -7.5, -7, 'the libration in latitude');
  measured.push(`the face turned by the IAU's rotation at ${INSTANTS.length} instants from 1999 to 2030: the point under the eye within ${worstSub.toFixed(0)} arcsec of the clockwork's librations (aberration, which moves the disc and not its face, is not in the frame), the north pole's and the bright limb's angles within ${Math.max(worstAxis, worstLimb).toExponential(0)} degrees; the full Moon of 24 November 2026 at midnight, due north 32 degrees up, has its north pole ${Math.abs(up).toFixed(1)} degrees from up (upside down, to a northern eye), librations ${wrap180(F.subLon).toFixed(1)}, ${F.subLat.toFixed(1)} degrees`);
});

// ------------------------------------------------------------------------------------------------- the light
// the whole disc's light under the law, over the fixture's 2 degree cells (each cell's albedo, the law at 4 x 4 points
// in it): E_moon / E_sun for the Moon at a distance d (km), the Sun at a phase angle a (degrees) to the east (+1: the
// waxing Moon, whose lit half is the Moon's east) or the west (-1), seen from over its equator
const G = fx.grid, GN = G.rho.length, GM = G.rho[0].length;
function discLight(a, side, d = 384400, sunSeen = null) {
  const al = a * D2R, s = [Math.cos(al), side * Math.sin(al), 0], SUB = 4; let sum = 0;
  for (let j = 0; j < GN; j += 1) for (let i = 0; i < GM; i += 1) {
    const rho = G.rho[j][i] * G.scale;
    for (let q = 0; q < SUB; q += 1) for (let p = 0; p < SUB; p += 1) {
      const la = (G.lat0 + (j + (q + 0.5) / SUB) * G.cell) * D2R, lo = (G.lon0 + (i + (p + 0.5) / SUB) * G.cell) * D2R;
      const n = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)], mu = n[0], mu0 = n[0] * s[0] + n[1] * s[1];
      if (mu <= 0 || mu0 <= 0) continue;
      const dA = Math.cos(la) * (G.cell * D2R) ** 2 / (SUB * SUB);
      sum += rho * (sunSeen ? sunSeen(mu0, mu) : Mo.lommelSeeliger(mu0, mu)) * mu * dA;
    }
  }
  return Mo.phi(a) * sum / Math.PI * (MOON_MAPS.radius / d) ** 2;
}
const lawRatio = (a, d = 384400) => 10 ** (-0.4 * (5 * Math.log10(d / AU) + 0.21 + 0.026 * a + 4e-9 * a ** 4 + 26.74));
ok('the light law over the near side\'s albedo gives the clockwork\'s magnitude law at every phase, and the waxing Moon is brighter than the waning', () => {
  const rows = [];
  for (const a of [0, 30, 60, 90, 120, 150]) {
    const e = discLight(a, 1), w = discLight(a, -1), law = lawRatio(a);
    const mean = -2.5 * Math.log10((e + w) / 2 / law), asym = -2.5 * Math.log10(e / w);
    assert.ok(Math.abs(mean) < 0.02, `at ${a} degrees the mean of waxing and waning is ${mean.toFixed(3)} mag from the law`);
    rows.push({ a, mean, asym });
  }
  const q = rows.find((r) => r.a === 90);
  within(-q.asym, 0.1, 0.25, 'the waxing quarter brighter than the waning (published: about a fifth)');
  // the clockwork's own: the full Moon's light at the mean distance through the law, and magLux of its magnitude
  near(discLight(0, 1) * sunIlluminance(AU), magLux(5 * Math.log10(384400 / AU) + 0.21), 0.01 * magLux(5 * Math.log10(384400 / AU) + 0.21), 'lux at full');
  measured.push(`the law over the near side's albedo (2 degree cells): the mean of the waxing and the waning Moon within ${Math.max(...rows.map((r) => Math.abs(r.mean))).toFixed(3)} mag of the magnitude law at 0, 30, 60, 90, 120 and 150 degrees; the waxing Moon brighter by ${rows.filter((r) => r.a > 0).map((r) => `${(-r.asym).toFixed(3)} (${r.a})`).join(', ')} mag (the maps' own: the waning half holds Oceanus Procellarum)`);
});

ok('the earthshine: the Earth\'s light at the Moon from the clockwork\'s magnitude law, a ten-thousandth of the Sun\'s, bluer; beside a 3-day crescent as seen, some 1:1,500', () => {
  // a full Earth at the Moon's mean distance: about 43 times a full Moon on the Earth (Agrawal 2016, as Wikipedia gives it: up to 55)
  const full = Mo.earthLux(AU, 384400, 0), fullMoon = magLux(5 * Math.log10(384400 / AU) + 0.21);
  within(full / fullMoon, 35, 60, 'a full Earth over a full Moon');
  // a 3-day crescent (12 November 2026, 09:00 UTC, the crescent 20 degrees up at dusk)
  const ms = Date.parse('2026-11-12T09:00:00Z'), L = D.at(ms, 2), F = MF.at(ms, L, LAT, LON);
  within(F.alpha, 140, 150, 'the Moon\'s phase angle'); within(F.earthPhase, 30, 40, 'the Earth\'s, seen from the Moon');
  const ratio = F.earthLux / F.sunLux;
  // published: earthlight at the Moon is about 0.01% of direct sunlight (0.15 W/m2 against 1,361: G. Glenar et al., Icarus
  // 2019, as Wikipedia gives it); the test holds the brief's factor of 1.5 round it
  within(ratio, 1e-4 / 1.5, 1e-4 * 1.5, 'the Earth\'s light over the Sun\'s, at the Moon');
  within(F.alphaEarth, 0, 1.2, 'the earthlit face is seen almost back along the light: the opposition surge is in it');
  // as seen: the earthlit face's mean against the crescent's brightest tenth (the bright limb), both of the near side's
  // mean albedo through the law on the fixture's cells
  const lit = [], sunAt = F.alpha * D2R;
  for (let j = 0; j < GN; j += 1) for (let i = 0; i < GM; i += 1) {
    const la = (G.lat0 + (j + 0.5) * G.cell) * D2R, lo = (G.lon0 + (i + 0.5) * G.cell) * D2R, mu = Math.cos(la) * Math.cos(lo), mu0 = Math.cos(la) * Math.cos(lo - sunAt);
    if (mu > 0 && mu0 > 0) lit.push({ L: Mo.moonLuminance(F.sunLux, G.rho[j][i] * G.scale, F.alpha, mu0, mu), w: Math.cos(la) * mu });
  }
  lit.sort((a, b) => a.L - b.L); const tot = lit.reduce((s, x) => s + x.w, 0); let acc = 0, limb = 0;
  for (const x of lit) { acc += x.w; if (acc >= 0.9 * tot) { limb = x.L; break; } }
  const seen = F.earthMean / limb;
  within(1 / seen, 800, 3000, 'the crescent\'s bright limb over the ashen light, as seen');
  const c = Mo.EARTH_COLOUR; assert.ok(c[2] > c[1] && c[1] > c[0], 'earthlight is bluer than sunlight'); near(luminance(c), 1, 1e-9);
  measured.push(`the earthshine: a full Earth at the Moon's mean distance gives ${sig(full)} lux (the clockwork's magnitude law for the Earth), ${(full / fullMoon).toFixed(0)} times a full Moon on the Earth; on 12 November 2026 at 09:00 UTC (a 3-day crescent, phase angle ${F.alpha.toFixed(1)} degrees, the Earth ${F.earthPhase.toFixed(1)} degrees from full as the Moon sees it) ${sig(F.earthLux)} lux against the Sun's ${Math.round(F.sunLux).toLocaleString('en-US')}: ${sig(ratio)} of it (published: 0.01%); seen from the island the ashen light (${sig(F.earthMean)} cd/m2 above the air) is 1:${Math.round(1 / seen).toLocaleString('en-US')} of the crescent's bright limb (its brightest tenth, ${Math.round(limb)} cd/m2): seen almost back along the Earth's light it has the opposition surge (PHI ${F.phiEarth.toFixed(3)}), and the crescent is seen at ${F.alpha.toFixed(0)} degrees (PHI ${F.phiSun.toFixed(3)}); earthlight's colour ${c.map((x) => x.toFixed(2)).join(', ')} (B-V 0.44)`);
});

// ------------------------------------------------------------------------------------------------- the eye
ok('the eye looking at the Moon: Stevens\' cube root over the adapted level, the face in proportion in its own frame, its brightest tenth where the curve puts it', () => {
  const k = 0.035;
  near(Mo.adaptedLight(0.02, k), 0.02, 1e-15, 'under the adapted level nothing changes'); near(Mo.adaptedLight(k, k), k, 1e-15);
  near(Mo.adaptedLight(8 * k, k), 2 * k, 1e-12, 'eight times the light, twice as bright');
  assert.equal(Mo.adaptedLight(5, 0), 5, 'no adapted level, nothing done');
  near(Mo.linearShare(0.2), 0, 1e-12); near(Mo.linearShare(0.7), 1, 1e-12); within(Mo.linearShare(0.45), 0.4, 0.6, 'half way');
  // the full Moon at midnight on 24 November as the GPU found the eye (adapted to 0.0354 cd/m2, exposure 1.058), its
  // face 4,644 cd/m2 above the air, 0.712 of it through: its mean scene value, its brightest tenth, a mare and a highland
  const adapted = 0.03545, exposure = 1.0581, kk = exposure * adapted, xs = exposure * 0.7124 * 4644, X = Mo.adaptedLight(xs, kk), s = Mo.faceScale(X);
  within(X, 1.4, 2.0, 'the face\'s mean, once adapted');
  const brightest = s * MOON_MAPS.bright * X, meanShown = s * X, mare = s * X * 0.07 / luminance(MOON_MAPS.rhoMean), highland = s * X * 0.16 / luminance(MOON_MAPS.rhoMean);
  near(brightest, shown(MOON_MAPS.bright * X), 1e-12, 'its brightest tenth where the curve puts it');
  within(highland / mare, 2.2, 2.4, 'the maria at their measured share of the highlands');
  const enc = (y) => Math.round(255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055));
  measured.push(`the eye looking at the full Moon at midnight on 24 November (adapted to ${adapted} cd/m2, as the GPU's meter read): its face's mean, a scene value of ${sig(xs)}, is seen at ${X.toFixed(2)} (the cube root over the adapted level's own ${sig(kk)}), and shown at ${(meanShown * 100).toFixed(0)}% of white, its brightest tenth at ${(brightest * 100).toFixed(0)}%, a mare of albedo 0.07 at ${(mare * 100).toFixed(0)}% and a highland of 0.16 at ${(highland * 100).toFixed(0)}% (sRGB ${enc(mare)} and ${enc(highland)})`);
});

// ------------------------------------------------------------------------------------------------- how it is written
ok('the GPU reads the same numbers: the Moon\'s chunk is written from the constants, and sky.js draws with it', () => {
  const g = Mo.MOON_GLSL;
  assert.ok(!/NaN|undefined|Infinity/.test(g), 'no number failed to print');
  for (const n of [MOON_MAPS.RHO_MAX, MOON_MAPS.radius]) assert.ok(g.includes(Number(n).toPrecision(9).replace(/^(\d+)$/, '$1.0')), 'the constant ' + n);
  for (const fn of ['moonUV', 'moonHeight', 'moonSunSeen', 'moonLight']) assert.ok(new RegExp(`\\b(vec2|float|void) ${fn}\\(`).test(g), fn);
  for (const m of g.matchAll(/const float \w+ = ([^;]+);/g)) assert.match(m[1], /^-?\d+\.\d*(e[-+]?\d+)?$|^-?\d*\.\d+(e[-+]?\d+)?$/, 'a float: ' + m[0]);
  near(Mo.marchGrowth(Mo.MARCH.steps) ** (Mo.MARCH.steps - 1) * Mo.MARCH.from, Mo.MARCH.to, 1e-9, 'the shadow march reaches 300 km');
  const s = read('src/game/sky.js');
  assert.match(s, /from '\.\/solar\/moon\.js'/);
  assert.match(s, /new URL\('\.\/solar\/moon-albedo\.jpg', import\.meta\.url\)/, 'the albedo is fetched by the sky itself'); assert.match(s, /new URL\('\.\/solar\/moon-relief\.png', import\.meta\.url\)/, 'and the relief');
  assert.match(s, /t\.colorSpace = srgb \? THREE\.SRGBColorSpace : THREE\.NoColorSpace/, 'the albedo filtered in light, the relief as its bytes are');
  assert.ok(!/uMoonDisc|THE MOON, for now a plain disc/.test(s), 'the plain disc is gone');
  // near the Moon a star is put out by its glare as light, whatever the eye makes of the glare itself
  assert.match(s, /float B = dot\(behind \+ skyVeilsLight\(d, true\), N_LUMA\)/);
});

ok('no page and no three in the Moon\'s numbers; they ask no clock; only sky.js reads them, behind the switch', () => {
  for (const f of ['moon.js', 'moonmaps.js']) {
    const code = read('src/game/solar/' + f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/from 'three'|document\.|window\./.test(code), 'no page and no three in ' + f);
    assert.ok(!/Date\.now\(|Math\.random\(|new Date\(|performance\.now\(/.test(code), f + ' asks no clock');
  }
  assert.ok(!/^\s*import\b/m.test(read('src/game/solar/moonmaps.js')), 'moonmaps.js imports nothing');
  const view = read('src/game/view.js'), island = read('src/game/island/island.js');
  for (const [name, text] of [['view.js', view], ['island.js', island]]) assert.ok(!/moon(maps)?\.js|moon-albedo|moon-relief/.test(text.replace(/^\s*\/\/.*$/gm, '')), name + ' reads none of the Moon\'s files');
  const n = read('src/game/solar/moon.js');
  for (const src of ['Mallama', 'Thejll', 'Stevens', 'Lommel-Seeliger', 'LOLA']) assert.ok(n.includes(src), 'the source is named: ' + src);
  assert.match(MOON_CREDIT, /NASA's Scientific Visualization Studio, CGI Moon Kit \(svs\.gsfc\.nasa\.gov\/4720\)/); assert.match(MOON_CREDIT, /NASA\/GSFC\/Arizona State University/);
  assert.match(read('package.json'), /node test\/night\.test\.mjs && node test\/moon\.test\.mjs"/);
});

// `node test/moon.test.mjs --measured` prints only the lines measured so far, for writing them into SOLAR.md
if (process.argv.includes('--measured')) { for (const line of measured) console.log(line); process.exit(0); }

ok('SOLAR.md, GAME.md and the README say what was built, with the credit, in the numbers these checks just measured', () => {
  const md = read('SOLAR.md'), game = read('GAME.md'), readme = read('README.md');
  assert.match(md, /## Step 2, third part: the Moon \(22 November 2026\)/);
  for (const part of ['NASA\'s Scientific Visualization Studio, CGI Moon Kit', 'LOLA', 'Lommel-Seeliger', 'Stevens', 'Thejll', 'Mallama', '### What is approximated in the Moon', 'moon-maps.py']) assert.ok(md.includes(part), 'SOLAR.md says: ' + part);
  for (const line of measured) assert.ok(md.includes(line[0].toUpperCase() + line.slice(1)), 'SOLAR.md is behind the measurement: ' + line);
  assert.match(game, /### The true sky over the island, its third part: the Moon \(22 November 2026\)/);
  for (const text of [game, readme]) assert.ok(text.includes('CGI Moon Kit'), 'the credit');
  assert.match(readme, /- \*\*2026-11-22\*\* \(latest\) — \*\*The true sky over the island, its third part: the Moon/);
  assert.ok(readme.indexOf('its third part: the Moon') < readme.indexOf('its second part: the night'), 'newest first');
});

console.log('\n  what was measured (SOLAR.md keeps these):');
for (const line of measured) console.log('    ' + line);
console.log(`\n${passed} checks passed.`);
