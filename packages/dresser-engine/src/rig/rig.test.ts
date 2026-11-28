import { describe, expect, it } from "vitest";
import { genericGarment } from "@mirra/garment-system";
import type { Category } from "@mirra/shared-types";
import { computeBody, DEFAULT_BODY } from "../body";
import { AvatarBuilder } from "./build";
import { BodyField } from "./bodyField";
import { GarmentBuilder } from "./garmentField";
import { meshSDF } from "./mesher";
import { BONE_NAMES, buildRig, RIG_ID } from "./skeleton";
import { applyPose, POSES } from "./poses";

const model = computeBody(DEFAULT_BODY);

function boundsOf(pos: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, pos[i + k]!);
      max[k] = Math.max(max[k]!, pos[i + k]!);
    }
  return { min, max };
}

describe("mirra-rig@1 skeleton", () => {
  it("has twenty named bones in the A-pose", () => {
    const rig = buildRig(model);
    expect(RIG_ID).toBe("mirra-rig@1");
    expect(rig.bones.map((b) => b.name)).toEqual([...BONE_NAMES]);
    expect(rig.rest["head"].y).toBeCloseTo(model.y.neckTop, 5);
    expect(rig.rest["upperArm.L"].x).toBeGreaterThan(0);
    expect(rig.rest["upperArm.R"].x).toBeLessThan(0);
  });

  it("applies and resets poses", () => {
    const rig = buildRig(model);
    applyPose(rig, POSES.walk, 1);
    const thigh = rig.bones[BONE_NAMES.indexOf("thigh.L")]!;
    expect(Math.abs(thigh.quaternion.x)).toBeGreaterThan(0.05);
    applyPose(rig, POSES["a-pose"], 1);
    expect(thigh.quaternion.x).toBeCloseTo(0, 6);
  });
});

describe("body field mesh", () => {
  it("is one continuous, correctly sized surface with valid skin weights", () => {
    const b = new AvatarBuilder(model, "t", 0.014);
    const t0 = performance.now();
    const g = b.body();
    const ms = performance.now() - t0;
    const pos = g.getAttribute("position").array;
    const { min, max } = boundsOf(pos);
    expect(max[1]! - min[1]!).toBeGreaterThan(model.H * 0.96);
    expect(max[1]! - min[1]!).toBeLessThan(model.H * 1.04);
    expect(Math.abs(max[0]! + min[0]!)).toBeLessThan(0.01); // symmetric
    const w = g.getAttribute("skinWeight").array;
    for (let i = 0; i < w.length; i += 4) {
      expect(w[i]! + w[i + 1]! + w[i + 2]! + w[i + 3]!).toBeCloseTo(1, 4);
    }
    console.info(`body: ${pos.length / 3} vertices in ${ms.toFixed(0)} ms`);
  });
});

describe("garment fields", () => {
  const field = new BodyField(model);
  const gb = new GarmentBuilder(field);
  const g = (c: Category) => genericGarment(c).parametric!;

  it("keeps every inner layer inside the outer one (no poke-through)", () => {
    const tee = gb.top(g("t_shirt") as never, { inner: [] });
    const hoodie = gb.top(g("hoodie") as never, { inner: [tee] });
    const coat = gb.top(g("coat") as never, { inner: [tee, hoodie] });
    const mesh = meshSDF(tee.pieces[0]!.sdf, tee.pieces[0]!.bounds, 0.012);
    let poke = 0;
    let checked = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      const y = mesh.positions[i + 1]!;
      const z = mesh.positions[i + 2]!;
      // only where the hoodie covers (inside its own coverage, above its hem)
      if (y < model.y.crotch + 0.04 * model.H || y > model.y.neckBase - 0.03 * model.H) continue;
      if (Math.abs(x) > model.w.chest * 1.1) continue; // torso only
      checked++;
      if (hoodie.solid(x, y, z) > -0.002) poke++;
      if (coat.solid(x, y, z) > -0.002) poke++;
    }
    expect(checked).toBeGreaterThan(200);
    expect(poke).toBe(0);
  });

  it("ends sleeves, hems and trouser legs where the garment says", () => {
    const tank = gb.top(g("tank_top") as never, { inner: [] });
    const shorts = gb.bottom(g("shorts") as never, { inner: [] });
    const wrist = model.forearm.b;
    expect(tank.solid(wrist.x, wrist.y, wrist.z)).toBeGreaterThan(0);
    const elbow = model.upperArm.b;
    expect(tank.solid(elbow.x + model.upperArm.rb * 0.5, elbow.y, 0)).toBeGreaterThan(0);
    const knee = model.shin.a;
    expect(shorts.solid(knee.x, knee.y, knee.z)).toBeGreaterThan(0);
    const hip = model.thigh.a;
    expect(shorts.solid(hip.x, model.y.crotch - 0.03 * model.H, 0)).toBeLessThan(0);
  });

  it("builds a full outfit with skinned pieces quickly enough to scrub", () => {
    const b = new AvatarBuilder(model, "t2", 0.0115);
    b.body();
    const items = (["t_shirt", "hoodie", "jeans", "sneakers", "beanie"] as Category[]).map((c) => ({
      slot: c,
      garment: genericGarment(c),
    }));
    const t0 = performance.now();
    const out = b.outfit(items, "short").pieces;
    const ms = performance.now() - t0;
    expect([...out.keys()].sort()).toEqual([...items.map((i) => i.slot)].sort());
    for (const pieces of out.values()) {
      expect(pieces.length).toBeGreaterThan(0);
      for (const p of pieces) expect(p.geometry.getAttribute("position").count).toBeGreaterThan(20);
    }
    console.info(`outfit of ${items.length}: ${ms.toFixed(0)} ms`);
    const t1 = performance.now();
    b.outfit(items, "short");
    expect(performance.now() - t1).toBeLessThan(20); // cached
  });
});
