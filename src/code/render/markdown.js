// The coder's words, as a page: headings, lists, tables, quotes, code with
// colour, links. Built as DOM, never as markup, and careful about the two ways a
// model's text could reach past the screen:
//   - images are shown as links, never loaded (a URL can carry data out)
//   - links are http(s) only, open in a new tab, and carry no referrer

import { h } from '../dom.js';
import { highlight } from './highlight.js';

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

export function safeHref(url) {
  const u = String(url || '').trim();
  if (!SAFE_URL.test(u)) return null;
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null; } catch { return null; }
}

function link(text, url) {
  const href = safeHref(url);
  if (!href) return document.createTextNode(text);
  return h('a.md-a', { href, target: '_blank', rel: 'noopener noreferrer nofollow', title: href }, text);
}

// --- inline ---------------------------------------------------------------------
const INLINE = [
  // `code`
  { re: /^(`+)([\s\S]*?[^`])\1(?!`)/, make: (m) => h('code.md-code', m[2].replace(/^ (.*) $/, '$1')) },
  // ![alt](url) → a link that says it is an image
  { re: /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, make: (m) => { const a = link(`image: ${m[1] || m[2]}`, m[2]); if (a.classList) a.classList.add('md-img'); return a; } },
  // [text](url)
  { re: /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, make: (m) => { const a = link('', m[2]); if (a.nodeType === 3) return inline(m[1]); a.appendChild(inline(m[1])); return a; } },
  // <https://…>
  { re: /^<(https?:\/\/[^>\s]+)>/, make: (m) => link(m[1], m[1]) },
  // **bold** / __bold__
  { re: /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/, make: (m) => h('strong', inline(m[2])) },
  // *em* / _em_
  { re: /^(\*|_)(?=\S)([\s\S]*?\S)\1(?![\w*])/, make: (m) => h('em', inline(m[2])) },
  // ~~strike~~
  { re: /^~~(?=\S)([\s\S]*?\S)~~/, make: (m) => h('del', inline(m[1])) },
  // bare https://…
  { re: /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/, make: (m) => link(m[0], m[0]) },
];

export function inline(text) {
  const frag = document.createDocumentFragment();
  let plain = '';
  let i = 0;
  const s = String(text || '');
  const flush = () => { if (plain) { frag.appendChild(document.createTextNode(plain)); plain = ''; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && /[\\`*_{}[\]()#+\-.!~|<>]/.test(s[i + 1] || '')) { plain += s[i + 1]; i += 2; continue; }
    if ('`![<*_~h'.includes(c)) {
      // bare URLs only at a word boundary
      if (c === 'h' && /\w/.test(s[i - 1] || '')) { plain += c; i++; continue; }
      if (c === '_' && /\w/.test(s[i - 1] || '')) { plain += c; i++; continue; }
      const rest = s.slice(i);
      let hit = null;
      for (const r of INLINE) { const m = r.re.exec(rest); if (m) { hit = { m, r }; break; } }
      if (hit) { flush(); frag.appendChild(hit.r.make(hit.m)); i += hit.m[0].length; continue; }
    }
    if (c === '\n') { flush(); frag.appendChild(h('br')); i++; continue; }
    plain += c;
    i++;
  }
  flush();
  return frag;
}

// --- blocks ---------------------------------------------------------------------
// The same code is coloured more than once: the final pass over a finished
// answer, a tab switched back to, the room reopened. Colouring is the costly
// part (a 300-line block is ~15k nodes and ~60k regex runs), so the coloured
// <code> is kept and cloned — cloneNode copies nodes, not work. Small, and
// nothing huge is kept: the point is the recent answer, not a cache of the day.
const MEMO = new Map();
const MEMO_MAX = 40;
const MEMO_CHARS = 60000;
function colouredCode(code, lang) {
  if (code.length > MEMO_CHARS || code.length < 40) return h('code.cm', highlight(code, lang));
  const k = (lang || '') + '\n' + code;
  let el = MEMO.get(k);
  if (el) { MEMO.delete(k); MEMO.set(k, el); } // most recently used goes last
  else {
    el = h('code.cm', highlight(code, lang));
    MEMO.set(k, el);
    if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  }
  return el.cloneNode(true);
}

// The frame around a block of code. `codeEl` is what goes in the <pre>; the
// copy button asks `getCode` at the moment it is pressed, so a block still
// streaming in copies what it holds by then.
function codeFrame(codeEl, lang, getCode, copy) {
  const bar = h('div.md-codebar', h('span.md-lang', lang || 'text'));
  if (copy) bar.appendChild(h('button.md-copy', { type: 'button', title: 'Copy', onclick: (e) => copyText(getCode(), e.currentTarget) }, 'copy'));
  return h('div.md-codewrap', bar, h('pre.md-pre', codeEl));
}

export function codeBlock(code, lang, { copy = true } = {}) {
  return codeFrame(colouredCode(code, lang), lang, () => code, copy);
}

export function copyText(text, btn) {
  const done = () => { if (btn) { btn.textContent = 'copied'; setTimeout(() => { btn.textContent = 'copy'; }, 1200); } };
  try { navigator.clipboard.writeText(text).then(done, () => {}); } catch { /* no clipboard */ }
}

function splitRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// The block patterns, compiled once. The fence's closing pattern depends on the
// fence (``` or ~~~~, and how many), and was built afresh for every line inside
// it — a 300-line block streaming in at 60 frames a second was 18,000 RegExp
// compilations a second. Now one per kind of fence, ever.
const RE_FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/;
const RE_BLANK = /^\s*$/;
const RE_LEAD = /^\s*/;
const RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_QUOTE = /^\s{0,3}>/;
const RE_QUOTE_MARK = /^\s{0,3}>\s?/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RE_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+/;
const RE_ITEM_TEXT = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const RE_INDENTED = /^\s+\S/;
const CLOSERS = new Map();
function fenceCloser(fence) {
  const k = fence[0] + fence.length;
  let re = CLOSERS.get(k);
  if (!re) { re = new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`); CLOSERS.set(k, re); }
  return re;
}
const leadOf = (s) => RE_LEAD.exec(s)[0].length;

export function markdown(src) {
  const root = h('div.md');
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const para = [];
  const flushPara = () => { if (para.length) { root.appendChild(h('p', inline(para.join('\n')))); para.length = 0; } };

  while (i < lines.length) {
    const line = lines[i];
    let m;
    // fenced code (an unclosed fence runs to the end — mid-stream it usually is)
    if ((m = RE_FENCE.exec(line))) {
      flushPara();
      const fence = m[2];
      const lang = m[3] || '';
      const closer = fenceCloser(fence);
      const body = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) { body.push(lines[i].slice(Math.min(m[1].length, leadOf(lines[i])))); i++; }
      i++;
      root.appendChild(codeBlock(body.join('\n'), lang.toLowerCase()));
      continue;
    }
    if (RE_BLANK.test(line)) { flushPara(); i++; continue; }
    if ((m = RE_HEAD.exec(line))) {
      flushPara();
      root.appendChild(h(`h${Math.min(6, m[1].length + 1)}.md-h`, inline(m[2])));
      i++;
      continue;
    }
    if (RE_HR.test(line)) { flushPara(); root.appendChild(h('hr.md-hr')); i++; continue; }
    if (RE_QUOTE.test(line)) {
      flushPara();
      const body = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) { body.push(lines[i].replace(RE_QUOTE_MARK, '')); i++; }
      root.appendChild(h('blockquote.md-q', markdown(body.join('\n'))));
      continue;
    }
    // a table: a row, then a separator row
    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : 'left'));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !RE_BLANK.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      root.appendChild(h('div.md-tablewrap', h('table.md-table',
        h('thead', h('tr', head.map((c, k) => h('th', { style: { textAlign: aligns[k] || 'left' } }, inline(c))))),
        h('tbody', rows.map((r) => h('tr', head.map((_, k) => h('td', { style: { textAlign: aligns[k] || 'left' } }, inline(r[k] || '')))))))));
      continue;
    }
    if ((m = RE_ITEM.exec(line))) {
      flushPara();
      root.appendChild(list(lines, i, (next) => { i = next; }));
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return root;
}

// A list, with nesting by indentation and GitHub-style task boxes.
function list(lines, start, setNext) {
  const first = RE_ITEM.exec(lines[start]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const el = ordered ? h('ol.md-list', { start: parseInt(first[2], 10) || 1 }) : h('ul.md-list');
  let i = start;
  let li = null;
  let buf = [];
  const flushLi = () => {
    if (!li) return;
    const text = buf.join('\n');
    const task = /^\[([ xX])\]\s+/.exec(text);
    if (task) {
      li.classList.add('md-task');
      li.appendChild(h('span.md-box' + (task[1] !== ' ' ? '.on' : ''), task[1] !== ' ' ? '✓' : ''));
      li.appendChild(inline(text.slice(task[0].length)));
    } else li.appendChild(inline(text));
    buf = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    const m = RE_ITEM_TEXT.exec(line);
    if (m && m[1].length === indent && /\d/.test(m[2]) === ordered) {
      flushLi();
      li = h('li');
      el.appendChild(li);
      buf = [m[3]];
      i++;
      continue;
    }
    if (m && m[1].length > indent && li) {
      flushLi();
      li.appendChild(list(lines, i, (n) => { i = n; }));
      continue;
    }
    if (RE_BLANK.test(line)) {
      // a blank line ends the list unless the next line carries on at depth
      const next = lines[i + 1];
      if (next != null && RE_ITEM.test(next) && leadOf(next) >= indent) { i++; continue; }
      break;
    }
    if (li && RE_INDENTED.test(line) && leadOf(line) > indent) { buf.push(line.trim()); i++; continue; }
    break;
  }
  flushLi();
  setNext(i);
  return el;
}

// --- streaming ------------------------------------------------------------------
// A reply arrives a few words at a time, and drawing the whole message again for
// every few words made the work grow with the square of its length: a long
// answer re-parsed and re-coloured from the top 30-60 times a second, tens of
// thousands of nodes thrown away each frame (and the orb, on the same thread,
// stalled with it). Now the part that is finished is drawn once, and only the
// tail — the paragraph or list still being written — is drawn again.
//
// "Finished" has to mean exactly what markdown() would make of it, or the
// answer would re-flow when it completes. scanBlocks() finds the places where
// cutting the text in two changes nothing: before a fence opens, after one
// closes, and at a blank line — unless what follows carries a list on (a list
// is the one thing here that continues past a blank line). It is pure, so the
// tests can hold it to that without a DOM.
//
// st: { pos, cut, fence, blank, listish } — pass the same object back with the
// longer text; only lines not yet seen are read.
export function scanBlocks(text, st = { pos: 0, cut: 0, fence: null, blank: false, listish: false }) {
  let ls = st.pos;
  for (let le = text.indexOf('\n', ls); le >= 0; ls = le + 1, le = text.indexOf('\n', ls)) {
    const line = text.slice(ls, le);
    if (st.fence) {
      if (st.fence.closer.test(line)) { st.fence = null; st.cut = le + 1; st.blank = false; st.listish = false; }
      continue;
    }
    if (RE_BLANK.test(line)) { st.blank = true; continue; }
    const item = RE_ITEM.test(line);
    const indented = RE_INDENTED.test(line);
    // what markdown()'s list() would still take as part of the list above
    const carriesList = st.listish && (st.blank ? item : item || indented);
    const m = RE_FENCE.exec(line);
    if (m && !carriesList) {
      st.cut = ls;
      st.fence = { closer: fenceCloser(m[2]), ch: m[2][0], indent: m[1].length, lang: (m[3] || '').toLowerCase(), start: ls, body: le + 1 };
      st.blank = false; st.listish = false;
      continue;
    }
    if (st.blank && !carriesList) st.cut = ls;
    st.listish = item || carriesList;
    st.blank = false;
  }
  st.pos = ls;
  return st;
}

// The live view of one streaming text block: { el, update(text, done) }.
//  - text before the last safe cut: drawn once, kept
//  - the tail: drawn again on each update
//  - an open code fence: one text node whose .data grows — no colouring, no
//    new nodes — coloured once, when it closes
//  - done: one last full pass, so a list the cut split draws as one list
export function mdStream() {
  const root = h('div.md');
  let src = '';
  let st = null;
  let drawn = 0;        // text[0, drawn) is on screen for good
  let tail = [];        // the nodes the tail drew last time
  let live = null;      // { el, text, lang, start } while a fence is open
  let final = false;

  const reset = () => { while (root.firstChild) root.removeChild(root.firstChild); st = scanBlocks('', undefined); drawn = 0; tail = []; live = null; final = false; };
  reset();

  function update(raw, done) {
    const text = String(raw || '').includes('\r') ? String(raw).replace(/\r\n?/g, '\n') : String(raw || '');
    if (final && text === src) return;
    if (!text.startsWith(src) || final) reset();
    src = text;
    if (done) {
      const full = markdown(text);
      while (root.firstChild) root.removeChild(root.firstChild);
      while (full.firstChild) root.appendChild(full.firstChild);
      final = true; tail = []; live = null;
      return;
    }
    scanBlocks(text, st);
    const before = tail[0] || null;
    if (st.cut > drawn) {
      const part = markdown(text.slice(drawn, st.cut));
      while (part.firstChild) root.insertBefore(part.firstChild, before);
      drawn = st.cut;
    }
    const f = st.fence;
    if (f && f.start === drawn) {
      // an open fence is the whole tail (the cut sits right before it)
      if (!live || live.start !== f.start || live.lang !== f.lang) {
        for (const n of tail) n.remove();
        const t = document.createTextNode('');
        const el = codeFrame(h('code.cm', t), f.lang, () => t.data, true);
        live = { el, text: t, lang: f.lang, start: f.start };
        root.appendChild(el);
        tail = [el];
      }
      let body = f.body <= text.length ? text.slice(f.body) : '';
      // the closing fence half-typed is not code
      body = body.replace(/(^|\n)[ \t]{0,3}(`+|~+)$/, (all, nl, marks) => (marks[0] === f.ch ? nl : all));
      if (body.endsWith('\n')) body = body.slice(0, -1);
      if (f.indent) body = body.split('\n').map((l) => l.slice(Math.min(f.indent, leadOf(l)))).join('\n');
      if (live.text.data !== body) live.text.data = body;
      return;
    }
    live = null;
    for (const n of tail) n.remove();
    tail = [];
    const rest = text.slice(drawn);
    if (!RE_BLANK.test(rest)) {
      const part = markdown(rest);
      while (part.firstChild) { tail.push(part.firstChild); root.appendChild(part.firstChild); }
    }
  }
  return { el: root, update };
}
