// Pairing a browser with the companion (REACH.md §5): a short code, shown or
// carried in the link the engine opens, that a page trades — once — for a token.
//
//  - 8 characters from an alphabet with no look-alikes, from the OS's CSPRNG
//  - valid for 5 minutes, single use, void after 5 wrong tries
//  - at most 5 claims a minute
//  - and the person confirms on THIS machine before the token is issued
//
// Or the other way round (`y3k-code --pair <CODE>`): the y3k page makes the code
// with crypto.getRandomValues, puts it at the end of the command it hands the
// person, and the person runs that command in their own terminal. Typing it on
// this machine IS the yes (CODE.md, line 7), so the code is registered as
// already approved: good for one claim, for 15 minutes, void after the same 5
// wrong tries, and only through the same /v1/pair door with the same Origin
// rule — a page on any other site still cannot knock.
//
// Tokens are 32 random bytes; only their sha256 is stored, so the token file is
// useless to anyone who reads it. They expire after 30 days unused.

import { randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_TTL = 5 * 60 * 1000;
export const PRE_TTL = 15 * 60 * 1000;
const MAX_TRIES = 5;
const CLAIMS_PER_MIN = 5;
const TOKEN_IDLE = 30 * 86400 * 1000;

const sha = (s) => createHash('sha256').update(s).digest('hex');

// A code as a person or a page may write it (any case, a dash or spaces in the
// middle) → the 8 characters, or null if it is not one of ours.
export function normalizeCode(c) {
  const s = String(c ?? '').toUpperCase().replace(/[\s-]/g, '');
  return s.length === 8 && [...s].every((ch) => ALPHABET.includes(ch)) ? s : null;
}

const same = (given, code) => {
  const a = Buffer.from(String(given).padEnd(8, '\0').slice(0, 8));
  const b = Buffer.from(code);
  return String(given).length === 8 && a.length === b.length && timingSafeEqual(a, b);
};

export function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

// `load()`/`save(tokens)` persist {hash: {origin, agent, created, lastUsed}}.
// `load()`/`save(tokens)` persist {hash: {origin, agent, created, lastUsed}}.
export function createPairing({ load = () => ({}), save = () => {}, now = () => Date.now() } = {}) {
  let current = null;  // { code, expires, tries } — shown in the terminal
  let previous = null; // the code `current` replaced early, still good until it expires
  let pre = null;      // { code, expires, tries } — from `--pair`, already approved here
  let claims = [];

  // `keep`: a fresh code printed a little before the old one runs out; whoever
  // is typing the old one from the terminal right now still gets in with it.
  function issueCode({ keep = false } = {}) {
    previous = keep && current && now() <= current.expires ? current : null;
    current = { code: newCode(), expires: now() + CODE_TTL, tries: 0 };
    return current.code;
  }

  // The code from `y3k-code --pair <CODE>`. False if it is not a code.
  function preapprove(code) {
    const c = normalizeCode(code);
    if (!c) return false;
    pre = { code: c, expires: now() + PRE_TTL, tries: 0 };
    return true;
  }

  // Check a code without consuming it. 'ok' (still needs a yes on the machine) |
  // 'preapproved' (the yes was the --pair command) | 'bad' | 'voided' (that was
  // the fifth wrong try; the shown code is dead) | 'expired' | 'limited'.
  function check(code) {
    const t = now();
    claims = claims.filter((c) => t - c < 60000);
    if (claims.length >= CLAIMS_PER_MIN) return 'limited';
    claims.push(t);
    if (pre && t > pre.expires) pre = null;
    if (previous && t > previous.expires) previous = null;
    const given = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pre && same(given, pre.code)) return 'preapproved';
    if (previous && same(given, previous.code)) return 'ok';
    const live = !!current && t <= current.expires;
    if (live && same(given, current.code)) return 'ok';
    // Wrong for every code that is live: it counts against each of them, so
    // none can be walked by guessing while another one is being tried.
    let voided = false;
    if (pre && ++pre.tries >= MAX_TRIES) { pre = null; voided = true; }
    if (previous && ++previous.tries >= MAX_TRIES) previous = null;
    if (!current) return pre ? 'bad' : voided ? 'voided' : 'expired';
    if (!live) return 'expired';
    if (++current.tries >= MAX_TRIES) { current = null; previous = null; return 'voided'; }
    return 'bad';
  }

  // After the person has confirmed (or ran --pair): burn the code, mint a token.
  function mint(meta = {}) {
    if (meta.preapproved) pre = null; else { current = null; previous = null; }
    const token = randomBytes(32).toString('base64url');
    const tokens = { ...load() };
    tokens[sha(token)] = { origin: String(meta.origin || '').slice(0, 200), agent: String(meta.agent || '').slice(0, 200), created: now(), lastUsed: now() };
    save(tokens);
    return token;
  }

  function verify(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return false;
    const tokens = load();
    const h = sha(token);
    const rec = tokens[h];
    if (!rec) return false;
    if (now() - (rec.lastUsed || rec.created) > TOKEN_IDLE) { const t = { ...tokens }; delete t[h]; save(t); return false; }
    if (now() - (rec.lastUsed || 0) > 60000) { save({ ...tokens, [h]: { ...rec, lastUsed: now() } }); }
    return true;
  }

  function revokeAll() { save({}); }
  // The browsers that can still get in (a token idle for 30 days no longer counts).
  function list() {
    return Object.values(load())
      .filter((r) => now() - (r.lastUsed || r.created || 0) <= TOKEN_IDLE)
      .map(({ origin, agent, created, lastUsed }) => ({ origin, agent, created, lastUsed }));
  }

  return {
    issueCode, preapprove, check, mint, verify, revokeAll, list,
    get code() { return current?.code || null; },
    get codeExpires() { return current?.expires || null; },
    get preapproved() { return !!pre && now() <= pre.expires; },
  };
}
