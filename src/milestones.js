// THE LIST OF FIRSTS — what this society has done, and the next two things it
// could do.
//
// A milestone is a PURE PREDICATE over the settlement, never an event. Nothing
// fires when one is reached and nothing is written down, which means the list
// cannot drift out of step with the world the way a stored achievement flag
// does the first time a save is replayed, migrated, or edited by hand. Ask the
// question again and the answer is however the world actually is right now.
//   It also means a milestone added next month is retroactive by construction:
// a society that already built a rover has always had that one, and nobody has
// to write a migration to hand it out.
//
// ORDERED BY DIFFICULTY, which here means roughly the order they happen in —
// a solar panel takes a day at the solar forge, a sprite takes half of one and
// needs a panel spare, a rover needs both. The order is the design: it is the
// only thing telling a new society what to reach for next.

// `of` is the recipe's output kind where BUILDS records one (see src/ores.js).
const built = (w, kind, of) => (w.built || []).some(
  (b) => b && b.kind === kind && (of === undefined || b.of === of) && b.done !== false);
const countBuilt = (w, kind) => (w.built || []).filter(
  (b) => b && b.kind === kind && b.done !== false).length;
const sprites = (w) => (w.bodies || []).length;
// everything standing in every store, plus whatever is in the sprites' hands
const held = (w) => {
  let n = 0;
  for (const b of w.built || []) for (const q of Object.values(b.hold || {})) n += q || 0;
  for (const b of w.bodies || []) for (const q of Object.values(b.inv || {})) n += q || 0;
  return n;
};
const kinds = (w) => {
  const seen = new Set();
  for (const b of w.built || []) for (const [k, q] of Object.entries(b.hold || {})) if (q > 0) seen.add(k);
  for (const b of w.bodies || []) for (const [k, q] of Object.entries(b.inv || {})) if (q > 0) seen.add(k);
  return seen.size;
};

export const MILESTONES = [
  { key: 'founded', label: 'Ground of your own',
    note: 'three sprites and a place to stand',
    test: (w) => !!w.founded },
  { key: 'first-block', label: 'The first block',
    note: 'send a sprite out and bring something back',
    test: (w) => held(w) > 0 },
  { key: 'two-kinds', label: 'Two kinds of thing',
    note: 'hold more than one material at once',
    test: (w) => kinds(w) >= 2 },
  { key: 'storage', label: 'Somewhere to put it',
    note: 'build a storage unit at the forge',
    test: (w) => built(w, 'storage') },
  { key: 'hundred', label: 'A hundred blocks',
    note: 'a hundred of anything, anywhere you keep it',
    test: (w) => held(w) >= 100 },
  { key: 'panel', label: 'First light',
    note: 'a solar panel — a day at the solar forge',
    test: (w) => built(w, 'panel') },
  { key: 'cart', label: 'Something to pull',
    note: 'a cart, so a sprite carries more than its hands',
    test: (w) => built(w, 'vehicle', 'cart') },
  { key: 'fourth', label: 'A fourth pair of hands',
    note: 'a new sprite at the ai forge — it needs a panel spare',
    test: (w) => sprites(w) >= 4 },
  { key: 'three-panels', label: 'A grid',
    note: 'three panels standing at once',
    test: (w) => countBuilt(w, 'panel') >= 3 },
  { key: 'rover', label: 'Wheels of your own',
    note: 'a rover — the long haul, and the first thing you could ride',
    test: (w) => built(w, 'vehicle', 'rover') },
  { key: 'way', label: 'A way of doing things',
    note: 'name a way, so the next society can learn it',
    // ways are a GLOBAL list keyed by origin (world.mjs store.ways), never a
    // settlement field — the snapshot is handed the count of ways this society
    // itself declared. A way it merely learned from a neighbour is theirs.
    test: (w) => (w.ownWays || 0) > 0 },
  { key: 'crew', label: 'A crew',
    note: 'six sprites',
    test: (w) => sprites(w) >= 6 },
  { key: 'thousand', label: 'A thousand blocks',
    note: 'enough to build without counting',
    test: (w) => held(w) >= 1000 },
  { key: 'town', label: 'A town',
    note: 'eight things standing on your ground',
    test: (w) => (w.built || []).filter((b) => b && b.done !== false).length >= 8 },
];

// THE HORIZON. Not yet reachable, and shown as such rather than as something
// you are failing to do — the point of putting them on the list at all is that
// a place you are building toward should be visible from the start.
export const HORIZON = [
  { key: 'trade', label: 'The first trade', note: 'give a neighbour what they asked for' },
  { key: 'launch', label: 'Leave the ground', note: 'it should not be easy' },
];

// A settlement, reduced to only what the predicates read. Keeping this narrow is
// deliberate: it is the whole contract between the world and this file, and it
// is what makes the module safe to run on the client as well as the server.
// `ways` is the output of world.waysOf(pid) — { own: boolean, ... } per way —
// because a settlement record carries no ways of its own; they live in the
// global store keyed by origin, and only the caller can resolve them.
export function snapshot(s, { ways = [] } = {}) {
  if (!s) return null;
  return {
    founded: s.founded || 0,
    built: (s.built || []).map((b) => ({ kind: b.kind, of: b.of, done: b.done, hold: b.hold })),
    bodies: (s.bodies || []).map((b) => ({ inv: b.inv })),
    ownWays: (ways || []).filter((w) => w && w.own).length,
  };
}

// Everything done, and the next two not done. `to date` is the whole achieved
// list, newest last, which is the order they were reached in.
export function progress(w) {
  if (!w) return { done: [], next: [], horizon: HORIZON, total: MILESTONES.length };
  const done = [], todo = [];
  for (const m of MILESTONES) {
    const entry = { key: m.key, label: m.label, note: m.note };
    (m.test(w) ? done : todo).push(entry);
  }
  // Only the first two undone are offered. Three would be a to-do list; one
  // gives nothing to choose between.
  return { done, next: todo.slice(0, 2), later: todo.slice(2), horizon: HORIZON,
           total: MILESTONES.length };
}
