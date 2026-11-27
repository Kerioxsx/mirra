import type { Material } from "three";
import type { BodyModel } from "../body";

export interface GarmentRenderProps {
  body: BodyModel;
  hex: string;
  /** Extra stand-off from the body (metres). */
  add: number;
  material: Material;
  trim: Material;
}
