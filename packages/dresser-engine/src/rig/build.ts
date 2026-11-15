/**
 * Builds the avatar's geometry: the skinned body and each garment's skinned pieces, all in the rest
 * pose, all bound to one mirra-rig@1 skeleton. Pure functions (no React, no WebGL), cached by what
 * they depend on, so a colour change or a pose change never rebuilds a mesh.
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import type { GarmentDefinition, ParametricSpec } from "@mirra/garment-system";
import type { BodyModel, BodyParams, HairStyle } from "../body";
import { BodyField, topFour } from "./bodyField";
import { GarmentBuilder, type GarmentField, type PieceRole } from "./garmentField";
import { clipMesh, meshSDF, type MeshData } from "./mesher";
import { BONE } from "./skeleton";

/** Grid spacing (metres) per quality tier. */
export const MESH_SPACING = { low: 0.016, medium: 0.0115, high: 0.0085 } as const;
export type MeshQuality = keyof typeof MESH_SPACING;

/** Templates the field system builds; the rest are rigid accessories. */
export const FIELD_TEMPLATES = new Set<ParametricSpec["template"]>([
  "top",
  "bottom",
  "skirt",
  "dress",
  "jumpsuit",
  "footwear",
  "headwear",
  "belt",
]);

/** Order of the layers that wrap the body: trousers, then one-pieces, the belt, then tops by layer. */
const BODY_ORDER: Partial<Record<ParametricSpec["template"], number>> = {
  bottom: 0,
  skirt: 0,
  jumpsuit: 1,
  dress: 1,
  belt: 2,
  top: 3,
};

export interface BuiltPiece {
  role: PieceRole;
  geometry: BufferGeometry;
}

function toGeometry(
  mesh: MeshData,
  skin: (x: number, y: number, z: number) => { index: number[]; weight: number[] },
): BufferGeometry {
  const n = mesh.positions.length / 3;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const { index, weight } = skin(
      mesh.positions[v * 3]!,
      mesh.positions[v * 3 + 1]!,
      mesh.positions[v * 3 + 2]!,
    );
    for (let k = 0; k < 4; k++) {
      si[v * 4 + k] = index[k]!;
      sw[v * 4 + k] = weight[k]!;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  g.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  g.setAttribute("skinIndex", new BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new BufferAttribute(sw, 4));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  g.computeBoundingBox();
  // skinned meshes move: give the culler a generous sphere instead of the rest-pose one
  const c = new Vector3();
  g.boundingBox!.getCenter(c);
  g.boundingSphere = new Sphere(c, g.boundingBox!.min.distanceTo(g.boundingBox!.max) * 0.75);
  return g;
}

const HEAD_ONLY = { index: [BONE.head, 0, 0, 0], weight: [1, 0, 0, 0] };

export class AvatarBuilder {
  readonly field: BodyField;
  readonly garments: GarmentBuilder;
  private cache = new Map<string, { field: GarmentField; pieces: BuiltPiece[] }>();
  private bodyGeo: BufferGeometry | null = null;

  constructor(
    readonly model: BodyModel,
    readonly key: string,
    readonly spacing: number,
  ) {
    this.field = new BodyField(model);
    this.garments = new GarmentBuilder(this.field);
  }

  body(): BufferGeometry {
    if (!this.bodyGeo) {
      const f = this.field;
      const mesh = meshSDF(
        (x, y, z) => f.eval(x, y, z),
        f.bounds(undefined, 0.02),
        this.spacing * 0.85,
      );
      this.bodyGeo = toGeometry(mesh, (x, y, z) => f.weights(x, y, z));
    }
    return this.bodyGeo;
  }

  /**
   * Garment skin weights come from the body point under the vertex, so every layer stacked over one
   * spot moves the same way and inner layers never surface when posed. Far from the body (a coat's
   * skirt between the legs) they blend toward smooth weights at the vertex itself. Hands never
   * carry a garment.
   */
  private skinFor(rigid: boolean) {
    if (rigid) return () => HEAD_ONLY;
    const f = this.field;
    const H = this.model.H;
    const tau = 0.008 * H;
    const e = 0.002 * H;
    return (x: number, y: number, z: number) => {
      const f0 = f.eval(x + e, y - e, z - e);
      const f1 = f.eval(x - e, y - e, z + e);
      const f2 = f.eval(x - e, y + e, z - e);
      const f3 = f.eval(x + e, y + e, z + e);
      let gx = f0 - f1 - f2 + f3;
      let gy = -f0 - f1 + f2 + f3;
      let gz = -f0 + f1 - f2 + f3;
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      const d = Math.max(0, (f0 + f1 + f2 + f3) * 0.25);
      const near = f.weightMap(x - gx * d, y - gy * d, z - gz * d, tau, true);
      // only loose fabric below the crotch (skirts, coat tails) blends toward smooth weights; above
      // it every layer takes the body's weights, so stacked layers always move together
      const below = Math.min(1, Math.max(0, (this.model.y.crotch - y) / (0.05 * H)));
      const loose = Math.min(1, Math.max(0, (d - 0.008 * H) / (0.022 * H)));
      const t = below * loose;
      if (t === 0) return topFour(near);
      const far = f.weightMap(x, y, z, tau + 0.5 * d, true);
      const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0) || 1;
      const sn = sum(near);
      const sf = sum(far);
      const mix = new Map<number, number>();
      for (const [b, v] of near) mix.set(b, (v / sn) * (1 - t));
      for (const [b, v] of far) mix.set(b, (mix.get(b) ?? 0) + (v / sf) * t);
      return topFour(mix);
    };
  }

  private realise(field: GarmentField): BuiltPiece[] {
    return field.pieces.map((p) => {
      const raw = meshSDF(p.sdf, p.bounds, Math.min(this.spacing, p.spacing ?? Infinity));
      const mesh = p.clip ? clipMesh(raw, p.clip) : raw;
      return { role: p.role, geometry: toGeometry(mesh, this.skinFor(p.bone === "head")) };
    });
  }

  hair(style: HairStyle): { field: GarmentField; pieces: BuiltPiece[] } | null {
    const key = `hair:${style}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const field = this.garments.hair(style);
    if (!field) return null;
    const out = { field, pieces: this.realise(field) };
    this.cache.set(key, out);
    return out;
  }

  /**
   * Builds the worn garments in layering order. Each garment's cache key includes everything worn
   * under it, so changing an inner layer rebuilds only the layers above it.
   */
  outfit(
    items: { slot: string; garment: GarmentDefinition }[],
    hair: HairStyle,
  ): Map<string, BuiltPiece[]> {
    const out = new Map<string, BuiltPiece[]>();
    const body = items
      .filter(
        (i) => i.garment.parametric && BODY_ORDER[i.garment.parametric.template] !== undefined,
      )
      .sort(
        (a, b) =>
          BODY_ORDER[a.garment.parametric!.template]! -
            BODY_ORDER[b.garment.parametric!.template]! || a.garment.layer - b.garment.layer,
      );
    const inner: GarmentField[] = [];
    let chain = "";
    for (const item of body) {
      chain += `|${item.garment.id}`;
      const built = this.cached(`body${chain}`, () =>
        this.buildOne(item.garment.parametric!, [...inner]),
      );
      if (!built) continue;
      inner.push(built.field);
      out.set(item.slot, built.pieces);
    }
    const hairBuilt = this.hair(hair);
    for (const item of items) {
      const spec = item.garment.parametric;
      if (!spec || out.has(item.slot) || !FIELD_TEMPLATES.has(spec.template)) continue;
      const key =
        spec.template === "headwear" ? `${item.garment.id}|hair:${hair}` : item.garment.id;
      const built = this.cached(key, () =>
        this.buildOne(spec, spec.template === "headwear" && hairBuilt ? [hairBuilt.field] : []),
      );
      if (built) out.set(item.slot, built.pieces);
    }
    return out;
  }

  private cached(key: string, make: () => GarmentField | null) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const field = make();
    if (!field) return null;
    const built = { field, pieces: this.realise(field) };
    this.cache.set(key, built);
    return built;
  }

  private buildOne(spec: ParametricSpec, inner: GarmentField[]): GarmentField | null {
    const g = this.garments;
    switch (spec.template) {
      case "top":
        return g.top(spec, { inner });
      case "bottom":
        return g.bottom(spec, { inner });
      case "skirt":
        return g.skirt(spec, { inner });
      case "dress":
        return g.dress(spec, { inner });
      case "jumpsuit":
        return g.jumpsuit(spec, { inner });
      case "footwear":
        return g.footwear(spec);
      case "headwear":
        return g.headwear(spec, { inner });
      case "belt":
        return g.belt({ inner });
      default:
        return null;
    }
  }

  dispose() {
    this.bodyGeo?.dispose();
    for (const { pieces } of this.cache.values()) for (const p of pieces) p.geometry.dispose();
    this.cache.clear();
  }
}

const builders = new Map<string, AvatarBuilder>();

/** One builder per body shape and quality, kept for the last few shapes (slider scrubbing). */
export function avatarBuilder(
  model: BodyModel,
  params: BodyParams,
  quality: MeshQuality,
): AvatarBuilder {
  const key = `${quality}:${[
    params.height,
    params.build,
    params.shoulders,
    params.hips,
    params.legLength,
  ]
    .map((v) => v.toFixed(3))
    .join(",")}`;
  let b = builders.get(key);
  if (!b) {
    b = new AvatarBuilder(model, key, MESH_SPACING[quality]);
    builders.set(key, b);
    while (builders.size > 4) {
      const oldest = builders.keys().next().value as string;
      builders.get(oldest)?.dispose();
      builders.delete(oldest);
    }
  } else {
    builders.delete(key);
    builders.set(key, b);
  }
  return b;
}
