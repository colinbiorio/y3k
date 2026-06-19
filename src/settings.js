// Settings panel with a Voice section:
//   - "Choose a voice": the browser fallback + ElevenLabs library voices, each
//      auditionable, click to select.
//   - "Describe a voice": type a description -> design 3 previews -> save one as
//      a reusable voice and select it.
//   - Delivery sliders (stability, speed).
// The active selection persists in localStorage and is read by main.js per reply.

import { getBrainConfig, setBrainConfig } from './brain.js';
import { getVoiceKey, setVoiceKey } from './voice.js';

const KEY = 'y3k.voice';
const SAMPLE = 'Hello. I am Y3K. This is what I sound like.';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Brain key → provider, by prefix (mirrors the server's detection).
function detectProviderLocal(key) {
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}
const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI' };
function pickDefaultModel(prov, models) {
  const ids = models.map((m) => m.id);
  if (prov === 'anthropic') return ids.find((id) => id.includes('opus-4-8')) || ids.find((id) => id.includes('sonnet-4-6')) || ids[0];
  return ids.find((id) => /gpt-4o-mini/.test(id)) || ids.find((id) => /gpt-4o/.test(id)) || ids[0];
}
// Send the visitor's ElevenLabs key (if any) with every voice request.
const vKeyHeader = () => { const k = getVoiceKey(); return k ? { 'x-voice-key': k } : {}; };

export function createSettings() {
  const modal = $('settings');
  const bodyEl = $('settings-body');
  let built = false;
  let currentSample = null; // the one audition/preview clip currently playing

  function getActive() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { voiceId: 'browser', settings: {} }; }
    catch { return { voiceId: 'browser', settings: {} }; }
  }
  function setActive(a) { localStorage.setItem(KEY, JSON.stringify(a)); }

  function selectVoice(id) {
    const a = getActive();
    a.voiceId = id;
    setActive(a);
    document.querySelectorAll('.voice-row').forEach((r) => r.classList.toggle('on', r.dataset.id === id));
  }

  function voiceRow(container, v) {
    const active = getActive();
    const row = document.createElement('div');
    row.className = 'voice-row' + (active.voiceId === v.id ? ' on' : '');
    row.dataset.id = v.id;
    const meta = v.labels ? [v.labels.gender, v.labels.accent, v.labels.age, v.labels.description].filter(Boolean).join(' · ') : '';
    row.innerHTML =
      `<span class="dot"></span><span class="vname">${esc(v.name)}</span><span class="vmeta">${esc(meta)}</span>` +
      (v.id === 'browser' ? '' : '<button class="play" title="Play sample">▶</button>');
    row.addEventListener('click', (e) => { if (!e.target.classList.contains('play')) selectVoice(v.id); });
    const play = row.querySelector('.play');
    if (play) play.addEventListener('click', (e) => { e.stopPropagation(); sample(v.id, play); });
    container.appendChild(row);
  }

  // Only one audition plays at a time; stop the previous before starting another.
  function playExclusive(audio) {
    if (currentSample && currentSample !== audio) { try { currentSample.pause(); } catch { /* ignore */ } }
    currentSample = audio;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  async function sample(id, btn) {
    if (id === 'browser') {
      if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(SAMPLE));
      return;
    }
    btn.disabled = true;
    try {
      const r = await fetch('/api/voice/tts', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ text: SAMPLE, voiceId: id, settings: getActive().settings }),
      });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      const done = () => URL.revokeObjectURL(url); // free the blob whether it ends or errors
      a.onended = done;
      a.onerror = done;
      playExclusive(a);
    } catch { /* ignore sample failure */ }
    btn.disabled = false;
  }

  async function onDesign() {
    const desc = $('voice-desc').value.trim();
    const out = $('voice-previews');
    if (desc.length < 20) { out.innerHTML = '<div class="muted">Write at least 20 characters describing the voice.</div>'; return; }
    const btn = $('voice-design-btn');
    btn.disabled = true; btn.textContent = 'Generating…';
    out.innerHTML = '<div class="muted">Designing voices — this takes a few seconds.</div>';
    try {
      const d = await fetch('/api/voice/design', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ description: desc }),
      }).then((r) => r.json());
      const previews = d.previews || [];
      out.innerHTML = previews.length ? '' : '<div class="muted">No previews returned. Try a different description.</div>';
      previews.forEach((p, i) => {
        const el = document.createElement('div');
        el.className = 'preview';
        el.innerHTML = `<button class="play">▶ Preview ${i + 1}</button><button class="btn small use">Use this</button>`;
        const audio = new Audio('data:' + (p.media_type || 'audio/mpeg') + ';base64,' + p.audio_base_64);
        el.querySelector('.play').addEventListener('click', () => playExclusive(audio));
        el.querySelector('.use').addEventListener('click', () => saveVoice(p.generated_voice_id, desc, el));
        out.appendChild(el);
      });
    } catch {
      out.innerHTML = '<div class="muted">Design failed. Try again.</div>';
    }
    btn.disabled = false; btn.textContent = 'Generate voices';
  }

  async function saveVoice(generatedVoiceId, desc, el) {
    const use = el.querySelector('.use');
    use.disabled = true; use.textContent = 'Saving…';
    const name = desc.split(/\s+/).slice(0, 4).join(' ') || 'Custom voice';
    try {
      const r = await fetch('/api/voice/save', {
        method: 'POST', headers: { 'content-type': 'application/json', ...vKeyHeader() },
        body: JSON.stringify({ generatedVoiceId, name, description: desc }),
      }).then((x) => x.json());
      if (r.voice_id) {
        voiceRow($('voice-list'), { id: r.voice_id, name, labels: { description: 'designed' } });
        selectVoice(r.voice_id);
        use.textContent = 'Saved ✓ — selected';
      } else { use.textContent = 'Failed'; use.disabled = false; }
    } catch { use.textContent = 'Failed'; use.disabled = false; }
  }

  async function build() {
    bodyEl.innerHTML =
      '<div class="sec"><h3>Brain</h3>' +
        '<div class="muted">Use your own AI key (Anthropic or OpenAI). It is stored only in this browser and sent to your provider through this site — never saved on the server. Leave blank to use the site default.</div>' +
        '<input id="brain-key" type="password" placeholder="Paste API key (sk-ant-… or sk-…)" autocomplete="off" spellcheck="false" />' +
        '<div id="brain-status" class="muted"></div>' +
        '<div class="row" id="brain-model-row" hidden><span>Model</span><select id="brain-model"></select></div>' +
        '<button id="brain-clear" class="btn small" hidden>Clear key</button>' +
      '</div>' +
      '<div class="sec"><h3>Voice</h3>' +
        '<div class="muted">Optional: paste an ElevenLabs key for human &amp; described voices (stored only in this browser). Without one, Y3K uses the browser voice.</div>' +
        '<input id="voice-key" type="password" placeholder="ElevenLabs API key" autocomplete="off" spellcheck="false" />' +
        '<div id="voice-status" class="muted"></div></div>' +
      '<div class="sec"><h4>Choose a voice</h4><div id="voice-list" class="voice-list"></div></div>' +
      '<div class="sec" id="design-sec"><h4>Describe a voice</h4>' +
        '<textarea id="voice-desc" rows="3" placeholder="e.g. a warm, unhurried voice, late-20s, faintly synthetic with a soft electronic shimmer"></textarea>' +
        '<button id="voice-design-btn" class="btn">Generate voices</button>' +
        '<div id="voice-previews" class="previews"></div>' +
      '</div>' +
      '<div class="sec"><h4>Delivery</h4>' +
        '<label class="slider">Stability <input id="set-stability" type="range" min="0" max="1" step="0.05"></label>' +
        '<label class="slider">Speed <input id="set-speed" type="range" min="0.7" max="1.2" step="0.05"></label>' +
      '</div>';

    const active = getActive();
    $('set-stability').value = active.settings?.stability ?? 0.5;
    $('set-speed').value = active.settings?.speed ?? 1.0;
    const saveSliders = () => {
      const a = getActive();
      a.settings = { ...a.settings, stability: parseFloat($('set-stability').value), speed: parseFloat($('set-speed').value) };
      setActive(a);
    };
    $('set-stability').addEventListener('input', saveSliders);
    $('set-speed').addEventListener('input', saveSliders);

    // --- Brain (BYOK): detect provider from the key, list its live models ---
    const keyEl = $('brain-key');
    const bStatus = $('brain-status');
    const modelRow = $('brain-model-row');
    const modelSel = $('brain-model');
    const clearBtn = $('brain-clear');

    async function applyKey(raw, preferModel) {
      const key = raw.trim();
      if (!key) { bStatus.textContent = 'Using the site default brain.'; modelRow.hidden = true; clearBtn.hidden = true; setBrainConfig(null); return; }
      clearBtn.hidden = false;
      const prov = detectProviderLocal(key);
      if (!prov) { bStatus.textContent = 'Unrecognized key format (expected sk-ant-… or sk-…).'; modelRow.hidden = true; setBrainConfig(null); return; }
      bStatus.textContent = `${PROVIDER_LABEL[prov]} key detected — loading models…`;
      try {
        const d = await fetch('/api/brain/models', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, provider: prov }),
        }).then((r) => r.json());
        if (!d.models || !d.models.length) {
          bStatus.textContent = d.error || 'No usable models for this key.';
          modelRow.hidden = true;
          if (preferModel) setBrainConfig({ provider: prov, key, model: preferModel }); else setBrainConfig(null);
          return;
        }
        modelSel.innerHTML = '';
        d.models.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; modelSel.appendChild(o); });
        modelSel.value = (preferModel && d.models.some((m) => m.id === preferModel)) ? preferModel : pickDefaultModel(prov, d.models);
        modelRow.hidden = false;
        bStatus.textContent = `${PROVIDER_LABEL[prov]} — your replies now use your key (${modelSel.value}).`;
        setBrainConfig({ provider: prov, key, model: modelSel.value });
      } catch {
        bStatus.textContent = 'Could not reach the model list.';
        if (preferModel) setBrainConfig({ provider: prov, key, model: preferModel }); else setBrainConfig(null);
      }
    }

    let keyTimer;
    keyEl.addEventListener('input', () => { clearTimeout(keyTimer); keyTimer = setTimeout(() => applyKey(keyEl.value), 500); });
    modelSel.addEventListener('change', () => {
      const prov = detectProviderLocal(keyEl.value.trim());
      setBrainConfig({ provider: prov, key: keyEl.value.trim(), model: modelSel.value });
      bStatus.textContent = `${PROVIDER_LABEL[prov] || ''} — using ${modelSel.value}.`;
    });
    clearBtn.addEventListener('click', () => { keyEl.value = ''; applyKey(''); });

    const savedBrain = getBrainConfig();
    if (savedBrain) { keyEl.value = savedBrain.key; applyKey(savedBrain.key, savedBrain.model); }

    // --- Voice (BYOK key + live list) ---
    $('voice-design-btn').addEventListener('click', onDesign); // design-sec is unclickable until a key resolves

    async function loadVoiceList() {
      const list = $('voice-list');
      list.innerHTML = '';
      voiceRow(list, { id: 'browser', name: 'Browser voice (free, robotic)' });
      const status = $('voice-status');
      let data = { available: false, voices: [] };
      try { data = await fetch('/api/voice/list', { headers: vKeyHeader() }).then((r) => r.json()); } catch { /* offline */ }
      if (!data.available) {
        status.innerHTML = data.error
          ? 'That ElevenLabs key was not accepted — check it.'
          : 'Paste an <code>ElevenLabs</code> key above (or set one on the server) to unlock human &amp; described voices.';
        $('design-sec').classList.add('disabled');
        return;
      }
      status.textContent = 'Pick a voice, or describe your own below.';
      $('design-sec').classList.remove('disabled');
      data.voices.forEach((v) => voiceRow(list, v));
    }

    const voiceKeyEl = $('voice-key');
    voiceKeyEl.value = getVoiceKey();
    let vkTimer;
    voiceKeyEl.addEventListener('input', () => {
      clearTimeout(vkTimer);
      vkTimer = setTimeout(() => { setVoiceKey(voiceKeyEl.value.trim()); loadVoiceList(); }, 500);
    });

    await loadVoiceList();
  }

  // Re-read persisted state into the controls (selection + sliders) on reopen.
  function syncFromState() {
    const a = getActive();
    const stab = $('set-stability');
    const spd = $('set-speed');
    if (stab) stab.value = a.settings?.stability ?? 0.5;
    if (spd) spd.value = a.settings?.speed ?? 1.0;
    document.querySelectorAll('.voice-row').forEach((r) => r.classList.toggle('on', r.dataset.id === a.voiceId));
  }

  function open() { modal.hidden = false; if (!built) { build(); built = true; } else { syncFromState(); } }
  function close() { modal.hidden = true; }

  $('gear').addEventListener('click', open);
  $('settings-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  return { open, close, getActive };
}
