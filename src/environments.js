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
// Each environment builds its own objects the first time it is chosen and
// KEEPS them: only one world is in the scene at a time, but a world left is
// set aside, not disposed. Disposing it threw its shader program away, and
// coming back compiled it again — a sky program is the size of a small game's
// and three compiles it synchronously on the first frame that draws it, so
// every return to a world was a hitch the veil had to hide. A kept world
// costs a material and its dust — the dome's sphere is one geometry shared
// by every sky (see skydome) — and its parked tap: 358KB of buffers for all
// twelve together (counted 2026-10-19; the sand plate, 2026-10-22, adds a
// dome material and nothing else), and one copy of them on the GPU.
//
// EVERY SKY ENDS IN three's COLOUR-SPACE ENCODE (#include <colorspace_fragment>).
// The skies write LINEAR light — each one converts its authored look back with
// pow(col, 2.2) and relies on the encode on the way out to return it. With the
// glow on, that encode happens once for the whole frame at the bloom's final
// copy; with the glow off (the lighter graphics modes) the scene goes straight
// to the screen and nothing encoded it, so every world drew darker and muddier
// than it was authored. The include is an identity into a render target and
// the sRGB encode onto the screen, so both paths now show the same sky.
//
// A note on brightness: the orb is calibrated against NoToneMapping with a
// bloom threshold near 0.3. Skies deliberately sit BELOW that threshold so they
// never blow out — except stars, which are meant to bloom, and do.

import * as THREE from 'three';

// The list itself lives in rooms.mjs, where the kommand grammar can read it.
import { ENVIRONMENTS } from './rooms.mjs';
export { ENVIRONMENTS };
// The sand plate's maths: the figure's ladder of modes and what a voice does to them.
import { LADDER, RUNGS, modeAt, agitationOf, rungOf, idleRung, cadence, QUIET } from './plate.mjs';

// --- shared GLSL ------------------------------------------------------------
// One hash/noise/fbm kit every sky shares. Cheap 3D value noise: smooth enough
// for cloud structure, far cheaper than simplex at four octaves per pixel.
// Touch devices get a lighter build of everything (fewer particles, lower
// resolution, fewer noise octaves). The test is the input device, NOT the
// window width: a desktop window dragged narrow still has a real GPU behind it.
const COARSE = typeof matchMedia !== 'undefined'
  && (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches);
// Octaves are the whole cost of a sky. On a phone the top two add detail no one
// can resolve on a 6-inch screen while costing a third of the frame.
const OCT_MAX = COARSE ? 3 : 6;

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
// uOctCap: the lightest graphics mode's ceiling on octaves, one uniform shared
// by every sky so switching it is a number, not a recompile. The octaves it
// leaves out are not simply dropped: value noise averages 0.5, so each one
// skipped is replaced by its average (a * (1 - 2^(i - oct)) is the sum of the
// missing amplitudes times one half). Every threshold these skies draw with —
// the smoothsteps on grain, lanes, curtains, veins — then lands where it was
// authored, and what goes is only the finest grain, not the shape of the sky.
uniform float uOctCap;
float fbm(vec3 p, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < ${OCT_MAX}; i++) {
    if (i >= oct) break;
    if (float(i) >= uOctCap) { s += a * (1.0 - exp2(float(i - oct))); break; }
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

// How far out the sky sits. The orb's camera has far = 220 (body.js; it was
// 100) — a dome beyond that is clipped away entirely, which is invisible until
// you notice every environment is just the clear colour. And the camera is
// not at the origin: fitCamera (body.js) pulls it back to fit the orb, as far
// as ~24 in Code's narrow column, so the dome's FAR side sits at SKY_R plus
// that distance. With far = 100 that side crossed the plane whenever the
// camera went past 8, and the dome behind the orb was cut away in a dark
// polygon — the "black void" seen only on the kode page.
const SKY_R = 92;

// Sampling a baked sky: one texture fetch instead of ~250 noise evaluations.
const BAKED_FRAG = `
precision highp float;
varying vec3 vDir;
uniform samplerCube uSky;
uniform float uBright;
void main() {
  gl_FragColor = vec4(textureCube(uSky, normalize(vDir)).rgb * uBright, 1.0);
  #include <colorspace_fragment>
}`;

// BAKE A SKY ONCE. Deep space is the most expensive shader here — six fbm
// fields plus five star layers, evaluated for every pixel of the screen every
// frame. It is also, being space, completely static. So it is rendered ONE time
// into a cube map and sampled after that: identical image, none of the cost.
// (The skies that genuinely move — caustics, aurora — stay live.)
function bakeSetup(fragment) {
  const size = 1024;                       // 6 × 1024² — sharp past 4K
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;  // the shader writes linear
  const bakeScene = new THREE.Scene();
  // uOctCap never caps a bake: it is drawn once, and then it costs nothing
  const u = { uTime: { value: 0 }, uBright: { value: 1 }, uOctCap: { value: 99 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: SKY_VERT, fragmentShader: fragment,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 32), mat);
  bakeScene.add(dome);
  const cam = new THREE.CubeCamera(0.1, 100, rt);
  return { rt, bakeScene, cam, done() { dome.geometry.dispose(); mat.dispose(); } };
}
function bakeSky(renderer, fragment) {
  const b = bakeSetup(fragment);
  const prevTarget = renderer.getRenderTarget();
  b.cam.update(renderer, b.bakeScene);
  renderer.setRenderTarget(prevTarget);
  b.done();
  return b.rt;
}

// THE SAME BAKE, ONE FACE A FRAME, for a caller that can wait (the Room
// tab's photographs). In one go it is the heaviest program in the app
// compiled on the spot and six million pixels of it drawn in a single task —
// the longest stall of the first Settings open. Here the program is compiled
// first (in the background where the browser can), then one face is drawn per
// frame. `stale()` is asked before every face: if something that could not
// wait (a visit to space) has baked it the old way meanwhile, this one stands
// down and throws its half away. Resolves to the finished target, or null.
async function bakeSkySlowly(renderer, fragment, stale) {
  const b = bakeSetup(fragment);
  const faces = b.cam.children;
  b.cam.updateMatrixWorld();
  if (b.cam.coordinateSystem !== renderer.coordinateSystem) {
    b.cam.coordinateSystem = renderer.coordinateSystem;
    b.cam.updateCoordinateSystem();
  }
  const quit = () => { b.done(); b.rt.dispose(); return null; };
  try {
    const prev = renderer.getRenderTarget();
    let p = null;
    try {
      renderer.setRenderTarget(b.rt, 0);
      // (has() first: compileAsync's own check warns in the console on every
      // call where the extension is missing; without it the program is issued
      // here all the same, and the frame below gives it time)
      if (typeof renderer.compileAsync === 'function' && renderer.extensions?.has?.('KHR_parallel_shader_compile')) p = renderer.compileAsync(b.bakeScene, faces[0]);
      else if (typeof renderer.compile === 'function') renderer.compile(b.bakeScene, faces[0]);
    } finally { renderer.setRenderTarget(prev); }
    await p;
    for (let i = 0; i < 6; i++) {
      await nextFrame();
      if (stale()) return quit();
      const prevT = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
      renderer.setRenderTarget(b.rt, i);
      renderer.render(b.bakeScene, faces[i]);
      renderer.setRenderTarget(prevT, prevFace, prevMip);
    }
  } catch (err) {
    console.warn('[environments] slow bake failed:', err?.message || err);
    return quit();
  }
  b.done();
  return b.rt;
}

// A skydome: an inverted sphere the camera sits inside. Depth-write off and
// render-order first, so it never fights the orb for depth.
//
// ONE SPHERE UNDER EVERY SKY. A dome's geometry is the same for every world
// (only its material differs), and with twelve rooms a sphere apiece was
// eleven copies of ~70KB kept for the life of the page, on the CPU and again
// on the GPU. Shared, it is one; dispose() releasing it once per world is
// harmless (three forgets a disposed geometry and re-uploads it if asked).
let DOME = null;
function skydome(fragment, uniforms, vertex = SKY_VERT) {
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex, fragmentShader: fragment,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  if (!DOME) DOME = new THREE.SphereGeometry(1, 48, 32);
  const mesh = new THREE.Mesh(DOME, mat);
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
  #include <colorspace_fragment>
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
  #include <colorspace_fragment>
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
  #include <colorspace_fragment>
}`;

// --- SNOWY TAIGA ------------------------------------------------------------
// Dusk over a frozen forest. The treeline is drawn INTO the sky as a function
// of azimuth — a silhouette with no geometry, crisp at any resolution — and an
// aurora breathes above it.
const TAIGA_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uTap;
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
  // a tap makes the curtain SURGE — the flare auroras actually do — then it
  // breathes back down over a few seconds (1.2x keeps the peak under 1.0)
  aur *= 1.0 + 1.2 * exp(-max(uTime - uTap, 0.0) * 0.7);
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
  #include <colorspace_fragment>
}`;

// A round, soft-edged dot. Points are SQUARES by default, which is the single
// thing that stops falling snow from reading as snow.
let DOT = null;
// --- DUNES AT DUSK ----------------------------------------------------------
// The warm room. Everything else here is cold or dark, so this one is built
// around low sun: a sand horizon that glows from the side, layered ridges
// receding into haze, and the first stars only just winning against the light.
const DUNES_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uDusk;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y * 0.5 + 0.5;
  float ang = atan(d.z, d.x);

  vec3 zenith = vec3(0.055, 0.070, 0.165);
  vec3 mid    = vec3(0.230, 0.180, 0.235);
  vec3 horiz  = vec3(0.620, 0.360, 0.220);
  // uDusk: a tap eases the evening on — 0 is the stock dusk, 1 is last light,
  // the next tap brings it back. The sky darkens and reddens together.
  zenith = mix(zenith, vec3(0.018, 0.024, 0.080), uDusk);
  mid    = mix(mid,    vec3(0.105, 0.080, 0.150), uDusk);
  horiz  = mix(horiz,  vec3(0.470, 0.215, 0.145), uDusk);
  vec3 col = mix(mid, zenith, smoothstep(0.52, 0.98, up));
  col = mix(horiz, col, smoothstep(0.46, 0.70, up));

  // The sun sits just off to one side and BELOW the ridgeline, so it is never a
  // disc — only the glow it throws along the horizon. That is what keeps this
  // under the bloom threshold while still reading as sunset.
  float sunAz = cos(ang - 0.6) * 0.5 + 0.5;
  float glow = pow(max(sunAz, 0.0), 6.0) * smoothstep(0.62, 0.44, up);
  col += mix(vec3(0.85, 0.42, 0.16), vec3(0.80, 0.24, 0.10), uDusk) * glow * (0.9 + 0.4 * uDusk);

  // Stars, but losing to the sky near the sun — a dusk sky is not a night sky.
  float stars = hash13(floor(d * 460.0));
  float twinkle = smoothstep(0.9975, 1.0, stars) * smoothstep(0.55, 0.95, up);
  col += vec3(0.9, 0.92, 1.0) * twinkle * (1.0 - glow) * (0.55 + 0.75 * uDusk); // stars win as the light goes

  // THE DUNES. Three ridges as a function of azimuth, each lower and hazier
  // than the last. No geometry: a silhouette this soft would cost thousands of
  // triangles and still band on a gradient.
  for (int i = 0; i < 3; i++) {
    float f = float(i);
    float scale = 1.0 + f * 1.7;
    float h = 0.468 - f * 0.028;
    float ridge = h + 0.030 * fbm(vec3(ang * scale, f * 3.1, 0.0), 3)
                    + 0.014 * sin(ang * (2.0 + f * 3.0) + f);
    float m = smoothstep(ridge + 0.004, ridge - 0.004, up);
    // Near dunes are darker; far ones sit in haze, which is the whole depth cue.
    vec3 sand = mix(vec3(0.335, 0.205, 0.135), vec3(0.115, 0.070, 0.078), f / 2.0);
    // a grain of lit sand along the sunward face
    sand += vec3(0.30, 0.16, 0.06) * glow * (1.0 - f / 3.0) * 0.5;
    col = mix(col, sand, m);
  }

  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- CRYSTAL CAVERN ---------------------------------------------------------
// The enclosed room. Every other world opens outward; this one closes in. Wet
// rock in every direction, lit only by what grows in it — so the orb is the
// brightest thing present, which is exactly right for a mind in a cave.
const CAVERN_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uTap;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y * 0.5 + 0.5;
  float ang = atan(d.z, d.x);

  // Rock, close on all sides. Two noise scales: broad chambers, fine damp grain.
  float rough = fbm(vec3(d * 3.4), 3);
  float grain = fbm(vec3(d * 11.0), 2);
  vec3 rock = vec3(0.052, 0.049, 0.062) + vec3(0.045, 0.040, 0.055) * rough;
  rock += vec3(0.020) * grain;
  // darker overhead and underfoot: the chamber has a ceiling and a floor
  rock *= 1.0 - 0.55 * smoothstep(0.62, 1.0, up) - 0.30 * smoothstep(0.38, 0.0, up);
  vec3 col = rock;

  // STALACTITES biting down from the ceiling, and their stumpier answer below.
  float teeth = 0.735 - 0.055 * fbm(vec3(ang * 5.0, 1.7, 0.0), 3)
                      - 0.030 * abs(sin(ang * 9.0));
  col = mix(col, rock * 0.35, smoothstep(teeth - 0.006, teeth + 0.006, up));
  float floorLine = 0.238 + 0.030 * fbm(vec3(ang * 4.0, 8.3, 0.0), 2);
  col = mix(col, rock * 0.28, smoothstep(floorLine + 0.006, floorLine - 0.006, up));

  // THE LIGHT: veins of something living in the rock. Ridged noise (1 - |n|)
  // gives filaments rather than blobs — blobs read as stains, filaments read as
  // growth. They breathe out of phase so the cave is never quite still.
  //
  // Authored values must stay well under 1.0. The pow(col, 2.2) at the end
  // barely darkens anything near 1 while crushing the mid-tones, so a glow
  // written at 1.5 does not come back as "bright" — it comes back as a blown
  // white shape with black either side, and the cave stops being a cave.
  float v1 = fbm(vec3(d * 4.2 + vec3(0.0, uTime * 0.012, 0.0)), 3);
  float vein = 1.0 - abs(v1 * 2.0 - 1.0);
  vein = pow(max(vein, 0.0), 18.0);          // filaments, not fields
  float pulse = 0.72 + 0.28 * sin(uTime * 0.35 + v1 * 6.0);
  // a tap and the whole colony answers: both species flare together and settle
  // back out of phase (peak stays under the 1.0 line the comment above draws)
  float tp = exp(-max(uTime - uTap, 0.0) * 0.8);
  col += vec3(0.16, 0.62, 0.72) * vein * pulse * 0.42 * (1.0 + 1.2 * tp);

  // a second colony, violet, sparser, mostly low — two species, not one
  float v2 = fbm(vec3(d * 6.5 + vec3(3.7, uTime * 0.008, 1.2)), 2);
  float vein2 = pow(max(1.0 - abs(v2 * 2.0 - 1.0), 0.0), 24.0);
  col += vec3(0.42, 0.20, 0.72) * vein2 * smoothstep(0.62, 0.20, up) * (0.34 + 0.40 * tp);

  // pooled water on the floor, catching the veins
  float wet = smoothstep(floorLine + 0.02, floorLine - 0.10, up);
  col += vec3(0.05, 0.15, 0.19) * wet * (0.35 + 0.65 * fbm(vec3(d.xz * 7.0, uTime * 0.05), 2));

  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- ABOVE THE CLOUDS -------------------------------------------------------
// The bright room, and the one register the set was missing: space, ocean,
// taiga and cavern are all dark, so a presence had nowhere light to stand.
// Dawn from above the weather — cloud tops below the eye, clean sky above.
const CLOUDSEA_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uTap;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y * 0.5 + 0.5;
  float ang = atan(d.z, d.x);

  // Bright, but not white. Nothing here is authored above ~0.62, because this
  // is the one world where large AREAS are light rather than a few points —
  // and a large area at 0.9 does not read as dawn, it reads as fog on a lens.
  vec3 high = vec3(0.105, 0.200, 0.380);
  vec3 pale = vec3(0.400, 0.470, 0.575);
  vec3 warm = vec3(0.620, 0.450, 0.310);
  vec3 col = mix(pale, high, smoothstep(0.50, 1.0, up));
  col = mix(warm, col, smoothstep(0.485, 0.66, up));

  // Tight in azimuth AND in elevation. At a low exponent this smeared into a
  // bright band clean across the horizon — which is not what a sun looks like
  // from anywhere. Confining it to one bearing is what makes the sky read as
  // having a direction rather than a glowing edge.
  float sunAz = cos(ang + 1.1) * 0.5 + 0.5;
  float glow = pow(max(sunAz, 0.0), 26.0) * smoothstep(0.62, 0.50, up);
  // a tap and the dawn swells — the sun leans harder on the cloud deck for a
  // few seconds, then eases back (the highlight shoulder below absorbs the sum)
  float tp = exp(-max(uTime - uTap, 0.0) * 0.7);
  col += vec3(0.60, 0.40, 0.21) * glow * (0.55 + 0.85 * tp);
  // a much wider, much fainter wash so the glow has somewhere to fall off to
  col += vec3(0.34, 0.24, 0.15) * pow(max(sunAz, 0.0), 4.0) * smoothstep(0.70, 0.46, up) * (0.22 + 0.28 * tp);

  // THE CLOUD SEA below the horizon: billows lit from the side, troughs in blue
  // shadow. Two octave sets at different scales so the deck has near detail and
  // far flatness instead of one uniform fractal mush.
  float deck = smoothstep(0.500, 0.470, up);
  if (deck > 0.001) {
    // The perspective term is 1/(horizon - up), which runs away to infinity AT
    // the horizon: unclamped it smears the last few degrees into one hard bright
    // band across the whole frame. Clamped, it does what it should — crowd the
    // cloud tops together as they recede.
    float persp = min(1.0 / max(0.5 - up, 0.020), 26.0);
    vec2 pp = vec2(ang * 1.4, persp * 0.09 + uTime * 0.004);
    float big = fbm(vec3(pp * 1.2, 0.0), 3);
    float fine = fbm(vec3(pp * 4.2, 1.7), 2);
    float tops = big * 0.72 + fine * 0.28;
    vec3 lit = mix(vec3(0.300, 0.330, 0.410), vec3(0.615, 0.590, 0.590), smoothstep(0.42, 0.80, tops));
    lit += vec3(0.34, 0.19, 0.08) * glow * smoothstep(0.45, 0.85, tops) * 0.7;
    // haze toward the horizon line, so the deck recedes instead of tiling
    lit = mix(lit, warm * 0.92, smoothstep(0.470, 0.499, up));
    col = mix(col, lit, deck);
  }

  // A HIGHLIGHT SHOULDER, and the reason this world needs one when the others
  // do not. Here the bright terms genuinely stack — a warm horizon, a sun glow
  // and a lit cloud top all land on the same pixel — and anything summing past
  // 1.0 gets clipped flat by the curve below, which is what turned the sun into
  // a hard white band across the sky. This rolls the top end off smoothly
  // instead, so the terms can be authored for how they look rather than
  // hand-balanced against each other's worst case.
  col = col / (1.0 + col * 0.42);

  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- VOLCANIC ---------------------------------------------------------------
// The dangerous room. Almost black, and what light there is comes from below —
// the opposite of every other world here, where light falls from a sky.
const EMBER_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uTap;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y * 0.5 + 0.5;
  float ang = atan(d.z, d.x);

  vec3 col = mix(vec3(0.055, 0.028, 0.030), vec3(0.012, 0.010, 0.020),
                 smoothstep(0.44, 1.0, up));
  // smoke, thick and slow, catching the glow from underneath
  float smoke = fbm(vec3(d * 2.1 + vec3(0.0, uTime * 0.015, uTime * 0.010)), 3);
  col += vec3(0.075, 0.040, 0.038) * smoke * smoothstep(0.92, 0.42, up);

  // the whole horizon lit from below by what is down there
  // a tap is an ERUPTION: the underglow and the fissures surge together while
  // the embers outside this shader triple their climb (see tick)
  float tp = exp(-max(uTime - uTap, 0.0) * 0.9);
  col += vec3(0.30, 0.095, 0.028) * pow(max(1.0 - abs(up - 0.44) * 4.2, 0.0), 2.2) * (1.0 + 0.8 * tp);

  // THE GROUND: broken basalt, and the molten light in the breaks. Ridged noise
  // again, but inverted in role — here the FILAMENTS are the cracks, and the
  // rock between them is what stays dark.
  float ground = smoothstep(0.452, 0.436, up);
  if (ground > 0.001) {
    float persp = 1.0 / max(0.46 - up, 0.010);
    vec2 pp = vec2(ang * 1.7, persp * 0.11);
    float plates = fbm(vec3(pp * 1.6, 0.0), 3);
    float crack = 1.0 - abs(fbm(vec3(pp * 2.4, 4.1), 3) * 2.0 - 1.0);
    crack = pow(max(crack, 0.0), 16.0);      // fissures, not floods
    // the fissures pulse as if something is moving under them
    float breathe = 0.65 + 0.35 * sin(uTime * 0.5 + plates * 5.0);
    breathe *= 1.0 + 0.28 * tp;   // capped so molten*crack*breathe stays <= 1.0
    vec3 basalt = vec3(0.042, 0.036, 0.042) * (0.55 + 0.9 * plates);
    vec3 molten = mix(vec3(0.78, 0.26, 0.05), vec3(0.85, 0.60, 0.20), crack);
    // The rock has to stay the subject. At 2.2 the cracks swallowed it and the
    // room became a lava lake — which is a different, worse place to think.
    vec3 lit = basalt + molten * crack * breathe * 0.78;
    // distance haze: far ground is swallowed by its own smoke
    lit = mix(lit, vec3(0.115, 0.052, 0.040), smoothstep(0.436, 0.452, up));
    col = mix(col, lit, ground);
  }

  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// THE FOUR ADDED 2026-10-19. Colin: "tons of room to work on the world, new
// backgrounds". What the eight above did not have between them: a gentle,
// pink room (every warm one so far was sand or fire), weather that is violent
// rather than beautiful, a place with no air at all, and anywhere made by
// people. The camera never tilts (fitCamera), so each of these keeps its
// subject in the band a window actually shows — about 22 degrees above and
// below the horizon — and away from the middle, where the orb is.

// --- CHERRY BLOSSOMS --------------------------------------------------------
// Night blossom over still water: a canopy lit from below by lanterns, so it
// glows paler than the darkening sky behind it — the one way blossom reads at
// dusk — and a pond that gives the whole scene back, lanterns stretched into
// columns by the ripples. The water is not a second sky: it looks up what is
// above for the mirrored direction, so a pixel is drawn once either way.
const BLOSSOM_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uTap;
${NOISE}

// THE LANTERNS on the far bank: paper ones, one to a slot of azimuth with a
// few slots dark, hung at slightly different heights. An oval with dark caps
// and ribs, hottest at its heart; the halo dies inside its own slot, so one
// lookup a pixel is the whole cost.
vec3 lanterns(float ang, float e, float t) {
  float s = ang * 9.0;
  float i = floor(s);
  float h = hash13(vec3(i, 7.1, 3.3));
  if (h < 0.18) return vec3(0.0);
  float x = (fract(s) - 0.5 - (hash13(vec3(i, 1.7, 9.2)) - 0.5) * 0.3) / 9.0;
  float w = 0.0050 + 0.0022 * hash13(vec3(i, 8.8, 5.5));
  float y = e - (0.0125 + 0.0040 * hash13(vec3(i, 4.4, 2.1)));
  vec2 q = vec2(x / w, y / (w * 1.3));
  float r2 = dot(q, q);
  float body = smoothstep(1.0, 0.82, r2);
  float cap = smoothstep(0.62, 0.78, abs(q.y)) * step(abs(q.x), 0.55);
  float rib = smoothstep(0.10, 0.0, abs(fract(q.y * 2.2 + 0.5) - 0.5)) * 0.35;
  float flick = 0.90 + 0.10 * sin(t * (1.7 + h * 2.3) + h * 37.0);
  vec3 paper = mix(vec3(0.95, 0.36, 0.16), vec3(1.00, 0.55, 0.24), hash13(vec3(i, 2.2, 6.6)));
  vec3 hot = mix(paper, vec3(1.00, 0.84, 0.58), smoothstep(0.7, 0.0, r2));
  return (hot * body * (1.0 - rib) * (1.0 - cap * 0.85) + paper * exp(-r2 * 0.08) * 0.20) * flick;
}

// The far bank's trees: round crowns, one to a slot, two sizes overlapping.
float crowns(float ang, float scale, float seed, float lo, float hi) {
  float s = ang * scale + seed;
  float i = floor(s), f = fract(s) * 2.0 - 1.0;
  return (lo + (hi - lo) * hash13(vec3(i, seed, 3.0))) * sqrt(max(1.0 - f * f, 0.0));
}

// LIMBS hanging into the window from a tree beyond its top edge: each comes
// down at a slant to a tip, thinning as it goes, one to a slot of azimuth
// (some slots bare), with a set of smaller twigs at a finer slot. A limb
// crosses into its neighbours' slots on the way up, so each pixel asks its
// own slot and the two beside it. Returns the wood; near says how close the
// nearest limb is, because that is where the blossom gathers.
float limbs(float az, float e, float scale, float seed, float thick, float reach, out float near) {
  float s = az * scale;
  float i = floor(s);
  float wood = 0.0;
  near = 0.0;
  for (int k = -1; k <= 1; k++) {
    float j = i + float(k);
    if (hash13(vec3(j, seed, 1.0)) < 0.22) continue;
    float az0 = (j + 0.15 + 0.7 * hash13(vec3(j, seed, 2.0))) / scale;
    float e0 = 0.135 + 0.11 * hash13(vec3(j, seed, 3.0));
    // steep enough that a limb never leaves the three slots asked about
    // before it has faded out above the window
    float slope = (hash13(vec3(j, seed, 4.0)) < 0.5 ? -1.0 : 1.0) * (0.9 + 0.7 * hash13(vec3(j, seed, 5.0)));
    float up = e - e0;
    float la = az0 + up / slope + 0.010 * sin(up * 45.0 + j * 2.3) + 0.004 * sin(up * 130.0 + j);
    float dist = abs(az - la) * abs(slope) / sqrt(1.0 + slope * slope);
    float w = thick * (0.15 + 0.85 * clamp(up / reach, 0.0, 1.0));
    float keep = smoothstep(-0.003, 0.002, up) * smoothstep(0.42, 0.30, up);
    wood = max(wood, smoothstep(w, w * 0.55, dist) * keep);
    near = max(near, exp(-dist / 0.030) * smoothstep(-0.035, 0.01, up) * smoothstep(0.46, 0.30, up));
  }
  return wood;
}

// One layer of blossoms over (azimuth, elevation): a five-petalled flower to
// a cell wherever the clusters want one. Near a cluster's edge a flower
// shrinks instead of being cut, so the edge frays into single flowers
// rather than ending on a line. Returns (cover, heart).
vec2 blossoms(vec2 p, float scale, float want, float seed) {
  vec2 g = p * scale;
  vec2 i = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash13(vec3(i, seed));
  float grow = smoothstep(h, h + 0.18, want);
  if (grow <= 0.0) return vec2(0.0);
  vec2 q = f - (vec2(hash13(vec3(i, seed + 1.1)), hash13(vec3(i, seed + 2.3))) - 0.5) * 0.30;
  float rho = length(q);
  float th = atan(q.y, q.x) + hash13(vec3(i, seed + 3.7)) * 6.2832;
  float R = (0.31 + 0.08 * hash13(vec3(i, seed + 4.9))) * (0.74 + 0.26 * abs(cos(2.5 * th))) * grow;
  return vec2(smoothstep(R, R - 0.07, rho), smoothstep(R * 0.40, 0.0, rho));
}

// THE CANOPY: night blossom (yozakura), lit from below by the lanterns, so
// it glows paler than the dark sky behind it — the one way blossom reads
// after sunset. Clumps gather along the limbs and thicken overhead; a clump's
// heart is a lit mass with the flowers only just showing in it, and its edge
// frays into single flowers in three layers, the deepest in shade. The open
// band of dusk above the far bank is left open.
//
// soft: for the pond. A mirror wrinkled by ripples shatters a crisp flower
// into stripes, so what the water gives back is the clumps without their
// flowers — which is also what a reflection of blossom looks like.
vec4 canopy(float az, float e, float t, float shiver, bool soft) {
  if (e < 0.09) return vec4(0.0);
  float a2 = az + shiver;
  float n1, n2;
  float wood = max(limbs(a2, e, 1.6, 4.0, 0.013, 0.26, n1), limbs(a2, e, 3.4, 9.0, 0.0050, 0.12, n2));
  float near = max(n1, n2 * 0.8);
  float mass = fbm(vec3(a2 * 9.0, e * 9.0, 4.0 + t * 0.01), 3);
  float want = clamp((mass - 0.38) * 3.0 + near * 1.0 + smoothstep(0.16, 0.36, e) * 0.6 - 0.12, 0.0, 1.0)
             * smoothstep(0.09, 0.13, e);
  float heart = smoothstep(0.62, 0.90, want);
  vec3 c = mix(vec3(0.420, 0.255, 0.355), vec3(0.540, 0.355, 0.455), smoothstep(0.80, 1.0, want));
  float a = heart * 0.95;
  if (soft) {
    a = smoothstep(0.35, 0.80, want) * 0.85;
  } else {
    vec2 p = vec2(a2, e);
    vec2 deep = blossoms(p, 44.0, want + 0.10, 5.0);
    vec2 mid = blossoms(p + 0.0053, 56.0, want, 2.0);
    vec2 front = blossoms(p + 0.0091, 70.0, want - 0.08, 9.0);
    // in the heart the gaps between flowers are shade, not sky
    c = mix(c, vec3(0.330, 0.180, 0.275), heart * (1.0 - max(mid.x, front.x)) * 0.55);
    c = mix(c, vec3(0.360, 0.200, 0.300), deep.x * (1.0 - heart));
    c = mix(c, vec3(0.540, 0.355, 0.455), mid.x);
    c = mix(c, vec3(0.670, 0.475, 0.565), front.x);
    c = mix(c, vec3(0.520, 0.200, 0.320), max(mid.y * mid.x, front.y * front.x) * 0.45);   // the hearts
    a = max(a, max(deep.x * 0.95, max(mid.x, front.x)));
  }
  // the lowest blossom is nearest the lanterns, and warmer
  c += vec3(0.09, 0.035, 0.0) * smoothstep(0.22, 0.12, e) * a;
  if (soft) wood *= 0.45;   // a dark line through rippled water reads as a crack
  c = mix(c, vec3(0.055, 0.035, 0.050), wood);
  return vec4(c, max(a, wood));
}

// Everything above the waterline, for any direction at or above it.
vec3 above(vec3 d, float t, float shiver, bool soft) {
  float e = max(d.y, 0.0);
  float ang = atan(d.z, d.x);
  float az = ang + 1.5707963;
  // dusk: deep blue overhead, mauve, a rose afterglow along the water
  vec3 col = mix(vec3(0.520, 0.300, 0.340), vec3(0.200, 0.140, 0.280), smoothstep(0.0, 0.14, e));
  col = mix(col, vec3(0.040, 0.045, 0.125), smoothstep(0.08, 0.45, e));
  // the sun went down off to the right, and its last light is still there
  float sunAz = cos(az - 0.85) * 0.5 + 0.5;
  col += vec3(0.26, 0.13, 0.05) * pow(sunAz, 5.0) * smoothstep(0.22, 0.0, e);
  // thin cloud catching it, low down only (and only looked up there)
  if (e < 0.22) {
    float wisp = fbm(vec3(ang * 2.4, e * 16.0, 3.0 + t * 0.003), 3);
    col = mix(col, vec3(0.60, 0.36, 0.40) * (0.75 + 0.5 * pow(sunAz, 3.0)),
              smoothstep(0.58, 0.78, wisp) * smoothstep(0.015, 0.05, e) * smoothstep(0.22, 0.08, e) * 0.40);
  }
  // the first stars, only where the sky has gone dark enough to show them
  vec3 sp = d * 150.0;
  vec3 si = floor(sp);
  if (hash13(si) > 0.9965) {
    vec3 sc = vec3(hash13(si + 1.3), hash13(si + 2.7), hash13(si + 3.9));
    col += vec3(0.80, 0.82, 1.0) * smoothstep(0.07, 0.0, length(fract(sp) - sc)) * smoothstep(0.16, 0.36, e) * 0.7;
  }
  // THE FAR SHORE: hills in haze, the bank's blossoming trees lit from below
  // by the lanterns hung under them, and mist lying on the water
  if (e < 0.06) {
    float hill = 0.020 + 0.018 * fbm(vec3(ang * 1.7, 2.0, 0.0), 3);
    col = mix(col, vec3(0.240, 0.165, 0.265), smoothstep(hill + 0.002, hill - 0.002, e) * 0.80);
    float bank = 0.004 + max(crowns(ang, 40.0, 1.3, 0.010, 0.026), crowns(ang, 26.0, 7.7, 0.008, 0.030));
    vec3 trees = vec3(0.420, 0.245, 0.340) * (0.80 + 0.35 * vnoise(vec3(ang * 160.0, e * 160.0, 1.0)));
    trees += vec3(0.22, 0.10, 0.03) * smoothstep(0.030, 0.008, e);
    trees = mix(trees, vec3(0.080, 0.050, 0.080), smoothstep(0.006, 0.002, e));
    col = mix(col, trees, smoothstep(bank + 0.0012, bank - 0.0012, e));
    col += lanterns(ang, e, t);
    col += vec3(0.26, 0.15, 0.17) * exp(-e / 0.008) * 0.45;
  }
  vec4 cn = canopy(az, e, t, shiver, soft);
  return mix(col, cn.rgb, cn.a);
}

void main() {
  vec3 d = normalize(vDir);
  float t = uTime;
  // a tap is a GUST: the canopy shivers for a moment and lets go of the
  // petals drawn outside this shader (makeGust)
  float g = max(t - uTap, 0.0);
  float shiver = 0.015 * sin(g * 9.0) * exp(-g * 1.5);
  vec3 col;
  if (d.y >= 0.0) col = above(d, t, shiver, false);
  else {
    // THE POND. Ripples wobble the mirrored direction mostly up and down —
    // that is what draws a lantern out into a column. Two kinds: slow swells
    // underfoot, read on the water's own plane, and fine bands that are even
    // in log-distance, so they stay steady right up to the far bank instead of
    // shimmering where the plane's coordinates run away.
    float de = -d.y;
    vec2 wp = d.xz / max(de, 0.02);
    float near = smoothstep(0.004, 0.05, de);
    float rip = (vnoise(vec3(wp.x * 0.7, wp.y * 2.2, t * 0.35)) - 0.5) * near;
    float band = (vnoise(vec3(d.x * 7.0, log(de) * 14.0, t * 0.5)) - 0.5) * smoothstep(0.0, 0.03, de);
    vec3 r = normalize(vec3(d.x + rip * 0.004, de * (1.0 + rip * 0.30) + band * 0.022, d.z));
    // still water mirrors almost everything at a glance and less underfoot
    float fres = 0.42 + 0.48 * smoothstep(0.30, 0.0, de);
    col = mix(vec3(0.030, 0.022, 0.050), above(r, t, shiver, true), fres);
    // THE LANTERNS' COLUMNS — what makes a light on water read as a light on
    // water: its reflection drawn down into a column of broken glints. The
    // lanterns are asked again with their height stretched about fourfold,
    // and the ripple bands cut the column into slivers.
    float ang = atan(d.z, d.x);
    float glint = smoothstep(0.35, 0.75, vnoise(vec3(ang * 40.0, log(max(de, 1e-4)) * 55.0, t * 0.9)));
    col += lanterns(ang + rip * 0.003, 0.0125 + (de - 0.0125) * 0.22, t) * glint * 0.60 * smoothstep(0.003, 0.012, de);
    // fallen petals afloat, gathered by the current into drifting rafts
    vec2 pq = wp * 3.2 + vec2(t * 0.05, 0.0);
    vec2 pi = floor(pq);
    vec2 pc = vec2(hash13(vec3(pi, 7.0)), hash13(vec3(pi, 9.0))) * 0.6 + 0.2;
    float raft = smoothstep(0.42, 0.68, fbm(vec3(wp * 0.25 + vec2(t * 0.012, 0.0), 6.0), 2));
    float pet = smoothstep(0.13, 0.06, length((fract(pq) - pc) * vec2(1.0, 1.6)))
              * step(1.0 - (0.06 + 0.60 * raft), hash13(vec3(pi, 4.0)));
    col = mix(col, vec3(0.600, 0.420, 0.500), pet * smoothstep(0.03, 0.10, de) * 0.90);
  }
  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- STORMY SEA -------------------------------------------------------------
// The violent room. A cloud deck dragged overhead by the wind, a strip of
// cold light far off under it with rain curtains hanging across, and a dark
// sea whose swell stands up against that light. The deck and the sea are both
// read on planes (a ceiling and a floor), so they recede the way weather
// does instead of sitting on the sky like a texture. A tap is lightning:
// the bolt is an object (makeBolt); the light it throws into the deck from
// inside is uFlash, which the bolt writes as it flickers.
const STORM_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uFlash;
uniform vec2 uBolt;    // where the strike is: bearing from straight ahead, and elevation (radians)
${NOISE}

// The swell as a height over the sea's own plane: long crests across the
// view, rolling in toward the eye.
float swellAt(vec2 q, float t) { return fbm(vec3(q, t * 0.10), 3); }

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float ang = atan(d.z, d.x);
  float az = ang + 1.5707963;
  float t = uTime;

  // a strike lights the deck for a long way around where it fell
  float dA = az - uBolt.x, dE = e - uBolt.y;
  float flash = uFlash * exp(-dA * dA * 10.0 - dE * dE * 14.0);
  // and somewhere off to the right the sun is still behind all of it: the
  // one place the light breaks through, which gives the storm a direction
  float breakAz = exp(-pow(az - 0.38, 2.0) * 7.0);

  // THE HORIZON IS NOT A LINE: the backs of the swell stand up against the
  // light. (Asked only where it can matter: the line never leaves this band.)
  float swellLine = abs(e) < 0.004 ? 0.0022 * fbm(vec3(ang * 26.0 - t * 0.35, t * 0.20, 0.5), 2) - 0.0006 : 0.0;
  vec3 col;
  if (e > swellLine) {
    // The perspective term runs away at the horizon; clamped, it crowds the
    // deck together as it recedes (cloudsea's lesson, the other way up).
    vec2 cp = d.xz / max(e, 0.035);
    vec2 wind = vec2(t * 0.050, t * 0.015);
    float w0 = fbm(vec3(cp * 0.22 + wind * 0.5, t * 0.010), 2);
    float dens = fbm(vec3(cp * 0.38 + wind + w0 * 1.6, t * 0.020), 4);
    vec3 cloud = mix(vec3(0.360, 0.375, 0.385), vec3(0.085, 0.095, 0.115), smoothstep(0.28, 0.62, dens));
    cloud *= 1.0 - 0.25 * smoothstep(0.10, 0.40, e);     // heavier overhead, nearer
    // THE BREAK: far off under the deck a strip of cold silver light, warmer
    // and brighter where the sun is, with rain hanging across it in curtains
    col = cloud;
    // (the strip and the scud are asked for only below 0.095, where they
    // show: their masks are zero above it, and they are five of the eleven
    // noise lookups this sky would otherwise make at every pixel)
    if (e < 0.095) {
      float under = smoothstep(0.095, 0.004, e);
      float shafts = fbm(vec3(ang * 7.0 + t * 0.04, e * 3.0, 9.0 + t * 0.02), 2);
      vec3 band = mix(vec3(0.420, 0.455, 0.460), vec3(0.640, 0.610, 0.520), breakAz);
      band *= 1.0 - 0.40 * smoothstep(0.45, 0.72, shafts);
      col = mix(cloud, band, under * under);
      // scud: low, ragged, dark cloud racing in front of the light
      float scud = fbm(vec3(ang * 6.0 - t * 0.06, e * 26.0, 3.0), 3);
      col = mix(col, vec3(0.110, 0.120, 0.135), smoothstep(0.52, 0.70, scud) * smoothstep(0.005, 0.025, e) * smoothstep(0.075, 0.035, e) * 0.85);
    }
    // the deck's underside catches that light where it is thin
    col += vec3(0.16, 0.14, 0.10) * breakAz * smoothstep(0.20, 0.03, e) * (1.0 - smoothstep(0.30, 0.65, dens));
    // LIGHTNING, from inside: the thin parts of the deck take the light and
    // the heavy lumps stand dark against it, which is what makes it a cloud.
    // Held to about a third added at the strike: at twice that the deck
    // went flat white across half the sky, and the strike was lost in it.
    col += vec3(0.40, 0.42, 0.55) * flash * (0.10 + 0.50 * (1.0 - smoothstep(0.30, 0.75, dens)));
  } else {
    float de = -e;
    vec2 sp = d.xz / max(de, 0.008);
    // the swell, and its slope toward the eye: a crest's back catches the
    // bright strip on the horizon, its face holds the dark sky overhead
    vec2 q = vec2(sp.x * 0.30, sp.y * 0.85 - t * 0.9);
    float h = swellAt(q, t);
    float slope = h - swellAt(q + vec2(0.0, 0.10), t);
    float chop = fbm(vec3(sp.x * 0.9 - t * 0.3, sp.y * 2.4 - t * 1.6, t * 0.4), 2);
    float far = smoothstep(0.12, 0.0, de);
    float near = smoothstep(0.008, 0.05, de);
    // near the eye the chop has its own small faces, too fine for the swell
    float fine = vnoise(vec3(sp.x * 2.6 - t * 0.8, sp.y * 6.0 - t * 2.4, t)) - 0.5;
    float back = smoothstep(-0.03, 0.07, slope + (chop - 0.45) * 0.18 + fine * 0.05 * near);
    vec3 dark = vec3(0.036, 0.066, 0.072);
    vec3 lit = mix(vec3(0.200, 0.235, 0.240), vec3(0.420, 0.420, 0.380), breakAz);
    vec3 sea = mix(dark, lit, back * (0.45 + 0.55 * far));
    sea = mix(sea, mix(vec3(0.300, 0.325, 0.330), vec3(0.500, 0.480, 0.420), breakAz), far * far * 0.60);
    // whitecaps where a high swell breaks, and spindrift torn off downwind
    float cap = smoothstep(0.55, 0.68, h + chop * 0.30) * smoothstep(0.0, 0.04, slope);
    sea = mix(sea, vec3(0.560, 0.600, 0.600), cap * 0.75 * near);
    float drift = vnoise(vec3(sp.x * 0.10 - t * 0.5, sp.y * 1.8, 2.0));
    sea += vec3(0.08, 0.09, 0.09) * smoothstep(0.66, 0.88, drift) * smoothstep(0.50, 0.70, h) * near;
    // the strike again, in the water: a broken column under it, a wash around
    sea += vec3(0.42, 0.45, 0.60) * uFlash * exp(-dA * dA * 30.0) * (0.25 + 0.75 * far) * back * 0.35;
    sea += vec3(0.30, 0.32, 0.42) * flash * 0.15;
    col = sea;
  }
  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- EARTHRISE --------------------------------------------------------------
// The still room, and the only one with no air: so a black sky right down to
// the horizon, stars that are points rather than glows, and light that falls
// from one low sun with nothing to soften it — every crater wall is lit or it
// is black. The Earth hangs over the horizon, lit by the same sun from the
// same side as the ground.
//
// WHERE THE EARTH HANGS depends on the window. Everything else in these
// skies is a band around the horizon, which any window shows; one body in
// one place is either beside the orb or behind it. A phone's window is a tall
// strip (about 11 degrees each side of the orb) and a desktop's is a wide one
// (about 33), so a fixed place would hide the Earth on one of them. The
// vertex shader reads the window's shape from the projection itself and puts
// the Earth in the open sky either way: up and to the left, out of the orb's
// way. (The projection is the camera's own, so the Room tab's photographs get
// an Earth that fits their square too.)
const MOON_VERT = `
varying vec3 vDir;
varying vec3 vEarth;
void main() {
  vDir = position;
  float tw = 1.0 / projectionMatrix[0][0];   // tan of the half-width this camera sees
  float th = 1.0 / projectionMatrix[1][1];   // and of its half-height
  float wide = clamp((tw / th - 0.7) / 0.8, 0.0, 1.0);   // 0 a phone held upright .. 1 a desktop
  vec2 at = mix(vec2(-0.40 * tw, 0.66 * th), vec2(-0.52 * tw, 0.42 * th), wide);
  vEarth = normalize(vec3(at.x, at.y, -1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const MOON_FRAG = `
precision highp float;
varying vec3 vDir;
varying vec3 vEarth;
uniform float uTime, uBright;
${NOISE}

// A star with nothing in front of it: no twinkle and no halo, a point. The
// cutoff is hard and the brightness lives in the colour.
vec3 hardStars(vec3 d, float scale, float thresh, float size) {
  vec3 p = d * scale;
  vec3 i = floor(p);
  float h = hash13(i);
  if (h < thresh) return vec3(0.0);
  float mag = (h - thresh) / (1.0 - thresh);
  vec3 c = vec3(hash13(i + 1.3), hash13(i + 2.7), hash13(i + 3.9));
  float core = smoothstep(size, size * 0.55, length(fract(p) - c));
  float temp = hash13(i + 5.1);
  vec3 tint = temp > 0.80 ? vec3(0.78, 0.86, 1.00) : temp > 0.35 ? vec3(1.00, 0.98, 0.95) : vec3(1.00, 0.88, 0.74);
  return tint * core * (0.30 + 0.75 * mag * mag);
}

// THE EARTH, in its own frame: x to the right, y up, z toward the eye. The
// sun comes from the right and a little from behind us, so it is a gibbous
// Earth, as it is in the photograph this room is named for.
vec3 earth(vec3 d, vec3 c, float R, float t, out float cover) {
  cover = 0.0;
  vec3 rt = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, c);
  vec2 q = vec2(dot(d, rt), dot(d, up)) / R;
  float r2 = dot(q, q);
  if (dot(d, c) < 0.0 || r2 > 1.7) return vec3(0.0);
  vec3 L = vec3(0.920, 0.180, 0.348);
  float rr = sqrt(r2);
  // the air, lit: a thin blue skin on the day side's limb
  float limbLit = max(dot(q / max(rr, 1e-3), normalize(L.xy)), 0.0);
  vec3 glow = vec3(0.20, 0.40, 0.85) * exp(-max(rr - 1.0, 0.0) * 26.0) * limbLit * 0.40;
  if (r2 >= 1.0) return glow;
  cover = smoothstep(1.0, 0.94, r2);
  vec3 n = vec3(q, sqrt(1.0 - r2));
  float lam = dot(n, L);
  // turning, about an axis tipped as the real one is, slowly enough to be still
  float tilt = 0.41, sa = t * 0.012;
  vec3 m = vec3(n.x * cos(tilt) - n.y * sin(tilt), n.x * sin(tilt) + n.y * cos(tilt), n.z);
  vec3 s = vec3(m.x * cos(sa) + m.z * sin(sa), m.y, -m.x * sin(sa) + m.z * cos(sa));
  float land = fbm(s * 2.3 + 4.0, 4);
  float isLand = smoothstep(0.52, 0.56, land);
  vec3 surf = mix(vec3(0.040, 0.105, 0.270), mix(vec3(0.200, 0.215, 0.110), vec3(0.330, 0.270, 0.170), smoothstep(0.56, 0.72, land)), isLand);
  surf = mix(surf, vec3(0.78, 0.80, 0.84), smoothstep(0.80, 0.90, abs(s.y) + (land - 0.5) * 0.2));   // the ice
  float clouds = smoothstep(0.48, 0.70, fbm(s * 3.6 + vec3(0.0, 0.0, t * 0.01), 4));
  surf = mix(surf, vec3(0.80, 0.82, 0.86), clouds * 0.85);
  float day = smoothstep(-0.06, 0.30, lam);
  vec3 col = surf * (0.03 + 0.97 * day * (0.55 + 0.45 * max(lam, 0.0)));
  // the sun's glint off open ocean
  vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
  col += vec3(0.30, 0.30, 0.28) * pow(max(dot(n, hv), 0.0), 60.0) * (1.0 - isLand) * (1.0 - clouds);
  // the night side keeps its cities
  float city = step(0.86, hash13(floor(s * 48.0))) * isLand * (1.0 - clouds);
  col += vec3(0.80, 0.55, 0.30) * city * smoothstep(0.10, -0.15, lam) * 0.45;
  col += vec3(0.20, 0.38, 0.75) * pow(1.0 - n.z, 2.5) * (0.25 + 0.75 * day) * 0.60;
  return col + glow;
}

// One field of craters: a bowl and a raised rim in some cells, small enough
// to stay inside its cell, most of them small and a few large. Returns the
// slope of the ground (x, y) and the crater's own shadow (z). A crater's
// depth goes with its width, so slopes do not depend on size — a small
// fresh crater is as steep as a big one — and with no air there is no
// light in a shadow at all: the rim on the sun's side throws one across
// the floor, as long as the crater is deep and the sun is low.
vec3 crater(vec2 p, float scale, float seed, float keep, vec2 sun) {
  vec2 g = p * scale;
  vec2 i = floor(g);
  vec2 f = fract(g) - 0.5;
  if (hash13(vec3(i, seed)) > keep) return vec3(0.0);
  vec2 c = (vec2(hash13(vec3(i, seed + 1.7)), hash13(vec3(i, seed + 3.1))) - 0.5) * 0.24;
  float k = hash13(vec3(i, seed + 5.3));
  float r = 0.07 + 0.17 * k * k;
  vec2 q = (f - c) / r;
  float rho = length(q);
  float u = (rho - 1.0) / 0.25;
  float dh = (rho < 1.0 ? rho : 0.0) - 0.9 * u * exp(-u * u);
  // old craters are worn soft; a few are fresh and sharp
  float depth = 0.16 + 0.34 * hash13(vec3(i, seed + 6.1));
  // a floor point is lit if, moved toward the sun by the shadow's length, it
  // is still inside the bowl — so the shadow is the bowl less itself
  // shifted, a crescent, as a round rim really throws one
  float shade = smoothstep(0.92, 1.06, length(q + sun * depth * 3.2)) * smoothstep(1.02, 0.92, rho);
  return vec3(dh * depth * (q / max(rho, 1e-3)), shade);
}

// The skyline of the moon: low rolling hills all round, and off to the right
// the wall of a far crater standing up off the plain.
float ridge(float az) {
  float hills = 0.006 + 0.012 * fbm(vec3(az * 3.0 + 3.0, 1.0, 0.0), 3);
  float wall = 0.030 * smoothstep(0.08, 0.38, az) * smoothstep(1.3, 0.7, az) * (0.55 + 0.45 * vnoise(vec3(az * 14.0, 4.0, 0.0)));
  return hills + wall;
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float t = uTime;
  float az = atan(d.z, d.x) + 1.5707963;
  // the one sun, for the ground: low (about 17 degrees), from the right
  vec3 L = vec3(0.880, 0.300, 0.368);

  float ridgeAt = ridge(az);
  vec3 col = vec3(0.0);
  if (e > ridgeAt) {
    // black, all the way down: there is no air to light
    // sized to be a pixel or two at any resolution: smaller would be lost
    // between pixels and twinkle, which a star seen from here never does
    col += hardStars(d, 190.0, 0.9850, 0.200);
    col += hardStars(d, 95.0, 0.9945, 0.150) * 1.5;
    col += hardStars(d, 46.0, 0.9984, 0.110) * 2.2;
    float cover;
    vec3 globe = earth(d, normalize(vEarth), 0.046, t, cover);
    col = col * (1.0 - cover) + globe;
  } else if (e > 0.0) {
    // the hills' faces: turned toward the sun where the skyline falls away
    // to the right, and toward the eye (the sun is a little behind it) in all
    float face = clamp(0.5 - (ridge(az + 0.012) - ridgeAt) * 60.0, 0.0, 1.0);
    float rough = vnoise(vec3(az * 40.0, e * 90.0, 2.0));
    col = vec3(0.300, 0.295, 0.285) * (0.40 + 0.65 * face) * (0.80 + 0.40 * rough);
    col += vec3(0.08) * smoothstep(ridgeAt - 0.0025, ridgeAt, e) * face;   // the lit crest
    col = col / (1.0 + col * 0.60);
  } else {
    // THE GROUND, as a plane under the eye: craters at three scales, lit by
    // their slopes, and the detail fading toward the horizon before it can
    // shimmer
    float de = -e;
    vec2 p = d.xz / max(de, 0.004);
    float near = smoothstep(0.006, 0.06, de);
    vec2 sun = normalize(L.xz);
    vec3 c1 = crater(p, 0.16, 1.0, 0.45, sun), c2 = crater(p, 0.55, 7.0, 0.55, sun), c3 = crater(p, 1.9, 13.0, 0.65, sun);
    vec2 grad = (c1.xy + c2.xy + c3.xy * near) * near;
    vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
    float lit = max(dot(n, L), 0.0) * (1.0 - 0.94 * max(max(c1.z, c2.z), c3.z * near) * near);
    // mare and highland: broad patches of darker and paler ground; and a
    // gentle swell to the plain so it is not a floor
    float albedo = 0.80 + 0.30 * fbm(vec3(p * 0.045, 5.0), 2);
    albedo *= 0.82 + 0.36 * vnoise(vec3(p * 0.5, 8.0)) * (0.3 + 0.7 * near);
    albedo *= 0.90 + 0.20 * vnoise(vec3(p * 6.0, 9.0)) * near * near;   // the regolith's own grain
    col = vec3(0.98, 0.96, 0.93) * lit * albedo * 1.15;
    // stones: a lit side toward the sun, a black one away from it
    vec2 sg = p * 7.0;
    vec2 si = floor(sg);
    if (hash13(vec3(si, 21.0)) > 0.975) {
      vec2 so = fract(sg) - 0.5;
      float st = smoothstep(0.16, 0.10, length(so));
      col = mix(col, vec3(0.55, 0.54, 0.52) * (0.45 + 0.9 * smoothstep(-0.1, 0.12, so.x)), st * near);
      col *= 1.0 - smoothstep(0.20, 0.10, length(so + vec2(0.16, 0.0))) * (1.0 - st) * 0.85 * near;
    }
    // earthshine: the faint blue fill a shadow gets from the Earth overhead
    col += vec3(0.012, 0.016, 0.026);
    // A shoulder, as above the clouds: a crater wall square to the sun would
    // otherwise come out white and bloom, and this is a grey world. (The
    // stars and the Earth are left out of it: they are meant to shine.)
    col = col / (1.0 + col * 0.60);
  }
  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- NEON CITY --------------------------------------------------------------
// The made room: the only place in the set that people built. A skyline in
// three depths — far towers in the glow, a middle row, near blocks nearly
// black — with signs in neon's few honest colours on the near ones, their
// light bleeding out through the rain, and a wet street that gives it all
// back smeared into vertical streaks. Low cloud overhead, lit from under by
// the whole city. As with the pond, the street looks up the city for its
// mirrored direction instead of drawing it twice.
const NEON_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright;
${NOISE}

vec3 neonHue(float h) {
  return h < 0.30 ? vec3(1.00, 0.16, 0.52)     // magenta
       : h < 0.55 ? vec3(0.10, 0.85, 1.00)     // cyan
       : h < 0.72 ? vec3(1.00, 0.55, 0.12)     // amber
       : h < 0.86 ? vec3(0.62, 0.30, 1.00)     // violet
                  : vec3(1.00, 0.20, 0.16);    // red
}

// One row of buildings as a roofline in azimuth: every slot a building, its
// height squared so most are low and a few are towers, some with a stepped
// crown and the tallest with a mast.
float roofline(float az, float dens, float base, float span, float seed, out float id, out float fx) {
  float s = az * dens + seed;
  id = floor(s);
  fx = fract(s);
  float h = hash13(vec3(id, seed, 2.0));
  float top = base + span * pow(h, 1.7);
  if (hash13(vec3(id, seed, 5.0)) > 0.6 && abs(fx - 0.5) > 0.30) top -= span * 0.22 * h * h;
  if (h > 0.86 && abs(fx - 0.5) < 0.03) top += 0.025;
  return top;
}

// The red light on top of a mast, blinking slowly, as it must for aircraft.
float beacon(float fx, float e, float top, float id, float dens, float t) {
  vec2 q = vec2((fx - 0.5) / dens, e - top + 0.002);
  return smoothstep(0.0025, 0.0008, length(q)) * step(abs(fx - 0.5), 0.03) * step(0.5, fract(t * 0.5 + id * 0.37));
}

// A face of windows: a grid on the building, most dark, a few lit warm and a
// few cool. Soft-edged, so a far row is a texture rather than a moire, and
// none in the building's outer edges, so neighbours stay apart.
float windows(float fx, float e, float id, float cols, float rows, float lit, out vec3 tint) {
  vec2 g = vec2(fx * cols, e * rows);
  vec2 cell = floor(g), f = fract(g);
  float h = hash13(vec3(cell, id));
  tint = h > 1.0 - lit * 0.3 ? vec3(0.55, 0.80, 0.95) : vec3(1.00, 0.78, 0.48);
  float shape = smoothstep(0.12, 0.26, f.x) * smoothstep(0.88, 0.74, f.x) * smoothstep(0.14, 0.28, f.y) * smoothstep(0.86, 0.72, f.y);
  float inside = smoothstep(0.03, 0.09, fx) * smoothstep(0.97, 0.91, fx);
  return step(1.0 - lit, h) * shape * inside;
}

vec3 city(float az, float e, float t) {
  // LOW CLOUD, lit from below: magenta near the roofs, indigo overhead,
  // and the orange of the street lamps right down at the horizon. The cloud
  // is read on a ceiling, so it crowds together toward the skyline.
  float k = max(e, 0.035);
  float cl = fbm(vec3(az / k * 0.40 + t * 0.008, 1.0 / k * 0.45, t * 0.01), 3);
  float lowGlow = exp(-e / 0.12);
  vec3 col = mix(vec3(0.030, 0.026, 0.072), vec3(0.340, 0.110, 0.280), lowGlow);
  col += vec3(0.20, 0.06, 0.05) * exp(-e / 0.025);
  col *= 0.65 + 0.70 * cl * (0.4 + 0.6 * lowGlow);
  col += vec3(0.16, 0.05, 0.13) * smoothstep(0.50, 0.78, cl) * exp(-e / 0.22);   // the cloud's lit underside

  float id, fx, w;
  vec3 tint;
  // FAR: tall and faint, standing in the glow
  float top = roofline(az, 14.0, 0.050, 0.170, 3.0, id, fx);
  if (e < top) {
    col = mix(col, vec3(0.165, 0.070, 0.185), 0.85);
    w = windows(fx, e, id, 9.0, 330.0, 0.25, tint);
    col += vec3(0.60, 0.42, 0.38) * w * 0.32;
  }
  vec3 glow = vec3(1.0, 0.12, 0.10) * beacon(fx, e, top, id, 14.0, t) * step(0.86, hash13(vec3(id, 3.0, 2.0)));
  // MIDDLE, with a lit billboard along the top of a few
  top = roofline(az, 22.0, 0.025, 0.110, 11.0, id, fx);
  if (hash13(vec3(id, 11.0, 8.0)) > 0.70) {
    vec3 hue = neonHue(hash13(vec3(id, 11.0, 12.0)));
    float bx = abs(fx - 0.5) - 0.32;
    float by = abs(e - (top - 0.010)) - 0.0045;
    float dist = length(vec2(max(bx, 0.0) / 22.0, max(by, 0.0)));
    float board = step(bx, 0.0) * step(by, 0.0);
    glow += hue * board * 0.85 + hue * exp(-dist / 0.006) * 0.22 * (1.0 - board);
  }
  if (e < top) {
    col = vec3(0.070, 0.036, 0.090);
    w = windows(fx, e, id, 8.0, 240.0, 0.30, tint);
    col += tint * w * 0.45;
  }
  // NEAR: big, dark blocks, a few of them towers, and the signs hung off them
  float nid, nfx;
  float ntop = roofline(az, 8.0, 0.045, 0.300, 23.0, nid, nfx);
  // nearer the edges of the view the blocks stand taller, as the near side
  // of a street does: the skyline frames the window instead of lying flat
  ntop = 0.045 + (ntop - 0.045) * (0.55 + 0.9 * smoothstep(0.10, 0.55, abs(az)));
  float hs = hash13(vec3(nid, 23.0, 8.0));
  if (hs > 0.25) {
    // a vertical sign: where on the face, how tall, what colour
    float slotW = 1.0 / 8.0;
    float sx = 0.25 + 0.5 * hash13(vec3(nid, 23.0, 9.0));
    float wx = 0.065 * slotW;                         // half its width, in radians
    float y0 = ntop * (0.25 + 0.20 * hash13(vec3(nid, 23.0, 10.0)));
    float y1 = min(ntop * (0.70 + 0.20 * hash13(vec3(nid, 23.0, 11.0))), y0 + 0.15);
    vec3 hue = neonHue(hash13(vec3(nid, 23.0, 12.0)));
    // a few are failing: they stutter
    float on = hs > 0.90 ? (hash13(vec3(floor(t * 9.0), nid, 3.0)) > 0.25 ? 1.0 : 0.15) : 1.0;
    float x = (nfx - sx) * slotW;                     // radians from its centre line
    float dist = length(vec2(max(abs(x) - wx, 0.0), max(max(y0 - e, e - y1), 0.0)));
    float inBoard = step(abs(x), wx) * step(y0, e) * step(e, y1);
    float border = inBoard * (1.0 - step(abs(x), wx * 0.80) * step(y0 + wx * 0.20, e) * step(e, y1 - wx * 0.20));
    // the characters, stacked down it: each a 3x3 of strokes, some lit
    float cw = wx * 1.25;
    vec2 cp = vec2(x / cw + 0.5, (y1 - wx * 0.4 - e) / (cw * 1.2));
    vec2 ci = vec2(0.0, floor(cp.y));
    vec2 cf = vec2(cp.x, fract(cp.y) * 1.2);
    vec2 sub = floor(cf * 3.0);
    vec2 sf = fract(cf * 3.0);
    float lit3 = step(0.48, hash13(vec3(sub + ci * 5.0, nid)));
    float horiz = step(0.5, hash13(vec3(sub + ci * 5.0, nid + 0.5)));
    float bar = mix(step(abs(sf.x - 0.5), 0.20), step(abs(sf.y - 0.5), 0.20), horiz);
    float glyph = inBoard * lit3 * bar * step(0.0, cf.x) * step(cf.x, 1.0) * step(cf.y, 1.0) * step(y0 + wx * 0.4, e);
    glow += hue * (inBoard * 0.20 + border * 0.75 + glyph * 0.85) * on;
    // and the light it throws into the wet air around it
    glow += hue * exp(-dist / 0.016) * 0.34 * on * (1.0 - inBoard);
  }
  if (e < ntop) {
    col = vec3(0.024, 0.016, 0.036);
    w = windows(nfx, e, nid, 12.0, 160.0, 0.28, tint);
    col += tint * w * 0.50;
  }
  // rain across the light: the halos come through in streaks
  float streak = vnoise(vec3(az * 230.0, e * 9.0 + t * 7.0, 0.0));
  return col + glow * (0.80 + 0.40 * streak);
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float az = atan(d.z, d.x) + 1.5707963;
  float t = uTime;
  vec3 col;
  if (e >= 0.0) col = city(az, e, t);
  else {
    // THE WET STREET. Rough wet asphalt stretches every light into a long
    // smear under itself, so the street mirrors the city squeezed upward:
    // what stands a degree above the horizon is seen nearly three below.
    // A slow wobble breaks the smear up; a fast one would only zigzag.
    float de = -e;
    vec2 wp = d.xz / max(de, 0.02);
    float wob = vnoise(vec3(az * 50.0, log(de) * 10.0, t * 0.4)) - 0.5;
    vec3 refl = city(az + wob * 0.0025, de * 0.36 * (1.0 + 0.30 * wob), t);
    // puddles mirror cleanly; the asphalt between only glows
    float pud = smoothstep(0.40, 0.62, fbm(vec3(wp * 0.35, 2.0), 2));
    float glance = 0.50 + 0.50 * smoothstep(0.30, 0.0, de);
    col = vec3(0.032, 0.026, 0.042) + refl * mix(0.25, 0.85, pud) * glance;
    col += vec3(0.10, 0.03, 0.06) * exp(-de / 0.03);   // street-level haze, lit by everything
  }
  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --- SAND PLATE -------------------------------------------------------------
// The room that listens. Built 2026-10-22, the week Colin's video on the
// Egyptians shaping the pyramids with cymatics passed 90k views in thirty
// hours; he said "go crazy. build us something amazing". A vast dark plate
// under the orb, sand on it, and the sand gathered along the nodal lines of
// a standing wave — Chladni's figure for a square plate, drawn on the floor
// plane the way the moon draws its craters and the pond its ripples. The
// figure is PERIODIC (the plate's function repeats every two units), so one
// cell of it fills the window's bottom and the rest tile away to the horizon:
// the standing wave of a plate with no edge. What drives it is the presence's
// own voice (the ear in createEnvironments: a note picks the rung of the
// ladder, loudness lifts the grains) and, left alone, it drifts through the
// figures by itself. A tap is a strike (makeStrike).
//
// The sand is a band around the nodal line measured as |f| / |grad f| — about
// the distance to the line, in the plate's own units — so the band is as wide
// on a fine figure as on a coarse one once scaled by the mode, and it has an
// edge of grain rather than a line. It is lit from one low light, so each
// ridge has a lit flank and a dark one: that, and the grain, is what makes a
// line of sand read as sand. Cost: eight cosines and eight sines for the two
// rungs, three noise lookups (grain, pile, brush) and two hashes on the
// plate, one two-octave fbm above it — under the storm's eleven.
const PLATE_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime, uBright, uTap;
uniform vec2 uModeA, uModeB;   // the two rungs of the ladder the figure stands between (plate.mjs LADDER)
uniform float uBlend;          // how far from the first rung to the second
uniform float uAgit;           // how hard the plate is driven: 0 the sand lies still, 1 every grain is in the air
uniform vec4 uRipple;          // a strike: where it fell (x, y in figure units), the ring's radius, its height
${NOISE}

#define PI 3.14159265

// Chladni's figure for the pair nm at q, and its gradient: (f, df/dx, df/dy).
// f = cos(n pi x) cos(m pi y) - cos(m pi x) cos(n pi y)
vec3 figure(vec2 q, vec2 nm) {
  vec2 a = nm.x * PI * q, b = nm.y * PI * q;
  vec2 ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
  return vec3(ca.x * cb.y - cb.x * ca.y,
              PI * (nm.y * sb.x * ca.y - nm.x * sa.x * cb.y),
              PI * (nm.x * cb.x * sa.y - nm.y * ca.x * sb.y));
}

void main() {
  vec3 d = normalize(vDir);
  float t = uTime;
  // THE ONE LIGHT: low, from the left and a little ahead, about sixteen degrees
  // up — the angle a plate is photographed at, so every ridge throws a shadow
  vec3 L = normalize(vec3(-0.72, 0.28, -0.62));
  vec3 haze = vec3(0.105, 0.086, 0.066);
  vec3 col;
  if (d.y >= 0.0) {
    // THE HALL above the plate: dark, with the light's warm haze lying along
    // the far edge, strongest where the light is
    float e = d.y;
    float toward = max(0.0, dot(normalize(d.xz), normalize(L.xz)));
    col = mix(vec3(0.011, 0.011, 0.015), haze, exp(-e * 7.0) * (0.35 + 0.65 * toward));
    col += vec3(0.030, 0.024, 0.018) * fbm(vec3(d * 3.0 + vec3(0.0, t * 0.01, 0.0)), 2) * exp(-e * 3.5);
  } else {
    float de = -d.y;
    vec2 p = d.xz / max(de, 0.004);              // the plate, from an eye one unit above it
    float near = smoothstep(0.015, 0.14, de);    // detail fades toward the horizon before it can shimmer
    // figure units: the near cell [-1, 1]^2 spans 2.4..5.4 ahead — from the
    // window's bottom edge (22.5 degrees down) up to a third of the way to the horizon
    vec2 q = vec2(p.x, p.y + 3.9) * (2.0 / 3.0);
    vec3 F = mix(figure(q, uModeA), figure(q, uModeB), uBlend);
    float k = mix(dot(uModeA, uModeA), dot(uModeB, uModeB), uBlend);   // the plate's frequency, n^2 + m^2
    // how far to the nearest nodal line: |f| over its slope. The slope is
    // floored: where two lines cross it vanishes, and the sand gathers there too.
    float grad = length(F.yz) + 0.35;
    float dist = abs(F.x) / grad;
    // a strike's ring, running out across the sand from where the blow fell
    float rr = length(q - uRipple.xy);
    float ring = exp(-pow((rr - uRipple.z) / 0.20, 2.0)) * uRipple.w;
    float agit = min(1.0, uAgit + ring);
    // THE SAND. The band is as wide as the mode allows — a finer figure, finer
    // lines — and spreads when the plate is driven; its edge is grain, not a
    // line; and the sand is thin here and heaped there along the line.
    float w = (0.10 / sqrt(k)) * (1.0 + 0.9 * agit);
    float grain = fbm(vec3(q * 48.0, 2.0), de > 0.07 ? 3 : 2);
    float pile = fbm(vec3(q * 2.6, 7.0), 2);
    float heap = 0.50 + 0.95 * pile;
    float edge = dist + (grain - 0.5) * w * (0.9 + 1.3 * agit);
    float u = clamp((w - edge) / (0.75 * w), 0.0, 1.0);
    // driven, the sand on the lines thins: what left them is in the air below
    float sand = u * u * (3.0 - 2.0 * u) * heap * mix(0.25, 1.0, near) * (1.0 - 0.40 * agit);
    // the ridge's slope, for the light: the band's own edge, along the figure's gradient
    float dSand = 6.0 * u * (1.0 - u) / (0.75 * w);
    vec2 slope = -dSand * sign(F.x) * (F.yz / grad) * 0.045 * heap;
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    float lit = max(dot(n, L), 0.0);
    // THE PLATE: dark steel, brushed along its length, the low light lying on
    // it in one long glance, the haze lying on it toward the far edge
    float brush = vnoise(vec3(p.x * 60.0, p.y * 2.0, 1.0));
    vec3 plate = vec3(0.038, 0.040, 0.048) * (0.75 + 0.5 * brush);
    float glance = pow(max(dot(reflect(d, vec3(0.0, 1.0, 0.0)), L), 0.0), 14.0);
    plate += vec3(0.16, 0.14, 0.12) * glance * (0.4 + 0.6 * brush);
    plate += haze * 0.8 * smoothstep(0.25, 0.0, de);
    // the sand, lit: pale quartz, its lit flank catching the low light, the other in its own shadow
    vec3 quartz = vec3(0.82, 0.74, 0.60) * (0.30 + 0.70 * lit) * (0.72 + 0.56 * grain);
    col = mix(plate, quartz, sand);
    // GRAINS IN THE AIR. Loose sand lies about off the lines; when the plate is
    // driven the grains jump and catch the light, re-rolled a dozen times a
    // second so they dance rather than slide. A ring throws its own crest up.
    vec2 gq = q * 64.0;
    vec2 gi = floor(gq);
    float gc = smoothstep(0.30, 0.12, length(fract(gq) - 0.5)) * near;
    float lying = step(0.965, hash13(vec3(gi, 3.0))) * gc * (1.0 - sand);
    float jumping = step(1.0 - 0.30 * agit, hash13(vec3(gi, 11.0 + floor(t * 12.0)))) * gc * agit;
    col += quartz * (lying * 0.35 + jumping * 1.1 + ring * 0.75 * near);
    // a shoulder, as the moon has: a flank square to the light would bloom, and this is sand
    col = col / (1.0 + col * 0.45);
    col = mix(col, haze, smoothstep(0.05, 0.0, de));   // into the haze at the far edge
  }
  col = pow(max(col, 0.0), vec3(2.2)) * uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

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

// PETALS ARE NOT SNOW. A round dot falling reads as snow whatever its
// colour; a petal is longer than it is wide, notched at its tip, and turns as
// it falls — edge-on it all but vanishes, face-on it catches the light. This
// is three's own points material with those three things written in (its
// size, attenuation and colour encode stay three's), and one program for
// every petal in the room: the source of the function below is the program's
// cache key, and it is the same source for all of them.
function petalize(mat, u) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.vertexShader = 'attribute float aSeed;\nuniform float uTime;\nvarying float vSeed;\nvarying float vTurn;\n'
      + shader.vertexShader.replace('gl_PointSize = size;',
        'vSeed = aSeed;\n\tvTurn = abs(sin(uTime * (0.9 + aSeed * 1.7) + aSeed * 43.0));\n\tgl_PointSize = size * (0.35 + 0.65 * vTurn);');
    shader.fragmentShader = 'uniform float uTime;\nvarying float vSeed;\nvarying float vTurn;\n'
      + shader.fragmentShader.replace('#include <map_particle_fragment>', [
        'vec2 pp = gl_PointCoord - 0.5;',
        'float pa = vSeed * 6.2832 + uTime * (0.3 + vSeed * 0.5);',
        'pp = mat2(cos(pa), -sin(pa), sin(pa), cos(pa)) * pp;',
        'pp.x /= 0.55;',
        'float notch = smoothstep(0.10, 0.0, abs(pp.x)) * smoothstep(0.30, 0.48, pp.y);',
        'diffuseColor.a *= smoothstep(0.5, 0.38, length(pp)) * (1.0 - notch);',
        'diffuseColor.rgb *= 0.70 + 0.40 * vTurn;',
      ].join('\n\t'));
  };
  return mat;
}
function petalLayer(count, radius, size, opacity, speed, sway, u) {
  const L = snowLayer(count, radius, size, opacity, speed, sway);
  L.pts.material.map = null;   // the petal is drawn, not sampled
  L.pts.material.color.setHex(0xf2b2c8);
  petalize(L.pts.material, u);
  L.gust = 1;                  // a tap's wind carries these too (see tick)
  return L;
}

// RAIN IS A STREAK, not a dot: one short line per drop, its tail laid back
// along its own fall every frame. A point is round and still, and the eye
// never sees a raindrop as either. (Lines are one pixel wide on every GPU,
// which is about what a drop is.) No drop starts nearer the camera than
// z = 2.5: closer, a streak half a unit long would cross a third of the
// window, which reads as a scratch on the glass.
function rainField(count, span, len, color, opacity) {
  const pos = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() * 2 - 1) * span, y = (Math.random() * 2 - 1) * span;
    const z = -span + Math.random() * (span + 2.5);
    pos[i * 6] = pos[i * 6 + 3] = x;
    pos[i * 6 + 1] = y; pos[i * 6 + 4] = y + len;
    pos[i * 6 + 2] = pos[i * 6 + 5] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return lines;
}

// LIGHT WITH A LENGTH — a bolt, a passing train: a strip of quads with a soft
// cross-section. The meteor is a line, and a line is one pixel wide on every
// GPU (linewidth is ignored): right for a meteor, a crack for a strike.
// aAlong runs 0 at the tail to 1 at the head; uFade 1 fades the tail away.
const RIBBON_VERT = `
attribute float aAlong;
attribute float aAcross;
varying float vAlong;
varying float vAcross;
void main() {
  vAlong = aAlong;
  vAcross = aAcross;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIBBON_FRAG = `
precision highp float;
varying float vAlong;
varying float vAcross;
uniform vec3 uColor, uTail;
uniform float uOpacity, uFade;
void main() {
  float core = 1.0 - abs(vAcross);
  float a = core * core * mix(1.0, vAlong * vAlong, uFade) * uOpacity;
  gl_FragColor = vec4(mix(uTail, uColor, vAlong), a);
  #include <colorspace_fragment>
}`;
function ribbonMesh(strips, n, color, tail = color) {
  const nv = strips * n * 2;
  const along = new Float32Array(nv), across = new Float32Array(nv);
  const idx = [];
  for (let s = 0; s < strips; s++) {
    for (let i = 0; i < n; i++) {
      const v = (s * n + i) * 2;
      across[v] = -1; across[v + 1] = 1;
      along[v] = along[v + 1] = i / (n - 1);
      if (i < n - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geo.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uTail: { value: new THREE.Color(tail) },
      uOpacity: { value: 0 }, uFade: { value: 0 },
    },
    vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
    // BOTH SIDES. layStrip turns the strip across its own path, so which way
    // its triangles wind depends on which way the path runs — and as built,
    // a strike or a train is wound away from the eye whichever way it goes.
    // One-sided, three culled every one of them and no tap drew anything.
    side: THREE.DoubleSide,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
// Strip s of a ribbon laid along n points (flat x,y,z), w0 wide at its first
// point and w1 at its last, turned to face the eye. The eye is near the
// origin, so "facing" is across both the path and the line out to each point.
const _along = new THREE.Vector3(), _out = new THREE.Vector3(), _side = new THREE.Vector3();
function layStrip(mesh, s, n, pts, w0, w1) {
  const pos = mesh.geometry.attributes.position.array;
  for (let i = 0; i < n; i++) {
    const j = Math.min(i + 1, n - 1) * 3, k = Math.max(i - 1, 0) * 3;
    _along.set(pts[j] - pts[k], pts[j + 1] - pts[k + 1], pts[j + 2] - pts[k + 2]);
    _out.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    _side.crossVectors(_along, _out).normalize().multiplyScalar(w0 + (w1 - w0) * (i / (n - 1)));
    const v = (s * n + i) * 6;
    pos[v] = _out.x - _side.x; pos[v + 1] = _out.y - _side.y; pos[v + 2] = _out.z - _side.z;
    pos[v + 3] = _out.x + _side.x; pos[v + 4] = _out.y + _side.y; pos[v + 5] = _out.z + _side.z;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}
// A point on a sphere of radius R around the eye: az from straight ahead
// (+ is right), el up from the horizon — the skies' own two angles.
function onSphere(out, i, az, el, R) {
  out[i * 3] = Math.sin(az) * Math.cos(el) * R;
  out[i * 3 + 1] = Math.sin(el) * R;
  out[i * 3 + 2] = -Math.cos(az) * Math.cos(el) * R;
}

// A photograph's sRGB encode, as a table. A render target holds LINEAR light
// and the canvas wants it encoded; the old loop asked Math.pow once per
// channel per pixel — 85,000 calls for one 168px world, 680,000 for the set —
// to answer one of only 256 questions. Built on first use.
let GAMMA = null;
function gammaTable() {
  if (GAMMA) return GAMMA;
  GAMMA = new Uint8Array(256);
  for (let i = 0; i < 256; i++) GAMMA[i] = Math.round(255 * Math.pow(i / 255, 1 / 2.2));
  return GAMMA;
}

// Scratch for the meteor's head and tail: it moves on every frame of its
// second of life, and two fresh vectors a frame is garbage bought for nothing.
const _head = new THREE.Vector3(), _tail = new THREE.Vector3();
const NO_DRIFT = Object.freeze([]);
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// ---------------------------------------------------------------------------
// warm(object) -> Promise is optional and comes from body.js: it compiles an
// object's shader programs off the critical path (three's compileAsync, in
// parallel where the browser can), so the first frame that draws a new world
// does not have to stop and build them.
//
// camera is optional too: with it, a tap that lands somewhere (a strike, a
// passing train) is placed where this window can see it — a phone held
// upright sees about 11 degrees either side of the orb, a desktop about 33.
//
// sound({ hz, seconds }) is optional and comes from body.js, which gets it
// from main.js (voice.js ring): a world that can make a sound — the sand
// plate, struck — asks for it here, and it sounds only through a voice path
// the person has already switched on and heard, never through one of its own.
export function createEnvironments({ scene, renderer, camera = null, getOrb, roomObjects = [], warm = null, sound = null }) {
  let bakedSpace = null;   // built once, reused every time space is chosen
  let current = 'room';
  const worlds = new Map();   // id -> a built world, kept for the page's life (see the header)
  let active = null;          // the world in the scene, or null for the metal room
  let group = null;           // active.group
  let uniforms = null;        // active.u
  let drift = NO_DRIFT;       // active.drift: the particle systems that move each frame
  let bright = 1;
  const transients = [];      // tap effects in flight (a star, a bubble burst)
  let lastT = 0;              // the tick clock, so tap() can stamp uTap
  let tapT = -100;            // when the last tap landed (drives the ember surge)
  let duskTarget = 0;         // where the dunes' evening is headed
  // THE OCTAVE CEILING: one uniform object, handed by reference to every sky
  // and planet, so the lightest graphics mode is one number written once and
  // never a recompile (see NOISE for what the skipped octaves become).
  const octCap = { value: 99 };

  function showRoom(on) { for (const o of roomObjects) if (o) o.visible = on; }
  // How far either side of straight ahead the window sees, in radians.
  function halfWidth() {
    const fov = camera?.fov || 45, aspect = camera?.aspect || 1.5;
    return Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  }

  // A world, built but NOT placed in the scene. build() is what a world is;
  // place() is only ever about which one is on screen.
  function build(id) {
    // uTap = when the last tap landed (far in the past by default, so the
    // pulse terms sit at zero); uDusk = the dunes' evening position. Both go
    // to every env — three.js only uploads uniforms a program actually names.
    const u = { uTime: { value: 0 }, uBright: { value: bright }, uTap: { value: -100 }, uDusk: { value: 0 }, uOctCap: octCap };
    const g = new THREE.Group();
    const w = { id, group: g, u, drift: [], spare: [], ready: null };
    const drift = w.drift;
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
      const near = driftField(COARSE ? 400 : 900, 52, 0.30, 0xdfe8ff, 0.85);
      g.add(near); drift.push({ pts: near, kind: 'spin' });
      // one meteor made now and parked, so its program is compiled with the
      // sky's instead of on the frame the first tap asks for it
      w.spare.push(makeMeteor(w));
    } else if (id === 'ocean') {
      const sky = skydome(OCEAN_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Marine snow: fine debris sinking slowly through the light.
      const snow = driftField(COARSE ? 520 : 1200, 24, 0.075, 0xbfe0dc, 0.55);
      g.add(snow); drift.push({ pts: snow, kind: 'sink', speed: 0.55, span: 26 });
      w.spare.push(makeBubbles(w));   // parked, for the same reason as the meteor
    } else if (id === 'taiga') {
      const sky = skydome(TAIGA_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // three depths of snowfall: the far veil, the body of it, and a few
      // near flakes big enough to read as individual crystals
      const k = COARSE ? 0.45 : 1;   // a phone moves every one of these per frame
      for (const L of [
        snowLayer(Math.round(900 * k), 26, 0.055, 0.42, 0.55, 0.10),
        snowLayer(Math.round(520 * k), 20, 0.105, 0.62, 0.95, 0.16),
        snowLayer(Math.round(180 * k), 13, 0.190, 0.78, 1.55, 0.26),
      ]) { g.add(L.pts); drift.push(L); }
    } else if (id === 'dunes') {
      const sky = skydome(DUNES_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Sand carried on the wind: almost horizontal, which is what `snow` with a
      // crawling fall speed and a wide sway actually looks like.
      const k = COARSE ? 0.5 : 1;
      const grit = snowLayer(Math.round(420 * k), 24, 0.055, 0.30, 0.16, 0.55);
      grit.pts.material.color.setHex(0xe0b183);
      g.add(grit.pts); drift.push(grit);
    } else if (id === 'cavern') {
      const sky = skydome(CAVERN_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Spores lifting off the veins — the only motion in a still, closed room.
      const k = COARSE ? 0.45 : 1;
      const spores = driftField(Math.round(360 * k), 20, 0.075, 0x6fe3d6, 0.55);
      g.add(spores);
      drift.push({ pts: spores, kind: 'rise', speed: 0.30, span: 20, sway: 0.10, phase: 0 });
    } else if (id === 'cloudsea') {
      const sky = skydome(CLOUDSEA_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Deliberately empty. This is the one bright, clean world in the set, and
      // particles in front of a dawn sky read as dirt on the lens.
    } else if (id === 'ember') {
      const sky = skydome(EMBER_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Embers off the fissures. Two populations: many small and slow, a few
      // large and fast, because a real updraft is not uniform.
      const k = COARSE ? 0.45 : 1;
      const fine = driftField(Math.round(420 * k), 22, 0.070, 0xff8434, 0.75);
      g.add(fine);
      drift.push({ pts: fine, kind: 'rise', speed: 0.85, span: 22, sway: 0.30, phase: 0 });
      const big = driftField(Math.round(90 * k), 15, 0.150, 0xffc25e, 0.85);
      g.add(big);
      drift.push({ pts: big, kind: 'rise', speed: 1.7, span: 15, sway: 0.55, phase: 0 });
    } else if (id === 'blossom') {
      const sky = skydome(BLOSSOM_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Petals in the air: few, slow and turning. Two depths, so the near
      // ones are big enough to read as petals rather than pink snow.
      const k = COARSE ? 0.5 : 1;
      for (const L of [
        petalLayer(Math.round(200 * k), 22, 0.20, 0.80, 0.32, 0.30, u),
        petalLayer(Math.round(60 * k), 12, 0.32, 0.90, 0.45, 0.45, u),
      ]) { g.add(L.pts); drift.push(L); }
      w.spare.push(makeGust(w));   // parked: its program compiles with the sky's
    } else if (id === 'storm') {
      u.uFlash = { value: 0 };                           // the strike's light, written by the bolt
      u.uBolt = { value: new THREE.Vector2(0, 0.2) };    // and where it is
      const sky = skydome(STORM_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Driven rain, slanting on the wind: a sheet of it, and a few near
      // drops long enough to read as the near side of the downpour.
      const k = COARSE ? 0.45 : 1;
      w.rain = [];
      for (const [n, span, len, opacity, fall, slant] of [[1400, 14, 0.50, 0.16, 16, 5], [200, 7, 0.70, 0.24, 19, 6]]) {
        const lines = rainField(Math.round(n * k), span, len, 0xb4c2cc, opacity);
        const L = { pts: lines, kind: 'rain', fall, slant, len, span, base: opacity };
        g.add(lines); drift.push(L); w.rain.push(L);
      }
      w.spare.push(makeBolt(w));
    } else if (id === 'moon') {
      const sky = skydome(MOON_FRAG, u, MOON_VERT);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Deliberately empty, like the cloud sea but for the opposite reason:
      // there is no air here to carry anything. What rises falls (makeDust).
      // Live rather than baked like space: it is cheap (the Earth's noise is
      // drawn only inside its disc), and the Earth turns.
      w.spare.push(makeDust(w));
    } else if (id === 'neon') {
      const sky = skydome(NEON_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Drizzle, not a storm: fine, nearly straight down, catching the colour
      // of the signs it falls in front of.
      const k = COARSE ? 0.45 : 1;
      const drizzle = rainField(Math.round(700 * k), 12, 0.35, 0xd9b8e6, 0.20);
      g.add(drizzle);
      drift.push({ pts: drizzle, kind: 'rain', fall: 11, slant: 1.2, len: 0.35, span: 12, base: 0.20 });
      w.spare.push(makeStreak(w));
    } else if (id === 'plate') {
      // the figure's two rungs and where between them it stands, how hard the
      // plate is driven, and a strike's ring (plate.mjs for the ladder; the
      // ear below for how a voice moves them). It is born on the third rung,
      // a figure with something to look at, for the Room tab's photograph.
      const m0 = modeAt(PLATE_REST);
      u.uModeA = { value: new THREE.Vector2(m0.a[0], m0.a[1]) };
      u.uModeB = { value: new THREE.Vector2(m0.b[0], m0.b[1]) };
      u.uBlend = { value: m0.blend };
      u.uAgit = { value: 0 };
      u.uRipple = { value: new THREE.Vector4(0, 0, 0, 0) };
      const sky = skydome(PLATE_FRAG, u);
      sky.scale.setScalar(SKY_R);
      g.add(sky);
      // Deliberately no particles: the grains that lift are drawn in the sand
      // itself, where the one light lights them as it lights the ridges, and a
      // point field in front of a figure this fine reads as dirt on the lens
      // (the cloud sea's lesson).
      w.spare.push(makeStrike(w));   // parked: the first strike rings on the first tap, not a frame late
    }
    return w;
  }

  // The world for an id, built on first ask and warmed in the background.
  function world(id) {
    let w = worlds.get(id);
    if (!w) {
      w = build(id);
      worlds.set(id, w);
      let p = null;
      try { p = warm ? warm(w.group) : null; } catch { p = null; }
      w.ready = Promise.resolve(p).catch(() => {});
    }
    return w;
  }

  // Which world is in the scene — nothing else. A visit (set) resets what a
  // fresh arrival should find; a photograph (below) only borrows the stage.
  function place(next) {
    if (active) scene.remove(active.group);
    current = next;
    showRoom(next === 'room');
    if (next === 'room') { active = null; group = null; uniforms = null; drift = NO_DRIFT; return; }
    const w = world(next);
    w.u.uBright.value = bright;   // the slider may have moved while it was set aside
    scene.add(w.group);
    active = w; group = w.group; uniforms = w.u; drift = w.drift;
  }

  // ---- TAP: one interaction per world, each in the world's own language ----
  // A transient is a small object with a lifetime, stepped every tick and
  // RETIRED when its time is up: hidden and handed back to its world's spare
  // list, never disposed. Each one used to be a new material disposed at the
  // end of its second, and three destroys a program when the last material
  // using it goes — so the next tap compiled it again, synchronously, on the
  // very frame the meteor was supposed to appear.
  function launch(tr) {
    tr.born = lastT;
    tr.obj.visible = true;
    transients.push(tr);
  }
  function retire(tr) {
    tr.obj.visible = false;
    if (tr.done) tr.done();   // whatever it lent its world (a strike's light) is handed back
    tr.home.push(tr);
  }

  // deep space: a meteor — a bright head with a fading tail, gone in a second
  // A ribbon with width (ribbonMesh, which the storm's bolt and the city's
  // train use too), a white head on a tail that thins and cools to blue: as a
  // one-pixel line it read as a hair on a desktop and vanished on a phone's
  // dense screen (2026-10-20).
  const METEOR_N = 14;
  function makeMeteor(w) {
    const mesh = ribbonMesh(1, METEOR_N, 0xf2f6ff, 0x7f95ff);
    mesh.material.uniforms.uFade.value = 1;   // the tail fades toward its end
    mesh.visible = false;
    w.group.add(mesh);
    const start = new THREE.Vector3(), end = new THREE.Vector3();
    const pts = new Float32Array(METEOR_N * 3);
    return {
      obj: mesh, home: w.spare, ttl: 1.1, born: 0, start, end,
      step(age) {
        const tail = Math.max(0, age - 0.22);
        for (let i = 0; i < METEOR_N; i++) {
          _head.copy(start).lerp(end, tail + (age - tail) * (i / (METEOR_N - 1))).setLength(70);   // on the sky
          pts[i * 3] = _head.x; pts[i * 3 + 1] = _head.y; pts[i * 3 + 2] = _head.z;
        }
        layStrip(mesh, 0, METEOR_N, pts, 0.02, 0.32);
        mesh.material.uniforms.uOpacity.value = Math.sin(age * Math.PI) * 0.95;
      },
    };
  }
  // IN VIEW (2026-10-20). The meteor used to start anywhere all the way round
  // and 31-60 degrees up, while the camera looks level down -z and sees about
  // 22 degrees up and, either side, 11 (a phone held upright) to 33 (a
  // desktop): nearly every tap's meteor fell outside the window. Now it starts
  // in the band of sky above the orb, inside what this window sees, and
  // crosses part of it. (az -pi/2 is straight ahead: onSky puts it at -z.)
  function shootingStar() {
    const m = active.spare.pop() || makeMeteor(active);
    const hw = halfWidth(), vh = ((camera?.fov || 45) * Math.PI) / 360;
    const az = -Math.PI / 2 + (Math.random() * 2 - 1) * hw * 0.7;
    // radians up from the horizon: the open band between the orb and the
    // frame's top bar, which sits lower in an upright phone's view
    const portrait = (camera?.aspect || 1.5) < 1;
    const el = vh * (0.5 + Math.random() * (portrait ? 0.12 : 0.26));
    const drop = vh * (0.12 + Math.random() * 0.12);
    const swing = (Math.random() < 0.5 ? 1 : -1) * hw * (0.5 + Math.random() * 0.5);
    const R = 70;
    const onSky = (v, a, e) => v.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(R);
    onSky(m.start, az, el); onSky(m.end, az + swing, el - drop);
    m.obj.material.uniforms.uOpacity.value = 0;   // dark until its first step places it
    launch(m);
  }

  // underwater: a breath — a loose column of bubbles let go from below,
  // wobbling up past the orb and fading before the ceiling
  function makeBubbles(w) {
    const n = COARSE ? 36 : 72;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: dotTexture(), color: 0xd4f0f2, size: 0.17, transparent: true,
      opacity: 0.8, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    w.group.add(pts);
    return {
      obj: pts, home: w.spare, ttl: 3.4, born: 0,
      reset() {
        const cx = (Math.random() * 2 - 1) * 6, cz = (Math.random() * 2 - 1) * 6;
        for (let i = 0; i < n; i++) {
          pos[i * 3] = cx + (Math.random() * 2 - 1) * 2.6;
          pos[i * 3 + 1] = -13 - Math.random() * 5;
          pos[i * 3 + 2] = cz + (Math.random() * 2 - 1) * 2.6;
          seed[i] = Math.random();
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.8;
      },
      step(age, dt, t) {
        const a = geo.attributes.position.array;
        for (let i = 0; i < n; i++) {
          a[i * 3 + 1] += dt * (3.4 + seed[i] * 3.0);               // small ones dawdle
          a[i * 3] += Math.sin(t * 2.2 + seed[i] * 6.28) * dt * 0.55; // the wobble
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.8 * Math.min(1, (1 - age) * 4);             // gone before the top
      },
    };
  }
  function bubbleBurst() {
    const b = active.spare.pop() || makeBubbles(active);
    b.reset();
    launch(b);
  }

  // Where the camera is, along the line it looks down (the orb is at 0).
  const camZ = () => (camera ? camera.position.z : 6);

  // cherry blossoms: a GUST — a drift of petals torn off upwind and carried
  // across the window, tumbling, while the canopy shivers in the shader and
  // every petal already in the air is pushed along with them (see tick).
  function makeGust(w) {
    const n = COARSE ? 70 : 150;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), seed = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = petalize(new THREE.PointsMaterial({
      color: 0xf6cad8, size: 0.28, transparent: true, opacity: 0,
      alphaTest: 0.02, sizeAttenuation: true, depthWrite: false,
    }), w.u);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    w.group.add(pts);
    return {
      obj: pts, home: w.spare, ttl: 4.2, born: 0,
      reset(half) {
        // upwind is the left: each petal starts just past this window's edge
        // at its own depth, so a phone and a desktop both see them come in
        for (let i = 0; i < n; i++) {
          const z = -6 + Math.random() * 8;
          const edge = Math.tan(half) * Math.max(camZ() - z, 1);
          pos[i * 3] = -edge - 0.3 - Math.random() * 4;
          pos[i * 3 + 1] = -1.5 + Math.random() * 5.5;
          pos[i * 3 + 2] = z;
          vel[i * 3] = 4.2 + Math.random() * 3.2;
          vel[i * 3 + 1] = -0.4 + Math.random() * 0.6;
          vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
          seed[i] = Math.random();
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSeed.needsUpdate = true;
        mat.opacity = 0;
      },
      step(age, dt, t) {
        for (let i = 0; i < n; i++) {
          // the wind lifts and drops each one as it goes: no two take one line
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += (vel[i * 3 + 1] + Math.sin(t * 2.1 + seed[i] * 9.0) * 0.7) * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          vel[i * 3] *= 1 - 0.12 * dt;     // the gust spends itself
          vel[i * 3 + 1] -= 0.25 * dt;     // and they begin to settle
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.9 * Math.min(1, age * 8) * Math.min(1, (1 - age) * 3);
      },
    };
  }
  function petalGust() {
    const gst = active.spare.pop() || makeGust(active);
    gst.reset(halfWidth());
    launch(gst);
  }

  // stormy sea: LIGHTNING — a jagged strike (a ribbon: a main channel and two
  // forks) beside the orb where this window can see it, with the flicker
  // real strikes have: a stroke, a dimmer restrike, a last one. The same
  // flicker is the sky's uFlash, which lights the deck from inside around
  // the strike, and the rain's, which shows up in it.
  function makeBolt(w) {
    const N = 24, R = 70;
    const mesh = ribbonMesh(3, N, 0xe6ebff);
    mesh.visible = false;
    w.group.add(mesh);
    const path = new Float32Array(N * 3), fork = new Float32Array(N * 3);
    const strokes = [[0, 1], [0.11, 0.7], [0.27, 0.45]];   // [seconds in, how bright]
    return {
      obj: mesh, home: w.spare, ttl: 1.0, born: 0,
      reset(half) {
        const az0 = (Math.random() < 0.5 ? -1 : 1) * half * (0.35 + Math.random() * 0.45);
        const top = 0.17 + Math.random() * 0.10;
        const at = [];
        let az = az0;
        for (let i = 0; i < N; i++) {
          const s = i / (N - 1);
          // a strike zigzags: small steps, and now and then a kink
          az += (Math.random() - 0.5) * 0.010 + (Math.random() < 0.15 ? (Math.random() - 0.5) * 0.03 : 0);
          const el = top * (1 - s) - 0.004 * s;   // down to the sea at the horizon
          at.push([az, el]);
          onSphere(path, i, az, el, R);
        }
        layStrip(mesh, 0, N, path, 0.16, 0.10);
        for (let f = 1; f <= 2; f++) {
          const [fa, fe] = at[4 + Math.floor(Math.random() * 10)];
          const dir = Math.random() < 0.5 ? -1 : 1;
          const drop = fe * (0.3 + Math.random() * 0.3);
          let a = fa;
          for (let i = 0; i < N; i++) {
            a += dir * 0.0025 + (Math.random() - 0.5) * 0.006;
            onSphere(fork, i, a, fe - drop * (i / (N - 1)), R);
          }
          layStrip(mesh, f, N, fork, 0.09, 0.015);
        }
        w.u.uBolt.value.set(az0, top * 0.55);
        mesh.material.uniforms.uOpacity.value = 0;
      },
      step(age) {
        const s = age * this.ttl;
        let f = 0, g = 0;
        for (const [t0, k] of strokes) {
          if (s < t0) continue;
          f = Math.max(f, k * Math.exp(-(s - t0) * 26));   // the channel itself is gone at once
          g = Math.max(g, k * Math.exp(-(s - t0) * 8));    // the light in the cloud lingers
        }
        mesh.material.uniforms.uOpacity.value = f;
        w.u.uFlash.value = g;
        for (const r of w.rain) r.pts.material.opacity = r.base * (1 + 2.2 * g);
      },
      done() {
        w.u.uFlash.value = 0;
        for (const r of w.rain) r.pts.material.opacity = r.base;
      },
    };
  }
  function lightning() {
    const b = active.spare.pop() || makeBolt(active);
    b.reset(halfWidth());
    launch(b);
  }

  // earthrise: DUST, kicked up from the ground in front — and on the moon
  // dust does not billow. With no air to hold it, every grain flies its own
  // clean parabola under a sixth of Earth's gravity and comes down with the
  // rest, so the puff opens into a fan of slow arcs and is gone the way it
  // came. That is the one thing a tap can show here that it could not show
  // anywhere else in the set.
  function makeDust(w) {
    const n = COARSE ? 120 : 260;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: dotTexture(), color: 0xc4bdb2, size: 0.04, transparent: true,
      opacity: 0, depthWrite: false, sizeAttenuation: true, alphaTest: 0.02,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    w.group.add(pts);
    const G = 1.62;   // the moon's own, in m/s²: a unit here is about a metre
    return {
      obj: pts, home: w.spare, ttl: 2.8, born: 0,
      reset() {
        // from just under the bottom of this window, at the depth it is kicked from
        const z = 0.8 + Math.random() * 1.0;
        const y0 = -Math.tan(((camera?.fov || 45) * Math.PI) / 360) * Math.max(camZ() - z, 1) - 0.1;
        const x0 = (Math.random() * 2 - 1) * 0.6;
        const lean = (Math.random() < 0.5 ? -1 : 1) * 0.3;
        for (let i = 0; i < n; i++) {
          pos[i * 3] = x0 + (Math.random() - 0.5) * 0.3;
          pos[i * 3 + 1] = y0;
          pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
          // a kick, not an explosion: a metre high at most, a few metres out
          const sp = 1.0 + Math.random() * 0.9;
          const th = lean + (Math.random() - 0.5) * 0.8;   // the fan, from upright
          vel[i * 3] = Math.sin(th) * sp;
          vel[i * 3 + 1] = Math.cos(th) * sp;
          vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0;
      },
      step(age, dt) {
        for (let i = 0; i < n; i++) {
          vel[i * 3 + 1] -= G * dt;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.85 * Math.min(1, age * 12) * Math.min(1, (1 - age) * 4);
      },
    };
  }
  function dustPuff() {
    const p = active.spare.pop() || makeDust(active);
    p.reset();
    launch(p);
  }

  // neon city: a TRAIN on the elevated line — a streak of light across the
  // window, head bright and tail fading the way a long exposure draws one,
  // and its reflection smeared in the wet street under it. It crosses at a
  // train's pace, so a narrow window sees it go by sooner.
  function makeStreak(w) {
    const N = 40, R = 60;
    const SPEED = 0.85, LEN = 0.42;   // radians a second; the streak's own length
    const light = ribbonMesh(1, N, 0xeefcff, 0xff2e8c);
    const refl = ribbonMesh(1, N, 0x8fe3ff, 0xa01e64);
    light.material.uniforms.uFade.value = 1;
    refl.material.uniforms.uFade.value = 1;
    const grp = new THREE.Group();
    grp.add(light, refl);
    grp.visible = false;
    w.group.add(grp);
    const a = new Float32Array(N * 3), b = new Float32Array(N * 3);
    let from = 0, dir = 1, el = 0.03;
    return {
      obj: grp, home: w.spare, ttl: 2, born: 0,
      reset(half) {
        dir = Math.random() < 0.5 ? 1 : -1;
        from = -dir * (half + 0.05);
        el = 0.020 + Math.random() * 0.025;
        this.ttl = (2 * half + 0.1 + LEN) / SPEED;   // until the tail has left the far edge
        light.material.uniforms.uOpacity.value = 0;
        refl.material.uniforms.uOpacity.value = 0;
      },
      step(age) {
        const s = age * this.ttl;
        const at = from + dir * SPEED * s;
        for (let i = 0; i < N; i++) {
          const az = at - dir * LEN * (1 - i / (N - 1));   // the last point is the head
          onSphere(a, i, az, el, R);
          onSphere(b, i, az, -el - 0.004, R);
        }
        layStrip(light, 0, N, a, 0.10, 0.12);
        layStrip(refl, 0, N, b, 0.45, 0.55);
        const fade = Math.min(1, s * 6);
        light.material.uniforms.uOpacity.value = 0.95 * fade;
        refl.material.uniforms.uOpacity.value = 0.32 * fade;
      },
    };
  }
  function lightStreak() {
    const s = active.spare.pop() || makeStreak(active);
    s.reset(halfWidth());
    launch(s);
  }

  // sand plate: a STRIKE — the plate rings. Every grain is thrown up, a ring
  // runs out across the sand from where the blow fell and settles in about
  // two seconds, and the figure jumps to another rung of the ladder, the sand
  // re-forming on it as it settles (plateTick). This object draws nothing of
  // its own — the ring is the sky's uRipple, written here — but it is parked
  // like the bolt all the same, so a strike keeps its ring and its clock
  // between taps. If the page has a voice path open, the plate's note sounds
  // through it (voice.js ring: never a new path, never a first sound).
  const PLATE_REST = 2;    // the rung it is born on: (2, 3)
  const PLATE_HZ = 220;    // the lowest rung's note; the rest rise with the figure
  function makeStrike(w) {
    const obj = new THREE.Group();   // nothing to draw: the ring is the sand's
    obj.visible = false;
    w.group.add(obj);
    const SPEED = 1.0;               // figure units a second across the sand: the near cell in two
    return {
      obj, home: w.spare, ttl: 2.2, born: 0,
      reset(half) {
        // where it fell: in the near cell, within what this window shows of it
        const reach = Math.min(1.0, Math.tan(half) * 3.9 * (2 / 3) * 0.8);
        w.u.uRipple.value.set((Math.random() * 2 - 1) * reach, (Math.random() * 2 - 1) * 0.7, 0, 0);
      },
      step(age) {
        const s = age * this.ttl;
        w.u.uRipple.value.z = SPEED * s;
        w.u.uRipple.value.w = Math.exp(-s / 0.55);
      },
      done() { w.u.uRipple.value.w = 0; },
    };
  }
  function strike() {
    const st = active.spare.pop() || makeStrike(active);
    st.reset(halfWidth());
    launch(st);
    // the figure jumps: another rung, never the one it is on
    const was = Math.round(plate.s);
    let to = Math.floor(Math.random() * RUNGS);
    if (to >= was) to += 1;
    plate.struck = to;
    plate.struckAt = lastT;
    plate.agit = Math.max(plate.agit, 0.55);   // the whole plate jumps; the ring carries the rest
    // its note: a membrane's law (the pitch with the square root of the
    // mode), not a plate's (with the mode itself), which climbs to a shriek
    // by the fifth rung. A sound chosen for the room, said as such.
    const [n, m] = LADDER[to];
    if (sound) { try { sound({ hz: PLATE_HZ * Math.sqrt((n * n + m * m) / 5), seconds: 1.6 }); } catch { /* a silent strike is still a strike */ } }
  }

  // ---- THE PLATE'S EAR -----------------------------------------------------
  // What the voice bus last brought (body.js setAudioLevel and setSpeaking
  // call hear), and where the sand plate stands: s is its place on the
  // ladder (plate.mjs modeAt), agit how hard it is driven. A note moves the
  // figure up and down the ladder; loudness lifts the grains, at once, and
  // lets them settle slowly; a silence of a second and a half hands the
  // figure to its own slow wander. The browser's voice brings no waveform
  // (speechSynthesis plays outside Web Audio), only that it is speaking, so
  // while it speaks a cadence stands in for one (plate.mjs cadence).
  const heard = { level: 0, hz: 0, speaking: false, at: -100 };
  const plate = { s: PLATE_REST, agit: 0, pitch: PLATE_REST, struck: -1, struckAt: -100, silentFor: 100 };
  function hear({ level, hz, speaking } = {}) {
    if (level !== undefined) {
      heard.level = Math.max(0, Math.min(1, Number(level) || 0));
      heard.hz = Math.max(0, Number(hz) || 0);
      heard.at = lastT;
    }
    if (speaking !== undefined) heard.speaking = !!speaking;
  }
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  function plateTick(dt, t) {
    let { level, hz } = heard;
    if (heard.speaking && t - heard.at > 0.5) ({ level, hz } = cadence(t));
    // the sand lifts at once and settles slowly
    const want = agitationOf(level);
    plate.agit += (want - plate.agit) * ease(dt, want > plate.agit ? 0.04 : 0.35);
    let target, tau;
    if (t - plate.struckAt < 1.2) {
      // struck: for a moment the figure goes where the blow sent it, whatever is said
      target = plate.struck; tau = 0.25;
      plate.pitch = plate.struck;
    } else if (level > QUIET && hz > 0) {
      // spoken to: the note picks the rung, smoothed so a syllable moves it and a frame does not
      plate.silentFor = 0;
      plate.pitch += (rungOf(hz) - plate.pitch) * ease(dt, 0.15);
      target = plate.pitch; tau = 0.2;
    } else {
      plate.silentFor += dt;
      if (plate.silentFor > 1.5) {
        // left alone: it wanders from where it is, at the wander's own slow pace
        plate.pitch = Math.max(0, Math.min(RUNGS, plate.pitch + idleRung(t) - idleRung(t - dt)));
      }
      target = plate.pitch; tau = 0.6;
    }
    plate.s += (target - plate.s) * ease(dt, tau);
    const m = modeAt(plate.s);
    uniforms.uModeA.value.set(m.a[0], m.a[1]);
    uniforms.uModeB.value.set(m.b[0], m.b[1]);
    uniforms.uBlend.value = m.blend;
    uniforms.uAgit.value = plate.agit;
  }

  // One tap, one answer, per world. The metal room keeps its own tap (the lit
  // panels live in body.js); everything here is for the skies.
  function tap() {
    if (!uniforms) return;
    uniforms.uTap.value = lastT;
    tapT = lastT;
    if (current === 'space') shootingStar();
    else if (current === 'ocean') bubbleBurst();
    else if (current === 'dunes') duskTarget = duskTarget === 0 ? 1 : 0; // walk the evening, walk it back
    else if (current === 'blossom') petalGust();
    else if (current === 'storm') lightning();
    else if (current === 'moon') dustPuff();
    else if (current === 'neon') lightStreak();
    else if (current === 'plate') strike();
    // taiga / cavern / cloudsea / ember answer in their shaders via uTap
  }

  // ---- PHOTOGRAPHS: a picture of each world ------------------------------
  // Taken from where the orb stands, with the orb itself stepped out of the
  // shot, through the SAME renderer — so a thumbnail is the real thing rather
  // than an artist's impression of it.
  //
  // ALL OF THEM INTO ONE TARGET, READ BACK ONCE. Each world is drawn into its
  // own square of an atlas (viewport + scissor), and the whole set comes back
  // in a single readRenderTargetPixels: a readback is a full stop of the GPU
  // pipeline, and the old way paid it once a world in one task.
  function atlas(size) {
    const n = ENVIRONMENTS.length;
    const cols = Math.min(n, 4), rows = Math.ceil(n / cols);   // 4 wide: 672x672px at 168 for thirteen, well inside any texture limit
    const W = cols * size, H = rows * size;
    const cam = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
    cam.position.set(0, 0, 0);
    cam.lookAt(0, 0, -1);
    return { n, size, cols, W, H, cam, rt: new THREE.WebGLRenderTarget(W, H), at: (i) => [(i % cols) * size, Math.floor(i / cols) * size] };
  }

  // One world into its square, and the stage handed straight back: the orb,
  // the world on screen and the render target are all as they were when this
  // returns, so the frame loop never sees anything but the live room.
  function photograph(A, i) {
    const id = ENVIRONMENTS[i].id;
    const [ox, oy] = A.at(i);
    const orb = getOrb ? getOrb() : null;
    const orbWas = orb ? orb.visible : null;
    const prevEnv = current;
    const prevTarget = renderer.getRenderTarget();
    try {
      if (orb) orb.visible = false;
      place(id);
      const t0 = uniforms ? uniforms.uTime.value : 0;
      if (uniforms) uniforms.uTime.value = 6;   // a moment with some weather in it
      // Point sizes are computed against the CANVAS, not this little target,
      // so particles would come out as giant squares. The sky carries the
      // identity of each world anyway — snow and dust sit this one out.
      for (const d of drift) d.pts.visible = false;
      A.rt.viewport.set(ox, oy, A.size, A.size);
      A.rt.scissor.set(ox, oy, A.size, A.size);
      A.rt.scissorTest = true;
      renderer.setRenderTarget(A.rt);
      renderer.render(scene, A.cam);
      for (const d of drift) d.pts.visible = true;
      if (uniforms) uniforms.uTime.value = t0;
    } finally {
      renderer.setRenderTarget(prevTarget);
      place(prevEnv);
      if (orb) orb.visible = orbWas;
    }
  }

  // Square i of the read-back atlas, as a PNG. The target holds LINEAR light
  // and reads bottom-up: flip it and encode to sRGB, which is the canvas's job
  // on the way to the screen.
  function develop(A, buf, i, ctx, img) {
    const G = gammaTable();
    const [ox, oy] = A.at(i);
    const size = A.size, d = img.data;
    for (let y = 0; y < size; y++) {
      const src = ((oy + size - 1 - y) * A.W + ox) * 4, dst = y * size * 4;
      for (let x = 0; x < size * 4; x += 4) {
        d[dst + x] = G[buf[src + x]];
        d[dst + x + 1] = G[buf[src + x + 1]];
        d[dst + x + 2] = G[buf[src + x + 2]];
        d[dst + x + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return ctx.canvas.toDataURL('image/png');
  }

  function canvasFor(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    return { ctx, img: ctx.createImageData(size, size) };
  }

  // The whole set in one task. Kept for compatibility; the settings panel
  // should prefer thumbnailsAsync, which spreads the same work over frames.
  function thumbnails(size = 168) {
    if (!renderer) return {};
    const out = {};
    const A = atlas(size);
    try {
      for (let i = 0; i < A.n; i++) photograph(A, i);
      const buf = new Uint8Array(A.W * A.H * 4);
      renderer.readRenderTargetPixels(A.rt, 0, 0, A.W, A.H, buf);
      const { ctx, img } = canvasFor(size);
      for (let i = 0; i < A.n; i++) out[ENVIRONMENTS[i].id] = develop(A, buf, i, ctx, img);
    } catch (err) {
      console.warn('[environments] thumbnails unavailable:', err.message);
    }
    A.rt.dispose();
    return out;
  }

  // THE SAME PHOTOGRAPHS, A WORLD A FRAME. The first Settings open used to do
  // all of it in one task: build eight worlds (eight sky programs compiled on
  // the spot), bake space if it was not baked, eight renders, eight readbacks,
  // 680,000 Math.pow and eight PNG encodes — a long freeze on exactly the
  // click that should feel instant. Here each world is built and its programs
  // compiled in the background FIRST (warm), photographed on its own frame,
  // read back once at the end, and encoded one PNG a frame. Cached per page
  // and per size: the worlds do not change while the page is open.
  //   -> Promise<Array<{ id, url }>>, in ENVIRONMENTS order.
  const shots = new Map();
  function thumbnailsAsync(size = 168) {
    const s = Math.max(16, Math.min(512, (size | 0) || 168));
    if (!renderer || typeof requestAnimationFrame !== 'function') return Promise.resolve([]);
    let p = shots.get(s);
    if (!p) {
      p = shoot(s).catch((err) => {
        shots.delete(s);   // a failure is not remembered: the next ask tries again
        console.warn('[environments] thumbnails unavailable:', err?.message || err);
        return [];
      });
      shots.set(s, p);
    }
    return p;
  }
  async function shoot(size) {
    const A = atlas(size);
    try {
      for (let i = 0; i < A.n; i++) {
        const id = ENVIRONMENTS[i].id;
        // deep space's sky is baked a face a frame before its world is built,
        // so building it finds the bake done (see bakeSkySlowly)
        if (id === 'space' && !bakedSpace && !worlds.has('space')) {
          const rt = await bakeSkySlowly(renderer, SPACE_FRAG, () => !!bakedSpace);
          if (rt && !bakedSpace) bakedSpace = rt; else if (rt) rt.dispose();
        }
        if (id !== 'room') await world(id).ready;   // programs built before the frame that draws them
        await nextFrame();
        photograph(A, i);
      }
      await nextFrame();
      const buf = new Uint8Array(A.W * A.H * 4);
      renderer.readRenderTargetPixels(A.rt, 0, 0, A.W, A.H, buf);   // the one readback
      const { ctx, img } = canvasFor(size);
      const out = [];
      for (let i = 0; i < A.n; i++) {
        if (i) await nextFrame();   // one PNG encode a frame
        out.push({ id: ENVIRONMENTS[i].id, url: develop(A, buf, i, ctx, img) });
      }
      return out;
    } finally {
      A.rt.dispose();
    }
  }

  const api = {
    list: ENVIRONMENTS,
    thumbnails,
    thumbnailsAsync,
    get current() { return current; },
    set(id) {
      const known = ENVIRONMENTS.some((e) => e.id === id);
      const next = known ? id : 'room';
      if (next === current) return;
      while (transients.length) retire(transients.pop());
      place(next);
      // a return is a fresh arrival: no tap still echoing, the evening back
      // at its stock dusk
      if (uniforms) { uniforms.uTap.value = -100; uniforms.uDusk.value = 0; }
      duskTarget = 0;
    },
    // The orb's own glow is the only light in the room; out here the sky carries
    // its own brightness, so the Room slider drives both.
    setBrightness(v) {
      bright = Math.max(0.2, Math.min(2.5, Number(v) || 1));
      if (uniforms) uniforms.uBright.value = bright;
    },
    // 'lite' caps every sky at three octaves (a phone's ceiling already); 'full'
    // lifts the cap. A uniform, so a change of mode never recompiles a sky.
    setDetail(detail) { octCap.value = detail === 'lite' ? 3 : 99; },
    tap,
    // The voice bus: { level, hz } from a meter on the voice (body.js hands
    // them on from voice.js), { speaking } when a voice without a waveform
    // starts and stops. Only the sand plate listens today; it is cheap to
    // tell every world.
    hear,
    tick(dt, t) {
      lastT = t;
      if (!uniforms) return;
      uniforms.uTime.value = t;
      // the dunes' evening eases toward wherever the last tap sent it
      if (current === 'dunes') {
        uniforms.uDusk.value += (duskTarget - uniforms.uDusk.value) * Math.min(1, dt * 0.9);
      }
      // the sand plate follows the voice, or wanders
      if (current === 'plate') plateTick(dt, t);
      // short-lived tap effects: step, then retire when their time is up
      for (let i = transients.length - 1; i >= 0; i--) {
        const tr = transients[i];
        const age = (t - tr.born) / tr.ttl;
        if (age >= 1) { transients.splice(i, 1); retire(tr); continue; }
        tr.step(age, dt, t);
      }
      // the eruption: for a few seconds after a tap the embers climb ~3x
      const surge = (current === 'ember' && t - tapT < 3) ? 1 + 2.2 * Math.exp(-(t - tapT)) : 1;
      // the gust: the petals already falling are carried with the new ones
      const gust = (current === 'blossom' && t - tapT < 6) ? 2.2 * Math.exp(-(t - tapT) * 0.8) : 0;
      for (const d of drift) {
        if (d.kind === 'spin') { d.pts.rotation.y += dt * 0.004; d.pts.rotation.x += dt * 0.0013; }
        else if (d.kind === 'snow') {
          const p = d.pts.geometry.attributes.position;
          const seeds = d.pts.geometry.attributes.aSeed.array;
          const arr = p.array;
          const push = d.gust ? gust * d.gust * dt : 0;
          d.phase += dt;
          for (let i = 0, j = 0; i < arr.length; i += 3, j++) {
            arr[i + 1] -= dt * d.speed - push * 0.2;   // a gust lifts a little as it carries
            // each flake rides its own slow current — this is what stops a
            // snowfall reading as a sheet of falling dots
            arr[i] += Math.sin(d.phase * 0.6 + seeds[j] * 6.283) * dt * d.sway + push;
            arr[i + 2] += Math.cos(d.phase * 0.45 + seeds[j] * 4.712) * dt * d.sway * 0.7;
            if (arr[i + 1] < -d.span) {
              arr[i + 1] += d.span * 2;
              arr[i] = (Math.random() * 2 - 1) * d.span;      // fresh column on the way round
              arr[i + 2] = (Math.random() * 2 - 1) * d.span;
            } else if (arr[i] > d.span) arr[i] -= d.span * 2;   // blown out one side, back in the other
          }
          p.needsUpdate = true;
        }
        // Rain: each drop a line, head and tail moved together, the tail laid
        // back along the drop's own fall so the slant and the streak agree.
        else if (d.kind === 'rain') {
          const p = d.pts.geometry.attributes.position;
          const arr = p.array;
          const v = Math.hypot(d.slant, d.fall);
          const tx = (d.slant / v) * d.len, ty = (d.fall / v) * d.len;
          for (let i = 0; i < arr.length; i += 6) {
            let x = arr[i] + d.slant * dt, y = arr[i + 1] - d.fall * dt;
            if (y < -d.span) {
              y += d.span * 2;
              x = (Math.random() * 2 - 1) * d.span;
              arr[i + 2] = arr[i + 5] = -d.span + Math.random() * (d.span + 2.5);
            } else if (x > d.span) x -= d.span * 2;
            arr[i] = x; arr[i + 1] = y;
            arr[i + 3] = x - tx; arr[i + 4] = y + ty;
          }
          p.needsUpdate = true;
        }
        // Embers and spores: `sink` run backwards, but with a sway, because
        // anything light enough to be carried up does not go up in a line.
        else if (d.kind === 'rise') {
          const p = d.pts.geometry.attributes.position;
          const arr = p.array;
          d.phase += dt;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] += dt * d.speed * surge;
            arr[i] += Math.sin(d.phase * 0.8 + arr[i + 2] * 0.3) * dt * d.sway;
            if (arr[i + 1] > d.span) {
              arr[i + 1] -= d.span * 2;                        // wrap to the floor
              arr[i] = (Math.random() * 2 - 1) * d.span;       // and to a fresh spot
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
    // Everything goes: the worlds are disposed here and only here.
    dispose() {
      while (transients.length) retire(transients.pop());
      place('room');
      for (const w of worlds.values()) {
        w.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          // NB: the baked space cube and the shared dot texture outlive any
          // single world — neither is disposed here
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) { m.map = null; m.dispose(); }   // keep the shared dot
          }
        });
      }
      worlds.clear();
      shots.clear();
    },
  };
  return api;
}
