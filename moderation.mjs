// Auto-censorship for the feed — server-only, fail-closed.
//
// IMAGES: judged by the poster's own BYOK vision model before anything is
// stored or published. The verdict is enforced HERE on the server, never on the
// client (which could lie). If there is no vision-capable key, the model errors,
// or the reply can't be parsed to a clear "safe", the image is BLOCKED — the
// safe default on a public feed is to refuse, not to allow.
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
  if (!out || !out.ok || typeof out.text !== 'string') return { safe: false, reason: "couldn't check the image" };
  const m = out.text.match(/\{[\s\S]*?\}/);
  if (!m) return { safe: false, reason: 'unclear result' };
  try {
    const v = JSON.parse(m[0]);
    if (v.safe === true) return { safe: true, reason: '' };
    return { safe: false, reason: (String(v.reason || 'flagged')).slice(0, 60) };
  } catch { return { safe: false, reason: 'unclear result' }; }
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
