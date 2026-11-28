/**
 * The downloaded avatar: a binary glTF (GLB) per body type, made by tools/avatars/build_avatars.py
 * from Quaternius' Universal Base Characters (CC0 1.0). The file is already in the dresser's A-pose
 * and skinned to mirra-rig@1 (bone i is node i, rest rotations identity), so reading it is a matter
 * of copying typed arrays out of the binary chunk. No three.js here: tests read it in Node.
 */
import type { BodyType } from "../body";
import { BONE, BONE_NAMES, RIG_ID } from "../rig/skeleton";

export const BODY_TYPES: readonly BodyType[] = ["female", "male"];

export interface AvatarMesh {
  name: string;
  material: number;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** Four mirra-rig@1 bone indices per vertex. */
  joints: Uint8Array;
  /** Four weights per vertex, summing to 1. */
  weights: Float32Array;
  index: Uint16Array | Uint32Array;
}

export interface AvatarMaterial {
  name: string;
  map?: number;
  normalMap?: number;
  roughness: number;
  /**
   * The texture's own colour (the skin's median, or the hair textures' grey): the app tints the
   * material by the chosen colour divided by this, so the texture's shading survives any tint.
   */
  tintRef?: string | number;
}

export interface AvatarImage {
  mime: string;
  bytes: Uint8Array;
}

export interface AvatarAsset {
  body: BodyType;
  /** Height of the body's crown above the floor, metres. */
  height: number;
  hairstyles: string[];
  /** Rest-pose world positions of the twenty bones, xyz per bone in BONE order. */
  joints: Float32Array;
  meshes: AvatarMesh[];
  materials: AvatarMaterial[];
  images: AvatarImage[];
  source: string;
}

interface GltfJson {
  asset: { extras?: { mirra?: Record<string, unknown> } };
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    normalized?: boolean;
  }[];
  images?: { bufferView: number; mimeType: string }[];
  textures?: { source?: number; extensions?: { EXT_texture_webp?: { source: number } } }[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorTexture?: { index: number }; roughnessFactor?: number };
    normalTexture?: { index: number };
    extras?: { tintRef?: string | number };
  }[];
  meshes: {
    name: string;
    primitives: { attributes: Record<string, number>; indices: number; material: number }[];
  }[];
  nodes: { name?: string; translation?: number[]; children?: number[]; mesh?: number }[];
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export class AvatarFormatError extends Error {}

export function parseAvatar(data: ArrayBuffer | Uint8Array): AvatarAsset {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new AvatarFormatError("not a binary glTF file");
  }
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen))) as GltfJson;
  const binStart = 20 + jsonLen + 8;
  const bin = bytes.subarray(binStart, binStart + view.getUint32(20 + jsonLen, true));

  const extras = json.asset.extras?.mirra ?? {};
  if (extras.rig !== RIG_ID) throw new AvatarFormatError(`expected a ${RIG_ID} avatar`);

  const viewBytes = (i: number) => {
    const v = json.bufferViews[i]!;
    return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  };
  const read = (i: number) => {
    const a = json.accessors[i]!;
    const v = json.bufferViews[a.bufferView]!;
    const n = SIZE[a.type]! * a.count;
    const start = bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (v.byteStride) throw new AvatarFormatError("interleaved buffers are not supported");
    // copy out so the arrays are aligned and independent of the file buffer
    const slice = (B: number) => bin.buffer.slice(start, start + n * B);
    switch (a.componentType) {
      case 5126:
        return new Float32Array(slice(4));
      case 5125:
        return new Uint32Array(slice(4));
      case 5123:
        return new Uint16Array(slice(2));
      case 5121:
        return a.normalized
          ? Float32Array.from(new Uint8Array(slice(1)), (x) => x / 255)
          : new Uint8Array(slice(1));
      default:
        throw new AvatarFormatError(`unsupported component type ${a.componentType}`);
    }
  };

  // bones: node names are the mirra-rig@1 names; world positions from the translations
  const joints = new Float32Array(BONE_NAMES.length * 3);
  const seen = new Set<number>();
  const visit = (node: number, px: number, py: number, pz: number) => {
    const n = json.nodes[node]!;
    const t = n.translation ?? [0, 0, 0];
    const x = px + t[0]!;
    const y = py + t[1]!;
    const z = pz + t[2]!;
    const b = BONE[n.name as keyof typeof BONE];
    if (b !== undefined) {
      joints.set([x, y, z], b * 3);
      seen.add(b);
    }
    for (const c of n.children ?? []) visit(c, x, y, z);
  };
  const rootNode = json.nodes.findIndex((n) => n.name === "root");
  if (rootNode < 0) throw new AvatarFormatError("no root bone");
  visit(rootNode, 0, 0, 0);
  if (seen.size !== BONE_NAMES.length) throw new AvatarFormatError("missing bones");

  const meshes: AvatarMesh[] = json.meshes.map((m) => {
    const p = m.primitives[0]!;
    const at = p.attributes;
    return {
      name: m.name,
      material: p.material,
      position: read(at.POSITION!) as Float32Array,
      normal: read(at.NORMAL!) as Float32Array,
      uv: read(at.TEXCOORD_0!) as Float32Array,
      joints: read(at.JOINTS_0!) as Uint8Array,
      weights: read(at.WEIGHTS_0!) as Float32Array,
      index: read(p.indices) as Uint16Array | Uint32Array,
    };
  });

  const imageOf = (texture: number | undefined) => {
    if (texture === undefined) return undefined;
    const t = json.textures?.[texture];
    return t?.extensions?.EXT_texture_webp?.source ?? t?.source;
  };
  const materials: AvatarMaterial[] = (json.materials ?? []).map((m) => ({
    name: m.name ?? "",
    map: imageOf(m.pbrMetallicRoughness?.baseColorTexture?.index),
    normalMap: imageOf(m.normalTexture?.index),
    roughness: m.pbrMetallicRoughness?.roughnessFactor ?? 0.7,
    tintRef: m.extras?.tintRef,
  }));
  const images: AvatarImage[] = (json.images ?? []).map((im) => ({
    mime: im.mimeType,
    bytes: viewBytes(im.bufferView).slice(),
  }));

  const body = extras.body;
  if (body !== "female" && body !== "male") throw new AvatarFormatError("unknown body type");
  return {
    body,
    height: Number(extras.height),
    hairstyles: (extras.hairstyles as string[] | undefined) ?? [],
    joints,
    meshes,
    materials,
    images,
    source: String(extras.source ?? ""),
  };
}

export function meshOf(asset: AvatarAsset, name: string): AvatarMesh | undefined {
  return asset.meshes.find((m) => m.name === name);
}
