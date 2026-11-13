import {
  compareLayers,
  conflictReason,
  slotKey,
  type GarmentDefinition,
  type SlotKey,
} from "@mirra/garment-system";

/** A decimal amount as a string ("129.99"), matching how the API serializes money. */
export interface Price {
  amount: string;
  currency: string;
}

export type ItemSource =
  | { kind: "generic" }
  | { kind: "product"; productId: string; listingId?: string; marketplace?: string; url?: string }
  | { kind: "wardrobe"; wardrobeItemId: string };

export interface OutfitItem {
  garment: GarmentDefinition;
  colorHex: string;
  source: ItemSource;
  /** null = price unknown. Never 0 unless the item is actually free. */
  price: Price | null;
}

export interface Outfit {
  items: Readonly<Record<SlotKey, OutfitItem>>;
}

export const emptyOutfit: Outfit = { items: {} };

export function itemFor(
  garment: GarmentDefinition,
  opts: { colorHex?: string; source?: ItemSource; price?: Price | null } = {},
): OutfitItem {
  return {
    garment,
    colorHex: opts.colorHex ?? garment.colorVariants[0]?.hex ?? "#8a8d91",
    source: opts.source ?? { kind: "generic" },
    price: opts.price ?? null,
  };
}

export interface EquipResult {
  outfit: Outfit;
  removed: { item: OutfitItem; reason: string }[];
}

/** Put an item on, taking off whatever it conflicts with (same slot, or a dress over jeans…). */
export function equip(outfit: Outfit, item: OutfitItem): EquipResult {
  const items: Record<SlotKey, OutfitItem> = {};
  const removed: EquipResult["removed"] = [];
  for (const [key, existing] of Object.entries(outfit.items) as [SlotKey, OutfitItem][]) {
    const reason = conflictReason(item.garment, existing.garment);
    if (reason) removed.push({ item: existing, reason });
    else items[key] = existing;
  }
  items[slotKey(item.garment)] = item;
  return { outfit: { items }, removed };
}

export function unequip(outfit: Outfit, slot: SlotKey): Outfit {
  if (!(slot in outfit.items)) return outfit;
  const items = { ...outfit.items };
  delete items[slot];
  return { items };
}

export function recolor(outfit: Outfit, slot: SlotKey, colorHex: string): Outfit {
  const item = outfit.items[slot];
  if (!item || item.colorHex === colorHex) return outfit;
  return { items: { ...outfit.items, [slot]: { ...item, colorHex } } };
}

/** Items in render order (inner layers first). */
export function layered(outfit: Outfit): [SlotKey, OutfitItem][] {
  return (Object.entries(outfit.items) as [SlotKey, OutfitItem][]).sort(([, a], [, b]) =>
    compareLayers(a.garment, b.garment),
  );
}

export interface PriceSummary {
  /** Sum of known prices per currency (no conversion is ever guessed). */
  totals: Record<string, string>;
  pricedCount: number;
  unknownCount: number;
  /** True only when every item that represents a real product has a known price. */
  complete: boolean;
}

const toCents = (amount: string): bigint => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Invalid amount: ${amount}`);
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? "0").padEnd(2, "0"));
};
const fromCents = (c: bigint): string => `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;

export function priceSummary(outfit: Outfit): PriceSummary {
  const cents: Record<string, bigint> = {};
  let pricedCount = 0;
  let unknownCount = 0;
  for (const item of Object.values(outfit.items)) {
    if (item.source.kind !== "product") continue; // generic & owned items cost nothing to add
    if (!item.price) {
      unknownCount++;
      continue;
    }
    pricedCount++;
    cents[item.price.currency] = (cents[item.price.currency] ?? 0n) + toCents(item.price.amount);
  }
  const totals = Object.fromEntries(Object.entries(cents).map(([cur, c]) => [cur, fromCents(c)]));
  return { totals, pricedCount, unknownCount, complete: unknownCount === 0 };
}
