// The page's copy of the engine's vocabulary (y3k-code/protocol.mjs). The
// static server refuses y3k-code/, so the page cannot import the original;
// test/code-client.test.mjs keeps the two identical.

export const PROTOCOL = 1;

// Shift+Tab cycles these, in this order. The mode that skips every permission
// is not among them, on purpose (CODE.md, line 4).
export const MODES = ['ask', 'plan', 'acceptEdits', 'auto'];

export const EVENTS = [
  'engine.hello', 'provider.status', 'consent.pending', 'consent.resolved', 'workspace.recent', 'error',
  'notice', 'session.started', 'session.ready', 'session.state', 'session.ended', 'session.title',
  'turn.started', 'turn.ended', 'message.user', 'message.start', 'message.delta', 'message.block',
  'message.end', 'tool.call', 'tool.progress', 'tool.result', 'permission.request', 'permission.resolved',
  'question.request', 'question.resolved', 'plan.proposed', 'todo.update', 'subagent.started', 'subagent.progress',
  'subagent.ended', 'usage.turn', 'usage.context', 'usage.limits', 'usage.cost', 'mode.changed',
  'model.changed', 'effort.changed', 'mcp.status', 'files.changed', 'git.status', 'compact',
  'raw',
];

export const COMMANDS = [
  'engine.hello', 'provider.list', 'provider.refresh', 'provider.install', 'provider.login',
  'provider.setKey', 'provider.clearKey', 'models.list', 'workspace.pick', 'workspace.browse',
  'workspace.open', 'workspace.recent', 'workspace.forget', 'git.status', 'git.diff',
  'github.repos', 'github.clone', 'session.start', 'session.send', 'session.interrupt',
  'session.stop', 'session.setMode', 'session.setModel', 'session.setEffort', 'session.contextUsage',
  'session.limits', 'session.list', 'session.load', 'session.resume', 'session.fork',
  'session.toolOutput', 'permission.answer', 'question.answer', 'mcp.list', 'mcp.add',
  'mcp.remove', 'mcp.toggle', 'mcp.reconnect', 'cloud.check', 'cloud.bring',
  'audit.tail',
];

// How each mode is named and explained on the screen.
export const MODE_INFO = {
  ask: { label: 'ask', long: 'Ask before every change', hint: 'Reads freely; asks before it edits a file or runs a command.' },
  plan: { label: 'plan', long: 'Plan first', hint: 'Looks around and writes a plan; changes nothing until you approve it.' },
  acceptEdits: { label: 'accept edits', long: 'Accept edits', hint: 'Edits files in this folder without asking; still asks before running commands.' },
  auto: { label: 'auto', long: 'Auto', hint: 'Decides for itself what is safe to do without asking, and asks for the rest.' },
};
