// moon.js — THE MOON'S FACE, AS NUMBERS: how it is turned (the IAU's rotation, from the clockwork), what lights it
// (the Sun, and the Earth: the earthshine), the light law its face gives back, and how an eye looking at it sees it.
// No page and no three in it: the tests run it, and sky.js draws with it. MOON_GLSL (at the foot) is the same written out
// for the GPU from the same constants, so the two cannot drift apart. SOLAR.md "Step 2, third part" says what is
// physical and what is chosen.
//
// THE FACE is two pictures (moonmaps.js says their layout): the albedo from the LRO camera's colour mosaic on the Moon's
// measured scale, and LOLA's relief (normals and heights), both in the IAU Moon frame. A look that meets the disc is a
// place on the sphere; the Moon's own axes (orientation('moon') at the instant its light left: the clockwork) say which
// place, so its librations, the tilt of its axis and, from Lord Howe, its southern view ("upside down" to a northern eye)
// all come out of the rotation itself and are not drawn on.
//
// THE LIGHT LAW (scripts/solar/moon.py made its numbers true): a place of albedo rho, lit at the cosine mu0 and seen at
// the cosine mu of its normal, under a light of E lux at a phase angle alpha, gives
//     L = E rho PHI(alpha) 2 mu0 / (mu0 + mu) / pi   cd/m2
// (Lommel-Seeliger: a full Moon is as bright at its limb as at its middle, as the real one is and a Lambert ball is not).
// PHI carries the opposition surge and the roughness, fitted so that the whole disc gives the clockwork's magnitude law
// at every phase. Two lights: the Sun, and the Earth, whose light at the Moon is the clockwork's own magnitude law for the
// Earth (A. Mallama and J. L. Hilton, Astronomy and Computing 25, 10, 2018) at the Earth's phase as the Moon sees it, in
// the colour of earthlight (B-V 0.44: P. Thejll et al., A&A 563, A38, 2014, from the earthlit Moon's measured colour).
// The earthlit Moon is seen almost exactly back along the light (the Earth is within a degree of the eye, as the Moon sees
// them), so it gets the opposition surge, and the Sun-lit crescent beside it a phase angle of 140 degrees or more: the
// ashen light is about a ten-thousandth of the sunlight on the Moon (the published figure is for that) but some 1:1,500
// of the crescent's brightness as seen.
//
// SHADOWS: near the terminator each place looks along the ground toward the Sun, over LOLA's heights, out to 300 km
// (past that the Moon's curvature hides anything its relief can raise), and takes the share of the Sun's disc that
// clears the highest of it. So crater floors lie in long shadow at the quarter, and peaks past the terminator catch the
// light before the plain round them, as they do in a telescope.
import { MOON_MAPS, PHI, PHI_STEP, MOON_CREDIT } from './moonmaps.js';
import { orientation, horizonMatrix, magnitudeOf, OBLIQUITY, AU, BODIES } from './ephemeris.js';
import { magLux, bvColour } from './night.js';
import { luminance, shown, EYE } from './air.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ------------------------------------------------------------------------------------------- the law
// PHI at a phase angle (degrees), between the table's entries; held at its 160 degree value past 160 (moonmaps.js)
export function phi(alpha) {
  const x = clamp(alpha, 0, 180) / PHI_STEP, i = Math.min(PHI.length - 2, Math.floor(x)), f = x - i;
  return PHI[i] * (1 - f) + PHI[i + 1] * f;
}
// the Lommel-Seeliger part: 2 mu0 / (mu0 + mu), nothing where the light does not reach
export const lommelSeeliger = (mu0, mu) => (mu0 > 0 && mu > 0 ? 2 * mu0 / (mu0 + mu) : 0);
// L for a place of albedo rho (one colour) under E lux at the phase angle alpha (degrees)
export const moonLuminance = (E, rho, alpha, mu0, mu) => E * rho * phi(alpha) * lommelSeeliger(mu0, mu) / Math.PI;

// earthlight's colour: B-V 0.44 (Thejll et al. 2014) as the night's black body gives it, sunlight white, unit luminance
export const EARTHLIGHT_BV = 0.44;
export const EARTH_COLOUR = Object.freeze(bvColour(EARTHLIGHT_BV, [0, 0, 0]));
// the Earth's light at the Moon (lux, on a plane facing it): r its distance from the Sun and d from the Moon (km), a its
// phase angle as the Moon sees it (degrees: 0 is a full Earth, at new Moon)
export function earthLux(r, d, a) { return magLux(magnitudeOf('earth', r / AU, d / AU, a)); }

// ------------------------------------------------------------------------------------------- the eye looking at it
// A screen cannot show the Moon as its light: at full its face is 4,600 cd/m2 over a land lit at 0.03, a hundred
// thousand times the level the eye is adapted to, and through one curve for the whole picture it is a white disc in a
// white glow, with no face (the night's part drew it so: its glare stayed white a degree out). The eye does see its
// face: the cones that look at it adapt to its light, and a bright thing in a dark field is seen as a light of its own
// whose brightness grows far slower than its light. So, for the Moon alone (T-II: the method is mine, its laws are not):
//   · ITS BRIGHTNESS against the night grows over the eye's adapted level as the cube root of its light: S. S. Stevens'
//     power law for the brightness of a field (Psychophysics, 1975: 0.33 for a field of 5 degrees in the dark; the
//     night's points take his 0.5 for a point). adaptedLight(x, k): x a scene value, k the adapted level's own; under k
//     nothing changes. The Sun-lit face (by its mean), the earthlit face (by its mean) and the glare round it (place by
//     place) each go by it.
//   · ITS SUN-LIT FACE is seen in a frame of its own, as an eye adapted to it sees it: in proportion to its light (the
//     maria at their measured share of the highlands, a crater's shadow black, the terminator's fall as it falls), its
//     brightest tenth (`anchor` times its mean: moonmaps.js `bright`) where the eye's curve puts that brightness. Its
//     glare is seen in the same frame, so the disc stands clear of it. Below a third of white (by day, or rising in a
//     bright dusk) the Moon is simply part of the scene, as everything else is; between a third and six tenths the one
//     becomes the other.
//   · ITS EARTHLIT FACE is seen in the same frame, its mean by the same law, so beside the Sun-lit face it is shown as
//     the cube root of their ratio: a crescent 1,500 times the ashen light is shown 11 times as bright, and the ashen
//     light stands over the dusk sky as the eye finds it, faint and plain. (Seen as the night is, through the curve, it
//     came out a quarter as bright as the crescent: brighter than any ashen light.)
export const LOOK = Object.freeze({ power: 1 / 3, linear: Object.freeze([0.3, 0.6]), anchor: MOON_MAPS.bright });
export function adaptedLight(x, k) { return x <= k || !(k > 0) ? x : k * Math.pow(x / k, LOOK.power); }
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// how much of the Moon is in its own frame, by its face's mean scene value X once adapted
export const linearShare = (X) => smooth01(LOOK.linear[0], LOOK.linear[1], X);
// the frame's scale: a scene value in it is shown as that times this, so the brightest tenth (anchor X) is shown as
// bright as the curve shows it
export const faceScale = (X, curve = EYE.curve) => (X > 1e-9 ? shown(LOOK.anchor * X, curve) / (LOOK.anchor * X) : 1);

// ------------------------------------------------------------------------------------------- the face, at an instant
// createMoonFace(): face.at(when, L, lat, lon) with daylight.js's light record L (its Moon's place, distance and light
// time; the Sun's) fills `face`:
//   frame      9 numbers, row-major: a world direction (x east, y up, z south) to the Moon's own axes (x through its
//              prime meridian, z its north pole), as the Moon was turned when the light now arriving left it
//   sun, earth, eye   toward the Sun, the Earth's middle and the eye, from the Moon's middle, in its own axes
//   sunLux, earthLux  the Sun's and the Earth's light at the Moon (lux); earthPhase the Earth's phase angle seen from it
//   alpha, alphaEarth the phase angles the Sun-lit and the earthlit face are seen at (degrees); phiSun, phiEarth PHI there
//   sunRadius  the Sun's radius as the Moon sees it (radians): the shadows' soft edge
//   litMean    the Sun-lit part's mean luminance above the air (cd/m2): its light (the clockwork's magnitude law) over
//              the solid angle of the lit part; earthMean the earthlit face's, the same way (the near side's mean albedo)
//   subLon, subLat    the point under the eye from this frame (degrees): the librations, a check on the clockwork's own
export function createMoonFace() {
  const F = { frame: new Float64Array(9), sun: [0, 0, 1], earth: [1, 0, 0], eye: [1, 0, 0], sunLux: 0, earthLux: 0, earthPhase: 0, alpha: 0, alphaEarth: 0, phiSun: 1, phiEarth: 1, sunRadius: 0.00465, litMean: 0, earthMean: 0, distance: 0, subLon: 0, subLat: 0 };
  const Q = [0, 0, 0, 1], HZ = new Array(9), CE = Math.cos(OBLIQUITY), SE = Math.sin(OBLIQUITY), S = [0, 0, 0], G = [0, 0, 0], v = [0, 0, 0];
  const toMoon = (w, out) => { const m = F.frame; for (let k = 0; k < 3; k += 1) out[k] = m[3 * k] * w[0] + m[3 * k + 1] * w[1] + m[3 * k + 2] * w[2]; const n = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= n; out[1] /= n; out[2] /= n; return out; };
  function at(when, L, lat, lon) {
    const M = L.moon, ms = +when, dm = M.distance;
    // the Moon's axes: the IAU's rotation (ecliptic of J2000), onto the equator of J2000, onto the horizon of the instant
    orientation('moon', ms - 1000 * (M.lightTime || 0), Q);
    const [x, y, z, w] = Q;
    const R = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
    horizonMatrix(lat, lon, ms, HZ);
    for (let k = 0; k < 3; k += 1) {
      const ex = R[k], ey = R[3 + k], ez = R[6 + k], qx = ex, qy = CE * ey - SE * ez, qz = SE * ey + CE * ez;      // the axis on the J2000 equator
      const E = HZ[0] * qx + HZ[1] * qy + HZ[2] * qz, N = HZ[3] * qx + HZ[4] * qy + HZ[5] * qz, U = HZ[6] * qx + HZ[7] * qy + HZ[8] * qz;
      F.frame[3 * k] = E; F.frame[3 * k + 1] = U; F.frame[3 * k + 2] = -N;                          // the world's x east, y up, z south
    }
    // where the Sun and the Earth's middle stand from the Moon (km, world frame: the eye at the origin, the Earth's
    // middle under it), and the eye
    const Re = BODIES.earth.radii[0] + L.height;
    for (let k = 0; k < 3; k += 1) { S[k] = L.trueSun[k] * L.sunDistance - M.trueDir[k] * dm; G[k] = -M.trueDir[k] * dm; }
    G[1] -= Re;
    toMoon(S, F.sun); toMoon(G, F.earth); v[0] = -M.trueDir[0]; v[1] = -M.trueDir[1]; v[2] = -M.trueDir[2]; toMoon(v, F.eye);
    F.distance = dm;
    F.subLat = Math.asin(clamp(F.eye[2], -1, 1)) * R2D; F.subLon = ((Math.atan2(F.eye[1], F.eye[0]) * R2D) + 360) % 360;
    // the phase angles: the Sun-lit face is seen at the clockwork's own; the earthlit one between the Earth's middle and the eye
    F.alpha = M.phaseAngle; F.phiSun = phi(F.alpha);
    F.alphaEarth = Math.acos(clamp(F.earth[0] * F.eye[0] + F.earth[1] * F.eye[1] + F.earth[2] * F.eye[2], -1, 1)) * R2D; F.phiEarth = phi(F.alphaEarth);
    // the Sun at the Moon: its illuminance by the inverse square, and its radius there
    const ds = Math.hypot(S[0], S[1], S[2]);
    F.sunLux = M.lux > 0 && L.lux > 0 ? L.lux * (L.sunDistance / ds) ** 2 : 0; F.sunRadius = Math.asin(BODIES.sun.radii[0] / ds);
    // the Earth at the Moon: its phase angle is the angle at the Earth's middle between the Sun and the Moon
    const sx = L.trueSun[0] * L.sunDistance, sy = L.trueSun[1] * L.sunDistance + Re, sz = L.trueSun[2] * L.sunDistance, mx = -G[0], my = -G[1], mz = -G[2];
    const rs = Math.hypot(sx, sy, sz), rm = Math.hypot(mx, my, mz);
    F.earthPhase = Math.acos(clamp((sx * mx + sy * my + sz * mz) / (rs * rm), -1, 1)) * R2D;
    F.earthLux = earthLux(rs, rm, F.earthPhase);
    // the two faces' mean luminance above the air: the lit part's is its light over its solid angle; the earthlit's is
    // the law at the near side's mean albedo, lit and seen from (nearly) the same way
    const rad = M.radius * D2R;
    F.litMean = M.lux / (Math.PI * rad * rad * Math.max(M.phase, 1e-3));
    F.earthMean = F.earthLux * luminance(MOON_MAPS.rhoMean) * F.phiEarth / Math.PI;
    return F;
  }
  return { face: F, at };
}

// ------------------------------------------------------------------------------------------- the same, for the GPU
const f = (x) => { const s = Number(x).toPrecision(9); return /[.e]/.test(s) ? s : s + '.0'; };
const v3 = (a) => `vec3(${Array.from(a).map(f).join(', ')})`;
const KM_A = 2 * Math.PI * MOON_MAPS.radius / MOON_MAPS.albedo.w, KM_R = 2 * Math.PI * MOON_MAPS.radius / MOON_MAPS.relief.w;
// the shadow march: from 3 km out to 300 km, the steps growing by the same factor (16 of them, 8 on the lighter path)
export const MARCH = Object.freeze({ from: 3, to: 300, steps: 16, lite: 8 });
export const marchGrowth = (steps) => Math.pow(MARCH.to / MARCH.from, 1 / (steps - 1));
// MOON_GLSL: the Moon's light along a look that meets its disc. Its uniforms are set by sky.js.
export const MOON_GLSL = `
uniform sampler2D uMoonAlbedo;    // moon-albedo.jpg, as sRGB: the GPU hands back rho / RHO_MAX in linear light, filtered in light
uniform sampler2D uMoonRelief;    // moon-relief.png: the normal toward east and north, and the height
uniform mat3 uMoonFrame;          // a world direction (x east, y up, z south) to the Moon's own axes
uniform vec3 uMoonSun;            // toward the Sun from the Moon's middle, in its own axes
uniform vec3 uMoonEarth;          // toward the Earth's middle
uniform vec3 uMoonEye;            // toward the eye
uniform float uMoonSunK;          // the Sun's light at the Moon, times PHI at the Moon's phase angle, over pi, times the exposure
uniform vec3 uMoonEarthK;         // the same for the Earth's light (PHI where the earthlit face is seen), in its colour
uniform float uMoonKm;            // the Moon's distance (km): how much of its surface a pixel covers
uniform float uMoonSunR;          // the Sun's radius as the Moon sees it (radians): the shadows' soft edge
uniform vec2 uMoonMarch;          // the shadow march: how many steps, and the factor each grows by
const float M_PI = 3.14159265358979;
const float M_RHOMAX = ${f(MOON_MAPS.RHO_MAX)};
const float M_R = ${f(MOON_MAPS.radius)};
const float M_H0 = ${f(MOON_MAPS.H0)};
const float M_H1 = ${f(MOON_MAPS.H1)};
const float M_KMA = ${f(KM_A)};
const float M_KMR = ${f(KM_R)};
const float M_FROM = ${f(MARCH.from)};
// where a place (a unit vector in the Moon's own axes) falls in the two maps: longitude across from -180, latitude down from +90
vec2 moonUV(vec3 P) { return vec2(atan(P.y, P.x) * ${f(0.5 / Math.PI)} + 0.5, 0.5 - asin(clamp(P.z, -1.0, 1.0)) * ${f(1 / Math.PI)}); }
float moonHeight(vec3 P, float lod) { return M_H0 + (M_H1 - M_H0) * textureLod(uMoonRelief, moonUV(P), lod).b; }
// how much of the Sun's disc a place sees: along the ground toward the Sun, the highest the ground ahead stands (as seen
// from the place, the Moon's curvature in it) against the Sun's height there, by the share of a disc over a line
float moonSunSeen(vec3 P, float h0, float sinE, float lod0) {
  if (sinE > 0.5) return 1.0;                                     // the Sun 30 degrees up: no shadow a texel long
  if (sinE < -0.12) return 0.0;                                   // 7 degrees under: nothing on the Moon stands high enough
  vec3 t = normalize(uMoonSun - sinE * P);
  float hor = -1.0e9, d = M_FROM, shrink = 1.0 - 1.0 / uMoonMarch.y;
  for (int k = 0; k < 24; k++) {
    if (float(k) >= uMoonMarch.x) break;
    float b = d / M_R, cb = cos(b), sb = sin(b);
    float hq = moonHeight(cb * P + sb * t, max(lod0, log2(d * shrink / M_KMR)));
    hor = max(hor, ((M_R + hq) * cb - (M_R + h0)) / ((M_R + hq) * sb));
    d *= uMoonMarch.y;
  }
  float x = clamp((asin(clamp(sinE, -1.0, 1.0)) - atan(hor)) / uMoonSunR, -1.0, 1.0);
  return 0.5 + (x * sqrt(1.0 - x * x) + asin(x)) / M_PI;
}
// the Moon's light along a look meeting its disc, in scene values (the exposure is in uMoonSunK and uMoonEarthK): the
// Sun's light off its face, and the Earth's. nw: the sphere's face there (world, toward the eye); px: a pixel (radians)
void moonLight(vec3 nw, float px, out vec3 sunlit, out vec3 earthlit) {
  vec3 P = uMoonFrame * nw;
  float muS = max(dot(P, uMoonEye), 0.0);
  // how much of the surface the pixel covers (km, its geometric mean as it is foreshortened toward the limb): which
  // level of each map to read, so that the face neither sparkles nor blurs
  float foot = px * uMoonKm / sqrt(max(muS, 0.02)), lodR = max(0.0, log2(foot / M_KMR));
  vec2 uv = moonUV(P);
  vec3 rho = textureLod(uMoonAlbedo, uv, max(0.0, log2(foot / M_KMA))).rgb * M_RHOMAX;
  vec4 rel = textureLod(uMoonRelief, uv, lodR);
  vec2 en = rel.rg * 2.0 - 1.0;
  float lp = length(P.xy);
  vec3 E = lp > 1.0e-6 ? vec3(-P.y, P.x, 0.0) / lp : vec3(0.0, 1.0, 0.0), N = cross(P, E);
  vec3 n = normalize(en.x * E + en.y * N + sqrt(max(0.0, 1.0 - dot(en, en))) * P);
  // at the limb the sphere's own shape is what is seen: a slope turned from the eye there would be hidden by the ground in
  // front of it, which this does not draw, so the relief fades into the sphere over the last tenth of the radius
  n = normalize(mix(P, n, smoothstep(0.0, 0.2, muS)));
  float mu = max(dot(n, uMoonEye), 1.0e-4), mu0 = max(dot(n, uMoonSun), 0.0), mu0e = max(dot(n, uMoonEarth), 0.0);
  float seen = mu0 > 0.0 ? moonSunSeen(P, M_H0 + (M_H1 - M_H0) * rel.b, dot(P, uMoonSun), lodR) : 0.0;
  sunlit = uMoonSunK * rho * (2.0 * mu0 / (mu0 + mu)) * seen;
  earthlit = uMoonEarthK * rho * (2.0 * mu0e / (mu0e + mu));
}
`;
export { MOON_MAPS, PHI, MOON_CREDIT };
