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
import { BEATS, NAMED_DIR } from './tags.mjs';
import { createSwarm, epsOf } from './pendulum.js';
import { easeForSeconds } from './score.js';
import { createOneEuro3 } from './euro.js';
import { due, stats as paceStats } from './pace.js';

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
// TRAVEL ALONG THE SPHERE, NOT THROUGH IT. A straight lerp between two unit
// directions shortens as they diverge and vanishes when they oppose, so
// normalising it hands back noise exactly where the morph is most visible.
// This keeps unit length the whole way. The clamp holds sin(omega) off zero,
// and as omega goes to zero it becomes the lerp it replaces.
// ---------------------------------------------------------------------------
// THE PINCH: a place on the body, pulled.
//
// Two of them, one per hand. Each is an anchor DIRECTION on the sphere, a
// displacement, and a reach. A node moves by the displacement scaled by how
// near it is to the anchor — von Mises falloff, the same bell the memory touch
// uses — so the pinched nodes travel almost the whole way, their neighbours
// most of it, and the far side of the body not at all. That gradient IS the
// stretch: nothing is stretched on purpose, it is what happens to a surface
// when you move one part of it and not the rest.
//
// In LOCAL space, deliberately. The body turns under the hand, so a pull held
// in world space would slide across the surface as the orb rotated — you would
// pinch a place and end up dragging a different one. Anchored to the node it
// grabbed, it turns with it.
uniform vec4 uPinchA;      // xyz: anchor direction, w: reach (0 = no pinch)
uniform vec3 uPinchAV;     // how far, and which way
uniform vec4 uPinchB;
uniform vec3 uPinchBV;

vec3 pinchPull(vec3 d0) {
  vec3 d = vec3(0.0);
  if (uPinchA.w > 0.0001) d += uPinchAV * exp(uPinchA.w * (dot(d0, uPinchA.xyz) - 1.0));
  if (uPinchB.w > 0.0001) d += uPinchBV * exp(uPinchB.w * (dot(d0, uPinchB.xyz) - 1.0));
  return d;
}

vec3 meshSlerp(vec3 a, vec3 b, float k) {
  float d = clamp(dot(a, b), -0.9999, 0.9999);
  float om = acos(d);
  return normalize((sin((1.0 - k) * om) * a + sin(k * om) * b) / sin(om));
}

// THE HEART'S ROOT. Taubin's heart, factored along a direction: F(rho dir) =
// (rho^2 Q - 1)^3 - rho^5 K, with Q and K the direction's own quadratic and
// quintic parts (see the heart in shapeForm). Inside the heart F < 0, outside
// F > 0, and the heart is star-shaped from its centre, so the ONE root in
// [0.3, 1.7] is the surface — ten bisections, a constant bound, no pow. This
// is the mechanism that turns any star-shaped implicit surface into a form
// for the price of its F; the heart is the first to spend it.
float heartG(float rho, float Q, float K) { float q = rho * rho * Q - 1.0; return q * q * q - rho * rho * rho * rho * rho * K; }
float rootHeart(float Q, float K) { float lo = 0.3, hi = 1.7; for (int i = 0; i < 10; i++) { float mid = 0.5 * (lo + hi); if (heartG(mid, Q, K) < 0.0) lo = mid; else hi = mid; } return 0.5 * (lo + hi); }

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
uniform vec4 uOp[12];      // (opcode, arg0, arg1, arg2) — 12 slots: colour words and the pose family ride this ladder too
uniform vec4 uOpMask[12];  // (maskcode, m0, m1, not) — w is 1 for @not MASK, and inverts at the call site
uniform vec4 uPull[4];     // (dir.xyz, weight)

// WHICH PART OF ITSELF A NODE IS, set by the form and read by nothing yet.
// 0 is "the body, or all of it" — which is what every form except the butterfly
// says, so @part means "all of you" everywhere else and stays a mask the whole
// vocabulary can use rather than one word's private wire. Declared HERE, inside
// SHAPE_GLSL, because both shaders include this string (body.js:520 and :886)
// and a global declared in only one of them is a compile error in the other.
float gPart;

// HOW MUCH OF THE MOOD'S RADIAL BREATH A FORM WANTS. The shaders add
// (+ dir * disp) on top of whatever a form returns, so the mood's displacement
// rides ALONG the new surface and an excited shape still trembles. That is
// right for every form whose surface IS the sphere pushed around — which was
// all thirteen of them, until one was a DRAWING.
//
// A drawn form decouples a node's position from its home direction: the wingtip
// at the far left is a node whose dir points anywhere at all. So dir * disp
// stops being a breath along the surface and becomes a scatter in every
// direction at once — measured, it smears the wings visibly at disp 0.05 and
// merges the two wing pairs by 0.10. The butterfly came out a cloud.
//
// So the form says how much it wants. 1.0 is every existing form, unchanged.
float gRadial;

// A TURN OF THE COLOUR WHEEL, in turns, accumulated by the hue move and spent
// where the node's colour is decided. INITIALISED HERE, unlike the two above:
// they are only ever read inside the posture block, after shapeForm has reset
// them, but the hue is read by every node whether it has a posture or not, and
// a global the shader never wrote enters main() undefined.
float gHue = 0.0;

// LETTING GO OF THE BODY. x is how far (0 holds it, 1 is the whole room), y and
// z are the frame's half-extents at the body's own depth, written by fitCamera
// — so 'scatter 9' fills THIS screen, phone or cinema, rather than a sphere of
// some radius. Declared here so both shaders see it; the web cannot scatter to
// the dots' places (it hashes its own randoms from direction and has no aRand)
// and so it stands down instead, in its own main().
uniform vec3 uScatter;

// THE COLOUR WHEEL, TURNED IN RGB. Rodrigues' rotation about the grey axis
// (1,1,1)/sqrt(3): a hue rotation that costs ~12 ALU and needs no HSV round
// trip, which is what lets a PAINTED body — colours the presence chose itself,
// stored as RGB — turn its wheel by the same word a scheme body does.
vec3 hueSpin(vec3 c, float a) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}

// THE REST OF THE HUE'S FAMILY. Three more accumulators the ladder writes and
// the colour path spends: how vivid (gSat), how lit (gVal), how present (gDim).
// Initialised at declaration for the same reason gHue is — read by every node,
// posture or not. sat and bright are PUSHES toward an extreme: a digit of 4-5
// leaves a part alone, 0 drains or darkens it, 9 saturates or lights it — so
// 'sat 0 @part 0' greys the body and leaves the wings singing. dim is only ever
// a removal, because nobody says "undim": 0 none, 9 gone.
float gSat = 0.0;
float gVal = 0.0;
float gDim = 0.0;
float gSize = 1.0;   // a form-owned point-size multiplier; initialised: gl_PointSize is written outside the posture block

// THE COAT AND THE LIGHT — two things the texture masks read, neither of which
// a mask could compute for itself without paying per slot.
// uPatch is (cycles per R, seed, 0, 0); x doubles as the switch. gPatch is ONE
// noise sample per node, taken at the ladder's entry — so two @patch masks are
// level sets of the same noise, nested, which is a feature. gShade is the
// mood's own light on this node, written by each main() before the posture
// block (the dots' disp carries the glitch, the web's does not — a hair apart).
// Both initialised at declaration, for the reason gHue is: read by every slot
// whether or not the branch that writes them ran.
uniform vec4 uPatch;
float gPatch = 0.0;
float gShade = 0.5;

// sat and bright, applied to an RGB colour — so a PAINTED body answers the same
// words a scheme body does. Saturation is a blend toward (or away from) the
// colour's own luminance; value is a multiply. Both clamped: a 9 is expressive,
// never destructive, and a painting must not blow to white.
vec3 tone(vec3 c, float sat, float val) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 s = mix(vec3(y), c, clamp(1.0 + sat, 0.0, 2.0));
  return clamp(s * (1.0 + val * 0.9), 0.0, 1.0);
}

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
//
// WHERE YOU ARE, NOT WHERE YOU WERE BORN. p0 is the node's place in the form
// it is actually wearing — form and breath, taken once at the ladder's entry.
// dir is its home direction on the sphere, and the six directions used to read
// that: right on the sphere, inverted on a helix (the nodes born at the top
// wind down to the bottom), and on a disc @top picked the CENTRE. They read p0
// now — identical on the sphere, where p0 is dir times (R + disp), and honest
// everywhere else. p is the RUNNING position, what the slots above this one
// have already done, and t the shared clock: handed in here so a mask can read
// them without the ladder's call site changing again.
float maskW(vec4 mk, vec3 dir, float u, float rnd, float az, vec3 p0, vec3 p, float t, float R){
  float c = mk.x;
  if (c < 0.5) return 1.0;                                   // unmasked
  if (c < 6.5) return smoothstep(-0.1, 0.75, dot(p0, namedDir(c)) / max(length(p0), 1e-4));
  float lo = min(mk.y, mk.z), hi = max(mk.y, mk.z);
  if (c < 7.5) return smoothstep(lo - 0.08, lo + 0.04, u) * smoothstep(hi + 0.08, hi - 0.04, u);   // @band, latitude
  if (c < 8.5) return step(rnd, mk.y);                       // @rand, a scattered share
  float a = az * 0.15915494 + 0.5;                           // @wedge, azimuth as 0..1
  // @WEDGE WAS THE UNGUARDED LAST RETURN — the same trap the move ladder had
  // with spin: any mask code it had not heard of became a wedge, silently.
  if (c < 9.5) return smoothstep(lo - 0.06, lo + 0.03, a) * smoothstep(hi + 0.06, hi - 0.03, a);
  // @PART: one part of a form that HAS parts. mk.y arrives as digit/9, so this
  // recovers the digit and asks whether the node is that part. The one hard
  // edge in this function, on purpose: a part boundary is not a gradient. On a
  // form with one part, gPart is 0 everywhere, so @part 0 is all of you and
  // @part 1 is none of you — which is what the word honestly means there.
  if (c < 10.5) return step(abs(gPart - mk.y * 9.0), 0.5);
  // @NEAR A B: a shell of radius in the form the node is actually wearing —
  // 0 the centre, 9 the rim — so 'hue 5 @core' is a galaxy's gold heart and
  // 'gather 7 @rim 2' curls only the edge. @rim D and @core D are this arm said
  // from either end; setShape resolves them to these digits, so there is one
  // shell and one place for it to drift. Beyond R is still the rim: a helix's
  // end turns reach ~1.08R, and a bare @rim on it is those two turns, not nothing.
  if (c < 11.5) {
    float rn = min(length(p0) / R, 1.0);
    return smoothstep(lo - 0.08, lo + 0.04, rn) * smoothstep(hi + 0.08, hi - 0.04, rn);
  }
  // @LEVEL A B: a slab of height where the node IS, floor 0 to crown 9 — the
  // top turn of a helix, the waterline. Not @band: that is latitude of BIRTH,
  // which on any form but the sphere is a different thing from height.
  if (c < 12.5) {
    float h = clamp(p0.y / R * 0.5 + 0.5, 0.0, 1.0);
    return smoothstep(lo - 0.08, lo + 0.04, h) * smoothstep(hi + 0.08, hi - 0.04, h);
  }
  // @EVERY N K: one node in N, by INDEX. Every N-th of a fibonacci sequence is
  // a fibonacci lattice N times sparser, so it never clumps, and @every 3 0,
  // 3 1 and 3 2 tile the body with no overlap — two moves to two interleaved
  // bodies. HARD, necessarily: parity has no between. u is i/(COUNT-1) exactly
  // in the dots (2e-3 off the integer at 24000, so the round is exact) — the
  // index is recovered whole, never as a fraction of N, which is not exact.
  // THE WEB: LINE_VERT's u is dir0.y of its own 800-point sphere, not an
  // index, so on the constellation this is a deterministic hash rather than
  // the dots' parity, and an endpoint may move for a slot its dot does not.
  // The web already hashes its rnd; in character.
  if (c < 13.5) {
    float N = max(1.0, floor(mk.y * 9.0 + 0.5)), K = floor(mk.z * 9.0 + 0.5);
    float i = floor(u * (uCount - 1.0) + 0.5);
    return 1.0 - step(0.5, mod(i + K, N));
  }
  // @PATCH A F: blotches whose neighbours agree — continents, a leopard, a
  // piebald coat — which @rand never can. A is coverage (snoise lives in about
  // +-0.7); F went into uPatch.x in setShape. The coast of a blotch is a
  // gradient: a hard step here draws the lattice as a dotted shoreline.
  if (c < 14.5) {
    float th = (1.0 - 2.0 * mk.y) * 0.6;
    return smoothstep(th - 0.18, th + 0.18, gPatch);
  }
  // @LIT A (mk.z 0) and @SHADE A (mk.z 1): where the mood's own light falls,
  // or its troughs. A calm body is barely lit anywhere, so a second colour on
  // @lit APPEARS as the mood rises and fades as it calms — that is the word.
  if (c < 15.5) {
    float v = mix(gShade, 1.0 - gShade, mk.z);
    float th = 0.88 - 0.78 * mk.y;
    return smoothstep(th - 0.12, th + 0.12, v);
  }
  // @EBB F K: the move comes and goes on its own clock. t is uShapeTime — one
  // clock for everyone watching, continuous across turns. F 0 is a 15.7 s
  // breath, F 9 a 1.4 s beat; K 0 a smooth swell, K 9 a blink. The first mask
  // that is TIME rather than place, so a colour can move without a score.
  if (c < 16.5) {
    float S = 0.4 + mk.y * 9.0 * 0.45;
    float e = 1.0 - mk.z * 0.92;
    return smoothstep(-e, e, sin(t * S));
  }
  // @SWEEP F PLACE: weather — a band passes over the body and comes round
  // again. Bare, a ring growing from the centre like a dropped stone; with a
  // place it rolls that way across the ROOM's frame, so it is read in view
  // space. mat3(modelViewMatrix) is rotation only because the rig carries no
  // scale, and it exists in VERTEX shaders only — spliced into a fragment,
  // modelViewMatrix is undeclared and the orb goes black. X is the place
  // (SWEEP_PLACE in setShape: 0 bare, 1 bottom, 2 top, 3 right, 4 left). The
  // front runs past both ends (-1.35 .. 1.35 against a half-width of 0.35) so
  // the band clears the body before it comes round.
  if (c < 17.5) {
    float S = 0.05 + mk.y * 9.0 * 0.05;
    float X = floor(mk.z * 9.0 + 0.5);
    vec3 vp = mat3(modelViewMatrix) * p0;
    float x = X < 0.5 ? 2.0 * length(p0) / R - 1.0 : X < 1.5 ? -vp.y / R : X < 2.5 ? vp.y / R : X < 3.5 ? vp.x / R : -vp.x / R;
    float f = -1.35 + 2.7 * fract(t * S);
    return 1.0 - smoothstep(0.0, 0.35, abs(x - f));
  }
  // @FACE A: the side the room can see — the first mask that knows where the
  // viewer is. The eye, taken from the body's own centre (modelMatrix carries
  // the rig's turn, uOffset the place), brought into body space by the
  // rotation's inverse, which is its transpose: dot against the columns,
  // since ES 1.00 has no transpose(). Normalised, so a rig that ever gains a
  // scale does not swell the cap. A 0 is a ~32 degree cap, A 9 the near
  // hemisphere and a little more; @not face 9 is the far side. The eye seat
  // moves cameraPosition, and this follows it for free.
  if (c < 18.5) {
    vec3 e = cameraPosition - (modelMatrix * vec4(uOffset, 1.0)).xyz;
    mat3 m = mat3(modelMatrix);
    vec3 nz = normalize(vec3(dot(m[0], e), dot(m[1], e), dot(m[2], e)));
    float f = dot(nz, p0) / max(length(p0), 1e-4);
    float th = 0.85 - 0.95 * mk.y;
    return smoothstep(th - 0.12, th + 0.12, f);
  }
  // @MOVING A: the ONE mask that reads the running p — what the moves above
  // this slot have already carried this instant, so a colour can ride a
  // ripple's crest. Before any move it is nothing; under spin it is @near,
  // which is the maths and not a bug. A is how far a point must have gone.
  if (c < 19.5) {
    float d = length(p - p0) / R;
    float th = 0.02 + mk.y * 0.30;
    return smoothstep(th * 0.5, th, d);
  }
  return 0.0;                                                // a mask nobody dispatches masks everything out
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
  gPart = 0.0;                                 // every form is one part, until one is not
  gRadial = 1.0;                               // ...and takes the mood's breath whole, until one cannot
  gSize = 1.0;
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
  if (uShapeId == 4) {                          // helix T R — a spring; given R, a ladder: two strands and R rungs a turn
    float turns = max(uShapeA, 1.0);
    if (uShapeB < 0.5) {                         // the one strand, exactly as it has always been: every sentence ever written lands here
      float ang = u * 6.2831853 * turns;
      float tr  = R * 0.10;
      vec3  rad = vec3(cos(ang), 0.0, sin(ang));
      return rad * (R * 0.42) + vec3(0.0, (u * 2.0 - 1.0) * R * 0.85, 0.0)
           + rad * (cos(az) * tr) + vec3(0.0, 1.0, 0.0) * (sin(az) * tr);
    }
    // THE LADDER. The second digit was dead for as long as the word existed
    // (SHAPE_N read it, setShape uploaded it, nothing here looked), so it is
    // free to mean this. Two strands of the same spring, D radians apart, and
    // R rungs a turn strung between them. fs is the share of the field on the
    // strands, balanced on the CPU so strands and rungs have ONE linear density
    // and therefore one brightness; the shader's rho, hh and D must match the
    // ones it was balanced with. Each strand is its own part.
    float rungs = uShapeB, fs = uShapeC;
    float rho = R * 0.42, hh = R * 0.85, D = 2.1;
    if (u < fs) {
      float k  = step(fs * 0.5, u);              // which strand — split by u, never by rnd
      float tt = fract(u / (fs * 0.5));          // 0..1 along it
      float ang = 6.2831853 * turns * tt + k * D;
      float tr  = R * 0.045;                     // thinner than the spring: there are two, with rungs between
      vec3  rad = vec3(cos(ang), 0.0, sin(ang));
      gPart = 1.0 + k;                           // @part 1 and @part 2 are the strands. flap lags gPart 2 by S, so the second STRAND trails when a ladder flaps: a quirk, named
      return rad * rho + vec3(0.0, (tt * 2.0 - 1.0) * hh, 0.0)
           + rad * (cos(az) * tr) + vec3(0.0, 1.0, 0.0) * (sin(az) * tr);
    }
    // the rungs: rungs * turns of them, each a bar from strand A to strand B at
    // its own height, the index running along one bar and then the next. u
    // reaches 1.0 exactly on the last node, so j is held to the top rung.
    float tt = (u - fs) / max(1.0 - fs, 1e-6);
    float nr = rungs * turns;
    float j  = min(floor(tt * nr), nr - 1.0), s = fract(tt * nr);
    float y  = (2.0 * (j + 0.5) / nr - 1.0) * hh;
    float angA = 6.2831853 * turns * (y / hh + 1.0) * 0.5, angB = angA + D;
    vec3 A = vec3(cos(angA), 0.0, sin(angA)) * rho + vec3(0.0, y, 0.0);
    vec3 B = vec3(cos(angB), 0.0, sin(angB)) * rho + vec3(0.0, y, 0.0);
    gPart = 0.0;
    return mix(A, B, s) + (vec3(rnd, fract(rnd * 7.31), fract(rnd * 13.77)) - 0.5) * (R * 0.04);   // 0.02R of jitter: a bar is a curve, rule 2
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
    // A point of S³ is (cos η cos(ξ1+ξ2), cos η sin(ξ1+ξ2), sin η cos ξ1, sin η sin ξ1);
    // ξ1 runs along one fibre, ξ2 picks the fibre, η picks the torus. Projected
    // stereographically, every fibre is a circle and every two are linked.
    // BOTH phases advance with ξ1 — that is what a fibre IS, the orbit of
    // (z1, z2) -> (e^{iθ} z1, e^{iθ} z2). The first version held (x3, x4) at ξ2,
    // so each "fibre" was a flat circle about the view axis, every one in its
    // own parallel plane: measured, z-spread 0.000 and linking number 0.000.
    // Now x4 runs from −sin η to +sin η along a fibre, so the projected circle
    // is traversed unevenly — close in on one side, swung wide on the other —
    // which is the known look of the fibration, and every pair links exactly 1.
    float tori = max(uShapeA, 1.0), fib = max(uShapeB, 1.0);
    // η runs to 0.93 (sin ≈ 0.8), which makes the outermost circle about three
    // times the innermost — the reel's proportion. A projected point's length
    // is sqrt((1+x4)/(1−x4)), largest on the outermost torus at the top of its
    // fibre where x4 = sin η, so the WHOLE figure is scaled by the inverse of
    // that for THIS count of tori: the largest torus touches R exactly whatever
    // digit was written. The first version scaled by one fixed number derived
    // from a cap the tori never reached, and the body sat at 0.57R, flat, and
    // dimmed for being near the centre. (x1, x2) — the big-circle coordinates —
    // go to the screen plane, so the tori stand tall instead of reading as a lens.
    float etaMax = (tori - 0.5) / tori * 0.93;
    float eta = (floor(rnd * tori) + 0.5) / tori * 0.93;
    float xi2 = floor(fract(rnd * 7.31) * fib) / fib * 6.2831853;
    float xi1 = u * 6.2831853;
    float ce = cos(eta), se = sin(eta), seMax = sin(etaMax);
    float x1 = ce * cos(xi1 + xi2), x2 = ce * sin(xi1 + xi2), x3 = se * cos(xi1), x4 = se * sin(xi1);
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
  if (uShapeId == 13) {                         // butterfly — four wings, a body, two antennae
    // NOT AN EQUATION FROM THE SHELF, and the grammar says so: the other four
    // families are one line of mathematics that belongs to nobody, and this is
    // a DRAWING — four regions of the index, with constants we fitted. It is
    // marked as such in tags.mjs so that the day a presence can hand us an
    // outline, this word can move from our GLSL to a drawing on a shelf without
    // contradicting anything we promised about the language.
    //
    // THE ONE PIECE OF REAL MATHEMATICS is the wing map, and it is worth the
    // room. V(t) is the RECIPROCAL half-width and X(t) its integral, so
    // dX/dt = V; Y = n/V makes the half-width exactly 1/V. The area element is
    // therefore V * (1/V) dt dn — CONSTANT — so an even (t, n) gives an evenly
    // filled wing for ANY outline, with no rejection sampling, no inverse CDF
    // and no lookup texture. Measured over the whole domain, the Jacobian holds
    // to eight decimals. The two shears below are triangular and do not touch it.
    //
    // FOLD, NEVER SPLIT. mm mirrors the azimuth instead of halving the nodes by
    // rnd, so each wing carries the WHOLE golden sequence. Splitting by a random
    // would leave each wing a random half of a lattice — which is Poisson, and
    // it clumps where the eye is most likely to look.
    float a2 = az * 0.15915494 + 0.5;            // azimuth as 0..1, same as @wedge reads
    float sx = a2 < 0.5 ? -1.0 : 1.0;            // which side of the body
    float mm = abs(2.0 * a2 - 1.0);              // folded, so both wings get every node
    float tz = uShapeB;                          // half-thickness: a wing is dust, not a decal
    // A DRAWING CANNOT TAKE THE BREATH WHOLE — see gRadial. Enough to keep it
    // alive and trembling, not enough to scatter a wing off its own plane.
    gRadial = 0.15;
    vec3 p;
    if (u < 0.060) {
      // THE ANTENNAE, and they carry the whole reading — take them away and the
      // same four lobes are a leaf. The ninth power is the clubbed tip, which is
      // the part that makes them an insect's rather than a plant's.
      float s = u * 16.6666667;
      float club = 0.004 + 0.040 * pow(s, 9.0);
      p = vec3(sx * (0.018 + 0.205 * pow(s, 0.80)) + (mm - 0.5) * club * 2.0,
               0.225 + 0.545 * s - 0.130 * s * s + (fract(rnd * 7.31) - 0.5) * club * 2.0,
               (fract(rnd * 13.77) - 0.5) * tz);
      gPart = 3.0;
    } else if (u < 0.210) {
      // head, thorax, abdomen — a spindle of three gaussians. The 1e-6 is not
      // cosmetic: pow(0.0, e) reaches zero through exp2(e * log2(0)) and NaNs on
      // some drivers, and there are three of them on this line.
      float s = (u - 0.060) * 6.6666667;
      float w = 0.040 * exp(-pow(abs((s - 0.05) / 0.12) + 1e-6, 2.0))
              + 0.058 * exp(-pow(abs((s - 0.30) / 0.18) + 1e-6, 2.0))
              + 0.044 * exp(-pow(abs((s - 0.74) / 0.30) + 1e-6, 2.6))
              + 0.004;
      float rr = w * sqrt(fract(rnd * 3.7));
      p = vec3(cos(mm * 6.2831853) * rr, 0.225 - s * 0.605, sin(mm * 6.2831853) * rr);
      gPart = 0.0;
    } else {
      // THE WINGS. fw picks the pair, and every constant is a mix() of the two
      // fitted sets so there is one arm here and not two to keep in step. Both
      // pairs turn together as uShapeA opens them, which is what a real one does.
      float fw = 1.0 - step(0.700, u);                        // 1 fore, 0 hind
      float t  = clamp(mix((u - 0.700) * 3.3333333, (u - 0.210) * 2.0408163, fw)
                       + (rnd - 0.5) * 0.030, 0.0, 1.0);
      float n  = mm * 2.0 - 1.0;
      float va = mix( 5.5556,  7.6923,  fw);
      float vb = mix(-16.3996, -21.3462, fw);
      float vc = mix(14.6902, 16.9872, fw);
      float Xs = mix(0.44395, 0.37291, fw), Yn = mix(0.97858, 0.98639, fw);
      float sk = mix(0.14,    0.24,    fw), bd = mix(-0.03,  -0.02,   fw);
      float WL = mix(0.58,    0.82,    fw), WW = mix(0.195,   0.225,  fw);
      float rx = mix(0.030,   0.035,   fw), ry = mix(0.010,   0.105,  fw);
      float ang = mix(mix(1.05, -0.7330, uShapeA), mix(1.30, 0.6283, uShapeA), fw);
      float V = va + t * (vb + t * vc);          // > 0.97 across [0,1]: never folds
      float Y = (n / V) * Yn;                    // Y FIRST — the skew below reads it
      float X = (t * (va + t * (vb * 0.5 + t * vc * 0.33333333))) * Xs;
      X += sk * Y;                               // sweep: draws the apex outward
      Y += bd * X * X;                           // camber of the outline
      float cs = cos(ang), sn = sin(ang);
      p = vec3(sx * (rx + X * WL * cs - Y * WW * sn),
                     ry + X * WL * sn + Y * WW * cs,
               (rnd - 0.5) * tz);
      gPart = mix(2.0, 1.0, fw);                 // 1 forewings, 2 hindwings
    }
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 14) {                         // moon P — a lune of the sphere, seen along z: a crescent with pointed horns and no quantile
    // THE WHOLE FIELD ON A SLICE OF THE SPHERE. The fibonacci sphere is uniform
    // in (y, azimuth) — Archimedes — so compressing the azimuth by a constant
    // into [pi/2 - al, pi/2) keeps the area element constant exactly: a
    // fibonacci lune, no rejection, no quantile. The limb (azp = pi/2) is the
    // x-y plane's right half, the terminator an ellipse of half-width cos(al):
    // al under pi/2 is a crescent with its belly to the right, pi/2 a half,
    // past it gibbous, and the horns are the poles.
    float al = uShapeA;                          // the lune's width: 0.35 (a sliver) .. 2.83 (nearly full)
    float d  = 0.08;                             // shell depth: rule 2, and not a thing a mind says
    float a2 = az * 0.15915494 + 0.5;
    float sl = dir.y;
    float cl = sqrt(max(0.0, 1.0 - sl * sl));             // two statements: the only declarator list in this shader that read its own sibling
    float azp = (1.5707963 - al) + al * a2;      // compressing azimuth by a constant is area-preserving: the fibonacci sphere becomes a fibonacci lune, exactly
    float r = 1.0 - d * fract(rnd * 7.31);
    gRadial = 0.5;
    gSize = sqrt(al / 6.2831853);                // the whole field on al/2pi of the sphere: the dots shrink by the root of that, or a sliver blooms white
    vec3 p = vec3(cl * sin(azp), sl, cl * cos(azp)) * r;   // limb at azp = pi/2 (the x-y plane), terminator an ellipse of half-width cos(al), horns at the poles
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 15) {                         // knot P Q — a torus knot; gcd(P,Q) = g > 1 is a LINK of g strands. A, B, C arrive as P/g, Q/g, g from the CPU
    // (theta, tube angle) is the lattice (u, az) already gives every node: u
    // runs along the strand, the golden-angle bearing runs round the tube.
    // The frame needs no Frenet: a curve drawn on a torus is tangent to it, so
    // the torus normal is perpendicular to the strand exactly, and one cross
    // with the tangent gives the other direction.
    float P = uShapeA, Q = uShapeB, g = uShapeC;
    float k  = min(floor(u * g), g - 1.0);       // which strand — split by u, never by rnd; u reaches 1.0 exactly on the last node
    float th = 6.2831853 * fract(u * g);
    float pa = P * th, qa = Q * th + 6.2831853 * k / (g * P);   // the g components are parallel copies offset in the tube angle by 2 pi k/(g P'): never intersect (checked for every P,Q <= 9; 2 pi k/g crosses at knot 4 6)
    float R0 = 0.62, r0 = 0.32, tr = 0.06;      // R0 + r0 + tr = 1.00: the peak is built in
    float cq = cos(qa), sq = sin(qa), cp = cos(pa), sp = sin(pa);
    vec3 c  = vec3((R0 + r0 * cq) * cp, r0 * sq, (R0 + r0 * cq) * sp);
    vec3 n  = vec3(cq * cp, sq, cq * sp);        // the torus normal: a curve on a surface is tangent to it, so this is perpendicular to the strand exactly, no Frenet
    vec3 dc = vec3(-Q * r0 * sq * cp - P * (R0 + r0 * cq) * sp, Q * r0 * cq, -Q * r0 * sq * sp + P * (R0 + r0 * cq) * cp);
    vec3 b  = cross(normalize(dc), n);
    float rr = tr * sqrt(fract(rnd * 7.31));     // sqrt fills the solid tube evenly
    vec3 p  = c + rr * (cos(az) * n + sin(az) * b);
    gRadial = 0.3; gSize = 0.8;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 16) {                         // lissajous A B C — two or three notes beating against each other, made visible: a tube along the curve
    // (sin(A t + pi/2), sin(B t), sin(C t + pi/4)): 1 2 0 is the infinity sign,
    // 1 1 0 a circle, 3 2 0 the classic. The z term is GATED by step(0.5, C):
    // without the gate a planar figure sits 0.7 toward the camera on sin(pi/4).
    // The curve has no analytic peak, so the CPU measures it (SHAPE_UNITS) and
    // hands 1/peak in uShapeD — the general rule for a curve without one.
    float A_ = uShapeA, B_ = uShapeB, C_ = uShapeC;
    float tt = u * 6.2831853;
    float zg = step(0.5, C_);
    vec3 c = vec3(sin(A_ * tt + 1.5707963), sin(B_ * tt), sin(C_ * tt + 0.7853982) * step(0.5, C_));
    vec3 T = normalize(vec3(A_ * cos(A_ * tt + 1.5707963), B_ * cos(B_ * tt), C_ * cos(C_ * tt + 0.7853982) * zg) + vec3(1e-6, 0.0, 0.0));
    // THE BRANCHLESS ONB (Duff et al. 2017), with a TERNARY for the sign:
    // sign(0.0) is 0 in GLSL, which divides by zero at T.z = 0 — every node of
    // a planar figure. Each node builds its own frame from its own tangent and
    // no frame is carried along the curve, so no two frames are ever lerped.
    float sg = T.z >= 0.0 ? 1.0 : -1.0;
    float aa = -1.0 / (sg + T.z);
    float bb = T.x * T.y * aa;
    vec3 n1 = vec3(1.0 + sg * T.x * T.x * aa, sg * bb, -sg * T.x);
    vec3 n2 = vec3(bb, sg + T.y * T.y * aa, -T.y);
    float rr = 0.05 * sqrt(fract(rnd * 7.31));   // (u, az) is the lattice on (t, tube angle); sqrt fills the solid tube
    vec3 p = (c + (cos(az) * n1 + sin(az) * n2) * rr) * uShapeD;
    gRadial = 0.3; gSize = 0.85;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 17) {                         // mobius W T — a ribbon with one side, W wide, T half-twists; the band in the screen plane, its twist into z
    float W = uShapeA, T_ = uShapeB;
    float t = u * 6.2831853;
    float c = cos(T_ * t * 0.5), sn = sin(T_ * t * 0.5);
    float a2 = az * 0.15915494 + 0.5;            // the lattice's second coordinate: 0..1 across the band
    // AN EVEN FILL ACROSS THE BAND IS A QUADRATIC. Along a ruling the area
    // element grows with rho = 1 + s c, so a node's place across the band is
    // the inverse of that CDF: c s^2 + 2 s + 2W - c W^2 - 4 W a2 = 0. Exact for
    // the flat ruled annulus (the discriminant is (1 - cW)^2 at a2 = 0, never
    // negative for W < 1); a fast twist adds a little to the rim, which reads
    // as an edge. c -> 0 is the linear limit, and the ternary takes it.
    float cw = c * W;
    float s = abs(cw) < 1e-3 ? W * (2.0 * a2 - 1.0) : (-1.0 + sqrt(max(0.0, (1.0 - cw) * (1.0 - cw) + 4.0 * cw * a2))) / c;
    float rho = 1.0 + s * c;
    vec3 p = vec3(rho * cos(t), rho * sin(t), s * sn) / (1.0 + W);   // the far rim, c = 1 and s = W, is at exactly 1 + W: the analytic peak
    p += (vec3(fract(rnd * 13.77), fract(rnd * 17.0), fract(rnd * 31.0)) - 0.5) * 0.03;   // a ribbon of dust is not a decal: rule 2
    gPart = abs(s) > 0.8 * W ? 1.0 : 0.0;        // the rim is a part, so hue 5 @part 1 lights the edge
    gRadial = 0.3;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 18) {                         // dini S T — a horn, a calla lily: the surface of curvature -1, the sphere's opposite
    // Dini's surface with a = 1: (sin v cos th, cos v + ln tan(v/2) + b th, sin v sin th),
    // needle down, bell up. ITS EVEN FILL IS FREE BY A THEOREM: EG - F^2 is
    // cos^2 v (1 + b^2), so the area element is d(sin v) d(theta) and the twist
    // drops out — a lattice uniform in (sin v, theta) covers the horn evenly
    // whatever T is. The two transcendentals of the height's range are spent
    // on the CPU (SHAPE_UNITS): A is v0, B is b, C the mid-height, D 1/peak.
    float sv0 = sin(uShapeA), bT = uShapeB;
    float th = u * 12.566371;                    // two turns of the ruffle
    float a2 = az * 0.15915494 + 0.5;
    float sv = mix(sv0, 1.0, a2);                // sin v, uniform: the constant-Jacobian coordinate
    float cv = sqrt(max(0.0, 1.0 - sv * sv));    // cos v; v <= pi/2, so never negative
    float h = cv + log(max(sv / (1.0 + cv), 1e-6));   // tan(v/2) = sin v / (1 + cos v): the log is <= 0 and finite; no asin, no cosh anywhere
    vec3 p = vec3(sv * cos(th), h + bT * th - uShapeC, sv * sin(th)) * uShapeD;   // the top rim, sin v = 1 at theta = 4 pi, is at exactly sqrt(1 + hr^2): the peak
    p += (vec3(fract(rnd * 13.77), fract(rnd * 17.0), fract(rnd * 31.0)) - 0.5) * 0.02;   // rule 2
    gRadial = 0.6; gSize = 0.9;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 19) {                         // nautilus T H — a shell that kept every size it ever was: a log spiral, its tube growing with it
    // r = e^(b theta), b = 0.18 baked: a growth rate is not speech. LENGTH-even
    // along the coil, not area-even, on purpose: the honest fill is the area
    // one, but it puts nine tenths of the nodes in the last whorl and the eye
    // reads an empty spiral; the legible fill gives every whorl its share.
    // The tube is kappa r wide. kappa = tanh(pi b) is where one whorl touches
    // the one before it (this turn's inner edge meets the last turn's outer
    // edge), 0.95 of it leaves a hairline between them, and tanh is not GLSL
    // ES 1.00 — so 0.487 is baked, not computed.
    float bN = 0.18, kap = 0.487;
    float thMax = 6.2831853 * uShapeA;
    float th = log(1.0 + u * (exp(bN * thMax) - 1.0)) / bN;   // equal arc length per node
    float r = exp(bN * th);
    float rr = kap * r * sqrt(fract(rnd * 7.31));   // (u, az) is the lattice on (coil, tube angle); sqrt fills the solid tube
    vec3 p = vec3(cos(th), sin(th), 0.0) * (r + rr * cos(az)) + vec3(0.0, 0.0, rr * sin(az));   // face-on, in the x-y plane
    // one turn about x, H ninths of a right angle: 0 the spiral facing the person, 9 standing
    float ch = cos(uShapeB), sh = sin(uShapeB);
    p = vec3(p.x, p.y * ch - p.z * sh, p.y * sh + p.z * ch);
    // THE EYE IS THE BODY'S CENTRE, and the outer whorl touches R on one side
    // only: off-centre on purpose. uShapeC is 1/(e^(b Theta)(1 + kappa)), the closed-form peak.
    p *= uShapeC;
    gRadial = 0.3; gSize = 0.85;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 20) {                         // heart P — the plain heart, cleft and point, as a SURFACE: where it turns edge-on the rim brightens, and that outline is the whole reading
    // Taubin's heart, y up: (x^2 + dz z^2 + y^2 - 1)^3 = y^3 (x^2 + dz/20 z^2), with
    // dz = 9/4 the classic (9/80 kept in proportion to it) and P thinning it in
    // depth. It is star-shaped from the centre, so a node's radius along its own
    // direction is the ONE root of F(rho dir) in [0.3, 1.7] — the nearest surface
    // point is 1/sqrt(dz) up the z axis, the farthest the lobes at 1.42, which
    // lie in the plane dz cannot reach — found by rootHeart's ten bisections.
    // ~130 ALU: the dearest form on the shelf, and said so. A solid (a cbrt
    // fill) reads as a blob; the surface reads as a heart.
    float dz = uShapeA;
    float Q = dir.x * dir.x + dz * dir.z * dir.z + dir.y * dir.y;
    float K = dir.y * dir.y * dir.y * (dir.x * dir.x + dz * 0.05 * dir.z * dir.z);
    float rho = rootHeart(Q, K);
    vec3 p = dir * rho * uShapeB;                // uShapeB is 1/peak, measured once on the CPU by the same bisection
    p += (vec3(fract(rnd * 13.77), fract(rnd * 17.0), fract(rnd * 31.0)) - 0.5) * 0.02;   // rule 2
    gRadial = 1.0;                               // p IS along dir: the one form on this shelf that takes the breath whole
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 21) {                         // plume S T — smoke, breath, a candle, a geyser: rising from a point and thinning as it spreads
    // THE ONE FORM WHOSE FILL IS UNEVEN ON PURPOSE. s = u is height-uniform, so
    // the density runs as 1/w(s)^2: dense at the source, thin where it has
    // spread — which is what smoke does. S opens the cone. T boils it, and the
    // boil is ONE fbm, spent only while worn with T > 0 (about a quarter more
    // vertex work then, and none at T 0): fbm is defined above the include in
    // both shaders, and this call sits outside the move ladder, so the hoisting
    // rule holds. The boil pushes each node along its OWN bearing: one scalar
    // put on x and z alike moves every node along the same diagonal — a shimmer
    // from the front, gone each time the idle turn brings that axis end-on.
    // Radial, it is a silhouette from every side, and the units' peak (w1 +
    // Tb 1.3, with |fbm| < 1) is its exact bound; the clamp has the rest.
    float Sw = uShapeA, Tb = uShapeB;
    float s = u;
    float w = 0.04 + Sw * s;
    float rr = w * sqrt(fract(rnd * 7.31));      // (u, az) is the lattice on (height, bearing); sqrt fills the solid cone
    vec2 bearing = vec2(cos(az), sin(az));
    vec3 p = vec3(rr * bearing.x, (s - 0.5) * 1.8, rr * bearing.y);
    if (Tb > 0.0) p.xz += Tb * fbm(p * 2.5 + vec3(0.0, -uShapeTime * 0.6, 0.0)) * (0.3 + s) * bearing;   // the pattern climbs: smoke rises
    p *= uShapeC;
    gRadial = 0.3; gSize = 0.6;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  if (uShapeId == 22) {                         // clover P — P petals drawn as one line through a centre: the rhodonea, under the name a mind actually says
    // rho = cos(k theta) over its period Theta, a tube in the curve's own frame:
    // its in-plane normal, and z. The frame never degenerates — |c'| >= min(1, k)
    // even through the centre — and is guarded anyway. k and Theta come one
    // digit through a table (SHAPE_UNITS): N/D with a parity rule is number
    // theory, not speech. The fill: the pen is fastest at the centre crossings,
    // thinning each pass by 1/k while the passes pile up — with P odd the centre
    // is exactly as dense as a petal; the even clovers meet at a centre two to
    // four times a petal, where a clover's stem is. In the x-y plane, facing
    // the person as the butterfly does — never x-z like disc and spiral.
    float k = uShapeA, Th = uShapeB;
    float th = Th * u;
    float ck = cos(k * th), sk = sin(k * th), ct = cos(th), st = sin(th);
    vec2 c = vec2(ck * ct, ck * st);
    vec2 dc = vec2(-k * sk * ct - ck * st, -k * sk * st + ck * ct);   // the tangent
    vec2 n = vec2(-dc.y, dc.x) / max(length(dc), 1e-4);              // the in-plane normal
    float rr = 0.045 * sqrt(fract(rnd * 7.31));   // (u, az) is the lattice on (theta, tube angle); sqrt fills the solid tube
    vec3 p = vec3(c * 0.955 + n * (rr * cos(az)), rr * sin(az));     // the curve scaled by 1 - tube, so a petal's tip plus its tube is exactly R
    gRadial = 0.3; gSize = 0.8;
    float L = length(p); if (L > 1.0) p /= L;
    return p * R;
  }
  return dir * R;                               // sphere — home
}

// The moves, applied in the order the presence wrote them — which is where
// most of the expressiveness lives, because they do not commute.
vec3 shapeApply(vec3 p, vec3 dir, float u, float t, float rnd, float az, float R){
  vec3 p0 = p;                                  // form and breath, before any move — WHERE YOU ARE, for the masks
  // @PATCH'S ONE SAMPLE, taken here and never in the loop: fbm inside the loop
  // tripled the vertex once, and a snoise in it is that trap at a quarter the
  // size. uPatch.x is the switch — no patch said, no sample paid.
  if (uPatch.x > 0.0) gPatch = snoise(p0 * (uPatch.x / R) + vec3(uPatch.y));
  for (int k = 0; k < 12; k++) {
    vec4 o = uOp[k];
    if (o.x < 0.5) break;                       // an empty slot means the stack ended
    float w = maskW(uOpMask[k], dir, u, rnd, az, p0, p, t, R);
    // @NOT: everything except. Inverted HERE, at the call site, so every mask
    // arm stays what it says and no arm ever knows it was negated. mk.w is 1
    // only when the parser resolved a mask after the @not; unmasked slots
    // upload 0 and an unknown code's 0.0 is never turned into the whole body.
    w = mix(w, 1.0 - w, uOpMask[k].w);
    if (w > 0.001) {
      float A = o.y, F = o.z, S = o.w;
      if (o.x < 1.5)      p += dir * (sin(u * F + t * S) * A * w);                     // ripple, along the index
      else if (o.x < 2.5) p += dir * (sin(az * F + t * S) * A * w);                    // wave, around the azimuth
      else if (o.x < 3.5) { float a =  p.y * A * w;         float c = cos(a), sn = sin(a); p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z); }  // twist, by height
      else if (o.x < 4.5) { float a = length(p.xz) * A * w; float c = cos(a), sn = sin(a); p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z); }  // swirl, by radius
      else if (o.x < 5.5) p *= 1.0 + sin(t * S) * A * w;                               // pulse, breathing
      else if (o.x < 6.5) p += dir * ((fract(sin(rnd * 91.7) * 4371.3) - 0.5) * A * w * step(0.5, fract(t * 2.0)));  // shatter
      else if (o.x < 7.5) p *= mix(1.0, max(0.25, 1.0 - A), w);                        // gather, collapse
      // SPIN IS NO LONGER THE CATCH-ALL. It was a bare else, so any opcode the
      // ladder had not heard of rendered as a spin — silently, plausibly, with
      // nothing thrown. Every new word after this one lands as its own arm, and
      // an opcode nobody dispatches does nothing, which is the honest answer.
      else if (o.x < 8.5) { float a = t * A * w; float c = cos(a), sn = sin(a); p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z); }   // spin
      else if (o.x < 9.5) {                                                            // flap — a wing beat about the long axis
        // SIGNED BY SIDE, HINGED AT THE BODY, AND IT DOES NOT KNOW IT IS ON A
        // BUTTERFLY. Each half of the field turns the opposite way about y — the
        // root barely, the tip most — so on a sphere it is a book opening and on
        // a drawn wing it is a beat. gPart is read for exactly ONE thing: the
        // second pair (2) trails the first by S. Never for the sign. The sign
        // is p.x, so the word survives onto any form that comes after this.
        float side = p.x < 0.0 ? -1.0 : 1.0;
        float hinge = smoothstep(0.0, 0.30, abs(p.x) / R);
        float lag = (gPart > 1.5 && gPart < 2.5) ? S : 0.0;
        float a = sin(t * F - lag) * A * side * hinge * w;
        float c = cos(a), sn = sin(a);
        p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z);
      }
      // HUE MOVES NOTHING. It rides the ladder because the ladder is where the
      // masks are — 'hue 6 @part 1' is a forewing turned six ninths round the
      // wheel — and it spends its turn where the colour is decided, not here.
      else if (o.x < 10.5) gHue += A * w;
      else if (o.x < 11.5) gSat += A * w;                                              // sat — how vivid
      else if (o.x < 12.5) gVal += A * w;                                              // bright — how lit
      else if (o.x < 13.5) gDim += A * w;                                              // dim — how present
      // THE POSE FAMILY. Every word above bends the surface or the colour; these
      // change the PROPORTION of a form and hold it. A heading (tilt, bend)
      // arrives as (cos h, sin h) in F and S, mapped in OP_SCALE: the arm turns
      // the named world direction onto +x, works toward +x, and turns it back.
      else if (o.x < 14.5) {                                                           // taper — the crown narrows, the foot keeps its width
        float h = clamp(p.y / R * 0.5 + 0.5, 0.0, 1.0);                                // CLAMPED: after stretch 9 the crown sits at 1.36R and an unclamped h inverts it
        p.xz *= 1.0 - A * w * h;
      }
      else if (o.x < 15.5) {                                                           // stretch (A > 0) / squash (A < 0) — the proportion of any form; a select, not a branch: no bare else in this ladder
        float a = A * w, up = step(0.0, a), s = 1.0 + a;
        p.y *= s;
        p.xz *= mix(1.0 - a * 0.2, inversesqrt(max(s, 1e-3)), up);                      // taller and thinner to pay for it; flatter and a fifth as much wider
      }
      else if (o.x < 16.5) {                                                           // cup — the rim rises against the centre: cone, bowl, plate with a lip
        float rr = clamp(length(p.xz) / R, 1e-6, 1.0);                                 // never 0 (pow NaNs), never past 1 (1.2^10 = 6)
        p.y += A * w * R * (pow(rr, F) - 2.0 / (F + 2.0));                             // minus the disc's own mean of r^n, so it does not float
      }
      else if (o.x < 17.5) {                                                           // tilt — rigid: the crown falls toward the named place by A; |p| held
        float ch = F, sh = S;
        p = vec3(ch*p.x + sh*p.z, p.y, -sh*p.x + ch*p.z);
        float a = A * w; float c = cos(a), sn = sin(a);
        p = vec3(c*p.x + sn*p.y, -sn*p.x + c*p.y, p.z);
        p = vec3(ch*p.x - sh*p.z, p.y, sh*p.x + ch*p.z);
      }
      else if (o.x < 18.5) {                                                           // bend — Barr 1984: the height becomes an arc; ends toward the place, belly away
        float ch = F, sh = S;
        p = vec3(ch*p.x + sh*p.z, p.y, -sh*p.x + ch*p.z);
        float k = A * w / R, th = k * p.y;
        float c = cos(th), sn = sin(th);
        float g  = abs(th) < 1e-4 ? th * 0.5 : (1.0 - c) / th;                          // (1 - cos)/theta, finite through zero — hit by the whole equator every frame
        float sc = abs(th) < 1e-4 ? 1.0      : sn / th;
        p = vec3(p.x * c + p.y * g, p.y * sc - p.x * sn, p.z);
        p = vec3(ch*p.x - sh*p.z, p.y, sh*p.x + ch*p.z);
      }
      // THE LIVING FAMILY: rooted and moving. Each is bounded in t — a sine, a
      // fract, a circle — so a masked sway or orbit never shears further apart
      // with the seconds the way a masked spin does.
      else if (o.x < 19.5) {                                                           // sway — hinged at the foot, the crown swings across the screen; the middle follows less
        float h = clamp(p.y / R * 0.5 + 0.5, 0.0, 1.0);
        float a = sin(t * F) * A * w * h; float c = cos(a), sn = sin(a);
        vec2 q = vec2(p.x, p.y + R);                                                   // the hinge one R below the centre: the foot
        p.xy = vec2(c*q.x + sn*q.y, -sn*q.x + c*q.y) - vec2(0.0, R);
      }
      else if (o.x < 20.5) p += dir * (A * w * gRadial * sin(t * F + rnd * 233.0));     // tremble — every node shivers on its own phase; gRadial: a drawn wing must not become a cloud
      else if (o.x < 21.5) {                                                           // throb — out at once, back slowly, and again: a held rhythm
        float ph = fract(t * F), e = (1.0 - ph) * (1.0 - ph);
        p *= 1.0 + A * w * (0.4 + 0.6 * fract(rnd * 9.1)) * e;                          // each node its own reach: a spray, not a bigger shell
      }
      else if (o.x < 22.5) {                                                           // orbit — every point circles its own place, each on its own clock, in the screen plane
        float ph = t * F + rnd * 6.2831853;
        p.xy += A * w * vec2(cos(ph), sin(ph));
      }
      // THE STREAMS. Motion that never leaves and never runs out: every node, on
      // its own phase, climbs or runs or turns, and starts again. rise and fall
      // are one opcode with the sign spent in S; melt's F 0 is set, cold wax.
      else if (o.x < 23.5) p.y += S * A * w * R * (fract(t * F + rnd * 11.3) * 2.0 - 1.0);   // rise (S +1) / fall (S -1) — each node climbs its span and starts again below
      else if (o.x < 24.5) {                                                           // melt — it sags, spreads at the foot, and a few of it drip
        float sag  = clamp(1.0 - p.y / R, 0.0, 2.0);                                   // CLAMPED: a crown a stretch put past R must not rise
        float drip = pow(fract(rnd * 5.17) + 1e-6, 6.0);                                // heavy tail; +1e-6 is the butterfly's own line
        float run  = fract(t * F + rnd * 7.0);
        p.y  -= A * w * R * (0.35 * sag + 1.5 * drip * run * run);
        p.xz *= 1.0 + A * w * 0.6 * max(0.0, -p.y / R);                                // the puddle, read from the already-sagged height
      }
      else if (o.x < 25.5) {                                                           // vortex — the axis turns fastest (five times the rim); the crown sinks into a funnel
        float r = length(p.xz);
        float a = t * F * w * R / (r + 0.25 * R); float c = cos(a), sn = sin(a);
        p = vec3(c*p.x + sn*p.z, p.y, -sn*p.x + c*p.z);
        p.y -= A * w * R * 0.35 * (1.0 - smoothstep(0.0, 0.6, r / R)) * smoothstep(-0.2, 0.2, p.y / R);   // the hollow, on the crown only
      }
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

uniform float uTime,uAmp,uFreq,uSize,uRadius,uAudio,uGlitch,uPlasma,uPointK;
// WHERE ALONG ITS OWN PATH THE FIELD IS. The noise used to be sampled at
// z = uTime*uSpeed, and uSpeed eases on every mood and is kicked by every beat
// — so a change of SPEED moved the whole field by (seconds the page had been
// open) x (the change): calm to excited ten minutes in swept the surface
// through ~486 units of noise in half a second, a burst of static that grew
// with the age of the session and so never showed right after a reload. The
// phase is now integrated on the CPU in float64 (phase += dt * speed, see the
// frame loop), so a mood changes how FAST the field moves and never where it
// is. Handed over as a point on a circle of radius 64 rather than a growing z,
// so the coordinates stay small enough for float32 forever.
uniform vec3 uMotionAt;                // the surface noise and the plasma ribbons ride this
uniform vec3 uHueAt;                   // the colour bands ride this, at the mood's hue flow
// How many of fbm's four octaves run: 4 as designed, 2 in the lightest mode.
// A uniform and a loop break, never a second program, so switching modes
// costs a number and not a compile.
uniform float uOct;
uniform float uFlashPeriod;            // seconds; 0 = not flashing
uniform float uGrain;                  // point size multiplier the presence sets; 1 = as shipped
uniform float uMesh;                   // 0 = the fibonacci scatter, 1 = a lat/long grid of the same nodes
uniform float uCount;                  // how many nodes there are — the grid needs to know
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
varying float vDim;                    // 1 present .. 0 dimmed away — the dim move
varying float vMem;                    // 0 for ordinary dust; >0 for a memory
varying float vFlash;                  // 1, or the dim half of a flash
varying vec3 vPaintCol;
${SNOISE}
float fbm(vec3 p){
  float f=0.0, a=0.5;
  for(int i=0;i<4;i++){ if (float(i) >= uOct) break; f+=a*snoise(p); p*=2.02; a*=0.5; }
  return f;
}
${SHAPE_GLSL}
void main(){
  // CULLED NODES COST A VERTEX AND NOTHING ELSE — and now they really cost
  // nothing else. This test only needs aRank, and it used to sit at the END of
  // main(), after the surface and plasma noise had already run: at count 3,
  // with 99% of the field culled, nearly the whole vertex cost remained. Size 0
  // rasterises no fragments, and the position is pushed outside the clip volume
  // so a driver that clamps point size to a minimum of 1 cannot draw a stray
  // speck anyway; the varyings a culled node never writes are never read.
  if (aRank > uKeep) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 dir=normalize(position);
  // MESH. Every node sits on a fibonacci sphere, which is why nothing the body
  // does ever shows a LINE: the scatter is even by design. The reference reels
  // sample their surfaces on a lat/long grid, and their forms read as dotted
  // wireframes because of it. This blends the node's direction toward the
  // grid direction its index would have — row and column from the index walk
  // alone, no new attribute — and it is done HERE, before the noise, the
  // shape, the masks and the colour sweep read dir, so at mesh 9 all of them
  // agree on one geometry. The poles crowd, as a lat/long grid's do; that is
  // the look, not a flaw in it. The index is read from position.y, which the
  // remap does not touch.
  if (uMesh > 0.001) {
    // ONE NODE PER CELL. position.y IS the node's index here (the field is laid
    // out y = 1 - 2i/N), so every node gets its own square of the grid.
    float gi = clamp((1.0 - position.y) * 0.5, 0.0, 1.0) * (uCount - 1.0);
    float cols = 160.0, rows = ceil(uCount / cols);
    float th = (mod(gi, cols) + 0.5) / cols * 6.2831853;
    // LATITUDE DESCENDS WITH THE INDEX, as the field's own does: row 0 is the
    // north pole. It used to ascend, which sent every node to its MIRRORED
    // latitude — dir and gdir near-antipodal, their lerp passing through the
    // origin. At uMesh 5, 28% of the field had no direction left to normalise
    // and scattered (measured); the finished grid looked right either way, so
    // only the dial between them was broken, which is the whole dial.
    float ph = (0.5 - (floor(gi / cols) + 0.5) / rows) * 3.14159265;
    vec3 gdir = vec3(cos(ph) * cos(th), sin(ph), cos(ph) * sin(th));
    dir = meshSlerp(dir, gdir, uMesh);
  }
  float n=fbm(dir*uFreq+uMotionAt);
  // sharp radial jitter when "glitch" is high
  float g=uGlitch*sin((aRand*40.0)+uTime*8.0)*step(0.7,fract(aRand*13.0+uTime*0.5));
  float disp=n*uAmp*(1.0+uAudio*1.6)+g*0.25;
  gShade = clamp(disp*1.5+0.5,0.0,1.0);   // the light, for @lit — the same number vShade gets below, needed before the ladder runs
  vec3 pos=dir*(uRadius+disp);
  // THE POSTURE. Off by default and free when off — one uniform compare. The
  // mood's own displacement rides ALONG the new surface rather than being
  // replaced by it, so a shape that is excited still trembles.
  if (uShapeMix > 0.001) {
    float u = clamp((1.0 - position.y) * 0.5, 0.0, 1.0);   // == i/(COUNT-1), exactly
    // Hoisted: wave and @wedge both want it, and atan(0,0) at the two poles —
    // where the fibonacci radius is exactly 0 — is undefined in the spec.
    float az = atan(dir.z, dir.x + 1e-6);
    // TWO STATEMENTS, NEVER ONE EXPRESSION. gRadial is written by shapeForm and
    // read here, and GLSL does not specify the evaluation order of operands —
    // shapeForm(...) + dir * disp * gRadial may legally read gRadial BEFORE the
    // call that sets it, which compiles, runs, and is wrong on some drivers only.
    vec3 fp = shapeForm(dir, u, uRadius, aRand);
    fp += dir * (disp * gRadial);
    fp = shapeApply(fp, dir, u, uShapeTime, aRand, az, uRadius);
    // NaN can only enter through a form's own arithmetic, and IEEE says every
    // comparison against NaN is false — so a poisoned node fails BOTH of these
    // and goes home, alone, instead of taking the frame with it.
    float q = dot(fp, fp);
    fp = (q > 1e-8 && q < 16.0) ? fp : dir * uRadius;
    // RADIAL, never a box: fitCamera fits a sphere of 1.6, and the corner of a
    // 1.55 box sits at 2.68 — 68% outside the frame.
    // AND IT GROWS WITH THE BODY. 1.45 was written for swell 1, and it capped
    // every SHAPE there while the bare orb went to 1.8 under two open hands:
    // size 9 on a super read as size 6. 1.32 * uRadius is 1.45 at the largest
    // resting radius (excited, 1.10); the min, because 1.32 * 1.98 = 2.6 would
    // put a cube's corner through the room's 2.2 ceiling. Same line in the web.
    float L = length(fp);
    float C = min(2.1, max(1.45, 1.32 * uRadius)); fp *= (L > C) ? (C / L) : 1.0;
    // SCATTER, after the clamp on purpose. The clamp fits a SPHERE of 1.45 and
    // the frame is a RECTANGLE (halfW is 2.84 at 16:9): released inside the
    // clamp a scatter is a slightly bigger orb and nothing else. Each node goes
    // to its own place in the frame, by its own random, and stays there — so
    // with flow it drifts and with a trail it is the star field Colin saw.
    //
    // THREE RANDOMS THAT DO NOT KNOW EACH OTHER. The first version took x from
    // aRand and y from fract(aRand * 7.31) — which is a FUNCTION of x, a
    // sawtooth, so every point lay on one of seven slanted line segments and
    // 'scatter 9' drew stripes across the room instead of a field. Seen, not
    // reasoned. fract(k * r) is fine for a jitter (the lattice, the butterfly's
    // thickness) and wrong for a placement. The sin hash is the one the web
    // already hashes its own randoms with, and it is chaotic in its argument.
    float sr2 = fract(sin(aRand * 12.9898) * 43758.5453);
    float sr3 = fract(sin(aRand * 78.2330) * 43758.5453);
    fp = mix(fp, vec3((aRand - 0.5) * 2.0 * uScatter.y, (sr2 - 0.5) * 2.0 * uScatter.z, (sr3 - 0.5) * 0.6), uScatter.x);
    pos = mix(pos, fp, uShapeMix);
  }

  // ---- CONDENSE, and WHERE IT IS -------------------------------------------
  // The collapse happens after the posture, so a shape can condense as a shape.
  // The offset is last, because it moves whatever the body has become.
  pos = mix(pos, vec3(0.0), uCondense);
  // THE PINCH, last of the shaping: it moves whatever the body has become,
  // including a shape, which is what makes it feel like touching the thing on
  // screen rather than a sphere that happens to be underneath it.
  pos += pinchPull(dir);
  pos += uOffset;
  vec4 mv=modelViewMatrix*vec4(pos,1.0);

  // Plasma ribbons: narrow bright bands of energy that flow across the body when
  // uPlasma>0 — sharp peaks (high pow) leave dark gaps so they read as ribbons.
  // Under ONE uniform branch: outside the plasma form this fbm was a third of
  // the whole vertex cost, computed for every node and then multiplied by zero.
  // (uMotionAt*0.6 is the old t*0.6: the same circle, walked at 0.6 the pace.)
  vRibbon=0.0;
  if (uPlasma > 0.001) {
    float flow=fbm(dir*2.4+vec3(0.0,uTime*0.22,0.0)+uMotionAt*0.6);
    float ribbon=sin(dir.y*9.0 + dir.x*3.0 + uTime*0.9 + flow*4.0);
    vRibbon=pow(max(ribbon,0.0),6.0)*uPlasma;
  }

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
  gl_PointSize=uSize*0.75*uGrain*(1.0+uAudio*0.6)*(uPointK/-mv.z)*(0.80+aRand*0.40)*(1.0+vRibbon*0.7);
  // Every form that gathers the cloud inward raises points-per-pixel, and the
  // comment above says exactly where that ends: the sphere goes white. Rather
  // than a per-shape table — which cannot know about a move that gathers, and
  // was measured ~6x too generous on lattice anyway — each node pays for its
  // OWN compression, by how far in it actually travelled. Free, and it cannot
  // be wrong about a form nobody has written yet.

  gl_PointSize*=mix(1.0, clamp(length(pos)/max(uRadius,1e-3), 0.30, 1.0), uShapeMix);
  gl_PointSize*=mix(1.0, gSize, uShapeMix);   // a thin form (a lune, a knot) packs the field small and would bloom white
  // Condense needs its own, deeper floor. The line above exists because gathering
  // the cloud raises points-per-pixel until the sphere goes white, and it bottoms
  // out at 0.30 — which is right for a posture and nowhere near enough for a full
  // collapse, where every surviving node lands in the SAME place. Culling is the
  // real answer (uKeep), and this is what keeps the in-between honest.
  gl_PointSize*=mix(1.0, 0.16, uCondense);
  // (the rank cull that used to sit here is the first line of main() now)
  gl_Position=projectionMatrix*mv;

  // Independent per-node hue: a flowing field over the surface, widened by the
  // mood's hueRange. Bands wrap the body via the latitude sweep + the noise.
  // uHueAt is the hue phase integrated on the CPU — the same fix as uMotionAt,
  // for the same static: uTime*uHueFlow jumped the bands on every mood change.
  float band=fbm(dir*uCFreq+uHueAt);
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
  // THE COLOUR WORDS RIDE THE FORM'S OWN ARRIVAL. The ladder only runs while
  // uShapeMix > 0, but the moment it does the accumulators are at full value —
  // so a hue landed in one frame while the form it belonged to was still
  // gliding in, and after 'once' it stayed. Scaled by the mix at every spend,
  // the colour eases in with the shape and eases out when the shape is let go.
  // Line 1: body.js owns the transition, and until now it owned it for position
  // alone.
  hue += gHue * uShapeMix;               // the hue move, in turns — see gHue
  vHue=fract(hue);
  vSat=mix(uSat, mix(0.05,0.95,spk), uSpeckle);
  vVal=uVal;
  // the sat and bright moves, pushes toward an extreme; clamped so a 9 stays a
  // colour rather than white or nothing
  vSat=clamp(vSat + gSat * uShapeMix, 0.0, 1.0);
  vVal=clamp(vVal * (1.0 + gVal * uShapeMix * 0.9), 0.0, 1.0);
  vDim=clamp(1.0 - gDim * uShapeMix, 0.0, 1.0);        // the dim move, spent in the fragment as alpha
  // THE FLASH: on for half the period, dim (not gone — the core stays) for the
  // other half. Computed here from uTime so the fragment needs no clock.
  vFlash = uFlashPeriod > 0.0 ? mix(0.05, 1.0, step(0.5, fract(uTime / uFlashPeriod))) : 1.0;
  vPaintCol=tone(hueSpin(aColor, gHue * uShapeMix * 6.2831853), gSat * uShapeMix, gVal * uShapeMix);   // the same words work a painting
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
varying float vDim;                    // 1 present .. 0 dimmed away — the dim move
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
  float alpha=edge*(0.40+0.60*vShade)*uDotFade*vFlash*vDim;
  alpha=max(alpha, edge*vRibbon*0.85*vDim);   // ribbons glow even through faded dots — but not through a dimmed part
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
  // THE ENCODE, so the glow-off path shows the colours the glow-on one does.
  // With the bloom on, everything is drawn into the composer's target and the
  // bloom's last copy sRGB-encodes the whole frame; with it off (the lighter
  // graphics modes) the scene goes straight to the screen and this fragment
  // was written raw — 0.5 showed as 0.5 instead of ~0.74, a darker, muddier
  // orb exactly when the machine was already struggling. three makes this an
  // identity into any render target (composer, trail) and the sRGB encode onto
  // the screen, so the glow-on look is untouched to the bit.
  #include <colorspace_fragment>
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

// A small seeded random (mulberry32). The panel tones are jittered, and the
// jitter used to be Math.random — so every redraw rolled new tones, and
// dragging a Room slider made the walls flicker panel by panel sixty times a
// second. Seeded per face, a redraw changes what the slider changed and
// nothing else.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Machined panel albedo: per-panel tone jitter + recessed seams + a 1px chamfer
// catch-light (5% white on a dark albedo — can never approach the bloom threshold).
// `into`: an existing panel texture to REDRAW rather than replace. Same canvas,
// same size, so the upload takes the sub-image path and the material keeps
// its map — no new 4MB canvas, no new GPU texture, no program check.
function panelTexture(renderer, { px = 1024, panels = 4, base = 74, jitter = 5, seam = 30, seed = 1 } = {}, into = null) {
  const c = into ? into.image : document.createElement('canvas');
  if (!into) c.width = c.height = px;
  px = c.width;
  const g = c.getContext('2d');
  const rnd = seededRandom(seed);
  const step = px / panels;
  for (let i = 0; i < panels; i++) for (let j = 0; j < panels; j++) {
    const v = base + Math.round((rnd() * 2 - 1) * jitter);
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
  // (the opaque panel fill above repaints every pixel first, so a redraw never
  // stacks the translucent catch-light on the last one)
  if (into) { into.needsUpdate = true; return into; }
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

uniform float uAmp,uFreq,uRadius,uAudio;
uniform vec3 uMotionAt;                 // the body's own noise phase (see VERT), by reference
uniform float uOct;                     // and its octave ceiling, so the web never out-details the dots
uniform float uMesh,uCount;             // the mesh remap, shared by reference with the body
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
varying float vDimL;                   // the dim move, carried to the web — see LINE_FRAG
${SNOISE}
float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<4;i++){ if (float(i) >= uOct) break; f+=a*snoise(p); p*=2.02; a*=0.5; } return f; }
${SHAPE_GLSL}
void main(){
  vec3 dir=normalize(position);
  vec3 dir0=dir;                        // the index is read from here, below, untouched by the mesh
  // MESH. Every node sits on a fibonacci sphere, which is why nothing the body
  // does ever shows a LINE: the scatter is even by design. The reference reels
  // sample their surfaces on a lat/long grid, and their forms read as dotted
  // wireframes because of it. This blends the node's direction toward the
  // grid direction its index would have — row and column from the index walk
  // alone, no new attribute — and it is done HERE, before the noise, the
  // shape, the masks and the colour sweep read dir, so at mesh 9 all of them
  // agree on one geometry. The poles crowd, as a lat/long grid's do; that is
  // the look, not a flaw in it. The index is read from position.y, which the
  // remap does not touch.
  if (uMesh > 0.001) {
    // THE SAME GRID, REACHED BY DIRECTION. These vertices are NOT the field's
    // nodes — the web is its own 800-point sphere and the memory edges move
    // every frame — so position.y is not an index here and the body's index
    // remap is meaningless on them: it read a latitude, invented a longitude
    // from it, and flung each endpoint up to 179 degrees away (measured), which
    // turned every edge into a chord straight through the orb. Snapping to the
    // nearest cell of the same grid moves an endpoint at most half a cell (1.2
    // degrees), so an edge stays an edge and both layers land on one lattice.
    float cols = 160.0, rows = ceil(uCount / cols);
    float ph0 = asin(clamp(dir.y, -1.0, 1.0));
    float th0 = atan(dir.z, dir.x);
    float row = clamp(floor((0.5 - ph0 / 3.14159265) * rows), 0.0, rows - 1.0);
    float col = floor(fract(th0 / 6.2831853) * cols);
    float th = (col + 0.5) / cols * 6.2831853;
    float ph = (0.5 - (row + 0.5) / rows) * 3.14159265;
    vec3 gdir = vec3(cos(ph) * cos(th), sin(ph), cos(ph) * sin(th));
    dir = meshSlerp(dir, gdir, uMesh);
  }
  float n=fbm(dir*uFreq+uMotionAt);      // the same phase as the dots, so the lattice flexes with them
  float disp=n*uAmp*(1.0+uAudio*1.6);
  vSh=clamp(disp*1.5+0.5,0.0,1.0);
  gShade = vSh;                         // the light, for @lit — the web's disp has no glitch term, so its @lit is a hair off the dots'
  vW=aW;
  vec3 pos=dir*(uRadius+disp);
  if (uShapeMix > 0.001) {
    // The constellation is a different, sparser sphere with no aRand attribute,
    // so its randomness is hashed from the direction. Same stack, same clock,
    // same clamp — the web moves with the body instead of hanging around it.
    float u = clamp((1.0 - dir0.y) * 0.5, 0.0, 1.0);   // dir0, not dir: the mesh remap must not move a node's INDEX
    float rnd = fract(sin(dot(dir, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float az = atan(dir.z, dir.x + 1e-6);
    vec3 fp = shapeForm(dir, u, uRadius, rnd);   // two statements — see the dots shader
    fp += dir * (disp * gRadial);
    fp = shapeApply(fp, dir, u, uShapeTime, rnd, az, uRadius);
    float q = dot(fp, fp);
    fp = (q > 1e-8 && q < 16.0) ? fp : dir * uRadius;
    float L = length(fp);
    float C = min(2.1, max(1.45, 1.32 * uRadius)); fp *= (L > C) ? (C / L) : 1.0;   // grows with the body — see the dots shader
    // THE WEB STANDS DOWN when the body is let go of. Its randoms are hashed
    // from direction (it has no aRand), so its endpoints would scatter to
    // places the dots are not — a lattice strung between nothing. Culled the
    // way the dots cull a node past uKeep: parked outside clip space.
    if (uScatter.x > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    pos = mix(pos, fp, uShapeMix);
  }

  pos = mix(pos, vec3(0.0), uCondense);
  // THE PINCH, last of the shaping: it moves whatever the body has become,
  // including a shape, which is what makes it feel like touching the thing on
  // screen rather than a sphere that happens to be underneath it.
  pos += pinchPull(dir);
  // THE WEB FOLLOWS A DIMMED BODY. Every colour accumulator is computed here
  // too, because the ladder is shared — but uLineColor is a scheme constant, so
  // no colour word reached the constellation and 'dim 9' left a fully lit web
  // hanging in the air where the body had been. dim is the one worth carrying:
  // a hue on the web would be a second palette, a dim is the web going with it.
  vDimL = clamp(1.0 - gDim * uShapeMix, 0.0, 1.0);
  pos += uOffset;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
}`;
const LINE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uLineColor; uniform float uLineOpacity;
varying float vSh;
varying float vW;
varying float vDimL;                   // the dim move, carried to the web — see LINE_FRAG
// vW is 1 for the constellation, so its term vanishes and the web is untouched.
// For a memory edge it is the cosine between two memories, floored so the
// weakest link this graph kept is still legible rather than a guess at a line.
void main(){
  float w = 0.45 + 0.55 * vW;
  gl_FragColor=vec4(uLineColor*(0.5+0.7*vSh)*w, uLineOpacity*(0.3+0.7*vSh)*w*vDimL);
  #include <colorspace_fragment>   // as in FRAG: identity into a target, sRGB onto the screen
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

// THE WINDOW'S OWN CONSTANTS.
//
// Head-coupled parallax is a vestibular trigger for some people, so reduced
// motion caps it hard rather than merely slowing it. Read once, at module
// scope, the way motion.js and mercury.js already read it.
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// World units per unit of head deviation, at the slider's top. Tuned by eye is
// the honest description: we cannot know the physical size of the screen, so
// this is a fudge factor with a dial on it, not a calibration.
const EYE_GAIN_MAX = 0.06;
const EYE_GAIN_REDUCED = 0.012;   // a hint of depth, not a swing
const EYE_Z_SHARE = 0.5;          // depth is the noisiest axis; it moves half as far
const EYE_HOME_S = 0.4;           // the ease back to centre when the face goes
const EYE_LEAD = 1 / 60;          // one frame of extrapolation, no more
// How tightly a pinch holds. The von Mises concentration: bigger is a smaller
// patch of the body moving. 9 is about a fist's worth of surface at the
// default radius — enough to read as taking hold of a PART of it.
const PINCH_REACH = 9;
const EYE_BASE_N = 24;            // samples averaged into "where their head rests"

// THE NAME DOES NOT GO INTO THE ROOM. Turned off at Colin's word — "too complex
// to get right at the moment" — and he is right, because the window broke it.
//
// brandLayer draws the wordmark twice inside the 3D scene: a black alphaTest
// plane that writes depth so the orb can pass in front of it, and the mark's
// own chrome added after the composer. BOTH are positioned with
// tan(fov/2) * aspect — the arithmetic of a SYMMETRIC frustum. The window
// replaces the projection with a hand-written asymmetric one and moves the
// camera off centre, so those two planes stop landing on the same pixels and
// the black one slides out from under the chrome. That is "the shadow on the
// logo", and it tracks the viewer's head, which is the tell.
//
// Off, the DOM canvas simply keeps drawing the mark, as it does with the bar
// open. The cost is the one effect this bought: the orb no longer passes in
// FRONT of the name when the top bar is folded. That is a fair trade for a mark
// with no shadow, and it is one constant to reverse — but whoever reverses it
// has to project both planes through camera.projectionMatrix rather than
// re-deriving a frustum that is no longer symmetric.
const BRAND_IN_ROOM = false;

export function createBody(container) {
  const scene = new THREE.Scene();
  // FAR = 220, NOT 100. The skydome sits at SKY_R = 92 (environments.js) and
  // fitCamera pulls the camera back along +z to fit the orb into whichever FOV
  // axis is tighter. In the full room that is ~4.6 and the far side of the dome
  // is at 96.6: inside 100, fine. In Code the orb keeps a COLUMN, the aspect
  // falls below ~0.5, the camera goes out past 8 — and the dome behind the orb
  // crossed the far plane and was CLIPPED: a dark polygon the size of the
  // column, centred on the orb, with the foreground stars still drawn around
  // it because they are nearer. Colin: "this black void thing around your orb,
  // only on the kode page". A 240px column in a 1400px-tall window puts the
  // camera at ~24 and the dome's far side at ~116; 220 leaves room for that
  // and for any column the layout can make. Depth precision is not a concern
  // at this near plane (24-bit buffer, the orb lives within a few units).
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
  camera.position.set(0, 0, 4.6);

  // ---- THE WINDOW ----------------------------------------------------------
  // The screen is a window, not a camera. This sits HERE, immediately under the
  // camera it describes, and not down with the rest of the frame state — twice
  // now the rule has been written as "above the frame loop" and twice that has
  // been too weak. The real rule is ABOVE THE FIRST READER, and fitCamera is a
  // reader: it writes the window rect, and it runs inside resize() during
  // setup, long before the loop starts. Declared any lower, `win` is in its
  // temporal dead zone when resize() first calls fitCamera, createBody throws,
  // Y3K is never defined, and the entire app is a black screen with one line in
  // the console. That is exactly how this landed the first time it was written.
  const win = { dist: 0, halfW: 0, halfH: 0, left: 0, right: 0, top: 0, bottom: 0, moved: false };   // the rectangle, set by fitCamera
  // ---- THE FRAME -----------------------------------------------------------
  // The part of the canvas the body is FRAMED in. Normally all of it. In Code
  // the canvas keeps the whole window — so the sky runs behind the coding pane
  // with no seam — and the body is framed in the orb's column at the right,
  // at the size that column gives it. The stylesheet owns where the column is
  // (#orb-frame, a fixed, invisible element laid out exactly as the column);
  // this measures it against the canvas and nothing else.
  //   win.halfW/halfH are the FRAME at the glass (the body's own pane, as
  //   before); win.left/right/top/bottom are the CANVAS's edges at the glass
  //   with the body at 0. With the whole canvas framed they are ±halfW/±halfH
  //   and every matrix below is the one three would build — the identity
  //   test/window.test.mjs holds. Framed, the frustum is off-axis: the same
  //   sixteen floats setOffAxis already writes for a moved head, with the
  //   canvas edges in place of the pane's.
  //   Before Code lived here the stage itself shrank to the column; the body
  //   was the same size, but the sky was cut off at the column's edge against
  //   an opaque pane (Colin: "a hard break of the background"), and the far
  //   plane clipped the dome (see the camera above).
  const framing = { x0: 0, y0: 0, x1: 1, y1: 1, el: null, key: '' };   // fractions of the canvas
  const framed = () => framing.x0 > 0 || framing.y0 > 0 || framing.x1 < 1 || framing.y1 < 1;
  // THE FRAME IN WINDOW PIXELS: where the body's own pane is on screen, for
  // everything that turns a pointer, a fingertip or a followed hand into a
  // place on the body. Before the frame existed these all measured the canvas
  // and assumed the body sat at its centre, in the canvas's own coordinates —
  // and in Code, where the canvas was the orb's column, that put the body
  // ~180px from the left of the window while it was drawn ~1100px across:
  // every hand gesture on the orb aimed at empty air. Colin: "the 'show your
  // hands' hand-tracking feature doesn't work in the kode page."
  function frameRect() {
    const el = renderer.domElement;
    const c = el.getBoundingClientRect();
    const w = el.clientWidth || c.width || window.innerWidth || 800;
    const h = el.clientHeight || c.height || window.innerHeight || 600;
    const fw = Math.max(1, (framing.x1 - framing.x0) * w), fh = Math.max(1, (framing.y1 - framing.y0) * h);
    return { cx: c.left + ((framing.x0 + framing.x1) / 2) * w, cy: c.top + ((framing.y0 + framing.y1) / 2) * h, w: fw, h: fh };
  }
  // Measure #orb-frame against the canvas. Returns true when the frame moved.
  function readFrame(W, H) {
    if (!framing.el) framing.el = document.getElementById('orb-frame');
    let x0 = 0, y0 = 0, x1 = 1, y1 = 1;
    const el = framing.el;
    if (el && getComputedStyle(el).display !== 'none') {
      const r = el.getBoundingClientRect();
      const c = renderer.domElement.getBoundingClientRect();
      if (r.width > 8 && r.height > 8 && c.width > 0 && c.height > 0) {
        x0 = Math.max(0, Math.min(1, (r.left - c.left) / c.width));
        x1 = Math.max(0, Math.min(1, (r.right - c.left) / c.width));
        y0 = Math.max(0, Math.min(1, (r.top - c.top) / c.height));
        y1 = Math.max(0, Math.min(1, (r.bottom - c.top) / c.height));
        if (!(x1 - x0 > 0.02) || !(y1 - y0 > 0.02)) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
      }
    }
    const key = `${x0.toFixed(4)}|${y0.toFixed(4)}|${x1.toFixed(4)}|${y1.toFixed(4)}|${W}|${H}`;
    if (key === framing.key) return false;
    framing.key = key;
    framing.x0 = x0; framing.y0 = y0; framing.x1 = x1; framing.y1 = y1;
    return true;
  }
  // HOW FAR FROM THE CENTRE THE BODY CAN BE PUT and still be mostly on the
  // glass: the frame's half-extent at the body's depth, less most of a radius.
  // 9 on either axis is this. Falls back to a laptop's numbers before the first
  // fitCamera has measured anything.
  // THE GLASS, not the frame. The camera's frame runs to the screen's edge, but
  // the four bars sit over its edges, and "9 is the edge" meant nothing if 9
  // put the body under the right-hand rail — which on a narrow pane it did.
  // So the reach is the frame scaled by how much of each axis is glass once
  // the bars are taken out, read from the same --hole-* variables history.js
  // measures the conversation against. Refreshed when the body's classes or
  // the canvas change (folding a rail changes the hole with no resize), which
  // is a string compare a frame and a getComputedStyle a few times a minute.
  // If one rail is folded the glass is off-centre and the centre digit stays
  // the canvas centre — the orb's home — which is the less surprising of the
  // two answers. The scatter's room is fitted from the same glass (fitScatter,
  // below), for the same reason: a released point should stay where it can be seen.
  const glass = { x: 1, y: 1, cls: null, w: 0, h: 0 };
  function refreshGlass(force = false) {
    const el = renderer.domElement;
    const W = el.clientWidth || window.innerWidth || 1, H = el.clientHeight || window.innerHeight || 1;
    const cls = document.body.className;
    if (!force && cls === glass.cls && W === glass.w && H === glass.h) return;
    glass.cls = cls; glass.w = W; glass.h = H;
    // The frame moves with the same two things (the body's classes, the size),
    // so it is measured here; a frame that moved refits the seat — fitCamera
    // calls back with force, and finds the frame unchanged the second time.
    const moved = readFrame(W, H);
    const cs = getComputedStyle(document.body);
    const px = (v) => { const n = parseFloat(cs.getPropertyValue(v)); return Number.isFinite(n) ? n : 0; };
    // THE GLASS IS THE FRAME LESS THE BARS THAT OVERLAP IT. Unframed, that is
    // the old sum: the canvas less the four rails. Framed in Code's column,
    // the right rail is already outside the frame and the left one is far
    // away, so neither takes anything; the top and bottom bars still do.
    const fl = framing.x0 * W, fr = framing.x1 * W, ft = framing.y0 * H, fb = framing.y1 * H;
    const gl = Math.max(fl, px('--hole-l')), gr = Math.min(fr, W - px('--hole-r'));
    const gt = Math.max(ft, px('--hole-t')), gb = Math.min(fb, H - px('--hole-b'));
    glass.x = Math.max(0.3, (gr - gl) / Math.max(1, fr - fl));
    glass.y = Math.max(0.3, (gb - gt) / Math.max(1, fb - ft));
    if (moved && !force && win.dist > 0) { win.moved = true; fitCamera(); }   // (dist = 0: before the first resize, nothing to refit)
  }
  // HOW NEAR, as a scale. The depth digit is kept like a place — a digit, turned
  // into world units every frame — and 4.5 is the glass (scale 1), 9 half the
  // distance to the person (scale 2, so twice the size), 0 twice as far (half).
  // z = dist (1 - 1/s) is the plane where the same body looks s times its size.
  // The near-plane guard runs every frame because the radius rides the mood:
  // 'size 9 depth 9 excited' would otherwise pass through the seat on a laptop.
  const depthScale = () => Math.pow(2, ((depthDigit ?? 4.5) - 4.5) / 4.5);
  function depthZ() {
    if (!(win.dist > 0)) return 0;
    const z = win.dist * (1 - 1 / depthScale());
    return Math.min(z, win.dist - 1.6 * (uniforms.uRadius.value + uniforms.uAmp.value) - 0.3);
  }
  // the frame at depth z, as a fraction of the frame at the glass: a body that
  // comes forward has less room around it, and the reach and the scatter's
  // room shrink with it, so 'at 9 5 depth 9' is still inside the glass
  const depthK = (z) => (win.dist > 0 ? (win.dist - z) / win.dist : 1);
  const reachX = (z = 0) => Math.max(0.6, (win.halfW || 2.4) * glass.x * depthK(z) - uniforms.uRadius.value * 0.6);
  // far back the frame outgrows the room: at depth 0 the reach would be 3.4
  // against a ceiling at 2.2, so the room's half-height caps it
  const reachY = (z = 0) => Math.min(ROOM_HALF_H - uniforms.uRadius.value - 0.1, Math.max(0.4, (win.halfH || 1.35) * glass.y * depthK(z) - uniforms.uRadius.value * 0.6));
  // the scatter's room: the glass AT THE BODY'S DEPTH, from the eased offset,
  // so a released field stays in view through the glide. Written every frame
  // from aimOffset — refreshGlass is cached on the class and the size, and a
  // glide changes neither.
  function fitScatter() {
    const kz = depthK(offWorld.z);
    uniforms.uScatter.value.y = Math.max(0.5, win.halfW * glass.x * kz - 0.15);
    uniforms.uScatter.value.z = Math.max(0.4, win.halfH * glass.y * kz - 0.15);
  }
  // FLYING FIRST, THEN A PLACE, THEN NOTHING — and the depth under all three.
  // Written into the TARGET, so the
  // lerp in frame() still owns the arrival: 'at 9 5' glides there and a landing
  // glides back, at the same k as every mood key. A figure of eight is a 1:2
  // Lissajous — cos on x, sin of twice the angle on y — which crosses itself
  // once in the middle and reads as flight rather than as orbit; a circle is
  // the 1:1, counterclockwise. EVERY FLIGHT IS AROUND THE PLACE: the place is
  // its centre, and it is fitted to the room left on each side of it, so
  // 'at 7 5 circle 9 4' is a lap that reaches the glass's edge and no further.
  //
  // ONE RATE TABLE FOR THE LOOPS, the eight and the circle alike: R to radians
  // a second, 3 a slow lap (12 s round), 9 a dart (5 s). The lerp at k rounds
  // any figure faster than the pace — under settle a dart comes out smaller;
  // that is the body arriving, not a fault, and the lesson says so.
  const LOOP_RATE = (R) => 0.15 + 0.12 * R;
  // THE ONE FLIGHT IN HZ: a bounce is a period, not an angle — R3 a lazy ball
  // every 2.6 s, R9 0.87 Hz. Lowered from a first guess so the rebound's cusp
  // still survives at surge; under settle it is rounded off by R6, and the
  // rate is NOT coupled to the pace — that would be authoring the transition.
  const BOUNCE_HZ = (R) => 0.15 + 0.08 * R;
  // the wander's, radians a second on the slowest of its four sines: 3 a
  // stroll, 9 a moth
  const WANDER_RATE = (R) => 0.05 + 0.04 * R;
  const FLIGHT_RATE = { eight: LOOP_RATE, circle: LOOP_RATE, bounce: BOUNCE_HZ, wander: WANDER_RATE };
  const FLIGHT_WORD = { eight: 'fly', circle: 'circle', bounce: 'bounce', wander: 'wander', follow: 'follow' };   // the kind, in the presence's word
  //
  // Called by the frame loop every frame (the flight moves, and the frame's
  // shape can change) AND by the setters the moment a word lands, so the target
  // is right immediately rather than one frame later — which mattered exactly
  // once, on a throttled tab, and was confusing enough then to fix.
  // A function declaration: hoisted, so frame() may call it from above.
  function aimOffset() {
    refreshGlass();
    const z = depthZ();                 // the depth first: the reach is measured at it
    const rx = reachX(z), ry = reachY(z);
    const cx = placeDigits ? ((placeDigits[0] - 4.5) / 4.5) * rx : 0;   // the place, or the centre
    const cy = placeDigits ? ((placeDigits[1] - 4.5) / 4.5) * ry : 0;
    if (flying) {
      const ph = flying.r * (Date.now() - flying.t0) / 1000;
      if (flying.kind === 'circle') {
        const rho = flying.w * Math.min(rx - Math.abs(cx), ry - Math.abs(cy));   // the near side binds
        fieldTarget.off.set(cx + rho * Math.cos(ph), cy + rho * Math.sin(ph), z);
      } else if (flying.kind === 'bounce') {
        // A BALL: u runs -1..1 each period and the body sits h u^2 below its
        // place — gravity's own curve, a smooth apex AT the place and the cusp
        // at the floor, where u wraps. h is H ninths of the room BELOW the
        // place, so a bounce said low is a small one.
        const u = 2 * (ph % 1) - 1;
        const h = flying.h * (ry + cy);
        fieldTarget.off.set(cx, cy - h * u * u, z);
      } else if (flying.kind === 'wander') {
        // NOWHERE TO BE: two incommensurate sines per axis, phases hashed from
        // t0, so a reload starts a different walk and a late viewer gets its
        // own — honest for a wander. 0.5 (sin + sin) reaches the edge only at
        // a coincidence and wander 9 read as 7, so it is 0.6, and CLAMPED to
        // the reach because the pair passes it there.
        const p = (flying.t0 % 6283) / 1000;
        const ax = flying.w * (rx - Math.abs(cx)), ay = flying.w * (ry - Math.abs(cy));
        const wx = 0.6 * (Math.sin(ph + p) + Math.sin(1.618 * ph + 2 * p));
        const wy = 0.6 * (Math.sin(1.318 * ph + 3 * p) + Math.sin(0.786 * ph + 4 * p));
        fieldTarget.off.set(cx + Math.max(-ax, Math.min(ax, ax * wx)), cy + Math.max(-ay, Math.min(ay, ay * wy)), z);
      } else if (flying.kind === 'follow') {
        // COME WITH YOU. The source's point on the screen, brought to the
        // body's own depth (the inverse of orbPx), and the body stops a STEP
        // SHORT of it: 1.3 radii back along the line from where the body IS,
        // so from far it approaches, from too near it backs away, and a step
        // away it rests — a cat, not a magnet. Clamped to the reach like a
        // place. No source, or nothing seen: the last target is HELD — never
        // home, never hunting. FROZEN while a hand has hold of it — a pinch,
        // or fingers on it — so a following body can still be taken hold of,
        // and it resumes on release. A pull through try/catch, like the eye.
        const src = followSources[flying.src];
        let s = null;
        try { s = src ? src() : null; } catch { s = null; }
        const held = !!(pinches[0] || pinches[1] || handPush.held);
        if (!held && s && s.ok && Number.isFinite(s.x) && Number.isFinite(s.y)) {
          const f = frameRect();   // the body's pane on screen (see frameRect)
          const sx = ((s.x - f.cx) / (f.w / 2)) * (win.halfW || 2.4) * depthK(z);
          const sy = -((s.y - f.cy) / (f.h / 2)) * (win.halfH || 1.35) * depthK(z);
          const dx = sx - offWorld.x, dy = sy - offWorld.y, L = Math.hypot(dx, dy);
          const stand = 1.3 * (uniforms.uRadius.value + uniforms.uAmp.value);
          const tx = L > 1e-6 ? sx - (dx / L) * stand : offWorld.x;
          const ty = L > 1e-6 ? sy - (dy / L) * stand : offWorld.y;
          flying.last = [Math.max(-rx, Math.min(rx, tx)), Math.max(-ry, Math.min(ry, ty))];
        }
        if (flying.last) fieldTarget.off.set(flying.last[0], flying.last[1], z);
        else fieldTarget.off.set(cx, cy, z);          // nothing seen yet: the place, or the centre
      } else {
        const ax = flying.w * (rx - Math.abs(cx)), ay = flying.h * (ry - Math.abs(cy));
        fieldTarget.off.set(cx + ax * Math.cos(ph), cy + ay * Math.sin(2.0 * ph), z);
      }
    } else if (placeDigits) {
      fieldTarget.off.set(cx, cy, z);
    } else {
      fieldTarget.off.z = z;            // a depth with no place: the centre, nearer or farther
    }
    fitScatter();
  }
  let eyeSource = null;        // () => { x, y, z, ok, age } — perceive's snapshot
  // HOW BIG THE BODY IS, as a multiplier on whatever the mood asked for. It
  // multiplies the radius TARGET rather than the live value, so it rides the
  // same ease as everything else and cannot fight it: a mood change still
  // arrives at its own pace, at the size the hands have set. Declared up here
  // with the rest of what the loop reads.
  let swell = 1;
  // THE HANDS ON THE BODY. Both of these are read by the frame loop, so both
  // are declared up here with the rest of what it touches.
  //
  // handPush is this frame's summed turn: every fingertip on the orb adds its
  // own movement, so five fingers sweeping left and two sweeping right leave
  // the body turning left, but slower — which is what would happen if you did
  // that to a real object, and is the whole reason the contributions are
  // SUMMED rather than averaged.
  // `n` counts MOVEMENTS this frame, `on` counts fingers resting on the body
  // whether or not the tracker had anything new to say about them. They are
  // separate because the frame loop runs at 60Hz and the hand model at 24 —
  // see handTouch below, which is the whole reason the body ever felt sticky.
  const handPush = { x: 0, y: 0, n: 0, on: 0, held: false };
  // Two pinches: an anchor on the body, and how far it has been dragged. Eased
  // home on release rather than snapped, because letting go of something
  // stretched is a thing that takes a moment.
  const pinches = [null, null];
  // A PALM HELD UP STOPS IT. Not a brake that slows it: the velocity is taken
  // away and the idle turn waits, so the body is simply still for as long as
  // the hand is there — which is what a hand held up in front of something
  // means everywhere else.
  let halted = false;
  const _iq = new THREE.Quaternion();
  const _invRig = () => _iq.copy(rig.quaternion).invert();
  const _pinchD = new THREE.Vector3();
  let eyeGain = 0;             // 0 = off. The slider writes this.
  let eyeSymmetric = true;     // is the projection currently three's own?
  const eyeFilt = createOneEuro3({ minCutoff: 0.3, beta: 0.1 });
  const eyeBase = { x: 0, y: 0, z: 0, n: 0 };    // where this person's head rests
  const eyeAt = { x: 0, y: 0, z: 0 };            // the offset actually applied

  // antialias:false is not a quality trade here — it is dead weight removal.
  // Every frame goes through the EffectComposer below, whose targets are their
  // own non-MSAA render targets. The only geometry ever rasterised into the
  // multisampled default framebuffer is the bloom pass's full-screen quads,
  // whose only edges are the edges of the screen. MSAA antialiases nothing,
  // while still costing a full-screen resolve and (on a phone's tile-based GPU)
  // a multisample attachment that has to survive a mid-frame round trip.
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setClearColor(0x04030a, 1);
  // NO SYNCHRONOUS SHADER CHECKS unless someone is debugging (?debug). With
  // the check on, three asks the driver for every program's link status and
  // info logs the first time it is used — each one a round trip that forces
  // that compile to finish right then, on the main thread, which turns every
  // first use of a material into a stall and defeats compileAsync below. The
  // price is that a shader that fails to compile says nothing in production:
  // add ?debug to the address and the logs come back.
  renderer.debug.checkShaderErrors = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
  // dpr 3 on a phone means 9x the fragments of dpr 1 — for a soft, glowing,
  // particle-based image that reads no sharper. 1.5 is the sweet spot.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, COARSE ? 1.5 : 2));
  container.appendChild(renderer.domElement);

  // ---- THE QUALITY PROFILE (gfx.js hands one to setQuality) ----------------
  // Declared HERE, under the renderer, because resize() reads it and resize()
  // runs during setup — the TDZ rule, which this file has learned the hard way
  // more times than any other. The defaults are the orb exactly as it shipped:
  // bloom on, the device's own pixel cap, every octave, every frame.
  const quality = {
    tier: 'mid',
    maxDpr: COARSE ? 1.5 : 2,   // the device-pixel-ratio cap for this canvas
    scale: 1,                    // render-resolution multiplier on top of the cap
    budget: 0,                   // drawing-buffer pixels allowed, 0 = no budget
    lite: false,                 // fewer octaves, no trail
    half: false,                 // every other due frame while a panel or Code is in front
  };
  // SMOOTH HOLDS THE DRAWING BUFFER UNDER ~2.3 MILLION PIXELS — about a
  // 1920x1200 screen at 1x. Above that (a 4K monitor, a 5K iMac) the scene
  // target, the room's PBR pass, a sky's per-pixel noise and the bloom all
  // scale with the pixel count, and on an integrated GPU fill is the wall; CSS
  // upscales the canvas for free, and the point size tracks the drawing buffer
  // (uPointK) so the orb keeps its coverage, only softer. Not applied above
  // smooth: gfx.js measured dpr 2 -> 1 at +0.7fps on a sync-bound machine, so
  // it is not worth the sharpness anywhere a frame is not already in trouble.
  const SMOOTH_BUDGET = 2.3e6;
  // The pixel ratio this canvas SHOULD have at w x h CSS pixels: the device's
  // ratio under the profile's cap (and never above a phone's 1.5), times the
  // profile's scale, inside the budget. With the defaults it is exactly the
  // setPixelRatio above. Compared with a tolerance (prChanged), so a ratio
  // that differs in the fourth decimal is not a reason to reallocate.
  function targetPixelRatio(w, h) {
    let pr = Math.min(window.devicePixelRatio || 1, quality.maxDpr, COARSE ? 1.5 : 2) * quality.scale;
    if (quality.budget > 0 && w > 0 && h > 0 && w * h * pr * pr > quality.budget) pr = Math.sqrt(quality.budget / (w * h));
    return Math.max(0.5, pr);
  }
  const prChanged = (pr) => Math.abs(pr - renderer.getPixelRatio()) > 0.005;

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
    map: panelTexture(renderer, { base: 111, jitter: 6, seam: 46, seed: 1 }), roughnessMap: brushedRoughnessTexture(renderer),
    metalness: 0.25, roughness: 0.78, envMapIntensity: 0.34, emissiveIntensity: 0.25,
  });
  const floorMat = mkFace({
    map: panelTexture(renderer, { base: 96, jitter: 4, seam: 40, seed: 2 }),
    roughnessMap: floorRingRoughness(renderer),
    metalness: 0.4, roughness: 0.55, envMapIntensity: 0.42, emissiveIntensity: 0.15,
  });
  const ceilMat = mkFace({
    map: panelTexture(renderer, { base: 90, jitter: 5, seam: 42, seed: 3 }),
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
  // warm: a world's shader programs are compiled in the background the first
  // time it is built (warmObject, with the rest of the warm-up further down;
  // only ever called after createBody has finished, so everything it names exists).
  const envs = createEnvironments({ scene, renderer, getOrb: () => rig, roomObjects: [room, edges], warm: (g) => warmObject(g) });
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
    { mat: wallMat, params: { base: 111, jitter: 6, seam: 46, seed: 1 } },
    { mat: floorMat, params: { base: 96, jitter: 4, seam: 40, seed: 2 } },
    { mat: ceilMat, params: { base: 90, jitter: 5, seam: 42, seed: 3 } },
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
  function setRoom({ brightness = 1, hue = 220, tint = 0, grooves = 1, glow = 1, env = 'room', eclipse = false } = {}) {
    eclipseDisc.visible = Boolean(eclipse);   // THE ECLIPSE, by choice (see its declaration)
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
    const g = Math.max(0, Math.min(2, Number.isFinite(+grooves) ? +grooves : 1));
    // THE PANELS ARE REDRAWN ONLY WHEN WHAT THEY SHOW HAS CHANGED, and at most
    // once a frame. Every Room slider sends ~60 inputs a second while it is
    // dragged, and each one used to build three new 1024px canvases, upload
    // them with mipmaps at 16x anisotropy, dispose the old ones and flag the
    // materials for a program check — ~12MB of garbage an event, for the hue,
    // tint and glow sliders too, which change a colour and an intensity and
    // not one texel. At boot the saved room (brightness 1, grooves 1 is what
    // createBody already drew) now costs nothing at all.
    if (b !== panelsAt.b || g !== panelsAt.g) {
      panelsWant.b = b; panelsWant.g = g;
      if (!panelsRaf) panelsRaf = requestAnimationFrame(redrawPanels);
    }
    const t = Math.max(0, Math.min(1, Number(tint) || 0));
    _wash.setRGB(1, 1, 1).lerp(_washHue.setHSL(((Number(hue) || 0) % 360) / 360, 0.6, 0.5), t * 0.6);
    for (const { mat } of roomFaces) mat.color.copy(_wash);   // a colour, not a program: no needsUpdate
    glowScale = Math.max(0.3, Math.min(2.5, Number(glow) || 1));
    orbAmbient.intensity = 0.40 * glowScale;
    // the frame loop keeps the point light breathing with the voice, and now
    // multiplies this in: it used to overwrite it with 4 + audio*4 every frame,
    // so the glow slider never reached the point light at all
    orbLight.intensity = 4.0 * glowScale;
  }
  // What the panel canvases were last drawn with, and what they should be.
  const panelsAt = { b: 1, g: 1 };   // createBody draws the stock look: brightness 1, grooves 1
  const panelsWant = { b: 1, g: 1 };
  let panelsRaf = 0;
  const _wash = new THREE.Color(), _washHue = new THREE.Color();
  function redrawPanels() {
    panelsRaf = 0;
    const b = panelsWant.b, g = panelsWant.g;
    if (b === panelsAt.b && g === panelsAt.g) return;
    for (const { mat, params } of roomFaces) {
      const base = Math.min(235, Math.round(params.base * b));
      // grooves interpolates the seam toward the panel color (0 = seamless slab,
      // 1 = the stock milled look, 2 = deep-cut grooves).
      const seam = Math.max(4, Math.min(235, Math.round(base + (params.seam - params.base) * b * g)));
      // INTO the same texture: its repeat (fitCamera's) and its GPU storage stay
      panelTexture(renderer, { base, jitter: params.jitter, seam, seed: params.seed }, mat.map);
    }
    panelsAt.b = b; panelsAt.g = g;
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
  // A HELD HEADING: which side of the body is turned to the glass, and how
  // far. q is the rest quaternion for that side (faceQuat, below spin); spins
  // says the idle turn goes on INSIDE it, about the body's own crown axis, so
  // a top or bottom face still turning is Saturn. The arrival belongs to
  // updateTrackball — a slerp on the frame's k, never a copy, because the
  // presence writes the state and the body owns how it gets there — and a
  // drag, a hand or a pinch wins while it lasts; on release it eases back,
  // elastic like the pinch. Declared HERE, above the loop (the TDZ rule).
  let faceHeld = null;             // { dir, t, q, spins } or null
  let faceTheta = 0;               // the turn a spinning face has made, radians
  let lastMorphName = 'settle';   // the named pace to return to when a score ends
  // A trail the GRAMMAR set, as opposed to one a person set from the debug API.
  // Only the first is subject to the count gate below, and only the first is
  // revoked when the field refills.
  let trailByWord = false;
  // A trail asked for while the field is still thinning. Declared HERE, beside
  // trailByWord and far above frame(), because frame() reads it: anything the
  // loop touches must exist before createBody kicks the loop off, or the whole
  // body throws on load and the app never starts.
  let trailPending = 0;
  // THE TRAIL GATE, as a fraction of the field: a trail composites with a max
  // and was built for a sparse wake, and over the full body it saturates to a
  // solid white disc within frames (three renders said so). Count 6 is ~2,400
  // nodes — the most a trail is allowed to follow.
  const TRAIL_GATE = 0.1;
  // mesh and glow ease like everything else; their targets live here, above the loop
  let meshTarget = 0;
  let glowTarget = 0.8;           // the bloom strength that shipped
  const ROT_SPEED = 0.005, DAMP = 0.9, IDLE_SPEED = 0.0016;
  // How long after a release (or after the hands let go) the idle turn waits
  // before it resumes. It was 45 FRAMES — 0.75s at 60Hz, 0.375s at 120, and
  // at whatever rate a struggling machine managed. Now it is the 0.75s it
  // always meant.
  const RESUME_S = 0.75;
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
  const qFace = new THREE.Quaternion();
  // THE SIX HEADINGS as rest quaternions in the WORLD frame, the frame spin()
  // composes in. The words are NAMED_DIR's, in the body's own space, and each
  // is the rotation that carries that side round to +Z, the glass: left is a
  // yaw of +90 about +Y (-X comes forward), right -90; top a pitch of +90
  // about +X (+Y comes forward), bottom -90; back an EXPLICIT half-turn about
  // +Y, never the shortest arc between front and back, which is degenerate;
  // front is nothing. T/9 scales the angle, so face top 5 is halfway.
  function faceQuat(dir, t, out) {
    const a = (Math.PI / 2) * (t / 9);
    if (dir === 'left') return out.setFromAxisAngle(_yAxis, a);
    if (dir === 'right') return out.setFromAxisAngle(_yAxis, -a);
    if (dir === 'top') return out.setFromAxisAngle(_xAxis, a);
    if (dir === 'bottom') return out.setFromAxisAngle(_xAxis, -a);
    if (dir === 'back') return out.setFromAxisAngle(_yAxis, 2 * a);
    return out.identity();
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
    dragging = false; resumeTimer = RESUME_S; // brief grace before the idle spin resumes
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
  //
  // IN SECONDS, NOT FRAMES. This is the orb's most visible continuous motion
  // and it was the one thing in the loop still counted per frame: the idle
  // turn ran twice as fast on a 120Hz display, every dropped frame was a
  // rotation hitch that never caught up, and a 30fps cap would have halved it.
  // dtN is the frame's length in 60Hz frames, so at exactly 60fps all of this
  // is the shipped arithmetic to the bit:
  //   the fling decays by DAMP^dtN — the exact dtN-fold application of *= DAMP;
  //   it travels (1 - DAMP^dtN) / (1 - DAMP) of a frame's velocity, the exact
  //   sum of the geometric series the old per-frame steps added up to (1 at
  //   dtN = 1, 1.9 at dtN = 2, where a plain velX*dtN would overshoot to 2);
  //   the idle turn is IDLE_SPEED per 60th of a second, whatever the rate.
  function updateTrackball(dtN, k) {
    if (halted) { velX = 0; velY = 0; return; }
    if (dragging) return;
    if (Math.abs(velX) > 1e-5 || Math.abs(velY) > 1e-5) {
      const keep = Math.pow(DAMP, dtN);
      const travel = (1 - keep) / (1 - DAMP);
      spin(velX * travel, velY * travel);
      velX *= keep; velY *= keep;
    }
    if (resumeTimer > 0) resumeTimer = Math.max(0, resumeTimer - dtN / 60);
    // A HELD HEADING arrives here and only here. Not while a drag, a hand, a
    // pinch or a fling has the body — those win while they last — and after
    // the same grace the idle spin waits. A spinning face turns about the
    // body's OWN axis, inside the target (postmultiplied: local), so the crown
    // stays toward the glass while the body goes round under it. (Its turn is
    // in seconds like the idle spin's: IDLE_SPEED per 60th of a second.)
    if (faceHeld && !dragging && !handPush.held && resumeTimer === 0 && !pinches[0] && !pinches[1] && Math.abs(velX) < 1e-5 && Math.abs(velY) < 1e-5) {
      if (faceHeld.spins && idleEnabled && idleTurn !== 0) faceTheta += IDLE_SPEED * idleTurn * dtN;
      _q.setFromAxisAngle(_yAxis, faceTheta);
      qFace.copy(faceHeld.q).multiply(_q);
      rig.quaternion.slerp(qFace, k);
      return;                        // the turn is inside the face, or stopped by it
    }
    if (idleEnabled && resumeTimer === 0 && idleTurn !== 0) spin(IDLE_SPEED * idleTurn * dtN, 0);
  }

  // --- Tap-to-light: tap a machined panel and it glows a random color ---------
  // A tap (pointer down+up, barely moved) raycasts into the room; the hit panel
  // is resolved from the integer grid (see fitCamera) and covered with an
  // additive quad that blooms in, holds, and fades. The grid counts live here;
  // fitCamera keeps them in sync with the texture repeats.
  const grid = { wallU: 8, wallV: 4, floor: 8, ceil: 4 };
  const lit = [];
  // THE LIT PANELS ARE POOLED, never disposed. Each tap used to make a new
  // mesh, geometry and material, and killTile disposed them ~5s later — and
  // three destroys a shader program when the last material using it is
  // disposed. Nothing else in the scene shares this one, so the first tap after
  // the last tile died compiled it again, synchronously, on the very frame the
  // panel was meant to bloom in. A pooled tile keeps its material, and so the
  // program, for the life of the page; one shared unit plane is scaled to each
  // panel's size. One tile is made now, hidden, so the boot-time compile below
  // (prewarm) covers the very first tap too.
  const TILE_GEO = new THREE.PlaneGeometry(1, 1);
  const tileSpare = [];
  function makeTile() {
    const m = new THREE.Mesh(TILE_GEO, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    return m;
  }
  tileSpare.push(makeTile());
  function killTile(t) { t.m.visible = false; t.m.material.opacity = 0; tileSpare.push(t.m); }
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
    const m = tileSpare.pop() || makeTile();
    m.material.color.setHSL(Math.random(), 0.9, 0.62); // random hue, bright enough to bloom
    m.material.opacity = 0;
    m.scale.set(sizeU * 0.96, sizeV * 0.96, 1);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rotX, rotY, 0);
    m.visible = true;
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
    // The field's phases, integrated on the CPU (see VERT and the frame loop):
    // where the surface noise and the colour bands are along their own paths.
    uMotionAt: { value: new THREE.Vector3() }, uHueAt: { value: new THREE.Vector3() },
    uOct: { value: 4 },   // fbm octaves: 4 as designed, fewer in the lightest mode
    uAmp: { value: t0.amp }, uFreq: { value: t0.freq }, uSpeed: { value: t0.speed },
    uSize: { value: t0.size }, uRadius: { value: t0.radius }, uAudio: { value: 0 }, uGlitch: { value: 0 },
    uPointK: { value: 10 },   // recomputed from the drawing buffer on every resize
    uHueBase: { value: t0.hueBase }, uHueRange: { value: t0.hueRange }, uHueFlow: { value: t0.hueFlow },
    uHueSweep: { value: t0.hueSweep }, uSat: { value: t0.sat }, uVal: { value: t0.val }, uCFreq: { value: t0.cFreq },
    uDotFade: { value: 1.0 }, uPlasma: { value: 0 }, uPaint: { value: 0 },

    uSpeckle: { value: t0.speckle },
    // THE FIELD ITSELF. Defaults are the body exactly as it has always been:
    // no collapse, every node alive, standing at the centre of its own room.

    uCondense: { value: 0 }, uKeep: { value: 1 }, uFlashPeriod: { value: 0 }, uGrain: { value: 1 }, uMesh: { value: 0 }, uCount: { value: COUNT },
    // Two pinches, one per hand. w is the reach; 0 means nobody is holding it.
    uPinchA: { value: new THREE.Vector4(0, 0, 1, 0) }, uPinchAV: { value: new THREE.Vector3() },
    uPinchB: { value: new THREE.Vector4(0, 0, 1, 0) }, uPinchBV: { value: new THREE.Vector3() },
    uOffset: { value: new THREE.Vector3(0, 0, 0) },
    uScatter: { value: new THREE.Vector3(0, 2.4, 1.35) },   // amount, halfW, halfH — see SHAPE_GLSL
    uPre: { value: 0 }, uInk: { value: 1 },   // the body's own pass: unchanged
    // The shape stack. uShapeTime runs off a SHARED wall clock, not uTime:
    // uTime accumulates each frame's own step per tab, so two people watching one
    // broadcast would sit at different phases of every sine in the stack.
    uShapeMix: { value: 0 }, uShapeId: { value: 0 }, uShapeA: { value: 0 }, uShapeC: { value: 0 }, uShapeD: { value: 0 }, uFlowAmp: { value: 0 }, uFlowSpeed: { value: 1 },
    uShapeB: { value: 0 }, uShapeTime: { value: 0 },
    uNoiseAmp: { value: 0 }, uNoiseFreq: { value: 1 },
    uPatch: { value: new THREE.Vector4(0, 0, 0, 0) },       // @patch: cycles per R (0 = none said), seed — see SHAPE_GLSL
    // The memory layer. uMemTex is a 64x64 byte texture, one texel per memory,
    // so selection later costs one texSubImage instead of a 24,000-float
    // attribute upload. NearestFilter because a texel is a record, not a colour.
    uMemOn: { value: 0 }, uMemCols: { value: MEM_COLS }, uMemPick: { value: -1 },
    // 900 is a cap a little under 5° across — a fingertip on the body, not a
    // continent. It is a constant because the bloom should be the same size
    // whether the orb is drawn large or small: it is a touch, not a spotlight.
    uTouch: { value: new THREE.Vector3(0, 0, 1) }, uTouchAmp: { value: 0 }, uTouchK: { value: 900 },
    uMemTex: { value: memTex },
    uOp: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uOpMask: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uPull: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    // Environment light on the dust. Normal-blended particles OCCLUDE what is
    // behind them, and their unlit side is dark — invisible against the metal
    // room, but against a bright sky the whole cloud read as a hard black
    // silhouette (the long-hunted "dark faceted disc"). Each world backlights
    // the dust in its own tone; the metal room stays exactly as tuned (zero).
    uEnvGlow: { value: new THREE.Color(0, 0, 0) },
  };
  // The eased keys' uniform objects, looked up ONCE. The ease loop used to
  // build 'u' + key[0].toUpperCase() + key.slice(1) for fourteen keys every
  // frame — ~40 short strings a frame for the collector, to find objects that
  // never change.
  const EASE_U = Object.fromEntries(EASE_KEYS.map((k) => [k, uniforms['u' + k[0].toUpperCase() + k.slice(1)]]));
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

  // ---- THE ECLIPSE ----------------------------------------------------------
  // A dark disc behind the body, by choice. It began as a fault: in Code the
  // skydome was clipped by the far plane in a dark polygon around the orb, and
  // Colin: "it kind of looks cool sometimes, but its still a visual glitch. we
  // could add it as a choice for form but it shouldn't ALWAYS be present." The
  // fault is fixed (far = 220); this is the look, kept, as a Room setting that
  // is off unless asked for: a soft-edged near-black disc a little more than
  // twice the body's width, on the line of sight behind it, facing the camera,
  // so it eclipses whatever world the body is in. Drawn after the sky and
  // before the body (renderOrder −0.5 sits between their −1 and 0); it writes
  // no depth and tests none, like the points, so nothing of the body is cut.
  const eclipseMat = new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(0x06070b) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // authored dark, encoded on the way out like every sky (see environments.js)
    fragmentShader: 'precision highp float; varying vec2 vUv; uniform vec3 uTint;\n'
      + 'void main(){ float r = length(vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.84, 1.0, r);'
      + ' gl_FragColor = vec4(pow(uTint, vec3(2.2)), a * 0.97);\n#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending,
  });
  const eclipseDisc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), eclipseMat);
  eclipseDisc.renderOrder = -0.5; eclipseDisc.visible = false; eclipseDisc.frustumCulled = false;
  scene.add(eclipseDisc);
  const _eclFwd = new THREE.Vector3();
  const ECLIPSE_BACK = 2.4;      // world units behind the body, along the line of sight
  const ECLIPSE_WIDTH = 3.0;     // its diameter in bodies, as it appears (the fault it remembers was about this)
  function placeEclipse() {
    if (!eclipseDisc.visible) return;
    const fwd = _eclFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    eclipseDisc.position.copy(offWorld).addScaledVector(fwd, ECLIPSE_BACK);
    eclipseDisc.quaternion.copy(camera.quaternion);
    const dBody = Math.max(0.5, camera.position.distanceTo(offWorld));
    // the same apparent size as a disc at the body's own depth would have
    const size = (uniforms.uRadius.value + uniforms.uAmp.value) * ECLIPSE_WIDTH * ((dBody + ECLIPSE_BACK) / dBody);
    eclipseDisc.scale.set(size, size, 1);
  }


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
    // the encode, as in FRAG: the quad sits in the scene, so with the glow off
    // it goes straight to the screen and must arrive encoded like everything else
    fragmentShader: 'precision highp float; uniform sampler2D tTrail; varying vec2 vUv;'
      + ' void main(){ gl_FragColor = vec4(texture2D(tTrail, vUv).rgb, 1.0);\n#include <colorspace_fragment>\n}',
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

  const _trailFwd = new THREE.Vector3(), _trailRight = new THREE.Vector3(), _trailUp = new THREE.Vector3(), _bufSize = new THREE.Vector2();
  function trailSize() {
    const pr = renderer.getPixelRatio();
    const v = renderer.getDrawingBufferSize(_bufSize);
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
  // THE TRAIL, AS A PLAIN FUNCTION. api.setTrail delegates here and so does the
  // frame loop — which must never reach through `api`: the loop is started at
  // frame() long before `const api` is evaluated, so any api.* inside it is a
  // temporal-dead-zone throw waiting for the first turn that reaches the line.
  // A function declaration is hoisted and cannot be.
  function applyTrail(seconds) {
    // THE LIGHTEST MODE REFUSES A TRAIL: it is two more passes a frame (a
    // half-float fade and a second run of the whole vertex shader), which is
    // exactly the kind of extra the smooth mode exists to take away. Refused
    // as "off", so trail() reports honestly that there is none.
    const s = quality.lite ? 0 : seconds === Infinity || seconds === 'never' ? Infinity
      : Math.max(0, Math.min(30, +seconds || 0));
    if (!s) {
      trailOn = false; trailQuad.visible = false; trailT = 1.0;
      clearTrail();
      return;
    }
    ensureTrail();
    if (!trailOn) clearTrail();      // never start from someone else's past
    trailT = s; trailOn = true;   // the quad shows itself on the first step
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
    // — read off the projection itself, so an off-axis frustum (a moved head,
    // or the body framed in Code's column) is filled exactly too. At view
    // depth D the frustum spans x = D(ndc + P02)/P00: centre D·P02/P00, half
    // width D/P00; likewise y with P12, P11. (three's elements are column-
    // major: e[0] = P00, e[8] = P02, e[5] = P11, e[9] = P12.)
    const D = 3.0;
    const e = camera.projectionMatrix.elements;
    const fwd = _trailFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);   // scratch: this runs every frame
    const right = _trailRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = _trailUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    trailQuad.position.copy(camera.position).addScaledVector(fwd, D)
      .addScaledVector(right, D * e[8] / e[0]).addScaledVector(up, D * e[9] / e[5]);
    trailQuad.quaternion.copy(camera.quaternion);
    trailQuad.scale.set(2 * D / e[0], 2 * D / e[5], 1);
  }


  // Bloom gives the dots their glow/bleed, matching the reference renders.
  // Switched by src/gfx.js. Declared here rather than beside the frame loop
  // because of the rule this file has learned six times: a thing the loop reads
  // is declared above its EARLIEST reader, not merely above the loop.
  let bloomOn = true;
  const composer = new EffectComposer(renderer);
  if (typeof window !== 'undefined' && window.__y3kScene) window.__y3kScene.composer = composer;
  composer.addPass(new RenderPass(scene, camera));
  // Threshold 0.35: now that the metal walls are lit/visible they sit just below it
  // and stay crisp, while the orb's crests, filaments, ribbons and core clear it and
  // still glow. (THE dial for orb-glow vs wall-crispness — lower = more orb halo but
  // walls start to haze; higher = crisper walls but less per-dot glow.) Strength/radius unchanged.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.35);
  composer.addPass(bloom);

  // ONE CALL, because the brand layer brackets it: a silhouette goes in before
  // the scene is drawn and the mark's chrome is added after, and splitting the
  // render into two branches would have put the bracket around only one of
  // them. Which path it takes is the graphics tier's business, not the frame
  // loop's.
  //
  // THE BLOOM IS THE SECOND-LARGEST THING ON A SLOW MACHINE. Sixteen
  // render-target binds a frame is what it costs — not shading time, the whole
  // pipeline benches at 0.105ms of GPU — but sixteen chances to stall against
  // whatever the compositor is doing with the backdrop filters above it. Off,
  // the scene goes straight to the screen with no mip chain at all.
  const draw = () => { if (bloomOn) composer.render(); else renderer.render(scene, camera); };

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
      uMotionAt: uniforms.uMotionAt, uOct: uniforms.uOct, uAmp: uniforms.uAmp, uFreq: uniforms.uFreq,
      uRadius: uniforms.uRadius, uAudio: uniforms.uAudio,
      uCondense: uniforms.uCondense, uOffset: uniforms.uOffset, uScatter: uniforms.uScatter,
      // BY REFERENCE, every one of them: LINE_VERT keeps its own uniform map,
      // so any shape uniform left out here would silently never reach the web.
      uShapeMix: uniforms.uShapeMix, uShapeId: uniforms.uShapeId, uShapeA: uniforms.uShapeA,
      uShapeB: uniforms.uShapeB, uShapeTime: uniforms.uShapeTime,
      uNoiseAmp: uniforms.uNoiseAmp, uNoiseFreq: uniforms.uNoiseFreq, uPatch: uniforms.uPatch,
      uShapeC: uniforms.uShapeC, uShapeD: uniforms.uShapeD, uFlowAmp: uniforms.uFlowAmp, uFlowSpeed: uniforms.uFlowSpeed,
      uMesh: uniforms.uMesh, uCount: uniforms.uCount,
      // BY REFERENCE, like every other shared uniform: the web has to stretch
      // with the field it is drawn between, or a pinch tears them apart.
      uPinchA: uniforms.uPinchA, uPinchAV: uniforms.uPinchAV,
      uPinchB: uniforms.uPinchB, uPinchBV: uniforms.uPinchBV,
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
      uMotionAt: uniforms.uMotionAt, uOct: uniforms.uOct, uAmp: uniforms.uAmp, uFreq: uniforms.uFreq,
      uRadius: uniforms.uRadius, uAudio: uniforms.uAudio,
      uCondense: uniforms.uCondense, uOffset: uniforms.uOffset, uScatter: uniforms.uScatter,
      uShapeMix: uniforms.uShapeMix, uShapeId: uniforms.uShapeId, uShapeA: uniforms.uShapeA,
      uShapeB: uniforms.uShapeB, uShapeTime: uniforms.uShapeTime,
      uNoiseAmp: uniforms.uNoiseAmp, uNoiseFreq: uniforms.uNoiseFreq, uPatch: uniforms.uPatch,
      uShapeC: uniforms.uShapeC, uShapeD: uniforms.uShapeD, uFlowAmp: uniforms.uFlowAmp, uFlowSpeed: uniforms.uFlowSpeed,
      uMesh: uniforms.uMesh, uCount: uniforms.uCount,
      // BY REFERENCE, like every other shared uniform: the web has to stretch
      // with the field it is drawn between, or a pinch tears them apart.
      uPinchA: uniforms.uPinchA, uPinchAV: uniforms.uPinchAV,
      uPinchB: uniforms.uPinchB, uPinchBV: uniforms.uPinchBV,
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
  // THE POINT SIZE FOLLOWS THE BODY'S SIZE ON SCREEN (see resize()). The body
  // (R = 1.6) sits at the glass, where the FRAME is 2·win.halfH high and spans
  // the frame's height in pixels, so its diameter in device pixels is
  // (R / win.halfH) times the frame's height in the buffer; 1390 is that
  // diameter at the 1600-tall buffer the density was tuned on (the body fills
  // ~87% of an unframed canvas's height). Called from resize() and from
  // fitCamera(), which is the only other thing that changes the seat — a frame
  // that moved resizes nothing.
  function pointScale() {
    if (!(win.dist > 0) || !(win.halfH > 0)) return;
    const bufH = renderer.getDrawingBufferSize(_bufSize).y || ((renderer.domElement.clientHeight || 600) * renderer.getPixelRatio());
    const frameH = bufH * Math.max(0.02, framing.y1 - framing.y0);
    const diam = (1.6 / win.halfH) * frameH;
    uniforms.uPointK.value = 10 * (diam / 1390);
    trailUniforms.uPointK.value = uniforms.uPointK.value * TRAIL_SCALE;
  }
  function fitCamera() {
    const R = 1.6; // sphere radius + max displacement + a little margin
    if (!camera.aspect || !isFinite(camera.aspect)) return; // not laid out yet
    const vHalf = (camera.fov * Math.PI) / 180 / 2;
    // THE FRAME'S ASPECT, not the canvas's, decides the seat: the body has to
    // fit the part of the canvas it is framed in. Unframed the two are equal.
    const el = renderer.domElement;
    const W = el.clientWidth || window.innerWidth || 1, H = el.clientHeight || window.innerHeight || 1;
    readFrame(W, H);
    const fw = Math.max(1, (framing.x1 - framing.x0) * W), fh = Math.max(1, (framing.y1 - framing.y0) * H);
    const frameAspect = fw / fh;
    const hHalf = Math.atan(Math.tan(vHalf) * frameAspect);
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
    // THE WINDOW IS THIS RECTANGLE. What the nominal camera sees at the orb's
    // own depth (z = 0) is the pane of glass the room sits behind: things at
    // z = 0 do not parallax, things behind it do, which is exactly what a
    // window does and exactly where the orb should be — at the glass.
    // Recomputing it here means it survives every resize and rotation for
    // free, because fitCamera is already the one place that owns the framing.
    win.dist = dist;
    win.halfH = Math.tan(vHalf) * dist;
    win.halfW = win.halfH * frameAspect;
    // THE CANVAS'S EDGES AT THE GLASS, with the body at the frame's centre:
    // world units per CSS pixel is the frame's width over the pixels it spans.
    const k = (2 * win.halfW) / fw;
    const fcx = ((framing.x0 + framing.x1) / 2) * W, fcy = ((framing.y0 + framing.y1) / 2) * H;
    win.left = (0 - fcx) * k; win.right = (W - fcx) * k;
    win.top = fcy * k; win.bottom = (fcy - H) * k;
    // scatter's room and the reach: the GLASS inside the bars, from the frame
    // just measured. Forced, because halfW changed even if nothing else did.
    refreshGlass(true);
    // THE MATRIX FOLLOWS AT ONCE. resize() runs this before the loop's next
    // applyEye, and a framed body drawn for one frame through three's own
    // symmetric matrix is a body in the middle of the canvas for one frame.
    if (!eyeSymmetric) setOffAxis(eyeAt.x, eyeAt.y, eyeAt.z);
    else if (framed()) restoreSymmetric();
    pointScale();

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

  // THE ORB HAS BEEN REDRAWN AT ITS NEW SIZE. Set by every resize() and
  // announced (window 'y3k:orb-resized') by the first frame drawn after it —
  // the Code screen hides the orb while the canvas reallocates and needs to
  // know when there is something worth showing again. Declared above the
  // resize() call below, which reads it (the TDZ rule).
  let resizedPending = false;
  function resize() {
    // Fall back to sane dims — a 0×0 read at load would make aspect NaN and
    // permanently poison the camera position.
    const w = container.clientWidth || window.innerWidth || 800;
    const h = container.clientHeight || window.innerHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    // The resolution the profile asks for at this size (see targetPixelRatio).
    // Set before setSize, so the canvas and every target below are allocated
    // once, at the size they will keep.
    const pr = targetPixelRatio(w, h);
    if (prChanged(pr)) { renderer.setPixelRatio(pr); composer.setPixelRatio(pr); }
    renderer.setSize(w, h);
    resizedPending = true;
    // Points are sized in device pixels, so their scale has to track the drawing
    // buffer — and the BODY'S OWN SIZE in it, not the buffer's height. Calibrated
    // against 1600 device px tall (an ~800px window at dpr 2), where the body
    // fills ~87% of the height: at that size this is exactly the 10.0 it
    // replaces, and it falls away proportionally as the body shrinks so the
    // sphere never crowds into a white blob. It used to scale on the buffer's
    // height alone, which was the same thing while the body filled the canvas;
    // framed in Code's column (or its band on a phone) the body is a fraction
    // of the canvas, and sized by the canvas it crowded into exactly that blob.
    pointScale();

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
  //   Two exceptions. In Code the orb's column is resized ON PURPOSE, by
  // amounts that can be under 90px, and a skipped one leaves the orb drawn at
  // the old size under a hidden stage that is waiting for 'y3k:orb-resized'.
  // And a change of device pixel ratio (the window dragged to another screen,
  // a zoom) is a real resize at the same CSS size.
  let lastW = 0, lastH = 0, resizeTimer = 0;
  function resizeMaybe() {
    const w = container.clientWidth || window.innerWidth || 800;
    const h = container.clientHeight || window.innerHeight || 600;
    const inCode = document.body.classList.contains('in-code');
    const same = w === lastW && h === lastH;
    if (!inCode && w === lastW && Math.abs(h - lastH) < 90 && !prChanged(targetPixelRatio(lastW, lastH))) return;   // browser chrome sliding
    if (same && !prChanged(targetPixelRatio(w, h))) {
      // nothing to reallocate — but Code may be holding the stage hidden for
      // this answer, so say at once that the orb is drawn at its size
      if (inCode) resizedPending = true;
      return;
    }
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
  // WHERE IT HAS BEEN TOLD TO BE, and whether it is flying. Both are DIGITS,
  // kept as digits and turned into world units every frame — because the unit
  // is the FRAME at the body's own depth, and the frame changes shape when the
  // window does. A stored world position for 'at 9 5' would be the right-hand
  // edge of the screen it was said on and off the glass of a phone turned
  // sideways. Declared here, beside fieldTarget, because frame() reads them.
  let placeDigits = null;          // [x, y] 0-9, or null for home
  let flying = null;               // { kind, w, h, r, R, t0 } or null — kind eight, circle, bounce, wander, or follow (with src and last); R the rate digit
  // WHAT IT CAN FOLLOW, by name: fn() -> { x, y, ok } in screen pixels, a
  // PULL. 'hand' is handview's lead index tip (main.js hands it over); 'eye'
  // waits on applyEye polling at gain 0 and is not registered until it works.
  const followSources = {};
  let depthDigit = null;           // 0-9 how near, or null for the glass — see depthZ
  // THE OFFSET, IN THE WORLD, eased toward the target. uOffset is added to the
  // node BEFORE modelViewMatrix, on a child of the rig — which means it turns
  // WITH the rig, and the idle spin (a lap a minute) carried 'at 9 5' round the
  // centre, behind the glass and back, for as long as it was said. So the world
  // offset is kept here and the uniform receives it rotated into the rig's own
  // frame every frame, and a place stays where it was put while the body turns
  // in it. orbPx reads THIS, because the hit disc lives on the glass too.
  const offWorld = new THREE.Vector3();
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
    if (!memTaken) memTaken = new Uint8Array(COUNT);
    else memTaken.fill(0);
    memJob = { nodes, i: 0, k };
  }
  // THE CLAIM ALLOCATES NOTHING PER MOTE. It keeps the k+1 nearest motes to a
  // memory in two fixed typed arrays (k is at most 60), and marks claimed motes
  // in a byte per mote rather than a Set. It used to build a fresh [mote, dot]
  // pair for every insertion — tens of thousands of little arrays in the second
  // after login, the same second as the login flare, the edge program's first
  // compile and the mercury bake — and every collection they cost was a frame.
  const MEM_BEST = 61;                       // haloBudget's ceiling of 60, plus the mote itself
  const memBestM = new Int32Array(MEM_BEST);
  const memBestD = new Float64Array(MEM_BEST);
  let memTaken = null;                       // 1 per mote a memory has claimed; made with the first graph

  // One slice of the claim. For each memory in turn: find the nearest unclaimed
  // mote to its direction, then the k next nearest for its halo.
  function stepMemJob() {
    if (!memJob) return;
    const t0 = performance.now();
    const { nodes, k } = memJob;
    const keep = Math.min(k + 1, MEM_BEST);
    while (memJob.i < nodes.length) {
      if (performance.now() - t0 > MEM_SLICE_MS) return;    // hand the frame back
      const d = nodes[memJob.i].dir;
      if (!d) { memJob.i += 1; continue; }
      // one pass over the motes, keeping the k+1 best by dot product, sorted
      // best first. Ties keep index order (the strict < below), exactly as the
      // stable sort this replaces did, so a graph claims the same motes it
      // always claimed.
      let n = 0;
      for (let m = 0; m < COUNT; m++) {
        const dot = positions[m * 3] * d[0] + positions[m * 3 + 1] * d[1] + positions[m * 3 + 2] * d[2];
        let at;
        if (n < keep) at = n++;
        else if (dot <= memBestD[keep - 1]) continue;
        else at = keep - 1;
        while (at > 0 && memBestD[at - 1] < dot) { memBestD[at] = memBestD[at - 1]; memBestM[at] = memBestM[at - 1]; at -= 1; }
        memBestD[at] = dot; memBestM[at] = m;
      }
      // the node itself is the nearest mote nobody has claimed yet
      let node = -1;
      for (let b = 0; b < n; b++) { if (!memTaken[memBestM[b]]) { node = memBestM[b]; break; } }
      if (node < 0) node = memBestM[0];
      memTaken[node] = 1;
      memAttr[node] = memJob.i;
      haloAttr[node] = 1;
      let rank = 0;
      for (let b = 0; b < n; b++) {
        const m = memBestM[b];
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
    // the body is wherever it was put — a place, and a depth — so the sphere is
    // centred there, not on the rig; before this a placed body missed every tap
    rig.getWorldPosition(_touchC).add(offWorld);
    _touchS.set(_touchC, Math.max(0.05, uniforms.uRadius.value));
    // a tap that misses the body is not a touch of it
    if (!raycaster.ray.intersectSphere(_touchS, _touchV)) return null;
    rig.worldToLocal(_touchV);
    rig.worldToLocal(_touchC);                     // the same centre, in the body's own space
    _touchV.sub(_touchC);
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

  // ---- THE FRAME'S CLOCK ----------------------------------------------------
  // Everything the loop reads is declared here, above it (the TDZ rule).
  //
  // THE rAF TIMESTAMP, NOT THE WALL CLOCK. The loop used THREE.Clock, which is
  // performance.now() whenever this callback happened to run — and the
  // mercury loops are registered first and run first every vsync, so their
  // variable cost became jitter in this dt and in every animated quantity.
  // The timestamp rAF hands every callback of one vsync is the same number,
  // taken at the vsync, and is what the pacer (pace.js) counts in too.
  // onVsync keeps `function frame()` as it was: nine tests find the loop by it.
  let rafTs = -1;               // this vsync's timestamp; -1 for the synchronous first call
  const onVsync = (ts) => { rafTs = ts; frame(); };
  let lastDrawAt = -1;          // when the last DRAWN frame ran, ms; -1 = the next one starts the clock afresh
  let restNext = false;         // the half-rate toggle (smooth, with a panel or Code in front)
  let envT = 0;                 // the environments' own elapsed clock (drifting dust, aurora)
  // THE PROGRAMS BEFORE THE PICTURE: no frame is drawn until prewarm() below
  // has had the shader programs compiled off the main thread (or a short
  // deadline has passed). Behind the entrance curtain this costs nothing to
  // see, and it keeps ~20 synchronous compiles out of the page's first second.
  let warm = false;
  // THE FIELD'S TWO PHASES, integrated here in float64 (see uMotionAt in VERT):
  // phase += dt * speed, so every mood, beat and score step changes how fast
  // the field moves and never jumps where it is. Handed to the shader as a
  // point on a circle of radius 64 in the y-z plane — locally the straight
  // line along z the noise always travelled (sin a ~ a), closing on itself
  // every 2*pi*64 ~ 402 units of phase (48 minutes at calm), so the noise
  // coordinates stay under 128 and float32 keeps its precision however long
  // the page is open.
  const PHASE_R = 64, PHASE_LOOP = 2 * Math.PI * PHASE_R;
  let motionPhase = 0, huePhase = 0;
  function phaseOnCircle(phi, out) {
    const a = phi / PHASE_R;
    out.set(0, PHASE_R * (1 - Math.cos(a)), PHASE_R * Math.sin(a));
  }
  let memSkipped = false;       // a claim slice was skipped last frame; never skip two running

  // ---- THE PALETTE, A SLICE AT A TIME ---------------------------------------
  // Shepard paint is 24,000 nodes x every anchor x an acos and an exp — for a
  // dozen anchors about 290,000 transcendental calls, run synchronously in the
  // middle of a streaming reply. It is computed here in ~3ms slices into a
  // scratch buffer and handed to the shader in ONE step when the whole palette
  // is ready: the attribute, uPaint and the room's glow change together, so no
  // frame ever shows half an old palette and half a new one.
  //   A palette overtaken while it is being laid down (setScheme) still lands
  // in the buffer — as it did when this was synchronous, so a later enterPaint
  // shows the palette Y3K last painted — it just no longer switches itself on.
  let hasPainted = false;
  let paintJob = null;          // { anchors, i, glow, show } while a palette is being laid down
  let paintBuf = null;          // made on the first paint: most sessions never paint
  const PAINT_SLICE_MS = 3;
  function stepPaint() {
    const job = paintJob;
    const A = job.anchors, nA = A.length;
    const t0 = performance.now();
    let i = job.i;
    while (i < COUNT) {
      const end = Math.min(COUNT, i + 512);
      for (; i < end; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        let r = 0, g = 0, b = 0, wsum = 0;
        for (let n = 0; n < nA; n++) {
          const an = A[n];
          let d = x * an.dir[0] + y * an.dir[1] + z * an.dir[2];
          d = d > 1 ? 1 : d < -1 ? -1 : d;
          const ang = Math.acos(d);
          // Sharp Gaussian falloff so the nearest anchor dominates → distinct
          // colored regions with smooth seams (not a washed-out average). The tiny
          // floor keeps wsum > 0 everywhere.
          const w = Math.exp(-4.0 * ang * ang) + 1e-4;
          r += an.rgb[0] * w; g += an.rgb[1] * w; b += an.rgb[2] * w; wsum += w;
        }
        paintBuf[i * 3] = r / wsum; paintBuf[i * 3 + 1] = g / wsum; paintBuf[i * 3 + 2] = b / wsum;
      }
      if (performance.now() - t0 > PAINT_SLICE_MS) break;
    }
    job.i = i;
    if (i < COUNT) return;
    colorAttr.set(paintBuf);
    geo.attributes.aColor.needsUpdate = true;
    hasPainted = true;
    if (job.show) {
      uniforms.uPaint.value = 1;
      if (job.glow) setRoomGlow(job.glow);
    }
    paintJob = null;
  }

  function frame() {
    requestAnimationFrame(onVsync);
    // WHICH VSYNCS DRAW is the pacer's call, shared with every other render
    // loop (pace.js): the first to ask about a timestamp decides for all, so
    // the orb and the liquid glyphs draw on the same vsyncs or rest on the
    // same ones. A skipped vsync is time that passes, not time that is lost:
    // dt below is measured between DRAWN frames only.
    if (rafTs >= 0 && !due(rafTs)) return;
    const cls = document.body.classList;
    // NOT DRAWN AT ALL behind the world view. .world-root is opaque and covers
    // the whole window, and it runs its own renderer: drawing the orb under it
    // was two full 3D pipelines a vsync for one picture. Nothing moves while it
    // is away, and the clock restarts on return (lastDrawAt = -1), so it comes
    // back exactly where it was rather than jumping by however long it was gone.
    if (!warm || cls.contains('in-world')) { lastDrawAt = -1; return; }
    // HALF RATE WHERE HALF IS ENOUGH, in the smooth mode only: with a panel
    // open the orb is a blurred backdrop, and in Code a small column — and
    // every frame it draws is a frame the live blurs above it re-blur.
    const behind = quality.half && (cls.contains('panel-open') || cls.contains('in-code'));
    if (behind && (restNext = !restNext)) return;
    const now = rafTs >= 0 ? rafTs : performance.now();
    const dt = lastDrawAt < 0 ? 0 : Math.max(0, now - lastDrawAt) / 1000;
    lastDrawAt = now;
    // THE CLAMPED STEP every accumulator takes. uTime used to take the raw dt,
    // so a window back from twenty seconds behind another one jumped every
    // clock-driven phase by twenty seconds in one frame. The few readers that
    // want the REAL gap still get dt (the trail's fade, the pendulum's own clamp).
    const step = Math.min(dt, 0.1);
    uniforms.uTime.value += step;

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
      const u = EASE_U[key];
      if (!u) continue;
      const off = beatOff[key] || 0;
      // SUBTRACT FIRST. Easing a value a beat is riding on would fold the
      // transient into the state, and the body would keep every beat it ever
      // made forever — brighter and brighter, with nothing able to take it back.
      // The hands scale the body by scaling what the mood is easing TOWARD.
      const tgt = (target[key] ?? 0) * (key === 'radius' ? swell : 1);
      let v = lerp(u.value - off, tgt, k);
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
    // THE PHASES MOVE AT THE SPEEDS JUST EASED — the glitch fix, in two lines.
    // At a constant speed this is exactly uTime * speed, as it always was.
    motionPhase = (motionPhase + step * uniforms.uSpeed.value) % PHASE_LOOP;
    huePhase = (huePhase + step * uniforms.uHueFlow.value) % PHASE_LOOP;
    phaseOnCircle(motionPhase, uniforms.uMotionAt.value);
    phaseOnCircle(huePhase, uniforms.uHueAt.value);

    // THE THREE THAT WERE LEFT BEHIND when the eases above went wall-clock:
    // the mic level and the memory layer's two fades were still per-frame
    // constants, so a voice's energy and the memory constellation's arrival ran
    // at double speed on a 120Hz display. Same form as k above — identical to
    // the old constant at exactly 60fps, the shipped feel preserved.
    const kAudio = 1 - Math.pow(1 - 0.2, dtN);
    const kMem = 1 - Math.pow(1 - 0.06, dtN);
    audioLevel = lerp(audioLevel, audioTarget, kAudio);
    uniforms.uAudio.value = Math.min(audioLevel + speakingBoost, 1.4);
    // the worlds' clock: its own accumulator, advanced by the same clamped step
    envT += step;
    envs.tick(step, envT);

    uniforms.uPlasma.value = lerp(uniforms.uPlasma.value, plasmaTarget, 1 - Math.pow(1 - morphK[1], dtN));
    // The field eases on the same k as the mood keys — one pace for the whole body.
    uniforms.uCondense.value = lerp(uniforms.uCondense.value, fieldTarget.condense, k);
    uniforms.uKeep.value = lerp(uniforms.uKeep.value, fieldTarget.keep, k);
    // a trail that was asked for before the field had thinned starts the
    // moment it has, and never over a field dense enough to smear into a disc
    if (trailPending && uniforms.uKeep.value <= TRAIL_GATE && fieldTarget.keep <= TRAIL_GATE) {
      applyTrail(trailPending / 3); trailByWord = true; trailPending = 0;
    }
    uniforms.uMesh.value = lerp(uniforms.uMesh.value, meshTarget, k);
    bloom.strength = lerp(bloom.strength, glowTarget, k);
    // A posture ARRIVES; it never snaps. Same k as every mood key above.
    uniforms.uShapeMix.value = lerp(uniforms.uShapeMix.value, shapeMixTarget, k);
    // the one form with a clock of its own: integrate, then hand the shader
    // this frame's positions
    if (swarm) { swarm.step(dt); swarm.write(simAttr.array); simAttr.needsUpdate = true; }
    uniforms.uShapeTime.value = (Date.now() - shapeT0) / 1000;
    // THE MEMORY CLAIM (≤4 ms a slice) STANDS ASIDE FOR A LATE FRAME. A frame
    // that arrived more than half a slot late is a machine already behind, and
    // spending four more milliseconds on it makes the next one late too. It
    // never skips twice running, so a machine that is always late still gets
    // its memories — at half the pace.
    if (memJob) {
      const ps = paceStats();
      const late = dt * 1000 > 1.5 * ps.divisor * ps.refresh * (behind ? 2 : 1);
      if (late && !memSkipped) memSkipped = true;
      else { memSkipped = false; stepMemJob(); }
    }
    if (paintJob) stepPaint();                      // ≤3 ms, then the frame goes on
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
    // the room breathes as Y3K speaks — at the strength the Room glow slider set
    orbLight.intensity = (4.0 + uniforms.uAudio.value * 4.0) * glowScale;

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

    // THE HANDS TURN IT. Applied before updateTrackball so the velocity a
    // release inherits is the one the hands last left, and the fling is theirs.
    if (handPush.n) {
      spin(handPush.x, handPush.y);
      velX = handPush.x; velY = handPush.y;
      handPush.x = 0; handPush.y = 0; handPush.n = 0;
    }
    // A FINGER ON THE BODY WITH NO NEWS IS NOT A FINGER HOLDING IT STILL.
    //
    // This is why it felt sticky, and it is a fact about two clocks. The hand
    // model runs at 24Hz under a 60Hz loop, so roughly three frames in five
    // carry the SAME reading — and the old code took that for a still finger
    // and did `velX = handPush.x` with a delta of nothing, wiping the
    // velocity. Three frames in five the body was being brought back to a dead
    // stop, so it only ever moved while the finger was actively travelling and
    // stopped dead the instant it paused. Nothing coasted, and a flick had to
    // land its last frame exactly right to carry at all.
    //
    // Now a movement sets the velocity and silence leaves it alone; the only
    // thing that stops the body is a hand that is genuinely still, which the
    // tracker reports as a movement of nearly zero. `on` is the liveness —
    // fingers are on it, news or not — so letting go is still exactly the frame
    // the last finger leaves, and updateTrackball still gets its fling.
    if (handPush.on) { handPush.held = true; handPush.on = 0; resumeTimer = RESUME_S; }
    else if (handPush.held) { handPush.held = false; }
    // THE PINCHES EASE HOME. A pull that has been let go of is still a pull
    // for a moment; the body is elastic, not a switch.
    for (let i = 0; i < 2; i++) {
      const u = i === 0 ? uniforms.uPinchA : uniforms.uPinchB;
      const uv = i === 0 ? uniforms.uPinchAV : uniforms.uPinchBV;
      if (!pinches[i]) {
        if (u.value.w > 0) {
          const k = 1 - Math.pow(0.05, Math.min(0.25, dt) / 0.35);
          uv.value.multiplyScalar(1 - k);
          if (uv.value.lengthSq() < 1e-6) { uv.value.set(0, 0, 0); u.value.w = 0; }
        }
      }
    }
    updateTrackball(dtN, k);
    // THE OFFSET, AFTER THE TURN. uOffset is offWorld rotated into the rig's
    // frame, so it wants THIS frame's quaternion: written before updateTrackball
    // it lagged the turn by a frame, and a placed body bobbed about a fifth of
    // a unit through a held face's ninety degrees.
    aimOffset();
    offWorld.lerp(fieldTarget.off, k);
    uniforms.uOffset.value.copy(offWorld).applyQuaternion(_invRig());   // rig-local, see offWorld
    applyEye(dt);              // the window, before anything reads the camera
    placeEclipse();            // behind the body, from the camera the window just set
    brandLayer.before();
    draw();

    brandLayer.after();
    // The first frame drawn at a new size tells whoever is waiting (Code hides
    // the stage while the canvas reallocates, and shows it again on this).
    if (resizedPending || win.moved) { resizedPending = false; win.moved = false; window.dispatchEvent(new Event('y3k:orb-resized')); }
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
  // ==========================================================================
  // THE WINDOW — head-coupled perspective.
  //
  // Moving or rotating the camera with the viewer's head is what almost
  // everyone builds first, and it is the wrong technique: it makes the WORLD
  // swing, which the eye reads as the room being on a gimbal. What produces
  // the effect is holding a fixed rectangle in world space — the screen — and
  // rebuilding the projection frustum from the viewer's eye through that
  // rectangle's corners. The frustum goes asymmetric as you move off centre.
  // The world stays bolted down; your view into it changes. That is a window.
  //
  // At head-centre every offset is zero and the frustum below is EXACTLY the
  // symmetric one three would build: right = n*tan(fov/2)*aspect falls out of
  // the same arithmetic. That identity is the acceptance test for this whole
  // feature, and it is checked in test/window.test.mjs rather than trusted.
  // ==========================================================================
  function setOffAxis(ex, ey, ez) {
    const n = camera.near, f = camera.far;
    const d = win.dist + ez;                     // eye to the pane, along -z
    if (!(d > 1e-3) || !(win.halfW > 0) || !(win.halfH > 0)) return false;
    // The canvas's edges at the glass (win.left is -halfW unframed; see THE
    // FRAME): the frustum runs to the canvas, the body sits at the frame's centre.
    const l = (win.left - ex) * n / d;
    const r = (win.right - ex) * n / d;
    const b = (win.bottom - ey) * n / d;
    const t = (win.top - ey) * n / d;
    if (!(r > l) || !(t > b)) return false;
    // SET THE SIXTEEN FLOATS BY HAND. Matrix4.makePerspective's signature has
    // changed across releases (a coordinateSystem argument arrived in the
    // r150s); three is pinned in the importmap today and the importmap is one
    // edit from moving. Matrix4.set takes its arguments ROW-major.
    camera.projectionMatrix.set(
      2 * n / (r - l), 0, (r + l) / (r - l), 0,
      0, 2 * n / (t - b), (t + b) / (t - b), 0,
      0, 0, -(f + n) / (f - n), -2 * f * n / (f - n),
      0, 0, -1, 0,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.position.set(ex, ey, win.dist + ez);
    eyeSymmetric = false;
    return true;
  }

  // Back to three's own matrix, and to the seat fitCamera chose. Only ever
  // called when we were the ones who moved it.
  function restoreSymmetric() {
    // Framed, the body's rest is the frame's own off-axis matrix, not three's
    // symmetric one (which would put the body in the middle of the canvas).
    if (framed() && setOffAxis(0, 0, 0)) { eyeSymmetric = true; return; }
    if (win.dist > 0) camera.position.set(0, 0, win.dist);
    camera.updateProjectionMatrix();
    eyeSymmetric = true;
  }

  function applyEye(dt) {
    const cap = REDUCED ? EYE_GAIN_REDUCED : EYE_GAIN_MAX;
    const gain = Math.max(0, Math.min(1, eyeGain)) * cap;
    if (!eyeSource || gain <= 0) {
      if (!eyeSymmetric) restoreSymmetric();
      if (eyeBase.n) { eyeBase.n = 0; eyeFilt.reset(); }
      eyeAt.x = eyeAt.y = eyeAt.z = 0;
      return;
    }

    let h = null;
    try { h = eyeSource(); } catch { h = null; }   // a broken source is not a black screen
    const seen = !!(h && h.ok && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z));

    if (seen) {
      // WHERE THEIR HEAD RESTS is captured over the first moments of a
      // continuous face and then held. A slowly drifting baseline would be
      // self-defeating: lean and hold, and it would quietly recentre until the
      // effect faded out from under you. Monocular depth is a scale estimate
      // anyway — this is a rest position, not a measurement of a room.
      if (eyeBase.n < EYE_BASE_N) {
        eyeBase.n += 1;
        const k = 1 / eyeBase.n;
        eyeBase.x += (h.x - eyeBase.x) * k;
        eyeBase.y += (h.y - eyeBase.y) * k;
        eyeBase.z += (h.z - eyeBase.z) * k;
      }
      const [fx, fy, fz] = eyeFilt.filter(h.x - eyeBase.x, h.y - eyeBase.y, h.z - eyeBase.z, dt, EYE_LEAD);
      eyeAt.x = fx * gain;
      eyeAt.y = fy * gain;
      eyeAt.z = fz * gain * EYE_Z_SHARE;
    } else {
      // FACE LOST: ease home, never snap. A snap on every glance away is the
      // single most irritating failure this feature has. 400ms to 95%.
      const k = 1 - Math.pow(0.05, Math.min(0.25, dt) / EYE_HOME_S);
      eyeAt.x += (0 - eyeAt.x) * k;
      eyeAt.y += (0 - eyeAt.y) * k;
      eyeAt.z += (0 - eyeAt.z) * k;
      eyeFilt.reset();
      eyeBase.n = 0;                 // the next face gets its own rest position
      const home = Math.abs(eyeAt.x) + Math.abs(eyeAt.y) + Math.abs(eyeAt.z) < 1e-4;
      if (home) {
        eyeAt.x = eyeAt.y = eyeAt.z = 0;
        if (!eyeSymmetric) restoreSymmetric();
        return;
      }
    }
    setOffAxis(eyeAt.x, eyeAt.y, eyeAt.z);
  }

  const brandLayer = (() => {
    const brandEl = document.getElementById('home-brand');
    let cv = null, tex = null, on = false, texW = 0, texH = 0;
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
      if (!BRAND_IN_ROOM) return false;   // see the constant: the window broke this
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
      }
      // THE TEXTURE IS REBUILT WHENEVER THE CANVAS CHANGES SIZE. three r160
      // uploads a canvas with texStorage2D once — immutable storage at the size
      // it first saw — and texSubImage2D ever after. mercury-mount resizes the
      // wordmark's canvas with the window (fitChrome -> setSize), so narrowing a
      // desktop window shrank the canvas: the sub-upload then covered only the
      // lower-left of the old storage and the rest kept the last big frame — the
      // word drawn small, with a stale "d" hanging where the big one used to end
      // (and a canvas that GREW again failed the sub-upload outright, so the
      // room kept showing the small one). needsUpdate cannot fix either; only a
      // new texture gets new storage.
      if (!tex || cv.width !== texW || cv.height !== texH) {
        if (tex) tex.dispose();
        tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        occMat.map = tex; quadMat.map = tex; occMat.needsUpdate = quadMat.needsUpdate = true;
        texW = cv.width; texH = cv.height;
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

  // ---- THE PROGRAMS, BEFORE THE FIRST PICTURE --------------------------------
  // The first frame used to compile about twenty shader programs synchronously:
  // the orb's own (simplex noise, thirteen forms and the six-move stack in one
  // vertex shader), the room's two PBR variants, the edges, the core, the lit
  // tile, and nine for the bloom — main-thread time spent before the page could
  // do anything else, and world-view.js measured the same effect at 150-200ms
  // on its own first render. Worse were the ones that came LATER, each on the
  // frame that first needed it: the constellation's program the first time the
  // presence chose `web` (or the memory edges appeared after login), the
  // trail's first use, and — the worst — every program in the scene at once
  // the moment the graphics tier turned the glow off, because drawing to the
  // screen instead of the bloom's target is a different program in three (its
  // output colour space is part of the key), and that switch happens precisely
  // when the governor has decided the machine is struggling.
  //
  // So everything is compiled here, up front, with three's compileAsync (which
  // uses KHR_parallel_shader_compile to build them off the main thread where
  // the browser has it; without it, compile() just issues them and the first
  // draw waits as before). The extension is asked about ONCE, with has():
  // compileAsync asks with get(), which prints a console warning on every call
  // where it is missing (SwiftShader, some Safari and Firefox builds) — a
  // dozen lines of noise a boot for no information. Without it the programs
  // are issued the same way and the promise resolves on the next task, which
  // is all compileAsync's own fallback does:
  //   1. the variant the next frame will draw — then drawing starts;
  //   2. a second later, everything else: the other variant of every scene
  //      material, the bloom's passes, the trail and its fade.
  // compile() walks every object, visible or not, so the hidden constellation,
  // memory edges, trail quad and parked tile are all in the first pass. It runs
  // after the current task (a microtask), so a graphics tier that main.js
  // applies synchronously right after createBody decides which variant is
  // "the one in use" — not the default.
  const PARALLEL = typeof renderer.compileAsync === 'function' && renderer.extensions?.has?.('KHR_parallel_shader_compile') === true;
  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 10));
  function compileFor(obj, target, into = scene) {
    const prev = renderer.getRenderTarget();
    let p = null;
    try {
      renderer.setRenderTarget(target);
      if (PARALLEL) p = renderer.compileAsync(obj, camera, into);
      else { renderer.compile(obj, camera, into); p = nextTask(); }
    } catch (err) {
      console.warn('[body] shader warm-up skipped:', err?.message || err);
    } finally {
      renderer.setRenderTarget(prev);
    }
    return Promise.resolve(p).catch(() => {});
  }
  // The bloom's own passes never appear in the scene (they draw full-screen
  // quads of their own), so they are compiled from a stand-in scene each: the
  // passes that draw into its mip targets, and the two that draw onto the
  // screen (the copy of the scene, which must carry its map or it compiles the
  // map-less variant, and the additive blend).
  const bloomQuad = new THREE.PlaneGeometry(2, 2);
  const bloomOff = new THREE.Scene(), bloomOn2 = new THREE.Scene();
  for (const m of [bloom.materialHighPassFilter, ...(bloom.separableBlurMaterials || []), bloom.compositeMaterial]) {
    if (m) bloomOff.add(new THREE.Mesh(bloomQuad, m));
  }
  if (bloom.basic && !bloom.basic.map) bloom.basic.map = composer.readBuffer.texture;
  for (const m of [bloom.basic, bloom.blendMaterial]) if (m) bloomOn2.add(new THREE.Mesh(bloomQuad, m));
  const WARM_MAX_MS = 1500;   // never hold the first picture longer than this
  let warmRestStarted = false;
  function warmRest() {
    if (warmRestStarted) return;
    warmRestStarted = true;
    const rt = composer.readBuffer;
    // one after another, so no two batches poll the same material's program
    compileFor(scene, null)
      .then(() => compileFor(scene, rt))
      .then(() => compileFor(bloomOff, rt, bloomOff))
      .then(() => compileFor(bloomOn2, null, bloomOn2))
      .then(() => compileFor(trailScene, rt, trailScene))
      .then(() => compileFor(fadeScene, rt, fadeScene));
  }
  // A world's programs (the env module builds one on first visit): the variant
  // in use first, the other after it. See createEnvironments' `warm`.
  function warmObject(obj) {
    const rt = composer.readBuffer;
    return compileFor(obj, bloomOn ? rt : null).then(() => compileFor(obj, bloomOn ? null : rt));
  }
  // The variant the first pass compiled: the glow's state when it started.
  // gfx calls setBloom and setQuality together, in either order, so neither
  // call can tell a switch from the other's echo — this can.
  let warmedFor = null;
  function warmFirst() {
    warmedFor = bloomOn;
    const rt = composer.readBuffer;
    return bloomOn
      ? Promise.all([compileFor(scene, rt), compileFor(bloomOff, rt, bloomOff), compileFor(bloomOn2, null, bloomOn2)])
      : compileFor(scene, null);
  }
  function prewarm() {
    const deadline = setTimeout(() => { warm = true; }, WARM_MAX_MS);
    const settle = () => {
      // the tier turned the glow over while its programs were building: build
      // the ones that will actually draw before the first frame does (the
      // deadline still bounds the wait)
      if (!warm && bloomOn !== warmedFor) { warmFirst().then(settle); return; }
      clearTimeout(deadline);
      warm = true;
      setTimeout(warmRest, 1000);
    };
    warmFirst().then(settle);
  }
  (typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => Promise.resolve().then(fn))(() => {
    try { prewarm(); } catch (err) { console.warn('[body] shader warm-up skipped:', err?.message || err); warm = true; }
  });
  frame();

  // The backdrop is the metal room itself — there is no visitor-set background
  // color any more. The clear color set at init (a fixed dark) only ever shows
  // through the seams behind the enclosing cube, which the camera never sees.

  // --- Paint mode: every node takes its color from Y3K's color anchors --------
  // Each node blends the anchors by angular distance (Shepard weighting), so a
  // handful of placed colors paint the whole 24k-node field. The work itself is
  // stepPaint, above the frame loop that runs it a slice at a time; this only
  // starts a palette (and replaces one still being laid down). `glow` is the
  // room's tint to arrive with it. Returns false for no anchors at all.
  function applyPaint(anchors, glow = null) {
    if (!anchors || !anchors.length) return false;
    if (!paintBuf) paintBuf = new Float32Array(COUNT * 3);
    paintJob = { anchors: anchors.map((a) => ({ dir: a.dir, rgb: a.rgb })), i: 0, glow, show: true };
    return true;
  }
  // A soft spectrum wrapped around the body — shown until Y3K paints its own.
  const DEFAULT_PAINT = [
    { dir: [0, 1, 0], rgb: [1.0, 0.85, 0.35] },  { dir: [1, 0, 0], rgb: [1.0, 0.38, 0.62] },
    { dir: [0, 0, 1], rgb: [0.55, 0.32, 1.0] },  { dir: [-1, 0, 0], rgb: [0.25, 0.8, 1.0] },
    { dir: [0, 0, -1], rgb: [0.35, 1.0, 0.6] },  { dir: [0, -1, 0], rgb: [1.0, 0.55, 0.25] },
  ];

  // THE HEART'S PEAK, baked and never a fit: the same ten bisections the shader
  // runs, over 512 fibonacci directions, once per digit and remembered. The
  // farthest point is the lobes, which lie in the plane P cannot thin, so it
  // hardly moves with the digit — measured anyway, because a fit is a guess.
  const heartG = (rho, Q, K) => { const q = rho * rho * Q - 1; return q * q * q - rho ** 5 * K; };
  const rootHeart = (Q, K) => { let lo = 0.3, hi = 1.7; for (let i = 0; i < 10; i++) { const mid = 0.5 * (lo + hi); if (heartG(mid, Q, K) < 0) lo = mid; else hi = mid; } return 0.5 * (lo + hi); };
  const heartPeaks = {};
  const heartPeak = (dz) => {
    if (heartPeaks[dz]) return heartPeaks[dz];
    let pk = 0;
    for (let i = 0; i < 512; i++) {
      const y = 1 - 2 * (i + 0.5) / 512, r = Math.sqrt(1 - y * y), ph = i * 2.399963229728653, x = r * Math.cos(ph), z = r * Math.sin(ph);
      pk = Math.max(pk, rootHeart(x * x + dz * z * z + y * y, y * y * y * (x * x + dz * 0.05 * z * z)));
    }
    return (heartPeaks[dz] = pk);
  };
  // THE CLOVER'S TABLE: P petals as the rose k = N/D, and the parity rule is
  // its period (pi D when N D is odd, else 2 pi D). Six needs 3/2 over two turns.
  const CLOVER = { 1: [1, 1], 2: [1, 2], 3: [3, 1], 4: [2, 1], 5: [5, 1], 6: [3, 2], 7: [7, 1], 8: [4, 1], 9: [9, 1] };
  // A presence writes one digit; each form reads it as its own quantity. Doing
  // the mapping here rather than in GLSL keeps the shader honest about units
  // and means a 0 (the digit you get when the model omits an argument) becomes
  // a sensible form rather than a degenerate one.
  const SHAPE_ID = { sphere: 0, shell: 1, ring: 2, disc: 3, helix: 4, lattice: 5, spiral: 6, cube: 7, ellipsoid: 8, super: 9, hopf: 10, calabi: 11, pendulum: 12, butterfly: 13, moon: 14, knot: 15, lissajous: 16, mobius: 17, dini: 18, nautilus: 19, heart: 20, plume: 21, clover: 22 };
  // The four families read ALL their digits, into the units each equation wants.
  // Same house rule as SHAPE_ARG: a 9 is expressive, never destructive, and a
  // missing digit is a good default rather than a zero — except super's m,
  // where 0 is meaningful (it IS the sphere) and is kept.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);   // for the knot: P and Q sharing a factor is a link of that many strands
  const SHAPE_UNITS = {
    // OPENNESS then THICKNESS. 9 is flat open, 1 is folded up over its back with
    // the abdomen showing below. A MISSING DIGIT IS THE RESTING POSTURE, 7 and 3
    // — and it has to be the `a || 7` idiom the other families use, because the
    // parser pads a missing digit with 0 and setShape passes `spec.a | 0`, so
    // this function never sees undefined. The first version tested for
    // undefined and a bare <<shape: butterfly>> arrived folded at a thickness
    // of 0.015. The cost of the idiom is that 0 cannot be said; 1 is the most
    // folded it goes, which is folded enough.
    butterfly: (a, b) => [0.25 + (a || 7) * 0.0833, 0.015 + (b || 3) * 0.020, 0, 0],
    ellipsoid: (a, b) => [0.2 + (a || 3) * 0.3, 0.2 + (b || 3) * 0.3, 0, 0],      // s1, s2: 0.5..2.9, 3 ≈ the sphere
    super:     (a, b, c) => [a | 0, 0.15 + (b || 2) * 0.4, 0.3 + (c || 5) * 0.5, 0], // m, n1, n2 — 'super 7 1 5' is the reel's starfish
    hopf:      (a, b) => [Math.max(1, a || 4), Math.max(1, b || 6), 0, 0],          // tori, fibres per torus
    calabi:    (a, b) => [Math.min(9, Math.max(2, a || 4)), (b || 3) / 9 * 1.5707963, 0, 0], // n, projection angle
    pendulum:  (a) => [a | 0, 0, 0, 0],   // the digit is ε, and it is spent on the CPU (see below); kept here for the record
    // P is the lune's width in radians: 1 a 20° sliver, 4 the crescent — and the
    // bare word, as the butterfly decided a missing digit is the classic — 5 a
    // half, 9 nearly full. 0 is unsayable: the idiom again.
    moon:      (a) => [0.35 + ((a || 4) - 1) * 0.31, 0, 0, 0],
    // T turns (the bare word is 4, as it always was) and R rungs a turn; 0 rungs is
    // the one strand, verbatim. The third slot is fs, the share of the field on
    // the strands, chosen so strands and rungs have one LINEAR density: strand
    // length is two helices of T turns, rung length is R*T chords of the strand
    // circle D apart. The shader's rho, hh, D are these.
    helix:     (a, b) => { const T = Math.max(1, a || 4), Rg = b | 0, rho = 0.42, hh = 0.85, D = 2.1; const Ls = 2 * T * Math.hypot(2 * Math.PI * rho, 2 * hh / T), Lr = Rg * T * 2 * rho * Math.sin(D / 2); return [T, Rg, Rg ? Ls / (Ls + Lr) : 1, 0]; },
    // P round, Q through; the bare word is the trefoil. The shader is handed the
    // reduced pair and the factor, so 'knot 2 4' is two linked rings, not a
    // doubled trefoil.
    knot:      (a, b) => { const P = a || 2, Q = b || 3, g = gcd(P, Q); return [P / g, Q / g, g, 0]; },
    // THE SECOND SHELF. A curve with no analytic peak is measured here, once per
    // sentence, in microseconds: 512 samples land within 1% of the true peak and
    // the shader's L > 1 clamp catches the rest. C is read as written — 0 is the
    // planar figure, and it is the LAST digit so worn's zero-dropping is harmless.
    lissajous: (a, b, c) => { const A = a || 1, B = b || 2, C = c | 0; let pk = 0; for (let i = 0; i < 512; i++) { const t = 2 * Math.PI * i / 512; pk = Math.max(pk, Math.hypot(Math.sin(A * t + Math.PI / 2), Math.sin(B * t), C ? Math.sin(C * t + Math.PI / 4) : 0)); } return [A, B, C, 1 / (pk + 0.05)]; },
    mobius:    (a, b) => [0.10 + (a || 4) * 0.035, Math.max(1, b || 1), 0, 0],   // W 0.135..0.415 (the quadratic wants W < 1), T half-twists 1..9 — a flat annulus is unreachable, which is honest
    // dini: S the needle (v0 0.05..0.41, 9 the longest), T the twist (0 a straight trumpet). h(pi/2) = 0, so the
    // height runs hv0..4 pi b; the mid-height and 1/sqrt(1 + hr^2) — the exact peak — are spent here, not per vertex
    dini:      (a, b) => { const S = a || 6, T = b | 0; const v0 = 0.05 + (9 - S) * 0.045, bb = T * 0.025; const hv0 = Math.cos(v0) + Math.log(Math.tan(v0 / 2)), top = 4 * Math.PI * bb; const hmid = (hv0 + top) / 2, hr = (top - hv0) / 2; return [v0, bb, hmid, 1 / Math.sqrt(1 + hr * hr)]; },
    // nautilus: T whorls (1.4..4.6, bare = 3), H ninths of a right angle about x; 1.487 is 1 + kappa, the shader's baked tube
    nautilus:  (a, b) => { const N = 1 + (a || 5) * 0.4, Th = 2 * Math.PI * N; return [N, (b | 0) / 9 * Math.PI / 2, 1 / (Math.exp(0.18 * Th) * 1.487), 0]; },
    // heart: P thins it in depth (dz 1.55..4.35; 3 is the classic 9/4, and the bare word); 1/peak from the same bisection the shader runs
    heart:     (a) => { const dz = 1.2 + (a || 3) * 0.35; return [dz, 1 / heartPeak(dz), 0, 0]; },
    // plume: S how wide it opens (the cone's slope, 0 at S 1 — a column — to 0.448), T how much it boils (0 none, and no fbm spent); the push is radial, so the peak is the boil's exact bound
    plume:     (a, b) => { const Sw = ((a || 4) - 1) * 0.056, Tb = (b | 0) * 0.03, w1 = 0.04 + Sw; return [Sw, Tb, 1 / Math.hypot(0.9, w1 + Tb * 1.3), 0]; },
    // clover: P petals, one digit through the table — k, and the period the parity rule gives it
    clover:    (a) => { const [N, D] = CLOVER[a || 5]; return [N / D, (N * D) % 2 ? Math.PI * D : 2 * Math.PI * D, 0, 0]; },
  };
  // (the swarm itself — `swarm` — is declared up beside onceTimer, ABOVE the
  // frame loop: frame() reads it and runs before this line does)
  // Opcodes, matching the branch ladder in shapeApply. `noise` is absent on
  // purpose — it is hoisted to its own slot rather than living in the loop.
  const OP_CODE = { ripple: 1, wave: 2, twist: 3, swirl: 4, pulse: 5, shatter: 6, gather: 7, spin: 8, flap: 9, hue: 10, sat: 11, bright: 12, dim: 13, taper: 14, stretch: 15, squash: 15, cup: 16, tilt: 17, bend: 18, sway: 19, tremble: 20, throb: 21, orbit: 22, rise: 23, fall: 23, melt: 24, vortex: 25 };
  const MASK_CODE = { top: 1, bottom: 2, left: 3, right: 4, front: 5, back: 6, band: 7, rand: 8, wedge: 9, part: 10, near: 11, level: 12, every: 13, patch: 14, lit: 15, ebb: 16, sweep: 17, face: 18, moving: 19 };
  // A heading, as the angle that carries the named world direction onto +x in
  // the shader's arm (see tilt and bend in shapeApply): front is +z, so a
  // quarter turn about y brings it to +x; left is -x, a half turn; back, three.
  const HEADING = { right: 0, front: Math.PI / 2, left: Math.PI, back: 3 * Math.PI / 2 };
  // ALIASES, NOT ARMS. @rim D and @core D are @near said from either end — the
  // outer ninth or the inner one, a digit taking them further in or out. They
  // resolve to arm 11's code and digits HERE, so there is one shell in the
  // shader and one place for it to drift.
  // @odd and @even are @every 2 1 and @every 2 0: the two halves, by index.
  const MASK_ALIAS = { rim: (d) => [11, Math.max(0, 8 - d) / 9, 1.05], core: (d) => [11, 0, Math.min(9, 1 + d) / 9], odd: () => [13, 2 / 9, 1 / 9], even: () => [13, 2 / 9, 0], shade: (d) => [15, d / 9, 1] };   // @shade D is @lit read from the troughs
  // @sweep F PLACE: the place is a WORD in the sentence and a digit in the
  // shader — the ternary in arm 17 reads these numbers, 0 being bare (a ring
  // growing from the centre). Beside the aliases because it is the same kind
  // of thing: a word resolved to arm digits here, once.
  const SWEEP_PLACE = { bottom: 1, top: 2, right: 3, left: 4 };
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
    // A how far (9 is 1.53 rad — the wing edge-on, measured as the most a flap
    // can be and still read as one), F how fast (a slow beat at 3, a flutter at
    // 9), S how far the second pair trails the first, in radians of the cycle.
    flap: (a) => [a[0] * 0.17, 0.5 + a[1] * 0.7, a[2] * 0.25],
    // H ninths of a turn round the wheel. 9 is all the way round, which is
    // where it started — so 'hue 9' is a wave that comes home, not a change.
    hue: (a) => [a[0] / 9, 0, 0],
    // pushes: -1 at 0, 0 at 4.5, +1 at 9 — a middle digit leaves the part alone
    sat: (a) => [(a[0] - 4.5) / 4.5, 0, 0],
    bright: (a) => [(a[0] - 4.5) / 4.5, 0, 0],
    // a removal only: 0 none, 9 gone
    dim: (a) => [a[0] / 9, 0, 0],
    // THE POSE FAMILY. taper: 9 narrows the crown to a fifth of its width — a
    // tenth blooms, because the length rule sees no compression at the crown.
    // stretch and squash share one opcode and spend the sign here.
    taper: (a) => [a[0] * 0.09, 0, 0],
    stretch: (a) => [a[0] * 0.04, 0, 0],
    squash: (a) => [-a[0] * 0.09, 0, 0],
    // A how far the rim rises, P how sharply: the exponent of r, 1 a cone up to 10 a lip
    cup: (a) => [a[0] * 0.06, 1 + a[1], 0],
    // a heading rides in F and S as its cosine and sine; a bare tilt nods toward
    // the person, a bare bend is a crescent you can see from the front
    tilt: (a, place) => { const h = HEADING[place || 'front']; return [a[0] * 0.349, Math.cos(h), Math.sin(h)]; },
    bend: (a, place) => { const h = HEADING[place || 'right']; return [a[0] * 0.155, Math.cos(h), Math.sin(h)]; },
    // THE LIVING FAMILY: A how far, F how fast, every one bounded in t so a
    // mask on it never shears apart over time the way a mask on spin does.
    // sway 9 is half a radian at the crown; F 0 a twelve-second sway, F 9 a wag
    sway: (a) => [a[0] * 0.055, 0.5 + a[1] * 0.6, 0],
    // tremble F 9 is 8.4 Hz — the ceiling is Nyquist on a 30 fps phone
    tremble: (a) => [a[0] * 0.006, 8.0 + a[1] * 5.0, 0],
    // throb 9 is 0.32: never reaches the clamp, even on excited; F 5 a resting heart
    throb: (a) => [a[0] * 0.035, 0.1 + a[1] * 0.15, 0],
    orbit: (a) => [a[0] * 0.02, 0.5 + a[1] * 0.8, 0],
    // THE STREAMS. rise and fall are one opcode; the sign is spent here, in S.
    // F 0 is a twenty-second climb, F 9 about one a second; 9 spans 0.27R
    rise: (a) => [a[0] * 0.03, 0.05 + a[1] * 0.1, 1],
    fall: (a) => [a[0] * 0.03, 0.05 + a[1] * 0.1, -1],
    // melt F 0 is set: cold wax, the honest missing digit
    melt: (a) => [a[0] * 0.033, a[1] * 0.08, 0],
    // vortex: A the funnel's depth in ninths; F the rim's rate, the axis five times it
    vortex: (a) => [a[0] / 9, a[1] * 0.25, 0],
  };
  const SHAPE_ARG = {
    shell: (a) => Math.max(2, a || 3),            // how many nested shells
    ring: (a) => 0.10 + (a || 4) * 0.04,          // tube radius, 0.14..0.46 of R
    lattice: (a) => Math.max(2, a || 4),          // cells across
    spiral: (a) => Math.max(2, a || 3),           // arms of the galaxy
  };

  const api = {
    moods: Object.keys(MOODS),
    schemes: SCHEMES.map((s) => s.key),
    setRoom, // settings → Room: environment / brightness / grooves / tint / glow
    envThumbnails: (n) => envs.thumbnails(n), // settings → Room: a photo of each world (one task; kept for compatibility)
    // The same photographs, one world a frame, cached for the page:
    // -> Promise<Array<{ id, url }>>. What the Room tab should use.
    envThumbnailsAsync: (n) => envs.thumbnailsAsync(n),
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
      if (paintJob) { paintJob.show = false; paintJob.glow = null; }   // including one still being laid down
      paintCount = 0;
    },
    // Paint mode: Y3K colors the whole field. enterPaint shows a default spectrum
    // until paintColors() applies the AI's own anchors.
    // (Paint arrives whole: a palette still being laid down switches uPaint on
    // itself when it is complete, so neither of these shows the white buffer or
    // the last palette in the meantime.)
    enterPaint() {
      if (paintJob) { paintJob.show = true; return; }    // on its way, and it turns itself on
      if (!hasPainted) applyPaint(DEFAULT_PAINT);
      else uniforms.uPaint.value = 1;
    },
    // Painting its own colors also switches the field INTO paint mode (uPaint=1),
    // so Y3K can move freely between a named palette and painting per reply.

    paintColors(anchors) {
      if (!applyPaint(anchors, anchors && anchors.length ? avgAnchorColor(anchors) : null)) uniforms.uPaint.value = 1;
      paintCount = anchors ? anchors.length : 0;
    },
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
      uniforms.uPatch.value.set(0, 0, 0, 0);
      uniforms.uScatter.value.x = 0;
      let slot = 0;
      for (const o of (spec.ops || [])) {
        if (o.op === 'scatter') {
          // hoisted like flow and noise: a parser op, no uniform slot, however
          // many times it is written
          uniforms.uScatter.value.x = Math.min(1, (o.args[0] | 0) / 9);
          continue;
        }
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
        const [x, y, z] = (OP_SCALE[o.op] || (() => [0, 0, 0]))(o.args || [], o.place || null);   // the heading a directed move carries
        ops[slot].set(code, x, y, z);
        // mask args are digits too; the shader wants them as 0..1 — and an
        // alias resolves to another arm's code and digits before anything else
        const mg = o.mask === 'sweep' ? [(o.margs || [])[0] | 0, SWEEP_PLACE[o.mplace] || 0] : (o.margs || []);   // a sweep's place rides as its second digit: 0 bare, 1..4 the way it rolls
        const alias = o.mask && Object.prototype.hasOwnProperty.call(MASK_ALIAS, o.mask) ? MASK_ALIAS[o.mask] : null;
        const [m, m0, m1] = alias ? alias(mg[0] | 0) : [MASK_CODE[o.mask] || 0, (mg[0] | 0) / 9, (mg[1] | 0) / 9];
        // ONE COAT PER SENTENCE: the first @patch decides how fine, and a CONSTANT
        // seed, never the slot — so a presence that adds a move ahead of its
        // patch keeps its coat, and the same coat comes back every time it is said
        if (o.mask === 'patch' && uniforms.uPatch.value.x === 0) uniforms.uPatch.value.set(0.8 + (mg[1] | 0) * 0.45, 17.0, 0, 0);
        masks[slot].set(m, m0, m1, o.not ? 1 : 0);   // w: @not, read at the ladder's call site
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
      // a field refilling past the gate takes a grammar-set trail with it —
      // the invariant is "a trail only ever runs on a sparse field", and it has
      // to hold whichever order the words were written in
      if (fieldTarget.keep > TRAIL_GATE) { trailPending = 0; if (trailByWord) { this.setTrail(0); trailByWord = false; } }
    },
    // TRAIL, as a word: one digit → seconds a point's path lingers (0 none, 9
    // three seconds), and it takes effect ONLY on a sparse field. On a full one
    // it is refused outright rather than clamped down, because a short trail
    // over 24,000 crisp points is still a disc.
    setTrailWord(digit) {
      const d = Math.max(0, Math.min(9, digit | 0));
      if (!d) { trailPending = 0; if (trailByWord) { this.setTrail(0); trailByWord = false; } return false; }
      // The TARGET says where the field is going; uKeep says where it IS. Both
      // have to be sparse. Gating on the target alone let "count 3 trail 6" —
      // the natural way to write it — switch the trail on while 24,000 points
      // were still easing out, and a max-composite over a full field is the
      // white disc. Gating on the live value alone would refuse that phrasing
      // outright and never reconsider. So: refuse a trail the field is not
      // heading toward, and HOLD one it is, until the field has actually gone.
      if (fieldTarget.keep > TRAIL_GATE) { trailPending = 0; if (trailByWord) { this.setTrail(0); trailByWord = false; } return false; }
      if (uniforms.uKeep.value > TRAIL_GATE) { trailPending = d; if (trailByWord) { this.setTrail(0); trailByWord = false; } return true; }
      trailPending = 0;
      this.setTrail(d / 3);
      trailByWord = true;
      return true;
    },
    // GRAIN: the size of each point. 4 is the size that shipped; 0 is dust, 9 pebbles.
    setGrain(digit) {
      const d = Math.max(0, Math.min(9, digit | 0));
      uniforms.uGrain.value = 0.45 + d * 0.14;
    },
    grain() { return Math.round((uniforms.uGrain.value - 0.45) / 0.14); },
    // MESH: 0 the even scatter, 9 a lat/long grid of the same nodes — forms
    // read as dotted wireframes. Eases at the body's pace like a form does.
    setMesh(digit) { meshTarget = Math.max(0, Math.min(9, digit | 0)) / 9; },
    mesh() { return Math.round(meshTarget * 9); },
    // GLOW: the bloom's strength, 0 matte to 9 radiant; 3 is the 0.8 that shipped.
    setGlow(digit) { glowTarget = 0.2 + Math.max(0, Math.min(9, digit | 0)) * 0.2; },
    glow() { return Math.round((glowTarget - 0.2) / 0.2); },
    // TURN: direction and speed of the idle spin. 3 is the speed that shipped.
    setTurn({ dir = 'right', speed = 3 } = {}) {
      const sp = Math.max(0, Math.min(9, speed | 0)) / 3;
      if (faceHeld && !faceHeld.spins) faceHeld = null;   // a turn releases a yaw face: the two would fight
      idleTurn = dir === 'still' ? 0 : (dir === 'left' ? -1 : 1) * sp;
    },
    // FACE: a side of the body turned to the glass and HELD — the six words it
    // already paints with, and T how far (9 all the way). Left, right, back
    // and front stop the turn, because a yaw face and a yaw spin would fight;
    // top and bottom keep it, inside the face, about the body's own axis — a
    // ring tilted and still spinning is Saturn. The arrival is updateTrackball's.
    setFace(dir, t = 9) {
      if (!Object.prototype.hasOwnProperty.call(NAMED_DIR, dir)) return;
      const T = Math.max(0, Math.min(9, t | 0));
      const spins = dir === 'top' || dir === 'bottom';
      faceHeld = { dir, t: T, q: faceQuat(dir, T, new THREE.Quaternion()), spins };
      faceTheta = 0;
      if (!spins) idleTurn = 0;
    },
    face() { return faceHeld ? { dir: faceHeld.dir, t: faceHeld.t } : null; },
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
    // 'home': back to the centre of the glass, and the place and the depth are
    // FORGOTTEN. A
    // landing (fly 0 0 0) goes back to where it was put; home has nowhere to
    // go back to. One word, no digits — the first body word of its kind.
    home() { placeDigits = null; flying = null; depthDigit = null; fieldTarget.off.set(0, 0, 0); aimOffset(); },
    // 'at X Y': a place, in digits. Lands any flight. 4-5 is the centre.
    setPlace(dx, dy) {
      const d = (v) => Math.max(0, Math.min(9, v | 0));
      placeDigits = [d(dx), d(dy)];
      flying = null;
      aimOffset();
    },
    // 'depth D': how near, in one digit. 4-5 the glass, 9 halfway to the person
    // (and twice the size), 0 twice as far (and half). Closer is depth; bigger
    // is size. A digit like a place, so the same word is the same nearness on
    // any window; home puts it back on the glass.
    setDepth(d) { depthDigit = Math.max(0, Math.min(9, d | 0)); aimOffset(); },
    depth() { return depthDigit; },
    // A FLIGHT: a STATE the frame loop keeps drawing around the place, never a
    // path the presence authored. 'fly W H R' is a figure of eight W wide and
    // H tall as ninths of the room left around the place, at rate R — kind
    // 'eight', an implementation name the presence never says; 'circle W R'
    // is a lap, kind 'circle'; 'bounce H R' a ball dropping below the place,
    // kind 'bounce'; 'wander W R' a walk with nowhere to be, kind 'wander'. No
    // width and no height lands, back at the place it was put, or home. One
    // setter: a flight is a kind, a rate table and an arm in aimOffset.
    setFly({ w = 0, h = 0, r = 3 } = {}) { this.setFlight({ kind: 'eight', w, h, r }); },
    setFlight({ kind = 'eight', w = 0, h = 0, r = 3 } = {}) {
      const d = (v) => Math.max(0, Math.min(9, v | 0));
      if (!d(w) && !d(h)) { flying = null; if (!placeDigits) fieldTarget.off.set(0, 0, 0); aimOffset(); return; }
      const K = FLIGHT_RATE[kind] ? kind : 'eight';
      flying = { kind: K, w: d(w) / 9, h: d(h) / 9, r: FLIGHT_RATE[K](d(r)), R: d(r), t0: Date.now() };
      aimOffset();
    },
    // 'follow SRC': come with the person — trail a source across the room and
    // stop a step short. ONE SLOT WITH THE FLIGHTS, so a place or home ends it
    // and a flight replaces it; the word is kept even with no source or no
    // camera, and then it simply holds — the lesson says so. last is the held
    // target; the digits are zero so nothing that reads a flight sees NaN.
    setFollow(src) {
      src = String(src || 'hand');
      flying = { kind: 'follow', src, last: null, w: 0, h: 0, r: 0, R: 0, t0: Date.now() };
      aimOffset();
    },
    following() { return flying && flying.kind === 'follow' ? flying.src : null; },
    // a source of the followable kind; null (or anything not a function) unhooks it
    setFollowSource(name, fn) { if (typeof fn === 'function') followSources[name] = fn; else delete followSources[name]; },
    // where it is AND what it is flying — both, since a flight is around the place
    place() {
      if (!placeDigits && !flying) return null;
      const out = {};
      if (placeDigits) out.at = placeDigits.slice();
      if (flying) {
        const W = Math.round(flying.w * 9), H = Math.round(flying.h * 9), R = flying.R;
        out[FLIGHT_WORD[flying.kind]] = flying.kind === 'follow' ? flying.src : flying.kind === 'eight' ? [W, H, R] : flying.kind === 'bounce' ? [H, R] : [W, R];
      }
      return out;
    },
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
      applyTrail(seconds);
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

    // THE BODY'S SIZE, as a multiplier. 1 is whatever the mood says; the hands
    // move it between a half and a little under double, which is as far as the
    // room can take it before the field starts clipping the walls.
    setSwell(k) { swell = Math.max(0.5, Math.min(1.8, +k || 1)); },
    swell() { return +swell.toFixed(3); },
    // 'size S': the same thing two open hands do, as a word. 4 is the size the
    // mood gives you; 0 is SMALL (0.55) and 9 is BIG (1.8), the hands' own
    // limits in src/twohand.js, on two log ramps that meet at 1. size() is the
    // inverse, so the hands' size is a word too and a hand and a word end in
    // one representation (LANGUAGE.md, line 6). The radial clamp in both
    // shaders scales with uRadius, or a big SHAPE would stop at size 6.
    setSize(d) { const S = Math.max(0, Math.min(9, d | 0)); this.setSwell(S <= 4 ? Math.pow(0.55, (4 - S) / 4) : Math.pow(1.8, (S - 4) / 5)); },
    size() { const s = swell; return Math.round(s < 1 ? 4 - 4 * Math.log(s) / Math.log(0.55) : 4 + 5 * Math.log(s) / Math.log(1.8)); },

    // THE HANDS TURN IT. Every fingertip on the body adds its own movement to
    // this frame's total, in screen pixels — so a hand sweeping one way and a
    // hand sweeping the other partly cancel, and five fingers move it more than
    // two. Summed, never averaged: that is the difference between pushing a
    // thing with more of your hand and pushing it with less.
    // A PALM TO THE SCREEN STOPS IT, and holds it stopped.
    halt(on) { halted = Boolean(on); if (halted) { handPush.x = 0; handPush.y = 0; handPush.n = 0; handPush.on = 0; } },
    halted() { return halted; },

    // A MOVEMENT. Only ever called on a frame the tracker actually refreshed —
    // the caller owns that, because only it knows when the reading is new.
    handSpin(dx, dy) {
      if (halted || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      handPush.x += dx * ROT_SPEED; handPush.y += dy * ROT_SPEED; handPush.n += 1;
    },

    // FINGERS ARE ON IT. Said every frame, news or not, so that letting go is
    // the frame the last one leaves rather than the next frame the tracker
    // happens to skip.
    // Off means the scene is drawn straight to the screen, with no composer and
    // no mip chain. Nothing else about the body changes.
    setBloom(on) { bloomOn = Boolean(on); },

    // THE WHOLE GRAPHICS PROFILE (gfx.js; see CONTRACT §1 for its fields).
    //   bloom   the glow, as setBloom. Both variants are compiled at boot, so the
    //           switch no longer recompiles the scene (see prewarm).
    //   maxDpr, scale, and in smooth a pixel budget: the canvas resolution
    //           (targetPixelRatio). Reallocates only when the number changes.
    //   detail  'lite': two octaves of noise instead of four in the orb and
    //           the web, three at most in the skies, and no trail. Uniforms,
    //           so it is never a recompile.
    //   tier    'smooth' also draws every other frame while a panel or Code
    //           is in front of the orb (see frame()).
    setQuality(p) {
      if (!p || typeof p !== 'object') return;
      if (typeof p.bloom === 'boolean') bloomOn = p.bloom;
      if (p.tier) quality.tier = String(p.tier);
      quality.half = quality.tier === 'smooth';
      quality.budget = quality.tier === 'smooth' ? SMOOTH_BUDGET : 0;
      const maxDpr = Number(p.maxDpr);
      if (maxDpr > 0) quality.maxDpr = maxDpr;
      const scale = Number(p.scale);
      if (scale > 0) quality.scale = Math.min(1, scale);
      const lite = p.detail === 'lite';
      if (lite !== quality.lite) {
        quality.lite = lite;
        uniforms.uOct.value = lite ? 2 : 4;
        envs.setDetail(lite ? 'lite' : 'full');
        if (lite && trailOn) { applyTrail(0); trailByWord = false; }
        if (lite) trailPending = 0;
      }
      // the glow turned over before the boot's second compile pass (the one
      // that builds the other variant) has run: run it now, not in a second
      if (warm && warmedFor !== null && bloomOn !== warmedFor) warmRest();
      const w = container.clientWidth || window.innerWidth || 800;
      const h = container.clientHeight || window.innerHeight || 600;
      if (prChanged(targetPixelRatio(w, h))) resize();
    },
    quality() { return { ...quality, bloom: bloomOn, pixelRatio: renderer.getPixelRatio() }; },

    handTouch(n) {
      if (halted) return;
      handPush.on += (n | 0);
    },

    // A PLACE ON THE BODY, TAKEN HOLD OF. Screen pixels in; the anchor is
    // stored in the body's OWN space, so it turns with the body rather than
    // sliding across it.
    pinchAt(slot, x, y) {
      const i = slot ? 1 : 0;
      const o = this.orbPx();
      if (!(o.r > 0)) return false;
      const u = (x - o.x) / o.r, v = (y - o.y) / o.r;
      const q = u * u + v * v;
      if (q > 1) return false;                        // not on the body
      // The near face of the sphere, under that pixel. The camera has no
      // rotation of its own, so its axes are the world's.
      const w = Math.sqrt(Math.max(0, 1 - q));
      const dir = new THREE.Vector3(u, -v, w).applyQuaternion(_invRig());
      pinches[i] = { dir, px: x, py: y };
      const U = i === 0 ? uniforms.uPinchA : uniforms.uPinchB;
      U.value.set(dir.x, dir.y, dir.z, PINCH_REACH);
      return true;
    },
    // ...and dragged. The displacement is the distance the hand has travelled
    // since it took hold, in world units, likewise in the body's own space.
    pinchTo(slot, x, y) {
      const i = slot ? 1 : 0;
      const p = pinches[i];
      if (!p) return;
      const h = renderer.domElement.clientHeight || window.innerHeight || 600;
      const perPx = win.halfH > 0 ? ((win.halfH * 2) / h) * depthK(offWorld.z) : 0;   // a pixel is fewer world units on a nearer body
      const d = _pinchD.set((x - p.px) * perPx, -(y - p.py) * perPx, 0).applyQuaternion(_invRig());   // scratch: this runs per hand frame
      const UV = i === 0 ? uniforms.uPinchAV : uniforms.uPinchBV;
      UV.value.copy(d);
    },
    pinchEnd(slot) { pinches[slot ? 1 : 0] = null; },
    pinching() { return [!!pinches[0], !!pinches[1]]; },

    // WHERE THE BODY ACTUALLY IS ON THE SCREEN, in pixels. Anything that wants
    // to know whether a point is ON the orb has to ask, because the honest
    // answer moves: the radius rides the mood, the hands scale it, the window
    // is refitted on every resize, and the displacement breathes. A constant
    // fraction of the viewport is right at exactly one size of window and one
    // mood, and wrong everywhere else.
    //
    // The centre is the centre of the canvas, and stays there even with the
    // window running: a point at the origin sits ON the pane of glass, and the
    // whole property of that plane is that it does not move however the viewer
    // does. One of the nicer consequences of the frustum being a window.
    orbPx() {
      // IN WINDOW PIXELS, through the frame (see frameRect): the hands and
      // the pointer ask in window pixels. Unframed, at the window's origin,
      // this is exactly the canvas-centre arithmetic it replaced.
      const f = frameRect();
      const h = f.h, w = f.w;
      // uAmp is the noise displacement riding on the radius: the outermost
      // particles are that much further out than the surface.
      // ...and nearer is bigger: dist / (dist - z), from the EASED depth, so the
      // disc grows with the glide. (The eye window's parallax on a body off the
      // glass is not in this number; the hands and the eye are seldom on together.)
      const S = 1 / depthK(offWorld.z);
      const r = (uniforms.uRadius.value + uniforms.uAmp.value) * S;
      const px = win.halfH > 0 ? (r / win.halfH) * (h / 2) : Math.min(w, h) * 0.30;
      // AND WHERE IT ACTUALLY IS. This returned the canvas centre unconditionally,
      // which was true for as long as nothing could move the body — the moment
      // 'at' or 'fly' can, every hand gesture gated on onOrb() would aim at empty
      // air and pinchAt's "not on the body" would refuse every grab. The CURRENT
      // uOffset, not the target, so the disc rides the glide.
      const o = offWorld;                 // the world offset — the uniform is rig-local
      const ox = win.halfW > 0 ? ((o.x * S) / win.halfW) * (w / 2) : 0;
      const oy = win.halfH > 0 ? ((o.y * S) / win.halfH) * (h / 2) : 0;
      return { x: f.cx + ox, y: f.cy - oy, r: px };
    },

    // THE WINDOW. The source is a function returning perceive's head snapshot —
    // a PULL, so a stalled eye cannot stall the frame and a slow frame cannot
    // stall the eye. Hand it null to unhook, which also restores three's own
    // projection on the next frame.
    setEyeSource(fn) {
      eyeSource = typeof fn === 'function' ? fn : null;
      eyeFilt.reset(); eyeBase.n = 0;
    },
    // 0..1. Zero is off, and off means the camera is left exactly where
    // fitCamera put it. Under prefers-reduced-motion the top of the dial is a
    // fifth of what it otherwise is — capped, not removed, because someone may
    // want it anyway and the setting has to stay reachable.
    setEye(v) { eyeGain = Math.max(0, Math.min(1, +v || 0)); },
    eye() {
      return {
        gain: +eyeGain.toFixed(3), reduced: REDUCED, hooked: !!eyeSource,
        tracking: !eyeSymmetric,
        at: [+eyeAt.x.toFixed(4), +eyeAt.y.toFixed(4), +eyeAt.z.toFixed(4)],
        window: { halfW: +win.halfW.toFixed(3), halfH: +win.halfH.toFixed(3), dist: +win.dist.toFixed(3) },
        // The live matrix and seat, so the two invariants this feature rests on
        // can be checked against the RUNNING camera rather than against a
        // mirror of its arithmetic: a point on the glass must project to the
        // same place at every eye position, and a point behind it must not.
        proj: Array.from(camera.projectionMatrix.elements),
        seat: [+camera.position.x.toFixed(4), +camera.position.y.toFixed(4), +camera.position.z.toFixed(4)],
      };
    },
  };
  // The dev handle is built long before the api exists, so hand it over here.
  // Without this there is no way to drive a posture from the console at all —
  // which is the whole point of this stage.
  if (typeof window !== 'undefined' && window.__y3kScene) window.__y3kScene.body = api;
  return api;
}
