"""calibrate.py: put NASA's Deep Star Maps 2020 (SVS 4851) on the stars' own photometric scale.

python -I scripts/solar/calibrate.py <hiptyc_2020_4k.exr> <milkyway_2020_4k.exr> src/game/solar/stars.js <calibration.json>

The first of three steps that make src/game/solar/milkyway-cube.jpg (then texture.py, then cube.py; SOLAR.md, "How it
is made"). The two maps are NASA/Goddard Space Flight Center Scientific Visualization Studio's (svs.gsfc.nasa.gov/4851;
Gaia DR2: ESA/Gaia/DPAC), downloaded into a folder of their own and only read. Needs numpy and OpenEXR.

What probe.py found: a pixel holds surface brightness (a star's splat widens across as 1/cos(dec), slope -1.06), and the
drawing clips at 1.0 for every star brighter than about V 5. So the scale comes from the unclipped stars of V 4.5 to 6.5,
as the luminance summed over each one's splat, each row weighted by its true solid angle, against its catalogue V.
The bright-star map (hiptyc) and the Milky Way map (milkyway: the Gaia DR2 stars fainter than Tycho's) are drawn the
same way, so one scale serves both. Results in S10 (one V = 10 star per square degree; 27.78 V mag per square arcsecond)."""
import json, math, re, sys
import numpy as np
import OpenEXR

hip_f, mw_f, stars_f, out_f = sys.argv[1:5]

def load(f):
    with OpenEXR.File(f) as x:
        return x.channels()["RGB"].pixels.astype(np.float32)

hip, mw = load(hip_f), load(mw_f)
H, W = hip.shape[:2]
lum = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
Yh, Ym = lum(hip), lum(mw)
peak = hip.max(axis=2)
del hip, mw

txt = open(stars_f).read()
body = txt[txt.index("export const STARS = [") + 22: txt.rindex("];")]
S = np.array([float(v) for v in re.findall(r"-?[\d.]+(?:e-?\d+)?|NaN", body)]).reshape(-1, 7)   # hr ra dec pmra pmde V B-V

def pix(ra, dec):
    return ((180.0 - ra) / 360.0 * W - 0.5) % W, (90.0 - dec) / 180.0 * H - 0.5

dec_rows = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
crow = np.cos(np.radians(dec_rows))                      # each row's solid angle, against a pixel on the equator
OMEGA_EQ = (2 * math.pi / W) * (math.pi / H)             # sr, of a pixel on the equator
DEG2 = (math.pi / 180) ** 2

# ---- 1. the scale
cosd, sind = np.cos(np.radians(S[:, 2])), np.sin(np.radians(S[:, 2]))
cal = []
for i, s in enumerate(S):
    hr, ra, dec, v, bv = s[0], s[1], s[2], s[5], s[6]
    if abs(dec) > 75 or v < 4.5 or v > 6.5: continue
    c = sind[i] * sind + cosd[i] * cosd * np.cos(np.radians(S[:, 1] - ra))
    near = (c > math.cos(math.radians(1.5))) & (S[:, 5] < v + 2.5); near[i] = False
    if near.any(): continue
    x, y = pix(ra, dec)
    xi, yi = int(round(x)), int(round(y))
    st = 1 / max(math.cos(math.radians(dec)), 0.2)
    ry, rx = 7, int(math.ceil(7 * st))
    if yi - ry - 6 < 0 or yi + ry + 6 >= H: continue
    cols = np.arange(xi - rx - 6, xi + rx + 7) % W
    rws = slice(yi - ry - 6, yi + ry + 7)
    box = Yh[rws][:, cols]
    if peak[yi - 2: yi + 3][:, cols[rx + 4: rx + 9]].max() >= 0.95: continue      # clipped
    gy, gx = np.mgrid[-ry - 6: ry + 7, -rx - 6: rx + 7]
    e = (gx / rx) ** 2 + (gy / ry) ** 2
    ann = (e > 1.6) & (e < 3.5)
    wt = crow[rws][:, None] * np.ones((1, len(cols)))
    inner = e <= 1
    for name, bg in (("mean", float(box[ann].mean())), ("median", float(np.median(box[ann])))):
        f = float(((box - bg) * wt)[inner].sum())
        cal.append((name, v, bv, dec, f / 10 ** (-0.4 * v)))
calib = {}
for name in ("mean", "median"):
    r = np.array([c[1:] for c in cal if c[0] == name])
    per_mag = {f"{lo:.1f}": round(float(np.median(r[(r[:, 0] >= lo) & (r[:, 0] < lo + 0.5), 3])), 2) for lo in (4.5, 5.0, 5.5, 6.0)}
    pos = r[:, 3] > 0
    slope_bv = float(np.polyfit(r[pos, 1], -2.5 * np.log10(r[pos, 3] / np.median(r[:, 3])), 1)[0])
    calib[name] = {"n": int(len(r)), "median": float(np.median(r[:, 3])), "by_V": per_mag, "trend_mag_per_BV": round(slope_bv, 3),
                   "p16_p84_mag": [round(float(-2.5 * np.log10(np.percentile(r[:, 3], q) / np.median(r[:, 3]))), 3) for q in (84, 16)]}
k = calib["mean"]["median"]        # Y summed over a star (equator pixels) per V = 0 star

# a pixel's Y -> S10: Y / (k * OMEGA_EQ) V=0 stars per sr, * DEG2 per square degree, * 1e4 in V = 10 stars
TO_S10 = DEG2 * 1e4 / (k * OMEGA_EQ)

# ---- 2. the layers
mw_s10 = Ym * TO_S10                                    # Gaia DR2 stars fainter than Tycho's (about G 11.5 to 21)
# the Hipparcos and Tycho stars the catalogue does not draw (about V 6.5 to 11.5): the bright map with each catalogue
# star cut out (an ellipse as the projection widens it) and filled from round about it
Yc = Yh.copy()
for s in S:
    x, y = pix(s[1], s[2])
    xi, yi = int(round(x)), int(round(y))
    r = 5 if s[5] > 5.5 else 7 if s[5] > 4 else 10 if s[5] > 2 else 14
    st = 1 / max(math.cos(math.radians(s[2])), 0.05)
    ry, rx = r, min(int(math.ceil(r * st)), W // 4)
    y0, y1 = max(yi - ry - 4, 0), min(yi + ry + 5, H)
    cols = np.arange(xi - rx - 4, xi + rx + 5) % W
    sub = Yc[y0:y1][:, cols]
    gy, gx = np.mgrid[y0 - yi: y1 - yi, -rx - 4: rx + 5]
    e = (gx / rx) ** 2 + (gy / ry) ** 2
    ring = (e > 1) & (e < 2.2)
    if ring.any(): sub[e <= 1] = np.median(sub[ring])
    Yc[y0:y1][:, cols] = sub
tyc_s10 = Yc * TO_S10
bg = mw_s10 + tyc_s10

# ---- 3. what the layers say, against what is known
G = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
              [0.4941094279, -0.4448296300, 0.7469822445],
              [-0.8676661490, -0.1980763734, 0.4559837762]], dtype=np.float32)
ra_cols = (180.0 - (np.arange(W) + 0.5) * 360.0 / W) % 360
RA, DE = np.meshgrid(np.radians(ra_cols).astype(np.float32), np.radians(dec_rows).astype(np.float32))
v3 = np.stack([np.cos(DE) * np.cos(RA), np.cos(DE) * np.sin(RA), np.sin(DE)], -1)
gb = np.degrees(np.arcsin(np.clip((v3 @ G.T)[..., 2], -1, 1)))
del v3
WT = crow[:, None] * np.ones((1, W), dtype=np.float32)
def mean(mask, a): return float((a[mask] * WT[mask]).sum() / WT[mask].sum())
def vmag(mask, a):                                      # the integrated V of a region
    f = float((a[mask] * WT[mask]).sum()) * OMEGA_EQ / DEG2 * 1e-4   # V = 0 stars
    return round(-2.5 * math.log10(f), 2) if f > 0 else None
def disc(ra0, de0, rad):
    c = np.sin(np.radians(de0)) * np.sin(DE) + np.cos(np.radians(de0)) * np.cos(DE) * np.cos(RA - np.radians(ra0))
    return c > math.cos(math.radians(rad))
full = np.ones((H, W), bool)
stars_v0 = float((10 ** (-0.4 * S[:, 5])).sum())
# 1-degree blocks, solid-angle weighted, away from the poles, for the brightest patches
blk = 12
bw = (bg * WT)[: H // blk * blk, : W // blk * blk].reshape(H // blk, blk, W // blk, blk).sum(axis=(1, 3))
ww = WT[: H // blk * blk, : W // blk * blk].reshape(H // blk, blk, W // blk, blk).sum(axis=(1, 3))
blocks = bw / ww
bdec = 90 - (np.arange(H // blk) * blk + blk / 2) * 180 / H
blocks[np.abs(bdec) > 80] = 0
top = np.dstack(np.unravel_index(np.argsort(blocks.ravel())[::-1][:8], blocks.shape))[0]
report = {
    "calibration": calib, "k": k, "to_S10_per_Y": TO_S10,
    "galactic_poles_S10": {"north": {"all": round(mean(gb > 80, bg), 1), "gaia": round(mean(gb > 80, mw_s10), 1), "tycho_6.5_11.5": round(mean(gb > 80, tyc_s10), 1)},
                           "south": {"all": round(mean(gb < -80, bg), 1), "gaia": round(mean(gb < -80, mw_s10), 1), "tycho_6.5_11.5": round(mean(gb < -80, tyc_s10), 1)}},
    "by_galactic_latitude_S10": {f"{lo}..{lo+10}": round(mean((np.abs(gb) >= lo) & (np.abs(gb) < lo + 10), bg), 1) for lo in range(0, 90, 10)},
    "brightest_1deg_blocks": [{"ra": round(float((180 - (j * blk + blk / 2) * 360 / W) % 360), 1), "dec": round(float(bdec[i]), 1),
                               "S10": round(float(blocks[i, j])), "V_mag_arcsec2": round(27.78 - 2.5 * math.log10(float(blocks[i, j])), 2)} for i, j in top],
    "LMC_r4deg_V": {"gaia": vmag(disc(80.894, -69.756, 4), mw_s10), "with_tycho_6.5_11.5": vmag(disc(80.894, -69.756, 4), bg), "published_whole": 0.9},
    "SMC_r2deg_V": {"gaia": vmag(disc(13.187, -72.829, 2), mw_s10), "with_tycho_6.5_11.5": vmag(disc(13.187, -72.829, 2), bg), "published_whole": 2.7},
    "omega_Cen_r0.3deg_V": {"all": vmag(disc(201.697, -47.4795, 0.3), bg), "published": 3.9},
    "whole_sky_V": {"catalogue_stars_to_6.5": round(-2.5 * math.log10(stars_v0), 2), "tycho_6.5_11.5": vmag(full, tyc_s10), "gaia_fainter": vmag(full, mw_s10), "background_both": vmag(full, bg)},
}
json.dump(report, open(out_f, "w"), indent=1)
np.save(out_f.replace(".json", "-bg-s10.npy"), bg.astype(np.float32))
print(json.dumps(report, indent=1))
