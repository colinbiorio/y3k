// A LINE FOR KODE, SAID ANYWHERE ON THE SITE (Colin, 2026-10-30: "moving the
// message bar for kode into the navigation bar, letting kode be accessible
// from anywhere on the site -- intelligently managed … if the user isn't
// asking for the ai to start coding, it shouldn't just start coding, there
// should be a permission from anywhere else on the site than kode, but in
// kode, just stick to whatever mode is already chosen").
//
// kodeLine(text) says whether a line typed into the chat bar reads as an ask
// for the coder: kode named outright (kode: …, /kode …, hey kode …, @kode …),
// or the words of coding — a verb of making or mending WITH a thing of code
// (a file, a branch, a test, a bug, a page of the site). One without the
// other is conversation: "fix my bike", "I love this feature", "what does
// this function do?" all stay with the presence. Pure: no DOM, no engine.
// The permission is main.js's (askKode), never this file's — a yes here is
// only a question put to the person.
// (/kode, @kode and hey kode take a comma or a colon after them or not; a bare
// kode needs one, or 'kode is lovely' would be a line for it)
export const NAMED = /^\s*(?:(?:\/kode|@kode|hey,?\s+kode)\b\s*[:,—–-]?|kode\s*[:,—–-])\s*/i;
const VERBS = /\b(?:fix|build|implement|refactor|rewrite|write|add|remove|rename|move|deploy|ship|commit|push|merge|rebase|revert|debug|test|lint|install|update|upgrade|bump|run|edit|change|patch|create|make|wire|hook|set up|setup|migrate|optimi[sz]e|clean up|delete|code|program|release)\b/i;
const THINGS = /\b(?:code|bug|bugs|function|method|class|module|component|file|files|folder|repo|repository|branch|pr|pull request|commit|test|tests|suite|build|script|api|endpoint|route|server|database|db|schema|query|css|html|js|javascript|typescript|python|node|npm|package|dependency|import|variable|type|interface|lint|error|exception|stack ?trace|regex|readme|docs?|the site|kode|y3k|homepage|feature|layout|styles?|button|page|tab|view|render|engine|protocol|markdown|json|yaml)\b|\.(?:js|mjs|ts|tsx|jsx|css|html|py|json|md|yml|yaml|sh)\b|`[^`]+`/i;
export const KODE_LINE_MAX = 4000;

// { text, why: 'named' | 'words' } when the line is for kode, else null.
// Named, the name is taken off and the rest is what is said; nothing after
// the name is no line at all.
export function kodeLine(text) {
  const t = String(text || '').trim();
  if (!t || t.length > KODE_LINE_MAX) return null;
  const m = NAMED.exec(t);
  if (m) { const rest = t.slice(m[0].length).trim(); return rest ? { text: rest, why: 'named' } : null; }
  // the verb and the thing must be two words: "build a life" has the one
  // word for both, and is no ask for the coder
  const verbs = spans(VERBS, t), things = spans(THINGS, t);
  const apart = things.some(([a, b]) => verbs.some(([c, d]) => !(a < d && c < b)));
  return apart ? { text: t, why: 'words' } : null;
}
function spans(re, t) {
  const out = [], g = new RegExp(re.source, 'gi');
  for (let m; (m = g.exec(t));) { out.push([m.index, m.index + m[0].length]); if (!m[0]) g.lastIndex++; }
  return out;
}
