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
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    holdAt(key,'));
  // TWO WAYS A SURFACE DRAG ENDS, and they take the same exit on purpose:
  // leaving the words, and losing the posture that was allowed to grab them.
  // Routed through release() rather than by clearing p.swipe, because the
  // whole release machinery lives inside `if (p.swipe)` — clearing the flag
  // mid-drag drops the pointer into the `else` and it emits pointermove
  // forever, scrolling the chat until the liveness sweep finds it.
  assert.ok(/if \(fingers !== 2 \|\| !swipeAt\(el, x, y\)\) \{ release\(p, false\); enter\(p, el\); \}/.test(move),
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

ok('hold-to-press is ON, and is the one that cannot misfire', () => {
  // Both routes end in the same press, so with the hold on there is no way to
  // tell a jab from the half-second of hovering before it. It stands down
  // while the knock is judged — but it is not deleted, because it is the
  // fallback for when a jab cannot be seen (hand edge-on, poor light).
  // It was off so the AIR TAP could be judged against it — with both live
  // there is no telling a jab from the half-second of hovering before it. The
  // air tap has been retired twice since, and the reason for the switch
  // stopped existing. It recognises no posture, so there is no posture to get
  // wrong, which is the whole reason it is the reliable one.
  assert.ok(/const DWELL_DEFAULT = true;/.test(src), 'hold-to-press is off again — the only press that cannot misfire');
  assert.ok(/dwell\(on\) \{/.test(src), 'there is no way to turn it off without a deploy');
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    // A PINCH, HELD.'));
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
  const hold = src.slice(src.indexOf('    holdAt(key, x, y, now, fingers'), src.indexOf('    letGo(key)'));
  assert.ok(/press\(p\);/.test(hold), 'the pinch does not press');
  // THE PINCH WAS A SECOND DOOR INTO THE CHAT SCROLL, and a more eager one:
  // holdAt has no speed gate, so where a swipe must clear GRAB_PX_S first this
  // pressed on the very first frame — one index finger plus a pinch, anywhere
  // over a line, and the conversation moved.
  assert.ok(/if \(fingers !== 2 && swipeAt\(el, x, y\)\) return false;/.test(hold),
    'a pinch can still drag the conversation without the posture');
  assert.ok(/p\.from = \[x, y\];/.test(hold), 'nothing records where the press started, so a drag would fire a click at the end');
  assert.ok(/p\.refused = refusedEl\(el\);/.test(src), 'a held pinch can press a file picker, which would light up and do nothing');
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
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    holdAt(key,'));
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
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    holdAt(key,'));
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

ok('a contact is a press that is HELD, so the draggable things answer it', () => {
  // Half the things worth pointing at are dragged rather than clicked — the
  // budget slider, the wordmark's spin, the four collapse arrows, a window and
  // its edges. A press that stays down until the fingers open answers all of
  // those the way a mouse does, and a contact made and released without moving
  // still makes the click a plain button wants, so one gesture covers both.
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    holdAt(key,'));
  assert.ok(move.length > 400, 'the move() slice is empty — this whole check would pass on nothing');
  assert.ok(/if \(merged && drags\(el\)\) \{/.test(move), 'a contact no longer takes hold of anything');
  assert.ok(/p\.grip = true; p\.from = \[x, y\];/.test(move), 'nothing marks the press as a held contact, or records where it began');
  // AND IT LASTS AS LONG AS THE CONTACT. Colin, twice: "it just spins it once
  // on merge, as if it were a click." A press that ends on the frame it began
  // cannot carry the wordmark, an arrow, or a window.
  assert.ok(/\} else if \(p\.grip\) \{/.test(move), 'the held branch is gone — a contact drag has no way to continue');
  assert.ok(/if \(merged\) return p;/.test(move), 'the held press is released while the fingers are still together');
  assert.ok(/release\(p, went < 12\);/.test(move), 'opening the fingers never releases, or never clicks a contact that did not travel');
  assert.ok(/p\.grip = false; p\.from = null;/.test(move), 'the grip latch is never cleared — the next press would be released on arrival');
});

ok('a contact is two fingertips TOUCHING, and any two will do', () => {
  const mg = readFileSync(new URL('src/merge.js', ROOT), 'utf8');
  // THE THREE WRONG ANSWERS, each held here so none of them can come back.
  //
  // 1. thumb-and-index at 0.42 of the hand's span. The span is wrist to index
  //    knuckle, ~9cm, so that called them touching with 3.8cm of daylight —
  //    which is where a hand SITS. Colin: "pointer and thumb merge really
  //    easily, when they're not even touching."
  const on = +mg.match(/export const MERGE_ON = ([\d.]+)/)[1];
  const off = +mg.match(/export const MERGE_OFF = ([\d.]+)/)[1];
  assert.ok(on <= 0.28, `a contact at ${on} spans ${(on * 9).toFixed(1)}cm — that is a resting hand, not a touch`);
  assert.ok(off > on, 'there is no hysteresis — the contact would chatter on the line at 24Hz');
  // 2. "two fingers up", with no distance measured at all. A peace sign is not
  //    a contact, and that version merged it.
  assert.ok(/const ratio = hyp\(A\.x, A\.y, B\.x, B\.y\) \/ ruler;/.test(mg), 'nothing measures the gap — holding two fingers apart would merge them');
  assert.ok(/if \(ratio >= \(was && was\.has\(key\) \? off : on\)\) continue;/.test(mg), 'the threshold is not applied, or has no hysteresis');
  // 3. one privileged pair. EVERY pair is measured, which is what makes a
  //    thumb-to-index pinch and two fingers pressed together one gesture.
  assert.ok(/for \(let a = 0; a < tips\.length; a\+\+\) \{\n    for \(let b = a \+ 1; b < tips\.length; b\+\+\) \{/.test(mg),
    'only some pairs are measured — two fingers side by side would never merge');
  // ACROSS BOTH HANDS, by name. Colin asked for it: "even across hands."
  assert.ok(/cross: A\.hand !== B\.hand/.test(mg), 'a contact cannot span two hands');
  assert.ok(/const contactKey = \(list, m\) => \(m\.cross \? 'hand:contact' : keyOf\(list\[m\.a\.hand\], m\.a\.hand\)\);/.test(hv),
    'a cross-hand contact has no pointer of its own — it would steal one hand\'s');
  // WHAT MAY PAIR WITH WHAT, all three rules in one function. A fist offers no
  // partner at all; a curled finger's only legal partner is the thumb — which
  // is what lets THE RING be made, since making one curls the index past the
  // extension threshold; and two fingertips may only meet when neither hand is
  // flat open, so the halt cannot press.
  assert.ok(/function allowed\(A, B\) \{/.test(mg), 'nothing says which pairs are even a gesture');
  assert.ok(/if \(!out\) continue;/.test(mg), 'a fist offers candidates — every tip in one is within a centimetre of every other');
  assert.ok(/if \(A\.kind === 'in' \|\| B\.kind === 'in'\) return false;/.test(mg), 'a curled finger can pair with another finger — a fist would merge');
  assert.ok(/return other\.tip === INDEX;/.test(mg),
    'a thumb cannot reach a curled index — the ring, which curls it by 45 degrees, could not be made');
  assert.ok(/if \(other\.kind === 'out'\) return true;/.test(mg), 'a thumb cannot reach an extended fingertip — an ordinary pinch');
  assert.ok(/if \(A\.kind === 'thumb' && B\.kind === 'thumb'\) return false;/.test(mg), 'two thumbs are a gesture');
  assert.ok(/return !A\.open && !B\.open;/.test(mg), 'two fingertips on a flat open hand are a contact — the halt would press');
  // AND EACH FINGERTIP IS SPENT ONCE. Three fingers bunched are three pairs
  // under the threshold and one contact.
  assert.ok(/found\.sort\(\(p, q\) => p\.ratio - q\.ratio\);/.test(mg), 'the pairs are not ranked — the looser one could win');
  assert.ok(/if \(spent\.has\(m\.a\.name\) \|\| spent\.has\(m\.b\.name\)\) continue;/.test(mg), 'one fingertip can be in two contacts at once');
  // Keyed by handedness, never by slot — the same trap as every other latch.
  assert.ok(/const nameOf = \(h, hand, tip\) => \(h\.handedness \|\| 'i' \+ hand\) \+ ':' \+ tip;/.test(mg),
    'contacts are named by list position — a hand leaving would carry its state onto the other');
});

ok('the press lands at the bubble, because the bubble is the aim', () => {
  // There is nothing left to estimate. Two fingertips become one mark and that
  // mark is what presses — so the thing you can see IS the thing that acts.
  const loop = hv.slice(hv.indexOf('    // ---- THE CONTACTS, DRIVEN'), hv.indexOf('    body?.halt?.(halting);'));
  assert.ok(loop.length > 400, 'the contacts loop is empty — this whole check would pass on nothing');
  assert.ok(/const at = screenOf\(ta, tb, W, H, gain\);/.test(loop), 'the bubble is not placed between the two touching tips');
  // placed, not written: every mark's transform lands in one pass at the end of
  // the frame (flushMoves), after the frame's hit tests — the same point, later
  assert.ok(/place\(bub, at\[0\], at\[1\]\);/.test(loop), 'the bubble is not drawn at the press point');
  assert.ok(/reach\.move\(key, at\[0\], at\[1\], now, up, true\)/.test(loop), 'the press does not land at the bubble, or does not claim to be a contact');
  // ONE expression for the mark and for the press. If these ever came from
  // different places the mark would be a lie about where you are clicking.
  assert.equal((hv.match(/screenOf\(ta, tb, W, H, gain\)/g) || []).length, 1,
    'the press point and the bubble are computed separately — the mark would lie');
  // A PINCH DOES NOT SCROLL. It is the thumb and one finger, which is one
  // finger held up; the back door the old pinch had into the conversation
  // stays shut because the count handed over is the honest one.
  assert.ok(/const up = m\.cross \? 2 : fingersUp\(ha\);/.test(loop), 'a contact claims two fingers however it was made — a pinch would scroll the past');
  // ...and neither fingertip is still drawn beside the bubble it became.
  assert.ok(/!spentTip\[hand\]\[i\]/.test(hv), 'both fingers are still drawn next to the bubble they became');
  // The hand that made it stands down: one pointer, not two fighting.
  assert.ok(/!shaping && !inContact\[hand\]/.test(hv), 'a lone fingertip drives the same pointer as the contact — they would fight');
});

ok('the body is held by a CONTACT, never by an open palm', () => {
  // Colin's question, and it was exactly this line: the gate asked how many
  // fingers were UP. One finger over the body correctly refused to dwell, and
  // then an open palm — four fingers out, aiming at nothing — satisfied it and
  // pressed. A count is a shape a hand HAS; a contact is a thing you DID.
  assert.ok(/const TWO_TO_PRESS = /.test(src), 'nothing asks for a contact');
  for (const sel of ['#stage', 'canvas.orb', '#home-brand']) {
    assert.ok(src.slice(src.indexOf('const TWO_TO_PRESS')).slice(0, 200).includes(sel), `${sel} can be pressed by one finger`);
  }
  assert.ok(/if \(!merged && two\(el, TWO_TO_PRESS\)\) \{ p\.dwell = 0; return p; \}/.test(src),
    'the hold asks for a finger COUNT again — an open palm over the body will press it');
  assert.ok(!/fingers < 2 && two\(el, TWO_TO_PRESS\)/.test(src), 'the counting gate is back');
  // ...and the contact on the body is a HOLD, not an instant click. Colin:
  // "'merge on orb = click' was wrong." It dwells like everything else, so it
  // can be aimed, watched filling, and abandoned.
  assert.ok(!/const DRAGGABLE[^\n]*canvas\.orb/.test(src), 'the body is draggable, so a contact on it would press instantly instead of holding');
  assert.ok(!/const NO_DWELL[^\n]*#stage/.test(src), 'the body refuses the hold, so a contact on it can never open anything');
});

ok('some things are taken hold of rather than clicked at', () => {
  // The mark you spin, a slider, a window and its edges. A dwell-click fires at
  // a moment you did not choose and then lets go, when what you wanted was to
  // take hold.
  assert.ok(/const DRAGGABLE = /.test(src) && /const NO_DWELL = /.test(src), 'nothing is marked as draggable');
  const drag = src.match(/const DRAGGABLE = '([^']+)'/)[1];
  const nodwell = src.match(/const NO_DWELL = '([^']+)'/)[1];
  for (const sel of ['#home-brand', 'nav-collapse', 'input[type=range]', '.mind-win', '.win-edge']) {
    assert.ok(drag.includes(sel), `${sel} cannot be dragged by a contact`);
  }
  for (const sel of ['#home-brand', 'input[type=range]', '.mind-win', '.win-edge']) {
    assert.ok(nodwell.includes(sel), `${sel} is still dwell-clicked`);
  }
  // THE COLLAPSE ARROWS KEEP THEIR TAP. Colin asked for hold-to-click back on
  // them by name — their tap is a real command, and only their DRAG had to be
  // asked for.
  assert.ok(!nodwell.includes('nav-collapse'), 'the collapse arrows refuse the hold again — their tap is a real command');
  assert.ok(/if \(noDwell\(el\)\) \{ p\.dwell = 0; return p; \}/.test(src), 'the hold-to-press still fires on things that are meant to be dragged');
  // ...and inside a window, the three lights beat the window. Both selectors
  // match with closest(), so the ORDER they are asked in is the whole policy.
  assert.ok(/const drags = \(el\) => two\(el, DRAGGABLE\) && !two\(el, PRESSABLE\);/.test(src), 'a window light is dragged rather than pressed');
  assert.ok(/const noDwell = \(el\) => two\(el, NO_DWELL\) && !two\(el, PRESSABLE\);/.test(src), 'a window light cannot be held — nothing inside a window could be pressed at all');
  for (const sel of ['.win-light', '.win-min']) {
    assert.ok(src.match(/const PRESSABLE = '([^']+)'/)[1].includes(sel), `${sel} is unpressable by a hand`);
  }
});

ok('a tap and a drag on one control are different asks', () => {
  // The collapse arrows are both: tap folds every bar, drag folds the one you
  // are on. A hand cannot hold still, so every press was a small drag.
  assert.ok(/const TWO_TO_DRAG = /.test(src), 'nothing distinguishes a tap from a drag');
  assert.ok(/if \(!merged && two\(p\.target, TWO_TO_DRAG\)\) \{ p\.x = p\.from \? p\.from\[0\] : p\.x; p\.y = p\.from \? p\.from\[1\] : p\.y; \}/.test(src),
    'a lone finger still drags the arrows');
  // held WHERE IT PRESSED, not refused: the click must still land.
  const at = src.indexOf('TWO_TO_DRAG)) { p.x =');
  assert.ok(at > 0, 'the freeze is gone entirely');
  assert.ok(src.slice(at, at + 200).includes('p.from'), 'it freezes at the wrong point — the click would land where the hand drifted to');
});

ok('settings opens to a hand again, and the mic still cannot be faked', () => {
  // #nav-settings calls settings.open(), which draws a panel. There is no
  // permission in it and nothing to activate: the refusal was guilt by
  // association with the camera controls INSIDE the panel, and those are still
  // refused by their own names.
  const refused = src.match(/const REFUSED = '([^']+)'/)[1];
  assert.ok(!refused.includes('#nav-settings'), 'settings is refused again, for a reason that was never true of it');
  // 2026-10-19 (Colin: "let hand tracking hit all the buttons — eg mic"): the
  // file picker is refused always; the mic, camera and voice once the page has
  // been touched, which hand tracking guarantees.
  assert.ok(refused.includes('#chat-upload') && refused.includes('input[type=file]'), 'a hand can open a file picker, which needs a fresh click');
  const once = src.match(/const ONCE_TOUCHED = '([^']+)'/)[1];
  for (const sel of ['#chat-voice', '#chat-camera', '#chat-air', '.cv-mic']) assert.ok(once.includes(sel) && !refused.includes(sel), `${sel} is not pressable by a hand once the page has been touched`);
  assert.ok(/hasBeenActive === true/.test(src), 'the pressability does not follow the page\'s sticky activation');
});

ok('a hold on a field opens the microphone, and only a hand can do it', () => {
  // A hand in the air has no keyboard. The same six-tenths hold that presses a
  // button, landing on something you would type into, offers the other way in.
  assert.ok(/const TEXT_FIELD = /.test(src), 'nothing recognises a field');
  const field = src.match(/const TEXT_FIELD = '([^']+)'/)[1];
  for (const sel of ['input[type=search]', 'textarea']) {
    assert.ok(field.includes(sel), `${sel} does not open the mic — the search box and the chat bar are exactly these`);
  }
  // fired AFTER the click, so the field is focused and grown first...
  const fire = src.slice(src.indexOf('      if (p.dwell >= 1) {'), src.indexOf('      return p;\n    },'));
  assert.ok(fire.length > 100, 'the dwell-fire slice is empty — this check would pass on nothing');
  assert.ok(fire.indexOf('release(p, true);') < fire.indexOf('onMic'), 'the mic opens before the click — the field would not be focused yet');
  // ...and it is aimed at WHAT THE PRESS LANDED ON, captured before the release
  // rather than read back off the pointer afterwards.
  assert.ok(/const hit = p\.target;/.test(fire), 'nothing captures what the press landed on');
  assert.ok(/if \(onMic && hit\?\.closest\?\.\(TEXT_FIELD\)\)/.test(fire),
    'the mic is aimed by reading the pointer back after the release, not by the target the press landed on');
  assert.ok(/try \{ onMic\(hit\); \} catch/.test(fire), 'a throwing mic takes the whole pointer bus down with it');
  // ...and it is handed in, never reached for: this file does not own the mic.
  assert.ok(/createReach\(\{ onWords = null, onMic = null \} = \{\}\)/.test(src), 'the bus reaches for the microphone itself');
  // 2026-10-06: a hold on y3kode's composer is Code's microphone (the
  // dictation lease), not the room's; everywhere else it is the voice toggle.
  assert.ok(/onMic: \(hit\) => \{[\s\S]{0,260}?closest\?\.\('\.cv-input, \.cv-planinput'\)\) \{ window\.dispatchEvent\(new CustomEvent\('y3k:code-mic'\)\); return; \}[\s\S]{0,120}?try \{ voice\?\.toggle\?\.\(\); \} catch/.test(main), 'nothing wires the hold to the voice');
  assert.ok(/\.cv-mic/.test(src.match(/const ONCE_TOUCHED = '([^']+)'/)[1]), 'Code\'s microphone button is not pressable by a hand once the page has been touched');
});

ok('a mark may reach a little for a small control, and never for a big one', () => {
  // Colin: "it's hard to keep your finger ultimately still." The window lights
  // are 14px. Widening the point GLOBALLY would be worse than not doing it —
  // every large surface would pull the mark off what it was on.
  assert.ok(/const SNAP_R = (\d+);/.test(src), 'the reach is gone');
  const R = +src.match(/const SNAP_R = (\d+);/)[1];
  const MAX = +src.match(/const SNAP_MAX = (\d+);/)[1];
  assert.ok(R > 0 && R <= 20, `a reach of ${R}px is not "just a little bit"`);
  assert.ok(MAX >= 20 && MAX < 120, 'the smallness test admits whole panels, or no real control');
  assert.ok(/if \(!direct \|\| small\(direct\)\) return direct;/.test(src), 'a mark already ON a control is dragged off it by the reach');
  // THE LIGHTS: 14px wide, 7px apart, so 21px centre to centre. No radius can
  // stop a point in that gap from being within reach of both — the middle of it
  // is 3.5px from each. NEAREST is what decides, and it decides outright.
  assert.ok(/if \(near < bestD\) \{ bestD = near; best = el; \}/.test(src), 'the nearest control does not win — two lights could answer one point');
  assert.ok(/Math\.hypot\(Math\.max\(r\.left - x, 0, x - r\.right\), Math\.max\(r\.top - y, 0, y - r\.bottom\)\)/.test(src),
    'the ranking measures to the centre — a wide control would lose to a round one beside it');
  // 2026-10-31: finding nothing, the rails are asked (a hand in a rail is on
  // its nearest glyph — the test below); finding nothing there leaves the
  // honest answer untouched.
  assert.ok(/return best \|\| railGlyph\(x, y\) \|\| direct;/.test(src), 'finding nothing changes the answer');
  // and it is not re-run while the mark is still, which is the DWELL
  assert.ok(/p\.snapTo\?\.isConnected/.test(src), 'a remembered target that has left the page is still answered with');
});

ok('two fingers drag a pane, because a synthetic pointer cannot scroll one', () => {
  // overflow:auto is scrolled by the BROWSER, not by a listener, so a
  // synthesised pointer moves nothing at all. The discover wall is #home.
  assert.ok(/function scrollerAt\(el\)/.test(src), 'nothing finds the pane under the mark');
  assert.ok(/if \(o === 'auto' \|\| o === 'scroll'\) return n;/.test(src), 'the pane test does not read overflow');
  assert.ok(/if \(n\.scrollHeight - n\.clientHeight < 8\) continue;/.test(src), 'a pane with nothing to scroll is taken anyway, and swallows the hold');
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    holdAt(key,'));
  assert.ok(/const pane = fingers === 2 \? paneFor\(p, el, x, y\) : null;/.test(move), 'one finger scrolls a pane — nothing could ever be pressed inside one');
  assert.ok(/pane\.scrollTop -= \(y - p\.scrollAt\[1\]\);/.test(move), 'the pane never actually moves');
  // HELD ONCE FOUND. Scrolling moves what is under the point, so re-asking
  // every frame walks the tree against a target that is sliding past.
  assert.ok(/const held = p\.pane;/.test(src), 'the pane is re-found every frame, against a target that is moving');
  assert.ok(/p\.pane = null; p\.scrollAt = null;/.test(move), 'the pane is never let go of — it would keep scrolling after the posture ended');
  // and the room's own words win, because that is where this gesture was learned
  assert.ok(move.indexOf('if (onSurface) { p.dwell = 0; return p; }') < move.indexOf('const pane = fingers === 2'),
    'a pane can take the conversation\'s scroll away from it');
});

ok('a popup stops the body it is drawn over', () => {
  // The push and the pinch are pure geometry — how far a fingertip is from the
  // orb's centre in pixels — which knows nothing about what has been opened on
  // top of it. A hand reading a memory was turning the body behind the window.
  assert.ok(/const clearAbove = \(px, py\) => \{/.test(hv), 'nothing asks what is actually on top');
  assert.ok(/return !!el && !!el\.closest\?\.\('#stage, canvas\.orb'\);/.test(hv), 'the test names windows rather than naming the room — it will miss the next panel');
  // ...asked once per reading per fingertip (clearAboveOnce), not every frame
  assert.ok(/const onOrb = \(px, py, slot\) => Math\.hypot\(px - orb\.x, py - orb\.y\) <= orb\.r && clearAboveOnce\(hand, slot, h\.seenAt, px, py\);/.test(hv),
    'the orb test does not consult it, so the body still turns behind a window');
  assert.ok(/if \(m\.at !== seen\) \{ m\.at = seen; m\.v = clearAbove\(px, py\); \}/.test(hv),
    'the memo never asks again — a window opened over the orb would not stop it');
  // ...and a tip that was occluded must FORGET where it was, or the body lurches
  // by the whole distance the hand moved behind the window.
  const push = hv.slice(hv.indexOf('      let touching = 0;'), hv.indexOf('      if (touching) body.handTouch'));
  assert.ok(push.length > 200, 'the push loop slice is empty — this check would pass on nothing');
  assert.ok(/if \(!onOrb\(at\[0\], at\[1\], i\)\) \{ if \(fresh\) wasAt\[hand\]\[i\] = null; continue; \}/.test(push),
    'an occluded fingertip keeps its last position — the body would lurch when the window moved away');
});

console.log('\nthe hand view, at the tracker\'s rate (2026-09-27):');

ok('the hit tests wait for a new reading; the pointers still move every frame', () => {
  // reach aims only on a frame that carried a reading — the pointer keeps its
  // target in between, and keeps moving and sending pointermoves
  const at = src.slice(src.indexOf('function at(x, y, p)'), src.indexOf('function scrollerAt('));
  assert.ok(/if \(s && p\.snapTo\?\.isConnected && \(!probing \|\| \(Math\.abs\(x - s\[0\]\) < SNAP_AGAIN && Math\.abs\(y - s\[1\]\) < SNAP_AGAIN\)\)\) return p\.snapTo;/.test(at),
    'a stale frame re-aims — nine elementFromPoint calls a frame for a reading already aimed');
  assert.ok(/let probing = true;/.test(src), 'a caller that never says would stop aiming altogether');
  assert.ok(/reading\(fresh\) \{ probing = fresh !== false; \},/.test(src), 'nothing can tell reach a reading arrived');
  const dc = hv.slice(hv.indexOf('function drawCursors('), hv.indexOf('function flash('));
  assert.ok(/reach\?\.reading\?\.\(freshAny\);/.test(dc), 'handview never says whether the frame is fresh');
  assert.ok(dc.indexOf('reach?.reading?.(freshAny)') < dc.indexOf('reach.move('), 'the frame is declared fresh after the pointers have aimed');
  // the freshness is read before the hand loop records the readings as seen
  assert.ok(dc.indexOf('reach?.reading?.(freshAny)') < dc.indexOf('if (h) seenAt[hand] = h.seenAt;'),
    'freshness is judged after the loop has marked every reading seen — it would never be fresh');
});

ok('the marks are written after every read of the frame, in one pass', () => {
  const dc = hv.slice(hv.indexOf('function drawCursors('), hv.indexOf('function flash('));
  assert.ok(!/\.style\.transform =/.test(dc), 'a mark is written in the middle of the frame\'s hit tests again');
  assert.ok(/place\(d, x, y\);/.test(dc), 'the fingertip marks are not placed');
  const last = dc.lastIndexOf('flushMoves();');
  assert.ok(last > dc.lastIndexOf('reach.move(') && last > dc.lastIndexOf('onOrb('), 'the marks are written before the frame has finished reading');
  assert.ok(/moves\[i\]\.style\.transform = `translate3d\(/.test(hv), 'the flush writes something other than a transform — left/top would lay the page out');
});

ok('the skeleton is drawn only while the preview shows, and only when the reading changed', () => {
  const sk = hv.slice(hv.indexOf('function drawSkeleton('), hv.indexOf('const clamp ='));
  assert.ok(/if \(!document\.body\.classList\.contains\('cam-on'\)\) \{/.test(sk), 'the skeleton is stroked into a preview nobody can see');
  assert.ok(sk.indexOf("contains('cam-on')") < sk.indexOf('video.clientWidth'), 'the hidden preview is still measured every frame');
  assert.ok(/if \(list\.length === skelN && a === skelA && b === skelB\) return;/.test(sk), 'the same reading is cleared and drawn again every frame');
  assert.ok(/skelN = -1;\s+\/\/ a resize cleared it/.test(sk), 'a resize clears the canvas and a still hand is never drawn back');
});


console.log('\nhands on the glyphs (2026-10-31):');

ok('a contact made over a button presses it; opening the fingers is the click', () => {
  // Colin, 2026-10-29: "let users use their hands on the nav bar glyphs". The
  // bus could HOLD on one (a 600ms dwell fired it, the probe proved it); a
  // pinch over one did nothing, because a contact only ever took hold of the
  // DRAGGABLE things and a plain button got the dwell — which a pinch opened
  // sooner than that never finished. So: formed over a button, the contact is
  // the press; opened where it closed, the click.
  assert.match(src, /const PRESSED_BY_CONTACT = 'button, \[role="button"\], a\[href\], summary';/, 'what a contact presses is not said by what it is');
  const move = src.slice(src.indexOf('    move(key, x, y, now, fingers'), src.indexOf('    holdAt(key,'));
  assert.match(move, /const formed = merged && !p\.merged;\n      p\.merged = merged;/, 'a contact is not told apart from one being carried — a contact slid onto a button would press it');
  assert.ok(move.indexOf('p.merged = merged;') < move.indexOf('const el = at(x, y, p);'), 'the contact is noted after something may have returned — the frame it forms on can be missed');
  assert.match(move, /if \(formed && two\(el, PRESSED_BY_CONTACT\)\) \{\n        p\.swipe = false; p\.grip = true; p\.from = \[x, y\];\n        p\.dwellFrom = 0; p\.dwellAt = \[x, y\]; p\.fired = true;/, 'the contact does not take hold of the button as the grip does, latched like a hold');
  assert.ok(move.indexOf('if (merged && drags(el))') < move.indexOf('if (formed && two(el, PRESSED_BY_CONTACT))'), 'a window light would be pressed before the window could be dragged — the order is the policy');
  assert.ok(move.indexOf('if (p.refused) { p.dwell = 0; return p; }') < move.indexOf('if (formed && two(el, PRESSED_BY_CONTACT))'), 'a contact presses the file picker');
  assert.match(src, /p\.grip = false; p\.merged = false;\n    if \(why === 'gone'\) live\.delete\(p\.key\);/, 'a dropped pointer remembers a contact it no longer has');
});

ok('the rails reach for a hand in them: the nearest glyph, within a reach of its edge', () => {
  // An 80px glyph is bigger than SNAP_MAX, so a mark got no help toward it,
  // and the bar between glyphs is pointer-events:none — a hand resting in
  // the gap, or drifting a few pixels off a glyph it was holding on, was on
  // the room's canvas and the ring emptied.
  assert.match(src, /const RAILS = '#home-nav, #home-nav-right, #home-nav-top, #home-nav-bottom';/, 'the four bars are not the rails');
  assert.match(src, /const RAIL_REACH = 30;/);
  assert.match(src, /return best \|\| railGlyph\(x, y\) \|\| direct;/, 'the rail reach comes before a small thing found by the probes, or not at all');
  const rg = src.slice(src.indexOf('function railGlyph(x, y)'), src.indexOf('function at(x, y, p)'));
  assert.match(rg, /if \(!\(rr\.width > 0\) \|\| x < rr\.left \|\| x > rr\.right \|\| y < rr\.top \|\| y > rr\.bottom\) continue;/, 'a glyph pulls a hand that is not in its rail');
  assert.match(rg, /getComputedStyle\(g\)\.pointerEvents === 'none'\) continue;/, 'a folded rail\'s glyphs, which a mouse cannot press, are reached for');
  assert.match(rg, /if \(g\.hidden\) continue;/, 'a hidden glyph (kode, before it is paired) is reached for');
});

// --- the bus run for real, under a stub of the little it asks of a document ---
// Four things: what is under a point, where a thing is, whether it matches a
// selector, and to take an event. (mini-dom's selector engine does not know
// [role="button"] or input[type=file], which the bus asks of every element, so
// the stub is its own: an element lists the selectors it answers to.)
function stubDocument() {
  const events = [];
  class El {
    constructor(tag, { id = '', sels = [], rect = [0, 0, 0, 0], hidden = false, pe = 'auto', parent = null, kids = [] } = {}) {
      Object.assign(this, { tag, id, sels, rect, hidden, pe, parent, kids, tagName: tag.toUpperCase() });
    }
    matches(sel) { return sel.split(',').map((x) => x.trim()).some((x) => x === this.tag || this.sels.includes(x) || (!!this.id && x === '#' + this.id)); }
    closest(sel) { for (let n = this; n; n = n.parent) if (n.matches(sel)) return n; return null; }
    getBoundingClientRect() { const [left, top, width, height] = this.rect; return { left, top, width, height, right: left + width, bottom: top + height }; }
    dispatchEvent(e) { events.push([this, e.type]); return true; }
    querySelectorAll(sel) { return this.kids.filter((k) => k.matches(sel)); }
    get isConnected() { return true; }
  }
  const doc = { body: new El('body'), documentElement: new El('html'), elementFromPoint: () => null, querySelectorAll: () => [] };
  globalThis.document = doc;
  globalThis.window = { dispatchEvent: (e) => { events.push(['window', e.type]); return true; } };
  globalThis.getComputedStyle = (el) => ({ pointerEvents: el.pe, overflowY: 'visible' });
  globalThis.PointerEvent = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.MouseEvent = globalThis.PointerEvent;
  Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: true } }, configurable: true });   // a getter-only property in Node
  return { El, doc, events, count: (el, type) => events.filter(([e, t]) => e === el && t === type).length };
}

const { createReach } = await import('../src/reach.js');

await (async () => {
  const { El, doc, events, count } = stubDocument();
  const room = new El('div', { rect: [0, 0, 1400, 900] });
  const glyph = new El('button', { id: 'nav-feed', sels: ['.nav-btn'], rect: [6, 200, 80, 80] });
  doc.elementFromPoint = (x, y) => (x >= 6 && x <= 86 && y >= 200 && y <= 280 ? glyph : room);
  const reach = createReach({});
  let t = 1000;

  ok('a pinch tapped on a glyph: down when the fingers meet, the click when they open, once', () => {
    reach.move('h', 46, 240, t, 1, false);              // a finger arrives, hand open
    assert.equal(count(glyph, 'pointerdown'), 0, 'arriving pressed it');
    reach.move('h', 46, 240, t += 50, 1, true);         // the fingertips meet over it
    assert.equal(count(glyph, 'pointerdown'), 1, 'the contact did not press it');
    assert.equal(count(glyph, 'click'), 0, 'clicked before the fingers opened');
    assert.ok(reach.state('h').down && reach.state('h').grip, 'not held');
    reach.move('h', 47, 241, t += 120, 1, true);        // held a moment, a pixel of drift
    assert.equal(count(glyph, 'click'), 0);
    reach.move('h', 47, 241, t += 80, 1, false);        // opened where they closed
    assert.equal(count(glyph, 'pointerup'), 1);
    assert.equal(count(glyph, 'click'), 1, 'opening the fingers is not the click');
    assert.ok(!reach.state('h').down);
    for (let i = 0; i < 30; i++) reach.move('h', 47 + (i % 2), 241, t += 50, 1, false);   // resting there afterwards, 1.5s
    assert.equal(count(glyph, 'click'), 1, 'the hold fired after the tap had — two presses for one');
    reach.move('h', 47, 241, t += 50, 1, true);          // a second tap...
    reach.move('h', 47, 241, t += 100, 1, false);
    assert.equal(count(glyph, 'click'), 2, '...is not a second press');
    reach.end('h');
  });

  ok('a contact carried onto a glyph does not press it, and one that travelled does not click', () => {
    events.length = 0;
    reach.move('c', 700, 450, t += 50, 1, true);         // formed over the room
    reach.move('c', 400, 350, t += 60, 1, true);
    reach.move('c', 46, 240, t += 60, 1, true);          // carried onto the glyph
    reach.move('c', 46, 240, t += 60, 1, true);
    assert.equal(count(glyph, 'pointerdown'), 0, 'a contact slid onto the glyph pressed it');
    reach.move('c', 46, 240, t += 60, 1, false);         // opened there
    assert.equal(count(glyph, 'click'), 0, 'opening over it clicked it');
    reach.end('c');
    events.length = 0;
    reach.move('d', 46, 240, t += 50, 1, false);
    reach.move('d', 46, 240, t += 50, 1, true);          // formed over it (down)...
    reach.move('d', 70, 260, t += 50, 1, true);          // ...then dragged 31px...
    reach.move('d', 70, 260, t += 50, 1, false);         // ...and opened
    assert.equal(count(glyph, 'pointerdown'), 1);
    assert.equal(count(glyph, 'click'), 0, 'a contact that travelled clicked where it finished');
    reach.end('d');
  });

  ok('a contact over the file picker, or the room, presses nothing', () => {
    events.length = 0;
    const picker = new El('button', { id: 'chat-upload', rect: [900, 840, 40, 40] });
    doc.elementFromPoint = (x, y) => (x >= 900 && x <= 940 && y >= 840 ? picker : room);
    reach.move('e', 920, 860, t += 50, 1, false);
    reach.move('e', 920, 860, t += 50, 1, true);
    reach.move('e', 920, 860, t += 50, 1, false);
    assert.equal(count(picker, 'pointerdown') + count(picker, 'click'), 0, 'the picker, which needs a real click, was pressed by a contact');
    assert.ok(reach.state('e').refused);
    reach.end('e');
    reach.move('f', 700, 450, t += 50, 1, false);
    reach.move('f', 700, 450, t += 50, 1, true);
    reach.move('f', 700, 450, t += 50, 1, false);
    assert.equal(count(room, 'pointerdown') + count(room, 'click'), 0, 'the room took a press from a pinch');
    reach.end('f');
  });

  ok('in a rail, a hand between two glyphs is on the nearer one — within the reach, and only while the rail is open', () => {
    const rail = new El('nav', { id: 'home-nav', rect: [0, 0, 92, 900] });
    const g1 = new El('button', { id: 'nav-profile', sels: ['.nav-btn'], rect: [6, 60, 80, 80], parent: rail });
    const g2 = new El('button', { id: 'nav-feed', sels: ['.nav-btn'], rect: [6, 200, 80, 80], parent: rail });
    rail.kids = [g1, g2];
    doc.querySelectorAll = (sel) => (sel === reach._rails ? [rail] : []);
    doc.elementFromPoint = () => room;                   // the bar is pointer-events:none: the room is under every point of it
    reach.move('r1', 46, 150, t += 50, 1, false);        // 10px below the profile glyph, 50 above the feed
    assert.equal(reach.state('r1').target, g1, 'the gap under a glyph is the room');
    reach.move('r2', 46, 190, t += 50, 1, false);        // 10px above the feed glyph
    assert.equal(reach.state('r2').target, g2);
    reach.move('r3', 46, 170, t += 50, 1, false);        // 30 from each: beyond the reach
    assert.equal(reach.state('r3').target, room, 'the reach is longer than it says');
    reach.move('r4', 300, 150, t += 50, 1, false);       // out in the room, level with the gap
    assert.equal(reach.state('r4').target, room, 'a glyph pulls a hand that is not in its rail');
    g1.pe = 'none'; g2.pe = 'none';                      // the rail folded
    reach.move('r5', 46, 150, t += 50, 1, false);
    assert.equal(reach.state('r5').target, room, 'a folded rail\'s glyph, which a mouse cannot press, took the hand');
    g1.pe = 'auto'; g2.pe = 'auto'; g1.hidden = true;     // kode's glyph, before it is paired
    reach.move('r6', 46, 150, t += 50, 1, false);
    assert.equal(reach.state('r6').target, room, 'a hidden glyph is reached for');
    for (const k of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) reach.end(k);
  });
})();

console.log('\n' + passed + ' checks passed.\n');
