// ============================================================================
// handview.js — SHOWING THE HAND, AND LETTING IT REACH.
//
// Three jobs, and they answer three different questions.
//
// THE SKELETON, over the camera picture: "does it see me?" Dots and bones for
// each hand, laid on the video. Not decoration: a tracker with no visible state
// is one you have to take on faith, and when it fails — bad light, hand
// edge-on, half out of frame — this is what tells you whether the machine lost
// you or the feature is broken.
//
// THE CURSORS, on the screen: "where am I pointing?" One soft mark per
// EXTENDED fingertip. A curled finger leaves no mark, so holding up one finger
// gives you one cursor — which is what a person expects, and the only way
// pointing at something is unambiguous.
//
// THE REACH, through src/reach.js: one finger per hand actually acts. Moving it
// over the room turns the orb and over the conversation scrolls it; holding it
// on a button for six tenths of a second presses that button, with the hold
// drawn as a ring closing around the mark so the wait is visible rather than
// mysterious.
//
// WHY ONE ACTING FINGER PER HAND AND NOT FIVE. Five pointers arriving on one
// button at slightly different moments is not five times the control, it is a
// fight: the press lands, the neighbour's press lands, and the app receives a
// burst nobody meant. A hand points with one finger. So every extended finger
// is DRAWN, and the index — or the single finger you are holding up, whichever
// you meant — is the one that reaches. Two hands means two pointers, which is
// exactly what two fingers on a touchscreen already are.
// ============================================================================

import { createOneEuro } from './euro.js';
import { HAND_BONES, HAND_TIPS } from './perceive.js';
import { createTwoHand } from './twohand.js';
import { findMerges } from './merge.js';

// HOW MUCH OF THE CAMERA FRAME A HAND HAS TO SWEEP to cross the longer side of
// the screen: this is a half-extent, so 0.32 means about two thirds of the
// frame, edge to edge. Bigger is calmer and more tiring; smaller is quicker and
// twitchier. There is nothing to calibrate against — no web API gives the
// physical size of anything — so this is a chosen feel, and it is the one
// number to change if the marks feel cramped or jumpy.
const REACH = 0.32;

// Fingertip colours and sizes, thumb to pinky. The index leads because it is
// the one people point with; the thumb matches it because those two are the
// pinch.
const TINT = ['#cdd6ff', '#ffffff', '#b9c6dd', '#b9c6dd', '#b9c6dd'];
// Half what they were: at the old size five marks on one hand covered a real
// part of the screen, and a pointer you cannot see past is not a pointer.
const SIZE = [15, 19, 12, 11, 10];
const HANDS = 2;
// HOW MANY CONTACTS CAN BE LIVE AT ONCE, and so how many bubbles exist. One
// per hand, or one made between them — merge.js will never hand back more.
const CONTACTS = 2;
const INDEX = 1;            // where the index finger sits in TIPS

// HOW MANY FINGERS A HAND IS HOLDING UP, WITH THE THUMB LEFT OUT.
//
// TWO OF THEM SCROLL THE PAST. One finger points; an open hand does nothing.
//
// Colin: "it'll be accidentally scrolled too much". It was, and the worst of it
// was not a stray finger — the per-finger loop that drives the pointer runs
// BEFORE the palm-halt branch and the halt deliberately does not stand the
// pointer down, so an open hand swept across the screen dragged the
// conversation the whole way. Asking for exactly two kills that, and every
// three-, four- and five-finger sweep with it.
//
// THE THUMB IS NOT COUNTED, and that is measured rather than assumed. Its
// extension test crosses at a thumb held roughly parallel to the fingers —
// 1.117 of its threshold at 60 degrees of abduction, 1.061 at 80, 0.992 at 100,
// against a threshold of 1.06 — which is exactly where a resting thumb sits
// during a two-finger gesture, and it moves only ~3% per 10 degrees there. A
// rule counting all five would chatter at the tracker's own 24Hz. The other
// four are nothing like as marginal: their ratio runs 1.00 straight to 0.25
// folded and crosses at about 45 degrees of bend, a posture nobody holds.
//
// Worth knowing: because actingFinger returns the INDEX whenever it is out and
// otherwise only a lone finger, the rule in practice is "the index and exactly
// one other". Middle+ring with the index curled counts as two here but produces
// no acting finger at all, so it does nothing — harmlessly, and visibly, since
// no mark is wearing the acting ring.
const fingersUp = (h) => {
  const e = h.extended || [];
  let n = 0;
  for (let i = 1; i < HAND_TIPS.length; i++) if (e[i] === true) n += 1;
  return n;
};

// POINTERS ARE KEYED BY WHICH HAND, NEVER BY ARRAY POSITION. MediaPipe's
// result order is not an identity: when the left hand leaves, the right one
// moves from slot 1 to slot 0, and a pointer keyed on the slot would hand the
// departing hand's live press to the one still on screen — the cursor teleports
// mid-drag and the drag never ends. Handedness is the only stable name we get.
const keyOf = (hand, i) => 'hand:' + (hand.handedness || 'i' + i);
// A CONTACT'S POINTER. Within one hand it IS that hand's pointer, so the lone
// finger that was driving it and the contact that takes over are one pointer
// and one press rather than two fighting for the same target. Across two hands
// it needs a name of its own: neither hand owns it, and keying it to either
// would hand the whole press to whichever one happened to leave first.
const contactKey = (list, m) => (m.cross ? 'hand:contact' : keyOf(list[m.a.hand], m.a.hand));

export function createHandView({ perceive, reach, body, popup, video } = {}) {
  let raf = 0, running = false;
  let canvas = null, ctx = null, layer = null;
  // [hand][finger] — one mark and one pair of filters each. A finger that is
  // still must stay still while another moves, so they never share state.
  const dots = [], smooth = [], merged = [];
  let lastT = 0;
  const twoHand = createTwoHand({ body });
  // The last tracker reading we acted on, per hand. The frame loop runs at 60Hz
  // and the hand model at 24, so most frames are the same reading twice and
  // must not be mistaken for the hand holding still.
  const seenAt = [0, 0];
  // Where each fingertip was last frame, so the body can be told how far it
  // moved. [hand][finger].
  const wasAt = [[], []];
  const pinched = [false, false];
  // WHICH CONTACTS WERE LIVE LAST FRAME, by pair name. findMerges needs it for
  // the wider release threshold, and the loop needs it to know which pointers
  // have just been let go of.
  let wasPairs = new Set();
  let heldKeys = new Set();
  // THE ORB TURN. Make the shape that means zero — thumb to index, a ring —
  // and rotate the wrist until the back of your hand faces the camera. That
  // walks the body through every form it has.
  //
  // IT IS THE STRONGEST GESTURE IN HERE, and for a reason worth writing down,
  // because the ones it replaces were weak for the opposite reason. The thumbs
  // touching, and then the fist bump, both happened WHERE THE TWO HANDS MEET —
  // and two hands in contact is the hand model's worst case: forty-two
  // landmarks across two shapes that are occluding each other, least certain
  // at exactly the instant the gesture happens. No threshold fixes that.
  //
  // This is one hand with nothing in front of it, and both halves of it are
  // already the most reliable things measured anywhere in this app. The ring is
  // h.pinch, a distance between two landmarks on a single frame. The turn is
  // palmToScreen, the sign of a triangle drawn on the wrist and the two outer
  // knuckles — three of the best-tracked points on a hand, far apart, so the
  // triangle is large and its sign is not a close call.
  //
  // AND IT FIRES ON A SIGN CHANGE RATHER THAN A THRESHOLD, which is the whole
  // difference. Every gesture that has given trouble here — the knuckles, the
  // air tap, the thumb's own extension — was a distance crossing a line, where
  // noise at the line is chatter you cannot tune away. A sign flip has one
  // ambiguous moment, edge-on, and you rotate through it in two frames.
  const turning = [null, null];
  // A PINCH IS FINGERTIPS TOUCHING, and this was measuring 3.8cm of daylight.
  // The ruler is the wrist-to-knuckle span, about 9cm on an adult hand, so 0.42
  // of it called a thumb and finger "pinched" while they were still a couple of
  // centimetres apart — which is where a hand SITS, so it was pinching
  // constantly. 0.18 is a centimetre and a half: touching, or nearly.
  //
  // And it is now the BODY's gesture alone: it takes hold of the field and
  // stretches it. What presses things is two fingers, below.
  // THE PALM'S TAIL — how long a palm goes on meaning stop after it has stopped
  // BEING a palm. This is the whole of the exit gesture: however you take the
  // hand away, that hand touches nothing until the movement is over.
  //
  // IT NEEDED A TAIL BECAUSE THE HALT RELEASES AT THE START OF THE EXIT, not at
  // the end of it. The test below is an instantaneous AND of two per-frame
  // booleans with no hysteresis: `every === true` fails on the FIRST finger to
  // curl, and palmToScreen has no dead zone, so a turning wrist drops out the
  // moment the signed area crosses zero — both with the fingers still extended
  // and still sweeping across the body.
  //
  // AND WHAT FOLLOWED WAS NOT A NUDGE, IT WAS A THROW. The tracker runs at 24Hz
  // under a 60Hz loop, so most frames re-read the same hand, push (0,0), and
  // body.js does `velX = handPush.x` on every pushed frame — meaning the fling
  // is being continuously RE-ZEROED the whole time a finger rests on the orb.
  // It only escapes when the pushes stop right after a fresh reading. That is
  // precisely what leaving a palm produces: one large mid-movement delta and
  // then silence, inherited as a fling and coasted for over a second. The worst
  // case was the likely case, which is why it read as the orb being hurled.
  //
  // There were two frames of grace before this and only one was deliberate —
  // the second fell out of body.halt() being applied after the loop rather than
  // inside it. Two frames is 33ms; leaving a palm takes ten times that.
  const HALT_TAIL_MS = 520;
  // KEYED BY HANDEDNESS, NEVER BY SLOT — the same reason the pointers are. When
  // one hand leaves, the other moves from slot 1 to slot 0, and a latch held by
  // index would switch off the hand that is still working.
  const spent = new Map();          // key -> the moment that hand is live again
  // Which pointers we drove last frame. A hand that leaves entirely is not in
  // the list at all, so no loop body runs for it and nothing would end its
  // pointer — the liveness sweep would get there eventually, but "eventually"
  // is a quarter of a second of the room still spinning after the hand is gone.
  // Ending it the moment it stops being driven is immediate and exact.
  let drove = new Set();

  function build() {
    if (canvas || !popup) return;
    // A CHILD, never a re-parenting. The popup already carries a mounted ring
    // and the video; we add one canvas over the top and touch neither.
    canvas = document.createElement('canvas');
    canvas.className = 'hand-skel';
    canvas.setAttribute('aria-hidden', 'true');
    popup.appendChild(canvas);
    ctx = canvas.getContext('2d');

    layer = document.createElement('div');
    layer.id = 'hand-cursors';
    layer.setAttribute('aria-hidden', 'true');
    for (let hand = 0; hand < HANDS; hand++) {
      dots[hand] = []; smooth[hand] = [];
      for (let i = 0; i < HAND_TIPS.length; i++) {
        const d = document.createElement('i');
        d.className = 'hand-dot out';
        d.style.setProperty('--tint', TINT[i]);
        d.style.setProperty('--size', SIZE[i] + 'px');
        layer.appendChild(d);
        dots[hand][i] = d;
        smooth[hand][i] = [createOneEuro({ minCutoff: 1.2, beta: 0.35 }), createOneEuro({ minCutoff: 1.2, beta: 0.35 })];
      }
    }
    // ONE BUBBLE PER CONTACT — not per hand, because a contact can be made
    // BETWEEN the hands and neither of them owns it. Two is what merge.js will
    // ever hand back at once.
    for (let i = 0; i < CONTACTS; i++) {
      const m = document.createElement('i');
      m.className = 'hand-merge out';
      layer.appendChild(m);
      merged[i] = m;
    }
    document.body.appendChild(layer);
  }

  // The preview is CSS-mirrored (scaleX(-1)) so it reads as a selfie, and
  // perceive already hands out viewer-space points — so a viewer-space x maps
  // STRAIGHT onto the displayed pixel. The two mirrors cancel. Do not add a
  // third one here; that is how this ends up backwards.
  function drawSkeleton(list) {
    if (!canvas || !video) return;
    const w = video.clientWidth, h = video.clientHeight;
    if (!w || !h) { canvas.width = 0; return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!list.length) return;

    // OBJECT-FIT: COVER, REPRODUCED IN THE MATHS. #cam is object-fit: cover and
    // a canvas has no such property, so the crop is done here or the skeleton
    // lands beside the hand. camera.js asks 640x480 as an IDEAL, which a camera
    // is free to miss: a 16:9 webcam in this 4:3 box loses about an eighth off
    // EACH side, and the naive map is exact in the middle and ~19px out at the
    // edge — wrong in the way that looks like it nearly works.
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const k = Math.max(w / vw, h / vh);
    const dw = vw * k, dh = vh * k, ox = (w - dw) / 2, oy = (h - dh) / 2;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const hand of list) {
      const P = hand.points;
      const X = (i) => ox + P[i][0] * dw, Y = (i) => oy + P[i][1] * dh;
      // Two passes: a wide dark stroke first so the skeleton survives a bright
      // background, then the bright line on top. A single stroke vanishes
      // against a window or a lamp — which is exactly when someone is looking
      // at this to work out why tracking is poor.
      for (const pass of [{ w: 4.5, c: 'rgba(0,0,0,0.55)' }, { w: 1.8, c: 'rgba(233,240,255,0.92)' }]) {
        ctx.lineWidth = pass.w; ctx.strokeStyle = pass.c;
        ctx.beginPath();
        for (const [a, b] of HAND_BONES) { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
        ctx.stroke();
      }
      for (let i = 0; i < P.length; i++) {
        const tip = HAND_TIPS.indexOf(i);
        // A curled fingertip is drawn hollow. The skeleton is where you check
        // why a cursor vanished, so it has to show the reason.
        const out = tip < 0 || hand.extended?.[tip] === true;
        ctx.beginPath();
        ctx.arc(X(i), Y(i), tip >= 0 ? 3.6 : 2.2, 0, 6.2832);
        if (tip >= 0 && !out) { ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(150,170,200,0.75)'; ctx.stroke(); }
        else { ctx.fillStyle = tip >= 0 ? TINT[tip] : 'rgba(190,205,230,0.85)'; ctx.fill(); }
      }
      // The pinch, drawn as the thing it is: a gap that closes.
      const close = hand.pinch < 0.45;
      ctx.lineWidth = close ? 2.4 : 1.2;
      ctx.strokeStyle = close ? 'rgba(255,255,255,0.95)' : 'rgba(180,196,224,0.45)';
      ctx.setLineDash(close ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(X(4), Y(4)); ctx.lineTo(X(8), Y(8)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // IS THE ROOM ACTUALLY THE TOPMOST THING HERE? The body's push and its pinch
  // are pure geometry — how far a fingertip is from the orb's centre in pixels
  // — which knows nothing about what has been opened on top of it. So a hand
  // reading a memory was turning the body behind the window the whole time.
  // Colin: "if a cursor is on a popup window like a memory, it should stop
  // moving the orb behind it."
  //
  // Asked of the DOM rather than of a list of window rectangles, because the
  // DOM already knows: every panel, window, sheet and menu this app has or ever
  // will have is over the stage or it is not.
  const clearAbove = (px, py) => {
    const el = document.elementFromPoint(px, py);
    return !!el && !!el.closest?.('#stage, canvas.orb');
  };

  // The midpoint of two fingertips, on screen, through the same map the cursors
  // use — so a pinch lands exactly where its two marks meet.
  function screenOf(a, b, W, H, gain) {
    const fx = (a[0] + b[0]) / 2, fy = (a[1] + b[1]) / 2;
    return [clamp(W / 2 + (fx - 0.5) * gain, 0, W), clamp(H / 2 + (fy - 0.5) * gain, 0, H)];
  }

  // WHICH FINGER REACHES. The index if it is out, because that is what people
  // point with. Otherwise, if exactly one finger is out, that one — you were
  // clearly pointing with it. Otherwise none: an open palm or a fist is not
  // aiming at anything, and guessing would be worse than waiting.
  function actingFinger(hand) {
    const ext = hand.extended || [];
    if (ext[INDEX] === true) return INDEX;
    const out = [];
    for (let i = 0; i < HAND_TIPS.length; i++) if (ext[i] === true) out.push(i);
    return out.length === 1 ? out[0] : -1;
  }

  function drawCursors(list, dt, now) {
    if (!layer) return;
    const b = document.body.classList;
    const on = b.contains('in-home') && !b.contains('gated');
    layer.classList.toggle('on', on && list.length > 0);
    // THE SECOND LANGUAGE. While the hands are saying something — sizing, or a
    // pair of fingertips in contact — the pointers stand down, so bringing two
    // fingers together to change a colour cannot also press whatever they
    // happened to be over. Any press already open is ended rather than left
    // hanging.
    const shaping = on && twoHand.read(list, now);
    if (!shaping) twoHand.reset();
    layer.classList.toggle('shaping', shaping);
    if (shaping && reach) { for (const key of drove) reach.end(key); drove = new Set(); }

    const W = window.innerWidth, H = window.innerHeight;
    // ONE pixels-per-frame-unit, SET BY THE LONGER SIDE OF THE SCREEN.
    //
    // Both requirements have to hold at once: the same scale on both axes (or a
    // circle drawn in the air lands as an ellipse and the fingers sit in an
    // arrangement the hand is not in), and every corner reachable without
    // sweeping past the edge of the camera frame. Taking the gain from the
    // LONGER side gives that side the full comfortable sweep and the shorter
    // side proportionally less, which is what you want — it is the axis you
    // have less reach on anyway. Sizing from the shorter side instead leaves a
    // wide screen's left and right edges unreachable; sizing from the width
    // alone does the same to a tall one.
    const gain = Math.max(W, H) / (REACH * 2);
    let pinching = false;
    const now_drove = new Set();
    const here = [[], []];          // this frame's fingertip positions, per hand
    let halting = false;

    // ---- WHICH FINGERTIPS ARE TOUCHING ------------------------------------
    // Computed once for the whole frame and BEFORE anything acts, because a
    // contact can span both hands and neither hand can answer for it alone.
    // See merge.js for why it is every pair measured rather than one named pair
    // — and for why holding two fingers apart is not a contact.
    //
    // None while the hands are SAYING something: bringing fingers together to
    // change a colour is the same physical event as making a contact, and the
    // second language speaks first.
    const merges = (on && !shaping && reach) ? findMerges(list, { was: wasPairs }) : [];
    wasPairs = new Set(merges.map((m) => m.key));
    // A hand in a contact is doing that and nothing else: its own pointer
    // stands down, its tips are drawn as the bubble rather than separately,
    // and it does not also push the body around.
    const inContact = [false, false];
    const spentTip = [[], []];
    for (const m of merges) {
      inContact[m.a.hand] = true; inContact[m.b.hand] = true;
      spentTip[m.a.hand][m.a.tip] = true; spentTip[m.b.hand][m.b.tip] = true;
    }
    // ...AND THE ONES THAT HAVE JUST OPENED LET GO. Run before any pointer
    // moves this frame, so a pointer that is about to be driven again by a
    // lone finger is released first rather than being carried into it still
    // down. letGo, not end: a contact made and opened without travelling is a
    // press of whatever it was on, which is how a nav arrow or a window light
    // answers two fingers tapped together over it.
    const nowKeys = new Set(merges.map((m) => contactKey(list, m)));
    if (reach) for (const key of heldKeys) if (!nowKeys.has(key)) reach.letGo(key);
    heldKeys = nowKeys;

    for (let hand = 0; hand < HANDS; hand++) {
      const h = on ? list[hand] : null;
      const hkey = h ? keyOf(h, hand) : null;
      // Still inside the tail of its own palm? Then this hand is saying stop,
      // and a hand saying stop is not also doing something else.
      const tailed = !!hkey && (spent.get(hkey) || 0) > now;
      const act = h ? actingFinger(h) : -1;
      // How many fingers this hand is holding up. It decides exactly one thing
      // — whether this is the two-finger drag that scrolls — and no longer
      // decides what may be pressed. See TWO_TO_PRESS in reach.js for why.
      const up = h ? fingersUp(h) : 0;

      // ---- A PINCH IS A CONTACT LIKE ANY OTHER ------------------------------
      // The body's stretch used to ask h.pinch — thumb-to-index against its own
      // threshold — while the cursor asked something else entirely, so the two
      // could disagree about whether the same two fingers were touching. There
      // is one answer now and both read it: this hand is gripping the body when
      // it has a contact OF ITS OWN that the thumb is part of, which is what a
      // pinch is and nothing else is.
      //
      // The same answer arms the orb turn, so the ring you make to walk the
      // body through its forms is the ring the bubble is already drawn on.
      const own = h ? merges.find((m) => !m.cross && m.a.hand === hand) : null;
      const grip = !!own && (own.a.tip === 0 || own.b.tip === 0);
      const pt = grip ? screenOf(h.tips[own.a.tip], h.tips[own.b.tip], W, H, gain) : null;
      if (h && h.pinch < 0.45) pinching = true;
      // IS THIS READING NEW? Everything that measures movement has to ask, or
      // it measures the same hand twice and calls the difference a gesture.
      const fresh = !!h && h.seenAt !== seenAt[hand];
      if (h) seenAt[hand] = h.seenAt;

      for (let i = 0; i < HAND_TIPS.length; i++) {
        const d = dots[hand][i];
        // EXPLICITLY OUT, not merely "not known to be in". A missing or
        // undefined reading used to show the mark, so anything the extension
        // test could not answer for became a cursor — which is most of how
        // curled fingers kept leaving marks on the screen.
        // ONE CONTACT, ONE CURSOR: whichever two fingertips are touching stop
        // being drawn separately the moment they become the bubble — which is
        // what makes the contact visible as a thing that HAPPENED rather than
        // as two marks that happen to be near each other.
        const shown = !!h && h.extended?.[i] === true && !!h.tips[i] && !spentTip[hand][i];
        d.classList.toggle('out', !shown);
        if (!shown) {
          smooth[hand][i][0].reset(); smooth[hand][i][1].reset();
          d.classList.remove('acting', 'held', 'swiping', 'refused');
          continue;
        }
        const t = h.tips[i];
        const sx = clamp(W / 2 + (t[0] - 0.5) * gain, 0, W);
        const sy = clamp(H / 2 + (t[1] - 0.5) * gain, 0, H);
        const x = smooth[hand][i][0].filter(sx, dt);
        const y = smooth[hand][i][1].filter(sy, dt);
        // translate3d, not left/top: the difference between the compositor
        // moving a layer and the whole page laying out again, ten times a frame.
        d.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        here[hand][i] = [x, y];

        // ...but not while this hand is in a contact: the bubble drives that
        // pointer, and letting a lone fingertip move the same pointer in the
        // same frame would fight it.
        const acts = i === act && !!reach && !shaping && !inContact[hand];
        d.classList.toggle('acting', acts);
        if (acts) {
          const key = keyOf(h, hand);
          now_drove.add(key);
          const p = reach.move(key, x, y, now, up, false);
          // The hold, drawn as a ring closing around the mark. A dwell with no
          // visible fill is a button that fires for no reason the person can
          // see; with it, the wait is a thing they are doing.
          d.style.setProperty('--dwell', p ? p.dwell.toFixed(3) : '0');
          d.classList.toggle('held', !!p && p.down && !p.swipe);
          d.classList.toggle('swiping', !!p && p.down && p.swipe);
          d.classList.toggle('refused', !!p && p.refused);
        } else {
          d.style.setProperty('--dwell', '0');
          d.classList.remove('held', 'swiping', 'refused');
        }
      }
      // A hand with nothing pointing has no pointer. This is what sends the up
      // when a finger curls mid-drag, rather than letting it time out. A hand
      // in a contact is exempt: the contact is holding that very pointer down,
      // and a pinch has no acting finger by this test — both fingers making it
      // are part of it — so without the exemption every pinch would end its own
      // press on the frame it began.
      if (reach && h && act < 0 && !inContact[hand]) reach.end(keyOf(h, hand));

      // ---- THE HAND ON THE BODY ------------------------------------------
      if (!h || shaping || !body) { endPinch(hand); wasAt[hand].length = 0; continue; }
      // WHAT A PALM PUTS DOWN. Each of these would otherwise survive the
      // gesture and act after it:
      //   wasAt  a previous position, which is what a push is measured from
      //   pinch  a grip still stretching the body
      //   hold   a press still down on whatever it landed on
      //
      // The pointer itself is NOT ended and the marks are NOT stood down. A
      // palm stops the body; it does not switch the hand off. Colin had that
      // for half a second and asked for it back: sticky for the palm, slippery
      // for the pointer.
      const standDown = (i, key) => {
        endPinch(i);
        wasAt[i].length = 0;
        if (reach && key && heldKeys.has(key)) { reach.letGo(key); heldKeys.delete(key); }
      };
      // A PALM HELD UP STOPS IT. An open hand, palm toward the screen, which is
      // what that gesture means everywhere else. It cannot be confused with
      // taking hold of the body to resize it, because when you hold something
      // your palms face EACH OTHER — and it takes priority over everything
      // else this hand might be doing, since a hand saying stop is not also
      // pushing.
      // FIVE READINGS, ALL TRUE — not merely "none of them false". [].every()
      // is TRUE, so a hand whose extension array was never filled satisfied
      // this and halted the body on any shape at all. That is how an empty
      // array becomes an open palm.
      if (h.palm && h.extended?.length === 5 && h.extended.every((v) => v === true)) {
        halting = true;
        spent.set(hkey, now + HALT_TAIL_MS);
        standDown(hand, hkey);
        continue;
      }
      // ---- THE ORB TURN ----------------------------------------------------
      // Armed the moment the ring closes, remembering which way the hand was
      // facing; fired the moment that answer changes while the ring is still
      // closed. Disarmed when the fingers open, so one turn is one form.
      if (!grip) turning[hand] = null;
      else if (!turning[hand]) turning[hand] = { side: h.palm, fired: false };
      else if (!turning[hand].fired && h.palm !== turning[hand].side) {
        turning[hand].fired = true;
        twoHand.nextLook?.();
        flash(dots[hand][INDEX]);
        // A PINCH THAT ROTATES IS NOT A CLICK. The ring is the same shape as
        // the press gesture — it has to be, it is thumb against index — so the
        // press has already gone down by the time the wrist starts moving.
        // end(), not letGo(): letGo fires a click if the pointer barely moved,
        // and the last thing this gesture should do on its way past is press
        // whatever it happened to be over.
        if (reach && hkey) reach.end(hkey);
        heldKeys.delete(hkey);
      }

      const orb = body.orbPx?.();
      if (!orb || !(orb.r > 0)) continue;
      const onOrb = (px, py) => Math.hypot(px - orb.x, py - orb.y) <= orb.r && clearAbove(px, py);

      // A PINCH TAKES HOLD OF A PLACE. Where the two touching fingertips are,
      // which is where a person's pinch actually is, and only if that place is
      // on the body. The contact's own hysteresis is what stops a hand hovering
      // at the line from grabbing and letting go over and over.
      if (grip && pt && (pinched[hand] || onOrb(pt[0], pt[1]))) {
        if (!pinched[hand]) pinched[hand] = !!body.pinchAt?.(hand, pt[0], pt[1]);
        if (pinched[hand]) body.pinchTo?.(hand, pt[0], pt[1]);
        wasAt[hand].length = 0;          // a pinching hand does not also turn it
        continue;
      }
      endPinch(hand);
      // A HAND IN A CONTACT IS NOT ALSO TURNING THE BODY. Its remaining fingers
      // may well still be over the room — a pinch leaves three of them out —
      // and without this they would push it while the contact was pressing
      // something on top of it.
      if (inContact[hand]) { wasAt[hand].length = 0; continue; }

      // EVERY FINGERTIP ON THE BODY PUSHES IT. Their movements are SUMMED, so
      // five fingers sweeping one way and two sweeping the other leave it
      // turning the first way and slower — which is what would happen to a real
      // object, and is why they are not averaged.
      // THE PALM'S TAIL HOLDS BACK ONE THING, AND IT IS THE PUSH. Everything
      // else about the hand — its marks, its pinch, its presses — is live the
      // instant the palm is gone, because a palm stops the BODY and was never
      // meant to switch the HAND off. What stays held back for half a second is
      // the fingertips' push, because that is measured from a previous position
      // and a hand changing shape is mostly previous positions: it is the one
      // thing that was throwing the body on the way out.
      if (tailed) { wasAt[hand].length = 0; continue; }

      // A MOVEMENT IS ONLY A MOVEMENT IF THE TRACKER SAID SOMETHING NEW. On a
      // repeated reading the marks still drift — the one-euro filters are
      // converging on the same target — and feeding that drift in as a push was
      // what made the body feel sticky: three frames in five it was told the
      // finger had barely moved, and the velocity was wiped. So on a stale
      // frame nothing is pushed and nothing is remembered, and the next real
      // reading measures the whole interval at once.
      //
      // `on` is counted every frame regardless, because whether fingers are
      // TOUCHING it does not depend on the tracker having refreshed — and that
      // is what decides when it has been let go of.
      let touching = 0;
      for (let i = 0; i < HAND_TIPS.length; i++) {
        const at = here[hand][i];
        if (!at) { if (fresh) wasAt[hand][i] = null; continue; }
        if (!onOrb(at[0], at[1])) { if (fresh) wasAt[hand][i] = null; continue; }
        touching += 1;
        if (!fresh) continue;
        const prev = wasAt[hand][i];
        if (prev) body.handSpin?.(at[0] - prev[0], at[1] - prev[1]);
        wasAt[hand][i] = [at[0], at[1]];
      }
      if (touching) body.handTouch?.(touching);
    }

    // ---- THE CONTACTS, DRIVEN ----------------------------------------------
    // After every hand, so a pointer a lone finger was driving has already been
    // moved and can be taken over cleanly rather than being written twice in
    // one frame.
    //
    // THE BUBBLE IS THE MARK YOU AIM. That is what makes this better than the
    // pinch it grew out of: the press used to be placed at where the hand was
    // pointing BEFORE the fingers started closing, because closing a pinch
    // drags the index toward the thumb and the aim had to be guessed. There is
    // nothing to guess now — the two marks meet, pop into one, and the press
    // lands under the thing you can see.
    for (let i = 0; i < CONTACTS; i++) {
      const bub = merged[i];
      if (!bub) continue;
      const m = merges[i];
      const ha = m ? list[m.a.hand] : null, hb = m ? list[m.b.hand] : null;
      const ta = ha?.tips?.[m?.a.tip], tb = hb?.tips?.[m?.b.tip];
      if (!m || !ta || !tb) {
        bub.classList.add('out');
        bub.style.setProperty('--dwell', '0');
        bub.classList.remove('held', 'refused');
        continue;
      }
      const at = screenOf(ta, tb, W, H, gain);
      bub.style.transform = `translate3d(${at[0].toFixed(1)}px, ${at[1].toFixed(1)}px, 0) translate(-50%, -50%)`;
      if (bub.classList.contains('out')) {
        bub.classList.remove('out'); bub.classList.add('pop');
        setTimeout(() => bub.classList.remove('pop'), 220);
      }
      if (!reach) continue;
      const key = contactKey(list, m);
      now_drove.add(key);
      // HOW MANY FINGERS, HONESTLY. A pinch is the thumb and one finger, which
      // is one finger held up — so it does not scroll, and the back door the
      // pinch used to have into the conversation stays shut. Two fingertips
      // pressed together are two, and they do.
      const up = m.cross ? 2 : fingersUp(ha);
      const p = reach.move(key, at[0], at[1], now, up, true);
      // The hold drawn on the bubble, not on a fingertip: over the body a
      // contact is a hold-to-press, and the ring closing is the only thing
      // that says so before it fires.
      bub.style.setProperty('--dwell', p ? p.dwell.toFixed(3) : '0');
      bub.classList.toggle('held', !!p && p.down);
      bub.classList.toggle('refused', !!p && p.refused);
    }

    body?.halt?.(halting);
    layer.classList.toggle('halting', halting);
    // Anything driven last frame and not this one has gone: end it now.
    if (reach) for (const key of drove) if (!now_drove.has(key)) reach.end(key);
    drove = now_drove;
    layer.classList.toggle('pinching', pinching);
  }

  function flash(d) {
    if (!d) return;
    d.classList.add('knock');
    setTimeout(() => d.classList.remove('knock'), 180);
  }

  function endPinch(hand) {
    if (!pinched[hand]) return;
    pinched[hand] = false;
    // Letting go does not snap: the body eases back out of the stretch on its
    // own clock, which is what an elastic thing does.
    body?.pinchEnd?.(hand);
  }

  function tick(now) {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 1 / 60;
    lastT = now;

    let list = [];
    try {
      const s = perceive?.snapshot?.();
      list = (s?.hands || []).filter((h) => h && h.ok && h.points && h.points.length >= 21).slice(0, HANDS);
    } catch { list = []; }

    drawSkeleton(list);
    drawCursors(list, dt, now);
    // The liveness sweep, every frame. This is what guarantees a drag is always
    // ended — a hand that vanishes between frames sends nothing, and without
    // this the orb would stay stuck mid-spin forever.
    reach?.sweep(now);
  }

  return {
    start() {
      build();
      if (running) return;
      running = true; lastT = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ctx && canvas && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
      layer?.classList.remove('on', 'pinching');
      for (const m of merged) m?.classList.add('out');
      endPinch(0); endPinch(1);
      wasPairs = new Set(); heldKeys = new Set();
      body?.halt?.(false);
      wasAt[0].length = 0; wasAt[1].length = 0;
      spent.clear();
      for (const hand of smooth) for (const f of hand) { f[0].reset(); f[1].reset(); }
      drove = new Set();
      twoHand.reset();
      // Everything up, now: a switch turned off mid-drag must not leave a
      // pointer down somewhere.
      reach?.clear();
    },
    sync(on) { if (on) this.start(); else this.stop(); },
  };
}
