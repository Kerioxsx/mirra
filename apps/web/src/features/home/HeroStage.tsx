"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { DEFAULT_APPEARANCE, DEFAULT_BODY } from "@mirra/dresser-engine";
import { starterOutfit } from "@/features/dresser/state";

const DresserStage = dynamic(() => import("@mirra/dresser-engine").then((m) => m.DresserStage), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-stage" />,
});

/** A slowly turning preview of the starter look. */
export function HeroStage() {
  const outfit = useMemo(() => starterOutfit(), []);
  return (
    <DresserStage
      outfit={outfit}
      body={DEFAULT_BODY}
      appearance={DEFAULT_APPEARANCE}
      quality="medium"
      camera="full"
      turntable
    />
  );
}
