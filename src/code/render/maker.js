// WHO IS ANSWERING. The composer used to carry a two-way switch, "Claude /
// Orion". Now the coder and the presence are one: whoever is coding moves the
// orb as well (y3k-code/orb.mjs). What stays is a single mark at the composer's
// edge — the maker of the AI that is coding, with its model's name under it —
// and pressing it turns it into a small orb: the presence, alone, with no hands
// on the computer. Pressing the orb gives the coder back.
//
// The marks are drawn here, small and simple, after each maker's own: the
// Claude spark, OpenAI's knot, Gemini's four-pointed star, OpenCode's block.
// OpenCode runs other makers' models, so its mark follows the model it runs.

import { s } from '../dom.js';

const MAKER = { claude: 'anthropic', codex: 'openai', gemini: 'google', opencode: 'opencode' };
const BY_PREFIX = [
  [/^(anthropic|claude)\b/i, 'anthropic'],
  [/^(openai|gpt|o\d|codex)\b/i, 'openai'],
  [/^(google|gemini|vertex)\b/i, 'google'],
];
export const MAKER_NAME = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', opencode: 'OpenCode' };

// provider + model → 'anthropic' | 'openai' | 'google' | 'opencode'
export function makerOf(provider, model) {
  if (provider === 'opencode' && model) {
    for (const [re, m] of BY_PREFIX) if (re.test(String(model))) return m;
  }
  return MAKER[provider] || 'opencode';
}

// A model's id, said the way its maker says it, short enough to sit under a
// mark: claude-sonnet-7-2-20990101 → Sonnet 7.2; gpt-9-codex → GPT-9 Codex;
// gemini-9.5-pro → 9.5 Pro; anthropic/claude-opus-8 → Opus 8. The maker's own
// name is left out — the mark above already says it.
export function modelName(id) {
  let m = String(id || '').trim();
  if (!m || m === 'default') return 'default';
  m = m.replace(/^.*\//, '').replace(/\[[^\]]*\]$/, '').replace(/[-@]\d{8}$/, '').replace(/-latest$/, '');
  const words = m.split(/[-_\s]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^(claude|gemini|models?)$/i.test(w) && words.length > 1) continue;
    if (/^gpt$/i.test(w) && /^[\d.]+[a-z]?$/i.test(words[i + 1] || '')) { out.push(`GPT-${words[++i]}`); continue; }
    if (/^\d+$/.test(w) && out.length && /^\d+(\.\d+)*$/.test(out[out.length - 1]) && !/\.\d+$/.test(out[out.length - 1])) { out[out.length - 1] += '.' + w; continue; }
    out.push(/^\d/.test(w) || /^[a-z]\d/i.test(w) ? w : w[0].toUpperCase() + w.slice(1));
  }
  return out.join(' ') || m;
}

// The Claude spark: rays of a few lengths round a small heart.
function spark() {
  const lens = [9.4, 7.6, 9.9, 8.2, 9.1, 7.4, 9.7, 8.5, 9.3, 7.8, 9.8, 8.0];
  let d = '';
  lens.forEach((L, i) => {
    const a = (i / lens.length) * Math.PI * 2 + 0.13;
    const x1 = 12 + Math.cos(a) * 2.2, y1 = 12 + Math.sin(a) * 2.2;
    const x2 = 12 + Math.cos(a) * L, y2 = 12 + Math.sin(a) * L;
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  });
  return s('svg.mk-svg.mk-anthropic', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('path', { d, fill: 'none', stroke: '#d97757', 'stroke-width': 2.3, 'stroke-linecap': 'round' }));
}

// OpenAI's knot: six rounded petals turned about the centre.
function knot() {
  const g = s('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 });
  for (let i = 0; i < 6; i++) g.appendChild(s('rect', { x: 9.6, y: 3.2, width: 7, height: 11.4, rx: 3.5, transform: `rotate(${i * 60} 12 12)` }));
  return s('svg.mk-svg.mk-openai', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, g);
}

// Gemini's star: four curved points, blue into violet into rose.
let starNo = 0;
function star() {
  const id = `mk-g${++starNo}`;
  return s('svg.mk-svg.mk-google', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('defs', {}, s('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 },
      s('stop', { offset: '0', 'stop-color': '#4796e3' }), s('stop', { offset: '0.55', 'stop-color': '#9168c0' }), s('stop', { offset: '1', 'stop-color': '#d96570' }))),
    s('path', { d: 'M12 1.5C12.6 7 17 11.4 22.5 12C17 12.6 12.6 17 12 22.5C11.4 17 7 12.6 1.5 12C7 11.4 11.4 7 12 1.5Z', fill: `url(#${id})` }));
}

// OpenCode: a block cursor in a frame.
function block() {
  return s('svg.mk-svg.mk-opencode', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('rect', { x: 3.5, y: 3.5, width: 17, height: 17, rx: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
    s('rect', { x: 8.5, y: 8, width: 7, height: 8, rx: 1.2, fill: 'currentColor' }));
}

export function makerMark(maker) {
  return maker === 'anthropic' ? spark() : maker === 'openai' ? knot() : maker === 'google' ? star() : block();
}
