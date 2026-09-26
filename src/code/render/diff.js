// A change, drawn: green for what is added, red for what goes, the lines around
// it for context, line numbers on both sides, and — where one line became
// another — the part that actually changed marked inside it.

import { h } from '../dom.js';
import { highlight, langOf } from './highlight.js';

const MAX_LINES = 400;

// For a removed line followed by an added one, the stretch that differs.
function changedSpan(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return { a: [p, a.length - q], b: [p, b.length - q] };
}

function lineCode(text, lang, span) {
  const code = h('span.df-code');
  if (span && span[1] > span[0] && span[1] - span[0] < text.length) {
    code.appendChild(highlight(text.slice(0, span[0]), lang));
    code.appendChild(h('mark.df-mark', highlight(text.slice(span[0], span[1]), lang)));
    code.appendChild(highlight(text.slice(span[1]), lang));
  } else code.appendChild(highlight(text, lang));
  return code;
}

export function diffStat(d) {
  return h('span.df-stat', d.added ? h('span.df-plus', `+${d.added}`) : null, d.removed ? h('span.df-minus', `−${d.removed}`) : null, !d.added && !d.removed ? h('span.muted', 'no change') : null);
}

// d: { path, hunks, added, removed, created }
export function renderDiff(d, { header = true, maxLines = MAX_LINES } = {}) {
  const lang = langOf(d.path || '');
  const body = h('div.df-body');
  let shown = 0;
  let cut = 0;
  for (const [hi, hunk] of (d.hunks || []).entries()) {
    if (hi > 0 || hunk.oldStart > 1) body.appendChild(h('div.df-sep', `@@ ${hunk.oldStart},${hunk.oldLines} → ${hunk.newStart},${hunk.newLines}`));
    let o = hunk.oldStart;
    let n = hunk.newStart;
    const L = hunk.lines || [];
    for (let i = 0; i < L.length; i++) {
      const line = L[i];
      if (line.startsWith('\\')) continue; // "\ No newline at end of file"
      if (shown >= maxLines) { cut++; continue; }
      const sign = line[0];
      const text = line.slice(1);
      let span = null;
      if (sign === '-' && L[i + 1]?.[0] === '+' && L[i + 2]?.[0] !== '+' && L[i - 1]?.[0] !== '-') span = changedSpan(text, L[i + 1].slice(1)).a;
      if (sign === '+' && L[i - 1]?.[0] === '-' && L[i + 1]?.[0] !== '+' && L[i - 2]?.[0] !== '-') span = changedSpan(L[i - 1].slice(1), text).b;
      const cls = sign === '+' ? 'df-row.df-add' : sign === '-' ? 'df-row.df-del' : 'df-row';
      body.appendChild(h('div.' + cls,
        h('span.df-no', sign === '+' ? '' : String(o)),
        h('span.df-no', sign === '-' ? '' : String(n)),
        h('span.df-sign', sign === ' ' ? '' : sign === '-' ? '−' : '+'),
        lineCode(text, lang, span)));
      if (sign !== '+') o++;
      if (sign !== '-') n++;
      shown++;
    }
  }
  if (cut) body.appendChild(h('div.df-sep', `… ${cut} more line${cut === 1 ? '' : 's'}`));
  const wrap = h('div.df');
  if (header) wrap.appendChild(h('div.df-head', h('span.df-path', d.path || ''), d.created ? h('span.df-new', 'new file') : null, diffStat(d)));
  wrap.appendChild(body);
  return wrap;
}
