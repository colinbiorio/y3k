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
  const ids = ['reader', 'win-monologue', 'win-memory', 'win-feed', 'win-work', 'win-recall'];
  // Raised windows live in the band below modals (50): a dragged window must
  // never cover a confirm sheet. The renormalize base is DERIVED from how many
  // windows there are rather than written down — with a fixed base of 44 the
  // sixth window pushed the raised one to exactly 50 and put it level with the
  // modals, which is the one thing this band exists to prevent. Windows can't
  // all sit strictly above the chat box (45) in the slots available, so the
  // lowest may tie or fall under it; that regression stays as small as the
  // count allows and never grows into the modal layer.
  const Z_CAP = 49;            // the highest a window may ever reach
  let zTop = Z_CAP - ids.length;

  const viewing = () => Boolean(getViewing && getViewing());
  function raise(el) {
    if (zTop >= Z_CAP) {
      // Renormalize the band (one slot per window): keep the stacking order,
      // put the raised one on top, cap below the modals.
      const others = ids.map((i) => $(i)).filter((w) => w && w !== el && w.style.zIndex)
        .sort((a, b) => (+a.style.zIndex) - (+b.style.zIndex));
      zTop = Z_CAP - others.length - 1;
      for (const w of others) w.style.zIndex = String(++zTop);
    }
    el.style.zIndex = String(++zTop);
  }

  // Re-clamp only windows the host has dragged (they carry an inline left/top);
  // undragged windows keep their CSS home anchor around the orb. A hidden
  // window (display:none → zero-size rect) is left alone: clamping it would
  // teleport it to the top-left corner for its next appearance.
  function clamp(el) {
    if (!el.style.left) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
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


  // EVERY EDGE AND EVERY CORNER. There used to be one grip in the bottom-right,
  // which meant a window could only ever grow down and right — to widen one on
  // the left of the screen you had to drag it away, resize, and drag it back.
  // Sides move one axis, corners move two, and an edge that pulls LEFT or UP
  // moves the window's origin as it goes, so the opposite edge stays put.
  const MIN_W = 220, MIN_H = 120;
  const EDGES = [
    ['n',  0, -1, 'ns-resize'],   ['s',  0,  1, 'ns-resize'],
    ['w', -1,  0, 'ew-resize'],   ['e',  1,  0, 'ew-resize'],
    ['nw', -1, -1, 'nwse-resize'], ['se', 1,  1, 'nwse-resize'],
    ['ne',  1, -1, 'nesw-resize'], ['sw', -1, 1, 'nesw-resize'],
  ];
  function makeResizable(el) {
    for (const [name, dx, dy, cursor] of EDGES) {
      const h = document.createElement('div');
      h.className = 'win-edge win-edge-' + name;
      h.setAttribute('data-nodrag', '');
      h.style.cursor = cursor;
      el.appendChild(h);
      let sizing = false, sx = 0, sy = 0, w0 = 0, h0 = 0, l0 = 0, t0 = 0;
      h.addEventListener('pointerdown', (e) => {
        if (viewing()) return;
        e.stopPropagation();
        raise(el);
        sizing = true;
        try { h.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        const r = el.getBoundingClientRect();
        // pin the window to real coordinates first, so a resize never also
        // moves the edge we are NOT dragging
        el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
        sx = e.clientX; sy = e.clientY;
        w0 = r.width; h0 = r.height; l0 = r.left; t0 = r.top;
      });
      h.addEventListener('pointermove', (e) => {
        if (!sizing) return;
        const mx = e.clientX - sx, my = e.clientY - sy;
        if (dx > 0) {
          el.style.width = Math.max(MIN_W, Math.min(window.innerWidth - l0 - 6, w0 + mx)) + 'px';
        } else if (dx < 0) {
          // dragging the left edge: the RIGHT edge must not move, so width and
          // left travel together and the clamp is on how far left it may go
          const want = Math.max(MIN_W, Math.min(l0 + w0 - 6, w0 - mx));
          el.style.width = want + 'px';
          el.style.left = (l0 + w0 - want) + 'px';
        }
        if (dy > 0) {
          el.style.height = Math.max(MIN_H, Math.min(window.innerHeight - t0 - 6, h0 + my)) + 'px';
        } else if (dy < 0) {
          const want = Math.max(MIN_H, Math.min(t0 + h0 - 6, h0 - my));
          el.style.height = want + 'px';
          el.style.top = (t0 + h0 - want) + 'px';
        }
      });
      const stop = () => { sizing = false; };
      h.addEventListener('pointerup', stop);
      h.addEventListener('pointercancel', stop);
    }
  }


  // THREE LIGHTS, IN UNIMAT. The window already had one minimize button and a
  // corner arrow; this is the whole set, and they are made of the same liquid
  // as everything else rather than being three coloured circles drawn in CSS —
  // a tint on the material, so they catch the same studio and the same
  // highlights the marks beside them do.
  //   Red closes, amber minimizes, green fills the screen. The old .win-min
  //   button stays in the markup and keeps working; these sit beside it.
  const LIGHTS = [
    ['close', [1.00, 0.32, 0.30], 'Close'],
    ['min',   [1.00, 0.74, 0.18], 'Minimize'],
    ['full',  [0.30, 0.85, 0.38], 'Full screen'],
  ];
  function fitLights(el) {
    const bar = el.querySelector('[data-drag-handle]');
    if (!bar || bar.querySelector('.win-lights')) return;
    const wrap = document.createElement('div');
    wrap.className = 'win-lights';
    wrap.setAttribute('data-nodrag', '');
    for (const [kind, tint, label] of LIGHTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'win-light win-light-' + kind;
      b.setAttribute('data-nodrag', '');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());   // never start a drag
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (viewing()) return;                    // viewers watch; the host arranges
        if (kind === 'close') { el.classList.add('shut'); resetWindow(el); }
        else if (kind === 'min') { el.classList.remove('full'); el.classList.toggle('min'); }
        else {
          el.classList.remove('min');
          const on = el.classList.toggle('full');
          if (on) {
            // remember where it was, so green is a toggle and not a one-way trip
            el._home = { left: el.style.left, top: el.style.top, width: el.style.width,
                         height: el.style.height, right: el.style.right, bottom: el.style.bottom };
            el.style.left = '6px'; el.style.top = '6px'; el.style.right = 'auto'; el.style.bottom = 'auto';
            el.style.width = (window.innerWidth - 12) + 'px';
            el.style.height = (window.innerHeight - 12) + 'px';
          } else if (el._home) {
            Object.assign(el.style, el._home); el._home = null;
          }
        }
      });
      wrap.appendChild(b);
      lightMounts.push([b, tint]);
    }
    bar.insertBefore(wrap, bar.firstChild);
  }
  // the lights are poured after every window is wired, in one sweep, so the
  // mercury renderer sees them all at once rather than one mount per window
  const lightMounts = [];
  function pourLights() {
    if (!lightMounts.length) return;
    import('./mercury-buttons.js').then(({ mount }) => {
      for (const [b, tint] of lightMounts) {
        try { mount(b, { shape: 'disc', size: 13, tint, interactive: true, rim: 0.05, seed: 3 + tint[0] * 7 }); }
        catch { /* no WebGL2: the CSS dot underneath is the fallback */ }
      }
    }).catch(() => { /* the CSS dots stand on their own */ });
  }

  // Drop any dragged position + size + minimized state, back to the CSS anchor.
  function resetWindow(el) {
    el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.zIndex = '';

    el.style.width = el.style.height = '';
    el.classList.remove('min', 'full');
    el._home = null;
  }

  // Wire each declared window: drag by its bar, minimize by its [data-min] button,
  // raise-on-touch. All interaction is host-only.
  for (const id of ids) {
    const el = $(id); if (!el) continue;
    const bar = el.querySelector('[data-drag-handle]');
    if (bar) makeDraggable(el, bar);
    makeResizable(el);

    fitLights(el);
    const min = el.querySelector('[data-min]');
    if (min) min.addEventListener('click', (e) => { e.stopPropagation(); if (!viewing()) el.classList.toggle('min'); });

    el.addEventListener('pointerdown', () => { if (!viewing()) raise(el); });
  }
  pourLights();

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
  function memSetTier(tier, text) {
    const el = $('mem-' + tier); if (el) el.textContent = text || '—';
  }

  // The journal row: how much it has kept, and the line it just chose to keep.
  // A recall briefly takes the row over — you watch it remember — then the
  // journal summary returns.
  let recallTimer = 0;
  let journalSummary = '—';
  function journalSet(count, line) {
    journalSummary = line ? `✎ ${line}` : count ? `${count} line${count === 1 ? '' : 's'} kept` : '—';
    const el = $('mem-journal');
    if (el && !el.classList.contains('recalling')) el.textContent = journalSummary;
  }
  function recallFlash(query, lines) {
    const el = $('mem-journal'); if (!el) return;
    clearTimeout(recallTimer);
    el.classList.add('recalling');
    el.textContent = lines && lines.length
      ? `remembering "${query}" → ${lines.join(' · ')}`
      : `reached for "${query}" — nothing kept matches`;
    recallTimer = setTimeout(() => { el.classList.remove('recalling'); el.textContent = journalSummary; }, 12000);
  }
  function memClear() {
    clearTimeout(recallTimer); recallTimer = 0; journalSummary = '—';
    for (const tier of ['glimpse', 'short', 'long', 'journal']) { const el = $('mem-' + tier); if (el) { el.classList.remove('recalling'); el.textContent = '—'; } }
  }

  // The Work window: the one slow thing it is making, title and body. Persists
  // across beats (like the memory window) rather than idling out (like feed).
  function workSet(title, body) {
    const t = $('work-title'); if (t) t.textContent = String(title || '(untitled)');
    const b = $('work-body'); if (b) b.textContent = String(body || '');
  }
  function workClear() { workSet('', ''); }

  // The Feed window: the post it just put up, held for a moment.
  function feedShow(text, who) {
    const t = $('feed-text'); if (t) t.textContent = String(text || '');
    const w = $('feed-who'); if (w) w.textContent = who ? '@' + String(who) : '';
  }
  function feedClear() { feedShow('', ''); }

  function resetAll() {
    for (const id of ids) { const el = $(id); if (el) resetWindow(el); }
    monoClear(); memClear(); feedClear(); workClear();
  }

  // A MEMORY, OPENED FROM THE ORB. Its own words, then when it was kept and how
  // many others it sits beside. `when` is rendered from the entry's real
  // timestamp and simply omitted if there isn't one — a memory with no honest
  // time says nothing about its time.
  function recallShow(node) {
    if (!node) return;
    const text = $('recall-text'); if (text) text.textContent = node.text || '—';
    const when = $('recall-when');
    if (when) when.textContent = node.t ? new Date(node.t).toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }) : '';
    const links = $('recall-links');
    if (links) links.textContent = node.links ? `${node.links} link${node.links === 1 ? '' : 's'}` : 'unlinked';
    document.body.classList.add('recall-open');
    const el = $('win-recall');
    if (el) { el.classList.remove('min'); raise(el); }
  }
  function recallHide() { document.body.classList.remove('recall-open'); }

  return {
    monoAppend, monoClear, memSet, memSetTier, memClear, journalSet, recallFlash, feedShow, feedClear, workSet, workClear,
    recallShow, recallHide,
    resetWindow: (id) => { const el = $(id); if (el) resetWindow(el); },
    resetAll,
    raise: (id) => { const el = $(id); if (el) raise(el); },
  };
}
