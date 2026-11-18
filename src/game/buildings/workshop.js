// buildings/workshop.js — THE WORKSHOP, DRAWN (three.js), from ../workshop.js's
// numbers: a stone plinth and its two steps; thick adobe walls on a stone
// footing; three fired-brick barrel vaults, laid in rings, their voussoirs
// showing at both ends; pale alloy beams on slender columns under the valleys,
// dark steel tie rods across the vaults' feet with their plates on the walls
// outside; the glass wall, six panels in pale alloy frames on three tracks
// that slide aside as a body comes, a header over them and, in each vault's
// end, a half-round of glass on a fan of mullions; a tall bronze chimney,
// green where the rain runs down it, with a collar, a rain cap and three
// stays; inside, a long workbench with a vise and hand tools, a tool board,
// two racks of timber and metal bars, a stool, and a ceramic kiln whose round
// mouth holds a slow violet-white swirl of plasma inside an alloy ring.
//
// As the house: everything but the glass and the plasma is one mesh of one
// material, each part saying what it is made of (aPart) and when it goes up
// (aStage: the plinth, the walls with the beams and the columns, the vaults
// one after another from their springing to their crowns, the chimney and the
// glass, then the things); taken down, it goes the same way backward. Inside
// (in the room's air) it is lit by what gets in: the sun only through the
// glass (as ../workshop.js's sunLocal), the sky by how near the glass a
// surface is, and the kiln's plasma, the room's own light at night.
import * as THREE from 'three';
import { WORKSHOP as W, IN, BACK_IN, WALLTOP, CROWN, REACH_Z, vaultIn, vaultOut, phase } from '../workshop.js';
import { gatherer, boxG, slabG } from './parts.js';
import { glowTexture } from '../fight.js';

const PART = { adobe: 0, brick: 1, stone: 2, alloy: 3, bronze: 4, ceramic: 5, timber: 6, boards: 7, steel: 8 };
const STAGE = { base: 0, walls: 1, vault: [2, 2 + 1 / 3, 2 + 2 / 3], ties: 2.95, chimney: 3, tracks: 3.05, mullions: 3.1, stays: 3.9 };
const F = W.floor, S = W.spring, R = W.r, RO = W.r + W.shell, G = W.glass, KL = W.kiln, TOP = W.chimney.top;
const MOUTH_Z = KL.z + 0.69;                  // the kiln's face at its mouth's height
const f = (v) => v.toFixed(4);

// a rod from a to b (a cylinder of radius r), and a cylinder standing upright at (x, z) from y0 to y1
function rodG(a, b, r, n = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), g = new THREE.CylinderGeometry(r, r, len, n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
const postG = (x, z, y0, y1, r0, r1 = r0, n = 16) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, n); g.translate(x, (y0 + y1) / 2, z); return g; };

// GLSL: the workshop's frame, noise, the vaults, what each part looks like
const COMMON = `
  uniform vec2 uCentre; uniform float uYaw; uniform float uBuild; uniform float uBase;
  vec3 toLocal(vec3 w) { vec2 d = w.xz - uCentre; float c = cos(uYaw), s = sin(uYaw); return vec3(c * d.x - s * d.y, w.y - uBase, s * d.x + c * d.y); }
  vec3 dirLocal(vec3 v) { float c = cos(uYaw), s = sin(uYaw); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }
  float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n2(vec2 p) { vec2 i = floor(p), g = fract(p), u = g * g * (3.0 - 2.0 * g);
    return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y); }
  float vaultAt(float x) { return 3.0 * clamp(floor(x / 3.0 + 0.5), -1.0, 1.0); }
  float vaultIn(float x) { float d = min(${f(R)}, abs(x - vaultAt(x))); return ${f(S)} + sqrt(${f(R * R)} - d * d); }
  float vaultOut(float x) { if (abs(x) > ${f(IN)}) return ${f(WALLTOP)}; float d = x - vaultAt(x); return ${f(S)} + sqrt(max(0.0, ${f(RO * RO)} - d * d)); }
  bool inRoom(vec3 l, float m) { return abs(l.x) < ${f(IN)} - m && l.z > ${f(BACK_IN)} + m && l.z < ${f(G.z)} - m && l.y > ${f(F)} + m && l.y < vaultIn(l.x) - m; }
  // blocks in a running bond: 1 on a block, 0 in a joint (q in blocks; size, a block's metres; j, a joint's width)
  float bond(vec2 q, vec2 size, float j) { q.x += 0.5 * mod(floor(q.y), 2.0); vec2 e = min(fract(q), 1.0 - fract(q)) * size; return smoothstep(j * 0.5, j, min(e.x, e.y)); }
  vec2 bondId(vec2 q) { return floor(vec2(q.x + 0.5 * mod(floor(q.y), 2.0), q.y)); }
  vec3 stoneAt(vec3 l, vec3 nl) {
    if (nl.y > 0.5) {               // the floor's flags, the steps' treads
      vec2 q = l.xz / vec2(0.8, 0.6);
      return mix(vec3(0.33, 0.31, 0.28), vec3(0.57, 0.54, 0.49) * (0.84 + 0.26 * h1(bondId(q))) * (0.92 + 0.12 * n2(l.xz * 6.0)), bond(q, vec2(0.8, 0.6), 0.012));
    }
    vec2 w2 = abs(nl.x) > 0.5 ? l.zy : l.xy, q = w2 / vec2(0.6, 0.25);
    return mix(vec3(0.36, 0.34, 0.31), vec3(0.55, 0.52, 0.47) * (0.85 + 0.25 * h1(bondId(q) + 3.0)), bond(q, vec2(0.6, 0.25), 0.014));
  }
  vec3 partColour(float part, float stage, vec3 l, vec2 uv, vec3 nl, out float rough, out float metal) {
    rough = 0.9; metal = 0.0;
    if (part < 0.5) {               // adobe: mud plaster over sun-dried blocks whose courses faintly show; splashed low,
                                    // streaked from the top where the rain comes over; a stone footing up to the floor
      if (l.y < ${f(F)}) return stoneAt(l, nl);
      vec2 w2 = abs(nl.x) > 0.5 ? l.zy : l.xy;
      float blocks = bond(w2 / vec2(0.45, 0.12), vec2(0.45, 0.12), 0.02), mott = 0.6 * n2(w2 * 1.7) + 0.4 * n2(w2 * 7.0);
      vec3 c = mix(vec3(0.55, 0.40, 0.27), vec3(0.70, 0.55, 0.40), mott) * (0.94 + 0.06 * blocks);
      c *= mix(0.78, 1.0, smoothstep(${f(F)}, ${f(F + 0.8)}, l.y + 0.2 * n2(w2 * 3.0)));
      return c * (1.0 - 0.14 * smoothstep(0.55, 0.9, n2(vec2(w2.x * 3.0, 0.5))) * smoothstep(${f(WALLTOP - 1.4)}, ${f(WALLTOP)}, l.y));
    }
    if (part < 1.5) {               // fired brick, laid in rings along the vault; at its ends, the rings' voussoirs
      rough = 0.85;
      float vc = 3.0 * floor((stage - 2.0) * 3.0 + 0.5) - 3.0;
      vec2 o = vec2(l.x - vc, l.y - ${f(S)}), size, q;
      float a = atan(o.y, o.x), rr = length(o);
      if (abs(nl.z) > 0.5) { size = vec2(0.115, 0.1); q = vec2(a * ${f(R + W.shell / 2)} / size.x, (rr - ${f(R)}) / size.y); }
      else { size = vec2(0.25, 0.0875); q = vec2(a * rr / size.x, l.z / size.y); }
      vec2 id = bondId(q);
      vec3 b = vec3(0.58, 0.27, 0.16) * (0.78 + 0.4 * h1(id)) * (0.92 + 0.1 * n2(l.xz * 9.0 + l.y * 7.0));
      b = mix(b, vec3(0.40, 0.19, 0.13), step(0.86, h1(id + 17.0)));
      return mix(vec3(0.70, 0.66, 0.58), b, bond(q, size, 0.012));
    }
    if (part < 2.5) return stoneAt(l, nl);
    if (part < 3.5) { rough = 0.28; metal = 0.85; return vec3(0.80, 0.82, 0.85) * (0.94 + 0.06 * n2(vec2((l.x + l.z) * 3.0, l.y * 60.0))); }   // pale alloy
    if (part < 4.5) {               // bronze, gone green where the rain runs down it over the roof
      rough = 0.32; metal = 1.0;
      vec3 c = vec3(0.62, 0.40, 0.20) * (0.9 + 0.15 * n2(l.xy * 20.0));
      float ang = atan(l.z - ${f(KL.z)}, l.x - ${f(KL.x)}), above = smoothstep(vaultOut(l.x) + 0.05, vaultOut(l.x) + 0.6, l.y);
      float g = above * clamp(smoothstep(0.45, 0.75, 0.75 * n2(vec2(ang * 4.0, l.y * 0.8)) + 0.25 * n2(vec2(ang * 13.0, l.y * 3.0))) + 0.35 * smoothstep(${f(TOP - 2.5)}, ${f(TOP)}, l.y), 0.0, 1.0);
      rough = mix(rough, 0.8, g); metal = mix(metal, 0.1, g);
      return mix(c, vec3(0.30, 0.55, 0.46), g);
    }
    if (part < 5.5) {               // the kiln's glaze, pale celadon, crazed
      rough = 0.22;
      float k = smoothstep(0.03, 0.0, abs(n2(l.xz * 22.0 + l.y * 16.0) - 0.5));
      float soot = smoothstep(0.62, 0.3, length(vec2(l.x - ${f(KL.x)}, l.y - ${f(F + KL.at)}))) * step(${f(MOUTH_Z - 0.3)}, l.z);   // round the mouth
      return vec3(0.74, 0.82, 0.74) * (0.95 + 0.08 * n2(l.xy * 5.0)) * (1.0 - 0.18 * k) * (1.0 - 0.45 * soot);
    }
    if (part < 6.5) { rough = 0.75; return vec3(0.40, 0.27, 0.17) * (0.78 + 0.3 * n2(uv * vec2(3.0, 40.0))); }      // timber
    if (part < 7.5) { rough = 0.8; return vec3(0.68, 0.52, 0.34) * (0.8 + 0.25 * n2(uv * vec2(2.0, 60.0))); }       // boards, fresh sawn
    rough = 0.42; metal = 0.9; return vec3(0.22, 0.23, 0.25) * (0.85 + 0.2 * n2(l.xz * 30.0 + l.y * 11.0));       // dark steel
  }
`;
const INSIDE = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uFire; uniform vec3 uFireCol; uniform float uOpen;
  // where a ray from o along d meets a beam (x = bx ± ${W.beam.half}, under the springing), as solids.js's rayBox; 1e4 if never
  float beamHit(vec3 o, vec3 d, float bx) {
    vec3 lo = vec3(bx - ${f(W.beam.half)}, ${f(S - W.beam.deep)}, ${f(BACK_IN)}), hi = vec3(bx + ${f(W.beam.half)}, ${f(S)}, ${f(G.z)});
    vec3 inv = 1.0 / (d + vec3(equal(d, vec3(0.0))) * 1e-6), t0 = (lo - o) * inv, t1 = (hi - o) * inv, a = min(t0, t1), b = max(t0, t1);
    float tn = max(max(a.x, a.y), a.z), tf = min(min(b.x, b.y), b.z);
    return (tn > tf || tf < 0.0) ? 1e4 : tn > 0.0 ? tn : tf;
  }
  float sunLocal(vec3 l, vec3 d) {
    if (d.y <= 0.0) return 0.0;
    float tx = d.x > 1e-5 ? (${f(IN)} - l.x) / d.x : d.x < -1e-5 ? (-${f(IN)} - l.x) / d.x : 1e4;
    float tz = d.z > 1e-5 ? (${f(G.z)} - l.z) / d.z : d.z < -1e-5 ? (${f(BACK_IN)} - l.z) / d.z : 1e4;
    float ts = max(0.0, (${f(S)} - l.y) / d.y), qx = l.x + d.x * ts, qy = max(l.y, ${f(S)}), tv = 1e4;
    if (abs(qx) <= ${f(IN)}) {
      vec2 o = vec2(qx - vaultAt(qx), qy - ${f(S)});
      float A = dot(d.xy, d.xy), B2 = 2.0 * dot(o, d.xy), C = dot(o, o) - ${f(R * R)};
      tv = ts + (-B2 + sqrt(max(0.0, B2 * B2 - 4.0 * A * C))) / (2.0 * A);
    }
    float t = min(tx, min(tz, tv));
    if (beamHit(l, d, -1.5) < t || beamHit(l, d, 1.5) < t) return 0.0;
    if (t != tz || d.z <= 0.0) return 0.0;
    vec3 e = l + d * t;
    if (e.y > ${f(G.high)} && e.y < ${f(S)}) return 0.0;
    float tf = ${f(W.front - G.z)} / d.z; vec2 q = vec2(e.x + d.x * tf, e.y + d.y * tf);
    return (abs(q.x) > ${f(IN)} || q.y > vaultIn(q.x)) ? 0.0 : 1.0;
  }
  vec3 litInside(vec3 albedo, vec3 l, vec3 w, vec3 nw) {
    vec3 nl = dirLocal(nw), dl = dirLocal(uSunDir);
    vec3 col = uSunCol * mix(sunLocal(l + nl * 0.02, dl), 1.0, uOpen) * max(dot(nl, dl), 0.0);
    // the sky, by how near the glass a surface is, and how much it faces it
    float open = 0.22 + 0.8 * exp(-(${f(G.z)} - l.z) / 3.5) * (0.55 + 0.45 * max(nl.z, 0.0));
    col += uSky * mix(open, 1.0, uOpen);
    vec3 L = uFire - w; float dd = length(L);
    col += uFireCol * max(dot(nw, L / dd) * 0.8 + 0.2, 0.0) / (1.0 + dd * dd / 4.0);
    return albedo * col;
  }
`;
// the plasma in the kiln's mouth: a slow swirl, violet at its rim, white in its heart
const MOUTH_FRAG = `
  varying vec2 vUv; uniform float uTime; uniform float uOn;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x), sw = 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - uTime * 2.3), sw2 = 0.5 + 0.5 * sin(a * 5.0 - r * 14.0 + uTime * 3.1);
    float core = smoothstep(0.8, 0.0, r);
    vec3 c = mix(vec3(0.42, 0.26, 0.95) * (0.45 + 0.75 * sw * sw2), vec3(1.0, 0.94, 1.0), core * (0.55 + 0.45 * sw));
    gl_FragColor = vec4(c * uOn * (1.0 + 0.6 * core), 1.0);
    #include <colorspace_fragment>
  }`;
const UV_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function createWorkshopArt({ lite = false } = {}) {
  const group = new THREE.Group(), GA = gatherer(), put = GA.put, mats = [], geos = [];
  const keep = (m) => { mats.push(m); return m; };
  const seg = lite ? 20 : 36;
  const U = {
    uCentre: { value: new THREE.Vector2() }, uYaw: { value: 0 }, uBuild: { value: 0 }, uTime: { value: 0 }, uBase: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uFire: { value: new THREE.Vector3() }, uFireCol: { value: new THREE.Color() }, uOpen: { value: 1 },
  };

  // ---- the plinth and its two steps (stone)
  put(boxG(-IN, IN, 0, F, BACK_IN, W.front), PART.stone, STAGE.base);
  put(boxG(-W.half, W.half, 0, 0.34, W.front, 6.7), PART.stone, STAGE.base);
  put(boxG(-W.half, W.half, 0, 0.17, 6.7, REACH_Z), PART.stone, STAGE.base);

  // ---- the walls: the side walls their whole length, up over the outer vaults' haunches; the back wall between them, up to
  // the vaults' undersides (so their bricks' ends show over it, as at the front)
  for (const sx of [-1, 1]) put(boxG(sx > 0 ? IN : -W.half, sx > 0 ? W.half : -IN, 0, WALLTOP, W.back, W.front), PART.adobe, STAGE.walls);
  const backline = [[-IN, 0], [IN, 0]];
  for (const c of [3, 0, -3]) for (let i = 0; i <= seg; i++) { const a = (Math.PI * i) / seg; backline.push([c + R * Math.cos(a), S + R * Math.sin(a)]); }
  put(slabG(backline.filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6), [], W.back, BACK_IN), PART.adobe, STAGE.walls);
  // the beams under the valleys on their columns (pale alloy), and the header over the glass
  for (const x of [-1.5, 1.5]) put(boxG(x - W.beam.half, x + W.beam.half, S - W.beam.deep, S, BACK_IN, G.z - 0.1), PART.alloy, STAGE.walls);
  for (const [x, z] of W.columns) {
    put(postG(x, z, F, S - W.beam.deep - 0.05, W.column), PART.alloy, STAGE.walls);
    put(boxG(x - 0.13, x + 0.13, F, F + 0.03, z - 0.13, z + 0.13), PART.alloy, STAGE.walls);
    put(boxG(x - 0.13, x + 0.13, S - W.beam.deep - 0.05, S - W.beam.deep, z - 0.13, z + 0.13), PART.alloy, STAGE.walls);
  }
  put(boxG(-IN, IN, G.high, S, G.z - 0.1, G.z + 0.1), PART.alloy, STAGE.walls);

  // ---- the vaults (brick): each a half-round shell the building's length, its two ends; one after another
  const LEN = W.front - W.back, MID = (W.front + W.back) / 2;
  [-3, 0, 3].forEach((c, k) => {
    for (const r of [R, RO]) { const g = new THREE.CylinderGeometry(r, r, LEN, seg * 2, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.translate(c, S, MID); put(g, PART.brick, STAGE.vault[k]); }
    for (const z of [W.front, W.back]) { const g = new THREE.RingGeometry(R, RO, seg * 2, 1, 0, Math.PI); if (z < 0) g.rotateY(Math.PI); g.translate(c, S, z); put(g, PART.brick, STAGE.vault[k]); }
  });
  // the tie rods across their feet, through the side walls to plates outside
  for (const z of W.ties) {
    put(rodG([-W.half - 0.04, S + 0.06, z], [W.half + 0.04, S + 0.06, z], 0.018, 8), PART.steel, STAGE.ties);
    for (const sx of [-1, 1]) put(boxG(sx > 0 ? W.half : -W.half - 0.03, sx > 0 ? W.half + 0.03 : -W.half, S + 0.06 - 0.14, S + 0.06 + 0.14, z - 0.14, z + 0.14), PART.steel, STAGE.ties);
  }

  // ---- the chimney (bronze): from the kiln's dome up through the right vault's crown, its joints, a collar where it
  // meets the bricks, a rain cap on three struts, three stays to the roof
  put(postG(KL.x, KL.z, F + KL.dome - 0.02, TOP, W.chimney.r, W.chimney.r, seg), PART.bronze, STAGE.chimney);
  for (let y = F + KL.dome + 1.2; y < TOP - 0.2; y += 1.2) put(postG(KL.x, KL.z, y - 0.03, y + 0.03, 0.226, 0.226, seg), PART.bronze, STAGE.chimney);
  { const roof = vaultOut(KL.x); put(postG(KL.x, KL.z, roof - 0.06, roof + 0.2, 0.5, 0.225, seg), PART.bronze, STAGE.chimney); }
  put(postG(KL.x, KL.z, TOP + 0.2, TOP + 0.46, 0.42, 0.05, seg), PART.bronze, STAGE.chimney);
  for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3; put(rodG([KL.x + 0.19 * Math.cos(a), TOP - 0.05, KL.z + 0.19 * Math.sin(a)], [KL.x + 0.3 * Math.cos(a), TOP + 0.24, KL.z + 0.3 * Math.sin(a)], 0.012), PART.bronze, STAGE.chimney); }
  for (const deg of [90, 210, 330]) {
    const a = (deg * Math.PI) / 180, x = KL.x + 1.5 * Math.cos(a), z = KL.z + 1.5 * Math.sin(a);
    put(rodG([KL.x, 9.4, KL.z], [x, vaultOut(x), z], 0.008), PART.steel, STAGE.stays);
  }

  // ---- the glass wall's tracks (in the floor and under the header) and, over the header, the half-rounds' frames and their fans
  for (const k of [-1, 0, 1]) {
    const z = G.z + k * G.track;
    put(boxG(-IN, IN, F, F + 0.015, z - 0.009, z + 0.009), PART.alloy, STAGE.tracks);
    put(boxG(-IN, IN, G.high - 0.02, G.high, z - 0.009, z + 0.009), PART.alloy, STAGE.tracks);
  }
  for (const c of [-3, 0, 3]) {
    const arc = new THREE.TorusGeometry(R - 0.03, 0.03, 6, seg, Math.PI); arc.translate(c, S, G.z); put(arc, PART.alloy, STAGE.mullions);
    for (const deg of [30, 60, 90, 120, 150]) { const a = (deg * Math.PI) / 180; put(rodG([c, S, G.z], [c + (R - 0.03) * Math.cos(a), S + (R - 0.03) * Math.sin(a), G.z], 0.022, 6), PART.alloy, STAGE.mullions); }
    put(boxG(c - R, c + R, S, S + 0.04, G.z - 0.03, G.z + 0.03), PART.alloy, STAGE.mullions);
  }

  // ---- the things, each going in at its turn. The workbench along the left wall: its top, legs, a shelf under it, a vise at
  // its end; on it, a hammer, a mallet, three chisels, a saw, a square, a plane
  const B = W.bench, top = F + B.top;
  put(boxG(B.x0, B.x1, top - 0.08, top, B.z0, B.z1), PART.timber, 4.1);
  for (const x of [B.x0 + 0.08, B.x1 - 0.08]) for (const z of [B.z0 + 0.08, (B.z0 + B.z1) / 2, B.z1 - 0.08]) put(boxG(x - 0.04, x + 0.04, F, top - 0.08, z - 0.04, z + 0.04), PART.timber, 4.1);
  put(boxG(B.x0 + 0.05, B.x1 - 0.05, F + 0.16, F + 0.2, B.z0 + 0.05, B.z1 - 0.05), PART.boards, 4.1);
  put(boxG(B.x1 - 0.04, B.x1, top - 0.18, top - 0.08, B.z0, B.z1), PART.timber, 4.1);
  put(boxG(B.x1 - 0.07, B.x1 + 0.13, top, top + 0.1, 1.62, 1.88), PART.steel, 4.15);
  put(boxG(B.x1 + 0.05, B.x1 + 0.09, top + 0.1, top + 0.18, 1.6, 1.9), PART.steel, 4.15);
  put(boxG(B.x1 + 0.15, B.x1 + 0.19, top + 0.03, top + 0.18, 1.6, 1.9), PART.steel, 4.15);
  put(rodG([B.x1 + 0.13, top + 0.08, 1.75], [B.x1 + 0.36, top + 0.08, 1.75], 0.014), PART.steel, 4.15);
  put(rodG([B.x1 + 0.36, top + 0.08, 1.6], [B.x1 + 0.36, top + 0.08, 1.9], 0.01), PART.steel, 4.15);
  const on = (x0, x1, h, z0, z1, part) => put(boxG(x0, x1, top, top + h, z0, z1), part, 4.2);
  on(-4.05, -4.02, 0.03, -2.2, -1.88, PART.timber); on(-4.1, -3.97, 0.04, -1.9, -1.86, PART.steel);                       // the hammer
  on(-4.2, -4.175, 0.025, -1.3, -1.02, PART.timber); put(rodG([-4.26, top + 0.05, -0.97], [-4.12, top + 0.05, -0.97], 0.05, 12), PART.timber, 4.2);   // the mallet
  for (const x of [-3.85, -3.8, -3.75]) { on(x - 0.008, x + 0.008, 0.01, -0.45, -0.29, PART.steel); on(x - 0.014, x + 0.014, 0.028, -0.29, -0.18, PART.timber); }   // chisels
  on(-4.35, -4.15, 0.004, 0.3, 0.85, PART.steel); on(-4.33, -4.17, 0.04, 0.85, 1.0, PART.timber);                         // the saw
  on(-3.95, -3.92, 0.005, 1.0, 1.3, PART.steel); on(-4.15, -3.92, 0.005, 1.27, 1.3, PART.steel);                          // the square
  on(-4.0, -3.92, 0.07, -2.75, -2.5, PART.timber); put(boxG(-3.99, -3.93, top + 0.07, top + 0.1, -2.62, -2.6), PART.steel, 4.2);   // the plane
  // the tool board over it, and what hangs on it: a saw, spanners, chisels, a coil of copper wire, a square
  const wx = -IN + 0.03;
  put(boxG(-IN, wx, F + 1.2, F + 2.5, -2.6, 1.6), PART.boards, 4.25);
  const hang = (y0, y1, z0, z1, part) => put(boxG(wx, wx + 0.015, y0, y1, z0, z1), part, 4.3);
  hang(F + 1.6, F + 2.2, -2.4, -2.15, PART.steel); hang(F + 2.2, F + 2.35, -2.4, -2.2, PART.timber);
  [0.2, 0.24, 0.28, 0.32].forEach((len, i) => hang(F + 1.45, F + 1.45 + len, -1.85 + i * 0.1 - 0.015, -1.85 + i * 0.1 + 0.015, PART.steel));
  for (let i = 0; i < 5; i++) { const z = -1.2 + i * 0.1; hang(F + 1.5, F + 1.68, z - 0.008, z + 0.008, PART.steel); hang(F + 1.68, F + 1.8, z - 0.014, z + 0.014, PART.timber); }
  { const coil = new THREE.TorusGeometry(0.12, 0.02, 8, 24); coil.rotateY(Math.PI / 2); coil.translate(wx + 0.03, F + 1.95, 0.3); put(coil, PART.bronze, 4.3); }
  hang(F + 1.4, F + 1.95, 0.9, 0.93, PART.steel); hang(F + 1.92, F + 1.95, 0.9, 1.25, PART.steel);
  // the kiln: a stone base, its glazed body and dome, two alloy bands, the mouth's collar and its ring of containment
  put(postG(KL.x, KL.z, F, F + 0.08, 0.82, 0.8, seg), PART.stone, 4.4);
  { const prof = [new THREE.Vector2(0.001, 0.08), new THREE.Vector2(0.74, 0.08), new THREE.Vector2(0.72, 0.3), new THREE.Vector2(0.69, 0.6), new THREE.Vector2(0.66, KL.body)];
    for (let i = 1; i <= 10; i++) { const a = (i / 10) * 1.262; prof.push(new THREE.Vector2(0.66 * Math.cos(a), KL.body + (KL.dome - KL.body) * Math.sin(a) / Math.sin(1.262))); }
    const g = new THREE.LatheGeometry(prof, seg); g.translate(KL.x, F, KL.z); put(g, PART.ceramic, 4.4); }
  for (const [y, r] of [[0.3, 0.722], [0.85, 0.672]]) { const g = new THREE.TorusGeometry(r, 0.014, 6, seg); g.rotateX(Math.PI / 2); g.translate(KL.x, F + y, KL.z); put(g, PART.alloy, 4.4); }
  { const col = new THREE.CylinderGeometry(0.3, 0.3, 0.08, seg, 1, true); col.rotateX(Math.PI / 2); col.translate(KL.x, F + KL.at, MOUTH_Z); put(col, PART.alloy, 4.4);
    const ring = new THREE.TorusGeometry(0.29, 0.035, 10, seg); ring.translate(KL.x, F + KL.at, MOUTH_Z + 0.04); put(ring, PART.alloy, 4.4); }
  // the racks: timber uprights and arms; boards on the low arms, metal bars (steel, a few of bronze) on the high ones
  const ARMS = [0.35, 0.9, 1.5, 2.1];
  for (const x of [-4.25, -2.4, -0.55, 1.15]) {
    put(boxG(x - 0.045, x + 0.045, F, F + 2.45, BACK_IN, BACK_IN + 0.09), PART.timber, 4.5);
    for (const y of ARMS) put(boxG(x - 0.03, x + 0.03, F + y - 0.03, F + y + 0.03, BACK_IN + 0.09, -4.88), PART.timber, 4.5);
  }
  for (const [y, n] of [[0.35, 3], [0.9, 2]]) for (let i = 0; i < n; i++) put(boxG(-4.3 + 0.1 * i, 1.2 - 0.15 * i, F + y + 0.03 + 0.045 * i, F + y + 0.07 + 0.045 * i, BACK_IN + 0.12 + 0.02 * i, BACK_IN + 0.38 - 0.03 * i), PART.boards, 4.55);
  for (let i = 0; i < 7; i++) { const z = BACK_IN + 0.14 + i * 0.065, r = 0.012 + 0.004 * (i % 3); put(rodG([-4.28, F + 1.5 + 0.03 + r, z], [1.15 - 0.2 * (i % 2), F + 1.5 + 0.03 + r, z], r), i === 2 || i === 5 ? PART.bronze : PART.steel, 4.55); }
  for (let i = 0; i < 6; i++) { const z = BACK_IN + 0.14 + i * 0.075; put(boxG(-4.25, 1.1 - 0.3 * (i % 3), F + 2.13, F + 2.15, z - 0.01, z + 0.01), PART.steel, 4.55); }
  for (const z of [-1.35, 0.6, 2.55]) {
    put(boxG(IN - 0.09, IN, F, F + 2.45, z - 0.045, z + 0.045), PART.timber, 4.6);
    for (const y of ARMS) put(boxG(3.88, IN - 0.09, F + y - 0.03, F + y + 0.03, z - 0.03, z + 0.03), PART.timber, 4.6);
  }
  for (const [y, n] of [[0.35, 2], [0.9, 3]]) for (let i = 0; i < n; i++) put(boxG(IN - 0.38 + 0.03 * i, IN - 0.12 - 0.02 * i, F + y + 0.03 + 0.045 * i, F + y + 0.07 + 0.045 * i, -1.4 + 0.12 * i, 2.6 - 0.2 * i), PART.boards, 4.65);
  for (let i = 0; i < 6; i++) { const x = IN - 0.14 - i * 0.065, r = 0.012 + 0.004 * (i % 3); put(rodG([x, F + 1.53 + r, -1.4], [x, F + 1.53 + r, 2.5 - 0.25 * (i % 2)], r), i === 1 ? PART.bronze : PART.steel, 4.65); }
  // the stool: a round seat on three splayed legs
  { const St = W.stool; put(postG(St.x, St.z, F + St.top - 0.04, F + St.top, St.r, St.r, 20), PART.timber, 4.75);
    for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3 + 0.4; put(rodG([St.x + 0.11 * Math.cos(a), F + St.top - 0.04, St.z + 0.11 * Math.sin(a)], [St.x + 0.17 * Math.cos(a), F, St.z + 0.17 * Math.sin(a)], 0.018), PART.timber, 4.75); } }

  const mesh = new THREE.Mesh(GA.geometry(), keep(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.55, side: THREE.DoubleSide })));
  geos.push(mesh.geometry);
  mesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aStage;\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart; vStage = aStage; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTex = uv; vNl = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;\n' + COMMON + INSIDE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 lo = toLocal(vW);
        // going up: a stage not begun is not there; the plinth and the walls rise from their foot, each vault from its
        // springing to its crown, the chimney from the kiln to its cap; the rest each appear at their turn
        if (uBuild < vStage) discard;
        if (vStage < 0.5) { if (uBuild < 1.0 && lo.y > mix(0.0, ${f(F + 0.02)}, uBuild)) discard; }
        else if (vStage < 1.5) { if (uBuild < 2.0 && lo.y > mix(0.0, ${f(CROWN + 0.1)}, uBuild - 1.0)) discard; }
        else if (vStage < 2.9) { float k = (uBuild - vStage) * 3.0; float vc = 3.0 * floor((vStage - 2.0) * 3.0 + 0.5) - 3.0;
          if (k < 1.0 && atan(max(lo.y - ${f(S)}, 0.0), abs(lo.x - vc)) > k * 1.5708) discard; }
        else if (vStage < 3.01 && vPart > 3.5 && vPart < 4.5) { if (uBuild < 4.0 && lo.y > mix(${f(F + 1.4)}, ${f(TOP + 0.7)}, uBuild - 3.0)) discard; }
        float rough, metal;
        diffuseColor.rgb = partColour(vPart, vStage, lo, vTex, vNl, rough, metal);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = metal;')
      .replace('#include <opaque_fragment>', `
        { vec3 lo2 = toLocal(vW);
          if (inRoom(lo2, -0.03)) outgoingLight = litInside(diffuseColor.rgb, lo2, vW, normalize(inverseTransformDirection(normal, viewMatrix))); }
        #include <opaque_fragment>`);
  };
  mesh.material.customProgramCacheKey = () => 'workshop-body';
  group.add(mesh);

  // ---- the glass: six panels in alloy frames on three tracks (the end two on the back one, then the middle, then the
  // front), sliding aside two over each end panel; the three half-rounds over the header
  const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xe4f0f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }));
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.82, 0.85), roughness: 0.3, metalness: 0.85, envMapIntensity: 0.8 }));
  const FG = gatherer(), hw = G.panel / 2 + 0.02;
  for (const [x0, x1, y0, y1] of [[-hw, -hw + 0.06, F + 0.02, G.high - 0.02], [hw - 0.06, hw, F + 0.02, G.high - 0.02], [-hw, hw, F + 0.02, F + 0.14], [-hw, hw, G.high - 0.1, G.high - 0.02]]) FG.put(boxG(x0, x1, y0, y1, -0.022, 0.022), 0, 0);
  const frameG = FG.geometry(); geos.push(frameG);
  const paneG = new THREE.PlaneGeometry(2 * hw - 0.1, G.high - F - 0.24); paneG.translate(0, (F + 0.14 + G.high - 0.1) / 2, 0); geos.push(paneG);
  const TRACK = [-1, 0, 1, 1, 0, -1], SLIDE = [0, -1, -2, 2, 1, 0];
  const panels = TRACK.map((k, i) => {
    const p = new THREE.Group(); p.add(new THREE.Mesh(frameG, frameMat), new THREE.Mesh(paneG, glassMat));
    p.position.set(-IN + G.panel * (i + 0.5), 0, G.z + k * G.track); group.add(p); return p;
  });
  const halfRounds = [-3, 0, 3].map((c) => { const g = new THREE.CircleGeometry(R - 0.02, seg, 0, Math.PI); g.translate(c, S, G.z); geos.push(g); const m = new THREE.Mesh(g, glassMat); group.add(m); return m; });

  // ---- the plasma in the kiln's mouth, and its glow
  const mouthU = { uTime: { value: 0 }, uOn: { value: 0 } };
  const mouthG = new THREE.CircleGeometry(KL.mouth, 48); mouthG.translate(KL.x, F + KL.at, MOUTH_Z + 0.012); geos.push(mouthG);
  const mouth = new THREE.Mesh(mouthG, keep(new THREE.ShaderMaterial({ uniforms: mouthU, vertexShader: UV_VERT, fragmentShader: MOUTH_FRAG })));
  const tex = glowTexture();
  const glowMat = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.5, 0.36, 0.95), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const glow = new THREE.Sprite(glowMat); glow.position.set(KL.x, F + KL.at, MOUTH_Z + 0.25); glow.scale.setScalar(1.3);
  group.add(mouth, glow);
  const fireAt = new THREE.Vector3(KL.x, F + KL.at, MOUTH_Z + 0.3);
  const fireCol = new THREE.Color(0.8, 0.6, 1.0);

  // ---- its foundations, where it stands raised on uneven ground (the island): the plinth, the walls and the steps carried down 1.6 m
  const foundG = boxG(-W.half, W.half, -1.6, 0, W.back, REACH_Z); geos.push(foundG);
  const found = new THREE.Mesh(foundG, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.38, 0.34), roughness: 0.95 })));
  found.visible = false; group.add(found);

  let open = 0;
  return {
    group, flameAt: fireAt, fireCol,
    get open() { return open; },
    update(b, { t = 0, dt = 0, sun = [0, 1, 0], sunCol = new THREE.Color(1, 1, 1), sky = new THREE.Color(0.2, 0.2, 0.25), near = false, night = 0 } = {}) {
      group.position.set(b.x, b.y || 0, b.z); group.rotation.y = b.yaw;
      const ph = phase(b);
      U.uCentre.value.set(b.x, b.z); U.uYaw.value = b.yaw; U.uTime.value = t; U.uBase.value = b.y || 0;
      const build = ph.rest > 0 ? 4 + ph.rest : ph.glass > 0 ? 3 + ph.glass : ph.vaults > 0 ? 2 + ph.vaults : ph.walls > 0 ? 1 + ph.walls : ph.base;
      U.uBuild.value = build;
      U.uOpen.value = 1 - ph.vaults;
      U.uSunDir.value.set(sun[0], sun[1], sun[2]); U.uSunCol.value.copy(sunCol); U.uSky.value.copy(sky);
      U.uFire.value.copy(fireAt).applyMatrix4(group.matrixWorld.compose(group.position, group.quaternion, group.scale));
      U.uFireCol.value.copy(fireCol).multiplyScalar(0.8 * ph.rest);
      // the glass slides aside as a body comes, and closes after it
      open += ((near ? 1 : 0) - open) * (1 - Math.exp(-6 * dt));
      panels.forEach((p, i) => { p.position.x = -IN + G.panel * (i + 0.5) + SLIDE[i] * G.panel * open; p.visible = build >= 3.2 + 0.08 * i; });
      for (const m of halfRounds) m.visible = build >= 3.15;
      const lit = build >= 4.4;
      mouth.visible = glow.visible = lit;
      mouthU.uTime.value = t; mouthU.uOn.value = lit ? 0.6 + 0.4 * ph.rest : 0;
      glowMat.opacity = (0.5 + 0.3 * Math.sin(t * 1.7) * Math.sin(t * 2.9)) * ph.rest;
      found.visible = (b.y || 0) > 0.01 && ph.base > 0.2;
      // after dark the glass shows the kiln's light from outside
      glassMat.emissive.setRGB(0.55, 0.42, 0.95).multiplyScalar(0.12 * night * ph.rest); glassMat.opacity = 0.16 + 0.1 * night;
      return { flame: ph.rest, door: open };
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
