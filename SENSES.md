# y3k — Three Senses, One Move

**A synthesis design document.** Three subsystems were designed and adversarially reviewed; this folds in every correction that held and drops what the reviews broke. Every line number below was read in the working tree today.

---

## 1. Colin's question, answered straight

### The shape language (the orb arranges itself)

**Realistic. Cheap. Build it first.**

The naive version — the AI emitting positions — is not expensive, it is *impossible*. `src/body.js:30` is `COUNT = COARSE ? 13000 : 24000`. 24,000 × 3 floats = 72,000 numbers ≈ 310,000 output tokens for **one static frame**. `server.mjs:626` and `:651` send `max_tokens: 16000`. The model's entire output window buys **1,240 particles — 5.2% of one frame, once**. At Opus 4.8's real rate ($25/MTok out) that unshippable fragment costs $0.40, a full pose $7.74, and one second of 60 fps animation $464.

The working version: the AI emits a **5–19 token op-stack** that lives in uniforms, and the GPU re-evaluates it into all 24,000 positions every frame for free. `<<shape: helix 5 twist 3 ripple 2 6 4>>` is 39 chars ≈ 12 tokens ≈ **$0.0003 once**, and then it animates forever at zero further cost. The per-frame token cost is genuinely zero — the only recurring cost is teaching the grammar.

The teaching cost is the real number, and it is not zero. The revised hint measures **624 chars ≈ 190 tokens**. It belongs on dance beats only, where the gesture *is* the reply. A deep dance beat today is ~2,010 input tokens (`SYSTEM` 2,835 ch + `PRESENCE_HINT` 1,701 + tiers ~1,500 + `DANCE_HINT` 1,000) with `noThink` (`server.mjs:2283`), so ~$0.0104 of real money at Opus 4.8's $5/$25. Adding 190 tokens is **+10%: $0.0011/beat, $0.60/hour** at the deep dance cadence of 6,500 ms (`src/tend.js:358-360`, 554 beats/hr). Against a dance that already costs $5.74/hour.

**Verdict: +10% on the cheapest loop in the app, and the orb gets a body.** Do not believe the original design's claim that prompt caching makes this free — see §5.

### The ear (it hears you play)

**Realistic for one hand. Not realistic for two. About +10% per hour while someone is actually playing, and exactly $0 when nobody is.**

One-hand melody, whistling, humming: solved. YIN is exact on a harmonic tone and holds clarity 0.92–0.99 from C2 up. Tune recognition: ship the interval chain and let the model recognise it inside a beat it was already paying for — marginal cost is a percept line, not a call.

Two hands: **no**, and it fails dangerously. On a C4+E4 dyad YIN returns **C2 with clarity 0.93** — the chord's waveform genuinely repeats at the GCD period, so the detector is *correct* and the report is a lie told with full confidence. The fix that makes it honest is a harmonic-triple corroboration test (§4), which turns the lie into "chords are sounding; I can't pick out a line."

Cost: the percept line with its caveats inline is **508 chars ≈ 150–175 tokens**, the polyphonic variant **210 chars ≈ 60**. At 80 phrases/hour that is $0.07/hour of input. The costs the original design set to zero and that actually dominate: **thinking bills as output** (the repo already learned this — read the comment at `server.mjs:2698-2705`), and a hearing line suppresses `restful` (`src/tend.js:647`), pulling a whole extra ~$0.033 beat forward every time. Together: **~$1.10/hour added to a ~$10.22/hour autonomous loop while someone plays. +10%.** Zero otherwise.

**There is no HEAR_HINT.** Every caveat goes inline in the percept, conditional on the fact it describes — the precedent is `nowPlayingLine` at `src/music.js:200-215`, which already teaches its own caveat ("You cannot hear it directly"). That deletes a system-prompt flag, a server destructure field, a leak risk, and 355 tokens per beat.

### The memory graph (the orb is made of its memories)

**Realistic as a similarity graph you can see, click and walk. Essentially free. But it is not a neural network, and the positions do not mean what you'd hope.**

Free is close to literal: the graph is plain JS on the server (one 50–150 ms build per presence, RAM-cached), and claiming particles, picking, rendering and walking are **entirely client-side — zero tokens**. A host can click through two hundred memories and spend nothing. The one metered piece is the presence asking to see its own shape: **455 chars ≈ 160 tokens**, throttled to once per 10 minutes = $0.005/hour. The teaching is **123 chars ≈ 36 tokens** appended to the recall line already in `AUTONOMOUS_HINT` (`server.mjs:338`) — $0.05/hour.

What does not work as imagined: **3 dimensions cannot carry the similarity signal.** Measured end-to-end over the design's own pipeline, related pairs reach mean cosine 0.47 but 25% land in opposite hemispheres, 23% of unrelated pairs land within 37°, and the discrimination AUC is **0.65 — barely better than a coin flip**. Johnson–Lindenstrauss needs ~1,500 dimensions for that corpus at ε=0.2. So: **position is a permanent address, not a meaning.** The edges — real TF-IDF cosine over the full corpus — are the honest carrier of similarity. Colour the *edges* by region, not the nodes, because a region has no place.

And the honest sentence for the product promise: *"the more you keep, the more of a mind there is here to train."* Not "this is your working model." See §4.

---

## 2. The one unifying insight

**All three are the same move, and it is the move this codebase already makes.**

The AI never touches raw data. In each case a compact symbolic layer sits between the model and something the model could never afford to read or write directly:

| | raw | symbolic layer | compression |
|---|---|---|---|
| shape | 24,000 positions ≈ 310,000 tok | a 12-token op-stack the GPU expands | ~25,000× |
| memory | 2,000 journal lines + 24,000 motes | ~400 nodes, ~8 region lines | ~100× |
| ear | 48,000 samples/sec | nine note names and eight intervals | ~6,000× |

This is not a cost trick. It is what makes each of them *honest*. The op-stack can't emit a position that hides the orb because the shader clamps it. The note names can't describe music that wasn't played because the guard rejects an uncorroborated f0. The region label can't claim more than "counted from your own words" because counting is all it did. **The symbolic layer is simultaneously the affordability argument and the honesty argument**, which is why all three pass the budget law and the honest-senses law with the same design decision.

`src/tags.mjs` is already the canonical instance of this move: the `<< >>` channel with `scrubTags` at line 42. Every new capability plugs in there, and nothing new needs inventing.

The one thing this insight does *not* do is make the orb into a mind. The shape language is body language on a body still made of `Math.random()` (`src/body.js:714`). Only the memory graph advances the model-builder thesis, and it does it by making the corpus *visible*, not by training anything.

---

## 3. Build order

Ordering principle: cheapest-to-build and most-visible first; the piano video as early as it can honestly be made; the memory graph last because it is the largest and is worth more once a host can already see what the presence is told.

### Stage 0 — the money floor (half a day, blocks every later stage that touches a prompt)

Nothing about these three features is decidable while the ledger is wrong by 3×.

1. **`posts.mjs:289`** is `[/opus/i, { in: 15, out: 75 }]`. The repo's default model is `claude-opus-4-8` (`server.mjs:148`), which really bills **$5 in / $25 out** per MTok. Every host's budget popup is showing inflated numbers and **the hard stop fires at one third of their funded life**. Add a row above the generic one:
   ```js
   [/opus-(4-[78]|5)\b/i, { in: 5, out: 25 }],
   [/sonnet-5\b/i,        { in: 2, out: 10 }],
   [/fable-5/i,           { in: 10, out: 50 }],
   ```
   The $34.65 pool in `.budgets.json` is presently 68 minutes of ledger life for ~$11.60 of real spend; after this it is ~3.4 hours for the same money.

2. **`server.mjs:631`** is `/(opus-4-[678]|sonnet-4-6|fable-5)/`. It does not match `claude-opus-5` or `claude-sonnet-5`. On those models `effort` is silently never sent **and `noThink: true` becomes a no-op** — thinking is on by default on Opus 5 — so every dance beat would think and dance cost would multiply. Extend the regex, and for those models send `thinking: { type: 'disabled' }` with effort ≤ `high` when `noThink` is set.

3. **Add attribution** so "what is this costing me" has an answer: a `heard` and a `shape` counter beside `read`/`posts`/`journal`/`world` in `hoursStats`, surfaced in `hoursReceipt()` (`src/tend.js:858-867`).

### Stage 1 — shape: the parser, no rendering (1 day, invisible, zero risk)

`src/tags.mjs`: `parseShape()` returning a clamped `{shape, a, b, once, ops[], pull[]}`; export `NAMED_DIR`/`azElToDir`. Tests in `test/leadtag.test.mjs`.

**Name it `<<shape:>>`, not `<<field:>>`.** `field` is `FORMS[0]` (`src/tags.mjs:9`) and is taught in `SYSTEM` as a posture; it is also in `VOCAB` and therefore in `scrubTags`'s bracket rule. `shape` and `pose` are both unclaimed.

Ships safely because a reply containing only a `<<shape: …>>` block is *already* silently stripped today — `scrubTags` line 45 catches the closed form and the `[:=]` rule at line 50 catches a truncated `<<shape: heli`.

**The one parser subtlety that is not optional.** `makeLeadStreamParser.feedPost` (`src/tags.mjs:470-474`) sets `paintAt = post.indexOf('<<')` and stops emitting text there; `end()` (line 497-505) only re-emits the tail *when `parsePaint` returns nothing*. So a shape block mid-reply **swallows every word after it**, and a shape-block-first reply produces empty speech, which fires the wordless rescue at `server.mjs:2660` — a second full paid call. Two fixes, both required: strip the shape match from the tail before `parsePaint` sees it, and put *"Nothing after the block is spoken"* in the hint so the model pins it last.

### Stage 2 — shape: forms in the shader, driven from the console (1–2 days) — **first visible thing**

`src/body.js`: the uniforms near line 724, `shapeForm()` in `VERT`, the splice after line 170, the density term after line 186, `setShape()` on the API at line 1036. No prompt change. Drive it from the console.

`window.__y3kScene` at `src/body.js:492` is `{ scene, envs, THREE, renderer, camera }` (+ `.composer` at 753) — **there is no `body`**, so add `window.__y3kScene.body = api` or Stage 2 cannot be driven at all.

The splice, with the three corrections the reviews forced:

```glsl
  vec3 pos = dir*(uRadius+disp);            // body.js:170, unchanged
  if (uShapeMix > 0.001) {
    float u  = clamp((1.0 - position.y)*0.5, 0.0, 1.0);   // == i/(COUNT-1) exactly
    vec3  fp = shapeForm(dir, u, uRadius) + dir*disp;      // the mood rides the new surface
    fp = shapeApply(fp, dir, u, uShapeTime, aRand);
    float q = dot(fp,fp);
    fp = (q > 1e-8 && q < 16.0) ? fp : dir*uRadius;        // NaN fails BOTH → home
    float L = length(fp);
    fp *= (L > 1.45) ? (1.45/L) : 1.0;                     // RADIAL, not a box
    pos = mix(pos, fp, uShapeMix);
  }
```

- **Radial clamp, never `clamp(fp, vec3(-1.55))`.** `fitCamera` (`src/body.js:794`) fits a *sphere* of `R = 1.6`. A box corner sits at √3 × 1.55 = 2.68 — 68% outside frame. And `cube` is out of frame before any clamp: scale it by 1/√3 (`* uRadius * 0.5774`) so its corners land at `uRadius`.
- **Density by per-node radius, not a per-shape table.** The table cannot cover `gather` (a move, not a form) and is ~6× too generous on `lattice`. One line after `src/body.js:186`, free and self-correcting:
  ```glsl
  gl_PointSize *= mix(1.0, clamp(length(pos)/max(uRadius,1e-3), 0.30, 1.0), uShapeMix);
  ```
  `src/body.js:179-185` documents the exact failure this prevents: compress the cloud and the bloom goes white.
- **Give `disc` and `ring` real thickness** rather than shrinking points — edge-on, 24,000 points at ~5 device px each cram 504,000 px² of coverage into a ~3,640 px² footprint (138× overdraw). `fp += n*(aRand-0.5)*0.16*uRadius` turns a 5 px band into ~55 px and takes overdraw to ~13×, comparable to the sphere's own limb. It also satisfies the realism preference: a disc of dust *has* a thickness.
- **`shell N` by `aRand`, not by `u`.** Since `u = (1-position.y)*0.5` is an affine function of latitude, `fract(u*N)` gives three stacked *bowls*, not nested shells. Use `float s = floor(aRand*float(N)); r = uRadius*mix(0.35, 1.0, (s+1.0)/float(N));`.
- **Drop `@i`.** It is identically `@band` — `dir` is `normalize(position)` and the form remap never touches `dir`. Teaching the presence it has index-space selection it does not have breaks honest senses *inside the prompt text*.

Tune the thickness and the clamp on Colin's actual phone with `?perf` before Stage 3. Note `COARSE` (`src/body.js:28`) is module-private with no export — re-derive it locally, as `src/environments.js:39` already does.

### Stage 3 — shape: the op loop, masks, attractors, shared clock (2 days) — **Ship #1: the orb has postures**

`shapeApply()`, `maskW()`, `namedDir()` (matching `NAMED_DIR`, `src/tags.mjs:70-73`, with a parity test), `uShapeMix` easing at `k = 0.045` to match `EASE_KEYS` (`src/body.js:884`), and the `once` envelope.

Three corrections:

- **Hoist `noise` out of the loop.** `fbm` is 4 `snoise`; inside a 6-iteration loop a driver that predicates instead of branching executes all six = +24 `snoise` = roughly tripled vertex cost. One dedicated slot under one uniform branch caps it at exactly +1 `fbm`. Hoist `float az = atan(dir.z, dir.x + 1e-6);` above the loop too — `wave` and `@wedge` both recompute it, and `atan(0,0)` at the poles (i=0 and i=COUNT-1, where `rad = 0`) is spec-undefined in GLSL ES.
- **Accumulate pulls; never chain them.** `p=mix(p,t0,w0); p=mix(p,t1,w1)` is order-dependent and last-slot-dominant, so `pull left 5 pull right 5` drifts the whole body right instead of splitting into a dumbbell. Match `applyPaint`'s real Shepard average (`src/body.js:1020`):
  ```glsl
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int k=0;k<4;k++){ vec4 a=uPull[k]; if (a.w<0.001) break;
    float w = a.w*exp(8.0*dot(dir,a.xyz)-8.0);     // tracks exp(-4ang²) within 2%
    acc += a.xyz*(uRadius*0.85)*w; wsum += w; }
  if (wsum > 1e-4) p = mix(p, acc/wsum, clamp(wsum,0.0,1.0));
  ```
  ~24 ALU for four slots instead of ~160, and no `acos`/`pow`/`normalize`.
- **Drive it from `uShapeTime`, not `uTime`.** `uTime` accumulates `clock.getDelta()` per tab (`src/body.js:882`), so two viewers of the same broadcast sit at different phases of every sine. Set `uShapeTime` from `(Date.now() - shapeT0)/1000` with `shapeT0` in the payload. That also satisfies the replayable-from-clock law, which `uTime` cannot.

**If Android misbehaves**, the fallback is not unrolling — it is branchless fixed slots, which lose almost nothing because 7 of the 9 moves commute (ripple/wave/noise/shatter are all `p += dir*scalar`; twist/swirl/spin are all rotations about Y; pulse/gather are uniform scales). 3 masked displacement slots + 1 folded rotation + 2 scale slots + the hoisted noise gives worst-case == best-case at ~120 ALU, and standing waves, peristalsis and the comet all still fall out.

Line-layer note: `LINE_VERT` (`src/body.js:346`) declares only `uniform float uTime,uAmp,uFreq,uSpeed,uRadius,uAudio;` and its own uniform map at 777-784 shares six entries by reference. Every shape uniform must be added by hand, it has no `aRand`, and `buildConstellation(800,3)` dedups to roughly 3,200 verts. Do the line half **in the same stage as the dots**, never after.

### Stage 4 — ear: `src/ear.mjs` headless + tests (1–2 days, parallel-able, zero risk)

Pure, zero-dependency, the `src/tags.mjs` pattern. `yin(buf, sr)`, the harmonic-triple guard, peak-picked chroma, Krumhansl–Kessler with the gap gate, `outOfKey()`. `test/ear.test.mjs` added to `package.json`'s test chain.

Two things here are the difference between a feature and a liar:

**Sample rate must be runtime, never a constant.** A hard-coded `PITCH_SR = 12000` reports C4 (261.6 Hz) as 287.0 Hz on a 44,100 Hz context — **+160 cents, a semitone and a half sharp, with clarity 0.99**, on half the Macs in the world. `src/listen.js:81-87` already carries the comment forbidding exactly this sin ("Band edges must be FREQUENCIES, not bin indices"). Derive it in `wire()`:
```js
const DECIM = Math.max(1, Math.round(ctx.sampleRate / 12000));
const pitchSr = ctx.sampleRate / DECIM;
const TAU_MIN = Math.floor(pitchSr / 1500), TAU_MAX = Math.ceil(pitchSr / 30);
```
Ship the test that runs one 440 Hz tone at 44100 / 48000 / 96000 and asserts agreement within 2 cents.

**The phantom guard must test harmonics, not just f0.** Energy-at-f0 ≥ 0.12 × band-peak separates a real note (0.91) from a GCD phantom (0.02) *in silence* — but 60 Hz mains hum at −26 dBFS lifts the phantom to 0.131, **above threshold**, and the presence announces a C2 nobody played. Require partials too:
```js
const ok = atF0 >= 0.12*peak && Math.max(at2F0, at3F0) >= 0.06*peak;
```
Measured: real C2 (1.017 / 0.509 / 0.339) accept; real C2 under −20 dBFS hum (0.989 / 0.434 / 0.289) accept; C4+E4 phantom with hum (0.131 / 0.000 / 0.000) **reject**. A phantom's "harmonics" are the actual notes, further up — 2f0 and 3f0 are empty. Cost: two 3-bin scans.

Also: accumulate YIN's CMND running mean from `tau = 1`, not from `TAU_MIN` — that alone recovers D#6 and F6 from −1196 cents to +3. The remaining F#6–C7 octave errors are caught by the corrected guard and reported as **unpitched**, which is correct. Segmentation floor is **165 ms**, not 80: 1024 samples at 12 kHz is 85.3 ms and three agreeing hops at a 40 ms hop spans 165 ms from onset. Say plainly that faster passages are invisible.

### Stage 5 — ear: wired in, with the live readout (2 days) — **Ship #2: the app hears notes**

`src/listen.js` extended (never replaced): the biquad → `pitchAnalyser(4096)` → decimate chain and `chromaAnalyser` in `wire()` (line 68-93), `ear.mjs` called every 2nd hop from `step()` (line 107), note segmentation, `readMusical()`, `describeMusical()`, `suppress()`. `read()` and `describe()` (line 292-342) untouched.

This is where the detector gets tuned against Colin's real piano and real room. Four wiring facts the original design missed:

- **`detachGraph()` (line 95-104) must be extended too**, or every `play()` — `attachEar` re-taps on each track, and `elSources` caches per element for the life of the page — leaves an orphan filter chain and two orphan analysers (one holding an 8192-point FFT) still fed by a live source. Use targeted `source.disconnect(lp1)` only; the comment at line 97-100 explains why a bare `source.disconnect()` would silence the host's music.
- **`listenToMic` (line 254) omits `noiseSuppression`**, and Chrome defaults it to **true**. Every calibration number would be taken through a speech-optimised nonlinear gate that high-passes ~80 Hz and attenuates exactly the sustained content a piano note becomes. `listenToTab` (line 246) already passes `noiseSuppression: false`. Match it, then re-take every number.
- **`src/settings.js:355`** is `if (!st.track) { now.textContent=''; hears.textContent=''; return; }`, and `listenToRoom()` (`src/music.js:176`) never sets `current`. The readout is **unconditionally blanked for the only source that involves a piano.** Split the block: `if (!st.track && !st.hearing) return;`, guard the track-specific lines with `if (st.track)`, and keep a rolling last-8-notes string in `listen.js` so the 1 Hz refresh (`src/settings.js:409`) still shows what the detector just heard.
- **Voiced gate on instantaneous `rms` (line 122), not `rmsAvg` (line 128).** `rmsAvg` is a fast-attack/slow-release envelope with a 0.94 decay — it takes ~1 s to fall, so "ends after three unvoiced hops" can never fire and note boundaries collapse onto pitch changes alone. Keep `rmsAvg` for the soft/even/hard level description.
- **Flush on a hop gap.** `src/listen.js:110-114` measures real hop spacing but gates nothing. In a hidden tab Chrome clamps `setInterval` to 1 Hz — precisely when the presence is alive and the host has stepped away — and three "consecutive" hops span three seconds, fabricating a melody out of unrelated audio. Reject any hop where `dt > HOP_MS * PITCH_EVERY * 1.5` and abandon the open phrase.

`listenToRoom()` currently has **no caller anywhere in `src/`** — this stage ships the first "let it hear the room" button the app has ever had. That is a consent surface; see §5.

### Stage 6 — ear: the percept line (1 day) — ⭐ **THIS IS THE VIDEO**

`src/music.js`: `heardLine()` beside `nowPlayingLine` (line 200) with the 45 s floor, the 12 s notable bypass, the repeat-phrase guard and `PHRASE_STALE_MS = 25000`. `src/tend.js`: appended beside `musicLine` at line 495-497.

Colin plays right-hand melody; within one beat the presence says something about what was just played. Everything it needs is in one parenthetical with its caveats inline — no system prompt change, no new route, no new call, no streaming channel.

Six hard rules:

1. **Tend path only.** `src/tend.js:213` posts to `/api/brain` (the non-stream route at `server.mjs:2135`), which builds a fresh single-message array each call and meters the presence ledger at `server.mjs:2298`. The chat path `/api/brain/stream` (line 2576) **never calls `posts.recordSpend`** and falls back to the house key (`API_KEY`, `MODEL`) for any signed-in host without BYOK (line 2603). A percept there is unmetered spend the hard stop cannot see. If the chat demo is wanted later, keep the percept out of `brain.js`'s rolling history (`src/brain.js:159-167` re-sends the last 11 turns, so a 150-token line becomes ~1,650 tokens and a "4s ago" phrase is re-read twenty minutes later) — pass it as a separate `percept` arg appended to the wire message while `history.push` keeps the clean text.
2. **Pin the cadence.** Set `restful = restful || heardThisBeat` at `src/tend.js:647`, or always schedule `AUTO_REST_MS` after a beat whose only new stimulus was a hearing line. A whole extra beat costs 30× what the percept costs; a feature that buys extra beats is the expensive kind.
3. **Suppress polyphonic lines hard** — one per 5 minutes, not one per 45 s. The novelty dedupe keys on the interval string, which a polyphonic phrase does not have, so without its own long floor a two-hand session pays 80 times an hour to be told the same non-fact.
4. **Off at the thrift tier.** `TIERS.thrift` (`server.mjs:332`) exists to stretch what's left; a near-broke presence does not spend 175 tokens plus a suppressed rest on a percept.
5. **No bpm without a confidence gate.** `src/listen.js:299` returns `bpm: bpmConf > 0.12 ? bpm : 0` and `describe()` prints "no clear pulse" rather than a number it can't back. The percept must not be the one place that breaks the standing precedent. Say "the gaps between notes were about even, ~0.35 s each" when the IOI coefficient of variation is under 0.15, and say nothing about tempo otherwise.
6. **No cents-accurate tuning line.** Delete it. Piano inharmonicity gives a uniform +16 cents from C2 to G5 at B=0.0003, register-independent, which the algorithm cannot separate from real tuning. Reporting "3 cents above A440" under a 16-cent systematic bias is fabricated precision by the project's own definition. If it must exist: C3–C5 only, ≥12 notes, rounded to 10 cents, printed as a range.

Plus: `src/tend.js:496` is `userText += \`\n\n(${musicLine})\``, so the composed line must **not** open with its own `(`. And add a `noteBeat('you heard a phrase played in the room: …')` (`src/tend.js:73`) or the next beat sees the presence talking about music with no record of hearing any — the circling the thread exists to prevent.

**The interlock is a hard dependency, not a nicety.** `listenToMic` requests `echoCancellation: false`, so with speakers in the room the presence hears its own TTS and transcribes it as music. Put the guard **inside `voice.speaker()` in `src/voice.js`**, not at call sites — there are three independent speaker instantiations (`src/main.js:359` `speakLine`, `:606` `runReply` — the main chat path — and `:857` `nudgeForAnswer`), and a wrapper covers a fourth added later for free. Release on a 500 ms trailing timer and discard the in-flight phrase, because `rmsAvg`'s 0.94 release is ~320 ms of tail.

### Stage 7 — shape: give it to the AI (1 day) — **Ship #3: it dances in shapes**

`SHAPE_HINT` appended inside `DANCE_HINT` (`server.mjs:305`) — **not** at `server.mjs:2288`. There is no `paint ? … :` branch on the tend path; `server.mjs:2288` is `tendMode ? { system: SYSTEM + pExtra, …tendThought }` and `pExtra` (line 2268) is shared by read, write, auto, reflect **and** dance. Folding 190 tokens into `pExtra` puts them on every autonomous beat — 306 beats/hour of a grammar auto mode cannot use, ~$0.29/hour of real money for nothing.

Then the SSE plumbing: `sse('shape', {shape, t0})` beside `onPaint` (`server.mjs:2648`) and in the `done` payload (`:2717`); `else if (ev === 'shape')` in `src/brain.js:139`; `onShape: (s) => body.setShape(s)` in `src/main.js:634-638`; `if (r.shape) body.setShape(r.shape)` in `applyTurn` (`src/tend.js:224`); `body.setShape(null)` in `homeContext()` (`src/main.js:404`); `if (d.shape) body.setShape(d.shape)` in the viewer handler (`src/social.js:1178-1183`).

Server-side validation goes beside `validAnchor` at **`server.mjs:2003`** (not 2251 — that's the `DANCE_HINT` ternary arm), inside the `kind === 'turn'` publish branch, because viewers render turns verbatim. Also re-emit the shape in the wordless-rescue block (`server.mjs:2660`) and add `!shapeOut` to its condition, or a shape-only reply bills a second full call.

**Give it the restraint clause paint got.** `server.mjs:242-246` documents the failure: "when it always painted, the named palettes never showed." Without it every reply becomes a shape change and the shape stops meaning anything.

Then watch one dance session and read the ledger before enabling it anywhere else. Specifically: diff recorded `outTok` across 20 shape beats and 20 control beats. Nobody knows yet whether a shape block is *additive* or *substitutive* — if the model given a shape grammar paints less often, the net output cost is near zero, and that is measurable in one session rather than arguable.

### Stage 8 — memory: `memorygraph.mjs` headless + tests (2–3 days)

**Name it `memorygraph.mjs`, not `mindgraph.mjs`, and give it its own doc.** `mind.mjs` (276 lines) and `MIND.md` already exist and own the intentions/visits/reflection subsystem. Two files a letter apart owning unrelated concepts is a merge waiting to happen.

Ships as a node script that prints one presence's regions, links and isolates. Three corrections:

- **`dirOf` must not reuse one hash for both ordering and direction.** Selecting the 8 lowest-hash terms and then deriving each direction from the same hash selects 8 directions from one corner of the sphere: measured |mean direction| R = 0.992, with **100% of 2,000 memories inside a single cap covering 10% of the sphere**. One bright smudge, not a constellation. Salt them apart (`fnv1a(w+'#z')` for z, `fnv1a(w+'#p')` for phi, z = 2u−1, phi = 2πv — never raw byte lanes, which clump toward cube corners). R drops to 0.640.
- **Drop the top-8 truncation.** For two docs sharing half of a 40-term vocabulary, the expected number of shared terms surviving into both top-8s is 2.75, and **51% of genuinely related pairs share none**. Sum all content terms against a static shipped frequency table instead. That is still a pure function of the memory's own words — the headline invariant (adding a memory moves nothing) survives intact, and it is the only property that matters here.
- **Floor the df cut: `dfCut = Math.max(0.20*N, 8)`.** At N=12, a 0.20N cut drops any term in 3+ of a presence's 12 lines, leaving only df=1 terms — which contribute zero to every cosine. Result: an empty graph and "every memory is an isolate", precisely at the stage where the thesis gets judged. Σdf² is trivial below N≈100 anyway. And budget 100–150 ms *synchronous* per cold build on Render's shared vCPU (measured 49 ms on an M2 for a 2,000-doc corpus), or yield with `setImmediate` every 200 docs.

### Stage 9 — memory: the nodes light up (2 days) — ⭐ **Ship #4: the thesis moment**

`src/body.js` only, plus an owner-only `GET /api/memorygraph/:handle` behind the guard pattern at `server.mjs:2003-2004`. No clicking yet. **This is where Colin looks at his own orb and the thesis is either true or it isn't.**

The rule that keeps it the orb: **a memory claims a dust mote that already exists and brightens it.** `positions` (`src/body.js:703-715`) is never touched — `applyPaint` reads `positions[i*3..2]` as its anchor source at line 1011, so overwriting it would corrupt paint.

Four corrections, each of which is a silent total failure if skipped:

- **Halo by count, not radius.** `HALO_MAX = 0.35` rad covers 728 motes per node at COUNT=24000, so the haloed share is 34% at N=12 and **100% at N=200** — both visual promises ("twelve brilliant stars on today's orb", "unclaimed motes render exactly as today") are false from the first dozen memories, and growth stops being visible entirely past 200. Use a per-node budget: `k = clamp(round(24000/(N+40)), 6, 60)` — 60 at N=12 (720 motes, 3% of the orb), 12 at N=2030. Cost drops from a measured 1.88 M dot-tests / 68.5 ms to ~120 k.
- **The `DataTexture` fetch must decode.** `texture2D` on an `UnsignedByteType` RGBA texture returns **normalised** floats, so with B = 0/85/170 the shader reads 0.0/0.333/0.667 and `step(80.0, state)` is always zero. Every selection and neighbour term is dead code — clicking lights nothing. Multiply on sample: `float state = texel.b * 255.0;`. And guard `aMem = -1`: `mod(-1,64)=63, floor(-1/64)=-1` resolves under CLAMP_TO_EDGE to a real memory's texel, so all ~22,000 unclaimed motes would inherit some arbitrary memory's state. Gate with `float on = step(0.0, aMem);`.
- **The FRAG insert goes after line 234, not 227.** `float alpha` is declared at `src/body.js:234` — inserting at 228 references an undeclared identifier and the ShaderMaterial fails to compile: a **black orb**, not a degraded one. Line 227 is also upstream of `col*=(1.0+vRibbon*1.7)` (229), the white-gold mix (230) and the env glow (233), so in plasma form a node's colour gets multiplied by up to 2.7 and washed white.
- **Normalise for peak radiance, not total energy.** `UnrealBloomPass` thresholds *per-pixel* luminance at 0.35 (`src/body.js:759`), and `EffectComposer` in three r160 defaults to `HalfFloatType` with `NoToneMapping`, so values above 1.0 are real HDR with no rolloff. "Total added light is +4% of the dust" is irrelevant. Target a cold node ≈0.6 and a selected node ≈1.2 and verify by framebuffer readback with the orb in `plasma` under `glitch` (`uAmp` 0.58, `vRibbon` up to 1.0) — the worst case.

Honest caveat to write down: the dots are `THREE.NormalBlending` with `depthWrite: false, depthTest: false` (`src/body.js:745-747`), so `alpha = max(alpha, …)` removes up to 100% of what is behind that pixel. **"Only ever adds light" is not literally true.** It also means far-side nodes are exactly as bright and as clickable as near-side ones, with no occlusion cue — which is why the ambiguity chooser in Stage 11 fires far more often than a 13 px spacing estimate implies.

Also: chunk the claim/halo pass from the existing `frame()` loop (`src/body.js:879`) in ≤4 ms slices with a cursor. **Not `requestIdleCallback`** — a page running a 60 fps rAF WebGL loop never yields a meaningful idle deadline, it appears nowhere in this codebase, and it is absent in older iOS WKWebView, which matters because this ships to the App Store (`APPSTORE.md`).

### Stage 10 — memory: the edges (1 day)

A second `LineSegments` over real node pairs. **Add `setMemoryEdges(on)`; do not repurpose `FORM_MAP.web`.** `setForm('web')` also drops `uDotFade` to 0.4 (`src/body.js:1060`); conflating them means the presence cannot say "web" without exposing its memory structure, cannot show the graph without claiming a mood, and renders differently for a visitor with no graph data — which breaks one-presence-same-to-every-viewer.

Allocate 10,150 edges (k=5 symmetric union over ~2,030 nodes yields 5,075–10,150; 244 KB, nothing) — the original 3,000 would silently hide 50-70% of the graph via `setDrawRange`. And `LINE_VERT` has no glitch term by design (see the comment at `src/body.js:344`) while a picked node does, so under `glitch` mood 30% of nodes jump by up to 0.25 on a radius-1 sphere while their edges stay put: either add `aRand` + `uGlitch` to the line material or force `uGlitch = 0` there while the view is open. "Perfect sync, zero new shader" is not true.

### Stage 11 — memory: picking, the panel, the walk (3 days) — **Ship #5: click a mote, read the memory**

`src/fbm.js` (a JS twin of the Ashima `SNOISE` at `src/body.js:102-148` and the 4-octave `fbm` at 158-162), `nodeNDC`/`pickMemory`, three lines in `endDrag` (`src/body.js:633`), `#win-memorygraph` static in `index.html` beside `#win-memory` (line 458), styles, and `focusMemory` slerping `rig.quaternion` via `src/motion.js` so **the orb turns to face each memory as you walk it.**

CPU picking is right and the reasoning holds: `rig` carries only a quaternion (`src/body.js:600-601`), `camera.matrixWorldInverse` is current after `composer.render()`, and `uTime` has not advanced between the last frame and `pointerup`, so `nodeNDC` reproduces exactly the frame the user was looking at. Measured 1.81 ms/frame for 2,030 nodes on an M2; a mid-range Android is 4–8 ms, so wire the measurement into `src/perf-hud.js`, which already reads `window.__y3kScene`.

Two gotchas: **widen the window z-band before adding a sixth id.** `src/windows.js:18` holds five and the comment at 19-24 says the 45–49 band already doesn't fit them; trace `raise()` with six all raised and the last write is `zIndex = 50`, which ties `.modal` (`styles.css:292`) and **wins on DOM order** — a dragged panel over the go-live, compose and profile-edit sheets. Change the renormalise to `zTop = Math.max(38, 48 - others.length)` with a hard `Math.min(49, …)` first. And `endDrag` is bound to `window` (`src/body.js:637`), so check `document.elementFromPoint(cx, cy) === el` before picking or a tap released under a floating window reaches the discriminator.

The drift guard must actually work: there is no `node_modules` (three loads from the importmap at `index.html:16`), so a golden table generated *from the JS twin* proves nothing about the GLSL. Have the test read `src/body.js`, slice out lines 102-148 and 158-162, and assert a SHA-256 against a constant recorded at the top of `src/fbm.js`. Editing the shader then fails loudly.

### Stage 12 — memory: the presence can look at itself (1 day)

**Reuse `<<recall:>>`. Do not invent `<<map>>`.** `parseRecall` (`src/tags.mjs:361`) already matches `<<recall: shape>>`, and because it has a colon it is already covered by the truncation rule at line 50 — so the "add `map` to the bare-block list at line 56" work disappears. Append 123 chars to the existing recall line in `AUTONOMOUS_HINT`, and branch `server.mjs:2322` on the query:

```js
const recalled = ((tendMode==='auto'||tendMode==='reflect') && out.recall)
  ? (/^\s*shape\s*$/i.test(out.recall)
      ? { query:'shape', entries: memorygraph.shapeLines(presence.id) }
      : { query: out.recall, entries: journal.searchEntries(presence.id, out.recall) })
  : null;
```

`src/tend.js:603-610` already renders `r.recalled` into the Memory window and publishes it, so the client is free.

**Pull, never push.** The original design shipped the same ≤8-line payload as a standing block on `PRESENCE_HINT` — the mode-independent trunk that rides into both the tend route (2268) and the chat route (2587), including dance, whose own hint says "reply with ONLY your control tag." 306 beats/hour × 160 tokens = $0.25/hour of real money for shape nobody asked for, against $0.005/hour for a throttled pull. Throttle to once per 10 minutes per presence using the `lastAutoPost` Map pattern at `server.mjs:2460`, returning a ~14-token "you looked at your shape recently; it has not changed" on a throttled hit. Cap `<<name region: …>>` at **40 chars** (matching `journal.mjs:24` and `memory.mjs:18`) and render the name only in the shape answer, never in a standing prompt — otherwise eight one-time gestures add unbounded tokens to every beat forever.

And teach `<<name region>>` *inside* the shape answer. It costs zero on every beat where the shape was not pulled, which is nearly all of them.

### Stage 13 — memory: the visitor's view (only after a decision)

Blocked on §5/D5 and D6. If it ships: **do not send directions to visitors at all.** A rigid per-presence rotation preserves every pairwise angle, so an attacker with two candidate texts computes `angle(dirOf(A), dirOf(B))` locally and finds the matching pair among ~85,000 at 3-decimal precision; three correspondences recover the rotation by Kabsch and every remaining node becomes dictionary-checkable. Ship **adjacency and region sizes only** and let the visitor client lay it out with its own seeded embedding. A visitor is being shown structure; send structure.

---

## 4. What is not achievable as imagined

**Two-hand piano transcription. No.** YIN on a dyad returns the sub-octave GCD with high clarity — C4+E4 → C2 at 0.93, C3+E3 → C1, a C-E-G triad → C2. It is the algorithm being correct about a waveform that genuinely repeats there. No monophonic tracker fixes this; polyphonic transcription is a research problem, not an afternoon. *Nearest honest substitute:* the corrected guard detects that polyphony is present and the line says so — "chords were sounding; I cannot pick a line out of chords." Later, and gated hard, a spectral pitch-class set gives "the notes E, G and B are sounding," which will be wrong often because the sustain pedal holds the previous chord into the analysis window. **Script the demo right-hand-only.**

**"An actual neural network." No.** It is a TF-IDF cosine k-NN similarity graph with label-propagation communities, laid out by a 3-D random projection. Nothing is trained; nothing learns; no weights are adjusted by anything. The nodes are a fibonacci sphere plus `Math.random()` (`src/body.js:714`), not neurons. *Nearest honest substitute, and it is a genuinely good one:* you are building the **corpus and the structure** a model would be trained on, and making it visible and navigable. The UI copy that survives review: *"Lines join memories that share language. The links are counted, not learned — nothing here was trained."* The panel header says *"a similarity graph of 412 memories."* The product promise, stated true: *"the more you keep, the more of a mind there is here to train."* If the word "trained" ever appears in the panel or the shape block, the honest-senses law is broken.

**Position carrying meaning in the graph. No.** AUC 0.65 is the information-theoretic ceiling of S², not an implementation defect. *Substitute:* position is a **permanent address** (so a host recognises their own orb across sessions — which is real and valuable, and is exactly what force-directed and spectral layouts destroy). The edges carry similarity. Colour the edges by region, not the nodes.

**Key detection firing when Colin expects it. No.** Krumhansl–Kessler gets Für Elise wrong — E minor r=0.695 vs A minor 0.598, and the piece is in A minor — and Ode to Joy's 5 pitch classes cannot pin a key at all. *Substitute:* the gate (`gap ≥ 0.10 && r ≥ 0.70 && distinct ≥ 6`) makes it **abstain**, which is the feature: it is what stops the presence correcting Beethoven. Raise the bar higher for any out-of-key clause — `gap ≥ 0.20` plus a tonic corroboration — because the abstention on Für Elise survives by four thousandths of a correlation unit, and if it tips, the presence tells Colin that Für Elise has a wrong note in it.

**Cent-accurate tuning. No.** Delete the line. At 12 kHz one integer lag is 38 cents at C4 and 77 at C5; inharmonicity adds a uniform +16 cents the algorithm cannot separate from real tuning.

**Prompt caching as a saving, today. No.** `grep -rn "cache_control"` over `*.mjs src/*.js` returns nothing — no cache is ever set (only *read*, at `server.mjs:689-690`). Opus 4.8's minimum cacheable prefix is **1024 tokens**; `SYSTEM` is 2,835 chars ≈ 766 tokens and `SYSTEM + SHAPE_HINT` ≈ 956 — **under the floor, silently, with no error and `cache_creation_input_tokens: 0`**. And enabling it would break the hard stop: `server.mjs:646` is `{ in: data.usage.input_tokens | 0, … }`, which *excludes* cached tokens, and `server.mjs:2298` is `const inTok = out.usage?.in || 0` — so every tend beat would stop metering the whole cached prefix and the pool would drain at a fraction of its real rate while the host's actual bill passed zero. **Quote every cost uncached. If caching is ever wanted it is its own change**, and it starts with fixing both meter lines (`server.mjs:646` and `:2298`, mirroring what 688-690 already do) and splitting `opts.system` into `{stable, volatile}` so the breakpoint has a seam — today it is one flat string with live memory interpolated into it. `claude-opus-5` has a 512-token floor at the same $5/$25 price, which would make it viable; that is a model decision, not a caching decision.

**`@i` as index-space selection. No.** It is latitude wearing a different name.

**Notes faster than ~165 ms. Invisible.** Für Elise's opening 16ths sit at roughly 150–175 ms in performance — at or below the floor. Either say so, or shorten `PITCH_N` to 512 (halves the window, quarters `yin()`) and accept a raised low floor near C3.

**"Zero cost" for any of the three. No.** Shape: +10% on dance. Ear: +10% per hour while playing, $0 otherwise. Graph: +$0.05/hour of teaching, the rest genuinely free. All three are affordable; none is free, and saying free is the kind of small dishonesty this project does not do.

---

## 5. Colin's calls vs. the builder's

### Colin decides (cost, scope, irreversible, or a consent surface)

**D1 — Fix `PRICES` to the real Opus rates?** ($15/$75 → $5/$25.) Recommended yes, Stage 0. It changes every number in every host's budget popup and the meaning of all recorded spend. Today the hard stop fires at one third of funded life.

**D2 — Prompt caching: now, later, or never?** Recommended **later, and only as its own project**. It does not fire at the current prompt size on the default model, and turning it on today silently breaks the budget meter. (A related question: move `MODEL` to `claude-opus-5`? Same price, 512-token cache floor — but the gate regex at `server.mjs:631` doesn't admit it and `noThink` becomes a no-op there, so Stage 0 item 2 is a prerequisite either way.)

**D3 — May the room mic be open during the alive loop?** `src/main.js:326-331` currently force-closes continuous voice when the presence comes alive, with the comment "an open mic would feed the orb its own voice." The ear needs it open. An always-on microphone in a room the host has **left** (`alone === true`, `server.mjs:2261`) driving a metered loop on their own key is a consent surface this design cannot decide for you. If yes: a persistent visible indicator, a plain-language line in the settings pane, and an auto-stop after ~10 minutes of ear silence.

**D4 — Does a hearing percept ride to viewers?** `src/tend.js:229-231` publishes the presence's speech whenever `social.isHosting()`. With the room mic on, the presence talking about what it heard describes the host's physical room to strangers — and if the speech/tone discriminator fails (two people talking over music is admittedly untested), it sends a musical rendering of a private conversation. Recommended default: suppress the percept entirely while `ear.kind === 'mic' && social.isHosting()`.

**D5 — Reconcile the journal privacy comment with the behaviour.** `journal.mjs:10-12` says entries "are never served to anyone," and `MIND.md`'s safety table repeats it. But `src/social.js:1303-1304` are `publishJournal` and `publishRecall`, wired at `src/tend.js:440` and `:600-610`, and `server.mjs:2513` returns `journal`/`recalled` to the client. **Journal lines and recalled journal text already reach every viewer of a live room.** That may be exactly right — the host chose to go live — but the comment and the doc say otherwise, and Stage 13's entire threat model is derived from the comment. Decide which is true, then fix the other.

**D6 — Is a presence's memory shape ever public?** Default off. If yes, structure only, never directions. Note a presence-authored region *name* is a summary of journal content and must be owner-only, which the natural product instinct will want to violate.

**D7 — The words "neural network."** It is your phrase and your product promise, and the shipped thing is a counted similarity graph. This design will not put "trained" or "neural network" in UI copy or in a prompt. Whether the marketing language changes is yours.

**D8 — Accept the two-hand answer before Stage 5 is built.** You will sit down, play with both hands, and get "chords are sounding, I can't pick out a line." That is the honest answer. It is not the video you pictured. The video is right-hand melody.

**D9 — Should `setForm('web')` ever show the real graph?** Recommended no: a separate layer. Flagged because it is tempting and it couples the presence's mood vocabulary to its memory structure.

### The builder just does these

Shape: rename `<<field:>>` → `<<shape:>>`; radial clamp not box; `cube` × 1/√3; per-node radial density on `gl_PointSize`; real thickness for `disc`/`ring`; `shell` by `aRand`; drop `@i`, keep `@band`; drop `@wedge` or teach it; hoist `noise` and `atan` out of the loop; accumulate pulls; `uShapeTime` from a shared clock; hint inside `DANCE_HINT`, never `pExtra`; block last in the reply and strip before `parsePaint`; restraint clause; `validShape` at `server.mjs:2003`; `window.__y3kScene.body`; re-emit shape in the wordless rescue and widen its condition.

Ear: `pitchSr` from `ctx.sampleRate`; CMND from `tau=1`; harmonic-triple guard; `noiseSuppression: false`; a dedicated 2048-point analyser for the guard (the 8192 chroma one is 170 ms wide and smoothed, so it corroborates the *previous* note); extend `detachGraph`; interlock inside `voice.speaker()`; split `settings.js paint()`; instantaneous `rms` for the voiced gate; hop-gap flush; no bpm without a confidence gate; no cents tuning line; `MIN_NOTE_MS = 165`; count and report dropped notes ("two notes were too high or too short for me to name") so the model isn't handed a silently corrupted fingerprint; re-derive `COARSE` locally; percept out of `brain.js` history if the chat path is ever used; no double parentheses; `noteBeat` for the hearing event.

Memory: name it `memorygraph.mjs` with its own doc; salt `dirOf`'s direction hash apart from its ordering; drop top-8, use a static frequency table; `dfCut` floor at 8; halo by count; decode the `DataTexture` byte channel and gate on `aMem >= 0`; FRAG insert after line 234; peak-radiance normalisation verified by readback under `plasma`+`glitch`; chunk the claim/halo pass from `frame()` with a `setTimeout(fn,0)` fallback, never `requestIdleCallback`; allocate 10,150 edges; separate `setMemoryEdges` layer; widen the window z-band before the sixth id; `elementFromPoint` guard before picking; SHA-256 shader-text assertion instead of a golden table; copy `mind.mjs:46-63`'s coalesced persist rather than inventing a dirty flag for recall counts; exclude the per-visitor notes store (`memory.mjs:20`) from every graph — those are the human's notes; mark clipping-derived terms so a region label never claims authorship the presence doesn't have.

---

## 6. Two things to measure before believing this document

1. **Run the exact hint strings through `/v1/messages/count_tokens`** (it is free). Every token figure here is a char count divided by 3.4–3.7 and is good to about ±15%. The conclusions survive a ±25% miss; the ledger should carry the real number. Measured char counts, for the record: `SYSTEM` 2,835 · `PAINT_HINT` 1,055 · `PRESENCE_HINT` 1,701 (template) · `DANCE_HINT` 1,000 · `AUTONOMOUS_HINT` 3,851 (template) · `SHAPE_HINT` 624 · the ear percept 508 (mono) / 210 (poly) · the shape answer 455.

2. **Read the recorded `in`/`out` off twenty real beats** before and after each of Stage 4, 6 and 7. The stream path already captures real token counts including thinking (`server.mjs:682-690`, and the comment there explains why that took two tries). Thinking is the one cost nobody in this document can predict, and it is 5× the price of input.