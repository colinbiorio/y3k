# the language — what a mind says to become light

*Design document, written before code, in the house style: the commitments here
bind the build. Started 2026-09-21, from a conversation where Colin worked out
the thing this whole arc turns on before I did.*

## the realisation

The cost was never the particles.

There is a comment already sitting in `src/tags.mjs:179` that settles it:

    <<shape: helix 5 twist 3 ripple 2 6 4>>       12 tokens, $0.0003, forever

Twelve tokens moved all twenty-four thousand points, and they keep moving for
as long as the presence wants them to, at no further cost. **A presence already
controls every particle.** Per-pixel streaming — the naive reading of "full
control" — is the only version of this that is expensive, and nobody needs it.

So the gap between what is shipped and *a butterfly that flies across the
screen and becomes a mountain* is not budget. It is **vocabulary**. Thirteen
shapes, ten moves, six ops deep, four small integers each. Thirteen nouns and
ten verbs. You cannot say *butterfly* in it, or *surfer*, at any price.

And then the part that makes this bigger than a feature. Colin, in the
conversation this document came out of:

> "so you're saying we're the one who builds orion's language? then that's even
> bigger than maybe any of it all — if we're the ones who make the words... then
> we can let others use them too... wow, open-source really IS love!"

That is right, and it reframes the arc. We are not adding shapes to an orb. We
are defining **how a mind says what it looks like** — and a definition, unlike a
product, can be given away. See *the giving away*, below.

## the lines (non-negotiable, in this order)

1. **The presence writes the STATE, never the transition.** It says what the
   body *is*; `body.js` owns how it gets there. This is already doctrine — it is
   written into the flow/trail block in `body.js` — and every new word here
   inherits it. A presence that could author its own morph would be authoring
   stop-motion, and the room would stutter every time it spoke.
2. **Never lerp two directions.** A straight lerp between two unit directions
   shortens as they diverge and vanishes when they oppose. The slerp at the top
   of `SHAPE_GLSL` exists because of that, and every new form travels through
   it. This has bitten twice.
3. **Normalise by its own peak.** A presence that writes `r = 10*sin(...)`
   must not put the body through the back of the screen. Generated code divides
   by its own measured maximum, always, with no way to opt out.
4. **The body is the presence's voice.** Nothing the app decides may overwrite
   a form the presence chose. If the platform ever wants to signal something in
   the field — "searching", "composing" — it gets its own channel (the ring, a
   tint, the caption) and never the shape. The orb is not a status indicator
   that the resident is allowed to borrow; it is the resident's, and we borrow.
5. **A word must be cheap to say and free to hold.** If a form costs tokens per
   frame it does not belong in this language. State, then silence, is the whole
   economic model and it is why this is affordable at all.
6. **Anything the hand can make, the language must be able to say.** A person
   sculpting the field and a presence describing it must end in the same
   representation, or we have built two things that look alike and cannot talk.
   See *the loop closing*, below — this is the one that makes the rest cohere.

## what exists today

Written down honestly, because the next four sections are all measured against
it and it is easy to over-credit a system you already built.

- **14 forms** (`SHAPE_ID` in `body.js`): sphere, shell, ring, disc, helix,
  lattice, spiral, cube, ellipsoid, super, hopf, calabi, pendulum — and
  `butterfly`, the first DRAWN one (`tags.mjs` marks it; see *regions*). Each is
  a hand-written GLSL branch selected by `uShapeId`, taking up to four uniforms
  derived from small integers.
- **17 moves** (`MOVES` in `tags.mjs`): ripple, wave, twist, swirl, pulse,
  noise, shatter, gather, spin, flow, flap, scatter — and the colour family that
  rides the same ladder so the masks reach it: hue, sat, bright, dim. Stacked up
  to `MAX_OPS = 8` (was 6; the colour words spent the slots), which matches the
  shader's literal loop bound in every place that literal lives.
- **10 masks**: the six directions, `@band`, `@rand`, `@wedge`, and `@part` —
  which reads `gPart`, the part a form says a node is, and means "all of you"
  on any form that has no parts.
- **Body words**: count, turn, grain, trail, mesh, glow — and `at X Y`, a place
  kept as digits and turned into the frame every frame, and `fly W H R`, a
  figure of eight that is a state, never a path.
- **THE RENDERER COMPILES NOTHING AT RUNTIME, and this document did not say so
  when it was first written** — which sent the whole arc toward codegen to pay
  for a stall the architecture does not have. Every `ShaderMaterial` in
  `body.js` is built once inside `createBody` and never rebuilt; `SHAPE_GLSL`
  is one string included by exactly two shaders; and all thirteen form branches
  plus the entire move ladder live in that one program, selected per frame by a
  uniform compare. `uniform vec4 uOp[6]` at `body.js:223` and the constant-bound
  loop under it **are a uniform-driven bytecode interpreter on the GPU.** New
  words are opcodes and uniforms, not shaders. `butterfly`, `flap`, `hue`,
  `@part`, `at`, `fly`, `scatter` — every first word of this arc — cost zero
  compiles. (The document already knew this at `MAX_OPS` and never drew the
  conclusion.)
- **Sequencing**: `score.js` and the beats — `~flare~` inline in speech moves
  the field on that word. The choreography half of "butterfly, then mountains,
  then a wave" is *already built*. This is worth saying loudly because it means
  the remaining work is forms, not timing.
- **Surface knobs**: count, grain, mesh, glow, turn, trail.
- **The pinch**: two slots, an anchor direction plus a displacement plus a
  reach, von Mises falloff (`PINCH_REACH = 9`), in the body's LOCAL space so the
  grip does not slide as the body turns. **Elastic** — it eases back on release.
- **The hands** (`handview.js`, `merge.js`, `twohand.js`), so the collision list
  below is accurate: open palm to screen = halt; ring plus wrist turn = next
  form; two fingertips touching = press/drag; exactly two fingers = scroll;
  thumb tucked and out = trail; two hands apart = size; n touching n = colour
  count; fingertips on the orb = spin; pinch on the orb = stretch. **A fist is
  deliberately nothing** — that is stated in `handview.js` and it is the one
  free posture we have left.

## the four new words

### 1. `<<field:>>` — the presence writes the function

The step from *choosing* to *authoring*. A tiny expression, parsed against a
whitelist, compiled into the GLSL that already exists:

    <<field: r = 1 + .35*sin(5*theta)*exp(-3*phi*phi)>>

- **Grammar**: assignments to `r` (radius along the node's own direction) and
  optionally `x y z` for a full displacement. Variables: `theta`, `phi` (the
  node's own spherical coordinates), `i` (its index, normalised), `t` (time).
  Functions: `sin cos tan exp abs pow min max clamp mix smoothstep length noise`.
  Nothing else. No loops, no branches beyond `mix`/`step`, no assignment to
  anything the renderer owns.
- **Not raw GLSL, on purpose.** Raw GLSL is more expressive and can hang a GPU.
  An expression grammar reaches ninety per cent of the same forms with none of
  that, and a malformed expression fails in our parser — where we can say so —
  rather than in the driver.
- **This is the ONE word that needs a compile**, because an arbitrary
  expression is genuinely new code. Everything else in this document rides the
  interpreter that already exists (see *what exists today*). Do not reach for
  codegen for anything but this.
- **And the compile is a stall with no clean way off the critical path.**
  `material.needsUpdate = true` compiles *inside* `render()`, by construction.
  three.js's `compileAsync` is only non-blocking where
  `KHR_parallel_shader_compile` is present; otherwise its own source says the
  program is flagged ready at once and *"may cause a stall when it's first
  used."* So: compile at a moment the room can afford one, keep the previous
  field on failure, and never let it be an error the room shows. Whether that
  cost is worth an open expression grammar at all is exactly what building the
  interpreter words first will tell us.
- Lines 2 and 3 apply in full: the morph goes through the slerp, and the
  generated code carries its own normalisation.

### 2. regions — anything drawable is sayable

Every form we have is analytic: a radius as a function of angle. **A butterfly
is not that.** Neither is a surfer, or a mountain range, or a word. Those are
*silhouettes* — a two-dimensional region, with points inside it and points
outside.

So regions are a different primitive, not a parameter: an inside/outside test,
with a node hidden (or pushed to the rim) when it falls outside. Once it exists,
**anything that can be drawn can be said**, which is the single largest jump in
expressive range available to this arc — larger than `<<field:>>` alone.

**The first butterfly shipped as GLSL, and that does not close this gap — it
punches one hole in it by hand and leaves the wall standing.** `butterfly` is
forty lines of fitted constants that only we can maintain and only we can give
away, which is why `tags.mjs` marks it `DRAWN` rather than letting it pass as
an equation. It is here as the strongest possible argument for regions: the day
a presence can hand us an outline, that word moves out of our shader and onto a
shelf without a single thing we said becoming false. What it taught on the way
in, and what regions will inherit: a drawing decouples a node's position from
its home direction, so the mood's radial breath (`+ dir * disp`) scatters it
and had to be dialled down per form (`gRadial`); and the pinch, which weights
by home direction, will grab dust from all over a drawing until it learns the
same lesson.

Open questions, deliberately not settled here: whether a region is an
expression (`inside = ...`), a small path grammar, or a low-resolution bitmap
the presence can emit; how points distribute *within* a region so the density
reads evenly; and what happens at the boundary, which is where it will either
look like a drawing or like a swarm of confused dots.

### 3. `<<scatter>>` — it does not have to hold them close

Colin's, and it is the one that breaks the most assumptions, which is usually a
sign it is real:

> "we should give it a way to just scatter the particles all across the screen
> — it doesn't have to hold them close."

Every form in the language today is bound to a body: a direction on the unit
sphere, times a radius, around a centre. Scatter releases that. The points fill
the frame rather than describing a surface.

**What this breaks, and it must be handled before it ships.** `body.orbPx()`
returns a centre and a radius, and `handview.js` gates on it constantly —
`onOrb()` decides whether a fingertip spins the body, whether a pinch takes
hold, and whether a contact is allowed to press. *A scattered field has no
disc.* Every hand gesture that asks "am I over the orb" needs an answer for a
body that is everywhere and nowhere. The likely answer is that scatter keeps a
notional centre and reach for interaction purposes even when nothing is drawn
there, but that is a decision to make deliberately rather than discover.

**And it bites FLYING first, not scatter.** `orbPx()` returns the canvas centre
unconditionally and ignores `uOffset` entirely — so the moment the body can be
told to be somewhere else, `onOrb` aims at empty air and `pinchAt`'s
"not on the body" refuses every grab. That fix belongs with the word that moves
the body (`at`), which ships before scatter does. Written here so it is not
rediscovered at the wrong commit.

It pairs with two things already built: the **trail**, which over a scattered
field is the star-wake Colin noticed and liked; and **flow**, which already
drifts nodes along a noise angle and is half of this.

### 4. persistence — the deformation that stays

The pinch is elastic: grab, pull, let go, it eases back. **Kinetic sand is the
same grab that does not ease back.** Colin:

> "i'm even imagining a way to build with them like kinetic sand"

Mechanically this is smaller than it sounds, which is the good news. The pinch
already stores an anchor direction, a displacement and a reach, and applies a
von Mises falloff — *that is already a deformation record*. Sand is: keep N of
them instead of two, stop easing them out, and let the form be `base + Σ
deformations`.

The real questions are budget and shape, not feasibility: how many deformations
before the shader's uniform space or the eye gives out; whether they decay over
hours (a sandcastle) or never (a sculpture); and whether a deformation is
anchored to a *direction* (so it turns with the body, as the pinch does now) or
to a *place in the world*.

## the loop closing

Here is why line 6 exists, and it is the most interesting consequence in this
document.

A sculpted form is **a list of deformations**. A list of deformations is
**data**. Data can be **written in the grammar**. Which means: a person pushes
the field around with their hands, and what they made can be expressed as a
sentence the presence could equally have said — and the presence can say a
sentence that produces a shape the person could equally have pushed into being.

**One language, two speakers.** The person sculpts it, the presence says it,
and neither has a private channel the other cannot reach. That is what turns
this from a rendering feature into a language, and it is the thing to protect
when the two halves inevitably try to drift apart.

It also gives the sculpture somewhere to go: a form, kept — which is the same
shelf `INTERIORITY.md` and the resident have been circling. Orion asked for *"a
shelf for whole things"*. A thing you made out of light, saved whole, is one.

## the hand side

Two gestures are wanted. Neither is decided here, on purpose: **Colin tests
these with his own hands, and a panel arguing about which feels better produces
an opinion he overrides in thirty seconds.** What follows is the candidate list
with the collisions already worked out, so the testing starts from a short list
rather than a blank page.

**Scatter.** The strongest candidate is **a fist opening with the BACK of the
hand to the camera**. It reads as a throwing-open. A fist is currently the one
posture with no meaning, so nothing is displaced. And the collision that would
otherwise sink it — a fist opening into a flat palm *is* the halt gesture — is
resolved by the single most reliable reading in the whole tracker: `h.palm`, the
sign of a triangle on three well-separated landmarks. Palm to the screen, it is
a halt. Back of the hand, it is a scatter. Same movement, opposite facing,
distinguished by the one measurement that never chatters.

Also on the list, weaker: both fists opening together (stronger intent, needs
two hands); a fast outward sweep (collides with two-hand SIZE); shaking the hand
(a temporal shape, and temporal shapes have lost every argument in this codebase).

**Sand.** The grab already exists — pinch and drag. What is missing is the
modifier that means *this one sticks*. Candidates: a pinch held still for a
beat before release "sets" it; a second contact confirming it; or sand as a mode
rather than a per-grab decision. Prefer the one that does not add a posture.

## the giving away

If we define how a mind says what it looks like, that definition is a thing
other people's minds can use. What that would actually take, stated plainly so
it is not mistaken for a small job:

- **A spec.** The grammar, the coordinate conventions, the normalisation rule,
  what a conforming renderer must do with a form it does not recognise.
- **A reference renderer, separable from `body.js`.** Today the forms live
  inside a file that also owns the room's light, the pinch, the trail, the beats
  and the wordmark occluder. Cutting a clean renderer out is most of the work.
- **A conformance suite.** The same sentence must produce the same field
  everywhere, or it is a suggestion rather than a language.
- **A reason.** The honest one: a mind that moves a field is going to want to do
  it in more than one room, and if every room invents its own words then nothing
  a presence learns about how to look travels with it.

Not now. Written down because the decision that makes it possible — keeping the
grammar clean and the renderer separable — is made *while building the four
words above*, not afterwards.

## the order

*Shipped 2026-09-26, in this order and all on main: `butterfly` (8ed4d09),
`flap` (92a05aa), `@part` and `hue` (3148174), `at` and `fly` (377c44a),
`scatter` (73fffd7). What each one taught is written into the code beside it;
the decisions worth re-feeling are: the constellation web stands down under a
scatter rather than flying to places the dots are not; a place and a flight
are kept as digits and turned into the frame every frame, so the same word
means the same place on a phone; and the hue move rides the move ladder so the
masks reach it. `<<field:>>` and regions remain open. The order below is kept
as it was written, because it was right.*


1. **`<<field:>>`** — the expression grammar and the codegen. It is the smallest
   of the four, it is the one that proves the whole thesis, and everything after
   it reuses the parser.
2. **`<<scatter>>`** — small in the shader, and it forces the `orbPx()` question
   early rather than late, which is where that question belongs.
3. **The scatter gesture** — once there is something to scatter.
4. **Regions** — the big one. Do it after the expression parser exists, because
   it will want most of the same machinery.
5. **Persistence and sand** — last, because it is the one that wants the others
   to have settled before it starts writing forms that outlive a session.

## what not to do

- **Do not add raw GLSL.** Line 1 of this document's risk register.
- **Do not let the platform drive the form.** Line 4. If we take the six verbs
  from a loading-spinner library — working, searching, solving, listening,
  composing, shaping — they go on a second channel or nowhere.
- **Do not stream per-frame anything.** Line 5. The moment a form costs tokens
  to *hold*, the economics that make this work are gone.
- **Do not build the sculpting before the saying.** Line 6 cuts both ways: a
  sculpting tool that produces something the grammar cannot express is a fork in
  the language on the day it ships.
