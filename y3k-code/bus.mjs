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

// Streamed text arrives a few characters at a time. Sending each fragment as its
// own event would flood the page and the ring; this gathers the fragments of
// one block for `ms` and sends them as one delta, in order, never merging two
// different blocks.
export function createCoalescer(emit, ms = 25) {
  let pending = null;
  let timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) { const p = pending; pending = null; emit(p); }
  }
  function push(ev) {
    if (pending && pending.sid === ev.sid && pending.id === ev.id && pending.block === ev.block && pending.kind === ev.kind) {
      pending.text += ev.text;
      return;
    }
    flush();
    pending = { ...ev };
    timer = setTimeout(flush, ms);
    timer.unref?.();
  }
  return { push, flush };
}
