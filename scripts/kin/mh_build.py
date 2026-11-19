"""Build the human's head, hands and hair from MakeHuman's CC0 assets, for src/game/bodies/kin.js.

usage: python -I scripts/kin/mh_build.py <data-dir> src/game/bodies/kin.js   (numpy)

<data-dir> holds, from github.com/makehumancommunity/makehuman (makehuman/data/, released CC0 1.0 in September 2020):
3dobjs/base.obj, rigs/default.mhskel, rigs/default_weights.mhw and the six targets/macrodetails/{african,asian,caucasian}-
{female,male}-young.target, each in the folder itself. They are read as text and JSON only.

What comes out is in the game's own frames (src/game/bodies/biped.js): the head in the head bone's (y up from the
top of the neck, the face toward +z, eyes at y = 0.132 as the drawn head had them), a left hand in the hand bone's
(the fingers toward -y, the thumb toward +z, the palm toward -x: the body's middle). Quantised: positions to
10 micrometres in int16, normals in int8 (taken across UV seams, so the seams do not show), UVs in uint16, tints
in uint8 (lips, brows, the shade of creases), triangles in uint16.
"""
import base64
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mh_load import load, descendants, region  # noqa: E402

data, out = sys.argv[1], sys.argv[2]
V, faces_v, bones, weights = load(data)

# faces again, with their UV corners (load() keeps vertex indices only)
VT, corners = [], []
cur = None
for line in open(f'{data}/base.obj'):
    if line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        cur = line.split()[1]
    elif line.startswith('f '):
        corners.append((cur, [tuple(int(x) - 1 for x in t.split('/')[:2]) for t in line.split()[1:]]))
VT = np.array(VT)


def piece(verts, group='body'):
    """the faces of `group` with every corner in `verts`: (original vertex per corner-vertex, uv, triangles)"""
    key, src, uv, tris = {}, [], [], []
    for g, f in corners:
        if g != group or not all(v in verts for v, _ in f):
            continue
        ids = []
        for v, t in f:
            if (v, t) not in key:
                key[(v, t)] = len(src)
                src.append(v)
                uv.append(VT[t])
            ids.append(key[(v, t)])
        for k in range(1, len(ids) - 1):
            tris.append((ids[0], ids[k], ids[k + 1]))
    return np.array(src), np.array(uv), np.array(tris)


def smooth_normals(P, src, T):
    """normals summed over the original vertex (so a UV seam, which splits a vertex, does not split its normal)"""
    acc = np.zeros((len(V), 3))
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    n = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(acc, src[T[:, k]], n)
    N = acc[src]
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def rot(axis, ang):
    a = axis / np.linalg.norm(axis)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K


# ---------------------------------------------------------------- the hand, relaxed: its fingers curled a little, by its own bones
wrist = bones['wrist.L']
o = wrist['head']
along = bones['finger3-1.L']['head'] - o
along /= np.linalg.norm(along)
thumb = bones['finger1-1.L']['head'] - o
thumb -= along * (thumb @ along)
thumb /= np.linalg.norm(thumb)
palm = np.cross(along, thumb)                              # a left hand: fingers x thumb is out of the palm
CURL = {1: (0.12, 0.2, 0.16), 2: (0.2, 0.3, 0.22), 3: (0.24, 0.34, 0.24), 4: (0.28, 0.38, 0.26), 5: (0.32, 0.42, 0.28)}
# the hand closed on a haft (Colin, 19 Nov 2026: "the character actually held the weapon in its hand"): the fingers
# wrapped round a grip some four centimetres through, the thumb laid over them
GRIP = {1: (0.55, 0.45, 0.35), 2: (1.25, 1.45, 0.75), 3: (1.3, 1.5, 0.8), 4: (1.35, 1.5, 0.8), 5: (1.4, 1.45, 0.75)}
handB = descendants(bones, 'wrist.L')
hv = region(weights, handB)
hsrc, huv, htri = piece(hv)
HP = V[hsrc].copy()


def pose_hand(curl):
    M = {}                                                     # bone -> (R, t): x -> R x + t, in the rest pose's space

    def frame_of(name):
        if name in M:
            return M[name]
        b = bones[name]
        pr, pt = frame_of(b['parent']) if b['parent'] in bones and b['parent'] != 'lowerarm02.L' and b['parent'] in descendants(bones, 'wrist.L') else (np.eye(3), np.zeros(3))
        R = np.eye(3)
        if name.startswith('finger'):
            f, seg = int(name[6]), int(name[8])
            d = b['tail'] - b['head']
            d /= np.linalg.norm(d)
            R = rot(np.cross(d, palm), curl[f][seg - 1])
        h = b['head']
        # x -> parent(R (x - h) + h)
        Rc, tc = pr @ R, pr @ (h - R @ h) + pt
        M[name] = (Rc, tc)
        return M[name]

    posed = np.zeros_like(HP)
    for i, v in enumerate(hsrc):
        ws = {b: w for b, w in weights.get(int(v), {}).items() if b in handB}
        tot = sum(ws.values())
        for b, w in ws.items():
            R, t = frame_of(b)
            posed[i] += (w / tot) * (R @ HP[i] + t)
    # into the hand bone's frame: x toward the palm's back... the palm toward -x, fingers -y, thumb +z
    ex, ey, ez = -palm, -along, thumb
    H = np.stack([(posed - o) @ ex, (posed - o) @ ey, (posed - o) @ ez], axis=1)
    H[:, 1] += 0.012                                       # the wrist's crease a little inside the sleeve
    return H


Hloc = pose_hand(CURL)
Hgrip = pose_hand(GRIP)

# ---------------------------------------------------------------- the head
headB = descendants(bones, 'neck01')
eye = bones['eye.L']['head']
shift = np.array([0.0, 0.132 - 0.012 - eye[1], -(bones['neck01']['head'][2] + 0.002)])      # seated 12 mm lower than the drawn head's eyes: a shorter neck, the chin still clear of a collar
CUT, GROW = -0.02, 1.06                                    # the neck is cut level here; the head is drawn 6 % larger than MakeHuman's
pivot = np.array([0.0, CUT, 0.0])
place = lambda X: (X + shift - pivot) * GROW + pivot
hs = {v for v in region(weights, headB) if place(V[v])[1] > CUT}
src, uv, tri = piece(hs)
P = place(V[src])
edge = {}
for t in tri:
    for a_, b_ in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
        k = (min(src[a_], src[b_]), max(src[a_], src[b_])); edge[k] = edge.get(k, 0) + 1
rim = {v for k, n in edge.items() if n == 1 for v in k}
low = np.array([s_ in rim and P[i, 1] < CUT + 0.02 for i, s_ in enumerate(src)])
P[low, 1] = CUT                                             # the neck's rim, level
ring = P[low]
print('neck rim', len(ring), 'half-width', round(float(np.abs(ring[:, 0]).max()), 4), 'z', round(float(ring[:, 2].min()), 4), round(float(ring[:, 2].max()), 4))
E = [place(V[sorted({v for g, f in faces_v if g == f'helper-{s}-eye' for v in f})]) for s in ('l', 'r')]
eyes = [[*e.mean(axis=0), (e.max(axis=0) - e.min(axis=0)).max() / 2] for e in E]

# tints: the lips (the mouth's ring of muscle), the brows (an arc above each eye), the creases (where the surface folds in)
names = {b for b in bones if b.startswith('oris')}
lip = np.array([sum(w for b, w in weights.get(int(v), {}).items() if b in names) for v in src])
lip = np.clip((lip - 0.55) / 0.3, 0, 1) ** 1.5
brow = np.zeros(len(P))
for (ex_, ey_, ez_, er) in eyes:
    dx = (P[:, 0] - ex_) / 0.026
    mid = ey_ + 0.017 + 0.005 * (1 - np.clip(dx, -1.2, 1.2) ** 2) - 0.004 * np.clip(dx, 0, 1)
    k = np.exp(-((P[:, 1] - mid) / 0.0058) ** 2) * np.clip(1.3 - np.abs(dx + 0.12), 0, 1) * (P[:, 2] > ez_ - 0.01)
    brow = np.maximum(brow, np.clip(k * 1.8, 0, 1) * 0.85)
N = smooth_normals(P, src, tri)
lap = np.zeros((len(V), 3)); cnt = np.zeros(len(V))
for a_, b_ in ((0, 1), (1, 2), (2, 0)):
    for s_, t_ in ((tri[:, a_], tri[:, b_]), (tri[:, b_], tri[:, a_])):
        np.add.at(lap, src[s_], P[t_] - P[s_]); np.add.at(cnt, src[s_], 1)
lap = lap[src] / np.maximum(cnt[src], 1)[:, None]
crease = np.clip(-(lap * N).sum(axis=1) / 0.0012, -1, 1)        # > 0 folding in
shade = 1 - 0.22 * np.clip(crease, 0, 1)
col = np.ones((len(P), 3))
col *= shade[:, None]
col = col * (1 - lip[:, None]) + col * np.array([0.92, 0.72, 0.7]) * lip[:, None]
hairtone = np.array([0.25, 0.19, 0.16])
col = col * (1 - brow[:, None]) + hairtone * brow[:, None]

# ---------------------------------------------------------------- hair: a shell over the scalp, smooth (PN triangles), fading to just
# under the skin along a hairline that is a function (so its edge is clean), thickest on the crown
EYE_Y = eyes[0][1]
zc = (P[:, 2].min() + 0.125 * GROW) / 2
def hairline(X):
    phi = np.arctan2(X[:, 0], X[:, 2] - zc)
    a = np.abs(phi)
    up = 0.007 + 0.079 * np.cos(phi) - 0.018 * np.cos(2 * phi) - 0.03 * np.exp(-((a - 1.3) / 0.11) ** 2)    # the sideburns, before the ears
    return EYE_Y + GROW * up

def vnoise(X, f, seed):
    q = X * f; i = np.floor(q).astype(np.int64); r = q - i; r = r * r * (3 - 2 * r)
    def h(dx, dy, dz):
        n = (i[:, 0] + dx) * 73856093 ^ (i[:, 1] + dy) * 19349663 ^ (i[:, 2] + dz) * 83492791 ^ seed
        return ((n * 2654435761) % 4294967296) / 4294967296.0
    acc = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (r[:, 0] if dx else 1 - r[:, 0]) * (r[:, 1] if dy else 1 - r[:, 1]) * (r[:, 2] if dz else 1 - r[:, 2])
                acc = acc + w * h(dx, dy, dz)
    return acc

def inormals(X, T):
    N = np.zeros_like(X); a_, b_, c_ = X[T[:, 0]], X[T[:, 1]], X[T[:, 2]]; n = np.cross(b_ - a_, c_ - a_)
    for k in range(3): np.add.at(N, T[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)

def pn_subdivide(Pc, Nc, T, n):
    key, out, tris = {}, [], []
    def vid(k, p):
        if k not in key: key[k] = len(out); out.append(p)
        return key[k]
    for ti, (a_, b_, c_) in enumerate(T):
        P1, P2, P3, N1, N2, N3 = Pc[a_], Pc[b_], Pc[c_], Nc[a_], Nc[b_], Nc[c_]
        b210 = (2 * P1 + P2 - ((P2 - P1) @ N1) * N1) / 3; b120 = (2 * P2 + P1 - ((P1 - P2) @ N2) * N2) / 3
        b021 = (2 * P2 + P3 - ((P3 - P2) @ N2) * N2) / 3; b012 = (2 * P3 + P2 - ((P2 - P3) @ N3) * N3) / 3
        b102 = (2 * P3 + P1 - ((P1 - P3) @ N3) * N3) / 3; b201 = (2 * P1 + P3 - ((P3 - P1) @ N1) * N1) / 3
        E_ = (b210 + b120 + b021 + b012 + b102 + b201) / 6; b111 = E_ + (E_ - (P1 + P2 + P3) / 3) / 2
        ids = {}
        for i in range(n + 1):
            for j in range(n + 1 - i):
                k = n - i - j; W, U, Q = i / n, j / n, k / n
                p_ = (P1 * W ** 3 + P2 * U ** 3 + P3 * Q ** 3 + b210 * 3 * W * W * U + b120 * 3 * W * U * U + b201 * 3 * W * W * Q
                      + b021 * 3 * U * U * Q + b102 * 3 * W * Q * Q + b012 * 3 * U * Q * Q + b111 * 6 * W * U * Q)
                if i == n: kk = ('v', a_)
                elif j == n: kk = ('v', b_)
                elif k == n: kk = ('v', c_)
                elif k == 0: kk = ('e', a_, b_, j) if a_ < b_ else ('e', b_, a_, i)
                elif i == 0: kk = ('e', b_, c_, k) if b_ < c_ else ('e', c_, b_, j)
                elif j == 0: kk = ('e', c_, a_, i) if c_ < a_ else ('e', a_, c_, k)
                else: kk = ('f', ti, i, j)
                ids[(i, j)] = vid(kk, p_)
        base = np.cross(P2 - P1, P3 - P1)
        for i in range(n):
            for j in range(n - i):
                tri3 = [ids[(i + 1, j)], ids[(i, j + 1)], ids[(i, j)]]
                tris.append(tri3)
                if i + j <= n - 2:
                    tris.append([ids[(i + 1, j + 1)], ids[(i, j + 1)], ids[(i + 1, j)]])
        # every small triangle faces as the large one did
        for m in range(len(tris) - (n * n), len(tris)):
            A, B, C = (np.array(out[x]) for x in tris[m])
            if np.cross(B - A, C - A) @ base < 0: tris[m] = [tris[m][0], tris[m][2], tris[m][1]]
    return np.array(out), np.array(tris)

margin = (P[:, 1] > hairline(P) - 0.02 * GROW) & ((np.abs(P[:, 0]) < 0.0765 * GROW) | (P[:, 1] > EYE_Y + 0.04 * GROW))
first = {}
for i_, s_ in enumerate(src):
    first.setdefault(int(s_), i_)
Torig = src[tri]
keep = np.array([all(margin[first[int(v)]] for v in t) for t in Torig])
Treg = Torig[keep]
ids_ = sorted({int(v) for v in Treg.ravel()})
remap = {v: k for k, v in enumerate(ids_)}
Pc = np.array([P[first[v]] for v in ids_]); Nc = np.array([N[first[v]] for v in ids_])
Tc = np.array([[remap[int(v)] for v in t] for t in Treg])

def shell(thick, crown, clump, n):
    S0, ST = pn_subdivide(Pc, Nc, Tc, n)
    SN0 = inormals(S0, ST)
    rise = np.clip((S0[:, 1] - hairline(S0) + 0.003) / 0.015, 0, 1)
    rise = rise * rise * (3 - 2 * rise)
    t = thick * (1 + crown * np.clip((S0[:, 1] - EYE_Y - 0.04) / 0.07, 0, 1))
    if clump:
        t = t + clump * (vnoise(S0, 110, 7) + 0.5 * vnoise(S0, 260, 11) - 0.75)
    t = -0.0016 + (t + 0.0016) * rise
    S = S0 + SN0 * t[:, None]
    return S, ST, inormals(S, ST), SN0

crop, cropT, cropN, baseN = shell(0.0085, 1.3, 0.004, 3)
shaved, shavedT, shavedN, _ = shell(0.0017, 0.0, 0.0, 2)
on_back = (np.abs(crop[:, 0]) < 0.012)
back = lambda y: float(crop[on_back & (np.abs(crop[:, 1] - y) < 0.012)][:, 2].min())
# points for curls: spread over the crown and the back of the crop, as far from each other as can be
rise_c = crop[:, 1] - hairline(crop)
cand = np.nonzero((rise_c > 0.01) & ((crop[:, 1] > EYE_Y + 0.02) | (crop[:, 2] < zc)))[0]
pick = [cand[np.argmax(crop[cand, 1])]]
dmin = np.linalg.norm(crop[cand] - crop[pick[0]], axis=1)
while len(pick) < 36:
    j = cand[np.argmax(dmin)]
    pick.append(j)
    dmin = np.minimum(dmin, np.linalg.norm(crop[cand] - crop[j], axis=1))
curls = [[*crop[j], *cropN[j]] for j in pick]

# ---------------------------------------------------------------- out
def q16(a, k=1e5):
    a = np.round(np.asarray(a) * k)
    assert np.abs(a).max() < 32767, np.abs(a).max()
    return base64.b64encode(a.astype('<i2').tobytes()).decode()


b64 = lambda a, t: base64.b64encode(np.asarray(a).astype(t).tobytes()).decode()
uv16 = lambda u: b64(np.clip(np.round(u * 65535), 0, 65535), '<u2')
n8 = lambda n: b64(np.clip(np.round(n * 127), -127, 127), 'i1')
c8 = lambda c: b64(np.clip(np.round(c * 255), 0, 255), 'u1')
HN = smooth_normals(Hloc, hsrc, htri)
HGN = smooth_normals(Hgrip, hsrc, htri)


def part(name, Pp, Nn, U, T, C=None):
    s = f"export const {name} = {{ n: {len(Pp)}, pos: '{q16(Pp)}', nrm: '{n8(Nn)}'" + (f", uv: '{uv16(U)}'" if U is not None else '') + f", idx: '{b64(T.ravel(), '<u2')}'"
    return s + (f", col: '{c8(C)}' }};\n" if C is not None else ' };\n')


r5 = lambda x: round(float(x), 5)
js = ["""// kin.js — THE HUMAN'S FACE AND HANDS, made from MakeHuman's base mesh (hm08) and its default skeleton, which its
// makers released as CC0 1.0 in September 2020 (makehumancommunity/makehuman, LICENSE.md: "The base mesh and proxies",
// "Targets and modifiers": "released under CC0 1.0 Universal"). A neutral adult: half one sex and half the other, a
// third of each of its three ethnic shapes, aged twenty-five; the hands curled a little by their own bones.
// Generated, not written (scripts/kin/mh_build.py): numbers only, decoded by ./human.js. In the head bone's frame and the hand bone's
// (./biped.js); positions in units of 10 micrometres.
""",
      part('HEAD', P, N, uv, tri, col),
      part('HAND', Hloc, HN, huv, htri),
      f"export const HAND_GRIP = {{ n: {len(Hgrip)}, pos: '{q16(Hgrip)}', nrm: '{n8(HGN)}', uv: HAND.uv, idx: HAND.idx }};   // the same hand closed: its own places, the open one's map and triangles\n",
      part('CROP', crop, cropN, None, cropT),
      part('SHAVED', shaved, shavedN, None, shavedT),
      f"export const EYES = {[[r5(x) for x in e] for e in eyes]};\n",
      f"export const HAIR_AT = {{ tail: [0, 0.168, {r5(back(0.168) - 0.004)}], braid: [0, 0.1, {r5(back(0.1) - 0.006)}] }};\n",
      f"export const CURLS = {[[r5(x) for x in c] for c in curls]};\n"]
open(out, 'w').write(''.join(js))
print('head', len(P), 'tris', len(tri), '| hand', len(Hloc), len(htri), '| crop', len(crop), len(cropT), '| shaved', len(shaved), len(shavedT), '| eyes', [[r5(x) for x in e] for e in eyes])
print('head bbox', P.min(0).round(3), P.max(0).round(3), '| hand bbox', Hloc.min(0).round(3), Hloc.max(0).round(3), '| grip bbox', Hgrip.min(0).round(3), Hgrip.max(0).round(3))
print('lip verts', int((lip > 0.5).sum()), 'brow verts', int((brow > 0.5).sum()), 'crease', round(float(crease.max()), 2))
print('hair at', back(0.168), back(0.1), 'size', os.path.getsize(out))
