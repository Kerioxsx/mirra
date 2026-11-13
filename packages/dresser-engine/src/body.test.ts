import { describe, expect, it } from "vitest";
import { BODY_PRESETS, computeBody, radiusAt, torsoProfile } from "./body";
import { layerOffset } from "./garments/common";
import { topProfile } from "./garments/Top";

describe("body model", () => {
  it("keeps landmarks in anatomical order for every preset", () => {
    for (const { body } of BODY_PRESETS) {
      const m = computeBody(body);
      const ys = [
        m.y.ankle,
        m.y.knee,
        m.y.crotch,
        m.y.hip,
        m.y.waist,
        m.y.chest,
        m.y.shoulder,
        m.y.neckBase,
        m.y.neckTop,
        m.y.head,
      ];
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
      expect(m.y.head + m.headR).toBeLessThan(m.H * 1.01);
      expect(m.w.waist).toBeLessThan(m.w.chest);
    }
  });

  it("scales with height", () => {
    expect(computeBody({ ...BODY_PRESETS[1]!.body, height: 1 }).H).toBeGreaterThan(
      computeBody({ ...BODY_PRESETS[1]!.body, height: 0 }).H,
    );
  });

  it("interpolates torso radius and clamps outside the profile", () => {
    const m = computeBody(BODY_PRESETS[1]!.body);
    const p = torsoProfile(m);
    expect(radiusAt(p, m.y.waist)).toBeCloseTo(m.w.waist);
    expect(radiusAt(p, -1)).toBe(p[0]![0]);
    expect(radiusAt(p, 99)).toBe(p[p.length - 1]![0]);
  });
});

describe("garment layering", () => {
  it("outer layers always stand further off the body than inner ones", () => {
    const m = computeBody(BODY_PRESETS[1]!.body);
    const inner = topProfile(m, {
      hemY: m.y.crotch + 0.02 * m.H,
      fs: 0.07,
      drape: 0,
      add: layerOffset(m, 10),
    });
    const outer = topProfile(m, {
      hemY: m.y.crotch + 0.02 * m.H,
      fs: 0.07,
      drape: 0,
      add: layerOffset(m, 40),
    });
    const body = torsoProfile(m);
    for (const [r, y] of inner) expect(r).toBeGreaterThan(radiusAt(body, y));
    inner.forEach(([r], i) => expect(outer[i]![0]).toBeGreaterThan(r));
  });
});
