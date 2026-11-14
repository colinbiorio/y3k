// gait.js — HOW A BODY CARRIES ITSELF: its pose, in numbers, from how it is
// moving. No page, no three; figure.js lays these numbers on a figure.
//
// Nothing here is a recorded animation. A stride is arithmetic: the feet come
// down as often as the speed asks (cadence), a foot on the floor goes back
// under the body as fast as the body goes forward and comes forward again
// through the air, and each leg's two bones are bent to put the ankle where
// the stride says (legIK, the law of cosines). In the air the knees come up
// and the arms go out; a landing is taken in the knees; a dash throws the
// body along its line; flying, it lies down into its speed. The four are
// blended by how much of each the body is doing, so nothing snaps.
//
// A pose: pelvis (the hips' height over the feet), tilt (the whole body
// pitched about its middle), lean and twist (the chest), head, two arms
// { swing, out, elbow }, two legs { z, y, foot } (where the ankle is from the
// hip, ahead and above; and the foot's own pitch, toes down), the cape's lift.
// The figure faces +Z, so its left is +X.

export const BUILD = { thigh: 0.44, shin: 0.44, ankle: 0.08, hip: 0.095, stand: 0.945, pivot: 0.95 };

const mix = (a, b, t) => a + (b - a) * t;
const sat = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// The thigh's swing forward and the knee's bend that put the ankle at (z ahead,
// y above) the hip. A place out of reach is reached toward with a straight leg.
export function legIK(z, y, l1 = BUILD.thigh, l2 = BUILD.shin) {
  const d = Math.min(l1 + l2 - 0.004, Math.max(Math.abs(l1 - l2) + 0.12, Math.hypot(z, y)));
  const knee = Math.PI - Math.acos((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2));
  const off = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  return { thigh: Math.atan2(z, -y) + off, knee };
}
// where that puts the ankle (the check on legIK, and the footfall's place)
export function ankleOf(thigh, knee, l1 = BUILD.thigh, l2 = BUILD.shin) {
  return { z: l1 * Math.sin(thigh) + l2 * Math.sin(thigh - knee), y: -l1 * Math.cos(thigh) - l2 * Math.cos(thigh - knee) };
}

// strides a second at a speed (a stride is two steps): 0.96 walking, 1.45 running, 1.83 at a sprint
export const cadence = (v) => 0.75 + 0.125 * v;

export function createGait() {
  return { phase: 0, speed: 0, vy: 0, w: { ground: 1, air: 0, dash: 0, fly: 0 }, crouch: 0, cape: 0.1, capeV: 0, t: 0 };
}

function groundPose(g, v) {
  const move = sat(v / 1.2), run = smooth(2.2, 5.2, v), ph = g.phase;
  const pelvis = BUILD.stand - 0.012 * v - (0.010 + 0.005 * v) * move * (0.5 + 0.5 * Math.cos(4 * Math.PI * ph)) + 0.004 * Math.sin(1.3 * g.t) * (1 - move);
  const drop = pelvis - BUILD.ankle, max = BUILD.thigh + BUILD.shin - 0.004;
  const reach = Math.sqrt(Math.max(0, max * max - drop * drop));
  const a = Math.min(0.94 * reach, 0.14 + 0.065 * v) * move;          // half a step, as far as the leg allows
  const duty = mix(0.62, 0.3, run), lift = (0.05 + 0.04 * v) * move;  // how much of a stride a foot is down; how high it is carried
  const leg = (psi) => {
    if (psi < duty) {                                                 // down: under the body and back, heel first, off the toe
      const u = psi / duty, off = smooth(0.72, 1, u) * move;
      return { z: a * (1 - 2 * u), y: -drop + 0.05 * off, foot: 0.55 * off - 0.22 * (1 - smooth(0, 0.18, u)) * move };
    }
    const s = (psi - duty) / (1 - duty), k = Math.sin(Math.PI * s);  // up: forward through the air
    return { z: -a + a * (1 - Math.cos(Math.PI * s)) - 0.1 * run * k * (1 - s), y: -drop + lift * Math.pow(k, 0.8), foot: (0.5 * (1 - s) * k - 0.22 * smooth(0.8, 1, s)) * move };
  };
  const c = Math.cos(2 * Math.PI * ph), A = (0.22 + 0.11 * v) * move, lean = 0.02 + 0.036 * v;
  return {
    pelvis, tilt: 0, lean, twist: (0.07 + 0.07 * run) * c * move, head: -0.6 * lean,
    armL: { swing: -A * c, out: 0.07 + 0.05 * run, elbow: 0.2 + 1.15 * run + 0.25 * sat(-c) * move },
    armR: { swing: A * c, out: 0.07 + 0.05 * run, elbow: 0.2 + 1.15 * run + 0.25 * sat(c) * move },
    legL: leg(ph), legR: leg((ph + 0.5) % 1), cape: Math.min(1.15, 0.08 + 0.1 * v), step: a,
  };
}
function airPose(vy) {
  const up = sat(0.5 + vy / 7);                                       // 1 rising, 0 falling
  return {
    pelvis: BUILD.stand, tilt: 0, lean: mix(-0.04, 0.14, up), twist: 0, head: mix(0.12, -0.1, up),
    armL: { swing: mix(0.35, -0.55, up), out: mix(0.95, 0.3, up), elbow: mix(0.45, 0.8, up) },
    armR: { swing: mix(0.35, 0.95, up), out: mix(0.95, 0.25, up), elbow: mix(0.45, 0.95, up) },
    legL: { z: mix(0.1, 0.24, up), y: mix(-0.8, -0.6, up), foot: mix(0.35, 0.1, up) },
    legR: { z: mix(-0.06, -0.18, up), y: mix(-0.84, -0.8, up), foot: mix(0.45, 0.6, up) },
    cape: mix(1.2, 0.45, up), step: 0,
  };
}
const DASH = {
  pelvis: 0.86, tilt: 0.42, lean: 0.5, twist: 0.25, head: -0.45,
  armL: { swing: -1.15, out: 0.3, elbow: 0.25 }, armR: { swing: -0.95, out: 0.35, elbow: 0.35 },
  legL: { z: -0.3, y: -0.7, foot: 0.7 }, legR: { z: 0.22, y: -0.66, foot: 0.2 }, cape: 1.4, step: 0,
};
function flyPose(g, h, vy) {
  const glide = smooth(2, 13, h);                                     // 0 hovering upright, 1 lying into its speed
  const sink = 0.2 * sat(-vy / 8);
  return {
    pelvis: BUILD.stand + 0.035 * Math.sin(1.7 * g.t) * (1 - glide), tilt: 1.22 * glide, lean: -0.22 * glide, twist: 0, head: mix(0, -0.62, glide),
    armL: { swing: mix(0.05, -0.3, glide), out: mix(0.38, 0.2, glide) + sink, elbow: mix(0.4, 0.12, glide) },
    armR: { swing: mix(0.08, -0.26, glide), out: mix(0.34, 0.22, glide) + sink, elbow: mix(0.45, 0.14, glide) },
    legL: { z: mix(0.07, -0.05, glide), y: mix(-0.8, -0.872, glide), foot: mix(0.45, 1.0, glide) },
    legR: { z: mix(-0.03, -0.09, glide), y: mix(-0.86, -0.874, glide), foot: mix(0.5, 1.0, glide) },
    cape: mix(0.2, 0.3, glide), step: 0,
  };
}
const PARTS = ['armL', 'armR', 'legL', 'legR'];
function blend(poses, w) {
  const out = {};
  for (const k of ['pelvis', 'tilt', 'lean', 'twist', 'head', 'cape', 'step']) out[k] = poses.reduce((s, p, i) => s + p[k] * w[i], 0);
  for (const part of PARTS) { out[part] = {}; for (const k of Object.keys(poses[0][part])) out[part][k] = poses.reduce((s, p, i) => s + p[part][k] * w[i], 0); }
  return out;
}

// What the body is doing, of the four.
export const stateOf = (body) => (body.flying ? 'fly' : body.dashT > 0 ? 'dash' : !body.grounded ? 'air' : 'ground');

// A landing at `speed` m/s: the knees take it.
export function land(g, speed) { g.crouch = Math.min(0.3, Math.max(g.crouch, 0.04 * speed)); }

// One frame of carriage. Answers the pose, with `footfalls`: where a foot came
// down this frame, in the body's own frame ([x to its left, z ahead]).
export function stepGait(g, body, dt) {
  g.t += dt;
  const h = Math.hypot(body.v[0], body.v[2]), state = stateOf(body);
  g.speed += (h - g.speed) * (1 - Math.exp(-12 * dt));
  g.vy += (body.v[1] - g.vy) * (1 - Math.exp(-14 * dt));
  let sum = 0;
  for (const k of Object.keys(g.w)) { g.w[k] += ((k === state ? 1 : 0) - g.w[k]) * (1 - Math.exp(-(state === 'dash' || k === 'dash' ? 20 : 11) * dt)); sum += g.w[k]; }
  for (const k of Object.keys(g.w)) g.w[k] /= sum;
  const footfalls = [];
  if (state === 'ground' && g.speed > 0.15) {
    const was = g.phase;
    g.phase = (g.phase + cadence(g.speed) * dt) % 1;
    if (g.phase < was) footfalls.push(1); else if (was < 0.5 && g.phase >= 0.5) footfalls.push(-1);   // the left as the stride turns over, the right at its half
  }
  const pose = blend([groundPose(g, g.speed), airPose(g.vy), DASH, flyPose(g, h, body.v[1])], [g.w.ground, g.w.air, g.w.dash, g.w.fly]);
  g.crouch *= Math.exp(-8 * dt);
  pose.pelvis -= g.crouch; pose.lean += 0.6 * g.crouch;
  // the cape goes after its place like a weight on a spring, and flutters at speed
  const want = pose.cape + 0.05 * Math.sin(9 * g.t) * sat(g.speed / 6);
  g.capeV += ((want - g.cape) * 60 - g.capeV * 11) * Math.min(dt, 0.05);
  g.cape += g.capeV * Math.min(dt, 0.05);
  pose.cape = g.cape;
  pose.footfalls = footfalls.map((side) => [side * BUILD.hip, pose.step]);
  pose.state = state;
  return pose;
}
