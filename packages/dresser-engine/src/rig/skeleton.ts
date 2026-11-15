/**
 * mirra-rig@1: the avatar's skeleton. Twenty bones, rest pose = the body model's A-pose, every bone's
 * rest rotation is identity (only positions), so a pose is a plain list of local rotations and the
 * same pose file works for every body shape. A future GLB avatar keeps these bone names.
 */
import { Bone, Skeleton, Vector3 } from "three";
import type { BodyModel } from "../body";

export const RIG_ID = "mirra-rig@1";

export const BONE_NAMES = [
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
] as const;

export type BoneName = (typeof BONE_NAMES)[number];

export const BONE: Record<BoneName, number> = Object.fromEntries(
  BONE_NAMES.map((n, i) => [n, i]),
) as Record<BoneName, number>;

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  hips: "root",
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
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
};

/**
 * Rest-pose joint positions in metres. "L" is the figure's own left, which is +x: the avatar faces
 * the camera along +z.
 */
export function restJoints(m: BodyModel): Record<BoneName, Vector3> {
  const { y, w, H } = m;
  const side = (v: Vector3, s: 1 | -1) => new Vector3(v.x * s, v.y, v.z);
  const clav = new Vector3(w.neck * 0.7, y.shoulder - 0.01 * H, 0);
  const ankle = m.shin.b;
  const j: Partial<Record<BoneName, Vector3>> = {
    root: new Vector3(0, 0, 0),
    hips: new Vector3(0, y.hip, 0),
    spine: new Vector3(0, y.waist, 0),
    chest: new Vector3(0, y.chest, 0),
    neck: new Vector3(0, y.neckBase, 0),
    head: new Vector3(0, y.neckTop, 0.004 * H),
  };
  for (const [s, k] of [
    [1, "L"],
    [-1, "R"],
  ] as const) {
    j[`clavicle.${k}`] = side(clav, s);
    j[`upperArm.${k}`] = side(m.upperArm.a, s);
    j[`forearm.${k}`] = side(m.forearm.a, s);
    j[`hand.${k}`] = side(m.forearm.b, s);
    j[`thigh.${k}`] = side(m.thigh.a, s);
    j[`shin.${k}`] = side(m.shin.a, s);
    j[`foot.${k}`] = side(ankle, s);
  }
  return j as Record<BoneName, Vector3>;
}

export interface Rig {
  root: Bone;
  bones: Bone[];
  skeleton: Skeleton;
  rest: Record<BoneName, Vector3>;
}

export function buildRig(m: BodyModel): Rig {
  const rest = restJoints(m);
  const bones = BONE_NAMES.map((name) => {
    const b = new Bone();
    b.name = name;
    return b;
  });
  BONE_NAMES.forEach((name, i) => {
    const parent = PARENT[name];
    const bone = bones[i]!;
    if (parent) {
      bones[BONE[parent]]!.add(bone);
      bone.position.copy(rest[name]).sub(rest[parent]);
    } else {
      bone.position.copy(rest[name]);
    }
  });
  const root = bones[0]!;
  root.updateMatrixWorld(true);
  return { root, bones, skeleton: new Skeleton(bones), rest };
}
