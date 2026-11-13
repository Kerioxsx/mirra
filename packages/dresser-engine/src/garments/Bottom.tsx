import { useMemo } from "react";
import { BoxGeometry, SphereGeometry, Vector3 } from "three";
import type { ParametricSpec } from "@mirra/garment-system";
import { limbAt, mirrorX, radiusAt, torsoProfile, type BodyModel } from "../body";
import { segment, smoothLathe, UNIT_BAND } from "../geometry";
import { FIT_SCALE, type GarmentRenderProps } from "./common";

type BottomSpec = Extract<ParametricSpec, { template: "bottom" }>;
type SkirtSpec = Extract<ParametricSpec, { template: "skirt" }>;

function Waistband({
  body,
  r,
  y,
  material,
}: {
  body: BodyModel;
  r: number;
  y: number;
  material: GarmentRenderProps["trim"];
}) {
  return (
    <mesh
      geometry={UNIT_BAND}
      position={[0, y - 0.01 * body.H, 0]}
      scale={[r * 1.012, 0.024 * body.H, r * 1.012 * body.depth]}
      material={material}
    />
  );
}

export function Bottom({
  spec,
  body,
  add,
  material,
  trim,
}: { spec: BottomSpec } & GarmentRenderProps) {
  const fs = FIT_SCALE[spec.fit];
  const geo = useMemo(() => {
    const { y, H } = body;
    const prof = torsoProfile(body);
    const waistY = y.waist - 0.012 * H;
    const grow = (r: number) => r * (1 + fs) + add + 0.004 * H;
    // seat: from just under the crotch up to the waistband
    const seatPts: [number, number][] = [[0.001, y.crotch - 0.018 * H]];
    for (const [r, py] of prof)
      if (py > y.crotch - 0.012 * H && py < waistY) seatPts.push([grow(r), py]);
    seatPts.push([grow(radiusAt(prof, waistY)), waistY]);
    const seat = smoothLathe(seatPts, 48);

    const t = body.thigh;
    const s = body.shin;
    const kneeR = grow(t.rb) * (spec.shape === "wide" ? 1.4 : spec.shape === "cargo" ? 1.14 : 1.04);
    const topR = grow(t.ra) * (spec.shape === "wide" ? 1.1 : 1);
    const legs: ReturnType<typeof segment>[] = [];
    const joints: { at: Vector3; r: number }[] = [];
    for (const side of [1, -1] as const) {
      const m = (v: Vector3) => (side === 1 ? v : mirrorX(v));
      const top = t.a.clone().add(new Vector3(0, 0.01 * H, 0));
      if (spec.length === "short") {
        const end = limbAt(t, 0.62);
        legs.push(segment(m(top), m(end.p), topR, grow(end.r) * 1.12, true));
        continue;
      }
      const kneeEnd = spec.length === "knee" ? t.b.clone().add(new Vector3(0, -0.035 * H, 0)) : t.b;
      legs.push(segment(m(top), m(kneeEnd), topR, kneeR, true));
      if (spec.length === "full") {
        const hemDrop = spec.shape === "wide" ? 0.03 : 0.014;
        const hem = s.b.clone().add(new Vector3(0, -hemDrop * H, 0.002 * H));
        const hemR =
          spec.shape === "wide"
            ? kneeR * 1.12
            : spec.shape === "tapered"
              ? grow(s.rb) * 1.3
              : Math.max(kneeR * 0.9, grow(s.rb) * 1.8);
        legs.push(segment(m(t.b), m(hem), kneeR, hemR, true));
        if (side === 1) joints.push({ at: t.b, r: kneeR * 0.97 });
      }
    }
    const pockets =
      spec.shape === "cargo" && spec.length !== "short"
        ? ([1, -1] as const).map((side) => {
            const at = limbAt(t, 0.6);
            const p = new Vector3(at.p.x + grow(at.r) * 0.92, at.p.y, at.p.z + 0.004 * H);
            return { pos: side === 1 ? p : mirrorX(p), side };
          })
        : [];
    return { seat, legs, joints, waistY, waistR: grow(radiusAt(prof, waistY)), pockets };
  }, [body, spec, fs, add]);

  const sphere = useMemo(() => new SphereGeometry(1, 20, 14), []);
  const pocket = useMemo(
    () => new BoxGeometry(0.024 * body.H, 0.07 * body.H, 0.06 * body.H),
    [body.H],
  );
  return (
    <group>
      <mesh geometry={geo.seat} material={material} scale={[1, 1, body.depth]} castShadow />
      {geo.legs.map((l, i) => (
        <mesh
          key={i}
          geometry={l.geometry}
          position={l.position}
          quaternion={l.quaternion}
          material={material}
          castShadow
          receiveShadow
        />
      ))}
      {geo.joints.flatMap((j) =>
        [1, -1].map((side) => (
          <mesh
            key={side}
            geometry={sphere}
            position={side === 1 ? j.at : mirrorX(j.at)}
            scale={j.r}
            material={material}
          />
        )),
      )}
      {geo.pockets.map((p) => (
        <mesh
          key={p.side}
          geometry={pocket}
          position={p.pos}
          rotation={[0, 0, p.side * 0.06]}
          material={material}
          castShadow
        />
      ))}
      <Waistband body={body} r={geo.waistR} y={geo.waistY} material={trim} />
    </group>
  );
}

export function skirtProfile(
  body: BodyModel,
  length: SkirtSpec["length"],
  fs: number,
  add: number,
): [number, number][] {
  const { y, w, H } = body;
  const hem = {
    mini: [w.hip * 1.2, y.crotch - 0.075 * H],
    knee: [w.hip * 1.32, y.knee + 0.015 * H],
    midi: [w.hip * 1.42, y.knee - 0.1 * H],
  }[length] as [number, number];
  const pts: [number, number][] = [
    hem,
    [w.hip * 1.06, y.crotch],
    [w.hip, y.hip],
    [w.waist, y.waist - 0.012 * H],
  ];
  return pts.map(([r, py]) => [r * (1 + fs) + add + 0.004 * H, py]);
}

export function Skirt({
  spec,
  body,
  add,
  material,
  trim,
}: { spec: SkirtSpec } & GarmentRenderProps) {
  const fs = FIT_SCALE[spec.fit];
  const { shell, top } = useMemo(() => {
    const prof = skirtProfile(body, spec.length, fs, add);
    return { shell: smoothLathe(prof, 56), top: prof[prof.length - 1]! };
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
      <Waistband body={body} r={top[0]} y={top[1]} material={trim} />
    </group>
  );
}
