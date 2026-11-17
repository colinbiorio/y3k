// ============================================================================
// The night over Giza in Khufu's reign, as plain numbers (no three.js, no
// page: the tests hold it). The stars of the Bright Star Catalogue (bsc.js),
// carried back from J2000 first along their own proper motions and then by
// the precession of the equinoxes (the IAU 1976 angles of Lieske et al., 1977,
// as Meeus gives them, Astronomical Algorithms ch. 21); where each stands at
// an hour of the night, for the evening when the sun stands where it stands
// on 17 November; and how much of them the twilight and the air leave to be
// seen. Degrees throughout; the scene's axes: X east, Y up, Z south.
// ============================================================================
import { GIZA } from './sun.mjs';

export const EPOCH = { year: -2559, say: 'c. 2560 BCE' };       // astronomical year numbering: −2559 is 2560 BCE
export const YEARS = EPOCH.year - 2000;                            // from J2000 (Julian years; days do not show here)
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const norm = (a) => ((a % 360) + 360) % 360;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// The catalogue's stars as bsc.js packs them: right ascension and declination (J2000, degrees), V magnitude,
// B−V, and proper motion (mas a year: along the great circle in right ascension, and in declination)
export function decodeStars(packed, moving, count) {
  const bytes = (b64) => { const t = atob(b64), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return new DataView(u.buffer); };
  const v = bytes(packed), m = bytes(moving), ra = new Float64Array(count), dec = new Float64Array(count), mag = new Float32Array(count), bv = new Float32Array(count);
  const pa = new Float32Array(count), pd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    ra[i] = (v.getUint16(i * 6, true) / 65536) * 360; dec[i] = (v.getInt16(i * 6 + 2, true) / 32767) * 90;
    mag[i] = v.getUint8(i * 6 + 4) / 30 - 2; bv[i] = v.getInt8(i * 6 + 5) / 60;
  }
  for (let k = 0; k + 6 <= m.byteLength; k += 6) { const i = m.getUint16(k, true); pa[i] = m.getInt16(k + 2, true); pd[i] = m.getInt16(k + 4, true); }
  return { ra, dec, mag, bv, pa, pd };
}

// a star's place `years` from J2000 along its proper motion: pa along the great circle, pd in declination,
// milliarcseconds a year (a step along the sky's surface: a few degrees at most, here)
export function moved(ra, dec, pa, pd, years) {
  if (!pa && !pd) return [ra, dec];
  const a = rad(ra), d = rad(dec), k = rad(years / 3.6e6);
  const p = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const ea = [-Math.sin(a), Math.cos(a), 0], ed = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const q = p.map((v, i) => v + (pa * ea[i] + pd * ed[i]) * k), r = Math.hypot(...q);
  return [norm(deg(Math.atan2(q[1], q[0]))), deg(Math.asin(q[2] / r))];
}

// precession from the equator and equinox of J2000 to those t Julian centuries later (earlier when negative)
export function precess(ra, dec, t) {
  const arc = (a, b, c) => rad((a * t + b * t * t + c * t * t * t) / 3600);
  const zeta = arc(2306.2181, 0.30188, 0.017998), z = arc(2306.2181, 1.09468, 0.018203), theta = arc(2004.3109, -0.42665, -0.041833);
  const a0 = rad(ra) + zeta, d0 = rad(dec);
  const A = Math.cos(d0) * Math.sin(a0);
  const B = Math.cos(theta) * Math.cos(d0) * Math.cos(a0) - Math.sin(theta) * Math.sin(d0);
  const C = Math.sin(theta) * Math.cos(d0) * Math.cos(a0) + Math.cos(theta) * Math.sin(d0);
  return [norm(deg(Math.atan2(A, B) + z)), deg(Math.atan2(C, Math.hypot(A, B)))];
}
// a catalogue star's place at the epoch (not called `then`: a module that exports a then is taken for a promise)
export const atEpoch = (ra, dec, pa, pd, years = YEARS) => precess(...moved(ra, dec, pa, pd, years), years / 100);

// the obliquity of the ecliptic, t Julian centuries from J2000 (IAU 1980; Meeus 22.2)
export const obliquity = (t) => 23.4392911 + (-46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) / 3600;
// the sun's longitude on the ecliptic at a Julian day (Meeus ch. 25, the lower accuracy: a hundredth of a degree)
export function sunLongitude(jd) {
  const T = (jd - 2451545) / 36525, M = rad(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  return norm(280.46646 + 36000.76983 * T + 0.0003032 * T * T + C);
}
export const NOVEMBER_17 = 2461362;                                // the Julian day of 17 November 2026, noon
// the sun's right ascension for its longitude, at an obliquity
export const sunRA = (lambda, eps) => norm(deg(Math.atan2(Math.cos(rad(eps)) * Math.sin(rad(lambda)), Math.cos(rad(lambda)))));
// the sidereal time, in degrees, at an hour by the sun: the sun's right ascension and its hour angle
export const siderealAt = (hours, raSun) => norm(raSun + 15 * (hours - 12));

// toward a star from Giza, as the scene's unit vector
export function direction(ra, dec, lst, lat = GIZA.lat) {
  const H = rad(lst - ra), d = rad(dec), p = rad(lat);
  const east = -Math.cos(d) * Math.sin(H), north = Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(H);
  return [east, Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H), -north];
}

// The faintest star the eye finds for the sun's height: none by day; the brightest from civil dusk; the
// sixth magnitude once the sky is dark, at the end of astronomical twilight (a picture's rule, after how the twilight goes)
export const limit = (sunElevation) => -1.6 + 7.6 * smooth((-sunElevation - 3) / 15);
// how much brighter a star must be near the horizon: the air's extinction, a quarter of a magnitude for
// every air mass (a dry, clear desert sky), the air mass by Rozenberg's formula (1966), good to the horizon
export const EXTINCTION = 0.25;
export function airmass(altitude) { const s = Math.sin(rad(Math.max(altitude, 0))); return 1 / (s + 0.025 * Math.exp(-11 * s)); }
export const seen = (mag, altitude, sunElevation) => altitude > 0 && mag + EXTINCTION * (airmass(altitude) - 1) < limit(sunElevation);

// a star's colour from its B−V (screen colours, 0..255), from the blue of the hottest to the orange of the coolest
const BV = [[-0.4, 155, 176, 255], [0, 202, 216, 255], [0.4, 248, 247, 255], [0.8, 255, 238, 224], [1.2, 255, 214, 170], [1.6, 255, 190, 128], [2, 255, 165, 90]];
export function bvColour(bv) {
  const b = clamp(bv, BV[0][0], BV[BV.length - 1][0]);
  let i = 0;
  while (i < BV.length - 2 && b > BV[i + 1][0]) i++;
  const [x0, ...c0] = BV[i], [x1, ...c1] = BV[i + 1], t = (b - x0) / (x1 - x0);
  return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
}
