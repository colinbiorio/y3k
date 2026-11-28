"""rock-textures.py: the pictures of Lord Howe Island's rocks and of the beach's things, as the GPU carries them: the
scans rocks-build.mjs cut down (Poly Haven, CC0), their colour graded to what the island's own rock, wood and coral
reflect, their shape turned into a normal map any level of detail can read.

  python -I scripts/island/rock-textures.py make <downloads> <work> <out>     # after rocks-build.mjs make; then basisu

Needs numpy and Pillow, and Basis Universal's `basisu` (2.x). <out> is src/game/island/rocks/. What it writes:

  rocks-colour.ktx2    each layer's colour (sRGB): 1024 x 1024, a 2D array, ETC1S
  rocks-surface.ktx2   its normal IN THE MODEL'S OWN SPACE (x, y, z as 0..1) and, in the alpha, its ambient occlusion:
                       512 x 512, UASTC, zstd (a direction that may point any way packs poorly: at 1024 the six layers
                       came to 5.9 MB; the finest grain of a rock near the eye is the land's own scans', read over it)
  rocks-colour-lite.ktx2, rocks-surface-lite.ktx2    the same at 512 and 256, for phones and the plainer picture
  rocks.json           the grading: each model's scan, its mean albedo before and after

WHY A NORMAL IN THE MODEL'S OWN SPACE. A scan's normal map is in its surface's own frame (tangent space), and is only
right on the scan's own triangles. A rock cut down to 3,000, 600 or 130 triangles has other triangles; but its texture
coordinates are the scan's own (the simplifier keeps the scan's points). So at every texel the scan's true normal there
is worked out once (rocks-build.mjs draws the whole scan's normal and tangent into the texture's own space; here the
scan's map is turned by them), and kept as a direction in the model's space. Any level reads it by the same coordinates,
and is lit as the whole scan would be: a level's own triangles are only its outline.

WHY GRADED (as ground-textures.py says of the ground): a scan's colour is what its camera saw under its own light. The
scans are Namaqualand granite, a Cape trail's sandstone, a quiver tree's branch; on the island they stand for basalt
talus, sea-rounded basalt, drift wood and coral rubble, under the true sky's measured light. Each is multiplied, channel
by channel in linear light, to the island's mean (GRADE): the basalt PR 1 measured on the cliffs (0.09, dark grey-brown),
the same rock sea-worn and dry (paler: 0.13), sun-bleached wood (0.38), dead coral (0.48); the shell keeps its own hue.
Half of each texel's own leaning from its scan's mean hue is kept (rust, lichen, a paler vein), half taken out: a
granite's orange is not a basalt's.

The layers' order is the shaders' (island/stones.js) and rocks-build.mjs's MODELS."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
# name: the mean linear albedo it is graded to (dry, under white light; three numbers: each channel to its own; one: the
# luminance, its hue kept), and how much of each texel's own hue is kept
GRADE = {
    "slab": ((0.104, 0.094, 0.082), 0.5),
    "chunk": ((0.097, 0.088, 0.077), 0.5),
    "shard": ((0.088, 0.081, 0.073), 0.5),
    "boulder": ((0.138, 0.131, 0.120), 0.4),
    "cobble": ((0.128, 0.122, 0.112), 0.4),
    "stick": ((0.40, 0.37, 0.32), 0.6),
    "log": ((0.36, 0.335, 0.29), 0.6),
    "shell": (0.42, 1.0),
    "coral": ((0.50, 0.48, 0.42), 0.5),
}
LUMA = np.array([0.2126, 0.7152, 0.0722])
SIZE = 1024


def srgb_to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0


def to_side(a, n):
    """a picture to n texels a side (2 x 2 means, in whatever light it is in)"""
    while a.shape[0] > n:
        h, w = a.shape[:2]
        a = a.reshape(h // 2, 2, w // 2, 2, *a.shape[2:]).mean(axis=(1, 3))
    return a


def spread(a, mask, rounds=64):
    """texels no triangle covers take the mean of the covered ones beside them, outward (a texture's gutter)"""
    a = a.copy(); m = mask.copy()
    for _ in range(rounds):
        if m.all():
            break
        acc = np.zeros_like(a); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sm = np.roll(m, (dy, dx), (0, 1)); sa = np.roll(a, (dy, dx), (0, 1))
            if dy == 1: sm[0, :] = False
            if dy == -1: sm[-1, :] = False
            if dx == 1: sm[:, 0] = False
            if dx == -1: sm[:, -1] = False
            acc += sa * sm[..., None]; cnt += sm
        new = (~m) & (cnt > 0)
        a[new] = acc[new] / cnt[new][:, None]; m |= new
    return a


def one(dl, work, M, side):
    """one model's two pictures: its colour at `side` texels, its normal and occlusion at half that; and its notes"""
    a, R = M["scan"], M["bake"]
    tex = f"{dl}/{a}/textures/{a}"
    fr = np.fromfile(f"{work}/{M['frame']}", dtype=np.float32).reshape(R, R, 7)
    N, T, hand = fr[..., 0:3], fr[..., 3:6], fr[..., 6]
    mask = hand != 0
    B = np.cross(N, T) * hand[..., None]
    nt = to_side(load(f"{tex}_nor_gl_2k.jpg"), R) * 2 - 1
    n = T * nt[..., 0:1] + B * nt[..., 1:2] + N * nt[..., 2:3]
    del fr, T, B, nt
    # to its size: the covered texels' mean (as vectors), made unit again; then its gutter
    k = R // side
    w = mask.reshape(side, k, side, k).sum(axis=(1, 3)).astype(np.float32)
    n = (n * mask[..., None]).reshape(side, k, side, k, 3).sum(axis=(1, 3))
    m2 = w > 0
    n[m2] /= np.linalg.norm(n[m2], axis=1, keepdims=True) + 1e-9
    n = spread(n, m2); n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-9
    # colour: linear, to size, graded over the covered texels
    d = to_side(srgb_to_lin(load(f"{tex}_diff_2k.jpg")), side)
    mean = d[m2].mean(0)
    target, keep = GRADE[M["name"]]
    if isinstance(target, tuple):
        t = np.array(target)
        # each texel: its luminance's share of the scan's mean, in the island's hue; and half its own hue's leaning kept
        rel = (d @ LUMA) / float(mean @ LUMA)
        d = (1 - keep) * rel[..., None] * t + keep * d * (t / mean)
    else:
        d = d * (target / float(mean @ LUMA))
    after = d[m2].mean(0)
    arm = to_side(load(f"{tex}_arm_2k.jpg"), side)
    # the surface at half the colour's side: the normals' mean, made unit again; the occlusion
    n = to_side(n, side // 2); n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-9
    col = lin_to_srgb(d)
    srf = np.dstack([n * 0.5 + 0.5, to_side(arm[..., 0], side // 2)])
    note = {"name": M["name"], "scan": a, "page": f"https://polyhaven.com/a/{a}", "layer": M["layer"], "cell": M["cell"],
            "albedo_scan": [round(float(x), 4) for x in mean], "albedo_graded": [round(float(x), 4) for x in after],
            "texels_over_one": round(float((d[m2] > 1).any(axis=1).mean()), 5), "covered": round(float(m2.mean()), 3),
            "rough_mean": round(float(arm[..., 1][m2].mean()), 3), "ao_mean": round(float(arm[..., 0][m2].mean()), 3)}
    return col, srf, note


def make(dl, work, out):
    os.makedirs(out, exist_ok=True)
    bake = json.load(open(f"{work}/rocks-bake.json"))
    layers = max(m["layer"] for m in bake["models"]) + 1
    notes = {"layers": layers, "models": []}
    for size, tag in ((SIZE, ""), (SIZE // 2, "-lite")):
        colour = [np.zeros((size, size, 3), np.float32) for _ in range(layers)]
        surface = [np.zeros((size // 2, size // 2, 4), np.float32) for _ in range(layers)]
        for M in bake["models"]:
            cx, cy, cn = M["cell"]; side = size // cn
            col, srf, note = one(dl, work, M, side)
            colour[M["layer"]][cy * side:(cy + 1) * side, cx * side:(cx + 1) * side] = col
            h = side // 2
            surface[M["layer"]][cy * h:(cy + 1) * h, cx * h:(cx + 1) * h] = srf
            if not tag:
                notes["models"].append(note)
            print(M["name"], size, "albedo", note["albedo_scan"], "->", note["albedo_graded"], "covered", note["covered"], flush=True)
        files = {"colour": [], "surface": []}
        for i in range(layers):
            for kind, pics in (("colour", colour), ("surface", surface)):
                p = f"{work}/layer{i}-{kind}{tag}.png"
                Image.fromarray(np.round(np.clip(pics[i], 0, 1) * 255).astype(np.uint8), "RGB" if kind == "colour" else "RGBA").save(p)
                files[kind].append(p)
        # the two arrays, through basisu (as ground-textures.py makes the ground's: each picture flipped so its first row
        # is the GPU's t = 0; the colour ETC1S at its finest; the surface UASTC, whose blocks do not facet a normal)
        for kind, codec in (("colour", ["-etc1s", "-q", "255", "-srgb"]),
                            ("surface", ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "3", "-linear", "-mip_linear"])):
            dst = f"{out}/rocks-{kind}{tag}.ktx2"
            subprocess.run(["basisu", "-tex_array", *codec, "-mipmap", "-y_flip", "-ktx2", "-quiet", "-output_file", dst, *files[kind]], check=True)
            print(dst, os.path.getsize(dst), "bytes", flush=True)
    json.dump(notes, open(f"{out}/rocks.json", "w"), indent=1)


if __name__ == "__main__":
    if len(sys.argv) >= 5 and sys.argv[1] == "make":
        make(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
        sys.exit(2)
