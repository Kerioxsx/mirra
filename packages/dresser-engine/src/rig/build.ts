/**
 * Builds the avatar's geometry: the skinned body and each garment's skinned pieces, all in the rest
 * pose, all bound to one mirra-rig@1 skeleton. Pure functions (no React, no WebGL), cached by what
 * they depend on, so a colour change or a pose change never rebuilds a mesh.
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import type { GarmentDefinition, ParametricSpec } from "@mirra/garment-system";
import { meshOf } from "../avatar/asset";
import type { MorphedAvatar } from "../avatar/morph";
import type { BodyModel, BodyParams, HairStyle } from "../body";
import { BodyField, GROUPS, topFour } from "./bodyField";
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

function cullSphere(g: BufferGeometry) {
  g.computeBoundingBox();
  const c = new Vector3();
  g.boundingBox!.getCenter(c);
  g.boundingSphere = new Sphere(c, g.boundingBox!.min.distanceTo(g.boundingBox!.max) * 0.75);
}

/** Each bone's body-field group, so garment weights only come from the part they lie over. */
const GROUP_OF_BONE: Record<number, number> = {};
for (const [bones, g] of [
  [["root", "hips", "spine", "chest", "clavicle.L", "clavicle.R"], 0],
  [["neck", "head"], 1],
  [["upperArm.L", "forearm.L", "hand.L"], 2],
  [["upperArm.R", "forearm.R", "hand.R"], 3],
  [["thigh.L", "shin.L", "foot.L"], 4],
  [["thigh.R", "shin.R", "foot.R"], 5],
] as const)
  for (const b of bones) GROUP_OF_BONE[BONE[b]] = g;
const HANDS = new Set<number>([BONE["hand.L"], BONE["hand.R"]]);

/** The downloaded avatar's skin weights, looked up near a point (garments move as the skin does). */
class SkinLookup {
  private cells = new Map<number, number[]>();
  readonly group: Uint8Array;
  constructor(
    private pos: Float32Array,
    private joints: Uint8Array,
    private weights: Float32Array,
    private cell: number,
  ) {
    const n = pos.length / 3;
    this.group = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weights[v * 4 + k]! > weights[v * 4 + best]!) best = k;
      const bone = joints[v * 4 + best]!;
      this.group[v] = GROUP_OF_BONE[bone] ?? 0;
      if (HANDS.has(bone)) continue; // no garment follows a hand
      const key = this.key(
        Math.floor(pos[v * 3]! / cell),
        Math.floor(pos[v * 3 + 1]! / cell),
        Math.floor(pos[v * 3 + 2]! / cell),
      );
      const list = this.cells.get(key);
      if (list) list.push(v);
      else this.cells.set(key, [v]);
    }
  }

  private key(i: number, j: number, k: number) {
    return ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  }

  /**
   * Gaussian-weighted blend of the vertices of one body group within `reach` (null when there
   * are none), added into `out` scaled by `scale`.
   */
  at(
    x: number,
    y: number,
    z: number,
    reach: number,
    group: number,
    out: Map<number, number>,
    scale: number,
  ): boolean {
    const c = this.cell;
    const r = Math.ceil(reach / c);
    const ci = Math.floor(x / c);
    const cj = Math.floor(y / c);
    const ck = Math.floor(z / c);
    const s2 = 2 * (reach * 0.4) ** 2;
    const acc = new Map<number, number>();
    let total = 0;
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++)
        for (let k = ck - r; k <= ck + r; k++) {
          const list = this.cells.get(this.key(i, j, k));
          if (!list) continue;
          for (const v of list) {
            if (this.group[v] !== group) continue;
            const dx = this.pos[v * 3]! - x;
            const dy = this.pos[v * 3 + 1]! - y;
            const dz = this.pos[v * 3 + 2]! - z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > reach * reach) continue;
            const g = Math.exp(-d2 / s2);
            total += g;
            for (let q = 0; q < 4; q++) {
              const w = this.weights[v * 4 + q]!;
              if (w > 0) {
                const b = this.joints[v * 4 + q]!;
                acc.set(b, (acc.get(b) ?? 0) + w * g);
              }
            }
          }
        }
    if (total === 0) return false;
    for (const [b, w] of acc) out.set(b, (out.get(b) ?? 0) + (w / total) * scale);
    return true;
  }
}

export interface OutfitBuild {
  pieces: Map<string, BuiltPiece[]>;
  /** Garments that wrap the body (for hiding the skin they cover). */
  covering: GarmentField[];
  /** Hats (for hiding the hair they cover). */
  headwear: GarmentField[];
}

export class AvatarBuilder {
  readonly field: BodyField;
  readonly garments: GarmentBuilder;
  private cache = new Map<string, { field: GarmentField; pieces: BuiltPiece[] }>();
  private bodyGeo: BufferGeometry | null = null;
  private parts = new Map<string, BufferGeometry | null>();
  private visible = new Map<string, BufferAttribute>();
  private lookup: SkinLookup | null = null;

  constructor(
    readonly model: BodyModel,
    readonly key: string,
    readonly spacing: number,
    /** The downloaded avatar after the sliders; without it the procedural mannequin is built. */
    readonly avatar?: MorphedAvatar,
  ) {
    this.field = new BodyField(model);
    this.garments = new GarmentBuilder(this.field);
  }

  /** A mesh of the downloaded avatar (body, eyes, eyebrows, hair_<style>) as skinned geometry. */
  part(name: string): BufferGeometry | null {
    if (!this.avatar) return null;
    const hit = this.parts.get(name);
    if (hit !== undefined) return hit;
    const src = meshOf(this.avatar.asset, name);
    const morphed = this.avatar.meshes.get(name);
    let g: BufferGeometry | null = null;
    if (src && morphed) {
      g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(morphed.position, 3));
      g.setAttribute("normal", new BufferAttribute(morphed.normal, 3));
      g.setAttribute("uv", new BufferAttribute(src.uv, 2));
      g.setAttribute("skinIndex", new BufferAttribute(Uint16Array.from(src.joints), 4));
      g.setAttribute("skinWeight", new BufferAttribute(src.weights, 4));
      g.setIndex(new BufferAttribute(src.index, 1));
      cullSphere(g);
    }
    this.parts.set(name, g);
    return g;
  }

  /**
   * The triangles of a downloaded mesh left visible under the given garments: skin that is well
   * inside a garment is dropped, so it can never show through fabric when the avatar moves.
   */
  visibleIndex(
    name: "body" | `hair_${string}`,
    key: string,
    over: GarmentField[],
  ): BufferAttribute | null {
    const g = this.part(name);
    if (!g || !over.length) return g?.getIndex() ?? null;
    const cacheKey = `${name}|${key}`;
    const hit = this.visible.get(cacheKey);
    if (hit) return hit;
    const pos = g.getAttribute("position").array as Float32Array;
    const n = pos.length / 3;
    const H = this.model.H;
    const hair = name !== "body";
    const margin = hair ? 0 : 0.004 * H;
    const hidden = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3]!;
      const y = pos[v * 3 + 1]!;
      const z = pos[v * 3 + 2]!;
      for (const f of over) {
        const b = f.bounds;
        if (
          x < b.min[0] ||
          y < b.min[1] ||
          z < b.min[2] ||
          x > b.max[0] ||
          y > b.max[1] ||
          z > b.max[2]
        )
          continue;
        const clip = f.pieces[0]?.clip;
        if (clip && clip(x, y, z) >= -margin) continue;
        // hair under a hat goes wherever the hat covers; skin only where it is inside the fabric
        if (hair || f.solid(x, y, z) < -margin) {
          hidden[v] = 1;
          break;
        }
      }
    }
    const src = g.getIndex()!.array as Uint16Array | Uint32Array;
    const keep: number[] = [];
    for (let t = 0; t < src.length; t += 3) {
      if (hidden[src[t]!] && hidden[src[t + 1]!] && hidden[src[t + 2]!]) continue;
      keep.push(src[t]!, src[t + 1]!, src[t + 2]!);
    }
    const attr = new BufferAttribute(
      n < 65536 ? Uint16Array.from(keep) : Uint32Array.from(keep),
      1,
    );
    this.visible.set(cacheKey, attr);
    return attr;
  }

  body(): BufferGeometry {
    if (this.avatar) return this.part("body")!;
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
    if (this.avatar && !this.lookup) {
      const src = meshOf(this.avatar.asset, "body")!;
      this.lookup = new SkinLookup(
        this.avatar.meshes.get("body")!.position,
        src.joints,
        src.weights,
        0.02 * H,
      );
    }
    const lookup = this.lookup;
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
      const px = x - gx * d;
      const py = y - gy * d;
      const pz = z - gz * d;
      let near: Map<number, number> | null = null;
      if (lookup) {
        // the groups this point lies over (soft nearest, as the body field's own weights), each
        // giving the weights of its own skin nearby
        const gd = GROUPS.map((g) =>
          g === "armL"
            ? f.sleeve("L", px, py, pz)
            : g === "armR"
              ? f.sleeve("R", px, py, pz)
              : f.group(g, px, py, pz),
        );
        const gmin = Math.min(...gd);
        const legShare =
          1 - Math.min(1, Math.max(0, (py - this.model.y.crotch - 0.012 * H) / (0.045 * H)));
        near = new Map();
        // tighter than the field's own blend: only parts that actually meet share a point (a
        // forearm hanging beside the hip must not drag the coat over it)
        const tg = 0.004 * H;
        gd.forEach((d, gi) => {
          const rel = d - gmin;
          if (rel > 3 * tg) return;
          const share = Math.exp(-rel / tg) * (gi >= 4 ? legShare : 1);
          if (share < 1e-3) return;
          if (!lookup.at(px, py, pz, 0.018 * H, gi, near!, share))
            lookup.at(px, py, pz, 0.045 * H, gi, near!, share);
        });
        if (!near.size) near = null;
      }
      near ??= f.weightMap(px, py, pz, tau, true);
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
    if (this.avatar) return null; // the downloaded avatar brings its own hair
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
  outfit(items: { slot: string; garment: GarmentDefinition }[], hair: HairStyle): OutfitBuild {
    const out = new Map<string, BuiltPiece[]>();
    const covering: GarmentField[] = [];
    const headwear: GarmentField[] = [];
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
      if (item.garment.parametric!.template !== "belt") covering.push(built.field);
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
      if (!built) continue;
      out.set(item.slot, built.pieces);
      if (spec.template === "headwear") headwear.push(built.field);
      covering.push(built.field);
    }
    return { pieces: out, covering, headwear };
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
    for (const g of this.parts.values()) g?.dispose();
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
  avatar?: MorphedAvatar,
): AvatarBuilder {
  const key = `${avatar?.asset.body ?? "mannequin"}:${quality}:${[
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
    b = new AvatarBuilder(model, key, MESH_SPACING[quality], avatar);
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
