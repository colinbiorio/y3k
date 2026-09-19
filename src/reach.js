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
const REFUSED = '#chat-voice, #chat-camera, #chat-upload, input[type=file], #nav-settings';

const DWELL_MS = 600;      // hold on the spot to press
const DWELL_SLOP = 34;     // px of drift allowed while holding — a hand is not a mouse
// HOLD-TO-PRESS IS OFF, AND THE PINCH IS THE PRESS.
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
const DWELL_DEFAULT = false;
const LIVE_MS = 240;       // no word from a pointer for this long and it is cancelled


// onWords() is handed in rather than worked out here, so there is one
// definition of where the past lives and it belongs to the thing that wrote it.
export function createReach({ onWords = null } = {}) {
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

  const at = (x, y) => document.elementFromPoint(x, y);

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
    if (why === 'gone') live.delete(p.key);
  }

  return {
    // One call per acting finger per frame. Returns the pointer's state so the
    // cursor can draw its own hold.
    move(key, x, y, now) {
      const p = slot(key);
      // HOW FAST THE HAND IS GOING, smoothed a little so one jittery frame
      // cannot look like a flick or one slow frame like a stop.
      const dt = p.seen ? Math.max(1, now - p.seen) : 16;
      const inst = Math.hypot(x - p.x, y - p.y) / (dt / 1000);
      p.speed = p.seen ? p.speed + (inst - p.speed) * 0.35 : 0;
      p.seen = now;
      p.x = x; p.y = y;

      const el = at(x, y);
      // A pointer that wandered off the page keeps its press rather than
      // dropping it: a hand crossing the bezel mid-drag is still dragging.
      if (!el) { if (p.down) p.target?.dispatchEvent(ev('pointermove', p)); return p; }

      if (p.down) {
        // A DRAG IN PROGRESS. It follows the hand wherever it goes — over other
        // elements, past the edge of the window — because that is what a drag
        // is. It ends when the finger leaves the surface it grabbed, or when
        // the hand stops.
        p.target?.dispatchEvent(ev('pointermove', p));
        if (p.swipe) {
          // LEFT THE BODY: let go, at whatever speed the hand was going — which
          // is what leaves it spinning after a flick. Without this the press
          // begun on the orb stayed down forever, so the finger could never
          // afterwards hold on anything.
          if (!swipeAt(el, x, y)) { release(p, false); enter(p, el); }
          else {
            // WENT STILL: let go, at rest. The room stops where the hand did.
            if (p.speed < STILL_PX_S) {
              if (!p.stillFrom) p.stillFrom = now;
              if (now - p.stillFrom >= STILL_MS) { release(p, false); p.stillFrom = 0; return p; }
            } else { p.stillFrom = 0; }
            return p;
          }
        } else {
          return p;
        }
      } else {
        enter(p, el);
      }

      el.dispatchEvent(ev('pointermove', p));
      p.refused = !!el.closest?.(REFUSED);
      p.swipe = !p.refused && swipeAt(el, x, y);
      if (p.swipe) {
        // A swipe surface answers a hand that is MOVING. Resting on it does
        // nothing at all, which is the whole difference between a cursor that
        // hovers over the room and one that is stuck to it.
        if (p.speed >= GRAB_PX_S) { press(p); p.stillFrom = 0; }
        p.dwell = 0;
        return p;
      }
      if (p.refused) { p.dwell = 0; return p; }
      if (!dwellOn) { p.dwell = 0; return p; }   // the pinch is the only press
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
        press(p);
        release(p, true);
        p.fired = true; p.dwell = 0;
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
    holdAt(key, x, y, now) {
      const p = slot(key);
      p.seen = now; p.x = x; p.y = y;
      if (p.down) return true;
      const el = at(x, y);
      p.refused = !!el?.closest?.(REFUSED);
      if (!el || p.refused) return false;
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
      p.from = null;
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
  };
}
