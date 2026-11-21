// ships/ark.js — THE ARK, DRAWN (three.js), from ../ships.js's numbers: an
// exploring ship eighty metres long. A long spine in bands of pale alloy and
// stone-grey ceramic; round its middle, on four spokes from a hub, the ring
// habitat, turning once a minute: its outer part a ceramic hull with rows of
// windows (warm at night), the rest glass over a garden of grass, flower beds,
// a path with lamps lit at night, cypresses and round trees, all growing toward
// the spine;
// two radiators behind it, their lights red to the left and green to the
// right; a rounded prow, and on it the observatory dome of brass ribs and
// glass on a brass skirt, the helm inside (a seat, a console with two levers,
// a dial and a pane of light) and a brass telescope on its tripod; at the
// stern four plasma engines in a cross, each a ring with its swirl and glow,
// as bright as it is driven.
//
// Its frame is the ship's: its middle at the origin, +Z ahead (the prow), +X
// its left. It is drawn turned and tipped as the numbers say.
import * as THREE from 'three';
import { ARK as S } from '../ships.js';
import { glowTexture } from '../fight.js';
import { jetPivot, aimJets } from './jets.js';
import { createGear } from './gear.js';
import { GEAR } from '../ships.js';
import { gatherer } from '../buildings/parts.js';

const RG = S.ring, DM = S.dome, EN = S.engines, TAU = 2 * Math.PI;
const rod = (a, b, r0, r1 = r0, n = 8) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), g = new THREE.CylinderGeometry(r1, r0, d.length(), n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
};
// a shape turned round the spine: a profile of [radius, z] (z rising: its faces look out) swept once round the ship's +Z
const turned = (profile, n) => { const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), n); g.rotateX(Math.PI / 2); return g; };
const SWIRL = `
  varying vec2 vUv; uniform float uTime; uniform float uOn;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x), sw = 0.5 + 0.5 * sin(a * 3.0 - r * 9.0 - uTime * (2.0 + 6.0 * uOn));
    float core = smoothstep(0.9, 0.0, r);
    vec3 c = mix(vec3(0.35, 0.6, 1.0) * (0.45 + 0.6 * sw), vec3(0.95, 0.98, 1.0), core * (0.5 + 0.5 * sw));
    gl_FragColor = vec4(c * (0.35 + 1.0 * uOn) * (1.0 + 0.5 * core), 1.0);
    #include <colorspace_fragment>
  }`;
const UV_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// a material's colour (and, if asked, its roughness, metalness and glow by night) patterned in its own object space
function patterned(base, glsl, key, nightU, { rough = '', metal = '', glow = '' } = {}) {
  const m = new THREE.MeshStandardMaterial(base);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform float uNight;\nfloat hh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + glsl);
    if (rough) f = f.replace('#include <roughnessmap_fragment>', rough);
    if (metal) f = f.replace('#include <metalnessmap_fragment>', metal);
    if (glow) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + glow);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function createArkArt({ lite = false } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(), ringG = new THREE.Group(), geos = [], mats = [];
  const keep = (m) => { mats.push(m); return m; }, add = (g, m, to = body) => { geos.push(g); const mesh = new THREE.Mesh(g, m); to.add(mesh); return mesh; };
  group.add(body); body.add(ringG); body.rotation.order = 'YXZ';
  const nightU = { value: 0 }, n = lite ? 40 : 72;
  // the spine: bands nine metres long, pale alloy (bright, metal) and stone-grey ceramic plates (dull), turn about
  const spineMat = keep(patterned({ color: 0xffffff, roughness: 0.5, metalness: 0.5, envMapIntensity: 0.9 }, `
    float band = step(0.5, fract((vObj.z + 207.0) / 9.0)), ang = atan(vObj.y, vObj.x);
    float px = abs(fract(ang * 14.0 / 6.2832 + 0.5) - 0.5), pz = abs(fract(vObj.z / 1.5 + 0.5) - 0.5) * 1.5;
    vec3 plate = vec3(0.56, 0.55, 0.52) * (0.9 + 0.14 * hh(floor(vec2(ang * 14.0 / 6.2832, vObj.z / 1.5))));
    plate *= mix(0.7, 1.0, smoothstep(0.0, 0.02, min(px * 2.5, pz)));
    vec3 alloy = vec3(0.82, 0.84, 0.87) * (0.96 + 0.04 * sin(vObj.z * 40.0));
    diffuseColor.rgb = mix(plate, alloy, band);`, 'ark-spine', nightU,
  { rough: 'float roughnessFactor = mix(0.62, 0.26, band);', metal: 'float metalnessFactor = mix(0.0, 0.9, band);' }));
  const alloy = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.82, 0.85), roughness: 0.3, metalness: 0.85, envMapIntensity: 0.9 }));
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.6, 0.59, 0.56), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
  const brass = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.6, 0.28), roughness: 0.28, metalness: 1, envMapIntensity: 1 }));
  const glass = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.75, 0.88, 0.95), roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }));
  const cushion = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.12, 0.3, 0.32), roughness: 0.9 }));

  const spine = new THREE.CylinderGeometry(S.spine, S.spine, 56, n / 2, 1, true); spine.rotateX(Math.PI / 2); spine.translate(0, 0, -3); add(spine, spineMat);
  { const G = gatherer(); for (let z = -30; z <= 24; z += 9) { const c = new THREE.TorusGeometry(S.spine + 0.05, 0.09, 6, n / 2); c.translate(0, 0, z + 2); G.put(c, 0, 0); }
    add(G.geometry(), alloy); }
  // the stern's end, a dish the engines stand round
  add(turned([[2.0, -32.7], [2.75, -32.4], [2.8, -31.2], [S.spine, -30.9]], n / 2), ceramic);
  // ---- the prow: a rounded bulb of ceramic, and on it the observatory dome
  { const g = new THREE.SphereGeometry(3.3, n / 2, 24); g.scale(1, 0.95, 1.75); g.translate(0, 0, 27.5); add(g, ceramic); }
  const [dx, dy, dz] = DM.at;
  { const g = new THREE.SphereGeometry(DM.r, n / 2, 14, 0, TAU, 0, Math.PI / 2); g.translate(dx, dy, dz); add(g, glass); }
  { const G = gatherer();
    for (let k = 0; k < 4; k++) { const m = new THREE.TorusGeometry(DM.r, 0.055, 6, 28, Math.PI); m.rotateY((k * Math.PI) / 4); m.translate(dx, dy, dz); G.put(m, 0, 0); }
    for (const e of [0.45, 0.95]) { const r = new THREE.TorusGeometry(DM.r * Math.cos(e), 0.045, 6, n / 2); r.rotateX(Math.PI / 2); r.translate(dx, dy + DM.r * Math.sin(e), dz); G.put(r, 0, 0); }
    const base = new THREE.TorusGeometry(DM.r + 0.04, 0.09, 8, n / 2); base.rotateX(Math.PI / 2); base.translate(dx, dy, dz); G.put(base, 0, 0);
    const fin = new THREE.SphereGeometry(0.13, 10, 8); fin.translate(dx, dy + DM.r + 0.08, dz); G.put(fin, 0, 0);
    const skirt = new THREE.CylinderGeometry(DM.r + 0.1, DM.r + 0.2, 1.3, n / 2, 1, true); skirt.translate(dx, dy - 0.65, dz); G.put(skirt, 0, 0);
    add(G.geometry(), brass); }
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.36, 0.24, 0.15), roughness: 0.7, side: THREE.DoubleSide }));
  { const g = new THREE.CircleGeometry(DM.r + 0.08, n / 2); g.rotateX(-Math.PI / 2); g.translate(dx, dy, dz); add(g, floorMat); }
  // the helm: a seat looking ahead, a console before it with two levers, a dial and a pane of light; the telescope beside
  const [sx, sy, sz] = S.seat;
  { const c = new THREE.BoxGeometry(0.5, 0.1, 0.48); c.translate(sx, sy - 0.02, sz); add(c, cushion);
    const back = new THREE.BoxGeometry(0.5, 0.55, 0.08); back.translate(0, 0.27, 0); back.rotateX(-0.25); back.translate(sx, sy + 0.02, sz - 0.26); add(back, cushion);
    add(rod([sx, dy, sz], [sx, sy - 0.07, sz], 0.05), brass);
    const con = new THREE.BoxGeometry(0.8, 0.7, 0.3); con.translate(0, dy + 0.35, sz + 0.8); add(con, ceramic);
    for (const lx of [-0.22, 0.22]) { add(rod([lx, dy + 0.7, sz + 0.67], [lx * 1.1, dy + 1.04, sz + 0.55], 0.015), brass); const k = new THREE.SphereGeometry(0.035, 10, 8); k.translate(lx * 1.1, dy + 1.06, sz + 0.54); add(k, brass); }
    const dial = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20); dial.rotateX(Math.PI / 2); dial.translate(-0.12, dy + 0.56, sz + 0.64); add(dial, brass); }
  const paneMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 1.0) }));
  { const g = new THREE.PlaneGeometry(0.22, 0.12); g.rotateY(Math.PI); g.translate(0.15, dy + 0.56, sz + 0.64); add(g, paneMat); }
  { const G = gatherer(), foot = [-1.3, dy, dz - 0.7];
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; G.put(rod([foot[0] + 0.4 * Math.cos(a), dy, foot[2] + 0.4 * Math.sin(a)], [foot[0], dy + 0.75, foot[2]], 0.02), 0, 0); }
    G.put(rod([foot[0] - 0.1, dy + 0.55, foot[2] - 0.5], [foot[0] + 0.12, dy + 1.9, foot[2] + 0.75], 0.13, 0.09, 14), 0, 0);
    add(G.geometry(), brass); }
  // ---- the ring habitat, on four spokes from its hub; it turns, and all that is on it with it
  const R = RG.r, T = RG.tube, rf = R + 0.55 * T, w = T * Math.sqrt(1 - 0.55 * 0.55), hullA = 0.42 * Math.PI, nr = lite ? 64 : 120;
  const tube = (a0, a1, k) => Array.from({ length: k + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / k; return [R + T * Math.cos(a), RG.z + T * Math.sin(a)]; });
  const hullMat = keep(patterned({ color: 0xffffff, roughness: 0.45, metalness: 0, envMapIntensity: 0.8 }, `
    float ang = atan(vObj.y, vObj.x), acr = vObj.z - (${RG.z.toFixed(2)});
    float sx = abs(fract(ang * 90.0 / 6.2832 + 0.5) - 0.5), sa = abs(fract(acr / 0.8 + 0.5) - 0.5);
    vec3 c = vec3(0.6, 0.59, 0.56) * (0.9 + 0.12 * hh(floor(vec2(ang * 90.0 / 6.2832, acr / 0.8 + 9.0))));
    c *= mix(0.72, 1.0, smoothstep(0.0, 0.03, min(sx, sa)));
    float wa = fract(ang * 160.0 / 6.2832), win = max(step(abs(acr), 0.3), step(abs(abs(acr) - 1.72), 0.16)) * step(0.3, wa) * step(wa, 0.7);
    diffuseColor.rgb = mix(c, vec3(0.08, 0.1, 0.14), win);`, 'ark-hull', nightU,
  { glow: 'totalEmissiveRadiance += win * vec3(1.0, 0.7, 0.38) * 0.85 * uNight;' }));
  add(turned(tube(-hullA, hullA, 18), nr), hullMat, ringG);
  add(turned(tube(hullA, TAU - hullA, 24), nr), glass, ringG);
  const gardenMat = keep(patterned({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }, `
    float ang = atan(vObj.y, vObj.x), acr = vObj.z - (${RG.z.toFixed(2)});
    float path = smoothstep(0.34, 0.26, abs(acr));
    vec2 cell = vec2(floor(ang * 48.0 / 6.2832 * 3.0), floor(acr * 2.0 + 9.0));
    vec3 grass = mix(vec3(0.2, 0.42, 0.15), vec3(0.33, 0.52, 0.19), hh(cell));
    float bed = step(0.8, hh(cell + 7.0)) * (1.0 - path);
    grass = mix(grass, mix(vec3(0.86, 0.5, 0.6), vec3(0.95, 0.84, 0.42), hh(cell + 3.0)), bed * 0.85);
    diffuseColor.rgb = mix(grass, vec3(0.74, 0.66, 0.5), path);
    float lamp = path * step(0.92, fract(ang * 40.0 / 6.2832));`, 'ark-garden', nightU,
  { glow: 'totalEmissiveRadiance += (0.12 + 2.5 * lamp) * vec3(1.0, 0.8, 0.5) * uNight;' }));
  add(turned([[rf, RG.z + w], [rf, RG.z - w]], nr), gardenMat, ringG);
  { // the trees, growing toward the spine from the garden: cypresses and round trees on their trunks, either side of the path
    const firs = gatherer(), rounds = gatherer(), trunks = gatherer(), count = lite ? 36 : 84;
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const plant = (g, th, acr, into) => { g.rotateZ(th + Math.PI / 2); g.translate(rf * Math.cos(th), rf * Math.sin(th), RG.z + acr); into.put(g, 0, 0); };
    for (let k = 0; k < count; k++) {
      const th = (k / count) * TAU + rnd() * 0.04, acr = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * (w - 0.95)), h = 0.9 + rnd() * 1.1;
      if (rnd() < 0.55) { const g = new THREE.ConeGeometry(0.22 + rnd() * 0.14, h, 7); g.translate(0, h / 2, 0); plant(g, th, acr, firs); }
      else {
        const r = 0.36 + rnd() * 0.22, g = new THREE.SphereGeometry(r, 9, 6); g.translate(0, 0.45 + r * 0.8, 0); plant(g, th, acr, rounds);
        const tr = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 5); tr.translate(0, 0.25, 0); plant(tr, th, acr, trunks);
      }
    }
    add(firs.geometry(), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 0.25, 0.12), roughness: 0.85 })), ringG);
    add(rounds.geometry(), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.24, 0.45, 0.17), roughness: 0.85 })), ringG);
    add(trunks.geometry(), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.22, 0.13), roughness: 0.9 })), ringG);
  }
  { const hub = new THREE.CylinderGeometry(3.6, 3.6, 4, n / 2); hub.rotateX(Math.PI / 2); hub.translate(0, 0, RG.z); add(hub, alloy, ringG);
    const G = gatherer();
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a); G.put(rod([3.5 * c, 3.5 * s, RG.z], [(R - T * 0.92) * c, (R - T * 0.92) * s, RG.z], 0.32, 0.32, 10), 0, 0); }
    add(G.geometry(), alloy, ringG); }
  // the hub's two collars, which stand still on the spine as the ring turns between them
  { const G = gatherer(); for (const e of [-2.2, 2.2]) { const c = new THREE.TorusGeometry(3.1, 0.22, 10, n / 2); c.translate(0, 0, RG.z + e); G.put(c, 0, 0); } add(G.geometry(), brass); }
  // ---- the radiators behind the ring, their lights red to the left and green to the right
  const radMat = keep(patterned({ color: 0xffffff, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }, `
    float st = abs(fract(vObj.z / 0.7 + 0.5) - 0.5) * 0.7;
    diffuseColor.rgb = mix(vec3(0.75, 0.56, 0.25), vec3(0.13, 0.14, 0.16), smoothstep(0.03, 0.06, st));`, 'ark-radiator', nightU));
  for (const sd of [1, -1]) { const g = new THREE.BoxGeometry(5.2, 0.08, 14); g.translate(sd * (S.spine + 2.5), 0, -19.5); add(g, radMat); }
  const tex = glowTexture(), lamps = [];
  // by night: the lamps along the garden's path (they turn with it) and a lamp in the dome
  const lampMat = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1, 0.8, 0.5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  for (let k = 0, m = lite ? 12 : 24; k < m; k++) { const a = ((k + 0.5) / m) * TAU, l = new THREE.Sprite(lampMat); l.position.set((rf - 0.7) * Math.cos(a), (rf - 0.7) * Math.sin(a), RG.z); l.scale.setScalar(1.4); ringG.add(l); }
  { const l = new THREE.Sprite(lampMat); l.position.set(dx, dy + 2.1, dz); l.scale.setScalar(3.5); body.add(l); }
  for (const [sd, col] of [[1, [1, 0.2, 0.15]], [-1, [0.2, 1, 0.35]]]) {
    const gm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(...col), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const l = new THREE.Sprite(gm); l.position.set(sd * (S.spine + 5.1), 0, -13); l.scale.setScalar(1.6); body.add(l); lamps.push(l);
  }
  // ---- four plasma engines in a cross at the stern, each on its pylon: a nacelle, a bronze ring, its swirl and its glow
  const swirlU = { uTime: { value: 0 }, uOn: { value: 0 } }, swirlMat = keep(new THREE.ShaderMaterial({ uniforms: swirlU, vertexShader: UV_VERT, fragmentShader: SWIRL, side: THREE.DoubleSide }));
  const bronze = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.44, 0.21), roughness: 0.32, metalness: 1, envMapIntensity: 0.9 }));
  const glows = [], jets = [], zm = (EN.z0 + EN.z1) / 2;
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = ux * EN.off, cy = uy * EN.off;
    const nac = turned([[EN.r * 0.9, EN.z0], [EN.r, EN.z0 + 0.8], [EN.r, EN.z1 - 1.6], [EN.r * 0.82, EN.z1 - 0.5], [EN.r * 0.4, EN.z1], [0, EN.z1 + 0.15]], 24);
    nac.translate(cx, cy, 0); add(nac, alloy);
    add(rod([ux * (S.spine - 0.2), uy * (S.spine - 0.2), zm], [ux * (EN.off - EN.r * 0.8), uy * (EN.off - EN.r * 0.8), zm], 0.42, 0.42, 4), ceramic);
    const ring = new THREE.TorusGeometry(EN.r * 0.88, 0.13, 10, 36); ring.translate(cx, cy, EN.z0 - 0.05); add(ring, bronze);
    const disc = new THREE.CircleGeometry(EN.r * 0.8, 32); disc.rotateY(Math.PI); disc.translate(cx, cy, EN.z0 - 0.1); add(disc, swirlMat);
    // …and its nozzle, gimballed just behind (./jets.js): its own plasma and its glow turn with it
    const jet = jetPivot(body, cx, cy, EN.z0 - 0.8); jets.push(jet);
    add(new THREE.TorusGeometry(EN.r * 0.66, 0.1, 10, 32), bronze, jet);
    { const d2 = new THREE.CircleGeometry(EN.r * 0.6, 28); d2.rotateY(Math.PI); add(d2, swirlMat, jet); }
    const gm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.45, 0.7, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const glow = new THREE.Sprite(gm); glow.position.set(0, 0, -0.4); jet.add(glow); glows.push(glow);
  }

  // its landing gear (./gear.js): down when it is slow and low, folded away in flight
  const gear = createGear(body, GEAR.ark, S.keel, bronze); geos.push(...gear.geos);
  return {
    group,
    update(s, { t = 0, aboard = false, night = 0 } = {}) {
      group.position.set(s.p[0], s.p[1] + (s.bob || 0), s.p[2]);           // its bob is its own (ships.js BOB): what stands on it rides it
      body.rotation.set(s.tilt, s.yaw, s.bank);
      gear.update(s.gear ?? 1);
      aimJets(jets, s.jet);                                                // its nozzles point the way it is driven
      ringG.rotation.z = (t * RG.turn) % TAU;   // the ring turns, once a minute, whoever is aboard
      swirlU.uTime.value = t; swirlU.uOn.value = Math.min(1, s.thrust);
      const on = Math.min(1.4, s.thrust);
      for (const g of glows) { g.scale.setScalar(3 + 4 * on); g.material.opacity = 0.35 + 0.5 * Math.min(1, on); }
      nightU.value = night; lampMat.opacity = 0.9 * night;
      floorMat.emissive.setRGB(0.5, 0.36, 0.2).multiplyScalar(0.5 * night * (aboard ? 1 : 0.6));
      const blink = (t % 1.6) < 0.25 ? 1 : 0.15;
      for (const l of lamps) l.material.opacity = (0.25 + 0.75 * night) * blink;
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
