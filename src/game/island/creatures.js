// creatures.js — WHAT GROWS AND LIVES ON LORD HOWE, DRAWN (three.js), from
// life.js's numbers: the kentia palms (plants.js draws them, from kentia.js's
// numbers), the sooty terns and the tropicbirds in the air, the woodhens on the
// forest floor, the green turtles in the lagoon. Each animal is a single
// instanced shape.
//
// A tern: dark above, white below, a forked tail, its
// wings beating. A tropicbird: white, two long red streamers for a tail,
// beating slowly between glides. A woodhen: brown, short-legged, its head
// going down to peck. A turtle: an olive shell, its flippers out, rocking as it
// swims, rising to breathe.
import * as THREE from 'three';
import { PALM, palmsNear, flocksOf, ternAt, nearTernAt, NEAR_TERNS, tropicsOf, tropicAt, createHens, stepHens, createTurtles, stepTurtles } from './life.js';
import { createPalms, plantsFrame } from './plants.js';

// parts gathered into one shape, each with its colour (linear light)
function merge(parts) {
  const P = [], N = [], C = [], X = [];
  for (const [g, col, extra = 0] of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const p = ng.attributes.position, n = ng.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col[0], col[1], col[2]); X.push(typeof extra === 'function' ? extra(p.getX(i), p.getY(i), p.getZ(i)) : extra); }
    if (ng !== g) ng.dispose(); g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aX', new THREE.Float32BufferAttribute(X, 1));
  return g;
}
const lin = (r, g, b) => [r ** 2.2, g ** 2.2, b ** 2.2];
// triangles from a list of [a, b, c] corners
function tris(list) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(2), 3)); g.computeVertexNormals(); return g; }

// a bird: a body pointed both ways, two wings in two pieces, a forked tail (aX: how far out along the wing)
function birdGeo(span, len, streamers = 0) {
  const s = span / 2, l = len / 2, list = [
    [[0, 0.02, l], [-0.04, 0, -l * 0.2], [0.04, 0, -l * 0.2]], [[0, 0.02, l], [0.04, 0, -l * 0.2], [0, -0.03, -l * 0.1]], [[0, 0.02, l], [0, -0.03, -l * 0.1], [-0.04, 0, -l * 0.2]],
    [[-0.04, 0, -l * 0.2], [0, 0.02, -l], [0.04, 0, -l * 0.2]],
  ];
  for (const sg of [1, -1]) {
    const rf = [sg * 0.03, 0, l * 0.3], rb = [sg * 0.03, 0, -l * 0.25], el = [sg * s * 0.48, 0, l * 0.06], tip = [sg * s, 0, -l * 0.4];
    list.push(sg > 0 ? [rf, rb, el] : [rf, el, rb], sg > 0 ? [el, rb, tip] : [el, tip, rb]);
    list.push(sg > 0 ? [[0, 0, -l * 0.8], [sg * 0.09, 0, -l * 1.45], [0, 0, -l]] : [[0, 0, -l * 0.8], [0, 0, -l], [sg * 0.09, 0, -l * 1.45]]);   // the tail's fork
  }
  const parts = [[tris(list), [1, 1, 1], (x) => Math.abs(x) / s]];
  if (streamers) for (const sg of [1, -1]) parts.push([tris([[[sg * 0.012, 0, -l], [sg * 0.03, 0, -l - streamers], [sg * 0.022, 0, -l]]]), lin(0.85, 0.12, 0.1), 0]);
  return merge(parts);
}
// a woodhen: brown, a grey-brown head, a pinkish bill, short legs (its feet at 0, its bill toward +z)
function henGeo() {
  const sphere = (r, sx, sy, sz, x, y, z) => new THREE.SphereGeometry(r, 9, 7).scale(sx, sy, sz).translate(x, y, z);
  return merge([
    [sphere(1, 0.15, 0.13, 0.22, 0, 0.22, 0), lin(0.36, 0.24, 0.14)],
    [sphere(1, 0.06, 0.065, 0.075, 0, 0.36, 0.17), lin(0.32, 0.27, 0.22)],
    [new THREE.ConeGeometry(0.018, 0.075, 6).rotateX(Math.PI / 2).translate(0, 0.35, 0.27), lin(0.62, 0.45, 0.42)],
    [new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5).translate(0.05, 0.07, 0), lin(0.6, 0.42, 0.38)],
    [new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5).translate(-0.05, 0.07, 0), lin(0.6, 0.42, 0.38)],
    [sphere(1, 0.07, 0.05, 0.1, 0, 0.27, -0.21), lin(0.26, 0.17, 0.1)],
  ]);
}
// a green turtle: an olive shell, a paler underside, a head, four flippers (aX: a flipper's reach, for their beat)
function turtleGeo() {
  const box = (sx, sy, sz, x, y, z, ry) => new THREE.BoxGeometry(sx, sy, sz).rotateY(ry).translate(x, y, z);
  return merge([
    [new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.15, 0.52), lin(0.33, 0.29, 0.16)],
    [new THREE.CylinderGeometry(0.4, 0.4, 0.03, 14).scale(1, 1, 1.22).translate(0, -0.015, 0), lin(0.62, 0.58, 0.42)],
    [new THREE.SphereGeometry(0.1, 8, 6).scale(1, 0.8, 1.3).translate(0, 0, 0.6), lin(0.38, 0.38, 0.3)],
    [box(0.48, 0.03, 0.15, 0.48, -0.01, 0.22, -0.5), lin(0.36, 0.36, 0.29), 1], [box(0.48, 0.03, 0.15, -0.48, -0.01, 0.22, 0.5), lin(0.36, 0.36, 0.29), -1],
    [box(0.2, 0.03, 0.12, 0.3, -0.01, -0.45, 0.4), lin(0.36, 0.36, 0.29), 0.5], [box(0.2, 0.03, 0.12, -0.3, -0.01, -0.45, -0.4), lin(0.36, 0.36, 0.29), -0.5],
  ]);
}

export function createLife(scene, { lite = false, ground, shape, look = null }) {
  const geos = [], mats = [], group = new THREE.Group(), time = { value: 0 };
  group.name = 'life'; scene.add(group);
  const add = (geo, mat, n) => { geos.push(geo); mats.push(mat); const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); return m; };
  // what moves in the wind or beats its wings: a vertex's aX says how much
  const moving = (mat, body) => { mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aX;').replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`); }; return mat; };

  // ---- the palms (plants.js): the list round the body, nearest first, planted again as the body goes; how each is drawn
  // goes by its distance from the eye (frame, below)
  const NEAR = lite ? 115 : PALM.near;
  const palms = createPalms(group, { lite, twins: look ? look.twins : null });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
  let palmAt = null, sites = '', list = [], planted = false;
  // the palms round (cx, cz), but none where a building stands (skip(x, z))
  function plant(cx, cz, skip = null) {
    list = palmsNear(ground, cx, cz, NEAR).filter((p) => !skip || !skip(p.x, p.z)).map((p) => [p, Math.hypot(p.x - cx, p.z - cz)]).sort((a, b) => a[1] - b[1]).map(([p]) => p);
    palmAt = [cx, cz]; planted = true;
    return list.length;
  }

  // ---- the birds
  const flocks = flocksOf(shape), tropics = tropicsOf(shape), nTerns = flocks.reduce((s, f) => s + f.n, 0) + NEAR_TERNS;
  let near = null;                                  // the near band's centre: x, z, and the ground's height under it
  const birdMat = (top, bottom, beat, glide) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aX;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = float(gl_InstanceID) * 1.618;
          float beat = sin(uTime * ${beat.toFixed(2)} + ph) * (${glide.toFixed(2)} < 0.5 ? 1.0 : smoothstep(0.2, 0.9, sin(uTime * 0.7 + ph)));
          transformed.y += aX * aX * 0.42 * beat * ${(1).toFixed(1)};`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= gl_FrontFacing ? vec3(${top.join(', ')}) : vec3(${bottom.join(', ')});`);
    };
    return m;
  };
  const terns = add(birdGeo(0.95, 0.42), birdMat(lin(0.14, 0.14, 0.16), lin(0.92, 0.92, 0.9), 9.5, 0), nTerns);
  const tropicMesh = add(birdGeo(1.1, 0.5, 0.42), birdMat(lin(0.95, 0.95, 0.93), lin(0.97, 0.97, 0.96), 5.5, 1), tropics.length);

  // ---- the woodhens and the turtles
  const hensOf = createHens(7), hens = add(henGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), hensOf.hens.length);
  const turtleList = createTurtles(ground, shape), turtles = add(turtleGeo(), moving(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    'float ph = float(gl_InstanceID) * 2.1; transformed.y += aX * abs(position.x) * 0.25 * sin(uTime * 2.2 + ph);'), turtleList.length);

  let clock = 0;
  return {
    group, plant, palms,
    // a frame's palms as the eye sees them (island.js, before the shadow maps): the shaders' time and eye, and the whole
    // palms round the eye chosen again as it moves
    frame(camera) { plantsFrame(time.value, camera.position); palms.update(list, camera.position, planted); planted = false; },
    // one frame: the palms round the body (planted again as it goes), the birds where they are at t, the hens and
    // turtles a step on; a turtle breaking the surface rings the water
    live(dt, t, body, drop, world = null) {
      time.value = t; clock += dt;
      // planted again as the body goes, and when a building goes up or comes down (no palm grows in a building)
      const now = world ? world.buildings.filter((b) => b.down < 0).map((b) => `${b.kind}${Math.round(b.x)},${Math.round(b.z)}`).join(';') : '';
      if (!palmAt || now !== sites || Math.hypot(body.p[0] - palmAt[0], body.p[2] - palmAt[1]) > 22) { sites = now; plant(body.p[0], body.p[2], world ? world.built : null); }
      let n = 0;
      for (const f of flocks) for (let k = 0; k < f.n; k++) {
        const b = ternAt(f, k, t);
        E.set(0, b.yaw, b.bank, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(b.x, b.y, b.z), Q, S.setScalar(1.3)); terns.setMatrixAt(n++, M);
      }
      // the band near the body, its centre following it slowly
      if (!near) near = [body.p[0], body.p[2], 0];
      const kf = 1 - Math.exp(-0.15 * dt); near[0] += (body.p[0] - near[0]) * kf; near[1] += (body.p[2] - near[1]) * kf;
      near[2] = Math.max(0, ground.height(near[0], near[1]));
      for (let k = 0; k < NEAR_TERNS; k++) { const b = nearTernAt(near, k, t); b.y = Math.max(b.y, ground.height(b.x, b.z) + 18); E.set(0, b.yaw, b.bank, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(b.x, b.y, b.z), Q, S.setScalar(1.3)); terns.setMatrixAt(n++, M); }
      terns.count = n; terns.instanceMatrix.needsUpdate = true;
      tropics.forEach((b, k) => { const q = tropicAt(b, t, ground); E.set(0, q.yaw, q.bank, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(q.x, q.y, q.z), Q, S.setScalar(1.4)); tropicMesh.setMatrixAt(k, M); });
      tropicMesh.count = tropics.length; tropicMesh.instanceMatrix.needsUpdate = true;
      stepHens(hensOf, ground, body, Math.min(dt, 0.1));
      let h = 0;
      for (const hen of hensOf.hens) {
        if (!hen.placed) continue;
        const peck = hen.peck > 0 ? 0.7 * Math.max(0, Math.sin(hen.peck * Math.PI)) : 0, bob = hen.mode === 'wander' || hen.mode === 'curious' || hen.mode === 'scurry' ? 0.02 * Math.abs(Math.sin(t * (hen.mode === 'scurry' ? 22 : 11) + hen.k)) : 0;
        E.set(peck, hen.yaw, 0, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(hen.x, hen.y + bob, hen.z), Q, S.setScalar(1)); hens.setMatrixAt(h++, M);
      }
      hens.count = h; hens.instanceMatrix.needsUpdate = true;
      for (const [x, z] of stepTurtles(turtleList, ground, Math.min(dt, 0.1), t)) drop?.(x, z, 0.12);
      turtleList.forEach((u, k) => { E.set(0.05 * Math.sin(t * 0.9 + k), u.yaw, 0.08 * Math.sin(t * 1.1 + k), 'YXZ'); Q.setFromEuler(E); M.compose(V.set(u.x, u.y, u.z), Q, S.setScalar(1)); turtles.setMatrixAt(k, M); });
      turtles.count = turtleList.length; turtles.instanceMatrix.needsUpdate = true;
    },
    // what the view reads (the smoke): how many of each are drawn
    counts: () => ({ palms: list.length, whole: palms.count, terns: terns.count, tropicbirds: tropicMesh.count, hens: hens.count, turtles: turtles.count }),
    hens: hensOf, turtles: turtleList,
    dispose() { palms.dispose(); scene.remove(group); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}
