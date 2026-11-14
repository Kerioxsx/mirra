import { emptyOutfit, equip, type Outfit } from "@mirra/outfit-engine";
import { isCategory, type OutfitIn, type OutfitOut } from "@mirra/shared-types";
import { genericItem, productItem } from "@/features/dresser/state";
import { isUuid, marketplaceName } from "@/features/discover/format";

/** Dresser state → API payload. Products need Mirra's listing id; older try-ons without one are skipped. */
export function toOutfitIn(outfit: Outfit, name: string): { body: OutfitIn; skipped: string[] } {
  const items: OutfitIn["items"] = [];
  const skipped: string[] = [];
  for (const item of Object.values(outfit.items)) {
    const base = { category: item.garment.category, color_hex: item.colorHex };
    if (item.source.kind === "generic") items.push(base);
    else if (item.source.kind === "product" && isUuid(item.source.listingId))
      items.push({ ...base, listing_id: item.source.listingId });
    else skipped.push(item.garment.name);
  }
  return { body: { name, items }, skipped };
}

/** API outfit → dresser state, rebuilding approximate garments for real products. */
export function fromOutfitOut(o: OutfitOut): Outfit {
  return o.items.reduce((acc, it) => {
    if (!isCategory(it.category)) return acc;
    const l = it.listing;
    const item = l
      ? productItem(
          {
            productId: `${l.marketplace_id}:${l.external_id}`,
            title: l.title,
            category: it.category,
            colors: l.colors ?? [],
            marketplace: marketplaceName(l.marketplace_id),
            listingId: l.id,
            url: l.url,
            price: l.price
              ? { amount: Number(l.price.amount).toFixed(2), currency: l.price.currency }
              : null,
          },
          it.color_hex,
        )
      : genericItem(it.category, it.color_hex);
    return equip(acc, item).outfit;
  }, emptyOutfit);
}
