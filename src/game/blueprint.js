// blueprint.js — A BUILDING BEFORE IT IS BUILT, DRAWN (three.js). Colin, 19 Nov 2026: "when building, preview a
// blueprint/holograph of where the item will be placed with an option to confirm placement -- always prioritize the
// intersection of visual appeal and usability."
//
// The building itself, as light: the kind's own drawing (./buildings/) with every surface given one material, a
// glass of light gridded every half metre in the building's own frame (so the grid stays on it as it moves), bright
// at its edges and where its surfaces turn from the eye, a band of light climbing it. Under it, its pad on the ground,
// gridded every metre and following the ground as it is; where the ground is too uneven, a second sheet at the level
// the building would stand at, so what levelling or a platform would make of it can be seen. Its colour says what
// may be done: the pale blue of the plasma where it can go up, amber where the ground must be seen to first, red
// where something stands in the way. The view (view.js) moves it where the eye aims and asks what it may be.
import * as THREE from 'three';
import { PADS } from './plinth.js';

export const TINTS = { up: [0.42, 0.86, 1.0], steep: [1.0, 0.72, 0.28], blocked: [1.0, 0.36, 0.32] };

const VERT = `
  uniform vec2 uCentre; uniform float uYaw; uniform float uBase;
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 p = vec4(position, 1.0); vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vec2 d = w.xz - uCentre; float c = cos(uYaw), s = sin(uYaw);
    vL = vec3(c * d.x - s * d.y, w.y - uBase, s * d.x + c * d.y);
    vN = normalize(mat3(modelMatrix) * n); vV = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FRAG = `
  uniform vec3 uCol; uniform float uTime; uniform float uAlpha; uniform float uCell; uniform float uFlat;
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 q = vL / uCell, f = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec3(1e-4));
    float g = 1.0 - clamp(min(min(f.x, f.y), f.z) - 0.4, 0.0, 1.0);
    vec3 n = normalize(vN), v = normalize(vV);
    float rim = pow(1.0 - abs(dot(n, v)), 2.2) * (1.0 - uFlat);
    float band = exp(-pow((fract(vL.y / 7.0 - uTime * 0.28) - 0.5) * 9.0, 2.0)) * (1.0 - uFlat);
    float shimmer = 0.92 + 0.08 * sin(uTime * 9.0 + vL.y * 3.0);
    vec3 col = uCol * (0.55 + 0.8 * rim + 0.9 * g + 0.5 * band) + vec3(0.6) * g * 0.35;
    float a = uAlpha * shimmer * (0.1 + 0.42 * rim + 0.62 * g + 0.22 * band);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;
function holoMaterial(cell, alpha, flat = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uCentre: { value: new THREE.Vector2() }, uYaw: { value: 0 }, uBase: { value: 0 }, uCol: { value: new THREE.Color(...TINTS.up) },
      uTime: { value: 0 }, uAlpha: { value: alpha }, uCell: { value: cell }, uFlat: { value: flat } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}
// a pad's sheet: a grid of quads over the pad (and a metre round it), its heights set each time it moves
function padSheet(pad, n) {
  const g = new THREE.PlaneGeometry(1, 1, n, n).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getZ(i) + 0.5;
    p.setXYZ(i, pad[0] - 1 + (pad[1] - pad[0] + 2) * u, 0, pad[2] - 1 + (pad[3] - pad[2] + 2) * v);
  }
  g.userData.local = Float32Array.from(p.array);
  return g;
}

export function createBlueprint(scene, { arts, lite = false } = {}) {
  const group = new THREE.Group(); group.visible = false; group.renderOrder = 5; scene.add(group);
  const holo = holoMaterial(0.5, 0.8), ground = holoMaterial(1, 0.9, 1), level = holoMaterial(1, 0.55, 1);
  const ghosts = new Map();             // kind -> its drawing, as light
  const sheets = new Map();             // kind -> { ground, level } meshes
  let kind = null, at = { x: NaN, z: NaN, yaw: NaN, y: NaN }, time = 0;
  function ghost(k) {
    if (ghosts.has(k)) return ghosts.get(k);
    const art = arts[k]({ lite: true });
    art.group.traverse((o) => {
      if (o.isLight || o.isPoints || o.isLine || o.isSprite) o.visible = false;
      else if (o.isMesh) { o.material = holo; o.castShadow = o.receiveShadow = false; o.renderOrder = 6; }
    });
    const pad = PADS[k], n = lite ? 12 : Math.min(48, Math.max(16, Math.round((pad[1] - pad[0]) * 2)));
    const s = { ground: new THREE.Mesh(padSheet(pad, n), ground), level: new THREE.Mesh(padSheet(pad, 1), level) };
    s.ground.renderOrder = 5; s.level.renderOrder = 5; s.ground.frustumCulled = s.level.frustumCulled = false;
    sheets.set(k, s); ghosts.set(k, art);
    return art;
  }
  const self = {
    group,
    // show a kind where it would go: `b` { x, z, yaw, y }, the verdict ('up', 'steep', 'blocked'), and the ground's height
    show(k, b, verdict, height = null) {
      const art = ghost(k), s = sheets.get(k);
      if (kind !== k) { group.clear(); group.add(art.group, s.ground, s.level); kind = k; at.x = NaN; }
      group.visible = true;
      art.group.position.set(b.x, b.y || 0, b.z); art.group.rotation.y = b.yaw;
      for (const m of [holo, ground, level]) { m.uniforms.uCentre.value.set(b.x, b.z); m.uniforms.uYaw.value = b.yaw; m.uniforms.uBase.value = b.y || 0; m.uniforms.uCol.value.setRGB(...(TINTS[verdict] || TINTS.up)); }
      // the pad on the ground, as the ground is; and the level it would be brought to, where it is uneven
      if (b.x !== at.x || b.z !== at.z || b.yaw !== at.yaw || (b.y || 0) !== at.y) {
        Object.assign(at, { x: b.x, z: b.z, yaw: b.yaw, y: b.y || 0 });
        const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
        for (const [mesh, flat] of [[s.ground, false], [s.level, true]]) {
          const p = mesh.geometry.attributes.position, L = mesh.geometry.userData.local;
          for (let i = 0; i < p.count; i++) {
            const lx = L[i * 3], lz = L[i * 3 + 2], x = b.x + c * lx + sn * lz, z = b.z - sn * lx + c * lz;
            p.setXYZ(i, x, flat || !height ? (b.y || 0) + 0.03 : Math.max(0, height(x, z)) + 0.06, z);
          }
          p.needsUpdate = true; mesh.geometry.computeBoundingSphere();
        }
      }
      s.level.visible = verdict === 'steep';
      s.ground.visible = !!height || verdict !== 'up';
    },
    hide() { group.visible = false; },
    get shown() { return group.visible ? kind : null; },
    update(dt) { if (!group.visible) return; time += dt; holo.uniforms.uTime.value = ground.uniforms.uTime.value = level.uniforms.uTime.value = time; },
    dispose() {
      scene.remove(group);
      for (const art of ghosts.values()) art.dispose();
      for (const s of sheets.values()) { s.ground.geometry.dispose(); s.level.geometry.dispose(); }
      holo.dispose(); ground.dispose(); level.dispose(); ghosts.clear(); sheets.clear();
    },
  };
  return self;
}
