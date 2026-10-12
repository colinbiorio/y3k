# y3kode — the engine

Runs your own coding tools (Claude Code, Codex, Gemini CLI and OpenCode) on
**your** computer, for the y3kode screen, each on the sign-in you already use
with it — your `claude` login, your `codex login`, your Gemini CLI Google
sign-in, what you added with `opencode auth login`. It never reads or stores
those credentials; it runs the tool, and the tool signs in the way it always
does. The rules it keeps are in [`../CODE.md`](../CODE.md). Not on npm: the
site hands the engine to accounts Code is rolled out to. The command is
`y3kode` (or `y3k-code`, the same thing).

**Starting it the easy way.** The Code screen copies one line for you —
`npx -y https://yearthreethousand.com/code/dl/<token>/y3k-code.tgz --pair <code>`.
Paste it into Terminal and press Return. It needs Node.js 20.6 or newer (if
yours is older it says so, with the link). `--pair` carries a code the page
made; running the command is your yes, so the page connects by itself with
no tab opened and nothing to type. Leave the window open while you code.

Not signed in to a tool yet? The Code screen says so before you pick anything,
with the one command to run in Terminal (`claude`, `codex login`, `gemini`,
`opencode auth login`); sign in there and press *Check again*. Prefer an API
key for Claude Code, Codex or Gemini CLI? `y3kode key set <tool>` (or *Use an
API key instead* on the screen) switches that tool to it; `y3kode key clear
<tool>` switches it back. The open models reached through OpenCode take their
own key — that is the only way in to them.

Anything else that needs your yes — trusting a folder, adding a connector — is
asked in that terminal **and** on a small local page,
`http://127.0.0.1:<port>/approve` (the Code screen has an *Open the approval
window* button). Answer in either; the first answer counts.

**Updating it.** When the site has a newer y3kode, *Update y3kode* in
Settings → Brain asks you first, here and in the approval window. On a yes it
fetches that version from the site it was started for, checks it is y3kode at
exactly that version, unpacks it into `engine/<version>/` in its settings
folder, and runs it in its own place on the same port; this window stays
open, and your browser stays connected. The same command run later starts the
newest version already fetched (`update.mjs`).

**The orb.** Whichever tool is coding can move the orb beside y3kode: every
session is handed one tool of y3k's own, `orb`, in the same words you type
into the chat (`color/gold/form/heart`, `mood/thinking`). It is a tiny MCP
server inside this engine, at `http://127.0.0.1:<port>/mcp/<session>`, behind
a token made for that one session and dropped when it ends; it never takes a
page, and all it can do is ask the screen to move the orb. The screen answers
what it understood, and that is what the coder hears back. To talk to your
presence alone — no hands on the computer — press the mark at the edge of the
composer; it turns into a small orb. Press it again for the coder.

From a clone:

```
node y3k-code/bin/y3k-code.mjs            # start; opens y3kode (or a pairing link, the first time)
node y3k-code/bin/y3k-code.mjs doctor     # which tools are installed, and whether you are signed in to each
node y3k-code/bin/y3k-code.mjs key set claude    # an API key for Claude Code instead of your sign-in
node y3k-code/bin/y3k-code.mjs key clear claude  # back to your sign-in
node y3k-code/bin/y3k-code.mjs revoke     # disconnect every paired browser (a running engine sees it at once)
npm i -g ./y3k-code                       # puts `y3kode` and `y3k-code` on your PATH
```

| file | what it does |
|---|---|
| `protocol.mjs` | the events and commands between the screen and the engine; the gate every command passes |
| `engine.mjs` | sessions, folders, keys, the event stream, asking you on this machine |
| `http.mjs` | the companion's door on 127.0.0.1 (exact Host and Origin, pairing, token), and its approval page |
| `adapters/claude.mjs` | the unmodified `claude` binary in stream-json mode, its permission prompts answered from the screen |
| `adapters/codex.mjs` | `codex app-server` (JSON-RPC); y3k's modes as sandbox × approval policy, never full disk access |
| `adapters/acp.mjs` | `gemini --acp` (Agent Client Protocol) on the person's own Gemini CLI sign-in; a home of its own only for a chosen key |
| `adapters/opencode.mjs` | `opencode serve` for the open models (OpenRouter, Kimi, DeepSeek, Qwen, GLM, Grok, Mistral, Groq, Ollama), on its own `opencode auth login` store plus keys given here |
| `jsonrpc.mjs` | JSON-RPC over a child's stdio, both directions |
| `github.mjs`, `mcp.mjs` | GitHub through the person's own `gh`; connectors |
| `orb.mjs` | the coders' `orb` tool: a one-tool MCP server behind each session's own token |
| `bus.mjs` | numbered, replayable events; streamed text and progress gathered per 25ms |
| `store.mjs`, `audit.mjs` | 0600 settings and keys; the local activity record |
| `workspace.mjs` | which folders may be used, what the trust card lists, git with the repo's own programs off |
| `pair.mjs`, `consent.mjs` | pairing codes (shown, or pre-approved by `--pair`) and tokens; yes/no on this machine, in the terminal or the approval page |
| `bin/y3k-code.cjs` | the `y3kode` / `y3k-code` command: checks the Node version, then starts `bin/y3k-code.mjs` |
| `diff.mjs` | the change, shown before it is allowed |
| `providers.mjs` | every provider, how to install it and sign in to it, whether you are signed in, and when a key is used instead |

The screen lives in `src/code/` (loaded only when someone opens Code): the
transport to this engine, a reducer that builds everything from events, and
renderers for markdown, diffs, tool cards and the cards that ask.

Tests: `node test/code-engine.test.mjs`, `node test/code-http.test.mjs`,
`node test/code-claude.test.mjs` (a fake `claude` replaying a real recording),
`node test/code-client.test.mjs` (the screen's rules and state),
`node test/code-orb.test.mjs` (the orb tool and its door).
`node scripts/code-smoke.mjs --shots <dir>` runs the site, this engine and the
fake in Chromium and checks what a person would see. With your own sign-in,
`node scripts/code-real-claude.mjs` drives the real CLI in a throwaway repo;
`OPENCODE_BIN=… node scripts/code-real-opencode.mjs` drives the real OpenCode
against a stand-in model (no provider called). Codex and Gemini are pinned by
`test/code-providers.test.mjs` against fakes built from their own protocols.
