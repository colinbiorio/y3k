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

`node test/frequencies.test.mjs` pins every function to the values above: 94 dB = 1 Pa; ISO 9613-1 at 1 kHz; J₁'s maximum and the piston's first zero; the mouth rule; power conservation across a horn; the shock distance; Bagnold's threshold and flux; Gor'kov's levitation levels and their 10 dB per decade; Γ; the field's +6 dB at the ground and −6 dB per doubling; the standing wave's minima half a wavelength apart; the sand engine's threshold, sweeping, mass conservation, damp face, set stone and packing; Petrie's base, height, angle and courses; the derived volume, mass and blocks; Davidovits' recipe and its scaling; the lattice tone and the schedule's behaviour; and the horn sizing. Sources are named in the code beside each formula.
