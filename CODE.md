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
**the y3k Code engine**. It is started either by the y3k desktop app, which has
it built in, or by one command (`npx y3k-code`) that the site then pairs with.
The engine runs each vendor's own, unmodified command-line tool and turns what
it does into one stream the page can draw.

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
3. **Their own credentials.** Each vendor's own sign-in, or the person's own key
   kept in the engine's local store. y3k never reads a vendor's token, and no key
   is ever sent to yearthreethousand.com.
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

The coder's own memory is the person's own: the engine runs their coding tool
with their normal configuration (CLAUDE.md, its memory, their connectors).

## what is not promised

- **Release.** This is built before it is released. Until Anthropic, OpenAI and
  Google have confirmed how their sign-ins may be used from inside y3k, Code
  stays founder-only (`CODE_ROLLOUT=founder`), the engine is not published, and
  everyone but the founder would use API keys. Google's terms already forbid
  third-party software using the Gemini CLI's own Google sign-in, so Gemini
  runs on an API key for everyone, the founder included.
- **Safety inside a folder the person already trusts.** If the site itself were
  ever compromised, a script on it could send prompts and approve them in a
  folder the person has trusted. The site's own hardening (a strict content
  policy, no third-party scripts, no framing) is what stands between that and a
  person's files, which is why that hardening lands before any of this.
- **Continuing a cloud session live.** A claude.ai/code session can be copied
  here (`--teleport`) and continued; driving one live from here depends on what
  Anthropic enables for the account, and is tested before it is promised.
