// plants.js — THE ISLAND'S PLANTS, DRAWN (three.js): the Kentia palm (Howea forsteriana, kentia.js's numbers), near and far.
//
// A PALM is built here from its numbers, so it is wholly the game's own (no model of the island's palm is free to use):
//   · ITS TRUNK: one shape for every trunk, bent and tapered on the GPU by each palm's own numbers (its height, its bow,
//     the swelling at its foot); grey, ringed with oblique raised scars a few centimetres apart, lichen on it, moss at its
//     foot, its last metre green and its rings wider there (all drawn in its shader, from where a pixel is on it);
//   · ITS CROWN: the fibrous leaf bases about the top, the spear, and the fronds, each a petiole and a rachis with its
//     leaflets, each leaflet a blade of its own (its width drawn out to a point, folded down along its yellow midrib,
//     dark and glossy above and paler below), hanging as kentia.js says; the oldest browning.
// Leaves let light through: a leaf lit from behind glows (its transmittance, after the light's own shadowing), and the
// sky's light through a leaf seen from below is part of it. The day's wind (sea.js: 6.5 m/s from the south-east) sways
// the trunks, lifts and pushes the fronds, more toward their tips, and flutters the leaflets; the shadow maps are drawn
// with the same sway (each part has a twin drawn into them only).
//
// HOW FAR, HOW FINE. Near the eye (within PLANTS.hero m) each palm is drawn whole, its leaflets as blades.
import * as THREE from 'three';
import { KENTIA, crownOf, spineOf, leafletsOf, leafletAt, leafletWidth, LEAFLET_RINGS, hash } from './kentia.js';
import { SEA, toward } from './sea.js';

// the bands each way of drawing a palm keeps to (m from the eye), and how wide the hand-over between two is
export const PLANTS = {
  hero: 22,                   // whole, leaflet by leaflet
  band: 3,                    // the hand-over's half-width
  heroAgain: 4,               // m the eye may move before the whole palms round it are chosen again
  variants: 4,                // crowns made, each palm wearing one of them (turned its own way)
};
// a leaf's colours (linear: what it reflects of each of the sky's three wavelengths), from the island's photographs and
// leaves' measured spectra (a dark leaf gives back about a tenth of the green light falling on it, half that of the red and
// blue; the Kentia's upper side is darker and glossier than its under side; a leaf lets through about as much green as it
// gives back, little red or blue)
export const LEAF = {
  up: [0.032, 0.066, 0.022], down: [0.062, 0.098, 0.044], through: [0.03, 0.085, 0.012], rib: [0.16, 0.16, 0.06],
  rachis: [0.075, 0.09, 0.032], fibre: [0.13, 0.085, 0.05], spear: [0.1, 0.12, 0.045], dead: [0.2, 0.135, 0.075],
  roughUp: 0.4, roughDown: 0.62,
};
export const BARK = { grey: [0.2, 0.2, 0.185], lichen: [0.34, 0.35, 0.31], ring: [0.09, 0.09, 0.085], green: [0.07, 0.1, 0.045], moss: [0.06, 0.07, 0.035] };

const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2]);
const WIND = toward(SEA.wind.from);

// ---- what every palm's shaders share: the time, the wind, the eye (by reference; the island sets them each frame)
const SHARED = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector4(WIND[0], WIND[1], 1, 0) },       // the way it blows toward (x, z), its strength (1: the day's)
  uEye: { value: new THREE.Vector3(1e6, 0, 1e6) },                   // the eye: how finely a palm is drawn goes by its distance from it
};

// a hash noise for the bark (GLSL)
const NOISE = `
float plHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float plNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( plHash( i ), plHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( plHash( i + vec2( 0.0, 1.0 ) ), plHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }`;

// THE VERTEX'S SHARED PART: the eye's bands (an instance outside this way's band is not drawn: its vertices are put out
// of sight; at a band's edge the pixels are shared between the two ways by a fixed pattern, so a palm changes from one to
// the other without a jump) and the sway of the trunk's top, which carries the crown
const VERT_PARS = `
uniform float uTime; uniform vec4 uWind; uniform vec3 uEye; uniform vec4 uLod;
attribute vec4 aAt;
varying vec2 vPlantFade;
// the gusts (slow, rolling over the island) and the trunk's own swing (about a third of a second a beat): where its top is
// pushed to, in the world (m)
float plantGust( vec4 at ) { return 0.55 + 0.45 * sin( uTime * 0.31 + at.x * 0.011 + at.z * 0.007 ) * sin( uTime * 0.19 + at.w * 6.2832 ); }
vec3 plantTop( vec4 at ) {
  float g = plantGust( at );
  float a = uWind.z * ( 0.04 + 0.08 * g ) * ( 0.75 + 0.35 * sin( uTime * 1.9 + at.w * 19.0 ) );
  return vec3( uWind.x, 0.0, uWind.y ) * a;
}
bool plantShown( vec3 at ) {
  float d = distance( at, uEye );
  float tin = uLod.x < 0.0 ? 1.0 : smoothstep( uLod.x - uLod.z, uLod.x + uLod.z, d ), tout = smoothstep( uLod.y - uLod.z, uLod.y + uLod.z, d );
  vPlantFade = vec2( 1.0 - tin, 1.0 - tout );
  return tin > 0.0 && tout < 1.0;
}`;
const VERT_HIDE = `
if ( ! plantShown( aAt.xyz ) ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );`;
const FRAG_PARS = `
varying vec2 vPlantFade;
float plantH() { return fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ); }`;
// a pixel at a band's edge is this way's or the other's, by a fixed pattern on the screen
const FRAG_FADE = `
if ( vPlantFade.x > 0.0 || vPlantFade.y < 1.0 ) { float h = plantH(); if ( h < vPlantFade.x || h >= vPlantFade.y ) discard; }`;

// ---- THE CROWN: its vertex (the sway) and its look
const CROWN_VERT = `
attribute vec4 aLeaf;     // what it is (0 a leaflet, 1 the rachis and petiole, 2 the fibres, 3 the spear), across it (-1..1), along it (0..1), its own number
attribute vec4 aSway;     // its frond's own number, how far out along the frond (0..1), how far along its leaflet (0..1), how open to the sky
varying vec4 vLeaf; varying float vAo;`;
const CROWN_MOVE = `
{
  // the wind's way and the top's push, in the crown's own frame (it is turned and scaled: M = sR, so M^-1 = M^T / s^2)
  mat3 pm = mat3( instanceMatrix ); float ps2 = dot( pm[ 0 ], pm[ 0 ] );
  vec3 wl = ( transpose( pm ) * vec3( uWind.x, 0.0, uWind.y ) ) / ps2, top = ( transpose( pm ) * plantTop( aAt ) ) / ps2;
  float g = plantGust( aAt ), fs = aSway.y, lu = aSway.z, fph = aSway.x * 6.2832;
  // the frond lifts and falls about its base and is pushed along the wind, the more toward its tip
  float lift = fs * fs * uWind.z * ( 0.05 + 0.07 * g ) * sin( uTime * 1.7 + fph + aAt.w * 9.0 );
  vec3 push = wl * fs * fs * uWind.z * ( 0.08 + 0.16 * g );
  // its leaflets flutter, each its own, a few times a second, the more toward their tips
  float fl = lu * lu * uWind.z * ( 0.012 + 0.03 * g ) * sin( uTime * 10.0 + aLeaf.w * 37.0 + fph );
  transformed += top + push + vec3( 0.0, lift + fl, 0.0 ) + wl * fl * 0.6;
}
vLeaf = aLeaf; vAo = aSway.w;`;
const CROWN_FRAG_PARS = `
uniform vec3 uLeafUp; uniform vec3 uLeafDown; uniform vec3 uRib; uniform vec3 uRachis; uniform vec3 uFibre; uniform vec3 uSpear;
varying vec4 vLeaf; varying float vAo;
float plantRough;`;
// what a pixel of the crown is made of: a leaflet's two sides, its midrib and veins (put away where it is under a few
// pixels across), each leaflet a little its own; the rachis; the fibres; the spear. (diffuseColor's own colour is the
// vertex's tint: a frond's age, a dead frond's brown)
const CROWN_COLOR = `
{
  vec3 alb; float part = vLeaf.x;
  if ( part < 0.5 ) {
    float a = abs( vLeaf.y ), fw = fwidth( vLeaf.y ), seen = clamp( 1.2 - fw * 4.0, 0.0, 1.0 );
    alb = gl_FrontFacing ? uLeafUp : uLeafDown;
    alb = mix( alb, uRib, ( 1.0 - smoothstep( 0.07, 0.07 + 1.5 * fw, a ) ) * 0.75 * seen );
    alb *= 1.0 + 0.08 * sin( vLeaf.y * 23.0 ) * seen;
    alb *= ( 0.84 + 0.32 * vLeaf.w ) * ( 1.0 + 0.12 * vLeaf.z );
    plantRough = gl_FrontFacing ? ${LEAF.roughUp.toFixed(3)} : ${LEAF.roughDown.toFixed(3)};
  } else if ( part < 1.5 ) { alb = uRachis * ( 0.8 + 0.4 * vLeaf.z ); plantRough = 0.55; }
  else if ( part < 2.5 ) { alb = uFibre * ( 0.7 + 0.6 * fract( vLeaf.y * 13.7 + vLeaf.w ) ); plantRough = 0.9; }
  else { alb = uSpear; plantRough = 0.5; }
  diffuseColor.rgb *= alb;
}`;
// THE LIGHT THROUGH A LEAF: what falls on its far side and is let through, to the side the eye sees. The key light's
// share is after its shadowing (the island's loop shades the key light before it comes here); the sky's is read about the
// leaf's far side, as dimmed by the crown round it.
const LEAF_LIGHT = `
uniform vec3 uThrough;
vec3 plantThrough;                   // the leaf's transmittance here (none on the rachis, fibres or trunk)
void RE_Direct_Leaf( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = saturate( - dot( geometryNormal, directLight.direction ) );
  // diffuse, and a little more straight through toward the eye (a leaf scatters forward)
  float fwd = pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 6.0 );
  reflectedLight.directDiffuse += directLight.color * plantThrough * RECIPROCAL_PI * back * ( 0.75 + 1.2 * fwd );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf`;
const LEAF_SKY = `
#if defined( RE_IndirectDiffuse )
{
  vec3 bn = - geometryNormal, eb = vec3( 0.0 );
  #if ( NUM_HEMI_LIGHTS > 0 )
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) { eb += getHemisphereLightIrradiance( hemisphereLights[ i ], bn ); }
  #pragma unroll_loop_end
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
  eb += getIBLIrradiance( bn );
  #endif
  reflectedLight.indirectDiffuse += eb * plantThrough * RECIPROCAL_PI * vAo;
}
#endif`;
// the sky's light on the crown, dimmed inside it (a frond under the others sees less sky)
const LEAF_AO = `
reflectedLight.indirectDiffuse *= vAo;
reflectedLight.indirectSpecular *= vAo * vAo;`;

// A palm's material: a MeshStandardMaterial (so the island's shadows and the true sky's air take it as they take
// everything lit), its shaders made the palm's. `kind`: 'crown' or 'trunk'.
function palmMaterial(kind, { lod, dither = false, extra = {} }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: kind === 'crown', side: kind === 'crown' ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.6, metalness: 0 });
  const uniforms = { uLod: { value: lod }, ...SHARED, ...extra };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    let vs = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS + (kind === 'crown' ? CROWN_VERT : TRUNK_VERT + TRUNK_R));
    if (kind === 'crown') vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CROWN_MOVE);
    else vs = vs.replace('#include <beginnormal_vertex>', TRUNK_SHAPE).replace('#include <begin_vertex>', '');
    sh.vertexShader = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_HIDE);
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE + FRAG_PARS + (kind === 'crown' ? CROWN_FRAG_PARS : TRUNK_FRAG_PARS))
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + (dither ? FRAG_FADE : ''));
    if (kind === 'crown') {
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + CROWN_COLOR)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = plantRough;')
        .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + LEAF_LIGHT)
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nplantThrough = vLeaf.x < 0.5 ? uThrough * vColor : vec3( 0.0 );')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + LEAF_SKY)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + LEAF_AO);
    } else {
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + TRUNK_COLOR)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = plantRough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + TRUNK_NORMAL)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + TRUNK_AO);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `palm|${kind}|${dither ? 1 : 0}`;
  // the island's shadows read a leaf's own side toward the light (a leaf lit from behind is not shaded by itself)
  if (kind === 'crown') m.defines = { ISLE_SHADE_N: '( dot( geometryNormal, directionalLights[ 0 ].direction ) < 0.0 ? - geometryNormal : geometryNormal )' };
  m.userData.plant = uniforms;
  return m;
}

// A PART'S TWIN for the shadow maps (terrain.js draws `twins` into them): the same shape and the same instances, drawn
// with a depth material that sways and hides as the part does (by the eye's distance, not the map's)
function twinOf(mesh, kind, lod, twins) {
  const m = new THREE.MeshDepthMaterial({ side: kind === 'crown' ? THREE.DoubleSide : THREE.FrontSide });
  m.colorWrite = false;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uLod: { value: lod }, ...SHARED });
    let vs = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS + (kind === 'crown' ? CROWN_VERT : TRUNK_VERT + TRUNK_R));
    vs = kind === 'crown' ? vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CROWN_MOVE) : vs.replace('#include <begin_vertex>', TRUNK_SHAPE);
    sh.vertexShader = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_HIDE);
  };
  m.customProgramCacheKey = () => `palm-depth|${kind}`;
  const t = new THREE.InstancedMesh(mesh.geometry, m, mesh.instanceMatrix.count);
  t.instanceMatrix = mesh.instanceMatrix; t.count = 0; t.frustumCulled = false; t.layers.set(2);
  mesh.userData.isleTwin = t;
  twins?.add(t);
  return t;
}

// ---- THE TRUNK: one unit cylinder for every trunk, shaped by each palm's numbers (aTrunk: its height, its bow (m at its
// middle), the bow's way (rad), its girth)
const TRUNK_VERT = `
attribute vec4 aTrunk; attribute float aRound;
varying vec3 vBark;              // round it (0..1), metres up it, its height`;
// its radius at y metres up a trunk h tall: swollen at the foot, slimmer up it, a little thicker again where it is young
const TRUNK_R = `
float trunkR( float y, float h, float girth ) {
  return girth * ( ${KENTIA.trunk.mid.toFixed(4)} + ( ${(KENTIA.trunk.foot - KENTIA.trunk.mid).toFixed(4)} ) * exp( - y / ${(KENTIA.trunk.swell / 2.3).toFixed(4)} )
    - ${((KENTIA.trunk.mid - KENTIA.trunk.top) * 0.6).toFixed(4)} * smoothstep( 0.2 * h, h, y ) + 0.006 * smoothstep( h - ${KENTIA.trunk.green.toFixed(2)}, h, y ) );
}`;
const TRUNK_SHAPE = `
float th = aTrunk.x, ty = position.y * th, tg = aTrunk.w;
float tr = trunkR( ty, th, tg ), dr = ( trunkR( ty + 0.05, th, tg ) - trunkR( ty - 0.05, th, tg ) ) / 0.1;
vec2 bw = vec2( cos( aTrunk.z ), sin( aTrunk.z ) );
float bow = aTrunk.y * sin( 3.14159265 * position.y ), bowD = aTrunk.y * 3.14159265 * cos( 3.14159265 * position.y ) / th;
vec3 objectNormal = normalize( vec3( position.x - bw.x * bowD, - dr, position.z - bw.y * bowD ) );
vec3 transformed = vec3( position.x * tr + bw.x * bow, ty, position.z * tr + bw.y * bow );
// the sway: the top moves most (the matrix only turns and moves a trunk)
transformed += ( transpose( mat3( instanceMatrix ) ) * plantTop( aAt ) ) * position.y * position.y;
vBark = vec3( aRound, ty, th );`;
const TRUNK_FRAG_PARS = `
varying vec3 vBark;
uniform vec3 uBarkGrey; uniform vec3 uBarkLichen; uniform vec3 uBarkRing; uniform vec3 uBarkGreen; uniform vec3 uBarkMoss;
float plantRough; float barkRidge; float barkAo;`;
// THE BARK: its ring scars, one for each fallen leaf, oblique, raised and undulating, closer low on the old trunk and wider
// apart on the young green part under the leaves; fine fissures along it; lichen in pale patches; moss and soil at its foot
const TRUNK_COLOR = `
{
  float a = vBark.x, y = vBark.y, h = vBark.z;
  float young = smoothstep( h - ${(KENTIA.trunk.green + 0.6).toFixed(2)}, h - ${(KENTIA.trunk.green * 0.4).toFixed(2)}, y );
  float sp = mix( ${KENTIA.trunk.ring[0].toFixed(3)}, ${KENTIA.trunk.ring[1].toFixed(3)}, smoothstep( 0.0, h, y ) * 0.5 + young * 0.5 );
  // each ring a little oblique and wavering: its height round the trunk
  float ph = y / sp + 0.35 * sin( a * 6.2832 + floor( y / sp ) * 1.7 ) + 0.2 * sin( a * 18.85 + y * 3.0 );
  float f = fract( ph ), fw = fwidth( ph ), seen = clamp( 1.3 - fw * 2.5, 0.0, 1.0 );
  // the scar: a dark groove under a raised lip
  float groove = ( 1.0 - smoothstep( 0.0, 0.12 + fw, f ) ) * seen;
  barkRidge = ( smoothstep( 0.1, 0.3, f ) - smoothstep( 0.3, 0.7, f ) ) * seen;
  vec2 q = vec2( a * 8.0, y * 1.3 );
  float fis = plNoise( vec2( a * 60.0, y * 2.5 ) ), lich = smoothstep( 0.52, 0.75, plNoise( q * 1.7 ) * 0.65 + plNoise( q * 6.0 ) * 0.35 );
  vec3 c = uBarkGrey * ( 0.82 + 0.3 * plNoise( vec2( a * 20.0, y * 0.7 ) ) ) * ( 0.88 + 0.12 * fis );
  c = mix( c, uBarkLichen * ( 0.9 + 0.2 * plNoise( q * 11.0 ) ), lich * ( 1.0 - young ) * 0.85 );
  c = mix( c, uBarkGreen * ( 0.9 + 0.2 * fis ), young );
  c = mix( c, uBarkRing, groove * ( 0.55 - 0.25 * young ) );
  c = mix( c, uBarkMoss, smoothstep( 0.9, 0.0, y ) * ( 0.5 + 0.5 * plNoise( q * 3.0 ) ) * 0.8 );
  diffuseColor.rgb = c;
  plantRough = mix( 0.88, 0.6, young );
  barkAo = 1.0 - 0.35 * groove;
}`;
// the ring's lip leans the surface up and down along the trunk
const TRUNK_NORMAL = `
normal = normalize( normal + ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz * ( barkRidge - 0.5 ) * 0.35 );`;
const TRUNK_AO = `
reflectedLight.indirectDiffuse *= barkAo;`;

// ---- the shapes
// The crown, whole: every leaflet a blade of LEAFLET_RINGS rings (its width drawn out to a point, its two edges' normals
// folded down from its midrib), the rachis and petiole a tube of five sides, the fibres a sleeve, the spear a thin cone.
export function crownGeometry(crown, { leaflets = KENTIA.frond.leaflets } = {}) {
  const P = [], N = [], C = [], A = [], W = [], I = [];
  let nv = 0;
  const vert = (p, n, tint, leaf, sway) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(tint[0], tint[1], tint[2]); A.push(...leaf); W.push(...sway); return nv++; };
  // how open to the sky a point of the crown is: its middle and its underside see less
  const open = (p) => Math.min(1, 0.42 + 0.5 * Math.min(1, Math.hypot(p[0], p[2]) / 2.8) + 0.12 * Math.max(-1, Math.min(1, p[1] / 1.5)));
  const fold = Math.tan((KENTIA.frond.foldDeg * Math.PI) / 180);
  const dead = LEAF.dead.map((d, i) => d / LEAF.up[i]);
  for (const f of crown.fronds) {
    const sp = spineOf(f, 0.04), L = f.petiole + f.rachis, ph = hash(f.seed, 3, 3);
    // an old frond a little yellower; a dead one brown
    const tint = f.dead ? dead : [1 + 0.25 * f.age, 1 + 0.12 * f.age, 1];
    // the rachis and petiole: thick at the base (a channelled stalk), thin at the tip
    const ring = 5, segs = 16, base = nv;
    for (let k = 0; k <= segs; k++) {
      const s = (L * k) / segs, at = sp[Math.min(sp.length - 1, Math.round((s / L) * (sp.length - 1)))], r = 0.022 * (1 - 0.8 * (s / L)) + 0.004;
      for (let j = 0; j < ring; j++) {
        const a = (j / ring) * Math.PI * 2, n = [at.b[0] * Math.cos(a) + at.n[0] * Math.sin(a), at.b[1] * Math.cos(a) + at.n[1] * Math.sin(a), at.b[2] * Math.cos(a) + at.n[2] * Math.sin(a)];
        vert([at.p[0] + n[0] * r, at.p[1] + n[1] * r, at.p[2] + n[2] * r], n, f.dead ? dead : [1, 1, 1], [1, Math.cos(a), s / L, ph], [ph, s / L, 0, open(at.p)]);
      }
    }
    for (let k = 0; k < segs; k++) for (let j = 0; j < ring; j++) {
      const a = base + k * ring + j, b = base + k * ring + ((j + 1) % ring), c = a + ring, d = b + ring;
      I.push(a, c, b, b, c, d);
    }
    // the leaflets
    for (const lf of leafletsOf(f, leaflets)) {
      const b0 = nv;
      for (const u of LEAFLET_RINGS) {
        const e = leafletAt(sp, lf, u), w = (lf.wide * leafletWidth(u)) / 2, o = open(e.p);
        for (const side of [1, -1]) {
          const p = [e.p[0] + e.w[0] * w * side, e.p[1] + e.w[1] * w * side, e.p[2] + e.w[2] * w * side];
          // folded down from its midrib (reduplicate): each half faces a little out to its own side
          const n = [e.n[0] + e.w[0] * fold * side, e.n[1] + e.w[1] * fold * side, e.n[2] + e.w[2] * fold * side], l = Math.hypot(n[0], n[1], n[2]);
          vert(p, [n[0] / l, n[1] / l, n[2] / l], tint, [0, side, u, lf.q], [ph, lf.s / L, u, o]);
        }
      }
      // the upper side is the front: (a, c, b) turns toward n = w x d
      for (let k = 0; k < LEAFLET_RINGS.length - 1; k++) { const a = b0 + 2 * k, b = a + 1, c = a + 2, d = a + 3; I.push(a, c, b, b, c, d); }
    }
  }
  // the fibrous leaf bases: a sleeve about the top of the trunk, from 0.6 m under it to a little over
  {
    const R = KENTIA.crown.sheathR, H0 = -KENTIA.crown.sheath + 0.12, H1 = 0.14, ring = 10, rows = 4, base = nv;
    for (let k = 0; k <= rows; k++) {
      const t = k / rows, y = H0 + (H1 - H0) * t, r = R * (0.75 + 0.35 * Math.sin(Math.PI * t)) * (1 - 0.35 * t * t);
      for (let j = 0; j <= ring; j++) { const a = (j / ring) * Math.PI * 2, n = [Math.cos(a), 0.2, Math.sin(a)]; vert([Math.cos(a) * r, y, Math.sin(a) * r], n, [1, 1, 1], [2, j / ring, t, 0.5], [0, 0, 0, 0.55]); }
    }
    for (let k = 0; k < rows; k++) for (let j = 0; j < ring; j++) { const a = base + k * (ring + 1) + j, b = a + 1, c = a + ring + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  }
  // the spear: the next leaf, still furled, straight up from the middle
  {
    const H = crown.spear, ring = 6, rows = 6, base = nv;
    for (let k = 0; k <= rows; k++) {
      const t = k / rows, r = 0.035 * (1 - t) + 0.002, x = 0.05 * t * t;
      for (let j = 0; j < ring; j++) { const a = (j / ring) * Math.PI * 2; vert([x + Math.cos(a) * r, 0.05 + H * t, Math.sin(a) * r], [Math.cos(a), 0.1, Math.sin(a)], [1, 1, 1], [3, 0, t, 0.5], [0.5, 0.3 * t, 0, 0.9]); }
    }
    for (let k = 0; k < rows; k++) for (let j = 0; j < ring; j++) { const a = base + k * ring + j, b = base + k * ring + ((j + 1) % ring), c = a + ring, d = b + ring; I.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(A, 4)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(W, 4));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  return g;
}
// the trunk's one shape: a unit cylinder (radius 1, height 1), its rings closer near the foot (where it bends the most)
export function trunkGeometry(sides = 12, rows = 18) {
  const P = [], N = [], R = [], I = [];
  for (let k = 0; k <= rows; k++) {
    const y = Math.pow(k / rows, 1.25);
    for (let j = 0; j <= sides; j++) { const a = (j / sides) * Math.PI * 2; P.push(Math.cos(a), y, Math.sin(a)); N.push(Math.cos(a), 0, Math.sin(a)); R.push(j / sides); }
  }
  for (let k = 0; k < rows; k++) for (let j = 0; j < sides; j++) { const a = k * (sides + 1) + j, b = a + 1, c = a + sides + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aRound', new THREE.Float32BufferAttribute(R, 1));
  g.setIndex(I);
  return g;
}

// A PALM, PLACED: where its trunk stands and how it is turned (its matrix, no scale), where its crown is (on the trunk's
// top, leaning as the trunk's top leans), and its numbers for the shaders. `p`: life.js's palm (x, y, z, h, lean, turn, id)
export function placePalm(p, out) {
  const h = p.h, bow = 0.12 * h * (hash(p.id, 5, 1) - 0.35) * 0.18, bowA = 6.2832 * hash(p.id, 5, 2), girth = 0.9 + 0.22 * hash(p.id, 5, 3);
  const E = out.E.set(p.lean * Math.cos(p.turn), 0, p.lean * Math.sin(p.turn)), Q = out.Q.setFromEuler(E);
  out.trunk.compose(out.V.set(p.x, p.y - 0.12, p.z), Q, out.S.set(1, 1, 1));
  // the top: straight above the foot in the trunk's own frame (the bow is nothing at either end), leaning with it; the
  // crown leans on as the bow leaves it
  const top = out.V2.set(0, h - 0.12, 0).applyQuaternion(Q).add(out.V.set(p.x, p.y, p.z));
  const tilt = Math.atan((Math.PI * bow) / h), axis = out.V3.set(-Math.sin(bowA), 0, Math.cos(bowA)).applyQuaternion(Q);
  const Qc = out.Q2.setFromAxisAngle(axis, -tilt).multiply(Q).multiply(out.Q3.setFromAxisAngle(out.V4.set(0, 1, 0), p.turn));
  out.crown.compose(top, Qc, out.S.setScalar(0.78 + 0.018 * h));
  out.at.set(top.x, top.y, top.z, hash(p.id, 5, 4));
  out.trunkNums.set(h, bow, bowA, girth);
  return out;
}
// which crown a palm wears: a short one none with dead fronds hanging (they would reach the ground)
export const variantOf = (p, n) => (p.h < 6 ? n / 2 : 0) + Math.floor(hash(p.id, 5, 5) * (p.h < 6 ? n / 2 : n));
const placeScratch = () => ({ E: new THREE.Euler(), Q: new THREE.Quaternion(), Q2: new THREE.Quaternion(), Q3: new THREE.Quaternion(), V: new THREE.Vector3(), V2: new THREE.Vector3(), V3: new THREE.Vector3(), V4: new THREE.Vector3(), S: new THREE.Vector3(),
  trunk: new THREE.Matrix4(), crown: new THREE.Matrix4(), at: new THREE.Vector4(), trunkNums: new THREE.Vector4() });

// THE PALMS ROUND THE EYE, whole: `variants` crowns, each an instanced mesh, and the trunks; chosen again (nearest first)
// as the eye moves. `twins`: the scene their shadow-map twins go in (terrain.js draws it into the shadow maps).
export function createPalms(group, { lite = false, twins = null } = {}) {
  const geos = [], mats = [], meshes = [];
  // the crowns: the first half with dead fronds hanging (for palms tall enough to hang them), the rest without
  const variants = Array.from({ length: PLANTS.variants }, (_, v) => crownOf(9001 + v * 7, { dead: v < PLANTS.variants / 2 }));
  const colours = { uLeafUp: { value: lin(LEAF.up) }, uLeafDown: { value: lin(LEAF.down) }, uThrough: { value: lin(LEAF.through) }, uRib: { value: lin(LEAF.rib) },
    uRachis: { value: lin(LEAF.rachis) }, uFibre: { value: lin(LEAF.fibre) }, uSpear: { value: lin(LEAF.spear) } };
  const bark = { uBarkGrey: { value: lin(BARK.grey) }, uBarkLichen: { value: lin(BARK.lichen) }, uBarkRing: { value: lin(BARK.ring) }, uBarkGreen: { value: lin(BARK.green) }, uBarkMoss: { value: lin(BARK.moss) } };
  const heroLod = new THREE.Vector4(-1, lite ? 0 : PLANTS.hero, PLANTS.band, 0);
  const MAXH = 160;
  const crownMat = palmMaterial('crown', { lod: heroLod, extra: colours }); mats.push(crownMat);
  const trunkMat = palmMaterial('trunk', { lod: heroLod, extra: bark }); mats.push(trunkMat);
  const inst = (geo, mat, n, extra) => {
    const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const [name, size] of extra) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); }
    group.add(m); meshes.push(m);
    if (twins) twinOf(m, geo === trunkGeo ? 'trunk' : 'crown', heroLod, twins);
    return m;
  };
  const trunkGeo = trunkGeometry(12, 18); geos.push(trunkGeo);
  const crowns = variants.map((c) => { const g = crownGeometry(c); geos.push(g); return inst(g, crownMat, MAXH, [['aAt', 4]]); });
  const trunks = inst(trunkGeo, trunkMat, MAXH * 1, [['aAt', 4], ['aTrunk', 4]]);
  const scratch = placeScratch();
  let at = null;
  // the whole palms round the eye (x, z), nearest first; `list`: the palms round the body (life.js), nearest first
  function choose(list, ex, ez) {
    const R = heroLod.y + PLANTS.band + PLANTS.heroAgain + 2, counts = crowns.map(() => 0);
    let nt = 0;
    const near = list.map((p) => [p, Math.hypot(p.x - ex, p.z - ez)]).filter((q) => q[1] < R).sort((a, b) => a[1] - b[1]);
    for (const [p] of near) {
      if (nt >= MAXH) break;
      placePalm(p, scratch);
      const v = variantOf(p, crowns.length), m = crowns[v], i = counts[v]++;
      m.setMatrixAt(i, scratch.crown); m.geometry.attributes.aAt.setXYZW(i, scratch.at.x, scratch.at.y, scratch.at.z, scratch.at.w);
      trunks.setMatrixAt(nt, scratch.trunk); trunks.geometry.attributes.aAt.setXYZW(nt, scratch.at.x, scratch.at.y, scratch.at.z, scratch.at.w);
      trunks.geometry.attributes.aTrunk.setXYZW(nt, scratch.trunkNums.x, scratch.trunkNums.y, scratch.trunkNums.z, scratch.trunkNums.w);
      nt++;
    }
    crowns.forEach((m, v) => { m.count = counts[v]; m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aAt.needsUpdate = true; });
    trunks.count = nt; trunks.instanceMatrix.needsUpdate = true; trunks.geometry.attributes.aAt.needsUpdate = true; trunks.geometry.attributes.aTrunk.needsUpdate = true;
    for (const m of meshes) if (m.userData.isleTwin) m.userData.isleTwin.count = m.count;
    at = [ex, ez];
    return nt;
  }
  return {
    meshes, variants,
    update(list, eye, moved) { if (moved || !at || Math.hypot(eye.x - at[0], eye.z - at[1]) > PLANTS.heroAgain) choose(list, eye.x, eye.z); },
    get count() { return trunks.count; },
    dispose() { for (const m of meshes) { group.remove(m); const t = m.userData.isleTwin; if (t) { t.parent?.remove(t); t.material.dispose(); } } for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}

// the shaders' shared numbers, a frame on (island.js calls it: the time, the eye)
export function plantsFrame(t, eye) { SHARED.uTime.value = t; SHARED.uEye.value.copy(eye); }
