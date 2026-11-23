// water.js — THE SEA ROUND THE ISLAND, MOVING (three.js), from sea.js's numbers. What it makes, and what terrain.js and
// island.js draw with it:
//   · THE WIND'S SEA, each frame: Tessendorf's spectrum turned to its height, its lean and its slopes by inverse FFTs on
//     the GPU (Stockham's radix 2: a spectrum pass, seven passes along the rows and seven down the columns, for the three
//     bands at once, side by side), then each band's own two textures: what moves the water's surface (its lean, height
//     and the Jacobian, where the lean folds it and it whitens) and what shades it (its slope and the slope's square,
//     with their smaller levels: a pixel far off reads the mean slope and how much the slopes it covers spread, which is
//     what spreads the Sun's glitter into a path). Without float targets (and on the lighter path) one band of it, made
//     once on the CPU, slid two ways across itself.
//   · THE SEA'S MAP (sea.js seaMap): how far each point is outside the reef's crest or the shore, the swell's phase
//     there, how far it is from dry land and how square it faces the swell; made once as the island opens.
//   · THE SWELL, nine long waves, and the time, handed to the shaders each frame.
// The shaders that read these are in SEA_WAVES_GLSL (below) and terrain.js (the sea's own material: the lagoon's floor
// seen through the water and the water's surface over it, in one drawing).
import * as THREE from 'three';
import { SEA, SWELL, SEA_FLOOR, startingSea, shoreTables, SHORE, seaMap, coxMunk, inverseFFT, toward } from './sea.js';
import { DROPS, RIPPLE_SPEED, RING } from '../rings.js';

const f = (x) => { const s = Number(x).toPrecision(8); return /[.e]/.test(s) ? s : s + '.0'; };
const QUAD_VERT = 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const CMUL = 'vec2 cmul( vec2 a, vec2 b ) { return vec2( a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x ); }';
// THE SPECTRUM AT TIME T, and what the FFTs need of it, as four complex numbers a texel (two real fields packed in each:
// A + iB, whose transform's real part is a and imaginary part b): the height and its slope along x; its slope along z
// and the lean along x; the lean along z and its change along x; the lean's change along z and across. Each wave moves
// as h0(k) e^{-i w t} + conj(h0(-k)) e^{i w t}, w held to whole turns in SEA.loop (sea.js looped)
const SPECTRUM_FRAG = `
uniform highp sampler2D uH0; uniform vec3 uL; uniform float uT; uniform float uW0;
layout( location = 0 ) out highp vec4 o0; layout( location = 1 ) out highp vec4 o1;
${CMUL}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy ); int c = p.x / ${SEA.N}, i = p.x - c * ${SEA.N}, j = p.y;
  float L = c == 0 ? uL.x : c == 1 ? uL.y : uL.z;
  vec2 k = vec2( float( i < ${SEA.N / 2} ? i : i - ${SEA.N} ), float( j < ${SEA.N / 2} ? j : j - ${SEA.N} ) ) * ( 6.28318530718 / L );
  float kl = length( k ), w = sqrt( 9.81 * kl + ${f(7.2e-5)} * kl * kl * kl );
  w = max( 1.0, floor( w / uW0 + 0.5 ) ) * uW0;
  vec4 h0 = texelFetch( uH0, p, 0 );
  float ph = w * uT; vec2 e = vec2( cos( ph ), sin( ph ) );
  vec2 h = cmul( h0.xy, vec2( e.x, -e.y ) ) + cmul( h0.zw, e );
  float ik = kl > 1.0e-6 ? 1.0 / kl : 0.0;
  vec2 ih = vec2( -h.y, h.x );                                       // i h
  vec2 hx = k.x * ih, hz = k.y * ih;                                 // the slopes: i k h
  vec2 dx = k.x * ik * ih, dz = k.y * ik * ih;                       // the lean: i (k / |k|) h (toward the crests: Gerstner's way)
  vec2 dxx = -k.x * k.x * ik * h, dzz = -k.y * k.y * ik * h, dxz = -k.x * k.y * ik * h;
  o0 = vec4( h.x - hx.y, h.y + hx.x, hz.x - dx.y, hz.y + dx.x );
  o1 = vec4( dz.x - dxx.y, dz.y + dxx.x, dzz.x - dxz.y, dzz.y + dxz.x );
}`;
// ONE STAGE OF THE INVERSE FFT (sea.js stockhamStage, the same lines): along the rows within each band (uDir 0), or
// down the columns (1); two textures of two complex numbers each
const FFT_FRAG = `
uniform highp sampler2D uI0; uniform highp sampler2D uI1; uniform int uNs; uniform int uDir;
layout( location = 0 ) out highp vec4 o0; layout( location = 1 ) out highp vec4 o1;
${CMUL}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy ); const int N = ${SEA.N};
  int o = uDir == 0 ? p.x - ( p.x / N ) * N : p.y, base = uDir == 0 ? p.x - o : 0;
  int r = ( o - ( o / ( 2 * uNs ) ) * 2 * uNs ) >= uNs ? 1 : 0, m = o - ( o / uNs ) * uNs, j = ( o / ( 2 * uNs ) ) * uNs + m;
  float a = 6.28318530718 * float( m ) / float( 2 * uNs ); vec2 tw = vec2( cos( a ), sin( a ) );
  ivec2 pa = uDir == 0 ? ivec2( base + j, p.y ) : ivec2( p.x, j ), pb = uDir == 0 ? ivec2( base + j + N / 2, p.y ) : ivec2( p.x, j + N / 2 );
  vec4 a0 = texelFetch( uI0, pa, 0 ), b0 = texelFetch( uI0, pb, 0 ), a1 = texelFetch( uI1, pa, 0 ), b1 = texelFetch( uI1, pb, 0 );
  vec4 t0 = vec4( cmul( b0.xy, tw ), cmul( b0.zw, tw ) ), t1 = vec4( cmul( b1.xy, tw ), cmul( b1.zw, tw ) );
  float s = r == 0 ? 1.0 : -1.0;
  o0 = a0 + s * t0; o1 = a1 + s * t1;
}`;
// EACH BAND'S OWN TEXTURES: A, what moves the surface (lean x, height, lean z, the Jacobian: under about 0.3 the lean has
// crowded the surface into a fold, a breaking crest); B, what shades it (the slope of the moved surface over its own
// ground, its square, the Jacobian)
const ASSEMBLE_FRAG = `
uniform highp sampler2D uI0; uniform highp sampler2D uI1; uniform int uC; uniform float uChop;
layout( location = 0 ) out highp vec4 oA; layout( location = 1 ) out highp vec4 oB;
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy ), q = ivec2( uC * ${SEA.N} + p.x, p.y );
  vec4 f0 = texelFetch( uI0, q, 0 ), f1 = texelFetch( uI1, q, 0 );
  float jxx = 1.0 + uChop * f1.y, jzz = 1.0 + uChop * f1.z, jxz = uChop * f1.w, J = jxx * jzz - jxz * jxz, Jc = max( J, 0.15 );
  vec2 s = vec2( jzz * f0.y - jxz * f0.z, jxx * f0.z - jxz * f0.y ) / Jc;
  oA = vec4( uChop * f0.w, f0.x, uChop * f1.x, J );
  oB = vec4( s, dot( s, s ), J );
}`;

// what the shaders read: the bands' textures, the sea's map, the swell, the time
export const SEA_WAVES_GLSL = `
uniform sampler2D uSeaA0; uniform sampler2D uSeaA1; uniform sampler2D uSeaB0; uniform sampler2D uSeaB1; uniform sampler2D uSeaB2; uniform sampler2D uSeaMap;
uniform vec3 uSeaL;          // each band's square (m)
uniform vec4 uSeaGrid;       // the map's first point (x, z), its spacing (m), and 1 where the bands are drawn on the GPU
uniform vec2 uSeaN;          // the map's points across and down
uniform vec4 uSeaSwell[ ${SWELL.length} ];   // each long wave: its wavenumber along x and z, its phase, its height
uniform vec4 uSeaClock;      // the time (s, held within SEA.loop), the shore swell's frequency, its height in deep water, the slope's spread finer than the last band
uniform vec4 uSeaSlide;      // the lighter path: where its one band has slid to (two ways, m)
uniform float uSeaDebug;     // a probe's view of one part (0: as drawn)
// the sea's map at a point (how far outside the crest, the swell's phase, how far from dry land, how square it faces the
// swell); off the island's grid, the open sea
vec4 seaMapAt( vec2 xz ) {
  vec2 g = ( xz - uSeaGrid.xy ) / uSeaGrid.z;
  if ( any( lessThan( g, vec2( 0.0 ) ) ) || any( greaterThan( g, uSeaN - 1.0 ) ) ) return vec4( 4000.0, 0.0, 4000.0, 0.6 );
  return texture( uSeaMap, ( g + 0.5 ) / uSeaN );
}
// the swell over open water at a point: how far it moves the surface (x, up, z), and its slope
vec3 seaSwell( vec2 xz, out vec2 slope ) {
  vec3 d = vec3( 0.0 ); slope = vec2( 0.0 );
  for ( int i = 0; i < ${SWELL.length}; i ++ ) {
    vec4 w = uSeaSwell[ i ]; float k = length( w.xy ), p = dot( w.xy, xz ) - sqrt( 9.81 * k ) * uSeaClock.x + w.z, c = cos( p ), s = sin( p );
    d.y += w.w * c; d.xz -= ( w.w / k ) * w.xy * s; slope -= w.w * w.xy * s;
  }
  return d;
}
// the slope of the wind's sea at a point, its spread within the pixel (the bands' smaller levels), and the Jacobian: each
// band weighted (the lagoon's short fetch, the open sea's long one), read at the scale the pixel covers (dx, dy: the
// point's change across the pixel)
vec4 seaSlope( vec2 xz, vec2 dx, vec2 dy, vec3 wt, out float spread ) {
  vec4 b; vec2 s = vec2( 0.0 ); float ss = 0.0, J = 1.0;
  #ifdef SEA_FFT
  if ( wt.x > 0.001 ) { b = textureGrad( uSeaB0, xz / uSeaL.x, dx / uSeaL.x, dy / uSeaL.x ); s += wt.x * b.xy; ss += wt.x * wt.x * max( b.z - dot( b.xy, b.xy ), 0.0 ); J = min( J, mix( 1.0, b.w, wt.x ) ); }
  b = textureGrad( uSeaB1, xz / uSeaL.y, dx / uSeaL.y, dy / uSeaL.y ); s += wt.y * b.xy; ss += wt.y * wt.y * max( b.z - dot( b.xy, b.xy ), 0.0 ); J = min( J, mix( 1.0, b.w, wt.y ) );
  b = textureGrad( uSeaB2, xz / uSeaL.z, dx / uSeaL.z, dy / uSeaL.z ); s += wt.z * b.xy; ss += wt.z * wt.z * max( b.z - dot( b.xy, b.xy ), 0.0 );
  #else
  // one band, made once, slid two ways across itself (the lighter path)
  b = textureGrad( uSeaB1, ( xz + uSeaSlide.xy ) / uSeaL.y, dx / uSeaL.y, dy / uSeaL.y ); s += 0.7 * wt.y * b.xy; ss += 0.5 * wt.y * wt.y * max( b.z - dot( b.xy, b.xy ), 0.0 );
  b = textureGrad( uSeaB1, ( xz.yx * vec2( -1.0, 1.0 ) + uSeaSlide.zw ) / ( 0.37 * uSeaL.y ), dx.yx / ( 0.37 * uSeaL.y ), dy.yx / ( 0.37 * uSeaL.y ) ); s += 0.45 * wt.z * vec2( b.y, -b.x ); ss += 0.2 * wt.z * wt.z * max( b.z - dot( b.xy, b.xy ), 0.0 );
  #endif
  spread = ss + uSeaClock.w * wt.z;
  return vec4( s, J, 0.0 );
}`;

// THE SURFACE, for terrain.js's sea material and the land's swash (after SEA_OPTICS_GLSL, SEA_WAVES_GLSL and terrain.js's
// GRID_GLSL and NOISE_GLSL): the floor under a point, the swell as it meets the reef, the rings, the swash, the foam's
// lace, the key light's glitter
export const SEA_SURFACE_GLSL = `
uniform vec3 uSeaE;          // the light falling on level water: lux in three colours times the exposure (the picture's units)
uniform vec4 uSeaLight;      // x: that light's cosine under the water (the Sun's beam and the sky's light as they share it); y: the glitter's scale (1 under the true sky; the present sky's painted Sun is brighter than its light)
uniform vec4 uDrops[ ${DROPS} ];
// the floor under a point (m): the island's grid, else the shelf beyond it
float seaGround( vec2 xz ) {
  vec2 g = ( xz - uIsleGrid.xy ) / uIsleGrid.z;
  if ( any( lessThan( g, vec2( 0.0 ) ) ) || any( greaterThan( g, uIsleN - 1.0 ) ) ) return ${f(SEA_FLOOR)};
  return isleGround( uIsleHt, uIsleN, g );
}
// THE SWELL AT THE REEF (sea.js): where the map says a point is m (how far outside the crest, the phase reached there,
// how far from dry land, how square it faces the swell), over water d deep: how high the surface stands (m), its slope,
// and the white water on it. It grows as the water shoals (the root of the group speeds, from J. D. Fenton and W. D.
// McKee's explicit dispersion), breaks where it would stand over 0.78 of the depth and from there in is held to that (a
// bore, lower as it runs into the lagoon), its crest sharpening as it nears breaking (Stokes' second harmonic). Its sets
// come as a slow swing drifting along the reef; each stretch of reef a little out of step with the next.
float seaShore( vec2 xz, vec4 m, float d, out vec2 slope, out float white ) {
  slope = vec2( 0.0 ); white = 0.0;
  if ( m.x > 900.0 || m.x < -600.0 ) return 0.0;
  float w = uSeaClock.y, t = uSeaClock.x;
  vec2 g = vec2( seaMapAt( xz + vec2( 6.0, 0.0 ) ).x - m.x, seaMapAt( xz + vec2( 0.0, 6.0 ) ).x - m.x );
  g /= max( length( g ), 1.0e-4 );
  float along = dot( xz, vec2( -g.y, g.x ) );
  float group = 0.62 + 0.38 * sin( 6.2831853 * t / 84.0 + along * 0.0021 + 2.0 * gn( xz * 0.0011 ) );
  float H0 = 2.0 * uSeaClock.z * group * m.w;
  float dd = max( d, 0.05 ), k0 = w * w / 9.81, kd = k0 * dd * pow( 1.0 / tanh( pow( k0 * dd, 0.75 ) ), 0.66667 );
  float cg = ( w * dd / kd ) * ( 0.5 + kd / sinh( min( 2.0 * kd, 60.0 ) ) ), Hh = H0 * sqrt( 9.81 / ( 2.0 * w ) / cg ), br = Hh / ( ${f(SEA.breaker)} * dd );
  float Hb = m.x < 0.0 ? ${f(SEA.breaker)} * 0.35 * group * exp( m.x / 90.0 ) : min( Hh, ${f(SEA.breaker)} * dd );
  float th = m.y + w * t + 0.7 * gn( vec2( along * 0.004, 3.0 ) ), u = fract( th / 6.2831853 );
  float a = 0.5 * Hb, c = cos( th ), sn = sin( th ), steep = clamp( ( br - 0.55 ) / 0.45, 0.0, 1.0 );
  slope = g * ( a * kd / dd * -sn * ( 1.0 + 0.9 * steep * c ) );
  // the white water: the lip where it breaks, the bore behind each broken crest (most just behind it), what is left
  // between the waves; into the lagoon it thins out over a hundred metres or so
  float broken = m.x < 0.0 ? 1.0 : smoothstep( 0.92, 1.12, br );
  float lip = smoothstep( 0.8, 0.98, u ) * smoothstep( 0.85, 1.05, br ) * ( 1.0 - smoothstep( 1.25, 1.7, br ) ) * step( 0.0, m.x );
  float churn = 0.35 * smoothstep( -90.0, -10.0, m.x ) * smoothstep( 20.0, -5.0, m.x );
  white = ( broken * ( exp( -u * 2.6 ) + 0.18 + churn ) + lip ) * ( m.x < 0.0 ? exp( m.x / 170.0 ) : 1.0 ) * smoothstep( 0.0, 0.25, H0 );
  return a * ( c + 0.45 * steep * ( c * c - 0.5 ) );
}
// the rings a body makes (rings.js ring(), the slope of the sum of them)
vec2 seaRipples( vec2 p ) {
  vec2 grad = vec2( 0.0 );
  for ( int i = 0; i < ${DROPS}; i ++ ) {
    vec4 d = uDrops[ i ]; float age = uSeaClock.x - d.z;
    if ( age < 0.0 || age > ${f(RING.oldest)} ) continue;
    vec2 q = p - d.xy; float r = length( q ), s = r - ${f(RIPPLE_SPEED * 2)} * age;
    if ( abs( s ) > ${f(RING.reach * RING.width * 2)} ) continue;
    float k = ${f((2 * Math.PI) / (RING.wavelength * 2))}, w2 = ${f((RING.width * 2) ** 2)};
    float a = ( d.w / k ) * exp( -age / ${f(RING.life)} ) * min( 1.0, age / ${f(RING.born)} ) / sqrt( 1.0 + r / ${f(RING.thin)} );
    grad += a * exp( -( s * s ) / w2 ) * ( -2.0 * s / w2 * cos( k * s ) - k * sin( k * s ) ) * q / max( r, 1.0e-4 );
  }
  return grad;
}
// THE SWASH: how high the sea's edge has run up the beach at a point (m over the mean): the swell's bores where the reef
// lets them through, the lagoon's small waves elsewhere; up quickly and back down slower, each stretch of beach out of
// step with the next and no two alike. And how high it reaches at most (the wet sand above the water is wet to there).
float seaReach( vec4 m ) { return mix( 0.08, 0.34, smoothstep( -700.0, -60.0, m.x ) ); }
float seaSwash( vec2 xz, vec4 m, out float rising ) {
  float exposed = smoothstep( -700.0, -60.0, m.x ), T = mix( 3.6, 11.5, exposed );
  float ph = uSeaClock.x / T + 0.8 * gn( xz * 0.013 ) + 0.25 * gn( xz * 0.07 + 3.0 ), u = fract( ph );
  rising = 1.0 - smoothstep( 0.22, 0.34, u );
  float up = u < 0.3 ? sqrt( u / 0.3 ) : 1.0 - smoothstep( 0.3, 1.0, u );
  return seaReach( m ) * up * ( 0.55 + 0.45 * gn( vec2( floor( ph ) * 0.37 + xz.x * 0.004, xz.y * 0.004 ) ) );
}
// foam's lace (bubbles drawn out into threads): three scales of noise, drifting; covered where it is over 1 - white. A
// pixel that spans more of it than its finest threads (px: metres a pixel) sees their mean, and far off the share itself
float seaLace( vec2 p, float white, float px ) {
  float t = uSeaClock.x, f1 = smoothstep( 0.35, 0.06, px ), f2 = smoothstep( 1.6, 0.3, px ), f3 = smoothstep( 5.0, 1.2, px );
  float n = 0.5 + f3 * ( gn( p * 0.85 + vec2( 0.23 * t, -0.13 * t ) ) - 0.5 ) * 0.5 + f2 * ( gn( p * 2.9 + vec2( -0.41 * t, 0.29 * t ) + 7.0 ) - 0.5 ) * 0.32 + f1 * ( gn( p * 9.5 - vec2( 0.2 * t ) ) - 0.5 ) * 0.18;
  float w = 0.22 + 0.5 * ( 1.0 - f2 );
  return mix( white, smoothstep( 1.0 - white - 0.5 * w + 0.5 * 0.22, 1.0 - white + 0.5 * w + 0.5 * 0.22, n + 0.12 * white ), f3 );
}
// THE KEY LIGHT'S GLITTER: C. Cox and W. Munk's (J. Opt. Soc. Am. 44, 838, 1954): each facet a mirror, their slopes
// spread as a Gaussian about the surface's own (the spread finer than a pixel: the bands' and the remainder), the light
// a facet sends to the eye E F p / (4 cos(view) cos^4(facet)). v, l: toward the eye and the light (world, y up)
vec3 seaGlitter( vec3 v, vec3 l, vec3 E, vec2 s, float spread ) {
  vec3 h = normalize( v + l );
  if ( h.y <= 0.02 || l.y < -0.03 ) return vec3( 0.0 );
  vec2 q = -h.xz / h.y - s; float var = max( 0.5 * spread, 4.0e-5 );
  float p = exp( -0.5 * dot( q, q ) / var ) / ( 6.2831853 * var ), hy2 = h.y * h.y;
  return E * ( seaFresnel( dot( v, h ) ) * p / ( 4.0 * max( v.y, 0.04 ) * hy2 * hy2 ) ) * smoothstep( -0.03, 0.01, l.y );
}`;

// one RGBA float target of MRT pairs, or half floats (the bands' own, filtered, with their smaller levels)
function pairTarget(w, h, type, mips) {
  const t = new THREE.WebGLMultipleRenderTargets(w, h, 2, { type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter, magFilter: mips ? THREE.LinearFilter : THREE.NearestFilter, generateMipmaps: mips, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  for (const x of t.texture) { x.type = type; x.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter; x.magFilter = mips ? THREE.LinearFilter : THREE.NearestFilter; x.generateMipmaps = mips; x.wrapS = x.wrapT = THREE.RepeatWrapping; }
  return t;
}
// the lighter path's one band, made once on the CPU: the middle band's slope and the slope's square, as half floats
function bandOnce() {
  const N = SEA.N, sea = startingSea(), W = sea.width, L = SEA.cascades[1].L, chop = SEA.cascades[1].chop, out = new Uint16Array(N * N * 4);
  const re = [new Float64Array(N * N), new Float64Array(N * N), new Float64Array(N * N), new Float64Array(N * N)], im = re.map(() => new Float64Array(N * N));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * W + N + i) * 4, nx = i < N / 2 ? i : i - N, nz = j < N / 2 ? j : j - N, kx = (2 * Math.PI * nx) / L, kz = (2 * Math.PI * nz) / L, k = Math.hypot(kx, kz) || 1;
    const hr = sea.data[o] + sea.data[o + 2], hi = sea.data[o + 1] + sea.data[o + 3], t = j * N + i;            // t = 0
    re[0][t] = -kx * hi; im[0][t] = kx * hr; re[1][t] = -kz * hi; im[1][t] = kz * hr;                          // the slopes, i k h
    re[2][t] = -(kx * kx / k) * hr; im[2][t] = -(kx * kx / k) * hi; re[3][t] = -(kz * kz / k) * hr; im[3][t] = -(kz * kz / k) * hi;
  }
  const field = re.map((r, q) => { const a = Float64Array.from(r), b = Float64Array.from(im[q]);
    for (let j = 0; j < N; j++) { const [x, y] = inverseFFT(a.subarray(j * N, j * N + N), b.subarray(j * N, j * N + N)); a.set(x, j * N); b.set(y, j * N); }
    for (let i = 0; i < N; i++) { const cr = new Float64Array(N), ci = new Float64Array(N); for (let j = 0; j < N; j++) { cr[j] = a[j * N + i]; ci[j] = b[j * N + i]; } const [x] = inverseFFT(cr, ci); for (let j = 0; j < N; j++) a[j * N + i] = x[j]; }
    return a; });
  for (let t = 0; t < N * N; t++) {
    const J = (1 + chop * field[2][t]) * (1 + chop * field[3][t]), sx = field[0][t] / Math.max(0.15, J), sz = field[1][t] / Math.max(0.15, J);
    out.set([sx, sz, sx * sx + sz * sz, J].map((v) => THREE.DataUtils.toHalfFloat(v)), t * 4);
  }
  const tex = new THREE.DataTexture(out, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

// createWater({ renderer, lite, ground }): the bands (on the GPU where it can draw into float targets, and not on the
// lighter path), the sea's map, the swell; `uniforms` (by reference: terrain.js's sea material and the land's film read
// them), update(t) once a frame before the picture, read() for the probes, dispose()
export function createWater({ renderer, lite = false, ground, shape = null }) {
  const head = ground.head, N = SEA.N, C = SEA.cascades.length, disposables = [];
  const canFloat = (() => { try { return !!renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'); } catch { return false; } })();
  const gpu = !lite && canFloat, times = { map: 0, start: 0, band: 0 };
  // the wind's sea to start from, and the unresolved slope: Cox and Munk's whole, less what the bands draw (at least a tenth of it)
  let t0 = performance.now();
  const sea = startingSea(), drawn = sea.slope.reduce((a, b) => a + b, 0), finer = Math.max(0.1 * coxMunk(SEA.wind.speed), coxMunk(SEA.wind.speed) - drawn);
  times.start = performance.now() - t0;
  // the sea's map, once
  t0 = performance.now();
  const map = seaMap(ground.hts.main, head.w, head.h, head.spacing, { x0: head.x0, z0: head.z0, reef: shape?.reef || null, lagoonSouth: shape?.lagoonSouth ?? Infinity }), shore = shoreTables();
  // the swell's phase by the distance outside the crest (sea.js shoreTables), into the map's second channel; into its
  // fourth, how high the waves come in at the reef over the swell's own height: the swell where the reef faces it, the
  // wind's sea where it faces that (each with a third of itself wrapping round to the island's lee), together as their
  // energies add
  const sw = SWELL.reduce((a, w) => [a[0] + w.dir[0] * w.amp, a[1] + w.dir[1] * w.amp], [0, 0]), swl = Math.hypot(...sw), swd = [sw[0] / swl, sw[1] / swl];
  const wd = toward(SEA.wind.from), hw = 4 * Math.sqrt(sea.variance.reduce((a, b) => a + b, 0)) / SEA.swell.hs;
  const data = new Uint16Array(head.w * head.h * 4), H = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < head.w * head.h; k++) {
    const sd = map.data[4 * k], u = Math.min(SHORE.n - 1.001, Math.max(0, (sd - SHORE.from) / SHORE.step)), i = Math.floor(u), fr = u - i;
    const nx = map.data[4 * k + 1], nz = map.data[4 * k + 2], phase = shore.phase[i] + (shore.phase[i + 1] - shore.phase[i]) * fr;
    const fs = 0.33 + 0.67 * Math.max(0, -(nx * swd[0] + nz * swd[1])), fw = (0.33 + 0.67 * Math.max(0, -(nx * wd[0] + nz * wd[1]))) * hw;
    data[4 * k] = H(Math.max(-2000, Math.min(4000, sd))); data[4 * k + 1] = H(phase); data[4 * k + 2] = H(Math.min(4000, map.data[4 * k + 3])); data[4 * k + 3] = H(Math.sqrt(fs * fs + fw * fw));
  }
  const mapTex = new THREE.DataTexture(data, head.w, head.h, THREE.RGBAFormat, THREE.HalfFloatType);
  mapTex.magFilter = mapTex.minFilter = THREE.LinearFilter; mapTex.wrapS = mapTex.wrapT = THREE.ClampToEdgeWrapping; mapTex.generateMipmaps = false; mapTex.needsUpdate = true;
  disposables.push(mapTex);
  times.map = performance.now() - t0;

  const uniforms = {
    uSeaA0: { value: null }, uSeaA1: { value: null }, uSeaB0: { value: null }, uSeaB1: { value: null }, uSeaB2: { value: null }, uSeaMap: { value: mapTex },
    uSeaL: { value: new THREE.Vector3(...SEA.cascades.map((c) => c.L)) },
    uSeaGrid: { value: new THREE.Vector4(head.x0, head.z0, head.spacing, gpu ? 1 : 0) }, uSeaN: { value: new THREE.Vector2(head.w, head.h) },
    uSeaSwell: { value: SWELL.map((w) => new THREE.Vector4(w.k * w.dir[0], w.k * w.dir[1], w.phase, w.amp)) },
    uSeaClock: { value: new THREE.Vector4(0, shore.omega, SEA.swell.hs / 2, finer / 2) }, uSeaSlide: { value: new THREE.Vector4() },
    uSeaDebug: { value: 0 },
  };
  // ---- the bands on the GPU
  const quadGeo = new THREE.BufferGeometry(); quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); disposables.push(quadGeo);
  const quad = new THREE.Mesh(quadGeo), quadScene = new THREE.Scene(), quadCam = new THREE.Camera(); quad.frustumCulled = false; quadScene.add(quad);
  const run = (material, target) => { const was = renderer.getRenderTarget(); quad.material = material; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); renderer.setRenderTarget(was); };
  const pass = (frag, u) => { const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VERT, fragmentShader: frag, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false }); disposables.push(m); return m; };
  let h0 = null, ping = null, pong = null, bands = [], mSpec = null, mFFT = null, mAsm = null, once = null;
  if (gpu) {
    h0 = new THREE.DataTexture(sea.data, sea.width, sea.height, THREE.RGBAFormat, THREE.FloatType); h0.minFilter = h0.magFilter = THREE.NearestFilter; h0.generateMipmaps = false; h0.needsUpdate = true;
    ping = pairTarget(sea.width, N, THREE.FloatType, false); pong = pairTarget(sea.width, N, THREE.FloatType, false);
    bands = SEA.cascades.map(() => pairTarget(N, N, THREE.HalfFloatType, true));
    disposables.push(h0, ping, pong, ...bands);
    mSpec = pass(SPECTRUM_FRAG, { uH0: { value: h0 }, uL: { value: uniforms.uSeaL.value }, uT: { value: 0 }, uW0: { value: (2 * Math.PI) / SEA.loop } });
    mFFT = pass(FFT_FRAG, { uI0: { value: null }, uI1: { value: null }, uNs: { value: 1 }, uDir: { value: 0 } });
    mAsm = pass(ASSEMBLE_FRAG, { uI0: { value: null }, uI1: { value: null }, uC: { value: 0 }, uChop: { value: 1 } });
    uniforms.uSeaA0.value = bands[0].texture[0]; uniforms.uSeaA1.value = bands[1].texture[0];
    uniforms.uSeaB0.value = bands[0].texture[1]; uniforms.uSeaB1.value = bands[1].texture[1]; uniforms.uSeaB2.value = bands[2].texture[1];
  } else {
    t0 = performance.now(); once = bandOnce(); times.band = performance.now() - t0; disposables.push(once);
    uniforms.uSeaB0.value = uniforms.uSeaB1.value = uniforms.uSeaB2.value = once;
    // (a texture of the sea's map stands in for the moving surface's: it is never read without the bands)
    uniforms.uSeaA0.value = uniforms.uSeaA1.value = mapTex;
  }
  const stages = Math.log2(N);
  function bandsAt(t) {
    mSpec.uniforms.uT.value = t; run(mSpec, ping);
    let src = ping, dst = pong;
    for (const dir of [0, 1]) for (let s = 0; s < stages; s++) {
      const u = mFFT.uniforms; u.uI0.value = src.texture[0]; u.uI1.value = src.texture[1]; u.uNs.value = 1 << s; u.uDir.value = dir;
      run(mFFT, dst); [src, dst] = [dst, src];
    }
    for (let c = 0; c < C; c++) { const u = mAsm.uniforms; u.uI0.value = src.texture[0]; u.uI1.value = src.texture[1]; u.uC.value = c; u.uChop.value = SEA.cascades[c].chop; run(mAsm, bands[c]); }
  }
  let clock = 0;
  return {
    uniforms, gpu, defines: gpu ? { SEA_FFT: '' } : {},
    // the time the sea is at (s, within SEA.loop): the swell's phase, for whatever floats on it (nothing yet)
    get clock() { return clock; },
    update(t) {
      clock = ((t % SEA.loop) + SEA.loop) % SEA.loop; uniforms.uSeaClock.value.x = clock;
      if (gpu) bandsAt(clock);
      else { const L = SEA.cascades[1].L, v = 1.1, s = uniforms.uSeaSlide.value; s.set((-v * clock) % L, (0.4 * v * clock) % L, (0.7 * v * clock) % L, (-0.9 * v * clock) % L); }
    },
    // what each band and pass costs the GPU (n times, waited for: a probe's question)
    cost(n = 30) {
      if (!gpu) return null;
      const gl = renderer.getContext(), px = new Float32Array(4), wait = () => { renderer.readRenderTargetPixels(ping, 0, 0, 1, 1, px); gl.finish(); };
      wait(); const a = performance.now(); for (let i = 0; i < n; i++) bandsAt((clock + i * 0.016) % SEA.loop); wait();
      return { bands: (performance.now() - a) / n };
    },
    read: () => ({ gpu, canFloat, lite, times: { ...times }, drawnSlope: +drawn.toFixed(4), finer: +finer.toFixed(4), hs: sea.hs.map((h) => +h.toFixed(3)), swell: SWELL.length }),
    // the sea's map at a grid point (a probe's question: sd, phase, land, face)
    peek(i, j) { const k = j * head.w + i; return [0, 1, 2, 3].map((c) => THREE.DataUtils.fromHalfFloat(data[4 * k + c])); },
    dispose() { for (const x of disposables) x.dispose(); },
  };
}
