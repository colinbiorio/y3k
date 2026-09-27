// A small stand-in for the browser's DOM, enough for src/code/render/* and
// dom.js to run under node: elements, text nodes, fragments, classList,
// dataset, style, listeners, cloneNode, and querySelector for the simple
// selectors the renderers use (tag.class compounds, descendant and `>`, with
// `:scope`). Not a browser — it exists so the streaming renderer can be held,
// node by node, to what a full render of the same text would draw.
//
//   import { installDom, serialize } from './fakes/mini-dom.mjs';
//   installDom();  // sets globalThis.document (and Node) if absent

class Node {
  constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] || null; }
  get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === globalThis.document?.body || n === globalThis.document?.documentElement; }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (n.nodeType === 11) { for (const c of [...n.childNodes]) this.insertBefore(c, ref); return n; }
    if (ref && ref.parentNode !== this) throw new Error('insertBefore: reference is not a child');
    if (n.parentNode) n.parentNode.removeChild(n);
    const at = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(at, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i < 0) throw new Error('removeChild: not a child');
    this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  remove() { this.parentNode?.removeChild(this); }
  replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Text(n) : n); }
  prepend(...ns) { const first = this.firstChild; for (const n of ns) this.insertBefore(typeof n === 'string' ? new Text(n) : n, first); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Text(String(v))); }
}

class Text extends Node {
  constructor(data) { super(3); this.data = String(data); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  cloneNode() { return new Text(this.data); }
}

class Fragment extends Node {
  constructor() { super(11); }
  cloneNode(deep) { const f = new Fragment(); if (deep) for (const c of this.childNodes) f.appendChild(c.cloneNode(true)); return f; }
  querySelector(sel) { return query(this, sel, true)[0] || null; }
  querySelectorAll(sel) { return query(this, sel, false); }
}

class ClassList {
  constructor(el) { this.el = el; }
  get list() { return this.el.className.split(/\s+/).filter(Boolean); }
  contains(c) { return this.list.includes(c); }
  add(...cs) { const l = this.list; for (const c of cs) if (!l.includes(c)) l.push(c); this.el.className = l.join(' '); }
  remove(...cs) { this.el.className = this.list.filter((c) => !cs.includes(c)).join(' '); }
  toggle(c, force) { const on = force === undefined ? !this.contains(c) : !!force; if (on) this.add(c); else this.remove(c); return on; }
  replace(a, b) { if (!this.contains(a)) return false; this.el.className = this.list.map((c) => (c === a ? b : c)).join(' '); return true; }
}

class Element extends Node {
  constructor(tag, ns = null) {
    super(1);
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    this.namespaceURI = ns;
    this.attrs = new Map();
    this.style = {};
    this.listeners = {};
    this.classList = new ClassList(this);
    const attrs = this.attrs;
    this.dataset = new Proxy({}, {
      get: (_, k) => attrs.get('data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())),
      set: (_, k, v) => { attrs.set('data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(v)); return true; },
      has: (_, k) => attrs.has('data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())),
      deleteProperty: (_, k) => { attrs.delete('data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())); return true; },
    });
  }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { this.attrs.set('class', String(v)); }
  get id() { return this.attrs.get('id') || ''; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
  get title() { return this.attrs.get('title') || ''; }
  set title(v) { this.attrs.set('title', String(v)); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  dispatch(t, ev = {}) { for (const fn of this.listeners[t] || []) fn({ type: t, target: this, currentTarget: this, preventDefault() {}, ...ev }); }
  click() { this.dispatch('click'); }
  cloneNode(deep) {
    const e = new Element(this.localName, this.namespaceURI);
    for (const [k, v] of this.attrs) e.attrs.set(k, v);
    Object.assign(e.style, this.style);
    if (deep) for (const c of this.childNodes) e.appendChild(c.cloneNode(true));
    return e;
  }
  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  blur() { if (globalThis.document?.activeElement === this) globalThis.document.activeElement = globalThis.document.body; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches(sel) { return compound(parseCompound(sel.trim()), this); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  querySelector(sel) { return query(this, sel, true)[0] || null; }
  querySelectorAll(sel) { return query(this, sel, false); }
}
// properties the renderers set directly (dom.js setProps: `k in el`)
for (const k of ['value', 'checked', 'disabled', 'hidden', 'open', 'type', 'placeholder', 'rows', 'href', 'target', 'rel']) {
  Object.defineProperty(Element.prototype, k, {
    get() { const v = this.attrs.get(k); return k === 'value' || k === 'placeholder' || k === 'type' || k === 'href' || k === 'target' || k === 'rel' ? (v ?? '') : v != null && v !== 'false'; },
    set(v) { if (v === false || v == null) this.attrs.delete(k); else this.attrs.set(k, v === true ? '' : String(v)); },
    configurable: true,
  });
}

// --- selectors: `a.b > c.d e`, with :scope --------------------------------------
function parseCompound(s) {
  if (s === ':scope') return { scope: true };
  const m = /^([a-z0-9*]*)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/i.exec(s);
  if (!m) throw new Error('mini-dom: unsupported selector ' + s);
  return { tag: m[1] && m[1] !== '*' ? m[1].toUpperCase() : null, classes: m[2] ? m[2].slice(1).split('.') : [], attrs: m[3] ? m[3].slice(1, -1).split('][') : [] };
}
function compound(c, el, scope) {
  if (el.nodeType !== 1) return false;
  if (c.scope) return el === scope;
  if (c.tag && el.tagName !== c.tag) return false;
  if (!c.attrs.every((a) => el.attrs.has(a))) return false;
  const cls = el.className.split(/\s+/);
  return c.classes.every((k) => cls.includes(k));
}
function parse(sel) {
  const parts = sel.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
  const steps = [];
  let comb = ' ';
  for (const p of parts) { if (p === '>') { comb = '>'; continue; } steps.push({ comb, c: parseCompound(p) }); comb = ' '; }
  return steps;
}
function matchesChain(el, steps, i, scope) {
  if (!compound(steps[i].c, el, scope)) return false;
  if (i === 0) return steps[0].c.scope ? true : isInside(el, scope);
  const comb = steps[i].comb;
  if (comb === '>') return !!el.parentNode && matchesChain(el.parentNode, steps, i - 1, scope);
  for (let p = el.parentNode; p; p = p.parentNode) { if (matchesChain(p, steps, i - 1, scope)) return true; if (p === scope) break; }
  return false;
}
const isInside = (el, scope) => { for (let p = el; p; p = p.parentNode) if (p === scope) return true; return false; };
function query(root, sel, first) {
  const out = [];
  for (const one of sel.split(',')) {
    const steps = parse(one);
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1 && matchesChain(c, steps, steps.length - 1, root) && !out.includes(c)) { out.push(c); if (first) return true; }
        if (walk(c)) return true;
      }
      return false;
    };
    if (walk(root) && first) break;
  }
  return out;
}

export function installDom() {
  if (globalThis.document) return globalThis.document;
  const document = {
    createElement: (t) => new Element(t),
    createElementNS: (ns, t) => new Element(t, ns),
    createTextNode: (t) => new Text(t),
    createDocumentFragment: () => new Fragment(),
    activeElement: null,
  };
  document.documentElement = new Element('html');
  document.body = new Element('body');
  document.documentElement.appendChild(document.body);
  document.activeElement = document.body;
  const on = {};
  document.addEventListener = (t, fn) => { (on[t] ||= []).push(fn); };
  document.removeEventListener = (t, fn) => { on[t] = (on[t] || []).filter((f) => f !== fn); };
  document.querySelector = (sel) => document.documentElement.querySelector(sel);
  document.querySelectorAll = (sel) => document.documentElement.querySelectorAll(sel);
  globalThis.document = document;
  globalThis.Node ||= Node;
  return document;
}

// A node as a stable string: tag, classes, the attributes that matter, text.
export function serialize(n) {
  if (n.nodeType === 3) return JSON.stringify(n.data);
  if (n.nodeType === 11) return n.childNodes.map(serialize).join('');
  const attrs = [...n.attrs].filter(([k]) => k !== 'class').sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ` ${k}=${JSON.stringify(v)}`).join('');
  const style = Object.keys(n.style).length ? ` style=${JSON.stringify(n.style)}` : '';
  // adjacent text nodes read as one (a browser draws them so)
  const kids = [];
  for (const c of n.childNodes) {
    if (c.nodeType === 3 && kids.length && kids[kids.length - 1].nodeType === 3) kids[kids.length - 1] = new Text(kids[kids.length - 1].data + c.data);
    else if (!(c.nodeType === 3 && c.data === '')) kids.push(c);
  }
  return `<${n.localName}${n.className ? '.' + n.className.split(/\s+/).join('.') : ''}${attrs}${style}>${kids.map(serialize).join('')}</${n.localName}>`;
}
