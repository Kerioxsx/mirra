import type { Category } from "@mirra/shared-types";
import type { MaterialKind, ParametricSpec } from "./types";

/** The parametric garment used for every category when no curated model exists. */
export const CATEGORY_TEMPLATES: Record<
  Category,
  { spec: ParametricSpec; material: MaterialKind }
> = {
  t_shirt: {
    spec: { template: "top", sleeve: "short", length: "hip", fit: "regular" },
    material: "cotton",
  },
  tank_top: {
    spec: { template: "top", sleeve: "none", length: "hip", fit: "regular" },
    material: "cotton",
  },
  long_sleeve: {
    spec: { template: "top", sleeve: "long", length: "hip", fit: "regular" },
    material: "cotton",
  },
  shirt: {
    spec: {
      template: "top",
      sleeve: "long",
      length: "hip",
      fit: "regular",
      collar: true,
      openFront: true,
    },
    material: "cotton",
  },
  sweater: {
    spec: { template: "top", sleeve: "long", length: "hip", fit: "relaxed" },
    material: "knit",
  },
  hoodie: {
    spec: { template: "top", sleeve: "long", length: "hip", fit: "relaxed", hood: true },
    material: "fleece",
  },
  sweatshirt: {
    spec: { template: "top", sleeve: "long", length: "hip", fit: "relaxed" },
    material: "fleece",
  },
  vest: {
    spec: { template: "top", sleeve: "none", length: "hip", fit: "regular", openFront: true },
    material: "nylon",
  },
  zip_up: {
    spec: {
      template: "top",
      sleeve: "long",
      length: "hip",
      fit: "relaxed",
      hood: true,
      openFront: true,
    },
    material: "fleece",
  },
  jacket: {
    spec: {
      template: "top",
      sleeve: "long",
      length: "hip",
      fit: "relaxed",
      openFront: true,
      collar: true,
    },
    material: "nylon",
  },
  coat: {
    spec: {
      template: "top",
      sleeve: "long",
      length: "knee",
      fit: "relaxed",
      openFront: true,
      collar: true,
    },
    material: "wool",
  },
  dress: {
    spec: { template: "dress", length: "knee", sleeve: "short", fit: "regular" },
    material: "cotton",
  },
  jumpsuit: { spec: { template: "jumpsuit", sleeve: "short", fit: "relaxed" }, material: "canvas" },
  jeans: {
    spec: { template: "bottom", length: "full", shape: "straight", fit: "regular" },
    material: "denim",
  },
  baggy_pants: {
    spec: { template: "bottom", length: "full", shape: "wide", fit: "oversized" },
    material: "denim",
  },
  cargo_pants: {
    spec: { template: "bottom", length: "full", shape: "cargo", fit: "relaxed" },
    material: "canvas",
  },
  trousers: {
    spec: { template: "bottom", length: "full", shape: "straight", fit: "regular" },
    material: "wool",
  },
  sweatpants: {
    spec: { template: "bottom", length: "full", shape: "tapered", fit: "relaxed" },
    material: "fleece",
  },
  shorts: {
    spec: { template: "bottom", length: "short", shape: "straight", fit: "relaxed" },
    material: "cotton",
  },
  skirt: { spec: { template: "skirt", length: "knee", fit: "regular" }, material: "cotton" },
  sneakers: { spec: { template: "footwear", style: "low" }, material: "leather" },
  boots: { spec: { template: "footwear", style: "boot" }, material: "leather" },
  shoes: { spec: { template: "footwear", style: "dress" }, material: "leather" },
  sandals: { spec: { template: "footwear", style: "sandal" }, material: "leather" },
  hat: { spec: { template: "headwear", style: "hat" }, material: "wool" },
  cap: { spec: { template: "headwear", style: "cap" }, material: "cotton" },
  beanie: { spec: { template: "headwear", style: "beanie" }, material: "knit" },
  glasses: { spec: { template: "glasses" }, material: "acetate" },
  jewelry: { spec: { template: "neck", style: "chain" }, material: "metal" },
  scarf: { spec: { template: "neck", style: "scarf" }, material: "knit" },
  belt: { spec: { template: "belt" }, material: "leather" },
  watch: { spec: { template: "watch" }, material: "metal" },
  bag: { spec: { template: "bag" }, material: "nylon" },
  accessory: { spec: { template: "bag" }, material: "nylon" },
};
