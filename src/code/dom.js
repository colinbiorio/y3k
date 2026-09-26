// Building the Code screen without ever parsing a string as HTML. Everything the
// engine sends — a model's words, a file's contents, a command's output — is
// text, and it reaches the page only as text nodes and attribute values set one
// by one. test/code-client.test.mjs refuses innerHTML and its relatives anywhere
// under src/code/.

const SVG_NS = 'http://www.w3.org/2000/svg';

// h('div.card.on', { title: 'x', onclick }, child, 'text', [more]) → element
export function h(spec, props, ...kids) {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  if (props) setProps(el, props);
  add(el, kids);
  return el;
}

export function s(spec, attrs = {}, ...kids) {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElementNS(SVG_NS, tag);
  if (classes.length) el.setAttribute('class', classes.join(' '));
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  add(el, kids);
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const swap = (el, ...kids) => add(clear(el), kids);

// Small line icons, drawn in the one weight the pane uses.
const ICONS = {
  folder: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z',
  branch: 'M7 4v10M7 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 10c0 4-10 2-10 6',
  terminal: 'M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  read: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9',
  plug: 'M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21',
  agent: 'M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z',
  todo: 'M4 6.5l1.8 1.8L9 5M11.5 7h9M4 12.5l1.8 1.8L9 11M11.5 13h9M4 18.5l1.8 1.8L9 17M11.5 19h9',
  plan: 'M5 4h14v16H5zM8.5 8.5h7M8.5 12h7M8.5 15.5h4',
  question: 'M9.2 9.2a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.6v.7M12 17.5v.3',
  stop: 'M7 7h10v10H7z',
  send: 'M12 19V5M6 11l6-6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4.5l3 2',
  key: 'M7.5 10a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.7 11.3 20 2M16.5 5.5l2.5 2.5M14 8l2 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  dot: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  compact: 'M4 9h16M4 15h16M9 4l3 3 3-3M9 20l3-3 3 3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 8.5h.01',
  laptop: 'M5 5.5h14v9.5H5zM2.5 18.5h19',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  github: 'M12 3a9 9 0 0 0-2.8 17.5c.5.1.6-.2.6-.4v-1.6c-2.5.5-3-1.1-3-1.1-.4-1-1-1.3-1-1.3-.8-.6.1-.6.1-.6.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.6.8.1-.6.3-1 .6-1.2-2-.2-4.1-1-4.1-4.4 0-1 .3-1.8.9-2.4-.1-.2-.4-1.1.1-2.4 0 0 .8-.2 2.5.9a8.6 8.6 0 0 1 4.5 0c1.7-1.1 2.5-.9 2.5-.9.5 1.3.2 2.2.1 2.4.6.6.9 1.4.9 2.4 0 3.5-2.1 4.2-4.1 4.4.3.3.6.8.6 1.6v2.4c0 .2.1.5.6.4A9 9 0 0 0 12 3z',
};
export function icon(name, cls = '') {
  return s('svg' + (cls ? '.' + cls : ''), { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true', class: 'ic' + (cls ? ' ' + cls : '') },
    s('path', { d: ICONS[name] || ICONS.dot, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

export function timeAgo(ms) {
  const d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 45) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

export function until(ms) {
  const d = Math.max(0, ms - Date.now()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ${Math.round((d % 3600) / 60)}m`;
  return `${Math.floor(d / 86400)}d ${Math.round((d % 86400) / 3600)}h`;
}
