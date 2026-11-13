import { useMemo } from "react";
import { CatmullRomCurve3, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from "three";
import type { ParametricSpec } from "@mirra/garment-system";
import { limbAt, mirrorX, radiusAt, torsoProfile, type BodyModel, type Limb } from "../body";
import { alongY, segment, smoothLathe, UNIT_BAND } from "../geometry";
import { FIT_DRAPE, FIT_SCALE, type GarmentRenderProps } from "./common";

type TopSpec = Extract<ParametricSpec, { template: "top" }>;
export type Sleeve = "none" | "short" | "long";

/** Garment torso profile from hem to collar, offset from the body by fit and layer. */
export function topProfile(
  body: BodyModel,
  opts: { hemY: number; fs: number; drape: number; add: number; flareTo?: number },
): [number, number][] {
  const { y, w, H } = body;
  const prof = torsoProfile(body);
  const collarY = y.neckBase - 0.004 * H;
  const chestR = w.chest;
  const raw: [number, number][] = [];
  if (opts.hemY < y.crotch) {
    // long garments (coats, dresses) hang over the hips instead of following the crotch
    raw.push([opts.flareTo ?? w.hip * 1.15, opts.hemY]);
    raw.push([w.hip * 1.03, y.crotch]);
  } else {
    raw.push([radiusAt(prof, opts.hemY), opts.hemY]);
  }
  for (const [r, py] of prof) {
    if (py <= Math.max(opts.hemY, y.crotch) + 0.004 * H || py >= collarY) continue;
    raw.push([py < y.hip ? Math.max(r, w.hip) : r, py]);
  }
  raw.push([w.neck * 1.62, collarY]);
  return raw.map(([r, py]) => {
    const draped = py < y.chest && py > y.hip ? r + (Math.max(chestR, r) - r) * opts.drape : r;
    return [draped * (1 + opts.fs) + opts.add, py];
  });
}

export function Sleeves({
  body,
  sleeve,
  fs,
  add,
  material,
  trim,
  cuffs,
}: { body: BodyModel; sleeve: Sleeve; fs: number; add: number; cuffs: boolean } & Pick<
  GarmentRenderProps,
  "material" | "trim"
>) {
  const parts = useMemo(() => {
    if (sleeve === "none") return null;
    const pad = 0.003 * body.H;
    const grow = (r: number) => r * (1 + fs) + add + pad;
    const up: Limb = body.upperArm;
    const shortEnd = fs >= 0.18 ? 0.8 : 0.52; // oversized tees reach the elbow
    const meshes: { seg: ReturnType<typeof segment>; side: 1 | -1 }[] = [];
    const joints: { at: Vector3; r: number }[] = [];
    let cuff: { at: Vector3; r: number; dir: Vector3 } | null = null;
    const end = sleeve === "short" ? limbAt(up, shortEnd) : null;
    const upperB = end ? end.p : up.b;
    const upperRb = end ? end.r : up.rb;
    for (const side of [1, -1] as const) {
      const m = (v: Vector3) => (side === 1 ? v : mirrorX(v));
      meshes.push({ seg: segment(m(up.a), m(upperB), grow(up.ra), grow(upperRb), true), side });
      if (sleeve === "long") {
        const fa = body.forearm;
        const wrist = fa.a.clone().lerp(fa.b, 1.04);
        meshes.push({
          seg: segment(m(fa.a), m(wrist), grow(fa.ra), grow(fa.rb) * 1.06, true),
          side,
        });
      }
    }
    // shoulder cap sits just inside the sleeve opening so the surfaces never coincide
    joints.push({ at: up.a, r: grow(up.ra) * 0.985 });
    if (sleeve === "long") {
      if (cuffs) {
        const fa = body.forearm;
        cuff = {
          at: fa.a.clone().lerp(fa.b, 0.98),
          r: grow(fa.rb) * 1.02,
          dir: fa.b.clone().sub(fa.a).normalize(),
        };
      }
    }
    return { meshes, joints, cuff };
  }, [body, sleeve, fs, add, cuffs]);

  const sphere = useMemo(() => new SphereGeometry(1, 20, 14), []);
  if (!parts) return null;
  return (
    <>
      {parts.meshes.map(({ seg }, i) => (
        <mesh
          key={i}
          geometry={seg.geometry}
          position={seg.position}
          quaternion={seg.quaternion}
          material={material}
          castShadow
        />
      ))}
      {[1, -1].flatMap((side) =>
        parts.joints.map((j, i) => (
          <mesh
            key={`${side}-${i}`}
            geometry={sphere}
            position={side === 1 ? j.at : mirrorX(j.at)}
            scale={j.r}
            material={material}
            castShadow
          />
        )),
      )}
      {parts.cuff
        ? [1, -1].map((side) => {
            const c = parts.cuff!;
            const dir = side === 1 ? c.dir : new Vector3(-c.dir.x, c.dir.y, c.dir.z);
            return (
              <mesh
                key={`cuff${side}`}
                geometry={UNIT_BAND}
                position={side === 1 ? c.at : mirrorX(c.at)}
                scale={[c.r * 1.01, body.H * 0.022, c.r * 1.01]}
                quaternion={alongY(dir)}
                material={trim}
              />
            );
          })
        : null}
    </>
  );
}

const Z = new Vector3(0, 0, 1);
export const quatFromZ = (dir: Vector3) =>
  new Quaternion().setFromUnitVectors(Z, dir.clone().normalize());

export function Top({ spec, body, add, material, trim }: { spec: TopSpec } & GarmentRenderProps) {
  const fs = FIT_SCALE[spec.fit];
  const geo = useMemo(() => {
    const { y, H, w } = body;
    const hemY = {
      crop: y.waist + 0.015 * H,
      hip: y.crotch + 0.022 * H,
      thigh: y.crotch - 0.075 * H,
      knee: y.knee + 0.045 * H,
    }[spec.length];
    const profile = topProfile(body, {
      hemY,
      fs,
      drape: FIT_DRAPE[spec.fit],
      add,
      flareTo: w.hip * (spec.length === "knee" ? 1.28 : 1.12),
    });
    const shell = smoothLathe(profile, 56);
    const collarY = profile[profile.length - 1]![1];
    const collarR = profile[profile.length - 1]![0];
    const hem = profile[0]!;
    // zip / placket line down the centre front, following the garment surface
    const front = spec.openFront
      ? new TubeGeometry(
          new CatmullRomCurve3(
            profile
              .filter(([, py]) => py <= collarY)
              .map(([r, py]) => new Vector3(0, py, r * body.depth + 0.0015 * H)),
          ),
          48,
          0.0024 * H,
          6,
        )
      : null;
    const hood = spec.hood
      ? new SphereGeometry(
          0.056 * H + add * 0.5,
          28,
          16,
          Math.PI * 1.12,
          Math.PI * 0.76,
          0,
          Math.PI * 0.55,
        )
      : null;
    return { shell, collarY, collarR, hem, front, hood };
  }, [body, spec, fs, add]);

  const isRibbed = !spec.openFront || spec.hood;
  return (
    <group>
      <mesh
        geometry={geo.shell}
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
        cuffs={isRibbed ?? false}
      />
      {spec.collar || spec.hood ? (
        <mesh
          geometry={UNIT_BAND}
          position={[0, geo.collarY + (spec.collar ? 0.012 : 0.006) * body.H, 0]}
          scale={[
            geo.collarR * 0.98,
            (spec.collar ? 0.03 : 0.016) * body.H,
            geo.collarR * 0.98 * body.depth,
          ]}
          material={trim}
        />
      ) : null}
      {spec.hood && geo.hood ? (
        <mesh
          geometry={geo.hood}
          material={material}
          position={[0, body.y.neckBase - 0.03 * body.H, -0.04 * body.H]}
          rotation={[-0.75, 0, 0]}
          scale={[0.92, 0.62, 0.78]}
          castShadow
        />
      ) : null}
      {geo.front ? <mesh geometry={geo.front} material={trim} /> : null}
      {isRibbed && spec.length !== "knee" ? (
        <mesh
          geometry={UNIT_BAND}
          position={[0, geo.hem[1] + 0.011 * body.H, 0]}
          scale={[geo.hem[0] * 1.012, 0.022 * body.H, geo.hem[0] * 1.012 * body.depth]}
          material={trim}
        />
      ) : null}
    </group>
  );
}
