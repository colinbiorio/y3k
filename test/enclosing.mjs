// WHERE A LINE STANDS, read from the source around it. Not a test file: a
// helper for the tests that guard a gate by its position, not by its text.
//
// Why: four tests guarded the world's play gate by grepping for its line, and
// a line reads the same inside a block that can never run as outside it. The
// gate sat inside finish()'s auto/reflect block, where tendMode can never be
// 'play', and every one of those tests passed (test/world-verbs.test.mjs).
//
// outerLines walks up from the first line containing `needle` and returns,
// innermost first, each line indented less than the last one kept: the
// statement the line belongs to, then every block that holds it, out to the
// file's top level. It trusts the house's two-space indentation and does not
// parse JavaScript; a line at column 0 inside a template literal ends the walk
// early, so a caller that looks for a known outer line fails rather than
// passing on a short chain.
export function outerLines(src, needle) {
  const lines = src.split('\n');
  const at = lines.findIndex((l) => l.includes(needle));
  if (at < 0) return null;
  const indent = (l) => l.length - l.trimStart().length;
  const out = [];
  let depth = indent(lines[at]);
  for (let i = at - 1; i >= 0 && depth > 0; i--) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//')) continue;
    if (indent(lines[i]) < depth) { out.push(t); depth = indent(lines[i]); }
  }
  return out;
}

// Could this outer line keep a play beat out? It does when it compares tendMode
// to values and 'play' is not one of them, or when it rules play out by name.
// An else branch is counted as one too: the walker cannot see which if it
// belongs to, so it fails safe rather than guessing.
export function shutsOutPlay(line) {
  if (/^\}\s*else\b/.test(line)) return true;
  if (/tendMode !== 'play'/.test(line)) return true;
  const named = [...line.matchAll(/tendMode === '(\w+)'/g)].map((m) => m[1]);
  return named.length > 0 && !named.includes('play');
}

// The blocks between `needle` and the function that holds it (matched by
// `fnLine`), innermost first, or null when the needle is missing or the walk
// never reaches that function.
export function blocksWithin(src, needle, fnLine) {
  const chain = outerLines(src, needle);
  if (!chain) return null;
  const fn = chain.findIndex((t) => fnLine.test(t));
  return fn < 0 ? null : chain.slice(0, fn);
}
