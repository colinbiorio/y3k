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
const INDEX = 1;            // where the index finger sits in TIPS

// TWO FINGERS SCROLL THE PAST. One finger points; an open hand does nothing.
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
const SCROLL_FINGERS = 2;
const fingersUp = (h) => {
  const e = h.extended || [];
  let n = 0;
  for (let i = 1; i < HAND_TIPS.length; i++) if (e[i] === true) n += 1;
  return n;
};

// THE KNUCKLE EACH FINGERTIP BENDS FROM. The tap is measured as the tip's
// offset from its OWN knuckle, which is what makes moving the whole hand
// invisible to it: tip and knuckle travel together and the offset does not
// change. Only the finger bending registers, which is what a tap is.
const MCP = [2, 5, 9, 13, 17];   // thumb, index, middle, ring, little
// POINTERS ARE KEYED BY WHICH HAND, NEVER BY ARRAY POSITION. MediaPipe's
// result order is not an identity: when the left hand leaves, the right one
// moves from slot 1 to slot 0, and a pointer keyed on the slot would hand the
// departing hand's live press to the one still on screen — the cursor teleports
// mid-drag and the drag never ends. Handedness is the only stable name we get.
const keyOf = (hand, i) => 'hand:' + (hand.handedness || 'i' + i);

export function createHandView({ perceive, reach, body, popup, video } = {}) {
  let raf = 0, running = false;
  let canvas = null, ctx = null, layer = null;
  // [hand][finger] — one mark and one pair of filters each. A finger that is
  // still must stay still while another moves, so they never share state.
  const dots = [], smooth = [];
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
  // A held pinch: where it was aimed when it closed, and where the grip was,
  // so the drag moves by how far the HAND has gone rather than jumping to the
  // point between two fingers that are also closing on each other.
  const holding = [null, null];
  // WHEN THIS HAND'S FINGERS WERE LAST PLAINLY OPEN. A press belongs where you
  // were pointing THEN — see the pinch branch for why a fixed look-back was
  // not good enough.
  const openAt = [0, 0];
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
  // WHAT THE TRACKER BELIEVES, kept per hand so the readout can show it and so
  // Y3K.handView.debug() answers at any moment. Written unconditionally: it is
  // a handful of property sets against a field of twenty-four thousand
  // particles, and an instrument that is only there when you remembered to
  // switch it on is not there when you need it.
  const dbg = [{}, {}];
  // The last few things that actually FIRED. Half of reading a gesture system
  // is knowing whether it did nothing or did something you did not want.
  const fired = [];
  const say = (what) => { fired.push({ t: Math.round(performance.now()), what }); if (fired.length > 12) fired.shift(); };
  const PINCH_ON = 0.42, PINCH_OFF = 0.58;   // two thresholds, or it chatters
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
  // WHERE THE FINGER WAS AIMING, a moment ago. Pinching pulls the index down
  // toward the thumb, so a click sent at the instant the pinch closes lands
  // below where the person was pointing. It is sent at where they WERE.
  const aim = [[], []];
  // Far enough back to be BEFORE the movement that triggered the press — a
  // tap's whole out-and-back fits inside 340ms, and a pinch takes a moment to
  // close — but not so far that it remembers a different intention.
  const AIM_BACK_MS = 260;
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

    for (let hand = 0; hand < HANDS; hand++) {
      const h = on ? list[hand] : null;
      const hkey = h ? keyOf(h, hand) : null;
      // Still inside the tail of its own palm? Then this hand is saying stop,
      // and a hand saying stop is not also doing something else.
      const tailed = !!hkey && (spent.get(hkey) || 0) > now;
      const act = h ? actingFinger(h) : -1;
      // Read once per hand per frame, not per finger: it is the hand's posture.
      const up = h ? fingersUp(h) : 0;
      const mayScroll = !!h && up === SCROLL_FINGERS;
      // Everything the readout shows, gathered where it is already known.
      const d = dbg[hand];
      d.here = !!h; d.fresh = fresh; d.tailed = tailed;
      d.handedness = h ? (h.handedness || '?') : '';
      d.up = h ? [1, 2, 3, 4].map((i) => h.extended?.[i] === true) : [false, false, false, false];
      d.thumb = h ? h.extended?.[0] === true : false;
      d.n = up; d.act = act; d.mayScroll = mayScroll;
      d.pinch = h && Number.isFinite(h.pinch) ? +h.pinch.toFixed(3) : null;
      d.palm = h ? !!h.palm : null;
      d.holding = !!holding[hand]; d.pinched = !!pinched[hand];
      d.turning = turning[hand] ? (turning[hand].fired ? 'spent' : 'armed') : null;
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
        const shown = !!h && h.extended?.[i] === true && !!h.tips[i];
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

        // ...but not while a pinch is holding: the held press is driven by how
        // far the HAND has moved, and letting the raw fingertip move the same
        // pointer in the same frame would fight it.
        const acts = i === act && !!reach && !shaping && !holding[hand];
        d.classList.toggle('acting', acts);
        if (acts) {
          const key = keyOf(h, hand);
          now_drove.add(key);
          const p = reach.move(key, x, y, now, mayScroll);
          // Remember where this finger was aiming, for the pinch to reach back
          // into — closing a pinch pulls the index toward the thumb.
          const a = aim[hand];
          a.push([now, x, y]);
          while (a.length && now - a[0][0] > 800) a.shift();
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
      // when a finger curls mid-drag, rather than letting it time out.
      if (reach && h && act < 0) reach.end(keyOf(h, hand));

      // ---- THE HAND ON THE BODY ------------------------------------------
      if (!h || shaping || !body) { endPinch(hand); wasAt[hand].length = 0; continue; }
      // WHAT A PALM PUTS DOWN. Each of these would otherwise survive the
      // gesture and act after it:
      //   wasAt  a previous position, which is what a push is measured from
      //   aim    where the finger was pointing BEFORE the palm went up, which a
      //          press a moment later would be sent to
      //   pinch  a grip still stretching the body
      //   hold   a press still down on whatever it landed on — this one was
      //          already escaping the old palm branch, which released neither
      //
      // The pointer itself is NOT ended and the marks are NOT stood down. A
      // palm stops the body; it does not switch the hand off. Colin had that
      // for half a second and asked for it back: sticky for the palm, slippery
      // for the pointer.
      const standDown = (i, key) => {
        endPinch(i);
        wasAt[i].length = 0;
        aim[i].length = 0;
        if (holding[i]) { if (reach && key) reach.letGo(key); holding[i] = null; }
      };
      // A PALM HELD UP STOPS IT. An open hand, palm toward the screen, which is
      // what that gesture means everywhere else. It cannot be confused with
      // taking hold of the body to resize it, because when you hold something
      // your palms face EACH OTHER — and it takes priority over everything
      // else this hand might be doing, since a hand saying stop is not also
      // pushing.
      if (h.palm && h.extended?.every?.((v) => v === true)) {
        if (!halting) say('halt');
        halting = true;
        spent.set(hkey, now + HALT_TAIL_MS);
        standDown(hand, hkey);
        continue;
      }
      const orb = body.orbPx?.();
      if (!orb || !(orb.r > 0)) continue;
      const onOrb = (px, py) => Math.hypot(px - orb.x, py - orb.y) <= orb.r;

      // A PINCH TAKES HOLD OF A PLACE. Between the thumb and the index, which
      // is where a person's pinch actually is, and only if that place is on
      // the body. Two thresholds so a hand hovering at the line does not grab
      // and let go over and over.
      const grip = (pinched[hand] || holding[hand]) ? h.pinch < PINCH_OFF : h.pinch < PINCH_ON;
      if (h.pinch >= PINCH_OFF) openAt[hand] = now;

      // ---- THE ORB TURN ----------------------------------------------------
      // Armed the moment the ring closes, remembering which way the hand was
      // facing; fired the moment that answer changes while the ring is still
      // closed. Disarmed when the fingers open, so one turn is one form.
      if (!grip) turning[hand] = null;
      else if (!turning[hand]) turning[hand] = { side: h.palm, fired: false };
      else if (!turning[hand].fired && h.palm !== turning[hand].side) {
        turning[hand].fired = true;
        say('form → ' + (twoHand.nextLook?.() || '?'));
        flash(dots[hand][INDEX]);
        // A PINCH THAT ROTATES IS NOT A CLICK. The ring is the same shape as
        // the press gesture — it has to be, it is thumb against index — so the
        // press has already gone down by the time the wrist starts moving.
        // end(), not letGo(): letGo fires a click if the pointer barely moved,
        // and the last thing this gesture should do on its way past is press
        // whatever it happened to be over.
        if (reach && hkey) reach.end(hkey);
        if (holding[hand]) holding[hand] = null;
      }
      const pt = h.tips[0] && h.tips[1] ? screenOf(h.tips[0], h.tips[1], W, H, gain) : null;
      if (grip && pt && (pinched[hand] || onOrb(pt[0], pt[1]))) {
        if (!pinched[hand]) pinched[hand] = !!body.pinchAt?.(hand, pt[0], pt[1]);
        if (pinched[hand]) body.pinchTo?.(hand, pt[0], pt[1]);
        wasAt[hand].length = 0;          // a pinching hand does not also turn it
        continue;
      }
      // A PINCH ANYWHERE ELSE IS A PRESS, AND IT IS HELD.
      //
      // Held, not tapped, because half the things worth pointing at are dragged
      // rather than clicked: the budget slider, the wordmark's spin, the four
      // collapse arrows. A press that stays down until the fingers open answers
      // all of those the way a mouse does, and a press-and-release in one place
      // still produces the click a plain button wants — so one gesture covers
      // both and the hand never has to know which kind of thing it is over.
      //
      // It is reliable for a structural reason: a pinch is a DISTANCE between
      // two landmarks, true or false on a single frame. The tap is a shape
      // drawn over time against a hand sampled twenty times a second, so it is
      // the one that sometimes misses. Both end in the same press.
      //
      // On the body a pinch already means take hold of it, so this is
      // everywhere else — which is where the things you press actually live.
      if (grip && reach && act >= 0 && pt) {
        const key = keyOf(h, hand);
        if (!holding[hand]) {
          // PRESS WHERE THE PINCH BEGAN, which is a moment this hand knows
          // exactly rather than one it has to estimate. Closing a pinch drags
          // the index down toward the thumb, so a press sent at the instant it
          // shuts lands below the thing being pointed at — but the old fix for
          // that, a flat 260ms look-back, is only right if the hand was still.
          // Reaching for a button and pinching as you arrive sent the press to
          // wherever you were a quarter of a second earlier, which on anything
          // small is a miss. openAt is the last frame the fingers were plainly
          // open, so this is where you were pointing when you decided to press.
          const a = aimAt(hand, openAt[hand]) || aimOf(hand, now) || here[hand][act];
          if (a && reach.holdAt(key, a[0], a[1], now, mayScroll)) {
            holding[hand] = { aim: a, grip: pt };
            flash(dots[hand][act]);
            say('press');
          }
          // A PRESS THAT FOUND NOTHING IS NOT A PRESS, AND MUST NOT LATCH.
          // This used to set holding = { aim: null }, which is truthy — so the
          // hand was marked as holding something it had failed to take hold
          // of, the branch below did nothing every frame after, and holdAt was
          // never tried again. One miss and the pinch was dead until the hand
          // opened all the way past PINCH_OFF. Leaving it null instead means
          // the next frame tries again, so a pinch carried onto a button takes
          // hold when it arrives rather than having had its one chance in the
          // air on the way there.
        } else if (holding[hand].aim) {
          // ...and drag by how far the HAND has moved since, so the press stays
          // anchored where it landed instead of sliding as the fingers settle.
          const g = holding[hand];
          reach.move(key, g.aim[0] + (pt[0] - g.grip[0]), g.aim[1] + (pt[1] - g.grip[1]), now);
        }
        wasAt[hand].length = 0;          // a pinching hand does not also turn it
        continue;
      }
      if (holding[hand]) { reach.letGo(keyOf(h, hand)); holding[hand] = null; }
      endPinch(hand);

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
    body?.halt?.(halting);
    layer.classList.toggle('halting', halting);
    // Anything driven last frame and not this one has gone: end it now.
    if (reach) for (const key of drove) if (!now_drove.has(key)) reach.end(key);
    drove = now_drove;
    layer.classList.toggle('pinching', pinching);
  }

  // Where the acting finger was pointing AT A GIVEN MOMENT — used by the pinch,
  // which knows exactly when it began closing and should not have to estimate.
  function aimAt(hand, t) {
    const h = aim[hand];
    if (!h.length || !t) return null;
    let best = null;
    for (const s of h) { if (s[0] <= t) best = s; else break; }
    return best ? [best[1], best[2]] : null;
  }

  // Where the acting finger was pointing AIM_BACK_MS ago, or the oldest thing
  // we still remember if it has not been up that long.
  function aimOf(hand, now) {
    const h = aim[hand];
    for (let i = h.length - 1; i >= 0; i--) if (now - h[i][0] >= AIM_BACK_MS) return [h[i][1], h[i][2]];
    return h.length ? [h[0][1], h[0][2]] : null;
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
    // WHAT IT BELIEVES, RIGHT NOW. Every gesture's own governing number beside
    // its own threshold — a gesture that did not fire is explained by seeing
    // which side of its line it is sitting on, which is a better answer than
    // any sentence this could print.
    debug() {
      return {
        hands: dbg.map((d) => ({ ...d })),
        two: twoHand.state?.() || null,
        fired: fired.slice().reverse(),
        limits: { PINCH_ON, PINCH_OFF, SCROLL_FINGERS, HALT_TAIL_MS },
      };
    },

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
      endPinch(0); endPinch(1);
      holding[0] = holding[1] = null;
      aim[0].length = 0; aim[1].length = 0;
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
