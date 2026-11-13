import { describe, expect, it } from "vitest";
import { taxonomy } from "@mirra/shared-types";
import {
  approximateGarment,
  conflictReason,
  genericGarment,
  inferFit,
  resolveColor,
  slotKey,
  CATEGORY_TEMPLATES,
} from "./index";

describe("taxonomy coverage", () => {
  it("has a parametric template and generic garment for every backend category", () => {
    for (const c of taxonomy.categories) {
      expect(CATEGORY_TEMPLATES[c.id]).toBeDefined();
      const g = genericGarment(c.id);
      expect(g.bodyRegion).toBe(c.bodyRegion);
      expect(g.layer).toBe(c.defaultLayer);
      expect(g.fidelity).toBe("generic");
    }
  });
});

describe("resolveColor", () => {
  it("resolves names, phrases and hex", () => {
    expect(resolveColor("Black")).toBe("#141414");
    expect(resolveColor("washed light blue denim")).toBe("#9ab7d8"); // longest match wins
    expect(resolveColor("#A1B2C3")).toBe("#a1b2c3");
    expect(resolveColor("vantablack-ish")).toBeNull();
    expect(resolveColor(undefined)).toBeNull();
  });
});

describe("approximateGarment", () => {
  it("is labelled approximate and carries product colour and fit", () => {
    const g = approximateGarment({
      id: "p1",
      title: "Oversized Zip-Up Hoodie",
      category: "zip_up",
      colors: ["black"],
    });
    expect(g.fidelity).toBe("approximate");
    expect(g.productId).toBe("p1");
    expect(g.colorVariants[0]!.hex).toBe("#141414");
    expect(g.parametric).toMatchObject({ template: "top", fit: "oversized", hood: true });
  });

  it("turns oversized straight bottoms into wide legs and respects declared fit", () => {
    const baggy = approximateGarment({ id: "p2", title: "Baggy jeans", category: "jeans" });
    expect(baggy.parametric).toMatchObject({ shape: "wide", fit: "oversized" });
    expect(
      inferFit({ id: "x", title: "Baggy tee", category: "t_shirt", attributes: { fit: "slim" } }),
    ).toBe("slim");
  });

  it("crops tops whose title says cropped", () => {
    const g = approximateGarment({ id: "p3", title: "Cropped boxy tee", category: "t_shirt" });
    expect(g.parametric).toMatchObject({ length: "crop", fit: "oversized" });
  });

  it("falls back to a neutral colour instead of inventing one", () => {
    const g = approximateGarment({
      id: "p4",
      title: "Field jacket",
      category: "jacket",
      colors: [],
    });
    expect(g.colorVariants[0]!.hex).toBe("#8a8d91");
  });
});

describe("rules", () => {
  it("conflicts on the same slot", () => {
    const a = genericGarment("t_shirt");
    const b = genericGarment("tank_top");
    expect(slotKey(a)).toBe(slotKey(b));
    expect(conflictReason(a, b)).toBe("same slot");
  });

  it("lets layers stack", () => {
    expect(conflictReason(genericGarment("t_shirt"), genericGarment("hoodie"))).toBeNull();
    expect(conflictReason(genericGarment("hoodie"), genericGarment("coat"))).toBeNull();
  });

  it("a dress replaces base tops and bottoms but not outerwear", () => {
    const dress = genericGarment("dress");
    expect(conflictReason(dress, genericGarment("jeans"))).toMatch(/covers the legs/);
    expect(conflictReason(genericGarment("t_shirt"), dress)).toMatch(/covers the torso/);
    expect(conflictReason(dress, genericGarment("jacket"))).toBeNull();
    expect(conflictReason(dress, genericGarment("sneakers"))).toBeNull();
  });
});
