/**
 * Garments as distance fields over the body field.
 *
 * A garment's solid is its own shape (the body offset by its fit, plus draped hulls for loose tops,
 * skirts and wide legs) united with everything worn under it, pushed out by a small gap, then cut to
 * the garment's coverage (hem, collar, sleeve and trouser lengths). Because each layer contains the
 * layers below, nothing worn underneath can poke through, whatever the fits. Cut edges become a
 * narrow ring between the layer below and this one, which reads as the fabric's edge.
 */
import type { Fit, ParametricSpec } from "@mirra/garment-system";
import {
  legCenterZ,
  neckCenterZ,
  radiusAt,
  torsoDepth,
  torsoProfile,
  type HairStyle,
} from "../body";
import type { BodyField, GroupName } from "./bodyField";
import type { SDF } from "./mesher";
import {
  band,
  box,
  ellipsoid,
  emptyBox,
  growBox,
  lathe,
  roundCone,
  sdShape,
  smin,
  sdEllipse2,
  type AABB,
  type Shape,
  type V3,
} from "./sdf";

export const FIT_SCALE: Record<Fit, number> = {
  slim: 0.03,
  regular: 0.07,
  relaxed: 0.12,
  oversized: 0.2,
};
const FIT_DRAPE: Record<Fit, number> = { slim: 0, regular: 0.3, relaxed: 0.65, oversized: 0.9 };

export type PieceRole = "main" | "trim";

export interface Piece {
  role: PieceRole;
  sdf: SDF;
  bounds: AABB;
  /** Skin to these groups only (e.g. a shoe never follows the hands). */
  groups?: GroupName[];
  /** Rigid pieces follow one bone (hats, hair). */
  bone?: "head";
  /** Keep only the part of the surface where this is negative (open hems, cuffs, necklines). */
  clip?: SDF;
  /** A finer grid for thin pieces (bands, zips, soles), in metres. */
  spacing?: number;
}

export interface GarmentField {
  pieces: Piece[];
  /** The garment's full solid, for the layers worn over it to enclose. */
  solid: SDF;
  /** Its trims (they sit within the gap; outer layers leave them a little room). */
  trims?: SDF;
  bounds: AABB;
}

export interface GarmentOpts {
  /** Garments already worn under this one (in order). */
  inner: GarmentField[];
}

type Spec<T extends ParametricSpec["template"]> = Extract<ParametricSpec, { template: T }>;

const union = (fields: SDF[]): SDF =>
  fields.length === 1
    ? fields[0]!
    : (x, y, z) => {
        let d = Infinity;
        for (const f of fields) d = Math.min(d, f(x, y, z));
        return d;
      };

function boundsUnion(...bs: AABB[]): AABB {
  const out = emptyBox();
  for (const b of bs) {
    if (!Number.isFinite(b.min[0])) continue;
    growBox(out, b.min[0], b.min[1], b.min[2]);
    growBox(out, b.max[0], b.max[1], b.max[2]);
  }
  return out;
}

function clipY(b: AABB, lo: number, hi: number): AABB {
  return {
    min: [b.min[0], Math.max(b.min[1], lo), b.min[2]],
    max: [b.max[0], Math.min(b.max[1], hi), b.max[2]],
  };
}

/** Radii of a field's horizontal cross-section at height y (along +x and +z), by bisection. */
function ringAt(f: SDF, y: number, maxR: number, cx = 0, cz = 0): [number, number] {
  const solve = (dx: number, dz: number) => {
    let lo = 0;
    let hi = maxR;
    if (f(cx + dx * hi, y, cz + dz * hi) < 0) return hi;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (f(cx + dx * mid, y, cz + dz * mid) < 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return [solve(1, 0), solve(0, 1)];
}

export class GarmentBuilder {
  readonly H: number;
  readonly gap: number;
  readonly base: number;

  constructor(readonly body: BodyField) {
    this.H = body.m.H;
    this.gap = 0.0028 * this.H;
    this.base = 0.0024 * this.H;
  }

  private g(name: GroupName): SDF {
    const b = this.body;
    return (x, y, z) => b.group(name, x, y, z);
  }

  /** The inner layers' solids pushed out by the gap (Infinity when nothing is worn under). */
  private enclose(inner: GarmentField[]): SDF | null {
    if (!inner.length) return null;
    const gap = this.gap;
    return (x, y, z) => {
      let d = Infinity;
      for (const f of inner) {
        d = Math.min(d, f.solid(x, y, z) - gap);
        if (f.trims) d = Math.min(d, f.trims(x, y, z) - gap * 0.6);
      }
      return d;
    };
  }

  /**
   * The garment's solid. `cheap` is a lower bound of `coverage` (its planes, without the sleeve and
   * leg cuts): points already well outside skip the expensive part, keeping the sign right.
   */
  private finish(
    own: SDF,
    coverage: SDF,
    inner: GarmentField[],
    ownBounds: AABB,
    extra: Piece[] = [],
    cheap: SDF = coverage,
  ): GarmentField {
    const enc = this.enclose(inner);
    const far = 0.025;
    const uncut: SDF = enc ? (x, y, z) => Math.min(own(x, y, z), enc(x, y, z)) : own;
    const solid: SDF = (x, y, z) => {
      const d = uncut(x, y, z);
      const r = Math.max(d, cheap(x, y, z));
      if (r > far || cheap === coverage) return r;
      return Math.max(d, coverage(x, y, z));
    };
    const pad = 0.03 * this.H;
    const bounds = {
      min: [ownBounds.min[0] - pad, ownBounds.min[1] - pad, ownBounds.min[2] - pad] as [
        number,
        number,
        number,
      ],
      max: [ownBounds.max[0] + pad, ownBounds.max[1] + pad, ownBounds.max[2] + pad] as [
        number,
        number,
        number,
      ],
    };
    const main: Piece = { role: "main", sdf: uncut, clip: coverage, bounds };
    return {
      pieces: [main, ...extra],
      solid,
      bounds: boundsUnion(bounds, ...extra.map((p) => p.bounds)),
    };
  }

  /** Arm (or leg) exclusion beyond a length along the chain, limited to points that belong to it. */
  private cutBeyond(side: "L" | "R", length: number, reach: number): SDF {
    const b = this.body;
    const chain = b.arms[side];
    return (x, y, z) => {
      const [s, dist] = b.along(chain, x, y, z);
      const belongs = b.sleeve(side, x, y, z) - b.group("torso", x, y, z);
      // remove: beyond the length, near the arm's axis, and closer to the arm than to the torso
      return -Math.max(length - s, dist - reach, belongs);
    };
  }

  /** The neck opening: a hole around the neck above the collar line (lower at the front). */
  private neckHole(collarY: number, rN: number, frontDrop: number): SDF {
    const zc = neckCenterZ(this.body.m);
    return (x, y, z) =>
      -Math.max(
        collarY - frontDrop * Math.max(0, z - zc) - y,
        sdEllipse2(x, z - zc, rN, rN * 0.94),
      );
  }

  // ---------------------------------------------------------------- tops, dresses, jumpsuits

  private upper(opts: {
    fit: Fit;
    sleeve: "none" | "short" | "long";
    hemY: number;
    drape: number;
    flare: number;
    collarDrop: number;
    /** How much lower the neckline sits at the front (per metre forward). */
    frontDrop?: number;
  }) {
    const { m } = this.body;
    const { y, w, H } = m;
    const fs = FIT_SCALE[opts.fit];
    const frontDrop = opts.frontDrop ?? 0.3;
    opts = { ...opts, frontDrop };
    const offT = this.base + fs * w.chest;
    const offA = this.base + fs * m.upperArm.ra * 2.2;
    const collarY = y.neckBase - 0.004 * H - opts.collarDrop;
    // draped hull: hangs from the chest instead of following the waist, flares below the crotch
    const prof = torsoProfile(m);
    const raw: [number, number][] = [];
    if (opts.hemY < y.crotch) {
      raw.push([opts.flare, opts.hemY - 0.01 * H]);
      raw.push([w.hip * 1.03, y.crotch]);
    } else {
      raw.push([radiusAt(prof, opts.hemY - 0.01 * H), opts.hemY - 0.01 * H]);
    }
    // the hull only drapes the body from the chest down; above the chest the garment follows the
    // body (a hull over the shoulders reads as shoulder pads)
    for (const [r, py] of prof) {
      if (py <= Math.max(opts.hemY, y.crotch) + 0.004 * H || py > y.chest) continue;
      raw.push([py < y.hip ? Math.max(r, w.hip) : r, py]);
    }
    raw.push([w.chest * 0.9, y.chest + 0.02 * H]);
    const hullProfile = raw.map(([r, py]): [number, number, number] => {
      const draped = py < y.chest && py > y.hip ? r + (Math.max(w.chest, r) - r) * opts.drape : r;
      return [draped * (1 + fs) + this.base, py, torsoDepth(m, py) * (1 + 0.12 * opts.drape)];
    });
    const hull = lathe(hullProfile, m.depth);
    const torso = this.g("torso");
    const b = this.body;
    const legL = this.g("legL");
    const legR = this.g("legR");
    const long = opts.hemY < y.crotch;
    const k = 0.01 * H;
    const own: SDF = (px, py, pz) => {
      let d = smin(torso(px, py, pz) - offT, sdShape(hull, px, py, pz), 0.012 * H);
      if (opts.sleeve !== "none") {
        d = smin(d, b.sleeve("L", px, py, pz) - offA, k);
        d = smin(d, b.sleeve("R", px, py, pz) - offA, k);
      }
      if (long) d = Math.min(d, legL(px, py, pz) - offT * 0.5, legR(px, py, pz) - offT * 0.5);
      return d;
    };
    const lu = this.body.arms.L.lu;
    const lf = this.body.arms.L.lf;
    const sEnd =
      opts.sleeve === "none"
        ? -0.004 * H
        : opts.sleeve === "short"
          ? lu * (fs >= 0.18 ? 0.8 : 0.5)
          : lu + lf * 0.97;
    const reach = m.forearm.ra + offA + 0.016 * H;
    const cutL = this.cutBeyond("L", sEnd, reach);
    const cutR = this.cutBeyond("R", sEnd, reach);
    const rN = w.neck * 1.2 + this.base * 0.5 + opts.collarDrop * 0.6;
    const neck = this.neckHole(collarY, rN, frontDrop);
    const cheap: SDF = (px, py, pz) => Math.max(opts.hemY - py, neck(px, py, pz));
    const coverage: SDF = (px, py, pz) =>
      Math.max(opts.hemY - py, neck(px, py, pz), cutL(px, py, pz), cutR(px, py, pz));
    const groups: GroupName[] = ["torso", "armL", "armR"];
    if (long) groups.push("legL", "legR");
    const bounds = clipY(
      this.body.bounds(groups, offT + 0.06 * H),
      opts.hemY - 0.02 * H,
      y.neckBase + 0.08 * H,
    );
    return { own, coverage, cheap, bounds, collarY, offA, sEnd, fs, rN, neck, cutL, cutR };
  }

  top(spec: Spec<"top">, { inner }: GarmentOpts): GarmentField {
    const { y, H, w } = this.body.m;
    const rank = inner.length;
    const hemY =
      {
        crop: y.waist + 0.015 * H,
        hip: y.crotch + 0.022 * H,
        thigh: y.crotch - 0.075 * H,
        knee: y.knee + 0.045 * H,
      }[spec.length] -
      rank * 0.002 * H;
    const u = this.upper({
      fit: spec.fit,
      sleeve: spec.sleeve,
      hemY,
      drape: FIT_DRAPE[spec.fit],
      flare: w.hip * (spec.length === "knee" ? 1.3 : 1.14) * (1 + FIT_SCALE[spec.fit]),
      collarDrop: rank * 0.003 * H + (spec.openFront && !spec.hood ? 0.006 * H : 0),
      frontDrop: spec.openFront ? 0.9 : 0.3,
    });
    let own = u.own;
    let coverage = u.coverage;
    let cheap = u.cheap;
    if (spec.hood) {
      const hood = ellipsoid(
        [0, y.neckBase + 0.004 * H, neckCenterZ(this.body.m) - 0.062 * H],
        [0.06 * H, 0.036 * H, 0.04 * H],
      );
      const o = own;
      const c = coverage;
      const ch = cheap;
      own = (px, py, pz) => smin(o(px, py, pz), sdShape(hood, px, py, pz), 0.012 * H);
      coverage = (px, py, pz) => Math.min(c(px, py, pz), sdShape(hood, px, py, pz) - 0.004 * H);
      cheap = (px, py, pz) => Math.min(ch(px, py, pz), sdShape(hood, px, py, pz) - 0.004 * H);
    }
    const field = this.finish(own, coverage, inner, u.bounds, [], cheap);
    const extra: Piece[] = [];
    const solid = field.solid;
    const ribbed = !spec.openFront || spec.hood;
    if (ribbed && spec.length !== "knee") {
      const minor = 0.0042 * H;
      const yb = hemY + minor * 2.2;
      const [a, b] = ringAt(solid, yb, 0.4 * H);
      extra.push(this.bandPiece(yb, a - minor * 0.65, b - minor * 0.65, minor, 2.2));
    }
    if (spec.collar) {
      const minor = 0.0055 * H;
      extra.push(
        this.bandPiece(
          u.collarY + 0.006 * H,
          u.rN + minor * 0.7,
          u.rN * 0.94 + minor * 0.7,
          minor,
          2.2,
          neckCenterZ(this.body.m),
        ),
      );
    }
    if (spec.sleeve === "long" && ribbed) {
      for (const s of [1, -1] as const) extra.push(this.cuffPiece(s, u.sEnd, solid));
    }
    if (spec.openFront) extra.push(this.zipPiece(solid, hemY, u.collarY));
    return extra.length ? this.withExtras(field, extra) : field;
  }

  dress(spec: Spec<"dress">, { inner }: GarmentOpts): GarmentField {
    const { y, H, w } = this.body.m;
    const hemY = { mini: y.crotch - 0.07 * H, knee: y.knee + 0.02 * H, midi: y.knee - 0.1 * H }[
      spec.length
    ];
    const u = this.upper({
      fit: spec.fit,
      sleeve: spec.sleeve,
      hemY,
      drape: 0,
      flare: w.hip * (spec.length === "midi" ? 1.4 : 1.28) * (1 + FIT_SCALE[spec.fit]),
      collarDrop: 0.01 * H + inner.length * 0.003 * H,
    });
    return this.finish(u.own, u.coverage, inner, u.bounds, [], u.cheap);
  }

  jumpsuit(spec: Spec<"jumpsuit">, { inner }: GarmentOpts): GarmentField {
    const { y, H } = this.body.m;
    const u = this.upper({
      fit: spec.fit,
      sleeve: spec.sleeve,
      hemY: y.crotch + 0.02 * H,
      drape: FIT_DRAPE[spec.fit] * 0.5,
      flare: 0,
      collarDrop: 0.008 * H,
    });
    const legs = this.legsShape(spec.fit, "straight", y.ankle + 0.02 * H);
    const own: SDF = (px, py, pz) => Math.min(u.own(px, py, pz), legs.own(px, py, pz));
    const coverage: SDF = (px, py, pz) =>
      Math.max(legs.hemY - py, u.neck(px, py, pz), u.cutL(px, py, pz), u.cutR(px, py, pz));
    const cheap: SDF = (px, py, pz) => Math.max(legs.hemY - py, u.neck(px, py, pz));
    return this.finish(own, coverage, inner, boundsUnion(u.bounds, legs.bounds), [], cheap);
  }

  // ---------------------------------------------------------------- trousers and skirts

  private legsShape(fit: Fit, shape: Spec<"bottom">["shape"], hemY: number) {
    const { m } = this.body;
    const { y, w, H } = m;
    const fs = FIT_SCALE[fit];
    const offT = this.base + fs * w.hip * 0.6;
    const th = m.thigh;
    const legL = this.g("legL");
    const legR = this.g("legR");
    const torso = this.g("torso");
    const hulls: Shape[] = [];
    for (const s of [1, -1] as const) {
      const topY = y.crotch + 0.02 * H;
      const bottomY = hemY - 0.01 * H;
      const top: V3 = [th.a.x * s, topY, legCenterZ(m, topY)];
      const bottom: V3 = [m.shin.b.x * s * 1.05, bottomY, legCenterZ(m, bottomY) + 0.002 * H];
      const rTop = th.ra * (1.02 + fs * 1.4) + this.base;
      const rBottom =
        shape === "wide"
          ? th.ra * (0.8 + fs * 0.8)
          : shape === "tapered"
            ? 0
            : shape === "cargo"
              ? th.rb * (1.16 + fs)
              : th.rb * (1.0 + fs);
      if (rBottom > 0) hulls.push(roundCone(top, bottom, rTop, rBottom + this.base));
      if (shape === "cargo") {
        const py = (y.crotch + y.knee) / 2;
        hulls.push(
          box(
            [s * (th.a.x + th.ra * 0.86), py, legCenterZ(m, py) + 0.004 * H],
            [0.014 * H, 0.04 * H, 0.032 * H],
            0.008 * H,
          ),
        );
      }
    }
    const legOff = (py: number) => {
      const t = Math.min(1, Math.max(0, (y.crotch - py) / (y.crotch - y.ankle)));
      const taper = shape === "tapered" ? 1 - t * 0.7 : 1;
      return this.base + fs * th.ra * 1.6 * taper;
    };
    const own: SDF = (px, py, pz) => {
      const lo = legOff(py);
      let d = Math.min(torso(px, py, pz) - offT, legL(px, py, pz) - lo, legR(px, py, pz) - lo);
      for (const hshape of hulls) d = Math.min(d, sdShape(hshape, px, py, pz));
      return d;
    };
    const bounds = clipY(
      this.body.bounds(["torso", "legL", "legR"], 0.08 * H),
      hemY - 0.02 * H,
      y.waist + 0.02 * H,
    );
    return { own, bounds, hemY, offT };
  }

  bottom(spec: Spec<"bottom">, { inner }: GarmentOpts): GarmentField {
    const { y, H } = this.body.m;
    const rank = inner.length;
    const hemY = {
      full: y.ankle + 0.012 * H,
      knee: y.knee - 0.03 * H,
      short: y.crotch - 0.09 * H,
    }[spec.length];
    const waistY = y.hip + 0.55 * (y.waist - y.hip) + rank * 0.002 * H;
    const legs = this.legsShape(spec.fit, spec.shape, hemY);
    const coverage: SDF = (px, py) => Math.max(py - waistY, hemY - py);
    const field = this.finish(
      legs.own,
      coverage,
      inner,
      clipY(legs.bounds, hemY - 0.02 * H, waistY + 0.02 * H),
    );
    const yb = waistY - 0.011 * H;
    const [a, b] = ringAt(field.solid, yb, 0.4 * H);
    return this.withExtras(field, [this.bandPiece(yb, a, b, 0.0045 * H, 2.4)]);
  }

  skirt(spec: Spec<"skirt">, { inner }: GarmentOpts): GarmentField {
    const { m } = this.body;
    const { y, w, H } = m;
    const fs = FIT_SCALE[spec.fit];
    const hemY = { mini: y.crotch - 0.06 * H, knee: y.knee + 0.01 * H, midi: y.knee - 0.1 * H }[
      spec.length
    ];
    const waistY = y.hip + 0.6 * (y.waist - y.hip);
    const prof = torsoProfile(m);
    const flare =
      w.hip * (spec.length === "midi" ? 1.38 : spec.length === "knee" ? 1.26 : 1.16) * (1 + fs);
    const hull = lathe(
      [
        [radiusAt(prof, waistY) * (1 + fs * 0.4) + this.base, waistY + 0.01 * H],
        [w.hip * (1.02 + fs) + this.base, y.hip],
        [w.hip * (1.04 + fs) + this.base, y.crotch],
        [flare + this.base, hemY - 0.01 * H],
      ],
      m.depth * 1.08,
    );
    const torso = this.g("torso");
    const legL = this.g("legL");
    const legR = this.g("legR");
    const off = this.base + fs * w.hip * 0.5;
    const own: SDF = (px, py, pz) =>
      Math.min(
        sdShape(hull, px, py, pz),
        torso(px, py, pz) - off,
        legL(px, py, pz) - off,
        legR(px, py, pz) - off,
      );
    const coverage: SDF = (px, py) => Math.max(py - waistY, hemY - py);
    const bounds = clipY(
      this.body.bounds(["torso", "legL", "legR"], flare),
      hemY - 0.02 * H,
      waistY + 0.02 * H,
    );
    const field = this.finish(own, coverage, inner, bounds);
    const yb = waistY - 0.011 * H;
    const [a, b] = ringAt(field.solid, yb, 0.4 * H);
    return this.withExtras(field, [this.bandPiece(yb, a, b, 0.0045 * H, 2.4)]);
  }

  // ---------------------------------------------------------------- shoes, hats, hair

  footwear(spec: Spec<"footwear">): GarmentField {
    const { m } = this.body;
    const { y, H } = m;
    const f = m.foot;
    const topY = {
      low: y.ankle + 0.02 * H,
      high: y.ankle + 0.06 * H,
      boot: y.ankle + 0.11 * H,
      sandal: y.ankle + 0.012 * H,
      dress: y.ankle + 0.012 * H,
    }[spec.style];
    const off =
      spec.style === "boot" ? 0.0075 * H : spec.style === "dress" ? 0.0035 * H : 0.0055 * H;
    const soleH = {
      low: 0.017 * H,
      high: 0.019 * H,
      boot: 0.022 * H,
      sandal: 0.012 * H,
      dress: 0.009 * H,
    }[spec.style];
    const legL = this.g("legL");
    const legR = this.g("legR");
    const straps = spec.style === "sandal";
    const strapZ = [f.center.z + f.length * 0.22, f.center.z - f.length * 0.05];
    const own: SDF = (px, py, pz) => {
      const d = Math.min(legL(px, py, pz), legR(px, py, pz)) - off;
      if (!straps) return d;
      let s = Infinity;
      for (const zc of strapZ) s = Math.min(s, Math.abs(pz - zc) - 0.009 * H);
      s = Math.min(s, Math.abs(py - (y.ankle + 0.004 * H)) - 0.006 * H);
      return Math.max(d, s);
    };
    const coverage: SDF = (_px, py) => py - topY;
    const bounds = clipY(this.body.bounds(["legL", "legR"], 0.02 * H), -0.02 * H, topY + 0.02 * H);
    const field = this.finish(own, coverage, [], bounds);
    // soles: the shoe's own outline, a little wider, in a slab under the foot
    const soleOff = off + 0.0028 * H;
    const soleTop = 0.45 * soleH;
    const floor = -0.004 * H;
    const soles: Piece[] = [1, -1].map((s) => {
      const leg = s === 1 ? legL : legR;
      const pad = 0.012 * H;
      const c = f.center;
      return {
        role: "trim" as const,
        sdf: (px: number, py: number, pz: number) =>
          Math.max(leg(px, py, pz) - soleOff, py - soleTop, floor - py),
        bounds: {
          min: [c.x * s - f.width / 2 - pad, floor - 0.004 * H, c.z - f.length / 2 - pad],
          max: [c.x * s + f.width / 2 + pad, soleTop + 0.004 * H, c.z + f.length / 2 + pad],
        },
        groups: [s === 1 ? "legL" : "legR"] as GroupName[],
        spacing: 0.004 * H,
      };
    });
    field.pieces[0]!.groups = ["legL", "legR"];
    return this.withExtras(field, soles);
  }

  /** Hair: a rigid shell on the head bone. */
  hair(style: HairStyle): GarmentField | null {
    if (style === "none") return null;
    const { m } = this.body;
    const { y, H, headR: R } = m;
    const cranium = this.body.groups.head.parts[1]!.shape;
    const off = 0.0045 * H;
    const extras: Shape[] = [];
    if (style === "bun")
      extras.push(ellipsoid([0, y.head + 0.78 * R, -0.6 * R], [0.4 * R, 0.38 * R, 0.4 * R]));
    if (style === "long")
      extras.push(
        roundCone(
          [0, y.head + 0.05 * R, -0.42 * R],
          [0, y.shoulder - 0.035 * H, -0.5 * R],
          0.84 * R,
          0.66 * R,
        ),
      );
    const own: SDF = (px, py, pz) => {
      let d = sdShape(cranium, px, py, pz) - off;
      for (const e of extras) d = smin(d, sdShape(e, px, py, pz), 0.12 * R);
      return d;
    };
    const hairline = (pz: number) => y.head + 0.075 * R + 0.375 * pz;
    const coverage: SDF =
      style === "long"
        ? (px, py, pz) =>
            Math.min(hairline(pz) - py, Math.max(pz + 0.05 * R, py - (y.head + 0.2 * R)))
        : (_px, py, pz) => hairline(pz) - py;
    const bounds: AABB = {
      min: [-1.3 * R, style === "long" ? y.shoulder - 0.06 * H : y.head - 0.9 * R, -1.6 * R],
      max: [1.3 * R, y.head + 1.4 * R, 1.3 * R],
    };
    const field = this.finish(own, coverage, [], bounds);
    field.pieces.forEach((p) => (p.bone = "head"));
    return field;
  }

  headwear(spec: Spec<"headwear">, { inner }: GarmentOpts): GarmentField {
    const { m } = this.body;
    const { y, H, headR: R } = m;
    const cranium = this.body.groups.head.parts[1]!.shape;
    const off = 0.006 * H;
    const shapes: { s: Shape; k?: number }[] = [];
    let cutY = y.head + 0.12 * R;
    let allow: Shape | null = null;
    if (spec.style === "beanie") {
      shapes.push({ s: ellipsoid([0, y.head + 0.1 * R, 0], [0.86 * R, 1.02 * R, 0.95 * R]) });
    } else if (spec.style === "cap") {
      cutY = y.head + 0.3 * R;
      const brim = ellipsoid([0, cutY + 0.01 * R, 0.78 * R], [0.7 * R, 0.035 * R, 0.62 * R]);
      shapes.push({ s: brim, k: 0.06 * R });
      allow = brim;
    } else {
      cutY = y.head + 0.26 * R;
      shapes.push({
        s: lathe(
          [
            [1.0 * R, cutY],
            [0.94 * R, y.head + 1.12 * R],
          ],
          0.92,
        ),
      });
      const brim = ellipsoid([0, cutY + 0.02 * R, 0], [1.85 * R, 0.032 * R, 1.75 * R]);
      shapes.push({ s: brim, k: 0.08 * R });
      allow = brim;
    }
    const own: SDF = (px, py, pz) => {
      let d = sdShape(cranium, px, py, pz) - off;
      for (const { s, k } of shapes) d = smin(d, sdShape(s, px, py, pz), k ?? 0.05 * R);
      return d;
    };
    const coverage: SDF = allow
      ? (px, py, pz) => Math.min(cutY - py, sdShape(allow!, px, py, pz) - 0.002 * H)
      : (_px, py) => cutY - py;
    const reach = spec.style === "hat" ? 2 * R : 1.3 * R;
    const bounds: AABB = {
      min: [-reach, cutY - 0.1 * R, -reach],
      max: [reach, y.head + 1.3 * R, reach],
    };
    const field = this.finish(own, coverage, inner, bounds);
    field.pieces.forEach((p) => (p.bone = "head"));
    const extra: Piece[] = [];
    if (spec.style !== "cap") {
      const yb = spec.style === "beanie" ? cutY + 0.05 * R : cutY + 0.14 * R;
      const [a, b] = ringAt(field.solid, yb, 2 * R);
      const p = this.bandPiece(
        yb,
        a,
        b,
        spec.style === "beanie" ? 0.012 * R * 4 : 0.03 * R,
        spec.style === "beanie" ? 1.6 : 2.5,
      );
      p.bone = "head";
      extra.push(p);
    }
    return extra.length ? this.withExtras(field, extra) : field;
  }

  /** A belt at the trousers' waistband, outside whatever is worn there. */
  belt({ inner }: GarmentOpts): GarmentField {
    const { y, H } = this.body.m;
    const yb = y.hip + 0.55 * (y.waist - y.hip) - 0.011 * H;
    const b = this.body;
    const under: SDF = inner.length
      ? (px, py, pz) => {
          let d = Infinity;
          for (const f of inner) d = Math.min(d, f.solid(px, py, pz));
          return d;
        }
      : (px, py, pz) => b.eval(px, py, pz) - this.base;
    const [ra, rb] = ringAt(under, yb, 0.4 * H);
    const minor = 0.0042 * H;
    const strap = band(yb, ra + minor * 0.6, rb + minor * 0.6, minor, 2.6);
    const buckle = box([0, yb, rb + minor * 1.4], [0.016 * H, 0.012 * H, 0.0035 * H], 0.002 * H);
    const strapSdf: SDF = (px, py, pz) => sdShape(strap, px, py, pz);
    const buckleSdf: SDF = (px, py, pz) => sdShape(buckle, px, py, pz);
    const pad = 0.02 * H;
    const main: Piece = {
      role: "main",
      sdf: strapSdf,
      bounds: { min: [-ra - pad, yb - pad, -rb - pad], max: [ra + pad, yb + pad, rb + pad] },
      groups: ["torso"],
    };
    const trim: Piece = {
      role: "trim",
      sdf: buckleSdf,
      bounds: { min: [-0.03 * H, yb - pad, rb - pad], max: [0.03 * H, yb + pad, rb + 0.03 * H] },
      groups: ["torso"],
    };
    return {
      pieces: [main, trim],
      solid: union([strapSdf, buckleSdf]),
      bounds: boundsUnion(main.bounds, trim.bounds),
    };
  }

  // ---------------------------------------------------------------- trims

  private bandPiece(yc: number, a: number, b: number, minor: number, tall: number, cz = 0): Piece {
    const t = band(yc, a, b, minor, tall, 0, cz);
    return {
      role: "trim",
      spacing: minor * 0.55,
      sdf: (px, py, pz) => sdShape(t, px, py, pz),
      bounds: {
        min: [-a - minor * 2, yc - minor * tall * 2, cz - b - minor * 2],
        max: [a + minor * 2, yc + minor * tall * 2, cz + b + minor * 2],
      },
    };
  }

  private cuffPiece(s: 1 | -1, sEnd: number, sleeve: SDF): Piece {
    const fa = this.body.m.forearm;
    const lu = this.body.arms.L.lu;
    const lf = this.body.arms.L.lf;
    const t1 = Math.min(1, (sEnd - lu) / lf) - 0.004;
    const t0 = Math.max(0, t1 - (0.02 * this.H) / lf);
    const p0 = fa.a.clone().lerp(fa.b, t0);
    const p1 = fa.a.clone().lerp(fa.b, t1);
    const reach = (p: { x: number; y: number; z: number }) => {
      // the sleeve's radius here, measured toward the camera (+z) from the arm's axis
      let lo = 0;
      let hi = 0.1 * this.H;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (sleeve(p.x * s, p.y, p.z + mid) < 0) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const r0 = reach(p0) + 0.0006 * this.H;
    const r1 = reach(p1) + 0.0006 * this.H;
    const c = roundCone([p0.x * s, p0.y, p0.z], [p1.x * s, p1.y, p1.z], r0, r1);
    const b = emptyBox();
    growBox(b, p0.x * s, p0.y, p0.z, r0 + 0.01);
    growBox(b, p1.x * s, p1.y, p1.z, r1 + 0.01);
    return {
      role: "trim",
      sdf: (px, py, pz) => sdShape(c, px, py, pz),
      bounds: b,
      groups: [s === 1 ? "armL" : "armR"],
      spacing: 0.0035 * this.H,
    };
  }

  private zipPiece(solid: SDF, hemY: number, collarY: number): Piece {
    const H = this.H;
    const steps = 9;
    const pts: V3[] = [];
    for (let i = 0; i <= steps; i++) {
      const py = hemY + 0.006 * H + ((collarY - hemY - 0.01 * H) * i) / steps;
      const [, zr] = ringAt(solid, py, 0.3 * H);
      pts.push([0, py, zr + 0.0003 * H]);
    }
    const r = 0.0017 * H;
    const cones = pts.slice(1).map((p, i) => roundCone(pts[i]!, p, r, r));
    const b = emptyBox();
    for (const p of pts) growBox(b, p[0], p[1], p[2], r + 0.01);
    return {
      role: "trim",
      sdf: (px, py, pz) => {
        let d = Infinity;
        for (const c of cones) d = Math.min(d, sdShape(c, px, py, pz));
        return d;
      },
      bounds: b,
      groups: ["torso"],
      spacing: r * 0.8,
    };
  }

  /** Adds trims. They sit within the gap to the next layer, so later layers enclose only the main solid. */
  private withExtras(field: GarmentField, extra: Piece[]): GarmentField {
    const pieces = [...field.pieces, ...extra];
    const trims = union([...(field.trims ? [field.trims] : []), ...extra.map((p) => p.sdf)]);
    return {
      pieces,
      solid: field.solid,
      trims,
      bounds: boundsUnion(field.bounds, ...extra.map((p) => p.bounds)),
    };
  }
}
