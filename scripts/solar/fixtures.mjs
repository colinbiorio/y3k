// fixtures.mjs — fetches what test/solar.test.mjs compares the clockwork with, once, from JPL Horizons, and keeps it
// as small JSON with the question beside each answer. usage:
//
//   node scripts/solar/fixtures.mjs <a folder for Horizons' raw answers> [test/fixtures/solar]
//
// The dates are drawn from seeds of their own (never the fits' dates): what the test measures, the fits never saw.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { raw, rows, columns, num, isNum, vectors, vectorLines, dates, HORIZONS, API, FILE_API } from './horizons.mjs';
import { BODIES, ORDER } from '../../src/game/solar/bodies.js';

const [cache, outDir = 'test/fixtures/solar'] = process.argv.slice(2);
if (!cache) { console.error('usage: node scripts/solar/fixtures.mjs <cache folder> [out folder]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const save = (name, obj) => { const s = JSON.stringify(obj); writeFileSync(join(outDir, name), s + '\n'); console.log(name, s.length, 'bytes'); };
const r3 = (x) => Math.round(x * 1000) / 1000;

// 1. where things are: geometric positions at 40 dates of TDB drawn across 1900-2100, km, ecliptic of J2000.
//    Planets, Pluto and the dwarf planets from the Sun's centre; every moon from its planet's centre.
{
  const jds = dates(40, 20261121), bodies = {};
  for (const id of ORDER) {
    if (id === 'sun') continue;
    const b = BODIES[id], center = b.kind === 'moon' ? `500@${HORIZONS[b.parent]}` : '500@10';
    const v = await vectors(cache, HORIZONS[id], center, jds);
    bodies[id] = { command: HORIZONS[id], center, p: v.map((x) => x.p.map(r3)) };
    console.log('vectors', id);
  }
  // the solar system's centre of mass from the Sun's centre; and four dates outside the two centuries, to see how it wears
  const centre = (await vectors(cache, '0', '500@10', jds)).map((x) => x.p.map(r3));
  const far = [2378498.5, 2396758.5, 2506331.5, 2524228.5], beyond = {};
  for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) beyond[id] = (await vectors(cache, HORIZONS[id], '500@10', far)).map((x) => x.p.map(r3));
  beyond.moon = (await vectors(cache, '301', '500@399', far)).map((x) => x.p.map(r3));
  save('vectors.json', { source: 'JPL Horizons, ' + FILE_API, asked: vectorLines('<command>', '<center>').join(' ') + " TLIST=<dates>", note: 'geometric, km, ecliptic of J2000 (ICRF), at Julian dates of TDB; dates = mulberry32 seed 20261121, uniform on 1900-2100', dates: jds, bodies, centre, beyond: { note: 'the same, at 3 January 1800 and 1 January 1850, 2150 and 2199', dates: far, bodies: beyond } });
}

// 2. what is seen from Lord Howe Island: Horizons' observer table at 14 instants of UT across 1973-2026
const SITE = { lon: 159.08, lat: -31.55, km: 0 };
const observer = (id, extra) => ({ COMMAND: `'${HORIZONS[id]}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", CENTER: "'coord@399'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${SITE.lon},${SITE.lat},${SITE.km}'`,
  CSV_FORMAT: "'YES'", ANG_FORMAT: "'DEG'", EXTRA_PREC: "'YES'", CAL_FORMAT: "'JD'", ...extra });
const want = { 'Date_________JDUT': 'jd', 'R.A.__(a-app)': 'ra', 'DEC___(a-app)': 'dec', 'Azimuth_(a-app)': 'az', 'Elevation_(a-app)': 'alt', 'L_Ap_Sid_Time': 'last', APmag: 'mag', 'Illu%': 'lit', 'Ang-diam': 'diam',
  'ObsSub-LON': 'subLon', 'ObsSub-LAT': 'subLat', 'SunSub-LAT': 'sunLat', 'SN.ang': 'limb', 'NP.ang': 'axis', delta: 'au', '1-way_down_LT': 'lt', 'S-O-T': 'elong', 'S-T-O': 'phase' };
{
  const jds = dates(14, 31551590, 2441683.5, 2461360.5).map((j) => Math.round(j * 1e3) / 1e3), bodies = {};
  const ids = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'io', 'titan'].filter((id) => ORDER.includes(id));
  let asked = '';
  for (const id of ids) {
    const params = observer(id, { TLIST: `'${jds.join(' ')}'`, QUANTITIES: "'2,4,7,9,10,13,14,15,16,17,20,21,23,24'", APPARENT: "'AIRLESS'" });
    const text = await raw(cache, params), cols = columns(text); asked = Object.entries(params).filter(([k]) => k !== 'COMMAND' && k !== 'TLIST').map(([k, v]) => `${k}=${v}`).join(' ');
    // a cell Horizons marks n.a. is left out
    bodies[id] = rows(text).map((r) => { const o = {}; cols.forEach((c, k) => { if (want[c] && isNum(r[k])) o[want[c]] = num(r[k]); }); return o; });
    if (bodies[id].length !== jds.length) throw new Error('rows of ' + id);
    console.log('observer', id);
  }
  save('observer.json', { source: 'JPL Horizons, ' + API, site: SITE, asked, note: 'airless apparent places at Julian dates of UT (mulberry32 seed 31551590, uniform on 1973-2026); angles in degrees, last in hours, diam in arcsec, au, lt in minutes; subLon as Horizons counts it for each body', bodies });
}

// 3. events: the air at the horizon and a sunrise at Lord Howe; Jupiter and Saturn on 21 December 2020 from the Earth's centre
{
  const day = { START_TIME: "'2026-11-20 12:00'", STOP_TIME: "'2026-11-21 12:00'" };
  const table = async (extra) => { const text = await raw(cache, observer('sun', { QUANTITIES: "'4'", ...extra })); return { text, rows: rows(text), cols: columns(text) }; };
  const air = await table({ ...day, STEP_SIZE: "'20 m'", APPARENT: "'AIRLESS'" }), bent = await table({ ...day, STEP_SIZE: "'20 m'", APPARENT: "'REFRACTED'" });
  const ai = air.cols.indexOf('Elevation_(a-app)'), bi = bent.cols.indexOf('Elevation_(r-app)');
  const refraction = air.rows.map((r, k) => ({ jd: num(r[0]), alt: num(r[ai]), lifted: num(bent.rows[k][bi]) })).filter((r) => r.alt > -1 && r.alt < 30);
  const rts = await table({ ...day, STEP_SIZE: "'1 m'", APPARENT: "'REFRACTED'", R_T_S_ONLY: "'TVH'" });
  const ri = rts.cols.indexOf('Elevation_(r-app)'), zi = rts.cols.indexOf('Azimuth_(r-app)');
  const sunrise = rts.rows.map((r) => ({ jd: num(r[0]), mark: r.slice(1, 3).join(''), az: num(r[zi]), alt: num(r[ri]) }));
  const geo = async (id) => rows(await raw(cache, { COMMAND: `'${HORIZONS[id]}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", CENTER: "'500@399'", START_TIME: "'2020-12-21 12:00'", STOP_TIME: "'2020-12-22 00:00'", STEP_SIZE: "'1 h'",
    QUANTITIES: "'2'", CSV_FORMAT: "'YES'", ANG_FORMAT: "'DEG'", EXTRA_PREC: "'YES'", CAL_FORMAT: "'JD'", APPARENT: "'AIRLESS'" })).map((r) => ({ jd: num(r[0]), ra: num(r[3]), dec: num(r[4]) }));
  save('events.json', { source: 'JPL Horizons, ' + API, site: SITE,
    refraction: { asked: "the Sun, QUANTITIES='4', every 20 minutes of 2026-11-20 12:00 to 2026-11-21 12:00 UT, APPARENT='AIRLESS' and 'REFRACTED'", rows: refraction },
    sunrise: { asked: "the Sun, QUANTITIES='4', STEP_SIZE='1 m', APPARENT='REFRACTED', R_T_S_ONLY='TVH' (rise, transit, set on the true visual horizon, to the minute)", rows: sunrise },
    conjunction: { asked: "Jupiter and Saturn, CENTER='500@399', QUANTITIES='2', hourly on 2020-12-21 12:00 to 24:00 UT: apparent right ascension and declination of date, degrees", jupiter: await geo('jupiter'), saturn: await geo('saturn') } });
}
