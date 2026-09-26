# y3k Code — the engine

Runs your own coding tools (Claude Code today; Codex, Gemini CLI and OpenCode
next) on **your** computer, for the y3k Code screen. The rules it keeps are in
[`../CODE.md`](../CODE.md). Not published: nothing ships until the legal
questions in the plan are settled.

```
node y3k-code/bin/y3k-code.mjs            # start; opens yearthreethousand.com with a pairing code
node y3k-code/bin/y3k-code.mjs doctor     # which tools are installed and signed in
node y3k-code/bin/y3k-code.mjs signin on  # use your own Claude sign-in instead of an API key
node y3k-code/bin/y3k-code.mjs key set claude
node y3k-code/bin/y3k-code.mjs revoke     # disconnect every paired browser
```

| file | what it does |
|---|---|
| `protocol.mjs` | the events and commands between the screen and the engine; the gate every command passes |
| `engine.mjs` | sessions, folders, keys, the event stream, asking you on this machine |
| `http.mjs` | the companion's door on 127.0.0.1 (exact Host and Origin, pairing, token) |
| `adapters/claude.mjs` | the unmodified `claude` binary in stream-json mode, its permission prompts answered from the screen |
| `adapters/codex.mjs` | `codex app-server` (JSON-RPC); y3k's modes as sandbox × approval policy, never full disk access |
| `adapters/acp.mjs` | `gemini --acp` (Agent Client Protocol); an API key only, a home of its own |
| `adapters/opencode.mjs` | `opencode serve` for the open models (OpenRouter, Kimi, DeepSeek, Qwen, GLM, Grok, Mistral, Groq, Ollama) |
| `jsonrpc.mjs` | JSON-RPC over a child's stdio, both directions |
| `github.mjs`, `mcp.mjs` | GitHub through the person's own `gh`; connectors |
| `bus.mjs` | numbered, replayable events |
| `store.mjs`, `audit.mjs` | 0600 settings and keys; the local activity record |
| `workspace.mjs` | which folders may be used, what the trust card lists, git with the repo's own programs off |
| `pair.mjs`, `consent.mjs` | pairing codes and tokens; yes/no on this machine |
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
