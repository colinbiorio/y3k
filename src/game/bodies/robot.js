// robot.js — THE ROBOT: bronze and pale ceramic, cut like an old instrument.
//
// The second of the five kinds (../kinds.js); its five choices are head,
// frame, finish, cloth and light. On the two-legged rig (./biped.js), with a
// stiffer carriage than the human's: its arms swing less, its hips bounce
// less, and it stands straighter.
//
// The picture it was drawn from is ../art/v1/robot.webp. Ancient: plates cut
// with circles and ticks, a length of linen at the waist. Now: the joints.
// To come: a face that is one pale oval with a rim of light.
import { DoubleSide } from 'three';
import { FINISH, GLOW } from '../kinds.js';
import { loft, limb, along, ball, hoop, placed, kit, pipe, panel, on, cloth, stuff, TILE } from '../shape.js';
import { createBiped } from './biped.js';
import { bodyOf, wide, squared, sided, oval } from './common.js';

const PI = Math.PI, T = 0.26;                                 // T: how big the metal's grain is
// how a frame differs from the even one: its height, its width, its depth, how thick its limbs are
const FRAMES = { even: [1, 1, 1, 1], slender: [1.04, 0.9, 0.9, 0.84], compact: [0.86, 1.03, 1.03, 1.06], heavy: [1, 1.2, 1.18, 1.3], tall: [1.14, 0.98, 0.98, 0.95] };

const PELVIS = squared([[-0.1, 0.06, [0.065, 0.07]], [-0.04, 0.125, [0.085, 0.095]], [0.02, 0.15, [0.092, 0.105]], [0.08, 0.135, [0.085, 0.09]], [0.12, 0.118, [0.078, 0.082]]], 2.6);
const TORSO = squared([[-0.03, 0.116, [0.08, 0.084]], [0.05, 0.104, [0.074, 0.078]], [0.13, 0.114, [0.082, 0.082]], [0.2, 0.146, [0.106, 0.098]], [0.3, 0.172, [0.12, 0.11]], [0.38, 0.176, [0.11, 0.106]], [0.425, 0.156, [0.09, 0.094]], [0.455, 0.09, [0.07, 0.074], -0.005], [0.48, 0.06, [0.056, 0.06], -0.008]], 2.6);
const SKULL = [[0.018, 0.06, [0.078, 0.052], 0.005], [0.054, 0.081, [0.094, 0.074]], [0.1, 0.092, [0.1, 0.093], -0.002], [0.145, 0.095, [0.1, 0.103], -0.004], [0.182, 0.09, [0.094, 0.101], -0.005], [0.214, 0.073, [0.076, 0.085], -0.007], [0.232, 0.054, [0.056, 0.064], -0.008]];
const THIGH = [[0.04, 0.078, 0.084], [0.3, 0.086, 0.094], [0.7, 0.07, 0.074], [1, 0.054, 0.056]];
const SHIN = [[0.08, 0.046, 0.05], [0.3, 0.056, 0.064, -0.006], [0.65, 0.044, 0.05, -0.004], [1, 0.031, 0.034]];
const UPPER = [[0.1, 0.046], [0.3, 0.052], [0.75, 0.044], [1, 0.037]];
const FORE = [[0.08, 0.035], [0.3, 0.045], [0.8, 0.035], [1, 0.028]];
// a foot, along its length from the heel (as the human's), and one of its two toes
const FOOT = squared([[-0.055, 0.032, [0.03, 0.034], 0.05], [-0.015, 0.042, [0.034, 0.056], 0.046], [0.04, 0.047, [0.034, 0.046], 0.046], [0.095, 0.049, [0.031, 0.03], 0.049]], 2.8);
const TOE = (x) => squared([[0.08, 0.0235, [0.029, 0.026], 0.051, 2, x], [0.12, 0.0235, [0.026, 0.02], 0.054, 2, x * 1.04], [0.148, 0.02, [0.022, 0.014], 0.058, 2, x * 1.06]], 2.8);

export function createRobot(look, { lite = false } = {}) {
  const [s, kw, kd, kl] = FRAMES[look.frame] || FRAMES.even, kx = 0.3 + 0.7 * kw;
  const rig = createBiped({ scale: s, build: { arms: 0.7, bob: 0.6, stand: 0.958 }, shoulder: [0.2 * kx, 0.4, 0], neck: [0, 0.492, -0.005] });
  const { hips, torso, head, legs, arms, build: B } = rig, S = stuff(lite), K = kit(), cloths = [];
  const [metal, pale] = FINISH[look.finish] || FINISH.bronze, glow = GLOW[look.light] || GLOW.amber;
  const M = {
    metal: S.bronze(metal, { soft: 0.45, relief: 0.4, roughness: 0.4 }), plate: S.ceramic(pale), cut: S.engraved(pale), joint: S.plain('#191817', { roughness: 0.5, metalness: 0.7 }),
    glass: S.plain('#0c0f14', { roughness: 0.08, metalness: 0.6 }), glow: S.glow(glow), halo: S.halo(glow, 0.16), linen: S.linen('#d6c6a6'), fall: S.linen('#d6c6a6', { side: DoubleSide }),
  };
  const body = wide(TORSO, kw, kd), chest = on(body), thigh = wide(THIGH, kl), shin = wide(SHIN, kl), upper = wide(UPPER, kl), fore = wide(FORE, kl);
  // a plate laid on a limb: between two heights, round `mid`, `half` wide across its middle
  const oncurve = (stations, y, mid, half, o = {}) => panel(stations, { y, th: (v) => [mid - half * oval(v), mid + half * oval(v)], lift: 0.006, rows: 8, cols: 8, tile: TILE.glaze, ...o });

  // ── the legs: a dial on each thigh, an oval on each shin, two toes
  K.put(hips, M.metal, loft(wide(PELVIS, kw, kd), { seg: 22, tile: T }));
  for (const l of legs) {
    const sd = l.side;
    K.put(l.hip, M.joint, ball([0.068 * kl, 0.068 * kl, 0.068 * kl], 12));
    K.put(l.hip, M.metal, limb(B.thigh, thigh, { tile: T }));
    K.put(l.hip, M.cut, sided(sd, oncurve(along(B.thigh, thigh), [-0.41, -0.13], 0.45, 1.2, { lift: 0.008, rows: 10, cols: 10, tile: 0.3 })));
    K.put(l.knee, M.joint, ball([0.05 * kl, 0.05 * kl, 0.05 * kl], 12));
    K.put(l.knee, M.metal, placed(ball([0.036 * kl, 0.044, 0.022], 10), [0, 0, 0.04 * kl]));
    K.put(l.knee, M.metal, limb(B.shin, shin, { tile: T }));
    K.put(l.knee, M.plate, sided(sd, oncurve(along(B.shin, shin), [-0.34, -0.1], 0.2, 0.8)));
    K.put(l.ankle, M.joint, ball([0.034, 0.034, 0.034], 10));
    K.put(l.ankle, M.metal, placed(loft(FOOT, { seg: 12, cap: [0.6, 0.3], tile: T }), [0, 0, 0], [PI / 2, 0, 0]));
    for (const x of [0.024, -0.024]) K.put(l.ankle, M.metal, placed(loft(TOE(x), { seg: 10, cap: [0.3, 0.7], tile: T }), [0, 0, 0], [PI / 2, 0, 0]));
    rig.capsule(l.hip, [0, 0, 0], l.knee, [0, 0, 0], 0.098 * kl); rig.capsule(l.knee, [0, 0, 0], l.ankle, [0, 0, 0], 0.066 * kl);
  }
  rig.capsule(hips, [-0.06, -0.02, 0], hips, [0.06, -0.02, 0], 0.112 * Math.max(kw, kd));

  // ── the chest: bronze under two plates cut with circles, a yoke, a small ring of light; a neck of rings
  const shield = (v) => 1.3 * Math.min(1, 0.28 + 2.2 * v) ** 0.8 * (v > 0.82 ? 1 - 1.1 * (v - 0.82) : 1);
  K.put(torso, M.metal, loft(body, { seg: 24, tile: T }));
  for (const mid of [PI / 2, 1.5 * PI]) K.put(torso, M.cut, panel(body, { y: [0.165, 0.435], th: (v) => [mid - shield(v), mid + shield(v)], lift: 0.007, rows: 12, cols: 16, tile: 0.4 }));
  K.put(torso, M.metal, panel(body, { y: [0.375, 0.47], th: (v) => [PI / 2 - 0.12 - 0.9 * v, PI / 2 + 0.12 + 0.9 * v], lift: 0.012, rows: 5, cols: 10, tile: T }));
  K.put(torso, M.glow, placed(hoop(0.018, 0.0032, [1, 1], 18), chest(0.3, PI / 2, 0.009), [PI / 2, 0, 0]));
  K.put(torso, M.halo, placed(hoop(0.018, 0.009, [1, 1], 18), chest(0.3, PI / 2, 0.009), [PI / 2, 0, 0]));
  K.put(torso, M.joint, loft([[0.44, 0.04, 0.04, -0.008], [0.55, 0.036, 0.038, -0.006]], { seg: 10, cap: [0, 0] }));
  for (const [y, r] of [[0.468, 0.054], [0.488, 0.047], [0.506, 0.043]]) K.put(torso, M.metal, placed(hoop(r, 0.011, [1, 1.04], 18), [0, y, -0.007]));
  for (const a of arms) {
    const sd = a.side;
    K.put(a.shoulder, M.plate, placed(ball([0.056 * kl, 0.07 * kl, 0.064 * kl], 14), [sd * 0.008, -0.016, 0]));
    K.put(a.shoulder, M.metal, limb(0.29, upper, { tile: T }));
    K.put(a.shoulder, M.plate, sided(sd, oncurve(along(0.29, upper), [-0.255, -0.11], 0, 0.9, { lift: 0.005, cols: 6 })));
    K.put(a.elbow, M.joint, ball([0.038 * kl, 0.038 * kl, 0.038 * kl], 10));
    K.put(a.elbow, M.metal, limb(0.26, fore, { tile: T }));
    K.put(a.elbow, M.plate, sided(sd, oncurve(along(0.26, fore), [-0.235, -0.04], -0.35, 1.05, { lift: 0.005 })));
    // a hand: a palm of metal, four fingers of two bones, a thumb
    K.put(a.hand, M.metal, sided(sd, limb(0.085, [[0, 0.015, 0.022], [0.4, 0.016, 0.036], [1, 0.014, 0.037]], { seg: 10 })));
    for (const z of [-0.027, -0.009, 0.009, 0.027]) {
      K.put(a.hand, M.plate, sided(sd, placed(limb(0.042, [[0, 0.0078], [1, 0.0068]], { seg: 6 }), [0, -0.086, z], [0, 0, -0.22])));
      K.put(a.hand, M.plate, sided(sd, placed(limb(0.038, [[0, 0.0068], [1, 0.0052]], { seg: 6 }), [-0.0092, -0.127, z], [0, 0, -0.7])));
    }
    K.put(a.hand, M.plate, sided(sd, placed(limb(0.055, [[0, 0.009], [1, 0.0065]], { seg: 6 }), [0, -0.03, 0.036], [-0.55, 0, -0.2])));
  }

  // ── the head
  const skull = on(SKULL), y0 = 0.026, y1 = 0.218, wide0 = (v) => 1.12 * oval(v, 0.8);
  const face = () => K.put(head, M.plate, panel(SKULL, { y: [y0, y1], th: (v) => [PI / 2 - wide0(v), PI / 2 + wide0(v)], lift: 0.005, rows: 14, cols: 10, tile: TILE.glaze }));
  if (look.head === 'dome') {
    // a bowl of dark glass on a jaw of metal, a ring of light where they meet and a point of it in front
    K.put(head, M.metal, loft(SKULL.slice(0, 3), { seg: 24, sub: 3, cap: [0.4, 0.3], tile: T }));
    K.put(head, M.glass, placed(ball([0.098, 0.11, 0.105], 20), [0, 0.155, -0.004]));
    K.put(head, M.glow, placed(hoop(0.09, 0.0045, [1, 1.08], 28), [0, 0.104, -0.003]));
    K.put(head, M.glow, placed(ball([0.012, 0.012, 0.006], 8), [0, 0.165, 0.099]));
  } else {
    K.put(head, M.metal, loft(SKULL, { seg: 24, sub: 3, cap: [0.4, 0.5], tile: T }));
    for (const sd of [1, -1]) {
      K.put(head, M.metal, placed(ball([0.012, 0.038, 0.038], 14), [sd * 0.094, 0.118, -0.012]));
      K.put(head, M.joint, placed(hoop(0.023, 0.0035, [1, 1], 16), [sd * 0.105, 0.118, -0.012], [0, 0, PI / 2]));
      K.put(head, M.metal, placed(ball([0.006, 0.012, 0.012], 8), [sd * 0.106, 0.118, -0.012]));
    }
    if (look.head === 'visor') {
      // a band of dark glass across the eyes with a line of light in it, over a pale jaw
      K.put(head, M.plate, panel(SKULL, { y: [0.03, 0.098], th: (v) => [PI / 2 - 0.4 - 0.55 * v, PI / 2 + 0.4 + 0.55 * v], lift: 0.004, rows: 5, cols: 8, tile: TILE.glaze }));
      K.put(head, M.glass, panel(SKULL, { y: [0.11, 0.172], th: [PI / 2 - 1.25, PI / 2 + 1.25], lift: 0.005, rows: 3, cols: 14 }));
      K.put(head, M.glow, pipe(Array.from({ length: 13 }, (_, i) => skull(0.141, PI / 2 - 1.05 + 2.1 * i / 12, 0.009)), { radius: () => 0.003, seg: 5 }));
    } else if (look.head === 'lens') {
      // one eye: a lens in a ring of metal, in the middle of a pale face
      face();
      const c = skull(0.128, PI / 2, 0.006);
      K.put(head, M.metal, placed(hoop(0.036, 0.007, [1, 1], 20), c, [PI / 2, 0, 0]));
      K.put(head, M.glass, placed(ball([0.033, 0.033, 0.012], 14), c));
      K.put(head, M.glow, placed(ball([0.01, 0.01, 0.005], 8), [c[0], c[1], c[2] + 0.011]));
    } else {
      // a pale oval face with a rim of light; the crest is a pale fin over the crown
      face();
      const rim = []; for (let i = 0; i <= 14; i++) rim.push(skull(y0 + (y1 - y0) * i / 14, PI / 2 - wide0(i / 14), 0.005));
      for (let i = 13; i >= 0; i--) rim.push(skull(y0 + (y1 - y0) * i / 14, PI / 2 + wide0(i / 14), 0.005));
      K.put(head, M.glow, pipe(rim, { radius: () => 0.006, seg: 6 })); K.put(head, M.halo, pipe(rim, { radius: () => 0.015, seg: 6 }));
      if (look.head === 'crest') K.put(head, M.plate, placed(ball([0.008, 0.095, 0.118], 16), [0, 0.212, -0.034]));
    }
  }

  // ── what it wears: linen
  const strip = (f, rows, half = 0.085) => {                 // a length hanging from the waist: in front (f = 1) or behind (-1)
    const c = cloth({ anchor: hips, cols: 5, rows, len: 0.085, tile: TILE.linen, scale: s, dir: () => [0, -1, f * 0.06],
      top: Array.from({ length: 5 }, (_, i) => [f * half * (1 - i / 2) * kw, 0.056, f * 0.104 * kd]) });
    K.own(rig.group, c.geo, M.fall, { cull: false }); cloths.push({ cloth: c, stiff: 0.16 });
  };
  if (look.cloth === 'wrap') {
    // a roll at the waist, a length in front and a length behind
    K.put(hips, M.linen, loft(wide(squared([[0.04, 0.14, [0.097, 0.1]], [0.074, 0.15, [0.107, 0.109]], [0.108, 0.138, [0.095, 0.098]]], 2.4), kw, kd), { seg: 24, cap: [0.15, 0.15], tile: TILE.linen }));
    strip(1, 4); strip(-1, 4);
  } else if (look.cloth === 'sash') {
    // a band from the right hip to the left shoulder, in front and behind, knotted at the hip with an end hanging
    const band = (c0, c1) => panel(body, { y: [-0.02, 0.45], th: (v) => { const c = c0 + (c1 - c0) * v; return [c - 0.2, c + 0.2]; }, lift: 0.014, rows: 14, cols: 4, tile: TILE.linen });
    K.put(torso, M.linen, band(PI - 0.4, 0.3)); K.put(torso, M.linen, band(PI + 0.4, 2 * PI - 0.3));
    K.put(hips, M.linen, placed(ball([0.03, 0.036, 0.04], 10), [-0.122 * kw, 0.062, 0.03 * kd]));
    const end = cloth({ anchor: hips, cols: 2, rows: 5, len: 0.07, tile: TILE.linen, scale: s, top: [[-0.125 * kw, 0.05, 0.055 * kd], [-0.138 * kw, 0.05, 0.012 * kd]], dir: () => [-0.1, -1, 0] });
    K.own(rig.group, end.geo, M.fall, { cull: false }); cloths.push({ cloth: end, stiff: 0.18 });
  } else if (look.cloth === 'tabard') {
    // one long piece over the chest and the back, belted, to the knees
    for (const mid of [PI / 2, 1.5 * PI]) K.put(torso, M.linen, panel(body, { y: [-0.01, 0.452], th: [mid - 0.5, mid + 0.5], lift: 0.013, rows: 10, cols: 6, tile: TILE.linen }));
    K.put(hips, M.metal, loft(wide(squared([[0.05, 0.14, [0.094, 0.097]], [0.07, 0.144, [0.098, 0.101]], [0.09, 0.14, [0.094, 0.097]]], 2.4), kw, kd), { seg: 24, cap: [0.3, 0.3], tile: T }));
    strip(1, 6, 0.092); strip(-1, 6, 0.092);
  } else if (look.cloth === 'mantle') {
    // a short cape round the shoulders, clasped at the throat
    const n = 15, gap = 0.3, ring = (c) => PI / 2 + gap + (2 * PI - 2 * gap) * c / (n - 1);
    const cape = cloth({ anchor: torso, cols: n, rows: 4, len: 0.085, tile: TILE.linen, scale: s,
      top: Array.from({ length: n }, (_, c) => [0.1 * kx * Math.cos(ring(c)), 0.452, -0.006 + 0.088 * Math.sin(ring(c))]),
      dir: (c, r) => { const th = ring(c), f = r === 1 ? 1.4 : 0.3; return [Math.cos(th) * f, -1, Math.sin(th) * f]; } });
    K.own(rig.group, cape.geo, M.fall, { cull: false }); cloths.push({ cloth: cape, stiff: 0.22 });
    K.put(torso, M.metal, placed(hoop(0.016, 0.004, [1, 1], 14), [0, 0.44, 0.1 * kd], [PI / 2, 0, 0]));
    rig.capsule(torso, [-0.19 * kx, 0.39, 0], torso, [0.19 * kx, 0.39, 0], 0.075);
    rig.capsule(torso, [0, 0.12, 0], torso, [0, 0.33, 0], 0.118 * Math.max(kw, kd));
    for (const a of arms) rig.capsule(a.shoulder, [0, 0, 0], a.elbow, [0, 0, 0], 0.058 * kl);
  }

  K.build();
  return bodyOf(rig, K, { eye: 1.5, cloths });
}
