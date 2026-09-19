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

// Surfaces that answer a moving hand directly. Everything else needs the hold.
const SWIPE = '#stage, #stage canvas, canvas.orb, #chat-history';

// WHAT A HAND MAY NOT PRESS. Each of these needs a real user gesture that a
// synthesised event cannot provide, so pressing them would light the button and
// do nothing at all. The mic is the concrete casualty and always has been.
const REFUSED = '#chat-voice, #chat-camera, #chat-upload, input[type=file], #nav-settings';

const DWELL_MS = 600;      // Colin's number: hold on the spot to press
const DWELL_SLOP = 34;     // px of drift allowed while holding — a hand is not a mouse
const LIVE_MS = 240;       // no word from a pointer for this long and it is cancelled

export function createReach() {
  const live = new Map();   // key -> pointer state
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
    p.target = null; p.dwellFrom = 0; p.dwell = 0; p.dwellAt = null; p.fired = false; p.refused = false;
    if (why === 'gone') live.delete(p.key);
  }

  return {
    // One call per acting finger per frame. Returns the pointer's state so the
    // cursor can draw its own hold.
    move(key, x, y, now) {
      const p = slot(key);
      p.seen = now;
      p.x = x; p.y = y;

      const el = at(x, y);
      // A pointer that wandered off the page keeps its press rather than
      // dropping it: a hand crossing the bezel mid-drag is still dragging.
      if (!el) { if (p.down) p.target?.dispatchEvent(ev('pointermove', p)); return p; }

      if (p.down) {
        // A DRAG IN PROGRESS. It follows the hand wherever it goes — over other
        // elements, past the edge of the window — because that is what a drag
        // is. It ends when the finger leaves the surface it grabbed.
        p.target?.dispatchEvent(ev('pointermove', p));
        if (p.swipe && !el.closest?.(SWIPE)) {
          // OFF THE SURFACE: let go. Without this the press begun on the orb
          // stayed down forever, so the finger could never afterwards hold on
          // anything — every button was permanently mid-drag and unpressable.
          release(p, false);
          enter(p, el);
        } else {
          return p;
        }
      } else {
        enter(p, el);
      }

      el.dispatchEvent(ev('pointermove', p));
      p.refused = !!el.closest?.(REFUSED);
      p.swipe = !p.refused && !!el.closest?.(SWIPE);
      if (p.swipe) {
        // A swipe surface answers at once.
        press(p);
        p.dwell = 0;
        return p;
      }
      if (p.refused) { p.dwell = 0; return p; }
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

    state(key) { return live.get(key) || null; },
    count() { return live.size; },
    _refused: REFUSED,
    _swipe: SWIPE,
  };
}
