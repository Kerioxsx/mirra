export type Quality = "low" | "medium" | "high";

export interface QualitySettings {
  dpr: [number, number];
  shadows: boolean;
  antialias: boolean;
  contactShadows: boolean;
  shadowMapSize: number;
}

/** Rendering tiers. "low" targets integrated GPUs and WebKitGTK. */
export const QUALITY: Record<Quality, QualitySettings> = {
  low: { dpr: [1, 1], shadows: false, antialias: false, contactShadows: false, shadowMapSize: 512 },
  medium: {
    dpr: [1, 1.5],
    shadows: true,
    antialias: true,
    contactShadows: true,
    shadowMapSize: 1024,
  },
  high: { dpr: [1, 2], shadows: true, antialias: true, contactShadows: true, shadowMapSize: 2048 },
};
