// ============================================================================
// twohand.js — WHAT TWO HANDS SAY.
//
// A second language, spoken by both hands at once.
//
// THE VOCABULARY:
//
//   one finger to one finger     one colour
//   two to two                   two colours
//   three to three               three
//   four to four                 four
//   both hands open, apart / together    how big the body is
//
// HOW MANY, NOT WHICH ONE. This used to ask which PAIR was touching — middles
// for two colours, ring fingers for three — and it was too much to ask of the
// tracker. Telling a ring fingertip from a little fingertip when the two hands
// are meeting means resolving adjacent landmarks on two hands that are
// occluding each other, which is exactly where the model is least sure. So it
// counts instead: put n fingers against n fingers and you get n colours, and
// it never has to know which ones they were. Six fingers touching is three
// colours.
//
// And touching again changes the NEXT one: touch two against two once and the
// first colour turns over, again and the second does, and round. So how MANY
// fingers you use says how many colours the body has, and how OFTEN you do it
// says which of them you are changing.
//
// THE FORM IS NOT HERE ANY MORE. It was the thumbs, then a fist bump, and both
// were finicky for the same reason as the colours were: the gesture happens
// where the two hands meet, and that is where the tracking is worst. It is a
// one-handed gesture now — see the orb turn in handview.js — and this module
// only lends it the list of looks to walk.
//
// TOUCHING IS THE WHOLE TRIGGER. There is no posture to get into first: bring
// two fingertips together and that is the gesture, whatever the other eight
// fingers happen to be doing. The only thing asked of them is that the two
// fingers actually TOUCHING are extended — a pair of fingertips that are folded
// into a fist are not being offered to each other, they are just near each
// other, and a fist should not repaint the room.
//
// THE FORM IS THE ONE EXCEPTION TO THAT, AND IT HAS TO BE. It used to be the
// thumbs and it is a fist bump now, which means the gesture is made by the one
// part of the hand that has no extension to ask about: the knuckles are where
// they are whether the hand is open or shut. So it is measured as the CLOSEST
// approach between the two knuckle rows — whichever knuckles actually meet,
// and in whatever orientation the two fists come together, the number goes to
// nearly nothing. A centroid would not do: bump two fists and the centres of
// the two rows are still half a hand-width apart, which is most of the way to
// the threshold before anything has touched.
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
// THE KNUCKLE ROW — index, middle, ring, little MCPs, the four bones across the
// back of a closed hand. The form gesture is a fist bump now.

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
  let touching = [false, false, false, false, false];   // only [0] is used now
  let lastFire = [0, 0, 0, 0, 0];
  let turns = [0, 0, 0, 0, 0];      // per NUMBER of colours, not per finger
  let lastN = 0;
  let formAt = -1;
  let swell = 1;
  const hues = [0.08, 0.42, 0.68, 0.88];   // one per colour slot, walked on touch

  const span = (h) => Math.hypot(h.points[WRIST][0] - h.points[KNUCKLE][0], h.points[WRIST][1] - h.points[KNUCKLE][1]);
  const gap = (a, b, i) => Math.hypot(a.points[TIP[i]][0] - b.points[TIP[i]][0], a.points[TIP[i]][1] - b.points[TIP[i]][1]);
  // How many fingers this hand is offering — its own four, thumb excluded.
  const openFingers = (h) => {
    const e = h.extended || [];
    let n = 0;
    for (let i = 1; i < TIP.length; i++) if (e[i] === true) n += 1;
    return n;
  };
  // ARE THEY TOUCHING — the nearest approach between any offered fingertip of
  // one hand and any of the other. Nearest, not matched: which finger met which
  // is the question that was too hard to answer, and this never asks it.
  const tipGap = (a, b) => {
    let min = Infinity;
    for (let i = 1; i < TIP.length; i++) {
      if (a.extended?.[i] !== true) continue;
      const p = a.points[TIP[i]];
      if (!p) continue;
      for (let j = 1; j < TIP.length; j++) {
        if (b.extended?.[j] !== true) continue;
        const q = b.points[TIP[j]];
        if (!q) continue;
        const dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (dd < min) min = dd;
      }
    }
    return min;
  };

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

      // ---- THE TOUCH: HOW MANY FINGERS, NOT WHICH ONES --------------------
      // Two things are measured and neither needs the model to tell a ring
      // fingertip from a little one. ARE the hands touching — the nearest
      // approach between any fingertip of one and any of the other — and HOW
      // MANY fingers are being offered, which is a count of each hand's own
      // extended fingers and needs no cross-hand matching at all.
      //
      // The thumb is not counted, for the reason it is not counted anywhere
      // else: its extension test crosses right where a resting thumb sits and
      // a count including it chatters at the tracker's own rate. So one to four.
      const d = tipGap(a, b) / ruler;
      const n = Math.min(openFingers(a), openFingers(b));
      const contact = d < APART && n >= 1;

      if (!touching[0] && d < TOUCH && n >= 1 && now - lastFire[0] > REFRACTORY_MS) {
        touching[0] = true; lastFire[0] = now;
        // HOW OFTEN SAYS WHICH ONE. Counted per number-of-colours, so going
        // from two colours to three and back does not lose your place in
        // either — turns[2] and turns[3] are different tallies.
        turns[n] += 1;
        const slot = (turns[n] - 1) % n;
        hues[slot] = (hues[slot] + STEP) % 1;
        paint(n);
        lastN = n;
      } else if (touching[0] && d > APART) {
        touching[0] = false;
      }

      // Sizing, or fingertips in contact (or about to be): either way the hands
      // are talking to the body and not pointing at the screen.
      return sizing || contact || now - Math.max(...lastFire) < REFRACTORY_MS;
    },

    // THE LOOKS, WALKED ONE AT A TIME. Lent to handview, which owns the
    // one-handed gesture that now drives this — the list lives here because
    // this is where every other thing the body can be told lives.
    nextLook() {
      formAt = (formAt + 1) % LOOKS.length;
      const look = LOOKS[formAt];
      if (look.form) {
        // A render form: drop any shape first, or the new way of drawing would
        // be applied to whatever geometry was left standing.
        body?.setShape?.(null);
        body?.setForm?.(look.form);
      } else {
        body?.setShape?.(parseShape('<<shape: ' + look.shape + '>>'));
      }
      return look.form || look.shape;
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
      return { live, swell: +swell.toFixed(3), turns: turns.slice(), n: lastN, looks: LOOKS.length, at: formAt, look: look ? (look.form || look.shape) : null };
    },
  };
}
