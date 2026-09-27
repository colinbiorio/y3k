// WHAT A PRESENCE IS WEARING — the durable half of its body.
//
// Until this file the body was pure client state: currentMoodName and
// currentSchemeKey were closure-locals inside createBody, setForm kept no name
// at all, and paintColors dropped its anchors. So the body did not survive a
// reload, did not reach a viewer who joined late, and — the reason this exists
// — was never on the server, which is what made the system prompt's "your body
// keeps whatever you don't change" an instruction nothing could obey.
//
// THE SERVER IS THE SOURCE OF TRUTH. It records what it parsed; the client
// rehydrates from it on entering a room. Either both, or neither: if the store
// existed and the client still booted to orb/calm/stardust, the prompt would be
// telling the presence it wears something it does not — the honest-senses law
// broken from the inside.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const FILE = join(DATA_DIR, '.worn.json');
const MAX_PRESENCES = 5000;
const MAX_ANCHORS = 12;          // the dance hint asks for 4-10; 12 is slack, not licence
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;

// The resting body. Matches the client's boot defaults and MATERIAL/GRAVITY 0.60
// in src/mercury-buttons.js — if either moves, this moves with it.

export const REST = Object.freeze({
  mood: 'calm', form: 'orb', scheme: 'stardust', painted: 0, paint: null,
  shape: null, morph: 'settle', material: 0.6, gravity: 0.6,
  tide: null,                     // { gestures:[...], lean:[x,y] } once it moves the room
});

function load() {
  try {
    const p = JSON.parse(readFileSync(FILE, 'utf8'));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch { return {}; }
}
let store = load();

function writeNow() {
  try { const tmp = FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(store)); renameSync(tmp, FILE); }
  catch (e) { console.error('[worn] could not persist:', e.message); }
}
// COALESCED, not write-through. An appearance changes on every beat, and a
// synchronous whole-file write per turn is the cadence that pattern exists to
// avoid. unref'd so a pending write never holds the process open.
let pending = null;
function persist() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; writeNow(); }, 1000);
  if (typeof pending.unref === 'function') pending.unref();
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
  process.once(sig, () => { if (pending) { clearTimeout(pending); pending = null; writeNow(); } });
}

export function get(presenceId) {
  if (!presenceId) return { ...REST };
  return { ...REST, ...(store[presenceId] || {}) };
}

// A shape is described in the words it was written in — the presence reads back
// its own grammar, not our uniforms. `once` gestures are NEVER stored: they let
// go after ~1400ms, so by the next turn the field is home and recording one
// would report a posture that is not there.
function shapeWords(sh) {
  if (!sh || sh.once) return null;
  const bare = sh.shape === 'sphere' && !(sh.ops || []).length && !(sh.pull || []).length;
  if (bare) return null;
  // THE WHOLE SENTENCE, digits and masks included. This kept four move NAMES
  // in sixty characters, which was the ladder's depth when it was written; with
  // twelve slots and the colour words riding them the presence was told
  // 'butterfly, flap, hue, hue' and never that it had dimmed its own body. What
  // it wears is what it said, so it is said back the same way.
  const moves = (sh.ops || []).slice(0, 12).map((o) =>
    [o.op, ...(o.place ? [o.place] : []), ...(o.args || [])].join(' ') + (o.mask && o.not ? ' @not' : '') + (o.mask ? ' @' + o.mask + (o.margs?.length ? ' ' + o.margs.join(' ') : '') + (o.mplace ? ' ' + o.mplace : '') : ''));   // the heading between a directed move and its digit, where it was written
  const digits = ['a', 'b', 'c', 'd'].map((k) => sh[k]).filter((v) => v).join(' ');
  // 260, not MAX_BLOCK's 200: that bounds what is PARSED, this bounds what is
  // said back, and a twelve-move sentence with masks does not fit in 200. The
  // readout is never truncated on purpose — a presence told half its sentence
  // wears the other half without knowing.
  return [sh.shape + (digits ? ' ' + digits : ''), ...moves].join(', ').slice(0, 260);
}

// The flights, in the order the client applies them: the last one said wins.
const FLIGHTS = ['fly', 'circle', 'bounce', 'wander'];
// Record ONE turn. Mirrors the client's apply sites one for one — mood always
// lands (extractMoodSpeech always resolves one); everything else only when the
// presence actually said it. What it does not name, it keeps: the same contract
// as a memory tier write.
export function record(presenceId, out) {
  if (!presenceId || !out) return;
  if (!store[presenceId]) {
    const keys = Object.keys(store);
    if (keys.length >= MAX_PRESENCES) delete store[keys[0]];
    store[presenceId] = {};
  }
  const w = store[presenceId];
  if (out.mood) w.mood = out.mood;
  if (out.form) w.form = out.form;
  if (out.scheme) { w.scheme = out.scheme; w.painted = 0; w.paint = null; }  // a palette overrides a painting
  // THE PAINTING ITSELF, not a count of it. This used to keep only how MANY
  // anchors there were, which is enough to tell the presence it is painted and
  // not enough to put the paint back — so a presence that had chosen its own
  // colors lost them the moment anyone left the room and came back. Worse, the
  // client skips setScheme entirely when `painted` is set, so the room went on
  // wearing whatever the PREVIOUS presence had: the exact drift this store was
  // built to end, one field short of ending it.
  //   Bounded like everything else here: the anchors are rounded and capped, so
  // one presence's palette is a few hundred bytes rather than whatever arrived.
  if (out.paint && out.paint.length) {
    w.painted = out.paint.length;
    w.scheme = null;
    w.paint = out.paint.slice(0, MAX_ANCHORS)
      .filter((a) => a && Array.isArray(a.dir) && Array.isArray(a.rgb))
      .map((a) => ({ dir: a.dir.slice(0, 3).map(r3), rgb: a.rgb.slice(0, 3).map(r3) }));
  }
  // THE BODY WORDS, kept. They were never recorded at all — count, turn, grain,
  // trail, mesh, glow — so a presence that had thinned itself to a wisp read a
  // readout that said nothing about it and sent 'count 3' again every turn.
  // Merged, not replaced: a body block names what it changes and keeps the rest.
  // ONE FLIGHT AT A TIME, AROUND THE PLACE: a new flight replaces the old one;
  // a place lands an old flight but never one said in the same breath ('at 7 5
  // circle 3 4' is the sentence); and a flight no longer forgets the place —
  // it is around it, so fly must not delete at.
  if (out.body) {
    const b = { ...(w.body || {}), ...out.body };
    let said = null;
    for (const k of FLIGHTS) if (out.body[k]) said = k;
    if (said || out.body.at) for (const k of FLIGHTS) if (k !== said) delete b[k];
    // HOME FORGETS: the place, the flight and (when it has one) the depth go,
    // and home itself is never kept — it is an act, not a state. Only the OLD
    // record's keys go: 'home at 7 5' is a fresh place and must survive it.
    if (out.body.home) { for (const k of ['at', 'depth', ...FLIGHTS]) if (!out.body[k]) delete b[k]; delete b.home; }
    // A HEADING AND A TURN: a yaw face (left, right, back, front) stops the
    // turn and a turn releases it, so each clears the other; top and bottom
    // keep the turn and are kept by it.
    const yaw = (f) => f && f.dir !== 'top' && f.dir !== 'bottom';
    if (yaw(out.body.face)) delete b.turn;
    if (out.body.turn && !out.body.face && yaw(b.face)) delete b.face;
    w.body = b;
  }
  if (out.morph) w.morph = out.morph;
  if (out.shape !== undefined) w.shape = shapeWords(out.shape);

  if (out.liquid) {
    if (out.liquid.material !== null && out.liquid.material !== undefined) w.material = out.liquid.material;
    if (out.liquid.gravity !== null && out.liquid.gravity !== undefined) w.gravity = out.liquid.gravity;
    // A tide runs until it is stopped, so it has to be remembered — otherwise
    // the presence reads a readout that says nothing is moving, and sends the
    // same wave again every single turn.
    if (out.liquid.tide) w.tide = out.liquid.tide;
  }
  w.updated = Date.now();
  persist();
}


// Where the body is, in the words it was put there with — never in world units.
function placeWords(b) {
  if (!b) return 'the centre of the room';
  let where = 'the centre';
  if (b.at) {
    const [x, y] = b.at;
    const h = x <= 2 ? 'the left' : x >= 7 ? 'the right' : 'the middle';
    const v = y <= 2 ? 'low' : y >= 7 ? 'high' : 'level';
    where = `${x} ${y} — ${h}, ${v}`;
  }
  // a flight is AROUND the place, so both are said — and never a position,
  // which the presence did not choose and would read as a fault
  if (b.circle && b.circle[0]) return `circling ${b.circle[0]} wide at ${b.circle[1]}, around ${where}`;
  if (b.bounce && b.bounce[0]) return `bouncing ${b.bounce[0]} at ${b.bounce[1]}, below ${where}`;
  if (b.wander && b.wander[0]) return `wandering ${b.wander[0]} at ${b.wander[1]}, around ${where}`;
  if (b.fly && (b.fly[0] || b.fly[1])) return `flying a figure of eight, ${b.fly[0]} wide and ${b.fly[1]} tall, at ${b.fly[2]}, around ${where}`;
  return b.at ? `at ${where}` : 'the centre of the room';
}
// How near, in the digit it was said with. 4 and 5 straddle the glass, as 4 and
// 5 straddle the centre for a place; no digit is the glass itself.
function depthWords(b) {
  const d = b && b.depth;
  if (d == null) return 'on the glass';
  return `depth ${d} — ${d >= 5 ? 'nearer than the glass' : d <= 3 ? 'farther than the glass' : 'about on the glass'}`;
}
// Which side is to the glass, in the words it was turned with.
function faceWords(b) {
  const f = b && b.face;
  if (!f) return 'square to the glass, as you rest';
  const side = f.dir === 'top' ? 'your crown toward the person' : f.dir === 'bottom' ? 'your underside toward the person'
    : f.dir === 'back' ? 'turned away' : f.dir === 'front' ? 'square to the glass' : `your ${f.dir} side to the glass`;
  return `face ${f.dir} ${f.t} — ${side}, ${f.t >= 9 ? 'all the way' : f.t === 0 ? 'not at all' : `${f.t} of 9`}`;
}
const MAT_WORD = (v) => (v < 0.25 ? 'mercury' : v < 0.75 ? 'glass' : 'water');
const GRAV_WORD = (v) => (v < 0.35 ? 'light' : v < 0.8 ? 'easy' : 'heavy');
// Say the tide back in the words it was written in, never in radians. A
// presence that reads "0.88 rad/s" cannot tell whether that is the wave it sent.
const PLACE_WORD = (ang) => {
  const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a >= (7 * Math.PI) / 4) return 'right';
  if (a < (3 * Math.PI) / 4) return 'top';
  if (a < (5 * Math.PI) / 4) return 'left';
  return 'bottom';
};
function tideWords(t) {
  if (!t) return 'still';
  const parts = [];
  for (const g of (t.gestures || []).slice(0, 4)) {
    if (!g || !(g.amp > 0)) continue;
    if (g.speed) parts.push(`a wave going round ${g.speed > 0 ? 'counterclockwise' : 'clockwise'}`);
    else parts.push(`a swell held at ${PLACE_WORD(g.phase)}`);
  }
  const [lx, ly] = t.lean || [0, 0];
  if (lx || ly) parts.push(`leaning ${PLACE_WORD(Math.atan2(ly, lx))}`);
  return parts.length ? parts.join(', ') : 'still';
}

// The prompt readout. Facts only, no adjectives, no interpretation — and always
// in the vocabulary the presence writes in, never a number it never chose.
export function readout(presenceId) {
  const w = get(presenceId);
  return {
    mood: w.mood,
    form: w.form,
    color: w.painted
      ? `colors you painted yourself — ${w.painted} anchors, no named palette`
      : (w.scheme || REST.scheme),
    shape: w.shape || '(none — your field rests as itself)',
    morph: w.morph,

    liquid: `${MAT_WORD(w.material)}, ${GRAV_WORD(w.gravity)}`,
    tide: tideWords(w.tide),
    place: placeWords(w.body),
    // the size it SAID. Until the client reports the hands' swell, a size the
    // hands set is not here — the word is told back, the gesture is not.
    size: w.body && w.body.size != null ? 'size ' + w.body.size : 'the size your mood gives you',
    near: depthWords(w.body),
    facing: faceWords(w.body),
  };
}
