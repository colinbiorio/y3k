// ============================================================================
// twohand.js — WHAT TWO HANDS SAY.
//
// A second language, spoken by both hands at once.
//
// THE VOCABULARY:
//
//   thumbs touch              the next form
//   index fingers touch       one colour
//   middle fingers touch      two colours
//   ring fingers touch        three
//   little fingers touch      four
//   both hands open, apart / together    how big the body is
//
// And for the colours, touching again changes the NEXT one: touch middles once
// and the first colour turns over, touch again and the second does, and round.
// So the finger you use says how many colours the body has, and how often you
// use it says which of them you are changing.
//
// TOUCHING IS THE WHOLE TRIGGER. There is no posture to get into first: bring
// two fingertips together and that is the gesture, whatever the other eight
// fingers happen to be doing. The only thing asked of them is that the two
// fingers actually TOUCHING are extended — a pair of fingertips that are folded
// into a fist are not being offered to each other, they are just near each
// other, and a fist should not repaint the room.
//
// SIZE IS THE ONE EXCEPTION, and it is an exception because it is the one
// CONTINUOUS gesture. The touches are events: they happen and are over. Size is
// a value read every frame from how far apart the hands are, so with nothing
// gating it the body would resize itself the whole time both hands were in
// frame — every reach for the keyboard would rescale the room. It asks for the
// smallest gate that is still natural: both hands OPEN, which is the shape a
// person's hands already make when they take hold of something.
//
// EVERYTHING IS MEASURED IN HAND-WIDTHS, never in pixels or frame units. The
// ruler is the wrist-to-index-knuckle span, which is a bone: it shrinks with
// distance exactly as the rest of the hand does, so "touching" and "a hand's
// width apart" mean the same thing near the camera and across the room. A
// threshold in raw frame units would tighten as you lean back, which reads as
// the gestures getting harder the further away you sit.
// ============================================================================

import { parseShape } from './tags.mjs';

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

// EVERY FORM THE BODY HAS, in the order the thumbs walk through them.
//
// It used to be the four RENDER forms only — field, orb, web, plasma — which
// are how the field is drawn rather than what it is shaped like. Those are
// lovely and they stay, but they are four of seventeen: the whole library of
// closed-form shapes was unreachable by hand, which is most of what has been
// built. So the walk is one list of LOOKS covering both axes: the four ways of
// drawing first, because they are the cheapest and the most familiar, then
// every shape in turn, each with digits chosen to show what it is rather than
// to sit at a default.
//
// Written as the grammar writes them and parsed by the same parser the presence
// uses, so there is exactly one definition of what a shape spec looks like and
// these cannot drift away from it.
const LOOKS = [
  { form: 'field' }, { form: 'orb' }, { form: 'web' }, { form: 'plasma' },
  { shape: 'shell 4 6' },
  { shape: 'ring 5 3' },
  { shape: 'disc' },
  { shape: 'helix 5 4' },
  { shape: 'lattice 4 5' },
  { shape: 'spiral 6 4' },
  { shape: 'cube' },
  { shape: 'ellipsoid 3 7' },      // a superellipsoid: round one way, boxy the other
  { shape: 'super 6 3 7' },        // the supershape, at a setting with real lobes
  { shape: 'hopf 5 5' },           // the fibration: linked tori
  { shape: 'calabi 5 5' },         // the Calabi-Yau cross-section
  { shape: 'pendulum 5' },         // 512 double pendulums, diverging
];

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
    // Returns true on any frame the hands are SAYING something — sizing, or a
    // pair in contact — which is the caller's signal to stand the pointers
    // down, so bringing two fingertips together cannot also press whatever they
    // happen to be over.
    read(list, now) {
      if (list.length < 2) {
        if (live) { live = false; touching = [false, false, false, false, false]; }
        return false;
      }
      const [a, b] = list;
      const ruler = (span(a) + span(b)) / 2;
      if (!(ruler > 1e-4)) return false;
      live = true;

      // ---- SIZE: how far apart the hands are -------------------------------
      // The one continuous gesture, and so the one that needs asking for: both
      // hands OPEN. Absolute rather than relative to wherever they started, so
      // the same distance always means the same size and it can be learned
      // once. Eased, because a hand shakes and the body should not.
      const open = (h) => h.extended && h.extended.length === 5 && h.extended.every((v) => v === true);
      const sizing = open(a) && open(b);
      if (sizing) {
        const apart = Math.hypot(a.points[WRIST][0] - b.points[WRIST][0], a.points[WRIST][1] - b.points[WRIST][1]) / ruler;
        const t = Math.max(0, Math.min(1, (apart - NEAR) / (FAR - NEAR)));
        swell += ((SMALL + (BIG - SMALL) * t) - swell) * 0.12;
        body?.setSwell?.(swell);
      }

      // ---- THE TOUCHES -----------------------------------------------------
      // No posture, no permission: two fingertips meeting IS the gesture. The
      // only thing asked is that both of them are out — fingertips folded into
      // a fist are near each other by accident, not offered to each other.
      let contact = false;
      for (let i = 0; i < TIP.length; i++) {
        // BOTH EXPLICITLY OUT. Not "not known to be in": a reading the
        // extension test could not make must not become a gesture.
        const out = a.extended?.[i] === true && b.extended?.[i] === true;
        const d = out ? gap(a, b, i) / ruler : Infinity;
        if (d < APART) contact = true;
        if (!touching[i] && d < TOUCH && now - lastFire[i] > REFRACTORY_MS) {
          touching[i] = true; lastFire[i] = now;
          turns[i] += 1;
          if (i === 0) {
            // THE THUMBS WALK EVERY LOOK THE BODY HAS.
            formAt = (formAt + 1) % LOOKS.length;
            const look = LOOKS[formAt];
            if (look.form) {
              // A render form: drop any shape first, or the new way of drawing
              // would be applied to whatever geometry was left standing.
              body?.setShape?.(null);
              body?.setForm?.(look.form);
            } else {
              body?.setShape?.(parseShape('<<shape: ' + look.shape + '>>'));
            }
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
      // Sizing, or fingertips in contact (or about to be): either way the hands
      // are talking to the body and not pointing at the screen.
      return sizing || contact || now - Math.max(...lastFire) < REFRACTORY_MS;
    },

    // The posture ended, or the hands went away. The size STAYS where it was
    // put — it is a thing you set, not a thing you hold — and so do the
    // colours. Only the touch state is forgotten, so the next posture starts
    // from apart rather than mid-touch.
    reset() {
      live = false;
      touching = [false, false, false, false, false];
    },
    state() {
      const look = formAt < 0 ? null : LOOKS[formAt];
      return { live, swell: +swell.toFixed(3), turns: turns.slice(), looks: LOOKS.length, at: formAt, look: look ? (look.form || look.shape) : null };
    },
  };
}
