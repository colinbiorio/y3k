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
| "make up 5 different plasma weapons" | **one of five** (17 Nov): **the ring**, five ways to use it (cast, charged cast, whirl, slam, guard and parry). The thread, the bow, the bell and the torch to come. |
| "a plasma weapon generated with several ways to attack with it" (17 Nov) | **done**: the ring, above. |
| "a bot enemy that we can spawn in at varying difficulty" (17 Nov) | **done**: five levels (drifter, scout, sentinel, hunter, warden), called from the bar's **bots** list or N. |
| "wall run" (17 Nov) | **done**: along any wall that stands (the house's, for now); the island's cliffs next. |
| "a small island ... under the world settings as a new tap called 'map'" (17 Nov) | **done**: Lord Howe Island, chosen from the controls sheet's **map** tab, with its palms, woodhens, terns, tropicbirds and turtles. |
| "a mix between ancient/natural, current, and futuristic" | each of the five bodies wears all three (below). Every building and ship must. |
| "characters should be able to fly, but only in 'creative' mode" | **done.** |
| "tap to jump or hold to jump higher -- allowing the character to defy gravity by 2x, but still be affected" | **done.** A tap rises 1.5 m; held, 3.0 m. The pull is halved while rising with the key down, and whole on the way down. |
| "omnidirectional dash options" | **done.** 6.24 m any way the hands point; once more in the air. |
| "a light speed fast travel option and simulate the actual speed of light" | stage 7, with the frozen universe and the glow. |
| "rendered with a combination of Higgsfield plugin and whatever 3d rendering system works best" | three.js draws everything. Higgsfield made the pictures the five bodies were drawn from and the surfaces they wear (see Higgsfield, below). |

## Where it stands

**Stages 1 and 2 are built**: the void (13 November 2026) and the five bodies
(14 November). Open the world tab and you are standing in it. Press **body**
and choose who you are there. **Stage 3 is begun** (17 November): press
**build** (or B) and a shelter goes up in front of you; all five (the shelter,
the house, the workshop, the tower, the hall) are in the bar's build list. **The first weapon and
something to fight** came forward at Colin's word the same day: press **bots**,
call one up, and throw the ring at it.

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
  ships); joining two things it holds at once; the four weapons to come.

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
   begun** (above: pulls, holds, lets go, joins, on the bots); the ring is the
   first weapon; the thread, the bow, the bell and the torch next.
6. **What survival is for**: things to find, make and keep. Full screen. A
   download.
7. **The physical universe.** Earth from NASA's data, clean, with only what
   stood thousands of years ago; the solar system at its true size; light
   speed at the speed of light, in real time, with the universe held still and
   the glow.

Owed from stage 2, small: a run that draws every option and counts what
changes, so that "no choice does nothing" is held by a run and not by one
measurement; something that points a first visitor to the body button.

## How it is built

`src/game/`, plain modules like the rest of the site, three.js for drawing.
The modules that decide anything have no page and no three in them, so the
suite runs them; those that draw are read as text and looked at.

| file | what it is |
|---|---|
| `body.js` | how a body moves: the jump, the dash, flight, the fixed step |
| `input.js` | the hands: keys, mouse, controller, touch, as twenty-one actions; the bindings and their keeping (an action added later gives way to a key already kept for another) |
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
| `shelter.js` | the shelter as numbers: its shell, what of it is solid, where a body may go and stand, where the eye may stand, where the sun gets in, how it goes up |
| `world.js` | what stands in the void: the buildings, the build key, and what they ask of the body, the eye and the light |
| `house.js` | the house as numbers: its solids, the room's and the porch's air, the ladder, the eye, the sun through its window and door, how it goes up |
| `workshop.js` | the workshop as numbers: its vaults, solids and airs, the glass that opens as a body comes, standing on the vaults, the eye, the sun through the glass, how it goes up and comes down |
| `tower.js` | the tower as numbers: worked round its axis; the stair's ramp, its turns and rails, the landings, the gallery and the ledge, the dome, the eye, the sun through its windows and dome, how it goes up and comes down |
| `hall.js` | the hall as numbers: the terraces, stairs and beds, the hangar and its arched mouth, the hall's walls, roof, columns and things, the eye, the sun through its glass band, door and mouth, how it goes up and comes down |
| `solids.js` | a body (an upright cylinder) against boxes: floors, ceilings, walls; a ray out of a box |
| `combat.js` | the fight as numbers: the ring's five ways, the binding (pulls, holds, lets go, joins), the bots' five levels and their minds, bolts, the body hurt and mended; swept tests in sixtieths of a second |
| `fight.js` | the ring, its trail and shield, the binding's thread and halo, the bots, bolts, sparks, debris and the slam's wave (draws) |
| `island/ground.js` | the island's ground as numbers: the file read, the height on the drawn triangles, slopes, water, cliffs, the eye's line |
| `island/island.js` | Lord Howe drawn: sky and sun, the land, the sea by its depth, haze; it stands where the void stands (draws) |
| `island/map.js` | the island as an SVG for the map tab |
| `island/life.js` | what grows and lives there as numbers: the palms by cell, the terns and tropicbirds by time, the woodhens and turtles stepped |
| `island/creatures.js` | the palms, terns, tropicbirds, woodhens and turtles drawn, one instanced shape each (draws) |
| `island/lordhowe.bin`, `lordhowe-shape.js` | made by `scripts/island/lordhowe-build.mjs` from the elevation tiles: the heights (300 KB), the coast, shallows, peaks, arrival |
| `buildings/` | `shelter.js`, `house.js`, `workshop.js`, `tower.js`, `hall.js`: the five drawn; `parts.js`, the shapes they are put together from (draws) |
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
