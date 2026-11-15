import type { GarmentDefinition, ParametricSpec } from "@mirra/garment-system";
import type { Material } from "three";
import type { BodyModel } from "../body";
import { fabric, shade } from "../materials";
import type { BoneName } from "../rig/skeleton";
import { Bag, Glasses, Neck, Watch } from "./Accessories";

/** Accessories that are rigid objects riding on one bone (the rest are built as fields). */
export const RIGID_BONE: Partial<Record<ParametricSpec["template"], BoneName>> = {
  glasses: "head",
  neck: "chest",
  watch: "forearm.R",
  bag: "spine",
};

/** The fabric and the trim (cuffs, soles, bands, zips, buckles) of a garment in a colour. */
export function garmentMaterials(
  garment: GarmentDefinition,
  hex: string,
  highlighted: boolean,
): { material: Material; trim: Material } {
  const template = garment.parametric?.template;
  const trimHex =
    garment.material === "metal"
      ? shade(hex, 0.12)
      : shade(hex, template === "footwear" ? 0.5 : -0.06);
  return {
    material: fabric(garment.material, hex, highlighted),
    trim: fabric(template === "footwear" ? "leather" : garment.material, trimHex, highlighted),
  };
}

export function RigidAccessory({
  garment,
  hex,
  body,
  highlighted = false,
}: {
  garment: GarmentDefinition;
  hex: string;
  body: BodyModel;
  highlighted?: boolean;
}) {
  const spec = garment.parametric;
  if (!spec) return null;
  const { material, trim } = garmentMaterials(garment, hex, highlighted);
  const props = { body, hex, add: 0, material, trim };
  switch (spec.template) {
    case "glasses":
      return <Glasses {...props} />;
    case "neck":
      return <Neck spec={spec} {...props} />;
    case "watch":
      return <Watch {...props} />;
    case "bag":
      return <Bag {...props} />;
    default:
      return null;
  }
}
