// tower.js — THE FOURTH BUILDING, AS NUMBERS: its shaft and stair, what of it
// is solid, where the light gets in, how it goes up. No page, no three (the
// suite runs it); buildings/tower.js draws it.
//
// GAME.md, stage 3: "a slender round tower about six metres across and
// twenty-four tall, of pale limestone blocks with bands of blue-green glazed
// ceramic, narrow windows spiralling up it, at the top a dome of brass ribs and
// clear glass with an armillary instrument inside, and a small landing ledge.
// Inside, looking up: a stone stair spiralling along the wall, wooden landings
// with a desk and shelves of scrolls and instruments, light from the dome."
//
// Its own frame: the shaft's axis at the origin, Y up, its door at +Z (it is
// built facing whoever builds it). Metres. An angle th round the axis is
// measured from +X toward +Z (the door is at th = pi/2). The stair starts just
// right of the door as one comes in and climbs the wall clockwise seen from
// above, a hundred steps in two and a half turns, a rail on its inner edge;
// inside that edge the well is open from the floor to the dome. Two wooden
// landings fill the well's front half a turn apart (at the 40th and 80th
// steps); the stair arrives at a gallery round the well under the dome, where
// a door opens onto the ledge. The stair's walking surface is a smooth ramp
// through the middle of each tread, so a body climbs it without a jolt at
// every step.
import { solveBoxes, inBox } from './solids.js';

export const TOWER = {
  ro: 3.0, ri: 2.5,                          // the shaft's outer and inner radii: six metres across, half a metre of limestone
  floor: 0.3,                                // the ground floor's top, on the plinth
  plinth: 3.35,                              // the plinth's outer edge (a step's height)
  door: { half: 0.55, spring: 2.05, high: 2.6 },   // the doorway at +Z: half its width, where its arch springs, the arch's top
  well: 1.3,                                 // the open well's radius: the stair runs from here out to the wall
  stair: { start: Math.PI / 2 - 0.5, steps: 100, rise: 0.2, perTurn: 40, slab: 0.45, rail: 0.9 },
  landings: [40, 80],                        // the steps the landings are level with (a turn apart, so on the same side)
  opening: 11,                               // the last steps, under no gallery floor (their headroom)
  parapet: 0.9,                              // the shaft's top over the gallery's floor
  dome: { r: 2.75 },                         // the glass dome's radius, springing from the shaft's top
  ledge: { half: 1.1, out: 4.3, thick: 0.3, door: 2.2 },   // the ledge outside the gallery at +Z, and its doorway's height
  slits: 5,                                  // a narrow window every so many steps, over the stair
  build: { base: 1.0, walls: 4.5, floors: 5.5, dome: 7.0, done: 8.2, down: 2.0 },   // seconds
};
const T = TOWER, F = T.floor, RI = T.ri, RO = T.ro, RW = T.well, ST = T.stair, H = ST.rise, D = T.door, L = T.ledge;
const TAU = 2 * Math.PI, DT = TAU / ST.perTurn, PITCH = ST.perTurn * H;
export const TOP = F + ST.steps * H;         // the gallery's floor (20.3)
export const SPRING = TOP + T.parapet;       // the shaft's top, where the dome springs (21.2)
export const CROWN = SPRING + T.dome.r;      // the dome's crown
export const REACH_Z = T.plinth;             // its front: the plinth's edge
export const FOOT = 4.6;                     // m: a circle round its middle that holds all of it (the ledge reaches 4.3)
const wrap = (a) => ((a % TAU) + TAU) % TAU;

// ---- the stair. A turn k passes the angle th at the step coordinate u (0 at the stair's foot, one per step); its walking
// surface there is a ramp through the treads' middles, and a tread's drawn top is the next whole step
export const stepAt = (th, k) => wrap(ST.start - th) / DT + k * ST.perTurn;
export const rampAt = (u) => Math.min(TOP, F + H / 2 + u * H);
export const treadAt = (u) => F + Math.min(ST.steps, Math.floor(u) + 1) * H;
export const stepAngle = (i) => ST.start - (i - 0.5) * DT;                   // the middle of the i-th step (from 1)
// the turns of the stair that pass the angle th: { k, u, s } with s the walking surface
export function turnsAt(th) {
  const out = [];
  for (let k = 0; k * ST.perTurn <= ST.steps; k++) { const u = stepAt(th, k); if (u <= ST.steps) out.push({ k, u, s: rampAt(u) }); }
  return out;
}
// the landings: level with their steps, filling the well's half toward them
export const LANDINGS = T.landings.map((i) => { const th = stepAngle(i); return { step: i, top: F + i * H, th, dir: [Math.cos(th), Math.sin(th)] }; });
const onLanding = (x, z, l, m = 0) => Math.hypot(x, z) < RW + m && x * l.dir[0] + z * l.dir[1] > -m;
// where the stair's rail is open: beside each landing, where the stair is within a step and a half of its level
const railGap = (u) => T.landings.some((i) => u > i - 2 && u < i + 1);
const GAP = 1.5 * DT;                        // the same gap as an angle either side of a landing's middle
// the gallery: round the well at the top, but for the stair's last steps coming up through it
const galleryOver = (th) => { const u = stepAt(th, Math.floor(ST.steps / ST.perTurn)); return !(u >= ST.steps - T.opening && u <= ST.steps); };
// the arch over the ground door, and the dome's inside and outside at a distance r from the axis
export const doorTop = (x) => D.spring + Math.sqrt(Math.max(0, D.half * D.half - x * x));
export const domeAt = (r, grow = 0) => SPRING + Math.sqrt(Math.max(0, (T.dome.r + grow) ** 2 - r * r));
// the narrow windows: one over every few steps of the stair, a head's height over its tread
export const SLITS = [];
for (let i = T.slits; i < ST.steps - 2; i += T.slits) SLITS.push({ th: stepAngle(i), y: F + i * H + 1.25, half: 0.5, w: 0.12 });

const box = (x0, x1, z0, z1, y0, y1, part = '') => ({ x0, x1, z0, z1, y0, y1, part });
const [L1, L2] = LANDINGS;
// the things on the landings and the gallery: the desk and its lamp, the shelf of scrolls, the telescope; the armillary
// instrument hanging in the dome over the well
export const THINGS = [
  box(-0.75, 0.05, 0.55, 0.95, L1.top, L1.top + 0.76, 'desk'),
  box(-0.7, 0.2, 0.78, 1.06, L2.top, L2.top + 1.6, 'shelf'),
  box(1.61, 2.11, 0.33, 0.83, TOP, TOP + 1.35, 'telescope'),                  // in the gallery's far end, off the way to the ledge
  box(-0.6, 0.6, -0.6, 0.6, SPRING + 0.3, SPRING + 1.5, 'armillary'),
];
export const LAMP = [-0.55, L1.top + 0.76 + 0.22, 0.75];                      // the plasma lamp's flame, on the desk

// a world point in the tower's own frame, and back (b: { x, z, yaw }; its front faces +Z turned by yaw)
export function toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
export function toWorld(b, lx, lz) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); return [b.x + c * lx + s * lz, b.z - s * lx + c * lz]; }

// built facing whoever builds it, its door a stride and a half in front
export function placeTower(body, gap = 1.5) {
  const fx = Math.sin(body.yaw), fz = Math.cos(body.yaw), d = REACH_Z + gap;
  return { kind: 'tower', x: body.p[0] + fx * d, z: body.p[2] + fz * d, yaw: body.yaw + Math.PI, t: 0, down: -1 };
}
export const doorWorld = (b) => toWorld(b, 0, RO);

// the air inside: the shaft, and under the dome
export function inRoom(lx, y, lz, m = 0) {
  const r = Math.hypot(lx, lz);
  if (y <= F + m) return false;
  if (y < SPRING) return r < RI - m;
  return y < domeAt(r) - m && r < T.dome.r - m;
}
// INSIDE: a body's feet (at y) in the shaft or the dome's room
export function inside(b, x, z, y = 0) { const [lx, lz] = toLocal(b, x, z); return inRoom(lx, Math.max(y, F) + 0.05, lz); }

// the doorways through the shaft at +Z: the ground door (under its arch) and, at the top, the ledge's
const inGroundDoor = (x, z, y0, y1) => z > 0 && Math.abs(x) < D.half && y0 > F - 0.05 && y1 < doorTop(x) + 0.02;
const inLedgeDoor = (x, z, y0, y1) => z > 0 && Math.abs(x) < D.half && y0 > TOP - 0.05 && y1 < TOP + L.door + 0.02;

// What a body may not go into, and what it stands on. Worked round the axis: the shaft (pushed out of it to the side it
// was on, or along a doorway between its jambs); the stair (its ramp stood on, its slab a ceiling or a wall from below, its
// rail keeping a body on it and the well's side off it, but beside each landing); the landings and the gallery (floors,
// ceilings from below, a rail on each open edge); the dome (a head kept under it inside, stood on from above, kept out of
// from beside); the ledge; and the things, as boxes.
export function solve(b, p, was, rad = 0.3, tall = 1.7, stepUp = 0.35) {
  let [lx, lz] = toLocal(b, p[0], p[2]);
  const y = p[1];
  if (Math.hypot(lx, lz) > FOOT + rad + 0.6) return { p, floor: 0, ceiling: Infinity, hit: false, climb: null };
  const [wx, wz] = toLocal(b, was[0], was[2]), wy = was[1], wr = Math.hypot(wx, wz), lo = Math.max(y, wy);
  let floor = 0, ceiling = Infinity, hit = false;
  const head = y + tall;
  const setR = (r) => { const r0 = Math.hypot(lx, lz) || 1e-9; lx *= r / r0; lz *= r / r0; hit = true; };
  const roof = (top) => wy > SPRING && wy >= top - 0.05;          // whatever was over a surface up there stands on it

  // the dome from above, and the shaft's top round it
  const overDome = wr < T.dome.r + rad && roof(domeAt(Math.max(0, wr - rad * 0.5), 0.04));
  const overRim = wr >= T.dome.r - rad && wr < RO + rad && wy >= SPRING - 0.05 && !overDome;
  if (overDome) {
    floor = Math.max(floor, domeAt(Math.max(0, Math.hypot(lx, lz) - rad * 0.5), 0.04));
  } else {
    // ---- the shaft: a wall but in its doorways
    let r = Math.hypot(lx, lz);
    const insideBefore = wr < (RI + RO) / 2;
    const shaftTop = overRim ? -Infinity : SPRING;
    if (r + rad > RI && r - rad < RO && y < shaftTop && head > 0) {
      if (inGroundDoor(lx, lz, y, head) || inLedgeDoor(lx, lz, y, head)) {
        if (Math.abs(lx) > D.half - rad) { lx = Math.sign(lx) * (D.half - rad); hit = true; }          // between its jambs
        if (inGroundDoor(lx, lz, y, head)) ceiling = Math.min(ceiling, doorTop(Math.min(D.half, Math.abs(lx) + rad)));
        else ceiling = Math.min(ceiling, TOP + L.door);
      } else if (insideBefore) setR(RI - rad); else setR(RO + rad);
    }
    if (overRim) floor = Math.max(floor, SPRING);
    r = Math.hypot(lx, lz);
    const th = Math.atan2(lz, lx);

    if (r < RI + 0.05) {
      // ---- the stair: its turns at this angle; the one under the feet is stood on, those over the head are ceilings or walls
      const onBand = wr >= RW;
      for (const t of turnsAt(th)) {
        const under = t.s - ST.slab, spread = (rad / Math.max(r, 0.5)) / DT * H;            // how much the ramp changes across a body
        if (r + rad <= RW) {
          // in the well: the stair's inner edge (its slab and its rail) is a wall at its height, but where a landing meets it
          continue;
        }
        if (t.s <= lo + stepUp) {
          if (r > RW) floor = Math.max(floor, t.s);                                            // its middle over the stair
        } else if (under - spread >= wy + tall - 0.02) {
          ceiling = Math.min(ceiling, under - spread);
        } else if (under < head && t.s + ST.rail > y) {
          setR(Math.min(r, RW - rad));                                                           // under its low part: out into the well
        }
      }
      // the rail on the stair's inner edge (and the slab under it): it keeps a body on the stair on it, and one in the well
      // (or on a landing) off it, but beside each landing
      const r2 = Math.hypot(lx, lz);
      if (Math.abs(r2 - RW) < rad) {
        for (const t of turnsAt(th)) {
          const top = t.s + (railGap(t.u) ? 0 : ST.rail), bottom = t.s - ST.slab;
          if (top <= y + 0.02 || bottom >= head) continue;                                          // not at the body's height
          if (railGap(t.u) && t.s <= lo + stepUp) continue;                                          // level with it: step across
          if (onBand && t.s <= lo + stepUp) setR(RW + rad); else if (!onBand) setR(RW - rad);
          break;
        }
      }
      // the landings: floors where a body is over them, ceilings from below; a rail round each one's curved edge (but at the
      // stair's gap) and along its open edge
      for (const l of LANDINGS) {
        const rr = Math.hypot(lx, lz);
        if (Math.abs(rr - RW) < rad && lx * l.dir[0] + lz * l.dir[1] > 0 && l.top + ST.rail > y && l.top - 0.15 < head) {
          let off = Math.atan2(lz, lx) - l.th; off -= TAU * Math.round(off / TAU);
          if (Math.abs(off) > GAP) setR(onBand ? RW + rad : RW - rad);
        }
        const dot = lx * l.dir[0] + lz * l.dir[1];
        if (onLanding(lx, lz, l, rad)) {
          if (l.top <= lo + stepUp) floor = Math.max(floor, l.top);
          else if (l.top - 0.15 >= wy + tall - 0.02) ceiling = Math.min(ceiling, l.top - 0.15);
        }
        if (Math.abs(dot) < rad && Math.hypot(lx, lz) < RW + rad && l.top + ST.rail > y && l.top - 0.15 < head) {
          const side = wx * l.dir[0] + wz * l.dir[1] >= 0 ? 1 : -1, push = side * rad - dot;
          lx += l.dir[0] * push; lz += l.dir[1] * push; hit = true;
        }
      }
      // the gallery round the well at the top (but over the stair's last steps): a floor, a ceiling from below; its rail on
      // the well's edge
      const r3 = Math.hypot(lx, lz), th3 = Math.atan2(lz, lx);
      if (r3 + rad > RW && galleryOver(th3)) {
        if (TOP <= lo + stepUp) floor = Math.max(floor, TOP);
        else if (TOP - 0.15 >= wy + tall - 0.02) ceiling = Math.min(ceiling, TOP - 0.15);
      }
      if (Math.abs(r3 - RW) < rad && TOP + ST.rail > y && TOP - 0.15 < head && galleryOver(th3)) setR(onBand ? RW + rad : RW - rad);
      // under the dome: a head kept under it
      const r4 = Math.hypot(lx, lz);
      if (head > SPRING && !inLedgeDoor(lx, lz, y, head)) {
        const lim = Math.sqrt(Math.max(0, T.dome.r ** 2 - (head - SPRING) ** 2)) - rad;
        if (r4 > lim && lim > 0) setR(lim);
        ceiling = Math.min(ceiling, domeAt(Math.min(T.dome.r, Math.hypot(lx, lz) + rad)));
      }
    } else if (y > SPRING - 0.3 && y < CROWN && !inLedgeDoor(lx, lz, y, head)) {
      // outside, beside the dome (flying, or on the shaft's top round it): out of it the short way
      const lim = Math.sqrt(Math.max(0, T.dome.r ** 2 - Math.max(0, y - SPRING) ** 2)) + rad;
      if (Math.hypot(lx, lz) < lim) setR(lim);
    }

    // ---- the ledge outside the gallery's door: a floor, a ceiling from below, a rail along each side
    if (lz > RO - 0.3 - rad && lz < L.out + rad && Math.abs(lx) < L.half + rad) {
      if (TOP <= lo + stepUp) floor = Math.max(floor, TOP);
      else if (TOP - L.thick >= wy + tall - 0.02) ceiling = Math.min(ceiling, TOP - L.thick);
      else if (TOP > y && TOP - L.thick < head && lz > RO) { if (wz > L.out) lz = L.out + rad; else if (Math.abs(wx) >= L.half) lx = Math.sign(lx) * (L.half + rad); hit = true; }
    }
    for (const sx of [-1, 1]) {
      if (lz > RO && lz < L.out + rad && Math.abs(lx - sx * L.half) < rad && TOP + ST.rail > y && TOP < head) {
        lx = sx * L.half + (Math.abs(wx) < L.half ? -sx : sx) * rad; hit = true;
      }
    }
    // the ground floor and the plinth
    if (Math.hypot(lx, lz) < T.plinth + rad && F <= lo + stepUp) floor = Math.max(floor, F);
    // the things
    const tb = solveBoxes(THINGS, lx, lz, y, wy, rad, tall, stepUp);
    lx = tb.lx; lz = tb.lz; hit = hit || tb.hit;
    if (tb.floor > -Infinity) floor = Math.max(floor, tb.floor);
    ceiling = Math.min(ceiling, tb.ceiling);
  }
  const [x, z] = toWorld(b, lx, lz);
  return { p: [x, y, z], floor, ceiling, hit, climb: null };
}

// The shaft's face a body could run along (body.js): outside, its round wall; inside, the same wall from within (not in a
// doorway). Answers the face's outward way in the world (toward the body), and how near.
export function wall(b, p, rad = 0.3, reach = 0.22) {
  const [lx, lz] = toLocal(b, p[0], p[2]), r = Math.hypot(lx, lz), lo = p[1] + 0.5, hi = p[1] + 1.2;
  if (r < 1e-6 || hi > SPRING || lo < 0) return null;
  if (inGroundDoor(lx, lz, lo, hi) || inLedgeDoor(lx, lz, lo, hi)) return null;
  let d, out;
  if (r >= RO) { d = r - RO; out = 1; } else if (r <= RI) { d = RI - r; out = -1; } else return null;
  if (d > rad + reach) return null;
  const nx = (out * lx) / r, nz = (out * lz) / r, c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  return { d, n: [c * nx + sn * nz, -sn * nx + c * nz] };
}

// What of a point is solid to the eye: the shaft (not its doorways), the stair's slabs, the landings and the gallery, the
// dome's glass, the plinth, the ledge, the things.
export function solid(b, q, m = 0.15) {
  const [lx, lz] = toLocal(b, q[0], q[2]), y = q[1], r = Math.hypot(lx, lz), th = Math.atan2(lz, lx);
  if (y < -1 || r > FOOT + m) return false;
  if (r < T.plinth + m && y < F + m && (r > RI - m || y < F - 0.05)) return true;                  // the plinth, the floor's stone
  if (r > RI - m && r < RO + m && y < SPRING + m) {                                                 // the shaft
    if (!(inGroundDoor(lx, lz, y + m, y - m) && Math.abs(lx) < D.half - m) && !(inLedgeDoor(lx, lz, y + m, y - m) && Math.abs(lx) < D.half - m)) return true;
  }
  if (y >= SPRING - m && Math.abs(r - Math.sqrt(Math.max(0, T.dome.r ** 2 - (y - SPRING) ** 2))) < m + 0.04 && !inLedgeDoor(lx, lz, y, y)) return true;   // the glass
  if (r > RW - m && r < RI) for (const t of turnsAt(th)) if (y > t.s - ST.slab - m && y < t.s + m) return true;      // the stair
  for (const l of LANDINGS) if (onLanding(lx, lz, l, m) && y > l.top - 0.15 - m && y < l.top + m) return true;
  if (r > RW - m && r < RI && galleryOver(th) && y > TOP - 0.15 - m && y < TOP + m) return true;
  if (lz > RO - 0.3 && lz < L.out + m && Math.abs(lx) < L.half + m && y > TOP - L.thick - m && y < TOP + m) return true;   // the ledge
  for (const s of THINGS) if (inBox(s, lx, y, lz, m * 0.5)) return true;
  return false;
}
// Where the eye may stand, looking at a body from `from` toward `to`: a body inside keeps the eye inside with it (its
// door is narrow, as the house's is); elsewhere it is kept out of what is solid.
export function eyeRoom(b, from, to, m = 0.15) {
  const [fx, fz] = toLocal(b, from[0], from[2]), roomed = inRoom(fx, from[1], fz, m);
  const bad = roomed ? (q) => { const [lx, lz] = toLocal(b, q[0], q[2]); return !inRoom(lx, q[1], lz, m) || solid(b, q, m); } : (q) => solid(b, q, m);
  const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  let lo = 0, hi = 1, found = false;
  for (let i = 1; i <= 40; i++) { const t = i / 40; if (bad(at(t))) { hi = t; lo = (i - 1) / 40; found = true; break; } }
  if (!found) return 1;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (bad(at(mid))) hi = mid; else lo = mid; }
  return lo;
}

// The sun inside: from a point in the shaft, toward the sun (a unit vector, up positive), does the ray leave by a narrow
// window, a doorway, or up through the dome's glass, the landings, the gallery and the stair not in its way? 1 lit, 0 not.
export function sunIn(b, x, y, z, sun, doorOpen = 1) {
  if (sun[1] <= 0) return 0;
  const [lx, lz] = toLocal(b, x, z), c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return sunLocal(lx, y, lz, [c * sun[0] - s * sun[2], sun[1], s * sun[0] + c * sun[2]], doorOpen);
}
// where a ray from (x, z) along (dx, dz) meets the circle of radius R from inside (t), or Infinity
const outOf = (x, z, dx, dz, R) => { const a = dx * dx + dz * dz; if (a < 1e-12) return Infinity; const bq = x * dx + z * dz, c = x * x + z * z - R * R; return (-bq + Math.sqrt(Math.max(0, bq * bq - a * c))) / a; };
export function sunLocal(lx, y, lz, d, doorOpen = 1) {
  if (d[1] <= 0) return 0;
  // where it leaves the shaft's side, or reaches the dome's spring
  const tw = outOf(lx, lz, d[0], d[2], RI), tu = (SPRING - y) / d[1], t = Math.min(tw, tu);
  // what is in its way inside: the landings, the gallery, the stair (its surfaces crossed, a step at a time)
  for (const l of LANDINGS) for (const h of [l.top, l.top - 0.15]) { const th = (h - y) / d[1]; if (th > 0 && th < t && onLanding(lx + d[0] * th, lz + d[2] * th, l)) return 0; }
  for (const h of [TOP, TOP - 0.15]) { const tg = (h - y) / d[1]; if (tg > 0 && tg < t) { const gx = lx + d[0] * tg, gz = lz + d[2] * tg, gr = Math.hypot(gx, gz); if (gr > RW && gr < RI && galleryOver(Math.atan2(gz, gx))) return 0; } }
  // (the ramp is up to a tenth of a metre off the drawn treads: the slab is taken a little thinner, and the ray's first
  // 0.35 m, where it leaves the surface it starts on, is not looked at)
  let prev = null, thu = Math.atan2(lz, lx), last = thu;
  const N = 24, t0 = Math.min(0.35, t);
  for (let i = 0; i <= N; i++) {
    const ti = t0 + ((t - t0) * i) / N, px = lx + d[0] * ti, pz = lz + d[2] * ti, py = y + d[1] * ti, a = Math.atan2(pz, px);
    let da = a - last; da -= TAU * Math.round(da / TAU); thu += da; last = a;
    const q = (py - F - H / 2) / H - (ST.start - thu) / DT, pr = Math.hypot(px, pz);
    const band = pr > RW && pr < RI && py > F + H && py < TOP;
    const cell = Math.floor(q / ST.perTurn), inSlab = q - cell * ST.perTurn > ST.perTurn - ST.slab / H + 0.6 && q - cell * ST.perTurn < ST.perTurn - 0.6;
    if (band && (inSlab || (prev !== null && prev.band && cell !== prev.cell))) return 0;
    prev = { cell, band };
  }
  if (t === tu) return 1;                                                                 // up through the dome's glass
  // out through the shaft's side: a narrow window, or a doorway
  const ex = lx + d[0] * t, ez = lz + d[2] * t, ey = y + d[1] * t;
  if (inGroundDoor(ex, ez, ey, ey)) return doorOpen;
  if (inLedgeDoor(ex, ez, ey, ey)) return 1;
  const to = outOf(lx, lz, d[0], d[2], RO), ox = lx + d[0] * to, oz = lz + d[2] * to, oy = y + d[1] * to;
  for (const w of SLITS) {
    const off = (x, z, R) => { let a = Math.atan2(z, x) - w.th; a -= TAU * Math.round(a / TAU); return Math.abs(a) * R; };
    if (Math.abs(ey - w.y) < w.half && Math.abs(oy - w.y) < w.half && off(ex, ez, RI) < w.w && off(ox, oz, RO) < w.w) return 1;
  }
  return 0;
}

// How it goes up: the plinth, the shaft and its stair (course by course), the floors (the landings, the gallery, the
// ledge), the dome (its ribs, then its glass), the things. Taken down, it goes the same way backward.
export function phase(b) {
  const B = T.build, k = (a, z, t) => Math.max(0, Math.min(1, (t - a) / (z - a)));
  const t = b.down >= 0 ? B.done * (1 - Math.min(1, b.down / B.down)) : b.t;
  return { base: k(0, B.base, t), walls: k(B.base, B.walls, t), floors: k(B.walls, B.floors, t), dome: k(B.floors, B.dome, t), rest: k(B.dome, B.done, t), gone: b.down >= B.down };
}
// what it rests on is dry ground: its plinth
export const dry = (b, x, z) => { const [lx, lz] = toLocal(b, x, z); return Math.hypot(lx, lz) < T.plinth; };
