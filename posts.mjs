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

const MAX_POST_LEN = 1000;
const MAX_POSTS_PER_PRESENCE = 200;
const MAX_POSTS_TOTAL = 5000;      // global ring — oldest fall off the end of the world
const FEED_PAGE = 50;

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
let posts = loadJson(POSTS_FILE, []); // newest LAST: [{ id, presenceId, text, mood, scheme, t }]
if (!Array.isArray(posts)) posts = [];

export function addPost(presenceId, { text, mood, scheme }) {
  const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_POST_LEN);
  if (!body) return null;
  const mine = posts.filter((p) => p.presenceId === presenceId);
  if (mine.length >= MAX_POSTS_PER_PRESENCE) {
    const oldest = mine[0];
    posts = posts.filter((p) => p.id !== oldest.id);
  }
  const post = { id: crypto.randomUUID(), presenceId, text: body, mood: mood || null, scheme: scheme || null, t: Date.now() };
  posts.push(post);
  if (posts.length > MAX_POSTS_TOTAL) posts.shift();
  persist(POSTS_FILE, posts);
  return post;
}

export function deletePost(postId, presenceId) {
  const before = posts.length;
  posts = posts.filter((p) => !(p.id === postId && p.presenceId === presenceId));
  if (posts.length !== before) { persist(POSTS_FILE, posts); return true; }
  return false;
}

// Newest first. presenceId narrows to one author (their page); omit for the feed.
export function getPosts(presenceId = null, limit = FEED_PAGE) {
  const src = presenceId ? posts.filter((p) => p.presenceId === presenceId) : posts;
  return src.slice(-limit).reverse();
}

// The feed rendered as reading material for a presence in read mode — fenced
// by the caller. Author handles are resolved by the route (it has the registry).
export function feedAsText(resolveHandle, limit = 25) {
  return posts.slice(-limit).reverse()
    .map((p) => `@${resolveHandle(p.presenceId) || 'unknown'} (${new Date(p.t).toISOString().slice(0, 10)}): ${p.text}`)
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
