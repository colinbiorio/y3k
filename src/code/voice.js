// ============================================================================
// voice.js — Orion's voice over the coder, the page's half (code-voice.mjs is
// the server's). The coder's words stay the coder's: its own session keeps them
// and its context never hears of Orion. What the person sees is each finished
// message said the way their presence would say it, at the rank they chose on
// the Personality slider — and, now and then, the orb moving with it.
//
// CODE NEVER LEAVES THE MACHINE, AND IS NEVER RETYPED. Before a message goes to
// the translator, every fenced block, inline code span, link and path is taken
// out and replaced by a numbered slot (⟦1⟧, ⟦2⟧ …); the translator only ever
// sees prose, the server refuses a reply that loses a slot or a number, and the
// slots are put back here byte for byte. If anything fails — no key on the
// site, a cap, a refusal, a bad reply — the coder's own words simply stay.
// ============================================================================

export const RANK_KEY = 'y3k-code:personality';
export const RANK_NAMES = { 1: 'Off', 2: 'Light', 3: 'Friend', 4: 'Warm', 5: 'Orion' };
export const RANK_LINES = {
  1: 'The coder\'s own words, exactly.',
  2: 'Almost word for word — just sounds like a person.',
  3: 'Close to the original, with a friend\'s touch.',
  4: 'Warmer, more personal, every point kept.',
  5: 'Fully in Orion\'s voice — the facts untouched.',
};
const MAX_IN = 6000;      // matches VOICE_MAX_IN on the server
const HEAD = 1500;        // a long message: voice its opening, keep the rest as written

export function getRank(store = globalThis.localStorage) {
  try { const n = Number(store?.getItem(RANK_KEY)); return n >= 1 && n <= 5 ? Math.round(n) : 3; } catch { return 3; }
}
export function setRank(n, store = globalThis.localStorage) {
  const v = Number(n);
  const r = Math.min(5, Math.max(1, Math.round(Number.isFinite(v) ? v : 3)));
  try { store?.setItem(RANK_KEY, String(r)); } catch { /* private window: this page only */ }
  return r;
}

const FENCE = /^\s{0,3}(```+|~~~+)/;
const INLINE = [
  /`[^`\n]+`/g,                                            // inline code
  /\[[^\]\n]*\]\([^)\s]+\)/g,                              // a markdown link, text and target together
  /\bhttps?:\/\/[^\s<>)\]]+/g,                             // a bare URL
  /(?:^|(?<=[\s("'[]))(?:~|\.{1,2})?\/[\w.@+-][\w.@+/-]*/g, // /abs, ./rel, ../up, ~/home
  /\b[\w-]+(?:\/[\w.@+-]+)+\.\w{1,8}\b/g,                  // dir/file.ext
  /\b[\w-]+\.(?:m?js|cjs|tsx?|jsx|json|md|css|s?html?|py|go|rs|java|kt|rb|php|sh|ya?ml|toml|lock|txt|sql|swift|c|h|cpp)\b/g, // file.ext
];

// Take the code out. Returns the prose with slots, and the slots.
export function mask(md) {
  const slots = [];
  const put = (s) => { slots.push(s); return `⟦${slots.length}⟧`; };
  // fenced blocks first, by line, so a fence's contents are one slot
  const lines = String(md || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (!m) { out.push(lines[i]); continue; }
    const mark = m[1][0];
    let j = i + 1;
    while (j < lines.length && !new RegExp(`^\\s{0,3}${mark === '`' ? '`' : '~'}{${m[1].length},}\\s*$`).test(lines[j])) j++;
    out.push(put(lines.slice(i, Math.min(j + 1, lines.length)).join('\n')));
    i = j;
  }
  let prose = out.join('\n');
  for (const re of INLINE) prose = prose.replace(re, (s) => put(s));
  return { prose, slots };
}

// Put the code back, exactly.
export function unmask(text, slots) {
  return String(text).replace(/⟦(\d+)⟧/g, (s, n) => (slots[n - 1] !== undefined ? slots[n - 1] : s));
}

// Worth a translator call? Only prose with some words in it.
export const hasProse = (prose) => (String(prose).replace(/⟦\d+⟧/g, '').match(/[A-Za-z]{2,}/g) || []).length >= 4;

// A long message: the opening is voiced, the rest kept as the coder wrote it —
// split at a blank line, never inside a slot.
export function splitHead(prose) {
  if (prose.length <= MAX_IN) return { head: prose, rest: '' };
  let cut = prose.lastIndexOf('\n\n', HEAD);
  if (cut < 200) cut = prose.indexOf('\n\n', HEAD);
  if (cut < 0) return { head: '', rest: prose };
  return { head: prose.slice(0, cut), rest: prose.slice(cut) };
}

// The page's translator: finished blocks in, voiced text out (or nothing).
// link.voice is the one door to the site (main.js); onVoiced redraws.
export function createVoicer({ link, rank = getRank, onVoiced = () => {}, express = null, maxInFlight = 2 } = {}) {
  const recent = [];
  let inFlight = 0;
  const queue = [];
  const pump = () => {
    while (inFlight < maxInFlight && queue.length) {
      const job = queue.shift();
      inFlight += 1;
      job().finally(() => { inFlight -= 1; pump(); });
    }
  };
  return {
    // one finished text block of a main-agent reply
    block({ item, block, where }) {
      const r = rank();
      if (r <= 1 || !link?.voice || !block?.text || block.voice !== undefined) return false;
      const { prose, slots } = mask(block.text);
      const { head, rest } = splitHead(prose);
      if (!head || !hasProse(head)) return false;
      const source = block.text;
      block.voice = null;               // asked once; null = not (yet) voiced
      queue.push(async () => {
        const said = await link.voice({ text: head, rank: r, where, recent: recent.slice(-2) }).catch(() => null);
        if (!said?.text || block.text !== source) return;   // no voice, or the block changed under us
        const voiced = unmask(said.text + rest, slots);
        block.voice = voiced;
        recent.push(said.text.replace(/⟦\d+⟧/g, '…').slice(0, 240));
        if (recent.length > 4) recent.shift();
        if ((said.mood || said.form) && express) express({ mood: said.mood, form: said.form });
        onVoiced(item);
      });
      pump();
      return true;
    },
  };
}
