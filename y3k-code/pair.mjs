// Pairing a browser with the companion (REACH.md §5): a short code, shown or
// carried in the link the engine opens, that a page trades — once — for a token.
//
//  - 8 characters from an alphabet with no look-alikes, from the OS's CSPRNG
//  - valid for 5 minutes, single use, void after 5 wrong tries
//  - at most 5 claims a minute
//  - and the person confirms on THIS machine before the token is issued
//
// Tokens are 32 random bytes; only their sha256 is stored, so the token file is
// useless to anyone who reads it. They expire after 30 days unused.

import { randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_TTL = 5 * 60 * 1000;
const MAX_TRIES = 5;
const CLAIMS_PER_MIN = 5;
const TOKEN_IDLE = 30 * 86400 * 1000;

const sha = (s) => createHash('sha256').update(s).digest('hex');

export function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

// `load()`/`save(tokens)` persist {hash: {origin, agent, created, lastUsed}}.
export function createPairing({ load = () => ({}), save = () => {}, now = () => Date.now() } = {}) {
  let current = null; // { code, expires, tries }
  let claims = [];

  function issueCode() {
    current = { code: newCode(), expires: now() + CODE_TTL, tries: 0 };
    return current.code;
  }

  // Check a code without consuming it. 'ok' | 'bad' | 'expired' | 'limited'.
  function check(code) {
    const t = now();
    claims = claims.filter((c) => t - c < 60000);
    if (claims.length >= CLAIMS_PER_MIN) return 'limited';
    claims.push(t);
    if (!current || t > current.expires) return 'expired';
    const given = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const a = Buffer.from(given.padEnd(8, '\0').slice(0, 8));
    const b = Buffer.from(current.code);
    if (given.length !== 8 || !timingSafeEqual(a, b)) {
      current.tries++;
      if (current.tries >= MAX_TRIES) current = null;
      return 'bad';
    }
    return 'ok';
  }

  // After the person has confirmed: burn the code, mint a token.
  function mint(meta = {}) {
    current = null;
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
  function list() { return Object.values(load()).map(({ origin, agent, created, lastUsed }) => ({ origin, agent, created, lastUsed })); }

  return { issueCode, check, mint, verify, revokeAll, list, get code() { return current?.code || null; } };
}
