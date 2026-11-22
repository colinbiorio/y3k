// sky.js — THE TRUE SKY, DRAWN (three.js): the air, the Sun, the Moon's light and the night over a place on the
// Earth at the world's clock's instant, in real units, and the world lit by them. solar/air.js, solar/daylight.js and
// solar/night.js are its numbers (the tests run those); this draws from them and decides nothing. SOLAR.md "Step 2"
// says what is physical and what is not.
//
// What is drawn, in the order of S. Hillaire's method (EGSR 2020), and then the night's:
//   · two tables made once (air.js makes them, in doubles): the air's TRANSMITTANCE and its MULTIPLE SCATTERING;
//   · THE SKY AS SEEN from the eye's height: a small table (192 x 108, finest at the horizon) for the Sun, and one for
//     the Moon where its light in the air counts, each made again only when its light or the eye's height has moved;
//   · THE AIR BETWEEN THE EYE AND THE LAND (aerial perspective): 32 slices of the view out to 128 km, each 32 x 32,
//     made every frame: how much of what is behind survives and how much light the air adds (the Sun's, the Moon's,
//     and the night's own glow scattered). Every material that takes fog reads it instead of fog (adopt(), below),
//     so the land, the sea, the buildings, the ships and the bodies stand in the same air as the sky;
//   · THE SUN: a disc of its true size where the clockwork sees it, darkened to its limb, dimmed and reddened by the
//     air it is seen through, and flattened near the horizon because the air lifts its lower limb more;
//   · THE NIGHT (solar/night.js): the Milky Way and every star too faint for the catalogue (a cube map in true units),
//     the zodiacal light, the airglow and the air's scattering of them, in the dome and in the sea; the Moon's light
//     in the air and on the land, and its disc as a plain lit shape of its true size and phase until its sphere is
//     made; the catalogue's 9,096 stars and the planets as points where they are, each laid over the pixels round its
//     true place and shown by how far above the eye's own threshold it stands;
//   · THE EYE: one exposure for everything (air.js), following the scene, the Purkinje shift as it darkens, and one
//     curve that brings the world's range to the screen's (Reinhard's, on the luminance, the hue kept: `airShow`,
//     below); the eye's own veil round the key light (the CIE's disability glare), added in light to the sky and to
//     whatever stands in front of it, by how much of that light is in sight: seven marks on its disc, which the GPU is
//     asked about each frame (were any of their pixels in front of everything solid?), so a palm's trunk or a ship
//     takes the glare away as it takes the disc; and the veils of the brightest points, in the sky.
// The picture is drawn straight to the screen as before: every light is multiplied by the exposure before it is
// used, and each adopted material ends with the air and the curve, so nothing is drawn twice. What is drawn in
// the screen's own terms (a glow, a flame, a thing with no light on it) keeps its own brightness.
//
// The tables the GPU makes hold half floats, which keep three figures between 6e-5 and 65,000 and little below. The
// sky from noon to midnight runs through ten powers of ten, so each table holds its light over that light's own sky
// on level ground (or the whole sky's) at that moment, a number near 1 at any hour, and the reader multiplies it back.
import * as THREE from 'three';
import { AIR, LUT, AIR_GLSL, SUN, GLARE, EYE, CURVES, luminance, transmittance, transmittanceLUT, multiScatteringLUT, exposureFor, adapt, shownColour, veil } from './solar/air.js';
import { createDaylight, GROUND, MATTERS } from './solar/daylight.js';
import { NIGHT_GLSL, NIGHT_EYE_GLSL, SCAT_N, glowScatter, zodiacalGrid, ZL_GRID, starField, yearsOf, aberration, starPlace } from './solar/night.js';
import { horizonMatrix } from './solar/ephemeris.js';
import { STARS, STAR_FIELDS } from './solar/stars.js';
import { when } from './solar/clock.js';

const D2R = Math.PI / 180;
const f = (x) => { const s = Number(x).toPrecision(9); return /[.e]/.test(s) ? s : s + '.0'; };
// a point's veil is the CIE's equation from where it is defined (0.1 degrees) out: a point has no disc to hold it in
const POINT_HELD = 0.1;
// how far out a veil is worth drawing: the angle (degrees, at most 60) where a light of `glare` (lux times the
// exposure) lays less than `least` (a scene value) over the sky
function reach(glare, least, held) {
  if (!(glare > 0)) return held;
  if (glare * veil(60) >= least) return 60;
  let lo = held, hi = 60; for (let i = 0; i < 30; i += 1) { const m = (lo + hi) / 2; if (glare * veil(m) > least) lo = m; else hi = m; }
  return hi;
}

// ---- what every adopted material shares: one set of uniforms, by reference (they outlive any one sky, because a
// body's materials go with it from place to place)
const SHARED = {
  uAirAP: { value: null },                                          // the air between eye and land
  uAirPx: { value: new THREE.Vector4(1, 1, 32, 32) },               // 1 / the picture's width and height in pixels; the table's slices, and their width
  uAirProj: { value: new THREE.Vector4(1, 1, 0, 0) },               // a pixel to a ray in the eye's own axes
  uAirCam: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)] },   // the eye's right, up and forward
  uAirGain: { value: 0 },                                           // the whole sky's light on level ground (lux) times the exposure: what brings the air's table to the picture's
  uAirSun: { value: new THREE.Vector3(0, 1, 0) },                   // toward the Sun as seen
  uAirKey: { value: new THREE.Vector3(0, 1, 0) },                   // toward the key light as seen (the Sun by day; the Moon, or a planet): the veil's middle
  uAirHeld: { value: GLARE.held },                                  // degrees: the veil is held at its value there, inside that light's disc
  uAirReach: { value: 0.5 },                                        // the cosine of how far from it its veil is drawn: 60 degrees, or where it falls under a two-hundredth of the sky's light
  uAirGlare: { value: new THREE.Vector3() },                        // its light at the eye (lux in three colours) times the exposure, by how much of it is in sight
  uAirEnv: { value: 1 },                                            // the same, for the wrapped sky (1 where no true sky is drawn)
  uAirCurve: { value: CURVES.indexOf(EYE.curve) },                  // which curve brings the scene to the screen (air.js CURVES)
  uAirExp: { value: 1 },                                            // the exposure: a scene value over it is the luminance it stands for (cd/m2)
  uAirAdapt: { value: 1e9 },                                        // the luminance the eye is adapted to (cd/m2): no rod vision under it
};
// THE CURVE (air.js says why): a scene value, as the screen shows it, after the Purkinje shift (night.js). three.js's
// own curves are here beside it for comparing (its chunk, under names of our own, its exposure taken as 1: ours is
// already in the light).
const TONE = THREE.ShaderChunk.tonemapping_pars_fragment.replace('uniform float toneMappingExposure;', '').replace(/toneMappingExposure/g, '1.0')
  .replace(/\b(LinearToneMapping|ReinhardToneMapping|OptimizedCineonToneMapping|RRTAndODTFit|ACESFilmicToneMapping|agxDefaultContrastApprox|AgXToneMapping|CustomToneMapping|LINEAR_REC2020_TO_LINEAR_SRGB|LINEAR_SRGB_TO_LINEAR_REC2020)\b/g, 'air$1');
const SHOW_GLSL = `
${TONE}
${NIGHT_EYE_GLSL}
vec3 airShow(vec3 c) {
  c = max(c, 0.0);
  c = nightPurkinje(c, dot(c, N_LUMA) / max(uAirExp, 1.0e-30), uAirAdapt);      // as it darkens, rod vision: the colour goes, a blue stays
  if (uAirCurve < 0.5) return c;                                      // none: what is past white is white
  if (uAirCurve > 2.5) return airACESFilmicToneMapping(c);
  if (uAirCurve > 1.5) return clamp(airAgXToneMapping(c), 0.0, 1.0);
  float Y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (Y <= 1.0e-9) return c;
  float Yd = min(1.0, Y * (1.0 + Y / ${f(EYE.white * EYE.white)}) / (1.0 + Y)), top;
  c *= Yd / Y; top = max(c.r, max(c.g, c.b));
  if (top > 1.0) c = mix(c, vec3(Yd), clamp((top - 1.0) / max(top - Yd, 1.0e-6), 0.0, 1.0));      // out of the screen's reach: less colour, the same hue
  return c;
}`;
const EYE_GLSL = `
uniform float uAirCurve; uniform float uAirExp; uniform float uAirAdapt;
${SHOW_GLSL}
// the other way, for a thing drawn in the screen's own terms: what light it stands for (Reinhard's curve undone)
vec3 airUnshow(vec3 c) {
  float Yd = min(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.995);
  if (uAirCurve < 0.5 || Yd <= 1.0e-9) return c;
  float b = 1.0 - Yd;
  return c * ((sqrt(b * b + Yd * ${f(4 / (EYE.white * EYE.white))}) - b) * ${f(EYE.white * EYE.white / 2)} / Yd);
}`;
// the eye's veil round a light: luminance per lux at the eye, by the angle from it (air.js veil(), the CIE's equation),
// held inside the light's own disc (uAirHeld degrees)
const VEIL_GLSL = `
uniform float uAirHeld; uniform float uAirReach;
float airVeilAt(float t, float held) { t = max(t, held); return (10.0 / (t * t * t) + (5.0 / (t * t) + ${f(0.1 * GLARE.pigment)} / t) * ${f(1 + (GLARE.age / 62.5) ** 4)} + ${f(0.0025 * GLARE.pigment)}) * (1.0 - smoothstep(40.0, 60.0, t)); }
vec3 airVeil(vec3 d, vec3 sun, vec3 glare) {
  if (dot(d, sun) < uAirReach) return vec3(0.0);                      // past where it can be seen (60 degrees for the Sun)
  return glare * airVeilAt(degrees(2.0 * asin(min(1.0, 0.5 * length(d - sun)))), uAirHeld);
}`;
const AIR_PARS = `
#ifdef USE_FOG
uniform sampler2D uAirAP; uniform vec4 uAirPx; uniform vec4 uAirProj; uniform vec3 uAirCam[3]; uniform float uAirGain; uniform vec3 uAirKey; uniform vec3 uAirGlare;
${VEIL_GLSL}
${EYE_GLSL}
#endif`;
// The air applied to a fragment, in light, and then the curve, before it is made into the screen's own numbers.
// `kind`: 'lit' (a thing the lights fall on: its colour is the scene's light already); 'own' (a thing drawn in the
// screen's own terms, with no light on it: it is taken back to light, given the air, and shown again); 'add' (a
// thing that is itself added light, a flame or a glow: only dimmed by the air in front of it).
const airFog = (kind) => `
#ifdef USE_FOG
{
  vec2 airUv = gl_FragCoord.xy * uAirPx.xy, airRay = (airUv * 2.0 - 1.0) * uAirProj.xy + uAirProj.zw;
  float airKm = vFogDepth * length(vec3(airRay, 1.0)) * 0.001, airN = uAirPx.z, airW = uAirPx.w;
  float airS = sqrt(clamp(airKm / ${f(LUT.AP_KM)}, 0.0, 1.0)) * airN - 0.5, airNear = 1.0;
  if (airS < 0.0) { airNear = clamp(airKm * airN * airN * ${f(4 / LUT.AP_KM)}, 0.0, 1.0); airS = 0.0; }
  float airI = min(floor(airS), airN - 2.0), airF = clamp(airS - airI, 0.0, 1.0);
  vec2 airAt = vec2((airI + clamp(airUv.x, 0.5 / airW, 1.0 - 0.5 / airW)) / airN, airUv.y);
  vec4 airA = mix(texture2D(uAirAP, airAt), texture2D(uAirAP, airAt + vec2(1.0 / airN, 0.0)), airF) * airNear;
  ${kind === 'add' ? 'gl_FragColor.rgb *= 1.0 - airA.a;'
    : `gl_FragColor.rgb = airShow(${kind === 'own' ? 'airUnshow(gl_FragColor.rgb)' : 'gl_FragColor.rgb'} * (1.0 - airA.a) + airA.rgb * uAirGain + airVeil(normalize(uAirCam[0] * airRay.x + uAirCam[1] * airRay.y + uAirCam[2]), uAirKey, uAirGlare));`}
}
#endif`;
const ADOPTED = new WeakSet();
// A material is made to stand in the air: where it took fog it takes the air between the eye and itself instead, and
// what it takes from the wrapped sky is brought to the picture's units. Its own onBeforeCompile still runs first.
function adopt(material) {
  if (!material || ADOPTED.has(material) || !material.isMaterial) return;
  ADOPTED.add(material);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  // a thing the lights fall on (and the sea, which is lit by the same numbers in its own drawing); a glow; or a thing of its own brightness
  const kind = material.blending === THREE.AdditiveBlending ? 'add' : material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshToonMaterial || material.isShaderMaterial ? 'lit' : 'own';
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    let fs = shader.fragmentShader;
    if (fs.includes('#include <fog_fragment>') && fs.includes('#include <fog_pars_fragment>')) {
      Object.assign(shader.uniforms, { uAirAP: SHARED.uAirAP, uAirPx: SHARED.uAirPx, uAirProj: SHARED.uAirProj, uAirCam: SHARED.uAirCam, uAirGain: SHARED.uAirGain, uAirKey: SHARED.uAirKey, uAirHeld: SHARED.uAirHeld, uAirReach: SHARED.uAirReach, uAirGlare: SHARED.uAirGlare, uAirCurve: SHARED.uAirCurve, uAirExp: SHARED.uAirExp, uAirAdapt: SHARED.uAirAdapt });
      fs = fs.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + AIR_PARS);
      if (fs.includes('#include <colorspace_fragment>')) fs = fs.replace('#include <fog_fragment>', '').replace('#include <colorspace_fragment>', airFog(kind) + '\n#include <colorspace_fragment>');
      else fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(2.2));' + airFog(kind) + '\ngl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(1.0 / 2.2));');
    }
    if (fs.includes('#include <envmap_physical_pars_fragment>')) {
      shader.uniforms.uAirEnv = SHARED.uAirEnv;
      fs = fs.replace('#include <envmap_physical_pars_fragment>', 'uniform float uAirEnv;\n' + THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/envMapIntensity/g, '( envMapIntensity * uAirEnv )'));
    }
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => key + '|air:' + kind;
  material.needsUpdate = true;
}

// ---- the passes' own shaders
const QUAD_VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
// the sky as seen: across, the angle round from the light (finest toward it); up, from the zenith down to the horizon
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
// reading them back: a direction in the world (y up) to its place in a table made for a light toward `l`
const SKYLOOK_GLSL = `
uniform sampler2D uSkyView; uniform sampler2D uMoonView; uniform vec2 uSkySize; uniform float uH; uniform vec3 uSun; uniform vec3 uMoonDir;
vec3 skyLookIn(sampler2D tab, vec3 d, vec3 l) {
  float h = clamp(uH, 0.0, A_HT - 0.001), beta = acos(clamp(sqrt(h * (2.0 * A_RG + h)) / (A_RG + h), 0.0, 1.0)), zha = A_PI - beta;
  float za = acos(clamp(d.y, -1.0, 1.0)), v = za <= zha ? 0.5 * (1.0 - sqrt(max(0.0, 1.0 - za / zha))) : 0.5 + 0.5 * sqrt(clamp((za - zha) / beta, 0.0, 1.0));
  float ld = length(d.xz), ls = length(l.xz), ca = (ld > 1.0e-5 && ls > 1.0e-5) ? clamp(dot(d.xz, l.xz) / (ld * ls), -1.0, 1.0) : 1.0;
  return texture2D(tab, (vec2(sqrt(max(0.0, 0.5 - 0.5 * ca)), v) + 0.5 / uSkySize) * (uSkySize / (uSkySize + 1.0))).rgb;
}
vec3 skyLook(vec3 d) { return skyLookIn(uSkyView, d, uSun); }
vec3 moonLook(vec3 d) { return skyLookIn(uMoonView, d, uMoonDir); }`;
// the same reading for a drawing of its own that wants the sky in it (the sea's surface): skyOver(d, sun) is the
// whole sky's light from a direction (y up), in the picture's own units: the Sun's sky, the Moon's and the night's
// glow (`sun` is not read: the Sun's place is the sky's own uniform). Its uniforms are the sky's own (`seaSky`, below).
export const SKY_OVER_GLSL = `
${AIR_GLSL}
${NIGHT_GLSL}
uniform sampler2D uSkyView; uniform sampler2D uMoonView; uniform vec2 uSkySize; uniform float uSkyH; uniform float uSkyGain; uniform float uMoonGain; uniform float uNightGain; uniform vec3 uSkySun; uniform vec3 uMoonDir;
vec3 skyOverIn(sampler2D tab, vec3 d, vec3 l) {
  float h = clamp(uSkyH, 0.0, ${f(AIR.height - 0.001)}), beta = acos(clamp(sqrt(h * (${f(2 * AIR.ground)} + h)) / (${f(AIR.ground)} + h), 0.0, 1.0)), zha = 3.14159265358979 - beta;
  float za = acos(clamp(d.y, -1.0, 1.0)), v = za <= zha ? 0.5 * (1.0 - sqrt(max(0.0, 1.0 - za / zha))) : 0.5 + 0.5 * sqrt(clamp((za - zha) / beta, 0.0, 1.0));
  float ld = length(d.xz), ls = length(l.xz), ca = (ld > 1.0e-5 && ls > 1.0e-5) ? clamp(dot(d.xz, l.xz) / (ld * ls), -1.0, 1.0) : 1.0;
  return texture2D(tab, (vec2(sqrt(max(0.0, 0.5 - 0.5 * ca)), v) + 0.5 / uSkySize) * (uSkySize / (uSkySize + 1.0))).rgb;
}
vec3 skyOver(vec3 d, vec3 sun) {
  vec3 c = skyOverIn(uSkyView, d, uSkySun) * uSkyGain;
  if (uMoonGain > 0.0) c += skyOverIn(uMoonView, d, uMoonDir) * uMoonGain;
  if (uNightGain > 0.0) c += nightGlow(d) * uNightGain;
  return c;
}`;
// the air between the eye and the land: side by side, one square of the view for each slice of distance. The Sun's
// light, the Moon's where it counts, and the night's own glow scattered by the air along the way (as the air toward
// the horizon scatters it, by how much of the way's light the air takes): all over the whole sky's light on level ground
const AP_FRAG = `
${AIR_GLSL}
${NIGHT_GLSL}
uniform vec3 uCam[3]; uniform vec4 uProj; uniform float uH; uniform vec3 uSunW; uniform vec3 uAp; uniform float uSunAmt; uniform vec3 uMoonW; uniform vec3 uMoonAmt; uniform vec3 uGlowAP;
void main() {
  float N = uAp.x, W = uAp.y, tile = floor(gl_FragCoord.x / W), w = (tile + 0.5) / N;
  vec2 ray = (vec2(gl_FragCoord.x - tile * W, gl_FragCoord.y) / W * 2.0 - 1.0) * uProj.xy + uProj.zw;
  vec3 d = normalize(uCam[0] * ray.x + uCam[1] * ray.y + uCam[2]), thr, thr2;
  float km = ${f(LUT.AP_KM)} * w * w; int n = int(max(2.0, (tile + 1.0) * uAp.z));
  vec3 L = airMarch(uH, d, uSunW, km, n, 0.0, 0.0, thr) * uSunAmt;
  if (uMoonAmt.g > 0.0) L += airMarch(uH, d, uMoonW, km, n, 0.0, 0.0, thr2) * uMoonAmt;
  if (uGlowAP.g > 0.0) { float mu = max(d.y, 0.0); L += uGlowAP * nightScat(mu) * (1.0 - thr) / max(1.0 - airT(uH, mu), vec3(1.0e-3)); }
  gl_FragColor = vec4(L, 1.0 - dot(thr, vec3(1.0 / 3.0)));
}`;
// the sky wrapped round whatever stands in it (no disc: the key's own light is the key light): the whole sphere
// unrolled, the ground's own brightness under the horizon; over the whole sky's light on level ground
const WRAP_FRAG = `
${AIR_GLSL}
${NIGHT_GLSL}
${SKYLOOK_GLSL}
uniform vec2 uSize; uniform vec3 uUnder; uniform float uSunAmt; uniform vec3 uMoonAmt; uniform float uNightAmt;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float lon = (uv.x - 0.5) * 6.28318530718, lat = (uv.y - 0.5) * A_PI;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)), dd = normalize(vec3(d.x, max(d.y, 0.02), d.z));
  vec3 sky = skyLook(dd) * uSunAmt;
  if (uMoonAmt.g > 0.0) sky += moonLook(dd) * uMoonAmt;
  if (uNightAmt > 0.0) sky += nightGlow(dd) * uNightAmt;
  gl_FragColor = vec4(mix(uUnder, sky, smoothstep(-0.06, 0.03, d.y)), 1.0);
}`;
// the brightest points' veils in the sky (the eight that give most): each a direction, and its light at the eye times
// the exposure; a point's own veil is not part of the sky it is seen against (`self`: leave out any within a twentieth
// of a degree of it)
const BRIGHT = 8;
const POINT_VEILS_GLSL = `
uniform vec4 uBright[${BRIGHT}]; uniform float uBrightReach[${BRIGHT}]; uniform float uBrightN;
vec3 pointVeils(vec3 d, bool self) {
  float v = 0.0;
  for (int i = 0; i < ${BRIGHT}; i++) {
    if (float(i) >= uBrightN) break;
    vec4 b = uBright[i]; float gap = length(d - b.xyz);
    if (gap > uBrightReach[i] || (self && gap < 8.7e-4)) continue;     // past where it falls under a two-hundredth of the sky's light; or its own (within a twentieth of a degree)
    v += b.w * airVeilAt(degrees(2.0 * asin(min(1.0, 0.5 * gap))), ${f(POINT_HELD)});
  }
  return vec3(v);
}`;
// the whole sky's light along a direction as seen, in the picture's units: what the dome draws behind the discs, and
// what a point is laid over (the stars' own pass reads it at each)
const TRUE_SKY_GLSL = `
uniform float uGain; uniform float uMoonGain; uniform float uNightGain; uniform vec3 uGlare;
// T: what the air lets through along d (needed only at night)
vec3 skyAir(vec3 d, vec3 T) { vec3 c = uGain > 1.0e-9 ? skyLook(d) * uGain : vec3(0.0); if (uMoonGain > 0.0) c += moonLook(d) * uMoonGain; if (uNightGain > 0.0) c += nightFront(d, T) * uNightGain; return c; }
vec3 skyBeyond(vec3 d, vec3 T) { return uNightGain > 0.0 ? nightBack(d, T) * uNightGain : vec3(0.0); }
vec3 skyVeils(vec3 d, bool self) { return (self && length(d - uAirKey) < 8.7e-4 ? vec3(0.0) : airVeil(d, uAirKey, uGlare)) + pointVeils(d, self); }`;
// the dome's corners (10,242 of them, two degrees apart) work out what changes slowly across the sky: where each
// look's light comes from on the J2000 equator (the air's lift undone), and the zodiacal light there
const DOME_VERT = `
${AIR_GLSL}
${NIGHT_GLSL}
uniform float uNightGain;
varying vec3 vDir; varying vec3 vJ; varying float vZL;
void main() {
  vDir = normalize(position);
  if (uNightGain > 0.0) { vJ = uW2J * nightTrue(vDir); vZL = nightZL(vJ); } else { vJ = vec3(1.0, 0.0, 0.0); vZL = 0.0; }
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww;
}`;
const DOME_FRAG = `
#include <common>
#include <dithering_pars_fragment>
varying vec3 vDir; varying vec3 vJ; varying float vZL;
${AIR_GLSL}
${NIGHT_GLSL}
${SKYLOOK_GLSL}
${VEIL_GLSL}
${POINT_VEILS_GLSL}
${EYE_GLSL}
uniform vec3 uAirKey;
${TRUE_SKY_GLSL}
uniform vec3 uSunTrue; uniform float uSunGain; uniform float uSunRad; uniform float uRefr; uniform vec3 uLimb;
uniform vec3 uMoonTrue; uniform float uMoonRad; uniform vec3 uMoonLit; uniform vec3 uMoonDisc;
// degrees the air lifts what stands at a true height of alt degrees (Saemundsson's formula, as ephemeris.js has it)
float lift(float alt) { float hh = max(alt, -1.0), r = 1.02 / tan(radians(hh + 10.3 / (hh + 5.11))) / 60.0 * uRefr; return alt < -1.0 ? r * exp((alt + 1.0) / 0.7) : r; }
void main() {
  vec3 d = normalize(vDir);
  float px = length(fwidth(d)), hh = clamp(uH, 0.0, A_HT - 0.001);
  bool overSea = d.y > -sqrt(hh * (2.0 * A_RG + hh)) / (A_RG + hh);
  vec3 T = uNightGain > 0.0 || uMoonRad > 0.0 ? airT(hh, d.y) : vec3(1.0), c = skyAir(d, T), beyond = uNightGain > 0.0 && d.y > 0.0 ? nightBackAt(normalize(vJ), vZL, T) * uNightGain : vec3(0.0);
  // THE MOON, for now a plain disc of its true size, place and phase, its lit part of the mean luminance its light
  // gives (its face, its reflectance and its earthshine are the next part's): it hides what lies beyond the air
  if (uMoonRad > 0.0 && dot(d, uMoonDir) > cos(uMoonRad + 0.01)) {
    vec3 q = nightTrue(d) - uMoonTrue; float th = length(q);
    float on = 1.0 - smoothstep(uMoonRad - 0.5 * px, uMoonRad + 0.5 * px, th);
    if (on > 0.0 && overSea) {
      vec3 n = normalize(q / uMoonRad - sqrt(max(0.0, 1.0 - th * th / (uMoonRad * uMoonRad))) * uMoonTrue);       // the sphere's face there, turned to us
      float lit = smoothstep(-0.5 * px / uMoonRad, 0.5 * px / uMoonRad, dot(n, uMoonLit));
      beyond = mix(beyond, uMoonDisc * T * lit, on);
    }
  }
  c += beyond;
  if (dot(d, uSun) > 0.9994) {                                        // within two degrees of where the Sun is seen
    // where this pixel's light really comes from: the air lifted it, more the lower it is
    float seen = degrees(asin(clamp(d.y, -1.0, 1.0))), was = seen - lift(seen);
    for (int i = 0; i < 4; i++) was = seen - lift(was);
    float cw = cos(radians(was)); vec2 hz = normalize(d.xz);
    float th = length(vec3(hz.x * cw, sin(radians(was)), hz.y * cw) - uSunTrue);      // radians from the Sun's true middle
    float on = 1.0 - smoothstep(uSunRad - 0.5 * px, uSunRad + 0.5 * px, th);
    if (on > 0.0 && overSea) {
      // its disc: the mean luminance (lux over its solid angle), darkened to the limb, through the air it is seen through
      float m = sqrt(max(1.0e-4, 1.0 - th * th / (uSunRad * uSunRad)));
      vec3 disc = airT(hh, d.y) * (uLimb + 2.0) * 0.5 * pow(vec3(m), uLimb) / (A_PI * uSunRad * uSunRad) * uSunGain;
      disc /= max(1.0, max(disc.r, max(disc.g, disc.b)));             // brighter than the screen: its colour is kept, not each colour's ceiling
      c += disc * on;
    }
  }
  c += skyVeils(d, false);
  gl_FragColor = vec4(airShow(c), 1.0);
  #include <colorspace_fragment>
  #include <dithering_fragment>
}`;
// THE STARS AND THE PLANETS, each a point laid over the pixels round its true place (night.js POINTS): its J2000
// direction (moved by its proper motion and leaned by the eye's motion; a planet's is the clockwork's apparent place),
// turned onto the horizon, lifted, dimmed and reddened by the air, twinkling by how much air it is seen through (a
// planet does not); shown by how many of the eye's thresholds it stands above the sky behind it. What it adds is
// worked out on the screen's own numbers: the sky there as drawn, and the same with the point in it.
const STAR_VERT = `
${AIR_GLSL}
${NIGHT_GLSL}
${SKYLOOK_GLSL}
${VEIL_GLSL}
${POINT_VEILS_GLSL}
uniform float uAirCurve; uniform float uAirExp; uniform float uAirAdapt;
${SHOW_GLSL}
uniform vec3 uAirKey;
${TRUE_SKY_GLSL}
attribute float aLux; attribute vec3 aCol; attribute float aKind;     // its light above the air (lux); its colour (unit luminance); 0 a star, 1 a planet
uniform mat3 uJ2W; uniform vec3 uAb; uniform float uTime; uniform vec2 uView; uniform float uDip; uniform float uMoonCut; uniform float uSunCut; uniform float uShowLight;
varying vec3 vInc; varying vec2 vAt; varying vec3 vSky;
float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise(float x) { float i = floor(x), t = fract(x); return mix(hash(i), hash(i + 1.0), t * t * (3.0 - 2.0 * t)) * 2.0 - 1.0; }
float gauss(float x) { return (noise(x) + 0.5 * noise(x * 2.31 + 17.0)) * 1.72; }     // about one standard deviation
void main() {
  vInc = vec3(0.0); vSky = vec3(0.0); vAt = vec2(-1.0e4);
  vec3 j = normalize(position + uAb * (1.0 - aKind)), w = uJ2W * j;
  // the air's lift, from its true height
  float alt = degrees(asin(clamp(w.y, -1.0, 1.0))), up = radians(alt + nightLift(alt));
  vec2 hz = normalize(w.xz + vec2(1.0e-9, 0.0));
  vec3 d = vec3(hz.x * cos(up), sin(up), hz.y * cos(up));
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
  gl_Position = p.xyww; gl_PointSize = 0.0;
  // under the sea's edge, behind the eye, or behind the Moon or the Sun: nothing
  if (d.y < uDip || p.w <= 0.0 || dot(d, uMoonDir) > uMoonCut || dot(d, uSun) > uSunCut) return;
  // its light at the eye: through the air, twinkling (each colour apart low down)
  vec3 T = airT(uH, d.y);
  float sig = nightTwinkle(d.y) * (1.0 - aKind), seed = float(gl_VertexID) * 7.13, rho = clamp(1.6 * d.y + 0.15, 0.0, 1.0), g = gauss(uTime * 4.0 + seed);
  vec3 tw = exp(sig * (rho * g + sqrt(1.0 - rho * rho) * vec3(gauss(uTime * 4.0 + seed + 101.0), gauss(uTime * 4.0 + seed + 203.0), gauss(uTime * 4.0 + seed + 307.0))) - 0.5 * sig * sig);
  vec3 E = aLux * aCol * T * tw;
  float El = dot(E, N_LUMA);
  // the sky behind it, as drawn, and the luminance that stands for
  vSky = skyAir(d, T) + skyBeyond(d, T) + skyVeils(d, true);
  float B = dot(vSky, N_LUMA) / max(uAirExp, 1.0e-30);
  float k = El / nightThreshold(max(B, uAirAdapt)), peak;
  if (uShowLight > 0.5) peak = El * uAirExp;                          // &stars=light: its light as it falls (the splat spreads it)
  else { if (k < 0.05) return; peak = nightPointScale(k) * max(N_PFLOOR, N_PWEBER * dot(airShow(vSky), N_LUMA)) / N_PMID; }
  // its colour: none to the rods; the cones' from ten thresholds to a hundred, and all of it in day vision
  float sat = max(nightRods(uAirAdapt), smoothstep(N_PCOLOUR.x, N_PCOLOUR.y, log(max(k, 1.0e-6)) * 0.434294482));
  vInc = mix(N_RODWHITE, E / max(El, 1.0e-30), sat) * peak;
  vAt = (p.xy / p.w * 0.5 + 0.5) * uView;
  gl_PointSize = 7.0;
}`;
const STAR_FRAG = `
uniform float uAirCurve; uniform float uAirExp; uniform float uAirAdapt; uniform float uShowLight; uniform float uPixSr;
${SHOW_GLSL}
vec3 encode(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
varying vec3 vInc; varying vec2 vAt; varying vec3 vSky;
void main() {
  float w = nightPixel(gl_FragCoord.xy - vAt);
  if (w < 1.0e-4) discard;
  vec3 s0 = airShow(vSky), s1 = uShowLight > 0.5 ? airShow(vSky + vInc * w / uPixSr) : s0 + vInc * w;
  gl_FragColor = vec4(encode(s1) - encode(s0), 1.0);                // added to what the dome drew there: the sky with the point in it
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

const curveOf = (search) => { try { const c = new URLSearchParams(search || '').get('curve'); return CURVES.includes(c) ? c : EYE.curve; } catch { return EYE.curve; } };
const evOf = (search) => { try { const v = parseFloat(new URLSearchParams(search || '').get('ev')); return Number.isFinite(v) ? Math.max(-14, Math.min(6, v)) : 0; } catch { return 0; } };
// `&stars=light` beside ?sky=true: each point drawn as its light falling on its pixels, through the same curve as the
// sky (as a camera would record it), instead of by the eye's thresholds: for comparing, as `&curve=` is
const starsOf = (search) => { try { return new URLSearchParams(search || '').get('stars') === 'light' ? 'light' : 'eye'; } catch { return 'eye'; } };
// can this machine draw it? (WebGL 2, and tables of half floats it can draw into)
export function canDrawTrueSky(renderer) {
  try { return !!renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')); } catch { return false; }
}

// createTrueSky({ renderer, lite, lat, lon, ground }): the sky over (lat, lon). `ground` (the island's) says where
// the land stands between the eye and the key light. What comes back: `dome` (to add to the scene), `fog` (to set as
// the scene's: its numbers are not used, it only says "this scene has air"), and
//   update({ camera, t, key, fill, sea, scene, indoor }) once a frame, before the picture: the tables, the lights,
//   the exposure, the wrapped sky, the stars; it adopts whatever materials have come into the scene
//   state: what view.js and the buildings ask after (the key's and the sky's colours in the picture's units, how
//   far into the night it is), and read(): the numbers, for the probes
export function createTrueSky({ renderer, lite = false, lat, lon, ground = null }) {
  const day = createDaylight({ lat, lon, stars: STARS }), size = lite ? LUT.lite : LUT, [SW, SH] = size.SKY, [AN, AW] = size.AP;
  const t0 = performance.now();
  const tT = table(transmittanceLUT()), tM = table(multiScatteringLUT(), renderer.extensions.has('OES_texture_float_linear')), made = performance.now() - t0;
  const skyRT = target(SW, SH), moonRT = target(SW, SH), apRT = target(AN * AW, AW), wrapRT = target(256, 128);
  wrapRT.texture.mapping = THREE.EquirectangularReflectionMapping;
  // the night's own textures: the Milky Way (fetched; until it comes, a black one) and the zodiacal light's grid
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); black.needsUpdate = true;
  const zl = new THREE.DataTexture(Uint16Array.from(zodiacalGrid(), (x) => THREE.DataUtils.toHalfFloat(x)), ZL_GRID.w, ZL_GRID.h, THREE.RedFormat, THREE.HalfFloatType);
  zl.magFilter = zl.minFilter = THREE.LinearFilter; zl.wrapS = zl.wrapT = THREE.ClampToEdgeWrapping; zl.generateMipmaps = false; zl.needsUpdate = true;
  let mw = null, mwState = 'fetching';
  const scat = glowScatter();
  const NIGHT = {
    uMW: { value: black }, uZL: { value: zl }, uW2J: { value: new THREE.Matrix3() }, uSunLon: { value: 0 }, uNightH: { value: 0.002 },
    uGlowMean: { value: new THREE.Vector3() }, uScat: { value: Array.from({ length: SCAT_N }, (_, i) => new THREE.Vector3(scat.table[3 * i], scat.table[3 * i + 1], scat.table[3 * i + 2])) }, uLiftK: { value: 1 },
  };
  new THREE.ImageBitmapLoader().setOptions({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).load(new URL('./solar/milkyway-cube.jpg', import.meta.url).href, (bitmap) => {
    if (mwState === 'gone') { bitmap.close?.(); return; }
    mw = new THREE.Texture(bitmap); mw.colorSpace = THREE.NoColorSpace; mw.flipY = false; mw.generateMipmaps = false; mw.magFilter = mw.minFilter = THREE.LinearFilter; mw.wrapS = mw.wrapT = THREE.ClampToEdgeWrapping; mw.needsUpdate = true;
    NIGHT.uMW.value = mw; mwState = 'drawn';
  }, undefined, (e) => { mwState = 'failed'; console.error('[sky] the Milky Way could not be fetched', e); });
  const common = { uAirT: { value: tT }, uAirMS: { value: tM } };
  const SKYGAIN = { value: 0 }, MOONGAIN = { value: 0 }, NIGHTGAIN = { value: 0 }, GLARE_U = { value: new THREE.Vector3() };
  const LOOK = { uSkyView: { value: skyRT.texture }, uMoonView: { value: moonRT.texture }, uSkySize: { value: new THREE.Vector2(SW, SH) }, uH: { value: 0.002 }, uSun: SHARED.uAirSun, uMoonDir: { value: new THREE.Vector3(0, -1, 0) } };
  const BRIGHT_U = { uBright: { value: Array.from({ length: BRIGHT }, () => new THREE.Vector4()) }, uBrightReach: { value: new Array(BRIGHT).fill(0) }, uBrightN: { value: 0 } };
  const EYE_U = { uAirCurve: SHARED.uAirCurve, uAirExp: SHARED.uAirExp, uAirAdapt: SHARED.uAirAdapt, uAirHeld: SHARED.uAirHeld, uAirReach: SHARED.uAirReach, uAirKey: SHARED.uAirKey };
  const TRUE_U = { uGain: SKYGAIN, uMoonGain: MOONGAIN, uNightGain: NIGHTGAIN, uGlare: GLARE_U };
  const U = {
    sky: { ...common, uH: { value: 0.002 }, uSunUp: { value: 1 }, uSize: { value: new THREE.Vector2(SW, SH) }, uSteps: { value: size.STEPS }, uNorm: { value: 1 } },
    ap: { ...common, ...NIGHT, uCam: SHARED.uAirCam, uProj: SHARED.uAirProj, uH: LOOK.uH, uSunW: SHARED.uAirSun, uAp: { value: new THREE.Vector3(AN, AW, lite ? 1 : 2) }, uSunAmt: { value: 1 }, uMoonW: LOOK.uMoonDir, uMoonAmt: { value: new THREE.Vector3() }, uGlowAP: { value: new THREE.Vector3() } },
  };
  U.moon = { ...U.sky, uSunUp: { value: 0 }, uNorm: { value: 1 } };
  U.wrap = { ...common, ...NIGHT, ...LOOK, uSize: { value: new THREE.Vector2(256, 128) }, uUnder: { value: new THREE.Vector3() }, uSunAmt: { value: 1 }, uMoonAmt: { value: new THREE.Vector3() }, uNightAmt: { value: 0 } };
  U.dome = { ...common, ...NIGHT, ...LOOK, ...BRIGHT_U, ...EYE_U, ...TRUE_U, uSunTrue: { value: new THREE.Vector3(0, 1, 0) }, uSunGain: { value: 0 }, uSunRad: { value: 0.00465 }, uRefr: NIGHT.uLiftK, uLimb: { value: new THREE.Vector3(...SUN.limb) },
    uMoonTrue: { value: new THREE.Vector3(0, -1, 0) }, uMoonRad: { value: 0 }, uMoonLit: { value: new THREE.Vector3(0, 1, 0) }, uMoonDisc: { value: new THREE.Vector3() } };
  const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const mSky = pass(SKYVIEW_FRAG, U.sky), mMoon = pass(SKYVIEW_FRAG, U.moon), mAp = pass(AP_FRAG, U.ap), mWrap = pass(WRAP_FRAG, U.wrap);
  const quadGeo = new THREE.BufferGeometry(); quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(quadGeo, mSky), quadScene = new THREE.Scene(), quadCam = new THREE.Camera(); quad.frustumCulled = false; quadScene.add(quad);
  const run = (material, rt) => { const was = renderer.getRenderTarget(); quad.material = material; renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam); renderer.setRenderTarget(was); };

  const domeGeo = new THREE.IcosahedronGeometry(1, 5);
  const domeMat = new THREE.ShaderMaterial({ uniforms: U.dome, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, dithering: true });
  // drawn after everything solid (it lies at the far end of the depth), so the GPU skips every pixel the land and the
  // things on it have covered; the see-through things (the sea, the stars, glass) come after it as before
  const dome = new THREE.Mesh(domeGeo, domeMat); dome.frustumCulled = false; dome.renderOrder = 1000; dome.scale.setScalar(50000);
  ADOPTED.add(domeMat);
  const fog = new THREE.Fog(0x000000, 1e9, 2e9);

  // ---- the stars and the planets: one set of points, the planets last (put where the clockwork sees them, twice a second)
  const NS = STARS.length / STAR_FIELDS, NP = day.light.planets.length;
  let field = starField(STARS, yearsOf(when()), STAR_FIELDS);
  const starGeo = new THREE.BufferGeometry(), pos = new Float32Array(3 * (NS + NP)), lux = new Float32Array(NS + NP), col = new Float32Array(3 * (NS + NP)), kind = new Float32Array(NS + NP);
  pos.set(field.dir); lux.set(field.lux); col.set(field.col); kind.fill(1, NS);
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); starGeo.setAttribute('aLux', new THREE.BufferAttribute(lux, 1)); starGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); starGeo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const STAR_U = { ...common, ...NIGHT, ...LOOK, ...BRIGHT_U, ...EYE_U, ...TRUE_U, uJ2W: { value: new THREE.Matrix3() }, uAb: { value: new THREE.Vector3() }, uTime: { value: 0 }, uView: { value: new THREE.Vector2(1, 1) }, uDip: { value: 0 },
    uMoonCut: { value: 2 }, uSunCut: { value: 2 }, uShowLight: { value: 0 }, uPixSr: { value: 1 } };
  const starMat = new THREE.ShaderMaterial({ uniforms: STAR_U, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  ADOPTED.add(starMat);
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9;
  // the brightest stars, whose veils the sky draws with the planets': those under V 1.5
  const brightStars = []; for (let i = 0; i < NS; i += 1) if (STARS[i * STAR_FIELDS + 5] < 1.5) brightStars.push(i);

  // the key light in sight: seven marks on its disc (its middle, and six round it), far off along the way to it. They
  // are drawn after everything solid, writing nothing; each asks the GPU whether any of it showed
  const gl = renderer.getContext(), marks = new THREE.Group(), markGeo = new THREE.CircleGeometry(1, 6);
  const markMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: true, transparent: true, fog: false });
  ADOPTED.add(markMat);
  const MARKS = [[0, 0], ...[0, 1, 2, 3, 4, 5].map((k) => [0.6 * Math.cos(k * Math.PI / 3), 0.6 * Math.sin(k * Math.PI / 3)])].map(([a, b]) => {
    const mesh = new THREE.Mesh(markGeo, markMat), q = { a, b, mesh, query: gl.createQuery(), open: false, asked: false, shows: 1 };
    mesh.renderOrder = 45; mesh.frustumCulled = false;
    mesh.onBeforeRender = () => { if (!q.asked && !q.open && q.query) { gl.beginQuery(gl.ANY_SAMPLES_PASSED, q.query); q.open = true; } };
    mesh.onAfterRender = () => { if (q.open) { gl.endQuery(gl.ANY_SAMPLES_PASSED); q.open = false; q.asked = true; } };
    marks.add(mesh);
    return q;
  });
  marks.visible = false;
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const R = new THREE.Vector3(), Uu = new THREE.Vector3(), B = new THREE.Vector3(), buf = new THREE.Vector2(), fwd = [0, 0, -1], rgt = [1, 0, 0], upv = [0, 1, 0];
  const S3 = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3(), P3 = new THREE.Vector3(), col3 = [0, 0, 0];
  // how much of the key light's disc is in sight of the eye: the marks' answers while it is in the picture (they are
  // a frame or two old); out of the picture, only whether the land stands in the way
  function inSight(camera, s, radius) {
    S3.set(s[0], s[1], s[2]);
    P3.copy(S3).multiplyScalar(1000).add(camera.position).project(camera);
    const framed = S3.dot(camera.getWorldDirection(E1)) > 0 && Math.abs(P3.x) < 0.98 && Math.abs(P3.y) < 0.98;
    marks.visible = framed;
    let shows = 0;
    for (const q of MARKS) {
      if (q.asked && gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) { q.shows = gl.getQueryParameter(q.query, gl.QUERY_RESULT) ? 1 : 0; q.asked = false; }
      shows += q.shows;
    }
    if (!framed) return hidden(camera.position, s) ? 0 : 1;
    // the marks stand most of the way to the far end of the eye's reach, each on its place of the disc, facing the eye
    // (a planet, a point, is given a disc of a twentieth of a degree: a pixel or two)
    const far = camera.far * 0.8, rad = Math.max(radius, 0.05) * D2R;
    E1.set(-s[2], 0, s[0]); if (E1.lengthSq() < 1e-8) E1.set(1, 0, 0); E1.normalize(); E2.crossVectors(S3, E1).normalize();
    for (const q of MARKS) {
      q.mesh.position.copy(S3).addScaledVector(E1, q.a * rad).addScaledVector(E2, q.b * rad).normalize().multiplyScalar(far).add(camera.position);
      q.mesh.quaternion.copy(camera.quaternion); q.mesh.scale.setScalar(far * rad * 0.25);
    }
    return shows / MARKS.length;
  }
  let lastT = NaN, frame = 0, adapted = 0, sceneL = 0, exposure = 0, sight = 1, skyAt = null, moonAt = null, wrapAt = null, seen = 0, cpu = 0, planetsAt = NaN, keyWas = '', brightList = [];
  const state = { sunCol: new THREE.Color(), skyCol: new THREE.Color(), night: 0, env: 1, exposure: 0 };
  // is the land between the eye and the key light? (a walk out along the light's way, the steps growing)
  function hidden(p, s) {
    if (!ground || s[1] > 0.6) return false;
    for (let dist = 6; dist < 30000; dist *= 1.3) { const y = p.y + s[1] * dist; if (y > 900) return false; if (ground.height(p.x + s[0] * dist, p.z + s[2] * dist) > y) return true; }
    return false;
  }
  const moved = (was, alt, h, eps) => !was || Math.abs(was.alt - alt) > eps || Math.abs(was.h - h) > Math.max(0.001, 0.02 * was.h);
  const HZ = new Array(9), AB = [0, 0, 0], v3 = [0, 0, 0], T3 = [0, 0, 0], SP = {};

  function update({ camera, t, key, fill, sea = null, scene, indoor = 1 }) {
    const began = performance.now();
    const dt = Number.isFinite(lastT) ? Math.min(0.1, Math.max(0, t - lastT)) : 0; lastT = t; frame += 1; api.parts.eye.camera = camera;
    const now = when(), L = day.at(now, Math.max(0.5, camera.position.y)), s = L.sun, M = L.moon, K = L.key, N = day.night.state;
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
      sceneL = day.scene(fwd, rgt, upv, 1 / pe[0], 1 / pe[5], api.curve);
    }
    SHARED.uAirCurve.value = Math.max(0, CURVES.indexOf(api.curve));
    adapted = adapt(adapted, sceneL, dt); exposure = exposureFor(adapted, api.curve) * Math.pow(2, api.bias);
    SHARED.uAirExp.value = exposure; SHARED.uAirAdapt.value = api.debug.rods ? adapted : 1e9;
    // each sky table is kept over its own light's sky on level ground; the air's and the wrapped sky's, over the whole sky's
    const fillL = Math.max(luminance(L.fill), 1e-12), per = Math.max(luminance(L.sky) / L.lux, 1e-12);
    const moonSky = luminance(M.sky), moonOn = M.alt > -12 && moonSky > MATTERS * fillL, perM = Math.max(moonSky / Math.max(M.lux, 1e-30), 1e-12);
    const nightOn = exposure > 0.05;                                   // below that the night's glow is a hundred-thousandth of white
    SKYGAIN.value = per * L.lux * exposure; MOONGAIN.value = moonOn ? perM * M.lux * exposure : 0; NIGHTGAIN.value = nightOn && api.debug.night ? exposure : 0;
    SHARED.uAirGain.value = fillL * exposure; SHARED.uAirEnv.value = fillL * exposure;
    U.dome.uSunGain.value = L.lux * exposure;
    // the key light at the eye, and whether the land or a wall hides it
    const want = inSight(camera, K.dir, K.radius);
    if (K.id !== keyWas) { sight = want; keyWas = K.id; }
    sight += (want - sight) * (dt ? 1 - Math.exp(-dt / 0.12) : 1);
    GLARE_U.value.set(K.direct[0] * exposure * sight, K.direct[1] * exposure * sight, K.direct[2] * exposure * sight);
    SHARED.uAirGlare.value.copy(GLARE_U.value); SHARED.uAirKey.value.set(K.dir[0], K.dir[1], K.dir[2]); SHARED.uAirHeld.value = Math.max(K.radius, POINT_HELD);
    // each veil is drawn out to where it falls under a two-hundredth of the sky's own brightness as shown (at night
    // half of one of the screen's 255 steps; the Sun's, by day, still reaches the 60 degrees it always did)
    const least = 5e-3 * exposure * adapted;
    SHARED.uAirReach.value = Math.cos(reach(luminance(GLARE_U.value.toArray(v3)), least, SHARED.uAirHeld.value) * D2R);
    // the tables: the sky as seen when its light or the eye's height has moved; the air to the land every frame
    LOOK.uH.value = U.sky.uH.value = U.moon.uH.value = L.height;
    if (moved(skyAt, L.alt, L.height, 0.01) && (SKYGAIN.value > 1e-6 || !skyAt)) { U.sky.uSunUp.value = s[1]; U.sky.uNorm.value = 1 / per; run(mSky, skyRT); skyAt = { alt: L.alt, h: L.height, per }; }
    LOOK.uMoonDir.value.set(M.dir[0], M.dir[1], M.dir[2]);
    if (moonOn && moved(moonAt, M.alt, L.height, 0.01)) { U.moon.uSunUp.value = M.dir[1]; U.moon.uNorm.value = 1 / perM; run(mMoon, moonRT); moonAt = { alt: M.alt, h: L.height, per: perM }; }
    U.ap.uSunAmt.value = L.lux / fillL;
    if (moonOn) U.ap.uMoonAmt.value.set(M.lux * M.colour[0] / fillL, M.lux * M.colour[1] / fillL, M.lux * M.colour[2] / fillL); else U.ap.uMoonAmt.value.set(0, 0, 0);
    if (nightOn) U.ap.uGlowAP.value.set(N.mean[0] / fillL, N.mean[1] / fillL, N.mean[2] / fillL); else U.ap.uGlowAP.value.set(0, 0, 0);
    // the night: the world's turn onto the J2000 equator for the Milky Way and the zodiacal light, every frame
    horizonMatrix(lat, lon, now, HZ);
    NIGHT.uW2J.value.set(HZ[0], HZ[6], -HZ[3], HZ[1], HZ[7], -HZ[4], HZ[2], HZ[8], -HZ[5]);
    NIGHT.uSunLon.value = N.sunLon; NIGHT.uNightH.value = L.height; NIGHT.uGlowMean.value.set(N.mean[0], N.mean[1], N.mean[2]); NIGHT.uLiftK.value = L.refraction;
    run(mAp, apRT); SHARED.uAirAP.value = apRT.texture;
    // the sky wrapped round what stands in it, when the Sun or the Moon has moved a fifth of a degree, at night when
    // the stars have turned a quarter of a degree, and when the whole sky's light has changed by a quarter
    if (moved(wrapAt, L.alt, L.height, 0.2) || (moonOn && Math.abs(wrapAt.moon - M.alt) > 0.2) || (nightOn && Math.abs(now - wrapAt.when) > 60e3) || Math.abs(wrapAt.fill / fillL - 1) > 0.25) {
      const g = GROUND / Math.PI / fillL; U.wrap.uUnder.value.set(L.ground[0] * g, L.ground[1] * g, L.ground[2] * g);
      U.wrap.uSunAmt.value = per * L.lux / fillL;
      if (moonOn) U.wrap.uMoonAmt.value.set(perM * M.lux / fillL, perM * M.lux / fillL, perM * M.lux / fillL); else U.wrap.uMoonAmt.value.set(0, 0, 0);
      U.wrap.uNightAmt.value = nightOn || L.alt < -6 ? 1 / fillL : 0;
      run(mWrap, wrapRT); envRT = pmrem.fromEquirectangular(wrapRT.texture, envRT || null); wrapAt = { alt: L.alt, h: L.height, moon: M.alt, when: now, fill: fillL };
    }
    if (scene) { if (scene.environment !== envRT.texture) scene.environment = envRT.texture; if (scene.fog !== fog) scene.fog = fog; if (marks.parent !== scene) scene.add(marks); if (stars.parent !== scene) scene.add(stars); }
    // the dome: the Sun's disc, and the Moon's
    U.dome.uSunTrue.value.set(L.trueSun[0], L.trueSun[1], L.trueSun[2]); U.dome.uSunRad.value = L.radius * D2R;
    const mr = M.radius * D2R; U.dome.uMoonRad.value = M.alt > -2 ? mr : 0; U.dome.uMoonTrue.value.set(M.trueDir[0], M.trueDir[1], M.trueDir[2]);
    // toward the Sun from the Moon (what lights it), and its lit face's mean luminance: its light over that part's solid angle
    for (let c = 0; c < 3; c += 1) v3[c] = L.trueSun[c] * L.sunDistance - M.trueDir[c] * M.distance;
    const vl = Math.hypot(v3[0], v3[1], v3[2]) || 1; U.dome.uMoonLit.value.set(v3[0] / vl, v3[1] / vl, v3[2] / vl);
    const lit = M.lux / (Math.PI * mr * mr * Math.max(M.phase, 1e-3)) * exposure; U.dome.uMoonDisc.value.set(lit * M.colour[0], lit * M.colour[1], lit * M.colour[2]);
    dome.position.copy(camera.position);
    // the stars: the turn from J2000 to the world, the eye's motion, the time (for twinkling), the screen
    STAR_U.uJ2W.value.copy(NIGHT.uW2J.value).transpose();
    aberration(lat, lon, now, HZ, AB); STAR_U.uAb.value.set(AB[0], AB[1], AB[2]);
    STAR_U.uTime.value = t % 1000; STAR_U.uView.value.set(buf.x, buf.y);
    STAR_U.uDip.value = -Math.sqrt(2 * L.height / AIR.ground) - 0.0005;
    STAR_U.uMoonCut.value = M.alt > -2 ? Math.cos(mr) : 2; STAR_U.uSunCut.value = Math.cos(L.radius * D2R);
    STAR_U.uShowLight.value = api.stars === 'light' ? 1 : 0;
    STAR_U.uPixSr.value = (2 * Math.tan(camera.fov * D2R / 2) / buf.y) ** 2;      // a pixel's solid angle (sr)
    if (Math.abs(yearsOf(now) - field.years) > 0.5) { field = starField(STARS, yearsOf(now), STAR_FIELDS); pos.set(field.dir); starGeo.attributes.position.needsUpdate = true; }
    // the planets, where the clockwork sees them (their own aberration is in that), with their light; and the brightest
    // points' veils: the planets and the brightest stars that are up, the key's own left out
    if (planetsAt !== day.planetsAt) {
      L.planets.forEach((p, i) => { pos.set(p.j2000, 3 * (NS + i)); lux[NS + i] = p.lux; col.set(p.colour, 3 * (NS + i)); });
      starGeo.attributes.position.needsUpdate = starGeo.attributes.aLux.needsUpdate = starGeo.attributes.aCol.needsUpdate = true;
      planetsAt = day.planetsAt;
      // (each where it is seen, the air's lift and the eye's motion in it, as its point is drawn: a point's own veil is
      // left out of the sky it is seen against by its place, so the two places must be one)
      const list = [];
      for (const p of L.planets) if (p !== K && p.dir[1] > 0 && p.lux > 0) list.push([p.dir[0], p.dir[1], p.dir[2], luminance(p.direct)]);
      for (const i of brightStars) {
        const k = i * STAR_FIELDS, q = starPlace([STARS[k], STARS[k + 1], STARS[k + 2], STARS[k + 3], STARS[k + 4]], lat, lon, now, SP);
        if (q.up > 0) list.push([q.east, q.up, -q.north, field.lux[i] * luminance(transmittance(L.height, q.up, T3))]);
      }
      brightList = list.sort((a, b) => b[3] - a[3]).slice(0, BRIGHT);
    }
    BRIGHT_U.uBrightN.value = api.debug.veils ? brightList.length : 0;
    brightList.forEach((b, i) => { BRIGHT_U.uBright.value[i].set(b[0], b[1], b[2], b[3] * exposure); BRIGHT_U.uBrightReach.value[i] = 2 * Math.sin(reach(b[3] * exposure, least, POINT_HELD) * D2R / 2); });
    // the lights: the key is the brightest light that comes straight, through the air; the fill is half of the whole
    // sky's light on level ground (the other half comes by the wrapped sky), and from below, what the ground gives back
    const d0 = K.direct[0] * exposure, d1 = K.direct[1] * exposure, d2 = K.direct[2] * exposure, top = Math.max(d0, d1, d2, 1e-9);
    if (key) { key.color.setRGB(d0 / top, d1 / top, d2 / top); key.intensity = top * indoor; }
    if (fill) { fill.color.setRGB(0.5 * L.fill[0] * exposure, 0.5 * L.fill[1] * exposure, 0.5 * L.fill[2] * exposure); fill.groundColor.setRGB(0.5 * GROUND * L.ground[0] * exposure, 0.5 * GROUND * L.ground[1] * exposure, 0.5 * GROUND * L.ground[2] * exposure); fill.intensity = indoor; }
    // What the rooms ask after. A room draws its own inside in the screen's own terms, so it is handed what the
    // screen shows: the key's light on a white thing facing it (a room's patch of sunlight was always drawn twice as
    // bright as the same stone outside: 1.5 where the key gave 0.76), and the sky's mean brightness
    shownColour([d0 / Math.PI, d1 / Math.PI, d2 / Math.PI], col3, api.curve); state.sunCol.setRGB(2 * col3[0], 2 * col3[1], 2 * col3[2]);
    const k = exposure / Math.PI; shownColour([L.fill[0] * k, L.fill[1] * k, L.fill[2] * k], col3, api.curve); state.skyCol.setRGB(col3[0], col3[1], col3[2]);
    state.night = Math.min(1, Math.max(0, (-L.alt - 2) / 8)); state.exposure = exposure;
    // the sea's own few numbers: where the key light is (the island turns its key light that way too), its glitter, how
    // lit the water's own colour is (the sky in it, it reads from the tables: seaSky)
    if (sea) {
      sea.uSun.value.set(K.dir[0], K.dir[1], K.dir[2]); sea.uSunCol.value.setRGB(d0 / top, d1 / top, d2 / top); sea.uSunAmt.value = top / 2.4;
      sea.uBodyAmt.value.setRGB(L.ground[0] * exposure / 2.4, L.ground[1] * exposure / 2.4, L.ground[2] * exposure / 2.4);
    }
    // whatever has come into the scene since stands in the same air
    if (scene) { let n = 0; scene.traverse((o) => { const m = o.material; if (!m) return; n += 1; if (Array.isArray(m)) m.forEach(adopt); else adopt(m); }); seen = n; }
    cpu += (performance.now() - began - cpu) * 0.05;       // what this cost the page's own thread, lately (ms)
    return L;
  }
  // what the passes cost the GPU: each drawn n times and waited for (a probe's question; nothing in the game asks it)
  function cost(n = 60) {
    const gl = renderer.getContext(), wait = () => { renderer.readRenderTargetPixels(skyRT, 0, 0, 1, 1, px); gl.finish(); }, out = {};
    for (const [name, m, rt] of [['air', mAp, apRT], ['sky', mSky, skyRT], ['moon', mMoon, moonRT], ['wrap', mWrap, wrapRT]]) { wait(); const a = performance.now(); for (let i = 0; i < n; i += 1) run(m, rt); wait(); out[name] = (performance.now() - a) / n; }
    return out;
  }
  // a texel of the sky as seen, as the GPU made it (for a light of 1 lux): the probes compare it with air.js's own
  const px = new Uint16Array(4);
  function peek(i, j, moon = false) { renderer.readRenderTargetPixels(moon ? moonRT : skyRT, i, j, 1, 1, px); const was = moon ? moonAt : skyAt; return [0, 1, 2].map((c) => THREE.DataUtils.fromHalfFloat(px[c]) * (was ? was.per : 1)); }
  // the night's glow along some directions (world frame, as seen), as the GPU works it out (cd/m2): the probes compare
  // it with night.js's own. A row of pixels, one a direction, drawn by the same chunk the dome reads (times 10^4, so
  // that half floats keep their figures)
  const probeRT = target(64, 1), probeU = { ...common, ...NIGHT, uDirs: { value: Array.from({ length: 64 }, () => new THREE.Vector3()) } };
  const mProbe = pass(`${AIR_GLSL}\n${NIGHT_GLSL}\nuniform vec3 uDirs[64];\nvoid main() { int i = int(gl_FragCoord.x); gl_FragColor = vec4(nightGlow(normalize(uDirs[i])) * 1.0e4, 1.0); }`, probeU);
  const probePx = new Uint16Array(64 * 4);
  function nightOnGpu(dirs) {
    const n = Math.min(64, dirs.length);
    for (let i = 0; i < n; i += 1) probeU.uDirs.value[i].set(dirs[i][0], dirs[i][1], dirs[i][2]);
    run(mProbe, probeRT); renderer.readRenderTargetPixels(probeRT, 0, 0, 64, 1, probePx);
    return Array.from({ length: n }, (_, i) => [0, 1, 2].map((c) => THREE.DataUtils.fromHalfFloat(probePx[4 * i + c]) * 1e-4));
  }
  const api = {
    dome, fog, day, state, update, peek, cost, nightOnGpu, tables: { sky: [SW, SH], air: [AN, AW], made },
    parts: { stars, dome, uniforms: { dome: U.dome, stars: STAR_U, ap: U.ap }, eye: { camera: null } },      // a probe's handles (nothing in the game reads them)
    debug: { night: true, veils: true, rods: true },      // a probe's switches, to measure what each part costs
    // stops added to the exposure. Nothing in the game sets it: a probe does (a dark glass, to look at the Sun's own
    // disc), and `&ev=1` in the address beside ?sky=true, for whoever is judging how bright the picture should be
    bias: evOf(typeof location === 'undefined' ? '' : location.search),
    // which curve brings the scene to the screen (air.js CURVES): Reinhard's unless `&curve=none|agx|aces` asks for another, to compare
    curve: curveOf(typeof location === 'undefined' ? '' : location.search),
    // how the points are shown: by the eye's thresholds, unless `&stars=light` asks for their light as it falls
    stars: starsOf(typeof location === 'undefined' ? '' : location.search),
    // the uniforms SKY_OVER_GLSL reads: the tables of the sky as seen, their size, the eye's height, what brings them
    // to the picture's units, and the night's
    seaSky: { ...common, ...NIGHT, uSkyView: LOOK.uSkyView, uMoonView: LOOK.uMoonView, uSkySize: LOOK.uSkySize, uSkyH: LOOK.uH, uSkyGain: SKYGAIN, uMoonGain: MOONGAIN, uNightGain: NIGHTGAIN, uSkySun: SHARED.uAirSun, uMoonDir: LOOK.uMoonDir },
    read() {
      const L = day.light, M = L.moon, N = day.night.state;
      return { when: L.when, alt: L.alt, az: L.az, lifted: L.lifted, height: L.height, lux: L.lux, direct: luminance(L.direct), sky: luminance(L.sky), level: luminance(L.level), scene: sceneL, adapted, exposure, curve: api.curve, sight, materials: seen, cpu: Math.round(cpu * 1000) / 1000,
        zenith: luminance(day.toward([0, 1, 0])), zenithAll: luminance(day.towardAll([0, 1, 0])), fill: luminance(L.fill), ground: luminance(L.ground), key: L.key.id, keyDirect: luminance(L.key.direct),
        moon: { alt: M.alt, az: M.az, phase: M.phase, magnitude: M.magnitude, lux: M.lux, direct: luminance(M.direct), sky: luminance(M.sky) },
        night: { level: luminance(N.level), mean: luminance(N.mean), stars: luminance(N.starsLevel), sunLon: N.sunLon }, milkyWay: mwState, points: api.stars, bright: brightList.length,
        tables: { sky: [SW, SH], air: [AN, AW], made: Math.round(made) } };
    },
    dispose() {
      SHARED.uAirEnv.value = 1; SHARED.uAirAP.value = null; SHARED.uAirExp.value = 1; SHARED.uAirAdapt.value = 1e9; SHARED.uAirKey.value.set(0, 1, 0); SHARED.uAirHeld.value = GLARE.held;
      marks.removeFromParent(); stars.removeFromParent(); for (const q of MARKS) { if (q.open) gl.endQuery(gl.ANY_SAMPLES_PASSED); gl.deleteQuery(q.query); q.query = null; }
      mwState = 'gone';
      for (const x of [tT, tM, skyRT, moonRT, apRT, wrapRT, probeRT, mSky, mMoon, mAp, mWrap, mProbe, quadGeo, domeGeo, domeMat, pmrem, markGeo, markMat, starGeo, starMat, zl, black]) x.dispose();
      mw?.image?.close?.(); mw?.dispose(); envRT?.dispose();
    },
  };
  return api;
}
export { AIR };
