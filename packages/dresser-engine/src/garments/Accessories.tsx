import { useMemo } from "react";
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Quaternion,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import type { ParametricSpec } from "@mirra/garment-system";
import { limbAt, mirrorX } from "../body";
import type { GarmentRenderProps } from "./common";

type Spec<T extends ParametricSpec["template"]> = Extract<ParametricSpec, { template: T }>;

const Z = new Vector3(0, 0, 1);
const quatFromZ = (dir: Vector3) => new Quaternion().setFromUnitVectors(Z, dir.clone().normalize());

export function Glasses({ body, material }: GarmentRenderProps) {
  const H = body.H;
  const geo = useMemo(
    () => ({
      rim: new TorusGeometry(0.0155 * H, 0.0024 * H, 8, 28),
      bridge: new CylinderGeometry(0.0016 * H, 0.0016 * H, 0.012 * H, 8),
      arm: new BoxGeometry(0.002 * H, 0.002 * H, body.headR * 1.1),
    }),
    [H, body.headR],
  );
  const y = body.y.head + body.headR * 0.12;
  // the cranium is centred 0.004H forward with a z radius of 0.92 headR (rig/bodyField.ts)
  const z = 0.004 * H + body.headR * 0.92 + 0.006 * H;
  const dx = 0.0205 * H;
  return (
    <group position={[0, y, z]}>
      {[1, -1].map((s) => (
        <group key={s}>
          <mesh geometry={geo.rim} material={material} position={[s * dx, 0, 0]} />
          <mesh
            geometry={geo.arm}
            material={material}
            position={[s * (dx + 0.015 * H), 0.003 * H, -body.headR * 0.55]}
            rotation={[0, s * -0.12, 0]}
          />
        </group>
      ))}
      <mesh
        geometry={geo.bridge}
        material={material}
        rotation={[0, 0, Math.PI / 2]}
        position={[0, 0.003 * H, 0]}
      />
    </group>
  );
}

export function Neck({ spec, body, material }: { spec: Spec<"neck"> } & GarmentRenderProps) {
  const H = body.H;
  const geo = useMemo(
    () =>
      spec.style === "chain"
        ? new TorusGeometry(body.w.neck * 1.75, 0.0032 * H, 8, 64)
        : new TorusGeometry(body.w.neck * 1.6, 0.024 * H, 14, 40),
    [body, spec.style, H],
  );
  const tail = useMemo(() => new BoxGeometry(0.05 * H, 0.2 * H, 0.016 * H), [H]);
  return (
    <group>
      <mesh
        geometry={geo}
        material={material}
        position={[
          0,
          body.y.neckBase - (spec.style === "chain" ? 0.026 : 0.004) * H,
          spec.style === "chain" ? 0.012 * H : 0,
        ]}
        rotation={[Math.PI / 2 - (spec.style === "chain" ? 0.55 : 0.15), 0, 0]}
        scale={[1, spec.style === "chain" ? 1.25 : 0.95, 1]}
        castShadow
      />
      {spec.style === "scarf" ? (
        <mesh
          geometry={tail}
          material={material}
          position={[0.035 * H, body.y.chest + 0.015 * H, body.w.chest * body.depth + 0.03 * H]}
          rotation={[0.1, 0, 0.05]}
          castShadow
        />
      ) : null}
    </group>
  );
}

export function Watch({ body, material, trim }: GarmentRenderProps) {
  const fa = body.forearm;
  const at = mirrorX(limbAt(fa, 0.86).p);
  const dir = mirrorX(fa.b.clone().sub(fa.a));
  const r = limbAt(fa, 0.86).r * 1.18;
  const geo = useMemo(
    () => ({
      strap: new TorusGeometry(r, r * 0.22, 8, 28),
      face: new CylinderGeometry(r * 0.75, r * 0.75, r * 0.35, 24),
    }),
    [r],
  );
  return (
    <group position={at}>
      <mesh geometry={geo.strap} material={material} quaternion={quatFromZ(dir)} />
      <mesh
        geometry={geo.face}
        material={trim}
        position={[-r * 0.2, 0, r * 0.95]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

export function Bag({ body, material }: GarmentRenderProps) {
  const { H, w, y, depth } = body;
  const geo = useMemo(() => {
    const bagAt = new Vector3(w.hip * 1.12, y.hip + 0.02 * H, 0.03 * H);
    const front = w.chest * depth + 0.03 * H;
    const strap = new TubeGeometry(
      new CatmullRomCurve3(
        [
          bagAt.clone().add(new Vector3(-0.01 * H, 0.04 * H, 0)),
          new Vector3(w.waist * 0.55, y.waist + 0.04 * H, front * 0.96),
          new Vector3(-w.chest * 0.3, y.chest + 0.04 * H, front),
          new Vector3(-w.shoulder * 0.62, y.shoulder + 0.012 * H, 0),
          new Vector3(-w.chest * 0.2, y.chest, -front * 0.98),
          new Vector3(w.waist * 0.7, y.waist, -front * 0.85),
        ],
        true,
      ),
      96,
      0.0045 * H,
      6,
      true,
    );
    return { bagAt, strap, box: new BoxGeometry(0.06 * H, 0.085 * H, 0.03 * H) };
  }, [H, w, y, depth]);
  return (
    <group>
      <mesh
        geometry={geo.box}
        material={material}
        position={geo.bagAt}
        rotation={[0, -0.3, 0.05]}
        castShadow
      />
      <mesh geometry={geo.strap} material={material} castShadow />
    </group>
  );
}
