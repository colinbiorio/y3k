// island.js — LORD HOWE ISLAND, DRAWN (three.js), from ground.js's numbers and
// lordhowe-shape.js. It stands where the void stands (view.js asks the same of
// both: a scene, its light and key, drops on its water, its size, its frame).
//
// The land is the grid's own triangles, coloured by what the ground is: beach
// sand low and flat by the sea, grass on the low flats, palm forest on the
// slopes, bare basalt where it is too steep to hold anything, and the moss of
// the mist forest on Mount Gower's top; a fine grain over all of it near the
// eye. The sea is one sheet at y = 0 whose colour comes from the depth under
// it (the same heights, as a texture): the lagoon's turquoise over its sand,
// the reef's crest and the shore in surf, blue going to ink offshore; the sky
// in it at a slant, the sun's glitter, and the rings a body makes. A haze
// takes the distance, so Ball's Pyramid, 28 km off, stands faint in it.
// Three lights, as the void's are named: pale (a clear day), dusk, night.
//
// Asked for (`sky: true`; view.js asks when the page's address says ?sky=true), the sky is the true one instead
// (../sky.js): the air and the Sun over the island at the world's clock's instant, the land and sea lit by them and
// standing in that air. Then the three named lights are not used here, and the sea takes its colours from the sky.
import * as THREE from 'three';
import { DROPS, RIPPLE_SPEED, RING, createDrops } from '../rings.js';
import { SEA_FLOOR, seaSheet } from './ground.js';
import { vnoise } from './life.js';
import { padDistance, toWorld as padWorld } from '../plinth.js';
import { createLife } from './creatures.js';
import { createTrueSky, canDrawTrueSky, SKY_OVER_GLSL } from '../sky.js';

export const ISLAND_LIGHTS = {
  pale: { sun: [0.55, 0.62, -0.56], sunCol: [1.0, 0.95, 0.86], sunAmt: 2.4, zenith: [0.16, 0.38, 0.74], horizon: [0.68, 0.80, 0.92], sky: [0.58, 0.70, 0.92], ground: [0.32, 0.30, 0.25], hemi: 0.9, env: 0.9, stars: 0, fog: 3.6e-5 },
  dusk: { sun: [-0.86, 0.12, 0.49], sunCol: [1.0, 0.6, 0.34], sunAmt: 1.9, zenith: [0.17, 0.2, 0.4], horizon: [0.96, 0.62, 0.45], sky: [0.55, 0.45, 0.55], ground: [0.25, 0.2, 0.18], hemi: 0.6, env: 0.6, stars: 0.15, fog: 4.4e-5 },
  night: { sun: [0.3, 0.7, 0.65], sunCol: [0.55, 0.64, 0.9], sunAmt: 0.42, zenith: [0.008, 0.012, 0.03], horizon: [0.035, 0.05, 0.09], sky: [0.06, 0.08, 0.14], ground: [0.02, 0.02, 0.03], hemi: 0.5, env: 0.25, stars: 1, fog: 5e-5 },
};

const SKY_VERT = 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FRAG = `
  varying vec3 vDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uStars;
  float h1(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0);
    vec3 c = mix(uHorizon, uZenith, pow(up, 0.55));
    c = mix(c, uHorizon * 0.55, smoothstep(0.0, -0.25, d.y));                       // under the horizon: the sea's far haze
    float s = max(dot(d, normalize(uSun)), 0.0);
    c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.08) * step(0.0, uSun.y + 0.05);
    // stars, by night: a fixed field, brighter ones rarer
    vec3 q = floor(d * 420.0); float st = h1(q);
    c += uStars * vec3(0.9, 0.92, 1.0) * smoothstep(0.9965, 1.0, st) * smoothstep(0.0, 0.15, d.y) * (0.6 + 0.4 * h1(q + 3.0));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

// what the ground is, as a colour (sRGB-ish albedo): by height, steepness, and a slow noise
function groundColour(h, s, n, out) {
  let r, g, b;
  // (the beach and the sea's floor are coloured by the fragment, from the true height: see landMat)
  if (s > 0.95) {                                    // bare basalt
    r = 0.30 + 0.07 * n; g = 0.27 + 0.06 * n; b = 0.24 + 0.05 * n;
  } else if (h > 640) {                              // the mist forest's moss on Gower's top
    r = 0.09; g = 0.18; b = 0.08;
  } else {
    const grass = (h < 26 && s < 0.2 ? 1 : 0) * Math.min(1, Math.max(0, (n - 0.35) * 2.2)), steep = Math.min(1, Math.max(0, (s - 0.6) / 0.35));
    r = 0.07 + 0.3 * grass; g = 0.17 + 0.3 * grass; b = 0.05 + 0.1 * grass;             // palm forest, or grass on the flats
    r += (0.3 - r) * steep * 0.7; g += (0.28 - g) * steep * 0.7; b += (0.24 - b) * steep * 0.7;   // thinning to rock where it steepens
  }
  // to the light's own units (the drawing works in linear light)
  out[0] = r ** 2.2 * 2.2; out[1] = g ** 2.2 * 2.2; out[2] = b ** 2.2 * 2.2;
}

// The sea's sheet (ground.js seaSheet: rings round the eye, all at y = 0, facing up), as a mesh.
function seaRings() {
  const { pos, idx } = seaSheet(), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// One grid as a mesh: the cells any corner of which is above `deepest`, as the two triangles ground.js stands on
function gridMesh(a, w, h, x0, z0, S, deepest) {
  const keep = new Int32Array(w * h).fill(-1), pos = [], nor = [], col = [], idx = [], c = [0, 0, 0];
  const H = (i, j) => a[Math.max(0, Math.min(h - 1, j)) * w + Math.max(0, Math.min(w - 1, i))];
  const vert = (i, j) => {
    const k = j * w + i;
    if (keep[k] >= 0) return keep[k];
    const y = a[k], dx = (H(i + 1, j) - H(i - 1, j)) / (2 * S), dz = (H(i, j + 1) - H(i, j - 1)) / (2 * S), m = Math.hypot(dx, dz);
    const n = new THREE.Vector3(-dx, 1, -dz).normalize(), x = x0 + i * S, z = z0 + j * S;
    groundColour(y, m, vnoise(x / 70, z / 70) * 0.7 + vnoise(x / 17, z / 17) * 0.3, c);
    keep[k] = pos.length / 3; pos.push(x, y, z); nor.push(n.x, n.y, n.z); col.push(c[0], c[1], c[2]);
    return keep[k];
  };
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const h00 = a[j * w + i], h10 = a[j * w + i + 1], h01 = a[(j + 1) * w + i], h11 = a[(j + 1) * w + i + 1];
    if (Math.max(h00, h10, h01, h11) < deepest) continue;
    const v00 = vert(i, j), v10 = vert(i + 1, j), v01 = vert(i, j + 1), v11 = vert(i + 1, j + 1);
    idx.push(v00, v01, v10, v10, v01, v11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
// the heights as a texture the sea can read its depth from (half floats: they filter everywhere)
function heightTexture(a, w, h) {
  const d = new Uint16Array(w * h);
  for (let k = 0; k < w * h; k++) d[k] = THREE.DataUtils.toHalfFloat(a[k]);
  const t = new THREE.DataTexture(d, w, h, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

const FLATS = 5;                          // levellings drawn at once (one building of each kind stands at a time)
export function createIsland({ renderer, lite = false, light = 'pale', ground, shape, sky = false }) {
  const scene = new THREE.Scene(), head = ground.head, S = head.spacing, geos = [], mats = [], texs = [];
  const time = { value: 0 }, drops = createDrops(DROPS);
  // the true sky, where it is asked for and this machine can draw it
  const air = sky && canDrawTrueSky(renderer) ? createTrueSky({ renderer, lite, lat: shape.lat, lon: shape.lon, ground }) : null;
  // ---- the sky
  const skyU = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uStars: { value: 0 } };
  const skyGeo = new THREE.IcosahedronGeometry(1, 5); geos.push(skyGeo);
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }); mats.push(skyMat);
  const dome = new THREE.Mesh(skyGeo, skyMat); dome.frustumCulled = false; dome.renderOrder = -10; dome.scale.setScalar(50000);
  scene.add(air ? air.dome : dome);
  // ---- the light: the sun (the key a building's room asks after), and the sky and ground round everything
  const key = new THREE.DirectionalLight(0xffffff, 2), fill = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(key, key.target, fill);
  scene.fog = air ? air.fog : new THREE.FogExp2(0xffffff, 3.6e-5);
  // ---- the land and the shallows round it, and Ball's Pyramid
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.35 }); mats.push(landMat);
  // ground levelled for a building (../plinth.js levelFor, ground.flats): the land's own triangles are let go of where
  // they stand above the levelled ground (FLATS_CUT), and a mesh of its own draws it (flatMat, below): at most FLATS
  const flatU = { uFlatN: { value: 0 }, uFlatA: { value: Array.from({ length: FLATS }, () => new THREE.Vector4()) },
    uFlatB: { value: Array.from({ length: FLATS }, () => new THREE.Vector4()) }, uFlatC: { value: Array.from({ length: FLATS }, () => new THREE.Vector4()) } };
  landMat.defines = { FLATS_CUT: '' };
  landMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, flatU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW;
      uniform int uFlatN; uniform vec4 uFlatA[${FLATS}]; uniform vec4 uFlatB[${FLATS}]; uniform vec4 uFlatC[${FLATS}];
      float gh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float gn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef FLATS_CUT
        for (int i = 0; i < ${FLATS}; i++) {
          if (i >= uFlatN) break;
          vec4 A = uFlatA[i], B = uFlatB[i], C = uFlatC[i];
          vec2 d = vW.xz - A.xy; float c = cos(A.z), s = sin(A.z);
          vec2 l = vec2(c * d.x - s * d.y, s * d.x + c * d.y), m = vec2(B.x + B.y, B.z + B.w) * 0.5, hs = vec2(B.y - B.x, B.w - B.z) * 0.5 - C.z;
          vec2 q = abs(l - m) - hs; float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - C.z;
          if (C.y * (1.0 - smoothstep(0.0, C.x, sd)) * (vW.y - A.w) > 0.05) discard;
        }
        #endif
        float gd = length(vW - cameraPosition);
        vec3 nw = normalize(cross(dFdx(vW), dFdy(vW))); float level = clamp(abs(nw.y), 0.0, 1.0);
        // the forest's canopy from above: crowns of palm a few metres across, light on their tops, dark between
        float crowns = gn(vW.xz * 0.21) * 0.6 + gn(vW.xz * 0.53 + 9.0) * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.7 * crowns, smoothstep(0.12, 0.0, abs(diffuseColor.g - 0.075)) * 0.9 + 0.1);
        // a grain in the ground, finer near the eye: tufts, stones
        float grain = 0.55 * gn(vW.xz * 0.9) + 0.3 * gn(vW.xz * 3.7) + 0.15 * gn(vW.xz * 13.0);
        diffuseColor.rgb *= mix(0.8 + 0.4 * grain, 1.0, smoothstep(60.0, 900.0, gd));
        diffuseColor.rgb *= 0.88 + 0.24 * gn(vW.xz * 0.018);
        // the beach: pale sand where the ground is low and gentle, its edge wandering, wet and darker at the water
        float sandy = smoothstep(2.9, 1.7, vW.y + 0.8 * (gn(vW.xz * 0.05) - 0.5)) * smoothstep(0.86, 0.95, level);
        vec3 sand = vec3(0.74, 0.64, 0.45) * (0.9 + 0.2 * grain);
        sand *= mix(0.72, 1.0, smoothstep(-0.1, 0.5, vW.y));
        // under the sea: sand going darker with depth; coral heads on the lagoon's flats
        float sea = smoothstep(0.05, -0.25, vW.y);
        vec3 floorCol = vec3(0.64, 0.56, 0.38) * mix(1.0, 0.35, smoothstep(0.0, 16.0, -vW.y)) * vec3(0.86, 0.97, 1.0);
        floorCol = mix(floorCol, vec3(0.44, 0.38, 0.26), smoothstep(0.62, 0.74, gn(vW.xz * 0.11 + 3.0)) * smoothstep(-3.0, -0.6, vW.y) * sea * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, sand, max(sandy, sea));
        diffuseColor.rgb = mix(diffuseColor.rgb, floorCol, sea);`);
  };
  // the levelled ground's own material: the land's, without the cut, a little toward the eye where the two meet
  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); mats.push(flatMat);
  flatMat.onBeforeCompile = landMat.onBeforeCompile;
  const flatMeshes = new Map();
  // one levelling's mesh: a grid in its building's frame over the pad and its eased edge (cells wholly outside it left
  // out), each point its ground as the tiles have it and how much of the level it takes; its colour that of the ground
  // it becomes (packed earth on the pad, eased into what was there)
  function flatMesh(f) {
    const pad = f.pad, m = f.blend + 0.5, cell = lite ? 2 : 1, X0 = pad[0] - m, X1 = pad[1] + m, Z0 = pad[2] - m, Z1 = pad[3] + m;
    const nx = Math.max(2, Math.min(150, Math.ceil((X1 - X0) / cell))), nz = Math.max(2, Math.min(150, Math.ceil((Z1 - Z0) / cell))), n = (nx + 1) * (nz + 1);
    const pos = new Float32Array(n * 3), base = new Float32Array(n), wt = new Float32Array(n), col = new Float32Array(n * 3), fin = new Float32Array(n), idx = [], c = [0, 0, 0];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i, lx = X0 + ((X1 - X0) * i) / nx, lz = Z0 + ((Z1 - Z0) * j) / nz, [x, z] = padWorld(f, lx, lz);
      const t = Math.max(0, Math.min(1, padDistance(pad, lx, lz) / f.blend)), w = 1 - t * t * (3 - 2 * t);
      base[k] = ground.base(x, z); wt[k] = w; fin[k] = base[k] + w * (f.level - base[k]); pos[k * 3] = x; pos[k * 3 + 2] = z;
    }
    const sx = (X1 - X0) / nx, sz = (Z1 - Z0) / nz;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i, F = (a, b) => fin[Math.max(0, Math.min(nz, b)) * (nx + 1) + Math.max(0, Math.min(nx, a))];
      const slope = Math.hypot((F(i + 1, j) - F(i - 1, j)) / (2 * sx), (F(i, j + 1) - F(i, j - 1)) / (2 * sz)), x = pos[k * 3], z = pos[k * 3 + 2];
      groundColour(fin[k], slope, vnoise(x / 70, z / 70) * 0.7 + vnoise(x / 17, z / 17) * 0.3, c);
      const e = Math.max(0, Math.min(1, (wt[k] - 0.55) / 0.45)), earth = [0.42 ** 2.2 * 2.2, 0.35 ** 2.2 * 2.2, 0.26 ** 2.2 * 2.2];
      for (let q = 0; q < 3; q++) col[k * 3 + q] = c[q] + (earth[q] - c[q]) * e * (0.85 + 0.15 * vnoise(x / 5, z / 5));
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      if (Math.max(wt[a], wt[b], wt[d], wt[e]) <= 0) continue;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, flatMat); mesh.receiveShadow = true; mesh.userData = { base, wt, k: -1 };
    return mesh;
  }
  // the levellings now on the ground, drawn as far as each is come; asked each frame
  function flats() {
    const list = ground.flats.slice(-FLATS);
    for (const [f, mesh] of flatMeshes) if (!list.includes(f)) { scene.remove(mesh); mesh.geometry.dispose(); flatMeshes.delete(f); }
    list.forEach((f, i) => {
      let mesh = flatMeshes.get(f);
      if (!mesh) { mesh = flatMesh(f); flatMeshes.set(f, mesh); scene.add(mesh); }
      const u = mesh.userData;
      if (Math.abs(u.k - f.k) > 0.002) {
        const p = mesh.geometry.attributes.position;
        for (let k = 0; k < u.base.length; k++) p.array[k * 3 + 1] = u.base[k] + f.k * u.wt[k] * (f.level - u.base[k]);
        p.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere(); u.k = f.k;
      }
      mesh.visible = f.k > 0.001;
      flatU.uFlatA.value[i].set(f.x, f.z, f.yaw, f.level); flatU.uFlatB.value[i].set(...f.pad); flatU.uFlatC.value[i].set(f.blend, f.k, 1.0, 0);
    });
    flatU.uFlatN.value = list.length;
  }
  const landGeo = gridMesh(ground.hts.main, head.w, head.h, head.x0, head.z0, S, lite ? -6 : -16); geos.push(landGeo);
  const land = new THREE.Mesh(landGeo, landMat); scene.add(land);
  const pyrGeo = gridMesh(ground.hts.pyramid, head.pw, head.ph, head.px0, head.pz0, S, -16); geos.push(pyrGeo);
  scene.add(new THREE.Mesh(pyrGeo, landMat));

  // ---- the sea
  const hTex = heightTexture(ground.hts.main, head.w, head.h), pTex = heightTexture(ground.hts.pyramid, head.pw, head.ph); texs.push(hTex, pTex);
  const seaU = {
    uTime: time, uH: { value: hTex }, uP: { value: pTex }, uDrops: { value: drops.data },
    uGrid: { value: new THREE.Vector4(head.x0, head.z0, (head.w - 1) * S, (head.h - 1) * S) }, uPGrid: { value: new THREE.Vector4(head.px0, head.pz0, (head.pw - 1) * S, (head.ph - 1) * S) },
    uSun: skyU.uSun, uSunCol: skyU.uSunCol, uZenith: skyU.uZenith, uHorizon: skyU.uHorizon, uSunAmt: { value: 1 }, uSkyAmt: { value: 1 },
  };
  // under the true sky the sea's own colour is lit by what falls on level water (in three colours), and the sky in
  // it is the sky itself, read where each ripple throws the eye's line (sky.js skyOver): these lines of its drawing
  // are written for the one or the other
  if (air) Object.assign(seaU, { uBodyAmt: { value: new THREE.Color(1, 1, 1) } }, air.seaSky);
  const seaLit = air ? 'uBodyAmt' : 'uSkyAmt', seaSky = air ? 'skyOver(r, normalize(uSun))' : 'mix(uHorizon, uZenith, pow(r.y, 0.55)) * uSkyAmt', seaFoam = air ? '(0.12 + 0.88 * uBodyAmt)' : '(0.12 + 0.88 * uSkyAmt)';
  const seaMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), transparent: true, depthWrite: false, fog: true,
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform sampler2D uH; uniform sampler2D uP; uniform vec4 uGrid; uniform vec4 uPGrid; uniform vec4 uDrops[${DROPS}];
      uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uSunAmt; uniform float uSkyAmt;${air ? ' uniform vec3 uBodyAmt;' + SKY_OVER_GLSL : ''}
      varying vec3 vW;
      #include <fog_pars_fragment>
      float sh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float sn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), u.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), u.x), u.y); }
      float ground(vec2 p) {
        vec2 a = (p - uGrid.xy) / uGrid.zw;
        if (a.x >= 0.0 && a.y >= 0.0 && a.x <= 1.0 && a.y <= 1.0) return texture2D(uH, a).r;
        vec2 b = (p - uPGrid.xy) / uPGrid.zw;
        if (b.x >= 0.0 && b.y >= 0.0 && b.x <= 1.0 && b.y <= 1.0) return texture2D(uP, b).r;
        return ${SEA_FLOOR.toFixed(1)};
      }
      // the rings a body makes (rings.js ring(), as the void's water draws them)
      vec2 ripples(vec2 p) {
        vec2 grad = vec2(0.0);
        for (int i = 0; i < ${DROPS}; i++) {
          vec4 d = uDrops[i]; float age = uTime - d.z;
          if (age < 0.0 || age > ${RING.oldest.toFixed(1)}) continue;
          vec2 q = p - d.xy; float r = length(q), s = r - ${(RIPPLE_SPEED * 2).toFixed(5)} * age;
          if (abs(s) > ${(RING.reach * RING.width * 2).toFixed(3)}) continue;
          float a = (d.w / ${((2 * Math.PI) / (RING.wavelength * 2)).toFixed(4)}) * exp(-age / ${RING.life.toFixed(3)}) * min(1.0, age / ${RING.born.toFixed(3)}) / sqrt(1.0 + r / ${RING.thin.toFixed(3)});
          float g = exp(-(s * s) / ${((RING.width * 2) ** 2).toFixed(4)});
          grad += a * g * (-2.0 * s / ${((RING.width * 2) ** 2).toFixed(4)} * cos(${((2 * Math.PI) / (RING.wavelength * 2)).toFixed(4)} * s) - ${((2 * Math.PI) / (RING.wavelength * 2)).toFixed(4)} * sin(${((2 * Math.PI) / (RING.wavelength * 2)).toFixed(4)} * s)) * q / max(r, 1e-4);
        }
        return grad;
      }
      void main() {
        float depth = max(0.0, -ground(vW.xz)), t = uTime;
        vec3 toEye = cameraPosition - vW; float dist = length(toEye); vec3 v = toEye / dist;
        // the swell and the chop, quieter in the lagoon's shelter, finer near the eye
        float calm = mix(0.35, 1.0, smoothstep(1.0, 9.0, depth));
        vec2 p = vW.xz;
        vec2 w1 = vec2(sn(p * 0.045 + vec2(t * 0.05, t * 0.03)) - 0.5, sn(p * 0.045 + vec2(17.0, t * 0.04)) - 0.5);
        vec2 w2 = vec2(sn(p * 0.31 + vec2(-t * 0.21, t * 0.17)) - 0.5, sn(p * 0.31 + vec2(5.0 - t * 0.13, 9.0)) - 0.5);
        vec2 w3 = vec2(sn(p * 1.7 + vec2(t * 0.6, -t * 0.5)) - 0.5, sn(p * 1.7 + vec2(3.0, t * 0.7)) - 0.5) * (1.0 - smoothstep(30.0, 140.0, dist));
        vec2 slope = (w1 * 0.34 + w2 * 0.2 + w3 * 0.12) * calm + ripples(p) * 1.6;
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        // its colour: the sand through the shallows, turquoise to the reef, blue to ink offshore
        vec3 shallow = vec3(0.12, 0.62, 0.62), mid = vec3(0.03, 0.34, 0.47), deep = vec3(0.012, 0.075, 0.17);
        vec3 body = mix(shallow, mid, smoothstep(1.5, 9.0, depth));
        body = mix(body, deep, smoothstep(9.0, 34.0, depth));
        body *= ${seaLit};
        // the sky in it, at a slant; the sun's glitter
        vec3 r = reflect(-v, n); r.y = abs(r.y);
        vec3 sky = ${seaSky};
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 c = mix(body, sky, fres);
        c += uSunCol * uSunAmt * pow(max(dot(r, normalize(uSun)), 0.0), 420.0) * 3.0 * step(0.0, uSun.y);
        // surf: on the reef's crest and along the shore, moving with the swell
        // surf: thin lines breaking along the reef's crest and the shore (parallel to the depth's contours), moving in
        float near = smoothstep(0.7, 0.18, depth) * smoothstep(-0.05, 0.06, depth);
        float lines = smoothstep(0.82, 0.97, sin(depth * 26.0 - t * 1.9 + 3.0 * sn(p * 0.02)) * 0.5 + 0.5);
        float lace = near * (lines * (0.45 + 0.55 * sn(p * 0.6 + vec2(t * 0.3, 0.0))) + 0.25 * smoothstep(0.3, 0.12, depth) * sn(p * 2.3 + vec2(-t * 0.4, t * 0.3)));
        c = mix(c, vec3(0.95, 0.97, 0.97) * ${seaFoam}, clamp(lace, 0.0, 1.0) * 0.85);
        // the water's clearness: shallow water shows the floor drawn under it, deep water does not
        float alpha = mix(0.62, 0.97, smoothstep(0.3, 7.0, depth));
        alpha = max(alpha, fres * 0.9 + lace);
        gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(seaMat.uniforms, seaU); mats.push(seaMat);
  // the sheet is rings round the eye, fine near it and coarse far off (it was two triangles 120 km across, whose
  // depth and places a browser may draw only roughly where they are near the eye), and it moves with the eye (its
  // colour is the world's: nothing in it is the mesh's own). It is the first see-through thing drawn, so what stands
  // over the water (a flame, a glow, a canopy of glass) is drawn over it and not under it.
  const seaGeo = seaRings(); geos.push(seaGeo);
  const sea = new THREE.Mesh(seaGeo, seaMat); sea.renderOrder = -1; sea.frustumCulled = false;
  scene.add(sea);

  // ---- what grows and lives there (creatures.js, from life.js)
  const life = createLife(scene, { lite, ground, shape });

  // ---- the lights, by name
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lightName = 'pale', indoor = 1;
  function setLight(name) {
    const L = ISLAND_LIGHTS[name] || ISLAND_LIGHTS.pale;
    lightName = ISLAND_LIGHTS[name] ? name : 'pale';
    if (air) return lightName;                       // the true sky is lit by the clock, not by a name
    skyU.uZenith.value.setRGB(...L.zenith); skyU.uHorizon.value.setRGB(...L.horizon);
    skyU.uSun.value.set(...L.sun).normalize(); skyU.uSunCol.value.setRGB(...L.sunCol); skyU.uStars.value = L.stars;
    key.color.setRGB(...L.sunCol); key.intensity = L.sunAmt * indoor;
    fill.color.setRGB(...L.sky); fill.groundColor.setRGB(...L.ground); fill.intensity = L.hemi * indoor;
    scene.fog.color.setRGB(...L.horizon); scene.fog.density = L.fog;
    seaU.uSunAmt.value = L.sunAmt / 2.4; seaU.uSkyAmt.value = name === 'night' ? 0.22 : 1;
    // the sky wrapped round whatever stands in it
    const envScene = new THREE.Scene(), d2 = new THREE.Mesh(skyGeo, skyMat); d2.frustumCulled = false; envScene.add(d2);
    const was = dome.scale.x; d2.scale.setScalar(10);
    const next = pmrem.fromScene(envScene, 0, 0.1, 100);
    envRT?.dispose(); envRT = next; dome.scale.setScalar(was);
    scene.environment = envRT.texture;
    return lightName;
  }
  setLight(light);

  return {
    scene, drops, place: 'island', ground, shape, life,
    get light() { return lightName; },
    setLight,
    setIndoor(k) { indoor = k; if (air) return; const L = ISLAND_LIGHTS[lightName]; key.intensity = L.sunAmt * k; fill.intensity = L.hemi * k; },
    // the true sky, where it is drawn: what the rooms and ships ask after (air.state), and its numbers (air.read())
    get air() { return air; },
    get key() { return key; },
    drop(x, z, amp = 0.1) { if (ground.height(x, z) < 0) drops.add(x, z, time.value, amp); },
    rebase() {},
    resize() {},
    update(t, camera) {
      time.value = t;
      flats();
      if (air) air.update({ camera, t, key, fill, sea: seaU, scene, indoor });      // the tables, the lights, the exposure; skyU.uSun is the Sun as seen
      dome.position.copy(camera.position);
      sea.position.set(camera.position.x, 0, camera.position.z);
      key.target.position.set(camera.position.x, 0, camera.position.z);
      key.position.copy(skyU.uSun.value).multiplyScalar(400).add(key.target.position);
    },
    // the island's life, a frame on: the palms round the body, the birds, the woodhens, the turtles
    live(dt, t, body, world) { life.live(dt, t, body, (x, z, a) => drops.add(x, z, time.value, a), world); },
    renderMirror() {},
    setScale() {},
    dispose() { air?.dispose(); for (const mesh of flatMeshes.values()) mesh.geometry.dispose(); flatMeshes.clear(); life.dispose(); envRT?.dispose(); pmrem.dispose(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); },
  };
}
