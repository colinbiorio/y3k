// buildings/plinth.js — A PLATFORM UNDER A BUILDING, DRAWN (three.js), from ../plinth.js's numbers: a slab of dressed
// limestone over the building's pad, laid in courses on its sides and in flags on its top, its sides carried down into
// the ground, and a flight of steps from its front edge down to the ground before the door. It rises out of the ground
// as the building is begun (b.plinth.rose), and sinks back as the building comes down.
import * as THREE from 'three';
import { PADS, PLATFORM } from '../plinth.js';
import { boxG } from './parts.js';

export function createPlinthArt({ lite = false } = {}) {
  const group = new THREE.Group(), mats = [], geos = [];
  const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.7, 0.63, 0.52), roughness: 0.88, metalness: 0, envMapIntensity: 0.4 }); mats.push(stone);
  stone.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vNw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = (modelMatrix * vec4(transformed, 1.0)).xyz; vNw = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vP; varying vec3 vNw;
      float ph(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // courses 0.45 m high on the sides, each block 1.2 m long and every other course set over; flags 1.5 m on the top
        float side = 1.0 - smoothstep(0.55, 0.75, abs(vNw.y));
        vec2 uv = side > 0.5 ? vec2(abs(vNw.x) > abs(vNw.z) ? vP.z : vP.x, vP.y) : vP.xz;
        vec2 cell = side > 0.5 ? vec2(1.2, 0.45) : vec2(1.5, 1.5);
        float row = floor(uv.y / cell.y); uv.x += side > 0.5 ? mod(row, 2.0) * 0.6 : 0.0;
        vec2 f = fract(uv / cell) * cell, e = min(f, cell - f);
        float joint = 1.0 - smoothstep(0.012, 0.035, min(e.x, e.y));
        float tone = 0.9 + 0.2 * ph(floor(uv / cell) + 7.0);
        diffuseColor.rgb *= tone * (1.0 - 0.45 * joint);`);
  };
  stone.customProgramCacheKey = () => 'plinth-stone';
  let made = null, mesh = null;
  // the slab and the steps as one geometry, a metre tall from its foot (the group is stretched to its height and risen)
  function make(b) {
    const P = b.plinth, pad = PADS[b.kind] || PADS.shelter, H = Math.max(0.05, P.top - P.foot), g = [];
    g.push(boxG(pad[0], pad[1], 0, 1, pad[2], pad[3]));
    for (let i = 0; i < P.steps; i++) {
      const y1 = (P.top - (i + 1) * P.rise - P.foot) / H;
      if (y1 <= 0) break;
      g.push(boxG(-P.half, P.half, 0, y1, pad[3] + i * PLATFORM.going - 0.02, pad[3] + (i + 1) * PLATFORM.going));
    }
    const merged = mergeBoxes(g);
    if (mesh) { group.remove(mesh); mesh.geometry.dispose(); }
    mesh = new THREE.Mesh(merged, stone); mesh.castShadow = !lite; mesh.receiveShadow = true; group.add(mesh); geos.push(merged);
    made = P;
  }
  return {
    group,
    update(b) {
      if (!b.plinth) { group.visible = false; return; }
      if (made !== b.plinth) make(b);
      const P = b.plinth, rose = Math.max(0.001, P.rose);
      group.visible = P.rose > 0.001;
      group.position.set(b.x, P.foot, b.z); group.rotation.y = b.yaw; group.scale.set(1, Math.max(0.05, P.top - P.foot) * rose, 1);
    },
    dispose() { for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); },
  };
}
// boxes into one geometry (each already non-indexed or indexed: made non-indexed here)
function mergeBoxes(list) {
  const pos = [], nor = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position, n = ng.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (ng !== g) ng.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
