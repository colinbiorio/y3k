// biped.js — THE BONES OF A BODY ON TWO LEGS, and the stride laid on them
// each frame (../gait.js says the pose; this puts it on joints). The human,
// the robot and the mantis are each drawn on one of these.
//
//   group            never moves (cloth lives in it, in the world's numbers)
//   └ rig            where the body is, turned to its heading, at its size
//     └ tilt         the whole body pitched about its middle (a dash, flight)
//       └ hips       swayed, tipped and turned over the foot that is down
//         ├ leg × 2  hip → knee → ankle: placed so the ankle is where the
//         │          stride says, whatever the hips are doing
//         └ torso    leaning, turned against the hips, banked into a turn
//           ├ arm × 2  shoulder → elbow → hand
//           └ head
//
// A body drawn bigger or smaller than it was measured (`scale`) strides as
// its own legs would: the stride is told a speed in its own lengths, so its
// feet still stay where they are put.
import * as THREE from 'three';
import { createGait, stepGait, legIK, fromHip, land } from '../gait.js';
import { node, capsules, carried } from './common.js';

const X = new THREE.Vector3(1, 0, 0), q = new THREE.Quaternion(), qf = new THREE.Quaternion();
export function createBiped({ build, scale = 1, waist = 0.07, shoulder = [0.186, 0.4, 0], upper = 0.29, fore = 0.26, neck = [0, 0.505, -0.005] } = {}) {
  const gait = createGait(build), B = gait.build, s = scale;
  const group = new THREE.Group(), rig = node(group); rig.scale.setScalar(s);
  const tilt = node(rig, [0, B.pivot, 0]), hips = node(tilt), torso = node(hips, [0, waist, 0]), head = node(torso, neck);
  const leg = (side) => { const hip = node(hips, [side * B.hip, 0, 0]), knee = node(hip, [0, -B.thigh, 0]), ankle = node(knee, [0, -B.shin, 0]); hip.rotation.order = 'ZXY'; return { hip, knee, ankle, side }; };
  const arm = (side) => { const sh = node(torso, [side * shoulder[0], shoulder[1], shoulder[2]]), elbow = node(sh, [0, -upper, 0]), hand = node(elbow, [0, -fore, 0]); return { shoulder: sh, elbow, hand, side }; };
  const legs = [leg(1), leg(-1)], arms = [arm(1), arm(-1)];
  const told = { v: [0, 0, 0], yaw: 0, flying: false, dashT: 0, grounded: true }, felt = capsules(s), held = carried();
  const self = {
    group, rig, tilt, hips, torso, head, legs, arms, gait, build: B, scale: s,
    // what lives in the world's numbers; the parts of the body as cloth feels them (./common.js)
    world: held.world, capsule: felt.capsule, shapes: felt.shapes,
    land(speed) { land(gait, speed / s); },
    // One frame: the pose, laid on the bones, and every bone's place in the world made current. Answers the
    // pose, with `falls`: where a foot came down this frame, in the world ([x, z]).
    step(body, dt, at) {
      told.v[0] = body.v[0] / s; told.v[1] = body.v[1] / s; told.v[2] = body.v[2] / s;
      told.yaw = body.yaw; told.flying = body.flying; told.dashT = body.dashT; told.grounded = body.grounded;
      const p = stepGait(gait, told, dt);
      held.moved(at, dt);
      rig.position.set(at[0], at[1], at[2]); rig.rotation.y = body.yaw;
      tilt.rotation.set(p.tilt, 0, -p.bankAll);
      hips.position.set(p.sway, p.pelvis - B.pivot, 0); hips.rotation.set(0, p.hipYaw, p.roll);
      torso.rotation.set(p.lean, p.twist, -p.bank - 0.8 * p.roll);
      head.rotation.set(p.head, -0.8 * (p.twist + p.hipYaw), 0.4 * p.bank);
      for (const l of legs) {
        const t = fromHip(p, l.side, B), f = l.side > 0 ? p.legL : p.legR;
        const k = legIK(t.z, -Math.hypot(t.x, t.y), B.thigh, B.shin, B.knee);
        l.hip.rotation.set(-k.thigh, 0, Math.atan2(t.x, -t.y));
        l.knee.rotation.x = k.knee;
        // the foot keeps to the floor and to the body's heading whatever the leg above it is doing, and then has its own pitch
        q.copy(hips.quaternion).multiply(l.hip.quaternion).multiply(l.knee.quaternion).invert();
        l.ankle.quaternion.copy(q).multiply(qf.setFromAxisAngle(X, f.foot));
      }
      for (const a of arms) { const m = a.side > 0 ? p.armL : p.armR; a.shoulder.rotation.set(-m.swing, 0, a.side * m.out); a.elbow.rotation.x = -m.elbow; }
      if (self.after) self.after(p, body, dt);
      rig.updateMatrixWorld(true);
      const sn = Math.sin(body.yaw), cs = Math.cos(body.yaw);
      p.falls = p.footfalls.map(([x, z]) => [at[0] + s * (x * cs + z * sn), at[2] + s * (-x * sn + z * cs)]);
      return p;
    },
    // what a body does with its own bones once the stride is on them (arms held up, wings opened): (pose, body, dt)
    after: null,
  };
  return self;
}
