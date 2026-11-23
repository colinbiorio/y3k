// sea.js — THE SEA ROUND LORD HOWE ISLAND, AS NUMBERS. No page, no three: the suite runs it (test/sea.test.mjs);
// water.js draws it, terrain.js lays its light over the lagoon's floor.
//
// THE WATER. What it is made of, at the sky's own three wavelengths (611, 549 and 464 nm: air.js). Pure seawater's
// absorption is R. M. Pope and E. S. Fry's (Appl. Opt. 36, 8710, 1997: their table, between its rows); its scattering
// A. Morel's (1974) as R. C. Smith and K. S. Baker tabulate it (Appl. Opt. 20, 177, 1981: 0.0029 a metre at 500 nm,
// going as the wavelength to the -4.32), half of it backward. The island's water is clear oceanic water, taken as
// 0.1 mg of chlorophyll a cubic metre (the Tasman Sea's open water round the island is oligotrophic): its
// phytoplankton absorb 0.06 C^0.65 a metre at 440 nm (Prieur and Sathyendranath's law, as Morel and Lee use it), in
// a spectral shape chosen from their mean curve (T-II: 0.88, 0.18 and 0.12 of the 440 nm value at our three); its
// dissolved matter a fifth of what the water and the algae absorb at 440 nm, falling as exp(-0.014 (lambda - 440));
// its particles scatter 0.30 C^0.62 a metre at 550 nm (Gordon and Morel), as 550/lambda, a share
// 0.002 + 0.02 (0.5 - 0.25 log10 C) 550/lambda of it backward (Morel 1988).
//
// THE LIGHT IT GIVES BACK: Z. Lee, K. L. Carder, C. D. Mobley, R. G. Steward and J. S. Patch, "Hyperspectral remote
// sensing for shallow waters: 2", Appl. Opt. 38, 3831 (1999), eqs. 2 to 9, a fit to Hydrolight's radiative transfer:
// just under the surface, the light coming up over the light coming down is
//     r = r_deep (1 - exp(-(1/cos(sun) + Dc/cos(view)) k H)) + (rho / pi) exp(-(1/cos(sun) + Db/cos(view)) k H)
// for a floor of albedo rho at depth H, with r_deep = (0.084 + 0.170 u) u, Dc = 1.03 (1 + 2.4 u)^0.5,
// Db = 1.04 (1 + 5.4 u)^0.5, u = bb / (a + bb), k = a + bb, both angles under the water; and above it 0.5 r / (1 - 1.5 r)
// (what the surface lets out, and what it sends back down to the floor). So the deep sea gives back a hundredth of
// its blue light and almost none of its red (navy), two metres over the lagoon's white sand it gives back a twentieth of
// its green (turquoise), and the colour runs from one to the other as the floor falls away. The sea's own colour is
// that light on whatever light falls on level water: the Sun's and the sky's by day, the twilight's blue, the Moon's.
// What it reflects is the sky itself, by Fresnel's equations for seawater (n = 1.34).
//
// THE WAVES. Two kinds, as an open coast has them. THE WIND'S SEA: the day's wind (6.5 m/s from the south-east, the
// trades) over the open ocean, J. Tessendorf's method ("Simulating ocean water", SIGGRAPH course notes, 2001): a
// random sea drawn from a spectrum, each wave moving at its own speed, summed by inverse FFTs on the GPU each frame,
// in three bands (250 m, 37 m and 5.3 m squares, 128 waves a side each). The spectrum is JONSWAP's (K. Hasselmann et
// al., 1973) for that wind over a long fetch, spread about the wind by M. Donelan, J. Hamilton and W. Hui's law with
// Banner's tail (as C. J. Horvath gathers them for drawing, "Empirical directional wave spectra for computer
// graphics", DigiPro 2015); short waves feel the surface's tension. THE SWELL: a long swell from the Southern Ocean,
// 1.5 m at 11.5 s from the south-west, as nine long waves of nearby periods and directions (sets come out of their
// beats), the same on the CPU and the GPU. In the lagoon the swell is gone (the reef takes it) and the wind's sea is
// what a fetch of a kilometre or so raises; near the reef the swell turns to come in square to it (its crests follow
// the distance to the reef), steepens as the water shoals, and breaks where it stands higher than 0.78 of the depth.
import { SEA_FLOOR } from './ground.js';

export const G = 9.81;
export const LAMBDA = [611, 549, 464];                    // nm: the sky's three wavelengths (air.js)
export const PURE_A = [0.2652, 0.0554, 0.0101];           // pure water's absorption there (1/m), Pope and Fry 1997
const SURF_T = 7.2e-5;                                     // surface tension over density (m3/s2): seawater's 0.074 N/m over 1025 kg/m3
export const SEA = {
  n: 1.34,                                                 // seawater's index of refraction in the visible (salinity 35, 20 C)
  chl: 0.1,                                                // mg/m3 of chlorophyll: clear oceanic water
  wind: { speed: 6.5, from: 125, fetch: 5e4 },             // m/s at 10 m, the way it blows from (degrees east of north), its fetch over the open ocean (m: a sea near fully grown)
  swell: { hs: 1.5, period: 11.5, from: 235, spread: 9, n: 9, seed: 11 },
  // the wind's sea, in three bands: the side of each square (m), the waves it carries (from, to: wavelengths in m), how
  // much the waves lean their crests (Tessendorf's lambda)
  cascades: [{ L: 250, from: 250, to: 12, chop: 0.8 }, { L: 37, from: 12, to: 0.9, chop: 0.85 }, { L: 5.3, from: 0.9, to: 0.0834, chop: 0.6 }],
  N: 128,                                                  // waves a side in each square
  loop: 600,                                               // s: every wave's frequency is a whole number of turns in this, so the sea repeats exactly (and time stays small)
  crest: 0.6,                                              // m: water shallower than this is the reef's crest or the shore: where the swell ends
  breaker: 0.78,                                           // a wave breaks where it stands this high over the depth (McCowan)
  seed: 3,
};

// ---- the water's own optics, at the three wavelengths
export function optics(chl = SEA.chl) {
  const aph440 = 0.06 * chl ** 0.65, PH = [0.12, 0.18, 0.88];
  const ag440 = 0.2 * (0.00635 + aph440);                 // Pope and Fry's 0.00635 at 440 nm
  const bp550 = 0.30 * chl ** 0.62, bbShare = (l) => 0.002 + 0.02 * (0.5 - 0.25 * Math.log10(chl)) * (550 / l);
  return LAMBDA.map((l, i) => {
    const aw = PURE_A[i], bw = 0.00288 * (l / 500) ** -4.32, aph = aph440 * PH[i], ag = ag440 * Math.exp(-0.014 * (l - 440));
    const bp = bp550 * (550 / l), bbp = bp * bbShare(l), a = aw + aph + ag, bb = bw / 2 + bbp, kappa = a + bb, u = bb / kappa;
    return { lambda: l, a, bb, b: bw + bp, kappa, u, rDeep: (0.084 + 0.17 * u) * u, Dc: 1.03 * Math.sqrt(1 + 2.4 * u), Db: 1.04 * Math.sqrt(1 + 5.4 * u) };
  });
}
export const OPTICS = optics();
// just under the surface: the light coming up over the light coming down (sr^-1), over a floor of albedo `rho` (in
// water) `H` metres down, the light going down at a cosine `muS` and the eye looking up from it at `muV` (both under
// the water): Lee et al. 1999 eq. 9
export function rrsBelow(o, H, rho, muS = 1, muV = 1) {
  if (!(H > 0)) return rho / Math.PI;
  return o.rDeep * (1 - Math.exp(-(1 / muS + o.Dc / muV) * o.kappa * H)) + (rho / Math.PI) * Math.exp(-(1 / muS + o.Db / muV) * o.kappa * H);
}
export const rrsAbove = (r) => (0.5 * r) / (1 - 1.5 * r);         // eq. 2: what leaves the water, over the light falling on it
// the fraction of unpolarised light reflected where it meets the water at an angle whose cosine is `cosI` (from the air)
export function fresnel(cosI, n = SEA.n) {
  const c = Math.min(1, Math.max(0, cosI)), ct = Math.sqrt(Math.max(0, 1 - (1 - c * c) / (n * n)));
  const rs = (c - n * ct) / (c + n * ct), rp = (n * c - ct) / (n * c + ct);
  return 0.5 * (rs * rs + rp * rp);
}
// a line's cosine with the vertical once it has crossed into the water (Snell)
export const underCos = (cosI, n = SEA.n) => Math.sqrt(Math.max(0, 1 - (1 - cosI * cosI) / (n * n)));
// the share of the sky's slope of the sea a pixel cannot hold: C. Cox and W. Munk (J. Opt. Soc. Am. 44, 838, 1954),
// the mean square slope of a clean sea in a wind of U m/s (at 12.5 m; the 10 m wind is near enough)
export const coxMunk = (U) => 0.003 + 0.00512 * U;

// ---- the waves
// how fast a wave of wavenumber k (rad/m) turns over (rad/s), over `depth` metres of water (deep without)
export function dispersion(k, depth = Infinity) { const t = Number.isFinite(depth) ? Math.tanh(k * depth) : 1; return Math.sqrt((G * k + SURF_T * k ** 3) * t); }
export const groupSpeed = (k, depth = Infinity) => { const e = 1e-4 * k; return (dispersion(k + e, depth) - dispersion(k - e, depth)) / (2 * e); };
// JONSWAP: the energy of the wind's sea at angular frequency omega (m2 s), for a wind U (m/s) over a fetch F (m)
export function jonswap(omega, U = SEA.wind.speed, F = SEA.wind.fetch, gamma = 3.3) {
  if (!(omega > 0)) return 0;
  const wp = 22 * Math.cbrt((G * G) / (U * F)), alpha = 0.076 * ((U * U) / (F * G)) ** 0.22;
  const s = omega <= wp ? 0.07 : 0.09, r = Math.exp(-((omega - wp) ** 2) / (2 * s * s * wp * wp));
  return ((alpha * G * G) / omega ** 5) * Math.exp(-1.25 * (wp / omega) ** 4) * gamma ** r;
}
export const peakOmega = (U = SEA.wind.speed, F = SEA.wind.fetch) => 22 * Math.cbrt((G * G) / (U * F));
// Donelan, Hamilton and Hui's spreading with Banner's tail: how the energy at omega lies about the wind's way (theta
// from it, radians); it sums to one over the circle
export function spreading(theta, omega, wp) {
  const x = Math.max(0.56, omega / wp);
  const b = x < 0.95 ? 2.61 * x ** 1.3 : x < 1.6 ? 2.28 * x ** -1.3 : 10 ** (-0.4 + 0.8393 * Math.exp(-0.567 * Math.log(x * x)));
  return b / (2 * Math.tanh(b * Math.PI)) / Math.cosh(b * theta) ** 2;
}
// the way the wind blows toward, and the swell goes, as unit vectors in the world (x east, z south)
export const toward = (fromDeg) => { const a = ((fromDeg + 180) * Math.PI) / 180; return [Math.sin(a), -Math.cos(a)]; };

// a seeded generator (mulberry32) and Gaussian numbers from it: the same sea on every machine
export function random(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function gauss(rand) { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }

// THE STARTING SEA for the three bands, side by side (3N by N), as h0(k) and the conjugate of h0(-k) at each texel
// (four numbers): its waves are those of the band's wavelengths, each with its share of the spectrum's energy and a
// random phase. Each texel's k is (i, j) or (i - N, j - N) times 2 pi / L (texel order, not centred: no sign to undo).
// Also each band's mean square slope (for the glitter: what is finer than the last band is Cox and Munk's remainder).
export function startingSea({ N = SEA.N, cascades = SEA.cascades, U = SEA.wind.speed, from = SEA.wind.from, F = SEA.wind.fetch, seed = SEA.seed } = {}) {
  const rand = random(seed), W = cascades.length * N, data = new Float32Array(W * N * 4), wp = peakOmega(U, F);
  const [wx, wz] = toward(from), wind = Math.atan2(wz, wx);
  const h0 = new Float32Array(W * N * 2), slope = [], variance = [];
  cascades.forEach((c, ci) => {
    const dk = (2 * Math.PI) / c.L, kLo = (2 * Math.PI) / c.from, kHi = (2 * Math.PI) / c.to;
    let s2 = 0, v = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = i < N / 2 ? i : i - N, nz = j < N / 2 ? j : j - N, kx = nx * dk, kz = nz * dk, k = Math.hypot(kx, kz);
      let amp = 0;
      if (k >= kLo && k < kHi) {
        const w = dispersion(k), dwdk = (G + 3 * SURF_T * k * k) / (2 * w), th = Math.atan2(kz, kx) - wind, d = Math.atan2(Math.sin(th), Math.cos(th));
        const psi = (jonswap(w, U, F) * spreading(d, w, wp) * dwdk) / k;       // the energy over the plane of k (m4)
        amp = Math.sqrt(psi * dk * dk) / 2;                                    // E|h0|^2 = psi dk^2 / 2: the sea's variance is then the spectrum's
        s2 += psi * dk * dk * k * k; v += psi * dk * dk;
      }
      const g1 = gauss(rand), g2 = gauss(rand), t = (j * W + ci * N + i) * 2;
      h0[t] = g1 * amp; h0[t + 1] = g2 * amp;
    }
    slope.push(s2); variance.push(v);
  });
  for (let j = 0; j < N; j++) for (let x = 0; x < W; x++) {
    const ci = Math.floor(x / N), i = x - ci * N, mi = (N - i) % N, mj = (N - j) % N, t = (j * W + x) * 2, m = (mj * W + ci * N + mi) * 2, o = (j * W + x) * 4;
    data[o] = h0[t]; data[o + 1] = h0[t + 1]; data[o + 2] = h0[m]; data[o + 3] = -h0[m + 1];
  }
  return { data, width: W, height: N, slope, variance, hs: variance.map((x) => 4 * Math.sqrt(x)) };
}
// a frequency held to a whole number of turns in SEA.loop (so the sea repeats, and the time handed to the GPU stays small)
export const looped = (omega, loop = SEA.loop) => { const w0 = (2 * Math.PI) / loop; return Math.max(1, Math.round(omega / w0)) * w0; };

// THE INVERSE FFT THE GPU DOES, written out (Stockham's radix 2, natural order in and out, each stage reading two
// earlier numbers a half apart): the tests hold it to a plain sum. re/im: one row of N complex numbers.
export function stockhamStage(re, im, s, N, sign = 1) {
  const Ns = 1 << s, ore = new Float64Array(N), oim = new Float64Array(N);
  for (let o = 0; o < N; o++) {
    const r = o % (2 * Ns) >= Ns ? 1 : 0, j = Math.floor(o / (2 * Ns)) * Ns + (o % Ns), a = (sign * 2 * Math.PI * (o % Ns)) / (2 * Ns);
    const cr = Math.cos(a), ci = Math.sin(a), br = re[j + N / 2], bi = im[j + N / 2], tr = br * cr - bi * ci, ti = br * ci + bi * cr;
    ore[o] = r ? re[j] - tr : re[j] + tr; oim[o] = r ? im[j] - ti : im[j] + ti;
  }
  return [ore, oim];
}
export function inverseFFT(re, im) { let r = Float64Array.from(re), i = Float64Array.from(im); for (let s = 0; (1 << s) < re.length; s++) [r, i] = stockhamStage(r, i, s, re.length, 1); return [r, i]; }

// THE SWELL: n long waves round the peak period and the way it comes from, their heights so that the significant
// height is hs. Each: its wavenumber, frequency (looped), way (unit vector), height, phase, and how far its crests lean
// (Gerstner's Q, the n of them together never folding)
export function swellWaves({ hs, period, from, spread, n, seed } = SEA.swell) {
  const rand = random(seed), [tx, tz] = toward(from), base = Math.atan2(tz, tx), wp = (2 * Math.PI) / period, out = [];
  let e = 0;
  for (let i = 0; i < n; i++) {
    const f = 0.84 + (0.32 * (i + 0.5)) / n, w = looped(wp / f), k = (w * w) / G, a = base + ((spread * Math.PI) / 180) * gauss(rand);
    const s = Math.exp(-((w - wp) ** 2) / (2 * (0.07 * wp) ** 2)) + 0.15;      // a narrow peak: a swell that has come a long way
    out.push({ k, omega: w, dir: [Math.cos(a), Math.sin(a)], amp: Math.sqrt(s), phase: 2 * Math.PI * rand() }); e += s;
  }
  const scale = hs / 4 / Math.sqrt(e / 2);                                      // hs = 4 sqrt(sum amp^2 / 2)
  for (const w of out) { w.amp *= scale; w.q = Math.min(1, 0.5 / (w.k * w.amp * n)); }
  return out;
}
export const SWELL = swellWaves();
// the swell's height and its lean at a point of the open sea, at time t (s): [dx, height, dz]
export function swellAt(x, z, t, waves = SWELL) {
  let dx = 0, h = 0, dz = 0;
  for (const w of waves) { const p = w.k * (w.dir[0] * x + w.dir[1] * z) - w.omega * t + w.phase, c = Math.cos(p), s = Math.sin(p); h += w.amp * c; dx -= w.q * w.amp * w.dir[0] * s; dz -= w.q * w.amp * w.dir[1] * s; }
  return [dx, h, dz];
}

// THE SWELL AT THE REEF. The water's mean depth by the distance outside the reef's crest (m; negative: into the lagoon
// behind it), as lordhowe-build.mjs lays the sea floor (outside: 0.4 + 31 (1 - exp(-d / 300)) + 12 between 1.2 and 4.2
// km; inside: from 0.35 at the crest to the lagoon's floor of about 2.4 m within 170 m)
export function reefDepth(d) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (d >= 0) return 0.4 + 31 * (1 - Math.exp(-d / 300)) + 12 * sm(1200, 4200, d);
  return 0.35 + 2.05 * sm(25, 170, -d);
}
// the phase the swell's crests have reached at a distance d from the crest, for the peak period: the integral of the
// wavenumber the water's depth gives it, from the crest out (radians; negative into the lagoon), every STEP m from
// FROM; and its height there over its height in deep water (linear shoaling: the square root of the group speeds)
export const SHORE = { from: -480, step: 24, n: 72 };
export function shoreTables({ period = SEA.swell.period } = {}) {
  const w = looped((2 * Math.PI) / period), kOf = (d) => { let k = (w * w) / G; for (let i = 0; i < 40; i++) k = (w * w) / (G * Math.tanh(k * d)); return k; };
  const phase = new Float32Array(SHORE.n), shoal = new Float32Array(SHORE.n), cg0 = G / (2 * w);
  const at = (D) => { let p = 0; const n = 200, h = D / n; for (let i = 0; i < n; i++) p += kOf(reefDepth((i + 0.5) * h)) * h; return p; };
  for (let i = 0; i < SHORE.n; i++) { const D = SHORE.from + i * SHORE.step, d = reefDepth(D); phase[i] = at(D); shoal[i] = Math.sqrt(cg0 / groupSpeed(kOf(d), d)); }
  return { phase, shoal, omega: w };
}

// THE SEA'S OWN MAP of the island's grid (made once as the island opens): for each point, how far it is outside the
// reef's crest or the shore (m, positive in the open sea, negative behind the crest: in the lagoon, and on the land),
// the way out to the open sea (a unit vector), and how far it is from dry land (m). The lagoon is the island's own, by
// lordhowe-build.mjs's rule: the water inside the island's convex hull (the reef, shape.reef), within LAGOON.shore of the
// shore and north of its south end (shape.lagoonSouth); its edge is the reef's crest. The open sea is the rest of the water.
// Exact distances (P. Felzenszwalb and D. Huttenlocher's two passes, as lordhowe-build.mjs measures them).
export const LAGOON = { shore: 1400 };
export function seaMap(hts, w, h, S, { x0 = 0, z0 = 0, reef = null, lagoonSouth = Infinity } = {}) {
  const n = w * h, dry = new Uint8Array(n);
  for (let k = 0; k < n; k++) dry[k] = hts[k] > 0 ? 1 : 0;
  const land = distanceTo(dry, w, h, S, 1), open = new Uint8Array(n);
  const inside = (x, z) => { let c = false; for (let i = 0, j = reef.length - 1; i < reef.length; j = i++) { const [xi, zi] = reef[i], [xj, zj] = reef[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, x = x0 + i * S, z = z0 + j * S;
    if (dry[k]) continue;
    const lagoon = !!reef && z < lagoonSouth && land[k] < LAGOON.shore && inside(x, z);
    open[k] = lagoon ? 0 : 1;
  }
  const out = distanceTo(open, w, h, S, 0), inn = distanceTo(open, w, h, S, 1);
  const sd = new Float32Array(n);
  for (let k = 0; k < n; k++) sd[k] = open[k] ? out[k] - S / 2 : -(inn[k] - S / 2);
  const data = new Float32Array(n * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, gx = (sd[j * w + Math.min(w - 1, i + 1)] - sd[j * w + Math.max(0, i - 1)]) / (2 * S), gz = (sd[Math.min(h - 1, j + 1) * w + i] - sd[Math.max(0, j - 1) * w + i]) / (2 * S);
    const g = Math.hypot(gx, gz) || 1;
    data[4 * k] = sd[k]; data[4 * k + 1] = gx / g; data[4 * k + 2] = gz / g; data[4 * k + 3] = land[k];
  }
  return { data, open };
}
// the exact distance (m) from every cell to the nearest cell where on[k] === want
function distanceTo(on, w, h, S, want) {
  const INF = 1e12, M = Math.max(w, h), f = new Float64Array(M), d = new Float64Array(M), v = new Int32Array(M), zz = new Float64Array(M + 1), out = new Float64Array(w * h);
  const pass = (n) => { let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF; for (let q = 1; q < n; q++) { let s; for (;;) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= zz[k]) { k--; continue; } break; } k++; v[k] = q; zz[k] = s; zz[k + 1] = INF; } k = 0; for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } };
  for (let i = 0; i < w; i++) { for (let j = 0; j < h; j++) f[j] = on[j * w + i] === want ? 0 : INF; pass(h); for (let j = 0; j < h; j++) out[j * w + i] = d[j]; }
  for (let j = 0; j < h; j++) { for (let i = 0; i < w; i++) f[i] = out[j * w + i]; pass(w); for (let i = 0; i < w; i++) out[j * w + i] = Math.min(Math.sqrt(d[i]) * S, 1e5); }
  return out;
}

// ---- THE SAME FOR THE GPU, from the same numbers
const f = (x) => { const s = Number(x).toPrecision(8); return /[.e]/.test(s) ? s : s + '.0'; };
const v3 = (a) => `vec3( ${f(a[0])}, ${f(a[1])}, ${f(a[2])} )`;
// the optics (sea*): the water's k, its deep reflectance, the two path factors; Fresnel; the light out of the water over
// a floor whose own lit light is known (`floorLit`: what the floor would give back were it dry, in the picture's units)
export const SEA_OPTICS_GLSL = `
const vec3 SEA_K = ${v3(OPTICS.map((o) => o.kappa))};
const vec3 SEA_RDEEP = ${v3(OPTICS.map((o) => o.rDeep))};
const vec3 SEA_DC = ${v3(OPTICS.map((o) => o.Dc))};
const vec3 SEA_DB = ${v3(OPTICS.map((o) => o.Db))};
const float SEA_N = ${f(SEA.n)};
// Fresnel's reflectance of unpolarised light meeting the water at cosine c (from the air)
float seaFresnel( float c ) {
  c = clamp( c, 0.0, 1.0 ); float ct = sqrt( max( 0.0, 1.0 - ( 1.0 - c * c ) / ( SEA_N * SEA_N ) ) );
  float rs = ( c - SEA_N * ct ) / ( c + SEA_N * ct ), rp = ( SEA_N * c - ct ) / ( SEA_N * c + ct );
  return 0.5 * ( rs * rs + rp * rp );
}
float seaUnder( float c ) { return sqrt( max( 0.0, 1.0 - ( 1.0 - c * c ) / ( SEA_N * SEA_N ) ) ); }
// what leaves the water toward the eye (before the surface's own reflection takes its share): Lee et al. 1999. E: the
// light falling on level water (three colours, the picture's units); floorUp: the floor's own light as it would be
// given back under that light in the water (its albedo in water over pi, times what reaches it); H: the depth (m);
// muS, muV: the light's and the eye's cosines under the water
vec3 seaOut( vec3 E, vec3 floorUp, float H, float muS, float muV ) {
  vec3 c = exp( -( 1.0 / muS + SEA_DC / muV ) * SEA_K * H ), b = exp( -( 1.0 / muS + SEA_DB / muV ) * SEA_K * H );
  vec3 up = E * SEA_RDEEP * ( 1.0 - c ) + floorUp * b;
  vec3 r = up / max( E, vec3( 1.0e-30 ) );
  return 0.5 * up / max( 1.0 - 1.5 * r, vec3( 0.25 ) );
}`;
export { SEA_FLOOR };
