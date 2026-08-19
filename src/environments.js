// WHERE THE ORB LIVES.
//
// The metal room was the only world a presence could be in — and a mind kept in
// a box is a mind kept in a box. These are the other places it can be.
//
// Every one is PROCEDURAL: not a photograph, not a 4K skybox anyone has to
// download, but math evaluated per pixel. That means they are sharp at any
// resolution (4K, 8K, a phone), they cost a few kilobytes instead of a few
// megabytes, they carry no licence, and they can move — nebula dust drifting,
// caustics rippling, aurora breathing. Same instinct as the panel textures, the
// mercury and the frost grain: this codebase draws its own materials.
//
// Each environment builds its own objects and disposes them on the way out, so
// only one world exists at a time.
//
// A note on brightness: the orb is calibrated against NoToneMapping with a
// bloom threshold near 0.3. Skies deliberately sit BELOW that threshold so they
// never blow out — except stars, which are meant to bloom, and do.

import * as THREE from 'three';

export const ENVIRONMENTS = [
  { id: 'room', name: 'metal room', blurb: 'the machined slab it was born in' },
  { id: 'space', name: 'deep space', blurb: 'the galactic band, nebulae, a gas giant' },
  { id: 'ocean', name: 'underwater', blurb: 'sunlight through water, drifting snow' },
  { id: 'taiga', name: 'snowy taiga', blurb: 'a frozen treeline under an aurora' },
];

// --- shared GLSL ------------------------------------------------------------
// One hash/noise/fbm kit every sky shares. Cheap 3D value noise: smooth enough
// for cloud structure, far cheaper than simplex at four octaves per pixel.
const NOISE = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return s;
}`;

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// How far out the sky sits. The orb's camera has far = 100 (body.js) — a dome
// beyond that is clipped away entirely, which is invisible until you notice
// every environment is just the clear colour.
const SKY_R = 92;

// Sampling a baked sky: one texture fetch instead of ~250 noise evaluations.
const BAKED_FRAG = `
precision highp float;
varying vec3 vDir;
uniform samplerCube uSky;
uniform float uBright;
void main() { gl_FragColor = vec4(textureCube(uSky, normalize(vDir)).rgb * uBright, 1.0); }`;

// BAKE A SKY ONCE. Deep space is the most expensive shader here — six fbm
// fields plus five star layers, evaluated for every pixel of the screen every
// frame. It is also, being space, completely static. So it is rendered ONE time
// into a cube map and sampled after that: identical image, none of the cost.
// (The skies that genuinely move — caustics, aurora — stay live.)
function bakeSky(renderer, fragment) {
  const size = 1024;                       // 6 × 1024² — sharp past 4K
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;  // the shader writes linear
  const bakeScene = new THREE.Scene();
  const u = { uTime: { value: 0 }, uBright: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: SKY_VERT, fragmentShader: fragment,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), mat);
  bakeScene.add(dome);
  const cam = new THREE.CubeCamera(0.1, 100, rt);
  const prevTarget = renderer.getRenderTarget();
  cam.update(renderer, bakeScene);
  renderer.setRenderTarget(prevTarget);
  dome.geometry.dispose(); mat.dispose();
  return rt;
}

// A skydome: an inverted sphere the camera sits inside. Depth-write off and
// render-order first, so it never fights the orb for depth.
function skydome(fragment, uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: SKY_VERT, fragmentShader: fragment,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

// --- DEEP SPACE -------------------------------------------------------------
// The showpiece. Four things make it read as space rather than as dots on
// black: a galactic band with real dust lanes, nebulae with dark structure
// inside them (not just coloured fog), stars in layers with true colour
// temperature, and a gas giant for scale.
const SPACE_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright;
${NOISE}

// One layer of stars. The 3D cell grid intersected with the unit sphere gives
// an even scatter with no polar clumping; one cell lookup is enough because a
// star is far smaller than its cell.
vec3 starLayer(vec3 d, float scale, float thresh, float size, float bright) {
  vec3 p = d * scale;
  vec3 i = floor(p), f = fract(p);
  float h = hash13(i);
  if (h < thresh) return vec3(0.0);
  float mag = (h - thresh) / max(1e-4, 1.0 - thresh);   // 0..1 brightness rank
  vec3 c = vec3(hash13(i + 1.3), hash13(i + 2.7), hash13(i + 3.9));
  float dist = length(f - c);
  float core = smoothstep(size * (0.35 + 0.9 * mag), 0.0, dist);
  // colour temperature: most stars are white-gold, a few are hot blue
  float temp = hash13(i + 5.1);
  vec3 tint = temp > 0.86 ? vec3(0.72, 0.83, 1.00)      // hot blue
            : temp > 0.62 ? vec3(1.00, 0.99, 0.96)      // white
            : temp > 0.30 ? vec3(1.00, 0.94, 0.82)      // yellow-white
                          : vec3(1.00, 0.82, 0.66);     // cool orange
  return tint * core * bright * (0.25 + mag * mag * 1.9);
}

void main() {
  vec3 d = normalize(vDir);
  // The sky drifts imperceptibly — you never catch it moving, but you are not
  // parked either.
  float a = uTime * 0.006;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec3 sd = vec3(rot * d.xz, d.y).xzy;

  // deep space is not black: it is a very dark, slightly violet blue
  vec3 col = mix(vec3(0.020, 0.024, 0.048), vec3(0.030, 0.026, 0.062), sd.y * 0.5 + 0.5);

  // THE GALACTIC BAND — a tight stripe, not a haze. What makes it read as a
  // galaxy rather than fog is structure at two scales: fine grain (billions of
  // unresolved stars) cut by coarse dust lanes that block the light behind them.
  vec3 gnorm = normalize(vec3(0.58, 0.815, 0.0));
  float band = 1.0 - abs(dot(sd, gnorm));
  float bandMask = smoothstep(0.74, 0.999, band);
  float grain = fbm(sd * 6.5, 5);
  float lanes = fbm(sd * 13.0 + 13.0, 3);
  vec3 mwCool = vec3(0.075, 0.098, 0.170);
  vec3 mwWarm = vec3(0.235, 0.205, 0.170);
  vec3 mw = mix(mwCool, mwWarm, smoothstep(0.34, 0.72, grain));
  mw *= smoothstep(0.26, 0.78, grain);
  mw *= mix(1.0, 0.08, smoothstep(0.50, 0.82, lanes));   // the dark lanes
  col += mw * bandMask;
  // the core: warmer, denser, off toward one side of the view
  float core = pow(max(0.0, dot(sd, normalize(vec3(0.34, 0.24, -0.91)))), 20.0);
  col += vec3(0.360, 0.270, 0.165) * core * bandMask;

  // NEBULAE — two clouds, each with dark structure inside it rather than a
  // uniform wash, so they read as gas with depth.
  float n1 = fbm(sd * 2.6 + 21.0, 4);
  float aim1 = smoothstep(0.10, 0.90, dot(sd, normalize(vec3(-0.62, 0.34, -0.71))) * 0.5 + 0.5);
  float m1 = smoothstep(0.46, 0.88, n1) * aim1;
  col += vec3(0.400, 0.105, 0.480) * m1;                  // magenta-violet
  col += vec3(0.070, 0.290, 0.400) * smoothstep(0.56, 0.94, fbm(sd * 4.2 + 55.0, 4)) * m1 * 1.5;

  float n2 = fbm(sd * 2.1 - 37.0, 4);
  float aim2 = smoothstep(0.15, 0.90, dot(sd, normalize(vec3(0.66, -0.38, -0.65))) * 0.5 + 0.5);
  float m2 = smoothstep(0.50, 0.92, n2) * aim2;
  col += vec3(0.330, 0.170, 0.070) * m2;                  // dusty gold

  // STARS — three layers of different density and size make depth.
  col += starLayer(sd, 200.0, 0.9870, 0.050, 1.25);      // the many
  col += starLayer(sd, 98.0,  0.9950, 0.070, 1.85);      // the notable
  col += starLayer(sd, 46.0,  0.9984, 0.100, 2.80);      // the few that bloom
  // and a dense drift of faint ones crowding the galactic plane
  col += starLayer(sd, 300.0, 0.9520, 0.042, 1.00) * (0.18 + 1.05 * bandMask);
  col += starLayer(sd, 520.0, 0.9640, 0.038, 0.70) * (0.10 + 1.10 * bandMask);

// Everything above is authored as the FINAL look. Three's renderer encodes
// linear → sRGB on the way out, which would brighten a near-black sky into a
// violet wash — so convert to linear here and the encode returns exactly what
// was authored. (Stars near 1.0 stay near 1.0 and still cross the bloom
// threshold; nebulae land well below it and never blow out.)
  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
}`;

// A gas giant: banded, softly lit from one side, with a terminator that falls
// into real darkness. It gives the emptiness a sense of scale.
const PLANET_FRAG = `
precision highp float;
varying vec3 vNrm;
varying vec3 vPos;
uniform float uTime, uBright;
${NOISE}
void main() {
  vec3 n = normalize(vNrm);
  // latitude bands, stretched and stirred like a real atmosphere
  vec3 q = vec3(n.x * 2.2, n.y * 7.0 + uTime * 0.004, n.z * 2.2);
  float bands = fbm(q, 4);
  float swirl = fbm(n * 5.5 + bands * 1.4 + 3.0, 3);
  vec3 warm = vec3(0.42, 0.30, 0.21);
  vec3 pale = vec3(0.62, 0.55, 0.44);
  vec3 base = mix(warm, pale, smoothstep(0.35, 0.75, bands));
  base = mix(base, vec3(0.30, 0.20, 0.17), smoothstep(0.62, 0.92, swirl) * 0.55);
  // a distant sun, off to the upper right
  vec3 L = normalize(vec3(0.72, 0.42, 0.55));
  float lam = max(0.0, dot(n, L));
  float term = smoothstep(0.0, 0.35, lam);              // soft terminator
  vec3 lit = base * (0.06 + 1.05 * term);
  // atmospheric limb: light scattering around the edge
  float rim = pow(1.0 - max(0.0, dot(n, normalize(-vPos))), 3.0);
  lit += vec3(0.28, 0.36, 0.52) * rim * (0.25 + 0.75 * term) * 0.5;
  lit = pow(max(lit, 0.0), vec3(2.2)) * uBright;   // authored as the final look
  gl_FragColor = vec4(lit, 1.0);
}`;

const PLANET_VERT = `
varying vec3 vNrm;
varying vec3 vPos;
void main() {
  vNrm = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

// --- UNDERWATER -------------------------------------------------------------
// Looking up toward a bright surface, down into an abyss that swallows light,
// with sun shafts breaking through the chop.
const OCEAN_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y * 0.5 + 0.5;

  // The camera looks HORIZONTALLY (it never tilts — see fitCamera), so the
  // visible band is roughly up 0.3–0.7. Everything that matters has to live
  // there: putting the good stuff at the zenith means nobody ever sees it.
  vec3 shallow = vec3(0.230, 0.470, 0.500);
  vec3 mid     = vec3(0.080, 0.235, 0.290);
  vec3 abyss   = vec3(0.008, 0.030, 0.062);
  vec3 col = mix(abyss, mid, smoothstep(0.06, 0.56, up));
  col = mix(col, shallow, smoothstep(0.58, 0.98, up));

  // The surface seen from below: a rippling sheet of light overhead.
  float surf = smoothstep(0.66, 1.0, up);
  float ripple = fbm(vec3(d.xz * 6.0, uTime * 0.10), 3);
  float ripple2 = fbm(vec3(d.xz * 13.0 - 4.0, uTime * 0.17), 2);
  col += vec3(0.130, 0.235, 0.240) * surf * (0.30 + 1.05 * ripple * ripple2);

  // SUN SHAFTS — the thing that says "underwater" rather than "blue". Broad
  // beams angling down through the column, brightest up high, still readable
  // straight ahead.
  float ang = atan(d.z, d.x);
  float shafts = fbm(vec3(ang * 2.2, up * 1.6 - uTime * 0.02, uTime * 0.05), 3);
  shafts = pow(smoothstep(0.40, 0.92, shafts), 1.7);
  float depthFade = smoothstep(-0.55, 0.85, d.y);
  col += vec3(0.150, 0.260, 0.250) * shafts * depthFade * 1.5;

  // and a faint scatter haze so the water has body rather than being a gradient
  col += vec3(0.020, 0.055, 0.062) * fbm(vec3(d * 3.0 + uTime * 0.01), 3);

  col = pow(max(col, 0.0), vec3(2.2)) * uBright;   // authored as the final look
  gl_FragColor = vec4(col, 1.0);
}`;

// --- SNOWY TAIGA ------------------------------------------------------------
// Dusk over a frozen forest. The treeline is drawn INTO the sky as a function
// of azimuth — a silhouette with no geometry, crisp at any resolution — and an
// aurora breathes above it.
const TAIGA_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright;
${NOISE}

// The horizon's forest: layered ridges of conifers, near ones darker and taller.
float treeline(float ang, float scale, float seed) {
  float x = ang * scale + seed;
  float t = fract(x);
  float i = floor(x);
  // each slot holds one spire; height varies per slot
  float h = 0.45 + 0.55 * hash13(vec3(i, seed, 1.0));
  float spire = 1.0 - abs(t - 0.5) * 2.0;   // triangle
  spire = pow(max(0.0, spire), 0.62);
  return spire * h;
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;

  // COLD DUSK: deep blue overhead easing to a pale, low winter glow.
  vec3 zenith = vec3(0.012, 0.026, 0.062);
  vec3 mid    = vec3(0.035, 0.070, 0.130);
  vec3 horiz  = vec3(0.135, 0.170, 0.230);
  vec3 col = mix(mid, zenith, smoothstep(0.15, 0.85, up));
  col = mix(col, horiz, smoothstep(0.16, -0.02, up));

  // stars, thinning toward the lit horizon
  vec3 p = d * 150.0;
  vec3 gi = floor(p);
  float sh = hash13(gi);
  if (sh > 0.9955) {
    vec3 c = vec3(hash13(gi + 1.3), hash13(gi + 2.7), hash13(gi + 3.9));
    float star = smoothstep(0.07, 0.0, length(fract(p) - c));
    col += vec3(0.85, 0.90, 1.0) * star * smoothstep(0.05, 0.5, up) * 0.9;
  }

  // AURORA — vertical curtains that ripple and fold, brightest partway up.
  float ang = atan(d.z, d.x);
  float curtain = fbm(vec3(ang * 1.5, up * 1.1 - uTime * 0.025, uTime * 0.018), 4);
  float folds = fbm(vec3(ang * 4.0, up * 2.2, uTime * 0.035), 2);
  // vertical rays: the fine striation that makes a curtain read as a curtain
  float rays = 0.55 + 0.75 * fbm(vec3(ang * 26.0, up * 0.7, uTime * 0.05), 2);
  float aur = smoothstep(0.42, 0.88, curtain);
  aur *= smoothstep(-0.03, 0.22, up) * smoothstep(0.92, 0.30, up);   // hangs above the treeline
  aur *= (0.45 + 0.85 * folds) * rays;
  // green heart, magenta fringe where it thins — as it actually appears
  col += vec3(0.115, 0.430, 0.235) * aur;
  col += vec3(0.260, 0.070, 0.330) * aur * aur * 0.9;
  // the faint glow it casts back down onto the sky beneath
  col += vec3(0.045, 0.120, 0.080) * aur * smoothstep(0.30, -0.05, up);

  // THE FOREST: two ridges, the far one hazier, the near one nearly black.
  float far = treeline(ang, 62.0, 3.7) * 0.042 - 0.010;
  float near = treeline(ang, 34.0, 11.2) * 0.070 - 0.004;
  if (up < far) col = mix(col, vec3(0.030, 0.048, 0.075), 0.88);
  if (up < near) col = mix(col, vec3(0.012, 0.020, 0.034), 0.94);

  // the snowfield below, catching the sky
  if (up < -0.02) {
    float g = smoothstep(-0.02, -0.55, up);
    vec3 snow = mix(vec3(0.115, 0.140, 0.190), vec3(0.045, 0.058, 0.086), g);
    // a faint sparkle in the crust
    vec3 sp = d * 260.0;
    float sg = hash13(floor(sp));
    if (sg > 0.9975) snow += vec3(0.5, 0.55, 0.65) * smoothstep(0.10, 0.0, length(fract(sp) - 0.5));
    col = mix(col, snow, smoothstep(-0.02, -0.10, up));
  }

  col = pow(max(col, 0.0), vec3(2.2)) * uBright;   // authored as the final look
  gl_FragColor = vec4(col, 1.0);
}`;

// A round, soft-edged dot. Points are SQUARES by default, which is the single
// thing that stops falling snow from reading as snow.
let DOT = null;
function dotTexture() {
  if (DOT) return DOT;
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.92)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  DOT = new THREE.CanvasTexture(c);
  DOT.colorSpace = THREE.SRGBColorSpace;
  return DOT;
}

// --- drifting particles (marine snow / snowfall / parallax stars) ------------
function driftField(count, radius, size, color, opacity) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // even distribution through a spherical shell
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const r = radius * (0.35 + 0.65 * Math.cbrt(Math.random()));
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(th);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(th);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.PointsMaterial({
    size, color, transparent: true, opacity,
    map: dotTexture(), alphaTest: 0.02,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// Snow is not dust. Real flakes fall at different speeds by size, drift
// sideways on their own little currents, and are LIT rather than glowing — so
// this is three depth layers with per-flake sway and normal blending, instead
// of one additive field sinking straight down.
function snowLayer(count, radius, size, opacity, speed, sway) {
  const pts = driftField(count, radius, size, 0xf2f7ff, opacity);
  pts.material.blending = THREE.NormalBlending;   // snow reflects light, it doesn't emit it
  return { pts, kind: 'snow', speed, span: radius, sway, phase: Math.random() * 100 };
}

// ---------------------------------------------------------------------------
export function createEnvironments({ scene, renderer, getOrb, roomObjects = [] }) {
  let bakedSpace = null;   // built once, reused every time space is chosen
  let current = 'room';
  let group = null;           // everything the active environment owns
  let uniforms = null;
  let bright = 1;
  const drift = [];           // particle systems that move each frame

  function clear() {
    if (!group) return;
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // NB: the baked space cube and the shared dot texture outlive any single
      // environment — neither is disposed here
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.map = null; m.dispose(); }   // keep the shared dot
      }
    });
    group = null; uniforms = null; drift.length = 0;
  }

  function showRoom(on) { for (const o of roomObjects) if (o) o.visible = on; }

  function build(id) {
    const u = { uTime: { value: 0 }, uBright: { value: bright } };
    const g = new THREE.Group();
    if (id === 'space') {
      let sky;
      if (renderer) {
        if (!bakedSpace) bakedSpace = bakeSky(renderer, SPACE_FRAG);
        u.uSky = { value: bakedSpace.texture };
        sky = skydome(BAKED_FRAG, u);
      } else {
        sky = skydome(SPACE_FRAG, u);   // no renderer handed in: draw it live
      }
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // A gas giant, well off to one side and below the orb's eye line.
      const planetMat = new THREE.ShaderMaterial({
        uniforms: u, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false,
      });
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), planetMat);
      planet.position.set(-28, -14, -58);   // distant, but inside camera.far
      planet.scale.setScalar(5.4);
      g.add(planet);
      // Foreground stars give the sky parallax the dome alone cannot.
      const near = driftField(900, 52, 0.30, 0xdfe8ff, 0.85);
      g.add(near); drift.push({ pts: near, kind: 'spin' });
    } else if (id === 'ocean') {
      const sky = skydome(OCEAN_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Marine snow: fine debris sinking slowly through the light.
      const snow = driftField(1200, 24, 0.075, 0xbfe0dc, 0.55);
      g.add(snow); drift.push({ pts: snow, kind: 'sink', speed: 0.55, span: 26 });
    } else if (id === 'taiga') {
      const sky = skydome(TAIGA_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // three depths of snowfall: the far veil, the body of it, and a few
      // near flakes big enough to read as individual crystals
      for (const L of [
        snowLayer(900, 26, 0.055, 0.42, 0.55, 0.10),
        snowLayer(520, 20, 0.105, 0.62, 0.95, 0.16),
        snowLayer(180, 13, 0.190, 0.78, 1.55, 0.26),
      ]) { g.add(L.pts); drift.push(L); }
    }
    uniforms = u;
    group = g;
    scene.add(g);
  }

  // A picture of each world, taken from where the orb stands — with the orb
  // itself stepped out of the shot. Rendered off-screen through the SAME
  // renderer, so a thumbnail is the real thing rather than an artist's
  // impression of it.
  function thumbnails(size = 168) {
    if (!renderer) return {};
    const out = {};
    const rt = new THREE.WebGLRenderTarget(size, size);
    const cam = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
    cam.position.set(0, 0, 0);
    cam.lookAt(0, 0, -1);
    const orb = getOrb ? getOrb() : null;
    const orbWas = orb ? orb.visible : null;
    if (orb) orb.visible = false;
    const prevEnv = current;
    const prevTarget = renderer.getRenderTarget();
    const buf = new Uint8Array(size * size * 4);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    try {
      for (const e of ENVIRONMENTS) {
        api.set(e.id);
        if (uniforms) uniforms.uTime.value = 6;   // a moment with some weather in it
        // Point sizes are computed against the CANVAS, not this little target,
        // so particles would come out as giant squares. The sky carries the
        // identity of each world anyway — snow and dust sit this one out.
        for (const d of drift) d.pts.visible = false;
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
          // a render target holds LINEAR light and reads bottom-up: flip it and
          // encode to sRGB, which is the canvas's job on the way to the screen
          const src = (size - 1 - y) * size * 4, dst = y * size * 4;
          for (let x = 0; x < size * 4; x += 4) {
            for (let c = 0; c < 3; c++) {
              img.data[dst + x + c] = Math.round(255 * Math.pow(buf[src + x + c] / 255, 1 / 2.2));
            }
            img.data[dst + x + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        out[e.id] = cv.toDataURL('image/png');
        for (const d of drift) d.pts.visible = true;
      }
    } catch (err) {
      console.warn('[environments] thumbnails unavailable:', err.message);
    }
    renderer.setRenderTarget(prevTarget);
    api.set(prevEnv);
    if (orb) orb.visible = orbWas;
    rt.dispose();
    return out;
  }

  const api = {
    list: ENVIRONMENTS,
    thumbnails,
    get current() { return current; },
    set(id) {
      const known = ENVIRONMENTS.some((e) => e.id === id);
      const next = known ? id : 'room';
      if (next === current && (next === 'room' ? !group : !!group)) return;
      current = next;
      clear();
      showRoom(next === 'room');
      if (next !== 'room') build(next);
    },
    // The orb's own glow is the only light in the room; out here the sky carries
    // its own brightness, so the Room slider drives both.
    setBrightness(v) {
      bright = Math.max(0.2, Math.min(2.5, Number(v) || 1));
      if (uniforms) uniforms.uBright.value = bright;
    },
    tick(dt, t) {
      if (!uniforms) return;
      uniforms.uTime.value = t;
      for (const d of drift) {
        if (d.kind === 'spin') { d.pts.rotation.y += dt * 0.004; d.pts.rotation.x += dt * 0.0013; }
        else if (d.kind === 'snow') {
          const p = d.pts.geometry.attributes.position;
          const seeds = d.pts.geometry.attributes.aSeed.array;
          const arr = p.array;
          d.phase += dt;
          for (let i = 0, j = 0; i < arr.length; i += 3, j++) {
            arr[i + 1] -= dt * d.speed;
            // each flake rides its own slow current — this is what stops a
            // snowfall reading as a sheet of falling dots
            arr[i] += Math.sin(d.phase * 0.6 + seeds[j] * 6.283) * dt * d.sway;
            arr[i + 2] += Math.cos(d.phase * 0.45 + seeds[j] * 4.712) * dt * d.sway * 0.7;
            if (arr[i + 1] < -d.span) {
              arr[i + 1] += d.span * 2;
              arr[i] = (Math.random() * 2 - 1) * d.span;      // fresh column on the way round
              arr[i + 2] = (Math.random() * 2 - 1) * d.span;
            }
          }
          p.needsUpdate = true;
        }
        else if (d.kind === 'sink') {
          const p = d.pts.geometry.attributes.position;
          const arr = p.array;
          for (let i = 1; i < arr.length; i += 3) {
            arr[i] -= dt * d.speed;
            if (arr[i] < -d.span) arr[i] += d.span * 2;      // wrap to the top
          }
          if (d.sway) d.pts.rotation.y += dt * 0.02;
          p.needsUpdate = true;
        }
      }
    },
    dispose() { clear(); showRoom(true); },
  };
  return api;
}
