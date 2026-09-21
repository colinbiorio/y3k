// ============================================================================
// reach.js — THE SYNTHETIC POINTER BUS.
//
// This is the piece that makes the hand cheap instead of enormous. Rather than
// teaching every widget in the app about fingers, it synthesises real
// PointerEvents and dispatches them at whatever is under the point. The orb's
// trackball, the conversation's scroll, the mercury buttons' hover swell and
// press clump, the wordmark's spin, the window drag bars — every one of them
// already handles pointer events, and every one of them comes along for free
// and stays visually correct, because nothing in this codebase reads
// event.isTrusted.
//
// TWO KINDS OF SURFACE, because a hand wants two different things.
//
//   A SWIPE SURFACE — the room, the conversation column — takes the press the
//   moment a finger arrives, so moving your hand across the orb turns it and
//   moving it across the column scrolls the past. No dwell: a surface you drag
//   should answer the hand immediately or it feels dead.
//
//   A TARGET — a button, a glyph, a field — takes nothing until a finger has
//   HELD on it. Pressing on arrival would mean sweeping your hand across the
//   screen fired every control it passed over.
//
// THE FOUR RULES THAT ARE NOT NEGOTIABLE:
//
//  1. ALWAYS EMIT THE MATCHING UP. The orb ends a drag on a window-level
//     pointerup; a hand that leaves the frame mid-drag and sends nothing leaves
//     `dragging` true forever and the orb stuck. Every pointer here has a
//     liveness timeout that cancels it.
//  2. setPointerCapture THROWS on a pointerId the browser never issued. Every
//     call site in this app already catches it — the comment at one of them
//     literally reads "capture is a nicety" — which is what makes this approach
//     viable rather than a fight. Do not add a new uncaught one.
//  3. SYNTHETIC EVENTS CANNOT SATISFY USER ACTIVATION. A synthetic click will
//     not open the microphone, will not enter fullscreen and will not start
//     getUserMedia. So a hand must not be able to press those controls: a
//     button that lights up correctly and silently does nothing is worse than
//     one that cannot be pressed. They are refused by name, below.
//  4. THE WORLD'S GATE IS NOT ROUTED AROUND. A hand is the PERSON, not the
//     presence, so it is allowed where a person is allowed — through the same
//     handlers, never past them.
// ============================================================================

// Reserved ids, well clear of anything a browser will mint for a real device.
const ID_BASE = 9200;

// Surfaces that answer a MOVING hand directly. Everything else needs the hold.
//
// The conversation is deliberately NOT here. It is pointer-events:none, so
// elementFromPoint never returns it anyway — the press lands on the room's
// canvas and history.js decides, in the capture phase, whether this particular
// point belongs to the past or to the orb. That arbitration is the right place
// for it and it is the same one a mouse gets.
const SWIPE = '#stage, #stage canvas, canvas.orb';

// PRESENCE IS NOT A GRIP. A hand resting over the room must not be holding it —
// that is what made the cursor feel stuck to everything it crossed. MOVEMENT
// takes hold, stillness lets go, and leaving the surface lets go. Which means
// the release carries whatever speed the hand had: flick across the orb and off
// the side and it is released mid-flight, so the trackball's own fling keeps it
// turning. Slow the hand to a stop instead and it is released still, and the
// room stops with it. Neither of those is a special case in here; they are the
// same two rules seen from different speeds.
const GRAB_PX_S = 90;      // moving at least this fast takes hold
const STILL_PX_S = 55;     // slower than this...
const STILL_MS = 130;      // ...for this long, and it lets go

// WHAT A HAND MAY NOT PRESS. Each of these needs a real user gesture that a
// synthesised event cannot provide, so pressing them would light the button and
// do nothing at all. The mic is the concrete casualty and always has been.
//
// #nav-settings IS NOT ONE OF THEM AND NEVER WAS. It calls settings.open(),
// which draws a panel — there is no permission in it, nothing to activate, and
// the refusal was guilt by association with the camera controls INSIDE the
// panel. Those are still refused by their own names. Colin asked for it back.
const REFUSED = '#chat-voice, #chat-camera, #chat-upload, input[type=file]';

// A CONTACT TO HOLD-PRESS THESE. They are the things a hand is constantly OVER
// while doing something else — the body you are turning, and the mark that sits
// on it — so a hold that any single finger can start is a press you make by
// accident every time you reach across. Colin: interacting with the orb meant
// inevitably opening a memory.
//
// AND IT IS A CONTACT, NOT A COUNT. This asked `fingers < 2` — how many fingers
// the hand was holding UP — which is the bug Colin found: one finger over the
// body correctly refused to dwell, and then an open palm, four fingers up and
// aiming at nothing, satisfied it and pressed. Two fingers TOUCHING is a thing
// you did; four fingers extended is the shape a hand has when it is resting.
//
// Only the HOLD is gated. A pinch on the body still takes hold of it and turns
// it, because a pinch is a thing you did on purpose and a hand resting is not.
const TWO_TO_PRESS = '#stage, #stage canvas, canvas.orb, #home-brand, .home-brand';

// ONE FINGER PRESSES THESE, A CONTACT DRAGS THEM. The collapse arrows are a tap
// AND a drag on the same control — tap folds every bar, drag folds the one you
// are on — and a hand cannot help drifting, so the drag needs to be asked for.
const TWO_TO_DRAG = '[id^="nav-collapse"]';

// TAKEN HOLD OF BY A CONTACT. Two fingertips meeting over one of these presses
// it and STAYS down — dragged wherever the contact goes, released when it opens
// — because the things worth pointing at in this room are turned and folded and
// slid and resized, and a click is a press you are not allowed to keep hold of.
// Colin, on the mark: "it just spins it once on merge, as if it were a click."
const DRAGGABLE = '#home-brand, .home-brand, [id^="nav-collapse"], input[type=range], .mind-win, .win-edge';

// ...AND OF THESE, A DWELL IS SIMPLY THE WRONG GESTURE. It fires at a moment you
// did not choose and then immediately lets go, when what you wanted was to take
// hold: a click on the wordmark, on a slider, or in the middle of a window's
// text does nothing anybody meant. The collapse arrows are deliberately NOT here
// — their tap is a real command — and neither are the window's own buttons.
const NO_DWELL = '#home-brand, .home-brand, input[type=range], .mind-win, .win-edge';

// THE ONLY THINGS INSIDE A WINDOW A HAND MAY PRESS: close, minimize, full
// screen, and the tab you switch with. Colin asked for exactly this — the body
// of a window is a thing you move and resize, not a page you click into — and
// it is also what stops a hand resting over a memory from pressing a link in it.
const PRESSABLE = '.win-light, .win-min, .win-tab';

// A HOLD ON ONE OF THESE OPENS THE MICROPHONE. Not a separate gesture: the same
// six-tenths-of-a-second hold that presses a button, landing on a field you
// would have to type into, offers the other way of putting words in it. A hand
// in the air has no keyboard, which is the whole reason.
const TEXT_FIELD = 'input[type=text], input[type=search], input:not([type]), textarea, [contenteditable="true"]';

const two = (el, sel) => !!el && !!el.closest?.(sel);
// Inside a window, the three lights win over the window itself: every selector
// here is matched with closest(), so a light is also "in a .mind-win" and the
// order these two are asked in is the whole of the policy.
const drags = (el) => two(el, DRAGGABLE) && !two(el, PRESSABLE);
const noDwell = (el) => two(el, NO_DWELL) && !two(el, PRESSABLE);

// HOW FAR A MARK MAY REACH FOR A SMALL CONTROL. A hand in the air cannot be
// held perfectly still, and the window lights are 14px across — Colin: "it's
// hard to keep your finger ultimately still."
//
// THE MATH ON THE LIGHTS, since he asked for it. They are 14px wide with a 7px
// gap, so their centres are 21px apart and their edges 7px. No radius can stop
// a point in that gap from being within reach of both — sitting in the middle
// of it is 3.5px from each. So the radius does not decide it; NEAREST decides
// it. Every candidate is ranked by the distance to its own EDGE and the closest
// wins outright, which means a point in the gap resolves to whichever light it
// is actually nearer and never to both, at any radius. 13px is 1.4x the index
// mark's own diameter, which is what he asked for, and it is bounded by the
// smallness test below: a mark cannot reach across the bar to a light, because
// everything between them is too big to be a candidate.
const SNAP_R = 13;
// ...AND ONLY SMALL THINGS ARE REACHED FOR. Widening the point globally would
// mean a mark near the edge of the room snapped onto the room, and a mark near
// a window snapped onto its resize edge — every large surface would pull. A
// control you can miss is a control that is small; nothing else needs help.
const SNAP_MAX = 60;
const RING = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];
// Re-probed only when the mark has actually moved. A hand held still on a
// button is the DWELL — the commonest state there is — and re-running eight hit
// tests a frame to reach the same answer is the one case worth not paying for.
const SNAP_AGAIN = 3;

const DWELL_MS = 600;      // hold on the spot to press
const DWELL_SLOP = 34;     // px of drift allowed while holding — a hand is not a mouse
// HOLD-TO-PRESS IS BACK ON, AND IT IS THE RELIABLE ONE.
//
// Both routes end in the same event, which makes them impossible to tell apart
// from the outside: a click could be the gesture you meant or the half-second
// you spent hovering before it, and no amount of watching settles which. So
// the hold stands down. Nothing is deleted — every line of it is still here
// and still tested — and it comes back with one word:
//
//     Y3K.reach.dwell(true)      in the console, live, no reload
//
// TWO ATTEMPTS AT A SECOND PRESS GESTURE HAVE NOW BEEN RETIRED, and they failed
// for the same reason in different costumes. The air tap watched the
// fingertip's travel from its own knuckle — but swinging a STRAIGHT finger
// moves the tip exactly as far as curling it does, so a wag and a tap were one
// shape. The scrunch fixed that by watching the bend instead, and fired
// accurately; what it could not fix is that the finger doing the gesture is the
// finger doing the aiming, so the cursor dived every time you clicked. A pinch
// is made by the THUMB, and the thumb is not pointing at anything.
//
// The hold is still worth keeping as the fallback for when a pinch cannot be
// seen: hand edge-on to the camera, poor light. Both routes ending in the same
// event is what makes that a free choice later.
// ON. It was switched off so the AIR TAP could be judged against it — with
// both live there is no telling a jab from the half-second of hovering before
// it — and the air tap has since been retired twice over, first for the scrunch
// and then for nothing at all. The reason for the switch stopped existing and
// nobody moved the switch.
//
// AND IT IS THE ONE THAT CANNOT MISFIRE, which is what Colin asked for: it
// recognises no posture, so there is no posture to get wrong. Every gesture
// that has fought us was a shape the model had to identify — a jab, a bend,
// two fingertips meeting, a fist. This asks only that the hand holds still,
// and a hand holding still is the single thing a tracker is never wrong about.
//
// The pinch stays. Both routes end in the same press, so having both costs
// nothing: the pinch is the fast one and this is the one that always works.
// What it costs is six tenths of a second, and the risk of a hand that rests
// somewhere pressing what it rested on — which is why it draws a filling ring
// while it waits, so the press is a thing you are visibly doing rather than a
// thing that happens to you.
const DWELL_DEFAULT = true;
const LIVE_MS = 240;       // no word from a pointer for this long and it is cancelled


// onWords() is handed in rather than worked out here, so there is one
// definition of where the past lives and it belongs to the thing that wrote it.
//
// onMic() likewise: this file knows a hold landed on something you type into,
// and knows nothing whatever about speech. Handed in, so the one place that
// owns the microphone goes on owning it.
export function createReach({ onWords = null, onMic = null } = {}) {
  const live = new Map();   // key -> pointer state
  let dwellOn = DWELL_DEFAULT;
  // IDS COME FROM A COUNTER, NEVER FROM live.size. With two pointers open and
  // one leaving, the next arrival would be handed the id the survivor is still
  // using — two "different" pointers with one id, which every handler in the
  // browser treats as the same finger. It looks like the second hand teleports
  // into the first hand's drag.
  let nextId = 0;

  function slot(key) {
    let p = live.get(key);
    if (!p) {
      p = {
        id: ID_BASE + (nextId++), key,
        x: 0, y: 0, target: null, down: false, swipe: false,
        dwellFrom: 0, dwellAt: null, dwell: 0, fired: false, seen: 0, refused: false,
        speed: 0, stillFrom: 0, from: null,
        snapAt: null, snapTo: null,
      };
      live.set(key, p);
    }
    return p;
  }

  function ev(type, p, extra = {}) {
    return new PointerEvent(type, {
      pointerId: p.id,
      // 'pen' is the honest label: a pointing device that is neither a mouse
      // nor a finger on glass. It also keeps these events out of any code
      // branching on 'touch', which in this app means the whole phone layout.
      pointerType: 'pen',
      isPrimary: false,
      bubbles: true, cancelable: true, composed: true,
      clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y,
      buttons: p.down ? 1 : 0, button: 0,
      pressure: p.down ? 0.5 : 0,
      ...extra,
    });
  }

  // A CONTROL SMALL ENOUGH TO MISS. Measured rather than listed: anything
  // under SNAP_MAX on both sides is a thing you aim at, and everything bigger
  // is a surface you land on. A list of selectors would have to be kept in step
  // with every control anybody adds; a size never goes stale.
  function small(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.width <= SNAP_MAX && r.height <= SNAP_MAX;
  }

  // WHAT THIS MARK IS ON, with a little reach. The point itself wins whenever
  // it is already on something small — you are on the button, that is the
  // answer. Otherwise eight probes go out at SNAP_R and the NEAREST small thing
  // any of them finds takes it, ranked by the distance to that thing's own
  // edge, so two controls side by side resolve to the one you are nearer and
  // never to both. Finding nothing leaves the honest answer untouched.
  function reachFor(x, y) {
    const direct = document.elementFromPoint(x, y);
    if (!direct || small(direct)) return direct;
    let best = null, bestD = Infinity;
    for (const [dx, dy] of RING) {
      const el = document.elementFromPoint(x + dx * SNAP_R, y + dy * SNAP_R);
      if (el === direct || !small(el)) continue;
      const r = el.getBoundingClientRect();
      // Distance to the RECTANGLE, not to its centre: a wide short control and
      // a round one of the same width are equally near when you are beside them.
      const near = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (near < bestD) { bestD = near; best = el; }
    }
    return best || direct;
  }

  // ...and the answer is kept while the mark is still. See SNAP_AGAIN: a hand
  // holding on a button is the dwell, and it must not cost eight hit tests a
  // frame to keep saying so. Movement past a few pixels asks again.
  function at(x, y, p) {
    if (!p) return reachFor(x, y);
    const s = p.snapAt;
    if (s && Math.abs(x - s[0]) < SNAP_AGAIN && Math.abs(y - s[1]) < SNAP_AGAIN && p.snapTo?.isConnected) return p.snapTo;
    p.snapAt = [x, y];
    p.snapTo = reachFor(x, y);
    return p.snapTo;
  }

  // THE NEAREST THING UNDER THIS POINT THAT SCROLLS. The discover wall, the
  // settings panes, a window's body — all of them are overflow:auto, which a
  // synthetic pointer cannot move at all: a real finger on glass scrolls those
  // because the browser does it, not because anything listens. So a hand has to
  // scroll them the way a wheel does, by writing scrollTop.
  //
  // Walked rather than listed for the same reason smallness is measured: every
  // pane in this app that scrolls gets this without being named, including ones
  // that do not exist yet.
  function scrollerAt(el) {
    for (let n = el, depth = 0; n && n !== document.body && depth < 12; n = n.parentElement, depth++) {
      if (n.scrollHeight - n.clientHeight < 8) continue;
      const o = getComputedStyle(n).overflowY;
      if (o === 'auto' || o === 'scroll') return n;
    }
    return null;
  }

  // ON THE WORDS, and nowhere else. The canvas fills the window, so matching
  // the element alone made the whole screen a place a moving hand could take
  // hold of — and everything it took hold of out there reached the trackball
  // and turned the body, which is not what the hand was doing.
  function swipeAt(el, x, y) {
    if (!el || !el.closest?.(SWIPE)) return false;
    if (!onWords) return false;
    try { return !!onWords(x, y); } catch { return false; }
  }

  function enter(p, el) {
    if (p.target === el) return;
    if (p.target) p.target.dispatchEvent(new PointerEvent('pointerout', { pointerId: p.id, pointerType: 'pen', bubbles: true, clientX: p.x, clientY: p.y, relatedTarget: el }));
    p.target = el;
    if (el) el.dispatchEvent(new PointerEvent('pointerover', { pointerId: p.id, pointerType: 'pen', bubbles: true, clientX: p.x, clientY: p.y }));
    // A new target means a new hold. Sweeping across three buttons must not
    // accumulate 600ms across all of them and fire the third.
    p.dwellFrom = 0; p.dwell = 0; p.dwellAt = null; p.fired = false;
  }

  function press(p) {
    if (p.down || !p.target) return;
    p.down = true;
    p.target.dispatchEvent(ev('pointerdown', p));
  }

  function release(p, click) {
    if (!p.down) return;
    p.down = false;
    const el = p.target;
    if (el) {
      el.dispatchEvent(ev('pointerup', p));
      // The click is what most handlers in this app actually listen for. It is
      // sent only for a HOLD, never at the end of a swipe — a drag across the
      // room that ended over a button must not press it.
      if (click) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y }));
    }
  }

  function drop(p, why) {
    if (p.down) {
      p.down = false;
      p.target?.dispatchEvent(ev('pointercancel', p));
      // The orb, and anything else that ends a drag on a WINDOW-level listener,
      // never hears a cancel aimed at an element. Send the up to the window too
      // or the drag stays open forever and the room is stuck mid-spin. This is
      // rule 1, and it is the failure the whole liveness timeout exists for.
      window.dispatchEvent(ev('pointerup', p));
    }
    if (p.target) p.target.dispatchEvent(new PointerEvent('pointerout', { pointerId: p.id, pointerType: 'pen', bubbles: true, clientX: p.x, clientY: p.y }));
    // PARK THE HOVER OFF-SCREEN. The mercury buttons take their hover from a
    // pointermove on WINDOW and ease back when it moves away — so a hand that
    // simply stops reporting leaves the last button it passed swollen and
    // re-rendering for good. Going quiet is not the same as leaving.
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: p.id, pointerType: 'pen', bubbles: true, clientX: -9999, clientY: -9999 }));
    p.target = null; p.dwellFrom = 0; p.dwell = 0; p.dwellAt = null; p.fired = false; p.refused = false; p.stillFrom = 0;
    p.snapAt = null; p.snapTo = null; p.pane = null; p.scrollAt = null; p.grip = false;
    if (why === 'gone') live.delete(p.key);
  }

  // THE PANE THIS POINTER IS SCROLLING. Held once it is found, because the act
  // of scrolling moves what is under the point — re-asking every frame would
  // walk the tree against a target that is sliding past, and a pane scrolled to
  // its end would hand back whatever came into view behind it. It is let go
  // when the mark leaves the pane's own box, which is what leaving is.
  function paneFor(p, el, x, y) {
    const held = p.pane;
    if (held && held.isConnected) {
      const r = held.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return held;
    }
    p.pane = scrollerAt(el);
    p.scrollAt = null;
    return p.pane;
  }

  return {
    // One call per acting finger per frame. Returns the pointer's state so the
    // cursor can draw its own hold.
    // `fingers` is HOW MANY the hand is holding up, and it decides ONE thing:
    // whether this is the two-finger drag that scrolls. `merged` is whether
    // two fingertips are in CONTACT — a thing you did, rather than a shape your
    // hand is in — and it decides everything else: what may be held, what may
    // be dragged, and what may be dwelt on. They are separate because an open
    // palm has four fingers up and has not asked for anything.
    // Both default to nothing, so a call site that forgets asks for nothing.
    move(key, x, y, now, fingers = 0, merged = false) {
      const p = slot(key);
      // HOW FAST THE HAND IS GOING, smoothed a little so one jittery frame
      // cannot look like a flick or one slow frame like a stop.
      const dt = p.seen ? Math.max(1, now - p.seen) : 16;
      const inst = Math.hypot(x - p.x, y - p.y) / (dt / 1000);
      p.speed = p.seen ? p.speed + (inst - p.speed) * 0.35 : 0;
      p.seen = now;
      p.x = x; p.y = y;

      const el = at(x, y, p);
      // A pointer that wandered off the page keeps its press rather than
      // dropping it: a hand crossing the bezel mid-drag is still dragging.
      if (!el) { if (p.down) p.target?.dispatchEvent(ev('pointermove', p)); return p; }

      if (p.down) {
        // A DRAG IN PROGRESS. It follows the hand wherever it goes — over other
        // elements, past the edge of the window — because that is what a drag
        // is. It ends when the finger leaves the surface it grabbed, or when
        // the hand stops.
        // A DRAG THAT HAS TO BE ASKED FOR. On a control that is a tap AND a
        // drag, a lone finger holds it where it was pressed — the click still
        // lands, nothing moves — and a CONTACT carries it. Without this every
        // press on an arrow is a small drag, because a hand cannot hold still.
        if (!merged && two(p.target, TWO_TO_DRAG)) { p.x = p.from ? p.from[0] : p.x; p.y = p.from ? p.from[1] : p.y; }
        p.target?.dispatchEvent(ev('pointermove', p));
        if (p.swipe) {
          // LEFT THE BODY: let go, at whatever speed the hand was going — which
          // is what leaves it spinning after a flick. Without this the press
          // begun on the orb stayed down forever, so the finger could never
          // afterwards hold on anything.
          // ...AND LOSING THE POSTURE ENDS IT THE SAME WAY. Otherwise two
          // fingers are only a doorway: start the drag with two, drop to one
          // while still moving, and nothing in here ever asks again — the
          // chat scrolls from one finger until the hand stops or leaves.
          // Routed through the same release rather than by clearing p.swipe,
          // because the whole release machinery for a surface drag lives
          // inside this branch: a cleared flag drops the pointer into the
          // `else` below and it emits pointermove forever.
          if (fingers !== 2 || !swipeAt(el, x, y)) { release(p, false); enter(p, el); }
          else {
            // WENT STILL: let go, at rest. The room stops where the hand did.
            if (p.speed < STILL_PX_S) {
              if (!p.stillFrom) p.stillFrom = now;
              if (now - p.stillFrom >= STILL_MS) { release(p, false); p.stillFrom = 0; return p; }
            } else { p.stillFrom = 0; }
            return p;
          }
        } else if (p.grip) {
          // A CONTACT, HELD. It is a mouse button held down, and it lasts
          // exactly as long as the fingers are together — which is the fix for
          // the thing Colin found twice: a merge that pressed and let go in the
          // same instant spun the wordmark once and could not carry it. Opening
          // the fingers ends it, with a click if it never really moved, so a
          // contact made and released on a button is still a press of it.
          if (merged) return p;
          const went = p.from ? Math.hypot(x - p.from[0], y - p.from[1]) : 0;
          release(p, went < 12);
          p.grip = false; p.from = null;
          enter(p, el);
        } else {
          return p;
        }
      } else {
        enter(p, el);
      }

      el.dispatchEvent(ev('pointermove', p));
      p.refused = !!el.closest?.(REFUSED);
      // Computed once: swipeAt walks every line of the conversation through
      // getBoundingClientRect, and it is wanted twice.
      const onSurface = !p.refused && swipeAt(el, x, y);
      p.swipe = onSurface && fingers === 2;
      if (p.swipe) {
        // A swipe surface answers a hand that is MOVING. Resting on it does
        // nothing at all, which is the whole difference between a cursor that
        // hovers over the room and one that is stuck to it.
        if (p.speed >= GRAB_PX_S) { press(p); p.stillFrom = 0; }
        p.dwell = 0;
        return p;
      }
      // ON THE SURFACE BUT WITHOUT THE POSTURE: the past does nothing for this
      // hand, rather than quietly becoming something else. Without this an
      // ineligible hand falls through into the hold-to-press block, and the
      // day Y3K.reach.dwell(true) is switched back on the words would become
      // dwell-pressable for the first time.
      if (onSurface) { p.dwell = 0; return p; }
      if (p.refused) { p.dwell = 0; return p; }

      // ---- TWO FINGERS DRAG A PANE ------------------------------------------
      // The discover wall and everything else in here that is overflow:auto.
      // A synthetic pointer cannot scroll one of those at all — a real finger
      // on glass scrolls because the BROWSER does it, not because anything is
      // listening — so the scroll is written rather than dispatched. Exactly
      // two fingers, the same posture that carries the conversation, because
      // one finger has to stay a pointer or nothing could ever be pressed.
      const pane = fingers === 2 ? paneFor(p, el, x, y) : null;
      if (pane) {
        if (p.scrollAt) pane.scrollTop -= (y - p.scrollAt[1]);
        p.scrollAt = [x, y];
        p.dwell = 0;
        return p;
      }
      p.pane = null; p.scrollAt = null;

      // ---- A CONTACT TAKES HOLD ---------------------------------------------
      // Pressed the instant two fingertips meet over something that is moved
      // rather than pressed — the wordmark, a collapse arrow, a window, a
      // window's edge, a slider — and held until they part. This is the only
      // way any of those can be dragged by a hand, and it is why the merge is
      // a contact rather than a count: you have to mean it.
      if (merged && drags(el)) {
        p.swipe = false; p.grip = true; p.from = [x, y];
        press(p);
        p.dwell = 0;
        return p;
      }

      if (!dwellOn) { p.dwell = 0; return p; }
      // ...AND SOME THINGS ASK FOR A CONTACT. The body and the mark are what a
      // hand is over while it is doing something else, so resting on them must
      // not press them — but two fingertips TOUCHING over the body is a thing
      // you did on purpose, and it opens what is under it. This asked how many
      // fingers were up, which is why an open palm over the body pressed it.
      if (!merged && two(el, TWO_TO_PRESS)) { p.dwell = 0; return p; }
      // ...and some things are taken hold of rather than clicked at. Waiting
      // over the mark to spin it is not a gesture anybody would invent; you
      // grab it and turn it. The collapse arrows are deliberately not among
      // them — their tap is a real command, and Colin asked for it back.
      if (noDwell(el)) { p.dwell = 0; return p; }
      // ONE PRESS PER ARRIVAL. After a press the pointer is LATCHED and the
      // clock stops: holding still afterwards must not fire the button again
      // and again. The latch clears when the finger drifts off the spot or
      // moves to something else — which is to say, when it has plainly been
      // aimed somewhere new.
      if (p.dwellAt && Math.hypot(x - p.dwellAt[0], y - p.dwellAt[1]) > DWELL_SLOP) { p.dwellFrom = 0; p.fired = false; }
      if (p.fired) { p.dwell = 0; return p; }
      // The hold survives a little drift, because a hand held still still moves
      // a few pixels.
      if (!p.dwellFrom) { p.dwellFrom = now; p.dwellAt = [x, y]; }
      p.dwell = Math.min(1, (now - p.dwellFrom) / DWELL_MS);
      if (p.dwell >= 1) {
        const hit = p.target;
        press(p);
        release(p, true);
        p.fired = true; p.dwell = 0;
        // A HOLD ON SOMETHING YOU TYPE INTO OPENS THE MICROPHONE. The click has
        // already gone, so the field is focused and grown; this is the other
        // half of what a hand in the air needs, since it has no keyboard. The
        // press is not replaced by it — a hand can still hold on a field just
        // to put the caret there, and the mic is a toggle, so holding again
        // closes it.
        //
        // AIMED AT WHAT THE PRESS LANDED ON, read before it goes. release()
        // happens to leave p.target alone today, so this is not load-bearing
        // yet — it is the same value either way. It is written this way because
        // the day release() does tidy up after itself, the difference between
        // these two lines is a microphone that silently never opens, and that
        // is not a thing anybody would find by reading the release.
        if (onMic && hit?.closest?.(TEXT_FIELD)) { try { onMic(hit); } catch { /* the mic is not this file's problem */ } }
      }
      return p;
    },

    // AN AIR TAP: the same thing a completed hold does, arriving all at once.
    // A jab has no dwell to show, so it has no ring; it simply presses. Refused
    // controls stay refused — a synthetic press cannot open a microphone however
    // it was asked for — and a pointer already dragging ignores it, because a
    // jolt in the middle of a drag is the hand steadying itself, not a click.
    // A PINCH, HELD. Not a click: a press that stays down until the fingers
    // open again, so the things you drag — the budget slider, the wordmark's
    // spin, the collapse arrows — answer a hand the same way they answer a
    // mouse. A press-and-release in one place still produces the click a plain
    // button wants, so this covers both without the caller having to know
    // which kind of thing it is pointing at.
    holdAt(key, x, y, now, fingers = 0) {
      const p = slot(key);
      p.seen = now; p.x = x; p.y = y;
      if (p.down) return true;
      const el = at(x, y, p);
      p.refused = !!el?.closest?.(REFUSED);
      if (!el || p.refused) return false;
      // THE PAST IS DRAGGED, NOT PRESSED — and dragging it needs the posture,
      // whichever gesture asks for it. Without this the pinch is a second door
      // into the same scroll and a more eager one: holdAt has no speed gate at
      // all, so it presses on the very first frame where a swipe has to clear
      // GRAB_PX_S first. It costs nothing to refuse, because #chat-history is
      // pointer-events:none and the only thing under a line of text is the
      // bare stage canvas, where there was never anything to press.
      if (fingers !== 2 && swipeAt(el, x, y)) return false;
      enter(p, el);
      p.swipe = false;              // a held pinch is not a surface drag
      p.from = [x, y];
      press(p);
      return true;
    },
    letGo(key) {
      const p = live.get(key);
      if (!p || !p.down) return;
      // A click only if it barely moved: a pinch dragged across a slider was
      // a drag, and firing a click at the end of it would press whatever it
      // happened to finish over.
      const moved = p.from ? Math.hypot(p.x - p.from[0], p.y - p.from[1]) : 0;
      release(p, moved < 12);
      p.from = null; p.grip = false;
    },

    // A finger that curled, left the frame, or was never extended.
    end(key) {
      const p = live.get(key);
      if (!p) return;
      // A swipe ends with a plain up; a held press has already fired.
      release(p, false);
      drop(p, 'gone');
    },

    // Called every frame. Anything that has not been moved recently is gone —
    // this is what guarantees rule 1 even when a hand vanishes between frames.
    sweep(now) {
      for (const p of [...live.values()]) {
        if (now - p.seen > LIVE_MS) { release(p, false); drop(p, 'gone'); }
      }
    },

    // Everything up, now. For a switch being turned off mid-gesture.
    clear() { for (const p of [...live.values()]) { release(p, false); drop(p, 'gone'); } live.clear(); },

    // Live, from the console: Y3K.reach.dwell(true) puts hold-to-press back.
    // Pointers mid-hold are reset so the switch cannot fire one on the way in.
    dwell(on) {
      if (on === undefined) return dwellOn;
      dwellOn = Boolean(on);
      for (const p of live.values()) { p.dwellFrom = 0; p.dwell = 0; p.fired = false; }
      return dwellOn;
    },
    state(key) { return live.get(key) || null; },
    count() { return live.size; },
    _refused: REFUSED,
    _swipe: SWIPE,
    _draggable: DRAGGABLE,
    _noDwell: NO_DWELL,
    _pressable: PRESSABLE,
    _textField: TEXT_FIELD,
    _snapR: SNAP_R,
  };
}
