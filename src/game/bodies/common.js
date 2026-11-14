// common.js — WHAT EVERY BODY IS MADE WITH, whatever it stands on: a bone,
// sections made wider, the parts of it that cloth can feel, what goes with
// the origin when it is moved, and the one face all five show the void
// (../figure.js).
import * as THREE from 'three';
import { WATER } from '../body.js';
import { mirrored } from '../shape.js';

const v = new THREE.Vector3();
// sections made wider and deeper, or squarer; a shape made for the left, for either side
export const wide = (st, kw, kd = kw) => st.map(([y, w, d, z = 0, e = 2, x = 0]) => [y, w * kw, d === undefined ? undefined : Array.isArray(d) ? [d[0] * kd, d[1] * kd] : d * kd, z * kd, e, x * kw]);
export const squared = (st, e) => st.map(([y, w, d, z = 0, , x = 0]) => [y, w, d, z, e, x]);
export const sided = (side, geo) => (side > 0 ? geo : mirrored(geo));
// how wide an oval is at a height (0 at its ends, 1 across its middle)
export const oval = (v, k = 0.7) => Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2)) ** k;
export const node = (parent, at = [0, 0, 0]) => { const n = new THREE.Group(); n.position.set(at[0], at[1], at[2]); parent.add(n); return n; };

// The parts of a body as cloth feels them: capsules, each between a point on one bone and a point on
// another. `s` is how much bigger the body is drawn than it was measured.
export function capsules(s = 1) {
  const caps = [];
  return {
    capsule(a, pa, b, pb, r) { const c = { a: [0, 0, 0], b: [0, 0, 0], r: r * s, A: a, pa, B: b, pb }; caps.push(c); return c; },
    shapes() {
      for (const c of caps) {
        v.set(c.pa[0], c.pa[1], c.pa[2]).applyMatrix4(c.A.matrixWorld); c.a[0] = v.x; c.a[1] = v.y; c.a[2] = v.z;
        v.set(c.pb[0], c.pb[1], c.pb[2]).applyMatrix4(c.B.matrixWorld); c.b[0] = v.x; c.b[1] = v.y; c.b[2] = v.z;
      }
      return caps;
    },
  };
}

// What lives in the world's numbers ({ shift(dx, dy, dz) }) and must go with the origin when it is moved
// under the body. `moved(at, dt)`, each frame, sees the body put somewhere without having gone there.
export function carried() {
  const world = [], last = [0, 0, 0];
  let had = false;
  return {
    world,
    moved(at, dt) {
      const dx = at[0] - last[0], dy = at[1] - last[1], dz = at[2] - last[2];
      if (had && (dx || dy || dz) && (dt <= 0 || Math.hypot(dx, dy, dz) > 2 + 80 * dt)) for (const w of world) w.shift(dx, dy, dz);
      last[0] = at[0]; last[1] = at[1]; last[2] = at[2]; had = true;
    },
  };
}

// What every body answers to (../figure.js): a rig, what is drawn on it (a kit), how high its eyes are, and
// its cloths ([{ cloth, stiff, free }]: `free` ones are not pushed out of the body); `frame(dt, pose)` is
// whatever else it does each frame, once its cloths have moved.
export function bodyOf(rig, K, { eye, cloths = [], frame = null }) {
  for (const c of cloths) rig.world.push(c.cloth);
  const floor = WATER + 0.012;
  return {
    group: rig.group, gait: rig.gait, look: eye * rig.scale,
    // how much of the sky it keeps off the water under it (1: a body; less: one the light goes through)
    shade: rig.shade ?? 1,
    // a landing at `speed`: the knees take it
    land(speed) { rig.land(speed); },
    // the void's own light, wrapped round the body: more of it in the dark
    setEnv(k) { K.each((m) => { if ('envMapIntensity' in m) m.envMapIntensity = k; }); },
    // one frame. Answers where a foot came down, in the world ([x, z]). `at` is where the body is drawn (body.js, shown)
    update(body, dt, at = body.p) {
      const p = rig.step(body, dt, at);
      if (cloths.length) { const shapes = rig.shapes(); for (const c of cloths) c.cloth.step(dt, c.free ? [] : shapes, floor, c.stiff); }
      if (frame) frame(dt, p);
      return p.falls;
    },
    dispose() { K.dispose(); },
  };
}
