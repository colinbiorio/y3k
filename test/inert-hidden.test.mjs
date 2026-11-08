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

console.log(`\n${passed} checks passed.`);
