// TRAVEL: THE THREE PLACES (Colin, 18 Nov 2026: "can we link all 3 websites?
// 4irden.com, yearthreethousand.com, and univispira.org? like, i want a screen
// that let's you travel between all three that is available from each!").
//
// One screen, the same on all three sites: three stars in a row, as Orion's
// belt has three, each a place. airden, the grove where an AI grows;
// yearthreethousand, the AI home; univispira, the theory under both. The
// place you are in says so; the other two go there, in a new tab, so the one
// you leave is still where you left it (a signed-in garden, a presence
// mid-sentence).
//
// THE SAME FILE ON ALL THREE SITES: yearthreethousand's src/travel.js (the tree
// at the top bar's left end opens it: portal.js), univispira-org's
// assets/travel.js, airden's mind/public/travel.js. Change it in all three.
// Self-contained: its own styles, no fonts or pictures of its own, nothing
// fetched. Loaded with ?button=1 it also puts a small button of three stars at
// a corner of the page, for a site with no door of its own to it.

export const PLACES = [
  { id: 'airden', name: 'airden', host: '4irden.com', url: 'https://4irden.com', line: 'A grove where an AI grows, and remembers you.' },
  { id: 'y3k', name: 'yearthreethousand', host: 'yearthreethousand.com', url: 'https://yearthreethousand.com', line: 'An AI home: a presence with a body, a world and a life of its own.' },
  { id: 'univispira', name: 'univispira', host: 'univispira.org', url: 'https://univispira.org', line: 'U(U) = U: the theory under both, measured, and the P vs NP walk.' },
];

// which of the three this page is (a local copy of one counts as it)
export function hereOf(hostname = globalThis.location?.hostname || '', pathname = globalThis.location?.pathname || '') {
  const h = String(hostname).toLowerCase().replace(/^www\./, '');
  for (const p of PLACES) if (h === p.host) return p.id;
  if (/univispira/.test(h) || /univispira-org/.test(pathname)) return 'univispira';
  if (/4irden|airden/.test(h)) return 'airden';
  if (/yearthreethousand|y3k/.test(h)) return 'y3k';
  return null;
}

const CSS = `
.y3k-travel { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 24px;
  background: rgba(5, 3, 10, 0.86); backdrop-filter: blur(14px) saturate(1.1); -webkit-backdrop-filter: blur(14px) saturate(1.1);
  color: #e8e9ee; font: 15px/1.45 'Supreme', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  animation: y3k-travel-in 0.28s ease both; }
@keyframes y3k-travel-in { from { opacity: 0; } to { opacity: 1; } }
.y3k-travel[hidden] { display: none; }
.y3k-travel .yt-box { position: relative; width: min(980px, 100%); }
.y3k-travel .yt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 0 4px 22px; }
.y3k-travel h2 { margin: 0; font-size: 13px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #9aa0ad; }
.y3k-travel .yt-close { background: none; border: 1px solid rgba(255, 255, 255, 0.16); color: #c9ccd4; border-radius: 999px;
  width: 34px; height: 34px; font-size: 16px; line-height: 1; cursor: pointer; }
.y3k-travel .yt-close:hover, .y3k-travel .yt-close:focus-visible { border-color: rgba(255, 255, 255, 0.4); color: #fff; outline: none; }
.y3k-travel .yt-row { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
/* the belt: a faint line through the three stars */
.y3k-travel .yt-row::before { content: ''; position: absolute; left: 16%; right: 16%; top: 58px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(190, 210, 255, 0.35), rgba(190, 210, 255, 0.35), transparent); }
.y3k-travel .yt-place { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;
  padding: 26px 18px 22px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.025);
  color: inherit; text-decoration: none; transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease; }
.y3k-travel a.yt-place:hover, .y3k-travel a.yt-place:focus-visible { background: rgba(255, 255, 255, 0.06); border-color: rgba(190, 210, 255, 0.35);
  transform: translateY(-2px); outline: none; }
.y3k-travel .yt-star { width: 64px; height: 64px; border-radius: 50%; margin-bottom: 10px;
  background: radial-gradient(circle, #ffffff 0 7%, rgba(214, 228, 255, 0.95) 12%, rgba(150, 180, 255, 0.35) 30%, rgba(120, 150, 255, 0.08) 52%, transparent 70%); }
.y3k-travel .yt-here .yt-star { background: radial-gradient(circle, #ffffff 0 9%, rgba(255, 236, 200, 0.95) 15%, rgba(255, 200, 140, 0.4) 33%, rgba(255, 180, 120, 0.1) 55%, transparent 72%); }
.y3k-travel .yt-words { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.y3k-travel .yt-name { font-size: 22px; font-weight: 500; letter-spacing: 0.01em; color: #f4f5f8; overflow-wrap: anywhere; }
.y3k-travel .yt-host { font-size: 12.5px; color: #8f95a3; letter-spacing: 0.02em; }
.y3k-travel .yt-line { font-size: 14px; color: #b9bdc8; max-width: 26ch; }
.y3k-travel .yt-go { margin-top: 6px; font-size: 12.5px; color: #c8d6ff; }
.y3k-travel .yt-here .yt-go { color: #e9c99a; }
@media (max-width: 640px) {
  .y3k-travel { place-items: start center; overflow-y: auto; }
  .y3k-travel .yt-row { grid-template-columns: 1fr; gap: 12px; }
  .y3k-travel .yt-row::before { left: 50%; right: auto; top: 30px; bottom: 30px; width: 1px; height: auto;
    background: linear-gradient(180deg, transparent, rgba(190, 210, 255, 0.3), transparent); }
  .y3k-travel .yt-place { flex-direction: row; text-align: left; align-items: center; padding: 16px; gap: 14px; }
  .y3k-travel .yt-star { width: 44px; height: 44px; margin: 0; flex: none; }
  .y3k-travel .yt-words { align-items: flex-start; gap: 2px; }
}
@media (prefers-reduced-motion: reduce) { .y3k-travel, .y3k-travel .yt-place { animation: none; transition: none; } }
.y3k-travel-button { position: fixed; z-index: 2147482999; right: max(14px, env(safe-area-inset-right)); bottom: max(14px, env(safe-area-inset-bottom));
  width: 46px; height: 46px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(10, 10, 16, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); cursor: pointer; display: grid; place-items: center; padding: 0; }
.y3k-travel-button:hover, .y3k-travel-button:focus-visible { border-color: rgba(255, 255, 255, 0.45); outline: none; }
.y3k-travel-button i { display: block; width: 5px; height: 5px; border-radius: 50%; background: #fff; box-shadow: 0 0 6px 1px rgba(200, 220, 255, 0.9); }
.y3k-travel-button span { display: flex; gap: 5px; transform: rotate(-18deg); }
`;

let root = null, back = null;
function styles(doc) {
  if (doc.getElementById('y3k-travel-css')) return;
  const s = doc.createElement('style');
  s.id = 'y3k-travel-css';
  s.textContent = CSS;
  doc.head.appendChild(s);
}
function el(doc, tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

function build(doc, here) {
  const box = el(doc, 'div', 'yt-box');
  const head = el(doc, 'div', 'yt-head');
  const title = el(doc, 'h2', null, 'Travel');
  title.id = 'y3k-travel-title';
  const shut = el(doc, 'button', 'yt-close', '✕');
  shut.type = 'button';
  shut.setAttribute('aria-label', 'Close');
  shut.addEventListener('click', () => closeTravel());
  head.append(title, shut);
  const row = el(doc, 'div', 'yt-row');
  for (const p of PLACES) {
    const isHere = p.id === here;
    const card = el(doc, isHere ? 'div' : 'a', 'yt-place' + (isHere ? ' yt-here' : ''));
    if (!isHere) { card.href = p.url; card.target = '_blank'; card.rel = 'noopener'; }
    else card.setAttribute('aria-current', 'page');
    const words = el(doc, 'span', 'yt-words');
    words.append(el(doc, 'span', 'yt-name', p.name), el(doc, 'span', 'yt-host', p.host), el(doc, 'span', 'yt-line', p.line), el(doc, 'span', 'yt-go', isHere ? 'you are here' : 'go there'));
    card.append(el(doc, 'span', 'yt-star'), words);
    row.appendChild(card);
  }
  box.append(head, row);
  const wrap = el(doc, 'div', 'y3k-travel');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'y3k-travel-title');
  wrap.appendChild(box);
  // a press on the dark around the three closes it
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeTravel(); });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTravel(); return; }
    if (e.key !== 'Tab') return;
    // the keys stay in the screen while it is open
    const f = [...wrap.querySelectorAll('a[href], button')];
    if (!f.length) return;
    const i = f.indexOf(doc.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  return wrap;
}

export function openTravel({ doc = globalThis.document, here = hereOf() } = {}) {
  if (!doc?.body || typeof doc.createElement !== 'function') return null;   // no page to draw it on
  styles(doc);
  if (!root || !root.isConnected) { root = build(doc, here); doc.body.appendChild(root); }
  root.hidden = false;
  back = doc.activeElement;
  (root.querySelector('a[href]') || root.querySelector('button'))?.focus?.();
  return root;
}
export function closeTravel() {
  if (!root) return;
  root.hidden = true;
  try { back?.focus?.(); } catch { /* gone */ }
  back = null;
}
export const travelOpen = () => !!root && !root.hidden;

// a door for a site that has none: three small stars at a corner
export function mountTravelButton({ doc = globalThis.document } = {}) {
  if (!doc?.body || doc.querySelector('.y3k-travel-button')) return null;
  styles(doc);
  const b = el(doc, 'button', 'y3k-travel-button');
  b.type = 'button';
  b.title = 'Travel: airden, yearthreethousand, univispira';
  b.setAttribute('aria-label', b.title);
  const s = el(doc, 'span');
  s.append(el(doc, 'i'), el(doc, 'i'), el(doc, 'i'));
  b.appendChild(s);
  b.addEventListener('click', () => openTravel({ doc }));
  doc.body.appendChild(b);
  return b;
}

// Loaded as a page's own script with ?button=1, it puts its door in; any link to
// #travel on the page opens it too.
try {
  const q = new URL(import.meta.url).searchParams;
  const doc = globalThis.document;
  if (doc && (q.get('button') === '1' || q.get('links') === '1')) {
    const go = () => {
      if (q.get('button') === '1') mountTravelButton({ doc });
      doc.addEventListener('click', (e) => {
        const a = e.target?.closest?.('a[href="#travel"]');
        if (a) { e.preventDefault(); openTravel({ doc }); }
      });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', go); else go();
  }
} catch { /* imported where there is no page */ }
