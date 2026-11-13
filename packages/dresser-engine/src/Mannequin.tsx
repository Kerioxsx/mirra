import { useMemo } from "react";
import { CapsuleGeometry, SphereGeometry, Vector3 } from "three";
import { mirrorX, torsoProfile, type Appearance, type BodyModel, type Limb } from "./body";
import { segment, smoothLathe } from "./geometry";
import { skin } from "./materials";

function LimbMesh({
  limb,
  side,
  material,
}: {
  limb: Limb;
  side: 1 | -1;
  material: ReturnType<typeof skin>;
}) {
  const s = useMemo(() => {
    const a = side === 1 ? limb.a : mirrorX(limb.a);
    const b = side === 1 ? limb.b : mirrorX(limb.b);
    return segment(a, b, limb.ra, limb.rb);
  }, [limb, side]);
  return (
    <mesh
      geometry={s.geometry}
      position={s.position}
      quaternion={s.quaternion}
      material={material}
      castShadow
    />
  );
}

function Joint({
  at,
  r,
  side,
  material,
}: {
  at: Vector3;
  r: number;
  side: 1 | -1;
  material: ReturnType<typeof skin>;
}) {
  const geo = useMemo(() => new SphereGeometry(r, 20, 14), [r]);
  const p = side === 1 ? at : mirrorX(at);
  return <mesh geometry={geo} position={p} material={material} castShadow />;
}

/** A faceless, procedural fashion mannequin built from the body model. */
export function Mannequin({ body, appearance }: { body: BodyModel; appearance: Appearance }) {
  const mat = skin(appearance.skinTone);
  const { torso, head, neck, foot } = useMemo(() => {
    const torso = smoothLathe(torsoProfile(body), 56);
    const head = new SphereGeometry(body.headR, 40, 28);
    const neck = segment(
      new Vector3(0, body.y.neckBase - 0.01 * body.H, 0),
      new Vector3(0, body.y.neckTop + 0.012 * body.H, 0.004 * body.H),
      body.w.neck * 1.15,
      body.w.neck,
    );
    const footR = body.foot.height / 2;
    const foot = new CapsuleGeometry(footR, body.foot.length - footR * 2, 8, 16);
    foot.rotateX(Math.PI / 2);
    return { torso, head, neck, foot };
  }, [body]);

  return (
    <group name="mannequin">
      <mesh geometry={torso} material={mat} scale={[1, 1, body.depth]} castShadow receiveShadow />
      <mesh
        geometry={neck.geometry}
        position={neck.position}
        quaternion={neck.quaternion}
        material={mat}
        castShadow
      />
      <mesh
        geometry={head}
        material={mat}
        position={[0, body.y.head, 0.004 * body.H]}
        scale={[0.84, 1.02, 0.94]}
        castShadow
      />
      {([1, -1] as const).map((side) => (
        <group key={side}>
          <Joint at={body.upperArm.a} r={body.upperArm.ra * 1.02} side={side} material={mat} />
          <LimbMesh limb={body.upperArm} side={side} material={mat} />
          <Joint at={body.forearm.a} r={body.forearm.ra} side={side} material={mat} />
          <LimbMesh limb={body.forearm} side={side} material={mat} />
          <Joint at={body.hand.center} r={body.hand.r} side={side} material={mat} />
          <Joint at={body.thigh.a} r={body.thigh.ra * 0.98} side={side} material={mat} />
          <LimbMesh limb={body.thigh} side={side} material={mat} />
          <Joint at={body.shin.a} r={body.shin.ra} side={side} material={mat} />
          <LimbMesh limb={body.shin} side={side} material={mat} />
          <mesh
            geometry={foot}
            material={mat}
            position={side === 1 ? body.foot.center : mirrorX(body.foot.center)}
            scale={[body.foot.width / body.foot.height, 1, 1]}
            castShadow
          />
        </group>
      ))}
      <Hair body={body} appearance={appearance} />
    </group>
  );
}

function Hair({ body, appearance }: { body: BodyModel; appearance: Appearance }) {
  const geo = useMemo(() => {
    const r = body.headR * 1.045;
    return {
      cap: new SphereGeometry(r, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.52),
      bun: new SphereGeometry(body.headR * 0.42, 20, 14),
      long: new SphereGeometry(
        r * 1.02,
        32,
        20,
        Math.PI * 0.62,
        Math.PI * 1.76,
        Math.PI * 0.3,
        Math.PI * 0.55,
      ),
    };
  }, [body]);
  if (appearance.hairStyle === "none") return null;
  const mat = skin(appearance.hairColor);
  const at: [number, number, number] = [0, body.y.head + body.headR * 0.08, -0.003 * body.H];
  return (
    <group position={at} scale={[0.86, 1, 0.97]}>
      <mesh geometry={geo.cap} material={mat} rotation={[-0.18, 0, 0]} castShadow />
      {appearance.hairStyle === "bun" ? (
        <mesh
          geometry={geo.bun}
          material={mat}
          position={[0, body.headR * 0.78, -body.headR * 0.62]}
          castShadow
        />
      ) : null}
      {appearance.hairStyle === "long" ? (
        <mesh
          geometry={geo.long}
          material={mat}
          position={[0, -body.headR * 0.55, -0.002]}
          scale={[1, 1.7, 1]}
          castShadow
        />
      ) : null}
    </group>
  );
}
