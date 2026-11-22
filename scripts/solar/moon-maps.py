"""moon-maps.py: the Moon's two textures for the game, the numbers the page needs to read them, and the tests' fixture.

python -I scripts/solar/moon-maps.py <moon.py's outdir> <ldem_16.tif> src/game/solar test/fixtures/solar

moon.py (beside this file) turns NASA's maps (SVS 4720, the CGI Moon Kit) into the Moon's albedo on its true scale, the
LOLA relief as normals, and the phase law PHI that makes the whole disc as bright as the clockwork's magnitude law at
every phase. This is the step after it. It writes four files:

  src/game/solar/moon-albedo.jpg   moon.py's albedo picture, byte for byte (2048 x 1024; 0.69 MB): plate carree in the
                                   IAU Moon frame, column 0 at longitude -180 with east longitude growing to the right,
                                   row 0 at +90; each channel rho = RHO_MAX * sRGB-to-linear(byte / 255), the albedo
                                   relative to sunlight (the game's Sun is white).
  src/game/solar/moon-relief.png   the same frame at 1024 x 512, lossless: red and green the surface's normal toward
                                   east and north (0.5 + 0.5 x), blue its height above the 1737.4 km sphere,
                                   H0 + byte / 255 (H1 - H0) km. A texel is 10.7 km at the equator: at the game's 55
                                   degree view the Moon is 17 pixels across and its whole face is a few texels a pixel,
                                   and through a telescope ten times narrower it is still under two. Why not a JPEG and
                                   why not 2048: packed into one JPEG the three unrelated channels came back with the
                                   heights 217 m and the normals 1.7 degrees off (its colour transform mixes them), and
                                   near the terminator, where a slope of a degree is a fifth of the light, that is noise;
                                   a lossless 2048 is 3.1 MB. This is 0.84 MB and exact to its 8 bits (heights to 22 m).
  src/game/solar/moonmaps.js       the numbers: the two files' sizes and sha256, RHO_MAX, the near side's mean albedo and
                                   colour, H0 and H1, the phase law PHI every 2 degrees, the credit. GENERATED.
  test/fixtures/solar/moon.json    texels of both files as a decoder gives them (Pillow's), at named places, with each
                                   file's sha256; and the near side's albedo (luminance) in 2 degree cells, so a test
                                   can hold the light law to the magnitude law without decoding a picture.

Needs numpy, tifffile and Pillow."""
import hashlib, json, math, shutil, sys
import numpy as np
import tifffile
from PIL import Image

src, dem_f, out_dir, fix_dir = sys.argv[1:5]
meta = json.load(open(f"{src}/moon.json"))
RHO_MAX = meta["RHO_MAX"]
R_MOON = 1737.4

# ---- the albedo: moon.py's own picture, as it is
shutil.copyfile(f"{src}/moon-albedo.jpg", f"{out_dir}/moon-albedo.jpg")
alb = np.asarray(Image.open(f"{out_dir}/moon-albedo.jpg").convert("RGB")).astype(np.float64) / 255
AH, AW = alb.shape[:2]
lin = np.where(alb <= 0.04045, alb / 12.92, ((alb + 0.055) / 1.055) ** 2.4)
rho = RHO_MAX * lin                                                   # albedo relative to sunlight, three colours

# ---- the relief at 1024 x 512: moon.py's normals (2048 x 1024, from LOLA at 16 pixels a degree, smoothed to that grid)
# averaged two by two, and LOLA's heights averaged over each texel's own area
nrm = np.load(f"{src}/moon-nrm.npy").astype(np.float64)
down2 = lambda a: a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, *a.shape[2:]).mean(axis=(1, 3))
n1 = down2(nrm); n1 /= np.linalg.norm(n1, axis=-1, keepdims=True)
RH, RW = n1.shape[:2]
dem = tifffile.imread(dem_f).astype(np.float64)                      # km above 1737.4, column 0 at -180, row 0 at +90
def area_mean(img, h2, w2):
    """each output texel the mean of the input over the texel's own area (an integral image, read between its samples)"""
    h, w = img.shape
    c = np.zeros((h + 1, w + 1)); c[1:, 1:] = img.cumsum(0).cumsum(1)
    ys, xs = np.linspace(0, h, h2 + 1), np.linspace(0, w, w2 + 1)
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1)[:, None]; fy = (ys - np.floor(ys))[:, None]
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 1)[None, :]; fx = (xs - np.floor(xs))[None, :]
    S = c[y0, x0] * (1 - fy) * (1 - fx) + c[y0, x0 + 1] * (1 - fy) * fx + c[y0 + 1, x0] * fy * (1 - fx) + c[y0 + 1, x0 + 1] * fy * fx
    return (S[1:, 1:] - S[:-1, 1:] - S[1:, :-1] + S[:-1, :-1]) / ((h / h2) * (w / w2))
hgt = area_mean(dem, RH, RW)
H0, H1 = math.floor(hgt.min() * 10) / 10, math.ceil(hgt.max() * 10) / 10
q8 = lambda x: np.clip(np.round(x), 0, 255).astype(np.uint8)
relief = np.stack([q8((n1[..., 0] * 0.5 + 0.5) * 255), q8((n1[..., 1] * 0.5 + 0.5) * 255), q8((hgt - H0) / (H1 - H0) * 255)], -1)
Image.fromarray(relief).save(f"{out_dir}/moon-relief.png", optimize=True)
rel = np.asarray(Image.open(f"{out_dir}/moon-relief.png").convert("RGB"))
assert (rel == relief).all(), "the PNG gives back what was put in"

# ---- the near side's mean albedo and colour, weighted as the full disc shows it (mu toward the Earth, seen face on)
lat = 90 - (np.arange(AH) + 0.5) * 180 / AH; lon = -180 + (np.arange(AW) + 0.5) * 360 / AW
LAT, LON = np.meshgrid(np.radians(lat), np.radians(lon), indexing="ij")
w = np.clip(np.cos(LAT) * np.cos(LON), 0, None) * np.cos(LAT)
rho_mean = [float((rho[..., k] * w).sum() / w.sum()) for k in range(3)]
Y = 0.2126 * rho[..., 0] + 0.7152 * rho[..., 1] + 0.0722 * rho[..., 2]
# its brightest tenth: the albedo (luminance) over which a tenth of the full disc lies, over the disc's mean (the eye's
# anchor for the face: moon.js LOOK)
o = np.argsort(Y.ravel()); cw = np.cumsum(w.ravel()[o]); cw /= cw[-1]
bright = float(Y.ravel()[o][np.searchsorted(cw, 0.9)] / ((Y * w).sum() / w.sum()))

# ---- the tests' fixture: named places, and the near side in 2 degree cells (luminance, each the mean over its area)
PLACES = [("Tycho, its floor", -43.31, -11.36), ("Copernicus, its floor", 9.62, -20.08), ("Aristarchus", 23.7, -47.4),
          ("Mare Tranquillitatis", 8.5, 31.4), ("Mare Crisium", 17.0, 59.1), ("Oceanus Procellarum", 18.0, -57.0),
          ("the southern highlands", -30.0, 10.0), ("the south pole", -89.9, 0.0), ("the highest place (far side)", 5.4, -158.6),
          ("Antoniadi (South Pole-Aitken)", -69.7, -172.0)]
texels = []
for name, la, lo in PLACES:
    ax, ay = int((lo + 180) / 360 * AW) % AW, min(AH - 1, int((90 - la) / 180 * AH))
    rx, ry = int((lo + 180) / 360 * RW) % RW, min(RH - 1, int((90 - la) / 180 * RH))
    a = [int(v) for v in np.asarray(Image.open(f"{out_dir}/moon-albedo.jpg").convert("RGB"))[ay, ax]]
    r = [int(v) for v in rel[ry, rx]]
    e, n = r[0] / 255 * 2 - 1, r[1] / 255 * 2 - 1
    texels.append({"name": name, "lat": la, "lon": lo, "albedo": {"x": ax, "y": ay, "bytes": a, "rho": [round(float(rho[ay, ax, k]), 5) for k in range(3)]},
                   "relief": {"x": rx, "y": ry, "bytes": r, "normal": [round(e, 5), round(n, 5), round(math.sqrt(max(0.0, 1 - e * e - n * n)), 5)], "km": round(H0 + r[2] / 255 * (H1 - H0), 4)}})
CELL = 2
cl = np.arange(-90, 90, CELL); co = np.arange(-100, 100, CELL)
grid = []
for la0 in cl:
    rows = (lat >= la0) & (lat < la0 + CELL); wr = np.cos(np.radians(lat[rows]))[:, None]
    row = []
    for lo0 in co:
        cols = (lon >= lo0) & (lon < lo0 + CELL)
        blk = Y[np.ix_(rows, cols)]
        row.append(int(round(float((blk * wr).sum() / (wr.sum() * blk.shape[1])) * 1e4)))
    grid.append(row)

sha = lambda f: hashlib.sha256(open(f, "rb").read()).hexdigest()
import os
files = {k: {"file": f"moon-{k}.{ext}", "w": ww, "h": hh, "bytes": os.path.getsize(f"{out_dir}/moon-{k}.{ext}"), "sha256": sha(f"{out_dir}/moon-{k}.{ext}")}
         for k, ext, ww, hh in (("albedo", "jpg", AW, AH), ("relief", "png", RW, RH))}
PHI = meta["PHI"]; assert meta["PHI_alpha_deg"] == list(range(0, 181, 2))
fix = {"made_by": "scripts/solar/moon-maps.py", "files": files, "RHO_MAX": RHO_MAX, "H0": H0, "H1": H1, "texels": texels,
       "grid": {"cell": CELL, "lat0": -90, "lon0": -100, "scale": 1e-4, "about": "the albedo's luminance (rho), each cell the mean over its area: rows from latitude -90 up, columns from longitude -100 east", "rho": grid}}
json.dump(fix, open(f"{fix_dir}/moon.json", "w"), separators=(",", ":"))

f6 = lambda x: f"{x:.6g}"
js = f"""// moonmaps.js — THE MOON'S MAPS, AS NUMBERS. GENERATED by scripts/solar/moon-maps.py: do not edit by hand.
//
// The Moon's face is the two pictures beside this file, both plate carree in the IAU Moon frame (the mean Earth / polar
// axis frame, as the clockwork's orientation('moon') turns it): column 0 at longitude -180 with east longitude growing to
// the right, row 0 at latitude +90.
//   moon-albedo.jpg ({files['albedo']['w']} x {files['albedo']['h']}, sha256 {files['albedo']['sha256'][:16]}...): each channel rho = RHO_MAX * sRGB-to-linear(byte / 255), the
//     albedo relative to sunlight, from the LRO camera's (LROC WAC) colour mosaic put on the Moon's measured scale and colour
//     by scripts/solar/moon.py (its disc-weighted mean is the Moon's geometric albedo, as the light law below needs;
//     `rhoMean` is that mean in three colours, and `bright` its brightest tenth: the albedo a tenth of the full disc
//     lies over, as a share of the mean).
//   moon-relief.png ({files['relief']['w']} x {files['relief']['h']}, sha256 {files['relief']['sha256'][:16]}...): red and green the surface's normal toward east and
//     north (0.5 + 0.5 x; up is what is left of a unit vector), blue its height above the {R_MOON} km sphere,
//     H0 + byte / 255 (H1 - H0) km, from the Lunar Orbiter Laser Altimeter (LOLA).
// The light law (SOLAR.md "Step 2, third part"): a place of albedo rho, lit at the cosine mu0 and seen at the cosine mu
// of its normal, gives L = E rho PHI(alpha) 2 mu0 / (mu0 + mu) / pi cd/m2 under a light of E lux at a phase angle alpha
// (Lommel-Seeliger, so a full Moon is as bright at its limb as at its middle). PHI, every 2 degrees from 0 to 180, carries
// the opposition surge and the roughness: it was fitted so that the whole disc gives the clockwork's magnitude law at
// every phase (within 0.008 mag with the relief), and is held at its 160 degree value past 160.
export const MOON_MAPS = Object.freeze({{
  albedo: Object.freeze({json.dumps(files['albedo'])}),
  relief: Object.freeze({json.dumps(files['relief'])}),
  RHO_MAX: {RHO_MAX!r},
  rhoMean: Object.freeze([{', '.join(f6(x) for x in rho_mean)}]),
  bright: {bright:.4f},
  H0: {H0}, H1: {H1}, radius: {R_MOON},
}});
export const PHI_STEP = 2;
export const PHI = Object.freeze([{', '.join(f6(x) for x in PHI)}]);
export const MOON_CREDIT = 'NASA\\'s Scientific Visualization Studio, CGI Moon Kit (svs.gsfc.nasa.gov/4720): LRO LROC WAC and LOLA data (NASA/GSFC/Arizona State University)';
"""
open(f"{out_dir}/moonmaps.js", "w").write(js)
print(json.dumps({"files": files, "H0": H0, "H1": H1, "rho_mean": rho_mean, "rho_mean_Y": 0.2126 * rho_mean[0] + 0.7152 * rho_mean[1] + 0.0722 * rho_mean[2], "bright": bright, "fixture_bytes": os.path.getsize(f"{fix_dir}/moon.json")}, indent=1))
