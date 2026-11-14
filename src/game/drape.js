// drape.js — HOW A POINT OF CLOTH LEAVES A LIMB IT HAS GOT INTO. No page, no
// three; ./shape.js's cloth asks this of every point and every limb, each frame.
//
// A limb is a capsule { a, b, r } in the world's numbers: everything within r
// of the line from a to b. A point inside one is put on its surface.
//
// By the nearest way, if nothing else is said. That is right for a sash or a
// strand of hair. It is wrong for a skirt: a knee lifted into the front of a
// skirt is nearer to its underside than to its top, so the cloth is put under
// the knee, and THE KNEE COMES THROUGH THE SKIRT (seen 14 Nov 2026: a closed
// skirt, a run, the forward leg outside it).
//
// So a garment may say WHICH WAY IS OUT (one direction for each of its
// columns: a skirt's front is out to the front, its back to the back). Its
// point is then put on that side of the limb, whichever side it fell on: over
// the knee, and never under it. Beside the limb's length only what lies across
// the limb counts, so the point is not slid along it; at its two round ends
// the whole direction does.
//
// P: the points, x y z in turn. o: where this point is in P. O: the ways out,
// or null. c: where this point's way out is in O. Says whether it moved it.
export function leave(P, o, sh, O = null, c = 0) {
  const ax = sh.a[0], ay = sh.a[1], az = sh.a[2], ex = sh.b[0] - ax, ey = sh.b[1] - ay, ez = sh.b[2] - az, ee = ex * ex + ey * ey + ez * ez;
  const t = ee > 1e-9 ? Math.min(1, Math.max(0, ((P[o] - ax) * ex + (P[o + 1] - ay) * ey + (P[o + 2] - az) * ez) / ee)) : 0;
  let dx = P[o] - ax - ex * t, dy = P[o + 1] - ay - ey * t, dz = P[o + 2] - az - ez * t;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= sh.r * sh.r || d2 < 1e-10) return false;
  if (O) {
    let ox = O[c], oy = O[c + 1], oz = O[c + 2];
    if (t > 0 && t < 1) { const along = (ox * ex + oy * ey + oz * ez) / ee; ox -= ex * along; oy -= ey * along; oz -= ez * along; }
    const ol = ox * ox + oy * oy + oz * oz, side = dx * ox + dy * oy + dz * oz;
    if (ol > 0.01 && side < 0) { const m = 2 * side / ol; dx -= ox * m; dy -= oy * m; dz -= oz * m; }       // on the inner side: across to the outer
  }
  const g = sh.r / Math.sqrt(d2);
  P[o] = ax + ex * t + dx * g; P[o + 1] = ay + ey * t + dy * g; P[o + 2] = az + ez * t + dz * g;
  return true;
}
