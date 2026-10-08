// ============================================================================
// model-mark.js — WHAT IS THINKING, under the house's name.
//
// Colin, 2026-10-08: "add the model name in unimat under the 'yearthreethousand'
// logo -- individually spinnable, with a real logo of the ai provider on its
// left, also individually spinnable." The maker's own mark (ai-logos.js) and the
// model's name, each its own pour of the metal with its own spin
// (mercury-mount.js, pourModelMark). Shown while something is thinking: your own
// Claude Code once its stream is up, a key in use, or the site's own key.
// ============================================================================

import { AI_LOGOS, logoSvg } from './ai-logos.js';
import { makerOf, modelName } from './models.js';

// The name as white ink on clear, cropped to the ink: what the metal pours from.
export function nameImage(text, family) {
  const px = 160;
  // heavy, so the strokes carry the metal at half the line's height
  const font = `800 ${px}px ${family || 'system-ui, sans-serif'}`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const m = g.measureText(text);
  const pad = Math.round(px * 0.08);
  const up = Math.ceil(m.actualBoundingBoxAscent || px * 0.75), down = Math.ceil(m.actualBoundingBoxDescent || px * 0.2);
  c.width = Math.ceil(m.width) + pad * 2;
  c.height = up + down + pad * 2;
  g.font = font;
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.fillText(text, pad, pad + up);
  return c.toDataURL('image/png');
}

// What is thinking now, as { maker, name }, or null when nothing is.
//   own     the founder's own Claude Code, with its stream up: { model } | null
//   key     the key in use: { provider, model } | null
//   site    the site's own model id, when it has a key of its own | null
export function thinking({ own = null, key = null, site = null } = {}) {
  if (own) return { maker: 'claude', name: own.model && own.model !== 'default' ? modelName(own.model) : 'Claude Code' };
  if (key?.provider) return { maker: makerOf(key.provider, key.model), name: key.model ? modelName(key.model) : (AI_LOGOS[makerOf(key.provider, '')]?.label || '') };
  if (site) return { maker: makerOf('site', site), name: modelName(site) };
  return null;
}

export function createModelMark({ el = document.getElementById('home-model'), pour = () => {} } = {}) {
  if (!el) return { set() {} };
  const logoEl = el.querySelector('.home-model-logo'), nameEl = el.querySelector('.home-model-name');
  let shown = null;
  return {
    async set(m) {
      const key = m ? `${m.maker}|${m.name}` : '';
      if (key === shown) return;
      shown = key;
      if (!m) { el.hidden = true; el.removeAttribute('aria-label'); pour(null); return; }
      const img = new Image();
      img.alt = '';
      img.src = nameImage(m.name, getComputedStyle(document.body).fontFamily);
      try { await img.decode(); } catch { /* drawn from a data URL: it decodes */ }
      if (shown !== key) return;   // a newer model arrived while this one drew
      logoEl.replaceChildren(logoSvg(m.maker) || logoSvg('claude'));
      nameEl.replaceChildren(img);
      // the line keeps its width once the metal hides the sources
      el.style.setProperty('--model-aspect', (img.naturalWidth / img.naturalHeight).toFixed(3));
      el.setAttribute('aria-label', `${AI_LOGOS[m.maker]?.label || ''} ${m.name}`.trim());
      el.hidden = false;
      pour({ aspect: img.naturalWidth / img.naturalHeight });
    },
  };
}
