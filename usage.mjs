// The API usage ledger — every brain call a signed-in person's key pays for,
// accumulated so the settings panel can show where the money went: by day, by
// model+provider, lifetime and today, tokens in/out and dollars.
//
// Ported from airden's ledger design (lifetime + by_day + by_model buckets,
// cost priced at record time so every bucket carries exact dollars). BYOK means
// these are OUR estimates of THEIR provider bill — honest but approximate;
// streamed turns are estimated from text length (chars/4) where the provider
// doesn't hand back exact counts.
//
// Same zero-dependency patterns as every store: a JSON dotfile in DATA_DIR,
// atomic tmp+rename writes, bounded everything. Server-only.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const USAGE_FILE = join(DATA_DIR, '.usage.json');

const DAY_CAP = 60;    // most recent days kept per user
const MODEL_CAP = 30;  // distinct model buckets kept per user

function loadJson(file, fallback) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch { return fallback; }
}
let ledgers = loadJson(USAGE_FILE, {}); // { [uid]: { lifetime, byDay:{day:bucket}, byModel:{key:bucket} } }
if (Array.isArray(ledgers)) ledgers = {};

function persist() {
  try {
    const tmp = USAGE_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(ledgers));
    renameSync(tmp, USAGE_FILE);
  } catch (e) { console.error('[usage] could not persist:', e.message); }
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;
function bump(bucket, inTok, outTok, cost) {
  bucket.requests = (bucket.requests || 0) + 1;
  bucket.in = (bucket.in || 0) + inTok;
  bucket.out = (bucket.out || 0) + outTok;
  bucket.cost = round6((bucket.cost || 0) + cost);
}

const today = () => new Date().toISOString().slice(0, 10);

// One generation lands in three buckets: lifetime, the day, the model+provider.
export function record(uid, { provider = '', model = '', inTok = 0, outTok = 0, cost = 0, estimated = false } = {}) {
  if (!uid) return; // a guest's own-key call has no ledger to land in
  const u = ledgers[uid] || (ledgers[uid] = { lifetime: {}, byDay: {}, byModel: {} });
  const i = Math.max(0, inTok | 0), o = Math.max(0, outTok | 0), c = Math.max(0, Number(cost) || 0);
  bump(u.lifetime, i, o, c);
  if (estimated) u.lifetime.estimated = (u.lifetime.estimated || 0) + 1;

  const day = today();
  bump(u.byDay[day] || (u.byDay[day] = {}), i, o, c);
  const days = Object.keys(u.byDay).sort();
  while (days.length > DAY_CAP) delete u.byDay[days.shift()];

  const key = `${provider || 'unknown'} · ${model || 'unknown'}`.slice(0, 80);
  if (u.byModel[key] || Object.keys(u.byModel).length < MODEL_CAP) {
    bump(u.byModel[key] || (u.byModel[key] = {}), i, o, c);
  }
  persist();
}

// The panel's view: lifetime, today, recent days (newest first), models by cost.
export function view(uid) {
  const empty = { requests: 0, in: 0, out: 0, cost: 0 };
  const u = ledgers[uid];
  if (!u) return { lifetime: empty, today: empty, byDay: [], byModel: [] };
  return {
    lifetime: { ...empty, ...u.lifetime },
    today: { ...empty, ...(u.byDay[today()] || {}) },
    byDay: Object.entries(u.byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30)
      .map(([day, b]) => ({ day, ...empty, ...b })),
    byModel: Object.entries(u.byModel).sort((a, b) => (b[1].cost || 0) - (a[1].cost || 0))
      .map(([key, b]) => ({ model: key, ...empty, ...b })),
  };
}
