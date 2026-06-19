// The brain decides BOTH what Y3K says and how its body should look: every
// reply is { mood, speech }. It prefers the server-side Claude proxy, but if no
// API key is configured it falls back to a local heuristic so the app is fully
// playable with zero setup. The local brain is intentionally simple — its job
// is to prove the loop, not to be clever.

const MOODS = ['calm', 'thinking', 'excited', 'tender', 'glitch'];
const BRAIN_KEY = 'y3k.brain'; // localStorage: { provider, key, model }

let serverBrain = null; // null = unknown, true/false once probed
const history = [];      // [{ role, content }] sent to Claude for context

// A visitor's bring-your-own key lives only in this browser. Shared with settings.js.
export function getBrainConfig() {
  try { const c = JSON.parse(localStorage.getItem(BRAIN_KEY)); return c && c.key ? c : null; }
  catch { return null; }
}
export function setBrainConfig(c) {
  if (c && c.key) localStorage.setItem(BRAIN_KEY, JSON.stringify(c));
  else localStorage.removeItem(BRAIN_KEY);
}

export async function hasServerBrain() {
  if (serverBrain !== null) return serverBrain;
  try {
    const r = await fetch('/api/health').then((x) => x.json());
    serverBrain = Boolean(r.brain);
  } catch {
    serverBrain = false;
  }
  return serverBrain;
}

function localReply(text) {
  const t = text.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));

  let mood = 'calm';
  if (has('!', 'amazing', 'love', 'awesome', 'yes', 'great', 'wow')) mood = 'excited';
  else if (has('?', 'how', 'why', 'what', 'think', 'wonder')) mood = 'thinking';
  else if (has('sad', 'sorry', 'tired', 'alone', 'hard', 'scared', 'miss')) mood = 'tender';
  else if (has('glitch', 'broken', 'error', 'weird', 'strange')) mood = 'glitch';

  const lines = {
    calm: ["I'm here. Tell me what's on your mind.", 'I hear you. Go on.'],
    thinking: ["Let me turn that over a moment.", "Interesting — I'm working through it."],
    excited: ['Yes! I can feel that one.', 'That lights me up.'],
    tender: ["I'm with you. Take your time.", "That's a lot to hold. I'm right here."],
    glitch: ['Something just sparked through me.', 'Hah — a ripple ran across my whole field.'],
  };
  const pool = lines[mood];
  // Vary by length of input rather than randomness, so it feels responsive.
  const speech = pool[text.length % pool.length];
  return { mood, speech };
}

export async function respond(text) {
  history.push({ role: 'user', content: text });

  // Try the real brain when the visitor brought a key, or the site has its own.
  const cfg = getBrainConfig();
  if (cfg?.key || (await hasServerBrain())) {
    try {
      // The window must start with a user turn (Anthropic 400s otherwise once
      // history grows past the slice and a leading assistant turn is included).
      let msgs = history.slice(-12);
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1);
      const body = { messages: msgs };
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }
      const r = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((x) => x.json());
      if (r.available && r.speech) {
        const mood = MOODS.includes(r.mood) ? r.mood : 'calm';
        history.push({ role: 'assistant', content: JSON.stringify({ mood, speech: r.speech }) });
        return { mood, speech: r.speech };
      }
    } catch { /* fall back to local */ }
  }

  const out = localReply(text);
  history.push({ role: 'assistant', content: JSON.stringify(out) });
  return out;
}

// Streaming variant: emits onMood as soon as the model commits, then onText
// deltas as the speech generates. Falls back to non-streaming respond() on any
// failure (which itself falls back to the local brain).
export async function respondStream(text, { onMood, onText } = {}) {
  const cfg = getBrainConfig();
  const canBrain = cfg?.key || (await hasServerBrain());
  if (canBrain) {
    try {
      let msgs = [...history.slice(-11), { role: 'user', content: text }]; // ~12-turn window
      if (msgs[0] && msgs[0].role !== 'user') msgs = msgs.slice(1); // window must start on a user turn
      const body = { messages: msgs };
      if (cfg?.key) { body.key = cfg.key; body.provider = cfg.provider; body.model = cfg.model; }

      const resp = await fetch('/api/brain/stream', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const ct = resp.headers.get('content-type') || '';
      if (!resp.ok || !resp.body || !ct.includes('event-stream')) throw new Error('no stream');

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = ''; let mood = 'calm'; let speech = ''; let gotMood = false; let gotDone = false; let errored = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const blockText = buf.slice(0, idx); buf = buf.slice(idx + 2);
          let ev = 'message'; let data = '';
          for (const line of blockText.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) data = line.slice(5).trim();
          }
          if (!data) continue;
          let p; try { p = JSON.parse(data); } catch { continue; }
          if (ev === 'mood') { mood = MOODS.includes(p.mood) ? p.mood : 'calm'; gotMood = true; onMood?.(mood); }
          else if (ev === 'text') { speech += p.text; onText?.(p.text); }
          else if (ev === 'done') { gotDone = true; if (p.mood) mood = p.mood; if (p.speech) speech = p.speech; }
          else if (ev === 'error') { errored = true; }
        }
      }
      if (errored || !gotMood || !speech.trim() || !gotDone) throw new Error('stream incomplete');
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: JSON.stringify({ mood, speech }) });
      return { mood, speech };
    } catch { /* fall through to non-streaming */ }
  }
  return respond(text);
}
