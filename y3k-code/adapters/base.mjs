// What every adapter provides, and the helpers they share.
//
// An adapter owns one vendor CLI process for one session and translates it into
// protocol.mjs events via `emit(ev)` (the engine stamps the sid and sequence).
// Its methods:
//   start(), send({text, attachments}), interrupt(), stop(),
//   setMode(mode), setModel(model), setEffort(effort),
//   answerPermission({requestId, decision, scope, updatedInput, message}),
//   answerQuestion({requestId, answers}), contextUsage(), limits(),
//   mcpToggle(name, enabled), mcpReconnect(name)
// and a `caps` object saying which of those really work, so the screen can
// disable what a vendor cannot do and say why.

export const CAPS_NONE = Object.freeze({
  modes: [], permissionPrompts: false, questions: false, planApproval: false, todos: false, subagents: false,
  diffs: false, contextUsage: false, limits: false, cost: false, mcpLive: false, resume: false, fork: false,
  models: false, effort: false, images: false,
});

// The kind of a tool, from its name, for the card and the risk colour.
export function toolKind(name) {
  const n = String(name || '');
  if (/^(Bash|BashOutput|KillShell|shell|command_execution|exec)$/i.test(n)) return 'bash';
  if (/^(Edit|MultiEdit|NotebookEdit|edit|file_change|apply_patch)$/i.test(n)) return 'edit';
  if (/^(Write|write|create)$/i.test(n)) return 'write';
  if (/^(Read|read|view|NotebookRead)$/i.test(n)) return 'read';
  if (/^(Glob|Grep|LS|glob|grep|list|search)$/i.test(n)) return 'search';
  if (/^(WebFetch|WebSearch|web_search|fetch)$/i.test(n)) return 'web';
  if (/^mcp__/.test(n)) return 'mcp';
  if (/^(Task|Agent)$/.test(n)) return 'task';
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList|todo)$/i.test(n)) return 'todo';
  if (/^(ExitPlanMode|EnterPlanMode)$/.test(n)) return 'plan';
  if (/^AskUserQuestion$/.test(n)) return 'question';
  return 'other';
}

// How much a tool can do, for colouring its permission card.
export function riskOf(kind) {
  if (kind === 'bash') return 'exec';
  if (kind === 'edit' || kind === 'write') return 'write';
  if (kind === 'web') return 'network';
  if (kind === 'mcp') return 'mcp';
  return 'read';
}

// Text for a tool result, from whatever shape the vendor used.
export function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text : b?.type === 'image' ? '[image]' : '')).join('\n');
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}

const MAX_OUTPUT = 64 * 1024;
export function capOutput(text) {
  const s = String(text ?? '');
  const bytes = Buffer.byteLength(s);
  return bytes <= MAX_OUTPUT ? { text: s, truncated: false, bytes } : { text: s.slice(0, MAX_OUTPUT) + '\n…', truncated: true, bytes };
}

// A one-line title for a tool card.
export function toolTitle(name, input = {}) {
  const i = input || {};
  const short = (p) => String(p || '').split(/[\\/]/).slice(-2).join('/');
  switch (toolKind(name)) {
    case 'bash': return i.description || String(i.command || '').split('\n')[0].slice(0, 120);
    case 'edit': case 'write': case 'read': return short(i.file_path || i.path || i.notebook_path);
    case 'search': return String(i.pattern || i.query || i.path || '').slice(0, 120);
    case 'web': return String(i.url || i.query || '').slice(0, 160);
    case 'task': return String(i.description || '').slice(0, 120);
    default: return name;
  }
}
