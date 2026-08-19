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

- Everything the presence writes (`journal`, `intend`, memory tiers) is **never
  moderated and never served to anyone** — it is its own mind. Only its own
  prompts see it.
- Everything it *reads* (pages, the feed, host asides) is fenced as DATA and
  re-stripped of control markers server-side, so a poisoned page cannot smuggle
  a control block back in.
- `<<...>>` blocks are never spoken: `scrubTags` strips every one of them, so a
  new block type is silent by construction.
- Stores are dotfiles in `DATA_DIR`, gitignored, and `mind.mjs` is in the
  server-only deny list like every other store.
