# Frequencies — the dossier

*The room in yearthreethousand where real physics is the invariant: the Great Pyramid of Giza, 1:1, built from loose limestone grains by sound and a binder, with every number set out so that a physicist can check it. Colin asked for it on 9 November 2026; this is what the physics allows, and what it does not. The code is `src/frequencies/` (pure, tested in `test/frequencies.test.mjs`) and `src/frequencies.js` (the room).*

Every figure carries a tier:

- **T-I** — measured, published, or standard physics (a survey, a standard, a textbook law).
- **T-II** — our derivation or model assumption from T-I inputs, named where it is made.
- **T-III** — hypothesis: a claim about what happened at Giza, not established.

## 0. What the room claims, and what it does not

Sound does three things to a bed of loose grains, and all three are in the room:

1. **It moves them along the ground.** Above a threshold level the oscillating air at the surface drags grains as wind does; Bagnold's law gives the rate (T-I).
2. **It heaps them where the air is still.** Between opposed sources a standing wave forms; on the ground the grains gather at the velocity nodes, half a wavelength apart (Kundt's tube, 1866; T-I). Two crossed pairs lay a square lattice. At the Great Pyramid's block module of 1.27 m that is a tone of **135 Hz**.
3. **It packs them.** The oscillating pressure on the bed is an acceleration; above 1 g a granular bed creeps toward random close packing (T-I).

Sound does **not** lift the grains, and the room does not pretend it does: holding a stone grain against gravity in a standing wave needs an antinode level of **163 dB at 20 kHz** and **185 dB at 135 Hz** (Gor'kov, §4.6); air shocks at about 170 dB. Nor does it carry anything up the pyramid: the grains, the water and the natron reach the working course by other means. The blocks are not quarried and not lifted either: they are **cast in place** from the heaped grains and a binder, Davidovits' re-agglomerated limestone, which is a tested recipe (T-I as his 2006 reproduction) and a contested account of Giza (T-III, §7).

## 1. The pyramid, as surveyed (T-I)

W. M. Flinders Petrie, *The Pyramids and Temples of Gizeh* (1883), measured in British inches (1 in = 25.4 mm):

| quantity | Petrie | metres |
|---|---|---|
| mean base side (casing) | 9068.8 ± 0.5 in | 230.35 m |
| original height | 5776 ± 7 in | 146.71 m |
| casing angle | 51° 52′ ± 2′ | tan = 1.274 = 2H/b (consistent) |
| top of surviving masonry (course 203) | 5451.8 in | 138.48 m |
| surviving courses | 203 | |

The level of every course at the N.E. corner is Petrie's Plate 8, transcribed and corrected by Ronald Birdsall (2003; ronaldbirdsall.com/gizeh/errata/levels.html). Each course's thickness is its level minus the one below: course 1 is 58.6 in (1.49 m), course 35 is 49.8 in (1.26 m), the thinnest is 19.7 in (0.50 m); the mean is 26.9 in (0.68 m). The whole array is `COURSE_THICKNESS_IN` in `src/frequencies/pyramid.mjs`. From the top of course 203 to the apex is 8.2 m; the last ten surveyed courses average 0.56 m, so about 15 more courses and a pyramidion stood there (T-II; Petrie's own estimate was about 210 courses in all).

Derived (T-II): volume (1/3)·b²·H = **2.595 million m³**; at 2.3 t/m³, **5.97 million tonnes**; on a 1.27 m plan module with each course's own thickness, **2.04 million blocks** (the usual 2.3 million assumes a smaller average block). The natural rock knoll enclosed in the core reduces all three by an unknown share.

## 2. The stone (T-I where cited, T-II where derived)

- **Core:** Mokattam Formation nummulitic limestone, Middle Eocene, quarried on the plateau itself. It is a bank of *Nummulites gizehensis* tests (lenticular, centimetre-scale) in a calcite matrix, partly dolomitised (Holail 1994). Bulk density of such limestones 2.0–2.6 g/cm³, porosity 5–25 %, compressive strength 15–60 MPa by published ranges; the room uses **2.3 t/m³** for the core (T-II).
- **Casing:** Tura (Helwan) fine white limestone, denser and finer; the room uses 2.5 t/m³ (T-II).
- **The grains of the method:** not the plateau's aeolian quartz sand (medium to coarse, 0.25–1 mm, ≥ 90 % quartz, which would make a quartz block, not a limestone one) but the Mokattam limestone itself, **gently disaggregated in water** (Davidovits): whole and broken nummulite tests (5–60 mm), bioclastic calcite grains (0.1–2 mm), lime mud (< 63 µm). The transport physics in the room is evaluated for the **0.25 mm calcite fraction** (density 2710 kg/m³), the fraction that moves at the lowest level; larger grains need more (§4.4), and the mud is carried by the water.

## 3. The binder: Davidovits' re-agglomerated limestone (T-I as his recipe)

Joseph Davidovits, Geopolymer Institute, published reproduction (geopolymer.org, "Pyramids (3): the formula, the invention of stone"):

- into **2 m³ of water**: **160 kg kaolinitic clay** (at Giza the limestone carries its own clay, so none is added), **60 kg sodium carbonate (natron, Na₂CO₃)**, **80 kg slaked lime (Ca(OH)₂)**;
- the glue mixed by paddle with **4500 kg** of disaggregated nummulitic limestone;
- after drying the stone holds **18–20 % water by weight**; the fossils are intact (the material is disaggregated, not crushed).

The chemistry he gives: Na₂CO₃ + Ca(OH)₂ → 2 NaOH + CaCO₃ (caustic soda from natron and lime); NaOH with kaolinite Al₂Si₂O₅(OH)₄ → hydrosodalite (a feldspathoid) and calcite (the geopolymer binder); carnallite (KMgCl₃·6H₂O) to neutralise the excess alkali → halite (NaCl) and magnesite, which is his account of the halite found in pyramid blocks. Diatomaceous earth may stand in for the clay (Barsoum's reading of the Khufu samples: lime and diatomaceous earth).

Derived (T-II): binder solids (160 + 60 + 80) / 4800 = **6.25 %**. For a **2.5 t block**: 2344 kg limestone grains, 83 kg clay, 31 kg natron, 42 kg lime, 1042 L water at mixing. For the whole pyramid at 5.97 Mt: **75 kt natron, 100 kt lime, 2.5 Mt water**. Strength gain is modelled as S(t) = 20 MPa · (1 − e^(−t / 36 h)) (T-II: an order-of-magnitude curve for an alkali-activated aluminosilicate binder; walkable at 2 MPa after 4 h, 90 % after 83 h). Davidovits gives no curve for his stones.

## 4. The sound (T-I unless marked)

Air at 20 °C, 1 atm, 50 % RH: c = 343.2 m/s, ρ = 1.204 kg/m³, ν = 1.51 × 10⁻⁵ m²/s, β = 1.2. (Giza is hotter and drier: c rises ~0.6 m/s per °C, absorption at low tones changes little.)

### 4.1 Level, pressure, wind

SPL = 20·log₁₀(p_rms / 20 µPa). 94 dB = 1 Pa; **160 dB = 2000 Pa rms**, u = p/ρc = **4.84 m/s rms**, I = p²/ρc = 9.7 kW/m². At a rigid ground the pressure is doubled (+6 dB) and the tangential velocity is doubled; the normal velocity is zero (image method). Dry sand is rigid to tones whose boundary layer is thicker than its pores, which holds below a few hundred hertz (T-II for the bed as rigid).

### 4.2 The horns

- **Mouth:** circumference one wavelength at the cut-off (Olson 1947, Beranek 1954): D = c / (π f_c). **135 Hz → 0.81 m**; 50 Hz → 2.18 m; 1 kHz → 0.11 m.
- **Throat:** the air's limit. Past about **170 dB** at the throat (6.3 kPa rms, acoustic Mach number 0.05) the tone steepens into a shock within metres (§4.3) and the extra drive becomes harmonics and heat (Hamilton & Blackstock, *Nonlinear Acoustics*; horn makers' "air overload"). The room caps every throat at 170 dB.
- **Across the horn** power is conserved: mouth SPL = 170 dB − 10·log₁₀(A_mouth / A_throat). A horn is therefore **sized by its physics**: the tone sets the mouth, the acoustic power sets the throat, A_throat = W / I(170 dB), and an exponential flare of length L = (c / 4π f_c) · ln(A_mouth / A_throat) joins them. **5 kW at 135 Hz:** mouth 81 cm, throat 26 cm, flare 46 cm, **160 dB at the mouth**. 20 kW: throat 51 cm, 166 dB at the mouth.
- **Directivity:** the mouth as Rayleigh's piston, |2 J₁(ka sin θ) / (ka sin θ)|; first zero at ka sin θ = 3.83.
- **Efficiency:** 25 % electro-acoustic (T-II, the middle of the 10–50 % practical range): a 5 kW horn takes ~20 kW in.
- **Absorption:** ISO 9613-1 (1993), the standard's own equations: 0.29 dB/km at 100 Hz, 4.7 dB/km at 1 kHz, 159 dB/km at 10 kHz (20 °C, 50 % RH). At 135 Hz over metres it is nothing.

### 4.3 Shock

x_s = ρc³ / (β ω P), P the pressure amplitude. A 160 dB tone at 135 Hz shocks **16.9 m** out; at 1 kHz, 2.3 m; 170 dB at 135 Hz, 5.4 m. A horn's useful work is within a few metres of it.

### 4.4 When a grain moves

- **Drag balance** (T-II): ½ ρ u² C_d (π d²/4) ≥ μ (ρ_s − ρ) g (π d³/6), μ = tan 34° (the angle of repose), C_d by Schiller–Naumann; solved by iteration. **0.25 mm calcite: 1.46 m/s** of surface wind; 0.1 mm: 0.41 m/s; 1 mm: 5.5 m/s.
- **Bagnold's fluid threshold** (T-I, Bagnold 1941): u*_t = 0.10 √((ρ_s − ρ)/ρ · g d) = **0.232 m/s** for 0.25 mm sand; the free-stream wind at a centimetre's height in a turbulent boundary layer is about eight times u*, which puts the two thresholds within a factor of two of each other.
- The surface wind is twice the incident wave's, so the **incident level** that starts 0.25 mm grains is **143.4 dB** (quartz) / 143.6 dB (calcite).

### 4.5 How much moves

Bagnold's transport law (T-I): q = 1.8 √(d / 0.25 mm) (ρ/g) u*³ kg per metre of front per second. The sound-wind is oscillatory, not a steady boundary layer; the room reads the effective friction velocity as **u* = u_rms / 8** (T-II: the log-law ratio at about a centimetre's height; this is the model's one calibration and the number a wind-tunnel test would correct). At u* = 0.4 m/s: 14 g/(m·s). At the plan's surface wind of 6.6 m/s rms (u* = 0.83): **0.126 kg/(m·s)**, a sandstorm's rate.

Direction: against the gradient of u² — grains leave the loud ground and gather where the air is still (Kundt). In the room's sand engine (`sand.mjs`) each cell above threshold sends Bagnold's flux toward the quiet; the bed's edges are walls; mass is conserved.

### 4.6 Why not lift them: Gor'kov

For a sphere of radius a ≪ λ in a plane standing wave of pressure amplitude P the radiation force amplitude is F = 4π a³ k E_ac Φ, E_ac = P²/4ρc², Φ = f₁/3 + f₂/2 ≈ 5/6 for stone in air (Gor'kov 1962; T-I). Levitation needs F ≥ (ρ_s − ρ)(4/3)π a³ g, so **E_ac ≥ (ρ_s − ρ) g / (3 Φ k)**, independent of the grain's size and ∝ 1/f. Antinode levels: **163 dB at 20 kHz**, 176 dB at 2 kHz, 186 dB at 200 Hz, **185 dB at 135 Hz**. Levitators that hold dense millimetre objects run at 160–170 dB and ultrasound (Xie & Wei 2002, iridium and mercury at ~20 kHz), which is this result. At a block-scale tone no sound in air can hold a grain up; at ultrasound it holds a grain only within a wavelength of the field, since a sand pile absorbs it. So: no levitation, by the physics.

### 4.7 Packing

The surface pressure (twice the incident) accelerates the top layer: a = √2 · 2 p_rms / (ρ_s φ L). With L = 0.1 m (T-II), 160 dB incident is **Γ = 3.8 g**, 150 dB is 1.2 g. Tapped granular beds at Γ > 1 compact slowly toward random close packing, 0.56 → 0.64 (Knight et al. 1995; Nowak et al. 1998; T-I); the room's rate, dφ/dt = 0.05 (Γ − 1)(0.64 − φ) s⁻¹, is a model (T-II).

### 4.8 Repose and cohesion

Dry sand holds 34°. Damp sand (the binder's water) holds a vertical face while it is low; the room allows any drop up to 0.4 m (T-II, the order of a sandcastle's wall), beyond which it slumps as dry sand would, and set stone holds everything.

## 5. The method the room simulates, and its schedule (T-II throughout)

1. On the working course, horns of the 135 Hz lattice stand **shoulder to shoulder along the course's edge** (0.81 m apart, mouths 0.5 m above the bed), aimed across it; opposed lines face each other across the course, and crossed lines lay the square lattice at the block module. Each horn: 160 dB at the mouth, 5.0 kW acoustic, ~20 kW in.
2. The coherent line gives **165 dB at the bed one metre out**: a surface wind of 6.6 m/s rms, u* = 0.83 m/s, Bagnold flux **0.126 kg/(m·s)** across the front. The disaggregated limestone tipped at the edge is carried across the course and heaped into the lattice's ridges: the sand becomes both mould and block.
3. The binder paste is mixed through the cells (Davidovits' basin, §3); the same horns' pressure packs it (Γ ≈ 5 g at 165 dB); it sets (4 h walkable, 83 h to 90 %).
4. The next course.

Per course: front = 4 × side; horns = front / 0.81 m; hours to carry = aggregate mass / (flux × front); plus 83 h to set. **Course 1:** 921 m of front, 1,140 horns, 22.7 MW in, 485 h; **all 218 courses: 4.3 years of continuous sound** at 160 dB mouths (15 years at 155 dB; 74 years at 150 dB; 2.5 years at 165 dB, at the shock limit). The room animates this schedule.

What this schedule leaves out, honestly: carrying 6 million tonnes of grains, 2.5 million tonnes of water and 75 kt of natron up to the working course, which sound does not do; the casing's half-millimetre joints, which cast blocks against neighbours might explain (Davidovits) but which the room does not simulate; the granite of the King's Chamber, which is not limestone and not cast.

## 6. The sandbox

A bed 12 × 8 m of 0.25 mm calcite grains 0.3 m deep in 5 cm cells. Place horns (sized by the tone and the power you set, §4.2), aim them, choose a pair, the lattice, or **a block's lattice** (lines of horns on all four sides at 135 Hz and 155 dB mouths, 1.6 kW each: the plan's working course in small; measured in the engine, the ridges come 1.35 m apart against λ/2 = 1.27 m within 300 s, the bed staying under the 170 dB shock limit; at 150 dB the middle is below threshold and no lattice forms; at other tones the measure is rougher: 67.5 Hz gave 2.75 m against 2.54, and 202.5 Hz read 1.75 m, the second lag of its 0.85 m pitch), pour binder in 1.27 m rounds, tip sand, and let time run at ×1 to ×600. The readout gives the ridge pitch the sand has formed (the height field's autocorrelation peak), beside λ/2. Shown: the sand's height, the level on the bed (110–170 dB), the wind and where it exceeds the grains' threshold; the loudest point and a shock warning past 170 dB; every horn's full specification. The edges are walls.

## 7. The tiers, and the argument about Giza

- Petrie's survey, Birdsall's transcription, ISO 9613-1, Rayleigh, Bagnold, Gor'kov, Kundt, Hamilton & Blackstock, Nowak/Knight: **T-I**.
- Our model choices: core density 2.3 t/m³, the 1.27 m module, the top courses' extrapolation, u* = u_rms / 8, L = 0.1 m, the compaction rate, the strength curve, the damp face: **T-II**, each named where used.
- That the Great Pyramid's blocks were cast: **T-III**. Davidovits (1988, 2006) and Barsoum, Ganguly & Hug (*J. Am. Ceram. Soc.* 89, 2006: silicon-bearing amorphous constituents in pyramid samples absent from six natural limestones) argue for it; most geologists and Egyptologists hold the blocks quarried (natural bedding and fossil orientation in the blocks, the quarries on the plateau, Merer's diary of hauling Tura stone). This room takes no side on history: it shows what sound and the recipe can do to limestone grains, at 1:1, with the numbers open.

## 8. How to check it

`node test/frequencies.test.mjs` pins every function to the values above: 94 dB = 1 Pa; ISO 9613-1 at 1 kHz; J₁'s maximum and the piston's first zero; the mouth rule; power conservation across a horn; the shock distance; Bagnold's threshold and flux; Gor'kov's levitation levels and their 10 dB per decade; Γ; the field's +6 dB at the ground and −6 dB per doubling; the standing wave's minima half a wavelength apart; the sand engine's threshold, sweeping, mass conservation, damp face, set stone and packing; Petrie's base, height, angle and courses; the derived volume, mass and blocks; Davidovits' recipe and its scaling; the lattice tone and the schedule's behaviour; and the horn sizing; and, for the room in the round (§9): the pressure anywhere is the field the sand feels and horns add as phasors; a standing wave heard has its node a quarter wavelength from the middle; a horn on the right is in the right speaker and the four gains are as loud as `played()` says; `played()` is full at 170 dB and halves the decibels; taking sand away digs only its round; the eye's pose, slide, zoom toward a point, settling, keys and floor; the drawing's pixel ratio; the build's state at any time; the working course's horns; and the wiring (three.js loaded only with the room, the tone computed at the camera, every control named, the sky not tone-mapped so that it meets the fog). Sources are named in the code beside each formula.

## 9. The room in the round: what is drawn, and what is heard (17 November 2026)

Colin: *"i'd love to see the simulation as a 3d environment instead of a 2d one, with ability to pan, zoom, etc. highest quality resolution would be nice, and it would also be cool if we could actually hear the frequencies being played and see where each sound is coming from."*

**Drawn.** Both scenes are three-dimensional and at their true size. The pyramid: every course a slab of Petrie's thickness and its own side, jointed on the 1.27 m module; the course being made rises as its aggregate arrives; the plan's horns stand around it at `hornSpec`'s size (an 81 cm mouth at 135 Hz), half a metre above the surface as it rises, on posts from the ledge below, as many on each edge as fit at the plan's spacing. The sandbox: the bed's own heights, one vertex a 5 cm cell, coloured by the engine's state (height, damp, set; or the level, or the wind, with their scales), in a glass tray; each horn at its size, aimed as the model aims it. The sun, the sky and the land round the pyramid are the picture's, not physics (below).

**The waves (T-II: a convention of the picture).** A crest of horn h lies where its phase is a whole turn: r = λ·(frac(τ + φ/2π) + n) from its mouth. Every wave in the room runs on one slowed clock, τ advancing at `WAVE_HZ` = 0.5 cycles a second, so a 135 Hz tone is shown 270 times slower than it is. In the sandbox the crests are spheres about each mouth (drawn as arcs, and as half-spheres while three horns or fewer sound), followed to min(9 m, 4λ) and fading as the root of the 1/r fall so that they can be seen; the pressure on the sand is drawn from the same phasors on the same clock, so the two meet at the surface (on the ground the direct and the reflected path are one length; the reflection is in the sand's colours, not drawn in the air). At the pyramid each line of horns sends its front across the course a wavelength apart, fading out by 1.6 times the shock distance (the tone shocks 9.3 m out at the line's 165 dB); the lattice breathing on the course (cos πx/1.27 m + cos πz/1.27 m) and the ridges at its still lines are the plan's (§5), drawn fading inward from the edge over the shock distance: not a field solved for a thousand horns.

**Heard (T-I the field; T-II two conventions).** What reaches a listener from any number of steady horns at one tone is one steady tone at that tone, with an amplitude and a phase. The room computes it at the camera (`hear` in `acoustics.mjs`: every horn and its image in the rigid ground with their true phases, 1/r spreading, Rayleigh's piston, ISO 9613-1 absorption) and plays exactly that, with two oscillators a quarter turn apart and four gains (`sound.js`). The two conventions: where each horn sits between the two speakers follows how far to the camera's right it lies, at constant power, as a stereo recording places an instrument (no head is modelled; the horns keep their phases, so two that cancel at the camera cancel in the speakers); and the level is compressed for speakers: 170 dB, the throat's limit where air shocks, is full volume, and every 20 dB below it is 10 dB at the speakers (played = (p / p₁₇₀)^0.5). The readout "at your ear" is the field's own level. At the pyramid the listener's height is taken above the working surface and mirrored below it (the pyramid's body does not shadow the sound), and the horns are played throughout, also while a course sets, when in the plan they rest. Rejected: one HRTF panner per horn (forty-two coherent sources blur, it costs, and it loses the propagation phase) and the tone's harmonics (σ ≈ 0.06 at 5 m: the second harmonic is near −30 dB).

**Where the sound comes from, as light (T-II, the picture's).** While the tone sounds, each horn's mouth glows by its own share of what is heard at the camera: its pressure there (the horn and its image, as `hear` gives it per horn) over the loudest horn's, to the power 1.5 so that the ones that carry the sound stand out; the light fades from the mouth to the throat. It follows the physics, directivity included: behind a line of horns its nearest are dim (they face away, at a tenth of their side lobe), and the line across the course, facing the camera, carries more. A small scope beside the level draws the two channels as they are played (the two oscillators' gains), on the slowed clock. A tour turns the eye once round in ninety seconds until a hand touches the stage.

**The course being made (17 November; T-II, the picture's).** While its aggregate arrives the sand is dry, and where the horns' sound reaches (fading inward over the shock distance, as above) it lies heaped in ridges along the plan's still lines a block apart, their faces at dry sand's angle of repose (34°, `DRY_SLOPE` in `sand.mjs`): they rise first, and the cells then fill toward their tops; the low sun shades each ridge's lee. While the tone sounds, grains catch the light where the air moves between the ridges, not on them. Then the binder (§3): the course goes dark and wet and mirrors the sky, and dries to stone over the 83 hours of its set, from its edges inward in ragged fronts, the ridge lines left as the joints between the blocks; the finished course has the same joints. Drawn, not derived: the ridges' height (12 cm at most), how the cells fill, the drying's pattern, the glints.

**The sun (17 November).** A slider sets the hour of the day, by the sun at Giza on 17 November, from before first light to after dusk. Where the sun stands is computed (`sun.mjs`: the declination by Spencer's series, 1971, a few hundredths of a degree; the hour angle 15° an hour from solar noon; sunrise and sunset with the usual allowance of 0.833° for the sun's half-width and refraction): that day it rises at 6:41 and sets at 17:19 by the sun, and stands 41° up at noon. The shadows follow it. The colours of the sky, the sunlight and the air at each height of the sun are the picture's (a table keyed to how the light looks then, blended between), not a model of scattering; once the sun is down it lights nothing and casts no shadow, and the twilight darkens through blue and violet.

**The casing (17 November; drawn, after the survey).** When the last course is in, the casing is dressed from the top down, a course at a time, over four seconds of the clock on the wall (at once for a reader who asks for less motion): white Tura limestone on the ideal faces, Petrie's 230.35 m and 146.71 m, in the courses' own bands. Its joints were half a millimetre (Petrie, on the casing stones that remain at the foot), so close by they are hairlines; each course and each block has a shade of its own, so that from afar the courses read as faint bands, as the Bent Pyramid's surviving casing does. The casing came from Tura, across the river (Merer's papyri record the hauling); the room does not simulate it (§5) and draws it as it stood. No pyramidion of the Great Pyramid survives: its apex is the casing's own stone, as the white Tura limestone pyramidion found beside Sneferu's Red Pyramid is (reassembled there; whether it was that pyramid's is not certain). Most of the casing was carried off for Cairo's buildings after the earthquake of 1303.

**The land and the air (17 November; T-I where placed from a source, the rest drawn).** The pyramid stands where it stands: at the north-east corner of the Giza plateau, about 320 m from the plateau's northern edge and 560 m from its eastern, on ground its builders levelled. Below the edge, 42 m down (the plateau about 60 m above the sea, the valley floor about 18), lies the valley: fields, palms and water. A branch of the Nile reached the plateau's foot in Khufu's reign, with a basin there (Sheisha et al., *PNAS* 119 (37), 2022, from cores in the floodplain: the "Khufu branch"); the river itself is drawn about 6 km east, west of its course today, which runs about 7 km from the pyramid. The Muqattam hills rise across the valley, about 12 km east. On the southern horizon stand the pyramids that already stood when this one was begun, where their sites are (from their coordinates, turned to metres from the Great Pyramid's centre at 29.97917° N, 31.13417° E): Djoser's step pyramid at Saqqara, 14.4 km away at a bearing of 146°, and Sneferu's Red and Bent pyramids at Dahshur, 20.2 and 22.2 km at 160° and 161°, cased as they then were. The Earth's curve is in the land (it sinks Dahshur's two by 32 and 39 m), and so is the air: an even haze that takes nearly half the light of what lies 10 km away, a mist on the valley floor, and the sky's colour in every direction (warmer under the sun), into which far land fades exactly; the river mirrors the sky. The room opens on a November morning, a quarter past eight by the sun, with the sun 17° up in the south-east, and the ripples in the sand run east and west, for the north wind. Placed from a source: the pyramid and its elders, their distances and bearings, the drop to the valley (to a few metres), and that the branch was there. Drawn: every other shape of the land, its colours, the fields and palms, the river's exact course, the haze. `giza.mjs` holds the shape (its numbers are tested); `land.js` and `air.js` draw it.

**Resolution.** The stage draws at the screen's own pixels (its devicePixelRatio, up to 3, and up to 8.3 million pixels a frame), multisampled, never at the site's graphics tier, and only while something moves or sounds. When its frames are long it steps itself down (`ladder` in `orbit.mjs`): fewer pixels, then a coarser shadow, then no shadow and the land's fine detail left out, never under half a pixel a point; when to step is the world's own frame watch's to decide (`src/game/fine.js`: it tries the plainest step, keeps it only if the frames are clearly shorter there, and climbs back while they stay good). Where a machine keeps up it never steps. The horns farther than 40 m from the eye are drawn in fewer facets (a thousand of them are most of what is drawn); their places and their light are the same. Measured 17 November: drawn in software (SwiftShader, no GPU), a frame took about 0.9 s and the page stopped answering clicks; it now steps to its plainest within a few seconds, at about a third of a second a frame, and every check of the smoke passes there.

**Drawn, not derived:** each horn's driver behind its throat; the posts; the tray's glass (the sound takes no echo from it); the person at the pyramid's corner (1.75 m). Below about 110 Hz a mouth is wider than its 0.5 m mount and dips into the bed: the model treats each horn as a point at its mouth's centre.

**How it is looked at.** `node scripts/frequencies-smoke.mjs desk gpu` (and `phone`): a throwaway server and a real browser that die with the script. It looks at the land by its colours (the valley greener than the sand, the sky blue), builds the pyramid and waits for its casing, plays it, goes to its places, sounds a block's lattice, hears one horn alone, places a horn by hand, turns the eye by mouse and by key, and prints its checks beside the pictures.
