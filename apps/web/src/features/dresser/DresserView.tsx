"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { Pause, Play, Redo2, RotateCcw, Undo2 } from "lucide-react";
import {
  CAMERA_PRESETS,
  POSE_LABELS,
  type CameraPreset,
  type PoseId,
  type Quality,
} from "@mirra/dresser-engine";
import { Badge, cn, IconButton, Segmented, Spinner } from "@mirra/ui";
import { AvatarPanel } from "./AvatarPanel";
import { ClothesPanel } from "./ClothesPanel";
import { outfitStore, startPersistence, starterOutfit, useView } from "./state";
import { WearingPanel } from "./WearingPanel";

// WebGL only exists in the browser; never render the canvas during static export.
const DresserStage = dynamic(() => import("@mirra/dresser-engine").then((m) => m.DresserStage), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full items-center justify-center gap-3 bg-stage text-white/60"
      role="status"
    >
      <Spinner className="size-5" /> Setting up the studio…
    </div>
  ),
});

type LeftTab = "clothes" | "avatar";
type MobileTab = "clothes" | "wearing" | "avatar";

function Toolbar() {
  const { camera, setCamera, turntable, toggleTurntable, quality, setQuality, pose, setPose } =
    useView();
  const canUndo = useStore(outfitStore, (s) => s.history.past.length > 0);
  const canRedo = useStore(outfitStore, (s) => s.history.future.length > 0);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <Segmented<CameraPreset>
          tone="stage"
          label="Camera"
          value={camera}
          onChange={setCamera}
          options={(["full", "upper", "lower", "feet"] as const).map((p) => ({
            value: p,
            label: CAMERA_PRESETS[p].label,
          }))}
        />
      </div>
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/30 p-1 backdrop-blur">
        <IconButton
          tone="stage"
          label="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => outfitStore.getState().undo()}
        >
          <Undo2 className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton
          tone="stage"
          label="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => outfitStore.getState().redo()}
        >
          <Redo2 className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton
          tone="stage"
          label={turntable ? "Stop turntable" : "Turntable"}
          active={turntable}
          onClick={toggleTurntable}
        >
          {turntable ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
        </IconButton>
        <IconButton
          tone="stage"
          label="Reset to starter look"
          onClick={() => outfitStore.getState().load(starterOutfit())}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </IconButton>
        <label className="sr-only" htmlFor="pose">
          Pose
        </label>
        <select
          id="pose"
          value={pose}
          onChange={(e) => setPose(e.target.value as PoseId)}
          className="h-9 rounded-full bg-white/8 px-3 text-[12px] font-medium text-white/85 outline-none focus-visible:ring-2 focus-visible:ring-volt"
        >
          {(Object.keys(POSE_LABELS) as PoseId[]).map((p) => (
            <option key={p} value={p}>
              {POSE_LABELS[p]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="quality">
          Render quality
        </label>
        <select
          id="quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value as Quality)}
          className="h-9 rounded-full bg-white/8 px-3 text-[12px] font-medium text-white/85 outline-none focus-visible:ring-2 focus-visible:ring-volt"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
    </div>
  );
}

function Notice() {
  const notice = useStore(outfitStore, (s) => s.notice);
  if (!notice) return null;
  return (
    <p
      role="status"
      className="pointer-events-none absolute bottom-16 left-1/2 max-w-[90%] -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-center text-[12.5px] text-white backdrop-blur"
    >
      {notice}
    </p>
  );
}

function Stage() {
  const outfit = useStore(outfitStore, (s) => s.history.present);
  const selected = useStore(outfitStore, (s) => s.selected);
  const { body, appearance, quality, camera, turntable, pose } = useView();
  return (
    <DresserStage
      outfit={outfit}
      body={body}
      appearance={appearance}
      quality={quality}
      camera={camera}
      turntable={turntable}
      pose={pose}
      selected={selected}
      onSelect={(slot) => outfitStore.getState().select(slot)}
      className="bg-stage"
    >
      <Toolbar />
      <Notice />
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5 sm:bottom-4 sm:left-4">
        <Badge tone="stage">Drag to rotate · scroll to zoom</Badge>
      </div>
    </DresserStage>
  );
}

function PanelTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (t: T) => void;
  tabs: { id: T; label: string }[];
}) {
  return (
    <div role="tablist" className="flex gap-5 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px border-b-2 pb-2.5 text-[14px] font-medium transition-colors",
            value === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const s = outfitStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selected) {
        s.unequip(s.selected);
      } else if (e.key === "Escape") {
        s.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function DresserView() {
  const hydrate = useView((s) => s.hydrate);
  const [left, setLeft] = useState<LeftTab>("clothes");
  const [mobile, setMobile] = useState<MobileTab>("clothes");
  useEffect(() => {
    hydrate();
    return startPersistence();
  }, [hydrate]);
  useShortcuts();

  return (
    <div className="flex flex-col lg:h-dvh lg:flex-row">
      <h1 className="sr-only">3D Dresser</h1>
      {/* Left panel (desktop) */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-paper p-5 lg:flex">
        <PanelTabs
          value={left}
          onChange={setLeft}
          tabs={[
            { id: "clothes", label: "Clothes" },
            { id: "avatar", label: "Avatar" },
          ]}
        />
        {left === "clothes" ? <ClothesPanel /> : <AvatarPanel />}
      </aside>

      {/* Stage */}
      <section
        aria-label="3D stage"
        className="relative h-[58dvh] min-h-[360px] flex-1 overflow-hidden bg-stage lg:h-auto"
      >
        <Stage />
      </section>

      {/* Right panel (desktop) */}
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-line bg-paper p-5 lg:block">
        <WearingPanel />
      </aside>

      {/* Mobile / tablet panels */}
      <div className="flex flex-col gap-5 p-4 sm:p-6 lg:hidden">
        <PanelTabs
          value={mobile}
          onChange={setMobile}
          tabs={[
            { id: "clothes", label: "Clothes" },
            { id: "wearing", label: "Wearing" },
            { id: "avatar", label: "Avatar" },
          ]}
        />
        {mobile === "clothes" ? (
          <ClothesPanel />
        ) : mobile === "wearing" ? (
          <WearingPanel />
        ) : (
          <AvatarPanel />
        )}
      </div>
    </div>
  );
}
