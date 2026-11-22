"""moon-render.py: the Moon drawn from moon.py's output with the game's law, north up as seen from the north, lunar east right.
python -I scripts/solar/moon-render.py <outdir>  ->  <outdir>/phases.png"""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw
out = sys.argv[1]
meta = json.load(open(f"{out}/moon.json")); rho = np.load(f"{out}/moon-rho.npy").astype(np.float64); nrm = np.load(f"{out}/moon-nrm.npy").astype(np.float64)
H, W = rho.shape[:2]; PHI = dict(zip(meta["PHI_alpha_deg"], meta["PHI"]))
def draw(alpha, side=1, n=420, zoom=1.0, centre=(0.0, 0.0)):
    al = math.radians(alpha); v = np.array([1.0, 0, 0]); s = np.array([math.cos(al), side * math.sin(al), 0])
    g = (np.arange(n) + 0.5) / n * 2 - 1
    Yy, Zz = np.meshgrid(g / zoom + centre[0], -g / zoom + centre[1]); inside = Yy ** 2 + Zz ** 2 < 1
    Xx = np.sqrt(np.clip(1 - Yy ** 2 - Zz ** 2, 0, None)); la = np.arcsin(np.clip(Zz, -1, 1)); lo = np.arctan2(Yy, Xx)
    fy = (90 - np.degrees(la)) / 180 * H - 0.5; fx = ((np.degrees(lo) + 180) / 360) * W - 0.5
    iy = np.clip(np.round(fy).astype(int), 0, H - 1); ix = np.round(fx).astype(int) % W
    ne, nn, nu = nrm[iy, ix, 0], nrm[iy, ix, 1], nrm[iy, ix, 2]
    E = np.stack([-np.sin(lo), np.cos(lo), 0 * lo], -1); Nn = np.stack([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)], -1)
    U = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)
    N = ne[..., None] * E + nn[..., None] * Nn + nu[..., None] * U
    mu, mu0 = N @ v, N @ s
    # the sphere's own normal decides lit or not (no self-shadowing pass here: the relief only shades)
    mu0s = Xx * s[0] + Yy * s[1] + Zz * s[2]
    ok = inside & (mu0s > 0) & (mu > 0)
    r = np.where(ok, 2 * np.clip(mu0, 0, None) / np.maximum(np.clip(mu0, 0, None) + mu, 1e-6), 0)
    L = rho[iy, ix] * (r * PHI[min(PHI, key=lambda k: abs(k - alpha))] / math.pi)[..., None]
    return L, inside
def show(L, inside, scale):
    Y = 0.2126 * L[..., 0] + 0.7152 * L[..., 1] + 0.0722 * L[..., 2]
    x = Y * scale; t = x / (1 + x)                                       # Reinhard on luminance, hue kept
    rgb = L / np.maximum(Y, 1e-12)[..., None] * t[..., None]
    rgb = np.clip(rgb, 0, 1); rgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)
    img = (rgb * 255).astype(np.uint8); img[~inside] = (8, 8, 10); return img
alphas = [(0, "full Moon"), (45, "waxing gibbous, 45 deg"), (90, "first quarter"), (140, "crescent, 140 deg")]
tiles = []; full, inside0 = draw(0)
fixed = 1 / np.percentile((0.2126 * full[..., 0] + 0.7152 * full[..., 1] + 0.0722 * full[..., 2])[inside0], 99) * 1.6
for a_, name in alphas:
    L, ins = draw(a_)
    Y = 0.2126 * L[..., 0] + 0.7152 * L[..., 1] + 0.0722 * L[..., 2]
    own = 1 / max(np.percentile(Y[ins & (Y > 0)], 99), 1e-9) * 1.6
    tiles.append((show(L, ins, own), show(L, ins, fixed), name))
Lz, insz = draw(90, zoom=4.0, centre=(0.02, 0.30))                    # through a telescope: the terminator at first quarter, north of the middle
Yz = 0.2126 * Lz[..., 0] + 0.7152 * Lz[..., 1] + 0.0722 * Lz[..., 2]
zoomimg = show(Lz, insz, 1 / max(np.percentile(Yz[Yz > 0], 99), 1e-9) * 1.6)
n = 420; sheet = Image.new("RGB", (4 * n + 5 * 10 + n + 10, 2 * n + 3 * 10 + 60), (20, 20, 22)); d = ImageDraw.Draw(sheet)
for i, (a_img, b_img, name) in enumerate(tiles):
    x = 10 + i * (n + 10); sheet.paste(Image.fromarray(a_img), (x, 30)); sheet.paste(Image.fromarray(b_img), (x, 30 + n + 30)); d.text((x, 10), name, fill=(220, 220, 220))
x = 10 + 4 * (n + 10); sheet.paste(Image.fromarray(zoomimg), (x, 30)); d.text((x, 10), "telescope x4: the terminator at first quarter", fill=(220, 220, 220))
d.text((10, 30 + n + 10), "top: each phase shown at its own exposure; bottom: one exposure for all (their true brightness against the full Moon)", fill=(200, 200, 200))
sheet.save(f"{out}/phases.png"); print(sheet.size)
