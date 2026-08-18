# Liquid Mercury Button System — architecture notes

`src/mercury-buttons.js` · demo at `/mercury-demo.html` · app wiring in `src/mercury-mount.js`

Every button is a blob of liquid mercury rendered as a **procedural 2D signed
distance field** in one WebGL2 fragment shader. No meshes, no sprites, no CSS
filter tricks. One shared GL context renders each button into a tile; each
button blits its tile onto a small 2D canvas centered inside the real
`<button>` (the canvas is 1.7× the icon so pops and cuts have room).

## SDF pipeline

- **Analytic presets** (in-shader): `plus`, `bars`, `broadcast`, `bubble`,
  `ring`, `blobs` — capsules/arcs/round-boxes blended with smooth-min so
  junctions read as pooled liquid.
- **Raster → SDF** for everything else: any `svgPath` (fill, or stroked via
  `strokeWidth`), any `svgEl`, any `imageEl` is rasterized to an alpha mask,
  run through an 8SSEDT signed distance transform (exact euclidean, two-pass),
  and uploaded as a texture storing `0.5 + d/(2·SPREAD)` (SPREAD = 28px).
  `squiggle` is a preset routed through this pipeline on purpose — proof that
  new icons need zero shader changes. Textures upload with
  `UNPACK_FLIP_Y_WEBGL` (canvas rows are top-first, GL's bottom-first).

## Shading (pseudo-3D chrome)

Dome height `h = √(clamp(−d/0.30))`; normals via screen-space derivatives of
the *composed* field (so cuts, droplets, and warps all shade correctly) chained
through dh/dd. Environment = procedural studio: dark floor → hot horizon band
(`exp` lobe at ry≈0.03) → calm sky, Fresnel-weighted. Twin tight speculars
(key upper-left ^34, fill lower-right ^46). Meniscus = near-black mix over the
last 0.085 SDF units before the edge. Anisotropic streaks ride the local flow
direction; sparse hash speckle drifts with it. `fwidth`-smoothstep AA.

## Motion

All the feel knobs live in the `TUNING` block at the top of
`mercury-buttons.js`: `FLOW_AMP` (waviness), `HOVER_BLOB` (hover morph
strength), `SWEEP_MS` + `SWEEP_ANGLE` (shine sweep speed and reflection
angle). Per-button, `cfg.flowSpeed` scales the breathing up and
`cfg.viscosity` stiffens it (used to protect small-featured glyphs like the
camera). `cfg.thicken` fattens raster-pipeline strokes before the bake.

- **Silhouette breathing**: two-layer fbm domain warp — a big slow blob (the
  body sloshing, p·0.85) + a small fast shimmer (the skin, p·2.3) — amplitude
  `FLOW_AMP · flowSpeed / viscosity`, per-button seeds, incommensurate time
  tracks: never loops.
- **Hover morph**: hover multiplies the breathing, weighted by a gaussian
  around the cursor — surface tension gathering where the finger is.
- **Shine**: a faint angled sheen drifts across the dome continuously; on
  hover-enter one crisp sweep crosses the face (eased, ~700 ms).
- **Interior drift**: a second, slower fbm field (0.13/0.11) tilts the shading
  normal only, crawling reflections across a calm silhouette.

## Interaction

- **Blade (hover)**: last 24 pointer positions with ages → capsule segments,
  smooth-subtracted (`smax`, k=0.05) with width `0.085·heal`. Conservation of
  volume: a gaussian bulge (`0.028`) hugs both cut edges; a `sin`-driven
  rebound rides the seal. Heal = 750 ms (spec range 600–900), ease-out;
  overlapping cuts compose because each subtracts sequentially.
- **Click**: pointerdown → clump (150 ms spring toward a rounder blob, 12%
  overshoot). Release → **pop**: 10–18 droplets with radial velocity, light
  damping + gravity, while the core erodes out in ~70 ms. The button's native
  `click` fires on that same pointerup — the action lands at the pop frame.
  Reform ≈ 700 ms: a ramping homeward pull + smooth-min metaball merge, then a
  settle wobble (420 ms decay). Droplet physics runs whenever droplets exist,
  independent of state, so re-clicking or hovering mid-reform stays sane.
- **Focus**: `:focus-visible` eases `uFocus`; a glint travels the silhouette
  rim (no outline rectangle). Enter/Space runs clump→pop (the native action
  fires at keydown — ~110 ms before the visual pop; pointer input is exact).
- **Reduced motion**: time collapses to a per-seed beauty frame with a 3%
  shimmer; press/release becomes an opacity dip; the action fires instantly.

## Performance

Tiles are 176 px × devicePixelRatio (≤2). The budget discipline, in order:

- **Idle lane**: buttons with no hover/trail/droplets/press/focus render at
  20 fps, staggered across frames (the FLOW_SPEED 0.3 ambient clock makes
  this invisible); anything being touched runs full rate.
- **Zero-cost idle loops**: `uTrailN`/`uDropN` counts let the blade and
  droplet loops break immediately when empty.
- **No per-frame layout reads**: button rects are cached and refreshed every
  8th frame (pointermove and the frame loop both read the cache);
  `matchMedia` is one shared MediaQueryList; `:focus-visible` matching is
  gated behind an `activeElement` identity check.
- **Scissored clears** — each button clears only its own tile of the wide
  shared canvas.
- **Octaves**: 2 by default (the 3rd is fine detail the smooth look doesn't
  want); a rolling 90-frame CPU average above 8 ms degrades further to 1.

## Timing constants (top of mercury-buttons.js)

`HEAL_MS 750 · CLUMP_MS 150 · REFORM_MS 700 · TRAIL_N 24 · DROP_N 18 ·
EXTENT 1.7 · SPREAD 28 · TILE 176`

## Testing

Load the demo page (`mercury-demo.html`) with `?merctest` and the module exposes
`window.__mercStep(ms)` — a deterministic clock that advances the simulation
and renders one frame synchronously (never falling behind real time). Hidden
tabs throttle rAF and timers to nothing, so automated verification steps the
clock by hand: sweep synthetic pointermoves, `__mercStep(16)`, read pixels.

## API

```js
import { mount } from './src/mercury-buttons.js';
const handle = mount(buttonEl, { shape: 'bubble', size: 76, seed: 3 });
// → { destroy() } , or null when WebGL2 is unavailable (keep your fallback)
```

React wrapper (if ever needed): call `mount` in an effect, return
`handle.destroy` as the cleanup — the module is framework-agnostic on purpose.
