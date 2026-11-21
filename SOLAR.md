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
3. **The seamless rise.** The air's scattering from the beach to space; the Earth as a globe under the island
   (his clean Earth: no city lights), the island at its real place; numerical precision at planetary scale, so
   that a metre on the sand and the distance to the Moon live in one picture without a seam.
4. **The Moon**, the first other world: to fly to, in its real light time of a second and a quarter, and to land on.
5. **Travel in real light time.** The throttle to c; journeys that take the real light time and go on while
   logged off; targets, a map of the system, turning round and rerouting; the universe held still in transit.
6. **The other worlds**, one at a time, each finished before the next begins: real maps, rings, air, the Sun.
   Then the small bodies: Ceres and the belt, comets, the Kuiper belt.

## Where it stands

**Step 1 is built.** `src/game/solar/` is the clockwork: five plain modules with no page and no three in them,
used by nothing in the world tab yet. `test/solar.test.mjs` (22 checks) holds it to the sky.

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
- **The stars.** `horizonMatrix()` is ready to turn a catalogue; there is no catalogue yet (step 2).
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

**Licences.** This repository is MIT. What it carries from elsewhere is measurement and published theory, with
its source named where it sits. IMCCE's VSOP87 and ELP directories name the papers and give no licence; the
series here are cut from them and say so. JPL's Horizons, NAIF's kernels and NASA's fact sheets are public
services and documents of NASA and JPL/Caltech, credited above; nothing from them is redistributed whole, only
the numbers used and, in the fixtures, the answers to the questions written beside them. The two papers by
Mallama and others are cited for their published numbers and equations. If a holder of any of these asks for a
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
