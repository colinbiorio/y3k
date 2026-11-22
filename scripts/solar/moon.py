"""moon.py: the Moon's face for the game, on true albedo, with the phase law that makes every phase as bright as it is.

python -I scripts/solar/moon.py <lroc_color_16bit_srgb_4k.tif> <ldem_16.tif> <outdir>

(NASA SVS 4720, the CGI Moon Kit: the 2025 colour map and LOLA's heights at 16 pixels a degree. Then
scripts/solar/moon-maps.py makes the game's two textures from <outdir>, and moon-render.py draws the reference sheet.)

The light model the game is to draw with (one line of shader, and this file makes its numbers true):
    L = E_sun * rho(x) * PHI(alpha) * 2 mu0 / (mu0 + mu) / pi
  E_sun the Sun's illuminance at the Moon (lux), rho the albedo map (linear, relative to sunlight, so the Sun is white
  as the game takes it), mu0 and mu the cosines of the Sun's and the eye's angle from the local normal, alpha the phase
  angle. The Lommel-Seeliger law (2 mu0 / (mu0 + mu)): a full Moon is as bright at its limb as at its middle, as the
  real one is and a Lambert ball is not. PHI(alpha) carries the rest of the phase behaviour (the opposition surge, the
  shadows of a rough surface), made so that the whole disc's light matches the clockwork's magnitude law at every
  phase: m = 5 log10(r d) + 0.21 + 0.026 a + 4e-9 a^4 (within 0.02 mag of JPL Horizons).

What the NASA map is (SVS 4720, "optimized for aesthetics, not science"): the LROC WAC Hapke-normalized mosaic in three
bands (643, 566, 415 nm), exposure and white balance adjusted by eye, the poles filled from LOLA's albedo. So its pattern
is kept and its scale and colour are set from the Moon's measured numbers:
  - colour: the Moon is redder than the Sun by B-V 0.27 (0.92 against 0.65) and V-R about 0.33: a reflectance rising
    about 0.22% a nanometre; read at the screen's primaries (about 610, 545 and 455 nm), relative to sunlight,
    R : G : B = 1.14 : 1 : 0.80 on the near side's mean (the camera's 415 nm blue band would say 0.68: too tan);
  - brightness: the near side's mean albedo, weighted as the full disc shows it, comes out of the magnitude law itself
    (0.123, the Moon's geometric albedo, as it should for this law at full phase)."""
import json, math, sys
import numpy as np
import tifffile
from PIL import Image

col_f, dem_f, out = sys.argv[1:4]
R_MOON, D_MEAN, AU = 1737.4, 384400.0, 149597870.7

# ---- the albedo pattern, in linear light
a = tifffile.imread(col_f).astype(np.float64) / 65535.0
lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
H, W = lin.shape[:2]
lat = 90 - (np.arange(H) + 0.5) * 180 / H
lon = -180 + (np.arange(W) + 0.5) * 360 / W
LAT, LON = np.meshgrid(np.radians(lat), np.radians(lon), indexing="ij")
Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
Y_nasa = Y.copy()

def box(la0, la1, lo0, lo1):
    m = (lat[:, None] >= la0) & (lat[:, None] <= la1) & (lon[None, :] >= lo0) & (lon[None, :] <= lo1)
    return float(np.median(Y[m]))
regions = {"Mare Tranquillitatis": box(2, 14, 22, 38), "Mare Imbrium": box(26, 40, -28, -8), "Oceanus Procellarum": box(8, 28, -68, -50),
           "Mare Serenitatis": box(20, 34, 12, 26), "southern highlands": box(-50, -22, -8, 28), "far-side highlands": box(0, 30, 150, 180)}
maria = np.mean([regions[k] for k in ("Mare Tranquillitatis", "Mare Imbrium", "Oceanus Procellarum", "Mare Serenitatis")])
highs = np.mean([regions["southern highlands"], regions["far-side highlands"]])
# the contrast: NASA's map puts the highlands 2.7 times the maria; measured normal albedos (maria about 0.06-0.08,
# highlands 0.12-0.17 near 600 nm) put it nearer 2.0-2.3. The by-eye exposure is taken to have stretched it, and
# it is eased to 2.3 with one power on the light (the pattern is kept; T-II, said in the json)
RATIO_WANT = 2.3
GAMMA = math.log(RATIO_WANT) / math.log(highs / maria)
lin = lin ** GAMMA
Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
ratio_nasa = highs / maria
maria2 = np.mean([float(np.median(Y[(lat[:, None] >= la0) & (lat[:, None] <= la1) & (lon[None, :] >= lo0) & (lon[None, :] <= lo1)])) for la0, la1, lo0, lo1 in ((2, 14, 22, 38), (26, 40, -28, -8), (8, 28, -68, -50), (20, 34, 12, 26))])
highs2 = np.mean([float(np.median(Y[(lat[:, None] >= la0) & (lat[:, None] <= la1) & (lon[None, :] >= lo0) & (lon[None, :] <= lo1)])) for la0, la1, lo0, lo1 in ((-50, -22, -8, 28), (0, 30, 150, 180))])

# ---- the colour: the near side's mean set to the Moon's own, relative to sunlight
near = np.cos(LAT) * np.cos(LON)                         # the full disc's weight: mu toward the Earth, seen face on
w = np.clip(near, 0, None) * np.cos(LAT)                 # x the map's own area (cos lat)
meanRGB = np.array([(lin[..., k] * w).sum() / w.sum() for k in range(3)])
TARGET = np.array([1.14, 1.0, 0.80])   # the reflectance's slope read at the screen's primaries (about 610, 545, 455 nm), not the camera's 415 nm band
rgb = lin * (TARGET / meanRGB * meanRGB[1])[None, None, :]
# ---- the brightness: the full-Moon law fixes the disc's weighted mean albedo
m_sun = -26.74
m0 = 5 * math.log10(1.0 * D_MEAN / AU) + 0.21           # full Moon at the mean distance, the Sun 1 au away
ratio = 10 ** (-0.4 * (m0 - m_sun))                       # E_moon / E_sun
rho_mean = ratio / (R_MOON / D_MEAN) ** 2                 # = the disc's mean albedo under this law, PHI(0) = 1
Yr = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
k = rho_mean / ((Yr * w).sum() / w.sum())
rho = rgb * k
rhoY = Yr * k

# ---- the relief: LOLA heights -> normals in east, north, up, at the albedo's grid
dem = tifffile.imread(dem_f).astype(np.float64)          # km above 1737.4, 16 px a degree, centred on 0 deg longitude
dh, dw = dem.shape
# box-average 16 ppd down to the albedo grid (4096 x 2048 is 11.4 ppd): through 2880 x 5760 -> 2048 x 4096 by area
from numpy import interp
def resample(img, h2, w2):
    y = (np.arange(h2) + 0.5) * img.shape[0] / h2 - 0.5; x = (np.arange(w2) + 0.5) * img.shape[1] / w2 - 0.5
    y0 = np.clip(np.floor(y).astype(int), 0, img.shape[0] - 1); y1 = np.clip(y0 + 1, 0, img.shape[0] - 1); fy = (y - y0)[:, None]
    x0 = np.floor(x).astype(int) % img.shape[1]; x1 = (x0 + 1) % img.shape[1]; fx = (x - np.floor(x))[None, :]
    return (img[y0][:, x0] * (1 - fx) * (1 - fy) + img[y0][:, x1] * fx * (1 - fy) + img[y1][:, x0] * (1 - fx) * fy + img[y1][:, x1] * fx * fy)
# smooth to the target grid's spacing first (a 2-pixel box at 16 ppd ~ the 11.4 ppd grid) so the normals do not alias
sm = (dem + np.roll(dem, 1, 1) + np.roll(dem, 1, 0) + np.roll(np.roll(dem, 1, 0), 1, 1)) / 4
hgt = resample(sm, H, W)
dlat = math.radians(180 / H); dlon = math.radians(360 / W)
dh_dn = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) / (2 * dlat * R_MOON) * -1          # row grows southward
dh_de = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / (2 * dlon * R_MOON * np.maximum(np.cos(LAT), 0.02))
dh_dn[0], dh_dn[-1] = dh_dn[1], dh_dn[-2]
nrm = np.stack([-dh_de, -dh_dn, np.ones_like(hgt)], -1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

# ---- PHI: the disc's light under the law, against the magnitude law, at each phase; Sun to the east and to the west
def disc_flux(alpha_deg, side, relief, n=400):
    """E_moon / E_sun at the Earth for this phase (the Sun on one side), the Moon at D_MEAN, PHI = 1"""
    al = math.radians(alpha_deg)
    # the eye along +x (sub-Earth point lat 0 lon 0); the Sun in the equator plane, alpha from the eye, east or west
    v = np.array([1.0, 0.0, 0.0]); s = np.array([math.cos(al), side * math.sin(al), 0.0])
    # sample the visible hemisphere on a grid in the disc's plane (y east, z north), each sample a patch of the disc
    g = (np.arange(n) + 0.5) / n * 2 - 1
    Yy, Zz = np.meshgrid(g, g); inside = Yy ** 2 + Zz ** 2 < 1
    Xx = np.sqrt(np.clip(1 - Yy ** 2 - Zz ** 2, 0, None))
    la = np.arcsin(np.clip(Zz, -1, 1)); lo = np.arctan2(Yy, Xx)
    iy = np.clip(((90 - np.degrees(la)) / 180 * H).astype(int), 0, H - 1); ix = (((np.degrees(lo) + 180) / 360) * W).astype(int) % W
    if relief:
        ne, nn, nu = nrm[iy, ix, 0], nrm[iy, ix, 1], nrm[iy, ix, 2]
        # east, north, up at (la, lo) in the x (to the eye), y (east), z (north) frame
        E = np.stack([-np.sin(lo), np.cos(lo), np.zeros_like(lo)], -1); Nn = np.stack([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)], -1)
        U = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)
        N = ne[..., None] * E + nn[..., None] * Nn + nu[..., None] * U
    else:
        N = np.stack([Xx, Yy, Zz], -1)
    mu = N @ v; mu0 = N @ s
    ok = inside & (mu > 0) & (mu0 > 0)
    r = np.where(ok, 2 * mu0 / np.maximum(mu0 + mu, 1e-9), 0)
    L = rhoY[iy, ix] * r / math.pi                           # radiance per unit E_sun
    # flux at the eye = sum L * (projected patch area) / d^2; a grid cell is (2/n)^2 of R^2 in the disc's plane
    return float((L * inside).sum() * (2 / n) ** 2 * (R_MOON / D_MEAN) ** 2)
law = lambda a: 10 ** (-0.4 * (5 * math.log10(D_MEAN / AU) + 0.21 + 0.026 * a + 4e-9 * a ** 4 - m_sun))
phases = list(range(0, 181, 2))
PHI, asym = [], []
for al in phases:
    fe, fw = disc_flux(al, +1, False), disc_flux(al, -1, False)
    f = 0.5 * (fe + fw)
    PHI.append(law(al) / f if f > 0 else PHI[-1] if PHI else 1.0)
    asym.append(-2.5 * math.log10(fe / fw) if fe > 0 and fw > 0 else 0.0)
PHI = np.array(PHI)
PHI[np.array(phases) > 160] = PHI[phases.index(160)]          # past 160 deg the lit sliver vanishes: held
# check: the same with relief (the normals shade the terminator; the law should still hold within its own scatter)
checks = []
for al in (0, 10, 30, 60, 90, 120, 150):
    i = phases.index(al)
    for rel in (False, True):
        f = 0.5 * (disc_flux(al, +1, rel) + disc_flux(al, -1, rel)) * PHI[i]
        checks.append({"alpha": al, "relief": rel, "mag_minus_law": round(-2.5 * math.log10(f / law(al)), 3)})

# ---- out: 2048 x 1024 albedo (sRGB-encoded rho / RHO_MAX), normals (RGB = e, n, u at 0.5 + 0.5 x), phase table
def down2(img): return img.reshape(img.shape[0] // 2, 2, img.shape[1] // 2, 2, *img.shape[2:]).mean(axis=(1, 3))
rho2 = down2(rho); nrm2 = down2(nrm); nrm2 /= np.linalg.norm(nrm2, axis=-1, keepdims=True)
RHO_MAX = float(np.percentile(rho2, 99.99) * 1.02)
enc = np.clip(rho2 / RHO_MAX, 0, 1); enc = np.where(enc <= 0.0031308, enc * 12.92, 1.055 * enc ** (1 / 2.4) - 0.055)
Image.fromarray((enc * 255 + 0.5).astype(np.uint8)).save(f"{out}/moon-albedo.jpg", quality=94, subsampling=0)
Image.fromarray(((nrm2 * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(f"{out}/moon-normal.png", optimize=True)
meta = {
    "law": "L = E_sun * rho * PHI(alpha) * 2 mu0 / (mu0 + mu) / pi; rho = RHO_MAX * srgb_to_linear(texel)",
    "RHO_MAX": RHO_MAX, "rho_disc_mean": rho_mean, "colour_RGB_relative_to_sunlight": TARGET.tolist(),
    "frame": "2048 x 1024 plate carree, column 0 at longitude -180 (east longitude growing right), row 0 at +90; the IAU Moon frame (mean Earth / polar axis)",
    "normals": "RGB = 0.5 + 0.5 (east, north, up) of the LOLA relief (16 ppd smoothed to the grid)",
    "PHI_note": "past 160 deg the lit sliver vanishes and the law is not defined: held at its 160 deg value",
    "PHI_alpha_deg": phases, "PHI": [round(float(p), 5) for p in PHI],
    "waxing_minus_waning_mag": {str(a): round(asym[phases.index(a)], 3) for a in (30, 60, 90, 120)},
    "regions_linear_Y_of_NASA_map": {k_: round(v_, 4) for k_, v_ in regions.items()},
    "highlands_over_maria": {"nasa_map": round(ratio_nasa, 2), "used": round(highs2 / maria2, 2), "gamma": round(GAMMA, 4)},
    "law_check": checks,
    "credit": "NASA's Scientific Visualization Studio (CGI Moon Kit, svs.gsfc.nasa.gov/4720): LRO LROC WAC and LOLA (NASA/GSFC/Arizona State University)",
}
json.dump(meta, open(f"{out}/moon.json", "w"), indent=1)
np.save(f"{out}/moon-rho.npy", rho2.astype(np.float32)); np.save(f"{out}/moon-nrm.npy", nrm2.astype(np.float32))
print(json.dumps({k_: meta[k_] for k_ in ("RHO_MAX", "rho_disc_mean", "highlands_over_maria", "regions_linear_Y_of_NASA_map", "waxing_minus_waning_mag", "law_check")}, indent=1))
print("PHI at 0, 30, 60, 90, 120, 150, 180:", [round(float(PHI[phases.index(a)]), 3) for a in (0, 30, 60, 90, 120, 150, 180)])
