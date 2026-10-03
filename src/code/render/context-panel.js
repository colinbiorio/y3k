// ============================================================================
// THE CONTEXT PANEL — what is in the coder's head, and how much of the plan is
// left, in one look. Opens from the context ring on y3kode's toolbar. It is
// Claude Code's own context-window popover, in y3k's glass:
//
//   Context window                       671.8k / 1M (67%)   ⌄
//   ███████████████████████▌▌▏░░░░░░░░░░
//   290k until auto-compact                     [Compact session]
//   ──────────────────────────────────────────────────────────
//   Plan usage limits · Max
//   5-hour limit            Resets in 2 hr 19 min          13%
//   Weekly · all models     Resets in 17 hr 29 min         93%
//   [See detailed breakdown]
//
// and, opened, every part of the context with its share: messages, tools,
// MCP, the system prompt, skills, the auto-compact buffer, free space, and what
// is deferred (loaded only when asked for). The numbers are Claude Code's own
// (get_context_usage, get_usage) — nothing here is estimated.
// ============================================================================

import { h } from '../dom.js';

// Each part of the context, a colour of y3k's palettes (body.js SCHEMES):
// aurora for the conversation, ember for tools, verdant for MCP, amber for
// the prompt, silver for the rest.
const PART_COLOR = [
  [/^messages$/i, '#6c8cff'],
  [/^system tools$/i, '#ff6a4a'],
  [/^mcp tools$/i, '#3fc27a'],
  [/^system prompt$/i, '#e9a23b'],
  [/^skills$/i, '#b5b9c4'],
  [/^mcp server instructions$/i, '#8f94a0'],
  [/memory/i, '#c58cff'],
  [/agent/i, '#ff7ab8'],
  [/autocompact/i, '#4b4f59'],
];
const colorOf = (part) => {
  if (part.kind === 'free') return 'transparent';
  if (part.kind === 'deferred') return '#3a3d46';
  for (const [re, c] of PART_COLOR) if (re.test(part.name)) return c;
  return '#9aa0ab';
};

// 671.8k · 1M · 4k · 950
export function fmtTokens(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
const pct = (n, of) => (of ? `${(100 * n / of).toFixed(1)}%` : '—');

// "Resets in 2 hr 19 min" — the way Claude's own panel says it
export function resetsIn(at, now = Date.now()) {
  if (!at) return '';
  const m = Math.max(1, Math.round((at - now) / 60000));
  if (m < 60) return `Resets in ${m} min`;
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return `Resets in ${hrs} hr${m % 60 ? ` ${m % 60} min` : ''}`;
  return `Resets in ${Math.round(hrs / 24)} days`;
}

// `label`: the server's own name for a model's weekly window, where it gave one.
export function windowLabel(kind, label) {
  if (typeof label === 'string' && label) return 'Weekly · ' + label;
  if (kind === 'five_hour') return '5-hour limit';
  if (kind === 'seven_day') return 'Weekly · all models';
  const m = /^seven_day_([a-z0-9]+)$/.exec(String(kind));
  if (m) return 'Weekly · ' + m[1][0].toUpperCase() + m[1].slice(1);
  return String(kind).replace(/_/g, ' ');
}
const tone = (p) => (p >= 90 ? 'hot' : p >= 70 ? 'warm' : 'ok');

// ctx:    { used, limit, percent, breakdown: [{ name, tokens, kind }] } | null
// limits: { windows: [{ kind, utilization, resetsAt }] } | null
// plan:   'Max' | 'Pro' | null
// open:   whether the breakdown is showing
// busy:   a turn is running (no compacting mid-turn)
export function contextPanel({ ctx, limits, plan = null, open = false, busy = false, onToggle, onCompact, now = Date.now() } = {}) {
  const parts = Array.isArray(ctx?.breakdown) ? ctx.breakdown.filter((p) => p && typeof p.tokens === 'number') : [];
  const limit = ctx?.limit || null;
  const used = ctx?.used ?? null;
  const percent = ctx?.percent ?? (used != null && limit ? Math.round(100 * used / limit) : null);
  const free = parts.find((p) => p.kind === 'free');

  const head = h('button.cx-head', { type: 'button', 'aria-expanded': String(!!open) },
    h('span.cx-title', 'Context window'),
    h('span.cx-sum', used != null ? `${fmtTokens(used)} / ${fmtTokens(limit)}${percent != null ? ` (${percent}%)` : ''}` : 'after the first reply'),
    h('span.cx-chev' + (open ? '.open' : ''), '›'));
  head.addEventListener('click', () => onToggle?.());

  // the bar: what is loaded, in order, against the whole window
  const bar = h('div.cx-bar', { role: 'img', 'aria-label': percent != null ? `${percent}% of the context window used` : 'Context window' },
    ...(limit ? parts.filter((p) => p.kind !== 'free' && p.kind !== 'deferred' && p.tokens > 0)
      .map((p) => h('span.cx-seg', { title: `${p.name}: ${fmtTokens(p.tokens)}`, style: { width: `${Math.max(0.4, 100 * p.tokens / limit)}%`, background: colorOf(p) } })) : []));

  const rows = open && parts.length ? h('div.cx-parts',
    ...parts.map((p) => h('div.cx-part' + (p.kind === 'deferred' ? '.deferred' : ''),
      h('i.cx-swatch', { style: { background: p.kind === 'free' ? '#24262c' : colorOf(p) } }),
      h('span.cx-name', p.name),
      h('span.cx-tok', fmtTokens(p.tokens)),
      h('span.cx-pct', p.kind === 'deferred' ? '—' : pct(p.tokens, limit))))) : null;

  const compact = h('button.cx-btn', { type: 'button', disabled: busy || used == null, title: busy ? 'After this turn finishes' : 'Summarise the conversation so far, to free the window' }, 'Compact session');
  compact.addEventListener('click', () => onCompact?.());
  const foot = h('div.cx-foot',
    h('span.cx-muted', free ? `${fmtTokens(free.tokens)} until auto-compact` : ''),
    compact);

  // the plan
  const ws = (limits?.windows || []).filter((w) => w && w.utilization != null);
  const plansec = ws.length ? h('div.cx-plan',
    h('div.cx-planhead', 'Plan usage limits' + (plan ? ` · ${plan}` : '')),
    ...ws.map((w) => {
      const p = Math.round(Math.max(0, Math.min(1, w.utilization)) * 100);
      return h('div.cx-limit.' + tone(p),
        h('div.cx-limrow', h('span.cx-limname', windowLabel(w.kind, w.label)), h('span.cx-muted', resetsIn(w.resetsAt, now)), h('span.cx-limpct', `${p}%`)),
        h('div.cx-limbar', h('span', { style: { width: `${p}%` } })));
    })) : h('div.cx-plan', h('div.cx-planhead', 'Plan usage limits'), h('div.cx-muted', 'They show after the first reply.'));

  const more = h('button.cx-btn.cx-more', { type: 'button' }, open ? 'Hide breakdown' : 'See detailed breakdown');
  more.addEventListener('click', () => onToggle?.());

  return h('div.cx-panel', { role: 'dialog', 'aria-label': 'Context window and plan usage' },
    h('div.cx-ctx', head, bar, rows, foot),
    h('div.cx-rule'),
    plansec,
    parts.length ? more : null);
}
