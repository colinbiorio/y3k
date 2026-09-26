# Y3K

An AI whose body is a living field of ~24,000 particles. Shape and per-node,
full-spectrum color are a language; speech rides alongside it. Talk to it with
your voice (or type), and it answers with both words and a change in how its
body moves and glows.

## Run

```bash
cd y3k
node server.mjs
# open http://localhost:5173
```

No build step, no install — Three.js loads from a CDN via an import map.
(Run over `localhost`, not a `file://` path, so the mic and camera work.)

### Give it a real brain

Out of the box it uses a small local placeholder brain so the whole loop works.
To have Claude drive the words *and* the body language:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node server.mjs                  # console will say "Brain: Claude (...)"
```

Defaults to `claude-opus-4-8` with adaptive thinking at `EFFORT=xhigh`. Override
either via env (`MODEL`, `EFFORT=high|xhigh|max`).

### Human & described voices (optional)

```bash
export ELEVENLABS_API_KEY=...    # unlocks the Voice section in Settings (⚙)
```

Without a key, Y3K uses the browser's built-in voice. With one, open Settings →
Voice to pick a human voice or **describe one** in natural language. The key
stays server-side; per-IP rate limiting (`RATE_MAX`, default 30/min) guards the
shared paid keys.

## How it works

- **Body — `src/body.js`** — particles sit on a Fibonacci sphere; a vertex
  shader displaces them along the normal with layered simplex noise. Each
  **mood** (`calm · listening · thinking · speaking · excited · tender ·
  glitch`) is a preset of motion parameters + a two-color gradient. Setting a
  mood retargets the uniforms; the render loop eases toward them, so the field
  *morphs* between postures instead of snapping. Bloom gives the dots their glow.
- **Voice — `src/voice.js` + `src/settings.js`** — `SpeechRecognition`
  transcribes the mic. Output is either the browser voice or, with an ElevenLabs
  key, a chosen/described human voice streamed via the server proxy — the body's
  amplitude is then driven by the real audio waveform.
- **Camera — `src/camera.js`** — `getUserMedia` preview, off by default.
- **Brain — `src/brain.js` + `server.mjs`** — every reply is `{ mood, speech }`.
  The server asks Claude for that JSON; the client applies the mood to the body
  and speaks the words.

## Browser support

Voice input uses the Web Speech API — best in **Chrome / Edge**. Everything else
(the body, TTS, camera, typed input) works broadly. If speech recognition is
missing, just type.

## Deploy

`server.mjs` serves the static app *and* proxies Claude/ElevenLabs, so any Node
host works. A [`render.yaml`](render.yaml) blueprint is included:

1. Push this repo to GitHub.
2. Render → **New + → Blueprint** → pick the repo (it reads `render.yaml`).
3. Set the secrets in the dashboard: `ANTHROPIC_API_KEY` (and `ELEVENLABS_API_KEY`
   for voices). They live only as Render secrets — never in the repo (`.env` is
   gitignored, and the server refuses to serve dotfiles).
4. Add your custom domain in the Render service settings and follow the exact DNS
   records it shows you.

Health check: `/api/health`. The free plan sleeps when idle (cold starts);
Starter keeps it always-on.

### The house allowance

Signed-in visitors without a key of their own talk and speak on the site's keys
within a daily allowance **per account** (`house.mjs`), resetting at UTC
midnight. Accounts are free, so the site also has a daily ceiling across all
accounts together; when it is reached, the house key rests until midnight for
everyone but the founder. The founder is not metered. Tune it in the Render
dashboard (saving restarts the service; no code change). `0` turns that part
of the house off.

- `HOUSE_DAILY_USD` — dollars of house brain per account per day (default `2`)
- `HOUSE_GLOBAL_DAILY_USD` — dollars of house brain for the whole site per day (default `25`)
- `HOUSE_DAILY_VOICE_CHARS` — characters of house voice per account per day (default `20000`)
- `HOUSE_GLOBAL_DAILY_VOICE_CHARS` — characters of house voice for the whole site per day (default `200000`)
- `HOUSE_TURN_HOLD_USD` — what a turn is held at until its real cost is known (default `0.45`)

Each account has one house turn in flight at a time. On the site's ElevenLabs
account, designing, saving and deleting voices are the founder's; anyone with
their own ElevenLabs key is unaffected.

## Your own orb, on your own Claude login (local only)

For the founder, on their own machine: talk to your presence through the
official Claude Code binary, signed in with your own Claude subscription,
instead of an API key.

```sh
claude            # once, to sign in with your Claude account
FOUNDER_PASSWORD=… Y3K_LOCAL_CLAUDE_CODE=1 npm start
```

Sign in as the founder at `http://localhost:5173` and remove any key saved in
settings (a saved key wins). Optional: `Y3K_LOCAL_CLAUDE_MODEL=opus`,
`Y3K_LOCAL_CLAUDE_EFFORT=high`.

What it is and is not (`local-claude-code.mjs` has the full reasoning and the
exact policy text): founder only, `127.0.0.1` only, conversation only (no tools,
no autonomous hours), and it refuses to start on Render. Anthropic says its
subscription login is for "ordinary use of Claude Code", that developers
building products should use API keys, and that it does "not permit
third-party developers to offer Claude.ai login into their own applications, or
to route requests through Free, Pro, or Max plan credentials on behalf of their
users." So this is only your own personal use of the unmodified binary on your
own machine, and it can never serve anyone but you. For everyone else,
bring-your-own-key stays the way; anything more is a question for Anthropic.

## Where to take it next

- Stream Claude's reply so the body starts moving before the sentence finishes.
- Higher-quality TTS (an API voice) and analyse *its* output for the speaking envelope.
- Actually let it **see**: sample camera frames and send them to a vision model.
- A richer gesture grammar: blend two moods, or sequence them per clause.
