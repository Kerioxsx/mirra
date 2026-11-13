import { useMemo } from "react";
import type { ParametricSpec } from "@mirra/garment-system";
import { smoothLathe } from "../geometry";
import { Bottom, skirtProfile } from "./Bottom";
import { FIT_DRAPE, FIT_SCALE, type GarmentRenderProps } from "./common";
import { Sleeves, Top, topProfile } from "./Top";

type DressSpec = Extract<ParametricSpec, { template: "dress" }>;
type JumpsuitSpec = Extract<ParametricSpec, { template: "jumpsuit" }>;

export function Dress({
  spec,
  body,
  add,
  material,
  trim,
}: { spec: DressSpec } & GarmentRenderProps) {
  const fs = FIT_SCALE[spec.fit];
  const shell = useMemo(() => {
    const skirt = skirtProfile(body, spec.length, fs, add).slice(0, -1); // hem → hip
    const bodice = topProfile(body, {
      hemY: body.y.waist,
      fs,
      drape: FIT_DRAPE[spec.fit] * 0.4,
      add,
    });
    return smoothLathe(
      [...skirt, ...bodice.filter(([, py]) => py > body.y.hip + 0.01 * body.H)],
      56,
      96,
    );
  }, [body, spec, fs, add]);
  return (
    <group>
      <mesh
        geometry={shell}
        material={material}
        scale={[1, 1, body.depth]}
        castShadow
        receiveShadow
      />
      <Sleeves
        body={body}
        sleeve={spec.sleeve}
        fs={fs}
        add={add}
        material={material}
        trim={trim}
        cuffs={false}
      />
    </group>
  );
}

export function Jumpsuit({ spec, ...props }: { spec: JumpsuitSpec } & GarmentRenderProps) {
  return (
    <group>
      <Bottom
        spec={{ template: "bottom", length: "full", shape: "straight", fit: spec.fit }}
        {...props}
      />
      <Top
        spec={{
          template: "top",
          sleeve: spec.sleeve,
          length: "hip",
          fit: spec.fit,
          openFront: true,
          collar: true,
        }}
        {...props}
      />
    </group>
  );
}
