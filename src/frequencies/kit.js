// ============================================================================
// Small things both scenes of the frequencies room are built from (browser
// only: three.js). Colours here are written as a screen's 0..255 and turned to
// the linear light three.js works in.
// ============================================================================
import * as THREE from 'three';
import { SKY_HEAD, HAZE } from './air.js';

const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
export const lin = (byte) => LIN[byte < 0 ? 0 : byte > 255 ? 255 : byte | 0];
export const rgb = (r, g, b) => new THREE.Color(lin(r), lin(g), lin(b));

// A standard material with a few lines of its own: every fragment knows where in the world it
// is (vWp), and `fragment` may then change diffuseColor. Given the room's air (air.js), it is
// hazed as the sky is, in place of three.js's fog; `post` runs on the screen's colour just
// before; `normal` may bend the shading normal (view space). Each patch is its own program (`name`).
export function patch(material, name, { uniforms = {}, vertexHead = '', vertex = '', fragmentHead = '', fragment = '', normal = '', air = null, post = '' }) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, air || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\n' + vertexHead)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n  vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\n  vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif\n' + vertex);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;\n' + (air ? SKY_HEAD : '') + fragmentHead)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragment);
    if (normal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + normal);
    if (air || post) sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', post + (air ? HAZE : '#include <fog_fragment>'));
  };
  material.customProgramCacheKey = () => 'freq-' + name + (air ? '-air' : '');
  return material;
}
// any material, hazed by the room's air
export const hazed = (material, name, air) => patch(material, name, { air });

// several indexed geometries (position and normal) as one
export function merge(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3);
    const a = g.index.array;
    for (let k = 0; k < a.length; k++) idx[i + k] = a[k] + v;
    v += g.attributes.position.count; i += a.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// A horn at its true size, its mouth's centre at the origin and open toward +Z: an exponential
// flare from the throat (the air's limit sets it) to the mouth (the tone sets it), a rolled lip,
// and the driver behind the throat. `spec` is hornSpec()'s. The driver's size is drawn, not
// derived: the room's physics stops at the throat.
export function hornGeometry(spec, fine = true) {         // fine: true (one horn near), 'mid' (a thousand), false (the least)
  const mt = Math.max(spec.mouthDiameter / 2, 1e-3), th = Math.min(spec.throatDiameter / 2, mt * 0.98), L = Math.max(spec.length, mt * 0.05);
  const mid = fine === 'mid', n = fine === true ? 22 : mid ? 12 : 7, seg = fine === true ? 48 : mid ? 28 : 12, pts = [];
  for (let i = 0; i <= n; i++) { const s = i / n; pts.push(new THREE.Vector2(th * Math.exp(Math.log(mt / th) * s), -L * (1 - s))); }
  const parts = [new THREE.LatheGeometry(pts, seg)];
  const wide = Math.max(th * 1.45, mt * 0.16), deep = Math.max(L * 0.4, mt * 0.3);
  const drv = new THREE.CylinderGeometry(wide, wide, deep, fine === true ? 32 : mid ? 16 : 10); drv.translate(0, -L - deep / 2, 0); parts.push(drv);
  if (fine) { const lip = new THREE.TorusGeometry(mt, Math.max(0.004, mt * 0.03), mid ? 6 : 10, seg); lip.rotateX(Math.PI / 2); parts.push(lip); }
  const g = merge(parts);
  g.rotateX(Math.PI / 2);
  return g;
}

// A horn's place in the scene: +Z turned to its aim with its right hand kept level, at (x, y, z),
// s times its size. The aim is the simulation's (x across, y deep, z up); the scene's axes are
// X across, Y up, Z deep.
const F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3();
export function aimMatrix(m, h, x, y, z, s = 1) {
  F.set(h.aimX, h.aimZ || 0, h.aimY);
  if (F.lengthSq() < 1e-12) F.set(1, 0, 0);
  F.normalize();
  R.crossVectors(UP, F);
  if (R.lengthSq() < 1e-10) R.set(1, 0, 0);
  R.normalize();
  U.crossVectors(F, R);
  return m.makeBasis(R, U, F).scale(S.set(s, s, s)).setPosition(x, y, z);
}

// A horn that glows as much of what you hear is its: an instanced attribute aGlow (0..1) adds warm
// light, strongest at the mouth and gone by the throat (aAlong: 0 at the driver's back, 1 at the mouth).
export function glowing(material, air = null) {
  return patch(material, 'hornglow', {
    air,
    uniforms: { uGlow: { value: rgb(255, 146, 52).multiplyScalar(1.25) } },
    vertexHead: 'attribute float aGlow;\nattribute float aAlong;\nvarying float vGlow;\n', vertex: 'vGlow = aGlow * aAlong * aAlong * aAlong;\n',
    fragmentHead: 'uniform vec3 uGlow;\nvarying float vGlow;\n',
    fragment: 'totalEmissiveRadiance += uGlow * vGlow;',
  });
}
export function withGlow(geometry, n) {
  const p = geometry.attributes.position, along = new Float32Array(p.count);
  let lo = 0;
  for (let i = 0; i < p.count; i++) lo = Math.min(lo, p.getZ(i));
  for (let i = 0; i < p.count; i++) along[i] = lo < 0 ? Math.max(0, Math.min(1, 1 - p.getZ(i) / lo)) : 1;
  geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
  return geometry;
}
// what the horns are made of
export const bronze = () => new THREE.MeshStandardMaterial({ color: rgb(190, 150, 92), metalness: 0.9, roughness: 0.34, side: THREE.DoubleSide, envMapIntensity: 1.15 });
