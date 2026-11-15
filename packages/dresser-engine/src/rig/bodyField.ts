/**
 * The avatar's body as a distance field: six groups of primitives (torso, head, two arms, two legs),
 * blended with smooth minimums into one continuous surface. Each primitive knows which bone moves it,
 * so the same field gives the mesh and its skin weights. Garments are built from the same groups.
 */
import { torsoProfile3, type BodyModel } from "../body";
import { BONE } from "./skeleton";
import {
  coneT,
  ellipsoid,
  lathe,
  roundCone,
  sdShape,
  shapeBounds,
  smin,
  type AABB,
  type RoundCone,
  type Shape,
  type V3,
} from "./sdf";

export type GroupName = "torso" | "head" | "armL" | "armR" | "legL" | "legR";
export const GROUPS: readonly GroupName[] = ["torso", "head", "armL", "armR", "legL", "legR"];
const GROUP_INDEX: Record<GroupName, number> = {
  torso: 0,
  head: 1,
  armL: 2,
  armR: 3,
  legL: 4,
  legR: 5,
};

export type BoneWeights = (
  x: number,
  y: number,
  z: number,
  out: Map<number, number>,
  w: number,
) => void;

export interface Part {
  shape: Shape;
  bones: BoneWeights;
}

export interface Group {
  name: GroupName;
  parts: Part[];
  k: number;
}

const fixed =
  (bone: number): BoneWeights =>
  (_x, _y, _z, out, w) => {
    out.set(bone, (out.get(bone) ?? 0) + w);
  };

const ramp = (v: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const v3 = (x: number, y: number, z: number): V3 => [x, y, z];

export interface ArmChain {
  upper: RoundCone;
  fore: RoundCone;
  /** Lengths of the two segments. */
  lu: number;
  lf: number;
}

export class BodyField {
  readonly groups: Record<GroupName, Group>;
  readonly arms: { L: ArmChain; R: ArmChain };
  readonly legs: { L: ArmChain; R: ArmChain };
  /** Blend radius where the arms, legs and neck meet the torso. */
  readonly junction: Record<GroupName, number>;
  readonly torsoLathe: ReturnType<typeof lathe>;

  constructor(readonly m: BodyModel) {
    const { y, w, H, headR } = m;
    this.torsoLathe = lathe(torsoProfile3(m), m.depth);
    const torsoBones: BoneWeights = (x, py, _z, out, wt) => {
      const t1 = ramp(py, y.hip, y.waist);
      const t2 = ramp(py, y.waist + 0.01 * H, y.chest);
      const add = (b: number, v: number) => v > 0 && out.set(b, (out.get(b) ?? 0) + v * wt);
      add(BONE.hips, 1 - t1);
      add(BONE.spine, t1 * (1 - t2));
      const chest = t2;
      const c =
        ramp(py, y.chest + 0.02 * H, y.shoulder) *
        ramp(Math.abs(x), w.neck * 1.3, w.shoulder * 0.75);
      add(BONE.chest, chest * (1 - c * 0.85));
      add(x >= 0 ? BONE["clavicle.L"] : BONE["clavicle.R"], chest * c * 0.85);
    };
    const torso: Part[] = [{ shape: this.torsoLathe, bones: torsoBones }];
    for (const s of [1, -1] as const) {
      // glutes and a soft chest, so the torso reads as a body rather than a vase
      torso.push({
        shape: ellipsoid(
          v3(s * w.hip * 0.44, y.hip - 0.012 * H, -w.hip * 0.3),
          v3(0.05 * H, 0.056 * H, 0.04 * H),
        ),
        bones: fixed(BONE.hips),
      });
      torso.push({
        shape: ellipsoid(
          v3(s * w.chest * 0.42, y.chest + 0.006 * H, w.chest * m.depth * 0.5),
          v3(0.042 * H, 0.032 * H, 0.028 * H),
        ),
        bones: fixed(BONE.chest),
      });
    }

    const head: Part[] = [
      {
        shape: roundCone(
          v3(0, y.neckBase - 0.02 * H, -0.004 * H),
          v3(0, y.neckTop + 0.012 * H, 0.003 * H),
          w.neck * 1.12,
          w.neck * 0.98,
        ),
        bones: (x, py, z, out, wt) => {
          const t = ramp(py, y.neckBase, y.neckTop + 0.01 * H);
          out.set(BONE.neck, (out.get(BONE.neck) ?? 0) + wt * (1 - t * 0.6));
          out.set(BONE.head, (out.get(BONE.head) ?? 0) + wt * t * 0.6);
        },
      },
      {
        shape: ellipsoid(
          v3(0, y.head + 0.004 * H, 0.004 * H),
          v3(headR * 0.82, headR * 0.98, headR * 0.92),
        ),
        bones: fixed(BONE.head),
      },
      {
        shape: ellipsoid(
          v3(0, y.head - headR * 0.42, headR * 0.2),
          v3(headR * 0.6, headR * 0.56, headR * 0.68),
        ),
        bones: fixed(BONE.head),
      },
      {
        shape: ellipsoid(
          v3(0, y.head - headR * 0.14, headR * 0.86),
          v3(headR * 0.11, headR * 0.2, headR * 0.14),
        ),
        bones: fixed(BONE.head),
      },
    ];
    for (const s of [1, -1] as const) {
      head.push({
        shape: ellipsoid(
          v3(s * headR * 0.8, y.head - headR * 0.06, -headR * 0.02),
          v3(headR * 0.09, headR * 0.21, headR * 0.13),
        ),
        bones: fixed(BONE.head),
      });
    }

    const arm = (s: 1 | -1): { parts: Part[]; chain: ArmChain } => {
      const X = (v: { x: number; y: number; z: number }): V3 => [v.x * s, v.y, v.z];
      const k = s === 1 ? "L" : "R";
      const up = m.upperArm;
      const fa = m.forearm;
      const upper = roundCone(X(up.a), X(up.b), up.ra, up.rb);
      const fore = roundCone(X(fa.a), X(fa.b), fa.ra, fa.rb);
      const dx = (fa.b.x - fa.a.x) * s;
      const dy = fa.b.y - fa.a.y;
      const dl = Math.hypot(dx, dy);
      const dir: V3 = [dx / dl, dy / dl, 0];
      // palm faces the thigh: local x is across the palm, y along the hand, z its width
      const basis: [V3, V3, V3] = [[dir[1], -dir[0], 0], dir, [0, 0, 1]];
      const wrist = X(fa.b);
      const handC: V3 = [wrist[0] + dir[0] * 0.05 * H, wrist[1] + dir[1] * 0.05 * H, 0.002 * H];
      const parts: Part[] = [
        {
          shape: ellipsoid(
            [up.a.x * s + s * 0.004 * H, up.a.y + 0.002 * H, 0],
            [up.ra * 1.18, up.ra * 1.3, up.ra * 1.12],
          ),
          bones: fixed(BONE[`upperArm.${k}`]),
        },
        { shape: upper, bones: fixed(BONE[`upperArm.${k}`]) },
        { shape: fore, bones: fixed(BONE[`forearm.${k}`]) },
        {
          shape: ellipsoid(handC, [0.0125 * H, 0.05 * H, 0.025 * H], basis),
          bones: fixed(BONE[`hand.${k}`]),
        },
        {
          shape: roundCone(
            [wrist[0] + dir[0] * 0.016 * H, wrist[1] + dir[1] * 0.016 * H, 0.016 * H],
            [wrist[0] + dir[0] * 0.056 * H, wrist[1] + dir[1] * 0.056 * H, 0.026 * H],
            0.0085 * H,
            0.0062 * H,
          ),
          bones: fixed(BONE[`hand.${k}`]),
        },
      ];
      return {
        parts,
        chain: { upper, fore, lu: up.a.distanceTo(up.b), lf: fa.a.distanceTo(fa.b) },
      };
    };

    const leg = (s: 1 | -1): { parts: Part[]; chain: ArmChain } => {
      const X = (v: { x: number; y: number; z: number }): V3 => [v.x * s, v.y, v.z];
      const k = s === 1 ? "L" : "R";
      const th = m.thigh;
      const sh = m.shin;
      const thigh = roundCone(X(th.a), X(th.b), th.ra, th.rb);
      const shin = roundCone(X(sh.a), X(sh.b), sh.ra, sh.rb);
      const f = m.foot;
      const calfC = sh.a.clone().lerp(sh.b, 0.3);
      const parts: Part[] = [
        { shape: thigh, bones: fixed(BONE[`thigh.${k}`]) },
        { shape: shin, bones: fixed(BONE[`shin.${k}`]) },
        {
          shape: ellipsoid(
            [calfC.x * s, calfC.y, calfC.z - 0.012 * H],
            [sh.ra * 1.02, 0.07 * H, sh.ra * 0.92],
          ),
          bones: fixed(BONE[`shin.${k}`]),
        },
        {
          shape: ellipsoid(
            [f.center.x * s, f.height * 0.5, f.center.z],
            [f.width * 0.5, f.height * 0.5, f.length * 0.5],
          ),
          bones: fixed(BONE[`foot.${k}`]),
        },
        {
          shape: ellipsoid(
            [sh.b.x * s, f.height * 0.5, sh.b.z - 0.012 * H],
            [f.width * 0.46, f.height * 0.52, 0.03 * H],
          ),
          bones: fixed(BONE[`foot.${k}`]),
        },
      ];
      return {
        parts,
        chain: { upper: thigh, fore: shin, lu: th.a.distanceTo(th.b), lf: sh.a.distanceTo(sh.b) },
      };
    };

    const aL = arm(1);
    const aR = arm(-1);
    const lL = leg(1);
    const lR = leg(-1);
    this.arms = { L: aL.chain, R: aR.chain };
    this.legs = { L: lL.chain, R: lR.chain };
    this.groups = {
      torso: { name: "torso", parts: torso, k: 0.022 * H },
      head: { name: "head", parts: head, k: 0.012 * H },
      armL: { name: "armL", parts: aL.parts, k: 0.012 * H },
      armR: { name: "armR", parts: aR.parts, k: 0.012 * H },
      legL: { name: "legL", parts: lL.parts, k: 0.014 * H },
      legR: { name: "legR", parts: lR.parts, k: 0.014 * H },
    };
    this.junction = {
      torso: 0,
      head: 0.016 * H,
      armL: 0.011 * H,
      armR: 0.011 * H,
      legL: 0.02 * H,
      legR: 0.02 * H,
    };
  }

  // one point's group distances, reused while the same point is asked again (garment layers
  // evaluate the same groups several times per point)
  private cx = NaN;
  private cy = NaN;
  private cz = NaN;
  private readonly cache = new Float64Array(8);
  private readonly have = new Uint8Array(8);

  group(name: GroupName, x: number, y: number, z: number): number {
    if (x !== this.cx || y !== this.cy || z !== this.cz) {
      this.cx = x;
      this.cy = y;
      this.cz = z;
      this.have.fill(0);
    }
    const gi = GROUP_INDEX[name];
    if (this.have[gi]) return this.cache[gi]!;
    const g = this.groups[name];
    let d = Infinity;
    for (const p of g.parts) d = smin(d, sdShape(p.shape, x, y, z), g.k);
    this.cache[gi] = d;
    this.have[gi] = 1;
    return d;
  }

  /** An arm without its hand (sleeves are built from this, so a cut sleeve leaves the hand bare). */
  sleeve(side: "L" | "R", x: number, y: number, z: number): number {
    if (x !== this.cx || y !== this.cy || z !== this.cz) {
      this.cx = x;
      this.cy = y;
      this.cz = z;
      this.have.fill(0);
    }
    const gi = side === "L" ? 6 : 7;
    if (this.have[gi]) return this.cache[gi]!;
    const g = this.groups[side === "L" ? "armL" : "armR"];
    let d = Infinity;
    for (let i = 0; i < 3; i++) d = smin(d, sdShape(g.parts[i]!.shape, x, y, z), g.k);
    this.cache[gi] = d;
    this.have[gi] = 1;
    return d;
  }

  /** The whole body. */
  eval(x: number, y: number, z: number): number {
    let d = this.group("torso", x, y, z);
    for (const n of GROUPS) {
      if (n === "torso") continue;
      d = smin(d, this.group(n, x, y, z), this.junction[n]);
    }
    return d;
  }

  bounds(names: readonly GroupName[] = GROUPS, pad = 0): AABB {
    const b: AABB = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const n of names) for (const p of this.groups[n].parts) shapeBounds(p.shape, pad, b);
    return b;
  }

  /**
   * Skin weights at a point: the nearest groups and parts share the point by distance (soft
   * nearest), each part hands its share to its bones. At most four bones, normalised.
   */
  weights(
    x: number,
    y: number,
    z: number,
    tau = 0.008 * this.m.H,
    skipHands = false,
  ): { index: number[]; weight: number[] } {
    return topFour(this.weightMap(x, y, z, tau, skipHands));
  }

  /** Unnormalised bone shares at a point (see `weights`). `skipHands` leaves the hands out (garments). */
  weightMap(
    x: number,
    y: number,
    z: number,
    tau = 0.008 * this.m.H,
    skipHands = false,
  ): Map<number, number> {
    const tauPart = tau * 0.75;
    const gd: number[] = [];
    let gmin = Infinity;
    for (const n of GROUPS) {
      const d =
        skipHands && n === "armL"
          ? this.sleeve("L", x, y, z)
          : skipHands && n === "armR"
            ? this.sleeve("R", x, y, z)
            : this.group(n, x, y, z);
      gd.push(d);
      gmin = Math.min(gmin, d);
    }
    const out = new Map<number, number>();
    const { y: Y, H } = this.m;
    // legs move nothing above the hip joints (the pelvis carries the hips, so a hem at the hips
    // doesn't swing with a stride)
    const legShare = 1 - ramp(y, Y.crotch + 0.012 * H, Y.hip + 0.012 * H);
    GROUPS.forEach((n, gi) => {
      const rel = gd[gi]! - gmin;
      if (rel > 5 * tau) return;
      const isLeg = n === "legL" || n === "legR";
      if (isLeg && legShare <= 0) return;
      const gw = Math.exp(-rel / tau) * (isLeg ? legShare : 1);
      const all = this.groups[n].parts;
      const parts = skipHands && (n === "armL" || n === "armR") ? all.slice(0, 3) : all;
      const pd = parts.map((p) => sdShape(p.shape, x, y, z));
      const pmin = Math.min(...pd);
      let sum = 0;
      const pw = pd.map((d) => {
        const r = d - pmin;
        const v = r > 5 * tauPart ? 0 : Math.exp(-r / tauPart);
        sum += v;
        return v;
      });
      parts.forEach((p, i) => {
        if (pw[i]! > 0) p.bones(x, y, z, out, (gw * pw[i]!) / sum);
      });
    });
    return out;
  }

  /**
   * Distance along an arm or leg from its root joint to the closest point of the chain, in metres
   * (upper segment, then lower). Used to end sleeves and trouser legs at a given length.
   */
  along(chain: ArmChain, x: number, y: number, z: number): [number, number] {
    const tu = coneT(chain.upper, x, y, z);
    const tf = coneT(chain.fore, x, y, z);
    const du = distToSeg(chain.upper, tu, x, y, z);
    const df = distToSeg(chain.fore, tf, x, y, z);
    return du <= df ? [tu * chain.lu, du] : [chain.lu + tf * chain.lf, df];
  }
}

function distToSeg(c: RoundCone, t: number, x: number, y: number, z: number): number {
  const px = c.a[0] + c.bax * t - x;
  const py = c.a[1] + c.bay * t - y;
  const pz = c.a[2] + c.baz * t - z;
  return Math.sqrt(px * px + py * py + pz * pz);
}

/** The four largest shares, normalised (hips when there are none). */
export function topFour(map: Map<number, number>): { index: number[]; weight: number[] } {
  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = top.reduce((s, [, v]) => s + v, 0) || 1;
  const index = [0, 0, 0, 0];
  const weight = [0, 0, 0, 0];
  top.forEach(([b, v], i) => {
    index[i] = b;
    weight[i] = v / total;
  });
  if (top.length === 0) {
    index[0] = BONE.hips;
    weight[0] = 1;
  }
  return { index, weight };
}
