import type { BodyRegion, Category } from "@mirra/shared-types";

/** How faithfully a 3D garment represents a real product. Always shown to the user. */
export type Fidelity = "exact" | "approximate" | "generic";

export type Fit = "slim" | "regular" | "relaxed" | "oversized";

/** Parameters for procedurally generated garments (approximate & generic fidelity). */
export type ParametricSpec =
  | {
      template: "top";
      sleeve: "none" | "short" | "long";
      length: "crop" | "hip" | "thigh" | "knee";
      fit: Fit;
      hood?: boolean;
      openFront?: boolean;
      collar?: boolean;
    }
  | {
      template: "bottom";
      length: "short" | "knee" | "full";
      shape: "straight" | "wide" | "tapered" | "cargo";
      fit: Fit;
    }
  | { template: "skirt"; length: "mini" | "knee" | "midi"; fit: Fit }
  | {
      template: "dress";
      length: "mini" | "knee" | "midi";
      sleeve: "none" | "short" | "long";
      fit: Fit;
    }
  | { template: "jumpsuit"; sleeve: "none" | "short" | "long"; fit: Fit }
  | { template: "footwear"; style: "low" | "high" | "boot" | "sandal" | "dress" }
  | { template: "headwear"; style: "cap" | "beanie" | "hat" }
  | { template: "glasses" }
  | { template: "neck"; style: "chain" | "scarf" }
  | { template: "belt" }
  | { template: "watch" }
  | { template: "bag" };

export type ParametricTemplate = ParametricSpec["template"];

export interface ColorVariant {
  id: string;
  label: string;
  hex: string;
}

export type MaterialKind =
  | "cotton"
  | "fleece"
  | "denim"
  | "nylon"
  | "wool"
  | "leather"
  | "knit"
  | "canvas"
  | "metal"
  | "acetate";

/** A wearable garment as the dresser understands it. Mirrors the `garment_assets` table. */
export interface GarmentDefinition {
  id: string;
  name: string;
  category: Category;
  bodyRegion: BodyRegion;
  layer: number;
  fidelity: Fidelity;
  /** A curated, rigged GLB (exact fidelity). Absent for parametric garments. */
  asset?: { url: string; version: number; rigVersion: string };
  parametric?: ParametricSpec;
  material: MaterialKind;
  colorVariants: ColorVariant[];
  /** Set when the garment represents a specific product. */
  productId?: string;
}
