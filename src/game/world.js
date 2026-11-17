// world.js — WHAT STANDS IN THE VOID, as numbers: the buildings a person has
// put up (for now the shelter, the first of five), and what they ask of a
// body (where it may go, what it stands on, how high it may reach), of the
// eye (where it may stand), and of the light (whether the sun reaches a point
// inside). No page, no three: the suite runs it; buildings/ draws it.
//
// One shelter at a time: building another takes the first down. They stand as
// long as the page does, as the body does (stage 6 will keep things).
import * as SH from './shelter.js';

export const BODY = { rad: 0.3, tall: 1.7 };          // a body, to a wall: an upright cylinder
export const STEP_UP = 0.35;                          // a step a body takes without jumping
export const REACH = 8;                               // m: a building this near is the one the build key takes down

export function createWorld() {
  const w = {
    buildings: [],
    // the build key: near a standing building, it is taken down; else one goes up in front of the body
    toggle(body) {
      const near = w.near(body.p);
      if (near && near.down < 0) { near.down = 0; return { did: 'down', b: near }; }
      for (const b of w.buildings) if (b.down < 0) b.down = 0;
      const b = SH.placeShelter(body);
      w.buildings.push(b);
      return { did: 'up', b };
    },
    near(p) { let best = null, bd = REACH; for (const b of w.buildings) { const d = Math.hypot(p[0] - b.x, p[2] - b.z); if (d < bd) { bd = d; best = b; } } return best; },
    // time passes: what is going up goes on up; what is coming down comes down and is gone
    update(dt) {
      for (const b of w.buildings) { if (b.down >= 0) b.down += dt; else b.t += dt; }
      w.buildings = w.buildings.filter((b) => !SH.phase(b).gone);
    },
    // the origin moved under the body (rings.js, rebase): the same places in new numbers
    shift(dx, dz) { for (const b of w.buildings) { b.x -= dx; b.z -= dz; } },
    standing: () => w.buildings.filter((b) => b.down < 0),
    // a body's step against everything standing (body.js calls it): pushed out of walls; its head kept under
    // ceilings. Answers the floor under it.
    solve(s) {
      let floor = 0, ceiling = Infinity;
      for (const b of w.buildings) {
        if (b.down >= 0) continue;
        const r = SH.solve(b, s.p, s.was || s.p, BODY.rad, BODY.tall);
        s.p[0] = r.p[0]; s.p[2] = r.p[2];
        floor = Math.max(floor, r.floor); ceiling = Math.min(ceiling, r.ceiling);
      }
      if (s.p[1] + BODY.tall > ceiling) { s.p[1] = Math.max(floor, ceiling - BODY.tall); if (s.v[1] > 0) s.v[1] = 0; s.rising = false; }
      return floor;
    },
    // which building a point is inside (feet at y), if any
    inside(p) { for (const b of w.buildings) if (b.down < 0 && SH.inside(b, p[0], p[2], p[1])) return b; return null; },
    // how far along from the body's head toward the eye the eye may stand
    eye(from, to) { let t = 1; for (const b of w.buildings) if (b.down < 0) t = Math.min(t, SH.eyeRoom(b, from, to)); return t; },
    // whether the sun reaches a point (1) or the building it is in shades it (0); in the open, 1
    sunAt(p, sun, doorOpen = 1) { const b = w.inside(p); return b ? SH.sunIn(b, p[0], p[1], p[2], sun, doorOpen) : 1; },
    // the water a body treads on: none on a building's floor
    wet(x, z) { for (const b of w.buildings) if (b.down < 0 && Math.hypot(...SH.toLocal(b, x, z)) < SH.SHELTER.out) return false; return true; },
  };
  return w;
}
