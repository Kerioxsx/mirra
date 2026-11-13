import { createStore } from "zustand/vanilla";
import type { SlotKey } from "@mirra/garment-system";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "./history";
import { emptyOutfit, equip, recolor, unequip, type Outfit, type OutfitItem } from "./outfit";

export interface OutfitStoreState {
  history: History<Outfit>;
  selected: SlotKey | null;
  /** Human-readable note about the last automatic change ("Removed Jeans: Dress covers the legs"). */
  notice: string | null;
  equip: (item: OutfitItem) => void;
  unequip: (slot: SlotKey) => void;
  recolor: (slot: SlotKey, hex: string) => void;
  select: (slot: SlotKey | null) => void;
  load: (outfit: Outfit) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/** A framework-agnostic store; React binds it with `useStore` from zustand. */
export function createOutfitStore(initial: Outfit = emptyOutfit) {
  return createStore<OutfitStoreState>()((set, get) => ({
    history: createHistory(initial),
    selected: null,
    notice: null,
    equip: (item) => {
      const { outfit, removed } = equip(get().history.present, item);
      set({
        history: commit(get().history, outfit),
        selected: `${item.garment.bodyRegion}:${item.garment.layer}`,
        notice: removed.length
          ? `Took off ${removed.map((r) => `${r.item.garment.name} (${r.reason})`).join(", ")}`
          : null,
      });
    },
    unequip: (slot) => {
      const s = get();
      set({
        history: commit(s.history, unequip(s.history.present, slot)),
        selected: s.selected === slot ? null : s.selected,
        notice: null,
      });
    },
    recolor: (slot, hex) =>
      set({ history: commit(get().history, recolor(get().history.present, slot, hex)) }),
    select: (slot) => set({ selected: slot }),
    load: (outfit) => set({ history: commit(get().history, outfit), selected: null, notice: null }),
    clear: () => set({ history: commit(get().history, emptyOutfit), selected: null, notice: null }),
    undo: () => set({ history: undo(get().history), notice: null }),
    redo: () => set({ history: redo(get().history), notice: null }),
    canUndo: () => canUndo(get().history),
    canRedo: () => canRedo(get().history),
  }));
}

export type OutfitStore = ReturnType<typeof createOutfitStore>;
