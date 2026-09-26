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
  const moves = (sh.ops || []).map((o) => o.op).slice(0, 4);
  return [sh.shape, ...moves].join(', ').slice(0, 60);
}

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
  // 'at' and 'fly' are exclusive — one lands the other — so each clears the other.
  if (out.body) {
    const b = { ...(w.body || {}), ...out.body };
    if (out.body.fly) delete b.at;
    if (out.body.at) delete b.fly;
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
  if (b.fly && (b.fly[0] || b.fly[1])) return `flying a figure of eight, ${b.fly[0]} wide and ${b.fly[1]} tall, at ${b.fly[2]}`;
  if (b.at) {
    const [x, y] = b.at;
    const h = x <= 2 ? 'the left' : x >= 7 ? 'the right' : 'the middle';
    const v = y <= 2 ? 'low' : y >= 7 ? 'high' : 'level';
    return `at ${x} ${y} — ${h}, ${v}`;
  }
  return 'the centre of the room';
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
  };
}
