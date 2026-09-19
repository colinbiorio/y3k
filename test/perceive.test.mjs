// THE EYE GATE — Stage 1 of REACH.md. Run: node test/perceive.test.mjs
//
// perceive.js cannot be exercised headlessly: it wants a DOM, a camera and a
// WASM engine. What CAN be held here is every promise the module makes that is
// visible in its source — and those promises are the whole feature. The gate
// is a privacy claim; teardown is a privacy claim; the timestamp discipline is
// the difference between working and throwing. Each of them fails silently if
// it regresses, which is exactly what a guard is for.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const src = readFileSync(new URL('src/perceive.js', ROOT), 'utf8');
const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
const html = readFileSync(new URL('index.html', ROOT), 'utf8');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('\nthe eye gate:');

ok('nothing is fetched until the camera is on', () => {
  // The module may NAME the CDN at the top level (constants are free); it may
  // not REACH it. Every fetch has to sit inside a function the gate calls.
  const top = src.slice(0, src.indexOf('export function createPerceive'));
  assert.ok(!/await import\(|fetch\(|forVisionTasks\(/.test(top), 'the module loads the engine at import time — the camera gate is bypassed');
  assert.ok(/async function ensureFileset\(\)/.test(src), 'the lazy loader is gone');
  assert.ok(/async function ensureFace\(\)/.test(src), 'the face loader is gone');
  // and the loop itself re-checks, every frame, rather than trusting a flag
  const tick = src.slice(src.indexOf('function tick('), src.indexOf('function readFace'));
  assert.ok(/if \(!camera\?\.isOn\?\.\(\)\) return;/.test(tick), 'the loop does not re-check the camera — it would keep inferring after the eye was shut');
});

ok('camera off closes the models, it does not pause them', () => {
  const rel = src.slice(src.indexOf('function release()'), src.indexOf('// ---- the loop'));
  assert.ok(/faceTask\.close\(\)/.test(rel), 'the landmarker is never closed — the GPU stays warm behind a camera that says it is off');
  assert.ok(/faceTask = null;/.test(rel), 'the task is closed but still referenced');
  assert.ok(/head\.ok = false/.test(rel), 'a stale reading survives teardown and a consumer would keep using it');
  // the reconciler exists, because the camera can also stop without telling us
  assert.ok(/watchdog = setInterval\(sync, 500\)/.test(src), 'nothing reconciles with a camera that stopped on its own');
  assert.ok(/function halt\(\)[\s\S]{0,200}release\(\)/.test(src), 'halt does not release');
});

ok('the timestamp is our own monotonic counter, never the video clock', () => {
  // detectForVideo throws on a repeated timestamp, and a stalled video repeats
  // currentTime — the trap everybody hits once.
  assert.ok(/stamp = Math\.max\(stamp \+ 1, Math\.round\(now\)\)/.test(src), 'the monotonic stamp is gone');
  assert.ok(!/detectForVideo\([^)]*currentTime \* 1000/.test(src), 'the video clock is being used as a timestamp');
  // currentTime is still the right way to notice a frame has not advanced
  assert.ok(/video\.currentTime === lastFrameTime/.test(src), 'a duplicate frame would be re-inferred for the same answer');
});

ok('the rate keys on measured cost, not on a delegate label that cannot be read back', () => {
  assert.ok(/const SLOW_MS = /.test(src), 'the cost threshold is gone');
  assert.ok(/cost\.n >= \d+ && cost\.avg > budget/.test(src), 'the rate no longer adapts to what inference actually costs');
  // and the budget knows how many models the frame is paying for: cost measures
  // the WHOLE frame, so a face-only threshold trips the moment hands come on
  assert.ok(/const budget = \(faceTask && handTask\) \? SLOW_MS_BOTH : SLOW_MS;/.test(src), 'one threshold is used for one model and for two — turning hands on would drop the eye to half rate on a machine that was fine');
  assert.ok(/const SLOW_MS_BOTH = \d+;/.test(src), 'the two-model budget is gone');
  // MediaPipe falls back from GPU to CPU silently, so a stored 'delegate' is a
  // claim we cannot support. We record what we ASKED for.
  assert.ok(/let asked = null;/.test(src), 'the requested delegate is not recorded');
  assert.ok(!/delegate === 'CPU'/.test(src), 'something branches on a delegate we cannot actually determine');
});

ok('the first inference is paid during the load, not on the first live frame', () => {
  // Measured: 3,062 ms on the first detect, 6-8 ms on every one after. That
  // stall lands exactly when the user is checking whether the eye works.
  assert.ok(/async function warmUp\(task, which\)/.test(src), 'the warm-up is gone — the first frame pays three seconds');
  // BOTH models pay it. The hand model is the bigger one; letting it skip the
  // warm-up would just move the three-second stall onto the hand.
  assert.ok(/await warmUp\(faceTask, 'face'\);/.test(src), 'the face never warms up');
  assert.ok(/await warmUp\(handTask, 'hand'\);/.test(src), 'the hand never warms up');
  const ef = src.slice(src.indexOf('async function ensureFace()'), src.indexOf('async function ensureHands()'));
  assert.ok(ef.indexOf("await warmUp(faceTask, 'face')") > ef.indexOf('createFromOptions'), 'the warm-up does not run after the task is created');
});

ok('the library is not allowed to phone home', () => {
  // tasks-vision POSTs to odml.pa.googleapis.com/v1/log on task creation —
  // measured, and not mentioned in the brief. On a camera feature whose whole
  // promise is "you turn the eye on", that call is the promise broken.
  assert.ok(/odml\.pa\.googleapis\.com/.test(src), 'the beacon host is no longer named');
  assert.ok(/function muzzle\(\)/.test(src), 'the beacon is no longer refused');
  assert.ok(/muzzle\(\);/.test(src.slice(src.indexOf('async function ensureFileset'))), 'the muzzle is never installed');
  assert.ok(/new Response\('', \{ status: 200 \}\)/.test(src), 'the refusal rejects instead of resolving — the library would take its error path');
  // and it must not be installed at boot: a page that never opens the camera
  // should not be carrying our patch either
  assert.ok(!/^muzzle\(\);/m.test(src), 'the muzzle is installed at module load');
});

ok('the snapshot is a copy, and the readout is behind the flag', () => {
  assert.ok(/const DEBUG = .*\/\(\?:\\\?\|&\)reach\\b\//.test(src), 'the ?reach flag is gone');
  assert.ok(/if \(DEBUG\) startReadout\(api\)/.test(src), 'the readout is no longer gated — it would paint for everyone');
  const snap = src.slice(src.indexOf('snapshot() {'), src.indexOf('detail() {'));
  assert.ok(/head: \{ x: head\.x/.test(snap), 'the snapshot hands out a live reference to our own state');
  assert.ok(/hands: hands\.slice\(\)/.test(snap), 'the hands array is handed out by reference');
  // face and hands are independently switchable — the cheap configuration has
  // to be a real one
  assert.ok(/setFace\(on\)/.test(src) && /setHands\(on\)/.test(src), 'face and hands are not independently switchable');
});

ok('it is wired to the camera the app already has, and pins its version', () => {
  assert.ok(/import \{ createPerceive \} from '\.\/perceive\.js';/.test(main), 'main.js does not import the eye');
  assert.ok(/const perceive = createPerceive\(\{\s*camera,/.test(main), 'the eye is not built on the existing camera');
  // The camera has OWNERS now, and tracking is one of them: the button by the
  // message box grants only the right to be photographed. applyCam is what
  // tells the eye, immediately, whoever opened or closed the stream.
  const apply = main.slice(main.indexOf('function applyCam()'), main.indexOf('function applyTracking()'));
  assert.ok(/perceive\.sync\(\);/.test(apply), 'nothing tells the eye when the camera opens — it would wait up to 500ms to notice');
  assert.ok(/const camOwners = new Set\(\);/.test(main), 'the camera lease is gone');
  // THE PRIVACY LINE, and it is the whole reason tracking may open the camera
  // at all: the picture rides on the CHAT lease, never on the device being on.
  assert.ok(/camOwners\.has\('chat'\) \? camera\.captureFrame\(\) : null/.test(main), 'a camera opened for tracking would put the person in every message');
  assert.ok(!/camera\.isOn\(\) \? camera\.captureFrame\(\)/.test(main), 'the old device-wide capture is back');
  // and nothing starts speculatively: all three switches are off until asked
  assert.ok(/let faceWanted = false, handsWanted = false, camViewWanted = false;/.test(main), 'a tracking switch defaults ON — that is a camera prompt nobody asked for');
  assert.ok(/localStorage\.getItem\('y3k\.face'\) === '1'/.test(main), 'the face switch is opt-out rather than opt-in');
  assert.ok(/hullReport\('perceive:/.test(main), 'the eye does not report damage to the hull');
  // the importmap is how this house adds a library, and the CDN path IS the
  // version: @latest would re-download everything and change behaviour
  assert.ok(/"@mediapipe\/tasks-vision": "https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@1\.0\.1\//.test(html), 'tasks-vision is not pinned in the importmap');
  assert.ok(!/tasks-vision@latest/.test(html + src), 'a @latest pin would change under us');
});

console.log('\nthe hand:');

ok('hands are their own switch, their own download, and their own teardown', () => {
  // 7.46 MB, and most of the difference between face-only and everything. A
  // face-only page must never fetch it.
  assert.ok(/const HAND_MODEL = 'https:\/\/storage\.googleapis\.com\/mediapipe-models\/hand_landmarker\//.test(src), 'the hand model is gone');
  const wake = src.slice(src.indexOf('async function wake()'), src.indexOf('function start()'));
  assert.ok(/if \(wantFace\) await ensureFace\(\);/.test(wake), 'the face is no longer loaded first');
  assert.ok(/if \(wantHands && camera\.isOn\(\)\) await ensureHands\(\);/.test(wake), 'hands load unconditionally, or never');
  assert.ok(wake.indexOf('ensureFace') < wake.indexOf('ensureHands'), 'the expensive model loads before the cheap one');
  // turning hands off closes THAT model and leaves the face running
  const sh = src.slice(src.indexOf('setHands(on) {'), src.indexOf('setHands(on) {') + 700);
  assert.ok(/handTask\.close\(\)/.test(sh), 'switching hands off leaves 7.5 MB and a GPU context resident');
  assert.ok(/handTask = null; hands\.length = 0;/.test(sh), 'the closed hand task is still referenced, or its readings survive it');
  assert.ok(!/faceTask/.test(sh), 'turning hands off touches the face task');
  // and the camera closing still takes both
  const rel = src.slice(src.indexOf('function release()'), src.indexOf('// ---- the loop'));
  assert.ok(/handTask\.close\(\)/.test(rel) && /handTask = null;/.test(rel), 'camera off leaves the hand model resident');
});

ok('both tasks read ONE frame at ONE timestamp', () => {
  const tick = src.slice(src.indexOf('function tick('), src.indexOf('function readFace'));
  // Each task keeps its own monotonic check. Handing them different times for
  // the same decoded frame is a lie about when it was seen, and the second one
  // to run is the one that gets it wrong.
  assert.ok(/faceRes = faceTask\.detectForVideo\(video, stamp\)/.test(tick), 'the face no longer reads the shared stamp');
  assert.ok(/handRes = handTask\.detectForVideo\(video, stamp\)/.test(tick), 'the hand no longer reads the shared stamp');
  assert.equal((tick.match(/stamp = Math\.max/g) || []).length, 1, 'the stamp advances more than once per frame');
  // one throwing task must not take the other down with it
  assert.equal((tick.match(/catch \(e\) \{ blame\('(face|hand):detect'/g) || []).length, 2, 'a detect that throws is no longer caught per task');
  assert.ok(/if \(\(!faceTask && !handTask\) \|\| !video\) return;/.test(tick), 'the loop bails when only hands are on');
});

ok('a pinch is a ratio against a bone, never pixels', () => {
  // In raw pixels the threshold drifts as the person leans, which reads as the
  // pinch getting harder the further away you sit.
  const rh = src.slice(src.indexOf('function readHands('), src.indexOf('function dist('));
  assert.ok(/const span = dist\(lm\[SPAN_A\], lm\[SPAN_B\]\);/.test(rh), 'the in-hand reference span is gone');
  assert.ok(/dist\(lm\[PINCH_A\], lm\[PINCH_B\]\) \/ span/.test(rh), 'pinch is no longer normalised against it');
  assert.ok(/span > 1e-4/.test(rh), 'a degenerate hand would divide by zero');
  assert.ok(/const PINCH_A = 4, PINCH_B = 8;/.test(src), 'the pinch no longer measures thumb tip to index tip');
  assert.ok(/const SPAN_A = 0, SPAN_B = 5;/.test(src), 'the ruler is no longer wrist to index knuckle');
});

ok('mirroring is settled once, for the hand as for the head', () => {
  const rh = src.slice(src.indexOf('function readHands('), src.indexOf('function dist('));
  assert.ok(/p\[0\] = 1 - lm\[j\]\.x;/.test(rh), 'the hand points are not flipped into viewer space');
  assert.ok(/t\[0\] = 1 - lm\[TIPS\[j\]\]\.x;/.test(rh), 'the fingertips are not flipped into viewer space');
  // MediaPipe decides handedness ASSUMING a mirrored selfie view and is being
  // handed an unmirrored frame, so its label is the opposite of the truth.
  assert.ok(/categoryName === 'Left' \? 'Right' : 'Left'/.test(rh), 'handedness is not corrected for the unmirrored frame');
  assert.ok(/head\.x = -m\[12\];/.test(src), 'the head is no longer flipped — the two would disagree about which way is right');
});

ok('a hand that leaves is SAID to have left', () => {
  // Anything holding a drag needs an end event, and it can only send one if it
  // is told. Going quiet is how a drag gets stuck forever.
  const tick = src.slice(src.indexOf('function tick('), src.indexOf('function readFace'));
  assert.ok(/for \(const h of hands\) \{ h\.age = now - h\.seenAt; if \(h\.age > STALE_MS\) h\.ok = false; \}/.test(tick), 'hands never go stale — a consumer would hold a drag forever');
  const rh = src.slice(src.indexOf('function readHands('), src.indexOf('function dist('));
  assert.ok(/for \(let i = list\.length; i < hands\.length; i\+\+\) hands\[i\]\.ok = false;/.test(rh), 'a hand that disappeared between frames stays ok');
  // AND THAT LOOP HAS TO BE REACHED. Returning early on an empty landmark list
  // skips it, so ok stays true until it ages out: five beads and a skeleton
  // frozen mid-screen for half a second every time the hand leaves.
  assert.ok(/if \(!res\) return;/.test(rh), 'the early return is gone, or it still bails on a result that carries no hands');
  assert.ok(/const list = res\.landmarks \|\| \[\];/.test(rh), 'an empty result no longer reaches the cleanup loop');
  assert.ok(!/if \(!list \|\| !list\.length\) return;/.test(rh), 'the empty-list early return is back — the cursors will freeze for half a second on every exit');
});

ok('the skeleton is published, so the overlay draws what the machine sees', () => {
  assert.ok(/export const HAND_BONES = BONES;/.test(src), 'the topology is private — the overlay would have to guess it');
  assert.ok(/export const HAND_TIPS = TIPS;/.test(src), 'the fingertips are private');
  const bones = src.slice(src.indexOf('const BONES = ['), src.indexOf('export const HAND_BONES'));
  assert.equal((bones.match(/\[\d+, \d+\]/g) || []).length, 21, 'the hand no longer has 21 bones — 4 per digit plus the palm arch');
  assert.ok(/const TIPS = \[4, 8, 12, 16, 20\];/.test(src), 'the five fingertips are no longer the five fingertips');
});

console.log('\n' + passed + ' checks passed.\n');
