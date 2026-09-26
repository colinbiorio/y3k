// One transcript item → one element. The view keeps the element per item and
// calls this again only when that item changed.
//
// Every card that asks the person something shows WHAT would happen first — the
// diff, the command and the folder it runs in, the URL — and the buttons after.

import { h, icon } from '../dom.js';
import { markdown, codeBlock, copyText } from './markdown.js';
import { renderDiff, diffStat } from './diff.js';
import { langOf, highlight } from './highlight.js';

const KIND_ICON = { bash: 'terminal', edit: 'edit', write: 'file', read: 'read', search: 'search', web: 'web', mcp: 'plug', task: 'agent', todo: 'todo', plan: 'plan', question: 'question', other: 'dot' };
const STATUS = { running: 'running', waiting: 'waiting on you', ok: '', error: 'error', denied: 'denied', stopped: 'stopped' };

const secs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);
const lines = (t) => (t ? t.split('\n').length : 0);

// Collapsible block: a head that toggles a body. It follows its default (which
// can change as a tool runs and finishes) until the person opens or closes it;
// from then on their choice is kept on the item.
function fold(it, key, head, body, openByDefault) {
  const openKey = 'open_' + key;
  const open = it[openKey] ?? !!openByDefault;
  const wrap = h('div.fold' + (open ? '.open' : ''));
  const btn = h('button.fold-head', { type: 'button', 'aria-expanded': String(open) }, head, icon('chevron', 'fold-chev'));
  btn.addEventListener('click', () => { it[openKey] = !wrap.classList.contains('open'); wrap.classList.toggle('open', it[openKey]); btn.setAttribute('aria-expanded', String(it[openKey])); });
  wrap.append(btn, h('div.fold-body', body));
  return wrap;
}

function outputBlock(out, lang) {
  if (!out?.text) return null;
  const text = out.text.replace(/\n+$/, '');
  const n = lines(text);
  const pre = h('pre.tl-out' + (n > 14 ? '.long' : ''), h('code.cm', lang ? highlight(text, lang) : text));
  const box = h('div.tl-outwrap', pre);
  if (n > 14) {
    const more = h('button.tl-more', { type: 'button' }, `show all ${n} lines`);
    more.addEventListener('click', () => { pre.classList.toggle('long'); more.textContent = pre.classList.contains('long') ? `show all ${n} lines` : 'show less'; });
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
  const body = [toolBody(it)];
  if (it.tkind === 'task') {
    const kids = h('div.tl-children');
    for (const c of it.children || []) kids.appendChild(ctx.renderChild(c));
    const a = it.agent;
    body.push(h('div.ag-head', h('span.ag-chip', a?.agentType || 'agent'), h('span.ag-desc', it.input?.description || ''), a?.text ? h('span.ag-prog.muted', a.text) : null));
    body.push(kids);
    if (it.status === 'ok' && it.output?.text) body.push(fold(it, 'res', h('span.muted', 'what it reported'), h('div.ag-res', markdown(it.output.text)), false));
  }
  return h('div.it.tl.tk-' + it.tkind + '.st-' + (it.status || 'running'), fold(it, 'body', head, body, openDefault));
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
  const body = h('div.pl-body', markdown(it.plan));
  if (it.resolved) return h('div.it.pl.done', fold(it, 'plan', h('span', icon('plan'), it.resolved === 'allow' ? ' Plan approved' : ' Plan sent back'), body, false));
  const note = h('input.pm-note', { type: 'text', placeholder: 'what to change in the plan (optional)', maxlength: 4000 });
  const go = h('button.btn.btn-allow', { type: 'button' }, 'Approve plan', h('kbd', '⏎'));
  go.addEventListener('click', () => ctx.answerPermission(it, 'allow', 'once'));
  const back = h('button.btn.btn-deny', { type: 'button' }, 'Keep planning');
  back.addEventListener('click', () => ctx.answerPermission(it, 'deny', 'once', note.value.trim()));
  return h('div.it.pl', h('div.pm-head', h('span.pm-pulse'), h('span.pm-q', `${ctx.agentName} has a plan`)), body, h('div.pm-acts', go, back, note));
}

// --- everything else ---------------------------------------------------------------
function assistant(it) {
  const el = h('div.it.as' + (it.done ? '' : '.live'));
  for (const b of it.blocks) {
    if (b.kind === 'thinking') {
      if (!b.text && b.done) continue;
      el.appendChild(b.text
        ? fold(b, 'th', h('span.th-head', b.done ? 'thought' : 'thinking…'), h('div.th-body', b.text), false)
        : h('div.th-live', h('span.th-shimmer', 'thinking…')));
    } else if (b.text) {
      el.appendChild(markdown(b.text));
    }
  }
  return el;
}

const short = (p) => String(p || '').split(/[\\/]/).slice(-2).join('/');

export function renderItem(it, ctx) {
  switch (it.kind) {
    case 'user': return h('div.it.us', it.withNote ? h('div.us-note', 'with a note from ' + (ctx.companionName || 'your companion')) : null, h('div.us-text', it.text), it.images ? h('div.us-img.muted', `${it.images} image${it.images === 1 ? '' : 's'}`) : null);
    case 'assistant': return assistant(it);
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
