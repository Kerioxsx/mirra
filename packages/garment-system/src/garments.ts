import { categorySpec, type Category } from "@mirra/shared-types";
import { BASIC_PALETTE, DEFAULT_GARMENT_HEX, resolveColor } from "./colors";
import { CATEGORY_TEMPLATES } from "./templates";
import type { Fidelity, Fit, GarmentDefinition, ParametricSpec } from "./types";

export const FIDELITY_LABELS: Record<Fidelity, { label: string; description: string }> = {
  exact: { label: "Exact model", description: "A 3D model made from this specific product." },
  approximate: {
    label: "Approximate preview",
    description: "A stand-in garment of the same type, colour and fit. Details will differ.",
  },
  generic: {
    label: "Generic",
    description: "A basic garment of this category, not a real product.",
  },
};

/** A plain garment of a category, for building outfits from scratch. */
export function genericGarment(category: Category, colorHex?: string): GarmentDefinition {
  const spec = categorySpec(category);
  const tpl = CATEGORY_TEMPLATES[category];
  const hex = colorHex ?? DEFAULT_GARMENT_HEX;
  return {
    id: `generic.${category}`,
    name: spec.label.replace(/s$/, ""),
    category,
    bodyRegion: spec.bodyRegion,
    layer: spec.defaultLayer,
    fidelity: "generic",
    parametric: tpl.spec,
    material: tpl.material,
    colorVariants: [
      { id: "base", label: "Base", hex },
      ...BASIC_PALETTE.filter((c) => c.hex !== hex),
    ],
  };
}

export interface ProductLike {
  id: string;
  title: string;
  category: Category;
  colors?: string[] | null;
  attributes?: { fit?: string | null } | null;
}

const FIT_WORDS: [RegExp, Fit][] = [
  [/\b(oversized?|boxy|baggy|wide[- ]leg|loose)\b/i, "oversized"],
  [/\b(relaxed|roomy)\b/i, "relaxed"],
  [/\b(slim|skinny|fitted|tight)\b/i, "slim"],
];

/** Infer fit from structured attributes first, then from title keywords. */
export function inferFit(product: ProductLike): Fit | null {
  const declared = product.attributes?.fit?.toLowerCase();
  if (declared && ["slim", "regular", "relaxed", "oversized"].includes(declared))
    return declared as Fit;
  for (const [re, fit] of FIT_WORDS) if (re.test(product.title)) return fit;
  return null;
}

function withFit(spec: ParametricSpec, fit: Fit | null, title: string): ParametricSpec {
  if (!fit || !("fit" in spec)) return spec;
  const next = { ...spec, fit };
  if (next.template === "bottom" && fit === "oversized" && next.shape === "straight")
    next.shape = "wide";
  if (next.template === "top" && /\bcrop(ped)?\b/i.test(title)) next.length = "crop";
  return next;
}

/**
 * A labelled stand-in for a product that has no curated 3D model: the right category, tinted
 * with the product's dominant colour and shaped by its fit. Never presented as exact.
 */
export function approximateGarment(product: ProductLike): GarmentDefinition {
  const base = genericGarment(product.category);
  const hex =
    resolveColor(product.colors?.[0]) ?? resolveColor(product.title) ?? DEFAULT_GARMENT_HEX;
  return {
    ...base,
    id: `approx.${product.id}`,
    name: product.title,
    fidelity: "approximate",
    parametric: withFit(base.parametric!, inferFit(product), product.title),
    colorVariants: [{ id: "product", label: "Product colour", hex }, ...BASIC_PALETTE],
    productId: product.id,
  };
}
