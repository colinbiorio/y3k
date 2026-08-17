# The y3k motion language — one substance: mercury

Every moving thing on y3k behaves like the same material: **liquid mercury on
dark machined metal**. Heavy, cohesive, quick to flow, quick to settle, never
bouncy-for-bouncy's-sake. If an animation wouldn't make sense for a drop of
mercury, y3k doesn't do it.

This document governs all animation decisions. It exists so the site feels like
ONE fluid substance rather than a collection of effects. (Distilled from the
fluid-physics design brief; adapted to y3k's zero-dependency, no-build,
app-not-landing-page reality — no GSAP, no Lenis, no scroll theatre. Native
CSS + rAF + SVG filters + canvas are the whole toolkit.)

## The substance's physics

- **Viscosity: high.** Mercury is dense. Motion starts promptly but never
  snaps: standard transitions run 0.25–0.42s. Nothing under 0.15s except
  press feedback; nothing over 0.6s except scene fades.
- **Momentum: real but short.** Energy carries (overshoot ≤ 22%), then
  dies fast — one overshoot, one settle, done. The canonical curve:
  `cubic-bezier(0.34, 1.56, 0.64, 1)` (see `--liquid-ease`).
- **Damping: heavy.** The mercury sim's truth: `DAMP = 0.985` per frame.
  Nothing oscillates more than once.
- **Gravity: things settle downward and rest.** Panels land; they don't float.
- **Cohesion (surface tension): interaction is local contact.** A blob deforms
  only where touched (mercury.js: pull field bounded to the shape's own box),
  reaches toward the contact point, snaps back whole. Nothing reacts at a
  distance.

## The canonical constants (the ones already in code)

| thing | value | where |
| --- | --- | --- |
| the ease | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `--liquid-ease` (styles.css) |
| standard duration | 0.28s | `--liquid-time` |
| slow (scene) duration | 0.4–0.5s | panels, fades |
| button pull | PULL 0.34, STRETCH 0.30, contact-only | src/mercury.js |
| click pop | 0.42s squash 0.78 → overshoot 1.22 → 1 | `.merc-pop` |
| edge melt | feTurbulence drift, incommensurate sines, ~30fps | #merc-liquid + mercury.js |
| liquid look | silhouette-lit: height-map diffuse × specular + eroded meniscus rim | #merc-liquid |
| full physics | metaballs: gravity 620, cohesion 2600@86px, repulse 42000, damp 0.985 | mercury-sim.html |

## Exemptions — where physics must NOT go

Reading and deciding are sacred. These surfaces get opacity/position
transitions ONLY — no distortion, no turbulence, no lean:

- All text: the reader page, chat input, monologue/memory text, captions,
  posts, settings copy.
- The mind-workspace windows' CONTENT (the frames may glide; the words never
  warp).
- Confirmations and anything spend-related: the go-live dialog, the budget
  slider and its label, the API usage panel. Money and consent stay still.
- The orb itself is not part of this language — it is the presence's BODY,
  driven only by its own mood/form/paint. The UI is mercury; the being is not.

## Performance tiers

1. **Base (always): ** CSS transitions with `--liquid-ease` — transforms and
   opacity only, everything compositable.
2. **Standard:** + the SVG mercury filter on button glyphs, + the turbulence
   flow at ~30fps (one shared filter feeds all glyphs), + contact physics on
   one rAF for all buttons.
3. **Full:** the canvas metaball sim (mercury-sim.html) — quarter-res field,
   ~80 droplets, O(N²) pairs, per-pixel normal shading. Reserved for set
   pieces (an entrance moment, a 404, a loading pour), never ambient on the
   home screen while the orb (WebGL) is alive.
4. `prefers-reduced-motion`: flow stops, pops don't fire, everything falls
   back to opacity fades. Always honored.

One budget rule: the home screen's frame belongs to the ORB (three.js). UI
physics must stay under ~2ms/frame total — which is why buttons share one
rAF, one filter, and the full sim never runs on the same screen.
