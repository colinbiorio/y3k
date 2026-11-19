// ships/skiff.js — THE SKIFF, DRAWN (three.js), from ../ships.js's numbers: a
// slim reed-canoe hull of white glazed ceramic rising to a point at bow and
// stern, bronze ribs round it and bronze along its gunwales; inside, a deck,
// an open seat, two bronze levers, a ceramic dial and one pane of soft light
// under a low raked windscreen of glass; two small outrigger fins on thin
// struts; at the stern, on a pylon, one bronze ring holding a slow swirl of
// plasma that brightens as it is driven, its glow and its wake of light.
//
// Its frame is the ship's: its middle at the origin, +Z ahead, +X its left.
// It is drawn turned and tipped as the numbers say (yaw, then its tilt and its
// bank).
import * as THREE from 'three';
import { SKIFF as S } from '../ships.js';
import { glowTexture } from '../fight.js';

const L = S.length, U0 = -L / 2;
// the hull at a place along it (u from the stern, 0, to the bow, 1): its half-width, its gunwale's height, its depth
const halfW = (u) => (S.beam / 2) * Math.pow(Math.sin(Math.PI * u), 0.6);
const sheer = (u) => 0.15 + 0.34 * Math.pow(Math.abs(2 * u - 1), 3);
const depth = (u) => (0.15 + S.keel) * Math.pow(Math.sin(Math.PI * u), 0.45);
// a point on the hull: across it by th, from the port gunwale (-pi/2) down the keel (0) to the starboard one (pi/2)
const hullAt = (u, th, out = 0) => [(halfW(u) + out) * Math.sin(th), sheer(u) - (depth(u) + out) * Math.cos(th), U0 + u * L];

class Path extends THREE.Curve { constructor(fn) { super(); this.fn = fn; } getPoint(t, o = new THREE.Vector3()) { const [x, y, z] = this.fn(t); return o.set(x, y, z); } }
const rod = (a, b, r, n = 8) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), g = new THREE.CylinderGeometry(r, r, d.length(), n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
};
const SWIRL = `
  varying vec2 vUv; uniform float uTime; uniform float uOn;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x), sw = 0.5 + 0.5 * sin(a * 3.0 - r * 10.0 - uTime * (2.0 + 6.0 * uOn)), sw2 = 0.5 + 0.5 * sin(a * 5.0 + r * 13.0 + uTime * 3.0);
    float core = smoothstep(0.85, 0.0, r);
    vec3 c = mix(vec3(0.35, 0.6, 1.0) * (0.4 + 0.7 * sw * sw2), vec3(0.95, 0.98, 1.0), core * (0.4 + 0.6 * sw));
    gl_FragColor = vec4(c * (0.45 + 0.9 * uOn) * (1.0 + 0.5 * core), 1.0);
    #include <colorspace_fragment>
  }`;
const UV_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function createSkiffArt({ lite = false } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(), geos = [], mats = [];
  const keep = (m) => { mats.push(m); return m; }, add = (g, m) => { geos.push(g); const mesh = new THREE.Mesh(g, m); body.add(mesh); return mesh; };
  group.add(body); body.rotation.order = 'YXZ';
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.93, 0.92, 0.88), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide, envMapIntensity: 0.9 }));
  const bronze = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.44, 0.21), roughness: 0.32, metalness: 1, envMapIntensity: 0.9 }));
  const deckMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.3, 0.2), roughness: 0.75 }));
  const cushion = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.12, 0.3, 0.32), roughness: 0.9 }));
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: 0xe4f0f2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false }));
  const nu = lite ? 28 : 44, nt = lite ? 10 : 16;

  // ---- the hull: one glazed shell, open above
  { const P = [], I = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nt; j++) P.push(...hullAt(i / nu, -Math.PI / 2 + (Math.PI * j) / nt));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b = a + nt + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    add(g, ceramic); }
  // its bronze: ribs round it, a rail along each gunwale, a cap at bow and stern
  for (let k = 1; k <= 7; k++) { const u = 0.15 + (0.7 * (k - 1)) / 6; add(new THREE.TubeGeometry(new Path((t) => hullAt(u, -Math.PI / 2 + Math.PI * t, 0.012)), 18, 0.016, 5), bronze); }
  for (const sd of [-1, 1]) add(new THREE.TubeGeometry(new Path((t) => { const u = 0.02 + 0.96 * t; return [sd * (halfW(u) + 0.01), sheer(u) + 0.01, U0 + u * L]; }), 48, 0.022, 6), bronze);
  for (const z of [U0, -U0]) { const g = new THREE.SphereGeometry(0.05, 12, 8); g.translate(0, sheer(0) + 0.02, z * 0.995); add(g, bronze); }
  // ---- inside: the deck, the seat, the levers, the dial and the pane of light, the windscreen
  { const g = new THREE.CircleGeometry(1, 32); g.scale(0.36, 1.25, 1); g.rotateX(-Math.PI / 2); g.translate(0, -0.2, -0.3); add(g, deckMat); }
  const [sx, sy, sz] = S.seat;
  { const g = new THREE.BoxGeometry(0.44, 0.1, 0.46); g.translate(sx, sy - 0.02, sz); add(g, cushion);
    const back = new THREE.BoxGeometry(0.44, 0.5, 0.08); back.translate(0, 0.25, 0); back.rotateX(-0.28); back.translate(sx, sy + 0.02, sz - 0.25); add(back, cushion);
    add(rod([-0.24, sy - 0.07, sz - 0.25], [-0.24, -0.2, sz - 0.25], 0.015), bronze); add(rod([0.24, sy - 0.07, sz - 0.25], [0.24, -0.2, sz - 0.25], 0.015), bronze);
    add(rod([-0.24, sy - 0.07, sz + 0.2], [-0.24, -0.2, sz + 0.2], 0.015), bronze); add(rod([0.24, sy - 0.07, sz + 0.2], [0.24, -0.2, sz + 0.2], 0.015), bronze); }
  for (const lx of [-0.22, 0.22]) { add(rod([lx, -0.18, 0.02], [lx * 1.1, 0.28, -0.08], 0.013), bronze); const k = new THREE.SphereGeometry(0.035, 10, 8); k.translate(lx * 1.1, 0.3, -0.09); add(k, bronze); }
  { const dash = new THREE.BoxGeometry(0.5, 0.08, 0.16); dash.rotateX(-0.5); dash.translate(0, 0.12, 0.42); add(dash, ceramic);
    const dial = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20); dial.rotateX(-0.5 + Math.PI / 2); dial.translate(-0.12, 0.17, 0.4); add(dial, bronze); }
  const paneMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 1.0) }));
  { const g = new THREE.PlaneGeometry(0.16, 0.08); g.rotateX(-2.07); g.translate(0.1, 0.17, 0.405); add(g, paneMat); }      // on the dash, facing the seat
  { const g = new THREE.CylinderGeometry(0.62, 0.62, 0.3, 24, 1, true, -0.95, 1.9); g.translate(0, 0.15, 0); g.rotateX(-0.42); g.translate(0, -0.16, -0.12); add(g, glass);
    add(new THREE.TubeGeometry(new Path((t) => { const a = -0.95 + 1.9 * t, v = new THREE.Vector3(0.62 * Math.sin(a), 0.3, 0.62 * Math.cos(a)).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.42); return [v.x, v.y - 0.16, v.z - 0.12]; }), 24, 0.012, 5), bronze); }
  // ---- the outriggers: thin struts out to two small fins, white with bronze leading edges
  for (const sd of [-1, 1]) {
    const fz = -0.95, tip = [sd * 1.3, -0.18, fz];
    add(rod([sd * halfW(0.31) * 0.95, 0.02, fz + 0.22], [tip[0], tip[1] + 0.06, fz + 0.12], 0.016), bronze);
    add(rod([sd * halfW(0.31) * 0.95, 0.02, fz - 0.22], [tip[0], tip[1] + 0.06, fz - 0.12], 0.016), bronze);
    const fin = new THREE.BoxGeometry(0.035, 0.24, 0.72); fin.translate(tip[0], tip[1], fz); add(fin, ceramic);
    add(rod([tip[0], tip[1] - 0.12, fz + 0.36], [tip[0], tip[1] + 0.12, fz + 0.36], 0.02), bronze);
  }
  // ---- the engine: a bronze ring on a pylon behind the stern, the plasma in it, its glow and its streak of light
  const ER = 0.34, EZ = U0 - 0.32, EY = 0.12;
  { const ring = new THREE.TorusGeometry(ER, 0.055, 12, 48); ring.translate(0, EY, EZ); add(ring, bronze);
    add(rod([0, sheer(0.04) - 0.02, U0 + 0.15], [0, EY + ER, EZ + 0.04], 0.03), bronze);
    add(rod([0, -0.12, U0 + 0.4], [0, EY - ER, EZ + 0.04], 0.025), bronze); }
  const swirlU = { uTime: { value: 0 }, uOn: { value: 0 } };
  const discG = new THREE.CircleGeometry(ER - 0.03, 40); discG.rotateY(Math.PI); discG.translate(0, EY, EZ - 0.005);
  const disc = add(discG, keep(new THREE.ShaderMaterial({ uniforms: swirlU, vertexShader: UV_VERT, fragmentShader: SWIRL, side: THREE.DoubleSide })));
  const tex = glowTexture();
  const glowMat = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.45, 0.7, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const glow = new THREE.Sprite(glowMat); glow.position.set(0, EY, EZ - 0.1); body.add(glow);
  const trailMat = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.4, 0.62, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const trail = new THREE.Sprite(trailMat); trail.position.set(0, EY, EZ - 0.9); body.add(trail);

  return {
    group,
    update(s, { t = 0 } = {}) {
      group.position.set(s.p[0], s.p[1] + (s.bob || 0), s.p[2]);           // its bob is its own (ships.js BOB): what stands on it rides it
      body.rotation.set(s.tilt, s.yaw, s.bank);
      swirlU.uTime.value = t; swirlU.uOn.value = Math.min(1, s.thrust);
      const on = Math.min(1.4, s.thrust);
      glow.scale.setScalar(0.9 + 0.9 * on); glowMat.opacity = 0.45 + 0.4 * Math.min(1, on);
      trail.scale.set(0.5 + 0.4 * on, 0.5 + 0.4 * on, 1); trail.position.z = EZ - 0.35 - 0.9 * on; trailMat.opacity = 0.5 * Math.min(1, on);
      disc.visible = true;
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
