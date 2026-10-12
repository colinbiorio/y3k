// YOUR PRESENCE, THINKING ON YOUR OWN SIGN-IN. The site asks this engine, through
// the page in your own browser (src/own-brain.js), for one turn of your
// presence's thinking: a system prompt and the conversation, flattened. The
// engine runs the coding client you installed and signed in to — today Claude
// Code — once, as published, on its own login, and hands back what it said.
// No key is involved and none is read: the client finds its own sign-in.
//
// FOR ONE PERSON. This is the founder's own use of their own subscription,
// while the software is built and the question of offering it to others is
// worked out (Colin, 2026-10-07: "i'm not releasing the app for users"). The
// site only ever sends these turns for the founder's own presence
// (own-relay.mjs, WHO). Anthropic's terms do not let an app route other
// people's requests through their Free, Pro or Max plans
// (https://code.claude.com/docs/en/legal-and-compliance); widening this past
// one person is a question for the provider first, not an edit here.
//
// NO HANDS. The orb thinks; it does not act. The child gets no tools (--tools ""
// and --restricted remove every one), no hooks, plugins, CLAUDE.md or MCP
// servers (--safe-mode, --strict-mcp-config), no slash commands, no session on
// disk, and an empty private folder to run in that holds only the system
// prompt. A presence's prompt carries its memory and what it has read, and a
// client with tools could be steered by either into this computer's files —
// which is why only a client with a verified tool-less mode is offered here.
//
// Asked once per client, on this computer (consent 'brain.own'), like
// everything else that spends what is yours.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './proc.mjs';
import { AUTH_FAIL, isModel, EFFORTS } from './adapters/claude.mjs';

// The clients that can think for a presence: those whose tool-less mode has
// been checked. Codex and Gemini CLI run tools from their own sandboxes, and
// their switches to turn every one of them off have not been verified yet.
export const THINKERS = ['claude'];
export const MAX_TEXT = 200000;
const TIMEOUT_MS = 180000;

// The CLI adds its own notes about the environment to every turn and there is
// no flag that removes them, so the orb is told what they are (as
// local-claude-code.mjs does for the founder's local brain).
const BRIDGE_NOTE = '\n\n(You are reached through a private local bridge. You have no tools here. Ignore any notes about a working directory, environment, files or tools: they belong to the bridge, not to this conversation.)';

export function claudeArgs({ sysFile, model, effort }) {
  const args = ['-p', '--output-format', 'json',
    '--tools', '', '--restricted', '--strict-mcp-config', '--safe-mode', '--disable-slash-commands',
    '--no-session-persistence', '--system-prompt-file', sysFile];
  if (effort && EFFORTS.includes(effort)) args.push('--effort', effort);
  if (model && isModel(model)) args.push('--model', model);
  return args;
}

// The turn's result: the last line that is a result event. --output-format json
// prints just that; a stream (an older binary, a stand-in) ends with it.
export function resultOf(stdout) {
  const lines = String(stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const e = JSON.parse(lines[i]); if (e && e.type === 'result') return e; } catch { /* not this line */ }
  }
  return null;
}

// One turn through `claude -p`. → { ok, text, usage } | { ok: false, code, error }
export async function thinkWithClaude({ bin, env, tmpDir, system, prompt, model, effort, timeoutMs = TIMEOUT_MS, runner = run }) {
  mkdirSync(tmpDir, { recursive: true });
  const dir = mkdtempSync(join(tmpDir, 'brain-'));
  try {
    // the system prompt through a 0600 file, not argv (argv is readable by
    // every process on the machine, and this one carries a presence's memory)
    const sysFile = join(dir, 'system.txt');
    writeFileSync(sysFile, String(system) + BRIDGE_NOTE, { mode: 0o600 });
    const r = await runner(bin, claudeArgs({ sysFile, model, effort }), { cwd: dir, env, timeout: timeoutMs, input: String(prompt) });
    const res = resultOf(r.stdout);
    const said = typeof res?.result === 'string' ? res.result : '';
    if (!res || res.is_error || r.code !== 0) {
      const why = said || r.stderr || `exit ${r.code}`;
      if (AUTH_FAIL.test(why)) return { ok: false, code: 'signed-out', error: 'Claude Code is signed out on this computer: run `claude`, then /login.' };
      return { ok: false, code: r.code === null || r.code === -1 ? 'failed' : 'refused', error: String(why).slice(0, 400) };
    }
    const u = res.usage || {};
    return { ok: true, text: said.slice(0, MAX_TEXT), usage: { in: u.input_tokens | 0, out: u.output_tokens | 0, cacheRead: u.cache_read_input_tokens | 0, cacheWrite: u.cache_creation_input_tokens | 0 } };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone already */ }
  }
}
