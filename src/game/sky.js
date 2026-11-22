// sky.js — THE TRUE SKY, DRAWN (three.js): the air and the Sun over a place on the Earth at the world's clock's
// instant, in real units, and the world lit by them. solar/air.js and solar/daylight.js are its numbers (the tests
// run those); this draws from them and decides nothing. SOLAR.md "Step 2" says what is physical and what is not.
//
// What is drawn, in the order of S. Hillaire's method (EGSR 2020):
//   · two tables made once (air.js makes them, in doubles): the air's TRANSMITTANCE and its MULTIPLE SCATTERING;
//   · THE SKY AS SEEN from the eye's height under this Sun: a small table (192 x 108, finest at the horizon), made
//     again only when the Sun or the eye's height has moved. The dome reads it;
//   · THE AIR BETWEEN THE EYE AND THE LAND (aerial perspective): 32 slices of the view out to 128 km, each 32 x 32,
//     made every frame: how much of what is behind survives and how much light the air adds. Every material that
//     takes fog reads it instead of fog (adopt(), below), so the land, the sea, the buildings, the ships and the
//     bodies stand in the same air as the sky;
//   · THE SUN: a disc of its true size where the clockwork sees it, darkened to its limb, dimmed and reddened by
//     the air it is seen through, and flattened near the horizon because the air lifts its lower limb more;
//   · THE EYE: one exposure for everything (air.js), following the scene; and the eye's own veil round the Sun
//     (the CIE's disability glare), added in light to the sky and to whatever stands in front of it.
// The picture is drawn straight to the screen as before: every light is multiplied by the exposure before it is
// used, so no material had to change, and nothing is drawn twice.
//
// The tables the GPU makes hold half floats, which keep three figures between 6e-5 and 65,000 and little below. The
// sky from noon to the end of twilight runs through eight powers of ten, so each table holds the sky's luminance
// over the sky's own light on level ground at that moment (a number near 1 at any hour), and the reader multiplies
// that light back in.
import * as THREE from 'three';
import { AIR, LUT, AIR_GLSL, SUN, GLARE, luminance, transmittanceLUT, multiScatteringLUT, exposureFor, adapt } from './solar/air.js';
import { createDaylight, GROUND } from './solar/daylight.js';
import { when } from './solar/clock.js';

const D2R = Math.PI / 180;
const f = (x) => { const s = Number(x).toPrecision(9); return /[.e]/.test(s) ? s : s + '.0'; };

// ---- what every adopted material shares: one set of uniforms, by reference (they outlive any one sky, because a
// body's materials go with it from place to place)
const SHARED = {
  uAirAP: { value: null },                                          // the air between eye and land
  uAirPx: { value: new THREE.Vector4(1, 1, 32, 32) },               // 1 / the picture's width and height in pixels; the table's slices, and their width
  uAirProj: { value: new THREE.Vector4(1, 1, 0, 0) },               // a pixel to a ray in the eye's own axes
  uAirCam: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)] },   // the eye's right, up and forward
  uAirGain: { value: 0 },                                           // the sky's light on level ground (lux) times the exposure: what brings a table's number to the picture's
  uAirSun: { value: new THREE.Vector3(0, 1, 0) },                   // toward the Sun as seen
  uAirGlare: { value: new THREE.Vector3() },                        // its light at the eye (lux in three colours) times the exposure, by how much of it is in sight
  uAirEnv: { value: 1 },                                            // the same, for the wrapped sky (1 where no true sky is drawn)
};
// the eye's veil round the Sun: luminance per lux at the eye, by the angle from it (air.js veil(), the CIE's equation)
const VEIL_GLSL = `
vec3 airVeil(vec3 d, vec3 sun, vec3 glare) {
  if (dot(d, sun) < 0.5) return vec3(0.0);
  float t = max(degrees(2.0 * asin(min(1.0, 0.5 * length(d - sun)))), 0.1);
  float v = 10.0 / (t * t * t) + (5.0 / (t * t) + ${f(0.1 * GLARE.pigment)} / t) * ${f(1 + (GLARE.age / 62.5) ** 4)} + ${f(0.0025 * GLARE.pigment)};
  return glare * v * (1.0 - smoothstep(40.0, 60.0, t));
}`;
const AIR_PARS = `
#ifdef USE_FOG
uniform sampler2D uAirAP; uniform vec4 uAirPx; uniform vec4 uAirProj; uniform vec3 uAirCam[3]; uniform float uAirGain; uniform vec3 uAirSun; uniform vec3 uAirGlare;
${VEIL_GLSL}
#endif`;
// the air applied to a fragment (in light, before it is made into the screen's own numbers). `add`: a thing that
// is itself added light (a flame, a glow) is only dimmed by the air in front of it.
const airFog = (add) => `
#ifdef USE_FOG
{
  vec2 airUv = gl_FragCoord.xy * uAirPx.xy, airRay = (airUv * 2.0 - 1.0) * uAirProj.xy + uAirProj.zw;
  float airKm = vFogDepth * length(vec3(airRay, 1.0)) * 0.001, airN = uAirPx.z, airW = uAirPx.w;
  float airS = sqrt(clamp(airKm / ${f(LUT.AP_KM)}, 0.0, 1.0)) * airN - 0.5, airNear = 1.0;
  if (airS < 0.0) { airNear = clamp(airKm * airN * airN * ${f(4 / LUT.AP_KM)}, 0.0, 1.0); airS = 0.0; }
  float airI = min(floor(airS), airN - 2.0), airF = clamp(airS - airI, 0.0, 1.0);
  vec2 airAt = vec2((airI + clamp(airUv.x, 0.5 / airW, 1.0 - 0.5 / airW)) / airN, airUv.y);
  vec4 airA = mix(texture2D(uAirAP, airAt), texture2D(uAirAP, airAt + vec2(1.0 / airN, 0.0)), airF) * airNear;
  ${add ? 'gl_FragColor.rgb *= 1.0 - airA.a;' : 'gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - airA.a) + airA.rgb * uAirGain + airVeil(normalize(uAirCam[0] * airRay.x + uAirCam[1] * airRay.y + uAirCam[2]), uAirSun, uAirGlare);'}
}
#endif`;
const ADOPTED = new WeakSet();
// A material is made to stand in the air: where it took fog it takes the air between the eye and itself instead, and
// what it takes from the wrapped sky is brought to the picture's units. Its own onBeforeCompile still runs first.
function adopt(material) {
  if (!material || ADOPTED.has(material) || !material.isMaterial) return;
  ADOPTED.add(material);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey(), add = material.blending === THREE.AdditiveBlending;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    let fs = shader.fragmentShader;
    if (fs.includes('#include <fog_fragment>') && fs.includes('#include <fog_pars_fragment>')) {
      Object.assign(shader.uniforms, { uAirAP: SHARED.uAirAP, uAirPx: SHARED.uAirPx, uAirProj: SHARED.uAirProj, uAirCam: SHARED.uAirCam, uAirGain: SHARED.uAirGain, uAirSun: SHARED.uAirSun, uAirGlare: SHARED.uAirGlare });
      fs = fs.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + AIR_PARS);
      if (fs.includes('#include <colorspace_fragment>')) fs = fs.replace('#include <fog_fragment>', '').replace('#include <colorspace_fragment>', airFog(add) + '\n#include <colorspace_fragment>');
      else fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(2.2));' + airFog(add) + '\ngl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(1.0 / 2.2));');
    }
    if (fs.includes('#include <envmap_physical_pars_fragment>')) {
      shader.uniforms.uAirEnv = SHARED.uAirEnv;
      fs = fs.replace('#include <envmap_physical_pars_fragment>', 'uniform float uAirEnv;\n' + THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/envMapIntensity/g, '( envMapIntensity * uAirEnv )'));
    }
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => key + '|air' + (add ? '+' : '');
  material.needsUpdate = true;
}

// ---- the passes' own shaders
const QUAD_VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
// the sky as seen: across, the angle round from the Sun (finest toward it); up, from the zenith down to the horizon
// (finest there) and on down to straight below. The paper's layout.
const SKYVIEW_FRAG = `
${AIR_GLSL}
uniform float uH; uniform float uSunUp; uniform vec2 uSize; uniform int uSteps; uniform float uNorm;
void main() {
  vec2 uv = (gl_FragCoord.xy / uSize - 0.5 / uSize) * (uSize / (uSize - 1.0));
  float h = clamp(uH, 0.0, A_HT - 0.001), beta = acos(clamp(sqrt(h * (2.0 * A_RG + h)) / (A_RG + h), 0.0, 1.0)), zha = A_PI - beta, mu;
  if (uv.y < 0.5) { float c = 1.0 - 2.0 * uv.y; mu = cos(zha * (1.0 - c * c)); }
  else { float c = uv.y * 2.0 - 1.0; mu = cos(zha + beta * c * c); }
  float ca = 1.0 - 2.0 * uv.x * uv.x, sn = sqrt(max(0.0, 1.0 - mu * mu));
  vec3 d = vec3(sn * ca, mu, sn * sqrt(max(0.0, 1.0 - ca * ca))), s = vec3(sqrt(max(0.0, 1.0 - uSunUp * uSunUp)), uSunUp, 0.0), thr;
  gl_FragColor = vec4(airMarch(h, d, s, 1.0e9, uSteps, 1.0, 1.0, thr) * uNorm, 1.0);
}`;
// reading it back: a direction in the world (y up) to its place in the table
const SKYLOOK_GLSL = `
uniform sampler2D uSkyView; uniform vec2 uSkySize; uniform float uH; uniform vec3 uSun;
vec3 skyLook(vec3 d) {
  float h = clamp(uH, 0.0, A_HT - 0.001), beta = acos(clamp(sqrt(h * (2.0 * A_RG + h)) / (A_RG + h), 0.0, 1.0)), zha = A_PI - beta;
  float za = acos(clamp(d.y, -1.0, 1.0)), v = za <= zha ? 0.5 * (1.0 - sqrt(max(0.0, 1.0 - za / zha))) : 0.5 + 0.5 * sqrt(clamp((za - zha) / beta, 0.0, 1.0));
  float ld = length(d.xz), ls = length(uSun.xz), ca = (ld > 1.0e-5 && ls > 1.0e-5) ? clamp(dot(d.xz, uSun.xz) / (ld * ls), -1.0, 1.0) : 1.0;
  return texture2D(uSkyView, (vec2(sqrt(max(0.0, 0.5 - 0.5 * ca)), v) + 0.5 / uSkySize) * (uSkySize / (uSkySize + 1.0))).rgb;
}`;
// the air between the eye and the land: side by side, one square of the view for each slice of distance
const AP_FRAG = `
${AIR_GLSL}
uniform vec3 uCam[3]; uniform vec4 uProj; uniform float uH; uniform vec3 uSunW; uniform vec3 uAp; uniform float uNorm;
void main() {
  float N = uAp.x, W = uAp.y, tile = floor(gl_FragCoord.x / W), w = (tile + 0.5) / N;
  vec2 ray = (vec2(gl_FragCoord.x - tile * W, gl_FragCoord.y) / W * 2.0 - 1.0) * uProj.xy + uProj.zw;
  vec3 d = normalize(uCam[0] * ray.x + uCam[1] * ray.y + uCam[2]), thr;
  vec3 L = airMarch(uH, d, uSunW, ${f(LUT.AP_KM)} * w * w, int(max(2.0, (tile + 1.0) * uAp.z)), 0.0, 0.0, thr);
  gl_FragColor = vec4(L * uNorm, 1.0 - dot(thr, vec3(1.0 / 3.0)));
}`;
// the sky wrapped round whatever stands in it (no disc: the Sun's own light is the key light):
// the whole sphere unrolled, the ground's own brightness under the horizon
const WRAP_FRAG = `
${AIR_GLSL}
${SKYLOOK_GLSL}
uniform vec2 uSize; uniform vec3 uUnder;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float lon = (uv.x - 0.5) * 6.28318530718, lat = (uv.y - 0.5) * A_PI;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 sky = skyLook(normalize(vec3(d.x, max(d.y, 0.02), d.z)));
  gl_FragColor = vec4(mix(uUnder, sky, smoothstep(-0.06, 0.03, d.y)), 1.0);
}`;
const DOME_VERT = 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const DOME_FRAG = `
#include <common>
#include <dithering_pars_fragment>
varying vec3 vDir;
${AIR_GLSL}
${SKYLOOK_GLSL}
${VEIL_GLSL}
uniform vec3 uSunTrue; uniform float uGain; uniform float uSunGain; uniform float uSunRad; uniform float uRefr; uniform vec3 uGlare; uniform vec3 uLimb;
// degrees the air lifts what stands at a true height of alt degrees (Saemundsson's formula, as ephemeris.js has it)
float lift(float alt) { float hh = max(alt, -1.0), r = 1.02 / tan(radians(hh + 10.3 / (hh + 5.11))) / 60.0 * uRefr; return alt < -1.0 ? r * exp((alt + 1.0) / 0.7) : r; }
void main() {
  vec3 d = normalize(vDir);
  float px = length(fwidth(d));                                       // a pixel, in radians
  vec3 c = skyLook(d) * uGain;
  if (dot(d, uSun) > 0.9994) {                                        // within two degrees of where the Sun is seen
    // where this pixel's light really comes from: the air lifted it, more the lower it is
    float seen = degrees(asin(clamp(d.y, -1.0, 1.0))), was = seen - lift(seen);
    for (int i = 0; i < 4; i++) was = seen - lift(was);
    float cw = cos(radians(was)); vec2 hz = normalize(d.xz);
    float th = length(vec3(hz.x * cw, sin(radians(was)), hz.y * cw) - uSunTrue);      // radians from the Sun's true middle
    float on = 1.0 - smoothstep(uSunRad - 0.5 * px, uSunRad + 0.5 * px, th), hh = clamp(uH, 0.0, A_HT - 0.001);
    if (on > 0.0 && d.y > -sqrt(hh * (2.0 * A_RG + hh)) / (A_RG + hh)) {
      // its disc: the mean luminance (lux over its solid angle), darkened to the limb, through the air it is seen through
      float m = sqrt(max(1.0e-4, 1.0 - th * th / (uSunRad * uSunRad)));
      vec3 disc = airT(hh, d.y) * (uLimb + 2.0) * 0.5 * pow(vec3(m), uLimb) / (A_PI * uSunRad * uSunRad) * uSunGain;
      disc /= max(1.0, max(disc.r, max(disc.g, disc.b)));             // brighter than the screen: its colour is kept, not each colour's ceiling
      c += disc * on;
    }
  }
  c += airVeil(d, uSun, uGlare);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <dithering_fragment>
}`;

const half = (lut) => { const a = new Uint16Array(lut.data.length); for (let i = 0; i < a.length; i += 1) a[i] = THREE.DataUtils.toHalfFloat(Math.min(lut.data[i], 65000)); return a; };
// a table from air.js as a texture: half floats, which every machine can read between (`whole`: whole floats where
// the machine can read between those too; the multiple scattering under a set Sun is smaller than a half float holds)
function table(lut, whole = false) {
  const t = whole ? new THREE.DataTexture(lut.data, lut.w, lut.h, THREE.RGBAFormat, THREE.FloatType) : new THREE.DataTexture(half(lut), lut.w, lut.h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
const target = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });

// can this machine draw it? (WebGL 2, and tables of half floats it can draw into)
export function canDrawTrueSky(renderer) {
  try { return !!renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')); } catch { return false; }
}

// createTrueSky({ renderer, lite, lat, lon, ground }): the sky over (lat, lon). `ground` (the island's) says where
// the land stands between the eye and the Sun. What comes back: `dome` (to add to the scene), `fog` (to set as the
// scene's: its numbers are not used, it only says "this scene has air"), and
//   update({ camera, t, key, fill, sea, scene, indoor }) once a frame, before the picture: the tables, the lights,
//   the exposure, the wrapped sky; it adopts whatever materials have come into the scene
//   state: what view.js and the buildings ask after (the Sun's and the sky's colours in the picture's units, how
//   far into the night it is), and read(): the numbers, for the probes
export function createTrueSky({ renderer, lite = false, lat, lon, ground = null }) {
  const day = createDaylight({ lat, lon }), size = lite ? LUT.lite : LUT, [SW, SH] = size.SKY, [AN, AW] = size.AP;
  const t0 = performance.now();
  const tT = table(transmittanceLUT()), tM = table(multiScatteringLUT(), renderer.extensions.has('OES_texture_float_linear')), made = performance.now() - t0;
  const skyRT = target(SW, SH), apRT = target(AN * AW, AW), wrapRT = target(256, 128);
  wrapRT.texture.mapping = THREE.EquirectangularReflectionMapping;
  const common = { uAirT: { value: tT }, uAirMS: { value: tM } };
  const U = {
    sky: { ...common, uH: { value: 0.002 }, uSunUp: { value: 1 }, uSize: { value: new THREE.Vector2(SW, SH) }, uSteps: { value: size.STEPS }, uNorm: { value: 1 } },
    ap: { ...common, uCam: SHARED.uAirCam, uProj: SHARED.uAirProj, uH: { value: 0.002 }, uSunW: SHARED.uAirSun, uAp: { value: new THREE.Vector3(AN, AW, lite ? 1 : 2) }, uNorm: { value: 1 } },
    look: { uSkyView: { value: skyRT.texture }, uSkySize: { value: new THREE.Vector2(SW, SH) }, uH: { value: 0.002 }, uSun: SHARED.uAirSun },
  };
  U.wrap = { ...common, ...U.look, uSize: { value: new THREE.Vector2(256, 128) }, uUnder: { value: new THREE.Vector3() } };
  U.dome = { ...common, ...U.look, uSunTrue: { value: new THREE.Vector3(0, 1, 0) }, uGain: SHARED.uAirGain, uSunGain: { value: 0 }, uSunRad: { value: 0.00465 }, uRefr: { value: 1 }, uGlare: SHARED.uAirGlare, uLimb: { value: new THREE.Vector3(...SUN.limb) } };
  const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const mSky = pass(SKYVIEW_FRAG, U.sky), mAp = pass(AP_FRAG, U.ap), mWrap = pass(WRAP_FRAG, U.wrap);
  const quadGeo = new THREE.BufferGeometry(); quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(quadGeo, mSky), quadScene = new THREE.Scene(), quadCam = new THREE.Camera(); quad.frustumCulled = false; quadScene.add(quad);
  const run = (material, rt) => { const was = renderer.getRenderTarget(); quad.material = material; renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam); renderer.setRenderTarget(was); };

  const domeGeo = new THREE.IcosahedronGeometry(1, 5);
  const domeMat = new THREE.ShaderMaterial({ uniforms: U.dome, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, dithering: true });
  const dome = new THREE.Mesh(domeGeo, domeMat); dome.frustumCulled = false; dome.renderOrder = -10; dome.scale.setScalar(50000);
  ADOPTED.add(domeMat);
  const fog = new THREE.Fog(0x000000, 1e9, 2e9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const R = new THREE.Vector3(), Uu = new THREE.Vector3(), B = new THREE.Vector3(), buf = new THREE.Vector2(), fwd = [0, 0, -1], rgt = [1, 0, 0], upv = [0, 1, 0], zen = [0, 0, 0], hor = [0, 0, 0];
  let lastT = NaN, frame = 0, adapted = 0, sceneL = 0, exposure = 0, sight = 1, skyAt = null, wrapAt = null, seen = 0;
  const state = { sunCol: new THREE.Color(), skyCol: new THREE.Color(), night: 0, env: 1, exposure: 0 };
  // is the land between the eye and the Sun? (a walk out along the Sun's way, the steps growing)
  function hidden(p, s) {
    if (!ground || s[1] > 0.6) return false;
    for (let dist = 6; dist < 30000; dist *= 1.3) { const y = p.y + s[1] * dist; if (y > 900) return false; if (ground.height(p.x + s[0] * dist, p.z + s[2] * dist) > y) return true; }
    return false;
  }
  const moved = (was, L) => !was || Math.abs(was.alt - L.alt) > was.eps || Math.abs(was.h - L.height) > Math.max(0.001, 0.02 * was.h);

  function update({ camera, t, key, fill, sea = null, scene, indoor = 1 }) {
    const dt = Number.isFinite(lastT) ? Math.min(0.1, Math.max(0, t - lastT)) : 0; lastT = t; frame += 1;
    const L = day.at(when(), Math.max(0.5, camera.position.y)), s = L.sun;
    // the eye's axes, and a pixel's ray in them
    camera.matrixWorld.extractBasis(R, Uu, B);
    SHARED.uAirCam.value[0].copy(R); SHARED.uAirCam.value[1].copy(Uu); SHARED.uAirCam.value[2].copy(B).negate();
    const pe = camera.projectionMatrix.elements;
    SHARED.uAirProj.value.set(1 / pe[0], 1 / pe[5], pe[8] / pe[0], pe[9] / pe[5]);
    renderer.getDrawingBufferSize(buf); SHARED.uAirPx.value.set(1 / buf.x, 1 / buf.y, AN, AW);
    SHARED.uAirSun.value.set(s[0], s[1], s[2]);
    // the eye: how bright the scene is, and the exposure that follows it
    if (frame % 2 === 1 || !sceneL) {
      fwd[0] = -B.x; fwd[1] = -B.y; fwd[2] = -B.z; rgt[0] = R.x; rgt[1] = R.y; rgt[2] = R.z; upv[0] = Uu.x; upv[1] = Uu.y; upv[2] = Uu.z;
      sceneL = day.scene(fwd, rgt, upv, 1 / pe[0], 1 / pe[5]);
    }
    adapted = adapt(adapted, sceneL, dt); exposure = exposureFor(adapted);
    // the sky's own light on level ground, per lux of the Sun: what every table is kept over
    const per = Math.max(luminance(L.sky) / L.lux, 1e-12), gain = per * L.lux * exposure;
    SHARED.uAirGain.value = gain; SHARED.uAirEnv.value = gain; U.dome.uSunGain.value = L.lux * exposure;
    // the Sun's light at the eye, and whether the land or a wall hides it
    const want = (hidden(camera.position, s) ? 0 : 1) * (indoor < 0.999 ? Math.max(0, (indoor - 0.12) / 0.88) : 1);
    sight += (want - sight) * (dt ? 1 - Math.exp(-dt / 0.12) : 1);
    SHARED.uAirGlare.value.set(L.direct[0] * exposure * sight, L.direct[1] * exposure * sight, L.direct[2] * exposure * sight);
    // the tables: the sky as seen when the Sun or the eye's height has moved; the air to the land every frame
    U.look.uH.value = U.sky.uH.value = U.ap.uH.value = L.height;
    if (moved(skyAt, L)) { U.sky.uSunUp.value = s[1]; U.sky.uNorm.value = 1 / per; run(mSky, skyRT); skyAt = { alt: L.alt, h: L.height, eps: 0.01, per }; }
    U.ap.uNorm.value = 1 / per; run(mAp, apRT); SHARED.uAirAP.value = apRT.texture;
    // the sky wrapped round what stands in it, when the Sun has moved a fifth of a degree
    if (moved(wrapAt, L)) {
      const g = GROUND / Math.PI / (L.lux * per); U.wrap.uUnder.value.set(L.level[0] * g, L.level[1] * g, L.level[2] * g);
      run(mWrap, wrapRT); envRT = pmrem.fromEquirectangular(wrapRT.texture, envRT || null); wrapAt = { alt: L.alt, h: L.height, eps: 0.2 };
    }
    if (scene) { if (scene.environment !== envRT.texture) scene.environment = envRT.texture; if (scene.fog !== fog) scene.fog = fog; }
    // the dome
    U.dome.uSunTrue.value.set(L.trueSun[0], L.trueSun[1], L.trueSun[2]); U.dome.uSunRad.value = L.radius * D2R; U.dome.uRefr.value = L.refraction;
    dome.position.copy(camera.position);
    // the lights: the key is the Sun through the air; the fill is half of the sky's own light on level ground (the
    // other half comes by the wrapped sky), and from below, what the ground gives back
    const d0 = L.direct[0] * exposure, d1 = L.direct[1] * exposure, d2 = L.direct[2] * exposure, top = Math.max(d0, d1, d2, 1e-9);
    if (key) { key.color.setRGB(d0 / top, d1 / top, d2 / top); key.intensity = top * indoor; }
    if (fill) { fill.color.setRGB(0.5 * L.sky[0] * exposure, 0.5 * L.sky[1] * exposure, 0.5 * L.sky[2] * exposure); fill.groundColor.setRGB(0.5 * GROUND * L.level[0] * exposure, 0.5 * GROUND * L.level[1] * exposure, 0.5 * GROUND * L.level[2] * exposure); fill.intensity = indoor; }
    // what the rooms and the ships ask after, in the picture's own units (a room's sun patch was 1.5 where the key was 2.4)
    state.sunCol.setRGB(d0 * 0.625, d1 * 0.625, d2 * 0.625);
    const k = exposure / Math.PI * 3.4; state.skyCol.setRGB(L.sky[0] * k, L.sky[1] * k, L.sky[2] * k);
    state.night = Math.min(1, Math.max(0, (-L.alt - 2) / 8)); state.exposure = exposure;
    // the sea's own few numbers: the sky straight up and low ahead, the Sun's glitter, how lit its own colour is
    if (sea) {
      day.seaSky(fwd, zen, hor);
      sea.uZenith.value.setRGB(zen[0] * exposure, zen[1] * exposure, zen[2] * exposure); sea.uHorizon.value.setRGB(hor[0] * exposure, hor[1] * exposure, hor[2] * exposure);
      sea.uSun.value.set(s[0], s[1], s[2]); sea.uSunCol.value.setRGB(d0 / top, d1 / top, d2 / top); sea.uSunAmt.value = top / 2.4;
      sea.uBodyAmt.value.setRGB(L.level[0] * exposure / 2.4, L.level[1] * exposure / 2.4, L.level[2] * exposure / 2.4);
    }
    // whatever has come into the scene since stands in the same air
    if (scene) { let n = 0; scene.traverse((o) => { const m = o.material; if (!m) return; n += 1; if (Array.isArray(m)) m.forEach(adopt); else adopt(m); }); seen = n; }
    return L;
  }
  // a texel of the sky as seen, as the GPU made it (for a Sun of 1 lux): the probes compare it with air.js's own
  const px = new Uint16Array(4);
  function peek(i, j) { renderer.readRenderTargetPixels(skyRT, i, j, 1, 1, px); return [0, 1, 2].map((c) => THREE.DataUtils.fromHalfFloat(px[c]) * (skyAt ? skyAt.per : 1)); }
  return {
    dome, fog, day, state, update, peek, tables: { sky: [SW, SH], air: [AN, AW], made },
    read() { const L = day.light; return { when: L.when, alt: L.alt, az: L.az, lifted: L.lifted, height: L.height, lux: L.lux, direct: luminance(L.direct), sky: luminance(L.sky), level: luminance(L.level), scene: sceneL, adapted, exposure, sight, materials: seen, zenith: luminance(day.toward([0, 1, 0])), tables: { sky: [SW, SH], air: [AN, AW], made: Math.round(made) } }; },
    dispose() {
      SHARED.uAirEnv.value = 1; SHARED.uAirAP.value = null;
      for (const x of [tT, tM, skyRT, apRT, wrapRT, mSky, mAp, mWrap, quadGeo, domeGeo, domeMat, pmrem]) x.dispose();
      envRT?.dispose();
    },
  };
}
export { AIR };
