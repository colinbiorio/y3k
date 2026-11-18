// KOKORO, A FREE VOICE THAT LIVES ON THIS DEVICE (Colin, 18 Nov 2026: "kokoro
// free yes"; asked that day: "it'd be nice not to have to resort to an api key
// if not needed").
//
// Kokoro-82M (hexgrad, Apache-2.0) is a small open speech model. Here it runs
// in the person's own browser (src/kokoro-worker.js, kokoro-js 1.2.1 and its
// ONNX runtime from src/vendor): no key, no account, and the words it speaks
// never leave the device. What leaves, once, is a download: the model and its
// voices from Hugging Face into this browser's cache (about 92 MB for the
// processor, 326 MB for the graphics card, measured 18 Nov 2026), asked for by
// the person's own press in Settings → Voice and said in its size first.
//
// Where the browser has WebGPU the model runs on the graphics card at full
// precision (fast enough to keep ahead of its own speech); elsewhere on the
// processor, 8-bit (slower: the browser voice answers while it thinks). A voice
// chosen here is saved as 'kokoro:<voice>' (voice.js speaks it; settings.js
// lists them). One worker for the page, made on first need.

export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const HF = `https://huggingface.co/${KOKORO_MODEL}/resolve/main/`;
// the model file each kind reads, and its size in MB (Hugging Face's x-linked-size, 18 Nov 2026)
export const KINDS = {
  fp32: { file: 'onnx/model.onnx', mb: 326, device: 'webgpu' },
  q8: { file: 'onnx/model_quantized.onnx', mb: 92, device: 'wasm' },
};
// The voices worth hearing first, best first (Kokoro's own grades), with what
// the Voice pane says of each. The first letter is its English: a = American,
// b = British; the second, f or m.
export const KOKORO_VOICES = [
  ['af_heart', 'Heart'], ['af_bella', 'Bella'], ['af_nicole', 'Nicole'], ['af_aoede', 'Aoede'], ['af_kore', 'Kore'],
  ['af_sarah', 'Sarah'], ['am_michael', 'Michael'], ['am_fenrir', 'Fenrir'], ['am_puck', 'Puck'],
  ['bf_emma', 'Emma'], ['bf_isabella', 'Isabella'], ['bm_george', 'George'], ['bm_fable', 'Fable'],
].map(([id, name]) => ({ id, name, accent: id[0] === 'b' ? 'British' : 'American', gender: id[1] === 'f' ? 'female' : 'male' }));
export const KOKORO_DEFAULT = 'af_heart';
const STORE = 'y3k.kokoro';   // { kind, at }: downloaded once, in this browser

// 'kokoro:af_heart' → 'af_heart'; anything else → null
export function kokoroVoiceOf(voiceId) {
  const m = /^kokoro:([a-z]{2}_[a-z]+)$/.exec(String(voiceId || ''));
  return m ? m[1] : null;
}
// Which kind this browser can run: the graphics card's, or the processor's.
export async function pickKind(gpu = globalThis.navigator?.gpu) {
  try { if (gpu && (await gpu.requestAdapter())) return 'fp32'; } catch { /* no adapter */ }
  return 'q8';
}
export function sizeLine(kind) {
  const k = KINDS[kind] || KINDS.q8;
  return `about ${k.mb} MB, once, for ${k.device === 'webgpu' ? 'this computer\'s graphics card' : 'this device\'s processor'}`;
}

// The samples, as a WAV a plain <audio> can play (16-bit, mono).
export function toWav(samples, rate = 24000) {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

export function createKokoro({ makeWorker = () => new Worker(new URL('./kokoro-worker.js', import.meta.url), { type: 'module' }),
  store = globalThis.localStorage, gpu = globalThis.navigator?.gpu } = {}) {
  let worker = null, state = 'none', kind = null, error = '', loading = null, seq = 0;
  const waiting = new Map();   // id → { resolve, reject }
  const watchers = new Set();  // progress and state, for the Voice pane
  const tell = (m) => { for (const fn of watchers) { try { fn(m); } catch { /* the pane's own trouble */ } } };
  const kept = () => { try { return JSON.parse(store?.getItem(STORE) || 'null'); } catch { return null; } };
  function onMessage(e) {
    const m = e.data || {};
    if (m.type === 'progress') tell({ type: 'progress', loaded: m.loaded, total: m.total, file: m.file });
    else if (m.type === 'audio') { const w = waiting.get(m.id); waiting.delete(m.id); w?.resolve({ audio: m.audio, rate: m.rate }); }
    else if (m.type === 'error' && m.id != null) { const w = waiting.get(m.id); waiting.delete(m.id); w?.reject(new Error(m.message)); }
  }
  // Load it (from the cache if it was downloaded here before): resolves when it can speak.
  function ensure() {
    if (state === 'ready') return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      kind = kind || kept()?.kind || await pickKind(gpu);
      state = 'loading'; error = ''; tell({ type: 'state', state });
      worker = worker || makeWorker();
      worker.onmessage = onMessage;
      const ok = await new Promise((resolve) => {
        const first = (e) => {
          const m = e.data || {};
          if (m.type === 'ready') resolve(true);
          else if (m.type === 'error' && m.id == null) { error = m.message || 'it did not load'; resolve(false); }
          else onMessage(e);
        };
        worker.onmessage = first;
        worker.onerror = (e) => { error = String(e?.message || 'the worker did not start'); resolve(false); };
        worker.postMessage({ type: 'load', device: KINDS[kind].device, dtype: kind });
      });
      worker.onmessage = onMessage;
      if (ok) { state = 'ready'; try { store?.setItem(STORE, JSON.stringify({ kind, at: Date.now() })); } catch { /* private window */ } }
      else {
        state = 'error';
        // the graphics card would not take it: the processor's, once
        if (kind === 'fp32') { kind = 'q8'; loading = null; tell({ type: 'state', state: 'retry' }); try { worker.terminate(); } catch { /* gone */ } worker = null; return ensure(); }
      }
      tell({ type: 'state', state, error });
      loading = null;
      return ok;
    })();
    return loading;
  }
  // One text in one voice: { audio: Float32Array, rate }.
  async function say(text, voice = KOKORO_DEFAULT, speed = 1) {
    if (!(await ensure())) throw new Error(error || 'Kokoro is not loaded');
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ type: 'say', id, text: String(text || ''), voice, speed });
    });
  }
  return {
    ensure, say,
    // downloaded here before: the cache holds it, and it loads without asking
    downloaded: () => !!kept(),
    ready: () => state === 'ready',
    state: () => state,
    error: () => error,
    kind: async () => kind || kept()?.kind || pickKind(gpu),
    watch: (fn) => { watchers.add(fn); return () => watchers.delete(fn); },
  };
}

// The page's one Kokoro (voice.js and settings.js share it).
let shared = null;
export function kokoro() { return (shared ||= createKokoro()); }
export const HF_BASE = HF;
