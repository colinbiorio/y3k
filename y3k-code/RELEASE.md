# y3k Code — before anyone but the founder uses it

Built, not released (CODE.md). `CODE_ROLLOUT` stays `founder`, the engine is not
published to npm, and there is no public desktop build with the bridge in it,
until every line below is done.

## The founder's gates (not code)

1. **Anthropic** — accept the Commercial Terms for y3k; written confirmation
   that a person may use their own Claude sign-in through the unmodified
   `claude` binary driven by y3k Code, and on `--cloud` / `--teleport`.
   Until then everyone else uses an API key (`chooseAuth`, providers.mjs).
2. **OpenAI** — the same question for a ChatGPT sign-in driving Codex.
3. **Google** — nothing to ask: Gemini runs on an API key for everyone.
4. **OpenCode and the model providers** — own-key terms; the region notices
   already shown for DeepSeek, Kimi, Qwen and GLM.
5. **legal.html / privacy** — a y3k Code section: it runs on your computer on
   127.0.0.1; code, prompts, files, keys and the activity record never reach
   yearthreethousand.com; only the presence's note, the line you send back, and
   what you say to the presence from the Code screen do.

## Technical, before release

- [ ] Enforce the app shell's content policy (it is report-only; enforce after a
      clean week of /api/csp-report).
- [ ] Vendor the camera's vision bundle and wasm too (three.js already is), so
      no script comes from a third party at all.
- [ ] Run `scripts/code-cloud-spike.mjs` against a real session; build tier A
      (attach) only if it works, otherwise keep tier B (teleport) as it is.
- [ ] Run each tool for real with the founder's accounts:
      `scripts/code-real-claude.mjs`; Codex and Gemini with real keys;
      `scripts/code-real-opencode.mjs` and a real provider.
- [ ] Desktop: build and sign the app (the bridge is in `desktop/`), and check on
      a Mac: the folder picker, a session surviving ⌘R, nothing left after quit
      (`scripts/code-desktop-smoke.mjs` does this on Linux).
- [ ] Publish the engine as `y3k-code` on npm (the connect screen already says
      `npx y3k-code`), with provenance.
- [ ] Set `CODE_ROLLOUT=all`.

## Where things are checked

`npm test` (engine parts, the companion's door, Claude/Codex/Gemini/OpenCode,
the screen's state and rules, the desktop host, the site's two routes, git,
GitHub and connectors); `scripts/code-smoke.mjs` (the whole thing in Chromium);
`scripts/code-desktop-smoke.mjs` (the real desktop app under Xvfb).
