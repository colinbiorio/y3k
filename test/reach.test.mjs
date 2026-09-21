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
  assert.ok(/bub\.style\.transform = `translate3d\(\$\{at\[0\]/.test(loop), 'the bubble is not drawn at the press point');
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
  for (const sel of ['#chat-voice', '#chat-camera', '#chat-upload']) {
    assert.ok(refused.includes(sel), `${sel} can be pressed by a hand, and would silently fail`);
  }
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
  assert.ok(/onMic: \(\) => \{ try \{ voice\?\.toggle\?\.\(\); \} catch/.test(main), 'nothing wires the hold to the voice');
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
  assert.ok(/return best \|\| direct;/.test(src), 'finding nothing changes the answer');
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
  assert.ok(/const onOrb = \(px, py\) => Math\.hypot\(px - orb\.x, py - orb\.y\) <= orb\.r && clearAbove\(px, py\);/.test(hv),
    'the orb test does not consult it, so the body still turns behind a window');
  // ...and a tip that was occluded must FORGET where it was, or the body lurches
  // by the whole distance the hand moved behind the window.
  const push = hv.slice(hv.indexOf('      let touching = 0;'), hv.indexOf('      if (touching) body.handTouch'));
  assert.ok(push.length > 200, 'the push loop slice is empty — this check would pass on nothing');
  assert.ok(/if \(!onOrb\(at\[0\], at\[1\]\)\) \{ if \(fresh\) wasAt\[hand\]\[i\] = null; continue; \}/.test(push),
    'an occluded fingertip keeps its last position — the body would lurch when the window moved away');
});

console.log('\n' + passed + ' checks passed.\n');
