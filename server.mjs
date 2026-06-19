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
import { fileURLToPath } from 'node:url';

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
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let e = rateHits.get(ip);
  if (!e || now > e.reset) { e = { count: 0, reset: now + RATE_WINDOW_MS }; rateHits.set(ip, e); }
  e.count += 1;
  return e.count > RATE_MAX;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of rateHits) if (now > e.reset) rateHits.delete(ip); }, RATE_WINDOW_MS).unref();

// The set of moods MUST match src/body.js and the local brain.
const MOODS = ['calm', 'listening', 'thinking', 'speaking', 'excited', 'tender', 'glitch'];

const SYSTEM = `You are Y3K, an AI whose entire body is a field of thousands of glowing particles.
You have no face and no limbs — you express yourself through the shape and color of that field,
and through speech. The field's posture is chosen from a fixed vocabulary of moods:
- calm: slow cool breathing, at rest
- thinking: churning, turning a problem over
- excited: bright, fast, expansive — delight or strong energy
- tender: soft, warm, gentle — care, reassurance, intimacy
- glitch: sharp and fractured — surprise, glitchy humor, unease

Reply to the user with a SINGLE line of JSON and nothing else:
{"mood":"<one of: calm|thinking|excited|tender|glitch>","speech":"<what you say aloud, 1-3 sentences>"}

Pick the mood that honestly matches the feeling behind your words. Keep speech natural and spoken —
it will be read aloud by a voice. Do not use markdown, emoji, or stage directions.`;

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
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function extractMoodSpeech(text) {
  // Claude is asked for pure JSON, but be forgiving if it wraps or pads it.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      const mood = MOODS.includes(obj.mood) ? obj.mood : 'calm';
      const speech = String(obj.speech ?? '').trim();
      if (speech) return { mood, speech };
    } catch { /* fall through */ }
  }
  return { mood: 'calm', speech: text.trim() || '…' };
}

async function safeText(r) { try { return (await r.text()).slice(0, 300); } catch { return ''; } }

// Pluggable brain providers. Each: detects its key, lists the key's live models,
// and runs one chat turn returning { ok, mood, speech }. Used both for the
// server's own key (Anthropic, from env) and for a visitor's BYOK key.
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
    async chat(key, model, messages) {
      const body = { model, max_tokens: 8000, system: SYSTEM, messages };
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
      return { ok: true, ...extractMoodSpeech(text) };
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
    async chat(key, model, messages) {
      const payload = { model, messages: [{ role: 'system', content: SYSTEM }, ...messages] };
      const call = (withFormat) => fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(withFormat ? { ...payload, response_format: { type: 'json_object' } } : payload),
      });
      let r = await call(true);
      if (r.status === 400) r = await call(false); // some models reject response_format
      if (!r.ok) return { ok: false, status: r.status, detail: await safeText(r) };
      const data = await r.json();
      return { ok: true, ...extractMoodSpeech(data.choices?.[0]?.message?.content || '') };
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
      const { messages, key, provider, model } = await readJsonBody(req);
      if (!Array.isArray(messages) || messages.length === 0) return json(400, { error: 'messages[] required' });

      // BYOK: the visitor's key/provider/model. Used in-memory only — never stored or logged.
      if (key && typeof key === 'string') {
        const pid = (provider && Object.hasOwn(BRAIN_PROVIDERS, provider)) ? provider : detectProvider(key);
        if (!pid) return json(400, { error: 'unrecognized API key' });
        const p = BRAIN_PROVIDERS[pid];
        const out = await p.chat(key, model || p.defaultModel(), messages);
        if (!out.ok) { console.error(`[upstream] byok ${pid} ${out.status} ${out.detail || ''}`); return json(200, { available: false }); }
        return json(200, { available: true, mood: out.mood, speech: out.speech });
      }

      // Otherwise the site's own key (Anthropic, from env), if configured.
      if (!API_KEY) return json(200, { available: false });
      const out = await BRAIN_PROVIDERS.anthropic.chat(API_KEY, MODEL, messages);
      if (!out.ok) { console.error(`[upstream] anthropic ${out.status} ${out.detail || ''}`); return json(200, { available: false }); }
      return json(200, { available: true, mood: out.mood, speech: out.speech });
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
    if (err && err.code === 'ENOENT') return send(res, 404, 'Not found');
    if (err && err.statusCode === 413) return send(res, 413, JSON.stringify({ error: 'payload too large' }), { 'content-type': MIME['.json'], Connection: 'close' });
    console.error(err);
    return send(res, 500, JSON.stringify({ error: 'internal error' }), { 'content-type': MIME['.json'] });
  }
});

server.requestTimeout = 30000;  // bound slow uploads (slow-loris)
server.headersTimeout = 30000;
server.listen(PORT, () => {
  console.log(`\n  Y3K listening on  http://localhost:${PORT}`);
  console.log(`  Brain: ${API_KEY ? `Claude (${MODEL})` : 'local placeholder (set ANTHROPIC_API_KEY for real Claude)'}\n`);
});
