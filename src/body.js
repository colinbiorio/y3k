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
// · .58 blue · .72 violet · .83 magenta · .92 pink. hueRange = how much of the
// wheel spreads across the body (1.0 = full rainbow, like reference 1 & 2).
export const MOODS = {
  calm:      { amp: 0.18, freq: 1.2, speed: 0.14, size: 2.4, radius: 1.00, hueBase: 0.58, hueRange: 0.16, hueFlow: 0.04, hueSweep: 0.25, sat: 0.82, val: 1.00, cFreq: 1.4 },
  listening: { amp: 0.13, freq: 1.7, speed: 0.28, size: 2.4, radius: 1.02, hueBase: 0.50, hueRange: 0.22, hueFlow: 0.14, hueSweep: 0.30, sat: 0.88, val: 1.00, cFreq: 1.8 },
  thinking:  { amp: 0.30, freq: 2.3, speed: 0.55, size: 2.1, radius: 0.98, hueBase: 0.70, hueRange: 0.26, hueFlow: 0.20, hueSweep: 0.35, sat: 0.86, val: 1.00, cFreq: 2.0 },
  speaking:  { amp: 0.30, freq: 1.9, speed: 0.62, size: 2.6, radius: 1.05, hueBase: 0.86, hueRange: 0.40, hueFlow: 0.24, hueSweep: 0.45, sat: 0.92, val: 1.00, cFreq: 1.8 },
  excited:   { amp: 0.46, freq: 2.0, speed: 0.95, size: 2.9, radius: 1.10, hueBase: 0.00, hueRange: 1.00, hueFlow: 0.36, hueSweep: 0.80, sat: 0.96, val: 1.00, cFreq: 1.6 },
  tender:    { amp: 0.14, freq: 1.0, speed: 0.20, size: 2.9, radius: 1.00, hueBase: 0.90, hueRange: 0.16, hueFlow: 0.05, hueSweep: 0.20, sat: 0.74, val: 1.00, cFreq: 1.2 },
  glitch:    { amp: 0.58, freq: 3.6, speed: 1.45, size: 2.0, radius: 1.00, hueBase: 0.00, hueRange: 1.00, hueFlow: 0.95, hueSweep: 1.00, sat: 1.00, val: 1.00, cFreq: 3.0 },
};

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
uniform float uTime,uAmp,uFreq,uSpeed,uSize,uRadius,uAudio,uGlitch;
uniform float uHueBase,uHueRange,uHueFlow,uHueSweep,uSat,uVal,uCFreq;
attribute float aRand;
varying float vHue,vSat,vVal,vShade,vFil;
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
  gl_PointSize=uSize*(1.0+uAudio*0.6)*(10.0/-mv.z)*(0.55+aRand*0.9);
  gl_Position=projectionMatrix*mv;

  // Independent per-node hue: a flowing field over the surface, widened by the
  // mood's hueRange. Bands wrap the body via the latitude sweep + the noise.
  float band=fbm(dir*uCFreq+vec3(0.0,0.0,uTime*uHueFlow));
  float hue=uHueBase + uHueRange*(band*0.5+0.5) + dir.y*uHueSweep + aRand*0.015;
  vHue=fract(hue);
  vSat=uSat;
  vVal=uVal;
  vShade=clamp(disp*1.5+0.5,0.0,1.0);   // crests bright, troughs dim
  vFil=pow(clamp(disp,0.0,1.0),2.0);     // near-white filaments on the peaks
}`;

const FRAG = /* glsl */`
precision highp float;
varying float vHue,vSat,vVal,vShade,vFil;
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
  vec3 col=hsv2rgb(vec3(vHue, vSat, vVal*(0.45+0.6*vShade)));
  col+=vFil*0.55;                        // light up the crest filaments
  float alpha=edge*(0.40+0.60*vShade);
  gl_FragColor=vec4(col,alpha);
}`;

const lerp = (a, b, t) => a + (b - a) * t;

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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

  const m0 = MOODS.calm;
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: m0.amp }, uFreq: { value: m0.freq }, uSpeed: { value: m0.speed },
    uSize: { value: m0.size }, uRadius: { value: m0.radius }, uAudio: { value: 0 }, uGlitch: { value: 0 },
    uHueBase: { value: m0.hueBase }, uHueRange: { value: m0.hueRange }, uHueFlow: { value: m0.hueFlow },
    uHueSweep: { value: m0.hueSweep }, uSat: { value: m0.sat }, uVal: { value: m0.val }, uCFreq: { value: m0.cFreq },
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

  // Pull the camera back so the whole sphere fits whichever FOV axis is tighter
  // (portrait phones are limited by horizontal FOV). setLength keeps the current
  // orbit direction, so this is safe to call on every resize.
  function fitCamera() {
    const R = 1.6; // sphere radius + max displacement + a little margin
    const vHalf = (camera.fov * Math.PI) / 180 / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const limit = Math.min(vHalf, hHalf);
    camera.position.setLength((R / Math.sin(limit)) * 1.06);
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  // Targets the uniforms ease toward. setMood retargets; the loop interpolates.
  let target = { ...MOODS.calm, glitch: 0 };
  let audioLevel = 0;        // 0..1 live mic/voice energy
  let audioTarget = 0;
  let speakingBoost = 0;     // extra energy layered on while talking

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    uniforms.uTime.value += clock.getDelta();

    const k = 0.045;
    for (const key of EASE_KEYS) {
      const u = uniforms['u' + key[0].toUpperCase() + key.slice(1)];
      u.value = lerp(u.value, target[key] ?? 0, k);
    }

    audioLevel = lerp(audioLevel, audioTarget, 0.2);
    uniforms.uAudio.value = Math.min(audioLevel + speakingBoost, 1.4);

    controls.update();
    composer.render();
  }
  frame();

  return {
    moods: Object.keys(MOODS),
    setMood(name) {
      const m = MOODS[name] || MOODS.calm;
      target = { ...m, glitch: name === 'glitch' ? 1 : 0 };
    },
    // 0..1 — live energy from the mic while listening.
    setAudioLevel(v) { audioTarget = Math.max(0, Math.min(1, v)); },
    // While the voice talks, pulse the surface even without an analyser.
    setSpeaking(on) { speakingBoost = on ? 0.35 : 0; },
    setAutoRotate(on) { controls.autoRotate = on; },
  };
}
