// gait.js — HOW A BODY ON TWO LEGS CARRIES ITSELF: its pose, in numbers, from
// how it is moving. No page, no three; the bodies in ./bodies/ lay these
// numbers on bones.
//
// Nothing here is a recorded animation. A stride is arithmetic, and its first
// law is that A FOOT ON THE FLOOR STAYS WHERE IT WAS PUT: while it is down it
// goes back under the body exactly as fast as the body goes forward, so the
// feet come down as often as that takes (cadence = speed x duty / travel, the
// share of a stride a foot is down over how far the body goes on it). The
// heel comes down first; late in its time down the heel lifts and the foot
// turns about its ball, which is what lets a leg reach behind. The hips ride
// as high as both legs can reach, and no higher: a walk's rise over each
// planted foot falls out of that, and is not drawn. Running, both
// feet leave the floor and the hips bounce between them. The hips turn, tip
// and shift over the foot that is down; the chest turns against them.
//
// In the air the knees come up and the arms go out; a landing is taken in the
// knees; a dash throws the body along its line; flying, it lies down into its
// speed. The four are blended by how much of each the body is doing.
//
// A pose: pelvis (the hips' height over the floor), sway, roll and hipYaw
// (the hips', sideways, tipped, turned), tilt (the whole body pitched about
// its middle), lean and twist (the chest), bank and bankAll (into a turn: the
// chest's lean, and the whole body's roll when it flies), head, two arms
// { swing, out, elbow }, two legs { x, y, z, foot }: where the ankle is from
// the middle of the hips (to the left, above, ahead) and the foot's own pitch
// (toes down). The figure faces +Z, so its left is +X.
//
// A build says whose legs these are: thigh, shin, ankle (the ankle's height
// over the sole), ball (how far ahead of the ankle the foot turns), hip (half
// the hips' width), stand (the hips' height standing), pivot, knee (+1 bends
// forward, -1 back), reach (longer or shorter strides for the same legs),
// arms and bob (how much the arms swing and the hips bounce).
export const BUILD = { thigh: 0.44, shin: 0.44, ankle: 0.08, ball: 0.13, hip: 0.095, stand: 0.945, pivot: 0.95, knee: 1, reach: 1, arms: 1, bob: 1 };
const REF = 0.88;                       // the legs the strides below were measured on

const mix = (a, b, t) => a + (b - a) * t;
const sat = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// the lesser of two, without the corner (never more than either)
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// The thigh's swing forward and the knee's bend that put the ankle at (z ahead,
// y above) the hip. A place out of reach is reached toward with a straight leg.
export function legIK(z, y, l1 = BUILD.thigh, l2 = BUILD.shin, bend = 1) {
  const d = Math.min(l1 + l2 - 0.004, Math.max(Math.abs(l1 - l2) + 0.12, Math.hypot(z, y)));
  const knee = Math.PI - Math.acos((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2));
  const off = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  return { thigh: Math.atan2(z, -y) + bend * off, knee: bend * knee };
}
// Where a leg's ankle is from its own hip joint, in the hips' own frame: the
// hips' sway, turn and tip taken off. (The hips are turned about the way up,
// then tipped about the way ahead: three's rotation.set(0, hipYaw, roll).)
export function fromHip(pose, side, B = BUILD) {
  const leg = side > 0 ? pose.legL : pose.legR;
  const cy = Math.cos(pose.hipYaw), sy = Math.sin(pose.hipYaw), cr = Math.cos(pose.roll), sr = Math.sin(pose.roll);
  const x0 = leg.x - pose.sway, x1 = x0 * cy - leg.z * sy, z = x0 * sy + leg.z * cy;
  return { x: x1 * cr + leg.y * sr - side * B.hip, y: -x1 * sr + leg.y * cr, z };
}
// where that puts the ankle (the check on legIK)
export function ankleOf(thigh, knee, l1 = BUILD.thigh, l2 = BUILD.shin) {
  return { z: l1 * Math.sin(thigh) + l2 * Math.sin(thigh - knee), y: -l1 * Math.cos(thigh) - l2 * Math.cos(thigh - knee) };
}

// A stride at a speed: how much of it is a run (0 walking, 1 running), the share of it a foot is down
// (duty), how far the body goes over a planted foot (travel), how far ahead of the hips the foot comes
// down, and so how many strides a second (a stride is two steps).
export function stride(v, B = BUILD) {
  const run = smooth(1.9, 3.1, v), s = ((B.thigh + B.shin) / REF) * B.reach;
  const duty = mix(0.62 - 0.02 * v, mix(0.36, 0.22, smooth(3, 8.6, v)), run);
  const travel = mix(Math.min(0.9, 0.22 + 0.42 * v), Math.min(1, 0.6 + 0.068 * v), run) * s;
  return { run, duty, travel, ahead: mix(0.4, 0.36, run) * travel, cadence: v > 1e-6 ? (v * duty) / travel : 0 };
}
// strides a second at a speed: 1.11 walking (1.7 m/s), 1.70 running (5.6), 1.89 at a sprint (8.6)
export const cadence = (v, B = BUILD) => stride(v, B).cadence;

export function createGait(build = BUILD) {
  return { build: { ...BUILD, ...build }, phase: 0, speed: 0, vy: 0, w: { ground: 1, air: 0, dash: 0, fly: 0 }, crouch: 0, bank: 0, yaw: null, t: 0 };
}

// One leg on the ground at psi of its stride (0 as it comes down): the ankle over the floor.
function footAt(psi, st, B, move, v) {
  const { duty, travel, ahead, run } = st, b = B.ball, h = B.ankle;
  const top = mix(0.75, 1.0, run) * move;                                   // how far the heel has lifted as the foot leaves
  if (psi < duty) {
    const u = psi / duty, phi = top * Math.pow(smooth(0.45, 1, u), 1.3), heel = (1 - smooth(0, 0.16, u)) * move;
    const ball = ahead + b - travel * u;                                     // the ball of the foot does not move on the floor
    return { z: ball - b * Math.cos(phi) + h * Math.sin(phi), y: b * Math.sin(phi) + h * Math.cos(phi) + 0.02 * heel, foot: phi - 0.3 * heel, down: true };
  }
  const s = (psi - duty) / (1 - duty), k = Math.sin(Math.PI * s), e = s * s * s * (s * (6 * s - 15) + 10);
  const z1 = ahead + b - travel - b * Math.cos(top) + h * Math.sin(top), y1 = b * Math.sin(top) + h * Math.cos(top);
  const lift = mix(0.05, 0.2 + 0.022 * v, run) * move * ((B.thigh + B.shin) / REF);
  return { z: mix(z1, ahead, e), y: mix(y1, h + 0.02 * move, s) + lift * Math.pow(k, 0.9), foot: mix(top, -0.3 * move, smooth(0.15, 0.85, s)) + 0.5 * run * k * (1 - s), down: false };
}
function groundPose(g, v) {
  const B = g.build, st = stride(v, B), { run, duty } = st, move = sat(v / 0.6), ph = g.phase, reachMax = B.thigh + B.shin - 0.006;
  const L = footAt(ph, st, B, move, v), R = footAt((ph + 0.5) % 1, st, B, move, v);
  const set = sat(v / 0.25); L.z *= set; R.z *= set;                          // standing, the feet are under the hips
  const at = 2 * Math.PI * (ph - duty / 2), c2 = Math.cos(2 * at), c = Math.cos(2 * Math.PI * ph), over = Math.cos(at) * move;
  const track = B.hip * mix(1, 0.72, run);
  const sway = mix(0.022, 0.008, run) * over, roll = mix(0.05, 0.035, run) * over * B.bob, hipYaw = -mix(0.07, 0.11, run) * c * move;
  // the hips: as high as a walk carries them or a run bounces them, and never higher than either leg can reach
  // from its own joint, where the hips' sway, tip and turn have put it
  let pelvis = mix(B.stand - 0.012 * v, B.stand - 0.075 - (0.025 + 0.003 * v) * B.bob * c2, run) + 0.004 * Math.sin(1.3 * g.t) * (1 - move) - g.crouch;
  const most = (f, side) => {
    const dx = side * track - sway - side * B.hip * Math.cos(roll) * Math.cos(hipYaw), dz = f.z + side * B.hip * Math.cos(roll) * Math.sin(hipYaw);
    return f.y - side * B.hip * Math.sin(roll) + Math.sqrt(Math.max(0.01, reachMax * reachMax - dx * dx - dz * dz));
  };
  pelvis = smin(pelvis, smin(most(L, 1), most(R, -1), 0.03), 0.03);
  const A = (0.22 + 0.11 * v) * move * B.arms, lean = 0.02 + 0.036 * v;
  const leg = (f, side) => ({ x: side * track, y: f.y - pelvis, z: f.z, foot: f.foot });
  return {
    pelvis, sway, roll, hipYaw, tilt: 0, lean, twist: (0.14 + 0.12 * run) * c * move, head: -0.6 * lean,
    armL: { swing: -A * c, out: 0.07 + 0.05 * run, elbow: 0.2 + 1.15 * run * B.arms + 0.25 * sat(-c) * move },
    armR: { swing: A * c, out: 0.07 + 0.05 * run, elbow: 0.2 + 1.15 * run * B.arms + 0.25 * sat(c) * move },
    legL: leg(L, 1), legR: leg(R, -1), step: st.ahead * move, track,
  };
}
function airPose(B, vy) {
  const up = sat(0.5 + vy / 7), s = (B.thigh + B.shin) / REF;               // 1 rising, 0 falling
  return {
    pelvis: B.stand, sway: 0, roll: 0, hipYaw: 0, tilt: 0, lean: mix(-0.04, 0.14, up), twist: 0, head: mix(0.12, -0.1, up),
    armL: { swing: mix(0.35, -0.55, up), out: mix(0.95, 0.3, up), elbow: mix(0.45, 0.8, up) },
    armR: { swing: mix(0.35, 0.95, up), out: mix(0.95, 0.25, up), elbow: mix(0.45, 0.95, up) },
    legL: { x: B.hip, z: mix(0.1, 0.24, up) * s, y: mix(-0.8, -0.6, up) * s, foot: mix(0.35, 0.1, up) },
    legR: { x: -B.hip, z: mix(-0.06, -0.18, up) * s, y: mix(-0.84, -0.8, up) * s, foot: mix(0.45, 0.6, up) },
    step: 0, track: B.hip,
  };
}
function dashPose(B) {
  const s = (B.thigh + B.shin) / REF;
  return {
    pelvis: B.stand - 0.085, sway: 0, roll: 0, hipYaw: 0, tilt: 0.42, lean: 0.5, twist: 0.25, head: -0.45,
    armL: { swing: -1.15, out: 0.3, elbow: 0.25 }, armR: { swing: -0.95, out: 0.35, elbow: 0.35 },
    legL: { x: B.hip, z: -0.3 * s, y: -0.7 * s, foot: 0.7 }, legR: { x: -B.hip, z: 0.22 * s, y: -0.66 * s, foot: 0.2 }, step: 0, track: B.hip,
  };
}
function flyPose(g, h, vy) {
  const B = g.build, s = (B.thigh + B.shin) / REF, glide = smooth(2, 13, h);  // 0 hovering upright, 1 lying into its speed
  const sink = 0.2 * sat(-vy / 8);
  return {
    pelvis: B.stand + 0.035 * Math.sin(1.7 * g.t) * (1 - glide), sway: 0, roll: 0, hipYaw: 0, tilt: 1.22 * glide, lean: -0.22 * glide, twist: 0, head: mix(0, -0.62, glide),
    armL: { swing: mix(0.05, -0.3, glide), out: mix(0.38, 0.2, glide) + sink, elbow: mix(0.4, 0.12, glide) },
    armR: { swing: mix(0.08, -0.26, glide), out: mix(0.34, 0.22, glide) + sink, elbow: mix(0.45, 0.14, glide) },
    legL: { x: B.hip, z: mix(0.07, -0.05, glide) * s, y: mix(-0.8, -0.868, glide) * s, foot: mix(0.45, 1.0, glide) },
    legR: { x: -B.hip, z: mix(-0.03, -0.09, glide) * s, y: mix(-0.86, -0.868, glide) * s, foot: mix(0.5, 1.0, glide) },
    step: 0, track: B.hip,
  };
}
const ONE = ['pelvis', 'sway', 'roll', 'hipYaw', 'tilt', 'lean', 'twist', 'head', 'step', 'track'];
const PARTS = ['armL', 'armR', 'legL', 'legR'];
function blend(poses, w) {
  const out = {};
  for (const k of ONE) out[k] = poses.reduce((s, p, i) => s + p[k] * w[i], 0);
  for (const part of PARTS) { out[part] = {}; for (const k of Object.keys(poses[0][part])) out[part][k] = poses.reduce((s, p, i) => s + p[part][k] * w[i], 0); }
  return out;
}

// What the body is doing, of the four.
export const stateOf = (body) => (body.flying ? 'fly' : body.dashT > 0 ? 'dash' : !body.grounded ? 'air' : 'ground');

// A landing at `speed` m/s: the knees take it.
export function land(g, speed) { g.crouch = Math.min(0.3, Math.max(g.crouch, 0.04 * speed)); }

// The pose on the ground at a phase and a speed, alone (what the suite looks at).
export function poseAt(g, phase, v) { const was = g.phase; g.phase = phase; const p = groundPose(g, v); g.phase = was; return p; }

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
  // into a turn: how fast the body is turning, and how fast it goes
  if (g.yaw != null && dt > 0) {
    let d = body.yaw - g.yaw; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    const want = state === 'ground' || state === 'fly' ? Math.max(-0.32, Math.min(0.32, (d / dt) * g.speed * 0.045)) : 0;
    g.bank += (want - g.bank) * (1 - Math.exp(-7 * dt));
  }
  g.yaw = body.yaw;
  const footfalls = [];
  if (state === 'ground' && g.speed > 0.15) {
    const was = g.phase;
    g.phase = (g.phase + cadence(g.speed, g.build) * dt) % 1;
    if (g.phase < was) footfalls.push(1); else if (was < 0.5 && g.phase >= 0.5) footfalls.push(-1);   // the left as the stride turns over, the right at its half
  }
  const B = g.build;
  const pose = blend([groundPose(g, g.speed), airPose(B, g.vy), dashPose(B), flyPose(g, h, body.v[1])], [g.w.ground, g.w.air, g.w.dash, g.w.fly]);
  g.crouch *= Math.exp(-8 * dt);
  pose.lean += 0.6 * g.crouch;
  pose.bank = g.bank * (1 - g.w.fly); pose.bankAll = 1.5 * g.bank * g.w.fly;      // on its feet the chest leans; flying, all of it rolls
  pose.footfalls = footfalls.map((side) => [side * pose.track, pose.step]);
  pose.state = state; pose.speed = g.speed;
  return pose;
}
