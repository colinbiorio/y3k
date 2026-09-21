// ============================================================================
// merge.js — WHICH FINGERTIPS ARE ACTUALLY TOUCHING.
//
// Two fingertips in contact become one cursor. That is the whole of it, and
// getting here took three wrong answers worth writing down, because each one
// was wrong in a way that looked right from the inside.
//
//  1. THUMB AND INDEX, AT 0.42 OF THE HAND'S SPAN. The span is wrist to index
//     knuckle, about 9cm, so this called a thumb and finger "touching" with
//     3.8cm of daylight between them — which is roughly where a relaxed hand
//     sits. It merged constantly, and it merged the one pair it asked about
//     while two fingers held deliberately side by side never merged at all,
//     because nothing ever measured them. Colin: "pointer and thumb merge
//     really easily, when they're not even touching."
//
//  2. TWO FINGERS UP, NO DISTANCE AT ALL. Correct about the failure — the
//     distance was being measured between the wrong two points — and wrong
//     about the fix. Holding up two fingers apart is not a contact, it is a
//     peace sign, and it merged them.
//
//  3. So: EVERY PAIR, MEASURED, and the ones that are touching win. No pair is
//     privileged, which is what lets a thumb-to-index pinch and two fingers
//     pressed together be the same gesture rather than two features. And the
//     pair may span BOTH HANDS, because an index touching an index is a
//     contact a person can make deliberately and precisely — Colin asked for
//     it by name.
//
// THE RULER IS THE HAND, NEVER PIXELS — the same choice perceive.js makes for
// h.pinch, for the same reason. Measured against the wrist-to-knuckle bone,
// "touching" means the same thing at arm's length as it does up close; in raw
// frame units the threshold drifts as the person leans, which reads as the
// gesture getting harder the further away you sit. Across two hands the ruler
// is the mean of both, which is exact when they are touching, because hands
// that are touching are at the same distance from the camera.
//
// A CURLED FINGER CANNOT PAIR WITH ANOTHER FINGER, and that is what keeps a
// fist from being five contacts: a closed hand has every tip within a
// centimetre of every other, so without that rule the tightest shape a hand can
// make would read as the most deliberate contact it can make.
//
// BUT IT CAN PAIR WITH THE THUMB, and getting this wrong broke the best gesture
// in the app for a day. THE RING — thumb to index, the shape that means zero —
// is how the body's form is changed, and MAKING one curls the index: the
// extension test asks what fraction of its own length a finger is spending and
// crosses at about 42 degrees per joint, while a ring needs 45 to 60. So the
// index reads CURLED throughout the one gesture it is most needed for, and
// requiring extension meant the ring could not be seen at all. Colin: "problems
// with changing form, which used to be our most consistent gesture."
//
// A fist is still safe, because a curled finger's ONLY legal partner is the
// thumb and the thumb needs the hand to have at least one finger out — which a
// fist does not. And the thumb itself never needs the test: its own extension
// reading crosses nowhere near where a thumb sits during a pinch.
// ============================================================================

// TOUCHING, AND THEN STILL TOUCHING. Two thresholds or it chatters at the line
// — the tracker's own noise is a couple of percent of the span, and a single
// threshold turns that into a press that opens and closes at 24Hz.
//
// 0.22 of the span is about 2cm, and it has to be a little wider than skin
// contact because the tips are landmark CENTRES: two fingers pressed side by
// side have their tip landmarks a finger's width apart and never get closer,
// and a pinch's pads meet with the nail centres about as far apart. Measured
// against the two postures it has to separate:
//
//   pressed together   ~1.7cm   0.19 of the span
//   relaxed, apart     ~2.8cm   0.31
//
// which is not a wide gap, and it is the narrowest judgement in this file. If
// contact is too eager, lower MERGE_ON. If a deliberate touch will not take,
// raise it. Those two numbers are the only feel knobs in here.
export const MERGE_ON = 0.22;
export const MERGE_OFF = 0.34;

const THUMB = 0, INDEX = 1;
const WRIST = 0, KNUCKLE = 5;    // the in-hand ruler, same two points as h.pinch

// AN OPEN HAND MAKES NO FINGER-TO-FINGER CONTACT, whatever its tips measure.
//
// This is the one case the distance alone cannot settle, and it matters because
// an open palm is the halt gesture — a hand held up to STOP the room, which
// must not also press what it is held over. Held flat with the fingers relaxed,
// adjacent tips sit about 2.5cm apart; held flat with them adducted, about
// 1.8cm. Both are an open hand and neither is a contact, but only one of them
// is on the far side of the threshold. So the posture answers instead of the
// ruler: to press two fingers together you SHAPE the hand, and a hand with
// every finger out has not been shaped.
//
// IT DOES NOT APPLY TO THE THUMB, and that distinction is the whole of it. The
// ambiguity above is between two ADJACENT FINGERTIPS and a flat hand; a thumb
// touching a fingertip is never ambiguous with a flat hand, because on an open
// palm the thumb is six centimetres from every tip and the distance rejects it
// on its own. Blanket-skipping the hand refused a real pinch made with the
// other fingers out, which is how most people pinch.
const OPEN_HAND = 4;             // extended fingers, thumb not counted

// How many contacts may be live at once. One per hand, or one across both, is
// what a person actually makes; the cap exists so a shape nobody meant cannot
// fill the screen with bubbles.
const MAX_MERGES = 2;

const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// WHICH PAIRS ARE EVEN A GESTURE. Every rule of the header, in one place.
function allowed(A, B) {
  // Two thumbs are not a contact, on one hand or across two.
  if (A.kind === 'thumb' && B.kind === 'thumb') return false;
  if (A.kind === 'thumb' || B.kind === 'thumb') {
    const other = A.kind === 'thumb' ? B : A;
    if (other.kind === 'out') return true;
    // A CURLED FINGER MAY TAKE THE THUMB ONLY IF IT IS THE INDEX. That one pair
    // is THE RING, and it has to be allowed curled because making a ring curls
    // the index past the extension threshold. Every OTHER curled fingertip is
    // folded into the palm — which is exactly where a resting thumb lies, on
    // top of them. Left open to all four, a peace sign merged: index and middle
    // out, ring and little tucked under a thumb a centimetre away.
    return other.tip === INDEX;
  }
  // A curled finger has no other partner, which is what keeps a fist quiet.
  if (A.kind === 'in' || B.kind === 'in') return false;
  // ...and two fingertips may only meet when neither hand is flat open, so the
  // halt cannot press what it is held over.
  return !A.open && !B.open;
}

// A stable name for a contact, so the hysteresis can ask "was THIS pair
// touching last frame". Keyed by handedness rather than array position for the
// reason every other latch in this app is: when one hand leaves, the other
// moves from slot 1 to slot 0, and a key made of slots would carry the gone
// hand's state onto the one still working.
const nameOf = (h, hand, tip) => (h.handedness || 'i' + hand) + ':' + tip;
export const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

// hands: the same array drawCursors reads — ok, points, tips, extended.
// was:   a Set of pair keys that were touching last frame, for the wider
//        release threshold. Pass null on the first frame.
export function findMerges(hands, { on = MERGE_ON, off = MERGE_OFF, was = null, max = MAX_MERGES } = {}) {
  const tips = [];
  for (let hand = 0; hand < hands.length; hand++) {
    const h = hands[hand];
    if (!h || !h.ok || !h.points || h.points.length < 21 || !h.tips) continue;
    let out = 0;
    for (let i = 1; i < 5; i++) if (h.extended?.[i] === true) out += 1;
    // A FIST OFFERS NOTHING. With no finger out there is no partner a thumb
    // could legally take, and every tip is bunched within a centimetre.
    if (!out) continue;
    const open = out >= OPEN_HAND;
    const w = h.points[WRIST], k = h.points[KNUCKLE];
    if (!w || !k) continue;
    const span = hyp(w[0], w[1], k[0], k[1]);
    if (!(span > 1e-4)) continue;              // a hand with no ruler measures nothing
    for (let i = 0; i < 5; i++) {
      const t = h.tips[i];
      if (!t) continue;
      // THREE KINDS, and the pair rule below reads all three. A thumb pairs
      // with anything; an extended finger pairs with the thumb or with another
      // extended finger; a curled finger pairs with the thumb ALONE — which is
      // what lets the ring be made, since making one curls the index.
      const kind = i === THUMB ? 'thumb' : (h.extended?.[i] === true ? 'out' : 'in');
      tips.push({ hand, tip: i, x: t[0], y: t[1], span, kind, open, name: nameOf(h, hand, i) });
    }
  }

  const found = [];
  for (let a = 0; a < tips.length; a++) {
    for (let b = a + 1; b < tips.length; b++) {
      const A = tips[a], B = tips[b];
      if (!allowed(A, B)) continue;
      const ruler = (A.span + B.span) / 2;
      const ratio = hyp(A.x, A.y, B.x, B.y) / ruler;
      const key = pairKey(A.name, B.name);
      // Already in contact? Then it takes the wider gap to break it.
      if (ratio >= (was && was.has(key) ? off : on)) continue;
      found.push({ a: A, b: B, key, ratio, cross: A.hand !== B.hand });
    }
  }

  // TIGHTEST FIRST, AND EVERY FINGERTIP SPENT ONCE. Three fingers bunched
  // together are three pairs under the threshold and one contact; taking them
  // in order of how close they are means the two that are actually touching
  // win and the third is left as its own cursor.
  found.sort((p, q) => p.ratio - q.ratio);
  const spent = new Set(), crossed = new Set(), out = [];
  for (const m of found) {
    if (out.length >= max) break;
    if (spent.has(m.a.name) || spent.has(m.b.name)) continue;
    // A hand already reaching across to the other one is doing that and not
    // also pinching itself. Without this a thumb-to-thumb touch and each
    // hand's own pinch could all be live at once, which is three cursors from
    // a gesture that was one.
    if (crossed.has(m.a.hand) || crossed.has(m.b.hand)) continue;
    spent.add(m.a.name); spent.add(m.b.name);
    if (m.cross) { crossed.add(m.a.hand); crossed.add(m.b.hand); }
    out.push({
      key: m.key, ratio: m.ratio, cross: m.cross,
      a: { hand: m.a.hand, tip: m.a.tip },
      b: { hand: m.b.hand, tip: m.b.tip },
    });
  }
  return out;
}
