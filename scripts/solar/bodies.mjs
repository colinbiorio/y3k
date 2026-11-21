// bodies.mjs — writes src/game/solar/bodies.js from NAIF's kernels (read as text) and the tables copied below from the
// pages named beside them (all fetched 20-21 November 2026). usage:
//
//   node scripts/solar/bodies.mjs <folder holding pck00011.tpc and gm_de440.tpc> <out folder> <id,id,...>
//
// The last argument is the bodies that have an ephemeris: only those are written (SOLAR.md lists what is owed).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { kernel } from './kernels.mjs';
const [dirN, outDir, shipArg] = process.argv.slice(2);
const pck = kernel(join(dirN, 'pck00011.tpc')), gm = kernel(join(dirN, 'gm_de440.tpc'));
const ship = new Set(shipArg.split(','));

// id, NAIF code, kind, parent
const LIST = [['sun', 10, 'star', null], ['mercury', 199, 'planet', 'sun'], ['venus', 299, 'planet', 'sun'], ['earth', 399, 'planet', 'sun'], ['moon', 301, 'moon', 'earth'],
  ['mars', 499, 'planet', 'sun'], ['phobos', 401, 'moon', 'mars'], ['deimos', 402, 'moon', 'mars'],
  ['jupiter', 599, 'planet', 'sun'], ['io', 501, 'moon', 'jupiter'], ['europa', 502, 'moon', 'jupiter'], ['ganymede', 503, 'moon', 'jupiter'], ['callisto', 504, 'moon', 'jupiter'],
  ['saturn', 699, 'planet', 'sun'], ['mimas', 601, 'moon', 'saturn'], ['enceladus', 602, 'moon', 'saturn'], ['tethys', 603, 'moon', 'saturn'], ['dione', 604, 'moon', 'saturn'], ['rhea', 605, 'moon', 'saturn'], ['titan', 606, 'moon', 'saturn'], ['iapetus', 608, 'moon', 'saturn'],
  ['uranus', 799, 'planet', 'sun'], ['miranda', 705, 'moon', 'uranus'], ['ariel', 701, 'moon', 'uranus'], ['umbriel', 702, 'moon', 'uranus'], ['titania', 703, 'moon', 'uranus'], ['oberon', 704, 'moon', 'uranus'],
  ['neptune', 899, 'planet', 'sun'], ['triton', 801, 'moon', 'neptune'],
  ['pluto', 999, 'dwarf', 'sun'], ['charon', 901, 'moon', 'pluto'], ['eris', 0, 'dwarf', 'sun'], ['haumea', 0, 'dwarf', 'sun'], ['makemake', 0, 'dwarf', 'sun']];

// Geometric (visual) and Bond albedos. Planets, the Moon, Pluto: NASA planetary fact sheets (D. R. Williams, NSSDCA);
// the planets' visual values there are those of Mallama et al. 2017. Moons: the NASA satellite fact sheets
// (Jovian, Saturnian, Uranian, Neptunian, Mars, Pluto). Eris, Haumea, Makemake: JPL SSD "Planetary Physical Parameters".
const ALBEDO = { mercury: [0.142, 0.068], venus: [0.689, 0.77], earth: [0.434, 0.294], moon: [0.12, 0.11], mars: [0.170, 0.250], jupiter: [0.538, 0.343], saturn: [0.499, 0.342], uranus: [0.488, 0.300], neptune: [0.442, 0.290], pluto: [0.52, 0.72],
  phobos: [0.07], deimos: [0.08], io: [0.62], europa: [0.68], ganymede: [0.44], callisto: [0.19], mimas: [0.6], enceladus: [1.0], tethys: [0.8], dione: [0.7], rhea: [0.7], titan: [0.22], iapetus: [0.05, null, 0.5],
  miranda: [0.32], ariel: [0.39], umbriel: [0.21], titania: [0.27], oberon: [0.23], triton: [0.72], charon: [0.42], eris: [0.84], haumea: [0.72], makemake: [0.81] };
// Geometric albedos in three bands: A. Mallama, B. Krobusek and H. Pavlov, "Comprehensive wide-band magnitudes and
// albedos for the planets", Icarus 282, 19 (2017), table 7: Sloan r' (623 nm), Johnson V (551 nm), and the mean of
// Johnson B (445 nm) and Sloan g' (477 nm). The colour is these three as red, green and blue, the largest set
// to one, in sRGB's encoding: the planet's own colour under sunlight taken as white. Brightness is the albedo's job.
const BANDS = { mercury: [0.169, 0.142, (0.105 + 0.130) / 2], venus: [0.712, 0.689, (0.658 + 0.664) / 2], earth: [0.388, 0.434, (0.512 + 0.497) / 2], mars: [0.245, 0.170, (0.088 + 0.111) / 2],
  jupiter: [0.575, 0.538, (0.443 + 0.509) / 2], saturn: [0.618, 0.499, (0.339 + 0.436) / 2], uranus: [0.355, 0.488, (0.561 + 0.559) / 2], neptune: [0.307, 0.442, (0.562 + 0.533) / 2] };
const srgb = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
const colour = (b) => { const m = Math.max(...b); return '0x' + b.map((x) => srgb(x / m).toString(16).padStart(2, '0')).join(''); };
// Atmospheres: NASA planetary fact sheets. pressure in Pa at the surface (for the giants the 1 bar level, where
// their radii are measured), scale height in km, temperature in K there, the main gases by volume.
const AIR = { venus: [9.2e6, 15.9, 737, 'CO2 96.5%, N2 3.5%'], earth: [101400, 8.5, 288, 'N2 78.08%, O2 20.95%'], mars: [636, 11.0, 214, 'CO2 95.1%, N2 2.59%'],
  jupiter: [1e5, 27, 165, 'H2 89.8%, He 10.2%'], saturn: [1e5, 59.5, 134, 'H2 96.3%, He 3.25%'], uranus: [1e5, 27.7, 76, 'H2 82.5%, He 15.2%'], neptune: [1e5, 19.7, 72, 'H2 80.0%, He 19.0%'], pluto: [1.3, 18, null, 'N2 99%, CH4 0.5%'] };
// Rings: NASA ring fact sheets (Saturnian 2022, Jupiter 2015, Uranus, Neptunian). Radii in km from the planet's
// centre; depth is the optical depth (one number or a range), albedo where the sheet gives one, width in km for
// the narrow ones, which are given by their one radius.
const RINGS = {
  jupiter: [['Halo', 89400, 123000, 3e-6], ['Main', 123000, 128940, 5e-6, 0.015], ['Amalthea gossamer', 128940, 181350, 1e-7], ['Thebe gossamer', 181350, 221900, 1e-7], ['Thebe extension', 221900, 280000, 1e-7]],
  saturn: [['D', 66900, 74510, 1e-5], ['C', 74658, 91975, [0.05, 0.35], [0.12, 0.30]], ['B', 91975, 117507, [0.4, 2.5], [0.4, 0.6]], ['Cassini division', 117507, 122340, [0, 0.1], [0.2, 0.4]],
    ['A', 122340, 136780, [0.4, 1.0], [0.4, 0.6]], ['F', 139826, 139826, 0.1, 0.6], ['G', 166000, 173000, 1e-6], ['E', 180000, 480000, 1e-6]],
  uranus: [['6', 41837, 41837, 0.3, 0.015, 1.5], ['5', 42234, 42234, 0.5, 0.015, 2], ['4', 42571, 42571, 0.3, 0.015, 2], ['Alpha', 44718, 44718, 0.4, 0.015, [4, 10]], ['Beta', 45661, 45661, 0.3, 0.015, [5, 11]],
    ['Eta', 47176, 47176, 0.4, 0.015, 1.6], ['Gamma', 47627, 47627, 0.3, 0.015, [1, 4]], ['Delta', 48300, 48300, 0.5, 0.015, [3, 7]], ['Lambda', 50024, 50024, 0.1, 0.015, 2], ['Epsilon', 51149, 51149, [0.5, 2.3], 0.018, [20, 96]],
    ['Nu', 67300, 67300, null, null, 3800], ['Mu', 97700, 97700, null, null, 17000]],
  neptune: [['Galle', 41900, 41900, 1e-4, 0.015, 2000], ['Le Verrier', 53200, 53200, 0.01, 0.015, 100], ['Lassell', 53200, 57200, 1e-4, 0.015], ['Arago', 57200, 57200, null, null, 100], ['Adams', 62933, 62933, [0.01, 0.1], 0.015, 15]],
};
const GAPS = { saturn: [['Encke', 133410], ['Keeler', 136487]] };
// Eris, Haumea, Makemake are not in the kernels: JPL SSD "Planetary Physical Parameters" (equatorial and mean
// radius km, mass 1e18 kg, rotation days), with G = 6.67430e-20 km^3 kg^-1 s^-2.
const G = 6.67430e-20;
const OUTER = { eris: { radii: [1200, 1200, 1200], mass: 16600e18, rotation: 1.079 }, haumea: { radii: [715, 715, 715], mass: 4006e18, rotation: 0.1631 }, makemake: { radii: [714, 714, 714], mass: 3100e18, rotation: 0.937 } };

const num = (x) => String(Number(x.toPrecision(15)));
const arr = (a) => '[' + a.map((x) => (Array.isArray(x) ? arr(x) : x === null || x === undefined ? 'null' : typeof x === 'string' ? JSON.stringify(x) : num(x))).join(', ') + ']';
const cap = (s) => s[0].toUpperCase() + s.slice(1);
let js = '';
const order = [];
for (const [id, code, kind, parent] of LIST) {
  if (!ship.has(id)) continue;
  order.push(id);
  const f = [`name: '${cap(id)}'`, `kind: '${kind}'`, `parent: ${parent ? `'${parent}'` : 'null'}`];
  if (code) {
    const sys = Math.floor(code / 100), g = gm[`BODY${code}_GM`];
    f.push(`naif: ${code}`, `gm: ${num(g[0])}`);
    if (kind === 'planet' && gm[`BODY${sys}_GM`] && sys >= 3) f.push(`gmSystem: ${num(gm[`BODY${sys}_GM`][0])}`);
    if (id === 'pluto') f.push(`gmSystem: ${num(gm.BODY9_GM[0])}`);
    f.push(`radii: ${arr(pck[`BODY${code}_RADII`])}`);
    const ra = pck[`BODY${code}_POLE_RA`], dec = pck[`BODY${code}_POLE_DEC`], w = pck[`BODY${code}_PM`];
    const pad = (a) => [a[0], a[1] || 0, a[2] || 0];
    f.push(`rotation: ${num(360 / w[1])}`);
    const terms = [], stride = (pck[`BODY${sys}_MAX_PHASE_DEGREE`] ? pck[`BODY${sys}_MAX_PHASE_DEGREE`][0] : 1) + 1, ang = pck[`BODY${sys}_NUT_PREC_ANGLES`] || [];
    const cr = pck[`BODY${code}_NUT_PREC_RA`] || [], cd = pck[`BODY${code}_NUT_PREC_DEC`] || [], cw = pck[`BODY${code}_NUT_PREC_PM`] || [];
    for (let k = 0; k < Math.max(cr.length, cd.length, cw.length); k += 1) {
      if (!(cr[k] || cd[k] || cw[k])) continue;
      const a = ang.slice(k * stride, k * stride + stride); if (a.length !== stride) throw new Error(`angle ${k} of ${id}`);
      terms.push(a[0], a[1], a[2] || 0, cr[k] || 0, cd[k] || 0, cw[k] || 0);
    }
    f.push(`pole: { ra: ${arr(pad(ra))}, dec: ${arr(pad(dec))}, w: ${arr(pad(w))}, terms: ${arr(terms)} }`);
  } else {
    const o = OUTER[id];
    f.push(`gm: ${num(o.mass * G)}`, `radii: ${arr(o.radii)}`, `rotation: ${num(o.rotation)}`, 'pole: null');
  }
  const al = ALBEDO[id];
  if (al) { f.push(`albedo: ${al[0]}`); if (al[1] != null) f.push(`bond: ${al[1]}`); if (al[2] != null) f.push(`albedoTrailing: ${al[2]}`); }
  if (id === 'sun') f.push('temperature: 5772');
  f.push(`color: ${BANDS[id] ? colour(BANDS[id]) : 'null'}`);
  if (AIR[id]) { const a = AIR[id]; f.push(`atmosphere: { pressure: ${num(a[0])}, scaleHeight: ${a[1]}, temperature: ${a[2]}, gas: '${a[3]}' }`); }
  if (RINGS[id]) {
    const rows = RINGS[id].map((r) => `      { name: '${r[0]}', inner: ${r[1]}, outer: ${r[2]}, depth: ${Array.isArray(r[3]) ? arr(r[3]) : r[3] == null ? 'null' : r[3]}${r[4] != null ? `, albedo: ${Array.isArray(r[4]) ? arr(r[4]) : r[4]}` : ''}${r[5] != null ? `, width: ${Array.isArray(r[5]) ? arr(r[5]) : r[5]}` : ''} }`);
    f.push(`rings: [\n${rows.join(',\n')},\n    ]`);
    if (GAPS[id]) f.push(`gaps: [${GAPS[id].map((g) => `{ name: '${g[0]}', radius: ${g[1]} }`).join(', ')}]`);
  }
  js += `  ${id}: {\n    ${f.join(',\n    ')},\n  },\n`;
}
const head = `// bodies.js — WHAT EACH BODY IS: its pull, its size, how it turns, how it shines. GENERATED: do not edit by hand
// (SOLAR.md says how it is made, and what is owed).
//
// gm        km^3/s^2: NAIF's gm_de440.tpc (the masses of JPL's DE440; R. S. Park et al. 2021). gmSystem is a
//           planet with its moons. Eris, Haumea and Makemake: JPL SSD "Planetary Physical Parameters", mass times G.
// radii     km, the three semi-axes (toward the planet or along the equator, across, and the pole): NAIF's
//           pck00011.tpc, which carries the IAU Working Group on Cartographic Coordinates and Rotational Elements'
//           2015 report (B. A. Archinal et al., Celestial Mechanics and Dynamical Astronomy 130, 22, 2018). The
//           giants' are at the 1 bar level. Eris, Haumea, Makemake: JPL's mean radius, as a sphere; Haumea is in
//           truth a long ellipsoid, and that shape is owed.
// pole      the IAU model of the same report, from the same kernel, in degrees: the north pole's right ascension
//           ra = ra[0] + ra[1] T + ra[2] T^2 and declination (ICRF), the prime meridian's angle
//           w = w[0] + w[1] d + w[2] d^2, with T Julian centuries and d days of TDB from J2000; then for each
//           six numbers of terms (angle at J2000, its rate per century, its square term; coefficients for ra,
//           dec, w): ra += c sin(angle), dec += c cos(angle), w += c sin(angle). The Earth's is the IAU's
//           approximation, kept for the record: ephemeris.js turns the Earth by precession, nutation and sidereal
//           time. null where the IAU has adopted none.
// rotation  sidereal days for one turn, 360 / w[1]; negative when the body turns backwards about its IAU north
//           pole. For the giants this is the rotation of the magnetic field (System III).
// albedo    geometric, visual; bond where it is known. NASA's planetary and satellite fact sheets (D. R. Williams,
//           NSSDCA, Goddard); the three outer dwarfs from JPL's table. Iapetus has two faces: albedo is the
//           leading one, albedoTrailing the other.
// color     0xRRGGBB, the planet's own colour under sunlight taken as white: the geometric albedos of A. Mallama,
//           B. Krobusek and H. Pavlov (Icarus 282, 19, 2017, table 7) at 623, 551 and about 460 nm as red, green
//           and blue, the largest set to one, in sRGB's encoding. Only the eight planets have been measured this
//           way: null for the rest, owed. Brightness is the albedo's job, not the colour's.
// atmosphere  NASA's fact sheets: pressure in Pa at the surface (for the giants the 1 bar level), scale height in
//           km, temperature in K, the main gases by volume. Titan's and Triton's are owed.
// rings     NASA's ring fact sheets: inner and outer radius in km from the planet's centre (the same number twice
//           for a narrow ring, with its width in km), optical depth (a number or a range), albedo where given.
//
// The speed of light and the astronomical unit are exact by definition (SI 1983; IAU 2012 Resolution B2).
export const C = 299792.458;          // km/s
export const AU = 149597870.7;        // km
export const BODIES = {\n`;
writeFileSync(join(outDir, 'bodies.js'), head + js + `};\n// every body that has an ephemeris, the Sun first, each moon after its planet\nexport const ORDER = ${JSON.stringify(order).replace(/"/g, "'").replace(/,/g, ', ')};\n`);
console.log('bodies.js', order.length, 'bodies', (head + js).length, 'bytes');
