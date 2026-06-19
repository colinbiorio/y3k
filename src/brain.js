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
