// terrain.js — LORD HOWE ISLAND'S GROUND, MADE OF WHAT IT IS MADE OF (three.js), and the key light's shadows on it and
// on everything that stands on it. island.js draws the land's triangles with this material; the shadows reach every
// lit thing in the island's scene (adoptAll, below).
//
// THE GROUND. Seven scanned surfaces (Poly Haven, CC0; scripts/island/ground-textures.py grades each to what the
// island's own ground reflects and packs it): coral sand, the lowland grass, the palm forest's leaf litter, weathered
// rock, the cliffs' fractured basalt, the shore's pebbles and rubble, and the cliffs' large-scale face (outcrops,
// ledges, the green on them). Which one a pixel is made of follows life.js's cover(), the rule the palms grow by
// (beach under 2.9 m, rock past a slope of 0.8 and cliff past 0.95, the mist forest's moss over 640 m, grass on the
// low flats where its noise allows, forest the rest), with its noise made once on the GPU from the same hash, so a
// palm stands on forest floor. The two a pixel is most made of are read and blended by their own heights (sand fills
// between pebbles, rock stands out of grass: no smooth fade). Each surface is read at its own scale near the eye (a
// 2 m scan over 2 m) and five to eight times larger further off, so its tiles do not show; the cliffs and steep rock
// are read from the two sides they face most (a vertical face is not a smear of the ground's texture), and from a few
// hundred metres off the large-scale face takes over. The forest beyond the palms (life.js draws them only within
// PALM.near of the body) is a canopy of crowns lit by the Sun as domes. The ground at the water is wet: darker,
// smoother, glossy where the swash reaches; the lagoon's floor under the sea is the same sand.
//
// THE LIGHT. The true sky's (sky.js) or the present one's: the key light, the sky's fill and the wrapped sky, through
// three's own lighting, so the air between the eye and the land (sky.js adopt) and the eye's curve go on as before.
// What is new:
//   · THE LAND'S OWN SHADOW: for every point of the grid (16 m), how high above the ground the land toward the key
//     light cuts off its disc's lower limb and its upper limb (a march over the same triangles the land is drawn with,
//     on the GPU, made again a band at a time as the light moves). A point is lit by the share of the disc above both
//     lines, so a mountain's shadow has the penumbra the Sun's half degree gives it at that distance (9 m a kilometre
//     off), and anything at any height (a body, a palm's crown, a ship) is in or out of it by its own height.
//   · THE SKY'S SHARE: how much of the sky each point of the grid sees past the land round it (sixteen ways, out to a
//     kilometre, cosine-weighted about its own slope: the GTAO integral over a heightfield), made once; with each
//     scan's own occlusion it darkens what the sky and the wrapped sky give, not the Sun.
//   · CASCADED SHADOW MAPS for the things on the land (the palms, the body, buildings, ships, bots): three depth maps
//     round the eye (to 15 m, 60 m and 220 m), each a sphere about its slice of the view so it does not swim as the
//     eye turns, stepped by whole texels as the eye moves, read with the GPU's own comparison (four taps, each a 2 x 2
//     filter: a soft edge for a quarter of what three's own sixteen-tap filter costs). Only the things on the land are
//     drawn into them (a layer of their own); the land casts into none (its shadow is the line above, sharp to the
//     metre at golden hour without the acne a map of a 16 m grid would draw).
//
// Where this machine cannot draw into half floats (sky.js asks the same), the land's own shadow and sky's share are
// left out. A plainer picture (`lite`: fine.js's plain, or a phone) reads the 512 maps at one scale, from above only,
// with two shadow maps.
import * as THREE from 'three';
import { PALM } from './life.js';
import { SEA, SEA_OPTICS_GLSL } from './sea.js';
import { SEA_WAVES_GLSL, SEA_SURFACE_GLSL } from './water.js';

const num = (x) => { const t = Number(x).toPrecision(8); return /[.e]/.test(t) ? t : t + '.0'; };

// ---- the surfaces (ground-textures.py's LAYERS; ground.json says what each was graded from)
export const LAYERS = ['sand', 'grass', 'litter', 'rock', 'cliff', 'shore', 'face'];
// metres a texture's width spans: near the eye (the scan's own size; the sand's 30 m scan is read at an eighth, so its
// grains and small ripples are under the feet), and further off
export const FINE = [3.75, 2.0, 2.3, 1.5, 2.0, 2.17, 50];
export const COARSE = [30, 13, 15, 10, 13, 14, 50];
// each surface's mean colour (linear, as graded): drawn before the maps have come
export const MEAN = [[0.58, 0.53, 0.43], [0.075, 0.13, 0.035], [0.10, 0.075, 0.045], [0.135, 0.125, 0.112], [0.098, 0.088, 0.077], [0.16, 0.15, 0.135], [0.1349, 0.0956, 0.0409]];
// how dark each goes wet (Lekner and Dorf's water film: a porous surface loses most) and how much its height counts
// when two meet (rock stands out of what is round it; sand fills)
const WET = [0.45, 0.7, 0.7, 0.62, 0.62, 0.55, 0.62];
const RISE = [0.5, 0.75, 0.7, 1.15, 1.25, 1.0, 1.25];
// the roughest each is at least (a scan's own roughness map is an artist's: dry coral sand at its 0.61 mirrors the blue sky
// at a slant and reads grey; dry sand, litter and grass scatter nearly all of it)
const FLOOR = [0.88, 0.8, 0.82, 0.62, 0.62, 0.7, 0.66];
// the shadow maps round the eye: where each ends (m of the view's depth), its texels, how far behind its slice along
// the light a thing may stand and still cast into it (a 14 m palm with the Sun 4 degrees up: 200 m), and the layer
// the things that cast are put on
export const CASCADES = { far: [15, 60, 220], size: [2048, 1536, 1024], lite: { far: [20, 110], size: [1024, 1024] }, margin: 260, layer: 2 };
// the land's own shadow: how far toward the light it looks (m), the step near the point and how the steps grow
export const LINES = { far: 16000, step: 8, grow: 0.012, steps: 420, bands: 8, moved: 0.06 };
export const SKYSHARE = { ways: 16, steps: 18, first: 12, grow: 1.32 };
// the ground's control texture: texels to each 16 m cell (life.js's noise and the slow variations, made once)
export const CONTROL = { per: 2, lite: 1 };

// ---- the maps, fetched once for the page (both arrays together, transcoded off the page's thread) and kept: going to
// the void and back does not fetch them again
const MAP_FILES = { full: ['ground-colour.ktx2', 'ground-surface.ktx2'], lite: ['ground-colour-lite.ktx2', 'ground-surface-lite.ktx2'] };
const fetched = new Map();
function loadMaps(renderer, which) {
  if (fetched.has(which)) return fetched.get(which);
  const p = (async () => {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    // three's loader, its transcoding worker loaded from a file of the site's own (basis-worker.js says why: a worker made
    // from a Blob keeps the page's content policy, and the transcoder's bindings evaluate strings), the transcoder's
    // binary fetched once and handed to each worker as three's own init does
    class IsleLoader extends KTX2Loader {
      init() {
        if (!this.transcoderPending) {
          const wasm = new URL('../../vendor/three@0.187.0/examples/jsm/libs/basis/basis_transcoder.wasm', import.meta.url).href, file = new URL('./basis-worker.js', import.meta.url).href;
          this.transcoderPending = fetch(wasm).then((r) => { if (!r.ok) throw new Error(`the transcoder did not arrive (${r.status})`); return r.arrayBuffer(); }).then((bin) => {
            this.transcoderBinary = bin;
            this.workerPool.setWorkerCreator(() => { const w = new Worker(file), b = this.transcoderBinary.slice(0); w.postMessage({ type: 'init', config: this.workerConfig, transcoderBinary: b }, [b]); return w; });
          });
        }
        return this.transcoderPending;
      }
    }
    const loader = new IsleLoader().detectSupport(renderer);
    try {
      const base = new URL('./ground/', import.meta.url).href;
      const maps = await Promise.all(MAP_FILES[which].map((f) => loader.loadAsync(base + f)));
      const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      for (const t of maps) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; }
      return maps;
    } finally { loader.dispose(); }
  })();
  fetched.set(which, p);
  p.catch(() => fetched.delete(which));              // a fetch that failed may be tried again the next time
  return p;
}
// until they come: one texel a surface, its mean colour, flat, of middling height, rough, unoccluded
function standIns() {
  const enc = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  const c = new Uint8Array(4 * LAYERS.length), s = new Uint8Array(4 * LAYERS.length);
  MEAN.forEach((m, i) => { c.set([enc(m[0]), enc(m[1]), enc(m[2]), 128], 4 * i); s.set([128, 128, 220, 255], 4 * i); });
  const col = new THREE.DataArrayTexture(c, 1, 1, LAYERS.length), surf = new THREE.DataArrayTexture(s, 1, 1, LAYERS.length);
  col.colorSpace = THREE.SRGBColorSpace;
  for (const t of [col, surf]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; }
  return [col, surf];
}

// ---- what every lit thing in the island's scene shares (one set of uniforms, by reference: a body's materials go with
// it from place to place, and in the void uIsleOn is 0)
const SHARED = {
  uIsleOn: { value: 0 },
  uIsleV2W: { value: new THREE.Matrix4() },                 // the eye's matrixWorld: a pixel's view-space place to the world
  uIsleHt: { value: null },                                 // the grid's heights (R32F), read texel by texel
  uIsleLines: { value: null },                              // the land's shadow lines over each grid point (RG16F)
  uIsleGrid: { value: new THREE.Vector4(0, 0, 16, 0) },     // x0, z0, spacing, and 1 where the lines are drawn
  uIsleN: { value: new THREE.Vector2(1, 1) },               // the grid's width and height (points)
  uIsleSplit: { value: new THREE.Vector4(15, 60, 220, 0) }, // where each shadow map ends (distance from the eye, m), and how many there are
  uIsleShade0: { value: null }, uIsleShade1: { value: null }, uIsleShade2: { value: null },     // the maps (depth, compared)
  uIsleShadeM: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },     // world to each map
  uIsleShadeO: { value: new THREE.Vector3() },              // each map's offset along the normal (m: a texel and a half)
  uIsleShadeT: { value: new THREE.Vector3() },              // each map's texel (in its own 0..1)
  uIsleShadeZ: { value: new THREE.Vector3() },              // each map's depth bias (2 cm, in its own depth)
  uSeaE: { value: new THREE.Vector3(1, 1, 1) },            // the light falling on level water (the picture's units): water.js, island.js and sky.js set it
  uSeaLight: { value: new THREE.Vector4(0.9, 1, 0, 0) },   // its cosine under the water; the glitter's scale
};
// a point on the grid's triangles (ground.js onGrid: (00, 10, 01) and (10, 11, 01)), from its heights texel by texel
const GRID_GLSL = `
float isleGround( highp sampler2D hts, vec2 n, vec2 g ) {
  vec2 c = clamp( floor( g ), vec2( 0.0 ), n - 2.0 ), f = g - c; ivec2 i = ivec2( c );
  float h00 = texelFetch( hts, i, 0 ).r, h10 = texelFetch( hts, i + ivec2( 1, 0 ), 0 ).r, h01 = texelFetch( hts, i + ivec2( 0, 1 ), 0 ).r, h11 = texelFetch( hts, i + ivec2( 1, 1 ), 0 ).r;
  return f.x + f.y <= 1.0 ? h00 + ( h10 - h00 ) * f.x + ( h01 - h00 ) * f.y : h11 + ( h01 - h11 ) * ( 1.0 - f.x ) + ( h10 - h11 ) * ( 1.0 - f.y );
}`;
// how much of the key light's disc the land leaves in sight at a world point, and the shadow maps' word on it
const LIGHT_PARS = `
uniform float uIsleOn; uniform mat4 uIsleV2W; uniform highp sampler2D uIsleHt; uniform sampler2D uIsleLines; uniform vec4 uIsleGrid; uniform vec2 uIsleN; uniform vec4 uIsleSplit;
uniform highp sampler2DShadow uIsleShade0; uniform highp sampler2DShadow uIsleShade1; uniform highp sampler2DShadow uIsleShade2;
uniform mat4 uIsleShadeM[ 3 ]; uniform vec3 uIsleShadeO; uniform vec3 uIsleShadeT; uniform vec3 uIsleShadeZ;
${GRID_GLSL}
// the share of the key light's disc above the land's two lines at w (over: its height over the ground there, when known)
float isleLand( vec3 w, float over ) {
  if ( uIsleGrid.w < 0.5 ) return 1.0;
  vec2 g = ( w.xz - uIsleGrid.xy ) / uIsleGrid.z;
  if ( any( lessThan( g, vec2( 0.0 ) ) ) || any( greaterThan( g, uIsleN - 1.0 ) ) ) return 1.0;
  vec2 v = texture2D( uIsleLines, ( g + 0.5 ) / uIsleN ).rg;               // the lower limb's line, the upper limb's (m over the ground)
  float y = over > -1.0e8 ? over : w.y - isleGround( uIsleHt, uIsleN, g );
  float t = clamp( ( y - v.y ) / max( v.x - v.y, 1.0e-3 ), 0.0, 1.0 );
  return t * t * ( 3.0 - 2.0 * t );                                          // a disc's area above a line, near enough
}
// one map: four of the GPU's own 2 x 2 comparisons half a texel apart (a 3 x 3 tent); out of the map, lit
float isleTap( highp sampler2DShadow s, mat4 m, vec3 w, float texel, float bias ) {
  vec3 c = ( m * vec4( w, 1.0 ) ).xyz * 0.5 + 0.5;
  if ( any( lessThan( c, vec3( 0.0 ) ) ) || any( greaterThan( c, vec3( 1.0 ) ) ) ) return 1.0;
  float z = c.z - bias, o = 0.5 * texel;
  if ( texel < 0.0 ) return texture( s, vec3( c.xy, z ) );                   // the further maps: one 2 x 2 comparison
  return 0.25 * ( texture( s, vec3( c.xy + vec2( -o, -o ), z ) ) + texture( s, vec3( c.xy + vec2( o, -o ), z ) ) + texture( s, vec3( c.xy + vec2( -o, o ), z ) ) + texture( s, vec3( c.xy + vec2( o, o ), z ) ) );
}
// the map this pixel's distance falls in (its last eighth blended into the next, past the last into the light)
float isleMaps( vec3 w, vec3 n, float d ) {
  float k;
  if ( uIsleSplit.w < 0.5 ) return 1.0;
  if ( d < uIsleSplit.x ) {
    float a = isleTap( uIsleShade0, uIsleShadeM[ 0 ], w + n * uIsleShadeO.x, uIsleShadeT.x, uIsleShadeZ.x ); k = smoothstep( uIsleSplit.x * 0.88, uIsleSplit.x, d );
    return k > 0.0 ? mix( a, isleTap( uIsleShade1, uIsleShadeM[ 1 ], w + n * uIsleShadeO.y, uIsleShadeT.y, uIsleShadeZ.y ), k ) : a;
  }
  if ( d < uIsleSplit.y ) {
    float a = isleTap( uIsleShade1, uIsleShadeM[ 1 ], w + n * uIsleShadeO.y, uIsleShadeT.y, uIsleShadeZ.y ); k = smoothstep( uIsleSplit.y * 0.88, uIsleSplit.y, d );
    if ( k <= 0.0 ) return a;
    return mix( a, uIsleSplit.w > 2.5 ? isleTap( uIsleShade2, uIsleShadeM[ 2 ], w + n * uIsleShadeO.z, uIsleShadeT.z, uIsleShadeZ.z ) : 1.0, k );
  }
  if ( d < uIsleSplit.z && uIsleSplit.w > 2.5 ) {
    float a = isleTap( uIsleShade2, uIsleShadeM[ 2 ], w + n * uIsleShadeO.z, uIsleShadeT.z, uIsleShadeZ.z ); k = smoothstep( uIsleSplit.z * 0.88, uIsleSplit.z, d );
    return mix( a, 1.0, k );
  }
  return 1.0;
}
float isleKeyW( vec3 w, vec3 nw, float over, float d ) {
  if ( uIsleOn < 0.5 ) return 1.0;
  float s = isleLand( w, over );
  if ( s > 0.0 ) s *= isleMaps( w, nw, d );                                  // by distance: the outer maps are spheres round the eye
  return s;
}
float isleKey( vec3 viewPos, vec3 viewN, float over ) {
  if ( uIsleOn < 0.5 || ! receiveShadow ) return 1.0;
  return isleKeyW( ( uIsleV2W * vec4( viewPos, 1.0 ) ).xyz, normalize( mat3( uIsleV2W ) * viewN ), over, length( viewPos ) );
}`;
// three's own directional loop (r160), and the island's: its key light (the first directional light) shadowed
const DIR_LOOP = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n\tDirectionalLight directionalLight;\n\t#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n\tDirectionalLightShadow directionalLightShadow;\n\t#endif\n\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {\n\t\tdirectionalLight = directionalLights[ i ];\n\t\tgetDirectionalLightInfo( directionalLight, directLight );\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )\n\t\tdirectionalLightShadow = directionalLightShadows[ i ];\n\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}\n\t#pragma unroll_loop_end\n#endif\n';
const ISLE_LOOP = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#ifdef ISLE_WATER
	float isleShade = isleKeyW( isleW, isleNw, 0.0, length( isleW - cameraPosition ) ) * seaCaustic;
	#else
	float isleShade = isleKey( geometryPosition, geometryNormal, ISLE_OVER );
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if UNROLLED_LOOP_INDEX == 0
		directLight.color *= isleShade;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
`;
const ADOPTED = new WeakSet();
let owner = null;                       // the island whose numbers SHARED holds (a plainer island is made before the last is let go)
// A shadow sampler must always have a depth texture behind it: three r160's own stand-in for an empty one is never
// uploaded (its version stays 0), so an empty sampler2DShadow is bound to nothing and every draw that declares it fails
// ("mismatch between texture format and sampler type"): on the lighter path's third map, and, after the island, for
// every adopted thing in the void (the body). This one is one texel, cleared once in each renderer, and never let go.
const SPARE = { target: null, ready: new WeakSet() };
function spareDepth(renderer) {
  if (!SPARE.target) {
    const d = new THREE.DepthTexture(1, 1); d.compareFunction = THREE.LessEqualCompare;
    SPARE.target = new THREE.WebGLRenderTarget(1, 1, { depthTexture: d, depthBuffer: true, stencilBuffer: false, format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false });
  }
  if (!SPARE.ready.has(renderer)) { const was = renderer.getRenderTarget(); renderer.setRenderTarget(SPARE.target); renderer.clear(false, true, false); renderer.setRenderTarget(was); SPARE.ready.add(renderer); }
  return SPARE.target.depthTexture;
}

// A lit material is made to take the island's shadows: its key light is shadowed by the land's lines and the shadow
// maps. Its own onBeforeCompile still runs first; the sky's adoption (sky.js) may wrap this one or be wrapped by it.
function adopt(material) {
  if (!material || !material.isMaterial || ADOPTED.has(material)) return;
  if (!(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshToonMaterial)) return;
  ADOPTED.add(material);
  const loop = THREE.ShaderChunk.lights_fragment_begin.replace(DIR_LOOP, ISLE_LOOP);
  if (loop === THREE.ShaderChunk.lights_fragment_begin) { console.warn('[island] three.js\'s light loop is not the one this was written for: no shadows'); return; }
  const before = material.onBeforeCompile, keyOf = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    let fs = shader.fragmentShader;
    if (!fs.includes('#include <lights_fragment_begin>') || !fs.includes('#include <shadowmap_pars_fragment>')) return;
    Object.assign(shader.uniforms, SHARED);
    fs = fs.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + LIGHT_PARS + OBJ_PARS);
    if (fs.includes('#include <opaque_fragment>')) fs = fs.replace('#include <opaque_fragment>', OBJ_UNDER + '#include <opaque_fragment>');
    shader.fragmentShader = '#define ISLE_OVER -1.0e9\n' + fs.replace('#include <lights_fragment_begin>', loop);
  };
  material.customProgramCacheKey = () => keyOf() + '|isle';
  material.needsUpdate = true;
}

// what stands in the water (a body wading, a ship's hull): its part under the mean water seen through it
const OBJ_PARS = `
uniform vec3 uSeaE; uniform vec4 uSeaLight;
${SEA_OPTICS_GLSL}`;
const OBJ_UNDER = `
if ( uIsleOn > 0.5 ) {
  vec3 ow = ( uIsleV2W * vec4( geometryPosition, 1.0 ) ).xyz;
  if ( ow.y < -0.01 ) {
    vec3 v = normalize( cameraPosition - ow ); float F = seaFresnel( v.y );
    outgoingLight = seaOut( uSeaE, outgoingLight, -ow.y, uSeaLight.x, max( seaUnder( v.y ), 0.2 ) ) * ( 1.0 - F ) + F * uSeaE * ${num(0.25 / Math.PI)};
  }
}
`;

// ---- the passes, drawn on the GPU into the island's own textures
const QUAD_VERT = 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
// the land's two shadow lines over each grid point: the highest of (ground - distance x tan) along the way to the
// light, for its disc's lower limb and its upper limb, as metres over the ground there
const LINES_FRAG = `
uniform highp sampler2D uH; uniform vec2 uN; uniform float uS; uniform vec2 uDir; uniform vec2 uTan; uniform float uTop;
${GRID_GLSL}
void main() {
  vec2 g0 = floor( gl_FragCoord.xy );
  float h0 = texelFetch( uH, ivec2( g0 ), 0 ).r, lo = -3.0e4, up = -3.0e4, t = ${LINES.step.toFixed(1)};
  if ( length( uDir ) > 1.0e-4 ) {
    for ( int k = 0; k < ${LINES.steps}; k ++ ) {
      vec2 g = g0 + uDir * ( t / uS );
      if ( any( lessThan( g, vec2( 0.0 ) ) ) || any( greaterThan( g, uN - 1.0 ) ) || t > ${LINES.far.toFixed(1)} ) break;
      float h = isleGround( uH, uN, g );
      lo = max( lo, h - t * uTan.x ); up = max( up, h - t * uTan.y );
      if ( uTop - t * uTan.x < lo && uTop - t * uTan.y < up ) break;        // nothing further can rise over either line
      t += max( ${LINES.step.toFixed(1)}, t * ${LINES.grow} );
    }
  }
  gl_FragColor = vec4( lo - h0, up - h0, 0.0, 1.0 );
}`;
// how much of the sky each grid point sees past the land round it: for each of the half-turns, the highest horizon
// each way, and the cosine-weighted visible arc about the point's own normal between them (Jimenez et al. 2016, GTAO's
// slice integral, about the vertical)
const SKYSHARE_FRAG = `
uniform sampler2D uHf; uniform highp sampler2D uH; uniform vec2 uN; uniform float uS;
float hAt( vec2 g ) { return texture2D( uHf, ( g + 0.5 ) / uN ).r; }
void main() {
  ivec2 i0 = ivec2( gl_FragCoord.xy ); vec2 g0 = vec2( i0 );
  float h0 = texelFetch( uH, i0, 0 ).r;
  ivec2 m = ivec2( uN ) - 1;
  float hx = ( texelFetch( uH, min( i0 + ivec2( 1, 0 ), m ), 0 ).r - texelFetch( uH, max( i0 - ivec2( 1, 0 ), ivec2( 0 ) ), 0 ).r ) / ( 2.0 * uS );
  float hz = ( texelFetch( uH, min( i0 + ivec2( 0, 1 ), m ), 0 ).r - texelFetch( uH, max( i0 - ivec2( 0, 1 ), ivec2( 0 ) ), 0 ).r ) / ( 2.0 * uS );
  vec3 n = normalize( vec3( -hx, 1.0, -hz ) );
  float sum = 0.0;
  for ( int a = 0; a < ${SKYSHARE.ways / 2}; a ++ ) {
    float phi = ( float( a ) + 0.5 ) * ${(Math.PI / (SKYSHARE.ways / 2)).toFixed(6)};
    vec2 d = vec2( cos( phi ), sin( phi ) );
    float e1 = -1.0e3, e2 = -1.0e3, t = ${SKYSHARE.first.toFixed(1)};
    for ( int k = 0; k < ${SKYSHARE.steps}; k ++ ) {
      e1 = max( e1, ( hAt( g0 + d * t / uS ) - h0 ) / t ); e2 = max( e2, ( hAt( g0 - d * t / uS ) - h0 ) / t );
      t *= ${SKYSHARE.grow};
    }
    // in the slice: angles from straight up, + toward d; the horizons, then held to the normal's own hemisphere
    vec2 np = vec2( dot( n.xz, d ), n.y ); float len = length( np ), gam = atan( np.x, np.y );
    float h2 = min( 1.5707963 - atan( e1 ), gam + 1.5707963 ), h1 = max( -( 1.5707963 - atan( e2 ) ), gam - 1.5707963 );
    sum += len * 0.25 * ( -cos( 2.0 * h1 - gam ) + cos( gam ) + 2.0 * h1 * sin( gam ) + -cos( 2.0 * h2 - gam ) + cos( gam ) + 2.0 * h2 * sin( gam ) );
  }
  gl_FragColor = vec4( clamp( sum / ${(SKYSHARE.ways / 2).toFixed(1)}, 0.0, 1.0 ), 0.0, 0.0, 1.0 );
}`;
// life.js's hash and vnoise, bit for bit (Math.imul is a 32-bit multiply; >>> an unsigned shift), and a cheaper noise
const NOISE_GLSL = `
float lhHash( int i, int j ) { uint h = uint( i ) * 374761393u + uint( j ) * 668265263u; h = ( h ^ ( h >> 13u ) ) * 1274126177u; h ^= h >> 16u; return float( h ) * ( 1.0 / 4294967296.0 ); }
float lhNoise( vec2 p ) { vec2 c = floor( p ), f = p - c, u = f * f * ( 3.0 - 2.0 * f ); int a = int( c.x ), b = int( c.y );
  return mix( mix( lhHash( a, b ), lhHash( a + 1, b ), u.x ), mix( lhHash( a, b + 1 ), lhHash( a + 1, b + 1 ), u.x ), u.y ); }
float gh( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
vec2 gh2( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.xx + q.yz ) * q.zy ); }
float gn( vec2 p ) { vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f ); return mix( mix( gh( i ), gh( i + vec2( 1, 0 ) ), u.x ), mix( gh( i + vec2( 0, 1 ) ), gh( i + vec2( 1, 1 ) ), u.x ), u.y ); }`;
// THE CONTROL TEXTURE, made once: at each of its texels (CONTROL.per to a 16 m cell), life.js's own cover noise (the
// grass's), a slow variation of the colour, the lagoon's patches of rubble, and a jitter for the beach's edge
const CONTROL_FRAG = `
uniform vec4 uGrid; uniform float uPer;
${NOISE_GLSL}
void main() {
  vec2 xz = uGrid.xy + ( gl_FragCoord.xy - 0.5 ) * uGrid.z / uPer;
  gl_FragColor = vec4( lhNoise( xz / 70.0 ) * 0.7 + lhNoise( xz / 17.0 ) * 0.3, gn( xz * 0.011 ) * 0.6 + gn( xz * 0.037 + 5.0 ) * 0.4, gn( xz * 0.06 + 3.0 ), gn( xz * 0.09 ) );
}`;

// ---- the land's own drawing (island.js's landMat and flatMat): the vertex hands on where it is and its own normal
const LAND_VERT_PARS = 'varying vec3 vW;\nvarying vec3 vWN;\n#ifdef ISLE_FLAT\nattribute float aEarth;\nvarying float vEarth;\n#endif';
const LAND_NORMAL = 'vWN = normalize( mat3( modelMatrix ) * objectNormal );';
const LAND_PLACE = 'vW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#ifdef ISLE_FLAT\nvEarth = aEarth;\n#endif';

function landFrag({ lite }) {
  const FACE = LAYERS.indexOf('face'), CLIFF = LAYERS.indexOf('cliff'), ROCK = LAYERS.indexOf('rock');
  return {
    pars: `
varying vec3 vW; varying vec3 vWN;
vec3 isleW;                        // where the splat reads: the land's own place, or the floor the sea's refracted line meets
#ifdef ISLE_FLAT
varying float vEarth;
#endif
uniform mediump sampler2DArray uIsleCol; uniform mediump sampler2DArray uIsleSurf; uniform sampler2D uIsleSky; uniform sampler2D uIsleCtl;
uniform vec4 uIsleLook;      // the maps' weight (0 until they come, then 1), the present light's raise of the colours, the control's texels to a cell
uniform vec3 uIsleBody;      // where the body is: the palms stand within PALM.near of it
${NOISE_GLSL}
uniform vec4 uIsleLayer[ 7 ];    // each surface's fine and coarse side (m), how dark it goes wet, how much its height counts
uniform vec3 uIsleMean[ 7 ];     // and its mean colour
uniform float uIsleFloor[ 7 ];   // and the roughest it is at least (dry)
bool isleFar;                      // past 140 m (set by the splat before any read)
float isleFaceMix;                 // a slow noise over the island (the canopy's colour by region)
vec2 isleWarp;                     // how far the large-scale face is drawn aside here (m)
vec3 isleTan( vec4 s ) { vec2 xy = s.xy * 2.0 - 1.0; return vec3( xy, sqrt( max( 0.0, 1.0 - dot( xy, xy ) ) ) ); }
// ONE READ of a surface at one scale, along one axis (x: by z and y; y: from above, by x and z; z: by x and y), its
// coordinates turned by R (the large-scale face is read twice, turned, so its tiles never line up): its colour and
// height, its finish, and its normal in the world (whiteout blend onto the land's own normal). Past 140 m a close
// scan's shape and finish are under a pixel: its mean finish and the land's own normal (half the reads).
void isleRead( int axis, float layer, float side, mat2 R, vec3 dpx, vec3 dpy, vec3 n0, out vec4 col, out vec4 srf, out vec3 nw ) {
  vec2 uv = axis == 0 ? isleW.zy : axis == 1 ? isleW.xz : isleW.xy, gx = axis == 0 ? dpx.zy : axis == 1 ? dpx.xz : dpx.xy, gy = axis == 0 ? dpy.zy : axis == 1 ? dpy.xz : dpy.xy;
  if ( side > 9.0 ) uv += isleWarp;                                          // every large-scale read, drawn aside (no grid from afar)
  vec3 at = vec3( R * uv / side, layer ); gx = R * gx / side; gy = R * gy / side;
  col = textureGrad( uIsleCol, at, gx, gy );
  if ( isleFar && side < 40.0 ) { srf = vec4( 0.5, 0.5, 0.8, 0.9 ); nw = n0; return; }
  srf = textureGrad( uIsleSurf, at, gx, gy );
  vec3 t = isleTan( srf ); t.xy = t.xy * R;                                   // back to the world's own axes
  nw = axis == 0 ? vec3( t.z * n0.x, t.y + n0.y, t.x + n0.z ) : axis == 1 ? vec3( t.x + n0.x, t.z * n0.y, t.y + n0.z ) : vec3( t.x + n0.x, t.y + n0.y, t.z * n0.z );
}
// from above (the level ground), or from the two sides the land faces most (after Quilez's biplanar mapping: a cliff is
// read from the side it faces; a third read would add little), each blended by how much it faces that way. From above
// it is read by x and z either way, so nothing turns where the ground steepens. (Each side is chosen by selects: indexing
// a vector at run time puts it in memory on some GPUs.)
void isleTwo( float layer, float side, mat2 R, bool steep, vec3 dpx, vec3 dpy, vec3 n0, out vec4 col, out vec4 srf, out vec3 nw ) {
  if ( ! steep ) { isleRead( 1, layer, side, R, dpx, dpy, n0, col, srf, nw ); nw = normalize( nw ); return; }
  vec3 a = abs( n0 );
  int ma = a.x > a.y && a.x > a.z ? 0 : a.y > a.z ? 1 : 2;
  float am = ma == 0 ? a.x : ma == 1 ? a.y : a.z, ae = ma == 0 ? max( a.y, a.z ) : ma == 1 ? max( a.x, a.z ) : max( a.x, a.y );
  int me = ma == 0 ? ( a.y >= a.z ? 1 : 2 ) : ma == 1 ? ( a.x >= a.z ? 0 : 2 ) : ( a.x >= a.y ? 0 : 1 );
  vec2 w = clamp( ( vec2( am, ae ) - 0.5773 ) / ( 1.0 - 0.5773 ), 0.0, 1.0 ); w = w * w * w * w; w.x = max( w.x, 1.0e-4 ); w /= w.x + w.y;
  vec4 c1, s1, c2, s2; vec3 n1, n2;
  isleRead( ma, layer, side, R, dpx, dpy, n0, c1, s1, n1 );
  if ( w.y > 0.01 ) { isleRead( me, layer, side, R, dpx, dpy, n0, c2, s2, n2 ); } else { c2 = c1; s2 = s1; n2 = n1; }
  col = c1 * w.x + c2 * w.y; srf = s1 * w.x + s2 * w.y;
  nw = normalize( n1 * w.x + n2 * w.y + n0 * 1.0e-4 );
}
// one surface as it is seen at this distance: its own scale near the eye, the larger one past 48 m (both between 38 and
// 48 m); steep rock, cliff and shore from their two sides; the large-scale face over the cliffs (a third of it even
// close, against their own strata repeating, all of it by 300 m) and over the steep rock (from 60 m)
void isleLayer( int i, float dist, vec3 dpx, vec3 dpy, vec3 n0, bool steep, out vec4 col, out vec4 srf, out vec3 nw ) {
  const mat2 I2 = mat2( 1.0 );
  #ifdef ISLE_NO_COARSE
  float layer = float( i ), far = 0.0;
  #else
  float layer = float( i ), far = ${lite ? '0.0' : 'smoothstep( 38.0, 48.0, dist )'};
  #endif
  vec4 c1 = vec4( 0.0 ), s1 = vec4( 0.0 ), c2 = vec4( 0.0 ), s2 = vec4( 0.0 ); vec3 n1 = n0, n2 = n0;
  vec4 P = uIsleLayer[ i ];
  ${lite ? 'isleTwo( layer, P.x, I2, false, dpx, dpy, n0, col, srf, nw );' : `
  // only the rock, the cliffs and the shore are read from their sides (grass and litter do not hold to a cliff)
  steep = steep && ( i == ${ROCK} || i == ${CLIFF} || i == ${LAYERS.indexOf('shore')} );
  if ( far < 0.999 ) isleTwo( layer, P.x, I2, steep, dpx, dpy, n0, c1, s1, n1 );
  if ( far > 0.001 ) isleTwo( layer, P.y, I2, steep, dpx, dpy, n0, c2, s2, n2 );
  col = mix( c1, c2, far ); srf = mix( s1, s2, far ); nw = normalize( mix( n1, n2, far ) );
  #ifndef ISLE_NO_FACE
  float k = i == ${CLIFF} ? 0.3 + 0.7 * smoothstep( 40.0, 300.0, dist ) : i == ${ROCK} ? 0.85 * smoothstep( 60.0, 400.0, dist ) : 0.0;
  if ( k > 0.001 ) {
    // read once, its coordinates drawn slowly aside by the island's own slow noise (up to 12 m over a few hundred), so
    // its 50 m tiles never line up into a grid. Its colour is not the basalt's (the scan is pale rock under lichen): the
    // rock keeps its own colour and takes the scan's light and shade (its ledges, its cracks), and where the scan is green
    // (its plants), the island's own dark green
    vec4 cf, sf; vec3 nf;
    isleTwo( ${FACE}.0, uIsleLayer[ ${FACE} ].x, mat2( 1.0 ), steep, dpx, dpy, n0, cf, sf, nf );
    float rel = clamp( dot( cf.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / 0.10, 0.45, 1.6 ), plant = clamp( ( cf.g - 0.5 * ( cf.r + cf.b ) ) * 22.0, 0.0, 1.0 );
    // a kilometre off its 50 m pattern is a few pixels and would repeat: it gives way to its mean (a third of it green)
    float away = smoothstep( 900.0, 2600.0, dist ); rel = mix( rel, 1.0, away ); plant = mix( plant, 0.33, away );
    vec3 macro = mix( col.rgb * mix( 1.0, rel, 0.8 ), vec3( 0.026, 0.052, 0.017 ) * rel, plant * 0.85 );
    col = vec4( mix( col.rgb, macro, k ), mix( col.a, cf.a, k * 0.5 ) ); srf = mix( srf, sf, k ); nw = normalize( mix( nw, nf, k ) );
  }
  // the cliffs' vertical streaks (water and weather down a basalt wall), across the face's own horizontal
  if ( i == ${CLIFF} ) {
    vec2 along = normalize( vec2( -n0.z, n0.x ) + 1.0e-4 );
    float st = gn( vec2( dot( isleW.xz, along ) * 0.33, isleW.y * 0.022 ) ) * 0.7 + gn( vec2( dot( isleW.xz, along ) * 1.1 + 9.0, isleW.y * 0.06 ) ) * 0.3;
    col.rgb *= 0.72 + 0.56 * st;
  }
  #endif`}
}
// the forest's canopy, where the palms are not drawn, until the plants come (the brief's third part brings the trees
// themselves): its colour only, in dapples of a few metres and clumps of twenty, some crowns yellower, some darker, the
// whole changing slowly over the hills; far off, their mean
void isleCanopy( vec2 p, float px, vec3 n0, out vec3 col, out vec3 nw ) {
  float d = gn( p / 5.5 ) * 0.65 + gn( p / 23.0 + 3.0 ) * 0.35, hue = gn( p / 11.0 + 17.0 );
  float lit = smoothstep( 0.28, 0.72, d );
  vec3 green = mix( vec3( 0.026, 0.06, 0.015 ), vec3( 0.052, 0.088, 0.024 ), hue );
  col = mix( vec3( 0.009, 0.018, 0.007 ), green, 0.35 + 0.65 * lit ) * ( 0.8 + 0.4 * isleFaceMix );
  col = mix( col, vec3( 0.024, 0.05, 0.014 ) * ( 0.8 + 0.4 * isleFaceMix ), smoothstep( 1.2, 3.5, px ) );
  nw = n0;
}
`,
    // the splat: in place of three's vertex colour (it sets diffuseColor), with what the later chunks need kept in isle*
    body: `
isleW = vW;
#ifdef ISLE_WATER
// THE SEA. This drawing is the water's surface (moved by the waves): where the eye meets it, what the sea is there, the
// slope of the surface (the wind's sea, the swell over open water and as it comes in square to the reef, the rings a body
// makes), and the floor the eye's line reaches once the surface has bent it (two steps over the grid's heights). The
// splat below reads that floor.
vec3 seaV = normalize( cameraPosition - vW );
vec4 seaM = seaMapAt( vW.xz );
float seaRise, seaLevel = max( vW.y, seaSwash( vW.xz, seaM, seaRise ) );
float seaD0 = max( 0.0, seaLevel - seaGround( vW.xz ) );
vec2 seaDx = dFdx( vW.xz ), seaDy = dFdy( vW.xz );
float seaOpen = smoothstep( -40.0, 40.0, seaM.x ), seaFetch = smoothstep( 20.0, 700.0, seaM.z );
vec3 seaWt = vec3( seaOpen * smoothstep( 1.5, 8.0, seaD0 ), mix( 0.3 * ( 0.35 + 0.65 * seaFetch ), 1.0, seaOpen ), mix( 0.45 + 0.55 * seaFetch, 1.0, seaOpen ) );
float seaSpread; vec4 seaB = seaSlope( vW.xz, seaDx, seaDy, seaWt, seaSpread );
vec2 seaSlopeV = seaB.xy, seaSw, seaSh; float seaWhite;
seaSwell( vW.xz, seaSw ); seaSlopeV += seaSw * seaOpen * ( 1.0 - smoothstep( 650.0, 300.0, seaM.x ) );
seaShore( vW.xz, seaM, seaD0, seaSh, seaWhite ); seaSlopeV += seaSh;
seaSlopeV += seaRipples( vW.xz );
// water a few centimetres deep lies almost flat
float seaThin = smoothstep( 0.0, 0.3, seaD0 ); seaSlopeV *= 0.2 + 0.8 * seaThin; seaSpread *= 0.15 + 0.85 * seaThin;
vec3 seaN = normalize( vec3( -seaSlopeV.x, 1.0, -seaSlopeV.y ) );
vec3 seaT = refract( -seaV, seaN, 1.0 / SEA_N ); seaT = normalize( vec3( seaT.x, min( seaT.y, -0.05 ), seaT.z ) );
vec3 seaP = vW + seaT * ( seaD0 / -seaT.y );
seaP = vW + seaT * ( max( 0.0, seaLevel - seaGround( seaP.xz ) ) / -seaT.y );
seaP.y = seaGround( seaP.xz );
float seaH = max( 0.0, seaLevel - seaP.y ), seaMuV = clamp( -seaT.y, 0.05, 1.0 );
isleW = seaP;
vec3 seaFN = normalize( vec3( seaGround( seaP.xz - vec2( 4.0, 0.0 ) ) - seaGround( seaP.xz + vec2( 4.0, 0.0 ) ), 8.0, seaGround( seaP.xz - vec2( 0.0, 4.0 ) ) - seaGround( seaP.xz + vec2( 0.0, 4.0 ) ) ) );
// THE LIGHT'S DANCE ON THE FLOOR (caustics): where the light that falls on the floor came into the water, the short waves'
// curvature (the slope's divergence) gathers it or spreads it: 1 / (1 + (1 - 1/n) H div). A floor under a pixel that
// spans several of them sees their mean (one); deep, the dance blurs out
float seaCaustic = 1.0;
#if defined( SEA_FFT ) && NUM_DIR_LIGHTS > 0
{
  vec3 kl = inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix ), lt = refract( -kl, vec3( 0.0, 1.0, 0.0 ), 1.0 / SEA_N );
  float px = max( length( dFdx( seaP.xz ) ), length( dFdy( seaP.xz ) ) ), fade = smoothstep( 0.16, 0.05, px ) * smoothstep( 7.0, 2.5, seaH ) * smoothstep( 0.03, 0.25, seaH ) * step( 0.0, kl.y );
  if ( fade > 0.0 ) {
    vec2 e = ( seaP.xz - lt.xz * ( seaH / max( -lt.y, 0.3 ) ) ) / uSeaL.z; float q = 0.06 / uSeaL.z, lod = max( 0.0, log2( px * ${SEA.N}.0 / uSeaL.z ) );
    float div = ( textureLod( uSeaB2, e + vec2( q, 0.0 ), lod ).x - textureLod( uSeaB2, e - vec2( q, 0.0 ), lod ).x + textureLod( uSeaB2, e + vec2( 0.0, q ), lod ).y - textureLod( uSeaB2, e - vec2( 0.0, q ), lod ).y ) / 0.12;
    seaCaustic = mix( 1.0, clamp( 1.0 / max( abs( 1.0 + 0.254 * seaH * div * seaWt.z ), 0.22 ), 0.0, 4.0 ), fade );
  }
}
#endif
#endif
vec3 isleN0 = ISLE_N0;
vec3 isleDpx = dFdx( isleW ), isleDpy = dFdy( isleW );
float isleDist = length( isleW - cameraPosition ), islePx = max( length( isleDpx ), length( isleDpy ) );
float isleH = isleW.y;
isleFar = isleDist > 140.0;
float isleNy = clamp( isleN0.y, 0.03, 1.0 ), isleSlope = sqrt( 1.0 - isleNy * isleNy ) / isleNy;
// the control texture: life.js's cover noise, the slow variation, the lagoon's patches, the edge's jitter
vec4 isleCtl = texture2D( uIsleCtl, ( ( isleW.xz - uIsleGrid.xy ) / uIsleGrid.z * uIsleLook.z + 0.5 ) / ( ( uIsleN - 1.0 ) * uIsleLook.z + 1.0 ) );
isleFaceMix = isleCtl.g; isleWarp = vec2( isleCtl.g - 0.5, isleCtl.r - 0.5 ) * 24.0;
#ifdef ISLE_WATER
float isleSkySeen = 1.0;              // (the floor under the water: its share of the sky is the water's; and the sea's drawing has no texture unit to spare)
#else
float isleSkySeen = texture2D( uIsleSky, ( ( isleW.xz - uIsleGrid.xy ) / uIsleGrid.z + 0.5 ) / uIsleN ).r;
#endif
// a finer jitter for edges, near the eye only (further off it is under a pixel)
float isleE2 = isleDist < 60.0 ? gn( isleW.xz * 0.43 + 7.0 ) : 0.5;
float isleBeach = 2.9 + 0.9 * ( isleCtl.a - 0.5 ) + 0.3 * ( isleE2 - 0.5 );
// (each class's own band is narrow, a few metres on the ground: the two surfaces' heights shape the edge within it)
// (the island's slopes are forested up to the foot of its cliffs: the 30 m data's slopes past 0.9, 42 degrees, are walls
// it has smoothed; life.js plants no palm past 0.8, so the floor between 0.8 and 0.9 is forest floor without palms)
float wCliff = smoothstep( 1.06, 1.14, isleSlope + 0.12 * ( isleE2 - 0.5 ) );
float wRockS = smoothstep( 0.88, 0.97, isleSlope + 0.1 * ( isleCtl.a - 0.5 ) );
float wSand = smoothstep( isleBeach + 0.22, isleBeach - 0.22, isleH ) * ( 1.0 - smoothstep( 0.4, 0.5, isleSlope ) );
float wShore = smoothstep( isleBeach + 0.9, isleBeach - 0.2, isleH ) * smoothstep( 0.42, 0.52, isleSlope );
float isleSea = smoothstep( 0.05, -0.35, isleH );
// under the sea: the lagoon's sand, with rubble and coral heads in patches where it is shallow
float isleReef = smoothstep( 0.64, 0.7, isleCtl.b ) * smoothstep( -4.0, -0.6, isleH );
wShore = max( wShore, isleSea * isleReef );
wSand = max( wSand, isleSea * ( 1.0 - isleReef ) );
float isleRest = ( 1.0 - wCliff ) * clamp( 1.0 - wSand - wShore, 0.0, 1.0 );
float wRock = wRockS * isleRest;
float wGrass = smoothstep( 0.43, 0.47, isleCtl.r ) * smoothstep( 26.6, 25.4, isleH ) * smoothstep( 0.215, 0.185, isleSlope ) * ( isleRest - wRock );
float wLitter = max( 0.0, isleRest - wRock - wGrass );
wSand *= ( 1.0 - wCliff ); wShore *= ( 1.0 - wCliff );
// the two it is most made of (the second less the third, so nothing jumps where they change places), without branches:
// the largest of the six by max and step, then the largest of the rest, then the next (a hair's difference by index
// keeps any two from being equal)
vec3 isleW1 = vec3( wSand, wGrass, wLitter ) + vec3( 0.0, 1.0e-5, 2.0e-5 ), isleW2 = vec3( wRock, wCliff, wShore ) + vec3( 3.0e-5, 4.0e-5, 5.0e-5 );
float isleWa = max( max( isleW1.x, max( isleW1.y, isleW1.z ) ), max( isleW2.x, max( isleW2.y, isleW2.z ) ) );
vec3 isleF1 = step( isleWa, isleW1 ), isleF2 = step( isleWa, isleW2 );
int isleA = int( dot( isleF1, vec3( 0.0, 1.0, 2.0 ) ) + dot( isleF2, vec3( 3.0, 4.0, 5.0 ) ) + 0.5 );
isleW1 *= 1.0 - isleF1; isleW2 *= 1.0 - isleF2;
float isleWb = max( max( isleW1.x, max( isleW1.y, isleW1.z ) ), max( isleW2.x, max( isleW2.y, isleW2.z ) ) );
vec3 isleG1 = step( isleWb, isleW1 ) * step( 1.0e-6, isleW1 ), isleG2 = step( isleWb, isleW2 ) * step( 1.0e-6, isleW2 );
int isleB = min( 5, int( dot( isleG1, vec3( 0.0, 1.0, 2.0 ) ) + dot( isleG2, vec3( 3.0, 4.0, 5.0 ) ) + 0.5 ) );
isleW1 *= 1.0 - isleG1; isleW2 *= 1.0 - isleG2;
float isleWc = max( max( isleW1.x, max( isleW1.y, isleW1.z ) ), max( isleW2.x, max( isleW2.y, isleW2.z ) ) );
isleWb = max( 0.0, isleWb - isleWc );
#ifdef ISLE_NO_STEEP
bool isleSteep = false;
#else
bool isleSteep = ${lite ? 'false' : 'isleN0.y < 0.82'};
#endif
#ifdef ISLE_ONE
isleWb = 0.0;
#endif
vec4 isleColA, isleSrfA, isleColB = vec4( 0.0 ), isleSrfB = vec4( 0.0 ); vec3 isleNA, isleNB = isleN0;
isleLayer( isleA, isleDist, isleDpx, isleDpy, isleN0, isleSteep, isleColA, isleSrfA, isleNA );
float isleK = 1.0;
if ( isleWb > 0.06 ) {
  // the second, as finely as it can be seen: whole within 60 m, its colour and height to 250 m, its mean beyond
  // its colour and height only, in one read from above at the scale its distance calls for (the first's finish and
  // normal carry the edge: where two meet the eye reads the colours and the edge's shape), its mean past 120 m
  isleSrfB = isleSrfA; isleNB = isleNA;
  #ifdef ISLE_B_MEAN
  if ( false ) {
  #else
  if ( isleDist < 120.0 ) {
  #endif
    vec4 PB = uIsleLayer[ isleB ]; float sb = isleDist < 43.0 ? PB.x : PB.y;
    isleColB = textureGrad( uIsleCol, vec3( isleW.xz / sb, float( isleB ) ), isleDpx.xz / sb, isleDpy.xz / sb );
  } else isleColB = vec4( uIsleMean[ isleB ], 0.5 );
  // by their heights: each one's weight raised by how high it stands, and only what comes within a span of the top kept
  float ha = isleWa / ( isleWa + isleWb ) + isleColA.a * uIsleLayer[ isleA ].w * 0.5, hb = isleWb / ( isleWa + isleWb ) + isleColB.a * uIsleLayer[ isleB ].w * 0.5, top = max( ha, hb ) - 0.12;
  float ba = max( ha - top, 0.0 ), bb = max( hb - top, 0.0 ); isleK = ba / max( ba + bb, 1.0e-5 );
}
vec3 isleAlb = mix( isleColB.rgb, isleColA.rgb, isleK );
vec4 isleSrf = mix( isleSrfB, isleSrfA, isleK );
vec3 isleNw = normalize( mix( isleNB, isleNA, isleK ) );
// the maps not come yet: each surface's mean colour, the land's own normal
isleAlb = mix( mix( uIsleMean[ isleB ], uIsleMean[ isleA ], isleK ), isleAlb, uIsleLook.x );
isleNw = normalize( mix( isleN0, isleNw, uIsleLook.x ) );
float isleRough = max( mix( 0.85, isleSrf.b, uIsleLook.x ), mix( uIsleFloor[ isleB ], uIsleFloor[ isleA ], isleK ) ), isleOcc = mix( 1.0, isleSrf.a, uIsleLook.x );
// a slow variation over all of it (one colour of grass is not a lawn); the land's own shape in it (a gully, which sees
// less sky, is wetter and darker than a ridge: no two places alike, at any distance); the moss of Gower's mist forest
isleAlb *= ( 0.84 + 0.32 * isleCtl.g ) * mix( 1.0, 0.78 + 0.3 * isleSkySeen, uIsleGrid.w * ( 1.0 - wSand ) );
float isleMoss = smoothstep( 600.0, 690.0, isleH ) * ( 1.0 - wCliff * 0.6 );
isleAlb = mix( isleAlb, isleAlb * vec3( 0.55, 1.05, 0.5 ) + vec3( 0.004, 0.012, 0.002 ), isleMoss * 0.85 );
// the forest beyond the palms: its canopy, the crowns lit as domes
float isleCrowns = wLitter * smoothstep( ${(PALM.near - 40).toFixed(1)}, ${(PALM.near - 5).toFixed(1)}, length( isleW.xz - uIsleBody.xz ) + 25.0 * ( isleCtl.a - 0.5 ) ) * ( 1.0 - isleSea );
#ifdef ISLE_NO_CANOPY
isleCrowns = 0.0;
#endif
if ( isleCrowns > 0.001 ) {
  vec3 cc, cn; isleCanopy( isleW.xz, islePx, isleN0, cc, cn );
  isleAlb = mix( isleAlb, cc, isleCrowns ); isleNw = normalize( mix( isleNw, cn, isleCrowns ) ); isleRough = mix( isleRough, 0.8, isleCrowns ); isleOcc = mix( isleOcc, 1.0, isleCrowns );
}
// THE SWASH (water.js seaSwash): the sea's edge running up the beach and back. Where it is now, the land is under a film
// of water (its look is the sea's: after the light, below), the sand's own ripples in the film's edge; above it the sand
// is wet as high as the swash reaches (a line that wanders about it), and the spray wets the low rock: darker by how
// porous each is (Lekner and Dorf), smooth and glossy, the water filling its small relief. Under the water (the sea's
// own drawing, and the film) the floor has the water in its pores, not a film on it: a little darker (0.78), not glossy;
// the water's own light is the sea's.
#ifdef ISLE_WATER
float isleFilm = seaH, isleWetLine = 0.0, isleWet = 0.0;
#else
vec4 seaM = seaMapAt( isleW.xz );
float seaRise = 0.0, isleFilm = uIsleOn > 0.5 ? seaSwash( isleW.xz, seaM, seaRise ) - ( isleH + 0.06 * ( isleColA.a - 0.5 ) ) : -1.0;
float isleWetLine = seaReach( seaM ) + 0.16 * ( isleCtl.a - 0.5 ) + 0.06 * ( isleE2 - 0.5 );
float isleWet = max( smoothstep( isleWetLine + 0.1, isleWetLine - 0.05, isleH ), isleSea );
isleWet = max( isleWet, ( wCliff + wRock + wShore ) * smoothstep( 2.6, 0.4, isleH ) * 0.85 );
#endif
float isleWetK = isleFilm > 0.0 ? 0.78 : mix( uIsleLayer[ isleB ].z, uIsleLayer[ isleA ].z, isleK );
isleWet = isleFilm > 0.0 ? 1.0 : isleWet;
isleAlb *= mix( 1.0, isleWetK, isleWet );
isleAlb = mix( isleAlb, isleAlb * isleAlb / max( dot( isleAlb, vec3( 0.333 ) ), 1.0e-4 ), isleWet * 0.3 );     // a little deeper in colour, warmer
isleRough = isleFilm > 0.0 ? isleRough : mix( isleRough, mix( 0.4, 0.14, smoothstep( isleWetLine, isleWetLine - 0.15, isleH ) ), isleWet );
isleNw = normalize( mix( isleNw, isleN0, ( isleFilm > 0.0 ? 0.0 : isleWet ) * 0.75 ) );
#ifdef ISLE_FLAT
// a building's pad: packed earth, eased into what was there
isleAlb = mix( isleAlb, vec3( 0.16, 0.115, 0.07 ) * ( 0.75 + 0.5 * isleE2 ), vEarth );
isleRough = mix( isleRough, 0.9, vEarth );
#endif
diffuseColor.rgb = isleAlb * uIsleLook.y;
#ifdef ISLE_FLATCOL
diffuseColor.rgb = vec3( 0.2 ); isleNw = isleN0;
#endif
`,
    rough: 'float roughnessFactor = isleRough;',
    // the wrapped sky's light: three reads it twice (once about the normal for the diffuse light, once along the
    // reflection for the specular); for ground rougher than 0.7 the second is the first over pi (three's own radiance
    // read leans to the normal by roughness squared and blurs to the same level), so it is read once; wet, glossy ground
    // keeps its true reflection
    maps: THREE.ShaderChunk.lights_fragment_maps.replace('\t\tradiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',
      '\t\tradiance += material.roughness > 0.7 ? iblIrradiance * RECIPROCAL_PI : getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );'),
    normal: 'normal = normalize( ( viewMatrix * vec4( isleNw, 0.0 ) ).xyz );',
    // the sky's share at this point (the land round it) and the scan's own occlusion, on what the sky and the wrapped
    // sky give (three's aomap chunk, by these numbers)
    ao: `
float ambientOcclusion = isleOcc * mix( 1.0, isleSkySeen, uIsleGrid.w );
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif`,
  };
}

// THE WATER'S OWN LIGHT, after the floor (or the beach under the swash) has been lit: what leaves the water toward the eye
// (Lee et al.), the sky in the surface (the wrapped sky along the reflection, as blurred as the slopes under the pixel
// spread it), the key light's glitter (where the land, a palm or a ship does not shade the water), the white water
const SEA_LATE = `
${SEA_OPTICS_GLSL}
${SEA_WAVES_GLSL}
${SEA_SURFACE_GLSL}
vec3 seaSkyIn( vec3 v, vec3 n, float spread ) {
  vec3 r = reflect( -v, n ); r.y = abs( r.y ) + 0.003; r = normalize( r );
  #ifdef USE_ENVMAP
  vec3 vv = normalize( ( viewMatrix * vec4( v, 0.0 ) ).xyz ), rv = normalize( ( viewMatrix * vec4( r, 0.0 ) ).xyz );
  return getIBLRadiance( vv, normalize( vv + rv ), clamp( sqrt( spread ), 0.025, 0.7 ) ) / envMapIntensity;
  #else
  return uSeaE * ${num(1 / Math.PI)};
  #endif
}
void seaKey( out vec3 l, out vec3 e ) {
  l = vec3( 0.0, 1.0, 0.0 ); e = vec3( 0.0 );
  #if NUM_DIR_LIGHTS > 0
  l = inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix ); e = directionalLights[ 0 ].color;
  #endif
}`;
const SEA_AFTER = `
#ifdef ISLE_WATER
{
  vec3 kl, ke; seaKey( kl, ke );
  vec3 up = seaOut( uSeaE, outgoingLight, seaH, uSeaLight.x, seaMuV );
  float F = seaFresnel( dot( seaN, seaV ) ), lit = isleKeyW( vW, vec3( 0.0, 1.0, 0.0 ), seaD0, length( vW - cameraPosition ) );
  vec3 glint = seaGlitter( seaV, kl, ke * uSeaLight.y, seaSlopeV, seaSpread ) * lit;
  // the white water: the surf's, and the whitecaps where the wind's sea folds (its Jacobian under about 0.3), as lace;
  // it gives back about 0.6 of the light on level water (shaded, the sky's share of it)
  float foam = seaLace( vW.xz, clamp( seaWhite + smoothstep( 0.42, 0.08, seaB.z ) * seaOpen * 0.85 + seaRise * smoothstep( 0.06, 0.0, seaD0 ) * 0.7, 0.0, 1.0 ) );
  vec3 white = 0.6 * ${num(1 / Math.PI)} * max( uSeaE - ke * max( kl.y, 0.0 ) * ( 1.0 - lit ), vec3( 0.0 ) );
  outgoingLight = mix( up, seaSkyIn( seaV, seaN, seaSpread ), F ) + glint * ( 1.0 - foam );
  outgoingLight = mix( outgoingLight, white, foam );
  if ( uSeaDebug > 0.5 ) {
    vec3 dbg = uSeaDebug < 1.5 ? vec3( 1.0, 0.0, 1.0 ) : uSeaDebug < 2.5 ? up / max( max( up.r, up.g ), max( up.b, 1.0e-6 ) ) : uSeaDebug < 3.5 ? seaN * 0.5 + 0.5 : uSeaDebug < 4.5 ? seaSkyIn( seaV, seaN, seaSpread ) * 20.0 : uSeaDebug < 5.5 ? vec3( foam ) : uSeaDebug < 6.5 ? vec3( seaH / 10.0, seaD0 / 10.0, F ) : uSeaDebug < 7.5 ? uSeaE * 0.0001 : uSeaDebug < 8.5 ? vec3( isnan( glint.r ) || isinf( glint.r ) ? 1.0 : 0.0, isnan( foam ) || isinf( foam ) ? 1.0 : 0.0, isnan( lit ) ? 1.0 : 0.0 ) : uSeaDebug < 9.5 ? vec3( isnan( seaSpread ) ? 1.0 : 0.0, isnan( white.r ) ? 1.0 : 0.0, isnan( F ) ? 1.0 : 0.0 ) : vec3( isnan( seaWhite ) ? 1.0 : 0.0, isnan( seaB.z ) ? 1.0 : 0.0, isnan( kl.y + ke.r ) ? 1.0 : 0.0 );
    outgoingLight = dbg;
  }
}
#else
if ( isleFilm > 0.0 ) {
  // the swash's film over the beach: glassy, the sky in it, the Sun's glint, lace at its front as it runs up
  vec3 kl, ke; seaKey( kl, ke );
  vec3 v = normalize( cameraPosition - vW ), n = vec3( 0.0, 1.0, 0.0 );
  vec3 up = seaOut( uSeaE, outgoingLight, isleFilm, uSeaLight.x, seaUnder( v.y ) );
  float F = seaFresnel( v.y ), lit = isleKeyW( vW, n, 0.0, length( vW - cameraPosition ) );
  float foam = seaLace( vW.xz * 1.6, smoothstep( 0.035, 0.0, isleFilm ) * ( 0.25 + 0.6 * seaRise ) );
  vec3 white = 0.6 * ${num(1 / Math.PI)} * max( uSeaE - ke * max( kl.y, 0.0 ) * ( 1.0 - lit ), vec3( 0.0 ) );
  outgoingLight = mix( up, seaSkyIn( v, n, 0.002 ), F ) + seaGlitter( v, kl, ke * uSeaLight.y, vec2( 0.0 ), 0.004 ) * lit * ( 1.0 - foam );
  outgoingLight = mix( outgoingLight, white, foam );
}
#endif
`;
// a probe's shader switches (material defines, which three folds into the program's key), to measure what each part costs
const VARIANT = { defines: {} };
// the sea's sheet is moved by the waves: the swell, the swell at the reef (where the sheet is fine enough to carry it),
// the wind's largest band near the eye (its smaller ones only shade it: a program has sixteen texture units in all, and
// the sea's drawing uses fifteen); they lie down where the water thins to nothing, so the sheet meets the beach still
const SEA_VERT = `
uniform float uIsleOn; uniform highp sampler2D uIsleHt; uniform vec4 uIsleGrid; uniform vec2 uIsleN;
${GRID_GLSL}
${NOISE_GLSL}
${SEA_OPTICS_GLSL}
${SEA_WAVES_GLSL}
${SEA_SURFACE_GLSL}
vec3 seaMove( vec3 w ) {
  float d = max( 0.0, -seaGround( w.xz ) ), r = length( w.xz - cameraPosition.xz );
  vec4 m = seaMapAt( w.xz );
  float open = smoothstep( -40.0, 40.0, m.x ), wh; vec2 sl;
  vec3 mv = seaSwell( w.xz, sl ) * open * ( 1.0 - smoothstep( 650.0, 300.0, m.x ) );
  mv.y += seaShore( w.xz, m, d, sl, wh ) * smoothstep( 700.0, 300.0, r );
  #ifdef SEA_FFT
  mv += textureLod( uSeaA0, w.xz / uSeaL.x, 0.0 ).xyz * open * smoothstep( 1.5, 8.0, d ) * smoothstep( 300.0, 150.0, r );
  #endif
  mv *= smoothstep( 0.03, 1.0, d );
  mv.y = max( mv.y, 0.02 - 0.8 * d );         // a trough never reaches the floor
  return mv;
}`;
// The land's material and the levelled ground's, made from a MeshStandardMaterial island.js hands in; `cut`: island.js's
// own lines (the levelled ground's cut: its uniforms, its declarations and its body, run before the splat). `water`: the
// sea's own (its sheet: the water's surface and the floor seen through it, with the same splat)
function landMaterial(base, { lite, flat, uniforms, cut = null, water = false }) {
  const m = base, f = landFrag({ lite });
  const loop = THREE.ShaderChunk.lights_fragment_begin.replace(DIR_LOOP, ISLE_LOOP);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, SHARED, cut?.uniforms || {});
    const head = (flat ? '#define ISLE_FLAT\n' : '') + (water ? '#define ISLE_WATER\n' : '');
    sh.vertexShader = head + sh.vertexShader.replace('#include <common>', '#include <common>\n' + LAND_VERT_PARS + (water ? SEA_VERT : ''))
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n' + LAND_NORMAL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (water ? 'transformed += seaMove( ( modelMatrix * vec4( transformed, 1.0 ) ).xyz );\n' : '') + LAND_PLACE);
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + f.pars + (cut?.pars || ''))
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + LIGHT_PARS + SEA_LATE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (cut?.body || '') + f.body)
      .replace('#include <roughnessmap_fragment>', f.rough)
      .replace('#include <normal_fragment_maps>', f.normal)
      .replace('#include <aomap_fragment>', f.ao)
      .replace('#include <lights_fragment_maps>', f.maps)
      .replace('#include <lights_fragment_begin>', loop)
      .replace('#include <opaque_fragment>', SEA_AFTER + '#include <opaque_fragment>');
    // the land's own height over the ground is 0 (its fragments are the grid's triangles); the levelled ground's is not;
    // the sea's floor is where its refracted line meets it
    sh.fragmentShader = head + (flat ? '#define ISLE_OVER -1.0e9\n' : '#define ISLE_OVER 0.0\n') + (water ? '#define ISLE_N0 seaFN\n' : '#define ISLE_N0 normalize( vWN )\n') + fs;
  };
  m.customProgramCacheKey = () => `isle-land|${lite ? 1 : 0}|${flat ? 1 : 0}|${water ? 1 : 0}`;
  ADOPTED.add(m);
  m.needsUpdate = true;
  return m;
}

// createGroundLook({ renderer, lite, phone, ground, scene }): the land's materials (`land`, `flat`), the passes and the
// shadow maps. update({ camera, dir, body }) once a frame (dir: toward the key light) draws the shadow maps; adoptAll
// (scene) makes whatever lit thing has come into the scene take the shadows; read() is the probes' numbers.
export function createGroundLook({ renderer, lite = false, phone = false, ground, scene, water = null }) {
  const head = ground.head, W = head.w, H = head.h, S = head.spacing;
  const C = lite ? CASCADES.lite : CASCADES, nC = C.far.length, per = lite || phone ? CONTROL.lite : CONTROL.per;
  const spare = spareDepth(renderer);
  if (!SHARED.uIsleShade0.value) SHARED.uIsleShade0.value = SHARED.uIsleShade1.value = SHARED.uIsleShade2.value = spare;
  const canDraw = (() => { try { return !!renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')); } catch { return false; } })();
  const disposables = [];
  // the heights, as they are (texel by texel), and as half floats the GPU blends between (the sky's share)
  const ht = new THREE.DataTexture(ground.hts.main, W, H, THREE.RedFormat, THREE.FloatType);
  ht.magFilter = ht.minFilter = THREE.NearestFilter; ht.generateMipmaps = false; ht.needsUpdate = true;
  const hf = new THREE.DataTexture(Uint16Array.from(ground.hts.main, (x) => THREE.DataUtils.toHalfFloat(x)), W, H, THREE.RedFormat, THREE.HalfFloatType);
  hf.magFilter = hf.minFilter = THREE.LinearFilter; hf.wrapS = hf.wrapT = THREE.ClampToEdgeWrapping; hf.generateMipmaps = false; hf.needsUpdate = true;
  disposables.push(ht, hf);
  let top = 0; for (const v of ground.hts.main) if (v > top) top = v;
  // (with their smaller levels: the far land reads them a few texels a pixel apart, and without them scattered reads
  // empty the GPU's texture cache)
  const rt = (w, h, type, format) => new THREE.WebGLRenderTarget(w, h, { type, format, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: true });
  const quadGeo = new THREE.BufferGeometry(); quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(quadGeo), quadScene = new THREE.Scene(), quadCam = new THREE.Camera(); quad.frustumCulled = false; quadScene.add(quad);
  disposables.push(quadGeo);
  const run = (material, target) => { const was = renderer.getRenderTarget(); quad.material = material; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); renderer.setRenderTarget(was); };
  const pass = (frag, uniforms) => { const m = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false }); disposables.push(m); return m; };
  const times = { skyShare: 0, control: 0, lines: 0, band: 0, maps: 0 };
  // the control texture and the sky's share, once (the control needs nothing more than eight bits a channel)
  const cw = (W - 1) * per + 1, ch = (H - 1) * per + 1;
  const ctlRT = rt(cw, ch, THREE.UnsignedByteType, THREE.RGBAFormat); disposables.push(ctlRT);
  { const t0 = performance.now(); run(pass(CONTROL_FRAG, { uGrid: { value: new THREE.Vector4(head.x0, head.z0, S, 0) }, uPer: { value: per } }), ctlRT); times.control = performance.now() - t0; }
  let skyRT = null;
  if (canDraw) {
    skyRT = rt(W, H, THREE.UnsignedByteType, THREE.RedFormat); disposables.push(skyRT);
    const t0 = performance.now();
    run(pass(SKYSHARE_FRAG, { uHf: { value: hf }, uH: { value: ht }, uN: { value: new THREE.Vector2(W, H) }, uS: { value: S } }), skyRT);
    times.skyShare = performance.now() - t0;
  }
  // the land's lines: two targets, one shown while the other is made, a band of rows a frame
  const lineRT = canDraw ? [rt(W, H, THREE.HalfFloatType, THREE.RGFormat), rt(W, H, THREE.HalfFloatType, THREE.RGFormat)] : [];
  disposables.push(...lineRT);
  const LU = { uH: { value: ht }, uN: { value: new THREE.Vector2(W, H) }, uS: { value: S }, uDir: { value: new THREE.Vector2() }, uTan: { value: new THREE.Vector2() }, uTop: { value: top } };
  const linesMat = canDraw ? pass(LINES_FRAG, LU) : null;
  let shown = 0, making = null, linesFor = null, firstLines = true;
  const D = new THREE.Vector3();
  function linesToward(dir, radius) {
    const alt = Math.asin(Math.max(-1, Math.min(1, dir.y))), hz = Math.hypot(dir.x, dir.z);
    LU.uDir.value.set(hz > 1e-6 ? dir.x / hz : 0, hz > 1e-6 ? dir.z / hz : 0);
    LU.uTan.value.set(Math.tan(Math.max(-0.2, alt - radius)), Math.tan(Math.max(-0.2, alt + radius)));
  }
  function bandOf(target, k, n) {
    const y0 = Math.floor((H * k) / n), y1 = Math.floor((H * (k + 1)) / n);
    target.scissor.set(0, y0, W, y1 - y0); target.scissorTest = true;
    run(linesMat, target);
    target.scissorTest = false;
  }

  // ---- the shadow maps: depth textures, compared by the GPU as they are read; the things that cast are drawn into
  // them alone (their layer), by a depth material that draws both faces (a palm's frond is a sheet)
  const depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide }); depthMat.colorWrite = false; disposables.push(depthMat);
  const cascades = C.far.map((far, i) => {
    const size = C.size[i], depth = new THREE.DepthTexture(size, size);
    depth.compareFunction = THREE.LessEqualCompare; depth.minFilter = depth.magFilter = THREE.LinearFilter;
    const target = new THREE.WebGLRenderTarget(size, size, { depthTexture: depth, depthBuffer: true, stencilBuffer: false, format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000); cam.layers.set(CASCADES.layer);
    disposables.push(target, depth);
    return { size, far, target, depth, cam, frame: 0, drawn: false, at: new THREE.Vector3() };
  });
  // each slice's bounding sphere (its radius is fixed while the view's angle is: the map does not swim as the eye turns)
  const sphere = (n, f, k) => { let c = ((f + n) * (1 + k * k)) / 2; if (c > f) c = f; return { c, r: Math.hypot(f - c, f * k) }; };
  const RIGHT = new THREE.Vector3(), UPV = new THREE.Vector3(), Z = new THREE.Vector3(), CEN = new THREE.Vector3(), FWD = new THREE.Vector3(), UP0 = new THREE.Vector3();
  let frameNo = 0;
  const LAST = new THREE.Vector3(), crowds = [], lastDrawn = [];      // the instanced crowds planted nearest first (adoptAll finds them); what each map last drew
  function drawMaps(camera, dir) {
    const ty = Math.tan((camera.fov * Math.PI) / 360), tx = ty * camera.aspect, k = Math.hypot(tx, ty);
    Z.copy(dir).normalize();
    UP0.set(0, 1, 0); if (Math.abs(Z.y) > 0.995) UP0.set(0, 0, 1);
    RIGHT.crossVectors(UP0, Z).normalize(); UPV.crossVectors(Z, RIGHT);
    camera.getWorldDirection(FWD);
    const was = renderer.getRenderTarget(), override = scene.overrideMaterial, bg = scene.background, auto = renderer.autoClear;
    scene.overrideMaterial = depthMat; scene.background = null; renderer.autoClear = true;
    let near = 0.1; frameNo += 1;
    const lightMoved = LAST.angleTo(Z) > 0.0009; if (lightMoved) LAST.copy(Z);
    cascades.forEach((c, i) => {
      // the nearest map round the slice of the view in front of the eye (the body's own shadow, every frame); the others
      // round the eye itself, whichever way it looks: turning moves nothing in them, so they are drawn again only when the
      // eye has gone four of their texels, the light has moved, or (for what moves in them) every second and sixth frame
      const round = i === 0 ? sphere(near, c.far, k) : { c: 0, r: c.far }, r = round.r, texel = (2 * r) / c.size;
      CEN.copy(camera.position).addScaledVector(FWD, round.c);
      // stepped by whole texels across the light, so a still shadow stays still as the eye moves
      const a = CEN.dot(RIGHT), b = CEN.dot(UPV);
      CEN.addScaledVector(RIGHT, Math.round(a / texel) * texel - a).addScaledVector(UPV, Math.round(b / texel) * texel - b);
      const due = i === 0 || !c.drawn || lightMoved || c.at.distanceTo(CEN) >= 4 * texel || frameNo - c.frame >= (i === 1 ? 2 : 6);
      if (api.debug.shadows && due) {
        // an instanced crowd planted nearest first (creatures.js isleNear: the palms) is drawn only as far as its shadows can
        // reach this map: its reach, a tall thing's shadow at this light's height, and how far the planting may lag
        const reach = Math.hypot(CEN.x - camera.position.x, CEN.z - camera.position.z) + r + Math.min(400, 14.5 / Math.max(0.035, Math.tan(Math.asin(Math.min(1, Math.max(0.01, Z.y)))))) + 25;
        for (const m of crowds) { const nb = m.userData.isleNear; if (!nb || !m.parent) continue; m.userData.isleCount = m.count; const lim = reach + Math.hypot(camera.position.x - nb.x, camera.position.z - nb.z); let lo = 0, hi = Math.min(m.count, nb.d.length); while (lo < hi) { const mid = (lo + hi) >> 1; if (nb.d[mid] <= lim) lo = mid + 1; else hi = mid; } m.count = lo; }
        const cam = c.cam, depthRange = 2 * r + CASCADES.margin;
        cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.1; cam.far = depthRange; cam.up.copy(UP0);
        cam.position.copy(CEN).addScaledVector(Z, r + CASCADES.margin); cam.lookAt(CEN); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        renderer.setRenderTarget(c.target); renderer.clear(false, true, false); renderer.render(scene, cam);
        lastDrawn[i] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
        for (const m of crowds) if (m.userData.isleCount !== undefined) { m.count = m.userData.isleCount; delete m.userData.isleCount; }
        c.drawn = true; c.frame = frameNo; c.at.copy(CEN);
        SHARED.uIsleShadeM.value[i].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        // (the nearest map is read with four comparisons, a soft edge round the body; the others with one: their texels
        // are already 8 and 43 cm)
        SHARED.uIsleShadeO.value.setComponent(i, 1.5 * texel); SHARED.uIsleShadeT.value.setComponent(i, i === 0 ? 1 / c.size : -1 / c.size); SHARED.uIsleShadeZ.value.setComponent(i, 0.02 / depthRange);
      }
      near = c.far;
    });
    scene.overrideMaterial = override; scene.background = bg; renderer.autoClear = auto; renderer.setRenderTarget(was);
    SHARED.uIsleSplit.value.set(C.far[0], C.far[1] ?? 1e9, C.far[2] ?? 1e9, api.debug.shadows ? nC : 0);
    SHARED.uIsleShade0.value = cascades[0].depth; SHARED.uIsleShade1.value = cascades[1]?.depth || spare; SHARED.uIsleShade2.value = cascades[2]?.depth || spare;
  }

  // ---- the land's materials
  const [col0, surf0] = standIns(); disposables.push(col0, surf0);
  const uniforms = { uIsleCol: { value: col0 }, uIsleSurf: { value: surf0 }, uIsleSky: { value: skyRT ? skyRT.texture : null }, uIsleCtl: { value: ctlRT.texture },
    uIsleLayer: { value: LAYERS.map((_, i) => new THREE.Vector4(FINE[i], COARSE[i], WET[i], RISE[i])) }, uIsleMean: { value: MEAN.map((m) => new THREE.Vector3(...m)) }, uIsleFloor: { value: FLOOR },
    uIsleLook: { value: new THREE.Vector4(0, 1, per, 0) }, uIsleBody: { value: new THREE.Vector3(1e6, 0, 1e6) }, ...(water ? water.uniforms : {}) };
  const which = lite || phone ? 'lite' : 'full';
  let mapsState = 'fetching', mapsAt = 0, fade = 0;
  const t0 = performance.now();
  loadMaps(renderer, which).then(([c, s]) => {
    if (mapsState === 'gone') return;
    uniforms.uIsleCol.value = c; uniforms.uIsleSurf.value = s; mapsState = 'drawn'; mapsAt = performance.now() - t0;
  }, (e) => { mapsState = 'failed'; console.error('[island] the ground\'s maps could not be fetched', e); });
  // SHARED holds this island's numbers (again every frame: see update)
  const own = () => {
    SHARED.uIsleOn.value = 1; SHARED.uIsleHt.value = ht; SHARED.uIsleGrid.value.set(head.x0, head.z0, S, canDraw && api.debug.lines ? 1 : 0); SHARED.uIsleN.value.set(W, H);
    SHARED.uIsleLines.value = lineRT[shown]?.texture || null;
  };
  const landRefs = [];
  const api = {
    cascades: nC,
    // a probe's switches, to measure what each part costs (nothing in the game sets them), and its handles
    debug: { shadows: true, lines: true, variant: VARIANT, recompile() { for (const o of landRefs) { o.defines = { ...(o.userData.isleDefines ||= { ...(o.defines || {}) }), ...VARIANT.defines }; o.needsUpdate = true; } } },
    parts: { scene, cascades, renderer, uniforms, water },
    // the land's own material from island.js's (its flats' cut runs first), and the levelled ground's
    land: (base, cut) => { const m = landMaterial(base, { lite, flat: false, uniforms, cut }); landRefs.push(m); return m; },
    flat: (base, cut) => { const m = landMaterial(base, { lite, flat: true, uniforms, cut }); landRefs.push(m); return m; },
    // the sea's own material (its sheet): the water's surface and the floor seen through it, in one drawing. It is not drawn
    // over what stands in the water (adoptAll marks those, stencil 2): each of them shows its own submerged part
    sea: (base, extra = {}) => {
      const m = landMaterial(base, { lite, flat: false, uniforms: { ...uniforms, ...extra }, water: true }); landRefs.push(m);
      m.defines = { ...(m.defines || {}), ...(water ? water.defines : {}) };
      Object.assign(m, { stencilWrite: true, stencilWriteMask: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 2, stencilZPass: THREE.KeepStencilOp });
      return m;
    },
    // the light on level water and its cosine under it (shared: the sea, the swash, whatever stands in the water read it);
    // island.js sets it under the present sky, sky.js under the true one
    seaLight: { uSeaE: SHARED.uSeaE, uSeaLight: SHARED.uSeaLight },
    // the present light raises the land's colours (island.js says why)
    set paint(k) { uniforms.uIsleLook.value.y = k; },
    get paint() { return uniforms.uIsleLook.value.y; },
    // every lit, solid thing in the scene takes the shadows; what is not the land casts them (into the maps' layer)
    adoptAll(sc) {
      sc.traverse((o) => {
        if (!o.isMesh || o.userData.isleShadow === false || o.userData.isleSeen) return;
        const m = o.material, list = Array.isArray(m) ? m : [m];
        let lit = false;
        for (const x of list) {
          if (!x || !(x.isMeshStandardMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial || x.isMeshToonMaterial) || x.transparent || x.blending !== THREE.NormalBlending) continue;
          adopt(x); lit = true;
          // what stands on the land or in the water marks its pixels: the sea's sheet is not drawn over them
          if (!o.userData.isleLand && !o.userData.isleSea) Object.assign(x, { stencilWrite: true, stencilRef: 2, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
        }
        if (!lit) return;
        o.userData.isleSeen = true; o.receiveShadow = true;
        if (!o.userData.isleLand) o.layers.enable(CASCADES.layer);
        if (o.isInstancedMesh && !crowds.includes(o)) crowds.push(o);                 // (whether it is planted nearest first is asked as it is drawn)
      });
    },
    update({ camera, dir, body = null }) {
      owner = api; own();
      SHARED.uIsleV2W.value.copy(camera.matrixWorld);
      if (body) uniforms.uIsleBody.value.set(body[0], body[1], body[2]);
      if (mapsState === 'drawn' && fade < 1) fade = Math.min(1, fade + 0.08);
      uniforms.uIsleLook.value.x = fade;
      D.copy(dir).normalize();
      const t1 = performance.now(); drawMaps(camera, D); times.maps += (performance.now() - t1 - times.maps) * 0.05;
      if (!canDraw) return;
      // the land's lines: all at once the first time, then a band a frame into the other target once the light has moved
      if (firstLines) {
        const t2 = performance.now(); linesToward(D, 0.00466); run(linesMat, lineRT[0]); times.lines = performance.now() - t2;
        linesFor = D.clone(); firstLines = false; own();
        return;
      }
      if (!making && linesFor.angleTo(D) > (LINES.moved * Math.PI) / 180) making = { band: 0, dir: D.clone() };
      if (making) {
        const t2 = performance.now(); linesToward(making.dir, 0.00466); bandOf(lineRT[1 - shown], making.band, LINES.bands); times.band = performance.now() - t2;
        making.band += 1;
        if (making.band >= LINES.bands) { shown = 1 - shown; own(); linesFor = making.dir; making = null; }
      }
    },
    read: () => ({ maps: mapsState, which, mapsMs: Math.round(mapsAt), fade, canDraw, cascades: C.far, sizes: C.size, control: [cw, ch], times: { ...times }, lines: linesFor ? linesFor.toArray().map((v) => +v.toFixed(4)) : null,
      casters: (() => { let n = 0, inst = 0; scene.traverse((o) => { if (o.isMesh && o.layers.isEnabled(CASCADES.layer) && o.visible) { n += 1; if (o.isInstancedMesh) inst += o.count; } }); return { meshes: n, instances: inst, crowds: crowds.map((m) => [m.count, m.userData.isleNear ? m.userData.isleNear.d.length : -1, m.geometry.attributes.position.count]) }; })(),
      drawn: lastDrawn }),
    // the probes' handles: the land's lines and the sky's share as the GPU made them (in metres; 0..1)
    peek(i, j) {
      const out = {};
      if (lineRT[shown]) { const p = new Uint16Array(4); renderer.readRenderTargetPixels(lineRT[shown], i, j, 1, 1, p); out.lines = [THREE.DataUtils.fromHalfFloat(p[0]), THREE.DataUtils.fromHalfFloat(p[1])]; }
      if (skyRT) { const p = new Uint8Array(4); renderer.readRenderTargetPixels(skyRT, i, j, 1, 1, p); out.sky = p[0] / 255; }
      { const p = new Uint8Array(4); renderer.readRenderTargetPixels(ctlRT, i * per, j * per, 1, 1, p); out.control = [...p].map((x) => x / 255); out.at = [head.x0 + i * S, head.z0 + j * S]; }
      return out;
    },
    dispose() {
      mapsState = 'gone';
      // only the island that last held SHARED lets it go (a plainer island made before this one was let go holds it now)
      if (owner === api || !owner) {
        owner = null; SHARED.uIsleOn.value = 0; SHARED.uIsleGrid.value.w = 0; SHARED.uIsleLines.value = null; SHARED.uIsleHt.value = null;
        SHARED.uIsleSplit.value.w = 0; SHARED.uIsleShade0.value = SHARED.uIsleShade1.value = SHARED.uIsleShade2.value = spare;
      }
      for (const x of disposables) x.dispose();
    },
  };
  return api;
}
