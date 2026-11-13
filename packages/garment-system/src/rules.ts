import { taxonomy, type BodyRegion } from "@mirra/shared-types";
import type { GarmentDefinition } from "./types";

/** Each body region + layer holds one garment. */
export type SlotKey = `${string}:${number}`;

export function slotKey(g: Pick<GarmentDefinition, "bodyRegion" | "layer">): SlotKey {
  return `${g.bodyRegion}:${g.layer}`;
}

const FULL_BODY_COVERS = new Set<BodyRegion>(taxonomy.fullBodyCovers);
const BASE_LAYER = taxonomy.layers.base;

/** Why two garments can't be worn together, or null if they can. */
export function conflictReason(a: GarmentDefinition, b: GarmentDefinition): string | null {
  if (slotKey(a) === slotKey(b)) return "same slot";
  const [full, other] =
    a.bodyRegion === "full_body" ? [a, b] : b.bodyRegion === "full_body" ? [b, a] : [null, null];
  if (full && other && FULL_BODY_COVERS.has(other.bodyRegion) && other.layer === BASE_LAYER) {
    return `${full.name} covers the ${other.bodyRegion}`;
  }
  return null;
}

/** Render order: inner layers first so outer garments enclose them. */
export function compareLayers(a: GarmentDefinition, b: GarmentDefinition): number {
  return a.layer - b.layer || a.bodyRegion.localeCompare(b.bodyRegion);
}
