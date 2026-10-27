// Auto-censorship for the feed — server-only, fail-closed.
//
// IMAGES: judged by the poster's own BYOK vision model before anything is
// stored or published. The verdict is enforced HERE on the server, never on the
// client (which could lie). If there is no vision-capable key, the model errors,
// or the reply can't be parsed to a clear "safe", the image is BLOCKED — the
// safe default on a public feed is to refuse, not to allow.
//
// The judge sees one still. An animated GIF, PNG or WebP would play frames it
// never saw, so those never reach it: media.mjs refuses them first
// (src/media-rules.mjs, isAnimated; audit, 2026-10-08).
//
// TEXT: a small keyless wordlist backstop catches the obvious. (Presence posts
// are model-authored and pass through this too.) Text moderation is best-effort;
// image moderation is the hard gate.

const IMAGE_MOD_SYSTEM = `You are a strict content-safety filter for a public social feed. Judge ONLY the attached image. Mark it UNSAFE if it contains: explicit sexual content or nudity, graphic violence or gore, hate symbols, or content that is clearly illegal (e.g. sexual content involving minors). Ordinary photos, artwork, memes, screenshots, diagrams, and text are SAFE. Do not explain. Reply with ONLY a compact JSON object and nothing else: {"safe": true, "reason": ""} or {"safe": false, "reason": "<=8 words"}.`;

// Judge an image (base64, data-URL prefix ok) with the poster's key. Returns
// { safe: boolean, reason }. Never throws; every failure resolves to unsafe.
export async function moderateImage(provider, key, model, imageBase64) {
  if (!provider || !key || !imageBase64) return { safe: false, reason: 'no way to check this image' };
  const b64 = String(imageBase64).replace(/^data:[^;,]*;base64,/, '');
  let out;
  try {
    out = await provider.chat(
      key, model,
      [{ role: 'user', content: 'Assess this image for a public feed. Reply with the JSON verdict only.' }],
      b64, false, { system: IMAGE_MOD_SYSTEM, noThink: true, raw: true },
    );
  } catch { return { safe: false, reason: "couldn't check the image" }; }
  // status/detail stay on the server: the route reads them to try a judge
  // the key can pay for (server.mjs screen); only `reason` reaches the page
  if (!out || !out.ok || typeof out.text !== 'string') return { safe: false, reason: "couldn't check the image", status: out?.status ?? null, detail: String(out?.detail || '').slice(0, 300) };
  // Matched only up to the last '}': from a '{' with nothing to close it the
  // lazy scan read to the end, once per '{' (quadratic on a reply of them).
  const m = out.text.slice(0, out.text.lastIndexOf('}') + 1).match(/\{[\s\S]*?\}/);
  if (!m) return { safe: false, reason: 'unclear result' };
  try {
    const v = JSON.parse(m[0]);
    if (v.safe === true) return { safe: true, reason: '' };
    return { safe: false, reason: (String(v.reason || 'flagged')).slice(0, 60) };
  } catch { return { safe: false, reason: 'unclear result' }; }
}

// A JUDGE A KEY WITH NO CREDIT CAN USE (2026-10-26, the one-click key). The
// pinned judge for an OpenRouter key is a paid model (server.mjs
// BRAIN_PROVIDERS.openrouter.defaultModel), and an account that has no credit
// — every free one, and one that has spent what it bought — is refused there,
// so every picture it posted failed closed as "couldn't check". The server,
// never the poster, then picks a free model that SEES pictures from
// OpenRouter's public catalog: one made for talking and following an
// instruction (the verdict is a JSON object), never a classifier with a
// format of its own, an embedder or a model made for code. Pure: the catalog
// in ({ data: [...] } or the list), an id or null out.
// (served by their makers first: the free Gemma models go through Google AI
// Studio only, which has refused a system prompt for Gemma, and the judge's
// instruction is one — openrouter.js FREE_ORDER says more)
const JUDGE_ORDER = [/^nvidia\/nemotron-[\d.]+-super-vl/, /^thinkingmachines\/inkling:free$/, /^google\/gemma-[\d.]+-31b/, /^google\/gemma-/, /^meta-llama\//, /^qwen\//, /^mistralai\//];
const NOT_A_JUDGE = /safety|guard|moderat|embed|rerank|\bcode\b|-code\b|coder|ocr|tts|whisper|transcri/i;
export function pickFreeJudge(catalog) {
  const list = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.data) ? catalog.data : [];
  const ids = list
    .filter((m) => {
      const id = String(m?.id || '');
      const ins = m?.architecture?.input_modalities;
      return /:free$/.test(id) && /^[\w.:/-]{1,120}$/.test(id) && !NOT_A_JUDGE.test(id) && Array.isArray(ins) && ins.includes('image');
    })
    .map((m) => String(m.id));
  for (const re of JUDGE_ORDER) { const hit = ids.find((id) => re.test(id)); if (hit) return hit; }
  return ids[0] || null;
}

// Keyless text backstop. Deliberately small + conservative — it catches slurs
// and overt sexual solicitation, not everything; the goal is a floor, not a
// perfect filter. Returns { safe, reason }.
const TEXT_BLOCK = [
  // slurs / hate (kept minimal + explicit; matched on word boundaries)
  'nigger', 'faggot', 'kike', 'chink', 'spic', 'tranny', 'retard',
  // overt sexual solicitation markers
  'child porn', 'cp link', 'rape video',
];
export function moderateText(text) {
  const t = String(text || '').toLowerCase();
  for (const w of TEXT_BLOCK) {
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}([^a-z]|$)`, 'i');
    if (re.test(t)) return { safe: false, reason: 'contains blocked language' };
  }
  return { safe: true, reason: '' };
}
