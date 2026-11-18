// world.js — WHAT STANDS IN THE VOID, as numbers: the buildings a person has
// put up (the five: the shelter, the house, the workshop, the tower and the hall), and what they ask of a
// body (where it may go, what it stands on, how high it may reach, a ladder to
// climb), of the eye (where it may stand), and of the light (whether the sun
// reaches a point inside). No page, no three: the suite runs it; buildings/
// draws it.
//
// On the island (island/ground.js, set as w.ground) the ground is the land: a
// body stands on it, is held off what is too steep to walk up, swims where the
// sea is deep, may run along its cliffs, and the eye and what flies keep out
// of it. In the void w.ground is null and the floor is the water's.
//
// A building stands at a height of its own (b.y): 0 on the void's water; on
// the island, at the ground's height just in front of its door (or the sea's
// level over water), so its way in meets the ground; not at all where the
// ground under it rises behind more than its own `rise` (the house's piers
// lift its floor 0.45 m clear, as the workshop's plinth does; the tower's 0.25; the half-sunk shelter takes 0.55) or falls more
// than STEEP_SITE below it (its piers and steps reach that far down). Each kind's module works in its
// own frame from y = 0; this world takes a point down into that frame and its
// answers back up.
//
// One of each kind stands at a time: building another of a kind takes the
// first down. A building is not put up over another. They stand as long as the
// page does, as the body does (stage 6 will keep things).
import * as SH from './shelter.js';
import * as HO from './house.js';
import * as WO from './workshop.js';
import * as TO from './tower.js';
import * as HA from './hall.js';

export const BODY = { rad: 0.3, tall: 1.7 };          // a body, to a wall: an upright cylinder
export const STEP_UP = 0.35;                          // a step a body takes without jumping
export const REACH = 9;                               // m: within this of a building's door, the build key takes it down
export const TRUNK = 0.22;                            // m: a palm's trunk, to a body (life.js PALM.trunk)
export const STEEP_SITE = 1.4;                        // m: the most the ground may fall under a building put up on it

// the kinds, each as its module answers: placing, solving, inside, the eye, the sun, how it goes up, where its door is
export const KINDS = {
  shelter: { name: 'shelter', entry: (b) => SH.toWorld(b, 0, SH.SHELTER.out + 0.4), rise: 0.55, place: SH.placeShelter, solve: SH.solve, inside: SH.inside, eyeRoom: SH.eyeRoom, sunIn: SH.sunIn, phase: SH.phase, door: SH.doorWorld, dry: SH.dry, foot: SH.FOOT, solid: SH.solid },
  house: { name: 'house', entry: (b) => HO.toWorld(b, 0, HO.REACH_Z + 0.3), rise: 0.45, place: HO.placeHouse, solve: HO.solve, inside: HO.inside, eyeRoom: HO.eyeRoom, sunIn: HO.sunIn, phase: HO.phase, door: HO.doorWorld, dry: HO.dry, foot: HO.FOOT, solid: HO.solid, wall: HO.wall },
  workshop: { name: 'workshop', entry: (b) => WO.toWorld(b, 0, WO.REACH_Z + 0.3), rise: 0.45, place: WO.placeWorkshop, solve: WO.solve, inside: WO.inside, eyeRoom: WO.eyeRoom, sunIn: WO.sunIn, phase: WO.phase, door: WO.doorWorld, dry: WO.dry, foot: WO.FOOT, solid: WO.solid, wall: WO.wall, opens: WO.opens },
  tower: { name: 'tower', entry: (b) => TO.toWorld(b, 0, TO.REACH_Z + 0.3), rise: 0.25, place: TO.placeTower, solve: TO.solve, inside: TO.inside, eyeRoom: TO.eyeRoom, sunIn: TO.sunIn, phase: TO.phase, door: TO.doorWorld, dry: TO.dry, foot: TO.FOOT, solid: TO.solid, wall: TO.wall },
  hall: { name: 'hall', entry: (b) => HA.toWorld(b, 0, HA.HALL.terraces[0].hz + 1), rise: 0.25, place: HA.placeHall, solve: HA.solve, inside: HA.inside, eyeRoom: HA.eyeRoom, sunIn: HA.sunIn, phase: HA.phase, door: HA.mouthWorld, dry: HA.dry, foot: HA.FOOT, solid: HA.solid, wall: HA.wall, opens: HA.opens },
};
// the five, in the order they are offered; those not yet made say so
export const BUILDINGS = [
  { kind: 'shelter', label: 'shelter', ready: true }, { kind: 'house', label: 'house', ready: true },
  { kind: 'workshop', label: 'workshop', ready: true }, { kind: 'tower', label: 'tower', ready: true }, { kind: 'hall', label: 'hall', ready: true },
];
export const cleanBuilding = (k) => (KINDS[k] ? k : 'shelter');
const K = (b) => KINDS[b.kind];
// a point taken down into a building's own frame (its base at y = 0)
const down = (b, p) => (b.y ? [p[0], p[1] - b.y, p[2]] : p);
// the ground under a building's footprint, at its middle and on a ring round it: the lowest and the highest
export function siteOf(ground, b, foot) {
  let lo = Infinity, hi = -Infinity;
  for (const [r, n] of [[0, 1], [foot * 0.35, 6], [foot * 0.7, 10]]) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, h = ground.height(b.x + Math.sin(a) * r, b.z + Math.cos(a) * r);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { lo, hi };
}

export function createWorld() {
  const w = {
    buildings: [],
    ground: null,                       // the island's ground (island/ground.js), or none: the void's still water
    trunks: null,                       // the palms' trunks near a point (island/life.js), or none
    // a building of a kind put up in front of the body: another of its kind comes down; one would stand on another: not built
    build(body, kind = 'shelter') {
      const k = KINDS[cleanBuilding(kind)], b = k.place(body);
      for (const o of w.buildings) if (o.down < 0 && o.kind !== b.kind && Math.hypot(o.x - b.x, o.z - b.z) < k.foot + K(o).foot) return { did: 'blocked', b: o };
      b.y = 0;
      if (w.ground) {
        // on the island: its way in at the ground's height (the sea's level over water); not where the ground would come up
        // through it behind, nor fall away under it further than its foundations reach
        const site = siteOf(w.ground, b, k.foot), [ex, ez] = k.entry(b), at = Math.max(0, w.ground.height(ex, ez));
        if (Math.max(0, site.hi) > at + k.rise) return { did: 'steep', b, fall: Math.max(0, site.hi) - at, rises: true };
        if (at - Math.max(0, site.lo) > STEEP_SITE) return { did: 'steep', b, fall: at - Math.max(0, site.lo) };
        b.y = at;
      }
      for (const o of w.buildings) if (o.down < 0 && o.kind === b.kind) o.down = 0;
      w.buildings.push(b);
      return { did: 'up', b };
    },
    // the build key: near a standing building's door it is taken down; else the kind chosen goes up
    toggle(body, kind = 'shelter') {
      const near = w.near(body.p);
      if (near) { near.down = 0; return { did: 'down', b: near }; }
      return w.build(body, kind);
    },
    near(p) {
      let best = null, bd = REACH;
      for (const b of w.buildings) {
        if (b.down >= 0) continue;
        const [dx, dz] = K(b).door(b), d = Math.min(Math.hypot(p[0] - dx, p[2] - dz), K(b).inside(b, p[0], p[2], p[1] - (b.y || 0)) ? 0 : Infinity);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    },
    // time passes: what is going up goes on up; what is coming down comes down and is gone
    update(dt) {
      for (const b of w.buildings) { if (b.down >= 0) b.down += dt; else b.t += dt; }
      w.buildings = w.buildings.filter((b) => !K(b).phase(b).gone);
    },
    // the origin moved under the body (rings.js, rebase): the same places in new numbers
    shift(dx, dz) { for (const b of w.buildings) { b.x -= dx; b.z -= dz; } },
    standing: () => w.buildings.filter((b) => b.down < 0),
    // a body's step against everything standing (body.js calls it): pushed out of walls, its head kept under
    // ceilings, a ladder found (s.climb). Answers the floor under it.
    solve(s) {
      let floor = 0, ceiling = Infinity, climb = null;
      if (w.ground) {
        // the island's ground: held off what is too steep to walk up (only where the feet are on it), stood on, or swum over
        const G = w.ground, at = s.p[1] < G.height(s.p[0], s.p[2]) + 0.6 ? G.step(s.was || s.p, s.p) : s.p;
        s.p[0] = at[0]; s.p[2] = at[2];
        floor = G.floor(s.p[0], s.p[2]); s.depth = G.depth(s.p[0], s.p[2]); s.swim = floor > G.height(s.p[0], s.p[2]) + 0.01;
        // the palms' trunks round it (life.js): out of them the short way
        if (w.trunks) for (const t of w.trunks(s.p[0], s.p[2])) {
          if (w.built(t.x, t.z)) continue;                                                    // no palm grows where a building stands
          const dx = s.p[0] - t.x, dz = s.p[2] - t.z, d = Math.hypot(dx, dz), min = BODY.rad + TRUNK;
          if (d < min && s.p[1] < t.y + t.h && d > 1e-6) { s.p[0] = t.x + (dx / d) * min; s.p[2] = t.z + (dz / d) * min; }
        }
      } else { s.depth = 0; s.swim = false; }
      for (const b of w.buildings) {
        if (b.down >= 0) continue;
        const by = b.y || 0, r = K(b).solve(b, down(b, s.p), down(b, s.was || s.p), BODY.rad, BODY.tall, STEP_UP);
        s.p[0] = r.p[0]; s.p[2] = r.p[2];
        // (a floor of 0 from a raised building is no floor: nothing of it is under the body)
        floor = Math.max(floor, r.floor > 1e-6 || (!by && !w.ground) ? r.floor + by : -Infinity); ceiling = Math.min(ceiling, r.ceiling + by);
        if (r.climb) climb = by ? { ...r.climb, top: r.climb.top + by, base: r.climb.base + by } : r.climb;
      }
      s.climb = climb;
      if (s.p[1] + BODY.tall > ceiling) { s.p[1] = Math.max(floor, ceiling - BODY.tall); if (s.v[1] > 0) s.v[1] = 0; s.rising = false; }
      return floor;
    },
    // which building a point is inside (feet at y), if any
    inside(p) { for (const b of w.buildings) if (b.down < 0 && K(b).inside(b, p[0], p[2], p[1] - (b.y || 0))) return b; return null; },
    // whether a point is under a standing building (within its footprint's circle): no palm grows there
    built(x, z) { for (const b of w.buildings) if (b.down < 0 && Math.hypot(b.x - x, b.z - z) < K(b).foot) return true; return false; },
    // whether a point is inside one building (its own height taken into account)
    within(b, p) { return K(b).inside(b, p[0], p[2], p[1] - (b.y || 0)); },
    // how far along from the body's head toward the eye the eye may stand
    eye(from, to) { let t = w.ground ? w.ground.clear(from, to) : 1; for (const b of w.buildings) if (b.down < 0) t = Math.min(t, K(b).eyeRoom(b, down(b, from), down(b, to))); return t; },
    // whether the sun reaches a point (1) or the building it is in shades it (0); in the open, 1
    sunAt(p, sun, doorOpen = 1) { const b = w.inside(p); return b ? K(b).sunIn(b, p[0], p[1] - (b.y || 0), p[2], sun, doorOpen) : 1; },
    // the nearest wall a body at p could run along (body.js), of everything standing that has walls to run: { n, d } or null
    wall(p) { let best = w.ground ? w.ground.wall(p) : null; for (const b of w.buildings) { if (b.down >= 0 || !K(b).wall) continue; const r = K(b).wall(b, down(b, p)); if (r && (!best || r.d < best.d)) best = r; } return best; },
    // whether a point is in something standing (a wall, a roof, a thing): what flies stops there (combat.js)
    solid(p) { if (w.ground && p[1] < w.ground.height(p[0], p[2])) return true; for (const b of w.buildings) if (b.down < 0 && K(b).solid(b, down(b, p), 0.02)) return true; return false; },
    // the water a body treads on: none on a building's floor or its steps
    wet(x, z) { if (w.ground && w.ground.height(x, z) >= 0) return false; for (const b of w.buildings) if (b.down < 0 && K(b).dry(b, x, z)) return false; return true; },
  };
  return w;
}
