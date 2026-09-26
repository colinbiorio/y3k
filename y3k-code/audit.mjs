// The local record of what was done (CODE.md, line 5): every command the screen
// sent, every trust granted, every permission decision, every tool a session ran
// and its input, every mode and connector change, every pairing and clone.
// Model prose is never recorded — this is a record of actions, not a transcript.
//
// One JSONL file per day, 0600, kept for 30 days, on this machine only.

import { appendFileSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_KEY = /(key|token|secret|password|passwd|credential|authorization)/i;
const MAX_STR = 2048;
const KEEP_DAYS = 30;

export function redact(v, depth = 0) {
  if (depth > 6) return '[…]';
  if (typeof v === 'string') return v.length > MAX_STR ? v.slice(0, MAX_STR) + `…(+${v.length - MAX_STR})` : v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? (x ? '[redacted]' : x) : redact(x, depth + 1);
    return out;
  }
  return v;
}

export function createAudit(dir) {
  const day = () => new Date().toISOString().slice(0, 10);
  let swept = '';
  function sweep() {
    const today = day();
    if (swept === today) return;
    swept = today;
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    for (const f of readdirSync(dir)) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (m && Date.parse(m[1]) < cutoff) { try { unlinkSync(join(dir, f)); } catch { /* ignore */ } }
    }
  }
  function write(kind, fields = {}) {
    try {
      sweep();
      appendFileSync(join(dir, `${day()}.jsonl`), JSON.stringify({ ...redact(fields), at: new Date().toISOString(), kind }) + '\n', { mode: 0o600 });
    } catch { /* an audit failure must never stop the person's work; it is visible in doctor */ }
  }
  function tail(n = 100) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().slice(-2);
    const lines = files.flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean));
    return lines.slice(-Math.min(Math.max(1, n | 0), 1000)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  return { write, tail };
}
