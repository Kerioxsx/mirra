import { describe, expect, it } from "vitest";
import { genericGarment, approximateGarment } from "@mirra/garment-system";
import {
  createHistory,
  commit,
  createOutfitStore,
  emptyOutfit,
  equip,
  itemFor,
  layered,
  priceSummary,
  redo,
  undo,
  HISTORY_LIMIT,
} from "./index";

const tee = itemFor(genericGarment("t_shirt"));
const hoodie = itemFor(genericGarment("hoodie"));
const jeans = itemFor(genericGarment("jeans"));

describe("equip", () => {
  it("layers different slots and replaces the same slot", () => {
    let o = equip(emptyOutfit, tee).outfit;
    o = equip(o, hoodie).outfit;
    o = equip(o, jeans).outfit;
    expect(Object.keys(o.items)).toHaveLength(3);
    const tank = itemFor(genericGarment("tank_top"));
    const r = equip(o, tank);
    expect(r.removed.map((x) => x.item.garment.category)).toEqual(["t_shirt"]);
    expect(Object.keys(r.outfit.items)).toHaveLength(3);
  });

  it("a dress takes off base top and bottoms, reporting why", () => {
    let o = equip(emptyOutfit, tee).outfit;
    o = equip(o, jeans).outfit;
    o = equip(o, hoodie).outfit;
    const r = equip(o, itemFor(genericGarment("dress")));
    expect(r.removed.map((x) => x.item.garment.category).sort()).toEqual(["jeans", "t_shirt"]);
    expect(
      Object.values(r.outfit.items)
        .map((i) => i.garment.category)
        .sort(),
    ).toEqual(["dress", "hoodie"]);
  });

  it("renders inner layers first", () => {
    let o = equip(emptyOutfit, itemFor(genericGarment("coat"))).outfit;
    o = equip(o, tee).outfit;
    o = equip(o, hoodie).outfit;
    expect(layered(o).map(([, i]) => i.garment.category)).toEqual(["t_shirt", "hoodie", "coat"]);
  });
});

describe("priceSummary", () => {
  const product = (id: string, amount: string | null, currency = "USD") =>
    itemFor(approximateGarment({ id, title: id, category: id === "a" ? "hoodie" : "jeans" }), {
      source: { kind: "product", productId: id },
      price: amount === null ? null : { amount, currency },
    });

  it("sums exact cents and never treats unknown prices as zero", () => {
    let o = equip(emptyOutfit, product("a", "59.99")).outfit;
    o = equip(o, product("b", "0.02")).outfit;
    expect(priceSummary(o)).toEqual({
      totals: { USD: "60.01" },
      pricedCount: 2,
      unknownCount: 0,
      complete: true,
    });
    o = equip(o, itemFor(genericGarment("sneakers"))).outfit; // generic items aren't for sale
    expect(priceSummary(o).complete).toBe(true);
  });

  it("flags incomplete totals and keeps currencies apart", () => {
    let o = equip(emptyOutfit, product("a", "100", "EUR")).outfit;
    o = equip(o, product("b", null)).outfit;
    const s = priceSummary(o);
    expect(s.totals).toEqual({ EUR: "100.00" });
    expect(s.unknownCount).toBe(1);
    expect(s.complete).toBe(false);
  });
});

describe("history", () => {
  it("undoes and redoes, and a new commit clears the redo stack", () => {
    let h = createHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    h = undo(commit(undo(h), 9));
    expect(h.future).toEqual([9]);
    expect(commit(h, h.present)).toBe(h);
  });

  it("is bounded", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("store", () => {
  it("wires equip/undo/redo/notice together", () => {
    const store = createOutfitStore();
    const s = () => store.getState();
    s().equip(tee);
    s().equip(jeans);
    s().equip(itemFor(genericGarment("dress")));
    expect(s().notice).toMatch(/Took off/);
    expect(Object.keys(s().history.present.items)).toHaveLength(1);
    s().undo();
    expect(Object.keys(s().history.present.items)).toHaveLength(2);
    expect(s().canRedo()).toBe(true);
    s().redo();
    s().clear();
    expect(s().history.present.items).toEqual({});
    expect(s().canUndo()).toBe(true);
  });
});
