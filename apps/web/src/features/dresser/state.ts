"use client";
import { create } from "zustand";
import { approximateGarment, genericGarment, resolveColor } from "@mirra/garment-system";
import {
  createOutfitStore,
  emptyOutfit,
  equip,
  itemFor,
  type Outfit,
  type OutfitItem,
  type Price,
} from "@mirra/outfit-engine";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_BODY,
  type Appearance,
  type BodyParams,
  type CameraPreset,
  type PoseId,
  type Quality,
} from "@mirra/dresser-engine";
import { isCategory, type Category } from "@mirra/shared-types";

/** Pleasant default colours so a freshly equipped generic garment looks intentional. */
export const CATEGORY_COLORS: Partial<Record<Category, string>> = {
  t_shirt: "cream",
  tank_top: "white",
  long_sleeve: "charcoal",
  shirt: "light blue",
  sweater: "olive",
  hoodie: "grey",
  sweatshirt: "navy",
  vest: "black",
  zip_up: "charcoal",
  jacket: "olive",
  coat: "camel",
  dress: "black",
  jumpsuit: "khaki",
  jeans: "denim",
  baggy_pants: "denim",
  cargo_pants: "khaki",
  trousers: "charcoal",
  sweatpants: "grey",
  shorts: "beige",
  skirt: "black",
  sneakers: "white",
  boots: "brown",
  shoes: "black",
  sandals: "tan",
  hat: "black",
  cap: "navy",
  beanie: "black",
  glasses: "black",
  jewelry: "silver",
  scarf: "burgundy",
  belt: "black",
  watch: "silver",
  bag: "black",
  accessory: "black",
};

export function genericItem(category: Category, hex?: string) {
  const color = hex ?? resolveColor(CATEGORY_COLORS[category]) ?? undefined;
  return itemFor(genericGarment(category, color), { colorHex: color });
}

const STARTER: Category[] = ["t_shirt", "zip_up", "baggy_pants", "sneakers", "beanie"];

export function starterOutfit(): Outfit {
  return STARTER.reduce((o, c) => equip(o, genericItem(c)).outfit, emptyOutfit);
}

// ---- local persistence (this device only; account-synced outfits arrive with the outfits API) ----

const KEY = "mirra.dresser.v1";

/** A real product tried on from search: enough to rebuild its approximate garment and link. */
export interface ProductRef {
  productId: string;
  title: string;
  category: Category;
  colors: string[];
  marketplace: string;
  listingId: string;
  url: string;
  price: Price | null;
}

export function productItem(p: ProductRef, colorHex?: string): OutfitItem {
  const garment = approximateGarment({
    id: p.productId,
    title: p.title,
    category: p.category,
    colors: p.colors,
  });
  return itemFor(garment, {
    colorHex: colorHex ?? garment.colorVariants[0]?.hex,
    source: {
      kind: "product",
      productId: p.productId,
      listingId: p.listingId,
      marketplace: p.marketplace,
      url: p.url,
    },
    price: p.price,
  });
}

interface PersistedItem {
  category: string;
  colorHex: string;
  product?: ProductRef;
}

interface Persisted {
  items: PersistedItem[];
  body: BodyParams;
  appearance: Appearance;
  quality: Quality;
  pose?: PoseId;
}

function readPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function outfitFrom(p: Persisted | null): Outfit {
  if (!p) return starterOutfit();
  return p.items
    .filter((i) => isCategory(i.category) && /^#[0-9a-f]{6}$/i.test(i.colorHex))
    .reduce((o, i) => {
      const item =
        i.product && isCategory(i.product.category)
          ? productItem(i.product, i.colorHex)
          : genericItem(i.category as Category, i.colorHex);
      return equip(o, item).outfit;
    }, emptyOutfit);
}

export const outfitStore = createOutfitStore(emptyOutfit);

interface ViewState {
  body: BodyParams;
  appearance: Appearance;
  quality: Quality;
  pose: PoseId;
  camera: CameraPreset;
  turntable: boolean;
  hydrated: boolean;
  setBody: (b: Partial<BodyParams>) => void;
  setBodyPreset: (b: BodyParams) => void;
  setAppearance: (a: Partial<Appearance>) => void;
  setQuality: (q: Quality) => void;
  setPose: (p: PoseId) => void;
  setCamera: (c: CameraPreset) => void;
  toggleTurntable: () => void;
  hydrate: () => void;
}

export const useView = create<ViewState>()((set, get) => ({
  body: DEFAULT_BODY,
  appearance: DEFAULT_APPEARANCE,
  quality: "medium",
  pose: "relaxed",
  camera: "full",
  turntable: false,
  hydrated: false,
  setBody: (b) => set({ body: { ...get().body, ...b } }),
  setBodyPreset: (b) => set({ body: b }),
  setAppearance: (a) => set({ appearance: { ...get().appearance, ...a } }),
  setQuality: (quality) => set({ quality }),
  setPose: (pose) => set({ pose }),
  setCamera: (camera) => set({ camera }),
  toggleTurntable: () => set({ turntable: !get().turntable }),
  hydrate: () => {
    if (get().hydrated) return;
    const p = readPersisted();
    outfitStore.getState().load(outfitFrom(p));
    // the initial load shouldn't be undoable back to an empty mannequin
    outfitStore.setState((s) => ({
      history: { past: [], present: s.history.present, future: [] },
    }));
    set({
      hydrated: true,
      ...(p
        ? {
            body: { ...DEFAULT_BODY, ...p.body },
            appearance: { ...DEFAULT_APPEARANCE, ...p.appearance },
            quality: p.quality,
            pose: p.pose ?? "relaxed",
          }
        : {}),
    });
  },
}));

/** Save the current look + avatar to this device now. */
export function persistNow(): void {
  const v = useView.getState();
  if (!v.hydrated) return;
  const items: PersistedItem[] = Object.values(
    outfitStore.getState().history.present.items,
  ).flatMap((i): PersistedItem[] => {
    if (i.source.kind === "generic")
      return [{ category: i.garment.category, colorHex: i.colorHex }];
    if (i.source.kind === "product" && i.source.url && i.source.marketplace) {
      const product: ProductRef = {
        productId: i.source.productId,
        title: i.garment.name,
        category: i.garment.category,
        colors: [],
        marketplace: i.source.marketplace,
        listingId: i.source.listingId ?? i.source.productId,
        url: i.source.url,
        price: i.price,
      };
      return [{ category: i.garment.category, colorHex: i.colorHex, product }];
    }
    return [];
  });
  const data: Persisted = {
    items,
    body: v.body,
    appearance: v.appearance,
    quality: v.quality,
    pose: v.pose,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode): the look lasts for this session */
  }
}

/** Save the current look + avatar to this device whenever either changes. */
export function startPersistence(): () => void {
  const save = () => persistNow();
  const a = outfitStore.subscribe(save);
  const b = useView.subscribe(save);
  return () => {
    a();
    b();
  };
}

/** Put a searched product on the avatar (loading the saved look first so it isn't overwritten). */
export function tryOn(p: ProductRef): void {
  useView.getState().hydrate();
  outfitStore.getState().equip(productItem(p));
  persistNow();
}
