import type { ColorVariant } from "./types";

/** Named fashion colours → display hex. Used to tint approximate previews. */
export const NAMED_COLORS: Record<string, string> = {
  black: "#141414",
  charcoal: "#33363b",
  grey: "#8a8d91",
  gray: "#8a8d91",
  silver: "#c0c3c7",
  white: "#f2f1ec",
  cream: "#efe6d2",
  ivory: "#f3eedf",
  beige: "#d8c7a6",
  tan: "#c19a6b",
  khaki: "#b9a77c",
  camel: "#b98a4f",
  brown: "#6b4a33",
  chocolate: "#4a3022",
  olive: "#5f6340",
  green: "#3f6b47",
  sage: "#9aab8f",
  forest: "#2f4a35",
  navy: "#1f2a44",
  blue: "#2f5ea8",
  denim: "#4a6386",
  "light blue": "#9ab7d8",
  teal: "#2c7a7b",
  red: "#b3261e",
  burgundy: "#6d1f2c",
  maroon: "#5c1a24",
  pink: "#e6a4b4",
  purple: "#5d3f8c",
  lavender: "#b9a9d9",
  yellow: "#e8c547",
  mustard: "#c99a2e",
  orange: "#e0672c",
  gold: "#c9a54a",
};

export const DEFAULT_GARMENT_HEX = "#8a8d91";

/** Resolve a colour name ("Light Blue", "washed black") or hex to a hex value, if recognisable. */
export function resolveColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  // longest matching colour word inside a phrase ("washed black denim" → black)
  const hit = Object.keys(NAMED_COLORS)
    .filter((name) => new RegExp(`\\b${name}\\b`).test(v))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? NAMED_COLORS[hit]! : null;
}

export const BASIC_PALETTE: ColorVariant[] = [
  "black",
  "white",
  "grey",
  "navy",
  "olive",
  "brown",
  "cream",
  "burgundy",
  "denim",
].map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), hex: NAMED_COLORS[id]! }));
