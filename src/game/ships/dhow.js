// ships/dhow.js — THE DHOW, DRAWN (three.js), from ../ships.js's numbers: a
// cargo ship twenty-eight metres long, a wide rounded belly plated in glazed
// ceramic between timber ribs, its prow long and raked, its stern broad; a
// planked deck with its cargo (crates, amphorae, a coil of rope); a raised
// stern cabin with round windows (warm at night), and on its roof the helm:
// a seat, two bronze levers, a ceramic dial, one pane of soft light; two masts
// with long lateen yards and two tall sails of golden solar foil that fold up
// along their yards while it waits and spread when someone takes the helm;
// its stays and shrouds; under the stern a ring of plasma engines, as bright as
// it is driven.
//
// Its frame is the ship's: its middle at the origin, +Z ahead (the prow), +X
// its left. It is drawn turned and tipped as the numbers say.
import * as THREE from 'three';
import { DHOW as S, DHOW_HULL } from '../ships.js';
import { glowTexture } from '../fight.js';

const L = S.length, U0 = -L / 2;
// the hull at u (0 the stern, 1 the prow): half its width, its sheer (the deck's edge), its depth, the prow's rake
const { halfW, sheer, depth } = DHOW_HULL;                       // (ships.js: what a body stands on is the same hull)
const rake = (u) => 3.2 * Math.max(0, (u - 0.7) / 0.3) ** 2;
const pw = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const hullAt = (u, th, out = 0) => [(halfW(u) + out) * pw(Math.sin(th), 0.8), sheer(u) - (depth(u) + out) * Math.abs(Math.cos(th)) ** 0.8, U0 + u * L - rake(u) * Math.cos(th) ** 2];
const uAt = (z) => (z - U0) / L;
const DECK = DHOW_HULL.deck;

class Path extends THREE.Curve { constructor(fn) { super(); this.fn = fn; } getPoint(t, o = new THREE.Vector3()) { const [x, y, z] = this.fn(t); return o.set(x, y, z); } }
const rod = (a, b, r0, r1 = r0, n = 8) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), g = new THREE.CylinderGeometry(r1, r0, d.length(), n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
};
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

// a material's colour patterned in its own object space (a few lines of GLSL into three's standard material)
function patterned(base, glsl, key) {
  const m = new THREE.MeshStandardMaterial(base);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nfloat hh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + glsl);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function createDhowArt({ lite = false } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(), geos = [], mats = [];
  const keep = (m) => { mats.push(m); return m; }, add = (g, m, to = body) => { geos.push(g); const mesh = new THREE.Mesh(g, m); to.add(mesh); return mesh; };
  group.add(body); body.rotation.order = 'YXZ';
  // the belly: glazed ceramic plates, each a little its own, between timber ribs every 1.1 m and dark seams
  const hullMat = keep(patterned({ color: 0xffffff, roughness: 0.3, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.8 }, `
    float rz = abs(fract(vObj.z / 1.1 + 0.5) - 0.5) * 1.1, sy = abs(fract(vObj.y / 0.6 + 0.5) - 0.5) * 0.6;
    vec3 plate = vec3(0.9, 0.86, 0.77) * (0.9 + 0.12 * hh(floor(vec2(vObj.z / 1.1, vObj.y / 0.6))));
    vec3 c = mix(plate * 0.72, plate, smoothstep(0.0, 0.018, sy));
    diffuseColor.rgb = mix(vec3(0.4, 0.27, 0.16), c, smoothstep(0.07, 0.1, rz));`, 'dhow-hull'));
  const deckMat = keep(patterned({ color: 0xffffff, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }, `
    float px = abs(fract(vObj.x / 0.22 + 0.5) - 0.5) * 0.22;
    diffuseColor.rgb = vec3(0.56, 0.41, 0.26) * (0.85 + 0.2 * hh(vec2(floor(vObj.x / 0.22), floor(vObj.z / 3.1)))) * mix(0.6, 1.0, smoothstep(0.0, 0.012, px));`, 'dhow-deck'));
  const timber = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.28, 0.17), roughness: 0.7 }));
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.92, 0.89, 0.82), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  const bronze = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.44, 0.21), roughness: 0.32, metalness: 1, envMapIntensity: 0.9 }));
  const rope = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.27, 0.2), roughness: 0.95 }));
  const cushion = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.12, 0.3, 0.32), roughness: 0.9 }));
  const nu = lite ? 40 : 72, nt = lite ? 14 : 22;

  // ---- the hull, its deck, its rails and its stem
  { const P = [], I = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nt; j++) P.push(...hullAt(i / nu, -Math.PI / 2 + (Math.PI * j) / nt));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b = a + nt + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); add(g, hullMat);
    // the transom: the stern's flat face
    const tr = []; for (let j = 0; j <= nt; j++) tr.push(new THREE.Vector2(...hullAt(0, -Math.PI / 2 + (Math.PI * j) / nt).slice(0, 2)));
    const tg = new THREE.ShapeGeometry(new THREE.Shape(tr)); tg.translate(0, 0, U0); add(tg, hullMat); }
  { const P = [], I = [], n = lite ? 30 : 56;
    for (let i = 0; i <= n; i++) { const u = 0.01 + (0.97 * i) / n, w = halfW(u) * 0.985, y = DECK(u), z = U0 + u * L; P.push(-w, y, z, w, y, z); }
    for (let i = 0; i < n; i++) { const a = 2 * i; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); add(g, deckMat); }
  for (const sd of [-1, 1]) add(new THREE.TubeGeometry(new Path((t) => { const u = 0.01 + 0.97 * t; return [sd * halfW(u), sheer(u) + 0.08, U0 + u * L]; }), 64, 0.09, 6), timber);
  add(new THREE.TubeGeometry(new Path((t) => { const u = 0.7 + 0.3 * t; return hullAt(u, 0, 0.04); }), 24, 0.12, 6), timber);
  add(rod(hullAt(1, 0, 0), [0, sheer(1) + 1.4, U0 + L + 0.3], 0.14, 0.09), timber);
  // ---- the cargo between the masts: crates, amphorae, a coil of rope
  for (const [x, z, s] of [[-1.4, -1.8, 0.9], [-1.3, -0.7, 0.8], [1.2, -1.5, 0.85], [1.5, 0.6, 0.7]]) { const g = new THREE.BoxGeometry(s, s, s); g.translate(x, DECK(uAt(z)) + s / 2, z); add(g, timber); }
  for (const [x, z] of [[0.2, -2.6], [-0.2, 1.2], [0.6, 1.7]]) {
    const prof = [[0.001, 0], [0.16, 0.02], [0.3, 0.3], [0.32, 0.55], [0.2, 0.85], [0.1, 0.95], [0.12, 1.05], [0.001, 1.06]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, 16); g.translate(x, DECK(uAt(z)), z); add(g, ceramic);
  }
  { const g = new THREE.TorusGeometry(0.35, 0.09, 8, 24); g.rotateX(Math.PI / 2); g.translate(-0.4, DECK(uAt(5.5)) + 0.09, 5.5); add(g, rope); }
  // ---- the stern cabin: pale walls on timber posts, round windows in bronze, its roof a deck with a rail, the helm on it
  const cab = { x: 1.9, z0: U0 + 0.7, z1: S.seat[2] + 0.75, y0: DECK(0.05), y1: S.seat[1] - 0.2 };
  { const walls = new THREE.BoxGeometry(2 * cab.x, cab.y1 - cab.y0, cab.z1 - cab.z0); walls.translate(0, (cab.y0 + cab.y1) / 2, (cab.z0 + cab.z1) / 2); add(walls, ceramic);
    const roof = new THREE.BoxGeometry(2 * cab.x + 0.3, 0.16, cab.z1 - cab.z0 + 0.3); roof.translate(0, cab.y1 + 0.08, (cab.z0 + cab.z1) / 2); add(roof, deckMat);
    for (const x of [-cab.x, cab.x]) for (const z of [cab.z0, cab.z1]) add(rod([x, cab.y0, z], [x, cab.y1, z], 0.1, 0.1, 6), timber); }
  const windows = [];
  const winMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.22, 0.26), roughness: 0.1, metalness: 0.2, emissive: new THREE.Color(0, 0, 0) }));
  { const wy = (cab.y0 + cab.y1) / 2 + 0.15;
    for (const sd of [-1, 1]) for (const z of [cab.z0 + 1.1, (cab.z0 + cab.z1) / 2, cab.z1 - 1.1]) {
      const ring = new THREE.TorusGeometry(0.3, 0.05, 8, 24); ring.rotateY(Math.PI / 2); ring.translate(sd * (cab.x + 0.01), wy, z); add(ring, bronze);
      const gl = new THREE.CircleGeometry(0.27, 24); gl.rotateY(sd * Math.PI / 2); gl.translate(sd * (cab.x + 0.02), wy, z); windows.push(add(gl, winMat));
    }
    for (const x of [-0.9, 0.9]) {
      const ring = new THREE.TorusGeometry(0.3, 0.05, 8, 24); ring.translate(x, wy, cab.z0 - 0.01); add(ring, bronze);
      const gl = new THREE.CircleGeometry(0.27, 24); gl.rotateY(Math.PI); gl.translate(x, wy, cab.z0 - 0.02); windows.push(add(gl, winMat));
    } }
  for (const [a, b] of [[[-cab.x, cab.z0], [cab.x, cab.z0]], [[-cab.x, cab.z0], [-cab.x, cab.z1]], [[cab.x, cab.z0], [cab.x, cab.z1]]]) {
    add(rod([a[0], cab.y1 + 0.9, a[1]], [b[0], cab.y1 + 0.9, b[1]], 0.04), timber);
    for (let k = 0; k <= 4; k++) { const x = a[0] + ((b[0] - a[0]) * k) / 4, z = a[1] + ((b[1] - a[1]) * k) / 4; add(rod([x, cab.y1 + 0.16, z], [x, cab.y1 + 0.9, z], 0.025), bronze); }
  }
  // the helm: a seat facing forward, a console before it with two levers, a dial and a pane of light
  const [sx, sy, sz] = S.seat;
  { const c = new THREE.BoxGeometry(0.5, 0.1, 0.48); c.translate(sx, sy - 0.02, sz); add(c, cushion);
    const back = new THREE.BoxGeometry(0.5, 0.55, 0.08); back.translate(0, 0.27, 0); back.rotateX(-0.25); back.translate(sx, sy + 0.02, sz - 0.26); add(back, cushion);
    add(rod([sx, cab.y1 + 0.16, sz], [sx, sy - 0.07, sz], 0.05), bronze);
    const con = new THREE.BoxGeometry(0.8, 0.7, 0.3); con.translate(0, cab.y1 + 0.16 + 0.35, sz + 0.75); add(con, ceramic);
    for (const lx of [-0.22, 0.22]) { add(rod([lx, cab.y1 + 0.86, sz + 0.62], [lx * 1.1, cab.y1 + 1.2, sz + 0.5], 0.015), bronze); const k = new THREE.SphereGeometry(0.035, 10, 8); k.translate(lx * 1.1, cab.y1 + 1.22, sz + 0.49); add(k, bronze); }
    const dial = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20); dial.rotateX(Math.PI / 2); dial.translate(-0.12, cab.y1 + 0.72, sz + 0.59); add(dial, bronze); }
  const paneMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 1.0) }));
  { const g = new THREE.PlaneGeometry(0.22, 0.12); g.rotateY(Math.PI); g.translate(0.15, cab.y1 + 0.72, sz + 0.59); add(g, paneMat); }
  // ---- the masts, their lateen yards, the stays and shrouds
  const MAST = [{ z: 3.0, top: 16, A: [0, 5.0, 12.8], B: [0, 19.5, -7.5], C: [0, 1.7, -1.6] }, { z: -4.5, top: 11, A: [0, 3.9, 1.0], B: [0, 13.5, -12.2], C: [0, 1.9, -9.6] }];
  for (const m of MAST) {
    add(rod([0, DECK(uAt(m.z)) - 0.2, m.z], [0, m.top, m.z], 0.2, 0.11, 10), timber);
    add(rod(m.A, m.B, 0.14, 0.07, 8), timber);
    for (const sd of [-1, 1]) add(rod([0, m.top - 0.4, m.z], [sd * halfW(uAt(m.z)), sheer(uAt(m.z)), m.z - 0.8], 0.018, 0.018, 4), rope);
  }
  add(rod([0, MAST[0].top, MAST[0].z], [0, sheer(1) + 1.3, U0 + L + 0.25], 0.02, 0.02, 4), rope);
  add(rod([0, MAST[1].top, MAST[1].z], [0, cab.y1 + 0.9, cab.z0 + 0.3], 0.02, 0.02, 4), rope);
  // ---- the sails: triangles of golden solar foil from each yard to a clew, bellied; they fold up along the yard
  const foil = keep(patterned({ color: 0xffffff, roughness: 0.28, metalness: 0.85, side: THREE.DoubleSide, envMapIntensity: 1.1 }, `
    vec2 cell = abs(fract(vec2(vObj.z, vObj.y) / 0.45 + 0.5) - 0.5) * 0.45;
    diffuseColor.rgb = vec3(0.93, 0.72, 0.3) * mix(0.62, 1.0, smoothstep(0.0, 0.02, min(cell.x, cell.y)));`, 'dhow-foil'));
  const N = lite ? 10 : 16, sails = MAST.map((m) => {
    const tri = []; for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) tri.push([i / N, j / N]);
    const idx = [], at = (i, j) => { let k = 0; for (let a = 0; a < i; a++) k += N - a + 1; return k + j; };
    for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) { idx.push(at(i, j), at(i, j + 1), at(i + 1, j)); if (j < N - i - 1) idx.push(at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(tri.length * 3), 3)); g.setIndex(idx);
    add(g, foil); return { m, g, tri };
  });
  const setSails = (unfold, t) => {
    for (const { m, g, tri } of sails) {
      const mid = [0, (m.A[1] + m.B[1]) / 2 - 0.4, (m.A[2] + m.B[2]) / 2], C = m.C.map((c, k) => mid[k] + (c - mid[k]) * unfold), p = g.attributes.position;
      tri.forEach(([i, j], n) => {
        const lc = i, lb = j, la = 1 - i - j, belly = 2.4 * unfold * la * lb * lc * 27 * 0.33 * (1 + 0.04 * Math.sin(t * 1.3 + j * 3));
        p.setXYZ(n, m.A[0] * la + m.B[0] * lb + C[0] * lc + belly, m.A[1] * la + m.B[1] * lb + C[1] * lc, m.A[2] * la + m.B[2] * lb + C[2] * lc);
      });
      p.needsUpdate = true; g.computeVertexNormals();
    }
  };
  // ---- the ring of plasma engines under the stern: a bronze ring, eight pods round it, each its swirl and glow
  const RING = { r: 1.15, y: -0.55, z: U0 - 0.2 };
  { const ring = new THREE.TorusGeometry(RING.r, 0.08, 10, 48); ring.translate(0, RING.y, RING.z); add(ring, bronze);
    add(rod([0, DECK(0.02) - 0.4, U0 + 0.2], [0, RING.y + RING.r, RING.z], 0.08), bronze); }
  const swirlU = { uTime: { value: 0 }, uOn: { value: 0 } }, swirlMat = keep(new THREE.ShaderMaterial({ uniforms: swirlU, vertexShader: UV_VERT, fragmentShader: SWIRL, side: THREE.DoubleSide }));
  const tex = glowTexture(), glows = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 2 * Math.PI, x = RING.r * Math.cos(a), y = RING.y + RING.r * Math.sin(a);
    const pod = new THREE.CylinderGeometry(0.17, 0.13, 0.55, 14, 1, true); pod.rotateX(Math.PI / 2); pod.translate(x, y, RING.z - 0.1); add(pod, bronze);
    const disc = new THREE.CircleGeometry(0.13, 20); disc.rotateY(Math.PI); disc.translate(x, y, RING.z - 0.38); add(disc, swirlMat);
    const gm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.45, 0.7, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const glow = new THREE.Sprite(gm); glow.position.set(x, y, RING.z - 0.5); body.add(glow); glows.push(glow);
  }

  let open = 0.12;
  setSails(open, 0);
  return {
    group,
    update(s, { t = 0, dt = 0, aboard = false, night = 0 } = {}) {
      group.position.set(s.p[0], s.p[1] + (s.bob || 0), s.p[2]);           // its bob is its own (ships.js BOB): what stands on it rides it
      body.rotation.set(s.tilt * 0.6, s.yaw, s.bank * 0.6);
      // the sails spread when someone takes the helm, and fold up along their yards when it is let be
      const want = aboard ? 1 : 0.12;
      if (Math.abs(want - open) > 0.002 || aboard) { open += (want - open) * (1 - Math.exp(-1.5 * dt)); setSails(open, t); }
      swirlU.uTime.value = t; swirlU.uOn.value = Math.min(1, s.thrust);
      const on = Math.min(1.4, s.thrust);
      for (const g of glows) { g.scale.setScalar(0.5 + 0.8 * on); g.material.opacity = 0.35 + 0.5 * Math.min(1, on); }
      winMat.emissive.setRGB(1.0, 0.72, 0.42).multiplyScalar(0.9 * night);
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
