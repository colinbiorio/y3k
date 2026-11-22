// air.js — THE AIR, AS NUMBERS: what the Earth's atmosphere does to sunlight, in real units. No page and no three
// in it: the tests run it, and sky.js draws with it. The method is S. Hillaire's "A Scalable and Production Ready
// Sky and Atmosphere Rendering Technique" (EGSR 2020), ported from the paper and from his reference implementation
// (github.com/sebh/UnrealEngineSkyAtmosphere, MIT; the notice is kept at the foot of this file): a table of the
// air's transmittance, a table of its multiple scattering, and a march along each line of sight that reads both.
//
// THE MEDIUM (kilometres and 1/km; three wavelengths stand for red, green and blue: 680, 550 and 440 nm):
//   · Rayleigh: the clear air itself. Its depth straight up is the measured one (J. E. Hansen and L. D. Travis,
//     Space Sci. Rev. 16, 527 (1974): 0.008569 λ^-4 (1 + 0.0113 λ^-2 + 0.00013 λ^-4), λ in µm, at 1013.25 hPa),
//     at the pressure bodies.js carries for the Earth (NASA's fact sheet: 1014 hPa). Its thinning with height is
//     the U.S. Standard Atmosphere's (1976): seven layers of temperature, the density following from each. One
//     exponential (the paper's 8 km, or the fact sheet's 8.5) is right near the ground and for the whole column,
//     and two to three times too dense from 30 to 50 km, which is the air twilight is made of.
//   · Mie: the haze of a clean sea air. Depth 0.06 at 550 nm (the open ocean's usual 0.06 to 0.07 at 500 nm:
//     A. Smirnov et al., J. Atmos. Sci. 59, 501 (2002) and J. Geophys. Res. 114, D06204 (2009)); sea salt hardly
//     absorbs (single-scattering albedo 0.99); grey; in the lowest air (scale height 1.2 km) and thrown forward
//     (Cornette-Shanks, g = 0.8): the last two as the paper has them. The weather is not modelled: this is one day.
//   · Ozone: 300 Dobson units in one layer, a tent from 10 to 40 km with its peak at 25, absorbing as E. Bruneton's
//     2017 model has it (which the paper takes): without it twilight is not blue.
//   · The ground is the sea: it gives back 6% of what falls on it.
// THE EARTH: a sphere of its mean radius (bodies.js); the air ends 100 km up. A ray is followed in the observer's
// own frame (y up): only heights above the ground are ever formed, by differences that keep their figures in a
// GPU's single precision (a metre in 6,371 km is the seventh figure).
// THE SUN: its illuminance above the air is the solar constant times the luminous efficacy of sunlight, by the
// inverse square of its true distance. It is taken as white there (as the clockwork takes it), so the three
// numbers of a colour are each "lux, were the light white" and Y = 0.2126 R + 0.7152 G + 0.0722 B is the luminance.
// THE EYE: how bright the scene is shown (exposure), and how that follows the scene in time.
import { BODIES, AU } from './bodies.js';

const PI = Math.PI;
const EARTH = BODIES.earth;
export const WAVES = [0.68, 0.55, 0.44];                                  // µm: red, green, blue
const hansenTravis = (um) => 0.008569 * um ** -4 * (1 + 0.0113 * um ** -2 + 0.00013 * um ** -4);

// The U.S. Standard Atmosphere, 1976 (NOAA, NASA, USAF), to 86 km: geopotential heights (km) where a layer begins,
// the temperature's rise through it (K/km), 288.15 K at the sea; g0 M / R* = 34.1632 K/km. The density at each
// layer's foot follows from the one below. Above the last the temperature is held (the air there is a millionth).
const STD = (() => {
  const from = [0, 11, 20, 32, 47, 51, 71, 84.852], lapse = [-6.5, 0, 1, 2.8, 0, -2.8, -2, 0], GMR = 34.1632, layers = [];
  let T = 288.15, d = 1;
  for (let i = 0; i < from.length; i += 1) {
    layers.push({ z: from[i], T, lapse: lapse[i], d, power: lapse[i] ? -(GMR / lapse[i] + 1) : 0, scale: T / GMR });
    if (i + 1 < from.length) { const dz = from[i + 1] - from[i]; d *= lapse[i] ? Math.pow(1 + lapse[i] * dz / T, -(GMR / lapse[i] + 1)) : Math.exp(-dz * GMR / T); T += lapse[i] * dz; }
  }
  return Object.freeze({ radius: 6356.766, layers });      // its Earth's radius (km), for turning a height into a geopotential one
})();
// the clear air's density over its density at the sea, h km up
export function airDensity(h) {
  const z = STD.radius * h / (STD.radius + h), L = STD.layers;
  let k = L.length - 1; while (k > 0 && z < L[k].z) k -= 1;
  const l = L[k];
  return l.lapse ? l.d * Math.pow(1 + l.lapse * (z - l.z) / l.T, l.power) : l.d * Math.exp(-(z - l.z) / l.scale);
}
// the whole column of it, were it all as dense as at the sea (km): 8.45 (P / (rho g) is 8.43; gravity eases with height)
const RAY_SCALE = (() => { const n = 4000; let s = 0; for (let i = 0; i <= n; i += 1) s += (i === 0 || i === n ? 1 : i & 1 ? 4 : 2) * airDensity(100 * i / n); return s * 100 / (3 * n); })();
const RAY_DEPTH = WAVES.map((w) => hansenTravis(w) * EARTH.atmosphere.pressure / 101325);
const MIE = { scale: 1.2, depth: 0.06, albedo: 0.99, g: 0.8 };
export const AIR = Object.freeze({
  ground: (2 * EARTH.radii[0] + EARTH.radii[2]) / 3,                      // km: the Earth's mean radius
  height: 100,                                                            // km of air over it
  rayleigh: Object.freeze({ column: RAY_SCALE, depth: RAY_DEPTH, scatter: RAY_DEPTH.map((d) => d / RAY_SCALE) }),      // column: km of sea-level air the whole of it comes to
  mie: Object.freeze({ ...MIE, extinct: MIE.depth / MIE.scale, scatter: MIE.albedo * MIE.depth / MIE.scale }),
  ozone: Object.freeze({ centre: 25, half: 15, absorb: [0.000650, 0.001881, 0.000085] }),
  albedo: 0.06,
});
// the Sun above the air. 1361 W/m2 is the IAU's nominal solar constant (2015 Resolution B3). The efficacy is
// 133.8 klx over 1366.1 W/m2: the luminous solar constant of S. Darula, R. Kittler and C. Gueymard, Solar Energy 79,
// 559 (2005), as Kittler and Darula quote it, over the solar constant it was worked out with. Limb darkening:
// D. Hestroffer and C. Magnan, Astron. Astrophys. 333, 338 (1998): I(µ) = µ^a, a = -0.023 + 0.292 / λ (µm).
export const SUN = Object.freeze({ irradiance: 1361, efficacy: 133800 / 1366.1, limb: WAVES.map((w) => -0.023 + 0.292 / w) });
export function sunIlluminance(km = AU) { return SUN.irradiance * SUN.efficacy * (AU / km) * (AU / km); }      // lux, on a plane facing it
// the mean luminance of its disc (cd/m2), `radius` its angular radius in degrees
export function sunLuminance(lux, radius) { const s = Math.sin(radius * PI / 180); return lux / (PI * s * s); }
export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// the tables' sizes (the paper's): transmittance, multiple scattering, the sky as seen, the air between eye and land
export const LUT = Object.freeze({ T: [256, 64], MS: 32, SKY: [192, 108], AP: [32, 32], AP_KM: 128, STEPS: 32, lite: Object.freeze({ SKY: [128, 72], AP: [16, 16], STEPS: 20 }) });

const RG = AIR.ground, HT = AIR.height, K_TOP = HT * (2 * RG + HT), H_TOP = Math.sqrt(K_TOP);
const bR = AIR.rayleigh.scatter, bMs = AIR.mie.scatter, bMe = AIR.mie.extinct, bO = AIR.ozone.absorb, G = AIR.mie.g;
const iHM = 1 / AIR.mie.scale;
const ozone = (h) => Math.max(0, 1 - Math.abs(h - AIR.ozone.centre) / AIR.ozone.half);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// how high (km above the ground) the point t km along a ray is, that leaves height h0 with zenith cosine mu
export function heightAlong(h0, mu, t) { const r0 = RG + h0, q = t * (t + 2 * r0 * mu); return (h0 * (2 * RG + h0) + q) / (Math.sqrt(r0 * r0 + q) + RG); }
// how far to the top of the air, and to the ground (Infinity if the ray clears it)
export function toTop(h0, mu) { const rmu = (RG + h0) * mu, kt = (HT - h0) * (2 * RG + HT + h0), sq = Math.sqrt(Math.max(0, rmu * rmu + kt)); return rmu > 0 ? kt / (rmu + sq) : sq - rmu; }
export function toGround(h0, mu) { const rmu = (RG + h0) * mu, k0 = h0 * (2 * RG + h0), D = rmu * rmu - k0; return mu < 0 && D >= 0 ? k0 / (Math.sqrt(D) - rmu) : Infinity; }

// the air's optical depth from height h0 to its top along zenith cosine mu, in the three colours (Simpson's rule)
export function opticalDepth(h0, mu, out = [0, 0, 0], n = 256) {
  const d = toTop(h0, mu);
  let sr = 0, sm = 0, so = 0;
  for (let i = 0; i <= n; i += 1) {
    const h = heightAlong(h0, mu, d * i / n), w = i === 0 || i === n ? 1 : i & 1 ? 4 : 2;
    sr += w * airDensity(h); sm += w * Math.exp(-h * iHM); so += w * ozone(h);
  }
  const k = d / (3 * n);
  for (let c = 0; c < 3; c += 1) out[c] = k * (bR[c] * sr + bMe * sm + bO[c] * so);
  return out;
}

// ------------------------------------------------------------------------------------------- the two tables
// Both depend only on the air, so they are worked out once, here, in doubles, and handed to the GPU as they are:
// what the tests measure is what the picture reads.
function sample(lut, u, v, out) {
  const W = lut.w, H = lut.h, a = lut.data;
  const x = clamp(u * W - 0.5, 0, W - 1), y = clamp(v * H - 0.5, 0, H - 1), i = Math.min(W - 2, Math.floor(x)), j = Math.min(H - 2, Math.floor(y)), fx = x - i, fy = y - j;
  const p = 4 * (j * W + i), q = p + 4 * W, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  out[0] = w00 * a[p] + w10 * a[p + 4] + w01 * a[q] + w11 * a[q + 4];
  out[1] = w00 * a[p + 1] + w10 * a[p + 5] + w01 * a[q + 1] + w11 * a[q + 5];
  out[2] = w00 * a[p + 2] + w10 * a[p + 6] + w01 * a[q + 2] + w11 * a[q + 6];
  return out;
}
// TRANSMITTANCE: how much of a ray's light survives from height h to the top of the air. Laid out as E. Bruneton
// lays it (which the paper takes): across, how far the ray goes to the top, from straight up to grazing the
// ground; up, the distance to the horizon. (A ray into the ground is not in it: the ground's shadow is found apart.)
// The table's first and last entries stand exactly on those ends, as Bruneton has it; the reference lets that go.
let TLUT = null;
export function transmittanceLUT() {
  if (TLUT) return TLUT;
  const [W, H] = LUT.T, data = new Float32Array(W * H * 4), od = [0, 0, 0];
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
    const rho = H_TOP * j / (H - 1), h = rho * rho / (Math.sqrt(rho * rho + RG * RG) + RG), dMin = HT - h, dMax = rho + H_TOP, d = dMin + i / (W - 1) * (dMax - dMin);
    const mu = d === 0 ? 1 : clamp((K_TOP - rho * rho - d * d) / (2 * (RG + h) * d), -1, 1), p = 4 * (j * W + i);
    opticalDepth(h, mu, od, 128);
    data[p] = Math.exp(-od[0]); data[p + 1] = Math.exp(-od[1]); data[p + 2] = Math.exp(-od[2]); data[p + 3] = 1;
  }
  TLUT = { w: W, h: H, data };
  return TLUT;
}
export function transmittance(h, mu, out = [0, 0, 0]) {
  const d = toTop(h, mu), rho = Math.sqrt(Math.max(0, h * (2 * RG + h))), dMin = HT - h, dMax = rho + H_TOP;
  const lut = TLUT || transmittanceLUT(), W = lut.w, H = lut.h;      // the first and last of a row or a column stand exactly on the ends
  return sample(lut, ((d - dMin) / (dMax - dMin) * (W - 1) + 0.5) / W, (rho / H_TOP * (H - 1) + 0.5) / H, out);
}

// The Earth's own shadow on a ray: the stretch of it (in km along it) that lies in the cylinder behind the planet.
// r0: the start's distance from the centre; k0 = r0^2 - Rg^2; rmu = r0 mu; sy: the Sun's zenith cosine at the
// start; nu: the cosine between ray and Sun. out = [from, to]; from >= to where no part of it is in shadow.
// (The paper asks each sample whether the ground hides the Sun; finding the stretch once puts the samples on both
// sides of the shadow's edge instead of across it, which is what keeps twilight from banding.)
function shadowSpan(r0, k0, rmu, sy, nu, tMax, out) {
  const a = r0 * sy, A = Math.max(0, 1 - nu * nu), B = rmu - a * nu, C = k0 - a * a;
  let t1 = -Infinity, t2 = Infinity;
  out[0] = out[1] = tMax;
  if (A < 1e-9) { if (C >= 0) return out; }
  else {
    const D = B * B - A * C; if (D <= 0) return out;
    const q = Math.sqrt(D);
    if (B > 0) { t1 = (-B - q) / A; t2 = C / (A * t1); } else if (B < 0) { t2 = (q - B) / A; t1 = C / (A * t2); } else { t1 = -q / A; t2 = q / A; }
  }
  const lo = Math.max(t1, 0), hi = Math.min(t2, tMax);
  if (hi <= lo || a + nu * 0.5 * (lo + hi) >= 0) return out;
  out[0] = lo; out[1] = hi;
  return out;
}
const rayleighPhase = (nu) => 3 / (16 * PI) * (1 + nu * nu);
const miePhase = (nu) => 3 / (8 * PI) * (1 - G * G) / (2 + G * G) * (1 + nu * nu) / Math.pow(1 + G * G - 2 * G * nu, 1.5);

// MULTIPLE SCATTERING (the paper's section 5.5): for a height and a height of the Sun, the light that has been
// scattered twice or more, taken as the same in every direction. 64 directions round the point; along each, what
// the Sun's light scatters toward the point once (L2, with the ground's bounce) and how much of a uniform glow
// would be scattered on (f); then every later order is the geometric series L2 / (1 - f).
const span = [0, 0], tr = [0, 0, 0];
let MLUT = null;
export function multiScatteringLUT() {
  if (MLUT) return MLUT;
  transmittanceLUT();
  const N = LUT.MS, data = new Float32Array(N * N * 4), fs = new Float32Array(N * N * 3), STEPS = 32, dirs = [];
  for (let i = 0; i < 8; i += 1) for (let j = 0; j < 8; j += 1) {
    const th = 2 * PI * (i + 0.5) / 8, cp = 1 - 2 * (j + 0.5) / 8, sp = Math.sqrt(1 - cp * cp);
    dirs.push([Math.cos(th) * sp, cp, Math.sin(th) * sp]);
  }
  const sub = (x) => clamp((x - 0.5 / N) * (N / (N - 1)), 0, 1), L = [0, 0, 0], F = [0, 0, 0];
  for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
    const mus = sub((i + 0.5) / N) * 2 - 1, h0 = clamp(sub((j + 0.5) / N) * HT, 1e-3, HT - 1e-3), sx = Math.sqrt(1 - mus * mus);
    const r0 = RG + h0, k0 = h0 * (2 * RG + h0);
    L[0] = L[1] = L[2] = F[0] = F[1] = F[2] = 0;
    for (const d of dirs) {
      const mu = d[1], rmu = r0 * mu, nu = d[0] * sx + d[1] * mus, tg = toGround(h0, mu), tMax = Math.min(tg, toTop(h0, mu));
      shadowSpan(r0, k0, rmu, mus, nu, tMax, span);
      let t0 = 1, t1 = 1, t2 = 1;                                     // what is left of the light, in three colours
      for (let k = 0; k < 3; k += 1) {
        const ta = k === 0 ? 0 : k === 1 ? span[0] : span[1], tb = k === 0 ? span[0] : k === 1 ? span[1] : tMax, lit = k !== 1;
        if (tb - ta < 1e-6) continue;
        const dt = (tb - ta) / STEPS;
        for (let s = 0; s < STEPS; s += 1) {
          const t = ta + (s + 0.5) * dt, q = t * (t + 2 * rmu), r = Math.sqrt(r0 * r0 + q), h = clamp((k0 + q) / (r + RG), 0, HT);
          const dR = airDensity(h), dM = Math.exp(-h * iHM), dO = ozone(h);
          if (lit) transmittance(h, (r0 * mus + t * nu) / r, tr);
          for (let c = 0; c < 3; c += 1) {
            const sc = bR[c] * dR + bMs * dM, ex = sc + (bMe - bMs) * dM + bO[c] * dO, T = Math.exp(-ex * dt), thr = c === 0 ? t0 : c === 1 ? t1 : t2, part = thr * (1 - T) / ex;
            if (lit) L[c] += part * tr[c] * sc / (4 * PI);
            F[c] += part * sc;
            if (c === 0) t0 *= T; else if (c === 1) t1 *= T; else t2 *= T;
          }
        }
      }
      if (tg < Infinity) {                                              // the ray ends on the ground: its bounce
        const mg = (r0 * mus + tg * nu) / RG;
        if (mg > 0) { transmittance(0, mg, tr); L[0] += tr[0] * t0 * mg * AIR.albedo / PI; L[1] += tr[1] * t1 * mg * AIR.albedo / PI; L[2] += tr[2] * t2 * mg * AIR.albedo / PI; }
      }
    }
    const p = 4 * (j * N + i), f = 3 * (j * N + i);
    for (let c = 0; c < 3; c += 1) { const fm = F[c] / dirs.length; fs[f + c] = fm; data[p + c] = (L[c] / dirs.length) / (1 - fm); }
    data[p + 3] = 1;
  }
  MLUT = { w: N, h: N, data, f: fs };
  return MLUT;
}
const ms = [0, 0, 0];
function multiScattering(h, mus, out) {
  const N = LUT.MS, u = (clamp(mus * 0.5 + 0.5, 0, 1) + 0.5 / N) * (N / (N + 1)), v = (clamp(h / HT, 0, 1) + 0.5 / N) * (N / (N + 1));
  return sample(MLUT || multiScatteringLUT(), u, v, out);
}

// ------------------------------------------------------------------------------------------- a line of sight
// skyRay(h0, d, s, n, out): the light the air sends down a line of sight, for a Sun of illuminance 1 above the air.
// h0 km above the ground; d the direction looked along and s the Sun's, unit vectors with y up; n samples to each
// stretch of the ray (before the Earth's shadow, in it, after it), closer together near the eye. out[0..2] the
// luminance, out[3..5] what survives of the light from beyond. Line for line the same as the GPU's (AIR_GLSL).
const sp2 = [0, 0];
export function skyRay(h0, d, s, n = LUT.STEPS, out = [0, 0, 0, 1, 1, 1], reach = Infinity) {
  if (!MLUT) multiScatteringLUT();
  h0 = clamp(h0, 0, HT - 1e-3);
  const r0 = RG + h0, k0 = h0 * (2 * RG + h0), mu = d[1], rmu = r0 * mu, nu = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
  const tg = toGround(h0, mu), tMax = Math.min(tg, toTop(h0, mu), reach), pR = rayleighPhase(nu), pM = miePhase(nu);
  shadowSpan(r0, k0, rmu, s[1], nu, tMax, sp2);
  let L0 = 0, L1 = 0, L2 = 0, t0 = 1, t1 = 1, t2 = 1;
  for (let k = 0; k < 3; k += 1) {
    const ta = k === 0 ? 0 : k === 1 ? sp2[0] : sp2[1], tb = k === 0 ? sp2[0] : k === 1 ? sp2[1] : tMax, lit = k !== 1;
    if (tb - ta < 1e-6) continue;
    for (let i = 0; i < n; i += 1) {
      const u0 = i / n, u1 = (i + 1) / n, a = ta + (tb - ta) * u0 * u0, dt = (tb - ta) * (u1 * u1 - u0 * u0), t = a + 0.3 * dt;
      const q = t * (t + 2 * rmu), r = Math.sqrt(r0 * r0 + q), h = clamp((k0 + q) / (r + RG), 0, HT), mus = (r0 * s[1] + t * nu) / r;
      const dR = airDensity(h), dM = Math.exp(-h * iHM), dO = ozone(h);
      if (lit) transmittance(h, mus, tr); else tr[0] = tr[1] = tr[2] = 0;
      multiScattering(h, mus, ms);
      for (let c = 0; c < 3; c += 1) {
        const sR = bR[c] * dR, sM = bMs * dM, ex = sR + bMe * dM + bO[c] * dO, x = ex * dt, T = Math.exp(-x), part = x < 1e-4 ? dt * (1 - 0.5 * x) : (1 - T) / ex;
        const S = tr[c] * (sR * pR + sM * pM) + ms[c] * (sR + sM);
        if (c === 0) { L0 += t0 * S * part; t0 *= T; } else if (c === 1) { L1 += t1 * S * part; t1 *= T; } else { L2 += t2 * S * part; t2 *= T; }
      }
    }
  }
  if (tg <= tMax) {                                                       // it ends on the sea: the Sun's light off it
    const mg = (r0 * s[1] + tg * nu) / RG;
    if (mg > 0) { transmittance(0, mg, tr); L0 += tr[0] * t0 * mg * AIR.albedo / PI; L1 += tr[1] * t1 * mg * AIR.albedo / PI; L2 += tr[2] * t2 * mg * AIR.albedo / PI; }
  }
  out[0] = L0; out[1] = L1; out[2] = L2; out[3] = t0; out[4] = t1; out[5] = t2;
  return out;
}
// the sky's light on level ground (its irradiance, for a Sun of illuminance 1), from height h0 under a Sun whose
// zenith cosine is sunUp: the sky's luminance times the cosine, summed over the half of the dome on one side of the
// Sun (the other is its mirror), finer toward the Sun's azimuth, where the haze is brightest
const ray6 = [0, 0, 0, 1, 1, 1], dirI = [0, 0, 0], sunI = [0, 0, 0];
export function skyIrradiance(h0, sunUp, out = [0, 0, 0], na = 24, nz = 24, n = 20) {
  sunI[0] = Math.sqrt(Math.max(0, 1 - sunUp * sunUp)); sunI[1] = sunUp; sunI[2] = 0;
  out[0] = out[1] = out[2] = 0;
  for (let j = 0; j < na; j += 1) {
    const c0 = j / na, c1 = (j + 1) / na, az = PI * (c0 + c1) * (c0 + c1) / 4, daz = PI * (c1 * c1 - c0 * c0);
    for (let i = 0; i < nz; i += 1) {
      const th = PI / 2 * (i + 0.5) / nz, st = Math.sin(th), ct = Math.cos(th), w = 2 * ct * st * (PI / 2 / nz) * daz;
      dirI[0] = st * Math.cos(az); dirI[1] = ct; dirI[2] = st * Math.sin(az);
      skyRay(h0, dirI, sunI, n, ray6);
      out[0] += w * ray6[0]; out[1] += w * ray6[1]; out[2] += w * ray6[2];
    }
  }
  return out;
}
// the Sun's own light through the air (for a Sun of illuminance 1): what is left of it at height h0 when its
// apparent zenith cosine is sunUp, and how much of its disc (radius in degrees) stands clear of the sea's horizon
export function sunThrough(h0, sunUp, radius = 0.2666, out = [0, 0, 0]) {
  const dip = -Math.sqrt(h0 * (2 * RG + h0)) / (RG + h0), alt = Math.asin(clamp(sunUp, -1, 1)) - Math.asin(dip), r = radius * PI / 180;
  const x = clamp(alt / r, -1, 1), clear = 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / PI;      // the share of a disc above a line
  transmittance(h0, Math.max(sunUp, dip), out);
  out[0] *= clear; out[1] *= clear; out[2] *= clear;
  return out;
}

// ------------------------------------------------------------------------------------------- the eye
// How bright the scene is shown. The picture has no tone curve of its own (what is brighter than the screen is
// simply white), so exposure is the whole of it: shown = luminance * exposure. By day the scene's average is shown
// where a camera's meter puts a grey card: 18% / sqrt(2) = 12.7% of the brightest the screen can show (the
// saturation-based speed of ISO 12232: half a stop kept for the highlights), which is also where the island's
// own noon stood before any of this. A dimmer scene is shown dimmer, as the eye sees it, by the key of
// G. Krawczyk, K. Myszkowski and H.-P. Seidel ("Perceptual effects in real-time tone mapping", SCCG 2005):
// a(L) = 1.03 - 2 / (2 + log10(L + 1)), taken here relative to full day. `floor` is the least the eye is ever
// adapted to: the night sky's own glow. Nothing draws that glow yet (the night is the next step); the number is
// here so that the exposure does not run away after dusk. The eye follows a scene that brightens in half a second
// and one that darkens in two and a half (the real eye takes minutes to the dark; a game cannot wait that long).
export const EYE = Object.freeze({ grey: 0.18 / Math.SQRT2, day: 4000, floor: 2e-4, toLight: 0.5, toDark: 2.5 });
const krawczyk = (L) => 1.03 - 2 / (2 + Math.log10(L + 1));
export function keyFor(L) { return EYE.grey * krawczyk(Math.max(L, 0)) / krawczyk(EYE.day); }
export function exposureFor(L) { const l = Math.max(L, EYE.floor); return keyFor(l) / l; }
// the luminance the eye is adapted to, dt seconds on, toward the scene's
export function adapt(was, scene, dt) {
  const to = Math.max(scene, EYE.floor);
  if (!(was > 0)) return to;
  return was * Math.pow(to / was, 1 - Math.exp(-dt / (to > was ? EYE.toLight : EYE.toDark)));
}
// the scene's luminance as a meter reads it: the mean of the logarithms (one bright patch does not rule it)
export function meter(samples) { let s = 0, n = 0; for (const L of samples) { s += Math.log(Math.max(L, 1e-6)); n += 1; } return n ? Math.exp(s / n) : EYE.floor; }
// The eye's own veil round a bright light (disability glare): the luminance laid over the scene per lux at the eye,
// `deg` degrees from the light. The CIE's general disability glare equation (CIE 146:2002, after J. J. Vos, 1999):
// 10/θ^3 + (5/θ^2 + 0.1 p/θ)(1 + (A/62.5)^4) + 0.0025 p, for 0.1 to 100 degrees, age A and eye pigment p.
export const GLARE = Object.freeze({ age: 30, pigment: 0.5 });
export function veil(deg) { const t = Math.max(deg, 0.1), k = 1 + (GLARE.age / 62.5) ** 4; return 10 / (t * t * t) + (5 / (t * t) + 0.1 * GLARE.pigment / t) * k + 0.0025 * GLARE.pigment; }

// ------------------------------------------------------------------------------------------- the same, for the GPU
// One chunk of GLSL that sky.js puts in front of its passes: the medium, the two tables' look-ups, the shadow's
// stretch and the march. The numbers are written from the constants above, so the two cannot drift apart.
const f = (x) => { const s = Number(x).toPrecision(9); return /[.e]/.test(s) ? s : s + '.0'; };
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
export const AIR_GLSL = `
const float A_PI = 3.14159265358979;
const float A_RG = ${f(RG)};
const float A_HT = ${f(HT)};
const float A_HTOP = ${f(H_TOP)};
const vec3 A_BR = ${v3(bR)};
const float A_BMS = ${f(bMs)};
const float A_BME = ${f(bMe)};
const vec3 A_BO = ${v3(bO)};
const float A_G = ${f(G)};
const float A_MS = ${f(LUT.MS)};
const vec2 A_TSIZE = vec2(${f(LUT.T[0])}, ${f(LUT.T[1])});
const float A_ALBEDO = ${f(AIR.albedo)};
uniform sampler2D uAirT;
uniform sampler2D uAirMS;
vec3 airT(float h, float mu) {
  float rmu = (A_RG + h) * mu, kt = (A_HT - h) * (2.0 * A_RG + A_HT + h), sq = sqrt(max(0.0, rmu * rmu + kt));
  float d = rmu > 0.0 ? kt / (rmu + sq) : sq - rmu, rho = sqrt(max(0.0, h * (2.0 * A_RG + h)));
  float dMin = A_HT - h, dMax = rho + A_HTOP;
  return texture2D(uAirT, (vec2((d - dMin) / (dMax - dMin), rho / A_HTOP) * (A_TSIZE - 1.0) + 0.5) / A_TSIZE).rgb;
}
vec3 airMS(float h, float mus) {
  vec2 uv = (clamp(vec2(mus * 0.5 + 0.5, h / A_HT), 0.0, 1.0) + 0.5 / A_MS) * (A_MS / (A_MS + 1.0));
  return texture2D(uAirMS, uv).rgb;
}
// the clear air's density over its density at the sea (U.S. Standard Atmosphere, 1976)
float airRho(float h) {
  float z = ${f(STD.radius)} * h / (${f(STD.radius)} + h);
${STD.layers.slice().reverse().map((l, i, a) => `  ${i < a.length - 1 ? `if (z >= ${f(l.z)}) ` : ''}return ${l.lapse ? `${f(l.d)} * pow(1.0 + ${f(l.lapse / l.T)} * (z - ${f(l.z)}), ${f(l.power)})` : `${f(l.d)} * exp(-(z - ${f(l.z)}) / ${f(l.scale)})`};`).join('\n')}
}
float airToTop(float h0, float mu) { float rmu = (A_RG + h0) * mu, kt = (A_HT - h0) * (2.0 * A_RG + A_HT + h0), sq = sqrt(max(0.0, rmu * rmu + kt)); return rmu > 0.0 ? kt / (rmu + sq) : sq - rmu; }
// how far to the ground, or -1 where the ray clears it
float airToGround(float h0, float mu) { float rmu = (A_RG + h0) * mu, k0 = h0 * (2.0 * A_RG + h0), D = rmu * rmu - k0; return (mu < 0.0 && D >= 0.0) ? k0 / (sqrt(D) - rmu) : -1.0; }
vec2 airShadow(float r0, float k0, float rmu, vec3 d, vec3 s, float nu, float tMax) {
  vec3 x = cross(d, s);
  float a = r0 * s.y, A = dot(x, x), B = rmu - a * nu, C = k0 - a * a, t1 = -1.0e9, t2 = 1.0e9;
  if (A < 1.0e-9) { if (C >= 0.0) return vec2(tMax); }
  else {
    float D = B * B - A * C; if (D <= 0.0) return vec2(tMax);
    float q = sqrt(D);
    if (B > 0.0) { t1 = (-B - q) / A; t2 = C / (A * t1); } else if (B < 0.0) { t2 = (q - B) / A; t1 = C / (A * t2); } else { t1 = -q / A; t2 = q / A; }
  }
  float lo = max(t1, 0.0), hi = min(t2, tMax);
  if (hi <= lo || a + nu * 0.5 * (lo + hi) >= 0.0) return vec2(tMax);
  return vec2(lo, hi);
}
// the light down a line of sight (for a Sun of illuminance 1) and what survives along it (thr). h0 km above the
// ground, d the way looked, s the Sun's, y up; tEnd: where to stop short (or a large number); n samples a stretch;
// near: 1 puts them closer together toward the eye, 0 spaces them evenly; bounce: 1 adds the Sun's light off the sea
vec3 airMarch(float h0, vec3 d, vec3 s, float tEnd, int n, float near, float bounce, out vec3 thr) {
  h0 = clamp(h0, 0.0, A_HT - 0.001);
  float r0 = A_RG + h0, k0 = h0 * (2.0 * A_RG + h0), mu = d.y, rmu = r0 * mu, nu = dot(d, s);
  float tg = airToGround(h0, mu), tMax = min(tg < 0.0 ? airToTop(h0, mu) : min(tg, airToTop(h0, mu)), tEnd);
  float pR = 3.0 / (16.0 * A_PI) * (1.0 + nu * nu);
  float pM = 3.0 / (8.0 * A_PI) * (1.0 - A_G * A_G) / (2.0 + A_G * A_G) * (1.0 + nu * nu) / pow(1.0 + A_G * A_G - 2.0 * A_G * nu, 1.5);
  vec2 sp = airShadow(r0, k0, rmu, d, s, nu, tMax);
  vec3 L = vec3(0.0); thr = vec3(1.0);
  for (int k = 0; k < 3; k++) {
    float ta = k == 0 ? 0.0 : (k == 1 ? sp.x : sp.y), tb = k == 0 ? sp.x : (k == 1 ? sp.y : tMax), lit = k == 1 ? 0.0 : 1.0;
    if (tb - ta < 1.0e-6) continue;
    for (int i = 0; i < n; i++) {
      float u0 = float(i) / float(n), u1 = float(i + 1) / float(n);
      u0 = mix(u0, u0 * u0, near); u1 = mix(u1, u1 * u1, near);
      float dt = (tb - ta) * (u1 - u0), t = ta + (tb - ta) * u0 + mix(0.5, 0.3, near) * dt;
      float q = t * (t + 2.0 * rmu), r = sqrt(r0 * r0 + q), h = clamp((k0 + q) / (r + A_RG), 0.0, A_HT), mus = (r0 * s.y + t * nu) / r;
      float dR = airRho(h), dM = exp(-h * ${f(iHM)}), dO = max(0.0, 1.0 - abs(h - ${f(AIR.ozone.centre)}) / ${f(AIR.ozone.half)});
      vec3 sR = A_BR * dR; float sM = A_BMS * dM;
      vec3 ex = sR + A_BME * dM + A_BO * dO, x = ex * dt, T = exp(-x);
      vec3 part = mix((1.0 - T) / max(ex, vec3(1.0e-12)), dt * (1.0 - 0.5 * x), step(x, vec3(1.0e-4)));
      vec3 S = lit * airT(h, mus) * (sR * pR + sM * pM) + airMS(h, mus) * (sR + sM);
      L += thr * S * part; thr *= T;
    }
  }
  if (bounce > 0.5 && tg >= 0.0 && tg <= tMax) {
    float mg = (r0 * s.y + tg * nu) / A_RG;
    if (mg > 0.0) L += airT(0.0, mg) * thr * mg * A_ALBEDO / A_PI;
  }
  return L;
}
`;

// ---------------------------------------------------------------------------------------------------------------
// What is ported from S. Hillaire's reference implementation (github.com/sebh/UnrealEngineSkyAtmosphere:
// Resources/RenderSkyCommon.hlsl, RenderSkyRayMarching.hlsl, SkyAtmosphereCommon.hlsl): the medium's three parts
// and their profiles, the transmittance table's layout, the multiple-scattering table (64 directions, the series),
// the march with each step's light integrated against its own extinction, the phase functions. Its notice:
//
// MIT License
//
// Copyright (c) 2020 Epic Games, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
