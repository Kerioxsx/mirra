/**
 * Measures the downloaded avatar (after the body sliders) into the dresser's body model: joint
 * positions, landmark heights and widths, and a proxy of its surface for the garments to be built
 * around. The proxy encloses the mesh with a small margin:
 *
 * - torso and head: star-shaped cross-sections sliced from the mesh's own triangles every ~1 cm;
 * - arms and legs: chains of round cones, each sphere as big as the mesh around it;
 * - feet: cross-sections along the foot; hands: an ellipsoid.
 *
 * Measurements are taken on the figure's left (+x) with the right side mirrored onto it, so the
 * model is exactly symmetric, as the garment builder assumes.
 */
import { Vector3 } from "three";
import type { BodyModel, BodyProxy, LimbProxy, Limb } from "../body";
import { BONE, BONE_NAMES, type BoneName } from "../rig/skeleton";
import { ellipsoid, roundCone, type Ellipsoid, type Shape, type Star, type V3 } from "../rig/sdf";
import { meshOf } from "./asset";
import type { MorphedAvatar } from "./morph";

type Group = "torso" | "head" | "arm" | "hand" | "leg";

const ARM_BONES = new Set<number>(
  (["upperArm", "forearm"] as const).flatMap((b) => [BONE[`${b}.L`], BONE[`${b}.R`]]),
);
const HAND_BONES = new Set<number>([BONE["hand.L"], BONE["hand.R"]]);
const HEAD_BONES = new Set<number>([BONE.neck, BONE.head]);
const LEG_BONES = new Set<number>(
  (["thigh", "shin", "foot"] as const).flatMap((b) => [BONE[`${b}.L`], BONE[`${b}.R`]]),
);
const FOOT_BONES = new Set<number>([BONE["foot.L"], BONE["foot.R"]]);

/** Distance-field margin over the mesh, metres (keeps skin out of the garments' fabric). */
const PAD = 0.0025;

interface Body {
  pos: Float32Array;
  index: Uint16Array | Uint32Array;
  dominant: Uint8Array;
  n: number;
}

function dominantBones(joints: Uint8Array, weights: Float32Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (weights[v * 4 + k]! > weights[v * 4 + best]!) best = k;
    out[v] = joints[v * 4 + best]!;
  }
  return out;
}

/**
 * Star sections of a set of triangles: at each level along the axis, the section's centre and its
 * outermost radius at `m` angles, found by slicing the triangles and casting rays from the centre.
 */
export function starFromTriangles(opts: {
  pos: Float32Array;
  tris: number[];
  axis: 1 | 2;
  a0: number;
  a1: number;
  da: number;
  m: number;
  /** Fixed section centre along x (0 for the torso and head); else the section's own middle. */
  cu?: number;
  /** Make the sections mirror-symmetric in x (torso and head). */
  symmetric?: boolean;
  pad?: number;
  /** Round off a free end ("start" is the low end of the axis). */
  taper?: "none" | "start" | "end" | "both";
}): Star {
  const { pos, tris, axis, da, m } = opts;
  let a0 = opts.a0;
  let n = Math.max(2, Math.round((opts.a1 - a0) / da) + 1);
  const ax = axis; // coordinate index of the axis
  const vi = axis === 1 ? 2 : 1; // section's second coordinate
  const levels: number[][] = Array.from({ length: n }, () => []);
  // slice: every triangle crossing a level contributes a segment (u0, v0, u1, v1)
  for (let t = 0; t < tris.length; t += 3) {
    const ia = tris[t]! * 3;
    const ib = tris[t + 1]! * 3;
    const ic = tris[t + 2]! * 3;
    const aa = pos[ia + ax]!;
    const ab = pos[ib + ax]!;
    const ac = pos[ic + ax]!;
    const lo = Math.max(0, Math.ceil((Math.min(aa, ab, ac) - a0) / da));
    const hi = Math.min(n - 1, Math.floor((Math.max(aa, ab, ac) - a0) / da));
    for (let i = lo; i <= hi; i++) {
      const lv = a0 + i * da;
      const pts: number[] = [];
      const edge = (p: number, q: number) => {
        const ap = pos[p + ax]!;
        const aq = pos[q + ax]!;
        if ((ap - lv) * (aq - lv) > 0 || ap === aq) return;
        const f = (lv - ap) / (aq - ap);
        pts.push(
          pos[p]! + (pos[q]! - pos[p]!) * f,
          pos[p + vi]! + (pos[q + vi]! - pos[p + vi]!) * f,
        );
      };
      edge(ia, ib);
      edge(ib, ic);
      edge(ic, ia);
      if (pts.length >= 4) levels[i]!.push(pts[0]!, pts[1]!, pts[2]!, pts[3]!);
    }
  }
  // each level's section, made convex (fabric bridges hollows: cleavage, the small of the back);
  // levels past the mesh's ends are dropped
  let hulls = levels.map((seg) => convexHull(seg));
  let first = 0;
  while (first < n - 2 && hulls[first]!.length < 6) first++;
  let last = n - 1;
  while (last > first + 1 && hulls[last]!.length < 6) last--;
  hulls = hulls.slice(first, last + 1);
  a0 += first * da;
  n = hulls.length;
  const cu = new Float64Array(n);
  const cv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = hulls[i]!;
    if (h.length < 6) {
      cu[i] = NaN;
      cv[i] = NaN;
      continue;
    }
    let umin = Infinity;
    let umax = -Infinity;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let k = 0; k < h.length; k += 2) {
      umin = Math.min(umin, h[k]!);
      umax = Math.max(umax, h[k]!);
      vmin = Math.min(vmin, h[k + 1]!);
      vmax = Math.max(vmax, h[k + 1]!);
    }
    cu[i] = opts.cu ?? (umin + umax) / 2;
    cv[i] = (vmin + vmax) / 2;
  }
  fillGaps(cu);
  fillGaps(cv);
  smooth(cv, 2);
  if (opts.cu === undefined) smooth(cu, 2);
  const r = new Float64Array(n * m).fill(NaN);
  for (let i = 0; i < n; i++) {
    const h = hulls[i]!;
    if (h.length < 6) continue;
    const hn = h.length / 2;
    for (let j = 0; j < m; j++) {
      const th = (2 * Math.PI * j) / m;
      const dx = Math.cos(th);
      const dy = Math.sin(th);
      let best = 0;
      for (let k = 0; k < hn; k++) {
        const k2 = (k + 1) % hn;
        const px = h[k * 2]! - cu[i]!;
        const py = h[k * 2 + 1]! - cv[i]!;
        const ex = h[k2 * 2]! - h[k * 2]!;
        const ey = h[k2 * 2 + 1]! - h[k * 2 + 1]!;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const tt = (px * ey - py * ex) / den;
        const ss = (px * dy - py * dx) / den;
        if (tt > best && ss >= -1e-6 && ss <= 1 + 1e-6) best = tt;
      }
      r[i * m + j] = best;
    }
    // a hull corner between two rays widens both, so the interpolated outline still holds it
    for (let k = 0; k < hn; k++) {
      const du = h[k * 2]! - cu[i]!;
      const dv = h[k * 2 + 1]! - cv[i]!;
      const rho = Math.hypot(du, dv);
      let q = (Math.atan2(dv, du) / (2 * Math.PI)) * m;
      if (q < 0) q += m;
      for (const j of [Math.floor(q) % m, Math.ceil(q) % m]) {
        if (!(r[i * m + j]! >= rho)) r[i * m + j] = rho;
      }
    }
    if (opts.symmetric) {
      for (let j = 0; j <= m / 2; j++) {
        const k = (m / 2 - j + m) % m; // angle π - θ
        const v = Math.max(r[i * m + j]!, r[i * m + k]!);
        r[i * m + j] = v;
        r[i * m + k] = v;
      }
    }
  }
  // levels with no section take their nearest neighbour's
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(r[i * m]!)) continue;
    for (let k = 1; k < n; k++) {
      const src = [i - k, i + k].find((q) => q >= 0 && q < n && !Number.isNaN(r[q * m]!));
      if (src !== undefined) {
        for (let j = 0; j < m; j++) r[i * m + j] = r[src * m + j]!;
        break;
      }
    }
  }
  // smooth without shrinking: blur, then add back a blurred, widened version of whatever the blur
  // took off the peaks (so every measured radius is still met)
  const at = (a: Float64Array, ii: number, jj: number) =>
    a[Math.min(n - 1, Math.max(0, ii)) * m + ((jj + m) % m)]!;
  const blur = (a: Float64Array) => {
    const o = new Float64Array(n * m);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        let v = 0;
        for (let di = -1; di <= 1; di++)
          for (let dj = -1; dj <= 1; dj++)
            v += at(a, i + di, j + dj) * (2 - Math.abs(di)) * (2 - Math.abs(dj));
        o[i * m + j] = v / 16;
      }
    return o;
  };
  const soft = blur(blur(r));
  const lack = new Float64Array(n * m);
  for (let i = 0; i < n * m; i++) lack[i] = Math.max(0, r[i]! - soft[i]!);
  const wide = new Float64Array(n * m);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let v = 0;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) v = Math.max(v, at(lack, i + di, j + dj));
      wide[i * m + j] = v;
    }
  const back = blur(wide);
  const pad = opts.pad ?? PAD;
  // free tips (crown, fingertips, heel, toes) taper over two extra levels; ends that meet another
  // part (a joint) stay flat, inside the neighbouring part
  const taper = opts.taper ?? "none";
  const pre = taper === "start" || taper === "both" ? 2 : 0;
  const post = taper === "end" || taper === "both" ? 2 : 0;
  const N = n + pre + post;
  const out = new Float64Array(N * m);
  const cu2 = new Float64Array(N);
  const cv2 = new Float64Array(N);
  for (let i = 0; i < n; i++) {
    cu2[i + pre] = cu[i]!;
    cv2[i + pre] = cv[i]!;
    for (let j = 0; j < m; j++) out[(i + pre) * m + j] = soft[i * m + j]! + back[i * m + j]! + pad;
  }
  const ext = (to: number, from: number, f: number) => {
    cu2[to] = cu2[from]!;
    cv2[to] = cv2[from]!;
    for (let j = 0; j < m; j++) out[to * m + j] = out[from * m + j]! * f;
  };
  if (pre) {
    ext(1, 2, 0.8);
    ext(0, 2, 0.5);
  }
  if (post) {
    ext(N - 2, N - 3, 0.8);
    ext(N - 1, N - 3, 0.5);
  }
  return { kind: "star", axis, a0: a0 - pre * da, da, n: N, m, cu: cu2, cv: cv2, r: out };
}

/** Convex hull of 2D points given as segments (u0, v0, u1, v1, ...), as a flat CCW polygon. */
function convexHull(seg: number[]): number[] {
  const pts: [number, number][] = [];
  for (let k = 0; k < seg.length; k += 2) pts.push([seg[k]!, seg[k + 1]!]);
  if (pts.length < 3) return [];
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.flat();
}

function fillGaps(a: Float64Array) {
  const n = a.length;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(a[i]!)) continue;
    let lo = i - 1;
    while (lo >= 0 && Number.isNaN(a[lo]!)) lo--;
    let hi = i + 1;
    while (hi < n && Number.isNaN(a[hi]!)) hi++;
    a[i] =
      lo < 0
        ? hi < n
          ? a[hi]!
          : 0
        : hi >= n
          ? a[lo]!
          : a[lo]! + ((a[hi]! - a[lo]!) * (i - lo)) / (hi - lo);
  }
}

function smooth(a: Float64Array, passes: number) {
  for (let p = 0; p < passes; p++) {
    const c = a.slice();
    for (let i = 1; i < a.length - 1; i++) a[i] = (c[i - 1]! + 2 * c[i]! + c[i + 1]!) / 4;
  }
}

const mirrorV3 = (v: V3): V3 => [-v[0], v[1], v[2]];

function mirrorShape<T extends Shape>(s: T): T {
  switch (s.kind) {
    case "cone":
      return roundCone(mirrorV3(s.a), mirrorV3(s.b), s.ra, s.rb) as T;
    case "ellipsoid": {
      const e = s as Ellipsoid;
      return ellipsoid(
        mirrorV3(e.c),
        e.r,
        e.basis ? [mirrorV3(e.basis[0]), mirrorV3(e.basis[1]), mirrorV3(e.basis[2])] : undefined,
      ) as T;
    }
    case "star": {
      const st = s as Star;
      const r = new Float64Array(st.r.length);
      for (let i = 0; i < st.n; i++)
        for (let j = 0; j < st.m; j++)
          r[i * st.m + j] = st.r[i * st.m + ((st.m / 2 - j + st.m) % st.m)]!;
      return { ...st, cu: st.cu.map((c) => -c), r } as T;
    }
    default:
      throw new Error(`can't mirror a ${s.kind}`);
  }
}

const mirrorLimb = (l: LimbProxy): LimbProxy => ({
  upper: mirrorShape(l.upper),
  lower: mirrorShape(l.lower),
  end: mirrorShape(l.end),
});

/** Radius of a star at an angle (radians) and level, by the stored samples (no interpolation). */
function starRadius(s: Star, a: number, theta: number): number {
  const i = Math.min(s.n - 1, Math.max(0, Math.round((a - s.a0) / s.da)));
  const j = ((Math.round((theta / (2 * Math.PI)) * s.m) % s.m) + s.m) % s.m;
  return s.r[i * s.m + j]! - PAD;
}

/** The body model and garment proxy for a morphed avatar. */
export function fitBody(av: MorphedAvatar): BodyModel {
  const src = meshOf(av.asset, "body")!;
  const pos = av.meshes.get("body")!.position;
  const n = pos.length / 3;
  const body: Body = {
    pos,
    index: src.index,
    dominant: dominantBones(src.joints, src.weights, n),
    n,
  };
  const H = av.height;
  const J = (b: BoneName, mirror = false) => {
    const i = BONE[b] * 3;
    return new Vector3(av.joints[i]! * (mirror ? -1 : 1), av.joints[i + 1]!, av.joints[i + 2]!);
  };
  // symmetric joints: the figure's left, mirrored to the right
  const joints = {} as Record<BoneName, Vector3>;
  for (const name of BONE_NAMES) {
    if (name.endsWith(".R")) continue;
    joints[name] = J(name);
    if (name.endsWith(".L"))
      joints[name.replace(".L", ".R") as BoneName] = J(name).setX(-J(name).x);
    else joints[name].x = 0;
  }

  const knee = joints["shin.L"].y;
  const hipJ = joints["thigh.L"];
  // the crotch: the lowest point of the body near the midline, above the knees
  let crotch = Infinity;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3]!;
    const y = pos[v * 3 + 1]!;
    if (Math.abs(x) < 0.008 * H && y > knee && y < hipJ.y + 0.03 * H) {
      if (!ARM_BONES.has(body.dominant[v]!) && !HAND_BONES.has(body.dominant[v]!))
        crotch = Math.min(crotch, y);
    }
  }
  const group = new Array<Group>(n);
  for (let v = 0; v < n; v++) {
    const d = body.dominant[v]!;
    const y = pos[v * 3 + 1]!;
    group[v] = HAND_BONES.has(d)
      ? "hand"
      : ARM_BONES.has(d)
        ? "arm"
        : HEAD_BONES.has(d) &&
            y > joints.neck.y - 0.02 * H &&
            // the neck's weights reach onto the shoulders: those belong to the torso
            (y > joints.head.y - 0.01 * H ||
              Math.hypot(pos[v * 3]!, pos[v * 3 + 2]! - joints.neck.z) < 0.042 * H)
          ? "head"
          : LEG_BONES.has(d) && y < crotch + 0.012 * H
            ? "leg"
            : y < crotch
              ? "leg"
              : "torso";
  }
  const trisOf = (keep: (a: number, b: number, c: number) => boolean) => {
    const out: number[] = [];
    const idx = body.index;
    for (let t = 0; t < idx.length; t += 3) {
      if (keep(idx[t]!, idx[t + 1]!, idx[t + 2]!)) out.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
    }
    return out;
  };
  const any = (g: Group) => (a: number, b: number, c: number) =>
    group[a] === g || group[b] === g || group[c] === g;

  // torso: everything but arms and head from the crotch up (hips and upper thighs included)
  let torsoTop = -Infinity;
  for (let v = 0; v < n; v++)
    if (group[v] === "torso") torsoTop = Math.max(torsoTop, pos[v * 3 + 1]!);
  const torso = starFromTriangles({
    pos,
    tris: trisOf(
      (a, b, c) =>
        any("torso")(a, b, c) ||
        (any("leg")(a, b, c) &&
          Math.max(pos[a * 3 + 1]!, pos[b * 3 + 1]!, pos[c * 3 + 1]!) > crotch),
    ),
    axis: 1,
    a0: crotch,
    a1: torsoTop,
    da: 0.0065 * H,
    m: 40,
    cu: 0,
    symmetric: true,
  });

  // head and neck
  let crown = -Infinity;
  for (let v = 0; v < n; v++) if (group[v] === "head") crown = Math.max(crown, pos[v * 3 + 1]!);
  const head = starFromTriangles({
    pos,
    tris: trisOf(any("head")),
    axis: 1,
    a0: joints.neck.y,
    a1: crown,
    da: 0.006 * H,
    m: 32,
    cu: 0,
    symmetric: true,
    pad: 0.0015,
    taper: "end",
  });
  // the neck's girth: its typical radius around the middle of the neck (the base flares into the
  // shoulders, the top into the jaw)
  const nk0 = joints.neck;
  const nk1 = joints.head;
  const radii: number[] = [];
  let neckMax = 0;
  for (let v = 0; v < n; v++) {
    if (group[v] !== "head" || body.dominant[v] !== BONE.neck) continue;
    const y = pos[v * 3 + 1]!;
    if (y < nk0.y || y > nk1.y) continue;
    const t = (y - nk0.y) / (nk1.y - nk0.y);
    const cz = nk0.z + (nk1.z - nk0.z) * t;
    const r = Math.hypot(pos[v * 3]!, pos[v * 3 + 2]! - cz);
    neckMax = Math.max(neckMax, r);
    if (t > 0.3 && t < 0.7) radii.push(r);
  }
  radii.sort((a, b) => a - b);
  const neckR = radii.length ? radii[Math.floor(radii.length / 2)]! : neckMax;
  const neck = roundCone([0, nk0.y, nk0.z], [0, nk1.y, nk1.z], neckMax + PAD, neckMax + PAD);

  // arms and legs: horizontal sections of each bone's own triangles, on the figure's left (the
  // limbs hang close to vertical, so level slices cut them almost square on)
  const ankle = joints["foot.L"];
  const left = (a: number, b: number, c: number) => pos[a * 3]! + pos[b * 3]! + pos[c * 3]! > 0;
  const limbStar = (
    keep: (v: number) => boolean,
    opts: { top?: number; bottom?: number; m?: number; taper?: "start" } = {},
  ): Star => {
    const tris = trisOf((a, b, c) => left(a, b, c) && (keep(a) || keep(b) || keep(c)));
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of tris) {
      lo = Math.min(lo, pos[v * 3 + 1]!);
      hi = Math.max(hi, pos[v * 3 + 1]!);
    }
    return starFromTriangles({
      pos,
      tris,
      axis: 1,
      a0: Math.max(lo, opts.bottom ?? -Infinity),
      a1: Math.min(hi, opts.top ?? Infinity),
      da: 0.006 * H,
      m: opts.m ?? 24,
      taper: opts.taper,
    });
  };
  // each bone's star slices the whole limb between its joints (plus a little overlap), so the two
  // stars of a limb are the same surface where they meet
  const elbow = joints["forearm.L"].y;
  const wrist = joints["hand.L"].y;
  const isArm = (v: number) => group[v] === "arm" || group[v] === "hand";
  const upperArm = limbStar((v) => group[v] === "arm", { bottom: elbow - 0.02 * H });
  const forearm = limbStar(isArm, { top: elbow + 0.02 * H, bottom: wrist - 0.008 * H });
  const hand = limbStar((v) => group[v] === "hand", { top: wrist + 0.004 * H, taper: "start" });
  const isLeg = (v: number) => group[v] === "leg" && !FOOT_BONES.has(body.dominant[v]!);
  // thighs start just above the crotch: higher up the torso holds the hips
  const thigh = limbStar(isLeg, { top: crotch + 0.012 * H, bottom: knee - 0.025 * H });
  const shin = limbStar((v) => group[v] === "leg", {
    top: knee + 0.025 * H,
    bottom: ankle.y - 0.03 * H,
  });
  // the foot: sections along z, from heel to toe
  const footSide = (v: number) =>
    FOOT_BONES.has(body.dominant[v]!) && pos[v * 3 + 1]! < ankle.y + 0.025 * H;
  const footTris = trisOf(
    (a, b, c) => footSide(a) && footSide(b) && footSide(c) && pos[a * 3]! > 0,
  );
  let zmin = Infinity;
  let zmax = -Infinity;
  let xmin = Infinity;
  let xmax = -Infinity;
  for (const v of footTris) {
    zmin = Math.min(zmin, pos[v * 3 + 2]!);
    zmax = Math.max(zmax, pos[v * 3 + 2]!);
    xmin = Math.min(xmin, pos[v * 3]!);
    xmax = Math.max(xmax, pos[v * 3]!);
  }
  const footStar = starFromTriangles({
    pos,
    tris: footTris,
    axis: 2,
    a0: zmin,
    a1: zmax,
    da: 0.006 * H,
    m: 28,
    cu: (xmin + xmax) / 2,
    pad: 0.002,
    taper: "both",
  });

  const armL: LimbProxy = { upper: upperArm, lower: forearm, end: hand };
  const legL: LimbProxy = { upper: thigh, lower: shin, end: footStar };
  const proxy: BodyProxy = {
    torso,
    neck,
    head,
    arms: { L: armL, R: mirrorLimb(armL) },
    legs: { L: legL, R: mirrorLimb(legL) },
  };

  // landmarks
  const halfWidth = (y: number) => Math.max(starRadius(torso, y, 0), starRadius(torso, y, Math.PI));
  const depthAt = (y: number) =>
    (starRadius(torso, y, Math.PI / 2) + starRadius(torso, y, -Math.PI / 2)) / 2;
  const scan = (lo: number, hi: number, f: (y: number) => number, best: "max" | "min") => {
    let by = lo;
    let bv = best === "max" ? -Infinity : Infinity;
    for (let y = lo; y <= hi; y += 0.002 * H) {
      const v = f(y);
      if (best === "max" ? v > bv : v < bv) {
        bv = v;
        by = y;
      }
    }
    return by;
  };
  // widest point of the hips (just above the crotch the section is both thighs)
  const yHip = scan(crotch + 0.025 * H, crotch + 0.09 * H, halfWidth, "max");
  const yWaist = scan(yHip + 0.03 * H, joints.chest.y, halfWidth, "min");
  const front = (y: number) => {
    const i = Math.min(torso.n - 1, Math.max(0, Math.round((y - torso.a0) / torso.da)));
    return torso.cv[i]! + starRadius(torso, y, Math.PI / 2);
  };
  const yChest = scan(yWaist + 0.04 * H, joints["clavicle.L"].y - 0.01 * H, front, "max");
  let shoulderW = 0;
  for (let v = 0; v < n; v++) {
    if (group[v] === "hand") continue;
    const y = pos[v * 3 + 1]!;
    if (Math.abs(y - joints["upperArm.L"].y) < 0.02 * H)
      shoulderW = Math.max(shoulderW, Math.abs(pos[v * 3]!));
  }
  const torsoProfile: [number, number, number][] = [];
  for (let i = 0; i < torso.n; i += 3) {
    const y = torso.a0 + i * torso.da;
    const w = halfWidth(y);
    torsoProfile.push([w, y, Math.min(1.2, depthAt(y) / Math.max(w, 1e-3))]);
  }
  // a limb's equivalent radius at a height: the mean of its section's radii across and along
  const span = (st: Star, at: number) => {
    const i = Math.min(st.n - 1, Math.max(0, Math.round((at - st.a0) / st.da)));
    const q = st.m / 4;
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += st.r[i * st.m + k * q]!;
    return sum / 4 - PAD;
  };
  const limb = (a: Vector3, b: Vector3, st: Star): Limb => ({
    a: a.clone(),
    b: b.clone(),
    ra: span(st, a.y),
    rb: span(st, b.y),
  });
  const headR = (crown - joints.head.y) / 2;
  const legZ: [number, number][] = [];
  for (const st of [shin, thigh]) {
    for (let i = 0; i < st.n; i += 3) {
      const y = st.a0 + i * st.da;
      if (!legZ.length || y > legZ[legZ.length - 1]![0] + 1e-6) legZ.push([y, st.cv[i]!]);
    }
  }
  let handR = 0;
  for (let i = 0; i < hand.n; i++) handR = Math.max(handR, span(hand, hand.a0 + i * hand.da));
  const handTop = hand.a0 + (hand.n - 1) * hand.da;
  return {
    H,
    depth: depthAt(yWaist) / halfWidth(yWaist),
    y: {
      ankle: ankle.y - 0.012 * H,
      knee,
      crotch,
      hip: yHip,
      waist: yWaist,
      chest: yChest,
      shoulder: joints["upperArm.L"].y + 0.022 * H,
      neckBase: joints.neck.y,
      neckTop: joints.head.y,
      head: joints.head.y + headR,
    },
    w: {
      hip: halfWidth(yHip),
      waist: halfWidth(yWaist),
      chest: halfWidth(yChest),
      shoulder: shoulderW,
      neck: neckR,
    },
    headR,
    upperArm: limb(joints["upperArm.L"], joints["forearm.L"], upperArm),
    forearm: limb(joints["forearm.L"], joints["hand.L"], forearm),
    // the thigh's own girth just below the seat (its top slices still hold the buttock)
    thigh: { ...limb(hipJ, joints["shin.L"], thigh), ra: span(thigh, crotch - 0.03 * H) },
    shin: limb(joints["shin.L"], ankle, shin),
    hand: {
      center: new Vector3(hand.cu[hand.n >> 1]!, (hand.a0 + handTop) / 2, hand.cv[hand.n >> 1]!),
      r: Math.max(handR, (handTop - hand.a0) / 2),
    },
    foot: {
      center: new Vector3((xmin + xmax) / 2, 0.024 * H, (zmin + zmax) / 2),
      length: zmax - zmin,
      width: xmax - xmin,
      height: 0.046 * H,
    },
    joints,
    torso: torsoProfile,
    legZ,
    neckZ:
      head.cv[
        Math.min(
          head.n - 1,
          Math.max(0, Math.round((joints.neck.y + 0.012 * H - head.a0) / head.da)),
        )
      ]!,
    proxy,
  };
}
