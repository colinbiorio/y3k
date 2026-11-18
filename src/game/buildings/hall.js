// buildings/hall.js — THE HALL, DRAWN (three.js), from ../hall.js's numbers:
// three terraces of pale limestone, their beds along each edge planted low
// (shrubs, some in flower), the stairs; the hangar in the lowest terrace, its
// wide arched mouth, a row of lamps along its vault; on top, the hall: stone
// walls, a band of clear glass in pale alloy along both sides under the eaves,
// the gables, a great door of two leaves; inside, stone columns down both sides
// and on them seven laminated-timber arches carrying a roof of dark solar
// tiles; the long table and its benches, the round stone hearth with its steady
// plasma flame, woven hangings between the columns.
//
// As the other four: everything but the glass, the door's leaves and the flame
// is one mesh of one material, each part saying what it is made of (aPart)
// and when it goes up (aStage: the terraces rising, the walls and columns, the
// arches one after another, the roof, then the things and the gardens' growth);
// taken down, the same way backward. Inside (the hall's air, the hangar's) it
// is lit by what gets in: the sun by the glass under the eaves, the door and
// the hangar's mouth (as ../hall.js's sunLocal), the sky by how near those a
// surface is, the hearth at night.
import * as THREE from 'three';
import { HALL as W, P, IN, BACK_IN, FRONT_IN, WALL_TOP, EAVE_Y, TAN, roofIn, roofOut, RIDGE, SOLIDS, archTop, phase } from '../hall.js';
import { gatherer, boxG, slabG, quadG, rect } from './parts.js';
import { glowTexture } from '../fight.js';

const PART = { lime: 0, garden: 1, leaf: 2, glulam: 3, solar: 4, under: 5, alloy: 6, timber: 7, woven: 8, lamp: 9, flags: 10 };
const STAGE = { base: 0, walls: 1, arches: 2, roof: 3 };
const [T1, T2, T3] = W.terraces, HG = W.hangar, D = W.door, C = W.columns;
const f = (v) => v.toFixed(4);

// a beam of w by d drawn along a line of points in the X–Y plane at z (an arch), its uv: along, and across 0..1
function beamG(pts, w, d, z) {
  const P3 = [], U = [], quad = (a, b, c, e, ua, ub) => { P3.push(...a, ...b, ...c, ...a, ...c, ...e); U.push(ua[0], ua[1], ub[0], ub[1], ub[0], ub[1] + 1, ua[0], ua[1], ub[0], ub[1] + 1, ua[0], ua[1] + 1); };
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], tx = x1 - x0, ty = y1 - y0, l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
    const n0 = i > 0 ? (() => { const [xa, ya] = pts[i - 1], la = Math.hypot(x0 - xa, y0 - ya) || 1; const mx = (-(y0 - ya) / la + nx) / 2, my = ((x0 - xa) / la + ny) / 2, m = Math.hypot(mx, my) || 1; return [mx / m, my / m]; })() : [nx, ny];
    const n1 = i < pts.length - 2 ? (() => { const [xb, yb] = pts[i + 2], lb = Math.hypot(xb - x1, yb - y1) || 1; const mx = (nx - (yb - y1) / lb) / 2, my = (ny + (xb - x1) / lb) / 2, m = Math.hypot(mx, my) || 1; return [mx / m, my / m]; })() : [nx, ny];
    const a = (n, s, pz, [x, y]) => [x + n[0] * s * w / 2, y + n[1] * s * w / 2, z + pz * d / 2];
    const u0 = len, u1 = len + l; len = u1;
    for (const [sa, za, sb, zb] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) quad(a(n0, sa, za, [x0, y0]), a(n1, sa, za, [x1, y1]), a(n1, sb, zb, [x1, y1]), a(n0, sb, zb, [x0, y0]), [u0, 0], [u1, 0]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.computeVertexNormals();
  return g;
}
// one arch's centre line, from a column's top up its curved haunch and along the roof to the apex, and down the other side
function archLine() {
  const off = 0.75, line = (x) => roofIn(x) - off, top = P + C.high, q0 = [C.x, top], q1 = [C.x, line(C.x)], q2 = [9, line(9)], half = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14, u = 1 - t; half.push([u * u * q0[0] + 2 * u * t * q1[0] + t * t * q2[0], u * u * q0[1] + 2 * u * t * q1[1] + t * t * q2[1]]); }
  for (let i = 1; i <= 6; i++) { const x = 9 - (9 * i) / 6; half.push([x, line(x)]); }
  return [...half, ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
}

const COMMON = `
  uniform vec2 uCentre; uniform float uYaw; uniform float uBuild; uniform float uBase; uniform float uTime;
  vec3 toLocal(vec3 w) { vec2 d = w.xz - uCentre; float c = cos(uYaw), s = sin(uYaw); return vec3(c * d.x - s * d.y, w.y - uBase, s * d.x + c * d.y); }
  vec3 dirLocal(vec3 v) { float c = cos(uYaw), s = sin(uYaw); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }
  float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n2(vec2 p) { vec2 i = floor(p), g = fract(p), u = g * g * (3.0 - 2.0 * g);
    return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y); }
  float roofIn(float ax) { return ${f(EAVE_Y)} + (${f(W.eave)} - ax) * ${f(TAN)}; }
  bool inRoom(vec3 l, float m) { return abs(l.x) < ${f(IN)} - m && l.z > ${f(BACK_IN)} + m && l.z < ${f(FRONT_IN)} - m && l.y > ${f(P)} + m && l.y < roofIn(abs(l.x)) - m; }
  bool inHangar(vec3 l, float m) { return abs(l.x) < ${f(HG.half)} - m && l.z > ${f(HG.back)} + m && l.z < ${f(T1.hz - HG.front)} - m && l.y > 0.05 + m && l.y < ${f(HG.ceil)} - m; }
  float bond(vec2 q, vec2 size, float j) { q.x += 0.5 * mod(floor(q.y), 2.0); vec2 e = min(fract(q), 1.0 - fract(q)) * size; return smoothstep(j * 0.5, j, min(e.x, e.y)); }
  vec2 bondId(vec2 q) { return floor(vec2(q.x + 0.5 * mod(floor(q.y), 2.0), q.y)); }
  vec3 limestone(vec3 l, vec3 nl, vec2 size) {
    vec2 w2 = abs(nl.y) > 0.5 ? l.xz : (abs(nl.x) > 0.5 ? l.zy : l.xy), q = w2 / size;
    vec3 c = vec3(0.84, 0.81, 0.73) * (0.88 + 0.15 * h1(bondId(q))) * (0.93 + 0.09 * n2(w2 * 2.5));
    return mix(c * 0.8, c, bond(q, size, 0.014));
  }
  vec3 partColour(float part, float stage, vec3 l, vec2 uv, vec3 nl, out float rough, out float metal, out float glow) {
    rough = 0.85; metal = 0.0; glow = 0.0;
    if (part < 0.5) {                // limestone: the terraces, stairs, walls and columns; weathered darker low on the terraces' faces
      vec3 c = limestone(l, nl, abs(nl.y) > 0.5 ? vec2(1.2, 0.8) : vec2(0.9, 0.45));
      if (abs(nl.y) < 0.5 && l.y < 1.2) c *= mix(0.82, 1.0, smoothstep(0.0, 1.2, l.y + 0.3 * n2(l.xz * 2.0)));
      return c;
    }
    if (part < 1.5) {                // a garden bed: a stone kerb round dark soil, planted (the planting grows in with the things)
      if (nl.y < 0.5) return limestone(l, nl, vec2(0.6, 0.4)) * 0.92;
      float g = clamp((uBuild - 4.55) * 3.0, 0.0, 1.0), leaf = n2(l.xz * 3.2) * 0.6 + n2(l.xz * 11.0) * 0.4;
      vec3 soil = vec3(0.24, 0.17, 0.11) * (0.8 + 0.3 * n2(l.xz * 7.0));
      vec3 green = mix(vec3(0.16, 0.3, 0.12), vec3(0.32, 0.45, 0.18), leaf);
      float bloom = step(0.82, h1(floor(l.xz * 9.0))) * step(0.5, n2(l.xz * 0.6));
      green = mix(green, mix(vec3(0.58, 0.48, 0.78), vec3(0.92, 0.88, 0.7), step(0.5, h1(floor(l.xz * 9.0) + 3.0))), bloom);
      rough = 0.95; return mix(soil, green, g * smoothstep(0.25, 0.45, leaf + 0.1));
    }
    if (part < 2.5) {                // a low shrub: rosemary and lavender greys and greens, a few in flower
      rough = 0.9; float k = n2(l.xz * 2.0), fl = step(0.72, n2(l.xz * 0.35 + 7.0)) * step(0.55, h1(floor(l.xz * 30.0 + l.y * 30.0)));
      return mix(mix(vec3(0.2, 0.33, 0.16), vec3(0.36, 0.42, 0.3), k) * (0.75 + 0.35 * n2(l.xz * 12.0 + l.y * 9.0)), vec3(0.55, 0.45, 0.78), fl);
    }
    if (part < 3.5) {                // laminated timber: the lamellae along the arch, glued edge to edge
      rough = 0.55; float lam = fract(uv.y * 9.0);
      return vec3(0.66, 0.47, 0.28) * (0.86 + 0.14 * n2(vec2(uv.x * 3.0, uv.y * 9.0))) * (1.0 - 0.18 * smoothstep(0.08, 0.0, min(lam, 1.0 - lam)));
    }
    if (part < 4.5) {                // dark glass solar tiles
      rough = 0.16; metal = 0.2;
      vec2 cq = fract(vec2(l.z / 0.6, abs(l.x) * ${f(Math.sqrt(1 + TAN * TAN))} / 0.42)); float grid = smoothstep(0.0, 0.05, min(min(cq.x, 1.0 - cq.x), min(cq.y, 1.0 - cq.y)));
      return mix(vec3(0.22, 0.22, 0.23), vec3(0.02, 0.03, 0.06), grid);
    }
    if (part < 5.5) {                // the roof's underside: boards across the arches
      rough = 0.8; float pl = floor(abs(l.x) / 0.18);
      return vec3(0.52, 0.38, 0.24) * (0.84 + 0.18 * h1(vec2(pl, 2.0))) * (1.0 - 0.3 * smoothstep(0.01, 0.0, abs(fract(abs(l.x) / 0.18) - 0.5) - 0.49));
    }
    if (part < 6.5) { rough = 0.3; metal = 0.85; return vec3(0.8, 0.82, 0.85) * (0.95 + 0.05 * n2(l.xz * 30.0 + l.y * 7.0)); }   // pale alloy
    if (part < 7.5) { rough = 0.72; return vec3(0.4, 0.27, 0.16) * (0.8 + 0.28 * n2(uv * vec2(3.0, 40.0))); }                     // timber
    if (part < 8.5) {                // a woven hanging: bands of madder, indigo and ochre, a diamond twill across them
      rough = 0.95; float v = l.y - ${f(P)}, u = abs(nl.x) > 0.5 ? l.z : l.x;
      float band = floor(v / 0.45), dia = abs(fract(u / 0.3 + abs(fract(v / 0.3) - 0.5)) - 0.5);
      vec3 c = mod(band, 3.0) < 1.0 ? vec3(0.55, 0.13, 0.1) : mod(band, 3.0) < 2.0 ? vec3(0.12, 0.17, 0.36) : vec3(0.72, 0.55, 0.22);
      return mix(c, vec3(0.86, 0.8, 0.66), step(0.42, dia) * 0.8) * (0.85 + 0.2 * step(0.5, fract(u * 40.0 + 0.5 * floor(v * 60.0))));
    }
    if (part < 9.5) { glow = 1.0; return vec3(0.9, 0.88, 1.0); }                                                                    // a hangar lamp
    rough = 0.7; vec2 q = l.xz / vec2(1.0, 0.7);                                                                                     // the hall's floor: big flags
    return mix(vec3(0.42, 0.4, 0.37), vec3(0.66, 0.63, 0.57) * (0.86 + 0.16 * h1(bondId(q))) * (0.92 + 0.1 * n2(l.xz * 3.0)), bond(q, vec2(1.0, 0.7), 0.012));
  }
`;
const INSIDE = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uFire; uniform vec3 uFireCol; uniform float uDoor; uniform float uOpen;
  float sunLocal(vec3 l, vec3 d) {
    if (d.y <= 0.0) return 0.0;
    if (l.y < ${f(HG.ceil + 0.05)}) {
      if (d.z <= 1e-5) return 0.0;
      float t = (${f(T1.hz)} - l.z) / d.z, ex = l.x + d.x * t, ey = l.y + d.y * t;
      float tw = abs(d.x) > 1e-5 ? (sign(d.x) * ${f(HG.half)} - l.x) / d.x : 1e4, tc = (${f(HG.ceil)} - l.y) / d.y;
      float at = ${f(HG.spring)} + ${f(HG.ceil - HG.spring)} * sqrt(max(0.0, 1.0 - (ex / ${f(HG.mouth)}) * (ex / ${f(HG.mouth)})));
      return (min(tw, tc) > t - ${f(HG.front + 0.01)} / d.z && abs(ex) < ${f(HG.mouth)} && ey < at) ? 1.0 : 0.0;
    }
    float tx = d.x > 1e-5 ? (${f(IN)} - l.x) / d.x : d.x < -1e-5 ? (-${f(IN)} - l.x) / d.x : 1e4;
    float tz = d.z > 1e-5 ? (${f(FRONT_IN)} - l.z) / d.z : d.z < -1e-5 ? (${f(BACK_IN)} - l.z) / d.z : 1e4;
    float tr = 1e4;
    for (int k = 0; k < 2; k++) {
      float sg = k == 0 ? 1.0 : -1.0, den = d.y + ${f(TAN)} * sg * d.x;
      float t = den > 1e-5 ? (${f(EAVE_Y + W.eave * TAN)} - l.y - ${f(TAN)} * sg * l.x) / den : 1e4;
      if (t > 0.0 && t < tr && sg * (l.x + d.x * t) >= -1e-4) tr = t;
    }
    float t = min(tx, min(tz, tr));
    if (t == tx) {
      float ey = l.y + d.y * t;
      if (ey < ${f(WALL_TOP)} || ey > ${f(EAVE_Y)}) return 0.0;
      return l.y + d.y * ((${f(W.eave)} - abs(l.x)) / abs(d.x)) < ${f(EAVE_Y)} ? 1.0 : 0.0;
    }
    if (t == tz && d.z > 0.0) { vec3 e = l + d * t; return abs(e.x) < ${f(D.half)} && e.y < ${f(P + D.high)} ? uDoor : 0.0; }
    return 0.0;
  }
  vec3 litInside(vec3 albedo, vec3 l, vec3 w, vec3 nw) {
    vec3 nl = dirLocal(nw), dl = dirLocal(uSunDir);
    vec3 col = uSunCol * mix(sunLocal(l + nl * 0.03, dl), 1.0, uOpen) * max(dot(nl, dl), 0.0);
    float open;
    if (l.y < ${f(HG.ceil + 0.05)}) open = 0.07 + 0.75 * exp(-(${f(T1.hz)} - l.z) / 5.0) * (0.6 + 0.4 * max(nl.z, 0.0));
    else {
      vec2 dd = vec2(l.x, l.z - ${f(FRONT_IN)});
      open = 0.2 + 0.5 * exp(-(${f(IN)} - abs(l.x)) / 5.0) * (0.55 + 0.45 * max(nl.y, 0.0)) + 0.45 * uDoor * exp(-dot(dd, dd) / 12.0);
    }
    col += uSky * mix(open, 1.0, uOpen);
    vec3 Lf = uFire - w; float dist = length(Lf);
    col += uFireCol * max(dot(nw, Lf / dist) * 0.8 + 0.2, 0.0) / (1.0 + dist * dist / 14.0);
    return albedo * col;
  }
`;

export function createHallArt({ lite = false } = {}) {
  const group = new THREE.Group(), GA = gatherer(), put = GA.put, mats = [], geos = [];
  const keep = (m) => { mats.push(m); return m; };
  const U = {
    uCentre: { value: new THREE.Vector2() }, uYaw: { value: 0 }, uBuild: { value: 0 }, uTime: { value: 0 }, uBase: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uFire: { value: new THREE.Vector3() }, uFireCol: { value: new THREE.Color() }, uDoor: { value: 0.3 }, uOpen: { value: 1 },
  };
  const bx = (s, part, stage) => put(boxG(s.x0, s.x1, s.y0, s.y1, s.z0, s.z1), part, stage);

  // ---- the terraces, the stairs and the beds, from the numbers' own boxes; the mouth's face, cut round its arch; the
  // lamps along the hangar's vault
  for (const s of SOLIDS) {
    if (s.part === 'terrace' || s.part === 'vault' || s.part === 'step' || s.part === 'apron') bx(s, PART.lime, STAGE.base);
    else if (s.part === 'bed') bx(s, PART.garden, STAGE.base);
  }
  { const arch = new THREE.Path(); arch.moveTo(-HG.mouth, 0.05); arch.lineTo(HG.mouth, 0.05);
    for (let i = 0; i <= 24; i++) { const x = HG.mouth - (2 * HG.mouth * i) / 24; arch.lineTo(x, archTop(x)); }
    put(slabG([[-HG.half, 0], [HG.half, 0], [HG.half, T1.top], [-HG.half, T1.top]], [arch], T1.hz - HG.front, T1.hz), PART.lime, STAGE.base); }
  for (let z = 4; z < T1.hz - 2; z += 7) put(boxG(-0.6, 0.6, HG.ceil - 0.04, HG.ceil, z - 2, z + 2), PART.lamp, STAGE.base + 0.9);
  // low shrubs along the beds, a few to the metre, each a little different (they grow in with the things)
  { let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const s of SOLIDS) {
      if (s.part !== 'bed') continue;
      const long = s.x1 - s.x0 > s.z1 - s.z0, len = long ? s.x1 - s.x0 : s.z1 - s.z0, n = Math.floor(len * (lite ? 0.8 : 1.6));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5 + (rnd() - 0.5) * 0.6) / n, a = 0.25 + rnd() * 0.3, x = long ? s.x0 + t * len : (s.x0 + s.x1) / 2 + (rnd() - 0.5) * 0.7, z = long ? (s.z0 + s.z1) / 2 + (rnd() - 0.5) * 0.7 : s.z0 + t * len;
        const g = new THREE.IcosahedronGeometry(a, 0); g.scale(1, 0.7, 1); g.rotateY(rnd() * 6.28); g.translate(x, s.y1 + a * 0.45, z); put(g, PART.leaf, 4.6);
      }
    }
  }
  // ---- the hall: its floor of flags, its side walls, the timber plate over the glass, the gables (the front's cut for
  // the door), the columns
  put(boxG(-IN, IN, P, P + 0.01, BACK_IN, FRONT_IN), PART.flags, STAGE.walls);
  for (const sx of [-1, 1]) {
    put(boxG(sx > 0 ? IN : -W.half, sx > 0 ? W.half : -IN, P, WALL_TOP, W.back, W.front), PART.lime, STAGE.walls);
    put(boxG(sx > 0 ? IN : -W.half, sx > 0 ? W.half : -IN, EAVE_Y, roofIn(IN) + 0.05, W.back, W.front), PART.timber, STAGE.roof);
  }
  const gable = [[-W.half, P], [W.half, P], [W.half, roofIn(W.half)], [0, roofIn(0) + 0.05], [-W.half, roofIn(W.half)]];
  put(slabG(gable, [], W.back, BACK_IN), PART.lime, STAGE.walls);
  put(slabG(gable, [rect(-D.half, P, D.half, P + D.high)], FRONT_IN, W.front), PART.lime, STAGE.walls);
  for (const sx of [-1, 1]) for (const z of C.zs) {
    const g = new THREE.CylinderGeometry(C.r - 0.04, C.r, C.high - 0.5, lite ? 16 : 24); g.translate(sx * C.x, P + 0.25 + (C.high - 0.5) / 2, z); put(g, PART.lime, STAGE.walls);
    put(boxG(sx * C.x - 0.52, sx * C.x + 0.52, P, P + 0.25, z - 0.52, z + 0.52), PART.lime, STAGE.walls);
    put(boxG(sx * C.x - 0.5, sx * C.x + 0.5, P + C.high - 0.25, P + C.high, z - 0.5, z + 0.5), PART.lime, STAGE.walls);
  }
  // ---- the arches, one on each pair of columns, going up one after another from the front
  const line = archLine();
  C.zs.slice().reverse().forEach((z, k) => put(beamG(line, 0.42, 0.55, z), PART.glulam, STAGE.arches + k / C.zs.length));
  // purlins along the roof between the arches, at three heights a side; the ridge beam
  for (const sx of [-1, 1]) for (const ax of [3.5, 7.5, 11.5]) put(boxG(sx * ax - 0.1, sx * ax + 0.1, roofIn(ax) - 0.3, roofIn(ax) - 0.02, W.back + 0.6, W.front - 0.6), PART.glulam, STAGE.arches + 0.95);
  put(boxG(-0.15, 0.15, roofIn(0) - 0.45, roofIn(0) - 0.02, W.back + 0.6, W.front - 0.6), PART.glulam, STAGE.arches + 0.95);
  // ---- the roof: two slabs of solar tiles from the eaves to the ridge, their undersides boarded, their edges; a ridge cap
  for (const sx of [-1, 1]) {
    const o = (ax, y) => [sx * ax, y], at = ([x, y], z) => [x, y, z];
    const eT = o(W.eave, roofOut(W.eave)), rT = o(0, roofOut(0)), eI = o(W.eave, roofIn(W.eave)), rI = o(0, roofIn(0));
    put(sx > 0 ? quadG(at(eT, W.end), at(eT, -W.end), at(rT, -W.end), at(rT, W.end)) : quadG(at(eT, -W.end), at(eT, W.end), at(rT, W.end), at(rT, -W.end)), PART.solar, STAGE.roof);
    put(sx > 0 ? quadG(at(eI, -W.end), at(eI, W.end), at(rI, W.end), at(rI, -W.end)) : quadG(at(eI, W.end), at(eI, -W.end), at(rI, -W.end), at(rI, W.end)), PART.under, STAGE.roof);
    put(sx > 0 ? quadG(at(eI, W.end), at(eI, -W.end), at(eT, -W.end), at(eT, W.end)) : quadG(at(eI, -W.end), at(eI, W.end), at(eT, W.end), at(eT, -W.end)), PART.alloy, STAGE.roof);
    for (const ez of [-1, 1]) { const z = ez * W.end; put(sx * ez > 0 ? quadG(at(eI, z), at(eT, z), at(rT, z), at(rI, z)) : quadG(at(eT, z), at(eI, z), at(rI, z), at(rT, z)), PART.alloy, STAGE.roof); }
  }
  put(boxG(-0.12, 0.12, RIDGE - 0.03, RIDGE + 0.1, -W.end, W.end), PART.alloy, STAGE.roof + 0.5);
  // the glass band's frame: a sill and a head along each side, mullions every two and a half metres
  for (const sx of [-1, 1]) {
    const x0 = sx * (W.half - W.wall / 2) - 0.06, x1 = x0 + 0.12;
    put(boxG(x0, x1, WALL_TOP, WALL_TOP + 0.08, W.back + 0.6, W.front - 0.6), PART.alloy, STAGE.roof);
    put(boxG(x0, x1, EAVE_Y - 0.08, EAVE_Y, W.back + 0.6, W.front - 0.6), PART.alloy, STAGE.roof);
    for (let z = W.back + 0.6; z <= W.front - 0.6 + 1e-9; z += 2.5) put(boxG(x0, x1, WALL_TOP, EAVE_Y, z - 0.05, z + 0.05), PART.alloy, STAGE.roof);
  }
  // ---- the things: the long table on trestles and its two benches; the round hearth; the hangings between the columns
  { const t = W.table, top = P + t.top;
    put(boxG(-t.half, t.half, top - 0.08, top, t.z0, t.z1), PART.timber, 4.1);
    for (let z = t.z0 + 0.8; z <= t.z1 - 0.8 + 1e-9; z += (t.z1 - t.z0 - 1.6) / 3) { put(boxG(-t.half + 0.15, t.half - 0.15, P, P + 0.08, z - 0.06, z + 0.06), PART.timber, 4.1); put(boxG(-0.08, 0.08, P, top - 0.08, z - 0.06, z + 0.06), PART.timber, 4.1); put(boxG(-t.half + 0.1, t.half - 0.1, top - 0.2, top - 0.08, z - 0.05, z + 0.05), PART.timber, 4.1); }
    const bn = W.bench;
    for (const sx of [-1, 1]) {
      put(boxG(sx * bn.x - bn.half, sx * bn.x + bn.half, P + bn.top - 0.06, P + bn.top, t.z0, t.z1), PART.timber, 4.2);
      for (let z = t.z0 + 0.5; z <= t.z1 - 0.5 + 1e-9; z += (t.z1 - t.z0 - 1) / 4) put(boxG(sx * bn.x - 0.05, sx * bn.x + 0.05, P, P + bn.top - 0.06, z - 0.18, z + 0.18), PART.timber, 4.2);
    } }
  { const h = W.hearth, g = new THREE.CylinderGeometry(h.half, h.half + 0.08, h.top, lite ? 24 : 40); g.translate(0, P + h.top / 2, h.z); put(g, PART.lime, 4.3);
    const g2 = new THREE.CylinderGeometry(h.half - 0.35, h.half - 0.35, 0.02, lite ? 24 : 40); g2.translate(0, P + h.top + 0.005, h.z); put(g2, PART.lamp, 4.3); }
  for (const sx of [-1, 1]) for (let k = 0; k < C.zs.length - 1; k++) {
    const z0 = C.zs[k] + 0.9, z1 = C.zs[k + 1] - 0.9, x = sx * (IN - 0.04), y0 = P + 0.7, y1 = P + 4.1;
    put(sx > 0 ? quadG([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]) : quadG([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]), PART.woven, 4.5);
    put(boxG(x - 0.05, x + 0.05, y1, y1 + 0.08, z0 - 0.2, z1 + 0.2), PART.timber, 4.5);
  }

  const mesh = new THREE.Mesh(GA.geometry(), keep(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.55, side: THREE.DoubleSide })));
  geos.push(mesh.geometry);
  mesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aStage;\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart; vStage = aStage; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTex = uv; vNl = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;\n' + COMMON + INSIDE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 lo = toLocal(vW);
        // going up: a stage not begun is not there; the terraces rise from the ground, the walls and columns from the floor,
        // each arch from its feet to its apex, the roof from the eaves to the ridge; the rest appear at their turn
        if (uBuild < vStage) discard;
        if (vStage < 0.5) { if (uBuild < 1.0 && lo.y > mix(0.0, ${f(P + 0.45)}, uBuild)) discard; }
        else if (vStage < 1.5) { if (uBuild < 2.0 && lo.y > mix(${f(P)}, ${f(RIDGE)}, uBuild - 1.0)) discard; }
        else if (vStage < 2.99) { float k = (uBuild - vStage) * ${f(C.zs.length)}; if (k < 1.0 && lo.y > mix(${f(P + C.high)}, ${f(RIDGE)}, k)) discard; }
        else if (vStage < 3.5) { if (uBuild < 4.0 && lo.y > mix(${f(EAVE_Y - 0.2)}, ${f(RIDGE + 0.2)}, uBuild - 3.0)) discard; }
        float rough, metal, glow;
        diffuseColor.rgb = partColour(vPart, vStage, lo, vTex, vNl, rough, metal, glow);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = metal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * glow * 0.9;')
      .replace('#include <opaque_fragment>', `
        { vec3 lo2 = toLocal(vW);
          if ((inRoom(lo2, -0.03) || inHangar(lo2, -0.03)) && glow < 0.5) outgoingLight = litInside(diffuseColor.rgb, lo2, vW, normalize(inverseTransformDirection(normal, viewMatrix))); }
        #include <opaque_fragment>`);
  };
  mesh.material.customProgramCacheKey = () => 'hall-body';
  group.add(mesh);

  // ---- the glass under the eaves, both sides
  const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xe4f0f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.15, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }));
  const glassG = (() => { const g = new THREE.BufferGeometry(), x = W.half - W.wall / 2, y0 = WALL_TOP + 0.08, y1 = EAVE_Y - 0.08, z0 = W.back + 0.6, z1 = W.front - 0.6;
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, y0, z0, x, y0, z1, x, y1, z1, x, y0, z0, x, y1, z1, x, y1, z0, -x, y0, z1, -x, y0, z0, -x, y1, z0, -x, y0, z1, -x, y1, z0, -x, y1, z1], 3)); g.computeVertexNormals(); return g; })();
  geos.push(glassG);
  const glass = new THREE.Mesh(glassG, glassMat); group.add(glass);

  // ---- the door: two leaves of planks, hinged at the doorway's sides, swinging in
  const doorMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.19, 0.11), roughness: 0.78, metalness: 0, envMapIntensity: 0.5 }));
  const leafG = new THREE.BoxGeometry(D.half - 0.02, D.high - 0.02, 0.1); geos.push(leafG);
  const leaves = [-1, 1].map((sx) => {
    const hinge = new THREE.Group(); hinge.position.set(sx * D.half, P + D.high / 2, FRONT_IN + 0.12);
    const m = new THREE.Mesh(leafG, doorMat); m.position.x = -sx * (D.half / 2); hinge.add(m); group.add(hinge); return { hinge, sx };
  });

  // ---- the hearth's flame: a steady plasma over the stone, its sheath violet, its heart white, and its glow
  const tex = glowTexture(), flames = [];
  for (const [y, s, col] of [[0.45, 2.4, [0.45, 0.32, 0.95]], [0.95, 1.6, [0.7, 0.6, 1.0]], [1.35, 0.95, [1.0, 0.97, 1.0]]]) {
    const m = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(...col), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const sp = new THREE.Sprite(m); sp.position.set(0, P + W.hearth.top + y, W.hearth.z); sp.scale.setScalar(s); group.add(sp); flames.push({ sp, s, y });
  }
  const fireAt = new THREE.Vector3(0, P + W.hearth.top + 0.8, W.hearth.z), fireCol = new THREE.Color(0.75, 0.62, 1.0);

  // ---- its foundations, where it stands raised on uneven ground (the island): the terraces and stairs carried down 1.6 m
  const foundG = boxG(-T1.hx, T1.hx, -1.6, 0, -T1.hz, T1.hz + W.lower.steps * W.lower.going); geos.push(foundG);
  const found = new THREE.Mesh(foundG, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.38, 0.34), roughness: 0.95 })));
  found.visible = false; group.add(found);

  let doorOpen = 0;
  return {
    group, flameAt: fireAt, fireCol,
    update(b, { t = 0, dt = 0, sun = [0, 1, 0], sunCol = new THREE.Color(1, 1, 1), sky = new THREE.Color(0.2, 0.2, 0.25), near = false, night = 0 } = {}) {
      group.position.set(b.x, b.y || 0, b.z); group.rotation.y = b.yaw;
      const ph = phase(b);
      U.uCentre.value.set(b.x, b.z); U.uYaw.value = b.yaw; U.uTime.value = t; U.uBase.value = b.y || 0;
      const build = ph.rest > 0 ? 4 + ph.rest : ph.roof > 0 ? 3 + ph.roof : ph.arches > 0 ? 2 + ph.arches : ph.walls > 0 ? 1 + ph.walls : ph.base;
      U.uBuild.value = build;
      U.uOpen.value = 1 - ph.roof;
      U.uSunDir.value.set(sun[0], sun[1], sun[2]); U.uSunCol.value.copy(sunCol); U.uSky.value.copy(sky);
      U.uFire.value.copy(fireAt).applyMatrix4(group.matrixWorld.compose(group.position, group.quaternion, group.scale));
      const lit = build >= 4.3;
      U.uFireCol.value.copy(fireCol).multiplyScalar(lit ? 1.2 * ph.rest : 0);
      doorOpen += ((near ? 1 : 0) - doorOpen) * (1 - Math.exp(-4 * dt));
      for (const l of leaves) { l.hinge.rotation.y = -l.sx * 1.4 * doorOpen; l.hinge.visible = build >= 4.05; }
      U.uDoor.value = 0.2 + 0.8 * doorOpen;
      glass.visible = build >= 3.9;
      flames.forEach((fl, i) => { fl.sp.visible = lit; const w = 1 + 0.06 * Math.sin(t * (3.1 + i)) * Math.sin(t * (1.7 + 0.5 * i)); fl.sp.scale.set(fl.s * w, fl.s * (1.5 - 0.15 * i) * w, 1); fl.sp.material.opacity = 0.8 * ph.rest; });
      found.visible = (b.y || 0) > 0.01 && ph.base > 0.2;
      glassMat.emissive.setRGB(0.6, 0.5, 0.9).multiplyScalar(0.12 * night * ph.rest); glassMat.opacity = 0.15 + 0.1 * night;
      return { flame: lit ? ph.rest : 0, door: doorOpen };
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
