/**
 * Bakes a few dressed looks into small static GLB files for the website (apps/site/looks/): the
 * downloaded avatar, its garments built by this engine exactly as the dresser builds them, posed,
 * with the skin under the clothes left out. The website shows them in a plain three.js viewer, so
 * it needs none of this engine at run time.
 *
 * Run: pnpm --filter @mirra/dresser-engine bake:looks
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import {
  BufferAttribute,
  Color,
  Matrix3,
  Matrix4,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from "three";
import { genericGarment } from "@mirra/garment-system";
import type { Category } from "@mirra/shared-types";
import { DEFAULT_BODY, type BodyType, type HairStyle } from "../src/body";
import { meshOf, parseAvatar, type AvatarAsset } from "../src/avatar/asset";
import { fitBody } from "../src/avatar/fit";
import { morphAvatar } from "../src/avatar/morph";
import { FABRICS, shade } from "../src/materials";
import { AvatarBuilder, MESH_SPACING } from "../src/rig/build";
import type { GarmentField } from "../src/rig/garmentField";
import { applyPose, POSES, type PoseId } from "../src/rig/poses";
import { buildRig } from "../src/rig/skeleton";

interface Look {
  id: string;
  body: BodyType;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  pose: PoseId;
  items: [Category, string][];
}

export const LOOKS: Look[] = [
  {
    id: "street",
    body: "female",
    skin: "#c99a78",
    hair: "bun",
    hairColor: "#2a1d14",
    pose: "contrapposto",
    items: [
      ["t_shirt", "#ece7dc"],
      ["zip_up", "#3a3a3f"],
      ["baggy_pants", "#46658c"],
      ["sneakers", "#f2f1ec"],
    ],
  },
  {
    id: "office",
    body: "male",
    skin: "#a8754f",
    hair: "short",
    hairColor: "#1d1712",
    pose: "relaxed",
    items: [
      ["shirt", "#8fa9cc"],
      ["trousers", "#35353b"],
      ["belt", "#2b211b"],
      ["shoes", "#3b2a20"],
    ],
  },
  {
    id: "weekend",
    body: "female",
    skin: "#e3b796",
    hair: "long",
    hairColor: "#8a5a33",
    pose: "relaxed",
    items: [
      ["dress", "#5f6b45"],
      ["sandals", "#c9a26b"],
    ],
  },
];

const ROOT = new URL("../../../", import.meta.url);
const OUT = new URL("apps/site/looks/", ROOT);

// ------------------------------------------------------------------------------------- GLB out

interface OutMesh {
  name: string;
  position: Float32Array;
  normal: Float32Array;
  uv?: Float32Array;
  index: Uint32Array;
  material: number;
}

interface OutMaterial {
  name: string;
  color: [number, number, number];
  roughness: number;
  doubleSided?: boolean;
  map?: number;
  normalMap?: number;
}

function writeGlb(
  meshes: OutMesh[],
  materials: OutMaterial[],
  images: Uint8Array[],
  extras: object,
) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const views: object[] = [];
  const accessors: object[] = [];
  const view = (bytes: Uint8Array, target?: number) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      length += pad;
    }
    views.push({
      buffer: 0,
      byteOffset: length,
      byteLength: bytes.byteLength,
      ...(target ? { target } : {}),
    });
    chunks.push(bytes);
    length += bytes.byteLength;
    return views.length - 1;
  };
  const accessor = (
    arr: Float32Array | Uint32Array | Uint16Array | Int16Array | Int8Array,
    type: string,
    extra: object = {},
  ) => {
    const componentType =
      arr instanceof Float32Array
        ? 5126
        : arr instanceof Uint32Array
          ? 5125
          : arr instanceof Uint16Array
            ? 5123
            : arr instanceof Int16Array
              ? 5122
              : 5120;
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type]!;
    accessors.push({
      bufferView: view(
        new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength),
        type === "SCALAR" ? 34963 : 34962,
      ),
      componentType,
      count: arr.length / size,
      type,
      ...extra,
    });
    return accessors.length - 1;
  };
  const nodes: object[] = [];
  const gMeshes = meshes.map((m, i) => {
    // positions as 16-bit integers inside the mesh's box, normals as 8-bit (KHR_mesh_quantization):
    // about half the size of floats, and three.js reads them natively
    const n = m.position.length / 3;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < n; v++)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k]!, m.position[v * 3 + k]!);
        hi[k] = Math.max(hi[k]!, m.position[v * 3 + k]!);
      }
    const c = lo.map((l, k) => (l + hi[k]!) / 2);
    const h = lo.map((l, k) => Math.max(1e-6, (hi[k]! - l) / 2));
    const qp = new Int16Array(n * 3);
    const qn = new Int8Array(n * 3);
    for (let v = 0; v < n; v++)
      for (let k = 0; k < 3; k++) {
        qp[v * 3 + k] = Math.round(((m.position[v * 3 + k]! - c[k]!) / h[k]!) * 32767);
        qn[v * 3 + k] = Math.round(Math.max(-1, Math.min(1, m.normal[v * 3 + k]!)) * 127);
      }
    const pmin = [0, 1, 2].map((k) =>
      Math.min(...Array.from({ length: n }, (_, v) => qp[v * 3 + k]!)),
    );
    const pmax = [0, 1, 2].map((k) =>
      Math.max(...Array.from({ length: n }, (_, v) => qp[v * 3 + k]!)),
    );
    const attributes: Record<string, number> = {
      POSITION: accessor(qp, "VEC3", { normalized: true, min: pmin, max: pmax }),
      NORMAL: accessor(qn, "VEC3", { normalized: true }),
    };
    if (m.uv) attributes.TEXCOORD_0 = accessor(m.uv, "VEC2");
    nodes.push({ name: m.name, mesh: i, translation: c, scale: h });
    const index = n < 65536 ? Uint16Array.from(m.index) : m.index;
    return {
      name: m.name,
      primitives: [{ attributes, indices: accessor(index, "SCALAR"), material: m.material }],
    };
  });
  const imageViews = images.map((im) => view(im));
  const json = {
    asset: { version: "2.0", generator: "mirra dresser-engine/scripts/bake-looks", extras },
    extensionsUsed: ["KHR_mesh_quantization", ...(images.length ? ["EXT_texture_webp"] : [])],
    extensionsRequired: ["KHR_mesh_quantization", ...(images.length ? ["EXT_texture_webp"] : [])],
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gMeshes,
    materials: materials.map((m) => ({
      name: m.name,
      doubleSided: m.doubleSided ?? false,
      pbrMetallicRoughness: {
        baseColorFactor: [...m.color, 1],
        metallicFactor: 0,
        roughnessFactor: m.roughness,
        ...(m.map !== undefined ? { baseColorTexture: { index: m.map } } : {}),
      },
      ...(m.normalMap !== undefined ? { normalTexture: { index: m.normalMap } } : {}),
    })),
    ...(images.length
      ? {
          images: imageViews.map((bufferView) => ({ bufferView, mimeType: "image/webp" })),
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
          textures: images.map((_, i) => ({
            sampler: 0,
            extensions: { EXT_texture_webp: { source: i } },
          })),
        }
      : {}),
    buffers: [{ byteLength: 0 }],
    bufferViews: views,
    accessors,
  };
  const pad = (4 - (length % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    length += pad;
  }
  json.buffers[0]!.byteLength = length;
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jsPad = (4 - (js.length % 4)) % 4;
  if (jsPad) js = Uint8Array.from([...js, ...new Array(jsPad).fill(0x20)]);
  const out = new Uint8Array(12 + 8 + js.length + 8 + length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  dv.setUint32(20 + js.length, length, true);
  dv.setUint32(24 + js.length, 0x004e4942, true);
  let o = 28 + js.length;
  for (const ch of chunks) {
    out.set(ch, o);
    o += ch.byteLength;
  }
  return out;
}

// ------------------------------------------------------------------------------------- baking

/** A colour as glTF wants it (linear), capped at 1. */
function linear(hex: string, divideBy?: string | number): [number, number, number] {
  const c = new Color(hex);
  if (divideBy !== undefined) {
    const b =
      typeof divideBy === "number"
        ? new Color().setRGB(divideBy, divideBy, divideBy, SRGBColorSpace)
        : new Color(divideBy);
    c.setRGB(c.r / b.r, c.g / b.g, c.b / b.b);
  }
  return [Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b)];
}

/** Moves a skinned geometry into the pose (linear blend skinning on the CPU). */
function posed(
  g: BufferGeometry,
  skin: Matrix4[],
  index: BufferAttribute = g.getIndex()!,
): OutMesh & { material: number } {
  const p = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  const si = g.getAttribute("skinIndex");
  const sw = g.getAttribute("skinWeight");
  const n = p.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const v = new Vector3();
  const acc = new Vector3();
  const nacc = new Vector3();
  const nm = new Matrix3();
  for (let i = 0; i < n; i++) {
    acc.set(0, 0, 0);
    nacc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w === 0) continue;
      const m = skin[si.getComponent(i, k)]!;
      acc.addScaledVector(v.fromBufferAttribute(p, i).applyMatrix4(m), w);
      nacc.addScaledVector(v.fromBufferAttribute(nrm, i).applyMatrix3(nm.setFromMatrix4(m)), w);
    }
    nacc.normalize();
    pos.set([acc.x, acc.y, acc.z], i * 3);
    nor.set([nacc.x, nacc.y, nacc.z], i * 3);
  }
  // keep only the vertices the triangles use (skin under clothes is gone)
  const remap = new Int32Array(n).fill(-1);
  const idx = Array.from(index.array as ArrayLike<number>);
  let used = 0;
  for (const i of idx) if (remap[i] === -1) remap[i] = used++;
  const P = new Float32Array(used * 3);
  const N = new Float32Array(used * 3);
  const uvAttr = g.getAttribute("uv");
  const UV = uvAttr ? new Float32Array(used * 2) : undefined;
  for (let i = 0; i < n; i++) {
    const r = remap[i]!;
    if (r < 0) continue;
    P.set(pos.subarray(i * 3, i * 3 + 3), r * 3);
    N.set(nor.subarray(i * 3, i * 3 + 3), r * 3);
    if (UV) UV.set([uvAttr!.getX(i), uvAttr!.getY(i)], r * 2);
  }
  return {
    name: "",
    position: P,
    normal: N,
    uv: UV,
    index: Uint32Array.from(idx, (i) => remap[i]!),
    material: 0,
  };
}

function bake(look: Look, asset: AvatarAsset) {
  const av = morphAvatar(asset, DEFAULT_BODY);
  const model = fitBody(av);
  const b = new AvatarBuilder(model, look.id, MESH_SPACING.medium, av);
  const items = look.items.map(([c, hex]) => ({ slot: c, garment: genericGarment(c, hex), hex }));
  const built = b.outfit(items, look.hair);
  const key = items.map((i) => i.slot).join(",");

  const rig = buildRig(model);
  applyPose(rig, POSES[look.pose], 1);
  const skin = rig.bones.map((bone, i) =>
    new Matrix4().multiplyMatrices(bone.matrixWorld, rig.skeleton.boneInverses[i]!),
  );

  const materials: OutMaterial[] = [];
  const images: Uint8Array[] = [];
  const imageOf = new Map<number, number>();
  const tex = (i: number | undefined) => {
    if (i === undefined) return undefined;
    if (!imageOf.has(i)) {
      imageOf.set(i, images.length);
      images.push(asset.images[i]!.bytes);
    }
    return imageOf.get(i);
  };
  const avatarMaterial = (name: string, hex: string) => {
    const def = asset.materials[meshOf(asset, name)!.material]!;
    materials.push({
      name: def.name,
      color: def.tintRef !== undefined ? linear(hex, def.tintRef) : [1, 1, 1],
      roughness: def.roughness,
      map: tex(def.map),
      normalMap: tex(def.normalMap),
    });
    return materials.length - 1;
  };
  const meshes: OutMesh[] = [];
  const add = (name: string, m: OutMesh, material: number) => meshes.push({ ...m, name, material });

  add(
    "body",
    posed(b.body(), skin, b.visibleIndex("body", key, built.covering)!),
    avatarMaterial("body", look.skin),
  );
  for (const part of ["eyes", "eyebrows"])
    add(part, posed(b.part(part)!, skin), avatarMaterial(part, look.hairColor));
  if (look.hair !== "none") {
    const name = `hair_${look.hair}`;
    add(
      name,
      posed(b.part(name)!, skin, b.visibleIndex(name as `hair_${string}`, key, built.headwear)!),
      avatarMaterial(name, look.hairColor),
    );
  }
  // garments that wrap the body, inner to outer: an inner layer's triangles well inside a layer
  // worn over it can never be seen, so they are left out of the file
  const wrapping = built.covering;
  const hiddenUnder = (
    g: BufferGeometry,
    field: GarmentField | undefined,
  ): BufferAttribute | undefined => {
    const at = field ? wrapping.indexOf(field) : -1;
    const over = at >= 0 ? wrapping.slice(at + 1).filter((f) => !built.headwear.includes(f)) : [];
    if (!over.length) return undefined;
    const p = g.getAttribute("position");
    const margin = 0.003 * model.H;
    const hidden = new Uint8Array(p.count);
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v);
      const y = p.getY(v);
      const z = p.getZ(v);
      hidden[v] = over.some((f) => {
        const clip = f.pieces[0]?.clip;
        return !(clip && clip(x, y, z) >= -margin) && f.solid(x, y, z) < -margin;
      })
        ? 1
        : 0;
    }
    const src = g.getIndex()!.array as ArrayLike<number>;
    const keep: number[] = [];
    for (let t = 0; t < src.length; t += 3)
      if (!(hidden[src[t]!] && hidden[src[t + 1]!] && hidden[src[t + 2]!]))
        keep.push(src[t]!, src[t + 1]!, src[t + 2]!);
    return new BufferAttribute(Uint32Array.from(keep), 1);
  };
  for (const item of items) {
    const pieces = built.pieces.get(item.slot);
    if (!pieces) continue;
    const g = item.garment;
    const footwear = g.parametric?.template === "footwear";
    const trimHex =
      g.material === "metal" ? shade(item.hex, 0.12) : shade(item.hex, footwear ? 0.5 : -0.06);
    materials.push({
      name: item.slot,
      color: linear(item.hex),
      roughness: FABRICS[g.material].roughness,
      doubleSided: true,
    });
    const main = materials.length - 1;
    materials.push({
      name: `${item.slot} trim`,
      color: linear(trimHex),
      roughness: FABRICS[footwear ? "leather" : g.material].roughness,
      doubleSided: true,
    });
    const trim = materials.length - 1;
    const field = built.fields.get(item.slot);
    pieces.forEach((p, i) => {
      const index = hiddenUnder(p.geometry, field) ?? p.geometry.getIndex()!;
      if (index.count)
        add(
          `${item.slot}${i ? `-${i}` : ""}`,
          posed(p.geometry, skin, index),
          p.role === "trim" ? trim : main,
        );
    });
  }
  const glb = writeGlb(meshes, materials, images, {
    mirra: {
      look: look.id,
      body: look.body,
      pose: look.pose,
      items: look.items.map(([c]) => c),
      source: asset.source,
    },
  });
  writeFileSync(new URL(`${look.id}.glb`, OUT), glb);
  const verts = meshes.reduce((s, m) => s + m.position.length / 3, 0);
  console.info(
    `${look.id}.glb  ${(glb.length / 1024).toFixed(0)} KiB  ${verts} vertices  ${meshes.length} meshes`,
  );
}

test("bake website looks", () => {
  mkdirSync(OUT, { recursive: true });
  const assets = new Map<BodyType, AvatarAsset>();
  for (const look of LOOKS) {
    if (!assets.has(look.body))
      assets.set(
        look.body,
        parseAvatar(readFileSync(new URL(`apps/web/public/avatars/${look.body}.glb`, ROOT))),
      );
    bake(look, assets.get(look.body)!);
  }
}, 120_000);
