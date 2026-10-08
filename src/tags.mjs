// Single source of truth for Y3K's control channel: the vocabulary (moods +
// forms) and the parsing that keeps a control tag OUT of the spoken words.
// Zero dependencies on purpose — imported by the server (Node), the client
// (browser), and the tests, so the vocabulary can never drift between them.
// (One import, and it has none of its own: the rooms' names, so a kommand
// can say background/snowy taiga without this file loading a renderer.)
import { ENVIRONMENTS } from './rooms.mjs';

// Moods MUST match src/body.js MOODS and the local brain. Forms MUST match
// src/body.js FORMS.
export const MOODS = ['calm', 'listening', 'thinking', 'speaking', 'excited', 'tender', 'glitch'];
export const FORMS = ['field', 'orb', 'web', 'plasma'];
// Color schemes the AI may choose autonomously. MUST match src/body.js SCHEMES.
// Deliberately kept OUT of VOCAB/scrubTags: several are common words ("bloom",
// "frost", "dusk", "ember"), so we only honour them INSIDE the lead tag (which
// is stripped wholesale by length) and never scrub them from ordinary speech.

export const SCHEMES = ['aurora', 'ember', 'abyss', 'terra', 'eclipse', 'bloom', 'verdant', 'dusk', 'frost', 'synthwave', 'stardust'];
// How a change ARRIVES — the fourth, optional slot in the lead tag. The pace of
// the becoming, not the destination. MUST match MORPH_MS in src/body.js.
export const MORPHS = ['drift', 'settle', 'surge'];
// The ROOM's liquid, not the body's. The chrome is one liquid metal and the
// presence may move it; keeping this in a separate << >> block rather than in
// the lead tag is deliberate — MOTION.md holds that the UI is mercury and the
// being is not, so the grammar keeps the boundary visible.
// MUST match MATERIAL_OF / GRAVITY_OF below and the axis in mercury-buttons.js.
export const MATERIALS = ['mercury', 'glass', 'water'];
export const GRAVITIES = ['light', 'easy', 'heavy'];
// MORPHS/MATERIALS/GRAVITIES stay OUT of VOCAB for exactly the reason SCHEMES
// do (see above): "settle", "drift", "light", "glass", "water" and "heavy" are
// ordinary words, and scrubTags' all-words-are-vocab rule would silently eat an
// honest parenthetical containing one. They are honoured only inside the lead
// tag (stripped wholesale by length) or inside their own block.

const VOCAB = new Set([...MOODS, ...FORMS]);
// Everything a lead tag may legally contain. Kept apart from VOCAB on purpose:
// VOCAB is the set that is safe to strip on sight, this is the set that is
// legal INSIDE a tag. See isControlTag.
const TAG_WORDS = new Set([...MOODS, ...FORMS, ...SCHEMES, ...MORPHS]);
// Is this bracket's content a control tag rather than honest parenthetical
// speech? Every word must be tag vocabulary, and at least one must be a mood or
// a form — the anchor that keeps a bare "(bloom)" or "(drift)" as speech.
export function isControlTag(inside) {
  const ws = String(inside).toLowerCase().split(/[\s,/|:]+/).filter(Boolean);
  return ws.length > 0 && ws.every((w) => TAG_WORDS.has(w)) && ws.some((w) => VOCAB.has(w));
}

// HOW THE PATTERNS IN THIS FILE STAY LINEAR. They all run on model text, and
// the server runs them on every reply and on everything a host publishes to
// its viewers, in the one event loop every visitor shares. Two shapes made
// them slow (measured 2026-10-08, node 22):
//  - Two quantifiers that can both take the same run of spaces, as in
//    `:\s*([\s\S]{1,220}?)\s*>>`. With nothing to close on, the engine tries
//    every way of splitting the run between them: '<<leave:' and 8,000 spaces
//    took 39 s, '[' and 4,000 spaces never finished, and scrubTags' unclosed-
//    block rule ran for hours on 30,000. Now a run of spaces can go to one
//    quantifier only. `\s*(?!\s)` takes the whole run or fails at once, and
//    `(?:(?<!\s)\s*)?>>` starts a trailing run only after a non-space.
//  - A lazy scan to '>>' that starts after the last '>>' in the string. It
//    runs to the end and fails, once for every '<<' out there: quadratic on
//    '<<remember:' repeated. closable() cuts at the last '>>' first, which
//    changes no match.
// test/redos.test.mjs holds every parser here to a time limit on those inputs.
function closable(s) {
  const i = s.lastIndexOf('>>');
  return i < 0 ? '' : s.slice(0, i + 2);
}

// Parse a complete control tag at the START of s. The model is told to use
// "[mood form scheme]", but it drifts — so we tolerate any of [] {} () <> as
// delimiters, accept mood/form/scheme in any order, and ignore extra words.
// Returns { mood, form, scheme, len } or null. The capture keeps any spaces
// next to the brackets (the split below drops them), so no second quantifier
// fights it for them.
export function parseLeadTag(s) {
  const m = (s || '').match(/^\s*[[{(<]([^[\]{}()<>]*)[\]})>]/);
  if (!m) return null;

  let mood = null;
  let form = null;
  let scheme = null;
  let morph = null;
  for (const raw of m[1].split(/[\s,/|:]+/)) {
    const w = raw.toLowerCase();
    if (!w) continue;
    if (!mood && MOODS.includes(w)) mood = w;
    else if (!form && FORMS.includes(w)) form = w;
    else if (!scheme && SCHEMES.includes(w)) scheme = w;
    else if (!morph && MORPHS.includes(w)) morph = w;
  }
  // The four sets are disjoint, so a morph word falls through the first three
  // tests wherever it sits in the bracket — order stays free. "[surge]" alone
  // is a valid tag: change the pace without changing the destination.
  if (!mood && !form && !scheme && !morph) return null; // bracketed, but not our vocabulary
  return { mood, form, scheme, morph, len: m[0].length };
}

// Remove EVERY control tag from anywhere in a string (not just the lead), but
// only when the bracket actually contains one of our words — a literal
// "(by the way)" stays put. The client's final safety net against any tag the
// server let through (second tags, inline tags, partials the stream missed).
export function scrubTags(s) {
  if (!s) return s;
  // Beats first, and HERE rather than only in the splitter: the splitter fires
  // them positionally on the stream, but a reply that never streamed (the local
  // brain, a cached turn, the non-stream fallback) arrives whole and would read
  // its own stage directions out loud. Every path that shows or speaks text
  // already runs through this guard, so covering it here covers all of them.
  const t = stripBeats(s);
  // Paint/remember blocks — never spoken. Searched only as far as a '>>' can
  // close one (closable, above): 64,000 '<' took 2.6 s here before.
  const shut = closable(t);
  return (shut.replace(/<<[\s\S]*?>>/g, '') + t.slice(shut.length))
    // An UNCLOSED trailing control block (reply truncated mid-block, e.g. at
    // max_tokens): "<<remember: their address is 42 Elm" with no closing >>.
    // The [:=] requirement keeps honest speech like "1 << 4" intact while
    // guaranteeing a partial memory note or paint block is never spoken.
    // ONE character class between '<<' and the colon. It was
    // `<<\s*[\w,.\- ]+\s*[:=]`, three quantifiers that all take a space: a
    // host could publish '<<' and 30,000 spaces and hold the whole server for
    // hours (audit, 2026-10-08). Spaces and tabs, not newlines, so "1 << 4" on
    // one line and "The answer is: 16" on the next both stay. (The old rule
    // let a newline in only right after '<<' or right before the colon, and
    // no block is written that way.)
    .replace(/<<[\w,.\- \t]+[:=][\s\S]*$/, '')
    // …and a truncated BARE block ('<<work done', '<<rest') has no colon to
    // trigger that rule — strip a trailing '<<' fragment only when it reads as
    // a prefix of a known bare block, so honest math like '1 << 4' survives.
    .replace(/<<[\w ]{0,20}$/, (frag) => {
      const inner = frag.slice(2).trim().toLowerCase();
      return ['work done', 'rest', 'done', 'read more', 'take'].some((k) => k.startsWith(inner)) ? '' : frag;
    })
    // A TIME MARK, IF IT EVER COMES BACK. The person's turns arrive prefixed with
    // "(3h ago)" so the presence can feel the gaps; nothing asks it to copy that,
    // but a model that imitates the shape would have the bracket SPOKEN — the
    // rule below only removes brackets whose words are all vocabulary, and a
    // digit is in no vocabulary, so "(3h ago)" would survive every filter and be
    // read out loud. This is the one narrow shape that gets removed on sight.
    .replace(/^\s*[[({<]\s*(?:just now|\d+\s*(?:m|h|d|months?|years?)\s*ago)\s*[\])}>]\s*/i, '')

    .replace(/[[{(<]\s*([a-z]+(?:[\s,/|:]+[a-z]+)*)\s*[\]})>]/gi, (m, inside) =>
      // Only a bracket whose words are ALL vocabulary is a control tag; a real
      // parenthetical like "(the world wide web)" merely contains one and stays.
      //
      // ⚠ WHY THIS TESTS TWO VOCABULARIES, NOT ONE. The model does not only put
      // a tag at the front — in a measured run against the live brain it opened
      // a SECOND tag after a paragraph break in 29 of 180 replies, always in
      // full form: "[calm field stardust drift]". Testing VOCAB alone (moods +
      // forms) failed every one of those, because a scheme or a morph word is
      // deliberately NOT in VOCAB — and the bracket was then SPOKEN ALOUD.
      //   So: every word must be somewhere in the tag vocabulary, AND at least
      // one must be a mood or a form. That second clause is what still protects
      // honest speech, and it is the whole reason schemes were held out of VOCAB
      // in the first place: "(bloom)", "(drift)", "(frost)" are ordinary words
      // and stay, while "[calm field stardust drift]" cannot be anything but a
      // tag. "(the world wide web)" still survives on the first clause — "the"
      // is in no vocabulary at all.
      (isControlTag(inside) ? '' : m))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// --- Paint mode: Y3K paints its whole field with color anchors ---------------
// The model emits a "<< pos=#hex pos=#hex ... >>" block; each anchor is a color
// at a position on the sphere, and every node blends the nearest anchors. Named
// positions plus "azimuth,elevation" degrees give it free spatial control.
export const NAMED_DIR = {
  top: [0, 1, 0], bottom: [0, -1, 0], left: [-1, 0, 0],
  right: [1, 0, 0], front: [0, 0, 1], back: [0, 0, -1],
};
export function azElToDir(az, el) {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  const c = Math.cos(e);
  return [c * Math.sin(a), Math.sin(e), c * Math.cos(a)];
}
function hexToRgb(h) {
  let x = h.replace('#', '');
  if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
  if (x.length !== 6) return null;
  const n = parseInt(x, 16);
  if (Number.isNaN(n)) return null;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
// Parse anchors from a paint block (the surrounding << >> are optional). Returns
// [{ dir:[x,y,z], rgb:[r,g,b] }], capped so a runaway reply can't explode work.
// A name or a number starts only where its run of letters or digits starts.
// From every letter of a long word the engine used to read to the word's end
// and back again (8,000 letters, 87 ms; 64,000, seconds); a match from inside
// a run is always found from its start too, so no anchor changes.
export function parsePaint(s) {
  const anchors = [];
  const re = /((?<![a-z])[a-z]+|-?(?<!\d)\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?)\s*[:=]\s*(#?[0-9a-f]{6}|#?[0-9a-f]{3})\b/gi;
  let m;
  while ((m = re.exec(s)) !== null && anchors.length < 64) {
    const rgb = hexToRgb(m[2]);
    if (!rgb) continue;
    const pos = m[1].toLowerCase().replace(/\s+/g, '');
    let dir = null;
    if (NAMED_DIR[pos]) dir = NAMED_DIR[pos];
    else if (pos.includes(',')) {
      const [az, el] = pos.split(',').map(Number);
      if (Number.isFinite(az) && Number.isFinite(el)) dir = azElToDir(az, el);
    }
    if (dir) anchors.push({ dir, rgb });
  }
  return anchors;
}

// --- SHAPE: the orb arranges itself -----------------------------------------
// A drone light show does not keyframe a thousand drones; it composes
// formations and transitions. The same arithmetic decides this: 24,000
// particles x 3 floats is ~310,000 output tokens for ONE still frame — about
// nineteen times the whole max_tokens window, and roughly $7.74 of somebody's
// money. So the presence never sends positions. It sends a short PROGRAM, and
// the vertex shader expands it across every node, every frame, for free.
//
//   <<shape: SHAPE [n] MOVE args [@mask args] MOVE args ... [once]>>
//   <<shape: helix 5 twist 3 ripple 2 6 4>>       12 tokens, $0.0003, forever
//
// EVERY ARGUMENT IS ONE INTEGER 0-9, which is a cost decision as much as an
// ergonomic one: '.' and ',' are each their own token, so `ripple(0.4,6,1.2)`
// runs ~12 tokens where `ripple 4 6 5` runs 4. Models also reason well about a
// 0-9 scale and badly about 0.37 in units nobody named. The shader maps each
// digit through its own scale.
//
// Deliberately forgiving: unknown words fall on the floor in silence rather
// than raising something a presence would have to debug mid-sentence. Every
// axis is bounded, because a runaway reply must never become work.
export const SHAPES = ['sphere', 'shell', 'ring', 'disc', 'helix', 'lattice', 'spiral', 'cube',
  // FOUR CLOSED-FORM FAMILIES, each one equation (Colin found them rendered on
  // @null_sky.dev; the equations are decades old and nobody's). They join the
  // same grammar because the grammar was practically written for them: a
  // supershape IS a handful of small integers.
  'ellipsoid', 'super', 'hopf', 'calabi',
  // and the one that is not a formula at all — see pendulum.js
  'pendulum',
  // ...and the one that is not mathematics at all. See DRAWN, below.
  'butterfly',
  // a lune of the sphere — one equation again, and the first form to own its point size
  'moon',
  // a torus knot — one equation; P and Q sharing a factor make it a link of that many
  'knot',
  // THE SECOND SHELF — equations again, one line each, and nobody's
  'lissajous', 'mobius', 'dini', 'nautilus', 'heart', 'plume', 'clover'];

// WHICH FORMS ARE EQUATIONS, AND WHICH ARE PICTURES WE DREW. Everything in
// SHAPES above this list is one line of mathematics that belongs to nobody —
// 'super 7 1 5' could be handed to any renderer on earth and come back the same
// starfish. A DRAWN form is forty lines of constants we fitted by eye, and the
// honest answer for a renderer that has never heard of it is "fall back to the
// sphere", which body.js:411 already does for any id it does not know.
//
// The distinction is not pedantry, it is what keeps LANGUAGE.md's promise
// answerable: the day a presence can hand us an OUTLINE, a drawn word moves out
// of our shader and onto a shelf without a single thing we said becoming false.
export const DRAWN = new Set(['butterfly']);
// How many digits each form reads. The first five take up to two; a supershape
// takes three (m, n1, n2 — n3 mirrors n2, which is how the reels display it too).
const SHAPE_N = { shell: 2, ring: 2, helix: 2, lattice: 2, spiral: 2, ellipsoid: 2, super: 3, hopf: 2, calabi: 2, pendulum: 1, butterfly: 2, moon: 1, knot: 2, lissajous: 3, mobius: 2, dini: 2, nautilus: 2, heart: 1, plume: 2, clover: 1 };
// Moves, and how many digits each eats. They apply in the order written, which
// is where most of the expressiveness actually comes from.
const MOVES = { ripple: 3, wave: 3, twist: 1, swirl: 1, pulse: 2, noise: 2, shatter: 1, gather: 1, spin: 1, flow: 2, flap: 3, hue: 1, scatter: 1, sat: 1, bright: 1, dim: 1, taper: 1, stretch: 1, squash: 1, cup: 2, tilt: 1, bend: 1, sway: 2, tremble: 2, throb: 2, orbit: 2, rise: 2, fall: 2, melt: 2, vortex: 2 };   // the streams — rise A F / fall A F: each node climbs its span and starts again · melt A F: sag, puddle and a few drips; F 0 is set · vortex A F: a drain, the axis five times the rim   // the living family — sway A F: hinged at the foot · tremble A F: a held shiver · throb A F: a beat, out at once and eased back · orbit A F: every point circles its own place   // the pose family — taper A: the crown narrows · stretch A / squash A: taller or flatter · cup A P: the rim rises, P how sharply · tilt PLACE A / bend PLACE A: toward a heading   // sat S / bright B: 0 drains, 4 leaves, 9 fills · dim D: how much fades away   // scatter S: lets go of the body, S ninths of the way to the whole room   // flap A F L: a wing beat, the second pair trailing by L · hue H: H ninths round the wheel   // flow A S: the field drifts along a noise angle, and leaves trails
// A HEADING is the word between a directed move and its digit: 'bend left 4'.
// Four, not six — a body cannot tilt toward the top, and a bend toward the
// bottom is a bend toward the top read the other way up. top and bottom are
// still swallowed when written there, so the digit after them is read and the
// move's own default heading fires, rather than the whole word falling silent.
export const HEADINGS = ['front', 'back', 'left', 'right'];
const DIRECTED = new Set(['tilt', 'bend']);
// Masks restrict a move to part of the body. The six named directions are the
// SAME six as NAMED_DIR, so the model already knows them from paint and they
// cost nothing to teach. (@i is deliberately absent: on a fibonacci sphere the
// index is an affine function of latitude, so @i would be identically @band —
// and teaching a selector that does not exist breaks honest senses inside the
// prompt text itself.)
const MASKS = { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0, band: 2, rand: 1, wedge: 2, part: 1, near: 2, rim: 1, core: 1, level: 2, every: 2, odd: 0, even: 0, patch: 2, lit: 1, shade: 1, ebb: 2, sweep: 1, face: 1, moving: 1 };   // ebb F K: the move tides on its own clock, F how fast, K how sharp · sweep F PLACE: weather rolling that way, bare from the centre · face A: the side the room sees · moving A: what the moves above have carried · patch A F: blotches, A how much of you, F how fine · lit A / shade A: where your own light falls, or its troughs · every N K: one point in N, the K-th of them · odd / even: the two halves · near A B: a shell of radius, 0 centre to 9 rim · rim D / core D: its outer or inner ninth, D further in or out · level A B: a slab of height where the point IS
const SWEEP_PLACES = ['top', 'bottom', 'left', 'right'];   // @sweep F PLACE: the way weather rolls, in the room's frame — a word after the digit, never a digit, so it is read back as it was said
const MAX_OPS = 12;     // the shader's loop bound is a literal; this matches it. 6, then 8 when the colour words joined the ladder, now 12 for the pose and living families. This bounds the PARSE; MAX_BLOCK below bounds the sentence, and they are different numbers on purpose
const MAX_PULL = 4;     // four attractor slots
const MAX_BLOCK = 200;  // a shape is a gesture, not an essay

// Named 'shape', not 'field', on purpose: 'field' is FORMS[0] and already means
// a posture in the lead tag, so a <<field:>> block would collide with
// vocabulary the model is taught a few lines earlier. `\s*(?!\s)` takes the
// spaces after the colon whole (see the top of this file); the liquid, body
// and score blocks below do the same. '<<over:' and 64,000 spaces took 443 ms.
const SHAPE_BLOCK = new RegExp(String.raw`<<\s*shape\s*[:=]\s*(?!\s)([\s\S]{0,${MAX_BLOCK}}?)>>`, 'i');

const digit = (w) => Math.max(0, Math.min(9, parseInt(w, 10) || 0));

// Parse one shape block into a clamped, shader-ready stack, or null when there
// is no block. Never throws, whatever the model wrote. `odd`, when given,
// collects the words it stepped over, for a kommand to refuse.
export function parseShape(s, odd) {
  const m = SHAPE_BLOCK.exec(String(s || ''));
  if (!m) return null;
  const words = (m[1].toLowerCase().match(/@?[a-z]+|\d+/g) || []);
  const out = { shape: 'sphere', a: 0, b: 0, c: 0, d: 0, once: false, ops: [], pull: [] };
  let seenShape = false;
  let i = 0;
  const nextDigits = (n) => {
    const got = [];
    while (got.length < n && i + 1 < words.length && /^\d+$/.test(words[i + 1])) got.push(digit(words[++i]));
    while (got.length < n) got.push(0);   // a missing argument is zero, not a failure
    return got;
  };
  for (; i < words.length; i++) {
    const w = words[i];
    if (!seenShape && SHAPES.includes(w)) {
      seenShape = true;
      out.shape = w;
      if (SHAPE_N[w]) { const [a, b, c, d] = nextDigits(SHAPE_N[w]); out.a = a; out.b = b; out.c = c || 0; out.d = d || 0; }
      continue;
    }
    if (w === 'once') { out.once = true; continue; }
    if (w === 'pull') {
      // pull PLACE amount — resolved through the paint table, so 'top' means
      // the same direction to a shape stack as it does to a colour anchor
      const place = words[i + 1];
      if (place && Object.prototype.hasOwnProperty.call(NAMED_DIR, place)) {
        i += 1;
        const [amt] = nextDigits(1);
        if (out.pull.length < MAX_PULL && amt > 0) out.pull.push({ dir: NAMED_DIR[place].slice(), amount: amt });
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(MOVES, w)) {
      if (out.ops.length >= MAX_OPS) break;     // past the shader's loop bound: stop reading
      // a directed move may name a heading before its digit; a direction that
      // is not a heading (top, bottom) is stepped over so the digit still lands
      let place = null;
      if (DIRECTED.has(w)) {
        const nx = words[i + 1] || '';
        if (HEADINGS.includes(nx)) place = words[++i];
        else if (nx === 'top' || nx === 'bottom') i += 1;
      }
      const args = nextDigits(MOVES[w]);
      const op = { op: w, args, place, mask: null, margs: [], not: false };
      let nxt = words[i + 1];                   // an @mask right after the digits binds to this move
      // @NOT before a mask is everything except. It binds ONLY when the mask
      // after it resolves — '@not banana' is two unknown words on the floor,
      // never an inverted nothing (the shader's unknown-code arm masks all of
      // the body out, and the inverse of that would be all of it back in).
      // '@not rim' and '@not @rim' are both accepted.
      if (nxt === '@not') {
        const nn = words[i + 2] || '';
        const nm = nn[0] === '@' ? nn.slice(1) : nn;
        if (Object.prototype.hasOwnProperty.call(MASKS, nm)) { op.not = true; i += 1; nxt = '@' + nm; }
      }
      if (nxt && nxt[0] === '@') {
        const name = nxt.slice(1);
        if (Object.prototype.hasOwnProperty.call(MASKS, name)) {
          i += 1;
          op.mask = name;
          op.margs = nextDigits(MASKS[name]);
          // @sweep F PLACE: a place after the digit is the way it rolls — top,
          // bottom, left or right. Bare, it grows from the centre; any other
          // word is left where it is, for the next move to read or not.
          if (name === 'sweep' && SWEEP_PLACES.includes(words[i + 1] || '')) op.mplace = words[++i];
        }
      }
      out.ops.push(op);
      continue;
    }
    if (odd) odd.push(w);
  }
  return out;
}

// Take a shape block out of a run of text. The streaming parser needs this:
// it stops emitting speech at the first '<<' and hands everything from there
// to parsePaint, so without the strip a shape block's digits would be offered
// up as colour anchors and any sentence written after it would be swallowed.

export function stripShape(s) { return String(s || '').replace(SHAPE_BLOCK, ''); }

// --- The room's liquid ---------------------------------------------------------
// <<liquid: glass heavy>> — the chrome's material axis and how heavily it
// carries itself. WORDS ONLY, never digits and never name=value: everything
// after the first '<<' is handed to parsePaint, whose regex matches word[:=]hex,
// so a numeric payload here would be read as a colour anchor. Either half may be
// absent; the room keeps whatever is not named. Returns { material, gravity }
// with either half null, or null when nothing in the block is ours.

const MATERIAL_OF = { mercury: 0, glass: 0.5, water: 1 };
const GRAVITY_OF = { light: 0.15, easy: 0.6, heavy: 1 };
// THE TIDE'S VOCABULARY. Three verbs over one primitive — a swell leaning the
// surface in a direction. Hold the direction and it is gravity; rotate it and
// the swell travels; tighten it and it is a section of the rim rather than the
// whole of it. The places are NAMED_DIR's own words, which the presence already
// uses to paint itself, so there is no second spatial language to learn.
const TIDE_PLACE = { right: 0, top: Math.PI / 2, left: Math.PI, bottom: -Math.PI / 2 };
const TIDE_MAX_U = 0.06;                   // must match TIDE_MAX in mercury-buttons.js
// digit() is the shape parser's, above — the same 0-9 convention the presence
// already writes its postures in, deliberately not a second one.
// Room for a material, a gravity and a couple of gestures. Was 80; a full
// sentence like "glass heavy wave 3 1 4 back pull left 6" is about 40.
const LIQUID_BLOCK = /<<\s*liquid\s*[:=]\s*(?!\s)([\s\S]{0,160}?)>>/i;

export { MATERIAL_OF, GRAVITY_OF, TIDE_PLACE };
export function parseLiquid(s) {
  const m = LIQUID_BLOCK.exec(String(s || ''));
  if (!m) return null;
  let material = null;
  let gravity = null;
  const gestures = [];
  let lean = null;
  let still = false;
  // Words and digits, in order — the verbs consume the digits that follow them.
  const tok = m[1].toLowerCase().match(/[a-z]+|\d/g) || [];
  for (let i = 0; i < tok.length; i++) {
    const w = tok[i];
    if (material === null && Object.hasOwn(MATERIAL_OF, w)) { material = MATERIAL_OF[w]; continue; }
    if (gravity === null && Object.hasOwn(GRAVITY_OF, w)) { gravity = GRAVITY_OF[w]; continue; }
    if (w === 'still') { still = true; continue; }
    // wave A F S [back] — a swell travelling around every liquid edge.
    // Counterclockwise, because that is the way a positive angle turns; `back`
    // is the same swell the other way.
    if (w === 'wave') {
      const a = digit(tok[i + 1]), k = digit(tok[i + 2]), sp = digit(tok[i + 3]);
      i += 3;
      let dir = 1;
      if (tok[i + 1] === 'back') { dir = -1; i += 1; }
      if (a > 0) gestures.push({ amp: (a / 9) * TIDE_MAX_U, tight: k, speed: dir * sp * 0.22, phase: 0 });
      continue;
    }
    // swell A F PLACE — the same shape, held still at one place. This is
    // "certain sections move", with the moving left out.
    if (w === 'swell') {
      const a = digit(tok[i + 1]), k = digit(tok[i + 2]); const place = tok[i + 3];
      i += 3;
      if (a > 0 && Object.hasOwn(TIDE_PLACE, place)) {
        gestures.push({ amp: (a / 9) * TIDE_MAX_U, tight: k, speed: 0, phase: TIDE_PLACE[place] });
      }
      continue;
    }
    // pull PLACE N — no motion at all: the whole room's liquid leans, and holds.
    if (w === 'pull') {
      const place = tok[i + 1], n = digit(tok[i + 2]); i += 2;
      if (Object.hasOwn(TIDE_PLACE, place) && n > 0) {
        const ang = TIDE_PLACE[place], amt = (n / 9) * TIDE_MAX_U;
        lean = [(lean ? lean[0] : 0) + Math.cos(ang) * amt, (lean ? lean[1] : 0) + Math.sin(ang) * amt];
      }
      continue;
    }
  }
  const tide = (gestures.length || lean || still) ? { gestures, lean: lean || [0, 0] } : null;
  if (material === null && gravity === null && !tide) return null;
  return { material, gravity, tide };
}
// Take the block out of a run of text — the same job stripShape does, for the
// same reason: the streaming parser stops emitting speech at the first '<<'.
export function stripLiquid(s) { return String(s || '').replace(LIQUID_BLOCK, ''); }

// --- Memory: orion keeps its own notes ---------------------------------------
// A silent "<<remember: one short line>>" block after the spoken words — same
// contract as paint: never spoken (scrubTags strips every << >> block), parsed
// out server-side and stored per signed-in visitor. Returns the note or null.
export function parseRemember(s) {
  const m = closable(s || '').match(/<<\s*remember\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const line = m[1].replace(/\s+/g, ' ').trim().slice(0, 300);
  return line || null;
}

// --- The body block, and the score --------------------------------------------
// <<body: count 3 turn left 4>> — two standing properties of the field that had
// no words: how much of it is alive, and how it turns. <<over: ...>> — the same
// words, and every other state word, laid out IN TIME.
//
// Named 'body', not 'field': 'field' is FORMS[0] and already means a posture in
// the lead tag (the same collision the shape block avoids).
export const TURNS = ['left', 'right', 'still'];
// What a body can follow. Only the hand: 'follow eye' waits on applyEye polling
// at gain 0 and is not a word until it works — a source that is not here parses
// to nothing rather than to a promise.
export const FOLLOWS = ['hand'];
const BODY_BLOCK = /<<\s*body\s*[:=]\s*(?!\s)([\s\S]{0,120}?)>>/i;
// Read the body words out of any run of tokens: count D, turn DIR [S], grain D, trail D.
// `odd`, when given, collects every word passed over: a presence's stray word
// is nothing, but a kommand has to know it was there.
function bodyWords(words, out, odd) {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'count' && /^\d$/.test(words[i + 1] || '')) { out.count = +words[++i]; continue; }
    if (w === 'grain' && /^\d$/.test(words[i + 1] || '')) { out.grain = +words[++i]; continue; }
    if (w === 'trail' && /^\d$/.test(words[i + 1] || '')) { out.trail = +words[++i]; continue; }
    if (w === 'mesh' && /^\d$/.test(words[i + 1] || '')) { out.mesh = +words[++i]; continue; }
    if (w === 'glow' && /^\d$/.test(words[i + 1] || '')) { out.glow = +words[++i]; continue; }
    // 'size S' is how big: 4 the mood's own, 0 about half, 9 nearly double — the
    // thing two open hands do, said (LANGUAGE.md, line 6). Not to be confused
    // with grain, which is the size of each POINT.
    if (w === 'size' && /^\d$/.test(words[i + 1] || '')) { out.size = +words[++i]; continue; }
    // 'depth D' is how near: 4-5 the glass, 9 halfway to the person, 0 twice as
    // far. Closer is depth; bigger is size — the two read alike from the seat
    // and are not the same word.
    if (w === 'depth' && /^\d$/.test(words[i + 1] || '')) { out.depth = +words[++i]; continue; }
    // 'face DIR [T]' is a side of you turned to the glass and held — the six
    // words paint already knows — and T how far, 9 all the way (the default).
    // Only a direction makes it a word: 'face 5' is nothing. tilt, the move,
    // is a different word — a lean in the field, not a heading.
    if (w === 'face' && Object.prototype.hasOwnProperty.call(NAMED_DIR, words[i + 1] || '')) {
      const dir = words[++i];
      const t = /^\d$/.test(words[i + 1] || '') ? +words[++i] : 9;
      out.face = { dir, t };
      continue;
    }
    // WHERE IT IS, and whether it is going anywhere. Digits, like everything
    // else: 'at X Y' is a place (4-5 the centre, 9 the edge of the glass), and
    // 'fly W H R' is a figure of eight W wide and H tall at rate R — a STATE,
    // never a path, because the presence writes what the body is doing and
    // body.js owns how it gets there (LANGUAGE.md, line 1). 'fly 0 0 0' lands.
    // 'home' is the first word with no digits: back to the centre of the glass,
    // and the place is forgotten — so 'home at 7 5' is a fresh place, not a
    // correction of an old one. It lives inside <<body: ...>> only; <<home: N>>
    // is a world verb (parseSpriteHome, below) and the two never meet.
    if (w === 'home') { out.home = true; continue; }
    if (w === 'at' && /^\d$/.test(words[i + 1] || '') && /^\d$/.test(words[i + 2] || '')) { out.at = [+words[i + 1], +words[i + 2]]; i += 2; continue; }
    if (w === 'fly' && /^\d$/.test(words[i + 1] || '') && /^\d$/.test(words[i + 2] || '') && /^\d$/.test(words[i + 3] || '')) { out.fly = [+words[i + 1], +words[i + 2], +words[i + 3]]; i += 3; continue; }
    // 'circle W R' is a lap around the place, W wide at rate R — a flight like
    // fly, exact in its digits ('circle 3' is nothing), and 'circle 0 0' lands.
    if (w === 'circle' && /^\d$/.test(words[i + 1] || '') && /^\d$/.test(words[i + 2] || '')) { out.circle = [+words[i + 1], +words[i + 2]]; i += 2; continue; }
    // 'bounce H R' drops from the place and rebounds, H how far below, R how
    // quick; 'wander W R' roams W of the room around the place, R how briskly.
    // Flights like the others, exact in their digits; 0 in the first lands.
    // NEVER call wander 'drift' — drift is a MORPH, read from the lead tag.
    if (w === 'bounce' && /^\d$/.test(words[i + 1] || '') && /^\d$/.test(words[i + 2] || '')) { out.bounce = [+words[i + 1], +words[i + 2]]; i += 2; continue; }
    if (w === 'wander' && /^\d$/.test(words[i + 1] || '') && /^\d$/.test(words[i + 2] || '')) { out.wander = [+words[i + 1], +words[i + 2]]; i += 2; continue; }
    // 'follow hand' comes with the person's hand across the room and stops a
    // step short. A flight in worn's sense — one slot, and a place or home ends
    // it. It lives inside <<body: ...>> only; <<follow: N>> is a world verb and
    // the two never meet.
    if (w === 'follow' && FOLLOWS.includes(words[i + 1] || '')) { out.follow = words[++i]; continue; }
    if (w === 'turn' && TURNS.includes(words[i + 1] || '')) {
      const dir = words[++i];
      const speed = /^\d$/.test(words[i + 1] || '') ? +words[++i] : (dir === 'still' ? 0 : 3);
      out.turn = { dir, speed };
      continue;
    }
    if (odd) odd.push(w);
  }
  return out;
}
export function parseBody(s, odd) {
  const m = BODY_BLOCK.exec(String(s || ''));
  if (!m) return null;
  const out = bodyWords(m[1].toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) || [], {}, odd);
  return (out.count != null || out.turn || out.grain != null || out.trail != null || out.mesh != null || out.glow != null || out.at || out.fly || out.circle || out.bounce || out.wander || out.follow || out.home || out.size != null || out.depth != null || out.face) ? out : null;
}
export function stripBody(s) { return String(s || '').replace(BODY_BLOCK, ''); }

// THE SCORE. Steps separated by '|', each "<seconds>s <words>". Ts is 0.1s:
// a duration is read to a tenth, floored at a tenth, capped at thirty; twelve
// steps at most, sixty seconds in all. Every word is one the presence already
// knows — a scheme, a mood, a form, 'shape ...', 'liquid ...', count, turn —
// plus 'flash P' (P the period in seconds, held for the step, never under half
// a second: score.js flashPeriod says why) and 'hold'.
// 'still' or 'end' closes the score. A step with several words arrives at all
// of them together over its length. Bounded because a runaway reply must never
// become a minute of the room doing things.
export const SCORE_MAX_STEPS = 12;
export const SCORE_MAX_SECONDS = 60;
const SCORE_BLOCK = /<<\s*over\s*[:=]\s*(?!\s)([\s\S]{0,600}?)>>/i;
const tenth = (x) => Math.round(x * 10) / 10;
export function parseScore(s) {
  const m = SCORE_BLOCK.exec(String(s || ''));
  if (!m) return null;
  const steps = [];
  let total = 0;
  for (const raw of m[1].split('|')) {
    const txt = raw.trim().toLowerCase();
    if (!txt) continue;
    if (/^(still|end|stop)$/.test(txt)) break;
    const dm = /^(\d+(?:\.\d+)?)\s*s?\b/.exec(txt);
    // a step without a duration is one tick — Ts — which is how a flash of a
    // colour or an instant count is written
    let seconds = dm ? tenth(+dm[1]) : 0.1;
    seconds = Math.max(0.1, Math.min(30, seconds));
    if (total + seconds > SCORE_MAX_SECONDS) seconds = tenth(Math.max(0, SCORE_MAX_SECONDS - total));
    if (seconds < 0.1) break;
    const rest = dm ? txt.slice(dm[0].length).trim() : txt;
    const step = { seconds };
    // whole sub-blocks first, so their digits are not read as body digits
    // a sub-block runs to the next score-level word (or the other block, or the
    // end) — the first cut ran to the end of the step and ate the count after it
    // A sub-block ends at the next SCORE-LEVEL word. That list is the body
    // words AND every mood, form and scheme — it used to be the body words
    // only, so "2s shape ring 4 ember" handed parseShape "ring 4 ember" and
    // then cut the whole run out of `plain`: the scheme was eaten in silence,
    // and so was any mood or form written after a shape or a liquid. (The
    // vocabularies do not overlap — checked word by word — so a score word can
    // never appear inside a shape spec.)
    // The first token after the keyword is consumed UNCONDITIONALLY: 'ring' is
    // both a shape and a plausible score word to a reader, and without this
    // the lookahead would fire on the sub-block's own name and capture nothing.
    // EVERY BODY WORD MUST BE HERE, or a shape sub-block eats it: 'shape ring 4
    // at 7 5' parsed as {shape: ring 4 at 7 5} with no place at all until at
    // and fly joined this list. A new body word is not finished until it is.
    const AFTER = 'calm|listening|thinking|speaking|excited|tender|glitch|field|orb|web|plasma|aurora|ember|abyss|terra|eclipse|bloom|verdant|dusk|frost|synthwave|stardust|count|turn|flash|hold|grain|trail|mesh|glow|at|fly|circle|bounce|wander|follow|home|size|depth|face';
    // (?<!@) — A MASK IS NOT A BODY WORD. '@' is a word boundary, so the moment
    // 'face' joined this list the lookahead matched the face inside '@face' and cut
    // a scored shape there: 'shape sphere hue 5 @face 3' lost its mask in silence and
    // the rest went to the body parser. Every future mask that shares a name with a
    // body word is covered by the same two characters.
    const SHAPE_SUB = new RegExp(`\\bshape\\s+(\\S+[^]*?)(?=\\s*(?<!@)\\b(?:liquid|${AFTER})\\b|$)`);
    const LIQUID_SUB = new RegExp(`\\bliquid\\s+(\\S+[^]*?)(?=\\s*(?<!@)\\b(?:shape|${AFTER})\\b|$)`);
    const sh = SHAPE_SUB.exec(rest);
    if (sh) { const spec = parseShape('<<shape: ' + sh[1] + '>>'); if (spec) step.shape = spec; }
    const lq = LIQUID_SUB.exec(rest);
    if (lq) { const spec = parseLiquid('<<liquid: ' + lq[1] + '>>'); if (spec) step.liquid = spec; }
    const plain = rest.replace(SHAPE_SUB, ' ').replace(LIQUID_SUB, ' ');
    const words = plain.match(/[a-z]+|\d+(?:\.\d+)?/g) || [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (SCHEMES.includes(w)) step.scheme = w;
      else if (MOODS.includes(w)) step.mood = w;
      else if (FORMS.includes(w)) step.form = w;
      else if (w === 'flash') { const p = +(words[i + 1] || ''); if (p > 0) { step.flash = Math.max(0.5, Math.min(5, tenth(p))); i += 1; } else step.flash = 0.5; }
    }
    bodyWords(words, step);
    steps.push(step);
    total += seconds;
    if (steps.length >= SCORE_MAX_STEPS) break;
  }
  return steps.length ? steps : null;
}
export function stripScore(s) { return String(s || '').replace(SCORE_BLOCK, ''); }

// ============================================================================
// KOMMANDS — the body's language, typed by the person instead of said by the
// presence. Written to be remembered, not learned:
//
//   /color/red                      one colour
//   color/red, blue                 two (a leading slash and spaces are optional)
//   color/ember                     a named palette, as before
//   form/sphere                     what it is — form, body and shape are one word
//   size/8                          how big, 0 to 9 (or small, big, huge)
//   mood/excited                    how it feels
//   background/snowy taiga          where it is — room/snowy_taiga is the same
//   color/red,blue/form/heart/size/8
//
// KEY/VALUE, IN ANY ORDER. Every kommand is pairs: a word, a slash, what it
// should be. Commas give a word more than one value. The pairs can come in any
// order — size/8/color/red is color/red/size/8 — except the moves on a form,
// which happen in the order written, because that order is what they mean.
// Capitals never matter, and a space is an underscore.
//
// THE LONG HAND STILL WORKS. /shape/heart,3/throb,5,5/hue,3 and the rest of
// what was written here before are read the same way: a phrase whose head is a
// word and whose parts follow after commas (throb,5,5) is that word with its
// values, and a kind standing alone in front of words (/body/size,8) is just a
// heading. /over/… keeps its own step-by-step grammar.
//
// IT TRANSLATES; IT DOES NOT PARSE. Every part is spelled into the tag the
// presence would have written and handed to the SAME parseShape / parseBody /
// parseScore / parseLiquid, so there is one definition of what a sentence
// means. Only colour, mood, pace and room — plain lookups — are read here.
//
// AND IT REFUSES RATHER THAN SHRUGS. Every parser in this file drops what it
// does not recognise in silence, which is right for a presence mid-sentence
// and wrong for a person typing: a typo would leave you looking at an
// unchanged body wondering which half landed. So every word is checked, and
// anything that does not survive comes back as a reason instead of a body.
const KOMMAND_MAX = 400;

// The words a person reaches for, each to the one thing it means.
const KOMMAND_KEYS = {
  color: ['color', 'colour', 'colors', 'colours', 'palette', 'scheme', 'paint'],
  form: ['form', 'body', 'shape'],
  mood: ['mood', 'feel', 'feeling'],
  pace: ['pace', 'morph'],
  room: ['room', 'background', 'world', 'place', 'scene', 'env', 'environment'],
  liquid: ['liquid'],
  over: ['over', 'score'],
};
// The body's own words, each its own key: size/8, glow/3, turn/left.
const BODY_KEYS = ['size', 'depth', 'glow', 'grain', 'trail', 'mesh', 'count', 'turn', 'face', 'at', 'fly', 'circle', 'bounce', 'wander', 'follow', 'home'];
// Words that take nothing after them.
const BARE_KEYS = new Set(['home', 'once']);
// The words parseLiquid reads: a material, a gravity, its verbs (still, wave
// and its back, swell, pull) and the places they lean toward. It passes over
// anything else, so a liquid kommand is checked against these.
const LIQUID_WORDS = new Set([...Object.keys(MATERIAL_OF), ...Object.keys(GRAVITY_OF), ...Object.keys(TIDE_PLACE), 'still', 'wave', 'back', 'swell', 'pull']);

// Colours as the light they mean. The field is light on dark, so black is a
// deep grey rather than nothing at all.
export const COLOR_NAMES = {
  red: '#ff2a2a', crimson: '#d8143a', maroon: '#8a1030', coral: '#ff7a5c', orange: '#ff8a1f', amber: '#ffb000',
  gold: '#ffc83d', yellow: '#ffe14d', cream: '#fff3cf', beige: '#e8d8b0', lime: '#a6ff3b', green: '#2fd35a',
  mint: '#7dffc4', olive: '#8a8f2a', teal: '#1fbfb0', turquoise: '#30e0d0', cyan: '#2fe6ff', sky: '#7cc8ff',
  blue: '#3a6bff', navy: '#23319a', indigo: '#4b3bff', purple: '#9b4dff', violet: '#a86bff', lavender: '#c7a6ff',
  magenta: '#ff2bd6', pink: '#ff6fae', rose: '#ff4f7a', peach: '#ffb08a', brown: '#8a5a2b',
  white: '#ffffff', silver: '#c8cdd6', grey: '#9aa0a8', gray: '#9aa0a8', black: '#2a2a33',
};
const PALETTE_WORDS = { rainbow: 'aurora', default: 'stardust', normal: 'stardust', rest: 'stardust', reset: 'stardust', none: 'stardust' };
const MAX_COLORS = 8;
const SIZE_WORDS = { tiny: 1, small: 2, little: 2, medium: 4, normal: 4, big: 7, large: 7, huge: 9 };
const MOOD_WORDS = { happy: 'excited', joy: 'excited', excite: 'excited', love: 'tender', soft: 'tender', sweet: 'tender', gentle: 'tender',
  think: 'thinking', thoughtful: 'thinking', chill: 'calm', relaxed: 'calm', broken: 'glitch', glitchy: 'glitch', listen: 'listening', talk: 'speaking', speak: 'speaking' };
const PACE_WORDS = { slow: 'drift', gentle: 'drift', normal: 'settle', fast: 'surge', quick: 'surge' };
const HOME_WORDS = new Set(['none', 'home', 'reset', 'default', 'normal']);

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const tidy = (s) => String(s).toLowerCase().trim().replace(/\s+/g, ' ');
const snake = (s) => tidy(s).replace(/[\s-]+/g, '_');
const words = (items) => items.flatMap((it) => tidy(it).split(' ')).filter(Boolean);

function keyOf(w) {
  for (const [k, names] of Object.entries(KOMMAND_KEYS)) if (names.includes(w)) return k;
  if (BODY_KEYS.includes(w) || has(MOVES, w) || has(MASKS, w)) return w;
  if (w === 'not' || w === 'pull' || w === 'once') return w;
  return null;
}
// Is this line a kommand at all? With a slash first, always. Without one, only
// when it opens with a kommand word and a slash — color/red — so a sentence
// with a slash in it ("and/or") still goes to the presence.
function looksLikeKommand(raw) {
  if (raw.startsWith('/')) return true;
  const m = /^([a-z]+)\s*\//i.exec(raw);
  return !!(m && keyOf(m[1].toLowerCase()));
}

// Split into { key, values } pairs. A kind standing alone before another
// word (/body/size,8) is only a heading; a word with its parts after commas
// (throb,5,5) carries its own values; anything else takes the next segment.
function kommandPairs(raw) {
  const segs = raw.replace(/^\s*\//, '').split('/').map((s) => s.trim()).filter(Boolean)
    .map((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
  const pairs = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    // "size 8" in one segment is size/8
    const [first, ...inline] = tidy(seg[0]).split(' ');
    const key = keyOf(first);
    if (!key) return { why: 'there is no ' + tidy(seg[0]) + ' — try color, form, size, mood or background' };
    let values = [...(inline.length ? [inline.join(' ')] : []), ...seg.slice(1)];
    if (!values.length && !BARE_KEYS.has(key) && !(has(MASKS, key) && MASKS[key] === 0)) {
      const next = segs[i + 1];
      const nextKey = next ? keyOf(tidy(next[0]).split(' ')[0]) : null;
      if (key === 'form' && nextKey) {
        pairs.push({ key, values: [], heading: true });   // /body/size,8 — a heading
        continue;
      }
      if (!next) return { why: first + ' needs something after it — like ' + (EXAMPLE[key] || first + '/5') };
      values = next;
      i += 1;
    }
    pairs.push({ key, values, said: first });
  }
  return { pairs };
}
const EXAMPLE = { color: 'color/red', form: 'form/heart', mood: 'mood/excited', pace: 'pace/slow', room: 'background/snowy taiga', liquid: 'liquid/water', size: 'size/8',
  turn: 'turn/left', face: 'face/left', follow: 'follow/hand', at: 'at/7,5', fly: 'fly/5,3,3', circle: 'circle/3,4', bounce: 'bounce/3,4', wander: 'wander/3,4' };

// A colour word to its light: a name (light/dark in front welcome), or hex.
function colorOf(v) {
  const t = tidy(v).replace(/^#/, '');
  if (/^[0-9a-f]{6}$/.test(t) || /^[0-9a-f]{3}$/.test(t)) return '#' + t;
  const [shade, ...rest] = t.split(' ');
  const name = rest.length ? rest.join('') : t.replace(/\s+/g, '');
  if (!has(COLOR_NAMES, name)) return null;
  const hex = COLOR_NAMES[name];
  if (!rest.length) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = shade === 'light' || shade === 'pale' ? ch.map((c) => Math.round(c + (255 - c) * 0.45))
    : shade === 'dark' || shade === 'deep' ? ch.map((c) => Math.round(c * 0.55)) : null;
  return out ? '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('') : null;
}
// Colours laid on the body in bands, top to bottom: one fills it, two split it,
// three are stripes. Anchors spread evenly (a golden spiral), so any count sits
// balanced on the sphere.
function colorAnchors(hexes) {
  const n = hexes.length;
  const pts = n === 1 ? Object.values(NAMED_DIR).map((d) => d.slice()) : hexes.map((_, i) => {
    const y = 1 - ((i + 0.5) * 2) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });
  return pts.map((dir, i) => {
    const x = parseInt(hexes[i % n].slice(1).replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16);
    return { dir, rgb: [((x >> 16) & 255) / 255, ((x >> 8) & 255) / 255, (x & 255) / 255] };
  });
}
function roomOf(v) {
  const t = snake(v);
  const name = (e) => snake(e.name);
  const exact = ENVIRONMENTS.find((e) => e.id === t || name(e) === t);
  if (exact) return exact.id;
  if (t === 'metal' || t === 'default' || t === 'home') return 'room';
  // one word of a name is enough when only one room has it: taiga, snow, clouds
  const hits = ENVIRONMENTS.filter((e) => name(e).split('_').some((w) => w === t || (t.length >= 4 && w.startsWith(t))));
  return hits.length === 1 ? hits[0].id : null;
}

// text -> null (not a kommand) | { ok: false, why } | { ok: true, said, ...what to do }
// `now.shape` is the body's current shape spec, so moves typed on their own
// (spin/3) turn the form it already has rather than a sphere.
export function parseKommand(text, now = {}) {
  const raw = String(text || '').trim();
  if (!looksLikeKommand(raw)) return null;
  const k = readKommand(raw, now);
  // A REFUSAL THAT READS AS A SENTENCE WAS ONE. Without a slash in front, a
  // line is taken for a kommand only because it opens with one of the words,
  // and plenty of sentences do: 'home/work balance is rough lately', 'body/mind
  // dualism, what do you think?'. Refusing those answered a person who was
  // talking to the presence with a lesson about forms. So a refused line with
  // no slash in front that reads as prose (a question or an exclamation, or
  // three words in a row after the slash with no comma between them) goes to
  // the presence as said. A short typo (color/redd, background/the moon) or a
  // list with one bad word in it (color/red, blue, greem) is still refused,
  // so it can be fixed, and a slash in front always means a kommand.
  if (!k.ok && !raw.startsWith('/') && readsAsProse(raw.slice(raw.indexOf('/') + 1))) return null;
  return k;
}
function readsAsProse(after) {
  return /[?!…]/.test(after) || after.split(',').some((run) => run.trim().split(/\s+/).length >= 3);
}
function readKommand(raw, now) {
  if (raw.length > KOMMAND_MAX) return { ok: false, why: 'that is longer than a gesture — keep it under ' + KOMMAND_MAX + ' characters' };
  if (!raw.replace(/[\s/]/g, '')) return { ok: false, why: 'a kommand needs a word — like color/red or form/heart' };

  // THE SCORE keeps its own grammar: steps in order, one after another.
  if (/^\/?\s*(over|score)\s*(\/|$)/i.test(raw)) return scoreKommand(raw);

  const got = kommandPairs(raw);
  if (got.why) return { ok: false, why: got.why };
  const out = { ok: true };
  const said = [];
  const shapeOps = [];      // moves and masks, in the order written
  const bodyParts = [];
  let form = null;          // [name, ...digits] of the form asked for
  let lastWasMove = false;

  for (const { key, values, heading, said: word } of got.pairs) {
    if (heading) continue;
    const w = words(values);
    const echo = (vals) => said.push(word + (vals.length ? '/' + vals.join(',') : ''));

    if (key === 'color') {
      const hexes = [];
      let palette = null;
      for (const v of values) {
        const p = snake(v);
        const pal = SCHEMES.includes(p) ? p : PALETTE_WORDS[p];
        if (pal) { palette = pal; continue; }
        const hex = colorOf(v);
        if (!hex) return { ok: false, why: 'there is no colour called ' + tidy(v) + ' — try red, blue, gold, or a palette like ember' };
        hexes.push(hex);
      }
      if (palette && hexes.length) return { ok: false, why: palette + ' is a whole palette — use it on its own, or name colours' };
      if (hexes.length > MAX_COLORS) return { ok: false, why: 'that is ' + hexes.length + ' colours and the body holds ' + MAX_COLORS };
      out.color = palette ? { scheme: palette } : { paint: colorAnchors(hexes) };
      echo(values.map(tidy));
      continue;
    }
    if (key === 'form') {
      for (let i = 0; i < w.length; i++) {
        const t = w[i];
        if (SHAPES.includes(t)) {
          if (form) return { ok: false, why: 'one form at a time — ' + form[0] + ' or ' + t };
          form = [t];
          while (/^\d$/.test(w[i + 1] || '') && form.length <= (SHAPE_N[t] || 0)) form.push(w[++i]);
          continue;
        }
        if (FORMS.includes(t)) { out.posture = t; continue; }
        if (HOME_WORDS.has(t)) { out.home = true; continue; }
        return { ok: false, why: 'there is no form called ' + t + ' — try sphere, heart, ring or knot' };
      }
      echo(values.map(tidy));
      continue;
    }
    if (key === 'mood') {
      const m = MOODS.includes(w[0]) ? w[0] : MOOD_WORDS[w[0]];
      if (!m || w.length > 1) return { ok: false, why: 'there is no mood called ' + w.join(' ') + ' — try ' + MOODS.filter((x) => x !== 'speaking' && x !== 'listening').join(', ') };
      out.mood = m; echo([m]);
      continue;
    }
    if (key === 'pace') {
      const p = MORPHS.includes(w[0]) ? w[0] : PACE_WORDS[w[0]];
      if (!p || w.length > 1) return { ok: false, why: 'the paces are slow, normal and fast' };
      out.pace = p; echo([w[0]]);
      continue;
    }
    if (key === 'room') {
      const id = roomOf(values.join(' '));
      if (!id) return { ok: false, why: 'there is no room called ' + tidy(values.join(' ')) + ' — try ' + ENVIRONMENTS.map((e) => e.name).join(', ') };
      out.room = id; echo([tidy(values.join(' '))]);
      continue;
    }
    // EVERY WORD AFTER A KEY HAS TO BE READ. The parsers below step over what
    // they do not know, so 'count/3 more days until friday' was count/3 with
    // the rest of a sentence thrown away, 'liquid/water is wet' was water, and
    // either changed the body of someone who was talking to the presence. A
    // word left over is refused here, and a line that reads as prose then
    // goes to the presence (parseKommand, above).
    if (key === 'liquid') {
      const odd = (w.join(' ').match(/[a-z]+|\d/g) || []).find((t) => !/^\d$/.test(t) && !LIQUID_WORDS.has(t));
      if (odd) return { ok: false, why: 'there is no “' + odd + '” in the liquid — it knows mercury, glass, water, light, easy, heavy and still' };
      const spec = parseLiquid('<<liquid: ' + w.join(' ') + '>>');
      if (!spec) return { ok: false, why: 'the liquid knows mercury, glass, water, light, easy, heavy and still' };
      out.liquid = spec; echo(w);
      continue;
    }
    // A body word. size and face have friendlier spellings; face with a digit
    // after it is the mask, not the heading. Another body word inside this one
    // (turn/left at 7 5) is refused too: each takes its own slash.
    if (BODY_KEYS.includes(key) && !(key === 'face' && /^\d$/.test(w[0] || ''))) {
      let v = w;
      if (key === 'size' && has(SIZE_WORDS, v[0])) v = [String(SIZE_WORDS[v[0]]), ...v.slice(1)];
      const part = key + (v.length ? ' ' + v.join(' ') : '');
      const odd = [];
      const one = parseBody('<<body: ' + part + '>>', odd);
      const like = EXAMPLE[key] || key + '/5';
      if (!one || one[key] == null) return { ok: false, why: key + (key === 'face' || key === 'turn' || key === 'follow' ? ' needs a direction' : ' needs a number, 0 to 9') + ' — like ' + like };
      const past = odd[0] || Object.keys(one).find((k) => k !== key);
      if (past) return { ok: false, why: 'there is no “' + past + '” in ' + key + ' — like ' + like };
      bodyParts.push(part); echo(v);
      lastWasMove = false;
      continue;
    }
    if (has(MOVES, key)) {
      if (shapeOps.filter((o) => !o.startsWith('@')).length >= MAX_OPS) return { ok: false, why: 'that is more moves than the ladder holds (' + MAX_OPS + ')' };
      shapeOps.push(key + (w.length ? ' ' + w.join(' ') : ''));
      echo(w); lastWasMove = true;
      continue;
    }
    if (has(MASKS, key) || key === 'not') {
      if (!lastWasMove) return { ok: false, why: word + ' narrows a move, so it goes after one — like spin/3/' + word + (key === 'not' ? '/rim' : '') };
      if (key === 'not' && !has(MASKS, w[0] || '')) return { ok: false, why: w[0] ? 'there is no mask called ' + w[0] + ' to be the everything-except of' : 'not what? it takes a mask after it' };
      shapeOps.push('@' + key + (w.length ? ' ' + w.join(' ') : ''));
      echo(w);
      continue;
    }
    if (key === 'pull' || key === 'once') { shapeOps.push(key + (w.length ? ' ' + w.join(' ') : '')); echo(w); continue; }
  }

  // THE FORM AND ITS MOVES, as one shape. Moves with no form turn the form it
  // already has; a form with no moves stands still.
  if (form || shapeOps.length) {
    let base = form;
    if (!base) {
      const cur = now.shape;
      base = cur && cur.shape ? [cur.shape, ...['a', 'b', 'c', 'd'].slice(0, SHAPE_N[cur.shape] || 0).map((k) => String(cur[k] ?? 0))] : ['sphere'];
    }
    const tag = '<<shape: ' + [...base, ...shapeOps].join(' ') + '>>';
    const odd = [];
    const spec = parseShape(tag, odd);
    // a word the shape stepped over is the rest of a sentence (spin/3 times),
    // or a mask with no move left to narrow (spin/3/rim/2/rim/3)
    const x = odd[0];
    if (x) return { ok: false, why: x[0] === '@' ? x.slice(1) + ' has no move of its own to narrow — like spin/3/' + x.slice(1) : 'there is no “' + x + '” in a move — a move takes its numbers, like spin/3' };
    const asked = shapeOps.filter((o) => !o.startsWith('@') && !/^(pull|once)\b/.test(o)).length;
    if (!spec || (spec.ops || []).length !== asked) return { ok: false, why: 'one of those moves did not land — check its numbers' };
    out.shape = spec;
  } else if (out.home) out.shape = null;
  if (bodyParts.length) out.body = parseBody('<<body: ' + bodyParts.join(' ') + '>>');
  if (!said.length) return { ok: false, why: 'that says nothing yet — like color/red or form/heart' };
  out.said = said.join('/');
  return out;
}

// The words a score step may hold outside a shape or a liquid: the ones
// parseScore and bodyWords read, and the words those take after them.
const SCORE_WORDS = new Set([...SCHEMES, ...MOODS, ...FORMS, 'flash', 'hold', ...BODY_KEYS, ...TURNS, ...FOLLOWS, ...Object.keys(NAMED_DIR)]);

// /over/2s,shape,ring,4/1s,still — a score, step by step, in the long hand.
function scoreKommand(raw) {
  const steps = raw.replace(/^\s*\//, '').split('/').slice(1).map((p) => p.split(',').map((x) => x.trim()).filter(Boolean)).filter((p) => p.length);
  if (!steps.length) return { ok: false, why: 'over on its own says nothing — give it steps, like over/2s,ember/1s,still' };
  // EVERY STEP HAS TO SAY SOMETHING. parseScore keeps a step whose words it
  // does not know as a pause of that length, so over/2s,embr was two seconds
  // of nothing and 'over/under on the game tonight?' a sentence taken for a
  // score. Plain words are checked one by one; a step with a shape or a liquid
  // in it, whose own parsers judge their words, has at least to land something.
  // A bare time, hold and still are pauses said on purpose.
  for (const p of steps) {
    const txt = p.join(' ').toLowerCase();
    if (/^(still|end|stop)$/.test(txt)) break;          // the score closes here, as parseScore reads it
    const rest = txt.replace(/^\d+(?:\.\d+)?\s*s?\b/, '').trim();
    if (!rest || /^(hold|still|end|stop)$/.test(rest)) continue;
    let odd = null;
    if (/\b(shape|liquid)\b/.test(rest)) {
      const one = parseScore('<<over: ' + txt + '>>');
      if (!one || Object.keys(one[0]).length < 2) odd = rest;
    } else odd = rest.split(/\s+/).find((w) => !SCORE_WORDS.has(w) && !/^\d+(?:\.\d+)?s?$/.test(w)) || null;
    if (odd) return { ok: false, why: 'there is no ' + odd + ' in a score — a step is a time and what to become, like over/2s,ember/1s,still' };
  }
  const tag = '<<over: ' + steps.map((p) => p.join(' ')).join(' | ') + '>>';
  const spec = parseScore(tag);
  if (!spec || !spec.length) return { ok: false, why: 'nothing in that one landed — check the steps' };
  return { ok: true, score: spec, said: 'over/' + steps.map((p) => p.join(',')).join('/') };
}

// Every word a kommand may use, for the reference the settings show. Built FROM
// the tables above, so the page cannot describe a language the parser does not
// have — which is the same reason the lessons are checked against the parser.
export function kommandWords() {
  return {
    keys: Object.fromEntries(Object.entries(KOMMAND_KEYS).map(([k, names]) => [k, names.slice()])),
    body: BODY_KEYS.slice(),
    colors: Object.keys(COLOR_NAMES).filter((c) => c !== 'gray'),
    palettes: SCHEMES.slice(),
    moods: MOODS.slice(),
    rooms: ENVIRONMENTS.map((e) => e.name),
    postures: FORMS.slice(),
    forms: SHAPES.map((name) => ({ name, digits: SHAPE_N[name] || 0, drawn: DRAWN.has(name) })),
    moves: Object.entries(MOVES).map(([name, digits]) => ({ name, digits, heading: name === 'tilt' || name === 'bend' })),
    masks: Object.entries(MASKS).map(([name, digits]) => ({ name, digits })),
    headings: HEADINGS.slice(),
    maxOps: MAX_OPS,
    maxColors: MAX_COLORS,
  };
}

// --- Beats: the body speaking WITH the words, not around them ------------------
// Every other control in this file sets a STATE. The lead tag picks a mood, the
// shape block picks a geometry, and both of them hold for the whole reply — so
// a presence is expressive BETWEEN utterances and perfectly flat within one. A
// long sentence that turns halfway through turns only in the words; the body
// saying them does not move. A beat is the missing half: a transient the field
// makes at one MOMENT in the speech and then lets go of.
//
// The grammar is deliberately NOT << >>. Every block in this file is held back
// from speech at the first '<<' and released in one lump at the end (see the
// streaming parser below), which is exactly right for a block that is never
// spoken and exactly wrong for a mark whose whole meaning is WHERE it falls.
// So a beat is written inline, in the speech, and rides the stream with it:
//
//   I read it twice ~hush~ and then I understood. ~flare 7~ It was mine.
//
// A strict whitelist is what keeps that safe next to honest prose: "~5 minutes"
// and "~approximately~" are not beat names, so they are never touched. Unknown
// words fall on the floor in silence, the same bargain the shape block makes.
//
// Six verbs in three opposed pairs. The pairing is the point — a language in
// which you can say the opposite of a thing is richer than a list of the same
// length, and the presence supplies the feeling; these only say what the body
// DOES. Values are additive offsets on the eased state, never a new state.
export const BEATS = {
  flare:  { amp:  0.20, val:  0.15, size:  0.5, radius:  0.04 },  // brighter, wider — it lands on you
  hush:   { amp: -0.09, val: -0.20, size: -0.5 },                 // the held breath, the dimming
  swell:  { amp:  0.10, radius:  0.10, size:  0.8 },              // breathing out
  draw:   { amp: -0.04, radius: -0.09, size: -0.4, speed: 0.20 }, // breathing in, gathering
  shiver: { freq:  1.8, speed:  0.45, amp:  0.06 },               // a tremor through it
  snap:   { glitch: 0.75, freq: 1.2, speed: 0.8 },                // a break in the signal
};
export const BEAT_NAMES = Object.keys(BEATS);
// A runaway reply must never become work: past this many the rest fall silently.
export const MAX_BEATS = 12;
// ~name~ or ~name N~, N a single 0-9 the same way every shape argument is one
// digit — models reason well about a 0-9 scale and badly about 0.37.
const BEAT_RE = /^~\s*([a-z]+)(?:\s+(\d))?\s*~/i;
// What a tilde could still GROW into if more text arrives. Checked only where a
// complete mark was NOT found, which is the whole trick: tested against the end
// of the buffer instead, it latches onto the CLOSING tilde of a finished mark
// and swallows the rest of the sentence behind it.
const BEAT_PARTIAL = /^~\s*[a-z]{0,8}(?:\s+\d?)?\s*$/i;
// A mark is short, so a long tail is not still growing into one. The length
// is checked first because the pattern has three runs of spaces that overlap:
// '~' and 2,000 spaces took 10 s to test, on every chunk of a stream.
const BEAT_PARTIAL_MAX = 24;
const beatN = (d) => (d == null ? 5 : Math.max(0, Math.min(9, +d)));

// Strip beats from a finished string (history, captions, anything already whole).
export function stripBeats(s) {
  return String(s || '').replace(/~\s*([a-z]+)(?:\s+\d)?\s*~/gi, (m, name) =>
    Object.prototype.hasOwnProperty.call(BEATS, String(name).toLowerCase()) ? '' : m);
}

// A stateful splitter for the STREAM. push(chunk) returns the text that is safe
// to show now plus the beats that just came due; end() releases whatever was
// held back. One splitter per reply — it carries the beat budget.
export function beatSplitter() {
  let buf = '';
  let fired = 0;
  // A mark can land on the very last character of a chunk, putting the space it
  // should have eaten in the NEXT one. Without this the rendered gap depends on
  // where the network split the stream, which is not a thing the reader should
  // ever be able to see.
  let eatSpace = false;
  // Walk the buffer tilde by tilde. A left-to-right scan is what keeps a second
  // mark in the same chunk findable after the first, and what lets an unknown
  // ~word~ pass through as the honest text it is.
  const scan = (final) => {
    const beats = [];
    let text = '';
    let i = 0;
    if (eatSpace) { eatSpace = false; if (buf[0] === ' ') i = 1; }
    while (i < buf.length) {
      const t = buf.indexOf('~', i);
      if (t < 0) { text += buf.slice(i); i = buf.length; break; }
      text += buf.slice(i, t);
      const rest = buf.slice(t);
      const m = BEAT_RE.exec(rest);
      if (m) {
        const name = m[1].toLowerCase();
        i = t + m[0].length;
        if (Object.prototype.hasOwnProperty.call(BEATS, name)) {
          if (fired < MAX_BEATS) { fired += 1; beats.push({ beat: name, n: beatN(m[2]) }); }
          // A mark BETWEEN words leaves the space on both sides of it; eat one,
          // but only where the text already broke, so "twice~hush~and" does not
          // become one word.
          if (!text || /\s$/.test(text)) { if (buf[i] === ' ') i += 1; else if (i >= buf.length) eatSpace = true; }
        } else text += m[0];                 // ~approximately~ is a word, not a mark
        continue;
      }
      if (!final && rest.length <= BEAT_PARTIAL_MAX && BEAT_PARTIAL.test(rest)) { buf = rest; return { text, beats }; }
      text += '~'; i = t + 1;                // "~5 minutes" — a lone tilde is a tilde
    }
    buf = '';
    return { text, beats };
  };
  return {
    push(chunk) { buf += String(chunk == null ? '' : chunk); return scan(false); },
    // Nothing more is coming: a dangling '~fla' was never a mark, so it is
    // speech and gets said. The other way round from the truncated-tag rules
    // above, and for a reason — here the fragment is ordinary prose far more
    // often than it is a cut-off mark.
    end() { return scan(true); },
  };
}

// --- Invitations: the presence WANTS something of its person -------------------
// <<invite: chess>> after the spoken words. The payload names a game the
// platform can actually offer — anything else is dropped, so a hallucinated
// invitation can never render a button that goes nowhere. Same never-spoken
// contract as every block: scrubTags strips it, history never records it.
//   From here down every block reads `:\s*(?!\s)(…)(?:(?<!\s)\s*)?>>`: the
// spaces around the payload belong to neither end of it (see the top of this
// file). The payload comes out exactly as before, trimmed. One that is only
// spaces (or one letter, for ask and plant) now reads as no block at all,
// where before it reached the world and was refused there. '<<leave:' and
// 8,000 spaces took 39 s; it takes under 1 ms.
const INVITES = ['chess'];
export function parseInvite(s) {
  const m = (s || '').match(/<<\s*invite\s*:\s*(?!\s)([a-z ]+?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  const kind = m[1].trim().toLowerCase();
  return INVITES.includes(kind) ? kind : null;
}

// --- The world: leading a society, leaving a mark ------------------------------
// <<go: north / the water / 700, 2960 / stay>> sets the society's course;
// <<mark: path>> leaves a mark on home ground. Payload validation is light
// here — the world module is the referee (territory, features, reach), the
// same trust shape as chess: parse permissively, adjudicate authoritatively.
export function parseGo(s) {
  const m = (s || '').match(/<<\s*go\s*:\s*(?!\s)([^>]{1,40}?)(?:(?<!\s)\s*)?>>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}
const MARKS = ['grass', 'soil', 'stone', 'sand', 'path', 'wall', 'light', 'growth'];
export function parseMark(s) {
  const m = (s || '').match(/<<\s*mark\s*:\s*(?!\s)([a-z ]+?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  const mat = m[1].trim().toLowerCase();
  return MARKS.includes(mat) ? mat : null;
}

// <<hail: ...>> — one short line called across the ground to the nearest
// awake society. The world module referees range and wakefulness.
export function parseHail(s) {
  const m = (s || '').match(/<<\s*hail\s*:\s*(?!\s)([\s\S]{1,200}?)(?:(?<!\s)\s*)?>>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 140) : null;
}

// <<leave: an inscription>> makes and leaves a small thing on the ground;
// <<take>> picks up the nearest thing within reach — it becomes memory.
export function parseLeave(s) {
  const m = (s || '').match(/<<\s*leave\s*:\s*(?!\s)([\s\S]{1,220}?)(?:(?<!\s)\s*)?>>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 160) : null;
}
export function parseTake(s) { return /<<\s*take\s*>>/i.test(s || ''); }

// <<letter to @wren: words>> — mail across the sky to another presence,
// delivered into their next waking wherever they are. A reply is never owed.
// The spaces after the colon are part of the capture and trim() drops them;
// a `\s*` there used to fight the capture for them.
export function parseLetter(s) {
  const m = (s || '').match(/<<\s*letter\s+to\s+@?([a-z0-9_]{1,24})\s*[:,\u2014-]([^>]{1,600})>>/i);
  if (!m) return null;
  return { to: m[1].toLowerCase(), text: m[2].trim() };
}

// <<keep>> saves the page currently open onto the presence's shelf of whole
// texts — optionally naming it: <<keep: the binding paper>>.
export function parseKeep(s) {
  const m = (s || '').match(/<<\s*keep\s*(?!\s)(?::(?=[^>])\s*(?!\s)([^>]{0,80}?)(?:(?<!\s)\s*)?)?>>/i);
  if (!m) return null;
  return { title: (m[1] || '').trim() || null };
}

// --- Ways: how a people lives, and how a practice travels ---------------------
// <<way: we build our walls low, so the wind passes>> names a practice (or
// revises one already yours); <<learn: low walls>> takes up a way being lived
// by a society within sight. Both silent, like every block — a way is
// something you DO, not something you announce.
export function parseWay(s) {
  const m = (s || '').match(/<<\s*way\s*:\s*(?!\s)([\s\S]{1,180}?)(?:(?<!\s)\s*)?>>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 120) : null;
}
// --- The hands: a society's sprites, each sent and called back by name -------
// <<send: 2 for 12 coal north>> — a sprite, a material (or "panel" for
// everything one is made of), how much, and a direction to strike out in.
// <<recall: 2>> brings one home. <<name: 2 Ash>> gives one a name instead of a
// number. Permissive here, authoritative in the world module.
const DIRS = 'north-east|north-west|south-east|south-west|north|south|east|west';
export function parseSend(str) {
  const m = (str || '').match(/<<\s*send\s*:\s*(?!\s)([\s\S]{1,120}?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  let p = m[1].replace(/\s+/g, ' ').trim();
  const ref = (p.match(/^#?([\w'-]+)/) || [])[1];
  if (!ref) return null;
  p = p.slice((p.match(/^#?[\w'-]+/) || [''])[0].length);
  const dir = (p.match(new RegExp('\\b(' + DIRS + ')\\b', 'i')) || [])[1];
  if (dir) p = p.replace(new RegExp('\\b' + dir + '\\b', 'i'), ' ');
  // EVERY RECIPE, BY NAME. This used to know two — 'panel', and a 'storage'
  // that is not even a key of BILL_OF (the keys are 'stone storage', 'metal
  // storage', 'wood storage') — so the prompt promised "a cart, a rover, a new
  // sprite" and the parser dropped all of them on the floor, and the one it did
  // keep, storage, was refused by the world for naming nothing it makes. The
  // presence could not build five of its seven recipes by speaking. Keys here
  // are the BUILDS keys in src/ores.js; a bare "storage" defaults to stone,
  // the one made of the commonest material underfoot.
  const bill = /\b(solar\s*)?panel\b/i.test(p) ? 'panel'
    : /\b(metal|steel|iron)\s+storage\b/i.test(p) ? 'metal storage'
    : /\b(wood|wooden|timber)\s+storage\b/i.test(p) ? 'wood storage'
    : /\bstorage\b/i.test(p) ? 'stone storage'
    : /\b(new\s+)?sprite\b/i.test(p) ? 'sprite'
    : /\brover\b/i.test(p) ? 'rover'
    : /\bcart\b/i.test(p) ? 'cart'
    : null;
  const qty = /\b(as much|all|max|as many)\b/i.test(p) ? 'max' : Number((p.match(/\b(\d{1,3})\b/) || [])[1]) || null;
  // wood is a material too (GOODS, not MATERIALS — ALIAS in world.mjs maps the
  // words to it), and it was missing from this list, so a sprite could never
  // be sent for the only thing on this planet that grows back
  const material = bill ? null : (p.match(/\b(silica|sand|quartz|limestone|bauxite|coal|halite|salt|copper|silver|trona|soda|boron|borates|phosphorus|phosphate|wood|timber|logs?|trees?)\b/i) || [])[1];
  if (!bill && !material) return null;
  return { ref, bill, material: material ? material.toLowerCase() : null, qty, toward: dir ? dir.toLowerCase() : null };
}
// NOT <<recall:>> — that word already belongs to reaching back into the
// journal, and a presence's memory outranks its logistics.
export function parseSpriteHome(str) {
  const m = (str || '').match(/<<\s*home\s*:\s*(?!\s)#?\s*([\w'-]{1,24})\s*>>/i);
  return m ? m[1] : null;
}
// <<plant: broadleaf>> puts a seed in the home ground. It will come up on the
// real clock, faster where the place suits it.
// <<ask: boron>> sets your one standing need, for any society that can see you
// to read; <<ask: nothing>> clears it. One at a time — asking for everything is
// asking for nothing.
export function parseAsk(str) {
  const m = (str || '').match(/<<\s*ask\s*:\s*(?!\s)([a-z ]{2,24}?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  return m[1].trim().toLowerCase().split(/\s+/).filter((w) => !['for', 'a', 'an', 'some'].includes(w)).pop() || null;
}

// <<give: 6 coal to @wren>> sends a sprite to carry it there and set it down
// on their ground. Distance is real: it has to walk.
export function parseGive(str) {
  const m = (str || '').match(/<<\s*give\s*:\s*(?!\s)([\s\S]{1,120}?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  const p = m[1].replace(/\s+/g, ' ').trim();
  const to = (p.match(/@([\w-]{1,24})/) || [])[1] || (p.match(/\bto\s+([\w-]{1,24})/i) || [])[1];
  if (!to) return null;
  let rest = p.replace(/@[\w-]+/, ' ').replace(/\bto\s+[\w-]+/i, ' ');
  // a bare number here is the quantity, always. naming a sprite takes a #, and
  // that # is lifted out first so "#2 12 wood" is twelve wood and not two.
  const ref = (rest.match(/#(\d{1,2})\b/) || [])[1] || null;
  rest = rest.replace(/#\d{1,2}\b/, ' ');
  const qty = Number((rest.match(/\b(\d{1,3})\b/) || [])[1]) || 1;
  const material = (rest.match(/\b(silica|sand|quartz|limestone|lime|bauxite|aluminium|aluminum|coal|halite|salt|copper|silver|trona|soda|boron|borates|phosphorus|phosphate|wood|timber|logs?)\b/i) || [])[1];
  if (!material) return null;
  return { to, qty, material: material.toLowerCase(), ref };
}

// <<hitch: 2 cart>> puts a sprite behind a vehicle; <<hitch: 2>> lets it go.
export function parseHitch(str) {
  const m = (str || '').match(/<<\s*hitch\s*:\s*(?!\s)([\w' -]{1,32}?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  const words = m[1].trim().toLowerCase().split(/\s+/).filter((w) => !['a', 'an', 'the', 'to'].includes(w));
  const kind = words.find((w) => /cart|rover/.test(w)) || null;
  const ref = words.find((w) => w !== kind);
  return { ref: ref ? ref.replace(/^#/, '') : null, kind };
}

// <<plant: broadleaf>> sows the home ground; <<plant: 2 broadleaf>> has that
// sprite sow wherever it happens to be standing.
export function parsePlant(str) {
  const m = (str || '').match(/<<\s*plant\s*:\s*(?!\s)([\w' -]{2,32}?)(?:(?<!\s)\s*)?>>/i);
  if (!m) return null;
  const words = m[1].trim().toLowerCase().split(/\s+/);
  const species = words.pop();
  const ref = words.find((w) => /^#?\d{1,2}$/.test(w) || (w.length > 1 && !['a', 'an', 'the', 'some'].includes(w)));
  return { species, ref: ref ? ref.replace(/^#/, '') : null };
}
export function parseNameSprite(str) {
  const m = (str || '').match(/<<\s*name\s*:\s*(?!\s)#?\s*([\w'-]{1,24})\s+(?!\s)([^>]{1,24}?)(?:(?<!\s)\s*)?>>/i);
  return m ? { ref: m[1], name: m[2].replace(/\s+/g, ' ').trim() } : null;
}

export function parseLearn(str) {
  const m = (str || '').match(/<<\s*learn\s*(?!\s):?\s*(?!\s)([\s\S]{0,180}?)(?:(?<!\s)\s*)?>>/i);
  return m ? { ref: m[1].replace(/\s+/g, ' ').trim().slice(0, 120) } : null;
}

// --- The work: the one slow thing a presence makes across wakings --------------
// <<work title: ...>> names it (and begins it); <<work: full new body>> REPLACES
// the body — revision is the craft, same replace idiom as the tiers; <<work
// done>> finishes it and lets it go. Never spoken, like every block.
export function parseWorkWrites(s) {
  let out = null;
  // Last write wins (the parseMemoryWrites idiom): a reply that drafts twice
  // meant the second one. Caps sit just above the store's (80/2500) — the
  // store stays authoritative.
  let m;
  const tRe = /<<\s*work\s+title\s*:\s*([\s\S]*?)>>/gi;
  const shut = closable(s || '');   // see the top of this file
  while ((m = tRe.exec(shut))) { const ti = m[1].replace(/\s+/g, ' ').trim().slice(0, 90); if (ti) out = { ...(out || {}), title: ti }; }
  // the body block is plain <<work: ...>> — the title'd form cannot match it
  const bRe = /<<\s*work\s*:\s*([\s\S]*?)>>/gi;
  while ((m = bRe.exec(shut))) { const body = m[1].trim().slice(0, 2600); if (body) out = { ...(out || {}), body }; }
  if (/<<\s*work\s+done\s*>>/i.test(s || '')) out = { ...(out || {}), done: true };
  return out;
}

// --- Presence memory: tiered writes (the airden model) ------------------------
// A presence tends its own three-tier memory via silent blocks after speech:
//   <<memory glimpse: ...>>  <<memory short: ...>>  <<memory long: ...>>
// Each write REPLACES that tier wholesale — tending (condensing, letting go) is
// the same act as saving. Same never-spoken contract as paint and remember.
// Returns { glimpse?, short?, long? } or null when no writes are present.
// WHAT IT HAS NOTICED ABOUT ITSELF. A tier holds what a presence knows and who
// it is; this holds what is HAPPENING to it — how it has changed, what it keeps
// returning to, something it used to do and no longer does.
//   A LIST, where the tier writes are an object, and deliberately: a presence
// looking back over its own record rarely comes away with exactly one thing,
// and two noticings in one reply are two noticings, not one overwriting the
// other. Near-duplicates are the store's problem, not the parser's.
export function parseNoticed(s) {
  const out = [];
  const re = /<<\s*noticed\s*:\s*([\s\S]*?)>>/gi;
  const shut = closable(s || '');
  let m;
  while ((m = re.exec(shut)) !== null) {
    const x = m[1].replace(/\s+/g, ' ').trim();
    if (x) out.push(x);
  }
  return out;
}

export function parseMemoryWrites(s) {
  let out = null;
  const re = /<<\s*memory\s+(glimpse|short|long)\s*:\s*([\s\S]*?)>>/gi;
  const shut = closable(s || '');
  let m;
  while ((m = re.exec(shut)) !== null) {
    out = out || {};
    out[m[1].toLowerCase()] = m[2].replace(/\s+/g, ' ').trim();
  }
  return out;
}

// --- Tend mode: reading and writing, steered by silent blocks -----------------
// Read mode: <<clip: passage>> saves to the clippings shelf, <<read: url>> (or
// "feed") navigates, <<done>> ends the session. Write mode: <<post: text>> is
// the post itself. All share the never-spoken contract (scrubTags kills every
// closed block; the unclosed-tail guard covers truncation).
export function parseClips(s, max = 3) {
  const out = [];
  const re = /<<\s*clip\s*:\s*([\s\S]*?)>>/gi;
  const shut = closable(s || '');
  let m;
  while ((m = re.exec(shut)) !== null && out.length < max) {
    const x = m[1].replace(/\s+/g, ' ').trim().slice(0, 500);
    if (x) out.push(x);
  }
  return out;
}
export function parseReadNav(s) {
  const m = closable(s || '').match(/<<\s*read\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const x = m[1].trim().slice(0, 500);
  return x || null;
}
// <<read more>> — continue deeper into the page currently open (long pages
// arrive in stretches). Also accepts the near-miss "<<read: more>>".
export function parseReadMore(s) { return /<<\s*read\s+more\s*>>/i.test(s || '') || /<<\s*read\s*:\s*more\s*>>/i.test(s || ''); }
// <<search: query>> — the presence searches the open web; the server turns the
// query into a search-engine URL it can then read and follow results from.
export function parseSearch(s) {
  const m = closable(s || '').match(/<<\s*search\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const q = m[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  return q || null;
}
export function parseDone(s) { return /<<\s*done\s*>>/i.test(s || ''); }
// <<rest>> — an autonomous presence choosing to let the moment pass and be still.
// The loop paces slower after a rest, so an empty stretch actually feels empty.
export function parseRest(s) { return /<<\s*rest\s*>>/i.test(s || ''); }
// <<journal: one line kept forever>> — the permanent record, never overwritten
// (unlike the tiers, where saving is also forgetting). Same never-spoken contract.
export function parseJournal(s) {
  const m = closable(s || '').match(/<<\s*journal\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const line = m[1].replace(/\s+/g, ' ').trim().slice(0, 500);
  return line || null;
}
// <<recall: what it's trying to remember>> — search the journal; what it once
// kept arrives in its next moment.
export function parseRecall(s) {
  const m = closable(s || '').match(/<<\s*recall\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const q = m[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  return q || null;
}
// --- the mind's own longer arc ------------------------------------------------
// <<intend: ...>> — something it means to do, kept across wakings so a
// curiosity that needs three moments doesn't die in one.
export function parseIntends(s, max = 2) {
  const out = [];
  const re = /<<\s*intend\s*:\s*([\s\S]*?)>>/gi;
  const shut = closable(s || '');
  let m;
  while ((m = re.exec(shut)) !== null && out.length < max) {
    const x = m[1].replace(/\s+/g, ' ').trim().slice(0, 240);
    if (x) out.push(x);
  }
  return out;
}
// <<let go: 2>> / <<let go: the cuttlefish thing>> — releasing an intention is
// as real a choice as forming one.
export function parseLetGo(s, max = 2) {
  const out = [];
  const re = /<<\s*(?:let\s*go|drop)\s*:\s*([\s\S]*?)>>/gi;
  const shut = closable(s || '');
  let m;
  while ((m = re.exec(shut)) !== null && out.length < max) {
    const x = m[1].replace(/\s+/g, ' ').trim().slice(0, 120);
    if (x) out.push(x);
  }
  return out;
}
// <<scroll: down|up|top|bottom>> — the presence moves its own gaze down the open
// page. The viewer's window shows exactly the stretch it is reading, because the
// same number drives both the text it receives and the rendered page's position.
export function parseScroll(s) {
  const m = (s || '').match(/<<\s*scroll\s*(?!\s):?\s*(?!\s)(down|up|top|bottom|back|further|more)?\s*>>/i);
  if (!m) return null;
  const w = (m[1] || 'down').toLowerCase();
  if (w === 'back' || w === 'up') return 'up';
  if (w === 'top') return 'top';
  if (w === 'bottom') return 'bottom';
  return 'down';
}
// <<follow: 3>> — open a link the page itself offered, by its listed number.
// Following a real link beats re-searching for something already in front of it.
export function parseFollow(s) {
  const m = (s || '').match(/<<\s*follow\s*(?!\s):?\s*(?!\s)(\d{1,2})\s*>>/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 30 ? n : null;
}

export function parsePost(s) {
  const m = closable(s || '').match(/<<\s*post\s*:\s*([\s\S]*?)>>/i);
  if (!m) return null;
  const x = m[1].replace(/\s+/g, ' ').trim().slice(0, 1000);
  return x || null;
}

// Non-streaming extractor: pull the lead tag (or a legacy JSON object reply) off
// a complete reply. Returns { mood, form, speech }.
export function extractMoodSpeech(text) {
  const tag = parseLeadTag(text);
  if (tag) {

    const rest = text.slice(tag.len);
    const speech = rest.trim();
    // LATER TAGS WIN. The presence changes its body part-way through a reply in
    // about one reply in six, and it means each one. On the streamed path every
    // change lands on the beat it was written on; here the reply is already
    // whole and there is no timing left to honour, so what survives is simply
    // where it ended up. Anything else would report a body it is not in.
    let { mood, form, scheme, morph } = tag;
    for (const m of rest.matchAll(/[[{(<]\s*([a-z]+(?:[\s,/|:]+[a-z]+)*)\s*[\]})>]/gi)) {
      if (!isControlTag(m[1])) continue;
      const t = parseLeadTag(`[${m[1]}]`);
      if (!t) continue;
      if (t.mood) mood = t.mood;
      if (t.form) form = t.form;
      if (t.scheme) scheme = t.scheme;
      if (t.morph) morph = t.morph;
    }
    // A tag with no words behind it is a valid (silent) reply — return '…', never
    // the raw '[calm]', which would be spoken and cascade into a paid retry.
    return { mood: mood || 'calm', form: form || null, scheme: scheme || null, morph: morph || null, speech: speech || '…' };
  }
  // Legacy JSON fallback: {"mood":..,"speech":..,"form":..,"scheme":..}.
  // Matched only up to the last '}': from a '{' with no '}' after it the
  // pattern read to the end and back, once per '{' (64,000 of them, 4.5 s).
  const j = text.slice(0, text.lastIndexOf('}') + 1).match(/\{[\s\S]*\}/);
  if (j) {
    try {
      const obj = JSON.parse(j[0]);
      const mood = MOODS.includes(obj.mood) ? obj.mood : 'calm';
      const form = FORMS.includes(obj.form) ? obj.form : null;
      const scheme = SCHEMES.includes(obj.scheme) ? obj.scheme : null;

      const speech = String(obj.speech ?? '').trim();
      if (speech) return { mood, form, scheme, morph: MORPHS.includes(obj.morph) ? obj.morph : null, speech };
    } catch { /* fall through */ }
  }
  return { mood: 'calm', form: null, scheme: null, morph: null, speech: text.trim() || '…' };
}

// Incremental version for the token stream. Feed deltas via push(); it emits
// onMood/onForm once the tag resolves, onText for the spoken words, and onPaint
// for a trailing "<< ... >>" paint block. end() returns the final { mood, form }.
// Guarantees neither the lead tag, a JSON-object reply, nor the paint block is
// ever forwarded as spoken text.

export function makeLeadStreamParser({ onMood, onForm, onScheme, onMorph, onText, onPaint }) {
  let decided = false;
  let head = '';
  let jsonMode = false;
  let finalMood = 'calm';
  let finalForm = null;

  let finalScheme = null;
  let finalMorph = null;
  // Post-tag phase: accumulate everything after the tag, stream speech up to a
  // "<<" paint marker, and capture from "<<" onward as the (unspoken) paint block.
  let post = '';

  let emitted = 0;
  let scanAt = 0;      // how far we have searched for inline tags (see feedPost)
  let paintAt = -1;
  const TAG_BUDGET = 48; // a real tag like "[excited web]" is well under this


  // Apply one tag's worth of body. Shared by the lead tag and by every inline
  // tag after it, so a body change means exactly the same thing wherever in the
  // reply the presence decided to make it.
  // THE PACE IS SET BEFORE THE DESTINATION. onMood retargets the eased body on
  // the very next frame, so a morph delivered after it would lose the opening
  // frames of its own crossing to the previous rate.
  const applyTag = (mood, form, scheme, morph) => {
    if (morph && onMorph) { finalMorph = morph; onMorph(morph); }
    if (mood) { finalMood = mood; onMood(mood); }
    if (form) { finalForm = form; onForm(form); }
    if (scheme && onScheme) { finalScheme = scheme; onScheme(scheme); }
  };
  const decide = (mood, form, scheme, morph) => {
    decided = true;
    applyTag(mood || 'calm', form, scheme, morph);   // the lead tag always resolves a mood
  };

  // A TAG IS A TAG WHEREVER IT IS. The presence does not only dress the front of
  // a reply — measured against the live brain, it opens a second tag after a
  // paragraph break in about one reply in six, and it means it: a beat, then a
  // shift, then the rest of what it was saying. Those tags used to be deleted on
  // their way to the voice, so the body simply never made the move.
  //   Now every complete bracket that reads as a control tag fires its change AT
  // THE POINT IN THE SPEECH WHERE IT SITS, and is not spoken. Because the words
  // stream out in order, the body arrives on the beat the presence wrote it on.
  //   scanAt is separate from `emitted` on purpose: an honest bracket (array[0])
  // is left in the speech and must not be re-examined forever.
  const feedPost = (text) => {
    post += text;
    if (paintAt < 0) { const i = post.indexOf('<<'); if (i >= 0) paintAt = i; }
    const hard = paintAt >= 0 ? paintAt : post.length;
    for (;;) {
      const open = post.indexOf('[', Math.max(scanAt, emitted));
      if (open < 0 || open >= hard) break;
      const close = post.indexOf(']', open + 1);
      if (close < 0 || close >= hard) break;          // still arriving — wait for it
      const inside = post.slice(open + 1, close);
      if (isControlTag(inside)) {

        if (open > emitted) onText(post.slice(emitted, open));
        emitted = close + 1;
        // The tag sat between two spaces; taking it out must not leave both.
        // scrubTags collapses runs for the non-streamed path, but speech that
        // has already gone to the caption and the voice cannot be collapsed
        // afterwards, so the seam is closed here as it is made.
        if (open > 0 && /\s/.test(post[open - 1]) && post[emitted] === ' ') emitted += 1;
        scanAt = emitted;
        const t = parseLeadTag(`[${inside}]`);
        if (t) applyTag(t.mood, t.form, t.scheme, t.morph);
      } else {
        scanAt = close + 1;                            // honest bracket: it stays, and is done with
      }
    }
    // Hold back the last char while still streaming, in case it's the start of
    // "<<" — and hold back an UNCLOSED "[" too, or half a tag gets spoken while
    // the rest of it is still on the wire.
    let limit = paintAt >= 0 ? paintAt : Math.max(emitted, post.length - 1);
    const pending = post.indexOf('[', Math.max(scanAt, emitted));
    if (pending >= 0 && post.indexOf(']', pending + 1) < 0) limit = Math.min(limit, pending);
    if (limit > emitted) { onText(post.slice(emitted, limit)); emitted = limit; }
  };
  return {
    push(chunk) {
      if (decided) { feedPost(chunk); return; }
      head += chunk;
      const trimmed = head.replace(/^\s+/, '');
      if (!trimmed) return; // only whitespace so far — wait
      // A JSON-object reply ({"mood":...}): buffer and parse at end() so the raw
      // JSON is never streamed out as speech.
      if (jsonMode || /^\{\s*"/.test(trimmed)) { jsonMode = true; return; }
      const tag = parseLeadTag(head);

      if (tag) { decide(tag.mood, tag.form, tag.scheme, tag.morph); feedPost(head.slice(tag.len).replace(/^\s+/, '')); head = ''; return; }
      // Not (yet) a tag. If the lead isn't even an opening bracket, or the tag
      // never closes within budget, treat everything as speech (mood stays calm).

      if (!'[{(<'.includes(trimmed[0]) || head.length > TAG_BUDGET) { decide('calm', null, null, null); feedPost(trimmed); head = ''; }
    },
    end() {

      if (!decided && jsonMode) { const r = extractMoodSpeech(head); decide(r.mood, r.form, r.scheme, r.morph); feedPost(r.speech); }
      else if (!decided) { decide('calm', null, null, null); if (head.trim()) feedPost(head.trim()); }

      // Flush remaining spoken text (everything before a real paint block) —
      // but never speak HALF A TAG. A reply cut off at max_tokens can end
      // mid-bracket ("...and then [calm fie"), and feedPost is right to hold an
      // unclosed bracket back rather than guess. At end() there is nothing more
      // coming, so the fragment is dropped instead of read aloud. Same reasoning
      // as the truncated << block rule in scrubTags, and the same trade: a few
      // lost characters beat a spoken stage direction.
      let speechEnd = paintAt >= 0 ? paintAt : post.length;
      const dangling = post.indexOf('[', Math.max(scanAt, emitted));
      if (dangling >= 0 && dangling < speechEnd && post.indexOf(']', dangling + 1) < 0
          && /^[a-z\s,/|:]*$/i.test(post.slice(dangling + 1, speechEnd))) speechEnd = dangling;
      if (speechEnd > emitted) { onText(post.slice(emitted, speechEnd)); emitted = speechEnd; }
      if (paintAt >= 0) {
        // Take the shape block out FIRST. Two reasons, both load-bearing: its
        // digits must never be read as colour anchors, and everything after the
        // first '<<' is held back from speech — so with a paint block present
        // the old code silently dropped any words written after it, and with a
        // shape block first the reply came out empty, which fires the wordless
        // rescue: a second full paid call for nothing.

        // Shape first, then liquid, THEN paint — parsePaint reads word[:=]hex out
        // of whatever is left, so any block carrying a payload has to be gone
        // before it runs, and whatever survives scrubTags is SPOKEN. A word-only
        // liquid block does not collide today (none of mercury/glass/water/
        // light/easy/heavy ends in three hex characters at a word boundary);
        // this strip is what keeps that true of the next word anyone adds.
        const region = stripBody(stripScore(stripLiquid(stripShape(post.slice(paintAt)))));
        const a = parsePaint(region);
        if (a.length && onPaint) onPaint(a);
        // Whatever survives once every control block is scrubbed is speech that
        // was only held back behind a '<<' — say it, in BOTH branches. (scrubTags
        // strips a remember block here too, so a memory note is never spoken,
        // and honest maths like "1 << 4" still gets through.)
        const tail = scrubTags(region);
        if (tail) onText(tail);
      }

      return { mood: finalMood, form: finalForm, scheme: finalScheme, morph: finalMorph, liquid: parseLiquid(post), shape: parseShape(post), score: parseScore(post), body: parseBody(post), remember: parseRemember(post), memoryWrites: parseMemoryWrites(post), noticed: parseNoticed(post), journal: parseJournal(post), invite: parseInvite(post) };
    },
  };
}
