# the solar system — the clockwork first

*The working memory of the solar system in the open world, the way [GAME.md](GAME.md) is the game's: what Colin
asked for, in his words; the plan; what is built; what was measured, and against what; what is owed; how the
tables were made, so that anyone can make them again. It changes with the code. With ten minutes, read "Where it
stands" and "What was measured".*

## The ask

Colin, 13 November 2026, in the brief that began the game (whole in GAME.md):

> you can traverse the entire planet of Earth, there should be at least 5 different types of spaceships of varying size and design, with ability to traverse the entire solar system, just our solar system for now, as accurately modeled to reality as possible.

> in space, allow a light speed fast travel option and simulate the actual speed of light to travel the distance required. lightspeed travel should make freeze all motion of the universe and add an ethereal glow to the screen with minimal prismatic light refraction.

His answers the same day, which are the rules everything here is built to:

> we want realism, so for now, if a player is traveling far, they'll have to actually wait the time it takes for light to travel. they can log off, they can play in a 'creative mode' sandbox, while waiting, and the timer should continue in real time, synced with global clocks, but no skipping. If they want, they can turn around or reroute to another destination, but all timing still applies.

> real continents, mountains and coasts from Nasa data, with the ground drawn in whatever style feels right.

> stylized realism is a good way to put it. remember, ancient, current, and futuristic all at ones. For example, assume a generally clean Earth -- not the industrial one with cities and roads -- the only structures that should be present on Earth for now are like pyramids and shi, stuff that was there thousands of years ago.

20 November 2026, when the island and the ships were there:

> we started with howe island or whatever it's called, but now we can start expanding -- starting with our solar system -- that's our goal for this week -- model the solar system as accurately as possible and make it explorable

21 November 2026, which sets the standard:

> let's continue our goal to create a beautiful solar system, focusing, as an expert 3d game designer and a realist, on ultra-high quality experience rather than quantity of output. we have all the time in the world --- haha no pun intended.

What follows from his words, and is not to be traded away: the real speed of light and nothing faster; a far
journey takes the real light time, on the real clock, with no skipping, and goes on while the traveller is logged
off or in a sandbox; a journey can be turned or rerouted, and the timing still applies; while it lasts the universe
is held still under an ethereal glow; the Earth is the real Earth, clean, with only what stood thousands of years ago.

## The plan: depth first

Each step is finished to the highest standard it can reach before the next begins. Nothing is shipped whose
error has not been measured; what cannot yet be done well is written under "What is owed" instead.

1. **The clockwork** (this file's subject; built, 21 November 2026). Where every body is and how it is turned,
   for any date, and the sky as it is seen from a place on the Earth, measured against JPL. No pictures.
2. **The true sky from the island.** A real star catalogue with true colours and magnitudes, the Milky Way, the
   Sun, the Moon with its phase and its face, the planets where they are and as bright as they are, for the real
   clock, seen from Lord Howe Island (31.55 S, 159.08 E); the eye's adaptation from noon to a moonless night.
   In four parts, each looked at before the next: **the air and the Sun** (built, 22 November 2026, behind a
   switch: below); **the night** (built the same day, behind the same switch: below); the Moon; the clock's dial,
   the sea's mirror, phones.
3. **The seamless rise.** The air's scattering from the beach to space; the Earth as a globe under the island
   (his clean Earth: no city lights), the island at its real place; numerical precision at planetary scale, so
   that a metre on the sand and the distance to the Moon live in one picture without a seam.
4. **The Moon**, the first other world: to fly to, in its real light time of a second and a quarter, and to land on.
5. **Travel in real light time.** The throttle to c; journeys that take the real light time and go on while
   logged off; targets, a map of the system, turning round and rerouting; the universe held still in transit.
6. **The other worlds**, one at a time, each finished before the next begins: real maps, rings, air, the Sun.
   Then the small bodies: Ceres and the belt, comets, the Kuiper belt.

## Where it stands

**Step 1 is built.** `src/game/solar/` is the clockwork: five plain modules with no page and no three in them.
`test/solar.test.mjs` (22 checks) holds it to the sky. **Step 2's first part is built behind a switch** (the
air and the Sun: its own section below): three more plain modules beside the clockwork, one that draws, and
`test/sky.test.mjs` (18 checks). **Its second part, the night, is built behind the same switch** (its own section
below): the stars, the Milky Way, the zodiacal light, the airglow, the planets, the Moon's light and the eye at
night, in `night.js` and two generated files, and `test/night.test.mjs` (20 checks). The world tab uses them only
when the page's address says `?sky=true`.

| file | what it is |
|---|---|
| `ephemeris.js` | the clock, the places, the rotations, the light time, the sky. The only file with logic. |
| `bodies.js` | what each of the 34 bodies is: its pull, size, rotation model, albedo, colour, air, rings. Generated. |
| `vsop87b.js` | the eight planets: VSOP87B cut to 3,820 terms, and 45 fitted for the giants. Generated. |
| `elp2000.js` | the Moon: ELP 2000-82B cut to 1,032 of its 37,872 terms, and 3 numbers fitted. Generated. |
| `orbits.js` | 20 moons and 4 far dwarf planets: small theories fitted to JPL's ephemerides. Generated. |

The bodies: the Sun; Mercury, Venus, the Earth and the Moon, Mars with Phobos and Deimos; Jupiter with Io,
Europa, Ganymede, Callisto; Saturn with Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus; Uranus with
Miranda, Ariel, Umbriel, Titania, Oberon; Neptune with Triton; Pluto with Charon; Eris, Haumea, Makemake.

What it answers (`ephemeris.js`; every angle in degrees unless said, every length in kilometres, in doubles):

- `position(id, when, out)`: from the Sun's centre, on the ecliptic and equinox of J2000 (the ICRF turned about x
  by 84381.448 arcsec: the frame JPL Horizons calls "Ecliptic of J2000.0"). `relative(id, when, out)`: from its
  parent's centre. `velocity(id, when, out)`: km/s. `centreOfMass(when, out)`: the solar system's.
- `orientation(id, when, out)`: a quaternion `[x, y, z, w]` from body-fixed axes (z the north pole, x through the
  prime meridian) to that frame, by the IAU's models; the Earth's by precession, nutation and sidereal time.
- `lightTime(a, b, when)`: seconds for light, or a ship at c, leaving `a` now to reach `b` where `b` will then
  be. Either end may be a body or a point `[x, y, z]`: a ship rerouting mid-flight. `distance(a, b, when)`.
- `sky(lat, lon, when, out, opts)`: what an observer on the Earth sees. For every body: altitude and azimuth
  (and the same as a unit vector east, north, up), lifted by the air unless asked not to be; right ascension
  and declination of date; distance and light time; angular diameter; apparent magnitude; the lit fraction,
  phase angle and elongation; the position angles of the bright limb, of the body's north pole and of the
  observer's zenith; the point of the body under the observer (for the Moon, its librations) and the latitude
  under the Sun. Light time, the Sun's bending of light, the observer's place and motion on the turning
  Earth (the Moon's parallax of up to a degree), aberration, precession and nutation are all in it. `opts.height`
  carries the observer from the beach to orbit, the air thinning as it goes.
- `apparent(from, id, when, out, velocity)`: the same seeing from any point in space.
- `horizonMatrix(lat, lon, when, out)`: the turn that takes a star catalogue's J2000 directions onto that
  horizon. `gmst`, `gast`, `lst`: sidereal time. `refraction(alt)`: the air's lift (Saemundsson's formula).
- `julianTT`, `fromTT`, `deltaT`: the clock. `when` is a Date or the milliseconds of the UTC clock.

Every function is a pure function of its arguments, writes into the caller's `out`, and makes no array or
object once warm.

## What was measured

All of it is what `node test/solar.test.mjs` measures and prints, on fixtures fetched once from JPL Horizons
(`test/fixtures/solar/`, each with the question that was asked). The test fails if a row here stops being true.

### Where things are

Against Horizons' own vectors (DE441 for the planets and the Moon; its satellite ephemerides MAR099, JUP365,
SAT441, URA184, NEP098, PLU060; its small-body solutions for the dwarf planets) at 40 dates drawn at random
across 1900-2100, which no fit ever saw. Worst of the 40:

| body | angle from its parent (the Sun; its planet for a moon) | angle in the Earth's sky | place (km) | distance from its parent (km) |
|---|---|---|---|---|
| Mercury | 0.09" | 0.105" | 31 | 10 |
| Venus | 0.06" | 0.133" | 31 | 20 |
| Earth | 0.08" | n/a | 60 | 32 |
| Moon | 0.30" | 0.297" | 0.61 | 0.34 |
| Mars | 0.13" | 0.172" | 156 | 91 |
| Phobos | 0.0028° | 0.173" | 0.46 | 0.14 |
| Deimos | 0.0024° | 0.171" | 1.00 | 0.24 |
| Jupiter | 0.11" | 0.109" | 556 | 460 |
| Io | 0.0030° | 0.110" | 23 | 6.88 |
| Europa | 0.0044° | 0.121" | 51 | 22 |
| Ganymede | 0.0041° | 0.106" | 81 | 58 |
| Callisto | 0.0030° | 0.115" | 100 | 46 |
| Saturn | 0.20" | 0.208" | 1,343 | 805 |
| Mimas | 0.0076° | 0.209" | 26 | 14 |
| Enceladus | 0.0040° | 0.209" | 17 | 5.35 |
| Tethys | 0.0033° | 0.209" | 17 | 7.49 |
| Dione | 0.0018° | 0.210" | 12 | 4.62 |
| Rhea | 0.0037° | 0.210" | 34 | 7.94 |
| Titan | 0.0022° | 0.205" | 48 | 12 |
| Iapetus | 0.0044° | 0.211" | 273 | 66 |
| Uranus | 0.18" | 0.171" | 2,610 | 2,135 |
| Miranda | 0.0056° | 0.171" | 13 | 5.88 |
| Ariel | 0.0028° | 0.171" | 9.40 | 2.93 |
| Umbriel | 0.0040° | 0.171" | 19 | 6.61 |
| Titania | 0.0035° | 0.170" | 26 | 23 |
| Oberon | 0.0031° | 0.173" | 33 | 19 |
| Neptune | 0.11" | 0.107" | 2,408 | 1,007 |
| Triton | 0.0023° | 0.107" | 14 | 0.25 |
| Pluto | 0.11" | 0.117" | 4,358 | 3,255 |
| Charon | 0.0018° | 0.117" | 0.60 | 0.01 |
| Eris | 0.03" | 0.031" | 2,746 | 2,397 |
| Haumea | 0.13" | 0.126" | 4,269 | 1,665 |
| Makemake | 0.17" | 0.165" | 6,094 | 3,834 |

For scale: an arcsecond is a 1,800th of the Moon's width; the sharpest eye resolves about sixty of them. Every
body is within a third of an arcsecond of its true place in the Earth's sky, and every moon within a hundredth of
a degree of its true place round its planet (Io to 23 km of a 1,821 km radius).

**The standard the test holds**, a little above what the 40 dates show, because a longer run finds a little more
(below): planets 0.4" from the Sun and 0.6" in the Earth's sky; the Moon 0.6" and 1.5 km; dwarf planets 1.0";
moons 0.012° round their planets and 0.35" in the Earth's sky.

**A longer run.** While the tables were being made, each was measured at 300 other random dates (not in the
repository; the build scripts print them). Worst of the 300: Mercury 0.12", Venus 0.09", Earth 0.10", Mars
0.17", Jupiter 0.23", Saturn 0.27", Uranus 0.26", Neptune 0.15" (from the Sun); the Moon 0.41" and 0.43 km; the
moons at most 0.0102° (Mimas, 33 km), and in kilometres Iapetus 297, Callisto 121, Oberon 85, Ganymede 80, Titan 58,
Europa 48, the rest under 40; from the solar system's centre of mass Pluto 0.22", Eris 0.04", Haumea 0.54",
Makemake 0.83".

**The centre of mass.** `centreOfMass()` is within 162 km of Horizons' (the Sun swings up to 1,307,354 km from it):
it is the eight planets' doing here; Pluto, the asteroids and the belt beyond Neptune are left out.

**Outside the two centuries** the fitted parts are not valid and the cuts were not made for it, but it wears
slowly. Measured at 1800, 1850, 2150 and 2199: Mercury 0.1", Venus 0.1", Earth 0.1", Mars 0.3", Jupiter 0.1",
Saturn 0.2", Uranus 1.1", Neptune 0.5", the Moon 0.5". The moons and dwarf planets have not been measured
outside 1900-2100 and must not be trusted there.

**The year 3000**, which the place is named for. Measured at 2500, and twice in 3000: Mercury 0.6", Venus 1.1",
Earth 0.8", Mars 9.6", Jupiter 1.4", Saturn 3.8", Uranus 15.7", Neptune 1.6", the Moon 11.1" at worst (Mars and
the giants against their systems' centres of mass: JPL's planet-centre ephemerides end near 2200). A millennium
out, the Sun, the Moon and the planets are still within a quarter of an arcminute of where they will be, which is
less than the eye can tell; where each moon will be along its orbit is not known to this clockwork.

### The sky from Lord Howe Island

`sky(-31.55, 159.08, ...)` with no air, against Horizons' observer table for the same place (its apparent,
airless quantities) at 14 instants drawn at random across 1973-2026. Worst of the 14:

| body | right ascension and declination | altitude and azimuth | magnitude | lit fraction (% of the disc) | point under the observer: longitude, latitude | bright limb | north pole's position angle |
|---|---|---|---|---|---|---|---|
| Sun | 0.08" | 10.9" | 0.002 | 0.0000 | 0.0004°, 0.0000° | 0.000° | 0.0000° |
| Moon | 0.22" | 11.1" | 0.021 | 0.0048 | 0.0024°, 0.0023° | 0.005° | 0.0033° |
| Mercury | 0.08" | 11.2" | 0.001 | 0.0086 | 0.0000°, 0.0000° | 0.011° | 0.0000° |
| Venus | 0.09" | 11.4" | 0.001 | 0.0058 | 0.0000°, 0.0000° | 0.007° | 0.0000° |
| Mars | 0.12" | 11.1" | 0.093 | 0.0024 | 0.0001°, 0.0000° | 0.005° | 0.0001° |
| Jupiter | 0.17" | 11.6" | 0.001 | 0.0004 | 0.0024°, 0.0000° | 0.009° | 0.0000° |
| Saturn | 0.27" | 11.8" | 0.001 | 0.0002 | 0.0020°, 0.0000° | 0.008° | 0.0000° |
| Uranus | 0.20" | 10.9" | 0.021 | 0.0001 | 0.0005°, 0.0000° | 0.000° | 0.0001° |
| Neptune | 0.17" | 11.1" | 0.015 | 0.0000 | 0.0006°, 0.0000° | 0.000° | 0.0001° |
| Pluto | 0.18" | 11.7" | owed | 0.0000 | 0.0000°, 0.0000° | 0.000° | 0.0001° |
| Io | 0.17" | 11.6" | owed | 0.0008 | 0.0000°, 0.0002° | 0.005° | 0.0000° |
| Titan | 0.28" | 11.7" | owed | 0.0002 | 0.0000°, 0.0000° | 0.008° | 0.0001° |

- **Right ascension and declination** do not depend on how far the Earth has turned: they are the ephemeris, the
  light time, the Sun's bending of light, aberration, precession, nutation and, for the Moon, the observer's own
  place. All within 0.3".
- **Altitude and azimuth** also carry the Earth's turning, and the 11" is one thing: UT1 - UTC, the difference
  between the Earth's real rotation and the clock, which no clock can know ahead (it is kept under 0.9 s, 13.5").
  Local sidereal time is 0.787 s from Horizons' at worst, for the same reason. Nothing else is in that column.
- **Magnitude**: Mallama and Hilton's equations, which Horizons and the Astronomical Almanac use. Mars is 0.09
  off at worst because its surface markings turn it by up to 0.06 mag and that table is owed. The Moon's is the
  classical phase law (0.026 mag a degree and a fourth-power term, as Allen's Astrophysical Quantities gives it, from
  memory) and agrees with Horizons to 0.02. The moons' and dwarf planets'
  magnitudes are owed and are `NaN`, not guessed.
- **The point under the observer** is the face turned to us: for the Moon, its librations, to 0.0024°. Io, Titan,
  Mars, Jupiter (System III), Mercury's wobble and Neptune's all come from the same few lines and the IAU's tables.
- The bright limb is compared where a phase can be seen (phase angle over 3°).

**The air.** With refraction on, the Sun's altitude between the horizon and 30° is within 1" of Horizons' refracted
table. At the horizon the lift is 29 arcminutes, nearly the Sun's whole width: when it seems to sit on the sea it has already set.

**A day on the island**, 21 November 2026 (UTC+11): sunrise 05:13:38, the Sun due north 12:09:25, sunset 19:05:34.
Horizons marks the minutes 05:14, 12:10 and 19:06 (the first minute after each).

### Two things people watched

- **The total solar eclipse of 8 April 2024.** At NASA's published place and instant of greatest eclipse
  (25°17.2'N 104°08.3'W, 18:17:18.3 UT; F. Espenak's path table) the centres of the Sun and the Moon are 0.3" apart,
  the Moon's disc holds the whole of the Sun's, and the Sun stands at 69.79°, 149.39° (published 69.8°, 149.4°). At
  five more points of the published central line it is total. Totality there lasts 272.1 s with the sizes this
  table carries, or 267.9 s with the Sun and Moon the size NASA took them to be: published, 268.1 s. Its middle
  is 0.8 s from the published instant. Two degrees north of the line it is not total.
- **Jupiter and Saturn, 21 December 2020.** From the Earth's centre they close to 6.11 arcminutes, a tenth of a
  degree, a fifth of the Moon's width; the gap is within 0.06" of Horizons' through the day.

Two more that fell out of the light-time table below and were not looked for: the Moon's closest approach of
the century comes out on 6 December 2052 at 356,422 km, and Mars' on 27 August 2003 at 55,757,982 km. Both are
the dates the almanacs give; the figure NASA gave for Mars in 2003, as remembered and not fetched again, was
55,758,006 km.

### The light times that will govern travel

From the Earth's centre to each body's, at their nearest and farthest between 2000 and 2100
(`node scripts/solar/light.mjs`). A journey at the speed of light takes this long, and no journey is shorter.

| from the Earth to | nearest (km) | light time | on | farthest (km) | light time | on |
|---|---|---|---|---|---|---|
| the Moon | 356,422 | 1.189 s | 2052-12-06 | 406,707 | 1.357 s | 2002-03-14 |
| the Sun | 147,091,163 | 8 min 11 s | 2020-01-05 | 152,104,288 | 8 min 27 s | 2019-07-04 |
| Mercury | 82,127,443 | 4 min 34 s | 2061-05-31 | 217,149,243 | 12 min 04 s | 2034-12-03 |
| Venus | 39,542,109 | 2 min 12 s | 2093-12-17 | 259,650,448 | 14 min 26 s | 2000-06-11 |
| Mars | 55,757,982 | 3 min 06 s | 2003-08-27 | 400,373,068 | 22 min 16 s | 2066-08-25 |
| Jupiter | 591,295,049 | 32 min 52 s | 2022-09-26 | 965,486,386 | 53 min 41 s | 2016-09-25 |
| Saturn | 1,201,476,442 | 1 h 06 min 48 s | 2091-12-27 | 1,653,065,861 | 1 h 31 min 54 s | 2076-12-23 |
| Uranus | 2,586,528,765 | 2 h 23 min 48 s | 2051-03-14 | 3,155,456,932 | 2 h 55 min 25 s | 2093-03-14 |
| Neptune | 4,310,539,829 | 3 h 59 min 38 s | 2041-10-28 | 4,669,448,781 | 4 h 19 min 36 s | 2099-09-06 |
| Pluto | 4,379,312,784 | 4 h 03 min 28 s | 2000-06-01 | 7,458,541,764 | 6 h 54 min 39 s | 2099-04-24 |

`lightTime(a, b, when)` is the exact figure for a departure: it solves for where the target will be when the
light arrives, so a ship leaving for Mars is told the time to where Mars will be, not to where it is.

### What it costs

On the machine it was built on (an M2 MacBook Air, Node 24), once warm: the place of all 34 bodies, **0.09 ms**;
with the whole apparent sky of 33 bodies from the island and one light time, **0.68 ms**: four hundredths of
a frame at 60 a second, if everything is asked every frame, which nothing needs (the planets creep; `opts.ids`
asks for a few). No array or object is made; about 0.7 KB of the engine's own boxed numbers are left per such frame
(two for each body asked about), which is 40 KB a second: nothing a collector notices. The series are 112.5 KB of
source (VSOP87B 72.5, ELP 20.2, the orbits 19.8), with `bodies.js` 22 KB and `ephemeris.js` 43 KB beside them.

## Step 2, first part: the air and the Sun (22 November 2026)

Standing on the island's beach, the sky is the sky over that beach at the world's clock's instant: the Sun where
the clockwork sees it, the air lit by it in real units from noon through sunset to the end of twilight, and the
land, the sea, the buildings, the ships and the bodies lit by the two and standing in that air.

**It is behind a switch, and off.** `?sky=true` in the page's address draws the island under the true sky; without
it nothing has changed, for anyone. It stays so until the night and the Moon are made and looked at, so that nobody
meets a half-made sky (after sunset there is, for now, nothing in it). Three more words in the address, for pictures
and for judging: `&at=2026-11-21T07:10:00Z` holds the world's clock at an instant, `&ev=1` adds stops to the
exposure, and `&curve=none` (or `agx`, or `aces`) draws the picture with another curve than the one chosen. The
void is not touched.

| file | what it is |
|---|---|
| `solar/clock.js` | the world's clock: the real UTC instant, read by everything; an offset (for a later dial); a pin from the address |
| `solar/air.js` | the air as numbers: the medium, the two tables, the light down a line of sight, the Sun above the air, the eye's exposure; and the same written out for the GPU from the same constants |
| `solar/daylight.js` | what the Sun and the air give a place at an instant: where the Sun is seen (the clockwork's `sky()`), what arrives of it, the sky's light on level ground, how bright the scene is to an eye |
| `../sky.js` (`src/game/sky.js`; it draws, with three.js) | the tables on the GPU, the dome and the Sun's disc, the air between the eye and every material, the lights, the exposure |

### The method, and what was ported

S. Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique" (EGSR 2020), from the paper
and from his reference implementation (github.com/sebh/UnrealEngineSkyAtmosphere; MIT, Copyright (c) 2020 Epic
Games, Inc.; its notice is kept at the foot of `air.js`). Ported from `RenderSkyCommon.hlsl`,
`RenderSkyRayMarching.hlsl` and `SkyAtmosphereCommon.hlsl`: the medium's three parts and their profiles; the
transmittance table and its layout (E. Bruneton's); the multiple-scattering table (64 directions, the second
order's light and the share scattered on, every later order as a geometric series); the march along a line of
sight, each step's light integrated against its own extinction; the two phase functions; the table of the sky as
seen (192 x 108, finest at the horizon and toward the Sun) and the way a direction is turned into a place in it;
the air between the eye and the land as 32 slices of the view out to 128 km, squared in depth.

Where it departs from the reference, and why:

- **Heights, not radii.** A ray is followed in the observer's own frame and only heights above the ground are
  formed, by differences that keep their figures in a GPU's single precision (a metre in 6,371 km is its seventh
  figure). The eye's height is a number handed in each frame: 2 m on the beach, 875 m on Mount Gower, and (to
  100 km, the top of the air) whatever a later stage raises it to.
- **The Earth's shadow is found, not sampled.** The reference asks each sample whether the ground hides the Sun.
  Here the stretch of each ray that lies in the cylinder behind the planet is worked out once, and the samples
  are laid on either side of its edge. Twice the samples change a twilight look by under 2% (the test holds this);
  stepped across, the shadow's edge bands.
- **The two tables that depend only on the air are made once, in doubles, in JavaScript** (about 300 ms on the
  M2), and handed to the GPU as they are: what the tests measure is what the picture reads. The transmittance
  table's first and last entries stand exactly on the zenith and the horizon (Bruneton's mapping; the reference
  lets it go, which costs 2% of the depth straight up). The multiple-scattering table's lowest row is at the
  ground (the reference's is 1 km up, by a slip of units).
- **The tables the GPU makes are kept over the sky's own light.** They hold half floats (three figures between
  6e-5 and 65,000), and the sky runs through eight powers of ten from noon to the end of twilight; so each holds
  luminance over the sky's light on level ground at that moment, a number near 1 at any hour.
- **The air between eye and land is one picture** (32 squares side by side, read twice and mixed), drawn in one
  pass a frame. Every material that took fog takes this instead, in light (before the screen's own encoding), and
  what is itself added light (a flame, a glow) is only dimmed by it.
- **A ray into the sea** carries the Sun's light off the water in the sky table too, as the reference has it for
  the multiple scattering only.

### The medium: what is physical

- **The Earth**: a sphere of its mean radius, 6,371.008 km (`bodies.js`); the air ends 100 km up.
- **The clear air (Rayleigh)**: its depth straight up is the measured one, 0.008569 λ^-4 (1 + 0.0113 λ^-2 +
  0.00013 λ^-4) at 1013.25 hPa (J. E. Hansen and L. D. Travis, Space Sci. Rev. 16, 527, 1974), at the 1014 hPa
  `bodies.js` carries. Its thinning with height is the **U.S. Standard Atmosphere, 1976**: seven layers of
  temperature, the density following from each (within 0.002% of the standard's own table at nine heights). The
  paper has one exponential of 8 km, and NASA's fact sheet gives 8.5: either is right near the ground and for
  the whole column, and two to three times too dense from 30 to 50 km, which is the air twilight is made of.
  With one exponential the end of civil twilight came out at 8.4 lux; with the standard atmosphere, 2.8 (the
  Explanatory Supplement: 3.4).
- **Three wavelengths, the screen's own**: 611, 549 and 464 nm, the dominant wavelengths of sRGB's red, green
  and blue. The paper, after Bruneton, has 680, 550 and 440. That pair of ends scatters six times apart where
  the screen's colours scatter three: its day was bluer than the sky is, and its red sat beyond the ozone
  layer's absorption, so twilight came out purple. With the screen's own, the zenith by day is red : green :
  blue = 0.73 : 1 : 1.75 (a blue sky of 15,000 to 25,000 K on the CIE's daylight locus is 0.73 to 0.67 : 1 :
  1.67 to 1.89), and twilight is the blue hour.
- **The haze (Mie)**: a clean sea air. Depth 0.06 at 550 nm: what ships far from land measure over the open
  ocean (0.06 to 0.07 at 500 nm: A. Smirnov et al., J. Atmos. Sci. 59, 501, 2002, and J. Geophys. Res. 114,
  D06204, 2009, the Maritime Aerosol Network; island stations, which today's continents reach, average 0.11).
  Single-scattering albedo 0.99 (sea salt hardly absorbs); grey; scale height 1.2 km and Cornette-Shanks with
  g = 0.8, as the paper has them. Level with the sea a hill 28 km off keeps 18% of its contrast: Ball's Pyramid
  stands faint, as it did.
- **Ozone**: 300 Dobson units in one layer, a tent from 10 to 40 km with its peak at 25 (Bruneton's 2017 model,
  which the paper takes); its cross-sections are that model's table (the University of Bremen's measurements at
  233 K, in bins of 10 nm), read at the three wavelengths.
- **The sea under it** gives back 6% of what falls on it.
- **The Sun above the air**: 1361 W/m2 (the IAU's nominal solar constant, 2015 Resolution B3) times 97.94 lm/W
  (133.8 klx over 1366.1 W/m2: the luminous solar constant of S. Darula, R. Kittler and C. Gueymard, Solar
  Energy 79, 559, 2005, as Kittler and Darula quote it, over the solar constant it was worked out with):
  133,300 lux at one astronomical unit, by the inverse square of the true distance (136,572 lux on 21 November).
  It is taken as white there, as the clockwork takes it.
- **The Sun's disc**: its true angular size where `sky()` sees it; its mean luminance is its lux over its solid
  angle (1.96e9 cd/m2 above the air); darkened to the limb as I(µ) = µ^a, a = -0.023 + 0.292 / λ (D. Hestroffer
  and C. Magnan, Astron. Astrophys. 333, 338, 1998), which keeps the mean; dimmed and reddened by the
  transmittance table along each pixel's own line; and flattened near the horizon by the clockwork's own
  refraction (Saemundsson's formula, undone for each pixel to find where its light really comes from).
- **Units**: lux and cd/m2 throughout. Each colour's number is "lux, were the light white", and the luminance
  is 0.2126 R + 0.7152 G + 0.0722 B.

### The world lit by it, and the eye

- **The key light** is the Sun through the air: its direction where it is seen, its colour and strength the
  transmittance table's, by how much of the disc clears the horizon. **The fill** is the sky's own light on level
  ground (an integral of the sky over the dome, kept for each quarter degree of the Sun's height and read
  between): half of it by a light from above and below (below, what the ground gives back), half by the sky
  wrapped round whatever stands in it (the same table, unrolled and blurred, made again when the Sun has moved
  a fifth of a degree), at each material's own share of it. Torches and plasma keep their own light.
- **The eye, in two steps**, both from G. Krawczyk, K. Myszkowski and H.-P. Seidel, "Perceptual effects in
  real-time tone mapping" (SCCG 2005). **The key**: the eye is adapted to a luminance L (what the meter reads,
  eased in time), and that level is given the scene value 1.03 - 2 / (2 + log10(L + 1)): 0.69 in full day, 0.16
  at the end of civil twilight, 0.032 at 0.01 cd/m2 (under that, where rods alone see, the night's part carries it
  on down: "The eye at night", below). A bright scene is drawn bright and a dark one dark, as vision
  takes them. The exposure is that value over L, one number for everything, and every light is multiplied by
  it before it is used (so the picture is still drawn straight to the screen, once). **The curve**: a scene value
  x is shown as x (1 + x / 64) / (1 + x) (Reinhard's curve, the one their method uses: half-way up at x = 1 and
  white at x = 8, which in full day is about twelve times the luminance the eye is adapted to, and at the end of
  civil twilight fifty), on the luminance, the colour's hue kept; a colour the screen cannot
  reach at that brightness gives up saturation, not hue. So white sand in the noon Sun is shown at two thirds
  of white and keeps its detail, while the sky, a sixth as bright, is a luminous blue.
- **Why a curve, when the game had none.** The game drew what was past the screen's white as white, and its
  painted sky stood far above the land's own brightness. The true sky's light spans more than a screen holds:
  with no curve and the land exposed as it was, noon came out as a camera with no film curve records it, a
  dark slate sky over a bright beach, a stop and a half under what an eye standing there sees (`&curve=none`
  shows it: the first pictures were made so). Three curves were then drawn side by side at six moments from
  noon to the end of civil twilight (three.js's AgX and ACES beside Reinhard's, each given the adapted level at
  the same brightness): AgX came out flat and grey (it gives up colour early by design), ACES dark and hard in
  the land with the Sun's glare spreading wide, Reinhard's bright and clear with the blue kept. Reinhard's was
  chosen, by those pictures. Things drawn in the screen's own terms (a flame, a glow, the inside of a room,
  a thing with no light on it) are not passed through it: they keep their own brightness, and a room is handed
  the Sun's and the sky's light as the screen shows them.
- **The meter** reads the model, not the picture: fifteen looks across the view (the sky where a look clears
  the horizon, an average scene on the ground where it does not: one that gives back 18% of the light, lit as
  its best-lit face is), weighted to the middle as a camera's is; and the eye is never so open that the sky in
  view is, taken together, shown past seven tenths of white (facing a low Sun the land goes dark rather than the
  sunset white). It follows a brighter scene half-way in 0.35 s and a darker one in 1.7 s.
- **The eye's veil round the Sun** (glare): the CIE's general disability glare equation (CIE 146:2002, after
  J. J. Vos), for a 30-year-old eye, added in light to the sky and to whatever stands in front of it, by how
  much of the Sun's disc is in sight: seven marks on the disc, which the GPU is asked about each frame (an
  occlusion query), so a palm's trunk, a ship or the body takes the glare away as it takes the disc. The equation
  is for a point and is not defined under 0.1 degrees: nearer the Sun's middle than its limb the veil is held at
  its value at the limb (held at 0.1 degrees, it rose 17.5 times inside the disc and showed through a dark
  glass as a bright spot a fifth of a degree across in the disc's middle; as played the disc is past white either
  way).
- **The sea** under the true sky reads the sky itself where each ripple throws the eye's line. (Its mirror of
  the Sun and the Moon is the fourth part's.)

### What was measured

`node test/sky.test.mjs` measures and prints these (no GPU), and fails if a line here stops being true.

- The standard atmosphere's density, nine heights from 5 to 80 km against its own table: within 0.002%; its column 8.454 km of sea-level air.
- Depth straight up (611, 549, 464 nm): 0.1605, 0.1843, 0.2581; a Sun overhead arrives with 83.2% of its light.
- Grazing the sea: 35.2 times the overhead air (Kasten and Young measure 38.1, with the air's bending); the table is within 0.2% of a slow sum there; what is left of the Sun on the horizon: 2.9e-4, 9.8e-5, 4.2e-6.
- Of the light sent to level ground, what arrives (Sun and sky): 90°: 94%, 60°: 93%, 30°: 87%, 10°: 64%, 5°: 49%, 2°: 46%; the most of a uniform glow scattered on: 0.309.
- The Sun above the air at 1 au: 133,300 lux; its disc's mean luminance 1.96e9 cd/m2; limb darkening exponents (611, 549, 464 nm) 0.455, 0.509, 0.606.
- The Sun seen 0.2° up is 27.2' high and 32.4' wide.
- The Sun's own colour at the ground (red and blue over green): noon 1.02, 0.93; seen half a degree up 2.43, 0.08; the zenith by day 0.73, 1.75 (a blue sky of 15,000 to 25,000 K on the CIE's daylight locus is 0.73 to 0.67, 1.67 to 1.89), at the end of civil twilight 0.62, 2.75.
- Opposite a Sun 2° down: the Earth's shadow 2° up 49.2 cd/m2, the band 12° up 112, the sky 40° up 78.7; red over blue 0.59 in the shadow, 0.93 in the band, 0.53 above it.
- Noon on the beach, as played: the scene reads 6,427 cd/m2 and is given the scene value 0.69 (exposure 1.07e-4 per cd/m2); the sky to the south is shown at sRGB 118, 138, 177 20° up and 155, 170, 191 at 3°; sand that gives back 40% of the light at 65% of white, a white sheet at 86%; half-way to a brighter scene in 0.35 s, to a darker in 1.73 s.

The light on level ground and the zenith, from the island on 21 November 2026 (UTC+11):

| when | local time | the Sun as seen | the Sun's light, facing it (lux) | the sky's, on level ground (lux) | both, on level ground (lux) | the Explanatory Supplement's fit (lux) | the zenith (cd/m2) |
|---|---|---|---|---|---|---|---|
| noon | 12:09:25 | 78.33° | 113,190 | 14,762 | 125,611 | 120,608 | 13,635 |
| the Sun 20° up | 17:22:32 | 20.00° | 80,266 | 9,952 | 37,405 | 27,242 | 1,077 |
| the Sun 5° up | 18:36:29 | 5.00° | 21,322 | 4,014 | 5,872 | 4,334 | 524 |
| sunset (the Sun seen on the horizon) | 19:03:55 | 0.00° | 12.1 | 938 | 938 | 536 | 158 |
| the end of civil twilight | 19:32:15 | -6.00° | 0.0 | 2.80 | 2.80 | 3.41 | 0.42 |
| the end of nautical twilight | 20:04:52 | -12.00° | 0.0 | 0.0050 | 0.0050 | 0.0081 | 0.00092 |

Opposite the Sun as it goes down (the Earth's shadow and the band over it, the Belt of Venus), seen from the
beach (the eye 2 m up) on 21 November: the sky's luminance (cd/m2) and its colour (the CIE's x, y, from the
screen's three colours; a white is 0.313, 0.329, and a smaller x and y is bluer) at four heights above the
horizon, by `air.js`'s own march (48 steps a look). The GPU's own table of the sky as seen, read back where the
dome reads it at the game's eye on the beach (5.3 m up), gives the same sixteen cells within 0.6% in luminance
and 0.001 in x and y (22 November, the M2's chip):

| the Sun | 2° up | 6° up | 12° up | 30° up |
|---|---|---|---|---|
| 1° down | 123; 0.293, 0.307 | 243; 0.326, 0.338 | 312; 0.301, 0.317 | 220; 0.278, 0.288 |
| 2° down | 49.2; 0.284, 0.296 | 67.4; 0.303, 0.305 | 112; 0.299, 0.307 | 95.5; 0.276, 0.282 |
| 3° down | 34.5; 0.283, 0.294 | 31.8; 0.268, 0.274 | 38.9; 0.274, 0.277 | 38.4; 0.265, 0.265 |
| 4° down | 20.0; 0.282, 0.292 | 17.9; 0.265, 0.271 | 15.6; 0.256, 0.257 | 14.1; 0.251, 0.248 |

The method gives the shadow and the band: a degree and two degrees down, the sky 2 degrees up is half as bright
as the sky 12 degrees up and bluer, and between them, about 6 degrees up, is the warmest colour in that sky (the
light there has come a long way through the air and lost its blue; under it the air is in the planet's shadow).
Three degrees down the two have run together to within a quarter, and at four the sky only darkens upward. In
the real sky the band can still be made out a little later than that: the shadow's edge here is the single
scattering's, and the light scattered more than once, which the method spreads evenly, fills it in. Nothing is
painted in to make up the difference.

The last column but one is the fit in the Explanatory Supplement to the Astronomical Almanac (P. K.
Seidelmann, ed., 1992, section 9.33, after Brown 1952), typed from memory and held by its own published figures
(759 lux for a Sun on the horizon, 3.41 at 6 degrees down, 0.0081 at 12). It is for an average clear sky; the
island's sea air is cleaner, so a low Sun comes through it a third brighter, and at sunset nearly twice. From 6
degrees down the model falls short of it (0.82 at the end of civil twilight, 0.62 at the end of nautical): the
light there has been scattered more than twice, and bent, and the method takes the first as the same in every
direction and leaves the second out.

**On the GPU** (measured by a probe on the M2's own chip, headless Chromium on Metal; not in `npm test`):

- **The GPU's sky is the model's.** The table of the sky as seen, read back and set against `air.js`'s own march
  at 555 of its entries, at seven heights of the Sun from noon to 10 degrees down: the worst entry is 0.25% off,
  the mean under 0.15%.
- **The Sun's disc, measured in the picture** (22 November, after the veil was held inside the disc: below;
  through a probe's dark glass of 12 to 19 stops, so that its middle is short of white; the eye turned 5 degrees
  aside, so that the body is not in front of it). As played, in a window 1912 pixels high (32.05 pixels a degree
  at its middle), it is 16.4 to 16.6 pixels wide from edge to edge where its light falls fastest; its true 0.5394
  degrees on 21 November are 17.3 pixels there, and a disc that small, darkened to its limb, loses most of a pixel
  to that way of finding an edge. Drawn again with the view ten times narrower (a telescope: 320.5 pixels a
  degree), it is 0.5348 to 0.5350 degrees wide by where its light falls fastest and 0.5408 by where its light
  crosses a fifth of the way up from the sky round it: the true 0.5394 lies between the two, within 1% of each.
  Its height over its width:

  | the Sun as seen | 20° | 5° | 2° | 1° | 0.5° | 0.2° |
  |---|---|---|---|---|---|---|
  | through the telescope (the sky alone) | 0.999 | 0.976 | 0.926 | 0.886 | 0.855 | 0.841 |
  | as played (17 pixels across) | 0.99 | 0.96 | 0.93 | 0.88 | 0.85 | 0.81 |
  | the clockwork's refraction predicts | 0.998 | 0.975 | 0.926 | 0.884 | 0.856 | 0.840 |

  As played, at 0.2 degrees the sea takes the lowest 0.02 degrees of the disc (0.806 through the telescope with
  the land and sea drawn): its lower limb is seen 0.025 degrees under the level, above the round Earth's horizon
  (0.05 degrees under it from the beach) but under the edge of the flat sea (below, "A round Earth under a flat
  island"). Its middle goes from sRGB 113, 110, 101 at 20 degrees (through 19 stops) to 191, 124, 29 at 0.2
  (through 12); low down its upper half is the brighter (at 0.2 degrees 213, 140, 36 a fifth of the way in from
  its top, 133, 81, 13 from its bottom), its light coming through less air.
- **The glare is cut with the disc.** With the eye swept across the Sun behind the body, the share of the disc
  in sight reads 1 in the clear and 0 behind the body or a palm's trunk.
- **Frames** (measured again on 22 November with the code as it stands, nothing else of the probe's running).
  At the game's pixel cap (a window of 1470 x 956 points at two pixels a point: 2940 x 1912 drawn), standing,
  walking and turning at noon, facing a Sun 5 degrees high, and at dusk, about 1,140 frames a run: with the true sky,
  two runs, 16.7 ms a frame, sixty a second, the 99th percentile 16.8 (the longest frame 33 ms); without
  it, one run the same and one with a few frames of 33 to 83 ms at noon, where the true sky is not drawn at all (the
  machine's own load: the Mac was in use). The sky's own share: 0.12 to 0.14 ms of the page's thread a frame; on
  the GPU, the air between eye and land 0.03 to 0.07 ms every frame, the sky as seen 0.63 to 0.77 ms when the Sun
  has moved a hundredth of a degree (every two seconds or so of the real clock), the wrapped sky 0.06 ms and its
  blurring when the Sun has moved a fifth of a degree. The two tables made once, as the island opens: 290 to
  315 ms.
- **The lighter path** (`?gfx=smooth`: one pixel a point, the sky table 128 x 72, 16 slices of 16 x 16):
  16.7 ms a frame with the true sky and without, the 99th percentile 16.8; its passes 0.02, 0.21 and 0.06 ms. At
  a phone's size on it (390 x 844 points, one pixel a point): the same, with it and without. Given a phone's
  touch at that size the M2 chose two pixels a point (780 x 1688) and held 16.7 ms. All of this is on the Mac's
  chip: no phone has drawn it yet.
- **Walked under the true sky** (22 November): the beach, a house built and walked into (at noon and with the Sun
  5 degrees up), a ship called, boarded and sailed into twilight, the body flown 110 m up toward and away from a
  Sun 2 degrees up, the night, the void and the island again: no console error anywhere, the void as it was. The
  sky's files are fetched when the island is first come to, not before.

### What is approximated

- **Three wavelengths** stand for the spectrum, and sunlight is white above the air.
- **A round Earth under a flat island.** The air is a sphere's; the island's sea is a plane to 45 km. At the eye's
  2 m the two horizons are 0.06 degrees apart. The globe is step 3.
- **Straight rays.** The Sun's seen place is used for its light, so the air's lift is in the direct beam; the
  bending of twilight's long paths is not in the scattering.
- **One ozone layer, one haze, no weather.** No clouds; no dust high up; the haze grey.
- **Multiple scattering the same in every direction** (the paper's): right by day, 40% dim by the end of
  nautical twilight.
- **Nothing on the ground shadows the air or the sky**: a mountain throws no shadow into the haze.
- **The air's dimming of what is behind it is one number for the three colours** (the paper's default).
- **The fill** reaches a surface half by a light and half by the wrapped sky at that material's own share:
  within about 15% of the model's irradiance for the land and the buildings, not exact.
- **No cast shadows.** The island never had them: a surface turned from the Sun is dark and a room's patch of
  sunlight turns with the hour, but a palm throws no shadow on the sand. Owed; a low Sun wants it most.
- **The glare** is the eye's veil only (no lens, no lashes); its equation is typed from the published form
  (the search confirmed its domain and its factors, not each coefficient); it is cut off at 60 degrees, and inside
  the Sun's disc it is held at its value at the limb (the equation is for a point; in the disc's middle its own
  light is thirty times the veil's).
- **The adaptation times** (0.35 s and 1.7 s) are a game's: the real eye takes minutes to the dark.
- **The curve is a screen's, not the whole of vision**: one curve for the whole picture (the eye adapts place
  by place), no change of colour with brightness (that belongs with the night). And the land's own colours
  were painted for the old light: its grass gives back 42% of what falls on it and its sand 65%, where real
  grass gives back 20 to 25% and coral sand about 40%, so the land stands higher against the sky than a real
  island does.
- **After the end of twilight there was nothing** (as this part first shipped): no stars, no airglow, no Moon; the
  exposure held at the night sky's own level (2e-4 cd/m2, `EYE.floor`) and the picture went black. The night is the
  second part, below.

### What the next parts need from here

- **The night**: `EYE.floor` is the place for the sky's own glow (airglow, zodiacal light, unresolved stars):
  add it to the dome's light and to `daylight.js` `sky` (the light on level ground), and the meter and the
  tables follow. Stars go on the dome behind the air: `airT(h, d.y)` in `sky.js` is the extinction and the
  reddening a star's light takes, the same call the Sun's disc makes. The tables are kept over the sky's light
  on level ground: once the Sun's part is gone that number must be the night's. The eye at night is the rest of
  Krawczyk's method, not drawn yet: colour lost under rod vision, and less acuity. And
  the switch: the true sky comes out from behind `?sky=true` only when the night and the Moon are drawn and
  looked at (`view.js`, the one line that asks).
- **The Moon**: a second light through the same tables (the table of the sky as seen is for one light: a
  second table, or the same one made for the Moon after the Sun is 18 degrees down); `daylight.js` `at()` is
  where its lux and place come in; the key light is then whichever is up. Its disc is the Sun's drawing with
  its phase; its glare, if it has one, is held at its own limb, and its share in sight needs marks of its own
  (the seven in `sky.js` are the Sun's).
- **The clock's dial**: `clock.set(ms)`, `clock.shift(ms)`, `clock.back()` are there; only creative mode may call them.
- **The sea**: `SKY_OVER_GLSL` already gives its surface the sky; the Sun's and the Moon's own glitter want the disc.
- **Phones**: the lighter path (smaller tables: 128 x 72 and 16 slices of 16 x 16) is drawn and measured on the
  Mac's chip, not yet on a phone's.

## Step 2, second part: the night (22 November 2026)

Colin, 22 November 2026, as the first part was looked at: "the ultimate goal is the most realistic game ever made",
with Jedi: Fallen Order's detail as the floor, and "i would FAR prefer quality over quantity".

Standing on the beach after the end of twilight, the sky is the night over that beach at the world's clock's
instant: the catalogue's 9,096 stars where they are, as bright and as coloured as they are, coming out one by one in
twilight in the order the eye finds them; the Milky Way and every star too faint for the catalogue, with the
Magellanic Clouds and the Coalsack; the zodiacal light and the airglow, which keep a moonless sky from black; the
planets where the clockwork puts them; the Moon's light on the land, in the air and on the sea, its disc of its true
size and phase; and the eye that sees it, which loses colour and gains blue as it darkens.

**It is behind the switch, as the first part is:** `?sky=true`, and nothing changes without it. One more word for
whoever is judging: `&stars=light` draws each star as its light falls on its pixels, through the same curve as the
sky (as a camera would record it), instead of by the eye's thresholds (below, "The eye at night").

| file | what it is |
|---|---|
| `solar/night.js` | the night as numbers: the photometric zero, the stars' places and colours, the zodiacal light, the airglow, the air's scattering of them, the eye's threshold, the Purkinje shift, twinkling; and the same written out for the GPU (`NIGHT_GLSL`, `NIGHT_EYE_GLSL`) from the same constants |
| `solar/stars.js` | the Yale Bright Star Catalogue as 9,096 x 7 numbers, brightest first. Generated (`scripts/solar/stars.mjs`, byte for byte) |
| `solar/milkyway-cube.jpg` | the Milky Way and every star too faint for the catalogue, in true units: six faces of 512 texels, 411 KB. Made by `scripts/solar/calibrate.py`, `texture.py` and `cube.py` (it comes out byte for byte from the floats `texture.py` writes) |
| `solar/milkyway.js` | the texture's numbers, and the same light in 5-degree cells for the page's own thread (the eye's meter, the light on level ground) and the tests. Generated (`scripts/solar/milkyway.py`) |
| `solar/daylight.js` | now also the Moon, the planets, the night's glow, the key light and the whole sky's light on level ground; the Sun's own numbers (`sky`, `direct`, `level`, `toward()`) are as they were |
| `../sky.js` | draws it: the night in the dome, the air and the sea, the Moon's sky table, the stars' and planets' points, the eye |

### One zero for the night

Every light at night is on the Sun's own scale: a light of V magnitude m gives E(m) = E_sun(1 au) 10^(-0.4 (m + 26.74))
lux above the air (air.js's Sun, and the clockwork's magnitude for it). A surface brightness of one S10, one star
of V = 10 to the square degree (27.78 V mag to the square arcsecond, the unit the night sky's references use), is
E(10) over a square degree. So the stars, the planets, the Moon, the Milky Way, the zodiacal light and the airglow
are all in the same lux and cd/m2 as the day, through the same air, into the same eye.

### The stars

- **The catalogue**: D. Hoffleit and W. H. Warren Jr., The Bright Star Catalogue, 5th revised edition (Yale
  University Observatory, 1991; CDS V/50), from the copy the Smithsonian Astrophysical Observatory's Telescope Data
  Center keeps, read as text. 9,096 stars (the 14 entries without a place left out): J2000 place, proper motion,
  V, B-V. 310 faint stars have no B-V; it is guessed from the spectral type (the main sequence's colours, the
  giants' for K and M), moved by the mean difference over the 8,755 stars that have both (within 0.12 mag for 68 in
  100). The catalogue's own places are good to about an arcsecond.
- **Where each is**: its J2000 direction moved along the sky by its proper motion (years of TT since J2000.0),
  leaned by the eye's motion (the Earth's round the Sun, 20.5 arcsec at most, and the island's round the Earth's
  axis), turned onto the horizon by the clockwork's `horizonMatrix` (precession, nutation, sidereal time) and lifted
  by the clockwork's refraction. On the GPU: the direction at the epoch is computed once (again if the clock moves
  half a year), the eye's motion and the turn are uniforms every frame, the lift is worked out per star.
- **How bright and what colour**: E(V), through the air's own transmittance table along its line (so a low star is
  dimmed and reddened as the setting Sun is), twinkling; its colour from B-V as a black body of C. A. L.
  Ballesteros' temperature (EPL 97, 34008, 2012), taken through the CIE 1931 colour-matching functions (the fit of
  C. Wyman, P.-P. Sloan and P. Shirley, JCGT 2(2), 2013) and balanced to sunlight as white (B-V 0.65 is 5,778 K).
- **Twinkling**: the air mass to the 1.75th power (A. T. Young's 1967 law); its size for an eye is chosen, since
  the law and the measurements since (D. Dravins et al., PASP 109, 173, 1997) are for telescopes: a tenth at the
  zenith, held under a half; low down the three colours flicker apart. The planets do not twinkle.
- **The planets** are points of the clockwork's apparent place and magnitude (Mallama and Hilton) and of their
  measured colours (`bodies.js`), placed twice a second; Uranus and Neptune are there for whoever can find them.
  By the same thresholds Venus can be found by day, as it can: at noon on 21 November 2026, 51 degrees up at V
  -4.9, it stands 0.4 magnitude over the eye's threshold in that sky, a faint point.
- **Nothing passes in front of the Moon or the Sun**: a star behind either disc is not drawn.

### The Milky Way and what the eye cannot resolve

NASA/Goddard Space Flight Center Scientific Visualization Studio's Deep Star Maps 2020 (svs.gsfc.nasa.gov/4851,
Ernie Wright; Gaia DR2: ESA/Gaia/DPAC), credited as the SVS asks. Its two maps (the Hipparcos and Tycho stars; the
Gaia DR2 stars fainter than those) were put on the catalogue's own photometric scale by measuring 1,249 isolated
unclipped stars of V 4.5 to 6.5 in them (`calibrate.py`); the catalogue's stars were cut out (they are drawn as
points); the Gaia layer, which the map draws 2.6 mag too bright against its own bright stars (the Magellanic Clouds'
known totals say so), was dimmed by that; the faint stars, below what the eye resolves at night, were softened to a
quarter of a degree and the Gaia grain to 8 arcmin, evenly on the sphere (`texture.py`). The light is kept in S10 in
three colours, each channel log-encoded in 8 bits (S10 = C0 (exp(byte / 255 LN) - 1)), as a cube map with a 2-texel
gutter round each face so that a look-up never needs its neighbour (`cube.py`: no pinch at the poles, no seams; within
1.6% of the floats in the median). On the GPU it is read with its bytes as they are (no colour conversion), decoded,
and dimmed by the air along each look; a look is taken back to where its light comes from (the air lifted it) before
it is looked up. Against Leinert et al.'s references the totals are inside their own spread (the high latitudes a
little faint, the plane a little bright: the map draws a star as its flux to the 0.8th power).

### The zodiacal light, the airglow, and the air's scattering of them

- **The zodiacal light**: Ch. Leinert et al., "The 1997 reference of diffuse night sky brightness" (A&AS 127, 1,
  1998), Table 16 (Levasseur-Regourd and Dumont's measurements, brought up to date): S10 at 500 nm by the difference
  of ecliptic longitude from the Sun and the ecliptic latitude, 60 at the ecliptic pole, the Gegenschein opposite
  the Sun. Its blanks within 15 degrees of the Sun are carried on along their rows (only ever under the horizon or in
  twilight). Its colour is sunlight a little reddened (their equation 22). On the GPU, a 37 x 19 table of 5 degrees.
- **The airglow**: the upper air's own light, from about 90 km. Its zenith brightness and its colour are both worked
  out from the typical nightglow of Leinert's Table 13 ([OI] 557.7 nm 250 R, Na D 65 R, [OI] 630.0 and 636.4 nm 80 R,
  a pseudo-continuum of 0.3 R/Å from 400 to 700 nm): photons to watts to lumens, 139 S10 at the zenith, a faint green.
  Edge-on it is brighter as P. J. van Rhijn has it (Leinert's equation 13); it is seen through the air under it.
- **The air's scattering of them**: the air scatters the night's own glow as it scatters sunlight, and toward the
  horizon this outshines what comes straight through (Leinert's section 5: 10 to 100 S10). Worked out as their
  section 5.1 does for the airglow: a source of unit radiance over the whole sky above the air, scattered once by the
  same air (Rayleigh, haze and ozone, the same phase functions), times their factor for scattering more than once
  (Table 7), kept for 32 heights of a look; the light that comes is that times the glow's mean over the dome.

### The Moon's light, and the key light

- The Moon's light is its magnitude (the clockwork's phase law, within 0.02 mag of Horizons) on the zero above, its
  colour sunlight reddened (B-V 0.92, as a black body), through the air along its line, by how much of its disc
  clears the horizon. Its light in the air is the Sun's method with the Moon as the light: a sky table of its own
  where its light in the air counts, made again when it has moved a hundredth of a degree; its light in the air
  between the eye and the land; its sky's light on level ground from the same kept irradiance as the Sun's.
- **The key light** is whichever light that comes straight gives most: the Sun, else the Moon, else a planet (Venus
  or Jupiter on a moonless night, a faint key). The island turns its one directional light that way, the rooms'
  patches of light follow it, the sea's glitter is its, and the eye's veil is round it (by how much of its disc is in
  sight: the seven marks are now the key's).
- **The Moon's disc**, until its sphere is made (the next part): a plain disc of its true size and place (with its
  parallax: up to a degree), lit on the side toward the Sun as a sphere is (the terminator from the true direction
  of the Sun as seen from the Moon), its lit part of the mean luminance its light gives over that part. It hides what
  lies beyond the air (the Milky Way, the zodiacal light, the stars); the air's own light lies over it.

### The eye at night

- **The adaptation** is the first part's (the meter of fifteen looks, a brighter scene followed half-way in 0.35 s
  and a darker in 1.7 s), now reading the whole sky: the Moon's, the night's glow. The real eye takes twenty to
  thirty minutes to the dark; a game cannot leave a player blind for that long after a lit room, so the times are a
  game's: the eye is felt adjusting for a few seconds. Under a moonless sky the meter reads 3.0 to 3.3e-4 cd/m2.
- **The key under rods alone.** Krawczyk's key is flat below about 0.1 cd/m2: it drew every night, moonless or
  under a full Moon, at about 3% of white, and a moonless sky came out brighter on the screen than a moonlit one
  (measured on the GPU at the same place, 38 degrees up: 3.5% of white against 2.1%; under the Moon the eye is
  adapted to the lit land, and the sky is darker than the land). Rods do not adapt completely: in Hunt's model of
  colour vision (R. W. G. Hunt, The Reproduction of Colour, 6th ed., 2004; M. D. Fairchild, Color Appearance Models,
  2nd ed., 2005, ch. 12) their adaptation factor in the dark grows as the sixth root of the light and their response
  as its 0.73th power, so their response to the level they are adapted to goes as L^0.12: a night thirty times
  darker is a third less bright to an eye wholly used to it. A screen's lightness goes as the cube root of its
  light (CIE L*), so the key below 10^-2 cd/m2 (rods alone: Jensen's rod share is 0 there) is Krawczyk's value at
  10^-2 times (L / 10^-2)^0.365. A moonless night's level is drawn at 0.93% of white (it was 3.0%), a full Moon's
  night keeps 3.5%. My reading of the model (T-II): Hunt's numbers are measured, putting them to a screen's
  lightness is mine.
- **The Purkinje shift**: under rod vision colour goes and what is left leans blue. H. W. Jensen, S. Premoze, P.
  Shirley, W. B. Thompson, J. A. Ferwerda and M. M. Stark, "Night rendering" (University of Utah, UUCS-00-016, 2000),
  the method their SIGGRAPH 2001 "A physically-based night sky model" is tone-mapped with: the scotopic luminance
  V = Y (1.33 (1 + (Y + Z) / X) - 1.68) (G. W. Larson, H. Rushmeier and C. Piatko, 1997), a rod saturation running
  from 0 at 10^-2 cd/m2 to 1 at 10^0.6, the chromaticity moved toward x, y = 0.25, 0.25 and the luminance toward
  Y / V of white times V. Each pixel is judged at its own luminance but never below the eye's adaptation (an eye
  adapted to day sees no dark corner with rods). It is the first step of the curve every material ends with: by day
  it does nothing.
- **How a point is shown**: a star cannot be drawn as its light in its pixel. A pixel is two arcminutes; an eye at
  night gathers a point's light over a third of a degree (Ricco's area), so a sixth-magnitude star drawn as its light
  stands thirty times above the sky in its pixel and every star of the catalogue glares alike (`&stars=light` shows
  it). So each star is shown by how many of the eye's thresholds it stands above the sky behind it (J. A. Ferwerda, S.
  N. Pattanaik, P. Shirley and D. P. Greenberg, "A model of visual adaptation for realistic image synthesis",
  SIGGRAPH 1996, match thresholds the same way): the threshold is B. E. Schaefer's fit to H. R. Blackwell's
  measurements (J. Opt. Soc. Am. 36, 624, 1946), from his program for the visual limiting magnitude (Sky & Telescope,
  May 1998), I = c1 (1 + sqrt(c2 B))^2, against the sky's true luminance at the star (the twilight's, the Moon's, the
  night's, a veil's), never below the eye's adaptation; a star at k thresholds is drawn at k of the screen's own
  thresholds for a point (a chosen 1.2% of white in its middle pixel on a dark screen, 12% of what is round it on a
  bright one: the viewer's, not the world's). So in twilight the stars come out one by one in the order the eye finds
  them, the brightest first; a bright Moon or a lit torch puts the faint ones out; and the count and the spread of
  brightness at night are the eye's. The cones see a point's colour only well above the rods' threshold: a star's
  colour comes in between ten and a hundred thresholds, and fully in day vision (a faint star is white, Antares red).
- **The splat**: each point's light is a Gaussian of 0.65 pixels laid over the pixels round its exact place, each
  pixel taking what falls on its own square (an error function), so its total does not change as it moves across
  them: it neither swims nor flickers as the eye turns. What it adds is worked out on the screen's own numbers (the
  sky there as drawn, and the same with the point in it), so it adds to the picture as light adds to the sky.
- **The veils**: the key light's, as the Sun's in the first part (to 60 degrees, or where it falls under a
  two-hundredth of the sky's brightness as shown); and the eight brightest points' (the planets, the brightest
  stars), from 0.1 degree (the equation's domain) out, in the sky only.

### On the GPU

- What changes slowly across the sky (where each look's light comes from on the J2000 equator, with the air's lift
  undone by G. G. Bennett's formula, and the zodiacal light there) is worked out at the dome's 10,242 corners, two
  degrees apart; what does not (the Milky Way's texture, the air's transmittance, the airglow's growth) per pixel.
- The dome is drawn after everything solid (it lies at the far end of the depth), so the GPU skips every pixel the
  land covers. The first part drew it first; at the pixel cap the night's per-pixel work made it the whole cost of a
  frame (a moonless night took 19.3 ms a frame with it drawn first and every part per pixel, 16.7 without the dome).
- The stars and planets are one set of 9,103 points; each point's vertex works out the sky behind it (the same
  functions as the dome's), its thresholds and its colour; its pixels only lay the light.
- The night's glow is skipped where the exposure makes it a hundred-thousandth of white (by day), the Moon's table
  where its light in the air is under a thousandth of the sky's, the Sun's table at night.

### What was measured

`node test/night.test.mjs` measures and prints these (no GPU), and fails if a line here stops being true.

- One zero: a light of V = 0 gives 2.684e-6 lux above the air, one S10 is 8.81e-7 cd/m2, a full Moon (V -12.7) 0.323 lux
- The catalogue: 9,096 stars, 8,404 of them V 6.5 or brighter; all of them together V -4.96
- Star places against ERFA (atco13, IAU 2006/2000A), 49 places of Sirius, Canopus, Acrux and Achernar above the horizon on four nights: worst 0.047 arcsec; with the air's lift above 10 degrees, 9.5 arcsec (two models of refraction); Sirius' proper motion since 2000, 36 arcsec; the Earth's motion, 20.7 arcsec
- The Milky Way's texture: 411 KB, six faces of 512 texels; its brightest texel (RA 270.1, Dec -28.9) decodes to 1240 S10, 0.00109 cd/m2 (20.0 V mag/arcsec2); the north galactic pole's cell 16 S10
- The zodiacal light (V): 61.5 S10 at the ecliptic pole, 207 on the ecliptic 90 degrees from the Sun, 184 opposite it (the Gegenschein), 1987 30 degrees from it
- The airglow from Leinert's Table 13 lines: 1.23e-4 cd/m2 at the zenith, 139 S10, colour 0.93, 1.07, 0.55 (red, green, blue over its luminance); 6.0 times brighter edge-on
- The air scatters the night's glow toward the eye: 0.081, 0.099, 0.151 of its mean at the zenith (red, green, blue), 0.29, 0.32, 0.37 at 5.7 degrees
- 15 December 2026, 00:00 (UTC+11): the zenith 2.14e-4 cd/m2 (243 S10, 21.81 V mag/arcsec2): the Milky Way 27 S10 (5-degree cells), the zodiacal light 72, the airglow 139 (83% of each through the air), scattered 45; on level ground 9.68e-4 lux, 6% of it from the catalogue's stars
- 15 July 2026, 22:12 (UTC+10:30): the zenith 5.83e-4 cd/m2 (661 S10, 20.73 V mag/arcsec2): the Milky Way 459 S10 (5-degree cells), the zodiacal light 140, the airglow 139 (83% of each through the air), scattered 47; on level ground 0.00106 lux, 5% of it from the catalogue's stars
- 15 December: 4,758 of the catalogue's stars above the horizon; under the zenith's sky the eye's limit is V 6.52, and about 3,276 stand over it
- 15 July: 4,555 of the catalogue's stars above the horizon; under the zenith's sky the eye's limit is V 5.93, and about 1,650 stand over it
- The faintest point seen (Schaefer): V 6.60 under a sky of 22 mag/arcsec2, 3.56 at the end of civil twilight (0.42 cd/m2), -0.44 at sunset (158 cd/m2)
- Stars coming out on the evening of 15 April 2026 (UTC+10:30), each with the Sun's height when it does: Sirius (V -1.46) 0.4°, Canopus (V -0.72) -0.1°, Rigel (V 0.12) -2.1°, Procyon (V 0.38) -2.1°, Betelgeuse (V 0.5) -2.8°, Alpha Centauri (V -0.01) -2.8°, Achernar (V 0.46) -3.2°, Hadar (V 0.61) -3.5°
- The Purkinje shift (Jensen et al.): rod vision under 0.01 cd/m2, cone vision over 3.98; a white under rods goes to x, y = 0.29, 0.28 (their paintings' mean), its luminance kept (k = 0.389, Y over V for sunlight)
- The eye's key (the scene value of the level it is adapted to): 3.2% of white at 0.01 cd/m2, below which rods alone see and it falls as the light to the 0.365 (Hunt's rods: their response to their own level as its 0.12th power, taken to the screen's lightness, the cube root); a moonless night (3.3e-4 cd/m2) 0.93% where Krawczyk's flat key gave 3.0%, a full Moon's (0.025) 3.5%; the floor 2e-4 cd/m2 at 0.77%
- Twinkling (its spread in the light's logarithm): 10% at the zenith, 34% at 30 degrees, 50% at 10
- A point at the eye's limit is shown 2.5% of white over a dark sky in its middle pixel, at ten thresholds 3.16 times that (the power 0.5), Sirius at night (1147 thresholds) at 85%; its light is a Gaussian of 0.65 pixels, 31% of it in the middle pixel when centred, its total the same wherever it falls
- The full Moon of 24 November 2026, 13:00 UTC (32.4 degrees up): V -12.77, 0.344 lux above the air, 0.245 facing it through the air, 0.162 on level ground (its sky 0.0303 of that); colour 1.10, 0.99, 0.82

**On the GPU** (the M2's own chip, headless Chromium on Metal; not in `npm test`):

- The night's glow as the dome draws it, against night.js, at twenty directions from the zenith to 5 degrees up:
  within 1% away from the Milky Way, up to 12% on it (night.js reads the Milky Way in 5-degree cells, the GPU its
  texture).
- The chain from the night's light to the screen (the exposure, the Purkinje shift, the curve), point by point
  against what the pixels hold: 0.98 to 1.02 wherever the sky is seen.
- 15 July 2026, 22:12 (UTC+10:30), the galactic centre 87 degrees up. The brightest place within 15 degrees of it
  (l 1.5, b -2.5: the Sagittarius cloud by Baade's window) is 1,299 S10 in the sky, the darkest sky 25 to 45 degrees
  from it (l -20, b -35, 53 degrees up) 288 S10, of which the zodiacal light (96 to 147 S10 here: July's midnight
  sky lies near the Gegenschein) and the airglow (140 to 186) are most: 4.5 times. Drawn 3.97 times (2.6% and 0.65%
  of white, sRGB 46 and 20): the rods see the Milky Way's yellower light a tenth less, as they should. The centre's
  own direction lies in dust: 417 S10, 1.45 times the dark sky.
- A moonless night on the beach (15 December, midnight): the meter reads 3.0 to 3.3e-4 cd/m2 and the key is 0.92%
  of white; the sky 38 degrees up is drawn at 1.0% of white (sRGB 26, 24, 32), the white sand (it gives back 65%)
  at 0.45%, the basalt at 0.13%. The same place under the full Moon of 24 November: the sky 2.1%, the sand 6.1%.
  With Krawczyk's flat key the moonless sky had been drawn at 3.5%, brighter than the moonlit one.
- Stars in the picture toward the south celestial pole (2940 by 1912 pixels, the ring left out): 573 points stand 8
  or more sRGB steps over the sky round them, 390 by 20 or more, 35 by 50 or more. With `&stars=light` 547, 542 and
  536 (314 by 100 or more): as many seen, every one of them bright.
- Frames at the pixel cap (2940 by 1912, vsync on): 16.7 ms with the switch on and off, standing, walking, turning,
  looking up and facing the full Moon; at dusk under a gibbous Moon 17.9 ms in the mean, 33 ms at the 95th
  percentile. Without vsync, standing at moonless midnight: 20.3 ms on, 13.4 off. The lighter path (1470 by 956)
  and a phone's size (390 by 844 at 2): 16.7 ms on and off. On battery (68%), not throttled, and measured before
  the key under rods and the points' scale were set (they change constants, not work). The passes: the sky's table
  0.48 ms, the wrapped sky 0.30, the air 0.03, the Moon's table 0.03.
- With the switch off: no file of the sky's is fetched and no true sky is drawn. Walked under the night (the
  beach, a house built and walked into, a ship called and sailed, the full Moon from its deck, the body flown at
  dusk, the void and back): no error.

### What is approximated at night

- **The Milky Way's last half magnitude**: the faint layer runs a little faint at high galactic latitudes and a
  little bright in the plane (the map draws a star as its flux to the 0.8th power). No diffuse galactic light (the
  dust's scattered starlight, a fifth of the plane's light) and no light from beyond the Galaxy.
- **The zodiacal light** is the yearly mean (it changes a few percent as the Earth crosses the dust's plane, and with
  its distance from the Sun), and reddened as at 90 degrees from the Sun everywhere.
- **The airglow** is the typical night's, uniform: no solar cycle (it varies by a third either way), no patches, no
  waves, no fading through the night; the OH bands' share of the visible red is not in it.
- **The air's scattering of the night's glow** takes that glow as uniform over the sky (Leinert's own approximation
  for the airglow), at its mean with each direction weighted by how much of its light gets down to the low air, for
  an eye on the beach; in front of the land it is the horizon's, by how much of the way's light the air takes.
- **The eye's threshold** is the average observer's who knows where to look (Blackwell's 50% detection), for any
  colour of star; the screen's threshold for a point is chosen; no averted vision, no loss of acuity at night (the
  rods' blur, Jensen's edge-keeping blur) and no star spikes.
- **The points' scale**: a point is drawn by its thresholds to the 0.5th power from 2.5% of white (Stevens' exponent
  for points), so the whole range from the faintest star to Sirius fits on the screen without white-clipping; but a
  screen's point is seen by the same law, so the bright end looks flatter than in life (Acrux at night is 30% of
  white in its middle pixel). The points are sharp (a Gaussian of 0.65 pixels) with the eye's veil for the eight
  brightest only; an eye sees a bright star larger, by the scatter in it: a halo for every bright star, by the same
  glare function, is owed.
- **The eye's key under rods** is my reading (T-II): Hunt's rods are measured; taking their response to a screen's
  lightness by the cube root is mine.
- **Twinkling** is chosen in size (above), and drawn as smooth noise of a few hertz per star.
- **The Moon's disc** is plain, as said; no earthshine on its dark part; its veil and its sky are right in the mean.
- **Venus' light** is the key light when it is the brightest, with no shadow (nothing casts one yet).
- **Refraction** is the clockwork's Saemundsson formula, which differs from ERFA's model by up to 9.5 arcsec above 10
  degrees (both far under a pixel).

### What the Moon's part needs from here

- **The disc** is drawn in `sky.js` `DOME_FRAG` ("THE MOON, for now a plain disc"): its place (`uMoonTrue`), size
  (`uMoonRad`), the direction of its light (`uMoonLit`) and its mean luminance (`uMoonDisc`) are there; the face
  wants `subLon`, `subLat` (its librations), `axis - zenith` and the LRO maps, a lunar reflectance law in place of
  the plain mean, and earthshine from the Earth's phase seen from the Moon.
- **Its light** is done: its sky table, its light in the air between eye and land, on level ground, as the key, its
  veil, its glitter on the sea (the sea's mirror is the fourth part's).
- **The switch**: the true sky comes out from behind `?sky=true` when the Moon's face is made and looked at.

## What the tests cannot check, and what is rough

- **The Earth's real rotation.** The clock is UTC. UT1 - UTC (under 0.9 s) is not known ahead and is not in the
  model: the whole sky is turned by up to 13.5" from the true one. Polar motion (0.3") is left out.
- **The future of the clock.** No leap second has been announced since 2017; the table holds 37 s. If the Earth
  drifts, the table needs a line. Before 1972 the clock is read as UT1 with Espenak and Meeus' Delta T.
- **The fits are for 1900-2100.** The giants' corrections, the Moon's three numbers and every orbit in
  `orbits.js` were fitted to JPL across those two centuries. Outside them the planets and the Moon wear slowly
  (measured, above); the moons and dwarf planets are unmeasured.
- **The giants' own wobble.** VSOP87's giants are their systems' centres of mass; the corrections were fitted
  to the planets' centres, so the planet's slow offset is in, but its swing round the centre of mass with each
  moon's orbit is not: up to about 300 km for Saturn (Titan), 250 km for Jupiter. It is inside the numbers above.
- **Mars' brightness** lacks its markings (0.06 mag). **Saturn's** uses the ring formula only inside the
  geometry the paper gives it for (seen from the Earth); from elsewhere it is the globe alone.
- **Eris, Haumea, Makemake** have no adopted rotation (`pole: null`; `orientation()` throws) and are carried
  as spheres of JPL's mean radius. Haumea is in truth a long ellipsoid with a ring.
- **The air** is one standard formula for one standard atmosphere, thinned with height. The horizon's dip from
  a height, and the air's bending of light seen from orbit, are not in it.
- **TDB is taken as TT** (under 2 ms apart), and light time is reckoned in the Sun's frame, which the planets
  swing by under 16 m/s: under a millisecond of light time out to Neptune.
- **Not tested at all:** the bodies' rotation other than through the twelve bodies in the observer table (the
  other moons' models come from the same kernel by the same code, and are checked only for their poles);
  `velocity()` beyond its size; anything in a browser.

## What is owed

Named so that nothing unmeasured is taken for done:

- **Ceres**, and with it the asteroid belt, the comets and the Kuiper belt. A fit of the same kind as the
  moons' left Ceres 36" (70,000 km) off with forty terms: Jupiter pulls it about too richly for a small theory.
  It is not shipped. It wants a proper treatment (step 6).
- **Colours** for everything but the eight planets, whose colours are computed from three measured albedos.
  The Moon's and the moons' will come from their real maps when each world is made.
- **Magnitudes** of the moons and dwarf planets; Mars' markings.
- **Atmospheres** of Titan and Triton (not on NASA's fact sheets; not typed from memory).
- **Haumea's shape and ring; the three outer dwarfs' rotation; their moons.**
- **The stars past the eye's reach.** The catalogue's 9,096 are drawn (step 2's second part); a point layer of
  Tycho-2 or Gaia for a telescope's view, and the stars' names, are owed.
- **UT1.** A short table of UT1 - UTC for recent years would take the last 11" out of the sky for the present.
- **Relativity's small things**: the planets' own bending of light, TDB - TT.

## How it is made

Everything generated is made by `scripts/solar/`, from sources read as text and never run. The raw downloads are
not in the repository; the fixtures and the fits are.

| what | from | how |
|---|---|---|
| the planets | VSOP87B: P. Bretagnon and G. Francou, A&A 202, 309 (1988); IMCCE's files `VSOP87B.*` | a term is kept if it can move its planet by 3e-8 rad (Mercury to Mars) or 5e-8 rad (the giants) within a century of J2000, then rounded to the figures its size needs |
| the giants' correction | JPL DE441 through Horizons, 600 dates | VSOP87's constants are from DE200 (1980): Neptune was 2.4" off. In each of longitude, latitude and distance: a constant, a rate, and one sinusoid for each argument: Jupiter's mean longitude for Jupiter; Saturn's for Saturn; for Uranus its own, Uranus minus Neptune and twice that; for Neptune its own and Uranus minus Neptune. Least squares. Kept apart in the file (`fix`) |
| the Moon | ELP 2000-82B: M. Chapront-Touzé and J. Chapront, A&A 124, 50 (1983) and 190, 342 (1988); IMCCE's `ELP1..ELP36` and the subroutine `elp82b_1`, ported | the terms that can reach 5e-8 rad (or that fraction of 384,400 km) |
| the Moon's correction | DE441 through Horizons, 600 dates | three numbers added to its mean longitude: -0.0326", -0.3744" a century, -0.9545" a century squared (the last is the tidal acceleration, which DE200 had differently). The whole theory was 1.4" from DE441 before; 0.4" after, cut |
| the moons and the far dwarfs | Horizons: MAR099, JUP365, SAT441, URA184, NEP098, PLU060; DE441 and JPL's small-body solutions | below |
| pull, size, rotation | NAIF `gm_de440.tpc`, `pck00011.tpc` (the IAU WGCCRE 2015 report: B. A. Archinal et al., Celest. Mech. Dyn. Astr. 130, 22, 2018) | read as text |
| albedo, air, rings | NASA's planetary, satellite and ring fact sheets (D. R. Williams, NSSDCA); JPL SSD "Planetary Physical Parameters" for Eris, Haumea, Makemake | copied into `scripts/solar/bodies.mjs`, each beside its source |
| the planets' colours | A. Mallama, B. Krobusek and H. Pavlov, Icarus 282, 19 (2017), table 7 | the geometric albedos at 623, 551 and about 460 nm as red, green and blue, the largest set to one, in sRGB's encoding: the planet under sunlight taken as white |
| magnitudes | A. Mallama and J. L. Hilton, Astronomy and Computing 25, 10 (2018), equations 2 to 17 | as published |
| the clock | IERS leap seconds as the IANA time zone database lists them; F. Espenak and J. Meeus, "Polynomial expressions for Delta T" (NASA eclipse web site) | as published |
| the Earth's turning | precession IAU 1976 (Lieske), nutation IAU 1980 (the 18 terms above 0.005"), sidereal time IAU 1982; refraction by Saemundsson's formula: as J. Meeus gives them in Astronomical Algorithms | typed from the standard tables, and held by the comparison with Horizons rather than by a second reading |
| the eclipse | "Eclipse Predictions by Fred Espenak, NASA's GSFC": the path of 8 April 2024 | the published numbers, typed into the test |

**The moons.** JPL publishes mean elements for the moons, with periods to four or six figures: enough to say
what an orbit is like, not where a moon is tonight (Phobos would be a fifth of an orbit off within a year). So
each orbit in `orbits.js` is a small theory of the shape those tables have: a mean longitude with a rate, a
square and slow sinusoids that may also breathe the radius; an eccentricity vector and an inclination vector
that are each a sum of uniformly turning modes; a plane whose pole may drift. It is fitted to Horizons' vectors at
1,800 random dates, starting from JPL's table and the IAU's rotation rates (these moons keep one face to their
planets, so the rotation rate is the mean motion), on windows widening from ten days to two centuries so the fit
never loses count of the turns; then terms are added one at a time where the leftovers show a period, each kept
only if it also helps at dates held back; then it is measured at 300 dates it never saw. One ellipse alone
leaves Ganymede 0.19° off, Enceladus 0.46°, Mimas, which swings 43° either way over 70 years with Tethys, not at all.
The dwarf planets are fitted the same way about the solar system's centre of mass, where their paths are smooth;
Pluto's orbit is the orbit of Pluto and Charon's own centre of mass, 2,100 km from Pluto's.

**To make it all again** (the downloads go in folders of their own; the fits take an hour and a half of one core):

```
node scripts/solar/series.mjs <VSOP87B folder> <ELP folder> <Horizons cache> src/game/solar
node scripts/solar/orbits.mjs fit <kernels folder> <Horizons cache> scripts/solar/fits.json
node scripts/solar/orbits.mjs write scripts/solar/fits.json src/game/solar
node scripts/solar/bodies.mjs <kernels folder> src/game/solar <the ids, comma separated>
node scripts/solar/fixtures.mjs <Horizons cache> test/fixtures/solar
node scripts/solar/light.mjs
```

`series.mjs` and `orbits.mjs write` were run again from the repository's own copies and gave the committed files
byte for byte; `orbits.mjs fit` was run again for three orbits and gave the same numbers.

**The night's data** (step 2's second part), from downloads kept in folders of their own and only read (Python:
numpy, pyerfa, OpenEXR, Pillow; run with `python -I`):

| what | from | how |
|---|---|---|
| the stars (`stars.js`) | D. Hoffleit and W. H. Warren Jr., The Bright Star Catalogue, 5th revised edition (Yale, 1991; CDS V/50), the copy at tdc-www.harvard.edu/catalogs/bsc5.dat.gz | `node scripts/solar/stars.mjs <bsc5.dat> src/game/solar/stars.js`: made again, byte for byte |
| the Milky Way (`milkyway-cube.jpg`) | NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020 (svs.gsfc.nasa.gov/4851; Gaia DR2: ESA/Gaia/DPAC): `hiptyc_2020_4k.exr`, `milkyway_2020_4k.exr` | `calibrate.py`, then `texture.py`, then `cube.py` (which gives the committed JPEG byte for byte from the floats `texture.py` writes) |
| its numbers (`milkyway.js`), the texel fixture | the same | `python -I scripts/solar/milkyway.py <milkyway-s10.npy> <milkyway-cube.json> src/game/solar/milkyway-cube.jpg src/game/solar/milkyway.js test/fixtures/solar/milkyway.json` |
| the star places' fixture | ERFA (pyerfa), the IAU's SOFA library | `python -I scripts/solar/stars-erfa.py src/game/solar/stars.js test/fixtures/solar/stars.json` |
| the zodiacal light, the airglow | Ch. Leinert et al., A&AS 127, 1 (1998), Tables 16 and 13 | typed into `night.js`, each beside its source |
| the eye's threshold | B. E. Schaefer's program for the visual limiting magnitude (Sky & Telescope, May 1998), fitted to H. R. Blackwell's measurements | its constants, typed into `night.js` |

**Licences.** This repository is MIT. What it carries from elsewhere is measurement and published theory, with
its source named where it sits. IMCCE's VSOP87 and ELP directories name the papers and give no licence; the
series here are cut from them and say so. JPL's Horizons, NAIF's kernels and NASA's fact sheets are public
services and documents of NASA and JPL/Caltech, credited above; nothing from them is redistributed whole, only
the numbers used and, in the fixtures, the answers to the questions written beside them. The two papers by
Mallama and others are cited for their published numbers and equations. The Bright Star Catalogue is carried as
the numbers the game uses (seven a star), credited where it sits. The Milky Way's texture is NASA SVS's Deep Star
Maps 2020, reduced to a 411 KB cube map in true units and credited as the SVS asks ("NASA/Goddard Space Flight
Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC."). If a holder of any of these asks for a
different credit or for removal, it is one file each.

## What step 2 needs from here

- `sky(-31.55, 159.08, Date.now(), out, opts)` each frame for the Sun and the Moon (`opts.ids`), every second or
  so for the planets: `east, north, up` to place them; `magnitude` for how bright; `diameter` for the two discs.
- The Moon's picture: `subLon`, `subLat` choose the face; `axis - zenith` turns its north pole from "up";
  `limb - zenith` turns the terminator; `phase` is how much is lit. `BODIES.moon.albedo` is 0.12: it is dark rock.
- The stars: `horizonMatrix(lat, lon, when, out)` once a frame, each star's J2000 unit vector through it, and
  `refraction(alt)` for those near the horizon. A catalogue with positions, V and B-V is owed (the Yale Bright
  Star Catalogue has the 9,000 the eye can see). The Sun's `temperature` (5772 K) and the planets' `color` are
  given as sunlight-is-white; the stars' colours will want the same white.
- The light: a magnitude is a brightness. The Sun at -26.74 and the full Moon at -12.7 are fourteen magnitudes,
  400,000 times, apart: that range is the eye's adaptation, and what twilight has to cross. The Sun's altitude
  gives the kind of twilight (-6°, -12°, -18°).
- The rise: `opts.height` in metres takes the same observer up; the air's lift fades with the scale height in
  `BODIES.earth.atmosphere`.

## Notes kept along the way

- **JPL's mean-element table cannot place a moon**, and the brief had assumed it could. The fit that replaced it
  is the largest piece of work here, and the reason the moons are right.
- **A lattice of dates lies.** The first fits used dates spread by the golden ratio, which is a lattice: on it a
  term of a few days' period and a slow one can look the same. The fits looked three times better at their own
  dates than at dates held back; Titania was 851 km off. Dates drawn at random, and letting terms as short as
  a day in, brought it to 33 km. Every fit that hunts for periods, and every measurement, now draws its dates.
- **Uranus' moons go backwards** round the pole the IAU calls north; the fit starts from the spin pole instead.
- **Horizons' "Uranus" is not DE441's.** A planet's centre comes from its satellite ephemeris, which rides on an
  older planetary one: Uranus' centre and DE441's Uranus system differ by a quarter of an arcsecond. The
  corrections are fitted to the centres, since that is what "where is Uranus" means.
- **The 0.6" that was Einstein.** One row of the observer table had Neptune 0.6" out: it was 0.9° from the Sun
  that day, and the Sun bends light. Four lines, and every row agreed.
- **NASA's eclipse is in its own time.** The path was computed with Delta T = 70.6 s; the Earth has turned as
  69.184 s says. The published UT and longitudes are carried over before they are compared.
- **A full Moon is never quite full**: it passes above or below the Earth's shadow, or there is an eclipse.
- **Where a body is overhead**, the direction's latitude is the geodetic latitude of the place: no conversion.
- **A JavaScript engine boxes numbers** that cross a call it did not inline; "no allocation" can honestly mean
  no arrays and no objects, and the bytes left are measured and said.
- **The records `sky()` fills are the same objects every call.** What is kept from one call must be copied.
- **A picture of the Sun says whether the Sun was in sight.** The true sky's first contact sheet had the Sun 5, 1
  and 0.2 degrees up black through the dark glass. Its whole pictures show no disc anywhere, so it was not drawn in
  that run; but the code committed four minutes before draws it in the same looks, in the same order, through the
  same glasses (tried again on 22 November), and so does every version since, so that run cannot be had again.
  The probes since keep the share of the disc in sight beside every picture of it, and turn the eye 5 degrees
  aside: looking straight at a low Sun, it stands a shoulder's width from the body.
- **A formula's domain is a place in the picture.** The glare equation is defined from 0.1 degrees out; held
  there, its flat top was a bright spot a fifth of a degree across in the middle of the Sun, seen only through a
  dark glass. It is held at the limb now.
