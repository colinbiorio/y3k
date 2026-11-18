// workshop.js — THE THIRD BUILDING, AS NUMBERS: its walls and vaults, what of
// it is solid, where the light gets in, how it goes up. No page, no three (the
// suite runs it); buildings/workshop.js draws it.
//
// GAME.md, stage 3: "about ten by twelve metres: thick adobe walls, a roof of
// three fired-brick barrel vaults, a tall bronze chimney, one whole wall a
// sliding door of glass in a pale alloy frame. Inside: a long workbench with
// hand tools, a ceramic kiln whose mouth glows with contained plasma, racks of
// timber and metal bars, a stone floor."
//
// Its own frame: the middle of its floor plan at the origin, Y up, the glass
// wall at +Z (it is built facing whoever builds it). Metres. The ten by twelve
// are its walls' outer faces. A stone plinth holds the floor half a metre up,
// with two broad steps before the glass. The three vaults run from the glass
// wall to the back, side by side, three metres across each: the outer two
// spring from a side wall and from a pale alloy beam on two columns, the
// middle one from the two beams. The glass wall is six panels a metre and a
// half wide on three tracks; the middle four slide aside, two over each end
// panel, and leave six metres open. Over the panels runs a header, and over
// that each vault's end is a half-round of glass. A body may always pass the
// opening: the drawing slides the glass open as one comes (opens, below).
import { solveBoxes, inBox, rayBox } from './solids.js';

export const WORKSHOP = {
  half: 5.0, wall: 0.5,                      // the side walls' outer faces at x = ±5, half a metre of adobe
  back: -6.0, front: 6.0,                    // z: the back wall's outer face; the side walls' and the vaults' front ends
  floor: 0.5,                                // the floor's top: stone flags on the plinth
  spring: 3.9,                               // where the vaults spring (3.4 m over the floor), from the walls and the beams
  r: 1.5, shell: 0.2,                        // each vault's inner radius (three spans of 3 m, their middles at x = -3, 0, 3); its bricks' depth
  glass: { z: 5.72, high: 3.6, open: 3.0, panel: 1.5, track: 0.07 },   // the glass wall's plane; the panels' top; half the opening; a panel; the tracks apart
  beam: { half: 0.1, deep: 0.32 },           // the alloy beams under the two valleys (x = ±1.5)
  columns: [[-1.5, -2], [1.5, -2], [-1.5, 2], [1.5, 2]], column: 0.09,
  ties: [-3.5, 0, 3.5],                      // z: the steel tie rods across the vaults' feet
  kiln: { x: 3.0, z: -4.15, r: 0.72, body: 0.95, dome: 1.48, mouth: 0.26, at: 0.62 },   // heights over the floor
  chimney: { r: 0.2, top: 10.8 },
  bench: { x0: -4.5, x1: -3.65, z0: -3.0, z1: 2.0, top: 0.92 },
  stool: { x: -3.2, z: -0.5, r: 0.18, top: 0.62 },
  build: { base: 1.0, walls: 3.0, vaults: 5.4, glass: 6.4, done: 7.6, down: 2.0 },   // seconds
};
const W = WORKSHOP, F = W.floor, S = W.spring, R = W.r, RO = W.r + W.shell, G = W.glass, KL = W.kiln;
export const IN = W.half - W.wall, BACK_IN = W.back + W.wall;          // the room's inner faces: x = ±4.5, z = -5.5
export const WALLTOP = S + 0.85;              // the side walls' top, over the outer vaults' haunches
export const CROWN = S + R;                   // a vault's underside at its crown
export const REACH_Z = 7.4;                   // its front: the outer step's edge
export const FOOT = 9.0;                      // m: a circle round its middle that holds all of it (for building beside another)
const SPRINGS = [-IN, -1.5, 1.5, IN];         // where the vaults spring

// which vault is over x (its middle), and the vaults' underside and top there
export const vaultAt = (x) => 3 * Math.max(-1, Math.min(1, Math.round(x / 3)));
export const vaultIn = (x) => { const d = Math.min(R, Math.abs(x - vaultAt(x))); return S + Math.sqrt(R * R - d * d); };
export const vaultOut = (x) => (Math.abs(x) > IN ? WALLTOP : S + Math.sqrt(Math.max(0, RO * RO - (x - vaultAt(x)) ** 2)));
// the highest of the roof under a body's breadth (its middle at x): what it stands on up there
export function roofTop(x, rad = 0) {
  let top = -Infinity;
  for (const q of [x - rad, x, x + rad, -3, 0, 3]) if (q >= x - rad && q <= x + rad) top = Math.max(top, vaultOut(Math.max(-W.half, Math.min(W.half, q))));
  return top;
}
// the lowest of the vaults' underside over a body's breadth: where its head must keep under
export function underVault(x, rad = 0) {
  const a = Math.max(-IN, x - rad), b = Math.min(IN, x + rad);
  return SPRINGS.some((s) => s >= a && s <= b) ? S : Math.min(vaultIn(a), vaultIn(b));
}

const box = (x0, x1, z0, z1, y0, y1, part = '') => ({ x0, x1, z0, z1, y0, y1, part });
const ch = box(KL.x - W.chimney.r, KL.x + W.chimney.r, KL.z - W.chimney.r, KL.z + W.chimney.r, F + KL.dome, W.chimney.top, 'chimney');
// what a body meets (and what the eye may not enter): the plinth and its steps, the walls, the glass beside the opening and
// the header over it, the half-rounds, the beams and their columns, and the things
export const SOLIDS = [
  box(-IN, IN, BACK_IN, W.front, 0, F, 'plinth'),
  box(-W.half, W.half, W.front, 6.7, 0, 0.34, 'step'), box(-W.half, W.half, 6.7, REACH_Z, 0, 0.17, 'step'),
  box(-W.half, -IN, W.back, W.front, 0, WALLTOP, 'wall'), box(IN, W.half, W.back, W.front, 0, WALLTOP, 'wall'),
  box(-IN, IN, W.back, BACK_IN, 0, S, 'wall'),
  box(-IN, -G.open, G.z - 0.1, G.z + 0.1, F, G.high, 'glass'), box(G.open, IN, G.z - 0.1, G.z + 0.1, F, G.high, 'glass'),
  box(-IN, IN, G.z - 0.1, G.z + 0.1, G.high, S, 'header'),
  ...[-3, 0, 3].map((c) => box(c - R, c + R, G.z - 0.06, G.z + 0.06, S, S + R, 'lunette')),
  ...[-1.5, 1.5].map((x) => box(x - W.beam.half, x + W.beam.half, BACK_IN, G.z, S - W.beam.deep, S, 'beam')),
  ...W.columns.map(([x, z]) => box(x - W.column, x + W.column, z - W.column, z + W.column, F, S - W.beam.deep, 'column')),
  box(W.bench.x0, W.bench.x1, W.bench.z0, W.bench.z1, F, F + W.bench.top, 'bench'),
  box(KL.x - KL.r, KL.x + KL.r, KL.z - KL.r, KL.z + KL.r, F, F + KL.dome, 'kiln'), ch,
  box(-4.3, 1.2, BACK_IN, -4.85, F, F + 2.45, 'rack'), box(3.85, IN, -1.4, 2.6, F, F + 2.45, 'rack'),
  box(W.stool.x - W.stool.r, W.stool.x + W.stool.r, W.stool.z - W.stool.r, W.stool.z + W.stool.r, F, F + W.stool.top, 'stool'),
];
const BOUNDS = new Set(['plinth', 'step', 'wall', 'glass', 'header', 'lunette']);    // what bounds the room's air, rather than stands in it
const BEAMS = SOLIDS.filter((s) => s.part === 'beam');

// a world point in the workshop's own frame, and back (b: { x, z, yaw }; its front faces +Z turned by yaw)
export function toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
export function toWorld(b, lx, lz) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + c * lx + s * lz, b.z - s * lx + c * lz]; }

// built facing whoever builds it, its steps a stride and a half in front
export function placeWorkshop(body, gap = 1.5) {
  const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw), d = REACH_Z + gap;
  return { kind: 'workshop', x: body.p[0] + fx * d, z: body.p[2] + fz * d, yaw: body.yaw + Math.PI, t: 0, down: -1 };
}
export const doorWorld = (b) => toWorld(b, 0, G.z);

// the room's air: inside its walls, behind the glass, under the vaults
export const inRoom = (lx, y, lz, m = 0) => Math.abs(lx) < IN - m && lz > BACK_IN + m && lz < G.z - m && y > F + m && y < vaultIn(lx) - m;
// the air before the glass, under the vaults' front ends
const inRecess = (lx, y, lz, m = 0) => Math.abs(lx) < IN - m && lz > G.z + 0.1 + m && lz < W.front + 1 && y > F + m && y < vaultIn(lx) - m;
// the opening's air, where the glass has slid aside
const inOpening = (lx, y, lz, m = 0) => Math.abs(lx) < G.open - m && lz > G.z - 0.3 && lz < W.front + 1 && y > F + m && y < G.high - m;

// INSIDE: a body's feet (at y) in the room
export function inside(b, x, z, y = 0) { const [lx, lz] = toLocal(b, x, z); return inRoom(lx, Math.max(y, F) + 0.05, lz); }
// whether a body at p is near enough the glass for it to slide open (within 4 m of the opening, or inside the walls)
export function opens(b, p) {
  const [lx, lz] = toLocal(b, p[0], p[2]), cx = Math.max(-G.open, Math.min(G.open, lx));
  return Math.hypot(lx - cx, lz - G.z) < 4 || (Math.abs(lx) < IN && lz > BACK_IN && lz < G.z);
}

// What a body may not go into, and what it stands on (as house.js's solve). The boxes do most of it (solids.js); the
// vaults keep a head under them in the room, are a ceiling from below before the glass, are stood on from above (where
// the chimney is in the way), and are kept out of the short way by whatever flies at their height outside.
export function solve(b, p, was, rad = 0.3, tall = 1.7, stepUp = 0.35) {
  let [lx, lz] = toLocal(b, p[0], p[2]);
  const y = p[1];
  if (Math.abs(lx) > W.half + rad + 0.6 || lz > REACH_Z + rad + 0.6 || lz < W.back - rad - 0.6) return { p, floor: 0, ceiling: Infinity, hit: false, climb: null };
  const [wx, wz] = toLocal(b, was[0], was[2]), wy = was[1];
  const over = (x, z) => Math.abs(x) < W.half + rad && z > W.back - rad && z < W.front + rad;
  let floor = 0, ceiling = Infinity, hit = false;
  const roomBefore = inRoom(wx, wy + 0.05, wz);
  if (over(wx, wz) && wy > S && wy >= roofTop(wx, rad * 0.5) - 0.05) {
    // the vaults from above: whatever was over them stands on them, the chimney in its way
    const r = solveBoxes([ch], lx, lz, y, wy, rad, tall, stepUp);
    lx = r.lx; lz = r.lz; hit = r.hit;
    floor = Math.max(floor, roofTop(lx, rad * 0.5));
  } else {
    const r = solveBoxes(SOLIDS, lx, lz, y, wy, rad, tall, stepUp);
    lx = r.lx; lz = r.lz; hit = r.hit;
    if (r.floor > -Infinity) floor = Math.max(floor, r.floor);
    ceiling = Math.min(ceiling, r.ceiling);
    if (roomBefore) {
      ceiling = Math.min(ceiling, underVault(lx, rad));                 // in the room the vaults keep a head under them
    } else if (over(lx, lz) && y < roofTop(lx, rad)) {
      if (lz > G.z && lz - rad < W.front && Math.abs(lx) < IN && wy + tall <= underVault(wx, rad) + 0.02) {
        ceiling = Math.min(ceiling, underVault(lx, rad));               // before the glass, come up from below: the vaults' ends are a ceiling
      } else if (y + tall > S) {
        // outside, at the vaults' height (flying): out of them the short way, across or along
        const toSide = W.half + rad - Math.abs(lx), toFront = W.front + rad - lz, toBack = lz - (W.back - rad), m = Math.min(toSide, toFront, toBack);
        if (m > 0) { if (m === toSide) lx = Math.sign(lx || 1) * (W.half + rad); else if (m === toFront) lz = W.front + rad; else lz = W.back - rad; hit = true; }
      }
    }
  }
  const [x, z] = toWorld(b, lx, lz);
  return { p: [x, y, z], floor, ceiling, hit, climb: null };
}

// A wall a body could run along (body.js): the nearest of its adobe walls whose face the body's middle is beside (from
// 0.5 m over its feet to 1.2 m), within `reach` of its side. Answers the face's outward way in the world, and how near.
export function wall(b, p, rad = 0.3, reach = 0.22) {
  const [lx, lz] = toLocal(b, p[0], p[2]), lo = p[1] + 0.5, hi = p[1] + 1.2;
  let best = null;
  for (const s of SOLIDS) {
    if (s.part !== 'wall' || s.y0 > lo || s.y1 < hi) continue;
    const cx = Math.max(s.x0, Math.min(lx, s.x1)), cz = Math.max(s.z0, Math.min(lz, s.z1)), dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz);
    if (d < 1e-6 || d > rad + reach) continue;
    if (!best || d < best.d) best = { d, x: dx / d, z: dz / d };
  }
  if (!best) return null;
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  return { d: best.d, n: [c * best.x + sn * best.z, -sn * best.x + c * best.z] };
}

// What of a point is solid to the eye: in a wall, a vault, the plinth, the glass or a thing; not the room's air, the
// air before the glass, or the opening's.
export function solid(b, q, m = 0.15) {
  const [lx, lz] = toLocal(b, q[0], q[2]), y = q[1];
  if (inRoom(lx, y, lz, m) || inRecess(lx, y, lz, m) || inOpening(lx, y, lz, m)) {
    for (const s of SOLIDS) if (!BOUNDS.has(s.part) && inBox(s, lx, y, lz, m * 0.5)) return true;
    return false;
  }
  if (Math.abs(lx) < W.half + m && lz > W.back - m && lz < W.front + m && y > -1 && y < roofTop(lx) + m) return true;
  for (const s of SOLIDS) if (inBox(s, lx, y, lz, m)) return true;                 // the steps; the chimney over the roof
  return false;
}
// Where the eye may stand, looking at a body from `from` toward `to`: kept out of what is solid. (Unlike the house's
// door, the opening is six metres wide: from inside, the eye may follow a body's look out through it.)
export function eyeRoom(b, from, to, m = 0.15) {
  const bad = (q) => solid(b, q, m);
  const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  let lo = 0, hi = 1, found = false;
  for (let i = 1; i <= 40; i++) { const t = i / 40; if (bad(at(t))) { hi = t; lo = (i - 1) / 40; found = true; break; } }
  if (!found) return 1;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (bad(at(mid))) hi = mid; else lo = mid; }
  return lo;
}

// The sun in the room: from a point in it, toward the sun (a unit vector, up positive), does the ray leave by the glass
// wall (the panels, the opening, a half-round), and on out under the vaults' front ends? 1 lit, 0 in the workshop's shade.
export function sunIn(b, x, y, z, sun) {
  if (sun[1] <= 0) return 0;
  const [lx, lz] = toLocal(b, x, z), c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return sunLocal(lx, y, lz, [c * sun[0] - s * sun[2], sun[1], s * sun[0] + c * sun[2]]);
}
export function sunLocal(lx, y, lz, d) {
  if (d[1] <= 0) return 0;
  // the ray's way out of the room: a side wall, the back, the glass, or the vault it is under once risen to their springing
  const tx = d[0] > 1e-9 ? (IN - lx) / d[0] : d[0] < -1e-9 ? (-IN - lx) / d[0] : Infinity;
  const tz = d[2] > 1e-9 ? (G.z - lz) / d[2] : d[2] < -1e-9 ? (BACK_IN - lz) / d[2] : Infinity;
  const ts = Math.max(0, (S - y) / d[1]), qx = lx + d[0] * ts, qy = Math.max(y, S);
  let tv = Infinity;
  if (Math.abs(qx) <= IN) {
    const ox = qx - vaultAt(qx), oy = qy - S, A = d[0] * d[0] + d[1] * d[1], B2 = 2 * (ox * d[0] + oy * d[1]), C = ox * ox + oy * oy - R * R;
    tv = ts + (-B2 + Math.sqrt(Math.max(0, B2 * B2 - 4 * A * C))) / (2 * A);
  }
  const t = Math.min(tx, tz, tv);
  for (const bm of BEAMS) if (rayBox(bm, [lx, y, lz], d) < t) return 0;          // a beam in the way
  if (t !== tz || d[2] <= 0) return 0;
  const ex = lx + d[0] * t, ey = y + d[1] * t;
  if (ey > G.high && ey < S) return 0;                                           // the header
  // on through the air before the glass, under the vaults' front ends and between the side walls
  const tf = (W.front - G.z) / d[2], fx = ex + d[0] * tf, fy = ey + d[1] * tf;
  return Math.abs(fx) > IN || fy > vaultIn(fx) ? 0 : 1;
}

// How it goes up: the plinth, the walls (with the beams and their columns), the vaults one after another, the glass and
// the chimney, the things (0..1 each). Taken down, it goes the same way backward.
export function phase(b) {
  const B = W.build, k = (a, z, t) => Math.max(0, Math.min(1, (t - a) / (z - a)));
  const t = b.down >= 0 ? B.done * (1 - Math.min(1, b.down / B.down)) : b.t;
  return { base: k(0, B.base, t), walls: k(B.base, B.walls, t), vaults: k(B.walls, B.vaults, t), glass: k(B.vaults, B.glass, t), rest: k(B.glass, B.done, t), gone: b.down >= B.down };
}
// what it rests on is dry ground: its plinth and its steps
export const dry = (b, x, z) => { const [lx, lz] = toLocal(b, x, z); return Math.abs(lx) < W.half && lz > W.back && lz < REACH_Z; };
