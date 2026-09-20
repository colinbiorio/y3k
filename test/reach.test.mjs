// THE REACH — the synthetic pointer bus. Run: node test/reach.test.mjs
//
// reach.js needs a DOM to exercise, so what is held here is every invariant the
// module promises that is visible in its source. They are not style points: an
// adversarial review of the first version found all of these as real defects,
// and each of them fails silently — the room stuck spinning, a button firing
// twice a second, two hands sharing one pointer.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const src = readFileSync(new URL('src/reach.js', ROOT), 'utf8');
const hv = readFileSync(new URL('src/handview.js', ROOT), 'utf8');
const main = readFileSync(new URL('src/main.js', ROOT), 'utf8');
const bodySrc = readFileSync(new URL('src/body.js', ROOT), 'utf8');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

console.log('\nthe reach:');

ok('a press always has an up, aimed at the window as well as the element', () => {
  // The orb ends its drag on a WINDOW-level pointerup. A cancel aimed at an
  // element never reaches it, so without this the room spins forever.
  const drop = src.slice(src.indexOf('function drop(p, why)'), src.indexOf('    // One call per acting finger per frame.'));
  assert.ok(/window\.dispatchEvent\(ev\('pointerup', p\)\)/.test(drop), 'a cancelled pointer never tells the window — the orb would stay stuck mid-spin');
  assert.ok(/pointercancel/.test(drop), 'the element is never told the press was abandoned');
  assert.ok(/sweep\(now\)/.test(src) && /now - p\.seen > LIVE_MS/.test(src), 'nothing cancels a pointer that simply stopped reporting');
  assert.ok(/clear\(\)/.test(src), 'there is no way to put everything up at once when a switch goes off');
});

ok('a swipe LETS GO when it leaves the surface it grabbed', () => {
  // The first version pressed on arrival and never released, so once a finger
  // had touched the room every button was permanently mid-drag and no hold
  // could ever complete. This is the one that made the feature unusable.
  const move = src.slice(src.indexOf('    move(key, x, y, now, mayGrab'), src.indexOf('    holdAt(key,'));
  // TWO WAYS A SURFACE DRAG ENDS, and they take the same exit on purpose:
  // leaving the words, and losing the posture that was allowed to grab them.
  // Routed through release() rather than by clearing p.swipe, because the
  // whole release machinery lives inside `if (p.swipe)` — clearing the flag
  // mid-drag drops the pointer into the `else` and it emits pointermove
  // forever, scrolling the chat until the liveness sweep finds it.
  assert.ok(/if \(!mayGrab \|\| !swipeAt\(el, x, y\)\) \{ release\(p, false\); enter\(p, el\); \}/.test(move),
    'a swipe press is never released on leaving, or on losing the posture — one finger walks through a door two fingers opened');
  // AND THE ONLY SURFACE LEFT IS THE PAST. The canvas fills the window, so
  // matching the element alone made the whole screen a place a moving hand
  // could take hold of — and anything taken hold of out there reached the
  // trackball and turned the body, which is not what the hand was doing. The
  // body is driven directly now, by every fingertip on it, so routing it
  // through the bus as well would turn it twice.
  assert.ok(/function swipeAt\(el, x, y\)/.test(src), 'the swipe surface is the whole canvas again');
  assert.ok(/if \(!onWords\) return false;/.test(src), 'with nothing to ask, the bus takes hold of the canvas anyway');
  assert.ok(/return !!onWords\(x, y\);/.test(src), 'the swipe surface no longer measures against the words');
  assert.ok(/onWords: \(x, y\) => history\.onWords\(x, y\)/.test(main), 'the bus is not asking the conversation where its words are');
  assert.ok(!/orbAt/.test(src), 'the bus is driving the body again — it would be turned twice');
  // and a drag that ends on a button must not press it
  assert.ok(/if \(click\) el\.dispatchEvent\(new MouseEvent\('click'/.test(src), 'the click is unconditional — a drag ending over a button would fire it');
});

ok('hold-to-press is off, and is one word from coming back', () => {
  // Both routes end in the same press, so with the hold on there is no way to
  // tell a jab from the half-second of hovering before it. It stands down
  // while the knock is judged — but it is not deleted, because it is the
  // fallback for when a jab cannot be seen (hand edge-on, poor light).
  assert.ok(/const DWELL_DEFAULT = false;/.test(src), 'hold-to-press is back on by default — the pinch cannot be told from a hover');
  const move = src.slice(src.indexOf('    move(key, x, y, now, mayGrab'), src.indexOf('    // A PINCH, HELD.'));
  assert.ok(/if \(!dwellOn\) \{ p\.dwell = 0; return p; \}/.test(move), 'the dwell gate is gone');
  assert.ok(/dwell\(on\) \{/.test(src), 'there is no way to put the hold back without a deploy');
  assert.ok(/for \(const p of live\.values\(\)\) \{ p\.dwellFrom = 0/.test(src), 'flipping the switch mid-hold could fire a press on the way in');
  // and the whole hold is still here, still correct, for when it comes back
  assert.ok(/p\.dwell = Math\.min\(1, \(now - p\.dwellFrom\) \/ DWELL_MS\)/.test(move), 'the hold has been deleted rather than switched off');
  assert.ok(/if \(p\.fired\) \{ p\.dwell = 0; return p; \}/.test(move), 'a held finger would re-fire the button for as long as it is held');
  assert.ok(/p\.fired = true; p\.dwell = 0;/.test(move), 'the latch is never set');
  assert.ok(/> DWELL_SLOP\) \{ p\.dwellFrom = 0; p\.fired = false; \}/.test(move), 'the latch never clears — one press per target, forever');
  assert.ok(/p\.fired = false;/.test(src.slice(src.indexOf('function enter('), src.indexOf('function press('))), 'moving to a new target does not clear the latch');
});

ok('there is ONE press gesture, and it is the pinch', () => {
  // Two attempts at a second one have now been retired. The air tap measured
  // the fingertip's travel from its knuckle and could not be told from a wag —
  // swinging a straight finger moves the tip exactly as far as curling it. The
  // scrunch fixed that by measuring the bend instead, and fired accurately, but
  // the CURSOR still dived on the way in: a gesture made by the finger that is
  // also aiming cannot help but spoil the aim. A pinch is made by the thumb.
  assert.ok(!/^    tap\(key, x, y, now\) \{/m.test(src), 'the retired tap is still here, uncalled');
  assert.ok(!/export (const|function) (KNOCK|SCRUNCH|createKnock|createScrunch)\b/.test(src),
    'a retired detector is still exported');
  // and the one that stayed is whole: press, drag, and a click only if it
  // barely moved.
  const hold = src.slice(src.indexOf('    holdAt(key, x, y, now, mayGrab'), src.indexOf('    letGo(key)'));
  assert.ok(/press\(p\);/.test(hold), 'the pinch does not press');
  // THE PINCH WAS A SECOND DOOR INTO THE CHAT SCROLL, and a more eager one:
  // holdAt has no speed gate, so where a swipe must clear GRAB_PX_S first this
  // pressed on the very first frame — one index finger plus a pinch, anywhere
  // over a line, and the conversation moved.
  assert.ok(/if \(!mayGrab && swipeAt\(el, x, y\)\) return false;/.test(hold),
    'a pinch can still drag the conversation without the posture');
  assert.ok(/p\.from = \[x, y\];/.test(hold), 'nothing records where the press started, so a drag would fire a click at the end');
  assert.ok(/p\.refused = !!el\?\.closest\?\.\(REFUSED\)/.test(src), 'a held pinch can press the microphone, which would light up and do nothing');
});

ok('every pointer has its own id, for as long as it lives', () => {
  // Minting from live.size hands a new arrival the id a survivor is still
  // using, and the browser treats one id as one finger: the second hand
  // teleports into the first hand's drag.
  assert.ok(/let nextId = 0;/.test(src), 'the id counter is gone');
  assert.ok(/id: ID_BASE \+ \(nextId\+\+\)/.test(src), 'ids are derived from the live count again — two pointers will collide');
  assert.ok(!/ID_BASE \+ live\.size/.test(src), 'the colliding allocation is back');
});

ok('a hand is named by which hand it is, never by where it sits in a list', () => {
  // MediaPipe's result order is not an identity. Keyed by position, a hand
  // leaving hands its live press to the one still on screen.
  assert.ok(/const keyOf = \(hand, i\) => 'hand:' \+ \(hand\.handedness \|\| 'i' \+ i\)/.test(hv), 'pointers are keyed by list position again');
  assert.ok(!/reach\.(move|end)\('hand' \+ hand/.test(hv), 'a positional key is back');
  // and a pointer that stops being driven ends at once, rather than waiting
  // out the liveness timeout with the room still spinning
  assert.ok(/for \(const key of drove\) if \(!now_drove\.has\(key\)\) reach\.end\(key\);/.test(hv), 'a hand that leaves the frame entirely leaves its pointer to time out');
});

ok('what a hand may not press, it may not press', () => {
  // A synthetic press cannot satisfy user activation, so these would light up
  // and do nothing — worse than being unpressable.
  assert.ok(/const REFUSED = /.test(src), 'the refusal list is gone');
  for (const sel of ['#chat-voice', '#chat-camera']) assert.ok(src.includes(sel), `${sel} can be pressed by a hand, and would silently fail`);
  const move = src.slice(src.indexOf('    move(key, x, y, now, mayGrab'), src.indexOf('    holdAt(key,'));
  assert.ok(/if \(p\.refused\) \{ p\.dwell = 0; return p; \}/.test(move), 'a refused control still accumulates a hold');
  assert.ok(/pointerType: 'pen'/.test(src), "the events claim to be touch or mouse — 'pen' is what keeps them out of the phone layout");
});

ok('the camera opens once, and the lens always says it is open', () => {
  // Two switches flipped quickly both saw the camera off and both called
  // getUserMedia: the second replaced the video source and the first was
  // orphaned, holding the device with nothing able to stop it.
  assert.ok(/let opening = null;/.test(main), 'the in-flight guard is gone — two switches can open two streams');
  assert.ok(/opening = opening \|\| camera\.on\(\);/.test(main), 'a second opener starts its own stream rather than waiting');
  assert.ok(/if \(!camOwners\.size\) \{ camera\.off\(\)/.test(main), 'a camera nobody wants any more stays open after a slow prompt');
  // the on-air mark follows the DEVICE, not the intent
  assert.ok(/classList\.toggle\('cam-live', on\)/.test(main), 'the on-air mark no longer follows the lens — it can be open with nothing saying so');
  // and the view switch holds its own lease, or it shows a black rectangle
  assert.ok(/if \(camViewWanted\) wantCam\('view'\);/.test(main), 'the camera-view switch does not hold the camera open on its own');
});

ok('presence is not a grip: movement takes hold, stillness lets go', () => {
  // A hand resting over the room must not be holding it. That is what made the
  // cursor feel stuck to everything it crossed, and it is why the orb could
  // never be flicked and left spinning — it was never released while moving.
  assert.ok(/const GRAB_PX_S = \d+;/.test(src), 'the speed that takes hold is gone');
  assert.ok(/const STILL_PX_S = \d+;/.test(src) && /const STILL_MS = \d+;/.test(src), 'the stillness release is gone');
  const move = src.slice(src.indexOf('    move(key, x, y, now, mayGrab'), src.indexOf('    holdAt(key,'));
  assert.ok(/if \(p\.speed >= GRAB_PX_S\) \{ press\(p\);/.test(move), 'a swipe surface presses on arrival again — resting a hand on the room would grip it');
  assert.ok(/if \(p\.speed < STILL_PX_S\)/.test(move), 'a drag never ends when the hand stops');
  assert.ok(/now - p\.stillFrom >= STILL_MS\) \{ release\(p, false\);/.test(move), 'the stillness timer never releases');
  // the speed itself has to be smoothed, or one jittery frame reads as a flick
  assert.ok(/p\.speed = p\.seen \? p\.speed \+ \(inst - p\.speed\) \* 0\.\d+ : 0;/.test(move), 'the speed is unsmoothed — a single jittery frame would look like a flick');
  // hysteresis: taking hold must need more speed than letting go, or it chatters
  const grab = +src.match(/const GRAB_PX_S = (\d+);/)[1];
  const still = +src.match(/const STILL_PX_S = (\d+);/)[1];
  assert.ok(grab > still, 'the grab and release speeds have no gap between them — the grip would chatter on and off');
});

ok('the orb is the orb, and the conversation is only its words', () => {
  const hist = readFileSync(new URL('src/history.js', ROOT), 'utf8');
  // The corridor around the orb was sized for a thumb on a phone. For a pointer
  // it quietly gave a large empty region to the conversation, so a hand
  // crossing it started scrolling instead of doing what it was doing.
  assert.ok(/const onWords = \(x, y\) =>/.test(hist), 'the words test is gone');
  assert.ok(/for \(const line of el\.querySelectorAll\('\.hl'\)\)/.test(hist), 'the words test no longer measures the lines themselves');
  const down = hist.slice(hist.indexOf("window.addEventListener('pointerdown'"), hist.indexOf("window.addEventListener('pointermove'"));
  assert.ok(/if \(!onWords\(e\.clientX, e\.clientY\)\) return;/.test(down), 'a drag anywhere in the corridor scrolls the past again');
  assert.ok(!/inColumn\(e\.clientX, e\.clientY, r\)/.test(down), 'the corridor is back on the drag');
  // the orb's own disc still belongs to the trackball, first
  assert.ok(/< r \* 1\.05\) return;/.test(down), "the orb's disc no longer belongs to the trackball");
  // and the wheel keeps the corridor: it is aimed by a cursor already on screen
  const wheel = hist.slice(hist.indexOf("window.addEventListener('wheel'"), hist.indexOf("window.addEventListener('wheel'") + 400);
  assert.ok(/inColumn\(e\.clientX, e\.clientY, R\(\)\)/.test(wheel), 'the wheel lost the corridor too — scrolling near the column is what a wheel is for');
  // the conversation is not a swipe surface for the bus: it is pointer-events
  // none, and history.js arbitrates in the capture phase instead
  assert.ok(!/#chat-history/.test(src.slice(src.indexOf('const SWIPE'), src.indexOf('const SWIPE') + 200)), 'the conversation is a swipe surface again, which it cannot be');
});

ok('a pinch is a press that is HELD, so the draggable things answer it', () => {
  const hv = readFileSync(new URL('src/handview.js', ROOT), 'utf8');
  // Half the things worth pointing at are dragged rather than clicked — the
  // budget slider, the wordmark's spin, the four collapse arrows. A press that
  // stays down until the fingers open answers all of those the way a mouse
  // does, and a press-and-release in one place still makes the click a plain
  // button wants, so one gesture covers both.
  assert.ok(/holdAt\(key, x, y, now, mayGrab = false\) \{/.test(src), 'the held press is gone');
  assert.ok(/letGo\(key\) \{/.test(src), 'nothing ends a held press');
  const hold = src.slice(src.indexOf('    holdAt(key, x, y, now, mayGrab'), src.indexOf('    letGo(key)'));
  assert.ok(/p\.swipe = false;/.test(hold), 'a held pinch is treated as a surface drag, so leaving the surface would drop it');
  assert.ok(/p\.from = \[x, y\];/.test(hold), 'nothing records where the press started, so a drag would fire a click at the end');
  assert.ok(/release\(p, moved < 12\);/.test(src), 'a pinch dragged across a slider still fires a click at whatever it finished over');
  assert.ok(/p\.refused = !!el\?\.closest\?\.\(REFUSED\)/.test(src), 'a held pinch can press the microphone, which would light up and do nothing');
  // and the view drives it: press once, then drag by how far the HAND moved
  assert.ok(/reach\.holdAt\(key, a\[0\], a\[1\], now, mayScroll\)/.test(hv), 'the view no longer presses at the aim');
  assert.ok(/g\.aim\[0\] \+ \(pt\[0\] - g\.grip\[0\]\)/.test(hv), 'the drag does not follow the hand — it would jump to the point between two closing fingers');
  assert.ok(/reach\.letGo\(keyOf\(h, hand\)\)/.test(hv), 'opening the fingers does not end the press');
  assert.ok(/!shaping && !holding\[hand\]/.test(hv), 'the raw fingertip drives the same pointer as the held press — they would fight');
});

ok('the press lands where the finger was AIMING, not where the pinch took it', () => {
  const hv = readFileSync(new URL('src/handview.js', ROOT), 'utf8');
  // CLOSING A PINCH PULLS THE INDEX TOWARD THE THUMB, so a press sent at the
  // instant it closes lands below the thing that was being pointed at. It goes
  // where the finger WAS instead. (This is also what finally retired the
  // scrunch: it moved the aiming finger even further, and no amount of
  // placing the press correctly fixes a cursor that dives while you aim.)
  assert.ok(/a\.push\(\[now, x, y\]\);/.test(hv), 'nothing records where the finger was aiming');

  assert.ok(/function aimOf\(hand, now\)/.test(hv), 'the aim is no longer remembered');
  const back = +hv.match(/const AIM_BACK_MS = (\d+);/)[1];
  assert.ok(back >= 200, `the aim only reaches back ${back}ms — it would land mid-gesture`);
  const keep = +hv.match(/now - a\[0\]\[0\] > (\d+)\) a\.shift\(\)/)[1];
  assert.ok(keep >= back * 2, `the aim is forgotten after ${keep}ms but is asked for ${back}ms back`);

  // THE PINCH KNOWS ITS OWN MOMENT, so it does not use the flat look-back as
  // anything but a fallback. A fixed 260ms is only right if the hand was
  // STILL; reaching for a button and pinching as you arrive sent the press to
  // wherever you were a quarter of a second earlier, which on anything small
  // is a miss — and was most of why pinch-to-click "barely worked".
  assert.ok(/if \(h\.pinch >= PINCH_OFF\) openAt\[hand\] = now;/.test(hv),
    'nothing records when the fingers were last open');
  assert.ok(/function aimAt\(hand, t\)/.test(hv), 'there is no way to ask where the finger was at a moment');
  assert.ok(/const a = aimAt\(hand, openAt\[hand\]\) \|\| aimOf\(hand, now\) \|\| here\[hand\]\[act\];/.test(hv),
    'the pinch no longer lands where it was aimed when it began closing');

  // A PRESS THAT FOUND NOTHING MUST NOT LATCH. It used to set
  // holding = { aim: null } — truthy — so the hand was marked as holding
  // something it had failed to take, the drag branch did nothing every frame
  // after, and holdAt was never tried again. One miss and the pinch was dead
  // until the hand opened all the way past PINCH_OFF.
  assert.ok(!/\} else \{ holding\[hand\] = \{ aim: null/.test(hv),
    'a failed press latches the hand into holding nothing — one miss kills the gesture');
});

console.log('\n' + passed + ' checks passed.\n');
