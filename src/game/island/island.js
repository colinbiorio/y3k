// island.js — LORD HOWE ISLAND, DRAWN (three.js), from ground.js's numbers and
// lordhowe-shape.js. It stands where the void stands (view.js asks the same of
// both: a scene, its light and key, drops on its water, its size, its frame).
//
// The land is the grid's own triangles, made of what the ground is (terrain.js). The sea (sea.js, water.js; drawn by
// terrain.js's sea material) is a sheet round the eye moved by the waves (the wind's sea, the swell, the swell
// breaking on the reef), and in one drawing the water's surface and the floor seen through it: the floor where the
// eye's line meets it once the surface has bent it, lit through the water by the light the water lets down, carried
// up through it by what the water is made of (turquoise over the lagoon's sand, blue over the reef's drop, navy
// offshore); the sky in the surface, the key light's glitter, the surf and the whitecaps; the swash up the beach is
// the land's own drawing. A haze takes the distance, so Ball's Pyramid, 28 km off, stands faint in it. Three lights,
// as the void's are named: pale (a clear day), dusk, night.
//
// Asked for (`sky`: ../sky.js itself, which view.js fetches and hands in when the page's address says ?sky=true;
// nothing here imports it, so a page without the switch never reads it), the sky is the true one instead: the air
// and the Sun over the island at the world's clock's instant, the land and sea lit by them and standing in that
// air. Then the three named lights are not used here, and the sea takes its light from the sky.
import * as THREE from 'three';
import { DROPS, RING, createDrops } from '../rings.js';
import { seaSheet } from './ground.js';
import { createWater } from './water.js';
import { underCos } from './sea.js';
import { padDistance, toWorld as padWorld } from '../plinth.js';
import { createLife } from './creatures.js';
import { createGroundLook } from './terrain.js';
import { PLANTS } from './plants.js';
import { FAR } from './far.js';
import { rockField } from './rocks.js';
import { createStones } from './stones.js';

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

// The sea's sheet (ground.js seaSheet: rings round the eye, all at y = 0, facing up), as a mesh.
function seaRings() {
  const { pos, idx } = seaSheet(), g = new THREE.BufferGeometry(), nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// One grid as a mesh: the cells any corner of which is above `deepest`, as the two triangles ground.js stands on. What
// each point is made of is worked out per pixel by terrain.js (life.js's cover(), the scans), not carried here.
function gridMesh(a, w, h, x0, z0, S, deepest, level = 0) {
  const keep = new Int32Array(w * h).fill(-1), pos = [], nor = [], idx = [];
  const H = (i, j) => a[Math.max(0, Math.min(h - 1, j)) * w + Math.max(0, Math.min(w - 1, i))];
  const vert = (i, j) => {
    const k = j * w + i;
    if (keep[k] >= 0) return keep[k];
    const y = a[k], dx = (H(i + 1, j) - H(i - 1, j)) / (2 * S), dz = (H(i, j + 1) - H(i, j - 1)) / (2 * S);
    const n = new THREE.Vector3(-dx, 1, -dz).normalize(), x = x0 + i * S, z = z0 + j * S;
    keep[k] = pos.length / 3; pos.push(x, y, z); nor.push(n.x, n.y, n.z);
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
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  if (!level) return g;
  // (`level`: its triangles parted into those whose three corners all face up past it, and the rest: two meshes of the
  // same points)
  const lv = [], st = [];
  for (let t = 0; t < idx.length; t += 3) { const p = idx[t], q = idx[t + 1], r = idx[t + 2]; (nor[3 * p + 1] >= level && nor[3 * q + 1] >= level && nor[3 * r + 1] >= level ? lv : st).push(p, q, r); }
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(st, 1) : new THREE.Uint16BufferAttribute(st, 1));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', g.attributes.position); lg.setAttribute('normal', g.attributes.normal);
  lg.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(lv, 1) : new THREE.Uint16BufferAttribute(lv, 1)); lg.boundingSphere = g.boundingSphere.clone();
  return { level: lg, steep: g };
}

const FLATS = 5;                          // levellings drawn at once (one building of each kind stands at a time)
// the land's triangles whose three corners all face within 34 degrees of straight up (a normal's rise past LEVEL) can
// never be steep rock or cliff, nor read from their sides (terrain.js: the sides past 35 degrees, rock from 40, cliffs
// from 45, each with its edge's jitter): they are drawn with the land's material made without those parts. The picture
// is the same; the shader that draws most of the land is smaller, and the GPU keeps more of its pixels in hand at once
// (0.5 to 1 ms a frame at 2940 x 1912: GAME.md, the island's frame time)
const LEVEL = 0.83;
const SHORE_CELL = -1.5;                  // m: the land's cells reach this far under the mean water (the swash's floor, the sheet's edge)
export function createIsland({ renderer, lite = false, light = 'pale', ground, shape, sky = null }) {
  const scene = new THREE.Scene(), head = ground.head, S = head.spacing, geos = [], mats = [], texs = [];
  const time = { value: 0 }, drops = createDrops(DROPS);
  // the true sky, where it is asked for and this machine can draw it
  const air = sky && sky.canDrawTrueSky(renderer) ? sky.createTrueSky({ renderer, lite, lat: shape.lat, lon: shape.lon, ground }) : null;
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
  // ---- the ground (terrain.js): what each pixel of it is made of, the land's own shadow and the sky's share, and the
  // shadow maps round the eye for what stands on it. A phone (a coarse pointer on a small screen) takes the lighter path:
  // the 512 maps, one scale read from above, two shadow maps.
  const phone = !!globalThis.matchMedia?.('(pointer: coarse)')?.matches && Math.min(globalThis.screen?.width || 1e4, globalThis.screen?.height || 1e4) < 900;
  // ---- the sea's waves and map (water.js): on the lighter path one band of the wind's sea, made once
  const water = createWater({ renderer, lite: lite || phone, ground, shape });
  // ---- where the island's rocks lie (rocks.js: the talus under the walls, the rocky shores), worked out once for the
  // ground (a plainer island made after this one reads the same)
  const field = (ground.rocks ||= rockField(ground, shape, water.map));
  const look = createGroundLook({ renderer, lite: lite || phone, phone, ground, scene, key, water, rocks: field });
  // ---- the land and the shallows round it, and Ball's Pyramid. Under the true sky the land takes the whole of the
  // wrapped sky's light (the other half of the sky's fill: sky.js); under the present one, as it was painted (0.35).
  // ground levelled for a building (../plinth.js levelFor, ground.flats): the land's own triangles are let go of where
  // they stand above the levelled ground (FLATS_CUT), and a mesh of its own draws it (flatMat, below): at most FLATS
  const flatU = { uFlatN: { value: 0 }, uFlatA: { value: Array.from({ length: FLATS }, () => new THREE.Vector4()) },
    uFlatB: { value: Array.from({ length: FLATS }, () => new THREE.Vector4()) }, uFlatC: { value: Array.from({ length: FLATS }, () => new THREE.Vector4()) } };
  const cut = {
    uniforms: flatU,
    pars: `uniform int uFlatN; uniform vec4 uFlatA[${FLATS}]; uniform vec4 uFlatB[${FLATS}]; uniform vec4 uFlatC[${FLATS}];`,
    body: `
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
`,
  };
  // two of it: the land as it is, and the land with the cut, drawn only while a levelling stands (a shader that can
  // discard a pixel cannot have its hidden pixels dropped before it runs on a tiled GPU: 0.6 ms a frame at 2940 x 1912)
  const landMat = look.land(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: air ? 1 : 0.35 }), cut); mats.push(landMat);
  const landCutMat = look.land(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: air ? 1 : 0.35 }), cut); mats.push(landCutMat);
  landCutMat.defines = { FLATS_CUT: '' };
  const levelMat = look.land(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: air ? 1 : 0.35 }), cut); mats.push(levelMat);
  levelMat.defines = { ISLE_NO_STEEP: '', ISLE_NO_FACE: '' };
  const levelCutMat = look.land(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: air ? 1 : 0.35 }), cut); mats.push(levelCutMat);
  levelCutMat.defines = { ISLE_NO_STEEP: '', ISLE_NO_FACE: '', FLATS_CUT: '' };
  // the levelled ground's own material: the land's, without the cut, a little toward the eye where the two meet
  const flatMat = look.flat(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: air ? 1 : 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); mats.push(flatMat);
  const flatMeshes = new Map();
  // one levelling's mesh: a grid in its building's frame over the pad and its eased edge (cells wholly outside it left
  // out), each point its ground as the tiles have it and how much of the level it takes, and how much of it is the pad's
  // packed earth (eased into what was there; terrain.js draws the rest as the ground it becomes)
  function flatMesh(f) {
    const pad = f.pad, m = f.blend + 0.5, cell = lite ? 2 : 1, X0 = pad[0] - m, X1 = pad[1] + m, Z0 = pad[2] - m, Z1 = pad[3] + m;
    const nx = Math.max(2, Math.min(150, Math.ceil((X1 - X0) / cell))), nz = Math.max(2, Math.min(150, Math.ceil((Z1 - Z0) / cell))), n = (nx + 1) * (nz + 1);
    const pos = new Float32Array(n * 3), base = new Float32Array(n), wt = new Float32Array(n), earth = new Float32Array(n), idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i, lx = X0 + ((X1 - X0) * i) / nx, lz = Z0 + ((Z1 - Z0) * j) / nz, [x, z] = padWorld(f, lx, lz);
      const t = Math.max(0, Math.min(1, padDistance(pad, lx, lz) / f.blend)), w = 1 - t * t * (3 - 2 * t);
      base[k] = ground.base(x, z); wt[k] = w; pos[k * 3] = x; pos[k * 3 + 2] = z;
    }
    for (let k = 0; k < n; k++) earth[k] = Math.max(0, Math.min(1, (wt[k] - 0.55) / 0.45));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      if (Math.max(wt[a], wt[b], wt[d], wt[e]) <= 0) continue;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEarth', new THREE.BufferAttribute(earth, 1));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, flatMat); mesh.receiveShadow = true; mesh.renderOrder = 1; mesh.userData = { base, wt, k: -1, isleLand: true };
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
    land.material = list.length ? landCutMat : landMat;
    if (landLevel) landLevel.material = list.length ? levelCutMat : levelMat;
  }
  // (only the cells that stand above the water or meet it: the sea's own drawing shows the floor under it. Drawn after
  // what stands on it, so the GPU skips what those hide, and before the sea, so the sea's sheet is skipped under the land)
  // (the land as two meshes, its level triangles and the rest; on the lighter path, which reads neither sides nor the
  // large face, one)
  const landParts = gridMesh(ground.hts.main, head.w, head.h, head.x0, head.z0, S, SHORE_CELL, lite ? 0 : LEVEL), landGeo = lite ? landParts : landParts.steep; geos.push(landGeo);
  const land = new THREE.Mesh(landGeo, landMat); land.userData.isleLand = true; land.receiveShadow = true; land.renderOrder = 1; scene.add(land);
  const landLevel = lite ? null : new THREE.Mesh(landParts.level, levelMat);
  if (landLevel) { geos.push(landParts.level); landLevel.userData.isleLand = true; landLevel.receiveShadow = true; landLevel.renderOrder = 1; scene.add(landLevel); }
  const pyrGeo = gridMesh(ground.hts.pyramid, head.pw, head.ph, head.px0, head.pz0, S, SHORE_CELL); geos.push(pyrGeo);
  const pyramid = new THREE.Mesh(pyrGeo, landMat); pyramid.userData.isleLand = true; pyramid.receiveShadow = true; pyramid.renderOrder = 1; scene.add(pyramid);

  // ---- the sea: the sheet round the eye (ground.js seaSheet), moved by the waves, drawn with terrain.js's sea material
  // (the water's surface and the floor seen through it). It follows the eye (its colour is the world's: nothing in it is
  // the mesh's own); it is drawn after the land, so the GPU skips its pixels under the land, and not over what stands
  // in the water (each shows its own submerged part)
  // (the rings still moving, first: the sea's drawing reads only those)
  const live = { uDrops: { value: new Float32Array(DROPS * 4) }, uDropsN: { value: 0 } };
  const seaMat = look.sea(new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: air ? 1 : 0.35 }), live); mats.push(seaMat);
  const seaGeo = seaRings(); geos.push(seaGeo);
  const sea = new THREE.Mesh(seaGeo, seaMat); sea.renderOrder = 2; sea.frustumCulled = false; sea.userData = { isleSea: true, isleShadow: false };
  scene.add(sea);

  // ---- what grows and lives there (creatures.js, from life.js)
  const life = createLife(scene, { lite: lite || phone, ground, shape, look });          // (a phone takes the plants' lighter path too)
  // the floor under the far forest's crowns, and the canopy's colour past where they fade (far.js)
  { const B = lite || phone ? PLANTS.lite : PLANTS, F = lite || phone ? FAR.lite : FAR; look.forest = life.far ? [B.mid, F.end - F.fade, F.end] : [1e9, 130, 165]; }

  // ---- the rocks and what the sea leaves on the beaches (stones.js, from rocks.js)
  const stones = createStones(scene, { renderer, lite: lite || phone, ground, field, look, env: air ? 1 : 0.35 });
  let built = null, sites = '';                                 // where buildings stand: no rock is drawn in one (live)

  // ---- the lights, by name
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lightName = 'pale', indoor = 1;
  function setLight(name) {
    const L = ISLAND_LIGHTS[name] || ISLAND_LIGHTS.pale;
    lightName = ISLAND_LIGHTS[name] ? name : 'pale';
    // the true sky is lit by the clock, not by a name; under it the ground's colours are its own (terrain.js). The present
    // light was painted for a ground of brighter colours (its sand reflected 0.65 to 0.74): under it the ground is raised
    // by 0.15, so the island keeps the brightness it had
    look.paint = air ? 1 : 1.15;
    if (air) return lightName;
    skyU.uZenith.value.setRGB(...L.zenith); skyU.uHorizon.value.setRGB(...L.horizon);
    skyU.uSun.value.set(...L.sun).normalize(); skyU.uSunCol.value.setRGB(...L.sunCol); skyU.uStars.value = L.stars;
    key.color.setRGB(...L.sunCol); key.intensity = L.sunAmt * indoor;
    fill.color.setRGB(...L.sky); fill.groundColor.setRGB(...L.ground); fill.intensity = L.hemi * indoor;
    scene.fog.color.setRGB(...L.horizon); scene.fog.density = L.fog;
    presentSea(L);
    // the sky wrapped round whatever stands in it
    const envScene = new THREE.Scene(), d2 = new THREE.Mesh(skyGeo, skyMat); d2.frustumCulled = false; envScene.add(d2);
    const was = dome.scale.x; d2.scale.setScalar(10);
    const next = pmrem.fromScene(envScene, 0, 0.1, 100);
    envRT?.dispose(); envRT = next; dome.scale.setScalar(was);
    scene.environment = envRT.texture;
    return lightName;
  }
  // under the present sky, the light on level water in its own units: the key's on level ground, the hemisphere's from the
  // sky, the wrapped sky's (at the land's share of it); the light's cosine under the water as the key's beam and the sky
  // share it; the glitter scaled as the painted Sun stands to its painted sky (the real Sun gives the sea's glitter about
  // five times what its light on the land would)
  function presentSea(L) {
    const s = new THREE.Vector3(...L.sun).normalize(), up = Math.max(0, s.y), k = L.sunAmt * indoor, h = L.hemi * indoor, env = 0.35 * Math.PI * 0.5;
    const E = [0, 1, 2].map((c) => k * L.sunCol[c] * up + h * L.sky[c] + env * 0.5 * (L.zenith[c] + L.horizon[c]));
    look.seaLight.uSeaE.value.set(...E);
    const direct = k * up * (0.2126 * L.sunCol[0] + 0.7152 * L.sunCol[1] + 0.0722 * L.sunCol[2]), all = 0.2126 * E[0] + 0.7152 * E[1] + 0.0722 * E[2];
    look.seaLight.uSeaLight.value.set(0.86 + (underCos(up) - 0.86) * Math.min(1, direct / Math.max(all, 1e-6)), 5, 0, 0);
  }
  setLight(light);
  let bodyAt = null, adoptN = 0;        // where the body is (live): the palms are drawn round it, the canopy beyond them

  return {
    scene, drops, place: 'island', ground, shape, life, stones,
    get light() { return lightName; },
    setLight,
    setIndoor(k) { indoor = k; if (air) return; const L = ISLAND_LIGHTS[lightName]; key.intensity = L.sunAmt * k; fill.intensity = L.hemi * k; presentSea(L); },
    // the true sky, where it is drawn: what the rooms and ships ask after (air.state), and its numbers (air.read())
    get air() { return air; },
    get key() { return key; },
    drop(x, z, amp = 0.1) { if (ground.height(x, z) < 0) drops.add(x, z, time.value, amp); },
    rebase() {},
    resize() {},
    // the ground's numbers, for the probes (terrain.js read)
    get ground() { return look; },
    update(t, camera) {
      time.value = t;
      flats();
      if (air) air.update({ camera, t, key, fill, sea: { ...look.seaLight, uSun: skyU.uSun }, scene, indoor });      // the tables, the lights, the exposure, the light on the sea; skyU.uSun is the key light as seen
      water.update(t);                                  // the wind's sea at this instant (its FFTs), the swell's time
      let n = 0; const d = drops.data, out = live.uDrops.value, tw = water.clock, t0 = t;
      for (let i = 0; i < DROPS; i++) { const age = t0 - d[i * 4 + 2]; if (age >= 0 && age <= RING.oldest) { out[n * 4] = d[i * 4]; out[n * 4 + 1] = d[i * 4 + 1]; out[n * 4 + 2] = tw - age; out[n * 4 + 3] = d[i * 4 + 3]; n++; } }
      live.uDropsN.value = n;
      dome.position.copy(camera.position);
      sea.position.set(camera.position.x, 0, camera.position.z);
      key.target.position.set(camera.position.x, 0, camera.position.z);
      key.position.copy(skyU.uSun.value).multiplyScalar(400).add(key.target.position);
      // the ground's shadows: the land's own lines toward the key light, the shadow maps round the eye; and whatever lit
      // thing has come into the scene takes them (terrain.js adoptAll)
      life.frame(camera);                               // the palms as the eye sees them (plants.js), before the shadow maps are drawn
      stones.frame(camera, built, sites);               // the rocks round the eye, each at the level its distance calls for
      look.update({ camera, dir: skyU.uSun.value, body: bodyAt });
      if (adoptN++ % 10 === 0) look.adoptAll(scene);           // a walk over the whole scene: a sixth of a second is soon enough for a new thing
    },
    // the island's life, a frame on: the palms round the body, the birds, the woodhens, the turtles
    live(dt, t, body, world) {
      bodyAt = body.p; life.live(dt, t, body, (x, z, a) => drops.add(x, z, time.value, a), world);
      built = world ? world.built : null; sites = world ? world.buildings.filter((b) => b.down < 0).map((b) => `${b.kind}${Math.round(b.x)},${Math.round(b.z)}`).join(';') : '';
    },
    renderMirror() {},
    setScale() {},
    dispose() { stones.dispose(); look.dispose(); water.dispose(); air?.dispose(); for (const mesh of flatMeshes.values()) mesh.geometry.dispose(); flatMeshes.clear(); life.dispose(); envRT?.dispose(); pmrem.dispose(); for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); },
  };
}
