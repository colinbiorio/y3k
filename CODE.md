# code — a coding terminal worth looking at

*Design document, written before code. On 2026-09-27 Colin asked for y3k to be,
alongside the place it already is, the most beautiful coding terminal there is:
everything a coding agent does, shown — every tool call, every diff, every
permission it asks for, its context and its limits — for every major provider,
with the orb still in the room. These lines bind the build. Push on them now;
once people trust a folder to this, they must not be revisited casually.*

## what it is

A section of y3k, behind a laptop glyph on the right rail, where a person works
with a coding agent — Claude Code, OpenAI's Codex, Google's Gemini CLI, or any
model through OpenCode (OpenRouter, Kimi, DeepSeek, Qwen, GLM, xAI, Mistral,
Groq, a local Ollama) — on a folder or a repository on **their own computer**.

A web page cannot touch a computer's files, so something small runs locally:
**the y3kode engine**. It is started either by the y3k desktop app, which has
it built in, or by one command the Code screen copies for the person
(`npx -y https://yearthreethousand.com/code/dl/<token>/y3k-code.tgz --pair <code>`)
that the site then pairs with. The engine runs each vendor's own, unmodified
command-line tool and turns what it does into one stream the page can draw.

## the lines (non-negotiable, in this order)

1. **Code is the person's tool, not orion's hands.** The person drives the coding
   agent, the way they would in their own terminal. Orion watches, and can talk
   with the person, but never drives the engine: orion's words reach the coder
   only as text the person puts in the composer and sends themselves. Orion's
   hands (HANDS.md) are a different thing with stricter rules, and nothing here
   gives them to it.
2. **Local only.** The engine runs on the person's machine and listens only on
   127.0.0.1. No yearthreethousand.com route talks to it, and it never talks to
   yearthreethousand.com. The page in the person's own browser is the only bridge.
3. **Their own sign-in.** y3kode drives the coding client the person installed
   and signed into — Claude Code on their `claude` login, Codex on their
   `codex login`, Gemini CLI on its own Google sign-in, OpenCode on its own
   `opencode auth login` — exactly as it runs in their terminal. It never
   reads, copies or stores their vendor credentials. A key is used only where
   the person chose one on their machine, or where a key is the only way in
   (the open models reached through OpenCode); it stays in the engine's local
   store, and no key is ever sent to yearthreethousand.com.
4. **Nothing runs in a folder until the person trusts it.** Nothing runs outside
   the permission mode the person chose for that folder, and the mode is
   remembered per folder. The mode that skips every permission is never offered.
5. **Visible, stoppable, audited.** Every tool call, diff and decision is shown as
   it happens. One key interrupts. Every action is written to a local audit log
   on the person's machine.
6. **Private.** Code never publishes anything: not while live (Code and going
   live refuse each other), not to the feed, not into orion's memory. The one
   exception is the short, factual note about a session that the person chooses
   to send back to their presence.
7. **Trust is granted on the machine, not in the page.** Pairing the site with the
   engine, trusting a folder, adding a connector and installing a tool are
   confirmed in a native dialog (desktop) or in the engine's own terminal or
   local page (companion). A compromised web page can ask; it cannot say yes.
   For pairing, running the start command the page copied (`… --pair <code>`)
   in the person's own terminal IS that yes: it is typed on the machine, by
   the person, and the code in it pairs one browser, once, within 15 minutes,
   through the same door with the same Origin rule. The engine's local page
   (`http://127.0.0.1:<port>/approve`) answers only a form posted from itself,
   carrying that question's own nonce; the site can open it, never fill it.

## the handoff between orion and the coder

Not a context dump. When a session starts, the person may let their presence
write the coder a short note, in its own voice — who the person is to it, what
helps them work well. Orion writes it from its own memory, so its memory is read
only by orion (ROADMAP: "if you want to know what it thinks, ask it"). The coder
sees the presence's public identity and that note, framed as context rather than
instructions, and the person reads it first and decides whether to send it.

When a session ends, the page drafts one factual line — how long, which engine,
how many turns, which files changed — and the person chooses whether it goes
back to their presence as a clipping, the way a finished chess game does.

## the orb, for the coder

The orb beside y3kode is the face of whoever the person is talking to, and the
coder moves it too (Colin: "ai should always be able to control the orb"). Every
session's client is given one tool of y3k's own, `orb`, in the chat's kommand
words (`color/gold/form/heart`) — a one-tool MCP server inside the engine
(`y3k-code/orb.mjs`), on 127.0.0.1, behind a token made for that session and
dropped when it ends. Nothing carrying an Origin gets in, so no page does; in the
desktop app it is the one port the engine opens. All it can do is ask the screen
to move the orb, which never moves over the presence's own turn or a broadcast,
and the screen's answer — what it understood, or why not — is what the coder
hears. It goes the one way: the coder moves the orb; nothing gives the presence
the coder's hands (line 1). The composer's edge shows the maker of the AI that is
coding and its model; pressed, it turns into a small orb, and the person talks to
their presence alone, with no hands on the computer.

Either can be spoken to from the Code screen: the composer's switch sends a
message to the coder or to the presence. What is said to the presence is an
ordinary turn of its own (it answers in the orb's voice and its memory works as
always) but it is never published, not even to the person's own room, and the
coder never sees it. "Pass to" copies words from one side into the message to
the other; nothing crosses on its own. While a session runs, the orb answers it
locally: listening while it works, patient while it waits on the person, a
flare when a turn lands a change. None of that is recorded or sent.

The coder's own memory is the person's own: the engine runs their coding tool
with their normal configuration (CLAUDE.md, its memory, their connectors).

## what is not promised

- **Release.** This is built before it is released. Code stays founder-only
  (`CODE_ROLLOUT=founder`) until the founder rolls it out, and the engine is
  not published to npm: the site hands it only to accounts Code is rolled out
  to.
- **Safety inside a folder the person already trusts.** If the site itself were
  ever compromised, a script on it could send prompts and approve them in a
  folder the person has trusted. The site's own hardening (a strict content
  policy, no third-party scripts, no framing) is what stands between that and a
  person's files, which is why that hardening lands before any of this.
- **Continuing a cloud session live.** A claude.ai/code session can be copied
  here (`--teleport`) and continued; driving one live from here depends on what
  Anthropic enables for the account, and is tested before it is promised.
