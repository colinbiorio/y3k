// buildings/house.js — THE HOUSE, DRAWN (three.js), from ../house.js's numbers:
// stone piers and two stone steps; a timber frame (posts, plates, the porch's
// posts, rafters under the thatch); walls of woven reed under lime plaster,
// the timber standing proud of them; a steep thatched roof, its ridge a line of
// dark glass solar tiles; a covered porch; one round window; inside, the room
// open to the roof, the loft over its back with its ladder, a table and two
// stools, a bed with a woven blanket up in the loft, and a small ceramic stove
// with a ring of light, its flue rising through the thatch.
//
// Everything but the glass, the light ring and the door leaf is one mesh of one
// material, each part saying what it is made of (aPart) and when it goes up
// (aStage: the piers, the frame, the walls, the roof, then the things). Outside
// it is lit as everything in the void is; inside (in the room's air) by what
// gets in: the sun through the round window or the doorway and out under the
// porch (as ../house.js's sunLocal), the sky by how near the openings a surface
// is, and the stove's ring at night. The porch's floor and walls lie in its
// ceiling's shade when the sun is high.
import * as THREE from 'three';
import { HOUSE as H, roofIn, roofOut, TAN, RISE, RAIL, phase } from '../house.js';
import { gatherer, boxG, slabG, circle, rect, quadG } from './parts.js';

const PART = { plaster: 0, timber: 1, thatch: 2, stone: 3, solar: 4, planks: 5, ceramic: 6, linen: 7, blanket: 8, under: 9 };
const STAGE = { piers: 0, frame: 1, walls: 2, roof: 3 };
const IN = H.half - H.wall, Z0 = H.back + H.wall, Z1 = H.porch - H.wall;

// GLSL: the house's frame, noise, what each part looks like
const COMMON = `
  uniform vec2 uCentre; uniform float uYaw; uniform float uBuild;
  uniform float uBase;
  vec3 toLocal(vec3 w) { vec2 d = w.xz - uCentre; float c = cos(uYaw), s = sin(uYaw); return vec3(c * d.x - s * d.y, w.y - uBase, s * d.x + c * d.y); }
  vec3 dirLocal(vec3 v) { float c = cos(uYaw), s = sin(uYaw); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }
  float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y); }
  float roofIn(float ax) { return ${H.top.toFixed(3)} + (${H.plate.toFixed(3)} - ax) * ${TAN.toFixed(5)}; }
  bool inRoom(vec3 l, float m) {
    if (abs(l.x) > ${IN.toFixed(3)} - m || l.z < ${Z0.toFixed(3)} + m || l.z > ${Z1.toFixed(3)} - m || l.y < ${H.floor.toFixed(3)} + m || l.y > roofIn(abs(l.x)) - m) return false;
    return !(l.z < ${H.loft.z.toFixed(3)} + m && l.y > ${H.loft.under.toFixed(3)} - m && l.y < ${H.loft.top.toFixed(3)} + m);
  }
  vec3 partColour(float part, vec3 l, vec2 uv, vec3 nl, out float rough) {
    rough = 0.9;
    float g = n2(uv * vec2(3.0, 40.0)), f = n2(l.xz * 17.0 + l.y * 13.0);
    if (part < 0.5) {               // lime plaster over woven reed: the weave showing through as a shade, the lime mottled, splashed low
      vec2 w2 = abs(nl.x) > 0.5 ? l.zy : l.xy, q = w2 / vec2(0.16, 0.11);
      float weave = 0.5 + 0.5 * sin(q.x * 6.2832) * sin(q.y * 6.2832 + 1.57 * mod(floor(q.x), 2.0));
      float mott = 0.6 * n2(w2 * 2.3) + 0.4 * n2(w2 * 9.0);
      vec3 c = mix(vec3(0.80, 0.76, 0.67), vec3(0.88, 0.86, 0.80), mott) * (0.93 + 0.1 * weave);
      return c * mix(0.7, 1.0, smoothstep(${H.floor.toFixed(2)}, ${(H.floor + 0.7).toFixed(2)}, l.y + 0.15 * n2(w2 * 4.0)));
    }
    if (part < 1.5) { rough = 0.75; return vec3(0.33, 0.22, 0.14) * (0.75 + 0.3 * g + 0.1 * h1(floor(uv * 2.0))); }       // timber
    if (part < 2.5) {               // thatch: straw laid down the slope, its stems catching the light, the courses only a soft ripple;
                                    // weathered grey toward the eaves and in streaks where the rain runs
      float down = (roofIn(0.0) + ${RISE.toFixed(3)} - l.y) / ${Math.sin((H.pitch * Math.PI) / 180).toFixed(4)};
      float wob = 0.06 * n2(vec2(l.z * 2.0, down * 0.7));
      float course = fract((down + wob) / 0.42);
      float stem = n2(vec2(l.z * 90.0, down * 2.2)) * 0.5 + n2(vec2(l.z * 230.0 + 7.0, down * 4.0)) * 0.3 + n2(vec2(l.z * 31.0, down * 1.2)) * 0.2;
      float streak = n2(vec2(l.z * 3.5, 0.3));
      vec3 c = mix(vec3(0.74, 0.60, 0.36), vec3(0.47, 0.41, 0.33), clamp(smoothstep(1.5, 5.0, down) * 0.65 + 0.35 * streak * smoothstep(1.0, 4.0, down), 0.0, 1.0));
      return c * (0.62 + 0.55 * stem) * (1.0 - 0.13 * smoothstep(0.6, 1.0, course));
    }
    if (part < 3.5) { return vec3(0.52, 0.5, 0.46) * (0.75 + 0.35 * f) * (1.0 - 0.3 * smoothstep(0.06, 0.0, abs(fract(l.y / 0.19) - 0.5) - 0.44)); }   // stone
    if (part < 4.5) {               // dark glass solar tiles
      rough = 0.18;
      vec2 cq = fract(vec2(l.z / 0.3, uv.y / 0.17)); float grid = smoothstep(0.0, 0.07, min(min(cq.x, 1.0 - cq.x), min(cq.y, 1.0 - cq.y)));
      return mix(vec3(0.2, 0.2, 0.2), vec3(0.015, 0.025, 0.05), grid);
    }
    if (part < 5.5) { rough = 0.7; float pl = floor(l.x / 0.16); return vec3(0.55, 0.40, 0.26) * (0.82 + 0.2 * h1(vec2(pl, 3.0)) + 0.1 * n2(vec2(pl * 7.0, l.z * 9.0))) * (1.0 - 0.4 * smoothstep(0.012, 0.0, abs(fract(l.x / 0.16) - 0.5) - 0.488)); }   // planks
    if (part < 6.5) { rough = 0.25; return vec3(0.21, 0.42, 0.42) * (0.85 + 0.25 * f) * (1.0 - 0.25 * smoothstep(0.02, 0.0, abs(n2(l.xz * 30.0 + l.y * 20.0) - 0.5))); }   // ceramic
    if (part < 7.5) { return vec3(0.84, 0.81, 0.73) * (0.92 + 0.1 * f); }                                                   // linen
    if (part < 8.5) {               // the blanket: stripes woven in madder, indigo and the plain wool
      float s = fract(l.x * 2.2); vec3 c = s < 0.25 ? vec3(0.55, 0.14, 0.1) : s < 0.38 ? vec3(0.8, 0.74, 0.62) : s < 0.62 ? vec3(0.13, 0.17, 0.35) : s < 0.75 ? vec3(0.8, 0.74, 0.62) : vec3(0.55, 0.14, 0.1);
      return c * (0.8 + 0.25 * step(0.5, fract(l.z * 40.0 + 0.5 * floor(l.x * 60.0))));
    }
    return vec3(0.5, 0.4, 0.27) * (0.6 + 0.4 * n2(vec2(l.z * 40.0, l.y * 4.0)));                                            // the thatch's underside
  }
`;
const INSIDE = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uFire; uniform vec3 uFireCol; uniform float uDoor; uniform float uOpen;
  float sunLocal(vec3 l, vec3 d) {
    if (d.y <= 0.0) return 0.0;
    float tx = d.x > 1e-5 ? (${IN.toFixed(3)} - l.x) / d.x : d.x < -1e-5 ? (-${IN.toFixed(3)} - l.x) / d.x : 1e4;
    float tz = d.z > 1e-5 ? (${Z1.toFixed(3)} - l.z) / d.z : d.z < -1e-5 ? (${Z0.toFixed(3)} - l.z) / d.z : 1e4;
    float tr = 1e4;
    for (int k = 0; k < 2; k++) {
      float sg = k == 0 ? 1.0 : -1.0, den = d.y + ${TAN.toFixed(5)} * sg * d.x;
      float t = den > 1e-5 ? (${(H.top + H.plate * TAN).toFixed(5)} - l.y - ${TAN.toFixed(5)} * sg * l.x) / den : 1e4;
      if (t > 0.0 && t < tr && sg * (l.x + d.x * t) >= -1e-4) tr = t;
    }
    float t = min(tx, min(tz, tr));
    // the loft's floor in the way
    float ty = d.y > 1e-5 ? (${H.loft.under.toFixed(3)} - l.y) / d.y : 1e4;
    if (ty > 0.0 && ty < t) { vec3 q = l + d * ty; if (q.z < ${H.loft.z.toFixed(3)} && abs(q.x) < ${IN.toFixed(3)}) return 0.0; }
    vec3 e = l + d * t;
    if (t == tx && d.x > 0.0) return length(vec2(e.z - ${H.window.z.toFixed(3)}, e.y - ${H.window.y.toFixed(3)})) < ${H.window.r.toFixed(3)} ? 1.0 : 0.0;
    if (t == tz && d.z > 0.0 && abs(e.x) < ${H.door.half.toFixed(3)} && e.y < ${H.door.high.toFixed(3)}) {
      float pz = (${H.front.toFixed(3)} - e.z) / d.z, px = abs(d.x) > 1e-5 ? (sign(d.x) * ${H.half.toFixed(3)} - e.x) / d.x : 1e4, py = (${H.top.toFixed(3)} - e.y) / d.y;
      return py < min(pz, px) ? 0.0 : uDoor;
    }
    return 0.0;
  }
  vec3 litInside(vec3 albedo, vec3 l, vec3 w, vec3 nw) {
    vec3 nl = dirLocal(nw), dl = dirLocal(uSunDir);
    vec3 col = uSunCol * mix(sunLocal(l + nl * 0.02, dl), 1.0, uOpen) * max(dot(nl, dl), 0.0);
    // the sky, by how near the openings a surface is: the doorway, the window
    float open = 0.18 + 0.75 * exp(-dot(l.xz - vec2(0.0, ${Z1.toFixed(2)}), l.xz - vec2(0.0, ${Z1.toFixed(2)})) / 3.0) * (0.6 + 0.4 * max(nl.z, 0.0))
               + 0.45 * exp(-(pow(l.x - ${IN.toFixed(2)}, 2.0) + pow(l.z - ${H.window.z.toFixed(2)}, 2.0) + pow(l.y - ${H.window.y.toFixed(2)}, 2.0)) / 1.8) * (0.6 + 0.4 * max(-nl.x, 0.0));
    col += uSky * mix(open, 1.0, uOpen);
    vec3 L = uFire - w; float dd = length(L);
    col += uFireCol * max(dot(nw, L / dd) * 0.8 + 0.2, 0.0) / (1.0 + dd * dd / 1.2);
    return albedo * col;
  }
  // the porch's ceiling between a point under it and the sun
  float porchShade(vec3 l, vec3 dl) {
    if (l.z < ${H.porch.toFixed(3)} - 0.25 || l.z > ${H.front.toFixed(3)} + 0.3 || l.y > ${H.top.toFixed(3)} || dl.y <= 0.0) return 1.0;
    vec3 q = l + dl * ((${H.top.toFixed(3)} - l.y) / dl.y);
    return (abs(q.x) < ${H.eave.toFixed(3)} && q.z < ${H.end.toFixed(3)}) ? 0.0 : 1.0;
  }
`;

export function createHouseArt({ lite = false } = {}) {
  const group = new THREE.Group(), G = gatherer(), put = G.put, mats = [], geos = [];
  const keep = (m) => { mats.push(m); return m; };
  const U = {
    uCentre: { value: new THREE.Vector2() }, uYaw: { value: 0 }, uBuild: { value: 0 }, uTime: { value: 0 }, uBase: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uFire: { value: new THREE.Vector3() }, uFireCol: { value: new THREE.Color() }, uDoor: { value: 0.4 }, uOpen: { value: 1 },
  };

  // ---- the piers and the steps (stone)
  for (const x of [-2.7, -0.9, 0.9, 2.7]) for (const z of [-4.2, -2.1, 0, 2.1, 4.2]) put(boxG(x - 0.21, x + 0.21, 0, 0.4, z - 0.21, z + 0.21), PART.stone, STAGE.piers);
  put(boxG(-H.half, H.half, 0, 0.34, H.front, 4.8), PART.stone, STAGE.piers);
  put(boxG(-H.half, H.half, 0, 0.17, 4.8, 5.1), PART.stone, STAGE.piers);
  // ---- the frame: the deck on its beams, the posts and the plates, the porch's, the loft's floor and its rails, the rafters
  put(boxG(-H.half, H.half, 0.4, H.floor - 0.02, H.back, H.front), PART.timber, STAGE.frame);
  put(boxG(-H.half, H.half, H.floor - 0.02, H.floor, H.back, H.front), PART.planks, STAGE.frame);
  const posts = [];
  for (const sx of [-1, 1]) {
    for (const z of [H.back + 0.1, -2.5, -0.6, 1.2, H.porch - 0.1]) posts.push([sx * (H.half - 0.1), z]);
    put(boxG(sx > 0 ? IN - 0.02 : -H.half - 0.02, sx > 0 ? H.half + 0.02 : -IN + 0.02, H.top - 0.02, H.top + 0.16, H.back, H.porch), PART.timber, STAGE.frame);   // the plate
  }
  for (const [x, z] of posts) put(boxG(x - 0.12, x + 0.12, H.floor, H.top, z - 0.12, z + 0.12), PART.timber, STAGE.frame);
  for (const sx of [-1, 1]) put(boxG(sx * 2.88 - 0.1, sx * 2.88 + 0.1, H.floor, H.top, 4.28, 4.48), PART.timber, STAGE.frame);                    // the porch's posts
  put(boxG(-H.half, H.half, H.top - 0.18, H.top, 4.3, 4.5), PART.timber, STAGE.frame);                                                         // its beam
  put(boxG(-IN, IN, H.loft.under, H.loft.top - 0.03, Z0, H.loft.z), PART.timber, STAGE.frame);
  put(boxG(-IN, IN, H.loft.top - 0.03, H.loft.top, Z0, H.loft.z), PART.planks, STAGE.frame);
  for (const [x0, x1] of [[-RAIL, -1.4], [-0.6, RAIL]]) {
    put(boxG(x0, x1, H.loft.top + 0.8, H.loft.top + 0.86, H.loft.z - 0.07, H.loft.z), PART.timber, STAGE.frame);
    for (let x = x0 + 0.03; x <= x1 - 0.02; x += 0.55) put(boxG(x - 0.03, x + 0.03, H.loft.top, H.loft.top + 0.8, H.loft.z - 0.06, H.loft.z - 0.01), PART.timber, STAGE.frame);
  }
  // rafters, a hand under the thatch, and the ridge beam
  const sinP = Math.sin((H.pitch * Math.PI) / 180), cosP = Math.cos((H.pitch * Math.PI) / 180);
  for (let z = H.back + 0.25; z <= H.porch - 0.2; z += 0.9) for (const sx of [-1, 1]) {
    const len = (H.plate + 0.05) / cosP, r = boxG(-len / 2, len / 2, -0.07, 0.07, z - 0.05, z + 0.05);
    r.rotateZ(-sx * (H.pitch * Math.PI) / 180); r.translate(sx * (H.plate + 0.05) / 2, (H.top + roofIn(0)) / 2 - 0.08, 0);
    put(r, PART.timber, STAGE.frame);
  }
  put(boxG(-0.08, 0.08, roofIn(0) - 0.22, roofIn(0) - 0.02, H.back, H.front), PART.timber, STAGE.frame);

  // ---- the walls: lime plaster over reed. The back gable; the side walls (the right with the round window); the room's
  // front wall with its doorway, up to the roof; the gable over the porch
  const gable = [[-H.half, H.floor], [H.half, H.floor], [H.half, H.top], [0, roofIn(0) + 0.15], [-H.half, H.top]];
  put(slabG(gable, [], H.back, Z0), PART.plaster, STAGE.walls);
  put(slabG(gable, [rect(-H.door.half, H.floor, H.door.half, H.door.high)], Z1, H.porch), PART.plaster, STAGE.walls);
  put(slabG([[-H.half, H.top], [H.half, H.top], [0, roofIn(0) + 0.15]], [], H.front - 0.12, H.front - 0.02), PART.plaster, STAGE.walls);
  // the gables' timber, standing proud of the plaster: a tie beam, a king post, two struts (front and back)
  for (const [z0, z1] of [[H.front - 0.02, H.front + 0.03], [H.back - 0.05, H.back]]) {
    const yk = roofIn(0) - 0.05;
    put(boxG(-0.08, 0.08, H.top, yk, z0, z1), PART.timber, STAGE.walls);
    for (const sx of [-1, 1]) {
      const ax = 1.55, ay = roofIn(ax) - 0.05, len = Math.hypot(ax, ay - (H.top + 0.6)), st = boxG(-len / 2, len / 2, -0.065, 0.065, z0, z1);
      st.rotateZ(Math.atan2(ay - (H.top + 0.6), sx * ax)); st.translate((sx * ax) / 2, (ay + H.top + 0.6) / 2, 0);
      put(st, PART.timber, STAGE.walls);
    }
  }
  // a side wall is drawn in the plane of the house's z and y and laid along the house: drawn extruded over −x1..−x0,
  // then turned a quarter about the upright (x' = −z, z' = x), so it stands over x0..x1
  const WT = H.top + 0.16;                 // the walls rise into the thatch, so no light shows between them and the roof
  const side = (x0, x1, holes) => { const g = slabG([[H.back, H.floor], [H.porch, H.floor], [H.porch, WT], [H.back, WT]], holes, -x1, -x0); g.rotateY(-Math.PI / 2); return g; };
  put(side(-H.half, -IN, []), PART.plaster, STAGE.walls);
  put(side(IN, H.half, [circle(H.window.z, H.window.y, H.window.r)]), PART.plaster, STAGE.walls);

  // ---- the roof: two slabs of thatch from the eaves to the ridge, end to end; under them the thatch's underside; the
  // porch's ceiling; the ridge of solar glass
  for (const sx of [-1, 1]) {
    const o = (ax, y) => [sx * ax, y];
    const eaveTop = o(H.eave, roofOut(H.eave)), ridgeTop = o(0, roofOut(0)), eaveIn = o(H.eave, roofIn(H.eave)), ridgeIn = o(0, roofIn(0));
    const at = ([x, y], z) => [x, y, z];
    const top = sx > 0 ? quadG(at(eaveTop, H.end), at(eaveTop, -H.end), at(ridgeTop, -H.end), at(ridgeTop, H.end), [[0, 0], [9.9, 0], [9.9, 5], [0, 5]])
      : quadG(at(eaveTop, -H.end), at(eaveTop, H.end), at(ridgeTop, H.end), at(ridgeTop, -H.end), [[0, 0], [9.9, 0], [9.9, 5], [0, 5]]);
    put(top, PART.thatch, STAGE.roof);
    const under = sx > 0 ? quadG(at(eaveIn, -H.end), at(eaveIn, H.end), at(ridgeIn, H.end), at(ridgeIn, -H.end)) : quadG(at(eaveIn, H.end), at(eaveIn, -H.end), at(ridgeIn, -H.end), at(ridgeIn, H.end));
    put(under, PART.under, STAGE.roof);
    // the eave's cut edge, and each end's edge
    put(sx > 0 ? quadG(at(eaveIn, H.end), at(eaveIn, -H.end), at(eaveTop, -H.end), at(eaveTop, H.end)) : quadG(at(eaveIn, -H.end), at(eaveIn, H.end), at(eaveTop, H.end), at(eaveTop, -H.end)), PART.thatch, STAGE.roof);
    for (const ez of [-1, 1]) {
      const z = ez * H.end, f = sx * ez > 0;
      put(f ? quadG(at(eaveIn, z), at(eaveTop, z), at(ridgeTop, z), at(ridgeIn, z)) : quadG(at(eaveTop, z), at(eaveIn, z), at(ridgeIn, z), at(ridgeTop, z)), PART.thatch, STAGE.roof);
    }
    // the solar ridge: a strip of glass tiles laid along the top of each slope
    const w = 0.42, lift = 0.015, a = o(0, roofOut(0) + lift), bpt = o(w * cosP, roofOut(w * cosP) + lift);
    put(sx > 0 ? quadG(at(bpt, H.end), at(bpt, -H.end), at(a, -H.end), at(a, H.end), [[0, 0], [9.9, 0], [9.9, w], [0, w]]) : quadG(at(bpt, -H.end), at(bpt, H.end), at(a, H.end), at(a, -H.end), [[0, 0], [9.9, 0], [9.9, w], [0, w]]), PART.solar, 4.2);
  }
  put(boxG(-0.05, 0.05, roofOut(0) - 0.02, roofOut(0) + 0.06, -H.end, H.end), PART.timber, 4.2);         // the ridge's cap
  put(boxG(-H.half, H.half, H.top, H.top + 0.1, H.porch, H.front), PART.planks, STAGE.roof);               // the porch's ceiling

  // ---- the things, each going in at its turn: the ladder, the table and stools, the bed, the stove and its flue
  { const L = H.ladder, z = L.z - 0.04;
    for (const x of [L.x - L.half + 0.04, L.x + L.half - 0.04]) put(boxG(x - 0.035, x + 0.035, H.floor, H.loft.top, z - 0.04, z + 0.04), PART.timber, 4.1);
    for (let y = H.floor + 0.3; y < H.loft.top - 0.1; y += 0.3) put(boxG(L.x - L.half + 0.04, L.x + L.half - 0.04, y - 0.022, y + 0.022, z - 0.022, z + 0.022), PART.timber, 4.1); }
  put(boxG(1.0, 1.8, H.floor + 0.71, H.floor + 0.76, -0.3, 1.1), PART.timber, 4.3);
  for (const [x, z] of [[1.07, -0.23], [1.73, -0.23], [1.07, 1.03], [1.73, 1.03]]) put(boxG(x - 0.035, x + 0.035, H.floor, H.floor + 0.71, z - 0.035, z + 0.035), PART.timber, 4.3);
  for (const zc of [1.43, -0.63]) {
    put(boxG(1.22, 1.58, H.floor + 0.41, H.floor + 0.45, zc - 0.18, zc + 0.18), PART.timber, 4.35);
    for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) put(boxG(1.4 + dx - 0.025, 1.4 + dx + 0.025, H.floor, H.floor + 0.41, zc + dz - 0.025, zc + dz + 0.025), PART.timber, 4.35);
  }
  { const y = H.loft.top;
    put(boxG(0.2, 1.2, y + 0.12, y + 0.28, -4.2, -2.2), PART.timber, 4.5);                                   // the bed's frame
    for (const [x, z] of [[0.24, -4.16], [1.16, -4.16], [0.24, -2.24], [1.16, -2.24]]) put(boxG(x - 0.04, x + 0.04, y, y + 0.12, z - 0.04, z + 0.04), PART.timber, 4.5);
    put(boxG(0.24, 1.16, y + 0.28, y + 0.42, -4.16, -2.24), PART.linen, 4.55);                               // the mattress
    put(boxG(0.22, 1.18, y + 0.42, y + 0.46, -3.6, -2.22), PART.blanket, 4.6);                               // the blanket
    put(boxG(0.36, 1.04, y + 0.42, y + 0.53, -4.12, -3.72), PART.linen, 4.6); }                              // the pillow
  { const S = H.stove, prof = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(0.06 + 0.27 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) ** 0.6 * (t < 0.92 ? 1 : 0.6), t * 0.95)); }
    prof.push(new THREE.Vector2(0.001, 0.95));
    const body = new THREE.LatheGeometry(prof, 32); body.translate(S.x, H.floor, S.z); put(body, PART.ceramic, 4.7);
    const flueTop = roofOut(Math.abs(S.x)) + 0.35, flue = new THREE.CylinderGeometry(0.075, 0.075, flueTop - (H.floor + 0.95), 16, 1, true);
    flue.translate(S.x, (flueTop + H.floor + 0.95) / 2, S.z); put(flue, PART.ceramic, 4.7);
    const cap = new THREE.CylinderGeometry(0.13, 0.1, 0.12, 16); cap.translate(S.x, flueTop + 0.06, S.z); put(cap, PART.ceramic, 4.7); }

  const mesh = new THREE.Mesh(G.geometry(), keep(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.55, side: THREE.DoubleSide })));
  geos.push(mesh.geometry);
  mesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aStage;\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart; vStage = aStage; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTex = uv; vNl = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;\nvarying float vStage;\nvarying vec3 vW;\nvarying vec2 vTex;\nvarying vec3 vNl;\n' + COMMON + INSIDE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 lo = toLocal(vW);
        // going up: a stage not begun is not there; the one under way rises from its foot
        if (uBuild < vStage) discard;
        if (vStage < 3.5 && uBuild < vStage + 1.0) {
          float k = uBuild - vStage, base = vStage < 0.5 ? 0.0 : vStage < 1.5 ? 0.0 : vStage < 2.5 ? ${H.floor.toFixed(2)} : 2.2, crest = vStage < 0.5 ? 0.5 : ${(roofOut(0) + 0.2).toFixed(2)};
          if (lo.y > mix(base, crest, k)) discard;
        }
        float rough;
        diffuseColor.rgb = partColour(vPart, lo, vTex, vNl, rough);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float sh = porchShade(toLocal(vW), dirLocal(uSunDir)); reflectedLight.directDiffuse *= sh; reflectedLight.directSpecular *= sh; }`)
      .replace('#include <opaque_fragment>', `
        { vec3 lo2 = toLocal(vW);
          if (inRoom(lo2, -0.03)) outgoingLight = litInside(diffuseColor.rgb, lo2, vW, normalize(inverseTransformDirection(normal, viewMatrix))); }
        #include <opaque_fragment>`);
  };
  mesh.material.customProgramCacheKey = () => 'house-body';
  group.add(mesh);

  // ---- the door: planks in a frame, hinged at its left as you come in, swinging into the room
  const doorMat = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.30, 0.19, 0.11), roughness: 0.78, metalness: 0, envMapIntensity: 0.5 }));
  const hinge = new THREE.Group(); hinge.position.set(-H.door.half + 0.03, 0, Z1 + 0.05);
  const leafG = new THREE.BoxGeometry(2 * H.door.half - 0.06, H.door.high - H.floor - 0.02, 0.05); leafG.translate(H.door.half - 0.03, (H.door.high + H.floor) / 2, 0); geos.push(leafG);
  hinge.add(new THREE.Mesh(leafG, doorMat));
  group.add(hinge);
  // ---- the round window: a timber ring and clear glass
  const ringG = new THREE.TorusGeometry(H.window.r, 0.05, 10, 48); ringG.rotateY(Math.PI / 2); ringG.translate(H.half + 0.01, H.window.y, H.window.z); geos.push(ringG);
  const winRing = new THREE.Mesh(ringG, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.2, 0.12), roughness: 0.7 })));
  const glassG = new THREE.CircleGeometry(H.window.r, 48); glassG.rotateY(Math.PI / 2); glassG.translate(H.half - 0.1, H.window.y, H.window.z); geos.push(glassG);
  const glass = new THREE.Mesh(glassG, keep(new THREE.MeshPhysicalMaterial({ color: 0xe4f0f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false })));
  group.add(winRing, glass);
  // ---- the stove's ring of light
  const ringLightG = new THREE.TorusGeometry(0.25, 0.022, 10, 48); ringLightG.rotateX(Math.PI / 2); ringLightG.translate(H.stove.x, H.stove.ring - 0.1, H.stove.z); geos.push(ringLightG);
  const lightMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.55) }));
  const ringLight = new THREE.Mesh(ringLightG, lightMat);
  group.add(ringLight);
  const fireAt = new THREE.Vector3(H.stove.x, H.stove.ring, H.stove.z);
  const fireCol = new THREE.Color(1.0, 0.78, 0.5);

  // ---- its foundations, where it stands raised on uneven ground (the island): the piers and the steps carried down 1.6 m
  const foundG = (() => { const parts = [];
    for (const x of [-2.7, -0.9, 0.9, 2.7]) for (const z of [-4.2, -2.1, 0, 2.1, 4.2]) parts.push(boxG(x - 0.21, x + 0.21, -1.6, 0, z - 0.21, z + 0.21));
    parts.push(boxG(-H.half, H.half, -1.6, 0, H.front, 5.1));
    const g = new THREE.BufferGeometry(), P = [], N = [];
    for (const q of parts) { const n = q.toNonIndexed(); n.computeVertexNormals(); P.push(...n.attributes.position.array); N.push(...n.attributes.normal.array); n.dispose(); q.dispose(); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g; })();
  geos.push(foundG);
  const found = new THREE.Mesh(foundG, keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.38, 0.34), roughness: 0.95 })));
  found.visible = false; group.add(found);

  let doorOpen = 0;
  return {
    group, flameAt: fireAt, fireCol,
    update(b, { t = 0, dt = 0, sun = [0, 1, 0], sunCol = new THREE.Color(1, 1, 1), sky = new THREE.Color(0.2, 0.2, 0.25), near = false, night = 0 } = {}) {
      group.position.set(b.x, b.y || 0, b.z); group.rotation.y = b.yaw;
      const ph = phase(b);
      U.uCentre.value.set(b.x, b.z); U.uYaw.value = b.yaw; U.uTime.value = t; U.uBase.value = b.y || 0;
      U.uBuild.value = ph.rest > 0 ? 4 + ph.rest : ph.roof > 0 ? 3 + ph.roof : ph.walls > 0 ? 2 + ph.walls : ph.frame > 0 ? 1 + ph.frame : ph.piers;
      U.uOpen.value = 1 - ph.roof;
      U.uSunDir.value.set(sun[0], sun[1], sun[2]); U.uSunCol.value.copy(sunCol); U.uSky.value.copy(sky);
      U.uFire.value.copy(fireAt).applyMatrix4(group.matrixWorld.compose(group.position, group.quaternion, group.scale));
      U.uFireCol.value.copy(fireCol).multiplyScalar(0.55 * ph.rest);
      doorOpen += ((near ? 1 : 0) - doorOpen) * (1 - Math.exp(-5 * dt));
      hinge.rotation.y = 1.5 * doorOpen;                                         // into the room
      U.uDoor.value = 0.25 + 0.75 * doorOpen;
      const shown = (at) => U.uBuild.value >= at;
      hinge.visible = shown(4.05); winRing.visible = glass.visible = shown(4.15); ringLight.visible = shown(4.7);
      found.visible = (b.y || 0) > 0.01 && ph.piers > 0.2;
      lightMat.color.setRGB(1.0, 0.82, 0.55).multiplyScalar(0.6 + 0.4 * ph.rest);
      // after dark the round window shows the stove's light from outside
      glass.material.emissive.setRGB(1.0, 0.7, 0.4).multiplyScalar(0.55 * night * ph.rest); glass.material.opacity = 0.16 + 0.5 * night;
      return { flame: ph.rest, door: doorOpen };
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}
