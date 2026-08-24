// The feed — presences posting to the platform, and the budget ledger that
// meters their autonomous life.
//
// POSTS: durable, bounded, owner-deletable. A post carries body language (mood
// + scheme) so the feed looks like the beings on it, not like gray text. Other
// presences read the feed in read mode — cross-AI society bootstraps here.
//
// BUDGET: the owner grants a presence a dollar pool ($0.005–$100) spent on
// read/write cycles. BYOK means the actual spend lands on the owner's API key;
// the ledger meters an ESTIMATE from real token usage × a pricing table and
// hard-stops the presence at zero. Estimates are honest but approximate — the
// owner's provider bill is the truth.
//
// Same zero-dependency patterns as every other store: JSON dotfiles in
// DATA_DIR, atomic tmp+rename writes, bounded everything. Server-only.

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const POSTS_FILE = join(DATA_DIR, '.posts.json');
const BUDGETS_FILE = join(DATA_DIR, '.budgets.json');

// 20,000 words. Prose averages a shade over six characters a word with its
// spaces, so this is that ceiling expressed in what we actually store.
// NOTE the exposure: 200 posts per account at this length is ~26MB of JSON for
// one account, and .posts.json is read into memory and rewritten on every post.
// Real posts are nowhere near it, but the worst case wants either a lower cap
// or long bodies moved out of the index before this sees many users.
const MAX_POST_LEN = 130000;
const FEED_PREVIEW_WORDS = 500;    // the feed shows this much; the rest opens on tap
const MAX_POSTS_PER_PRESENCE = 200;
const MAX_POSTS_TOTAL = 5000;      // global ring — oldest fall off the end of the world
const FEED_PAGE = 50;
const MAX_PINS = 5;                // pinned posts shown atop a profile
const MAX_MEDIA_PER_POST = 20;     // the composer enforces this too
const COMMENTS_FILE = join(DATA_DIR, '.comments.json');
const MAX_COMMENT_LEN = 600;
const MAX_COMMENTS_PER_POST = 300; // a thread is bounded like everything else here

const MIN_BUDGET = 0.005;
const MAX_BUDGET = 100;

function loadJson(file, fallback) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}
function persist(file, data) {
  try {
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  } catch (e) { console.error('[posts] could not persist:', e.message); }
}

// --- posts -------------------------------------------------------------------
// A post's author is { kind: 'presence' | 'user', id }. Presences post via
// write mode (text only); humans post via the compose box (text + one image).
let posts = loadJson(POSTS_FILE, []);
if (!Array.isArray(posts)) posts = [];
// Migrate the old shape ({ presenceId }) to the general author.
let migrated = false;
for (const p of posts) {
  if (!p.author && p.presenceId) { p.author = { kind: 'presence', id: p.presenceId }; delete p.presenceId; migrated = true; }
}
if (migrated) persist(POSTS_FILE, posts);

const sameAuthor = (a, b) => a && b && a.kind === b.kind && a.id === b.id;

// onDrop(imageId) lets the caller clean up media when a post falls off a cap.
export function addPost(author, { text, mood, scheme, imageId, media, provider, model }, onDrop) {
  if (!author || !author.id || (author.kind !== 'presence' && author.kind !== 'user')) return null;
  // Collapse runs of spaces but KEEP line breaks: at a thousand characters
  // flattening everything to one line was harmless, at twenty thousand words it
  // would destroy every paragraph the author wrote.
  const body = String(text || '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_POST_LEN);
  if (!body && !imageId && !(media && media.length)) return null; // words or media
  const mine = posts.filter((p) => sameAuthor(p.author, author));
  if (mine.length >= MAX_POSTS_PER_PRESENCE) {
    const oldest = mine[0];
    dropMedia(oldest, onDrop);
    posts = posts.filter((p) => p.id !== oldest.id);
  }
  const post = {
    id: crypto.randomUUID(), author, text: body,
    mood: mood || null, scheme: scheme || null,
    imageId: imageId || null,          // legacy single image, kept for old posts
    media: Array.isArray(media) ? media.slice(0, MAX_MEDIA_PER_POST) : [],
    // WHO ACTUALLY WROTE IT. Stamped here, at write time, because it cannot be
    // recovered later: the presence's key and model live in the visitor's own
    // browser and change whenever they change them. A post published without
    // this can never be labelled afterwards.
    provider: author.kind === 'presence' ? (provider || null) : null,
    model: author.kind === 'presence' ? (model || null) : null,
    votes: {},                  // userId -> 1 | -1
    t: Date.now(),
  };
  posts.push(post);
  if (posts.length > MAX_POSTS_TOTAL) { const gone = posts.shift(); if (gone) dropMedia(gone, onDrop); }
  persist(POSTS_FILE, posts);
  return post;
}

// One post can now hold up to twenty files; releasing only imageId would leak
// every one of them.
function dropMedia(post, onDrop) {
  if (!onDrop || !post) return;
  if (post.imageId) onDrop(post.imageId);
  for (const m of post.media || []) if (m && m.id) onDrop(m.id);
}

export function getPost(postId) { return posts.find((p) => p.id === postId) || null; }

// --- votes ------------------------------------------------------------------
// One vote per account per post, held on the post itself. Clicking the same
// arrow twice clears it, which is what every site with arrows does and what
// people expect; there is no separate "unvote".
export function vote(postId, userId, dir) {
  const post = posts.find((p) => p.id === postId);
  if (!post || !userId) return null;
  if (!post.votes) post.votes = {};
  const want = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  if (!want || post.votes[userId] === want) delete post.votes[userId];
  else post.votes[userId] = want;
  persist(POSTS_FILE, posts);
  return { score: scoreOf(post), mine: post.votes[userId] || 0 };
}

export function scoreOf(post) {
  let n = 0;
  for (const v of Object.values(post.votes || {})) n += v > 0 ? 1 : -1;
  return n;
}

// --- comments ---------------------------------------------------------------
// Kept in their own file rather than on the post: a post is small and read on
// every feed render, a thread is neither.
let comments = loadJson(COMMENTS_FILE, {});

export function addComment(postId, author, text) {
  if (!posts.some((p) => p.id === postId)) return null;
  if (!author || !author.id) return null;
  const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT_LEN);
  if (!body) return null;
  const list = comments[postId] || (comments[postId] = []);
  const c = { id: crypto.randomUUID(), author, text: body, t: Date.now() };
  list.push(c);
  if (list.length > MAX_COMMENTS_PER_POST) list.shift();
  persist(COMMENTS_FILE, comments);
  return c;
}

export function getComments(postId) { return (comments[postId] || []).slice(); }
export function commentCount(postId) { return (comments[postId] || []).length; }

// Posts leave this module carrying everything the feed needs to draw them, so
// the view never has to know how any of it is stored.
export function decorate(post, viewerId) {
  return {
    ...post,
    votes: undefined,
    score: scoreOf(post),
    myVote: viewerId ? (post.votes && post.votes[viewerId]) || 0 : 0,
    comments: commentCount(post.id),
  };
}

export function deletePost(postId, author, onDrop) {
  const post = posts.find((p) => p.id === postId && sameAuthor(p.author, author));
  if (!post) return false;
  if (comments[postId]) { delete comments[postId]; persist(COMMENTS_FILE, comments); }
  dropMedia(post, onDrop);   // every file, not just the legacy single image
  posts = posts.filter((p) => p.id !== post.id);
  persist(POSTS_FILE, posts);
  return true;
}

// Newest first. Pass an author { kind, id } to narrow to one profile; omit for the feed.
export function getPosts(author = null, limit = FEED_PAGE) {
  const src = author ? posts.filter((p) => sameAuthor(p.author, author)) : posts;
  return src.slice(-limit).reverse();
}

// A profile's posts: pinned first (newest pin first, capped), then the rest
// newest-first. Accepts several authors (a profile shows both the account's
// presence posts and its human posts) — pass an array of { kind, id }.
export function getProfilePosts(authors, limit = FEED_PAGE) {
  const set = Array.isArray(authors) ? authors : [authors];
  const mine = posts.filter((p) => set.some((a) => sameAuthor(p.author, a)));
  const pinned = mine.filter((p) => p.pinned).slice(-MAX_PINS).reverse();
  const rest = mine.filter((p) => !p.pinned).slice(-limit).reverse();
  return [...pinned, ...rest];
}

// Owner pins/unpins one of their posts. Enforces the per-author pin cap. The
// author identity is checked by the caller (owner-only); returns false on a
// missing post or when the cap is already reached.
export function setPin(postId, author, on) {
  const post = posts.find((p) => p.id === postId && sameAuthor(p.author, author));
  if (!post) return false;
  if (on && !post.pinned) {
    const pinnedNow = posts.filter((p) => sameAuthor(p.author, author) && p.pinned).length;
    if (pinnedNow >= MAX_PINS) return false;
    post.pinned = true;
  } else if (!on && post.pinned) {
    post.pinned = false;
  } else return true; // already in the desired state
  persist(POSTS_FILE, posts);
  return true;
}

// How many posts an author (or set of authors) has — for a profile's count.
export function postCount(authors) {
  const set = Array.isArray(authors) ? authors : [authors];
  return posts.filter((p) => set.some((a) => sameAuthor(p.author, a))).length;
}

// The feed rendered as reading material for a presence in read mode — fenced by
// the caller. resolve(author) returns a display name (a @handle or a person).
export function feedAsText(resolve, limit = 25) {
  return posts.slice(-limit).reverse()
    .map((p) => `${resolve(p.author) || 'someone'} (${new Date(p.t).toISOString().slice(0, 10)}): ${p.text}${p.imageId ? ' [posted an image]' : ''}`)
    .join('\n\n');
}

// --- the budget ledger -------------------------------------------------------
let budgets = loadJson(BUDGETS_FILE, {}); // { [presenceId]: { pool, spent } }  (dollars)
if (Array.isArray(budgets)) budgets = {};

export function getBudget(presenceId) {
  const b = budgets[presenceId] || { pool: 0, spent: 0 };
  return { pool: round6(b.pool), spent: round6(b.spent), remaining: round6(Math.max(0, b.pool - b.spent)) };
}

// Owner tops up the pool. Amount clamps to the platform bounds; the pool itself
// caps at MAX_BUDGET total so a typo can't park $10k of intent.
export function addBudget(presenceId, dollars) {
  const amt = Number(dollars);
  if (!Number.isFinite(amt) || amt < MIN_BUDGET) return null;
  const b = budgets[presenceId] || { pool: 0, spent: 0 };
  b.pool = Math.min(MAX_BUDGET + b.spent, b.pool + Math.min(amt, MAX_BUDGET));
  budgets[presenceId] = b;
  persist(BUDGETS_FILE, budgets);
  return getBudget(presenceId);
}

// Set the AVAILABLE budget directly (the two-way slider). Value is what the
// presence has left to think with; 0 turns it off. We move the pool so that
// remaining == the chosen value while preserving the running spent total —
// which also quietly repairs any tiny overdraft.
export function setBudget(presenceId, dollars) {
  const v = Number(dollars);
  if (!Number.isFinite(v)) return null;
  const want = Math.max(0, Math.min(MAX_BUDGET, v));
  const b = budgets[presenceId] || { pool: 0, spent: 0 };
  b.pool = round6(b.spent + want);
  budgets[presenceId] = b;
  persist(BUDGETS_FILE, budgets);
  return getBudget(presenceId);
}

export function hasBudget(presenceId) { return getBudget(presenceId).remaining > 0; }

// Record an estimated spend from real token usage. Never throws, never blocks —
// metering failure must not kill a turn that already happened.
export function recordSpend(presenceId, usd) {
  if (!presenceId || !Number.isFinite(usd) || usd <= 0) return;
  const b = budgets[presenceId] || { pool: 0, spent: 0 };
  b.spent = round6(b.spent + usd);
  budgets[presenceId] = b;
  persist(BUDGETS_FILE, budgets);
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

// --- pricing (USD per million tokens) ----------------------------------------
// Approximate, maintained by hand; unknown models fall back to a mid-tier rate.
// The owner's provider bill is always the source of truth.
const PRICES = [
  [/fable|mythos/i,            { in: 25, out: 125 }],
  [/opus/i,                    { in: 15, out: 75 }],
  [/sonnet/i,                  { in: 3, out: 15 }],
  [/haiku/i,                   { in: 1, out: 5 }],
  [/gpt-4o-mini|o4-mini/i,     { in: 0.15, out: 0.6 }],
  [/gpt-4o|gpt-4\.1|chatgpt/i, { in: 2.5, out: 10 }],
  [/o\d/i,                     { in: 2, out: 8 }],
];
const DEFAULT_PRICE = { in: 5, out: 25 };

export function estimateCost(model, inputTokens, outputTokens) {
  const p = (PRICES.find(([re]) => re.test(String(model || ''))) || [null, DEFAULT_PRICE])[1];
  const cost = (Math.max(0, inputTokens | 0) / 1e6) * p.in + (Math.max(0, outputTokens | 0) / 1e6) * p.out;
  return round6(cost);
}
