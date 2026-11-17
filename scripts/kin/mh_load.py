"""Load MakeHuman's CC0 hm08 base mesh, shape it with the macro targets, and give its skeleton.

Reads only text and JSON (no pickles): base.obj, *.target, default.mhskel, default_weights.mhw.
Units out: metres; MakeHuman's own are decimetres. Axes: y up, z the way the face looks, x to the body's left.
"""
import json
import numpy as np


def load(data, mix=None):
    V, faces, cur = [], [], None
    for line in open(f'{data}/base.obj'):
        if line.startswith('v '):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            cur = line.split()[1]
        elif line.startswith('f '):
            faces.append((cur, [int(t.split('/')[0]) - 1 for t in line.split()[1:]]))
    V = np.array(V, dtype=np.float64)
    # a neutral adult: half one sex and half the other, a third of each of the three ethnic targets, aged 25
    mix = mix or {f'{e}-{g}-young': 1 / 6 for e in ('african', 'asian', 'caucasian') for g in ('female', 'male')}
    for name, w in mix.items():
        for line in open(f'{data}/{name}.target'):
            if line.startswith('#') or not line.strip():
                continue
            i, dx, dy, dz = line.split()
            V[int(i)] += w * np.array([float(dx), float(dy), float(dz)])
    V *= 0.1
    skel = json.load(open(f'{data}/default.mhskel'))
    joints = {k: V[np.array(v)].mean(axis=0) for k, v in skel['joints'].items()}
    bones = {}
    for name, b in skel['bones'].items():
        bones[name] = {'head': joints[b['head']], 'tail': joints[b['tail']], 'parent': b['parent']}
    W = json.load(open(f'{data}/default_weights.mhw'))['weights']
    weights = {}                                   # vertex -> {bone: w}
    for bone, pairs in W.items():
        for vi, w in pairs:
            weights.setdefault(vi, {})[bone] = w
    return V, faces, bones, weights


def descendants(bones, root):
    out, todo = set(), [root]
    while todo:
        b = todo.pop()
        out.add(b)
        todo += [k for k, v in bones.items() if v['parent'] == b]
    return out


def region(weights, names, least=0.5):
    """the vertices whose weights on these bones add to at least `least`"""
    return {vi for vi, ws in weights.items() if sum(w for b, w in ws.items() if b in names) >= least}


def mesh_of(faces, verts, group='body'):
    """the faces of a group whose corners are all in `verts`, as triangles, and the vertices they use"""
    tris = []
    for g, f in faces:
        if g != group or not all(v in verts for v in f):
            continue
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
    used = sorted({v for t in tris for v in t})
    return used, tris


def normals(P, T):
    N = np.zeros_like(P)
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    n = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(N, T[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
