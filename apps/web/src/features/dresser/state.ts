"use client";
import { create } from "zustand";
import { genericGarment, resolveColor } from "@mirra/garment-system";
import { createOutfitStore, emptyOutfit, equip, itemFor, type Outfit } from "@mirra/outfit-engine";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_BODY,
  type Appearance,
  type BodyParams,
  type CameraPreset,
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

interface Persisted {
  items: { category: string; colorHex: string }[];
  body: BodyParams;
  appearance: Appearance;
  quality: Quality;
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
    .reduce(
      (o, i) => equip(o, genericItem(i.category as Category, i.colorHex)).outfit,
      emptyOutfit,
    );
}

export const outfitStore = createOutfitStore(emptyOutfit);

interface ViewState {
  body: BodyParams;
  appearance: Appearance;
  quality: Quality;
  camera: CameraPreset;
  turntable: boolean;
  hydrated: boolean;
  setBody: (b: Partial<BodyParams>) => void;
  setBodyPreset: (b: BodyParams) => void;
  setAppearance: (a: Partial<Appearance>) => void;
  setQuality: (q: Quality) => void;
  setCamera: (c: CameraPreset) => void;
  toggleTurntable: () => void;
  hydrate: () => void;
}

export const useView = create<ViewState>()((set, get) => ({
  body: DEFAULT_BODY,
  appearance: DEFAULT_APPEARANCE,
  quality: "medium",
  camera: "full",
  turntable: false,
  hydrated: false,
  setBody: (b) => set({ body: { ...get().body, ...b } }),
  setBodyPreset: (b) => set({ body: b }),
  setAppearance: (a) => set({ appearance: { ...get().appearance, ...a } }),
  setQuality: (quality) => set({ quality }),
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
          }
        : {}),
    });
  },
}));

/** Save the current look + avatar to this device whenever either changes. */
export function startPersistence(): () => void {
  const save = () => {
    const v = useView.getState();
    if (!v.hydrated) return;
    const items = Object.values(outfitStore.getState().history.present.items)
      .filter((i) => i.source.kind === "generic")
      .map((i) => ({ category: i.garment.category, colorHex: i.colorHex }));
    const data: Persisted = { items, body: v.body, appearance: v.appearance, quality: v.quality };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable (private mode): the look lasts for this session */
    }
  };
  const a = outfitStore.subscribe(save);
  const b = useView.subscribe(save);
  return () => {
    a();
    b();
  };
}
