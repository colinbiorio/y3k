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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createEnvironments } from './environments.js';

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
uniform float uShapeMix,uShapeA,uShapeB,uShapeTime,uNoiseAmp,uNoiseFreq;
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
uniform float uHueBase,uHueRange,uHueFlow,uHueSweep,uSat,uVal,uCFreq,uSpeckle;
attribute float aRand;
attribute vec3 aColor;                 // per-node color for paint mode
attribute float aMem;                  // which memory claimed this mote, or -1
attribute float aHalo;                 // 1 at the node, falling off through its neighbours
uniform float uMemOn;                  // eased 0->1 as the layer comes up
uniform float uMemPick;                // the held memory, or -1 for none
uniform sampler2D uMemTex;             // per-memory state, one texel each
uniform float uMemCols;
varying float vHue,vSat,vVal,vShade,vFil,vRibbon;
varying float vMem;                    // 0 for ordinary dust; >0 for a memory
varying float vMemId;                  // WHICH memory, for the pick pass; -1 for dust
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
  gl_PointSize=uSize*(1.0+uAudio*0.6)*(uPointK/-mv.z)*(0.55+aRand*0.9)*(1.0+vRibbon*0.7);
  // Every form that gathers the cloud inward raises points-per-pixel, and the
  // comment above says exactly where that ends: the sphere goes white. Rather
  // than a per-shape table — which cannot know about a move that gathers, and
  // was measured ~6x too generous on lattice anyway — each node pays for its
  // OWN compression, by how far in it actually travelled. Free, and it cannot
  // be wrong about a form nobody has written yet.
  gl_PointSize*=mix(1.0, clamp(length(pos)/max(uRadius,1e-3), 0.30, 1.0), uShapeMix);
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
  // THE TEXEL IS A MULTIPLIER, and at rest it decodes to exactly 1.0 — so the
  // old max(aHalo, memState) was max(x, 1.0), which is 1.0 for every mote in
  // the cluster and threw the halo falloff away entirely. Each memory rendered
  // as a flat disc with a hard edge, the precise thing the falloff exists to
  // prevent. But a FULL falloff is worse: a memory becomes one bright mote and
  // fifty-nine faint ones, which at this scale is nothing at all — the 60-mote
  // budget is what gives a memory presence in the orb. So the falloff shapes
  // the cluster without hollowing it: a bright core easing to half at the rim.
  vMem = on * memState * (0.45 + 0.55 * aHalo);
  // AND THE REST STAND BACK while one memory is held. Lifting the chosen one
  // alone moves it about a quarter, which against an already-bright node does
  // not read as an answer to 'which did I just tap'. Suppression does what
  // amplification could not — the same lesson the edges taught.
  if (uMemPick > -0.5 && aMem > -0.5 && abs(aMem - uMemPick) > 0.5) vMem *= 0.22;
  vMemId = aMem;                       // unused by FRAG; PICK_FRAG reads it
  // a claimed mote is a little larger, so a node reads as a node and not as a
  // slightly whiter grain of the same dust
  gl_PointSize *= 1.0 + vMem * 0.9;
  vHue=fract(hue);
  vSat=mix(uSat, mix(0.05,0.95,spk), uSpeckle);
  vVal=uVal;
  vPaintCol=aColor;
  vShade=clamp(disp*1.5+0.5,0.0,1.0);   // crests bright, troughs dim
  vFil=pow(clamp(disp,0.0,1.0),2.0);     // near-white filaments on the peaks
}`;

const FRAG = /* glsl */`
precision highp float;
uniform float uDotFade,uPaint;
uniform vec3 uEnvGlow;
varying float vHue,vSat,vVal,vShade,vFil,vRibbon;
varying float vMem;
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
  float edge=smoothstep(0.5,0.08,r);
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
  float alpha=edge*(0.40+0.60*vShade)*uDotFade;
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
  gl_FragColor=vec4(col,alpha);
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

// THE PICK PASS. The motes are placed by the vertex shader — noise, the shape
// stack, the audio swell — so the CPU does not know where any of them ended up
// on screen, and rebuilding that arithmetic in JS would be a second
// implementation drifting away from the first the moment either changed.
// So we ask the GPU where they are: render the SAME geometry through the SAME
// VERT into a small offscreen window around the pointer, writing each mote's
// memory index as a colour, and read one back. Whatever moved the mote moved
// the answer with it, for free and forever.
const PICK_FRAG = /* glsl */`
precision highp float;
varying float vMemId;
void main(){
  if (vMemId < 0.0) discard;           // ordinary dust is not pickable
  // round, not square: without this the hit area is the point sprite's quad and
  // taps between two motes land on whichever quad is wider
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  float id = vMemId + 1.0;             // 0 is reserved for 'nothing here'
  gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 0.0, 1.0);
}`;

// Constellation web: line endpoints carry unit-sphere positions and run through
// the SAME displacement as the dots (minus glitch), so the lattice flexes with
// the field. Shares the dots' uniform objects so it stays in lockstep.
const LINE_VERT = /* glsl */`
uniform float uTime,uAmp,uFreq,uSpeed,uRadius,uAudio;
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
      // THE ORB IS ASKED FIRST. A tap that lands on a memory opens that memory;
      // only a tap that hits none of them falls through to lighting a panel of
      // the room, which is what every tap used to do.
      const hit = pickMemoryAt(e.clientX, e.clientY);
      if (hit >= 0 && onMemTap) { selectMemory(hit); onMemTap(hit, memGraph.nodes[hit]); }
      else if (memSelected >= 0 && onMemTap) {
        // A tap that lands on nothing while a memory is open means "put it
        // down" — one gesture with one meaning. It does NOT also light a panel
        // of the room underneath; that would be two answers to one tap.
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
    if (idleEnabled && resumeTimer === 0) spin(IDLE_SPEED, 0);
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
  geo.setAttribute('aColor', new THREE.BufferAttribute(colorAttr, 3));
  geo.setAttribute('aMem', new THREE.BufferAttribute(memAttr, 1));
  geo.setAttribute('aHalo', new THREE.BufferAttribute(haloAttr, 1));

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
    // The shape stack. uShapeTime runs off a SHARED wall clock, not uTime:
    // uTime accumulates clock.getDelta() per tab, so two people watching one
    // broadcast would sit at different phases of every sine in the stack.
    uShapeMix: { value: 0 }, uShapeId: { value: 0 }, uShapeA: { value: 0 },
    uShapeB: { value: 0 }, uShapeTime: { value: 0 },
    uNoiseAmp: { value: 0 }, uNoiseFreq: { value: 1 },
    // The memory layer. uMemTex is a 64x64 byte texture, one texel per memory,
    // so selection later costs one texSubImage instead of a 24,000-float
    // attribute upload. NearestFilter because a texel is a record, not a colour.
    uMemOn: { value: 0 }, uMemCols: { value: MEM_COLS }, uMemPick: { value: -1 },
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

  // The pick pass lives in a scene of its own holding nothing but the same
  // geometry: no room, no core, no lines, nothing to mask a mote or tint an id.
  // pickRig copies rig's WORLD matrix rather than its local one, so the answer
  // stays right if the rig is ever nested under anything.
  const pickMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: PICK_FRAG,
    transparent: false, depthWrite: true, depthTest: true, blending: THREE.NoBlending,
  });
  pickMat.toneMapped = false;          // an id is a number, not a colour to grade
  const pickScene = new THREE.Scene();
  const pickRig = new THREE.Object3D();
  pickRig.matrixAutoUpdate = false;
  pickRig.add(new THREE.Points(geo, pickMat));
  pickScene.add(pickRig);
  const PICK_W = 15;                   // odd, so there is a true centre pixel
  const pickTarget = new THREE.WebGLRenderTarget(PICK_W, PICK_W, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });
  const pickBuf = new Uint8Array(PICK_W * PICK_W * 4);

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
      // BY REFERENCE, every one of them: LINE_VERT keeps its own uniform map,
      // so any shape uniform left out here would silently never reach the web.
      uShapeMix: uniforms.uShapeMix, uShapeId: uniforms.uShapeId, uShapeA: uniforms.uShapeA,
      uShapeB: uniforms.uShapeB, uShapeTime: uniforms.uShapeTime,
      uNoiseAmp: uniforms.uNoiseAmp, uNoiseFreq: uniforms.uNoiseFreq,
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
      uShapeMix: uniforms.uShapeMix, uShapeId: uniforms.uShapeId, uShapeA: uniforms.uShapeA,
      uShapeB: uniforms.uShapeB, uShapeTime: uniforms.uShapeTime,
      uNoiseAmp: uniforms.uNoiseAmp, uNoiseFreq: uniforms.uNoiseFreq,
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
  let currentMoodName = 'calm';
  let currentSchemeKey = 'aurora';
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

  // WHICH MEMORY IS UNDER THAT POINT. Returns its index, or -1.
  //
  // The window is 15px rather than 1 because this is a touch target: a finger
  // is not a pixel, and a mote is two. We take the hit nearest the centre so a
  // tap between two memories resolves to the one actually aimed at, and we
  // fatten the motes for the pass only — uSize is restored before the next
  // frame is drawn, so nothing on screen ever shows it.
  const _pickSize = new THREE.Vector2();
  function pickMemoryAt(clientX, clientY) {
    if (!memGraph || !memGraph.nodes || !memGraph.nodes.length) return -1;
    if (uniforms.uMemOn.value < 0.05) return -1;    // the layer is not up; nothing to aim at
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    renderer.getDrawingBufferSize(_pickSize);
    const bw = _pickSize.x, bh = _pickSize.y;
    const px = Math.round(((clientX - rect.left) / rect.width) * bw);
    const py = Math.round(((clientY - rect.top) / rect.height) * bh);
    const half = (PICK_W - 1) / 2;
    pickRig.matrix.copy(rig.matrixWorld);
    const wasSize = uniforms.uSize.value;
    const wasTarget = renderer.getRenderTarget();
    uniforms.uSize.value = wasSize * 2.2;
    camera.setViewOffset(bw, bh, px - half, py - half, PICK_W, PICK_W);
    renderer.setRenderTarget(pickTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(pickScene, camera);
    renderer.readRenderTargetPixels(pickTarget, 0, 0, PICK_W, PICK_W, pickBuf);
    renderer.setRenderTarget(wasTarget);
    camera.clearViewOffset();
    uniforms.uSize.value = wasSize;
    // nearest hit to the centre wins
    let best = -1, bestD = 1e9;
    for (let y = 0; y < PICK_W; y++) for (let x = 0; x < PICK_W; x++) {
      const o = (y * PICK_W + x) * 4;
      const id = pickBuf[o] + pickBuf[o + 1] * 256;
      if (!id) continue;
      const d = (x - half) * (x - half) + (y - half) * (y - half);
      if (d < bestD) { bestD = d; best = id - 1; }
    }
    return best < memGraph.nodes.length ? best : -1;
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
    memTex.needsUpdate = true;
    uniforms.uMemPick.value = memSelected;
    return memSelected;
  }

  let shapeMixTarget = 0;
  let onceTimer = null;      // the `once` envelope: a gesture lets go by itself
  const shapeT0 = Date.now();

  const clock = new THREE.Clock();
  let envLast = 0;   // environments run on their own elapsed clock (drifting dust, aurora)
  function frame() {
    requestAnimationFrame(frame);
    uniforms.uTime.value += clock.getDelta();

    const k = 0.045;
    for (const key of EASE_KEYS) {
      const u = uniforms['u' + key[0].toUpperCase() + key.slice(1)];
      if (u) u.value = lerp(u.value, target[key] ?? 0, k);
    }

    audioLevel = lerp(audioLevel, audioTarget, 0.2);
    uniforms.uAudio.value = Math.min(audioLevel + speakingBoost, 1.4);
    envs.tick(clock.getElapsedTime() - envLast, clock.getElapsedTime());
    envLast = clock.getElapsedTime();
    uniforms.uPlasma.value = lerp(uniforms.uPlasma.value, plasmaTarget, 0.06);
    // A posture ARRIVES; it never snaps. Same k as every mood key above.
    uniforms.uShapeMix.value = lerp(uniforms.uShapeMix.value, shapeMixTarget, k);
    uniforms.uShapeTime.value = (Date.now() - shapeT0) / 1000;
    if (memJob) stepMemJob();                       // ≤4 ms, then the frame goes on
    uniforms.uMemOn.value = lerp(uniforms.uMemOn.value, memOnTarget, 0.06);
    // The edges ride the same ease as the nodes, through their own opacity
    // rather than a uniform, so LINE_FRAG stays shared with the constellation.
    // memEdgeEase is the toggle's own ease and nothing else — folding uMemOn
    // into the STATE makes it a feedback term that settles well short of 1.
    memEdgeEase = lerp(memEdgeEase, memEdgesOn && memEdgeCount > 0 ? 1 : 0, 0.06);
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
  const SHAPE_ID = { sphere: 0, shell: 1, ring: 2, disc: 3, helix: 4, lattice: 5, spiral: 6, cube: 7 };
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
    },
    // Paint mode: Y3K colors the whole field. enterPaint shows a default spectrum
    // until paintColors() applies the AI's own anchors.
    enterPaint() { if (!hasPainted) applyPaint(DEFAULT_PAINT); uniforms.uPaint.value = 1; },
    // Painting its own colors also switches the field INTO paint mode (uPaint=1),
    // so Y3K can move freely between a named palette and painting per reply.
    paintColors(anchors) { applyPaint(anchors); uniforms.uPaint.value = 1; setRoomGlow(avgAnchorColor(anchors)); },
    // THE POSTURE, as a program rather than as positions. Takes what
    // tags.mjs's parseShape produced; null (or 'sphere') goes home. Stage 2
    // reads only the form — the moves land in the next stage.
    setShape(spec) {
      // A bare sphere with nothing done to it IS home — go back rather than
      // holding an identity transform at full mix.
      const bare = !spec || (spec.shape === 'sphere' && !(spec.ops || []).length && !(spec.pull || []).length);
      if (bare) { shapeMixTarget = 0; if (onceTimer) { clearTimeout(onceTimer); onceTimer = null; } return; }
      const id = SHAPE_ID[spec.shape];
      if (id === undefined) { shapeMixTarget = 0; return; }
      uniforms.uShapeId.value = id;
      uniforms.uShapeA.value = (SHAPE_ARG[spec.shape] || (() => 0))(spec.a | 0);
      uniforms.uShapeB.value = spec.b | 0;

      const ops = uniforms.uOp.value;
      const masks = uniforms.uOpMask.value;
      for (let i = 0; i < ops.length; i++) { ops[i].set(0, 0, 0, 0); masks[i].set(0, 0, 0, 0); }
      uniforms.uNoiseAmp.value = 0;
      let slot = 0;
      for (const o of (spec.ops || [])) {
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
      if (spec.once) onceTimer = setTimeout(() => { shapeMixTarget = 0; onceTimer = null; }, 1400);
    },
    // THE ORB IS MADE OF ITS MEMORIES. Hand it a graph from memorygraph.mjs and
    // each memory claims a mote that is already there and brightens it.
    setMemoryGraph(graph) { startMemJob(graph); },
    setMemoryVisible(on) { memOnTarget = on ? 1 : 0; },
    setMemoryEdges(on) { memEdgesOn = !!on; },
    onMemoryTap(fn) { onMemTap = typeof fn === 'function' ? fn : null; },
    selectMemory(i) { return selectMemory(i); },
    selectedMemory() { return memSelected; },
    pickMemoryAt(x, y) { return pickMemoryAt(x, y); },
    memoryCount() { return memGraph && memGraph.nodes ? memGraph.nodes.length : 0; },
    // shown vs found, so the cap is visible to anyone asking rather than implied
    memoryEdges() { return { shown: memEdgeCount, found: memEdgeTotal }; },
    setCore(on) { core.visible = on; if (!on) coreMat.opacity = 0; },
    setConstellation(on) { lines.visible = on; dotFadeForm = on ? 0.4 : 1.0; },
    // Posture: set core + web + plasma together from a named form (body language).
    setForm(name) {
      const f = FORM_MAP[name] || FORM_MAP.orb;
      core.visible = f.core; if (!f.core) coreMat.opacity = 0;
      lines.visible = f.lines; dotFadeForm = f.lines ? 0.4 : 1.0;
      plasmaTarget = f.plasma ? 1 : 0;
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
