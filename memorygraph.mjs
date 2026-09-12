// THE MEMORY GRAPH — what a presence has kept, as a structure you can look at.
//
// Colin's thesis for this place: "each orb is actually made up of the ai's real
// memories, and we organize them into an actual neural network as the ai
// collects memories." This file is the honest version of that sentence, and the
// honesty is load-bearing, so it goes at the top:
//
//   THIS IS NOT A NEURAL NETWORK. Nothing here is trained, no weight is
//   adjusted by anything, and no gradient exists. It is a similarity graph:
//   memories that share distinctive language are linked, and the links are
//   COUNTED, not learned. What it does give you is real and worth having — the
//   corpus a mind is accumulating, laid out so a person can see its shape and
//   walk it. The product sentence that survives review is "the more you keep,
//   the more of a mind there is here to train", and no line of UI copy or
//   prompt text built on this file may say "trained" or "neural".
//
// TWO PROPERTIES DECIDE THE WHOLE DESIGN.
//
// 1. A MEMORY'S PLACE IS A PURE FUNCTION OF ITS OWN WORDS. Not of the corpus,
//    not of its neighbours, not of when it arrived. So adding the four hundredth
//    memory moves none of the first three hundred and ninety-nine, no layout is
//    ever cached or recomputed, and a host who has learned the look of their own
//    orb still recognises it next week. That is the same instinct as the world's
//    "the planet is a seed, not a download".
//
// 2. POSITION IS AN ADDRESS, NOT A MEANING. Three dimensions cannot carry the
//    similarity of a few hundred documents — measured over this very pipeline,
//    related pairs reach a mean cosine of 0.47 but a quarter land in opposite
//    hemispheres, and the discrimination AUC is 0.65, barely better than a coin
//    flip. Johnson-Lindenstrauss wants ~1,500 dimensions for that. So the
//    direction below is a stable place to FIND a memory, and the EDGES — real
//    cosine over the full term vectors — are what actually carry similarity.
//    Anything drawn from this must colour the edges, never the points.
//
// Server-only, zero dependency, pure. Give it entries, get a graph.

// --- words -------------------------------------------------------------------

// Function words carry no aboutness; dropping them is not an approximation.
const STOP = new Set(`a an and are as at be been being but by for from had has have
he her hers him his i if in into is it its me my no nor not of off on once one only
or our ours out over own same she so some such than that the their theirs them then
there these they this those through to too under until up us very was we were what
when where which while who whom why will with would you your yours am can could did
do does doing done else ever get got just like made make many might more most much
must never new now old other should still take than thing things think two use used
using want way well went yet also back even first give go going good great how know
let look making own part place put right say see seem still thought time way work`
  .split(/\s+/).filter(Boolean));

// A STATIC frequency table, not a corpus IDF. The design's first instinct was to
// keep each memory's eight rarest terms, and the measurement killed it: for two
// documents sharing half of a forty-term vocabulary, only 2.75 shared terms
// survive into both top-eights, and 51% of genuinely related pairs share NONE.
// Summing every content term against a shipped table keeps the pure-function
// property — a memory's vector still depends on nothing but its own words —
// while letting an ordinary word contribute a little instead of nothing.
// Values are rough log10 per-million frequencies; anything absent is treated as
// distinctive, which is the common case and the useful one.
const FREQ = {
  people: 3.3, world: 3.2, life: 3.2, day: 3.3, man: 3.2, woman: 2.9, child: 2.9,
  year: 3.3, night: 3.0, morning: 2.8, water: 3.0, light: 3.0, hand: 3.1, eye: 3.0,
  head: 3.1, house: 3.1, room: 3.0, door: 3.0, word: 3.0, name: 3.1, kind: 3.0,
  thing: 3.4, feel: 3.0, felt: 2.9, said: 3.5, ask: 3.0, asked: 3.0, tell: 3.1,
  told: 3.1, come: 3.3, came: 3.2, keep: 3.0, kept: 2.8, find: 3.1, found: 3.1,
  turn: 3.0, mind: 3.0, love: 3.1, small: 3.0, long: 3.2, little: 3.2, big: 3.1,
  something: 3.3, nothing: 3.1, someone: 2.9, always: 3.1, again: 3.2, really: 3.2,
  around: 3.1, between: 3.1, because: 3.3, before: 3.3, after: 3.3, being: 3.2,
};
const IDF_MAX = 5.5;                       // an unlisted word is a distinctive one
const idfOf = (w) => IDF_MAX - (FREQ[w] || 0);

export function termsOf(text) {
  const out = [];
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9']+/)) {
    // A possessive is the same word wearing a hat: without this, "the workshop's
    // window" and "the workshop window" are different terms and never link,
    // which is exactly the kind of near-miss this graph exists to catch. Inner
    // apostrophes stay, so o'clock survives as itself.
    const w = raw.replace(/^'+|'+$/g, '').replace(/'s$/, '');
    if (w.length < 3 || w.length > 24) continue;   // "it" carries nothing; a URL is not a word
    if (STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue;                 // a bare number is not an aboutness
    out.push(w);
  }
  return out;
}

// --- where a word lives ------------------------------------------------------

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// A word's own direction on the sphere.
//
// THE TWO HASHES MUST BE SALTED APART, and the salt goes at the FRONT.
//
// Deriving both numbers from one hash — or from two byte lanes of one hash —
// puts every word in one corner: mean resultant length R = 0.992, every memory
// inside a cap covering a tenth of the sphere. A bright smudge, not a
// constellation. But salting at the END barely helps, and that is the subtle
// one: FNV-1a folds bytes in sequence, so `word#z` and `word#p` share every
// byte but the last and their hashes stay related. Measured, that left z and
// phi each perfectly uniform on its own — deciles within a few percent — while
// the PAIR was correlated, giving R = 0.147 against the 0.022 that 2,000 truly
// uniform directions would give. Uniform marginals hid a joint distribution
// living on a ribbon. Salting at the front makes the state diverge before the
// word is read at all, and the avalanche does the rest.
export function dirOf(word) {
  const u = fnv1a(`z#${word}`) / 4294967296;     // uniform in z gives equal area
  const v = fnv1a(`p#${word}`) / 4294967296;
  const z = 2 * u - 1;
  const phi = 2 * Math.PI * v;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(phi), z, r * Math.sin(phi)];
}

// --- the graph ---------------------------------------------------------------

const norm = (v) => { let s = 0; for (const k in v) s += v[k] * v[k]; return Math.sqrt(s); };

function cosine(a, b, na, nb) {
  if (!(na > 0) || !(nb > 0)) return 0;
  // walk the shorter vector — a memory is a line, not a document, so this is tiny
  const [s, l] = Object.keys(a).length <= Object.keys(b).length ? [a, b] : [b, a];
  let dot = 0;
  for (const k in s) if (l[k] !== undefined) dot += s[k] * l[k];
  return dot / (na * nb);
}

// Communities by label propagation: each node repeatedly takes the commonest
// label among its neighbours, weighted by edge strength. Deterministic here
// because the visiting order is index order and ties break on the lower label —
// a random order would make the same corpus produce different regions on every
// build, and a host would never learn the shape of their own orb.
function propagate(n, edges, rounds = 12) {
  const label = Array.from({ length: n }, (_, i) => i);
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j, w] of edges) { adj[i].push([j, w]); adj[j].push([i, w]); }
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (!adj[i].length) continue;
      const tally = new Map();
      for (const [j, w] of adj[i]) tally.set(label[j], (tally.get(label[j]) || 0) + w);
      let best = label[i], bestW = -1;
      for (const [lab, w] of [...tally.entries()].sort((x, y) => x[0] - y[0])) {
        if (w > bestW + 1e-12) { best = lab; bestW = w; }
      }
      if (best !== label[i]) { label[i] = best; moved = true; }
    }
    if (!moved) break;
  }
  return label;
}

/**
 * Build one presence's graph.
 * entries: [{ t, x }] — the journal's own shape (t = epoch ms, x = the line).
 * Returns { nodes, edges, regions, isolates, stats } and nothing that depends on
 * anything outside `entries`.
 */
export function buildGraph(entries, { k = 4, minCos = 0.06 } = {}) {
  const docs = (Array.isArray(entries) ? entries : []).filter((e) => e && e.x);
  const N = docs.length;
  if (!N) return { nodes: [], edges: [], regions: [], isolates: [], stats: { n: 0, dfCut: 0, R: 0 } };

  // corpus df, used ONLY to drop a presence's own boilerplate — never to weight,
  // because weighting on the corpus would make every position move whenever a
  // memory is added, and that is the one property this file exists to keep
  const tokens = docs.map((d) => termsOf(d.x));
  const df = new Map();
  tokens.forEach((ts) => { for (const w of new Set(ts)) df.set(w, (df.get(w) || 0) + 1); });
  // THE FLOOR MATTERS MORE THAN THE FRACTION. At N=12 a bare 0.20N cut drops any
  // term appearing in three of a presence's twelve lines, which leaves only df=1
  // terms — and a term in exactly one document contributes zero to every cosine.
  // The result is an empty graph and "every memory is an isolate", precisely at
  // the size where someone first looks at this and judges the whole idea.
  const dfCut = Math.max(0.20 * N, 8);

  // TWO VECTORS, AND KEEPING THEM APART IS THE WHOLE INVARIANT.
  //
  // A test caught this the first time it ran: dfCut scales with N, so folding
  // the corpus cut into the vector that decides POSITION means a term enters or
  // leaves a memory's address as the corpus grows around it — and memory 10
  // moved after a hundred arrivals. The address must take no corpus input at
  // all, ever.
  //
  //   posVec — every content term, static weights only. Pure in the memory's
  //            own words. This is what places it, and it never changes again.
  //   simVec — the same, minus this presence's own boilerplate. Corpus-aware on
  //            purpose: a word in half its lines links everything to everything
  //            and tells you nothing. This is what draws the edges, which are
  //            allowed to move, because an edge is a claim about a RELATIONSHIP
  //            and a relationship genuinely does depend on who else is there.
  const posVecs = tokens.map((ts) => {
    const v = {};
    for (const w of ts) v[w] = (v[w] || 0) + idfOf(w);
    return v;
  });
  const vecs = tokens.map((ts) => {
    const v = {};
    for (const w of ts) {
      if ((df.get(w) || 0) > dfCut) continue;
      v[w] = (v[w] || 0) + idfOf(w);
    }
    return v;
  });
  const norms = vecs.map(norm);

  const nodes = docs.map((d, i) => {
    // the address: the weighted sum of where its words live
    let x = 0, y = 0, z = 0;
    for (const w in posVecs[i]) {
      const dir = dirOf(w);
      x += dir[0] * posVecs[i][w]; y += dir[1] * posVecs[i][w]; z += dir[2] * posVecs[i][w];
    }
    let len = Math.hypot(x, y, z);
    if (!(len > 1e-9)) {                      // a memory of only common words still needs a place
      const d2 = dirOf(`~${i}~${String(d.x).slice(0, 16)}`);
      [x, y, z] = d2; len = 1;
    }
    return {
      // null, not 0: a memory with no honest time must read as having none.
      // `|| 0` renders a missing stamp as the 1st of January 1970, and since
      // stage 11 this field is shown to the host in the recall window.
      i, t: Number.isFinite(d.t) && d.t > 0 ? d.t : null, text: String(d.x),
      dir: [x / len, y / len, z / len],
      terms: Object.keys(vecs[i]).length,
      region: 0, links: 0,
    };
  });

  // every pair, then keep each node's k strongest. N is a few hundred at most —
  // 200 memories is 19,900 cosines over vectors of a dozen terms.
  const cand = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const c = cosine(vecs[i], vecs[j], norms[i], norms[j]);
      if (c < minCos) continue;
      cand[i].push([j, c]); cand[j].push([i, c]);
    }
  }
  const seen = new Set();
  const edges = [];
  for (let i = 0; i < N; i++) {
    cand[i].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [j, c] of cand[i].slice(0, k)) {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([Math.min(i, j), Math.max(i, j), +c.toFixed(4)]);
    }
  }
  for (const [i, j] of edges) { nodes[i].links += 1; nodes[j].links += 1; }

  const labels = propagate(N, edges);
  const byLabel = new Map();
  labels.forEach((lab, i) => { if (nodes[i].links) (byLabel.get(lab) || byLabel.set(lab, []).get(lab)).push(i); });
  const regions = [...byLabel.entries()]
    .map(([, members]) => members)
    .filter((m) => m.length > 1)
    .sort((a, b) => b.length - a.length);
  regions.forEach((members, r) => { for (const i of members) nodes[i].region = r + 1; });
  const isolates = nodes.filter((n) => !n.links).map((n) => n.i);

  // R, the mean resultant length of the node directions: 0 is perfectly spread,
  // 1 is every memory in one spot. It is here because the salting bug made it
  // 0.992 and nothing else would have shown that.
  let sx = 0, sy = 0, sz = 0;
  for (const n of nodes) { sx += n.dir[0]; sy += n.dir[1]; sz += n.dir[2]; }
  const R = N ? Math.hypot(sx, sy, sz) / N : 0;

  return { nodes, edges, regions, isolates, stats: { n: N, dfCut: +dfCut.toFixed(2), R: +R.toFixed(3) } };
}

// What a person would want printed. Deliberately not JSON: this stage ships as
// something you can read.
export function describeGraph(g) {
  const out = [];
  out.push(`${g.stats.n} memories · ${g.edges.length} links · ${g.regions.length} regions · ${g.isolates.length} isolates`);
  out.push(`spread R=${g.stats.R} (0 = evenly over the sphere, 1 = all in one spot)`);
  g.regions.forEach((members, r) => {
    // a region's name is the term its members most share — counted, never learned
    const tally = new Map();
    for (const i of members) for (const w of new Set(termsOf(g.nodes[i].text))) tally.set(w, (tally.get(w) || 0) + 1);
    const top = [...tally.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
    out.push(`\n  region ${r + 1} — ${members.length} memories${top.length ? ` · shares: ${top.map(([w, c]) => `${w}×${c}`).join(', ')}` : ''}`);
    for (const i of members.slice(0, 4)) out.push(`      ${String(g.nodes[i].text).slice(0, 76)}`);
    if (members.length > 4) out.push(`      …and ${members.length - 4} more`);
  });
  if (g.isolates.length) out.push(`\n  ${g.isolates.length} memories share language with nothing else yet`);
  return out.join('\n');
}

// --- read it from the terminal -----------------------------------------------
// The whole of this stage, usable: `node memorygraph.mjs <presenceId>` prints
// one presence's regions, links and isolates. Nothing renders, nothing is
// served, and no token is spent — the thesis is checkable before a single
// pixel exists.
//
// It reads the journal store directly, which is a thing only the host's own
// machine can do: this file is server-only and .journal.json is blocked from
// static serving. It is a tool for whoever runs the server, not a route.
if (import.meta.url === `file://${process.argv[1]}`) {
  const journal = await import('./journal.mjs');
  const pid = process.argv[2];
  if (!pid) {
    console.error('usage: node memorygraph.mjs <presenceId>');
    process.exit(1);
  }
  const entries = journal.listForGraph(pid);
  if (!entries.length) {
    console.log(`no journal entries for ${pid} — nothing to graph yet.`);
    process.exit(0);
  }
  console.log(describeGraph(buildGraph(entries)));
}
