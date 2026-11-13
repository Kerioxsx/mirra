import { useMemo } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import type { ParametricSpec } from "@mirra/garment-system";
import { limbAt, mirrorX, radiusAt, torsoProfile } from "../body";
import { segment, UNIT_BAND } from "../geometry";
import type { GarmentRenderProps } from "./common";
import { quatFromZ } from "./Top";

type Spec<T extends ParametricSpec["template"]> = Extract<ParametricSpec, { template: T }>;

export function Footwear({
  spec,
  body,
  material,
  trim,
}: { spec: Spec<"footwear"> } & GarmentRenderProps) {
  const geo = useMemo(() => {
    const f = body.foot;
    const H = body.H;
    const r = f.height * (spec.style === "boot" ? 0.62 : 0.58);
    const upper = new CapsuleGeometry(r, f.length * 1.04 - r * 2, 8, 18);
    upper.rotateX(Math.PI / 2);
    const soleH =
      spec.style === "boot" ? 0.018 * H : spec.style === "dress" ? 0.009 * H : 0.014 * H;
    const sole = new BoxGeometry(f.width * 1.28, soleH, f.length * 1.1);
    const shaftTop = spec.style === "boot" ? 0.15 * H : spec.style === "high" ? 0.1 * H : 0;
    const shaft = shaftTop
      ? segment(
          new Vector3(body.shin.b.x, f.height * 0.6, body.shin.b.z),
          limbAt(body.shin, 1 - (shaftTop - body.shin.b.y) / (body.shin.a.y - body.shin.b.y)).p,
          body.shin.rb * 1.75,
          body.shin.rb * (spec.style === "boot" ? 1.95 : 1.7),
        )
      : null;
    return { upper, sole, soleH, shaft, r };
  }, [body, spec.style]);
  const f = body.foot;
  const sandal = spec.style === "sandal";
  return (
    <group>
      {([1, -1] as const).map((side) => {
        const c = side === 1 ? f.center : mirrorX(f.center);
        return (
          <group key={side}>
            {!sandal ? (
              <mesh
                geometry={geo.upper}
                material={material}
                position={[c.x, c.y + 0.003 * body.H, c.z]}
                scale={[(f.width * 1.18) / (geo.r * 2), spec.style === "dress" ? 0.9 : 1, 1]}
                castShadow
              />
            ) : (
              [0.25, 0.6].map((t) => (
                <mesh
                  key={t}
                  geometry={geo.sole}
                  material={material}
                  position={[c.x, f.height * 0.55, c.z - f.length * 0.5 + f.length * t]}
                  scale={[1, 1.6, 0.08]}
                />
              ))
            )}
            <mesh
              geometry={geo.sole}
              material={trim}
              position={[c.x, geo.soleH / 2, c.z]}
              castShadow
              receiveShadow
            />
            {geo.shaft ? (
              <mesh
                geometry={geo.shaft.geometry}
                position={side === 1 ? geo.shaft.position : mirrorX(geo.shaft.position)}
                quaternion={geo.shaft.quaternion
                  .clone()
                  .set(
                    geo.shaft.quaternion.x,
                    geo.shaft.quaternion.y * side,
                    geo.shaft.quaternion.z * side,
                    geo.shaft.quaternion.w,
                  )}
                material={material}
                castShadow
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export function Headwear({
  spec,
  body,
  material,
  trim,
}: { spec: Spec<"headwear"> } & GarmentRenderProps) {
  const R = body.headR;
  const geo = useMemo(
    () => ({
      crown: new SphereGeometry(
        R * 1.1,
        36,
        18,
        0,
        Math.PI * 2,
        0,
        Math.PI * (spec.style === "beanie" ? 0.56 : 0.5),
      ),
      band: new TorusGeometry(R * 1.08, R * 0.12, 10, 40),
      brim: new CylinderGeometry(R * 0.95, R * 0.95, R * 0.07, 32, 1, false, -Math.PI / 2, Math.PI),
      hatCrown: new CylinderGeometry(R * 0.92, R * 1.02, R * 0.95, 36),
      hatBrim: new CylinderGeometry(R * 1.9, R * 1.9, R * 0.05, 48),
    }),
    [R, spec.style],
  );
  const cy = body.y.head;
  return (
    <group position={[0, cy, 0.004 * body.H]} scale={[0.86, 1, 0.97]}>
      {spec.style === "hat" ? (
        <>
          <mesh
            geometry={geo.hatCrown}
            material={material}
            position={[0, R * 0.62, 0]}
            castShadow
          />
          <mesh geometry={geo.hatBrim} material={material} position={[0, R * 0.18, 0]} castShadow />
          <mesh
            geometry={geo.band}
            material={trim}
            position={[0, R * 0.28, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.86, 0.86, 1]}
          />
        </>
      ) : (
        <>
          <mesh geometry={geo.crown} material={material} position={[0, R * 0.1, 0]} castShadow />
          {spec.style === "beanie" ? (
            <mesh
              geometry={geo.band}
              material={material}
              position={[0, R * 0.08, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[1, 1, 1.6]}
            />
          ) : (
            <mesh
              geometry={geo.brim}
              material={material}
              position={[0, R * 0.16, R * 0.88]}
              rotation={[0.28, 0, 0]}
              castShadow
            />
          )}
        </>
      )}
    </group>
  );
}

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
  // head is centred 0.004H forward and scaled 0.94 in z (see Mannequin)
  const z = 0.004 * H + body.headR * 0.94 + 0.005 * H;
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

export function Belt({ body, material, trim }: GarmentRenderProps) {
  const H = body.H;
  const r = radiusAt(torsoProfile(body), body.y.waist) * 1.14 + 0.022 * H;
  const buckle = useMemo(() => new BoxGeometry(0.03 * H, 0.024 * H, 0.006 * H), [H]);
  const geo = { buckle };
  const y = body.y.waist - 0.016 * H;
  return (
    <group>
      <mesh
        geometry={UNIT_BAND}
        material={material}
        position={[0, y, 0]}
        scale={[r, 0.02 * H, r * body.depth]}
      />
      <mesh geometry={geo.buckle} material={trim} position={[0, y, r * body.depth + 0.004 * H]} />
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
