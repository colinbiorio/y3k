// Connectors (MCP servers) the person adds for their coding sessions. Kept in
// the engine's own store (0600) and handed to each new session; the person's
// own tool configuration (~/.claude.json, a project's .mcp.json) still applies
// on its own. Adding one is a yes on this computer, with the exact command or
// address shown — a connector is a program or a service the coder can use.

export const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const HEADER_KEY = /^[A-Za-z0-9-]{1,64}$/;

export function checkServer({ name, transport, command, args = [], env = {}, url, headers = {} } = {}) {
  if (!NAME_RE.test(String(name || ''))) return { error: 'A connector name is letters, numbers, - and _.' };
  if (transport === 'stdio') {
    const cmd = String(command || '').trim();
    if (!cmd || /[\r\n\0]/.test(cmd) || cmd.length > 1000) return { error: 'Give the command that starts the connector.' };
    if (!Array.isArray(args) || args.length > 50 || args.some((a) => typeof a !== 'string' || a.length > 1000 || /[\0]/.test(a))) return { error: 'Arguments must be a short list of text.' };
    const e = {};
    for (const [k, v] of Object.entries(env || {})) {
      if (!ENV_KEY.test(k) || typeof v !== 'string' || v.length > 4000) return { error: `Bad environment variable ${String(k).slice(0, 40)}.` };
      e[k] = v;
    }
    return { server: { type: 'stdio', command: cmd, args, ...(Object.keys(e).length ? { env: e } : {}) } };
  }
  if (transport === 'http' || transport === 'sse') {
    let u;
    try { u = new URL(String(url || '')); } catch { return { error: 'Give the connector\'s address.' }; }
    if (!/^https?:$/.test(u.protocol)) return { error: 'A connector address is http(s).' };
    if (u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return { error: 'Plain http is only for connectors on this computer.' };
    const hd = {};
    for (const [k, v] of Object.entries(headers || {})) {
      if (!HEADER_KEY.test(k) || typeof v !== 'string' || v.length > 4000 || /[\r\n]/.test(v)) return { error: `Bad header ${String(k).slice(0, 40)}.` };
      hd[k] = v;
    }
    return { server: { type: transport, url: u.href, ...(Object.keys(hd).length ? { headers: hd } : {}) } };
  }
  return { error: 'A connector runs a command (stdio) or lives at an address (http).' };
}

// What the page may see: never a secret's value, only that it is set.
export function publicList(m) {
  return Object.entries(m?.mcpServers || {}).map(([name, c]) => ({
    name, transport: c.type || (c.url ? 'http' : 'stdio'), command: c.command || null, args: c.args || [], url: c.url || null,
    env: Object.keys(c.env || {}), headers: Object.keys(c.headers || {}),
  }));
}
