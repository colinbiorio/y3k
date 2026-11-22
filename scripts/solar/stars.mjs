// stars.mjs — the Yale Bright Star Catalogue (5th revised ed., CDS V/50 "catalog") as src/game/solar/stars.js. usage:
//
//   node scripts/solar/stars.mjs <bsc5.dat, unpacked> src/game/solar/stars.js
//
// The catalogue is read as text and never run: fixed-width bytes as its ReadMe gives them (1-based, inclusive). The
// copy used (tdc-www.harvard.edu/catalogs/bsc5.dat.gz, unpacked; its sha256 is written into the output) gives the
// committed file byte for byte (SOLAR.md, "How it is made").
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [src, dst] = process.argv.slice(2);
const raw = readFileSync(src);
const text = raw.toString('latin1');
const cut = (line, a, b) => line.substring(a - 1, b);
const num = (s) => (s.trim() === '' ? NaN : Number(s));

// B-V from the spectral type, for the few the catalogue gives no colour: the main sequence's intrinsic colours
// (T. Schmidt-Kaler, Landolt-Börnstein VI/2b, 1982; as E. Mamajek's table carries them), and the giants' for K and M
// of class I to III. Good to about 0.1 mag: enough for a tint.
const DWARF = { O: [-0.33, -0.30], B: [-0.30, -0.02], A: [0.00, 0.27], F: [0.30, 0.55], G: [0.58, 0.78], K: [0.81, 1.38], M: [1.40, 1.80] };
const GIANT = { K: [1.00, 1.55], M: [1.56, 1.65] };
function guessBV(sp) {
  const m = /([OBAFGKM])\s*(\d(?:\.\d)?)?/.exec(sp);
  if (!m) return NaN;
  const sub = m[2] === undefined ? 5 : Number(m[2]);
  const giant = /(^|[^V])(III|II|Ib|Ia|I)([^V]|$)/.test(sp.slice(m.index + 1));
  const [a, b] = ((giant && GIANT[m[1]]) || DWARF[m[1]]);
  return a + (b - a) * sub / 9.5;
}

const rows = [], ERR = [];
let removed = 0, noBV = 0;
for (const line of text.split('\n')) {
  if (line.length < 110) continue;
  const hr = num(cut(line, 1, 4));
  const rah = num(cut(line, 76, 77)), ram = num(cut(line, 78, 79)), ras = num(cut(line, 80, 83));
  const sign = cut(line, 84, 84), ded = num(cut(line, 85, 86)), dem = num(cut(line, 87, 88)), des = num(cut(line, 89, 90));
  const v = num(cut(line, 103, 107));
  if (!Number.isFinite(rah) || !Number.isFinite(v)) { removed += 1; continue; }
  let bv = num(cut(line, 110, 114));
  const sp = cut(line, 128, 147);
  if (!Number.isFinite(bv)) noBV += 1;
  else { const g = guessBV(sp); if (Number.isFinite(g)) ERR.push(g - bv); }
  const pmra = num(cut(line, 149, 154)), pmde = num(cut(line, 155, 160));
  const ra = 15 * (rah + ram / 60 + ras / 3600);
  const dec = (sign === '-' ? -1 : 1) * (ded + dem / 60 + des / 3600);
  rows.push({ hr, ra, dec, pmra: Math.round(1000 * (pmra || 0)), pmde: Math.round(1000 * (pmde || 0)), v, bv, sp, name: cut(line, 5, 14).trim() });
}
// the guess runs bluer than the stars measured (dust reddens them, and many have left the main sequence): it is moved
// by the mean difference over every star that has both
const BIAS = ERR.reduce((s, e) => s + e, 0) / ERR.length;
for (const r of rows) if (!Number.isFinite(r.bv)) r.bv = guessBV(r.sp) - BIAS;
const after = ERR.map((e) => e - BIAS).sort((a, b) => Math.abs(a) - Math.abs(b));
const guess = { n: after.length, bias: BIAS.toFixed(3), rms: Math.sqrt(after.reduce((s, e) => s + e * e, 0) / after.length).toFixed(3), p68: Math.abs(after[Math.floor(0.68 * after.length)]).toFixed(2), p95: Math.abs(after[Math.floor(0.95 * after.length)]).toFixed(2) };
rows.sort((a, b) => a.v - b.v);   // brightest first: a renderer can stop early, and the file reads from Sirius down

const f5 = (x) => (Math.round(x * 1e5) / 1e5).toString();
const f2 = (x) => (Number.isFinite(x) ? (Math.round(x * 100) / 100).toString() : 'NaN');
const body = rows.map((r) => [r.hr, f5(r.ra), f5(r.dec), r.pmra, r.pmde, f2(r.v), f2(r.bv)].join(',')).join(',\n');
const sha = createHash('sha256').update(raw).digest('hex');
const head = `// stars.js — THE STARS: every star the eye can see, from the Yale Bright Star Catalogue. GENERATED: do not edit by hand
// (SOLAR.md says how it is made).
//
// Source: D. Hoffleit and W. H. Warren Jr., The Bright Star Catalogue, 5th revised edition (Yale University
// Observatory, 1991), as CDS catalogue V/50 (file "catalog"), here from the copy the Smithsonian Astrophysical
// Observatory's Telescope Data Center keeps (tdc-www.harvard.edu/catalogs/bsc5.dat.gz; unpacked, sha256 ${sha.slice(0, 16)}...).
// ${rows.length} stars, to about V 6.5; the ${removed} entries the catalogue keeps without a position (novae, clusters, a galaxy
// that were once taken for stars) are left out. Brightest first.
//
// Seven numbers a star: HR (the catalogue's number); right ascension and declination in degrees, on the J2000 equator
// and equinox (FK5, within 0.03 arcsec of the ICRF), at epoch 2000.0; proper motion in mas per Julian year, in right
// ascension times cos(declination) and in declination; V and B-V in magnitudes. For the ${noBV} faint stars the
// catalogue gives no B-V, it is guessed from the spectral type (the main sequence's colours, the giants' for K and M,
// moved redward by ${(-BIAS).toFixed(2)}, the mean difference over the ${ERR.length} stars that have both); tried on those, it
// is within ${guess.p68} mag for 68 in 100 and ${guess.p95} for 95.
export const STAR_FIELDS = 7;
export const STARS = [
${body},
];
`;
writeFileSync(dst, head);
console.log(JSON.stringify({ stars: rows.length, removed, noBV, guessCheck: guess, bytes: head.length, sha256: sha, brightest: rows.slice(0, 8).map((r) => `${r.hr} ${r.name} ${r.v}`) }, null, 1));
