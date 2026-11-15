/**
 * Poses for mirra-rig@1, as local bone rotations in degrees (x, y, z). Every bone's rest rotation is
 * identity, so axes are the world's in the rest pose: x swings forward (negative) and back, z swings
 * a limb out or in. Bones listed for the left (".L", +x) side only are mirrored onto the right unless
 * the pose names the right side itself.
 */
import { Euler, Quaternion } from "three";
import { BONE, BONE_NAMES, type BoneName, type Rig } from "./skeleton";

export type PoseId = "a-pose" | "relaxed" | "contrapposto" | "walk";

export type Pose = Partial<Record<BoneName, [number, number, number]>>;

export const POSE_LABELS: Record<PoseId, string> = {
  "a-pose": "A-pose",
  relaxed: "Relaxed",
  contrapposto: "Weight shift",
  walk: "Walking",
};

const deg = Math.PI / 180;

function mirrored(p: Pose): Pose {
  const out: Pose = { ...p };
  for (const name of Object.keys(p) as BoneName[]) {
    if (!name.endsWith(".L")) continue;
    const r = name.replace(".L", ".R") as BoneName;
    if (out[r]) continue;
    const [x, y, z] = p[name]!;
    out[r] = [x, -y, -z];
  }
  return out;
}

export const POSES: Record<PoseId, Pose> = {
  "a-pose": {},
  relaxed: mirrored({
    "upperArm.L": [2, 0, -6],
    "forearm.L": [-10, 0, 0],
    "hand.L": [-4, 0, 0],
  }),
  contrapposto: mirrored({
    hips: [0, 3, 4],
    spine: [0, -2, -3],
    chest: [0, -2, -2],
    head: [0, 6, 3],
    "thigh.L": [0, 0, -3],
    "thigh.R": [-7, 0, -1],
    "shin.R": [13, 0, 0],
    "foot.R": [-6, 0, 0],
    "upperArm.L": [4, 0, -5],
    "forearm.L": [-8, 0, 0],
    "upperArm.R": [-3, 0, 4],
    "forearm.R": [-16, 0, 0],
  }),
  walk: {
    spine: [0, 4, 0],
    chest: [2, -7, 0],
    head: [0, 3, 0],
    "thigh.L": [-19, 0, -1],
    "shin.L": [7, 0, 0],
    "foot.L": [4, 0, 0],
    "thigh.R": [14, 0, 1],
    "shin.R": [20, 0, 0],
    "foot.R": [-10, 0, 0],
    "upperArm.L": [15, 0, -5],
    "forearm.L": [-10, 0, 0],
    "upperArm.R": [-17, 0, 5],
    "forearm.R": [-20, 0, 0],
  },
};

const tmpE = new Euler();

/** Target quaternions for a pose, one per bone (identity where the pose says nothing). */
export function poseQuaternions(pose: Pose): Quaternion[] {
  return BONE_NAMES.map((name) => {
    const r = pose[name];
    return r
      ? new Quaternion().setFromEuler(tmpE.set(r[0] * deg, r[1] * deg, r[2] * deg))
      : new Quaternion();
  });
}

/** Moves the rig toward a pose; `t` = 1 snaps to it. */
export function applyPose(rig: Rig, pose: Pose | Quaternion[], t: number) {
  const q = Array.isArray(pose) ? pose : poseQuaternions(pose);
  rig.bones.forEach((b, i) => {
    if (t >= 1) b.quaternion.copy(q[i]!);
    else b.quaternion.slerp(q[i]!, t);
  });
  rig.root.updateMatrixWorld(true);
}

/** A slow breath and sway on top of the pose (radians, small). */
export function idleOffsets(time: number, out: Quaternion[]) {
  const breath = Math.sin(time * 1.6);
  const sway = Math.sin(time * 0.55);
  out[BONE.chest]!.setFromEuler(tmpE.set(breath * 0.8 * deg, 0, 0));
  out[BONE.spine]!.setFromEuler(tmpE.set(breath * 0.3 * deg, sway * 0.6 * deg, 0));
  out[BONE.head]!.setFromEuler(tmpE.set(-breath * 0.5 * deg, sway * 1.2 * deg, 0));
  out[BONE["upperArm.L"]]!.setFromEuler(tmpE.set(0, 0, -breath * 0.6 * deg));
  out[BONE["upperArm.R"]]!.setFromEuler(tmpE.set(0, 0, breath * 0.6 * deg));
}
