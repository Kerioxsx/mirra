/**
 * Body sliders on the downloaded avatar. Each bone gets a scale in its own frame (girth across a
 * limb, length along it, width and depth for the pelvis and ribcage) and its children move with
 * the scaled bone, so every vertex is moved by the same blend of bone transforms its skin weights
 * already describe. Then the figure is scaled to the chosen height, feet on the floor.
 *
 * The default sliders give the model as authored.
 */
import { DEFAULT_BODY, computeBody, type BodyParams } from "../body";
import { BONE, BONE_NAMES, PARENT, type BoneName } from "../rig/skeleton";
import { meshOf, type AvatarAsset } from "./asset";

export interface MorphedMesh {
  name: string;
  position: Float32Array;
  normal: Float32Array;
}

export interface MorphedAvatar {
  asset: AvatarAsset;
  params: BodyParams;
  /** Rest-pose bone positions after the sliders, xyz per bone in BONE order. */
  joints: Float32Array;
  meshes: Map<string, MorphedMesh>;
  /** Crown height, metres. */
  height: number;
}

type M3 = Float64Array; // row-major 3x3

const ident = (): M3 => Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);

/** R·diag(s)·Rᵀ for an orthonormal frame whose columns are a, b, c. */
function frameScale(a: number[], b: number[], c: number[], s: [number, number, number]): M3 {
  const m = new Float64Array(9);
  const cols = [a, b, c];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += cols[k]![i]! * s[k]! * cols[k]![j]!;
      m[i * 3 + j] = v;
    }
  return m;
}

function invTranspose(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m as unknown as number[];
  const A = e! * i! - f! * h!;
  const B = -(d! * i! - f! * g!);
  const C = d! * h! - e! * g!;
  const det = a! * A + b! * B + c! * C;
  // (M⁻¹)ᵀ = cofactor matrix / det
  return Float64Array.of(
    A / det,
    B / det,
    C / det,
    -(b! * i! - c! * h!) / det,
    (a! * i! - c! * g!) / det,
    -(a! * h! - b! * g!) / det,
    (b! * f! - c! * e!) / det,
    -(a! * f! - c! * d!) / det,
    (a! * e! - b! * d!) / det,
  );
}

const CHILD: Partial<Record<BoneName, BoneName>> = {
  neck: "head",
  "clavicle.L": "upperArm.L",
  "upperArm.L": "forearm.L",
  "forearm.L": "hand.L",
  "clavicle.R": "upperArm.R",
  "upperArm.R": "forearm.R",
  "forearm.R": "hand.R",
  "thigh.L": "shin.L",
  "shin.L": "foot.L",
  "thigh.R": "shin.R",
  "shin.R": "foot.R",
};

/** Each bone's linear map (in rest space, about its own joint) for these sliders. */
export function boneScales(asset: AvatarAsset, p: BodyParams): M3[] {
  const db = p.build - DEFAULT_BODY.build;
  const ds = p.shoulders - DEFAULT_BODY.shoulders;
  const dh = p.hips - DEFAULT_BODY.hips;
  const dl = p.legLength - DEFAULT_BODY.legLength;
  const J = asset.joints;
  const jp = (b: BoneName) => [J[BONE[b] * 3]!, J[BONE[b] * 3 + 1]!, J[BONE[b] * 3 + 2]!];

  const limb = (b: BoneName, along: number, across: number): M3 => {
    const c = CHILD[b]!;
    const a0 = jp(b);
    const a1 = jp(c);
    const u = [a1[0]! - a0[0]!, a1[1]! - a0[1]!, a1[2]! - a0[2]!];
    const ul = Math.hypot(u[0]!, u[1]!, u[2]!);
    const ax = u.map((v) => v / ul);
    // a perpendicular: away from world z, unless the bone runs along z
    const ref = Math.abs(ax[2]!) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let v = [
      ax[1]! * ref[2]! - ax[2]! * ref[1]!,
      ax[2]! * ref[0]! - ax[0]! * ref[2]!,
      ax[0]! * ref[1]! - ax[1]! * ref[0]!,
    ];
    const vl = Math.hypot(v[0]!, v[1]!, v[2]!);
    v = v.map((x) => x / vl);
    const w = [
      ax[1]! * v[2]! - ax[2]! * v[1]!,
      ax[2]! * v[0]! - ax[0]! * v[2]!,
      ax[0]! * v[1]! - ax[1]! * v[0]!,
    ];
    return frameScale(ax, v, w, [along, across, across]);
  };
  const box = (sx: number, sy: number, sz: number): M3 =>
    Float64Array.of(sx, 0, 0, 0, sy, 0, 0, 0, sz);

  const out = BONE_NAMES.map(() => ident());
  const set = (b: BoneName, m: M3) => (out[BONE[b]] = m);
  set("hips", box((1 + 0.34 * db) * (1 + 0.45 * dh), 1, (1 + 0.36 * db) * (1 + 0.1 * dh)));
  set("spine", box(1 + 0.42 * db, 1, 1 + 0.62 * db));
  set("chest", box((1 + 0.28 * db) * (1 + 0.1 * ds), 1, 1 + 0.34 * db));
  set("neck", limb("neck", 1, 1 + 0.22 * db));
  const leg = 1 + 0.12 * dl;
  for (const k of ["L", "R"] as const) {
    set(`clavicle.${k}`, limb(`clavicle.${k}`, 1 + 0.5 * ds, 1 + 0.3 * db));
    set(`upperArm.${k}`, limb(`upperArm.${k}`, 1, 1 + 0.4 * db));
    set(`forearm.${k}`, limb(`forearm.${k}`, 1, 1 + 0.3 * db));
    set(`thigh.${k}`, limb(`thigh.${k}`, leg, (1 + 0.42 * db) * (1 + 0.3 * dh)));
    set(`shin.${k}`, limb(`shin.${k}`, leg, 1 + 0.3 * db));
  }
  return out;
}

/** The avatar with these sliders, in the rest pose. */
export function morphAvatar(asset: AvatarAsset, params: BodyParams): MorphedAvatar {
  const A = boneScales(asset, params);
  const J = asset.joints;
  const nb = BONE_NAMES.length;
  // new joint positions: each child moves with its parent's scaled bone
  const J2 = new Float64Array(nb * 3);
  BONE_NAMES.forEach((name, b) => {
    const parent = PARENT[name];
    if (!parent) {
      J2.set([J[0]!, J[1]!, J[2]!], 0);
      return;
    }
    const p = BONE[parent];
    const m = A[p]!;
    const d = [J[b * 3]! - J[p * 3]!, J[b * 3 + 1]! - J[p * 3 + 1]!, J[b * 3 + 2]! - J[p * 3 + 2]!];
    for (let i = 0; i < 3; i++)
      J2[b * 3 + i] =
        J2[p * 3 + i]! + m[i * 3]! * d[0]! + m[i * 3 + 1]! * d[1]! + m[i * 3 + 2]! * d[2]!;
  });
  const N = A.map(invTranspose);

  const meshes = new Map<string, MorphedMesh>();
  for (const mesh of asset.meshes) {
    const n = mesh.position.length / 3;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const x = mesh.position[v * 3]!;
      const y = mesh.position[v * 3 + 1]!;
      const z = mesh.position[v * 3 + 2]!;
      const nx = mesh.normal[v * 3]!;
      const ny = mesh.normal[v * 3 + 1]!;
      const nz = mesh.normal[v * 3 + 2]!;
      let px = 0;
      let py = 0;
      let pz = 0;
      let qx = 0;
      let qy = 0;
      let qz = 0;
      for (let k = 0; k < 4; k++) {
        const w = mesh.weights[v * 4 + k]!;
        if (w === 0) continue;
        const b = mesh.joints[v * 4 + k]!;
        const m = A[b]!;
        const dx = x - J[b * 3]!;
        const dy = y - J[b * 3 + 1]!;
        const dz = z - J[b * 3 + 2]!;
        px += w * (J2[b * 3]! + m[0]! * dx + m[1]! * dy + m[2]! * dz);
        py += w * (J2[b * 3 + 1]! + m[3]! * dx + m[4]! * dy + m[5]! * dz);
        pz += w * (J2[b * 3 + 2]! + m[6]! * dx + m[7]! * dy + m[8]! * dz);
        const t = N[b]!;
        qx += w * (t[0]! * nx + t[1]! * ny + t[2]! * nz);
        qy += w * (t[3]! * nx + t[4]! * ny + t[5]! * nz);
        qz += w * (t[6]! * nx + t[7]! * ny + t[8]! * nz);
      }
      pos[v * 3] = px;
      pos[v * 3 + 1] = py;
      pos[v * 3 + 2] = pz;
      const l = Math.hypot(qx, qy, qz) || 1;
      nor[v * 3] = qx / l;
      nor[v * 3 + 1] = qy / l;
      nor[v * 3 + 2] = qz / l;
    }
    meshes.set(mesh.name, { name: mesh.name, position: pos, normal: nor });
  }

  // feet back on the floor, then the whole figure to the chosen height
  const src = meshOf(asset, "body")!.position;
  const out = meshes.get("body")!.position;
  let minSrc = Infinity;
  let minOut = Infinity;
  let maxOut = -Infinity;
  for (let v = 1; v < out.length; v += 3) {
    minSrc = Math.min(minSrc, src[v]!);
    minOut = Math.min(minOut, out[v]!);
    maxOut = Math.max(maxOut, out[v]!);
  }
  const lift = minSrc - minOut;
  const H = computeBody(params).H;
  const s = H / (maxOut + lift);
  for (const m of meshes.values()) {
    const p = m.position;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = p[i]! * s;
      p[i + 1] = (p[i + 1]! + lift) * s;
      p[i + 2] = p[i + 2]! * s;
    }
  }
  const joints = new Float32Array(nb * 3);
  for (let b = 0; b < nb; b++) {
    joints[b * 3] = J2[b * 3]! * s;
    joints[b * 3 + 1] = (J2[b * 3 + 1]! + lift) * s;
    joints[b * 3 + 2] = J2[b * 3 + 2]! * s;
  }
  return { asset, params, joints, meshes, height: H };
}
