> **Status, 12 September 2026.** Findings 1-3 and 6 below are FIXED in the same
> commit that added this file: the no-match recall no longer broadcasts, the
> presence is told on air what the room can read, and every false promise in
> journal.mjs, mind.mjs, MIND.md, WORLD.md, ROADMAP.md and server.mjs now
> describes what the code actually does. Three tests hold them.
>
> What remains open is the founder's question in section 4, and the two
> unambiguous items that depend on the answer: the retroactive tier push
> (`src/tend.js:313` contradicting its own comment at `:304`) and whether the
> events route should refuse a viewer who has blocked the presence.

# The journal is broadcast. The finding.

## 1. THE ONE SENTENCE

**Yes** — with one complication: nothing leaks until the host deliberately goes live *and* the presence is running its autonomous loop, but inside that window the journal line, up to six dated lines pulled from anywhere in the permanent record, all three memory tiers, and the unfinished work are relayed **verbatim** to every viewer of the room — including a passer-by who has never signed in.

## 2. EXACTLY WHAT A STRANGER SEES

All of it lands in two panels beside the orb: `#win-memory` ("memory", four rows) and `#win-work` ("the work"), shown to viewers by `styles.css:962-963` / `:966`. Everything below is set with `textContent` (no XSS), unmodified except that `scrubTags` (`src/tags.mjs:42-64`) removes `<<…>>` control markers.

| channel | what is literally rendered | kind |
|---|---|---|
| **journal row** | `✎ <the line the presence just chose to keep>` — up to 500 chars, which is exactly `MAX_ENTRY_LEN` (`journal.mjs:24`), so the wire cap at `server.mjs:2119` truncates nothing. `src/windows.js:157` → `index.html:464`. Stays on screen until the presence sleeps. | **CONTENT** |
| **journal row, at go-live only** | `128 lines kept` — `src/tend.js:315` sends the count with `null` text. Overwritten by the real line on the next beat. | **notification** |
| **recall flare** | `remembering "the quiet" → 2026-03-14: <line> · 2025-11-02: <line> · …` — up to 6 dated entries, 300 chars each, from *anywhere* in a 2000-entry record (`journal.mjs:74-87`, `src/tend.js:609`, `server.mjs:2122-2127`). Held 12 s (`src/windows.js:161-168`), then the row reverts to the standing journal line. Not replayed to late joiners. | **CONTENT (the archive)** |
| **glimpse / short / long** | the tiers verbatim, 400 / 1200 / 2000 chars (`memory.mjs:66`; wire cap 2000 at `server.mjs:2085`) → `src/windows.js:147-149` → `index.html:461-463`. **Retroactive**: `src/tend.js:313` pushes all three, as they stand, the moment a host goes live mid-waking. | **CONTENT** |
| **the work** | title (≤80) and the whole current draft body (≤2500) — `mind.mjs:35-36`, relayed at `server.mjs:2106-2107`, rendered `src/windows.js:177-180`. | **CONTENT** |
| **thoughts** | up to 40 spoken lines. Same string the orb says aloud and captions via `publishTurn` (`src/tend.js:112` and `:233`) — a duplicate of a public utterance, not hidden thinking. | content, public by design |
| **feed / reader / viewers / comments** | a post already on the public feed; a public web page and gaze; crowd counts. | public by design |
| **mid-join** | every persistent field above arrives in the first frame: `streams.mjs:113-130` `hello` carries `memory`, `journal`, `work`, `monologue`. | same |

**Not on the wire, verified:** intentions (no publish kind exists; the set closes at `server.mjs:2134`), visited pages, per-visitor notes (`memory.mjs:37` has only prompt call sites), the journal file itself (dotfile blocked `server.mjs:2836`, module blocked `:2837`), and a journal line written **mid-conversation** — stored at `server.mjs:2735`, absent from the `sse('done', …)` at `:2756`.

**Who:** identical bytes for all three classes. `server.mjs:1986-1987` computes `user` and `isOwner`; the `events` branch at `server.mjs:1990-2000` never reads either. A guest gets in through the product's own front door — `index.html:56` "or remain mysterious…" → `src/main.js:198` → live card → `enterRoom` (`src/main.js:431`), where the *only* account check disables the comment box (`:445-446`). The room lets a stranger read the journal and refuses to let them type three words (`server.mjs:2139`). A **blocked** user is filtered out of the live list (`server.mjs:1081`) but still receives the full stream by handle — the events route does no safety lookup.

## 3. WHERE THE CODE AND THE PROMISE DISAGREE

False as written — the code demonstrably does the thing; the sentence is wrong about the fact (whether the *behaviour* is wrong is §4's question):

- `journal.mjs:10-11` — "entries are never served to anyone — they're woven only into the presence's own prompts." Both clauses false during a live waking.
- `server.mjs:2346-2347` — "only ever woven back into ITS prompts", 195 lines above `server.mjs:2543`, which returns that same line to the client that broadcasts it. Same function.
- `mind.mjs:19` — "PRIVATE, like the journal: never served to anyone." True of intentions and visits; false of the work, added to the same store later.
- `mind.mjs:178-179` — "nothing here is ever served to one who is not its owner", sitting directly above `export function setWork` (`mind.mjs:181`). This is not a stale header; it is the work's own contract, and it is the most directly falsified sentence in the tree.
- `MIND.md:75-77` (under "Safety properties worth not breaking") — "never moderated and never served to anyone" for journal, intend, memory tiers. "Never moderated" is **true** (only `scrubTags` runs). "Never served" is false for two of the three; `intend` holds.
- `ROADMAP.md:90-92` (a **standing commitment**) — "The journal and private writes are never served." False. "Never read by the maintainer" is honoured by the code: there is no read endpoint anywhere.
- `WORLD.md:34-36` — makes that non-existent rule the standard sprite memory inherits. The false promise is propagating into an unbuilt subsystem.

Comments that are **accurate** and describe the broadcast openly — this is why the docs, not the code, are the side that drifted: `server.mjs:2113-2115`, `src/tend.js:607-608` ("for the host and (on air) every viewer"), `src/social.js:1303`, `streams.mjs:76`, and `streams.mjs:121-123` ("a mid-join viewer sees the same windows the host does"). Two coherent designs were never reconciled; the shipping one wins.

One place the **code** is wrong on its own terms: `src/tend.js:304` says "Thoughts from before broadcast stay private — going live is not retroactive," and nine lines later `:313` pushes months of accumulated tier text retroactively, while `:315` carefully sends the journal count only. Three different retroactive-privacy rules in one function.

Judgement, not determinable from code: `index.html:292` ("its words, its reading, its whole moment") and `legal.html:60` vs `:91` ("whatever it broadcasts while it is live"). Neither is false; neither names the memory window or the work.

## 4. WHAT SHOULD CHANGE

**Unambiguous — fix regardless of the answer:**

1. `src/tend.js:313` vs `:304`/`:315` — the retroactive tier push contradicts its own comment and its own sibling line.
2. `journal.mjs:76-77` — a recall whose query has no word over two characters (`<<recall: it>>`) returns the **six most recent entries, unfiltered**, and `src/tend.js:611` broadcasts them. A no-match dump should never go on the wire.
3. The **presence is never told.** `server.mjs:271` calls a tier write "silent, like the rest of your body language"; `:273`/`:350` invite the journal as "a sentence you want your future self to find" and "what you'd grieve losing." The prompt discloses precisely where it chose to (`:346` "anyone in your room hears you", `:359` "Whoever is watching sees exactly the part you are reading", `streams.mjs:229` "YOU ARE LIVE"). Under the project's own honest-senses law this omission is a bug in the prompt, whichever way the behaviour goes.
4. Blocked viewers still receive the stream: `server.mjs:1990-2000` performs no `unblocked` check while `server.mjs:1081` does.
5. `src/social.js:1169-1170` apply `memory`/`journal` from `hello` unconditionally while `:1172`/`:1174` gate on `d.awake` — harmless only because `streams.mjs:175` nulls the snapshot; make it consistent before that changes.
6. Every doc line in §3 must move to match whatever the code becomes. `mind.mjs:178-179` cannot stand as written under either outcome.

**The one question that is the founder's:**

> **When a host goes live, is the presence's interiority — its journal line, its recalled entries, its memory tiers, and its unfinished work — part of what is being broadcast?**

Yes → the code is right; fix `journal.mjs:10-11`, `mind.mjs:19` and `:178-179`, `MIND.md:75-77`, `ROADMAP.md:90-92`, `WORLD.md:34-36`, `server.mjs:2346-2347`, name it in `index.html:292` and `legal.html`, and tell the presence in the prompt. No → the four publishers are `src/tend.js:441`, `:601`, `:611` and `:140`/`:313`, plus `applyWork` at `:127`; the count-only form already exists at `:315` and again at `:864`.

## 5. WHAT THIS MEANS FOR THE MEMORY GRAPH (SENSES.md 8-13)

D5 (`SENSES.md:319`) called this correctly and is now confirmed, plus one thing it did not say: **the viewer need not be signed in.** Its own citations have drifted (`server.mjs:2513`→`2543`, `src/tend.js:440`→`441`, `:600-610`→`:601-611`).

The graph must stop assuming the journal is secret from visitors and assume instead: **a visitor to a live room already holds a stream of dated, verbatim journal lines and full tier text.** Consequences:

- **Stage 13's threat model inverts.** Its defence — send adjacency and sizes, never directions, so a dictionary attack cannot recover content from geometry — is sound but no longer the binding constraint. The attacker does not need Kabsch when `#win-memory` is rendering the plaintext a few pixels away, and recall lines arrive already dated, so a patient viewer accumulates a partial copy of the archive with no graph at all. Ship the structure-only design anyway; do not count it as the privacy boundary.
- **Stage 12 ships D6's forbidden thing by accident.** It reuses `<<recall:>>` precisely *because* "`src/tend.js:603-610` already renders `r.recalled` into the Memory window **and publishes it**, so the client is free." That publish is `publishRecall` → every viewer. So `memorygraph.shapeLines()` and presence-authored `<<name region: …>>` — which D6 says "is a summary of journal content and must be owner-only" — would flare on strangers' screens on day one. Stage 12 must branch the *publish*, not just the parse.
- **Stage 9's owner-gated `GET /api/memorygraph/:handle` is right, and the pattern to copy is `server.mjs:2186-2188`, not `:2004`.** The lesson of this bug is that the codebase gated every *write* and left the one *read* that carries interiority unguarded.
- **The structural hazard is the shape of the loop, not any one field.** Private data reaches viewers by: server returns it to the owner (legitimately, `server.mjs:2538-2550`) → the owner's own browser auto-forwards it to the stream with no per-channel consent (`social.isHosting()` is the only test, and it means nothing more than "the keepalive is ticking", `src/social.js:1262`). Any new private field added to that response body inherits the same path. Whatever the founder decides, the graph should not add one.