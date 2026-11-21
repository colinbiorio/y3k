// horizons.mjs — asking JPL Horizons, politely: one request at a time, every answer kept as text in a folder of
// its own (a cache: the same question is never asked twice), and read as text only. Nothing that comes back is run.
//
//   https://ssd.jpl.nasa.gov/api/horizons.api        (GET: short questions)
//   https://ssd.jpl.nasa.gov/api/horizons_file.api   (POST: a list of up to 2,000 dates)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const API = 'https://ssd.jpl.nasa.gov/api/horizons.api', FILE_API = 'https://ssd.jpl.nasa.gov/api/horizons_file.api';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
export const queryString = (params) => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function ask(file, send) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  let text = '';
  for (let attempt = 0; attempt < 4 && !text.includes('$$SOE'); attempt += 1) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
    try { text = await (await send(ctl.signal)).text(); } catch (e) { text = 'ERR ' + e.message; }
    clearTimeout(timer);
    if (!text.includes('$$SOE')) await sleep(2000 * (attempt + 1));
  }
  if (!text.includes('$$SOE')) throw new Error('Horizons gave no table:\n' + text.slice(0, 800));
  writeFileSync(file, text); await sleep(300);
  return text;
}
// raw(dir, params): the answer to a GET, as text
export async function raw(dir, params) {
  mkdirSync(dir, { recursive: true });
  const qs = queryString({ format: 'text', ...params });
  return ask(join(dir, keyOf(qs) + '.txt'), (signal) => fetch(API + '?' + qs, { signal }));
}
// file(dir, lines): the answer to a batch file (the lines after !$$SOF), as text
export async function file(dir, lines) {
  mkdirSync(dir, { recursive: true });
  const input = ['!$$SOF', ...lines].join('\n') + '\n';
  return ask(join(dir, 'f' + keyOf(input) + '.txt'), (signal) => { const fd = new FormData(); fd.append('format', 'text'); fd.append('input', new Blob([input], { type: 'text/plain' }), 'input.txt'); return fetch(FILE_API, { method: 'POST', body: fd, signal }); });
}
// the rows between $$SOE and $$EOE, split on commas, as trimmed strings; and the line of column names above them
export function rows(text) {
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  if (a < 0 || b < 0) throw new Error('no table');
  return text.slice(a + 5, b).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(',').map((c) => c.trim()));
}
export function columns(text) {
  const lines = text.slice(0, text.indexOf('$$SOE')).trimEnd().split('\n');
  return lines[lines.length - 2].split(',').map((c) => c.trim());
}
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
export const isNum = (s) => NUM.test(s);
export const num = (s) => { if (!NUM.test(s)) throw new Error('not a number: ' + String(s).slice(0, 40)); return Number(s); };

// what a vector table is asked: geometric positions (no light time, no aberration), km, on the ecliptic of J2000
export const vectorLines = (command, center) => [`COMMAND='${command}'`, "OBJ_DATA='NO'", "MAKE_EPHEM='YES'", "EPHEM_TYPE='VECTORS'", `CENTER='${center}'`,
  "REF_PLANE='ECLIPTIC'", "REF_SYSTEM='ICRF'", "VEC_TABLE='1'", "VEC_CORR='NONE'", "OUT_UNITS='KM-S'", "CSV_FORMAT='YES'", "VEC_LABELS='NO'"];
// vectors(dir, command, center, jds): [{ jd, p: [x, y, z] }] at Julian dates of TDB
export async function vectors(dir, command, center, jds) {
  const out = [];
  for (let i = 0; i < jds.length; i += 2000) {
    const text = await file(dir, [...vectorLines(command, center), 'TLIST=', ...jds.slice(i, i + 2000).map((j) => `'${j.toFixed(4)}'`)]);
    for (const r of rows(text)) out.push({ jd: num(r[0]), p: [num(r[2]), num(r[3]), num(r[4])] });
  }
  if (out.length !== jds.length) throw new Error(`asked ${jds.length} dates of ${command}, got ${out.length}`);
  return out;
}
// elements(dir, command, center, jd): osculating elements at one date, ecliptic of J2000, km and days
export async function elements(dir, command, center, jd) {
  const text = await raw(dir, { COMMAND: `'${command}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'ELEMENTS'", CENTER: `'${center}'`, REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-D'", CSV_FORMAT: "'YES'", TLIST: `'${jd}'` });
  const r = rows(text)[0];   // JDTDB, date, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
  return { e: num(r[2]), i: num(r[4]), node: num(r[5]), w: num(r[6]), n: num(r[8]), M: num(r[9]), a: num(r[11]) };
}
// dates(n, seed, jd0, jd1): n Julian dates drawn uniformly by a seeded generator (mulberry32), in order. A regular
// or golden-ratio spacing is a lattice, on which a term of a few days' period and a slow one can look the same:
// every fit that hunts for periods, and every measurement, uses dates drawn like this, from seeds of its own.
export function dates(n, seed, jd0 = 2415020.5, jd1 = 2488069.5) {
  let a = seed >>> 0; const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = new Set(); while (out.size < n) out.add(Math.round((jd0 + next() * (jd1 - jd0)) * 1e4) / 1e4);
  return [...out].sort((x, y) => x - y);
}
// the names Horizons knows the bodies by
export const HORIZONS = { sun: '10', mercury: '199', venus: '299', earth: '399', moon: '301', mars: '499', phobos: '401', deimos: '402', jupiter: '599', io: '501', europa: '502', ganymede: '503', callisto: '504',
  saturn: '699', mimas: '601', enceladus: '602', tethys: '603', dione: '604', rhea: '605', titan: '606', iapetus: '608', uranus: '799', ariel: '701', umbriel: '702', titania: '703', oberon: '704', miranda: '705',
  neptune: '899', triton: '801', pluto: '999', charon: '901', ceres: '1;', eris: '136199;', haumea: '136108;', makemake: '136472;' };
