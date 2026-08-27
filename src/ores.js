// WHAT THE GROUND IS MADE OF — the planet's geology, as a pure function.
//
// Shared by the server and every client, like the rest of the planet math: the
// ore in a block is computed from its coordinates and the world seed, never
// stored. Only what a sprite DIGS OUT gets written down.
//
// The design comes from one real fact about mining: abundance is not
// findability. Aluminium is 8.1% of the crust and you still cannot smelt
// granite — you need bauxite, which only forms where tropical weathering made
// it. Copper averages ~60 ppm in ordinary rock while copper ORE runs 0.5–2%,
// a 100–300x concentration. So every material here carries TWO numbers:
//
//   ppm   — how much of it the crust holds at all (real crustal abundance)
//   conc  — how hard geology worked to gather it into one place
//
// ppm sets how thick a deposit is once you are standing in one. conc sets how
// far you have to walk to stand in one. Prospecting falls out of those two for
// free, and the ordering is the real ordering: silicon everywhere, boron in
// two places on the whole planet, silver rarer than almost anything you will
// ever hold.
//
// Raw ppm spans 280,000,000:1 between silica and silver, which is unplayable
// as a number, so rarity is the log scale the research suggests:
//   weight = log10(ppm) + 3.5  →  a clean 0–9 that preserves the true order.

import { WORLD_SEED, terrainAt, vnoise } from './world-core.js';

// --- the table ---------------------------------------------------------------
// style says HOW a deposit is shaped, which is the part that makes prospecting
// feel like geology instead of dice:
//   common  — everywhere, thin
//   bed     — flat marine/evaporite layers: a whole horizon at one depth
//   seam    — thin bands, rich where present
//   vein    — 3D worms through rock, the classic ore body
//   cap     — surface only, and only where the climate made it
//   basin   — one absurdly localized region holding almost all of it
export const MATERIALS = {
  silica: {
    label: 'silica sand', ppm: 120000, conc: 1.2, style: 'common', color: '#d9cfa8',
    note: 'quartz is 12% of the crust; glass-grade sand is under 1% of what is mined',
  },
  limestone: {
    label: 'limestone', ppm: 7000, conc: 6, style: 'bed', color: '#cfd2cc',
    note: 'marine sediment, laid down in horizons',
  },
  bauxite: {
    label: 'bauxite', ppm: 81000, conc: 40, style: 'cap', color: '#b4693a',
    note: 'aluminium is 8.1% of the crust and none of it is smeltable — bauxite forms only under tropical weathering',
  },
  coal: {
    label: 'coal', ppm: 200, conc: 90, style: 'seam', color: '#1d1d20',
    note: 'seams; the carbon that reduces silica to silicon, and the feedstock for the polymer',
  },
  halite: {
    label: 'rock salt', ppm: 145, conc: 120, style: 'bed', color: '#e8e4de',
    note: 'evaporite beds — rare to meet, enormous once met',
  },
  copper: {
    label: 'copper ore', ppm: 60, conc: 250, style: 'vein', color: '#8f5b3a',
    note: 'ore runs 0.5-2% against a 60 ppm background: a 100-300x concentration',
  },
  phosphorus: {
    label: 'phosphate rock', ppm: 1000, conc: 30, style: 'bed', color: '#9a9d6b',
    note: 'the other dopant',
  },
  trona: {
    label: 'trona', ppm: 20, conc: 400, style: 'basin', color: '#ded6c4',
    note: 'soda ash; one basin dominates the planet',
  },
  boron: {
    label: 'borates', ppm: 10, conc: 900, style: 'basin', color: '#cbd8e4',
    note: 'absurdly localized — two regions hold ~90% of Earth\'s supply',
  },
  silver: {
    label: 'silver', ppm: 0.075, conc: 600, style: 'vein', color: '#dfe3ea',
    note: 'only ~19x more common than gold, and it cannot be manufactured — mined or recycled, full stop',
  },
};

export const ORE_KEYS = Object.keys(MATERIALS);

// Not everything a society carries comes out of the ground. Wood is felled from
// something that was alive and will be again — the only material here that
// grows back, which makes it the only one that can be over-harvested and the
// only one worth planting.
export const GOODS = {
  wood: { label: 'wood', color: '#8a6134', walk: 'wherever trees stand',
    note: 'felled from a grown tree, and it grows back — the only renewable thing on the planet' },
};
export const ALL_MATERIALS = { ...MATERIALS, ...GOODS };

// The 0–9 rarity the research asks for. Used for display and for how thick a
// deposit is, never for whether a region exists (that is conc's job).
export const rarityOf = (key) => {
  const m = MATERIALS[key];
  return m ? Math.max(0, Math.min(9, Math.log10(m.ppm) + 3.5)) : 0;
};

// How far, in blocks, a society should expect to walk to meet a deposit. Purely
// informational — it is what the percept tells a presence so its prospecting is
// an informed choice rather than a guess.
export const walkHint = (key) => {
  const c = MATERIALS[key]?.conc || 1;
  if (c < 5) return 'underfoot almost anywhere';
  if (c < 40) return 'a short walk';
  if (c < 150) return 'a long walk';
  if (c < 500) return 'a journey';
  return 'a pilgrimage';
};

// --- the field ---------------------------------------------------------------

function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 1103515245 + z * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Deposit regions: the coarse field that says "geology gathered this here".
// The rarer the concentration factor, the higher the bar and the smaller the
// patch — boron gets a handful of tiny basins on a 4096-block planet, silica
// gets most of it.
function inDeposit(key, x, z) {
  const m = MATERIALS[key];
  const seed = WORLD_SEED + 100 + ORE_KEYS.indexOf(key) * 17;
  const scale = m.style === 'basin' ? 512 : m.style === 'vein' ? 96 : m.style === 'cap' ? 192 : 160;
  const n = vnoise(x, z, scale, seed);
  // conc 1 → threshold ~0.20 (nearly everywhere); conc 900 → ~0.93 (almost nowhere)
  const threshold = Math.min(0.95, 0.20 + 0.13 * Math.log10(Math.max(1, m.conc)) * 1.9);
  if (n <= threshold) return 0;
  // richness inside the region: how far past the bar this spot is, 0..1
  return Math.min(1, (n - threshold) / Math.max(0.02, 1 - threshold));
}

// Does the block at (x, y, z) hold ore, and which? y is an absolute height;
// anything at or above the surface is air and holds nothing.
//
// Ordered rarest-first so a silver speck inside a copper vein reads as silver.
export function oreAt(x, y, z) {
  const t = terrainAt(x, z);
  if (y > t.h || y < 0) return null;          // air, or below the world
  const depth = t.h - y;                       // 0 = the surface block itself

  for (const key of ORE_ORDER) {
    const m = MATERIALS[key];
    // cheap per-block test first: most blocks fail here, and it costs one hash
    const density = DENSITY[key];
    if (hash3(x, y, z, WORLD_SEED + 500 + ORE_KEYS.indexOf(key)) >= density) continue;

    // then the shape rules, which are what make each material feel like itself
    if (m.style === 'cap') {
      if (depth > 2) continue;                                   // surface only
      const warm = vnoise(x, z, 128, WORLD_SEED + 3);            // the moisture field terrain uses
      if (warm < 0.55) continue;                                 // tropical weathering, or no bauxite
    } else if (m.style === 'bed' || m.style === 'seam') {
      // a horizon: flat, at a depth that drifts slowly across the planet
      const band = 3 + Math.floor(vnoise(x, z, 220, WORLD_SEED + 40 + ORE_KEYS.indexOf(key)) * 12);
      const thickness = m.style === 'seam' ? 1 : 2;
      if (Math.abs(depth - band) > thickness) continue;
    } else if (m.style === 'vein') {
      if (depth < 2) continue;                                   // veins do not outcrop here
    } else if (m.style === 'basin') {
      if (depth < 1 || depth > 10) continue;
    }

    const rich = inDeposit(key, x, z);
    if (rich <= 0) continue;
    // inside a deposit, thickness follows abundance: a rich silica pocket is
    // solid, a rich silver vein is still mostly rock
    if (hash3(x, y, z, WORLD_SEED + 900) > rich * (0.35 + 0.075 * rarityOf(key))) continue;
    return key;
  }
  return null;
}

// Rarest first: a silver speck sitting in a copper vein should read as silver.
const ORE_ORDER = [...ORE_KEYS].sort((a, b) => MATERIALS[a].ppm - MATERIALS[b].ppm);

// Per-block base chance inside a deposit, from the log rarity. Tuned so a
// 3x3x3 scan standing on a silica pocket finds some, and a scan standing on a
// silver vein usually does not.
const DENSITY = Object.fromEntries(ORE_KEYS.map((k) => {
  const r = rarityOf(k);                       // 2.38 (silver) .. 8.58 (silica)
  return [k, Math.min(0.9, 0.010 + 0.055 * Math.max(0, r - 2))];
}));

// --- what a solar panel is actually made of ----------------------------------
// By weight a crystalline silicon panel is roughly 76% glass, 10% polymer, 8%
// aluminium, 5% silicon, 1% copper and under 0.1% silver. Glass is sand with
// soda ash and lime; silicon is sand reduced with carbon; the polymer comes
// from the same carbon. And a wafer without its trace boron and phosphorus is
// an inert rock, not a cell — vanishingly small amounts, and zero is a hard
// fail. That last part is the good bottleneck, so it is kept exactly.
//
// 47 blocks: one sprite's full load, minus a little room to breathe.
export const PANEL_BILL = {
  silica: 20,      // the glass, and the silicon
  limestone: 6,    // lime for the melt
  bauxite: 6,      // the frame
  coal: 6,         // reduces sand to silicon, and becomes the polymer
  trona: 4,        // soda ash — or halite, see SUBSTITUTES
  copper: 2,       // the wiring
  silver: 1,       // the contact paste; cannot be manufactured, only mined or recycled
  boron: 1,        // dopant — tiny and mandatory
  phosphorus: 1,   // the other dopant
};

// Soda ash is only about 30% natural in reality; the rest is made from salt and
// limestone. Until the refining chain exists, rock salt stands in for trona.
export const SUBSTITUTES = { trona: ['halite'] };

// Storage units come in stone, metal or wood. Two of those can be built from
// what the ground already holds; wood waits for trees, because there are no
// trees yet and a bill nothing can satisfy is a mission that walks four
// thousand blocks and comes home empty.
export const STORAGE_BILLS = {
  'stone storage': { limestone: 12 },
  'metal storage': { bauxite: 12 },
  'wood storage': { wood: 12 },
};
// Forging a new sprite takes no materials at all — its cost is the solar panel
// that has to be standing empty first, which is 47 blocks and a day of work.
// What it takes is time, and a hand busy in the steel building for half a day.
export const SPRITE_BILL = {};
export const BILL_OF = { panel: PANEL_BILL, ...STORAGE_BILLS, sprite: SPRITE_BILL };

// What each bill actually produces, and how long the making takes. A panel is
// a day's work; a storage unit is an hour's.
export const BUILDS = {
  panel: { makes: 'panel', at: 'solarforge', ms: 24 * 3600e3, label: 'a solar panel' },
  'stone storage': { makes: 'storage', at: 'forge', ms: 1 * 3600e3, label: 'a stone storage unit', of: 'stone' },
  'metal storage': { makes: 'storage', at: 'forge', ms: 1 * 3600e3, label: 'a metal storage unit', of: 'metal' },
  'wood storage': { makes: 'storage', at: 'forge', ms: 1 * 3600e3, label: 'a wooden storage unit', of: 'wood' },
  sprite: { makes: 'sprite', at: 'aiforge', ms: 12 * 3600e3, label: 'a new sprite', needsPanel: true },
};

// A storage unit holds a hundred slots, fifty of a thing to a slot.
export const STACK = 50;
export const SLOTS = 100;
export const STORE_MAX = STACK * SLOTS;   // 5,000 blocks

export const billTotal = (bill) => Object.values(bill).reduce((a, b) => a + b, 0);
