// human.js — THE HUMAN: wool, plate and a woven belt.
//
// The first of the five kinds (../kinds.js); its five choices are hair,
// build, clothing, skin and dye. Drawn on the two-legged rig (./biped.js)
// with the tools in ../shape.js; its face, its hands and the hair on its
// head are MakeHuman's CC0 mesh, as numbers (./kin.js), since 17 Nov 2026
// (Colin, 15 Nov: "the human isn't realistic whatsoever").
//
// The picture it was drawn from is ../art/v2/human.webp: a long sleeveless
// coat of rust wool, open below a woven belt; pale plates on the shoulders,
// dark sleeves and trousers, tan boots. That is the coat. The four other
// things to wear are cut from the same three times: a cloak over a linen
// tunic and a wrap thrown over one shoulder (ancient), a short jacket and a
// scarf (now), a close suit under ceramic with seams that glow (to come).
// Hair that hangs (the tail, the braid) is a line of points that swings, as
// the cloth is; so no two of the twenty-five looks stand quite alike.
import * as THREE from 'three';
import { DoubleSide } from 'three';
import { SKIN, DYE } from '../kinds.js';
import { loft, limb, along, ball, hoop, placed, kit, pipe, panel, on, cloth, tube, stuff, shade, surfaced, TILE } from '../shape.js';
import { createBiped } from './biped.js';
import { bodyOf, wide, squared, sided } from './common.js';
import { HEAD as FACE, HAND, HAND_GRIP, CROP as CROPPED, SHAVED as SHORN, EYES, HAIR_AT, CURLS } from './kin.js';

const PI = Math.PI;
// two colours, k of the way from the first to the second
const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
// how a build differs from the even one: its height, its width, its depth, how thick its limbs are
const BUILDS = { even: [1, 1, 1, 1], slight: [0.93, 0.92, 0.93, 0.9], lean: [1.05, 0.93, 0.9, 0.88], broad: [1.03, 1.13, 1.06, 1.12], heavy: [0.98, 1.15, 1.3, 1.2] };
const HAIR = { sand: '#2c1d15', ochre: '#1e1511', sienna: '#16110e', umber: '#0f0c0b', pearl: '#54392a' };
// what each thing to wear is cut from: the chest, the arms (null: bare), the legs, the boots. 'dye': wool, in the dye chosen
const CUT = {
  coat: ['dye', '#46342b', '#33292a', '#b48d62'],
  cloak: ['#b7a686', '#a39274', '#33292a', '#b48d62'],
  wrap: ['#d6cab2', null, '#33292a', '#b48d62'],
  suit: ['#2a2e36', '#2a2e36', '#2a2e36', '#3a3d44'],
  jacket: ['dye', 'dye', '#3b4250', '#6b4a33'],
};

// [height, half-width, half-depth | [front, back], where its middle is (z)]
const PELVIS = squared([[-0.1, 0.07, [0.07, 0.08]], [-0.04, 0.15, [0.09, 0.105]], [0.02, 0.168, [0.095, 0.115]], [0.08, 0.15, [0.09, 0.1]], [0.13, 0.135, [0.085, 0.09]]], 2.3);
const TORSO = squared([[-0.02, 0.144, [0.097, 0.102]], [0.06, 0.134, [0.091, 0.095]], [0.16, 0.144, [0.1, 0.1]], [0.27, 0.166, [0.116, 0.108]], [0.36, 0.172, [0.108, 0.105]], [0.415, 0.15, [0.09, 0.095]], [0.455, 0.088, [0.07, 0.075], -0.005], [0.48, 0.06, [0.056, 0.06], -0.008]], 2.4);
// a tail and a braid: how thick each is, point by point from where it is bound ([across, through] for the braid: it lies flat)
const TAIL = [0.017, 0.026, 0.028, 0.026, 0.022, 0.017, 0.011, 0.005];
const BRAID = Array.from({ length: 14 }, (_, i) => { const k = (i % 2 ? 0.74 : 1) * (1 - 0.3 * i / 13) * (i === 13 ? 0.45 : 1); return [0.019 * k, 0.014 * k]; });
// limbs: [how far along, half-width, half-depth, z]
const THIGH = [[0, 0.082, 0.09], [0.25, 0.08, 0.088], [0.6, 0.066, 0.072], [0.9, 0.054, 0.058], [1, 0.05, 0.054]];
const SHIN = [[0, 0.05, 0.056], [0.2, 0.052, 0.062, -0.008], [0.45, 0.046, 0.054, -0.006], [0.8, 0.034, 0.038], [1, 0.03, 0.034]];
const SHAFT = [[-0.186, 0.058, 0.061, -0.004], [-0.22, 0.054, 0.058, -0.005], [-0.265, 0.058, 0.06, -0.004], [-0.31, 0.05, 0.054, -0.002], [-0.35, 0.054, 0.056], [-0.4, 0.046, 0.05], [-0.445, 0.045, 0.05]];
// a foot, along its length from the heel: [how far ahead of the ankle, half-width, [below, above] its middle, how far under the ankle its middle is]
const FOOT = squared([[-0.05, 0.03, [0.03, 0.03], 0.05], [-0.02, 0.041, [0.034, 0.05], 0.046], [0.03, 0.045, [0.034, 0.042], 0.046], [0.08, 0.049, [0.03, 0.026], 0.05], [0.13, 0.05, [0.026, 0.016], 0.054], [0.178, 0.044, [0.022, 0.012], 0.058]], 2.6);
const UPPER = [[0, 0.056, 0.058], [0.3, 0.052, 0.056], [0.75, 0.042, 0.046], [1, 0.038, 0.04]];
const FORE = [[0, 0.04, 0.042], [0.25, 0.042, 0.046], [0.7, 0.032, 0.034], [1, 0.027, 0.024]];

// The face, the hands and the hair on the head are MakeHuman's (./kin.js: a CC0 mesh, numbers only). Each is decoded
// once; every body gets its own copy, since a right hand is a left one mirrored in place (../shape.js).
const decoded = new Map();
const raw = (b64, T) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T(u.buffer); };
function kin(part, uvScale = 8) {
  if (!decoded.has(part)) {
    const pos = raw(part.pos, Int16Array), nrm = raw(part.nrm, Int8Array), uv = part.uv ? raw(part.uv, Uint16Array) : null;      // hair has no map, and no UVs
    decoded.set(part, { pos: Float32Array.from(pos, (x) => x * 1e-5), nrm: Float32Array.from(nrm, (x) => x / 127), uv: uv ? Float32Array.from(uv, (x) => (x / 65535) * uvScale) : null,
      idx: raw(part.idx, Uint16Array), col: part.col ? Float32Array.from(raw(part.col, Uint8Array), (x) => x / 255) : null });
  }
  const d = decoded.get(part), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos.slice(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nrm.slice(), 3));
  if (d.uv) g.setAttribute('uv', new THREE.BufferAttribute(d.uv.slice(), 2));
  if (d.col) g.setAttribute('color', new THREE.BufferAttribute(d.col.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(d.idx.slice(), 1));
  return g;
}
// an eye: white, its iris and pupil looking down +Z (a sphere's +Z is its map's u = 0.25, v = 0.5)
let eyeMap = null;
function eyeTexture() {
  if (eyeMap || typeof document === 'undefined') return eyeMap;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), cx = 64, cy = 64;
  g.fillStyle = '#e8e1d8'; g.fillRect(0, 0, 256, 128);
  let r = g.createRadialGradient(cx, cy, 14, cx, cy, 30); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(120,90,80,0.25)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 128);
  r = g.createRadialGradient(cx, cy, 2, cx, cy, 19); r.addColorStop(0, '#6b4a2f'); r.addColorStop(0.7, '#4a3020'); r.addColorStop(1, '#1d130d');
  g.fillStyle = r; g.beginPath(); g.arc(cx, cy, 19, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = 'rgba(160,120,80,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const a = (i / 40) * 2 * Math.PI; g.beginPath(); g.moveTo(cx + 8 * Math.cos(a), cy + 8 * Math.sin(a)); g.lineTo(cx + 17 * Math.cos(a + 0.05), cy + 17 * Math.sin(a + 0.05)); g.stroke(); }
  g.fillStyle = '#080605'; g.beginPath(); g.arc(cx, cy, 7, 0, 2 * Math.PI); g.fill();
  eyeMap = new THREE.CanvasTexture(c); eyeMap.colorSpace = THREE.SRGBColorSpace;
  return eyeMap;
}

export function createHuman(look, { lite = false } = {}) {
  const [s, kw, kd, kl] = BUILDS[look.build] || BUILDS.even, kx = 0.3 + 0.7 * kw;
  const rig = createBiped({ scale: s, shoulder: [0.186 * kx, 0.4, 0] });
  const { hips, torso, head, legs, arms, build: B } = rig, S = stuff(lite), K = kit(), cloths = [], strands = [], front = [0, 0, 1];
  const skin = SKIN[look.skin] || SKIN.sand, dye = DYE[look.dye] || DYE.rust;
  const wear = CUT[look.clothing] ? look.clothing : 'coat', [cTop, cArm, cLegs, cBoot] = CUT[wear];
  // skin with a soft sheen where the machine allows it (light caught in it, as skin does); the face's carries its own tints
  const skinMat = (tinted = false) => {
    const m = lite ? S.skin(skin) : surfaced(new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.58, metalness: 0, sheen: 0.4, sheenRoughness: 0.5, sheenColor: shade(skin, 0.3) }), 'skin', 0.35);
    m.vertexColors = tinted;
    return m;
  };
  const M = {
    skin: skinMat(), hair: S.plain(HAIR[look.skin] || HAIR.sand, { roughness: 0.8 }),
    top: cTop === 'dye' ? S.wool(dye) : S.linen(cTop), legs: S.linen(cLegs), boot: S.leather(cBoot),
    belt: S.linen('#c9a877'), plate: S.ceramic('#ece6da'), bronze: S.bronze('#a9733d'),
  };
  M.sleeve = cArm === 'dye' ? M.top : cArm ? S.linen(cArm) : M.skin;
  const topTile = cTop === 'dye' ? TILE.wool : TILE.linen, armTile = cArm === 'dye' ? TILE.wool : cArm ? TILE.linen : TILE.skin;
  // what is made only when it is worn: the dye's wool, and the same hanging free (seen from both sides, its hem darker)
  const wool = () => (cTop === 'dye' ? M.top : S.wool(dye)), fall = () => [S.wool(dye, { side: DoubleSide }), S.wool(shade(dye, -0.22), { side: DoubleSide })];
  const body = wide(TORSO, kw, kd), pelvis = wide(PELVIS, kw, kd);

  // ── the legs, and the boots
  K.put(hips, M.legs, loft(pelvis, { seg: 22, tile: TILE.linen }));
  for (const l of legs) {
    K.put(l.hip, M.legs, limb(B.thigh, wide(THIGH, kl), { tile: TILE.linen }));
    K.put(l.knee, M.legs, limb(B.shin, wide(SHIN, kl), { tile: TILE.linen }));
    K.put(l.knee, M.boot, loft(wide(SHAFT, kl), { seg: 14, cap: [0, 0] }));
    K.put(l.knee, M.boot, placed(hoop(0.0575 * kl, 0.0075, [1, 1.06], 18), [0, -0.186, -0.004 * kl]));
    K.put(l.ankle, M.boot, placed(loft(wide(FOOT, 0.5 + 0.5 * kl, 1), { seg: 14, cap: [0.6, 0.7] }), [0, 0, 0], [PI / 2, 0, 0]));
    rig.capsule(l.hip, [0, 0, 0], l.knee, [0, 0, 0], 0.098 * kl); rig.capsule(l.knee, [0, 0, 0], l.ankle, [0, 0, 0], 0.08 * kl);
  }
  rig.capsule(hips, [-0.07, -0.02, 0], hips, [0.07, -0.02, 0], 0.12 * Math.max(kw, kd));

  // ── the chest, the neck and the arms
  K.put(torso, M.top, loft(body, { seg: 24, tile: topTile }));
  // the neck, up into the face's own (./kin.js): its last ring is just inside where that one is cut, which leans forward
  K.put(torso, M.skin, loft([[0.42, 0.055, 0.055, -0.012], [0.458, 0.059, [0.057, 0.047], -0.004], [0.486, 0.0655, [0.07, 0.037], 0]], { seg: 16, cap: [0, 0] }));
  let bare = null, fist = null;
  for (const a of arms) {
    K.put(a.shoulder, M.sleeve, limb(0.29, wide(UPPER, kl), { tile: armTile }));
    K.put(a.elbow, M.sleeve, limb(0.26, wide(FORE, kl), { tile: armTile }));
    const h = K.own(a.hand, sided(a.side, kin(HAND)), M.skin);                      // a hand of its own bones, relaxed (./kin.js)
    // the right one closes on what it holds: the same hand, its fingers wrapped round a haft by the same bones
    if (a.side < 0) { bare = h; fist = K.own(a.hand, sided(a.side, kin(HAND_GRIP)), M.skin); fist.visible = false; }
  }

  // ── the head: MakeHuman's face (./kin.js), its lips, brows and creases in its own tints, and eyes that look out of it
  K.own(head, kin(FACE), skinMat(true));
  const eyeMat = S.plain('#ffffff', { map: eyeTexture(), roughness: 0.12 });
  for (const [x, y, z, r] of EYES) K.own(head, new THREE.SphereGeometry(r, lite ? 14 : 22, lite ? 10 : 16).translate(x, y, z), eyeMat);

  // ── the hair: five ways
  const cap = () => K.own(head, kin(CROPPED), M.hair);                   // short hair: a shell over the face's own scalp (./kin.js)
  // a length of it that hangs and swings: a line of points held at the back of the head (`root`), leaving it leaning back by
  // `lean`, and drawn as one strand as thick as `thick` says, point by point. It lies on the back, not in it.
  const strand = (root, lean, len, thick) => {
    const rows = thick.length - 1;
    const c = cloth({ anchor: head, cols: 1, rows, top: [root], len, scale: s, gravity: 6, dir: (_, r) => [0, -1, -lean * Math.max(0, 1 - (r - 1) / 3)] });
    const t = tube(rows + 1, { seg: lite ? 6 : 8, radius: (u) => { const r = thick[Math.round(u * rows)]; return Array.isArray(r) ? [r[0] * s, r[1] * s] : r * s; } });
    K.own(rig.group, t.geo, M.hair, { cull: false }); cloths.push({ cloth: c, stiff: 0.22 });
    strands.push((front) => t.set(c.points, front));
    if (strands.length === 1) rig.capsule(torso, [0, 0.14, -0.004], torso, [0, 0.43, -0.004], 0.112 * Math.max(kw, kd));
  };
  if (look.hair === 'shaved') {
    K.own(head, kin(SHORN), S.plain(mix(skin, HAIR[look.skin] || HAIR.sand, 0.5), { roughness: 0.95 }));
  } else if (look.hair === 'curls') {
    // the same cap, and a head of curls on it: over the crown and down the back (./kin.js: points on the cap, spread out)
    cap();
    const seg = lite ? 6 : 8, rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    CURLS.forEach(([x, y, z, nx, ny, nz], i) => { const r = 0.021 + 0.007 * rnd(i, 1), out = r * 0.42; K.put(head, M.hair, placed(ball([r, r * (0.8 + 0.2 * rnd(i, 2)), r], seg), [x + nx * out, y + ny * out, z + nz * out])); });
  } else if (look.hair === 'tail') {
    // drawn back and bound high in a ring of bronze: the length that hangs from it
    cap();
    K.put(head, M.bronze, placed(hoop(0.021, 0.0065, [1, 1], 12), HAIR_AT.tail, [PI / 2 - 0.55, 0, 0]));
    strand([0, HAIR_AT.tail[1] + 0.002, HAIR_AT.tail[2] + 0.005], 1.1, 0.046, TAIL);
  } else if (look.hair === 'braid') {
    // drawn back and plaited: one rope of it down the back
    cap();
    K.put(head, M.hair, placed(ball([0.023, 0.021, 0.017], 10), [0, HAIR_AT.braid[1], HAIR_AT.braid[2] + 0.004]));
    strand([0, HAIR_AT.braid[1] - 0.002, HAIR_AT.braid[2]], 0.5, 0.034, BRAID);
  } else cap();

  // ── what it wears: five things, made of these
  const at = on(body), open = (v) => 0.035 + 0.5 * v ** 1.5;
  // a shirt seen where what is worn over it opens, and its collar; the two edges of that opening
  const shirt = (mat) => {
    K.put(torso, mat, panel(body, { y: [0.075, 0.452], th: (v) => [PI / 2 - open(v), PI / 2 + open(v)], lift: 0.002, rows: 10, cols: 6, tile: TILE.linen }));
    K.put(torso, mat, placed(loft([[0, 0.058, [0.058, 0.06]], [0.028, 0.054, [0.054, 0.058]]], { seg: 16, cap: [0, 0] }), [0, 0.452, -0.008], [0.16, 0, 0]));
  };
  const edges = (mat, r) => { for (const side of [1, -1]) K.put(torso, mat, pipe(Array.from({ length: 11 }, (_, i) => at(0.07 + 0.385 * i / 10, PI / 2 - side * open(i / 10), 0.003)), { radius: () => r, seg: 6, tile: TILE.wool })); };
  // a band round the waist (from y0 to y1 on the hips, `out` proud of the coat's belt), and a ring of bronze to close one
  const waist = (mat, y0 = 0.088, y1 = 0.13, out = 0) => K.put(hips, mat, loft(wide(squared([[y0, 0.157 + out, [0.108 + out, 0.111 + out]], [(y0 + y1) / 2, 0.159 + out, [0.11 + out, 0.113 + out]], [y1, 0.155 + out, [0.106 + out, 0.11 + out]]], 2.3), kw, kd), { seg: 24, cap: [0.12, 0.12], tile: TILE.linen }));
  const buckle = () => K.put(hips, M.bronze, placed(hoop(0.019, 0.0045, [1, 1], 14), [0.012 * kw, 0.109, 0.114 * kd], [PI / 2, 0, 0]));
  // a skirt hung from the waist, `rows` long: open in front with its two edges hanging apart, or all the way round.
  // The legs are inside it, so it says which way is out (./drape.js): it lies over a lifted knee, and never under it.
  const skirt = (rows, closed = false) => {
    const n = closed ? 24 : 19, gap = 0.3, ring = (c) => (closed ? PI / 2 + 2 * PI * (c + 0.5) / n : PI / 2 + gap + (2 * PI - 2 * gap) * c / (n - 1));
    const away = (c) => (closed ? 0 : c < 4 ? 1 - c / 4 : c > n - 5 ? -(1 - (n - 1 - c) / 4) : 0);
    const c = cloth({
      anchor: hips, cols: n, rows, len: closed ? 0.08 : 0.1, closed, hem: 1, tile: TILE.wool, scale: s,
      out: (i) => [Math.cos(ring(i)), 0, Math.sin(ring(i))],
      top: Array.from({ length: n }, (_, i) => { const th = ring(i), sn = Math.sin(th); return [0.156 * kw * Math.cos(th), 0.104, (sn >= 0 ? 0.106 : 0.11) * kd * sn]; }),
      dir: (i, r) => { const th = ring(i) + 0.7 * away(i), f = (r === 1 ? 0.42 : 0.2) + 0.08 * Math.abs(away(i)); return [Math.cos(th) * f, -1, Math.sin(th) * f]; },
    });
    K.own(rig.group, c.geo, fall(), { cull: false }); cloths.push({ cloth: c, stiff: 0.14 });
  };
  // a short length of linen hanging: from a bone, between two points on it
  let linen = null;
  const hang = (bone, top, rows, len, dir = [0, -1, 0.06]) => {
    const c = cloth({ anchor: bone, cols: 2, rows, len, tile: TILE.linen, scale: s, top, dir: () => dir });
    K.own(rig.group, c.geo, linen ||= S.linen('#c9a877', { side: DoubleSide }), { cull: false }); cloths.push({ cloth: c, stiff: 0.2 });
  };

  if (wear === 'coat') {
    // the coat: its opening over a shirt, the plates on the shoulders, the belt, and the skirt that hangs from it
    shirt(S.linen('#3a2c27')); edges(M.top, 0.0055);
    for (const side of [1, -1]) {
      // three plates, each over the one below: the first on the shoulder, two on the arm
      K.put(torso, M.plate, placed(ball([0.062, 0.046, 0.086], 14), [side * 0.202 * kx, 0.412, 0], [0, 0, -side * 0.42]));
      const arm = rig.arms[side > 0 ? 0 : 1].shoulder;
      for (const [x, y, r] of [[0.04, -0.035, [0.034, 0.062, 0.08]], [0.036, -0.092, [0.03, 0.054, 0.072]]]) {
        K.put(arm, M.plate, placed(ball(r, 14), [side * x * kl, y, 0], [0, 0, side * 0.1]));
        K.put(arm, M.bronze, placed(hoop(r[2] * 0.56, 0.0034, [r[0] / r[2], 1], 22), [side * (x * kl + 0.006), y - r[1] * 0.83, 0], [0, 0, side * 0.1]));
      }
    }
    waist(M.belt); buckle(); skirt(8);
    hang(hips, [[0.062 * kw, 0.092, 0.114 * kd], [0.03 * kw, 0.092, 0.117 * kd]], 5, 0.06);
  } else if (wear === 'cloak') {
    // a linen tunic, open at the throat and belted in leather; over it a cloak of the dye's wool to the calves, rolled at the
    // neck and held by a ring. It lies on the shoulders and the arms, and they move it.
    K.put(torso, M.skin, panel(body, { y: [0.34, 0.452], th: (v) => [PI / 2 - 0.36 * v, PI / 2 + 0.36 * v], lift: 0.002, rows: 5, cols: 4, tile: TILE.skin }));
    waist(S.leather('#4a372b')); buckle();
    const n = 21, gap = 0.8, ring = (c) => PI / 2 + gap + (2 * PI - 2 * gap) * c / (n - 1);
    const cape = cloth({
      anchor: torso, cols: n, rows: 10, len: [0.09, 0.1, 0.11, 0.115, 0.115, 0.115, 0.115, 0.115, 0.115, 0.115], hem: 1, tile: TILE.wool, scale: s,
      out: (c) => [Math.cos(ring(c)), 0.5, Math.sin(ring(c))],
      top: Array.from({ length: n }, (_, c) => [0.105 * kx * Math.cos(ring(c)), 0.45, -0.006 + 0.09 * kd * Math.sin(ring(c))]),
      // its first row goes out over the shoulders (level, at the sides) and down the back (behind); then it falls
      dir: (c, r) => { const th = ring(c), side = Math.abs(Math.cos(th)), f = r === 1 ? 1 + 2 * side : r === 2 ? 0.5 : 0.1; return [Math.cos(th) * f, r === 1 ? -(1 - 0.85 * side) : -1, Math.sin(th) * f]; },
    });
    K.own(rig.group, cape.geo, fall(), { cull: false }); cloths.push({ cloth: cape, stiff: 0.2 });
    K.put(torso, wool(), placed(hoop(0.084, 0.026, [1.2 * kx, kd], 20), [0, 0.466, -0.006]));
    K.put(torso, M.bronze, placed(hoop(0.017, 0.0045, [1, 1], 14), [0, 0.46, 0.084 * kd + 0.02], [PI / 2, 0, 0]));
    // what the cloak lies on is a little bigger than what is under it: its cloth is cut coarse, and a chord of it would cut the arm
    // what it lies on is drawn fatter than the body under it: a cloth is flat between its points, and cuts corners
    rig.capsule(torso, [-0.186 * kx, 0.395, 0], torso, [0.186 * kx, 0.395, 0], 0.084); rig.capsule(torso, [0, 0.12, 0], torso, [0, 0.33, 0], 0.118 * Math.max(kw, kd));
    for (const a of arms) {
      rig.capsule(a.shoulder, [0, 0, 0], a.shoulder, [0, 0, 0], 0.056 * kl + 0.036);
      rig.capsule(a.shoulder, [0, 0, 0], a.elbow, [0, 0, 0], 0.052 * kl + 0.03); rig.capsule(a.elbow, [0, 0, 0], a.hand, [0, 0, 0], 0.044 * kl + 0.028);
    }
  } else if (wear === 'wrap') {
    // a length of the dye's wool wound round the hips and thrown over the left shoulder, on pale linen; a woven sash with its
    // end hanging; the arms bare, a ring of bronze on one and a band on the other
    const band = (c0, c1) => panel(body, { y: [-0.02, 0.452], th: (v) => { const c = c0 + (c1 - c0) * v, h = 0.3 - 0.1 * v; return [c - h, c + h]; }, lift: 0.012, rows: 14, cols: 5, tile: TILE.wool });
    K.put(torso, wool(), band(PI - 0.45, 0.2)); K.put(torso, wool(), band(PI + 0.45, 2 * PI - 0.2));
    waist(M.belt, 0.062, 0.15, 0.004); skirt(8, true);
    hang(hips, [[-0.03 * kw, 0.09, 0.119 * kd], [-0.068 * kw, 0.09, 0.115 * kd]], 6, 0.06);
    K.put(arms[0].shoulder, M.bronze, placed(hoop(0.0525 * kl, 0.006, [1, 1.05], 18), [0, -0.1, 0]));
    K.put(arms[1].elbow, M.bronze, placed(hoop(0.03 * kl, 0.0055, [1, 0.95], 16), [0, -0.225, 0]));
  } else if (wear === 'suit') {
    // a close dark suit with the dye let into its sides; plates of pale ceramic over it; seams that glow
    const glow = S.glow('#c4f1ff'), line = (bone, points) => K.put(bone, glow, pipe(points, { radius: () => 0.0028, seg: 5 }));
    for (const mid of [0, PI]) K.put(torso, wool(), panel(body, { y: [0, 0.35], th: [mid - 0.4, mid + 0.4], lift: 0.003, rows: 8, cols: 4, tile: TILE.wool }));
    K.put(torso, M.plate, panel(body, { y: [0.21, 0.435], th: (v) => [PI / 2 - 0.5 - 0.4 * v, PI / 2 + 0.5 + 0.4 * v], lift: 0.011, rows: 8, cols: 8 }));      // the chest
    K.put(torso, M.plate, panel(body, { y: [0.24, 0.43], th: [1.5 * PI - 0.62, 1.5 * PI + 0.62], lift: 0.01, rows: 6, cols: 6 }));                                // the back
    K.put(torso, M.plate, placed(hoop(0.064, 0.011, [1.12, 1], 18), [0, 0.468, -0.008]));                                                                      // the collar
    line(torso, Array.from({ length: 9 }, (_, i) => at(0.2, PI / 2 - 0.52 + 1.04 * i / 8, 0.006)));                                                             // under the chest's plate
    line(torso, Array.from({ length: 5 }, (_, i) => at(0.06 + 0.13 * i / 4, PI / 2, 0.004)));                                                                   // and down from it
    K.put(torso, glow, placed(ball([0.015, 0.015, 0.005], 10), at(0.345, PI / 2, 0.012)));
    waist(S.linen('#1d2026'), 0.09, 0.125); K.put(hips, glow, placed(ball([0.02, 0.011, 0.006], 10), [0, 0.108, 0.115 * kd]));
    for (const a of arms) {
      const sd = a.side;
      K.put(torso, M.plate, placed(ball([0.058, 0.04, 0.074], 14), [sd * 0.2 * kx, 0.412, 0], [0, 0, -sd * 0.42]));
      K.put(a.elbow, M.plate, placed(limb(0.15, wide([[0, 0.047, 0.05], [0.5, 0.046, 0.049], [1, 0.039, 0.04]], kl), { seg: 12 }), [0, -0.045, 0]));
      line(a.shoulder, [[sd * 0.058 * kl, -0.075, 0], [sd * 0.0445 * kl, -0.25, 0]]);
      line(a.elbow, [[sd * 0.0495 * kl, -0.06, 0], [sd * 0.042 * kl, -0.185, 0]]);
    }
    const shin = along(B.shin, wide(SHIN, kl));
    for (const l of legs) {
      // a plate down the front of the shin, from the knee to the boot: round over the knee, widest under it
      K.put(l.knee, M.plate, panel(shin, { y: [-0.192, -0.014], th: (v) => { const h = v > 0.7 ? 0.95 * Math.sqrt(1 - 0.8 * ((v - 0.7) / 0.3) ** 2) : 0.7 + 0.25 * (v / 0.7); return [PI / 2 - h, PI / 2 + h]; }, lift: 0.008, rows: 8, cols: 6 }));
      K.put(l.knee, glow, placed(hoop(0.059 * kl, 0.003, [1, 1.06], 18), [0, -0.2, -0.004 * kl]));
      line(l.hip, [[l.side * 0.084 * kl, -0.04, 0], [l.side * 0.0735 * kl, -0.22, 0], [l.side * 0.056 * kl, -0.4, 0]]);
    }
  } else {
    // the jacket: short, of the dye's wool, open over a pale shirt, ribbed at the waist and the wrists; trousers; a woven
    // scarf, its two ends hanging in front
    const rib = S.wool(shade(dye, -0.26));
    shirt(S.linen('#ddd3bf')); edges(rib, 0.0075); waist(rib, 0.058, 0.108, 0.003);
    for (const a of arms) K.put(a.elbow, rib, placed(hoop(0.0295 * kl, 0.009, [1, 0.92], 14), [0, -0.243, 0]));
    K.put(torso, M.belt, placed(hoop(0.076, 0.027, [1.16, kd], 18), [0, 0.472, -0.006]));
    hang(torso, [[0.09 * kx, 0.452, 0.088 * kd], [0.05 * kx, 0.452, 0.097 * kd]], 5, 0.062, [0, -1, 0.08]);
    hang(torso, [[0.046 * kx, 0.452, 0.098 * kd], [0.008 * kx, 0.452, 0.102 * kd]], 3, 0.062, [0, -1, 0.08]);
    rig.capsule(torso, [0, 0.1, 0], torso, [0, 0.34, 0], 0.116 * Math.max(kw, kd));
  }

  K.build();
  // the strands are laid on their points once those have moved; their flat side faces the way the head does
  return bodyOf(rig, K, { eye: 1.45, cloths, grip: [0.034, -0.062, 0.004], fist: (on) => { bare.visible = !on; fist.visible = on; }, frame: strands.length ? () => { const e = head.matrixWorld.elements; front[0] = e[8]; front[1] = e[9]; front[2] = e[10]; for (const lay of strands) lay(front); } : null });
}
