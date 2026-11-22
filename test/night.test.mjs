// THE TRUE SKY, ITS SECOND PART: THE NIGHT (src/game/solar/night.js, stars.js, milkyway.js, daylight.js; src/game/sky.js
// draws it; SOLAR.md "Step 2, second part"). Colin, 22 November 2026: "the ultimate goal is the most realistic game
// ever made"; "i would FAR prefer quality over quantity".
//
// What is pinned here is what can be checked without a GPU, against published measurements and the IAU's own
// library:
//
//   - one photometric zero for everything, the Sun's;
//   - the catalogue (the Yale Bright Star Catalogue), and where its stars stand against ERFA (the IAU's SOFA);
//   - the Milky Way's texture: its file, its encoding, where a direction falls in it;
//   - the zodiacal light (Leinert et al.'s Table 16), the airglow (their Table 13), the air's scattering of both;
//   - a moonless midnight over the island: the zenith's luminance and the light on level ground;
//   - the eye: Schaefer's thresholds, the stars coming out one by one, the Purkinje shift, twinkling;
//   - the Moon's light and the key light;
//   - that the GPU reads the same numbers, and that it is all behind the switch.
//
// The numbers these checks measure are printed at the end, and are the lines in SOLAR.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as N from '../src/game/solar/night.js';
import { STARS, STAR_FIELDS } from '../src/game/solar/stars.js';
import { CUBE, MAP, MAP_CELL, TINT, CREDIT } from '../src/game/solar/milkyway.js';
import { createDaylight } from '../src/game/solar/daylight.js';
import { sunIlluminance, luminance, transmittance, AIR } from '../src/game/solar/air.js';
import { sky, AU } from '../src/game/solar/ephemeris.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} ± ${eps}`);
const within = (a, lo, hi, msg) => assert.ok(a >= lo && a <= hi, `${msg}: ${a} is not in ${lo} .. ${hi}`);
const D2R = Math.PI / 180, LAT = -31.5503, LON = 159.0761;      // the island (src/game/island/lordhowe-shape.js)
const measured = [];
const sig = (x, n = 3) => (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6 ? Number(x).toExponential(n - 1).replace(/\.?0+e/, 'e').replace('e+', 'e') : String(Number(Number(x).toPrecision(n))));
const mag = (cdm2) => 27.78 - 2.5 * Math.log10(cdm2 / N.S10);      // V mag per square arcsecond, on the game's zero
const DEC15 = Date.UTC(2026, 11, 15, 13, 0, 0), JUL15 = Date.UTC(2026, 6, 15, 11, 42, 0);      // midnight on 15 December (UTC+11); 22:12 on 15 July (UTC+10:30)

// ------------------------------------------------------------------------------------------------- the zero
ok('one photometric zero for everything: the Sun\'s own (air.js and the clockwork)', () => {
  near(N.E0, sunIlluminance(AU) * 10 ** (-0.4 * 26.74), 1e-18); within(N.E0, 2.68e-6, 2.69e-6, 'lux from a light of V = 0');
  near(N.magLux(-26.74), sunIlluminance(AU), 1e-6, 'the Sun at its magnitude is the Sun');
  near(N.S10, N.E0 * 1e-4 / (D2R * D2R), 1e-20); within(N.S10, 8.80e-7, 8.82e-7, 'cd/m2 of one S10');
  within(N.magLux(-12.7), 0.3, 0.35, 'a full Moon above the air, lux');
  // 22 V mag/arcsec2 (a dark sky) is 205 S10 (Leinert et al.'s own figure, section 2)
  near(10 ** ((27.78 - 22) / 2.5), 205, 1, 'S10 of 22 mag/arcsec2');
  measured.push(`one zero: a light of V = 0 gives ${sig(N.E0, 4)} lux above the air, one S10 is ${sig(N.S10, 3)} cd/m2, a full Moon (V -12.7) ${sig(N.magLux(-12.7))} lux`);
});

// ------------------------------------------------------------------------------------------------- the catalogue
ok('the catalogue: every star of the Yale Bright Star Catalogue, brightest first, made by scripts/solar/stars.mjs', () => {
  assert.equal(STAR_FIELDS, 7); assert.equal(STARS.length % 7, 0);
  const n = STARS.length / 7; assert.equal(n, 9096, 'stars');
  assert.deepEqual(STARS.slice(0, 7), [2491, 101.28708, -16.71611, -553, -1205, -1.46, 0], 'Sirius first');
  assert.equal(STARS[7], 2326, 'Canopus second');
  let was = -Infinity, lit = 0;
  for (let k = 0; k < STARS.length; k += 7) {
    for (let j = 0; j < 7; j += 1) assert.ok(Number.isFinite(STARS[k + j]), 'a number: star ' + STARS[k]);
    within(STARS[k + 1], 0, 360, 'RA'); within(STARS[k + 2], -90, 90, 'Dec'); assert.ok(STARS[k + 5] >= was, 'brightest first'); was = STARS[k + 5];
    if (STARS[k + 5] <= 6.5) lit += 1;
  }
  const js = read('src/game/solar/stars.js'), gen = read('scripts/solar/stars.mjs');
  assert.match(js, /GENERATED: do not edit by hand/); assert.match(js, /Hoffleit and W\. H\. Warren Jr\., The Bright Star Catalogue, 5th revised edition/); assert.match(js, /CDS catalogue V\/50/); assert.match(js, /sha256 69797549cc1605aa/);
  // the generator writes this very header (the file is its output, byte for byte from the catalogue named there)
  for (const line of ['THE STARS: every star the eye can see, from the Yale Bright Star Catalogue', 'Seven numbers a star: HR (the catalogue\'s number)', 'export const STAR_FIELDS = 7;']) { assert.ok(gen.includes(line.replace(/'/g, "\\'")) || gen.includes(line), 'the generator writes: ' + line); assert.ok(js.includes(line), 'the file says: ' + line); }
  measured.push(`the catalogue: ${n.toLocaleString('en-US')} stars, ${lit.toLocaleString('en-US')} of them V 6.5 or brighter; all of them together V ${(-2.5 * Math.log10(STARS.filter((_, i) => i % 7 === 5).reduce((s, v) => s + 10 ** (-0.4 * v), 0))).toFixed(2)}`);
});

ok('the stars stand where ERFA puts them: Sirius, Canopus, Acrux and Achernar over the island, within an arcsecond', () => {
  const fx = JSON.parse(read('test/fixtures/solar/stars.json'));
  assert.equal(fx.site.lat, LAT); assert.equal(fx.site.lon, LON); assert.equal(fx.dut1, 0);
  let worst = 0, worstR = 0, up = 0, noPm = 0, noAb = 0;
  for (const p of fx.places) {
    const s = fx.stars[p.hr], star = [p.hr, s.ra, s.dec, s.pmra, s.pmde], ms = Date.parse(p.utc);
    // the fixture's stars are the catalogue's own
    const k = STARS.findIndex((v, i) => i % 7 === 0 && v === p.hr); assert.deepEqual(STARS.slice(k + 1, k + 5), [s.ra, s.dec, s.pmra, s.pmde]);
    if (p.alt <= 0) continue;
    up += 1;
    const a = N.starPlace(star, LAT, LON, ms, {}, false), b = N.starPlace(star, LAT, LON, ms, {}, true);
    const err = (q) => Math.hypot((q.alt - p.alt) * 3600, (((q.az - p.az + 540) % 360) - 180) * 3600 * Math.cos(p.alt * D2R));
    worst = Math.max(worst, err(a));
    if (p.alt > 10) worstR = Math.max(worstR, Math.abs(b.alt - p.altAir) * 3600);
    // without the proper motion, or without the eye's motion (aberration), it would not be so
    noPm = Math.max(noPm, err(N.starPlace([p.hr, s.ra, s.dec, 0, 0], LAT, LON, ms, {}, false)));
  }
  assert.ok(up >= 40, 'enough of them above the horizon: ' + up);
  assert.ok(worst < 1, `the worst of ${up} places is ${worst} arcsec`);
  assert.ok(worstR < 10, `with the air's lift, above 10 degrees: ${worstR} arcsec (the clockwork's Saemundsson against ERFA's own model)`);
  assert.ok(noPm > 20, 'Sirius has moved ' + noPm + ' arcsec since 2000');
  // aberration: the Earth's own motion round the Sun leans every star by up to 20.5 arcsec (the island's turning by 0.3 more)
  noAb = Math.hypot(...N.aberration(LAT, LON, Date.parse(fx.places[0].utc), new Array(9).fill(0))) * 206265; within(noAb, 19, 22, 'the yearly aberration, arcsec');
  measured.push(`star places against ERFA (atco13, IAU 2006/2000A), ${up} places of Sirius, Canopus, Acrux and Achernar above the horizon on four nights: worst ${worst.toFixed(3)} arcsec; with the air's lift above 10 degrees, ${worstR.toFixed(1)} arcsec (two models of refraction); Sirius' proper motion since 2000, ${noPm.toFixed(0)} arcsec; the Earth's motion, ${noAb.toFixed(1)} arcsec`);
});

// ------------------------------------------------------------------------------------------------- the Milky Way
ok('the Milky Way\'s texture: its file is the one measured, a texel decodes to its light, and a direction falls where it should', () => {
  const fx = JSON.parse(read('test/fixtures/solar/milkyway.json')), buf = readFileSync(join(ROOT, 'src/game/solar/milkyway-cube.jpg'));
  const sha = createHash('sha256').update(buf).digest('hex');
  assert.equal(sha, fx.sha256, 'the texture is the one the fixture was read from'); assert.equal(sha, CUBE.sha256, 'and the one milkyway.js describes');
  assert.equal(CUBE.N, fx.N); assert.equal(CUBE.G, fx.G); assert.equal(CUBE.C0, fx.C0); assert.equal(CUBE.LN, fx.LN);
  assert.deepEqual(fx.size, [3 * (CUBE.N + 2 * CUBE.G), 2 * (CUBE.N + 2 * CUBE.G)], 'three faces across, two down, each with its gutter');
  assert.ok(buf.length < 450e3, 'small: ' + buf.length);
  for (const t of fx.texels) {
    const c = N.cubeTexel(t.direction);
    assert.equal(c.face, t.face, 'the face'); near(c.x, t.x + 0.5, 1e-5, 'across'); near(c.y, t.y + 0.5, 1e-5, 'down');
    for (let k = 0; k < 3; k += 1) near(N.decodeS10(t.bytes[k]), t.S10[k], 1e-3, 'decoded');
  }
  // the brightest of it is the star clouds of Sagittarius, near the galactic centre
  const b = fx.texels[0], Y = luminance(b.S10);
  within(b.ra, 265, 273, 'the brightest texel\'s RA'); within(b.dec, -32, -26, 'its Dec'); within(Y, 1000, 1500, 'its S10');
  // the coarse map is the same light: every cell positive, the galactic poles faint, the plane bright
  assert.equal(MAP.length, (360 / MAP_CELL) * (180 / MAP_CELL)); for (const v of MAP) assert.ok(v > 0);
  within(N.milkyWay(192.86, 27.13), 8, 40, 'north galactic pole, S10'); within(N.milkyWay(266.4, -28.9), 200, 800, 'the galactic centre\'s cell');
  within(TINT[0] / TINT[2], 1.1, 1.4, 'its light, warmer than sunlight (red over blue)');
  assert.match(CREDIT, /NASA\/Goddard Space Flight Center Scientific Visualization Studio/); assert.match(CREDIT, /ESA\/Gaia\/DPAC/);
  measured.push(`the Milky Way's texture: ${(buf.length / 1024).toFixed(0)} KB, six faces of ${CUBE.N} texels; its brightest texel (RA ${b.ra.toFixed(1)}, Dec ${b.dec.toFixed(1)}) decodes to ${Y.toFixed(0)} S10, ${sig(Y * N.S10)} cd/m2 (${mag(Y * N.S10).toFixed(1)} V mag/arcsec2); the north galactic pole's cell ${N.milkyWay(192.86, 27.13).toFixed(0)} S10`);
});

// ------------------------------------------------------------------------------------------------- the glow
ok('the zodiacal light is Leinert et al.\'s Table 16: 60 S10 at the ecliptic pole, the Gegenschein opposite the Sun, more toward it', () => {
  const T = N.ZODIACAL.toV;
  near(N.zodiacal(0, 90), 60 * T, 1e-9, 'the pole'); near(N.zodiacal(90, 0), 202 * T, 1e-9, 'a table value'); near(N.zodiacal(45, 30), 195 * T, 1e-9);
  near(N.zodiacal(-90, 0), N.zodiacal(90, 0), 1e-9, 'either side of the Sun'); near(N.zodiacal(120, -25), N.zodiacal(120, 25), 1e-9, 'either side of the ecliptic'); near(N.zodiacal(270, 0), N.zodiacal(90, 0), 1e-9);
  assert.ok(N.zodiacal(180, 0) > N.zodiacal(150, 0) * 1.2, 'the Gegenschein');
  let was = Infinity; for (const l of [0, 5, 10, 20, 40, 60, 90, 120, 135]) { const v = N.zodiacal(l, 0); assert.ok(v < was, 'fainter away from the Sun, at ' + l); was = v; }
  // the blanks near the Sun go on rising as their rows do, and are finite
  for (const row of N.ZODIACAL.table) for (const v of row) assert.ok(Number.isFinite(v) && v > 0 && v <= 1e5);
  assert.ok(N.zodiacal(0, 10) > N.zodiacal(0, 15) && N.zodiacal(0, 0) > N.zodiacal(0, 5), 'brighter toward the Sun');
  // the GPU's even grid is the same at its nodes
  const g = N.zodiacalGrid(); for (const [i, j] of [[0, 0], [18, 0], [36, 0], [6, 3], [12, 18]]) near(g[j * N.ZL_GRID.w + i], N.zodiacal(i * 5, j * 5), N.zodiacal(i * 5, j * 5) * 1e-6);
  const c = N.ZODIACAL.colour; assert.ok(c[0] > c[1] && c[1] > c[2], 'a little redder than sunlight');
  measured.push(`the zodiacal light (V): ${(60 * T).toFixed(1)} S10 at the ecliptic pole, ${N.zodiacal(90, 0).toFixed(0)} on the ecliptic 90 degrees from the Sun, ${N.zodiacal(180, 0).toFixed(0)} opposite it (the Gegenschein), ${N.zodiacal(30, 0).toFixed(0)} 30 degrees from it`);
});

ok('the airglow\'s brightness and colour come out of Leinert et al.\'s Table 13, and it grows toward the horizon as van Rhijn has it', () => {
  const Y = N.AIRGLOW.zenith, s10 = Y / N.S10, c = N.AIRGLOW.colour;
  within(s10, 120, 160, 'S10 at the zenith (Leinert: about 150 in V; Schaefer\'s night sky at the zenith above the air, 90 nL in all)');
  assert.ok(c[1] > c[0] && c[0] > c[2], 'green over red over blue');
  near(luminance(c), 1, 1e-9);
  near(N.vanRhijn(1), 1, 1e-12); within(N.vanRhijn(0), 5.5, 6.5, 'edge-on, for a layer 90 km up'); near(N.vanRhijn(Math.cos(80 * D2R)), 1 / Math.sqrt(1 - (6371.008 / 6461.008) ** 2 * Math.sin(80 * D2R) ** 2), 1e-3);
  measured.push(`the airglow from Leinert's Table 13 lines: ${sig(Y)} cd/m2 at the zenith, ${s10.toFixed(0)} S10, colour ${c.map((x) => x.toFixed(2)).join(', ')} (red, green, blue over its luminance); ${N.vanRhijn(0).toFixed(1)} times brighter edge-on`);
});

ok('the air\'s scattering of the night\'s glow: a share of it, more toward the horizon, and never more than comes', () => {
  const z = N.scatterAt(1), h = N.scatterAt(0.1), e = N.scatterAt(0);
  for (let c = 0; c < 3; c += 1) { within(z[c], 0.05, 0.2, 'at the zenith, colour ' + c); assert.ok(h[c] > z[c] * 2, 'more toward the horizon'); assert.ok(e[c] < 0.5, 'never more than half the glow'); }
  assert.ok(z[2] > z[1] && z[1] > z[0], 'bluer: the clear air scatters blue most');
  const S = N.glowScatter(); within(S.multiple[1], 1.15, 1.3, 'Leinert\'s factor for scattering more than once, at the green\'s Rayleigh depth');
  measured.push(`the air scatters the night's glow toward the eye: ${z.map((x) => x.toFixed(3)).join(', ')} of its mean at the zenith (red, green, blue), ${h.map((x) => x.toFixed(2)).join(', ')} at 5.7 degrees`);
});

// ------------------------------------------------------------------------------------------------- a moonless night
ok('a moonless midnight over the island: a natural dark sky at the zenith, several times brighter with the Milky Way overhead, a thousandth of a lux on the ground', () => {
  const rows = [];
  for (const [label, ms] of [['15 December 2026, 00:00 (UTC+11)', DEC15], ['15 July 2026, 22:12 (UTC+10:30)', JUL15]]) {
    const night = N.createNight({ lat: LAT, lon: LON, stars: STARS }), st = night.at(ms), parts = {}, z = luminance(night.glowAt([0, 1, 0], [0, 0, 0], parts));
    const s = sky(LAT, LON, ms, {}, { ids: ['sun', 'moon'] });
    assert.ok(s.sun.alt < -18 && s.moon.alt < -4, 'night, and no Moon: ' + label);
    rows.push({ label, z, parts, level: luminance(st.level), stars: luminance(st.starsLevel) });
  }
  const [dec, jul] = rows;
  within(dec.z, 1.2e-4, 4e-4, 'the zenith on 15 December, cd/m2'); within(mag(dec.z), 21.5, 22.5, 'V mag/arcsec2');
  assert.ok(jul.z > 2 * dec.z, `with the Milky Way overhead: ${jul.z} against ${dec.z}`);
  for (const r of rows) { within(r.level, 5e-4, 2e-3, 'lux on level ground'); within(r.parts.scattered, 10, 100, 'the scattered glow at the zenith, S10 (Leinert: 10 to 100)'); within(r.stars / r.level, 0.03, 0.12, 'the stars\' share of it'); }
  for (const r of rows) measured.push(`${r.label}: the zenith ${sig(r.z)} cd/m2 (${(r.z / N.S10).toFixed(0)} S10, ${mag(r.z).toFixed(2)} V mag/arcsec2): the Milky Way ${r.parts.milkyWay.toFixed(0)} S10 (5-degree cells), the zodiacal light ${r.parts.zodiacal.toFixed(0)}, the airglow ${r.parts.airglow.toFixed(0)} (${(r.parts.through * 100).toFixed(0)}% of each through the air), scattered ${r.parts.scattered.toFixed(0)}; on level ground ${sig(r.level)} lux, ${(r.stars / r.level * 100).toFixed(0)}% of it from the catalogue's stars`);
});

ok('the stars above the horizon, and how many the eye can see', () => {
  for (const [label, ms] of [['15 December', DEC15], ['15 July', JUL15]]) {
    let up = 0, seen = 0;
    const night = N.createNight({ lat: LAT, lon: LON, stars: null }); night.at(ms);
    const lim = N.limitingMagnitude(luminance(night.glowAt([0, 1, 0])));
    for (let k = 0; k < STARS.length; k += 7) { const p = N.starPlace(STARS.slice(k, k + 5), LAT, LON, ms); if (p.alt > 0) { up += 1; if (STARS[k + 5] + 0.2 * N.airMass(p.up) - 0.2 < lim) seen += 1; } }
    within(up, 4000, 5100, 'above the horizon on ' + label);
    within(lim, 5.8, 6.9, 'the faintest seen at the zenith (the Milky Way overhead brightens the sky there)');
    measured.push(`${label}: ${up.toLocaleString('en-US')} of the catalogue's stars above the horizon; under the zenith's sky the eye's limit is V ${lim.toFixed(2)}, and about ${seen.toLocaleString('en-US')} stand over it`);
  }
});

// ------------------------------------------------------------------------------------------------- the eye
ok('the eye\'s threshold for a point: Schaefer\'s fit to Blackwell\'s measurements', () => {
  near(N.limitingMagnitude(10 ** ((27.78 - 22) / 2.5) * N.S10), 6.6, 0.05, 'a sky of 22 mag/arcsec2');
  near(N.limitingMagnitude(0.42), 3.56, 0.05, 'the end of civil twilight\'s zenith');
  near(N.limitingMagnitude(158), -0.44, 0.05, 'the zenith at sunset');
  let was = Infinity; for (const B of [1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1, 10, 100, 1e3, 1e4]) { const m = N.limitingMagnitude(B); assert.ok(m < was, 'fewer stars in a brighter sky'); was = m; }
  const at = 1500 * N.SCHAEFER.nL; near(N.limitingMagnitude(at * 0.999), N.limitingMagnitude(at * 1.001), 0.1, 'night and day meet');
  near(N.thresholdLux(1e-4), N.magLux(N.limitingMagnitude(1e-4)), 1e-18);
  measured.push(`the faintest point seen (Schaefer): V ${N.limitingMagnitude(10 ** ((27.78 - 22) / 2.5) * N.S10).toFixed(2)} under a sky of 22 mag/arcsec2, ${N.limitingMagnitude(0.42).toFixed(2)} at the end of civil twilight (0.42 cd/m2), ${N.limitingMagnitude(158).toFixed(2)} at sunset (158 cd/m2)`);
});

ok('in twilight the stars come out one by one, the brightest first: on the evening of 15 April 2026, Sirius, then Canopus', () => {
  const D = createDaylight({ lat: LAT, lon: LON }), night = N.createNight({ lat: LAT, lon: LON }), bright = [], NAMES = { 2491: 'Sirius', 2326: 'Canopus', 5459: 'Alpha Centauri', 1713: 'Rigel', 2943: 'Procyon', 2061: 'Betelgeuse', 472: 'Achernar', 5267: 'Hadar', 4730: 'Acrux', 1708: 'Capella', 1457: 'Aldebaran' };
  for (let k = 0; k < STARS.length && STARS[k + 5] < 1.5; k += 7) bright.push(STARS.slice(k, k + 7));
  const t0 = Date.UTC(2026, 3, 15, 7, 0, 0), out = {};
  for (let m = 0; m < 150; m += 1) {
    const ms = t0 + m * 60e3, L = D.at(ms, 2); night.at(ms, 0.002, null, false);
    for (const s of bright) {
      if (out[s[0]]) continue;
      const p = N.starPlace(s, LAT, LON, ms); if (p.alt < 5) continue;
      const d = [p.east, p.up, -p.north], B = luminance(D.toward(d, [0, 0, 0], 10)) + luminance(night.glowAt(d));
      if (N.magLux(s[5]) * luminance(transmittance(0.002, p.up)) >= N.thresholdLux(B)) out[s[0]] = { sun: L.alt, V: s[5], alt: p.alt };
    }
  }
  const order = Object.entries(out).sort((a, b) => b[1].sun - a[1].sun);
  assert.equal(+order[0][0], 2491, 'Sirius first'); assert.equal(+order[1][0], 2326, 'Canopus second');
  // and on: of the stars that come out more than 15 degrees up (lower, the air dims them), none comes after one more
  // than a magnitude fainter
  const high = order.filter(([, v]) => v.alt > 15); let inversions = 0, pairs = 0;
  for (let i = 0; i < high.length; i += 1) for (let j = i + 1; j < high.length; j += 1) { pairs += 1; if (high[j][1].V < high[i][1].V - 1) inversions += 1; }
  assert.ok(high.length >= 10 && inversions === 0, `${inversions} of ${pairs} pairs out of order among ${high.length}`);
  measured.push(`stars coming out on the evening of 15 April 2026 (UTC+10:30), each with the Sun's height when it does: ${order.slice(0, 8).map(([hr, v]) => `${NAMES[hr] || 'HR ' + hr} (V ${v.V}) ${v.sun.toFixed(1)}°`).join(', ')}`);
});

ok('the Purkinje shift: nothing by day; under rod vision colour goes and a blue stays, a white keeps its luminance', () => {
  const day = N.purkinje([0.3, 0.45, 0.9], 50); assert.deepEqual(day, [0.3, 0.45, 0.9], 'over 4 cd/m2 nothing changes');
  assert.deepEqual(N.purkinje([0.3, 0.45, 0.9], 1e-4, 100), [0.3, 0.45, 0.9], 'nor in a dark corner when the eye is adapted to day');
  const w = N.purkinje([1, 1, 1], 1e-4); near(luminance(w), 1, 1e-3, 'a white under rods keeps its luminance (the game\'s white, sunlight)');
  const X = 0.4124 * w[0] + 0.3576 * w[1] + 0.1805 * w[2], Y = 0.2126 * w[0] + 0.7152 * w[1] + 0.0722 * w[2], Z = 0.0193 * w[0] + 0.1192 * w[1] + 0.9505 * w[2];
  near(X / (X + Y + Z), 0.29, 1e-3); near(Y / (X + Y + Z), 0.28, 1e-3);
  const red = luminance(N.purkinje([1, 0, 0], 1e-4)), blue = luminance(N.purkinje([0, 0, 1], 1e-4));
  assert.ok(blue / red > 5 * (0.0722 / 0.2126), 'blue light seen by rods gains on red');
  near(N.rodShare(0.01), 0, 1e-12); near(N.rodShare(10 ** 0.6), 1, 1e-12); within(N.rodShare(0.1), 0.2, 0.5, 'mesopic');
  measured.push(`the Purkinje shift (Jensen et al.): rod vision under ${sig(0.01)} cd/m2, cone vision over ${sig(10 ** 0.6)}; a white under rods goes to x, y = ${N.PURKINJE.blue.join(', ')} (their paintings' mean), its luminance kept (k = ${N.PURKINJE.white.toFixed(3)}, Y over V for sunlight)`);
});

ok('twinkling: strongest low down, held under 50%; planets are drawn without it', () => {
  near(N.twinkle(1), 0.10, 1e-3, 'at the zenith'); assert.ok(N.twinkle(Math.sin(10 * D2R)) > 3 * N.twinkle(1), 'ten degrees up'); assert.ok(N.twinkle(0) <= 0.5);
  let was = 0; for (const alt of [90, 60, 30, 15, 5, 1]) { const t = N.twinkle(Math.sin(alt * D2R)); assert.ok(t >= was); was = t; }
  const sky = read('src/game/sky.js');
  assert.match(sky, /float sig = nightTwinkle\(d\.y\) \* \(1\.0 - aKind\)/, 'a planet (aKind 1) does not twinkle');
  measured.push(`twinkling (its spread in the light's logarithm): ${(N.twinkle(1) * 100).toFixed(0)}% at the zenith, ${(N.twinkle(Math.sin(30 * D2R)) * 100).toFixed(0)}% at 30 degrees, ${(N.twinkle(Math.sin(10 * D2R)) * 100).toFixed(0)}% at 10`);
});

ok('a point is shown by how many of the eye\'s thresholds it stands over the sky behind it, laid over its pixels without changing its total', () => {
  const B = 2.5e-4, lim = N.limitingMagnitude(B), at = N.pointShown(N.magLux(lim), B, 0.03);
  near(at.thresholds, 1, 1e-9, 'at the limiting magnitude, one threshold'); near(at.peak, N.POINTS.floor, 1e-12, 'shown at the screen\'s own threshold');
  const bright = N.pointShown(N.magLux(lim - 2.5), B, 0.03); near(bright.thresholds, 10, 1e-6, 'ten times brighter, ten thresholds');
  near(bright.peak, N.POINTS.floor * Math.sqrt(10), 1e-12, 'shown on the point-source power of a half');
  near(N.pointShown(N.magLux(lim + 1), B, 0.03).peak, N.POINTS.floor * 10 ** -0.4, 1e-12, 'under one threshold it fades as it is');
  // Sirius at night stands about 1,700 thresholds over the sky: white, and only just
  const sir = N.pointShown(N.magLux(-1.46) * 0.8, B, 0.03); within(sir.thresholds, 1000, 2500, 'Sirius, thresholds'); within(sir.peak, 0.7, 1.4, 'Sirius at white');
  assert.ok(N.pointShown(N.magLux(1), 1, 0.4).peak > N.pointShown(N.magLux(1), 1, 0.01).peak, 'on a brighter screen it needs more');
  // the share of a point's light on each pixel's square adds to one wherever it falls between them (so it neither
  // swims nor flickers as the eye turns)
  const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
  const k = 1 / (N.POINTS.sigma * Math.SQRT2), share = (ox, oy) => 0.25 * (erf((ox + 0.5) * k) - erf((ox - 0.5) * k)) * (erf((oy + 0.5) * k) - erf((oy - 0.5) * k));
  for (const [fx, fy] of [[0, 0], [0.5, 0.5], [0.25, 0.8], [0.9, 0.1]]) { let sum = 0; for (let y = -3; y <= 3; y += 1) for (let x = -3; x <= 3; x += 1) sum += share(x - fx, y - fy); near(sum, 1, 3e-3, 'its total at ' + fx + ', ' + fy); }
  near(share(0, 0), N.PIXEL_MIDDLE, 1e-9, 'a centred point\'s middle pixel');
  assert.match(read('src/game/solar/night.js'), /float nightPixel\(vec2 o\)/);
  measured.push(`a point at the eye's limit is shown ${(N.POINTS.floor * 100).toFixed(1)}% of white over a dark sky in its middle pixel, at ten thresholds ${Math.sqrt(10).toFixed(2)} times that (the power ${N.POINTS.power}), Sirius at night (${sir.thresholds.toFixed(0)} thresholds) at ${(sir.peak * 100).toFixed(0)}%; its light is a Gaussian of ${N.POINTS.sigma} pixels, ${(N.PIXEL_MIDDLE * 100).toFixed(0)}% of it in the middle pixel when centred, its total the same wherever it falls`);
});

// ------------------------------------------------------------------------------------------------- the Moon
ok('the Moon\'s light: its magnitude and phase from the clockwork, warmer than sunlight, on the land and in the air; the key light is the brightest that comes straight', () => {
  const D = createDaylight({ lat: LAT, lon: LON, stars: null });
  const full = Date.UTC(2026, 10, 24, 13, 0, 0), L = D.at(full, 2), M = L.moon;
  const kept = { alt: M.alt, V: M.magnitude, lux: M.lux, direct: luminance(M.direct), ground: luminance(L.ground), sky: luminance(M.sky), colour: M.colour.slice() };      // the record is the light's own, and moves with the next instant asked
  assert.ok(M.phase > 0.99, 'full: ' + M.phase); within(M.magnitude, -12.9, -12.6, 'V'); within(M.lux, 0.3, 0.37, 'lux above the air');
  assert.equal(L.key.id, 'moon', 'with the Sun down and the Moon up, the Moon is the key');
  within(luminance(M.direct), 0.2, 0.3, 'lux on a plane facing it, through the air'); within(luminance(L.ground), 0.12, 0.2, 'lux on level ground');
  within(luminance(M.sky) / luminance(M.direct), 0.05, 0.25, 'its sky\'s light on level ground, against its own');
  assert.ok(M.colour[0] > M.colour[1] && M.colour[1] > M.colour[2], 'moonlight is redder than sunlight');
  const s = sky(LAT, LON, full, {}, { ids: ['moon'], height: 2 }).moon; near(M.alt, s.alt, 1e-9); near(M.radius * 2, s.diameter, 1e-9);
  // by day the Sun is the key; on a moonless night a planet is, when one is up
  assert.equal(D.at(Date.UTC(2026, 10, 21, 1, 9, 25), 2).key.id, 'sun');
  const L2 = D.at(DEC15, 2); assert.ok(['jupiter', 'venus', 'mars', 'saturn', 'mercury'].includes(L2.key.id), 'a planet: ' + L2.key.id);
  within(luminance(L2.ground), 8e-4, 1.5e-3, 'lux on level ground, moonless');
  measured.push(`the full Moon of 24 November 2026, 13:00 UTC (${kept.alt.toFixed(1)} degrees up): V ${kept.V.toFixed(2)}, ${kept.lux.toFixed(3)} lux above the air, ${kept.direct.toFixed(3)} facing it through the air, ${kept.ground.toFixed(3)} on level ground (its sky ${kept.sky.toFixed(4)} of that); colour ${kept.colour.map((x) => x.toFixed(2)).join(', ')}`);
});

// ------------------------------------------------------------------------------------------------- how it is written
ok('the GPU reads the same numbers: the night\'s chunks are written from the constants', () => {
  const g = N.NIGHT_GLSL + N.NIGHT_EYE_GLSL;
  assert.ok(!/NaN|undefined|Infinity/.test(g), 'no number failed to print');
  for (const n of [N.S10, CUBE.C0, CUBE.LN, N.PURKINJE.white, N.POINTS.floor, N.POINTS.weber, N.PIXEL_MIDDLE]) assert.ok(g.includes(Number(n).toPrecision(9).replace(/^(\d+)$/, '$1.0')), 'the constant ' + n);
  for (const c of N.AIRGLOW.colour) assert.ok(g.includes(Number(c * N.AIRGLOW.zenith).toPrecision(9)), 'the airglow');
  for (const fn of ['nightMW', 'nightZL', 'nightGlow', 'nightBack', 'nightFront', 'nightTrue', 'nightScat', 'nightPurkinje', 'nightThreshold', 'nightPixel', 'nightTwinkle']) assert.ok(new RegExp(`\\b(vec3|float) ${fn}\\(`).test(g), fn);
  for (const m of g.matchAll(/const float \w+ = ([^;]+);/g)) assert.match(m[1], /^-?\d+\.\d*(e[-+]?\d+)?$|^-?\d*\.\d+(e[-+]?\d+)?$/, 'a float: ' + m[0]);
  const sky = read('src/game/sky.js');
  assert.match(sky, /from '\.\/solar\/night\.js'/); assert.match(sky, /from '\.\/solar\/stars\.js'/);
  for (const part of ['DOME_FRAG', 'AP_FRAG', 'WRAP_FRAG', 'SKY_OVER_GLSL', 'STAR_VERT']) assert.ok(new RegExp(`const ${part} = \`[^]*?\\$\\{NIGHT_GLSL\\}`).test(sky), part + ' reads the night');
  assert.match(sky, /new URL\('\.\/solar\/milkyway-cube\.jpg', import\.meta\.url\)/, 'the texture is fetched by the sky itself');
  assert.match(sky, /colorSpaceConversion: 'none'/, 'and its bytes are read as they are');
});

ok('no page and no three in the night\'s numbers; they ask no clock; the catalogue and the map are data', () => {
  for (const f of ['night.js', 'stars.js', 'milkyway.js', 'daylight.js']) {
    const code = read('src/game/solar/' + f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/from 'three'|document\.|window\./.test(code), 'no page and no three in ' + f);
    assert.ok(!/Date\.now\(|Math\.random\(|new Date\(|performance\.now\(/.test(code), f + ' asks no clock');
  }
  for (const f of ['stars.js', 'milkyway.js']) assert.ok(!/^\s*import\b/m.test(read('src/game/solar/' + f)), f + ' imports nothing');
  const n = read('src/game/solar/night.js');
  for (const src of ['Leinert', 'Table 16', 'Table 13', 'Schaefer', 'Blackwell', 'Jensen', 'Larson', 'Ferwerda', 'Ballesteros', 'Wyman', 'van Rhijn', 'Young', 'Bennett']) assert.ok(n.includes(src), 'the source is named: ' + src);
});

ok('behind the switch: only sky.js reads the night\'s files, and only ?sky=true fetches sky.js', () => {
  const view = read('src/game/view.js'), island = read('src/game/island/island.js');
  for (const [name, text] of [['view.js', view], ['island.js', island]]) assert.ok(!/(night|stars|milkyway)\.js|milkyway-cube/.test(text.replace(/^\s*\/\/.*$/gm, '')), name + ' reads none of the night\'s files');
  assert.match(view, /if \(name === 'island' && TRUE_SKY && !SKY\) \{ try \{ SKY = await import\('\.\/sky\.js'\); \} catch/);
  for (const f of ['src/game/void.js', 'src/game/lights.js', 'src/frequencies/night.mjs', 'src/frequencies/starfield.js']) assert.ok(!/solar\/(night|stars|milkyway)/.test(read(f)), f + ' knows nothing of it');
  assert.match(read('package.json'), /node test\/sky\.test\.mjs && node test\/night\.test\.mjs"/);
});

// `node test/night.test.mjs --measured` prints only the lines measured so far, for writing them into SOLAR.md
if (process.argv.includes('--measured')) { for (const line of measured) console.log(line); process.exit(0); }

ok('SOLAR.md, GAME.md and the README say what was built, with the credits, in the numbers these checks just measured', () => {
  const md = read('SOLAR.md'), game = read('GAME.md'), readme = read('README.md');
  assert.match(md, /## Step 2, second part: the night \(22 November 2026\)/);
  for (const part of ['It is behind the switch', 'NASA/Goddard Space Flight Center Scientific Visualization Studio', 'ESA/Gaia/DPAC', 'Hoffleit', 'Warren', 'Leinert', 'Schaefer', 'Blackwell', 'Jensen', 'Ferwerda', 'ERFA', '### What is approximated at night', '### What the Moon\'s part needs from here', '&stars=light']) assert.ok(md.includes(part), 'SOLAR.md says: ' + part);
  for (const line of measured) assert.ok(md.includes(line[0].toUpperCase() + line.slice(1)), 'SOLAR.md is behind the measurement: ' + line);
  assert.match(game, /### The true sky over the island, its second part: the night \(22 November 2026\)/);
  for (const part of ['NASA', 'ESA/Gaia/DPAC', 'Yale Bright Star Catalogue']) { assert.ok(game.includes(part), 'GAME.md credits ' + part); assert.ok(readme.includes(part), 'the README credits ' + part); }
  assert.match(readme, /- \*\*2026-11-22\*\* \(later\) — \*\*The true sky over the island, its second part: the night/);
  assert.ok(readme.indexOf('its second part: the night') < readme.indexOf('its first part: the air and'), 'newest first');
});

console.log('\n  what was measured (SOLAR.md keeps these):');
for (const line of measured) console.log('    ' + line);
console.log(`\n${passed} checks passed.`);
