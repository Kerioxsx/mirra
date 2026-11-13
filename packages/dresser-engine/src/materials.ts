import { Color, DoubleSide, MeshPhysicalMaterial } from "three";
import type { MaterialKind } from "@mirra/garment-system";

interface FabricPreset {
  roughness: number;
  metalness: number;
  sheen?: number;
  clearcoat?: number;
}

export const FABRICS: Record<MaterialKind, FabricPreset> = {
  cotton: { roughness: 0.92, metalness: 0, sheen: 0.25 },
  fleece: { roughness: 0.98, metalness: 0, sheen: 0.6 },
  knit: { roughness: 0.95, metalness: 0, sheen: 0.5 },
  denim: { roughness: 0.86, metalness: 0, sheen: 0.15 },
  canvas: { roughness: 0.9, metalness: 0 },
  wool: { roughness: 0.96, metalness: 0, sheen: 0.4 },
  nylon: { roughness: 0.45, metalness: 0, clearcoat: 0.25 },
  leather: { roughness: 0.42, metalness: 0, clearcoat: 0.35 },
  metal: { roughness: 0.3, metalness: 0.65, clearcoat: 0.4 },
  acetate: { roughness: 0.2, metalness: 0, clearcoat: 0.8 },
};

const cache = new Map<string, MeshPhysicalMaterial>();

/** Shared, cached physical materials keyed by fabric + colour (+ highlight state). */
export function fabric(kind: MaterialKind, hex: string, highlighted = false): MeshPhysicalMaterial {
  const key = `${kind}|${hex}|${highlighted ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    const p = FABRICS[kind];
    m = new MeshPhysicalMaterial({
      color: new Color(hex),
      roughness: p.roughness,
      metalness: p.metalness,
      sheen: p.sheen ?? 0,
      sheenRoughness: 0.8,
      sheenColor: new Color("#ffffff"),
      clearcoat: p.clearcoat ?? 0,
      side: DoubleSide,
      // brighten the garment's own colour when selected; a coloured glow would swamp dark fabrics
      emissive: new Color(highlighted ? hex : "#000000").lerp(
        new Color("#ffffff"),
        highlighted ? 0.35 : 0,
      ),
      emissiveIntensity: highlighted ? 0.22 : 0,
    });
    cache.set(key, m);
  }
  return m;
}

export function skin(hex: string): MeshPhysicalMaterial {
  const key = `skin|${hex}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: new Color(hex),
      roughness: 0.62,
      clearcoat: 0.08,
      sheen: 0.2,
    });
    cache.set(key, m);
  }
  return m;
}

/** A slightly darker/lighter shade for trims (cuffs, soles, zips). */
export function shade(hex: string, amount: number): string {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}
