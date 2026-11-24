// far.js — THE FAR FOREST (three.js): every palm on the island past the cards (plants.js, PLANTS.mid) out to FAR.end, so the
// slopes are palm forest from 300 m up and from across the lagoon, not a colour.
//
// EACH CROWN AS PICTURES OF ITSELF. A Kentia's crown (plants.js's whole one, leaflet by leaflet) is pictured once, when the
// island is first come to, from FAR.n x FAR.n ways over the upper half of the sphere round it (a hemi-octahedral grid: R.
// Brucks's octahedral impostors, as used in games since 2018): its colour and how much of each texel is leaf in one
// texture, the way its surface faces (in the crown's own frame) and how open it is to the sky in another; drawn with four
// samples a texel, then given smaller levels. A palm far off is a square turned to the eye that shows the three pictures
// taken nearest its own way of being seen, blended (each read where the eye's line through the square meets that
// picture's plane, so they line up), lit as everything is: the key light through the leaves when it is behind them (their
// transmittance), the sky on both sides, the land's own shadow (a mountain's shadow crosses the forest), the true sky's air.
// Two crowns are pictured (one with dead fronds hanging, one without); each palm shows one, turned its own way and sized
// by its height. Its trunk, to FAR.trunks, is a strip turned to the eye.
//
// The forest is planted a FAR.tile square at a time (life.js palmsIn: the same palms, by the same rule, as the near ones),
// nearest the body first, a few milliseconds a frame; each square is one draw for its crowns and one for its trunks, and
// is left out where it is behind the eye or past FAR.end. Past FAR.end the ground's canopy colour (terrain.js) takes over.
import * as THREE from 'three';
import { palmsIn } from './life.js';
import { PLANTS, LEAF, BARK, SHARED, LEAF_LIGHT, LEAF_SKY, FRAG_PARS, VERT_PARS, NOISE, lin, crownGeometry, variantOf } from './plants.js';
import { crownOf, hash } from './kentia.js';

export const FAR = {
  n: 8,                       // views a side of the half-sphere: 64 pictures of each crown
  px: 128,                    // texels a side of each picture
  end: 3000, fade: 700,       // m: where the far forest gives way to the ground's canopy colour, over how far
  tile: 640,                  // m: the forest is planted, and left out, a square this size at a time
  trunks: 650,                // m: how far its trunks are drawn (past that a trunk is under a third of a pixel)
  budget: 4,                  // ms a frame the planting may take
  debug: 0,                   // a probe's switch: 1 paints every far crown's square solid, 2 its pictures' coverage solid
  lite: { px: 64, end: 1800, fade: 500 },
};
// which pictured crown a palm shows: plants.js's crowns with dead fronds are the first half
const kindOf = (p) => (variantOf(p, PLANTS.variants) < PLANTS.variants / 2 ? 0 : 1);

// the hemi-octahedral grid: a way over the upper half-sphere (y up) to its place in 0..1 squared, and back
export function hemiOct(v) { const l = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]); return [((v[0] + v[2]) / l) * 0.5 + 0.5, ((v[0] - v[2]) / l) * 0.5 + 0.5]; }
export function hemiOctWay(o) {
  const fx = o[0] * 2 - 1, fy = o[1] * 2 - 1, x = (fx + fy) / 2, z = (fx - fy) / 2, y = 1 - Math.abs(x) - Math.abs(z), l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
// a picture's own axes (its right and up), from the way it was taken from (the same in the bake and the shader)
function frameAxes(d) {
  const up0 = Math.abs(d[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  let r = [up0[1] * d[2] - up0[2] * d[1], up0[2] * d[0] - up0[0] * d[2], up0[0] * d[1] - up0[1] * d[0]]; const l = Math.hypot(...r); r = r.map((v) => v / l);
  return { r, u: [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]] };
}
const AXES_GLSL = `
vec3 farWay( vec2 o ) { vec2 f = o * 2.0 - 1.0; float x = ( f.x + f.y ) * 0.5, z = ( f.x - f.y ) * 0.5; return normalize( vec3( x, 1.0 - abs( x ) - abs( z ), z ) ); }
void farAxes( vec3 d, out vec3 r, out vec3 u ) { vec3 up0 = abs( d.y ) > 0.999 ? vec3( 0.0, 0.0, -1.0 ) : vec3( 0.0, 1.0, 0.0 ); r = normalize( cross( up0, d ) ); u = cross( d, r ); }`;

// ---- THE PICTURES: every view of every pictured crown drawn in one pass (each a copy of the crown turned so that view
// looks down the camera's axis, sized to its cell), four samples a texel, then copied into textures with smaller levels
const BAKE_VERT = `
attribute vec4 aLeaf; attribute vec4 aSway;
varying vec4 vLeaf; varying vec3 vTint; varying vec3 vN; varying float vAo;
void main() { vLeaf = aLeaf; vTint = color; vN = normal; vAo = aSway.w; gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4( position, 1.0 ); }`;
const BAKE_FRAG = `
uniform vec3 uLeafUp; uniform vec3 uLeafDown; uniform vec3 uRachis; uniform vec3 uFibre; uniform vec3 uSpear; uniform float uPass;
varying vec4 vLeaf; varying vec3 vTint; varying vec3 vN; varying float vAo;
void main() {
  float part = vLeaf.x; vec3 alb;
  if ( part < 0.5 ) alb = ( gl_FrontFacing ? uLeafUp : uLeafDown ) * ( 0.84 + 0.32 * vLeaf.w ) * ( 1.0 + 0.12 * vLeaf.z );
  else if ( part < 1.5 ) alb = uRachis; else if ( part < 2.5 ) alb = uFibre * 0.8; else alb = uSpear;
  alb *= vTint;
  // the colour as its square root (eight bits hold dark leaves better so); the face in the crown's own frame, the side seen
  if ( uPass < 0.5 ) gl_FragColor = vec4( sqrt( clamp( alb, 0.0, 1.0 ) ), 1.0 );
  else gl_FragColor = vec4( normalize( vN ) * ( gl_FrontFacing ? 1.0 : -1.0 ) * 0.5 + 0.5, vAo );
}`;
const pictures = new WeakMap();
export function farPictures(renderer, { lite = false } = {}) {
  const key = lite ? 'lite' : 'full';
  let byR = pictures.get(renderer); if (!byR) { byR = {}; pictures.set(renderer, byR); }
  if (byR[key]) return byR[key];
  const n = FAR.n, px = lite ? FAR.lite.px : FAR.px;
  const crowns = [crownOf(9001, { dead: true }), crownOf(9001 + 3 * 7, { dead: false })];        // plants.js's first and fourth crowns
  const geos = crowns.map((c) => crownGeometry(c, { leaflets: lite ? 30 : 40 }));
  // each crown's sphere: the middle of its box, and its farthest point from there
  const spheres = geos.map((g) => {
    g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()), p = g.attributes.position.array; let R = 0;
    for (let i = 0; i < p.length; i += 3) R = Math.max(R, Math.hypot(p[i] - c.x, p[i + 1] - c.y, p[i + 2] - c.z));
    return { c, R };
  });
  const W = crowns.length * n * px, H = n * px, half = px / 2;
  const scene = new THREE.Scene(), cols = (c) => lin(c);
  const mat = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, vertexColors: true, side: THREE.DoubleSide,
    uniforms: { uLeafUp: { value: cols(LEAF.up) }, uLeafDown: { value: cols(LEAF.down) }, uRachis: { value: cols(LEAF.rachis) }, uFibre: { value: cols(LEAF.fibre) }, uSpear: { value: cols(LEAF.spear) }, uPass: { value: 0 } } });
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), S = new THREE.Matrix4(), Rm = new THREE.Matrix4();
  geos.forEach((g, k) => {
    const mesh = new THREE.InstancedMesh(g, mat, n * n), { c, R } = spheres[k], s = (half * 0.97) / R;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = hemiOctWay([i / (n - 1), j / (n - 1)]), { r, u } = frameAxes(d);
      Rm.set(r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, d[0], d[1], d[2], 0, 0, 0, 0, 1);        // rows: the picture's right, up, toward its camera
      M.makeTranslation((k * n + i) * px + half, j * px + half, 0).multiply(S.makeScale(s, s, s)).multiply(Rm).multiply(T.makeTranslation(-c.x, -c.y, -c.z));
      mesh.setMatrixAt(j * n + i, M);
    }
    mesh.frustumCulled = false; scene.add(mesh);
  });
  const cam = new THREE.OrthographicCamera(0, W, H, 0, 1, px + 4); cam.position.set(0, 0, half + 2); cam.updateMatrixWorld();
  const msaa = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const finals = [0, 1].map(() => {
    const t = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
  const copy = new THREE.ShaderMaterial({ uniforms: { uT: { value: msaa.texture } }, vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: 'uniform sampler2D uT; void main() { gl_FragColor = texelFetch( uT, ivec2( gl_FragCoord.xy ), 0 ); }', depthTest: false, depthWrite: false });
  const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(qg, copy); quad.frustumCulled = false; const qs = new THREE.Scene(); qs.add(quad);
  const was = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha(), t0 = performance.now();
  [0, 1].forEach((pass) => {
    mat.uniforms.uPass.value = pass;
    renderer.setRenderTarget(msaa); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false); renderer.render(scene, cam);
    renderer.setRenderTarget(finals[pass]); renderer.render(qs, new THREE.Camera());
  });
  renderer.setRenderTarget(was); renderer.setClearColor(clear, clearA);
  msaa.dispose(); mat.dispose(); copy.dispose(); qg.dispose(); for (const g of geos) g.dispose();
  const out = { colour: finals[0].texture, face: finals[1].texture, targets: finals, n, px, kinds: crowns.length, spheres: spheres.map((s) => ({ y: s.c.y, x: s.c.x, z: s.c.z, R: s.R })), ms: performance.now() - t0 };
  byR[key] = out;
  return out;
}

// ---- THE FAR CROWN: a square turned to the eye, its three nearest pictures blended
const IMP_VERT = `
${VERT_PARS}
${AXES_GLSL}
attribute vec4 aC;                 // (instanced) the crown's sphere's middle (world), the crown's turn about the vertical
attribute vec4 aD;                 // its size (scale), which pictured crown, its own number
uniform vec4 uFar;                 // views a side, pictured crowns, texels a picture, where it fades out (m)
uniform vec4 uFarS[ 2 ];           // each pictured crown's sphere: its middle in the crown's frame (x, y, z), its radius
varying vec4 vFuv01; varying vec2 vFuv2; varying vec3 vFw; varying float vFarTurn; varying float vFarOut;
flat varying vec4 vFcell01; flat varying vec2 vFcell2;
vec2 farPic( vec2 cell, vec3 P, vec3 C, vec3 v, float ct, float st, float hw ) {
  vec3 dl = farWay( cell / ( uFar.x - 1.0 ) ), r, u; farAxes( dl, r, u );
  // the picture's axes in the world (the crown is turned by its turn about the vertical)
  vec3 dw = vec3( ct * dl.x + st * dl.z, dl.y, - st * dl.x + ct * dl.z ), rw = vec3( ct * r.x + st * r.z, r.y, - st * r.x + ct * r.z ), uw = vec3( ct * u.x + st * u.z, u.y, - st * u.x + ct * u.z );
  // where the eye's line through P meets that picture's plane (through C, square to its way)
  vec3 q = P - v * ( dot( P - C, dw ) / max( dot( v, dw ), 0.2 ) ) - C;
  return vec2( dot( q, rw ), dot( q, uw ) ) / ( 2.0 * hw ) + 0.5;
}`;
const IMP_BEGIN = `
float farK = aD.y; vec4 sph = farK < 0.5 ? uFarS[ 0 ] : uFarS[ 1 ];
float ct = cos( aC.w ), st = sin( aC.w );
vec3 C = aC.xyz, v = normalize( uEye - C );
float hw = sph.w * aD.x / 0.97;
// the square, turned to the eye (its up the world's up, as near as it can be)
vec3 rt = abs( v.y ) > 0.995 ? vec3( 1.0, 0.0, 0.0 ) : normalize( cross( vec3( 0.0, 1.0, 0.0 ), v ) ), up = cross( v, rt );
vec3 transformed = C + ( rt * position.x + up * position.y ) * hw;
// the eye's way in the crown's own frame, held to the upper half (seen from below, the lowest pictures)
vec3 vl = vec3( ct * v.x - st * v.z, max( v.y, 0.0 ), st * v.x + ct * v.z ); vl = normalize( vl + vec3( 0.0, 1.0e-4, 0.0 ) );
float l1 = abs( vl.x ) + abs( vl.y ) + abs( vl.z );
vec2 g = ( vec2( vl.x + vl.z, vl.x - vl.z ) / l1 * 0.5 + 0.5 ) * ( uFar.x - 1.0 ), g0 = clamp( floor( g ), vec2( 0.0 ), vec2( uFar.x - 2.0 ) ), f = g - g0;
vec2 ca, cb, cc;
if ( f.x + f.y < 1.0 ) { ca = g0; cb = g0 + vec2( 1.0, 0.0 ); cc = g0 + vec2( 0.0, 1.0 ); vFw = vec3( 1.0 - f.x - f.y, f.x, f.y ); }
else { ca = g0 + vec2( 1.0 ); cb = g0 + vec2( 0.0, 1.0 ); cc = g0 + vec2( 1.0, 0.0 ); vFw = vec3( f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y ); }
vFuv01 = vec4( farPic( ca, transformed, C, v, ct, st, hw ), farPic( cb, transformed, C, v, ct, st, hw ) ); vFuv2 = farPic( cc, transformed, C, v, ct, st, hw );
vec2 base = vec2( farK * uFar.x, 0.0 ); vFcell01 = vec4( base + ca, base + cb ); vFcell2 = base + cc;
vFarTurn = aC.w;
float farD = distance( C, uEye ); vFarOut = 1.0 - smoothstep( uFar.w - uLod.w, uFar.w, farD );
vec3 objectNormal = v;`;
const IMP_FRAG_PARS = `
${FRAG_PARS}
uniform sampler2D uFarCol; uniform sampler2D uFarFace; uniform vec4 uFar;
varying vec4 vFuv01; varying vec2 vFuv2; varying vec3 vFw; varying float vFarTurn; varying float vFarOut;
flat varying vec4 vFcell01; flat varying vec2 vFcell2;
vec3 farNormal; float vAo; float vLeafPart;
// one picture's texel: its colour and coverage, its face and openness (nothing outside its own cell). The pictures were
// drawn over a clear of nothing and averaged with it at their edges and in their smaller levels, so each texel holds its
// values times its coverage: the face's encoding undone by that (2 x - coverage), the colour's square root divided by it
void farTap( vec2 cell, vec2 uv, float w, vec2 dx, vec2 dy, inout vec4 col, inout vec4 face ) {
  float inside = step( 0.0, uv.x ) * step( 0.0, uv.y ) * step( uv.x, 1.0 ) * step( uv.y, 1.0 ), h = 0.5 / uFar.z;
  vec2 grid = vec2( uFar.x * uFar.y, uFar.x ), at = ( cell + clamp( uv, h, 1.0 - h ) ) / grid;
  vec4 c = textureGrad( uFarCol, at, dx, dy ), f = textureGrad( uFarFace, at, dx, dy );
  float a = c.a * inside * w; vec3 sq = c.rgb / max( c.a, 1.0e-3 );
  col += vec4( sq * sq * a, a ); face += vec4( ( f.rgb * 2.0 - c.a ) * inside * w, f.a * inside * w );
}`;
const IMP_COLOR = `
{
  vec2 grid = vec2( uFar.x * uFar.y, uFar.x ), dx = dFdx( vFuv01.xy ) / grid, dy = dFdy( vFuv01.xy ) / grid;
  // (no finer than a picture's fourth smaller level: past that its neighbours' texels would bleed in)
  float m = max( length( dx * grid * uFar.z ), length( dy * grid * uFar.z ) ), cap = exp2( log2( uFar.z ) - 3.0 );
  if ( m > cap ) { dx *= cap / m; dy *= cap / m; }
  vec4 col = vec4( 0.0 ), face = vec4( 0.0 );
  farTap( vFcell01.xy, vFuv01.xy, vFw.x, dx, dy, col, face ); farTap( vFcell01.zw, vFuv01.zw, vFw.y, dx, dy, col, face ); farTap( vFcell2, vFuv2, vFw.z, dx, dy, col, face );
  float cov = col.a;
  vec3 alb = col.rgb / max( cov, 1.0e-4 );
  vAo = clamp( face.a / max( cov, 1.0e-4 ), 0.2, 1.0 );
  vec3 nl = normalize( face.rgb + vec3( 0.0, 1.0e-4, 0.0 ) ), ct = vec3( cos( vFarTurn ), 0.0, sin( vFarTurn ) );
  farNormal = vec3( ct.x * nl.x + ct.z * nl.z, nl.y, - ct.z * nl.x + ct.x * nl.z );
  // coverage: a leaflet is under half a texel of these pictures, so a texel holds the share of it that is leaf; a crown far
  // off is the many fronds of it overlapping (its fronds at every height, the palms of the understorey under it), taken as
  // layers: 1 - (1 - c)^4. Sharpened to the pixel where the pictures are read at their own size; faded out far off
  float lod = log2( max( m, 1.0e-3 ) ), dense = 1.0 - pow( 1.0 - clamp( cov, 0.0, 1.0 ), 4.0 );
  cov = mix( clamp( ( dense - 0.5 ) / max( fwidth( dense ), 1.0e-4 ) + 0.5, 0.0, 1.0 ), dense, smoothstep( 0.0, 1.0, lod ) ) * vFarOut;
  diffuseColor = vec4( alb, cov );
  #ifdef FAR_DEBUG
  diffuseColor = FAR_DEBUG > 1 ? vec4( 1.0, 0.0, 1.0, col.a > 0.01 ? 1.0 : 0.0 ) : vec4( 1.0, 0.0, 1.0, 1.0 );
  #endif
  // what is leaf (green over red) lets light through; the rachis and fibres do not
  vLeafPart = 1.0 - smoothstep( 1.1, 1.5, alb.g / max( alb.r, 1.0e-4 ) );
}`;
function farMaterial(pics, lod, { lite }) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const uniforms = { uLod: { value: lod }, ...SHARED, uFarCol: { value: pics.colour }, uFarFace: { value: pics.face }, uThrough: { value: lin(LEAF.through) },
    uFar: { value: new THREE.Vector4(pics.n, pics.kinds, pics.px, lite ? FAR.lite.end : FAR.end) }, uFarS: { value: pics.spheres.map((s) => new THREE.Vector4(s.x, s.y, s.z, s.R)) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + IMP_VERT)
      .replace('#include <beginnormal_vertex>', IMP_BEGIN).replace('#include <begin_vertex>', '')
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 ); gl_Position = projectionMatrix * mvPosition;\nif ( ! plantShown( aC.xyz ) ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4( transformed, 1.0 );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE + IMP_FRAG_PARS)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ( vPlantFade.x > 0.0 ) { float hh = plantH(); if ( hh < vPlantFade.x ) discard; }')
      .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + LEAF_LIGHT.replace('float vLeafPart;', ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + IMP_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( ( viewMatrix * vec4( farNormal, 0.0 ) ).xyz );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nplantThrough = uThrough * vLeafPart;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + LEAF_SKY)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vAo; reflectedLight.indirectSpecular *= vAo * vAo;')
      .replace('#include <opaque_fragment>', '#undef OPAQUE\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'palm-far';
  m.defines = { ISLE_SHADE_N: '( dot( geometryNormal, directionalLights[ 0 ].direction ) < 0.0 ? - geometryNormal : geometryNormal )', ...(FAR.debug ? { FAR_DEBUG: FAR.debug } : {}) };
  m.alphaToCoverage = true;
  return m;
}

// ---- THE FAR TRUNK: a strip from its foot to its crown, turned to the eye, shaded as a round trunk
const TRUNK_VERT = `
${VERT_PARS}
attribute vec4 aF;                 // (instanced) its foot (world), its radius
attribute vec4 aC;                 // its top, its own number
varying float vAcrossT; varying float vUpT;`;
const TRUNK_BEGIN = `
vec3 A = aF.xyz, B = aC.xyz, mid = mix( A, B, position.y ), toEye = normalize( uEye - mid );
vec3 side = normalize( cross( B - A, toEye ) );
vec3 transformed = mid + side * position.x * aF.w * mix( 1.5, 0.9, position.y );
vec3 objectNormal = toEye;
vAcrossT = position.x; vUpT = position.y * distance( A, B );`;
const TRUNK_FRAG = `
${FRAG_PARS}
${NOISE}
uniform vec3 uBarkGrey; uniform vec3 uBarkLichen;
varying float vAcrossT; varying float vUpT;`;
function farTrunkMaterial(lod) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
  const uniforms = { uLod: { value: lod }, ...SHARED, uBarkGrey: { value: lin(BARK.grey) }, uBarkLichen: { value: lin(BARK.lichen) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRUNK_VERT)
      .replace('#include <beginnormal_vertex>', TRUNK_BEGIN).replace('#include <begin_vertex>', '')
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 ); gl_Position = projectionMatrix * mvPosition;\nif ( ! plantShown( aC.xyz ) ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4( transformed, 1.0 );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TRUNK_FRAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ( vPlantFade.x > 0.0 || vPlantFade.y < 1.0 ) { float hh = plantH(); if ( hh < vPlantFade.x || hh >= vPlantFade.y ) discard; }')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix( uBarkGrey, uBarkLichen, 0.35 * smoothstep( 0.4, 0.8, plNoise( vec2( vAcrossT * 2.0, vUpT * 0.8 ) ) ) ) * ( 1.0 - 0.6 * smoothstep( 1.2, 0.0, vUpT ) * 0.5 );')
      // the strip shaded as the round trunk it stands for: its face leans out to each side
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec3 sideV = normalize( cross( normal, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) + 1.0e-4 ); normal = normalize( normal * sqrt( max( 0.0, 1.0 - vAcrossT * vAcrossT ) ) + sideV * vAcrossT ); }');
  };
  m.customProgramCacheKey = () => 'palm-far-trunk';
  return m;
}

// THE FAR FOREST of an island: its squares planted as the frames go, each square's draws left out where they are not seen
export function createFarForest(group, { renderer, ground, shape, lite = false }) {
  const B = lite ? PLANTS.lite : PLANTS, end = lite ? FAR.lite.end : FAR.end, fade = lite ? FAR.lite.fade : FAR.fade;
  const pics = farPictures(renderer, { lite });
  const lodCrown = new THREE.Vector4(B.mid, 1e6, PLANTS.band * 2, fade), lodTrunk = new THREE.Vector4(B.mid, FAR.trunks, PLANTS.band * 2, 0);
  const crownMat = farMaterial(pics, lodCrown, { lite }), trunkMat = farTrunkMaterial(lodTrunk);
  const quad = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), strip = new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), idx = [0, 1, 2, 2, 1, 3];
  const e = shape.extent, T = FAR.tile, tiles = [];
  for (let z = Math.floor(e.z0 / T) * T; z < e.z1; z += T) for (let x = Math.floor(e.x0 / T) * T; x < e.x1; x += T) tiles.push({ x0: x, z0: z, x1: x + T, z1: z + T, made: false, crowns: null, trunks: null, n: 0 });
  let queue = null, palms = 0, madeMs = 0;
  const S = pics.spheres;
  function make(t) {
    const t0 = performance.now(), list = palmsIn(ground, t.x0, t.z0, t.x1, t.z1);
    t.made = true; t.n = list.length;
    if (!list.length) return;
    const C = new Float32Array(list.length * 4), D = new Float32Array(list.length * 4), F = new Float32Array(list.length * 4), TC = new Float32Array(list.length * 4);
    let lo = Infinity, hi = -Infinity;
    list.forEach((p, i) => {
      // its crown as plants.js puts it (on the trunk's leaning top, sized by its height), its sphere's middle there
      const h = p.h, a = p.lean * Math.cos(p.turn), c = p.lean * Math.sin(p.turn), H = h - 0.12;
      const tx = p.x - H * Math.sin(c), ty = p.y + H * Math.cos(c) * Math.cos(a), tz = p.z + H * Math.cos(c) * Math.sin(a);
      const k = kindOf(p), s = 0.78 + 0.018 * h, sp = S[k];
      C.set([tx + sp.x * s, ty + sp.y * s, tz + sp.z * s, p.turn], i * 4); D.set([s, k, hash(p.id, 5, 4), 0], i * 4);
      F.set([p.x, p.y - 0.1, p.z, 0.075 * (0.9 + 0.22 * hash(p.id, 5, 3))], i * 4); TC.set([tx, ty - 0.3, tz, hash(p.id, 5, 4)], i * 4);
      lo = Math.min(lo, p.y); hi = Math.max(hi, ty + 3);
    });
    const sphere = new THREE.Sphere(new THREE.Vector3((t.x0 + t.x1) / 2, (lo + hi) / 2, (t.z0 + t.z1) / 2), Math.hypot(T / 2, T / 2, (hi - lo) / 2) + 6);
    const geo = (verts, attrs) => {
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx);
      for (const [name, arr] of attrs) g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, 4));
      g.instanceCount = list.length; g.boundingSphere = sphere; return g;
    };
    t.crowns = new THREE.Mesh(geo(quad, [['aC', C], ['aD', D]]), crownMat); t.crowns.renderOrder = 1.5;
    t.trunks = new THREE.Mesh(geo(strip, [['aF', F], ['aC', TC]]), trunkMat);
    for (const m of [t.crowns, t.trunks]) { m.userData.isleTwin = true; group.add(m); }      // (they cast no shadow into the maps: the cards do, nearer)
    palms += list.length; madeMs += performance.now() - t0;
  }
  return {
    pictures: pics,
    // a frame: plant a few more squares (nearest the eye first), and show each square's draws only where they can be seen
    update(eye) {
      if (!queue) queue = tiles.slice().sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - eye.x, (a.z0 + a.z1) / 2 - eye.z) - Math.hypot((b.x0 + b.x1) / 2 - eye.x, (b.z0 + b.z1) / 2 - eye.z));
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < FAR.budget) make(queue.shift());
      for (const t of tiles) {
        if (!t.crowns) continue;
        const dx = Math.max(t.x0 - eye.x, 0, eye.x - t.x1), dz = Math.max(t.z0 - eye.z, 0, eye.z - t.z1), near = Math.hypot(dx, dz, Math.max(0, eye.y - 900));
        const far = Math.hypot(Math.max(Math.abs(eye.x - t.x0), Math.abs(eye.x - t.x1)), Math.max(Math.abs(eye.z - t.z0), Math.abs(eye.z - t.z1)), eye.y);
        t.crowns.visible = near < end && far > B.mid - 2 * PLANTS.band;
        t.trunks.visible = near < FAR.trunks && far > B.mid - 2 * PLANTS.band;
      }
    },
    read: () => ({ tiles: tiles.filter((t) => t.made).length, of: tiles.length, palms, ms: Math.round(madeMs), shown: tiles.filter((t) => t.crowns?.visible).length, pictureMs: Math.round(pics.ms) }),
    dispose() { for (const t of tiles) for (const m of [t.crowns, t.trunks]) if (m) { group.remove(m); m.geometry.dispose(); } crownMat.dispose(); trunkMat.dispose(); },
  };
}
