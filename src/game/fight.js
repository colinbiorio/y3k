// fight.js — THE RING AND THE BOTS, DRAWN (three.js), from combat.js's numbers.
//
// The ring: a bronze ring wound with a filament of plasma (a helix of light
// round the metal, its pulses running round it), a glow about it, and a trail
// of light behind it when it flies. Held, it floats upright beside the right
// shoulder, turning slowly; spun up, it brightens and quickens; guarding, it
// grows to a shield with a membrane of plasma across it; thrown, it lies flat
// and spins.
//
// A bot: a sphere of dark glazed ceramic in a bronze ring, one eye bulging
// from its front in the colour of its level, two seams of that colour round
// it, as many small lights on the ring's crown as its level, three bronze fins
// behind, a hover's glow beneath; it flashes when struck and shows how much it
// has left above it. Broken, it falls apart into the water.
//
// Bolts are short streaks of their sender's colour (a parried one is the
// ring's); sparks fly where things meet; the slam's wave runs out over the
// water. Everything here is in the scene, so the water's mirror shows it too.
//
// The bow: two limbs of bronze curving back from a wrapped grip and forward
// again at their tips, strung with a filament of plasma. Held, it hangs upright
// beside the right shoulder; drawn, it turns to where the eye looks, its string
// pulled back as far as it is drawn, an arrow of plasma on it. Arrows are long
// thin streaks of the ring's light.
//
// The bell: a hand bell of bronze hanging at the right shoulder, mouth down, a
// clapper of plasma in it; as its tone builds it shivers and the water round
// the body ripples in rings; struck, it swings, and a ring of its tone goes out
// over the water, wider and fainter, the water ringing under it as it passes.
//
// The binding: a thread of warm gold light from the left hand to what it holds,
// waving a little, its pulses running in toward the hand; a halo round the bot
// it holds, which struggles in it; with nothing to take, the thread goes out
// along the eye's line and comes back. A bot it throws spins as it flies; two it
// joins go up in a flash of gold.
import * as THREE from 'three';
import { LEVELS, RING, BOW, BELL, BINDING, leftHandOf } from './combat.js';
import { WATER } from './body.js';

const BRONZE = new THREE.Color(0.66, 0.44, 0.21), GLAZE = new THREE.Color(0.075, 0.085, 0.105);
const PLASMA = new THREE.Color(0.55, 0.85, 1.0), GOLD = new THREE.Color(1.0, 0.8, 0.42);
const levelCol = (l) => new THREE.Color(...LEVELS[Math.max(1, Math.min(5, l)) - 1].colour);

// a soft round glow, made once (a sprite's picture)
export function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, r = Math.hypot(dx, dy), a = Math.max(0, 1 - r) ** 2.2;
    data.set([255, 255, 255, Math.round(255 * a)], (y * n + x) * 4);
  }
  const t = new THREE.DataTexture(data, n, n); t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}
// the filament: a helix wound round the ring's metal, `turns` times
class Winding extends THREE.Curve {
  constructor(R, a, turns) { super(); this.R = R; this.a = a; this.turns = turns; }
  getPoint(u, out = new THREE.Vector3()) {
    const t = u * Math.PI * 2, w = t * this.turns, r = this.R + this.a * Math.cos(w);
    return out.set(Math.cos(t) * r, Math.sin(t) * r, this.a * Math.sin(w));
  }
}
const PLASMA_FRAG = `
  varying vec2 vUv; uniform float uTime; uniform float uGlow; uniform vec3 uCol;
  void main() {
    float run = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 7.0 - uTime * 11.0);
    float run2 = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 3.0 + uTime * 5.0);
    vec3 c = mix(uCol, vec3(1.0), 0.12 + 0.4 * run * run2) * (0.55 + 0.6 * run) * uGlow;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;
const UV_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function createFightArt(scene, { lite = false } = {}) {
  const geos = [], mats = [], tex = glowTexture(), root = new THREE.Group();
  root.name = 'fight';
  scene.add(root);
  const geo = (g) => { geos.push(g); return g; }, mat = (m) => { mats.push(m); return m; };
  const add = (o) => { root.add(o); return o; };
  const time = { value: 0 };

  // ---- the ring
  const ring = add(new THREE.Group());
  const metal = mat(new THREE.MeshStandardMaterial({ color: BRONZE, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 }));
  ring.add(new THREE.Mesh(geo(new THREE.TorusGeometry(RING.r, 0.034, lite ? 8 : 12, lite ? 40 : 72)), metal));
  const plasmaU = { uTime: time, uGlow: { value: 1 }, uCol: { value: PLASMA.clone() } };
  const plasma = mat(new THREE.ShaderMaterial({ uniforms: plasmaU, vertexShader: UV_VERT, fragmentShader: PLASMA_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  ring.add(new THREE.Mesh(geo(new THREE.TubeGeometry(new Winding(RING.r, 0.04, 19), lite ? 240 : 480, 0.011, 6, true)), plasma));
  const glowMat = mat(new THREE.SpriteMaterial({ map: tex, color: PLASMA.clone().multiplyScalar(0.55), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const glow = add(new THREE.Sprite(glowMat));
  // the shield's membrane, across the ring when it guards
  const skinU = { uTime: time, uAmt: { value: 0 } };
  const skin = new THREE.Mesh(geo(new THREE.CircleGeometry(RING.r * 0.97, 48)), mat(new THREE.ShaderMaterial({
    uniforms: skinU, vertexShader: UV_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uAmt;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
        float rip = 0.5 + 0.5 * sin(r * 26.0 - uTime * 9.0 + 2.0 * sin(a * 3.0 + uTime));
        float rim = smoothstep(0.7, 1.0, r);
        vec3 c = vec3(0.45, 0.78, 1.0) * (0.05 + 0.1 * rip + 0.6 * rim * rim);
        gl_FragColor = vec4(c * uAmt, 1.0);
        #include <colorspace_fragment>
      }`,
  })));
  ring.add(skin);
  // ---- the bell: turned from its profile (crown to lip), a knob to hang by, a clapper of plasma; and the rings of its tone
  const bell = add(new THREE.Group()); bell.visible = false;
  const bellBody = new THREE.Group(); bell.add(bellBody);
  bellBody.add(new THREE.Mesh(geo(new THREE.LatheGeometry([[0.001, 0.2], [0.05, 0.195], [0.085, 0.16], [0.095, 0.09], [0.11, 0.0], [0.15, -0.09], [0.185, -0.14], [0.18, -0.15], [0.14, -0.1], [0.1, -0.01], [0.08, 0.08], [0.06, 0.15], [0.001, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 36)), mat(new THREE.MeshStandardMaterial({ color: BRONZE, metalness: 1, roughness: 0.28, envMapIntensity: 1.2, side: THREE.DoubleSide }))));
  { const k = new THREE.Mesh(geo(new THREE.TorusGeometry(0.035, 0.012, 8, 20)), metal); k.position.y = 0.23; bellBody.add(k); }
  const clapperMat = mat(new THREE.MeshBasicMaterial({ color: PLASMA.clone().multiplyScalar(1.3) }));
  const clapper = new THREE.Mesh(geo(new THREE.SphereGeometry(0.035, 12, 10)), clapperMat); clapper.position.y = -0.1; bellBody.add(clapper);
  const bellGlowMat = mat(new THREE.SpriteMaterial({ map: tex, color: PLASMA.clone().multiplyScalar(0.5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 }));
  const bellGlow = new THREE.Sprite(bellGlowMat); bellGlow.position.y = -0.1; bellGlow.scale.setScalar(0.3); bellBody.add(bellGlow);
  const TONES = 8, toneGeo = geo(new THREE.RingGeometry(0.9, 1.0, 72)), toneMeshes = [];
  toneGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < TONES; i++) {
    const m = add(new THREE.Mesh(toneGeo, mat(new THREE.MeshBasicMaterial({ color: PLASMA.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 }))));
    m.visible = false; m.frustumCulled = false; toneMeshes.push(m);
  }
  let swing = 0, swingV = 0, shiver = 0;
  // ---- the bow: its limbs and grip in bronze; its string (two strands, to the nock) and the arrow on it in plasma
  const bow = add(new THREE.Group()); bow.visible = false;
  const LIMB = 0.62, limb = (t) => [-0.13 * Math.sin(Math.PI * t * 0.85) + 0.07 * Math.max(0, (t - 0.78) / 0.22) ** 2, LIMB * t];
  for (const sd of [1, -1]) {
    const pts = Array.from({ length: 13 }, (_, i) => { const [x, y] = limb(i / 12); return new THREE.Vector3(x, sd * y, 0); });
    bow.add(new THREE.Mesh(geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.023, 6)), metal));
  }
  bow.add(new THREE.Mesh(geo(new THREE.CylinderGeometry(0.027, 0.027, 0.18, 10)), metal));
  const tipX = limb(1)[0], stringMat = mat(new THREE.MeshBasicMaterial({ color: PLASMA.clone().multiplyScalar(1.4) }));
  const strand = () => { const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.006, 0.006, 1, 5)), stringMat); bow.add(m); return m; };
  const strandUp = strand(), strandDown = strand();
  const nocked = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 6)), stringMat); nocked.rotation.z = -Math.PI / 2; bow.add(nocked);
  const bowGlowMat = mat(new THREE.SpriteMaterial({ map: tex, color: PLASMA.clone().multiplyScalar(0.55), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const bowGlow = new THREE.Sprite(bowGlowMat); bow.add(bowGlow);
  const string = (pull) => {
    // the strands from each tip to the nock, pulled back (toward the archer, -x) as far as it is drawn
    const nx = tipX - 0.55 * pull;
    for (const [m, sy] of [[strandUp, 1], [strandDown, -1]]) {
      const ax = tipX, ay = sy * LIMB, dx = nx - ax, dy = -ay, L = Math.hypot(dx, dy);
      m.position.set((ax + nx) / 2, ay / 2, 0); m.scale.set(1, L, 1); m.rotation.set(0, 0, Math.atan2(-dx, dy));
    }
    nocked.position.set(nx + 0.425, 0, 0); bowGlow.position.set(nx, 0, 0);
  };
  // its trail: a ribbon through where it has been, fading
  const TRAIL = 30, trailPts = [], trailPos = new Float32Array(TRAIL * 2 * 3), trailA = new Float32Array(TRAIL * 2);
  const trailGeo = geo(new THREE.BufferGeometry());
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('aA', new THREE.BufferAttribute(trailA, 1).setUsage(THREE.DynamicDrawUsage));
  { const idx = []; for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
  const trail = add(new THREE.Mesh(trailGeo, mat(new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0.42, 0.8, 1.0) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; uniform vec3 uCol; void main() { gl_FragColor = vec4(mix(uCol, vec3(1.0), vA * 0.5), vA * vA * 0.75);\n#include <colorspace_fragment>\n}',
  }))));
  trail.frustumCulled = false;
  // ---- the binding's thread: a ribbon from the left hand to what it holds, and the halo round it
  const BN = 28, bindPos = new Float32Array(BN * 2 * 3), bindA = new Float32Array(BN * 2);
  const bindGeo = geo(new THREE.BufferGeometry());
  bindGeo.setAttribute('position', new THREE.BufferAttribute(bindPos, 3).setUsage(THREE.DynamicDrawUsage));
  bindGeo.setAttribute('aA', new THREE.BufferAttribute(bindA, 1).setUsage(THREE.DynamicDrawUsage));
  { const idx = []; for (let i = 0; i < BN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } bindGeo.setIndex(idx); }
  const thread = add(new THREE.Mesh(bindGeo, mat(new THREE.ShaderMaterial({
    uniforms: { uCol: { value: GOLD.clone() } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // gold over a bright sky as over a dark one (added light would go white by day), its pulses paler
    fragmentShader: 'varying float vA; uniform vec3 uCol; void main() { gl_FragColor = vec4(mix(uCol * 0.9, vec3(1.0, 0.95, 0.8), (vA - 0.55) * 1.4), 0.35 + 0.6 * vA);\n#include <colorspace_fragment>\n}',
  }))));
  thread.frustumCulled = false; thread.visible = false;
  const haloMat = mat(new THREE.SpriteMaterial({ map: tex, color: GOLD.clone().multiplyScalar(0.7), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const bindHalo = add(new THREE.Sprite(haloMat)); bindHalo.visible = false;

  // ---- bolts: two instanced streaks, a core and a halo, in their sender's colour
  const NB = 64, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V3 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const boltGeo = geo(new THREE.SphereGeometry(1, 12, 10));
  // a streak: its colour at the rim, white at its heart, fading where it turns away from the eye
  const streak = (hot, alpha, add) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `varying vec3 vC; varying float vF;
      void main() {
        vec4 w = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vF = abs(dot(n, normalize(-w.xyz)));
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #else
          vC = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * w;
      }`,
    fragmentShader: `varying vec3 vC; varying float vF;
      void main() { float f = vF; gl_FragColor = vec4(mix(vC, vec3(1.0), pow(f, ${hot.toFixed(1)})), ${alpha} * smoothstep(0.0, 0.8, f));
      #include <colorspace_fragment>
      }`,
  });
  const core = add(new THREE.InstancedMesh(boltGeo, mat(streak(5, '1.0', false)), NB));
  const halo = add(new THREE.InstancedMesh(boltGeo, mat(streak(30, '0.35', true)), NB));
  for (const m of [core, halo]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); }

  // ---- sparks
  const NS = lite ? 160 : 320, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sl = [];
  const sparkGeo = geo(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = add(new THREE.Points(sparkGeo, mat(new THREE.PointsMaterial({ size: 0.09, map: tex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }))));
  sparks.frustumCulled = false;
  for (let i = 0; i < NS; i++) sl.push({ p: [0, -99, 0], v: [0, 0, 0], life: 0, max: 1, c: [1, 1, 1] });
  let sparkAt = 0;
  function burst(at, col, n = 14, speed = 6, up = 2) {
    for (let k = 0; k < n; k++) {
      const s = sl[sparkAt]; sparkAt = (sparkAt + 1) % NS;
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u), m = speed * (0.35 + 0.65 * Math.random());
      s.p = [at[0], at[1], at[2]]; s.v = [r * Math.cos(a) * m, u * m + up, r * Math.sin(a) * m]; s.max = s.life = 0.35 + 0.4 * Math.random(); s.c = [col.r, col.g, col.b];
    }
  }

  // ---- the slam's waves on the water
  const waves = [];
  const waveGeo = geo(new THREE.RingGeometry(0.86, 1, lite ? 48 : 96, 1).rotateX(-Math.PI / 2));
  function wave(at, radius) {
    const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: PLASMA, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at[0], WATER + 0.02, at[2]); add(m); waves.push({ m, t: 0, radius });
  }

  // ---- bots
  const shellGeo = geo(new THREE.SphereGeometry(1, lite ? 20 : 32, lite ? 14 : 24)), bandGeo = geo(new THREE.TorusGeometry(1.06, 0.085, 10, lite ? 40 : 64));
  const seamGeo = geo(new THREE.TorusGeometry(1, 0.022, 6, lite ? 40 : 64)), eyeGeo = geo(new THREE.SphereGeometry(0.4, 24, 12)), pupilGeo = geo(new THREE.CircleGeometry(0.13, 24));
  const bezelGeo = geo(new THREE.TorusGeometry(0.42, 0.065, 10, 40)), finGeo = geo(new THREE.BoxGeometry(0.05, 1.0, 0.7));
  const dotGeo = geo(new THREE.SphereGeometry(0.07, 10, 8)), barGeo = geo(new THREE.PlaneGeometry(1, 0.07));
  const bronzeMat = mat(new THREE.MeshStandardMaterial({ color: BRONZE, metalness: 1, roughness: 0.32, envMapIntensity: 1.1 }));
  const shardMat = mat(new THREE.MeshStandardMaterial({ color: GLAZE, roughness: 0.3, metalness: 0.1, envMapIntensity: 1.2 }));
  const pupilMat = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.02, 0.03) }));
  const drawn = new Map(), debris = [];
  let dropFn = null;
  // a bot's own materials go with it
  function unmake(d) { root.remove(d.g); for (const m of d.own) m.dispose(); }
  function makeBot(b) {
    const g = new THREE.Group(), L = LEVELS[b.level - 1], col = levelCol(b.level);
    const body = new THREE.Group(); g.add(body); body.scale.setScalar(b.r);
    const shellMat = new THREE.MeshStandardMaterial({ color: GLAZE, roughness: 0.26, metalness: 0.12, envMapIntensity: 1.3, emissive: new THREE.Color(0, 0, 0) });
    body.add(new THREE.Mesh(shellGeo, shellMat));
    // the bronze ring it hangs in, round its outline as seen from the front
    body.add(new THREE.Mesh(bandGeo, bronzeMat));
    // two seams of its level's colour, and its eye, bulging from the front in a bronze bezel, a dark pupil in it
    const lensMat = new THREE.MeshBasicMaterial({ color: col });
    for (const lat of [-0.5, 0.5]) { const sm = new THREE.Mesh(seamGeo, lensMat); sm.rotation.x = Math.PI / 2; sm.position.y = Math.sin(lat); sm.scale.setScalar(Math.cos(lat) + 0.012); body.add(sm); }
    const eye = new THREE.Mesh(eyeGeo, lensMat); eye.scale.set(1, 1, 0.55); eye.position.z = 0.86; body.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat); pupil.position.z = 0.865 + 0.4 * 0.55 + 0.004; body.add(pupil);
    const bezel = new THREE.Mesh(bezelGeo, bronzeMat); bezel.position.z = 0.88; body.add(bezel);
    // its level: as many lights on the ring's crown
    for (let i = 0; i < b.level; i++) { const a = (i - (b.level - 1) / 2) * 0.24; const d = new THREE.Mesh(dotGeo, lensMat); d.position.set(Math.sin(a) * 1.06, Math.cos(a) * 1.06, 0.1); body.add(d); }
    const fins = new THREE.Group(); fins.position.z = -0.8; body.add(fins);
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(finGeo, bronzeMat); const a = (i / 3) * Math.PI * 2 + Math.PI / 2; f.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.12); f.rotation.z = a + Math.PI / 2; fins.add(f); }
    const hover = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col.clone().multiplyScalar(0.7), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    hover.scale.setScalar(b.r * 2.2); g.add(hover);
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col.clone().multiplyScalar(0.5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    eyeGlow.scale.setScalar(b.r * 2.1); g.add(eyeGlow);
    // how much it has left, over it, once it has been struck
    const barU = { uFill: { value: 1 }, uCol: { value: col } };
    const bar = new THREE.Mesh(barGeo, new THREE.ShaderMaterial({ uniforms: barU, transparent: true, depthWrite: false, depthTest: false, vertexShader: UV_VERT,
      fragmentShader: 'varying vec2 vUv; uniform float uFill; uniform vec3 uCol; void main() { vec3 c = vUv.x < uFill ? uCol : vec3(0.08); gl_FragColor = vec4(c, vUv.x < uFill ? 0.95 : 0.5);\n#include <colorspace_fragment>\n}' }));
    bar.renderOrder = 30; bar.visible = false; g.add(bar);
    add(g);
    return { g, body, fins, shellMat, lensMat, hover, eyeGlow, bar, barU, col, drop: 0, own: [shellMat, lensMat, hover.material, eyeGlow.material, bar.material] };
  }
  function breakBot(d, at, v, r) {
    // the shell in pieces, the fins loose, into the water
    const pieces = lite ? 7 : 12;
    for (let i = 0; i < pieces; i++) {
      const g = i < 3 ? finGeo : shellGeo, m = new THREE.Mesh(g, i < 3 ? bronzeMat : shardMat);
      const s = i < 3 ? r : r * (0.22 + 0.2 * Math.random());
      m.scale.set(s, s * (i < 3 ? 1 : 0.55), s); m.position.set(at[0], at[1], at[2]); add(m);
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, k = 3 + 4 * Math.random(), rr = Math.sqrt(1 - u * u);
      debris.push({ m, v: [v[0] * 0.4 + rr * Math.cos(a) * k, Math.abs(u) * k + 2, v[2] * 0.4 + rr * Math.sin(a) * k], spin: [Math.random() * 9, Math.random() * 9, Math.random() * 9], t: 0, wet: false });
    }
    burst(at, d.col, 34, 9, 2); burst(at, new THREE.Color(1, 0.95, 0.85), 18, 5, 1);
    unmake(d);
  }

  let held = 0, guardAmt = 0, drawAmt = 0, bellDrop = 0;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
  return {
    root,
    // what happened this frame, on the water and in the air
    events(evs) {
      const drop = (x, z, a) => dropFn?.(x, z, a);
      for (const ev of evs) {
        if (ev.type === 'cast' || ev.type === 'whirl' || ev.type === 'dive') trailPts.length = 0;
        const at = ev.at;
        if (ev.type === 'hit') burst(at, ev.kind === 'parry' ? PLASMA : new THREE.Color(1, 0.9, 0.75), ev.kind === 'charged' ? 30 : 16, ev.kind === 'charged' ? 9 : 6);
        else if (ev.type === 'spark') burst(at, ev.level ? levelCol(ev.level) : PLASMA, 10, 4);
        else if (ev.type === 'deflect' || ev.type === 'parry') burst(at, PLASMA, ev.type === 'parry' ? 26 : 12, 6);
        else if (ev.type === 'splash') { drop(at[0], at[2], ev.size || 0.15); burst([at[0], WATER + 0.02, at[2]], new THREE.Color(0.7, 0.85, 1), 6, 2.5, 2.5); }
        else if (ev.type === 'spawn') drop(at[0], at[2], 0.3);
        else if (ev.type === 'bind') burst(at, GOLD, 18, 4, 1);
        else if (ev.type === 'toll') { swingV += 9 + 9 * (ev.power || 0); burst([at[0], at[1], at[2]], PLASMA, 8 + 20 * (ev.power || 0), 3, 1); }
        else if (ev.type === 'stun') burst(at, PLASMA, 10, 2, 1);
        else if (ev.type === 'fling') burst(at, GOLD, 14, 5, 1);
        else if (ev.type === 'join') { burst(at, GOLD, 46, 10, 3); burst(at, new THREE.Color(1, 0.97, 0.9), 20, 6, 2); }
        else if (ev.type === 'bind-miss') burst(at, GOLD, 6, 2, 0.5);
        else if (ev.type === 'slam') { wave(at, ev.radius); drop(at[0], at[2], 0.6); for (let k = 0; k < 6; k++) { const a = k * 1.047; drop(at[0] + Math.cos(a) * 1.2, at[2] + Math.sin(a) * 1.2, 0.2); } burst([at[0], at[1] + 0.2, at[2]], PLASMA, 40, 8, 3); }
        else if (ev.type === 'broken' || ev.type === 'gone') { const d = drawn.get(ev.id); if (d) { drawn.delete(ev.id); if (ev.type === 'broken') breakBot(d, at, ev.v || [0, 0, 0], ev.r || 0.5); else { burst(at, d.col, 12, 3); unmake(d); } } }
      }
    },
    update(c, dt, camera, body) {
      time.value += dt;
      const R = c.ring;
      // ---- the ring, and how it is turned
      ring.position.set(R.p[0], R.p[1], R.p[2]);
      const flying = R.mode === 'out' || R.mode === 'back' || R.mode === 'whirl' || R.mode === 'slam', fallen = c.player.down > 0;
      guardAmt += ((c.guard.up ? 1 : 0) - guardAmt) * (1 - Math.exp(-14 * dt));
      held += (((R.mode === 'charging') ? R.charge : 0) - held) * (1 - Math.exp(-10 * dt));
      if (fallen && !flying) {
        // struck down: the ring lies on the water beside the body, still turning a little
        ring.position.set(body.p[0] + Math.sin(body.yaw + 1.2) * 0.8, body.p[1] + 0.05, body.p[2] + Math.cos(body.yaw + 1.2) * 0.8);
        e.set(-Math.PI / 2, 0, R.spin * 0.2); ring.quaternion.setFromEuler(e);
      } else if (flying) { e.set(-Math.PI / 2, 0, R.spin * 1.4); ring.quaternion.setFromEuler(e); }
      else if (guardAmt > 0.02) {
        // the shield faces where the eye looks
        q.setFromUnitVectors(Z, V3.set(Math.sin(c.faceYaw), 0, Math.cos(c.faceYaw))); ring.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(Z, R.spin));
      } else {
        // held: upright beside the shoulder, its face half to the side and half back toward the eye, turning about its own middle
        q.setFromAxisAngle(up, body.yaw + Math.PI / 2 + 0.85); ring.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(Z, R.spin * 0.6));
      }
      // ---- the bell, when it is in hand: hanging at the shoulder, mouth down; it shivers as its tone builds, swings when struck
      const bellIn = c.weapon === 'bell', Bl = c.bell;
      bell.visible = bellIn && guardAmt < 0.5 && !fallen;
      if (bell.visible) {
        const ringing = Bl.mode === 'ringing';
        swingV += -swing * 60 * dt - swingV * 5 * dt; swing += swingV * dt;
        shiver += ((ringing ? 0.2 + 0.8 * Bl.power : 0) - shiver) * (1 - Math.exp(-12 * dt));
        bell.position.set(R.p[0], R.p[1] + 0.05, R.p[2]);
        q.setFromAxisAngle(up, body.yaw); bell.quaternion.copy(q);
        bellBody.rotation.set(swing * 0.35 + Math.sin(time.value * 61) * 0.05 * shiver, 0, Math.sin(time.value * 47) * 0.05 * shiver);
        clapper.position.z = Math.sin(swing) * 0.05;
        bellGlowMat.opacity = 0.3 + 0.7 * shiver; bellGlow.scale.setScalar(0.25 + 0.5 * shiver);
        // as the tone builds, the water round the body ripples in rings
        if (ringing && (bellDrop -= dt) <= 0) {
          bellDrop = 0.13; const rr = 1.1 + 1.4 * Bl.power;
          for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + time.value; dropFn?.(body.p[0] + Math.cos(a) * rr, body.p[2] + Math.sin(a) * rr, 0.03 + 0.05 * Bl.power); }
        }
      }
      // the tones going out: rings over the water, wider and fainter, the water ringing under them as they pass
      for (let i = 0; i < TONES; i++) {
        const T = c.tones[i], m = toneMeshes[i];
        m.visible = !!T;
        if (!T) continue;
        const u = T.r / T.R;
        m.position.set(T.at[0], T.at[1], T.at[2]); m.scale.setScalar(Math.max(0.05, T.r));
        m.material.opacity = (1 - u) * (0.45 + 0.4 * T.power);
        const band = Math.floor(T.r / 1.6);
        if (band !== T.drawn) { T.drawn = band; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + band; dropFn?.(T.at[0] + Math.cos(a) * T.r, T.at[2] + Math.sin(a) * T.r, 0.05 * (1 - u)); } }
      }
      // ---- the bow, when it is in hand (the ring comes back for the guard, and while it is still coming home)
      const bowIn = c.weapon === 'bow', W = c.bow;
      ring.visible = glow.visible = (!bowIn && !bellIn) || flying || guardAmt > 0.02;
      bow.visible = bowIn && guardAmt < 0.5 && !fallen;
      if (bow.visible) {
        const hand = R.p, drawing = W.mode === 'drawing';
        drawAmt += ((drawing ? 0.15 + 0.85 * W.draw : 0) - drawAmt) * (1 - Math.exp(-14 * dt));
        string(drawAmt); nocked.visible = drawing; bowGlowMat.opacity = drawing ? 0.35 + 0.6 * W.draw : 0;
        bowGlow.scale.setScalar(0.25 + 0.5 * W.draw);
        if (drawing) {
          // turned to where the eye looks, its forward along the eye's line, its limbs canted a little to the right across
          // it (as many archers hold it; upright, from behind, it is only a line)
          const f = camera.getWorldDirection(V3), up0 = new THREE.Vector3(0, 1, 0).addScaledVector(f, -f.y).normalize();
          const side = new THREE.Vector3().crossVectors(f, up0), cant = 0.6, upv = up0.clone().multiplyScalar(Math.cos(cant)).addScaledVector(side, -Math.sin(cant)).normalize();
          const zz = new THREE.Vector3().crossVectors(f, upv);
          bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, upv, zz));
          bow.position.set(hand[0] + f.x * 0.22, hand[1], hand[2] + f.z * 0.22);
        } else {
          // held: upright beside the shoulder, its back turned outward (so its curve is seen from behind), swaying a little
          q.setFromAxisAngle(up, body.yaw + Math.PI); bow.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(Z, 0.05 * Math.sin(time.value * 1.3)));
          bow.position.set(hand[0], hand[1] - 0.05, hand[2]);
        }
      }
      const grow = 1 + 0.95 * guardAmt;
      ring.scale.setScalar(grow);
      skinU.uAmt.value = guardAmt;
      plasmaU.uGlow.value = 1.25 + 1.6 * held + (flying ? 0.6 : 0) + 0.6 * guardAmt;
      glow.position.copy(ring.position);
      glow.scale.setScalar((0.6 + 1.1 * held + (flying ? 0.3 : 0)) * (1 + 0.5 * guardAmt));
      glowMat.opacity = (0.45 + 0.45 * held) * (1 - 0.8 * guardAmt) * (fallen ? 0.4 : 1);
      // the trail: where it has been while it flies
      if (R.mode === 'whirl') {
        // the circle it is going round, drawn behind it as far as it has gone (a frame's step is half a radian of it)
        const a = R.yaw0 + Math.PI * 4 * Math.min(1, R.t / RING.whirl.time), back = Math.min(3.4, Math.PI * 4 * Math.min(1, R.t / RING.whirl.time));
        trailPts.length = 0;
        for (let i = 0; i < TRAIL; i++) { const ai = a - (back * i) / (TRAIL - 1); trailPts.push([body.p[0] + Math.sin(ai) * 1.6, body.p[1] + 1.05, body.p[2] + Math.cos(ai) * 1.6]); }
      } else if (flying) { trailPts.unshift([R.p[0], R.p[1], R.p[2]]); if (trailPts.length > TRAIL) trailPts.pop(); } else if (trailPts.length) trailPts.splice(Math.max(1, trailPts.length - 3));
      const camPos = camera.position;
      for (let i = 0; i < TRAIL; i++) {
        const p = trailPts[Math.min(i, trailPts.length - 1)] || [R.p[0], R.p[1], R.p[2]], n = trailPts[Math.min(i + 1, trailPts.length - 1)] || p;
        // the ribbon's width turned across the eye's line
        const tx = p[0] - n[0], ty = p[1] - n[1], tz = p[2] - n[2], vx = camPos.x - p[0], vy = camPos.y - p[1], vz = camPos.z - p[2];
        let wx = ty * vz - tz * vy, wy = tz * vx - tx * vz, wz = tx * vy - ty * vx; const wm = Math.hypot(wx, wy, wz) || 1, w = 0.075 * (1 - i / TRAIL);
        wx *= w / wm; wy *= w / wm; wz *= w / wm;
        trailPos.set([p[0] + wx, p[1] + wy, p[2] + wz, p[0] - wx, p[1] - wy, p[2] - wz], i * 6);
        const a = trailPts.length > 1 && i < trailPts.length ? (1 - i / TRAIL) : 0; trailA[i * 2] = trailA[i * 2 + 1] = a;
      }
      trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.aA.needsUpdate = true;
      trail.visible = trailPts.length > 1;
      // ---- the binding's thread: to the bot it holds, or out along the eye's line and back when there was nothing to take
      const Bd = c.bind, holdBot = Bd.mode === 'hold' ? c.bots.find((b) => b.id === Bd.target) : null;
      let to = null;
      if (holdBot) to = holdBot.p;
      else if (Bd.miss > 0) {
        const hf = leftHandOf(body), ext = Math.sin(Math.PI * (1 - Bd.miss / BINDING.miss)) * 9;
        to = [hf[0] + Bd.missDir[0] * ext, hf[1] + Bd.missDir[1] * ext, hf[2] + Bd.missDir[2] * ext];
      }
      thread.visible = !!to && c.player.down <= 0;
      if (thread.visible) {
        const from = leftHandOf(body), T = time.value, L = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        for (let i = 0; i < BN; i++) {
          const u = i / (BN - 1), sway = Math.sin(Math.PI * u) * Math.min(0.35, L * 0.03);
          const p = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u + sway * Math.sin(u * 9 - T * 7), from[2] + (to[2] - from[2]) * u];
          const n = i < BN - 1 ? [from[0] + (to[0] - from[0]) * (u + 1 / (BN - 1)), from[1] + (to[1] - from[1]) * (u + 1 / (BN - 1)), from[2] + (to[2] - from[2]) * (u + 1 / (BN - 1))] : [to[0] + (to[0] - from[0]) * 0.01, to[1], to[2] + (to[2] - from[2]) * 0.01];
          const tx = n[0] - p[0], ty = n[1] - p[1], tz = n[2] - p[2], vx = camPos.x - p[0], vy = camPos.y - p[1], vz = camPos.z - p[2];
          let wx = ty * vz - tz * vy, wy = tz * vx - tx * vz, wz = tx * vy - ty * vx; const wm = Math.hypot(wx, wy, wz) || 1, w = 0.02 + 0.018 * Math.sin(Math.PI * u);
          wx *= w / wm; wy *= w / wm; wz *= w / wm;
          bindPos.set([p[0] + wx, p[1] + wy, p[2] + wz, p[0] - wx, p[1] - wy, p[2] - wz], i * 6);
          const a = (0.55 + 0.45 * Math.max(0, Math.sin(u * 14 + T * 12))) * (holdBot ? 1 : 0.7); bindA[i * 2] = bindA[i * 2 + 1] = a;
        }
        bindGeo.attributes.position.needsUpdate = true; bindGeo.attributes.aA.needsUpdate = true;
      }
      bindHalo.visible = !!holdBot;
      if (holdBot) { bindHalo.position.set(holdBot.p[0], holdBot.p[1], holdBot.p[2]); bindHalo.scale.setScalar((holdBot.r * 3.2) * (1 + 0.08 * Math.sin(time.value * 9))); }

      // ---- bots
      const seen = new Set();
      for (const b of c.bots) {
        let d = drawn.get(b.id);
        if (!d) { d = makeBot(b); drawn.set(b.id, d); }
        seen.add(b.id);
        d.g.position.set(b.p[0], b.p[1], b.p[2]);
        const face = Math.atan2(body.p[0] - b.p[0], body.p[2] - b.p[2]);
        d.body.rotation.set(Math.sin(b.t * 1.7 + b.phase) * 0.08 - b.v[1] * 0.04, face, Math.sin(b.t * 1.1) * 0.06 - (b.v[0] * Math.cos(face) - b.v[2] * Math.sin(face)) * 0.03);
        if (b.mode === 'bound') { d.body.rotation.x += Math.sin(b.t * 29) * 0.14; d.body.rotation.z += Math.sin(b.t * 23 + 1) * 0.12; }   // it struggles in the binding
        else if (b.mode === 'flung' || b.mode === 'tumble') d.body.rotation.set(b.t * 9, face + b.t * 5, b.t * 7);                     // thrown, it spins
        d.fins.rotation.z = b.t * 2.4;
        const flash = b.hitT > 0 ? b.hitT / 0.16 : 0;
        d.shellMat.emissive.setRGB(flash, flash, flash * 0.95);
        d.hover.position.set(0, -b.r * 0.95, 0); d.hover.material.opacity = 0.6 + 0.4 * Math.sin(b.t * 13 + b.phase) ** 2;
        V3.set(Math.sin(face), 0, Math.cos(face)).multiplyScalar(b.r * 0.98); d.eyeGlow.position.copy(V3);
        d.bar.visible = b.hp < b.max && b.mode !== 'rise';
        if (d.bar.visible) { d.bar.position.set(0, b.r + 0.32, 0); d.bar.quaternion.copy(camera.quaternion); d.barU.uFill.value = Math.max(0, b.hp / b.max); d.bar.scale.set(0.9 + b.r, 1, 1); }
        // a low hover stirs the water under it
        d.drop -= dt;
        if (b.p[1] < 2.2 && d.drop <= 0 && b.mode === 'fight') { d.drop = 0.35; dropFn?.(b.p[0], b.p[2], 0.035 * (2.2 - b.p[1])); }
      }
      for (const [id, d] of drawn) if (!seen.has(id)) { unmake(d); drawn.delete(id); }
      // ---- debris: falling, then floating a moment and sinking away
      for (let i = debris.length - 1; i >= 0; i--) {
        const p = debris[i]; p.t += dt;
        if (!p.wet) {
          p.v[1] -= 9.81 * dt; p.m.position.x += p.v[0] * dt; p.m.position.y += p.v[1] * dt; p.m.position.z += p.v[2] * dt;
          p.m.rotation.x += p.spin[0] * dt; p.m.rotation.y += p.spin[1] * dt; p.m.rotation.z += p.spin[2] * dt;
          if (p.m.position.y < WATER) { p.wet = true; dropFn?.(p.m.position.x, p.m.position.z, 0.12); }
        } else p.m.position.y -= dt * 0.15;
        if (p.t > 3.5) { root.remove(p.m); debris.splice(i, 1); }
      }
      // ---- bolts
      let nb = 0;
      for (const x of c.bolts) {
        if (nb >= NB) break;
        const col = x.owner === 'bot' ? levelCol(x.level) : PLASMA;
        V3.set(x.v[0], x.v[1], x.v[2]); const s = V3.length() || 1; Q.setFromUnitVectors(Z, V3.multiplyScalar(1 / s));
        const arrow = x.kind === 'arrow';
        M.compose(V3.set(x.p[0], x.p[1], x.p[2]), Q, arrow ? S.set(0.045, 0.045, 0.9) : S.set(0.08, 0.08, 0.48)); core.setMatrixAt(nb, M); core.setColorAt(nb, col);
        M.compose(V3, Q, arrow ? S.set(0.16, 0.16, 1.35) : S.set(0.24, 0.24, 0.85)); halo.setMatrixAt(nb, M); halo.setColorAt(nb, col);
        nb++;
      }
      core.count = halo.count = nb;
      for (const m of [core, halo]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      // ---- sparks
      for (let i = 0; i < NS; i++) {
        const s = sl[i];
        if (s.life > 0) { s.life -= dt; s.v[1] -= 6 * dt; s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt; }
        const k = Math.max(0, s.life / s.max);
        sp.set(s.life > 0 ? s.p : [0, -99, 0], i * 3); sc.set([s.c[0] * k, s.c[1] * k, s.c[2] * k], i * 3);
      }
      sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
      // ---- waves
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]; w.t += dt;
        const u = Math.min(1, w.t / 0.45); w.m.scale.setScalar(0.3 + w.radius * (1 - (1 - u) ** 3)); w.m.material.opacity = (1 - u) ** 1.5;
        if (u >= 1) { root.remove(w.m); w.m.material.dispose(); waves.splice(i, 1); }
      }
    },
    // the water's rings, from void.js (for the hover's stir and the debris falling in)
    setDrop(fn) { dropFn = fn; },
    shift(dx, dz) {
      for (const p of trailPts) { p[0] -= dx; p[2] -= dz; }
      for (const p of debris) { p.m.position.x -= dx; p.m.position.z -= dz; }
      for (const s of sl) { s.p[0] -= dx; s.p[2] -= dz; }
      for (const w of waves) { w.m.position.x -= dx; w.m.position.z -= dz; }
    },
    dispose() {
      scene.remove(root);
      for (const d of drawn.values()) unmake(d);
      for (const w of waves) w.m.material.dispose();
      for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); tex.dispose();
    },
  };
}
