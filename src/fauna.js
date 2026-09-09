// WHAT MOVES — the planet's animals, as a pure function.
//
// The ore layer is built on the fact that abundance is not findability. The
// flora layer is built on Liebig's law of the minimum. This layer is built on
// a third one, and it is the reason there is no herd table anywhere on disk:
//
// AN ANIMAL IS NOT A THING YOU STORE. IT IS A CONSEQUENCE OF A PLACE AND AN
// HOUR. Where the climate suits it and the ground feeds it, a herd is there;
// the clock says where in its range it has wandered to and whether it is awake.
// Every client computes the same animals in the same places from the same seed,
// and the percept names the same ones the watcher is looking at — exactly the
// trick the terrain, the cover and the night sky already pull. Nothing crosses
// the wire. Nothing ticks.
//
// HOME RANGE. Real animals do not roam a planet, they hold a patch of it. So
// the world is tiled into home ranges, and a range either supports a species or
// it does not. Inside its range a herd drifts on a slow deterministic orbit —
// far enough to be somewhere different each time you look, never far enough to
// leave the ground that feeds it.
//
// THE DAY IS REAL FOR THEM TOO. Half of these are diurnal and half are not, so
// dusk genuinely changes who is out: the cranes settle and the moths come up.
// Resting is resting — an animal out of its hours is asleep in the grass, which
// is the same thing neglect does to a sprite here. Nothing on this planet
// suffers on camera.
//
// AND THEY ARE NOT A RESOURCE. There is no verb that takes one, no material
// that comes off one, no hunger they answer. THE LINES say no control whose
// purpose is to harm, and an animal you may only watch is the honest reading of
// that — the planet has neighbours on it, not livestock. If a future hand ever
// reaches for "harvest", this comment is the argument against it.

import {
  WORLD_SIZE, SEA_LEVEL, WORLD_SEED,
  wrap, wdelta, hash2, terrainAt, daylightAt, directionOf,
} from './world-core.js';
import { climateAt } from './flora.js';

// A home range is big enough that a herd belongs to a landscape rather than a
// lawn, and small enough that walking an hour finds different animals. It MUST
// divide WORLD_SIZE: the lattice wraps with the planet, and a partial cell at
// the seam would put a herd in two places at once.
export const RANGE = 64;

// --- the species ---------------------------------------------------------------
// `needs` are ranges scored the way flora scores them, and suitability is the
// WORST of them, never the mean — the same law, because the reason a species
// is absent is always the one thing the place cannot give it.
//
// `ground`: where its feet (or fins, or wings) belong.
//     land  — anywhere above the tideline
//     water — the sea itself
//     coast — the meeting of the two
// `hours`: 'day' | 'night'. `band`: how many move together.
// `gait`: blocks per second — a hare is not a bison.
// `common`: how readily it takes a suitable range. This is the abundance dial,
//   and it is separate from suitability on purpose: a place can suit a crane
//   perfectly and still not have cranes in it.
// `id` seeds its own roll per range, so two good species do not resolve to the
//   same winner right across a latitude band.
// `wary`: how close it will let a society come before it moves off. This is the
//   only way the world answers back to you — and it answers by keeping its
//   distance, which is the only answer THE LINES leave room for.
export const FAUNA = {
  elk: {
    id: 1, label: 'elk', plural: 'elk', color: '#6b5236', ground: 'land', hours: 'day',
    band: [4, 9], size: 1.0, gait: 1.1, flight: 0, common: 0.95, rest: 'bedded down', wary: 26,
    temp: [0.18, 0.6], wet: [0.35, 1.0],
    note: 'browses the cold woods in a loose herd; the largest thing that walks here',
  },
  bison: {
    id: 2, label: 'bison', plural: 'bison', color: '#4f4136', ground: 'land', hours: 'day',
    band: [7, 16], size: 1.15, gait: 0.9, flight: 0, common: 0.8, rest: 'bedded down', wary: 28,
    temp: [0.35, 0.78], wet: [0.2, 0.62],
    note: 'the open grassland in numbers — a moving weather of animals',
  },
  hare: {
    id: 3, label: 'hare', plural: 'hares', color: '#9a8e78', ground: 'land', hours: 'night',
    band: [1, 3], size: 0.34, gait: 2.2, flight: 0, common: 0.5, rest: 'crouched still', wary: 18,
    temp: [0.1, 0.72], wet: [0.18, 0.8],
    note: 'small, quick, and mostly alone; out when the light has gone',
  },
  fox: {
    id: 4, label: 'fox', plural: 'foxes', color: '#a4592a', ground: 'land', hours: 'night',
    band: [1, 2], size: 0.42, gait: 1.7, flight: 0, common: 0.42, rest: 'curled asleep', wary: 16,
    temp: [0.16, 0.72], wet: [0.28, 0.95],
    note: 'hunts its own supper at night and answers to nobody',
  },
  lizard: {
    id: 5, label: 'lizard', plural: 'lizards', color: '#8a7b45', ground: 'land', hours: 'day',
    band: [1, 4], size: 0.28, gait: 1.4, flight: 0, common: 0.95, rest: 'gone under stone', wary: 10,
    temp: [0.66, 1.0], wet: [0.0, 0.34],
    note: 'takes the heat the rest cannot; the desert is its whole world',
  },
  crane: {
    id: 6, label: 'crane', plural: 'cranes', color: '#d8d3c6', ground: 'coast', hours: 'day',
    band: [3, 8], size: 0.7, gait: 5.5, flight: 7, common: 1.0, rest: 'roosting', wary: 20,
    temp: [0.26, 0.9], wet: [0.4, 1.0],
    note: 'wading birds that fly the shoreline in a ragged line',
  },
  gull: {
    id: 7, label: 'gull', plural: 'gulls', color: '#e6e6e0', ground: 'coast', hours: 'day',
    band: [5, 14], size: 0.4, gait: 7.5, flight: 11, common: 1.0, rest: 'roosting', wary: 12,
    temp: [0.15, 1.0], wet: [0.22, 1.0],
    note: 'turns over the shallows all day and never quite lands',
  },
  // The hot wet country needs animals of its own. Without these, every inland
  // rainforest resolved to the one species that could take the heat — and since
  // that one flies at night, those regions had no daylight life at all.
  parrot: {
    id: 10, label: 'parrot', plural: 'parrots', color: '#3f9e4d', ground: 'land', hours: 'day',
    band: [4, 12], size: 0.34, gait: 6.5, flight: 8, common: 0.95, rest: 'roosting', wary: 14,
    temp: [0.6, 1.0], wet: [0.5, 1.0],
    note: 'goes over the canopy in a loud green scatter',
  },
  tapir: {
    id: 11, label: 'tapir', plural: 'tapirs', color: '#514842', ground: 'land', hours: 'day',
    band: [2, 5], size: 0.85, gait: 1.0, flight: 0, common: 0.8, rest: 'bedded down', wary: 20,
    temp: [0.62, 1.0], wet: [0.55, 1.0],
    note: 'walks the wet forest floor alone or with its young',
  },
  antelope: {
    id: 12, label: 'antelope', plural: 'antelope', color: '#b0894f', ground: 'land', hours: 'day',
    band: [5, 14], size: 0.8, gait: 2.4, flight: 0, common: 0.9, rest: 'bedded down', wary: 30,
    temp: [0.55, 0.95], wet: [0.15, 0.55],
    note: 'the dry grass in numbers, and quick off the mark',
  },
  moth: {
    id: 8, label: 'moth', plural: 'moths', color: '#cbb98d', ground: 'land', hours: 'night',
    band: [6, 18], size: 0.16, gait: 1.9, flight: 2.2, common: 0.6, rest: 'settled and still', wary: 5,
    temp: [0.42, 1.0], wet: [0.45, 1.0],
    note: 'the warm wet dark comes up in clouds of them',
  },
  shoal: {
    id: 9, label: 'shoal of fish', plural: 'fish', color: '#5f9dbd', ground: 'water', hours: 'day',
    band: [8, 20], size: 0.22, gait: 2.6, flight: 0, common: 0.85, rest: 'hanging still', wary: 0,
    temp: [0.15, 1.0], wet: [0.0, 1.0],
    note: 'fish, turning together just under the surface',
  },
};
export const FAUNA_KEYS = Object.keys(FAUNA);

// How well one need is met — the flora curve, kept identical on purpose so an
// animal and a plant read the same place the same way.
function need(value, [lo, hi]) {
  if (value < lo || value > hi) {
    const miss = value < lo ? lo - value : value - hi;
    return Math.max(0, 0.34 - miss * 3.4);
  }
  const mid = (lo + hi) / 2, half = Math.max(0.001, (hi - lo) / 2);
  return 1 - 0.45 * Math.abs(value - mid) / half;
}

// Does this ground answer what its feet need? Coast means genuinely both —
// a shoreline range has to hold water AND land, which is why gulls are a
// coastline and not a sea.
function groundSuits(kind, x, z) {
  const here = terrainAt(x, z);
  const wet = here.h < SEA_LEVEL;
  if (kind === 'water') return wet ? 1 : 0;
  if (kind === 'land') return wet ? 0 : 1;
  // coast: look for the other element within a short walk
  let land = 0, sea = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = terrainAt(Math.round(x + Math.cos(a) * 10), Math.round(z + Math.sin(a) * 10));
    if (t.h < SEA_LEVEL) sea++; else land++;
  }
  return land && sea ? 1 : 0;
}

// The law of the minimum, applied to something with legs.
export function suitabilityOf(key, x, z) {
  const sp = FAUNA[key];
  if (!sp) return 0;
  if (!groundSuits(sp.ground, x, z)) return 0;
  const c = climateAt(x, z);
  return Math.min(need(c.temp, sp.temp), need(c.wet, sp.wet));
}

// --- who lives in a range -------------------------------------------------------
// A range is a cell of the planet. Ask it and it always answers the same, and it
// may answer with more than one animal: real country is not a monoculture, and
// a range that resolved to exactly one winner made whole regions where every
// herd for a day's walk was the same species — and, worse, made places whose
// entire daylight was empty because the one winner happened to be nocturnal.
// So a rich range keeps a SECOND, different tenant, rolled on its own.
//
// The per-species roll is wide on purpose. Suitability is smooth across a
// climate band, so a narrow roll lets the same species win every neighbouring
// cell; a wide one lets the second-best animal take ground now and then, which
// is what makes walking somewhere show you something else.
function tenantOf(cx, cz, slot, exclude, preferHours) {
  const gx = wrap(cx * RANGE + RANGE / 2), gz = wrap(cz * RANGE + RANGE / 2);
  let best = null, bestS = 0, bestSuit = 0;
  for (const key of FAUNA_KEYS) {
    if (key === exclude) continue;
    const suit = suitabilityOf(key, gx, gz);
    if (suit <= 0.36) continue;                     // below this, the range cannot feed it
    const roll = hash2(cx * 3 + slot, cz * 5 + slot, WORLD_SEED + 100 + FAUNA[key].id * 7919);
    // the second tenant leans to the OTHER half of the day, so a range that has
    // something grazing at noon also has something abroad at midnight. Without
    // this the warm country filled with day animals and its nights went empty.
    const shift = preferHours && FAUNA[key].hours === preferHours ? 2.6 : 1;
    const score = suit * FAUNA[key].common * shift * (0.35 + roll * 1.3);
    if (score > bestS) { bestS = score; bestSuit = suit; best = key; }
  }
  if (!best) return null;
  // not every suitable range is occupied — empty country is part of a planet,
  // and the second tenant is rarer than the first
  const gate = slot === 0 ? 0.3 + bestS * 0.55 : 0.06 + bestS * 0.34;
  if (hash2(cx * 2 + slot, cz * 2 + slot, WORLD_SEED + 313) > gate) return null;
  const sp = FAUNA[best];
  const r = hash2(cx + slot * 31, cz + slot * 17, WORLD_SEED + 977);
  const [lo, hi] = sp.band;
  return {
    key: best,
    count: lo + Math.floor(r * (hi - lo + 1)),
    strength: bestSuit,
    seed: hash2(cx + slot * 71, cz + slot * 53, WORLD_SEED + 41),
    slot, cx, cz, gx, gz,
  };
}

// Everyone who holds this range — one or two herds, always the same answer.
// Memoised because it IS always the same answer: who lives in a range is a
// function of the seed alone, and the renderer asks this every frame. (Whole
// planet = 4096 cells, so the cache cannot grow unbounded.)
const rangeCache = new Map();
export function herdsOfRange(cx, cz) {
  const k = cx * WORLD_SIZE + cz;
  const hit = rangeCache.get(k);
  if (hit) return hit;
  const first = tenantOf(cx, cz, 0, null, null);
  let out;
  if (!first) out = [];
  else {
    const opposite = FAUNA[first.key].hours === 'day' ? 'night' : 'day';
    const second = tenantOf(cx, cz, 1, first.key, opposite);
    out = second ? [first, second] : [first];
  }
  rangeCache.set(k, out);
  return out;
}

// Animals give a settlement a wide berth. This is the whole of their response to
// you: no fleeing animation, no aggression, no state — just ground they decline
// to stand on, recomputed from where your people actually are. A herd pushed off
// its centre this way is still perfectly deterministic, because the anchors doing
// the pushing are themselves a pure function of the clock.
function keepClear(x, z, avoid, wary) {
  if (!wary || !avoid || !avoid.length) return { x, z };
  let bx = x, bz = z;
  for (const a of avoid) {
    const dx = wdelta(a.x, bx), dz = wdelta(a.z, bz);
    const d = Math.hypot(dx, dz);
    if (d >= wary) continue;
    if (d < 0.001) { bx = wrap(a.x + wary); continue; }   // standing exactly on it: step off east
    bx = wrap(a.x + (dx / d) * wary);
    bz = wrap(a.z + (dz / d) * wary);
  }
  return { x: bx, z: bz };
}

// --- where they are right now ---------------------------------------------------
// The herd's centre drifts on a slow closed orbit inside its range: a pure
// function of the clock, so nobody has to remember it. Asleep, it does not
// drift at all — it is bedded down where the day left it.
const HOUR_MS = 3600000;

export function herdCentreAt(h, t, awake) {
  const sp = FAUNA[h.key];
  const wander = (RANGE / 2) * 0.62;                // stays well inside its own ground
  // one lazy circuit every few hours, at a speed the species could actually walk
  const period = (RANGE * 2) / Math.max(0.35, sp.gait) * 1000;
  const ph = (awake ? t : Math.floor(t / (HOUR_MS * 24)) * HOUR_MS * 24) / period + h.seed * Math.PI * 2;
  return {
    x: wrap(h.gx + Math.cos(ph) * wander + Math.sin(ph * 2.3) * wander * 0.3),
    z: wrap(h.gz + Math.sin(ph * 0.8) * wander + Math.cos(ph * 1.7) * wander * 0.3),
  };
}

// Is this species out at this hour, on this ground? (Longitude sets the hour,
// so a herd on the far side of the planet keeps its own schedule.)
export function isActive(key, x, t) {
  const sp = FAUNA[key];
  if (!sp) return false;
  const { light } = daylightAt(x, t);
  return sp.hours === 'day' ? light > 0.22 : light < 0.18;
}

// Every animal near a point, placed. This is what the renderer draws and what
// the percept counts — one function, so the told and the seen are one world.
// `radius` is in blocks; it should never need to exceed a view window.
export function faunaNear(x, z, t, radius = 64, avoid = []) {
  const out = [];
  const c0x = Math.floor(wrap(x) / RANGE), c0z = Math.floor(wrap(z) / RANGE);
  const span = Math.ceil(radius / RANGE) + 1;
  const cells = WORLD_SIZE / RANGE;
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const cx = ((c0x + dx) % cells + cells) % cells;
      const cz = ((c0z + dz) % cells + cells) % cells;
      for (const h of herdsOfRange(cx, cz)) {
      const sp = FAUNA[h.key];
      const awake = isActive(h.key, h.gx, t);
      const c0 = herdCentreAt(h, t, awake);
      const c = keepClear(c0.x, c0.z, avoid, sp.wary);
      if (Math.hypot(wdelta(x, c.x), wdelta(z, c.z)) > radius + RANGE * 0.5) continue;
      // Bedded down means bedded down: asleep, the clock is quantised to the day
      // exactly as the herd's centre already is, so a resting animal holds
      // perfectly still instead of creeping across the ground all night.
      const tb = awake ? t : Math.floor(t / (HOUR_MS * 24)) * HOUR_MS * 24;
      // A moment ahead, for the heading. Deriving it analytically got the
      // animals walking backwards — the position has several terms AND the
      // centre is moving too, so the honest way is to ask where it will be.
      const AHEAD = 500;
      const cN0 = herdCentreAt(h, t + AHEAD, awake);
      const cN = keepClear(cN0.x, cN0.z, avoid, sp.wary);
      const members = [];
      for (let i = 0; i < h.count; i++) {
        // the slot rides the seed: two herds sharing a range must not stand in
        // exactly the same formation as each other
        const s1 = hash2(h.cx * 7 + i, h.cz * 13 + i + h.slot * 401, WORLD_SEED + 5);
        const s2 = hash2(h.cx * 11 + i + h.slot * 257, h.cz * 3 + i, WORLD_SEED + 6);
        // spread scales with the band: a shoal is tight, a bison herd is not
        const spread = 2 + Math.sqrt(h.count) * (sp.ground === 'water' ? 0.7 : 1.6);
        const r = spread * (0.35 + s1 * 0.65);
        const offsetAt = (tt) => {
          const ph = tt / 1000 * (0.12 + s1 * 0.3) * (sp.gait / 2) + s2 * Math.PI * 2;
          return {
            dx: Math.cos(ph) * r + Math.sin(ph * 1.9) * r * 0.35,
            dz: Math.sin(ph * 1.1) * r + Math.cos(ph * 2.3) * r * 0.35,
          };
        };
        const o = offsetAt(tb);
        const mx = wrap(c.x + o.dx);
        const mz = wrap(c.z + o.dz);
        const g = terrainAt(Math.round(mx), Math.round(mz));
        // a flyer rides above whatever is under it; a fish sits just under the
        // surface; everything else stands on the ground it is actually on
        const base = sp.ground === 'water' ? SEA_LEVEL - 0.25 : Math.max(g.h, SEA_LEVEL);
        // A bird at rest is a bird on the ground. This used to leave a sleeping
        // gull hanging motionless eleven blocks up, which is not sleep, it is a
        // held frame — so out of its hours a flyer comes down and roosts.
        const bob = awake && sp.flight ? Math.sin(t / 620 + s2 * 9) * 0.5 : 0;
        const lift = awake ? sp.flight + bob : 0;
        members.push({
          x: mx, z: mz,
          y: base + lift,
          // a walking animal bobs a little; a sleeping one does not
          step: awake ? (Math.sin(t / 260 + s1 * 11) * 0.5 + 0.5) : 0,
          // heading as a rotation ABOUT Y for a model that faces +z, taken from
          // where it will actually be a moment from now. A sleeper keeps a fixed
          // lie rather than a direction of travel it does not have.
          face: awake
            ? (() => {
              const oN = offsetAt(tb + AHEAD);
              return Math.atan2(wdelta(mx, wrap(cN.x + oN.dx)), wdelta(mz, wrap(cN.z + oN.dz)));
            })()
            : s2 * Math.PI * 2,
          // a band of grazers travels with its young: the last quarter of a
          // walking herd comes up smaller, so a herd reads as a family
          scale: (0.82 + s1 * 0.36)
            * (sp.flight === 0 && sp.ground === 'land' && h.count >= 4
              && i >= h.count - Math.max(1, Math.round(h.count * 0.25)) ? 0.6 : 1),
        });
      }
      out.push({ key: h.key, awake, count: h.count, centre: c, members, range: [h.cx, h.cz, h.slot] });
      }
    }
  }
  return out;
}

// --- words -----------------------------------------------------------------------
// What the presence can honestly say it can see from where it stands. Bounded
// like every other sense here: near enough to make out, and no more.
export function faunaWords(x, z, t, radius = 70, avoid = []) {
  const seen = faunaNear(x, z, t, radius, avoid)
    .map((h) => {
      const d = Math.hypot(wdelta(x, h.centre.x), wdelta(z, h.centre.z));
      return { ...h, dist: Math.round(d) };
    })
    .filter((h) => h.dist <= radius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);
  return seen.map((h) => {
    const sp = FAUNA[h.key];
    const dir = directionOf(wdelta(x, h.centre.x), wdelta(z, h.centre.z));
    const many = h.count > 1;
    const noun = many ? `${h.count} ${sp.plural}` : `a ${sp.label}`;
    const is = many ? 'are' : 'is';
    const doing = h.awake
      ? (sp.flight ? `${is} turning overhead` : sp.ground === 'water' ? `${is} turning just under the surface` : `${is} moving`)
      : `${is} ${sp.rest}`;
    return `${noun} ${doing} ${h.dist} blocks ${dir}`;
  });
}
