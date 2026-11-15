/**
 * Narrow-band surface nets: turns a signed distance function into an indexed triangle mesh.
 *
 * The grid is aligned to the world origin, so every surface meshed at the same spacing shares one
 * lattice (layered garments then carry the same small errors and stay nested). Only blocks of the
 * grid near the surface are evaluated exactly; far blocks are filled with their centre value, which
 * has the right sign because the distance functions are close to 1-Lipschitz. Each vertex is then
 * projected onto the true surface with one Newton step, so placement error is the function's own,
 * not the grid's.
 */
import type { AABB } from "./sdf";

export type SDF = (x: number, y: number, z: number) => number;

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

const BLOCK = 4;

export function meshSDF(sdf: SDF, bounds: AABB, h: number): MeshData {
  const ix0 = Math.floor(bounds.min[0] / h) - 1;
  const iy0 = Math.floor(bounds.min[1] / h) - 1;
  const iz0 = Math.floor(bounds.min[2] / h) - 1;
  const nx = Math.ceil(bounds.max[0] / h) + 2 - ix0;
  const ny = Math.ceil(bounds.max[1] / h) + 2 - iy0;
  const nz = Math.ceil(bounds.max[2] / h) + 2 - iz0;
  if (nx < 2 || ny < 2 || nz < 2 || !Number.isFinite(nx * ny * nz)) {
    return {
      positions: new Float32Array(),
      normals: new Float32Array(),
      indices: new Uint32Array(),
    };
  }
  const sxy = nx * ny;
  const values = new Float32Array(nx * ny * nz);
  const X = (i: number) => (ix0 + i) * h;
  const Y = (j: number) => (iy0 + j) * h;
  const Z = (k: number) => (iz0 + k) * h;

  // Two-level narrow band. Blocks of 4 cells, then sub-blocks of 2, are classified by their centre
  // value; far ones are filled with it (the sign is right, the magnitude does not matter there) and
  // only points near the surface are evaluated. `exact` marks evaluated points, so fills never
  // overwrite them and shared points are evaluated once.
  const exact = new Uint8Array(values.length);
  const fill = (i0: number, j0: number, k0: number, n: number, d: number) => {
    const i1 = Math.min(nx - 1, i0 + n);
    const j1 = Math.min(ny - 1, j0 + n);
    const k1 = Math.min(nz - 1, k0 + n);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++) {
        const row = j * nx + k * sxy;
        for (let i = i0; i <= i1; i++) if (!exact[i + row]) values[i + row] = d;
      }
  };
  const evaluate = (i0: number, j0: number, k0: number, n: number) => {
    const i1 = Math.min(nx - 1, i0 + n);
    const j1 = Math.min(ny - 1, j0 + n);
    const k1 = Math.min(nz - 1, k0 + n);
    for (let k = k0; k <= k1; k++) {
      const z = Z(k);
      for (let j = j0; j <= j1; j++) {
        const y = Y(j);
        const row = j * nx + k * sxy;
        for (let i = i0; i <= i1; i++) {
          const at = i + row;
          if (exact[at]) continue;
          values[at] = sdf(X(i), y, z);
          exact[at] = 1;
        }
      }
    }
  };
  const far4 = Math.sqrt(3) * BLOCK * h * 0.5 * 1.2 + 0.5 * h;
  const far2 = Math.sqrt(3) * h * 1.2 + 0.35 * h;
  const bx = Math.ceil((nx - 1) / BLOCK);
  const by = Math.ceil((ny - 1) / BLOCK);
  const bz = Math.ceil((nz - 1) / BLOCK);
  for (let kb = 0; kb < bz; kb++) {
    for (let jb = 0; jb < by; jb++) {
      for (let ib = 0; ib < bx; ib++) {
        const i0 = ib * BLOCK;
        const j0 = jb * BLOCK;
        const k0 = kb * BLOCK;
        const d = sdf(X(i0 + BLOCK / 2), Y(j0 + BLOCK / 2), Z(k0 + BLOCK / 2));
        if (Math.abs(d) > far4) {
          fill(i0, j0, k0, BLOCK, d);
          continue;
        }
        for (let sk = 0; sk < BLOCK; sk += 2)
          for (let sj = 0; sj < BLOCK; sj += 2)
            for (let si = 0; si < BLOCK; si += 2) {
              const a = i0 + si;
              const b = j0 + sj;
              const c = k0 + sk;
              if (a >= nx - 1 || b >= ny - 1 || c >= nz - 1) continue;
              const ds = sdf(X(a + 1), Y(b + 1), Z(c + 1));
              if (Math.abs(ds) > far2) fill(a, b, c, 2, ds);
              else evaluate(a, b, c, 2);
            }
      }
    }
  }

  // surface nets: one vertex per cell that the surface crosses
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cx = nx - 1;
  const cxy = (nx - 1) * (ny - 1);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7], // x
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7], // y
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7], // z
  ] as const;
  const OFF = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ] as const;
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const o = OFF[c]!;
          const v = values[i + o[0] + (j + o[1]) * nx + (k + o[2]) * sxy]!;
          corner[c] = v;
          if (v < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a]!;
          const vb = corner[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const oa = OFF[a]!;
          const ob = OFF[b]!;
          sx += oa[0] + (ob[0] - oa[0]) * t;
          sy += oa[1] + (ob[1] - oa[1]) * t;
          sz += oa[2] + (ob[2] - oa[2]) * t;
          n++;
        }
        cellIndex[i + j * cx + k * cxy] = pos.length / 3;
        pos.push(X(i) + (sx / n) * h, Y(j) + (sy / n) * h, Z(k) + (sz / n) * h);
      }
    }
  }

  // project each vertex onto the surface and take its normal from the gradient
  const count = pos.length / 3;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  // one Newton step with a tetrahedral gradient (four evaluations per vertex)
  const e = h * 0.25;
  for (let v = 0; v < count; v++) {
    let x = pos[v * 3]!;
    let y = pos[v * 3 + 1]!;
    let z = pos[v * 3 + 2]!;
    const f0 = sdf(x + e, y - e, z - e);
    const f1 = sdf(x - e, y - e, z + e);
    const f2 = sdf(x - e, y + e, z - e);
    const f3 = sdf(x + e, y + e, z + e);
    let gx = f0 - f1 - f2 + f3;
    let gy = -f0 - f1 + f2 + f3;
    let gz = -f0 + f1 - f2 + f3;
    const gl = Math.hypot(gx, gy, gz);
    if (gl > 1e-12) {
      gx /= gl;
      gy /= gl;
      gz /= gl;
      const d = (f0 + f1 + f2 + f3) * 0.25;
      const step = Math.max(-h, Math.min(h, d));
      x -= gx * step;
      y -= gy * step;
      z -= gz * step;
    }
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    normals[v * 3] = gx;
    normals[v * 3 + 1] = gy;
    normals[v * 3 + 2] = gz;
  }

  // one quad per grid edge the surface crosses, wound so it faces along the gradient
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // split along the shorter diagonal
    const dac = dist2(positions, a, c);
    const dbd = dist2(positions, b, d);
    const tris = dac <= dbd ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
    for (let t = 0; t < 6; t += 3) {
      const p = tris[t]!;
      const q = tris[t + 1]!;
      const r = tris[t + 2]!;
      const ux = positions[q * 3]! - positions[p * 3]!;
      const uy = positions[q * 3 + 1]! - positions[p * 3 + 1]!;
      const uz = positions[q * 3 + 2]! - positions[p * 3 + 2]!;
      const vx = positions[r * 3]! - positions[p * 3]!;
      const vy = positions[r * 3 + 1]! - positions[p * 3 + 1]!;
      const vz = positions[r * 3 + 2]! - positions[p * 3 + 2]!;
      const fx = uy * vz - uz * vy;
      const fy = uz * vx - ux * vz;
      const fz = ux * vy - uy * vx;
      const nx2 = normals[p * 3]! + normals[q * 3]! + normals[r * 3]!;
      const ny2 = normals[p * 3 + 1]! + normals[q * 3 + 1]! + normals[r * 3 + 1]!;
      const nz2 = normals[p * 3 + 2]! + normals[q * 3 + 2]! + normals[r * 3 + 2]!;
      if (fx * nx2 + fy * ny2 + fz * nz2 >= 0) idx.push(p, q, r);
      else idx.push(p, r, q);
    }
  };
  const cell = (i: number, j: number, k: number) =>
    i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1
      ? -1
      : cellIndex[i + j * cx + k * cxy]!;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = values[i + j * nx + k * sxy]! < 0;
        if (i + 1 < nx && v0 !== values[i + 1 + j * nx + k * sxy]! < 0) {
          quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k));
        }
        if (j + 1 < ny && v0 !== values[i + (j + 1) * nx + k * sxy]! < 0) {
          quad(cell(i - 1, j, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i - 1, j, k));
        }
        if (k + 1 < nz && v0 !== values[i + j * nx + (k + 1) * sxy]! < 0) {
          quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k));
        }
      }
    }
  }
  return { positions, normals, indices: Uint32Array.from(idx) };
}

function dist2(p: Float32Array, a: number, b: number): number {
  const dx = p[a * 3]! - p[b * 3]!;
  const dy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const dz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Clips a mesh to where `keep` is negative, splitting the triangles that cross its zero set, so a
 * garment ends in a clean open edge (a hem, a cuff, a neckline) instead of a capped solid.
 */
export function clipMesh(mesh: MeshData, keep: SDF): MeshData {
  const n = mesh.positions.length / 3;
  const c = new Float32Array(n);
  for (let v = 0; v < n; v++)
    c[v] = keep(mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!);
  const pos: number[] = Array.from(mesh.positions);
  const nor: number[] = Array.from(mesh.normals);
  const edgeVertex = new Map<number, number>();
  const cut = (a: number, b: number): number => {
    const key = a < b ? a * n + b : b * n + a;
    const hit = edgeVertex.get(key);
    if (hit !== undefined) return hit;
    const t = c[a]! / (c[a]! - c[b]!);
    const id = pos.length / 3;
    for (let k = 0; k < 3; k++) {
      pos.push(pos[a * 3 + k]! + (pos[b * 3 + k]! - pos[a * 3 + k]!) * t);
      nor.push(nor[a * 3 + k]! + (nor[b * 3 + k]! - nor[a * 3 + k]!) * t);
    }
    const l = Math.hypot(nor[id * 3]!, nor[id * 3 + 1]!, nor[id * 3 + 2]!) || 1;
    for (let k = 0; k < 3; k++) nor[id * 3 + k]! /= l;
    edgeVertex.set(key, id);
    return id;
  };
  const idx: number[] = [];
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t]!, I[t + 1]!, I[t + 2]!];
    const kept = tri.map((v) => c[v]! < 0);
    const count = kept.filter(Boolean).length;
    if (count === 3) {
      idx.push(tri[0]!, tri[1]!, tri[2]!);
      continue;
    }
    if (count === 0) continue;
    // rotate so the odd vertex comes first (winding preserved)
    let r = 0;
    if (count === 1) r = kept.indexOf(true);
    else r = kept.indexOf(false);
    const a = tri[r]!;
    const b = tri[(r + 1) % 3]!;
    const d = tri[(r + 2) % 3]!;
    const ab = cut(a, b);
    const ad = cut(a, d);
    if (count === 1) idx.push(a, ab, ad);
    else idx.push(ab, b, d, ab, d, ad);
  }
  // drop vertices no triangle uses
  const used = new Int32Array(pos.length / 3).fill(-1);
  const outPos: number[] = [];
  const outNor: number[] = [];
  const outIdx = new Uint32Array(idx.length);
  idx.forEach((v, i) => {
    if (used[v] === -1) {
      used[v] = outPos.length / 3;
      outPos.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!);
      outNor.push(nor[v * 3]!, nor[v * 3 + 1]!, nor[v * 3 + 2]!);
    }
    outIdx[i] = used[v]!;
  });
  return {
    positions: Float32Array.from(outPos),
    normals: Float32Array.from(outNor),
    indices: outIdx,
  };
}
