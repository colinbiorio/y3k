// THE FREE VOICE, CHOSEN (Colin, 18 Nov 2026: "the free browser voice makes
// this loud beep noise sometimes ... it'd be nice not to have to resort to an
// api key if not needed").
//
// The browser's own voices are whatever the device holds, in the device's
// order. On a Mac set to Spanish, Chrome lists 180 of them with Mónica (es-ES)
// as the default, and the old pick, the first name matching
// /samantha|google us english|jenny|aria/, was Daria: a Bulgarian voice,
// because "Daria" holds "aria" and comes before Samantha. Every reply in the
// free voice was read in a Bulgarian voice.
//
// Now a voice is chosen by what it is: English, never one of the Mac's
// novelty voices (Bells, Cellos and Organ sing the words, Boing and Bubbles
// play with them), a better kind first (premium, natural or neural, then
// enhanced), then the voices known to be good, then the person's own English.
// A voice the person picked in Settings → Voice wins whenever this device has
// it. Pure: browsers hand in speechSynthesis.getVoices(); tests hand in rows.

// The Mac's novelty and singing voices, as Chrome names them in English and
// as macOS renames some of them in another language ("Buenas noticias").
const NOVELTY = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news', 'jester',
  'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
  'buenas noticias', 'malas noticias', 'bonnes nouvelles', 'mauvaises nouvelles',
  'gute nachrichten', 'schlechte nachrichten', 'buone notizie', 'cattive notizie',
  'boas notícias', 'más notícias', 'boas novas', 'más novas',
]);
// Voices that read clearly but sound like 1990: offered, never first.
const DATED = new Set(['fred', 'junior', 'kathy', 'ralph', 'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley']);
// Voices known to be good, best first: Apple's newer ones, Samantha (the
// old pick's intent), the other Apple English voices, then Google's and
// Microsoft's natural ones.
const KNOWN = ['ava', 'zoe', 'evan', 'nathan', 'allison', 'susan', 'tom', 'samantha', 'alex', 'serena', 'kate', 'oliver',
  'daniel', 'karen', 'moira', 'tessa', 'fiona', 'rishi', 'google us english', 'google uk english female',
  'google uk english male', 'microsoft aria', 'microsoft jenny', 'microsoft ava', 'microsoft emma',
  'microsoft andrew', 'microsoft brian', 'microsoft guy'];

// "Samantha (Enhanced)", "Flo (inglés (Reino Unido))", "Microsoft Aria Online
// (Natural) - English (United States)": the name before any bracket or dash.
const base = (name) => String(name || '').toLowerCase().split(/\s*[(\-–]/)[0].trim();
const known = (name) => {
  const b = base(name);
  const i = KNOWN.findIndex((k) => b === k || (k.includes(' ') && b.startsWith(k)));
  return i < 0 ? -1 : i;
};
const english = (v) => /^en([-_]|$)/i.test(String(v?.lang || ''));
export const novelty = (v) => NOVELTY.has(base(v?.name));

// Higher is better. Kind first (a premium voice of any name beats a compact
// Samantha), then a known name, then the reader's own English (en-US for
// en-US), and a dated voice last of all.
export function voiceScore(v, { lang = 'en-US' } = {}) {
  const tag = `${v?.name || ''} ${v?.voiceURI || ''}`;
  let s = 0;
  if (/\b(premium|natural|neural)\b/i.test(tag)) s += 400;
  else if (/\b(enhanced|mejorada|améliorée|verbessert|migliorata|aprimorada)\b/i.test(tag)) s += 300;
  const k = known(v?.name);
  if (k >= 0) s += 200 - k;
  if (String(v?.lang || '').toLowerCase().replace('_', '-') === String(lang).toLowerCase()) s += 20;
  if (DATED.has(base(v?.name))) s -= 150;
  return s;
}

// This device's English voices, best first, the novelty voices left out.
export function rankVoices(voices, { lang = 'en-US' } = {}) {
  return [...(voices || [])]
    .filter((v) => v && english(v) && !novelty(v))
    .map((v, i) => ({ v, i, s: voiceScore(v, { lang }) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v);
}

// The voice to speak with: the one the person chose (by its voiceURI, or its
// name, the same thing in Chrome) while this device has it, else the best of
// rankVoices, else null (no English voice here: the browser's default speaks).
export function pickVoice(voices, { prefer, lang = 'en-US' } = {}) {
  const all = voices || [];
  if (prefer) {
    const mine = all.find((v) => v && (v.voiceURI === prefer || v.name === prefer));
    if (mine) return mine;
  }
  return rankVoices(all, { lang })[0] || null;
}

// What the Voice pane shows for a device voice: its name without the
// language the device wrote into it, and the language as a tag.
export function voiceLabel(v) {
  const name = String(v?.name || '').replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '').trim() || String(v?.name || '');
  const kind = /\b(premium|natural|neural)\b/i.test(`${v?.name} ${v?.voiceURI}`) ? 'premium'
    : /\b(enhanced|mejorada)\b/i.test(`${v?.name} ${v?.voiceURI}`) ? 'enhanced' : '';
  return { name, lang: String(v?.lang || ''), kind, local: v?.localService !== false };
}
