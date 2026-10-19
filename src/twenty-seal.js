// THE SEAL, OPENED ON THIS PAGE (twenty questions: src/twenty.js, twenty.mjs).
// When the presence thinks of something, the server shows this page only
// sha256(`${salt}:${secret}`) before the first question, and the secret and
// the salt when the game is over. The page hashes them HERE, with the
// browser's own crypto, and compares: the server is not asked whether the
// server was honest. Colin, 2026-10-19, on games: "tons of room to work on
// the world, new backgrounds, ui improvements, games, etc"; honesty is a house
// value, and this is how a presence shows it did not change its mind.
//
// No imports and no DOM, so the test runs this very file in Node against the
// server's own hash (test/twenty.test.mjs).

const HEX = /^[0-9a-f]{64}$/;

// → the seal of a secret and its salt, in lowercase hex, or null where the
// browser has no crypto.subtle (a page not on a secure connection: plain http
// on a local network address).
export async function sealOf(salt, secret) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(`${salt}:${secret}`);
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

// → true (it matches what was shown before the first question), false (it
// does not), or null (this browser cannot check: the page says so plainly,
// never that it matched).
export async function checkSeal(seal, reveal) {
  if (typeof seal !== 'string' || !HEX.test(seal)) return false;
  if (!reveal || typeof reveal.secret !== 'string' || typeof reveal.salt !== 'string') return false;
  const mine = await sealOf(reveal.salt, reveal.secret);
  return mine == null ? null : mine === seal;
}
