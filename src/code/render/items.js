// One transcript item → one element. The view keeps the element per item and
// calls this again only when that item changed — and for the one that changes
// many times a second, a reply being written, updateItem() patches the element
// it already has instead of making a new one (see assistant() below).
//
// Every card that asks the person something shows WHAT would happen first — the
// diff, the command and the folder it runs in, the URL — and the buttons after.

import { h, icon, add, swap } from '../dom.js';
import { markdown, mdStream, codeBlock, copyText } from './markdown.js';
import { renderDiff, diffStat } from './diff.js';
import { langOf, highlight } from './highlight.js';

const KIND_ICON = { bash: 'terminal', edit: 'edit', write: 'file', read: 'read', search: 'search', web: 'web', mcp: 'plug', task: 'agent', todo: 'todo', plan: 'plan', question: 'question', other: 'dot' };
const STATUS = { running: 'running', waiting: 'waiting on you', ok: '', error: 'error', denied: 'denied', stopped: 'stopped' };

const secs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
const lines = (t) => (t ? t.split('\n').length : 0);

// Collapsible block: a head that toggles a body. It follows its default (which
// can change as a tool runs and finishes) until the person opens or closes it;
// from then on their choice is kept on the item.
//
// `body` may be a function: then the body is built the first time the fold
// opens, not before. Most folds are never opened — a Read card holds up to
// 64 KB of coloured file (10-25k nodes) behind a closed head — and a session
// with dozens of them was hundreds of thousands of nodes nobody looked at.
function fold(it, key, head, body, openByDefault) {
  const openKey = 'open_' + key;
  const open = it[openKey] ?? !!openByDefault;
  const wrap = h('div.fold' + (open ? '.open' : ''));
  const btn = h('button.fold-head', { type: 'button', 'aria-expanded': String(open) }, head, icon('chevron', 'fold-chev'));
  const bodyEl = h('div.fold-body');
  let built = false;
  const build = () => { if (!built) { built = true; add(bodyEl, [typeof body === 'function' ? body() : body]); } };
  if (open) build();
  btn.addEventListener('click', () => {
    it[openKey] = !wrap.classList.contains('open');
    if (it[openKey]) build();
    wrap.classList.toggle('open', it[openKey]);
    btn.setAttribute('aria-expanded', String(it[openKey]));
  });
  wrap.append(btn, bodyEl);
  return wrap;
}

// Where the n-th line ends (or the end of the text).
function afterLine(text, n) {
  let i = -1;
  for (let k = 0; k < n; k++) { i = text.indexOf('\n', i + 1); if (i < 0) return text.length; }
  return i;
}

// A long output is clipped to its first ~14 lines (.tl-out.long, 15.5em) until
// "show all", so only the first 24 are coloured — the clip plus a margin; the
// rest waits as one plain text node (still there to select and find) and is
// coloured, whole, the first time it is asked for. A 64 KB Read was 10-25k
// nodes built for a box that shows fourteen lines.
const SHOWN_LINES = 24;
function outputBlock(out, lang) {
  if (!out?.text) return null;
  const text = out.text.replace(/\n+$/, '');
  const n = lines(text);
  const long = n > 14;
  const code = h('code.cm');
  if (long && lang) { const at = afterLine(text, SHOWN_LINES); add(code, [highlight(text.slice(0, at), lang), text.slice(at)]); }
  else add(code, [lang ? highlight(text, lang) : text]);
  const pre = h('pre.tl-out' + (long ? '.long' : ''), code);
  const box = h('div.tl-outwrap', pre);
  if (long) {
    let whole = !lang;
    const more = h('button.tl-more', { type: 'button' }, `show all ${n} lines`);
    more.addEventListener('click', () => {
      if (!whole) { whole = true; swap(code, highlight(text, lang)); }
      pre.classList.toggle('long');
      more.textContent = pre.classList.contains('long') ? `show all ${n} lines` : 'show less';
    });
    box.appendChild(more);
  }
  if (out.truncated) box.appendChild(h('div.tl-trunc.muted', `output cut at 64 KB of ${Math.round(out.bytes / 1024)} KB`));
  return box;
}

function statusDot(it) {
  const st = it.status || 'running';
  return h('span.tl-status.st-' + st, { title: STATUS[st] ?? st }, h('i'), st === 'ok' || st === 'running' ? (it.ms != null && st === 'ok' ? secs(it.ms) : '') : STATUS[st]);
}

function toolBody(it) {
  const inp = it.input || {};
  switch (it.tkind) {
    case 'bash': return [
      h('div.tl-cmd', h('span.tl-prompt', '$'), h('code.cm', String(inp.command || '')),
        h('button.md-copy', { type: 'button', title: 'Copy command', onclick: (e) => copyText(String(inp.command || ''), e.currentTarget) }, 'copy')),
      outputBlock(it.output),
      it.exitCode != null && it.exitCode !== 0 ? h('div.tl-exit', `exit ${it.exitCode}`) : null,
    ];
    case 'edit': case 'write': {
      const diffs = it.diff || it.preview?.diff;
      if (diffs?.length) return diffs.map((d) => renderDiff(d, { header: diffs.length > 1 }));
      if (it.status === 'error' || it.status === 'denied') return outputBlock(it.output);
      return h('div.muted.tl-note', it.preview?.edits ? `${it.preview.edits} edits` : '');
    }
    case 'read': return outputBlock(it.output, langOf(inp.file_path || inp.path || ''));
    case 'todo': return todoList((inp.todos || []).map((x) => ({ text: x.content, status: x.status })));
    case 'task': return null; // children render below
    default: {
      const args = Object.keys(inp).length ? codeBlock(JSON.stringify(inp, null, 2), 'json', { copy: false }) : null;
      return [args, outputBlock(it.output)];
    }
  }
}

function toolSummary(it) {
  const o = it.output?.text || '';
  switch (it.tkind) {
    case 'read': return it.status === 'ok' ? `${lines(o.replace(/\n$/, ''))} lines` : '';
    case 'search': return it.status === 'ok' ? (o.trim() ? `${lines(o.trim())} results` : 'nothing found') : '';
    case 'edit': case 'write': { const d = (it.diff || it.preview?.diff || [])[0]; return d ? diffStat(d) : ''; }
    case 'web': return it.status === 'ok' ? `${Math.round(o.length / 1024) || '<1'} KB` : '';
    case 'todo': { const t = it.input?.todos || []; return `${t.filter((x) => x.status === 'completed').length} of ${t.length} done`; }
    default: return '';
  }
}

export function todoList(items) {
  return h('ul.todos', items.map((t) => h('li.todo.td-' + (t.status || 'pending'),
    h('span.td-box', t.status === 'completed' ? icon('check') : t.status === 'in_progress' ? h('i.td-spin') : null),
    h('span.td-text', t.status === 'in_progress' && t.activeForm ? t.activeForm : t.text))));
}

function toolCard(it, ctx) {
  // An edit opens once it has happened (while it waits, its permission card
  // shows the change); a command opens while it runs or when it fails.
  const done = it.status === 'ok' || it.status === 'error';
  const openDefault = ((it.tkind === 'edit' || it.tkind === 'write') && (done || it.status === 'running'))
    || it.tkind === 'task' || (it.tkind === 'bash' && it.status !== 'ok' && it.status !== 'waiting') || it.status === 'error';
  const head = h('span.tl-head',
    icon(KIND_ICON[it.tkind] || 'dot', 'tl-ic k-' + it.tkind),
    h('span.tl-name', it.tkind === 'mcp' ? it.name.replace(/^mcp__/, '').replace(/__/, ' · ') : it.name),
    h('span.tl-title', it.title && it.title !== it.name ? it.title : ''),
    h('span.tl-sum', toolSummary(it)),
    statusDot(it));
  // built when the card first opens (see fold)
  const body = () => {
    const parts = [toolBody(it)];
    if (it.tkind === 'task') {
      // A subagent's own items. ctx.renderChild hands back the element the view
      // already has for a child when it has one, so rebuilding this card's head
      // moves its children across rather than drawing them all again.
      const kids = h('div.tl-children');
      for (const c of it.children || []) kids.appendChild(ctx.renderChild(c));
      const a = it.agent;
      parts.push(h('div.ag-head', h('span.ag-chip', a?.agentType || 'agent'), h('span.ag-desc', it.input?.description || ''), a?.text ? h('span.ag-prog.muted', a.text) : null));
      parts.push(kids);
      if (it.status === 'ok' && it.output?.text) parts.push(fold(it, 'res', h('span.muted', 'what it reported'), () => h('div.ag-res', markdown(it.output.text)), false));
    }
    return parts;
  };
  return h('div.it.tl.tk-' + it.tkind + '.st-' + (it.status || 'running'), fold(it, 'body', head, body, openDefault));
}

// Where a Task card keeps its subagent's items — for the view to add a new one
// to, without drawing the card again. Null while the card is folded shut and
// has never been opened (then the child is drawn when it is).
export function childrenOf(el) {
  return el?.querySelector(':scope > .fold > .fold-body > .tl-children') || null;
}

// A subagent's latest progress line, written into its card where it stands.
// It used to show only because the whole card was redrawn on every change
// inside it; now that nothing redraws the card, the line is set on its own.
export function agentLine(el, text) {
  const head = el?.querySelector(':scope > .fold > .fold-body > .ag-head');
  if (!head) return;
  let p = head.querySelector('.ag-prog');
  if (!text) { p?.remove(); return; }
  if (!p) { p = h('span.ag-prog.muted'); head.appendChild(p); }
  if (p.textContent !== text) p.textContent = text;
}

// --- the cards that ask ----------------------------------------------------------
function riskLabel(r) { return r === 'exec' ? 'runs a command' : r === 'write' ? 'changes files' : r === 'network' ? 'uses the network' : r === 'mcp' ? 'uses a connector' : 'reads'; }

function permissionCard(it, ctx) {
  const p = it.preview || {};
  const verb = it.tkind === 'bash' ? 'run a command' : it.tkind === 'edit' ? `edit ${short(p.path || it.input?.file_path)}` : it.tkind === 'write' ? `${p.diff?.[0]?.created ? 'create' : 'write'} ${short(p.path || it.input?.file_path)}`
    : it.tkind === 'web' ? 'use the web' : it.tkind === 'mcp' ? `use ${it.tool.replace(/^mcp__/, '').replace(/__/, ' · ')}` : `use ${it.tool}`;
  if (it.resolved) {
    const said = it.resolved === 'allow' ? (it.scope && it.scope !== 'once' ? 'Allowed, and remembered' : 'Allowed') : it.resolved === 'deny' ? 'Declined' : 'No longer waiting';
    return h('div.it.pm.done.pm-' + it.resolved, icon(it.resolved === 'allow' ? 'check' : 'close'), h('span', `${said}: ${verb}`));
  }
  // what would happen, first
  const what = [];
  if (p.diff?.length) for (const d of p.diff) what.push(renderDiff(d, { header: true }));
  else if (it.tkind === 'edit' || it.tkind === 'write') what.push(h('div.pm-warn', 'The change could not be previewed — the file may have moved since. Look before allowing.'), codeBlock(JSON.stringify(it.input, null, 2), 'json', { copy: false }));
  if (it.tkind === 'bash') {
    what.push(h('div.tl-cmd.pm-cmd', h('span.tl-prompt', '$'), h('code.cm', String(p.command || it.input?.command || ''))));
    what.push(h('div.pm-where.muted', `in ${p.cwd || ''}${p.background ? ' · keeps running in the background' : ''}`));
  }
  if (it.tkind === 'web') what.push(h('div.pm-url', p.url || p.query || ''));
  if (!what.length) what.push(codeBlock(JSON.stringify(it.input || {}, null, 2), 'json', { copy: false }));

  const note = h('input.pm-note', { type: 'text', placeholder: 'tell it why, or what to do instead (optional)', maxlength: 4000 });
  const allow = h('button.btn.btn-allow', { type: 'button', title: 'Enter' }, 'Allow', h('kbd', '⏎'));
  allow.addEventListener('click', () => ctx.answerPermission(it, 'allow', 'once'));
  const deny = h('button.btn.btn-deny', { type: 'button', title: 'Esc' }, 'Decline', h('kbd', 'esc'));
  deny.addEventListener('click', () => ctx.answerPermission(it, 'deny', 'once', note.value.trim()));
  note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.answerPermission(it, 'deny', 'once', note.value.trim()); } });
  const always = (it.suggestions || []).map((sg) => {
    const b = h('button.btn.btn-always', { type: 'button' }, sg.label);
    b.addEventListener('click', () => ctx.answerPermission(it, 'allow', sg.scope || 'always'));
    return b;
  });
  return h('div.it.pm.risk-' + (it.risk || 'read'),
    h('div.pm-head', h('span.pm-pulse'), h('span.pm-q', `${ctx.agentName} wants to ${verb}`), h('span.pm-risk', riskLabel(it.risk))),
    it.reason ? h('div.pm-reason.muted', String(it.reason)) : null,
    h('div.pm-what', what),
    h('div.pm-acts', allow, always, deny, note));
}

function questionCard(it, ctx) {
  if (it.resolved) {
    return h('div.it.qs.done', icon('question'), h('div', Object.entries(it.answers || {}).map(([q, a]) => h('div', h('span.muted', q + ' '), h('b', a)))));
  }
  const picked = new Map(); // question → Set(labels)
  const others = new Map();
  const blocks = (it.questions || []).map((q) => {
    picked.set(q.question, new Set());
    const opts = h('div.qs-opts');
    for (const o of q.options || []) {
      const b = h('button.qs-opt', { type: 'button', 'aria-pressed': 'false' }, h('b', o.label), o.description ? h('span', o.description) : null);
      b.addEventListener('click', () => {
        const set = picked.get(q.question);
        if (!q.multiSelect) { set.clear(); for (const x of opts.children) x.setAttribute('aria-pressed', 'false'); }
        if (set.has(o.label)) set.delete(o.label); else set.add(o.label);
        b.setAttribute('aria-pressed', String(set.has(o.label)));
      });
      opts.appendChild(b);
    }
    const other = h('input.qs-other', { type: 'text', placeholder: 'something else…', maxlength: 2000 });
    others.set(q.question, other);
    return h('div.qs-q', q.header ? h('span.qs-tag', q.header) : null, h('div.qs-text', q.question), opts, other);
  });
  const send = h('button.btn.btn-allow', { type: 'button' }, 'Answer');
  send.addEventListener('click', () => {
    const answers = {};
    for (const q of it.questions || []) {
      const extra = others.get(q.question).value.trim();
      const vals = [...picked.get(q.question), ...(extra ? [extra] : [])];
      if (vals.length) answers[q.question] = vals.join(', ');
    }
    if (Object.keys(answers).length) ctx.answerQuestion(it, answers);
  });
  return h('div.it.qs', h('div.pm-head', h('span.pm-pulse'), h('span.pm-q', `${ctx.agentName} has a question`)), blocks, h('div.pm-acts', send));
}

function planCard(it, ctx) {
  if (it.resolved) return h('div.it.pl.done', fold(it, 'plan', h('span', icon('plan'), it.resolved === 'allow' ? ' Plan approved' : ' Plan sent back'), () => h('div.pl-body', markdown(it.plan)), false));
  const body = h('div.pl-body', markdown(it.plan));
  const note = h('input.pm-note', { type: 'text', placeholder: 'what to change in the plan (optional)', maxlength: 4000 });
  const go = h('button.btn.btn-allow', { type: 'button' }, 'Approve plan', h('kbd', '⏎'));
  go.addEventListener('click', () => ctx.answerPermission(it, 'allow', 'once'));
  const back = h('button.btn.btn-deny', { type: 'button' }, 'Keep planning');
  back.addEventListener('click', () => ctx.answerPermission(it, 'deny', 'once', note.value.trim()));
  return h('div.it.pl', h('div.pm-head', h('span.pm-pulse'), h('span.pm-q', `${ctx.agentName} has a plan`)), body, h('div.pm-acts', go, back, note));
}

// --- everything else ---------------------------------------------------------------
// "Pass to": words from one side put in the other's composer, never sent alone.
function passButton(ctx, target, label, text) {
  if (!ctx.canPass || !text) return null;
  const b = h('button.pass', { type: 'button', title: `Copy into your message to ${label}` }, `pass to ${label}`);
  b.addEventListener('click', () => ctx.passTo(target, text));
  return b;
}

// A reply, and the one item patched in place. It used to be drawn anew for every
// few words that arrived; each new element replayed the rise-in animation, so a
// streaming answer sat at a third of its opacity, a few pixels low, flickering,
// and snapped into place only when the stream paused. Now the element, and
// every block in it, lives as long as the reply: a thinking block's text node
// grows, a text block is an mdStream (only its unfinished tail is redrawn).
const VIEWS = new WeakMap(); // element → { blocks: Map(i → view), pass }

function assistant(it, ctx) {
  const el = h('div.it.as');
  VIEWS.set(el, { blocks: new Map(), pass: null });
  patchAssistant(it, el, ctx);
  return el;
}

function thinkingView(b) {
  if (!b.text) return { kind: 'thinking', empty: true, el: h('div.th-live', h('span.th-shimmer', 'thinking…')) };
  const v = { kind: 'thinking', empty: false, head: h('span.th-head'), text: null };
  v.el = fold(b, 'th', v.head, () => { v.text = document.createTextNode(b.text); return h('div.th-body', v.text); }, false);
  return v;
}

function patchAssistant(it, el, ctx) {
  const V = VIEWS.get(el);
  el.classList.toggle('live', !it.done);
  let prev = null;
  const seen = new Set();
  for (const b of it.blocks) {
    let v = V.blocks.get(b.i);
    if (b.kind === 'thinking') {
      if (!b.text && b.done) continue;
      if (!v || v.kind !== 'thinking' || (v.empty && b.text)) { v?.el.remove(); v = thinkingView(b); }
      if (!v.empty) {
        const said = b.done ? 'thought' : 'thinking…';
        if (v.head.textContent !== said) v.head.textContent = said;
        if (v.text && v.text.data !== b.text) v.text.data = b.text;
      }
    } else {
      if (!b.text) continue;
      if (!v || v.kind !== 'text') { v?.el.remove(); const md = mdStream(); v = { kind: 'text', md, el: md.el }; }
      // Orion's version once the translator has said it (voice.js); until then,
      // and whenever it could not, the coder's own words.
      v.md.update(b.voice || b.text, b.done || it.done);
      v.el.classList.toggle('voiced', !!b.voice);
    }
    V.blocks.set(b.i, v);
    seen.add(b.i);
    // keep the blocks in order, moving nothing that is already in place
    const want = prev ? prev.nextSibling : el.firstChild;
    if (v.el !== want) el.insertBefore(v.el, want);
    prev = v.el;
  }
  for (const [i, v] of V.blocks) if (!seen.has(i)) { v.el.remove(); V.blocks.delete(i); }
  if (it.done && it.parentUid == null && !V.pass) {
    const said = it.blocks.filter((b) => b.kind === 'text').map((b) => b.text).join('\n\n').trim();
    const p = passButton(ctx, 'orion', ctx.companionName, said);
    if (p) { V.pass = h('div.pass-row', p); el.appendChild(V.pass); }
  }
}

const short = (p) => String(p || '').split(/[\\/]/).slice(-2).join('/');

// The element for an item that changed, given the one on screen: the same
// element, patched, where that is possible (a reply); otherwise a new one for
// the view to put in its place.
export function updateItem(it, el, ctx) {
  if (it.kind === 'assistant' && VIEWS.has(el)) { patchAssistant(it, el, ctx); return el; }
  return renderItem(it, ctx);
}

export function renderItem(it, ctx) {
  switch (it.kind) {
    case 'user': return h('div.it.us', it.withNote ? h('div.us-note', 'with a note from ' + (ctx.companionName || 'your companion')) : null, h('div.us-text', it.text), it.images ? h('div.us-img.muted', `${it.images} image${it.images === 1 ? '' : 's'}`) : null);
    case 'assistant': return assistant(it, ctx);
    case 'orion': return h('div.it.or.or-' + it.who,
      h('div.or-who', h('span.or-dot'), it.who === 'you' ? `you → ${it.name || ctx.companionName}` : (it.name || ctx.companionName), h('span.muted', ' · the coder does not see this')),
      h('div.or-text', it.text),
      it.who === 'orion' ? h('div.pass-row', passButton(ctx, 'coder', ctx.agentName, it.text)) : null);
    case 'tool': return toolCard(it, ctx);
    case 'permission': return permissionCard(it, ctx);
    case 'question': return questionCard(it, ctx);
    case 'plan': return planCard(it, ctx);
    case 'compact': return h('div.it.sys', icon('compact'), `The conversation was compacted${it.preTokens ? ` (from ${Math.round(it.preTokens / 1000)}k tokens)` : ''}.`);
    case 'turn-end': return h('div.it.sys.' + (it.status === 'interrupted' ? 'st-stopped' : 'st-error'), it.status === 'interrupted' ? 'Stopped.' : `Something went wrong${it.error ? ': ' + it.error : ''}.`);
    case 'notice': return h('div.it.sys.lv-' + (it.level || 'info'), it.text);
    default: return h('div.it.sys', it.kind);
  }
}
