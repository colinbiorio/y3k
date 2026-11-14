// input.js — THE HANDS: which key, mouse button, stick or pad button does what.
//
// Colin, 13 Nov 2026 (GAME.md): "should be options for both controller and
// keyboard/mouse, with a dedicated 'controls' menu option from inside 'world'
// tab."
//
// Three parts.
//   · THE BINDINGS: what does what. Two keys (or mouse buttons) and one pad
//     button for each action, every one of them changeable in the controls
//     sheet (menu.js), kept in localStorage. One key does one thing: binding
//     it to an action takes it from the action that had it.
//   · THE STATE (createInput): what is held now and what was pressed since the
//     last frame, from the keys, the mouse, the pad and a thumb on glass alike.
//     No page in it, so the tests drive it with plain calls.
//   · THE WIRING (wireInput): the page's events and the pad's polling, feeding
//     the state. Keys are heard by where they sit (event.code), so W A S D are
//     the same four keys on every layout.

export const ACTIONS = [
  { id: 'forward', label: 'forward', stick: 'left stick' },
  { id: 'back', label: 'back', stick: 'left stick' },
  { id: 'left', label: 'left', stick: 'left stick' },
  { id: 'right', label: 'right', stick: 'left stick' },
  { id: 'jump', label: 'jump', note: 'a tap, or held to rise up to twice as high; flying, it climbs' },
  { id: 'dash', label: 'dash', note: 'the way you are moving; once in the air' },
  { id: 'sprint', label: 'sprint' },
  { id: 'walk', label: 'walk', note: 'a stick pushed part way walks too' },
  { id: 'fly', label: 'fly', note: 'creative only; a second jump in the air does it too' },
  { id: 'down', label: 'sink', note: 'flying; on the water it lands' },
  { id: 'mode', label: 'survival or creative' },
  { id: 'zoomIn', label: 'closer', note: 'the wheel does it too' },
  { id: 'zoomOut', label: 'further' },
  { id: 'menu', label: 'controls' },
];
const IDS = ACTIONS.map((a) => a.id);

export const STORE_KEY = 'y3k.game.controls';
export const DEADZONE = 0.15;
export const MOUSE_RAD = 0.0024;        // radians a pixel, at sensitivity 1
export const TOUCH_RAD = 0.0052;
export const STICK_YAW = 2.9, STICK_PITCH = 1.9;   // radians a second, stick hard over

export function defaults() {
  return {
    v: 1,
    keys: {
      forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      jump: ['Space', ''], dash: ['KeyQ', 'Mouse2'], sprint: ['ShiftLeft', 'ShiftRight'], walk: ['KeyV', ''],
      fly: ['KeyF', ''], down: ['KeyC', ''], mode: ['KeyG', ''], zoomIn: ['Equal', ''], zoomOut: ['Minus', ''], menu: ['KeyM', 'Escape'],
    },
    // the standard pad: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 view · 9 menu · 10 L3 · 11 R3 · 12–15 the d-pad
    pad: { forward: -1, back: -1, left: -1, right: -1, jump: 0, dash: 1, sprint: 10, walk: -1, fly: 3, down: 11, mode: 8, zoomIn: 12, zoomOut: 13, menu: 9 },
    look: { mouse: 1, stick: 1, invertY: false },
  };
}

// What was kept, laid over the defaults: an action added since keeps its
// default, a kept action that no longer exists is dropped, and anything that
// is not what it should be is not believed.
export function loadBindings(storage) {
  const b = defaults();
  let kept = null;
  try { kept = JSON.parse(storage?.getItem?.(STORE_KEY) || 'null'); } catch { kept = null; }
  if (!kept || typeof kept !== 'object') return b;
  for (const id of IDS) {
    const k = kept.keys?.[id];
    if (Array.isArray(k)) b.keys[id] = [0, 1].map((i) => (typeof k[i] === 'string' && k[i].length < 40 ? k[i] : ''));
    const p = kept.pad?.[id];
    if (Number.isInteger(p) && p >= -1 && p < 32 && !ACTIONS.find((a) => a.id === id).stick) b.pad[id] = p;
  }
  const l = kept.look || {};
  if (l.mouse > 0 && l.mouse <= 4) b.look.mouse = +l.mouse;
  if (l.stick > 0 && l.stick <= 4) b.look.stick = +l.stick;
  b.look.invertY = l.invertY === true;
  return b;
}
export function saveBindings(storage, b) {
  try { storage?.setItem?.(STORE_KEY, JSON.stringify({ v: 1, keys: b.keys, pad: b.pad, look: b.look })); return true; } catch { return false; }
}

// One key does one thing. `slot` is 0 or 1 for a key, ignored for the pad;
// an empty code (or -1) clears the place.
export function bindKey(b, action, slot, code) {
  if (!IDS.includes(action) || (slot !== 0 && slot !== 1)) return b;
  if (code) for (const id of IDS) b.keys[id] = b.keys[id].map((c) => (c === code ? '' : c));
  b.keys[action][slot] = code || '';
  return b;
}
export function bindPad(b, action, button) {
  if (!IDS.includes(action) || ACTIONS.find((a) => a.id === action).stick) return b;
  if (button >= 0) for (const id of IDS) if (b.pad[id] === button) b.pad[id] = -1;
  b.pad[action] = button >= 0 ? button : -1;
  return b;
}

const NAMED = {
  Space: 'space', ShiftLeft: 'left shift', ShiftRight: 'right shift', ControlLeft: 'left ctrl', ControlRight: 'right ctrl',
  AltLeft: 'left alt', AltRight: 'right alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: 'left mouse', Mouse1: 'middle mouse', Mouse2: 'right mouse', Mouse3: 'mouse 4', Mouse4: 'mouse 5',
  Equal: '=', Minus: '-', Escape: 'esc', Enter: 'enter', Tab: 'tab', Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', CapsLock: 'caps lock', Backspace: 'backspace',
};
export function keyLabel(code) {
  if (!code) return '';
  if (NAMED[code]) return NAMED[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1];
  const n = /^Numpad(.+)$/.exec(code);
  if (n) return 'numpad ' + n[1].toLowerCase();
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
}
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'view', 'menu', 'L3', 'R3', 'd-pad ↑', 'd-pad ↓', 'd-pad ←', 'd-pad →', 'home'];
export const padLabel = (n) => (n >= 0 ? PAD_NAMES[n] || 'button ' + n : '');

// A stick's rest is not exactly zero. Inside the dead circle it says nothing;
// outside, it starts from nothing at the circle's edge and reaches 1 at the rim.
export function stick(x, y, dead = DEADZONE) {
  const m = Math.hypot(x || 0, y || 0);
  if (!(m > dead)) return [0, 0];
  const k = Math.min(1, (m - dead) / (1 - dead)) / m;
  return [x * k, y * k];
}

export function createInput(bindings = defaults()) {
  let b = bindings, byKey = new Map();
  const held = new Set();          // key and mouse codes down now
  const acts = new Set();          // actions held by something that is not a key (a thumb on glass)
  const pressed = new Set();       // actions pressed since the last frame
  let lookX = 0, lookY = 0, wheel = 0, device = 'keys';
  let pad = null, padWas = [], sprintLatch = false, touchMove = null;
  const index = () => { byKey = new Map(); for (const id of IDS) for (const c of b.keys[id]) if (c) byKey.set(c, id); };
  index();
  const padOn = (id) => !!(pad && b.pad[id] >= 0 && pad.buttons[b.pad[id]]);
  const on = (id) => b.keys[id].some((c) => c && held.has(c)) || acts.has(id) || padOn(id);
  return {
    get bindings() { return b; },
    get device() { return device; },
    setBindings(next) { b = next; index(); },
    // a key or a mouse button ("Mouse0"…) going down; answers the action it is bound to, if any
    down(code, repeat = false) {
      const a = byKey.get(code) || null;
      if (repeat) return a;
      held.add(code); device = 'keys';
      if (a) pressed.add(a);
      return a;
    },
    up(code) { held.delete(code); },
    hold(action, isOn) { if (isOn) { if (!acts.has(action)) pressed.add(action); acts.add(action); device = 'touch'; } else acts.delete(action); },
    press(action) { pressed.add(action); },
    mouse(dx, dy) { lookX += dx * MOUSE_RAD * b.look.mouse; lookY += dy * MOUSE_RAD * b.look.mouse; },
    drag(dx, dy) { lookX += dx * TOUCH_RAD; lookY += dy * TOUCH_RAD; },
    wheel(dy) { wheel += dy; },
    thumb(move) { touchMove = move; if (move) device = 'touch'; },
    // the pad as it is this frame: { axes: [lx, ly, rx, ry], buttons: [true, false, …] }, or null when none is heard
    pad(p) {
      pad = p;
      if (!p) { padWas = []; return; }
      for (const id of IDS) {
        const n = b.pad[id];
        if (n >= 0 && p.buttons[n] && !padWas[n]) { pressed.add(id); device = 'pad'; if (id === 'sprint') sprintLatch = true; }
      }
      padWas = p.buttons.slice();
    },
    // nothing is held any more: the window lost the keys, or a sheet opened over the game
    clear() { held.clear(); acts.clear(); pressed.clear(); lookX = lookY = wheel = 0; sprintLatch = false; touchMove = null; },
    heldCodes: () => [...held],
    // one frame's worth, for the body and the eye. Edges are handed over once.
    frame(dt = 1 / 60) {
      let mx = (on('right') ? 1 : 0) - (on('left') ? 1 : 0), mz = (on('forward') ? 1 : 0) - (on('back') ? 1 : 0);
      let dYaw = -lookX, dPitch = -lookY;
      if (touchMove) { mx = touchMove[0]; mz = touchMove[1]; }
      if (pad) {
        const [sx, sy] = stick(pad.axes[0], pad.axes[1]);
        if (sx || sy) { mx = sx; mz = -sy; device = 'pad'; }
        const [rx, ry] = stick(pad.axes[2], pad.axes[3]);
        if (rx || ry) {
          const m = Math.hypot(rx, ry);                  // squared: fine near the middle, quick at the rim
          dYaw -= rx * m * STICK_YAW * b.look.stick * dt; dPitch -= ry * m * STICK_PITCH * b.look.stick * dt; device = 'pad';
        }
      }
      if (b.look.invertY) dPitch = -dPitch;
      if (sprintLatch && Math.hypot(mx, mz) < 0.2) sprintLatch = false;   // L3 sprints until you stop
      const zoom = wheel * 0.0016 + ((on('zoomOut') ? 1 : 0) - (on('zoomIn') ? 1 : 0)) * 1.6 * dt;
      const out = {
        move: [mx, mz], look: [dYaw, dPitch], zoom,
        jump: on('jump'), jumpPressed: pressed.has('jump'), dash: pressed.has('dash'), flyToggle: pressed.has('fly'),
        sprint: on('sprint') || sprintLatch, walk: on('walk'), up: on('jump'), down: on('down'),
        modeToggle: pressed.has('mode'), menu: pressed.has('menu'), device,
      };
      pressed.clear(); lookX = lookY = wheel = 0;
      return out;
    },
  };
}

// The first pad that is there, as the state wants it. A pad is heard only
// after a button on it is pressed (the browser's rule, not ours).
export function readPad(nav = globalThis.navigator) {
  let pads = [];
  try { pads = nav?.getGamepads?.() || []; } catch { pads = []; }
  let p = null;
  for (const g of pads) if (g && g.connected !== false && (!p || (g.mapping === 'standard' && p.mapping !== 'standard'))) p = g;
  if (!p) return null;
  return { id: p.id || 'a controller', axes: [p.axes[0] || 0, p.axes[1] || 0, p.axes[2] || 0, p.axes[3] || 0], buttons: Array.from(p.buttons, (x) => !!(x && (x.pressed || x.value > 0.5))) };
}

// Space and the arrows scroll a page and Tab walks it; in the game they are the game's.
const PAGE_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// The page's events into the state. `el` is the game's canvas holder; `paused`
// says a sheet is open (the keys are the sheet's then); the answer undoes it all.
export function wireInput(input, { el, win = globalThis.window, doc = globalThis.document, paused = () => false, onLock = () => {} } = {}) {
  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
  const active = () => doc.activeElement;
  const typing = () => { const a = active(); return !!a && (/^(input|textarea|select)$/i.test(a.tagName || '') || a.isContentEditable); };
  // a button that holds the focus was walked to with Tab: Space and Enter are its own
  const onButton = (code) => { const a = active(); return !!a && /^(button|a)$/i.test(a.tagName || '') && (code === 'Space' || code === 'Enter'); };
  const locked = () => doc.pointerLockElement === el;
  let dragging = null;                                   // where the pressed pointer last was, while it drags with no lock
  on(win, 'keydown', (e) => {
    if (e.code === 'MetaLeft' || e.code === 'MetaRight') { input.clear(); return; }   // macOS swallows the keyups under ⌘
    // a key already answered (the Escape that just closed a sheet) is not also the game's
    if (e.defaultPrevented || paused() || typing() || onButton(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = input.down(e.code, e.repeat);
    if (a || PAGE_KEYS.has(e.code)) e.preventDefault();
  });
  on(win, 'keyup', (e) => input.up(e.code));
  on(win, 'blur', () => input.clear());
  on(doc, 'visibilitychange', () => { if (doc.hidden) input.clear(); });
  on(el, 'mousedown', (e) => {
    if (paused()) return;
    // the chat's field lets go and the canvas takes the focus: the keys are the body's again
    const cv = el.querySelector?.('canvas'), a = active();
    if (cv?.focus) { if (a !== cv) cv.focus({ preventScroll: true }); } else a?.blur?.();
    if (e.button === 0 && !locked()) { dragging = [+e.clientX || 0, +e.clientY || 0]; try { el.requestPointerLock?.()?.catch?.(() => {}); } catch { /* the drag looks instead */ } return; }
    input.down('Mouse' + e.button);
    e.preventDefault();
  });
  on(win, 'mouseup', (e) => { dragging = null; input.up('Mouse' + e.button); });
  // A held pointer says how far it moved. A drag is measured by where the pointer went instead: an engine need not
  // say how far a free pointer moved (WebKit gave a script's drag 0 and 0, 13 Nov 2026).
  on(doc, 'mousemove', (e) => {
    if (locked()) { if (!paused()) input.mouse(e.movementX || 0, e.movementY || 0); return; }
    if (!dragging) return;
    const x = +e.clientX || 0, y = +e.clientY || 0;
    if (!paused()) input.mouse(x - dragging[0], y - dragging[1]);
    dragging = [x, y];
  });
  on(el, 'contextmenu', (e) => e.preventDefault());
  on(el, 'wheel', (e) => { if (paused()) return; input.wheel(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY); e.preventDefault(); }, { passive: false });
  on(doc, 'pointerlockchange', () => { dragging = null; onLock(locked()); });
  // a thumb on glass: the left half is the stick (it starts where the thumb lands), the right half looks
  const touches = new Map();
  const R = 56;
  on(el, 'pointerdown', (e) => {
    if (e.pointerType !== 'touch' || paused()) return;
    const box = el.getBoundingClientRect();
    const kind = e.clientX - box.left < box.width * 0.45 && ![...touches.values()].some((t) => t.kind === 'move') ? 'move' : 'look';
    touches.set(e.pointerId, { kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
    try { el.setPointerCapture?.(e.pointerId); } catch { /* it still moves */ }
    e.preventDefault();
  });
  on(el, 'pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    if (t.kind === 'look') input.drag(e.clientX - t.x, e.clientY - t.y);
    else { const dx = (e.clientX - t.x0) / R, dy = (e.clientY - t.y0) / R, m = Math.hypot(dx, dy); input.thumb(m > 1 ? [dx / m, -dy / m] : [dx, -dy]); }
    t.x = e.clientX; t.y = e.clientY;
  });
  const lift = (e) => { const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId); if (t.kind === 'move') input.thumb(null); };
  on(el, 'pointerup', lift);
  on(el, 'pointercancel', lift);
  return {
    poll() { input.pad(paused() ? null : readPad(win.navigator)); },
    locked,
    release() { try { if (locked()) doc.exitPointerLock?.(); } catch { /* it was not held */ } },
    off() { for (const f of offs.splice(0)) f(); touches.clear(); input.clear(); },
  };
}
