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
export function bodyOf(rig, K, { eye, cloths = [], frame = null, grip = [0.03, -0.068, 0], hand = rig.arms?.[1]?.hand, at = null, fist = null }) {
  for (const c of cloths) rig.world.push(c.cloth);
  const floor = WATER + 0.012;
  // the fist: where a haft passes through the right hand, in the hand's own frame (fingers -y, thumb +z, palm +x);
  // a body that holds otherwise (the octopus, in the tip of an arm) gives its own
  at ||= hand ? node(hand, grip) : node(rig.group);
  let shut = false;
  return {
    group: rig.group, gait: rig.gait, look: eye * rig.scale, grip: at,
    // what the fight asks of the right arm (holdArm, below), and whether the fingers close on what it holds
    hold(h) { rig.hold = h; const s = !!(h && h.closed); if (s !== shut) { shut = s; fist?.(s); } },
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

// THE HAND THAT HOLDS (Colin, 19 Nov 2026: "it'd be nice if the character actually held the weapon in its hand instead of
// just rendering it close to their hand"). What the fight asks of a body's right arm (../view.js sets `hold`):
//   carry  0..1  the forearm brought forward and the fist upright, as a torch or a bell is carried
//   reach  0..1  the arm put out along `aim` (a direction in the world), as a bow is drawn or a flame sent
//   lift   0..1  the arm raised a little more (a bell rung, a ring spun up)
//   closed       the fingers closed (a body with fingers of its own shows its fist)
// laid over whatever the stride had the arm doing: a shoulder (rotated about its own parent's frame, the arm hanging
// along its -y) and the elbow (bent about x). `parentQ` is the shoulder's parent's world turn, `rest` the stride's own.
export const CARRY = { pitch: 0.42, out: 0.16, elbow: 1.08, swing: 0.25 };            // the forearm a little over level: what it holds stands up, leaning a little ahead
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), EA = new THREE.Euler();
export function holdArm(shoulder, elbow, side, hold, parentQ) {
  if (!hold || (!hold.carry && !hold.reach)) return;
  const c = hold.carry || 0, r = hold.reach || 0, l = hold.lift || 0;
  // the carry: what the stride did, mostly let go of; the forearm forward and up
  const sx = shoulder.rotation.x, sz = shoulder.rotation.z, ex = elbow.rotation.x;
  EA.set(sx * (1 - c * (1 - CARRY.swing)) - c * (CARRY.pitch + 0.5 * l), 0, sz * (1 - c) + c * side * CARRY.out);   // (a side's own out: away from the body)
  qa.setFromEuler(EA);
  let bend = ex * (1 - c) - c * (CARRY.elbow - 0.35 * l);
  if (r > 0 && hold.aim) {
    // the reach: the arm along the aim, in the shoulder's parent's frame; the elbow nearly straight
    va.set(hold.aim[0], hold.aim[1], hold.aim[2]).normalize().applyQuaternion(qb.copy(parentQ).invert());
    qb.setFromUnitVectors(DOWN, va);
    qa.slerp(qb, r);
    bend = bend * (1 - r) - 0.12 * r;
  }
  shoulder.quaternion.copy(qa);
  elbow.rotation.x = bend;
}

