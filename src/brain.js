// The brain decides BOTH what Y3K says and how its body should look: every
// reply is { mood, speech }. It prefers the server-side Claude proxy, but if no
// API key is configured it falls back to a local heuristic so the app is fully
// playable with zero setup. The local brain is intentionally simple — its job
// is to prove the loop, not to be clever.

const MOODS = ['calm', 'thinking', 'excited', 'tender', 'glitch'];

let serverBrain = null; // null = unknown, true/false once probed
const history = [];      // [{ role, content }] sent to Claude for context

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

  if (await hasServerBrain()) {
    try {
      const r = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) }),
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
