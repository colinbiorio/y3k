// THE CONVERSATION, WRAPPED AROUND THE SPHERE. Every line said in the room —
// yours and the presence's — stacks upward from just below the orb's center,
// and the column is SHAPED by the sphere: each line's width is the circle's
// chord at that height, so the newest line runs the full diameter and older
// lines narrow as they climb around the top. The wheel scrolls back through
// what was said; a new line snaps the stack home.
//
// The container never takes the pointer (the orb's drag owns the stage) — a
// window-level wheel handler scrolls only while the cursor is over the column.

export function createHistory() {
  const el = document.createElement('div');
  el.id = 'chat-history';
  document.body.appendChild(el);

  const MAX = 100;
  const GAP = 7;
  const entries = [];   // { who, node }
  let scroll = 0;       // px the stack is lifted; 0 = the newest line at its anchor

  const R = () => Math.min(innerWidth, innerHeight) * 0.30;  // the orb's visual radius
  const cx = () => innerWidth / 2;
  const cy = () => innerHeight / 2;

  function layout() {
    const r = R(), midX = cx(), midY = cy();
    // the newest entry's TOP sits just below the sphere's center — unless the
    // line is so tall it would run under the chat bar (a long streamed reply
    // on a phone): then it lifts just enough that its tail stays readable
    const newestH = entries.length ? (entries[entries.length - 1].node.offsetHeight || 22) : 0;
    let top = Math.min(midY + 12, innerHeight - 96 - newestH) + scroll;
    for (let i = entries.length - 1; i >= 0; i--) {
      const n = entries[i].node;
      // width from the chord at this entry's mid-height (previous height as
      // the estimate; layout runs twice per update so it settles)
      const h = n.offsetHeight || 22;
      const dy = (top + h / 2) - midY;
      // at or below the equator the line runs the full diameter — the spoken
      // line hangs UNDER the sphere, it isn't wrapping it (and a tall line's
      // midpoint dropping off the disc must not collapse its width); only the
      // past climbing the crown narrows to the chord
      const chord = dy >= 0 ? 2 * r : (-dy >= r ? 0 : 2 * Math.sqrt(r * r - dy * dy));
      const w = Math.max(r * 0.95, Math.min(2 * r, chord));
      n.style.width = w + 'px';
      n.style.left = (midX - w / 2) + 'px';
      n.style.top = top + 'px';
      // presence: the newest line speaks at full strength; the past thins
      // with age and lets go entirely once it climbs off the top
      const age = entries.length - 1 - i;
      const offTop = Math.max(0, (midY - 2.6 * r) - top) / 60;
      n.style.opacity = String(Math.max(0, Math.min(1, (age === 0 ? 1 : Math.max(0.3, 0.8 - age * 0.07)) - offTop)));
      // words at the top go INTO the screen: tilt grows from 0 at the
      // equator to ~58° over the crown (below center stays flat — the
      // current line faces the room)
      const tilt = dy < 0 ? Math.min(58, (-dy / r) * 52) : 0;
      n.style.transform = tilt ? `rotateX(${tilt.toFixed(1)}deg)` : '';
      top -= (n.offsetHeight || 22) + GAP;
    }
  }
  const relayout = () => { layout(); layout(); }; // second pass settles wrapped heights

  let lastPushAt = 0;
  function push(who, text) {
    const t = String(text || '').trim();
    if (!t) return;
    const last = entries[entries.length - 1];
    const growing = last && last.who === who && (Date.now() - lastPushAt) < 15000
      && (t.startsWith(last.node.textContent) || last.node.textContent.startsWith(t));
    lastPushAt = Date.now();
    if (growing) {
      // the same utterance, still arriving (a streamed reply, a live voice
      // transcript) — the line grows in place instead of stacking triplets
      last.node.textContent = t;
      scroll = 0;
      relayout();
      return;
    }
    const n = document.createElement('div');
    n.className = 'hl ' + (who === 'you' ? 'hl-you' : 'hl-ai');
    n.textContent = t;
    el.appendChild(n);
    entries.push({ who, node: n });
    while (entries.length > MAX) entries.shift().node.remove();
    scroll = 0;          // a new line always brings you home to now
    relayout();
  }

  function clear() {
    for (const e of entries) e.node.remove();
    entries.length = 0;
    scroll = 0;
  }

  // ---- scrolling the past --------------------------------------------------
  const live = () => entries.length && getComputedStyle(el).display !== 'none';
  const inColumn = (x, y, r) =>
    Math.abs(x - cx()) <= r * 1.15 && y >= cy() - 2.8 * r && y <= cy() + 1.4 * r;
  function maxScroll() {
    let total = 0;
    for (const en of entries) total += (en.node.offsetHeight || 22) + GAP;
    return Math.max(0, total - R());
  }
  function scrollBy(d) {
    const next = Math.max(0, Math.min(maxScroll(), scroll + d));
    if (next === scroll) return false;
    scroll = next;
    relayout();
    return true;
  }

  // The wheel scrolls the past while the cursor is over the column; the stack
  // is clamped so the oldest line can always come back down into view.
  window.addEventListener('wheel', (e) => {
    if (!live() || !inColumn(e.clientX, e.clientY, R())) return;
    // wheel UP looks back (the past sits above) — chat-log convention
    if (scrollBy(-e.deltaY)) e.preventDefault();
  }, { passive: false });

  // Touch has no wheel — a drag that BEGINS in the column's corridor but
  // OUTSIDE the orb's disc scrolls the past instead. The press is taken in the
  // capture phase so the trackball (which owns the whole canvas) never sees
  // it; grabbing the sphere itself still always spins the orb.
  let dragId = null, dragY = 0;
  window.addEventListener('pointerdown', (e) => {
    if (!live()) return;
    const r = R();
    if (!inColumn(e.clientX, e.clientY, r)) return;
    if (Math.hypot(e.clientX - cx(), e.clientY - cy()) < r * 1.05) return; // the orb's disc belongs to the trackball
    if (e.target.closest && e.target.closest('#chat, #home-nav, #home-nav-right, button, textarea, input, select')) return;
    dragId = e.pointerId; dragY = e.clientY;
    e.stopPropagation();
  }, { capture: true });
  window.addEventListener('pointermove', (e) => {
    if (dragId === null || e.pointerId !== dragId) return;
    const d = e.clientY - dragY; dragY = e.clientY;
    scrollBy(d); // pulling DOWN brings the past down into view
  });
  const endHistDrag = (e) => { if (dragId !== null && e.pointerId === dragId) dragId = null; };
  window.addEventListener('pointerup', endHistDrag, { capture: true });
  window.addEventListener('pointercancel', endHistDrag, { capture: true });

  window.addEventListener('resize', relayout);
  return { push, clear };
}
