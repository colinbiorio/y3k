// ships/carrier.js — THE CARRIER, DRAWN (three.js), from ../ships.js's
// numbers: four hundred metres of floating stepped temple. Five terraces of
// pale stone-like ceramic, laid in courses on their walls and paved on their
// tops, each set in from the one below and narrowing to its prow, with hedges
// along their edges; hangar mouths along the sides of the lowest two, warm
// inside at night, and a small craft hovering beside each of the lowest's, for
// scale; four slender towers with lanterns and bronze caps; two masts on the
// top terrace with yards and booms of bronze, their stays, and two enormous
// sails of golden solar foil, furled up to their yards while it waits and let
// down when someone takes the helm; the helm in a pavilion at the front of the
// top terrace (a seat, a console with two levers, a dial and a pane of light);
// lamps along the top terrace at night; and astern, a row of five great plasma
// ring engines, each its swirl and glow, as bright as it is driven.
//
// Its frame is the ship's: its middle at the origin, +Z ahead (the prow), +X
// its left. It is drawn turned and tipped as the numbers say.
import * as THREE from 'three';
import { CARRIER as S } from '../ships.js';
import { glowTexture } from '../fight.js';
import { gatherer } from '../buildings/parts.js';

const TAU = 2 * Math.PI, EN = S.engines;
const rod = (a, b, r0, r1 = r0, n = 8) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), g = new THREE.CylinderGeometry(r1, r0, d.length(), n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
};
// a terrace's plan (x, z): straight sides, then the last BOW metres narrowing to its prow
const plan = (T) => { const zb = T.z1 - S.bow, n = S.bowNarrow; return [[-T.hw, T.z0], [T.hw, T.z0], [T.hw, zb], [T.hw * n, T.z1], [-T.hw * n, T.z1], [-T.hw, zb]]; };
// a terrace: its plan stood up through its height
const terrace = (T) => {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(plan(T).map(([x, z]) => new THREE.Vector2(x, -z))), { depth: T.y1 - T.y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, T.y0, 0); return g;
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

// a material's colour (and, if asked, its glow by night) patterned in its own object space, knowing which way it faces
function patterned(base, glsl, key, nightU, glow = '') {
  const m = new THREE.MeshStandardMaterial(base);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal;');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;\nuniform float uNight;\nfloat hh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + glsl);
    if (glow) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + glow);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function createCarrierArt({ lite = false } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(), geos = [], mats = [];
  const keep = (m) => { mats.push(m); return m; }, add = (g, m, to = body) => { geos.push(g); const mesh = new THREE.Mesh(g, m); to.add(mesh); return mesh; };
  group.add(body); body.rotation.order = 'YXZ';
  const nightU = { value: 0 }, T = S.terraces, top = T[T.length - 1];
  // ---- the terraces and the towers' shafts: pale stone-like ceramic, in courses on the walls, paved on the tops
  const stone = keep(patterned({ color: 0xffffff, roughness: 0.62, metalness: 0, envMapIntensity: 0.7 }, `
    float up = step(0.5, abs(vObjN.y)), row = floor(vObj.y / 1.6);
    float course = abs(fract(vObj.y / 1.6 + 0.5) - 0.5) * 1.6;
    float joint = abs(fract((vObj.x + vObj.z) / 3.2 + 0.5 * mod(row, 2.0) + 0.5) - 0.5) * 3.2;
    vec2 pv = abs(fract(vObj.xz / 3.0 + 0.5) - 0.5) * 3.0;
    float lines = mix(min(smoothstep(0.0, 0.05, course), smoothstep(0.0, 0.06, joint)), min(smoothstep(0.0, 0.05, pv.x), smoothstep(0.0, 0.05, pv.y)), up);
    vec2 cell = up > 0.5 ? floor(vObj.xz / 3.0) : vec2(row, floor((vObj.x + vObj.z) / 3.2));
    diffuseColor.rgb = vec3(0.87, 0.83, 0.75) * (0.9 + 0.12 * hh(cell)) * mix(0.76, 1.0, lines);`, 'carrier-stone', nightU));
  { const G = gatherer();
    for (const t of T) G.put(terrace(t), 0, 0);
    for (const t of S.towers) { const g = new THREE.CylinderGeometry(1.4, 2.3, t.y1 - t.y0 - 6, 16); g.translate(t.x, (t.y0 + t.y1 - 6) / 2, t.z); G.put(g, 0, 0); }
    add(G.geometry(), stone); }
  // hedges along the terraces' straight edges (the green the temple keeps)
  { const G = gatherer();
    for (const t of T.slice(1)) for (const sd of [-1, 1]) { const g = new THREE.BoxGeometry(1.2, 1.1, t.z1 - S.bow - t.z0 - 8); g.translate(sd * (t.hw - 1.2), t.y1 + 0.55, (t.z0 + t.z1 - S.bow) / 2); G.put(g, 0, 0); }
    add(G.geometry(), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.36, 0.16), roughness: 0.9 }))); }
  // ---- the hangar mouths along the lowest two terraces' sides: arched, dark, warm inside at night
  const mouthMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.05, 0.06), roughness: 0.9, side: THREE.DoubleSide }));
  const mouths = [{ t: T[0], zs: [-140, -80, -20, 40, 100], w: 16, h: 8.5, y: -19 }, { t: T[1], zs: [-110, -50, 10, 70], w: 12, h: 7, y: -7.2 }];
  const crafts = [];
  { const G = gatherer();
    for (const { t, zs, w, h, y } of mouths) for (const z of zs) for (const sd of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - w / 2); sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); sh.lineTo(-w / 2, 0);
      const g = new THREE.ShapeGeometry(sh, 10); g.rotateY(sd * Math.PI / 2); g.translate(sd * (t.hw + 0.05), y, z); G.put(g, 0, 0);
      if (t === T[0]) crafts.push([sd * (t.hw + 9), y + 3.5, z + w / 2 + 5]);
    }
    add(G.geometry(), mouthMat); }
  // the small craft beside the lowest mouths, five metres each, for scale
  const craftAt = [];
  { const G = gatherer();
    for (const [x, y, z] of crafts) { const g = new THREE.SphereGeometry(1, 12, 8); g.scale(1, 0.42, 2.6); g.translate(x, y, z); G.put(g, 0, 0); craftAt.push([x, y, z]); }
    add(G.geometry(), keep(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.92, 0.9, 0.84), roughness: 0.25, clearcoat: 0.8 }))); }
  // ---- the towers' lanterns and bronze caps
  const bronze = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.66, 0.44, 0.21), roughness: 0.32, metalness: 1, envMapIntensity: 0.9 }));
  const lantern = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.95, 0.85, 0.6), roughness: 0.3, emissive: new THREE.Color(1, 0.72, 0.4), emissiveIntensity: 0 }));
  { const caps = gatherer(), lit = gatherer();
    for (const t of S.towers) {
      const l = new THREE.CylinderGeometry(1.5, 1.5, 3, 16); l.translate(t.x, t.y1 - 4.5, t.z); lit.put(l, 0, 0);
      const ring = new THREE.CylinderGeometry(1.9, 1.9, 0.5, 16); ring.translate(t.x, t.y1 - 2.75, t.z); caps.put(ring, 0, 0);
      const c = new THREE.ConeGeometry(1.9, 4.5, 16); c.translate(t.x, t.y1 - 0.25, t.z); caps.put(c, 0, 0);
    }
    add(caps.geometry(), bronze); add(lit.geometry(), lantern); }
  // ---- the masts, their yards and booms, their stays; and the sails of golden foil, furled up to the yards while it waits
  { const G = gatherer();
    for (const m of S.masts) {
      G.put(rod([0, m.foot, m.z], [0, m.top, m.z], 1.6, 0.9, 12), 0, 0);
      G.put(rod([-m.wide - 1, m.yard, m.z], [m.wide + 1, m.yard, m.z], 0.7, 0.7, 10), 0, 0);
      G.put(rod([-m.narrow - 1, m.boom, m.z], [m.narrow + 1, m.boom, m.z], 0.6, 0.6, 10), 0, 0);
    }
    add(G.geometry(), bronze);
    const R = gatherer();
    for (const m of S.masts) for (const [x, z] of [[top.hw - 2, m.z - 30], [-(top.hw - 2), m.z - 30], [0, m.z + 40]]) R.put(rod([0, m.top - 2, m.z], [x, top.y1, z], 0.12, 0.12, 4), 0, 0);
    add(R.geometry(), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.27, 0.2), roughness: 0.95 }))); }
  const foil = keep(patterned({ color: 0xffffff, roughness: 0.28, metalness: 0.85, side: THREE.DoubleSide, envMapIntensity: 1.1 }, `
    vec2 cell = abs(fract(vec2(vObj.x, vObj.y) / 4.0 + 0.5) - 0.5) * 4.0;
    diffuseColor.rgb = vec3(0.93, 0.72, 0.3) * mix(0.62, 1.0, smoothstep(0.0, 0.12, min(cell.x, cell.y)));`, 'carrier-foil', nightU));
  const NU = lite ? 10 : 18, NV = lite ? 8 : 14;
  const sails = S.masts.map((m) => {
    const g = new THREE.PlaneGeometry(1, 1, NU, NV); add(g, foil); return { m, g };
  });
  const setSails = (down, t) => {
    for (const { m, g } of sails) {
      const p = g.attributes.position, fall = (m.yard - m.boom) * down;
      for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++) {
        const u = j / NU, v = i / NV, y = m.yard - fall * v, half = m.wide + (m.narrow - m.wide) * v * down;
        const belly = 7 * down * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.05)) * (1 + 0.03 * Math.sin(t * 0.8 + u * 4));
        p.setXYZ(i * (NU + 1) + j, (u * 2 - 1) * half, y, m.z + belly);   // bellied forward, the wind astern
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }
  };
  // ---- the helm: an open pavilion at the front of the top terrace, its seat looking out over the prow
  const [sx, sy, sz] = S.seat;
  { const G = gatherer();
    for (const x of [-3, 3]) for (const z of [-3, 3]) G.put(rod([x, top.y1, sz + z], [x, top.y1 + 4.4, sz + z], 0.32, 0.28, 10), 0, 0);
    const roof = new THREE.BoxGeometry(7.6, 0.5, 7.6); roof.translate(0, top.y1 + 4.65, sz); G.put(roof, 0, 0);
    const crown = new THREE.BoxGeometry(5, 0.5, 5); crown.translate(0, top.y1 + 5.15, sz); G.put(crown, 0, 0);
    add(G.geometry(), stone); }
  const cushion = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.12, 0.3, 0.32), roughness: 0.9 }));
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.92, 0.89, 0.82), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  { const c = new THREE.BoxGeometry(0.5, 0.1, 0.48); c.translate(sx, sy - 0.02, sz); add(c, cushion);
    const back = new THREE.BoxGeometry(0.5, 0.55, 0.08); back.translate(0, 0.27, 0); back.rotateX(-0.25); back.translate(sx, sy + 0.02, sz - 0.26); add(back, cushion);
    add(rod([sx, top.y1, sz], [sx, sy - 0.07, sz], 0.05), bronze);
    const con = new THREE.BoxGeometry(0.8, 0.7, 0.3); con.translate(0, top.y1 + 0.35, sz + 0.8); add(con, ceramic);
    for (const lx of [-0.22, 0.22]) { add(rod([lx, top.y1 + 0.7, sz + 0.67], [lx * 1.1, top.y1 + 1.04, sz + 0.55], 0.015), bronze); const k = new THREE.SphereGeometry(0.035, 10, 8); k.translate(lx * 1.1, top.y1 + 1.06, sz + 0.54); add(k, bronze); }
    const dial = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20); dial.rotateX(Math.PI / 2); dial.translate(-0.12, top.y1 + 0.56, sz + 0.64); add(dial, bronze); }
  const paneMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 1.0) }));
  { const g = new THREE.PlaneGeometry(0.22, 0.12); g.rotateY(Math.PI); g.translate(0.15, top.y1 + 0.56, sz + 0.64); add(g, paneMat); }
  // ---- by night: lamps along the top terrace's edges, in the pavilion, in the hangar mouths
  const tex = glowTexture();
  const lampMat = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1, 0.8, 0.5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  { const lamp = (x, y, z, k) => { const l = new THREE.Sprite(lampMat); l.position.set(x, y, z); l.scale.setScalar(k); body.add(l); };
    for (let z = top.z0 + 10; z < top.z1 - S.bow; z += lite ? 40 : 20) for (const sd of [-1, 1]) lamp(sd * (top.hw - 0.6), top.y1 + 1.6, z, 3);
    lamp(0, top.y1 + 3.6, sz, 5);
    for (const { t, zs, y } of mouths) for (const z of zs) for (const sd of [-1, 1]) lamp(sd * (t.hw + 0.6), y + 3.5, z, t === T[0] ? 14 : 10); }   // at their mouths
  // ---- astern, the row of five great plasma ring engines on their pylons
  const swirlU = { uTime: { value: 0 }, uOn: { value: 0 } }, swirlMat = keep(new THREE.ShaderMaterial({ uniforms: swirlU, vertexShader: UV_VERT, fragmentShader: SWIRL, side: THREE.DoubleSide }));
  const glows = [];
  { const G = gatherer();
    for (const x of EN.xs) {
      const ring = new THREE.TorusGeometry(EN.r, 0.8, 12, 48); ring.translate(x, EN.y, EN.z); G.put(ring, 0, 0);
      G.put(rod([x, EN.y + EN.r * 0.6, T[0].z0 + 0.5], [x, EN.y + EN.r * 0.6, EN.z + 0.6], 0.9, 0.9, 6), 0, 0);
      G.put(rod([x, EN.y - EN.r * 0.6, T[0].z0 + 0.5], [x, EN.y - EN.r * 0.6, EN.z + 0.6], 0.9, 0.9, 6), 0, 0);
      const disc = new THREE.CircleGeometry(EN.r * 0.9, 40); disc.rotateY(Math.PI); disc.translate(x, EN.y, EN.z - 0.05); add(disc, swirlMat);
      const gm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.45, 0.7, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      const glow = new THREE.Sprite(gm); glow.position.set(x, EN.y, EN.z - 4); body.add(glow); glows.push(glow);
    }
    add(G.geometry(), bronze); }
  // the small craft's own little plasma, astern of each
  { const gm = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.45, 0.7, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    for (const [x, y, z] of craftAt) { const g = new THREE.Sprite(gm); g.position.set(x, y, z - 2.8); g.scale.setScalar(2.2); body.add(g); } }

  let down = 0;
  setSails(down, 0);
  return {
    group,
    update(s, { t = 0, dt = 0, aboard = false, night = 0 } = {}) {
      group.position.set(s.p[0], s.p[1] + 0.4 * Math.sin(t * 0.25) * (1 - Math.min(1, s.thrust)), s.p[2]);
      body.rotation.set(s.tilt * 0.4, s.yaw, s.bank * 0.4);
      // the sails come down when someone takes the helm, and are furled up to their yards when it is let be
      const want = aboard ? 1 : 0;
      if (Math.abs(want - down) > 0.002 || aboard) { down += (want - down) * (1 - Math.exp(-0.8 * dt)); setSails(down, t); }
      swirlU.uTime.value = t; swirlU.uOn.value = Math.min(1, s.thrust);
      const on = Math.min(1.4, s.thrust);
      for (const g of glows) { g.scale.setScalar(22 + 26 * on); g.material.opacity = 0.35 + 0.5 * Math.min(1, on); }
      nightU.value = night; lampMat.opacity = 0.85 * night; lantern.emissiveIntensity = 1.4 * night;
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
