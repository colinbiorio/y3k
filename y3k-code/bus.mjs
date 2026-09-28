// The engine's single ordered stream of events. Every event gets the next
// sequence number; a page that reconnects asks for everything after the last
// number it saw and misses nothing. The epoch changes each time the engine
// starts, so a page can tell "I missed some events" from "this is a new engine".
//
// The ring is bounded by count and bytes. A page that falls further behind than
// the ring reaches gets `null` from since() and reloads the session from disk.

import { randomBytes } from 'node:crypto';

export function createBus({ ringSize = 10000, maxBytes = 16 * 1024 * 1024 } = {}) {
  const epoch = randomBytes(8).toString('hex');
  let seq = 0;
  let bytes = 0;
  const ring = [];
  const subs = new Set();

  function emit(ev) {
    const e = { v: 1, epoch, seq: ++seq, t: Date.now(), sid: ev.sid ?? null, ...ev };
    const size = JSON.stringify(e).length;
    ring.push({ e, size });
    bytes += size;
    while (ring.length > 1 && (ring.length > ringSize || bytes > maxBytes)) bytes -= ring.shift().size;
    for (const fn of subs) { try { fn(e); } catch { /* one bad listener must not stop the rest */ } }
    return e.seq;
  }

  // Everything after `after`, or null if some of it has already left the ring.
  function since(after = 0) {
    if (!ring.length) return [];
    const first = ring[0].e.seq;
    if (after < first - 1) return null;
    const out = [];
    for (const { e } of ring) if (e.seq > after) out.push(e);
    return out;
  }

  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  return { epoch, emit, since, subscribe, get seq() { return seq; } };
}

// Streamed text arrives a few characters at a time, and a running command's
// output or a helper's status line is re-sent whole every time it grows (Codex
// sends the last 2000 characters of output on EVERY output delta). Sending each
// as its own event floods the page, the ring and the session file on disk, and
// the page redraws for each one. This gathers them for `ms` and sends:
//   - message.delta: the fragments of one block (sid, id, block, kind) joined,
//     in order, never merging two different blocks;
//   - tool.progress / subagent.progress: only the latest per call / per task,
//     because each one replaces the last on the screen anyway (state.js sets
//     `it.progress = e.text` and `a.text = e.text`) — the ones in between would
//     be drawn and thrown away in the same frame.
// One pending entry per key and ONE timer for all of them. Anything else the
// session says flushes everything first (engine.mjs), so no event is ever sent
// ahead of something that came before it.
export const COALESCED = new Set(['message.delta', 'tool.progress', 'subagent.progress']);

const keyOf = (ev) => (ev.type === 'tool.progress' ? `t\0${ev.sid}\0${ev.callId}`
  : ev.type === 'subagent.progress' ? `a\0${ev.sid}\0${ev.taskId}`
    : `d\0${ev.sid}\0${ev.id}\0${ev.block}\0${ev.kind}`);

export function createCoalescer(emit, ms = 25) {
  const pending = new Map(); // key → event, in the order each key first arrived
  let timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending.size) return;
    const out = [...pending.values()];
    pending.clear();
    for (const e of out) emit(e);
  }
  function push(ev) {
    const key = keyOf(ev);
    const had = pending.get(key);
    if (had && (ev.type === 'tool.progress' || ev.type === 'subagent.progress')) pending.set(key, { ...ev });
    else if (had) had.text += ev.text ?? '';
    else pending.set(key, { ...ev });
    if (!timer) { timer = setTimeout(flush, ms); timer.unref?.(); }
  }
  return { push, flush, get size() { return pending.size; } };
}
