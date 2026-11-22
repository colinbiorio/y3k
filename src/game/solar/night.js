// night.js — THE NIGHT SKY, AS NUMBERS: the stars, the Milky Way, the zodiacal light, the airglow, the light of the
// Moon and the planets, and the eye that sees them, in the day's own units (lux and cd/m2; air.js). No page and no
// three in it: the tests run it, and sky.js draws with it. NIGHT_GLSL (at the foot) is the same written out for the
// GPU from the same constants, so the two cannot drift apart. SOLAR.md "Step 2, second part" says what is physical
// and what is approximated.
//
// ONE PHOTOMETRIC ZERO for everything, the Sun's own: a light of V magnitude m gives
//     E(m) = E_sun(1 au) 10^(-0.4 (m + 26.74)) lux, above the air
// (air.js's Sun, and the clockwork's magnitude for it: 2.684e-6 lux for m = 0). A surface brightness of one S10, one
// star of V = 10 to the square degree (27.78 V mag to the square arcsecond), is E(10) over a square degree: 8.81e-7
// cd/m2. Stars, planets, the Moon, the Milky Way, the zodiacal light and the airglow are all on it. Colours are the
// day's: three numbers, each "lux (or cd/m2), were the light white", sunlight above the air taken as white, and the
// luminance 0.2126 R + 0.7152 G + 0.0722 B.
import { AU, C, BODIES } from './bodies.js';
import { horizonMatrix, refraction, velocity, position, eclipticToEquatorial, OBLIQUITY, julianTT } from './ephemeris.js';
import { AIR, sunIlluminance, transmittance, luminance, airDensity, toTop } from './air.js';
import { MAP, MAP_CELL, CUBE, TINT } from './milkyway.js';

const PI = Math.PI, D2R = PI / 180, R2D = 180 / PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => x * x * (3 - 2 * x);

// ------------------------------------------------------------------------------------------- the zero
export const E0 = sunIlluminance(AU) * 10 ** (-0.4 * 26.74);            // lux from a V = 0 light above the air
export const S10 = E0 * 1e-4 / (D2R * D2R);                             // cd/m2 of one S10
export const magLux = (m) => E0 * 10 ** (-0.4 * m);

// ------------------------------------------------------------------------------------------- colour
// The CIE 1931 colour-matching functions, as the multi-lobe fit of C. Wyman, P.-P. Sloan and P. Shirley ("Simple
// analytic approximations to the CIE XYZ color matching functions", JCGT 2(2), 1, 2013); XYZ to linear sRGB (D65).
const lobe = (x, m, a, b) => { const t = (x - m) / (x < m ? a : b); return Math.exp(-0.5 * t * t); };
function cmf(nm, out) {
  out[0] = 1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2);
  out[1] = 0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
  out[2] = 1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
  return out;
}
export const XYZ_RGB = Object.freeze([3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.2040, 1.0570]);
export const RGB_XYZ = Object.freeze([0.4124, 0.3576, 0.1805, 0.2126, 0.7152, 0.0722, 0.0193, 0.1192, 0.9505]);
const c3 = [0, 0, 0];
function xyzRgb(X, Y, Z, out) { const m = XYZ_RGB; out[0] = m[0] * X + m[1] * Y + m[2] * Z; out[1] = m[3] * X + m[4] * Y + m[5] * Z; out[2] = m[6] * X + m[7] * Y + m[8] * Z; return out; }
// a spectrum (relative power by wavelength in nm) as linear sRGB, relative
function spectrumRgb(spd, out = [0, 0, 0]) {
  let X = 0, Y = 0, Z = 0;
  for (let nm = 380; nm <= 780; nm += 1) { const p = spd(nm); cmf(nm, c3); X += p * c3[0]; Y += p * c3[1]; Z += p * c3[2]; }
  return xyzRgb(X, Y, Z, out);
}
const planck = (T) => (nm) => 1 / (nm ** 5 * Math.expm1(1.4388e7 / (nm * T)));
// B-V to a temperature: C. A. L. Ballesteros, "New insights into black bodies", EPL 97, 34008 (2012). It gives the
// Sun's B-V of 0.65 as 5,778 K, which is the white the colours are balanced to.
export const temperature = (bv) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
const SUN_RGB = spectrumRgb(planck(temperature(0.65)));
// balanced to sunlight as white, and brought to unit luminance
function balance(rgb, out = rgb) {
  for (let c = 0; c < 3; c += 1) out[c] = Math.max(0, rgb[c] / SUN_RGB[c]);
  const y = luminance(out); for (let c = 0; c < 3; c += 1) out[c] /= y;
  return out;
}
// a star's colour from its B-V, as a black body of Ballesteros' temperature, sunlight white, unit luminance; kept
// as a table from -0.4 to 2.5 (the catalogue runs from -0.28; past 2.5 is the deepest red it has)
const BV = { lo: -0.4, hi: 2.5, step: 0.01 }, BV_N = Math.round((BV.hi - BV.lo) / BV.step) + 1;
const BV_TABLE = (() => { const t = new Float64Array(BV_N * 3), c = [0, 0, 0]; for (let i = 0; i < BV_N; i += 1) { balance(spectrumRgb(planck(temperature(BV.lo + i * BV.step)), c)); t.set(c, 3 * i); } return t; })();
export function bvColour(bv, out = [0, 0, 0]) {
  const x = (clamp(Number.isFinite(bv) ? bv : 0.65, BV.lo, BV.hi) - BV.lo) / BV.step, i = Math.min(BV_N - 2, Math.floor(x)), f = x - i;
  for (let c = 0; c < 3; c += 1) out[c] = BV_TABLE[3 * i + c] * (1 - f) + BV_TABLE[3 * i + 3 + c] * f;
  return out;
}
// the Moon's colour: sunlight reddened by its rocks, B-V 0.92 (Allen's Astrophysical Quantities, from memory), taken
// through the same black body; its own reflectance law and its face are the next part's (PR 3)
export const MOON_BV = 0.92;
// a planet's colour (bodies.js: sRGB-encoded, sunlight white) as linear light of unit luminance
export function planetColour(id, out = [0, 0, 0]) {
  const hex = BODIES[id].color; if (hex == null) return bvColour(0.65, out);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  out[0] = lin((hex >> 16) & 255); out[1] = lin((hex >> 8) & 255); out[2] = lin(hex & 255);
  const y = luminance(out); for (let c = 0; c < 3; c += 1) out[c] /= y;
  return out;
}

// ------------------------------------------------------------------------------------------- the airglow
// The upper air's own faint light, from a layer about 90 km up. Its zenith brightness and its colour are both worked
// out from the typical nightglow of Ch. Leinert et al., "The 1997 reference of diffuse night sky brightness" (A&AS
// 127, 1, 1998), Table 13: [OI] 557.7 nm 250 R; Na D 589 nm 30 R (summer) to 100 R (winter), taken as 65; [OI] 630.0
// nm 60 R; [OI] 636.4 nm 20 R; a pseudo-continuum of 0.3 R/Å from 400 to 700 nm. A rayleigh is 10^10 / 4 pi photons
// per square metre, second and steradian; each photon carries hc / lambda; 683 lm/W times the eye's curve makes it
// light. That comes to 1.2e-4 cd/m2 at the zenith (139 S10), a faint green. It varies with the solar cycle and through
// the night by a third either way; the OH bands' share in the visible red is not in the table, and is not in here.
const HC = 6.62607015e-34 * 299792458, PER_R = 1e10 / (4 * PI);
const AG_LINES = [[557.7, 250], [589.3, 65], [630.0, 60], [636.4, 20]];
const AG_CONTINUUM = { from: 400, to: 700, perNm: 3 };
export const AIRGLOW = (() => {
  let X = 0, Y = 0, Z = 0;
  const add = (nm, R) => { const w = R * PER_R * HC / (nm * 1e-9); cmf(nm, c3); X += w * c3[0]; Y += w * c3[1]; Z += w * c3[2]; };
  for (const [nm, R] of AG_LINES) add(nm, R);
  for (let nm = AG_CONTINUUM.from + 0.5; nm < AG_CONTINUUM.to; nm += 1) add(nm, AG_CONTINUUM.perNm);
  const zenith = 683 * Y, colour = balance(xyzRgb(X, Y, Z, [0, 0, 0]));
  return Object.freeze({ height: 90, zenith, colour: Object.freeze(colour) });
})();
// the layer seen edge-on toward the horizon is brighter (P. J. van Rhijn, 1921; Leinert's equation 13): cosZ the
// cosine of the zenith distance of the look, h the eye's height (km)
export function vanRhijn(cosZ, h = 0) { const k = (AIR.ground + h) / (AIR.ground + AIRGLOW.height); return 1 / Math.sqrt(Math.max(1e-6, 1 - k * k * (1 - cosZ * cosZ))); }

// ------------------------------------------------------------------------------------------- the zodiacal light
// Sunlight off the dust between the planets: Leinert et al. 1998, Table 16 (S10 at 500 nm, seen from the Earth; Levasseur-
// Regourd and Dumont's 1980 table, brought up to date), by the difference of ecliptic longitude from the Sun (rows) and
// the ecliptic latitude (columns); 60 S10 at the ecliptic pole. The blanks are within 15 degrees of the Sun: each is
// carried on from its row's two nearest values (the brightness there rises as steeply as it does in the row), and is
// only ever under the horizon or in twilight. Its colour is sunlight's a little reddened (Leinert's equation 22 at 90
// degrees from the Sun: 1 + 0.6 log(lambda / 500 nm) to the red, 1 + 0.9 log(lambda / 500 nm) to the blue).
const ZL_LON = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
const ZL_LAT = [0, 5, 10, 15, 20, 25, 30, 45, 60, 75, 90];
const ZL_T16 = [
  [null, null, null, 2450, 1260, 770, 500, 215, 117, 78],
  [null, null, null, 2300, 1200, 740, 490, 212, 117, 78],
  [null, null, 3700, 1930, 1070, 675, 460, 206, 116, 78],
  [9000, 5300, 2690, 1450, 870, 590, 410, 196, 114, 78],
  [5000, 3500, 1880, 1100, 710, 495, 355, 185, 110, 77],
  [3000, 2210, 1350, 860, 585, 425, 320, 174, 106, 76],
  [1940, 1460, 955, 660, 480, 365, 285, 162, 102, 74],
  [1290, 990, 710, 530, 400, 310, 250, 151, 98, 73],
  [925, 735, 545, 415, 325, 264, 220, 140, 94, 72],
  [710, 570, 435, 345, 278, 228, 195, 130, 91, 70],
  [395, 345, 275, 228, 190, 163, 143, 105, 81, 67],
  [264, 248, 210, 177, 153, 134, 118, 91, 73, 64],
  [202, 196, 176, 151, 130, 115, 103, 81, 67, 62],
  [166, 164, 154, 133, 117, 104, 93, 75, 64, 60],
  [147, 145, 138, 120, 108, 98, 88, 70, 60, 58],
  [140, 139, 130, 115, 105, 95, 86, 70, 60, 57],
  [140, 139, 129, 116, 107, 99, 91, 75, 62, 56],
  [153, 150, 140, 129, 118, 110, 102, 81, 64, 56],
  [180, 166, 152, 139, 127, 116, 105, 82, 65, 56],
];
export const ZODIACAL = (() => {
  const t = ZL_T16.map((row) => { const r = row.slice(); r.push(60); return r; });      // the pole
  for (const r of t) {                                                                  // the blanks, from each row's own slope
    let k = r.findIndex((v) => v !== null);
    for (let j = k - 1; j >= 0; j -= 1) r[j] = Math.min(1e5, r[j + 1] * (r[j + 1] / r[j + 2]) ** ((ZL_LAT[j + 1] - ZL_LAT[j]) / (ZL_LAT[j + 2] - ZL_LAT[j + 1])));
  }
  const f = (nm) => (nm >= 500 ? 1 + 0.6 * Math.log10(nm / 500) : 1 + 0.9 * Math.log10(nm / 500));
  const tint = [f(611), f(549), f(464)], y = luminance(tint);
  return Object.freeze({ lon: ZL_LON, lat: ZL_LAT, table: t, pole: 60, colour: Object.freeze(tint.map((x) => x / y)), toV: f(549) });
})();
const lerpIndex = (arr, x) => { let i = 0; while (i < arr.length - 2 && x > arr[i + 1]) i += 1; return [i, clamp((x - arr[i]) / (arr[i + 1] - arr[i]), 0, 1)]; };
// S10 (V) at a difference of longitude from the Sun and an ecliptic latitude (degrees, either sign): between the
// table's values, in their logarithm
export function zodiacal(dLon, beta) {
  const l = Math.abs(((((dLon + 180) % 360) + 360) % 360) - 180);      // 0 at the Sun, 180 opposite it
  const b = Math.min(90, Math.abs(beta)), [i, fi] = lerpIndex(ZODIACAL.lon, l), [j, fj] = lerpIndex(ZODIACAL.lat, b), T = ZODIACAL.table;
  const v = Math.exp((1 - fi) * ((1 - fj) * Math.log(T[i][j]) + fj * Math.log(T[i][j + 1])) + fi * ((1 - fj) * Math.log(T[i + 1][j]) + fj * Math.log(T[i + 1][j + 1])));
  return v * ZODIACAL.toV;
}
// the same on an even grid for the GPU (5 degrees both ways: 37 across, from the Sun to opposite it, 19 up, from the
// ecliptic to its pole), S10 (V)
export const ZL_GRID = Object.freeze({ w: 37, h: 19, step: 5 });
export function zodiacalGrid() { const g = new Float32Array(ZL_GRID.w * ZL_GRID.h); for (let j = 0; j < ZL_GRID.h; j += 1) for (let i = 0; i < ZL_GRID.w; i += 1) g[j * ZL_GRID.w + i] = zodiacal(i * ZL_GRID.step, j * ZL_GRID.step); return g; }

// ------------------------------------------------------------------------------------------- the Milky Way
// The texture (milkyway-cube.jpg, milkyway.js says its layout) holds S10 in each of three colours, log-encoded.
export const decodeS10 = (byte) => CUBE.C0 * Math.expm1(byte / 255 * CUBE.LN);
// where a J2000 direction falls in the atlas: its face and its texel coordinates from the atlas' top left (continuous:
// a texel's middle is at .5)
const FACES = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
export function cubeTexel(d, out = { face: 0, x: 0, y: 0 }) {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]), m = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2, face = 2 * m + (d[m] < 0 ? 1 : 0);
  const [, u, v] = FACES[face], dm = Math.abs(d[m]), s = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / dm, t = (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / dm, P = CUBE.N + 2 * CUBE.G;
  out.face = face; out.x = (face % 3) * P + CUBE.G + (s + 1) / 2 * CUBE.N; out.y = Math.floor(face / 3) * P + CUBE.G + (1 - t) / 2 * CUBE.N;
  return out;
}
// the coarse map (milkyway.js MAP): luminance in S10 at a J2000 place (degrees), between the cells' middles
const MI = 360 / MAP_CELL, MJ = 180 / MAP_CELL;
export function milkyWay(ra, dec) {
  const x = ((ra % 360) + 360) % 360 / MAP_CELL - 0.5, y = clamp((dec + 90) / MAP_CELL - 0.5, 0, MJ - 1), i0 = Math.floor(x), j0 = Math.min(MJ - 2, Math.floor(y)), fx = x - i0, fy = y - j0;
  const i = (i0 + MI) % MI, i1 = (i0 + 1 + MI) % MI, a = MAP[j0 * MI + i] * (1 - fx) + MAP[j0 * MI + i1] * fx, b = MAP[(j0 + 1) * MI + i] * (1 - fx) + MAP[(j0 + 1) * MI + i1] * fx;
  return a * (1 - fy) + b * fy;
}
export const MW_TINT = TINT;

// ------------------------------------------------------------------------------------------- where the stars are
// A star's direction, as the GPU places it: its J2000 place moved along the sky by its proper motion (years of TT since
// J2000.0), leaned by the eye's motion (the Earth's round the Sun and the island's round the Earth's axis: annual and
// diurnal aberration), turned onto the horizon by the clockwork's horizonMatrix (precession, nutation, sidereal time),
// and lifted by the air (the clockwork's refraction). Measured against ERFA (test/night.test.mjs): within 0.05 arcsec.
export const yearsOf = (when) => (julianTT(when) - 2451545) / 365.25;
export function starDirection(ra, dec, pmra, pmde, years, out = [0, 0, 0]) {
  const a = ra * D2R, d = dec * D2R, ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d), MAS = D2R / 3.6e6;
  const ta = pmra * MAS * years, td = pmde * MAS * years;                // radians along the sky (the catalogue's pmRA is already times cos dec)
  let x = cd * ca - sa * ta - sd * ca * td, y = cd * sa + ca * ta - sd * sa * td, z = sd + cd * td;
  const n = Math.hypot(x, y, z); out[0] = x / n; out[1] = y / n; out[2] = z / n;
  return out;
}
// the eye's velocity over c, on the J2000 equator: the Earth's heliocentric velocity and the island's 0.4651 cos(lat)
// km/s eastward (the east row of the horizon matrix is east on the J2000 equator)
const vE = [0, 0, 0], vQ = [0, 0, 0];
export function aberration(lat, lon, when, hz, out = [0, 0, 0]) {
  eclipticToEquatorial(velocity('earth', when, vE), vQ);
  const w = 2 * PI / 86164.0905 * 6378.137 * Math.cos(lat * D2R) / Math.sqrt(1 - 0.00669438 * Math.sin(lat * D2R) ** 2);      // km/s, the ellipsoid's turning
  for (let k = 0; k < 3; k += 1) out[k] = (vQ[k] + w * hz[k]) / C;
  return out;
}
// where a star is seen: { alt, az, lifted, east, north, up } (degrees; up etc. a unit vector, as the clockwork's sky())
const HZ = new Array(9), AB = [0, 0, 0], SD = [0, 0, 0];
export function starPlace(star, lat, lon, when, out = {}, refract = true) {
  const [, ra, dec, pmra, pmde] = star;
  horizonMatrix(lat, lon, when, HZ); aberration(lat, lon, when, HZ, AB);
  starDirection(ra, dec, pmra, pmde, yearsOf(when), SD);
  let x = SD[0] + AB[0], y = SD[1] + AB[1], z = SD[2] + AB[2]; const n = Math.hypot(x, y, z); x /= n; y /= n; z /= n;
  const E = HZ[0] * x + HZ[1] * y + HZ[2] * z, N = HZ[3] * x + HZ[4] * y + HZ[5] * z, U = HZ[6] * x + HZ[7] * y + HZ[8] * z;
  const alt = Math.asin(clamp(U, -1, 1)) * R2D, lifted = refract ? refraction(alt) : 0, seen = (alt + lifted) * D2R, h = Math.hypot(E, N) || 1;
  out.alt = alt + lifted; out.az = ((Math.atan2(E, N) * R2D) + 360) % 360; out.lifted = lifted;
  out.east = Math.cos(seen) * E / h; out.north = Math.cos(seen) * N / h; out.up = Math.sin(seen);
  return out;
}
// the catalogue (stars.js) as the GPU's arrays: each star's J2000 direction at an epoch, its light above the air (lux)
// and its colour (unit luminance)
export function starField(stars, years, fields = 7) {
  const n = stars.length / fields, dir = new Float32Array(3 * n), lux = new Float32Array(n), col = new Float32Array(3 * n), d = [0, 0, 0], c = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    const k = i * fields;
    starDirection(stars[k + 1], stars[k + 2], stars[k + 3], stars[k + 4], years, d); dir.set(d, 3 * i);
    lux[i] = magLux(stars[k + 5]); col.set(bvColour(stars[k + 6], c), 3 * i);
  }
  return { n, dir, lux, col, years };
}

// ------------------------------------------------------------------------------------------- the eye at night
// HOW FAINT A POINT CAN BE AND STILL BE SEEN, against a background of luminance B: B. E. Schaefer's fit to H. R.
// Blackwell's thresholds (J. Opt. Soc. Am. 36, 624, 1946), from his program for the visual limiting magnitude (Sky &
// Telescope, May 1998): with B in nanolamberts, the threshold illuminance in foot-candles is I = c1 (1 + sqrt(c2 B))^2,
// c1 = 10^-9.8 and c2 = 10^-1.9 under 1,500 nL (night), 10^-8.35 and 10^-5.9 above it (day), and the faintest
// magnitude seen is m = -16.57 - 2.5 log10 I. A dark sky of 22 mag/arcsec2 gives 6.6; the end of civil twilight, about
// 3.5. The magnitude is taken back to lux on the zero above, so the threshold and the stars are in one system.
export const SCHAEFER = Object.freeze({ night: Object.freeze([10 ** -9.8, 10 ** -1.9]), day: Object.freeze([10 ** -8.35, 10 ** -5.9]), split: 1500, nL: 1e-5 / PI, m0: -16.57 });
export function limitingMagnitude(B) {
  const nL = Math.max(B, 0) / SCHAEFER.nL, [c1, c2] = nL < SCHAEFER.split ? SCHAEFER.night : SCHAEFER.day;
  return SCHAEFER.m0 - 2.5 * Math.log10(c1 * (1 + Math.sqrt(c2 * nL)) ** 2);
}
export const thresholdLux = (B) => magLux(limitingMagnitude(B));
// HOW A POINT IS SHOWN. A screen cannot show a star as the night shows it: a pixel is two arcminutes, and an eye at
// night gathers a point's light over a third of a degree (Ricco's area), so a star of the sixth magnitude drawn as its
// light in its pixel stands thirty times above the sky round it, and every star of the catalogue would glare alike.
// So a star is shown by how far above the eye's own threshold it stands (J. A. Ferwerda et al., "A model of visual
// adaptation for realistic image synthesis", SIGGRAPH 1996, match thresholds the same way): a star at k thresholds is
// drawn at k of the screen's own thresholds for a point, which is POINTS.floor of white in its middle pixel on a dark
// screen and POINTS.weber of what is round it on a bright one. Where it stands under one threshold it fades as it is.
// The screen's threshold is the viewer's, not the world's, and is chosen: a point of a pixel or two on a screen's dark
// grey is hard to see under about a hundredth of white (4 to 10 of the 255 steps there), and the first pictures, drawn
// with a third of that, showed the sixth-magnitude stars as three steps over the sky: there, but lost to the eye.
// Its light is laid over the pixels round its true place as a Gaussian of POINTS.sigma pixels, each pixel taking what
// falls on its own square (so its total does not change as it moves across them, and it neither swims nor flickers).
// The cones see a point's colour only well above the rods' threshold: its colour comes in between 10 and 100 thresholds
// (POINTS.colour, in their logarithm; the "photochromatic interval"), and fully where the eye is in day vision.
export const POINTS = Object.freeze({ sigma: 0.65, floor: 0.012, weber: 0.12, colour: Object.freeze([1, 2]) });
export function pointShown(lux, B, shownBg = 0) {
  const k = lux / thresholdLux(B), step = Math.max(POINTS.floor, POINTS.weber * shownBg);
  return { thresholds: k, peak: k * step };
}
// THE PURKINJE SHIFT: under rod vision colour goes and what is left leans blue. H. W. Jensen, S. Premoze, P. Shirley,
// W. B. Thompson, J. A. Ferwerda and M. M. Stark, "Night rendering" (University of Utah, UUCS-00-016, 2000), the method
// their SIGGRAPH 2001 night sky (Jensen et al., "A physically-based night sky model") is tone-mapped with: the
// scotopic luminance V = Y (1.33 (1 + (Y + Z) / X) - 1.68) (G. W. Larson, H. Rushmeier and C. Piatko, 1997); a rod
// saturation s, 0 below 10^-2 cd/m2 and 1 above 10^0.6, 3 x^2 - 2 x^3 between (x = (log10 Y + 2) / 2.6); the
// chromaticity moved toward (0.25, 0.25) by 1 - s and the luminance toward k V, k being the ratio of Y to V for white
// (here sunlight, the game's white: 0.389; theirs, 0.4468, was for their own white). The level each pixel is judged at
// is its own luminance, but never less than the eye's adaptation: an eye adapted to day sees no dark corner with rods.
export const PURKINJE = Object.freeze({ blue: Object.freeze([0.25, 0.25]), lo: -2, hi: 0.6, white: 1 / (1.33 * (1 + (1 + 1.089) / 0.9505) - 1.68) });
export function rodShare(Y) { const lg = Math.log10(Math.max(Y, 1e-12)); return lg <= PURKINJE.lo ? 0 : lg >= PURKINJE.hi ? 1 : smooth((lg - PURKINJE.lo) / (PURKINJE.hi - PURKINJE.lo)); }
export function scotopic(rgb) {
  const m = RGB_XYZ, X = m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2], Y = m[3] * rgb[0] + m[4] * rgb[1] + m[5] * rgb[2], Z = m[6] * rgb[0] + m[7] * rgb[1] + m[8] * rgb[2];
  return X > 1e-12 ? Math.max(0, Y * (1.33 * (1 + (Y + Z) / X) - 1.68)) : 0;
}
// rgb: a colour in any scale; level: the luminance it stands for (cd/m2), adapted: the eye's level
export function purkinje(rgb, level, adapted = 0, out = [0, 0, 0]) {
  const s = rodShare(Math.max(level, adapted));
  if (s >= 1) { out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2]; return out; }
  const m = RGB_XYZ, X = m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2], Y = m[3] * rgb[0] + m[4] * rgb[1] + m[5] * rgb[2], Z = m[6] * rgb[0] + m[7] * rgb[1] + m[8] * rgb[2], W = X + Y + Z;
  if (!(W > 1e-15)) { out[0] = out[1] = out[2] = 0; return out; }
  const V = scotopic(rgb), x = (1 - s) * PURKINJE.blue[0] + s * X / W, y = (1 - s) * PURKINJE.blue[1] + s * Y / W, Yn = PURKINJE.white * (1 - s) * V + s * Y;
  return xyzRgb(x * Yn / y, Yn, (1 - x - y) * Yn / y, out);
}
// a point seen by rods alone: white under the shift, as linear sRGB of unit luminance
export const ROD_WHITE = Object.freeze(xyzRgb(1, 1, 2, [0, 0, 0]));
// TWINKLING: the air's turbulence makes a star's light flicker, the more the more air it is seen through: as the air
// mass to the 1.75th power (A. T. Young's 1967 law). Its size for an eye is chosen, not measured: Young's law, and the
// measurements since (D. Dravins et al., PASP 109, 173, 1997), are for telescopes, and taken down to a 7 mm pupil they
// give a quarter at the zenith, which is not what an eye sees; here a tenth at the zenith, held under a half. Low down
// the colours flicker apart (the air spreads them: a rising Sirius flashes). Planets, which are discs, do not twinkle.
export const TWINKLE = Object.freeze({ zenith: 0.10, most: 0.5, power: 1.75, hz: 4 });
export const airMass = (up) => 1 / (Math.max(up, 0) + 0.025 * Math.exp(-11 * Math.max(up, 0)));      // Rozenberg's
export const twinkle = (up) => Math.min(TWINKLE.most, TWINKLE.zenith * airMass(up) ** TWINKLE.power);

// ------------------------------------------------------------------------------------------- the night glow, scattered
// The air scatters the night's own glow (the airglow, the zodiacal light and the stars' light) as it scatters
// sunlight: toward the horizon this light outshines what comes straight through (Leinert et al. 1998 section 5: 10 to
// 100 S10). Worked out here as the paper's own approach for the airglow (its section 5.1): a source of unit radiance
// over the whole sky above the air, scattered once by the same air (the same Rayleigh, haze and ozone, the same phase
// functions, each look's light reaching the eye through the air between), times Leinert's factor for scattering
// more than once (Table 7: 1.12 to 1.44 for a Rayleigh depth of 0.05 to 0.2). Kept for 32 heights of a look above
// the horizon (finest near it), for an eye on the beach; the light that comes is that times the glow's mean.
const SCAT_N = 32, SCAT_DIRS = (() => { const n = 128, out = []; for (let i = 0; i < n; i += 1) { const z = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - z * z), a = i * PI * (3 - Math.sqrt(5)); out.push([r * Math.cos(a), z, r * Math.sin(a)]); } return out; })();
const scatMu = (i) => (i / (SCAT_N - 1)) ** 2;
let SCAT = null;
export function glowScatter() {
  if (SCAT) return SCAT;
  const RG = AIR.ground, h0 = 0.002, bR = AIR.rayleigh.scatter, bMs = AIR.mie.scatter, bMe = AIR.mie.extinct, bO = AIR.ozone.absorb, g = AIR.mie.g;
  const fMS = AIR.rayleigh.depth.map((tau) => 1.12 + (clamp(tau, 0.05, 0.2) - 0.05) * (0.32 / 0.15));
  const pR = (nu) => 3 / (16 * PI) * (1 + nu * nu), pM = (nu) => 3 / (8 * PI) * (1 - g * g) / (2 + g * g) * (1 + nu * nu) / Math.pow(1 + g * g - 2 * g * nu, 1.5);
  const out = new Float64Array(3 * SCAT_N), tr = [0, 0, 0], dw = 4 * PI / SCAT_DIRS.length, STEPS = 48;
  for (let i = 0; i < SCAT_N; i += 1) {
    const mu = Math.max(scatMu(i), 0.0005), d = [Math.sqrt(1 - mu * mu), mu, 0], len = toTop(h0, mu);
    const od = [0, 0, 0], L = [0, 0, 0];
    for (let s = 0; s < STEPS; s += 1) {
      const u0 = s / STEPS, u1 = (s + 1) / STEPS, a = len * u0 * u0, b = len * u1 * u1, dt = b - a, t = (a + b) / 2;      // closer together near the eye
      const P = [t * d[0], RG + h0 + t * d[1], 0], r = Math.hypot(P[0], P[1]), h = Math.min(r - RG, AIR.height - 1e-3), up = [P[0] / r, P[1] / r, 0];
      const dR = airDensity(h), dM = Math.exp(-h / AIR.mie.scale), dO = Math.max(0, 1 - Math.abs(h - AIR.ozone.centre) / AIR.ozone.half);
      const horizon = -Math.sqrt(Math.max(0, 1 - (RG / r) ** 2));                   // a light from under this comes from the ground: none
      const inR = [0, 0, 0], inM = [0, 0, 0];
      for (const w of SCAT_DIRS) {
        const mw = w[0] * up[0] + w[1] * up[1] + w[2] * up[2]; if (mw < horizon) continue;
        transmittance(h, mw, tr); const nu = w[0] * d[0] + w[1] * d[1] + w[2] * d[2], a1 = pR(nu), a2 = pM(nu);
        for (let c = 0; c < 3; c += 1) { inR[c] += a1 * tr[c]; inM[c] += a2 * tr[c]; }
      }
      for (let c = 0; c < 3; c += 1) {
        const ex = bR[c] * dR + bMe * dM + bO[c] * dO, mid = Math.exp(-(od[c] + ex * dt / 2));
        L[c] += mid * (bR[c] * dR * inR[c] + bMs * dM * inM[c]) * dw * dt;
        od[c] += ex * dt;
      }
    }
    for (let c = 0; c < 3; c += 1) out[3 * i + c] = L[c] * fMS[c];
  }
  SCAT = { n: SCAT_N, table: out, mu: scatMu, multiple: fMS };
  return SCAT;
}
// the scattered glow toward a look of zenith cosine mu, per unit of the glow above (three colours)
export function scatterAt(mu, out = [0, 0, 0]) {
  const S = glowScatter(), x = Math.sqrt(clamp(mu, 0, 1)) * (SCAT_N - 1), i = Math.min(SCAT_N - 2, Math.floor(x)), f = x - i;
  for (let c = 0; c < 3; c += 1) out[c] = S.table[3 * i + c] * (1 - f) + S.table[3 * i + 3 + c] * f;
  return out;
}

// ------------------------------------------------------------------------------------------- the night's light
// createNight({ lat, lon, stars }): the night sky over a place, as numbers. `at(when, km, hz)` brings it to an instant
// (once a second or so is enough: the night turns a quarter of a degree a minute); then
//   glowAt(dir, out)  the night's own glow along a direction as seen (world frame: x east, y up, z south): the Milky Way,
//                     the zodiacal light and the airglow through the air, and the air's scattering of them (cd/m2)
//   state.level       the night's light on level ground (lux, three colours): that glow over the dome, and the stars'
//   state.mean        the glow above the air, its mean over the dome (cd/m2): what the air scatters
//   state.sunLon      the Sun's ecliptic longitude (radians), for the zodiacal light
//   state.w2j         the world's directions to the J2000 equator (row-major), for the GPU
// `stars` is stars.js's array (this file does not read it itself), or null for no stars.
const tmp = [0, 0, 0], tmp2 = [0, 0, 0], tmp3 = [0, 0, 0], ecl = [0, 0, 0];
const OB_C = Math.cos(OBLIQUITY), OB_S = Math.sin(OBLIQUITY);
// the rings of the dome the light on level ground is summed over: even in the cosine of the zenith distance, so each
// ring is the same solid angle (and a plain mean of them is the dome's mean)
const RINGS = 12, AROUND = 24, DOME = [];
for (let j = 0; j < RINGS; j += 1) {
  const u0 = j / RINGS, u1 = (j + 1) / RINGS, up = (u0 + u1) / 2, w = (u1 * u1 - u0 * u0) * PI / AROUND, s = Math.sqrt(1 - up * up);
  for (let i = 0; i < AROUND; i += 1) { const a = (i + 0.5) / AROUND * 2 * PI; DOME.push({ d: [s * Math.cos(a), up, s * Math.sin(a)], w }); }
}
export function createNight({ lat, lon, stars = null }) {
  const hz = new Array(9), state = { when: NaN, km: 0.002, sunLon: 0, level: [0, 0, 0], mean: [0, 0, 0], starsLevel: [0, 0, 0], starsMean: [0, 0, 0], w2j: new Float64Array(9) };
  // the world's x east, y up, z south to J2000: the horizon matrix's rows are east, north and up on the J2000 equator
  const toJ2000 = (d, out) => { const e = d[0], n = -d[2], u = d[1]; for (let k = 0; k < 3; k += 1) out[k] = hz[k] * e + hz[3 + k] * n + hz[6 + k] * u; return out; };
  // the light above the air along a true direction (world frame): S10 of the Milky Way's luminance, of the zodiacal
  // light, and the airglow (cd/m2; it is in the air, 90 km up, and seen through the rest of it)
  const src = { mw: 0, zl: 0, ag: 0 };
  function sources(td, cosZ) {
    toJ2000(td, tmp);
    src.mw = milkyWay(Math.atan2(tmp[1], tmp[0]) * R2D, Math.asin(clamp(tmp[2], -1, 1)) * R2D);
    ecl[0] = tmp[0]; ecl[1] = OB_C * tmp[1] + OB_S * tmp[2]; ecl[2] = -OB_S * tmp[1] + OB_C * tmp[2];
    src.zl = zodiacal((Math.atan2(ecl[1], ecl[0]) - state.sunLon) * R2D, Math.asin(clamp(ecl[2], -1, 1)) * R2D);
    src.ag = AIRGLOW.zenith * vanRhijn(cosZ, state.km);
    return src;
  }
  function glowAt(d, out = [0, 0, 0], parts = null) {
    if (d[1] <= 0) { out[0] = out[1] = out[2] = 0; return out; }
    // where the light comes from: the air lifted it (the clockwork's refraction, undone)
    const seen = Math.asin(clamp(d[1], -1, 1)) * R2D;
    let was = seen; for (let i = 0; i < 4; i += 1) was = seen - refraction(was);
    const h = Math.hypot(d[0], d[2]) || 1, cw = Math.cos(was * D2R);
    tmp3[0] = d[0] / h * cw; tmp3[1] = Math.sin(was * D2R); tmp3[2] = d[2] / h * cw;
    const s = sources(tmp3, d[1]);
    transmittance(state.km, d[1], tmp2); scatterAt(d[1], tmp);
    for (let c = 0; c < 3; c += 1) out[c] = (s.mw * S10 * MW_TINT[c] + s.zl * S10 * ZODIACAL.colour[c] + s.ag * AIRGLOW.colour[c]) * tmp2[c] + state.mean[c] * tmp[c];
    if (parts) { parts.milkyWay = s.mw; parts.zodiacal = s.zl; parts.airglow = s.ag / S10; parts.through = luminance(tmp2); parts.scattered = luminance(state.mean) * luminance(tmp) / S10; }
    return out;
  }
  const sc = [0, 0, 0], v = [0, 0, 0], sd = [0, 0, 0], col = [0, 0, 0];
  function at(when, km = 0.002, hzIn = null, withStars = true) {
    state.when = +when; state.km = clamp(km, 0, AIR.height - 1e-3);
    if (hzIn) for (let k = 0; k < 9; k += 1) hz[k] = hzIn[k]; else horizonMatrix(lat, lon, when, hz);
    // world to J2000, row-major: J = hz^T (e, n, u) with e = x, n = -z, u = y
    const W = state.w2j; for (let k = 0; k < 3; k += 1) { W[3 * k] = hz[k]; W[3 * k + 1] = hz[6 + k]; W[3 * k + 2] = -hz[3 + k]; }
    // the Sun's ecliptic longitude: opposite the Earth's, seen from the Sun
    position('earth', when, v); state.sunLon = Math.atan2(-v[1], -v[0]);
    // the glow above the air, its mean over the dome
    const m = [0, 0, 0];
    for (const q of DOME) { const s = sources(q.d, q.d[1]); for (let c = 0; c < 3; c += 1) m[c] += s.mw * S10 * MW_TINT[c] + s.zl * S10 * ZODIACAL.colour[c] + s.ag * AIRGLOW.colour[c]; }
    // the stars above the horizon: their mean over the dome, and their light on level ground through the air
    const sm = state.starsMean.map((x) => x * 2 * PI), sl = state.starsLevel.slice();
    if (stars && withStars) {
      sm[0] = sm[1] = sm[2] = sl[0] = sl[1] = sl[2] = 0;
      const years = yearsOf(when);
      for (let k = 0; k < stars.length; k += 7) {
        starDirection(stars[k + 1], stars[k + 2], stars[k + 3], stars[k + 4], years, sd);
        const u = hz[6] * sd[0] + hz[7] * sd[1] + hz[8] * sd[2]; if (u <= 0) continue;
        const e = magLux(stars[k + 5]); bvColour(stars[k + 6], col); transmittance(state.km, u, tmp2);
        for (let c = 0; c < 3; c += 1) { sm[c] += e * col[c]; sl[c] += e * col[c] * tmp2[c] * u; }
      }
    }
    for (let c = 0; c < 3; c += 1) { state.mean[c] = m[c] / DOME.length + sm[c] / (2 * PI); state.starsLevel[c] = sl[c]; state.starsMean[c] = sm[c] / (2 * PI); }
    // the night's light on level ground: the glow over the dome, cosine-weighted, and the stars'
    const L = [0, 0, 0];
    for (const q of DOME) { glowAt(q.d, sc); for (let c = 0; c < 3; c += 1) L[c] += sc[c] * q.w; }
    for (let c = 0; c < 3; c += 1) state.level[c] = L[c] + sl[c];
    return state;
  }
  return { state, at, glowAt, toJ2000 };
}

// ------------------------------------------------------------------------------------------- the same, for the GPU
const f = (x) => { const s = Number(x).toPrecision(9); return /[.e]/.test(s) ? s : s + '.0'; };
const v3 = (a) => `vec3(${Array.from(a).map(f).join(', ')})`;
// NIGHT_GLSL needs AIR_GLSL before it (airT). Its uniforms are set by sky.js.
export const NIGHT_GLSL = `
uniform sampler2D uMW;            // the Milky Way atlas (milkyway-cube.jpg: bytes, log-encoded S10)
uniform sampler2D uZL;            // the zodiacal light on its 5 degree grid (S10)
uniform mat3 uW2J;                // the world's directions (x east, y up, z south) to the J2000 equator
uniform float uSunLon;            // the Sun's ecliptic longitude (radians)
uniform float uNightH;            // the eye's height (km)
uniform vec3 uGlowMean;           // the glow above the air, its mean over the dome (cd/m2): what the air scatters
uniform vec3 uScat[${SCAT_N}];          // the scattered glow per unit of it, by the look's height (finest at the horizon)
uniform float uLiftK;             // how much of the sea-level refraction the air at the eye still gives
const float N_S10 = ${f(S10)};
const vec3 N_ZLT = ${v3(ZODIACAL.colour)};
const vec3 N_AG = ${v3(AIRGLOW.colour.map((x) => x * AIRGLOW.zenith))};
const float N_AGH = ${f(AIRGLOW.height)};
const float N_C0 = ${f(CUBE.C0)};
const float N_LN = ${f(CUBE.LN)};
const float N_CN = ${f(CUBE.N)};
const float N_CG = ${f(CUBE.G)};
const vec2 N_ATLAS = vec2(${f(3 * (CUBE.N + 2 * CUBE.G))}, ${f(2 * (CUBE.N + 2 * CUBE.G))});
const float N_OBC = ${f(OB_C)};
const float N_OBS = ${f(OB_S)};
// degrees the air lifts what stands at a true height of alt degrees (Saemundsson's formula, as ephemeris.js has it)
float nightLift(float alt) { float hh = max(alt, -1.0), r = 1.02 / tan(radians(hh + 10.3 / (hh + 5.11))) / 60.0 * uLiftK; return alt < -1.0 ? r * exp((alt + 1.0) / 0.7) : r; }
// a direction as seen, back to where its light comes from (the air lifted it): world frame. The lift from the height
// as seen is G. G. Bennett's formula (1982, as J. Meeus gives it beside Saemundsson's, which it undoes to 4 arcsec)
vec3 nightTrue(vec3 d) {
  float seen = degrees(asin(clamp(d.y, -1.0, 1.0))), hh = max(seen, -0.9), was = seen - 1.0 / tan(radians(hh + 7.31 / (hh + 4.4))) / 60.0 * uLiftK;
  vec2 hz = normalize(d.xz + vec2(1.0e-9, 0.0)); float cw = cos(radians(was));
  return vec3(hz.x * cw, sin(radians(was)), hz.y * cw);
}
// the Milky Way and the faint stars, S10 in three colours, along a J2000 direction (milkyway.js says the layout)
vec3 nightMW(vec3 j) {
  vec3 a = abs(j); float face, dm; vec3 u, v;
  if (a.x >= a.y && a.x >= a.z) { dm = a.x; if (j.x >= 0.0) { face = 0.0; u = vec3(0, 1, 0); v = vec3(0, 0, 1); } else { face = 1.0; u = vec3(0, -1, 0); v = vec3(0, 0, 1); } }
  else if (a.y >= a.z) { dm = a.y; if (j.y >= 0.0) { face = 2.0; u = vec3(-1, 0, 0); v = vec3(0, 0, 1); } else { face = 3.0; u = vec3(1, 0, 0); v = vec3(0, 0, 1); } }
  else { dm = a.z; if (j.z >= 0.0) { face = 4.0; u = vec3(0, 1, 0); v = vec3(-1, 0, 0); } else { face = 5.0; u = vec3(0, 1, 0); v = vec3(1, 0, 0); } }
  float s = dot(j, u) / dm, t = dot(j, v) / dm, P = N_CN + 2.0 * N_CG;
  vec2 px = vec2(mod(face, 3.0) * P + N_CG + (s + 1.0) * 0.5 * N_CN, floor(face / 3.0) * P + N_CG + (1.0 - t) * 0.5 * N_CN);
  vec3 b = texture2D(uMW, px / N_ATLAS).rgb;
  return N_C0 * (exp(b * N_LN) - 1.0);
}
// the zodiacal light, S10 (V), along a J2000 direction
float nightZL(vec3 j) {
  vec3 e = vec3(j.x, N_OBC * j.y + N_OBS * j.z, -N_OBS * j.y + N_OBC * j.z);
  float dl = abs(mod(atan(e.y, e.x) - uSunLon + 3.14159265, 6.28318531) - 3.14159265), b = abs(asin(clamp(e.z, -1.0, 1.0)));
  vec2 uv = vec2(degrees(dl) / ${f(ZL_GRID.step)}, degrees(b) / ${f(ZL_GRID.step)});
  return texture2D(uZL, (uv + 0.5) / vec2(${f(ZL_GRID.w)}, ${f(ZL_GRID.h)})).r;
}
vec3 nightScat(float mu) { float x = sqrt(clamp(mu, 0.0, 1.0)) * ${f(SCAT_N - 1)}; int i = int(min(floor(x), ${f(SCAT_N - 2)})); float k = x - float(i); return mix(uScat[i], uScat[i + 1], k); }
// the night's own glow along a world direction as seen (cd/m2, three colours), nothing under the horizon: what lies
// beyond the air (the Milky Way and the zodiacal light, through it: the Moon hides these), and what is in it (the
// airglow, 90 km up, through the air under it, and the air's own scattering of the whole night's glow)
// T: what the air lets through along d (airT(uNightH, d.y)), worked out once by the caller. nightBackAt takes the
// J2000 direction and the zodiacal light already worked out (the dome does both at its corners: they change slowly)
vec3 nightBackAt(vec3 j, float zl, vec3 T) { return (nightMW(j) + zl * N_ZLT) * N_S10 * T; }
vec3 nightBack(vec3 d, vec3 T) {
  if (d.y <= 0.0) return vec3(0.0);
  vec3 j = uW2J * nightTrue(d);
  return nightBackAt(j, nightZL(j), T);
}
vec3 nightFront(vec3 d, vec3 T) {
  if (d.y <= 0.0) return vec3(0.0);
  float k = (${f(AIR.ground)} + uNightH) / (${f(AIR.ground)} + N_AGH), vr = inversesqrt(max(1.0e-6, 1.0 - k * k * (1.0 - d.y * d.y)));
  return N_AG * vr * T + uGlowMean * nightScat(d.y);
}
vec3 nightGlow(vec3 d) { vec3 T = airT(uNightH, d.y); return nightBack(d, T) + nightFront(d, T); }
`;
export { SCAT_N };
// The eye's part for the GPU (no uniforms of its own): the Purkinje shift, the threshold for a point, and how much of
// a point's light falls on one pixel's square. Written from PURKINJE, SCHAEFER and POINTS above.
const colm = (m) => `mat3(${[m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]].map(f).join(', ')})`;
export const PIXEL_MIDDLE = (() => { const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); }; const e = erf(0.5 / (POINTS.sigma * Math.SQRT2)); return e * e; })();
export const NIGHT_EYE_GLSL = `
const mat3 N_RGB2XYZ = ${colm(RGB_XYZ)};
const mat3 N_XYZ2RGB = ${colm(XYZ_RGB)};
const vec3 N_LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 N_RODWHITE = ${v3(ROD_WHITE)};
// how much the rods are saturated at a luminance: 0, night vision; 1, day vision (PURKINJE)
float nightRods(float Y) { float lg = log(max(Y, 1.0e-12)) * 0.434294482; return smoothstep(${f(PURKINJE.lo)}, ${f(PURKINJE.hi)}, lg); }
// a colour (any scale) whose luminance stands for 'level' cd/m2, seen by an eye adapted to 'adapted': the Purkinje shift
vec3 nightPurkinje(vec3 c, float level, float adapted) {
  float s = nightRods(max(level, adapted));
  if (s >= 1.0) return c;
  vec3 X = N_RGB2XYZ * max(c, 0.0); float W = X.x + X.y + X.z;
  if (W <= 1.0e-30) return c;
  float V = X.x > 1.0e-30 ? max(0.0, X.y * (1.33 * (1.0 + (X.y + X.z) / X.x) - 1.68)) : 0.0;
  vec2 xy = mix(vec2(${f(PURKINJE.blue[0])}, ${f(PURKINJE.blue[1])}), X.xy / W, s);
  float Yn = mix(${f(PURKINJE.white)} * V, X.y, s);
  return max(N_XYZ2RGB * vec3(xy.x * Yn / xy.y, Yn, (1.0 - xy.x - xy.y) * Yn / xy.y), 0.0);
}
// the faintest point seen against a background of B cd/m2, as lux (SCHAEFER, on the game's zero)
float nightThreshold(float B) {
  float nl = max(B, 0.0) * ${f(1 / SCHAEFER.nL)};
  vec2 c = nl < ${f(SCHAEFER.split)} ? vec2(${f(SCHAEFER.night[0])}, ${f(SCHAEFER.night[1])}) : vec2(${f(SCHAEFER.day[0])}, ${f(SCHAEFER.day[1])});
  float q = 1.0 + sqrt(c.y * nl);
  return ${f(E0 * 10 ** (-0.4 * SCHAEFER.m0))} * c.x * q * q;
}
float nightErf(float x) { float a = abs(x), t = 1.0 / (1.0 + 0.3275911 * a); return sign(x) * (1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a)); }
// the share of a point's light, spread as a Gaussian of POINTS.sigma pixels, that falls on the pixel 'o' pixels from it
float nightPixel(vec2 o) {
  const float k = ${f(1 / (POINTS.sigma * Math.SQRT2))};
  return 0.25 * (nightErf((o.x + 0.5) * k) - nightErf((o.x - 0.5) * k)) * (nightErf((o.y + 0.5) * k) - nightErf((o.y - 0.5) * k));
}
const float N_PMID = ${f(PIXEL_MIDDLE)};
const float N_PFLOOR = ${f(POINTS.floor)};
const float N_PWEBER = ${f(POINTS.weber)};
const vec2 N_PCOLOUR = vec2(${f(POINTS.colour[0])}, ${f(POINTS.colour[1])});
// twinkling (TWINKLE): its spread, in the logarithm of the light, by the look's height
float nightTwinkle(float up) { float s = max(up, 0.0), X = 1.0 / (s + 0.025 * exp(-11.0 * s)); return min(${f(TWINKLE.most)}, ${f(TWINKLE.zenith)} * pow(X, ${f(TWINKLE.power)})); }
`;
