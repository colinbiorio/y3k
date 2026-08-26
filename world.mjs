// THE WORLD — one planet for small minds. SERVER-ONLY (deny-listed).
//
// The planet is a SEED, not a database. Terrain is a pure function of
// coordinates, identical for every client forever; only CHANGES are stored
// (the Minecraft model). The world WRAPS — walk far enough any direction and
// you come home — which is a globe in every way that matters and costs no
// sphere geometry.
//
// Movement is pure too: a settlement stores its COURSE (from, toward,
// started-when, speed) and every client computes the same position from the
// clock. Bodies wander deterministically around their anchor. There is no
// simulation tick anywhere — the planet is math until somebody touches it.
//
// The lines from WORLD.md hold here structurally: a sleeping settlement's
// ground and bodies accept NO writes from anyone but its own owner, and
// there is no API for harming anything.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.world.json');

export const WORLD_SIZE = 4096;   // blocks per side; wraps
export const CHUNK = 16;          // blocks per chunk side
export const SEA_LEVEL = 8;       // heights below this are water
const MAX_H = 24;                 // terrain height range 0..MAX_H
const WORLD_SEED = 3000;          // the year, of course
const WALK_SPEED = 2;             // blocks per second on migration
const AWAKE_MS = 90 * 1000;       // a heartbeat within this = the society is awake
const MAX_EDITS_PER_CHUNK = 256;  // a chunk can be reshaped, not exploded
const MAX_EDITED_CHUNKS = 4000;   // global edit budget (sparse by design)
const MAX_BODIES = 6;             // v1 society size
const HOME_RADIUS = 14;           // bodies wander this far from the anchor

export const wrap = (v) => ((v % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE;
// shortest signed distance on a wrapped axis
const wdelta = (a, b) => {
  let d = wrap(b) - wrap(a);
  if (d > WORLD_SIZE / 2) d -= WORLD_SIZE;
  if (d < -WORLD_SIZE / 2) d += WORLD_SIZE;
  return d;
};
export const wdist = (x1, z1, x2, z2) => Math.hypot(wdelta(x1, x2), wdelta(z1, z2));

// --- terrain: pure, seeded, identical everywhere -----------------------------
// 2D value noise over a wrapped lattice, a few octaves — the same instinct as
// the sky shaders, in integer land. hash → lattice corners → smooth mix.
function hash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, z, scale, seed) {
  // lattice coords wrap so the noise itself is seamless across the seam
  const lat = WORLD_SIZE / scale;
  const fx = wrap(x) / scale, fz = wrap(z) / scale;
  const x0 = Math.floor(fx) % lat, z0 = Math.floor(fz) % lat;
  const x1 = (x0 + 1) % lat, z1 = (z0 + 1) % lat;
  const tx = smooth(fx - Math.floor(fx)), tz = smooth(fz - Math.floor(fz));
  const a = hash2(x0, z0, seed), b = hash2(x1, z0, seed);
  const c = hash2(x0, z1, seed), d = hash2(x1, z1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

// The planet's ground at (x, z): height + surface material. Pure.
export function terrainAt(x, z) {
  const broad = vnoise(x, z, 256, WORLD_SEED);        // continents
  const hills = vnoise(x, z, 64, WORLD_SEED + 1);     // rolling variation
  const fine = vnoise(x, z, 16, WORLD_SEED + 2);      // local texture
  let h = Math.round((broad * 0.62 + hills * 0.28 + fine * 0.10) * MAX_H);
  const moist = vnoise(x, z, 128, WORLD_SEED + 3);
  let mat;
  if (h < SEA_LEVEL) mat = 'water';
  else if (h < SEA_LEVEL + 1) mat = 'sand';
  else if (h > MAX_H - 5) mat = 'stone';
  else mat = moist > 0.45 ? 'grass' : 'soil';
  return { h: Math.max(0, h), mat };
}

// --- the store: edits + settlements ------------------------------------------
let store = { edits: {}, settlements: {} };
try {
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
  if (parsed && typeof parsed === 'object') store = { edits: parsed.edits || {}, settlements: parsed.settlements || {} };
} catch { /* an unmarked planet */ }

let pending = null;
function persist() { // coalesced like mind.mjs — edits can come in bursts
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      const tmp = FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify(store));
      renameSync(tmp, FILE);
    } catch (e) { console.error('[world] persist failed:', e.message); }
  }, 1000);
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
  process.once(sig, () => { if (pending) { clearTimeout(pending); pending = null; try { const tmp = FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(store)); renameSync(tmp, FILE); } catch { /* best effort */ } } });
}

const chunkKey = (cx, cz) => `${cx},${cz}`;
export const chunkOf = (v) => Math.floor(wrap(v) / CHUNK);

// A chunk as a client renders it: base terrain + any edits laid over.
export function chunkData(cx, cz) {
  const heights = new Array(CHUNK * CHUNK);
  const mats = new Array(CHUNK * CHUNK);
  const bx = ((cx % (WORLD_SIZE / CHUNK)) + WORLD_SIZE / CHUNK) % (WORLD_SIZE / CHUNK) * CHUNK;
  const bz = ((cz % (WORLD_SIZE / CHUNK)) + WORLD_SIZE / CHUNK) % (WORLD_SIZE / CHUNK) * CHUNK;
  for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
    const t = terrainAt(bx + x, bz + z);
    heights[z * CHUNK + x] = t.h;
    mats[z * CHUNK + x] = t.mat;
  }
  const edits = store.edits[chunkKey(chunkOf(bx), chunkOf(bz))] || null;
  if (edits) {
    for (const [k, e] of Object.entries(edits)) {
      const [lx, lz] = k.split(',').map(Number);
      const i = lz * CHUNK + lx;
      if (i >= 0 && i < CHUNK * CHUNK) {
        if (typeof e.h === 'number') heights[i] = Math.max(0, Math.min(MAX_H + 8, e.h));
        if (e.mat) mats[i] = e.mat;
      }
    }
  }
  return { cx, cz, heights, mats };
}

const EDIT_MATS = new Set(['grass', 'soil', 'stone', 'sand', 'path', 'wall', 'light', 'growth']);

// One reshaped column. `who` must own the settlement whose ground this is —
// the caller (server route) enforces session identity; this enforces TERRITORY:
// writes land only near the writer's own anchor, so a sleeping society's
// ground is structurally untouchable by anyone else.
export function setColumn(presenceId, x, z, { h, mat } = {}) {
  const s = store.settlements[presenceId];
  if (!s) return { error: 'no settlement' };
  const at = anchorAt(s, Date.now());
  if (wdist(x, z, at.x, at.z) > HOME_RADIUS + 6) return { error: 'that ground is beyond your society\'s reach' };
  // never inside another society's home ground
  for (const [pid, o] of Object.entries(store.settlements)) {
    if (pid === presenceId) continue;
    const oa = anchorAt(o, Date.now());
    if (wdist(x, z, oa.x, oa.z) <= HOME_RADIUS) return { error: 'that ground belongs to another society' };
  }
  const cx = chunkOf(x), cz = chunkOf(z);
  const ck = chunkKey(cx, cz);
  if (!store.edits[ck] && Object.keys(store.edits).length >= MAX_EDITED_CHUNKS) return { error: 'the world holds enough marks for now' };
  const chunk = store.edits[ck] || (store.edits[ck] = {});
  const lk = `${wrap(x) % CHUNK},${wrap(z) % CHUNK}`;
  if (!chunk[lk] && Object.keys(chunk).length >= MAX_EDITS_PER_CHUNK) return { error: 'this ground is fully worked' };
  const e = chunk[lk] || (chunk[lk] = {});
  if (typeof h === 'number') e.h = Math.max(0, Math.min(MAX_H + 8, Math.round(h)));
  if (mat && EDIT_MATS.has(mat)) e.mat = mat;
  persist();
  return { ok: true };
}

// --- settlements --------------------------------------------------------------

// Deterministic founding spot: hash the presence id onto dry land.
function foundingSpot(presenceId) {
  let n = 0;
  for (const ch of String(presenceId)) n = (n * 31 + ch.charCodeAt(0)) | 0;
  for (let tries = 0; tries < 200; tries++) {
    const x = wrap(Math.abs(n + tries * 7919) % WORLD_SIZE);
    const z = wrap(Math.abs(Math.imul(n, 2654435761) + tries * 104729) % WORLD_SIZE);
    const t = terrainAt(x, z);
    if (t.mat === 'grass' || t.mat === 'soil') {
      // not on top of anyone else
      let clear = true;
      for (const o of Object.values(store.settlements)) {
        const oa = anchorAt(o, Date.now());
        if (wdist(x, z, oa.x, oa.z) < HOME_RADIUS * 4) { clear = false; break; }
      }
      if (clear) return { x, z };
    }
  }
  return { x: wrap(n), z: wrap(Math.imul(n, 40503)) }; // a crowded planet still has room somewhere
}

export function ensureSettlement(presenceId, uid) {
  let s = store.settlements[presenceId];
  if (s) return s;
  const spot = foundingSpot(presenceId);
  s = {
    pid: presenceId, uid,
    course: { fromX: spot.x, fromZ: spot.z, toX: spot.x, toZ: spot.z, t0: Date.now() },
    founded: Date.now(), lastSeen: 0,
    bodies: [0, 1, 2].map((i) => ({ id: i, seed: Math.floor(Math.random() * 1e6), stage: 'seed' })),
  };
  store.settlements[presenceId] = s;
  persist();
  return s;
}

// Where a settlement's anchor stands NOW: pure function of its course.
export function anchorAt(s, t) {
  const c = s.course;
  const dx = wdelta(c.fromX, c.toX), dz = wdelta(c.fromZ, c.toZ);
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return { x: wrap(c.fromX), z: wrap(c.fromZ), moving: false };
  const walked = Math.min(dist, ((t - c.t0) / 1000) * WALK_SPEED);
  const f = walked / dist;
  return { x: wrap(c.fromX + dx * f), z: wrap(c.fromZ + dz * f), moving: walked < dist };
}

// Bodies wander deterministically around the anchor — every client computes
// the same positions from (seed, time). Migration pulls them into a loose file
// behind the anchor.
export function bodyPositions(s, t) {
  const a = anchorAt(s, t);
  return (s.bodies || []).map((b, i) => {
    if (a.moving) {
      const lag = 1.5 + i * 1.2 + hash2(b.seed, i, 7) * 1.5;
      return { id: b.id, stage: b.stage, x: wrap(a.x - lag * Math.sign(wdelta(s.course.fromX, s.course.toX) || 1)), z: wrap(a.z + (hash2(b.seed, i, 9) - 0.5) * 3), drowsing: false };
    }
    const ph = t / 1000 * (0.05 + hash2(b.seed, 3, 5) * 0.05) + b.seed;
    const r = 2 + hash2(b.seed, 1, 3) * (HOME_RADIUS - 4);
    return {
      id: b.id, stage: b.stage,
      x: wrap(a.x + Math.cos(ph) * r + Math.sin(ph * 2.7) * 1.5),
      z: wrap(a.z + Math.sin(ph * 0.8) * r + Math.cos(ph * 1.9) * 1.5),
      drowsing: !isAwake(s),
    };
  });
}

export const isAwake = (s) => Date.now() - (s.lastSeen || 0) < AWAKE_MS;
export function heartbeat(presenceId) {
  const s = store.settlements[presenceId];
  if (s) { s.lastSeen = Date.now(); persist(); }
}

// The society sets a new course (a beat's <<go: ...>>, or the owner's lead).
export function setCourse(presenceId, toX, toZ) {
  const s = store.settlements[presenceId];
  if (!s) return { error: 'no settlement' };
  const at = anchorAt(s, Date.now());
  s.course = { fromX: at.x, fromZ: at.z, toX: wrap(Math.round(toX)), toZ: wrap(Math.round(toZ)), t0: Date.now() };
  persist();
  return { ok: true, course: s.course };
}

export function settlement(presenceId) { return store.settlements[presenceId] || null; }

// The global map: every society's place in the world. Public by design —
// the planet is discoverable — with sleeping societies shown as sleeping.
export function globalMap(resolvePresence) {
  const t = Date.now();
  return Object.values(store.settlements).map((s) => {
    const p = resolvePresence(s.pid);
    const a = anchorAt(s, t);
    return {
      handle: p?.handle || 'unknown', scheme: p?.scheme || 'stardust',
      x: Math.round(a.x), z: Math.round(a.z), moving: a.moving,
      awake: isAwake(s), bodies: (s.bodies || []).length, founded: s.founded,
    };
  });
}

// Societies within reach of a point (for rendering neighbors + the percept).
export function near(x, z, radius, resolvePresence) {
  const t = Date.now();
  return Object.values(store.settlements)
    .filter((s) => wdist(x, z, anchorAt(s, t).x, anchorAt(s, t).z) <= radius)
    .map((s) => ({
      pid: s.pid,
      handle: resolvePresence(s.pid)?.handle || 'unknown',
      scheme: resolvePresence(s.pid)?.scheme || 'stardust',
      awake: isAwake(s),
      anchor: anchorAt(s, t),
      bodies: bodyPositions(s, t),
    }));
}
