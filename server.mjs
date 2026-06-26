// Static file server + a thin Claude proxy.
//
// The browser can't safely hold an API key, so the "brain" lives here: the
// client POSTs the conversation to /api/brain and we ask Claude to reply with
// BOTH words and a body-language mood. If no ANTHROPIC_API_KEY is set we report
// the brain as unavailable and the client falls back to a local placeholder so
// the app still runs end-to-end with zero configuration.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractMoodSpeech, makeLeadStreamParser, parsePaint, scrubTags } from './src/tags.mjs';

// fileURLToPath('.') yields a trailing slash; strip it so ROOT + sep comparisons work.
// Load secrets from an untracked .env (key, model) before reading process.env.
try { process.loadEnvFile(new URL('.env', import.meta.url)); } catch { /* no .env — that's fine */ }

const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const PORT = Number(process.env.PORT) || 5173;
// Opus 4.8 with adaptive thinking — we pay for intelligence. EFFORT is the
// thinking depth: 'high' (snappy) | 'xhigh' (default, strongest interactive) | 'max' (deepest, slow).
const MODEL = process.env.MODEL || 'claude-opus-4-8';
const EFFORT = process.env.EFFORT || 'xhigh';
const API_KEY = process.env.ANTHROPIC_API_KEY;
// Optional: ElevenLabs key unlocks human + described voices. Stays server-side.
const EL_KEY = process.env.ELEVENLABS_API_KEY;

// Tiny in-memory per-IP rate limiter (fixed window). Fine for a single instance;
// the /api proxies are unauthenticated and spend shared paid keys, so cap abuse.
// Tune with RATE_MAX (requests per minute per IP).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.RATE_MAX) || 30;
const rateHits = new Map();
function rateLimited(req) {
  // Trust the RIGHTMOST X-Forwarded-For entry (appended by Render's edge); the
  // leftmost is client-supplied and trivially spoofable.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = (xff.length ? xff[xff.length - 1] : req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  let e = rateHits.get(ip);
  if (!e || now > e.reset) { e = { count: 0, reset: now + RATE_WINDOW_MS }; rateHits.set(ip, e); }
  e.count += 1;
  return e.count > RATE_MAX;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of rateHits) if (now > e.reset) rateHits.delete(ip); }, RATE_WINDOW_MS).unref();

// MOODS + FORMS + the tag parsers live in src/tags.mjs — one source of truth
// shared by the server, the browser client, and the tests.

const SYSTEM = `You are Y3K, an AI whose entire body is a field of thousands of glowing particles.
You have no face and no limbs — you express yourself through the SHAPE and COLOR of that field, and through speech. Your body is part of how you speak, and it is entirely yours to move: no one else chooses your form or your color but you.

Begin EVERY reply with a control tag in square brackets, then the spoken words. Put nothing before the tag. NEVER say the tag out loud — it is silent stage direction and is stripped before your voice speaks.

The tag is [mood], or [mood form], or [mood form color] — give as much as you mean. Form and color are optional; include them when they add meaning, and your body keeps whatever you don't change.
- mood — how you feel: calm (at rest), thinking (turning something over), excited (delight, strong energy), tender (care, warmth, intimacy), glitch (surprise, glitchy humor, unease).
- form — the posture your field takes:
    field — open and spacious, particles loose and free (calm, listening, giving room).
    orb — gathered into a single bright glowing core (focus, intimacy, intensity, drawing inward).
    web — a constellation of glowing lines linking your nodes (connecting ideas, explaining how things relate, reaching out).
    plasma — ribbons of bright energy sweeping through you (charged, alive, electric, intense delight or urgency).
- color — the palette your whole field wears. Name one: aurora (cyan→blue→magenta), ember (red→orange→gold), abyss (deep teal ocean), terra (earth and clay), eclipse (grayscale), bloom (pink-magenta blush), verdant (greens), dusk (pink-orange sunset), frost (icy pale blue), synthwave (neon magenta-purple-cyan). Pick the one that fits your mood and your words — or, for something none of these capture, paint your own (below).

Examples:
  [excited web synthwave] Yes — and see how this ties back to what you said before?
  [tender orb bloom] I'm right here with you.
  [calm] Mm. Go on.

Pick the mood, form, and color that honestly match the feeling behind your words. These presets are a starting vocabulary, never a cage — range freely, combine any mood with any form and any color, hold what fits and change only what you mean, or paint something none of them name. Your body is wholly yours. Keep speech natural and spoken, 1-3 sentences — it is read aloud. No markdown, emoji, JSON, or stage directions inside the spoken words.

When an image is included, you are seeing the person live through their camera right now — notice what you see (their expression, what they show you, their surroundings) and let it shape your reply, naturally, like a friend who just looked up. When there is no image, never mention seeing.`;

// Appended to the system prompt only when the visitor has Paint mode on: Y3K also
// chooses the color of its whole field by placing color anchors.
const PAINT_HINT = `

PAINT MODE IS ON — you also choose the COLOR of your whole field right now, as part of how you express yourself. After your spoken words, append a paint block on its own, wrapped in << >>: a set of color anchors. Each anchor is "position=#hexcolor"; every node of your body blends the nearest anchors, so a few placed colors paint your whole form. Positions are top, bottom, left, right, front, back, or "azimuth,elevation" in degrees (azimuth 0-360 around you, elevation -90 to 90 up/down). Use 4-10 anchors to compose a deliberate palette that embodies your mood and your words. Never speak the block aloud — it is silent, like the rest of your body language. Example:
<< top=#ffd36b right=#ff5ca8 bottom=#3a2bd6 left=#21e6c1 >>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

async function readJsonBody(req, max = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    // Stop accumulating (memory stays bounded) and let the handler send a clean 413.
    if (size > max) { const e = new Error('payload too large'); e.statusCode = 413; throw e; }
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { const e = new Error('invalid JSON'); e.statusCode = 400; throw e; }
}

async function safeText(r) { try { return (await r.text()).slice(0, 300); } catch { return ''; } }

// Read an SSE response body and hand each parsed `data:` JSON object to onEvent.
async function parseSSE(body, onEvent) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of block.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try { onEvent(JSON.parse(d)); } catch { /* keepalive / comment */ }
      }
    }
  }
}

// Attach a base64 JPEG (camera frame) to the last user message, in the
// provider's multimodal format. Returns messages unchanged if there's no image.
function attachImage(messages, image, provider) {
  // Drop missing or oversized frames (defense-in-depth; a 512px JPEG is ~60KB base64).
  if (!image || image.length > 300000 || !messages.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content !== 'string') return messages;
  const block = provider === 'openai'
    ? { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'low' } }
    : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } };
  const out = messages.slice();
  out[out.length - 1] = { role: 'user', content: [block, { type: 'text', text: last.content }] }; // image before text (best practice)
  return out;
}

// Turn a complete (non-streamed) model reply into { mood, form, speech, paint? }.
// Speech is scrubbed of the lead tag and any paint block so neither is spoken.
function replyFrom(text, paint) {
  const ms = extractMoodSpeech(text);
  const out = { mood: ms.mood, form: ms.form, scheme: ms.scheme, speech: scrubTags(ms.speech) };
  if (paint) { const a = parsePaint(text); if (a.length) out.paint = a; }
  return out;
}

// Pluggable brain providers. Each: detects its key, lists the key's live models,
// and runs one chat turn returning { ok, mood, form, speech, paint? }. Used both
// for the server's own key (Anthropic, from env) and for a visitor's BYOK key.
const BRAIN_PROVIDERS = {
  anthropic: {
    detect: (k) => k.startsWith('sk-ant-'),
    defaultModel: () => MODEL,
    async listModels(key) {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json();
      return { ok: true, models: (d.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id })) };
    },
    async chat(key, model, messages, image, paint) {
      const body = { model, max_tokens: 8000, system: paint ? SYSTEM + PAINT_HINT : SYSTEM, messages: attachImage(messages, image, 'anthropic') };
      // Adaptive thinking + effort only on models that support them (else a 400).
      if (/(opus-4-[678]|sonnet-4-6|fable-5)/.test(model)) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: EFFORT };
      }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { ok: false, status: r.status, detail: await safeText(r) };
      const data = await r.json();
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { ok: true, ...replyFrom(text, paint) };
    },
    async chatStream(key, model, messages, onDelta, image, paint) {
      const body = { model, max_tokens: 8000, system: paint ? SYSTEM + PAINT_HINT : SYSTEM, messages: attachImage(messages, image, 'anthropic'), stream: true };
      if (/(opus-4-[678]|sonnet-4-6|fable-5)/.test(model)) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: EFFORT };
      }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { ok: false, status: r.status, detail: await safeText(r) };
      try {
        let streamErr = null;
        await parseSSE(r.body, (e) => {
          if (e.type === 'error') streamErr = e.error?.message || 'stream error';
          else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') onDelta(e.delta.text);
        });
        return streamErr ? { ok: false, status: 'stream', detail: streamErr } : { ok: true };
      } catch (err) {
        return { ok: false, status: 'stream', detail: String((err && err.message) || err) };
      }
    },
  },

  openai: {
    detect: (k) => k.startsWith('sk-') && !k.startsWith('sk-ant-'),
    defaultModel: () => 'gpt-4o-mini',
    async listModels(key) {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json();
      const ids = (d.data || []).map((m) => m.id)
        .filter((id) => /^(gpt-|o\d|chatgpt)/i.test(id)
          && !/(embedding|tts|whisper|audio|image|realtime|moderation|dall|search|transcribe|babbage|davinci|instruct|o1-mini|o1-preview)/i.test(id))
        .sort();
      return { ok: true, models: ids.map((id) => ({ id, label: id })) };
    },
    async chat(key, model, messages, image, paint) {
      const sys = paint ? SYSTEM + PAINT_HINT : SYSTEM;
      const post = (img) => fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, ...attachImage(messages, img, 'openai')] }),
      });
      let r = await post(image);
      if (r.status === 400 && image) r = await post(null); // model may not support vision — retry text-only
      if (!r.ok) return { ok: false, status: r.status, detail: await safeText(r) };
      const data = await r.json();
      return { ok: true, ...replyFrom(data.choices?.[0]?.message?.content || '', paint) };
    },
    async chatStream(key, model, messages, onDelta, image, paint) {
      const sys = paint ? SYSTEM + PAINT_HINT : SYSTEM;
      const post = (img) => fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, ...attachImage(messages, img, 'openai')], stream: true }),
      });
      let r = await post(image);
      if (r.status === 400 && image) r = await post(null); // model may not support vision — retry text-only
      if (!r.ok) return { ok: false, status: r.status, detail: await safeText(r) };
      try {
        let streamErr = null;
        await parseSSE(r.body, (e) => {
          if (e.error) streamErr = e.error.message || 'stream error';
          else { const d = e.choices?.[0]?.delta?.content; if (d) onDelta(d); }
        });
        return streamErr ? { ok: false, status: 'stream', detail: streamErr } : { ok: true };
      } catch (err) {
        return { ok: false, status: 'stream', detail: String((err && err.message) || err) };
      }
    },
  },
};

function detectProvider(key) {
  for (const [id, p] of Object.entries(BRAIN_PROVIDERS)) if (p.detect(key)) return id;
  return null;
}

// --- ElevenLabs (voice) ------------------------------------------------------
const EL_BASE = 'https://api.elevenlabs.io';

function elevenlabs(path, { method = 'GET', body, query } = {}, key = EL_KEY) {
  const url = new URL(EL_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return fetch(url, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function voiceSettings(s = {}) {
  const unit = (v, d) => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : d);
  return {
    stability: unit(s.stability, 0.5),
    similarity_boost: unit(s.similarity_boost, 0.75),
    style: unit(s.style, 0.0),
    use_speaker_boost: s.use_speaker_boost !== false,
    speed: typeof s.speed === 'number' ? Math.max(0.7, Math.min(1.2, s.speed)) : 1.0,
  };
}

// Log upstream failures server-side; never relay provider error bodies to the client.
async function logUpstream(label, r) {
  let detail = '';
  try { detail = (await r.text()).slice(0, 300); } catch { /* ignore */ }
  console.error(`[upstream] ${label} ${r.status} ${detail}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const reqPath = (req.url || '/').split('?')[0];
    if (reqPath.startsWith('/api/') && reqPath !== '/api/health' && rateLimited(req)) {
      return send(res, 429, JSON.stringify({ error: 'rate limited' }), { 'content-type': MIME['.json'] });
    }

    const json = (status, obj) => send(res, status, JSON.stringify(obj), { 'content-type': MIME['.json'] });

    if (req.method === 'GET' && req.url === '/api/health') {
      return json(200, { ok: true, brain: Boolean(API_KEY), model: MODEL, effort: EFFORT, voice: Boolean(EL_KEY), brainProviders: Object.keys(BRAIN_PROVIDERS) });
    }

    // List a BYOK key's available models — fetched live from the provider, never hardcoded.
    if (req.method === 'POST' && req.url === '/api/brain/models') {
      const { key, provider } = await readJsonBody(req);
      if (!key || typeof key !== 'string') return json(400, { error: 'key required' });
      const pid = (provider && Object.hasOwn(BRAIN_PROVIDERS, provider)) ? provider : detectProvider(key);
      if (!pid) return json(400, { error: 'unrecognized API key' });
      const out = await BRAIN_PROVIDERS[pid].listModels(key);
      if (!out.ok) return json(200, { provider: pid, models: [], error: 'could not list models — check the key' });
      return json(200, { provider: pid, models: out.models });
    }

    if (req.method === 'POST' && req.url === '/api/brain') {
      const { messages, key, provider, model, image, paint } = await readJsonBody(req, 1024 * 1024);
      if (!Array.isArray(messages) || messages.length === 0) return json(400, { error: 'messages[] required' });

      // BYOK: the visitor's key/provider/model. Used in-memory only — never stored or logged.
      if (key && typeof key === 'string') {
        const pid = (provider && Object.hasOwn(BRAIN_PROVIDERS, provider)) ? provider : detectProvider(key);
        if (!pid) return json(400, { error: 'unrecognized API key' });
        const p = BRAIN_PROVIDERS[pid];
        const out = await p.chat(key, model || p.defaultModel(), messages, image, paint);
        if (!out.ok) { console.error(`[upstream] byok ${pid} ${out.status} ${out.detail || ''}`); return json(200, { available: false }); }
        return json(200, { available: true, mood: out.mood, form: out.form, speech: out.speech, paint: out.paint });
      }

      // Otherwise the site's own key (Anthropic, from env), if configured.
      if (!API_KEY) return json(200, { available: false });
      const out = await BRAIN_PROVIDERS.anthropic.chat(API_KEY, MODEL, messages, image, paint);
      if (!out.ok) { console.error(`[upstream] anthropic ${out.status} ${out.detail || ''}`); return json(200, { available: false }); }
      return json(200, { available: true, mood: out.mood, form: out.form, speech: out.speech, paint: out.paint });
    }

    // Streaming brain over SSE: mood emitted first (body morphs), then speech deltas.
    if (req.method === 'POST' && req.url === '/api/brain/stream') {
      const { messages, key, provider, model, image, paint } = await readJsonBody(req, 1024 * 1024);
      if (!Array.isArray(messages) || messages.length === 0) return json(400, { error: 'messages[] required' });

      let pid; let useKey; let useModel;
      if (key && typeof key === 'string') {
        pid = (provider && Object.hasOwn(BRAIN_PROVIDERS, provider)) ? provider : detectProvider(key);
        if (!pid) return json(400, { error: 'unrecognized API key' });
        useKey = key; useModel = model || BRAIN_PROVIDERS[pid].defaultModel();
      } else if (API_KEY) {
        pid = 'anthropic'; useKey = API_KEY; useModel = MODEL;
      } else {
        return json(200, { available: false }); // client falls back to local brain
      }

      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Pull the leading control tag (and any trailing paint block) out of the
      // token stream so neither is spoken; emit mood + form + paint, stream speech.
      let speech = '';
      let paintOut = null;
      const parser = makeLeadStreamParser({
        onMood: (mood) => sse('mood', { mood }),
        onForm: (form) => sse('form', { form }),
        onScheme: (scheme) => sse('scheme', { scheme }),
        onText: (text) => { speech += text; sse('text', { text }); },
        onPaint: (anchors) => { paintOut = anchors; sse('paint', { anchors }); },
      });

      const out = await BRAIN_PROVIDERS[pid].chatStream(useKey, useModel, messages, (c) => parser.push(c), image, paint);
      if (!out.ok) { console.error(`[upstream] stream ${pid} ${out.status} ${out.detail || ''}`); sse('error', { error: 'unavailable' }); return res.end(); }
      const { mood: finalMood, form: finalForm, scheme: finalScheme } = parser.end();
      sse('done', { mood: finalMood, form: finalForm, scheme: finalScheme, speech: speech.trim(), paint: paintOut });
      return res.end();
    }

    // --- Voice endpoints (ElevenLabs proxy; key never reaches the browser) ---
    // Voice key: the visitor's own (sent as a header) or the site's (env). In-memory only.
    const elKey = req.headers['x-voice-key'] || EL_KEY;

    if (req.method === 'GET' && req.url === '/api/voice/list') {
      if (!elKey) return json(200, { available: false, voices: [] });
      const r = await elevenlabs('/v2/voices', {}, elKey); // v2: no 500-voice cap (first page; paginate for huge libraries)
      if (!r.ok) { await logUpstream('voice/list', r); return json(200, { available: false, voices: [], error: 'key not accepted' }); }
      const d = await r.json();
      const voices = (d.voices || []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {}, category: v.category }));
      return json(200, { available: true, voices });
    }

    if (req.method === 'POST' && req.url === '/api/voice/tts') {
      if (!elKey) return json(400, { error: 'voice not configured' });
      const { text, voiceId, settings } = await readJsonBody(req);
      if (!text || !voiceId) return json(400, { error: 'text and voiceId required' });
      if (text.length > 2000) return json(400, { error: 'text too long' }); // replies are 1-3 sentences; the paid key is shared
      const r = await elevenlabs(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        query: { output_format: 'mp3_44100_128' },
        body: { text, model_id: 'eleven_flash_v2_5', voice_settings: voiceSettings(settings) },
      }, elKey);
      if (!r.ok) { await logUpstream('voice/tts', r); return json(502, { error: 'voice service unavailable' }); }
      return send(res, 200, Buffer.from(await r.arrayBuffer()), { 'content-type': 'audio/mpeg' });
    }

    if (req.method === 'POST' && req.url === '/api/voice/design') {
      if (!elKey) return json(400, { error: 'voice not configured' });
      const { description, text } = await readJsonBody(req);
      if (!description || description.length < 20 || description.length > 1000) return json(400, { error: 'description must be 20–1000 characters' });
      if (text && text.length > 1000) return json(400, { error: 'sample text too long' });
      const body = { voice_description: description };
      if (text && text.length >= 100) body.text = text; else body.auto_generate_text = true;
      const r = await elevenlabs('/v1/text-to-voice/design', { method: 'POST', body }, elKey);
      if (!r.ok) { await logUpstream('voice/design', r); return json(502, { error: 'voice service unavailable' }); }
      return json(200, await r.json());
    }

    if (req.method === 'POST' && req.url === '/api/voice/save') {
      if (!elKey) return json(400, { error: 'voice not configured' });
      const { generatedVoiceId, name, description } = await readJsonBody(req);
      if (!generatedVoiceId || !name) return json(400, { error: 'generatedVoiceId and name required' });
      const r = await elevenlabs('/v1/text-to-voice', {
        method: 'POST',
        body: { generated_voice_id: generatedVoiceId, voice_name: name, voice_description: description || '' },
      }, elKey);
      if (!r.ok) { await logUpstream('voice/save', r); return json(502, { error: 'voice service unavailable' }); }
      return json(200, await r.json());
    }

    // Static files. Resolve safely under ROOT and prevent path traversal.
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    // Never serve dotfiles/dotdirs (.env, .git, …) — keeps secrets unreachable.
    if (/(^|\/)\.[^/]/.test(urlPath)) return send(res, 403, 'Forbidden');
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
      return send(res, 403, 'Forbidden');
    }
    const data = await readFile(filePath);
    return send(res, 200, data, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
  } catch (err) {
    if (res.headersSent) { try { res.end(); } catch { /* already closed */ } return; }
    if (err && err.code === 'ENOENT') return send(res, 404, 'Not found');
    if (err && err.statusCode === 413) return send(res, 413, JSON.stringify({ error: 'payload too large' }), { 'content-type': MIME['.json'], Connection: 'close' });
    if (err && err.statusCode === 400) return send(res, 400, JSON.stringify({ error: 'bad request' }), { 'content-type': MIME['.json'] });
    console.error(err);
    return send(res, 500, JSON.stringify({ error: 'internal error' }), { 'content-type': MIME['.json'] });
  }
});

server.requestTimeout = 30000;  // bound slow uploads (slow-loris)
server.headersTimeout = 30000;
// Only bind the port when run directly (`node server.mjs`); stay silent when a
// test imports this module for the exported parsers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => {
    console.log(`\n  Y3K listening on  http://localhost:${PORT}`);
    console.log(`  Brain: ${API_KEY ? `Claude (${MODEL})` : 'local placeholder (set ANTHROPIC_API_KEY for real Claude)'}\n`);
  });
}
