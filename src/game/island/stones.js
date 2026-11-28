// stones.js — LORD HOWE ISLAND'S ROCKS AND THE BEACH'S THINGS, DRAWN (three.js), from rocks.js's numbers: the talus under
// the mountains' walls, the boulder shores, and the wrack line.
//
// WHAT A ROCK IS. A scanned model (Poly Haven, CC0; scripts/island/rocks-build.mjs cuts each to three levels of detail,
// rock-textures.py grades its colour to the island's and bakes its shape): its colour from its own picture; its shape in
// the light from a normal map kept in the model's own space, so the level of a few thousand triangles, the one of a few
// hundred and the one of a hundred are all lit as the whole scan (a level's triangles are only its outline); within a
// few metres of the eye, the grain of the land's own scanned basalt read over it (terrain.js's maps: a rock scaled up
// from a hand's size keeps a rock's grain).
//
// HOW IT STANDS IN THE ISLAND. Sunk in the ground (rocks.js placeOf), and the ground's colour climbs its foot (sand blown
// against it, litter and soil, the shore's rubble); moss and lichen on what faces up in the forest's shade; pressed into
// the ground, its foot sees less sky. It takes the island's light as everything there does (the true sky's or the
// present one's, the land's own shadow, the shadow maps, the sky's share at its place), and casts into the shadow maps.
// WET where the sea reaches: as high as the swash runs (water.js's own numbers), and as high as the spray wets an open
// shore: darker (the water in its pores) and glossy, the sky in it; under the mean water it is seen through the water,
// as a body wading is.
//
// HOW MANY, HOW FINE. The rocks are planted a square at a time round the eye, nearest first (a few milliseconds a frame
// at most), each square's largest first. A rock is drawn out to ROCKS.far of its own lengths (a few pixels high there:
// past that the ground's own texture carries it), at the level its distance over its length calls for; which level each
// is at is worked out again when the eye has moved a few metres. Each model's each level is one instanced drawing.
import * as THREE from 'three';
import { ROCKS, MODELS, FOOT, rocksIn, wrackIn, placeOf, clearOfPalms, farOf } from './rocks.js';
import { SEA_EDGE_GLSL } from './water.js';
import { loadArrays } from './terrain.js';

// each way of drawing: its square (m), how far out its squares are planted, the most of each model's each level drawn
export const STONES = {
  rocks: { tile: 128, reach: 1250, most: [140, 900, 7000], lite: { reach: 620, most: [0, 520, 3000] } },
  wrack: { tile: 32, reach: 64, most: [260, 1500], lite: { reach: 40, most: [0, 700] } },
  // a rock of length s at d metres is drawn whole within near[0] * s + near[1], at its middle level within
  // mid[0] * s + mid[1], at its last out to ROCKS.far * s
  near: [9, 5], mid: [42, 18],
  again: 2.5,                 // m the eye may move before each rock's level is worked out again
  budget: 3,                  // ms a frame, at most, for planting
  moss: [0.034, 0.052, 0.016],
};
const WRACK = new Set(['stick', 'log', 'shell', 'coral']);

// ---- the models, fetched once for the page and kept (rocks.bin: 'ROK1', then deflated: a head and each level's numbers)
let file = null;
function loadModels() {
  if (file) return file;
  file = (async () => {
    const res = await fetch(new URL('./rocks/rocks.bin', import.meta.url));
    if (!res.ok) throw new Error(`the rocks did not arrive (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'ROK1') throw new Error('not a rocks file');
    const raw = new Uint8Array(await new Response(new Blob([bytes.subarray(4)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const n = new DataView(raw.buffer).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + n))), base = 4 + n;
    const cut = (T, at, len) => new T(raw.buffer.slice(base + at, base + at + len * T.BYTES_PER_ELEMENT));
    const models = {};
    for (const m of head.models) {
      models[m.name] = { layer: m.layer, lods: m.lods.map((l) => {
        const q = cut(Uint16Array, l.pos, l.verts * 3), nq = cut(Int8Array, l.nor, l.verts * 4), pos = new Float32Array(l.verts * 3), nor = new Float32Array(l.verts * 3);
        for (let k = 0; k < l.verts; k++) for (let c = 0; c < 3; c++) { pos[3 * k + c] = m.min[c] + (q[3 * k + c] / 65535) * (m.max[c] - m.min[c]); nor[3 * k + c] = nq[4 * k + c] / 127; }
        return { pos, nor, uv: cut(Uint16Array, l.uv, l.verts * 2), idx: cut(Uint16Array, l.idx, l.tris * 3), tris: l.tris };
      }) };
    }
    return models;
  })();
  file.catch(() => { file = null; });
  return file;
}

// ---- the shaders' own lines (a MeshStandardMaterial's, with the island's adoption (terrain.js) and the sky's over them)
const VERT_PARS = `
attribute vec4 aRock;      // its picture's layer, its shade, its leaning toward rust, its length (m)
attribute vec4 aFoot;      // the ground's colour at its foot; then the moss on it (0..1), or, negative, its own roughness
varying vec3 vRockW; varying vec4 vRock; varying vec4 vFoot; varying vec2 vRockUv;
#ifndef ROCK_FAR
varying vec3 vRockN0; varying vec3 vRockN1; varying vec3 vRockN2;
#endif`;
// (a direction in the model's own space goes to the world by the instance's matrix made right for normals: each column
// over its own length squared, so a stretched rock's normals are still square to it)
const VERT_BODY = `
vRockUv = uv; vRock = aRock; vFoot = aFoot;
vRockW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
#ifndef ROCK_FAR
{ mat3 rm = mat3( instanceMatrix ); vRockN0 = rm[ 0 ] / dot( rm[ 0 ], rm[ 0 ] ); vRockN1 = rm[ 1 ] / dot( rm[ 1 ], rm[ 1 ] ); vRockN2 = rm[ 2 ] / dot( rm[ 2 ], rm[ 2 ] ); }
#endif`;
const FRAG_PARS = `
uniform mediump sampler2DArray uRockCol;
#ifndef ROCK_FAR
uniform mediump sampler2DArray uRockSurf;
#endif
#ifdef ROCK_GRAIN
uniform mediump sampler2DArray uRockGrain;    // the land's own scans' shape and finish (terrain.js's uIsleSurf)
#endif
uniform sampler2D uRockSky; uniform vec4 uRockLook; uniform vec3 uRockMoss;
varying vec3 vRockW; varying vec4 vRock; varying vec4 vFoot; varying vec2 vRockUv;
#ifndef ROCK_FAR
varying vec3 vRockN0; varying vec3 vRockN1; varying vec3 vRockN2;
#endif
float rockRough; float rockOcc; vec3 rockNw;
float gh( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float gn( vec2 p ) { vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f ); return mix( mix( gh( i ), gh( i + vec2( 1, 0 ) ), u.x ), mix( gh( i + vec2( 0, 1 ) ), gh( i + vec2( 1, 1 ) ), u.x ), u.y ); }
${SEA_EDGE_GLSL}`;
// what a pixel of it is made of (in place of three's vertex colour: it sets diffuseColor)
const FRAG_BODY = `
{
  vec3 rkAt = vec3( vRockUv, vRock.x );
  vec3 alb = texture( uRockCol, rkAt ).rgb * vRock.y;
  alb = mix( alb, dot( alb, vec3( 0.3333 ) ) * vec3( 1.42, 0.95, 0.66 ), vRock.z );         // some rustier: weathered, oxidised
  float rkSize = vRock.w, rkDist = length( vRockW - cameraPosition );
  #ifdef ROCK_FAR
  rockNw = inverseTransformDirection( normalize( vNormal ), viewMatrix ); rockOcc = 1.0;
  #else
  vec4 rkS = texture( uRockSurf, rkAt ); vec3 rkO = rkS.rgb * 2.0 - 1.0;
  rockNw = normalize( vRockN0 * rkO.x + vRockN1 * rkO.y + vRockN2 * rkO.z ); rockOcc = rkS.a;
  #endif
  rockRough = vFoot.w < 0.0 ? - vFoot.w : 0.84;
  #ifdef ROCK_GRAIN
  {
    // THE GRAIN, within a few metres: the land's scanned basalt read from the two sides the pixel faces most (as the land
    // reads its own steep rock), its shape laid over the rock's and its hollows darkened
    vec3 dpx = dFdx( vRockW ), dpy = dFdy( vRockW ); float dk = 1.0 - smoothstep( 7.0, 15.0, rkDist );
    if ( dk > 0.0 ) {
      float side = clamp( 0.45 * rkSize, 0.45, 1.5 ); vec3 a = abs( rockNw );
      int ma = a.x > a.y && a.x > a.z ? 0 : a.y > a.z ? 1 : 2;
      float am = ma == 0 ? a.x : ma == 1 ? a.y : a.z, ae = ma == 0 ? max( a.y, a.z ) : ma == 1 ? max( a.x, a.z ) : max( a.x, a.y );
      int me = ma == 0 ? ( a.y >= a.z ? 1 : 2 ) : ma == 1 ? ( a.x >= a.z ? 0 : 2 ) : ( a.x >= a.y ? 0 : 1 );
      vec2 w = clamp( ( vec2( am, ae ) - 0.5773 ) / ( 1.0 - 0.5773 ), 0.0, 1.0 ); w = w * w * w * w; w.x = max( w.x, 1.0e-4 ); w /= w.x + w.y;
      vec4 g1 = textureGrad( uRockGrain, vec3( ( ma == 0 ? vRockW.zy : ma == 1 ? vRockW.xz : vRockW.xy ) / side, 4.0 ), ( ma == 0 ? dpx.zy : ma == 1 ? dpx.xz : dpx.xy ) / side, ( ma == 0 ? dpy.zy : ma == 1 ? dpy.xz : dpy.xy ) / side ), g2 = g1;
      if ( w.y > 0.01 ) g2 = textureGrad( uRockGrain, vec3( ( me == 0 ? vRockW.zy : me == 1 ? vRockW.xz : vRockW.xy ) / side, 4.0 ), ( me == 0 ? dpx.zy : me == 1 ? dpx.xz : dpx.xy ) / side, ( me == 0 ? dpy.zy : me == 1 ? dpy.xz : dpy.xy ) / side );
      vec2 t1 = g1.xy * 2.0 - 1.0, t2 = g2.xy * 2.0 - 1.0;
      vec3 p1 = ma == 0 ? vec3( 0.0, t1.y, t1.x ) : ma == 1 ? vec3( t1.x, 0.0, t1.y ) : vec3( t1.x, t1.y, 0.0 ), p2 = me == 0 ? vec3( 0.0, t2.y, t2.x ) : me == 1 ? vec3( t2.x, 0.0, t2.y ) : vec3( t2.x, t2.y, 0.0 );
      float hollow = g1.a * w.x + g2.a * w.y;
      rockNw = normalize( rockNw + dk * uRockLook.x * 0.75 * ( p1 * w.x + p2 * w.y ) );
      rockOcc *= mix( 1.0, 0.45 + 0.55 * hollow, dk * uRockLook.x ); alb *= mix( 1.0, 0.7 + 0.42 * hollow, dk * uRockLook.x );
    }
  }
  #endif
  // how high over the ground this pixel is (the grid's own triangles, as the land is drawn)
  float rkOver = vRockW.y - isleGround( uIsleHt, uIsleN, ( vRockW.xz - uIsleGrid.xy ) / uIsleGrid.z );
  float rkN = gn( vRockW.xz * 2.3 + vRockW.y * 1.7 ), rkN2 = gn( vRockW.xz * 9.0 + vRockW.y * 7.0 );
  // moss and lichen on what faces up, in the forest's shade and the mist's
  float mossy = max( vFoot.w, 0.0 ) * smoothstep( 0.2, 0.8, rockNw.y + 0.6 * ( rkN - 0.5 ) ) * ( 0.5 + 0.5 * rkN2 );
  alb = mix( alb, uRockMoss * ( 0.7 + 0.6 * rkN2 ), mossy * 0.8 );
  // THE GROUND CLIMBING ITS FOOT (sand blown against it, litter and soil, the shore's rubble): higher on a larger rock, no
  // two stretches of it alike; and pressed into the ground its foot sees less of the sky
  float footH = clamp( 0.1 * rkSize, 0.015, 0.26 ) * ( 0.3 + 1.4 * rkN );
  float foot = 1.0 - smoothstep( 0.0, footH, rkOver + 0.3 * footH * ( rkN2 - 0.5 ) );
  alb = mix( alb, vFoot.rgb * ( 0.8 + 0.4 * rkN2 ), foot * 0.92 );
  rockRough = mix( rockRough, 0.9, max( foot, mossy ) );
  rockOcc *= mix( 0.5, 1.0, smoothstep( 0.0, 0.12 + 0.22 * rkSize, rkOver ) );
  // WET: as high as the swash reaches here (water.js), and as high as the spray wets an open shore; the water in its
  // pores (darker: Lekner and Dorf's film on a dark, porous rock), glossy, most where the swash is on it now
  if ( vRockW.y < 3.6 ) {
    vec4 sm = seaMapAt( vRockW.xz ); float rise, sw = seaSwash( vRockW.xz, sm, rise ), line = seaReach( sm ) + 0.08 * ( rkN - 0.5 );
    float wet = smoothstep( line + 0.1, line - 0.05, vRockW.y );
    wet = max( wet, 0.85 * smoothstep( -420.0, -90.0, sm.x ) * smoothstep( 1.9 + 1.2 * rkN, 0.45, vRockW.y ) * ( 0.7 + 0.3 * rkN2 ) );
    float now = max( step( vRockW.y, sw + 0.01 ), smoothstep( line, line - 0.12, vRockW.y ) );
    alb *= mix( 1.0, 0.5, wet ); alb = mix( alb, alb * alb / max( dot( alb, vec3( 0.333 ) ), 1.0e-4 ), wet * 0.3 );
    rockRough = mix( rockRough, mix( 0.36, 0.1, now ), wet );
  }
  diffuseColor.rgb = alb * uRockLook.y;
}`;
const FRAG_NORMAL = `
#ifndef ROCK_FAR
normal = normalize( ( viewMatrix * vec4( rockNw, 0.0 ) ).xyz );
#endif`;
// the sky's share at its place (the land round it: terrain.js) and its own occlusion, on what the sky and the wrapped sky give
const FRAG_AO = `
float ambientOcclusion = rockOcc * mix( 1.0, texture2D( uRockSky, ( ( vRockW.xz - uIsleGrid.xy ) / uIsleGrid.z + 0.5 ) / uIsleN ).r, uIsleGrid.w );
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif`;

function stoneMaterial({ far = false, grain = false, uniforms, env }) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: env });
  m.defines = { ...(far ? { ROCK_FAR: '' } : {}), ...(grain ? { ROCK_GRAIN: '' } : {}) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_BODY)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rockRough;')
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <aomap_fragment>', FRAG_AO)
      // (three's own last lines written out, so the island's adoption does not put its wading look before them: a body's
      // part under the mean water is drawn as seen through it, and the sea is not drawn over it; a rock is simply stood
      // in the sea, whose own surface closes over what is under it)
      .replace('#include <opaque_fragment>', THREE.ShaderChunk.opaque_fragment);
  };
  m.customProgramCacheKey = () => `stone|${far ? 1 : 0}|${grain ? 1 : 0}`;
  return m;
}

// createStones(scene, { renderer, lite, ground, field, look, env }): the rocks and the beach's things round the eye.
// frame(camera, built) once a frame, before the shadow maps are drawn (`built(x, z)`: where a building stands, no rock is
// drawn); read() is the probes' numbers.
export function createStones(scene, { renderer, lite = false, ground, field, look, env = 1 }) {
  const group = new THREE.Group(); group.name = 'stones'; scene.add(group);
  const U = look.parts.uniforms, W = look.parts.water.uniforms;
  const blank = (srgb) => { const t = new THREE.DataArrayTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const col0 = blank(true), surf0 = blank(false);
  const uniforms = { uRockCol: { value: col0 }, uRockSurf: { value: surf0 }, uRockGrain: U.uIsleSurf, uRockSky: U.uIsleSky, uRockLook: U.uIsleLook, uRockMoss: { value: new THREE.Vector3(...STONES.moss) },
    uSeaMap: W.uSeaMap, uSeaGrid: W.uSeaGrid, uSeaN: W.uSeaN, uSeaClock: W.uSeaClock };
  const mats = { near: stoneMaterial({ grain: !lite, uniforms, env }), far: stoneMaterial({ far: true, uniforms, env }), small: stoneMaterial({ uniforms, env }) };
  const geos = [], state = { models: 'fetching', maps: 'fetching', planted: 0, shown: [0, 0, 0], squares: 0, ms: 0 };
  // ---- each model's each level: an instanced mesh, empty until the models have come
  const sets = {};                                     // name -> [mesh of each level]
  const cfg = (name) => { const C = WRACK.has(name) ? STONES.wrack : STONES.rocks; return lite ? { ...C, ...C.lite } : C; };
  for (const name of MODELS) {
    const C = cfg(name), levels = C.most.length;
    sets[name] = Array.from({ length: levels }, (_, li) => {
      const n = C.most[li]; if (!n) return null;
      const g = new THREE.BufferGeometry(); geos.push(g);
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      for (const [k, size] of [['aRock', 4], ['aFoot', 4]]) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); }
      const last = li === levels - 1, m = new THREE.InstancedMesh(g, WRACK.has(name) ? mats.small : last ? mats.far : mats.near, n);
      m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.name = `${name}-${li}`;
      if (last && !WRACK.has(name)) m.userData.isleTwin = true;        // (the last level casts into no shadow map: a rock a few pixels high)
      group.add(m);
      return m;
    });
  }
  look.adoptAll(group);                                // the island's light and shadows on them from their first drawing
  for (const m of Object.values(mats)) m.stencilWrite = false;        // (and the sea drawn over them where it covers them)
  let models = null, gone = false;
  loadModels().then((got) => {
    if (gone) return;
    for (const name of MODELS) sets[name].forEach((m, li) => {
      if (!m) return;
      const L = got[name].lods[Math.min(li, got[name].lods.length - 1)], g = m.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(L.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(L.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(L.uv, 2, true));
      g.setIndex(new THREE.BufferAttribute(L.idx, 1)); m.userData.tris = L.tris; m.userData.layer = got[name].layer;
    });
    models = got; state.models = 'drawn'; moved = true;
  }, (e) => { state.models = 'failed'; console.error('[island] the rocks could not be fetched', e); });
  const which = lite ? 'rocks-lite' : 'rocks';
  loadArrays(renderer, which, (lite ? ['rocks-colour-lite.ktx2', 'rocks-surface-lite.ktx2'] : ['rocks-colour.ktx2', 'rocks-surface.ktx2']).map((f) => new URL('./rocks/' + f, import.meta.url).href)).then(([c, s]) => {
    if (gone) return;
    for (const t of [c, s]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
    uniforms.uRockCol.value = c; uniforms.uRockSurf.value = s; state.maps = 'drawn'; moved = true;
  }, (e) => { state.maps = 'failed'; console.error('[island] the rocks\' maps could not be fetched', e); });

  // ---- the squares: each one's rocks as numbers (its largest first), planted nearest the eye first
  const kinds = [
    { C: cfg('slab'), list: (x0, z0, x1, z1) => rocksIn(field, ground, x0, z0, x1, z1).filter((r) => r.size < 1.2 || r.kind !== 'talus' || clearOfPalms(ground, r)), squares: new Map(), far: lite ? 0.55 : 1 },
    { C: cfg('coral'), list: (x0, z0, x1, z1) => wrackIn(field, ground, x0, z0, x1, z1), squares: new Map(), far: 0 },
  ];
  const M16 = new Float32Array(16);
  function plant(K, i, j) {
    const T = K.C.tile, rocks = K.list(i * T, j * T, (i + 1) * T, (j + 1) * T).sort((a, b) => b.size - a.size), n = rocks.length;
    const sq = { i, j, n, mat: new Float32Array(n * 16), at: new Float32Array(n * 4), rock: new Float32Array(n * 4), foot: new Float32Array(n * 4), model: new Uint8Array(n) };
    rocks.forEach((r, k) => {
      placeOf(r, M16); sq.mat.set(M16, k * 16);
      sq.at.set([r.x, r.y, r.z, r.size], k * 4); sq.model[k] = MODELS.indexOf(r.model);
      const f = FOOT[r.foot] || FOOT.rock;
      sq.rock.set([0, r.tint, r.rust, r.size], k * 4); sq.foot.set([f[0], f[1], f[2], r.rough !== undefined ? -r.rough : r.moss], k * 4);
    });
    K.squares.set(i + ',' + j, sq); state.planted += n; state.squares += 1;
  }
  // the squares within reach not yet planted, nearest first; as many as the frame's budget allows
  function plantNear(ex, ez) {
    const t0 = performance.now(); let did = false;
    for (const K of kinds) {
      const T = K.C.tile, R = K.C.reach, i0 = Math.floor((ex - R) / T), i1 = Math.floor((ex + R) / T), j0 = Math.floor((ez - R) / T), j1 = Math.floor((ez + R) / T), want = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (K.squares.has(i + ',' + j)) continue; const d = Math.hypot((i + 0.5) * T - ex, (j + 0.5) * T - ez); if (d < R + T * 0.71) want.push([d, i, j]); }
      want.sort((a, b) => a[0] - b[0]);
      for (const [, i, j] of want) { if (performance.now() - t0 > STONES.budget) return true; plant(K, i, j); did = true; }
      // (a square far behind the eye is let go)
      if (K.squares.size > 1.6 * (i1 - i0 + 1) * (j1 - j0 + 1)) for (const [key, sq] of K.squares) if (Math.hypot((sq.i + 0.5) * T - ex, (sq.j + 0.5) * T - ez) > 1.5 * R + T) { K.squares.delete(key); state.planted -= sq.n; state.squares -= 1; }
    }
    return did;
  }
  // ---- which rock is drawn at which level, from where the eye is
  const picks = {};                                    // name -> [each level's [square, k, d] list]
  for (const name of MODELS) picks[name] = sets[name].map(() => []);
  function choose(ex, ey, ez, built) {
    for (const name of MODELS) for (const l of picks[name]) l.length = 0;
    for (const K of kinds) {
      const T = K.C.tile, wrack = K.far === 0, order = [];
      for (const sq of K.squares.values()) { if (!sq.n) continue; const dx = Math.max(sq.i * T - ex, 0, ex - (sq.i + 1) * T), dz = Math.max(sq.j * T - ez, 0, ez - (sq.j + 1) * T); order.push([Math.hypot(dx, dz), sq]); }
      order.sort((a, b) => a[0] - b[0]);
      for (const [dmin, sq] of order) {
        for (let k = 0; k < sq.n; k++) {
          const s = sq.at[4 * k + 3];
          if (!wrack && dmin > K.far * farOf(s)) break;                    // (the rest of the square is smaller still)
          const x = sq.at[4 * k], z = sq.at[4 * k + 2], d = Math.hypot(x - ex, sq.at[4 * k + 1] - ey, z - ez), P = picks[MODELS[sq.model[k]]];
          let li;
          if (wrack) { li = d < 7 + 22 * s ? 0 : d < Math.min(110, 24 + 60 * s) ? 1 : -1; if (li === 0 && !sets[MODELS[sq.model[k]]][0]) li = 1; }
          else { li = d < STONES.near[0] * s + STONES.near[1] ? 0 : d < STONES.mid[0] * s + STONES.mid[1] ? 1 : d < K.far * farOf(s) ? 2 : -1; if (li === 0 && !sets[MODELS[sq.model[k]]][0]) li = 1; }
          if (li < 0 || (li < 2 && built && built(x, z))) continue;
          P[li].push(sq, k, d);
        }
      }
    }
    state.shown = [0, 0, 0];
    for (const name of MODELS) sets[name].forEach((m, li) => {
      if (!m) return;
      const P = picks[name][li], cap = m.instanceMatrix.count, far = li === 2;
      // (nearest first, across the ground, where it casts into the shadow maps: terrain.js draws only those its maps can
      // reach; the squares come nearest first, so what a level cannot hold is its furthest)
      const idx = Array.from({ length: P.length / 3 }, (_, q) => q), hd = far ? null : idx.map((q) => Math.hypot(P[3 * q].at[4 * P[3 * q + 1]] - ex, P[3 * q].at[4 * P[3 * q + 1] + 2] - ez));
      if (!far) idx.sort((a, b) => hd[a] - hd[b]);
      if (idx.length > cap) idx.length = cap;
      const im = m.instanceMatrix.array, ar = m.geometry.attributes.aRock.array, af = m.geometry.attributes.aFoot.array, dist = far ? null : new Float32Array(idx.length), layer = m.userData.layer ?? 0;
      idx.forEach((q, o) => {
        const sq = P[3 * q], k = P[3 * q + 1];
        im.set(sq.mat.subarray(k * 16, k * 16 + 16), o * 16); ar.set(sq.rock.subarray(k * 4, k * 4 + 4), o * 4); ar[o * 4] = layer; af.set(sq.foot.subarray(k * 4, k * 4 + 4), o * 4);
        if (dist) dist[o] = hd[q];
      });
      m.count = models && state.maps === 'drawn' ? idx.length : 0; state.shown[li] += m.count;
      m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aRock.needsUpdate = true; m.geometry.attributes.aFoot.needsUpdate = true;
      if (dist) m.userData.isleNear = { x: ex, z: ez, d: dist, tall: 6 };
    });
  }
  let at = null, moved = true, sites = '', tick = 0, coming = false;
  return {
    group, sets,
    frame(camera, built = null, now = '') {
      const e = camera.position, t0 = performance.now();
      // (while squares are still coming, the levels are worked out every sixth frame, and once more when the last is in)
      if (plantNear(e.x, e.z)) { coming = true; if (tick++ % 6 === 0) moved = true; } else if (coming) { coming = false; tick = 0; moved = true; }
      if (now !== sites) { sites = now; moved = true; }
      if (moved || !at || Math.hypot(e.x - at[0], e.y - at[1], e.z - at[2]) > STONES.again) { choose(e.x, e.y, e.z, built); at = [e.x, e.y, e.z]; moved = false; }
      state.ms += (performance.now() - t0 - state.ms) * 0.05;
    },
    // a probe's numbers: what has come, how many rocks are planted, how many are drawn at each level, the triangles of one frame's
    read: () => ({ ...state, ms: +state.ms.toFixed(3), triangles: MODELS.reduce((a, name) => a + sets[name].reduce((b, m) => b + (m ? m.count * (m.userData.tris || 0) : 0), 0), 0),
      drawn: Object.fromEntries(MODELS.map((name) => [name, sets[name].map((m) => (m ? m.count : 0))])) }),
    dispose() { gone = true; scene.remove(group); for (const g of geos) g.dispose(); for (const m of Object.values(mats)) m.dispose(); col0.dispose(); surf0.dispose(); },
  };
}
