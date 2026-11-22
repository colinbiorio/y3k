"""cube.py: the Milky Way texture as a cube map, so a direction is looked up with no pinch at the poles and no
seam: six faces of N texels with a gutter of G texels round each, the gutter holding what lies just past the edge
(the true directions there), so a bilinear look-up never needs the neighbouring face.

python -I scripts/solar/cube.py <milkyway-s10.npy> <outdir> [N]

The third step (after calibrate.py and texture.py): <outdir>/milkyway-cube.jpg is src/game/solar/milkyway-cube.jpg, and
milkyway-cube.json its numbers (C0 and LN are written into src/game/solar/milkyway.js). Needs numpy and Pillow.

Faces, in the J2000 equator (x to RA 0, y to RA 90 deg, z to the north pole); face k has an axis a and two tangents
u, v; a texel at (s, t) in [-1, 1]^2 looks along normalize(a + s u + t v); s grows to the right, t UP (row 0 is t = +1).
  0 +X: a (1,0,0)  u (0,1,0)   v (0,0,1)        3 -Y: a (0,-1,0) u (1,0,0)    v (0,0,1)
  1 -X: a (-1,0,0) u (0,-1,0)  v (0,0,1)        4 +Z: a (0,0,1)  u (0,1,0)    v (-1,0,0)
  2 +Y: a (0,1,0)  u (-1,0,0)  v (0,0,1)        5 -Z: a (0,0,-1) u (0,1,0)    v (1,0,0)
Look-up: m = the axis of d's largest |component|, face = 2m + (d_m < 0), s = (d . u) / |d_m|, t = (d . v) / |d_m|;
in the atlas (3 faces across, 2 down, each N + 2G square): x = col (N + 2G) + G + (s + 1) / 2 N, y = row (N + 2G) + G
+ (1 - t) / 2 N, col = face % 3, row = face / 3 (integer division)."""
import json, math, sys
import numpy as np
from PIL import Image

src, outdir = sys.argv[1:3]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 512
G = 2
E = np.load(src).astype(np.float64)            # S10, (H, W, 3), plate carree as NASA's (col 0 at RA 180, RA growing left)
H, W = E.shape[:2]
AX = [((1, 0, 0), (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), (0, -1, 0), (0, 0, 1)), ((0, 1, 0), (-1, 0, 0), (0, 0, 1)),
      ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (0, 1, 0), (-1, 0, 0)), ((0, 0, -1), (0, 1, 0), (1, 0, 0))]

def sample(d):
    """bilinear look-up of the plate carree along unit directions d (..., 3), wrapping in RA"""
    ra = np.degrees(np.arctan2(d[..., 1], d[..., 0])) % 360
    de = np.degrees(np.arcsin(np.clip(d[..., 2], -1, 1)))
    x = ((180.0 - ra) / 360.0 * W - 0.5) % W
    y = np.clip((90.0 - de) / 180.0 * H - 0.5, 0, H - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x1 = (x0 + 1) % W; y1 = np.minimum(y0 + 1, H - 1)
    return (E[y0, x0] * (1 - fx) * (1 - fy) + E[y0, x1] * fx * (1 - fy) + E[y1, x0] * (1 - fx) * fy + E[y1, x1] * fx * fy)

SS = 3                                           # 3 x 3 samples a texel
faces = []
for a, u, v in AX:
    a, u, v = map(np.array, (a, u, v))
    idx = np.arange(-G, N + G)
    acc = np.zeros((N + 2 * G, N + 2 * G, 3))
    for oy in range(SS):
        for ox in range(SS):
            s = ((idx + (ox + 0.5) / SS) / N) * 2 - 1                      # left to right
            t = 1 - ((idx + (oy + 0.5) / SS) / N) * 2                      # top to bottom
            S_, T_ = np.meshgrid(s, t)
            d = a[None, None, :] + S_[..., None] * u[None, None, :] + T_[..., None] * v[None, None, :]
            d /= np.linalg.norm(d, axis=-1, keepdims=True)
            acc += sample(d)
    faces.append(acc / (SS * SS))
atlas = np.zeros((2 * (N + 2 * G), 3 * (N + 2 * G), 3))
for k, f in enumerate(faces):
    r, c = divmod(k, 3)
    atlas[r * (N + 2 * G):(r + 1) * (N + 2 * G), c * (N + 2 * G):(c + 1) * (N + 2 * G)] = f
C0 = 2.0
LN = math.log(1 + atlas.max() / C0)
b = np.clip(np.round(np.log1p(np.clip(atlas, 0, None) / C0) / LN * 255), 0, 255).astype(np.uint8)
Image.fromarray(b).save(f"{outdir}/milkyway-cube.jpg", quality=95, subsampling=2, optimize=True)
Image.fromarray(b).save(f"{outdir}/milkyway-cube.png", optimize=True)

# check: decode the JPEG atlas and look up random directions the shader's way, against the plate carree itself
dec = C0 * np.expm1(np.asarray(Image.open(f"{outdir}/milkyway-cube.jpg").convert("RGB")).astype(np.float64) / 255 * LN)
rng = np.random.default_rng(7)
d = rng.normal(size=(200000, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
m = np.argmax(np.abs(d), axis=1); face = 2 * m + (d[np.arange(len(d)), m] < 0)
A = np.array([x[0] for x in AX]); U = np.array([x[1] for x in AX]); V = np.array([x[2] for x in AX])
dm = np.abs(d[np.arange(len(d)), m])
s = (d * U[face]).sum(1) / dm; t = (d * V[face]).sum(1) / dm
col, row = face % 3, face // 3
x = col * (N + 2 * G) + G + (s + 1) / 2 * N - 0.5; y = row * (N + 2 * G) + G + (1 - t) / 2 * N - 0.5
x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = (x - x0)[:, None], (y - y0)[:, None]
got = dec[y0, x0] * (1 - fx) * (1 - fy) + dec[y0, x0 + 1] * fx * (1 - fy) + dec[y0 + 1, x0] * (1 - fx) * fy + dec[y0 + 1, x0 + 1] * fx * fy
want = sample(d)
lum = lambda c: 0.2126 * c[:, 0] + 0.7152 * c[:, 1] + 0.0722 * c[:, 2]
ok = lum(want) > 5
err = np.abs(lum(got) - lum(want))[ok] / lum(want)[ok]
near_pole = np.abs(d[:, 2]) > 0.98
errp = np.abs(lum(got) - lum(want))[ok & near_pole] / lum(want)[ok & near_pole]
edge = (np.abs(s) > 0.995) | (np.abs(t) > 0.995)
erre = np.abs(lum(got) - lum(want))[ok & edge] / lum(want)[ok & edge]
meta = {"N": N, "gutter": G, "layout": "3 x 2 faces, face k at col k % 3, row k // 3", "faces": "see cube.py's doc",
        "C0": C0, "LN": LN, "decode": "S10 = C0 * (exp(byte / 255 * LN) - 1)",
        "check_vs_plate_carree": {"median": float(np.median(err)), "p99": float(np.percentile(err, 99)),
                                   "near_poles_median": float(np.median(errp)) if len(errp) else None,
                                   "at_face_edges_median": float(np.median(erre)) if len(erre) else None, "n": int(ok.sum())}}
json.dump(meta, open(f"{outdir}/milkyway-cube.json", "w"), indent=1)
import os
print(json.dumps(meta, indent=1)); print("jpg", os.path.getsize(f"{outdir}/milkyway-cube.jpg"), "png", os.path.getsize(f"{outdir}/milkyway-cube.png"))
