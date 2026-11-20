// light.js — LIGHTSPEED, DRAWN (three.js). ships.js says where a ship is in it (s.light: gathering, going, coming
// out; its speed, the share of the way to the speed of light, how far it has gone, the way it goes); this draws it.
//
//   · THE VEIL: deep space closing round the eye just beyond the body, so the small world falls away behind it;
//     a pale glow where the way goes, prismatic at its rim (Colin, 13 Nov: "an ethereal prismatic glow in transit").
//   · THE STREAKS: the stars drawn out into lines that come at the eye from where it goes and pass it, longer and
//     quicker as the speed grows; coming out, they run on ahead and thin away as the veil lifts on what is in front.
//   · THE GATHERING: a glow about the ship as the light gathers, a flash as it goes, another as it comes out.
//
// Nothing here moves the body or decides anything: view.js hands it the body's light each frame.
import * as THREE from 'three';
import { glowTexture } from './fight.js';

const VERT = `
attribute vec3 aSeed; attribute float aEnd;
uniform float uRun; uniform float uLen; uniform float uAmt;
varying float vA; varying vec3 vC;
const float L = 460.0;
void main() {
  float ang = aSeed.x * 6.2831853, r = mix(5.0, 95.0, aSeed.y * aSeed.y);
  float z = (L - 60.0) - mod(aSeed.z * L + uRun, L) + aEnd * uLen;
  vec3 p = vec3(cos(ang) * r, sin(ang) * r, z);
  vA = uAmt * smoothstep(-60.0, -10.0, z) * (1.0 - smoothstep(240.0, 400.0, z)) * (1.0 - 0.8 * aEnd);
  vC = 0.62 + 0.38 * cos(6.2831853 * (aSeed.x * 3.0 + aSeed.y + vec3(0.0, 0.33, 0.67)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
varying float vA; varying vec3 vC;
void main() { gl_FragColor = vec4(mix(vec3(1.0), vC, 0.6) * vA, vA); }`;
const VEIL_VERT = `
varying vec3 vD;
void main() { vD = normalize((modelMatrix * vec4(position, 0.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VEIL_FRAG = `
uniform vec3 uDir; uniform float uVeil;
varying vec3 vD;
void main() {
  float k = max(dot(normalize(vD), uDir), 0.0);
  vec3 c = mix(vec3(0.008, 0.01, 0.03), vec3(0.05, 0.05, 0.13), pow(k, 2.0));
  c += vec3(0.55, 0.62, 0.95) * pow(k, 40.0) * 0.9;                                                          // where the way goes
  float rim = exp(-pow((k - 0.93) / 0.025, 2.0));
  c += (0.5 + 0.5 * cos(6.2831853 * (k * 9.0 + vec3(0.0, 0.33, 0.67)))) * rim * 0.22;                      // a prismatic ring round it
  gl_FragColor = vec4(c, uVeil);
}`;

export function createLightArt(scene, { lite = false } = {}) {
  const N = lite ? 420 : 900, seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    for (let e = 0; e < 2; e++) { seed.set(s, (i * 2 + e) * 3); end[i * 2 + e] = e; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const U = { uRun: { value: 0 }, uLen: { value: 1 }, uAmt: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const streaks = new THREE.LineSegments(geo, mat); streaks.frustumCulled = false; streaks.renderOrder = 51; streaks.visible = false;
  const VU = { uDir: { value: new THREE.Vector3(0, 0, 1) }, uVeil: { value: 0 } };
  const veilGeo = new THREE.SphereGeometry(1, 40, 20);
  const veilMat = new THREE.ShaderMaterial({ uniforms: VU, vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false });
  const veil = new THREE.Mesh(veilGeo, veilMat); veil.frustumCulled = false; veil.renderOrder = 50; veil.visible = false;
  const tex = glowTexture(), glowMat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.75, 0.85, 1.0), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
  const glow = new THREE.Sprite(glowMat); glow.renderOrder = 52; glow.visible = false;
  scene.add(veil, streaks, glow);
  const DIR = new THREE.Vector3(), AT = new THREE.Vector3();
  let run = 0, flash = 0, was = null;
  return {
    scene,
    // L: the light (a ship's, handed on by the view; or null); camera; at: where its middle is; eyeD: how far the eye
    // stands from it; reach: how far beyond that what is in the light reaches (a ship's length); size: how many times a
    // body's size it is
    update(L, { camera, at, dt = 0, eyeD = 6, reach = 6, size = 1 }) {
      const phase = L ? L.phase : null;
      if (phase !== was) { if (phase === 'go' || phase === 'out' || (was === 'home' && !phase)) flash = 1; was = phase; }
      flash = Math.max(0, flash - dt * 2.2);
      const gather = phase === 'gather' ? Math.min(1, L.t / L.gatherT) : 0;
      const on = !!L && phase !== 'gather', frac = L ? L.frac : 0, veilAmt = L ? L.veil : 0;
      // the streaks: as quick as the speed, by the share of the way to light (logarithmic, or the eye could not follow)
      if (on) run += (phase === 'home' ? -1 : 1) * (40 + 900 * frac) * dt;
      U.uLen.value = 1 + 70 * frac; U.uAmt.value = on ? Math.min(1, 0.15 + 1.4 * frac) * (phase === 'home' || phase === 'out' ? 1 - L.u : 1) : 0; U.uRun.value = run;
      streaks.visible = U.uAmt.value > 0.002;
      if (L) DIR.set(L.dir[0], L.dir[1], L.dir[2]); else DIR.set(0, 0, 1);
      if (streaks.visible) { streaks.position.copy(camera.position); AT.copy(camera.position).add(DIR); streaks.lookAt(AT); }
      VU.uVeil.value = veilAmt; VU.uDir.value.copy(DIR);
      veil.visible = veilAmt > 0.002;
      if (veil.visible) { veil.position.copy(camera.position); veil.scale.setScalar(Math.max(8, eyeD + reach)); }
      // the gathering, and the flashes as it goes and as it comes home
      const g = Math.max(gather * 0.9, flash);
      glow.visible = g > 0.01;
      if (glow.visible) { glow.position.set(at[0], at[1], at[2]); glow.scale.setScalar((0.6 + 2.6 * gather + 4 * flash) * size); glowMat.opacity = Math.min(1, g); }
    },
    dispose() { scene.remove(veil, streaks, glow); geo.dispose(); mat.dispose(); veilGeo.dispose(); veilMat.dispose(); tex.dispose(); glowMat.dispose(); },
  };
}
