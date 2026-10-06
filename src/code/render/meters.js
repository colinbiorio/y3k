// The gauges on the toolbar: how full the context window is, how much of the
// 5-hour and weekly allowances is spent (and when they reset), and what the
// session has cost at API prices.

import { h, s, until } from '../dom.js';
import { limitLabel } from '../state.js';

const tone = (p) => (p >= 90 ? 'hot' : p >= 70 ? 'warm' : 'ok');

// Drawn once, then updated in place (updateRing/updateBars/updateCost): the
// toolbar used to be rebuilt on every usage, git or todo event, so the
// stroke-dasharray and width transitions below never had an element that lived
// long enough to run on. Now the ring sweeps and the bars grow as intended.
const R = 9;
const C = 2 * Math.PI * R;
function ringState(ctx) {
  const p = ctx?.percent != null ? Math.max(0, Math.min(100, ctx.percent)) : null;
  const title = ctx?.used != null
    ? `Context: ${ctx.used.toLocaleString()} of ${ctx.limit?.toLocaleString() ?? '?'} tokens (${p}%)${ctx.breakdown ? '\n' + ctx.breakdown.filter((b) => b.kind !== 'free' && b.tokens).map((b) => `${b.name}: ${b.tokens.toLocaleString()}`).join('\n') : ''}`
    : 'Context window';
  return { p, title, cls: 'mt-ctx ' + (p == null ? 'none' : tone(p)), dash: `${((p || 0) / 100) * C} ${C}`, num: p == null ? '—' : `${p}%` };
}

export function contextRing(ctx) {
  const st = ringState(ctx);
  const el = h('div', { title: st.title },
    s('svg', { viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true' },
      s('circle', { cx: 12, cy: 12, r: R, fill: 'none', 'stroke-width': 3, class: 'mt-track' }),
      s('circle', { cx: 12, cy: 12, r: R, fill: 'none', 'stroke-width': 3, class: 'mt-fill', 'stroke-dasharray': st.dash, transform: 'rotate(-90 12 12)', 'stroke-linecap': 'round' })),
    h('span.mt-num', st.num));
  el.className = st.cls;
  return el;
}

export function updateRing(el, ctx) {
  const st = ringState(ctx);
  if (el.className !== st.cls) el.className = st.cls;
  if (el.title !== st.title) el.title = st.title;
  const fill = el.querySelector('.mt-fill');
  if (fill && fill.getAttribute('stroke-dasharray') !== st.dash) fill.setAttribute('stroke-dasharray', st.dash);
  const num = el.querySelector('.mt-num');
  if (num && num.textContent !== st.num) num.textContent = st.num;
  return el;
}

// The toolbar is a glance: the 5-hour and the weekly windows, two rows that
// fit the bar. A model's own weekly window (Fable, Opus …) is in the context
// panel the ring opens, with everything else.
const shownWindows = (limits) => {
  const ws = (limits?.windows || []).filter((w) => w.utilization != null);
  const main = ws.filter((w) => w.kind === 'five_hour' || w.kind === 'seven_day');
  return (main.length ? main : ws).slice(0, 2);
};
function barState(w) {
  const p = Math.round(Math.max(0, Math.min(1, w.utilization)) * 100);
  const label = limitLabel(w.kind, w.label);
  return { p, cls: 'mt-lim ' + tone(p), title: `${label} limit: ${p}% used${w.resetsAt ? ` · resets in ${until(w.resetsAt)}` : ''}`, lab: label === '5-hour' ? '5h' : label === 'weekly' ? 'wk' : label.startsWith('weekly ') ? label.slice(7) : label };
}

export function limitBars(limits) {
  const ws = shownWindows(limits);
  if (!ws.length) return h('div.mt-limits.none', { title: 'Plan limits appear after the first reply' });
  const el = h('div.mt-limits', ws.map((w) => {
    const b = barState(w);
    const row = h('div', { title: b.title },
      h('span.mt-lab', b.lab),
      h('span.mt-bar', h('span.mt-barfill', { style: { width: b.p + '%' } })),
      h('span.mt-pct', b.p + '%'));
    row.className = b.cls;
    return row;
  }));
  el.dataset.kinds = ws.map((w) => w.kind).join(',');
  return el;
}

// The same windows: moved in place. Different ones: a new set (returned — the
// caller puts it where the old one was). Still none: the same empty one.
export function updateBars(el, limits) {
  const ws = shownWindows(limits);
  if (!ws.length) return el.classList.contains('none') ? el : limitBars(limits);
  if (el.dataset.kinds !== ws.map((w) => w.kind).join(',')) return limitBars(limits);
  ws.forEach((w, i) => {
    const row = el.children[i];
    const b = barState(w);
    if (row.className !== b.cls) row.className = b.cls;
    if (row.title !== b.title) row.title = b.title;
    const fill = row.querySelector('.mt-barfill');
    if (fill.style.width !== b.p + '%') fill.style.width = b.p + '%';
    const pct = row.querySelector('.mt-pct');
    if (pct.textContent !== b.p + '%') pct.textContent = b.p + '%';
  });
  return el;
}

// WHO PAYS FOR IT. Claude Code reports every session's cost at API prices,
// whatever it is signed in with — so a bare "$0.69" read as a bill to someone on
// a Max plan, who pays nothing per message. The chip says which it is:
//   covered  signed in with a Claude plan (apiKeySource 'none'): not charged;
//            it counts toward the plan's 5-hour and weekly limits instead
//   billed   an API key: charged to that key, at that price
//   unknown  the tool did not say: the old wording, with the hover
const PLAN_NAME = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise', free: 'Free' };
export function billingOf({ authSource, account } = {}) {
  if (authSource === 'none') return { who: 'covered', plan: PLAN_NAME[account?.type] || null };
  if (typeof authSource === 'string' && authSource) return { who: 'billed', plan: null };
  return { who: null, plan: PLAN_NAME[account?.type] || null };
}

function costState(cost, billing = {}) {
  if (!cost || cost.totalUsd == null) return { cls: 'mt-cost none', text: '', title: '' };
  const v = cost.totalUsd;
  const usd = v < 0.01 ? '<$0.01' : `$${v.toFixed(v < 10 ? 2 : 0)}`;
  if (billing.who === 'covered') {
    const plan = billing.plan ? `your Claude ${billing.plan} plan` : 'your Claude plan';
    return { cls: 'mt-cost covered', text: `${usd} · covered`,
      title: `Not charged. This is what the session would cost at API prices — you're signed in with ${plan}, so it counts toward the plan's 5-hour and weekly limits instead.` };
  }
  if (billing.who === 'billed') return { cls: 'mt-cost billed', text: `${usd} · billed`, title: 'Charged to the API key Claude Code is using on this computer, at API prices.' };
  return { cls: 'mt-cost', text: usd,
    title: cost.apiEquivalent ? 'What this session would cost at API prices. On a subscription, your plan covers it.' : 'Cost of this session' };
}

export function costChip(cost, billing) {
  return updateCost(h('div'), cost, billing);
}

export function updateCost(el, cost, billing) {
  const st = costState(cost, billing);
  if (el.className !== st.cls) el.className = st.cls;
  if (el.textContent !== st.text) el.textContent = st.text;
  if (st.title) { if (el.title !== st.title) el.title = st.title; } else el.removeAttribute('title');
  return el;
}
