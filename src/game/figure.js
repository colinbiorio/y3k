// figure.js — A BODY, DRAWN. The traveller: the first figure to stand in the
// void, made of arithmetic like everything else there (no model file, nothing
// to download). gait.js says how it carries itself; this lays that on bones.
//
// What it wears is the game's three times at once: a hooded cloak and a woven
// hem (ancient), a belt and boots of leather (now), a suit with plates of pale
// metal, a dark glass face and thin seams of light (to come). `look` carries
// the colours, so the five kinds of body and their five-by-five choices have
// somewhere to arrive (GAME.md, the stages).
//
// The figure faces +Z and its left is +X. A limb hangs down its own −Y from
// the joint it turns about, so: a thigh or an arm swung forward is rotation.x
// negative, a knee bent is rotation.x positive, a chest leaning forward or a
// cape lifting behind is rotation.x positive.
import * as THREE from 'three';
import { BUILD, createGait, stepGait, legIK, land } from './gait.js';

export const LOOK = { cloak: '#9c4f36', lining: '#2a2433', suit: '#262a31', plate: '#cfd4da', leather: '#4a372b', trim: '#d9b36a', glass: '#0d1014', light: '#c9f3ff' };

const ARM = { upper: 0.29, fore: 0.26, shoulderX: 0.186, shoulderY: 0.4 };
const WAIST = 0.07;                       // the chest turns about a point this far over the hips
const CAPE = { wrap: 0.92, hang: [0.34, 0.32, 0.3], radii: [0.2, 0.235, 0.275, 0.32], share: [0.42, 0.36, 0.32] };

const V2 = (r, y) => new THREE.Vector2(Math.max(r, 1e-4), y);
// A turned shape from [radius, height] pairs listed from the bottom up (that order faces it outward).
const turned = (pairs, seg = 20, from = 0, sweep = Math.PI * 2) => new THREE.LatheGeometry(pairs.map(([r, y]) => V2(r, y)), seg, from, sweep);
// A limb from the joint it hangs from (the origin) down its own −Y, round at both
// joints; `shape` is [how far along 0…1, radius] from the top to the bottom.
function limb(length, shape, seg = 18) {
  const top = shape[0][1], bottom = shape[shape.length - 1][1], pairs = [];
  for (let i = 0; i <= 5; i++) { const a = (-1 + i / 5) * Math.PI / 2; pairs.push([bottom * Math.cos(a), -length + bottom * Math.sin(a)]); }
  for (let i = shape.length - 2; i >= 1; i--) pairs.push([shape[i][1], -length * shape[i][0]]);
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pairs.push([top * Math.cos(a), top * Math.sin(a)]); }
  return turned(pairs, seg);
}
// A hanging piece of cloth: part of a cone's wall, its top edge's middle at the origin, hanging down −Y.
// `at` is where round the body its middle is (π behind, 0 in front).
function drape(rTop, rBottom, h, wrap, at = Math.PI) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 16, 3, true, at - wrap, 2 * wrap);
  g.translate(0, -h / 2, at === 0 ? -rTop : rTop);
  return g;
}
// A band sewn on such a cloth, `down` from its top edge and `tall`, a hair proud of it.
function band(rTop, rBottom, h, wrap, at, down, tall) {
  const r = (y) => rTop + (rBottom - rTop) * (y / h) + 0.002;
  const g = new THREE.CylinderGeometry(r(down), r(down + tall), tall, 16, 1, true, at - wrap, 2 * wrap);
  g.translate(0, -down - tall / 2, at === 0 ? -rTop : rTop);
  return g;
}

export function createFigure({ look = {} } = {}) {
  const L = { ...LOOK, ...look };
  const M = {
    suit: new THREE.MeshStandardMaterial({ color: L.suit, roughness: 0.62, metalness: 0.2 }),
    plate: new THREE.MeshStandardMaterial({ color: L.plate, roughness: 0.3, metalness: 0.82 }),
    cloth: new THREE.MeshStandardMaterial({ color: L.cloak, roughness: 0.92, metalness: 0 }),
    lining: new THREE.MeshStandardMaterial({ color: L.lining, roughness: 0.85, metalness: 0, side: THREE.BackSide }),
    leather: new THREE.MeshStandardMaterial({ color: L.leather, roughness: 0.7, metalness: 0.05 }),
    trim: new THREE.MeshStandardMaterial({ color: L.trim, roughness: 0.5, metalness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ color: L.glass, roughness: 0.14, metalness: 0.75 }),
    light: new THREE.MeshBasicMaterial({ color: L.light, toneMapped: false }),
  };
  const geos = [];
  const mesh = (geo, mat, parent, at) => { const m = new THREE.Mesh(geo, mat); geos.push(geo); if (at) m.position.set(...at); parent.add(m); return m; };
  const node = (parent, at) => { const g = new THREE.Group(); if (at) g.position.set(...at); parent.add(g); return g; };
  // cloth has two sides: the dyed one out, the dark one in
  const cloth = (geo, parent, at) => { mesh(geo, M.cloth, parent, at); const inner = new THREE.Mesh(geo, M.lining); if (at) inner.position.set(...at); parent.add(inner); };

  const group = new THREE.Group();
  const tilt = node(group, [0, BUILD.pivot, 0]);
  const hips = node(tilt);

  // ── the hips, the belt, and the cloth that hangs in front
  const pelvis = mesh(new THREE.SphereGeometry(1, 20, 14), M.suit, hips, [0, -0.005, 0]); pelvis.scale.set(0.158, 0.115, 0.118);
  const beltGeo = new THREE.TorusGeometry(0.121, 0.016, 8, 30); beltGeo.rotateX(Math.PI / 2); beltGeo.scale(1, 1.35, 0.76);
  mesh(beltGeo, M.leather, hips, [0, 0.062, 0]);
  const buckle = mesh(new THREE.SphereGeometry(1, 12, 8), M.plate, hips, [0, 0.062, 0.104]); buckle.scale.set(0.03, 0.022, 0.012);
  const apron = node(hips, [0, 0.05, 0.1]);
  cloth(drape(0.13, 0.15, 0.4, 0.5, 0), apron);
  mesh(band(0.13, 0.15, 0.4, 0.5, 0, 0.36, 0.016), M.trim, apron);

  // ── the legs
  function leg(side) {
    const hip = node(hips, [side * BUILD.hip, 0, 0]);
    mesh(limb(BUILD.thigh, [[0, 0.084], [0.35, 0.079], [1, 0.056]]), M.suit, hip);
    const knee = node(hip, [0, -BUILD.thigh, 0]);
    mesh(limb(BUILD.shin, [[0, 0.056], [0.28, 0.064], [0.7, 0.048], [1, 0.04]]), M.suit, knee);
    mesh(turned([[0.046, -0.4], [0.054, -0.3], [0.07, -0.14], [0.066, -0.05], [0.058, -0.02]], 14, -1.25, 2.5), M.plate, knee);
    const cap = mesh(new THREE.SphereGeometry(1, 14, 10), M.plate, knee, [0, 0, 0.024]); cap.scale.set(0.05, 0.056, 0.04);
    const ankle = node(knee, [0, -BUILD.shin, 0]);
    const bootGeo = new THREE.CapsuleGeometry(0.046, 0.13, 6, 14); bootGeo.rotateX(Math.PI / 2); bootGeo.scale(1, 0.8, 1);
    mesh(bootGeo, M.leather, ankle, [0, -BUILD.ankle + 0.037, 0.055]);
    const cuffGeo = new THREE.TorusGeometry(0.044, 0.013, 8, 18); cuffGeo.rotateX(Math.PI / 2);
    mesh(cuffGeo, M.leather, ankle, [0, 0.012, 0]);
    const toe = mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.plate, ankle, [0, -BUILD.ankle + 0.036, 0.118]); toe.scale.set(0.048, 0.04, 0.056);
    return { hip, knee, ankle };
  }
  const legs = { L: leg(1), R: leg(-1) };

  // ── the chest, and what it carries
  const torso = node(hips, [0, WAIST, 0]);
  const chestGeo = turned([[0.118, -0.03], [0.112, 0.04], [0.125, 0.12], [0.15, 0.22], [0.168, 0.3], [0.165, 0.36], [0.13, 0.405], [0.07, 0.44], [0.052, 0.47], [0.05, 0.53]], 28);
  chestGeo.scale(1, 1, 0.68);
  mesh(chestGeo, M.suit, torso);
  const breast = mesh(new THREE.SphereGeometry(1, 18, 12), M.plate, torso, [0, 0.3, 0.098]); breast.scale.set(0.086, 0.07, 0.022);
  mesh(new THREE.TorusGeometry(0.021, 0.0045, 8, 26), M.light, torso, [0, 0.3, 0.1205]);
  for (const side of [1, -1]) {
    const pad = mesh(new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), M.plate, torso, [side * 0.21, 0.385, 0]);
    pad.scale.set(0.074, 0.052, 0.08); pad.rotation.z = -side * 0.42;
  }
  const cowlGeo = turned([[0.168, 0.362], [0.152, 0.4], [0.116, 0.445], [0.09, 0.48], [0.08, 0.52]], 26); cowlGeo.scale(1, 1, 0.84);
  cloth(cowlGeo, torso);

  function arm(side) {
    const shoulder = node(torso, [side * ARM.shoulderX, ARM.shoulderY, 0]);
    mesh(limb(ARM.upper, [[0, 0.056], [0.4, 0.05], [1, 0.041]]), M.suit, shoulder);
    const elbow = node(shoulder, [0, -ARM.upper, 0]);
    mesh(limb(ARM.fore, [[0, 0.042], [0.3, 0.046], [1, 0.031]]), M.suit, elbow);
    mesh(turned([[0.037, -0.215], [0.045, -0.13], [0.052, -0.05], [0.048, -0.032]], 16), M.plate, elbow);
    const seamGeo = new THREE.TorusGeometry(0.0375, 0.0045, 6, 22); seamGeo.rotateX(Math.PI / 2);
    mesh(seamGeo, M.light, elbow, [0, -0.222, 0]);
    const hand = mesh(new THREE.SphereGeometry(1, 12, 10), M.leather, elbow, [0, -ARM.fore - 0.05, 0]); hand.scale.set(0.026, 0.047, 0.036);
    return { shoulder, elbow, side };
  }
  const arms = { L: arm(1), R: arm(-1) };

  // ── the cape: three lengths of cloth, each hinged on the one above
  const capeHinges = [];
  let hang = node(torso, [0, 0.44, -0.125]);
  for (let i = 0; i < 3; i++) {
    capeHinges.push(hang);
    cloth(drape(CAPE.radii[i], CAPE.radii[i + 1], CAPE.hang[i], CAPE.wrap), hang);
    if (i === 2) mesh(band(CAPE.radii[2], CAPE.radii[3], CAPE.hang[2], CAPE.wrap, Math.PI, CAPE.hang[2] - 0.045, 0.018), M.trim, hang);
    else hang = node(hang, [0, -CAPE.hang[i], -(CAPE.radii[i + 1] - CAPE.radii[i])]);
  }

  // ── the head: a dark glass face with one line of light, inside a hood
  const head = node(torso, [0, 0.5, -0.005]);
  const face = mesh(new THREE.SphereGeometry(1, 26, 20), M.glass, head, [0, 0.13, 0.012]); face.scale.set(0.094, 0.118, 0.104);
  const line = [];
  for (let i = 0; i <= 24; i++) { const a = -1 + (2 * i) / 24; line.push(new THREE.Vector3(0.0935 * Math.sin(a), 0.152 - 0.004 * a * a, 0.012 + 0.1035 * Math.cos(a))); }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), 40, 0.0055, 6), M.light, head);
  const hood = node(head, [0, 0.135, -0.025]); hood.scale.set(0.118, 0.135, 0.15);
  cloth(new THREE.SphereGeometry(1, 24, 6, 0, Math.PI * 2, 0, 0.62), hood);
  cloth(new THREE.SphereGeometry(1, 24, 12, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0.62, 1.63), hood);

  const gait = createGait();
  const sin = Math.sin, cos = Math.cos;
  return {
    group, gait,
    // a landing at `speed`: the knees take it
    land(speed) { land(gait, speed); },
    // the void's own light, wrapped round the body: more of it in the dark
    setEnv(k) { for (const m of Object.values(M)) if ('envMapIntensity' in m) m.envMapIntensity = k; },
    // one frame: the pose laid on the bones. Answers where a foot came down, in the world ([x, z]).
    // `at` is where the body is drawn this frame (body.js, shown)
    update(body, dt, at = body.p) {
      const p = stepGait(gait, body, dt);
      group.position.set(at[0], at[1], at[2]);
      group.rotation.y = body.yaw;
      tilt.rotation.x = p.tilt;
      hips.position.y = p.pelvis - BUILD.pivot;
      torso.rotation.set(p.lean, p.twist, 0);
      head.rotation.x = p.head;
      let fore = 0;
      for (const [l, q] of [[legs.L, p.legL], [legs.R, p.legR]]) {
        const k = legIK(q.z, q.y);
        l.hip.rotation.x = -k.thigh; l.knee.rotation.x = k.knee; l.ankle.rotation.x = k.thigh - k.knee + q.foot;
        fore = Math.max(fore, k.thigh);
      }
      apron.rotation.x = -(fore * 0.95 + 0.03);
      for (const [a, q] of [[arms.L, p.armL], [arms.R, p.armR]]) { a.shoulder.rotation.set(-q.swing, 0, a.side * q.out); a.elbow.rotation.x = -q.elbow; }
      capeHinges.forEach((h, i) => { h.rotation.x = CAPE.share[i] * p.cape + (i ? 0.03 * i * sin(7 * gait.t + i) * Math.min(1, gait.speed / 5) : 0); });
      const s = sin(body.yaw), c = cos(body.yaw);
      return p.footfalls.map(([x, z]) => [at[0] + x * c + z * s, at[2] - x * s + z * c]);
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of Object.values(M)) m.dispose(); },
  };
}
