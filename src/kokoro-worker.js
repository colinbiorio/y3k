// KOKORO'S OWN THREAD (src/kokoro.js says why). The model is loaded and
// every sentence is spoken here, off the page's thread: a sentence on the
// CPU takes a second or more of work, and on the page's thread the orb
// would stand still for it. Messages in:
//   { type: 'load', device, dtype }              → progress …, then ready | error
//   { type: 'say', id, text, voice, speed }      → audio | error (one at a time, in order)
// The library and its runtime are this site's own copies (src/vendor: no
// third party in script-src); only the model and the voices come from
// Hugging Face, once, into this browser's cache.
import { KokoroTTS, env } from './vendor/kokoro-js@1.2.1/kokoro.web.js';

env.wasmPaths = new URL('./vendor/transformers@3.5.1/', import.meta.url).href;

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let queue = Promise.resolve();
const say = (m) => self.postMessage(m);

// A long text is spoken in pieces the model can take (it reads about 500
// tokens at most), cut at sentences, and joined again.
function pieces(text, max = 360) {
  const out = [];
  let cur = '';
  for (const s of String(text).match(/[^.!?…]+[.!?…]*\s*/g) || [String(text)]) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
    cur += s;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function load({ device, dtype }) {
  try {
    tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype, device,
      progress_callback: (p) => { if (p && p.status === 'progress') say({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0 }); },
    });
    // one word first, thrown away: on the graphics card the first sentence also
    // builds its shaders (4.4 s for the first, 1.6 s for the next, measured on an
    // M2), and that wait belongs to the load, not to the first thing it says
    await tts.generate('Hi.', { voice: 'af_heart' }).catch(() => {});
    say({ type: 'ready', device, dtype, voices: Object.keys(tts.voices || {}) });
  } catch (e) {
    tts = null;
    say({ type: 'error', message: String(e?.message || e).slice(0, 300) });
  }
}

async function speak({ id, text, voice, speed }) {
  try {
    if (!tts) throw new Error('not loaded');
    const parts = pieces(text);
    const chunks = [];
    let rate = 24000;
    for (const p of parts) {
      const a = await tts.generate(p, { voice, speed: speed || 1 });
      chunks.push(a.audio);
      rate = a.sampling_rate || rate;
    }
    const n = chunks.reduce((t, c) => t + c.length, 0);
    const audio = new Float32Array(n);
    let at = 0;
    for (const c of chunks) { audio.set(c, at); at += c.length; }
    self.postMessage({ type: 'audio', id, audio, rate }, [audio.buffer]);
  } catch (e) {
    say({ type: 'error', id, message: String(e?.message || e).slice(0, 300) });
  }
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'load') queue = queue.then(() => load(m));
  else if (m.type === 'say') queue = queue.then(() => speak(m));
};
