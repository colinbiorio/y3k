// ============================================================================
// FREQUENCIES — THE SAND. A bed of grains as a height field, moved by the
// sound's wind, heaped by its standing waves, held by its angle of repose,
// packed by its pressure, wetted by the binder, and set. Pure functions on
// typed arrays, no DOM; SI units throughout.
//
// What is physics here and what is a model is said at each rule:
//  - whether a grain moves: the drag balance / Bagnold threshold (acoustics.mjs)
//  - how much moves: Bagnold's transport law at the surface velocity (T-I), with
//    one model mapping, u* = u_rms / 8 (T-II, named in the dossier)
//  - where it goes: against the gradient of u², toward the quiet (Kundt's tube:
//    the dust gathers where the air is still, half a wavelength apart) (T-I)
//  - what stays standing: the angle of repose, 34° dry; damp sand holds a vertical
//    face while it is low (capillary cohesion) (T-I, the 0.4 m limit T-II)
//  - packing: Γ > 1 under the surface pressure compacts the bed toward 0.64 (T-I),
//    at a rate the room sets (T-II)
//  - setting: Davidovits' binder gains strength on a 36 h scale (pyramid.mjs, T-II)
// ============================================================================
import { AIR, G, GRAIN, PACKING, fieldAt, thresholdVelocity, bagnoldFlux, U_STAR_RATIO, gammaOf } from './acoustics.mjs';
import { strengthAt, SET } from './pyramid.mjs';

export const WET_HOLDS_M = 0.4;    // a damp face stands vertical up to this drop before it slumps (T-II, sandcastle order)
export const DRY_SLOPE = Math.tan((GRAIN.reposeDeg * Math.PI) / 180);
export const COMPACT_RATE = 0.05;  // per second per unit of (Γ − 1): tens of seconds at 135 Hz, thousands of taps (T-II)
export const WET_THRESHOLD_GAIN = 3;   // damp grains need this many times the dry threshold to move (T-II)

export function createBed({ width = 12, depth = 8, cell = 0.05, grain = 2.5e-4, rhoS = GRAIN.calcite, sand = 0.3 } = {}) {
  const nx = Math.round(width / cell), ny = Math.round(depth / cell), n = nx * ny;
  const bed = {
    nx, ny, cell, grain, rhoS, width: nx * cell, depth: ny * cell, time: 0,
    h: new Float32Array(n).fill(sand),      // sand height above the floor, m
    wet: new Float32Array(n),               // binder paste fraction, 0..1
    setH: new Float32Array(n),              // hours since the pour, where wet
    phi: new Float32Array(n).fill(PACKING.loose),
    p: new Float32Array(n), u: new Float32Array(n), ux: new Float32Array(n), uy: new Float32Array(n),
    moved: 0,                               // kg hopped cell to cell so far (every hop counts; not a throughput)
    h0: null,                               // the bed as it was laid, for what the sound has displaced
    uT: thresholdVelocity(grain, rhoS),     // the dry threshold, m/s (surface, rms)
  };
  bed.h0 = Float32Array.from(bed.h);
  return bed;
}
export const idx = (bed, i, j) => j * bed.nx + i;

// The sound field on the bed's surface, for these horns at this frequency. Horns
// are in metres from the bed's corner; z is the mouth's height above the floor.
export function computeField(bed, horns, f) {
  const { nx, ny, cell } = bed;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (!horns.length) { bed.p[k] = bed.u[k] = bed.ux[k] = bed.uy[k] = 0; continue; }
    const r = fieldAt(horns, f, (i + 0.5) * cell, (j + 0.5) * cell);
    bed.p[k] = r.p; bed.u[k] = r.u; bed.ux[k] = r.ux; bed.uy[k] = r.uy;
  }
}

// Is this cell's sand free to move? Set paste is stone; damp paste needs more wind.
export function mobility(bed, k) {
  if (bed.wet[k] > 0 && strengthAt(bed.setH[k]) >= SET.walkableMPa) return 0;
  const uT = bed.uT * (1 + WET_THRESHOLD_GAIN * bed.wet[k]);
  return bed.u[k] > uT ? 1 : 0;
}

// One step of dt seconds. Returns what moved.
export function step(bed, dt) {
  const { nx, ny, cell, rhoS } = bed;
  const h = bed.h, u = bed.u;
  // 1. TRANSPORT: Bagnold's rate at the surface velocity, carried against ∇(u²)
  const dh = new Float32Array(nx * ny);
  let moved = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (!mobility(bed, k) || h[k] <= 0) continue;
    const q = bagnoldFlux(u[k] / U_STAR_RATIO, bed.grain);       // kg per metre per second leaving this cell
    // the direction: downhill in u² (toward the quiet), by central differences
    const uxp = u[Math.min(i + 1, nx - 1) + j * nx], uxm = u[Math.max(i - 1, 0) + j * nx];
    const uyp = u[i + Math.min(j + 1, ny - 1) * nx], uym = u[i + Math.max(j - 1, 0) * nx];
    let gx = -(uxp * uxp - uxm * uxm), gy = -(uyp * uyp - uym * uym);
    const gl = Math.hypot(gx, gy);
    if (gl < 1e-9) continue;
    gx /= gl; gy /= gl;
    // mass out of this cell this step, capped at what it holds; split to the two downwind neighbours
    const massHere = h[k] * cell * cell * rhoS * bed.phi[k];
    const out = Math.min(q * cell * dt, massHere * 0.5);
    const ti = i + (gx > 0 ? 1 : -1), tj = j + (gy > 0 ? 1 : -1);
    const fx = Math.abs(gx), fy = Math.abs(gy);
    const take = (mass, ii, jj) => {
      if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) return;   // the bed's edge is a wall: nothing leaves it
      const kk = jj * nx + ii;
      if (bed.wet[kk] > 0 && strengthAt(bed.setH[kk]) >= SET.walkableMPa) return;   // stone does not take sand on its top? it does, as a surface; but the model keeps set blocks' tops as given
      dh[k] -= mass / (cell * cell * rhoS * bed.phi[k]);
      dh[kk] += mass / (cell * cell * rhoS * bed.phi[kk]);   // laid at the target's own packing: mass is what is conserved
      moved += mass;
    };
    take(out * fx, ti, j); take(out * fy, i, tj);
  }
  for (let k = 0; k < nx * ny; k++) h[k] = Math.max(0, h[k] + dh[k]);
  bed.moved += moved;
  // 2. AVALANCHE: a slope steeper than the sand can hold gives way (a few sweeps)
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (bed.wet[k] > 0 && strengthAt(bed.setH[k]) >= SET.walkableMPa) continue;   // set stone keeps its face
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) continue;
        const kk = jj * nx + ii;
        const drop = h[k] - h[kk];
        // a damp face holds vertical while its drop is small (capillary cohesion); taller, it slumps as dry sand would
        const limit = bed.wet[k] > 0 ? Math.max(WET_HOLDS_M, DRY_SLOPE * cell) : DRY_SLOPE * cell;
        if (drop > limit) { const m = (drop - limit) * 0.25; h[k] -= m; h[kk] += (m * bed.phi[k]) / bed.phi[kk]; }   // the same mass, at the target's packing
      }
    }
  }
  // 3. COMPACTION: under Γ > 1 the packing creeps toward random close packing, and the bed settles
  for (let k = 0; k < nx * ny; k++) {
    const gamma = gammaOf(bed.p[k] / 2, rhoS, bed.phi[k]);   // p is the doubled surface pressure; gammaOf takes the incident
    if (gamma > 1 && bed.phi[k] < PACKING.close) {
      const before = bed.phi[k];
      bed.phi[k] = PACKING.close - (PACKING.close - before) * Math.exp(-COMPACT_RATE * (gamma - 1) * dt);
      h[k] *= before / bed.phi[k];
    }
  }
  // 4. SETTING: the poured cells harden with time
  for (let k = 0; k < nx * ny; k++) if (bed.wet[k] > 0) bed.setH[k] += dt / 3600;
  bed.time += dt;
  return { moved };
}

// The binder paste is placed in a disc: the grains there are wetted (the glue is mixed
// through them, as in Davidovits' basin), and the set clock starts.
export function pour(bed, cx, cy, radius) {
  const { nx, ny, cell } = bed;
  let cells = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * cell - cx, y = (j + 0.5) * cell - cy;
    if (x * x + y * y <= radius * radius) { const k = j * nx + i; bed.wet[k] = 1; bed.setH[k] = 0; cells++; }
  }
  return cells;
}
// Loose aggregate tipped onto the bed: a disc raised by this much.
export function addSand(bed, cx, cy, radius, height) {
  const { nx, ny, cell } = bed;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * cell - cx, y = (j + 0.5) * cell - cy;
    if (x * x + y * y <= radius * radius) { bed.h[j * nx + i] += height; if (bed.h0) bed.h0[j * nx + i] += height; }   // tipped sand is part of the bed as laid
  }
}

// Readings the room shows.
export function readings(bed) {
  const n = bed.nx * bed.ny;
  let mobile = 0, maxU = 0, maxP = 0, hMin = Infinity, hMax = -Infinity, set = 0, wet = 0, phiSum = 0;
  for (let k = 0; k < n; k++) {
    if (mobility(bed, k)) mobile++;
    if (bed.u[k] > maxU) maxU = bed.u[k];
    if (bed.p[k] > maxP) maxP = bed.p[k];
    if (bed.h[k] < hMin) hMin = bed.h[k];
    if (bed.h[k] > hMax) hMax = bed.h[k];
    if (bed.wet[k] > 0) { wet++; if (strengthAt(bed.setH[k]) >= SET.walkableMPa) set++; }
    phiSum += bed.phi[k];
  }
  // what the sound has displaced: half the sum of |Δh| against the bed as laid, as mass (each grain moved leaves one place and arrives in another)
  let disp = 0;
  if (bed.h0) for (let k = 0; k < n; k++) disp += Math.abs(bed.h[k] - bed.h0[k]);
  const displaced = (disp / 2) * bed.cell * bed.cell * bed.rhoS * PACKING.loose;
  return { mobileShare: mobile / n, maxU, maxP, hMin, hMax, wetCells: wet, setCells: set, meanPhi: phiSum / n, moved: bed.moved, displaced, time: bed.time };
}

// Where the ridges are: the local maxima of height along a line of cells (for the
// tests, and for the room's ruler): their positions in metres.
export function ridgesAlong(bed, j, minProminence = 0.01) {
  const out = [];
  const row = (i) => bed.h[j * bed.nx + i];
  for (let i = 2; i < bed.nx - 2; i++) {
    const c = row(i);
    if (c > row(i - 1) && c >= row(i + 1) && c - Math.min(row(i - 2), row(i + 2)) > minProminence) out.push((i + 0.5) * bed.cell);
  }
  return out;
}

// --- presets: the arrangements the room offers ---------------------------------
// Two opposed horns facing each other across the bed: a standing wave, ridges λ/2 apart.
export function presetPair(bed, { f, mouthDb = 160, mouthDiameter }) {
  const y = bed.depth / 2, z = 0.5;
  return [
    { x: 0.2, y, z, aimX: 1, aimY: 0, aimZ: -0.25, mouthDb, mouthDiameter, phase: 0 },
    { x: bed.width - 0.2, y, z, aimX: -1, aimY: 0, aimZ: -0.25, mouthDb, mouthDiameter, phase: 0 },
  ];
}
// Two pairs, crossed: the square lattice at the block module.
export function presetLattice(bed, opts) {
  const [a, b] = presetPair(bed, opts);
  const x = bed.width / 2, z = 0.5;
  return [a, b,
    { x, y: 0.2, z, aimX: 0, aimY: 1, aimZ: -0.25, mouthDb: opts.mouthDb ?? 160, mouthDiameter: opts.mouthDiameter, phase: 0 },
    { x, y: bed.depth - 0.2, z, aimX: 0, aimY: -1, aimZ: -0.25, mouthDb: opts.mouthDb ?? 160, mouthDiameter: opts.mouthDiameter, phase: 0 },
  ];
}
