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
| "at least 5 different types of spaceships of varying size and design" | stage 4, flown in the void first. |
| "the entire solar system ... as accurately modeled to reality as possible" | stage 7. |
| "5 different types of buildings that can be constructed ... entered and explored, inside furnished minimally" | stage 3, **two of five**: the shelter and the house, built from the bar's list (or the key), entered and explored, furnished; the house's loft reached by its ladder. The workshop, the tower and the hall are next. |
| "5 different types of customizable characters ... 5 different types of customization, with 5 subset levels" | **done** (stage 2). Human, robot, mantis, octopus, light: five choices each, five options a choice, chosen in the **body** sheet. |
| "some type of 'force'" | stage 5: the binding. The ring is already held by it rather than by a hand. |
| "options for both controller and keyboard/mouse, with a dedicated 'controls' menu option from inside 'world' tab" | **done.** Every action has two keys and a controller button, and each can be changed. A phone gets a thumb stick and buttons. |
| "Optimize for web, but also offer a download option" | the web: so far, yes (measured below). A download: stage 6; the desktop window in `desktop/` already exists. |
| "run this smoothly on my mac" | **measured** on an M2 MacBook Air: 16.7 ms a frame. |
| "make up 5 different plasma weapons" | **one of five** (17 Nov): **the ring**, five ways to use it (cast, charged cast, whirl, slam, guard and parry). The thread, the bow, the bell and the torch to come. |
| "a plasma weapon generated with several ways to attack with it" (17 Nov) | **done**: the ring, above. |
| "a bot enemy that we can spawn in at varying difficulty" (17 Nov) | **done**: five levels (drifter, scout, sentinel, hunter, warden), called from the bar's **bots** list or N. |
| "wall run" (17 Nov) | **done**: along any wall that stands (the house's, for now); the island's cliffs next. |
| "a small island ... under the world settings as a new tap called 'map'" (17 Nov) | **done**: Lord Howe Island, chosen from the controls sheet's **map** tab. Its animals are next. |
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
**build** (or B) and a shelter goes up in front of you. **The first weapon and
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
- Not yet: **its animals** (the woodhen, red-tailed tropicbirds and sooty
  terns on the cliffs, green turtles in the lagoon, the stick insect) and its
  palms as trees rather than a coloured canopy, both next; the ground is
  16 m triangles close up; the lagoon's west edge is a straight rule.

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
- Not yet: sounds; the other four weapons; the binding as a power of its own;
  bots that walk or fly differently from these; a bot that knows the
  buildings are there (they go round nothing yet); the bar wraps onto two
  lines on a phone.

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
- Not yet: the workshop, the tower and the hall; a building kept between visits
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
Lord Howe Island, under a new **map** tab (done: its ground, sea and map).
Next: its animals and its palms (woodhens, tropicbirds, terns, turtles, the
stick insect). Then the buildings again.

3. **The five buildings**: a shelter, a house, a workshop, a tower, a hall.
   Different in design and size, built where you stand, entered, walked
   through, furnished a little. Ancient, present and to come in each. **The
   shelter is built** (above); the house next, then the workshop, the tower
   and the hall, each from its brief.
4. **The five ships**: a skiff, a dart, a dhow, an ark, a carrier. From one
   seat to a carrier. Boarded and flown in the void, so they are ready when
   there is somewhere to go.
5. **The binding and the five plasma weapons** (a thread, a bow, a ring, a
   bell, a torch: none of them a blade), with things for them to act on:
   machines, hazards, the land. Never a presence's people.
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
| `input.js` | the hands: keys, mouse, controller, touch, as nineteen actions; the bindings and their keeping (an action added later gives way to a key already kept for another) |
| `rings.js` | a ring on the water as a function; the pool of drops; the floor's lattice and the rebase |
| `gait.js` | how a body on two legs carries itself: the stride with its feet planted, the two-bone leg, landings; told a build (the mantis's long legs, the robot's stiffness) |
| `crawl.js` | how a body on many arms carries itself: six tips, three always on the floor |
| `kinds.js` | the five kinds: their choices, options and colours; a look made fresh, cleaned, or drawn by chance |
| `chooser.js` | the body sheet: its rows, its keys, and where the body stands beside it |
| `drape.js` | how a point of cloth leaves a limb it has got into |
| `state.js`, `gate.js` | what is kept between visits; the door between the void and the societies |
| `lights.js` | pale, dusk, night |
| `shelter.js` | the shelter as numbers: its shell, what of it is solid, where a body may go and stand, where the eye may stand, where the sun gets in, how it goes up |
| `world.js` | what stands in the void: the buildings, the build key, and what they ask of the body, the eye and the light |
| `house.js` | the house as numbers: its solids, the room's and the porch's air, the ladder, the eye, the sun through its window and door, how it goes up |
| `solids.js` | a body (an upright cylinder) against boxes: floors, ceilings, walls; a ray out of a box |
| `combat.js` | the fight as numbers: the ring's five ways, the bots' five levels and their minds, bolts, the body hurt and mended; swept tests in sixtieths of a second |
| `fight.js` | the ring, its trail and shield, the bots, bolts, sparks, debris and the slam's wave (draws) |
| `island/ground.js` | the island's ground as numbers: the file read, the height on the drawn triangles, slopes, water, cliffs, the eye's line |
| `island/island.js` | Lord Howe drawn: sky and sun, the land, the sea by its depth, haze; it stands where the void stands (draws) |
| `island/map.js` | the island as an SVG for the map tab |
| `island/lordhowe.bin`, `lordhowe-shape.js` | made by `scripts/island/lordhowe-build.mjs` from the elevation tiles: the heights (300 KB), the coast, shallows, peaks, arrival |
| `buildings/` | `shelter.js`, `house.js`: the two drawn (draws) |
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
