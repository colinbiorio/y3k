# BUILD BRIEF — Three Ways In

> **Read this whole document before you touch anything.** It is a prompt, written by a Claude session that spent its time reading the tree and checking the libraries rather than writing code, and handed to you to implement. Every `file:line` was read, and every library fact in §2b was fetched and verified, on 2026-09-19. §10 says exactly where the certainty stops.

## Who you are and what you are doing

You are working in **`~/Desktop/univispira/body`** — the y3k repo (`github.com/colinbiorio/y3k`), live at **yearthreethousand.com**. Colin has asked for three things, and this document is the whole of what is known about them:

1. **Face-tracked depth** — the room moves with your head, the way the Mona Lisa's eyes do. Only while the camera is on.
2. **Hand control** — a hand in front of the camera drives the screen: spinning the orb, pressing buttons, turning the logo.
3. **The phone as a remote** — mobile-only, behind a remote glyph on the top or bottom nav bar.

## How this codebase works, in five lines

- **Buildless.** Vanilla JS ES modules, no bundler. Libraries arrive via the importmap in `index.html` (three is pinned there) or vendored into `src/vendor/`. There is no build step to hide anything in.
- **The server is Node ESM** — `node server.mjs`, port 5173. Plain `http`, hand-rolled routing, no framework.
- **BYOK only.** There is no site model key. Nothing may assume a free server-side call.
- **`main` auto-deploys to production on Render.** A push is a deploy. **Do not commit or push without asking Colin first** — and note `Y3Dos/` is currently untracked with a `node_modules/` in it, so `git add -A` is a live landmine.
- **The house writes design docs** (SENSES.md, MOTION.md, WORLD.md, INTERIORITY.md) in prose, with real numbers and honest verdicts. If you add one, match that.

## Ground rules for this build

1. **Read §10 before you write a line.** It splits this document into what was actually fetched and checked (the library facts in §2b, every `file:line` citation) and what is still a prediction (frame budget, latency, GPU delegate). Trust the first list. Test the second. If a prediction turns out wrong, the *architecture* still holds — only the tuning changes.
2. **Build in the stages of §8, and stop at each gate.** Stages 2 and 3 are each independently shippable. Do not start the hand until the window is actually good.
3. **Measure, don't assume.** Frame budget, latency, and inference cost are all stated here as predictions. They are marked as predictions. Treat them that way.
4. **Read §7 twice.** Those are the traps this codebase has already sprung on people. They are silent failures, not error messages.
5. **When something in this document turns out to be wrong, say so plainly and keep going.** It was written from a read of the tree, not from running it. The verdicts in §0 are the parts worth defending; the details are the parts worth checking.
6. **The honest-scoping sections are the point.** §4 says a free-air cursor clicking 44px glyphs is bad and cannot be fixed by tuning. Do not quietly build it anyway because it is the obvious thing. Build the thing described instead.

---

SENSES.md was about what the presence perceives. This is the other direction: **the person in front of the screen, reaching in.**

---

## 0. The verdicts, first

| | verdict | why |
|---|---|---|
| **The window** (face-tracked depth) | **Build it. Strongest of the three.** | The room is already a box with a fixed camera at its center (`body.js:972`, `fitCamera` at `:1697`). Head-coupled perspective is a ~50-line change to one function. It will look remarkable and it costs nothing per frame. |
| **The hand** (hands control the screen) | **Build it — but as a hand vocabulary, not a mouse.** | Spinning the orb with your hand: excellent, and free (the orb takes raw pointer deltas, `body.js:1190`). A free-air finger cursor clicking 44px rail glyphs: genuinely bad, and no amount of polish fixes it. The fix is magnetic targeting, not better tracking. |
| **The remote** (phone drives the desktop) | **Build it. Cheapest of the three.** | The exact channel already exists and is in production: SSE fan-out + POST control (`server.mjs:2420-2450`, `streams.mjs`). Clone the shape, change the namespace. The hard part is not the transport, it is the pairing security. |

One thing that is **not** on Colin's list and should be built anyway, because it is what makes this y3k instead of a tech demo: **§6, the percept line** — the presence gets told, in about fifteen tokens, that someone just leaned in.

---

## 1. What is already here (do not rebuild these)

Read these before writing anything. Each one removes a chunk of work.

**A camera module, already privacy-shaped.** `src/camera.js` (57 lines) is `createCamera(videoEl)` → `{ isOn, on, off, toggle, captureFrame }`. It requests `facingMode: 'user'`, 640×480 ideal, no audio. It is wired at `main.js:316` to `<video id="cam">` (`index.html:459`), toggled by `#chat-camera` at `main.js:1024`, and `main.js:41` already paints an on-air indicator whenever the mic or camera is live. **The camera gate Colin asked for is already built.** Face and hand tracking hang off `camera.isOn()` and nothing else.

**The orb takes raw pointer deltas.** `body.js:1190`:

```js
function spin(dx, dy) {
  _q.setFromAxisAngle(_yAxis, dx); rig.quaternion.premultiply(_q);
  _q.setFromAxisAngle(_xAxis, dy); rig.quaternion.premultiply(_q);
  rig.quaternion.normalize();
}
```

Driven by `pointerdown`/`pointermove` on the canvas (`:1198-1206`), with fling inertia and idle resume in `updateTrackball` (`:1245`). `ROT_SPEED 0.005`, `DAMP 0.9`, `IDLE_SPEED 0.0016`. A tap is <6px of movement in <500ms (`:1216`). **Anything that can produce pointer events can spin the orb, with inertia, for free.**

**Nothing in the codebase reads `event.isTrusted`.** Zero hits across `src/` and `server.mjs`. Synthetic pointer events pass through every handler in the app unchallenged.

**`setPointerCapture` is already treated as optional everywhere it is used.** `body.js:1201` and `mercury-buttons.js:2410` both wrap it in try/catch — the latter's comment is literally *"capture is a nicety"*. A synthetic `pointerId` that the browser does not know will throw `NotFoundError` there and be swallowed. **This is what makes the synthetic-pointer approach viable rather than a fight.**

**The SSE fan-out channel exists and ships.** `server.mjs:2420-2450` — `/api/live/:handle/events` holds an SSE connection open with a 15s heartbeat and `x-accel-buffering: no` (the header that stops Render's proxy from buffering the stream). `/api/live/:handle/publish` is the POST control channel. `streams.mjs` (232 lines) is the whole fan-out: `addViewer`, `publish`, `startStream`, `endStream`, `viewerCount`. The client side of the same pattern is `social.js:1149-1230`, including sequence-number dedupe across `EventSource` auto-reconnects.

**Both extra nav bars exist and are empty.** `index.html` declares `<nav id="home-nav-top">` and `<nav id="home-nav-bottom">` with no children. There is room for the remote glyph exactly where Colin asked for it.

**A microphone-permission precedent to copy.** `listen.js:385-391` — feature-detect, then request, then fail honestly. Do the same for the camera; do not assume.

**Three is CDN-loaded, not vendored.** `index.html:13-18` is an importmap pointing at `three@0.160.0` on unpkg. The precedent for a new library is *an importmap entry with a pinned version*, not a bundler. (Motion is the exception — vendored at `src/vendor/motion-13.1.1.js` and served immutable — because it is small and central. A 3.7 MB model file is not a vendoring candidate.)

**Y3Dos** (`body/Y3Dos/`) is a Vite + Three + Electron prototype: a prism shell with five faces, URL tabs per face. Worth reading for the shell idea. **Do not port its tracking.** It depends on `window.FaceDetector` (the Shape Detection API — Chrome-only, bounding-box only, no landmarks, no depth) and it moves the camera rather than building an off-axis frustum, which is the wrong technique (§3). Also note: `Y3Dos/` is currently **untracked inside the y3k git repo** (`?? Y3Dos/`, and it has a `node_modules/`). Decide whether it is a submodule, a sibling repo, or ignored — before someone runs `git add -A`.

---

## 2. The shared foundation

All three features want the same three things. Build these once, first.

### 2a. The eye gate — `src/perceive.js`

One module owns the camera-derived perception loop. Rules:

- **It only runs while `camera.isOn()`.** No speculative permission prompts, no background inference, no "just to see if it's supported." The user turns the eye on; the eye is the only thing that turns on.
- When the camera goes off, **tear down the task instances** (`.close()` on the MediaPipe landmarkers) and release the GPU buffers. A closed camera that leaves 11 MB of models resident and a GPU delegate warm is a lie about being off.
- It exposes a read-only snapshot, polled by whoever wants it: `{ head: {x,y,z,ok,age}, hands: [{tip, pinch, handedness, ok}], t }`. **No callbacks into feature code** — the render loop pulls, so a slow consumer cannot stall perception and a stalled perception cannot stall the frame.
- `face` and `hands` are **independently switchable**. Face depth on with hands off has to be a real configuration — it is the cheap one, and it is the one most people will want.

### 2b. The model — MediaPipe Tasks Vision

**`@mediapipe/tasks-vision@1.0.1`, Apache-2.0, zero runtime dependencies.** ESM entry `vision_bundle.mjs`. All of the following was fetched and verified on 2026-09-19 — URLs returned 200, sizes are real `content-length` bytes.

```
https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs      152 KB
https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/                  (FilesetResolver base)
  └ vision_wasm_internal.wasm                                                    11.2 MB  ← the weight
  └ vision_wasm_internal.js / vision_wasm_nosimd_internal.js                     ~316 KB each
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task   3.58 MB
https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task   7.46 MB
```

**Read the page weight before you design anything else: ~15 MB to turn the eye on for face alone, ~22 MB with hands.** That number decides the loading behaviour, and it is not negotiable:

- **Load nothing until the camera is actually turned on.** Not at boot, not on hover, not "to warm the cache." This is already the gate (§2a) — the weight is the reason it is not merely a privacy nicety.
- **Load face first, hands second and only if asked.** 7.46 MB is most of the difference, and face depth is the feature most people will want alone.
- The first turn-on is a real wait on a slow connection. **Say so in the UI** — a progress state, not a spinner that lies. Second time is the HTTP cache.
- Pin the version in the URL. The CDN path *is* the version; `@latest` would silently re-download everything and change behaviour under you.

**The API, verified against `vision.d.ts`:**

```
FilesetResolver.forVisionTasks(basePath)           → WasmFileset
FaceLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath, delegate: 'GPU' | 'CPU' },
  runningMode: 'VIDEO', numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,        ← the one that matters for §3
})
  .detectForVideo(videoFrame, timestamp)           → { faceLandmarks, faceBlendshapes,
                                                       facialTransformationMatrixes }
HandLandmarker.createFromOptions(fileset, {
  baseOptions: {...}, runningMode: 'VIDEO', numHands: 1,
  minHandDetectionConfidence, minHandPresenceConfidence, minTrackingConfidence,
})
  .detectForVideo(videoFrame, timestamp)           → { landmarks, worldLandmarks, handedness }
```

`handednesses` (plural) also exists and is **deprecated — use `handedness`.**

**Landmarks.** Face: 478 in normalized image coordinates. Hand: 21 — **landmark 8 is the index fingertip, 4 the thumb tip**. Pinch is the 4↔8 distance normalised against a stable in-hand reference span (wrist to index MCP), **never raw pixels**, or your pinch threshold drifts as the user leans.

**The head pose.** `facialTransformationMatrixes` is a 4×4 that maps the *canonical* face model onto the *detected* face — so its translation component is the head's position in the camera frame, in canonical-face units. That is the head position, already solved. **Do not hand-roll interpupillary-distance depth if this is available.** It carries the caveat §3 already names: it is scaled by a canonical head, so a smaller head reads as consistently farther away. Irrelevant for parallax.

**HolisticLandmarker: considered and rejected.** It looks like the obvious win — face, hands and pose in one task — but its result type has **no `facialTransformationMatrixes`**, and its options have no way to ask for one. It would leave §3 hand-rolling depth from landmarks while also paying for a full pose model nobody asked for. **Two separate tasks sharing one `WasmFileset` is the right build.** (The 11.2 MB WASM is paid once for both; only the `.task` files are per-model.)

**The alternative, considered and rejected:** TF.js `face-landmarks-detection` wraps the same underlying mesh but drags in a larger runtime and more dependency surface for no capability gain.

**The timestamp trap, which everybody hits once:** `detectForVideo(frame, timestamp)` requires **strictly increasing** timestamps and throws on a repeat. `performance.now()` is fine; `video.currentTime * 1000` is not, because a stalled video repeats it. Keep your own monotonic counter and clamp.

**Where it runs.** Start on the main thread behind a rate cap. Measure. Then move to a worker if it shows — and it may well show, because `body.js` is already running a 24,000-particle system through a bloom composer, and stealing 10–15 ms per frame from that is visible. The worker path is `video.requestVideoFrameCallback()` → `createImageBitmap(video)` → transfer to worker → landmarks back. Ship the simple one, keep the measurement, upgrade on evidence. Rate caps to start from: **face 30 Hz** (camera-native; it is a head, it does not move fast), **hands 20–24 Hz** with interpolation between results.

**`delegate: 'GPU'` is a request, not a guarantee.** Detect the fallback to CPU and halve your rate caps when it happens, rather than dropping frames in the render loop.

### 2c. The synthetic pointer bus — `src/reach.js`

This is the piece that makes features 2 and 3 cheap instead of enormous.

Both the hand and the phone produce the same thing: *a position on screen, and a press state*. Rather than teaching every widget in the app about hands and phones, **synthesise real `PointerEvent`s and dispatch them at the element under the point.** Every existing handler — the orb's spin, the mercury buttons' hover swell and press clump, the logo's spin (`mercury-buttons.js:2439-2451`), the window drag bars, the world's pan — comes along for free and stays visually correct.

```
reach.down(x, y)  → pointerdown  at elementFromPoint(x, y)
reach.move(x, y)  → pointermove  (+ pointerover/out when the target changes)
reach.up(x, y)    → pointerup, then click if it was a tap
reach.cancel()    → pointercancel
```

Use one reserved `pointerId` per source (hand-left, hand-right, phone) and `pointerType: 'pen'`. `'pen'` is the honest label — it is a pointing device that is not a mouse and not a finger on glass — and it keeps these events out of any code branching on `'touch'`.

**Four non-negotiables:**

1. **Always emit the matching `pointerup`.** `body.js:1240` ends a drag on a *window-level* `pointerup`/`pointercancel`. If a hand leaves the frame mid-drag and no up is sent, `dragging` stays true forever and the orb is stuck. Every source needs a liveness timeout that fires `reach.cancel()`.
2. **`setPointerCapture` will throw** on an unknown pointerId. This is fine — every call site already catches (§1) — but do not add a *new* uncaught one.
3. **Synthetic events cannot start user-activation-gated APIs.** A synthetic click will not start audio, will not enter fullscreen, and will not open `getUserMedia`. So a hand or a phone **cannot** press `#chat-voice` into a working microphone. Either exclude those controls from reach targeting, or have them respond by asking the person at the keyboard. Do not ship a button that lights up correctly and silently does nothing.
4. **Respect the world's play-only verb gate.** The world's `WORLD_VERBS` gate exists so that the orb can never move the world. A hand and a phone are the *person*, not the presence, so they are allowed where a person is allowed — but the gate is a single constant and reach must be checked against it rather than routed around it.

---

## 3. The window — face-tracked depth

### The technique

**The screen is a window, not a camera.** This is the whole thing, and it is why Y3Dos's approach reads as wobbly instead of solid.

Moving or rotating the camera with the viewer's head is what almost everyone builds first, and it is wrong: it makes the *world* swing, which the eye reads as the room being on a gimbal. What actually produces the Mona Lisa effect is holding a **fixed rectangle in world space — the screen — and rebuilding the projection frustum from the viewer's eye through that rectangle's four corners.** The frustum becomes asymmetric (off-axis) as you move off center. The world stays bolted down; your view into it changes. That is what a window does.

### What it costs in this codebase

Very little, because `fitCamera` (`body.js:1697`) already computes everything needed.

It fits a sphere of `R = 1.6` at `dist = (R / sin(limit)) * 1.06` with a 45° FOV camera (`:972`), then scales the room to `half = dist * 1.5` with `ROOM_HALF_H` fixed. So the world-space rectangle the camera currently sees at the orb's depth is directly derivable from `dist` and the FOV. **That rectangle is the window.** Compute it once in `fitCamera`, stash it, and:

```
nominal eye  = (0, 0, dist)              // what fitCamera already sets
tracked eye  = (0, 0, dist) + (hx*gain, hy*gain, hz*gain)
projection   = off-axis frustum from `tracked eye` through the stashed rect
```

At head-center the offsets are zero and the frustum is **exactly** the symmetric one `fitCamera` produces today. That is the acceptance test for this section: with tracking on and the viewer centered, the render must be pixel-identical to tracking off.

**Set the matrix by hand, do not call a helper.** `Matrix4.makePerspective`'s signature has changed across three releases (a `coordinateSystem` argument arrived in the r150s). The repo is pinned to `three@0.160.0` today but the importmap is one edit from moving. Write the sixteen floats into `camera.projectionMatrix` directly and then `camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()`. Version-proof, and it is twelve lines.

Recompute per frame while tracking; restore `fitCamera`'s symmetric matrix the moment it stops.

### The smoothing, which is where this is won or lost

Y3Dos does `smoothedHead.lerp(target, 1 - Math.pow(0.02, delta))`. An exponential smoother has one setting, and it is the wrong one in both directions: heavy enough to kill jitter when you hold still, it lags visibly when you move; light enough to keep up, it shivers.

**Use a one-euro filter.** It is about thirty lines and it is specifically the answer to this: a low-pass whose cutoff rises with measured speed, so it is still when you are still and immediate when you move. Two tunable constants (`minCutoff`, `beta`).

Then **predict one frame forward** with the filtered velocity. End-to-end latency here is real — camera exposure + 30 Hz sampling + ~8 ms inference + display — call it 60–100 ms, and 100 ms of lag on a parallax effect is exactly the "swimmy" feeling. A single frame of extrapolation buys back a meaningful chunk of it for free.

### The honest limits — say these out loud in the UI

- **Monocular depth is a scale estimate, not a measurement.** The transformation matrix assumes a canonical head. A smaller head reads as farther away, consistently. For parallax this does not matter at all; for anything claiming to know where you are, it does.
- **We do not know the physical size of the screen.** There is no web API that reliably gives it. So the mapping from "head moved 10 cm" to "eye moved N world units" is a fudge factor. **Ship one slider — depth, a gain, default tuned by eye on Colin's machine** — and do not pretend it is calibration.
- **One viewer.** `numFaces: 1`. Two faces is not a better effect, it is a fight over the camera. If two are detected, hold the larger (nearer) one and stick to it with hysteresis so it does not flip every second.
- **The DOM does not move, and should not.** The rails, the chat bar, the history text, the mercury canvases are flat HTML on glass. Only the WebGL room parallaxes. This is not a limitation to apologise for — **it is the correct reading of the metaphor.** The chrome is the window frame; the room is behind it. Do not let anyone "fix" this by transforming the rails.
- **Reduced motion.** `prefers-reduced-motion: reduce` is honored all over this codebase (`motion.js:17`, `mercury.js:25`, `main.js:304`). Head-coupled parallax is a vestibular trigger for some people. Reduced motion must cap the gain hard or zero it — and the toggle should still be reachable, because someone may want it anyway.
- **Face lost.** When the face leaves the frame, do not snap. Ease the eye back to nominal over ~400 ms and hold there. A snap on every glance away is the single most irritating failure mode this feature has.

---

## 4. The hand

### What is actually good, and what is actually bad

**Good — and this is not a small thing:** *the orb.* Reach out, turn your hand, the orb turns. Continuous, forgiving, no precision required, no dwell, no gesture vocabulary to learn, and it lands on an API that already has inertia and idle-resume built in. Let go and it keeps spinning and settles. This one gesture is worth more than the rest of the feature combined, and it is roughly a day of work.

**Good:** coarse discrete gestures — an open palm push to dismiss a panel, a swipe to collapse the rails, a two-hand spread. Big targets, big motions, generous thresholds.

**Bad, and no amount of engineering fixes it:** *a free-air finger cursor clicking the rail glyphs.* Landmark jitter at arm's length is several pixels; the rail's clickable boxes are ~44 px; there is no haptic feedback, no surface to rest against, and an unsupported arm fatigues in under a minute (this is a named ergonomic problem — gorilla arm — not a tuning issue). Fitts's law with a noisy, tiring, feedback-free pointer is simply a bad interaction. **Building it well is not possible. Building it differently is.**

### The design that works: a hand is not a mouse

**Magnetic targeting.** The hand does not aim at pixels; it aims at *things*. Maintain a list of reach targets (the rail glyphs, the logo, the chat controls, the orb), project the fingertip to screen space, and **snap the cursor to the nearest target within a generous radius**, with hysteresis so it does not flicker between two neighbours. The precision comes from the app, not from the arm. A cursor that leaps decisively onto a glyph feels *confident*; one that hovers 6 px off the edge feels broken. Same tracking, opposite experience.

**Then commit with a pinch.** Thumb-to-index, normalised against an in-hand reference span so it works at any distance. Pinch is crisper and faster than dwell, and it has a natural down/up that maps exactly onto `pointerdown`/`pointerup` — which means **pinch-and-drag works for free**: on the orb it is a spin with fling; on a window bar it is a drag; on a slider it is a scrub.

Keep **dwell (~400 ms with a visible fill ring) as the fallback** for when the pinch cannot be seen — hand edge-on to the camera, poor light. Both routes end in the same `reach.up()`.

**Show the cursor and show the state.** A hand-driven cursor with no rendering is a poltergeist. It needs its own mark — mercury, obviously — that shows where it is, what it has snapped to, and how far through a dwell it is. The existing button hover/press visuals then do the rest, because reach drives real pointer events.

### Traps specific to hands

- **Handedness flips.** MediaPipe's `handedness` assumes a mirrored selfie view. Get the mirroring right once, at the boundary, and never again — and note that the `#cam` preview is displayed mirrored, so the video frame and what the user sees are not the same orientation.
- **Both hands is a scope decision, not a freebie.** Two hands doubles inference cost and opens a design question (which one owns the cursor?). Ship **one hand — the one that entered the frame first, held with hysteresis.** Two-hand gestures are a later arc.
- **The dead zone.** A hand resting in the user's lap, or gesturing while they talk, must not drive the UI. Require the hand to be raised and roughly palm-forward before reach engages, and drop out after ~1 s of no confident detection — via `reach.cancel()`, never by simply going quiet (§2c, trap 1).
- **The user-activation wall** (§2c, trap 3). The mic button is the concrete casualty.

---

## 5. The remote

### The channel

Do not invent one. Clone the shape that is already in production.

```
GET  /api/remote/:code/events   → SSE, same headers as server.mjs:2431
                                   ('x-accel-buffering: no' is load-bearing on Render)
POST /api/remote/:code/send     → the phone's control channel
```

`streams.mjs` is 232 lines and is exactly this pattern with a different noun; read it before writing `remote.mjs`, and copy its viewer bookkeeping and heartbeat discipline. On the client, `social.js:1149-1230` is the `EventSource` consumer to copy from — **including its sequence-number dedupe**, because `EventSource` reconnects on its own and will replay.

**Why SSE and not WebSocket:** the server already speaks it, Render already proxies it correctly, it reconnects by itself, and the traffic is overwhelmingly phone→desktop, which is the POST direction. A WebSocket would be marginally lower-latency and materially more infrastructure. Not worth it. (WebRTC DataChannel would be lower-latency still and is the *right* answer if this ever needs sub-30 ms — but it needs signalling, STUN, and a fallback path anyway. Revisit only if measurement demands it.)

**Do not stream 60 Hz orientation over POST.** A round trip is 30–80 ms on a good connection and HTTP/1.1 caps in-flight requests. Instead: **the phone batches at 20–30 Hz and sends deltas; the desktop integrates and smooths.** Deltas degrade gracefully — a dropped packet costs a small amount of rotation, not a snap to a stale absolute pose. Coalesce anything pending into one POST rather than queueing.

### The pairing, which is the only real security surface here

Everything else in this build is local to one machine. This one lets a phone drive a stranger's screen if you get it wrong.

- Code from an unambiguous alphabet (no `0/O`, no `1/l`), **6 characters minimum**, generated with `crypto.randomUUID`-grade entropy — not `Math.random`.
- **Expires in 5 minutes**, single-use, and **the desktop must confirm the pairing** before the session opens. A code that auto-pairs on entry is a code that can be brute-forced quietly.
- **Rate-limit the claim endpoint hard**, per-IP and globally. A 6-character code from a 32-character alphabet is ~10⁹ — fine against a human, not fine against an unthrottled loop.
- Either side can end it; ending it must actually close the SSE connection server-side, not just stop listening.
- A QR code on the desktop is worth it (a short code is a typing tax on a phone), but keep the typable code as the fallback.

### The phone side

A dedicated route — `/r/<code>` — not the full app in a frame.

- **The iOS gate:** `DeviceOrientationEvent.requestPermission()` exists only on iOS, must be called **from inside a user gesture**, and requires HTTPS. So the phone page opens with a real button — *point it at the screen* — and that tap does the permission request. Android needs no permission and must not be shown the prompt.
- Ship a **touchpad surface** as well as the gyro, because gyro alone is exhausting and imprecise. The touchpad produces the same deltas and routes through the same reach bus. Gyro for the orb (it is a globe, and tilting a phone to turn a globe is *good*); touchpad for anything that needs a target.
- Calibrate on a gesture: a tap sets the current orientation as center. There is no absolute frame worth trusting here.
- Keep the surface honest about what it can reach — it is a remote for the room, not a second copy of the app.

### The glyph

Colin's spec: a remote-type glyph on the top or bottom nav bar, **mobile only**, and the top/bottom bars are where things go as the rails fill up. Both bars exist and are empty (`index.html`, `#home-nav-top` / `#home-nav-bottom`).

Two hard rules from `mercury-mount.js`:

1. **Append the plan entry to the end of `plans[]` (`:309`). Never insert it.** The per-glyph texture seed is `(i + 1) * 7.31` off the array index (`:377`), so an insertion re-textures every glyph after it. The array's order sets *nothing but the seed*; DOM order sets position on the rail. There is already a comment saying exactly this above the last entry — it is there because it was learned the hard way.
2. **It must be a real mount, not just an SVG.** `.mercury` hides its own source SVG on the assumption a canvas took over, so an unmounted glyph renders at 0×0 and is simply *not there*. A malformed `svgEl` in the plan drops the entire app to the SVG fallback — check for `body.merc-sdf` when verifying.

Mobile-gate it with the same expression the rest of the codebase uses (`matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches` — `body.js:34`, `environments.js:39`, `mercury-buttons.js:50`, `portal.js:84`). Do not invent a new mobile test.

Also: **the remote is useless on a phone with no desktop paired.** The glyph should say so when tapped rather than opening an empty remote — the phone is the *controller*, and the thing it controls has to already be sitting there.

---

## 6. The presence knows (the part nobody asked for)

SENSES.md establishes the project's actual move: a compact **symbolic layer** between the model and the raw data. Not coordinates — *names*. Op-stack shapes, note names, region labels.

Do the same here, and these three features stop being a tech demo.

The presence does not get head coordinates. It gets, on a beat it was already paying for, a short line: *someone leaned in close* · *they moved back* · *a hand is reaching toward you* · *they are driving from across the room*. Fifteen tokens, in the `<<...>>` channel that `src/tags.mjs` already parses (the `*_HINT` constants in `server.mjs:330-424` are the pattern to follow), rate-limited so it reports **changes and not state** — a percept that fires every beat is noise the model learns to ignore.

The cost model is the one SENSES.md already worked out: a percept line is cheap; the thing to watch is that it suppresses `restful` and pulls a whole extra beat forward. Gate it accordingly.

**This is the difference between a room that reacts to you and a presence that noticed you.** It is maybe fifty lines.

---

## 7. The traps, collected

Encoded knowledge from this codebase. Every one of these has cost someone a session.

**Adding any new view** touches **four hand-maintained lists**: the `mode-*` remove list in `social.js`'s `showView`, the `plans[]` array in `mercury-mount.js` (**append only**), the nav wiring in `main.js` (~line 580 — unguarded `addEventListener`, so a missing element throws at boot), and `forget()` behind `/api/me/delete`. Miss one and the failure is silent and weird.

**The rail's real limit is the canvas, not the button.** A glyph's canvas is `size * 1.7`. Overlap at 1280×800 was fixed by 88→80 and S(77)→S(70). A phone at 375×812 has ~83 px of clear air. Check the canvas footprint, not the visual.

**`.sec` is dead CSS. `.btn` is purple outside settings** — use `.login-alt`.

**Never re-parent a `.mind-win`** or the reader iframe. They are ringed once at boot and reaped forever after.

**Text fields get frosted glass and a mounted unimat ring, never a CSS border.** Standing rule, applies to anything new the remote or the hand introduces.

**A hidden browser pane freezes the animation clock.** rAF ticks zero *and CSS transitions never advance*, so `getComputedStyle` returns the starting value forever and reads mid-transition lie. Check `document.visibilityState` before believing any timing measurement. This one has bitten twice — and it will bite again here, because the obvious way to test perception is to leave the pane hidden while watching logs.

**Client errors report to `/api/hull/report`.** New subsystems should report through it, and the hull should be read at the start of a session, not the end.

**y3k is BYOK-only.** No site key. Nothing in this build should assume a server-side model call is free or available.

---

## 8. Build order

Each stage is independently shippable and independently valuable. Do not start the next one until the current one is actually good.

1. **`src/perceive.js` + the eye gate.** MediaPipe loaded, one face landmarked, numbers on screen behind a debug flag, teardown verified — camera off really means models closed. *Nothing visible changes yet.* Prove the perception before spending it.
2. **The window.** Off-axis frustum in `body.js`, one-euro filter, the gain slider, reduced-motion cap, graceful face-loss. **Ship it here.** This is the feature that justifies the whole build, and it is the one Colin described first.
3. **`src/reach.js`, driven by the phone.** The remote is the better first consumer of the pointer bus than the hand is: its input is clean, so any bug is in the bus rather than the tracking. `remote.mjs`, the `/r/<code>` page, the pairing flow, the glyph. **Ship it.**
4. **The hand, orb only.** One hand, spin the orb, magnetic nothing — just the continuous gesture. This is the day that feels like magic.
5. **The hand, targets.** Magnetic targeting, pinch-to-click, dwell fallback, the cursor's own mercury mark.
6. **The percept line.**

---

## 9. Acceptance criteria

Not "it works" — these.

**The window**
- Tracking on, viewer centered → render is **pixel-identical** to tracking off. (Regression test, not a vibe.)
- Lean 20 cm left: near wall and far wall separate visibly and *correctly* — the room stays bolted down, nothing swings.
- Hold perfectly still for 30 s → zero visible drift or shiver.
- Move head fast, side to side → no overshoot, no rubber-banding.
- Cover the camera → eases home over ~400 ms, no snap.
- `prefers-reduced-motion: reduce` → capped or off, and the setting still reachable.
- Camera off → models closed, GPU freed, frame budget back to baseline (measured, not assumed).

**The hand**
- Orb spin with the hand is *pleasant* — the honest test is whether you keep doing it after the novelty.
- Hand leaves frame mid-drag → the orb does not stick. (Directly tests §2c trap 1.)
- Cursor snaps decisively to a glyph, and does not flicker between two adjacent ones.
- Every hover/press visual on a mercury button looks the same under a hand as under a mouse.
- A control that cannot work under synthetic activation (the mic) either is not targetable or says why.

**The remote**
- Pair in under 15 seconds from picking up the phone.
- Tilting the phone spins the orb with no perceptible stutter on a normal connection.
- Kill the phone's network for 5 s → the desktop does not freeze, and it recovers without a reload.
- A wrong code is refused, rate-limited, and says nothing about whether the code exists.
- The desktop can end the session and the phone finds out.
- On desktop the glyph does not exist. On mobile with nothing paired, it explains itself.

---

## 10. What is verified, and what is not

**Verified live on 2026-09-19** — do not re-litigate these: every `file:line` in this document was read in the working tree; the MediaPipe package version, license, dependency count, CDN paths, WASM and model file sizes, and the full option/result API surface in §2b were fetched from the npm registry, jsDelivr and `storage.googleapis.com` and checked against `vision.d.ts`.

**Still unverified — these are predictions with tests attached:**

- **The main-thread frame-budget claim (§2b).** `body.js` runs 24,000 particles through a bloom composer; whether it can also absorb inference is an empirical question with an easy test. Measure before choosing the worker path.
- **GPU delegate availability** across the browsers Colin actually cares about, and what the CPU fallback costs. Detect it; do not assume it.
- **How well the `facialTransformationMatrixes` translation behaves in practice** — noise floor, stability at distance, behaviour at extreme head angles. It is the load-bearing input of §3. If it disappoints, the fallback is interpupillary-distance depth: worse conditioned, still workable, and the rest of the design is unchanged.
- **Latency figures** (60–100 ms end-to-end, 30–80 ms per remote POST) are estimates. Measure before tuning against them.
- **`#home-nav-top` / `#home-nav-bottom` are empty in `index.html`**, but recent commits (`8b90c71 the name, the arrow, the phone bar`, `c58cb25 the phone row really fits now`) touched the phone bar, so check whether they are populated at runtime before claiming the space.
