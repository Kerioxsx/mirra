/**
 * Body model: the landmarks the rigged avatar (mirra-rig@1, see rig/) is built from. Saved avatars
 * store *normalized* parameters (0..1), never raw geometry, so the mesh can change without breaking
 * saved configurations; a future GLB avatar honours the same contract and the same bone names.
 */
import { Vector3 } from "three";

export interface BodyParams {
  height: number;
  build: number;
  shoulders: number;
  hips: number;
  legLength: number;
}

export type HairStyle = "none" | "short" | "bun" | "long";

export interface Appearance {
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
}

export const DEFAULT_BODY: BodyParams = {
  height: 0.5,
  build: 0.45,
  shoulders: 0.5,
  hips: 0.5,
  legLength: 0.5,
};
export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: "#c99a78",
  hairStyle: "short",
  hairColor: "#1d1712",
};

export const SKIN_TONES = [
  "#f2d3bd",
  "#e3b796",
  "#c99a78",
  "#a8754f",
  "#7d5236",
  "#563723",
  "#3a2418",
];
export const HAIR_COLORS = [
  "#1d1712",
  "#4a3122",
  "#8a5a33",
  "#c9a26b",
  "#e8e1d4",
  "#7a7c80",
  "#8f2a2a",
];

export interface BodyPreset {
  id: string;
  label: string;
  body: BodyParams;
}

export const BODY_PRESETS: BodyPreset[] = [
  {
    id: "lean",
    label: "Lean",
    body: { height: 0.6, build: 0.25, shoulders: 0.45, hips: 0.4, legLength: 0.6 },
  },
  { id: "average", label: "Average", body: DEFAULT_BODY },
  {
    id: "athletic",
    label: "Athletic",
    body: { height: 0.6, build: 0.55, shoulders: 0.8, hips: 0.45, legLength: 0.5 },
  },
  {
    id: "curvy",
    label: "Curvy",
    body: { height: 0.4, build: 0.6, shoulders: 0.4, hips: 0.85, legLength: 0.45 },
  },
  {
    id: "broad",
    label: "Broad",
    body: { height: 0.7, build: 0.85, shoulders: 0.75, hips: 0.6, legLength: 0.5 },
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

export interface Limb {
  a: Vector3;
  b: Vector3;
  ra: number;
  rb: number;
}

/** All landmarks in metres. y is up, +z faces the camera; "right" means +x. */
export interface BodyModel {
  H: number;
  depth: number; // torso z/x ratio
  y: {
    ankle: number;
    knee: number;
    crotch: number;
    hip: number;
    waist: number;
    chest: number;
    shoulder: number;
    neckBase: number;
    neckTop: number;
    head: number;
  };
  w: { hip: number; waist: number; chest: number; shoulder: number; neck: number };
  headR: number;
  upperArm: Limb;
  forearm: Limb;
  thigh: Limb;
  shin: Limb;
  hand: { center: Vector3; r: number };
  foot: { center: Vector3; length: number; width: number; height: number };
}

export function computeBody(p: BodyParams): BodyModel {
  const H = lerp(1.58, 1.94, p.height);
  const b = lerp(0.82, 1.22, p.build);
  const legShift = lerp(-0.02, 0.02, p.legLength);
  const crotch = (0.47 + legShift) * H;
  const y = {
    ankle: 0.045 * H,
    knee: lerp(0.27, 0.3, p.legLength) * H,
    crotch,
    hip: crotch + 0.045 * H,
    waist: 0.615 * H + legShift * H * 0.4,
    chest: 0.725 * H,
    shoulder: 0.815 * H,
    neckBase: 0.835 * H,
    neckTop: 0.872 * H,
    head: 0.932 * H,
  };
  const w = {
    hip: 0.098 * H * lerp(0.88, 1.18, p.hips) * lerp(0.92, 1.1, p.build),
    waist: 0.076 * H * b,
    chest: 0.094 * H * lerp(0.9, 1.15, p.build),
    shoulder: 0.118 * H * lerp(0.9, 1.14, p.shoulders),
    neck: 0.03 * H,
  };
  const shoulderJoint = new Vector3(w.shoulder * 0.88, y.shoulder - 0.022 * H, 0);
  const armAngle = (13 * Math.PI) / 180; // A-pose: easy to dress, reads as a fashion mannequin
  const dir = new Vector3(Math.sin(armAngle), -Math.cos(armAngle), 0);
  const elbow = shoulderJoint.clone().addScaledVector(dir, 0.172 * H);
  const wrist = elbow.clone().addScaledVector(dir, 0.152 * H);
  const hipJoint = new Vector3(w.hip * 0.5, crotch + 0.012 * H, 0);
  const knee = new Vector3(w.hip * 0.47, y.knee, 0.004 * H);
  const ankle = new Vector3(w.hip * 0.55, y.ankle + 0.012 * H, -0.004 * H);
  return {
    H,
    depth: 0.64,
    y,
    w,
    headR: 0.064 * H,
    upperArm: { a: shoulderJoint, b: elbow, ra: 0.03 * H * b, rb: 0.023 * H * b },
    forearm: { a: elbow, b: wrist, ra: 0.022 * H * b, rb: 0.016 * H },
    thigh: { a: hipJoint, b: knee, ra: 0.056 * H * lerp(0.9, 1.15, p.hips), rb: 0.034 * H * b },
    shin: { a: knee, b: ankle, ra: 0.033 * H * b, rb: 0.02 * H },
    hand: { center: wrist.clone().addScaledVector(dir, 0.045 * H), r: 0.024 * H },
    foot: {
      center: new Vector3(ankle.x, 0.024 * H, 0.032 * H),
      length: 0.148 * H,
      width: 0.052 * H,
      height: 0.046 * H,
    },
  };
}

/** Torso silhouette as (radius, y) pairs, bottom to top; revolved and squashed in z. */
export function torsoProfile(m: BodyModel): [number, number][] {
  const { y, w, H } = m;
  return [
    [w.hip * 0.62, y.crotch - 0.01 * H],
    [w.hip * 0.93, y.crotch + 0.02 * H],
    [w.hip, y.hip],
    [(w.hip + w.waist) / 2 + 0.004 * H, (y.hip + y.waist) / 2],
    [w.waist, y.waist],
    [(w.waist + w.chest) / 2 + 0.003 * H, (y.waist + y.chest) / 2],
    [w.chest, y.chest],
    [w.chest * 0.98, y.shoulder - 0.04 * H],
    [w.shoulder * 0.76, y.shoulder - 0.01 * H],
    [w.shoulder * 0.52, y.shoulder + 0.008 * H],
    [w.neck * 1.35, y.neckBase],
  ];
}

/**
 * The torso's front-to-back depth as a fraction of its width, by height: rounder at the hips, flatter
 * across the shoulders (wide but thin), round again at the neck. Keeps wide shoulders from pushing
 * the chest forward.
 */
export function torsoDepth(m: BodyModel, at: number): number {
  const { y, H } = m;
  const pts: [number, number][] = [
    [y.crotch, 0.7],
    [y.hip, 0.66],
    [y.waist, m.depth],
    [y.chest, m.depth],
    [y.shoulder - 0.04 * H, 0.62],
    [y.shoulder - 0.01 * H, 0.56],
    [y.shoulder + 0.008 * H, 0.64],
    [y.neckBase, 0.9],
  ];
  if (at <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [y1, d1] = pts[i]!;
    const [y0, d0] = pts[i - 1]!;
    if (at <= y1) return d0 + ((d1 - d0) * (at - y0)) / (y1 - y0);
  }
  return pts[pts.length - 1]![1];
}

/** Torso profile with depths: (radius, y, depth) triples for the lathe. */
export function torsoProfile3(m: BodyModel): [number, number, number][] {
  return torsoProfile(m).map(([r, py]) => [r, py, torsoDepth(m, py)]);
}

/** Interpolated torso radius at height `at` (clamped to the profile). */
export function radiusAt(profile: [number, number][], at: number): number {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (at <= first[1]) return first[0];
  if (at >= last[1]) return last[0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i]!;
    const [r0, y0] = profile[i - 1]!;
    if (at <= y1) return r0 + ((r1 - r0) * (at - y0)) / (y1 - y0);
  }
  return last[0];
}

/** Points along a limb at fraction t (0 = joint a, 1 = joint b). */
export function limbAt(l: Limb, t: number): { p: Vector3; r: number } {
  return { p: l.a.clone().lerp(l.b, t), r: l.ra + (l.rb - l.ra) * t };
}

export function mirrorX(v: Vector3): Vector3 {
  return new Vector3(-v.x, v.y, v.z);
}
