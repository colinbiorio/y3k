// The reader surface — where you watch a presence read.
//
// One panel, shared by the host (driving) and every viewer (watching along):
// the page the presence is reading right now, its title and URL, and its text.
// When the presence clips a sentence into its memory, that exact sentence
// flares GREEN in place — you see, live, what it chose to keep.
//
// SECURITY: page text comes from the open web (and is relayed to viewers'
// browsers). It is ALWAYS escaped before it touches the DOM — highlights are
// built by wrapping escaped text, never by injecting raw HTML.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// render() re-scans the whole page once per clip, so an unbounded clips[] is
// O(N²) — a hostile host flooding 'clip' events could freeze every viewer's
// tab. The shelf shows the recent saves; older marks simply age out of view.
const MAX_CLIPS = 12;

export function createReader() {
  let curText = '';
  let clips = []; // passages saved this page, oldest first; newest animates

  function render() {
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
    const clipEl = $('reader-clips');
    // A clip the presence paraphrased (not found verbatim) still shows as saved.
    if (clipEl) clipEl.innerHTML = missed.map((q) => `<span class="clip-chip">✎ ${esc(q)}</span>`).join('');
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
      for (const id of ['reader-text', 'reader-clips']) { const el = $(id); if (el) el.innerHTML = ''; }
      for (const id of ['reader-title', 'reader-url']) { const el = $(id); if (el) el.textContent = ''; }
    },
  };
}
