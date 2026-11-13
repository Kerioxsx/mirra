import { useMemo } from "react";
import type { GarmentDefinition } from "@mirra/garment-system";
import type { BodyModel } from "../body";
import { fabric, shade } from "../materials";
import { Bag, Belt, Footwear, Glasses, Headwear, Neck, Watch } from "./Accessories";
import { Bottom, Skirt } from "./Bottom";
import { layerOffset } from "./common";
import { Dress, Jumpsuit } from "./Dress";
import { Top } from "./Top";

export interface GarmentProps {
  garment: GarmentDefinition;
  hex: string;
  body: BodyModel;
  highlighted?: boolean;
}

/** Renders a parametric garment. Curated GLB garments (exact fidelity) arrive in Phase 5. */
export function ParametricGarment({ garment, hex, body, highlighted = false }: GarmentProps) {
  const spec = garment.parametric;
  const material = fabric(garment.material, hex, highlighted);
  const trimHex =
    garment.material === "metal"
      ? shade(hex, 0.12)
      : shade(hex, spec?.template === "footwear" ? 0.5 : -0.06);
  const trim = useMemo(
    () =>
      fabric(spec?.template === "footwear" ? "leather" : garment.material, trimHex, highlighted),
    [garment.material, trimHex, highlighted, spec?.template],
  );
  if (!spec) return null;
  const props = { body, hex, add: layerOffset(body, garment.layer), material, trim };
  switch (spec.template) {
    case "top":
      return <Top spec={spec} {...props} />;
    case "bottom":
      return <Bottom spec={spec} {...props} />;
    case "skirt":
      return <Skirt spec={spec} {...props} />;
    case "dress":
      return <Dress spec={spec} {...props} />;
    case "jumpsuit":
      return <Jumpsuit spec={spec} {...props} />;
    case "footwear":
      return <Footwear spec={spec} {...props} />;
    case "headwear":
      return <Headwear spec={spec} {...props} />;
    case "glasses":
      return <Glasses {...props} />;
    case "neck":
      return <Neck spec={spec} {...props} />;
    case "belt":
      return <Belt {...props} />;
    case "watch":
      return <Watch {...props} />;
    case "bag":
      return <Bag {...props} />;
  }
}
