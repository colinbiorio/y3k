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
  and the first figure are arithmetic: as sharp as the screen, and no file to
  fetch. ("prioritize high quality, smooth graphics with the least
  pixelation".)
- **Light speed is real time.** A trip will be a record of two clock times,
  not a countdown that runs while the page is open. Logging off does not stop
  it and nothing skips it.
- **Small on disk.** What is generated is kept few and small.

## The asks, one by one

| asked | where it stands |
|---|---|
| "traverse the entire planet of Earth" | stage 7. The heights and the colours are fetched and packed (below). |
| "at least 5 different types of spaceships of varying size and design" | stage 4, flown in the void first. |
| "the entire solar system ... as accurately modeled to reality as possible" | stage 7. |
| "5 different types of buildings that can be constructed ... entered and explored, inside furnished minimally" | stage 3. |
| "5 different types of customizable characters ... 5 different types of customization, with 5 subset levels" | stage 2. One figure stands now, the traveller; `look` in `src/game/figure.js` is where the choices arrive. |
| "some type of 'force'" | stage 5: the binding. |
| "options for both controller and keyboard/mouse, with a dedicated 'controls' menu option from inside 'world' tab" | **done.** Every action has two keys and a controller button, and each can be changed. A phone gets a thumb stick and buttons. |
| "Optimize for web, but also offer a download option" | the web: so far, yes (measured below). A download: stage 6; the desktop window in `desktop/` already exists. |
| "run this smoothly on my mac" | **measured** on an M2 MacBook Air: 16.7 ms a frame. |
| "make up 5 different plasma weapons" | stage 5. |
| "a mix between ancient/natural, current, and futuristic" | the traveller wears all three. Every building and ship must. |
| "characters should be able to fly, but only in 'creative' mode" | **done.** |
| "tap to jump or hold to jump higher -- allowing the character to defy gravity by 2x, but still be affected" | **done.** A tap rises 1.5 m; held, 3.0 m. The pull is halved while rising with the key down, and whole on the way down. |
| "omnidirectional dash options" | **done.** 6.24 m any way the hands point; once more in the air. |
| "a light speed fast travel option and simulate the actual speed of light" | stage 7, with the frozen universe and the glow. |
| "rendered with a combination of Higgsfield plugin and whatever 3d rendering system works best" | three.js draws everything so far. Nothing has been generated yet (see Higgsfield, below). |

## Where it stands

**Stage 1, the void, is built** (13 November 2026). Open the world tab and you
are standing in it.

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
- **The traveller** (`figure.js`, `gait.js`). The first figure, made of
  arithmetic: a hooded cloak and a woven hem, a belt and boots of leather, a
  suit with plates of pale metal and seams of light. Its legs are placed from
  where the feet should be, so a foot meets the water where its ring begins.
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

**Not looked at:** Safari itself and Firefox itself, with a real mouse and
the pointer held; a real phone; a real controller (the smoke's is made up,
answering for `navigator.getGamepads`).

### Rough edges, known

- The traveller reads stiff: straight arms, a cape that leans at rest and
  flips up in a dash, and a flier that is small at speed.
- There is nothing to do yet but move. Stage 6 gives survival its reason.
- No full-screen button yet. The standing hint is long.

## What is next

Each stage ends the way the first did: playable, looked at in a browser,
tested, shipped.

2. **The five bodies.** Human, robotic, mantis, octopus, light. Five kinds of
   choice each, five options in each (for the human: hair, build, clothing and
   two more), chosen in a sheet with the figure standing in the water as its
   own mirror. Each moves in its own way on the same body rules.
3. **The five buildings.** Different in design and size, built where you
   stand, entered, walked through, furnished a little. Ancient, present and
   to come in each.
4. **The five ships.** From one seat to a carrier. Boarded and flown in the
   void, so they are ready when there is somewhere to go.
5. **The binding and the five plasma weapons**, with things for them to act
   on: machines, hazards, the land. Never a presence's people.
6. **What survival is for**: things to find, make and keep. Full screen. A
   download.
7. **The physical universe.** Earth from NASA's data, clean, with only what
   stood thousands of years ago; the solar system at its true size; light
   speed at the speed of light, in real time, with the universe held still and
   the glow.

## How it is built

`src/game/`, plain modules like the rest of the site, three.js for drawing.
The modules that decide anything have no page and no three in them, so the
suite runs them; the three that draw are read as text and looked at.

| file | what it is |
|---|---|
| `body.js` | how a body moves: the jump, the dash, flight, the fixed step |
| `input.js` | the hands: keys, mouse, controller, touch, as fourteen actions; the bindings and their keeping |
| `rings.js` | a ring on the water as a function; the pool of drops; the floor's lattice and the rebase |
| `gait.js` | how the body carries itself: the stride, the two-bone leg, landings |
| `state.js`, `gate.js` | what is kept between visits; the door between the void and the societies |
| `lights.js` | pale, dusk, night |
| `menu.js` | the controls sheet |
| `void.js` | the sky, the water, the mirror, the motes (draws) |
| `figure.js` | the traveller (draws) |
| `view.js` | the frame: hands, eye, body, rings, figure, mirror, picture (draws) |

Fixed in the code, so nobody has to find them again:

- The floor is y = 0 and the water's surface is y = 0.0254 (one inch).
- At yaw 0 the eye looks along −Z; a positive yaw turns it left; a positive
  pitch looks up. `move` is [right, forward].
- A body's front is +Z (its yaw is `atan2(x, z)`), and it begins with its back
  to the eye (yaw π).
- A press (jump, dash, fly) is kept until a step runs, so a frame shorter
  than a step cannot swallow it.
- `Y3K.game.read()` in the page answers where the body is and what it is
  doing. The smoke reads the game through it.

## How it is looked at

- `node test/game.test.mjs` (in `npm test`): the jump's two heights, the dash
  in eight directions, flight's rules, the bindings, the controller, the
  page's keys, the rings, the legs, the door, and this file's quotes.
- `node scripts/void-smoke.mjs <desk|pad|phone> [gpu] [firefox|webkit]`: a
  real browser against a throwaway server. It walks the body through all of
  it, takes pictures, measures frames, and fails on any console error. **Look
  at the pictures**: no check sees a white coin in the sky.
- The test was tried against the code broken on purpose: 110 small breakages
  in `body.js`, `input.js`, `rings.js`, `gait.js`, `gate.js` and `state.js`,
  one at a time. It fails for 108. The other two change nothing that can be
  seen (a rise ended twice over; a lattice period one row longer). The first
  run let nineteen more through: each is held by a check now.

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

## Higgsfield

Colin's rule is above: don't spend real money. Higgsfield makes pictures,
video and sound, and 3D models through its command line. It has two doors: a
connector inside a Claude chat, and the command line, which spends credits.
**Nothing has been generated.** Stage 1 is arithmetic throughout, by choice
and by that rule. Where generation will earn its place: concept sheets for
the five bodies, the buildings and the ships before they are modelled;
surfaces; sound. Whatever goes into the game is kept small and written down
here, with what made it.

## The universe, put by

For stage 7, already in hand and kept outside the repository until then:

- **Earth.** Heights from NOAA's ETOPO5 and colour from NASA's Blue Marble
  (July 2004), fetched and packed into a 6.9 MB height grid and an 11.4 MB
  colour picture.
- **The plan.** The planets from JPL's Keplerian elements and the Moon from
  Meeus; a floating origin and a logarithmic depth, so a metre and an
  astronomical unit fit in one picture; the ground as a cube of quadtrees
  wrapped on a sphere; a light-speed trip as a record of two clock times.
