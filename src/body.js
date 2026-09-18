// The body: ~24k particles on a sphere, displaced by layered simplex noise.
//
// COLOR is per-node and full-spectrum. Each node computes its own hue from a
// flowing noise field over the surface, so colors ripple in bands across the
// sphere (HSV → RGB in the shader gives the entire color wheel, not a 2-stop
// gradient). A MOOD shapes that field: where the spectrum is centered, how wide
// a slice of it spreads across the body, how fast the bands flow, plus the
// surface motion. The AI never paints nodes one by one — it picks a mood and
// every per-node parameter eases toward it, so the whole field morphs at once.


import * as THREE from 'three';

import { setLiquid as setMercuryLiquid, setTide as setMercuryTide } from './mercury-buttons.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createEnvironments } from './environments.js';
import { BEATS } from './tags.mjs';
import { createSwarm, epsOf } from './pendulum.js';
import { easeForSeconds } from './score.js';

// A phone is not a small desktop. It renders at dpr 3, has a fraction of the
// fill rate, and this scene is expensive in every direction at once: 24k
// particles each running layered simplex noise in the VERTEX shader, a
// five-level bloom over the whole framebuffer, a full-screen sky shader, and a
// dozen liquid canvases. Desktop absorbs that; a phone does not.
//
// So the device picks a tier once, at load. Everything below reads from it.
// Touch devices get a lighter build of everything (fewer particles, lower
// resolution, fewer noise octaves). The test is the input device, NOT the
// window width: a desktop window dragged narrow still has a real GPU behind it.
const COARSE = typeof matchMedia !== 'undefined'
  && (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches);
const COUNT = COARSE ? 13000 : 24000;   // the orb is ~4x smaller on a phone

// Hue is in turns (0..1): 0 red · .08 orange · .16 yellow · .33 green · .5 cyan
// · .58 blue · .72 violet · .83 magenta · .92 pink.
//
// A MOOD now drives only MOTION + an energy level (how lively/colorful). The
// chosen SCHEME drives the palette. Final per-node color = the scheme's palette,
// widened by the mood's energy — so the field gets more colorful the more
// animated it is. The AI picks moods; the user picks a scheme.
export const MOODS = {
  calm:      { amp: 0.18, freq: 1.2, speed: 0.14, size: 2.4, radius: 1.00, hueFlow: 0.04, energy: 0.15 },
  listening: { amp: 0.13, freq: 1.7, speed: 0.28, size: 2.4, radius: 1.02, hueFlow: 0.14, energy: 0.30 },
  thinking:  { amp: 0.30, freq: 2.3, speed: 0.55, size: 2.1, radius: 0.98, hueFlow: 0.20, energy: 0.45 },
  speaking:  { amp: 0.30, freq: 1.9, speed: 0.62, size: 2.6, radius: 1.05, hueFlow: 0.24, energy: 0.62 },
  excited:   { amp: 0.46, freq: 2.0, speed: 0.95, size: 2.9, radius: 1.10, hueFlow: 0.36, energy: 0.95 },
  tender:    { amp: 0.14, freq: 1.0, speed: 0.20, size: 2.9, radius: 1.00, hueFlow: 0.05, energy: 0.20 },
  glitch:    { amp: 0.58, freq: 3.6, speed: 1.45, size: 2.0, radius: 1.00, hueFlow: 0.95, energy: 1.00 },
};

// 10 field color schemes. hueBase = palette center; hueSpan = how much of the
// wheel the palette covers at full energy; sweep = latitudinal spread; sat/val =
// character; cFreq = band frequency; mono = grayscale. preview = settings swatch.
export const SCHEMES = [
  { key: 'aurora',    name: 'Aurora',    hueBase: 0.58, hueSpan: 1.00, sweep: 0.50, sat: 0.90, val: 1.00, cFreq: 1.5, mono: false, preview: ['#2fe6ff', '#5a8bff', '#9b5cff', '#ff5aa6'] },
  { key: 'ember',     name: 'Ember',     hueBase: 0.02, hueSpan: 0.14, sweep: 0.12, sat: 0.95, val: 1.00, cFreq: 1.9, mono: false, preview: ['#5a0a02', '#ff3b1f', '#ff8a2a', '#ffd84d'] },
  { key: 'abyss',     name: 'Abyss',     hueBase: 0.52, hueSpan: 0.17, sweep: 0.16, sat: 0.85, val: 0.96, cFreq: 1.6, mono: false, preview: ['#04203b', '#0a6a8f', '#1fb6c9', '#86f0d8'] },
  { key: 'terra',     name: 'Terra',     hueBase: 0.07, hueSpan: 0.13, sweep: 0.10, sat: 0.52, val: 0.92, cFreq: 1.5, mono: false, preview: ['#3a2410', '#7a4a1f', '#b58a3c', '#8a8f4a'] },
  { key: 'eclipse',   name: 'Eclipse',   hueBase: 0.00, hueSpan: 0.00, sweep: 0.00, sat: 0.00, val: 1.00, cFreq: 1.6, mono: true,  preview: ['#1a1a1a', '#5a5a5a', '#aaaaaa', '#ffffff'] },
  { key: 'bloom',     name: 'Bloom',     hueBase: 0.92, hueSpan: 0.13, sweep: 0.12, sat: 0.70, val: 1.00, cFreq: 1.4, mono: false, preview: ['#4a0a26', '#ff6f9c', '#ffa6c9', '#e6b3ff'] },
  { key: 'verdant',   name: 'Verdant',   hueBase: 0.34, hueSpan: 0.15, sweep: 0.14, sat: 0.82, val: 0.96, cFreq: 1.6, mono: false, preview: ['#06280f', '#1f8a3c', '#5fd06a', '#cfe04a'] },
  { key: 'dusk',      name: 'Dusk',      hueBase: 0.92, hueSpan: 0.30, sweep: 0.20, sat: 0.86, val: 1.00, cFreq: 1.5, mono: false, preview: ['#2a0a3a', '#ff4f9d', '#ff8a5a', '#ffd07a'] },
  { key: 'frost',     name: 'Frost',     hueBase: 0.56, hueSpan: 0.13, sweep: 0.12, sat: 0.45, val: 1.00, cFreq: 1.5, mono: false, preview: ['#0a1a2a', '#9fd8ff', '#cfeaff', '#e6d8ff'] },
  { key: 'synthwave', name: 'Synthwave', hueBase: 0.80, hueSpan: 0.35, sweep: 0.25, sat: 0.95, val: 1.00, cFreq: 1.7, mono: false, preview: ['#1a0a2e', '#ff2bd6', '#7a3bff', '#2fe6ff'] },
  // Stardust: the resting state — a quiet near-white field where a few nodes
  // carry vivid random color specks (speckle flag → uSpeckle in the shader).
  { key: 'stardust',  name: 'Stardust',  hueBase: 0.00, hueSpan: 1.00, sweep: 0.15, sat: 0.95, val: 0.88, cFreq: 1.3, mono: false, speckle: true, preview: ['#f2f2f6', '#ffd9ec', '#d9ecff', '#eaffd9'] },
];
const SCHEME_BY_KEY = Object.fromEntries(SCHEMES.map((s) => [s.key, s]));

// Forms = the field's overall posture, which Y3K can choose as body language.
// Form names MUST match FORMS in tags.mjs. Each maps to core + web visibility.
const FORM_MAP = {
  field:  { core: false, lines: false, plasma: false }, // open, spacious cloud
  orb:    { core: true,  lines: false, plasma: false }, // gathered into a bright core
  web:    { core: true,  lines: true,  plasma: false }, // a constellation of connections
  plasma: { core: true,  lines: false, plasma: true },  // flowing ribbons of energy
};

// Color uniforms come from the scheme, widened/brightened by the mood's energy.
function colorTarget(mood, scheme) {
  return {
    hueBase: scheme.hueBase,
    hueRange: scheme.hueSpan * (0.12 + 0.85 * mood.energy),
    hueSweep: scheme.sweep,
    sat: scheme.mono ? 0 : scheme.sat,
    val: scheme.val * (0.85 + 0.15 * mood.energy),
    cFreq: scheme.cFreq,
    hueFlow: mood.hueFlow,
    speckle: scheme.speckle ? 1 : 0,
  };
}
function fullTarget(moodName, schemeKey) {
  const m = MOODS[moodName] || MOODS.calm;
  const s = SCHEME_BY_KEY[schemeKey] || SCHEMES[0];
  return { amp: m.amp, freq: m.freq, speed: m.speed, size: m.size, radius: m.radius, glitch: moodName === 'glitch' ? 1 : 0, ...colorTarget(m, s) };
}

// Keys eased toward the active mood each frame (everything except color hooks
// that need special handling lives here as a plain scalar).

const EASE_KEYS = ['amp', 'freq', 'speed', 'size', 'radius', 'glitch', 'hueBase', 'hueRange', 'hueFlow', 'hueSweep', 'sat', 'val', 'cFreq', 'speckle'];
// HOW A CHANGE ARRIVES. Three named speeds, monotone, no overshoot — a named,
// bounded vocabulary rather than a raw duration, so the presence cannot author a
// transition this substance would not make. Each pair is [the mood/colour/
// posture rate, the plasma rate]; the 4:3 ratio between them is today's exact
// 0.045 / 0.06, preserved so `settle` is byte-for-byte the rate that shipped.
// At 60Hz: drift 63% in 0.66s / 95% in 2.0s · settle 0.36s / 1.08s ·
// surge 0.15s / 0.45s. Even surge sits on the 0.15s floor, and this file's own
// "a posture ARRIVES; it never snaps" survives all three.
// MUST match MORPHS in src/tags.mjs.
const MORPH = { drift: [0.025, 0.033], settle: [0.045, 0.060], surge: [0.105, 0.140] };

// Ashima / Stefan Gustavson 3D simplex noise — public domain GLSL.
const SNOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ===========================================================================
// THE SHAPE STACK, shared verbatim by the dots and the constellation lines.
// One string included by both shaders after their own fbm, because the `web`
// form draws BOTH layers — and a line layer that did not know about a posture
// would hang in a sphere around a body that had walked off somewhere else.
// ===========================================================================
const SHAPE_GLSL = /* glsl */`
// THE ONE FORM THAT IS NOT A FORMULA. Every other branch of shapeForm rebuilds
// a node's place from its identity and the clock; a double pendulum's place
// depends on everywhere it has been, so it is integrated on the CPU (see
// pendulum.js) and arrives here as an attribute. Declared in this shared block
// because shapeForm reads it; the line layer's geometry does not carry it, so
// during a pendulum its endpoints read zero and the constellation folds into
// the core — which, for that gesture, is right.
attribute vec3 aSim;
uniform float uShapeMix,uShapeA,uShapeB,uShapeC,uShapeD,uShapeTime,uNoiseAmp,uNoiseFreq,uFlowAmp,uFlowSpeed;
uniform int uShapeId;
uniform vec4 uOp[6];       // (opcode, arg0, arg1, arg2)
uniform vec4 uOpMask[6];   // (maskcode, m0, m1, unused)
uniform vec4 uPull[4];     // (dir.xyz, weight)

// The SAME six directions as NAMED_DIR in tags.mjs, so 'top' means one thing
// whether it is colouring a node or pulling one. A test asserts the parity.
vec3 namedDir(float c){
  if (c < 1.5) return vec3(0.0, 1.0, 0.0);      // top
  if (c < 2.5) return vec3(0.0,-1.0, 0.0);      // bottom
  if (c < 3.5) return vec3(-1.0, 0.0, 0.0);     // left
  if (c < 4.5) return vec3(1.0, 0.0, 0.0);      // right
  if (c < 5.5) return vec3(0.0, 0.0, 1.0);      // front
  return vec3(0.0, 0.0,-1.0);                   // back
}

// How much of a move a given node receives. Soft edges everywhere — a hard
// step would draw a visible seam across the body.
float maskW(vec4 mk, vec3 dir, float u, float rnd, float az){
  float c = mk.x;
  if (c < 0.5) return 1.0;                                   // unmasked
  if (c < 6.5) return smoothstep(-0.1, 0.75, dot(dir, namedDir(c)));
  float lo = min(mk.y, mk.z), hi = max(mk.y, mk.z);
  if (c < 7.5) return smoothstep(lo - 0.08, lo + 0.04, u) * smoothstep(hi + 0.08, hi - 0.04, u);   // @band, latitude
  if (c < 8.5) return step(rnd, mk.y);                       // @rand, a scattered share
  float a = az * 0.15915494 + 0.5;                           // @wedge, azimuth as 0..1
  return smoothstep(lo - 0.06, lo + 0.03, a) * smoothstep(hi + 0.06, hi - 0.03, a);
}

// ---- THE FORMS -------------------------------------------------------------
// Eight ways for the cloud to be arranged. Each one is a remap of the node's
// own identity — its direction on the fibonacci sphere (dir), its index as a
// 0..1 walk (u), and its fixed random (rnd) — into somewhere else. Nothing here
// is stored, nothing is uploaded: 24,000 positions are recomputed every frame
// from four uniforms, which is the whole reason a posture costs twelve tokens
// instead of three hundred thousand.
//
// TWO RULES EVERY FORM OBEYS.
//  1. Stay inside R. fitCamera fits a SPHERE of 1.6, so a form that reaches
//     further is simply off screen — the cube is scaled by 1/sqrt(3) for exactly
//     this reason, so its CORNERS land at R rather than its faces.
//  2. Anything flat gets real thickness. Edge-on, 24,000 points at ~5 device px
//     each would cram half a million px^2 of coverage into a few thousand, and
//     body.js's own point-size comment documents where that ends: the bloom goes
//     white. A disc of dust has a thickness in the world, too.
vec3 shapeForm(vec3 dir, float u, float R, float rnd){
  float az = atan(dir.z, dir.x + 1e-6);        // the node's own golden-angle bearing
  if (uShapeId == 1) {                          // shell — nested spheres
    // BY rnd, NOT BY u: u is an affine function of latitude on a fibonacci
    // sphere, so fract(u*N) would stack N bowls, not nest N shells.
    float n = max(uShapeA, 2.0);
    float k = floor(rnd * n);
    return dir * R * mix(0.35, 1.0, (k + 1.0) / n);
  }
  if (uShapeId == 2) {                          // ring — a torus, index around it
    float ang = u * 6.2831853;
    float tr  = R * uShapeA;                    // tube radius, 0.10..0.46 of R
    vec3  c   = vec3(cos(ang), 0.0, sin(ang)) * (R - tr);
    vec3  rad = vec3(cos(ang), 0.0, sin(ang));
    return c + rad * (cos(az) * tr) + vec3(0.0, 1.0, 0.0) * (sin(az) * tr);
  }
  if (uShapeId == 3) {                          // disc — an exact Vogel sunflower
    // sqrt(u) with the golden-angle azimuth the sphere already gives us is
    // precisely Vogel's construction: even density, no clustering, for free.
    float r = R * sqrt(u);
    return vec3(cos(az) * r, (rnd - 0.5) * 0.16 * R, sin(az) * r);
  }
  if (uShapeId == 4) {                          // helix — a spring
    float turns = max(uShapeA, 1.0);
    float ang = u * 6.2831853 * turns;
    float tr  = R * 0.10;
    vec3  rad = vec3(cos(ang), 0.0, sin(ang));
    return rad * (R * 0.42) + vec3(0.0, (u * 2.0 - 1.0) * R * 0.85, 0.0)
         + rad * (cos(az) * tr) + vec3(0.0, 1.0, 0.0) * (sin(az) * tr);
  }
  if (uShapeId == 5) {                          // lattice — a crystal
    float n = max(uShapeA, 2.0);
    vec3 p = floor(dir * n + 0.5) * (R / n);
    return p + (vec3(rnd, fract(rnd * 7.31), fract(rnd * 13.77)) - 0.5) * (R / n) * 0.35;
  }
  if (uShapeId == 6) {                          // spiral — a flat galaxy
    float arms = max(uShapeA, 2.0);
    float r = R * sqrt(u);
    float base = floor(rnd * arms) / arms * 6.2831853;
    float ang = base + (r / R) * 2.6 + (fract(rnd * 31.0) - 0.5) * 0.4;
    return vec3(cos(ang) * r, (fract(rnd * 17.0) - 0.5) * 0.09 * R, sin(ang) * r);
  }
  if (uShapeId == 7) {                          // cube — with real faces
    vec3 a = abs(dir);
    // 0.5774 = 1/sqrt(3): puts the CORNERS on R instead of the faces, so the
    // whole thing stays inside the camera's sphere.
    return dir / max(a.x, max(a.y, a.z)) * R * 0.5774;
  }
  // ---- four closed-form families ------------------------------------------
  // Each is ONE equation from the mathematics shelf, and each obeys the two
  // rules above: whatever the equation reaches, the point is brought inside R
  // (spikes and far circles are clipped, never off screen), and nothing flat
  // ships without thickness. No cosh/sinh anywhere: this shader is GLSL ES
  // 1.00 and those do not exist in it, so the hyperbolics are exp() by hand.
  if (uShapeId == 8) {                          // superellipsoid — Barr 1981, two exponents
    // s = 1 is the sphere; toward 0 it squares up into a box; past 1 it pinches
    // into an octahedron and then a star. Latitude/longitude come from the
    // node's own fibonacci direction, so density stays even as the form changes.
    float s1 = uShapeA, s2 = uShapeB;
    float eta = asin(clamp(dir.y, -1.0, 1.0));
    float ce = cos(eta), se = sin(eta), co = cos(az), so = sin(az);
    vec3 p = vec3(sign(ce * co) * pow(abs(ce), s1) * pow(abs(co), s2),
                  sign(se)      * pow(abs(se), s1),
                  sign(ce * so) * pow(abs(ce), s1) * pow(abs(so), s2));
    float L = length(p); if (L > 1.0) p /= L;   // the box limit reaches sqrt(3): rule 1
    return p * R;
  }
  if (uShapeId == 9) {                          // supershape — Gielis 2003: m, n1, n2 (n3 = n2)
    // r(t) = (|cos(mt/4)|^n2 + |sin(mt/4)|^n2)^(-1/n1), once around longitude and
    // once across latitude, multiplied. m = 0 is exactly the sphere. Divided by
    // its own largest radius — at the 45° between lobes when n2 > 2, and 1
    // otherwise — so the lobes TOUCH R instead of being clipped flat against it.
    float m = uShapeA, n1 = max(uShapeB, 0.05), n2 = max(uShapeC, 0.05);
    float ph = asin(clamp(dir.y, -1.0, 1.0));
    float r1 = pow(pow(abs(cos(m * az * 0.25)), n2) + pow(abs(sin(m * az * 0.25)), n2), -1.0 / n1);
    float r2 = pow(pow(abs(cos(m * ph * 0.25)), n2) + pow(abs(sin(m * ph * 0.25)), n2), -1.0 / n1);
    // m = 0 has no lobes — r is 1 everywhere and the 45° maximum is never
    // reached — so its own maximum is 1, and dividing by the lobed one would
    // shrink "the sphere" to three quarters. Any integer m ≥ 1 reaches the 45°.
    float rmax = m < 0.5 ? 1.0 : pow(min(1.0, 2.0 * pow(0.70710678, n2)), -1.0 / n1);
    r1 /= rmax; r2 /= rmax;
    vec3 p = vec3(r1 * cos(az) * r2 * cos(ph), r2 * sin(ph), r1 * sin(az) * r2 * cos(ph));
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 10) {                         // hopf fibration — linked circles on nested tori
    // A point of S³ is (cos η cos(ξ1+ξ2), cos η sin(ξ1+ξ2), sin η cos ξ2, sin η sin ξ2);
    // ξ1 runs along one fibre, ξ2 picks the fibre, η picks the torus. Projected
    // stereographically, every fibre is a circle and every two are linked.
    // x4 is constant along a fibre, so the fibre's whole circle scales by
    // 1/(1 − sin η sin ξ2) — kept ≤ 3 by η ≤ 0.73, then brought in by 0.32: rule 1
    // without a single clipped point on the largest torus.
    float tori = max(uShapeA, 1.0), fib = max(uShapeB, 1.0);
    // η runs to 0.93 (sin ≈ 0.8), which makes the outermost circle about three
    // times the innermost — the reel's proportion. A projected point's length
    // is sqrt((1+x4)/(1−x4)), largest on the outermost torus where x4 = sin η,
    // so the WHOLE figure is scaled by the inverse of that for THIS count of
    // tori: the largest torus touches R exactly whatever digit was written. The
    // first version scaled by one fixed number derived from a cap the tori
    // never reached, and the body sat at 0.57R, flat, and dimmed for being
    // near the centre. (x1, x2) — the big-circle coordinates — go to the screen
    // plane, so the tori stand tall instead of reading as a lens.
    float etaMax = (tori - 0.5) / tori * 0.93;
    float eta = (floor(rnd * tori) + 0.5) / tori * 0.93;
    float xi2 = floor(fract(rnd * 7.31) * fib) / fib * 6.2831853;
    float xi1 = u * 6.2831853;
    float ce = cos(eta), se = sin(eta), seMax = sin(etaMax);
    float x1 = ce * cos(xi1 + xi2), x2 = ce * sin(xi1 + xi2), x3 = se * cos(xi2), x4 = se * sin(xi2);
    vec3 p = vec3(x1, x2, x3) / (1.0 - x4) * sqrt((1.0 - seMax) / (1.0 + seMax));
    p += (vec3(fract(rnd * 13.77), fract(rnd * 17.0), fract(rnd * 31.0)) - 0.5) * 0.045;   // a circle is a curve: rule 2
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 11) {                         // calabi–yau — Hanson's projection of z1^n + z2^n = 1
    // The Fermat surface in C², drawn n² patches at a time: z1 = e^{2πik1/n} cos^{2/n}(x+iy),
    // z2 = e^{2πik2/n} sin^{2/n}(x+iy), then (Re z1, Re z2, cos α Im z1 + sin α Im z2).
    // That the point satisfies z1^n + z2^n = 1 is checked in the tests with
    // complex arithmetic — a wrong exponent or phase here gives A shape, not this one.
    float n = max(uShapeA, 2.0), al = uShapeB;
    float pi_ = floor(rnd * n * n);
    float k1 = mod(pi_, n), k2 = floor(pi_ / n);
    float x = u * 1.5707963;
    float y = (fract(rnd * 13.77) * 2.0 - 1.0) * 1.1;
    float ey = exp(y), chy = (ey + 1.0 / ey) * 0.5, shy = (ey - 1.0 / ey) * 0.5;   // cosh, sinh — by hand
    vec2 c = vec2(cos(x) * chy, -sin(x) * shy);                                     // cos(x+iy)
    vec2 sn = vec2(sin(x) * chy,  cos(x) * shy);                                    // sin(x+iy)
    float e = 2.0 / n;
    float rc = pow(length(c), e),  ac = atan(c.y, c.x) * e + 6.2831853 * k1 / n;
    float rs = pow(length(sn), e), as_ = atan(sn.y, sn.x) * e + 6.2831853 * k2 / n;
    vec2 z1 = rc * vec2(cos(ac), sin(ac));
    vec2 z2 = rs * vec2(cos(as_), sin(as_));
    vec3 p = vec3(z1.x, z2.x, cos(al) * z1.y + sin(al) * z2.y) * 0.52;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 12) {                         // pendulum — twenty-four thousand of them, from one release
    // The position was integrated this frame on the CPU. The jitter is rule 2:
    // at the moment of release every tip lies on ONE circle, which is eleven
    // points per pixel and a blown-white ring; a static 0.03R thickens it into
    // a tube without touching a single trajectory.
    vec3 p = aSim + (vec3(rnd, fract(rnd * 7.31), fract(rnd * 13.77)) - 0.5) * 0.03;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  return dir * R;                               // sphere — home
}

// The moves, applied in the order the presence wrote them — which is where
// most of the expressiveness lives, because they do not commute.
vec3 shapeApply(vec3 p, vec3 dir, float u, float t, float rnd, float az, float R){
  for (int k = 0; k < 6; k++) {
    vec4 o = uOp[k];
    if (o.x < 0.5) break;                       // an empty slot means the stack ended
    float w = maskW(uOpMask[k], dir, u, rnd, az);
    if (w > 0.001) {
      float A = o.y, F = o.z, S = o.w;
      if (o.x < 1.5)      p += dir * (sin(u * F + t * S) * A * w);                     // ripple, along the index
      else if (o.x < 2.5) p += dir * (sin(az * F + t * S) * A * w);                    // wave, around the azimuth
      else if (o.x < 3.5) { float a =  p.y * A * w;         float c = cos(a), sn = sin(a); p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z); }  // twist, by height
      else if (o.x < 4.5) { float a = length(p.xz) * A * w; float c = cos(a), sn = sin(a); p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z); }  // swirl, by radius
      else if (o.x < 5.5) p *= 1.0 + sin(t * S) * A * w;                               // pulse, breathing
      else if (o.x < 6.5) p += dir * ((fract(sin(rnd * 91.7) * 4371.3) - 0.5) * A * w * step(0.5, fract(t * 2.0)));  // shatter
      else if (o.x < 7.5) p *= mix(1.0, max(0.25, 1.0 - A), w);                        // gather, collapse
      else { float a = t * A * w; float c = cos(a), sn = sin(a); p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z); }   // spin
    }
  }
  // NOISE IS HOISTED OUT OF THE LOOP, and that is not tidiness. fbm is four
  // snoise; a driver that predicates rather than branches would run it on all
  // six iterations — +24 snoise, roughly tripling the vertex cost of the whole
  // orb. One dedicated slot under one uniform branch caps it at exactly +1 fbm
  // however many times the presence writes it.
  if (uNoiseAmp > 0.001) p += dir * (fbm(dir * uNoiseFreq + vec3(0.0, 0.0, t * 0.4)) * uNoiseAmp);
  // FLOW — the reel's α(x,y,z) = 3·2π·N(...): a noise field read as an ANGLE, and
  // the node drifts along that bearing in its own tangent plane. Positions here
  // are recomputed from identity every frame, so nothing is truly advected: the
  // field itself moves (t * uFlowSpeed) and the body drifts with it. Sampled at
  // p, not dir, so it is a field over whatever form the body is actually in.
  // One more fbm, hoisted the same way noise is: +1, not +1 per write.
  //
  // It does NOT turn the trail buffer on. It did, for one commit, and in three
  // renders the body was a solid white disc: the trail composites with
  // MaxEquation/One/One and was built for a sparse wake, and the max over even a
  // few frames of twenty-four thousand crisp points is a filled disc by
  // construction. The reel's streaks come from SPARSE particles; that pairing
  // (flow + condense) is a separate step, taken when it can be looked at.
  // To this file's own doctrine — the presence must never author a transition
  // this substance would not make — a move that blanks the frame is not a move.
  if (uFlowAmp > 0.001) {
    float ang = 18.849556 * fbm(p * 0.9 + vec3(0.0, 0.0, t * uFlowSpeed));
    vec3 tng = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
    vec3 bin = cross(dir, tng);
    p += (tng * cos(ang) + bin * sin(ang)) * uFlowAmp;
  }
  // PULLS ACCUMULATE; THEY NEVER CHAIN. Two chained mixes are order-dependent
  // and last-one-wins, so 'pull left 5 pull right 5' would drift the whole body
  // right instead of splitting it into a dumbbell. This is the same Shepard
  // average applyPaint already uses for colour, and exp(8·dot−8) tracks a
  // gaussian in the angle to within 2% for ~24 ALU instead of ~160.
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    vec4 a = uPull[k];
    if (a.w < 0.001) break;
    float w = a.w * exp(8.0 * dot(dir, a.xyz) - 8.0);
    acc += a.xyz * (R * 0.85) * w; wsum += w;
  }
  if (wsum > 1e-4) p = mix(p, acc / wsum, clamp(wsum, 0.0, 1.0));
  return p;
}
`;

const VERT = /* glsl */`

uniform float uTime,uAmp,uFreq,uSpeed,uSize,uRadius,uAudio,uGlitch,uPlasma,uPointK;
uniform float uFlashPeriod;            // seconds; 0 = not flashing
uniform float uHueBase,uHueRange,uHueFlow,uHueSweep,uSat,uVal,uCFreq,uSpeckle;
// THE FIELD AS A CHOICE, not a fixed fact. How many of it there are, how far in
// it has drawn itself, and where in the room it is standing.
uniform float uCondense;   // 0 a whole sphere · 1 every surviving node at one point
uniform float uKeep;       // fraction of the field alive, by rank. 0 = exactly one.
uniform vec3  uOffset;     // where the body is, in world units. (0,0,0) is home.
attribute float aRand;
attribute float aRank;     // this node's place in a random permutation, 0..1
attribute vec3 aColor;                 // per-node color for paint mode
attribute float aMem;                  // which memory claimed this mote, or -1
attribute float aHalo;                 // 1 at the node, falling off through its neighbours
uniform float uMemOn;                  // eased 0->1 as the layer comes up
uniform float uMemPick;                // the held memory, or -1 for none
// THE TOUCH. Where a finger last landed on the body, as a unit direction in the
// body's own space, and how bright that moment still is. Colin: "instead of
// having bright spots with specific memories, let's just make it so that
// clicking anywhere brightens a small area around your click and pulls up a
// memory. so the bright memory spot only displays on click." A direction rather
// than a point, so the bloom sits correctly on whatever form the body is
// wearing — a cube, a ribbon, a collapsed point — without knowing anything
// about it.
uniform vec3 uTouch;
uniform float uTouchAmp;               // 1 the instant it lands, eased to 0
uniform float uTouchK;                 // the cap's tightness (von Mises)
uniform sampler2D uMemTex;             // per-memory state, one texel each
uniform float uMemCols;
varying float vHue,vSat,vVal,vShade,vFil,vRibbon;
varying float vMem;                    // 0 for ordinary dust; >0 for a memory
varying float vFlash;                  // 1, or the dim half of a flash
varying vec3 vPaintCol;
${SNOISE}
float fbm(vec3 p){
  float f=0.0, a=0.5;
  for(int i=0;i<4;i++){ f+=a*snoise(p); p*=2.02; a*=0.5; }
  return f;
}
${SHAPE_GLSL}
void main(){
  vec3 dir=normalize(position);
  float t=uTime*uSpeed;
  float n=fbm(dir*uFreq+vec3(0.0,0.0,t));
  // sharp radial jitter when "glitch" is high
  float g=uGlitch*sin((aRand*40.0)+uTime*8.0)*step(0.7,fract(aRand*13.0+uTime*0.5));
  float disp=n*uAmp*(1.0+uAudio*1.6)+g*0.25;
  vec3 pos=dir*(uRadius+disp);
  // THE POSTURE. Off by default and free when off — one uniform compare. The
  // mood's own displacement rides ALONG the new surface rather than being
  // replaced by it, so a shape that is excited still trembles.
  if (uShapeMix > 0.001) {
    float u = clamp((1.0 - position.y) * 0.5, 0.0, 1.0);   // == i/(COUNT-1), exactly
    // Hoisted: wave and @wedge both want it, and atan(0,0) at the two poles —
    // where the fibonacci radius is exactly 0 — is undefined in the spec.
    float az = atan(dir.z, dir.x + 1e-6);
    vec3 fp = shapeForm(dir, u, uRadius, aRand) + dir * disp;
    fp = shapeApply(fp, dir, u, uShapeTime, aRand, az, uRadius);
    // NaN can only enter through a form's own arithmetic, and IEEE says every
    // comparison against NaN is false — so a poisoned node fails BOTH of these
    // and goes home, alone, instead of taking the frame with it.
    float q = dot(fp, fp);
    fp = (q > 1e-8 && q < 16.0) ? fp : dir * uRadius;
    // RADIAL, never a box: fitCamera fits a sphere of 1.6, and the corner of a
    // 1.55 box sits at 2.68 — 68% outside the frame.
    float L = length(fp);
    fp *= (L > 1.45) ? (1.45 / L) : 1.0;
    pos = mix(pos, fp, uShapeMix);
  }

  // ---- CONDENSE, and WHERE IT IS -------------------------------------------
  // The collapse happens after the posture, so a shape can condense as a shape.
  // The offset is last, because it moves whatever the body has become.
  pos = mix(pos, vec3(0.0), uCondense);
  pos += uOffset;
  vec4 mv=modelViewMatrix*vec4(pos,1.0);

  // Plasma ribbons: narrow bright bands of energy that flow across the body when
  // uPlasma>0 — sharp peaks (high pow) leave dark gaps so they read as ribbons.
  float flow=fbm(dir*2.4+vec3(0.0,uTime*0.22,t*0.6));
  float ribbon=sin(dir.y*9.0 + dir.x*3.0 + uTime*0.9 + flow*4.0);
  vRibbon=pow(max(ribbon,0.0),6.0)*uPlasma;

  // uPointK replaces what used to be a hard-coded 10.0. gl_PointSize is in
  // DEVICE PIXELS, and the orb's projected size scales with the viewport, so a
  // constant here meant the points kept their pixel size while the orb shrank
  // underneath them: shrink the window and the same 24000 points crowd into
  // fewer pixels, overlap, and the whole sphere blows out white. Tying the
  // point size to the viewport keeps points-per-pixel — and therefore the
  // brightness — constant at every window size.
  // 0.75: the fragment's dot went from soft to solid, which roughly doubles
  // each point's integrated alpha — and coverage is exactly the quantity the
  // paragraph above says blows the sphere white. sqrt(1/2) on the radius holds
  // the brightness where it was. 0.80..1.20, not 0.55..1.45: the size spread
  // was a third of what made the cloud read as blur; the MOTION is untouched.
  gl_PointSize=uSize*0.75*(1.0+uAudio*0.6)*(uPointK/-mv.z)*(0.80+aRand*0.40)*(1.0+vRibbon*0.7);
  // Every form that gathers the cloud inward raises points-per-pixel, and the
  // comment above says exactly where that ends: the sphere goes white. Rather
  // than a per-shape table — which cannot know about a move that gathers, and
  // was measured ~6x too generous on lattice anyway — each node pays for its
  // OWN compression, by how far in it actually travelled. Free, and it cannot
  // be wrong about a form nobody has written yet.

  gl_PointSize*=mix(1.0, clamp(length(pos)/max(uRadius,1e-3), 0.30, 1.0), uShapeMix);
  // Condense needs its own, deeper floor. The line above exists because gathering
  // the cloud raises points-per-pixel until the sphere goes white, and it bottoms
  // out at 0.30 — which is right for a posture and nowhere near enough for a full
  // collapse, where every surviving node lands in the SAME place. Culling is the
  // real answer (uKeep), and this is what keeps the in-between honest.
  gl_PointSize*=mix(1.0, 0.16, uCondense);
  // CULLED NODES COST A VERTEX AND NOTHING ELSE. Size 0 rasterises no fragments,
  // and the position is pushed behind the camera so a driver that clamps point
  // size to a minimum of 1 cannot draw a stray speck anyway.
  if (aRank > uKeep) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  gl_Position=projectionMatrix*mv;

  // Independent per-node hue: a flowing field over the surface, widened by the
  // mood's hueRange. Bands wrap the body via the latitude sweep + the noise.
  float band=fbm(dir*uCFreq+vec3(0.0,0.0,uTime*uHueFlow));
  float hue=uHueBase + uHueRange*(band*0.5+0.5) + dir.y*uHueSweep + aRand*0.015;
  // Stardust (uSpeckle→1): the field goes near-white while ~7% of nodes keep a
  // vivid hue of their own — decorrelated per node, so the specks are truly
  // random colors scattered through the white, and slightly larger so they read.
  float spk=step(0.93,fract(aRand*47.13));
  hue+=uSpeckle*spk*aRand*7.0;
  gl_PointSize*=1.0+uSpeckle*spk*0.5;
  // THE DECODE, AND THE GUARD. Both of these are total silent failures if
  // skipped. texture2D on an UnsignedByteType texture returns NORMALISED
  // floats, so a state stored as 0/85/170 arrives as 0.0/0.333/0.667 and every
  // threshold downstream is dead code. And aMem = -1 must be gated BEFORE the
  // lookup: mod(-1, 64) is 63 and floor(-1/64) is -1, which under CLAMP_TO_EDGE
  // resolves to a real memory's texel — so all ~22,000 unclaimed motes would
  // inherit some arbitrary memory's brightness.
  float on = step(0.0, aMem) * uMemOn;
  float memState = 0.0;
  if (on > 0.0) {
    float col = mod(aMem, uMemCols);
    float row = floor(aMem / uMemCols);
    vec2 uvM = (vec2(col, row) + 0.5) / uMemCols;
    memState = texture2D(uMemTex, uvM).b * 255.0 / 170.0;   // decode, then 0..1
  }
  // THE LIGHT IS WHERE THE HAND IS, not where the memories are. Every claimed
  // mote used to glow for as long as the layer was up — sixty of them per
  // memory, a few dozen memories — and the body wore them like a rash (Colin:
  // "kind of look like chicken pox"). The memories are still there, still
  // claimed, still wired into the constellation; what has gone is the idea that
  // they should announce themselves. Touch the body and light blooms under your
  // finger; the memory nearest that spot is the one that comes up.
  //   A von Mises cap on the sphere: exp(k(c-1)) is 1 at the point of contact
  // and falls off smoothly with angle, the same kernel this codebase already
  // uses for the presence's gestures. memState survives as a small lift, so a
  // memory the hand has actually chosen is a touch brighter within the bloom
  // than the dust around it.
  float touch = 0.0;
  if (uTouchAmp > 0.001) {
    float c = dot(normalize(dir), uTouch);
    touch = uTouchAmp * exp(uTouchK * (c - 1.0));
  }
  float chosen = (uMemPick > -0.5 && abs(aMem - uMemPick) < 0.5) ? 1.0 : 0.0;
  vMem = touch * (1.0 + 0.85 * chosen * on * memState);
  // a claimed mote is a little larger, so a node reads as a node and not as a
  // slightly whiter grain of the same dust
  gl_PointSize *= 1.0 + vMem * 0.9;
  vHue=fract(hue);
  vSat=mix(uSat, mix(0.05,0.95,spk), uSpeckle);
  vVal=uVal;
  // THE FLASH: on for half the period, dim (not gone — the core stays) for the
  // other half. Computed here from uTime so the fragment needs no clock.
  vFlash = uFlashPeriod > 0.0 ? mix(0.05, 1.0, step(0.5, fract(uTime / uFlashPeriod))) : 1.0;
  vPaintCol=aColor;
  vShade=clamp(disp*1.5+0.5,0.0,1.0);   // crests bright, troughs dim
  vFil=pow(clamp(disp,0.0,1.0),2.0);     // near-white filaments on the peaks
}`;

const FRAG = /* glsl */`
precision highp float;

uniform float uDotFade,uPaint;
// THE TRAIL'S TWO. uPre is 0 for the body and 1 for the trail pass: the trail
// buffer accumulates with MAX, which ignores blend factors entirely, so its
// colour has to arrive ALREADY multiplied by its own alpha or every sprite's
// soft skirt writes full-strength colour and the wake becomes a chain of hard
// discs. uInk is how much ink a pass lays down.
//   At uPre 0 / uInk 1 the output line is algebraically the line that shipped:
//   mix(col, x, 0.0) is col, exactly. One fragment shader serves both passes on
//   purpose — a separate TRAIL_FRAG would drift out of paint mode, the memory
//   tint and everything added later.
uniform float uPre,uInk;
uniform vec3 uEnvGlow;
varying float vHue,vSat,vVal,vShade,vFil,vRibbon;
varying float vMem;
varying float vFlash;
varying vec3 vPaintCol;
vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}
void main(){
  vec2 uv=gl_PointCoord-0.5;
  float r=length(uv);
  if(r>0.5) discard;
  // A CRISP DOT, NOT A BLUR. This ramped from the rim all the way in to 8% of
  // the radius, so only the innermost sixth of every point was solid and the
  // body read as a haze of soft blobs. Colin, looking at Null Sky's spherical
  // harmonics: the points themselves should be crisp. Solid to DOT_RIM of the
  // radius now, with the last stretch left for anti-aliasing — a fixed rim
  // rather than fwidth(), which is an extension in GLSL ES 1.00 and a shader
  // that fails to compile is a black orb. The energy this adds is paid back in
  // the vertex shader: a hard disc carries about twice the integrated alpha of
  // the old soft one, so the radius comes down to hold the brightness.
  // DEFINED ON THE LINE ABOVE ITS USE, on purpose. This fragment tail is
  // spliced into more than one material; a define placed in one material's
  // header compiled the others to an undeclared identifier (the points drew,
  // and a layer that shares this code went black). Kept with the use, it goes
  // wherever the use goes.
#define DOT_RIM 0.40
  float edge=smoothstep(0.5,DOT_RIM,r);
  // Paint mode: each node wears the color Y3K painted; otherwise the generative
  // HSV scheme field. Both keep the crest shading so the body reads as 3D.
  vec3 col = (uPaint>0.5)
    ? vPaintCol*(0.5+0.6*vShade)
    : hsv2rgb(vec3(vHue, vSat, vVal*(0.45+0.6*vShade)));
  col+=vFil*0.55;                        // light up the crest filaments
  col*=(1.0+vRibbon*1.7);                // ribbons = bright surges of the field's own color
  col=mix(col, vec3(1.0,0.95,0.85), vRibbon*0.3);  // a hot white-gold crest on the brightest
  // the world's light through the dust: the UNLIT side lifts most, so against
  // a bright sky the cloud reads as backlit translucent dust, not a black disc
  col += uEnvGlow * (0.35 + 0.75 * (1.0 - vShade));
  float alpha=edge*(0.40+0.60*vShade)*uDotFade*vFlash;
  alpha=max(alpha, edge*vRibbon*0.85);   // ribbons glow even through faded dots
  // THE MEMORY, LIT. Placed HERE, after alpha exists — inserting it earlier
  // references an undeclared identifier and the material fails to compile,
  // which is a BLACK ORB rather than a degraded one. It is also deliberately
  // downstream of the ribbon multiply, the white-gold mix and the env glow: up
  // there a node's colour gets multiplied by up to 2.7 in plasma form and
  // washes out white.
  //
  // Normalised for PEAK RADIANCE, not total energy: bloom thresholds per-pixel
  // luminance at 0.35 and the composer runs half-float with no tone mapping, so
  // anything over 1.0 is real HDR with no rolloff. A cold node sits near 0.6.
  if (vMem > 0.001) {
    col = mix(col, vec3(0.72, 0.84, 1.0), min(0.85, vMem * 0.8));
    col += vec3(0.30, 0.36, 0.45) * vMem;
    alpha = max(alpha, edge * (0.35 + 0.45 * vMem));
  }
  if (alpha < 0.02) discard;             // the stacking tail never silts up a sky

  alpha *= uInk;
  gl_FragColor=vec4(mix(col, col*alpha, uPre), alpha);
}`;

const lerp = (a, b, t) => a + (b - a) * t;

// Radial-gradient sprite texture for the glowing core.
function glowTexture() {
  const s = 128;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A procedural brushed-aluminum roughness map (no image asset): a mid-roughness
// field scored with fine vertical grain. Kept to a tight value range so no hot
// specular streak ever feeds the bloom. Repeated densely down the walls.
function brushedRoughnessTexture(renderer) {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#6b6b6b'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    const v = 95 + Math.floor(Math.random() * 55); // grey 95..150 → roughness ~0.37..0.59
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.globalAlpha = 0.4 + Math.random() * 0.4;
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; // data map, not sRGB
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Machined panel albedo: per-panel tone jitter + recessed seams + a 1px chamfer
// catch-light (5% white on a dark albedo — can never approach the bloom threshold).
function panelTexture(renderer, { px = 1024, panels = 4, base = 74, jitter = 5, seam = 30 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const step = px / panels;
  for (let i = 0; i < panels; i++) for (let j = 0; j < panels; j++) {
    const v = base + Math.round((Math.random() * 2 - 1) * jitter);
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;          // cool graphite bias
    g.fillRect(i * step, j * step, step + 1, step + 1);
  }
  // Seam only at the START of each panel (i = 0..panels-1), never the closing
  // edge — so when the texture tiles, a tile's last boundary is drawn by the
  // NEXT tile's i=0 line: exactly ONE groove per boundary, no doubled center
  // lines with a gap between them.
  for (let i = 0; i < panels; i++) {
    const x = i * step;
    g.fillStyle = `rgb(${seam},${seam + 1},${seam + 4})`; // recessed seam
    g.fillRect(x, 0, 2, px); g.fillRect(0, x, px, 2);
    g.fillStyle = 'rgba(255,255,255,0.06)';               // chamfer catch-light
    g.fillRect(x + 2, 0, 1, px); g.fillRect(0, x + 2, px, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;                  // albedo map (roughness maps stay NoColorSpace)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Lathe-ring roughness for the floor: concentric machining rings centered under
// the orb, so its light pool reads as a circular sheen on a turned metal platter.
// Used at repeat (1,1) — the rings stay centered whatever size the floor scales to.
function floorRingRoughness(renderer) {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(135,135,135)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const rad = Math.pow(Math.random(), 0.7) * S * 0.75;
    const v = (105 + Math.random() * 55) | 0;             // roughness ~0.41..0.63 — shinier than walls
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.globalAlpha = 0.2 + Math.random() * 0.35;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.arc(S / 2, S / 2, rad, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
// Core tint = a hot near-white, lightly pulled toward the scheme's bright accent.
function coreColorFor(key) {
  const s = SCHEME_BY_KEY[key] || SCHEMES[0];
  if (s.mono) return 0xffffff;
  const hex = s.preview[s.preview.length - 2] || s.preview[s.preview.length - 1] || '#ffffff';
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.65); // 65% toward white → bright hot point
  return (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
}

// Constellation web: line endpoints carry unit-sphere positions and run through
// the SAME displacement as the dots (minus glitch), so the lattice flexes with
// the field. Shares the dots' uniform objects so it stays in lockstep.
const LINE_VERT = /* glsl */`

uniform float uTime,uAmp,uFreq,uSpeed,uRadius,uAudio;
// The web has to go where the body goes. It has no uKeep — a line is not a node
// and cannot be culled by rank — but if it missed uCondense the orb would draw
// itself into a point and leave its whole constellation hanging at full size.
uniform float uCondense;
uniform vec3  uOffset;
// Link strength, 0..1. The memory graph sets it per edge so a strong link reads
// brighter than a faint one; the decorative constellation supplies a constant 1,
// which multiplies out to exactly the lattice that shipped before this existed.
attribute float aW;
varying float vSh;
varying float vW;
${SNOISE}
float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<4;i++){ f+=a*snoise(p); p*=2.02; a*=0.5; } return f; }
${SHAPE_GLSL}
void main(){
  vec3 dir=normalize(position);
  float n=fbm(dir*uFreq+vec3(0.0,0.0,uTime*uSpeed));
  float disp=n*uAmp*(1.0+uAudio*1.6);
  vSh=clamp(disp*1.5+0.5,0.0,1.0);
  vW=aW;
  vec3 pos=dir*(uRadius+disp);
  if (uShapeMix > 0.001) {
    // The constellation is a different, sparser sphere with no aRand attribute,
    // so its randomness is hashed from the direction. Same stack, same clock,
    // same clamp — the web moves with the body instead of hanging around it.
    float u = clamp((1.0 - dir.y) * 0.5, 0.0, 1.0);
    float rnd = fract(sin(dot(dir, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float az = atan(dir.z, dir.x + 1e-6);
    vec3 fp = shapeForm(dir, u, uRadius, rnd) + dir * disp;
    fp = shapeApply(fp, dir, u, uShapeTime, rnd, az, uRadius);
    float q = dot(fp, fp);
    fp = (q > 1e-8 && q < 16.0) ? fp : dir * uRadius;
    float L = length(fp);
    fp *= (L > 1.45) ? (1.45 / L) : 1.0;
    pos = mix(pos, fp, uShapeMix);
  }

  pos = mix(pos, vec3(0.0), uCondense);
  pos += uOffset;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
}`;
const LINE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uLineColor; uniform float uLineOpacity;
varying float vSh;
varying float vW;
// vW is 1 for the constellation, so its term vanishes and the web is untouched.
// For a memory edge it is the cosine between two memories, floored so the
// weakest link this graph kept is still legible rather than a guess at a line.
void main(){
  float w = 0.45 + 0.55 * vW;
  gl_FragColor=vec4(uLineColor*(0.5+0.7*vSh)*w, uLineOpacity*(0.3+0.7*vSh)*w);
}`;

// A sparse Fibonacci sphere, each node linked to its k nearest neighbors.
function buildConstellation(M, k) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < M; i++) {
    const y = 1 - (i / (M - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden;
    pts.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  const seen = new Set();
  const verts = [];
  for (let i = 0; i < M; i++) {
    const best = [];
    for (let j = 0; j < M; j++) {
      if (j === i) continue;
      best.push([pts[i][0] * pts[j][0] + pts[i][1] * pts[j][1] + pts[i][2] * pts[j][2], j]);
    }
    best.sort((a, b) => b[0] - a[0]); // largest dot = nearest on the sphere
    for (let n = 0; n < k; n++) {
      const j = best[n][1];
      const key = i < j ? i + ',' + j : j + ',' + i;
      if (seen.has(key)) continue;
      seen.add(key);
      verts.push(pts[i][0], pts[i][1], pts[i][2], pts[j][0], pts[j][1], pts[j][2]);
    }
  }
  return new Float32Array(verts);
}
// Line tint: the scheme's secondary color (cool gray for monochrome).
function lineColorFor(key) {
  const s = SCHEME_BY_KEY[key] || SCHEMES[0];
  return s.mono ? '#cfd6e6' : (s.preview[1] || s.preview[0] || '#9fb4d6');
}
// Room-glow tint for a scheme: the average of its preview swatches. A narrow
// palette (ember) yields its saturated hue; a wide one (aurora) a soft neutral —
// the right wash for the walls in each case (a rainbow averages to near-white).
function schemeGlowFor(key) {
  const s = SCHEME_BY_KEY[key] || SCHEMES[0];
  let r = 0, g = 0, b = 0;
  for (const h of s.preview) { const n = parseInt(h.slice(1), 16); r += (n >> 16) & 255; g += (n >> 8) & 255; b += n & 255; }
  const k = s.preview.length * 255;
  return new THREE.Color(r / k, g / k, b / k);
}

export function createBody(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4.6);

  // antialias:false is not a quality trade here — it is dead weight removal.
  // Every frame goes through the EffectComposer below, whose targets are their
  // own non-MSAA render targets. The only geometry ever rasterised into the
  // multisampled default framebuffer is the bloom pass's full-screen quads,
  // whose only edges are the edges of the screen. MSAA antialiases nothing,
  // while still costing a full-screen resolve and (on a phone's tile-based GPU)
  // a multisample attachment that has to survive a mid-frame round trip.
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setClearColor(0x04030a, 1);
  // dpr 3 on a phone means 9x the fragments of dpr 1 — for a soft, glowing,
  // particle-based image that reads no sharper. 1.5 is the sweet spot.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, COARSE ? 1.5 : 2));
  container.appendChild(renderer.domElement);

  // The metal room needs reflections to read as metal at all (PBR metalness is
  // black with no environment): bake a neutral studio probe into scene.environment
  // ONLY — leave scene.background unset so the fixed dark clear color sits behind
  // the enclosing room.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // The windowless, doorless room: a dark anodized-aluminum cube seen from the
  // inside (BackSide). Kept deliberately dark (space-gray graphite, not silver) so
  // the glowing orb is always the brightest thing in the frame.
  // The slab room. The old cube's floor/ceiling sat at ±dist*1.5 — so far out that
  // the camera's view rays hit the back wall before EVER reaching them: zero floor
  // or ceiling pixels rendered, and the room read as void. Fix: the room's HEIGHT
  // is fixed in world units (floor −2.2, ceiling +2.2 — the orb reaches 1.6, so it
  // floats 0.6 above its own light pool) while width/depth still scale with camera
  // distance for enclosure. Floor+ceiling land in frame at EVERY aspect — more
  // prominently the narrower the screen.
  const ROOM_HALF_H = 2.2;
  const PANEL_TILE = 5.6; // world units per texture tile (4 panels ≈ 1.4u each)
  const mkFace = (o) => new THREE.MeshStandardMaterial({
    side: THREE.BackSide, color: 0xffffff, emissive: 0x0c0e12, ...o,
  });
  // Matte walls take the orb light as an even wash; the floor is smoother, slightly
  // metal — a machined platter that catches a soft pool; the ceiling is darkest and
  // most matte so it recedes.
  // Tiles ~50% lighter (brighter albedo + lifted seams) and more reflective
  // (higher envMapIntensity) — roughness stays high so the extra light reads as
  // an even sheen, never sharp specular hotspots.
  const wallMat = mkFace({
    map: panelTexture(renderer, { base: 111, jitter: 6, seam: 46 }), roughnessMap: brushedRoughnessTexture(renderer),
    metalness: 0.25, roughness: 0.78, envMapIntensity: 0.34, emissiveIntensity: 0.25,
  });
  const floorMat = mkFace({
    map: panelTexture(renderer, { base: 96, jitter: 4, seam: 40 }),
    roughnessMap: floorRingRoughness(renderer),
    metalness: 0.4, roughness: 0.55, envMapIntensity: 0.42, emissiveIntensity: 0.15,
  });
  const ceilMat = mkFace({
    map: panelTexture(renderer, { base: 90, jitter: 5, seam: 42 }),
    metalness: 0.12, roughness: 0.9, envMapIntensity: 0.24, emissiveIntensity: 0.25,
  });
  // BoxGeometry group order: +x, -x, +y(ceiling), -y(floor), +z(behind cam), -z(back)
  const room = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2),
    [wallMat, wallMat, ceilMat, floorMat, wallMat, wallMat]);
  room.scale.set(7, ROOM_HALF_H, 7); // sane default until fitCamera sets it
  scene.add(room);
  // Milled edge-lines: with the slab shape the corner verticals + floor/ceiling
  // perimeters actually frame the view now.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(room.geometry),
    new THREE.LineBasicMaterial({ color: 0x363b43, transparent: true, opacity: 0.35 }),
  );
  edges.scale.copy(room.scale);
  scene.add(edges);

  // WHERE IT LIVES. The room is one option, not the only one — a mind kept in a
  // box is a mind kept in a box. The manager hides the room's own objects when
  // another world is chosen (see src/environments.js).
  // getOrb is read lazily: the rig is built further down, and a thumbnail has
  // to be able to step the orb out of its own photograph.
  const envs = createEnvironments({ scene, renderer, getOrb: () => rig, roomObjects: [room, edges] });
  // dev handle: lets a preview session inspect/toggle scene objects while tuning
  // an environment (harmless — read-only access to what is already on screen).
  if (typeof window !== 'undefined') window.__y3kScene = { scene, envs, THREE, renderer, camera };

  // Restrained, asymmetric lighting (premium, never flat). A fixed cool key gives
  // the walls a directional sheen that shifts as the camera orbits; an orb-tied
  // point light at the center makes the metal subtly breathe as Y3K speaks.
  // The room is lit ONLY by the orb. Directional lights are gone — they threw hard
  // specular hotspots on the metal. Instead the orb's color drives BOTH an ambient
  // (an even wash of the orb's hue across every wall) and a centered point light (a
  // soft glow that falls off gently, so it reads as sourced from the orb). Both are
  // retinted whenever the orb's color changes (setRoomGlow). A whisper of neutral
  // ambient just keeps the far corners off pure black.
  scene.add(new THREE.AmbientLight(0x2a2e34, 0.18));
  const orbAmbient = new THREE.AmbientLight(0xfff2e0, 0.40); // even wash of the orb's color (kept below the point light so the floor pool gradient reads)
  scene.add(orbAmbient);
  const orbLight = new THREE.PointLight(0xfff2e0, 4.0, 0, 1.3); // distance 0 = no cutoff; gentle decay = even spread
  scene.add(orbLight);
  // Retint both orb-glow lights to the orb's current color.
  const _glow = new THREE.Color();
  let glowScale = 1; // settings → Room: how strongly the orb lights the walls
  function setRoomGlow(c) { _glow.set(c); orbAmbient.color.copy(_glow); orbLight.color.copy(_glow); }

  // --- Room customization (settings → Room) ---------------------------------
  // brightness scales the panel albedo; grooves deepens/erases the milled seams;
  // hue+tint wash the metal in a color (multiplied over the maps, white = none);
  // glow scales the orb's light. Textures rebuild in place, keeping whatever
  // tile repeats fitCamera has set.
  const roomFaces = [
    { mat: wallMat, params: { base: 111, jitter: 6, seam: 46 } },
    { mat: floorMat, params: { base: 96, jitter: 4, seam: 40 } },
    { mat: ceilMat, params: { base: 90, jitter: 5, seam: 42 } },
  ];
  // Crossing between worlds used to be a cut: one frame taiga, the next frame
  // deep space. Building the new world takes a few milliseconds, so there is
  // nothing to hide behind — the veil does the hiding. It blooms up fast and
  // falls away slowly, which reads as surfacing somewhere rather than being
  // switched. Only on an actual CHANGE of world; re-applying the same room
  // (every brightness tweak calls through here) must not flash.
  let lastEnv = 'room';
  const veil = document.createElement('div');
  veil.className = 'env-veil';
  container.appendChild(veil);
  let veilT = 0;
  function dissolve() {
    clearTimeout(veilT);
    veil.classList.add('on');
    // long enough for the new sky to have compiled and drawn a frame
    veilT = setTimeout(() => veil.classList.remove('on'), 190);
  }

  // How each world lights the dust (r,g,b pre-scaled). The metal room is the
  // orb's native dark — zero, so its tuned look never moves.
  const ENV_DUST_GLOW = {
    room: [0, 0, 0],
    space: [0.02, 0.02, 0.04],
    ocean: [0.03, 0.08, 0.09],
    taiga: [0.04, 0.06, 0.08],
    dunes: [0.14, 0.09, 0.05],
    cavern: [0.02, 0.04, 0.04],
    cloudsea: [0.16, 0.15, 0.14],
    ember: [0.08, 0.03, 0.01],
  };
  function setRoom({ brightness = 1, hue = 220, tint = 0, grooves = 1, glow = 1, env = 'room' } = {}) {
    const dg = ENV_DUST_GLOW[env] || ENV_DUST_GLOW.room;
    uniforms.uEnvGlow.value.setRGB(dg[0], dg[1], dg[2]);
    if (env !== lastEnv) {
      dissolve(); lastEnv = env;
      // lit panels belong to the machined walls — carried into another
      // environment they would hang mid-air as glowing rectangles
      while (lit.length) killTile(lit.pop());
    }
    envs.set(env);
    envs.setBrightness(brightness);
    const b = Math.max(0.4, Math.min(2.2, Number(brightness) || 1));
    const g = Math.max(0, Math.min(2, Number(grooves) ?? 1));
    for (const { mat, params } of roomFaces) {
      const base = Math.min(235, Math.round(params.base * b));
      // grooves interpolates the seam toward the panel color (0 = seamless slab,
      // 1 = the stock milled look, 2 = deep-cut grooves).
      const seam = Math.max(4, Math.min(235, Math.round(base + (params.seam - params.base) * b * g)));
      const old = mat.map;
      mat.map = panelTexture(renderer, { base, jitter: params.jitter, seam });
      if (old) { mat.map.repeat.copy(old.repeat); old.dispose(); }
      const t = Math.max(0, Math.min(1, Number(tint) || 0));
      const wash = new THREE.Color(0xffffff).lerp(new THREE.Color().setHSL(((Number(hue) || 0) % 360) / 360, 0.6, 0.5), t * 0.6);
      mat.color.copy(wash);
      mat.needsUpdate = true;
    }
    glowScale = Math.max(0.3, Math.min(2.5, Number(glow) || 1));
    orbAmbient.intensity = 0.40 * glowScale;
    orbLight.intensity = 4.0 * glowScale;
  }
  // Average color of the paint anchors (the orb's overall hue): a full rainbow
  // averages to soft white, a single-hue paint to that hue — which is what should
  // wash the walls.
  function avgAnchorColor(anchors) {
    let r = 0, g = 0, b = 0; const n = anchors.length || 1;
    for (const a of anchors) { r += a.rgb[0]; g += a.rgb[1]; b += a.rgb[2]; }
    return new THREE.Color(r / n, g / n, b / n);
  }

  // --- Drag rotates the ORB inside a fixed room: a rig Group (below) holds the orb
  // and spins via an accumulated quaternion (no Euler angles, so no pole gimbal),
  // while the camera and room never move — the room stays a stable, level frame.
  // Gentle idle auto-spin when untouched; zoom and pan stay disabled.
  let idleEnabled = true;
  let dragging = false;
  let lastX = 0, lastY = 0, velX = 0, velY = 0, resumeTimer = 0;
  // How the field turns on its own, as a multiple of the idle speed: sign is
  // direction, 0 is still. The presence sets it with turn; it was a constant.
  // Declared HERE, above the loop that reads it (the TDZ rule).
  let idleTurn = 1;
  let lastMorphName = 'settle';   // the named pace to return to when a score ends
  const ROT_SPEED = 0.005, DAMP = 0.9, IDLE_SPEED = 0.0016;
  const rig = new THREE.Group();
  scene.add(rig);
  const _q = new THREE.Quaternion();
  const _yAxis = new THREE.Vector3(0, 1, 0);
  const _xAxis = new THREE.Vector3(1, 0, 0);
  // Pre-multiply world-space yaw then pitch — composing in the world frame carries
  // a straight-up drag continuously over the pole with no up-vector flip.
  function spin(dx, dy) {
    _q.setFromAxisAngle(_yAxis, dx); rig.quaternion.premultiply(_q);
    _q.setFromAxisAngle(_xAxis, dy); rig.quaternion.premultiply(_q);
    rig.quaternion.normalize();
  }
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  let downX = 0, downY = 0, downAt = 0; // for tap detection (tap = tiny move, quick release)
  el.addEventListener('pointerdown', (e) => {
    dragging = true; velX = 0; velY = 0; lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; downAt = performance.now();
    if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) * ROT_SPEED;
    const dy = (e.clientY - lastY) * ROT_SPEED;
    lastX = e.clientX; lastY = e.clientY; velX = dx; velY = dy; spin(dx, dy);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false; resumeTimer = 45; // brief grace before the idle spin resumes
    if (el.releasePointerCapture && e && e.pointerId != null) { try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ } }
    // A tap (not a drag): light up the panel it landed on.
    if (e && e.type === 'pointerup'
      && Math.hypot(e.clientX - downX, e.clientY - downY) < 6
      && performance.now() - downAt < 500) {
      // THE BODY IS ASKED FIRST, and now ANY tap on it is an answer. A tap used
      // to have to land on a memory's own cluster, which is why the clusters had
      // to glow — you cannot aim at what you cannot see. With the glow gone the
      // aiming goes too: touch the body anywhere, light blooms under your
      // finger, and the memory nearest that spot comes up. A tap that misses the
      // body entirely still lights a panel of the room, as it always did.
      const dir = touchDirAt(e.clientX, e.clientY);
      if (dir && memGraph && memGraph.nodes && memGraph.nodes.length && onMemTap) {
        touchAt(dir);
        const hit = memoryNearest(dir);
        if (hit >= 0) { selectMemory(hit); onMemTap(hit, memGraph.nodes[hit]); }
      } else if (dir) {
        // the body with no memories in it still answers the hand
        touchAt(dir);
        if (memSelected >= 0 && onMemTap) { selectMemory(-1); onMemTap(-1, null); }
      } else if (memSelected >= 0 && onMemTap) {
        // off the body while a memory is open means "put it down" — one gesture
        // with one meaning, and it does NOT also light a panel underneath
        selectMemory(-1); onMemTap(-1, null);
      } else tapPanel(e.clientX, e.clientY);
    }
  };
  // Release on window (not just the canvas) so a pointer-up anywhere ends the drag,
  // even if pointer capture wasn't granted. endDrag is idempotent.
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  // Spin the rig: ease out any fling on release, then resume the gentle idle spin.
  // The camera and room stay fixed, so the room is a stable, level backdrop.
  function updateTrackball() {
    if (dragging) return;
    if (Math.abs(velX) > 1e-5 || Math.abs(velY) > 1e-5) { spin(velX, velY); velX *= DAMP; velY *= DAMP; }
    if (resumeTimer > 0) resumeTimer--;
    if (idleEnabled && resumeTimer === 0 && idleTurn !== 0) spin(IDLE_SPEED * idleTurn, 0);
  }

  // --- Tap-to-light: tap a machined panel and it glows a random color ---------
  // A tap (pointer down+up, barely moved) raycasts into the room; the hit panel
  // is resolved from the integer grid (see fitCamera) and covered with an
  // additive quad that blooms in, holds, and fades. The grid counts live here;
  // fitCamera keeps them in sync with the texture repeats.
  const grid = { wallU: 8, wallV: 4, floor: 8, ceil: 4 };
  const lit = [];
  function killTile(t) { scene.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose(); }
  const raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const cellOf = (coord, min, size, count) => Math.min(count - 1, Math.max(0, Math.floor((coord - min) / size)));
  function tapPanel(cx, cy) {
    // Panels are a fact of the METAL room; every other world answers a tap in
    // its own language (environments.js: a meteor, bubbles, an aurora surge,
    // the evening walking on, a vein flare, a swelling dawn, an eruption).
    if (lastEnv !== 'room') { envs.tap(); return; }
    const rect = el.getBoundingClientRect();
    _ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    const hit = raycaster.intersectObject(room, false)[0];
    if (!hit || !hit.face) return;
    const n = hit.face.normal; // unit-axis outward normal (room is never rotated)
    if (n.z > 0.5) return;     // the front wall sits behind the camera
    const half = room.scale.x, H = ROOM_HALF_H, p = hit.point;
    let sizeU, sizeV, pos, rotX = 0, rotY = 0;
    if (Math.abs(n.y) > 0.5) { // floor / ceiling
      const count = n.y < 0 ? grid.floor : grid.ceil;
      sizeU = (half * 2) / count; sizeV = sizeU;
      const cu = cellOf(p.x, -half, sizeU, count), cv = cellOf(p.z, -half, sizeV, count);
      pos = [-half + (cu + 0.5) * sizeU, n.y < 0 ? -H + 0.02 : H - 0.02, -half + (cv + 0.5) * sizeV];
      rotX = n.y < 0 ? -Math.PI / 2 : Math.PI / 2;
    } else if (Math.abs(n.x) > 0.5) { // side walls
      sizeU = (half * 2) / grid.wallU; sizeV = (H * 2) / grid.wallV;
      const cu = cellOf(p.z, -half, sizeU, grid.wallU), cv = cellOf(p.y, -H, sizeV, grid.wallV);
      pos = [n.x < 0 ? -half + 0.02 : half - 0.02, -H + (cv + 0.5) * sizeV, -half + (cu + 0.5) * sizeU];
      rotY = n.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    } else { // back wall
      sizeU = (half * 2) / grid.wallU; sizeV = (H * 2) / grid.wallV;
      const cu = cellOf(p.x, -half, sizeU, grid.wallU), cv = cellOf(p.y, -H, sizeV, grid.wallV);
      pos = [-half + (cu + 0.5) * sizeU, -H + (cv + 0.5) * sizeV, -half + 0.02];
    }
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sizeU * 0.96, sizeV * 0.96),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.9, 0.62), // random hue, bright enough to bloom
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.x = rotX; m.rotation.y = rotY;
    scene.add(m);
    lit.push({ m, born: uniforms.uTime.value });
    if (lit.length > 40) killTile(lit.shift()); // bound the glow population
  }

  // One texel per memory, read by the vertex shader. 64x64 = 4,096 memories,
  // twice what journal.mjs will ever hold.
  const MEM_COLS = 64;
  const memData = new Uint8Array(MEM_COLS * MEM_COLS * 4);
  const memTex = new THREE.DataTexture(memData, MEM_COLS, MEM_COLS, THREE.RGBAFormat);
  memTex.minFilter = THREE.NearestFilter;
  memTex.magFilter = THREE.NearestFilter;
  memTex.needsUpdate = true;

  // Fibonacci sphere → even point distribution, no clustering at the poles.
  const positions = new Float32Array(COUNT * 3);
  const rand = new Float32Array(COUNT);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * rad;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * rad;

    rand[i] = Math.random();
  }
  // A RANDOM PERMUTATION, as a rank in 0..1. aRand is uniform but unordered, so
  // thresholding on it keeps ROUGHLY a fraction — fine at a half, useless at the
  // end that matters: at one-in-24000 it yields zero particles as often as one.
  // A rank is exact. aRank <= uKeep keeps precisely that many, still scattered
  // (the permutation is random, so the survivors are not a polar cap the way
  // index order would be — the sphere is fibonacci-ordered in y).
  //   Rank 0 is always <= any non-negative uKeep, so the field can be reduced to
  // EXACTLY ONE PARTICLE and never to none. That is the whole point of it.
  const order = Array.from({ length: COUNT }, (_, i) => i).sort((a, b) => rand[a] - rand[b]);
  const rankAttr = new Float32Array(COUNT);
  for (let r = 0; r < COUNT; r++) rankAttr[order[r]] = r / (COUNT - 1);
  // Per-node color buffer for paint mode (unused until uPaint=1); start white.
  const colorAttr = new Float32Array(COUNT * 3).fill(1);
  // THE MEMORY LAYER. A memory does not ADD a point to the orb — it CLAIMS a
  // mote that is already there and brightens it. `positions` is never touched:
  // applyPaint reads positions[i*3..2] as its anchor source, so writing to it
  // would quietly corrupt every painted palette.
  //   aMem  — which memory this mote belongs to, or -1 for the great majority
  //   aHalo — 1 at the claimed mote itself, falling off through its few
  //           neighbours, 0 everywhere else
  const memAttr = new Float32Array(COUNT).fill(-1);
  const haloAttr = new Float32Array(COUNT);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  geo.setAttribute('aRank', new THREE.BufferAttribute(rankAttr, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colorAttr, 3));
  geo.setAttribute('aMem', new THREE.BufferAttribute(memAttr, 1));
  geo.setAttribute('aHalo', new THREE.BufferAttribute(haloAttr, 1));
  // the pendulum's positions, rewritten every frame it is held — dynamic usage
  // tells the driver to expect exactly that
  const simAttr = new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3);
  simAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aSim', simAttr);

  const t0 = fullTarget('calm', 'stardust'); // boot in the resting state — no rainbow flash
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: t0.amp }, uFreq: { value: t0.freq }, uSpeed: { value: t0.speed },
    uSize: { value: t0.size }, uRadius: { value: t0.radius }, uAudio: { value: 0 }, uGlitch: { value: 0 },
    uPointK: { value: 10 },   // recomputed from the drawing buffer on every resize
    uHueBase: { value: t0.hueBase }, uHueRange: { value: t0.hueRange }, uHueFlow: { value: t0.hueFlow },
    uHueSweep: { value: t0.hueSweep }, uSat: { value: t0.sat }, uVal: { value: t0.val }, uCFreq: { value: t0.cFreq },
    uDotFade: { value: 1.0 }, uPlasma: { value: 0 }, uPaint: { value: 0 },

    uSpeckle: { value: t0.speckle },
    // THE FIELD ITSELF. Defaults are the body exactly as it has always been:
    // no collapse, every node alive, standing at the centre of its own room.

    uCondense: { value: 0 }, uKeep: { value: 1 }, uFlashPeriod: { value: 0 },
    uOffset: { value: new THREE.Vector3(0, 0, 0) },
    uPre: { value: 0 }, uInk: { value: 1 },   // the body's own pass: unchanged
    // The shape stack. uShapeTime runs off a SHARED wall clock, not uTime:
    // uTime accumulates clock.getDelta() per tab, so two people watching one
    // broadcast would sit at different phases of every sine in the stack.
    uShapeMix: { value: 0 }, uShapeId: { value: 0 }, uShapeA: { value: 0 }, uShapeC: { value: 0 }, uShapeD: { value: 0 }, uFlowAmp: { value: 0 }, uFlowSpeed: { value: 1 },
    uShapeB: { value: 0 }, uShapeTime: { value: 0 },
    uNoiseAmp: { value: 0 }, uNoiseFreq: { value: 1 },
    // The memory layer. uMemTex is a 64x64 byte texture, one texel per memory,
    // so selection later costs one texSubImage instead of a 24,000-float
    // attribute upload. NearestFilter because a texel is a record, not a colour.
    uMemOn: { value: 0 }, uMemCols: { value: MEM_COLS }, uMemPick: { value: -1 },
    // 900 is a cap a little under 5° across — a fingertip on the body, not a
    // continent. It is a constant because the bloom should be the same size
    // whether the orb is drawn large or small: it is a touch, not a spotlight.
    uTouch: { value: new THREE.Vector3(0, 0, 1) }, uTouchAmp: { value: 0 }, uTouchK: { value: 900 },
    uMemTex: { value: memTex },
    uOp: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uOpMask: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uPull: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    // Environment light on the dust. Normal-blended particles OCCLUDE what is
    // behind them, and their unlit side is dark — invisible against the metal
    // room, but against a bright sky the whole cloud read as a hard black
    // silhouette (the long-hunted "dark faceted disc"). Each world backlights
    // the dust in its own tone; the metal room stays exactly as tuned (zero).
    uEnvGlow: { value: new THREE.Color(0, 0, 0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });
  rig.add(new THREE.Points(geo, material));


  // ---- THE TRAIL ------------------------------------------------------------
  // IT IS NOT A COMPOSER PASS, and that is the whole design decision. `room` is
  // a BackSide box scaled around the camera, and in every other world `skydome`
  // replaces it — either one repaints 100% of the viewport, opaque, before a
  // single particle draws. A composer-level feedback buffer therefore
  // accumulates THE ROOM, and at never-fade it would lock the walls to the
  // brightest they have ever been, killing the breathing that orbLight drives
  // as the presence speaks. So the trail gets its own scene holding nothing but
  // the same geometry — the same pattern the old pick pass used, and for
  // exactly the same reason: nothing in it to mask a mote.
  //
  // IT ACCUMULATES WITH MAX, NOT PLUS. Additive diverges: a pixel taking 1.0 a
  // frame reaches the half-float ceiling in about eighteen minutes and then
  // becomes Inf, which the bloom's separable blur spreads as NaN across a whole
  // mip. MAX converges to the union of everywhere the body has BEEN, at the
  // brightness it was there — bounded by construction by the body's own peak
  // output. So "never fade" is not stable enough, it is exactly stable.
  const TRAIL_SCALE = 0.5;
  let trailA = null, trailB = null, trailOn = false, trailT = 1.0;
  const trailUniforms = Object.assign({}, uniforms, {
    // gl_PointSize is in DEVICE PIXELS and knows nothing about the target it
    // draws into: at half scale the same points would cover twice the world
    // area and the wake would read twice too fat under the upsample. uPointK is
    // exactly the points-per-pixel scale, so scaling it here is the correction.
    // resize() writes BOTH.
    uPointK: { value: uniforms.uPointK.value * TRAIL_SCALE },
    uPre: { value: 1 }, uInk: { value: 0.70 },
  });
  // Object.assign, NOT a hand-written uniform list. This file warns twice about
  // what a hand-written map costs — a uniform left out reaches the trail as zero
  // and the wake silently stops following the body. Assign copies every uniform
  // OBJECT by reference, so nothing can be forgotten.
  const trailMat = new THREE.ShaderMaterial({
    uniforms: trailUniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation, blendEquationAlpha: THREE.MaxEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  });
  const trailScene = new THREE.Scene();
  const trailRig = new THREE.Object3D();
  trailRig.matrixAutoUpdate = false;
  trailRig.add(new THREE.Points(geo, trailMat));
  trailScene.add(trailRig);

  // The fade. Half-float decays to true zero, so there is no epsilon and no
  // clamp: in 8-bit, v*damp rounds back to the same integer once the step falls
  // under half a level, which would leave a permanent ghost of every path ever
  // taken. From 1.0 at a one-second duration the value reaches the smallest half
  // denormal in 180 frames — a 1s trail is bit-exactly gone in three seconds.
  const fadeMat = new THREE.ShaderMaterial({
    uniforms: { tPrev: { value: null }, uDamp: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: 'precision highp float; uniform sampler2D tPrev; uniform float uDamp; varying vec2 vUv;'
      + ' void main(){ gl_FragColor = texture2D(tPrev, vUv) * uDamp; }',
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const fadeScene = new THREE.Scene();
  const fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));

  // The composite is a camera-facing quad INSIDE the scene, so it goes through
  // RenderPass and therefore blooms: an old position still glows while it is
  // above the threshold and then stops, which is the sparkler behaviour. A
  // ShaderPass would cost a full-screen read and write of the whole scene buffer
  // just to copy it through.
  const trailQuadMat = new THREE.ShaderMaterial({
    uniforms: { tTrail: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'precision highp float; uniform sampler2D tTrail; varying vec2 vUv;'
      + ' void main(){ gl_FragColor = vec4(texture2D(tTrail, vUv).rgb, 1.0); }',
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const trailQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trailQuadMat);
  // after the room, the tiles and the body (all 0), before the core (999).
  // Additive and depthTest false, so drawing it after the body is safe: light
  // only adds. Before the body, the normal-blended motes would punch the trail
  // out from behind them.
  trailQuad.renderOrder = 500;
  trailQuad.visible = false;
  trailQuad.frustumCulled = false;
  scene.add(trailQuad);

  function trailSize() {
    const pr = renderer.getPixelRatio();
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    return [Math.max(2, Math.round(v.x * TRAIL_SCALE)), Math.max(2, Math.round(v.y * TRAIL_SCALE)), pr];
  }
  function ensureTrail() {
    if (trailA) return;
    // ALLOCATED LAZILY. Most sessions never set a trail, and this is 2.8MB on a
    // phone and ~20MB on a desktop. Never disposed once made: churning a target
    // on a phone is worse than the megabytes.
    const [tw, th] = trailSize();
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    trailA = new THREE.WebGLRenderTarget(tw, th, opts);
    trailB = new THREE.WebGLRenderTarget(tw, th, opts);
  }
  function clearTrail() {
    if (!trailA) return;
    const c = renderer.getRenderTarget();
    for (const t of [trailA, trailB]) { renderer.setRenderTarget(t); renderer.clear(true, false, false); }
    renderer.setRenderTarget(c);
  }
  function stepTrail(dt) {
    // WALL-CLOCK, not per-frame. A fixed damp would make "one second" mean 1s at
    // 60Hz and 0.5s at 120Hz, and the moment the presence can NAME the duration
    // that becomes a promise the app cannot keep. T is the time to fall to 1/255
    // of peak: T = Infinity gives pow(x,0) = 1, which is never-fade, and the
    // caller turns the trail off entirely for "none". dt is the REAL delta, so a
    // tab backgrounded for a minute comes back with its trail gone.
    fadeMat.uniforms.uDamp.value = trailT === Infinity ? 1 : Math.pow(1 / 255, dt / trailT);
    fadeMat.uniforms.tPrev.value = trailA.texture;
    trailRig.matrix.copy(rig.matrixWorld);
    const ac = renderer.autoClear;
    renderer.setRenderTarget(trailB);
    renderer.autoClear = true;                 // discard the tile — free on a TBDR
    renderer.render(fadeScene, fadeCam);
    renderer.autoClear = false;
    renderer.render(trailScene, camera);       // the body alone, MAX-blended, on top
    renderer.autoClear = ac;
    renderer.setRenderTarget(null);
    const t = trailA; trailA = trailB; trailB = t;
    trailQuadMat.uniforms.tTrail.value = trailA.texture;
    // visible only once there is something to composite. Set in setTrail() it
    // would draw one frame against a null sampler before the first step ran.
    trailQuad.visible = true;
    // place it the way the wordmark's occluder is placed: a fixed distance in
    // front of the camera, facing it, sized to fill the frustum exactly there
    const D = 3.0;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    trailQuad.position.copy(camera.position).addScaledVector(fwd, D);
    trailQuad.quaternion.copy(camera.quaternion);
    const hh = 2 * Math.tan((camera.fov * Math.PI) / 360) * D;
    trailQuad.scale.set(hh * camera.aspect, hh, 1);
  }


  // Bloom gives the dots their glow/bleed, matching the reference renders.
  const composer = new EffectComposer(renderer);
  if (typeof window !== 'undefined' && window.__y3kScene) window.__y3kScene.composer = composer;
  composer.addPass(new RenderPass(scene, camera));
  // Threshold 0.35: now that the metal walls are lit/visible they sit just below it
  // and stay crisp, while the orb's crests, filaments, ribbons and core clear it and
  // still glow. (THE dial for orb-glow vs wall-crispness — lower = more orb halo but
  // walls start to haze; higher = crisper walls but less per-dot glow.) Strength/radius unchanged.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.35);
  composer.addPass(bloom);

  // Glowing core — a bright presence at the center that flares as Y3K speaks.
  const coreMat = new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(coreColorFor('aurora')),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.85,
  });
  const core = new THREE.Sprite(coreMat);
  core.scale.setScalar(0.6);
  core.renderOrder = 999; // draw on top of the dots so it always reads as a glowing center
  rig.add(core);

  // Constellation web — off by default; reuses the dots' uniform objects so the
  // lattice displaces in perfect sync with them.
  const lineGeo = new THREE.BufferGeometry();
  const conVerts = buildConstellation(800, 3);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(conVerts, 3));
  // A constant 1: LINE_VERT is shared with the memory edges, and an attribute a
  // geometry never supplies reads as zero, which would dim the whole lattice.
  lineGeo.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(conVerts.length / 3).fill(1), 1));
  const lineMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime, uAmp: uniforms.uAmp, uFreq: uniforms.uFreq,
      uSpeed: uniforms.uSpeed, uRadius: uniforms.uRadius, uAudio: uniforms.uAudio,
      uCondense: uniforms.uCondense, uOffset: uniforms.uOffset,
      // BY REFERENCE, every one of them: LINE_VERT keeps its own uniform map,
      // so any shape uniform left out here would silently never reach the web.
      uShapeMix: uniforms.uShapeMix, uShapeId: uniforms.uShapeId, uShapeA: uniforms.uShapeA,
      uShapeB: uniforms.uShapeB, uShapeTime: uniforms.uShapeTime,
      uNoiseAmp: uniforms.uNoiseAmp, uNoiseFreq: uniforms.uNoiseFreq,
      uShapeC: uniforms.uShapeC, uShapeD: uniforms.uShapeD, uFlowAmp: uniforms.uFlowAmp, uFlowSpeed: uniforms.uFlowSpeed,
      uOp: uniforms.uOp, uOpMask: uniforms.uOpMask, uPull: uniforms.uPull,
      uLineColor: { value: new THREE.Color(lineColorFor('aurora')) },
      uLineOpacity: { value: 0.62 },
    },
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.visible = false;
  rig.add(lines);

  // THE MEMORY EDGES — what links to what, drawn on the orb itself.
  //
  // A SEPARATE OBJECT FROM THE CONSTELLATION, deliberately. The web above is
  // decoration owned by FORM_MAP.web: a presence that dances into `web` turns it
  // on, and one that dances out turns it off. Hanging real memory structure on
  // that switch would mean the graph blinks in and out with a gesture, and that
  // the two could never be seen at once. They are different kinds of thing —
  // one is how the body is posed, the other is what the body is made of.
  //
  // AN ARC, NOT A CHORD. A straight segment between two points on the sphere
  // passes through the middle of it, and a few hundred of those read as a
  // wireframe cage suspended inside the orb rather than a map drawn on its
  // surface. Every edge is slerped into MEM_EDGE_SEG pieces whose endpoints are
  // unit vectors, so LINE_VERT pushes each one out to the displaced surface and
  // the link follows the skin between its two memories.
  const MEM_EDGE_SEG = 7;                  // arc pieces per edge
  const MEM_EDGE_MAX = 725;                // strongest links drawn; the rest are counted, not shown
  const MEM_EDGE_VERTS = MEM_EDGE_MAX * MEM_EDGE_SEG * 2;   // 10,150 — allocated once, never grown
  // ALPHA BY COUNT, for the same reason the halo is. Six links want to be seen;
  // seven hundred at the same opacity turn the orb into a ball of wire and stop
  // saying anything. This was very nearly shipped as a constant 0.5, which is
  // legible at neither end.
  const MEM_EDGE_ALPHA = (n) => Math.max(0.28, Math.min(1, 0.30 + 1.10 * (16 / (n + 16))));
  // AND THE FIELD STEPS BACK WHILE THEY ARE DRAWN. A 1px additive line over a
  // dense near-white mote field is invisible — measured, not guessed: at full
  // dot brightness the edges could not be told from their own absence in a
  // side-by-side. The constellation already solved this with uDotFade, and the
  // memory motes take their alpha from a max() rather than a multiply, so
  // fading the plain field leaves the NODES untouched and makes them read
  // harder. Both layers gain.
  const MEM_DOT_FADE = 0.45;
  const memEdgePos = new Float32Array(MEM_EDGE_VERTS * 3);
  const memEdgeW = new Float32Array(MEM_EDGE_VERTS);
  const memEdgeGeo = new THREE.BufferGeometry();
  memEdgeGeo.setAttribute('position', new THREE.BufferAttribute(memEdgePos, 3));
  memEdgeGeo.setAttribute('aW', new THREE.BufferAttribute(memEdgeW, 1));
  memEdgeGeo.setDrawRange(0, 0);
  const memLineMat = new THREE.ShaderMaterial({
    uniforms: {
      // by reference, for the same reason spelled out above the constellation's
      // map: a shape uniform left out here never reaches these lines, and the
      // edges would sit on a sphere the body had already left.
      uTime: uniforms.uTime, uAmp: uniforms.uAmp, uFreq: uniforms.uFreq,
      uSpeed: uniforms.uSpeed, uRadius: uniforms.uRadius, uAudio: uniforms.uAudio,
      uCondense: uniforms.uCondense, uOffset: uniforms.uOffset,
      uShapeMix: uniforms.uShapeMix, uShapeId: uniforms.uShapeId, uShapeA: uniforms.uShapeA,
      uShapeB: uniforms.uShapeB, uShapeTime: uniforms.uShapeTime,
      uNoiseAmp: uniforms.uNoiseAmp, uNoiseFreq: uniforms.uNoiseFreq,
      uShapeC: uniforms.uShapeC, uShapeD: uniforms.uShapeD, uFlowAmp: uniforms.uFlowAmp, uFlowSpeed: uniforms.uFlowSpeed,
      uOp: uniforms.uOp, uOpMask: uniforms.uOpMask, uPull: uniforms.uPull,
      // these two are this layer's OWN — the memory edges fade with uMemOn
      // rather than with the constellation's opacity.
      uLineColor: { value: new THREE.Color(lineColorFor('aurora')) },
      uLineOpacity: { value: 0 },
    },
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const memLines = new THREE.LineSegments(memEdgeGeo, memLineMat);
  memLines.visible = false;
  rig.add(memLines);

  // Pull the camera back so the whole sphere fits whichever FOV axis is tighter
  // (portrait phones are limited by horizontal FOV). setLength keeps the current
  // orbit direction, so this is safe to call on every resize.
  function fitCamera() {
    const R = 1.6; // sphere radius + max displacement + a little margin
    if (!camera.aspect || !isFinite(camera.aspect)) return; // not laid out yet
    const vHalf = (camera.fov * Math.PI) / 180 / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const limit = Math.min(vHalf, hHalf);
    if (!(limit > 1e-4)) return;
    const dist = (R / Math.sin(limit)) * 1.06;
    // setLength can't recover a NaN/zero vector — reset to a clean direction first.
    if (!isFinite(camera.position.lengthSq()) || camera.position.lengthSq() < 1e-6) camera.position.set(0, 0, dist);
    else camera.position.setLength(dist);
    // Keep the room enclosing the camera at every aspect: width/depth at 1.5× the
    // camera distance (portrait pushes the camera far out), height FIXED so the
    // floor and ceiling stay in frame. Texture repeats track the wall size so the
    // machined panels stay ~1.4 world units whatever the device.
    const half = dist * 1.5;
    room.scale.set(half, ROOM_HALF_H, half);
    edges.scale.copy(room.scale); // must track the non-uniform scale
    // INTEGER tile repeats: the panel grid exactly tiles each face, so panel
    // boundaries sit at uniform multiples from the face corners — which is what
    // lets tap-to-light resolve the exact panel a tap landed in (see tapPanel).
    const wallTilesU = Math.max(1, Math.round((half * 2) / PANEL_TILE));
    const wallTilesV = Math.max(1, Math.round((ROOM_HALF_H * 2) / PANEL_TILE));
    const ceilTiles = Math.max(1, Math.round((half * 2) / (PANEL_TILE * 1.5)));
    wallMat.map.repeat.set(wallTilesU, wallTilesV);
    wallMat.roughnessMap.repeat.set((half * 2) / 1.8, 1);
    floorMat.map.repeat.set(wallTilesU, wallTilesU);
    // floorMat.roughnessMap stays at repeat (1,1): lathe rings centered under the orb.
    ceilMat.map.repeat.set(ceilTiles, ceilTiles);
    // Panels per face span (4 panels per texture tile), for the tap raycaster.
    grid.wallU = wallTilesU * 4; grid.wallV = wallTilesV * 4;
    grid.floor = wallTilesU * 4; grid.ceil = ceilTiles * 4;
    while (lit.length) killTile(lit.pop()); // grid moved — stale highlights would misalign
    orbLight.distance = dist * 3; // keep the orb's glow reaching the (now-scaled) walls
  }

  function resize() {
    // Fall back to sane dims — a 0×0 read at load would make aspect NaN and
    // permanently poison the camera position.
    const w = container.clientWidth || window.innerWidth || 800;
    const h = container.clientHeight || window.innerHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    renderer.setSize(w, h);
    // Points are sized in device pixels, so their scale has to track the drawing
    // buffer. Calibrated against 1600 device px tall (an ~800px window at dpr 2),
    // which is where the orb's current density was tuned — at that size this is
    // exactly the 10.0 it replaces, and it falls away proportionally as the
    // window shrinks so the sphere never crowds into a white blob.
    const bufH = renderer.getDrawingBufferSize(new THREE.Vector2()).y || (h * renderer.getPixelRatio());
    uniforms.uPointK.value = 10 * (bufH / 1600);

    composer.setSize(w, h);
    if (trailA) {
      const [tw, th] = trailSize();
      trailA.setSize(tw, th); trailB.setSize(tw, th);
      clearTrail();                    // a resized buffer holds a STRETCHED past
    }
    trailUniforms.uPointK.value = uniforms.uPointK.value * TRAIL_SCALE;
    // Bloom is a BLUR. Running its five mip levels at full resolution buys
    // nothing you can see, and on a phone it is the most expensive thing on
    // screen after the particles themselves.
    if (COARSE) bloom.setSize(Math.max(2, w * 0.5), Math.max(2, h * 0.5));
  }
  // A phone fires resize constantly as the address bar slides in and out, and
  // every one of those reallocates the composer's render targets — which is
  // felt as a stutter, not as a resize. Ignore the noise: only a real change
  // in width (or a big change in height) is a real resize.
  let lastW = 0, lastH = 0, resizeTimer = 0;
  function resizeMaybe() {
    const w = container.clientWidth || window.innerWidth || 800;
    const h = container.clientHeight || window.innerHeight || 600;
    if (w === lastW && Math.abs(h - lastH) < 90) return;   // browser chrome sliding
    lastW = w; lastH = h;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 90);
  }
  window.addEventListener('resize', resizeMaybe);
  // Re-fit when the container gets its real size (flex/CSS can settle after init).
  if (window.ResizeObserver) new ResizeObserver(resizeMaybe).observe(container);
  resize();


  // Targets the uniforms ease toward. setMood/setScheme retarget; loop interpolates.
  // THE WORN BODY lives here too — beside the targets, written by every setter,
  // so there is exactly one place it can be recorded and no way for it to drift
  // from what is on screen. Before this, form kept no name at all and paint
  // dropped its anchors; api.worn() is what makes the body reportable at all.
  let currentMoodName = 'calm';
  let currentSchemeKey = 'aurora';
  let currentFormName = 'orb';
  let currentShape = null;      // the spec as written, or null when the field is home
  let paintCount = 0;           // anchors currently worn; 0 = a named palette

  let morphName = 'settle';
  let morphK = MORPH.settle;    // [eased-keys rate, plasma rate]
  // Where the field is going. The uniforms ease toward these in the loop, on the
  // morph's own rate, so the field arrives the way everything else does.
  let fieldKeepN = COUNT;
  const fieldTarget = { condense: 0, keep: 1, off: new THREE.Vector3(0, 0, 0) };
  let target = fullTarget(currentMoodName, currentSchemeKey);
  let audioLevel = 0;        // 0..1 live mic/voice energy
  let audioTarget = 0;
  let speakingBoost = 0;     // extra energy layered on while talking
  let plasmaTarget = 0;      // 0/1 — eased so ribbons fade in/out smoothly
  // Declared HERE, beside the other eased state, and not down beside the api
  // that sets it: frame() is running long before that line is reached, so a
  // `let` further down sits in the temporal dead zone and every frame throws
  // before it can draw. (Found by loading the page, not by reading it.)
  // --- THE MEMORY LAYER ------------------------------------------------------
  // Assigning ~24,000 motes to N memories is a real amount of arithmetic, and
  // it happens while a 60 fps WebGL loop is running. So it is CHUNKED off the
  // existing frame loop in short slices with a cursor.
  //
  // Not requestIdleCallback: a page already running a rAF loop never yields a
  // meaningful idle deadline, the call appears nowhere else in this codebase,
  // and it is missing from older iOS WKWebView — which matters, because this
  // ships to the App Store.
  let memGraph = null;          // { nodes: [{dir}], ... }
  let memOnTarget = 0;
  let memEdgesOn = true;        // the links are the point; a caller can still mute them
  let onMemTap = null;          // set by the app: a memory was tapped, go read it
  // TWO THINGS WANT THE DOTS FADED — the dance's web form and the memory edges.
  // Each used to write the uniform directly, which means whichever ran last
  // wins and turning off one silently restores full brightness under the other.
  // The frame resolves them instead, and the darker wish carries.
  let dotFadeForm = 1.0;
  let memEdgeEase = 0;
  let memJob = null;            // the in-progress claim, if any
  const MEM_SLICE_MS = 4;

  // HALO BY COUNT, NOT BY RADIUS. A fixed angular radius looks right at twelve
  // memories and is a lie by two hundred: 0.35 rad covers 728 motes each, so
  // the haloed share runs from a third of the orb to ALL of it, and growth
  // stops being visible exactly when a presence starts having a lot to show.
  // A per-node budget keeps the proportion honest at every size.
  const haloBudget = (n) => Math.max(6, Math.min(60, Math.round(COUNT / (n + 40))));

  // Lay the edges out. Synchronous and cheap — a few hundred slerps — where the
  // mote claim is chunked because it is COUNT dot products per memory.
  let memEdgeCount = 0;      // edges actually drawn
  let memEdgeTotal = 0;      // edges the graph found, which may be more
  function buildMemEdges(graph) {
    const nodes = (graph && graph.nodes) || [];
    const all = (graph && graph.edges) || [];
    memEdgeTotal = all.length;
    memEdgeCount = 0;
    memEdgeGeo.setDrawRange(0, 0);
    if (!nodes.length || !all.length) return;
    // STRONGEST FIRST, and the cap is reported rather than swallowed: a presence
    // past a few hundred memories has more links than are worth drawing, and
    // quietly dropping the tail would read as a graph that had stopped growing.
    const kept = all.slice().sort((a, b) => b[2] - a[2]).slice(0, MEM_EDGE_MAX);
    let v = 0;
    for (const [i, j, w] of kept) {
      const a = nodes[i] && nodes[i].dir, b = nodes[j] && nodes[j].dir;
      if (!a || !b) continue;
      const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const th = Math.acos(d), sn = Math.sin(th);
      // EVERY POINT ON THIS ARC MUST BE A UNIT VECTOR. LINE_VERT's first line is
      // normalize(position), so a vertex near the origin normalises to garbage
      // and a vertex AT it is a division by zero — the edge draws as a spike
      // through the middle of the orb, or vanishes. Interpolating straight
      // between two directions does exactly that when they are opposite: the
      // midpoint of the segment from (0,1,0) to (0,-1,0) is the centre.
      let mid = null;
      if (sn < 1e-6 && d < 0) {
        // Opposite points: every great circle through them is equally valid, so
        // take one — through whichever axis this direction leans on least.
        const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const c = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]];
        const L = Math.hypot(c[0], c[1], c[2]) || 1;
        mid = [c[0] / L, c[1] / L, c[2] / L];
      }
      const pt = (t) => {
        if (mid) { const u = Math.PI * t, cu = Math.cos(u), su = Math.sin(u);
          return [a[0] * cu + mid[0] * su, a[1] * cu + mid[1] * su, a[2] * cu + mid[2] * su]; }
        if (sn < 1e-6) return [a[0], a[1], a[2]];   // the same point twice
        const c0 = Math.sin((1 - t) * th) / sn, c1 = Math.sin(t * th) / sn;
        return [a[0] * c0 + b[0] * c1, a[1] * c0 + b[1] * c1, a[2] * c0 + b[2] * c1];
      };
      // THE COSINE ITSELF, not a rank within this graph. Normalising against the
      // strongest link present would make a set of uniformly strong links grow a
      // fake weak end, and would change every edge's brightness whenever one new
      // memory arrived — the same sin the positions are built to avoid.
      const aw = Math.max(0, Math.min(1, w));
      let prev = pt(0);
      for (let sIdx = 1; sIdx <= MEM_EDGE_SEG; sIdx++) {
        const next = pt(sIdx / MEM_EDGE_SEG);
        memEdgePos[v * 3] = prev[0]; memEdgePos[v * 3 + 1] = prev[1]; memEdgePos[v * 3 + 2] = prev[2];
        memEdgeW[v] = aw; v += 1;
        memEdgePos[v * 3] = next[0]; memEdgePos[v * 3 + 1] = next[1]; memEdgePos[v * 3 + 2] = next[2];
        memEdgeW[v] = aw; v += 1;
        prev = next;
      }
      memEdgeCount += 1;
    }
    memEdgeGeo.attributes.position.needsUpdate = true;
    memEdgeGeo.attributes.aW.needsUpdate = true;
    memEdgeGeo.setDrawRange(0, v);
  }

  function startMemJob(graph) {
    const nodes = (graph && graph.nodes) || [];
    memGraph = graph;
    memSelected = -1;        // indices belong to the graph that made them
    buildMemEdges(graph);
    memAttr.fill(-1);
    haloAttr.fill(0);
    memData.fill(0);
    if (!nodes.length) {
      geo.attributes.aMem.needsUpdate = true;
      geo.attributes.aHalo.needsUpdate = true;
      memTex.needsUpdate = true;
      memJob = null;
      return;
    }
    const k = haloBudget(nodes.length);
    memJob = { nodes, i: 0, k, taken: new Set() };
  }

  // One slice of the claim. For each memory in turn: find the nearest unclaimed
  // mote to its direction, then the k next nearest for its halo.
  function stepMemJob() {
    if (!memJob) return;
    const t0 = performance.now();
    const { nodes, k, taken } = memJob;
    while (memJob.i < nodes.length) {
      if (performance.now() - t0 > MEM_SLICE_MS) return;    // hand the frame back
      const d = nodes[memJob.i].dir;
      if (!d) { memJob.i += 1; continue; }
      // one pass over the motes, keeping the k+1 best by dot product. k is at
      // most 60, so an insertion into a short sorted list beats a full sort.
      const best = [];
      for (let m = 0; m < COUNT; m++) {
        const dot = positions[m * 3] * d[0] + positions[m * 3 + 1] * d[1] + positions[m * 3 + 2] * d[2];
        if (best.length < k + 1) { best.push([m, dot]); if (best.length === k + 1) best.sort((a, b) => b[1] - a[1]); continue; }
        if (dot <= best[best.length - 1][1]) continue;
        let at = best.length - 1;
        while (at > 0 && best[at - 1][1] < dot) { best[at] = best[at - 1]; at -= 1; }
        best[at] = [m, dot];
      }
      // the node itself is the nearest mote nobody has claimed yet
      let node = -1;
      for (const [m] of best) { if (!taken.has(m)) { node = m; break; } }
      if (node < 0) node = best[0][0];
      taken.add(node);
      memAttr[node] = memJob.i;
      haloAttr[node] = 1;
      let rank = 0;
      for (const [m] of best) {
        if (m === node) continue;
        rank += 1;
        // fall off through the neighbours so a node reads as a point with a
        // glow, not as a disc with a hard edge
        const w = 0.55 * (1 - rank / (k + 1)) ** 1.6;
        if (w > haloAttr[m]) { haloAttr[m] = w; if (memAttr[m] < 0) memAttr[m] = memJob.i; }
      }
      // the per-memory state texel: 170 is "at rest", which the shader decodes
      // back to 1.0. Selection later writes a higher byte without touching an
      // attribute at all.
      memData[memJob.i * 4 + 2] = 170;
      memJob.i += 1;
    }
    geo.attributes.aMem.needsUpdate = true;
    geo.attributes.aHalo.needsUpdate = true;
    memTex.needsUpdate = true;
    memJob = null;
  }

  // WHERE A TAP LANDS ON THE BODY, and which memory is nearest it.
  //
  // This used to be a GPU pick pass: a second scene, a render target, and a
  // 15x15 offscreen render on every tap, so the CPU could ask the shader where
  // a mote had ended up. That was the right answer while a memory was a bright
  // cluster you aimed at — you had to know which one the finger was ON. It is
  // the wrong answer now that the memories do not announce themselves: a tap
  // lands on the BODY, and the memory that comes up is simply the nearest one.
  //   A memory is a unit direction (memGraph.nodes[i].dir) and so is the point
  // the ray strikes, so "nearest" is one dot product — exact, free, and true of
  // whatever form the body is wearing, because the sphere is the space every
  // form is written in.
  const _touchV = new THREE.Vector3(), _touchC = new THREE.Vector3(), _touchS = new THREE.Sphere();
  function touchDirAt(clientX, clientY) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    rig.getWorldPosition(_touchC);
    _touchS.set(_touchC, Math.max(0.05, uniforms.uRadius.value));
    // a tap that misses the body is not a touch of it
    if (!raycaster.ray.intersectSphere(_touchS, _touchV)) return null;
    rig.worldToLocal(_touchV);
    return _touchV.lengthSq() > 1e-9 ? _touchV.normalize().clone() : null;
  }
  function memoryNearest(dir) {
    const nodes = (memGraph && memGraph.nodes) || [];
    if (!nodes.length || !dir) return -1;
    let best = -1, bestDot = -2;
    for (let i = 0; i < nodes.length; i++) {
      const d = nodes[i] && nodes[i].dir;
      if (!d) continue;
      const dot = dir.x * d[0] + dir.y * d[1] + dir.z * d[2];
      if (dot > bestDot) { bestDot = dot; best = i; }
    }
    return best;
  }


  // The chosen memory burns brighter — written into the per-memory texel the
  // claim pass left at rest, exactly as it was built to allow: no attribute is
  // touched, no geometry is rebuilt, and the whole halo lifts with its node.
  let memSelected = -1;
  function selectMemory(i) {
    const n = (memGraph && memGraph.nodes) || [];
    if (memSelected >= 0 && memSelected < n.length) memData[memSelected * 4 + 2] = 170;
    memSelected = (i >= 0 && i < n.length) ? i : -1;
    if (memSelected >= 0) memData[memSelected * 4 + 2] = 255;
    else uniforms.uTouchAmp.value = 0;      // put it down and the light goes with it
    memTex.needsUpdate = true;
    uniforms.uMemPick.value = memSelected;
    return memSelected;
  }

  // THE BLOOM'S LIFE. Full at the touch, then a slow ease out — long enough to
  // read the memory it surfaced, short enough that the body is calm again by the
  // time you look away. Wall-clock, like every other ease in this frame.
  function touchAt(dir) {
    uniforms.uTouch.value.copy(dir);
    uniforms.uTouchAmp.value = 1;
  }

  let shapeMixTarget = 0;
  // --- BEATS: the transient layer ---------------------------------------------
  // Everything above this line is a STATE the body holds. A beat is the other
  // kind of thing: a transient the field makes at one moment in the speech and
  // then lets go of, fired by a ~mark~ inline in the words as they arrive.
  //
  // It rides ON TOP of the eased state and never becomes part of it. That is
  // the whole discipline here — the ease loop below subtracts the live offset
  // before easing and adds it back after, so however many beats land, the body
  // is still easing toward exactly the mood it was told to hold, and when the
  // last one dies the field is bit-for-bit where it would have been.
  //
  // Two constants make an attack-release envelope with no phase state at all:
  // `peak` collapses toward zero on the slow rate while `off` chases it on the
  // fast one, so the offset rises in ~50ms and falls over ~1.1s. A beat is a
  // transient, but this file holds that a posture arrives and never snaps, and
  // an instant jump in amplitude is a pop rather than a gesture.
  const beatOff = {};        // what is actually added to the uniforms right now
  const beatPeak = {};       // what it is chasing — always on its way to zero
  const BEAT_ATTACK = 0.35;  // per 60Hz frame: ~50ms to the peak
  const BEAT_RELEASE = 0.045;// per 60Hz frame: ~1.1s back to nothing
  function beat(name, n) {
    const b = BEATS[String(name || '').toLowerCase()];
    if (!b) return false;
    // 0-9 around a nominal 5, the same scale every shape argument uses. A beat
    // written as 0 is silence, and is honoured as silence.
    const g = Math.max(0, Math.min(9, n == null ? 5 : +n)) / 5;
    if (!g) return true;
    // Beats ACCUMULATE: three flares in a sentence build, they do not reset to
    // one flare. Bounded so a reply full of them cannot drive the field past
    // what a mood could have asked for on its own.
    for (const key of Object.keys(b)) {
      beatPeak[key] = Math.max(-1.6, Math.min(1.6, (beatPeak[key] || 0) + b[key] * g));
    }
    return true;
  }

  let onceTimer = null;      // the `once` envelope: a gesture lets go by itself
  // THE SWARM. Alive only while the pendulum is the held form; a new release
  // every time it is asked for, because t = 0 is the whole point of asking.
  // Declared HERE and not beside SHAPE_UNITS where it is assigned: frame()
  // below reads it, and the loop is kicked off before the assignment site is
  // reached — a `let` further down is a temporal dead zone, createBody throws,
  // and Y3K never exists. Fourth time this shape has bitten in one session.
  let swarm = null;
  const shapeT0 = Date.now();

  const clock = new THREE.Clock();
  let envLast = 0;   // environments run on their own elapsed clock (drifting dust, aurora)

  function frame() {
    requestAnimationFrame(frame);
    // ONE getDelta() PER FRAME — it resets the timer on read, so a second call
    // returns ~0. Capture it once and spend it on both the clock and the eases.
    const dt = clock.getDelta();
    uniforms.uTime.value += dt;

    // THE PACE IS WALL-CLOCK, NOT PER-FRAME. Every ease here was authored as a
    // per-frame constant at 60Hz, which means it ran at DOUBLE speed on a 120Hz
    // display — pre-existing, and harmless while the rate was anonymous. It
    // stops being harmless the moment the presence can NAME the pace: "drift"
    // that means 2.0s on one machine and 1.0s on another is a promise the app
    // cannot keep, and the prompt would be telling it something untrue.
    //   1 - (1-k)^n is the exact n-fold application of a lerp, so at exactly
    //   60fps dtN is 1 and this is identical to the old constant to
    //   floating-point — the shipped feel is preserved, not approximated.
    //   The clamp bounds a tab returning from the background to six frames of
    //   catch-up instead of snapping the whole body home in a single one.
    const dtN = Math.min(dt, 0.1) * 60;
    const k = 1 - Math.pow(1 - morphK[0], dtN);   // the presence's chosen pace — see MORPH
    const kAtk = 1 - Math.pow(1 - BEAT_ATTACK, dtN);
    const kRel = 1 - Math.pow(1 - BEAT_RELEASE, dtN);
    for (const key of EASE_KEYS) {
      const u = uniforms['u' + key[0].toUpperCase() + key.slice(1)];
      if (!u) continue;
      const off = beatOff[key] || 0;
      // SUBTRACT FIRST. Easing a value a beat is riding on would fold the
      // transient into the state, and the body would keep every beat it ever
      // made forever — brighter and brighter, with nothing able to take it back.
      let v = lerp(u.value - off, target[key] ?? 0, k);
      // HUE IS AN ANGLE. Every other key is a magnitude and a straight lerp is
      // right; hueBase lives on a wheel, and a straight lerp from ember (0.02)
      // to dusk (0.92) takes the long way round through yellow, green and
      // cyan. Nobody noticed while a change was a single settle; a score makes
      // the crossing itself the thing on screen. Go the short way — the
      // difference folded into [-0.5, 0.5] — and keep the value on the wheel
      // (the shader fracts it anyway, but a value that grows without bound is
      // a float-precision problem waiting a week).
      if (key === 'hueBase') {
        const cur = u.value - off, tgt = target[key] ?? 0;
        let d = tgt - cur; d -= Math.round(d);
        v = cur + d * k; v -= Math.floor(v);
      }
      if (off || beatPeak[key]) {
        const peak = lerp(beatPeak[key] || 0, 0, kRel);
        const now = lerp(off, peak, kAtk);
        // let a spent beat go completely rather than leaving a millionth behind
        beatPeak[key] = Math.abs(peak) < 1e-4 ? 0 : peak;
        beatOff[key] = Math.abs(now) < 1e-4 ? 0 : now;
        v += beatOff[key];
      }
      u.value = v;
    }

    // THE THREE THAT WERE LEFT BEHIND when the eases above went wall-clock:
    // the mic level and the memory layer's two fades were still per-frame
    // constants, so a voice's energy and the memory constellation's arrival ran
    // at double speed on a 120Hz display. Same form as k above — identical to
    // the old constant at exactly 60fps, the shipped feel preserved.
    const kAudio = 1 - Math.pow(1 - 0.2, dtN);
    const kMem = 1 - Math.pow(1 - 0.06, dtN);
    audioLevel = lerp(audioLevel, audioTarget, kAudio);
    uniforms.uAudio.value = Math.min(audioLevel + speakingBoost, 1.4);
    envs.tick(clock.getElapsedTime() - envLast, clock.getElapsedTime());
    envLast = clock.getElapsedTime();



    uniforms.uPlasma.value = lerp(uniforms.uPlasma.value, plasmaTarget, 1 - Math.pow(1 - morphK[1], dtN));
    // The field eases on the same k as the mood keys — one pace for the whole body.
    uniforms.uCondense.value = lerp(uniforms.uCondense.value, fieldTarget.condense, k);
    uniforms.uKeep.value = lerp(uniforms.uKeep.value, fieldTarget.keep, k);
    uniforms.uOffset.value.lerp(fieldTarget.off, k);
    // A posture ARRIVES; it never snaps. Same k as every mood key above.
    uniforms.uShapeMix.value = lerp(uniforms.uShapeMix.value, shapeMixTarget, k);
    // the one form with a clock of its own: integrate, then hand the shader
    // this frame's positions
    if (swarm) { swarm.step(dt); swarm.write(simAttr.array); simAttr.needsUpdate = true; }
    uniforms.uShapeTime.value = (Date.now() - shapeT0) / 1000;
    if (memJob) stepMemJob();                       // ≤4 ms, then the frame goes on
    // the touch fades on its own; a memory put down takes its light with it
    if (uniforms.uTouchAmp.value > 0.0005) {
      const kTouch = 1 - Math.pow(1 - 0.018, dtN);
      uniforms.uTouchAmp.value = lerp(uniforms.uTouchAmp.value, memSelected >= 0 ? 0.55 : 0, kTouch);
    }
    uniforms.uMemOn.value = lerp(uniforms.uMemOn.value, memOnTarget, kMem);
    // The edges ride the same ease as the nodes, through their own opacity
    // rather than a uniform, so LINE_FRAG stays shared with the constellation.
    // memEdgeEase is the toggle's own ease and nothing else — folding uMemOn
    // into the STATE makes it a feedback term that settles well short of 1.
    memEdgeEase = lerp(memEdgeEase, memEdgesOn && memEdgeCount > 0 ? 1 : 0, kMem);   // the edges ride the nodes' pace
    const edgeShow = memEdgeEase * uniforms.uMemOn.value;
    memLineMat.uniforms.uLineOpacity.value = MEM_EDGE_ALPHA(memEdgeCount) * edgeShow;
    memLines.visible = edgeShow > 0.01;
    uniforms.uDotFade.value = Math.min(dotFadeForm, 1 - (1 - MEM_DOT_FADE) * edgeShow);
    orbLight.intensity = 4.0 + uniforms.uAudio.value * 4.0; // the room breathes as Y3K speaks

    // Tapped panels: bloom in fast, hold, breathe softly, fade out (~5s life).
    for (let i = lit.length - 1; i >= 0; i--) {
      const age = uniforms.uTime.value - lit[i].born;
      const env = age < 0.18 ? age / 0.18 : age < 2.2 ? 1 : 1 - (age - 2.2) / 3;
      if (env <= 0) { killTile(lit[i]); lit.splice(i, 1); continue; }
      lit[i].m.material.opacity = env * 0.85 * (0.92 + 0.08 * Math.sin(uniforms.uTime.value * 3 + lit[i].born));
    }

    if (core.visible) {
      const a = uniforms.uAudio.value;
      core.scale.setScalar((0.5 + a * 0.7) * (0.95 + 0.05 * Math.sin(uniforms.uTime.value * 1.6)));
      coreMat.opacity = 0.7 + a * 0.3;
    }

    updateTrackball();
    brandLayer.before();
    composer.render();

    brandLayer.after();
    // END of the frame, deliberately. rig.matrixWorld is only recomputed inside
    // renderer.render(), so copying it earlier would hand the trail a one-frame
    // stale orientation — the trap the old pick rig avoided the same way, by running after a
    // render. And the composite reads LAST frame's buffer, so the live head is
    // never drawn on top of itself. One frame of lag, which is 16.7ms.
    if (trailOn) stepTrail(dt);
  }

  // THE NAME IN THE ROOM. When the top bar is folded the wordmark floats above
  // the orb — and the orb has to be able to pass IN FRONT of it, which no DOM
  // layering can give (the orb lives in this canvas, under everything). So in
  // that state the DOM mark goes invisible and the room draws it, in two
  // halves. Inside the scene: a BLACK plane carrying the mark's silhouette
  // (alphaTest on the same canvas the mercury shader paints). It draws first
  // and writes depth, so the walls and the sky behind it are culled; being
  // black it never feeds the bloom. After the composer: the mark's real chrome,
  // added on top from that same canvas. Inside the silhouette the scene holds
  // only the orb's light in front of the mark (the room was occluded away), so
  // chrome + scene is the mark behind the orb, exactly — the orb's particles
  // ignore depth and always draw over it, its glow spills onto it as light
  // should, and the mark itself is never bloomed. The DOM mark stays for the
  // hand (spin, hover): only its pixels move house.
  const brandLayer = (() => {
    const brandEl = document.getElementById('home-brand');
    let cv = null, tex = null, on = false;
    const occMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide });
    const occ = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), occMat);
    occ.renderOrder = -1; occ.visible = false; occ.frustumCulled = false;
    scene.add(occ);
    const oScene = new THREE.Scene();
    const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
    quad.frustumCulled = false;
    oScene.add(quad);
    // 2.4 units in front of the camera: nearer than any room surface along the
    // mark's rays at every aspect (portrait pushes the camera far back, and a
    // plane at the origin would then sit behind the ceiling), and the orb does
    // not care — its points ignore depth and draw over whatever is there.
    const DEPTH = 2.4;
    const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const inRoom = () => {
      if (!brandEl || !document.body.classList.contains('in-home')) return false;
      const holeT = parseFloat(getComputedStyle(document.body).getPropertyValue('--hole-t'));
      if (!(holeT <= 10.5)) return false;                       // only once the bar is fully folded
      // …and once the mark has ARRIVED below the grip: while it is still
      // sliding out of the bar it stays in the DOM, above the moving glass
      if (brandEl.getBoundingClientRect().top < holeT + 40) return false;
      return parseFloat(getComputedStyle(brandEl).opacity) >= 0.85;
    };
    function before() {
      const want = inRoom();
      if (want !== on) { on = want; document.body.classList.toggle('brand-in-room', on); }
      occ.visible = on;
      if (!on) return;
      if (!cv) {
        cv = brandEl.querySelector('canvas.mercury-blob');
        if (!cv) { occ.visible = false; on = false; document.body.classList.remove('brand-in-room'); return; }
        tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        occMat.map = tex; quadMat.map = tex; occMat.needsUpdate = quadMat.needsUpdate = true;
      }
      tex.needsUpdate = true;
      const r = cv.getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      const ndc = { x: ((r.left + r.width / 2) / W) * 2 - 1, y: 1 - ((r.top + r.height / 2) / H) * 2, w: (r.width / W) * 2, h: (r.height / H) * 2 };
      const t = Math.tan((camera.fov * Math.PI) / 360);
      camera.getWorldDirection(fwd);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      occ.position.copy(camera.position).addScaledVector(fwd, DEPTH)
        .addScaledVector(right, ndc.x * t * camera.aspect * DEPTH)
        .addScaledVector(up, ndc.y * t * DEPTH);
      occ.quaternion.copy(camera.quaternion);
      occ.scale.set(ndc.w * t * camera.aspect * DEPTH, ndc.h * t * DEPTH, 1);
      quad.position.set(ndc.x, ndc.y, 0);
      quad.scale.set(ndc.w / 2, ndc.h / 2, 1);
      quadMat.opacity = parseFloat(getComputedStyle(brandEl).opacity) || 0.9;
    }
    function after() {
      if (!on || !tex) return;
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.render(oScene, oCam);
      renderer.autoClear = ac;
    }
    return { before, after };
  })();
  frame();

  // The backdrop is the metal room itself — there is no visitor-set background
  // color any more. The clear color set at init (a fixed dark) only ever shows
  // through the seams behind the enclosing cube, which the camera never sees.

  // --- Paint mode: every node takes its color from Y3K's color anchors --------
  // Each node blends the anchors by angular distance (Shepard weighting), so a
  // handful of placed colors paint the whole 24k-node field.
  let hasPainted = false;
  function applyPaint(anchors) {
    if (!anchors || !anchors.length) return;
    for (let i = 0; i < COUNT; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      let r = 0, g = 0, b = 0, wsum = 0;
      for (const a of anchors) {
        let d = x * a.dir[0] + y * a.dir[1] + z * a.dir[2];
        d = d > 1 ? 1 : d < -1 ? -1 : d;
        const ang = Math.acos(d);
        // Sharp Gaussian falloff so the nearest anchor dominates → distinct
        // colored regions with smooth seams (not a washed-out average). The tiny
        // floor keeps wsum > 0 everywhere.
        const w = Math.exp(-4.0 * ang * ang) + 1e-4;
        r += a.rgb[0] * w; g += a.rgb[1] * w; b += a.rgb[2] * w; wsum += w;
      }
      colorAttr[i * 3] = r / wsum; colorAttr[i * 3 + 1] = g / wsum; colorAttr[i * 3 + 2] = b / wsum;
    }
    geo.attributes.aColor.needsUpdate = true;
    uniforms.uPaint.value = 1;
    hasPainted = true;
  }
  // A soft spectrum wrapped around the body — shown until Y3K paints its own.
  const DEFAULT_PAINT = [
    { dir: [0, 1, 0], rgb: [1.0, 0.85, 0.35] },  { dir: [1, 0, 0], rgb: [1.0, 0.38, 0.62] },
    { dir: [0, 0, 1], rgb: [0.55, 0.32, 1.0] },  { dir: [-1, 0, 0], rgb: [0.25, 0.8, 1.0] },
    { dir: [0, 0, -1], rgb: [0.35, 1.0, 0.6] },  { dir: [0, -1, 0], rgb: [1.0, 0.55, 0.25] },
  ];

  // A presence writes one digit; each form reads it as its own quantity. Doing
  // the mapping here rather than in GLSL keeps the shader honest about units
  // and means a 0 (the digit you get when the model omits an argument) becomes
  // a sensible form rather than a degenerate one.
  const SHAPE_ID = { sphere: 0, shell: 1, ring: 2, disc: 3, helix: 4, lattice: 5, spiral: 6, cube: 7, ellipsoid: 8, super: 9, hopf: 10, calabi: 11, pendulum: 12 };
  // The four families read ALL their digits, into the units each equation wants.
  // Same house rule as SHAPE_ARG: a 9 is expressive, never destructive, and a
  // missing digit is a good default rather than a zero — except super's m,
  // where 0 is meaningful (it IS the sphere) and is kept.
  const SHAPE_UNITS = {
    ellipsoid: (a, b) => [0.2 + (a || 3) * 0.3, 0.2 + (b || 3) * 0.3, 0, 0],      // s1, s2: 0.5..2.9, 3 ≈ the sphere
    super:     (a, b, c) => [a | 0, 0.15 + (b || 2) * 0.4, 0.3 + (c || 5) * 0.5, 0], // m, n1, n2 — 'super 7 1 5' is the reel's starfish
    hopf:      (a, b) => [Math.max(1, a || 4), Math.max(1, b || 6), 0, 0],          // tori, fibres per torus
    calabi:    (a, b) => [Math.min(9, Math.max(2, a || 4)), (b || 3) / 9 * 1.5707963, 0, 0], // n, projection angle
    pendulum:  (a) => [a | 0, 0, 0, 0],   // the digit is ε, and it is spent on the CPU (see below); kept here for the record
  };
  // (the swarm itself — `swarm` — is declared up beside onceTimer, ABOVE the
  // frame loop: frame() reads it and runs before this line does)
  // Opcodes, matching the branch ladder in shapeApply. `noise` is absent on
  // purpose — it is hoisted to its own slot rather than living in the loop.
  const OP_CODE = { ripple: 1, wave: 2, twist: 3, swirl: 4, pulse: 5, shatter: 6, gather: 7, spin: 8 };
  const MASK_CODE = { top: 1, bottom: 2, left: 3, right: 4, front: 5, back: 6, band: 7, rand: 8, wedge: 9 };
  // One digit 0-9 in, real units out. Each move reads its digits as its own
  // quantities, and the ceilings are chosen so a 9 is expressive rather than
  // destructive — nothing here can throw a node out of the frame on its own.
  const OP_SCALE = {
    ripple: (a) => [a[0] * 0.05, 1 + a[1] * 2, a[2] * 0.4],
    wave: (a) => [a[0] * 0.05, 1 + a[1] * 2, a[2] * 0.4],
    twist: (a) => [a[0] * 0.35, 0, 0],
    swirl: (a) => [a[0] * 0.35, 0, 0],
    pulse: (a) => [a[0] * 0.03, a[1] * 0.4, 0],
    shatter: (a) => [a[0] * 0.05, 0, 0],
    gather: (a) => [a[0] * 0.08, 0, 0],
    spin: (a) => [a[0] * 0.15, 0, 0],
  };
  const SHAPE_ARG = {
    shell: (a) => Math.max(2, a || 3),            // how many nested shells
    ring: (a) => 0.10 + (a || 4) * 0.04,          // tube radius, 0.14..0.46 of R
    helix: (a) => Math.max(1, a || 4),            // turns of the spring
    lattice: (a) => Math.max(2, a || 4),          // cells across
    spiral: (a) => Math.max(2, a || 3),           // arms of the galaxy
  };

  const api = {
    moods: Object.keys(MOODS),
    schemes: SCHEMES.map((s) => s.key),
    setRoom, // settings → Room: environment / brightness / grooves / tint / glow
    envThumbnails: (n) => envs.thumbnails(n), // settings → Room: a photo of each world
    setMood(name) {
      currentMoodName = MOODS[name] ? name : 'calm';
      target = fullTarget(currentMoodName, currentSchemeKey);
    },
    setScheme(key) {
      currentSchemeKey = SCHEME_BY_KEY[key] ? key : 'aurora';
      target = fullTarget(currentMoodName, currentSchemeKey);
      coreMat.color.set(coreColorFor(currentSchemeKey));
      setRoomGlow(schemeGlowFor(currentSchemeKey)); // the room's glow tracks the palette
      lineMat.uniforms.uLineColor.value.set(lineColorFor(currentSchemeKey));
      memLineMat.uniforms.uLineColor.value.set(lineColorFor(currentSchemeKey));

      uniforms.uPaint.value = 0; // a generative palette overrides any painting
      paintCount = 0;
    },
    // Paint mode: Y3K colors the whole field. enterPaint shows a default spectrum
    // until paintColors() applies the AI's own anchors.
    enterPaint() { if (!hasPainted) applyPaint(DEFAULT_PAINT); uniforms.uPaint.value = 1; },
    // Painting its own colors also switches the field INTO paint mode (uPaint=1),
    // so Y3K can move freely between a named palette and painting per reply.

    paintColors(anchors) { applyPaint(anchors); uniforms.uPaint.value = 1; setRoomGlow(avgAnchorColor(anchors)); paintCount = anchors ? anchors.length : 0; },
    // THE POSTURE, as a program rather than as positions. Takes what
    // tags.mjs's parseShape produced; null (or 'sphere') goes home. Stage 2
    // reads only the form — the moves land in the next stage.
    setShape(spec) {
      // A bare sphere with nothing done to it IS home — go back rather than
      // holding an identity transform at full mix.

      const bare = !spec || (spec.shape === 'sphere' && !(spec.ops || []).length && !(spec.pull || []).length);
      if (bare) { shapeMixTarget = 0; currentShape = null; swarm = null; if (onceTimer) { clearTimeout(onceTimer); onceTimer = null; } return; }
      const id = SHAPE_ID[spec.shape];
      if (id === undefined) { shapeMixTarget = 0; currentShape = null; swarm = null; return; }
      currentShape = spec;
      // released fresh on every ask, from the digit's ε; anything else lets it go
      swarm = spec.shape === 'pendulum' ? createSwarm({ count: COUNT, rand, eps: epsOf(spec.a | 0) }) : null;
      uniforms.uShapeId.value = id;
      if (SHAPE_UNITS[spec.shape]) {
        const [A, B, C, D] = SHAPE_UNITS[spec.shape](spec.a | 0, spec.b | 0, spec.c | 0, spec.d | 0);
        uniforms.uShapeA.value = A; uniforms.uShapeB.value = B; uniforms.uShapeC.value = C; uniforms.uShapeD.value = D;
      } else {
        uniforms.uShapeA.value = (SHAPE_ARG[spec.shape] || (() => 0))(spec.a | 0);
        uniforms.uShapeB.value = spec.b | 0;
      }

      const ops = uniforms.uOp.value;
      const masks = uniforms.uOpMask.value;
      for (let i = 0; i < ops.length; i++) { ops[i].set(0, 0, 0, 0); masks[i].set(0, 0, 0, 0); }
      uniforms.uNoiseAmp.value = 0;
      uniforms.uFlowAmp.value = 0;
      let slot = 0;
      for (const o of (spec.ops || [])) {
        if (o.op === 'flow') {
          // hoisted like noise: one fbm however many times it is written
          uniforms.uFlowAmp.value = (o.args[0] | 0) * 0.05;
          uniforms.uFlowSpeed.value = 0.2 + (o.args[1] | 0) * 0.35;
          continue;
        }
        if (o.op === 'noise') {
          // hoisted out of the loop: one fbm however many times it is written
          uniforms.uNoiseAmp.value = (o.args[0] | 0) * 0.06;
          uniforms.uNoiseFreq.value = 0.5 + (o.args[1] | 0) * 0.6;
          continue;
        }
        const code = OP_CODE[o.op];
        if (code === undefined || slot >= ops.length) continue;
        const [x, y, z] = (OP_SCALE[o.op] || (() => [0, 0, 0]))(o.args || []);
        ops[slot].set(code, x, y, z);
        // mask args are digits too; the shader wants them as 0..1
        const m = MASK_CODE[o.mask] || 0;
        masks[slot].set(m, ((o.margs || [])[0] | 0) / 9, ((o.margs || [])[1] | 0) / 9, 0);
        slot += 1;
      }

      const pulls = uniforms.uPull.value;
      for (let i = 0; i < pulls.length; i++) pulls[i].set(0, 0, 0, 0);
      (spec.pull || []).slice(0, pulls.length).forEach((pl, i) => {
        const d = pl.dir || [0, 1, 0];
        pulls[i].set(d[0], d[1], d[2], Math.min(1, (pl.amount | 0) / 9));
      });

      shapeMixTarget = 1;
      // THE ENVELOPE. Default is standing: a posture holds until the presence
      // changes it. `once` is a gesture — it arrives and then lets go, without
      // needing a second reply (and therefore a second paid call) to end it.
      if (onceTimer) { clearTimeout(onceTimer); onceTimer = null; }

      // a gesture lets go — and the worn record has to let go with it, or the
      // presence would be told it is holding a posture that ended a turn ago
      if (spec.once) onceTimer = setTimeout(() => { shapeMixTarget = 0; onceTimer = null; currentShape = null; swarm = null; }, 1400);
    },
    // THE ORB IS MADE OF ITS MEMORIES. Hand it a graph from memorygraph.mjs and
    // each memory claims a mote that is already there and brightens it.
    setMemoryGraph(graph) { startMemJob(graph); },
    setMemoryVisible(on) { memOnTarget = on ? 1 : 0; },
    setMemoryEdges(on) { memEdgesOn = !!on; },
    onMemoryTap(fn) { onMemTap = typeof fn === 'function' ? fn : null; },
    selectMemory(i) { return selectMemory(i); },
    selectedMemory() { return memSelected; },
    // the GPU pick pass is gone: a tap is a direction on the sphere and the
    // nearest memory is a dot product (see touchDirAt / memoryNearest)
    memoryNearestTo(x, y) { const d = touchDirAt(x, y); return d ? memoryNearest(d) : -1; },
    memoryCount() { return memGraph && memGraph.nodes ? memGraph.nodes.length : 0; },
    // shown vs found, so the cap is visible to anyone asking rather than implied
    memoryEdges() { return { shown: memEdgeCount, found: memEdgeTotal }; },
    // A transient, fired by a ~mark~ in the speech as the words arrive.
    beat,
    // What the transient layer is adding right this frame — zero when nothing
    // is in flight, which is also the assertion that beats do not accumulate
    // into the state.
    beatLevel() { const o = {}; for (const k of Object.keys(beatOff)) if (beatOff[k]) o[k] = +beatOff[k].toFixed(4); return o; },
    setCore(on) { core.visible = on; if (!on) coreMat.opacity = 0; },
    setConstellation(on) { lines.visible = on; dotFadeForm = on ? 0.4 : 1.0; },
    // Posture: set core + web + plasma together from a named form (body language).

    setForm(name) {
      currentFormName = FORM_MAP[name] ? name : 'orb';
      const f = FORM_MAP[name] || FORM_MAP.orb;
      core.visible = f.core; if (!f.core) coreMat.opacity = 0;
      lines.visible = f.lines; dotFadeForm = f.lines ? 0.4 : 1.0;
      plasmaTarget = f.plasma ? 1 : 0;
    },

    // THE PACE of every arrival. Named, not numeric — see MORPH above.
    setMorph(name) { morphName = MORPH[name] ? name : 'settle'; morphK = MORPH[morphName]; lastMorphName = morphName; },
    // A score's step ARRIVES over its own length: the pace becomes a number for
    // the duration of the score, and restoreMorph puts the named one back.
    setMorphSeconds(seconds) { morphK = easeForSeconds(seconds); },
    restoreMorph() { morphK = MORPH[lastMorphName] || MORPH.settle; },
    // COUNT: one digit → how much of the field is alive, on a log scale so the
    // small end is real — 0 is a couple of dozen sparks, 3 a few hundred,
    // 6 a couple of thousand, 9 everything. Rides the same setField the
    // condense machinery already eases, so it arrives at the body's pace.
    setCount(digit) {
      const d = Math.max(0, Math.min(9, digit | 0));
      const n = Math.max(1, Math.round(COUNT * Math.pow(10, -3 + d / 3)));
      this.setField({ keep: n });
    },
    // TURN: direction and speed of the idle spin. 3 is the speed that shipped.
    setTurn({ dir = 'right', speed = 3 } = {}) {
      const sp = Math.max(0, Math.min(9, speed | 0)) / 3;
      idleTurn = dir === 'still' ? 0 : (dir === 'left' ? -1 : 1) * sp;
    },
    turn() { return { dir: idleTurn === 0 ? 'still' : idleTurn < 0 ? 'left' : 'right', speed: Math.round(Math.abs(idleTurn) * 3) }; },
    // FLASH: on/off at a period, in seconds; 0 stops it.
    setFlash(periodSeconds) { uniforms.uFlashPeriod.value = Math.max(0, Math.min(5, +periodSeconds || 0)); },
    flash() { return uniforms.uFlashPeriod.value; },
    // THE FIELD AS A CHOICE. How many of it there are, how far in it has drawn
    // itself, and where in the room it stands. All three ease on the same clock
    // as every other arrival, so a body that condenses does it at the pace it
    // chose — a drift is a slow gathering, a surge is a snap.
    //   keep is a COUNT, not a fraction, because that is how the presence thinks
    //   about it: 1 is a single particle, and the ceiling is the field it has.
    setField({ condense, keep, at } = {}) {
      if (condense !== undefined && condense !== null) fieldTarget.condense = Math.min(1, Math.max(0, +condense || 0));
      if (keep !== undefined && keep !== null) {
        const n = Math.min(COUNT, Math.max(1, Math.round(+keep || 1)));
        fieldKeepN = n;
        // rank is 0..1 over COUNT nodes, and rank 0 always survives, so n nodes
        // means the threshold sits just past the (n-1)th
        fieldTarget.keep = (n - 1) / (COUNT - 1);
      }
      if (Array.isArray(at)) {
        fieldTarget.off.set(
          Math.max(-3, Math.min(3, +at[0] || 0)),
          Math.max(-3, Math.min(3, +at[1] || 0)),
          Math.max(-3, Math.min(3, +at[2] || 0)),
        );
      }
    },

    // THE TRAIL. seconds is how long a position takes to fade to nothing:
    // 0 turns it off entirely, Infinity is the never-fading one, and anything
    // between is what it says. It is wall-clock, so it means the same thing on
    // a 120Hz display as on a 60Hz one.
    setTrail(seconds) {
      const s = seconds === Infinity || seconds === 'never' ? Infinity
        : Math.max(0, Math.min(30, +seconds || 0));
      if (!s) {
        trailOn = false; trailQuad.visible = false; trailT = 1.0;
        clearTrail();
        return;
      }
      ensureTrail();
      if (!trailOn) clearTrail();      // never start from someone else's past
      trailT = s; trailOn = true;   // the quad shows itself on the first step
    },
    trail() { return trailOn ? (trailT === Infinity ? 'never' : +trailT.toFixed(2)) : 0; },
    // What the field is, as data — for the worn record, in the units it was set in.
    field() { return { condense: +fieldTarget.condense.toFixed(3), keep: fieldKeepN,
                       at: [+fieldTarget.off.x.toFixed(2), +fieldTarget.off.y.toFixed(2), +fieldTarget.off.z.toFixed(2)],
                       most: COUNT }; },
    // THE ROOM'S LIQUID, not the body's. It lives on this object for one reason
    // only: one body, one record. The UI is mercury and the being is not —
    // nothing here drives the orb, and nothing about the orb drives this.

    setLiquid(spec, opts) {
      const s = spec || {};
      setMercuryLiquid(s, opts);
      // The tide travels with the material because they arrive in one sentence.
      // Absent means UNCHANGED, not stopped — a reply that only says "water"
      // must not silently end a wave the presence started three turns ago. To
      // stop it, it writes `still`, which parses to an empty gesture list.
      if (s.tide) setMercuryTide(s.tide.gestures, s.tide.lean);
    },
    // Everything the presence is wearing, as data. The paint ANCHORS are gone by
    // design (applyPaint writes the buffer and drops them), so this reports the
    // count — the honest limit of what the machinery can say.
    worn() {
      return { mood: currentMoodName, form: currentFormName, scheme: paintCount ? null : currentSchemeKey,
               painted: paintCount, shape: currentShape, morph: morphName };
    },
    // Put a whole body on at once, with no visible crossing: entering a room
    // should show what is there, not the journey to it.
    wear(w, fallbackScheme) {

      // No record: the RESTING body, all of it — including the pace. Leaving
      // morph at whatever the last room set would carry one presence's tempo
      // into another's room, which is exactly the drift this store exists to end.
      if (!w) { this.setMorph('settle'); this.setForm('orb'); this.setMood('calm'); this.setShape(null); this.setScheme(fallbackScheme || 'stardust'); return; }
      this.setMorph(w.morph);
      this.setMood(w.mood); this.setForm(w.form);
      // A PAINTED BODY PUTS ITS PAINT BACK ON. Skipping the scheme when `painted`
      // was set left the room wearing the LAST presence's colors — the drift the
      // comment above says this record exists to end. If the anchors travelled
      // with the record, wear them; if only the count survived (a record written
      // before they were kept), fall back rather than inherit a stranger's.
      if (w.painted && w.paint && w.paint.length) this.paintColors(w.paint);
      else this.setScheme(w.scheme || fallbackScheme || 'stardust');
      this.setShape(w.shape || null);
      setMercuryLiquid({ material: w.material, gravity: w.gravity }, { ms: 0 });
    },
    // 0..1 — live energy from the mic while listening.
    setAudioLevel(v) { audioTarget = Math.max(0, Math.min(1, v)); },
    // While the voice talks, pulse the surface even without an analyser.
    setSpeaking(on) { speakingBoost = on ? 0.35 : 0; },
    setAutoRotate(on) { idleEnabled = on; },
  };
  // The dev handle is built long before the api exists, so hand it over here.
  // Without this there is no way to drive a posture from the console at all —
  // which is the whole point of this stage.
  if (typeof window !== 'undefined' && window.__y3kScene) window.__y3kScene.body = api;
  return api;
}
