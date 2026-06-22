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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const COUNT = 24000;

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

// Theme persistence: background hue/tint + field scheme + form.
const THEME_KEY = 'y3k.theme';
const THEME_DEFAULT = { bgHue: 0.72, bgTint: 0.30, scheme: 'aurora', form: 'auto' };
export function getTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_KEY)) || {};
    const t = { ...THEME_DEFAULT, ...saved };
    // Migrate pre-form themes (separate core/web toggles) to an equivalent form.
    if (saved.form === undefined && (saved.core !== undefined || saved.lines !== undefined)) {
      t.form = saved.lines ? 'web' : (saved.core === false ? 'field' : 'orb');
    }
    return t;
  } catch { return { ...THEME_DEFAULT }; }
}
export function setTheme(t) { localStorage.setItem(THEME_KEY, JSON.stringify(t)); }

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
  };
}
function fullTarget(moodName, schemeKey) {
  const m = MOODS[moodName] || MOODS.calm;
  const s = SCHEME_BY_KEY[schemeKey] || SCHEMES[0];
  return { amp: m.amp, freq: m.freq, speed: m.speed, size: m.size, radius: m.radius, glitch: moodName === 'glitch' ? 1 : 0, ...colorTarget(m, s) };
}

// Keys eased toward the active mood each frame (everything except color hooks
// that need special handling lives here as a plain scalar).
const EASE_KEYS = ['amp', 'freq', 'speed', 'size', 'radius', 'glitch', 'hueBase', 'hueRange', 'hueFlow', 'hueSweep', 'sat', 'val', 'cFreq'];

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

const VERT = /* glsl */`
uniform float uTime,uAmp,uFreq,uSpeed,uSize,uRadius,uAudio,uGlitch,uPlasma;
uniform float uHueBase,uHueRange,uHueFlow,uHueSweep,uSat,uVal,uCFreq;
attribute float aRand;
attribute vec3 aColor;                 // per-node color for paint mode
varying float vHue,vSat,vVal,vShade,vFil,vRibbon;
varying vec3 vPaintCol;
${SNOISE}
float fbm(vec3 p){
  float f=0.0, a=0.5;
  for(int i=0;i<4;i++){ f+=a*snoise(p); p*=2.02; a*=0.5; }
  return f;
}
void main(){
  vec3 dir=normalize(position);
  float t=uTime*uSpeed;
  float n=fbm(dir*uFreq+vec3(0.0,0.0,t));
  // sharp radial jitter when "glitch" is high
  float g=uGlitch*sin((aRand*40.0)+uTime*8.0)*step(0.7,fract(aRand*13.0+uTime*0.5));
  float disp=n*uAmp*(1.0+uAudio*1.6)+g*0.25;
  vec3 pos=dir*(uRadius+disp);
  vec4 mv=modelViewMatrix*vec4(pos,1.0);

  // Plasma ribbons: narrow bright bands of energy that flow across the body when
  // uPlasma>0 — sharp peaks (high pow) leave dark gaps so they read as ribbons.
  float flow=fbm(dir*2.4+vec3(0.0,uTime*0.22,t*0.6));
  float ribbon=sin(dir.y*9.0 + dir.x*3.0 + uTime*0.9 + flow*4.0);
  vRibbon=pow(max(ribbon,0.0),6.0)*uPlasma;

  gl_PointSize=uSize*(1.0+uAudio*0.6)*(10.0/-mv.z)*(0.55+aRand*0.9)*(1.0+vRibbon*0.7);
  gl_Position=projectionMatrix*mv;

  // Independent per-node hue: a flowing field over the surface, widened by the
  // mood's hueRange. Bands wrap the body via the latitude sweep + the noise.
  float band=fbm(dir*uCFreq+vec3(0.0,0.0,uTime*uHueFlow));
  float hue=uHueBase + uHueRange*(band*0.5+0.5) + dir.y*uHueSweep + aRand*0.015;
  vHue=fract(hue);
  vSat=uSat;
  vVal=uVal;
  vPaintCol=aColor;
  vShade=clamp(disp*1.5+0.5,0.0,1.0);   // crests bright, troughs dim
  vFil=pow(clamp(disp,0.0,1.0),2.0);     // near-white filaments on the peaks
}`;

const FRAG = /* glsl */`
precision highp float;
uniform float uDotFade,uPaint;
varying float vHue,vSat,vVal,vShade,vFil,vRibbon;
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
  float alpha=edge*(0.40+0.60*vShade)*uDotFade;
  alpha=max(alpha, edge*vRibbon*0.85);   // ribbons glow even through faded dots
  gl_FragColor=vec4(col,alpha);
}`;

const lerp = (a, b, t) => a + (b - a) * t;

// HSL (0..1) → [r,g,b] 0..255, so the background can be packed into an sRGB hex.
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

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
varying float vSh;
${SNOISE}
float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<4;i++){ f+=a*snoise(p); p*=2.02; a*=0.5; } return f; }
void main(){
  vec3 dir=normalize(position);
  float n=fbm(dir*uFreq+vec3(0.0,0.0,uTime*uSpeed));
  float disp=n*uAmp*(1.0+uAudio*1.6);
  vSh=clamp(disp*1.5+0.5,0.0,1.0);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(dir*(uRadius+disp),1.0);
}`;
const LINE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uLineColor; uniform float uLineOpacity;
varying float vSh;
void main(){ gl_FragColor=vec4(uLineColor*(0.5+0.7*vSh), uLineOpacity*(0.3+0.7*vSh)); }`;

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

export function createBody(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setClearColor(0x04030a, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colorAttr, 3));

  const t0 = fullTarget('calm', 'aurora');
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: t0.amp }, uFreq: { value: t0.freq }, uSpeed: { value: t0.speed },
    uSize: { value: t0.size }, uRadius: { value: t0.radius }, uAudio: { value: 0 }, uGlitch: { value: 0 },
    uHueBase: { value: t0.hueBase }, uHueRange: { value: t0.hueRange }, uHueFlow: { value: t0.hueFlow },
    uHueSweep: { value: t0.hueSweep }, uSat: { value: t0.sat }, uVal: { value: t0.val }, uCFreq: { value: t0.cFreq },
    uDotFade: { value: 1.0 }, uPlasma: { value: 0 }, uPaint: { value: 0 },
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
  scene.add(new THREE.Points(geo, material));

  // Bloom gives the dots their glow/bleed, matching the reference renders.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.16);
  composer.addPass(bloom);

  // Glowing core — a bright presence at the center that flares as Y3K speaks.
  const coreMat = new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(coreColorFor('aurora')),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.85,
  });
  const core = new THREE.Sprite(coreMat);
  core.scale.setScalar(0.6);
  core.renderOrder = 999; // draw on top of the dots so it always reads as a glowing center
  scene.add(core);

  // Constellation web — off by default; reuses the dots' uniform objects so the
  // lattice displaces in perfect sync with them.
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(buildConstellation(800, 3), 3));
  const lineMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime, uAmp: uniforms.uAmp, uFreq: uniforms.uFreq,
      uSpeed: uniforms.uSpeed, uRadius: uniforms.uRadius, uAudio: uniforms.uAudio,
      uLineColor: { value: new THREE.Color(lineColorFor('aurora')) },
      uLineOpacity: { value: 0.62 },
    },
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.visible = false;
  scene.add(lines);

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
    composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  // Re-fit when the container gets its real size (flex/CSS can settle after init).
  if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
  resize();

  // Targets the uniforms ease toward. setMood/setScheme retarget; loop interpolates.
  let currentMoodName = 'calm';
  let currentSchemeKey = 'aurora';
  let target = fullTarget(currentMoodName, currentSchemeKey);
  let audioLevel = 0;        // 0..1 live mic/voice energy
  let audioTarget = 0;
  let speakingBoost = 0;     // extra energy layered on while talking
  let plasmaTarget = 0;      // 0/1 — eased so ribbons fade in/out smoothly

  const clock = new THREE.Clock();
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
    uniforms.uPlasma.value = lerp(uniforms.uPlasma.value, plasmaTarget, 0.06);

    if (core.visible) {
      const a = uniforms.uAudio.value;
      core.scale.setScalar((0.5 + a * 0.7) * (0.95 + 0.05 * Math.sin(uniforms.uTime.value * 1.6)));
      coreMat.opacity = 0.7 + a * 0.3;
    }

    controls.update();
    composer.render();
  }
  frame();

  // Background: any hue, but always dark + muted (never neon) so the field pops.
  // Pack to an sRGB hex NUMBER and pass that to setClearColor — the hex path
  // renders dark, whereas a THREE.Color gets gamma-brightened to gray through
  // the bloom composer.
  function setBackground(hue, tint) {
    const tt = Math.max(0, Math.min(1, tint));
    // The bloom composer brightens the clear color ~4x, so keep it very low —
    // higher saturation lets the deep tint read as a hue without going gray.
    const [r, g, b] = hslToRgb(((hue % 1) + 1) % 1, 0.5 + tt * 0.4, 0.008 + tt * 0.016);
    const hex = (r << 16) | (g << 8) | b;
    renderer.setClearColor(hex, 1);
    document.documentElement.style.setProperty('--bg', '#' + hex.toString(16).padStart(6, '0'));
  }

  return {
    moods: Object.keys(MOODS),
    schemes: SCHEMES.map((s) => s.key),
    setMood(name) {
      currentMoodName = MOODS[name] ? name : 'calm';
      target = fullTarget(currentMoodName, currentSchemeKey);
    },
    setScheme(key) {
      currentSchemeKey = SCHEME_BY_KEY[key] ? key : 'aurora';
      target = fullTarget(currentMoodName, currentSchemeKey);
      coreMat.color.set(coreColorFor(currentSchemeKey));
      lineMat.uniforms.uLineColor.value.set(lineColorFor(currentSchemeKey));
    },
    setCore(on) { core.visible = on; if (!on) coreMat.opacity = 0; },
    setConstellation(on) { lines.visible = on; uniforms.uDotFade.value = on ? 0.4 : 1.0; },
    // Posture: set core + web + plasma together from a named form (body language).
    setForm(name) {
      const f = FORM_MAP[name] || FORM_MAP.orb;
      core.visible = f.core; if (!f.core) coreMat.opacity = 0;
      lines.visible = f.lines; uniforms.uDotFade.value = f.lines ? 0.4 : 1.0;
      plasmaTarget = f.plasma ? 1 : 0;
    },
    setBackground,
    // 0..1 — live energy from the mic while listening.
    setAudioLevel(v) { audioTarget = Math.max(0, Math.min(1, v)); },
    // While the voice talks, pulse the surface even without an analyser.
    setSpeaking(on) { speakingBoost = on ? 0.35 : 0; },
    setAutoRotate(on) { controls.autoRotate = on; },
  };
}
