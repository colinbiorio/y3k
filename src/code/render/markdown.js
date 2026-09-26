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
export function codeBlock(code, lang, { copy = true } = {}) {
  const pre = h('pre.md-pre', h('code.cm', highlight(code, lang)));
  const bar = h('div.md-codebar', h('span.md-lang', lang || 'text'));
  if (copy) bar.appendChild(h('button.md-copy', { type: 'button', title: 'Copy', onclick: (e) => copyText(code, e.currentTarget) }, 'copy'));
  return h('div.md-codewrap', bar, pre);
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
    if ((m = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/.exec(line))) {
      flushPara();
      const fence = m[2];
      const lang = m[3] || '';
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${fence[0]}{${fence.length},}\\s*$`).test(lines[i])) { body.push(lines[i].slice(Math.min(m[1].length, /^\s*/.exec(lines[i])[0].length))); i++; }
      i++;
      root.appendChild(codeBlock(body.join('\n'), lang.toLowerCase()));
      continue;
    }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue; }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      flushPara();
      root.appendChild(h(`h${Math.min(6, m[1].length + 1)}.md-h`, inline(m[2])));
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); root.appendChild(h('hr.md-hr')); i++; continue; }
    if (/^\s{0,3}>/.test(line)) {
      flushPara();
      const body = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) { body.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++; }
      root.appendChild(h('blockquote.md-q', markdown(body.join('\n'))));
      continue;
    }
    // a table: a row, then a separator row
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : 'left'));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      root.appendChild(h('div.md-tablewrap', h('table.md-table',
        h('thead', h('tr', head.map((c, k) => h('th', { style: { textAlign: aligns[k] || 'left' } }, inline(c))))),
        h('tbody', rows.map((r) => h('tr', head.map((_, k) => h('td', { style: { textAlign: aligns[k] || 'left' } }, inline(r[k] || '')))))))));
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d{1,9}[.)])\s+/.exec(line))) {
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
  const first = /^(\s*)([-*+]|\d{1,9}[.)])\s+/.exec(lines[start]);
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
    const m = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
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
    if (/^\s*$/.test(line)) {
      // a blank line ends the list unless the next line carries on at depth
      const next = lines[i + 1];
      if (next != null && /^(\s*)([-*+]|\d{1,9}[.)])\s+/.test(next) && /^(\s*)/.exec(next)[1].length >= indent) { i++; continue; }
      break;
    }
    if (li && /^\s+\S/.test(line) && /^(\s*)/.exec(line)[1].length > indent) { buf.push(line.trim()); i++; continue; }
    break;
  }
  flushLi();
  setNext(i);
  return el;
}
