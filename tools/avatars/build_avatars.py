#!/usr/bin/env python3
"""Build the dresser's avatar files from Quaternius' Universal Base Characters (CC0 1.0).

Input: the unzipped "Universal Base Characters [Standard]" pack (https://quaternius.com).
Output: ``female.glb`` and ``male.glb``, one file per body, each holding

* the body, eyes and eyebrows, re-posed from the pack's T-pose to the dresser's A-pose (arms 17
  degrees off the body) and re-skinned to mirra-rig@1 (twenty bones, rest rotations identity), so
  the dresser's poses and garments drive it directly;
* four hairstyles fitted to that body's head and skinned to the head bone;
* the skin texture (light), its normal map, the eye texture and grey hair textures that the app
  tints to the chosen hair colour.

Usage: python3 tools/avatars/build_avatars.py <pack dir> <out dir>

Needs numpy and Pillow (not part of the backend's environment; any Python 3.11+ with both works).
"""

from __future__ import annotations

import argparse
import io
import json
import math
import struct
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

RIG = "mirra-rig@1"
BONES = [
    "root",
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "clavicle.L",
    "upperArm.L",
    "forearm.L",
    "hand.L",
    "clavicle.R",
    "upperArm.R",
    "forearm.R",
    "hand.R",
    "thigh.L",
    "shin.L",
    "foot.L",
    "thigh.R",
    "shin.R",
    "foot.R",
]
PARENT = {
    "root": None,
    "hips": "root",
    "spine": "hips",
    "chest": "spine",
    "neck": "chest",
    "head": "neck",
    "clavicle.L": "chest",
    "upperArm.L": "clavicle.L",
    "forearm.L": "upperArm.L",
    "hand.L": "forearm.L",
    "clavicle.R": "chest",
    "upperArm.R": "clavicle.R",
    "forearm.R": "upperArm.R",
    "hand.R": "forearm.R",
    "thigh.L": "hips",
    "shin.L": "thigh.L",
    "foot.L": "shin.L",
    "thigh.R": "hips",
    "shin.R": "thigh.R",
    "foot.R": "shin.R",
}
# pack joint -> mirra bone (joints not listed take their nearest listed ancestor's bone)
MAP = {
    "root": "root",
    "pelvis": "hips",
    "spine_01": "spine",
    "spine_02": "spine",
    "spine_03": "chest",
    "neck_01": "neck",
    "Head": "head",
}
for s, k in (("l", "L"), ("r", "R")):
    MAP |= {
        f"clavicle_{s}": f"clavicle.{k}",
        f"upperarm_{s}": f"upperArm.{k}",
        f"lowerarm_{s}": f"forearm.{k}",
        f"hand_{s}": f"hand.{k}",
        f"thigh_{s}": f"thigh.{k}",
        f"calf_{s}": f"shin.{k}",
        f"foot_{s}": f"foot.{k}",
    }
# the pack joint whose rest position is each bone's pivot
PIVOT = {b: j for j, b in reversed(list(MAP.items()))}

ARM_ANGLE = math.radians(17)  # off the body: the dresser's A-pose, roomy enough for wide hips

BODIES = {
    "female": {
        "gltf": "Base Characters/Godot - UE/Superhero_Female_FullBody.gltf",
        "skin": "Base Characters/Textures/T_Superhero_Female_Light_BaseColor.png",
        "normal": "Base Characters/Textures/Normals Unity - Godot/T_Superhero_Female_Normal.png",
    },
    "male": {
        "gltf": "Base Characters/Godot - UE/Superhero_Male_FullBody.gltf",
        "skin": "Base Characters/Textures/T_Superhero_Male_Ligh.png",
        "normal": "Base Characters/Textures/Normals Unity - Godot/T_Superhero_Male_Normal.png",
    },
}
HAIR_DIR = "Hairstyles/Origin at 0/glTF (Godot)"
# style -> (file, the body it was modelled on) per body; "buzz" has a version for each
HAIRSTYLES = {
    "short": {"female": ("Hair_SimpleParted", "male"), "male": ("Hair_SimpleParted", "male")},
    "bun": {"female": ("Hair_Buns", "female"), "male": ("Hair_Buns", "female")},
    "long": {"female": ("Hair_Long", "female"), "male": ("Hair_Long", "female")},
    "buzz": {"female": ("Hair_BuzzedFemale", "female"), "male": ("Hair_Buzzed", "male")},
}
HAIR_TEXTURES = {
    "MI_Hair_1": (
        "Hairstyles/Textures/T_Hair_1_BaseColor.png",
        "Hairstyles/Textures/Normals Unity - Godot/T_Hair_1_Normal.png",
    ),
    "MI_Hair_2": (
        "Hairstyles/Textures/T_Hair_2_BaseColor.png",
        "Hairstyles/Textures/Normals Unity - Godot/T_Hair_2_Normal.png",
    ),
}
EYE_TEXTURE = "Base Characters/Textures/T_Eye_Brown.png"
UNDERWEAR = np.array([0.15, 0.15, 0.16])  # sRGB
HAIR_GREY = 0.75  # the grey hair textures' median (sRGB); the app scales hair colour by 1/this

# ------------------------------------------------------------------------------------------ glTF in

COMPONENT = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Gltf:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.j = json.loads(path.read_text())
        self.buffers = [(path.parent / b["uri"]).read_bytes() for b in self.j["buffers"]]

    def accessor(self, i: int) -> np.ndarray:
        a = self.j["accessors"][i]
        v = self.j["bufferViews"][a["bufferView"]]
        dt = np.dtype(COMPONENT[a["componentType"]])
        n = COUNT[a["type"]]
        buf = self.buffers[v["buffer"]]
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride", 0) or dt.itemsize * n
        raw = np.frombuffer(
            buf, dtype=np.uint8, count=stride * (a["count"] - 1) + dt.itemsize * n, offset=start
        )
        rows = np.lib.stride_tricks.as_strided(
            raw, shape=(a["count"], dt.itemsize * n), strides=(stride, 1)
        )
        out = rows.copy().view(dt).reshape(a["count"], n)
        if a.get("normalized"):
            out = out.astype(np.float64) / np.iinfo(dt).max
        return out if n > 1 else out[:, 0]

    def local(self, i: int) -> np.ndarray:
        n = self.j["nodes"][i]
        if "matrix" in n:
            return np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T
        m = np.eye(4)
        x, y, z, w = n.get("rotation", [0, 0, 0, 1])
        r = np.array(
            [
                [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
            ]
        )
        m[:3, :3] = r @ np.diag(n.get("scale", [1, 1, 1]))
        m[:3, 3] = n.get("translation", [0, 0, 0])
        return m

    def parents(self) -> dict[int, int]:
        return {c: i for i, n in enumerate(self.j["nodes"]) for c in n.get("children", [])}

    def world(self, i: int) -> np.ndarray:
        parents = self.parents()
        m = self.local(i)
        while i in parents:
            i = parents[i]
            m = self.local(i) @ m
        return m


@dataclass
class Mesh:
    name: str
    material: str
    pos: np.ndarray
    nor: np.ndarray
    uv: np.ndarray
    idx: np.ndarray
    joints: np.ndarray  # (n, 4) mirra bone indices
    weights: np.ndarray  # (n, 4) float


@dataclass
class Body:
    name: str
    meshes: list[Mesh]
    pivots: dict[str, np.ndarray]
    head_box: tuple[np.ndarray, np.ndarray] = field(default=None)  # type: ignore[assignment]


def rot_z(angle: float, pivot: np.ndarray) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    m = np.eye(4)
    m[:2, :2] = [[c, -s], [s, c]]
    t = np.eye(4)
    t[:3, 3] = pivot
    ti = np.eye(4)
    ti[:3, 3] = -pivot
    return t @ m @ ti


def load_body(pack: Path, name: str) -> Body:
    g = Gltf(pack / BODIES[name]["gltf"])
    nodes = g.j["nodes"]
    skin = g.j["skins"][0]
    joints = skin["joints"]
    jname = [nodes[j]["name"] for j in joints]
    world = [g.world(j) for j in joints]
    ibm = g.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    bind = np.array([w @ b for w, b in zip(world, ibm, strict=True)])
    assert np.abs(bind - np.eye(4)).max() < 1e-3, "rest pose is not the bind pose"
    pos = {n: w[:3, 3] for n, w in zip(jname, world, strict=True)}

    # each pack joint's mirra bone, and whether it moves with an arm
    parents = g.parents()
    node_of = {nodes[j]["name"]: j for j in joints}
    bone_of: list[str] = []
    side_of: list[str | None] = []
    for jn in jname:
        k = node_of[jn]
        cur = jn
        while cur not in MAP:
            k = parents[k]
            cur = nodes[k]["name"]
        bone_of.append(MAP[cur])
        b = MAP[cur]
        side_of.append(b[-1] if b.split(".")[0] in ("upperArm", "forearm", "hand") else None)

    # T-pose -> A-pose: swing each arm down about its shoulder in the frontal plane
    swing: dict[str, np.ndarray] = {}
    for s, k, sx in (("l", "L", 1), ("r", "R", -1)):
        sh, el = pos[f"upperarm_{s}"], pos[f"lowerarm_{s}"]
        now = math.atan2(el[1] - sh[1], el[0] - sh[0])
        target = math.atan2(-math.cos(ARM_ANGLE), sx * math.sin(ARM_ANGLE))
        delta = (target - now + math.pi) % (2 * math.pi) - math.pi
        swing[k] = rot_z(delta, sh)

    pivots: dict[str, np.ndarray] = {}
    for b in BONES:
        p = np.append(pos[PIVOT[b]], 1.0)
        side = b[-1] if b.split(".")[0] in ("upperArm", "forearm", "hand") else None
        pivots[b] = (swing[side] @ p)[:3] if side else p[:3]

    skin_m = np.array([swing[s] if s else np.eye(4) for s in side_of])  # (J, 4, 4)
    bone_index = np.array([BONES.index(b) for b in bone_of])
    meshes: list[Mesh] = []
    for node in nodes:
        if "mesh" not in node:
            continue
        m = g.j["meshes"][node["mesh"]]
        (prim,) = m["primitives"]
        att = prim["attributes"]
        p = g.accessor(att["POSITION"]).astype(np.float64)
        nrm = g.accessor(att["NORMAL"]).astype(np.float64)
        uv = g.accessor(att["TEXCOORD_0"]).astype(np.float64)
        jt = g.accessor(att["JOINTS_0"]).astype(np.int64)
        wt = g.accessor(att["WEIGHTS_0"]).astype(np.float64)
        wt /= wt.sum(1, keepdims=True)
        mats = np.einsum("vk,vkij->vij", wt, skin_m[jt])
        ph = np.c_[p, np.ones(len(p))]
        p2 = np.einsum("vij,vj->vi", mats, ph)[:, :3]
        n2 = np.einsum("vij,vj->vi", mats[:, :3, :3], nrm)
        n2 /= np.linalg.norm(n2, axis=1, keepdims=True)
        # weights per mirra bone, the four largest kept
        acc = np.zeros((len(p), len(BONES)))
        np.add.at(acc, (np.repeat(np.arange(len(p)), 4), bone_index[jt].ravel()), wt.ravel())
        top = np.argsort(-acc, axis=1)[:, :4]
        tw = np.take_along_axis(acc, top, 1)
        tw /= tw.sum(1, keepdims=True)
        mat = g.j["materials"][prim["material"]]["name"]
        kind = (
            "body" if mat.startswith("MI_Superhero") else "eyes" if mat == "MI_Eyes" else "eyebrows"
        )
        meshes.append(
            Mesh(
                kind,
                "skin" if kind == "body" else mat,
                p2,
                n2,
                uv,
                g.accessor(prim["indices"]).astype(np.uint32),
                top,
                tw,
            )
        )
    body = Body(name, meshes, pivots)
    main = next(m for m in meshes if m.name == "body")
    head = main.pos[
        (main.joints[:, 0] == BONES.index("head")) & (main.pos[:, 1] > pivots["head"][1])
    ]
    body.head_box = (head.min(0), head.max(0))
    return body


def load_hair(pack: Path, file: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, str]:
    g = Gltf(pack / HAIR_DIR / f"{file}.gltf")
    i = next(k for k, nd in enumerate(g.j["nodes"]) if "mesh" in nd)
    node = g.j["nodes"][i]
    (prim,) = g.j["meshes"][node["mesh"]]["primitives"]
    att = prim["attributes"]
    w = g.world(i)
    p = g.accessor(att["POSITION"]).astype(np.float64)
    p = (np.c_[p, np.ones(len(p))] @ w.T)[:, :3]
    n = g.accessor(att["NORMAL"]).astype(np.float64) @ np.linalg.inv(w[:3, :3])
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    uv = g.accessor(att["TEXCOORD_0"]).astype(np.float64)
    idx = g.accessor(prim["indices"]).astype(np.uint32)
    return p, n, uv, idx, g.j["materials"][prim["material"]]["name"]


def fit_hair(p: np.ndarray, n: np.ndarray, src: Body, dst: Body) -> tuple[np.ndarray, np.ndarray]:
    """Carry hair modelled on one body's head onto another's: match the heads' boxes."""
    (a0, a1), (b0, b1) = src.head_box, dst.head_box
    scale = (b1 - b0) / (a1 - a0)
    ca = np.array([(a0[0] + a1[0]) / 2, a1[1], (a0[2] + a1[2]) / 2])  # crown
    cb = np.array([(b0[0] + b1[0]) / 2, b1[1], (b0[2] + b1[2]) / 2])
    p2 = cb + (p - ca) * scale
    n2 = n / scale
    return p2, n2 / np.linalg.norm(n2, axis=1, keepdims=True)


# -------------------------------------------------------------------------------------- textures


def webp(img: Image.Image, size: int, quality: int) -> bytes:
    img = img.convert("RGB").resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=quality, method=6)
    return out.getvalue()


def skin_texture(path: Path) -> tuple[bytes, str]:
    """The skin texture with its underwear turned charcoal (the pack paints it light grey and tints
    it in its own shaders), and the median skin colour the app divides by to tint it."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float64) / 255
    luma = a @ [0.2126, 0.7152, 0.0722]
    sat = a.max(2) - a.min(2)
    skin = a[(luma > 0.3) & (sat > 0.08)]
    ref = np.median(skin, axis=0)
    hexref = "#" + "".join(f"{round(v * 255):02x}" for v in ref)
    grey = np.clip((0.08 - sat) / 0.04, 0, 1) * (luma > 0.15)
    shade = (luma / np.median(luma[grey > 0.5]))[..., None] * UNDERWEAR
    a = a * (1 - grey[..., None]) + np.clip(shade, 0, 1) * grey[..., None]
    img = Image.fromarray((a * 255).round().astype(np.uint8), "RGB")
    return webp(img, 1024, 84), hexref


def grey_hair(path: Path) -> bytes:
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float64) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4) @ [0.2126, 0.7152, 0.0722]
    target = ((HAIR_GREY + 0.055) / 1.055) ** 2.4
    lin = np.clip(lin * target / np.median(lin), 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    img = Image.fromarray((srgb * 255).round().astype(np.uint8), "L")
    return webp(img, 512, 82)


# ------------------------------------------------------------------------------------------ GLB out


class Writer:
    def __init__(self) -> None:
        self.bin = bytearray()
        self.j: dict = {
            "asset": {"version": "2.0", "generator": "mirra tools/avatars/build_avatars.py"},
            "extensionsUsed": ["EXT_texture_webp"],
            "extensionsRequired": ["EXT_texture_webp"],
            "buffers": [],
            "bufferViews": [],
            "accessors": [],
            "images": [],
            "textures": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
            "materials": [],
            "meshes": [],
            "nodes": [],
            "skins": [],
            "scenes": [{"nodes": []}],
            "scene": 0,
        }

    def view(self, data: bytes, target: int | None = None) -> int:
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def accessor(
        self, arr: np.ndarray, kind: str, normalized: bool = False, target: int | None = 34962
    ) -> int:
        ctype = {np.float32: 5126, np.uint8: 5121, np.uint16: 5123, np.uint32: 5125}[arr.dtype.type]
        a = {
            "bufferView": self.view(arr.tobytes(), target),
            "componentType": ctype,
            "count": len(arr),
            "type": kind,
        }
        if normalized:
            a["normalized"] = True
        if kind == "VEC3" and arr.dtype == np.float32:
            a["min"] = arr.min(0).tolist()
            a["max"] = arr.max(0).tolist()
        self.j["accessors"].append(a)
        return len(self.j["accessors"]) - 1

    def texture(self, data: bytes) -> int:
        self.j["images"].append({"bufferView": self.view(data), "mimeType": "image/webp"})
        i = len(self.j["images"]) - 1
        self.j["textures"].append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": i}}})
        return len(self.j["textures"]) - 1

    def material(
        self, name: str, base: int, normal: int | None, roughness: float, extras: dict | None = None
    ) -> int:
        m: dict = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": base},
                "metallicFactor": 0,
                "roughnessFactor": roughness,
            },
        }
        if normal is not None:
            m["normalTexture"] = {"index": normal}
        if extras:
            m["extras"] = extras
        self.j["materials"].append(m)
        return len(self.j["materials"]) - 1

    def mesh(self, m: Mesh, material: int) -> int:
        n = len(m.pos)
        idx = m.idx.astype(np.uint16 if n < 65536 else np.uint32)
        weights = np.round(m.weights * 255)
        # keep each vertex's quantised weights summing to exactly 255
        weights[:, 0] += 255 - weights.sum(1)
        prim = {
            "attributes": {
                "POSITION": self.accessor(m.pos.astype(np.float32), "VEC3"),
                "NORMAL": self.accessor(m.nor.astype(np.float32), "VEC3"),
                "TEXCOORD_0": self.accessor(m.uv.astype(np.float32), "VEC2"),
                "JOINTS_0": self.accessor(m.joints.astype(np.uint8), "VEC4"),
                "WEIGHTS_0": self.accessor(weights.astype(np.uint8), "VEC4", normalized=True),
            },
            "indices": self.accessor(idx, "SCALAR", target=34963),
            "material": material,
        }
        self.j["meshes"].append({"name": m.name, "primitives": [prim]})
        return len(self.j["meshes"]) - 1

    def glb(self) -> bytes:
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(self.j, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        return (
            struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(js), 0x4E4F534A)
            + js
            + struct.pack("<II", len(self.bin), 0x004E4942)
            + bytes(self.bin)
        )


def build(pack: Path, out: Path) -> None:
    bodies = {name: load_body(pack, name) for name in BODIES}
    hair_tex = {
        k: (grey_hair(pack / b), webp(Image.open(pack / nm), 512, 80))
        for k, (b, nm) in HAIR_TEXTURES.items()
    }
    eye_tex = webp(Image.open(pack / EYE_TEXTURE), 256, 90)
    for name, body in bodies.items():
        w = Writer()
        skin_data, skin_ref = skin_texture(pack / BODIES[name]["skin"])
        mats = {
            "skin": w.material(
                "skin",
                w.texture(skin_data),
                w.texture(webp(Image.open(pack / BODIES[name]["normal"]), 1024, 86)),
                0.62,
                {"tintRef": skin_ref},
            ),
            "MI_Eyes": w.material("eyes", w.texture(eye_tex), None, 0.3),
        }
        for k, (base, nrm) in hair_tex.items():
            mats[k] = w.material(
                f"hair{k[-1]}", w.texture(base), w.texture(nrm), 0.8, {"tintRef": HAIR_GREY}
            )

        # skeleton nodes first, so node i is bone i
        for b in BONES:
            parent = PARENT[b]
            t = body.pivots[b] - (body.pivots[parent] if parent else 0)
            w.j["nodes"].append({"name": b, "translation": [round(float(v), 6) for v in t]})
        for i, b in enumerate(BONES):
            kids = [k for k, c in enumerate(BONES) if PARENT[c] == b]
            if kids:
                w.j["nodes"][i]["children"] = kids
        ibm = np.zeros((len(BONES), 4, 4), dtype=np.float32)
        for i, b in enumerate(BONES):
            ibm[i] = np.eye(4)
            ibm[i, :3, 3] = -body.pivots[b]
        w.j["skins"].append(
            {
                "joints": list(range(len(BONES))),
                "skeleton": 0,
                "inverseBindMatrices": w.accessor(
                    ibm.transpose(0, 2, 1).reshape(-1, 16).copy(), "MAT4", target=None
                ),
            }
        )
        w.j["scenes"][0]["nodes"].append(0)

        meshes = list(body.meshes)
        head = BONES.index("head")
        for style, per in HAIRSTYLES.items():
            file, modelled_on = per[name]
            p, n, uv, idx, mat = load_hair(pack, file)
            if modelled_on != name:
                p, n = fit_hair(p, n, bodies[modelled_on], body)
            joints = np.zeros((len(p), 4), dtype=np.int64)
            joints[:, 0] = head
            weights = np.zeros((len(p), 4))
            weights[:, 0] = 1
            meshes.append(Mesh(f"hair_{style}", mat, p, n, uv, idx, joints, weights))
        for m in meshes:
            mi = w.mesh(m, mats[m.material])
            w.j["nodes"].append({"name": m.name, "mesh": mi, "skin": 0})
            w.j["scenes"][0]["nodes"].append(len(w.j["nodes"]) - 1)

        main = next(m for m in body.meshes if m.name == "body")
        w.j["asset"]["extras"] = {
            "mirra": {
                "rig": RIG,
                "body": name,
                "height": round(float(main.pos[:, 1].max()), 4),
                "hairstyles": list(HAIRSTYLES),
                "source": "Universal Base Characters by Quaternius (quaternius.com), CC0 1.0",
            }
        }
        data = w.glb()
        (out / f"{name}.glb").write_bytes(data)
        tris = sum(len(m.idx) // 3 for m in meshes)
        height = w.j["asset"]["extras"]["mirra"]["height"]
        print(f"{name}.glb  {len(data) / 1024:.0f} KiB  {tris} triangles  height {height} m")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument(
        "pack", type=Path, help="the unzipped Universal Base Characters [Standard] folder"
    )
    ap.add_argument("out", type=Path, help="where to write female.glb and male.glb")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    build(args.pack, args.out)


if __name__ == "__main__":
    main()
