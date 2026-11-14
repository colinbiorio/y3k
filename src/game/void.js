// void.js — THE PLACE: an endless void under one inch of still water.
//
// Colin, 13 Nov 2026 (GAME.md): "instead of generating a whole solar system,
// let's just start with an endless void -- think assassin's creed, but with
// 1 inch of still water".
//
//   · THE SKY is a function of direction alone (skyAt), so it has no pixels:
//     the dome draws it, and the water mirrors it by asking the same function
//     along the reflected ray. Below the horizon, past the water's last
//     vertex, the dome draws the water as it is at that distance, so the two
//     meet without a line however high the eye climbs.
//   · THE WATER is one flat mesh that follows the eye. It is still. What moves
//     on it is what a body does to it: every footfall, landing and dash drops
//     a ring (createDrops), and a ring travels at the speed shallow water
//     gives it, √(g·d) = 0.499 m/s for one inch. Rings are functions too
//     (ripples), so they are as sharp at any size of screen.
//   · WHAT STANDS IN IT is mirrored the true way: drawn again from the eye's
//     mirror image below the surface (renderMirror; the near plane laid on
//     the water, Lengyel's oblique frustum), into a picture the water reads
//     through the ripples' slopes.
//   · THE FLOOR an inch down carries a faint six-sided lattice: in a void it
//     is what says how far you have come.
import * as THREE from 'three';
import { WATER } from './body.js';
import { RIPPLE_SPEED, DROPS, RING, CELL, createDrops } from './rings.js';
import { LIGHTS } from './lights.js';

const BODIES = 4;
const MOTE_BOX = [64, 28, 64];
const MOTE_CAP = 3.2;                 // the widest a mote is drawn, in CSS pixels

const SKY_GLSL = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlowCol; uniform vec3 uGlowDir; uniform float uBand; uniform float uF0;
vec3 skyAt(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  float t = (1.0 - exp(-h * uBand)) / (1.0 - exp(-uBand));     // the horizon's band of light, then the long rise
  vec3 c = mix(uHorizon, uZenith, t);
  float g = max(dot(d, uGlowDir), 0.0);
  return c + uGlowCol * (0.6 * pow(g, 5.0) + 0.4 * pow(g, 48.0));
}
float grain(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5; }
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);   // round the eye, wherever the eye is
  gl_Position = p.xyww;                                                  // and behind everything
}`;
const SKY_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c;
  if (d.y >= 0.0) c = skyAt(d);
  else {
    // the water past its last vertex: all haze below, the sky above it mirrored
    float f = uF0 + (1.0 - uF0) * pow(1.0 + d.y, 5.0);
    c = mix(uHorizon, skyAt(vec3(d.x, -d.y, d.z)), f);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy) * (1.6 / 255.0);            // no bands in a slow gradient
}`;

const WATER_VERT = /* glsl */ `
uniform mat4 uMirror;
varying vec3 vWorld; varying vec4 vMirror;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vMirror = uMirror * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */ `
${SKY_GLSL}
uniform sampler2D tMirror;
uniform float uTime; uniform vec3 uFloor; uniform vec3 uLine; uniform float uLineAmt;
uniform vec4 uDrops[${DROPS}];
uniform vec4 uBodies[${BODIES}];
varying vec3 vWorld; varying vec4 vMirror;
const float C = ${RIPPLE_SPEED.toFixed(6)};
const float RW = ${RING.width.toFixed(4)};
const float K = ${((2 * Math.PI) / RING.wavelength).toFixed(5)};
// the slope every ring in reach gives the water here: rings.js ring(), line for line
vec2 ripples(vec2 p) {
  vec2 grad = vec2(0.0);
  for (int i = 0; i < ${DROPS}; i++) {
    vec4 d = uDrops[i];
    float age = uTime - d.z;
    if (age < 0.0 || age > ${RING.oldest.toFixed(1)}) continue;
    vec2 q = p - d.xy;
    float r = length(q);
    float s = r - C * age;
    if (abs(s) > ${RING.reach.toFixed(2)} * RW) continue;
    float a = (d.w / K) * exp(-age / ${RING.life.toFixed(3)}) * min(1.0, age / ${RING.born.toFixed(3)}) / sqrt(1.0 + r / ${RING.thin.toFixed(3)});
    float g = exp(-(s * s) / (RW * RW));
    grad += a * g * (-2.0 * s / (RW * RW) * cos(K * s) - K * sin(K * s)) * q / max(r, 1e-4);
  }
  return grad;
}
// metres to the nearest edge of a honeycomb whose cells are 1 across
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5;
  vec2 b = mod(p - s * 0.5, s) - s * 0.5;
  vec2 g = abs(dot(a, a) < dot(b, b) ? a : b);
  return 0.5 - max(dot(g, s * 0.5), g.x);
}
void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  vec2 grad = dist < 90.0 ? ripples(vWorld.xz) : vec2(0.0);
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  float F = uF0 + (1.0 - uF0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // above: the sky along the mirrored ray, and over it whatever stands in the water
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 above = skyAt(normalize(R));
  vec2 uv = vMirror.xy / vMirror.w + N.xz * (0.55 / (1.0 + 0.12 * dist));
  vec4 m = texture2D(tMirror, uv);
  above = above * (1.0 - m.a) + m.rgb;

  // below: the floor an inch down, its lattice bent a little by the slope over it
  vec2 fp = vWorld.xz - grad * 0.22;
  float px = max(fwidth(vWorld.x), fwidth(vWorld.z));                    // metres a pixel covers here
  float e = hexEdge(fp / ${CELL.toFixed(3)}) * ${CELL.toFixed(3)};
  const float LW = 0.0045;
  float line = (1.0 - smoothstep(LW - px, LW + px, e)) * min(1.0, 2.0 * LW / px);
  line *= (1.0 - smoothstep(24.0, 70.0, dist)) * (1.0 - smoothstep(${(CELL / 9).toFixed(4)}, ${(CELL / 3.5).toFixed(4)}, px));
  vec3 below = mix(uFloor, uLine, line * uLineAmt);
  // a body stands in its own soft shade (the void's light comes from everywhere, so it is only that)
  float shade = 0.0;
  for (int i = 0; i < ${BODIES}; i++) {
    vec4 b = uBodies[i];
    if (b.w <= 0.0) continue;
    float q = length(vWorld.xz - b.xy) / b.z;
    shade = max(shade, b.w * exp(-q * q * 1.6));
  }
  below *= 1.0 - shade;
  below = mix(below, uHorizon, 1.0 - exp(-dist * 0.004));              // and far off, the floor is haze

  gl_FragColor = vec4(mix(below, above, F), 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy) * (1.6 / 255.0);
}`;

const MOTE_VERT = /* glsl */ `
attribute vec3 aSeed; attribute float aSize;
uniform vec3 uEye; uniform vec3 uShift; uniform vec3 uBox; uniform float uTime; uniform float uScale; uniform float uCap;
varying float vA;
void main() {
  vec3 drift = vec3(0.09, 0.03, 0.06) * uTime + 0.4 * sin(uTime * 0.17 + aSeed.yzx * 6.2831853);
  vec3 rel = mod(aSeed * uBox + drift - uEye - uShift + 0.5 * uBox, uBox) - 0.5 * uBox;   // the same motes, always round the eye
  vec3 w = uEye + rel;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = aSize * uScale / max(-mv.z, 0.05);
  gl_PointSize = clamp(size, 1.5, uCap);                                         // dust, never a coin: a near one is no wider than a far one is bright
  vec3 edge = abs(rel) / (0.5 * uBox);
  vA = (1.0 - smoothstep(0.78, 1.0, max(edge.x, max(edge.y, edge.z))))      // none pops at the box's faces
     * smoothstep(0.08, 0.5, w.y) * smoothstep(1.2, 5.0, -mv.z)              // none in the water, none a white coin in front of the eye
     * min(1.0, size * size / 2.25);                                          // one too small to draw dims instead of flickering
}`;
const MOTE_FRAG = /* glsl */ `
uniform vec3 uMote; uniform float uSolid; uniform float uMoteAmt;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d); a *= a * vA * uMoteAmt;
  gl_FragColor = vec4(uMote * a, a * uSolid);                               // premultiplied: solid in a pale sky, added light in a dark one
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aSeed;
uniform float uTime; uniform float uDpr;
varying float vA;
void main() {
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
  gl_PointSize = aSize * uDpr;
  vA = (0.82 + 0.18 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0)) * smoothstep(0.0, 0.16, position.y);
}`;
const STAR_FRAG = /* glsl */ `
uniform float uStars;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * vA * uStars;
  gl_FragColor = vec4(vec3(0.86, 0.92, 1.0) * a, 0.0);
  #include <colorspace_fragment>
}`;

// a seeded stream, so the motes and the stars are the same ones every visit
function rand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the water's mesh: rings of vertices growing by a ratio, small beside the eye and vast far off
function waterGeometry(reach = 9000, around = 64) {
  const radii = [0];
  for (let r = 0.75; r < reach; r *= 1.55) radii.push(r);
  radii.push(reach);
  const pos = [], idx = [];
  for (const r of radii) for (let j = 0; j < around; j++) { const a = (j / around) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  for (let i = 0; i + 1 < radii.length; i++) for (let j = 0; j < around; j++) {
    const a = i * around + j, b = i * around + ((j + 1) % around), c = a + around, d = b + around;
    idx.push(a, b, c, b, d, c);                                             // wound to face up
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function createVoid({ renderer, lite = false, light = 'pale' } = {}) {
  const scene = new THREE.Scene();
  const drops = createDrops(DROPS);
  const sky = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color() },
    uGlowDir: { value: new THREE.Vector3(0, 0.3, -1) }, uBand: { value: 3 }, uF0: { value: 0.3 } };
  const time = { value: 0 };

  const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), new THREE.ShaderMaterial({
    uniforms: sky, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  dome.frustumCulled = false; dome.renderOrder = 10; dome.layers.set(1);   // layer 1: the eye sees it, the mirror's eye does not (the water asks skyAt itself)
  scene.add(dome);

  const mirror = new THREE.WebGLRenderTarget(4, 4, { samples: lite ? 0 : 4, depthBuffer: true });
  mirror.texture.colorSpace = THREE.SRGBColorSpace;                         // eight bits spent where the eye can tell
  mirror.texture.generateMipmaps = false;
  const mirrorCam = new THREE.PerspectiveCamera();
  const waterU = { ...sky, tMirror: { value: mirror.texture }, uMirror: { value: new THREE.Matrix4() }, uTime: time,
    uFloor: { value: new THREE.Color() }, uLine: { value: new THREE.Color() }, uLineAmt: { value: 0.5 },
    uDrops: { value: drops.data }, uBodies: { value: new Float32Array(BODIES * 4) } };
  const water = new THREE.Mesh(waterGeometry(), new THREE.ShaderMaterial({
    uniforms: waterU, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, toneMapped: false, extensions: { derivatives: true } }));
  water.frustumCulled = false; water.position.y = WATER; water.renderOrder = 5;
  scene.add(water);

  const nMotes = lite ? 500 : 1500, r1 = rand(3000);
  const seeds = new Float32Array(nMotes * 3), sizes = new Float32Array(nMotes);
  for (let i = 0; i < nMotes; i++) { seeds[i * 3] = r1(); seeds[i * 3 + 1] = r1(); seeds[i * 3 + 2] = r1(); sizes[i] = 0.012 + 0.03 * r1() * r1(); }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nMotes * 3), 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  moteGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const moteU = { uEye: { value: new THREE.Vector3() }, uShift: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...MOTE_BOX) },
    uTime: time, uScale: { value: 800 }, uCap: { value: 3.2 }, uMote: { value: new THREE.Color() }, uSolid: { value: 1 }, uMoteAmt: { value: 0.8 } };
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({ uniforms: moteU, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }));
  motes.frustumCulled = false; motes.renderOrder = 20;
  scene.add(motes);

  const nStars = lite ? 700 : 1800, r2 = rand(1977);
  const sp = new Float32Array(nStars * 3), ss = new Float32Array(nStars), sd = new Float32Array(nStars);
  for (let i = 0; i < nStars; i++) {
    const y = r2(), a = r2() * Math.PI * 2, rr = Math.sqrt(1 - y * y);
    sp.set([Math.cos(a) * rr, y, Math.sin(a) * rr], i * 3);
    ss[i] = 1.1 + 2.2 * Math.pow(r2(), 5); sd[i] = r2();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const starU = { uTime: time, uDpr: { value: 1 }, uStars: { value: 0 } };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false; stars.renderOrder = 11;
  scene.add(stars);

  // what a body is seen by: the void itself, from every side, and one soft light for its form
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
  scene.add(key, key.target, fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lightName = '';
  function setLight(name) {
    const L = LIGHTS[name] || LIGHTS.pale;
    lightName = LIGHTS[name] ? name : 'pale';
    sky.uZenith.value.set(L.zenith); sky.uHorizon.value.set(L.horizon);
    sky.uGlowCol.value.set(L.glow).multiplyScalar(L.glowAmt);
    sky.uGlowDir.value.set(...L.glowDir).normalize();
    sky.uBand.value = L.band; sky.uF0.value = L.f0;
    waterU.uFloor.value.set(L.floor); waterU.uLine.value.set(L.line); waterU.uLineAmt.value = L.lineAmt;
    moteU.uMote.value.set(L.mote); moteU.uSolid.value = L.moteSolid;
    starU.uStars.value = L.stars; stars.visible = L.stars > 0;
    key.color.set(L.key); key.intensity = L.keyAmt;
    fill.color.set(L.fill[0]); fill.groundColor.set(L.fill[1]); fill.intensity = L.fillAmt;
    key.position.copy(sky.uGlowDir.value).multiplyScalar(30).setY(34);
    // the same sky, wrapped round whatever stands in it
    const envScene = new THREE.Scene();
    const d2 = new THREE.Mesh(dome.geometry, dome.material);
    d2.frustumCulled = false; envScene.add(d2);
    const next = pmrem.fromScene(envScene, 0, 0.1, 10);
    envRT?.dispose(); envRT = next;
    scene.environment = envRT.texture;
    scene.environmentIntensity = L.env;                                     // (read by three from r163 on; harmless before)
    return lightName;
  }
  setLight(light);

  const dir = new THREE.Vector3(), tgt = new THREE.Vector3(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  let mirrorH = 4, mainH = 4;
  return {
    scene, drops, water, mirror,
    get light() { return lightName; },
    setLight,
    // a ring on the water at (x, z); `amp` is the steepest slope it will have
    drop(x, z, amp = 0.1) { drops.add(x, z, time.value, amp); },
    // the origin moved by (dx, dz): everything kept in the world's numbers moves with it
    rebase(dx, dz) { drops.shift(dx, dz); moteU.uShift.value.x += dx; moteU.uShift.value.z += dz; },
    resize(w, h, dpr) {
      mainH = Math.max(1, Math.round(h * dpr)); starU.uDpr.value = dpr; moteU.uCap.value = MOTE_CAP * dpr;
      const k = lite ? 0.5 : 0.7;
      const mw = Math.max(2, Math.round(w * dpr * k)), mh = Math.max(2, Math.round(h * dpr * k));
      mirror.setSize(mw, mh); mirrorH = mh;
    },
    // bodies: [{ x, z, y }] feet positions; each stands in a soft shade that widens and fades as it rises
    update(t, camera, bodies = []) {
      time.value = t;
      water.position.set(camera.position.x, WATER, camera.position.z);
      moteU.uEye.value.copy(camera.position);
      const B = waterU.uBodies.value; B.fill(0);
      bodies.slice(0, BODIES).forEach((b, i) => B.set([b.x, b.z, 0.42 + 0.55 * Math.min(b.y, 6), 0.5 / (1 + 1.4 * b.y)], i * 4));
      key.target.position.set(camera.position.x, 0, camera.position.z);
      key.position.set(camera.position.x + sky.uGlowDir.value.x * 30, 34, camera.position.z + sky.uGlowDir.value.z * 30);
    },
    // what stands in the water, seen from the eye's image below it
    renderMirror(camera) {
      const e = camera.position;
      camera.getWorldDirection(dir);
      mirrorCam.position.set(e.x, 2 * WATER - e.y, e.z);
      mirrorCam.up.set(0, 1, 0);
      mirrorCam.lookAt(tgt.set(e.x + dir.x, 2 * WATER - e.y - dir.y, e.z + dir.z));
      mirrorCam.updateMatrixWorld();
      mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
      mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
      waterU.uMirror.value.copy(bias).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
      // the near plane, laid on the water (Lengyel, "Oblique View Frustum Depth Projection and Clipping")
      plane.set(new THREE.Vector3(0, 1, 0), -WATER).applyMatrix4(mirrorCam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = mirrorCam.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1 - 0.003; pm[14] = clip.w;
      mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();
      const was = renderer.getRenderTarget(), scaleWas = moteU.uScale.value, capWas = moteU.uCap.value;
      moteU.uScale.value = scaleWas * (mirrorH / mainH); moteU.uCap.value = capWas * (mirrorH / mainH);
      water.visible = false;
      renderer.setRenderTarget(mirror);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(was);
      water.visible = true; moteU.uScale.value = scaleWas; moteU.uCap.value = capWas;
    },
    // how many pixels a metre is, one metre off: the motes' sizes are metres
    setScale(camera) { moteU.uScale.value = mainH / (2 * Math.tan((camera.fov * Math.PI) / 360)); },
    dispose() {
      envRT?.dispose(); pmrem.dispose(); mirror.dispose();
      for (const m of [dome, water, motes, stars]) { m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
