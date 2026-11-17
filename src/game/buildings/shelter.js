// buildings/shelter.js — THE SHELTER, DRAWN (three.js), from ../shelter.js's
// numbers: the dry-stone ring and the rammed-earth dome (one shell, its stones
// below and its earth above, laid in bands), the doorway cut through it with
// its wooden door, the skylight's glass in its bronze rim, the solar awning on
// two poles; inside, the floor, a woven mat, the hearth's stones and its small
// steady plasma flame, a shelf with three clay jars.
//
// Outside it is lit as everything in the void is (the key light, the sky round
// it). Inside it is lit by what gets in: the sun only where its ray leaves the
// room through the skylight or the open doorway (sunIn, worked in the shader
// as in ../shelter.js), the sky by how near the openings a surface is, and the
// hearth. So the room is dim, with the sun's patch moving over it.
//
// It goes up as ../shelter.js's phase says: the stones laid, then the earth
// rising in its bands, then the door, the glass, the awning and the things.
import * as THREE from 'three';
import { SHELTER as S, OUTER, INNER, outerR, innerR, outerH, innerH, phase } from '../shelter.js';

const lin = (hex) => new THREE.Color(hex);           // three keeps colours as linear light: a hex is converted
const SEG = (lite) => (lite ? 48 : 96);

// the shell's two surfaces as one lathe each: the stone ring's face (a cylinder) and, above it, the dome (a sphere)
function profile(R, cap, base, top, sky, n) {
  const pts = [new THREE.Vector2(R, 0), new THREE.Vector2(R, base)];
  const a0 = Math.atan2(base - cap.c, R), a1 = Math.atan2(Math.sqrt(Math.max(0, cap.s * cap.s - sky * sky)), sky);
  for (let i = 1; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(new THREE.Vector2(cap.s * Math.cos(a), cap.c + cap.s * Math.sin(a))); }
  return pts;
}

// GLSL shared by every surface: the shelter's frame, the earth's bands and the stones' cells, value noise
const COMMON = `
  uniform vec2 uCentre; uniform float uYaw; uniform float uGrow; uniform float uRest;
  vec3 toLocal(vec3 w) { vec2 d = w.xz - uCentre; float c = cos(uYaw), s = sin(uYaw); return vec3(c * d.x - s * d.y, w.y, s * d.x + c * d.y); }
  float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), u.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), u.x), u.y); }
  // rammed earth: bands a few hands high, each its own shade of the same earth; a little grain
  vec3 earth(vec3 l) {
    float band = floor((l.y - ${S.base.toFixed(3)}) / 0.13 + 0.25 * n2(vec2(atan(l.x, l.z) * 3.0, 1.7)));
    float k = h1(vec2(band, 3.1)), g = n2(l.xz * 9.0 + l.y * 7.0) * 0.5 + n2(vec2(atan(l.x, l.z) * 40.0, l.y * 40.0)) * 0.5;
    vec3 c = mix(vec3(0.42, 0.27, 0.15), vec3(0.62, 0.46, 0.30), k);
    c = mix(c, vec3(0.70, 0.58, 0.44), 0.25 * step(0.82, k));
    return c * (0.9 + 0.16 * g) * (1.0 - 0.18 * smoothstep(0.035, 0.0, abs(fract((l.y - ${S.base.toFixed(3)}) / 0.13) - 0.5) - 0.465));
  }
  // dry stone: courses of flat stones, each its own grey or ochre, the joints between them dark
  vec3 stones(vec3 l) {
    float a = atan(l.x, l.z) * ${S.out.toFixed(2)};
    float row = floor(l.y / 0.15); vec2 q = vec2(a / 0.34 + 0.5 * mod(row, 2.0) + 0.3 * h1(vec2(row, 1.0)), l.y / 0.15);
    vec2 c = floor(q), f = fract(q);
    float joint = smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x) * 2.2, min(f.y, 1.0 - f.y)));
    float k = h1(c * 1.31 + 4.0);
    vec3 s = mix(vec3(0.38, 0.36, 0.33), vec3(0.58, 0.50, 0.40), k) * (0.85 + 0.25 * n2(l.xz * 13.0 + l.y * 11.0));
    return mix(vec3(0.08, 0.07, 0.06), s, joint);
  }
  // where the shell is cut: the doorway, below its lintel; the skylight
  bool cut(vec3 l) { return (l.z > 0.0 && abs(l.x) < ${S.door.half.toFixed(3)} && l.y < ${S.door.high.toFixed(3)}) || length(l.xz) < ${S.sky.toFixed(3)} - 0.004; }
`;

// what gets into the room (as ../shelter.js's sunIn): 1 where the sun's ray leaves through the skylight or the doorway
const INSIDE = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uHearth; uniform vec3 uHearthCol; uniform float uDoor; uniform float uOpen;
  float sunIn(vec3 l) {
    float c = cos(uYaw), s = sin(uYaw);
    vec3 d = vec3(c * uSunDir.x - s * uSunDir.z, uSunDir.y, s * uSunDir.x + c * uSunDir.z);
    if (d.y <= 0.0) return 0.0;
    float a = dot(d.xz, d.xz), b = 2.0 * dot(l.xz, d.xz), cc = dot(l.xz, l.xz) - ${(S.in * S.in).toFixed(5)};
    float t = a > 1e-6 ? (-b + sqrt(max(0.0, b * b - 4.0 * a * cc))) / (2.0 * a) : 1e4;
    vec3 e = l + d * t;
    if (e.y > ${S.base.toFixed(3)}) {
      vec3 o = l - vec3(0.0, ${INNER.c.toFixed(5)}, 0.0);
      float B = dot(o, d), C = dot(o, o) - ${(INNER.s * INNER.s).toFixed(5)};
      e = l + d * (-B + sqrt(max(0.0, B * B - C)));
      if (length(e.xz) < ${S.sky.toFixed(3)}) return 1.0;
    }
    return (e.z > 0.0 && abs(e.x) < ${S.door.half.toFixed(3)} && e.y < ${S.door.high.toFixed(3)}) ? uDoor : 0.0;
  }
  vec3 litInside(vec3 albedo, vec3 l, vec3 w, vec3 n, float gloss) {
    float c = cos(uYaw), s = sin(uYaw);
    vec3 dn = vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
    vec3 dl = vec3(c * uSunDir.x - s * uSunDir.z, uSunDir.y, s * uSunDir.x + c * uSunDir.z);
    vec3 col = uSunCol * mix(sunIn(l + dn * 0.01), 1.0, uOpen) * max(dot(dn, dl), 0.0);
    // the sky, by how open a surface is to it: near the doorway, under the skylight
    vec2 doorAt = vec2(0.0, ${S.in.toFixed(3)});
    float open = 0.3 + 0.7 * exp(-dot(l.xz - doorAt, l.xz - doorAt) / 1.6) * (0.6 + 0.4 * max(dn.z, 0.0)) + 0.4 * exp(-dot(l.xz, l.xz) / 0.9) * (0.5 + 0.5 * max(dn.y, 0.0));
    col += uSky * mix(open, 1.0, uOpen);
    // the hearth's flame
    vec3 L = uHearth - w; float dd = length(L);
    col += uHearthCol * max(dot(n, L / dd) * 0.8 + 0.2, 0.0) / (1.0 + dd * dd / 0.3);
    vec3 outc = albedo * col;
    if (gloss > 0.0) { vec3 v = normalize(cameraPosition - w), h = normalize(L / dd + v); outc += uHearthCol * gloss * pow(max(dot(n, h), 0.0), 40.0) / (1.0 + dd * dd); }
    return outc;
  }
`;

export function createShelterArt({ lite = false } = {}) {
  const group = new THREE.Group(), seg = SEG(lite), U = {
    uCentre: { value: new THREE.Vector2() }, uYaw: { value: 0 }, uGrow: { value: 0 }, uRest: { value: 0 }, uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() },
    uHearth: { value: new THREE.Vector3() }, uHearthCol: { value: new THREE.Color() }, uDoor: { value: 1 }, uOpen: { value: 1 },
  };
  const mats = [], geos = [];
  const keep = (m) => { mats.push(m); return m; }, geo = (g) => { geos.push(g); return g; };

  // ---- outside: one standard material, its colour the stone below the ring's top and the earth above; cut and grown
  const outerMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, envMapIntensity: 0.6 }));
  outerMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\n' + COMMON)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 lo = toLocal(vW);
        if (cut(lo) || lo.y > uGrow) discard;
        diffuseColor.rgb = lo.y < ${S.base.toFixed(3)} ? stones(lo) : earth(lo);
        diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.08, 0.0, lo.y);              // damp where it meets the water
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.8, 0.6), 0.6 * smoothstep(0.06, 0.0, uGrow - lo.y) * step(lo.y, ${S.top.toFixed(3)} - 0.01) * (1.0 - uRest));   // the fresh earth at the rising edge`);
  };
  outerMat.customProgramCacheKey = () => 'shelter-outer';
  const outer = new THREE.Mesh(geo(new THREE.LatheGeometry(profile(S.out, OUTER, S.base, S.top, S.sky, lite ? 16 : 32), seg)), outerMat);
  group.add(outer);

  // ---- inside: its own light (above); the shell's inner face, the floor and the things in the room
  const insideMat = (albedo, { gloss = 0, side = THREE.FrontSide, pre = '', cutIt = false } = {}) => keep(new THREE.ShaderMaterial({
    uniforms: U, side,
    vertexShader: `varying vec3 vW; varying vec3 vN; varying vec2 vTex;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vTex = uv; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; varying vec3 vN; varying vec2 vTex; uniform float uTime;
      ${COMMON}${INSIDE}
      void main() {
        vec3 l = toLocal(vW);
        if (l.y > uGrow + 0.002${cutIt ? ' || cut(l)' : ''}) discard;
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        ${pre}
        vec3 a = ${albedo};
        gl_FragColor = vec4(litInside(a, l, vW, n, ${gloss.toFixed(2)}), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  // the shell's inner face: the profile run the other way, so its faces look into the room
  const innerGeo = geo(new THREE.LatheGeometry(profile(S.in, INNER, S.base, S.topIn, S.sky, lite ? 16 : 32).reverse(), seg));
  const inner = new THREE.Mesh(innerGeo, insideMat('l.y < ' + S.base.toFixed(3) + ' ? stones(l) : earth(l)', { cutIt: true }));
  group.add(inner);

  // the doorway's reveals (its two jambs and the lintel's underside) and the skylight's shaft: the shell's thickness where it is cut
  const reveal = new THREE.BufferGeometry(), rp = [], rn = [], ri = [];
  const quad = (a, b, c, d, n) => { const k = rp.length / 3; rp.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) rn.push(...n); ri.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  const zIn = (y, x) => Math.sqrt(Math.max(0, innerR(y) ** 2 - x * x)), zOut = (y, x) => Math.sqrt(Math.max(0, outerR(y) ** 2 - x * x));
  for (let i = 0, n = 12; i < n; i++) {
    const y0 = (S.door.high * i) / n, y1 = (S.door.high * (i + 1)) / n;
    for (const side of [-1, 1]) {
      const x = side * S.door.half, nn = [-side, 0, 0];
      const pts = [[x, y0, zIn(y0, x)], [x, y0, zOut(y0, x)], [x, y1, zOut(y1, x)], [x, y1, zIn(y1, x)]];
      if (side > 0) quad(pts[0], pts[3], pts[2], pts[1], nn); else quad(...pts, nn);
    }
  }
  for (let i = 0, n = 10; i < n; i++) {
    const x0 = -S.door.half + (2 * S.door.half * i) / n, x1 = x0 + (2 * S.door.half) / n, y = S.door.high;
    quad([x0, y, zIn(y, x0)], [x1, y, zIn(y, x1)], [x1, y, zOut(y, x1)], [x0, y, zOut(y, x0)], [0, -1, 0]);
  }
  reveal.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); reveal.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
  reveal.setIndex(ri); reveal.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((rp.length / 3) * 2).fill(0), 2));
  group.add(new THREE.Mesh(geo(reveal), insideMat('l.y < ' + S.base.toFixed(3) + ' ? stones(l) : earth(l)', { side: THREE.DoubleSide })));
  const shaft = new THREE.Mesh(geo(new THREE.CylinderGeometry(S.sky, S.sky, outerH(S.sky) - innerH(S.sky), seg / 2, 1, true).translate(0, (outerH(S.sky) + innerH(S.sky)) / 2, 0)),
    insideMat('earth(l) * 0.9', { side: THREE.BackSide }));
  group.add(shaft);

  // the floor: packed earth, darker where it is walked; the stone threshold in the doorway
  const floor = new THREE.Mesh(geo(new THREE.CircleGeometry(S.in + 0.01, seg).rotateX(-Math.PI / 2).translate(0, S.floor, 0)),
    insideMat('vec3(0.36, 0.27, 0.19) * (0.85 + 0.2 * n2(l.xz * 3.0) + 0.08 * n2(l.xz * 31.0)) * (1.0 - 0.12 * exp(-dot(l.xz - vec2(0.0, 0.9), l.xz - vec2(0.0, 0.9)) / 0.3))'));
  group.add(floor);
  const sill = new THREE.Mesh(geo(new THREE.BoxGeometry(2 * S.door.half, S.floor, S.out + 0.12 - (S.in - 0.05)).translate(0, S.floor / 2, (S.out + 0.12 + S.in - 0.05) / 2)),
    insideMat('stones(l + vec3(0.0, 0.07, 0.0)) * 1.1'));
  group.add(sill);

  // ---- the skylight: clear glass in a thin bronze rim
  const glassY = outerH(S.sky) + 0.005;
  const glass = new THREE.Mesh(geo(new THREE.CircleGeometry(S.sky, 48).rotateX(-Math.PI / 2).translate(0, glassY, 0)),
    keep(new THREE.MeshPhysicalMaterial({ color: 0xdfeef0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false })));
  const bronze = keep(new THREE.MeshStandardMaterial({ color: lin('#9c6b3a'), roughness: 0.32, metalness: 0.95, envMapIntensity: 1.2 }));
  const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(S.sky + 0.01, 0.028, 10, 64).rotateX(Math.PI / 2).translate(0, glassY, 0)), bronze);
  group.add(glass, rim);

  // ---- the door: planks in a frame, hinged at its left as you come in; it swings out as a body comes near
  const wood = (k, u = 'vTex.x', v = 'vTex.y') => `vec3(0.33, 0.21, 0.12) * (0.75 + 0.3 * n2(vec2(${u} * 4.0, ${v} * 60.0)) + 0.1 * h1(vec2(floor(${u} * 5.0), 2.0))) * (1.0 - 0.45 * smoothstep(0.03, 0.0, abs(fract(${u} * 5.0) - 0.5) - 0.47)) * ${k}`;
  const doorW = 2 * S.door.half - 0.04, doorZ = Math.sqrt(outerR(S.door.high) ** 2 - S.door.half ** 2) - 0.02;
  const hinge = new THREE.Group(); hinge.position.set(-S.door.half + 0.02, 0, doorZ);
  const leafMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, envMapIntensity: 0.5 }));
  leafMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTex;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTex = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTex;\n' + COMMON)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = ${wood('1.0')};`);
  };
  leafMat.customProgramCacheKey = () => 'shelter-door';
  const leaf = new THREE.Mesh(geo(new THREE.BoxGeometry(doorW, S.door.high - S.floor - 0.03, 0.05).translate(doorW / 2, (S.door.high + S.floor) / 2, 0)), leafMat);
  hinge.add(leaf);
  const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.045, 0.008, 8, 24).translate(doorW - 0.12, 1.0, 0.035)), bronze);
  hinge.add(ring);
  group.add(hinge);

  // ---- the awning: a strip of dark solar cloth, its cells fine and glinting, on two thin bronze poles
  const A = S.awning, aw = new THREE.PlaneGeometry(2 * A.half, A.to - A.from, 12, 8);
  { const p = aw.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), v = (p.getY(i) + (A.to - A.from) / 2) / (A.to - A.from);    // 0 at the dome, 1 at the poles
      p.setXYZ(i, x, A.at - A.drop * v - 0.07 * Math.sin(Math.PI * v) * (1 - (x / A.half) ** 2 * 0.3), A.from + (A.to - A.from) * v);
    }
    aw.computeVertexNormals(); }
  const clothMat = keep(new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.62, metalness: 0.1, envMapIntensity: 0.15, side: THREE.DoubleSide }));
  clothMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vTex;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTex = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTex;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 cq = fract(vTex * vec2(18.0, 12.0)); float grid = smoothstep(0.0, 0.06, min(min(cq.x, 1.0 - cq.x), min(cq.y, 1.0 - cq.y)));
        diffuseColor.rgb = mix(vec3(0.16, 0.15, 0.13), vec3(0.012, 0.018, 0.04), grid);`);
  };
  clothMat.customProgramCacheKey = () => 'shelter-cloth';
  const awning = new THREE.Mesh(geo(aw), clothMat);
  group.add(awning);
  const poleH = A.at - A.drop;
  for (const sx of [-1, 1]) group.add(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.022, 0.028, poleH, 10).translate(sx * (A.half - 0.04), poleH / 2, A.to - 0.04)), bronze));

  // ---- inside: the mat, the hearth and its flame, the shelf and its jars
  // a mat's weave: two layers of strips crossing, over and under in turn, a dyed border
  const mat = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.82, 1.9).rotateX(-Math.PI / 2).translate(0, S.floor + 0.006, 0)), insideMat('weave', { pre: `
        vec2 wq = vTex * vec2(14.0, 32.0), wc = floor(wq), wf = fract(wq);
        float over = mod(wc.x + wc.y, 2.0);
        float sx = smoothstep(0.0, 0.18, min(wf.x, 1.0 - wf.x)), sy = smoothstep(0.0, 0.18, min(wf.y, 1.0 - wf.y));
        float border = clamp(step(vTex.x, 0.07) + step(0.93, vTex.x) + step(vTex.y, 0.04) + step(0.96, vTex.y), 0.0, 1.0);
        vec3 weave = mix(vec3(0.62, 0.48, 0.26), vec3(0.42, 0.16, 0.10), border) * (0.7 + 0.3 * mix(sx, sy, over)) * (0.92 + 0.12 * h1(wc));` }));
  { const [mx, mz] = [-0.95, 0.15]; mat.position.set(mx, 0, mz); mat.rotation.y = -0.25; }
  group.add(mat);

  const hearth = new THREE.Group(); hearth.position.set(S.hearth.x, 0, S.hearth.z);
  const stoneGeo = geo(new THREE.IcosahedronGeometry(0.1, 2));
  const hs = insideMat('vec3(0.46, 0.43, 0.39) * (0.75 + 0.35 * n2(l.xz * 23.0 + l.y * 17.0)) * (0.85 + 0.3 * h1(floor(l.xz * 9.0)))');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = S.hearth.r - 0.1, st = new THREE.Mesh(stoneGeo, hs);
    st.position.set(Math.cos(a) * r, S.floor + 0.07, Math.sin(a) * r); st.scale.set(1.0 + 0.3 * Math.sin(i * 7.1), 0.75 + 0.2 * Math.cos(i * 3.3), 1.1); st.rotation.set(i, i * 2.3, i * 0.7);
    hearth.add(st);
  }
  const bowl = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.22, 0.17, 0.08, 24).translate(0, S.floor + 0.04, 0)), insideMat('vec3(0.16, 0.14, 0.13)'));
  hearth.add(bowl);
  // the flame: a small steady plasma, a white core in a blue-violet sheath, its tongues rising slowly, and a faint
  // halo round it. Drawn on a card that always turns to the eye about the upright (no flame is a solid thing)
  const FW = 0.62, FH = 0.62;
  const flame = new THREE.Mesh(geo(new THREE.PlaneGeometry(FW, FH).translate(0, FH / 2 - 0.08, 0)), keep(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vF;
      void main() {
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, to = cameraPosition - c; to.y = 0.0;
        vec3 right = normalize(vec3(to.z, 0.0, -to.x) + 1e-5);
        vF = vec2(position.x / ${FW.toFixed(2)}, (position.y + 0.08) / ${FH.toFixed(2)});
        gl_Position = projectionMatrix * viewMatrix * vec4(c + right * position.x + vec3(0.0, position.y, 0.0), 1.0);
      }`,
    fragmentShader: `varying vec2 vF; uniform float uTime; uniform float uRest;
      float fh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float fn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), u.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), u.x), u.y); }
      void main() {
        float y = (vF.y - 0.13) / 0.62, x = vF.x;                           // the flame stands from y 0 to 1 on the card
        float t = uTime * 1.6;
        float n = 0.6 * fn(vec2(x * 7.0, y * 4.0 - t)) + 0.4 * fn(vec2(x * 15.0 + 3.0, y * 9.0 - t * 1.7));
        float sway = 0.03 * sin(y * 5.0 - t * 1.3) * y;
        float w = 0.2 * pow(max(0.0, 1.0 - y), 0.8) * smoothstep(-0.05, 0.12, y) * (0.72 + 0.56 * n);
        float d = abs(x - sway);
        float body = (1.0 - smoothstep(w * 0.55, w, d)) * step(0.0, y) * step(y, 1.0);
        float core = (1.0 - smoothstep(0.0, w * 0.5, d)) * (1.0 - smoothstep(0.15, 0.6, y)) * step(0.0, y);
        vec3 c = mix(vec3(0.32, 0.2, 0.95), vec3(0.45, 0.75, 1.0), smoothstep(0.0, 0.8, 1.0 - d / max(w, 1e-4)) * (1.0 - y)) * body * 1.4 + vec3(0.95, 0.98, 1.0) * core * 1.6;
        float halo = exp(-(x * x + (vF.y - 0.3) * (vF.y - 0.3)) / 0.035) * 0.22;
        gl_FragColor = vec4((c + vec3(0.35, 0.45, 1.0) * halo) * uRest, 1.0);
        #include <colorspace_fragment>
      }`,
  })));
  flame.position.set(0, S.floor + 0.08, 0);
  hearth.add(flame);
  group.add(hearth);
  const flameAt = new THREE.Vector3(S.hearth.x, S.floor + 0.32, S.hearth.z);

  // the shelf: a curved plank along the wall at the left as you come in, on two brackets; three clay jars on it
  const shelfY = 1.05, shelfOut = innerR(shelfY) - 0.02, shelfIn = shelfOut - 0.24, a0 = Math.PI * 0.62, a1 = Math.PI * 0.92;
  const plank = new THREE.Mesh(geo(new THREE.RingGeometry(shelfIn, shelfOut, 24, 1, a0, a1 - a0).rotateX(-Math.PI / 2).translate(0, shelfY, 0)),
    insideMat(wood('1.1', 'atan(l.x, l.z) * 1.7', 'length(l.xz) * 0.4'), { side: THREE.DoubleSide }));
  group.add(plank);
  const edge = new THREE.Mesh(geo(new THREE.CylinderGeometry(shelfIn, shelfIn, 0.04, 24, 1, true, a0 + Math.PI / 2, a1 - a0).translate(0, shelfY - 0.02, 0)),
    insideMat(wood('0.9', 'atan(l.x, l.z) * 1.7', 'l.y * 3.0'), { side: THREE.DoubleSide }));
  group.add(edge);
  const clay = insideMat('vec3(0.55, 0.27, 0.15) * (0.85 + 0.25 * n2(l.xz * 20.0 + l.y * 9.0)) * (1.0 + 0.25 * smoothstep(0.012, 0.0, abs(fract(l.y * 9.0) - 0.5) - 0.48))', { gloss: 0.4 });
  const jarProfile = (h, w) => { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(w * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (t > 0.85 ? 0.6 : 1), t * h)); } pts.push(new THREE.Vector2(0.001, h)); return pts; };
  [[0.22, 0.075, 0.68], [0.28, 0.09, 0.77], [0.18, 0.065, 0.86]].forEach(([h, w, at]) => {
    const a = Math.PI * at, r = (shelfIn + shelfOut) / 2;
    const jar = new THREE.Mesh(geo(new THREE.LatheGeometry(jarProfile(h, w), 20)), clay);
    jar.position.set(Math.cos(a) * r, shelfY + 0.002, -Math.sin(a) * r);
    group.add(jar);
  });

  // the water round its foot: a little darker, where the shelter stands in it
  const shade = new THREE.Mesh(geo(new THREE.RingGeometry(S.out - 0.02, S.out + 0.9, seg, 1).rotateX(-Math.PI / 2).translate(0, 0.0254 + 0.0015, 0)), keep(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: 'varying float vR; void main() { vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying float vR; uniform float uGrow; void main() { float a = 0.32 * pow(1.0 - clamp((vR - ${S.out.toFixed(2)}) / 0.9, 0.0, 1.0), 2.0) * clamp(uGrow / 0.6, 0.0, 1.0); gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
  })));
  shade.renderOrder = 1;
  group.add(shade);

  // the last phase: the door, the glass and its rim, the awning and its poles, then the room's things, one after another
  const jars = group.children.filter((o) => o.geometry?.type === 'LatheGeometry' && o !== outer && o !== inner);
  const poles = group.children.filter((o) => o.geometry?.type === 'CylinderGeometry' && o.material === bronze);
  const things = [[hinge, 0], [glass, 0.15], [rim, 0.15], [awning, 0.3], ...poles.map((o) => [o, 0.3]), [mat, 0.45], [hearth, 0.55], [plank, 0.7], [edge, 0.7], ...jars.map((o, i) => [o, 0.78 + 0.07 * i])];
  let doorOpen = 0;

  return {
    group, flameAt,
    // where it stands and how far up it is; what light the room has; whether a body is near its door
    update(b, { t = 0, dt = 0, sun = [0, 1, 0], sunCol = new THREE.Color(1, 1, 1), sky = new THREE.Color(0.2, 0.2, 0.25), near = false, hearthCol = new THREE.Color(0.5, 0.65, 1) } = {}) {
      group.position.set(b.x, 0, b.z); group.rotation.y = b.yaw;
      const ph = phase(b);
      U.uCentre.value.set(b.x, b.z); U.uYaw.value = b.yaw; U.uTime.value = t;
      U.uGrow.value = ph.stones < 1 ? S.base * ph.stones : S.base + (S.top - S.base + 0.02) * ph.walls;
      U.uRest.value = ph.rest; U.uOpen.value = 1 - ph.walls;
      U.uSunDir.value.set(sun[0], sun[1], sun[2]); U.uSunCol.value.copy(sunCol); U.uSky.value.copy(sky);
      U.uHearth.value.copy(flameAt).applyMatrix4(group.matrixWorld.compose(group.position, group.quaternion, group.scale));
      U.uHearthCol.value.copy(hearthCol).multiplyScalar(ph.rest * (0.97 + 0.03 * Math.sin(t * 5.3) * Math.sin(t * 3.1)));
      doorOpen += ((near ? 1 : 0) - doorOpen) * (1 - Math.exp(-5 * dt));
      hinge.rotation.y = -1.45 * doorOpen;
      U.uDoor.value = 0.35 + 0.65 * doorOpen;
      for (const [o, at] of things) o.visible = ph.rest > at;
      floor.visible = sill.visible = ph.stones > 0.5;
      shaft.visible = ph.walls > 0.95;
      return { flame: ph.rest, door: doorOpen };
    },
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}
