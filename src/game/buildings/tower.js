// buildings/tower.js — THE TOWER, DRAWN (three.js), from ../tower.js's numbers:
// a stone plinth; the round shaft of pale limestone, banded outside with
// blue-green glazed tiles, its arched door, the narrow windows spiralling up it
// over the stair, the ledge's door at the top; the stone stair, a hundred steps
// round the wall, its brass rail on its inner edge; the two wooden landings
// with their beams and rails, a desk and its plasma lamp on the first, a shelf
// of scrolls and instruments on the second; the gallery round the well under
// the dome, its rail and a brass telescope on a tripod; the dome of brass ribs
// and clear glass with a finial; the armillary sphere hanging in it over the
// well, its rings turning slowly; the stone ledge on its corbels outside.
//
// As the house and the workshop: everything but the glass, the door, the lamp
// and the armillary's turning rings is one mesh of one material, each part
// saying what it is made of (aPart) and when it goes up (aStage: the plinth,
// the shaft and its stair course by course, the floors, the dome's ribs from
// their spring to the crown, then the things); taken down, the same way
// backward. Inside it is lit by what gets in (as ../tower.js's sunLocal): the
// sun through the narrow windows, the door and down through the dome, the sky
// brighter toward the dome, and at night the lamp.
import * as THREE from 'three';
import { TOWER as T, TOP, SPRING, CROWN, LANDINGS, SLITS, THINGS, LAMP, rampAt, treadAt, phase } from '../tower.js';
import { gatherer, boxG, slabG, quadG } from './parts.js';
import { glowTexture } from '../fight.js';

const PART = { lime: 0, stone: 1, brass: 2, timber: 3, boards: 4, parchment: 5, glaze: 6 };
const STAGE = { base: 0, shaft: 1, floors: 2, ribs: 3, things: 4 };
const F = T.floor, RI = T.ri, RO = T.ro, RW = T.well, ST = T.stair, H = ST.rise, D = T.door, L = T.ledge, RD = T.dome.r;
const TAU = 2 * Math.PI, DT = TAU / ST.perTurn;
const f = (v) => v.toFixed(4);
const angleAt = (u) => ST.start - u * DT;                       // the stair's angle at a step coordinate (unwrapped)
const [L1, L2] = LANDINGS;
const DOOR_Z0 = Math.sqrt(RI * RI - D.half * D.half) - 0.01, DOOR_Z1 = Math.sqrt(RO * RO - D.half * D.half) + 0.05;

// an annular sector: radius r0 to r1, angle a0 to a1 (from +X toward +Z), height y0 to y1, in n pieces round
function sectorG(r0, r1, a0, a1, y0, y1, n = 2) {
  const P = [], pt = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  const quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const s = a0 + ((a1 - a0) * i) / n, e = a0 + ((a1 - a0) * (i + 1)) / n;
    quad(pt(r0, s, y1), pt(r1, s, y1), pt(r1, e, y1), pt(r0, e, y1)); quad(pt(r0, e, y0), pt(r1, e, y0), pt(r1, s, y0), pt(r0, s, y0));
    quad(pt(r0, s, y0), pt(r0, s, y1), pt(r0, e, y1), pt(r0, e, y0)); quad(pt(r1, e, y0), pt(r1, e, y1), pt(r1, s, y1), pt(r1, s, y0));
  }
  quad(pt(r0, a0, y0), pt(r1, a0, y0), pt(r1, a0, y1), pt(r0, a0, y1)); quad(pt(r1, a1, y0), pt(r0, a1, y0), pt(r0, a1, y1), pt(r1, a1, y1));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  return g;
}
// a rod from a to b, and a curve's tube
function rodG(a, b, r, n = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), g = new THREE.CylinderGeometry(r, r, len, n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
class Path extends THREE.Curve { constructor(fn) { super(); this.fn = fn; } getPoint(t, out = new THREE.Vector3()) { const [x, y, z] = this.fn(t); return out.set(x, y, z); } }
const tubeG = (fn, r, n = 64, rad = 6) => new THREE.TubeGeometry(new Path(fn), n, r, rad, false);
// a ring in the horizontal plane at height y, of radius R, from angle a0 through `arc` (from +X toward +Z)
function ringG(R, y, tube, a0 = 0, arc = TAU, n = 64) { const g = new THREE.TorusGeometry(R, tube, 6, n, arc); g.rotateX(Math.PI / 2); g.rotateY(-a0); g.translate(0, y, 0); return g; }

// GLSL: the tower's frame, noise, the narrow windows, what each part looks like
const COMMON = `
  uniform vec2 uCentre; uniform float uYaw; uniform float uBuild; uniform float uBase;
  vec3 toLocal(vec3 w) { vec2 d = w.xz - uCentre; float c = cos(uYaw), s = sin(uYaw); return vec3(c * d.x - s * d.y, w.y - uBase, s * d.x + c * d.y); }
  vec3 dirLocal(vec3 v) { float c = cos(uYaw), s = sin(uYaw); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }
  float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n2(vec2 p) { vec2 i = floor(p), g = fract(p), u = g * g * (3.0 - 2.0 * g);
    return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y); }
  float wrapPi(float a) { return a - 6.2831853 * floor((a + 3.1415927) / 6.2831853); }
  bool inRoom(vec3 l, float m) {
    float r = length(l.xz);
    if (l.y <= ${f(F)} + m) return false;
    if (l.y < ${f(SPRING)}) return r < ${f(RI)} - m;
    return r < ${f(RD)} - m && l.y < ${f(SPRING)} + sqrt(max(0.0, ${f(RD * RD)} - r * r)) - m;
  }
  // in a narrow window: the one at this height, if this is its angle (the windows are one over every ${T.slits} steps)
  bool inSlit(vec3 l, float r) {
    float i = floor((l.y - ${f(F + 1.25)}) / ${f(H * T.slits)} + 0.5) * ${f(T.slits)};
    if (i < ${f(T.slits - 0.5)} || i > ${f(ST.steps - 2.5)}) return false;
    float wy = ${f(F + 1.25)} + i * ${f(H)};
    if (abs(l.y - wy) > 0.5) return false;
    return abs(wrapPi(atan(l.z, l.x) - (${f(ST.start)} - (i - 0.5) * ${f(DT)}))) * r < 0.12;
  }
  bool inDoorway(vec3 l) {
    if (l.z <= 0.0 || abs(l.x) >= ${f(D.half)}) return false;
    if (l.y < ${f(D.spring)} + sqrt(max(0.0, ${f(D.half * D.half)} - l.x * l.x)) && l.y > -0.5) return true;
    return l.y > ${f(TOP - 0.05)} && l.y < ${f(TOP + L.door)};
  }
  float bond(vec2 q, vec2 size, float j) { q.x += 0.5 * mod(floor(q.y), 2.0); vec2 e = min(fract(q), 1.0 - fract(q)) * size; return smoothstep(j * 0.5, j, min(e.x, e.y)); }
  vec2 bondId(vec2 q) { return floor(vec2(q.x + 0.5 * mod(floor(q.y), 2.0), q.y)); }
  vec3 partColour(float part, vec3 l, vec2 uv, vec3 nl, out float rough, out float metal) {
    rough = 0.85; metal = 0.0;
    float r = length(l.xz), a = atan(l.z, l.x);
    if (part < 0.5) {               // the shaft: pale limestone blocks; outside, a band of blue-green glazed tiles every four metres
      bool outer = r > ${f((RI + RO) / 2)} && abs(nl.y) < 0.5;
      float band = abs(mod(l.y - 3.0, 4.0) - 2.0);
      if (outer && (band > 1.82 || l.y > ${f(SPRING - 0.36)})) {
        vec2 q = vec2(a * r / 0.175, l.y / 0.175); vec2 e = min(fract(q), 1.0 - fract(q));
        rough = 0.16;
        return mix(vec3(0.08, 0.2, 0.19), vec3(0.16, 0.5, 0.47) * (0.85 + 0.25 * h1(floor(q))), smoothstep(0.02, 0.07, min(e.x, e.y)));
      }
      vec2 w2 = abs(nl.y) > 0.5 ? l.xz : vec2(a * r, l.y), q = w2 / vec2(0.7, 0.35);
      vec3 c = vec3(0.86, 0.83, 0.75) * (0.88 + 0.16 * h1(bondId(q))) * (0.94 + 0.08 * n2(w2 * 3.0));
      if (outer) c *= 1.0 - 0.1 * smoothstep(0.55, 0.85, n2(vec2(a * 6.0, l.y * 0.15)));       // streaks where the rain runs
      return mix(c * 0.78, c, bond(q, vec2(0.7, 0.35), 0.012));
    }
    if (part < 1.5) {               // stone: the plinth, the floor, the stair (its treads worn where they are walked), the ledge
      vec2 w2 = abs(nl.y) > 0.5 ? l.xz : vec2(a * max(r, 0.5), l.y), q = w2 / vec2(0.6, 0.3);
      vec3 c = vec3(0.74, 0.71, 0.64) * (0.88 + 0.14 * h1(bondId(q) + 5.0)) * (0.93 + 0.1 * n2(w2 * 5.0));
      if (nl.y > 0.5 && r > ${f(RW)} && r < ${f(RI)}) c *= 1.0 + 0.06 * smoothstep(0.4, 0.0, abs(r - 1.9));
      return mix(c * 0.8, c, bond(q, vec2(0.6, 0.3), 0.01));
    }
    if (part < 2.5) { rough = 0.3; metal = 1.0; return vec3(0.78, 0.6, 0.3) * (0.9 + 0.12 * n2(l.xz * 20.0 + l.y * 9.0)); }      // brass
    if (part < 3.5) { rough = 0.72; return vec3(0.42, 0.28, 0.17) * (0.78 + 0.3 * n2(uv * vec2(3.0, 40.0))); }                       // timber
    if (part < 4.5) {               // the landings' and the gallery's boards
      rough = 0.7; float pl = floor(dot(l.xz, vec2(0.6, 0.8)) / 0.14);
      return vec3(0.55, 0.39, 0.24) * (0.82 + 0.2 * h1(vec2(pl, 7.0)) + 0.08 * n2(vec2(pl * 7.0, dot(l.xz, vec2(-0.8, 0.6)) * 9.0)))
        * (1.0 - 0.35 * smoothstep(0.012, 0.0, abs(fract(dot(l.xz, vec2(0.6, 0.8)) / 0.14) - 0.5) - 0.488));
    }
    if (part < 5.5) { rough = 0.9; return vec3(0.86, 0.8, 0.64) * (0.9 + 0.12 * n2(l.xz * 30.0 + l.y * 20.0)); }                     // parchment
    rough = 0.2; return vec3(0.16, 0.5, 0.47) * (0.9 + 0.15 * n2(l.xz * 8.0 + l.y * 5.0));                                                   // glaze
  }
`;
const INSIDE = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uFire; uniform vec3 uFireCol; uniform float uDoor; uniform float uOpen;
  float outOf(vec2 p, vec2 d, float R) { float a = dot(d, d); if (a < 1e-8) return 1e4; float b = dot(p, d), c = dot(p, p) - R * R; return (-b + sqrt(max(0.0, b * b - a * c))) / a; }
  bool onLanding(vec2 p, vec2 dir) { return length(p) < ${f(RW)} && dot(p, dir) > 0.0; }
  bool galleryOver(float a) { float u = mod(${f(ST.start)} - a, 6.2831853) / ${f(DT)} + ${f(Math.floor(ST.steps / ST.perTurn) * ST.perTurn)};
    return !(u >= ${f(ST.steps - T.opening)} && u <= ${f(ST.steps)}); }
  float sunLocal(vec3 l, vec3 d) {
    if (d.y <= 0.0) return 0.0;
    float tw = outOf(l.xz, d.xz, ${f(RI)}), tu = (${f(SPRING)} - l.y) / d.y, t = min(tw, tu);
    vec2 dir = vec2(${f(L1.dir[0])}, ${f(L1.dir[1])});
    for (int k = 0; k < 2; k++) {
      float top = k == 0 ? ${f(L1.top)} : ${f(L2.top)};
      for (int j = 0; j < 2; j++) { float th = (top - 0.15 * float(j) - l.y) / d.y; if (th > 0.0 && th < t && onLanding(l.xz + d.xz * th, dir)) return 0.0; }
    }
    for (int j = 0; j < 2; j++) { float tg = (${f(TOP)} - 0.15 * float(j) - l.y) / d.y;
      if (tg > 0.0 && tg < t) { vec2 g = l.xz + d.xz * tg; float gr = length(g); if (gr > ${f(RW)} && gr < ${f(RI)} && galleryOver(atan(g.y, g.x))) return 0.0; } }
    // the stair: its surfaces crossed along the ray, a step at a time (its ramp a little off the drawn treads: see ../tower.js)
    float thu = atan(l.z, l.x), last = thu, t0 = min(0.35, t);
    float pc = 0.0; bool pb = false;
    for (int i = 0; i <= 24; i++) {
      float ti = t0 + (t - t0) * float(i) / 24.0;
      vec3 p = l + d * ti; float a = atan(p.z, p.x), da = a - last;
      da -= 6.2831853 * floor(da / 6.2831853 + 0.5); thu += da; last = a;
      float q = (p.y - ${f(F + H / 2)}) / ${f(H)} - (${f(ST.start)} - thu) / ${f(DT)}, pr = length(p.xz);
      bool band = pr > ${f(RW)} && pr < ${f(RI)} && p.y > ${f(F + H)} && p.y < ${f(TOP)};
      float cell = floor(q / ${f(ST.perTurn)}), m = q - cell * ${f(ST.perTurn)};
      if (band && ((m > ${f(ST.perTurn - ST.slab / H + 0.6)} && m < ${f(ST.perTurn - 0.6)}) || (i > 0 && pb && cell != pc))) return 0.0;
      pc = cell; pb = band;
    }
    if (t == tu) return 1.0;
    vec3 e = l + d * t;
    if (e.z > 0.0 && abs(e.x) < ${f(D.half)} && e.y < ${f(D.spring)} + sqrt(max(0.0, ${f(D.half * D.half)} - e.x * e.x))) return uDoor;
    if (e.z > 0.0 && abs(e.x) < ${f(D.half)} && e.y > ${f(TOP)} && e.y < ${f(TOP + L.door)}) return 1.0;
    float to = outOf(l.xz, d.xz, ${f(RO)}); vec3 o = l + d * to;
    return (inSlit(e, ${f(RI)}) && inSlit(o, ${f(RO)})) ? 1.0 : 0.0;
  }
  vec3 litInside(vec3 albedo, vec3 l, vec3 w, vec3 nw) {
    vec3 nl = dirLocal(nw), dl = dirLocal(uSunDir);
    vec3 col = uSunCol * mix(sunLocal(l + nl * 0.02, dl), 1.0, uOpen) * max(dot(nl, dl), 0.0);
    // the sky: brighter toward the dome, and by the door when it is open
    vec2 dd = vec2(l.x, l.z - ${f(RI)});
    float open = 0.12 + 0.8 * exp(-(${f(SPRING)} - min(l.y, ${f(SPRING)})) / 5.0) * (0.55 + 0.45 * max(nl.y, 0.0))
               + 0.55 * uDoor * exp(-(dot(dd, dd) + (l.y - 1.3) * (l.y - 1.3)) / 2.5) * (0.6 + 0.4 * max(nl.z, 0.0));
    col += uSky * mix(open, 1.0, uOpen);
    vec3 Lf = uFire - w; float dist = length(Lf);
    col += uFireCol * max(dot(nw, Lf / dist) * 0.8 + 0.2, 0.0) / (1.0 + dist * dist / 2.0);
    return albedo * col;
  }
`;

export function createTowerArt({ lite = false } = {}) {
  const group = new THREE.Group(), GA = gatherer(), put = GA.put, mats = [], geos = [];
  const keep = (m) => { mats.push(m); return m; };
  const seg = lite ? 40 : 72;
  const U = {
    uCentre: { value: new THREE.Vector2() }, uYaw: { value: 0 }, uBuild: { value: 0 }, uTime: { value: 0 }, uBase: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uFire: { value: new THREE.Vector3() }, uFireCol: { value: new THREE.Color() }, uDoor: { value: 0.3 }, uOpen: { value: 1 },
  };

  // ---- the plinth and the ground floor (stone)
  { const g = new THREE.CylinderGeometry(T.plinth, T.plinth + 0.05, F, seg); g.translate(0, F / 2, 0); put(g, PART.stone, STAGE.base); }
  // ---- the shaft: its outside and inside, the windows, the doors and its top cut away in the shader; the doorways' and
  // the windows' reveals through the wall; the top of the wall round the dome
  for (const R of [RO, RI]) { const g = new THREE.CylinderGeometry(R, R, SPRING, seg, 1, true); g.translate(0, SPRING / 2, 0); put(g, PART.lime, STAGE.shaft); }
  const DOOR_A = Math.asin(D.half / RO) + 0.01;                      // the doorways' half-angle at the wall
  { const g = new THREE.RingGeometry(RI, RO, seg, 1, -Math.PI / 2 + DOOR_A, TAU - 2 * DOOR_A); g.rotateX(-Math.PI / 2); g.translate(0, SPRING, 0); put(g, PART.lime, STAGE.shaft); }
  for (const sx of [-1, 1]) {
    put(quadG([sx * D.half, F, DOOR_Z0], [sx * D.half, F, DOOR_Z1], [sx * D.half, D.spring, DOOR_Z1], [sx * D.half, D.spring, DOOR_Z0]), PART.lime, STAGE.shaft);
    put(quadG([sx * D.half, TOP, DOOR_Z0], [sx * D.half, TOP, DOOR_Z1], [sx * D.half, SPRING, DOOR_Z1], [sx * D.half, SPRING, DOOR_Z0]), PART.lime, STAGE.shaft);
  }
  { const g = new THREE.CylinderGeometry(D.half, D.half, DOOR_Z1 - DOOR_Z0, 16, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); g.translate(0, D.spring, (DOOR_Z0 + DOOR_Z1) / 2); put(g, PART.lime, STAGE.shaft); }
  for (const w of SLITS) {
    const c = Math.cos(w.th), s = Math.sin(w.th), tx = -s, tz = c, at = (r, side, y) => [r * c + tx * side * w.w, y, r * s + tz * side * w.w];
    for (const side of [-1, 1]) put(quadG(at(RI, side, w.y - 0.5), at(RO, side, w.y - 0.5), at(RO, side, w.y + 0.5), at(RI, side, w.y + 0.5)), PART.lime, STAGE.shaft);
    for (const y of [w.y - 0.5, w.y + 0.5]) put(quadG(at(RI, -1, y), at(RO, -1, y), at(RO, 1, y), at(RI, 1, y)), PART.lime, STAGE.shaft);
  }
  // ---- the stair: a hundred stone steps round the wall, each a sector from the well's edge into the wall
  for (let i = 1; i <= ST.steps; i++) put(sectorG(RW, RI + 0.1, angleAt(i - 1), angleAt(i), F + i * H - ST.slab, F + i * H, 2), PART.stone, STAGE.shaft);
  // its brass rail on the inner edge (open beside each landing), on posts; and the rail round the gallery's well
  const RR = RW + 0.04, gaps = T.landings.map((i) => [i - 2, i + 1]);
  let from = 0;
  for (const [g0, g1] of [...gaps, [ST.steps, ST.steps]]) {
    put(tubeG((t) => { const u = from + (g0 - from) * t, a = angleAt(u); return [RR * Math.cos(a), rampAt(u) + ST.rail, RR * Math.sin(a)]; }, 0.025, Math.ceil((g0 - from) * 1.5), 6), PART.brass, STAGE.floors);
    for (let u = from; u <= g0 + 1e-9; u += Math.max(1, Math.min(4, g0 - from))) { const a = angleAt(u); put(rodG([RR * Math.cos(a), treadAt(Math.min(u, ST.steps - 1e-6)), RR * Math.sin(a)], [RR * Math.cos(a), rampAt(u) + ST.rail, RR * Math.sin(a)], 0.014), PART.brass, STAGE.floors); }
    from = g1;
  }
  const opening = [angleAt(ST.steps), angleAt(ST.steps - T.opening)];              // the gallery's floor is not over these (unwrapped)
  const g0 = ((opening[1] % TAU) + TAU) % TAU, gArc = TAU - (opening[1] - opening[0]);
  put(ringG(RR, TOP + ST.rail, 0.025, g0, gArc, 48), PART.brass, STAGE.floors);
  for (let k = 0; k <= 12; k++) { const a = g0 + (gArc * k) / 12; put(rodG([RR * Math.cos(a), TOP, RR * Math.sin(a)], [RR * Math.cos(a), TOP + ST.rail, RR * Math.sin(a)], 0.014), PART.brass, STAGE.floors); }
  // ---- the landings: half-rounds of boards, a beam under each across the shaft, a rail along the open edge and round
  // the curved edge but at the stair's gap
  for (const l of LANDINGS) {
    const disc = new THREE.CylinderGeometry(RW, RW, 0.15, seg, 1, false, -l.th, Math.PI); disc.translate(0, l.top - 0.075, 0); put(disc, PART.boards, STAGE.floors);
    const px = -l.dir[1], pz = l.dir[0];
    put(quadG([-px * RW, l.top - 0.15, -pz * RW], [px * RW, l.top - 0.15, pz * RW], [px * RW, l.top, pz * RW], [-px * RW, l.top, -pz * RW]), PART.boards, STAGE.floors);
    put(rodG([-px * RI, l.top - 0.27, -pz * RI], [px * RI, l.top - 0.27, pz * RI], 0.09, 4), PART.timber, STAGE.floors);
    put(rodG([-px * RW, l.top + ST.rail, -pz * RW], [px * RW, l.top + ST.rail, pz * RW], 0.03, 6), PART.timber, STAGE.floors);
    for (let k = -6; k <= 6; k++) { const t = (k / 6) * (RW - 0.05); put(rodG([px * t, l.top, pz * t], [px * t, l.top + ST.rail, pz * t], 0.018, 5), PART.timber, STAGE.floors); }
    const gap = 1.5 * DT;
    for (const [a0, a1] of [[l.th + gap, l.th + Math.PI / 2], [l.th - Math.PI / 2, l.th - gap]]) {
      put(ringG(RW - 0.04, l.top + ST.rail, 0.025, a0, a1 - a0, 16), PART.timber, STAGE.floors);
      for (let k = 0; k <= 3; k++) { const a = a0 + ((a1 - a0) * k) / 3; put(rodG([(RW - 0.04) * Math.cos(a), l.top, (RW - 0.04) * Math.sin(a)], [(RW - 0.04) * Math.cos(a), l.top + ST.rail, (RW - 0.04) * Math.sin(a)], 0.018, 5), PART.timber, STAGE.floors); }
    }
  }
  // ---- the gallery's floor round the well (but over the stair's last steps), on a ring beam; the ledge outside on corbels
  put(sectorG(RW, RI + 0.1, g0, g0 + gArc, TOP - 0.15, TOP, 24), PART.boards, STAGE.floors);
  put(sectorG(RI - 0.12, RI + 0.1, g0, g0 + gArc, TOP - 0.42, TOP - 0.15, 24), PART.timber, STAGE.floors);
  put(boxG(-L.half, L.half, TOP - L.thick, TOP, RO - 0.3, L.out), PART.stone, STAGE.floors);
  for (const x of [-0.8, 0, 0.8]) { put(boxG(x - 0.13, x + 0.13, TOP - 0.75, TOP - L.thick, RO - 0.1, L.out - 0.35), PART.stone, STAGE.floors); put(boxG(x - 0.11, x + 0.11, TOP - 1.2, TOP - 0.75, RO - 0.1, RO + 0.55), PART.stone, STAGE.floors); }
  for (const sx of [-1, 1]) {
    put(rodG([sx * L.half, TOP + ST.rail, RO + 0.05], [sx * L.half, TOP + ST.rail, L.out - 0.05], 0.025), PART.brass, STAGE.floors);
    for (const z of [RO + 0.05, (RO + L.out) / 2, L.out - 0.05]) put(rodG([sx * L.half, TOP, z], [sx * L.half, TOP + ST.rail, z], 0.016), PART.brass, STAGE.floors);
  }
  // ---- the dome's brass: twelve ribs from the spring to the crown, a ring at its foot and one half way, the ledge door's
  // frame cut through it, a finial
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12 + Math.PI / 12;
    put(tubeG((t) => { const e = (t * Math.PI) / 2; return [RD * Math.cos(e) * Math.cos(a), SPRING + RD * Math.sin(e), RD * Math.cos(e) * Math.sin(a)]; }, 0.04, 24, 6), PART.brass, STAGE.ribs);
  }
  put(ringG(RD, SPRING + 0.03, 0.06, Math.PI / 2 + Math.asin(D.half / RD) + 0.02, TAU - 2 * (Math.asin(D.half / RD) + 0.02), seg), PART.brass, STAGE.ribs);
  put(ringG(RD * Math.cos(Math.PI / 4), SPRING + RD * Math.sin(Math.PI / 4), 0.03, 0, TAU, seg), PART.brass, STAGE.ribs);
  const domeZ = (x, y) => Math.sqrt(Math.max(0, RD * RD - x * x - (y - SPRING) ** 2));
  for (const sx of [-1, 1]) put(rodG([sx * D.half, SPRING, domeZ(D.half, SPRING)], [sx * D.half, TOP + L.door, domeZ(D.half, TOP + L.door)], 0.035), PART.brass, STAGE.ribs);
  put(rodG([-D.half, TOP + L.door, domeZ(D.half, TOP + L.door)], [D.half, TOP + L.door, domeZ(D.half, TOP + L.door)], 0.035), PART.brass, STAGE.ribs);
  put(rodG([0, CROWN - 0.05, 0], [0, CROWN + 0.45, 0], 0.03), PART.brass, STAGE.ribs);
  { const g = new THREE.SphereGeometry(0.11, 16, 12); g.translate(0, CROWN + 0.3, 0); put(g, PART.brass, STAGE.ribs); }

  // ---- the things. The desk on the first landing, and the lamp's brass foot
  const [desk, shelf, scope] = THINGS;
  { const top = desk.y1;
    put(boxG(desk.x0, desk.x1, top - 0.04, top, desk.z0, desk.z1), PART.timber, 4.1);
    for (const x of [desk.x0 + 0.04, desk.x1 - 0.04]) for (const z of [desk.z0 + 0.04, desk.z1 - 0.04]) put(boxG(x - 0.03, x + 0.03, desk.y0, top - 0.04, z - 0.03, z + 0.03), PART.timber, 4.1);
    put(boxG(desk.x0 + 0.04, desk.x1 - 0.04, top - 0.16, top - 0.04, desk.z0 + 0.03, desk.z0 + 0.06), PART.timber, 4.1);
    put(boxG(-0.3, -0.05, top, top + 0.012, 0.62, 0.85), PART.parchment, 4.15);                                       // a page open on it
    { const g = new THREE.CylinderGeometry(0.035, 0.06, 0.12, 12); g.translate(LAMP[0], top + 0.06, LAMP[2]); put(g, PART.brass, 4.2); } }
  // the shelf of scrolls on the second landing: its sides, back and boards; scrolls lying on them; a small globe on top
  { const s = shelf, x0 = s.x0, x1 = s.x1;
    put(boxG(x0, x0 + 0.03, s.y0, s.y1, s.z0, s.z1), PART.timber, 4.3); put(boxG(x1 - 0.03, x1, s.y0, s.y1, s.z0, s.z1), PART.timber, 4.3);
    put(boxG(x0, x1, s.y0, s.y1, s.z1 - 0.02, s.z1), PART.timber, 4.3);
    for (let k = 0; k < 5; k++) { const y = s.y0 + 0.05 + k * 0.38; put(boxG(x0 + 0.03, x1 - 0.03, y, y + 0.025, s.z0, s.z1 - 0.02), PART.timber, 4.3); }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) {
      const y = s.y0 + 0.05 + k * 0.38 + 0.025, x = x0 + 0.1 + j * 0.13, len = 0.2 + 0.06 * ((j * 7 + k * 3) % 3), r = 0.028 + 0.006 * ((j + k) % 2);
      const g = new THREE.CylinderGeometry(r, r, len, 10); g.rotateX(Math.PI / 2); g.translate(x, y + r, s.z0 + 0.02 + len / 2); put(g, PART.parchment, 4.35);
    }
    { const g = new THREE.SphereGeometry(0.1, 16, 12); g.translate((x0 + x1) / 2, s.y1 + 0.16, (s.z0 + s.z1) / 2); put(g, PART.glaze, 4.4);
      put(rodG([(x0 + x1) / 2, s.y1, (s.z0 + s.z1) / 2], [(x0 + x1) / 2, s.y1 + 0.06, (s.z0 + s.z1) / 2], 0.04), PART.brass, 4.4);
      put(ringG(0.12, s.y1 + 0.16, 0.008, 0, TAU, 24), PART.brass, 4.4); } }
  // the telescope on its tripod in the gallery, looking out and up through the glass
  { const cx = (scope.x0 + scope.x1) / 2, cz = (scope.z0 + scope.z1) / 2, top = TOP + 1.12, a = Math.atan2(cz, cx);
    for (let k = 0; k < 3; k++) { const b = a + (k * TAU) / 3; put(rodG([cx, top, cz], [cx + 0.24 * Math.cos(b), TOP, cz + 0.24 * Math.sin(b)], 0.015), PART.brass, 4.5); }
    const e = 0.6, dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a) * Math.cos(e);
    put(rodG([cx - dx * 0.45, top + 0.06 - dy * 0.45, cz - dz * 0.45], [cx + dx * 0.55, top + 0.06 + dy * 0.55, cz + dz * 0.55], 0.055, 16), PART.brass, 4.5);
    put(rodG([cx + dx * 0.5, top + 0.06 + dy * 0.5, cz + dz * 0.5], [cx + dx * 0.6, top + 0.06 + dy * 0.6, cz + dz * 0.6], 0.07, 16), PART.brass, 4.5); }
  // the armillary's fixed rings (its meridian and horizon) and the rod it hangs by
  const AC = [0, SPRING + 0.9, 0];
  put(rodG([0, CROWN - 0.05, 0], [0, AC[1] + 0.6, 0], 0.012), PART.brass, 4.7);
  { const g = new THREE.TorusGeometry(0.58, 0.014, 6, 64); g.translate(AC[0], AC[1], AC[2]); put(g, PART.brass, 4.7); }
  put(ringG(0.58, AC[1], 0.016, 0, TAU, 64), PART.brass, 4.7);

  const mesh = new THREE.Mesh(GA.geometry(), keep(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.55, side: THREE.DoubleSide })));
  geos.push(mesh.geometry);
  mesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aStage;\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart; vStage = aStage; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTex = uv; vNl = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;\n' + COMMON + INSIDE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 lo = toLocal(vW);
        // going up: a stage not begun is not there; the shaft and its stair rise course by course, the dome's ribs from their
        // spring to the crown; the rest each appear at their turn
        if (uBuild < vStage) discard;
        if (vStage < 0.5) { if (uBuild < 1.0 && lo.y > mix(0.0, ${f(F + 0.02)}, uBuild)) discard; }
        else if (vStage < 1.5) { if (uBuild < 2.0 && lo.y > mix(0.0, ${f(SPRING + 0.05)}, uBuild - 1.0)) discard; }
        else if (vStage > 2.5 && vStage < 3.5) { if (uBuild < 4.0 && lo.y > mix(${f(SPRING)}, ${f(CROWN + 0.5)}, uBuild - 3.0)) discard; }
        // the shaft's openings: its doorways and its narrow windows
        if (vPart < 0.5 && abs(vNl.y) < 0.5) {
          float r = length(lo.xz);
          if ((abs(r - ${f(RI)}) < 0.02 || abs(r - ${f(RO)}) < 0.02) && (inDoorway(lo) || inSlit(lo, r))) discard;
        }
        float rough, metal;
        diffuseColor.rgb = partColour(vPart, lo, vTex, vNl, rough, metal);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = metal;')
      .replace('#include <opaque_fragment>', `
        { vec3 lo2 = toLocal(vW);
          if (inRoom(lo2, -0.03)) outgoingLight = litInside(diffuseColor.rgb, lo2, vW, normalize(inverseTransformDirection(normal, viewMatrix))); }
        #include <opaque_fragment>`);
  };
  mesh.material.customProgramCacheKey = () => 'tower-body';
  group.add(mesh);

  // ---- the dome's glass (but its door), clear
  const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xe4f0f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }));
  const domeG = (() => {
    const s = new THREE.SphereGeometry(RD - 0.01, seg, Math.round(seg / 4), 0, TAU, 0, Math.PI / 2).toNonIndexed(), p = s.attributes.position, keepIdx = [];
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 + SPRING, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      if (!(cz > 0 && Math.abs(cx) < D.half && cy < TOP + L.door)) keepIdx.push(i, i + 1, i + 2);
    }
    const P = [], N = [];
    for (const i of keepIdx) { P.push(p.getX(i), p.getY(i) + SPRING, p.getZ(i)); N.push(s.attributes.normal.getX(i), s.attributes.normal.getY(i), s.attributes.normal.getZ(i)); }
    s.dispose();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g;
  })();
  geos.push(domeG);
  const dome = new THREE.Mesh(domeG, glassMat); group.add(dome);

  // ---- the door: planks in an arched leaf, hinged at its left as you come in, swinging into the shaft
  const doorMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.2, 0.12), roughness: 0.78, metalness: 0, envMapIntensity: 0.5 }));
  const hinge = new THREE.Group(); hinge.position.set(-D.half + 0.015, 0, DOOR_Z0 + 0.06);
  { const w = 2 * D.half - 0.03, outline = [[0, F], [w, F], [w, D.spring]];
    for (let k = 1; k < 16; k++) { const a = (k / 16) * Math.PI; outline.push([w / 2 + (w / 2) * Math.cos(a), D.spring + (D.half - 0.008) * Math.sin(a)]); }
    outline.push([0, D.spring]);
    const g = slabG(outline, [], -0.03, 0.03); geos.push(g); hinge.add(new THREE.Mesh(g, doorMat)); }
  group.add(hinge);

  // ---- the lamp's flame: a small plasma held in a glass globe on the desk, and its glow
  const tex = glowTexture();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), glassMat); globe.position.set(LAMP[0], LAMP[1], LAMP[2]); geos.push(globe.geometry);
  const flameMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.85, 1.0) }));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), flameMat); flame.position.copy(globe.position); geos.push(flame.geometry);
  const glowMat = keep(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.55, 0.42, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const glow = new THREE.Sprite(glowMat); glow.position.copy(globe.position); glow.scale.setScalar(0.6);
  group.add(globe, flame, glow);
  const fireAt = new THREE.Vector3(LAMP[0], LAMP[1], LAMP[2]), fireCol = new THREE.Color(0.75, 0.62, 1.0);

  // ---- the armillary's turning rings: the equator and the ecliptic, two colures and the poles' axis, round a small earth;
  // the axis tilted to the island's latitude, turning once in two minutes
  const brassMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.78, 0.6, 0.3), roughness: 0.3, metalness: 1, envMapIntensity: 0.9 }));
  const arm = new THREE.Group(); arm.position.set(AC[0], AC[1], AC[2]); arm.rotation.z = (58.5 * Math.PI) / 180;      // the pole 31.5 degrees up
  const spin = new THREE.Group(); arm.add(spin);
  const ring = (r, rx = 0, ry = 0, rz = 0) => { const g = new THREE.TorusGeometry(r, 0.011, 6, 64); geos.push(g); const m = new THREE.Mesh(g, brassMat); m.rotation.set(rx, ry, rz); spin.add(m); return m; };
  ring(0.5, Math.PI / 2); ring(0.5, Math.PI / 2 + (23.44 * Math.PI) / 180); ring(0.47); ring(0.47, 0, Math.PI / 2);
  { const g = new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6); geos.push(g); spin.add(new THREE.Mesh(g, brassMat)); }
  { const g = new THREE.SphereGeometry(0.08, 20, 14); geos.push(g); spin.add(new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.48, 0.45), roughness: 0.25 })))); }
  group.add(arm);

  // ---- its foundations, where it stands raised on uneven ground (the island): the plinth carried down 1.6 m
  const foundG = new THREE.CylinderGeometry(T.plinth + 0.05, T.plinth + 0.05, 1.6, seg); foundG.translate(0, -0.8, 0); geos.push(foundG);
  const found = new THREE.Mesh(foundG, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.38, 0.34), roughness: 0.95 })));
  found.visible = false; group.add(found);

  let doorOpen = 0;
  return {
    group, flameAt: fireAt, fireCol,
    update(b, { t = 0, dt = 0, sun = [0, 1, 0], sunCol = new THREE.Color(1, 1, 1), sky = new THREE.Color(0.2, 0.2, 0.25), near = false, night = 0 } = {}) {
      group.position.set(b.x, b.y || 0, b.z); group.rotation.y = b.yaw;
      const ph = phase(b);
      U.uCentre.value.set(b.x, b.z); U.uYaw.value = b.yaw; U.uTime.value = t; U.uBase.value = b.y || 0;
      const build = ph.rest > 0 ? 4 + ph.rest : ph.dome > 0 ? 3 + ph.dome : ph.floors > 0 ? 2 + ph.floors : ph.walls > 0 ? 1 + ph.walls : ph.base;
      U.uBuild.value = build;
      U.uOpen.value = 1 - ph.floors;
      U.uSunDir.value.set(sun[0], sun[1], sun[2]); U.uSunCol.value.copy(sunCol); U.uSky.value.copy(sky);
      U.uFire.value.copy(fireAt).applyMatrix4(group.matrixWorld.compose(group.position, group.quaternion, group.scale));
      const lit = build >= 4.2;
      U.uFireCol.value.copy(fireCol).multiplyScalar(lit ? 0.7 * ph.rest : 0);
      doorOpen += ((near ? 1 : 0) - doorOpen) * (1 - Math.exp(-5 * dt));
      hinge.rotation.y = 1.5 * doorOpen;
      U.uDoor.value = 0.25 + 0.75 * doorOpen;
      hinge.visible = build >= 4.05;
      dome.visible = build >= 3.6;
      globe.visible = flame.visible = glow.visible = lit;
      glowMat.opacity = (0.55 + 0.25 * Math.sin(t * 2.3) * Math.sin(t * 1.3)) * ph.rest;
      arm.visible = build >= 4.7;
      spin.rotation.y = (t / 120) * TAU;
      found.visible = (b.y || 0) > 0.01 && ph.base > 0.2;
      glassMat.emissive.setRGB(0.55, 0.45, 0.9).multiplyScalar(0.08 * night * ph.rest); glassMat.opacity = 0.14 + 0.08 * night;
      return { flame: lit ? ph.rest : 0, door: doorOpen };
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose(); },
  };
}
