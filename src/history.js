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
    // the newest entry's TOP sits just below the sphere's center
    let top = midY + 12 + scroll;
    for (let i = entries.length - 1; i >= 0; i--) {
      const n = entries[i].node;
      // width from the chord at this entry's mid-height (previous height as
      // the estimate; layout runs twice per update so it settles)
      const h = n.offsetHeight || 22;
      const dy = (top + h / 2) - midY;
      const chord = Math.abs(dy) >= r ? 0 : 2 * Math.sqrt(r * r - dy * dy);
      const w = Math.max(r * 0.95, Math.min(2 * r, chord));
      n.style.width = w + 'px';
      n.style.left = (midX - w / 2) + 'px';
      n.style.top = top + 'px';
      // presence: the newest line speaks at full strength; the past thins
      // with age and lets go entirely once it climbs off the top
      const age = entries.length - 1 - i;
      const offTop = Math.max(0, (midY - 2.6 * r) - top) / 60;
      n.style.opacity = String(Math.max(0, Math.min(1, (age === 0 ? 1 : Math.max(0.3, 0.8 - age * 0.07)) - offTop)));
      top -= (n.offsetHeight || 22) + GAP;
    }
  }
  const relayout = () => { layout(); layout(); }; // second pass settles wrapped heights

  function push(who, text) {
    const t = String(text || '').trim();
    if (!t) return;
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

  // The wheel scrolls the past while the cursor is over the column; the stack
  // is clamped so the oldest line can always come back down into view.
  window.addEventListener('wheel', (e) => {
    if (!entries.length) return;
    if (getComputedStyle(el).display === 'none') return;
    const r = R();
    if (Math.abs(e.clientX - cx()) > r * 1.15) return;
    if (e.clientY < cy() - 2.8 * r || e.clientY > cy() + 1.4 * r) return;
    let total = 0;
    for (const en of entries) total += (en.node.offsetHeight || 22) + GAP;
    const max = Math.max(0, total - r);
    // wheel UP looks back (the past sits above) — chat-log convention
    const next = Math.max(0, Math.min(max, scroll - e.deltaY));
    if (next === scroll) return;
    e.preventDefault();
    scroll = next;
    relayout();
  }, { passive: false });

  window.addEventListener('resize', relayout);
  return { push, clear };
}
