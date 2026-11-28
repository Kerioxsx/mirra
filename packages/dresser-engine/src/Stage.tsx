"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import type { CameraControls as CameraControlsImpl } from "@react-three/drei";
import { layered, type Outfit } from "@mirra/outfit-engine";
import type { SlotKey } from "@mirra/garment-system";
import {
  computeBody,
  DEFAULT_APPEARANCE,
  DEFAULT_BODY,
  type Appearance,
  type BodyParams,
} from "./body";
import { fitBody } from "./avatar/fit";
import { useAvatarAsset } from "./avatar/load";
import { morphAvatar } from "./avatar/morph";
import { CAMERA_PRESETS, type CameraPreset } from "./camera";
import { QUALITY, type Quality } from "./quality";
import type { PoseId } from "./rig/poses";
import { RiggedAvatar } from "./RiggedAvatar";

export interface DresserStageProps {
  outfit: Outfit;
  body?: BodyParams;
  appearance?: Appearance;
  quality?: Quality;
  camera?: CameraPreset;
  turntable?: boolean;
  /** The avatar's pose (mirra-rig@1). */
  pose?: PoseId;
  /** A slow breath and sway; off under reduced motion either way. */
  idle?: boolean;
  selected?: SlotKey | null;
  onSelect?: (slot: SlotKey | null) => void;
  /** Where the avatar files (female.glb, male.glb) are served from. */
  avatarBase?: string;
  /** Rendered on top of the canvas (toolbars, badges). */
  children?: ReactNode;
  className?: string;
}

function CameraRig({
  preset,
  height,
  turntable,
}: {
  preset: CameraPreset;
  height: number;
  turntable: boolean;
}) {
  const ref = useRef<CameraControlsImpl>(null);
  useEffect(() => {
    const c = CAMERA_PRESETS[preset];
    const [x, y, z] = c.pos;
    void ref.current?.setLookAt(x * height, y * height, z * height, 0, c.target * height, 0, true);
  }, [preset, height]);
  useFrame((_, delta) => {
    if (turntable && ref.current) void ref.current.rotate(delta * 0.35, 0, false);
  });
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={0.45}
      maxDistance={6}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI * 0.56}
      smoothTime={0.35}
      dollyToCursor
    />
  );
}

function Studio({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  return (
    <>
      <color attach="background" args={["#0c0c0e"]} />
      <fog attach="fog" args={["#0c0c0e", 6, 14]} />
      <hemisphereLight args={["#f3efe6", "#1a1a1e", 0.55]} />
      <directionalLight
        position={[2.2, 4.2, 3.2]}
        intensity={2.1}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-0.5}
      />
      <directionalLight position={[-3, 2.4, -2.5]} intensity={1.1} color="#dfe9ff" />
      <spotLight
        position={[0, 4.5, 0.6]}
        angle={0.42}
        penumbra={0.9}
        intensity={18}
        color="#fff6e8"
      />
      {/* Local light-formers give the fabrics soft reflections without fetching an HDR file. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 4, 2]} scale={[6, 1.2, 1]} />
        <Lightformer
          form="rect"
          intensity={0.8}
          position={[-4, 1.5, 0]}
          rotation-y={Math.PI / 2}
          scale={[4, 2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.5}
          position={[4, 1.5, -1]}
          rotation-y={-Math.PI / 2}
          scale={[4, 2, 1]}
          color="#f1ffd0"
        />
      </Environment>
    </>
  );
}

function Floor({ contactShadows }: { contactShadows: boolean }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.001, 0]}>
        <circleGeometry args={[2.4, 64]} />
        <meshStandardMaterial color="#141417" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <ringGeometry args={[0.62, 0.635, 96]} />
        <meshBasicMaterial color="#d6ff3d" transparent opacity={0.35} />
      </mesh>
      {contactShadows ? (
        <ContactShadows
          position={[0, 0.002, 0]}
          scale={3}
          blur={2.4}
          far={1.6}
          opacity={0.75}
          resolution={512}
        />
      ) : null}
    </group>
  );
}

/**
 * Body shapes settle before the avatar is rebuilt: a quick low-detail build shortly after the last
 * change, then the chosen quality once the sliders have been still for a moment.
 */
function useSettledBody(body: BodyParams, quality: Quality) {
  const [settled, setSettled] = useState<{ body: BodyParams; quality: Quality }>(() => ({
    body,
    quality: "low",
  }));
  useEffect(() => {
    if (settled.body === body && settled.quality === quality) return;
    const quick =
      settled.body === body ? null : setTimeout(() => setSettled({ body, quality: "low" }), 120);
    const full = setTimeout(() => setSettled({ body, quality }), settled.body === body ? 30 : 900);
    return () => {
      if (quick) clearTimeout(quick);
      clearTimeout(full);
    };
  }, [body, quality, settled]);
  return settled;
}

/** The 3D dressing room: studio, rigged avatar, layered garments and camera rig. */
export function DresserStage({
  outfit,
  body = DEFAULT_BODY,
  appearance = DEFAULT_APPEARANCE,
  quality = "medium",
  camera = "full",
  turntable = false,
  pose = "relaxed",
  idle = true,
  selected = null,
  onSelect,
  avatarBase = "/avatars/",
  children,
  className,
}: DresserStageProps) {
  const q = QUALITY[quality];
  const settled = useSettledBody(body, quality);
  const file = useAvatarAsset(`${avatarBase}${appearance.bodyType ?? "female"}.glb`);
  const asset = file.status === "ready" ? file.asset : null;
  const avatar = useMemo(
    () => (asset ? morphAvatar(asset, settled.body) : undefined),
    [asset, settled.body],
  );
  const model = useMemo(
    () => (avatar ? fitBody(avatar) : computeBody(settled.body)),
    [avatar, settled.body],
  );
  const items = useMemo(
    () =>
      layered(outfit).map(([slot, item]) => ({ slot, garment: item.garment, hex: item.colorHex })),
    [outfit],
  );
  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows={q.shadows ? "percentage" : false}
        dpr={q.dpr}
        gl={{ antialias: q.antialias, preserveDrawingBuffer: true }}
        camera={{ position: [1, 1.2, 3.6], fov: 30, near: 0.05, far: 40 }}
        onPointerMissed={() => onSelect?.(null)}
        aria-label="3D dresser: drag to rotate, scroll or pinch to zoom"
        role="img"
        data-testid="dresser-canvas"
      >
        <Studio shadows={q.shadows} mapSize={q.shadowMapSize} />
        <Floor contactShadows={q.contactShadows} />
        {avatar ? (
          <RiggedAvatar
            params={settled.body}
            model={model}
            avatar={avatar}
            appearance={appearance}
            items={items}
            quality={settled.quality}
            pose={pose}
            idle={idle}
            selected={selected}
            onSelect={onSelect}
          />
        ) : null}
        <CameraRig preset={camera} height={model.H} turntable={turntable} />
      </Canvas>
      {file.status !== "ready" ? (
        <div
          role="status"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            color: "#a9a9b0",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          {file.status === "loading" ? "Loading the avatar…" : "Couldn't load the avatar."}
        </div>
      ) : null}
      {children}
    </div>
  );
}
