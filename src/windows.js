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

  // ===== STACKING, LIKE CHROME TABS =========================================
  // Drag one window's bar onto another's and they become one window with two
  // tabs; drag a tab off and it tears back out. Click a tab to switch.
  //
  // NOTHING IN THE DOM EVER MOVES. That is not tidiness, it is the only option:
  // .mind-win left RING_BOX when the borders became poured frames, so the six
  // are ringed exactly once at boot in a one-shot loop — re-parent one and the
  // MutationObserver reaps its ring and NOTHING EVER PUTS IT BACK. Not for
  // 250ms; for the session. And .mind-win is no longer in the CSS hairline
  // fallback either, so it is not left with a chrome line, it is left with no
  // edge at all. (Moving the CONTENT instead is just as closed: #reader-view
  // holds an <iframe>, and re-parenting an iframe reloads it — the presence
  // would lose the passage it was looking at mid-read.)
  //
  // So a group is two maps of STRINGS. Members share one rect by each carrying
  // the same inline left/top/width/height the drag code already writes; the
  // active one is visible and the rest wear .behind. Switching tabs writes
  // classes and inline styles and nothing else, which the mercury observer does
  // not watch (childList/subtree only) — so a switch wakes zero ring sweeps.
  const tabs = (() => {
    const groups = new Map();      // gid -> { members: [id], active: id }
    const of = new Map();          // winId -> gid
    let seq = 0, aimAt = null;

    const idOf = (el) => el && el.id;
    const elOf = (id) => $(id);
    const titleOf = (id) => {
      const t = elOf(id)?.querySelector('.win-title');
      return (t && t.textContent.trim()) || id;
    };
    const groupOf = (el) => groups.get(of.get(idOf(el)));
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    // Every member is written the same box, so a switch is genuinely still.
    function applyRect(g, box) {
      for (const id of g.members) {
        const el = elOf(id); if (!el) continue;
        el.style.left = box.left + 'px'; el.style.top = box.top + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.width = box.width + 'px'; el.style.height = box.height + 'px';
      }
    }
    // A window whose GATE has opened while it sat behind gets a mark on its tab
    // rather than springing to the front — the presence opening a window is not
    // a reason to take the screen away from what you were reading. Reading the
    // gate means briefly taking .behind off, because .behind IS display:none and
    // would otherwise answer for it. Body classes change a few times a minute,
    // so two style reads per member is nothing.
    function gateWants(el) {
      if (!el.classList.contains('behind')) return getComputedStyle(el).display !== 'none';
      el.classList.remove('behind');
      const on = getComputedStyle(el).display !== 'none';
      el.classList.add('behind');
      return on;
    }

    function paint(g) {
      for (const id of g.members) {
        const el = elOf(id); if (!el) continue;
        const active = id === g.active;
        el.classList.toggle('behind', !active);
        el.classList.add('stacked');
        let strip = el.querySelector(':scope > .win-bar > .win-tabs');
        if (active) {
          if (!strip) {
            strip = document.createElement('div');
            strip.className = 'win-tabs';
            strip.setAttribute('data-nodrag', '');
            const bar = el.querySelector('[data-drag-handle]');
            bar.insertBefore(strip, bar.querySelector('.win-title')?.nextSibling || null);
          }
          strip.textContent = '';
          for (const mid of g.members) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'win-tab' + (mid === g.active ? ' on' : '');
            b.setAttribute('data-nodrag', '');
            b.dataset.win = mid;
            b.textContent = titleOf(mid);
            if (mid !== g.active && g.unread?.has(mid)) b.classList.add('news');
            strip.appendChild(b);
          }
        } else if (strip) { strip.remove(); }
        // the title is the tab strip's job now
        el.querySelector('.win-title')?.classList.toggle('hidden-title', active);
      }
    }

    function makeGroup(hostEl, guestEl) {
      const hid = idOf(hostEl), gidn = idOf(guestEl);
      if (!hid || !gidn || hid === gidn) return;
      let g = groupOf(hostEl);
      if (!g) {
        const gid = 'g' + (++seq);
        g = { members: [hid], active: hid, unread: new Set() };
        groups.set(gid, g); of.set(hid, gid);
      }
      const gid = of.get(hid);
      // leaving whatever it was in before, so a window is never in two stacks
      leave(guestEl, { silent: true });
      g.members.push(gidn); of.set(gidn, gid);
      g.active = gidn;                      // you dropped it, so you meant to see it
      g.unread.delete(gidn);
      applyRect(g, rectOf(hostEl));
      paint(g);
      raise(elOf(g.active));
    }

    function leave(el, { silent = false } = {}) {
      const id = idOf(el), gid = of.get(id);
      if (!gid) return;
      const g = groups.get(gid); if (!g) return;
      g.members = g.members.filter((m) => m !== id);
      of.delete(id);
      g.unread?.delete(id);
      el.classList.remove('behind', 'stacked');
      el.querySelector(':scope > .win-bar > .win-tabs')?.remove();
      el.querySelector('.win-title')?.classList.remove('hidden-title');
      // a group of one is not a group
      if (g.members.length <= 1) {
        for (const m of g.members) {
          of.delete(m);
          const me = elOf(m); if (!me) continue;
          me.classList.remove('behind', 'stacked');
          me.querySelector(':scope > .win-bar > .win-tabs')?.remove();
          me.querySelector('.win-title')?.classList.remove('hidden-title');
        }
        groups.delete(gid);
        return;
      }
      if (g.active === id) g.active = g.members[0];
      if (!silent) paint(g);
    }

    function show(id) {
      const gid = of.get(id); if (!gid) return false;
      const g = groups.get(gid); if (!g) return false;
      g.active = id; g.unread.delete(id);
      paint(g);
      raise(elOf(id));
      return true;
    }

    // ---- what the drag calls -------------------------------------------------
    // A grouped window carries its stack: every member is written the same box.
    function moved(el, x, y) {
      const g = groupOf(el); if (!g) return;
      const r = el.getBoundingClientRect();
      applyRect(g, { left: x, top: y, width: r.width, height: r.height });
    }
    // The BAR under the cursor is the only merge target — the same split Chrome
    // makes, and the one that leaves "drop it anywhere on the window" free to go
    // on meaning nothing.
    function barUnder(x, y, notEl) {
      for (const id of ids) {
        const el = elOf(id);
        if (!el || el === notEl || el.classList.contains('behind')) continue;
        const bar = el.querySelector('[data-drag-handle]');
        if (!bar) continue;
        const r = bar.getBoundingClientRect();
        if (!r.width) continue;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
      }
      return null;
    }
    function aim(el, x, y) {
      const hit = barUnder(x, y, el);
      if (hit === aimAt) return;
      aimAt?.classList.remove('tab-target');
      aimAt = hit;
      aimAt?.classList.add('tab-target');
    }
    function drop(el) {
      const target = aimAt;
      aimAt?.classList.remove('tab-target');
      aimAt = null;
      if (target && target !== el) makeGroup(target, el);
    }

    // ---- the tab strip's own gestures ---------------------------------------
    // Click switches. Drag a tab off the bar tears it out, which is the only way
    // back to a lone window and the gesture people already expect.
    let tearFrom = null, tearId = null, tore = false;
    document.addEventListener('pointerdown', (e) => {
      const tab = e.target.closest?.('.win-tab');
      if (!tab || viewing()) return;
      tearFrom = { x: e.clientX, y: e.clientY }; tearId = tab.dataset.win; tore = false;
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!tearFrom || tore) return;
      if (Math.abs(e.clientY - tearFrom.y) < 26 && Math.abs(e.clientX - tearFrom.x) < 90) return;
      tore = true;
      const el = elOf(tearId); if (!el) return;
      leave(el);
      el.classList.remove('behind');
      el.style.left = Math.max(6, e.clientX - 90) + 'px';
      el.style.top = Math.max(6, e.clientY - 14) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      raise(el);
    });
    document.addEventListener('pointerup', (e) => {
      const wasTear = tore, id = tearId;
      tearFrom = null; tearId = null; tore = false;
      if (wasTear || !id) return;
      const tab = e.target.closest?.('.win-tab');
      if (tab && tab.dataset.win === id) show(id);
    });

    // A member whose gate opens while it is behind gets a mark, not the screen.
    const mo = new MutationObserver(() => {
      for (const g of groups.values()) {
        for (const id of g.members) {
          if (id === g.active) continue;
          const el = elOf(id); if (!el) continue;
          if (gateWants(el)) g.unread.add(id);
        }
        paint(g);
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return { moved, aim, drop, leave, show, has: (id) => of.has(id),
             groupCount: () => groups.size, membersOf: (id) => {
               const g = groups.get(of.get(id)); return g ? g.members.slice() : []; } };
  })();

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
      const nx = Math.max(6, Math.min(window.innerWidth - r.width - 6, ox + (e.clientX - sx)));
      const ny = Math.max(6, Math.min(window.innerHeight - r.height - 6, oy + (e.clientY - sy)));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
      // a grouped window carries its whole stack, and the bar under the cursor
      // is the only thing that can make one
      tabs.moved(el, nx, ny);
      tabs.aim(el, e.clientX, e.clientY);
    });
    const end = () => { if (dragging) tabs.drop(el); dragging = false; };
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
  //   THE TINT IS ON THE MATERIAL, NOT UNDER IT. These were a saturated CSS
  // circle with a unimat disc laid on top, which reads as two things — a dot,
  // and some metal in it. The dot is the no-WebGL2 fallback and nothing else
  // now: the moment a disc pours, .lit takes the CSS circle away and what is
  // left is unimat wearing a colour, the way the material first arrived
  // blue-tinted before its saturation came down. So these are pulled well back
  // toward white: far enough to read red, amber and green at 14px, not so far
  // that they stop looking poured.
  const LIGHTS = [
    ['close', [1.00, 0.54, 0.49], 'Close'],
    ['min',   [1.00, 0.81, 0.44], 'Minimize'],
    ['full',  [0.53, 0.92, 0.61], 'Full screen'],
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
        if (kind === 'close') { tabs.leave(el); el.classList.add('shut'); resetWindow(el); }
        else if (kind === 'min') { unfull(el); minimize(el); }
        else { el.classList.remove('min'); restoreHeight(el); toggleFull(el); }
      });
      wrap.appendChild(b);
      lightMounts.push([b, tint]);
    }
    // TOP RIGHT. They sat at bar.firstChild, which is macOS's corner and not the
    // one this room uses — the title reads left and the controls belong opposite
    // it. The bar is a flex row with space-between, so appending is enough.
    bar.appendChild(wrap);
  }
  // MINIMIZING A RESIZED WINDOW HAS TO SHED ITS HEIGHT. The class hides the
  // body, but a window someone had dragged taller keeps the inline height it was
  // given — so it collapsed to a title bar floating at the top of 300px of
  // nothing. The height is put back on the way out, so minimize stays a toggle.
  function minimize(el) {
    if (el.classList.toggle('min')) {
      el._tall = el.style.height;
      el.style.height = '';
    } else {
      restoreHeight(el);
    }
  }
  function restoreHeight(el) {
    if (el._tall !== undefined) { el.style.height = el._tall; el._tall = undefined; }
  }

  // ACTUALLY FULL SCREEN. It used to set the element to the VIEWPORT, which is
  // the page's idea of full and still has the browser's own chrome above it.
  // The Fullscreen API is what the word means, so that is asked for first; the
  // viewport fill stays as the fallback, because requestFullscreen is refused
  // without a user gesture, inside some embeds, and on older iOS entirely — and
  // a green light that silently does nothing is worse than one that fills the
  // page.
  function toggleFull(el) {
    const on = el.classList.toggle('full');
    if (!on) {
      if (document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {});
      if (el._home) { Object.assign(el.style, el._home); el._home = null; }
      return;
    }
    // remember where it was, so green is a toggle and not a one-way trip
    el._home = { left: el.style.left, top: el.style.top, width: el.style.width,
                 height: el.style.height, right: el.style.right, bottom: el.style.bottom };
    el.style.left = '6px'; el.style.top = '6px'; el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.width = (window.innerWidth - 12) + 'px';
    el.style.height = (window.innerHeight - 12) + 'px';
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el)).then(() => {
        // inside the fullscreen layer the element IS the viewport: inline
        // geometry would inset it from its own edges
        el.style.left = el.style.top = el.style.width = el.style.height = '';
      }).catch(() => { /* the viewport fill above stands */ });
    }
  }
  function unfull(el) {
    if (!el.classList.contains('full')) return;
    el.classList.remove('full');
    if (document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {});
    if (el._home) { Object.assign(el.style, el._home); el._home = null; }
  }

  // Leaving fullscreen by Escape is not a click, so the class has to be told.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    for (const id of ids) {
      const el = $(id);
      if (el && el.classList.contains('full')) {
        el.classList.remove('full');
        if (el._home) { Object.assign(el.style, el._home); el._home = null; }
      }
    }
  });

  // the lights are poured after every window is wired, in one sweep, so the
  // mercury renderer sees them all at once rather than one mount per window
  const lightMounts = [];
  function pourLights() {
    if (!lightMounts.length) return;
    import('./mercury-buttons.js').then(({ mount }) => {
      for (const [b, tint] of lightMounts) {
        // .lit is what removes the CSS circle, and it is set only on the mount
        // actually succeeding — so the fallback dot survives exactly the case it
        // exists for, and never shows through a disc that did pour.
        try {
          const h = mount(b, { shape: 'disc', size: 14, tint, interactive: true, rim: 0.05, seed: 3 + tint[0] * 7 });
          if (h) b.classList.add('lit');
        } catch { /* no WebGL2: the CSS dot underneath is the fallback */ }
      }
    }).catch(() => { /* the CSS dots stand on their own */ });
  }

  // Drop any dragged position + size + minimized state, back to the CSS anchor.
  function resetWindow(el) {
    tabs.leave(el);            // a window going home is no longer in a stack
    el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.zIndex = '';

    el.style.width = el.style.height = '';
    el.classList.remove('min', 'full');
    el._home = null; el._tall = undefined;
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
  // X MEANS "NOT THIS ONE", NOT "NEVER AGAIN". `shut` is display:none with an
  // !important on it, and nothing in this app has ever removed it — so closing
  // the memory window closed it for the rest of the session. Every later memory
  // set the body class and raised a window that was still display:none, and so
  // appeared to do nothing at all. Showing a window has to undo the closing of
  // it; that is what showing means.
  const unshut = (el) => el.classList.remove('shut', 'min');

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
    if (el) { unshut(el); raise(el); }
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
