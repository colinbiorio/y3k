"""texture.py: the Milky Way and the unresolved stars as one small texture the game can carry, in true units.

python -I scripts/solar/texture.py <hiptyc_2020_4k.exr> <milkyway_2020_4k.exr> src/game/solar/stars.js <calibration.json> <outdir>

The second of three steps (after calibrate.py, before cube.py). Its milkyway-s10.npy (the light in S10, as floats) is
what cube.py and milkyway.py read. Needs numpy, OpenEXR and Pillow.

Layers (calibrate.py found the scale; see the README beside this folder):
  hiptyc with every Bright Star Catalogue star cut out   the Hipparcos/Tycho stars of about V 6.5 to 11.5, on the
                                                         bright stars' own scale
  milkyway / GAIA                                        the Gaia DR2 stars fainter than Tycho's, which the map draws
                                                         about 2.6 mag too bright against its own bright stars (the
                                                         Magellanic Clouds' known totals say so)
Out: milkyway.png (2048 x 1024 plate carree, J2000 equator, centred on RA 0h, RA growing LEFT, as NASA's), each
channel encoded c = C0 * (exp(v * LN) - 1), v = byte / 255, in S10; milkyway.json says C0, LN and how to make cd/m2."""
import json, math, re, sys, zlib, struct
import numpy as np
import OpenEXR

hip_f, mw_f, stars_f, cal_f, outdir = sys.argv[1:6]
cal = json.load(open(cal_f))
TO_S10 = cal["to_S10_per_Y"]
GAIA_MAG = 2.6                       # the Gaia layer's excess, from the LMC (2.58) and SMC (2.55) totals
GAIA = 10 ** (-0.4 * GAIA_MAG)

def load(f):
    with OpenEXR.File(f) as x:
        return x.channels()["RGB"].pixels.astype(np.float32)
hip, mw = load(hip_f), load(mw_f)
H, W = hip.shape[:2]
txt = open(stars_f).read()
body = txt[txt.index("export const STARS = [") + 22: txt.rindex("];")]
S = np.array([float(v) for v in re.findall(r"-?[\d.]+(?:e-?\d+)?|NaN", body)]).reshape(-1, 7)

# cut the catalogue's stars out of the bright map (all three channels), as calibrate.py does
for s in S:
    x = ((180.0 - s[1]) / 360.0 * W - 0.5) % W; y = (90.0 - s[2]) / 180.0 * H - 0.5
    xi, yi = int(round(x)), int(round(y))
    r = 5 if s[5] > 5.5 else 7 if s[5] > 4 else 10 if s[5] > 2 else 14
    st = 1 / max(math.cos(math.radians(s[2])), 0.05)
    ry, rx = r, min(int(math.ceil(r * st)), W // 4)
    y0, y1 = max(yi - ry - 4, 0), min(yi + ry + 5, H)
    cols = np.arange(xi - rx - 4, xi + rx + 5) % W
    sub = hip[y0:y1][:, cols]
    gy, gx = np.mgrid[y0 - yi: y1 - yi, -rx - 4: rx + 5]
    e = (gx / rx) ** 2 + (gy / ry) ** 2
    ring = (e > 1) & (e < 2.2)
    if ring.any(): sub[e <= 1] = np.median(sub[ring], axis=0)
    hip[y0:y1][:, cols] = sub
# the Tycho stars are below what the eye resolves at night: they reach it as glow, so they are softened to it (a
# Gaussian of a quarter of a degree, the same width every way on the sky: near the poles a blur in pixels would be
# long down the meridians and short round them, and draw streaks out of the pole)
def blur(a, sigma):
    """an even blur on the sphere, sigma in pixels of declination: along each row the width in pixels grows as
    1/cos(dec), done in Fourier space round the row (it wraps); then down the columns, clamped at the poles"""
    h, w = a.shape[:2]
    dec = np.radians(90 - (np.arange(h) + 0.5) * 180 / h)
    sx = sigma / np.maximum(np.cos(dec), 1e-3)                       # pixels across, row by row
    f = np.fft.rfftfreq(w)                                           # cycles per pixel
    gain = np.exp(-2 * (math.pi ** 2) * (sx[:, None] ** 2) * (f[None, :] ** 2))
    out = np.fft.irfft(np.fft.rfft(a, axis=1) * gain[..., None], n=w, axis=1)
    k = np.exp(-0.5 * (np.arange(-3 * int(math.ceil(sigma)), 3 * int(math.ceil(sigma)) + 1) / sigma) ** 2); k /= k.sum()
    n = len(k) // 2
    pad = np.concatenate([np.repeat(out[:1], n, 0), out, np.repeat(out[-1:], n, 0)], axis=0)
    res = np.zeros_like(out)
    for i, wgt in enumerate(k): res += wgt * pad[i: i + h]
    return res.astype(np.float32)
hip = blur(hip, 3.0)
mw = blur(mw, 1.5)      # the Gaia layer's grain is single faint stars too: softened to 8 arcmin, the lanes stay
C = (hip + GAIA * mw) * TO_S10          # S10, per channel (Y = 0.2126 R + 0.7152 G + 0.0722 B is the V-like one)
del hip, mw
# to 2048 x 1024: a box of four, which keeps the mean surface brightness
C2 = C.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
H2, W2 = C2.shape[:2]
Y2 = 0.2126 * C2[..., 0] + 0.7152 * C2[..., 1] + 0.0722 * C2[..., 2]

# the encoding: log, so the faint lanes and the bright clouds both get steps far below what the eye can tell apart
C0 = 2.0
top = float(C2.max())
LN = math.log(1 + top / C0)
v = np.log1p(np.clip(C2, 0, None) / C0) / LN
rng = np.random.default_rng(1)
b = np.clip(np.round(v * 255), 0, 255).astype(np.uint8)      # no dither here: the shader dithers its output
back = C0 * np.expm1(b.astype(np.float64) / 255 * LN)
Yb = 0.2126 * back[..., 0] + 0.7152 * back[..., 1] + 0.0722 * back[..., 2]
m = Y2 > 5
err = np.abs(Yb[m] - Y2[m]) / Y2[m]

def png(path, arr):
    h, w, c = arr.shape
    raw = b"".join(b"\x00" + arr[i].tobytes() for i in range(h))
    def chunk(t, data): return struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
                           chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
png(f"{outdir}/milkyway.png", b)
from PIL import Image
Image.fromarray(b).save(f"{outdir}/milkyway.webp", quality=95, method=6)
Image.fromarray(b).save(f"{outdir}/milkyway.jpg", quality=95, subsampling=2, optimize=True)

# photometric zero shared with the game: E(V) = sunIlluminance(1 au) * 10^(-0.4 (V + 26.74)) (air.js and the clockwork)
E_SUN = 1361 * 133800 / 1366.1
E_V0 = E_SUN * 10 ** (-0.4 * 26.74)
S10_CDM2 = 1e-4 * E_V0 / (math.pi / 180) ** 2
meta = {
    "size": [W2, H2], "frame": "J2000 equator (ICRS), plate carree, column 0 at RA 180 deg, RA growing to the left, row 0 at dec +90",
    "decode": "S10 = C0 * (exp(byte / 255 * LN) - 1), per channel; luminance (V-like) = 0.2126 R + 0.7152 G + 0.0722 B",
    "C0": C0, "LN": LN, "S10_to_cd_m2": S10_CDM2, "E_V0_lux": E_V0,
    "gaia_layer_mag": GAIA_MAG, "tycho_blur_px_4k": 3.0, "gaia_blur_px_4k": 1.5,
    "decode_error_lum_over_5_S10": {"median": float(np.median(err)), "p99": float(np.percentile(err, 99)), "max": float(err.max())},
    "S10_percentiles_lum": {str(q): round(float(np.percentile(Y2, q)), 2) for q in (1, 5, 25, 50, 75, 95, 99, 99.9)},
    "brightest_S10": round(float(Y2.max()), 1),
    "credit": "NASA/Goddard Space Flight Center Scientific Visualization Studio (Deep Star Maps 2020, svs.gsfc.nasa.gov/4851). Gaia DR2: ESA/Gaia/DPAC.",
}
json.dump(meta, open(f"{outdir}/milkyway.json", "w"), indent=1)
np.save(f"{outdir}/milkyway-s10.npy", C2.astype(np.float32))
print(json.dumps(meta, indent=1))
