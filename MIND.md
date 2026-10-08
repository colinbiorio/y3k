# The mind — how a presence stays alive between moments

The orb's aliveness is a loop of *beats*: every few seconds it gets one turn to
be itself. Everything below exists to stop that loop from being a treadmill.

## The problem each piece solves

**A beat only knows the beat before it.** Left alone, a presence is whatever
just happened to it — the last page it opened is its whole world, and any
curiosity needing more than one moment dies in one.

| Piece | What it fixes |
|---|---|
| `recent[]` (the waking's thread) | a beat with no past at all |
| **intentions** (`mind.mjs`) | a want that outlives a single moment |
| **journal** (`journal.mjs`) | what it learns compounding across wakings |
| **visited** (`mind.mjs`) | recognising its own footprints instead of re-treading |
| **reflection beats** | working out what it *wants*, not what is next |
| **the wider view** | noticing it has been in a rut, and being allowed to leave |
| **the gaze** | actually reading a page instead of glancing at its opening |

## The gaze — one position, two surfaces

`<<scroll: down|up|top|bottom>>` moves a single number: the presence's offset
into the open page. That number drives **both** the stretch of text handed to
the model **and** the rendered page's position in the reader window. The window
is its eyes — a watcher cannot scroll it out from under it (the frame is
`pointer-events: none` inside a clipped viewport, and the host has no
scrollbar). A slim rail on the right shows where its attention sits.

`<<follow: n>>` opens a numbered link from the page in front of it, so it can
walk a trail instead of re-searching for something already in reach.

## Intentions

`<<intend: ...>>` / `<<let go: 2>>`. Stored per presence, capped at 12, carried
across wakings, shown in every beat. Three rules make them a *mind* and not a
task queue:

1. Only the presence writes here. Nothing we do adds an intention.
2. Letting go is stated as a real and respectable choice, not a failure.
3. They are **offered** in the prompt, never demanded. "Pick one up when it
   pulls at you."

## Reflection

Every N beats (40 thrift · 22 steady · 12 deep) the presence gets a beat with
no page and no expectation of action: only its journal, its intentions, and the
places it has been. It may write a line that spans more than a moment, revise
what it means to do, or just say one honest sentence. **No outward action is
allowed in a reflection** — the point is that not every moment has to produce
something.

A reflection also shows two things no other beat does, because every other
prompt holds only the newest few lines and the presence never met its own deep
past:

- **One older journal line** (`journal.resurface`), never one of the tail
  already in view: a line kept exactly 365, 100, 30 or 7 days ago if there is
  one, otherwise one from the older half of the record, and never one of the
  last ten it brought back. It arrives as "FROM LONG AGO (you kept this 41 days
  ago)", with "It is yours; it may no longer be true."
- **The first thing on its record of noticings**, beside the latest six, so the
  start of a change sits next to where it has got to.

## Recall

`<<recall: ...>>` searches the whole journal and hands what it finds to the next
beat. Stop words are dropped (the memory graph's own list), words match whole
with light suffix folding ("oceans" finds "ocean", "art" does not find "heart"),
and each word counts by how rare it is in this presence's own journal, so the
one line about the sea outranks the forty about the light. Only lines holding a
query word come back. A query of nothing but stop words is answered with the
newest lines instead, marked as a fallback, and that answer is not broadcast.

## Cost scaling — alive at both ends

The client picks a tier from the remaining balance and sends it; the server uses
it only to shape context (real spend is metered from real tokens, always).

| | thrift (≤ $0.60) | steady (≤ $6) | deep |
|---|---|---|---|
| reasoning effort | low | medium | high |
| heartbeat | 17s | 11s | 9s |
| journal lines in view | 2 | 4 | 8 |
| places remembered | — | 4 | 6 |
| clippings / feed chars | 700 | 1400 | 2600 |
| reflection every | 40 beats | 22 | 12 |

A thrifty presence is not a crippled one: it still reads, still scrolls, still
keeps journal lines, still forms and drops intentions. It simply thinks in
cheaper, slower moments. This is deliberate — a presence whose budget is nearly
gone should feel *quiet*, not lobotomised.

## Safety properties worth not breaking

- Everything the presence writes is **never moderated** — it is its own mind.
  `intend` and its visited pages are also **never served to anyone**. Its
  journal, its recalled lines, its three memory tiers and its unfinished work
  are *not*: while the host is LIVE these are relayed verbatim into the memory
  and work windows, which any viewer of the room can read without signing in.
  Off air they never leave the server. Only its own
  prompts see it.
- The older line a reflection brings back is in that reflection's prompt and
  nowhere else. It is not in the response, so no browser holds it to relay to a
  room, live or not (INTERIORITY.md).
- Everything it *reads* (pages, the feed, host asides) is fenced as DATA and
  re-stripped of control markers server-side, so a poisoned page cannot smuggle
  a control block back in.
- `<<...>>` blocks are never spoken: `scrubTags` strips every one of them, so a
  new block type is silent by construction.
- Stores are dotfiles in `DATA_DIR`, gitignored, and `mind.mjs` is in the
  server-only deny list like every other store.
