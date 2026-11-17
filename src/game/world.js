// world.js — WHAT STANDS IN THE VOID, as numbers: the buildings a person has
// put up (the shelter and the house, of the five), and what they ask of a
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
// One of each kind stands at a time: building another of a kind takes the
// first down. A building is not put up over another. They stand as long as the
// page does, as the body does (stage 6 will keep things).
import * as SH from './shelter.js';
import * as HO from './house.js';

export const BODY = { rad: 0.3, tall: 1.7 };          // a body, to a wall: an upright cylinder
export const STEP_UP = 0.35;                          // a step a body takes without jumping
export const REACH = 9;                               // m: within this of a building's door, the build key takes it down

// the kinds, each as its module answers: placing, solving, inside, the eye, the sun, how it goes up, where its door is
export const KINDS = {
  shelter: { name: 'shelter', place: SH.placeShelter, solve: SH.solve, inside: SH.inside, eyeRoom: SH.eyeRoom, sunIn: SH.sunIn, phase: SH.phase, door: SH.doorWorld, dry: SH.dry, foot: SH.FOOT, solid: SH.solid },
  house: { name: 'house', place: HO.placeHouse, solve: HO.solve, inside: HO.inside, eyeRoom: HO.eyeRoom, sunIn: HO.sunIn, phase: HO.phase, door: HO.doorWorld, dry: HO.dry, foot: HO.FOOT, solid: HO.solid, wall: HO.wall },
};
// the five, in the order they are offered; those not yet made say so
export const BUILDINGS = [
  { kind: 'shelter', label: 'shelter', ready: true }, { kind: 'house', label: 'house', ready: true },
  { kind: 'workshop', label: 'workshop', ready: false }, { kind: 'tower', label: 'tower', ready: false }, { kind: 'hall', label: 'hall', ready: false },
];
export const cleanBuilding = (k) => (KINDS[k] ? k : 'shelter');
const K = (b) => KINDS[b.kind];

export function createWorld() {
  const w = {
    buildings: [],
    ground: null,                       // the island's ground (island/ground.js), or none: the void's still water
    // a building of a kind put up in front of the body: another of its kind comes down; one would stand on another: not built
    build(body, kind = 'shelter') {
      const k = KINDS[cleanBuilding(kind)], b = k.place(body);
      for (const o of w.buildings) if (o.down < 0 && o.kind !== b.kind && Math.hypot(o.x - b.x, o.z - b.z) < k.foot + K(o).foot) return { did: 'blocked', b: o };
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
        const [dx, dz] = K(b).door(b), d = Math.min(Math.hypot(p[0] - dx, p[2] - dz), K(b).inside(b, p[0], p[2], p[1]) ? 0 : Infinity);
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
      } else { s.depth = 0; s.swim = false; }
      for (const b of w.buildings) {
        if (b.down >= 0) continue;
        const r = K(b).solve(b, s.p, s.was || s.p, BODY.rad, BODY.tall, STEP_UP);
        s.p[0] = r.p[0]; s.p[2] = r.p[2];
        floor = Math.max(floor, r.floor); ceiling = Math.min(ceiling, r.ceiling);
        if (r.climb) climb = r.climb;
      }
      s.climb = climb;
      if (s.p[1] + BODY.tall > ceiling) { s.p[1] = Math.max(floor, ceiling - BODY.tall); if (s.v[1] > 0) s.v[1] = 0; s.rising = false; }
      return floor;
    },
    // which building a point is inside (feet at y), if any
    inside(p) { for (const b of w.buildings) if (b.down < 0 && K(b).inside(b, p[0], p[2], p[1])) return b; return null; },
    // how far along from the body's head toward the eye the eye may stand
    eye(from, to) { let t = w.ground ? w.ground.clear(from, to) : 1; for (const b of w.buildings) if (b.down < 0) t = Math.min(t, K(b).eyeRoom(b, from, to)); return t; },
    // whether the sun reaches a point (1) or the building it is in shades it (0); in the open, 1
    sunAt(p, sun, doorOpen = 1) { const b = w.inside(p); return b ? K(b).sunIn(b, p[0], p[1], p[2], sun, doorOpen) : 1; },
    // the nearest wall a body at p could run along (body.js), of everything standing that has walls to run: { n, d } or null
    wall(p) { let best = w.ground ? w.ground.wall(p) : null; for (const b of w.buildings) { if (b.down >= 0 || !K(b).wall) continue; const r = K(b).wall(b, p); if (r && (!best || r.d < best.d)) best = r; } return best; },
    // whether a point is in something standing (a wall, a roof, a thing): what flies stops there (combat.js)
    solid(p) { if (w.ground && p[1] < w.ground.height(p[0], p[2])) return true; for (const b of w.buildings) if (b.down < 0 && K(b).solid(b, p, 0.02)) return true; return false; },
    // the water a body treads on: none on a building's floor or its steps
    wet(x, z) { if (w.ground && w.ground.height(x, z) >= 0) return false; for (const b of w.buildings) if (b.down < 0 && K(b).dry(b, x, z)) return false; return true; },
  };
  return w;
}
