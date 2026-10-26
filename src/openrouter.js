// openrouter.js — WAKE IT IN ONE CLICK (2026-10-26).
//
// A presence thinks on its owner's own key or own plan, and the site has no
// key of its own (Colin, 2026-10-12: "i don't have the budget to let anyone
// charge me for free"). Until now that left a new person two ways to wake
// theirs: fetch an API key from a provider's console and paste it into
// Settings → Brain, or install y3kode on a computer that has a Claude plan.
// Colin, 2026-10-25: "copying and pasting keys is not user-friendly."
//
// OpenRouter lets a site ask for a key the way lichess lets it ask for a
// token: the person signs in there and allows it, and OpenRouter hands this
// browser a key of their own (OAuth with PKCE, a public client: no secret,
// nothing registered). Its free models cost nothing within a daily allowance
// (50 requests a day until the account has bought credits, then 1,000), so a
// person can wake their presence in one click, for nothing, and choose a paid
// model later. The key is theirs: it is listed on their OpenRouter account,
// labelled yearthreethousand, and they can delete it there.
//
// THE FLOW. wake() asks first (consent.js, kind 'openrouter': what the button
// agrees to, always / just this time / cancel), opens openrouter.ai/auth in a
// small window with a S256 challenge and a state, and keeps the verifier in
// localStorage, because the window is another tab and sessionStorage does not
// cross that line. OpenRouter sends the window to /openrouter.html with a
// code; that page (openrouter-return.js, finishReturn below) trades the code
// for the key with OpenRouter directly — its API answers any origin, so the
// key does not pass through this site on its way here — leaves it in the
// handoff slot, and closes. This tab hears the slot land (a storage event; or,
// when the window was blocked and the whole page went instead, the slot is
// read at the next load) and take() puts the key in use the way a key pasted
// in Settings → Brain is: checked by the site against OpenRouter and its
// models listed (/api/brain/models), a free model chosen unless the site says
// the account has bought credit, and kept in this browser only, like every key.
//
// Nothing here thinks, and nothing here is sent anywhere but OpenRouter and
// the site's own model list. Pure parts take what they need (crypto, storage,
// fetch, the window) so the tests can run them without a browser.

export const OR_AUTH = 'https://openrouter.ai/auth';
export const OR_KEYS = 'https://openrouter.ai/api/v1/auth/keys';
export const RETURN_PATH = '/openrouter.html';
export const PKCE_SLOT = 'y3k.openrouter.pkce';   // { verifier, state, at, popup } while a connection is under way
export const KEY_SLOT = 'y3k.openrouter.key';     // { key, at }: the handoff from the window, read once
export const CONSENT_KIND = 'openrouter';
export const KEY_LABEL = 'yearthreethousand';      // how the key is named on the person's OpenRouter account
// OpenRouter's code is good for ten minutes, so a slot older than that is a
// connection nobody finished; and a key handed over that long ago and never
// taken was not taken by this person.
export const SLOT_MS = 10 * 60 * 1000;

// What the button agrees to (consent.js), in plain words: what it opens, what
// comes back and where it is kept, what it spends and who bills it, and how to
// stop it. legal.html #terms-openrouter says the same; test/openrouter.test.mjs
// holds the two together.
export const CONSENT = {
  kind: CONSENT_KIND,
  title: 'Wake it with OpenRouter',
  note: 'This opens OpenRouter, where you sign in and allow yearthreethousand a key of your own. '
    + 'The key comes back to this browser only. It goes through this site to OpenRouter with each thing your presence thinks, and is never saved on the server. '
    + 'OpenRouter bills what it thinks to your OpenRouter account: its free models cost nothing, up to 50 requests a day until you add credits there. '
    + 'You can delete the key on OpenRouter whenever you like, and signing out removes it from this browser.',
};

// base64url without padding (RFC 7636 appendix A)
export const b64url = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export async function challengeOf(verifier, c = globalThis.crypto) {
  return b64url(await c.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}
// 48 random bytes make a 64-character verifier (RFC 7636 asks for 43 to 128).
export async function pkcePair(c = globalThis.crypto) {
  const verifier = b64url(c.getRandomValues(new Uint8Array(48)));
  const state = b64url(c.getRandomValues(new Uint8Array(16)));
  return { verifier, state, challenge: await challengeOf(verifier, c) };
}
export function authUrl({ challenge, state, origin }) {
  const q = new URLSearchParams({
    callback_url: String(origin).replace(/\/+$/, '') + RETURN_PATH,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    key_label: KEY_LABEL,
  });
  return `${OR_AUTH}?${q}`;
}

const read = (store, k) => { try { return JSON.parse(store.getItem(k)) || null; } catch { return null; } };
const drop = (store, k) => { try { store.removeItem(k); } catch { /* private window: nothing was kept */ } };
const put = (store, k, v) => { try { store.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// THE MODEL IT WAKES ON. An account that has never bought credit can use only
// the free models (an id ending ':free'); a paid one sent from it is refused
// with 402, which would read as "out of credit" to someone who never had any.
// So the one click chooses a free model unless the site has said the account
// has bought credit (/api/brain/models `free: false`). OpenRouter's free list
// changes from month to month, so this is an order of preference over what
// the list says today, not a name to depend on: models made for talking first
// (Gemma's 31B sees pictures too, which the room's camera and a dropped
// picture need), never a classifier, an embedder or a model made for code.
// Settings → Brain lists every model, and any can be chosen there.
export const isFreeModel = (id) => /:free$/.test(String(id || ''));
const NOT_FOR_TALK = /safety|guard|moderat|embed|rerank|\bcode\b|-code\b|coder|ocr|tts|whisper|transcri/i;
const FREE_ORDER = [
  /^google\/gemma-[\d.]+-31b/,
  /^thinkingmachines\/inkling:free$/,
  /^google\/gemma-/,
  /^meta-llama\/llama-/,
  /^deepseek\//,
  /^qwen\//,
  /^mistralai\//,
  /^nvidia\/nemotron-[\d.]+-(?:ultra|super)/,
  /^thinkingmachines\//,
];
export function pickFreeModel(models) {
  const ids = (models || []).map((m) => String(typeof m === 'string' ? m : m?.id || ''))
    .filter((id) => isFreeModel(id) && !NOT_FOR_TALK.test(id));
  for (const re of FREE_ORDER) { const hit = ids.find((id) => re.test(id)); if (hit) return hit; }
  return ids[0] || null;
}
// …and on an account that has bought credit, what Settings → Brain has always
// chosen for an OpenRouter key (settings.js pickDefaultModel).
export function pickPaidModel(models) {
  const ids = (models || []).map((m) => String(typeof m === 'string' ? m : m?.id || ''));
  return ids.find((id) => id === 'openai/gpt-4o-mini') || ids.find((id) => /claude.*sonnet/.test(id)) || ids[0] || null;
}
export function connectModel(models, free) {
  if (free === false) return pickPaidModel(models);
  return pickFreeModel(models) || (free === true ? null : pickPaidModel(models));
}

// THE WINDOW'S HALF (openrouter-return.js runs it on /openrouter.html).
// → { ok: true, popup } with the key left in KEY_SLOT, or { ok: false, line }.
export async function finishReturn({ search = '', store = globalThis.localStorage, fetchFn = globalThis.fetch, now = Date.now } = {}) {
  const q = new URLSearchParams(search);
  const code = q.get('code');
  const state = q.get('state');
  const slot = read(store, PKCE_SLOT);
  drop(store, PKCE_SLOT);   // a verifier is used once, whatever happens next
  if (!code) return { ok: false, line: 'OpenRouter sent no key back, so nothing changed. You can try again from yearthreethousand.' };
  if (!slot?.verifier || !(now() - (slot.at || 0) <= SLOT_MS)) {
    return { ok: false, line: 'This connection was begun too long ago, or in another browser, so nothing was kept. Begin it again from yearthreethousand.' };
  }
  // PKCE already ties the code to this browser (a code begun anywhere else
  // will not trade for a key with this verifier); the state is a second lock,
  // and an answer carrying someone else's is refused outright.
  if (state && state !== slot.state) {
    return { ok: false, line: 'This answer was not for this browser, so nothing was kept. Begin again from yearthreethousand.' };
  }
  let key = null;
  try {
    const r = await fetchFn(OR_KEYS, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: slot.verifier, code_challenge_method: 'S256' }),
    });
    const d = await r.json().catch(() => null);
    key = r.ok && typeof d?.key === 'string' ? d.key.trim() : null;
  } catch { key = null; }
  if (!key || !/^sk-or-/.test(key)) {
    return { ok: false, line: 'OpenRouter did not hand over a key just now, so nothing was kept. Try again from yearthreethousand in a moment.' };
  }
  if (!put(store, KEY_SLOT, { key, at: now() })) {
    return { ok: false, line: 'This browser would not keep the key (a private window keeps nothing), so nothing changed.' };
  }
  return { ok: true, popup: !!slot.popup };
}

// THE PAGE'S HALF. One per page (main.js); Settings → Brain and the wake card
// both press wake().
//   consent(opts) → 'always' | 'once' | null       (consent.js)
//   setBrainConfig({ provider, key, model })        (brain.js: in use, and kept)
//   keepKey(provider, key)                          (brain.js: kept, not in use)
//   choose('openrouter')                            what Settings → Brain records for a choice
//   onConnected({ model, models, free, daily })     after the key is in use
//   onFailed(line)                                  when it could not be
export function createWake({
  consent, setBrainConfig, keepKey = null, choose = null, onConnected = null, onFailed = null,
  store = globalThis.localStorage, win = globalThis.window, fetchFn = (...a) => globalThis.fetch(...a),
  cryptoImpl = globalThis.crypto, now = Date.now,
} = {}) {
  // The pair is made ahead, so a press opens the window at once: a browser
  // lets a page open a window only inside the press that asked for it, and a
  // digest awaited first (crypto.subtle) can carry the opening past it.
  let pair = null;
  let making = null;
  function prepare() {
    if (pair || making) return making || Promise.resolve(pair);
    making = pkcePair(cryptoImpl).then((p) => { pair = p; return p; }).catch(() => null).finally(() => { making = null; });
    return making;
  }
  async function wake() {
    if (!pair) await prepare();
    const p = pair;
    pair = null;
    prepare();   // a pair is good for one connection
    if (!p) { onFailed?.('This browser cannot begin a connection (it has no secure random numbers).'); return false; }
    const answer = await consent(CONSENT);
    if (!answer) return false;
    const url = authUrl({ challenge: p.challenge, state: p.state, origin: win.location.origin });
    // the verifier is kept before the window can possibly come back
    put(store, PKCE_SLOT, { verifier: p.verifier, state: p.state, at: now(), popup: true });
    let w = null;
    try { w = win.open(url, 'y3k-openrouter', 'width=520,height=760,popup'); } catch { w = null; }
    if (!w) {
      // the window was blocked: the whole page goes, and comes back to /openrouter.html,
      // which sends it home with the key in the slot (take(), at the next load)
      put(store, PKCE_SLOT, { verifier: p.verifier, state: p.state, at: now(), popup: false });
      win.location.assign(url);
    }
    return true;
  }
  let taking = null;
  // → { model } once the key is in use, or null (no slot, a stale one, or a
  // key the site could not check: kept, and Settings → Brain can use it).
  function take() {
    if (taking) return taking;
    taking = (async () => {
      const slot = read(store, KEY_SLOT);
      if (!slot) return null;
      drop(store, KEY_SLOT);
      if (typeof slot.key !== 'string' || !/^sk-or-/.test(slot.key) || !(now() - (slot.at || 0) <= SLOT_MS)) return null;
      let d = null;
      try {
        const r = await fetchFn('/api/brain/models', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: slot.key, provider: 'openrouter' }),
        });
        d = await r.json();
      } catch { d = null; }
      const models = Array.isArray(d?.models) ? d.models : [];
      const model = models.length ? connectModel(models, d?.free) : null;
      if (!model) {
        keepKey?.('openrouter', slot.key);
        onFailed?.(models.length
          ? 'OpenRouter gave your presence a key, but has no free model to think with just now. Choose a model for it in Settings → Brain.'
          : 'OpenRouter gave your presence a key, but the site could not check it just now. It is kept in this browser: Settings → Brain can put it to use.');
        return null;
      }
      choose?.('openrouter');
      setBrainConfig({ provider: 'openrouter', key: slot.key, model });
      onConnected?.({ model, models, free: d?.free, daily: d?.daily || null });
      return { model };
    })().finally(() => { taking = null; });
    return taking;
  }
  // the window's key lands while this page is open (storage events reach the
  // OTHER tabs of this browser, and the window is one)
  function listen() {
    win?.addEventListener?.('storage', (e) => { if (e?.key === KEY_SLOT && e.newValue) take(); });
  }
  return { prepare, wake, take, listen };
}
