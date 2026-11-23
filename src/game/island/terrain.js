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

// ---- the surfaces (ground-textures.py's LAYERS; ground.json says what each was graded from)
export const LAYERS = ['sand', 'grass', 'litter', 'rock', 'cliff', 'shore', 'face'];
// metres a texture's width spans: near the eye (the scan's own size; the sand's 30 m scan is read at an eighth, so its
// grains and small ripples are under the feet), and further off
export const FINE = [3.75, 2.0, 2.3, 1.5, 2.0, 2.17, 50];
export const COARSE = [30, 13, 15, 10, 13, 14, 50];
// each surface's mean colour (linear, as graded): drawn before the maps have come
export const MEAN = [[0.57, 0.53, 0.45], [0.075, 0.13, 0.035], [0.10, 0.075, 0.045], [0.135, 0.125, 0.112], [0.105, 0.097, 0.088], [0.16, 0.15, 0.135], [0.135, 0.096, 0.041]];
// how dark each goes wet (Lekner and Dorf's water film: a porous surface loses most) and how much its height counts
// when two meet (rock stands out of what is round it; sand fills)
const WET = [0.45, 0.7, 0.7, 0.62, 0.62, 0.55, 0.62];
const RISE = [0.5, 0.75, 0.7, 1.15, 1.25, 1.0, 1.25];
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
  uIsleSplit: { value: new THREE.Vector4(15, 60, 220, 0) }, // where each shadow map ends (view depth, m), and how many there are
  uIsleShade0: { value: null }, uIsleShade1: { value: null }, uIsleShade2: { value: null },     // the maps (depth, compared)
  uIsleShadeM: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },     // world to each map
  uIsleShadeO: { value: new THREE.Vector3() },              // each map's offset along the normal (m: a texel and a half)
  uIsleShadeT: { value: new THREE.Vector3() },              // each map's texel (in its own 0..1)
  uIsleShadeZ: { value: new THREE.Vector3() },              // each map's depth bias (2 cm, in its own depth)
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
float isleKey( vec3 viewPos, vec3 viewN, float over ) {
  if ( uIsleOn < 0.5 || ! receiveShadow ) return 1.0;
  vec3 w = ( uIsleV2W * vec4( viewPos, 1.0 ) ).xyz;
  float s = isleLand( w, over );
  if ( s > 0.0 ) s *= isleMaps( w, normalize( mat3( uIsleV2W ) * viewN ), - viewPos.z );
  return s;
}`;
// three's own directional loop (r160), and the island's: its key light (the first directional light) shadowed
const DIR_LOOP = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )\n\tDirectionalLight directionalLight;\n\t#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n\tDirectionalLightShadow directionalLightShadow;\n\t#endif\n\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {\n\t\tdirectionalLight = directionalLights[ i ];\n\t\tgetDirectionalLightInfo( directionalLight, directLight );\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )\n\t\tdirectionalLightShadow = directionalLightShadows[ i ];\n\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}\n\t#pragma unroll_loop_end\n#endif\n';
const ISLE_LOOP = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	float isleShade = isleKey( geometryPosition, geometryNormal, ISLE_OVER );
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
    fs = fs.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + LIGHT_PARS);
    shader.fragmentShader = '#define ISLE_OVER -1.0e9\n' + fs.replace('#include <lights_fragment_begin>', loop);
  };
  material.customProgramCacheKey = () => keyOf() + '|isle';
  material.needsUpdate = true;
}

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
#ifdef ISLE_FLAT
varying float vEarth;
#endif
uniform mediump sampler2DArray uIsleCol; uniform mediump sampler2DArray uIsleSurf; uniform sampler2D uIsleSky; uniform sampler2D uIsleCtl;
uniform vec4 uIsleLook;      // the maps' weight (0 until they come, then 1), the present light's raise of the colours, the control's texels to a cell
uniform vec3 uIsleBody;      // where the body is: the palms stand within PALM.near of it
${NOISE_GLSL}
uniform vec4 uIsleLayer[ 7 ];    // each surface's fine and coarse side (m), how dark it goes wet, how much its height counts
uniform vec3 uIsleMean[ 7 ];     // and its mean colour
bool isleFar;                      // past 140 m (set by the splat before any read)
vec3 isleTan( vec4 s ) { vec2 xy = s.xy * 2.0 - 1.0; return vec3( xy, sqrt( max( 0.0, 1.0 - dot( xy, xy ) ) ) ); }
// one surface at one scale, seen from above: its colour and height, its finish; its normal in the world (whiteout
// blend onto the land's own normal: the scan's x along the world's x, its y (up the picture) along z)
void isleTop( float layer, float side, vec2 dx, vec2 dy, vec3 n0, out vec4 col, out vec4 srf, out vec3 nw ) {
  vec3 uv = vec3( vW.xz / side, layer );
  // past 140 m a scan's shape and finish are under a pixel: its mean finish, the land's own normal (half the reads)
  if ( isleFar ) { col = textureGrad( uIsleCol, uv, dx / side, dy / side ); srf = vec4( 0.5, 0.5, 0.8, 0.9 ); nw = n0; return; }
  #ifdef ISLE_IMPLICIT
  col = texture( uIsleCol, uv ); srf = texture( uIsleSurf, uv );
  #else
  col = textureGrad( uIsleCol, uv, dx / side, dy / side ); srf = textureGrad( uIsleSurf, uv, dx / side, dy / side );
  #endif
  vec3 t = isleTan( srf );
  nw = normalize( vec3( t.x + n0.x, t.z * n0.y, t.y + n0.z ) );
}
// from the two sides the land faces most (after Quilez's biplanar mapping: a cliff is read from the side it faces, and a
// third read would add little), each blended by how much it faces that way. Read from above, it is read by x and z as
// the level ground is (isleTop), so nothing turns where the ground steepens. (Each side chosen by selects, not by
// indexing a vector at run time: that puts the vector in memory on some GPUs.)
void isleSide( int axis, float layer, float side, vec3 dpx, vec3 dpy, vec3 n0, out vec4 col, out vec4 srf, out vec3 nw ) {
  vec2 uv = axis == 0 ? vW.zy : axis == 1 ? vW.xz : vW.xy, gx = axis == 0 ? dpx.zy : axis == 1 ? dpx.xz : dpx.xy, gy = axis == 0 ? dpy.zy : axis == 1 ? dpy.xz : dpy.xy;
  vec3 at = vec3( uv / side, layer );
  col = textureGrad( uIsleCol, at, gx / side, gy / side );
  srf = isleFar && side < 40.0 ? vec4( 0.5, 0.5, 0.8, 0.9 ) : textureGrad( uIsleSurf, at, gx / side, gy / side );
  vec3 t = isleTan( srf );
  nw = axis == 0 ? vec3( t.z * n0.x, t.y + n0.y, t.x + n0.z ) : axis == 1 ? vec3( t.x + n0.x, t.z * n0.y, t.y + n0.z ) : vec3( t.x + n0.x, t.y + n0.y, t.z * n0.z );
}
void isleTwo( float layer, float side, vec3 dpx, vec3 dpy, vec3 n0, out vec4 col, out vec4 srf, out vec3 nw ) {
  vec3 a = abs( n0 );
  int ma = a.x > a.y && a.x > a.z ? 0 : a.y > a.z ? 1 : 2;
  float am = ma == 0 ? a.x : ma == 1 ? a.y : a.z, b1 = ma == 0 ? a.y : a.x, b2 = ma == 2 ? a.y : a.z;
  int me = ma == 0 ? ( a.y >= a.z ? 1 : 2 ) : ma == 1 ? ( a.x >= a.z ? 0 : 2 ) : ( a.x >= a.y ? 0 : 1 );
  float ae = max( b1, b2 );
  vec2 w = clamp( ( vec2( am, ae ) - 0.5773 ) / ( 1.0 - 0.5773 ), 0.0, 1.0 ); w = w * w * w * w; w.x = max( w.x, 1.0e-4 ); w /= w.x + w.y;
  vec4 c1, s1, c2, s2; vec3 n1, n2;
  isleSide( ma, layer, side, dpx, dpy, n0, c1, s1, n1 );
  if ( w.y > 0.01 ) { isleSide( me, layer, side, dpx, dpy, n0, c2, s2, n2 ); } else { c2 = c1; s2 = s1; n2 = n1; }
  col = c1 * w.x + c2 * w.y; srf = s1 * w.x + s2 * w.y;
  nw = normalize( n1 * w.x + n2 * w.y + n0 * 1.0e-4 );
}
// one surface as it is seen at this distance: its own scale near the eye, the larger one past 60 m (both between 25
// and 60 m); steep, from its two sides; the cliffs' large-scale face over the close rock from 80 to 350 m
void isleLayer( int i, float dist, vec3 dpx, vec3 dpy, vec3 n0, bool steep, out vec4 col, out vec4 srf, out vec3 nw ) {
  #ifdef ISLE_NO_COARSE
  float layer = float( i ), far = 0.0;
  #else
  float layer = float( i ), far = ${lite ? '0.0' : 'smoothstep( 34.0, 50.0, dist )'};
  #endif
  vec4 c1 = vec4( 0.0 ), s1 = vec4( 0.0 ), c2 = vec4( 0.0 ), s2 = vec4( 0.0 ); vec3 n1 = n0, n2 = n0;
  vec4 P = uIsleLayer[ i ];
  ${lite ? 'isleTop( layer, P.x, dpx.xz, dpy.xz, n0, col, srf, nw );' : `
  // only the rock, the cliffs and the shore are read from their sides (grass and litter do not hold to a cliff)
  steep = steep && ( i == ${ROCK} || i == ${CLIFF} || i == ${LAYERS.indexOf('shore')} );
  if ( steep ) {
    if ( far < 0.999 ) isleTwo( layer, P.x, dpx, dpy, n0, c1, s1, n1 );
    if ( far > 0.001 ) isleTwo( layer, P.y, dpx, dpy, n0, c2, s2, n2 );
  } else {
    if ( far < 0.999 ) isleTop( layer, P.x, dpx.xz, dpy.xz, n0, c1, s1, n1 );
    if ( far > 0.001 ) isleTop( layer, P.y, dpx.xz, dpy.xz, n0, c2, s2, n2 );
  }
  col = mix( c1, c2, far ); srf = mix( s1, s2, far ); nw = normalize( mix( n1, n2, far ) );
  #ifndef ISLE_NO_FACE
  if ( ( i == ${CLIFF} || i == ${ROCK} ) && dist > 80.0 ) {
    float k = smoothstep( 80.0, 350.0, dist ) * ( i == ${CLIFF} ? 0.85 : 0.6 );
    vec4 cf, sf; vec3 nf;
    float fs = uIsleLayer[ ${FACE} ].x;
    if ( steep ) isleTwo( ${FACE}.0, fs, dpx, dpy, n0, cf, sf, nf ); else isleTop( ${FACE}.0, fs, dpx.xz, dpy.xz, n0, cf, sf, nf );
    col = vec4( mix( col.rgb, cf.rgb, k ), mix( col.a, cf.a, k * 0.5 ) ); srf = mix( srf, sf, k ); nw = normalize( mix( nw, nf, k ) );
  }
  #endif`}
}
// the forest's canopy, where the palms are not drawn: crowns six or seven metres across, each a dome, a little
// different in its green, the dark of the understorey between them. Each crown's middle stands in the middle half of
// its cell, so the four cells round a point hold its nearest
void isleCanopy( vec2 p, float px, vec3 n0, out vec3 col, out vec3 nw ) {
  vec2 q = p / 6.5 - 0.5, c = floor( q ), f = q - c, best = vec2( 0.0 ); float d1 = 9.0, id = 0.0;
  for ( int j = 0; j <= 1; j ++ ) for ( int i = 0; i <= 1; i ++ ) {
    vec2 o = vec2( float( i ), float( j ) ), r = o + 0.25 + 0.5 * gh2( c + o ) - f; float d = dot( r, r );
    if ( d < d1 ) { d1 = d; best = r; id = gh( c + o + 17.0 ); }
  }
  float rad = 0.5 + 0.2 * id, u = sqrt( d1 ) / rad, crown = 1.0 - smoothstep( 0.86, 1.04, u );
  vec2 out2 = -best / rad;
  vec3 dome = normalize( vec3( out2.x * 1.15, sqrt( max( 0.04, 1.0 - u * u ) ), out2.y * 1.15 ) );
  vec3 green = mix( vec3( 0.030, 0.072, 0.018 ), vec3( 0.050, 0.090, 0.024 ), id );
  col = mix( vec3( 0.012, 0.022, 0.008 ), green, crown );
  // far off, the pattern under a pixel is its mean: the crowns' and the gaps' colour, the land's own normal
  float fade = smoothstep( 1.2, 3.5, px );
  col = mix( col, vec3( 0.032, 0.068, 0.018 ), fade );
  nw = normalize( mix( mix( n0, dome, crown * 0.9 ), n0, fade ) );
}
`,
    // the splat: in place of three's vertex colour (it sets diffuseColor), with what the later chunks need kept in isle*
    body: `
#if defined( ISLE_BARE ) || defined( ISLE_BARE_TEX )
vec3 isleN0 = normalize( vWN ), isleNw = isleN0; float isleRough = 0.85, isleOcc = 1.0;
#ifdef ISLE_BARE_TEX
vec4 bc, bs; vec3 bn; isleTop( 2.0, 2.3, dFdx( vW ).xz, dFdy( vW ).xz, isleN0, bc, bs, bn ); diffuseColor.rgb = bc.rgb; isleNw = bn; isleRough = bs.b; isleOcc = bs.a;
#else
diffuseColor.rgb = vec3( 0.1, 0.075, 0.045 );
#endif
#else
vec3 isleN0 = normalize( vWN );
vec3 isleDpx = dFdx( vW ), isleDpy = dFdy( vW );
float isleDist = length( vW - cameraPosition ), islePx = max( length( isleDpx ), length( isleDpy ) );
float isleH = vW.y;
isleFar = isleDist > 140.0;
float isleNy = clamp( isleN0.y, 0.03, 1.0 ), isleSlope = sqrt( 1.0 - isleNy * isleNy ) / isleNy;
// the control texture: life.js's cover noise, the slow variation, the lagoon's patches, the edge's jitter
vec4 isleCtl = texture2D( uIsleCtl, ( ( vW.xz - uIsleGrid.xy ) / uIsleGrid.z * uIsleLook.z + 0.5 ) / ( ( uIsleN - 1.0 ) * uIsleLook.z + 1.0 ) );
// a finer jitter for edges, near the eye only (further off it is under a pixel)
float isleE2 = isleDist < 60.0 ? gn( vW.xz * 0.43 + 7.0 ) : 0.5;
float isleBeach = 2.9 + 0.9 * ( isleCtl.a - 0.5 ) + 0.3 * ( isleE2 - 0.5 );
// (each class's own band is narrow, a few metres on the ground: the two surfaces' heights shape the edge within it)
float wCliff = smoothstep( 0.92, 0.99, isleSlope + 0.12 * ( isleE2 - 0.5 ) );
float wRockS = smoothstep( 0.74, 0.83, isleSlope + 0.1 * ( isleCtl.a - 0.5 ) );
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
// the two it is most made of (the second less the third, so nothing jumps where they change places), taken one by one
int isleA = 0, isleB = 1; float isleWa = -1.0, isleWb = -1.0, isleWc = 0.0;
#define ISLE_TAKE( w, k ) if ( w > isleWa ) { isleWc = isleWb; isleWb = isleWa; isleB = isleA; isleWa = w; isleA = k; } else if ( w > isleWb ) { isleWc = isleWb; isleWb = w; isleB = k; } else if ( w > isleWc ) isleWc = w;
ISLE_TAKE( wSand, 0 ) ISLE_TAKE( wGrass, 1 ) ISLE_TAKE( wLitter, 2 ) ISLE_TAKE( wRock, 3 ) ISLE_TAKE( wCliff, 4 ) ISLE_TAKE( wShore, 5 )
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
if ( isleWb > 0.02 ) {
  // the second, as finely as it can be seen: whole within 60 m, its colour and height to 250 m, its mean beyond
  if ( isleDist < 250.0 ) {
    bool keep = isleFar; isleFar = isleDist > 60.0;
    isleLayer( isleB, isleDist, isleDpx, isleDpy, isleN0, isleSteep, isleColB, isleSrfB, isleNB );
    isleFar = keep;
  } else { isleColB = vec4( uIsleMean[ isleB ], 0.5 ); isleSrfB = isleSrfA; isleNB = isleNA; }
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
float isleRough = mix( 0.85, isleSrf.b, uIsleLook.x ), isleOcc = mix( 1.0, isleSrf.a, uIsleLook.x );
// a slow variation over all of it (one colour of grass is not a lawn), and the moss of Gower's mist forest
isleAlb *= 0.84 + 0.32 * isleCtl.g;
float isleMoss = smoothstep( 600.0, 690.0, isleH ) * ( 1.0 - wCliff * 0.6 );
isleAlb = mix( isleAlb, isleAlb * vec3( 0.55, 1.05, 0.5 ) + vec3( 0.004, 0.012, 0.002 ), isleMoss * 0.85 );
// the forest beyond the palms: its canopy, the crowns lit as domes
float isleCrowns = wLitter * smoothstep( ${(PALM.near - 40).toFixed(1)}, ${(PALM.near - 5).toFixed(1)}, length( vW.xz - uIsleBody.xz ) + 25.0 * ( isleCtl.a - 0.5 ) ) * ( 1.0 - isleSea );
#ifdef ISLE_NO_CANOPY
isleCrowns = 0.0;
#endif
if ( isleCrowns > 0.001 ) {
  vec3 cc, cn; isleCanopy( vW.xz, islePx, isleN0, cc, cn );
  isleAlb = mix( isleAlb, cc, isleCrowns ); isleNw = normalize( mix( isleNw, cn, isleCrowns ) ); isleRough = mix( isleRough, 0.8, isleCrowns ); isleOcc = mix( isleOcc, 1.0, isleCrowns );
}
// the wet strip, where the swash has reached (a line that wanders about 0.35 m over the sea), and the spray on low rock:
// darker by how porous it is, smooth and glossy, the water filling its small relief
float isleWetLine = 0.35 + 0.45 * ( isleCtl.a - 0.5 ) + 0.18 * ( isleE2 - 0.5 );
float isleWet = max( smoothstep( isleWetLine + 0.3, isleWetLine - 0.12, isleH ), isleSea );
isleWet = max( isleWet, ( wCliff + wRock + wShore ) * smoothstep( 2.6, 0.4, isleH ) * 0.85 );
float isleWetK = mix( uIsleLayer[ isleB ].z, uIsleLayer[ isleA ].z, isleK );
isleAlb *= mix( 1.0, isleWetK, isleWet );
isleAlb = mix( isleAlb, isleAlb * isleAlb / max( dot( isleAlb, vec3( 0.333 ) ), 1.0e-4 ), isleWet * 0.25 );     // a little deeper in colour
isleRough = mix( isleRough, mix( 0.34, 0.1, smoothstep( isleWetLine, isleWetLine - 0.4, isleH ) ), isleWet );
isleNw = normalize( mix( isleNw, isleN0, isleWet * 0.75 ) );
#ifdef ISLE_FLAT
// a building's pad: packed earth, eased into what was there
isleAlb = mix( isleAlb, vec3( 0.16, 0.115, 0.07 ) * ( 0.75 + 0.5 * isleE2 ), vEarth );
isleRough = mix( isleRough, 0.9, vEarth );
#endif
// the lagoon's floor, darker with depth (the sea over it is drawn by island.js, its own colour over this)
isleAlb *= mix( 1.0, 0.38, smoothstep( 0.0, 16.0, -isleH ) * isleSea ) * mix( vec3( 1.0 ), vec3( 0.86, 0.97, 1.0 ), isleSea );
diffuseColor.rgb = isleAlb * uIsleLook.y;
#endif
#ifdef ISLE_FLATCOL
diffuseColor.rgb = vec3( 0.2 ); isleNw = isleN0;
#endif
`,
    rough: 'float roughnessFactor = isleRough;',
    normal: 'normal = normalize( ( viewMatrix * vec4( isleNw, 0.0 ) ).xyz );',
    // the sky's share at this point (the land round it) and the scan's own occlusion, on what the sky and the wrapped
    // sky give (three's aomap chunk, by these numbers)
    ao: `
float isleSkySeen = texture2D( uIsleSky, ( ( vW.xz - uIsleGrid.xy ) / uIsleGrid.z + 0.5 ) / uIsleN ).r;
float ambientOcclusion = isleOcc * mix( 1.0, isleSkySeen, uIsleGrid.w );
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif`,
  };
}

// a probe's shader switches (material defines, which three folds into the program's key), to measure what each part costs
const VARIANT = { defines: {} };
// The land's material and the levelled ground's, made from a MeshStandardMaterial island.js hands in; `cut`: island.js's
// own lines (the levelled ground's cut: its uniforms, its declarations and its body, run before the splat)
function landMaterial(base, { lite, flat, uniforms, cut = null }) {
  const m = base, f = landFrag({ lite });
  const loop = THREE.ShaderChunk.lights_fragment_begin.replace(DIR_LOOP, ISLE_LOOP);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, SHARED, cut?.uniforms || {});
    sh.vertexShader = (flat ? '#define ISLE_FLAT\n' : '') + sh.vertexShader.replace('#include <common>', '#include <common>\n' + LAND_VERT_PARS)
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n' + LAND_NORMAL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + LAND_PLACE);
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + f.pars + (cut?.pars || ''))
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + LIGHT_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (cut?.body || '') + f.body)
      .replace('#include <roughnessmap_fragment>', f.rough)
      .replace('#include <normal_fragment_maps>', f.normal)
      .replace('#include <aomap_fragment>', f.ao)
      .replace('#include <lights_fragment_begin>', loop);
    // the land's own height over the ground is 0 (its fragments are the grid's triangles); the levelled ground's is not
    sh.fragmentShader = (flat ? '#define ISLE_FLAT\n#define ISLE_OVER -1.0e9\n' : '#define ISLE_OVER 0.0\n') + fs;
  };
  m.customProgramCacheKey = () => `isle-land|${lite ? 1 : 0}|${flat ? 1 : 0}`;
  ADOPTED.add(m);
  m.needsUpdate = true;
  return m;
}

// createGroundLook({ renderer, lite, phone, ground, scene }): the land's materials (`land`, `flat`), the passes and the
// shadow maps. update({ camera, dir, body }) once a frame (dir: toward the key light) draws the shadow maps; adoptAll
// (scene) makes whatever lit thing has come into the scene take the shadows; read() is the probes' numbers.
export function createGroundLook({ renderer, lite = false, phone = false, ground, scene }) {
  const head = ground.head, W = head.w, H = head.h, S = head.spacing;
  const C = lite ? CASCADES.lite : CASCADES, nC = C.far.length, per = lite || phone ? CONTROL.lite : CONTROL.per;
  const canDraw = (() => { try { return !!renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')); } catch { return false; } })();
  const disposables = [];
  // the heights, as they are (texel by texel), and as half floats the GPU blends between (the sky's share)
  const ht = new THREE.DataTexture(ground.hts.main, W, H, THREE.RedFormat, THREE.FloatType);
  ht.magFilter = ht.minFilter = THREE.NearestFilter; ht.generateMipmaps = false; ht.needsUpdate = true;
  const hf = new THREE.DataTexture(Uint16Array.from(ground.hts.main, (x) => THREE.DataUtils.toHalfFloat(x)), W, H, THREE.RedFormat, THREE.HalfFloatType);
  hf.magFilter = hf.minFilter = THREE.LinearFilter; hf.wrapS = hf.wrapT = THREE.ClampToEdgeWrapping; hf.generateMipmaps = false; hf.needsUpdate = true;
  disposables.push(ht, hf);
  let top = 0; for (const v of ground.hts.main) if (v > top) top = v;
  const rt = (w, h, type, format) => new THREE.WebGLRenderTarget(w, h, { type, format, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
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
    return { size, far, target, depth, cam, frame: 0 };
  });
  // each slice's bounding sphere (its radius is fixed while the view's angle is: the map does not swim as the eye turns)
  const sphere = (n, f, k) => { let c = ((f + n) * (1 + k * k)) / 2; if (c > f) c = f; return { c, r: Math.hypot(f - c, f * k) }; };
  const RIGHT = new THREE.Vector3(), UPV = new THREE.Vector3(), Z = new THREE.Vector3(), CEN = new THREE.Vector3(), FWD = new THREE.Vector3(), UP0 = new THREE.Vector3();
  let frameNo = 0;
  function drawMaps(camera, dir) {
    const ty = Math.tan((camera.fov * Math.PI) / 360), tx = ty * camera.aspect, k = Math.hypot(tx, ty);
    Z.copy(dir).normalize();
    UP0.set(0, 1, 0); if (Math.abs(Z.y) > 0.995) UP0.set(0, 0, 1);
    RIGHT.crossVectors(UP0, Z).normalize(); UPV.crossVectors(Z, RIGHT);
    camera.getWorldDirection(FWD);
    const was = renderer.getRenderTarget(), override = scene.overrideMaterial, bg = scene.background, auto = renderer.autoClear;
    scene.overrideMaterial = depthMat; scene.background = null; renderer.autoClear = true;
    let near = 0.1; frameNo += 1;
    cascades.forEach((c, i) => {
      const { c: mid, r } = sphere(near, c.far, k), texel = (2 * r) / c.size;
      CEN.copy(camera.position).addScaledVector(FWD, mid);
      // stepped by whole texels across the light, so a still shadow stays still as the eye moves
      const a = CEN.dot(RIGHT), b = CEN.dot(UPV);
      CEN.addScaledVector(RIGHT, Math.round(a / texel) * texel - a).addScaledVector(UPV, Math.round(b / texel) * texel - b);
      const cam = c.cam, depthRange = 2 * r + CASCADES.margin;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.1; cam.far = depthRange; cam.up.copy(UP0);
      cam.position.copy(CEN).addScaledVector(Z, r + CASCADES.margin); cam.lookAt(CEN); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      SHARED.uIsleShadeM.value[i].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      SHARED.uIsleShadeO.value.setComponent(i, 1.5 * texel); SHARED.uIsleShadeT.value.setComponent(i, 1 / c.size); SHARED.uIsleShadeZ.value.setComponent(i, 0.02 / depthRange);
      // the furthest map is drawn every other frame (its texels are 40 cm: half a frame's lag at a run is a tenth of one)
      if (api.debug.shadows && (i < 2 || frameNo % 2 === 0 || !c.drawn)) {
        renderer.setRenderTarget(c.target); renderer.clear(false, true, false); renderer.render(scene, cam); c.drawn = true;
      }
      near = c.far;
    });
    scene.overrideMaterial = override; scene.background = bg; renderer.autoClear = auto; renderer.setRenderTarget(was);
    SHARED.uIsleSplit.value.set(C.far[0], C.far[1] ?? 1e9, C.far[2] ?? 1e9, api.debug.shadows ? nC : 0);
    SHARED.uIsleShade0.value = cascades[0].depth; SHARED.uIsleShade1.value = cascades[1]?.depth || null; SHARED.uIsleShade2.value = cascades[2]?.depth || null;
  }

  // ---- the land's materials
  const [col0, surf0] = standIns(); disposables.push(col0, surf0);
  const uniforms = { uIsleCol: { value: col0 }, uIsleSurf: { value: surf0 }, uIsleSky: { value: skyRT ? skyRT.texture : null }, uIsleCtl: { value: ctlRT.texture },
    uIsleLayer: { value: LAYERS.map((_, i) => new THREE.Vector4(FINE[i], COARSE[i], WET[i], RISE[i])) }, uIsleMean: { value: MEAN.map((m) => new THREE.Vector3(...m)) },
    uIsleLook: { value: new THREE.Vector4(0, 1, per, 0) }, uIsleBody: { value: new THREE.Vector3(1e6, 0, 1e6) } };
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
    parts: { scene, cascades, renderer, uniforms },
    // the land's own material from island.js's (its flats' cut runs first), and the levelled ground's
    land: (base, cut) => { const m = landMaterial(base, { lite, flat: false, uniforms, cut }); landRefs.push(m); return m; },
    flat: (base, cut) => { const m = landMaterial(base, { lite, flat: true, uniforms, cut }); landRefs.push(m); return m; },
    // the present light raises the land's colours (island.js says why)
    set paint(k) { uniforms.uIsleLook.value.y = k; },
    get paint() { return uniforms.uIsleLook.value.y; },
    // every lit, solid thing in the scene takes the shadows; what is not the land casts them (into the maps' layer)
    adoptAll(sc) {
      sc.traverse((o) => {
        if (!o.isMesh || o.userData.isleShadow === false || o.userData.isleSeen) return;
        const m = o.material, list = Array.isArray(m) ? m : [m];
        let lit = false;
        for (const x of list) { if (x && (x.isMeshStandardMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial || x.isMeshToonMaterial) && !x.transparent && x.blending === THREE.NormalBlending) { adopt(x); lit = true; } }
        if (!lit) return;
        o.userData.isleSeen = true; o.receiveShadow = true;
        if (!o.userData.isleLand) o.layers.enable(CASCADES.layer);
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
    read: () => ({ maps: mapsState, which, mapsMs: Math.round(mapsAt), fade, canDraw, cascades: C.far, sizes: C.size, control: [cw, ch], times: { ...times }, lines: linesFor ? linesFor.toArray().map((v) => +v.toFixed(4)) : null }),
    // the probes' handles: the land's lines and the sky's share as the GPU made them (in metres; 0..1)
    peek(i, j) {
      const out = {};
      if (lineRT[shown]) { const p = new Uint16Array(4); renderer.readRenderTargetPixels(lineRT[shown], i, j, 1, 1, p); out.lines = [THREE.DataUtils.fromHalfFloat(p[0]), THREE.DataUtils.fromHalfFloat(p[1])]; }
      if (skyRT) { const p = new Uint8Array(4); renderer.readRenderTargetPixels(skyRT, i, j, 1, 1, p); out.sky = p[0] / 255; }
      return out;
    },
    dispose() {
      mapsState = 'gone';
      // only the island that last held SHARED lets it go (a plainer island made before this one was let go holds it now)
      if (owner === api || !owner) {
        owner = null; SHARED.uIsleOn.value = 0; SHARED.uIsleGrid.value.w = 0; SHARED.uIsleLines.value = null; SHARED.uIsleHt.value = null;
        SHARED.uIsleSplit.value.w = 0; SHARED.uIsleShade0.value = SHARED.uIsleShade1.value = SHARED.uIsleShade2.value = null;
      }
      for (const x of disposables) x.dispose();
    },
  };
  return api;
}
