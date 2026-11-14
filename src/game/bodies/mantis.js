// mantis.js — THE MANTIS: tall, jade, patient.
//
// The third of the five kinds (../kinds.js); its five choices are antennae,
// shell, wings, build and wear. On the two-legged rig (./biped.js), with long
// legs whose knees bend backward; two taking arms held up and folded, two
// small hands below them; wings that lie down its back and open when it
// leaves the ground; antennae that lean with its speed.
//
// The picture it was drawn from is ../art/v1/mantis.webp. Ancient: the woven
// sash. Now: the bands of alloy. To come: a people who are not us.
import { DoubleSide } from 'three';
import { SHELL } from '../kinds.js';
import { loft, limb, ball, hoop, placed, kit, pipe, through, panel, on, cloth, stuff, shade, TILE } from '../shape.js';
import { createBiped } from './biped.js';
import { bodyOf, node, wide, sided, oval } from './common.js';

const PI = Math.PI, sat = (x) => Math.min(1, Math.max(0, x));
// how a build differs from the slender one: its height, its width, its depth, how thick its limbs are
const BUILDS = { slender: [1, 1, 1, 1], stick: [1.06, 0.8, 0.8, 0.72], shield: [0.97, 1.32, 1.1, 1.1], small: [0.8, 0.96, 0.96, 0.96], great: [1.18, 1.1, 1.1, 1.16] };
const LEGS = { thigh: 0.48, shin: 0.52, ankle: 0.06, ball: 0.08, hip: 0.088, stand: 1.0, pivot: 1.0, knee: -1 };

const PELVIS = [[-0.085, 0.05, 0.05], [-0.01, 0.108, [0.07, 0.076]], [0.06, 0.092, [0.06, 0.066]], [0.1, 0.066, [0.052, 0.056]]];
// a chest that is a shield: a narrow waist under wide shoulders
const THORAX = [[-0.03, 0.06, [0.05, 0.054]], [0.07, 0.052, [0.046, 0.05]], [0.17, 0.074, [0.06, 0.056]], [0.27, 0.11, [0.074, 0.064]], [0.345, 0.128, [0.07, 0.064]], [0.395, 0.11, [0.054, 0.056]], [0.43, 0.05, [0.034, 0.036], -0.002]];
// a head that is a wedge: wide across the eyes, its mouth a point, low and forward
const HEAD = [[-0.028, 0.014, [0.022, 0.014], 0.07], [0.014, 0.036, [0.042, 0.025], 0.053], [0.063, 0.067, [0.059, 0.042], 0.028], [0.112, 0.092, [0.064, 0.053], 0.008], [0.147, 0.09, [0.056, 0.05], 0]];
const THIGH = [[0, 0.064, 0.07], [0.3, 0.068, 0.076], [0.75, 0.044, 0.048], [1, 0.03, 0.032]];
const SHIN = [[0, 0.028, 0.03], [0.15, 0.031, 0.035], [0.5, 0.021, 0.023], [1, 0.016, 0.017]];
// the wings: how long, how wide, and their outline down their length
const WINGS = {
  folded: [0.76, 0.09, [[0, 0.3, 0.01], [0.12, 0.8, 0.016], [0.45, 1, 0.018], [0.8, 0.72, 0.014], [1, 0.12, 0.006]]],
  short: [0.44, 0.08, [[0, 0.3, 0.01], [0.15, 0.85, 0.016], [0.5, 1, 0.017], [0.85, 0.7, 0.012], [1, 0.15, 0.006]]],
  fan: [0.54, 0.17, [[0, 0.12, 0.008], [0.2, 0.55, 0.012], [0.6, 1, 0.012], [0.9, 0.8, 0.01], [1, 0.3, 0.006]]],
  leaf: [0.7, 0.1, [[0, 0.08, 0.006], [0.2, 0.7, 0.012], [0.45, 1, 0.013], [0.8, 0.5, 0.01], [1, 0.03, 0.003]]],
};
// an antenna (the left one), from its root: the points it passes through, how thick it is at each end
const ANTENNAE = {
  arcs: [[[0, 0, 0], [0.03, 0.14, 0.005], [0.055, 0.27, -0.04], [0.065, 0.36, -0.13], [0.06, 0.4, -0.25], [0.05, 0.39, -0.36]], 0.005, 0.0014],
  whips: [[[0, 0, 0], [0.03, 0.12, -0.01], [0.07, 0.22, -0.1], [0.1, 0.27, -0.28], [0.12, 0.26, -0.5], [0.13, 0.2, -0.72]], 0.0045, 0.001],
  plumes: [[[0, 0, 0], [0.03, 0.12, 0], [0.06, 0.23, -0.05], [0.075, 0.3, -0.13]], 0.006, 0.003],
  curls: [[[0, 0, 0], [0.03, 0.15, 0], [0.05, 0.28, -0.03], ...Array.from({ length: 14 }, (_, i) => { const a = 0.45 * i - 1.2, r = 0.07 - 0.0042 * i; return [0.05 + 0.001 * i, 0.34 + r * Math.sin(a), -0.09 - r * Math.cos(a) + 0.02]; })], 0.005, 0.002],
  horns: [[[0, 0, 0], [0.02, 0.07, 0.01], [0.035, 0.13, 0], [0.04, 0.18, -0.03]], 0.011, 0.0015],
};

export function createMantis(look, { lite = false } = {}) {
  const [s, kw, kd, kl] = BUILDS[look.build] || BUILDS.slender, kx = 0.4 + 0.6 * kw;
  const rig = createBiped({ scale: s, build: LEGS, waist: 0.06, shoulder: [0.146 * kx, 0.365, 0.006], upper: 0.2, fore: 0.3, neck: [0, 0.5, 0] });
  const { hips, torso, head, legs, arms, build: B } = rig, S = stuff(lite), K = kit(), cloths = [];
  const [main, second] = SHELL[look.shell] || SHELL.jade, wear = look.wear, banded = wear !== 'bare';
  const M = {
    shell: S.chitin(main), pale: S.chitin(second), wing: S.chitin(shade(main, -0.1)), eye: S.plain(shade(main, -0.45), { roughness: 0.06, metalness: 0.35 }),
    alloy: S.bronze('#c9ccd0', { soft: 0.3, relief: 0.3, roughness: 0.3 }), weave: S.wool('#8f7150'), fall: S.wool('#8f7150', { side: DoubleSide }), bead: S.ceramic('#d9a94e'),
  };
  const body = wide(THORAX, kw, kd), thigh = wide(THIGH, kl), shin = wide(SHIN, kl);
  const band = (bone, r, y, squash = [1, 1]) => K.put(bone, M.alloy, placed(hoop(r, 0.0055, squash, 14), [0, y, 0]));
  const many = wear === 'bands';

  // ── the legs: a thick thigh, a long thin shin with thorns, two toes and a spur
  K.put(hips, M.shell, loft(wide(PELVIS, kw, kd), { seg: 16, cap: [0.8, 0.5], tile: TILE.skin }));
  for (const l of legs) {
    K.put(l.hip, M.shell, limb(B.thigh, thigh, { tile: TILE.skin }));
    K.put(l.knee, M.shell, ball([0.034 * kl, 0.034 * kl, 0.034 * kl], 10));
    K.put(l.knee, M.shell, limb(B.shin, shin, { tile: TILE.skin }));
    for (const t of [0.2, 0.34, 0.48]) K.put(l.knee, M.pale, placed(limb(0.035, [[0, 0.007], [1, 0.001]], { seg: 5 }), [0, -t * B.shin, 0.024 * kl], [-1.9, 0, 0]));
    for (const y of [0.34, -0.34]) K.put(l.ankle, M.shell, placed(limb(0.13, [[0, 0.016], [0.7, 0.012], [1, 0.004]], { seg: 6 }), [0, -0.01, 0], [-1.2, y, 0]));
    K.put(l.ankle, M.shell, placed(limb(0.065, [[0, 0.014], [1, 0.004]], { seg: 6 }), [0, -0.01, 0], [0.95, 0, 0]));
    K.put(l.ankle, M.shell, ball([0.023, 0.023, 0.023], 8));
    if (banded) band(l.hip, 0.052 * kl, -0.29, [1, 1.1]);
    if (many) { band(l.hip, 0.055 * kl, -0.26, [1, 1.1]); band(l.knee, 0.021 * kl, -0.4); band(l.knee, 0.0205 * kl, -0.43); }
    rig.capsule(l.hip, [0, 0, 0], l.knee, [0, 0, 0], 0.075 * kl); rig.capsule(l.knee, [0, 0, 0], l.ankle, [0, 0, 0], 0.036 * kl);
  }
  rig.capsule(hips, [-0.04, -0.01, 0], hips, [0.04, -0.01, 0], 0.095 * Math.max(kw, kd));

  // ── the body: a narrow chest with three pale plates, a thin neck with its rings
  K.put(torso, M.shell, loft(body, { seg: 18, tile: TILE.skin }));
  for (const [y0, y1, h] of [[0.262, 0.4, 0.95], [0.14, 0.27, 0.8], [0.02, 0.148, 0.66]]) K.put(torso, M.pale, panel(body, { y: [y0, y1], th: (v) => { const w = h * (0.45 + 0.55 * oval(v, 0.5)); return [PI / 2 - w, PI / 2 + w]; }, lift: 0.004, rows: 5, cols: 8, tile: TILE.skin }));
  K.put(torso, M.shell, loft([[0.42, 0.028, 0.028], [0.47, 0.022, 0.023], [0.53, 0.023, 0.025]], { seg: 10, cap: [0, 0] }));
  if (banded) { band(torso, 0.036, 0.442); band(torso, 0.031, 0.458); }
  if (many) { band(torso, 0.027, 0.474); band(torso, 0.061 * kw, 0.08, [1, 0.88 * kd / kw]); }

  // ── the head: eyes at its corners, antennae
  K.put(head, M.shell, loft(HEAD, { seg: 16, sub: 3, cap: [0.6, 0.6], tile: TILE.skin }));
  const feelers = [];
  for (const sd of [1, -1]) {
    K.put(head, M.eye, placed(ball([0.036, 0.058, 0.04], 14), [sd * 0.074, 0.118, 0.026], [0.25, 0, -sd * 0.55]));
    const n = node(head, [sd * 0.03, 0.168, 0.012]), [line, r0, r1] = ANTENNAE[look.antennae] || ANTENNAE.arcs, pts = through(line, 4);
    K.put(n, M.shell, sided(sd, pipe(pts, { radius: (t) => r0 + (r1 - r0) * t, seg: 5 })));
    if (look.antennae === 'plumes') for (let i = 2; i < pts.length; i++) for (const o of [1, -1]) {       // a feather: barbs to each side
      const p = pts[i], l = 0.05 * (1 - 0.5 * i / pts.length);
      K.put(n, M.pale, sided(sd, pipe([p, [p[0] + o * l, p[1] + 0.012, p[2] - 0.02]], { radius: (t) => 0.0022 * (1 - 0.6 * t), seg: 4 })));
    }
    feelers.push({ n, sd });
  }

  // ── the taking arms (on the rig's arms), and the two small ones under them
  for (const a of arms) {
    const sd = a.side;
    K.put(a.shoulder, M.shell, ball([0.04 * kl, 0.04 * kl, 0.04 * kl], 12));
    K.put(a.shoulder, M.shell, limb(0.2, wide([[0, 0.028], [0.5, 0.024], [1, 0.022]], kl), { seg: 8, tile: TILE.skin }));
    if (banded) band(a.shoulder, 0.028 * kl, -0.125);
    if (many) band(a.shoulder, 0.028 * kl, -0.15);
    K.put(a.elbow, M.shell, ball([0.029 * kl, 0.029 * kl, 0.029 * kl], 8));
    K.put(a.elbow, M.shell, limb(0.3, wide([[0, 0.022, 0.024], [0.25, 0.034, 0.05], [0.7, 0.031, 0.044], [1, 0.018, 0.022]], kl), { seg: 10, tile: TILE.skin }));
    // the blade: it curves in at its point, with a row of thorns down the edge that closes on the arm
    K.put(a.hand, M.pale, sided(sd, limb(0.3, wide([[0, 0.013, 0.02], [0.3, 0.014, 0.027, 0, 2, -0.002], [0.75, 0.009, 0.016, 0, 2, -0.012], [1, 0.002, 0.003, 0, 2, -0.034]], kl), { seg: 8 })));
    for (let i = 0; i < 6; i++) K.put(a.hand, M.pale, sided(sd, placed(limb(0.03, [[0, 0.0055], [1, 0.0008]], { seg: 4 }), [-0.01 - 0.0016 * i * i * 0.4, -0.045 - 0.036 * i, 0], [0, 0, -1.2])));
  }
  const small = [1, -1].map((sd) => {
    const sh = node(torso, [sd * 0.082 * kx, 0.2, 0.016]), el = node(sh, [0, -0.22, 0]), hd = node(el, [0, -0.22, 0]);
    K.put(sh, M.shell, ball([0.024 * kl, 0.024 * kl, 0.024 * kl], 8));
    K.put(sh, M.shell, limb(0.22, wide([[0, 0.02], [1, 0.015]], kl), { seg: 7, tile: TILE.skin }));
    K.put(el, M.shell, ball([0.017 * kl, 0.017 * kl, 0.017 * kl], 6));
    K.put(el, M.shell, limb(0.22, wide([[0, 0.0155], [1, 0.0115]], kl), { seg: 7, tile: TILE.skin }));
    if (banded) band(el, 0.016 * kl, -0.19);
    if (many) band(el, 0.0165 * kl, -0.165);
    K.put(hd, M.pale, limb(0.045, [[0, 0.011, 0.014], [1, 0.009, 0.019]], { seg: 6 }));
    for (const z of [-0.014, 0, 0.014]) K.put(hd, M.pale, sided(sd, placed(limb(0.055, [[0, 0.0055], [1, 0.0025]], { seg: 4 }), [0, -0.042, z], [0, 0, -0.35])));
    return { sh, el, sd };
  });

  // ── the abdomen, and the wings lying on it
  const belly = node(hips, [0, 0.03, -0.05 * kd]), wings = [];
  K.put(belly, M.pale, limb(0.5, wide([[0, 0.036, 0.032], [0.25, 0.056, 0.046], [0.65, 0.048, 0.04], [1, 0.012, 0.01]], kw, kd), { seg: 12, tile: TILE.skin }));
  for (const t of [0.22, 0.4, 0.58, 0.76]) K.put(belly, M.shell, placed(hoop(0.052 * kw * (1 - 0.5 * Math.abs(t - 0.4)), 0.0035, [1, 0.82 * kd / kw], 14), [0, -0.5 * t, 0]));
  if (WINGS[look.wings]) {
    const [len, w, line] = WINGS[look.wings], shape = line.map(([t, k, d]) => [t, k * w, d]);
    for (const sd of [1, -1]) {
      const n = node(hips, [sd * 0.04 * kw, 0.08, -0.062 * kd]);
      K.put(n, M.wing, placed(limb(len, shape, { seg: 12, tile: TILE.skin }), [sd * 0.4 * w, 0, 0]));
      if (look.wings === 'leaf') K.put(n, M.pale, pipe([[sd * 0.4 * w, -0.02, -0.013], [sd * 0.4 * w, -0.5 * len, -0.016], [sd * 0.4 * w, -0.97 * len, -0.006]], { radius: () => 0.004, seg: 5 }));
      wings.push({ n, sd });
    }
  }

  // ── what it wears: woven cloth, or beads
  const strip = (top, rows, dir) => { const c = cloth({ anchor: hips, cols: top.length, rows, len: 0.085, tile: TILE.wool, scale: s, top, dir: () => dir }); K.own(rig.group, c.geo, M.fall, { cull: false }); cloths.push({ cloth: c, stiff: 0.16 }); };
  const roll = () => K.put(hips, M.weave, loft(wide([[0.01, 0.106, [0.073, 0.078]], [0.055, 0.109, [0.079, 0.082]], [0.1, 0.086, [0.066, 0.07]]], kw, kd), { seg: 18, cap: [0.2, 0.2], tile: TILE.wool }));
  const front = [0.075, 0.04, 0, -0.04, -0.075].map((x) => [x * kw, 0.03, (0.083 - 1.2 * x * x) * kd]);
  if (wear === 'sash') {
    // from the left shoulder across the chest to the waist, in front and behind; a roll at the waist, a length in front
    const across = (c0, c1) => panel(body, { y: [-0.02, 0.412], th: (v) => { const c = c0 + (c1 - c0) * v, w = 0.42 - 0.12 * v; return [c - w, c + w]; }, lift: 0.008, rows: 12, cols: 5, tile: TILE.wool });
    K.put(torso, M.weave, across(PI - 0.6, 0.45)); K.put(torso, M.weave, across(PI + 0.6, 2 * PI - 0.45));
    roll(); strip(front, 4, [0, -1, 0.08]);
  } else if (wear === 'wrap') {
    // a roll at the waist, a length in front and one at each side
    roll(); strip(front, 4, [0, -1, 0.08]);
    for (const sd of [1, -1]) strip([-0.034, 0, 0.034].map((z) => [sd * (0.112 - 4 * z * z) * kw, 0.03, sd * z * kd]), 4, [sd * 0.1, -1, 0]);
  } else if (wear === 'beads') {
    // two strings round the neck, down onto the chest
    const chest = on(body);
    for (const [low, spread, r] of [[0.3, 1.25, 0.0085], [0.2, 1.4, 0.0105]]) {
      const at = (u) => chest(0.422 - (0.422 - low) * (1 - u * u), PI / 2 + u * spread, r);
      K.put(torso, M.weave, pipe(Array.from({ length: 25 }, (_, i) => at(i / 12 - 1)), { radius: () => 0.0022, seg: 4 }));
      for (let i = 2; i <= 22; i++) K.put(torso, i % 2 ? M.bead : M.alloy, placed(ball([r, r, r], 7), at(i / 12 - 1)));
    }
  }

  // ── how it holds itself: the arms up and folded, the wings down its back until it leaves the ground
  let open = 0, strike = 0, t = 0;
  rig.after = (p, b, dt) => {
    t += dt;
    const run = sat(p.speed / 6), k = Math.min(1, dt * 9);
    open += ((b.flying || !b.grounded || b.dashT > 0 ? 1 : 0) - open) * k; strike += ((b.dashT > 0 ? 1 : 0) - strike) * Math.min(1, dt * 14);
    for (const a of arms) {
      const m = a.side > 0 ? p.armL : p.armR;
      a.shoulder.rotation.set(-0.55 + 0.25 * run - 0.7 * strike - 0.2 * m.swing, 0, a.side * (0.6 - 0.25 * strike));
      a.elbow.rotation.set(0, 0, a.side * (2.15 - 0.95 * strike));
      a.hand.rotation.set(0, 0, -a.side * (2.55 - 1.5 * strike));
    }
    for (const a of small) { const m = a.sd > 0 ? p.armL : p.armR; a.sh.rotation.set(0.1 - 0.5 * m.swing, 0, a.sd * 0.36); a.el.rotation.set(-0.55 - 0.4 * m.elbow, 0, -a.sd * 0.3); }
    torso.rotation.x += 0.1; head.rotation.x -= 0.04;
    const lift = 0.66 + 0.34 * run + 0.2 * open;
    belly.rotation.x = lift - 0.1;
    for (const w of wings) w.n.rotation.set(lift + 0.2 * open, 0, w.sd * (0.04 + (1.6 + (b.flying ? 0.22 * Math.sin(38 * t + w.sd) : 0)) * open));
    for (const f of feelers) f.n.rotation.set(-0.06 - 0.4 * run + 0.05 * Math.sin(1.3 * t + f.sd), 0, f.sd * 0.03 * Math.sin(0.9 * t));
  };

  K.build();
  return bodyOf(rig, K, { eye: 1.62, cloths });
}
