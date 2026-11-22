"""stars-erfa.py: where four bright stars stand over Lord Howe Island at fixed instants, by ERFA (the IAU's SOFA
library, IAU 2006/2000A), written as the fixture test/night.test.mjs holds the game's star places to.

python -I scripts/solar/stars-erfa.py src/game/solar/stars.js test/fixtures/solar/stars.json

UT1 is taken as UTC and the pole as still (dut1 = 0, xp = yp = 0), as the clockwork takes them, so what is compared is
the models (proper motion, precession, nutation, sidereal time, annual and diurnal aberration, refraction), not the
Earth's irregular turning. Parallax is left at zero, as the game leaves it (Sirius', the largest here, is 0.38").
Each place is given twice: with no air (the geometry), and lifted by the air of 1010 hPa and 10 C (the pressure and
temperature the clockwork's refraction() takes). Needs pyerfa."""
import json, math, re, sys
import erfa

stars_js, out = sys.argv[1:3]
LAT, LON = -31.5503, 159.0761                       # src/game/island/lordhowe-shape.js
WANT = {2491: "Sirius", 2326: "Canopus", 4730: "Acrux", 472: "Achernar"}
txt = open(stars_js).read()
body = txt[txt.index("export const STARS = [") + 22: txt.rindex("];")]
vals = [float(v) for v in re.findall(r"-?[\d.]+(?:e-?\d+)?|NaN", body)]
rows = {int(vals[k]): vals[k:k + 7] for k in range(0, len(vals), 7) if int(vals[k]) in WANT}
# the instants: every two hours through the night of 22-23 November 2026 and of 15 May 2027 (island time is UTC+11 in
# November, UTC+10:30 in May), and the two nights of the contact sheet (15 July 2026, the galactic centre high; 15
# December 2026, both Clouds high)
times = [(2026, 11, 22, h, 0) for h in range(8, 21, 2)] + [(2027, 5, 15, h, 0) for h in range(8, 19, 2)]
times += [(2026, 7, 15, 11, 42), (2026, 12, 15, 13, 0)]
res = []
for hr, (_, ra, dec, pmra, pmde, v, bv) in rows.items():
    rc, dc = math.radians(ra), math.radians(dec)
    pr = math.radians(pmra / 3.6e6) / math.cos(dc)  # the catalogue gives the motion in RA times cos(dec); ERFA wants dRA/dt
    pd = math.radians(pmde / 3.6e6)
    for (y, mo, d, hh, mm) in times:
        u1, u2 = erfa.dtf2d("UTC", y, mo, d, hh, mm, 0.0)
        place = {}
        for key, phpa in (("air0", 0.0), ("air", 1010.0)):
            aob, zob, hob, dob, rob, eo = erfa.atco13(rc, dc, pr, pd, 0.0, 0.0, u1, u2, 0.0, math.radians(LON), math.radians(LAT),
                                                      0.0, 0.0, 0.0, phpa, 10.0, 0.5, 0.55)
            place[key] = [round(90 - math.degrees(zob), 8), round(math.degrees(aob) % 360, 8)]
        res.append({"hr": hr, "name": WANT[hr], "utc": f"{y:04d}-{mo:02d}-{d:02d}T{hh:02d}:{mm:02d}:00Z",
                    "alt": place["air0"][0], "az": place["air0"][1], "altAir": place["air"][0], "azAir": place["air"][1]})
fix = {"what": "observed places by erfa.atco13 (no air, and 1010 hPa, 10 C, 50% humidity, 0.55 um); alt and az in degrees, az from north through east",
       "erfa": erfa.__version__, "site": {"lat": LAT, "lon": LON, "height": 0}, "dut1": 0, "polar": [0, 0], "parallax": 0,
       "stars": {str(hr): {"name": WANT[hr], "ra": r[1], "dec": r[2], "pmra": r[3], "pmde": r[4], "V": r[5]} for hr, r in rows.items()},
       "places": res}
open(out, "w").write(json.dumps(fix) + "\n")
print(len(res), "places;", sum(1 for r in res if r["alt"] > 0), "above the horizon")
