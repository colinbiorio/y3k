// human.js — THE HUMAN: wool, plate and a woven belt.
//
// The first of the five kinds (../kinds.js); its five choices are hair,
// build, clothing, skin and dye. Drawn on the two-legged rig (./biped.js)
// with the tools in ../shape.js: nothing here is a model file.
//
// The picture it was drawn from is ../art/v1/human.webp: a long sleeveless
// coat of rust wool, open below a woven belt; pale plates on the shoulders
// (to come), dark sleeves and trousers (now), tan boots, the wool (ancient).
import { DoubleSide } from 'three';
import { SKIN, DYE } from '../kinds.js';
import { loft, limb, ball, hoop, placed, kit, pipe, panel, on, cloth, stuff, shade, TILE } from '../shape.js';
import { createBiped } from './biped.js';
import { bodyOf, wide, squared, sided } from './common.js';

const PI = Math.PI;
// how a build differs from the even one: its height, its width, its depth, how thick its limbs are
const BUILDS = { even: [1, 1, 1, 1], slight: [0.93, 0.92, 0.93, 0.9], lean: [1.05, 0.93, 0.9, 0.88], broad: [1.03, 1.13, 1.06, 1.12], heavy: [0.98, 1.15, 1.3, 1.2] };
const HAIR = { sand: '#2c1d15', ochre: '#1e1511', sienna: '#16110e', umber: '#0f0c0b', pearl: '#54392a' };

// [height, half-width, half-depth | [front, back], where its middle is (z)]
const PELVIS = squared([[-0.1, 0.07, [0.07, 0.08]], [-0.04, 0.15, [0.09, 0.105]], [0.02, 0.168, [0.095, 0.115]], [0.08, 0.15, [0.09, 0.1]], [0.13, 0.135, [0.085, 0.09]]], 2.3);
const TORSO = squared([[-0.02, 0.144, [0.097, 0.102]], [0.06, 0.134, [0.091, 0.095]], [0.16, 0.144, [0.1, 0.1]], [0.27, 0.166, [0.116, 0.108]], [0.36, 0.172, [0.108, 0.105]], [0.415, 0.15, [0.09, 0.095]], [0.455, 0.088, [0.07, 0.075], -0.005], [0.48, 0.06, [0.056, 0.06], -0.008]], 2.4);
const HEAD = [[0.012, 0.045, [0.075, 0.03], 0.01], [0.04, 0.062, [0.085, 0.05], 0.005], [0.075, 0.07, [0.09, 0.068]], [0.115, 0.076, [0.092, 0.085], -0.002], [0.15, 0.078, [0.091, 0.096], -0.004], [0.178, 0.078, [0.09, 0.098], -0.005]];
const CROP = [[0.066, 0.05, [0.001, 0.07], -0.004], [0.11, 0.0805, [0.001, 0.092], -0.004], [0.15, 0.085, [0.034, 0.104], -0.006], [0.176, 0.086, [0.062, 0.107], -0.006], [0.198, 0.085, [0.096, 0.104], -0.004]];
// limbs: [how far along, half-width, half-depth, z]
const THIGH = [[0, 0.082, 0.09], [0.25, 0.08, 0.088], [0.6, 0.066, 0.072], [0.9, 0.054, 0.058], [1, 0.05, 0.054]];
const SHIN = [[0, 0.05, 0.056], [0.2, 0.052, 0.062, -0.008], [0.45, 0.046, 0.054, -0.006], [0.8, 0.034, 0.038], [1, 0.03, 0.034]];
const SHAFT = [[-0.186, 0.058, 0.061, -0.004], [-0.22, 0.054, 0.058, -0.005], [-0.265, 0.058, 0.06, -0.004], [-0.31, 0.05, 0.054, -0.002], [-0.35, 0.054, 0.056], [-0.4, 0.046, 0.05], [-0.445, 0.045, 0.05]];
// a foot, along its length from the heel: [how far ahead of the ankle, half-width, [below, above] its middle, how far under the ankle its middle is]
const FOOT = squared([[-0.05, 0.03, [0.03, 0.03], 0.05], [-0.02, 0.041, [0.034, 0.05], 0.046], [0.03, 0.045, [0.034, 0.042], 0.046], [0.08, 0.049, [0.03, 0.026], 0.05], [0.13, 0.05, [0.026, 0.016], 0.054], [0.178, 0.044, [0.022, 0.012], 0.058]], 2.6);
const UPPER = [[0, 0.056, 0.058], [0.3, 0.052, 0.056], [0.75, 0.042, 0.046], [1, 0.038, 0.04]];
const FORE = [[0, 0.04, 0.042], [0.25, 0.042, 0.046], [0.7, 0.032, 0.034], [1, 0.027, 0.024]];

export function createHuman(look, { lite = false } = {}) {
  const [s, kw, kd, kl] = BUILDS[look.build] || BUILDS.even, kx = 0.3 + 0.7 * kw;
  const rig = createBiped({ scale: s, shoulder: [0.186 * kx, 0.4, 0] });
  const { hips, torso, head, legs, arms, build: B } = rig, S = stuff(lite), K = kit(), cloths = [];
  const skin = SKIN[look.skin] || SKIN.sand, dye = DYE[look.dye] || DYE.rust;
  const M = {
    skin: S.skin(skin), hair: S.plain(HAIR[look.skin] || HAIR.sand, { roughness: 0.8 }), eye: S.plain('#130e0c', { roughness: 0.1 }), lip: S.plain(shade(skin, -0.42)),
    top: S.wool(dye), fall: S.wool(dye, { side: DoubleSide }), hem: S.wool(shade(dye, -0.22), { side: DoubleSide }),
    under: S.linen('#3a2c27'), sleeve: S.linen('#46342b'), legs: S.linen('#33292a'), boot: S.leather('#b48d62'),
    belt: S.linen('#c9a877'), sash: S.linen('#c9a877', { side: DoubleSide }), plate: S.ceramic('#ece6da'), bronze: S.bronze('#a9733d'),
  };
  const body = wide(TORSO, kw, kd), pelvis = wide(PELVIS, kw, kd);

  // ── the legs, and the boots
  K.put(hips, M.legs, loft(pelvis, { seg: 22, tile: TILE.linen }));
  for (const l of legs) {
    K.put(l.hip, M.legs, limb(B.thigh, wide(THIGH, kl), { tile: TILE.linen }));
    K.put(l.knee, M.legs, limb(B.shin, wide(SHIN, kl), { tile: TILE.linen }));
    K.put(l.knee, M.boot, loft(wide(SHAFT, kl), { seg: 14, cap: [0, 0] }));
    K.put(l.knee, M.boot, placed(hoop(0.0575 * kl, 0.0075, [1, 1.06], 18), [0, -0.186, -0.004 * kl]));
    K.put(l.ankle, M.boot, placed(loft(wide(FOOT, 0.5 + 0.5 * kl, 1), { seg: 14, cap: [0.6, 0.7] }), [0, 0, 0], [PI / 2, 0, 0]));
    rig.capsule(l.hip, [0, 0, 0], l.knee, [0, 0, 0], 0.092 * kl); rig.capsule(l.knee, [0, 0, 0], l.ankle, [0, 0, 0], 0.066 * kl);
  }
  rig.capsule(hips, [-0.07, -0.02, 0], hips, [0.07, -0.02, 0], 0.12 * Math.max(kw, kd));

  // ── the chest, the neck and the arms
  K.put(torso, M.top, loft(body, { seg: 24, tile: TILE.wool }));
  K.put(torso, M.skin, loft([[0.42, 0.055, 0.055, -0.012], [0.5, 0.047, 0.05, -0.008], [0.575, 0.047, 0.052, -0.006]], { seg: 12, cap: [0, 0] }));
  for (const a of arms) {
    K.put(a.shoulder, M.sleeve, limb(0.29, wide(UPPER, kl), { tile: TILE.linen }));
    K.put(a.elbow, M.sleeve, limb(0.26, wide(FORE, kl), { tile: TILE.linen }));
    K.put(a.hand, M.skin, sided(a.side, limb(0.1, [[0, 0.016, 0.025], [0.3, 0.017, 0.036], [0.75, 0.016, 0.039], [1, 0.014, 0.036]], { seg: 10 })));                       // the palm
    K.put(a.hand, M.skin, sided(a.side, placed(limb(0.072, [[0, 0.013, 0.035], [0.6, 0.011, 0.031], [1, 0.008, 0.023]], { seg: 10 }), [0, -0.094, 0], [0, 0, -0.45])));   // the fingers, curled in
    K.put(a.hand, M.skin, sided(a.side, placed(limb(0.06, [[0, 0.011, 0.012], [1, 0.008, 0.009]], { seg: 8 }), [0, -0.03, 0.034], [-0.5, 0, -0.2])));                    // the thumb
  }

  // ── the head: a face, ears, hair
  K.put(head, M.skin, loft(HEAD, { seg: 24, sub: 4, cap: [0.3, 0.88], tile: TILE.skin }));
  const face = on(HEAD), nose = (y) => face(y, PI / 2)[2] - 0.004;
  for (const side of [1, -1]) {
    K.put(head, M.eye, placed(ball([0.0125, 0.0075, 0.006], 10), face(0.132, PI / 2 - side * 0.41, -0.002), [0, side * 0.45, 0]));
    K.put(head, M.hair, pipe([0.2, 0.33, 0.47, 0.6].map((a, i) => face(0.151 + [0, 0.004, 0.004, -0.001][i], PI / 2 - side * a, 0.001)), { radius: () => 0.0032, seg: 5 }));
    K.put(head, M.skin, placed(ball([0.007, 0.021, 0.012], 8), [side * 0.0775, 0.128, -0.004]));
  }
  K.put(head, M.skin, loft([[0.094, 0.0125, [0.014, 0.01], nose(0.094)], [0.106, 0.0115, [0.019, 0.01], nose(0.106)], [0.128, 0.0075, [0.012, 0.01], nose(0.128)], [0.15, 0.0065, [0.006, 0.01], nose(0.15)]], { seg: 8, sub: 2, cap: [0.5, 0.4] }));
  K.put(head, M.lip, pipe([-0.3, -0.15, 0, 0.15, 0.3].map((a) => face(0.066 - (a ? 0 : 0.0015), PI / 2 + a, 0.0004)), { radius: () => 0.0022, seg: 5 }));
  K.put(head, M.hair, loft(CROP, { seg: 24, sub: 3, cap: [0.4, 0.72] }));

  // ── the coat: its opening over a shirt, the plates on the shoulders, the belt, and the skirt that hangs from it
  const at = on(body), open = (v) => 0.035 + 0.5 * v ** 1.5;
  K.put(torso, M.under, panel(body, { y: [0.075, 0.452], th: (v) => [PI / 2 - open(v), PI / 2 + open(v)], lift: 0.002, rows: 10, cols: 6, tile: TILE.linen }));
  K.put(torso, M.under, placed(loft([[0, 0.058, [0.058, 0.06]], [0.028, 0.054, [0.054, 0.058]]], { seg: 16, cap: [0, 0] }), [0, 0.452, -0.008], [0.16, 0, 0]));      // the shirt's collar
  for (const side of [1, -1]) {
    K.put(torso, M.top, pipe(Array.from({ length: 11 }, (_, i) => at(0.07 + 0.385 * i / 10, PI / 2 - side * open(i / 10), 0.003)), { radius: () => 0.0055, seg: 6, tile: TILE.wool }));
    // three plates, each over the one below: the first on the shoulder, two on the arm
    K.put(torso, M.plate, placed(ball([0.062, 0.046, 0.086], 14), [side * 0.202 * kx, 0.412, 0], [0, 0, -side * 0.42]));
    const arm = rig.arms[side > 0 ? 0 : 1].shoulder;
    for (const [x, y, r] of [[0.04, -0.035, [0.034, 0.062, 0.08]], [0.036, -0.092, [0.03, 0.054, 0.072]]]) {
      K.put(arm, M.plate, placed(ball(r, 14), [side * x * kl, y, 0], [0, 0, side * 0.1]));
      K.put(arm, M.bronze, placed(hoop(r[2] * 0.56, 0.0034, [r[0] / r[2], 1], 22), [side * (x * kl + 0.006), y - r[1] * 0.83, 0], [0, 0, side * 0.1]));
    }
  }
  K.put(hips, M.belt, loft(wide(squared([[0.088, 0.157, [0.108, 0.111]], [0.108, 0.159, [0.11, 0.113]], [0.13, 0.155, [0.106, 0.11]]], 2.3), kw, kd), { seg: 24, cap: [0.12, 0.12], tile: TILE.linen }));
  K.put(hips, M.bronze, placed(hoop(0.019, 0.0045, [1, 1], 14), [0.012 * kw, 0.109, 0.114 * kd], [PI / 2, 0, 0]));
  const n = 19, gap = 0.3, ring = (c) => PI / 2 + gap + (2 * PI - 2 * gap) * c / (n - 1);
  const away = (c) => (c < 4 ? 1 - c / 4 : c > n - 5 ? -(1 - (n - 1 - c) / 4) : 0);                 // the two edges in front hang apart
  const skirt = cloth({
    anchor: hips, cols: n, rows: 8, len: 0.1, hem: 1, tile: TILE.wool, scale: s,
    top: Array.from({ length: n }, (_, c) => { const th = ring(c), sn = Math.sin(th); return [0.156 * kw * Math.cos(th), 0.104, (sn >= 0 ? 0.106 : 0.11) * kd * sn]; }),
    dir: (c, r) => { const th = ring(c) + 0.7 * away(c), f = (r === 1 ? 0.42 : 0.2) + 0.08 * Math.abs(away(c)); return [Math.cos(th) * f, -1, Math.sin(th) * f]; },
  });
  K.own(rig.group, skirt.geo, [M.fall, M.hem], { cull: false }); cloths.push({ cloth: skirt, stiff: 0.14 });
  const end = cloth({ anchor: hips, cols: 2, rows: 5, len: 0.06, tile: TILE.linen, scale: s, top: [[0.062 * kw, 0.092, 0.114 * kd], [0.03 * kw, 0.092, 0.117 * kd]], dir: () => [0, -1, 0.06] });
  K.own(rig.group, end.geo, M.sash, { cull: false }); cloths.push({ cloth: end, stiff: 0.2 });

  K.build();
  return bodyOf(rig, K, { eye: 1.45, cloths });
}
