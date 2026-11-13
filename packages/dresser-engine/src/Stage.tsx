"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
import { CAMERA_PRESETS, type CameraPreset } from "./camera";
import { ParametricGarment } from "./garments";
import { Mannequin } from "./Mannequin";
import { QUALITY, type Quality } from "./quality";

export interface DresserStageProps {
  outfit: Outfit;
  body?: BodyParams;
  appearance?: Appearance;
  quality?: Quality;
  camera?: CameraPreset;
  turntable?: boolean;
  selected?: SlotKey | null;
  onSelect?: (slot: SlotKey | null) => void;
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

/** The 3D dressing room: studio, mannequin, layered garments and camera rig. */
export function DresserStage({
  outfit,
  body = DEFAULT_BODY,
  appearance = DEFAULT_APPEARANCE,
  quality = "medium",
  camera = "full",
  turntable = false,
  selected = null,
  onSelect,
  children,
  className,
}: DresserStageProps) {
  const q = QUALITY[quality];
  const model = useMemo(() => computeBody(body), [body]);
  const items = layered(outfit);
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
        <group>
          <Mannequin body={model} appearance={appearance} />
          {items.map(([slot, item]) => (
            <group
              key={`${slot}:${item.garment.id}`}
              name={slot}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(slot);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
              }}
            >
              <ParametricGarment
                garment={item.garment}
                hex={item.colorHex}
                body={model}
                highlighted={slot === selected}
              />
            </group>
          ))}
        </group>
        <CameraRig preset={camera} height={model.H} turntable={turntable} />
      </Canvas>
      {children}
    </div>
  );
}
