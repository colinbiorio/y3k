// ============================================================================
// LIQUID MERCURY BUTTON SYSTEM
// ============================================================================
// Each button is a blob of liquid mercury rendered as a procedural 2D signed
// distance field in a WebGL2 fragment shader — no meshes, no sprites, no CSS
// filter hacks. See MERCURY-BUTTONS.md for architecture notes.
//
//  · SHAPES    analytic SDFs for the preset set (plus, bars, broadcast,
//              bubble, ring, blob pair) + a raster→SDF pipeline (8SSEDT
//              distance transform) that turns ANY svg path / svg element /
//              image into a shape with zero shader changes.
//  · FLOW      the SDF domain is warped by time-evolving fbm simplex noise
//              with a unique per-button seed — silhouette breathing — while a
//              second, slower field crawls the reflections across the surface
//              (interior drift). Incommensurate time tracks: never loops.
//  · SHADING   dome height from the SDF, normals via screen-space derivatives,
//              procedural studio environment (hot horizon band, dark floor),
//              Fresnel-weighted, twin speculars, near-black meniscus rim,
//              faint anisotropic streaking, sparse drifting micro-speckle.
//  · HOVER     the cursor is a blade: a pointer trail of capsule SDFs is
//              smooth-subtracted from the body; displaced mercury bulges along
//              the cut edges (conservation of volume) and each cut heals over
//              ~750ms with a rebound wobble, smooth-min sealing shut.
//  · CLICK     pointerdown clumps the shape toward a taller rounder blob;
//              release POPS it into droplets (the button's action fires on
//              that same pointerup); droplets damp, feel a little gravity,
//              then get pulled home and metaball-merge back into the icon.
//  · A11Y      real <button> elements stay real: keyboard focus shows a
//              traveling glint in the material; Enter/Space runs the pop;
//              prefers-reduced-motion freezes to a beauty frame.
//
// mount(el, config) → { destroy() }.  One shared WebGL2 context renders every
// button into a tile; each button blits its tile to a small 2D canvas.
// ============================================================================

const TILE = 176;            // GL tile per button (square); DPR-scaled at init
const EXTENT = 1.7;          // shape space: icon lives in |p|<=1, room to pop
const TRAIL_N = 24;          // pointer trail capacity (the blade)
const DROP_N = 18;           // max droplets in a pop
const HEAL_MS = 750;         // cut healing time (600-900 per spec)
const CLUMP_MS = 150;        // press → clump spring
const REFORM_MS = 700;       // droplets → body
const SDF_RANGE = 0.6;       // shape units encoded either side of an SDF texture edge
const BAKE_H = 512;          // raster→SDF bake height (the distance transform
                             //   quantizes to this grid — too low reads blocky)
// A touch device renders at dpr 3 with a fraction of the fill rate, so the
// supersample that buys crispness on a desktop just costs frames there. The
// test is the input device, NOT the window width: a desktop window dragged
// narrow still has a real GPU behind it.
const COARSE = typeof matchMedia !== 'undefined'
  && (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches);
// NO FRACTIONAL SUPERSAMPLE. This was 1.35, and on a 2x screen that put the
// canvas backing at 2.7 device pixels per CSS pixel against a display that has
// exactly 2 — so the browser resampled every edge by a ratio of 1.35. A
// fractional downscale is the one thing you must not do to a high-contrast
// edge: some display pixels take one source pixel and their neighbours take
// two, and that beat pattern IS the stair-stepping. Measured on the live page
// at 1.35 backing pixels per CSS pixel, with edge ramps of 2px and 0px sitting
// side by side — a properly filtered edge does not do that.
//
// An SDF does not need supersampling anyway. The shader already antialiases
// analytically from fwidth(d), which is exact at any resolution and is how
// every good SDF renderer works. Rendering 1:1 with device pixels means no
// resample at all, so the analytic edge survives to the screen intact — and it
// costs 45% fewer fragments than the 2.7x it replaces.
const SS = 1.0;              // backing == device pixels, exactly

// ---------------------------------------------------------------------------
// TUNING — the feel of the liquid, in one place.
// ---------------------------------------------------------------------------
const FLOW_SPEED = 0.30;     // FLOW CLOCK: global multiplier on all ambient
                             //   liquid motion (breathing, gust, drift, sheen).
                             //   Interaction feedback (sweep, wobble, glint)
                             //   keeps real time.
const FLOW_AMP = 0.12;       // WAVINESS: silhouette breathing amplitude (shape
                             //   units). Raise for blobbier, lower for stiller.
                             //   Per-button: cfg.flowSpeed scales it up,
                             //   cfg.viscosity divides it (stiffer liquid).
const HOVER_BLOB = 1.1;      // HOVER MORPH: extra breathing at full hover —
                             //   1.1 ≈ the surface visibly blobs, concentrated
                             //   around the cursor (surface tension).
const SWEEP_MS = 700;        // SHINE SWEEP: how long the hover-enter glint
                             //   takes to cross the face.

const SWEEP_ANGLE = [0.82, 0.57]; // REFLECTION ANGLE: direction the sheen +
                             //   sweep travel (normalized in-shader). [1,0] =
                             //   horizontal, [0,1] = vertical.

// ---------------------------------------------------------------------------
// THE MATERIAL AXIS — one number, three materials.
//   0.00  MERCURY  today's chrome, byte for byte
//   0.50  GLASS    dielectric Fresnel, a refracted second look at the studio,
//                  an edge-lit meniscus, real output alpha on solid bodies
//   1.00  WATER    the same, plus Beer-Lambert absorption through the dome:
//                  clear at the rim, glacier blue where the body is thick
// Every value between is a PARAMETER interpolation of the one shading routine
// this shader has always had — never a blend of two rendered results, which
// averages two highlights into a grey and two rims into a flat grey outline.
// Every parameter is MONOTONE along the axis, so "a bit more" is unambiguous.
//   live: window.__merc.material = 0.5   ·   URL: ?mat=0.5
let MATERIAL = 0.60;         // "between liquid metal, liquid glass and water"
try {
  const q = new URLSearchParams(location.search).get('mat');
  if (q !== null) { const v = parseFloat(q); if (Number.isFinite(v)) MATERIAL = Math.min(1, Math.max(0, v)); }
} catch { /* no location (SSR / test): the default stands */ }
// How far a BORDER RING travels down the axis. 0 = not at all: every frame,
// line and railedge renders the byte-identical chrome it does today at every
// knob position. This is the hairline's own surface — a 3px band is meniscus
// to meniscus with no interior, its dome bottoms out at 0.02, and three
// commits (c4e8903 → e70e8d5 → fbe3953) went into getting its LIGHTING right.
// Raise this ONLY with a border cross-section in front of you.

const BORDER_MAT = 0.0;
// GRAVITY — how heavily the liquid carries itself. 0 light, 1 heavy. It rides
// uFlow and uBevel and NEVER uVisc: viscosity is the per-class protection that
// keeps small-featured glyphs from melting, and a global write would erase that
// tuning permanently. Both gains are a non-destructive per-frame MULTIPLY, so
// every per-class value survives and returning to 0.60 is exact.
//   0.60 ships because FLOW_GAIN(0.60) === 1.00 exactly — today, with no offset.
let GRAVITY = 0.60;
const FLOW_GAIN  = () => 0.55 + 0.75 * GRAVITY;   // [0.55, 1.30]
const BEVEL_GAIN = () => 0.90 + 0.45 * GRAVITY;   // [0.90, 1.35]
// THE CEILING, ARITHMETIC NOT TASTE. Effective ambient warp is
// FLOW_AMP * (flow_tuned * gain) / clamp(visc_tuned, 0.1, 3.0). The loosest body
// in the app is flow 1 / visc 1, so worst case is 0.12 * 1.30 / 1 = 0.156 shape
// units — under the 0.175 half-width of the `bars` strokes and the 0.19 of the
// `plus` caps, the two narrowest analytic strokes. That is why no per-body clamp
// is needed at gain <= 1.30. Raising it means re-running that against the mounts.
let MAT_EASE = false;   // a crossing is in flight — see setLiquid()
// The transmitted lobe's gain. The studio stands in for what is actually
// BEHIND a button — #nav-sheet's 26px-blurred slate — which is far dimmer than
// the studio's sky, so a gain under 1 is the correct relative luminance, not a
// fudge. At 1.0 the glass midpoint reads as milk.

const TRANS_GAIN = 0.70;
// How much rounder the surface gets as it turns to glass. See the long note at
// the gh line: curvature is free for metal and load-bearing for glass, so the
// lift is tied to the axis rather than set per mount. 6.0 puts a default body
// at an effective bevel of ~4.6 at MATERIAL 0.6, measured Michelson 0.46-0.50.


let BEVEL_LIFT = 6.0;
// THE TIDE'S WHOLE BUDGET, in shape units — about 4.6 device pixels at a rail's
// scale. It is spent OUT OF the warp's budget, never on top of it: the ceiling
// arithmetic above (worst-case ambient warp 0.156, under the 0.175 half-width of
// the narrowest analytic stroke) is what guarantees a thin mark cannot tear, and
// it has to keep holding while a tide runs. It also simply reads better — when
// the presence sends a gesture the ambient mush steps back and the gesture is
// what you see.
const TIDE_MAX = 0.06;
const TIDE_N = 4;            // simultaneous gestures; the shader loop is fixed
try {
  const q = new URLSearchParams(location.search).get('bevel');
  if (q !== null) { const v = parseFloat(q); if (Number.isFinite(v)) BEVEL_LIFT = Math.min(20, Math.max(0, v)); }
} catch { /* no location (SSR / test): the default stands */ }
// ---- antialiasing band-limits. Each is an EXACT revert at 0: the emitted
// GLSL folds to 1.0 and the compiler dead-codes everything behind it, so a
// zeroed constant costs nothing and changes nothing.
const SPEC_BL  = 5.0;        // → 5.0 : widen the twin speculars as the dome
                             //   stops resolving, energy-conserving

// HOT_BL stays 0, and this is a MEASURED result, not an untried idea. Widening
// the horizon lobe as ry sweeps it inside one pixel is correct in principle and
// its (0.12/bw) factor does conserve the band's integral OVER ry — but a thin
// ring's normals only ever sample a narrow ry window sitting ON the peak, so
// the amplitude drop is all it ever sees and the payback in the tails is light
// nobody looks at. At 3.0 the #chat-form band's green cross-section fell
// 80·253·252·80 → 80·201·201·80, a 15.5% dimming of a border, which is the one
// thing this system is not allowed to do. And blurR is ~0 on every button, so
// the lever has no upside to trade for it: it acts ONLY on rings.
//   Left wired so the finding is reproducible in one keystroke, not deleted.
const HOT_BL   = 0.0;        // measured harmful at 3.0 — see above
const SPECK_BL = 1.0;        // → 1.0 : the impurity dot is sub-pixel at every
                             //   scale in this app; widen it, conserve weight
const EDGE_W   = 1.15;        // → 1.15: exact box-filter coverage in place of
                             //   smoothstep(-fwidth, fwidth, d)

// preset shapes routed through the raster pipeline (stroked paths etc.) —
// proof that new icons need zero shader changes
const PRESET_PATHS = {
  squiggle: { svgPath: 'M8 52 C 20 6, 36 6, 46 40 S 66 86, 80 38 S 102 10, 116 50', strokeWidth: 13 },
};

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------
const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;

uniform int   uShape;        // 0 plus · 1 bars · 2 broadcast · 3 bubble · 4 ring · 5 blobs · 6 texture SDF
uniform sampler2D uSDF;      // raster→SDF shapes
uniform float uTime, uSeed, uFlow, uVisc;
uniform int   uOctaves;      // fbm octaves (degrades before resolution)
uniform vec4  uTrail[${TRAIL_N}];   // xy pos (shape space) · z age 0..1 · w valid

uniform vec4  uDrops[${DROP_N}];    // xy pos · z radius · w alive
// THE TIDE — the presence's own hand on the liquid. One primitive with two
// numbers: a heading, and how tight the swell is around it. Hold the heading
// and it is gravity; rotate it and the swell travels, and the sign of the
// rotation is clockwise or counterclockwise. Narrow it and it is a section of
// the rim; widen it and the whole edge breathes together.
//   NO atan ANYWHERE: cos(theta - phi) IS dot(normalize(p), (cos phi, sin phi)),
// and phi is uniform across the pixel — so JS uploads the heading ALREADY
// ADVANCED and the shader spends no transcendental finding the crest. The
// wave's clock lives on the CPU at two Math.cos per frame for the whole screen.
uniform vec4  uTide[${TIDE_N}];     // xy heading (cos,sin), pre-advanced · z amplitude
                                    //   in shape units · w angular tightness
uniform int   uTideN;               // live gestures; 0 skips every line below
uniform vec2  uLean;                // a constant displacement — gravity with a
                                    //   direction. Exactly (0,0) at rest, and
                                    //   x + 0.0 == x in fp32, so a still body's
                                    //   q is BIT-IDENTICAL to before this existed.
uniform int   uTrailN;       // live trail points (0 = skip the blade loop)
uniform int   uDropN;        // live droplets (0 = skip the droplet loop)
uniform float uClump;        // 0..1 press-clump
uniform float uCore;         // core presence: 1 idle → 0 popped → 1 reformed
uniform float uWobble;       // settle wobble amplitude
uniform float uFocus;        // eased focus 0..1
uniform float uReduced;      // 1 = beauty frame
uniform vec2  uMouse;        // cursor in shape space (far offscreen when away)
uniform float uHover;        // eased hover 0..1 (drives the blob morph)
uniform float uSweep;        // hover-enter shine sweep progress 0..1 (1 = idle)
uniform float uRangeX;       // shape-space half-width (EXTENT for square tiles)
uniform vec4  uBulge;        // rail edge only: ellipse rx, ry, how far it sits
                             //   back behind the rect's right edge, and the
                             //   rect's own x-offset inside the canvas (the bar
                             //   is not centred in its box — the swell needs
                             //   room on one side only)
uniform float uRangeY;       // shape-space half-height. Per-button for the same
                             //   reason as uRangeX: a mount inside a scrolling
                             //   panel gives up bulge margin so its canvas never
                             //   crosses the clip edge. Shrinking the range and
                             //   the canvas TOGETHER leaves px-per-shape-unit
                             //   unchanged, so the mark itself never resizes.
uniform vec2  uFrame;        // wide shapes: half-extents (bubble body / frame box)
uniform float uFrameT;       // frame ring half-thickness (units; px-constant via JS)
uniform float uHollow;       // pill: 0 solid metal → 1 the interior dispels into the ring
uniform float uBand;         // scales the horizon hot-band + sheen (wide flats read striped)
uniform float uRim;          // meniscus width in units (thin marks need a finer edge)
uniform vec2 uSpin;          // (yaw, pitch) of the 3D plaque spin — zero for all but
                             // the spinnable marks (the wordmark medallion)
uniform float uBevel;        // curvature boost: 1 = standard dome, >1 = beadier,
                             // bubblier metal (the medallion runs ~1.5)
uniform float uFloor;        // environment floor luminance. A body of metal wants a
                             // dark floor (0.10) — the tube look. A BORDER at
                             // hairline width cannot: its inner face "looks at the
                             // floor" and renders as a dark line beside the bright
                             // one — the hairline-both-sides that survived every
                             // CSS and rim fix, because it is the lighting itself.
uniform float uRadius;       // tracked shapes: the box's OWN corner radius (0 = stadium)

uniform float uStill;        // 1 = frozen metal (borders hold still; buttons keep flowing)
uniform float uMat;          // THE MATERIAL AXIS: 0 mercury · 0.5 glass · 1 water.
                             // Drives Fresnel, the transmitted lobe, absorption,
                             // the specular shape, the sheen and the meniscus
                             // inversion. It does NOT touch alpha — see uTrans.
                             // Multiplied by bodyAmt in main(), so a border's
                             // effective axis is 0 whatever this says.
uniform float uTrans;        // how much of the axis's transmission this body may
                             // spend on real OUTPUT ALPHA. 1 = solid buttons.
                             // 0 = every ring, every spinning mark, the bead and
                             // the login wordmark. A border's alpha profile IS
                             // the hairline (fbe3953), so at uTrans 0 the output
                             // line is byte-for-byte vec4(col*edge, edge).

// ---- noise (Ashima simplex 2D) --------------------------------------------
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.;
  vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}
float fbm(vec2 p, float t){
  float s=0., a=0.55; vec2 q=p;
  for(int i=0;i<3;i++){
    if(i>=uOctaves) break;
    s+=a*snoise(q+vec2(t*0.31+uSeed*7.1, -t*0.243+uSeed*3.7));

    q=q*2.03+11.7; a*=0.5; t*=1.37;
  }
  return s;
}

// Two-segment parameter blend: MERCURY → GLASS → WATER. Blending PARAMETERS is
// why the midpoint is a material and not an average of two pictures.
float ax1(float m, float g, float w, float a, float b){ return mix(mix(m,g,a),w,b); }
vec3  ax3(vec3  m, vec3  g, vec3  w, float a, float b){ return mix(mix(m,g,a),w,b); }

// THE STUDIO, as a function of one number: the y of a direction. The reflected
// ray asks it about the sky; the refracted ray asks it about the floor. Same
// room, seen twice — that is the whole of the glass model here. There is no
// backdrop texture in this shader and there will not be one: no readback
// exists, and the atlas exists precisely to avoid the GPU syncs one costs.
//   Extracted VERBATIM from the inline block that used to live in main(): with
//   bw = 0.12 the (0.12/bw) factor is exactly 1.0 and this returns exactly what
//   those four lines returned. bw > 0.12 widens the hot band and dims it in
//   proportion, so its INTEGRAL is conserved — that factor is the guard that
//   keeps mean border luminance where uFloor 0.62 put it.
//   No derivatives inside, so it is legal to call from anywhere, including
//   below the non-uniform early return in main().
float studioEnv(float ry, float floorL, float band, float bw){
  float e = mix(floorL, 1.0, smoothstep(-0.55, 0.05, ry)); // floor → horizon
  e = mix(e, 0.80, smoothstep(0.12, 0.60, ry));            // horizon → calm sky
  float hb = (ry - 0.05)/bw;                   // the hot band itself (t*t, not
  return e + 0.45 * band * exp(-hb*hb) * (0.12/bw);  // pow: negative bases are UB)
}

// ---- SDF toolkit -----------------------------------------------------------
float smin(float a,float b,float k){ float h=clamp(0.5+0.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }
float smax(float a,float b,float k){ return -smin(-a,-b,k); }
float sdCircle(vec2 p,float r){ return length(p)-r; }
float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa=p-a, ba=b-a;
  // max() guards the degenerate zero-length segment (0/0 → NaN tile-wide)
  float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);
  return length(pa-ba*h)-r;
}
float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q=abs(p)-b+r;
  return length(max(q,0.))+min(max(q.x,q.y),0.)-r;
}
float sdArcY(vec2 p, float ap, float ra, float rb){ // opens about +y, half-aperture ap
  p.x = abs(p.x);
  vec2 sc = vec2(sin(ap), cos(ap));
  return ((sc.y*p.x > sc.x*p.y) ? length(p - sc*ra) : abs(length(p) - ra)) - rb;
}
vec2 rot2(vec2 p, float a){ float c=cos(a),s=sin(a); return vec2(c*p.x-s*p.y, s*p.x+c*p.y); }

float iconSDF(vec2 p){
  if(uShape==0){ // plus
    return smin(sdCapsule(p, vec2(-0.72,0.), vec2(0.72,0.), 0.19),
                sdCapsule(p, vec2(0.,-0.72), vec2(0.,0.72), 0.19), 0.10);
  } else if(uShape==1){ // stacked-strokes menu (4 bars)
    float d = sdCapsule(p, vec2(-0.68,0.63), vec2(0.68,0.63), 0.175);
    d = min(d, sdCapsule(p, vec2(-0.68,0.21), vec2(0.68,0.21), 0.175));
    d = min(d, sdCapsule(p, vec2(-0.68,-0.21), vec2(0.68,-0.21), 0.175));
    return min(d, sdCapsule(p, vec2(-0.68,-0.63), vec2(0.68,-0.63), 0.175));
  } else if(uShape==2){ // broadcast ((•))
    float d = sdCircle(p, 0.20);
    d = min(d, sdArcY(rot2(p, 1.5708), 0.60, 0.46, 0.12));
    d = min(d, sdArcY(rot2(p,-1.5708), 0.60, 0.46, 0.12));
    d = min(d, sdArcY(rot2(p, 1.5708), 0.72, 0.80, 0.125));
    return min(d, sdArcY(rot2(p,-1.5708), 0.72, 0.80, 0.125));
  } else if(uShape==3){ // speech bubble — pooled circles: smooth gradient, no facets
    vec2 bp = p - vec2(0.,0.10);
    float body = smin(sdCircle(bp - vec2(-0.34,0.), 0.50),
                      sdCircle(bp - vec2(0.34,0.), 0.50), 0.30);
    body = smin(body, sdCircle(bp, 0.54), 0.30);
    float tail = sdCapsule(p, vec2(-0.28,-0.34), vec2(-0.50,-0.80), 0.10);
    return smin(body, tail, 0.16);
  } else if(uShape==4){ // ring
    return abs(sdCircle(p, 0.62)) - 0.185;
  } else if(uShape==5){ // blob pair
    return smin(sdCircle(p - vec2(0.,0.52), 0.30),
                sdCircle(p - vec2(0.,-0.28), 0.52), 0.05);
  } else if(uShape==7){ // wide speech bubble (uFrame.x = body half-width)
    float body = sdCapsule(p, vec2(-uFrame.x, 0.08), vec2(uFrame.x, 0.08), 0.58);
    float tail = sdCapsule(p, vec2(-uFrame.x*0.62, -0.42), vec2(-uFrame.x*0.78, -0.92), 0.11);
    return smin(body, tail, 0.16);
  } else if(uShape==8){ // liquid frame: a thin rounded RING hugging uFrame
    float r = uRadius > 0.0 ? uRadius : max(0.12, uFrame.y - 0.10);
    return abs(sdRoundBox(p, uFrame, r)) - max(uFrameT, 0.02);
  } else if(uShape==12){ // rail edge: the band around a box UNIONED with an
                         // ellipse, so the border traces the nav bar's swell
                         // instead of cutting straight across it
    // The corner radius must never exceed the box's own half-extents. The
    // default elsewhere is uFrame.y - 0.10, which assumes a box wider than it
    // is tall; the nav bar is 860px tall and 92 wide, so that default came out
    // at 10.65 units against a half-width of 1.15 and the rounded box collapsed
    // — the rect vanished entirely and only the ellipse drew.
    float r = clamp(uRadius, 0.0, min(uFrame.x, uFrame.y) * 0.9);
    vec2 pr = p - vec2(uBulge.w, 0.0);       // into the rect's own frame
    // VERTICAL EDGES ONLY. The full frame's top and bottom runs straddle the
    // viewport edges and read as stray horizontal lines (and clipping them in
    // CSS cut the vertical line short of the screen). The band is now the
    // pair of vertical edges, clamped to the box's height — the box spans the
    // whole viewport, so the ends live off-screen and the line runs the full
    // height. (The outer edge is still hidden by the rails' CSS clip.)
    float dBox = max(abs(abs(pr.x) - uFrame.x), abs(pr.y) - uFrame.y);
    // the swell sits on the rect's right edge, pushed back into it by uBulge.z
    vec2 q = (pr - vec2(uFrame.x - uBulge.z, 0.0)) / max(uBulge.xy, vec2(1e-4));
    // cheap ellipse SDF: exact enough for a band this thin, and it costs one
    // length() rather than the iterative solve an exact one needs
    // With no swell configured the ellipse must not participate at all: at
    // radius zero the expression below collapses to 0, which would read as
    // "edge everywhere" and flood the whole canvas with metal.
    float dEll = uBulge.x > 0.0 ? (length(q) - 1.0) * min(uBulge.x, uBulge.y) : 1e6;
    return abs(min(dBox, dEll)) - max(uFrameT, 0.02);
  } else if(uShape==11){ // disc: a solid bead (the slider's notch)
    return sdCircle(p, 0.62);
  } else if(uShape==10){ // divider / slider track: a horizontal capsule
    return sdCapsule(p, vec2(-uFrame.x + uFrameT, 0.0), vec2(uFrame.x - uFrameT, 0.0), uFrameT);
  } else if(uShape==9){ // pill: solid box that HOLLOWS into its own border
    // radius comes from the tracked element, so the metal covers the real
    // corners instead of rounding past them
    float r = uRadius > 0.0 ? uRadius : max(0.12, uFrame.y - 0.06);
    float df = sdRoundBox(p, uFrame, r);
    // uHollow melts the interior away from the center out, leaving the ring —
    // the metal visibly drains into the border
    return mix(df, abs(df) - max(uFrameT, 0.02), clamp(uHollow, 0., 1.));
  }
  // texture SDF (raster pipeline): r stores 0.5 + d/(2*SDF_RANGE), shape units.
  // uv.x spans uRangeX so wide marks (the wordmark) bake at their own aspect.
  vec2 uv = clamp(vec2(p.x/uRangeX, p.y/uRangeY)*0.5+0.5, 0.001, 0.999);
  float s = texture(uSDF, uv).r;
  return (s - 0.5) * ${(2 * SDF_RANGE).toFixed(2)};
}
// THE SLAB. The mark as a solid: its 2D field extruded to half-thickness H
// with every edge rounded by RR (opExtrude + rounding) — faces, side walls and
// bevels are ONE closed surface, so a ray marched through it meets a plaque,
// never two sheets. The texture clamps beyond its baked range, so out there
// the distance is the larger of the box distance and the clamped sample less
// the clamp displacement — both honest lower bounds, which is all sphere
// tracing asks for.
float sdSlab(vec3 pp, float H, float RR){
  vec2 rng = vec2(uRangeX, uRangeY);
  vec2 c = clamp(pp.xy, -rng, rng);
  float d2 = iconSDF(c) - length(pp.xy - c);
  vec2 bq = abs(pp.xy) - rng;
  d2 = max(d2, length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0));
  vec2 w = vec2(d2 + RR, abs(pp.z) - (H - RR));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - RR;
}

void main(){
  vec2 p = vec2((vUv.x*2.-1.) * uRangeX, (vUv.y*2.-1.) * uRangeY);

  // ---- 3D spin (the wordmark medallion) ------------------------------------
  // The logo is a thin plaque in 3D: uSpin = (yaw, pitch) rotates it, and the
  // screen ray inverse-samples the rotated plane (2x2 inverse + one whisper of
  // perspective refinement). Everything downstream — warp, SDF, chrome — just
  // renders the transformed coordinate, so the liquid lives ON the plaque and
  // rides the spin. Edge-on the sliver fades like a real card catching light;
  // past 90° you see the back, mirrored, as physics would have it.
  // It used to remap the plane through an inverse 2x2 and fake the thickness
  // with a second copy of the field shifted by zT/cos(yaw): near edge-on that
  // shift grew without bound, so the "back face" swung out from behind the
  // mark as a separate, perspective-magnified copy (the mutant orbiting the
  // logo) and the two faces parted into sheets with nothing between them.
  // Now the mark is a SOLID (sdSlab) and the screen ray is rotated into its
  // frame and marched — one closed plaque at every angle.
  float spinOn = 0.0; mat3 spinM = mat3(1.0);    // world → plaque
  if (abs(uSpin.x) + abs(uSpin.y) > 0.0005) {
    spinOn = 1.0;
    float cy = cos(uSpin.x), sy = sin(uSpin.x);
    float cp = cos(uSpin.y), sp = sin(uSpin.y);
    // plaque → world is R = Rx(pitch)·Ry(yaw); columns written column-major
    mat3 Ry = mat3(cy, 0.0, -sy,   0.0, 1.0, 0.0,   sy, 0.0, cy);
    mat3 Rx = mat3(1.0, 0.0, 0.0,  0.0, cp, sp,     0.0, -sp, cp);
    spinM = transpose(Rx * Ry);
  }

  // Cheap reject for the big box shapes: a ring's bounding box is mostly empty
  // and the fbm below is the expensive part. The margin (0.30 units) clears the
  // warp + rim by a wide mile, so no quad that survives ever loses a neighbour
  // it needs for derivatives.

  // Shape 12 joins this list. It was the one big box shape with NO cheap reject,
  // which cost nothing while rail edges were frozen and rendered once — but a
  // tide wakes them, and a full-viewport rail is 400x1800 = 720,000 fragments
  // of fbm per frame. Replicating its two SDFs here is ~30 ALU against the ~975
  // of noise below, and culls about 89% of them.
  if (uShape >= 8 && uShape <= 12 && uShape != 11) {
    float rq = uRadius > 0.0 ? uRadius : max(0.12, uFrame.y - 0.06);
    float dq;
    if (uShape == 10) dq = sdCapsule(p, vec2(-uFrame.x, 0.0), vec2(uFrame.x, 0.0), uFrameT);
    else if (uShape == 12) {
      // the same union iconSDF returns, and nothing more
      vec2 pr12 = p - vec2(uBulge.w, 0.0);
      float dBox12 = max(abs(abs(pr12.x) - uFrame.x), abs(pr12.y) - uFrame.y);
      vec2 qe12 = (pr12 - vec2(uFrame.x - uBulge.z, 0.0)) / max(uBulge.xy, vec2(1e-4));
      float dEll12 = uBulge.x > 0.0 ? (length(qe12) - 1.0) * min(uBulge.x, uBulge.y) : 1e6;
      dq = abs(min(dBox12, dEll12)) - max(uFrameT, 0.02);
    }
    else if (uShape == 8 || uHollow > 0.98) dq = abs(sdRoundBox(p, uFrame, rq)) - uFrameT;
    else dq = sdRoundBox(p, uFrame, rq);
    if (dq > 0.30) { frag = vec4(0.0); return; }
  }
  // reduced motion: a beauty frame with a barely-perceptible shimmer
  float t = uStill > 0.5 ? uSeed * 13.7 : mix(uTime, uSeed*13.7 + uTime*0.03, uReduced);

  // ---- silhouette breathing: fbm domain warp, per-seed, never looping ------
  // The ambient clock runs at FLOW_SPEED; interaction feedback keeps real time.
  float ft = t * ${FLOW_SPEED.toFixed(2)};
  // Two layers: a big slow blob (the body sloshing) + a faint skin ripple.
  // GUST makes the liquid's energy itself wander — irregular, not metronomic.
  // Hover multiplies the amplitude, concentrated near the cursor (surface
  // tension gathering where the finger is).
  float visc = clamp(uVisc, 0.1, 3.0);
  vec2 toM = p - uMouse;
  float nearM = exp(-dot(toM, toM) * 1.6);
  float gust = 0.60 + 0.75 * fbm(p*0.35 + vec2(31.7, 8.3), ft*0.7);
  // A STILL surface has no AMBIENT warp — its geometry rests as exactly its
  // rounded rect. (Freezing only the clock left borders stopped mid-wave, and
  // a full hover warp meant the chat's border — only ever seen while hovered —
  // could never be straight.) But dead-still borders read as not there at all
  // (Colin: "borders aren't interactable"): so a still surface keeps ONE
  // response — a small swell gathered tightly at the cursor (nearM², nothing
  // beyond it), the metal acknowledging the hand while the line stays a line.
  // A still surface's cursor response is the OUTWARD BULGE below (the field
  // inflating), not the noise: cranking this warp instead just made the band
  // wiggle whichever way the fbm leaned and it half-cancelled the bulge.
  // Here, only a faint shimmer rides along.
  float wAmp = uStill > 0.5
             ? ${FLOW_AMP.toFixed(3)} * uHover * 0.35 * nearM * nearM
             : ${FLOW_AMP.toFixed(3)} / visc * uFlow * gust
               * (1.0 + uHover * ${HOVER_BLOB.toFixed(2)} * (0.45 + 0.85 * nearM));
  vec2 warp = (vec2(fbm(p*0.85 + vec2(3.1,7.7), ft*0.85),
                    fbm(p*0.85 + vec2(9.2,1.3), ft*0.76)) * 0.85
             + vec2(fbm(p*2.0 + vec2(17.9,4.2), ft*1.40),
                    fbm(p*2.0 + vec2(6.4,23.1), ft*1.28)) * 0.15) * wAmp;

  // ---- THE TIDE ------------------------------------------------------------
  // It goes into the WARP, never into d. warp is a domain displacement added to
  // p before iconSDF, so the SDF, the band cull, dome, h, the normal, the rim
  // and the AA all inherit it exactly as the ambient breathing does. Writing to
  // d would THICKEN a border band (d = abs(...) - t, so d -= A means t + A)
  // instead of moving it — the wrong gesture, and the one every hairline commit
  // forbids.
  vec2 tide = uLean;
  if (uTideN > 0) {
    // ASPECT-NORMALISED BEARING. The nav frame is about 1.15 x 18 units: a plain
    // normalize(p) gives each long side ~3 degrees of phase and the wave
    // teleports down it. Divided by the box's own half-extents, every side gets
    // roughly a quarter of the circle, so "counterclockwise" means what it says.
    vec2 ext  = (uShape==8 || uShape==10 || uShape==12) ? max(uFrame, vec2(1e-3)) : vec2(1.0);
    vec2 bear = normalize(p/ext + 1e-6);      // WHERE on the perimeter this pixel is
    // A SOFT normalize, not normalize(): at p = 0 a unit outward vector flips
    // direction between adjacent pixels. Below 0.25 units this ramps to zero
    // instead, which also makes the tide a RIM gesture — which is what it is.
    vec2 outw = p / max(length(p), 0.25);     // WHICH WAY the swell pushes
    for (int i = 0; i < ${TIDE_N}; i++) {
      if (i >= uTideN) break;                 // an idle body pays one compare
      vec4 g = uTide[i];
      // exp(k*(c-1)) is a von Mises: it tracks a gaussian in the angle to within
      // a couple of percent for a fraction of the cost, the same trade already
      // measured for the orb's shape masks.
      // MINUS: sampling further out along the outward vector makes the surface
      // bulge TOWARD you, so a positive amplitude is a swell rather than a
      // pinch — which is what the word the presence writes should mean.
      tide -= outw * (g.z * exp(g.w * (dot(bear, g.xy) - 1.0)));
    }
  }
  vec2 q = p + warp + tide;

  // ---- the body: icon → clump morph → core presence ------------------------
  float dIcon = iconSDF(q);
  // THE SPINNING MARK IS A SOLID: while it turns, the 2D field above is
  // replaced by a ray marched through sdSlab — one closed plaque with faces,
  // rounded bevels and side walls, shaded by its own 3D normal (n3).
  vec3 n3 = vec3(0.0, 0.0, 1.0);
  if (spinOn > 0.5) {
    // Half-thickness and edge rounding EQUAL: nothing on the slab is flat-
    // sided. A stroke narrower than the rounding becomes a full round tube
    // (its face-on silhouette is still exactly the glyph's outline — the
    // rounding shrinks then re-inflates), wider areas keep a flat face with
    // fully rounded edges. Bubbly, not geometric, and closed everywhere.
    const float H = 0.10, RR = 0.10;
    vec3 ro = spinM * vec3(q, 2.5);               // the screen ray, in the plaque's frame
    vec3 rd = spinM * vec3(0.0, 0.0, -1.0);
    // fixed count, no break: control flow stays uniform for the derivatives
    // below. Once the ray touches the surface its step is ~0 and it rests.
    float tt = 0.0, near = 1e3;
    for (int i = 0; i < 44; i++) {
      float ds = sdSlab(ro + rd * tt, H, RR);
      near = min(near, ds);
      tt += clamp(ds, 0.0, 0.6);
    }
    float hit = 1.0 - smoothstep(0.0015, 0.004, near);
    vec3 hp3 = ro + rd * tt;
    vec2 e = vec2(0.004, 0.0);
    vec3 nl = normalize(vec3(sdSlab(hp3 + e.xyy, H, RR) - sdSlab(hp3 - e.xyy, H, RR),
                             sdSlab(hp3 + e.yxy, H, RR) - sdSlab(hp3 - e.yxy, H, RR),
                             sdSlab(hp3 + e.yyx, H, RR) - sdSlab(hp3 - e.yyx, H, RR)));
    n3 = transpose(spinM) * nl;                    // back into the screen's frame
    // inside: deep (the 2D rim and dome stand down; the 3D normal shades it).
    // outside: the ray's closest approach — a real distance to the silhouette,
    // so the edge anti-aliases like everything else here.
    dIcon = mix(max(near, 0.0), -0.5, hit);
  }
  float dRound = sdCircle(q, 0.55 + 0.06*uClump);
  float d = mix(dIcon, dRound, clamp(uClump,0.,1.2)*0.85);
  // settle wobble: the surface breathes once as it comes back together
  d += uWobble * 0.032 * sin(t*18.0 + length(p)*9.0);
  // core presence: erode to nothing at pop, regrow through reform
  d += (1.0 - clamp(uCore,0.,1.)) * 0.85;

  // ---- the blade: trail capsules cut, bulge, heal --------------------------
  for(int i=0;i<${TRAIL_N - 1};i++){
    if(i >= uTrailN - 1) break;              // idle buttons pay nothing here
    if(uTrail[i].w < 0.5 || uTrail[i+1].w < 0.5) continue;
    float age = uTrail[i].z;                 // 0 fresh → 1 healed
    float heal = 1.0 - age;
    heal = heal*heal*(3.0-2.0*heal);         // ease-out decay
    if(heal < 0.01) continue;
    float cap = sdCapsule(p, uTrail[i].xy, uTrail[i+1].xy, 0.001);
    float cutW = 0.085 * heal;
    // the cut: smooth-subtract the blade's wake
    d = smax(d, -(cap - cutW), 0.05);
    // conservation of volume: displaced mercury bulges along both edges,
    // with a rebound wobble rippling out as the surface seals
    float seal = sin(min(age*1.25,1.0)*6.283) * 0.35 * (1.0-age);
    float bg = (cap - cutW - 0.075)/0.06;   // squared by hand: pow() is undefined for negative bases
    d -= (0.028 + 0.02*seal) * heal * exp(-bg*bg);
  }

  // ---- droplets: metaball satellites during pop/reform ---------------------
  float dd = 1e5;
  for(int i=0;i<${DROP_N};i++){
    if(i >= uDropN) break;                   // idle buttons pay nothing here
    if(uDrops[i].w < 0.5) continue;
    dd = min(dd, sdCircle(p - uDrops[i].xy, uDrops[i].z));
  }
  d = smin(d, dd, 0.09);

  // A STILL surface's one gesture, made visible: the field INFLATES toward
  // the cursor (deterministic outward swell, tight nearM² falloff) — noise
  // warp alone pointed whichever way the fbm happened to lean and read as
  // nothing. This is the metal rising to meet the hand.
  d -= uStill * uHover * 0.11 * nearM * nearM;


  // ---- derivatives FIRST (control flow is uniform up to here) --------------
  float aa = fwidth(d) + 1e-4;
  float pxUv = fwidth(vUv.x) + 1e-6;
  // ONE DEVICE PIXEL, in shape units. p.x = (vUv.x*2-1)*uRangeX, so 1/uPx is
  // px-per-shape-unit: ~77 on a rail glyph, ~80 on every ring, ~19 on a close
  // button. Every band limit below is written in it, and it is measured LIVE,
  // so it is right at every breakpoint and can never go stale the way a
  // mount-time threshold on cfg.size does (setSize rewrites cfg.size on every
  // window resize).
  float uPx = pxUv * 2.0 * uRangeX;
  vec2 dgd = vec2(dFdx(d), dFdy(d));           // raw d-gradient, per PIXEL
  vec2 gd = dgd / pxUv;                        // d-gradient per uv unit
  // fwidth is |dFdx| + |dFdy|, which over-estimates the true footprint by up to
  // sqrt(2) — and it does so EXACTLY on the diagonals, i.e. on the corner
  // radii, which is where the eye already goes. length() is isotropic.
  float ag = length(dgd) + 1e-5;


  // EXACT BOX-FILTER COVERAGE. smoothstep(-fwidth, fwidth, d) is a 2.0-2.8
  // device-pixel ramp; the analytic coverage of a straight edge across one
  // pixel is 0.5 - d/|grad d|. EDGE_W widens it slightly so a 3px band reads
  // crisp rather than hard. Why this is hairline-SAFE and not just hairline-
  // hopeful: the 50% crossing does not move, and BOTH the old smoothstep and
  // the new clamp are odd-symmetric about it, so a border band's INTEGRATED
  // alpha is unchanged. This sharpens the line; it cannot thin it.
  //   EDGE_W 0 emits today's line verbatim. If it reads hard on the frame ring
  //   the dial is 1.15 → 1.40 → 1.70; do NOT go back to smoothstep.
  float edge = ${EDGE_W > 0 ? 'clamp(0.5 - d/(ag*' + EDGE_W.toFixed(2) + '), 0.0, 1.0)' : '1.0 - smoothstep(-aa, aa, d)'};
  // Border shapes draw NOTHING beyond their own band. The warp's gradient
  // kinks can inflate fwidth(d) locally and leak a faint alpha ridge well
  // inside the box (a ghost hairline paralleling the border, ~a band-width
  // in) — whatever the leak's origin, the band plus its AA lives within
  // ~1.6 band-widths of the edge, so everything past that is culled.
  if(uShape==8 || uShape==10 || uShape==12){
    edge *= 1.0 - smoothstep(uFrameT*1.6, uFrameT*2.6, d);
  }
  if(edge < 0.004){ frag = vec4(0.); return; }

  // dome height + normal from the SDF gradient + dome falloff. The curvature
  // reaches deep into the body (0.55) so interiors carry the smooth top-lit
  // gradient of a chrome bead instead of going flat.
  // The dome's DEPTH has to match the feature it is doming. A solid button is
  // about a shape-unit across, so 0.55 is right for it. A ring is only uFrameT
  // wide — and uFrameT shrinks as the box it wraps grows, because the band is
  // held px-constant while shape space stretches to the box. On a tall feed
  // card the band is ~0.006 units against a 0.55 dome: the dome never develops,
  // the normal stays flat, the speculars never resolve, and the metal reads as
  // dull grey next to an identical rim on a short card. Same rim, different box,
  // visibly different material — which is the bug. Scale the depth to the band
  // and a ring shades the same at any size.

  float dome = 0.55;
  if (uShape == 8 || uShape == 10 || uHollow > 0.5) dome = clamp(uFrameT * 2.4, 0.02, 0.55);

  // The axis is resolved HERE, before the normal, because the normal depends on
  // it — see the curvature lift below. bodyAmt and sizeFade moved up with it;
  // the parameter table that reads them still lives further down.
  float bodyAmt = smoothstep(0.06, 0.30, dome)
                * ((uShape==8 || uShape==10 || uShape==12 || uHollow > 0.5) ? 0.0 : 1.0);
  float sizeFade = smoothstep(24.0, 52.0, 1.0/uPx);
  float matAx = uMat * mix(${BORDER_MAT.toFixed(2)}, 1.0, bodyAmt);

  float h = sqrt(clamp(-d/dome, 0.0, 1.0));
  float hp = (d > -dome) ? -1.0/(2.0*dome*max(h,0.06)) : 0.0;   // dh/dd
  // CURVATURE IS THE GLASS'S ONLY SOURCE OF FORM, so it is coupled to the axis.
  //
  // Measured: with uBevel 1, n.z ranges only 0.966..0.996 across a whole glyph —
  // the dome is very nearly flat. Chrome never minded, because its form came
  // from reflectance, not shape: fres sat at a constant 0.72 while R.y = 2*n.y
  // swung +/-0.53 through the studio's hot band. A dielectric multiplies that
  // same swing by F0 ~ 0.08, and its refracted ray swings 6.6x LESS again — so
  // on this geometry glass has almost nothing left to be shaped by. Michelson
  // contrast measured 0.862 at uMat 0 and 0.092 at uMat 0.6: a 9.4x collapse,
  // and the founder's "flatter, less 3d".
  //
  // Raising curvature costs chrome nothing (0.862 -> 0.875 from bevel 1 to 8)
  // and is worth everything to glass (0.093 -> 0.423 over the same range). So
  // it is a COMPENSATION, not a restyle: at uMat 0 the factor is exactly 1.0
  // and the metal is byte-identical, and the glass gets the geometry it needs
  // to be a solid at all. Per-mount uBevel still multiplies on top.
  vec2 gh = gd * hp * 0.026 * uBevel * (1.0 + matAx * ${BEVEL_LIFT.toFixed(1)});
  vec3 n = normalize(vec3(-gh, 1.0));

  if (spinOn > 0.5) n = n3;   // a solid's own normal — faces, bevels and walls

  // ---- THE MATERIAL AXIS: mercury → glass → water --------------------------
  // Every default below IS today's metal, and every material line lives inside
  // one uniform branch. A body at uMat 0, and EVERY border ring at ANY uMat,
  // takes the false side and executes exactly the code this shader shipped
  // with — not "carefully tuned to be safe", algebraically the same code.
  //
  // bodyAmt — "does this thing have an INTERIOR?" The shape test is PRIMARY:
  // frame(8) / line(10) / railedge(12) / hollow pill are band-and-meniscus with
  // nothing in between, and it also catches shape 12, which the dome branch
  // above does not. The dome smoothstep is the backstop for anything new that
  // domes shallow. Do NOT use the dome test alone: a framePx-7 slider track
  // domes to 0.21 and a framePx-5 sheet frame to 0.15, so on its own it would
  // hand those rings 68% and 35% of the material.

  // bodyAmt / sizeFade / matAx are resolved above, with the dome — the normal
  // needs the axis before it can be built. sizeFade gates ALPHA only: a mark
  // under ~28 device px across a shape unit is almost all meniscus, with no
  // face for transmission to open, so it would read as "faded", not as glass.
  float F0 = 0.72, Fpow = 2.0, eta = 1.0, transGain = 0.0, clarity = 0.0;
  float kGain = 1.25, kPow = 26.0, fGain = 0.30, fPow = 46.0;
  float shW = 2.2, shA = 0.06, metalAmt = 1.0;
  vec3  absorb = vec3(0.0);
  if (matAx > 0.001) {
    float gA = clamp(matAx*2.0,       0.0, 1.0);   // MERCURY → GLASS
    float gB = clamp(matAx*2.0 - 1.0, 0.0, 1.0);   // GLASS   → WATER
    F0        = ax1(0.72, 0.09, 0.05, gA, gB);   // metal reflects at every angle;
    Fpow      = mix(2.0, 5.0, gA);               //   a dielectric only at grazing
    eta       = mix(1.0, 0.70, gA);              // 1/IOR — one dielectric, n≈1.43
    transGain = mix(0.0, ${TRANS_GAIN.toFixed(2)}, gA);
    clarity   = ax1(0.0, 0.34, 0.42, gA, gB);    // the ALPHA budget
    absorb    = ax3(vec3(0.0), vec3(1.60,0.85,0.55), vec3(4.20,1.90,1.05), gA, gB);
    kGain     = ax1(1.25, 1.50, 1.70, gA, gB);   // as F0 falls the broad env
    kPow      = ax1(26.0, 22.0, 18.0, gA, gB);   //   reflection dies, so the
    fGain     = ax1(0.30, 0.40, 0.50, gA, gB);   //   punctual glint has to carry
    fPow      = ax1(46.0, 38.0, 30.0, gA, gB);   //   the surface read
    shW       = ax1(2.2,  1.9,  1.6,  gA, gB);   // water's sheen is a wet sheet
    shA       = ax1(0.06, 0.09, 0.12, gA, gB);
    metalAmt  = 1.0 - gA;                        // impurities are a MERCURY cue
  }

  // ---- interior drift: reflections crawl even when the silhouette is calm --
  // gentle: too much here is what reads as "texture" instead of polish
  vec2 drift = vec2(fbm(p*0.7 + vec2(21.7, 5.1), ft*0.43),
                    fbm(p*0.7 + vec2(4.9, 17.3), ft*0.37));
  n = normalize(vec3(n.xy + drift*0.02, n.z));


  // ---- the two lobes: what bounces off, and what goes through --------------
  // How well is the dome resolved at this pixel? aa is the footprint in shape
  // units, dome the feature's depth. A ring is ~0.14; a size-77 button ~0.023.
  float blurR = smoothstep(0.05, 0.20, aa / max(dome, 1e-4));
  float bw = 0.12 * (1.0 + ${HOT_BL.toFixed(1)}*blurR);
  vec3 R = reflect(vec3(0.,0.,-1.), n);
  float envL = studioEnv(R.y, uFloor, uBand, bw);
  float fres = 0.72 + 0.28*pow(1.0 - clamp(n.z,0.,1.), 2.0);
  vec3 trans3 = vec3(0.0);
  if (matAx > 0.001) {
    // A metal's Fresnel is floored at 0.72 — "it is chrome, it mirrors at every
    // angle". A dielectric's is Schlick: a few percent face-on, 1.0 at grazing.
    // Note what that buys for free: at the SILHOUETTE the dome turns away,
    // cos → 0, fres → 1, and the rim is a perfect mirror at every knob
    // position. Transmission can only ever open in the FACE. base clamped
    // before pow(), the house form (see the line this replaces).
    fres = F0 + (1.0 - F0)*pow(1.0 - clamp(n.z,0.,1.), Fpow);
    // eta < 1 entering from air, so k = 1 - eta*eta*(1-cos*cos) is always > 0:
    // total internal reflection cannot happen here and refract() can never
    // return vec3(0). Tv.y sweeps the studio ~8x more slowly than R.y and in
    // the OPPOSITE sense — a slow inverted ghost behind a fast bright mirror
    // is the whole reason this reads as "through" and not as a second mirror.
    vec3 Tv = refract(vec3(0.,0.,-1.), n, eta);
    // The floor the transmitted ray sees is LIFTED: what is actually behind a
    // rail glyph is #nav-sheet's frost, not a black studio floor. max() so this
    // can only ever RAISE a floor, never pull one down — a downward pull at the
    // band is the hairline's own shape.
    float envT = studioEnv(Tv.y, max(uFloor, 0.34), uBand, bw);
    // Beer-Lambert down the dome. h is ALREADY normalised by dome, so a
    // coefficient means the same thing on every body — depth-graded colour,
    // clear at the rim, deep in the middle, which is what separates water from
    // tinted metal. Red goes first. exp(-x), never pow(negative, n).
    trans3 = envT * (1.0 - fres) * transGain * exp(-absorb * h);
  }
  // a turned surface reads as metal seen edge-on: darker, less of the sky
  float turn = mix(1.0, 0.62, spinOn * smoothstep(0.55, 0.95, length(n.xy)));
  float silver = envL * fres * turn;
  trans3 *= turn;

  // faint anisotropic streaking aligned with local flow
  vec2 fd = normalize(drift + vec2(1e-3));
  vec2 fp = vec2(-fd.y, fd.x);
  silver += 0.012 * snoise(vec2(dot(p,fp)*9.0, dot(p,fd)*1.6) + vec2(ft*0.37 + uSeed));


  // twin speculars: a hot key upper-left, a faint fill lower-right.
  // BAND-LIMITED, and energy-conserving. On a size-77 button dome is 0.55 and
  // hp blows up at the rim: the ^26 lobe's visible annulus is ~0.24 device px
  // wide — 8x under Nyquist, point-sampled, and THAT is the crawling bright
  // fringe hugging every silhouette. swing is how far the dome's slope moves
  // across ONE device pixel, finite-differenced analytically from quantities
  // we already have (fwidth(n) would be illegal: n only exists below the
  // non-uniform edge<0.004 return). Unlike a per-shape blur this is spatially
  // varying and peaks exactly at the rim, which is where the spike is.
  //   The (kP+1)/(kPow+1) factor is the solid-angle ratio of cos^k: a lobe that
  //   was a 0.24px spike becomes a ~2px smear of the SAME integrated
  //   brightness. Not a gain fudge — the exact energy compensation.
  //   At SPEC_BL 0, sharp is exactly 1.0, kP is exactly kPow, the factor is
  //   exactly 1.0, and hN/hpN/swing are dead-coded. An exact, free revert.
  vec3 L1 = normalize(vec3(-0.5, 0.62, 0.60));
  vec3 L2 = normalize(vec3(0.55, -0.30, 0.78));
  float hN    = sqrt(clamp((-d + uPx) / dome, 0.0, 1.0));
  float hpN   = -1.0 / (2.0 * dome * max(hN, 0.06));
  float swing = abs(length(gd * hpN * 0.026 * uBevel) - length(gh));
  float sharp = 1.0 / (1.0 + ${SPEC_BL.toFixed(1)} * swing);
  float kP = mix(4.0, kPow, sharp);
  float fP = mix(6.0, fPow, sharp);

  // Kept as its own quantity, not just folded into silver: it is what
  // re-opacifies the glass below. Driving that off total brightness does not
  // work — the dielectric Fresnel drops the whole range (silver falls from
  // ~0.8 to ~0.07 at the glass end), so an absolute threshold that was right
  // for chrome never fires again. The highlight's own strength is the honest
  // driver and it is invariant to where the knob sits.
  float specAmt = kGain * ((kP + 1.0)/(kPow + 1.0)) * pow(max(dot(n,L1),0.), kP)
                + fGain * ((fP + 1.0)/(fPow + 1.0)) * pow(max(dot(n,L2),0.), fP);
  silver += specAmt;

  // glossy shine: an angled sheen drifting across the dome, and on hover-enter
  // a crisp sweep crossing once (SWEEP_ANGLE above sets the direction).
  vec2 shDir = normalize(vec2(${SWEEP_ANGLE[0].toFixed(2)}, ${SWEEP_ANGLE[1].toFixed(2)}));
  float sAx = dot(p, shDir);

  // width and amplitude ride the axis: water's sheen is a broad wet sheet.
  // NO CLOCK IS TOUCHED — "wetter" comes from the profile, not from ft.
  float b1 = (sAx - sin(ft*0.6 + uSeed*3.0)*1.2) * shW;
  silver += shA * uBand * exp(-b1*b1) * h;
  if (uSweep < 0.999) {
    float b2 = (sAx - mix(-1.7, 1.7, uSweep)) * 3.0;
    silver += 0.55 * exp(-b2*b2) * (1.0 - uSweep) * h;
  }

  // sparse micro-speckle (impurities) drifting slowly with the flow
  vec2 sp = (p - drift*0.5) * 13.0;
  vec2 cell = floor(sp);
  float rnd = fract(sin(dot(cell, vec2(127.1,311.7)) + uSeed*17.0)*43758.5453);

  // Two gates. Impurities are a MERCURY cue — they read as dirt on glass — and
  // the dot is sub-pixel EVERYWHERE in this app: a 1.7px disc with a 0.6px ramp
  // at PPU 80, 0.41px at PPU 19. Point-sampled, it twinkles on buttons and
  // stipples dark nicks into border bands. So it retires with the axis, and
  // what survives is widened to at least a pixel with its apparent weight
  // conserved by the area ratio. At SPECK_BL 0 every term folds to exactly 1.0
  // and this is line-for-line today's speckle.
  float speckBL = mix(1.0, smoothstep(4.0, 8.0, 1.0/(13.0*uPx)), ${SPECK_BL.toFixed(1)});
  if(rnd > 0.993){
    float ds = length(fract(sp)-0.5);
    float cellPx = uPx * 13.0;                   // one device pixel, in CELL units
    float r0 = mix(0.04, max(0.04, cellPx*0.60), ${SPECK_BL.toFixed(1)});
    float r1 = mix(0.14, min(0.48, max(0.14, cellPx*1.80)), ${SPECK_BL.toFixed(1)});
    float wgt = min(1.0, (0.14*0.14)/(r1*r1));   // conserve apparent weight
    silver *= mix(1.0, mix(0.78, 1.0, smoothstep(r0, r1, ds)),
                  metalAmt * speckBL * wgt);
  }

  // ---- meniscus: a slim dark rim at the edge (kept light — heavy rims read
  // as outlines, not liquid) --------------------------------------------------
  float rim = smoothstep(0.0, uRim, -d);
  if (spinOn > 0.5) rim = smoothstep(0.0, 0.30, n.z);   // dark where the surface turns away
  // the rim's base darkness follows the floor: on a border (bright floor) a
  // near-black base painted the outermost AA pixels as a faint dark outline

  vec3 base = mix(vec3(0.035,0.039,0.047), vec3(0.30,0.31,0.33), smoothstep(0.2, 0.5, uFloor));
  // METAL IS GROUNDED; GLASS IS EDGE-LIT. A dark meniscus is what says "solid
  // body of metal"; a dielectric's edge is BRIGHTER than its face, because at
  // grazing angles fres → 1. Averaging the two gives a flat grey ring — as a
  // PARAMETER it rolls continuously from one to the other. On this app's
  // rim 0.055 buttons that lip is the largest single block of pixels the eye
  // reads as material identity, so this is the highest-leverage look change here.
  //   The cool cast is where the glass edge gets its colour: a STATIC tint, not
  //   a second env tap. A dispersion offset would be chromatic point-sampling
  //   of a 0.12-wide hot band, i.e. new aliasing, for the same read.
  //   bodyAmt is 0 on every ring, so no border's base moves by one bit at any
  //   knob position. (1.0 - spinOn) holds the spinning plaque out: on THAT
  //   branch rim is not a meniscus at all, it is a whole-surface form shader
  //   (rim = smoothstep(0.0, 0.30, n.z) above), and lifting it would wash out
  //   the dark side walls that make the slab read as a solid turning.
  base = mix(base, vec3(silver) * vec3(0.68, 0.72, 0.78),
             clarity * bodyAmt * (1.0 - spinOn));
  // trans3 is added INSIDE the rim mix, so it is exactly zero at the
  // silhouette — and (1-fres) → 0 at grazing anyway. Nothing new darkens or
  // thins as d → 0. The reflection keeps its neutral 1.5% blue lean: ALL of
  // the material's colour comes from the body, where a dielectric's colour
  // physically lives. Tinting the reflection too reads as coloured metal.
  vec3 col = mix(base,
                 vec3(silver*0.985, silver, min(1.0, silver*1.015)) + trans3, rim);

  // ---- focus: a glint traveling the silhouette -----------------------------
  if(uFocus > 0.01){
    float ang = atan(p.y, p.x);
    float sweep = mod(t*1.7, 6.28318) - 3.14159; // t: freezes under reduced motion
    float dAng = abs(atan(sin(ang-sweep), cos(ang-sweep)));
    float onRim = smoothstep(0.10, 0.0, -d) * smoothstep(0.085, 0.0, d);
    col += uFocus * onRim * smoothstep(0.9, 0.0, dAng) * vec3(0.9);
  }


  // COVERAGE AND OPACITY ARE SEPARATE QUANTITIES. edge stays the pure AA and
  // cull mask — the uShape 8/10/12 band cull and the edge<0.004 discard both
  // still key on IT, never on a, so a translucent body can never lose its
  // outermost AA ramp. The Fresnel shape is physically right and it keeps the
  // SILHOUETTE OPAQUE for free: grazing pixels reflect, so the outline never
  // softens into the page. uTrans is 0 on every ring, every spinning mark, the
  // bead and the login wordmark, so a is exactly 1.0 there and this is
  // byte-for-byte the vec4(col*edge, edge) it replaces.
  float clr = clarity * bodyAmt * uTrans * sizeFade;
  float a = 1.0 - clr * (1.0 - fres) * (1.0 - rim*0.35);
  if (clr > 0.001) {
    // GLOSS RE-OPACIFIES. You cannot see through a specular highlight — and a
    // premultiplied pixel whose rgb exceeds its alpha unpremultiplies past
    // white, which the WebGL→2D drawImage may or may not survive depending on
    // the browser. One pair of lines answers both: the highlight core goes
    // fully opaque (which is also how glass photographs, and it keeps the
    // highlights at full punch on a body you can see the room through), and
    // any leftover headroom is scaled HUE-PRESERVINGLY, so rgb <= a is
    // GUARANTEED rather than hoped. The driving quantity is the band-limited
    // specular, so the alpha ramp rides the highlight's own pixel footprint —
    // it never introduces a transition narrower than the term that drives it.

    // You cannot see through a specular highlight. specAmt is the band-limited
    // twin-lobe sum, so the alpha ramp rides the highlight's own pixel
    // footprint and can never introduce a transition narrower than the term
    // driving it. The sheen band (shA, ~0.12) sits below the ramp's foot, so a
    // broad wet sheet stays translucent while a punctual glint goes solid —
    // which is the difference between "wet" and "lit".
    a = mix(a, 1.0, smoothstep(0.22, 0.85, specAmt));
    // rgb <= a is then GUARANTEED, not hoped: premultiplied output is col*a, so
    // the invariant is simply col <= 1. Hue-preserving, so a clipped highlight
    // desaturates the way film does rather than shifting colour.
    float mx = max(col.r, max(col.g, col.b));
    col *= 1.0 / max(1.0, mx);
  }
  frag = vec4(col*a*edge, a*edge); // premultiplied — col*a, not col
}`;

// ---------------------------------------------------------------------------
// raster → SDF (8SSEDT signed distance transform)
// ---------------------------------------------------------------------------
function edt(mask, w, h) { // mask 0..1 → signed distance in px (+ outside)
  const INF = 1e9;
  const mk = (inside) => {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const on = inside ? mask[i] > 0.5 : mask[i] <= 0.5;
      gx[i] = on ? 0 : INF; gy[i] = on ? 0 : INF;
    }
    const compare = (x, y, ox, oy) => {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const j = ny * w + nx, i = y * w + x;
      const cx = gx[j] + ox, cy = gy[j] + oy;
      if (cx * cx + cy * cy < gx[i] * gx[i] + gy[i] * gy[i]) { gx[i] = cx; gy[i] = cy; }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) { compare(x, y, -1, 0); compare(x, y, 0, -1); compare(x, y, -1, -1); compare(x, y, 1, -1); }
      for (let x = w - 1; x >= 0; x--) compare(x, y, 1, 0);
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) { compare(x, y, 1, 0); compare(x, y, 0, 1); compare(x, y, -1, 1); compare(x, y, 1, 1); }
      for (let x = 0; x < w; x++) compare(x, y, -1, 0);
    }
    const out = new Float32Array(w * h);
    // Math.hypot is ~8x slower than the naive form here: it carries an
    // overflow-safe scaling path that these bounded pixel distances never need.
    for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
    return out;
  };
  const dOut = mk(false), dIn = mk(true);
  const sd = new Float32Array(w * h);
  // dIn: distance to the glyph (0 inside it) · dOut: distance to the outside
  // (0 outside). Signed = dIn − dOut → negative inside, positive outside.
  for (let i = 0; i < w * h; i++) sd[i] = dIn[i] - dOut[i];
  return sd;
}

// Two mounts can ask for the SAME bake: the wordmark and the login logo are the
// same cursive png at the same thicken and ratio, and that bake is the single
// most expensive one at boot. The SDF is resolution-independent and nothing
// ever calls gl.deleteTexture, so one texture can safely serve both.
// Cleared on context restore, where every texture dies at once.
const BAKE_CACHE = new Map();   // key → Promise<WebGLTexture>

// The SDF encodes distance in SHAPE units, not pixels, and is sampled with
// LINEAR filtering — so baking far above the destination canvas buys nothing at
// all. On a phone the five icon bakes were feeding ~89px canvases from a 512px
// grid: a 40x oversample, each one a synchronous 8SSEDT pass on the main thread
// AFTER the orb loop has started, so each arrived as a visible hitch. Deriving
// the bake from the real render size keeps the cursive hairlines honest (the
// BAKE_H comment above is a real warning) while cutting the work ~5x.
function bakeHeightFor(outH) {
  return COARSE ? Math.min(BAKE_H, Math.max(128, Math.round(outH * 1.4))) : BAKE_H;
}
function bakeKeyFor(src, ratio, bakeH, rangeY) {
  const id = src.svgPath ? 'p|' + src.svgPath + '|' + (src.strokeWidth ?? '')
    : src.imageEl ? 'i|' + (src.imageEl.currentSrc || src.imageEl.src || '')
    : src.svgEl ? 'e|' + src.svgEl.outerHTML
    : 'x';
  // rangeY belongs in the key: it sets how far the mark is inset in the
  // texture, so two mounts of the same art at different ranges are NOT the
  // same bake and must not share one.
  return id + '||' + (src.thicken ?? '') + '|' + ratio.toFixed(3) + '|' + bakeH + '|' + rangeY.toFixed(3);
}
function bakeSDF(gl, src, bakeH, ratio, rangeY = EXTENT) {
  const key = bakeKeyFor(src, ratio, bakeH, rangeY);
  let p = BAKE_CACHE.get(key);
  if (!p) { p = rasterToSDF(gl, src, bakeH, ratio, rangeY); BAKE_CACHE.set(key, p); }
  return p;
}

async function rasterToSDF(gl, source, tilePx, ratio = 1, rangeY = EXTENT) {
  // source: {svgPath, strokeWidth?} | {svgEl} | {imageEl} → alpha → SDF texture.
  // ratio = rangeX/EXTENT: the texture is baked at the shape's own aspect so a
  // wide mark spends its pixels on the mark, not on empty margin.
  const H = tilePx, W = Math.round(tilePx * ratio);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  // The mark occupies the inner 1/rangeY of the texture, matching the range the
  // shader will sample with. Baking against EXTENT while sampling a tighter
  // range would render the mark smaller by exactly that ratio.
  const pad = H * (1 - 1 / rangeY) * 0.5;
  const box = H - pad * 2;
  const boxW = W - pad * 2;
  if (source.svgPath) {
    const path = new Path2D(source.svgPath);
    // measure the path with a throwaway svg (Path2D has no bbox API)
    const svgNS = 'http://www.w3.org/2000/svg';
    const meas = document.createElementNS(svgNS, 'svg');
    const pth = document.createElementNS(svgNS, 'path');
    pth.setAttribute('d', source.svgPath);
    meas.appendChild(pth);
    meas.style.cssText = 'position:absolute;width:0;height:0;opacity:0;';
    document.body.appendChild(meas);
    const bb = pth.getBBox();
    document.body.removeChild(meas);
    const stroke = source.strokeWidth || 0;
    const s = Math.min(boxW / (bb.width + stroke), box / (bb.height + stroke));
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(s, s);
    g.translate(-(bb.x + bb.width / 2), -(bb.y + bb.height / 2));
    if (stroke) {
      g.lineWidth = stroke; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#fff'; g.stroke(path);
    } else {
      g.fillStyle = '#fff'; g.fill(path);
    }
    g.restore();
  } else {
    let img = source.imageEl;
    if (source.svgEl) {
      // clone standalone: solid white paint, no external url() refs, no filters
      const clone = source.svgEl.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.removeAttribute('class');
      const thicken = source.thicken || 1;
      for (const node of [clone, ...clone.querySelectorAll('*')]) {
        if (node.getAttribute && node.getAttribute('fill') && node.getAttribute('fill') !== 'none') node.setAttribute('fill', '#fff');
        if (node.getAttribute && node.getAttribute('stroke') && node.getAttribute('stroke') !== 'none') node.setAttribute('stroke', '#fff');
        if (thicken !== 1 && node.getAttribute && node.getAttribute('stroke-width')) {
          node.setAttribute('stroke-width', String(parseFloat(node.getAttribute('stroke-width')) * thicken));
        }
        node.removeAttribute && node.removeAttribute('filter');
      }
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      img = new Image();
      await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
      URL.revokeObjectURL(url);
    } else if (img && !img.complete) {
      await new Promise((res) => { img.onload = res; img.onerror = res; });
    }
    const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1;
    const s = Math.min(boxW / iw, box / ih);
    const w = iw * s, hgt = ih * s;
    // thin marks get body: nudged copies before the distance transform act as
    // a dilate; thicken > 1 widens the radius and adds the diagonals. The
    // radius is a fraction of the MARK, so weight is identical at any bake
    // resolution (absolute px made it dpr-dependent and over-fat at 512).
    const rad = 0.012 * (source.thicken || 1) * box;
    const taps = [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]];
    if ((source.thicken || 1) > 1) {
      const dg = rad * 0.71;
      taps.push([dg, dg], [-dg, dg], [dg, -dg], [-dg, -dg]);
    }
    for (const [ox, oy] of taps) {
      g.drawImage(img, (W - w) / 2 + ox, (H - hgt) / 2 + oy, w, hgt);
    }
  }
  const data = g.getImageData(0, 0, W, H).data;
  const mask = new Float64Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] / 255;
  // Time ONLY the synchronous stretch. rasterToSDF as a whole awaits image
  // decode, so wall-clock across the function would report waiting, not work —
  // and it is the blocking part that lands as a hitch in an already-running
  // animation loop.
  const bakeT0 = performance.now();
  const sd = edt(mask, W, H);
  // Encode in SHAPE units (±RANGE about the edge), so the shader math is
  // independent of bake resolution / devicePixelRatio.
  const pxPerUnit = H / (2 * rangeY);   // match the range the shader samples with
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < sd.length; i++) {
    // subpixel: the binarized transform lands on the grid, so nudge the edge by
    // the pixel's own coverage — this is what stops thin marks reading blocky
    const cov = mask[i] - 0.5;
    const v = Math.max(0, Math.min(255, 127.5 + ((sd[i] - cov) / pxPerUnit / SDF_RANGE) * 127.5));
    px[i * 4] = v; px[i * 4 + 3] = 255;
  }
  // Boot cost, for the ?perf HUD. These bakes land AFTER the orb loop has
  // started, so excess here is felt as a hitch, not as a slow load.
  if (typeof window !== 'undefined') {
    window.__mercBakePx = (window.__mercBakePx || 0) + W * H;
    window.__mercBakeMs = (window.__mercBakeMs || 0) + (performance.now() - bakeT0);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // canvas rows are top-first
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ---------------------------------------------------------------------------
// shared renderer (one WebGL2 context for every button)
// ---------------------------------------------------------------------------
const SHAPES = { plus: 0, bars: 1, broadcast: 2, bubble: 3, ring: 4, blobs: 5, bubblewide: 7, frame: 8, pill: 9, line: 10, disc: 11, railedge: 12 };
// Renderer canvas: room for the widest frame at device res. These clamp the
// pixel scale of anything bigger (sc = min(dpr, RES/box)), so they are also
// the resolution ceiling — every ring taller or wider than RES device pixels
// renders UNDER device resolution and is blitted up soft (the "pixelage").
// The first bump (768→1536 tall) missed the two biggest rings on screen: the
// RAILS are full viewport height (~900 CSS × dpr 2 = 1800) and the expanded
// chat is nearly full viewport width. 2048 tall covers a full-height rail on
// any laptop at dpr 2; 3072 wide covers the widest surfaces. Memory cost is
// one shared canvas; per-frame cost is unchanged (each body still renders
// only its own viewport within it).

// SIZED TO THE DISPLAY, not to a guess. 3072x2048 was a fixed pair, and on any
// screen wider than 1536 CSS px at dpr 2 the clamp bound on the biggest surface
// in the app: measured on a 16" MacBook, the full-viewport frame ring came out
// at 3072 backing pixels for 1746 CSS — 1.7595 per CSS pixel against a display
// that has exactly 2. That is a FRACTIONAL RESAMPLE, and the SS comment at the
// top of this file spends a paragraph on why that is the one thing you must not
// do to a high-contrast edge: some display pixels take one source pixel and
// their neighbours take two, and the beat between them IS the stair-stepping.
// It was doing it to the longest, straightest, most-looked-at lines on screen.
//
// So: allocate what THIS display actually needs. screen (not the window) so a
// resize never outgrows it, rounded up to 256 so a few pixels of drift cost
// nothing, and capped for memory.
//   The cap is not a fudge — see resScale() below, which is what makes the
// remaining case safe rather than merely smaller.
//   Phones GAIN from this: at dpr 1.5 on a 390pt screen this allocates
// 768x1280 (3.9MB) where the fixed pair allocated 3072x2048 (25MB).
const RES_CAP = 4096;
const [RES_W, RES_H] = (() => {
  if (typeof screen === 'undefined' || !screen.width) return [3072, 2048];
  const d = Math.min(COARSE ? 1.5 : 3, (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) || 1);
  const up = (v) => Math.min(RES_CAP, Math.max(1024, Math.ceil((v * d) / 256) * 256));

  // portrait phones and rotated tablets: cover both orientations. And take the
  // WINDOW into account as well as the screen — they are normally the same or
  // smaller, but browser zoom moves them apart, and a window can legitimately
  // report larger than screen.width (a scaled display, a device-emulating
  // devtools viewport). Sizing to the larger of the two costs nothing on an
  // ordinary machine and is the difference between covering the surface and
  // silently falling back to the snap.
  const winW = typeof innerWidth === 'number' ? innerWidth : 0;
  const winH = typeof innerHeight === 'number' ? innerHeight : 0;
  const w = Math.max(screen.width, screen.height, winW, winH);
  const h = Math.max(Math.min(screen.width, screen.height), Math.min(winW, winH));
  return [up(w), up(h)];
})();
// WHEN THE CLAMP STILL BINDS — a 5K display, or a surface larger than the
// screen — snap DOWN to a whole number of device pixels per CSS pixel. A clean
// 1:2 box filter reads uniformly soft; 1.76 reads as crawling stair-steps on
// every curve, which is worse and is what people report as "pixelation". Below
// 1 there is no clean option left, so the fraction stands.
function resScale(want, cssW, cssH) {
  const sc = Math.min(want, RES_W / cssW, RES_H / cssH);
  return sc >= 1 && sc < want - 1e-6 ? Math.floor(sc) : sc;
}
let R = null;

function setupGL(gl, tile) {
  // Builds (or rebuilds, after context restore) the program + quad + uniforms.
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[mercury]', gl.getShaderInfoLog(s));
      // surfaced to the hull: a shader that fails only on SOME machines is
      // exactly the failure nobody can see from the outside
      try { window.__mercErr = String(gl.getShaderInfoLog(s)).slice(0, 160); } catch { /* reporting only */ }
      return null;
    }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[mercury]', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const name of ['uShape', 'uSDF', 'uTime', 'uSeed', 'uFlow', 'uVisc', 'uOctaves',
    'uTrail', 'uDrops', 'uClump', 'uCore', 'uWobble', 'uFocus', 'uReduced',
    'uMouse', 'uHover', 'uSweep', 'uRangeX', 'uRangeY', 'uBulge', 'uFrame', 'uFrameT',

    'uTrailN', 'uDropN', 'uHollow', 'uBand', 'uRim', 'uRadius', 'uStill', 'uFloor', 'uSpin', 'uBevel',

    'uMat', 'uTrans', 'uTide', 'uTideN', 'uLean']) {
    U[name] = gl.getUniformLocation(prog, name);
  }
  gl.uniform1i(U.uSDF, 0);
  gl.enable(gl.SCISSOR_TEST); // clears cost only each button's own tile
  return U;
}

function renderer() {
  if (R) return R;
  // The cap at 2 undersampled every mark and ring for anyone whose effective
  // ratio is higher — browser zoom multiplies devicePixelRatio, so 125% zoom
  // on a retina screen is dpr 2.5 and the whole UI rendered at 80% and was
  // scaled up soft ("pixelage" nothing else explained). Fine pointers get the
  // truth up to 3; touch keeps 1.5 (fill-rate bound).
  const dpr = Math.min(COARSE ? 1.5 : 3, window.devicePixelRatio || 1);
  const tile = Math.round(TILE * dpr); // SDF bake resolution (rendering is display-res)
  const canvas = document.createElement('canvas');
  canvas.__mercShared = true;   // the ?perf HUD counts snapshots out of this one
  canvas.width = RES_W;
  canvas.height = RES_H;
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return { gl: null };                 // not cached: a later mount may retry
  const U = setupGL(gl, tile);
  if (!U) return { gl: null };
  // octaves 2: the 3rd octave is fine detail the smooth look doesn't want,
  // and it's ~a third of the noise cost across every pixel of every button
  R = { gl, canvas, tile, dpr, U, buttons: new Set(), running: false, frameMs: [], octaves: 2, fc: 0 };
  // Survive GPU resets: preventDefault invites a restore; on restore, rebuild
  // program state and re-bake every raster SDF (their textures died with the
  // old context). Frames are skipped while lost, so buttons freeze, not blank.
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => {
    const U2 = setupGL(gl, tile);
    if (!U2) return;
    R.U = U2;
    // every texture died with the old context, so the cache must go too —
    // otherwise a restore hands out promises for textures that no longer exist.
    BAKE_CACHE.clear();
    for (const b of R.buttons) {
      b.tex = null;
      if (b.shapeId === 6 && b.bakeSrc) {
        bakeSDF(gl, b.bakeSrc, b.bakeH || BAKE_H, b.bakeRatio || 1, b.rangeY || EXTENT).then((tex) => { b.tex = tex; }).catch(() => {});
      }
    }
  });
  return R;
}

// one MediaQueryList for the lifetime of the page (matchMedia per call is a
// real cost at 16 buttons × 60fps × pointermove)
const REDUCED_MQ = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const reduced = () => REDUCED_MQ.matches;
let mountSeq = 0; // staggers idle-rate rendering across buttons

// ---------------------------------------------------------------------------
// frame loop
// ---------------------------------------------------------------------------
function startLoop() {
  const r = R;
  if (r.running) return;
  r.running = true;
  let last = performance.now();
  const trailVals = new Float32Array(TRAIL_N * 4);
  const dropVals = new Float32Array(DROP_N * 4);
  const frame = (now, schedule = true) => {
    if (!r.buttons.size) { r.running = false; return; }
    // schedule FIRST: no per-frame throw can ever kill the shared loop
    if (schedule) requestAnimationFrame(frame);
    if (r.gl.isContextLost()) return; // frozen beats blank while the GPU resets

    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    advanceLiquid(now);   // the presence's crossing rides this clock, not its own

    advanceTide(now);     // ...and so does the tide: one clock, no forked loops

    const t0 = performance.now();
    const gl = r.gl;
    // THE TIDE IS GLOBAL, so it uploads ONCE PER FRAME rather than once per body.
    // gl.useProgram runs exactly once at setup and never again — one shared
    // program — so these three calls cover every surface on screen. Compare
    // uTrail/uDrops, which push 168 floats per body per frame regardless.
    if (r.U.uTideN) {
      gl.uniform1i(r.U.uTideN, TIDE.n);
      gl.uniform2f(r.U.uLean, TIDE.lean[0], TIDE.lean[1]);
      if (TIDE.n > 0) gl.uniform4fv(r.U.uTide, TIDE.buf);
    }
    r.fc = (r.fc || 0) + 1;
    const refreshRects = r.fc % 8 === 0;
    // THE ATLAS. Every button used to draw into the same corner of the shared
    // GL canvas and blit it out IMMEDIATELY — it had to, the next button was
    // about to overwrite the region. But a drawImage that reads a WebGL canvas
    // forces the whole GL pipeline to resolve first, so sixteen buttons meant
    // sixteen serialized GPU syncs a frame: median frames fine, every few
    // frames an 80-100ms stall, the orb visibly hitching. Now each active
    // button gets its own shelf-packed region, ALL the draws happen, and the
    // blits run afterwards against one already-resolved frame — one sync,
    // however many buttons. If a frame's buttons genuinely overflow the atlas,
    // flushBlits() resolves mid-frame and the packing starts over: a rare
    // second sync instead of sixteen guaranteed ones.
    let atlasX = 0, atlasY = 0, shelfH = 0;
    const pending = [];
    const flushBlits = () => {
      for (const q of pending) {
        q.b.octx.clearRect(0, 0, q.b.out.width, q.b.out.height);
        // GL y-up: a viewport at (x, y) reads from the 2D snapshot at
        // top = RES_H - y - vpH
        q.b.octx.drawImage(r.canvas, q.x, RES_H - q.y - q.h, q.w, q.h, 0, 0, q.b.out.width, q.b.out.height);
        q.b.painted = true;
      }
      pending.length = 0;
      atlasX = 0; atlasY = 0; shelfH = 0;
    };
    const allocSlot = (w, h) => {
      if (atlasX + w > RES_W) { atlasX = 0; atlasY += shelfH; shelfH = 0; } // next shelf
      if (atlasY + h > RES_H) { flushBlits(); }                            // atlas full: resolve and reuse
      const slot = { x: atlasX, y: atlasY };
      atlasX += w; shelfH = Math.max(shelfH, h);
      return slot;
    };
    for (const b of r.buttons) {
      try {
        if (b.shapeId === 6 && !b.tex) continue;   // SDF still baking
        // SELF-HEALING: app code that rewrites a container's innerHTML throws
        // our canvas away with it. Rather than forbid that everywhere, the
        // liquid simply re-attaches itself (and re-measures next tick).
        if (!b.out.isConnected) {
          if (!b.el.isConnected) continue;         // host is gone; the observer reaps it
          b.el.appendChild(b.out);
          b.rect = null; b._cw = 0; b._ch = 0;     // force a fresh fit
        }
        // priming pass (see r.renderNow): anything already painted is the
        // normal loop's business — this frame belongs to the new arrivals
        if (r.primeOnly && b.drawn) continue;
        // layout reads are cached: 16 buttons × 60fps × getBoundingClientRect
        // is real jank — refresh every 8th frame instead
        if (refreshRects || !b.rect) b.rect = b.out.getBoundingClientRect();
        // visibleWhen is a plain closure, not a layout read — it was lumped
        // into the 8-frame cadence above, which made rings appear up to 133ms
        // AFTER their screen did (and linger as long after it closed): a
        // visible pop on every panel transition. Sampled every frame now.
        if (b.cfg.visibleWhen) b.vis = !!b.cfg.visibleWhen();
        // A body that stops DRAWING must also stop SHOWING. Every skip here used
        // to be a bare `continue`: the loop stopped painting and nothing ever
        // cleared the canvas, so the last frame it drew stayed on screen for
        // good. Hiding the search field left its ring behind as a full-width
        // pill lying across the feed, and the header frame left a second ring
        // hugging the title — two borders with nothing under them.
        const hide = () => {
          if (!b.painted) return;
          b.octx.clearRect(0, 0, b.out.width, b.out.height);
          b.painted = false;
          b.drawn = false;   // so it re-draws the moment it comes back
        };
        if (!b.rect.width || !b.vis) { hide(); continue; }   // hidden screen / faded-out surface
        // A tracked element set to display:none reports 0x0, which makes
        // syncTrack bail before it can resize — leaving _cw at whatever the
        // element measured when it was last visible. Without this the ring
        // sails on at its old size, which is precisely the stuck pill.
        if (b.trackEl && (!b.trackEl.clientWidth || !b.trackEl.clientHeight)) { hide(); continue; }
        // TRACK FIRST, CULL SECOND — and never the other way round. Culling
        // first is a deadlock: a ring parked off-screen stops re-anchoring, so
        // it can never learn that its element moved back into view, and it
        // stays stranded wherever it last was. (This is exactly how the voice
        // divider ended up 460px below the section it belongs to.)
        if (b.trackEl) {
          b.syncTrack(r);
          // A tracked ring starts at the mount's default size. Drawing that
          // before it has been fitted paints a small stray shape where a border
          // belongs — wait for the first real measurement.
          if (!b._cw) continue;
        }
        // off-screen surfaces (a feed scrolled past) DRAW nothing — but they
        // have already been tracked above, so they are never stale.
        const rr = b.trackEl ? b.out.getBoundingClientRect() : b.rect;
        if (rr.bottom < -80 || rr.top > innerHeight + 80
          || rr.right < -80 || rr.left > innerWidth + 80) continue;
        // idle bodies breathe at 20fps (staggered); anything the user is
        // touching — hover, blade, droplets, press, focus — runs full rate.
        // The slow ambient clock (FLOW_SPEED 0.3) makes 20fps invisible.
        b.step(now, dt);   // state advances every frame; only DRAWING is rationed
        // A body that has never been drawn counts as active: the idle lane must
        // not throttle anything's FIRST appearance, or it lingers absent.
        //
        // This clause used to read `!b._cw`, which was wrong in both directions.
        // `_cw` is only ever written by syncTrack, and syncTrack only runs for
        // TRACKED mounts — so for every plain button (the rail, the wordmark,
        // the chat glyphs) `_cw` stayed 0 forever, `active` was permanently
        // true, and BOTH gates below became unreachable: the still-freeze never
        // froze and the idle lane never throttled. ~13 bodies took the full
        // render+snapshot path every frame instead of the ~2 intended. For
        // tracked mounts the clause was dead the other way, since the `!b._cw`
        // continue above already returns before this line is reached.
        const active = !b.drawn || (b.trackEl && !b._cw)
          || b.hoverTarget || b.hover > 0.02 || b.trail.length > 0
          || b.drops.length > 0 || b.state !== 'idle' || b.clump > 0.01
          || b.wobble > 0.005 || b.focus > 0.02 || b.core < 0.999
          || (b.hollow > 0.002 && b.hollow < 0.998)
          || b.spinDrag || Math.abs(b.spinYaw) + Math.abs(b.spinPitch) > 0.002
          || now - b.resizeT < 400;
        // A still border only redraws when something touches it — once fitted,
        // it costs nothing at all. It always draws ONE more frame after the
        // touch ends, so it can never freeze mid-cut with a wound in it.

        // A material crossing lifts this freeze — but ONLY for bodies the axis
        // can actually reach (b.matLive). Shapes 8/10/12 have bodyAmt 0 in the
        // shader, so uMat is multiplied by zero: a border is not merely
        // unchanged during a transition, it is never even considered for waking.
        // Note this lifts the FREEZE, not the idle lane below — woken bodies
        // draw on the cheap 1-in-2 lane, not a full-rate pass.

        // A running tide lifts the freeze too — a still border that never
        // repaints would be the one surface the presence's gesture cannot reach.
        // Woken bodies still fall to the cheap idle lane below, not full rate.
        if (b.still && b.drawn && !active && !b.wasActive && !(MAT_EASE && b.matLive) && !TIDE.live) continue;
        // Idle ambient flow renders every 2nd frame on desktop (1-in-5 on
        // touch), staggered so the work spreads across frames. The earlier
        // note here kept desktop at every-frame because it was "smooth today"
        // — measured on the founder's own machine it was not (25fps with
        // 80-100ms spikes), and slow liquid at 30fps is not distinguishable
        // from 60. Anything being INTERACTED with is `active` and still runs
        // at full rate.
        if (!active && (r.fc + b.stagger) % (COARSE ? 5 : 2) !== 0) continue;
        // Only now, on a frame we are actually going to DRAW, does this become
        // the record of "was it active last time we painted". Updating it above
        // — before the idle lane — silently broke the still-freeze's promise of
        // one final frame after activity ends: the lane would skip the very
        // frame that promise was owed, having already cleared the flag. The
        // wordmark froze on frame 1, mid entrance-ease at core 0.932, and held
        // that half-formed shape forever.
        b.wasActive = active;
        const slot = allocSlot(b.vpW, b.vpH);
        gl.viewport(slot.x, slot.y, b.vpW, b.vpH);
        gl.scissor(slot.x, slot.y, b.vpW, b.vpH);
        gl.uniform1i(r.U.uShape, b.shapeId);
        gl.uniform1f(r.U.uRangeX, b.rangeX);
        gl.uniform1f(r.U.uRangeY, b.rangeY);
        gl.uniform4f(r.U.uBulge, b.bulge[0], b.bulge[1], b.bulge[2], b.bulge[3]);
        gl.uniform2f(r.U.uFrame, b.frameVec[0], b.frameVec[1]);
        gl.uniform1f(r.U.uFrameT, b.frameT);
        gl.uniform1f(r.U.uHollow, b.hollow);
        gl.uniform1f(r.U.uBand, b.band);
        gl.uniform1f(r.U.uRim, b.rim);

        gl.uniform1f(r.U.uFloor, b.floor);
        gl.uniform1f(r.U.uMat, b.matOverride === null ? MATERIAL : b.matOverride);
        gl.uniform1f(r.U.uTrans, b.trans);
        gl.uniform2f(r.U.uSpin, b.spinYaw, b.spinPitch);

        // GRAVITY REACHES ONLY BODIES. b.trans is 0 on every ring, the nav
        // frame, every spin3D mark, the budget bead and the login wordmark — the
        // same invariant that keeps the material axis off a border keeps gravity
        // off it, with no second guard to hold in sync.
        const grav = b.trans > 0;
        gl.uniform1f(r.U.uBevel, grav ? b.bevel * BEVEL_GAIN() : b.bevel);
        gl.uniform1f(r.U.uRadius, b.radius);
        gl.uniform1f(r.U.uStill, b.still);
        // wrap ~70min: raw performance.now() outgrows fp32 in long-lived tabs
        gl.uniform1f(r.U.uTime, (now % 4194304) / 1000);
        gl.uniform1f(r.U.uSeed, b.seed);


        // THE TIDE IS SPENT OUT OF THE WARP'S BUDGET. warp <= 0.156 * (1 - spent)
        // so warp + tide <= 0.156 exactly, which is the number the ceiling note
        // at the top of this file guarantees against the narrowest stroke.
        gl.uniform1f(r.U.uFlow, (grav ? b.cfg.flowSpeed * FLOW_GAIN() : b.cfg.flowSpeed) * TIDE.budget);
        gl.uniform1f(r.U.uVisc, b.cfg.viscosity);   // NEVER scaled — see GRAVITY above
        gl.uniform1i(r.U.uOctaves, r.octaves);
        gl.uniform1f(r.U.uClump, b.clump);
        gl.uniform1f(r.U.uCore, b.core);
        gl.uniform1f(r.U.uWobble, b.wobble);
        gl.uniform1f(r.U.uFocus, b.focus);
        gl.uniform1f(r.U.uReduced, reduced() ? 1 : 0);
        gl.uniform2f(r.U.uMouse, b.mouse.x, b.mouse.y);
        gl.uniform1f(r.U.uHover, b.hover);
        // eased sweep progress; 1 = finished/hidden
        const sw = b.sweepStart ? Math.min(1, (now - b.sweepStart) / SWEEP_MS) : 1;
        gl.uniform1f(r.U.uSweep, 1 - Math.pow(1 - sw, 3));
        trailVals.fill(0);
        for (let i = 0; i < b.trail.length && i < TRAIL_N; i++) {
          const pt = b.trail[i];
          if (pt.break) continue; // w stays 0: no segment bridges this gap
          trailVals[i * 4] = pt.x; trailVals[i * 4 + 1] = pt.y;
          trailVals[i * 4 + 2] = Math.min(1, (now - pt.t) / b.cfg.healMs);
          trailVals[i * 4 + 3] = 1;
        }
        gl.uniform1i(r.U.uTrailN, Math.min(b.trail.length, TRAIL_N));
        gl.uniform4fv(r.U.uTrail, trailVals);
        dropVals.fill(0);
        for (let i = 0; i < b.drops.length && i < DROP_N; i++) {
          const dr = b.drops[i];
          dropVals[i * 4] = dr.x; dropVals[i * 4 + 1] = dr.y; dropVals[i * 4 + 2] = dr.r; dropVals[i * 4 + 3] = 1;
        }
        gl.uniform1i(r.U.uDropN, Math.min(b.drops.length, DROP_N));
        gl.uniform4fv(r.U.uDrops, dropVals);
        if (b.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, b.tex); }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        b.drawn = true;
        pending.push({ b, x: slot.x, y: slot.y, w: b.vpW, h: b.vpH });
      } catch (err) {
        if (!b.warned) { console.warn('[mercury]', err); b.warned = true; }
      }
    }
    flushBlits(); // one resolve for the whole frame's buttons
    // 60fps floor: degrade noise octaves before resolution
    r.frameMs.push(performance.now() - t0);
    if (r.frameMs.length > 90) {
      const avg = r.frameMs.reduce((a, c) => a + c, 0) / r.frameMs.length;
      if (avg > 8 && r.octaves > 1) r.octaves -= 1;
      // ...and RECOVER when the pressure lifts. The degrade used to be sticky:
      // one slow spell (a heavy world scene, a busy first paint) coarsened the
      // noise for the rest of the session — every liquid surface visibly
      // lower-detail forever, reading as pixelation nothing else explained.
      else if (avg < 5 && r.octaves < 2) r.octaves += 1;
      r.frameMs.length = 0;
    }
  };
  // A synchronous extra pass, for the moment a ring is mounted onto a node
  // the app just created: called from the mount sweep (which runs before
  // paint), it draws and blits the new body in the SAME frame the node
  // appears, so a rebuilt card is never on screen with a blank border —
  // the last visible piece of the interaction flash. Reuses the loop's own
  // frame with schedule:false (the merctest hook's contract), so there is
  // exactly one code path for rendering.
  r.renderNow = () => {
    // PRIME ONLY WHAT HAS NEVER PAINTED. This runs inside the mutation sweep,
    // in the same frame a new screen appears — the frame that is already the
    // busiest one there is. A full extra pass over every body doubles that
    // frame's GPU work exactly when a view switch can least afford it (which
    // is what a "slight stutter when rendering any new section" feels like).
    // New rings are the only ones that need it; everything else is already on
    // screen and the normal loop has it.
    r.primeOnly = true;
    try { frame(performance.now(), false); } catch { /* next rAF heals */ }
    r.primeOnly = false;
  };
  requestAnimationFrame(frame);
  // Deterministic clock for verification (the demo page only, ?merctest): rAF
  // is throttled to nothing in hidden tabs, so tests step the simulation by
  // hand. Steps never re-schedule rAF (no forked loops) and never fall behind
  // the real clock (event timestamps are real time).
  if (typeof location !== 'undefined' && location.pathname.includes('mercury-demo')
    && location.search.includes('merctest')) {
    let simNow = 0;
    window.__mercStep = (ms) => { simNow = Math.max(performance.now(), simNow + ms); frame(simNow, false); };
  }
}

// One synchronous render pass, if the loop is alive — see r.renderNow above.
// The mount sweep calls this so freshly ringed nodes carry their border in
// the very frame they first paint.

export function renderNow() { if (R && R.renderNow) R.renderNow(); }

// ---------------------------------------------------------------------------
// LIVE TUNING. The axis is a uniform, so moving it costs one repaint and no
// recompile — which matters, because "in between" is a taste judgement and the
// only way to find it is with the artifact in front of you.
//   console:  __merc.material = 0.35      (then 0.6, then 0.5, ...)
//   URL:      ?mat=0.5                    (bookmarkable, and it survives the
//                                          reload you need to re-open a sheet)
//   one body: __merc.only('#nav-post', 1.0)   ·   __merc.only('#nav-post', null)
//   governor: __merc.octaves               must stay 2 — see the 8ms average
//
// Borders and the frozen wordmark are `still`: they render once after fitting
// and never again. A uniform change alone would silently not reach them, so
// the setter clears `drawn`, which is what BOTH the still gate and renderNow's
// primeOnly filter key on. Reuses r.renderNow(), the one sanctioned
// synchronous render path — no forked loop.
if (typeof window !== 'undefined') {
  window.__merc = {
    get material() { return MATERIAL; },
    set material(v) {
      const n = parseFloat(v);
      MATERIAL = Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
      this.repaint();
    },
    get octaves() { return R ? R.octaves : null; },
    only(sel, v) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!R || !el) return;
      const pin = (v === null || v === undefined) ? null : Math.min(1, Math.max(0, parseFloat(v) || 0));
      for (const b of R.buttons) if (b.el === el || b.el.contains(el)) b.matOverride = pin;
      this.repaint();
    },


    // How round the glass gets. Compile-time, so this reloads the page with the
    // value in the URL rather than pretending it is a uniform — honest about
    // what it is, and still one keystroke to try another.
    get bevelLift() { return BEVEL_LIFT; },
    set bevelLift(v) {
      const n = Math.min(20, Math.max(0, parseFloat(v) || 0));
      const u = new URL(location.href); u.searchParams.set('bevel', String(n)); location.href = u.href;
    },
    get gravity() { return GRAVITY; },
    set gravity(v) {
      const n = parseFloat(v);
      GRAVITY = Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
      this.repaint();
    },

    liquid(spec, opts) { return setLiquid(spec, opts); },
    // __merc.tide([{amp:.04, tight:2, speed:0.9}])  ·  __merc.tide([]) to stop
    // __merc.tide([], [-0.04, 0])                   ·  a lean, i.e. gravity left
    tide(g, lean) { return setTide(g, lean); },
    repaint() {
      if (!R || !R.renderNow) return;
      for (const b of R.buttons) b.drawn = false;   // wakes every still border
      R.renderNow();
    },
  };
}

// ---------------------------------------------------------------------------
// THE PRESENCE'S HAND ON THE ROOM.
//
// One eased crossing for the material axis and the gravity gains. The knob
// above stays INSTANT — it is a taste-judgement tool and should answer the
// keystroke. This is the other caller: a presence saying <<liquid: water heavy>>
// means the room should BECOME that, and a room that cuts is a room that
// flickers. Interruptible: a second call mid-flight re-reads the live values as
// its `from`, so changing its mind never produces a jump.

// NO FORKED LOOP. An earlier draft drove this from its own requestAnimationFrame
// and that is the one thing this module does not do — the renderer's `frame` is
// the single clock, which is also why __mercStep can drive the whole simulation
// deterministically in a hidden tab. advanceLiquid() is called from inside
// frame(), so a crossing steps with everything else and needs no clock of its own.
let liqOn = false, liqT0 = 0, liqMs = 900;
let matFrom = MATERIAL, matTo = MATERIAL, gravFrom = GRAVITY, gravTo = GRAVITY;
const clamp01 = (v) => Math.min(1, Math.max(0, +v));


// ---------------------------------------------------------------------------
// THE TIDE, on the CPU. Everything angular happens here, once per frame, for the
// whole screen: the shader never calls atan and never advances a phase.
const TIDE = {
  gestures: [],                 // { amp, tight, speed, phase }
  lean: [0, 0],
  n: 0,
  buf: new Float32Array(TIDE_N * 4),
  live: false,
  budget: 1,
};

// Recompute what the shader reads. Called after any change and once per frame
// while gestures are running.
function packTide() {
  const g = TIDE.gestures.slice(0, TIDE_N);
  TIDE.n = g.length;
  let spent = Math.abs(TIDE.lean[0]) + Math.abs(TIDE.lean[1]);
  for (let i = 0; i < g.length; i++) {
    const o = i * 4;
    TIDE.buf[o] = Math.cos(g[i].phase);
    TIDE.buf[o + 1] = Math.sin(g[i].phase);
    TIDE.buf[o + 2] = g[i].amp;
    TIDE.buf[o + 3] = g[i].tight;
    spent += Math.abs(g[i].amp);
  }
  // The ceiling, kept to the digit: the ambient warp gives back exactly what the
  // tide takes, so their sum never exceeds what a thin stroke can survive.
  const used = Math.min(spent, TIDE_MAX);
  TIDE.budget = 1 - used / 0.156;
  TIDE.live = TIDE.n > 0 || TIDE.lean[0] !== 0 || TIDE.lean[1] !== 0;
}

let tideLast = -1;
function advanceTide(now) {
  if (!TIDE.gestures.length) return;
  if (tideLast < 0) tideLast = now;
  const dt = Math.min(0.1, (now - tideLast) / 1000); tideLast = now;
  let moved = false;
  for (const g of TIDE.gestures) { if (g.speed) { g.phase += g.speed * dt; moved = true; } }
  if (moved) packTide();
}

// The presence's gesture, or a hand at the console. amp is clamped to the shared
// budget; speed is radians per second and its SIGN is the direction — positive
// counterclockwise, which is the direction a positive angle turns.
export function setTide(gestures, lean) {
  TIDE.gestures = (Array.isArray(gestures) ? gestures : []).slice(0, TIDE_N).map((g) => ({
    amp: Math.min(TIDE_MAX, Math.max(0, +g.amp || 0)),
    tight: Math.min(12, Math.max(0, +g.tight || 0)),
    speed: Math.max(-4, Math.min(4, +g.speed || 0)),
    phase: +g.phase || 0,
  }));
  if (lean) {
    const n = Math.hypot(+lean[0] || 0, +lean[1] || 0);
    const k = n > TIDE_MAX ? TIDE_MAX / n : 1;
    TIDE.lean = [(+lean[0] || 0) * k, (+lean[1] || 0) * k];
  } else TIDE.lean = [0, 0];
  tideLast = -1;
  packTide();
  if (R) for (const b of R.buttons) b.drawn = false;   // wake the still surfaces
}

export function setLiquid({ material, gravity } = {}, { ms = 900 } = {}) {
  if (material !== null && material !== undefined && Number.isFinite(+material)) matTo = clamp01(material);
  if (gravity !== null && gravity !== undefined && Number.isFinite(+gravity)) gravTo = clamp01(gravity);
  if (matTo === MATERIAL && gravTo === GRAVITY) return;   // nothing to cross
  // Reduced motion gets the destination and no crossing at all.
  if (reduced() || !ms) { matFrom = matTo; gravFrom = gravTo; liqOn = false; return settleLiquid(); }
  matFrom = MATERIAL; gravFrom = GRAVITY;   // interruptible: from = LIVE, not last target
  // 150ms floor / 1200ms ceiling. The ceiling is the governor's: it averages a
  // rolling 90-frame window, so a crossing kept inside ~72 frames cannot
  // dominate one window even at worst case.

  liqMs = Math.min(1200, Math.max(150, ms));
  // UNSTAMPED. The start time is taken from the LOOP's clock on the first frame
  // that advances us, never from performance.now() here — because those are not
  // the same clock. __mercStep drives frame() with a simulated `now` that runs
  // ahead of wall time, so a wall-time stamp makes t >= 1 immediately and every
  // crossing collapses to one frame under the very harness that exists to verify
  // it. Deferring the stamp means the crossing is correct on whatever clock is
  // driving it, which is also what makes it steppable at all.
  liqT0 = -1;
  liqOn = true;
  MAT_EASE = true;
}

// Called once per rendered frame, BEFORE the bodies are drawn, so the values the
// uniforms read are this frame's. A tab that sleeps mid-crossing simply resumes
// with t >= 1 and settles on its first frame back — the clock is wall time, not
// an accumulator, so nothing drifts and nothing is left half-crossed.

function advanceLiquid(now) {
  if (!liqOn) return;
  if (liqT0 < 0) liqT0 = now;          // stamp from the loop's clock, once
  const t = Math.min(1, (now - liqT0) / liqMs);
  const e = t * t * (3 - 2 * t);      // smoothstep: prompt start, no overshoot, one settle
  MATERIAL = matFrom + (matTo - matFrom) * e;
  GRAVITY = gravFrom + (gravTo - gravFrom) * e;
  if (t < 1) return;
  liqOn = false;
  settleLiquid();
}

// THE ORDER OF THESE LINES IS THE WHOLE THING.
//
// `wasActive` is written only on frames that actually DRAW. While MAT_EASE is
// true a woken still body has active === false, so every drawn frame writes
// wasActive = false. Drop the flag first and the very next frame the still gate
// fires and freezes the body at whatever the IDLE LANE last painted — which, at
// 1-in-2 (1-in-5 on touch), can be one tick short of the destination. Forever.
//
// So: paint the terminal value, THEN drop the flag, THEN clear `drawn` on every
// body. Because we are INSIDE frame() and before the draw pass, clearing `drawn`
// makes `active` true for this very frame: the gate takes its `!active` branch,
// every body draws once at the settled value, and that pass writes
// wasActive = true — so each body takes its usual one more idle frame and then
// freezes cleanly. No renderNow() from in here: that would be re-entrant.
function settleLiquid() {
  MATERIAL = matTo; GRAVITY = gravTo;
  MAT_EASE = false;
  if (R) for (const b of R.buttons) b.drawn = false;
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------
export function mount(el, config = {}) {
  const r = renderer();
  if (!r.gl) return null; // caller keeps its non-GL fallback
  const cfg = {
    shape: 'plus', svgPath: null, strokeWidth: 0, svgEl: null, imageEl: null,
    size: 48, flowSpeed: 1, viscosity: 1, healMs: HEAL_MS, popIntensity: 1,
    thicken: 1, aspect: 1,      // aspect > 1 = wide tile (bubblewide, frame)
    interactive: true,          // false: no clump/pop (frames aren't buttons)
    track: false,               // true: canvas + shape follow el's live size
    trackTarget: null,          // track a DIFFERENT element's size (chat pill)
    framePx: 6,                 // frame rings: total metal thickness in px
    band: 1,                    // horizon hot-band + sheen strength (wide flats: lower)
    ss: 0,                      // per-button supersample override (0 = SS)
    still: null,                // freeze ambient motion. Default: TRUE for the
                                //   border shapes (frame/line) whatever the call
                                //   site says — a border that ripples pulls the
                                //   eye off the thing it frames. Buttons, marks
                                //   and the solid pill keep flowing.
    rim: 0.055,                 // meniscus width, shape units. A stroke thinner
                                //   than ~2x this has no bright core — hairline
                                //   marks (the wordmark) want a finer edge.
    envFloor: 0.10,             // environment floor luminance (see uFloor)
    spin3D: false,              // click-drag spins the mark as a 3D plaque
                                //   (inertia, then a spring home to face-on);
                                //   plain hover stays the normal liquid
    bevel: 1,                   // curvature boost (see uBevel)
    hollowEl: null,             // pill: hollows open while this el is hovered/open
    visibleWhen: null,          // () => bool. Surfaces that hide by OPACITY still
                                //   have a rect — without this their liquid keeps
                                //   rendering unseen.

    // THE MATERIAL AXIS, per mount. null = follow the global MATERIAL knob;
    // a number pins this one body (which is what __merc.only writes).
    material: null,
    seed: Math.random() * 100, ...config,
  };
  if (PRESET_PATHS[cfg.shape]) Object.assign(cfg, PRESET_PATHS[cfg.shape]);
  if (cfg.still === null) cfg.still = cfg.shape === 'frame' || cfg.shape === 'line' || cfg.shape === 'railedge';
  // BORDERS GET NO VISIBLE RIM AT ALL. The meniscus (default 0.055 units) is
  // right for buttons — a body of metal wants a grounded dark edge — but
  // rings render at a fixed 40px/unit, where it becomes a dark outline on
  // BOTH sides of every border: the "hairline around all liquid borders"
  // that survived every CSS kill, because the shader itself was painting it.
  // And a thin dark line along a curve is also the "pixelation": a ~1px
  // feature cannot antialias — it crawls the corner radii as stair-steps.
  // Sub-pixel (0.006 ≈ half a device pixel) dissolves into the edge AA:
  // silver fades straight to glass, both complaints gone at one root.
  if (cfg.interactive === false && config.rim === undefined) cfg.rim = 0.006;
  // ...and a raised environment floor: a border's inner face points at the
  // studio floor, and with the tube's dark floor it renders as a dark line
  // beside the bright one — the hairline that survived every CSS kill.
  // Bright floor = bright chrome the whole way around. Buttons keep 0.10.

  if (cfg.interactive === false && config.envFloor === undefined) cfg.envFloor = 0.62;
  // TRANSMISSION IS FOR BODIES. uMat (character) reaches every solid; this is
  // the separate budget for real OUTPUT ALPHA, and it is 0 on everything whose
  // alpha profile is load-bearing. A ring is band-and-meniscus with no interior
  // to see through, and its alpha profile IS the hairline's own surface — at
  // uTrans 0 it stays exactly as opaque as it is today at every knob position.
  // The over-capture of `interactive === false` is the WANTED outcome here: it
  // also catches the login wordmark and the budget bead, two solid bodies that
  // landed on the border lighting by accident and should not go see-through.
  //   spin3D marks feed src/body.js — a black occluder plane with
  //   alphaTest: 0.5 plus an ADDITIVE chrome quad reading this very canvas as a
  //   THREE.CanvasTexture. Drop their alpha below 0.5 and the room punches
  //   through the letterforms with a hard aliased edge. uTrans 0 makes the
  //   minimum face alpha exactly 1.0, so that cliff is unreachable by
  //   construction, not by a tuned margin.
  if (config.trans === undefined) cfg.trans = (cfg.interactive === false || cfg.spin3D) ? 0 : 1;

  // aspect = the MARK's own width/height; the liquid margin stays absolute
  // (same breathing room on every side, whatever the shape's proportions)
  const aspect = Math.max(1, cfg.aspect);
  const rangeX0 = EXTENT + (aspect - 1);   // shape-space half-width
  // The canvas is intentionally LARGER than the mark, and that margin is not
  // slack — it is the room the liquid bulges, pops and drips into. An earlier
  // version shrank it to the host's box inside scrolling panels so it could
  // never cross a clip edge, and that bought a hard stop at the box instead:
  // the metal reached the border and simply ended, unable to swell past it.
  // Wrong trade. The liquid has to be able to leave the box the same way it
  // comes into it, so the margin stays and the containers make room (their
  // padding exceeds the ring's overhang) rather than the liquid giving way.
  const rangeX = rangeX0, rangeY = EXTENT;
  const visualW = cfg.size * rangeX, visualH = cfg.size * rangeY;
  // render at true display resolution × SS — fixed tiles stretched over big
  // buttons is exactly what reads as pixelation, and the extra sampling is
  // what smooths shallow-angle edges
  const out = document.createElement('canvas');

  const scale0 = resScale(r.dpr * (cfg.ss || SS), visualW, visualH);
  out.width = Math.max(2, Math.round(visualW * scale0));
  out.height = Math.max(2, Math.round(visualH * scale0));
  out.className = 'mercury-blob';
  // no inline display: the app's `.broadcast.live canvas.mercury-blob` hide
  // must stay able to win (position:absolute makes display moot anyway)
  out.style.cssText = `position:absolute;left:50%;top:50%;translate:-50% -50%;width:${visualW}px;height:${visualH}px;pointer-events:none;`;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(out);


  const isPreset = cfg.shape in SHAPES && !cfg.svgPath && !cfg.svgEl && !cfg.imageEl;
  const shapeId = isPreset ? SHAPES[cfg.shape] : 6;
  const b = {
    el, out, octx: out.getContext('2d'), cfg,
    seed: cfg.seed, shapeId, tex: null,
    // Can the material axis reach this body at all? frame(8) / line(10) /
    // railedge(12) are bodyAmt 0 in the shader, and a mount pinning material: 0
    // (the nav frame) shadows the global forever. Everything answering false is
    // skipped by the crossing's wake above.
    matLive: !(shapeId === 8 || shapeId === 10 || shapeId === 12) && cfg.material !== 0,
    trail: [], drops: [], dropT: 0, clump: 0, core: 1, wobble: 0, focus: 0,
    hover: 0, hoverTarget: 0, mouse: { x: 99, y: 99 }, sweepStart: 0,
    rangeX, rangeY, bulge: cfg.bulge || [0, 0, 0, 0], vpW: out.width, vpH: out.height, frameT: 0.08, rect: null, resizeT: 0, stagger: mountSeq++,
    frameVec: cfg.shape === 'bubblewide' ? [aspect - 0.85, 0] : [0, 0],

    hollow: 0, band: cfg.band, rim: cfg.rim, floor: cfg.envFloor, bevel: cfg.bevel, radius: 0, vis: true, still: cfg.still ? 1 : 0,
    matOverride: cfg.material, trans: cfg.trans,
    spinYaw: 0, spinPitch: 0, spinVY: 0, spinVP: 0, spinDrag: false,
    trackEl: cfg.track ? (cfg.trackTarget || el) : null, _cw: 0, _ch: 0,
    state: 'idle', stateT: 0, pressed: false,
    // frames + pills hug a living element: re-derive canvas + shape from its size
    syncTrack(rr, full) {
      const tEl = this.trackEl;
      const w = tEl.clientWidth, h = tEl.clientHeight;
      if (!w || !h) return;
      // Anchor: recomputed EVERY frame. Gating this to a cadence looked like a
      // free saving and was not — a section expanding moves its divider 300px
      // without changing its size, so a size-gated anchor leaves the border
      // stranded where the section used to end. Two rect reads per ring is the
      // price of a border that is never in the wrong place.
      if (tEl !== this.el) {
        const hr = this.el.getBoundingClientRect(), tr = tEl.getBoundingClientRect();
        const lx = tr.left + tr.width / 2 - hr.left, ly = tr.top + tr.height / 2 - hr.top;
        if (lx !== this._lx || ly !== this._ly) {
          this._lx = lx; this._ly = ly;
          this.out.style.left = lx + 'px';
          this.out.style.top = ly + 'px';
        }
      }
      let M = cfg.shape === 'line'
        ? Math.max(10, cfg.framePx * 2.6)             // dividers stay slim
        : (cfg.shape === 'frame' ? Math.max(10, Math.min(18, h * 0.22))
                                 : Math.max(14, Math.min(36, h * 0.45)));
      // M is the ring's overhang beyond the box it wraps, and it stays. Pulling
      // it to zero inside scrolling panels stopped the slicing but replaced it
      // with something worse: the band pinned exactly to the border with no
      // room to move, so touching it did nothing visible at the edge.
      const cw = w + M, ch = h + M;
      // The gate must check the CANVAS, not just its own memory: an external
      // one-time restyle (boot-time chrome fitting) squared the rail ring while
      // _cw/_ch still remembered the right size, so this early-return kept the
      // wrong box forever. Comparing the actual inline style makes every
      // tracked ring self-healing — whoever mis-sizes it, the next frame
      // snaps it back.
      const sw = parseFloat(this.out.style.width) || 0, sh = parseFloat(this.out.style.height) || 0;
      if (Math.abs(cw - this._cw) <= 2 && Math.abs(ch - this._ch) <= 2
          && Math.abs(sw - cw) <= 2 && Math.abs(sh - ch) <= 2) return;
      this._cw = cw; this._ch = ch;
      this.resizeT = performance.now(); // mid-resize = full-rate rendering
      this.rect = null;                 // re-read the canvas rect next frame
      this.out.style.width = cw + 'px';
      this.out.style.height = ch + 'px';
      // A tracked ring recomputes its own range from the box it wraps, and it
      // solves the clipping problem the other way (M = 0 above), so it always
      // uses the FULL vertical range. Leaving a fitted rangeY from mount() here
      // would pair a full-range x with a shrunken y and skew the whole ring.
      // ONE PIXEL SCALE FOR EVERY RING, whatever it wraps.
      //
      // rangeY used to be pinned to EXTENT, which made px-per-shape-unit equal
      // ch / (2 * EXTENT) — a number that grows with the box. The band is held
      // px-constant, so its width IN SHAPE UNITS then shrank as the box grew:
      // ~0.038 units around a 116px card against ~0.006 around an 874px one.
      // Everything the material is made of — the dome, the drift, the noise —
      // is measured in shape units, so the same rim rendered as bright chrome
      // on a short card and dull grey on a tall one. Same rim, different box,
      // visibly different metal.
      //
      // Fixing the scale instead fixes the material: the band is now the same
      // width in shape space everywhere, so every ring domes and reflects
      // identically no matter what it is wrapped around.
      const unitRef = 40;                       // px per shape unit, for all rings
      this.rangeX = cw / (2 * unitRef);
      this.rangeY = ch / (2 * unitRef);
      // ONE scale for both axes — clamping them independently squashes the
      // shape (the full-width chat ring drifting off its box)
      // Rings get the SAME supersample as marks do. They never used to: a mark
      // rendered at dpr x SS and a border at dpr x 1.0, so every rounded corner
      // on every panel was sampled a third less finely than the glyph sitting
      // inside it. A border is a thin curve, which is the worst possible thing
      // to undersample — the straight runs look fine and the corners stair-step,
      // which is exactly where the eye goes.
      // The clamps still bind for very tall rings (see RES_H), so this costs
      // nothing there and sharpens everything at ordinary sizes.

      const sc = resScale(rr.dpr * SS, cw, ch);
      this.vpW = Math.max(2, Math.round(cw * sc));
      this.vpH = Math.max(2, Math.round(ch * sc));
      if (this.out.width !== this.vpW || this.out.height !== this.vpH) {
        this.out.width = this.vpW; this.out.height = this.vpH;
      }
      const unit = unitRef;           // px per shape unit — now fixed, see above
      this.frameT = (cfg.framePx / 2) / unit; // px-constant at any box size
      // boxW lets the drawn RECT be narrower than the element it tracks. The
      // nav bar needs that: its canvas has to be wide enough to hold the swell
      // that protrudes past the bar, but the rect the band traces is only the
      // bar itself. The rect is left-aligned in the box, so its offset from the
      // canvas centre follows from the difference and does not need stating.
      const bw = cfg.boxW || w;
      this.bulge[3] = ((bw - w) / 2) / unit;
      this.frameVec = cfg.shape === 'line'
        ? [(bw / 2) / unit, this.frameT]
        : [(bw / 2) / unit, (h / 2) / unit];
      // match the element's own corner radius, so the liquid covers the real
      // corners (a stadium ring rounds straight past a 22px rounded rect)
      const brRaw = getComputedStyle(tEl).borderTopLeftRadius || '0';
      const brPx = brRaw.endsWith('%')
        ? (parseFloat(brRaw) / 100) * Math.min(w, h)
        : (parseFloat(brRaw) || 0);
      this.radius = Math.min(brPx / unit, this.frameVec[0], this.frameVec[1]);
    },
    step(now, dt) {
      // 3D spin physics: while held, the hand steers directly; released, the
      // plaque carries its momentum, the spin damps out, and a gentle spring
      // rights it to face the room (to the NEAREST full turn — a hard spin
      // settles without unwinding).
      if (cfg.spin3D && !this.spinDrag && (this.spinYaw || this.spinPitch || this.spinVY || this.spinVP)) {
        this.spinYaw += this.spinVY * dt; this.spinPitch += this.spinVP * dt;
        const damp = Math.exp(-dt * 2.0);
        this.spinVY *= damp; this.spinVP *= damp;
        if (Math.abs(this.spinVY) + Math.abs(this.spinVP) < 0.35) {
          const TAU = Math.PI * 2;
          const homeY = Math.round(this.spinYaw / TAU) * TAU;
          const homeP = Math.round(this.spinPitch / TAU) * TAU;
          const k = Math.min(1, dt * 3.2);
          this.spinYaw += (homeY - this.spinYaw) * k;
          this.spinPitch += (homeP - this.spinPitch) * k;
          if (Math.abs(this.spinYaw - homeY) + Math.abs(this.spinPitch - homeP) < 0.004) {
            this.spinYaw = 0; this.spinPitch = 0; this.spinVY = 0; this.spinVP = 0;
          }
        }
      }
      while (this.trail.length && now - this.trail[0].t > cfg.healMs) this.trail.shift();
      // droplet physics runs whenever droplets exist (keeps interrupts sane)
      if (this.drops.length) {
        const since = (now - this.dropT) / 1000;
        const reforming = this.state !== 'pop';
        const k = reforming ? 8 + 30 * Math.min(1, since) : 0;
        let home = true;
        for (const d of this.drops) {
          if (k) { d.vx += -d.x * k * dt; d.vy += -d.y * k * dt; }
          const damp = Math.exp(-dt * (reforming ? 4.2 : 3.2));
          d.vx *= damp; d.vy *= damp;
          if (!reforming) d.vy -= dt * 0.55; // a little gravity while airborne
          d.x += d.vx * dt; d.y += d.vy * dt;
          if (reforming) d.r = Math.max(0.02, d.r - dt * 0.05);
          if (d.x * d.x + d.y * d.y > 0.09) home = false;
        }
        if (reforming && home) {
          this.drops = [];
          if (this.state === 'reform') { this.state = 'settle'; this.stateT = now; }
        }
      }
      if (this.state === 'clump') {
        const s = Math.min(1, (now - this.stateT) / CLUMP_MS);
        this.clump = (1 - Math.pow(1 - s, 3)) * (1 + 0.12 * Math.sin(s * Math.PI)); // spring overshoot
        this.core = Math.min(1, this.core + dt * 2.6); // press right after a pop: regrow, never freeze at 0
      } else if (this.state === 'pop') {
        this.core = Math.max(0, this.core - dt * 14); // the core flashes out
        if (now - this.stateT > 230) { this.state = 'reform'; this.stateT = now; }
      } else if (this.state === 'reform') {
        this.core = Math.min(1, this.core + dt * 2.6);
        if (now - this.stateT > REFORM_MS && !this.drops.length) { this.state = 'settle'; this.stateT = now; }
      } else if (this.state === 'settle') {
        const s = Math.min(1, (now - this.stateT) / 420);
        this.wobble = (1 - s) * 0.8;
        this.core = Math.min(1, this.core + dt * 2.6);
        if (s >= 1) { this.wobble = 0; this.core = 1; this.state = 'idle'; }
      } else {
        this.core = Math.min(1, this.core + dt * 2.6);
      }
      if (this.state !== 'clump' && this.clump > 0) this.clump = Math.max(0, this.clump - dt * 9);
      // activeElement gate first: selector matching runs for ONE element, ever
      const focused = document.activeElement === el && el.matches(':focus-visible');
      this.focus += ((focused ? 1 : 0) - this.focus) * Math.min(1, dt * 8);
      this.hover += (this.hoverTarget - this.hover) * Math.min(1, dt * 7);
      // snap the eased tails to zero so buttons actually go idle (20fps lane)
      if (!focused && this.focus < 0.02) this.focus = 0;
      if (!this.hoverTarget && this.hover < 0.02) this.hover = 0;
      // the pill dispels its interior while the chat is open/hovered
      if (cfg.hollowEl) {
        const open = cfg.hollowEl.matches(':hover') || cfg.hollowEl.classList.contains('open')
          || document.body.classList.contains('chat-typing');
        const tgt = open ? 1 : 0;
        this.hollow += (tgt - this.hollow) * Math.min(1, dt * 6);
        if (Math.abs(this.hollow - tgt) < 0.004) this.hollow = tgt;
        // solid, it is a button and flows; hollowed, it IS the chat's border
        // and holds still like every other border
        this.still = this.hollow > 0.9 ? 1 : 0;
      }
    },
    pop() {
      const n = Math.min(DROP_N, Math.round(10 + 8 * Math.min(1, cfg.popIntensity)));
      const speed = 0.9 + 0.9 * cfg.popIntensity;
      this.drops = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        const v = speed * (0.8 + Math.random() * 0.8);
        this.drops.push({
          x: Math.cos(a) * 0.18, y: Math.sin(a) * 0.18,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: 0.055 + Math.random() * 0.075,
        });
      }
      this.dropT = performance.now();
      this.state = 'pop'; this.stateT = this.dropT;
    },
  };

  if (b.shapeId === 6) {
    const src = cfg.svgPath ? { svgPath: cfg.svgPath, strokeWidth: cfg.strokeWidth }
      : cfg.svgEl ? { svgEl: cfg.svgEl, thicken: cfg.thicken } : { imageEl: cfg.imageEl, thicken: cfg.thicken };
    b.bakeSrc = src; // kept: context restore re-bakes from this
    b.bakeRatio = rangeX / rangeY;   // unchanged by `fit`: both scale together
    b.bakeH = bakeHeightFor(out.height);
    bakeSDF(r.gl, src, b.bakeH, b.bakeRatio, b.rangeY)
      .then((tex) => { b.tex = tex; })
      .catch((err) => { console.warn('[mercury] SDF bake failed', err); b.shapeId = SHAPES.plus; });
  }

  // pointer → shape-space (y up, matching GL)
  // both use the frame loop's cached rect: pointermove fires at device rate
  // across 16 listeners — fresh getBoundingClientRect each would be jank
  const toLocal = (e) => {
    const rect = b.rect;
    return {
      x: ((e.clientX - rect.left) / rect.width * 2 - 1) * b.rangeX,
      // b.rangeY, NOT the EXTENT constant. A tracked ring derives its vertical
      // range from the box it wraps, so hard-coding EXTENT here mapped the
      // pointer into a band 1.7 units tall inside a space that might be 11 —
      // the blade collapsed toward the vertical centre and never reached the
      // top or bottom edge at all. It looked correct on short cards purely by
      // coincidence: a 116px card computes a range of 1.68, which is EXTENT to
      // within a rounding error. Every taller card diverged from there.
      y: (1 - (e.clientY - rect.top) / rect.height) * 2 * b.rangeY - b.rangeY,
      t: performance.now(),
    };
  };
  const onMove = (e) => {
    if (reduced()) return;
    if (b.spinDrag) { b.hoverTarget = 0; return; }  // the hand is steering, not slicing
    const rect = b.rect;
    const inside = rect && rect.width && e.clientX >= rect.left && e.clientX <= rect.right
      && e.clientY >= rect.top && e.clientY <= rect.bottom;
    const lastPt = b.trail[b.trail.length - 1];
    if (!inside) {
      b.hoverTarget = 0;
      // break the trail: an exit and a re-entry must never bridge into a cut
      // slashed across geometry the pointer never touched
      if (lastPt && !lastPt.break) b.trail.push({ break: true, t: performance.now() });
    } else {
      if (!b.hoverTarget) b.sweepStart = performance.now(); // hover-enter: fire the glint sweep
      b.hoverTarget = 1;
      const pt = toLocal(e);
      b.mouse = pt; // the hover morph gathers around this point
      // dedupe identical points — a zero-length capsule is 0/0 in the shader
      if (lastPt && !lastPt.break && Math.abs(lastPt.x - pt.x) + Math.abs(lastPt.y - pt.y) < 0.004) return;
      b.trail.push(pt);
    }
    while (b.trail.length > TRAIL_N) b.trail.shift();
  };
  const press = () => { b.state = 'clump'; b.stateT = performance.now(); b.pressed = true; };
  const release = () => {
    if (!b.pressed) return;
    b.pressed = false;
    if (reduced()) { // action already fired natively; simple opacity response
      out.style.opacity = '0.7';
      setTimeout(() => { out.style.opacity = '1'; }, 120);
      b.state = 'idle'; b.clump = 0;
      return;
    }
    b.pop(); // native click fires on this same pointerup — action at the pop frame
  };
  const onDown = () => { if (!reduced() && !cfg.spin3D) press(); };  // a spin mark spins; it never clumps
  const onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !b.pressed && !reduced()) {
      press();
      setTimeout(release, 110);
    }
  };
  const onLeave = () => { if (b.pressed) { b.pressed = false; b.state = 'idle'; } };
  // Borders feel the pointer GENTLY: a soft lean toward the cursor and the
  // hover-enter glint — but never the blade. The full listener used to attach
  // unconditionally, so crossing a card SLICED its ring and the band warped
  // and healed along the cursor path ("the border moves up and down really
  // fast"); gating it off entirely made borders feel dead. This is the
  // middle: presence without violence.
  const onMoveSoft = (e) => {
    if (reduced()) return;
    const rect = b.rect;
    const inside = rect && rect.width && e.clientX >= rect.left && e.clientX <= rect.right
      && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) { b.hoverTarget = 0; return; }
    if (!b.hoverTarget) b.sweepStart = performance.now(); // the glint crosses once
    b.hoverTarget = 0.6;
    b.mouse = toLocal(e); // the soft swell gathers here
  };
  // 3D spin steering: the press grabs the plaque, the drag turns it, release
  // hands it to momentum. Hover-without-click never enters here — that stays
  // the normal liquid (onMove above).
  let spinLX = 0, spinLY = 0, spinLT = 0;
  const spinDown = (e) => {
    if (reduced()) return;
    b.spinDrag = true; b.hoverTarget = 0; b.trail.length = 0;
    b.spinVY = 0; b.spinVP = 0;
    spinLX = e.clientX; spinLY = e.clientY; spinLT = performance.now();
    try { el.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    e.preventDefault();
  };
  const spinMove = (e) => {
    if (!b.spinDrag) return;
    const now2 = performance.now();
    const dx = e.clientX - spinLX, dy = e.clientY - spinLY;
    const dts = Math.max(8, now2 - spinLT) / 1000;
    spinLX = e.clientX; spinLY = e.clientY; spinLT = now2;
    const KY = 0.013, KP = 0.011;
    b.spinYaw += dx * KY; b.spinPitch += dy * KP;
    const cap = (v) => Math.max(-11, Math.min(11, v));
    b.spinVY = cap((dx * KY) / dts * 0.85 + b.spinVY * 0.15);
    b.spinVP = cap((dy * KP) / dts * 0.85 + b.spinVP * 0.15);
  };
  const spinUp = () => { b.spinDrag = false; };
  if (cfg.spin3D) {
    el.style.touchAction = 'none';   // a spin on a phone must not scroll the page
    el.addEventListener('pointerdown', spinDown);
    window.addEventListener('pointermove', spinMove, { passive: true });
    window.addEventListener('pointerup', spinUp);
    window.addEventListener('pointercancel', spinUp);
  }
  if (cfg.interactive) {
    window.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('keydown', onKey);
  } else {
    window.addEventListener('pointermove', onMoveSoft, { passive: true });
  }

  r.buttons.add(b);
  startLoop();
  return {
    // Resize a mounted glyph WITHOUT rebuilding it. The SDF is stored in shape
    // units, so the texture is resolution-independent and never needs re-baking
    // — only the canvas and the viewport it renders into change. That is what
    // makes continuous scaling with the window affordable: no re-bake, no
    // remount, no dropped interaction state.
    setSize(px) {
      const size = Math.max(4, px);
      if (Math.abs(size - cfg.size) < 0.5) return;
      cfg.size = size;
      const vw = size * rangeX, vh = size * rangeY;

      const sc = resScale(r.dpr * (cfg.ss || SS), vw, vh);
      out.style.width = vw + 'px';
      out.style.height = vh + 'px';
      const nw = Math.max(2, Math.round(vw * sc)), nh = Math.max(2, Math.round(vh * sc));
      if (out.width !== nw || out.height !== nh) { out.width = nw; out.height = nh; }
      b.vpW = out.width; b.vpH = out.height;
      b.rect = null;                    // re-measure before the next pointer test
      b.resizeT = performance.now();    // full-rate rendering while it settles
      b.drawn = false;                  // a still mount must repaint at its new size
    },
    destroy() {
      r.buttons.delete(b);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', onMoveSoft);
      window.removeEventListener('pointermove', spinMove);
      window.removeEventListener('pointerup', spinUp);
      window.removeEventListener('pointercancel', spinUp);
      el.removeEventListener('pointerdown', spinDown);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('keydown', onKey);
      out.remove();
    },
  };
}

export default mount;
