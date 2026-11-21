// THE CLOCKWORK (src/game/solar/, SOLAR.md): where every body of the solar system is and how it is turned, for
// any date. The first brick of what Colin asked for on 13 November 2026, "our solar system ... as accurately
// modeled to reality as possible", and on 20 November: "model the solar system as accurately as possible and
// make it explorable". And his standard, 21 November: "ultra-high quality experience rather than quantity".
//
// So what is pinned here is not that the code runs but how far it is from the sky:
//
//   - every body's place against JPL Horizons' own vectors at 40 dates drawn across 1900-2100 that no fit saw;
//   - the sky of Lord Howe Island (31.55 S, 159.08 E), the first place on the map, against Horizons' observer
//     tables: altitude and azimuth, the Moon's parallax, its phase, its bright limb, its librations, the planets'
//     magnitudes, the air's lift at the horizon, a sunrise to the minute;
//   - two things people watched: the total eclipse of 8 April 2024, on NASA's published line and second, and
//     Jupiter and Saturn a tenth of a degree apart on 21 December 2020.
//
// The numbers these checks measure are printed at the end, and are the table in SOLAR.md. The fixtures are JPL's
// answers, fetched once by scripts/solar/fixtures.mjs and kept in test/fixtures/solar/ with the questions asked.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import * as S from '../src/game/solar/ephemeris.js';
import { BODIES, ORDER, AU, C } from '../src/game/solar/bodies.js';
import { ORBITS } from '../src/game/solar/orbits.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const fixture = (f) => JSON.parse(read('test/fixtures/solar/' + f));
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} got ${a}, wanted ${b} ± ${eps}`);
const under = (a, lim, msg) => assert.ok(a <= lim, `${msg}: ${a} is over ${lim}`);

const D2R = Math.PI / 180, ASEC = 3600 / D2R;      // arcsec per radian
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], len = (a) => Math.hypot(a[0], a[1], a[2]);
const between = (a, b) => { const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; return Math.atan2(len(c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]); };      // radians
const apart = (lon1, lat1, lon2, lat2) => { const v = (l, b) => [Math.cos(b * D2R) * Math.cos(l * D2R), Math.cos(b * D2R) * Math.sin(l * D2R), Math.sin(b * D2R)]; return between(v(lon1, lat1), v(lon2, lat2)) / D2R; };      // degrees
const turn = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const fromUT = (jd) => (jd - 2440587.5) * 86400000;      // a Julian date of UT as the clock's milliseconds
const measured = [];                                     // lines for the table at the end

// ------------------------------------------------------------------------------------------------ the clock
ok('the clock: TT is UTC plus 32.184 s plus every leap second since 1972, and before that Espenak and Meeus', () => {
  near(S.deltaT(Date.UTC(2017, 0, 1)), 69.184, 1e-9, 'from 2017');
  near(S.deltaT(Date.UTC(2016, 11, 31, 23, 59, 59)), 68.184, 1e-9, 'the second before');
  near(S.deltaT(Date.UTC(1972, 0, 1)), 42.184, 1e-9, 'the first of them');
  near(S.deltaT(Date.UTC(1999, 0, 1)), 64.184, 1e-9, '1999');
  near(S.deltaT(Date.UTC(2026, 10, 21)), 69.184, 1e-9, 'today: none since 2017');
  near(S.deltaT(Date.UTC(2090, 0, 1)), 69.184, 1e-9, 'and none invented for the years to come');
  near(S.deltaT(Date.UTC(1950, 0, 1)), 29.07, 0.05, '1950');
  near(S.deltaT(Date.UTC(1900, 0, 1)), -2.79, 0.05, '1900');
  near(S.deltaT(Date.UTC(1971, 11, 31)), 42.2, 0.2, 'the two meet at 1972');
  near(S.julianTT(Date.UTC(2000, 0, 1, 11, 58, 55, 816)), 2451545, 1e-9, 'J2000.0 is 11:58:55.816 on the UTC clock');
  for (const t of [Date.UTC(1905, 5, 5), Date.UTC(1969, 6, 20, 20, 17), Date.UTC(2024, 3, 8, 18, 17, 18), Date.UTC(2099, 11, 31)]) near(S.fromTT(S.julianTT(t)), t, 0.05, 'there and back, in milliseconds');
  const t = Date.UTC(2026, 10, 21, 5, 0, 0);
  assert.deepEqual(S.position('mars', new Date(t)), S.position('mars', t), 'a Date and its milliseconds are the same instant');
});

// ------------------------------------------------------------------------------- how it is written, and what it costs
// (measured first, before the other checks have shown the engine a dozen shapes of options: this is the game's case,
// one caller asking the same questions every frame)
const LORD_HOWE = { lat: -31.55, lon: 159.08 };
ok('a small clean thing: the same answer every time, into the caller\'s arrays, with no array or object made once warm', () => {
  const t = Date.UTC(2031, 4, 4, 4, 4, 4), a = [0, 0, 0], q = [0, 0, 0, 1], k = {}, opts = { refraction: true };
  assert.equal(S.position('titan', t, a), a); assert.equal(S.relative('titan', t, a), a); assert.equal(S.velocity('titan', t, a), a); assert.equal(S.orientation('titan', t, q), q); assert.equal(S.sky(LORD_HOWE.lat, LORD_HOWE.lon, t, k, opts), k);
  const first = JSON.stringify(S.sky(LORD_HOWE.lat, LORD_HOWE.lon, t, k, opts)), rec = k.moon;
  S.sky(LORD_HOWE.lat, LORD_HOWE.lon, t + 777, k, opts); S.position('pluto', t - 5e9);
  assert.equal(JSON.stringify(S.sky(LORD_HOWE.lat, LORD_HOWE.lon, t, k, opts)), first, 'asked again after other questions: the same, to the last bit');
  assert.equal(k.moon, rec, 'and the same records, filled again');
  assert.deepEqual(Object.keys(k), ORDER.filter((id) => id !== 'earth'), 'every body but the one stood on');
  near(len(S.velocity('earth', t)), 29.8, 0.6, 'the Earth goes round at 30 km/s'); near(len(sub(S.velocity('moon', t), S.velocity('earth', t))), 1.02, 0.1, 'and the Moon round it at 1');
  near(len(sub(add(S.position('saturn', t), S.relative('titan', t)), S.position('titan', t))), 0, 1e-6, 'a moon is its planet plus its orbit');
  // warm, then count what a frame leaves behind and what it costs: the least of five rounds, so that the engine
  // compiling something in the middle of one does not count against it
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  const places = (ms) => { for (let j = 0; j < ORDER.length; j += 1) S.position(ORDER[j], ms, a); };
  const whole = (ms) => { places(ms); S.sky(LORD_HOWE.lat, LORD_HOWE.lon, ms, k, opts); S.lightTime('earth', 'mars', ms); };
  let n = 0; const round = (f, count) => { gc(); const before = process.memoryUsage().heapUsed, t0 = process.hrtime.bigint(); for (let i = 0; i < count; i += 1) f(t + (n += 1) * 16); return [Math.max(0, process.memoryUsage().heapUsed - before) / count, Number(process.hrtime.bigint() - t0) / count / 1e6]; };
  const least = (f) => { let b = Infinity, ms = Infinity; for (let r = 0; r < 5; r += 1) { const [bytes, each] = round(f, 1000); b = Math.min(b, bytes); ms = Math.min(ms, each); } return [b, ms]; };
  round(whole, 3000);
  const [, msPlaces] = least(places), [bytes, msWhole] = least(whole);
  // no array, no object: what is left is the engine's own boxed numbers, a couple for each body asked about
  under(bytes, 4000, 'bytes left on the heap by one full frame');
  under(msWhole, 5, 'milliseconds for one full update of every body and the whole sky');
  measured.push(`one frame: the place of all ${ORDER.length} bodies ${msPlaces.toFixed(3)} ms; with the whole apparent sky of ${ORDER.length - 1} from the island and one light time, ${msWhole.toFixed(3)} ms; ${Math.round(bytes)} bytes of boxed numbers left on the heap, no array and no object`);
});

// --------------------------------------------------------------------------------------- where things are
const V = fixture('vectors.json');
const tol = {      // the stated standard: degrees or arcsec from the parent, and arcsec as seen from the Earth
  planet: { sun: 0.4, earth: 0.6 }, moonOfEarth: { parent: 0.6, km: 1.5 }, dwarf: { sun: 1.0, earth: 1.0 }, moon: { deg: 0.012, earth: 0.35 },
};
ok('every body is where JPL says it is, at 40 dates across 1900-2100 that no fit ever saw', () => {
  assert.equal(V.dates.length, 40);
  assert.deepEqual(Object.keys(V.bodies).sort(), ORDER.filter((id) => id !== 'sun').sort(), 'a fixture for every body that is shipped: none goes unmeasured');
  const mine = {};
  for (const id of ORDER) mine[id] = V.dates.map((jd) => (BODIES[id].kind === 'moon' ? S.relative(id, S.fromTT(jd), [0, 0, 0]) : S.position(id, S.fromTT(jd), [0, 0, 0])));
  const helioRef = (id, k) => (BODIES[id].kind === 'moon' ? add(helioRef(BODIES[id].parent, k), V.bodies[id].p[k]) : id === 'sun' ? [0, 0, 0] : V.bodies[id].p[k]);
  const helioMine = (id, k) => (BODIES[id].kind === 'moon' ? add(helioMine(BODIES[id].parent, k), mine[id][k]) : mine[id][k]);
  for (const id of ORDER) {
    if (id === 'sun') continue;
    const b = BODIES[id]; let km = 0, ang = 0, dist = 0, seen = 0;
    for (let k = 0; k < V.dates.length; k += 1) {
      const ref = V.bodies[id].p[k], m = mine[id][k];
      km = Math.max(km, len(sub(m, ref))); ang = Math.max(ang, between(m, ref)); dist = Math.max(dist, Math.abs(len(m) - len(ref)));
      if (id !== 'earth') seen = Math.max(seen, between(sub(helioMine(id, k), helioMine('earth', k)), sub(helioRef(id, k), helioRef('earth', k))));
    }
    const arc = ang * ASEC, sky = seen * ASEC;
    if (id === 'moon') { under(arc, tol.moonOfEarth.parent, 'the Moon from the Earth, arcsec'); under(km, tol.moonOfEarth.km, 'the Moon, km'); }
    else if (b.kind === 'planet') { under(arc, tol.planet.sun, id + ' from the Sun, arcsec'); if (id !== 'earth') under(sky, tol.planet.earth, id + ' from the Earth, arcsec'); }
    else if (b.kind === 'dwarf') { under(arc, tol.dwarf.sun, id + ' from the Sun, arcsec'); under(sky, tol.dwarf.earth, id + ' from the Earth, arcsec'); }
    else { under(ang / D2R, tol.moon.deg, id + ' from its planet, degrees'); under(sky, tol.moon.earth, id + ' from the Earth, arcsec'); }
    const from = b.kind === 'moon' && id !== 'moon' ? `${(ang / D2R).toFixed(4)}°` : `${arc.toFixed(2)}"`;
    measured.push(`| ${b.name} | ${from} | ${id === 'earth' ? 'n/a' : sky.toFixed(3) + '"'} | ${km < 10 ? km.toFixed(2) : Math.round(km).toLocaleString('en-US')} | ${dist < 10 ? dist.toFixed(2) : Math.round(dist).toLocaleString('en-US')} |`);
  }
});

ok('the Sun swings about the solar system\'s centre of mass as the planets pull it', () => {
  let worst = 0, far = 0;
  V.dates.forEach((jd, k) => { const c = S.centreOfMass(S.fromTT(jd)); worst = Math.max(worst, len(sub(c, V.centre[k]))); far = Math.max(far, len(c)); });
  under(worst, 250, 'the centre of mass, km (it is the eight planets\' doing here: Pluto, the asteroids and the belt beyond Neptune are left out)');
  assert.ok(far > 600000 && far < 1600000, 'it wanders about a solar radius from the Sun\'s centre, as it should: ' + Math.round(far));
  measured.push(`centre of mass: worst ${worst.toFixed(0)} km of up to ${Math.round(far).toLocaleString('en-US')} km from the Sun's centre`);
});

ok('outside its two centuries the clockwork wears slowly, and by how much is known', () => {
  const B = V.beyond, line = [];
  for (const id of Object.keys(B.bodies)) {
    let worst = 0;
    B.dates.forEach((jd, k) => { const m = id === 'moon' ? S.relative(id, S.fromTT(jd)) : S.position(id, S.fromTT(jd)); worst = Math.max(worst, between(m, B.bodies[id][k]) * ASEC); });
    under(worst, id === 'moon' ? 12 : 6, id + ' in 1800, 1850, 2150 and 2199, arcsec');
    line.push(`${id} ${worst.toFixed(1)}"`);
  }
  measured.push('at 1800, 1850, 2150 and 2199 (outside the fitted span): ' + line.join(', '));
});

// ------------------------------------------------------------------------------------------- the light time
ok('lightTime is the time of a journey at c: light leaving now meets the body where it will be', () => {
  const t = Date.UTC(2026, 10, 21, 0, 0, 0);
  for (const [a, b] of [['earth', 'moon'], ['earth', 'sun'], ['earth', 'mars'], ['earth', 'neptune'], ['mars', 'io'], ['pluto', 'charon']]) {
    const T = S.lightTime(a, b, t), from = S.position(a, t), to = S.position(b, t + T * 1000);
    near(len(sub(to, from)) / C, T, 1e-6, `${a} to ${b}: |b(t + T) - a(t)| = c T`);
    assert.ok(Math.abs(T - S.distance(a, b, t) / C) < 1 + T * 2e-4, 'and it differs from the distance now by what the target moves meanwhile');
  }
  const moon = S.lightTime('earth', 'moon', t), sun = S.lightTime('earth', 'sun', t);
  assert.ok(moon > 1.18 && moon < 1.37, 'the Moon is a second and a quarter away: ' + moon);
  assert.ok(sun > 489 && sun < 508, 'the Sun a little over eight minutes: ' + sun);
  near(S.lightTime(S.position('earth', t), 'mars', t), S.lightTime('earth', 'mars', t), 1e-9, 'a point in space will do for either end: a ship rerouting mid-flight');
  near(S.lightTime('earth', [0, 0, 0], t), S.distance('earth', 'sun', t) / C, 1e-9, 'and a fixed point does not move');
  assert.throws(() => S.position('vulcan', t), /no body called vulcan/);
});

// --------------------------------------------------------------------------- the sky of Lord Howe Island
const O = fixture('observer.json'), LH = O.site;
const AIRLESS = { refraction: false };
// Horizons counts longitude west on bodies that turn forwards and east on the Sun, the Moon and those that turn backwards
const WEST = { mercury: 1, mars: 1, jupiter: 1, saturn: 1, neptune: 1, io: 1, titan: 1 };
ok('from Lord Howe Island every body stands where Horizons\' observer table puts it, and shows the same face', () => {
  assert.deepEqual(LH, { lon: 159.08, lat: -31.55, km: 0 });
  const out = {}, rowsOf = (id) => O.bodies[id];
  assert.equal(rowsOf('sun').length, 14);
  for (const id of Object.keys(O.bodies)) {
    const w = { place: 0, radec: 0, mag: 0, lit: 0, diam: 0, lon: 0, lat: 0, limb: 0, axis: 0, au: 0, lt: 0, elong: 0, phase: 0 }, b = BODIES[id], flat = 1 - b.radii[2] / b.radii[0];
    for (const h of rowsOf(id)) {
      const ms = fromUT(h.jd), r = S.sky(LH.lat, LH.lon, ms, out, AIRLESS)[id];
      w.place = Math.max(w.place, apart(r.az, r.alt, h.az, h.alt) * 3600); w.radec = Math.max(w.radec, apart(r.ra, r.dec, h.ra, h.dec) * 3600);
      near(Math.hypot(r.east, r.north, r.up), 1, 1e-12, 'east, north, up is a unit vector'); near(Math.asin(r.up) / D2R, r.alt, 1e-9, 'and the same direction as alt, az'); near(r.lifted, 0, 0, 'no air asked for');
      if (h.mag !== undefined && !Number.isNaN(r.magnitude)) w.mag = Math.max(w.mag, Math.abs(r.magnitude - h.mag));
      w.lit = Math.max(w.lit, Math.abs(r.phase * 100 - h.lit)); w.diam = Math.max(w.diam, Math.abs(r.diameter * 3600 - h.diam));
      if (h.subLon !== undefined) {
        w.lon = Math.max(w.lon, turn(WEST[id] ? 360 - r.subLon : r.subLon, h.subLon));
        // Horizons' latitude is planetographic (the normal to the flattened surface), ours is from the centre
        w.lat = Math.max(w.lat, Math.abs(Math.atan(Math.tan(r.subLat * D2R) / ((1 - flat) * (1 - flat))) / D2R - h.subLat));
      }
      // the bright limb means something where a phase can be seen: past 3 degrees of phase angle (never, for Uranus and beyond)
      if (h.limb !== undefined && h.phase > 3 && h.phase < 177) w.limb = Math.max(w.limb, turn(r.limb, h.limb));
      if (h.axis !== undefined) w.axis = Math.max(w.axis, turn(r.axis, h.axis));
      w.au = Math.max(w.au, Math.abs(r.distance / AU - h.au) / h.au); w.lt = Math.max(w.lt, Math.abs(r.lightTime - h.lt * 60));
      w.elong = Math.max(w.elong, Math.abs(r.elongation - h.elong)); w.phase = Math.max(w.phase, Math.abs(r.phaseAngle - h.phase));
    }
    // the place on the true equator of date does not depend on how far the Earth has turned: it is the ephemeris, the
    // light time, the Sun's bending, aberration, precession, nutation and (for the Moon) the observer's own place
    under(w.radec, id === 'moon' ? 0.5 : 0.4, id + ': right ascension and declination, arcsec');
    // altitude and azimuth also carry UT1 - UTC, which the clock cannot know (under 0.9 s, 13.5 arcsec)
    under(w.place, 15, id + ': altitude and azimuth, arcsec');
    under(w.lit, 0.02, id + ': lit fraction, percent'); under(w.diam / rowsOf(id)[0].diam, 1e-4, id + ': angular diameter, as a fraction');
    under(w.lon, 0.01, id + ': the longitude under the observer, degrees'); under(w.lat, 0.01, id + ': the latitude under the observer, degrees');
    under(w.limb, 0.1, id + ': the bright limb, degrees'); under(w.axis, 0.01, id + ': the north pole\'s position angle, degrees');
    under(w.au, 2e-6, id + ': distance, as a fraction'); under(w.lt, 0.02, id + ': light time, seconds');
    under(w.elong, 0.001, id + ': elongation, degrees'); under(w.phase, 0.02, id + ': phase angle, degrees');
    if (b.kind === 'planet' || id === 'sun' || id === 'moon') under(w.mag, id === 'mars' ? 0.12 : 0.03, id + ': apparent magnitude');      // Mars: its markings turn it by up to 0.06 mag, and that table is owed
    else assert.ok(Number.isNaN(S.sky(LH.lat, LH.lon, fromUT(rowsOf(id)[0].jd), out, AIRLESS)[id].magnitude), 'no magnitude is claimed where none has been measured');
    measured.push(`| ${b.name} | ${w.radec.toFixed(2)}" | ${w.place.toFixed(1)}" | ${Number.isNaN(S.sky(LH.lat, LH.lon, fromUT(rowsOf(id)[0].jd), out, AIRLESS)[id].magnitude) ? 'owed' : w.mag.toFixed(3)} | ${w.lit.toFixed(4)} | ${w.lon.toFixed(4)}°, ${w.lat.toFixed(4)}° | ${w.limb.toFixed(3)}° | ${w.axis.toFixed(4)}° |`);
  }
});

ok('the Moon is seen from where the observer stands: up to a degree from where the Earth\'s centre would see it', () => {
  const t = fromUT(O.bodies.moon[0].jd), here = S.sky(LH.lat, LH.lon, t, {}, AIRLESS).moon;
  const earth = S.position('earth', t), dir = S.apparent(earth, 'moon', t, [0, 0, 0, 0], S.velocity('earth', t));
  const eq = S.eclipticToEquatorial(dir), tod = S.horizonMatrix(90, 0, t);      // at the pole "up" is the celestial pole of date
  const decCentre = Math.asin(tod[6] * eq[0] + tod[7] * eq[1] + tod[8] * eq[2]) / D2R;
  const shift = Math.abs(here.dec - decCentre);
  assert.ok(shift > 0.05 && shift < 1.1, 'parallax in declination alone, degrees: ' + shift.toFixed(3));
  assert.ok(here.distance < len(sub(S.position('moon', t), earth)) + 6400 && here.distance > 356000 - 6400, 'and its distance is from the observer');
});

ok('sidereal time: Greenwich mean, apparent and local, within the second the clock cannot know (UT1 - UTC)', () => {
  let worst = 0;
  for (const h of O.bodies.sun) worst = Math.max(worst, turn(S.lst(LH.lon, fromUT(h.jd)) / D2R, h.last * 15) * 240);
  under(worst, 0.95, 'local apparent sidereal time against Horizons, seconds of time');
  near(S.gmst(Date.UTC(2000, 0, 1, 12, 0, 0)) / D2R, 280.46061837, 1e-6, 'GMST at 2000 January 1, 12h UT');
  const t = Date.UTC(2026, 10, 21, 9, 30), eqeq = (S.gast(t) - S.gmst(t)) * ASEC / 15;
  assert.ok(Math.abs(eqeq) < 1.2 && Math.abs(eqeq) > 1e-4, 'the equation of the equinoxes is nutation, under 1.2 s: ' + eqeq.toFixed(4));
  near(S.lst(15, t), (S.gast(t) + 15 * D2R) % (2 * Math.PI), 1e-12, 'local is Greenwich plus the east longitude');
  measured.push(`sidereal time at Lord Howe: worst ${worst.toFixed(3)} s from Horizons (it is UT1 - UTC, which the clock cannot know)`);
});

ok('horizonMatrix turns a star catalogue\'s J2000 directions onto the island\'s horizon for the date', () => {
  const t = fromUT(O.bodies.neptune[5].jd), m = S.horizonMatrix(LH.lat, LH.lon, t), out = new Array(9);
  assert.equal(S.horizonMatrix(LH.lat, LH.lon, t, out), out, 'into the caller\'s array');
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) near(m[3 * i] * m[3 * j] + m[3 * i + 1] * m[3 * j + 1] + m[3 * i + 2] * m[3 * j + 2], i === j ? 1 : 0, 1e-12, 'a pure turn');
  near(m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]), 1, 1e-12, 'right-handed: east, north, up');
  // the celestial pole of date stands due south at the island's latitude
  const pole = S.horizonMatrix(90, 0, t), p = [pole[6], pole[7], pole[8]], e = m[0] * p[0] + m[1] * p[1] + m[2] * p[2], n = m[3] * p[0] + m[4] * p[1] + m[5] * p[2], u = m[6] * p[0] + m[7] * p[1] + m[8] * p[2];
  near(Math.asin(-u) / D2R, 31.55, 1e-9, 'the south celestial pole is 31.55 degrees up'); near(e, 0, 1e-9, 'on the meridian'); assert.ok(n > 0, 'the north one is below the northern horizon');
  // a far body, sent through the matrix as a star would be, lands where sky() puts it, but for its own parallax and light time
  const here = S.sky(LH.lat, LH.lon, t, {}, AIRLESS).neptune, earth = S.position('earth', t), d = S.eclipticToEquatorial(S.apparent(earth, 'neptune', t, [0, 0, 0, 0], S.velocity('earth', t)));
  const E = m[0] * d[0] + m[1] * d[1] + m[2] * d[2], Nn = m[3] * d[0] + m[4] * d[1] + m[5] * d[2], U = m[6] * d[0] + m[7] * d[1] + m[8] * d[2];
  under(apart(Math.atan2(E, Nn) / D2R, Math.asin(U) / D2R, here.az, here.alt) * 3600, 0.5, 'Neptune as a star, arcsec');
});

// ----------------------------------------------------------------------------------------------- the events
const EV = fixture('events.json');
ok('the air lifts the Sun at the horizon by half a degree, as Horizons has it, and can be switched off', () => {
  let worst = 0; const out = {};
  for (const r of EV.refraction.rows) {
    const s = S.sky(LH.lat, LH.lon, fromUT(r.jd), out).sun, bare = S.sky(LH.lat, LH.lon, fromUT(r.jd), {}, AIRLESS).sun;
    under(Math.abs(bare.alt - r.alt), 0.004, 'airless altitude, degrees');
    near(s.alt - bare.alt, s.lifted, 1e-12, 'lifted says by how much'); near(s.az, bare.az, 1e-12, 'straight up');
    worst = Math.max(worst, Math.abs(s.alt - r.lifted));
  }
  under(worst, 0.012, 'refracted altitude against Horizons, degrees');
  near(S.refraction(0), 0.483, 0.01, 'at the horizon: 29 arcmin'); near(S.refraction(-0.5667), 0.573, 0.01, 'and 34 where the Sun\'s centre really is when it seems to sit on it');
  near(S.refraction(90), 0, 1e-3, 'none overhead'); assert.ok(S.refraction(45) > 0.015 && S.refraction(45) < 0.018, 'an arcminute half way up');
  assert.ok(S.refraction(-10) < 1e-4 && S.refraction(-1.01) > 0.6, 'let go smoothly below the horizon, where no one sees it');
  near(S.refraction(10, 505, 10), S.refraction(10) / 2, 1e-12, 'half the air, half the lift');
  const at = (opts) => S.sky(LH.lat, LH.lon, fromUT(EV.refraction.rows[0].jd), {}, opts).sun.lifted, sea = at({});
  near(at({ height: 8500 }), sea / Math.E, 1e-6, 'one scale height up, the air and its lift are down by e'); assert.ok(at({ height: 400000 }) < 1e-12, 'in orbit there is none'); near(at({ pressure: 0 }), 0, 0, 'nor in a vacuum'); near(at({ height: 8500, pressure: 1010 }), sea, 1e-6, 'unless the pressure is given');
  measured.push(`refraction: worst ${(worst * 3600).toFixed(0)}" from Horizons' refracted Sun between the horizon and 30° up`);
});

ok('sunrise, noon and sunset at Lord Howe Island fall in the minute Horizons marks', () => {
  const out = {}, ids = { ids: ['sun'] };
  const limb = (ms) => { const s = S.sky(LH.lat, LH.lon, ms, out, ids).sun; return s.alt + s.diameter / 2; };      // the upper limb, lifted by the air
  const cross = (f, a, b) => { for (let i = 0; i < 40; i += 1) { const m = (a + b) / 2; if ((f(a) < 0) === (f(m) < 0)) a = m; else b = m; } return (a + b) / 2; };
  const row = (mark) => EV.sunrise.rows.find((r) => r.mark.endsWith(mark));
  const rise = row('r'), noon = row('t'), set = row('s');
  assert.ok(rise && noon && set, 'the fixture has all three');
  const tRise = cross(limb, fromUT(rise.jd) - 600000, fromUT(rise.jd) + 600000), tSet = cross(limb, fromUT(set.jd) - 600000, fromUT(set.jd) + 600000);
  const north = (ms) => { const a = S.sky(LH.lat, LH.lon, ms, out, ids).sun.az; return a > 180 ? a - 360 : a; };      // the Sun crosses the meridian to the north there
  const tNoon = cross((ms) => -north(ms), fromUT(noon.jd) - 600000, fromUT(noon.jd) + 600000);
  // Horizons marks the minute in which each happens
  under(Math.abs(tRise - fromUT(rise.jd)) / 1000, 60, 'sunrise, seconds'); under(Math.abs(tSet - fromUT(set.jd)) / 1000, 60, 'sunset, seconds'); under(Math.abs(tNoon - fromUT(noon.jd)) / 1000, 60, 'transit, seconds');
  const atRise = S.sky(LH.lat, LH.lon, fromUT(rise.jd), out, ids).sun;
  near(atRise.alt, rise.alt, 0.02, 'the Sun\'s height in that minute, degrees'); near(atRise.az, rise.az, 0.02, 'and its bearing: it rises south of east in November');
  near(S.sky(LH.lat, LH.lon, fromUT(noon.jd), out, ids).sun.alt, noon.alt, 0.01, 'and at noon, 78 degrees up in the north');
  const local = (ms) => new Date(ms + 11 * 3600000).toISOString().slice(11, 19), minute = (jd) => local(Math.round(fromUT(jd) / 60000) * 60000).slice(0, 5);
  measured.push(`Lord Howe Island, 21 November 2026 (UTC+11): sunrise ${local(tRise)}, the Sun due north ${local(tNoon)}, sunset ${local(tSet)}; Horizons' minutes: ${minute(rise.jd)}, ${minute(noon.jd)}, ${minute(set.jd)}`);
});

// NASA's path of the total solar eclipse of 8 April 2024 (F. Espenak, eclipse.gsfc.nasa.gov/SEpath/SEpath2001/
// SE2024Apr08Tpath.html): the instant and place of greatest eclipse, the Sun's height there, the central duration,
// and the central line every few minutes. NASA computed it with Delta T = 70.6 s; the Earth has in fact turned as
// Delta T = 69.184 s says, so its published UT and longitudes are carried over to the real clock and the real Earth.
const NASA = { deltaT: 70.6, greatest: { h: 18, m: 17, s: 18.3, lat: [25, 17.2], west: [104, 8.3], sunAlt: 69.8, sunAz: 149.4, duration: 4 * 60 + 28.1 },
  line: [[18, 10, 23, 11.9, 106, 6.8], [18, 14, 24, 20.6, 105, 2.3], [18, 18, 25, 29.1, 103, 56.8], [18, 22, 26, 37.4, 102, 49.9], [18, 26, 27, 45.6, 101, 41.4]] };
ok('the total solar eclipse of 8 April 2024: on NASA\'s published line, at its published second, the Moon covers the Sun', () => {
  const out = {}, opts = { refraction: false, ids: ['sun', 'moon'] };
  const real = (h, m, s, lat, west) => { const ut = Date.UTC(2024, 3, 8, h, m, 0) + s * 1000, slip = NASA.deltaT - S.deltaT(ut); return { ms: ut + slip * 1000, lat: lat[0] + lat[1] / 60, lon: -(west[0] + west[1] / 60) - slip * 360.98564736629 / 86400 }; };
  // (the records are the same objects every call: what is kept from one is copied out of it)
  const look = (p, ms = p.ms) => { const k = S.sky(p.lat, p.lon, ms, out, opts), sep = between([k.sun.east, k.sun.north, k.sun.up], [k.moon.east, k.moon.north, k.moon.up]) / D2R; return { sep, sun: { ...k.sun }, moon: { ...k.moon }, cover: k.moon.diameter / 2 - k.sun.diameter / 2 - sep, espenak: k.moon.diameter / 2 * (0.272281 * 6378.137 / 1737.4) - k.sun.diameter / 2 * (696000 / 695700) - sep }; };
  const g = NASA.greatest, G = real(g.h, g.m, g.s, g.lat, g.west), at = look(G);
  under(at.sep * 3600, 5, 'the centres of the Sun and the Moon at greatest eclipse, arcsec');
  assert.ok(at.cover > 0, 'total: the Moon\'s disc holds the whole of the Sun\'s');
  assert.ok(at.moon.diameter / at.sun.diameter > 1.05 && at.moon.diameter / at.sun.diameter < 1.062, 'the Moon 5.7 per cent the wider, as published (1.057)');
  near(at.sun.alt, g.sunAlt, 0.06, 'the Sun\'s altitude, to the tenth of a degree published'); near(at.sun.az, g.sunAz, 0.06, 'and its azimuth');
  assert.ok(at.moon.phase < 1e-5, 'the Moon is new');
  for (const [h, m, la, lam, lo, lom] of NASA.line) { const p = look(real(h, m, 0, [la, lam], [lo, lom])); under(p.sep * 3600, 6, `on the central line at ${h}:${m}, arcsec`); assert.ok(p.cover > 0); }
  // how long it lasts there: NASA's 4 m 28.1 s, with a Moon a hair smaller than the IAU's mean radius and no mountains on its limb
  let first = NaN, last = NaN, first2 = NaN, last2 = NaN;
  for (let dt = -200; dt <= 200; dt += 0.1) { const p = look(G, G.ms + dt * 1000); if (p.cover > 0) { if (Number.isNaN(first)) first = dt; last = dt; } if (p.espenak > 0) { if (Number.isNaN(first2)) first2 = dt; last2 = dt; } }
  // with the sizes this table carries (the IAU's Sun of 695,700 km and Moon of 1,737.4 km) it lasts four seconds longer
  // than NASA says; with the sizes NASA used (a Sun of 696,000 km, a Moon of 0.272281 Earth radii) it is NASA's
  near(last - first, g.duration, 6, 'totality at the place of greatest eclipse, seconds');
  near(last2 - first2, g.duration, 1.5, 'and with the Sun and Moon the size NASA took them to be, seconds');
  near((first + last) / 2, 0, 3, 'centred on the published instant, seconds');
  const north = look({ lat: G.lat + 2, lon: G.lon, ms: G.ms });
  assert.ok(north.cover < 0 && north.sep * 60 < 3, 'and two degrees north of the line, off the 197 km path, it is a deep partial eclipse and not total');
  measured.push(`8 April 2024, NASA's greatest eclipse (25°17.2'N 104°08.3'W, 18:17:18.3 UT): the centres ${(at.sep * 3600).toFixed(1)}" apart; totality ${(last - first).toFixed(1)} s, or ${(last2 - first2).toFixed(1)} s with the Sun and Moon the size NASA took them to be (published 268.1 s), its middle ${((first + last) / 2).toFixed(1)} s from the published instant; the Sun at ${at.sun.alt.toFixed(2)}°, ${at.sun.az.toFixed(2)}° (published 69.8°, 149.4°)`);
});

ok('the great conjunction of 21 December 2020: Jupiter and Saturn a tenth of a degree apart, as from the Earth\'s centre', () => {
  const J = EV.conjunction.jupiter, Sa = EV.conjunction.saturn, a = [0, 0, 0, 0], b = [0, 0, 0, 0];
  let worst = 0, least = 9, when = 0;
  J.forEach((j, k) => {
    const t = fromUT(j.jd), earth = S.position('earth', t), v = S.velocity('earth', t);
    S.apparent(earth, 'jupiter', t, a, v); S.apparent(earth, 'saturn', t, b, v);
    const mine = between(a, b) / D2R, theirs = apart(j.ra, j.dec, Sa[k].ra, Sa[k].dec);
    worst = Math.max(worst, Math.abs(mine - theirs) * 3600);
    if (mine < least) { least = mine; when = t; }
  });
  under(worst, 0.5, 'the gap between them against Horizons, hour by hour, arcsec');
  assert.ok(least > 0.100 && least < 0.104, 'closest: 6.1 arcminutes, a fifth of the Moon\'s width: ' + least);
  assert.ok(Math.abs(when - Date.UTC(2020, 11, 21, 18, 20)) <= 2 * 3600000, 'in the evening of the 21st, UT');
  measured.push(`21 December 2020: Jupiter and Saturn ${(least * 60).toFixed(2)}' apart at their closest (${new Date(when).toISOString().slice(11, 16)} UT, hourly); the gap within ${worst.toFixed(2)}" of Horizons all day`);
});

// --------------------------------------------------------------------------------------------- how it turns
ok('orientation: a unit quaternion taking body axes to the frame; the Earth\'s agrees with its own sky', () => {
  const t = Date.UTC(2026, 10, 21, 3, 0, 0), spin = (q, v) => { const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]); return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]; };
  const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
  for (const id of ORDER) {
    if (!S.knowsRotation(id)) { assert.throws(() => S.orientation(id, t), /not known/); assert.equal(BODIES[id].pole, null); continue; }
    const q = S.orientation(id, t); near(Math.hypot(...q), 1, 1e-12, id + ' is a unit quaternion');
    if (id === 'earth') continue;
    // its z axis is the IAU pole of the date
    const p = BODIES[id].pole, T = (S.julianTT(t) - 2451545) / 36525; let ra = p.ra[0] + p.ra[1] * T, dec = p.dec[0] + p.dec[1] * T;
    for (let k = 0; k < p.terms.length; k += 6) { const x = (p.terms[k] + p.terms[k + 1] * T + p.terms[k + 2] * T * T) * D2R; ra += p.terms[k + 3] * Math.sin(x); dec += p.terms[k + 4] * Math.cos(x); }
    const pole = S.equatorialToEcliptic([Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)]);
    under(between(spin(q, [0, 0, 1]), pole) / D2R, 1e-9, id + ': z is the north pole');
  }
  assert.ok(!S.knowsRotation('eris') && S.knowsRotation('moon') && S.knowsRotation('earth'));
  // the Earth: find the place the Sun is over from the quaternion alone, stand there, and look up
  const q = S.orientation('earth', t), earth = S.position('earth', t), dir = S.apparent(earth, 'sun', t, [0, 0, 0, 0], S.velocity('earth', t));
  const f = spin(conj(q), dir), lat = Math.asin(f[2]) / D2R, lon = Math.atan2(f[1], f[0]) / D2R;
  // (the latitude of a direction is the geodetic latitude of the place whose vertical it is)
  under(90 - S.sky(lat, lon, t, {}, AIRLESS).sun.alt, 0.001, 'the Sun is overhead where the quaternion says it is, degrees');
  assert.ok(lon > 120 && lon < 150 && lat < -18 && lat > -22, 'at 03:00 UT in late November that is over northern Australia: ' + lat.toFixed(1) + ', ' + lon.toFixed(1));
  // and a day later the Earth has turned once and a degree
  const q2 = S.orientation('earth', t + 86400000), x1 = spin(q, [1, 0, 0]), x2 = spin(q2, [1, 0, 0]);
  near(between(x1, x2) / D2R, 0.9856, 0.001, 'a sidereal day is four minutes short of a day');
});

ok('the Moon keeps one face to the Earth and nods: its librations stay within what they are known to reach', () => {
  const out = {}, ids = { refraction: false, ids: ['moon'] }; let lon = 0, lat = 0;
  for (let d = 0; d < 365; d += 1) { const m = S.sky(LH.lat, LH.lon, Date.UTC(2026, 0, 1) + d * 86400000, out, ids).moon, l = m.subLon > 180 ? m.subLon - 360 : m.subLon; lon = Math.max(lon, Math.abs(l)); lat = Math.max(lat, Math.abs(m.subLat)); }
  assert.ok(lon > 6 && lon < 9.5, 'in longitude up to about 8 degrees (with the observer\'s own degree): ' + lon.toFixed(2));
  assert.ok(lat > 6 && lat < 8.2, 'in latitude up to about 7: ' + lat.toFixed(2));
});

// ------------------------------------------------------------------------------- the phases and the brightness
ok('phases: the Moon waxes and wanes through a month, and the bright limb points at the Sun', () => {
  const out = {}; let full = 0, thin = 1; const t0 = Date.UTC(2026, 10, 1);
  for (let h = 0; h < 24 * 30; h += 3) {
    const k = S.sky(LH.lat, LH.lon, t0 + h * 3600000, out, AIRLESS), m = k.moon; full = Math.max(full, m.phase); thin = Math.min(thin, m.phase);
    near(m.phase, (1 + Math.cos(m.phaseAngle * D2R)) / 2, 1e-12, 'the lit fraction is the phase angle\'s');
    if (m.elongation > 5 && m.elongation < 175) {
      // the Sun's own position angle from the Moon, from the two right ascensions and declinations (Meeus 48.5)
      const a0 = k.sun.ra * D2R, d0 = k.sun.dec * D2R, a = m.ra * D2R, d = m.dec * D2R;
      const chi = Math.atan2(Math.cos(d0) * Math.sin(a0 - a), Math.sin(d0) * Math.cos(d) - Math.cos(d0) * Math.sin(d) * Math.cos(a0 - a)) / D2R;
      under(turn(m.limb, chi), 1e-6, 'the bright limb is toward the Sun');
    }
    assert.ok(m.magnitude < -2 && m.magnitude > -13, 'the Moon\'s magnitude stays between a thin crescent and full');
  }
  assert.ok(full > 0.995 && full < 1 && thin < 0.005, 'from new to full within thirty days (never quite full: the Moon passes above or below the Earth\'s shadow)');
});

ok('brightness: the planets by Mallama and Hilton\'s equations, which the Almanac uses', () => {
  const k = S.sky(LH.lat, LH.lon, Date.UTC(2026, 10, 21, 9, 0, 0), {}, AIRLESS);
  assert.ok(k.venus.magnitude < -3.8 && k.venus.magnitude > -4.95, 'Venus: ' + k.venus.magnitude);
  assert.ok(k.jupiter.magnitude < -1.6 && k.jupiter.magnitude > -2.95, 'Jupiter: ' + k.jupiter.magnitude);
  assert.ok(k.saturn.magnitude < 1.5 && k.saturn.magnitude > -0.6, 'Saturn: ' + k.saturn.magnitude);
  assert.ok(k.uranus.magnitude > 5.3 && k.uranus.magnitude < 6.1 && k.neptune.magnitude > 7.6 && k.neptune.magnitude < 8.1, 'Uranus at the edge of sight, Neptune past it');
  near(k.sun.magnitude, -26.74, 0.05, 'the Sun'); assert.ok(Number.isNaN(k.io.magnitude) && Number.isNaN(k.pluto.magnitude), 'the moons and dwarf planets are owed');
  const src = read('src/game/solar/ephemeris.js');
  for (const c of ['0.613', '6.3280e-2', '4.384', '236.05828', '1.601', '9.395', '9.428', '8.914', '1.825', '7.110', '7.00', '6.89', '3.99']) assert.ok(src.includes(c), 'the published constant ' + c);
});

// ------------------------------------------------------------------------------------------ what the bodies are
ok('the table of bodies: each has its pull, its size, its parent; what is not measured is null, not guessed', () => {
  assert.equal(C, 299792.458); assert.equal(AU, 149597870.7);
  assert.deepEqual(ORDER.slice(0, 5), ['sun', 'mercury', 'venus', 'earth', 'moon']);
  for (const id of ORDER) {
    const b = BODIES[id]; assert.ok(b.gm > 0 && b.radii.length === 3 && b.radii.every((r) => r > 0), id);
    assert.ok(id === 'sun' ? b.parent === null : ORDER.includes(b.parent), id + ' has a parent that is here');
    if (b.kind === 'moon') assert.ok(ORDER.indexOf(b.parent) < ORDER.indexOf(id), 'a moon comes after its planet');
    assert.ok(b.kind === 'planet' ? typeof b.color === 'number' : b.color === null, id + ': a colour only where three albedos were measured');
    if (id !== 'sun') assert.ok(b.albedo > 0 && b.albedo <= 1, id + ' albedo');
  }
  near(BODIES.earth.rotation, 0.99726963, 1e-7, 'the Earth turns once in a sidereal day'); assert.ok(BODIES.venus.rotation < 0 && BODIES.uranus.rotation < 0 && BODIES.triton.rotation < 0, 'three turn backwards');
  near(BODIES.jupiter.rotation * 24, 9.925, 0.001, 'Jupiter in under ten hours');
  near(BODIES.earth.gm + BODIES.moon.gm, BODIES.earth.gmSystem, 1e-3, 'a system is its planet and its moons');
  assert.equal(BODIES.earth.color, 0xe3efff, 'a pale blue dot'); assert.ok((BODIES.mars.color >> 16) > (BODIES.mars.color & 255) + 60, 'Mars is red'); assert.ok((BODIES.neptune.color & 255) > (BODIES.neptune.color >> 16) + 40, 'Neptune is blue');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) for (const r of BODIES[id].rings) assert.ok(r.inner > BODIES[id].radii[0] && r.outer >= r.inner, id + ' ring ' + r.name);
  const sat = BODIES.saturn.rings.map((r) => r.name); assert.deepEqual(sat, ['D', 'C', 'B', 'Cassini division', 'A', 'F', 'G', 'E']);
  const ring = (n) => BODIES.saturn.rings.find((r) => r.name === n);
  assert.equal(ring('B').outer, ring('Cassini division').inner); assert.equal(ring('Cassini division').outer, ring('A').inner); assert.equal(ring('A').outer, 136780);
  assert.deepEqual(BODIES.earth.atmosphere, { pressure: 101400, scaleHeight: 8.5, temperature: 288, gas: 'N2 78.08%, O2 20.95%' });
  assert.ok(!BODIES.moon.atmosphere && !BODIES.titan.atmosphere, 'Titan\'s air is owed, not invented');
  for (const id of Object.keys(ORBITS)) assert.ok(ORDER.includes(id), id + ' has an orbit and is in the order');
});

// ------------------------------------------------------------------------------------------ how it is written
ok('the series are small and say where they come from', () => {
  const size = (f) => statSync(join(ROOT, 'src/game/solar', f)).size, all = ['vsop87b.js', 'elp2000.js', 'orbits.js'].reduce((n, f) => n + size(f), 0);
  under(all, 150000, 'bytes of series: VSOP87B, ELP 2000-82B and the fitted orbits');
  assert.match(read('src/game/solar/vsop87b.js'), /Bretagnon[^]*Francou[^]*VSOP87B[^]*IMCCE[^]*DE441/);
  assert.match(read('src/game/solar/elp2000.js'), /Chapront-Touze[^]*ELP1\.\.ELP36[^]*IMCCE[^]*DE441/);
  assert.match(read('src/game/solar/orbits.js'), /Horizons[^]*MAR099[^]*JUP365[^]*SAT441[^]*1,800 dates/);
  assert.match(read('src/game/solar/bodies.js'), /gm_de440\.tpc[^]*pck00011\.tpc[^]*Archinal[^]*Mallama[^]*fact sheets/);
  for (const f of ['vsop87b.js', 'elp2000.js', 'orbits.js', 'bodies.js']) assert.match(read('src/game/solar/' + f), /GENERATED: do not edit by hand/);
  const code = read('src/game/solar/ephemeris.js').replace(/^\s*\/\/.*$/gm, '');      // the code, without its comment lines
  assert.ok(!/from 'three'|document\.|window\./.test(code), 'no page and no three in the clockwork');
  assert.ok(!/Date\.now\(|Math\.random\(|new Date\(/.test(code), 'it asks no clock and throws no dice: the caller says when');
  measured.push(`series: ${Object.entries({ 'vsop87b.js': 0, 'elp2000.js': 0, 'orbits.js': 0 }).map(([f]) => `${f} ${(size(f) / 1000).toFixed(1)} KB`).join(', ')} = ${(all / 1000).toFixed(1)} KB; bodies.js ${(size('bodies.js') / 1000).toFixed(1)} KB, ephemeris.js ${(size('ephemeris.js') / 1000).toFixed(1)} KB`);
});

ok('SOLAR.md carries Colin\'s words, the plan, and the numbers these checks just measured', () => {
  const md = read('SOLAR.md');
  for (const words of ['model the solar system as accurately as possible and make it explorable', 'ultra-high quality experience rather than quantity of output', 'they\'ll have to actually wait the time it takes for light to travel', 'synced with global clocks, but no skipping', 'lightspeed travel should make freeze all motion of the universe', 'real continents, mountains and coasts from Nasa data']) assert.ok(md.includes(words), 'his words: ' + words);
  for (const step of ['The clockwork', 'The true sky', 'The seamless rise', 'The Moon', 'Travel in real light time', 'The other worlds']) assert.ok(md.includes(step), 'the plan: ' + step);
  assert.match(md, /## What is owed/); assert.match(md, /Ceres/);
  // every row of the two tables is a line these checks have just measured: the file cannot say more than was found
  const rows = measured.filter((l) => l.startsWith('| '));
  assert.equal(rows.length, ORDER.length - 1 + Object.keys(O.bodies).length);
  for (const row of rows) assert.ok(md.includes(row), 'SOLAR.md is behind the measurement: ' + row);
  assert.match(read('GAME.md'), /SOLAR\.md/);
});

console.log('\n  what was measured (SOLAR.md keeps these):');
for (const line of measured) console.log('    ' + line);
console.log(`\n${passed} checks passed.`);
