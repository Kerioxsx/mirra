/**
 * Signed distance primitives for the mirra-rig@1 avatar and its garments.
 *
 * Everything works on plain numbers (no Vector3 allocations): the mesher evaluates these functions
 * a few hundred thousand times per surface. Distances are in metres, negative inside. The formulas
 * follow Inigo Quilez's reference SDFs (round cone exact; ellipsoid and ellipse are the usual
 * near-surface approximations, accurate enough to offset garments by a few millimetres).
 */

export type V3 = readonly [number, number, number];

/** Polynomial smooth minimum: blends two surfaces over a radius of `k` metres. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum (for subtracting or intersecting with a soft edge). */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export interface RoundCone {
  kind: "cone";
  a: V3;
  b: V3;
  ra: number;
  rb: number;
  // precomputed
  bax: number;
  bay: number;
  baz: number;
  l2: number;
  rr: number;
  a2: number;
  il2: number;
}

export function roundCone(a: V3, b: V3, ra: number, rb: number): RoundCone {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = Math.max(1e-10, bax * bax + bay * bay + baz * baz);
  const rr = ra - rb;
  return { kind: "cone", a, b, ra, rb, bax, bay, baz, l2, rr, a2: l2 - rr * rr, il2: 1 / l2 };
}

export function sdRoundCone(c: RoundCone, px: number, py: number, pz: number): number {
  const pax = px - c.a[0];
  const pay = py - c.a[1];
  const paz = pz - c.a[2];
  const y = pax * c.bax + pay * c.bay + paz * c.baz;
  const z = y - c.l2;
  const qx = pax * c.l2 - c.bax * y;
  const qy = pay * c.l2 - c.bay * y;
  const qz = paz * c.l2 - c.baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * c.l2;
  const z2 = z * z * c.l2;
  const k = Math.sign(c.rr) * c.rr * c.rr * x2;
  if (Math.sign(z) * c.a2 * z2 > k) return Math.sqrt(x2 + z2) * c.il2 - c.rb;
  if (Math.sign(y) * c.a2 * y2 < k) return Math.sqrt(x2 + y2) * c.il2 - c.ra;
  return (Math.sqrt(x2 * c.a2 * c.il2) + y * c.rr) * c.il2 - c.ra;
}

/** Parameter of the closest point on a cone's axis (0 at `a`, 1 at `b`), clamped. */
export function coneT(c: RoundCone, px: number, py: number, pz: number): number {
  const t = ((px - c.a[0]) * c.bax + (py - c.a[1]) * c.bay + (pz - c.a[2]) * c.baz) * c.il2;
  return Math.min(1, Math.max(0, t));
}

export interface Ellipsoid {
  kind: "ellipsoid";
  c: V3;
  r: V3;
  /** Optional orthonormal basis (rows: local x, y, z axes in world space). */
  basis?: readonly [V3, V3, V3];
}

export function ellipsoid(c: V3, r: V3, basis?: readonly [V3, V3, V3]): Ellipsoid {
  return basis ? { kind: "ellipsoid", c, r, basis } : { kind: "ellipsoid", c, r };
}

export function sdEllipsoid(e: Ellipsoid, px: number, py: number, pz: number): number {
  let x = px - e.c[0];
  let y = py - e.c[1];
  let z = pz - e.c[2];
  if (e.basis) {
    const [u, v, w] = e.basis;
    const lx = x * u[0] + y * u[1] + z * u[2];
    const ly = x * v[0] + y * v[1] + z * v[2];
    const lz = x * w[0] + y * w[1] + z * w[2];
    x = lx;
    y = ly;
    z = lz;
  }
  const ax = x / e.r[0];
  const ay = y / e.r[1];
  const az = z / e.r[2];
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / e.r[0];
  const by = ay / e.r[1];
  const bz = az / e.r[2];
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(e.r[0], e.r[1], e.r[2]);
  return (k0 * (k0 - 1)) / k1;
}

/** Approximate signed distance from (x, z) to an axis-aligned ellipse with semi-axes a, b. */
export function sdEllipse2(x: number, z: number, a: number, b: number): number {
  const ax = x / a;
  const az = z / b;
  const k0 = Math.sqrt(ax * ax + az * az);
  const bx = ax / a;
  const bz = az / b;
  const k1 = Math.sqrt(bx * bx + bz * bz);
  if (k1 < 1e-9) return -Math.min(a, b);
  return (k0 * (k0 - 1)) / k1;
}

/**
 * A vertical solid of revolution with an elliptical cross-section: x radius r(y) and z radius
 * r(y)·depth(y) from a profile of (radius, y[, depth]) points, interpolated with monotone cubics so
 * the surface never overshoots between points. Used for the torso and for draped garment hulls.
 */
export interface Lathe {
  kind: "lathe";
  /** Sorted bottom to top. */
  ys: Float64Array;
  rs: Float64Array;
  /** z radii (interpolated on their own, so their curve is monotone between points too) */
  zs: Float64Array;
  mr: Float64Array;
  mz: Float64Array;
  cx: number;
  cz: number;
}

/** Fritsch-Carlson tangents: a cubic Hermite through these never overshoots the data. */
function monotoneTangents(xs: Float64Array, vs: Float64Array): Float64Array {
  const n = xs.length;
  const m = new Float64Array(n);
  if (n < 2) return m;
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++)
    d[i] = (vs[i + 1]! - vs[i]!) / Math.max(1e-9, xs[i + 1]! - xs[i]!);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  return m;
}

export function lathe(
  profile: readonly (readonly [number, number] | readonly [number, number, number])[],
  depth: number,
  cx = 0,
  cz = 0,
): Lathe {
  const pts = [...profile].sort((p, q) => p[1] - q[1]);
  const ys = Float64Array.from(pts.map((p) => p[1]));
  const rs = Float64Array.from(pts.map((p) => p[0]));
  const zs = Float64Array.from(
    pts.map((p) => p[0] * (p.length > 2 ? (p as readonly number[])[2]! : depth)),
  );
  return {
    kind: "lathe",
    ys,
    rs,
    zs,
    mr: monotoneTangents(ys, rs),
    mz: monotoneTangents(ys, zs),
    cx,
    cz,
  };
}

function hermite(
  y0: number,
  y1: number,
  v0: number,
  v1: number,
  m0: number,
  m1: number,
  y: number,
): [number, number] {
  const h = y1 - y0;
  const t = (y - y0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const v =
    (2 * t3 - 3 * t2 + 1) * v0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * v1 +
    (t3 - t2) * h * m1;
  const dv =
    ((6 * t2 - 6 * t) * v0 +
      (3 * t2 - 4 * t + 1) * h * m0 +
      (-6 * t2 + 6 * t) * v1 +
      (3 * t2 - 2 * t) * h * m1) /
    h;
  return [v, dv];
}

/** x radius, z radius and their slopes at height y, clamped to the profile's ends. */
function latheAt(l: Lathe, y: number): [number, number, number, number] {
  const n = l.ys.length;
  if (y <= l.ys[0]!) return [l.rs[0]!, l.zs[0]!, 0, 0];
  if (y >= l.ys[n - 1]!) return [l.rs[n - 1]!, l.zs[n - 1]!, 0, 0];
  let i = 1;
  while (i < n - 1 && l.ys[i]! < y) i++;
  const [r, dr] = hermite(
    l.ys[i - 1]!,
    l.ys[i]!,
    l.rs[i - 1]!,
    l.rs[i]!,
    l.mr[i - 1]!,
    l.mr[i]!,
    y,
  );
  const [z, dz] = hermite(
    l.ys[i - 1]!,
    l.ys[i]!,
    l.zs[i - 1]!,
    l.zs[i]!,
    l.mz[i - 1]!,
    l.mz[i]!,
    y,
  );
  return [Math.max(r, 1e-4), Math.max(z, 1e-4), dr, dz];
}

export function sdLathe(l: Lathe, px: number, py: number, pz: number): number {
  const n = l.ys.length;
  const y0 = l.ys[0]!;
  const y1 = l.ys[n - 1]!;
  const cy = Math.min(y1, Math.max(y0, py));
  const [r, rz, dr, dz] = latheAt(l, cy);
  // the profile's slope in this point's own direction around the ellipse (x radius at the sides,
  // z radius at the front and back), so a steep shoulder line doesn't shrink distances at the chest
  const u = (px - l.cx) / r;
  const v = (pz - l.cz) / rz;
  const len = Math.hypot(u, v) || 1;
  const sx = (u / len) * dr;
  const sz = (v / len) * dz;
  const d2 = sdEllipse2(px - l.cx, pz - l.cz, r, rz) / Math.sqrt(1 + sx * sx + sz * sz);
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  if (dy === 0) return d2;
  return d2 > 0 ? Math.sqrt(d2 * d2 + dy * dy) : Math.max(d2, dy);
}

/** A torus-like band around an elliptical ring at height y (hems, cuffs, collars, hat bands). */
export interface Band {
  kind: "band";
  cx: number;
  cy: number;
  cz: number;
  a: number;
  b: number;
  minor: number;
  /** Vertical stretch of the tube (1 = round). */
  tall: number;
}

export function band(
  cy: number,
  a: number,
  b: number,
  minor: number,
  tall = 1,
  cx = 0,
  cz = 0,
): Band {
  return { kind: "band", cx, cy, cz, a, b, minor, tall };
}

export function sdBand(t: Band, px: number, py: number, pz: number): number {
  const de = sdEllipse2(px - t.cx, pz - t.cz, t.a, t.b);
  const dy = (py - t.cy) / t.tall;
  return Math.sqrt(de * de + dy * dy) - t.minor;
}

/** Rounded box, axis-aligned. */
export interface Box {
  kind: "box";
  c: V3;
  h: V3;
  round: number;
}

export function box(c: V3, h: V3, round: number): Box {
  return { kind: "box", c, h, round };
}

export function sdBox(b: Box, px: number, py: number, pz: number): number {
  const qx = Math.abs(px - b.c[0]) - b.h[0] + b.round;
  const qy = Math.abs(py - b.c[1]) - b.h[1] + b.round;
  const qz = Math.abs(pz - b.c[2]) - b.h[2] + b.round;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - b.round;
}

export type Shape = RoundCone | Ellipsoid | Lathe | Band | Box;

export function sdShape(s: Shape, px: number, py: number, pz: number): number {
  switch (s.kind) {
    case "cone":
      return sdRoundCone(s, px, py, pz);
    case "ellipsoid":
      return sdEllipsoid(s, px, py, pz);
    case "lathe":
      return sdLathe(s, px, py, pz);
    case "band":
      return sdBand(s, px, py, pz);
    case "box":
      return sdBox(s, px, py, pz);
  }
}

/** An axis-aligned bounding box, [min, max]. */
export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

export function emptyBox(): AABB {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function growBox(b: AABB, x: number, y: number, z: number, r = 0): AABB {
  b.min[0] = Math.min(b.min[0], x - r);
  b.min[1] = Math.min(b.min[1], y - r);
  b.min[2] = Math.min(b.min[2], z - r);
  b.max[0] = Math.max(b.max[0], x + r);
  b.max[1] = Math.max(b.max[1], y + r);
  b.max[2] = Math.max(b.max[2], z + r);
  return b;
}

/** Conservative bounds of a shape, padded by `pad`. */
export function shapeBounds(s: Shape, pad: number, into: AABB = emptyBox()): AABB {
  switch (s.kind) {
    case "cone":
      growBox(into, s.a[0], s.a[1], s.a[2], s.ra + pad);
      return growBox(into, s.b[0], s.b[1], s.b[2], s.rb + pad);
    case "ellipsoid": {
      const r = Math.max(s.r[0], s.r[1], s.r[2]) + pad;
      return growBox(into, s.c[0], s.c[1], s.c[2], r);
    }
    case "lathe": {
      let rmax = 0;
      for (const r of s.rs) rmax = Math.max(rmax, r);
      const n = s.ys.length;
      let zmax = 0;
      for (const z of s.zs) zmax = Math.max(zmax, z);
      growBox(into, s.cx - rmax - pad, s.ys[0]! - pad, s.cz - zmax - pad);
      return growBox(into, s.cx + rmax + pad, s.ys[n - 1]! + pad, s.cz + zmax + pad);
    }
    case "band":
      growBox(
        into,
        s.cx - s.a - s.minor - pad,
        s.cy - s.minor * s.tall - pad,
        s.cz - s.b - s.minor - pad,
      );
      return growBox(
        into,
        s.cx + s.a + s.minor + pad,
        s.cy + s.minor * s.tall + pad,
        s.cz + s.b + s.minor + pad,
      );
    case "box":
      growBox(into, s.c[0] - s.h[0] - pad, s.c[1] - s.h[1] - pad, s.c[2] - s.h[2] - pad);
      return growBox(into, s.c[0] + s.h[0] + pad, s.c[1] + s.h[1] + pad, s.c[2] + s.h[2] + pad);
  }
}
