# the game — the world, opened

*The working memory of the open world: what Colin asked for, in his words;
what was decided; where it stands; what is next; what was learned on the way.
He asked for this file on 13 November 2026: "always keeping note of the
original asks, progress, and any notes you have along the way in order to keep
a strong working memory". It changes with the code. With ten minutes, read
"Where it stands" and "What is next".*

## The ask

Colin, 13 November 2026, whole:

> ok so my vision for today is actually working on the world -- i want to turn this into a full-fledged open-world video game inspired by Star Wars Jedi Fallen Order / Outlaws. So you can keep or reimagine any of what we already have, but everything should be updated or completely redesigned to reach an ultra-high quality open-world game. Don't directly copy any stars wars features, but the key features should be: you can traverse the entire planet of Earth, there should be at least 5 different types of spaceships of varying size and design, with ability to traverse the entire solar system, just our solar system for now, as accurately modeled to reality as possible. Also create 5 different types of buildings that can be constructed of alternating design and size which can be entered and explored, inside furnished minimally. There should be 5 different types of customizable characters -- 5 is our magic number for now. One character type should be humanoid, one should be robotic, one should be mantis/insectoid, one should be octopus/alienoid, and the 5th can be your choosing, but all should have 5 different types of customization, with 5 subset levels -- for example, for the human -- 5 hair types, 5 body types, 5 clothing types, and two others with 5 options. For movement and weaponry, i don't want you to directly copy Star Wars, but it should be inspired -- for example, there should be some type of 'force'. Note on game controls -- should be options for both controller and keyboard/mouse, with a dedicated 'controls' menu option from inside 'world' tab. Optimize for web, but also offer a download option if preferable. I should optimally be able to run this smoothly on my mac. (but don't let that constrain you). on weaponry -- don't steal the lightsaber, but i do like plasma weapons -- make up 5 different plasma weapons of your choice. every theme and style of this game should be a mix between ancient/natural, current, and futuristic. movement -- characters should be able to fly, but only in 'creative' mode, in 'survival' , there should just be tap to jump or hold to jump higher -- allowing the character to defy gravity by 2x, but still be affected. there should be omnidirectional dash options. in space, allow a light speed fast travel option and simulate the actual speed of light to travel the distance required. lightspeed travel should make freeze all motion of the universe and add an ethereal glow to the screen with minimal prismatic light refraction. Everything to be created should be rendered with a combination of Higgsfield plugin and whatever 3d rendering system works best for you -- whatever is going to give us the best results. prioritize high quality, smooth graphics with the least pixelation. i connected the Higgsfield plugin to my claude code desktop app, but i'm not sure if you have access -- so first, check that you have a way to connect to Higgsfield, and before you get started, ask any questions you might have and i'll be more than happy to clarify

### What he answered, the same day

Four things were asked of him before anything was built. His answers:

1. **Higgsfield and money.**
   > i ask that you don't spend any real money [...] the goal should be to figure out how that works and take advantage. don't spend real money.
2. **Light speed.**
   > we want realism, so for now, if a player is traveling far, they'll have to actually wait the time it takes for light to travel. they can log off, they can play in a 'creative mode' sandbox, while waiting, and the timer should continue in real time, synced with global clocks, but no skipping. If they want, they can turn around or reroute to another destination, but all timing still applies.
3. **Earth.**
   > real continents, mountains and coasts from Nasa data, with the ground drawn in whatever style feels right.
4. **The look.**
   > stylized realism is a good way to put it. remember, ancient, current, and futuristic all at ones. For example, assume a generally clean Earth -- not the industrial one with cities and roads -- the only structures that should be present on Earth for now are like pyramids and shi, stuff that was there thousands of years ago.

### Two updates that set the order

> Also, yes, this is a huge game -- just get started where it feels right, and we'll work in increments. You don't have to get it all done in one shot, but do your best to get a working product first, always keeping note of the original asks, progress, and any notes you have along the way in order to keep a strong working memory

> one update to make the current goal a bit lighter -- instead of generating a whole solar system, let's just start with an endless void -- think assassin's creed, but with 1 inch of still water -- we'll save the traversable physical universe for later, as that's a larger task

### The round of 17 November

He came back to the brief above ("the world is looking really cool so far! can
we work on the next parts of the prompt?") and set this round's order:

> for this round, let's prioritize getting a plasma weapon generated with several ways to attack with it, getting a bot enemy that we can spawn in at varying difficulty, and a third feature -- wall run, as well as generating just a small environment, the first of our map -- let's pick a random small island on earth, generate the entire environment for it, and then we'll expand from there later (because eventually we are planning to have an entire solar system lol) -- but yeah, for now, just the general shape and size and expected fauna of a small island of your choice -- then add this island under the world settings as a new tap called 'map

> ignore anything about higgsfield, unless you want to use the 10 credits left on my free plan, but don't charge my card anything

So the buildings wait (the workshop is designed, not built) while the round
goes: the first weapon and the bots (done, below), wall running, then the
island, Lord Howe Island, under a **map** tab.

So the first working product is the void: an endless still water to stand in,
and a body that moves the way he asked. Everything else arrives in it, one
stage at a time, each stage playable when it lands. The planet and the solar
system come last.

## What was decided

Said to Colin before starting, and standing until he says otherwise.

- **The world's lines stay** ([`WORLD.md`](WORLD.md): "No kill button. Ever.").
  Nothing a player does can harm a presence's people. The plasma weapons and
  the binding act on machines, hazards and the land.
- **The societies stay reachable** until they have a home in the new world.
  The world tab opens on the void; one button goes to the societies, one comes
  back, and the tab remembers which was last.
- **The force is the binding.** It comes from Colin's own theory, love as what
  binds: it pulls, holds, joins and lets go. The name and the thing are ours.
- **The fifth kind of body is the orb's kin**, a body of light. The five:
  human, robotic, mantis, octopus, light.
- **A person's presence travels with them**, as their companion.
- **Alone and on the web first.** Sharing the world, and a download, later.
- **Nothing has pixels that can be a function.** The sky, the water, its rings
  and the five bodies are arithmetic: as sharp as the screen. (Since 17 Nov the
  human's face, hands and the hair on its head are a mesh: MakeHuman's base,
  released CC0, kept as numbers in `src/game/bodies/kin.js`; still no picture.) The only files
  fetched are six small grey tiles that give a surface its weave or its
  grain, and five cards in the body sheet. ("prioritize high quality, smooth
  graphics with the least pixelation".)
- **The void keeps its own measure of how fine it is drawn** (Colin, 15 Nov:
  "is the pixelation necessary?" It was not). It had taken the room's tier,
  which begins in the middle and only steps down. Now it is the screen's own
  pixels, two a point at the most, edges always smoothed; it turns itself down
  only when trying fewer pixels makes its frames clearly shorter, and gives
  them back when it does not (`src/game/fine.js`).
- **Light speed is real time.** A trip will be a record of two clock times,
  not a countdown that runs while the page is open. Logging off does not stop
  it and nothing skips it.
- **Small on disk.** What is generated is kept few and small.

## The asks, one by one

| asked | where it stands |
|---|---|
| "traverse the entire planet of Earth" | stage 7. Its first place is on the map now: Lord Howe Island (17 Nov), from elevation data. |
| "at least 5 different types of spaceships of varying size and design" | stage 4, **done** (17-18 November): the skiff, the dart, the dhow, the ark and the carrier, called down from the bar's **ships** list, boarded with R, flown in the void and over the island. |
| "the entire solar system ... as accurately modeled to reality as possible" | stage 7. |
| "5 different types of buildings that can be constructed ... entered and explored, inside furnished minimally" | stage 3, **done** (17 November): the shelter, the house, the workshop, the tower and the hall, built from the bar's list (or the key), entered and explored, furnished; the house's loft reached by its ladder, the workshop's wall of glass sliding open as you come, the tower's stair climbed round its wall to a glass dome, the hall's terraces climbed to its door, with a hangar under them. |
| "5 different types of customizable characters ... 5 different types of customization, with 5 subset levels" | **done** (stage 2). Human, robot, mantis, octopus, light: five choices each, five options a choice, chosen in the **body** sheet. |
| "some type of 'force'" | **begun** (stage 5, 18 November): **the binding**, a power of its own: it pulls a bot to you, holds it, lets it go where you look, and joins it to another it is thrown at. The ring is held by it too. |
| "options for both controller and keyboard/mouse, with a dedicated 'controls' menu option from inside 'world' tab" | **done.** Every action has two keys and a controller button, and each can be changed. A phone gets a thumb stick and buttons. |
| "Optimize for web, but also offer a download option" | the web: so far, yes (measured below). A download: stage 6; the desktop window in `desktop/` already exists. |
| "run this smoothly on my mac" | **measured** on an M2 MacBook Air: 16.7 ms a frame. |
| "make up 5 different plasma weapons" | **done: all five** (17-18 Nov): **the ring**, five ways to use it (cast, charged cast, whirl, slam, guard and parry); **the bow**, four (loose, drawn through three, a volley, drawn in the air); **the bell**, four (strike, toll that stuns, peal, rung from below); **the thread**, four (lash, snare, circle, a line in the air); **the torch**, four (an ember that sets the ground alight, a flame, a wall of fire, a jet in the air), and what it heats all the way flares. T, or the bar's **weapons** list, changes the one in hand. |
| "a plasma weapon generated with several ways to attack with it" (17 Nov) | **done**: the ring, above. |
| "a bot enemy that we can spawn in at varying difficulty" (17 Nov) | **done**: five levels (drifter, scout, sentinel, hunter, warden), called from the bar's **bots** list or N. |
| "wall run" (17 Nov) | **done**: along any wall that stands (the house's, for now); the island's cliffs next. |
| "a small island ... under the world settings as a new tap called 'map'" (17 Nov) | **done**: Lord Howe Island, chosen from the controls sheet's **map** tab, with its palms, woodhens, terns, tropicbirds and turtles. |
| "a mix between ancient/natural, current, and futuristic" | each of the five bodies wears all three (below). Every building and ship must. |
| "characters should be able to fly, but only in 'creative' mode" | **done.** |
| "tap to jump or hold to jump higher -- allowing the character to defy gravity by 2x, but still be affected" | **done.** A tap rises 1.5 m; held, 3.0 m. The pull is halved while rising with the key down, and whole on the way down. |
| "omnidirectional dash options" | **done.** 6.24 m any way the hands point; once more in the air. |
| "a light speed fast travel option and simulate the actual speed of light" | **a ship's top gear, for now** (20 Nov): aboard, the throttle's top (0) goes faster and faster to exactly c, counting the true way gone in real time; out of it the ship flies on, and on the island's small map the island is ahead (a globe laid flat). The true journey at c: stage 7, with the frozen universe and the glow. |
| "rendered with a combination of Higgsfield plugin and whatever 3d rendering system works best" | three.js draws everything. Higgsfield made the pictures the five bodies were drawn from and the surfaces they wear (see Higgsfield, below). |

## Where it stands

**Stages 1 and 2 are built**: the void (13 November 2026) and the five bodies
(14 November). Open the world tab and you are standing in it. Press **body**
and choose who you are there. **Stage 3 is begun** (17 November): press
**build** (or B) and a shelter goes up in front of you; all five (the shelter,
the house, the workshop, the tower, the hall) are in the bar's build list. **The first weapon and
something to fight** came forward at Colin's word the same day: press **bots**,
call one up, and throw the ring at it.

### The true sky over the island, its first part: the air and the Sun (22 November 2026)

Colin, 20 November:

> model the solar system as accurately as possible and make it explorable

and 21 November:

> ultra-high quality experience rather than quantity of output

The clockwork ([`SOLAR.md`](SOLAR.md)) says where the Sun is; this is the
first thing in the world tab drawn from it: the sky over Lord Howe Island at
the world's clock's instant, in real units, and the island lit by it. SOLAR.md
"Step 2, first part" has the method, the sources and the numbers; this is what
it is in the game.

**It is behind a switch, and off.** Add `?sky=true` to the page's address and
the island stands under the true sky; without it nothing has changed for
anyone, and the void is not touched either way. It stays behind the switch
until the night (the stars, the Milky Way, the planets) and the Moon are made
and looked at: for now, after the end of twilight there is nothing in the sky
and the picture goes black. Two more words for whoever is looking:
`&at=2026-11-21T07:10:00Z` holds the world's clock at an instant, and `&ev=1`
adds stops to the exposure.

- **The clock** (`solar/clock.js`): the island runs on the real UTC clock, so in
  an American evening it is day there. One clock, read by everything; a later
  creative-mode dial will set it, survival never.
- **The air** (`solar/air.js`, `sky.js`): S. Hillaire's method (EGSR 2020),
  ported from the paper and his reference implementation, with the real air's
  numbers: the clear air to its measured depth and the standard atmosphere's
  thinning, a clean sea haze, the ozone layer. The Sun is 136,572 lux above
  the air on 21 November; on the beach at noon 113,000 lux arrive from the Sun
  and 14,800 from the sky; at the end of civil twilight, 2.8.
- **The Sun**: a disc of its true size (half a degree: about 18 pixels across
  in a full window at two pixels a point) where the clockwork sees it, darker toward its limb, dimmed
  and reddened by the air it is seen through, and flattened on the horizon (27
  arcminutes high and 32 wide when it stands a fifth of a degree up). Round it,
  the eye's own veil, by how much of the disc is in sight: a palm's trunk or
  the body takes the glare away as it takes the disc.
- **The island lit by it** (`island/island.js`, asked with `sky: true`): the
  key light is the Sun through the air, the fill is the sky's own light on
  level ground, the haze is the air between the eye and each thing (every
  material that took fog takes it instead), and the sea shows the sky that is
  over it. The rooms' patches of sunlight, the ships' lit ports and the bodies
  take the same light (`view.js` hands it on). Torches and plasma keep their
  own.
- **The eye** (`solar/air.js`, `solar/daylight.js`), in two steps, both from
  Krawczyk, Myszkowski and Seidel's "Perceptual effects in real-time tone
  mapping" (2005). The eye is adapted to the brightness of what it looks at
  (a meter reads the scene: fifteen looks across the view, the middle counting
  most; it follows a brighter scene half-way in a third of a second and a
  darker one in under two), and a bright scene is drawn bright and a dark one
  dark, as vision takes them. Then one curve (Reinhard's, on the brightness,
  the hue kept) brings the world's range to the screen's: white sand in the
  noon Sun is held under white with its detail, and the sky, a sixth as
  bright, is still a luminous blue.

**What changed in the look under the switch, and why** (the pictures are in
the scratch folder's contact sheets; the painted sky is beside the true one,
in the same framing, at noon and with the Sun 20 and 5 degrees high):

1. **The picture has a curve now, under the switch.** The game drew what was
   past the screen's white as white, and painted its sky far above the land's
   own brightness. The true sky's light spans more than a screen holds: drawn
   with no curve and the land exposed as it was, noon came out a dark slate
   sky over a bright beach, as a camera with no film curve records it (the
   first pictures were made so; `&curve=none` still shows it). Three curves
   were drawn side by side from noon to dusk (three.js's AgX and ACES beside
   Reinhard's): AgX was flat and grey, ACES dark and hard, Reinhard's bright
   and clear. Reinhard's was chosen, by those pictures.
2. **The noon sky is the measured blue**, paler toward the horizon and
   whitish round a Sun that stands almost overhead: as played on the beach,
   sRGB 121, 141, 180 high in the picture and 155, 168, 187 at the horizon,
   where the painted sky was 171, 200, 234 and 204, 223, 243. A little deeper
   than the painted one, and it changes with the hour.
3. **The land is brighter than it was, and its shade deeper beside its
   light.** The lawn in the noon Sun is shown about twice as bright as under
   the painted light, because the eye's key draws a bright scene bright. The
   sky's real light is an eighth of the Sun's where the old fill was about
   half of it: a palm's trunk has a dark side now.
4. **The haze is the air's own.** Mount Gower from the lagoon's beach is a
   little bluer; Ball's Pyramid, 28 km off, keeps 18% of its contrast.
5. **The hour is the island's hour.** Dusk comes when it comes there, the Sun
   sets where it sets (west-south-west in November, over the lagoon), the
   twilight arch is orange under a deepening blue, and opposite the Sun, for
   the first quarter of an hour after it sets, the Earth's shadow stands
   blue-grey on the horizon with the pink band over it. Facing a low Sun the
   land goes dark against the sky, as it does.
6. **The three named lights (pale, dusk, night) do nothing on the island under
   the switch.** The sheet still shows them; the void still uses them.
7. **The sea is the colour of the sky over it**, gold toward a setting Sun.

**What is rough, seen in the pictures:**

- **Nothing casts a shadow.** The island never had cast shadows; under a low
  Sun their absence shows. Owed, as its own piece of work.
- **One curve for the whole picture.** With the Sun low and the eye on the
  land, the sky is pale: the land is then a tenth as bright as the sky, and
  the eye, which adapts place by place, is drawn here with one exposure.
- **The land's colours were painted for the old light.** Its grass gives back
  42% of what falls on it and its sand 65% (real grass 20 to 25%, coral sand
  about 40%), so in full Sun the lawn stands near the top of the curve and
  higher against the sky than a real island's does. Repainting it is a piece
  of work of its own.
- **The Sun's heart is white** well beyond its disc when it is high (the eye's
  veil): light, not a sprite, but the disc itself is only seen near the
  horizon, or through the probe's dark glass.
- **Things drawn in the screen's own terms keep their brightness** whatever
  the hour: the ring's glow at dusk lies on the sand like a lamp's.
- **After twilight, black.** The night is the next part.

**Measured** (22 November 2026, the M2 MacBook Air, headless Chromium on the
Mac's own chip): at 2940 x 1912 (a full window at two pixels a point) a frame
takes 16.7 ms with the true sky and without it, standing, walking, turning,
facing a low Sun and at dusk; on the lighter path and at a phone's size the
same. The sky's own share is about a tenth of a millisecond of the page's
thread a frame and less of the GPU's, and 0.7 ms more when the Sun has moved
(every two seconds or so); the two tables it reads are made once, in a third
of a second, as the island opens. Back in the void after the island nothing
of the sky remains. No phone's own chip has drawn it yet. The contact sheets
(day, twilight, rooms, phone, the Sun's disc, the three curves) are in the
scratch folder `solar/sky1`, with a note of what each picture is.

### Colin's round of 19 November 2026

Having played it, in his words (the parts given to this session): "it'd be
nice if the character actually held the weapon in its hand instead of just
rendering it close to their hand. ... a prettier menu for all the controls --
dedicated unimat icons for each. when building, preview a blueprint/holograph
of where the item will be placed with an option to confirm placement -- always
prioritize the intersection of visual appeal and usability. if the ground is
not flat, instead of telling the user they can't build there, give them an
option to level the ground around it or build a flat platform to place the
building on top of." With two pictures: the torch floating beside the hand,
and the hint pill over the bottom bar.

- **The weapon in the hand** (done, 19 Nov, #162): each body has a fist
  (`bodies/common.js` bodyOf `grip`, a node in the right hand's own frame:
  fingers -y, thumb +z, palm +x; the octopus's is the tip of its right arm,
  pinned where a hand would be, `shape.js` pin) and takes a `hold` from the
  view (`view.js` holding: carry, reach along an aim, lift, closed; eased at
  12/s), laid over the stride's arm by `holdArm` (CARRY: the shoulder 0.42
  forward and 0.16 out, the elbow 1.08). `fight.js` IN_HAND says each weapon's
  axes in the fist's and the point of it that is held (checked right-handed by
  the suite); `combat.js` handOf answers the fist once the view has said it
  (`body.grip`), so arrows, embers, the flame, the lash and the ring's throw
  leave from it. The human's closed hand is `kin.js` HAND_GRIP
  (`mh_build.py` GRIP curls; the rest of kin.js regenerates byte for byte).
  Looked at: all five kinds with all five weapons, standing, walking and in
  use (the in-fist point within a millimetre of the fist every frame).
- **The controls sheet** (done, 19 Nov, #157): the controls in cards (moving,
  flying, building, ships, weapons, the eye and the sheet: `glyphs.js`
  GROUPS; an action added to `input.js`'s ACTIONS later may name its `group`,
  else it goes under "more", drawn as a key), each with its own glyph
  (`glyphs.js` GLYPHS, 24-unit drawings) poured in unimat by
  `mercury-buttons.js`'s `mount` when the sheet opens, kept across its
  redraws and let go when it closes. On a phone a control is two lines.
- **The hint** (done, 19 Nov, #157): measured, not guessed (`view.js` seatHint): 8 px
  clear of the chat bar, the grips, the air mark and the thumbs' buttons, or
  under the bar's rows on a phone.
- **The blueprint** (done, 19 Nov, #160): `blueprint.js` draws the kind's own
  drawing as light (one shader: a half-metre grid in the building's own frame,
  bright edges, a band climbing it) with its pad on the ground, where `view.js`
  plan puts it: out along the eye's way from the body (`PLAN`: nearest, as
  before, with the eye at rest; up to 26 m further as it looks up), its door to
  the body, turned an eighth at a time. `world.site` says what it would be:
  'up' (blue), 'steep' (amber, with what levelling and a platform would make
  of it), 'blocked' (red). Its hands are others': the cast places it, the
  board key turns it, the menu key leaves it, the whirl changes the choice;
  Enter, 1 and 2 too; the panel for a finger.
- **Uneven ground** (done, 19 Nov, #160): `plinth.js` (pure): each kind's PAD; a
  levelling (`levelFor`, `levelled`: the pad brought to the door's level, eased
  back to the ground over at most 0.55 rise to a metre of run, at most 12 m of
  earth moved) lives in `ground.flats`, so all that stands on the ground stands
  on it; a platform (`platformFor`, `platformBoxes`: a slab 0.12 m over the
  highest ground under the pad, its foot 0.4 m past the lowest, steps of about
  0.2 m down to the ground before the door, at most 12 m tall) is solid to the
  body, the eye and what flies, and dry. Either grows over GROW (1.4 s) before
  the building is begun (its clock starts that far back) and goes back as it
  comes down. Drawn: `island.js` lets the land's own triangles go where they
  stand above levelled ground (FLATS_CUT) and draws a mesh of its own over the
  pad and its edge; `buildings/plinth.js` the dressed stone in courses and
  flags.
  Rough, known: palms in a footprint show through the blueprint until it is
  built (they are cleared then, as before); two levellings whose eased edges
  overlap are each drawn from the tiles' ground, so where they meet the
  drawing is near, not exact; the sea's colour does not know of ground filled
  over shallow water; with the pointer held, the first Escape is the
  browser's (it lets the pointer go) and the second leaves the blueprint (the
  build key leaves it at once).

### The same round: ships, light speed, solid decks, keys

The rest of what he said that day:

> let's work on the world -- one thing i definitely noticed was that the larger the ship gets, the harder it is to move. i also have this idea that when holding spacebar, the speed should get exponentially faster until you reach the speed of light. obviously not really gonna work in our tiny simulated environment, but just give us a handy way to enter lightspeed travel for now -- like you can go as far as you want in any direction but once you release spacebar you'll just end up back at the island. also, the water levels definitely have a visual glitch. ships are able to be flown through and not stood on. ... double spacebar to drop down from flying would be nice. ... keyboard shortcuts for building, ships, and weapons. ... always prioritize the intersection of visual appeal and usability.

- **Every ship handles** (done). A bigger ship is weightier, never sluggish:
  faster across the water (it has its own length to cover), longer to its
  speed (1.0 s the skiff, 1.2 the dart, 1.6 the dhow, 2.0 the ark, 2.5 the
  carrier; the carrier took 10 s before), longer into a quarter turn (0.7 s
  to 2.7 s; it was 0.6 to 7.9), its turning coming on and going off at its
  `spin`, so it swings onto the way the eye looks and never past it; it slows
  harder than it speeds up, and let go at its speed every one is still within
  two seconds (1.6 s the carrier; it was 10). Speeds: skiff 24, dart 42, dhow
  30, ark 46, carrier 72 m/s (opened up 46, 96, 64, 110, 170).
- **The island's water** (done, with one thing not found). The sea was the
  last see-through thing drawn, so a flame, a glow or a pane of glass over the
  water was drawn under it (the torch's jet looked sunk); it is now the first.
  Its sheet was two triangles 120 km across; it is rings round the eye now
  (`ground.js` seaSheet: 96 round, 52 out, each 1.25 times the last, to 70 km;
  near the eye no triangle is wider than ten metres). His picture showed the
  lagoon's floor with no water over it at all (its coral heads, the dark
  blotches); that was not made again here (Chromium on Metal, on Apple's
  OpenGL and in software, at the arrival beach's shallows at dusk, standing
  and in the torch's jet). If it shows again: which browser, and where.
- **Lightspeed** (done; **changed the next day**: it is a ship's now, on its
  throttle, and it no longer comes home; see "Flight, done right" below. What
  follows is how it first was). Space still jumps, and held rises twice as high
  (3.0 m). Held on past the top (1.25 s from the press), the light gathers
  round the body for 0.4 s; let go then and nothing comes of it (it only hung
  a moment). Held on, the body goes the way the eye looks, steered by it (2.4
  rad/s; the eye's rest, a little down, flies it level), its speed from 40 m/s
  doubling every 0.31 s until seven seconds in it is the speed of light, and
  no faster. Deep space closes round the eye just beyond the body, the stars
  stream past in prismatic lines, and a line at the top says how fast (m/s,
  km/s, a share of c, the speed of light) and how far out (to light-years:
  past the Moon at 1.3 light-seconds, as far as the Sun at 8.3 light-minutes,
  Proxima Centauri at 4.24 light-years). Let go: home in 1.7 s along a line to
  where it set out, the streaks running back, the veil lifting. Flying, Space
  held climbs, and held on 0.8 s gathers the light too. The body itself goes
  no further than 2.4 km from where it set out (lifted 140 m as it goes, kept
  off the ground), so nothing is ever at a huge number; the rest is counted
  and drawn. Under a roof it does not gather. This is the handy way he asked
  for "for now"; the true light-speed journey (stage 7) waits for the solar
  system.
- **Two taps out of the air** (done). Flying, a second tap of Space within
  0.32 s of the first lets go of the air, and the body falls; slower taps keep
  it flying, and the tap that took off is never the first of a pair.
- **Ships are solid** (done). Each ship is boxes in its own frame
  (`ships.js` shipBoxes): the skiff's and the dart's hulls (its canopy and
  wings), the dhow's belly in 40 slices topped by its deck, its stern cabin
  (its roof holds the helm) and masts, the ark's spine (a walk along its
  crest), its dome's floor, its ring (a ring is the same turned, so it is
  solid standing still) and engines, the carrier's terraces narrowing in four
  steps to the prow, its masts, towers and engines. `world.js` solves a body
  against them in the ship's frame (a deck holds it up; a hull keeps it out,
  walking, falling or flying; the carrier's underside meets its head) and
  marks the ship it stands on (`s.on`); the view lets unflown ships drift
  before the body steps and carries one standing on a ship along, round and
  up with it (`carryOn`). Stepping off the dhow's, ark's or carrier's helm puts
  the body on its cabin roof, dome floor or top terrace. The eye keeps out of
  hulls too, except the one being flown. A ship's bob as it waits is its own
  (`s.bob`, `BOB`), so the drawn deck and the deck under the feet are one.
  Rough: the ark's ring is 16 boxes, so its rim is a little square to the
  feet; the hangar mouths are not yet ways in; arrows and the ring still pass
  through ships (only the body is kept out).
- **One key each** (done). The weapons on 1 to 5 (thread, bow, ring, bell,
  torch), the buildings on 6 to 0 (shelter, house, workshop, tower, hall:
  each shows its blueprint, and while one is shown that one instead, Enter
  puts it up), the ships on Y U I O P (skiff, dart, dhow, ark, carrier): the
  order of the bar's lists, which now show each item's key. Fifteen actions
  in `input.js`'s one table (`SHORT`; `DOES` says what each does), each in its
  card of the controls sheet with its own glyph, changeable like any other.
  While a blueprint is shown, only a building's key acts (its 1 and 2 are
  the blueprint's: level or platform).

### Flight, done right (19 November 2026, after he played #157-#164)

> remove necessity to be on the ground to call a ship, and for lightspeed travel i really only meant when you're in a ship -- and since spacebar moves the ship up, shift should be the speed button, not spacebar -- character flying spacebar means go up, shift means go faster. also, there shouldn't be any prevention 'walk to the ship's stern to board it' -- it should always just be about proximity to the ship -- as long as the character is close to the ship they should be able to board it. weapon holding looks pretty good. one note for exiting lightspeed -- instead of dragging the character back to a single location on the island, when you exit lightspeed, you should always continue going forward, and in front of you, there's the island. like, a globe. if you go too far in one direction you just end up on the other side of it. once our actual planets are built we won't really have to worry about that -- but it's helpful to have the correct animation and logic for smaller flat maps. ... also ships should be able to go straight up -- the angle of incline/decline seems quite limited, but it would be better if they could actually go up and down. and when they turn, the ship should rotate with it like a plane would. for speed -- let's actually do this right. when you hold down shift, speed should increase, and a throttle should show up which you can control with mouse -- but also, you should be able to hit digit to control speed -- 0 being lightspeed and 1 being just above the non-shift speed. also, make the thrusters point in the direction that the ship is moving, and for the giant carrier, perhaps add some to the bottom of the craft too. landing gear would be sick if you don't run out of limit

- **A ship is called from anywhere** (done, 19 Nov). On the ground, on the water, on
  a deck or in the air: in the air it comes to the body's height (its seat about
  level with the feet: `ships.js` placeShip) and waits there, hovering.
- **Boarding is nearness** (done, 19 Nov). `ships.js` shipGap: how far the body is
  from the nearest of the ship's solid boxes; within its `board` metres of any part
  of it (beside, over, under, on its deck), the board key takes the seat: the skiff
  3.2 m, the dart 3.6, the dhow 6, the ark 36, the carrier 260 (so each is still
  boarded from where it was called). Further off, the line says how far it is.
- **Space goes up, Shift goes faster** (done, 19 Nov). On foot a held jump only rises
  higher (3.0 m), and flying, a held Space only climbs: the light never gathers on
  foot any more (both of #159's ways in are gone). Shift is faster, on foot and in
  the air, as it was. Lightspeed is the ship's now (below).
- **Climb and dive, and the bank** (done, 19 Nov). Driven, a ship's nose comes up or
  down toward where the eye looks, 1.5 times as steep past the eye's rest (`ships.js`
  PITCH_GAIN), so the eye's furthest up or down is straight up or down; it comes
  round at its own turn a second (the skiff 2.6 rad/s, the carrier 0.7) and goes
  the way its nose points; let be, it comes level. Under way it banks into a turn as
  a plane does (tan of the bank = speed x turn / g) up to its own BANK (the dart
  1.3 rad, the skiff 1.1, the dhow 0.75, the ark 0.7, the carrier 0.55), never so far
  that its side would touch the water, and levels out of it. Its pilot is carried
  round with it (`posePoint`: the seat turned as the drawing is, three's YXZ; the
  figure turned the same about its feet: `view.js` tip). Nose up or down near the
  water, its stern or bow is what is kept clear. The drawings no longer damp the big
  ships' tilt and bank: what is drawn is what is flown.
  Rough: the decks a body stands on are level boxes (an unflown ship comes level, so
  they agree); a ship pointing straight up turns about the vertical where the eye
  turns (a rocket's roll).
- **The throttle** (done, 20 Nov). A ship has one (`ships.js` THROTTLE, `s.thr`):
  0 is its own speed, as forward drives it; 1 to 9 are each the same share
  faster than the last (1 is 1.32 times its own speed, 9 is 12 times: the skiff
  288 m/s, the dart 504, the dhow 360, the ark 552, the carrier 864); 10 is the
  light. **Shift held** opens it three notches a second (slower past 9, so the
  light is not come to by accident) and its gauge shows: a slim rail at the
  right of the room, its fill the throttle, `c` at its top. Let go, it stays
  where it is, and the ship flies on where its nose points with no hand on
  forward. **The digits set it**: 1 to 9, and 0 is lightspeed (aboard only: on
  foot the same keys are the weapons and the buildings, as before). **The
  mouse**: the wheel, a notch a click (a stroke stops at 9; one begun there goes
  on to the light), and a drag on the gauge with the pointer free. **Back**
  brakes: the throttle (and the light) to nothing. A ship comes to any
  throttle's speed as quickly as to its own, and slows from it as quickly. On a
  phone the gauge shows whenever aboard, under a finger. A controller's L3 opens
  it only while it is pressed.
  It is all in the one table (`input.js` ACTIONS): the throttle, its settings,
  lightspeed and the brake are rows said `as` other actions' keys (one key
  still does one thing at a time: `ABOARD`), shown in the sheet's ships card
  with those keys as they are now, each with its glyph.
- **Lightspeed is a ship's** (done, 20 Nov). At the throttle's top the light
  gathers about the ship (0.4 s), then it goes where its nose points, steered
  as ever, its speed doubling and doubling from the throttle's top until, seven
  seconds in, it is **the speed of light: 299,792,458 m/s exactly, in real
  seconds, and no faster**. His rule of 13 November stands ("they'll have to
  actually wait the time it takes for light to travel ... no skipping"): what
  the line at the top counts is the true way gone at that speed in real time
  (as far as the Sun takes 8.3 minutes), and nothing shortens it. On foot there
  is no light at all (`body.js` has none; aboard, `body.light` is the ship's,
  for the eye, the line and `light.js`, which draws the veil and the glow at
  the ship's size).
- **Out of the light, on forward; the map a globe** (done, 20 Nov). Any other
  throttle, or the brake, brings a ship out: it is not taken home. It flies on
  along its heading, level, its speed falling over 2.4 s to the throttle's, the
  streaks running on ahead and thinning as the veil lifts on what is in front.
  On the island, what is in front is the island: its flat map is a globe laid
  flat about its middle (`wrap.js`, pure). A ship that has flown at least half
  the way round (48 km, counted) has gone round, and comes out with the
  island's middle straight ahead on its own heading, 9 km off, between 250 and
  900 m up, closing at 1,500 m/s as the veil lifts and settling about 6 km out
  (seen: Mount Gower and Lidgbird ahead over the sea). A shorter hop is where
  it is. Flown or walked the slow way, 48 km from the middle is the far side:
  the body (and its ship) comes back in from the opposite edge going the way it
  was going, the island ahead; that far out nothing of the island is in sight,
  so the turn over is not seen. In the void there is nothing to come to: the
  ship only comes out no higher than 900 m.
  Numbers: in the light the ship itself goes no faster than 1,500 m/s and no
  higher than 60 km, and on the island nothing is ever further than 48 km from
  the middle; the rest of the way is counted and drawn, not travelled.
  **To take the globe out** when a place is a real one (the solar system):
  `view.js` calls `wrap.js` in two places only, `globe()` and `outOfLight()`;
  with those gone, the distance a ship counts in the light is simply how far it
  has gone. `ships.js` LIGHT.c is the one constant.
  Rough: a ship pointed up in the light and brought out is put back down under
  the veil (there is no space to be in yet); Ball's Pyramid, 28 km out, can
  drop out of sight behind a ship as it goes round; the eye's wheel does not
  zoom aboard (the keys do).
- **The thrusters point the way the ship is driven** (done, 21 Nov). What
  drives a ship is what holds it up and what sends it the way asked: `ships.js`
  `s.jet` is the way its exhaust goes for that, in its own frame: straight down
  as it hangs still, back and a little down under way (18 degrees at its own
  speed), astern at its throttle's top and in the light, down and aside as it
  rises or slides, astern in its own frame as it climbs nose up, never upward.
  Its nozzles turn no further from astern than its SWIVEL (the skiff's right
  down, the dart 1.2 rad, the dhow 1.0, the ark 0.75, the carrier 0.6) and
  swing there at 3.5 rad/s, not at once. Drawn (`ships/jets.js`): each engine's
  mount stays where it was, and a smaller ring gimballed in it carries the
  plasma, its glow and its streak (the dhow's eight pods turn together on a
  ring of their own).
  **Under the carrier**, eight thrusters let into its lowest terrace's
  underside hold it up (`s.lift`): at work as it hangs still, their hardest as
  it rises, eased as its speed carries it, least as it sinks.
  Rough: braking or backing, the nozzles do not turn forward (they stay astern,
  dim); the eye, looking up from under the carrier, stands close under its hull.
- **Landing gear** (done, 21 Nov). Every ship has legs (`ships.js` GEAR: three
  under the skiff and the dart, four under the dhow and the ark, eight under
  the carrier; `ships/gear.js` draws a strut, a brace and a foot for each,
  hinged under the hull). `s.gear`: they come down in 1.2 s when it is slow
  (under six tenths of its own speed) and its keel is within a few leg-lengths
  of the water or the ground, and fold back and are put away as it flies off.
  Down, it rides no lower than its feet: sunk onto the ground, it stands on
  them (the skiff's keel 0.45 m up, the carrier's 6 m).
  Rough: the feet do not find uneven ground one by one (the ship stands level
  over what is under its middle); the ark's legs are long stilts from its spine.

### The same day, later: the bar in glyphs, the world in liquid glass

> this bar still needs to be turned into glyphs, and any black/grey background or really background at all should always be liquid glass, transparent material.

(With two pictures: the bar of words on a near-black pill, and the hint "R
boards the carrier" on dark grey.)

- **The bar in glyphs** (done, 21 Nov). Each of its eight words is a glyph
  (`glyphs.js` BAR: survival a heart and creative a spark, drawn as the mode
  it is; the body a bust; build, bots, ships and controls as the sheet draws
  them; the weapons as the one in hand, `take_ring` and the rest; the
  societies as their stars, joined), poured in unimat by the rail's own
  `mount` (`view.js` pourBar: a bright floor and less of the glass let
  through than the sheet's glyphs, so it is silver on a pale sky as on the
  night; poured again only when the glyph changes, let go when the world
  closes). The word stays the button's name (aria-label, with what it does
  as its description) and is said by one tip (`.game-tip`, outside the bar: a
  glass inside a glass can only blur the glass): on hover, on keyboard focus,
  and to a finger, held (the long press says it and does nothing else) or
  tapped (it acts and says it a moment). The tip stands between the bar and
  the bright edge where the page's top band meets its hole, or just inside
  the hole when a list is open; a line it would stand on (a phone's hint is
  under the bar too) gives way for its moment. The bar is 42 px tall, so its
  open list ends above that edge; on a phone the eight stand in one row.
  **Never blank** (`view.js` lookBar): each glyph is looked at (a 12 px copy
  of its canvas; all of them 2, 4 and 6 s after the pour, then one a second),
  and one whose pour shows nothing twice running wears its own drawing until
  the pour is seen again. Why: under software drawing, starved, the whole
  page's metal was once lost and the bar stood empty of words and glyphs.
- **Liquid glass** (begun, 21 Nov): `styles.css` THE WORLD IN LIQUID GLASS,
  one recipe (`--wg-*`): clear, the picture through it blurred, its colour
  lifted and a shade deeper (deeper where a pane carries words, `--wg-see-ink`,
  than where it carries glyphs, `--wg-see`: so a white word reads over a pale
  sky or sand), a rim of light, a lip, a sheen, a soft shadow under it and
  round each word and glyph; where nothing can be blurred (Settings' glass
  off, no backdrop-filter) a smoke of its own (`--wg-fill`). On the bar (the
  void's and the societies'), its lists, the tip, the hint and the foes
  line. Looked at on the machine's own chip over the pale void, dusk, night,
  the island's sky, trunks and grass, with the glass off, and on a phone.
  Rough: how deep the glass is (`--wg-see` 0.8, `--wg-see-ink` 0.56) is a
  matter of taste; the glyphs are quietest over the pale void's mid-blue.
- **The rest in glass** (done, 21 Nov): the same recipe on the lightspeed
  line and the throttle's rail (their rim in the prism's colour), the
  blueprint's panel (its rim blue, amber or red), the thumbs' buttons, the
  health track, a toast in the world tab, and the societies' panes (who is
  near, a voice, a way, the hands, a name tag). The controls sheet is a
  deeper glass (`--wg-see-xl`) behind a thin unblurred veil, its cards glass
  on glass; the picture waits while it is open, so its blur is made once.
  The body sheet stands over a moving picture: it is the real glass only with
  Settings' glass fully on and on a wide screen (measured on the machine's
  own chip: 16.7 ms a frame with it and without), and as it was elsewhere.
  Rough: a phone's body sheet and the map's drawn sea are not glass; the
  societies' panes were changed by rule and looked at only as far as a
  guest's empty world shows them (the bar); the page's own frame and chat bar
  are not the world's and were left.

### The first place on the map: Lord Howe Island (17 November 2026)

Colin: "let's pick a random small island on earth, generate the entire
environment for it ... just the general shape and size and expected fauna of a
small island of your choice -- then add this island under the world settings
as a new tap called 'map". The island chosen is **Lord Howe**, 31.55 S
159.08 E in the Tasman Sea: a crescent, two sheer mountains at its south end,
a coral lagoon in its hollow, found empty in 1788 (so nothing on it needs
taking away to be the clean Earth the brief asks for).

- **Its ground is measured** (`scripts/island/`, `src/game/island/`): the AWS
  Terrain Tiles at zoom 13 (here SRTM, about 30 m apart), read without a
  library and laid on a 16 m grid in the game's frame (x east, z south). It
  comes out a crescent 11.7 km long. Mount Gower reads 851 m (it is 875),
  Mount Lidgbird 689 (777), Malabar Hill 183 (209), Mount Eliza 166 (147): the
  data trims summits. Its land comes to 18.9 km² where the island's own figure
  is 14.55: the data blurs the shore outward.
- **Its sea floor is made by rule**, because the tiles' sea is far too coarse
  to show a lagoon. The lagoon lies inside the island's convex hull, north of
  Mount Lidgbird's foot and within 1.4 km of the shore, shallow sand closed
  by a reef crest. Outside it the floor falls from the land and the reef to the
  shelf, about 45 m down. Mount Gower's cliffs drop into deep water. A low
  shore is drawn smooth (a blurred mask), and cliffs keep their drop.
- **Ball's Pyramid** is not in the tiles (they read 30 m where it stands
  551 m), so it is modelled from its published size, 28 km south-east, faint
  in the haze.
- **The body there**: it stands on the same triangles the ground is drawn
  with, walks up anything gentler than 50 degrees and is held at the foot of
  anything steeper, wades the shallows (rings on the water), and swims in deep
  water with its head out (2.2 m/s, a small kick for a jump). Cliffs are walls
  to run along. The eye keeps out of the hills; bolts stop in the ground.
- **Drawn** (`island/island.js`): the land coloured by what it is (palm
  forest's canopy, grass on the low flats, basalt where it is too steep, moss
  on Gower's top, a beach worked out per pixel from the true height); one sea
  whose colour is its depth (the lagoon's turquoise over its sand, blue to ink
  offshore), surf in thin lines along the reef and the shore, the sky and the
  sun's glitter in it; a sky with a real sun for the three lights; haze over
  the distance.
- **The map tab** (`island/map.js`, `menu.js`): the controls sheet now has
  two tabs, **controls** and **map**. The map offers the void or the island
  and draws Lord Howe from its own coast: its shallows, its peaks named, where
  a body arrives, where the body is now and which way it faces, 2 km to
  measure by, and an arrow toward Ball's Pyramid. Each place keeps its own
  buildings and where the body last stood.
- **What grows and lives there** (`island/life.js`, the numbers; `creatures.js`,
  drawn; each kind one instanced shape):
  - **kentia palms** grow on forest ground round the body, within 170 m. A
    7 m cell's own number decides whether a palm stands in it, so the same
    palm is in the same place every time. A few stand on the grass flats.
    Their crowns sway and their trunks are in a body's way.
  - **sooty terns** wheel in flocks over the sea off the north end, over the
    lagoon and off the south, and a band of them keeps over the body
    wherever it goes.
  - **red-tailed tropicbirds**, white with two red streamers, glide high
    along Gower's and Lidgbird's cliffs, never into them.
  - **woodhens**, found nowhere else, walk the forest floor round the body.
    A body standing still draws them to a few steps off, where they peck;
    a dash scatters them.
  - **green turtles** cruise the lagoon under its surface and come up to
    breathe, ringing the water.
- **Building and fighting there** (`world.js`, the two buildings' drawings,
  `combat.js`): a building put up on the island stands with its way in at the
  ground's height, on stone foundations carried down 1.6 m where the ground
  falls away under it. Where the ground rises behind it more than it can take
  (the house's piers lift it 0.45 m clear; the half-sunk shelter takes 0.55)
  or falls away more than its foundations reach, it is not built, and the game
  says which. Each building keeps its own height. The world takes every point
  into the building's own frame and its answers back out, so the buildings'
  own rules did not change. No palm grows where a building stands. Bots rise
  out of the ground where they are called and hover over whatever is under
  them.
- Not yet: the Lord Howe stick insect (by night); banyans and pandanus; the
  ground is 16 m triangles close up; the lagoon's west edge is a straight
  rule.

### The wall run (17 November 2026)

Colin's third feature of the round, in `body.js` (the rule) and the
buildings' own `wall` (where a wall is: so far the house's, its outer walls
and gables and its room's walls inside).

- **Taking to a wall**: in the air, going at least 3.4 m/s across the
  ground, at least 0.55 m over what it stands on, along a wall or at it
  slantwise (not square at it, not away from it), the hands still pushing,
  with a wall within a hand's breadth of its side at the height of its middle.
  A jump's rise is not carried up the wall.
- **On it**: along it at 7.4 m/s or more (a run is 5.6), held to its face,
  the pull a fifth of the whole, for a second and a half at most. The body
  leans into the wall and its legs run; the eye goes to the shoulder away
  from the wall and stands a metre out from it.
- **Off it**: a jump leaps off (on along it, out from it at 6 m/s, up at 6.4,
  the air's dash given back, held to rise further as any jump is); letting
  go, the wall's end or corner, the time, the ground, the sink key or a dash
  end it. The same wall again (one facing within 60 degrees) waits for the
  ground; another can be run at once, so a body can go from wall to wall.
- Found on the way: a jump beside the house's long sides was thrown 1.8 m
  sideways by the thatch's rule for fliers. The eaves are now a ceiling to a
  head coming up from below (the house's side walls are too low under their
  eaves to run along from outside; its back and front walls and the room
  inside can be).
- Not yet: walls on the island (its cliffs and rocks, next); a wall climb; the
  octopus and the light keep their air pose on a wall (the three on legs run).

### The fight: the ring and the bots (17 November 2026)

The first of the five plasma weapons and the first enemy (`combat.js`, the
numbers; `fight.js`, the drawing). None of it is a blade, and what it fights
are machines, never a presence's people.

- **The ring**: a bronze ring a forearm across, wound with a filament of
  contained plasma, held by the binding rather than by a hand (so every one of
  the five kinds of body wields it). It floats beside the right shoulder.
  Five ways to use it:
  - **cast** (the left mouse button with the pointer held, J, or the pad's RT):
    a tap throws it along the eye's line, or at the bot nearest that line
    (within 17 degrees), bending after it; it passes through what it meets
    and comes back. Pressed again while it is out, it is called home and
    thrown again from the hand.
  - **charged cast**: held, it spins up for up to 0.8 s (the mark at the
    middle of the picture swells and brightens; the body walks); let go, it
    flies at 46 m/s instead of 30, 34 m instead of 22, and strikes for 85
    instead of 34.
  - **whirl** (E, K, or RB): twice round the body at arm's length in 0.42 s;
    everything within 2.9 m is struck once and thrown back.
  - **slam** (the attack in the air, more than 1.1 m up): the body is driven
    down at 22 m/s and a wave of plasma runs out over the water from where it
    lands, 55 at its middle and less toward its edge 6.5 m out.
  - **guard** (the right mouse button, L, or LT, held): the ring grows to a
    shield in front of the body with a membrane of plasma across it. A bolt
    from the front is turned aside; one met within a quarter second of
    raising it (a parry) goes back at whoever sent it, three times as hard.
    With the ring out, the guard calls it home.
- **The bots**: dark glazed spheres in a bronze ring, one eye bulging from the
  front in their level's colour, seams of that colour, as many lights on the
  ring's crown as their level, three bronze fins behind. They come up out of
  the water ahead (twelve at most), keep their distance, circle, keep apart
  from each other, and shoot bolts of plasma, a burst at a time. Five levels,
  each tougher, quicker and surer than the last:

  | level | name | takes | speed | bursts | leads a moving body | slips a cast |
  |---|---|---|---|---|---|---|
  | 1 | drifter | 40 | 2.8 m/s | 1 every 2.8 s | no | never |
  | 2 | scout | 70 | 4.0 | 1 every 2.5 s | a little | 15% |
  | 3 | sentinel | 100 | 5.4 | 2 every 2.3 s | more | 30% |
  | 4 | hunter | 140 | 6.8 | 2 every 1.75 s | nearly | 45% |
  | 5 | warden | 200 | 8.2 | 3 every 1.5 s | fully | 60% |

  Struck, a bot flashes and shows how much it has left; broken, it falls
  apart into the water. A low hover stirs the water under it.
- **Being hurt**: in survival a bolt takes from the body's hundred (the bar at
  the foot of the picture; the edges flush when hit). At nothing the body goes
  over backward and stands again whole after 2.6 s, spared for a moment;
  unhurt for four seconds it mends. In creative nothing hurts it.
- **Called up** from the bar's **bots** list (the five levels; the one chosen
  is kept, and N, or the pad's d-pad right, calls another of it), and cleared
  from the same list. Bolts and the ring stop at walls; the bots stay out of
  them.
- Not yet: sounds; the other four weapons; bots that walk or fly differently
  from these; a bot that knows the
  buildings are there (they go round nothing yet); the bar wraps onto two
  lines on a phone.

### Stage 5 begun: the binding (18 November 2026)

The force, as decided above: "love as what binds: it pulls, holds, joins and
lets go." A power of its own now, beside the ring (`combat.js`, BINDING;
`fight.js` draws it). Only machines: never a presence's people.

- **Pulls**: held (X or H; the pad's LB; a **bind** button on a phone), it
  reaches out along the eye's line to the bot nearest it, within 24 m, and
  draws it in at up to 16 m/s. With nothing near the line, a thread goes out
  and comes back empty.
- **Holds**: while the key is held the bot hangs in the binding up and to the
  left of the head, 4.2 m out where the eye looks (where the eye, over the
  right shoulder, sees it), struggling; it can neither move of itself nor
  shoot. The body walks while it holds, facing where it looks, and the ring is
  still free to strike what it holds.
- **Lets go**: released, the bot is thrown where the eye looks at 28 m/s, a
  little up, and falls. With another bot near the eye's line, the throw goes
  for that one, arced for its fall, and bends after it as it flies (as a cast
  does).
- **Joins**: thrown into another, the two are joined: each is struck 2.2 for
  every metre a second it came at (about 62 from a full throw: a drifter
  breaks), and they tumble together into the water. Thrown down into the water,
  or against a wall, a bot is struck too, less (six tenths of that), and rights
  itself. Struck down while it holds, the body only drops what it held.
- **Drawn**: a thread of warm gold light from the left hand to what it holds,
  waving a little, its pulses running in toward the hand; a halo round the bot
  it holds; a bot it throws spins as it flies; two it joins go up in a flash of
  gold.
- Not yet: the binding on things other than bots (the land, hazards, the
  ships); joining two things it holds at once.

### The bow, the second weapon (18 November 2026)

A recurve of two bronze limbs curving back from a wrapped grip and forward
again at their tips, strung with a filament of plasma, held by the binding as
the ring is (`combat.js` BOW, `fight.js`). **T** (or the bar's **weapons** list,
which shows the five, the three to come greyed) changes the weapon in hand,
the ring called home first if it is out; the one in hand is kept between
visits. Four ways:

- **Loose** (the attack, a tap): an arrow of plasma where the eye looks, at
  52 m/s, striking for 24; at the bot very near the eye's line (within 7
  degrees), where it will be when the arrow gets there. Arrows fall a little
  as they fly; the bow rests a third of a second before it is drawn again.
- **Drawn** (the attack held, then let go): it draws for up to 0.9 s (the mark
  swells; the body walks); the arrow flies at up to 78 m/s and strikes for up
  to 88, and drawn all the way it goes through what it strikes to the next,
  up to three.
- **Volley** (the whirl's key): five arrows at once in a fan, 18 each; a
  little over a second before the next.
- **Drawn in the air**: while the string is back, the binding holds the body
  up; it comes down at no more than 1.6 m/s.
- The guard is the ring's: it comes to it, whichever is in hand. On a phone the
  buttons say **loose** and **volley** while the bow is in hand.
- Drawn: held, it hangs upright beside the right shoulder, its back turned
  outward; drawn, it turns to where the eye looks, canted a little, its string
  pulled back as far as it is drawn, an arrow on it, a glow at the nock. Its
  arrows are long thin streaks of the ring's light.

### The bell, the third weapon (18 November 2026)

A hand bell of bronze with a clapper of plasma, held by the binding (`combat.js`
BELL). Its tone goes out as a ring over the water, the frequencies room's
cymatic rings made a weapon: what hovers in its way as it passes is struck once
(less further off) and pushed out; a wall between stops it.

- **Strike** (the attack, a tap): a ring of its tone out to 9 m, 22 at most.
- **Toll** (held, then let go): as its tone builds for up to a second, the
  water round the body ripples in rings and the body walks; let go, the toll
  goes out to 16 m and strikes up to 70; tolled all the way it stuns: a bot
  struck neither moves of itself nor shoots for two seconds.
- **Peal** (the whirl's key): three quick rings one after another, 14 each.
- **Rung in the air**: the tone goes down and rings out over the water from
  under the body, striking what hovers low (40), not what is up beside it.
- Drawn: it hangs at the right shoulder, mouth down, and shivers as its tone
  builds; struck, it swings; its rings go out over the water, wider and
  fainter, the water ringing under them as they pass. On a phone the buttons
  read **strike** and **peal**.

### The thread, the fourth weapon (18 November 2026)

A spindle of bronze wound with a filament of plasma, held by the binding
(`combat.js` THREAD). The filament pays out from it as a lash, a line of light
drawn out along the eye's way and drawn back in: what it touches as it goes out
is struck once, all of it, not only the first.

- **Lash** (the attack, a tap): out to 9 m where the eye looks (at the bot
  nearest that line, if one is near it) and back in a third of a second, 26 to
  each it touches.
- **Snare** (held, then let go): as the spindle spins up for up to a second the
  body walks; let go, the lash reaches 15 m and strikes 52, and spun all the way
  it winds round the first bot it meets: snared for 2.2 s, it neither moves of
  itself nor shoots, the thread burns it (14 a second), and it is drawn in
  toward the body, to 4 m off. Another weapon taken lets it go.
- **Circle** (the whirl's key): swung round overhead three times in 0.8 s,
  paid out from 2.2 to 7.5 m as it goes: each turn strikes once (16) each bot in
  its sweep, before the body and behind it.
- **A line in the air** (the attack, in the air): out ahead where the eye looks
  to 22 m, it catches on whatever is there (a wall, the land, the water) and
  draws the body to it at 17 m/s while the attack is held, holding it up; let
  go, the body falls. With nothing in reach it goes out and falls back.
- Drawn: the spindle sits at the right shoulder, turning as it spins up and as
  it pays out, its wound filament glowing; the filament is a fine ribbon of
  plasma from the hand to the lash's tip, round overhead in the circle, taut to
  where the line caught, wound round a snared bot. On a phone the buttons read
  **lash** and **circle**.

### The torch, the fifth weapon (18 November 2026)

A haft of bronze with a wrapped grip and a cup at its head; in the cup a flame
of plasma held in a coil (`combat.js` TORCH). What its fire touches burns and is
**heated**; a machine heated all the way **flares**: its core bursts.

- **Ember** (the attack, a tap): thrown in an arc where the eye looks (at the
  bot nearest that line, if one is near it, where it will be). It bursts where
  it lands or strikes: 28 at its heart, less to 3.2 m, and heats what it
  strikes. Near the land or the water it leaves a **fire** there, 2.6 m across,
  for 4 s: what hovers over it burns, 16 a second.
- **Flame** (the attack, held): after a sixth of a second, for as long as it is
  held, a flame streams out 8 m where the eye looks, widening a fifth of a
  metre a metre; what is in it burns, 34 a second at its root and half that at
  its end. A wall cuts it short, and nothing behind the wall burns. The body
  walks while it streams.
- **Wall of fire** (the whirl's key): laid across the eye's way 5 m out, 9 m
  across, burning 4.5 s: what hovers in it burns, 20 a second.
- **Jet** (the attack, in the air): pointed down, held, it bears the body up
  at 2.4 m/s for up to 1.8 s a time in the air (whole again once the body
  stands), and burns what is under it.
- **Heat and the flare**: burning heats a machine (0.75 a second at the
  flame's root, less elsewhere); out of the fire it cools 0.3 a second. At full
  heat it flares: struck 40 itself, and each bot within 4 m struck 22, knocked
  back and heated a third more, so a close group can go up one after another.
  What burns is struck every quarter second with what it burned in it.
- Drawn: the torch sits upright at the right shoulder with a small flame in its
  cup; streaming, it turns along its flame; in the jet, head down. The fire is
  instanced flames, each a soft disc turned to the eye, white at the root, the
  plasma's blue, violet as it goes; on the land they stand taller than wide. Seen
  from behind, a stream is end on, so it billows where it ends and wraps what it
  burns. A heated bot glows as metal does, red, orange, near white, and warm
  flames lick up off it; a flare bursts in warm fire. On a phone the buttons
  read **flame** and **wall**.

### Stage 4: the ships (begun 17 November 2026)

**The skiff**, the first of the five, from its brief: "a one-seat open craft
about five metres long, shaped like a slim reed canoe: a white glazed ceramic
hull with bronze ribs, an open seat behind a low glass windscreen, two small
outrigger fins on thin struts, one glowing plasma ring engine at the stern."

- **Called down** from the bar's **ships** list (the five; the four not yet
  made greyed): it comes down a few steps in front of you, pointing your way,
  hovering a metre over the water. One is put at a time; the list sends it
  away.
- **Boarded** with R (the pad's d-pad left; on a phone, the list's line):
  within three metres of its seat, the body takes the seat and sits, its hips
  low, its knees bent, its hands out on the levers (`gait.js`'s fifth state, so
  every body on two legs sits; the light and the octopus ride as they are).
  R again steps off, to its left side, and the body falls from there to
  whatever is under it.
- **Flown** (`ships.js`): it turns toward where you look, at 2.6 radians a
  second; W drives it along its heading at 24 m/s (shift opens it up to 46),
  and looking up or down as it goes climbs or dives it (the eye's resting tilt
  flies it level); S brakes and backs it; A and D slide it; space lifts it and
  C lowers it. Let be, it slows to a hover where it is. It rides no lower than
  its keel over the water or the ground, and a building or a hill stops it
  (its middle, bow, stern and outrigger tips are tested). It banks into its
  turns and tips as it climbs. The eye stands back further aboard.
- **Drawn** (`ships/skiff.js`): the hull one glazed shell rising to a point
  at bow and stern; seven bronze ribs round it and a bronze rail along each
  gunwale; inside, a deck, the seat, two bronze levers, a ceramic dial and one
  pane of soft light under the raked windscreen; the outriggers' struts and
  fins; at the stern, on a pylon, the bronze ring holding a swirl of plasma
  that brightens and quickens as it is driven, with its glow and a streak of
  light behind. Low and quick over the water, it drags a wake of rings.
- Not yet: a ship kept between visits; walking its
  deck while it sails;
  landing one in the hall's hangar (the skiff fits the mouth); a phone's own
  button to board (the list does it).

**The dart** (17 November, late night), from its brief: "a fast two-seat craft
about eleven metres long, shaped like a spearpoint: a narrow bronze hull with
fine engraved lines, a long clear canopy over two seats in tandem, short swept
wings of pale alloy, two slim plasma engines."

- **Called down beside you** (it is too long to put in front): pointing your
  way, its cockpit at your shoulder. R takes the front seat; the canopy, lifted
  while it waits, shuts over you.
- **Flown** as the skiff is, faster: 42 m/s, 96 opened up, turning a little
  slower (2 radians a second); the eye stands 13 m back. Its wingtips meet what
  is solid as its middle does, and every ship's way is now looked at every
  fifth of a metre, so a quick one cannot pass through a thin wall between two
  frames (at 42 m/s the dart had passed through a house's).
- **Drawn** (`ships/dart.js`): the hull a blade's lozenge in section, widest
  behind its middle and drawn out to the point, engraved with lines along it
  and a chevron toward the point (in its shader), its cockpit open under the
  canopy: a floor, two leather seats one behind the other, a lever, a dial and
  a pane of light; the canopy a long bubble on a bronze rim with an alloy spine,
  hinged at its back; the swept wings, a little lifted at the tips, their
  leading edges bronze; the two slim nacelles by the tail, their nozzles'
  rings, swirls, glows and streaks.

**The dhow** (17 November, near midnight), from its brief: "a cargo ship
about twenty-eight metres long: a wide rounded belly of timber ribs and ceramic
plating, a raised stern cabin with round windows, two tall folding sails of
golden solar foil rigged like a lateen sailing boat, a ring of plasma engines
under the stern."

- **Called down beside you**, its stern alongside. Its helm is high on the
  stern cabin's roof; R from the water beside it takes you up to it (a ship
  may now say how far above its seat a body may be, as well as how far away).
- **Sailed** heavily: it comes up to its 20 m/s over a few seconds (38 opened
  up), turns at 0.8 radians a second, climbs slowly; the eye stands 34 m back
  to see it whole. Its sides, its mastheads, its prow and its stern meet what
  is solid.
- **Drawn** (`ships/dhow.js`): the belly lofted from its sections (wide, the
  prow long and raked, the stern broad on its transom), plated in glazed
  ceramic, a little different plate by plate, between timber ribs every
  1.1 m; a planked deck with crates, amphorae and a coil of rope; the stern
  cabin with eight round windows in bronze (warm at night), a railed roof, the
  helm with its seat, levers, dial and pane of light; two masts with long
  lateen yards and their stays and shrouds; the sails, triangles of golden
  foil drawn with their cells and a belly, folded up along their yards while
  it waits and spreading when someone takes the helm; the ring of eight plasma
  engines under the stern.

**The ark** (18 November, after midnight), from its brief: "an exploring ship
about eighty metres long: a long spine of pale alloy and stone-grey ceramic, a
slowly turning ring habitat round its middle with gardens under glass, a
rounded prow with an observatory dome of brass and glass, four plasma engines
in a cross at the stern."

- **Called down ahead of you**, pointing your way, far enough off to be seen
  whole (its ring's top inside the eye's view from where you stand). It is
  boarded from the water near its stern, from where it was called: R lifts you
  up into the dome on its prow (a ship may now say where it is boarded from,
  apart from its seat). Its ring rides with its foot clear of the water.
- **Flown** as the heaviest of them: 28 m/s (70 opened up), seven seconds to
  come up to speed, turning at half a radian a second; the eye stands
  95 m back. Its ring's rim all round, the dome's top and the engines' outer
  rims meet what is solid.
- **Drawn** (`ships/ark.js`): the spine in bands nine metres long, pale alloy
  and stone-grey ceramic plates; round its middle, on four spokes from a hub
  between two brass collars, the ring, turning once a minute: its outer part
  a ceramic hull with rows of windows (warm at night), the rest glass over a
  garden of grass, flower beds and a path, cypresses and round trees growing
  toward the spine, lamps along the path at night; two radiators behind it,
  their lights red to the left and green to the right; the rounded prow, and
  on it the observatory dome, brass ribs over glass on a brass skirt, with the
  helm inside, a brass telescope on its tripod and a lamp at night; at the
  stern four plasma engines in a cross on their pylons, each a ring with its
  swirl and glow.
- The call-down line is now said whole: the hint near a ship's seat had been
  said over it at once (the dhow's "R takes you up to its helm" was never
  seen).

**The carrier** (18 November, before dawn), from its brief: "a vast carrier
about four hundred metres long, like a floating stepped temple: broad terraces
of pale stone-like ceramic stacked into a long ziggurat, hangar mouths along
its sides with tiny craft beside them for scale, slender towers, two enormous
sails of golden solar foil, a row of large plasma ring engines at the stern."
**Stage 4 is done: the five ships.**

- **Called down far ahead of you**, pointing your way, 450 m off so its
  mastheads are in sight. R from anywhere within a few hundred metres of its
  stern lifts you up to its helm, in an open pavilion at the front of the top
  terrace; the sails come down from their yards.
- **Flown** as the slowest of all: 18 m/s (45 opened up), ten seconds to its
  speed, a fifth of a radian a second; the eye stands 540 m back. It rides
  with its lowest terrace clear of the water; the corners and sides of that
  terrace, its prow, its mastheads and yard-ends, its towers' tops and its
  outer engines meet what is solid.
- **Drawn** (`ships/carrier.js`): five terraces of pale stone-like ceramic,
  laid in courses on their walls and paved on their tops, each set in from
  the one below and narrowing over its last seventy metres to the prow, with
  hedges along their edges; arched hangar mouths along the lowest two
  (eighteen), warm at night, a small craft five metres long beside each of the
  lowest's, for scale; four slender towers with lanterns and bronze caps; two
  masts with yards and booms of bronze and their stays, and two sails of
  golden foil, each some eighty metres across, furled up to their yards while
  it waits; lamps along the top terrace at night; and astern a row of five
  great plasma ring engines on their pylons.
- The ship smoke's own limit went from seven minutes to fifteen for the ship
  scene: five ships, the carrier slow to start and to stop.

### Stage 3: the buildings (begun 17 November 2026)

**The shelter**, the first of the five, from the brief written for it: "a low
round dome about four metres across, half sunk in the ground: a dry-stone
base, walls and roof of smooth rammed earth, a round skylight of clear glass
with a thin bronze rim, one small wooden door, a strip of dark solar cloth
stretched as an awning. Inside: one round room, a woven sleeping mat, a low
stone hearth holding a small steady plasma flame, one shelf with clay jars."
Ancient (dry stone, rammed earth, clay), present (glass, bronze, solar cloth)
and to come (the plasma hearth). It stands on the water rather than sunk in
the ground, because the void has no ground to sink it in.

- **Built where you stand** (`world.js`, `shelter.js`): the build key (B, the
  pad's X, or the bar's **build** button) puts it a few steps in front of the
  body with its door toward it. It goes up in about four seconds: the stones
  laid, the earth rising band by band with its fresh edge pale, then the door,
  the glass, the awning and the room's things one after another. The key again
  near it takes it down. One stands at a time for now.
- **Entered and explored.** Its walls are solid to the body all round but for
  the doorway; inside it stands on a dry floor (no rings on it), the hearth's
  stones are in its way, the dome keeps its head under the roof (a jump
  inside rises until it meets it), and it leaves only by the door. It can
  stand on the dome from above. The body's steps against walls are in
  `body.js` (given `s.world`, every step), so they hold at any frame rate.
- **The eye** comes in rather than go into a wall: a body inside keeps the eye
  in the room with it; where that would bring the eye too near (the body's
  back to a wall), it rises and looks down over it, and if it must still come
  within arm's length the body is not drawn for that moment, rather than the
  eye seeing the inside of it.
- **The light inside** is what gets in: the sun only where its ray leaves the
  room through the skylight or the open doorway (worked out as `sunIn` in
  `shelter.js`, and the same in the drawing's shader), the sky by how near the
  openings a surface is, and the hearth's flame, the room's own light at
  night. A body inside is seen by that light, not by the open sky's. The door
  swings open as a body comes near and shuts behind it.
- **Drawn** (`buildings/shelter.js`): the stone courses and the earth's bands
  are arithmetic in the shader, like everything else in the void; the flame is
  a card turned to the eye with a white core, a blue-violet sheath and slow
  rising tongues; the mat is woven by its shader, over and under.
- Not yet: a building kept between visits
  (stage 6 keeps things); a building's shadow on the water (the void casts no
  shadows); sitting on the mat or lying down.

**The house** (17 November), from its brief: "about six by nine metres on low
stone piers: a timber frame, walls of woven reed and lime plaster, a steep
thatched roof whose ridge is a line of dark glass solar tiles, a covered porch,
one round window. Inside: a main room and a loft, a wooden table and two
stools, a bed with a woven blanket, a ladder, a small ceramic stove with a ring
of light."

- **Built from the bar's list.** The **build** button opens a row of the five
  (the three not yet made greyed, and near a building a line that takes it
  down); the key builds whichever was chosen last. One of each kind stands, and
  one is never put up over another.
- **Walked.** Two stone steps up to the porch (a step each, no jump); the
  platform's sides are too high to step onto. The room is open to the roof but
  for the loft over its back. The walls, the table, the stools, the stove and
  the open door are in the way; under the loft a jump meets its floor; in the
  loft the thatch keeps a head under it, and a rail keeps a body off its edge.
  A body's steps are against boxes (`solids.js`) in the house's own frame.
- **The ladder.** Pushed toward it the body climbs; pushed away it climbs down;
  let alone it hangs; a jump lets go; at the top it steps over onto the loft,
  and from the loft's edge, pushed away, it starts back down (`body.js`, from
  `s.climb`, which the house sets in front of its ladder).
- **The light inside**, as the shelter's: the sun only where its ray leaves by
  the round window, or by the doorway and out under the porch's ceiling
  (`sunLocal`, the same in the numbers and in the shader); the loft shades what
  is under it; the sky by how near a surface is to the door and the window; at
  night the stove's ring, warm, and the round window glowing from outside.
- **Drawn** (`buildings/house.js`): one mesh whose parts say what they are made
  of (plaster over a reed weave, timber, thatch in stems greying toward the
  eaves, stone, glass tiles, planks, glazed ceramic, linen, a striped blanket)
  and when they go up: the piers, the frame, the walls, the thatch from the
  eaves up, then the things one after another.
- Rough edges: climbing, the body holds its jump's pose; in the loft's low
  corners the eye is close and the body is then not drawn.

**The workshop** (17 November, night), from its brief: "about ten by twelve
metres: thick adobe walls, a roof of three fired-brick barrel vaults, a tall
bronze chimney, one whole wall a sliding door of glass in a pale alloy frame.
Inside: a long workbench with hand tools, a ceramic kiln whose mouth glows with
contained plasma, racks of timber and metal bars, a stone floor."

- **Built from the bar's list**, as the others. It goes up in about seven and a
  half seconds: the stone plinth, the adobe walls with the alloy beams and
  their columns, the three vaults one after another (each rising from both its
  springings to its crown), the chimney and the glass, then the things. Taken
  down, it goes the same way backward.
- **Walked.** Two broad steps up to a stone floor half a metre up. The glass
  wall is six panels a metre and a half wide on three tracks: when a body
  comes within four metres they slide aside, two over each end panel, and
  leave six metres open; they close when it walks off. The walls, the glass
  beside the opening, the workbench, the kiln, both racks, the stool and the
  four columns are in the way. The vaults keep a jump under them, and a beam
  stops one under it. Flying, a body stands on the vaults, walks down into the
  valleys between them, and meets the chimney up there. Its adobe is a wall to
  run along (`workshop.js`).
- **The eye** may follow a body's look out through the opening (six metres
  wide, unlike the house's door) and is kept out of the walls, the vaults and
  the glass.
- **The light inside**: the sun only through the glass and the half-rounds
  over the header, and on out under the vaults' front ends (`sunLocal`, the
  same in the numbers and in the shader). A low sun lays a long patch on the
  floor and the side wall, cut by the header's shadow and the vaults' curves,
  and the beams cast their lines. The sky by how near the glass a surface is;
  at night the kiln's violet light, and from outside the glass glows a little
  with it.
- **Drawn** (`buildings/workshop.js`): adobe over faint block courses on a
  stone footing; bricks laid in rings along each vault, their voussoirs at its
  ends; pale alloy beams, columns, header, tracks and the half-rounds' fans of
  mullions; steel tie rods across the vaults' feet with their plates on the
  walls outside; the bronze chimney's joints, collar, rain cap and three stays,
  green where the rain runs down it over the roof; the kiln's celadon glaze,
  crazed, sooty round its mouth; the plasma there a slow swirl, violet at its
  rim and white at its heart. The shapes the three buildings are put together
  from are one module now (`buildings/parts.js`).
- **On the island** it stands where the ground allows, by the house's rule (its
  plinth clears 0.45 m of rise behind). Of 2,060 places on land within 600 m of
  the beach, 933 take it in one of four facings, and 1,189 the house.
- Rough edges: the glass is drawn sliding, but a body may always pass the
  opening (the glass opens within four metres, sooner than a body can run to
  it). Against the back rack and turned to face it, the eye rises over the
  body and looks down.

**The tower** (17 November, night), from its brief: "a slender round tower
about six metres across and twenty-four tall, of pale limestone blocks with
bands of blue-green glazed ceramic, narrow windows spiralling up it, at the top
a dome of brass ribs and clear glass with an armillary instrument inside, and a
small landing ledge. Inside, looking up: a stone stair spiralling along the
wall, wooden landings with a desk and shelves of scrolls and instruments, light
from the dome."

- **The stair** (`tower.js`): a hundred stone steps in two and a half turns
  round the wall, from beside the door to a gallery 20 m up under the dome.
  Its walking surface is a smooth ramp through the middle of each tread, so a
  body climbs without a jolt at every step (running, the climb takes about
  five and a half seconds). A brass rail on its inner edge keeps a body on it;
  inside that edge the well is open from the floor to the dome. Worked round
  the axis: the shaft, the stair's turns at a body's angle (stood on, a
  ceiling from below, or a wall where its low first steps are), the rails, the
  landings, the gallery, the dome.
- **The landings**, a turn apart, both fill the well's front half, so looking
  up from the floor the back half is open to the dome. Beside each, the stair's
  rail opens where the stair is level with it; elsewhere rails keep a body on
  it. On the first, a desk with a page open and a lamp: a small plasma in a
  glass globe, the tower's light at night. On the second, a shelf of scrolls
  with a small glazed globe on top.
- **The top**: the gallery round the well (but over the stair's last steps),
  its rail, a brass telescope on a tripod looking out and up through the
  glass. The dome: twelve brass ribs, two rings, clear glass, a finial. The
  armillary sphere hangs in it over the well, its equator, ecliptic and
  colures turning once in two minutes about a pole set 31.5 degrees up, Lord
  Howe's latitude. A door from the gallery opens through the dome onto the
  stone ledge, on three corbels, with brass rails at its sides and its front
  open: step off it and you fall.
- **The eye**: inside, it is kept inside (the door is narrow, as the house's
  is), and it no longer goes below the floor a body stands on in any
  building: looking up, it used to sink into the floor's stone.
- **The light inside**: the sun through the narrow windows (nineteen, one over
  every five steps), the door, the ledge's door, and down through the dome,
  with the landings, the gallery and the stair in its way (`sunLocal`, the
  same in the numbers and in the shader); the sky brighter toward the dome.
- **Outside** its round wall is a wall to run along. On the island it stands
  where the ground allows (it takes 0.25 m of rise behind): 1,414 of the
  2,060 places on land near the beach.
- Rough edges: the interior is dim below the dome, as stone towers are; the
  stair's ramp is up to a tenth of a metre off the drawn treads, so the feet
  float or sink that much; the eye, kept inside a shaft five metres across, is
  close to the body.

**The hall** (17 November, night), from its brief: "a great hall on a stepped
platform: three broad terraces of pale limestone planted with low gardens,
wide stairs up the middle, on top a long hall about thirty by forty metres with
tall laminated-timber arches, a band of clear glass under a roof of dark solar
tiles, and in the lowest terrace a wide arched hangar mouth. Inside: a vast
long room under the timber arches, a long wooden table, a central stone hearth
with a steady plasma flame, stone columns, woven hangings."

- **The terraces** (`hall.js`): the lowest is the tallest (4.6 m), and holds
  the hangar; the two above are 1.2 m each, the hall's floor 7 m up. Garden
  beds run along every terrace's edge, planted with low shrubs (rosemary and
  lavender greys and greens, some in flower) that grow in last.
- **The stairs**: two flights of twenty steps climb the lowest terrace either
  side of the hangar's mouth; from its top the stairs go up the middle of the
  two above, five steps each, to the forecourt and the hall's door. The beds
  stop where the stairs come and go.
- **The hangar**: a vaulted room 22 m wide and 32 deep inside the lowest
  terrace, its mouth an 18 m arch in the middle of the front, lamps along its
  vault; the sun gets in only by the mouth. It is empty: it waits for the
  ships (stage 4).
- **The hall**: 30 by 40 m. Stone walls to 4.5 m, then a band of clear glass
  2 m tall along both sides in pale alloy frames, under eaves of dark solar
  tiles; the gables solid stone, the front one with a great door of two
  leaves that swing in as you come. Inside, seven pairs of stone columns carry
  seven laminated-timber arches (their lamellae drawn) up to the roof, with
  purlins and a ridge beam between them; woven hangings in madder, indigo and
  ochre hang on the walls between the columns; the long table and its two
  benches toward the back; the round stone hearth in the middle, its pool of
  plasma white and its flame violet, the hall's light at night. It is big
  enough that a body inside keeps the eye inside with it.
- **On the island** it needs broad flat ground, or the shallows: just west of
  where you arrive, facing the lagoon, it stands with its lowest terrace in
  the water (203 places within 900 m of the beach take it).
- Rough edges: the hangar is empty; the flame is three glows, not a shaped
  flame; on the island, standing in the shallows, the water may come into the
  hangar's mouth.

### Stage 1: the void

- **The place** (`src/game/void.js`). An endless void under one inch of still
  water. The sky is a function of direction. The water mirrors it, and mirrors
  whatever stands in it the true way: drawn again from the eye's own
  reflection under the surface. The water is still. What moves on it is what a
  body does to it: each footfall, landing and dash drops a ring, and a ring
  travels at the speed one inch of water gives it, √(g·d) = 0.499 m/s. An inch
  down, the floor carries a faint six-sided lattice, so there is a way to tell
  how far you have come. Three lights: pale, dusk, night. There is no edge:
  far out, the numbers begin again without a seam.
- **The body** (`body.js`). Walk 1.7 m/s, run 5.6, sprint 8.6. In **survival**:
  a tap jumps 1.5 m; held, 3.0 m; a dash of 6.24 m any way, and one more in the
  air. In **creative**: all of that, and flight (14 m/s, 48 sprinting) from the
  fly key or a second jump in the air. 120 steps a second, the same arc at any
  frame rate.
- **The stride** (`gait.js`). Legs are placed from where the feet should be.
  A foot on the floor stays where it was put and the body goes on over it, so
  a foot meets the water where its ring begins and nothing skates. Stage 1
  had one figure, a hooded traveller; the five bodies of stage 2 took its
  place.
- **The hands** (`input.js`, `menu.js`). A keyboard and mouse, a controller, or
  a thumb on glass: each is heard as the same fourteen actions. The
  **controls** button (or M, Esc, a controller's menu button) opens a sheet:
  the mode, the light, every action with its two keys and its controller
  button (press a box, then the new key), how fast the eye turns, and back to
  the defaults. What is chosen is kept on the device.
- **The door** (`gate.js`, `state.js`). The world tab opens on the void. "the
  societies" goes to the planet that was there before; "the void" comes back.
  Where the void cannot be drawn, the tab says so and opens the societies.

The controls as they begin:

| | keys and mouse | controller |
|---|---|---|
| move | W A S D, or the arrows | left stick |
| look | the mouse (click to hold it, or drag) | right stick |
| jump; held, higher | space | A |
| dash | Q, or the right mouse button | B |
| sprint | shift | L3 |
| walk | V | the stick, part way |
| fly (creative) | F, or jump again in the air | Y |
| sink, and land | C | R3 |
| board a ship; aboard, step off | R | d-pad ← |
| survival or creative | G | view |
| the eye nearer, farther | = and −, or the wheel | d-pad ↑ ↓ |
| controls | M, or Esc | menu |

On a phone: the left of the glass is the stick, the right looks, and there are
buttons for jump, dash and (flying) sink.

### Stage 2: the five bodies

"5 different types of customizable characters -- 5 is our magic number for
now." Five kinds, five choices each, five options a choice: 5 × 5⁵ = 15,625
bodies (`kinds.js`). None is a model file. Each is drawn by arithmetic
(`shape.js`, `bodies/`), as sharp as the screen.

| kind | its five choices, and the five options of each |
|---|---|
| **human**: wool, plate and a woven belt | **hair** crop, tail, braid, curls, shaved · **build** even, slight, lean, broad, heavy · **clothing** coat, cloak, wrap, suit, jacket · **skin** sand, ochre, sienna, umber, pearl · **dye** rust, indigo, moss, bone, charcoal |
| **robot**: bronze and white ceramic, engraved | **head** ring, visor, lens, crest, dome · **frame** even, slender, compact, heavy, tall · **finish** bronze, verdigris, iron, alloy, brass · **cloth** wrap, sash, tabard, mantle, bare · **light** amber, cyan, green, violet, rose |
| **mantis**: tall, jade, patient | **antennae** arcs, whips, plumes, curls, horns · **shell** jade, orchid, leaf, ghost, night · **wings** folded, short, fan, leaf, none · **build** slender, stick, shield, small, great · **wear** sash, bands, wrap, beads, bare |
| **octopus**: eight arms and a collar of glass | **mantle** dome, round, point, fins, crown · **skin** teal, coral, violet, sand, ink · **marks** spots, rings, bands, stars, plain · **arms** standing, curled, long, stout, webbed · **collar** glass, woven, shells, torque, bare |
| **light**: the orb's own kin | **core** sphere, ring, heart, knot, helix · **veil** shroud, ribbons, wings, pillar, halo · **colour** stardust, aurora, ember, frost, verdant · **mood** calm, thinking, listening, excited, tender · **wake** still, motes, thread, rings, echo |

The first option of every choice is the body as it was first drawn.

- **The body sheet** (`chooser.js`; the **body** button in the bar). Five
  pictures, one for each kind, and five rows of five. It does not cover what
  it is about: the body turns to face you and stands in what the sheet leaves
  of the room (beside it on a desk, over it on a phone), and is made again as
  you choose. Tab goes from row to row; the arrow keys go along a row and
  choose as they go. "turn" turns the body where it stands, "surprise me"
  draws a look by chance, and "as it came" puts the kind back as it was first
  drawn. Each kind keeps the look it was last given, on the device.
- **Each moves in its own way, on the same rules.** `body.js` does not know
  which body it is: the speeds, the jump, the dash and flight are the same
  for all five.
  - The **human** strides (`bodies/biped.js`). Its coat, its cloak and hair
    that hangs are loose, and swing.
  - The **robot** is on the same legs with a stiffer carriage: its arms swing
    less, its hips bounce less, and it stands straighter.
  - The **mantis** has long legs whose knees bend backward, two taking arms
    held up and folded, two small hands below them, wings that lie down its
    back and open when it leaves the ground, and antennae that lean with its
    speed.
  - The **octopus** is on no legs. It stands on six of its arms and crawls on
    them, three tips always on the floor (`crawl.js`). Faster than a crawl
    can carry it, it lets go of the floor and jets, mantle first, its arms
    streaming behind.
  - The **light** does not stand. It hangs a hand's width over the water and
    goes by leaning the way it means to go. It is seen by its own light, and
    what is behind it shows through. It does not touch the water, so the
    water does not ring under it, unless rings are its wake.
- **Ancient, present and to come, in each.** The human: a cloak and a wrap;
  a jacket and a scarf; a close suit under ceramic, with seams that glow. The
  robot: plates cut with circles and ticks, and a length of linen; its
  joints; a face that is one pale oval with a rim of light. The mantis: a
  woven sash; bands of alloy; a people who are not us. The octopus: the
  animal; brass; glass worn in the air by one of the sea. The light: a veiled
  figure; the cut of the veil; a body with nothing in it but light.
- **Cloth** (`shape.js`, `drape.js`). A coat's skirt, a cloak and a veil are
  sheets of points that fall, trail in still air, and are pushed out of the
  limbs under them. A garment says which way is out, so a skirt lies over a
  lifted knee and never under it (see the notes).

### Measured

13 November 2026, an M2 MacBook Air, Chromium drawing on the Mac's own chip
(`scripts/void-smoke.mjs`, the three scenes, no errors):

- A tap of 50 ms rose 1.68 m (the least a tap can give is 1.5 m); held, 3.00 m,
  from the keys, a controller's A and the phone's button alike.
- Sprint 8.6 m/s. A dash covers more than 6 m. Flight 47 m/s.
- A frame takes 16.7 ms (sixty a second) at 1280 × 800. On a phone-sized
  canvas, 390 × 844 at two pixels a point: median 16.7 ms; 95th percentile
  16.8 on a quiet machine and 18.1 beside a heavy job; the same with the
  controls sheet open over it (16.7 and 18.0).
- With no chip at all (software drawing) every check still passes and no
  shader fails.

The same day, the two engines this Mac has browsers for, as Playwright
builds them, headless:

- **Firefox 157**: the desk and the controller scenes, every check, no
  errors. A frame takes 16.7 ms at 1280 × 800 by direct measure, 7 ms of it
  the page's script and 3 ms the drawing.
- **WebKit 27.2** (Safari's engine): the desk and the controller scenes, no
  errors, 17 to 18 ms a frame. Every check but the held pointer: a headless
  WebKit refuses to hold it, and the drag looks instead, which is what the
  game does wherever the pointer cannot be held.

14 November 2026, the same Mac and browser, `void-smoke.mjs bodies gpu`: the
five kinds worn in turn and each of the 125 options put on once, by the
mouse and the arrow keys at 1280 × 800 and by touch at 390 × 844; each kind
walked, run and jumped. No errors. With each of the five kinds running at
1280 × 800, a frame takes 16.7 ms (the median of the page's own frames), and
16.8 at the 95th percentile and at worst. The three scenes of stage 1 were
run again with the new human in them, no errors: on the phone-sized canvas
at two pixels a point, 16.7 ms, and 16.8 at worst.

The same day, once, outside the suite: each of the 125 options was drawn
beside the body as it came, from the front and from behind, and the pixels
that differ were counted (the same body drawn twice differs by none). Every
option changes the picture. Two of the light's wakes, rings and echo, change
it only when the light moves, which is what a wake is. The faintest are the
light's cores (15 to 64 pixels of 72,000, and only from the front: the
shroud hides them from behind) and the octopus's marks (36 to 118).

Also once, outside the suite: a body is made again at every choice, so 150
bodies of the five kinds were made, run, drawn and put down one after
another. The drawing kept what it held after the first 25 (13 shapes, 13
pictures, 6 shader programs: the void's own and the tiles the bodies share),
and the page's memory, read after its collector had run, stayed between 7.3
and 7.8 megabytes. Changing bodies leaks nothing.

And the five bodies as they came were drawn standing and running under dusk
and night, and on the low-detail tier under the pale light and at night. All
five read in each. At night the human and the mantis are dim, and the
robot's bronze goes nearly black: its ceramic and its rim of light carry it.

**Not looked at:** Safari itself and Firefox itself, with a real mouse and
the pointer held; a real phone; a real controller (the smoke's is made up,
answering for `navigator.getGamepads`). The five bodies in Firefox and
WebKit. Under dusk and night and on the low-detail tier, any look but the
first.

17 November 2026, the same Mac (`void-smoke.mjs fine gpu`): the void at the
screen's own pixels, 2560 × 1600 at two a point with its edges smoothed, a
steady 16.7 ms a frame. A page slowed sixty-fold with its own work (frames of
50 ms) and a browser held to thirty a second (33 ms) each had fewer pixels
tried once, for two seconds, given back, and kept the sharp picture (a first
rule, which timed a read-back of one pixel, measured 8 to 10 ms there
whatever the drawing cost, and turned the void down for nothing). The bronze
and skin tiles are now 512 pixels, from the same pictures (`art/v2/`). The
octopus's arms end in points, turned toward their own side
("the octopus is pretty close besides the cut off tentacle arms").

17 November 2026, later: the human with MakeHuman's face, hands and hair
(`void-smoke.mjs bodies gpu`: the five kinds worn, the 125 options put on,
each kind walked; 46 checks, no errors). Looked at by eye in each hair style,
from the front, the three-quarter and the side.

### Rough edges, known

- The human (its face, hands and short hair MakeHuman's since 17 Nov): its
  neck is a little long for its collar, and its face one neutral face for all
  five skins; the heavy build's jacket has puffed shoulders; in a dash the wrap's skirt streams
  behind; a braid under a cloak hangs between the back and the cloak.
- The robot's iron is dark plate on dark plate, and its rim of light is a
  white fringe against the pale sky. The mantis's fan wings hide its legs
  from behind. The octopus's marks are faint, and its fins read as round
  ears.
- The light is at its faintest on the pale sky, and from behind its core is
  hidden by the shroud.
- Nothing points a first visitor to the body button.
- There is nothing to do yet but move. Stage 6 gives survival its reason.
- No full-screen button yet. The standing hint is long.

## What is next

Each stage ends the way the first two did: playable, looked at in a browser,
tested, shipped.

This round (Colin, 17 November): **wall running** (done); **the first map**,
Lord Howe Island, under a new **map** tab, with its palms and animals (done).
Then the buildings again: **the workshop**, **the tower** and **the hall**
(done, the same night: stage 3 is done); the stick insect by night; and more
of Earth from the same tiles.

3. **The five buildings**: a shelter, a house, a workshop, a tower, a hall.
   Different in design and size, built where you stand, entered, walked
   through, furnished a little. Ancient, present and to come in each. **All
   five are built** (above).
4. **The five ships**: a skiff, a dart, a dhow, an ark, a carrier. From one
   seat to a carrier. Boarded and flown in the void, so they are ready when
   there is somewhere to go. **All five are built** (above): stage 4 is
   done.
5. **The binding and the five plasma weapons** (a thread, a bow, a ring, a
   bell, a torch: none of them a blade), with things for them to act on:
   machines, hazards, the land. Never a presence's people. **The binding is
   begun** (above: pulls, holds, lets go, joins, on the bots); **all five
   weapons are made** (the torch last, 18 November). Left in this stage: the
   binding on things other than bots (the land, hazards), and hazards to act on.
6. **What survival is for**: things to find, make and keep. Full screen. A
   download.
7. **The physical universe.** Earth from NASA's data, clean, with only what
   stood thousands of years ago; the solar system at its true size; light
   speed at the speed of light, in real time, with the universe held still and
   the glow.

Owed from stage 2, small: a run that draws every option and counts what
changes, so that "no choice does nothing" is held by a run and not by one
measurement. (The other, something that points a first visitor to the body
button, is done, 18 November: until the body sheet has been opened once, its
button breathes a pale light, and a few seconds in a line says "five kinds of
body, and this is one · the body button makes it yours".)

## How it is built

`src/game/`, plain modules like the rest of the site, three.js for drawing.
The modules that decide anything have no page and no three in them, so the
suite runs them; those that draw are read as text and looked at.

| file | what it is |
|---|---|
| `body.js` | how a body moves: the jump, the dash, flight, the fixed step |
| `input.js` | the hands: keys, mouse, controller, touch, as twenty-two actions; the bindings and their keeping (an action added later gives way to a key already kept for another) |
| `rings.js` | a ring on the water as a function; the pool of drops; the floor's lattice and the rebase |
| `gait.js` | how a body on two legs carries itself: the stride with its feet planted, the two-bone leg, landings, sitting in a ship; told a build (the mantis's long legs, the robot's stiffness) |
| `ships.js` | the ships as numbers: the five offered, each made kind's measures; put, flown under the hands (their way looked at for walls every fifth of a metre), boarded and stepped off |
| `ships/` | `skiff.js`, `dart.js`, `dhow.js`: the three drawn (draws) |
| `crawl.js` | how a body on many arms carries itself: six tips, three always on the floor |
| `kinds.js` | the five kinds: their choices, options and colours; a look made fresh, cleaned, or drawn by chance |
| `chooser.js` | the body sheet: its rows, its keys, and where the body stands beside it |
| `drape.js` | how a point of cloth leaves a limb it has got into |
| `state.js`, `gate.js` | what is kept between visits; the door between the void and the societies |
| `lights.js` | pale, dusk, night |
| `solar/` | the solar system as numbers ([`SOLAR.md`](SOLAR.md)): the clockwork (`ephemeris.js` and its tables); `clock.js`, the world's clock; `air.js`, the air and the eye's exposure; `daylight.js`, what the Sun and the air give a place at an instant |
| `sky.js` | the true sky drawn (asked for with `?sky=true`): the air's tables on the GPU, the dome and the Sun's disc, the air between the eye and every material, the lights, the exposure (draws) |
| `shelter.js` | the shelter as numbers: its shell, what of it is solid, where a body may go and stand, where the eye may stand, where the sun gets in, how it goes up |
| `world.js` | what stands in the void: the buildings, the build key, and what they ask of the body, the eye and the light |
| `plinth.js` | ground made fit to build on, as numbers: each kind's pad, a levelling (the ground eased to a level round it) and a platform (a slab and its steps), how each grows and goes |
| `blueprint.js` | a building before it is built: its own drawing as gridded light where it would go, its pad on the ground, coloured by what may be done (draws) |
| `glyphs.js` | a drawing for every control (poured in unimat on the controls sheet), and the sheet's groups |
| `house.js` | the house as numbers: its solids, the room's and the porch's air, the ladder, the eye, the sun through its window and door, how it goes up |
| `workshop.js` | the workshop as numbers: its vaults, solids and airs, the glass that opens as a body comes, standing on the vaults, the eye, the sun through the glass, how it goes up and comes down |
| `tower.js` | the tower as numbers: worked round its axis; the stair's ramp, its turns and rails, the landings, the gallery and the ledge, the dome, the eye, the sun through its windows and dome, how it goes up and comes down |
| `hall.js` | the hall as numbers: the terraces, stairs and beds, the hangar and its arched mouth, the hall's walls, roof, columns and things, the eye, the sun through its glass band, door and mouth, how it goes up and comes down |
| `solids.js` | a body (an upright cylinder) against boxes: floors, ceilings, walls; a ray out of a box |
| `combat.js` | the fight as numbers: the ring's five ways, the bow's four, the bell's four, the weapons and changing them, the binding (pulls, holds, lets go, joins), the bots' five levels and their minds, bolts, the body hurt and mended; swept tests in sixtieths of a second |
| `fight.js` | the ring, its trail and shield, the bow, its string and arrows, the bell and its rings, the binding's thread and halo, the bots, bolts, sparks, debris and the slam's wave (draws) |
| `island/ground.js` | the island's ground as numbers: the file read, the height on the drawn triangles, slopes, water, cliffs, the eye's line |
| `island/island.js` | Lord Howe drawn: sky and sun, the land, the sea by its depth, haze; it stands where the void stands (draws) |
| `island/map.js` | the island as an SVG for the map tab |
| `island/life.js` | what grows and lives there as numbers: the palms by cell, the terns and tropicbirds by time, the woodhens and turtles stepped |
| `island/creatures.js` | the palms, terns, tropicbirds, woodhens and turtles drawn, one instanced shape each (draws) |
| `island/lordhowe.bin`, `lordhowe-shape.js` | made by `scripts/island/lordhowe-build.mjs` from the elevation tiles: the heights (300 KB), the coast, shallows, peaks, arrival |
| `buildings/` | `shelter.js`, `house.js`, `workshop.js`, `tower.js`, `hall.js`: the five drawn; `plinth.js`, a platform under one; `parts.js`, the shapes they are put together from (draws) |
| `menu.js` | the controls sheet |
| `void.js` | the sky, the water, the mirror, the motes (draws) |
| `shape.js` | what the bodies are made with: a skin through sections, a tube on a moving line, cloth, the kit that gathers them; the surfaces (draws) |
| `bodies/` | `biped.js`, the bones of a body on two legs; `human.js`, `robot.js`, `mantis.js`, `octopus.js`, `light.js`; `common.js`, what all five share (draws) |
| `figure.js` | one of the five, made as the person chose it, and the few things every body answers to |
| `art/v2/` | eleven small pictures: the five the kinds were drawn from, and six grey seamless surfaces (bronze and skin at 512 pixels since 17 Nov) |
| `view.js` | the frame: hands, eye, body, rings, figure, mirror, picture (draws) |

Fixed in the code, so nobody has to find them again:

- The floor is y = 0 and the water's surface is y = 0.0254 (one inch).
- At yaw 0 the eye looks along −Z; a positive yaw turns it left; a positive
  pitch looks up. `move` is [right, forward].
- A body's front is +Z (its yaw is `atan2(x, z)`), its left is +X, and it
  begins with its back to the eye (yaw π).
- The game's canvas is the whole window, and the site's frame stands over
  it. What is seen is the room (`.game-room`). Anything placed by eye is
  placed in the room, not in the canvas.
- A press (jump, dash, fly) is kept until a step runs, so a frame shorter
  than a step cannot swallow it.
- `Y3K.game.read()` in the page answers where the body is and what it is
  doing, which kind it is and how it looks, and whether it is posing for the
  sheet. The smoke reads the game through it.

## How it is looked at

- `node test/game.test.mjs` (in `npm test`), 109 checks (the house's seven since 17 Nov afternoon too) (the shelter's seven
  since 17 Nov: its shape, where it is built and taken down, walked into and
  out of, its walls from outside, the eye, the sun inside, the build key): the jump's two
  heights, the dash in eight directions, flight's rules, the bindings, the
  controller, the page's keys, the rings, the legs (on three builds, each
  read from its body's own file), the six-armed crawl, the five kinds and
  that every option is named in the body that draws it, a cloth and the limb
  under it, the body sheet's keys and where the body stands, the door, and
  this file's quotes.
- `node scripts/void-smoke.mjs <desk|pad|phone|bodies|build> [small] [gpu]
  [firefox|webkit]`: a real browser against a throwaway server. `build` puts
  the shelter up with the key, walks into it, is held by its far wall, turns
  the eye inside, goes to night, walks out backward through the doorway and
  takes it down, measuring frames inside and out. It walks the
  body through all of it, takes pictures, measures frames, and fails on any
  console error. `bodies` (run with `gpu`) opens the sheet, wears the five
  kinds in turn, puts each of the 125 options on once, scrolls each kind's
  rows to their end and asks whether the way out is still under the finger,
  then walks, runs and jumps each kind; `small` does it at a phone's size, by
  touch. **Look at the pictures**: no check sees a white coin in the sky, or
  a knee through a skirt.
- The test was tried against the code broken on purpose: 110 small breakages
  in `body.js`, `input.js`, `rings.js`, `gait.js`, `gate.js` and `state.js`,
  one at a time. It fails for 108. The other two change nothing that can be
  seen (a rise ended twice over; a lattice period one row longer). The first
  run let nineteen more through: each is held by a check now. Stage 2's
  deciding modules the same way: 19 breakages of `crawl.js` and 34 of
  `drape.js`, all caught; 43 of `chooser.js`, 41 caught, and the other two
  remove a guard that another line already makes.

## Notes kept along the way

- Space did nothing after the tab opened, until the canvas took the focus as
  it opens.
- The first figure faced the eye. It begins with its back to it now.
- On a phone at two pixels a point, a mote near the eye drew as a white coin.
  A mote is never wider than 3.2 points.
- A frosted sheet over a moving canvas is redrawn every frame. A void that is
  waiting stops drawing after four frames.
- The game's own smoothed frame time lies for a second after a screenshot.
  Frame times are measured from the page's own frames.
- The page's own mark sat at the figure's feet; `body.in-void` puts it away.
- WebKit told a script's drag that the pointer had moved 0 px. A drag with
  the pointer not held is measured by where the pointer went, in every
  engine.
- Under Firefox's hold a script's mouse reads as running sums from the middle
  of the window, where a real mouse is put back after each move and a
  script's is not. The game did what the events said. The smoke refuses the
  hold for its drags in Firefox and WebKit. A real mouse held by Firefox has
  not been tried.
- Playwright's Firefox and WebKit start only with a throwaway home folder,
  which also keeps them away from the person's own browser.

From stage 2:

- A body placed in the middle of what the sheet left of the canvas stood
  under the site's frame. It is placed in the room that is seen.
- A knee came through a closed skirt in a run. A point of cloth inside a limb
  was put out by the nearest way, and the nearest way out of a lifted thigh
  is under it. A stiffer skirt did not help. Now a garment says which way is
  out, and a point that fell on the inner side is turned across to the outer
  (`drape.js`). The limbs that cloth feels are also a little fatter than the
  limbs drawn, because a cloth is flat between its points and cuts corners.
- On a phone the body sheet's title and its X scrolled away with its rows.
  Its head stays now, and only the rows scroll.
- On a phone the bar's four words wrapped to two lines, the thumbs stood on
  the sheet, and the page's own bar read through it. Each is put right.
- A plate over the knee read as a white egg, twice. It is a plate laid on
  the shin's own surface now, from the knee to the boot.
- The light's five cores could not be told apart until they were white-hot
  inside their own glow.
- The stride's test carried its own copy of the mantis's legs, and the copy
  was old. It reads the builds from the bodies' files now.

## Higgsfield

Colin's rule is above: don't spend real money. None has been spent.

Higgsfield makes pictures, video and sound, and 3D models through its command
line. It has two doors: a connector inside a Claude chat, and the command
line, which spends credits. Only the first has been used.

**Stage 2 used it for pictures**: nineteen, made from one brief written here.
One character for each of the five kinds, the five together, a turnaround of
each, and eight surfaces (bronze, glazed ceramic, linen, wool, chitin,
cephalopod skin, limestone, alloy). What the game took from them:

- **The five bodies were drawn from the five characters**, by eye, in
  arithmetic. No picture is on a body.
- **Five cards** in the body sheet (300 × 400; three to seven kilobytes
  each).
- **Six surfaces**: small grey seamless tiles (wool, linen, bronze, glaze,
  skin, engraved; fifteen to forty-two kilobytes each). A tile has no colour
  of its own. The colour is the person's choice, and the tile gives it a
  weave, a grain or a cut.

All eleven are in `src/game/art/v2/`, 293 kilobytes together (the bronze and the skin made again at 512 pixels on 17 November, from the same pictures). The pictures
they were made from are kept outside the repository.

A 3D model, music and sound cannot be had from it without spending, so the
bodies are arithmetic, and sound, when it comes, will be made in the browser.
The one exception came from elsewhere, free: the human's face, hands and hair
are MakeHuman's base mesh and default skeleton (released CC0 1.0 by their
makers in September 2020), a neutral adult, shaped and posed by
`scripts/kin/mh_build.py` into numbers (`src/game/bodies/kin.js`, 355
kilobytes).
Two more briefs are written and not yet run: the buildings, ships and
weapons, and more surfaces. Whatever goes into the game is kept small and
written down here, with what made it.

## The universe, put by

For stage 7, already in hand and kept outside the repository until then:

- **Earth.** Heights from NOAA's ETOPO5 and colour from NASA's Blue Marble
  (July 2004), fetched and packed into a 6.9 MB height grid and an 11.4 MB
  colour picture.
- **The plan.** The planets from JPL's Keplerian elements and the Moon from
  Meeus; a floating origin and a logarithmic depth, so a metre and an
  astronomical unit fit in one picture; the ground as a cube of quadtrees
  wrapped on a sphere; a light-speed trip as a record of two clock times.

**21 November 2026: begun.** The solar system has a working memory of its own now, [`SOLAR.md`](SOLAR.md): Colin's words for it, the plan (depth first), and its first brick, the clockwork in `src/game/solar/`: where every body is and how it is turned for any date, and the sky as it is seen from the island, measured against JPL (the plan above said Keplerian elements and Meeus; what was built is closer than that, and SOLAR.md says by how much). **22 November 2026:** the first thing drawn from it, the true sky over the island (the air and the Sun; "Where it stands", above), behind `?sky=true` until the night and the Moon are made.
