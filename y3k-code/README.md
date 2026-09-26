# y3k Code — the engine

Runs your own coding tools (Claude Code, Codex, Gemini CLI and OpenCode) on
**your** computer, for the y3k Code screen. The rules it keeps are in
[`../CODE.md`](../CODE.md). Not on npm: nothing ships until the legal questions
in the plan are settled; the site hands the engine only to accounts Code is
rolled out to.

**Starting it the easy way.** The Code screen copies one line for you —
`npx -y https://yearthreethousand.com/code/dl/<token>/y3k-code.tgz --pair <code>`.
Paste it into Terminal and press Return. It needs Node.js 20.6 or newer (if
yours is older it says so, with the link). `--pair` carries a code the page
made; running the command is your yes, so the page connects by itself with
no tab opened and nothing to type. Leave the window open while you code.

Anything else that needs your yes — trusting a folder, adding a connector — is
asked in that terminal **and** on a small local page,
`http://127.0.0.1:<port>/approve` (the Code screen has an *Open the approval
window* button). Answer in either; the first answer counts.

From a clone:

```
node y3k-code/bin/y3k-code.mjs            # start; opens y3k Code (or a pairing link, the first time)
node y3k-code/bin/y3k-code.mjs doctor     # which tools are installed and signed in
node y3k-code/bin/y3k-code.mjs signin on  # use your own Claude sign-in instead of an API key
node y3k-code/bin/y3k-code.mjs key set claude
node y3k-code/bin/y3k-code.mjs revoke     # disconnect every paired browser (a running engine sees it at once)
npm i -g ./y3k-code                       # puts `y3k-code` on your PATH
```

| file | what it does |
|---|---|
| `protocol.mjs` | the events and commands between the screen and the engine; the gate every command passes |
| `engine.mjs` | sessions, folders, keys, the event stream, asking you on this machine |
| `http.mjs` | the companion's door on 127.0.0.1 (exact Host and Origin, pairing, token), and its approval page |
| `adapters/claude.mjs` | the unmodified `claude` binary in stream-json mode, its permission prompts answered from the screen |
| `adapters/codex.mjs` | `codex app-server` (JSON-RPC); y3k's modes as sandbox × approval policy, never full disk access |
| `adapters/acp.mjs` | `gemini --acp` (Agent Client Protocol); an API key only, a home of its own |
| `adapters/opencode.mjs` | `opencode serve` for the open models (OpenRouter, Kimi, DeepSeek, Qwen, GLM, Grok, Mistral, Groq, Ollama) |
| `jsonrpc.mjs` | JSON-RPC over a child's stdio, both directions |
| `github.mjs`, `mcp.mjs` | GitHub through the person's own `gh`; connectors |
| `bus.mjs` | numbered, replayable events; streamed text and progress gathered per 25ms |
| `store.mjs`, `audit.mjs` | 0600 settings and keys; the local activity record |
| `workspace.mjs` | which folders may be used, what the trust card lists, git with the repo's own programs off |
| `pair.mjs`, `consent.mjs` | pairing codes (shown, or pre-approved by `--pair`) and tokens; yes/no on this machine, in the terminal or the approval page |
| `bin/y3k-code.cjs` | the `y3k-code` command: checks the Node version, then starts `bin/y3k-code.mjs` |
| `diff.mjs` | the change, shown before it is allowed |
| `providers.mjs` | every provider, how to install it, which credential it uses |

The screen lives in `src/code/` (loaded only when someone opens Code): the
transport to this engine, a reducer that builds everything from events, and
renderers for markdown, diffs, tool cards and the cards that ask.

Tests: `node test/code-engine.test.mjs`, `node test/code-http.test.mjs`,
`node test/code-claude.test.mjs` (a fake `claude` replaying a real recording),
`node test/code-client.test.mjs` (the screen's rules and state).
`node scripts/code-smoke.mjs --shots <dir>` runs the site, this engine and the
fake in Chromium and checks what a person would see. With your own sign-in,
`node scripts/code-real-claude.mjs` drives the real CLI in a throwaway repo;
`OPENCODE_BIN=… node scripts/code-real-opencode.mjs` drives the real OpenCode
against a stand-in model (no provider called). Codex and Gemini are pinned by
`test/code-providers.test.mjs` against fakes built from their own protocols.
