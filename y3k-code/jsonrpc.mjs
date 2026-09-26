// JSON-RPC 2.0 over a child process's stdio, one message per line — how Codex's
// app-server and every Agent Client Protocol agent (Gemini CLI, OpenCode's acp)
// talk. Both sides make requests: we ask the agent to start a turn, and it asks
// us whether it may run a command.
//
//   const rpc = createRpc(child, { onNotify, onRequest, onBad })
//   await rpc.request('initialize', {...})        → result, or throws RpcError
//   rpc.notify('initialized', {})
//   onRequest(method, params, id) → a result (or a promise of one); throw to
//   answer with an error. Requests nobody handles are answered "method not found".

import { ndjson } from './proc.mjs';

export class RpcError extends Error {
  constructor(error) {
    super(String(error?.message || 'rpc error'));
    this.code = error?.code;
    this.data = error?.data;
  }
}

export function createRpc(child, { onNotify = () => {}, onRequest = null, onBad = () => {}, timeoutMs = 120000 } = {}) {
  let next = 1;
  const waiting = new Map();
  let closed = false;

  const write = (msg) => {
    if (closed || !child.stdin || child.stdin.destroyed) return false;
    try { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n'); return true; } catch { return false; }
  };

  ndjson(child.stdout, async (m) => {
    if (!m || typeof m !== 'object') return;
    // a response to one of ours
    if (m.id != null && !m.method && (Object.hasOwn(m, 'result') || Object.hasOwn(m, 'error'))) {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      clearTimeout(w.t);
      if (m.error) w.reject(new RpcError(m.error)); else w.resolve(m.result);
      return;
    }
    // a request from the agent
    if (m.method && m.id != null) {
      if (!onRequest) return write({ id: m.id, error: { code: -32601, message: `${m.method} is not supported by this client` } });
      try {
        const result = await onRequest(m.method, m.params || {}, m.id);
        if (result === undefined) return write({ id: m.id, error: { code: -32601, message: `${m.method} is not supported by this client` } });
        write({ id: m.id, result });
      } catch (err) {
        write({ id: m.id, error: { code: err?.code ?? -32603, message: String(err?.message || err).slice(0, 500) } });
      }
      return;
    }
    if (m.method) { onNotify(m.method, m.params || {}); return; }
    onBad(JSON.stringify(m).slice(0, 300));
  }, (line) => onBad(line.slice(0, 300)));

  child.on('exit', () => {
    closed = true;
    for (const w of waiting.values()) { clearTimeout(w.t); w.reject(new RpcError({ code: -32000, message: 'the agent exited' })); }
    waiting.clear();
  });

  function request(method, params = {}, { timeout = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const id = next++;
      const t = setTimeout(() => { waiting.delete(id); reject(new RpcError({ code: -32001, message: `${method} timed out` })); }, timeout);
      t.unref?.();
      waiting.set(id, { resolve, reject, t });
      if (!write({ id, method, params })) { clearTimeout(t); waiting.delete(id); reject(new RpcError({ code: -32000, message: 'the agent is not running' })); }
    });
  }

  const notify = (method, params = {}) => write({ method, params });
  // Answer a request later (when the person decides), by its id.
  const respond = (id, result) => write({ id, result });
  const respondError = (id, message, code = -32000) => write({ id, error: { code, message } });

  return { request, notify, respond, respondError, get closed() { return closed; } };
}
