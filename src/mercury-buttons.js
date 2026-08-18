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
uniform vec2  uFrame;        // wide shapes: half-extents (bubble body / frame box)
uniform float uFrameT;       // frame ring half-thickness (units; px-constant via JS)

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
  } else if(uShape==8){ // liquid frame: a thin rounded-pill RING hugging uFrame
    float r = max(0.12, uFrame.y - 0.10);
    return abs(sdRoundBox(p, uFrame, r)) - max(uFrameT, 0.02);
  }
  // texture SDF (raster pipeline): r stores 0.5 + d/(2*SDF_RANGE), shape units
  vec2 uv = clamp(p/${EXTENT.toFixed(2)}*0.5+0.5, 0.001, 0.999);
  float s = texture(uSDF, uv).r;
  return (s - 0.5) * ${(2 * SDF_RANGE).toFixed(2)};
}

void main(){
  vec2 p = vec2((vUv.x*2.-1.) * uRangeX, (vUv.y*2.-1.) * ${EXTENT.toFixed(2)});
  // reduced motion: a beauty frame with a barely-perceptible shimmer
  float t = mix(uTime, uSeed*13.7 + uTime*0.03, uReduced);

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
  float wAmp = ${FLOW_AMP.toFixed(3)} / visc * uFlow * gust
             * (1.0 + uHover * ${HOVER_BLOB.toFixed(2)} * (0.45 + 0.85 * nearM));
  vec2 warp = (vec2(fbm(p*0.85 + vec2(3.1,7.7), ft*0.85),
                    fbm(p*0.85 + vec2(9.2,1.3), ft*0.76)) * 0.85
             + vec2(fbm(p*2.0 + vec2(17.9,4.2), ft*1.40),
                    fbm(p*2.0 + vec2(6.4,23.1), ft*1.28)) * 0.15) * wAmp;
  vec2 q = p + warp;

  // ---- the body: icon → clump morph → core presence ------------------------
  float dIcon = iconSDF(q);
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

  // ---- derivatives FIRST (control flow is uniform up to here) --------------
  float aa = fwidth(d) + 1e-4;
  float pxUv = fwidth(vUv.x) + 1e-6;
  vec2 gd = vec2(dFdx(d), dFdy(d)) / pxUv;     // d-gradient per uv unit

  float edge = 1.0 - smoothstep(-aa, aa, d);
  if(edge < 0.004){ frag = vec4(0.); return; }

  // dome height + normal from the SDF gradient + dome falloff. The curvature
  // reaches deep into the body (0.55) so interiors carry the smooth top-lit
  // gradient of a chrome bead instead of going flat.
  float h = sqrt(clamp(-d/0.55, 0.0, 1.0));
  float hp = (d > -0.55) ? -1.0/(1.10*max(h,0.06)) : 0.0;   // dh/dd
  vec2 gh = gd * hp * 0.026;
  vec3 n = normalize(vec3(-gh, 1.0));

  // ---- interior drift: reflections crawl even when the silhouette is calm --
  // gentle: too much here is what reads as "texture" instead of polish
  vec2 drift = vec2(fbm(p*0.7 + vec2(21.7, 5.1), ft*0.43),
                    fbm(p*0.7 + vec2(4.9, 17.3), ft*0.37));
  n = normalize(vec3(n.xy + drift*0.02, n.z));

  // ---- chrome: studio environment, Fresnel, speculars ----------------------
  vec3 R = reflect(vec3(0.,0.,-1.), n);
  float ry = R.y;
  float envL = mix(0.10, 1.0, smoothstep(-0.55, 0.05, ry));   // dark floor → horizon
  envL = mix(envL, 0.80, smoothstep(0.12, 0.60, ry));          // horizon → calm sky
  float hb = (ry - 0.05)/0.12;                 // the hot band itself (t*t, not
  envL += 0.45 * exp(-hb*hb);                  // pow: negative bases are UB)
  float fres = 0.72 + 0.28*pow(1.0 - clamp(n.z,0.,1.), 2.0);
  float silver = envL * fres;

  // faint anisotropic streaking aligned with local flow
  vec2 fd = normalize(drift + vec2(1e-3));
  vec2 fp = vec2(-fd.y, fd.x);
  silver += 0.012 * snoise(vec2(dot(p,fp)*9.0, dot(p,fd)*1.6) + vec2(ft*0.37 + uSeed));

  // twin speculars: a hot key upper-left, a faint fill lower-right
  vec3 L1 = normalize(vec3(-0.5, 0.62, 0.60));
  vec3 L2 = normalize(vec3(0.55, -0.30, 0.78));
  silver += 1.25*pow(max(dot(n,L1),0.), 26.0) + 0.30*pow(max(dot(n,L2),0.), 46.0);

  // glossy shine: an angled sheen drifting across the dome, and on hover-enter
  // a crisp sweep crossing once (SWEEP_ANGLE above sets the direction).
  vec2 shDir = normalize(vec2(${SWEEP_ANGLE[0].toFixed(2)}, ${SWEEP_ANGLE[1].toFixed(2)}));
  float sAx = dot(p, shDir);
  float b1 = (sAx - sin(ft*0.6 + uSeed*3.0)*1.2) * 2.2;
  silver += 0.06 * exp(-b1*b1) * h;
  if (uSweep < 0.999) {
    float b2 = (sAx - mix(-1.7, 1.7, uSweep)) * 3.0;
    silver += 0.55 * exp(-b2*b2) * (1.0 - uSweep) * h;
  }

  // sparse micro-speckle (impurities) drifting slowly with the flow
  vec2 sp = (p - drift*0.5) * 13.0;
  vec2 cell = floor(sp);
  float rnd = fract(sin(dot(cell, vec2(127.1,311.7)) + uSeed*17.0)*43758.5453);
  if(rnd > 0.993){
    float ds = length(fract(sp)-0.5);
    silver *= mix(0.78, 1.0, smoothstep(0.04, 0.14, ds));
  }

  // ---- meniscus: near-black rim exactly at the edge ------------------------
  float rim = smoothstep(0.0, 0.085, -d);
  vec3 col = mix(vec3(0.015,0.018,0.024),
                 vec3(silver*0.985, silver, min(1.0, silver*1.015)), rim);

  // ---- focus: a glint traveling the silhouette -----------------------------
  if(uFocus > 0.01){
    float ang = atan(p.y, p.x);
    float sweep = mod(t*1.7, 6.28318) - 3.14159; // t: freezes under reduced motion
    float dAng = abs(atan(sin(ang-sweep), cos(ang-sweep)));
    float onRim = smoothstep(0.10, 0.0, -d) * smoothstep(0.085, 0.0, d);
    col += uFocus * onRim * smoothstep(0.9, 0.0, dAng) * vec3(0.9);
  }

  frag = vec4(col*edge, edge); // premultiplied
}`;

// ---------------------------------------------------------------------------
// raster → SDF (8SSEDT signed distance transform)
// ---------------------------------------------------------------------------
function edt(mask, w, h) { // mask 0..1 → signed distance in px (+ outside)
  const INF = 1e9;
  const mk = (inside) => {
    const gx = new Float64Array(w * h), gy = new Float64Array(w * h);
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
    const out = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = Math.hypot(gx[i], gy[i]);
    return out;
  };
  const dOut = mk(false), dIn = mk(true);
  const sd = new Float64Array(w * h);
  // dIn: distance to the glyph (0 inside it) · dOut: distance to the outside
  // (0 outside). Signed = dIn − dOut → negative inside, positive outside.
  for (let i = 0; i < w * h; i++) sd[i] = dIn[i] - dOut[i];
  return sd;
}

async function rasterToSDF(gl, source, tilePx) {
  // source: {svgPath, strokeWidth?} | {svgEl} | {imageEl} → alpha → SDF texture
  const c = document.createElement('canvas');
  c.width = c.height = tilePx;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pad = tilePx * (1 - 1 / EXTENT) * 0.5;
  const box = tilePx - pad * 2;
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
    const s = box / Math.max(bb.width + stroke, bb.height + stroke);
    g.save();
    g.translate(tilePx / 2, tilePx / 2);
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
    const s = Math.min(box / iw, box / ih);
    const w = iw * s, hgt = ih * s;
    // thin marks get body: nudged copies before the distance transform act as
    // a dilate; thicken > 1 widens the radius and adds the diagonals
    const rad = 2 * (source.thicken || 1);
    const taps = [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]];
    if ((source.thicken || 1) > 1) {
      const dg = rad * 0.71;
      taps.push([dg, dg], [-dg, dg], [dg, -dg], [-dg, -dg]);
    }
    for (const [ox, oy] of taps) {
      g.drawImage(img, (tilePx - w) / 2 + ox, (tilePx - hgt) / 2 + oy, w, hgt);
    }
  }
  const data = g.getImageData(0, 0, tilePx, tilePx).data;
  const mask = new Float64Array(tilePx * tilePx);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] / 255;
  const sd = edt(mask, tilePx, tilePx);
  // Encode in SHAPE units (±RANGE about the edge), so the shader math is
  // independent of tile resolution / devicePixelRatio.
  const pxPerUnit = tilePx / (2 * EXTENT);
  const px = new Uint8Array(tilePx * tilePx * 4);
  for (let i = 0; i < sd.length; i++) {
    const v = Math.max(0, Math.min(255, 127.5 + (sd[i] / pxPerUnit / SDF_RANGE) * 127.5));
    px[i * 4] = v; px[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // canvas rows are top-first
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tilePx, tilePx, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
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
const SHAPES = { plus: 0, bars: 1, broadcast: 2, bubble: 3, ring: 4, blobs: 5, bubblewide: 7, frame: 8 };
const WIDE_MAX = 5;          // renderer canvas is WIDE_MAX tiles wide for wide shapes
let R = null;

function setupGL(gl, tile) {
  // Builds (or rebuilds, after context restore) the program + quad + uniforms.
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[mercury]', gl.getShaderInfoLog(s)); return null; }
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
    'uMouse', 'uHover', 'uSweep', 'uRangeX', 'uFrame', 'uFrameT',
    'uTrailN', 'uDropN']) {
    U[name] = gl.getUniformLocation(prog, name);
  }
  gl.uniform1i(U.uSDF, 0);
  gl.enable(gl.SCISSOR_TEST); // clears cost only each button's own tile
  return U;
}

function renderer() {
  if (R) return R;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const tile = Math.round(TILE * dpr);
  const canvas = document.createElement('canvas');
  canvas.width = tile * WIDE_MAX; // room for wide shapes (chat bubble, frames)
  canvas.height = tile;
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return { gl: null };                 // not cached: a later mount may retry
  const U = setupGL(gl, tile);
  if (!U) return { gl: null };
  // octaves 2: the 3rd octave is fine detail the smooth look doesn't want,
  // and it's ~a third of the noise cost across every pixel of every button
  R = { gl, canvas, tile, U, buttons: new Set(), running: false, frameMs: [], octaves: 2, fc: 0 };
  // Survive GPU resets: preventDefault invites a restore; on restore, rebuild
  // program state and re-bake every raster SDF (their textures died with the
  // old context). Frames are skipped while lost, so buttons freeze, not blank.
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => {
    const U2 = setupGL(gl, tile);
    if (!U2) return;
    R.U = U2;
    for (const b of R.buttons) {
      b.tex = null;
      if (b.shapeId === 6 && b.bakeSrc) {
        rasterToSDF(gl, b.bakeSrc, tile).then((tex) => { b.tex = tex; }).catch(() => {});
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
    const t0 = performance.now();
    const gl = r.gl;
    r.fc = (r.fc || 0) + 1;
    const refreshRects = r.fc % 8 === 0;
    for (const b of r.buttons) {
      try {
        if (b.shapeId === 6 && !b.tex) continue;   // SDF still baking
        // layout reads are cached: 16 buttons × 60fps × getBoundingClientRect
        // is real jank — refresh every 8th frame instead
        if (refreshRects || !b.rect) b.rect = b.out.getBoundingClientRect();
        if (!b.rect.width) continue;               // hidden screen
        if (b.trackEl) b.syncTrack(r);
        // idle bodies breathe at 20fps (staggered); anything the user is
        // touching — hover, blade, droplets, press, focus — runs full rate.
        // The slow ambient clock (FLOW_SPEED 0.3) makes 20fps invisible.
        const active = b.hoverTarget || b.hover > 0.02 || b.trail.length > 0
          || b.drops.length > 0 || b.state !== 'idle' || b.clump > 0.01
          || b.wobble > 0.005 || b.focus > 0.02 || b.core < 0.999
          || now - b.resizeT < 400;
        if (!active && (r.fc + b.stagger) % 3 !== 0) continue;
        b.step(now, dt);
        gl.viewport(0, 0, b.vpW, r.tile);
        gl.scissor(0, 0, b.vpW, r.tile);
        gl.uniform1i(r.U.uShape, b.shapeId);
        gl.uniform1f(r.U.uRangeX, b.rangeX);
        gl.uniform2f(r.U.uFrame, b.frameVec[0], b.frameVec[1]);
        gl.uniform1f(r.U.uFrameT, b.frameT);
        // wrap ~70min: raw performance.now() outgrows fp32 in long-lived tabs
        gl.uniform1f(r.U.uTime, (now % 4194304) / 1000);
        gl.uniform1f(r.U.uSeed, b.seed);
        gl.uniform1f(r.U.uFlow, b.cfg.flowSpeed);
        gl.uniform1f(r.U.uVisc, b.cfg.viscosity);
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
        b.octx.clearRect(0, 0, b.out.width, b.out.height);
        b.octx.drawImage(r.canvas, 0, 0, b.vpW, r.tile, 0, 0, b.out.width, b.out.height);
      } catch (err) {
        if (!b.warned) { console.warn('[mercury]', err); b.warned = true; }
      }
    }
    // 60fps floor: degrade noise octaves before resolution
    r.frameMs.push(performance.now() - t0);
    if (r.frameMs.length > 90) {
      const avg = r.frameMs.reduce((a, c) => a + c, 0) / r.frameMs.length;
      if (avg > 8 && r.octaves > 1) r.octaves -= 1;
      r.frameMs.length = 0;
    }
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
    framePx: 6,                 // frame rings: total metal thickness in px
    seed: Math.random() * 100, ...config,
  };
  if (PRESET_PATHS[cfg.shape]) Object.assign(cfg, PRESET_PATHS[cfg.shape]);

  const aspect = Math.max(1, cfg.aspect);
  const rangeX = EXTENT + (aspect - 1); // shape-space half-width (margin stays absolute)
  const out = document.createElement('canvas');
  out.width = Math.min(r.gl.canvas.width, Math.round(r.tile * rangeX / EXTENT));
  out.height = r.tile;
  out.className = 'mercury-blob';
  const visualW = cfg.size * rangeX, visualH = cfg.size * EXTENT;
  // no inline display: the app's `.broadcast.live canvas.mercury-blob` hide
  // must stay able to win (position:absolute makes display moot anyway)
  out.style.cssText = `position:absolute;left:50%;top:50%;translate:-50% -50%;width:${visualW}px;height:${visualH}px;pointer-events:none;`;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(out);

  const isPreset = cfg.shape in SHAPES && !cfg.svgPath && !cfg.svgEl && !cfg.imageEl;
  const b = {
    el, out, octx: out.getContext('2d'), cfg,
    seed: cfg.seed, shapeId: isPreset ? SHAPES[cfg.shape] : 6, tex: null,
    trail: [], drops: [], dropT: 0, clump: 0, core: 1, wobble: 0, focus: 0,
    hover: 0, hoverTarget: 0, mouse: { x: 99, y: 99 }, sweepStart: 0,
    rangeX, vpW: out.width, frameT: 0.08, rect: null, resizeT: 0, stagger: mountSeq++,
    frameVec: cfg.shape === 'bubblewide' ? [aspect - 0.85, 0] : [0, 0],
    trackEl: cfg.track ? el : null, _cw: 0, _ch: 0,
    state: 'idle', stateT: 0, pressed: false,
    // frames hug a living element: re-derive canvas + shape from its size
    syncTrack(rr) {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      const M = Math.max(14, Math.min(36, h * 0.45)); // liquid margin, scaled to the box
      const cw = w + M, ch = h + M;
      if (Math.abs(cw - this._cw) <= 2 && Math.abs(ch - this._ch) <= 2) return;
      this._cw = cw; this._ch = ch;
      this.resizeT = performance.now(); // mid-resize = full-rate rendering
      this.rect = null;                 // re-read the canvas rect next frame
      this.out.style.width = cw + 'px';
      this.out.style.height = ch + 'px';
      this.rangeX = EXTENT * cw / ch;
      this.vpW = Math.min(rr.gl.canvas.width, Math.round(rr.tile * this.rangeX / EXTENT));
      if (this.out.width !== this.vpW) { this.out.width = this.vpW; this.out.height = rr.tile; }
      const unit = ch / (2 * EXTENT); // px per shape unit
      this.frameVec = [(w / 2) / unit, (h / 2) / unit];
      this.frameT = (cfg.framePx / 2) / unit; // px-constant at any box size
    },
    step(now, dt) {
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
    rasterToSDF(r.gl, src, r.tile)
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
      y: (1 - (e.clientY - rect.top) / rect.height) * 2 * EXTENT - EXTENT,
      t: performance.now(),
    };
  };
  const onMove = (e) => {
    if (reduced()) return;
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
  const onDown = () => { if (!reduced()) press(); };
  const onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !b.pressed && !reduced()) {
      press();
      setTimeout(release, 110);
    }
  };
  const onLeave = () => { if (b.pressed) { b.pressed = false; b.state = 'idle'; } };
  window.addEventListener('pointermove', onMove, { passive: true });
  if (cfg.interactive) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('keydown', onKey);
  }

  r.buttons.add(b);
  startLoop();
  return {
    destroy() {
      r.buttons.delete(b);
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('keydown', onKey);
      out.remove();
    },
  };
}

export default mount;
