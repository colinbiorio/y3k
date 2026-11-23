"""ground-textures.py: Lord Howe Island's ground as the GPU carries it: seven scanned surfaces from Poly Haven (CC0),
graded to what the island's own ground reflects, packed two maps to a surface, and compressed for the GPU.

  python -I scripts/island/ground-textures.py fetch <downloads>            # the 2K scans, from Poly Haven's own API
  python -I scripts/island/ground-textures.py make <downloads> <work> <out>  # graded and packed; then basisu (below)

Needs numpy and Pillow, curl (fetch) and Basis Universal's `basisu` (2.x; Homebrew's basis_universal) for the last step.
<out> is src/game/island/ground/. What it writes:

  ground-colour.ktx2     the surfaces' colour (sRGB) and, in the alpha, their height (0 lowest, 1 highest of that scan):
                         one layer each, 1024 x 1024, a 2D array, ETC1S
  ground-surface.ktx2    their shape and finish (linear): the normal's x and y (OpenGL's way: y up the picture), the
                         roughness, the ambient occlusion; UASTC, zstd
  ground-colour-lite.ktx2, ground-surface-lite.ktx2    the same at 512, for phones and the plainer picture
  ground.json            the grading: each surface's scan, its real size, its mean albedo before and after

WHY GRADED. A scan's colour is what its camera saw under its own light, with its own exposure: Poly Haven's dark_rock_02
comes out at a mean albedo of 0.035 and its leafy_grass at 0.24 with its fallen leaves. On the island they are lit by the
true sky's measured light, so their brightness has to be the brightness of the real ground: coral sand reflects about
half the light (0.50 to 0.60), weathered basalt a tenth (0.10 to 0.15), grass about a tenth in the visible (its green
twice its red). Each scan is multiplied, channel by channel and in linear light, to the mean the island's ground has
(GRADE, below); its own variation, its shape (normal, height), its roughness and its occlusion are kept as scanned.

WHY THESE SEVEN (judged against photographs of Lord Howe: the brief's Sources):
  sand    aerial_beach_01  30 m   pale rippled beach sand; its grey turned to coral sand's cream
  grass   leafy_grass       2 m   the lowland grass; greened (kikuyu, not a dry lawn)
  litter  forest_leaves_03  2.3 m the palm forest's floor: dark leaf litter
  rock    rock_3            1.5 m weathered, pitted rock: the mid-slopes (vesicular basalt)
  cliff   dark_rock_02      2 m   the cliff faces: fractured, layered dark rock
  shore   low_tide_rocks    2.2 m pebbles and rubble where the sea meets rock, and the reef's flats
  face    aerial_rocks_02  50 m   the cliffs seen from far off: outcrops, ledges, the green on them
damp_beach_sand (olive), coral_gravel and coast_land_rocks_01 (orange, red) were downloaded and judged wrong for the island.

The order of the layers is the shaders' (island/terrain.js LAYER)."""
import hashlib, json, os, subprocess, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
LAYERS = [
    # name, Poly Haven id, the scan's real side (m), the mean linear albedo it is graded to (dry, under white light): three
    # numbers, each channel multiplied to its own (the scan's hue turned to the island's), or one, the luminance, all three
    # channels multiplied alike (its hue kept: the large-scale face has grey rock and green moss in one scan, and a gain
    # per channel turned its rock lavender)
    ("sand", "aerial_beach_01", 30.0, (0.58, 0.53, 0.43)),
    ("grass", "leafy_grass", 2.0, (0.075, 0.13, 0.035)),
    ("litter", "forest_leaves_03", 2.3, (0.10, 0.075, 0.045)),
    ("rock", "rock_3", 1.5, (0.135, 0.125, 0.112)),
    ("cliff", "dark_rock_02", 2.0, (0.098, 0.088, 0.077)),
    ("shore", "low_tide_rocks", 2.17, (0.16, 0.15, 0.135)),
    ("face", "aerial_rocks_02", 50.0, 0.10),
]
LUMA = np.array([0.2126, 0.7152, 0.0722])
MAPS = [("Diffuse", "diffuse", ("jpg", "png")), ("nor_gl", "nor_gl", ("jpg", "png")), ("Rough", "rough", ("jpg", "png")),
        ("AO", "ao", ("jpg", "png")), ("Displacement", "displacement", ("png", "jpg"))]


def fetch(dl):
    """The 2K scans, through curl (this Python may have no certificate bundle of its own), with their sha256."""
    ua = "y3k-island-ground (open-source game; Poly Haven credited)"
    get = lambda url: subprocess.run(["curl", "-sS", "-f", "-m", "300", "-A", ua, url], check=True, capture_output=True).stdout
    manifest = {"source": "Poly Haven (polyhaven.com), CC0 1.0", "assets": {}}
    for _, a, _, _ in LAYERS:
        files = json.loads(get(f"https://api.polyhaven.com/files/{a}"))
        os.makedirs(f"{dl}/{a}", exist_ok=True)
        got = {}
        for key, name, fmts in MAPS:
            res = files.get(key, {}).get("2k")
            for f in fmts if res else ():
                if f in res:
                    data = get(res[f]["url"])
                    open(f"{dl}/{a}/{name}.{f}", "wb").write(data)
                    got[name] = {"url": res[f]["url"], "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                    break
        manifest["assets"][a] = {"page": f"https://polyhaven.com/a/{a}", "maps": got}
        print(a, {k: v["bytes"] // 1024 for k, v in got.items()}, flush=True)
    json.dump(manifest, open(f"{dl}/manifest.json", "w"), indent=1)


def srgb_to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def load(path, mode=None):
    im = Image.open(path)
    a = np.asarray(im)
    if a.dtype == np.uint16 or im.mode in ("I;16", "I;16B", "I"):
        return a.astype(np.float64) / 65535.0
    a = a.astype(np.float64) / 255.0
    return a


def find(dl, a, name):
    for ext in ("png", "jpg"):
        p = f"{dl}/{a}/{name}.{ext}"
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"{dl}/{a}/{name}.*")


def halve(a):
    """2 x 2 box: each texel the mean of the four under it."""
    h, w = a.shape[:2]
    return a.reshape(h // 2, 2, w // 2, 2, *a.shape[2:]).mean(axis=(1, 3))


def to_size(a, n):
    while a.shape[0] > n:
        a = halve(a)
    return a


def grey(a):
    return a if a.ndim == 2 else a[..., :3] @ np.array([0.2126, 0.7152, 0.0722]) if a.shape[2] >= 3 else a[..., 0]


def make(dl, work, out):
    os.makedirs(work, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    notes = {"layers": []}
    for size, tag in ((1024, ""), (512, "-lite")):
        colour, surface = [], []
        for name, a, side, target in LAYERS:
            # colour: to linear, to size (in linear light), graded channel by channel to the island's mean
            d = srgb_to_lin(load(find(dl, a, "diffuse"))[..., :3])
            d = to_size(d, size)
            mean = d.reshape(-1, 3).mean(0)
            gain = np.array(target) / mean if isinstance(target, tuple) else np.full(3, target / float(mean @ LUMA))
            d = d * gain
            clipped = float((d > 1).any(axis=2).mean())
            # height: the scan's displacement, its 1st to 99th percentile made 0..1
            hgt = grey(load(find(dl, a, "displacement")))
            hgt = to_size(hgt, size)
            lo, hi = np.percentile(hgt, [1, 99])
            hgt = np.clip((hgt - lo) / max(hi - lo, 1e-6), 0, 1)
            # the normal (OpenGL's: green up the picture), averaged as vectors and made unit again
            nrm = load(find(dl, a, "nor_gl"))[..., :3] * 2 - 1
            nrm = to_size(nrm, size)
            nrm /= np.linalg.norm(nrm, axis=2, keepdims=True) + 1e-9
            rough = to_size(grey(load(find(dl, a, "rough"))), size)
            ao = to_size(grey(load(find(dl, a, "ao"))), size)
            rgba = np.dstack([lin_to_srgb(d), hgt])
            surf = np.dstack([nrm[..., 0] * 0.5 + 0.5, nrm[..., 1] * 0.5 + 0.5, rough, ao])
            pc = f"{work}/{name}-colour{tag}.png"
            ps = f"{work}/{name}-surface{tag}.png"
            Image.fromarray(np.round(rgba * 255).astype(np.uint8), "RGBA").save(pc)
            Image.fromarray(np.round(np.clip(surf, 0, 1) * 255).astype(np.uint8), "RGBA").save(ps)
            colour.append(pc)
            surface.append(ps)
            if not tag:
                notes["layers"].append({"name": name, "scan": a, "page": f"https://polyhaven.com/a/{a}", "side_m": side,
                                        "albedo_scan": [round(x, 4) for x in mean], "albedo_graded": [round(x, 4) for x in mean * gain],
                                        "gain": [round(x, 3) for x in gain], "texels_over_one": round(clipped, 5),
                                        "rough_mean": round(float(rough.mean()), 3), "ao_mean": round(float(ao.mean()), 3)})
            print(name, size, "albedo", np.round(mean, 4), "->", np.round(mean * gain, 4), "gain", np.round(gain, 2), "over 1:", clipped, flush=True)
        # the two arrays, through basisu, each picture flipped so its first row is the bottom one (the GPU's t = 0): a
        # texel's place in the picture and its normal's green then point the same way. The smaller levels are made by
        # the tool (the colour's in linear light). The colour as ETC1S at its finest (-q 255): measured on the cliff's
        # layer, 370 KB at 36.5 dB where UASTC came to the same 36.9 dB at 870 KB (a scan's grain is noise to an LZ
        # coder: UASTC's rate-distortion pass bought 10%). The surface as UASTC (its rate-distortion pass at 2): ETC1S's
        # shared endpoints draw a normal map's blocks as facets in the light.
        for kind, files, codec in (("colour", colour, ["-etc1s", "-q", "255", "-srgb"]),
                                   ("surface", surface, ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "2", "-linear", "-mip_linear"])):
            dst = f"{out}/ground-{kind}{tag}.ktx2"
            cmd = ["basisu", "-tex_array", *codec, "-mipmap", "-y_flip", "-ktx2", "-quiet", "-output_file", dst, *files]
            subprocess.run(cmd, check=True)
            print(dst, os.path.getsize(dst), "bytes", flush=True)
    json.dump(notes, open(f"{out}/ground.json", "w"), indent=1)



if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "fetch":
        fetch(sys.argv[2])
    elif len(sys.argv) >= 5 and sys.argv[1] == "make":
        make(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
        sys.exit(2)
