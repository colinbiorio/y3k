// light.js — THE LIGHT: the orb's own kin, a body of light.
//
// The fifth of the five kinds (../kinds.js); its five choices are core, veil,
// colour, mood and wake. It has the outline of a person and none of the
// weight. It does not stand: it hangs a hand's width over the water with its
// feet pointed down, and it goes by leaning the way it means to go. Nothing
// of it is lit by the void. It is seen by its own light, which is brightest
// where its surface turns away from the eye, and what is behind it shows
// through.
//
// Its mood is the orb's (calm, thinking, listening, excited, tender): how it
// holds itself and how its light beats. Its wake is what it leaves where it
// has been. It does not touch the water, so the water does not ring under it
// unless rings are its wake.
//
// The picture it was drawn from is ../art/v1/light.webp. Ancient: a veiled
// figure. Now: the cut of the veil. To come: a body with nothing in it but
// light.
import * as THREE from 'three';
import { AURA } from '../kinds.js';
import { WATER } from '../body.js';
import { stateOf } from '../gait.js';
import { loft, limb, ball, hoop, placed, kit, tube, pipe, on, cloth, stuff, shade } from '../shape.js';
import { bodyOf, node, capsules, carried } from './common.js';

const PI = Math.PI, TAU = 2 * PI, sat = (x) => Math.min(1, Math.max(0, x)), smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// how high its hips hang (its toes a hand's width over the water), and its lengths
const HIP = 1.04, THIGH = 0.42, SHIN = 0.4, FOOT = 0.15, UPPER = 0.27, FORE = 0.25, NECK = 0.565;
// its sections, from the hips up: [y, w, d | [front, back], z]
const TORSO = [[0, 0.126, [0.086, 0.098]], [0.1, 0.114, [0.08, 0.084]], [0.2, 0.096, [0.07, 0.068]], [0.33, 0.132, [0.094, 0.082]], [0.44, 0.156, [0.084, 0.08], -0.006], [0.49, 0.09, [0.06, 0.064], -0.008], [0.53, 0.046, 0.046, -0.008], [0.6, 0.04, 0.04, -0.004]];
const HEAD = [[0, 0.04, [0.05, 0.045], 0.008], [0.05, 0.072, [0.084, 0.078], 0.006], [0.11, 0.083, [0.093, 0.092]], [0.17, 0.078, [0.088, 0.092], -0.004], [0.21, 0.05, [0.06, 0.066], -0.006]];
// the hood of its shroud: from the shoulders up over the head, open in front
const HOOD = [[0.455, 0.19, [0.1, 0.118], -0.006], [0.54, 0.12, [0.1, 0.108], -0.004], [0.64, 0.108, [0.122, 0.128]], [0.74, 0.102, [0.118, 0.126], -0.004], [0.8, 0.066, [0.08, 0.09], -0.012]];

// How each mood is held and how its light beats: `pulse` in beats a second; `bob` [how far, beats a
// second]; `gain` how bright; `head` [bowed, cocked]; its arms `out` from its sides and `fwd`, its elbows
// bent (`bend`) and turned in (`inw`).
const MOODS = {
  calm: { pulse: 0.5, bob: [0.012, 0.4], gain: 1, head: [0, 0], out: 0.2, fwd: 0, bend: 0.14, inw: 0 },
  thinking: { pulse: 0.35, bob: [0.008, 0.3], gain: 0.94, head: [0.32, 0.05], out: 0.15, fwd: 0, bend: 0.2, inw: 0, motes: true, spin: 3.2 },
  listening: { pulse: 0.5, bob: [0.01, 0.35], gain: 1, head: [-0.05, 0.24], out: 0.2, fwd: 0, bend: 0.14, inw: 0, hand: true, band: true },
  excited: { pulse: 2.2, bob: [0.035, 1.1], gain: 1.3, head: [-0.14, 0], out: 2.05, fwd: 0, bend: 0.25, inw: 0 },
  tender: { pulse: 0.33, bob: [0.01, 0.3], gain: 1.06, head: [0.2, 0], out: 0.1, fwd: -0.05, bend: 2.35, inw: 0.62, warm: 0.6 },
};

// What it is made of: light that is thin where the eye looks straight through it and gathers at its
// edges, with a little of the rainbow there. `sweep` is a band of it going up the body (-1: none);
// `lines` are the bright threads that run down its cloth.
const VERT = `varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = mat3(modelMatrix) * normal; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `uniform vec3 inner; uniform vec3 rim; uniform float base; uniform float power; uniform float gain; uniform float prism; uniform float sweep; uniform float foot; uniform float lines;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), power);
  vec3 c = mix(inner, rim, f) + prism * f * 0.5 * cos(6.2832 * (1.4 * f + 0.9 * vW.y + vec3(0.0, 0.33, 0.67)));
  float band = sweep < 0.0 ? 0.0 : exp(-pow((vW.y - foot - 2.0 * sweep) / 0.09, 2.0));
  float line = lines * pow(0.5 + 0.5 * cos(31.416 * vUv.x), 14.0);
  float a = (base + (1.0 - base) * f) * gain + 0.35 * band + 0.45 * line;
  #ifdef FADE
  a *= smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  #endif
  gl_FragColor = vec4(mix(c, rim, max(0.6 * line, 0.5 * band)), clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;
const lumen = (inner, rim, { base = 0.3, power = 2.2, prism = 0.1, lines = 0, fade = false } = {}) => new THREE.ShaderMaterial({
  uniforms: { inner: { value: new THREE.Color(inner) }, rim: { value: new THREE.Color(rim) }, base: { value: base }, power: { value: power }, gain: { value: 1 }, prism: { value: prism }, sweep: { value: -1 }, foot: { value: 0 }, lines: { value: lines } },
  vertexShader: VERT, fragmentShader: FRAG, defines: fade ? { FADE: 1 } : {}, transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
// the air round what glows in it: thick in the middle and gone at its edge (it is seen on a pale sky too)
const GLOW = `uniform vec3 rim; uniform float base; uniform float power; uniform float gain;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() {
  gl_FragColor = vec4(rim, base * gain * pow(abs(dot(normalize(vN), normalize(cameraPosition - vW))), power));
  #include <colorspace_fragment>
}`;
const aura = (color, base = 0.55, power = 2.4) => new THREE.ShaderMaterial({
  uniforms: { rim: { value: new THREE.Color(color) }, base: { value: base }, power: { value: power }, gain: { value: 1 } },
  vertexShader: VERT, fragmentShader: GLOW, transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
// a soft round dot, for its motes
function spark() {
  const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = c.height = 64;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createLight(look, { lite = false } = {}) {
  const S = stuff(lite), K = kit(), felt = capsules(1), held = carried(), cloths = [], mine = [];
  const [inner, second] = AURA[look.colour] || AURA.stardust, mood = MOODS[look.mood] || MOODS.calm, veil = look.veil, wake = look.wake;
  const group = new THREE.Group(), rig = node(group), tilt = node(rig, [0, HIP, 0]), form = node(tilt), head = node(form, [0, NECK, 0]);
  const M = { body: lumen(inner, second), veil: lumen(inner, second, { base: 0.16, power: 1.6, prism: 0.22, lines: 1 }), core: S.glow(shade(inner, 0.6)), bright: S.glow(second), air: aura(second, 0.42, 1.8) };
  const lit = [M.body, M.veil], c0 = new THREE.Color(inner), c1 = new THREE.Color(second);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ── the outline of a person
  K.put(form, M.body, loft(TORSO, { seg: 20, sub: 3, cap: [0, 1] }));
  K.put(head, M.body, loft(HEAD, { seg: 18, sub: 3 }));
  const arms = [1, -1].map((sd) => {
    const sh = node(form, [sd * 0.168, 0.452, -0.004]), el = node(sh, [0, -UPPER, 0]);
    K.put(sh, M.body, limb(UPPER, [[0, 0.047], [0.5, 0.04], [1, 0.033]], { cap: [0, 1] }));              // open where two meet: no joint shows in it
    K.put(el, M.body, limb(FORE + 0.09, [[0, 0.033], [0.4, 0.03], [0.72, 0.021], [0.86, 0.027, 0.015], [1, 0.01, 0.007]], { cap: [1, 0] }));
    felt.capsule(sh, [0, 0, 0], el, [0, 0, 0], 0.056); felt.capsule(el, [0, 0, 0], el, [0, -FORE - 0.06, 0], 0.045);
    return { sd, sh, el };
  });
  const legs = [1, -1].map((sd) => {
    const hip = node(form, [sd * 0.064, 0, 0]), knee = node(hip, [0, -THIGH, 0]), ankle = node(knee, [0, -SHIN, 0]);
    K.put(hip, M.body, limb(THIGH, [[0, 0.072], [0.5, 0.062], [1, 0.045]], { cap: [0, 0] }));
    K.put(knee, M.body, limb(SHIN, [[0, 0.045], [0.3, 0.048], [1, 0.027]], { cap: [0, 0] }));
    K.put(ankle, M.body, limb(FOOT, [[0, 0.027, 0.03], [0.5, 0.03, 0.021], [1, 0.011, 0.009]], { cap: [1, 0] }));
    ankle.rotation.x = -0.35;                                          // its toes point down, and a little ahead
    felt.capsule(hip, [0, 0, 0], knee, [0, 0, 0], 0.085); felt.capsule(knee, [0, 0, 0], ankle, [0, 0, 0], 0.06);
    return { sd, hip, knee, ankle };
  });
  felt.capsule(form, [0, 0.04, 0], form, [0, 0.4, 0], 0.125); felt.capsule(arms[0].sh, [0, 0, 0], arms[1].sh, [0, 0, 0], 0.07); felt.capsule(head, [0, 0.1, 0], head, [0, 0.11, 0], 0.105);

  // ── its core: what the orb is, in its chest
  const core = node(form, [0, 0.36, 0.03]), turns = !['sphere', 'heart'].includes(look.core);
  if (look.core === 'ring') K.put(core, M.core, placed(hoop(0.046, 0.0085, [1, 1], 30), [0, 0, 0], [PI / 2, 0, 0]));
  else if (look.core === 'heart') {
    for (const sd of [1, -1]) K.put(core, M.core, placed(ball([0.026, 0.026, 0.018], 12), [sd * 0.021, 0.014, 0]));
    K.put(core, M.core, loft([[-0.056, 0.002, 0.004], [-0.036, 0.019, 0.011], [-0.01, 0.04, 0.017], [0.014, 0.046, 0.018]], { seg: 14, cap: [1, 0.3] }));
  } else if (look.core === 'knot') K.put(core, M.core, new THREE.TorusKnotGeometry(0.034, 0.0085, 64, 8, 2, 3));
  else if (look.core === 'helix') {
    for (const ph of [0, PI]) K.put(core, M.core, pipe(Array.from({ length: 25 }, (_, i) => { const a = ph + (i / 24) * TAU * 1.5; return [0.027 * Math.cos(a), -0.058 + 0.116 * i / 24, 0.027 * Math.sin(a)]; }), { seg: 6, radius: () => 0.007 }));
  } else K.put(core, M.core, ball([0.038, 0.038, 0.038], 16));
  K.put(core, M.air, ball([0.09, 0.09, 0.09], 16));

  // ── its veil
  const hang = (c, stiff, free = false, mat = M.veil) => { K.own(group, c.geo, mat, { cull: false }); cloths.push({ cloth: c, stiff, free }); };
  if (veil === 'shroud') {
    // a hood, a mantle from it over the shoulders and down the back to the calves, open in front, and a
    // panel at each side cut to a point
    const g = 0.78, g2 = 0.95, n = 17, hood = on(HOOD), y0 = HOOD[0][0], ths = Array.from({ length: n }, (_, c) => PI / 2 + g2 + (TAU - 2 * g2) * c / (n - 1));
    K.put(form, M.veil, loft(HOOD, { seg: 22, sub: 3, cap: [0, 0.7], arc: [PI / 2 + g, 2.5 * PI - g] }));
    hang(cloth({ anchor: form, cols: n, rows: 12, len: 0.105, gravity: 5, top: ths.map((th) => hood(y0, th)), dir: (c, r) => { const th = ths[c], k = r <= 3 ? 0.3 : 0.08; return [k * Math.cos(th), -1, k * Math.sin(th) - 0.05]; } }), 0.1);
    for (const sd of [1, -1]) {
      const m = 7, rows = 13, len = 0.105, top = Array.from({ length: m }, (_, i) => hood(y0, (sd > 0 ? 0 : PI) + (i - 3) * 0.3, 0.012)), w = Math.hypot(top[1][0] - top[0][0], top[1][2] - top[0][2]);
      hang(cloth({ anchor: form, cols: m, rows, len, gravity: 5, top, dir: (i) => [sd * 0.16, -1, -sd * (i - 3) * w / (rows * len)] }), 0.1);
    }
  } else if (veil === 'ribbons') {
    // six of them from its shoulders, let go behind it
    const skin = on(TORSO), band = lumen(inner, second, { base: 0.34, power: 1.2, prism: 0.3 });
    lit.push(band);
    for (let i = 0; i < 6; i++) {
      const th = -PI / 2 + (i - 2.5) * 0.52;
      hang(cloth({ anchor: form, cols: 2, rows: 14, len: 0.09, gravity: 3, top: [skin(0.44, th - 0.2, 0.004), skin(0.44, th + 0.2, 0.004)], dir: () => [0.35 * Math.cos(th), -1, 0.35 * Math.sin(th) - 0.2] }), 0.05, true, band);
    }
  } else if (veil === 'wings') {
    // one from each arm, which it holds out: cut to fan
    for (const a of arms) {
      const m = 6;
      hang(cloth({ anchor: a.sh, cols: m, rows: 10, len: 0.085, gravity: 4, top: Array.from({ length: m }, (_, i) => [0, -UPPER * i / (m - 1), -0.03]), dir: (i) => [-a.sd * 0.78, -0.62 - 0.5 * i / (m - 1), -0.2] }), 0.1);
    }
  } else if (veil === 'pillar') {
    // no cloth: it stands in a column of its own light, which does not lean with it
    const g = new THREE.CylinderGeometry(0.33, 0.36, 2.2, 36, 1, true), m = lumen(inner, second, { base: 0.05, power: 1.5, prism: 0.12, fade: true });
    g.translate(0, 1.08, 0); K.own(rig, g, m); lit.push(m);
  } else if (veil === 'halo') {
    // bare, with a ring standing behind its head
    K.put(head, M.bright, placed(hoop(0.17, 0.0055, [1, 1], 40), [0, 0.11, -0.07], [PI / 2, 0, 0]));
    K.put(head, M.air, placed(new THREE.CircleGeometry(0.17, 32), [0, 0.11, -0.072]));
  }
  // thinking: three motes go round its head
  const orbit = mood.motes ? node(form, [0, NECK + 0.14, 0]) : null;
  if (orbit) for (let i = 0; i < 3; i++) { const a = i * TAU / 3; K.put(orbit, M.bright, placed(ball([0.012, 0.012, 0.012], 8), [0.16 * Math.cos(a), 0.03 * Math.sin(2 * a + 1), 0.16 * Math.sin(a)])); }

  // ── what it leaves where it has been. All of it is in the world's numbers, and goes with the origin.
  const shifted = (P, n, step = 3) => held.world.push({ shift(dx, dy, dz) { for (let i = 0; i < n; i++) { P[i * step] += dx; P[i * step + 1] += dy; P[i * step + 2] += dz; } } });
  let motes = null, thread = null, echo = null, t = 0;
  if (wake === 'motes') {
    // sparks of it left in the air, which rise a little and go out
    const n = 80, LIFE = 1.7, pos = new Float32Array(n * 3), col = new Float32Array(n * 4), vel = new Float32Array(n * 3), age = new Float32Array(n).fill(LIFE), geo = new THREE.BufferGeometry(), dot = spark();
    for (let i = 0; i < n; i++) { col[i * 4] = c1.r; col[i * 4 + 1] = c1.g; col[i * 4 + 2] = c1.b; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(geo, K.mat(new THREE.PointsMaterial({ size: 0.095, map: dot, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false })));
    pts.frustumCulled = false; group.add(pts); mine.push(geo, dot); shifted(pos, n);
    let next = 0, due = 0;
    motes = (dt, hv) => {
      const e = form.matrixWorld.elements;
      for (due += dt * Math.min(46, 6 + 8 * hv); due >= 1; due -= 1) {
        const o = (next++ % n) * 3, x = 0.3 * (rnd() - 0.5), y = -0.85 + 1.6 * rnd(), z = 0.18 * (rnd() - 0.5);
        pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        vel[o] = 0.08 * (rnd() - 0.5); vel[o + 1] = 0.05 + 0.12 * rnd(); vel[o + 2] = 0.08 * (rnd() - 0.5); age[o / 3] = 0;
      }
      for (let i = 0; i < n; i++) {
        if (age[i] >= LIFE) { col[i * 4 + 3] = 0; continue; }
        age[i] += dt; for (let q = 0; q < 3; q++) pos[i * 3 + q] += vel[i * 3 + q] * dt;
        const u = Math.min(1, age[i] / LIFE); col[i * 4 + 3] = 0.95 * Math.min(1, 8 * u) * (1 - u) ** 1.5;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    };
  } else if (wake === 'thread') {
    // a line of it paid out from between its shoulders, that sinks and lies on the water where it went
    const n = 40, gap = 0.12, low = WATER + 0.012, P = new Float32Array(n * 3), line = tube(n, { seg: 5, radius: (u) => 0.0008 + 0.0075 * (1 - u) ** 0.6 });
    K.own(group, line.geo, M.bright, { cull: false }); shifted(P, n);
    let laid = false;
    thread = (dt) => {
      const e = form.matrixWorld.elements, x = e[4] * 0.36 - e[8] * 0.1 + e[12], y = e[5] * 0.36 - e[9] * 0.1 + e[13], z = e[6] * 0.36 - e[10] * 0.1 + e[14];
      if (!laid) { for (let i = 0; i < n; i++) { P[i * 3] = x - e[8] * 0.02 * i; P[i * 3 + 1] = Math.max(low, y - 0.98 * gap * i); P[i * 3 + 2] = z - e[10] * 0.02 * i; } laid = true; }
      P[0] = x; P[1] = y; P[2] = z;
      for (let o = 3; o < n * 3; o += 3) {
        P[o + 1] = Math.max(low, P[o + 1] - 2.2 * dt);
        const dx = P[o] - P[o - 3], dy = P[o + 1] - P[o - 2], dz = P[o + 2] - P[o - 1], d = Math.hypot(dx, dy, dz);
        if (d > gap) { const k = gap / d; P[o] = P[o - 3] + dx * k; P[o + 1] = Math.max(low, P[o - 2] + dy * k); P[o + 2] = P[o - 1] + dz * k; }
      }
      line.set(P, [0, 1, 0]);
    };
  }
  // echo: three fainter selves where it was a moment ago (made once it is built: they are made of it)
  function echoes() {
    const past = [], ghosts = [0.55, 0.36, 0.2].map((gain, i) => {
      const m = K.mat(lumen(inner, second, { base: 0.04, power: 2.4, prism: 0.14 })), r = node(group), tl = tilt.clone(true);
      m.uniforms.gain.value = gain; r.add(tl); r.visible = false; tl.traverse((o) => { if (o.isMesh) o.material = m; });
      return { r, tl, wait: 0.1 * (i + 1) };
    });
    held.world.push({ shift(dx, dy, dz) { for (const h of past) { h[1] += dx; h[2] += dy; h[3] += dz; } } });
    return (dt, at, yaw) => {
      if (dt > 0) past.push([t, at[0], at[1], at[2], yaw, tilt.position.y, tilt.rotation.x, tilt.rotation.z]);
      while (past.length > 2 && past[1][0] < t - 0.4) past.shift();
      for (const g of ghosts) {
        let h = null; for (let i = past.length - 1; i >= 0 && !h; i--) if (past[i][0] <= t - g.wait) h = past[i];
        g.r.visible = !!h && Math.hypot(h[1] - at[0], h[2] - at[1], h[3] - at[2]) > 0.04;
        if (h) { g.r.position.set(h[1], h[2], h[3]); g.r.rotation.y = h[4]; g.tl.position.y = h[5]; g.tl.rotation.set(h[6], 0, h[7]); }
      }
    };
  }

  // ── how it carries itself
  // its limbs: `fl` how fast it goes (0..1), `fall` how fast it falls (0..1), `lf` how far it leans ahead
  function carry(fl, fall, lf) {
    const out = (veil === 'wings' ? Math.max(mood.out, 0.95) : mood.out) + 0.45 * fall, back = 0.5 * fl * Math.cos(out);
    for (const a of arms) {
      const hand = mood.hand && a.sd > 0 ? 1 : 0;                      // listening: one hand a little raised
      a.sh.rotation.set(mood.fwd - 0.3 * hand + back, 0, a.sd * out);
      a.el.rotation.set(-(mood.bend + 1.15 * hand) * (1 - 0.5 * fl), 0, -a.sd * mood.inw);
    }
    for (const l of legs) {
      const fore = l.sd > 0 ? 1 - fl : 0;                              // at rest one knee is a little ahead of the other
      l.hip.rotation.x = 0.18 * fl - 0.07 * fore; l.knee.rotation.x = 0.07 + 0.12 * fore + 0.3 * fl + 0.25 * fall;
    }
    head.rotation.set(mood.head[0] - 0.55 * lf, 0, mood.head[1]);
  }
  const pose = { falls: [], speed: 0, state: 'ground' };
  let lean = 0, bank = 0, dip = 0, flow = 0, was = null, beat = 0, gone = 0, fw = 1, sw = 0;
  const self = {
    group, scale: 1, shade: 0.3, world: held.world, capsule: felt.capsule, shapes: felt.shapes,
    // a landing: it dips, and comes back up
    land(speed) { dip = Math.min(0.2, Math.max(dip, 0.03 * speed)); },
    // One frame: how it leans and hangs, how its light beats, and what it leaves. Answers the pose, with
    // `falls`: where the water should ring under it ([x, z]), which is nowhere unless rings are its wake.
    step(b, dt, at) {
      held.moved(at, dt);
      t += dt; beat += dt * TAU * mood.pulse;
      const st = stateOf(b), hv = Math.hypot(b.v[0], b.v[2]), k = (r) => 1 - Math.exp(-r * dt), cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      if (hv > 0.05) { fw = (b.v[0] * sn + b.v[2] * cs) / hv; sw = (b.v[0] * cs - b.v[2] * sn) / hv; }
      dip *= Math.exp(-8 * dt);
      lean += ((st === 'fly' ? 1.2 * smooth(2, 13, hv) : st === 'dash' ? 0.9 : st === 'air' ? 0.08 + 0.02 * hv : Math.min(0.42, 0.055 * hv)) - lean) * k(st === 'dash' ? 18 : 7);
      flow += (sat(hv / 8) - flow) * k(6);
      if (was !== null && dt > 0) { let d = b.yaw - was; d -= TAU * Math.round(d / TAU); bank += (Math.min(0.32, Math.max(-0.32, (d / dt) * hv * 0.045)) - bank) * k(7); }
      was = b.yaw;
      const pulse = Math.sin(beat), fall = st === 'air' ? sat(-b.v[1] / 7) : 0;
      rig.position.set(at[0], at[1], at[2]); rig.rotation.y = b.yaw;
      tilt.position.y = HIP - dip + mood.bob[0] * Math.sin(TAU * mood.bob[1] * t) * (1 - 0.6 * flow);
      tilt.rotation.set(lean * fw, 0, -bank - lean * sw);                 // it leans the way it goes, whichever way it faces
      carry(flow, fall, lean * Math.max(0, fw));
      core.scale.setScalar(1 + 0.1 * pulse); if (turns) core.rotation.y = (mood.spin || 1.1) * t;
      if (orbit) orbit.rotation.y = 1.6 * t;
      const gain = mood.gain * (1 + 0.07 * pulse), sweep = mood.band ? (0.4 * t) % 1.6 : -1;
      for (const m of lit) { m.uniforms.gain.value = gain; m.uniforms.sweep.value = sweep; m.uniforms.foot.value = at[1]; }
      if (mood.warm) M.body.uniforms.inner.value.copy(c0).lerp(c1, mood.warm * (0.5 + 0.5 * pulse));
      rig.updateMatrixWorld(true);

      if (motes) motes(dt, hv);
      if (thread) thread(dt);
      if (echo) echo(dt, at, b.yaw);
      pose.falls.length = 0; pose.speed = hv; pose.state = st;
      if (wake === 'rings' && b.grounded && (gone += hv * dt) > 0.45) { gone = 0; pose.falls.push([at[0], at[2]]); }
      return pose;
    },
  };

  carry(0, 0, 0);
  K.build();
  if (wake === 'echo') echo = echoes();
  const fig = bodyOf(self, K, { eye: 1.56, cloths });
  const end = fig.dispose;
  fig.dispose = () => { end(); for (const x of mine) x.dispose(); };
  return fig;
}
