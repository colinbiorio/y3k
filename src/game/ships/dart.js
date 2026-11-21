// ships/dart.js — THE DART, DRAWN (three.js), from ../ships.js's numbers: a
// narrow bronze hull shaped like a spearpoint, a blade's lozenge in section,
// its fine engraved lines running its length and a chevron toward the point;
// a long clear canopy over two seats in tandem (it lifts as a body comes, and
// shuts over the pilot); short swept wings of pale alloy; two slim plasma
// engines at the tail, their nozzles' swirl and glow and streaks of light as
// bright as it is driven.
//
// Its frame is the ship's: its middle at the origin, +Z ahead, +X its left.
// It is drawn turned and tipped as the numbers say (yaw, then its tilt and its
// bank).
import * as THREE from 'three';
import { DART as S } from '../ships.js';
import { glowTexture } from '../fight.js';
import { jetPivot, aimJets } from './jets.js';
import { createGear } from './gear.js';
import { GEAR } from '../ships.js';

const L = S.length, U0 = -L / 2, LOZ = 1.6;                     // the section's squareness: 1 a diamond, 2 an ellipse
// the hull at u (0 the tail, 1 the point): its half-width and its half-height
const halfW = (u) => (u >= 0.4 ? 0.65 * (1 - ((u - 0.4) / 0.6) ** 2) : 0.65 - 0.3 * ((0.4 - u) / 0.4) ** 2);
const halfH = (u) => 0.62 * halfW(u) + 0.02;
const pow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const hullAt = (u, a) => [halfW(u) * pow(Math.cos(a), 2 / LOZ), halfH(u) * pow(Math.sin(a), 2 / LOZ), U0 + u * L];
const uAt = (z) => (z - U0) / L;
const CAN = { z: 1.0, len: 1.95, half: 0.42, high: 0.62 };      // the canopy: its middle along it, half its length, half its width, its height
const canBase = () => halfH(uAt(CAN.z)) - 0.1;

class Path extends THREE.Curve { constructor(fn) { super(); this.fn = fn; } getPoint(t, o = new THREE.Vector3()) { const [x, y, z] = this.fn(t); return o.set(x, y, z); } }
const SWIRL = `
  varying vec2 vUv; uniform float uTime; uniform float uOn;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x), sw = 0.5 + 0.5 * sin(a * 4.0 - r * 12.0 - uTime * (3.0 + 8.0 * uOn));
    float core = smoothstep(0.9, 0.0, r);
    vec3 c = mix(vec3(0.35, 0.6, 1.0) * (0.45 + 0.6 * sw), vec3(0.95, 0.98, 1.0), core * (0.5 + 0.5 * sw));
    gl_FragColor = vec4(c * (0.4 + 1.0 * uOn) * (1.0 + 0.5 * core), 1.0);
    #include <colorspace_fragment>
  }`;
const UV_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function createDartArt({ lite = false } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(), geos = [], mats = [];
  const keep = (m) => { mats.push(m); return m; }, add = (g, m, to = body) => { geos.push(g); const mesh = new THREE.Mesh(g, m); to.add(mesh); return mesh; };
  group.add(body); body.rotation.order = 'YXZ';
  // the bronze, engraved: lines along its length round the section, a chevron toward the point; the cockpit cut open
  const bronze = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.44, 0.21), roughness: 0.3, metalness: 1, envMapIntensity: 0.95, side: THREE.DoubleSide }));
  bronze.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform float uHull;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uHull > 0.5) {
          float dc = (vObj.x / ${CAN.half.toFixed(3)}) * (vObj.x / ${CAN.half.toFixed(3)}) + ((vObj.z - ${CAN.z.toFixed(3)}) / ${(CAN.len - 0.05).toFixed(3)}) * ((vObj.z - ${CAN.z.toFixed(3)}) / ${(CAN.len - 0.05).toFixed(3)});
          if (vObj.y > ${(-0.02).toFixed(3)} && dc < 1.0) discard;                       // the cockpit, open under the canopy
          float a = atan(vObj.y * 1.6, vObj.x), along = abs(fract(a * 3.183) - 0.5);
          float lines = smoothstep(0.035, 0.0, along - 0.46);
          float chev = vObj.z > 2.4 ? smoothstep(0.05, 0.0, abs(fract((vObj.z + abs(vObj.x) * 1.6) * 2.2) - 0.5) - 0.44) : 0.0;
          diffuseColor.rgb *= 1.0 - 0.45 * max(lines, chev);
        }`);
    sh.uniforms.uHull = bronze.userData.hull;
  };
  bronze.userData.hull = { value: 1 };
  const bronzeTrim = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.44, 0.21), roughness: 0.32, metalness: 1, envMapIntensity: 0.9 }));
  const alloy = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.82, 0.85), roughness: 0.28, metalness: 0.85, envMapIntensity: 0.9, side: THREE.DoubleSide }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 0.1, 0.11), roughness: 0.8 }));
  const leather = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.24, 0.13, 0.08), roughness: 0.7 }));
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: 0xe4f0f2, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }));
  const nu = lite ? 36 : 64, na = lite ? 16 : 24;

  // ---- the hull: one bronze shell from the tail to the point, closed at the tail by a plate
  { const P = [], I = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= na; j++) P.push(...hullAt(Math.min(0.9995, i / nu), (2 * Math.PI * j) / na));
    for (let i = 0; i < nu; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + na + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); add(g, bronze);
    const tail = new THREE.CircleGeometry(1, na); tail.scale(halfW(0), halfH(0), 1); tail.rotateY(Math.PI); tail.translate(0, 0, U0 + 0.001); add(tail, bronzeTrim); }
  // the cockpit inside: a floor, two seats one behind the other, a lever, a dial and a pane of light at the front
  { const fl = new THREE.CircleGeometry(1, 24); fl.scale(CAN.half * 0.95, CAN.len * 0.95, 1); fl.rotateX(-Math.PI / 2); fl.translate(0, -0.3, CAN.z); add(fl, dark);
    for (const z of [S.seat[2], S.rear[2]]) {
      const c = new THREE.BoxGeometry(0.4, 0.1, 0.42); c.translate(0, S.seat[1] - 0.02, z); add(c, leather);
      const b = new THREE.BoxGeometry(0.4, 0.55, 0.08); b.translate(0, 0.27, 0); b.rotateX(-0.3); b.translate(0, S.seat[1] + 0.02, z - 0.24); add(b, leather);
    }
    const lever = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6); lever.rotateX(0.5); lever.translate(0.16, -0.1, S.seat[2] + 0.35); add(lever, bronzeTrim);
    const dash = new THREE.BoxGeometry(0.5, 0.06, 0.18); dash.rotateX(-0.45); dash.translate(0, 0.12, S.seat[2] + 0.75); add(dash, dark);
    const dial = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 18); dial.rotateX(Math.PI / 2 - 0.45); dial.translate(-0.12, 0.16, S.seat[2] + 0.73); add(dial, bronzeTrim); }
  const paneMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 1.0) }));
  { const g = new THREE.PlaneGeometry(0.15, 0.07); g.rotateX(-2.02); g.translate(0.1, 0.16, S.seat[2] + 0.73); add(g, paneMat); }
  // ---- the canopy: a long bubble of glass on a bronze rim and an alloy spine, hinged at its back
  const hinge = new THREE.Group(); hinge.position.set(0, canBase(), CAN.z - CAN.len); body.add(hinge);
  { const g = new THREE.SphereGeometry(1, 28, 12, 0, 2 * Math.PI, 0, Math.PI / 2); g.scale(CAN.half, CAN.high, CAN.len); g.translate(0, 0, CAN.len); add(g, glass, hinge);
    add(new THREE.TubeGeometry(new Path((t) => { const a = 2 * Math.PI * t; return [CAN.half * Math.cos(a), 0, CAN.len + CAN.len * Math.sin(a)]; }), 64, 0.022, 6, true), bronzeTrim, hinge);
    add(new THREE.TubeGeometry(new Path((t) => { const a = Math.PI * t; return [0, CAN.high * Math.sin(a), CAN.len - CAN.len * Math.cos(a)]; }), 40, 0.016, 6), alloy, hinge); }
  // ---- the wings: short, swept, of pale alloy, a little lifted at the tips
  for (const sd of [-1, 1]) {
    const root = [[sd * 0.5, 0, -1.55], [sd * 0.5, 0, -3.6]], tip = [[sd * 2.95, 0.12, -3.25], [sd * 2.95, 0.12, -4.15]], th = 0.035;
    const P = [], quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d), up = (p, k) => [p[0], p[1] + k * th, p[2]];
    const c = [root[0], tip[0], tip[1], root[1]];
    for (const k of [1, -1]) quad(...(k > 0 ? c : [...c].reverse()).map((p) => up(p, k)));
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; quad(up(a, -1), up(b, -1), up(b, 1), up(a, 1)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); add(g, alloy);
    add(new THREE.TubeGeometry(new Path((t) => [sd * (0.5 + 2.45 * t), 0.12 * t, -1.55 - 1.7 * t]), 12, 0.03, 6), bronzeTrim);   // its leading edge
  }
  // ---- the engines: two slim nacelles by the tail, their nozzles' rings, the plasma in them, their glows and streaks
  const swirlU = { uTime: { value: 0 }, uOn: { value: 0 } }, swirlMat = keep(new THREE.ShaderMaterial({ uniforms: swirlU, vertexShader: UV_VERT, fragmentShader: SWIRL, side: THREE.DoubleSide }));
  const tex = glowTexture(), glows = [], trails = [], jets = [];
  for (const sd of [-1, 1]) {
    const x = sd * 0.52, z0 = U0 - 0.45, z1 = U0 + 1.9;
    const nac = new THREE.CylinderGeometry(0.21, 0.17, z1 - z0, 20, 1, true); nac.rotateX(Math.PI / 2); nac.translate(x, -0.02, (z0 + z1) / 2); add(nac, alloy);
    const nose = new THREE.SphereGeometry(0.21, 16, 10, 0, 2 * Math.PI, 0, Math.PI / 2); nose.rotateX(Math.PI / 2); nose.scale(1, 1, 1.8); nose.translate(x, -0.02, z1); add(nose, alloy);
    const ring = new THREE.TorusGeometry(0.17, 0.035, 10, 32); ring.translate(x, -0.02, z0); add(ring, bronzeTrim);
    const disc = new THREE.CircleGeometry(0.15, 28); disc.rotateY(Math.PI); disc.translate(x, -0.02, z0 - 0.005); add(disc, swirlMat);
    // …and its nozzle, gimballed just behind (./jets.js): its own plasma, its glow and its streak turn with it
    const jet = jetPivot(body, x, -0.02, z0 - 0.15); jets.push(jet);
    add(new THREE.TorusGeometry(0.14, 0.03, 10, 28), bronzeTrim, jet);
    { const d2 = new THREE.CircleGeometry(0.125, 24); d2.rotateY(Math.PI); add(d2, swirlMat, jet); }
    const gm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.45, 0.7, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const glow = new THREE.Sprite(gm); glow.position.set(0, 0, -0.05); jet.add(glow); glows.push(glow);
    const tm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.4, 0.62, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const trail = new THREE.Sprite(tm); trail.position.set(0, 0, -0.7); jet.add(trail); trails.push(trail);
  }

  let open = 1;
  // its landing gear (./gear.js): down when it is slow and low, folded away in flight
  const gear = createGear(body, GEAR.dart, S.keel, bronzeTrim); geos.push(...gear.geos);
  return {
    group,
    update(s, { t = 0, dt = 0, aboard = false } = {}) {
      group.position.set(s.p[0], s.p[1] + (s.bob || 0), s.p[2]);           // its bob is its own (ships.js BOB): what stands on it rides it
      body.rotation.set(s.tilt, s.yaw, s.bank);
      gear.update(s.gear ?? 1);
      aimJets(jets, s.jet);                                                // its nozzles point the way it is driven
      // the canopy lifts while it waits for a pilot, and shuts over one
      open += ((aboard ? 0 : 1) - open) * (1 - Math.exp(-4 * dt));
      hinge.rotation.x = -0.75 * open;
      swirlU.uTime.value = t; swirlU.uOn.value = Math.min(1, s.thrust);
      const on = Math.min(1.4, s.thrust);
      for (const g of glows) { g.scale.setScalar(0.6 + 0.8 * on); g.material.opacity = 0.4 + 0.45 * Math.min(1, on); }
      for (const tr of trails) { tr.scale.set(0.4 + 0.4 * on, 0.4 + 0.4 * on, 1); tr.position.z = -0.2 - 1.2 * on; tr.material.opacity = 0.55 * Math.min(1, on); }
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
