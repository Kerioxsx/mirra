"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Group, Matrix4, Quaternion, SkinnedMesh, type Material } from "three";
import type { GarmentDefinition, SlotKey } from "@mirra/garment-system";
import { avatarMaterial } from "./avatar/load";
import type { MorphedAvatar } from "./avatar/morph";
import type { Appearance, BodyModel, BodyParams } from "./body";
import { RIGID_BONE, RigidAccessory, garmentMaterials } from "./garments";
import { skin } from "./materials";
import { avatarBuilder, FIELD_TEMPLATES, type MeshQuality } from "./rig/build";
import { applyPose, idleOffsets, poseQuaternions, POSES, type PoseId } from "./rig/poses";
import { BONE, buildRig } from "./rig/skeleton";

export interface AvatarItem {
  slot: SlotKey;
  garment: GarmentDefinition;
  hex: string;
}

function skinnedMesh(
  piece: { geometry: BufferGeometry },
  material: Material,
  rig: ReturnType<typeof buildRig>,
): SkinnedMesh {
  const mesh = new SkinnedMesh(piece.geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.bind(rig.skeleton, new Matrix4());
  return mesh;
}

function useReducedMotion() {
  const ref = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    ref.current = mq.matches;
    const on = () => (ref.current = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return ref;
}

/** A geometry sharing another's vertex data with its own triangle list (skin hidden under clothes). */
function withIndex(base: BufferGeometry, index: BufferGeometry["index"]): BufferGeometry {
  if (index === base.index) return base;
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
  g.setIndex(index);
  g.boundingSphere = base.boundingSphere;
  return g;
}

/**
 * The rigged avatar (mirra-rig@1): the downloaded body (or the procedural mannequin without one),
 * garments built around it and skinned to the same skeleton, rigid accessories riding on their
 * bones, and poses blended in over ~0.4 s.
 */
export function RiggedAvatar({
  params,
  model,
  avatar,
  appearance,
  items,
  quality,
  pose = "relaxed",
  idle = true,
  selected,
  onSelect,
}: {
  params: BodyParams;
  model: BodyModel;
  avatar?: MorphedAvatar;
  appearance: Appearance;
  items: AvatarItem[];
  quality: MeshQuality;
  pose?: PoseId;
  idle?: boolean;
  selected: SlotKey | null;
  onSelect?: (slot: SlotKey | null) => void;
}) {
  const rig = useMemo(() => buildRig(model), [model]);
  const builder = useMemo(
    () => avatarBuilder(model, params, quality, avatar),
    [model, params, quality, avatar],
  );
  const reduced = useReducedMotion();

  // geometry depends on which garments are worn (in order) and the hair, never on colours
  const geometryKey =
    items.map((i) => `${i.slot}:${i.garment.id}`).join(",") + `|${appearance.hairStyle}`;
  const built = useMemo(
    () =>
      builder.outfit(
        items.filter(
          (i) => i.garment.parametric && FIELD_TEMPLATES.has(i.garment.parametric.template),
        ),
        appearance.hairStyle,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builder, geometryKey],
  );

  const asset = avatar?.asset;
  // the material a downloaded mesh was authored with, tinted to the chosen skin or hair colour
  const meshMaterial = (name: string, hex: string): Material => {
    const def = asset?.meshes.find((m) => m.name === name);
    return asset && def ? avatarMaterial(asset, def.material, hex) : skin(hex);
  };

  const bodyMesh = useMemo(() => {
    const geometry = withIndex(
      builder.body(),
      builder.visibleIndex("body", geometryKey, built.covering),
    );
    const m = skinnedMesh({ geometry }, meshMaterial("body", appearance.skinTone), rig);
    m.name = "mannequin";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, rig, built, appearance.skinTone]);

  // eyes and eyebrows (downloaded avatar only)
  const faceMeshes = useMemo(
    () =>
      (["eyes", "eyebrows"] as const).flatMap((name) => {
        const geometry = builder.part(name);
        if (!geometry) return [];
        const mesh = skinnedMesh({ geometry }, meshMaterial(name, appearance.hairColor), rig);
        mesh.castShadow = false;
        return [mesh];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builder, rig, appearance.hairColor],
  );

  const hairMeshes = useMemo(() => {
    if (avatar) {
      const name = `hair_${appearance.hairStyle}` as const;
      const base = builder.part(name);
      if (!base) return [];
      const geometry = withIndex(base, builder.visibleIndex(name, geometryKey, built.headwear));
      return [skinnedMesh({ geometry }, meshMaterial(name, appearance.hairColor), rig)];
    }
    const hair = builder.hair(appearance.hairStyle);
    return hair ? hair.pieces.map((p) => skinnedMesh(p, skin(appearance.hairColor), rig)) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, rig, built, avatar, appearance.hairStyle, appearance.hairColor]);

  const garmentGroups = useMemo(() => {
    const out: { slot: SlotKey; group: Group }[] = [];
    for (const item of items) {
      const pieces = built.pieces.get(item.slot);
      if (!pieces) continue;
      const { material, trim } = garmentMaterials(item.garment, item.hex, item.slot === selected);
      const g = new Group();
      g.name = item.slot;
      for (const p of pieces) g.add(skinnedMesh(p, p.role === "trim" ? trim : material, rig));
      out.push({ slot: item.slot, group: g });
    }
    return out;
  }, [items, built, selected, rig]);

  const root = useMemo(() => {
    const g = new Group();
    g.name = "avatar";
    g.add(rig.root);
    return g;
  }, [rig]);

  // rigid accessories: their geometry is built in the rest pose, then carried by one bone
  const followers = useRef(new Map<Group, number>());
  const restInverse = useMemo(
    () => rig.bones.map((b) => new Matrix4().copy(b.matrixWorld).invert()),
    [rig],
  );

  const target = useMemo(() => poseQuaternions(POSES[pose]), [pose]);
  const idleQ = useMemo(() => rig.bones.map(() => new Quaternion()), [rig]);
  const goal = useMemo(() => rig.bones.map(() => new Quaternion()), [rig]);
  const first = useRef(true);
  useEffect(() => {
    first.current = true;
  }, [rig]);

  useFrame((state, delta) => {
    if (idle && !reduced.current) idleOffsets(state.clock.elapsedTime, idleQ);
    else for (const q of idleQ) q.identity();
    for (let i = 0; i < goal.length; i++) goal[i]!.copy(target[i]!).multiply(idleQ[i]!);
    const t = first.current ? 1 : 1 - Math.exp(-delta * 7);
    first.current = false;
    applyPose(rig, goal, t);
    for (const [group, bone] of followers.current) {
      group.matrix.multiplyMatrices(rig.bones[bone]!.matrixWorld, restInverse[bone]!);
    }
  });

  const select = (slot: SlotKey) => ({
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect?.(slot);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
    },
  });

  return (
    <group>
      <primitive object={root} />
      <primitive object={bodyMesh} />
      {faceMeshes.map((m, i) => (
        <primitive key={`face${i}`} object={m} />
      ))}
      {hairMeshes.map((m, i) => (
        <primitive key={`hair${i}`} object={m} />
      ))}
      {garmentGroups.map(({ slot, group }) => (
        <group key={`${slot}:${group.uuid}`} {...select(slot)}>
          <primitive object={group} />
        </group>
      ))}
      {items.map((item) => {
        const tpl = item.garment.parametric?.template;
        const boneName = tpl ? RIGID_BONE[tpl] : undefined;
        if (!boneName) return null;
        const bone = BONE[boneName];
        return (
          <group
            key={`${item.slot}:${item.garment.id}`}
            matrixAutoUpdate={false}
            ref={(g) => {
              if (g) followers.current.set(g, bone);
              return () => {
                if (g) followers.current.delete(g);
              };
            }}
            {...select(item.slot)}
          >
            <RigidAccessory
              garment={item.garment}
              hex={item.hex}
              body={model}
              highlighted={item.slot === selected}
            />
          </group>
        );
      })}
    </group>
  );
}
