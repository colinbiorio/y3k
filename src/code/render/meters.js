// The gauges on the toolbar: how full the context window is, how much of the
// 5-hour and weekly allowances is spent (and when they reset), and what the
// session has cost at API prices.

import { h, s, until } from '../dom.js';
import { limitLabel } from '../state.js';

const tone = (p) => (p >= 90 ? 'hot' : p >= 70 ? 'warm' : 'ok');

export function contextRing(ctx) {
  const p = ctx?.percent != null ? Math.max(0, Math.min(100, ctx.percent)) : null;
  const r = 9;
  const c = 2 * Math.PI * r;
  const title = ctx?.used != null
    ? `Context: ${ctx.used.toLocaleString()} of ${ctx.limit?.toLocaleString() ?? '?'} tokens (${p}%)${ctx.breakdown ? '\n' + ctx.breakdown.filter((b) => b.kind !== 'free' && b.tokens).map((b) => `${b.name}: ${b.tokens.toLocaleString()}`).join('\n') : ''}`
    : 'Context window';
  return h('div.mt-ctx.' + (p == null ? 'none' : tone(p)), { title },
    s('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true' },
      s('circle', { cx: 12, cy: 12, r, fill: 'none', 'stroke-width': 3, class: 'mt-track' }),
      s('circle', { cx: 12, cy: 12, r, fill: 'none', 'stroke-width': 3, class: 'mt-fill', 'stroke-dasharray': `${((p || 0) / 100) * c} ${c}`, transform: 'rotate(-90 12 12)', 'stroke-linecap': 'round' })),
    h('span.mt-num', p == null ? '—' : `${p}%`));
}

export function limitBars(limits) {
  const ws = (limits?.windows || []).filter((w) => w.utilization != null).slice(0, 3);
  if (!ws.length) return h('div.mt-limits.none', { title: 'Plan limits appear after the first reply' });
  return h('div.mt-limits', ws.map((w) => {
    const p = Math.round(Math.max(0, Math.min(1, w.utilization)) * 100);
    return h('div.mt-lim.' + tone(p), { title: `${limitLabel(w.kind)} limit: ${p}% used${w.resetsAt ? ` · resets in ${until(w.resetsAt)}` : ''}` },
      h('span.mt-lab', limitLabel(w.kind) === '5-hour' ? '5h' : limitLabel(w.kind) === 'weekly' ? 'wk' : limitLabel(w.kind)),
      h('span.mt-bar', h('span.mt-barfill', { style: { width: p + '%' } })),
      h('span.mt-pct', p + '%'));
  }));
}

export function costChip(cost) {
  if (!cost || cost.totalUsd == null) return h('div.mt-cost.none');
  const v = cost.totalUsd;
  return h('div.mt-cost', { title: cost.apiEquivalent ? 'What this session would cost at API prices. On a subscription, your plan covers it.' : 'Cost of this session' },
    v < 0.01 ? '<$0.01' : `$${v.toFixed(v < 10 ? 2 : 0)}`);
}
