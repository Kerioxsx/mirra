import type { Fit } from "@mirra/garment-system";
import type { Material } from "three";
import type { BodyModel } from "../body";

/** How far a fit stands off the body (fraction of the body radius). */
export const FIT_SCALE: Record<Fit, number> = {
  slim: 0.03,
  regular: 0.07,
  relaxed: 0.12,
  oversized: 0.2,
};
/** How much a top hangs straight from the chest instead of following the waist. */
export const FIT_DRAPE: Record<Fit, number> = {
  slim: 0,
  regular: 0.3,
  relaxed: 0.65,
  oversized: 0.9,
};

/**
 * Additive stand-off per layer so outer garments always enclose inner ones (no z-fighting).
 * Layer 10 → 0.4% of height, each further layer +0.45%.
 */
export function layerOffset(body: BodyModel, layer: number): number {
  const idx = Math.max(0, Math.round(layer / 10) - 1);
  return (0.004 + idx * 0.0045) * body.H;
}

export interface GarmentRenderProps {
  body: BodyModel;
  hex: string;
  /** Additive stand-off for this garment's layer. */
  add: number;
  material: Material;
  trim: Material;
}
