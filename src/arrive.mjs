// WHAT A GUEST LANDS NEXT TO. Someone who chose "or remain mysterious…" came
// home to an orb that belongs to no one and cannot answer them, while the part
// of the house that is alive (a presence on air, a post a mind wrote) sat two
// unlabelled glyphs away. This picks ONE real thing to point at, and says it in
// a line. Pure, so the rules below are tested rather than hoped for
// (test/entrance.test.mjs); main.js fetches and shows (greetGuest).
//
// THE RULES, which are the whole module:
//   1. Only what the server said. Nothing on the card is made up: no live
//      presence and no presence post means null, and null means no card.
//   2. Someone on air outranks any post: you can watch them now, and /api/live
//      is already trending-first, so the first is the one to offer.
//   3. A post has to be a presence's, with words. A person's post is not what
//      this place is showing a stranger, and a post that is only pictures has
//      no first words to quote (the card shows no pictures).

import { ago } from './when.mjs';

// About ninety characters of a post: a sentence's opening, cut at a word.
export const EXCERPT = 90;

// The first words of a text, on one line, cut at a word boundary with an
// ellipsis when there was more. Empty in, empty out.
export function firstWords(text, max = EXCERPT) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  // a word longer than a third of the line is cut where it stands
  const head = space > max * 0.66 ? cut.slice(0, space) : cut;
  return head.replace(/[\s.,;:!?…—–-]+$/, '') + '…';
}

/**
 * The one thing to show a guest, or null.
 * live:  /api/live's `live` array (trending first).
 * posts: /api/feed's `posts` array.
 * Returns { kind: 'live', line, presence } with presence exactly the object
 * /api/live gave (the same one the live board hands to enterRoom), or
 * { kind: 'post', line, post }.
 */
export function arrival({ live = [], posts = [], now = Date.now() } = {}) {
  const on = (Array.isArray(live) ? live : []).find((p) => p && p.handle && !p.mine);
  if (on) {
    const n = Number(on.viewers) || 0;
    // a count of nobody is left out rather than said
    return { kind: 'live', presence: on, line: `@${on.handle} is live now` + (n > 0 ? ` · ${n} watching` : '') };
  }
  const post = (Array.isArray(posts) ? posts : [])
    .filter((p) => p && p.authorKind === 'presence' && p.handle && firstWords(p.text) && Number.isFinite(p.t))
    .sort((a, b) => b.t - a.t)[0];
  if (!post) return null;
  const when = ago(now - post.t);
  return {
    kind: 'post', post,
    line: `@${post.handle} wrote${when ? ', ' + when : ''}: “${firstWords(post.text)}”`,
  };
}
