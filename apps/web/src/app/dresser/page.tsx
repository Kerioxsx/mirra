import type { Metadata } from "next";
import { DresserView } from "@/features/dresser/DresserView";

export const metadata: Metadata = { title: "3D Dresser" };

export default function DresserPage() {
  return <DresserView />;
}
