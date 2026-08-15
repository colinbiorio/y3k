// The mind workspace — draggable, minimizable windows that show what an awake
// presence is doing (its thoughts, its memory, the page it's reading, a post).
//
// This generalizes the camera-popup drag pattern into one manager: any window
// with a [data-drag-handle] bar becomes draggable (HOST only — viewers watch),
// raises to the top on grab, minimizes via its [data-min] button, and re-clamps
// into view on resize. Windows are declared as static HTML (never injected
// markup) and shown/hidden by body-class gates in CSS — so "auto-spawn" is just
// a class the tend loop already sets (.alive / .reading / .feed-open).
//
// SECURITY: all model/user text rendered here goes in via textContent, never
// innerHTML — the workspace never becomes a control-channel or XSS surface.

const $ = (id) => document.getElementById(id);
const MONO_MAX = 40; // the monologue keeps the recent thoughts; older ones age out

export function createWindows({ getViewing } = {}) {
  const ids = ['reader', 'win-monologue', 'win-memory', 'win-feed'];
  let zTop = 50; // above the chat box (z 45) so a dragged window can sit on top

  const viewing = () => Boolean(getViewing && getViewing());
  function raise(el) { el.style.zIndex = String(++zTop); }

  // Re-clamp only windows the host has dragged (they carry an inline left/top);
  // undragged windows keep their CSS home anchor around the orb.
  function clamp(el) {
    if (!el.style.left) return;
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(6, Math.min(window.innerWidth - r.width - 6, r.left)) + 'px';
    el.style.top = Math.max(6, Math.min(window.innerHeight - r.height - 6, r.top)) + 'px';
  }
  function clampAll() { for (const id of ids) { const el = $(id); if (el) clamp(el); } }
  window.addEventListener('resize', clampAll);

  function makeDraggable(el, bar) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    bar.addEventListener('pointerdown', (e) => {
      if (viewing()) return;                      // viewers watch; only the host moves windows
      if (e.target.closest('[data-nodrag]')) return; // the minimize/close buttons
      raise(el);
      dragging = true; try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const r = el.getBoundingClientRect();
      el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    });
    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = el.getBoundingClientRect();
      el.style.left = Math.max(6, Math.min(window.innerWidth - r.width - 6, ox + (e.clientX - sx))) + 'px';
      el.style.top = Math.max(6, Math.min(window.innerHeight - r.height - 6, oy + (e.clientY - sy))) + 'px';
    });
    const end = () => { dragging = false; };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  // Drop any dragged position + minimized state, back to the CSS home anchor.
  function resetWindow(el) {
    el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.zIndex = '';
    el.classList.remove('min');
  }

  // Wire each declared window: drag by its bar, minimize by its [data-min] button,
  // raise-on-touch. All interaction is host-only.
  for (const id of ids) {
    const el = $(id); if (!el) continue;
    const bar = el.querySelector('[data-drag-handle]');
    if (bar) makeDraggable(el, bar);
    const min = el.querySelector('[data-min]');
    if (min) min.addEventListener('click', (e) => { e.stopPropagation(); if (!viewing()) el.classList.toggle('min'); });
    el.addEventListener('pointerdown', () => { if (!viewing()) raise(el); });
  }

  // --- content helpers -------------------------------------------------------
  function monoAppend(text) {
    const t = String(text || '').trim(); if (!t) return;
    const body = $('mono-body'); if (!body) return;
    const line = document.createElement('div');
    line.className = 'mono-line';
    line.textContent = t;                       // model text → textContent, never innerHTML
    body.appendChild(line);
    while (body.children.length > MONO_MAX) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
  }
  function monoClear() { const b = $('mono-body'); if (b) b.textContent = ''; }

  function memSet(mem) {
    if (!mem) return;
    for (const tier of ['glimpse', 'short', 'long']) {
      const el = $('mem-' + tier); if (el) el.textContent = mem[tier] || '—';
    }
  }
  function memClear() { for (const tier of ['glimpse', 'short', 'long']) { const el = $('mem-' + tier); if (el) el.textContent = '—'; } }

  function resetAll() {
    for (const id of ids) { const el = $(id); if (el) resetWindow(el); }
    monoClear(); memClear();
  }

  return {
    monoAppend, monoClear, memSet, memClear,
    resetWindow: (id) => { const el = $(id); if (el) resetWindow(el); },
    resetAll,
    raise: (id) => { const el = $(id); if (el) raise(el); },
  };
}
