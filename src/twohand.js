// ============================================================================
// twohand.js — WHAT TEN FINGERS SAY.
//
// A separate language, entered by holding both hands up with every finger out.
// Ten fingers is a deliberate, unmistakable posture: nobody makes it by
// accident reaching for a cup, which is exactly why it can be given a whole
// vocabulary of its own without colliding with the pointer. While it is held,
// the pointers stand down — your hands are shaping the body, not aiming at it.
//
// THE VOCABULARY:
//
//   hands apart / together    how big the body is
//   thumbs touch              the next form
//   index fingers touch       one colour
//   middle fingers touch      two colours
//   ring fingers touch        three
//   little fingers touch      four
//
// And for the colours, touching again changes the NEXT one: touch middles once
// and the first colour turns over, touch again and the second does, and round.
// So the finger you use says how many colours the body has, and how often you
// use it says which of them you are changing.
//
// EVERYTHING IS MEASURED IN HAND-WIDTHS, never in pixels or frame units. The
// ruler is the wrist-to-index-knuckle span, which is a bone: it shrinks with
// distance exactly as the rest of the hand does, so "touching" and "a hand's
// width apart" mean the same thing near the camera and across the room. A
// threshold in raw frame units would tighten as you lean back, which reads as
// the gestures getting harder the further away you sit.
// ============================================================================

const TIP = [4, 8, 12, 16, 20];     // thumb, index, middle, ring, little
const WRIST = 0, KNUCKLE = 5;

// Touching, and apart again. Two thresholds, not one, or a pair of fingertips
// resting near the line fires over and over.
const TOUCH = 0.42;                 // in hand-widths
const APART = 0.62;
const REFRACTORY_MS = 260;

// How far apart the hands are, in hand-widths, and what that means for size.
const NEAR = 1.3, FAR = 5.0;
const SMALL = 0.55, BIG = 1.8;

// The forms, in the order the thumbs walk through them. Matches FORMS in
// tags.mjs; 'field' is the one the body wears by default, so the first touch
// moves off it rather than appearing to do nothing.
const FORMS = ['orb', 'web', 'plasma', 'field'];

// Where N colours sit on the sphere. One anchor with a sharp falloff floods the
// whole body, which is what "one colour" should mean; after that they are
// spread as evenly as N points can be, so each gets a real region rather than a
// smear. Four is a tetrahedron — the only even way to put four points on a
// sphere, and it happens to show all four from almost any angle.
function dirsFor(n) {
  if (n <= 1) return [[0, 0, 1]];
  if (n === 2) return [[1, 0, 0], [-1, 0, 0]];
  if (n === 3) return [[1, 0, 0], [-0.5, 0, 0.866], [-0.5, 0, -0.866]];
  const k = 1 / Math.sqrt(3);
  return [[k, k, k], [k, -k, -k], [-k, k, -k], [-k, -k, k]];
}

// A colour wheel with some room in it. Each turn of a slot walks a big step
// round the hue circle, so two touches never give you two colours that look
// like the same colour.
const STEP = 0.31;
function hueToRgb(h) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return Math.max(0, Math.min(1, Math.min(k, 4 - k, 1)));
  };
  // Saturated and bright, but not maximal: the field is additive and a pure
  // primary blows out to white where two anchors meet.
  const s = 0.72, v = 0.96;
  return [v * (1 - s + s * f(5)), v * (1 - s + s * f(3)), v * (1 - s + s * f(1))];
}

export function createTwoHand({ body } = {}) {
  let live = false;                 // is the ten-finger posture being held?
  let touching = [false, false, false, false, false];
  let lastFire = [0, 0, 0, 0, 0];
  let turns = [0, 0, 0, 0, 0];      // how many times each pair has been touched
  let formAt = -1;
  let swell = 1;
  const hues = [0.08, 0.42, 0.68, 0.88];   // one per colour slot, walked on touch

  const span = (h) => Math.hypot(h.points[WRIST][0] - h.points[KNUCKLE][0], h.points[WRIST][1] - h.points[KNUCKLE][1]);
  const gap = (a, b, i) => Math.hypot(a.points[TIP[i]][0] - b.points[TIP[i]][0], a.points[TIP[i]][1] - b.points[TIP[i]][1]);

  function paint(n) {
    const dirs = dirsFor(n);
    body?.paintColors?.(dirs.map((dir, i) => ({ dir, rgb: hueToRgb(hues[i % hues.length]) })));
  }

  return {
    // Returns true while the posture is held, which is the caller's signal to
    // stand the pointers down.
    read(list, now) {
      const ten = list.length >= 2
        && list[0].extended && list[1].extended
        && list[0].extended.every(Boolean) && list[1].extended.every(Boolean);
      if (!ten) {
        if (live) { live = false; touching = [false, false, false, false, false]; }
        return false;
      }
      const [a, b] = list;
      const ruler = (span(a) + span(b)) / 2;
      if (!(ruler > 1e-4)) return false;
      if (!live) { live = true; }

      // ---- SIZE: how far apart the hands are -------------------------------
      // Absolute, not relative to wherever they happened to start: the same
      // distance always means the same size, so it can be learned once. Eased,
      // because a hand shakes and the body should not.
      const apart = Math.hypot(a.points[WRIST][0] - b.points[WRIST][0], a.points[WRIST][1] - b.points[WRIST][1]) / ruler;
      const t = Math.max(0, Math.min(1, (apart - NEAR) / (FAR - NEAR)));
      swell += ((SMALL + (BIG - SMALL) * t) - swell) * 0.12;
      body?.setSwell?.(swell);

      // ---- THE TOUCHES -----------------------------------------------------
      for (let i = 0; i < TIP.length; i++) {
        const d = gap(a, b, i) / ruler;
        if (!touching[i] && d < TOUCH && now - lastFire[i] > REFRACTORY_MS) {
          touching[i] = true; lastFire[i] = now;
          turns[i] += 1;
          if (i === 0) {
            // THE THUMBS WALK THE FORMS.
            formAt = (formAt + 1) % FORMS.length;
            body?.setForm?.(FORMS[formAt]);
          } else {
            // EVERY OTHER PAIR IS A NUMBER OF COLOURS, and each touch turns
            // over the next one of them in turn.
            const n = i;                       // index 1 -> 1 colour ... little 4 -> 4
            const slot = (turns[i] - 1) % n;
            hues[slot] = (hues[slot] + STEP) % 1;
            paint(n);
          }
        } else if (touching[i] && d > APART) {
          touching[i] = false;
        }
      }
      return true;
    },

    // The posture ended, or the hands went away. The size STAYS where it was
    // put — it is a thing you set, not a thing you hold — and so do the
    // colours. Only the touch state is forgotten, so the next posture starts
    // from apart rather than mid-touch.
    reset() {
      live = false;
      touching = [false, false, false, false, false];
    },
    state() { return { live, swell: +swell.toFixed(3), turns: turns.slice(), form: formAt < 0 ? null : FORMS[formAt] }; },
  };
}
