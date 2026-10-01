// THE ORB, FOR THE CODER. The orb beside y3kode is the face of whoever the
// person is talking to — and that is the coder as much as their presence. So
// every coding session, whichever client runs it (Claude Code, Codex, Gemini
// CLI, OpenCode), is given one tool of y3k's own: `orb`, which moves it, in the
// same short words a person types into the chat (color/red/form/heart).
//
// The tool is a tiny MCP server inside this engine — streamable HTTP, answered
// with plain JSON, no event stream — at http://127.0.0.1:<port>/mcp/<sid>. Its
// door is not the page's door (http.mjs):
//   - only a client the engine started knows the way in: each session gets its
//     own random token, handed to its client in the MCP config and nowhere
//     else, and dropped when the session ends
//   - nothing that carries an Origin gets in — every browser page does, and an
//     MCP client never does
//   - all it can do is ask the page to move the orb. It reads nothing, runs
//     nothing, touches no file; the page parses the words (src/tags.mjs, the
//     chat's own kommands) and answers what it understood, and that answer is
//     what the coder hears back.
//
// The page answers with `orb.done`. No page open on this computer: the coder
// is told so at once. A page that does not answer in time: told it was sent.

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const ORB_SERVER = 'y3k';
export const ORB_TOOL = 'orb';
export const ORB_TOOL_ID = `mcp__${ORB_SERVER}__${ORB_TOOL}`;   // Claude Code's and Codex's name for it
export const KOMMAND_MAX = 400;                                   // src/tags.mjs: no kommand is longer
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ANSWER_MS = 2500;

// The words, for the coder. A test keeps every one of them a word the page knows.
export const WORDS = {
  colors: ['red', 'orange', 'gold', 'yellow', 'green', 'mint', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose', 'white', 'silver'],
  palettes: ['aurora', 'ember', 'abyss', 'terra', 'eclipse', 'bloom', 'verdant', 'dusk', 'frost', 'synthwave', 'stardust'],
  forms: ['sphere', 'heart', 'ring', 'knot', 'helix', 'spiral', 'cube', 'disc', 'shell', 'lattice', 'moon', 'butterfly', 'clover', 'plume', 'nautilus', 'mobius', 'hopf'],
  moods: ['calm', 'thinking', 'listening', 'excited', 'tender', 'glitch'],
  paces: ['slow', 'normal', 'fast'],
  rooms: ['metal room', 'deep space', 'underwater', 'snowy taiga', 'dunes at dusk', 'crystal cavern', 'above the clouds', 'volcanic'],
};

export const TOOL = {
  name: ORB_TOOL,
  title: 'Move the orb',
  description:
    'Move the orb: the living sphere of light beside this chat in y3k (yearthreethousand), the face the person sees while you work. ' +
    'Use it to show how the work is going and to express yourself — a mood as you start something, a colour or a form when something lands, ' +
    'glitch when something breaks, anything playful the person asks for. It never touches the computer or the code.\n\n' +
    'Write it in y3k\'s kommand words: key/value pairs joined by slashes, in any order; case and spaces do not matter.\n' +
    `  color/<colour>        one or several: color/red, color/red,blue (${WORDS.colors.join(', ')}, …)\n` +
    `  color/<palette>       a whole palette: ${WORDS.palettes.join(', ')}\n` +
    `  form/<form>           ${WORDS.forms.join(', ')}, … — form/home goes back to its own shape\n` +
    `  mood/<mood>           ${WORDS.moods.join(', ')}\n` +
    '  size/<0-9>            how big the form is\n' +
    `  pace/<pace>           ${WORDS.paces.join(', ')}\n` +
    `  background/<room>     ${WORDS.rooms.join(', ')}\n` +
    'Examples: mood/thinking · color/gold/form/heart/mood/excited · color/ember/pace/fast · mood/glitch · form/home/color/aurora\n' +
    'It answers with what the orb understood, or why it did not — and the words to try instead.',
  inputSchema: {
    type: 'object',
    properties: { kommand: { type: 'string', maxLength: KOMMAND_MAX, description: 'What the orb should do, e.g. color/blue/form/ring/mood/calm' } },
    required: ['kommand'],
    additionalProperties: false,
  },
  annotations: { title: 'Move the orb', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// hasPage(): is any screen listening? emit(ev): to the screens. version: the engine's.
export function createOrb({ emit, hasPage = () => true, version = '0.1.0', answerMs = ANSWER_MS, now = () => Date.now() } = {}) {
  const tokens = new Map();    // sid → token
  const waiting = new Map();   // move id → { resolve, timer }
  let n = 0;

  // The MCP server entry for a session's client, in y3k's connector shape
  // (mcp.mjs) — each adapter turns it into its own client's.
  function server(sid, base) {
    if (!tokens.has(sid)) tokens.set(sid, randomBytes(24).toString('base64url'));
    return { type: 'http', url: `${base}/mcp/${sid}`, headers: { Authorization: `Bearer ${tokens.get(sid)}` } };
  }
  function close(sid) { tokens.delete(sid); }
  // the Authorization header a request carried, checked against its session's
  function allowed(sid, auth) {
    const t = tokens.get(sid);
    const m = /^Bearer\s+(\S+)$/i.exec(String(auth || ''));
    return !!(t && m && same(m[1], t));
  }

  // Ask the page to move it; resolve with what it said.
  function move(sid, kommand) {
    if (!hasPage()) return Promise.resolve({ ok: false, why: 'No y3k window is open on this computer right now, so the orb did not move.' });
    const id = `o${++n}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: true, said: kommand, unconfirmed: true }); }, answerMs);
      waiting.set(id, { resolve, timer });
      emit({ type: 'orb.move', sid, id, kommand, at: now() });
    });
  }
  // The page's answer (the `orb.done` command). The first answer wins.
  function done({ id, ok, said, why }) {
    const w = waiting.get(id);
    if (!w) return false;
    clearTimeout(w.timer);
    waiting.delete(id);
    w.resolve({ ok: !!ok, said: typeof said === 'string' ? said.slice(0, KOMMAND_MAX) : '', why: typeof why === 'string' ? why.slice(0, 600) : '' });
    return true;
  }

  const result = (id, r) => ({ jsonrpc: '2.0', id, result: r });
  const error = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  // One JSON-RPC message → its answer, or null for a notification.
  async function one(sid, msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(msg?.id, -32600, 'Invalid request');
    const id = msg.id;
    const note = id === undefined || id === null;
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return result(id, {
          protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: ORB_SERVER, title: 'y3k', version },
          instructions: 'y3k\'s orb is the face the person sees beside this chat. Move it with the orb tool to show how the work is going.',
        });
      }
      case 'ping': return note ? null : result(id, {});
      case 'tools/list': return result(id, { tools: [TOOL] });
      case 'tools/call': {
        const p = msg.params || {};
        if (p.name !== ORB_TOOL) return error(id, -32602, `Unknown tool: ${String(p.name).slice(0, 60)}`);
        const k = p.arguments?.kommand;
        if (typeof k !== 'string' || !k.trim()) return result(id, { content: [{ type: 'text', text: 'Say what the orb should do, e.g. color/blue/mood/calm.' }], isError: true });
        if (k.length > KOMMAND_MAX) return result(id, { content: [{ type: 'text', text: `Keep it under ${KOMMAND_MAX} characters.` }], isError: true });
        const r = await move(sid, k.replace(/[\u0000-\u001f]/g, ' ').trim());
        const text = !r.ok ? `The orb did not move: ${r.why || 'it did not understand that.'}`
          : r.unconfirmed ? `Sent to the orb: ${r.said}`
          : `The orb moved: ${r.said || k}`;
        return result(id, { content: [{ type: 'text', text }], isError: !r.ok });
      }
      default:
        if (note) return null;   // notifications/initialized, cancelled, … — nothing to say
        return error(id, -32601, `Method not found: ${msg.method.slice(0, 60)}`);
    }
  }

  // A POSTed body (one message or a batch) → what to send back, or null (202).
  async function rpc(sid, body) {
    if (Array.isArray(body)) {
      if (!body.length || body.length > 20) return error(null, -32600, 'Invalid request');
      const out = (await Promise.all(body.map((m) => one(sid, m)))).filter(Boolean);
      return out.length ? out : null;
    }
    return one(sid, body);
  }

  return { server, close, allowed, move, done, rpc, get open() { return tokens.size; }, get waiting() { return waiting.size; } };
}
