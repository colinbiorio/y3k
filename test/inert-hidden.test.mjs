// THE KEYS GO ONLY WHERE THE EYES CAN (src/inert-hidden.js). Run:  node test/inert-hidden.test.mjs
//
// A guest scout's desktop pass (8 Nov 2026): Tab took focus to twelve controls nobody could see behind the
// entrance card and under the feed (the chat bar's input among them), and on a phone at home the hidden
// header's "‹ home" still took taps over the 4irden portal's edge. Hidden chrome is made inert.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wireInert, BY_POINTER, HUD_HIDDEN_BY } from '../src/inert-hidden.js';
import { installDom } from './fakes/mini-dom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('  ✓ ' + name); };

// a page of fakes: each container's computed pointer-events, the body's classes, one MutationObserver
function page() {
  const els = {}, pe = {}, classes = new Set(), observers = [];
  for (const id of [...BY_POINTER, 'hud-top']) els[id] = { id, inert: false };
  const doc = { body: { classList: { contains: (c) => classes.has(c) } }, getElementById: (id) => els[id] || null };
  const win = {
    getComputedStyle: (el) => ({ pointerEvents: pe[el.id] || 'auto' }),
    MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe(target, opts) { this.target = target; this.opts = opts; } },
  };
  const change = (fn) => { fn(); for (const o of observers) o.cb([]); };
  return { els, pe, classes, observers, doc, win, change };
}

console.log('the keys go only where the eyes can:');

await ok('the entrance card: everything it hides is inert, the header too', () => {
  const p = page();
  p.classes.add('gated');
  for (const id of BY_POINTER) p.pe[id] = 'none';
  wireInert({ doc: p.doc, win: p.win });
  for (const id of [...BY_POINTER, 'hud-top']) assert.equal(p.els[id].inert, true, `#${id} can be tabbed to while hidden`);
});

await ok('home: the chat bar, the name, the portal and the life glyph come back; the header (hidden at home) stays inert', () => {
  const p = page();
  p.classes.add('gated');
  for (const id of BY_POINTER) p.pe[id] = 'none';
  wireInert({ doc: p.doc, win: p.win });
  p.change(() => { p.classes.delete('gated'); p.classes.add('in-home'); for (const id of ['chat', 'portal', 'nav-life', 'home-brand']) p.pe[id] = 'auto'; });
  for (const id of ['chat', 'portal', 'nav-life', 'home-brand']) assert.equal(p.els[id].inert, false, `#${id} is shown and cannot be reached`);
  assert.equal(p.els['cam-popup'].inert, true, 'the camera popup is hidden until the camera is on');
  assert.equal(p.els['hud-top'].inert, true, 'the hidden header\'s back button takes taps (in-home)');
});

await ok('a panel over home hides the chat bar again; a room with no home (viewing) shows the header', () => {
  const p = page();
  p.classes.add('in-home');
  wireInert({ doc: p.doc, win: p.win });
  p.change(() => { p.classes.add('panel-open'); p.pe.chat = 'none'; p.pe.portal = 'none'; });
  assert.equal(p.els.chat.inert, true, 'the chat bar under the feed takes focus');
  assert.equal(p.els.portal.inert, true);
  p.change(() => { p.classes.delete('in-home'); p.classes.delete('panel-open'); p.classes.add('viewing'); });
  assert.equal(p.els['hud-top'].inert, false, 'the header shown in a live room cannot be used');
});

await ok('watched by one observer on the body\'s class, and nothing is set that did not change', () => {
  const p = page();
  wireInert({ doc: p.doc, win: p.win });
  assert.equal(p.observers.length, 1);
  assert.equal(p.observers[0].target, p.doc.body);
  assert.deepEqual(p.observers[0].opts, { attributes: true, attributeFilter: ['class'] });
  let writes = 0;
  const el = p.els.chat; let v = el.inert;
  Object.defineProperty(el, 'inert', { get: () => v, set: (x) => { writes += 1; v = x; } });
  p.change(() => {});
  assert.equal(writes, 0, 'inert is written on every class change, changed or not');
  assert.equal(wireInert({ doc: { body: null }, win: p.win }), null, 'no body, no wiring');
});

await ok('main.js wires it; the header mirrors exactly the rules that hide it; each of the five hides by its pointer events', () => {
  const main = read('src/main.js');
  assert.match(main, /import \{ wireInert \} from '\.\/inert-hidden\.js';/);
  assert.match(main, /\nwireInert\(\);\n/, 'main.js does not wire it');
  const css = read('styles.css');
  assert.deepEqual(HUD_HIDDEN_BY, ['gated', 'in-home']);
  assert.ok(/body\.gated #hud-top,\s*body\.gated #chat,\s*body\.gated #caption \{ opacity: 0; pointer-events: none; \}/.test(css), 'the gated rule for the header changed');
  assert.ok(/body\.in-home #hud-top, body\.in-home #comments \{ opacity: 0; pointer-events: none; \}/.test(css), 'the in-home rule for the header changed');
  assert.ok(/#hud-top \{[^}]*pointer-events: none;/.test(css), 'the header no longer ignores the pointer: its own pointer events can be read now');
  assert.ok(/body\.panel-open #chat, body\.panel-open #caption \{ opacity: 0; pointer-events: none; \}/.test(css));
  assert.ok(/body\.panel-open #portal, body\.gated #portal, body\.viewing #portal \{ opacity: 0; pointer-events: none; \}/.test(css));
  assert.ok(/body\.panel-open #nav-life, body\.gated #nav-life, body\.viewing #nav-life \{ opacity: 0; pointer-events: none; \}/.test(css));
  assert.ok(/body\.cam-on #cam-popup \{ opacity: 1; transform: none; pointer-events: auto; \}/.test(css));
});

await ok('a sheet: focus goes in, what lies behind it is inert (not a question asked over it, nor the toast), Escape closes it by its own button, focus comes back', () => {
  const doc = installDom();
  doc.getElementById ||= (id) => doc.querySelector('#' + id);
  const el = (tag, attrs = {}, kids = []) => { const e = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'id') e.id = v; else e.setAttribute(k, v); } for (const k of kids) e.appendChild(k); return e; };
  const glyph = el('button', { id: 'nav-settings' });
  const nav = el('nav', { id: 'home-nav' }, [glyph]);
  const chat = el('div', { id: 'chat' }, [el('textarea', { id: 'chat-input' })]);
  const toast = el('div', { id: 'toast' });
  const close = el('button', { class: 'x mercury', id: 'settings-close', 'aria-label': 'Close' });
  const tab = el('button', { class: 'set-tab' });
  const settings = el('div', { id: 'settings', class: 'modal' }, [el('div', { class: 'sheet' }, [el('div', { class: 'sheet-head' }, [close]), el('div', { class: 'sheet-body' }, [tab])])]);
  settings.hidden = true;
  close.addEventListener('click', () => { settings.hidden = true; });   // the sheet's own close
  const compose = el('div', { id: 'compose-modal', class: 'modal compose-modal' });   // opens by an .open class; closed, display none
  for (const c of [nav, chat, toast, compose, settings]) doc.body.appendChild(c);
  const observers = [];
  const win = { getComputedStyle: (e) => ({ pointerEvents: 'auto', display: e.classList.contains('compose-modal') && !e.classList.contains('open') ? 'none' : 'block' }), MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} } };
  const keys = []; const was = doc.addEventListener; doc.addEventListener = (t, fn) => { if (t === 'keydown') keys.push(fn); else was(t, fn); };
  const sync = wireInert({ doc, win });
  doc.addEventListener = was;
  assert.equal(observers.length, 3, 'the body\'s class and each sheet are not all watched');
  assert.equal(!!nav.inert, false, 'a sheet that opens by its class, closed, held the page inert (the entrance could not be passed)');
  const press = (key, answered = false) => { const e = { key, defaultPrevented: answered, preventDefault() { this.defaultPrevented = true; } }; for (const k of keys) k(e); };
  glyph.focus();
  settings.hidden = false; sync();   // opened by its glyph, from the keyboard
  assert.ok(settings.contains(doc.activeElement), 'focus stayed behind the sheet, on what opened it');
  assert.deepEqual([nav.inert, chat.inert, toast.inert, settings.inert].map(Boolean), [true, true, false, false], 'what lies behind the sheet can be tabbed to');
  const scrim = el('div', { class: 'consent-scrim' }, [el('button', { class: 'consent-cancel' })]);
  doc.body.appendChild(scrim); sync();
  assert.equal(!!scrim.inert, false, 'a question asked over the sheet was made inert');
  scrim.remove?.(); if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
  press('Escape', true);
  assert.equal(settings.hidden, false, 'a key already answered (a select\'s list) closed the sheet');
  press('Escape'); sync();
  assert.equal(settings.hidden, true, 'Escape did not close the sheet');
  assert.deepEqual([nav.inert, chat.inert].map(Boolean), [false, false], 'the page stayed inert after the sheet closed');
  assert.equal(doc.activeElement, glyph, 'focus did not come back to what opened the sheet');
  // the chrome's own rule still holds with a sheet closed (one owner for both)
  const hiddenChat = { getComputedStyle: (e) => ({ pointerEvents: e === chat ? 'none' : 'auto' }) };
  win.getComputedStyle = (e) => ({ ...hiddenChat.getComputedStyle(e), display: e === compose ? 'none' : 'block' }); sync();
  assert.equal(chat.inert, true, 'the hidden chat bar is not inert once the sheet has closed');
  assert.match(read('src/inert-hidden.js'), /consent-scrim/, 'a question asked over a sheet is not named among what stays over it');
});

console.log(`\n${passed} checks passed.`);
