// A small syntax highlighter: enough colour to read code at a glance in answers,
// diffs and file previews, in one pass, with no library. It returns DOM nodes
// (text in spans), never markup.

const KW = {
  js: 'await async break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined as interface type enum implements readonly private public protected declare namespace keyof satisfies',
  py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case self',
  sh: 'if then else elif fi for while until do done case esac in function return local export readonly unset shift source echo cd exit set true false',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false',
  rs: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected virtual override new delete nullptr true false bool',
  java: 'abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while true false null var record',
  rb: 'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield',
  sql: 'select from where and or not insert into values update set delete create table index drop alter add join left right inner outer on group by order having limit offset as distinct null is in like between union all primary key references default',
  css: '',
};

const ALIASES = {
  javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', typescript: 'js', json: 'json', jsonc: 'json',
  python: 'py', py: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', sh: 'sh', console: 'sh', go: 'go', golang: 'go', rust: 'rs', rs: 'rs',
  c: 'c', h: 'c', cpp: 'c', cc: 'c', hpp: 'c', 'c++': 'c', cs: 'java', csharp: 'java', java: 'java', kt: 'java', kotlin: 'java', swift: 'java',
  rb: 'rb', ruby: 'rb', sql: 'sql', css: 'css', scss: 'css', less: 'css', html: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html',
  yaml: 'yaml', yml: 'yaml', toml: 'yaml', ini: 'yaml', md: 'md', markdown: 'md', diff: 'diff', patch: 'diff',
};

export function langOf(nameOrExt) {
  const s = String(nameOrExt || '').toLowerCase();
  const ext = s.includes('.') ? s.split('.').pop() : s;
  if (/^(dockerfile|makefile)$/.test(s.split('/').pop())) return 'sh';
  return ALIASES[ext] || null;
}

const kwSets = {};
const kwFor = (lang) => (kwSets[lang] ||= new Set((KW[lang] || '').split(' ').filter(Boolean)));

// Regexes per family: comments, strings, numbers, words.
function rules(lang) {
  const hashComment = /^(#[^\n]*)/;
  const slashComment = /^(\/\/[^\n]*|\/\*[\s\S]*?(\*\/|$))/;
  const str = /^("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/;
  const num = /^(0x[\da-f_]+|\d[\d_]*(\.\d+)?(e[+-]?\d+)?n?)\b/i;
  switch (lang) {
    case 'py': case 'sh': case 'rb': case 'yaml': return { comment: hashComment, str, num };
    case 'sql': return { comment: /^(--[^\n]*)/, str, num };
    case 'json': return { comment: null, str, num };
    case 'css': return { comment: /^(\/\*[\s\S]*?(\*\/|$))/, str, num };
    default: return { comment: slashComment, str, num };
  }
}

export function highlight(code, lang) {
  const text = String(code ?? '');
  const L = ALIASES[lang] || lang;
  const frag = document.createDocumentFragment();
  if (!L || L === 'md' || text.length > 200000) { frag.appendChild(document.createTextNode(text)); return frag; }
  if (L === 'diff') return diffLines(text);
  if (L === 'html') return htmlish(text);
  const R = rules(L);
  const kw = kwFor(L === 'json' ? 'js' : L);
  let plain = '';
  const flush = () => { if (plain) { frag.appendChild(document.createTextNode(plain)); plain = ''; } };
  const span = (cls, t) => { flush(); const el = document.createElement('span'); el.className = cls; el.textContent = t; frag.appendChild(el); };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i, i + 4000);
    let m;
    if (R.comment && (m = R.comment.exec(rest))) { span('tk-c', m[0]); i += m[0].length; continue; }
    if ((m = R.str.exec(rest))) {
      // a JSON key reads as a key, not a string
      const isKey = L === 'json' && /^\s*:/.test(text.slice(i + m[0].length, i + m[0].length + 4));
      span(isKey ? 'tk-p' : 'tk-s', m[0]); i += m[0].length; continue;
    }
    if (/[0-9]/.test(rest[0]) && !/[\w$]/.test(text[i - 1] || '') && (m = R.num.exec(rest))) { span('tk-n', m[0]); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const w = m[0];
      if (kw.has(w) || (L === 'sql' && kw.has(w.toLowerCase()))) span('tk-k', w);
      else if (text[i + w.length] === '(') span('tk-f', w);
      else if (/^[A-Z][A-Za-z0-9]*$/.test(w) && L !== 'sh') span('tk-t', w);
      else plain += w;
      i += w.length;
      continue;
    }
    if (L === 'sh' && (m = /^\$\{?[\w@#?*!-]+\}?/.exec(rest))) { span('tk-v', m[0]); i += m[0].length; continue; }
    if (L === 'css' && (m = /^#[\da-f]{3,8}\b/i.exec(rest))) { span('tk-n', m[0]); i += m[0].length; continue; }
    plain += text[i];
    i++;
  }
  flush();
  return frag;
}

function htmlish(text) {
  const frag = document.createDocumentFragment();
  const re = /(<!--[\s\S]*?-->)|(<\/?[\w:-]+)|("[^"]*"|'[^']*')|(\/?>)/g;
  let last = 0;
  let m;
  const span = (cls, t) => { const el = document.createElement('span'); el.className = cls; el.textContent = t; frag.appendChild(el); };
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) span('tk-c', m[1]); else if (m[2]) span('tk-k', m[2]); else if (m[3]) span('tk-s', m[3]); else span('tk-k', m[4]);
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function diffLines(text) {
  const frag = document.createDocumentFragment();
  for (const line of text.split('\n')) {
    const el = document.createElement('span');
    el.className = line.startsWith('+') ? 'tk-add' : line.startsWith('-') ? 'tk-del' : line.startsWith('@@') ? 'tk-c' : '';
    el.textContent = line + '\n';
    frag.appendChild(el);
  }
  return frag;
}
