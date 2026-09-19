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
  assert.ok(/cost\.n >= \d+ && cost\.avg > SLOW_MS/.test(src), 'the rate no longer adapts to what inference actually costs');
  // MediaPipe falls back from GPU to CPU silently, so a stored 'delegate' is a
  // claim we cannot support. We record what we ASKED for.
  assert.ok(/let asked = null;/.test(src), 'the requested delegate is not recorded');
  assert.ok(!/delegate === 'CPU'/.test(src), 'something branches on a delegate we cannot actually determine');
});

ok('the first inference is paid during the load, not on the first live frame', () => {
  // Measured: 3,062 ms on the first detect, 6-8 ms on every one after. That
  // stall lands exactly when the user is checking whether the eye works.
  assert.ok(/async function warmUp\(\)/.test(src), 'the warm-up is gone — the first frame pays three seconds');
  assert.ok(/await warmUp\(\);/.test(src), 'the warm-up is defined but never awaited during the load');
  const ef = src.slice(src.indexOf('async function ensureFace()'), src.indexOf('async function warmUp()'));
  assert.ok(ef.indexOf('await warmUp()') > ef.indexOf('createFromOptions'), 'the warm-up does not run after the task is created');
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
  const toggle = main.slice(main.indexOf("$('chat-camera').addEventListener"), main.indexOf("$('chat-camera').addEventListener") + 900);
  assert.ok(/perceive\.sync\(\);/.test(toggle), 'the camera toggle does not tell the eye — it would wait up to 500ms to notice');
  assert.ok(/hullReport\('perceive:/.test(main), 'the eye does not report damage to the hull');
  // the importmap is how this house adds a library, and the CDN path IS the
  // version: @latest would re-download everything and change behaviour
  assert.ok(/"@mediapipe\/tasks-vision": "https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@1\.0\.1\//.test(html), 'tasks-vision is not pinned in the importmap');
  assert.ok(!/tasks-vision@latest/.test(html + src), 'a @latest pin would change under us');
});

console.log('\n' + passed + ' checks passed.\n');
