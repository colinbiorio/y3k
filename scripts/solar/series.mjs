// series.mjs — writes src/game/solar/vsop87b.js and elp2000.js: the planets and the Moon, cut for 1900-2100.
//
//   node scripts/solar/series.mjs <VSOP87B folder> <ELP folder> <a folder for Horizons' raw answers> <out folder>
//
// The two theories are IMCCE's files, read as text and never run:
//   https://ftp.imcce.fr/pub/ephem/planets/vsop87/   VSOP87B.mer .ven .ear .mar .jup .sat .ura .nep
//   https://ftp.imcce.fr/pub/ephem/moon/elp82b/      ELP1 .. ELP36 (and elp82b_1, the subroutine ported below)
// What is fitted to JPL's DE441 (through Horizons) is small and kept apart in the output: for the four giants a
// constant, a rate and one sinusoid per argument in each of longitude, latitude and distance; for the Moon three
// numbers in its mean longitude. 600 dates to fit, 300 others to measure; the numbers printed are from the 300.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vectors } from './horizons.mjs';

const [dirV, dirM, dirH, outDir] = process.argv.slice(2);
if (!outDir) { console.error('usage: node scripts/solar/series.mjs <VSOP87B folder> <ELP folder> <cache folder> <out folder>'); process.exit(2); }
// a fixed scatter of dates over 1900-2100 (the golden-ratio sequence): good enough for fits this smooth
function scatter(n, seed, jd0 = 2415020.5, jd1 = 2488069.5) {
  const g = 0.6180339887498949, out = [];
  for (let k = 0; k < n; k += 1) { const f = (seed + k * g) % 1; out.push(Math.round((jd0 + f * (jd1 - jd0)) * 1e4) / 1e4); }
  return out.sort((a, b) => a - b);
}
const big = vectors;

// ================================================================================================== VSOP87B
const AU = 149597870.7;
const PLANETS = { mercury: 'mer', venus: 'ven', earth: 'ear', mars: 'mar', jupiter: 'jup', saturn: 'sat', uranus: 'ura', neptune: 'nep' };

// series[v][alpha] = [[A, B, C], ...]; v 0 = L, 1 = B, 2 = R
function parse(dir, ext) {
  const text = readFileSync(join(dir, 'VSOP87B.' + ext), 'utf8');
  const series = [[], [], []];
  let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (line.includes('VSOP87 VERSION')) {
      const m = /VARIABLE (\d) \(LBR\)\s+\*T\*\*(\d)\s+(\d+) TERMS/.exec(line);
      if (!m) throw new Error('header: ' + line.slice(0, 80));
      cur = []; series[Number(m[1]) - 1][Number(m[2])] = cur; cur.want = Number(m[3]);
      continue;
    }
    // 1x,4i1,i5,12i3,f15.11,2f18.11,f14.11,f20.11
    const A = Number(line.slice(79, 97)), B = Number(line.slice(97, 111)), C = Number(line.slice(111, 131));
    if (!Number.isFinite(A) || !Number.isFinite(B) || !Number.isFinite(C)) throw new Error('term: ' + line.slice(0, 131));
    cur.push([A, B, C]);
  }
  for (const v of series) for (const s of v) if (s && s.length !== s.want) throw new Error('count');
  return series;
}

// t in Julian millennia of TDB from J2000; answers [L, B, R] (rad, rad, au)
function lbr(series, t) {
  const out = [0, 0, 0];
  for (let v = 0; v < 3; v += 1) {
    let tp = 1, sum = 0;
    for (let a = 0; a < series[v].length; a += 1) {
      const s = series[v][a]; let x = 0;
      if (s) for (let i = s.length - 1; i >= 0; i -= 1) x += s[i][0] * Math.cos(s[i][1] + s[i][2] * t);
      sum += x * tp; tp *= t;
    }
    out[v] = sum;
  }
  return out;
}
function xyz([L, B, R]) { const cb = Math.cos(B); return [R * cb * Math.cos(L), R * cb * Math.sin(L), R * Math.sin(B)]; }

// VSOP87's dynamical ecliptic and equinox J2000 -> FK5 J2000 equator (vsop87.doc), then to the ecliptic Horizons uses (obliquity 84381.448")
const M = [[1, 0.000000440360, -0.000000190919], [-0.000000479966, 0.917482137087, -0.397776982902], [0, 0.397776982902, 0.917482137087]];
const EPS = 84381.448 / 3600 * Math.PI / 180, ce = Math.cos(EPS), se = Math.sin(EPS);
function toFk5(p) { return M.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]); }
function eqToEcl(p) { return [p[0], ce * p[1] + se * p[2], -se * p[1] + ce * p[2]]; }

// cut(series, eps, span): keep a term when A * span^alpha (rad, or au / a for R) can reach eps; span in millennia
function cutPlanet(series, eps, span = 0.1, a0 = 1) {
  return series.map((v, vi) => v.map((s, alpha) => {
    if (!s) return [];
    const lim = (vi === 2 ? eps * a0 : eps) / Math.pow(span, alpha);
    return s.filter((term) => Math.abs(term[0]) >= lim);
  }));
}
const countPlanet = (series) => series.reduce((n, v) => n + v.reduce((m, s) => m + (s ? s.length : 0), 0), 0);

// ================================================================================================ ELP 2000-82B
// the 36 files read as text; the subroutine ELP82B_1 ported term for term
const PI = Math.PI, RAD = 648000 / PI, DEG = PI / 180;
const dms = (d, m, s) => (d + m / 60 + s / 3600) * DEG;
const EC = (() => {
  const ath = 384747.9806743165, a0 = 384747.9806448954, am = 0.074801329518, alfa = 0.002571881335;
  const dtasm = 2 * alfa / (3 * am);
  const w = [
    [dms(218, 18, 59.95571), 1732559343.73604 / RAD, -5.8883 / RAD, 0.6604e-2 / RAD, -0.3169e-4 / RAD],
    [dms(83, 21, 11.67475), 14643420.2632 / RAD, -38.2776 / RAD, -0.45047e-1 / RAD, 0.21301e-3 / RAD],
    [dms(125, 2, 40.39816), -6967919.3622 / RAD, 6.3622 / RAD, 0.7625e-2 / RAD, -0.3586e-4 / RAD],
  ];
  const eart = [dms(100, 27, 59.22059), 129597742.2758 / RAD, -0.0202 / RAD, 0.9e-5 / RAD, 0.15e-6 / RAD];
  const peri = [dms(102, 56, 14.42753), 1161.2283 / RAD, 0.5327 / RAD, -0.138e-3 / RAD, 0];
  const preces = 5029.0966 / RAD;
  const p = [
    [dms(252, 15, 3.25986), 538101628.68898 / RAD], [dms(181, 58, 47.28305), 210664136.43355 / RAD], [eart[0], eart[1]],
    [dms(355, 25, 59.78866), 68905077.59284 / RAD], [dms(34, 21, 5.34212), 10925660.42861 / RAD], [dms(50, 4, 38.89694), 4399609.65932 / RAD],
    [dms(314, 3, 18.01841), 1542481.19393 / RAD], [dms(304, 20, 55.19575), 786550.32074 / RAD],
  ];
  const delnu = 0.55604 / RAD / w[0][1], dele = 0.01789 / RAD, delg = -0.08066 / RAD, delnp = -0.06424 / RAD / w[0][1], delep = -0.12879 / RAD;
  // Delaunay: D, l', l, F as polynomials in t (centuries)
  const del = [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0]);
  for (let i = 0; i < 5; i += 1) { del[0][i] = w[0][i] - eart[i]; del[3][i] = w[0][i] - w[2][i]; del[2][i] = w[0][i] - w[1][i]; del[1][i] = eart[i] - peri[i]; }
  del[0][0] += PI;
  const zeta = [w[0][0], w[0][1] + preces];
  const P = [0.10180391e-4, 0.47020439e-6, -0.5417367e-9, -0.2507948e-11, 0.463486e-14];
  const Q = [-0.113469002e-3, 0.12372674e-6, 0.1265417e-8, -0.1371808e-11, -0.320334e-14];
  return { ath, a0, am, dtasm, w, eart, peri, p, delnu, dele, delg, delnp, delep, del, zeta, P, Q };
})();

const ints = (line, n) => { const out = []; for (let i = 0; i < n; i += 1) { const v = Number(line.slice(3 * i, 3 * i + 3)); if (!Number.isInteger(v)) throw new Error('int: ' + line); out.push(v); } return out; };
const real = (s) => { const v = Number(s); if (!Number.isFinite(v) || !s.trim()) throw new Error('real: ' + s); return v; };

// load(dir): { main: [3 lists of {m:[4], x}], pert: [3 lists of {tp, a, f0, f1}] }  (x, a in arcsec or km; f0 rad, f1 rad/century)
function loadMoon(dir) {
  const main = [[], [], []], pert = [[], [], []];
  for (let ific = 1; ific <= 36; ific += 1) {
    const lines = readFileSync(join(dir, 'ELP' + ific), 'utf8').split('\n').slice(1).filter((l) => l.trim());
    const iv = (ific - 1) % 3;
    for (const line of lines) {
      if (ific <= 3) {
        const ilu = ints(line, 4), coef = [real(line.slice(14, 27))];
        for (let k = 0; k < 6; k += 1) coef.push(real(line.slice(29 + 12 * k, 39 + 12 * k)));
        const tgv = coef[1] + EC.dtasm * coef[5];
        if (ific === 3) coef[0] -= 2 * coef[0] * EC.delnu / 3;
        const x = coef[0] + tgv * (EC.delnp - EC.am * EC.delnu) + coef[2] * EC.delg + coef[3] * EC.dele + coef[4] * EC.delep;
        main[iv].push({ m: ilu, x, raw: Math.abs(real(line.slice(14, 27))) });
      } else if (ific <= 9 || ific >= 22) {
        const n = ints(line, 5), pha = real(line.slice(16, 25)), x = real(line.slice(26, 35));
        const tp = (ific >= 7 && ific <= 9) || (ific >= 25 && ific <= 27) ? 1 : (ific >= 34 ? 2 : 0);
        let f0 = pha * DEG, f1 = 0;
        f0 += n[0] * EC.zeta[0]; f1 += n[0] * EC.zeta[1];
        for (let i = 0; i < 4; i += 1) { f0 += n[i + 1] * EC.del[i][0]; f1 += n[i + 1] * EC.del[i][1]; }
        pert[iv].push({ tp, a: x, f0, f1, file: ific });
      } else {
        const n = ints(line, 11), pha = real(line.slice(34, 43)), x = real(line.slice(44, 53));
        const tp = (ific >= 13 && ific <= 15) || (ific >= 19 && ific <= 21) ? 1 : 0;
        let f0 = pha * DEG, f1 = 0;
        if (ific < 16) {
          f0 += n[8] * EC.del[0][0] + n[9] * EC.del[2][0] + n[10] * EC.del[3][0]; f1 += n[8] * EC.del[0][1] + n[9] * EC.del[2][1] + n[10] * EC.del[3][1];
          for (let i = 0; i < 8; i += 1) { f0 += n[i] * EC.p[i][0]; f1 += n[i] * EC.p[i][1]; }
        } else {
          for (let i = 0; i < 4; i += 1) { f0 += n[i + 7] * EC.del[i][0]; f1 += n[i + 7] * EC.del[i][1]; }
          for (let i = 0; i < 7; i += 1) { f0 += n[i] * EC.p[i][0]; f1 += n[i] * EC.p[i][1]; }
        }
        pert[iv].push({ tp, a: x, f0, f1, file: ific });
      }
    }
  }
  return { main, pert };
}

// cut(model, eps): keep what can reach eps (rad) within a century; distance terms by eps * 384400 km
function cutMoon(model, eps) {
  const lim = [eps * RAD, eps * RAD, eps * 384400];
  return { main: model.main.map((l, iv) => l.filter((t) => Math.abs(t.x) >= lim[iv] || t.m.every((k) => k === 0))), pert: model.pert.map((l, iv) => l.filter((t) => Math.abs(t.a) >= lim[iv])) };
}

// ====================================================================================================== the build
const asec = 206264.806, TWO_PI = 2 * Math.PI;
const fitJds = scatter(600, 0.8), holdJds = scatter(300, 0.5);
const Mv = M;
const eclToEq = (p) => [p[0], ce * p[1] - se * p[2], se * p[1] + ce * p[2]];
const toVsop = (p) => { const q = eclToEq(p); return [0, 1, 2].map((j) => Mv[0][j] * q[0] + Mv[1][j] * q[1] + Mv[2][j] * q[2]); };
const sph = (p) => { const r = Math.hypot(...p); return [Math.atan2(p[1], p[0]), Math.asin(p[2] / r), r]; };
const wrap = (x) => { x %= TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x < -Math.PI) x += TWO_PI; return x; };
const norm = (x) => { x %= TWO_PI; return x < 0 ? x + TWO_PI : x; };
function lsq(rows, ys) {
  const n = rows[0].length, A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  rows.forEach((r, k) => { for (let i = 0; i < n; i += 1) { for (let j = 0; j < n; j += 1) A[i][j] += r[i] * r[j]; A[i][n] += r[i] * ys[k]; } });
  for (let i = 0; i < n; i += 1) { let m = i; for (let k = i + 1; k < n; k += 1) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k; [A[i], A[m]] = [A[m], A[i]]; for (let k = i + 1; k < n; k += 1) { const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j += 1) A[k][j] -= f * A[i][j]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i -= 1) { let s = A[i][n]; for (let j = i + 1; j < n; j += 1) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- the planets ----------
const PLAN = {
  mercury: { id: '199', eps: 3e-8, a: 0.387 }, venus: { id: '299', eps: 3e-8, a: 0.723 }, earth: { id: '399', eps: 3e-8, a: 1 }, mars: { id: '499', eps: 3e-8, a: 1.524 },
  jupiter: { id: '599', eps: 5e-8, a: 5.203, args: [['jupiter', 1]] }, saturn: { id: '699', eps: 5e-8, a: 9.555, args: [['saturn', 1]] },
  uranus: { id: '799', eps: 5e-8, a: 19.218, args: [['uranus', 1], ['uranus', 1, 'neptune', -1], ['uranus', 2, 'neptune', -2]] },
  neptune: { id: '899', eps: 5e-8, a: 30.11, args: [['neptune', 1], ['uranus', 1, 'neptune', -1]] },
};
const SPAN = 0.1, TMAX = 0.2, UNIT = 1e-10;
const full = {}; for (const name of Object.keys(PLAN)) full[name] = parse(dirV, PLANETS[name]);
const meanLon = (name) => { const s = full[name][0]; if (s[0][0][2] !== 0 || s[1][0][2] !== 0) throw new Error('first terms'); return [s[0][0][0], s[1][0][0]]; };
// one rounded term: amplitude in units of 1e-10, phase and rate to the figures its size needs
function rounded(term, alpha, vi, a0, tau) {
  const w = Math.abs(term[0]) * Math.pow(SPAN, alpha) / (vi === 2 ? a0 : 1);
  const dB = clamp(Math.ceil(Math.log10(w / (2 * tau))), 0, 11), dC = clamp(Math.ceil(Math.log10(w * TMAX / (2 * tau))), 0, 8);
  return [Math.round(term[0] / UNIT), Number(norm(term[1]).toFixed(dB)), Number(term[2].toFixed(dC))];
}
const evalSeries = (s, t) => { let sum = 0, tp = 1; for (const a of s) { let x = 0; for (let i = 0; i < a.length; i += 3) x += a[i] * Math.cos(a[i + 1] + a[i + 2] * t); sum += x * tp; tp *= t; } return sum * UNIT; };
const evalPlanet = (P, t) => [0, 1, 2].map((v) => evalSeries(P.s[v], t) + (P.fix ? evalSeries(P.fix[v], t) : 0));
const outPlanets = {}; const report = [];
for (const [name, cfg] of Object.entries(PLAN)) {
  const tau = cfg.eps / 20;
  const c = cutPlanet(full[name], cfg.eps, SPAN, cfg.a);
  const P = { s: c.map((v, vi) => { const lists = v.map((terms, alpha) => terms.flatMap((term) => rounded(term, alpha, vi, cfg.a, tau))); while (lists.length && !lists[lists.length - 1].length) lists.pop(); return lists; }) };
  P.n = P.s.reduce((n, v) => n + v.reduce((m, l) => m + l.length / 3, 0), 0);
  if (cfg.args) {
    const fit = await big(dirH, cfg.id, '500@10', fitJds);
    const args = cfg.args.map((a) => { let t0 = 0, t1 = 0; for (let i = 0; i < a.length; i += 2) { const [l0, n] = meanLon(a[i]); t0 += a[i + 1] * l0; t1 += a[i + 1] * n; } return [t0, t1]; });
    const basis = (t) => { const b = [1, t]; for (const [t0, t1] of args) b.push(Math.cos(t0 + t1 * t), Math.sin(t0 + t1 * t)); return b; };
    const rows = fit.map((r) => basis((r.jd - 2451545) / 365250));
    const want = fit.map((r) => sph(toVsop(r.p.map((x) => x / AU)))), have = fit.map((r) => evalPlanet(P, (r.jd - 2451545) / 365250));
    P.fix = [0, 1, 2].map((v) => {
      const co = lsq(rows, want.map((w, k) => (v === 0 ? wrap(w[0] - have[k][0]) : w[v] - have[k][v])));
      const a0 = [[co[0], 0, 0]], a1 = [[co[1], 0, 0]];
      args.forEach(([t0, t1], k) => { const cc = co[2 + 2 * k], ss = co[3 + 2 * k]; a0.push([Math.hypot(cc, ss), t0 - Math.atan2(ss, cc), t1]); });
      // a correction term keeps the figures a term of 1e-6 would: it is small, and its phase must not be coarsened
      const r3 = (term) => [Math.round(term[0] / UNIT), Number(norm(term[1]).toFixed(5)), Number(term[2].toFixed(6))];
      return [a0.flatMap((x) => r3(x)), a1.flatMap((x) => r3(x))];      // the constant and the rate carry their sign: cos(0) = 1 keeps it
    });
  }
  const hold = await big(dirH, cfg.id, '500@10', holdJds);
  let w = 0, wd = 0, sq = 0;
  for (const r of hold) { const t = (r.jd - 2451545) / 365250, m = eqToEcl(toFk5(xyz(evalPlanet(P, t)))).map((x) => x * AU); const d = Math.hypot(m[0] - r.p[0], m[1] - r.p[1], m[2] - r.p[2]), rr = Math.hypot(...r.p); w = Math.max(w, d / rr * asec); sq += (d / rr * asec) ** 2; wd = Math.max(wd, Math.abs(Math.hypot(...m) - rr)); }
  report.push(`${name.padEnd(8)} ${String(P.n).padStart(4)} terms${P.fix ? ' + ' + (P.fix.reduce((n, v) => n + v[0].length / 3 + v[1].length / 3, 0)) + ' fitted' : ''}: held out worst ${w.toFixed(3)}" rms ${Math.sqrt(sq / hold.length).toFixed(3)}" distance ${wd.toFixed(0)} km`);
  outPlanets[name] = P;
}
console.log(report.join('\n'));

const arr = (a) => '[' + a.join(',') + ']';
let js = `// VSOP87B, cut for 1900-2100. GENERATED: do not edit by hand (SOLAR.md says how it is made).
//
// Source: P. Bretagnon and G. Francou, "Planetary theories in rectangular and spherical variables: VSOP87
// solutions", Astronomy & Astrophysics 202, 309 (1988); the files VSOP87B.* published by IMCCE (Observatoire de
// Paris), ftp.imcce.fr/pub/ephem/planets/vsop87/. Heliocentric spherical variables L, B, R on the dynamical
// ecliptic and equinox of J2000. The planets with moons are their systems' centres of mass; the Earth is the Earth.
//
// The cut: a term A cos(B + C t) of the series in t^k (t in Julian millennia of TDB from J2000) is kept when
// A * 0.1^k can reach the planet's threshold (3e-8 rad for Mercury to Mars, 5e-8 for the giants; for R, that
// fraction of the mean distance): what a term can do within a century of J2000. Kept terms are rounded to the
// figures their size needs. Each list is flat: A (in units of 1e-10 rad or au), B (rad), C (rad per millennium).
//
// fix: VSOP87's constants were fitted to JPL's DE200 (1980). For the four giants a few terms of the same form
// (a constant, a rate, and one sinusoid for each argument named in SOLAR.md) were fitted by least squares to
// JPL's DE441 at 600 dates across 1900-2100, and are kept apart here so that what is Bretagnon's and what is
// fitted can be told. They are not valid outside those two centuries.
export const VSOP_UNIT = 1e-10;
export const VSOP = {\n`;
for (const [name, P] of Object.entries(outPlanets)) {
  js += `  ${name}: {\n`;
  ['L', 'B', 'R'].forEach((k, v) => { js += `    ${k}: [\n${P.s[v].map((l) => '      ' + arr(l)).join(',\n')}\n    ],\n`; });
  if (P.fix) js += `    fix: {\n${['L', 'B', 'R'].map((k, v) => `      ${k}: [${P.fix[v].map(arr).join(', ')}]`).join(',\n')}\n    },\n`;
  js += '  },\n';
}
js += '};\n';
writeFileSync(join(outDir, 'vsop87b.js'), js);
console.log('vsop87b.js', js.length, 'bytes');

// ---------- the Moon ----------
const MOON_EPS = Number(process.env.MOON_EPS || 5e-8), MU = 1e-5;
const whole = loadMoon(dirM), cutM = cutMoon(whole, MOON_EPS);
const tauM = MOON_EPS / 20;
// rounded lists: main [D, l', l, F, amp], perturbations by power of t [amp, phase, rate]
const K = EC.a0 / EC.ath;
const main = cutM.main.map((l, iv) => l.flatMap((t) => [...t.m, Math.round(t.x * (iv === 2 ? K : 1) / MU)]));
const pert = cutM.pert.map((l, iv) => [0, 1, 2].map((tp) => l.filter((t) => t.tp === tp).flatMap((t) => {
  const w = (iv === 2 ? t.a / 384400 : t.a / RAD);
  const d0 = clamp(Math.ceil(Math.log10(w / (2 * tauM))), 0, 9), d1 = clamp(Math.ceil(Math.log10(w * 2 / (2 * tauM))), 0, 7);
  return [Math.round(t.a * (iv === 2 ? K : 1) / MU), Number(norm(t.f0).toFixed(d0)), Number(t.f1.toFixed(d1))];
})));
const moonSph = (t, fix) => {
  const tt = [1, t, t * t, t * t * t, t * t * t * t], arg = EC.del.map((c) => c.reduce((s, x, k) => s + x * tt[k], 0)), r = [0, 0, 0];
  for (let iv = 0; iv < 3; iv += 1) {
    let s = 0; const m = main[iv];
    for (let i = 0; i < m.length; i += 5) { const y = m[i] * arg[0] + m[i + 1] * arg[1] + m[i + 2] * arg[2] + m[i + 3] * arg[3]; s += m[i + 4] * (iv === 2 ? Math.cos(y) : Math.sin(y)); }
    pert[iv].forEach((l, tp) => { let x = 0; for (let i = 0; i < l.length; i += 3) x += l[i] * Math.sin(l[i + 1] + l[i + 2] * t); s += x * tt[tp]; });
    r[iv] = s * MU;
  }
  return [r[0] / RAD + EC.w[0].reduce((s, x, k) => s + x * tt[k], 0) + (fix ? fix[0] + fix[1] * t + fix[2] * t * t : 0), r[1] / RAD, r[2]];
};
const moonXyz = (jd, fix) => {
  const t = (jd - 2451545) / 36525, [lon, lat, dist] = moonSph(t, fix), C = EC;
  let x1 = dist * Math.cos(lat); const x2 = x1 * Math.sin(lon); x1 *= Math.cos(lon); const x3 = dist * Math.sin(lat);
  let pw = (C.P[0] + t * (C.P[1] + t * (C.P[2] + t * (C.P[3] + t * C.P[4])))) * t, qw = (C.Q[0] + t * (C.Q[1] + t * (C.Q[2] + t * (C.Q[3] + t * C.Q[4])))) * t;
  const ra = 2 * Math.sqrt(1 - pw * pw - qw * qw), pwqw = 2 * pw * qw, pw2 = 1 - 2 * pw * pw, qw2 = 1 - 2 * qw * qw; pw *= ra; qw *= ra;
  return [pw2 * x1 + pwqw * x2 + pw * x3, pwqw * x1 + qw2 * x2 - qw * x3, -pw * x1 + qw * x2 + (pw2 + qw2 - 1) * x3];
};
const fitM = await big(dirH, '301', '500@399', fitJds), holdM = await big(dirH, '301', '500@399', holdJds);
const fixM = lsq(fitM.map((r) => { const t = (r.jd - 2451545) / 36525; return [1, t, t * t]; }), fitM.map((r) => { const h = sph(toVsop(r.p)), m = sph(moonXyz(r.jd, null)); return wrap(h[0] - m[0]); }));
const statM = (fix) => { let w = 0, wd = 0, sq = 0; for (const r of holdM) { const m = eqToEcl(toFk5(moonXyz(r.jd, fix))); const d = Math.hypot(m[0] - r.p[0], m[1] - r.p[1], m[2] - r.p[2]), rr = Math.hypot(...r.p); w = Math.max(w, d / rr * asec); sq += (d / rr * asec) ** 2; wd = Math.max(wd, Math.abs(Math.hypot(...m) - rr)); } return `worst ${w.toFixed(3)}" rms ${Math.sqrt(sq / holdM.length).toFixed(3)}" distance ${wd.toFixed(3)} km`; };
const nM = main.reduce((n, l) => n + l.length / 5, 0) + pert.reduce((n, v) => n + v.reduce((m, l) => m + l.length / 3, 0), 0);
console.log(`moon     ${nM} terms at ${MOON_EPS}: as published ${statM(null)}; with the fitted longitude (${fixM.map((x) => (x * asec).toFixed(4)).join('", ')}") ${statM(fixM)}`);
const p17 = (x) => String(Number(x.toPrecision(16)));
let mj = `// ELP 2000-82B, cut for 1900-2100. GENERATED: do not edit by hand (SOLAR.md says how it is made).
//
// Source: M. Chapront-Touze and J. Chapront, "The lunar ephemeris ELP 2000", Astronomy & Astrophysics 124, 50
// (1983) and "ELP 2000-85: a semi-analytical lunar ephemeris adequate for historical times", A&A 190, 342
// (1988); the 36 files ELP1..ELP36 and the subroutine ELP82B published by IMCCE (Observatoire de Paris),
// ftp.imcce.fr/pub/ephem/moon/elp82b/. Geocentric longitude, latitude and distance of the Moon's centre.
//
// The cut: of the theory's 37,872 terms the ${nM} that can reach ${MOON_EPS} rad (for the distance, that fraction
// of 384,400 km) are kept, with the subroutine's corrections to the constants (its fit to DE200/LE200) already
// applied to the amplitudes. main: flat lists of [D, l', l, F multipliers, amplitude]; pert: for each power of t
// (centuries of TDB from J2000) flat lists of [amplitude, phase (rad), rate (rad per century)], all sines (the
// main problem's distance is in cosines). Amplitudes are in units of 1e-5 arcsec (longitude, latitude) and
// 1e-5 km (distance).
//
// fix: three numbers (rad, rad per century, rad per century squared) added to the mean longitude W1, fitted by
// least squares to JPL's DE441 at 600 dates across 1900-2100: ELP 2000-82B took its constants, the tidal
// acceleration of the Moon among them, from DE200/LE200 (1980). They are not valid outside those two centuries.
export const ELP_UNIT = 1e-5;
export const ELP = {
  // Delaunay's arguments D, l', l, F and the mean longitude W1: polynomials in t (rad)
  args: [\n${EC.del.map((c) => '    ' + arr(c.map(p17))).join(',\n')}\n  ],
  w1: ${arr(EC.w[0].map(p17))},
  fix: ${arr(fixM.map((x) => String(Number(x.toPrecision(8)))))},
  // Laskar's P and Q: the ecliptic of date on the ecliptic of J2000
  p: ${arr(EC.P.map(String))},
  q: ${arr(EC.Q.map(String))},
  main: [\n${main.map((l) => '    ' + arr(l)).join(',\n')}\n  ],
  pert: [\n${pert.map((v) => '    [\n' + v.map((l) => '      ' + arr(l)).join(',\n') + '\n    ]').join(',\n')}\n  ],
};
`;
writeFileSync(join(outDir, 'elp2000.js'), mj);
console.log('elp2000.js', mj.length, 'bytes');
