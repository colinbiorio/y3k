// solids.js — A BODY AGAINST BOXES, in a building's own frame. No page, no
// three. A body is an upright cylinder (radius `rad`, height `tall`, its feet
// at y); a box is { x0, x1, z0, z1, y0, y1 }. For each box the body touches
// across the ground, where the body was a step ago says what the box is to it:
//
//   · its top was under the feet (or no more than a step above them): a floor;
//   · its underside was over the head: a ceiling;
//   · else a wall: the body is pushed out of it, the shortest way across the
//     ground (a corner between two walls: out of each in turn).
//
// Answers the box-world's say: where the body may be (lx, lz), the highest floor
// under it, the lowest ceiling over it, and whether a wall was met.
export function solveBoxes(boxes, lx, lz, y, wasY, rad, tall, stepUp) {
  let floor = -Infinity, ceiling = Infinity, hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(lx, b.x1)), cz = Math.max(b.z0, Math.min(lz, b.z1));
      const dx = lx - cx, dz = lz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad - 1e-9) continue;                                   // not touching
      if (b.y1 <= Math.max(y, wasY) + stepUp + 1e-6) { if (pass === 0) floor = Math.max(floor, b.y1); continue; }
      if (b.y0 >= wasY + tall - 0.02) { if (pass === 0) ceiling = Math.min(ceiling, b.y0); continue; }
      if (b.y1 <= y || b.y0 >= y + tall) continue;                            // beside it, but not at its height
      // a wall. Its centre inside the box: out by the nearest face; else out along the line from the box to it
      if (d2 < 1e-12) {
        const outs = [[lx - b.x0, -1, 0], [b.x1 - lx, 1, 0], [lz - b.z0, 0, -1], [b.z1 - lz, 0, 1]].sort((p, q) => p[0] - q[0]);
        const [depth, ox, oz] = outs[0];
        lx += ox * (depth + rad); lz += oz * (depth + rad);
      } else {
        const d = Math.sqrt(d2), k = (rad - d) / d;
        lx += dx * k; lz += dz * k;
      }
      hit = moved = true;
    }
    if (!moved) break;
  }
  return { lx, lz, floor, ceiling, hit };
}

// whether a point is inside a box (grown by m)
export const inBox = (b, x, y, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m && y > b.y0 - m && y < b.y1 + m;

// where a ray from (x, y, z) along d leaves a box it is in, or enters one it is not: the slab method. Answers t, or Infinity.
export function rayBox(b, o, d) {
  let t0 = -Infinity, t1 = Infinity;
  for (const [lo, hi, oi, di] of [[b.x0, b.x1, o[0], d[0]], [b.y0, b.y1, o[1], d[1]], [b.z0, b.z1, o[2], d[2]]]) {
    if (Math.abs(di) < 1e-12) { if (oi < lo || oi > hi) return Infinity; continue; }
    let a = (lo - oi) / di, c = (hi - oi) / di;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return Infinity;
  }
  return t1 < 0 ? Infinity : t0 > 0 ? t0 : t1;
}
