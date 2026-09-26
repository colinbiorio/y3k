// The one language between the y3k Code screen and the engine on the person's
// machine. Every adapter (Claude Code, Codex, Gemini, OpenCode) is translated
// INTO these events, and the screen speaks only these commands — so the page
// never needs to know which vendor's CLI is running, and a new vendor is a new
// adapter, not a new screen.
//
// src/code/protocol.js mirrors EVENTS, COMMANDS and MODES (the static server
// refuses y3k-code/, so the page cannot import this file); a test keeps the two
// identical.

export const PROTOCOL = 1;

// The four permission modes a person can pick, in the order Shift+Tab cycles
// them. Each adapter maps these onto its vendor's own names, and marks the ones
// it cannot do. The mode that skips every permission is not in this list, on
// purpose (CODE.md, line 4).
export const MODES = ['ask', 'plan', 'acceptEdits', 'auto'];

export const EVENTS = [
  // the engine and its providers
  'engine.hello', 'provider.status', 'consent.pending', 'consent.resolved', 'workspace.recent',
  'error', 'notice',
  // a session's life
  'session.started', 'session.ready', 'session.state', 'session.ended', 'session.title',
  'turn.started', 'turn.ended',
  // what is said
  'message.user', 'message.start', 'message.delta', 'message.block', 'message.end',
  // what is done
  'tool.call', 'tool.progress', 'tool.result',
  // what is asked
  'permission.request', 'permission.resolved', 'question.request', 'question.resolved', 'plan.proposed',
  // plans and helpers
  'todo.update', 'subagent.started', 'subagent.progress', 'subagent.ended',
  // meters
  'usage.turn', 'usage.context', 'usage.limits', 'usage.cost',
  // settings
  'mode.changed', 'model.changed', 'effort.changed', 'mcp.status',
  // the folder
  'files.changed', 'git.status', 'compact',
  // the vendor's own event, for the debug drawer only
  'raw',
];

const S = (max, required = true) => ({ type: 'string', max, required });
const N = (required = false) => ({ type: 'number', required });
const B = (required = false) => ({ type: 'boolean', required });
const O = (required = false) => ({ type: 'object', required });
const A = (required = false) => ({ type: 'array', required });

// Each command, and the fields it takes. Anything not listed is refused; long
// strings are refused rather than truncated, so nothing is silently changed.
export const COMMANDS = {
  'engine.hello': {},
  'provider.list': {},
  'provider.refresh': { provider: S(40, false) },
  'provider.install': { provider: S(40) },
  'provider.login': { provider: S(40), method: S(40, false) },
  'provider.setKey': { provider: S(40), key: S(400) },
  'provider.clearKey': { provider: S(40) },
  'models.list': { provider: S(40) },
  'workspace.pick': {},
  'workspace.browse': { path: S(4096, false) },
  'workspace.open': { path: S(4096) },
  'workspace.recent': {},
  'workspace.forget': { path: S(4096) },
  'git.status': { cwd: S(4096) },
  'git.diff': { cwd: S(4096), path: S(4096, false), staged: B() },
  'github.repos': { q: S(200, false) },
  'github.clone': { repo: S(200), dest: S(4096, false) },
  'session.start': { provider: S(40), cwd: S(4096), model: S(120, false), effort: S(20, false), mode: S(20, false), title: S(200, false), handoff: O() },
  'session.send': { sid: S(64), text: S(200000), attachments: A() },
  'session.interrupt': { sid: S(64) },
  'session.stop': { sid: S(64) },
  'session.setMode': { sid: S(64), mode: S(20) },
  'session.setModel': { sid: S(64), model: S(120) },
  'session.setEffort': { sid: S(64), effort: S(20) },
  'session.contextUsage': { sid: S(64) },
  'session.limits': { sid: S(64) },
  'session.list': { cwd: S(4096, false) },
  'session.load': { sid: S(64) },
  'session.resume': { provider: S(40), cwd: S(4096), providerSessionId: S(200, false), sid: S(64, false), fork: B() },
  'session.fork': { sid: S(64) },
  'session.toolOutput': { sid: S(64), callId: S(200) },
  'permission.answer': { sid: S(64), requestId: S(200), decision: S(10), scope: S(10, false), message: S(4000, false) },
  'question.answer': { sid: S(64), requestId: S(200), answers: O(true) },
  'mcp.list': {},
  'mcp.add': { name: S(64), transport: S(10), command: S(1000, false), args: A(), env: O(), url: S(2000, false), headers: O() },
  'mcp.remove': { name: S(64) },
  'mcp.toggle': { sid: S(64, false), name: S(64), enabled: B(true) },
  'mcp.reconnect': { sid: S(64), name: S(64) },
  'cloud.check': { ref: S(300), cwd: S(4096, false) },
  'cloud.bring': { ref: S(300), cwd: S(4096), method: S(20) },
  'audit.tail': { n: N() },
};

const CMD_KEYS = new Set(['id', 'cmd']);

// { ok: true } or { ok: false, error }. Never throws.
export function validateCommand(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'not an object' };
  const spec = Object.hasOwn(COMMANDS, obj.cmd) ? COMMANDS[obj.cmd] : null;
  if (!spec) return { ok: false, error: `unknown command ${String(obj.cmd).slice(0, 40)}` };
  if (obj.id != null && (typeof obj.id !== 'string' || obj.id.length > 64)) return { ok: false, error: 'bad id' };
  for (const k of Object.keys(obj)) if (!CMD_KEYS.has(k) && !Object.hasOwn(spec, k)) return { ok: false, error: `unexpected field ${k.slice(0, 40)}` };
  for (const [k, rule] of Object.entries(spec)) {
    const v = obj[k];
    if (v == null) { if (rule.required) return { ok: false, error: `missing ${k}` }; continue; }
    if (rule.type === 'array' ? !Array.isArray(v) : rule.type === 'object' ? (typeof v !== 'object' || Array.isArray(v)) : typeof v !== rule.type) {
      return { ok: false, error: `${k} must be ${rule.type}` };
    }
    if (rule.type === 'string' && v.length > rule.max) return { ok: false, error: `${k} is too long` };
  }
  if ('mode' in obj && obj.mode != null && !MODES.includes(obj.mode)) return { ok: false, error: 'unknown mode' };
  return { ok: true };
}
