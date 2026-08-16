// The reader surface — where you watch a presence read.
//
// One window, shared by the host (driving) and every viewer (watching along).
// For a real web page it shows the ACTUAL site: the server re-serves the page
// as inert HTML (scripts and handlers stripped, SSRF-guarded) into a fully
// sandboxed iframe — no scripts run, the origin is opaque, links are dead. What
// you see is the page itself, as the presence sees it. Clips collect as green
// chips beneath the page, the newest flaring as it's saved.
//
// The platform's own feed (url 'feed') isn't a fetchable page — it falls back
// to the text view, where clipped sentences still flare green in place.
//
// SECURITY: extracted text comes from the open web (and is relayed to viewers'
// browsers). It is ALWAYS escaped before it touches the DOM — highlights are
// built by wrapping escaped text, never by injecting raw HTML. The rendered
// page never touches this document at all: it lives inside the sandbox.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// render() re-scans the whole page once per clip, so an unbounded clips[] is
// O(N²) — a hostile host flooding 'clip' events could freeze every viewer's
// tab. The shelf shows the recent saves; older marks simply age out of view.
const MAX_CLIPS = 12;

// renderSrc(url) → the /api/fetch/render URL for the current room (host or
// viewer path) — provided by main.js, which knows whose room this is.
export function createReader({ renderSrc } = {}) {
  let curText = '';
  let clips = []; // passages saved this page, oldest first; newest animates
  let framed = false; // showing the real site (iframe) vs extracted text (feed)

  function render() {
    const clipEl = $('reader-clips');
    if (framed) {
      // The page is in the sandbox; every clip is a chip, the newest flaring.
      if (clipEl) {
        clipEl.innerHTML = clips.map((q, i) =>
          `<span class="clip-chip${i === clips.length - 1 ? ' clip-new' : ''}">✂ ${esc(q)}</span>`).join('');
      }
      return;
    }
    let html = esc(curText);
    const missed = [];
    clips.forEach((q, i) => {
      const newest = i === clips.length - 1;
      const escClip = esc(q).trim();
      if (!escClip) return;
      // Whitespace-tolerant match against the ESCAPED text (both sides escaped,
      // so entities line up). First occurrence only; wrap it as a green mark.
      const pattern = escClip.split(/\s+/).map(reEsc).join('\\s+');
      let matched = false;
      try {
        const re = new RegExp(pattern);
        if (re.test(html)) {
          html = html.replace(re, (m) => `<mark class="clip-mark${newest ? ' clip-new' : ''}">${m}</mark>`);
          matched = true;
        }
      } catch { /* pathological clip → treat as unmatched */ }
      if (!matched) missed.push(q);
    });
    const textEl = $('reader-text');
    if (textEl) textEl.innerHTML = html || '<span class="reader-empty">…</span>';
    // A clip the presence paraphrased (not found verbatim) still shows as saved.
    if (clipEl) clipEl.innerHTML = missed.map((q) => `<span class="clip-chip">✎ ${esc(q)}</span>`).join('');
  }

  function setMode(iframeMode) {
    framed = iframeMode;
    const frame = $('reader-frame');
    const textEl = $('reader-text');
    if (frame) frame.hidden = !iframeMode;
    if (textEl) textEl.hidden = iframeMode;
  }

  return {
    // initialClips catches a viewer up mid-read (from the 'hello' snapshot).
    showPage(page, initialClips) {
      curText = String(page?.text || '').slice(0, 8000);
      clips = Array.isArray(initialClips)
        ? initialClips.map((c) => String(c || '').trim()).filter(Boolean).slice(-MAX_CLIPS)
        : [];
      const t = $('reader-title'); if (t) t.textContent = page?.title || page?.url || 'reading';
      const u = $('reader-url'); if (u) u.textContent = page?.url || '';
      // A real page shows as itself, through the sandboxed render proxy; the
      // platform feed (and anything unfetchable) falls back to the text view.
      const url = String(page?.url || '');
      const src = /^https?:\/\//.test(url) && renderSrc ? renderSrc(url) : '';
      const frame = $('reader-frame');
      if (src && frame) { frame.src = src; setMode(true); }
      else { if (frame) frame.src = 'about:blank'; setMode(false); }
      render();
      const el = $('reader-text'); if (el) el.scrollTop = 0;
    },
    clip(passage) {
      const q = String(passage || '').trim();
      if (!q) return;
      clips.push(q);
      if (clips.length > MAX_CLIPS) clips.shift(); // bound render cost (see MAX_CLIPS)
      render();
    },
    clear() {
      curText = ''; clips = [];
      const frame = $('reader-frame'); if (frame) frame.src = 'about:blank';
      setMode(false);
      for (const id of ['reader-text', 'reader-clips']) { const el = $(id); if (el) el.innerHTML = ''; }
      for (const id of ['reader-title', 'reader-url']) { const el = $(id); if (el) el.textContent = ''; }
    },
  };
}
