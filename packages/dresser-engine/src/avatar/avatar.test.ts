import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Category } from "@mirra/shared-types";
import { genericGarment } from "@mirra/garment-system";
import { DEFAULT_BODY, type BodyParams } from "../body";
import { BodyField } from "../rig/bodyField";
import { AvatarBuilder } from "../rig/build";
import { BONE, BONE_NAMES, RIG_ID } from "../rig/skeleton";
import { meshOf, parseAvatar, type AvatarAsset } from "./asset";
import { fitBody } from "./fit";
import { morphAvatar } from "./morph";

const file = (body: string) =>
  readFileSync(new URL(`../../../../apps/web/public/avatars/${body}.glb`, import.meta.url));
const assets: Record<string, AvatarAsset> = {
  female: parseAvatar(file("female")),
  male: parseAvatar(file("male")),
};

const jointY = (j: Float32Array, b: keyof typeof BONE) => j[BONE[b] * 3 + 1]!;

describe("avatar files", () => {
  it.each(["female", "male"])("%s.glb is a mirra-rig@1 avatar with its meshes", (body) => {
    const a = assets[body]!;
    expect(a.body).toBe(body);
    expect(a.source).toMatch(/Quaternius.*CC0/);
    expect(a.joints.length).toBe(BONE_NAMES.length * 3);
    expect(a.meshes.map((m) => m.name).sort()).toEqual(
      ["body", "eyebrows", "eyes", "hair_buzz", "hair_short", "hair_bun", "hair_long"].sort(),
    );
    const body3d = meshOf(a, "body")!;
    const n = body3d.position.length / 3;
    expect(n).toBeGreaterThan(5000);
    expect(body3d.joints.length).toBe(n * 4);
    // every vertex's weights sum to 1 and name real bones
    for (let v = 0; v < n; v += 97) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += body3d.weights[v * 4 + k]!;
        expect(body3d.joints[v * 4 + k]!).toBeLessThan(BONE_NAMES.length);
      }
      expect(sum).toBeCloseTo(1, 2);
    }
    // the pose is the dresser's A-pose: hands well below the shoulders, beside the hips
    expect(jointY(a.joints, "hand.L")).toBeLessThan(jointY(a.joints, "upperArm.L") - 0.4);
    expect(a.joints[BONE["hand.L"] * 3]!).toBeGreaterThan(0.2);
    expect(a.materials.map((m) => m.name)).toContain("skin");
    expect(a.images.every((im) => im.mime === "image/webp" && im.bytes.length > 1000)).toBe(true);
  });

  it("rejects files that aren't mirra avatars", () => {
    expect(() => parseAvatar(new Uint8Array(40))).toThrow(/glTF/);
    expect(RIG_ID).toBe("mirra-rig@1");
  });
});

describe("body sliders on the downloaded avatar", () => {
  const a = assets.female!;
  const widthAt = (p: BodyParams) => {
    const m = fitBody(morphAvatar(a, p));
    return { m, waist: m.w.waist, hip: m.w.hip, shoulder: m.w.shoulder };
  };

  it("keeps the model as authored at the default sliders, scaled to the chosen height", () => {
    const av = morphAvatar(a, DEFAULT_BODY);
    expect(av.height).toBeCloseTo(1.76, 2);
    const src = meshOf(a, "body")!.position;
    const out = av.meshes.get("body")!.position;
    const s = av.height / a.height;
    for (let i = 0; i < src.length; i += 301) expect(out[i]!).toBeCloseTo(src[i]! * s, 2);
  });

  it("height, build, hips, shoulders and leg length each change the figure", () => {
    const base = widthAt(DEFAULT_BODY);
    expect(morphAvatar(a, { ...DEFAULT_BODY, height: 1 }).height).toBeGreaterThan(1.9);
    expect(widthAt({ ...DEFAULT_BODY, build: 1 }).waist).toBeGreaterThan(base.waist * 1.1);
    expect(widthAt({ ...DEFAULT_BODY, build: 0 }).waist).toBeLessThan(base.waist * 0.95);
    expect(widthAt({ ...DEFAULT_BODY, hips: 1 }).hip).toBeGreaterThan(base.hip * 1.08);
    expect(widthAt({ ...DEFAULT_BODY, shoulders: 1 }).shoulder).toBeGreaterThan(
      base.shoulder + 0.01,
    );
    const long = fitBody(morphAvatar(a, { ...DEFAULT_BODY, legLength: 1 }));
    expect(long.y.crotch / long.H).toBeGreaterThan(base.m.y.crotch / base.m.H + 0.01);
  });
});

describe("fitting the garment proxy", () => {
  it.each(["female", "male"])("encloses the %s body and gives ordered landmarks", (body) => {
    const av = morphAvatar(assets[body]!, DEFAULT_BODY);
    const m = fitBody(av);
    const f = new BodyField(m);
    const pos = av.meshes.get("body")!.position;
    const n = pos.length / 3;
    let outside = 0;
    for (let i = 0; i < pos.length; i += 3) {
      if (f.eval(pos[i]!, pos[i + 1]!, pos[i + 2]!) > 0.003) outside++;
    }
    // only fingertips may stray (garments never cover hands)
    expect(outside / n).toBeLessThan(0.006);
    const y = m.y;
    const order = [
      y.ankle,
      y.knee,
      y.crotch,
      y.hip,
      y.waist,
      y.chest,
      y.shoulder,
      y.neckBase,
      y.neckTop,
      y.head,
    ];
    expect([...order].sort((p, q) => p - q)).toEqual(order);
    expect(m.w.neck).toBeGreaterThan(0.035);
    expect(m.w.neck).toBeLessThan(0.065);
    // exactly symmetric, as the garment builder mirrors the left side
    expect(m.joints!["hand.R"].x).toBe(-m.joints!["hand.L"].x);
  });
});

describe("dressing the downloaded avatar", () => {
  const av = morphAvatar(assets.female!, DEFAULT_BODY);
  const model = fitBody(av);
  const b = new AvatarBuilder(model, "test", 0.016, av);
  const wear = (cats: Category[]) =>
    b.outfit(
      cats.map((c) => ({ slot: c, garment: genericGarment(c) })),
      "long",
    );

  it("uses the file's body and hair instead of building them", () => {
    expect(b.body().getAttribute("uv")).toBeDefined();
    expect(b.hair("long")).toBeNull();
    expect(b.part("hair_long")!.getAttribute("position").count).toBeGreaterThan(100);
    expect(b.part("hair_none")).toBeNull();
  });

  it("builds garments skinned like the skin under them, and hides the skin they cover", () => {
    const fullIndex = b.body().getIndex()!.count;
    const out = wear(["t_shirt", "jeans", "sneakers", "beanie"]);
    expect([...out.pieces.keys()].sort()).toEqual(["beanie", "jeans", "sneakers", "t_shirt"]);
    const tee = out.pieces.get("t_shirt")![0]!.geometry;
    const si = tee.getAttribute("skinIndex");
    const used = new Set<number>();
    for (let i = 0; i < si.count * 4; i++) used.add(si.array[i] as number);
    expect(used.has(BONE.chest) || used.has(BONE.spine)).toBe(true);
    for (const hand of [BONE["hand.L"], BONE["hand.R"]]) {
      const sw = tee.getAttribute("skinWeight");
      for (let v = 0; v < si.count; v++)
        for (let k = 0; k < 4; k++)
          if (si.array[v * 4 + k] === hand) expect(sw.array[v * 4 + k]).toBeLessThan(0.05);
    }
    const visible = b.visibleIndex("body", "tee", out.covering)!.count;
    expect(visible).toBeLessThan(fullIndex * 0.75);
    expect(visible).toBeGreaterThan(fullIndex * 0.15); // face, arms and hands stay
    expect(b.visibleIndex("body", "none", [])!.count).toBe(fullIndex);
    // the beanie hides the hair under it but not the hair hanging below it
    const hair = b.part("hair_long")!.getIndex()!.count;
    const under = b.visibleIndex("hair_long", "beanie", out.headwear)!.count;
    expect(under).toBeLessThan(hair);
    expect(under).toBeGreaterThan(hair * 0.2);
  });
});
