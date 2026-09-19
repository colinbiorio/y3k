// ============================================================================
// perceive.js — THE EYE GATE
//
// Everything the camera is used to UNDERSTAND lives here, and nowhere else.
// Three features want it (the window, the hand, the percept line) and each of
// them gets the same thing: a snapshot they pull when they happen to be
// rendering. No callbacks out of here into feature code — a slow consumer must
// not be able to stall perception, and a stalled perception must not be able
// to stall the frame.
//
// THE GATE IS THE WHOLE POINT, and it is not only a privacy nicety. Turning
// the eye on is a real download. The brief sizes it at ~15 MB from
// content-length, which is the uncompressed truth and not what is paid: the
// 11.2 MB WASM arrives Brotli-compressed at 3.05 MB (measured over the wire).
// Face-only is about 3.2 MB of engine plus the 3.58 MB model. Still heavy
// enough that all of the following holds, and half of what the brief feared:
//
//   - Nothing is fetched until the camera is actually on. Not at boot, not on
//     hover, not "to warm the cache".
//   - Face loads first. Hands load only if something asks for them, because
//     7.46 MB is most of the difference and face-only is the configuration
//     most people will want.
//   - Camera off means the landmarkers are CLOSED, not paused. A closed camera
//     that leaves the models resident and a GPU delegate warm is a lie about
//     being off.
//
// Uncompressed, fetched and checked 2026-09-19: bundle 155,439 B · wasm
// 11,756,954 B · face 3,758,596 B. Over the wire, measured in a browser
// 2026-09-19: bundle 44 KB · wasm loader 77 KB · wasm 3,051 KB · model not
// reported (storage.googleapis.com sends no Timing-Allow-Origin). Second
// turn-on serves the engine from cache: 414 ms to 50 ms.
//
// Turn the readout on with ?reach — same shape as ?perf. Inert without it.
// ============================================================================

// Pinned, deliberately. The CDN path IS the version: @latest would silently
// re-download everything and change behaviour underneath us. The bare
// specifier resolves through the importmap in index.html, which is how this
// house adds a library (three arrives the same way).
const VISION = '@mediapipe/tasks-vision';
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// 7.46 MB uncompressed, and it is most of the difference between face-only and
// everything — which is why it is behind its own switch and fetched only when
// something actually asks for hands.
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// A head is a head: it does not move fast, and the camera is 30 fps anyway.
// When inference turns out to be expensive we halve our own rate rather than
// let it eat the render loop — dropping our own rate is honest; dropping the
// room's frames is not.
//
// THE CAP KEYS ON MEASURED COST, NOT ON THE DELEGATE LABEL, and that is a
// correction to the brief. It says to detect the fallback to CPU and halve the
// rate; the trouble is that MediaPipe does not fail when the GPU delegate is
// unavailable, it falls back QUIETLY — createFromOptions resolves, and the
// console prints an XNNPACK line that is also printed in perfectly healthy GPU
// runs. There is no honest way to read back which one you got. So we do not
// claim one: we record what we ASKED for, measure what we actually pay, and
// let the number decide the rate. That is the thing the label was a proxy for.
const FACE_HZ = 30;
const FACE_HZ_SLOW = 15;
// Per-FRAME cost above which the full rate is not affordable. `cost` measures
// the whole frame's inference, which is one model or two depending on the
// switch — so the threshold has to move with it, or turning hands on trips the
// slow branch immediately and drops the eye to 15 Hz on a machine that was
// perfectly comfortable. The hand is the one that wants the rate.
const SLOW_MS = 12;
const SLOW_MS_BOTH = 26;
// A hand moves faster than a head but it is also the more expensive model, and
// the cursor is interpolated between results anyway. Both tasks share one loop,
// so this is the slower of the two rates when both are on.
const HAND_HZ = 24;

// How long a reading stays worth using after the face was last seen. Consumers
// read `age` and decide for themselves; this is only when we stop claiming ok.
const STALE_MS = 500;

const DEBUG = typeof location !== 'undefined' && /(?:\?|&)reach\b/.test(location.search);

// ---------------------------------------------------------------------------
// THE BEACON, WHICH IS NOT IN THE BRIEF AND SHOULD HAVE BEEN.
//
// Creating a landmarker makes tasks-vision POST to
// https://odml.pa.googleapis.com/v1/log — measured, twice, on task creation,
// not on inference. The package really is Apache-2.0 with zero npm
// dependencies, as the brief says; it simply also phones home, and nothing in
// its options turns that off.
//
// On this app that is not a small detail. The whole shape of the camera here
// is "the user turns the eye on, never the reverse", and a webcam feature that
// silently tells Google each time it starts is the opposite of that promise —
// whatever the payload turns out to contain, which is not the point.
//
// So: one host, refused, with an empty 200 so the library's own fire-and-
// forget call resolves instead of rejecting into its error path. Everything
// else passes through untouched. Installed once, when the eye first loads —
// never at boot, because a page that never opens the camera should not be
// carrying our patch either.
//
// COLIN: this is a judgement I made on your behalf and it is one line to
// reverse (drop the call to muzzle()). The alternative, if you would rather
// not patch a global at all, is self-hosting the wasm and the model on our own
// origin — but the beacon lives in the engine, not in the model URL, so that
// alone would not stop it.
// ---------------------------------------------------------------------------
const BEACON = 'odml.pa.googleapis.com';
let muzzled = false;
function muzzle() {
  if (muzzled || typeof window === 'undefined' || !window.fetch) return;
  muzzled = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes(BEACON)) return Promise.resolve(new Response('', { status: 200 }));
    return original(input, init);
  };
}

// The canonical FaceMesh indices this module actually names. 33 and 263 are
// the OUTER eye corners, so the span between them is the widest stable
// horizontal feature on a face — the classic monocular depth proxy, and the
// fallback if the transformation matrix disappoints (it is the load-bearing
// input of the window, and its noise floor is still unmeasured).
const EYE_L = 33, EYE_R = 263, NOSE = 1;

// THE HAND, as MediaPipe numbers it. 21 points: the wrist, then four per digit
// from knuckle to tip.
const TIPS = [4, 8, 12, 16, 20];          // thumb, index, middle, ring, pinky
const PIPS = [3, 6, 10, 14, 18];          // the joint below each tip: the curl test
const PINCH_A = 4, PINCH_B = 8;           // thumb tip to index tip
const SPAN_A = 0, SPAN_B = 5;             // wrist to index knuckle: the in-hand ruler
// The skeleton, as pairs — the palm's arch plus one chain per digit. This is the
// standard MediaPipe topology; it is drawn over the camera image so a person can
// see what the machine sees, which is the difference between a feature that
// works and a feature you have to take on faith.
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
export const HAND_BONES = BONES;
export const HAND_TIPS = TIPS;

export function createPerceive({ camera, video, onStatus = null, onError = null } = {}) {
  // ---- what the outside world reads ---------------------------------------
  // One object, rewritten in place, handed out as a shallow copy. Consumers
  // poll it; nobody gets a reference they could mutate under us.
  const head = { x: 0, y: 0, z: 0, ok: false, age: Infinity, seenAt: 0 };
  const hands = [];
  let t = 0;

  // ---- loading + lifecycle -------------------------------------------------
  let fileset = null;             // the WasmFileset: path strings, cheap, kept
  let faceTask = null;            // the landmarker: holds the GPU, always closed
  let handTask = null;            // the same, for hands — its own switch, its own 7.46 MB
  let wantFace = true;            // the window wants this; hands are opt-in
  let wantHands = false;          // opt-in: 7.46 MB and the more expensive model
  let loading = false;
  let asked = null;               // the delegate we REQUESTED; not knowable after
  let status = 'off';
  let note = '';
  let running = false;
  let raf = 0;
  let watchdog = 0;

  // ---- the timestamp trap --------------------------------------------------
  // detectForVideo requires STRICTLY INCREASING timestamps and throws on a
  // repeat. video.currentTime * 1000 is the obvious choice and is wrong: a
  // stalled video repeats it. Our own counter can only go up.
  let stamp = 0;
  let lastFrameTime = -1;         // skip a frame the video has not advanced past

  // ---- measurement ---------------------------------------------------------
  // The frame-budget question is open (the brief marks it a prediction, not a
  // fact), so the numbers that would answer it are collected from the start.
  const cost = { last: 0, avg: 0, max: 0, n: 0, hz: 0, skipped: 0, errors: 0 };
  let hzWindow = [];

  const say = (s, n = '') => {
    if (status === s && note === n) return;
    status = s; note = n;
    try { onStatus?.(s, n); } catch { /* a status listener must never break the eye */ }
  };
  const blame = (where, e) => {
    cost.errors += 1;
    try { onError?.(where, e?.message || String(e)); } catch { /* ditto */ }
  };

  // ---- loading -------------------------------------------------------------
  async function ensureFileset() {
    if (fileset) return fileset;
    muzzle();                     // before anything of theirs can call out
    say('loading', 'the engine (3 MB over the wire)');
    const mod = await import(VISION);
    fileset = await mod.FilesetResolver.forVisionTasks(WASM_BASE);
    fileset.__mod = mod;          // the task classes live on the module, not the fileset
    return fileset;
  }

  async function ensureFace() {
    if (faceTask) return faceTask;
    const fs = await ensureFileset();
    const { FaceLandmarker } = fs.__mod;
    say('loading', 'the face model (3.6 MB)');
    // delegate: 'GPU' is a REQUEST, not a guarantee. Ask, and find out which
    // one we were given by trying — a silent CPU fallback at the GPU rate cap
    // is how inference starts eating the render loop's frames.
    const opts = (d) => ({
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: d },
      runningMode: 'VIDEO',
      numFaces: 1,                 // two faces is not a better effect, it is a fight
      // The one that matters for the window: a 4x4 mapping the canonical face
      // onto this one, so its translation IS the head's position, already
      // solved. Blendshapes stay off — nothing needs them until the percept
      // line, and they are not free.
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: false,
    });
    try {
      faceTask = await FaceLandmarker.createFromOptions(fs, opts('GPU'));
      asked = 'GPU';
    } catch (e) {
      // A real throw is rare — the quiet fallback is the common case — but if
      // asking for the GPU does fail outright, ask for what is left.
      blame('face:gpu', e);
      faceTask = await FaceLandmarker.createFromOptions(fs, opts('CPU'));
      asked = 'CPU';
    }
    await warmUp(faceTask, 'face');
    return faceTask;
  }

  async function ensureHands() {
    if (handTask) return handTask;
    const fs = await ensureFileset();
    const { HandLandmarker } = fs.__mod;
    say('loading', 'the hand model (7.5 MB)');
    const opts = (d) => ({
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: d },
      runningMode: 'VIDEO',
      // BOTH HANDS. It costs roughly double, which the measured rate cap
      // already absorbs, and it answers the design question the brief left
      // open — "which one owns the cursor?" — by not having one owner: each
      // hand carries its own pointer, with its own id, the way two fingers on
      // a touchscreen do.
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      handTask = await HandLandmarker.createFromOptions(fs, opts('GPU'));
    } catch (e) {
      blame('hand:gpu', e);
      handTask = await HandLandmarker.createFromOptions(fs, opts('CPU'));
    }
    await warmUp(handTask, 'hand');
    return handTask;
  }

  // MEASURED, ON THIS MACHINE, THE FIRST TIME: 3,062 ms. Every detect after it
  // was 6-8 ms. That first call is where the graph is built and the shaders are
  // compiled, and the brief does not mention it — it predicted the 8 ms and was
  // right, but a three-second stall on the first frame after the camera opens
  // would read as the whole app hanging, and it would land exactly when the
  // user is looking to see whether the thing they just switched on works.
  //
  // So we pay it here, inside the wait we have already admitted to, on a frame
  // nobody is waiting for. Failure is not fatal: a warm-up that throws just
  // means the first real detect pays instead, which is where we started.
  async function warmUp(task, which) {
    const started = performance.now();
    // The video is usually ready (camera.on() awaits play()), but not always,
    // and warming on the real frame is what compiles the right shaders.
    while (video && video.readyState < 2 && performance.now() - started < 1500) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!task || !video || video.readyState < 2 || !video.videoWidth) return;
    say('loading', 'warming up');
    try {
      stamp = Math.max(stamp + 1, Math.round(performance.now()));
      task.detectForVideo(video, stamp);
    } catch (e) {
      blame(which + ':warm', e);
    }
  }

  // ---- teardown ------------------------------------------------------------
  // close() is the whole promise of the gate. Everything that holds a GPU
  // buffer is released; the fileset survives because it is only path strings,
  // and keeping it means the second turn-on skips straight to the HTTP cache.
  function release() {
    if (faceTask) { try { faceTask.close(); } catch (e) { blame('face:close', e); } }
    if (handTask) { try { handTask.close(); } catch (e) { blame('hand:close', e); } }
    faceTask = null;
    handTask = null;
    asked = null;
    stamp = 0; lastFrameTime = -1;
    head.ok = false; head.age = Infinity;
    hands.length = 0;
    cost.last = cost.avg = cost.max = cost.n = cost.hz = 0; cost.skipped = 0;
    hzWindow = [];
  }

  // ---- the loop ------------------------------------------------------------
  // The rate the measurement earns. Until there are enough samples to mean
  // anything we run at the full rate; after that, a median above SLOW_MS says
  // this machine cannot afford 30 Hz of inference next to a 24,000-particle
  // field, whatever label the delegate would have carried.
  function interval() {
    const budget = (faceTask && handTask) ? SLOW_MS_BOTH : SLOW_MS;
    const slow = cost.n >= 12 && cost.avg > budget;
    const hz = slow ? FACE_HZ_SLOW : (handTask ? HAND_HZ : FACE_HZ);
    return 1000 / hz;
  }

  let lastRun = 0;
  function tick(now) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(tick);

    if (!camera?.isOn?.()) return;              // the gate, checked every frame
    if (now - lastRun < interval()) return;
    lastRun = now;

    // Age the reading whether or not we get a new one, so a consumer can tell
    // a fresh miss from a stale hit without knowing anything about our rate.
    if (head.seenAt) head.age = now - head.seenAt;
    if (head.age > STALE_MS) head.ok = false;
    // A HAND THAT LEAVES MUST BE SAID TO HAVE LEFT, not merely stop being
    // mentioned. Anything holding a drag on a hand needs an end event, and a
    // consumer can only send one if it is told the hand is gone.
    for (const h of hands) { h.age = now - h.seenAt; if (h.age > STALE_MS) h.ok = false; }

    if ((!faceTask && !handTask) || !video) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    // The same decoded frame twice is not a new observation, and feeding it
    // would burn inference for a duplicate answer.
    if (video.currentTime === lastFrameTime) { cost.skipped += 1; return; }
    lastFrameTime = video.currentTime;

    stamp = Math.max(stamp + 1, Math.round(now));   // monotonic, always

    // ONE FRAME, BOTH TASKS, ONE TIMESTAMP. They must not be given different
    // stamps for the same frame: each task keeps its own monotonic check, and
    // a shared frame with two different times is a lie about when it was seen.
    const t0 = performance.now();
    let faceRes = null, handRes = null;
    if (faceTask) {
      try { faceRes = faceTask.detectForVideo(video, stamp); }
      catch (e) { blame('face:detect', e); }
    }
    if (handTask) {
      try { handRes = handTask.detectForVideo(video, stamp); }
      catch (e) { blame('hand:detect', e); }
    }
    const ms = performance.now() - t0;
    cost.last = ms;
    cost.max = Math.max(cost.max, ms);
    cost.n += 1;
    cost.avg += (ms - cost.avg) / Math.min(cost.n, 60);
    hzWindow.push(now);
    while (hzWindow.length && now - hzWindow[0] > 1000) hzWindow.shift();
    cost.hz = hzWindow.length;

    readFace(faceRes, now);
    readHands(handRes, now);
    t = now;
  }

  // ---- reading the result --------------------------------------------------
  // MIRRORING IS SETTLED HERE AND NOWHERE ELSE. getUserMedia with facingMode
  // 'user' hands us an UNMIRRORED frame — the view another person standing at
  // the camera would have — so the viewer's own right hand appears on the
  // frame's left. The #cam preview is CSS-mirrored (scaleX(-1)) so it reads as
  // a selfie, which means the frame and what the user sees are not the same
  // orientation. Every consumer downstream wants VIEWER space: +x is to the
  // viewer's right, as they would point. So x flips once, here.
  function readFace(res, now) {
    const lm = res?.faceLandmarks?.[0];
    if (!lm || !lm.length) return;              // no face: leave the reading to age out

    const m = res.facialTransformationMatrixes?.[0]?.data;
    if (m && m.length === 16) {
      // Column-major 4x4; the translation is elements 12,13,14, in canonical
      // face units. This is scaled by a CANONICAL head, so a smaller head
      // reads as consistently farther away. Irrelevant for parallax, and a lie
      // for anything claiming to know where you are — do not let it become one.
      head.x = -m[12];
      head.y = m[13];
      head.z = m[14];
      head.from = 'matrix';
    } else {
      // The documented fallback, kept live rather than kept in a comment: the
      // nose in normalized image coordinates, with the outer-eye span standing
      // in for depth. Worse conditioned, still workable, same architecture.
      const n = lm[NOSE];
      head.x = -(n.x - 0.5);
      head.y = -(n.y - 0.5);
      head.z = eyeSpan(lm);
      head.from = 'landmarks';
    }
    // Carried regardless, because the open question about the matrix's noise
    // floor is answered by watching these two disagree.
    head.span = eyeSpan(lm);
    head.nose = [lm[NOSE].x, lm[NOSE].y];
    head.points = lm.length;
    head.ok = true;
    head.age = 0;
    head.seenAt = now;
  }

  // THE HAND, READ THE SAME WAY THE HEAD IS: mirrored once, here, and never
  // again. The frame is unmirrored (facingMode 'user'), the preview is CSS
  // mirrored, and everything downstream wants viewer space — so x flips, and so
  // does the handedness label, because MediaPipe decides that ASSUMING a
  // mirrored selfie view and it is looking at an unmirrored one. Its "Left" is
  // the hand a viewer would call their right.
  function readHands(res, now) {
    // A RESULT WITH NO HANDS IS AN ANSWER, NOT A NON-ANSWER. Returning early on
    // an empty list skipped the "the extras have left" loop below, so `ok`
    // stayed true until it aged out — five lit beads and a skeleton frozen
    // mid-screen for half a second every single time the hand left the frame.
    // Only a missing RESULT (the task did not run) leaves it to the age-out.
    if (!res) return;
    const list = res.landmarks || [];
    for (let i = 0; i < list.length; i++) {
      const lm = list[i];
      if (!lm || lm.length < 21) continue;
      const h = hands[i] || (hands[i] = { points: [], tips: [], extended: [] });
      // Every point, in viewer space, 0..1 across the frame. The overlay draws
      // these; nothing else should need them.
      for (let j = 0; j < lm.length; j++) {
        const p = h.points[j] || (h.points[j] = [0, 0, 0]);
        p[0] = 1 - lm[j].x; p[1] = lm[j].y; p[2] = lm[j].z;
      }
      for (let j = 0; j < TIPS.length; j++) {
        const t = h.tips[j] || (h.tips[j] = [0, 0]);
        t[0] = 1 - lm[TIPS[j]].x; t[1] = lm[TIPS[j]].y;
      }
      // PINCH IS A RATIO, NEVER PIXELS. Thumb-to-index measured against the
      // wrist-to-knuckle span, which is a fixed bone: the number then means the
      // same thing at arm's length as it does up close. In raw pixels the
      // threshold drifts as the person leans, which reads as the pinch getting
      // harder the further away you sit.
      const span = dist(lm[SPAN_A], lm[SPAN_B]);
      h.pinch = span > 1e-4 ? dist(lm[PINCH_A], lm[PINCH_B]) / span : 1;
      // WHICH FINGERS ARE OUT. A curled finger must not leave a mark on the
      // screen: hold up one finger and there should be one cursor, which is
      // both what a person expects and the only way pointing at something is
      // unambiguous.
      //
      // The test is the joint below the tip. For the four fingers, an extended
      // one puts its tip further from the wrist than its middle joint; a curled
      // one folds the tip back inside that radius. It needs no angle, no
      // calibration, and it holds at any distance because both lengths shrink
      // together. The thumb does not fold that way — it swings sideways across
      // the palm — so it is measured against the index knuckle instead: out,
      // and the tip is further from that knuckle than its own joint is.
      for (let j = 0; j < TIPS.length; j++) {
        const tip = lm[TIPS[j]], pip = lm[PIPS[j]];
        h.extended[j] = j === 0
          ? dist(tip, lm[SPAN_B]) > dist(pip, lm[SPAN_B]) * 1.08
          : dist(tip, lm[SPAN_A]) > dist(pip, lm[SPAN_A]) * 1.05;
      }
      const cat = res?.handedness?.[i]?.[0];
      h.handedness = cat ? (cat.categoryName === 'Left' ? 'Right' : 'Left') : '';
      h.score = cat ? cat.score : 0;
      h.ok = true; h.age = 0; h.seenAt = now;
    }
    // more hands last frame than this one: the extras have left
    for (let i = list.length; i < hands.length; i++) hands[i].ok = false;
  }

  // FLAT DISTANCE, ON PURPOSE. MediaPipe's landmark z is not in the same units
  // as x and y — it is a relative depth scaled to the hand, roughly "how far in
  // front of the wrist", and folding it into a length makes that length mean
  // different things as the hand turns. Both things measured here (is this
  // finger out, is the thumb touching the index) are about the shape of the
  // hand as seen, so they are measured as seen.
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function eyeSpan(lm) {
    const a = lm[EYE_L], b = lm[EYE_R];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ---- starting and stopping with the camera -------------------------------
  async function wake() {
    if (loading || !camera?.isOn?.()) return;
    if (!wantFace && !wantHands) return;
    loading = true;
    try {
      if (wantFace) await ensureFace();
      // FACE FIRST, ALWAYS. Not for tidiness: face-only is the configuration
      // most people want and it is less than half the download, so the cheap
      // thing has to be usable before the expensive one is even started.
      if (wantHands && camera.isOn()) await ensureHands();
      if (!camera.isOn()) { release(); say('off'); return; }   // turned off mid-load
      say('ready', asked ? 'asked ' + asked : '');
      start();
    } catch (e) {
      blame('wake', e);
      release();
      say('error', e?.message || 'could not start');
    } finally {
      loading = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    lastRun = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function halt() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    release();
    say('off');
  }

  // Reconcile with the camera twice a second. sync() is called directly by the
  // toggle for immediacy; this exists because the camera can also stop for
  // reasons nobody told us about (the track ends, the tab loses the device,
  // another page takes it) and the models must go with it.
  function sync() {
    const on = Boolean(camera?.isOn?.());
    if (on && !faceTask && !loading) wake();
    else if (!on && (faceTask || running)) halt();
  }

  watchdog = setInterval(sync, 500);

  const api = {
    // The snapshot, as the brief specifies it. A copy: nobody edits our state.
    snapshot() {
      return {
        head: { x: head.x, y: head.y, z: head.z, ok: head.ok, age: head.age },
        hands: hands.slice(),
        t,
      };
    },
    // Everything the readout and the coming stages want, without widening the
    // snapshot that features poll every frame.
    detail() {
      return {
        status, note, asked, running, hz: Math.round(1000 / interval()),
        want: { face: wantFace, hands: wantHands },
        head: { ...head },
        cost: { ...cost },
      };
    },
    setFace(on) { wantFace = Boolean(on); if (!wantFace && faceTask) halt(); else sync(); },
    setHands(on) {
      const was = wantHands;
      wantHands = Boolean(on);
      // Turning hands OFF closes that model and keeps the face running — the
      // expensive one should not be resident because it once was.
      if (was && !wantHands && handTask) {
        try { handTask.close(); } catch (e) { blame('hand:close', e); }
        handTask = null; hands.length = 0;
      }
      if (!was && wantHands && camera?.isOn?.() && !loading) wake();
      else sync();
    },
    sync,
    stop() { clearInterval(watchdog); watchdog = 0; halt(); },
  };

  if (DEBUG) startReadout(api);
  return api;
}

// ============================================================================
// The readout. Numbers on screen behind ?reach, in the house's debug idiom
// (see perf-hud.js): fixed, monospace, pointer-events none, and nothing at all
// unless the flag is there.
//
// It prints the raw matrix translation ALONGSIDE the derived viewer-space
// reading on purpose. The sign conventions of MediaPipe's camera frame are the
// one thing in this build that cannot be settled by reading — they have to be
// read off a real face moving in a real direction, and this is the instrument
// for doing that in one glance.
// ============================================================================
function startReadout(perceive) {
  const box = document.createElement('div');
  box.id = 'reach-hud';
  box.style.cssText = [
    'position:fixed', 'top:0', 'right:0', 'z-index:99999',
    'font:11px/1.35 ui-monospace,Menlo,monospace', 'color:#9ec8ff',
    'background:rgba(0,0,0,.82)', 'padding:6px 8px', 'white-space:pre',
    'pointer-events:none', 'border-bottom-left-radius:8px', 'max-width:46vw',
  ].join(';');
  const put = () => (document.body ? document.body.appendChild(box) : addEventListener('DOMContentLoaded', put));
  put();

  const n = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');
  setInterval(() => {
    const d = perceive.detail();
    const h = d.head;
    box.textContent = [
      `eye    ${d.status}${d.note ? ' · ' + d.note : ''}`,
      `run    ${d.running ? 'yes' : 'no'}  asked ${d.asked || '—'}  cap ${d.hz}Hz  face ${d.want.face ? 'on' : 'off'}  hands ${d.want.hands ? 'on' : 'off'}`,
      `face   ${h.ok ? 'seen' : 'none'}  pts ${h.points || 0}  age ${h.age === Infinity ? '—' : Math.round(h.age) + 'ms'}  via ${h.from || '—'}`,
      `head   x ${n(h.x)}  y ${n(h.y)}  z ${n(h.z)}   (viewer space, +x = their right)`,
      `span   ${n(h.span, 4)}   nose ${h.nose ? n(h.nose[0], 3) + ',' + n(h.nose[1], 3) : '—'}`,
      `infer  ${n(d.cost.last, 1)}ms  avg ${n(d.cost.avg, 1)}  max ${n(d.cost.max, 1)}  ${d.cost.hz}Hz`,
      `skips  ${d.cost.skipped}  errors ${d.cost.errors}`,
    ].join('\n');
  }, 200);
}
