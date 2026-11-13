export type CameraPreset = "full" | "upper" | "lower" | "feet" | "head";

/** Camera position and target as fractions of body height, so presets work for any avatar. */
export const CAMERA_PRESETS: Record<
  CameraPreset,
  { label: string; pos: [number, number, number]; target: number }
> = {
  full: { label: "Full look", pos: [0.62, 0.6, 2.75], target: 0.5 },
  upper: { label: "Top", pos: [0.32, 0.8, 1.2], target: 0.72 },
  lower: { label: "Bottoms", pos: [0.34, 0.4, 1.35], target: 0.33 },
  feet: { label: "Shoes", pos: [0.32, 0.12, 0.62], target: 0.05 },
  head: { label: "Head", pos: [0.15, 0.95, 0.5], target: 0.92 },
};
