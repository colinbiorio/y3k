// orbits.mjs — fits the moons and the far dwarf planets, and writes src/game/solar/orbits.js.
//
//   node scripts/solar/orbits.mjs fit <folder holding pck00011.tpc> <a folder for Horizons' raw answers> <fits.json> [names...]
//   node scripts/solar/orbits.mjs write <fits.json> <out folder>
//
// An orbit here is a small theory: a mean longitude (a rate, a square, slow sinusoids that may also breathe the
// radius), an eccentricity vector and an inclination vector that are each a sum of uniformly turning modes, on a
// reference plane whose pole may drift. It is fitted to JPL's ephemerides as Horizons serves them, by least
// squares (Levenberg-Marquardt), starting from JPL's published mean elements and the IAU's rotation rates (these
// moons keep one face to their planets), on windows that widen from ten days to two centuries so the fit never
// loses count of the turns. Then terms are added one at a time where what is left over shows a period, each kept
// only if it also helps at dates held back from the fit. `fit` takes about four minutes a moon: the twenty-four
// orbits are an hour and a half of one core. The numbers it prints are measured at 300 dates it never used.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { vectors, elements, dates } from './horizons.mjs';
import { kernel } from './kernels.mjs';

// Where each moon's fit starts: JPL SSD "Planetary Satellite Mean Elements" (ssd.jpl.nasa.gov/sats/elem/, read 20
// November 2026): a km, e, argument of periapsis, mean anomaly, inclination, node (degrees, at J2000), the periods of
// the apse and node in years, and the Laplace plane's pole where the table gives one (else the planet's equator).
const START = {
  phobos: { planet: 'mars', code: '401', a: 9375, e: 0.015, w: 216.3, M: 189.7, i: 1.1, node: 169.2, Pw: 1.1, Pn: 2.3, ra: 317.7, dec: 52.9 },
  deimos: { planet: 'mars', code: '402', a: 23457, e: 0, w: 0, M: 205, i: 1.8, node: 54.3, Pw: 0, Pn: 56.2, ra: 316.6, dec: 53.5 },
  io: { planet: 'jupiter', code: '501', a: 421800, e: 0.004, w: 49.1, M: 330.9, i: 0, node: 0, Pw: 1.333, Pn: 0, ra: 268.1, dec: 64.5 },
  europa: { planet: 'jupiter', code: '502', a: 671100, e: 0.009, w: 45, M: 345.4, i: 0.5, node: 184, Pw: 1.394, Pn: 30.202, ra: 268.1, dec: 64.5 },
  ganymede: { planet: 'jupiter', code: '503', a: 1070400, e: 0.001, w: 198.3, M: 324.8, i: 0.2, node: 58.5, Pw: 68.301, Pn: 137.812, ra: 268.2, dec: 64.6 },
  callisto: { planet: 'jupiter', code: '504', a: 1882700, e: 0.007, w: 43.8, M: 87.4, i: 0.3, node: 309.1, Pw: 277.921, Pn: 577.264, ra: 268.7, dec: 64.8 },
  mimas: { planet: 'saturn', code: '601', a: 186000, e: 0.02, w: 160.4, M: 275.3, i: 1.6, node: 66.2, Pw: 0.493, Pn: 0.986, ra: 40.6, dec: 83.5 },
  enceladus: { planet: 'saturn', code: '602', a: 238400, e: 0.005, w: 119.5, M: 57, i: 0, node: 0, Pw: 2.916, Pn: 0, ra: 40.6, dec: 83.5 },
  tethys: { planet: 'saturn', code: '603', a: 295000, e: 0.001, w: 335.3, M: 0, i: 1.1, node: 273, Pw: 0.005, Pn: 4.982, ra: 40.6, dec: 83.5 },
  dione: { planet: 'saturn', code: '604', a: 377700, e: 0.002, w: 116, M: 212, i: 0, node: 0, Pw: 11.698, Pn: 0, ra: 40.6, dec: 83.5 },
  rhea: { planet: 'saturn', code: '605', a: 527200, e: 0.001, w: 44.3, M: 31.5, i: 0.3, node: 133.7, Pw: 33.939, Pn: 35.775, ra: 40.6, dec: 83.5 },
  titan: { planet: 'saturn', code: '606', a: 1221900, e: 0.029, w: 78.3, M: 11.7, i: 0.3, node: 78.6, Pw: 346.68, Pn: 687.37, ra: 36.4, dec: 84 },
  iapetus: { planet: 'saturn', code: '608', a: 3561700, e: 0.028, w: 254.5, M: 74.8, i: 7.6, node: 86.5, Pw: 1662.9, Pn: 3130.302, ra: 288.7, dec: 78.9 },
  ariel: { planet: 'uranus', code: '701', a: 190929, e: 0.001, w: 9.6, M: 193.5, i: 0, node: 0, Pw: 28.901, Pn: 0, ra: null, dec: null },
  umbriel: { planet: 'uranus', code: '702', a: 265986, e: 0.004, w: 183.4, M: 253, i: 0.1, node: 174.8, Pw: 64.126, Pn: 129.945, ra: null, dec: null },
  titania: { planet: 'uranus', code: '703', a: 436298, e: 0.002, w: 184, M: 68.1, i: 0.1, node: 29.5, Pw: 579.928, Pn: 1644.649, ra: null, dec: null },
  oberon: { planet: 'uranus', code: '704', a: 583511, e: 0.002, w: 132.2, M: 143.6, i: 0.1, node: 76.8, Pw: 158.604, Pn: 192.798, ra: null, dec: null },
  miranda: { planet: 'uranus', code: '705', a: 129846, e: 0.001, w: 154.8, M: 73, i: 4.4, node: 100.9, Pw: 8.939, Pn: 17.787, ra: null, dec: null },
  triton: { planet: 'neptune', code: '801', a: 354800, e: 0, w: 0, M: 63, i: 157.3, node: 177.7, Pw: 675.2, Pn: 299.4, ra: null, dec: null },
  charon: { planet: 'pluto', code: '901', a: 19600, e: 0, w: 0, M: 304.1, i: 0, node: 0, Pw: null, Pn: null, ra: null, dec: null },
};
// The dwarf planets: Horizons' name, and the shortest period (days) a term is looked for at. Their orbits are about
// the solar system's centre of mass, where they are smooth: the Sun's own swing would otherwise be in them. Pluto's
// is the orbit of Pluto and Charon's centre of mass. Ceres is here to be tried, and is not good enough to ship yet.
const DWARFS = { pluto: ['9', '500@0', 2000], eris: ['136199;', '500@0', 2000], haumea: ['136108;', '500@0', 2000], makemake: ['136472;', '500@0', 2000], ceres: ['1;', '500@10', 200] };
const PLANET = { mars: 499, jupiter: 599, saturn: 699, uranus: 799, neptune: 899, pluto: 999 };

// ==================================================================================================== the model
const D2R = Math.PI / 180, TWO_PI = 2 * Math.PI;
const EPS = 84381.448 / 3600 * D2R, ce = Math.cos(EPS), se = Math.sin(EPS);
const HEAD = 8;   // a, L0, n, q, ra0, dec0, ra1, dec1; then (e, w0, w1) * ne, (s, O0, O1) * ni, (A, B, phi, nu) * nl:
// each slow term moves the longitude by A sin(phi + nu t) and the radius by the factor 1 + B cos(phi + nu t)

function longitude(m, t) { const p = m.p; let lam = p[1] + p[2] * t + p[3] * t * t; for (let k = HEAD + 3 * (m.ne + m.ni), j = 0; j < m.nl; j += 1, k += 4) lam += p[k] * Math.sin(p[k + 2] + p[k + 3] * t); return lam; }
function stretch(m, t) { const p = m.p; let f = 1; for (let k = HEAD + 3 * (m.ne + m.ni), j = 0; j < m.nl; j += 1, k += 4) f += p[k + 1] * Math.cos(p[k + 2] + p[k + 3] * t); return f; }
// place(m, t, out): km, ecliptic of J2000; t in days of TDB from J2000
function place(m, t, out = [0, 0, 0]) {
  const p = m.p, a = p[0] * stretch(m, t), lam = longitude(m, t);
  let zr = 0, zi = 0, sr = 0, si = 0, k = HEAD;
  for (let j = 0; j < m.ne; j += 1, k += 3) { const x = p[k + 1] + p[k + 2] * t; zr += p[k] * Math.cos(x); zi += p[k] * Math.sin(x); }
  for (let j = 0; j < m.ni; j += 1, k += 3) { const x = p[k + 1] + p[k + 2] * t; sr += p[k] * Math.cos(x); si += p[k] * Math.sin(x); }
  const e = Math.hypot(zr, zi), w = Math.atan2(zi, zr), O = Math.atan2(si, sr), inc = 2 * Math.atan(Math.hypot(sr, si));
  const M = lam - w; let E = M + e * Math.sin(M);
  for (let it = 0; it < 6; it += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const om = w - O, co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), sI = Math.sin(inc);
  const x1 = co * xp - so * yp, y1 = so * xp + co * yp;
  const xl = cO * x1 - sO * ci * y1, yl = sO * x1 + cO * ci * y1, zl = sI * y1;
  const A = p[4] + p[6] * t + Math.PI / 2, dec = p[5] + p[7] * t, cA = Math.cos(A), sA = Math.sin(A), cD = Math.sin(dec), sD = Math.cos(dec);
  const y2 = cD * yl - sD * zl, z2 = sD * yl + cD * zl, xe = cA * xl - sA * y2, ye = sA * xl + cA * y2;
  out[0] = xe; out[1] = ce * ye + se * z2; out[2] = -se * ye + ce * z2; return out;
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i += 1) { let mx = i; for (let k = i + 1; k < n; k += 1) if (Math.abs(M[k][i]) > Math.abs(M[mx][i])) mx = k; [M[i], M[mx]] = [M[mx], M[i]]; if (Math.abs(M[i][i]) < 1e-300) continue; for (let k = i + 1; k < n; k += 1) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j += 1) M[k][j] -= f * M[i][j]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i -= 1) { let s = M[i][n]; for (let j = i + 1; j < n; j += 1) s -= M[i][j] * x[j]; x[i] = Math.abs(M[i][i]) < 1e-300 ? 0 : s / M[i][i]; } return x;
}
function stepsFor(m, W) {
  const s = [m.p[0] * 1e-7, 1e-7, 1e-7 / W, 1e-7 / (W * W), 1e-7, 1e-7, 1e-7 / W, 1e-7 / W];
  for (let j = 0; j < m.ne + m.ni; j += 1) s.push(1e-8, 1e-5, 1e-5 / W);
  for (let j = 0; j < m.nl; j += 1) s.push(1e-7, 1e-7, 1e-6, 1e-6 / W);
  return s;
}
// Levenberg-Marquardt over the free parameter indices; data [{t, p}]
function fit(m0, free, data, W, iters = 40) {
  const m = { ...m0, p: m0.p.slice() }, steps = stepsFor(m, W), scale = m.p[0], nf = free.length, N = data.length * 3, tmp = [0, 0, 0];
  const resid = (q) => { const mm = { ...m, p: q }, r = new Float64Array(N); for (let k = 0; k < data.length; k += 1) { const d = data[k]; place(mm, d.t, tmp); r[3 * k] = (tmp[0] - d.p[0]) / scale; r[3 * k + 1] = (tmp[1] - d.p[1]) / scale; r[3 * k + 2] = (tmp[2] - d.p[2]) / scale; } return r; };
  const cost = (r) => { let s = 0; for (let i = 0; i < r.length; i += 1) s += r[i] * r[i]; return s; };
  let p = m.p, r = resid(p), c = cost(r), mu = 1e-3;
  for (let it = 0; it < iters; it += 1) {
    const J = free.map((j) => { const q = p.slice(); q[j] += steps[j]; const r2 = resid(q); for (let i = 0; i < N; i += 1) r2[i] = (r2[i] - r[i]) / steps[j]; return r2; });
    const A = Array.from({ length: nf }, () => new Array(nf).fill(0)), g = new Array(nf).fill(0);
    for (let a = 0; a < nf; a += 1) { for (let b = a; b < nf; b += 1) { let s = 0; const Ja = J[a], Jb = J[b]; for (let i = 0; i < N; i += 1) s += Ja[i] * Jb[i]; A[a][b] = s; A[b][a] = s; } let s = 0; for (let i = 0; i < N; i += 1) s += J[a][i] * r[i]; g[a] = -s; }
    let better = false;
    for (let tries = 0; tries < 12 && !better; tries += 1) {
      const dx = solve(A.map((row, i) => row.map((x, j) => (i === j ? x * (1 + mu) + 1e-30 : x))), g), q = p.slice(); free.forEach((j, a) => { q[j] += dx[a]; });
      const r2 = resid(q), c2 = cost(r2);
      if (Number.isFinite(c2) && c2 < c) { better = true; const gain = (c - c2) / c; p = q; r = r2; c = c2; mu = Math.max(mu / 3, 1e-12); if (gain < 1e-9) it = iters; } else mu *= 4;
    }
    if (!better) break;
  }
  m.p = p; return { m, rms: Math.sqrt(c / data.length) };   // rms of |error| / a
}
// what is left: along the orbit, across it and along the radius (each as a fraction of r), and in km
function leftovers(m, data) {
  const a = [0, 0, 0], b = [0, 0, 0];
  return data.map((d) => {
    place(m, d.t, a); place(m, d.t + 1e-3, b);
    const r = Math.hypot(...a), u = a.map((x) => x / r), v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dv = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    let tt = [v[0] - dv * u[0], v[1] - dv * u[1], v[2] - dv * u[2]]; const tn = Math.hypot(...tt); tt = tt.map((x) => x / tn);
    const nn = [u[1] * tt[2] - u[2] * tt[1], u[2] * tt[0] - u[0] * tt[2], u[0] * tt[1] - u[1] * tt[0]];
    const e = [d.p[0] - a[0], d.p[1] - a[1], d.p[2] - a[2]];
    return { t: d.t, lam: longitude(m, d.t), along: (e[0] * tt[0] + e[1] * tt[1] + e[2] * tt[2]) / r, across: (e[0] * nn[0] + e[1] * nn[1] + e[2] * nn[2]) / r, radial: (e[0] * u[0] + e[1] * u[1] + e[2] * u[2]) / r, km: Math.hypot(...e), r };
  });
}
const stats = (left) => { let w = 0, wk = 0, sq = 0; for (const l of left) { const e = Math.hypot(l.along, l.across, l.radial); w = Math.max(w, e); wk = Math.max(wk, l.km); sq += e * e; } return { worstDeg: w / D2R, rmsDeg: Math.sqrt(sq / left.length) / D2R, worstKm: wk }; };
// the strongest real sinusoid in y(t), periods pmin..pmax days: amp * sin(w t + phi)
function strongest(ts, ys, pmin, pmax, over = 6) {
  const span = ts[ts.length - 1] - ts[0], df = 1 / (span * over), n = ts.length;
  let mean = 0; for (const y of ys) mean += y / n;
  let best = { power: 0, amp: 0 };
  for (let f = 1 / pmax; f <= 1 / pmin; f += df) {
    const w = TWO_PI * f; let cc = 0, ss = 0, cs = 0, yc = 0, ys2 = 0;
    for (let i = 0; i < n; i += 1) { const c = Math.cos(w * ts[i]), s = Math.sin(w * ts[i]), y = ys[i] - mean; cc += c * c; ss += s * s; cs += c * s; yc += y * c; ys2 += y * s; }
    const det = cc * ss - cs * cs; if (det < 1e-9 * n * n) continue;
    const A = (yc * ss - ys2 * cs) / det, B = (ys2 * cc - yc * cs) / det, power = A * yc + B * ys2;
    if (power > best.power) best = { power, w, amp: Math.hypot(A, B), phi: Math.atan2(A, B) };
  }
  return best;
}
// the strongest turning mode in a complex series g(t) = gr + i gi: amp * exp(i (phase + w t)), |period| >= pmin days, either sense
function turning(ts, gr, gi, pmin, over = 6) {
  const span = ts[ts.length - 1] - ts[0], df = 1 / (span * over), n = ts.length;
  let best = { amp: 0 };
  for (let f = -1 / pmin; f <= 1 / pmin; f += df) {
    const w = TWO_PI * f; let sr = 0, si = 0;
    for (let i = 0; i < n; i += 1) { const c = Math.cos(w * ts[i]), s = Math.sin(w * ts[i]); sr += gr[i] * c + gi[i] * s; si += gi[i] * c - gr[i] * s; }
    const amp = Math.hypot(sr, si) / n;
    if (amp > best.amp) best = { amp, w, phase: Math.atan2(si, sr) };
  }
  return best;
}
// the three candidates the leftovers suggest, each with the rms of position (fraction of a) it would explain
function candidates(left, pmin, pminL = pmin) {
  const ts = left.map((l) => l.t);
  const lamTerm = strongest(ts, left.map((l) => l.along), pminL, 2 * (ts[ts.length - 1] - ts[0]), 3);
  // eccentricity: dz = (-radial - i along / 2) e^{i lam}
  const er = [], ei = [], ir = [], ii = [];
  for (const l of left) { const c = Math.cos(l.lam), s = Math.sin(l.lam), x = -l.radial, y = -l.along / 2; er.push(x * c - y * s); ei.push(x * s + y * c); ir.push(l.across * c); ii.push(l.across * s); }
  const eMode = turning(ts, er, ei, pmin), g = turning(ts, ir, ii, pmin);
  // inclination: across e^{i lam} has the slow part i * (2 d zeta) for zeta = tan(i/2) e^{i node}
  const iMode = { amp: g.amp / 2, w: g.w, phase: g.phase - Math.PI / 2 };
  return [
    { kind: 'l', explains: lamTerm.amp * 0.707, add: [lamTerm.amp, 0, lamTerm.phi, lamTerm.w], amp: lamTerm.amp, w: lamTerm.w },
    { kind: 'e', explains: eMode.amp * 1.58, add: [eMode.amp, eMode.phase, eMode.w], amp: eMode.amp, w: eMode.w },
    { kind: 'i', explains: iMode.amp * 1.41, add: [iMode.amp, iMode.phase, iMode.w], amp: iMode.amp, w: iMode.w },
  ].filter((c) => Number.isFinite(c.explains) && c.w !== undefined).sort((a, b) => b.explains - a.explains);
}
function withTerm(m, c) {
  const p = m.p.slice(), at = c.kind === 'e' ? HEAD + 3 * m.ne : c.kind === 'i' ? HEAD + 3 * (m.ne + m.ni) : p.length;
  p.splice(at, 0, ...c.add);
  return { ...m, p, ne: m.ne + (c.kind === 'e' ? 1 : 0), ni: m.ni + (c.kind === 'i' ? 1 : 0), nl: m.nl + (c.kind === 'l' ? 1 : 0) };
}

// ====================================================================================================== fitting
const J0 = 2451545, W = 36525;
const PMIN = 20, PMIN_L = 1.2, EXTRA = 24, GATE = 0.99;      // days; days; terms; a term must leave 1% less at the dates held back
const everything = (mm) => mm.p.map((_, j) => j);
const rmsOn = (mm, set) => stats(leftovers(mm, set)).rmsDeg;
// add terms while each one helps at the held-back dates
function grow(m0, free, dFit, dVal, pmin, pminL, floor, label) {
  let m = m0; const added = [];
  for (let k = 0; k < EXTRA; k += 1) {
    const cands = candidates(leftovers(m, dFit), pmin, pminL); let took = false;
    for (const c of cands) {
      if (c.explains < floor) continue;
      const trial = fit(withTerm(m, c), free(withTerm(m, c)), dFit, W, 40).m;
      if (rmsOn(trial, dVal) < rmsOn(m, dVal) * GATE) { m = trial; took = true; added.push(label(c)); break; }
    }
    if (!took) break;
  }
  return { m, added };
}
async function fitMoon(name, row, pck, dirH) {
  const rnd = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
  const ladder = []; for (let k = 0; k <= 12; k += 1) { const w = Math.min(10 * 2 ** k, 36524); for (let j = 0; j < 40; j += 1) ladder.push(Math.round((J0 + (2 * rnd() - 1) * w) * 1e4) / 1e4); }
  const globalJds = dates(1800, 811), holdJds = dates(300, 577), all = [...new Set([...ladder, ...globalJds])].sort((a, b) => a - b), glob = new Set(globalJds);
  const pc = PLANET[row.planet], center = '500@' + pc, code = row.code;
  const data = (await vectors(dirH, code, center, all)).map((r) => ({ t: r.jd - J0, p: r.p, jd: r.jd }));
  const dGlobal = data.filter((d) => glob.has(Math.round(d.jd * 1e4) / 1e4)), dFit = dGlobal.filter((_, i) => i % 3 !== 0), dVal = dGlobal.filter((_, i) => i % 3 === 0);
  const hold = (await vectors(dirH, code, center, holdJds)).map((r) => ({ t: r.jd - J0, p: r.p }));
  const wrate = Math.abs(pck[`BODY${code}_PM`][1]) * D2R, yr = 365.25;
  // the plane: JPL's Laplace pole where the table gives one, else the planet's spin pole (the IAU pole turned over for a planet that spins backwards)
  let ra = row.ra ?? pck[`BODY${pc}_POLE_RA`][0], dec = row.dec ?? pck[`BODY${pc}_POLE_DEC`][0];
  if (row.ra == null && pck[`BODY${pc}_PM`][1] < 0) { ra += 180; dec = -dec; }
  let m = { ne: 1, ni: 1, nl: 0, p: [row.a, (row.node + row.w + row.M) * D2R, wrate, 0, ra * D2R, dec * D2R, 0, 0,
    Math.max(row.e, 1e-4), (row.node + row.w) * D2R, row.Pw ? TWO_PI / (row.Pw * yr) : 0,
    Math.tan(Math.max(row.i, 0.01) * D2R / 2), row.node * D2R, row.Pn ? -TWO_PI / (row.Pn * yr) : 0] };
  // Mimas and Tethys share a libration of 70.6 years, 43 degrees wide in Mimas (Harper and Taylor's argument, as a starting value only)
  const W0 = 5.095 * (2000.0 - 1866.39) * D2R, W1 = 5.095 * D2R / 365.25;
  if (name === 'mimas') { m.p.push(-43.57 * D2R, 0, W0, W1, -0.72 * D2R, 0, 3 * W0, 3 * W1); m.nl = 2; }
  if (name === 'tethys') { m.p.push(2.063 * D2R, 0, W0, W1); m.nl = 1; }
  const freeAt = (mm, w) => { const f = [0, 1, 2]; if (w >= 5000) f.push(3); if (w >= 640) f.push(4, 5); if (w >= 20000) f.push(6, 7); for (let j = HEAD; j < HEAD + 3 * (mm.ne + mm.ni); j += 1) f.push(j); if (w >= 10000) for (let j = HEAD + 3 * (mm.ne + mm.ni); j < mm.p.length; j += 1) f.push(j); return f; };
  for (let k = 0; k <= 12; k += 1) {
    const w = Math.min(10 * 2 ** k, 36525), sub = data.filter((d) => Math.abs(d.t) <= w);
    // the first window: try every starting longitude, the table's angles are to a tenth of a degree
    if (k === 0) { let best = null; for (let j = 0; j < 24; j += 1) { const q = { ...m, p: m.p.slice() }; q.p[1] += j * TWO_PI / 24; const f = fit(q, freeAt(q, w), sub, w, 25); if (!best || f.rms < best.rms) best = f; } m = best.m; } else m = fit(m, freeAt(m, w), sub, w, 40).m;
  }
  m = fit(m, freeAt(m, W), dFit, W, 40).m;
  const base = stats(leftovers(m, hold));
  const g = grow(m, everything, dFit, dVal, PMIN, PMIN_L, 1e-5, (c) => `${c.kind} ${(c.amp / D2R).toFixed(4)} deg ${(TWO_PI / c.w / 365.25).toFixed(2)} yr`);
  m = fit(g.m, everything(g.m), dGlobal, W, 40).m;
  const L = leftovers(m, hold), fin = stats(L), rmsOf = (key) => Math.sqrt(L.reduce((s, l) => s + l[key] * l[key], 0) / L.length) / D2R;
  console.log(`${name.padEnd(10)} one ellipse: worst ${base.worstDeg.toFixed(3)} deg | +${g.added.length} [${g.added.join('; ')}] | held out worst ${fin.worstDeg.toFixed(4)} deg = ${fin.worstKm.toFixed(0)} km, rms ${fin.rmsDeg.toFixed(4)} (along ${rmsOf('along').toFixed(4)} across ${rmsOf('across').toFixed(4)} radial ${rmsOf('radial').toFixed(4)})`);
  return { planet: row.planet, code, ...m, held: fin, base, added: g.added };
}
async function fitDwarf(name, [cmd, center, pmin], dirH) {
  const globalJds = dates(1800, 811), holdJds = dates(300, 577);
  const el = await elements(dirH, cmd, center, J0);
  const dGlobal = (await vectors(dirH, cmd, center, globalJds)).map((r) => ({ t: r.jd - J0, p: r.p })), dFit = dGlobal.filter((_, i) => i % 3 !== 0), dVal = dGlobal.filter((_, i) => i % 3 === 0);
  const hold = (await vectors(dirH, cmd, center, holdJds)).map((r) => ({ t: r.jd - J0, p: r.p }));
  // on the ecliptic of J2000: its pole is at right ascension 270, declination 90 - the obliquity; it does not drift
  let m = { ne: 1, ni: 1, nl: 0, p: [el.a, (el.node + el.w + el.M) * D2R, el.n * D2R, 0, 270 * D2R, (90 - 84381.448 / 3600) * D2R, 0, 0, el.e, (el.node + el.w) * D2R, 0, Math.tan(el.i * D2R / 2), el.node * D2R, 0] };
  const free = (mm) => mm.p.map((_, j) => j).filter((j) => j < 4 || j >= HEAD);
  m = fit(m, free(m), dFit, W, 60).m;
  const base = stats(leftovers(m, hold));
  const g = grow(m, free, dFit, dVal, pmin, pmin, 2e-7, (c) => `${c.kind} ${(c.amp / D2R * 3600).toFixed(2)}" ${(TWO_PI / c.w / 365.25).toFixed(2)} yr`);
  m = fit(g.m, free(g.m), dGlobal, W, 40).m;
  const fin = stats(leftovers(m, hold));
  console.log(`${name.padEnd(9)} one ellipse: worst ${(base.worstDeg * 3600).toFixed(2)}" | +${g.added.length} [${g.added.join('; ')}] | held out worst ${(fin.worstDeg * 3600).toFixed(3)}" = ${fin.worstKm.toFixed(0)} km, rms ${(fin.rmsDeg * 3600).toFixed(3)}"`);
  return { cmd, center, ...m, held: fin, base, added: g.added };
}

// ====================================================================================================== writing
const ORDER = ['phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'charon', 'pluto', 'eris', 'haumea', 'makemake'];
const TAU_R = 2e-9;      // no rounding moves a body by more than a few parts in a thousand million of its orbit
const fix = (x, tol) => { const d = Math.max(0, Math.min(17, Math.ceil(-Math.log10(tol)))); return Number(x.toFixed(d)); };
const norm = (x) => { x %= TWO_PI; return x < 0 ? x + TWO_PI : x; };
function rounded(m) {
  const p = m.p, q = [];
  q.push(fix(p[0], Math.max(1e-4, TAU_R * p[0])), fix(norm(p[1]), TAU_R), fix(p[2], TAU_R / W), fix(p[3], TAU_R / (W * W)), fix(norm(p[4]), TAU_R), fix(p[5], TAU_R), fix(p[6], TAU_R / W), fix(p[7], TAU_R / W));
  let k = HEAD;
  for (let j = 0; j < m.ne + m.ni; j += 1, k += 3) {
    let amp = p[k], ph = p[k + 1]; if (amp < 0) { amp = -amp; ph += Math.PI; }
    const w = Math.max(amp, 1e-7);
    q.push(fix(amp, TAU_R / 2), fix(norm(ph), TAU_R / (2 * w)), fix(p[k + 2], TAU_R / (2 * w * W)));
  }
  for (let j = 0; j < m.nl; j += 1, k += 4) {
    const w = Math.max(Math.abs(p[k]) + Math.abs(p[k + 1]), 1e-7);
    q.push(fix(p[k], TAU_R), fix(p[k + 1], TAU_R), fix(norm(p[k + 2]), TAU_R / w), fix(p[k + 3], TAU_R / (w * W)));
  }
  return { ...m, p: q };
}
function write(fits, outDir) {
  let js = '', total = 0; const lines = [];
  for (const name of ORDER) {
    const f = fits[name]; if (!f) { console.log('no fit for', name); continue; }
    const m = { ne: f.ne, ni: f.ni, nl: f.nl, p: f.p }, r = rounded(m);
    let worst = 0; const a = [0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i <= 400; i += 1) { const t = -W + i * (2 * W / 400) + 0.37 * i; place(m, t, a); place(r, t, b); worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / m.p[0]); }
    if (worst > 1e-7) throw new Error(`rounding moved ${name} by ${worst}`);
    js += `  ${name}: { about: '${f.planet || 'barycentre'}',${name === 'pluto' ? " pair: 'charon'," : ''} ne: ${r.ne}, ni: ${r.ni}, nl: ${r.nl}, p: [${r.p.join(',')}] },\n`;
    total += r.p.length; lines.push(`${name} ${r.ne}/${r.ni}/${r.nl} (${r.p.length} numbers; held out worst ${f.held.worstKm.toFixed(0)} km)`);
  }
  const head = `// orbits.js — the moons about their planets, and the far dwarf planets about the solar system's centre of mass.
// GENERATED: do not edit by hand (SOLAR.md says how it is made, and what each is worth).
//
// JPL publishes mean elements for the planets' moons, with their periods to four or six figures: enough to
// say what an orbit is like, not to say where a moon is tonight. So each orbit here is a small theory of the
// shape those tables have, fitted by least squares to JPL's own ephemerides as Horizons serves them (the moons
// from the planet's centre: MAR099, JUP365, SAT441, URA184, NEP098, PLU060; the dwarf planets from the solar
// system's centre of mass: DE441 and JPL's small-body solutions) at 1,800 dates drawn at random across
// 1900-2100, and then measured at 300 other dates it had never seen. It is not valid outside those two centuries.
//
// p: a (km), L0 (rad), n (rad/day), q (rad/day^2): the mean distance and the mean longitude L0 + n t + q t^2;
//    ra0, dec0 (rad), ra1, dec1 (rad/day): the pole of the plane the angles are measured on (ICRF), and its drift;
//    then ne times (e, w0, w1): the eccentricity vector is the sum of e exp(i (w0 + w1 t));
//    then ni times (s, O0, O1): tan(inclination / 2) exp(i node) is the sum of s exp(i (O0 + O1 t));
//    then nl times (A, B, phase, rate): the longitude gains A sin(phase + rate t) and the distance is
//    multiplied by 1 + B cos(phase + rate t). t is days of TDB from J2000. Longitudes are measured from the
//    plane's rising node on the ICRF equator. ephemeris.js has the dozen lines that turn these into a place.
//
// about: the parent's centre, or 'barycentre'. pair: the orbit is of the pair's centre of mass (Pluto's and
// Charon's), and the body itself stands off it by its partner's share of the mass.
export const ORBITS = {\n`;
  writeFileSync(join(outDir, 'orbits.js'), head + js + '};\n');
  console.log(lines.join('\n')); console.log('orbits.js', (head + js).length, 'bytes,', total, 'numbers');
}

// ========================================================================================================== main
const [verb, ...args] = process.argv.slice(2);
if (verb === 'fit' && args.length >= 3) {
  const [dirN, dirH, outPath, ...only] = args, pck = kernel(join(dirN, 'pck00011.tpc'));
  const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
  for (const name of [...Object.keys(START), ...Object.keys(DWARFS)]) {
    if (only.length ? !only.includes(name) : name === 'ceres') continue;
    out[name] = START[name] ? await fitMoon(name, START[name], pck, dirH) : await fitDwarf(name, DWARFS[name], dirH);
    writeFileSync(outPath, JSON.stringify(out, null, 1));
  }
} else if (verb === 'write' && args.length === 2) write(JSON.parse(readFileSync(args[0], 'utf8')), args[1]);
else { console.error('usage: node scripts/solar/orbits.mjs fit <kernels folder> <cache folder> <fits.json> [names...]\n       node scripts/solar/orbits.mjs write <fits.json> <out folder>'); process.exit(2); }
