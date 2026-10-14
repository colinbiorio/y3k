# y3kode — the release, and what is still owed

Released to every account on 2026-10-11, on Colin's word: `CODE_ROLLOUT` is
`all` by default and the site hands the engine to anyone signed in. Each
person's coder runs on their own sign-in on their own machine. The engine is
still not published to npm and there is no public desktop build with the
bridge in it. The lines below that are not ticked are owed, not waived.

## The founder's gates (not code)

1. **Each vendor** — the founder's call. The engine runs each coding client
   the person installed and signed into, on that client's own sign-in, by
   default (providers.mjs, CODE.md line 3); an API key only when the person
   chooses one on their machine.
2. **OpenCode and the model providers** — the region notices already shown for
   DeepSeek, Kimi, Qwen and GLM.
3. **legal.html / privacy** — a y3kode section: it runs on your computer on
   127.0.0.1; code, prompts, files, keys and the activity record never reach
   yearthreethousand.com; only the presence's note, the line you send back, and
   what you say to the presence from the Code screen do.

## Technical, before release

- [x] Enforce the app shell's content policy — enforced 2026-10-13 (Colin),
      narrowed to what the pages use, and its text is part of each page's tag so
      no returning visitor keeps an old one. Violations are still reported to
      /api/csp-report.
- [ ] Vendor the camera's vision bundle and wasm too (three.js already is), so
      no script comes from a third party at all.
- [ ] Run `scripts/code-cloud-spike.mjs` against a real session; build tier A
      (attach) only if it works, otherwise keep tier B (teleport) as it is.
- [ ] Run each tool for real with the founder's accounts:
      `scripts/code-real-claude.mjs`; Codex and Gemini on the founder's own
      sign-ins (`codex login`, `gemini`);
      `scripts/code-real-opencode.mjs` and a real provider.
- [ ] Desktop: build and sign the app (the bridge is in `desktop/`), and check on
      a Mac: the folder picker, a session surviving ⌘R, nothing left after quit
      (`scripts/code-desktop-smoke.mjs` does this on Linux).
- [ ] Reserve `y3k-code` on npm, or publish it with provenance. The site now
      serves the engine itself to rolled-out accounts (`npx -y
      <site>/code/dl/<token>/y3k-code.tgz --pair <code>`), but an unclaimed
      name is one someone else can publish under.
- [x] Set `CODE_ROLLOUT=all` — the default since 2026-10-11.

## Where things are checked

`npm test` (engine parts, the companion's door, Claude/Codex/Gemini/OpenCode,
the screen's state and rules, the desktop host, the site's two routes, git,
GitHub and connectors); `scripts/code-smoke.mjs` (the whole thing in Chromium);
`scripts/code-desktop-smoke.mjs` (the real desktop app under Xvfb).
