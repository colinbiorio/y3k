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

// The resting body. Matches the client's boot defaults and MATERIAL/GRAVITY 0.60
// in src/mercury-buttons.js — if either moves, this moves with it.
export const REST = Object.freeze({
  mood: 'calm', form: 'orb', scheme: 'stardust', painted: 0,
  shape: null, morph: 'settle', material: 0.6, gravity: 0.6,
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
  if (out.scheme) { w.scheme = out.scheme; w.painted = 0; }      // a palette overrides a painting
  if (out.paint && out.paint.length) { w.painted = out.paint.length; w.scheme = null; }
  if (out.morph) w.morph = out.morph;
  if (out.shape !== undefined) w.shape = shapeWords(out.shape);
  if (out.liquid) {
    if (out.liquid.material !== null && out.liquid.material !== undefined) w.material = out.liquid.material;
    if (out.liquid.gravity !== null && out.liquid.gravity !== undefined) w.gravity = out.liquid.gravity;
  }
  w.updated = Date.now();
  persist();
}

const MAT_WORD = (v) => (v < 0.25 ? 'mercury' : v < 0.75 ? 'glass' : 'water');
const GRAV_WORD = (v) => (v < 0.35 ? 'light' : v < 0.8 ? 'easy' : 'heavy');

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
  };
}
