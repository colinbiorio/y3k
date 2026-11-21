// ephemeris.js — THE CLOCKWORK: where every body is and how it is turned, for any date. No page, no three.
//
// Colin, 13 November 2026: "our solar system ... as accurately modeled to reality as possible"; 20 November:
// "model the solar system as accurately as possible and make it explorable". This file is the model's clock.
// SOLAR.md is its working memory: the sources, how the tables were made, and the accuracy the tests measured.
//
// WHAT COMES OUT
//   position(id, when)          km from the Sun's centre, on the ecliptic and equinox of J2000 (below)
//   relative(id, when)          the same, from the body's parent (a moon from its planet's centre)
//   velocity(id, when)          km/s, heliocentric
//   orientation(id, when)       a quaternion [x, y, z, w]: body-fixed axes (z the north pole, x through the
//                               prime meridian on the equator) into the same frame
//   lightTime(a, b, when)       seconds for light leaving a at `when` to reach b where b will then be
//   distance(a, b, when)        km between them at that instant
//   sky(lat, lon, when)         what an observer on the Earth sees: for every body its altitude and azimuth,
//                               distance, light time, angular size, brightness, phase, bright limb, the face
//                               turned to us
//   apparent(from, id, when)    where a body is seen from any point in space
//   horizonMatrix(lat, lon, when)   the turn that takes a star catalogue's J2000 directions to that horizon
//   refraction(alt)             the air's lift, degrees
//   gmst, gast, lst             sidereal time, radians
//   julianTT, fromTT, deltaT    the clock; centreOfMass(when) the solar system's
//
// THE FRAME. x toward the equinox of J2000, z toward the north pole of the ecliptic of J2000: the ICRF turned
// about x by the obliquity 84381.448 arcsec. It is the frame JPL Horizons calls "Ecliptic of J2000.0", so its
// vectors can be laid beside these without a turn. Kilometres, in doubles: at Neptune a double still resolves
// a millimetre.
//
// TIME. `when` is a Date or a number of milliseconds on the UTC clock (Date.now()). The bodies move in
// Terrestrial Time: TT = UTC + 32.184 s + the leap seconds, from the table below; before 1972 the clock is
// read as UT1 and TT - UT comes from Espenak and Meeus' polynomials. TDB is taken as TT (they differ by less
// than 2 ms). The Earth turns in UT1, taken as UTC: they differ by less than 0.9 s, which is 13 arcsec of sky.
//
// HOW. The eight planets: VSOP87B, cut (vsop87b.js). The Moon: ELP 2000-82B, cut (elp2000.js). The other moons,
// and the dwarf planets about the solar system's centre of mass: small theories fitted to JPL's ephemerides
// (orbits.js). Rotation: the IAU's models (bodies.js); the Earth by precession, nutation and sidereal time.
//
// NO ARRAY OR OBJECT IS MADE once it is warm, if the caller passes `out`: a frame that asks everything leaves a
// few hundred bytes of the engine's own boxed numbers behind and nothing else (the test measures it). Every
// function is a pure function of its arguments: it asks no clock and keeps no state but a memory of the last
// instant asked.
import { VSOP, VSOP_UNIT } from './vsop87b.js';
import { ELP, ELP_UNIT } from './elp2000.js';
import { ORBITS } from './orbits.js';
import { BODIES, ORDER, AU, C } from './bodies.js';

const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180, R2D = 180 / PI, ASEC = D2R / 3600;
export const DAY = 86400;                        // seconds
const CENTURY = 36525 * DAY, MILLENNIUM = 10 * CENTURY;
const J2000_MS = 946728000000;                   // what a UTC clock's Date reads at 2000-01-01T12:00:00Z

// ---------------------------------------------------------------------------------------------------- time
// TAI - UTC is 10 s from the first of these months and one more from each after it (IERS Bulletin C, as the
// IANA time zone database lists them: leap-seconds.list). No leap second has been announced since 2017; the
// clock holds 37 s until this table is given another line.
const LEAPS = ('1972-01 1972-07 1973-01 1974-01 1975-01 1976-01 1977-01 1978-01 1979-01 1980-01 1981-07 1982-07 1983-07 1985-07 '
  + '1988-01 1990-01 1991-01 1992-07 1993-07 1994-07 1996-01 1997-07 1999-01 2006-01 2009-01 2012-07 2015-07 2017-01')
  .split(' ').map((s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5)) - 1, 1));

// deltaT(when): TT - UT in seconds. From 1972 it is exact by definition (32.184 + TAI - UTC). Before, F. Espenak
// and J. Meeus' polynomial expressions (NASA eclipse web site, "Polynomial expressions for Delta T", 2006).
export function deltaT(when) {
  const ms = +when;
  if (ms >= LEAPS[0]) { let i = LEAPS.length - 1; while (ms < LEAPS[i]) i -= 1; return 42.184 + i; }
  const y = 2000 + (ms - J2000_MS) / 31557600000;
  let t;
  if (y >= 1961) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
  if (y >= 1941) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
  if (y >= 1920) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
  if (y >= 1900) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t; }
  if (y >= 1860) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t * t * t - 0.0004473624 * t * t * t * t + t * t * t * t * t / 233174; }
  if (y >= 1800) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t * t * t - 0.00037436 * t * t * t * t + 0.0000121272 * t * t * t * t * t - 0.0000001699 * t * t * t * t * t * t + 0.000000000875 * t * t * t * t * t * t * t; }
  t = (y - 1820) / 100; return -20 + 32 * t * t;
}
// seconds of Terrestrial Time since J2000.0 (2000 January 1, 12:00 TT); the last reading is kept, since a frame
// asks about one instant many times
const NOW = new Float64Array([NaN, 0]);
function tt(ms) { if (NOW[0] !== ms) { NOW[1] = (ms - J2000_MS) / 1000 + deltaT(ms); NOW[0] = ms; } return NOW[1]; }
// julianTT(when): the Julian date in TT. fromTT(jd): the clock reading (ms) at a Julian date in TT.
export function julianTT(when) { return 2451545 + tt(+when) / DAY; }
export function fromTT(jd) {
  const s = (jd - 2451545) * DAY; let ms = J2000_MS + (s - 64.184) * 1000;
  for (let i = 0; i < 3; i += 1) ms = J2000_MS + (s - deltaT(ms)) * 1000;
  return ms;
}

// -------------------------------------------------------------------------------------------------- frames
export const OBLIQUITY = 84381.448 * ASEC;       // of J2000, IAU 1976: the one Horizons' ecliptic frame uses
const CE = Math.cos(OBLIQUITY), SE = Math.sin(OBLIQUITY);
export function eclipticToEquatorial(v, out = [0, 0, 0]) { const y = v[1], z = v[2]; out[0] = v[0]; out[1] = CE * y - SE * z; out[2] = SE * y + CE * z; return out; }
export function equatorialToEcliptic(v, out = [0, 0, 0]) { const y = v[1], z = v[2]; out[0] = v[0]; out[1] = CE * y + SE * z; out[2] = -SE * y + CE * z; return out; }
// VSOP87's and ELP's "dynamical ecliptic and equinox of J2000" into the FK5 equator (the matrix of vsop87.doc),
// then onto the ecliptic above: a turn of a tenth of an arcsecond, kept because it is known.
const VF = (() => {
  const m = [1, 0.000000440360, -0.000000190919, -0.000000479966, 0.917482137087, -0.397776982902, 0, 0.397776982902, 0.917482137087], o = new Float64Array(9);
  for (let j = 0; j < 3; j += 1) { o[j] = m[j]; o[3 + j] = CE * m[3 + j] + SE * m[6 + j]; o[6 + j] = -SE * m[3 + j] + CE * m[6 + j]; }
  return o;
})();

// ------------------------------------------------------------------------------------------------- planets
const flat = (lists) => lists.map((l) => Float64Array.from(l));
const PLANET = {};
for (const name of Object.keys(VSOP)) {
  const p = VSOP[name];
  PLANET[name] = { L: flat(p.L), B: flat(p.B), R: flat(p.R), fL: p.fix ? flat(p.fix.L) : null, fB: p.fix ? flat(p.fix.B) : null, fR: p.fix ? flat(p.fix.R) : null };
}
function series(lists, t) {
  let sum = 0, tp = 1;
  for (let a = 0; a < lists.length; a += 1) {
    const l = lists[a], n = l.length; let x = 0;
    for (let i = 0; i < n; i += 3) x += l[i] * Math.cos(l[i + 1] + l[i + 2] * t);
    sum += x * tp; tp *= t;
  }
  return sum;
}
function planet(p, s, out) {
  const t = s / MILLENNIUM;
  let L = series(p.L, t), B = series(p.B, t), R = series(p.R, t);
  if (p.fL) { L += series(p.fL, t); B += series(p.fB, t); R += series(p.fR, t); }
  L *= VSOP_UNIT; B *= VSOP_UNIT; R *= VSOP_UNIT * AU;
  const cb = Math.cos(B), x = R * cb * Math.cos(L), y = R * cb * Math.sin(L), z = R * Math.sin(B);
  out[0] = VF[0] * x + VF[1] * y + VF[2] * z; out[1] = VF[3] * x + VF[4] * y + VF[5] * z; out[2] = VF[6] * x + VF[7] * y + VF[8] * z;
  return out;
}

// ------------------------------------------------------------------------------------------------ the Moon
const EM = { args: ELP.args.map((a) => Float64Array.from(a)), w1: Float64Array.from(ELP.w1), fix: ELP.fix, p: ELP.p, q: ELP.q, main: flat(ELP.main), pert: ELP.pert.map(flat) };
const ARCSEC_UNIT = ELP_UNIT * ASEC;
const poly4 = (c, t) => c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * c[4])));
// the Moon's centre from the Earth's, km
function moon(s, out) {
  const t = s / CENTURY, t2 = t * t;
  const D = poly4(EM.args[0], t), lp = poly4(EM.args[1], t), l = poly4(EM.args[2], t), F = poly4(EM.args[3], t);
  let lon = 0, lat = 0, dist = 0;
  for (let iv = 0; iv < 3; iv += 1) {
    const m = EM.main[iv], n = m.length; let sum = 0;
    if (iv === 2) for (let i = 0; i < n; i += 5) sum += m[i + 4] * Math.cos(m[i] * D + m[i + 1] * lp + m[i + 2] * l + m[i + 3] * F);
    else for (let i = 0; i < n; i += 5) sum += m[i + 4] * Math.sin(m[i] * D + m[i + 1] * lp + m[i + 2] * l + m[i + 3] * F);
    const pv = EM.pert[iv]; let tp = 1;
    for (let k = 0; k < 3; k += 1) {
      const q = pv[k], nq = q.length; let x = 0;
      for (let i = 0; i < nq; i += 3) x += q[i] * Math.sin(q[i + 1] + q[i + 2] * t);
      sum += x * tp; tp *= t;
    }
    if (iv === 0) lon = sum; else if (iv === 1) lat = sum; else dist = sum;
  }
  lon = lon * ARCSEC_UNIT + poly4(EM.w1, t) + EM.fix[0] + EM.fix[1] * t + EM.fix[2] * t2; lat *= ARCSEC_UNIT; dist *= ELP_UNIT;
  let x1 = dist * Math.cos(lat); const x2 = x1 * Math.sin(lon), x3 = dist * Math.sin(lat); x1 *= Math.cos(lon);
  // from the ecliptic of date to the ecliptic of J2000 (Laskar's P and Q)
  let pw = poly4(EM.p, t) * t, qw = poly4(EM.q, t) * t;
  const ra = 2 * Math.sqrt(1 - pw * pw - qw * qw), pwqw = 2 * pw * qw, pw2 = 1 - 2 * pw * pw, qw2 = 1 - 2 * qw * qw;
  pw *= ra; qw *= ra;
  const x = pw2 * x1 + pwqw * x2 + pw * x3, y = pwqw * x1 + qw2 * x2 - qw * x3, z = -pw * x1 + qw * x2 + (pw2 + qw2 - 1) * x3;
  out[0] = VF[0] * x + VF[1] * y + VF[2] * z; out[1] = VF[3] * x + VF[4] * y + VF[5] * z; out[2] = VF[6] * x + VF[7] * y + VF[8] * z;
  return out;
}

// --------------------------------------------------------------------------- the fitted orbits (orbits.js)
// One orbit: a mean longitude (a rate, a square, slow sinusoids that may also breathe the radius), an
// eccentricity vector and an inclination vector that are each a sum of uniformly turning modes, on a plane
// whose pole may drift. p: a, L0, n, q, ra0, dec0, ra1, dec1, then (e, w0, w1) * ne, (s, O0, O1) * ni,
// (A, B, phase, rate) * nl; km, radians and days of TT from J2000.
const ORBIT = {};
for (const name of Object.keys(ORBITS)) { const o = ORBITS[name]; ORBIT[name] = { ne: o.ne, ni: o.ni, nl: o.nl, p: Float64Array.from(o.p) }; }
function place(o, s, out) {
  const p = o.p, t = s / DAY;
  let k = 8, zr = 0, zi = 0, sr = 0, si = 0, lam = p[1] + p[2] * t + p[3] * t * t, a = 1;
  for (let j = 0; j < o.ne; j += 1, k += 3) { const x = p[k + 1] + p[k + 2] * t; zr += p[k] * Math.cos(x); zi += p[k] * Math.sin(x); }
  for (let j = 0; j < o.ni; j += 1, k += 3) { const x = p[k + 1] + p[k + 2] * t; sr += p[k] * Math.cos(x); si += p[k] * Math.sin(x); }
  for (let j = 0; j < o.nl; j += 1, k += 4) { const x = p[k + 2] + p[k + 3] * t; lam += p[k] * Math.sin(x); a += p[k + 1] * Math.cos(x); }
  a *= p[0];
  const e = Math.hypot(zr, zi), w = Math.atan2(zi, zr), O = Math.atan2(si, sr), inc = 2 * Math.atan(Math.hypot(sr, si));
  const M = lam - w; let E = M + e * Math.sin(M);
  for (let it = 0; it < 6; it += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const om = w - O, co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), sI = Math.sin(inc);
  const x1 = co * xp - so * yp, y1 = so * xp + co * yp;
  const xl = cO * x1 - sO * ci * y1, yl = sO * x1 + cO * ci * y1, zl = sI * y1;
  // the plane's pole (right ascension, declination, ICRF): x along the plane's rising node on the ICRF equator
  const A = p[4] + p[6] * t + PI / 2, dec = p[5] + p[7] * t, cA = Math.cos(A), sA = Math.sin(A), cD = Math.sin(dec), sD = Math.cos(dec);
  const y2 = cD * yl - sD * zl, z2 = sD * yl + cD * zl, xe = cA * xl - sA * y2, ye = sA * xl + cA * y2;
  out[0] = xe; out[1] = CE * ye + SE * z2; out[2] = -SE * ye + CE * z2;
  return out;
}

// ---------------------------------------------------------------------------------------------- the bodies
export const IDS = ORDER.slice();
const N = IDS.length, INDEX = {};
IDS.forEach((id, i) => { INDEX[id] = i; });
const index = (id) => { const i = INDEX[id]; if (i === undefined) throw new Error('solar: no body called ' + id); return i; };
const SUN = INDEX.sun, EARTH = INDEX.earth, MOON = INDEX.moon;
// how each is found: 0 the Sun, 1 a VSOP planet, 2 the Moon, 3 an orbit about its parent's centre,
// 4 an orbit about the solar system's centre of mass, 5 the heavier of a pair that such an orbit carries (Pluto)
const HOW = new Int8Array(N), PARENT = new Int32Array(N).fill(-1), DATA = new Array(N).fill(null), PARTNER = new Int32Array(N).fill(-1), SHARE = new Float64Array(N);
IDS.forEach((id, i) => {
  const b = BODIES[id];
  PARENT[i] = b.parent ? index(b.parent) : -1;
  if (id === 'sun') HOW[i] = 0;
  else if (PLANET[id]) { HOW[i] = 1; DATA[i] = PLANET[id]; }
  else if (id === 'moon') HOW[i] = 2;
  else if (ORBIT[id] && ORBITS[id].about === 'barycentre') { HOW[i] = ORBITS[id].pair ? 5 : 4; DATA[i] = ORBIT[id]; }
  else if (ORBIT[id]) { HOW[i] = 3; DATA[i] = ORBIT[id]; }
  else throw new Error('solar: ' + id + ' has no ephemeris');
});
IDS.forEach((id, i) => { if (HOW[i] === 5) { const j = index(ORBITS[id].pair); PARTNER[i] = j; SHARE[i] = BODIES[ORBITS[id].pair].gm / (BODIES[id].gm + BODIES[ORBITS[id].pair].gm); } });
// the Sun about the solar system's centre of mass: the planets' pull, each system's mass over the whole
const MASSIVE = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].map(index);
const PULL = (() => { let sum = BODIES.sun.gm; const g = MASSIVE.map((i) => BODIES[IDS[i]].gmSystem || BODIES[IDS[i]].gm); for (const x of g) sum += x; return Float64Array.from(g, (x) => x / sum); })();

const cacheS = new Float64Array(N).fill(NaN), cache = new Float64Array(3 * N);
const relS = new Float64Array(N).fill(NaN), rel = new Float64Array(3 * N);
const scrP = [0, 0, 0], scrQ = [0, 0, 0], scrB = [0, 0, 0];
let centreS = NaN; const centre = [0, 0, 0];
// the solar system's centre of mass, from the Sun's centre
function barycentre(s) {
  if (centreS === s) return centre;
  let x = 0, y = 0, z = 0;
  for (let k = 0; k < MASSIVE.length; k += 1) { helio(MASSIVE[k], s, scrB); x += PULL[k] * scrB[0]; y += PULL[k] * scrB[1]; z += PULL[k] * scrB[2]; }
  centre[0] = x; centre[1] = y; centre[2] = z; centreS = s; return centre;
}
// about(i, s): body i from its parent's centre at TT second s, kept until the instant changes
function about(i, s) {
  const k = 3 * i;
  if (relS[i] === s) return k;
  const how = HOW[i];
  if (how === 3) { place(DATA[i], s, scrP); rel[k] = scrP[0]; rel[k + 1] = scrP[1]; rel[k + 2] = scrP[2]; }
  else if (how === 2) { moon(s, scrP); rel[k] = scrP[0]; rel[k + 1] = scrP[1]; rel[k + 2] = scrP[2]; }
  relS[i] = s; return k;
}
function helio(i, s, out) {
  const k = 3 * i;
  if (cacheS[i] !== s) {
    const how = HOW[i];
    if (how === 0) { cache[k] = 0; cache[k + 1] = 0; cache[k + 2] = 0; }
    else if (how === 1) { planet(DATA[i], s, scrP); cache[k] = scrP[0]; cache[k + 1] = scrP[1]; cache[k + 2] = scrP[2]; }
    else if (how === 4 || how === 5) {
      place(DATA[i], s, scrQ); const c = barycentre(s);
      let x = scrQ[0] + c[0], y = scrQ[1] + c[1], z = scrQ[2] + c[2];
      if (how === 5) { const j = about(PARTNER[i], s), f = SHARE[i]; x -= f * rel[j]; y -= f * rel[j + 1]; z -= f * rel[j + 2]; }
      cache[k] = x; cache[k + 1] = y; cache[k + 2] = z;
    } else {
      const j = about(i, s), par = PARENT[i];
      helio(par, s, scrQ);
      cache[k] = scrQ[0] + rel[j]; cache[k + 1] = scrQ[1] + rel[j + 1]; cache[k + 2] = scrQ[2] + rel[j + 2];
    }
    cacheS[i] = s;
  }
  out[0] = cache[k]; out[1] = cache[k + 1]; out[2] = cache[k + 2];
  return out;
}

// position(id, when, out): km from the Sun's centre, ecliptic and equinox of J2000
export function position(id, when, out = [0, 0, 0]) { return helio(index(id), tt(+when), out); }
// relative(id, when, out): km from the centre of the body's parent (BODIES[id].parent); the Sun's is zero
const scrR = [0, 0, 0], scrR2 = [0, 0, 0];
export function relative(id, when, out = [0, 0, 0]) {
  const i = index(id), s = tt(+when);
  if (HOW[i] === 2 || HOW[i] === 3) { const k = about(i, s); out[0] = rel[k]; out[1] = rel[k + 1]; out[2] = rel[k + 2]; return out; }
  if (PARENT[i] < 0) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
  helio(i, s, scrR); helio(PARENT[i], s, scrR2);
  out[0] = scrR[0] - scrR2[0]; out[1] = scrR[1] - scrR2[1]; out[2] = scrR[2] - scrR2[2]; return out;
}
// velocity(id, when, out): km/s, heliocentric, by a central difference over twenty seconds
const scrV1 = [0, 0, 0], scrV2 = [0, 0, 0], STEP = 10;
function rate(i, s, out) {
  helio(i, s + STEP, scrV1); helio(i, s - STEP, scrV2);
  out[0] = (scrV1[0] - scrV2[0]) / (2 * STEP); out[1] = (scrV1[1] - scrV2[1]) / (2 * STEP); out[2] = (scrV1[2] - scrV2[2]) / (2 * STEP); return out;
}
export function velocity(id, when, out = [0, 0, 0]) { return rate(index(id), tt(+when), out); }
// centreOfMass(when, out): the solar system's, km from the Sun's centre
export function centreOfMass(when, out = [0, 0, 0]) { const c = barycentre(tt(+when)); out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }

// --------------------------------------------------------------------------------------------- light time
// distance(a, b, when): km between two bodies (ids) or fixed heliocentric points ([x, y, z] km) at one instant
const scrA = [0, 0, 0], scrC = [0, 0, 0];
const spot = (a, s, out) => (typeof a === 'string' ? helio(index(a), s, out) : (out[0] = a[0], out[1] = a[1], out[2] = a[2], out));
export function distance(a, b, when) {
  const s = tt(+when); spot(a, s, scrA); spot(b, s, scrC);
  return Math.hypot(scrC[0] - scrA[0], scrC[1] - scrA[1], scrC[2] - scrA[2]);
}
// lightTime(a, b, when): seconds for light (or a ship at c) leaving a at `when` to reach b, which moves on while
// it is under way: |b(t + T) - a(t)| = c T. A journey at light speed takes exactly this long. Positions are in
// the Sun's frame, which the planets swing by less than 16 m/s: under a millisecond of error out to Neptune.
export function lightTime(a, b, when) {
  const s = tt(+when); spot(a, s, scrA);
  let T = 0;
  for (let i = 0; i < 6; i += 1) {
    spot(b, s + T, scrC);
    const next = Math.hypot(scrC[0] - scrA[0], scrC[1] - scrA[1], scrC[2] - scrA[2]) / C;
    if (Math.abs(next - T) < 1e-9) { T = next; break; }
    T = next;
  }
  return T;
}

// ------------------------------------------------------------------------------------------------ rotation
// The IAU's rotation models (bodies.js): the pole's right ascension and declination and the prime meridian's
// angle W, each a polynomial in time plus sines or cosines of slowly turning angles.
const POLE = new Array(N).fill(null);
IDS.forEach((id, i) => {
  const p = BODIES[id].pole; if (!p) return;
  POLE[i] = { ra: Float64Array.from(p.ra, (x) => x * D2R), dec: Float64Array.from(p.dec, (x) => x * D2R), w: Float64Array.from(p.w, (x) => x * D2R), terms: Float64Array.from(p.terms || [], (x) => x * D2R) };
});
const angles = [0, 0, 0];       // right ascension, declination, W (radians)
function turn(i, s) {
  const m = POLE[i], T = s / CENTURY, d = s / DAY, q = m.terms;
  let ra = m.ra[0] + T * (m.ra[1] + T * m.ra[2]), dec = m.dec[0] + T * (m.dec[1] + T * m.dec[2]), w = m.w[0] + d * (m.w[1] + d * m.w[2]);
  for (let k = 0; k < q.length; k += 6) { const x = q[k] + T * (q[k + 1] + T * q[k + 2]), sx = Math.sin(x); ra += q[k + 3] * sx; dec += q[k + 4] * Math.cos(x); w += q[k + 5] * sx; }
  angles[0] = ra; angles[1] = dec; angles[2] = w;
}
// the body's axes as the columns of a matrix (row-major, 9), in the ecliptic frame of J2000
const AX = new Float64Array(9);
function axes(i, ms, s) {
  if (i === EARTH) return earthAxes(ms, s);
  if (!POLE[i]) throw new Error('solar: the rotation of ' + IDS[i] + ' is not known');
  turn(i, s);
  const ca = Math.cos(angles[0]), sa = Math.sin(angles[0]), cd = Math.cos(angles[1]), sd = Math.sin(angles[1]), cw = Math.cos(angles[2]), sw = Math.sin(angles[2]);
  // the pole; the node of its equator on the ICRF's; the point a quarter turn on along its equator
  const zx = cd * ca, zy = cd * sa, zz = sd, nx = -sa, ny = ca, qx = -sd * ca, qy = -sd * sa, qz = cd;
  const xx = nx * cw + qx * sw, xy = ny * cw + qy * sw, xz = qz * sw;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  AX[0] = xx; AX[1] = yx; AX[2] = zx;
  AX[3] = CE * xy + SE * xz; AX[4] = CE * yy + SE * yz; AX[5] = CE * zy + SE * zz;
  AX[6] = -SE * xy + CE * xz; AX[7] = -SE * yy + CE * yz; AX[8] = -SE * zy + CE * zz;
  return AX;
}
function quaternion(m, out) {
  const tr = m[0] + m[4] + m[8]; let x, y, z, w;
  if (tr > 0) { const f = 2 * Math.sqrt(tr + 1); w = f / 4; x = (m[7] - m[5]) / f; y = (m[2] - m[6]) / f; z = (m[3] - m[1]) / f; }
  else if (m[0] > m[4] && m[0] > m[8]) { const f = 2 * Math.sqrt(1 + m[0] - m[4] - m[8]); w = (m[7] - m[5]) / f; x = f / 4; y = (m[1] + m[3]) / f; z = (m[2] + m[6]) / f; }
  else if (m[4] > m[8]) { const f = 2 * Math.sqrt(1 + m[4] - m[0] - m[8]); w = (m[2] - m[6]) / f; x = (m[1] + m[3]) / f; y = f / 4; z = (m[5] + m[7]) / f; }
  else { const f = 2 * Math.sqrt(1 + m[8] - m[0] - m[4]); w = (m[3] - m[1]) / f; x = (m[2] + m[6]) / f; y = (m[5] + m[7]) / f; z = f / 4; }
  out[0] = x; out[1] = y; out[2] = z; out[3] = w; return out;
}
// orientation(id, when, out): [x, y, z, w], turning body-fixed vectors into the ecliptic frame of J2000 at that
// instant (no light time: what the body is doing, not what is seen of it). Throws where no pole is known.
export function orientation(id, when, out = [0, 0, 0, 1]) { const ms = +when; return quaternion(axes(index(id), ms, tt(ms)), out); }
export function knowsRotation(id) { const i = index(id); return i === EARTH || !!POLE[i]; }

// ------------------------------------------------------------------------------------------- the Earth turns
// Precession (IAU 1976, Lieske), nutation (IAU 1980: the terms above 0.005 arcsec, as Meeus tabulates them in
// Astronomical Algorithms ch. 22) and Greenwich sidereal time (IAU 1982). Polar motion (0.3 arcsec) is left out.
const NUT = Float64Array.from([
  // D, M, M', F, node; longitude and its change per century; obliquity and its change (units of 0.0001 arcsec)
  0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9,
  -2, 0, 0, 2, 2, -13187, -1.6, 5736, -3.1,
  0, 0, 0, 2, 2, -2274, -0.2, 977, -0.5,
  0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5,
  0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1,
  0, 0, 1, 0, 0, 712, 0.1, -7, 0,
  -2, 1, 0, 2, 2, -517, 1.2, 224, -0.6,
  0, 0, 0, 2, 1, -386, -0.4, 200, 0,
  0, 0, 1, 2, 2, -301, 0, 129, -0.1,
  -2, -1, 0, 2, 2, 217, -0.5, -95, 0.3,
  -2, 0, 1, 0, 0, -158, 0, 0, 0,
  -2, 0, 0, 2, 1, 129, 0.1, -70, 0,
  0, 0, -1, 2, 2, 123, 0, -53, 0,
  2, 0, 0, 0, 0, 63, 0, 0, 0,
  0, 0, 1, 0, 1, 63, 0.1, -33, 0,
  2, 0, -1, 2, 2, -59, 0, 26, 0,
  0, 0, -1, 0, 1, -58, -0.1, 32, 0,
  0, 0, 1, 2, 1, -51, 0, 27, 0,
]);
const TOD = new Float64Array(9);      // J2000 equator -> true equator and equinox of date
let todS = NaN, eqeq = 0;             // the instant TOD holds; the equation of the equinoxes (rad)
function trueOfDate(s) {
  if (todS === s) return;
  const T = s / CENTURY;
  const zeta = (2306.2181 + (0.30188 + 0.017998 * T) * T) * T * ASEC, zed = (2306.2181 + (1.09468 + 0.018203 * T) * T) * T * ASEC, theta = (2004.3109 - (0.42665 + 0.041833 * T) * T) * T * ASEC;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(zed), sZ = Math.sin(zed), ct = Math.cos(theta), st = Math.sin(theta);
  // P = R3(-zed) R2(theta) R3(-zeta)
  const p0 = cZ * ct * cz - sZ * sz, p1 = -cZ * ct * sz - sZ * cz, p2 = -cZ * st, p3 = sZ * ct * cz + cZ * sz, p4 = -sZ * ct * sz + cZ * cz, p5 = -sZ * st, p6 = st * cz, p7 = -st * sz, p8 = ct;
  const D = (297.85036 + 445267.111480 * T - 0.0019142 * T * T + T * T * T / 189474) * D2R, M = (357.52772 + 35999.050340 * T - 0.0001603 * T * T - T * T * T / 300000) * D2R,
    Mp = (134.96298 + 477198.867398 * T + 0.0086972 * T * T + T * T * T / 56250) * D2R, F = (93.27191 + 483202.017538 * T - 0.0036825 * T * T + T * T * T / 327270) * D2R,
    Om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000) * D2R;
  let dpsi = 0, deps = 0;
  for (let k = 0; k < NUT.length; k += 9) { const a = NUT[k] * D + NUT[k + 1] * M + NUT[k + 2] * Mp + NUT[k + 3] * F + NUT[k + 4] * Om; dpsi += (NUT[k + 5] + NUT[k + 6] * T) * Math.sin(a); deps += (NUT[k + 7] + NUT[k + 8] * T) * Math.cos(a); }
  dpsi *= 1e-4 * ASEC; deps *= 1e-4 * ASEC;
  const e0 = (84381.448 - (46.8150 + (0.00059 - 0.001813 * T) * T) * T) * ASEC, e1 = e0 + deps;
  const c0 = Math.cos(e0), s0 = Math.sin(e0), c1 = Math.cos(e1), s1 = Math.sin(e1), cp = Math.cos(dpsi), sp = Math.sin(dpsi);
  // N = R1(-e1) R3(-dpsi) R1(e0)
  const n0 = cp, n1 = -sp * c0, n2 = -sp * s0, n3 = c1 * sp, n4 = c1 * cp * c0 + s1 * s0, n5 = c1 * cp * s0 - s1 * c0, n6 = s1 * sp, n7 = s1 * cp * c0 - c1 * s0, n8 = s1 * cp * s0 + c1 * c0;
  TOD[0] = n0 * p0 + n1 * p3 + n2 * p6; TOD[1] = n0 * p1 + n1 * p4 + n2 * p7; TOD[2] = n0 * p2 + n1 * p5 + n2 * p8;
  TOD[3] = n3 * p0 + n4 * p3 + n5 * p6; TOD[4] = n3 * p1 + n4 * p4 + n5 * p7; TOD[5] = n3 * p2 + n4 * p5 + n5 * p8;
  TOD[6] = n6 * p0 + n7 * p3 + n8 * p6; TOD[7] = n6 * p1 + n7 * p4 + n8 * p7; TOD[8] = n6 * p2 + n7 * p5 + n8 * p8;
  eqeq = dpsi * c0; todS = s;
}
const wrap = (x) => { x %= TAU; return x < 0 ? x + TAU : x; };
function meanSidereal(ms, s) {
  const d = (ms - J2000_MS) / 86400000, T = s / CENTURY;      // days of UT1 (taken as UTC) from J2000
  return wrap((280.46061837 + 360.98564736629 * d + (0.000387933 - T / 38710000) * T * T) * D2R);
}
// gmst, gast: Greenwich mean and apparent sidereal time; lst(lon): local apparent, east longitude in degrees. Radians.
export function gmst(when) { const ms = +when; return meanSidereal(ms, tt(ms)); }
export function gast(when) { const ms = +when, s = tt(ms); trueOfDate(s); return wrap(meanSidereal(ms, s) + eqeq); }
export function lst(lon, when) { return wrap(gast(when) + lon * D2R); }
// the Earth's axes in the ecliptic frame: [terrestrial -> J2000 equator] = (R3(gast) TOD)^T, then onto the ecliptic
const E2J = new Float64Array(9);      // terrestrial (x at Greenwich on the equator, z the pole) -> J2000 equator
function earthTurn(ms, s) {
  trueOfDate(s);
  const g = meanSidereal(ms, s) + eqeq, cg = Math.cos(g), sg = Math.sin(g);
  // rows of R3(g) TOD are the terrestrial axes; its transpose has them as columns
  for (let j = 0; j < 3; j += 1) { E2J[3 * j] = cg * TOD[j] + sg * TOD[3 + j]; E2J[3 * j + 1] = -sg * TOD[j] + cg * TOD[3 + j]; E2J[3 * j + 2] = TOD[6 + j]; }
  return E2J;
}
function earthAxes(ms, s) {
  const m = earthTurn(ms, s);
  for (let j = 0; j < 3; j += 1) { AX[j] = m[j]; AX[3 + j] = CE * m[3 + j] + SE * m[6 + j]; AX[6 + j] = -SE * m[3 + j] + CE * m[6 + j]; }
  return AX;
}

// ------------------------------------------------------------------------------------------------- the sky
const WGS_A = 6378.137, WGS_F = 1 / 298.257223563, SPIN = 7.292115e-5;      // km; rad/s
const HZ = new Float64Array(9);       // J2000 equator -> east, north, up, for the observer and instant last asked
function horizon(lat, lon, ms, s) {
  const m = earthTurn(ms, s), f = lat * D2R, l = lon * D2R, cf = Math.cos(f), sf = Math.sin(f), cl = Math.cos(l), sl = Math.sin(l);
  // east, north, up in terrestrial axes, each taken through E2J's transpose
  const ex = -sl, ey = cl, nx = -sf * cl, ny = -sf * sl, nz = cf, ux = cf * cl, uy = cf * sl, uz = sf;
  for (let j = 0; j < 3; j += 1) {
    const a = m[3 * j], b = m[3 * j + 1], c = m[3 * j + 2];
    HZ[j] = ex * a + ey * b; HZ[3 + j] = nx * a + ny * b + nz * c; HZ[6 + j] = ux * a + uy * b + uz * c;
  }
  return HZ;
}
// horizonMatrix(lat, lon, when, out): 9 numbers, row-major: [east, north, up] = M [x, y, z] for a direction on
// the J2000 (ICRF) equator and equinox, which is what a star catalogue gives. Geodetic latitude, east longitude,
// degrees. The stars' own aberration (20 arcsec, yearly) is not in it.
export function horizonMatrix(lat, lon, when, out = new Array(9)) { const ms = +when, m = horizon(lat, lon, ms, tt(ms)); for (let k = 0; k < 9; k += 1) out[k] = m[k]; return out; }

// refraction(alt): degrees by which the air lifts a body whose true altitude is `alt` degrees, for 1010 hPa
// and 10 C at sea level (Saemundsson 1986, as Meeus gives it in ch. 16). Below the horizon, where no one sees
// it, it is let go smoothly rather than left to grow without bound.
export function refraction(alt, pressure = 1010, celsius = 10) {
  const h = alt < -1 ? -1 : alt, r = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60 * (pressure / 1010) * (283 / (273 + celsius));
  return alt < -1 ? r * Math.exp((alt + 1) / 0.7) : r;
}

// Apparent visual magnitudes: A. Mallama and J. L. Hilton, "Computing apparent planetary magnitudes for The
// Astronomical Almanac", Astronomy and Computing 25, 10 (2018), equations 2 to 17. r and d in au, the phase
// angle a in degrees; for Saturn the saturnicentric latitudes of the observer and the Sun, for Uranus their
// planetographic ones (degrees); the year for Neptune. Mars is without the paper's small terms in its
// rotation and season (under 0.1 mag). NaN where the paper gives no equation.
const lg = Math.log10;
function magnitude(i, r, d, a, subObs, subSun, year) {
  const base = 5 * lg(r * d), id = IDS[i];
  switch (id) {
    case 'sun': return -26.74 + 5 * lg(d);
    case 'mercury': return base - 0.613 + a * (6.3280e-2 + a * (-1.6336e-3 + a * (3.3644e-5 + a * (-3.4265e-7 + a * (1.6893e-9 - a * 3.0334e-12)))));
    case 'venus': return a <= 163.7 ? base - 4.384 + a * (-1.044e-3 + a * (3.687e-4 + a * (-2.814e-6 + a * 8.938e-9))) : base + 236.05828 + a * (-2.81914 + a * 8.39034e-3);
    case 'earth': return base - 3.99 + a * (-1.060e-3 + a * 2.054e-4);
    case 'mars': return a <= 50 ? base - 1.601 + a * (0.02267 - a * 0.0001302) : base - 0.367 + a * (-0.02573 + a * 0.0003445);
    case 'jupiter': { if (a <= 12) return base - 9.395 + a * (-3.7e-4 + a * 6.16e-4); const x = a / 180; return base - 9.428 - 2.5 * lg(1 + x * (-1.507 + x * (-0.363 + x * (-0.062 + x * (2.809 - x * 1.876))))); }
    case 'saturn': {
      if (a > 6.5) return base - 8.94 + a * (2.446e-4 + a * (2.672e-4 + a * (-1.505e-6 + a * 4.767e-9)));       // the globe alone
      const b = subObs * subSun > 0 ? Math.sqrt(subObs * subSun) : 0, sb = Math.sin(Math.min(b, 27) * D2R);
      return base - 8.914 - 1.825 * sb + 0.026 * a - 0.378 * sb * Math.exp(-2.25 * a);
    }
    case 'uranus': return base - 7.110 - 8.4e-4 * (Math.abs(subObs) + Math.abs(subSun)) / 2 + a * (6.587e-3 + a * 1.045e-4);
    case 'neptune': return base + (year > 2000 ? -7.00 : year < 1980 ? -6.89 : -6.89 - 0.0054 * (year - 1980)) + a * (7.944e-3 + a * 9.617e-5);
    // the Moon: the classical phase law (Allen's Astrophysical Quantities, from memory); within 0.02 mag of Horizons
    case 'moon': return base + 0.21 + 0.026 * a + 4e-9 * a * a * a * a;
    default: return NaN;
  }
}

const SKY_DEFAULT = { refraction: true, height: 0, celsius: 10, ids: null };
const VISIBLE = IDS.filter((id) => id !== 'earth');
const blank = (id) => ({ id, alt: 0, az: 0, east: 0, north: 0, up: 0, lifted: 0, ra: 0, dec: 0, distance: 0, lightTime: 0, diameter: 0, magnitude: NaN, phase: 1, phaseAngle: 0, elongation: 0, limb: 0, zenith: 0, axis: NaN, subLon: NaN, subLat: NaN, sunLat: NaN });
const obs = [0, 0, 0], obsV = [0, 0, 0], here = [0, 0, 0], hereV = [0, 0, 0], sunDir = [0, 0, 0], sunEnu = [0, 0, 0], scrS = [0, 0, 0], scrT = [0, 0, 0], scrU = [0, 0, 0];
// a direction in the ecliptic frame -> east, north, up, through the J2000 equator
function toHorizon(v, out) {
  const y = CE * v[1] - SE * v[2], z = SE * v[1] + CE * v[2], x = v[0];
  out[0] = HZ[0] * x + HZ[1] * y + HZ[2] * z; out[1] = HZ[3] * x + HZ[4] * y + HZ[5] * z; out[2] = HZ[6] * x + HZ[7] * y + HZ[8] * z; return out;
}
// seen(i, s, eye, eyeV): the apparent direction of body i from the point `eye` at TT second s: its light left it
// one light time ago (scrS is where it was, heliocentric), the Sun bent it on the way, and the eye's own motion
// leans it forward (aberration).
let seenD = 0, seenT = 0;
const SUN_R = BODIES.sun.radii[0], BEND = 2 * BODIES.sun.gm / (C * C);      // km; the Sun's gravitational radius, doubled (km)
function seen(i, s, eye, eyeV) {
  let T = 0, dx = 0, dy = 0, dz = 0, d = 0;
  // twice round is enough: the second pass moves the body by its speed times the first pass's error in the light
  // time, which is the speed over c of the light time itself: metres for the Moon, a few kilometres at Neptune
  for (let k = 0; k < 2; k += 1) { helio(i, s - T, scrS); dx = scrS[0] - eye[0]; dy = scrS[1] - eye[1]; dz = scrS[2] - eye[2]; d = Math.hypot(dx, dy, dz); T = d / C; }
  seenD = d; seenT = T;
  let px = dx / d, py = dy / d, pz = dz / d;
  scrU[0] = px; scrU[1] = py; scrU[2] = pz;      // the straight line of sight, for what faces us
  // the Sun bends the light that passes it (general relativity: 1.75 arcsec at its limb, 0.004 a quarter of the
  // sky away): p += (2 GM / c^2 E) ((p.q) e - (e.p) q) / (1 + q.e), e and q the directions from the Sun to the
  // eye and to the body, E the eye's distance. Left alone for the Sun itself and for what its disc covers.
  const E = Math.hypot(eye[0], eye[1], eye[2]), Q = Math.hypot(scrS[0], scrS[1], scrS[2]);
  if (i !== SUN && E > SUN_R && Q > SUN_R) {
    const ex = eye[0] / E, ey = eye[1] / E, ez = eye[2] / E, qx = scrS[0] / Q, qy = scrS[1] / Q, qz = scrS[2] / Q;
    const pq = px * qx + py * qy + pz * qz, ep = ex * px + ey * py + ez * pz, g2 = 1 + qx * ex + qy * ey + qz * ez;
    if (E * Math.sqrt(Math.max(0, 1 - ep * ep)) > SUN_R || ep > 0) {      // its light clears the Sun's limb
      const g = BEND / (E * g2);
      px += g * (pq * ex - ep * qx); py += g * (pq * ey - ep * qy); pz += g * (pq * ez - ep * qz);
    }
  }
  if (eyeV) { px += eyeV[0] / C; py += eyeV[1] / C; pz += eyeV[2] / C; }
  const n = Math.hypot(px, py, pz);
  scrT[0] = px / n; scrT[1] = py / n; scrT[2] = pz / n;
  return scrT;
}
// apparent(from, id, when, out, velocity): where body `id` is seen from the heliocentric point `from` ([x, y, z]
// km) at `when`: out = [x, y, z, km], a unit direction in the ecliptic frame of J2000 toward where the body was
// when the light now arriving left it, and the distance to that place. With `velocity` ([x, y, z] km/s,
// heliocentric) the direction also leans the way the eye is moving, as the sky really does (aberration).
export function apparent(from, id, when, out = [0, 0, 0, 0], velocity = null) {
  const u = seen(index(id), tt(+when), from, velocity);
  out[0] = u[0]; out[1] = u[1]; out[2] = u[2]; out[3] = seenD; return out;
}
// sky(lat, lon, when, out, opts): the sky of an observer on the Earth (geodetic latitude and east longitude in
// degrees). `out` is an object keyed by body id; pass the same one back each frame and no record is made anew.
// opts: height (metres above the ellipsoid: the beach, a mountain, an orbit), refraction (false for no air),
// pressure (hPa; by default 1010 at the sea, thinning with height) and celsius, ids (which bodies; all by default).
// For each body, as seen (light time, the Sun's bending of light, the observer's place and motion on the turning
// Earth, aberration; precession and nutation in the horizon):
//   alt, az          degrees; az from north through east. With opts.refraction (the default) alt is lifted by the
//                    air and `lifted` says by how much; east, north, up is the same direction as a unit vector
//   ra, dec          degrees, on the true equator and equinox of date
//   distance, lightTime   km and seconds, to the body where it was when the light left
//   diameter         degrees across (equatorial)
//   magnitude        apparent visual magnitude (the Sun, the Moon, the planets; NaN for the rest)
//   phase, phaseAngle, elongation   the lit fraction of the disc; the angles Sun-body-observer and Sun-observer-body, degrees
//   limb             position angle of the middle of the bright limb, degrees from celestial north through east
//   zenith           position angle of the observer's zenith, the same way: limb - zenith is the bright limb's
//                    angle from "up" in the sky, anticlockwise
//   axis             position angle of the body's north pole
//   subLon, subLat   the point of the body under the observer: east longitude and latitude from its centre,
//                    degrees (for the Moon these are its librations); sunLat: the latitude under the Sun
export function sky(lat, lon, when, out = {}, opts = SKY_DEFAULT) {
  const ms = +when, s = tt(ms), ids = opts.ids || VISIBLE, year = 2000 + s / (365.25 * DAY);
  horizon(lat, lon, ms, s);
  // the air above the observer: what is asked for, else the sea-level 1010 hPa thinned by height with the Earth's
  // scale height, so that the lift fades out on the way up to orbit instead of ending at a step
  const air = opts.pressure === undefined ? 1010 * Math.exp(-(opts.height || 0) / (1000 * BODIES.earth.atmosphere.scaleHeight)) : opts.pressure;
  // the observer: on the ellipsoid, carried round by the Earth, in the ecliptic frame from the Earth's centre
  const f = lat * D2R, l = lon * D2R, h = (opts.height || 0) / 1000, e2 = WGS_F * (2 - WGS_F), nu = WGS_A / Math.sqrt(1 - e2 * Math.sin(f) * Math.sin(f));
  const tx = (nu + h) * Math.cos(f) * Math.cos(l), ty = (nu + h) * Math.cos(f) * Math.sin(l), tz = (nu * (1 - e2) + h) * Math.sin(f);
  obs[0] = E2J[0] * tx + E2J[1] * ty + E2J[2] * tz; obs[1] = E2J[3] * tx + E2J[4] * ty + E2J[5] * tz; obs[2] = E2J[6] * tx + E2J[7] * ty + E2J[8] * tz;
  obsV[0] = SPIN * (-E2J[0] * ty + E2J[1] * tx); obsV[1] = SPIN * (-E2J[3] * ty + E2J[4] * tx); obsV[2] = SPIN * (-E2J[6] * ty + E2J[7] * tx);
  equatorialToEcliptic(obs, obs); equatorialToEcliptic(obsV, obsV);
  helio(EARTH, s, here); rate(EARTH, s, hereV);
  for (let k = 0; k < 3; k += 1) { here[k] += obs[k]; hereV[k] += obsV[k]; }
  // the Sun first: every phase and bright limb needs where it is seen
  const sd = seen(SUN, s, here, hereV); sunDir[0] = sd[0]; sunDir[1] = sd[1]; sunDir[2] = sd[2]; toHorizon(sunDir, sunEnu);
  // the true pole and equinox of date as east, north, up: TOD's rows are the axes of date on the J2000 equator
  const cx = HZ[0] * TOD[6] + HZ[1] * TOD[7] + HZ[2] * TOD[8], cy = HZ[3] * TOD[6] + HZ[4] * TOD[7] + HZ[5] * TOD[8], cz = HZ[6] * TOD[6] + HZ[7] * TOD[7] + HZ[8] * TOD[8];
  const qx0 = HZ[0] * TOD[0] + HZ[1] * TOD[1] + HZ[2] * TOD[2], qy0 = HZ[3] * TOD[0] + HZ[4] * TOD[1] + HZ[5] * TOD[2], qz0 = HZ[6] * TOD[0] + HZ[7] * TOD[1] + HZ[8] * TOD[2];
  const qx1 = HZ[0] * TOD[3] + HZ[1] * TOD[4] + HZ[2] * TOD[5], qy1 = HZ[3] * TOD[3] + HZ[4] * TOD[4] + HZ[5] * TOD[5], qz1 = HZ[6] * TOD[3] + HZ[7] * TOD[4] + HZ[8] * TOD[5];
  for (let q = 0; q < ids.length; q += 1) {
    const id = ids[q], i = index(id), r = out[id] || (out[id] = blank(id));
    if (i === EARTH) continue;
    const u = seen(i, s, here, hereV);
    r.distance = seenD; r.lightTime = seenT;
    const bx = scrS[0], by = scrS[1], bz = scrS[2], lx = scrU[0], ly = scrU[1], lz = scrU[2];      // where it was; the line of sight
    const en = toHorizon(u, scrT), E = en[0], Nn = en[1], U = en[2];
    const alt = Math.asin(Math.max(-1, Math.min(1, U))) * R2D;
    r.lifted = opts.refraction === false ? 0 : refraction(alt, air, opts.celsius === undefined ? 10 : opts.celsius);
    r.alt = alt + r.lifted; r.az = wrap(Math.atan2(E, Nn)) * R2D;
    const ca = Math.cos(r.alt * D2R), hz = Math.hypot(E, Nn) || 1;
    r.east = ca * E / hz; r.north = ca * Nn / hz; r.up = Math.sin(r.alt * D2R);
    r.ra = wrap(Math.atan2(E * qx1 + Nn * qy1 + U * qz1, E * qx0 + Nn * qy0 + U * qz0)) * R2D; r.dec = Math.asin(Math.max(-1, Math.min(1, E * cx + Nn * cy + U * cz))) * R2D;
    const b = BODIES[id];
    r.diameter = 2 * Math.asin(Math.min(1, b.radii[0] / r.distance)) * R2D;
    // at the body, east and north on the sky: east = pole x direction
    let ex = cy * U - cz * Nn, ey = cz * E - cx * U, ez = cx * Nn - cy * E; const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
    const nx = Nn * ez - U * ey, ny = U * ex - E * ez, nz = E * ey - Nn * ex;
    r.zenith = wrap(Math.atan2(ez, nz)) * R2D;
    if (i === SUN) { r.phase = 1; r.phaseAngle = 0; r.elongation = 0; r.limb = 0; }
    else {
      const rb = Math.hypot(bx, by, bz), cosPhase = (bx * lx + by * ly + bz * lz) / rb;
      r.phaseAngle = Math.acos(Math.max(-1, Math.min(1, cosPhase))) * R2D; r.phase = (1 + cosPhase) / 2;
      r.elongation = Math.acos(Math.max(-1, Math.min(1, E * sunEnu[0] + Nn * sunEnu[1] + U * sunEnu[2]))) * R2D;
      r.limb = wrap(Math.atan2(sunEnu[0] * ex + sunEnu[1] * ey + sunEnu[2] * ez, sunEnu[0] * nx + sunEnu[1] * ny + sunEnu[2] * nz)) * R2D;
    }
    // the face turned to us, from the body's rotation when the light left
    if (POLE[i]) {
      const m = axes(i, ms, s - r.lightTime);
      toHorizon2(m[2], m[5], m[8]);
      r.axis = wrap(Math.atan2(scrE[0] * ex + scrE[1] * ey + scrE[2] * ez, scrE[0] * nx + scrE[1] * ny + scrE[2] * nz)) * R2D;
      const ox = -(m[0] * lx + m[3] * ly + m[6] * lz), oy = -(m[1] * lx + m[4] * ly + m[7] * lz), oz = -(m[2] * lx + m[5] * ly + m[8] * lz);
      r.subLon = wrap(Math.atan2(oy, ox)) * R2D; r.subLat = Math.asin(Math.max(-1, Math.min(1, oz))) * R2D;
      const rb = Math.hypot(bx, by, bz) || 1;
      r.sunLat = i === SUN ? NaN : Math.asin(Math.max(-1, Math.min(1, -(m[2] * bx + m[5] * by + m[8] * bz) / rb))) * R2D;
    } else { r.axis = NaN; r.subLon = NaN; r.subLat = NaN; r.sunLat = NaN; }
    let so = r.subLat, ss = r.sunLat;
    if (id === 'uranus') { const g = (1 - 0.0022927) * (1 - 0.0022927); so = Math.atan(Math.tan(so * D2R) / g) * R2D; ss = Math.atan(Math.tan(ss * D2R) / g) * R2D; }
    r.magnitude = magnitude(i, Math.hypot(bx, by, bz) / AU, r.distance / AU, r.phaseAngle, so, ss, year);
  }
  return out;
}
const scrE = [0, 0, 0];
function toHorizon2(x, y0, z0) { const y = CE * y0 - SE * z0, z = SE * y0 + CE * z0; scrE[0] = HZ[0] * x + HZ[1] * y + HZ[2] * z; scrE[1] = HZ[3] * x + HZ[4] * y + HZ[5] * z; scrE[2] = HZ[6] * x + HZ[7] * y + HZ[8] * z; }

export { AU, C, BODIES };
