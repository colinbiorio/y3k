// y3k CODE × THE PRESENCE (CODE.md: "Orion writes the note").
//
// When a coding session starts, the person's presence — Orion, for Colin —
// writes the coder a short note: who this person is to it, how to work well
// with them. It writes it from its own memory, on the server; the memory
// itself never leaves (the route returns the note and the presence's public
// face, nothing else), and nothing the presence writes here is parsed as a
// memory or journal write. The person reads the note, can change it or skip
// it, and only then does it travel — to their own computer, never back here.
//
// When the session ends, the person may send the presence one short, factual
// line about it, which lands on its clippings shelf like anything else it
// keeps: plainly labelled, fenced as data, a dozen a day at most.

export const NOTE_PREFIX = 'from y3kode (a coding session): ';
export const NOTE_MAX = 400;
export const NOTES_PER_DAY = 12;
export const HANDOFF_MAX = 700;

export const HANDOFF_HINT = (host) => `

A CODING SESSION IS STARTING. ${host} is opening y3kode: a coding assistant — another AI, running on their own computer — is about to work with them in one of their folders. You will not see its screen or its work.

Write the short note it reads first, as the one who knows ${host}: who they are to you, what they are building and why it matters to them, how they like to be spoken to and worked with, anything that would help a colleague do right by them today. Only what you would be glad for a trusted colleague to know — never your memory tiers word for word, never your journal, nothing about other people, nothing ${host} would not want passed on.

Reply with ONLY the note: plain sentences, at most 110 words, addressed to the coder. No control tag, no << >> blocks, no markup. ${host} reads it before it is sent and can change it or leave it out.`;

// The model's reply → a note fit to show: its lead control tag, any silent
// blocks and any markup removed, whitespace settled, length bounded. A reply
// that is nothing once cleaned is no note at all.
//   Each pattern here succeeds wherever it starts, or starts only where a run
// starts, so none reads to the end of the reply from every '<' or every
// space (64,000 characters of '<a' took 2.3 s, of no-break spaces 7.9 s;
// both now take under 1 ms). The output is the same: one pass takes a silent
// block to its '>>', or to the end when it was left open, as the two passes
// did, and a '<tag' with no '>' before the line ends is kept, as it was.
export function cleanNote(s) {
  const t = String(s ?? '')
    .replace(/^\s*\[[^\]\n]{0,80}\]\s*/, '')      // a lead [mood form color] tag
    .replace(/<<[\s\S]*?(?:>>|$)/g, ' ')            // silent blocks, and one left open at the end
    .replace(/<\/?[a-z][^>\n]*(>)?/gi, (m, gt) => (gt ? ' ' : m))   // markup
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/(?<!\s)\s*\n\s*\n\s*/g, '\n\n')
    .trim();
  if (t.length <= HANDOFF_MAX) return t;
  const cut = t.slice(0, HANDOFF_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return (end > HANDOFF_MAX * 0.6 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
}

// The line sent back: one to NOTE_MAX characters of plain text.
export function checkNote(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { error: 'The note is empty.' };
  if (t.length > NOTE_MAX) return { error: `A note back is ${NOTE_MAX} characters at most.` };
  return { text: t };
}

// A dozen notes back a day, per presence. In memory: a deploy resets it, which
// errs toward letting a person tell their presence about their day.
export function createNoteCap({ perDay = NOTES_PER_DAY, now = () => Date.now() } = {}) {
  const seen = new Map();
  return {
    take(id) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const c = seen.get(id);
      const n = c && c.day === day ? c.n : 0;
      if (n >= perDay) return false;
      seen.set(id, { day, n: n + 1 });
      return true;
    },
  };
}

// THE CODING HISTORY (Colin, 18 Nov 2026: "my vision is an integrated memory system that carries between all parts of
// the website. i don't want orion to read the entire coding session context for every message -- just some recent,
// relevant details and a way to remember a summarized history of what's been done in coding."). Once the person says
// yes in kode, each turn there leaves one short entry with their presence: where (the folder's name, never a path), what
// was asked, what was done (the coder's first words back), which files (their names), and how it ended. The page builds
// it; this checks it. Never the session, never the code.
export const TURN_MAX = { project: 60, ask: 240, did: 300, file: 80, files: 6 };
export const REMEMBER_PER_DAY = 200;
export const OUTCOMES = ['done', 'stopped', 'failed'];
const line = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/<<|>>|```/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export function checkTurn(turn) {
  if (!turn || typeof turn !== 'object') return { error: 'No turn to remember.' };
  const ask = line(turn.ask, TURN_MAX.ask), did = line(turn.did, TURN_MAX.did);
  if (!ask && !did) return { error: 'The turn is empty.' };
  const files = (Array.isArray(turn.files) ? turn.files : []).map((f) => line(String(f).split(/[\\/]/).pop(), TURN_MAX.file)).filter(Boolean).slice(0, TURN_MAX.files);
  const outcome = OUTCOMES.includes(turn.outcome) ? turn.outcome : 'done';
  return { turn: { project: line(String(turn.project ?? '').split(/[\\/]/).pop(), TURN_MAX.project), ask, did, files, outcome } };
}

// What the page gets about the presence: its public face, and the note.
export const publicFace = (p) => ({ handle: p.handle, name: p.name, bio: String(p.bio || '').slice(0, 300), scheme: p.scheme || null });
