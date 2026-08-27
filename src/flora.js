// WHAT GROWS — the planet's living cover, as a pure function.
//
// The ore layer is built on one real fact: abundance is not findability. This
// layer is built on two others.
//
// LIEBIG'S LAW OF THE MINIMUM. A plant is capped by whatever it has least of.
// Drench a desert and it is still too hot for spruce; warm the tundra and the
// soil is still thin. Growth is not the average of the conditions, it is the
// WORST of them — so every species here declares what it needs, and its vigour
// in a place is the minimum across those needs, never the mean. That single
// choice is what stops the map turning into one smooth gradient of green.
//
// SUCCESSION. Bare ground does not become forest. Moss and grass come first
// and make soil out of rock; shrubs follow; trees come last and take years.
// So a cleared place grows back THROUGH those stages, and the clock that runs
// it is the same real clock everything else here runs on.
//
// Climate is not decoration either: temperature falls off from the equator and
// again with altitude, exactly as it does on a real planet, so the biome bands
// are a consequence of where you are standing rather than a noise field
// pretending to be one.

import { WORLD_SIZE, SEA_LEVEL, MAX_H, WORLD_SEED, terrainAt, vnoise } from './world-core.js';

// --- climate -----------------------------------------------------------------
// Latitude runs from the equator at the middle of the map to poles at the wrap
// seam. Altitude cools the air the way it really does — roughly 6.5 degrees per
// kilometre, here compressed into the world's 24 blocks of relief.
export function climateAt(x, z) {
  const lat = Math.abs(z - WORLD_SIZE / 2) / (WORLD_SIZE / 2);   // 0 equator .. 1 pole
  const t = terrainAt(x, z);
  const alt = Math.max(0, t.h - SEA_LEVEL) / (MAX_H - SEA_LEVEL); // 0 shore .. 1 peak
  // 0 frozen .. 1 tropical, with weather that wanders a little
  const temp = Math.max(0, Math.min(1,
    Math.cos(lat * Math.PI / 2) * 1.05 - alt * 0.42 + (vnoise(x, z, 340, WORLD_SEED + 7) - 0.5) * 0.16));
  // rain: the field the terrain already uses to choose grass over soil, plus a
  // coastal bonus, because water upwind is where rain comes from
  const wet = Math.max(0, Math.min(1,
    vnoise(x, z, 128, WORLD_SEED + 3) * 0.82 + (1 - alt) * 0.2 + (vnoise(x, z, 44, WORLD_SEED + 11) - 0.5) * 0.18));
  // soil depth: flat wet ground builds it, bare rock and sand do not
  const soil = t.mat === 'stone' ? 0.12 : t.mat === 'sand' ? 0.2 : Math.min(1, 0.45 + wet * 0.5 - alt * 0.25);
  return { temp, wet, soil, alt, lat };
}

export function biomeOf(x, z) {
  const t = terrainAt(x, z);
  if (t.h < SEA_LEVEL) return 'water';
  const c = climateAt(x, z);
  if (c.temp < 0.18) return 'tundra';
  if (c.wet < 0.28) return c.temp > 0.62 ? 'desert' : 'steppe';
  if (c.temp > 0.72) return c.wet > 0.62 ? 'rainforest' : 'savanna';
  if (c.temp < 0.4) return 'taiga';
  return 'woodland';
}

// --- the species --------------------------------------------------------------
// needs are RANGES. A plant scores each need from 0 (impossible) to 1 (ideal),
// and its vigour is the WORST score, not the average — that is the law of the
// minimum, and it is the whole reason a rainforest species cannot creep into a
// dry valley just because the valley happens to be warm.
//
// `days` is how long it takes to come up through its stages from a seed, in
// real days. Grass is quick. A canopy tree is the slowest thing on this planet,
// slower than any solar panel, which is exactly the point of planting one.
export const SPECIES = {
  moss: {
    label: 'moss', color: '#4d6b47', wood: 0, days: 1.5, height: 0.12,
    temp: [0.0, 0.78], wet: [0.35, 1.0], soil: [0.0, 1.0],
    note: 'pioneer — grows on bare rock and makes the soil everything else needs; damp is what it wants, not cold',
  },
  grass: {
    label: 'wild grass', color: '#6f8a45', wood: 0, days: 2, height: 0.3,
    temp: [0.2, 0.9], wet: [0.22, 0.85], soil: [0.25, 1.0],
    note: 'the second wave, and the one that holds a slope together',
  },
  scrub: {
    label: 'scrub', color: '#6a6f3c', wood: 1, days: 5, height: 0.9,
    temp: [0.3, 0.95], wet: [0.15, 0.6], soil: [0.3, 1.0],
    note: 'dry-country shrub; a little hard wood, and it will grow where trees will not',
  },
  cactus: {
    label: 'cactus', color: '#5c7f5a', wood: 0, days: 6, height: 1.1,
    temp: [0.62, 1.0], wet: [0.0, 0.26], soil: [0.15, 1.0],
    note: 'stores its own water — the only thing that thrives on the dry limit',
  },
  pine: {
    label: 'pine', color: '#2f5340', wood: 4, days: 11, height: 3.4,
    temp: [0.14, 0.55], wet: [0.3, 0.85], soil: [0.35, 1.0],
    note: 'conifer — takes the cold that broadleaf cannot, and gives good timber',
  },
  broadleaf: {
    label: 'broadleaf', color: '#3f6b34', wood: 6, days: 16, height: 4.2,
    temp: [0.42, 0.86], wet: [0.45, 1.0], soil: [0.5, 1.0],
    note: 'the temperate canopy; the most wood on the planet and the longest wait for it',
  },
  palm: {
    label: 'palm', color: '#4c7a3a', wood: 3, days: 9, height: 3.8,
    temp: [0.72, 1.0], wet: [0.5, 1.0], soil: [0.3, 1.0],
    note: 'hot and wet, and it will not tolerate a cold night',
  },
};
export const SPECIES_KEYS = Object.keys(SPECIES);

// How well one need is met: 1 in the heart of the range, tapering to 0 outside.
function need(value, [lo, hi]) {
  if (value < lo || value > hi) {
    // just outside is survivable-but-poor; far outside is impossible
    const miss = value < lo ? lo - value : value - hi;
    return Math.max(0, 0.34 - miss * 3.4);
  }
  const mid = (lo + hi) / 2, half = Math.max(0.001, (hi - lo) / 2);
  return 1 - 0.45 * Math.abs(value - mid) / half;      // best mid-range, fine at the edges
}

// The law of the minimum, applied. Not an average — the worst of them.
export function vigourOf(key, x, z) {
  const sp = SPECIES[key];
  if (!sp) return 0;
  const c = climateAt(x, z);
  return Math.min(need(c.temp, sp.temp), need(c.wet, sp.wet), need(c.soil, sp.soil));
}

// What actually stands on a column, left to itself: the species that does best
// here, if it does well enough to be worth a stem, thinned by a scatter field
// so a forest is trees and gaps rather than a lawn of them.
export function naturalAt(x, z) {
  const t = terrainAt(x, z);
  if (t.h < SEA_LEVEL) return null;
  let best = null, bestV = 0.34;                        // below this, nothing takes hold
  for (const key of SPECIES_KEYS) {
    const v = vigourOf(key, x, z);
    if (v > bestV) { bestV = v; best = key; }
  }
  if (!best) return null;
  // canopy is sparse, ground cover is dense — big plants need room
  const sp = SPECIES[best];
  const room = sp.height > 2 ? 0.34 : sp.height > 0.5 ? 0.6 : 0.9;
  const scatter = hash2f(x, z, WORLD_SEED + 61);
  if (scatter > room * (0.45 + bestV * 0.75)) return null;
  return { key: best, vigour: bestV };
}

function hash2f(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- growing ------------------------------------------------------------------
// A plant's age decides its stage, and vigour decides how fast age accrues: the
// same sapling in a marginal place takes twice as long. Untouched natural cover
// is simply mature — it has been there since before anyone arrived.
export const STAGES = ['seed', 'sprout', 'sapling', 'mature'];
export function stageOfPlant(key, plantedAt, now, vigour = 1) {
  const sp = SPECIES[key];
  if (!sp) return 'mature';
  const days = (now - plantedAt) / 86400000 * Math.max(0.25, vigour);
  const full = sp.days;
  if (days >= full) return 'mature';
  if (days >= full * 0.55) return 'sapling';
  if (days >= full * 0.2) return 'sprout';
  return 'seed';
}

// What felling one yields. Only a grown plant is worth the axe, and a species
// with no wood in it never is.
export function woodFrom(key, stage) {
  const sp = SPECIES[key];
  if (!sp || !sp.wood) return 0;
  if (stage === 'mature') return sp.wood;
  if (stage === 'sapling') return Math.max(1, Math.floor(sp.wood / 3));
  return 0;
}

// Plain words for a percept: what this ground will and will not grow.
export function growsHere(x, z) {
  const c = climateAt(x, z);
  const ranked = SPECIES_KEYS.map((k) => ({ k, v: vigourOf(k, x, z) })).sort((a, b) => b.v - a.v);
  const good = ranked.filter((r) => r.v > 0.34);
  return {
    biome: biomeOf(x, z),
    temp: c.temp, wet: c.wet, soil: c.soil,
    best: good.slice(0, 3).map((r) => SPECIES[r.k].label),
    worst: ranked.filter((r) => r.v <= 0.05).map((r) => SPECIES[r.k].label),
  };
}
