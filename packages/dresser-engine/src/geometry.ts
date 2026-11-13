import {
  CylinderGeometry,
  LatheGeometry,
  Quaternion,
  SplineCurve,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";

/** A smooth lathe from (radius, y) control points. */
export function smoothLathe(
  points: [number, number][],
  segments = 48,
  samples = 64,
): BufferGeometry {
  const curve = new SplineCurve(points.map(([r, y]) => new Vector2(Math.max(r, 0.0005), y)));
  return new LatheGeometry(curve.getPoints(samples), segments);
}

const UP = new Vector3(0, 1, 0);

/** Position, rotation and geometry for a tapered tube between two points. */
export function segment(
  a: Vector3,
  b: Vector3,
  ra: number,
  rb: number,
  openEnded = false,
  radial = 24,
) {
  const dir = b.clone().sub(a);
  const length = dir.length();
  // CylinderGeometry's top is +y: map +y onto a→b so radiusTop belongs to b
  const geometry = new CylinderGeometry(rb, ra, length, radial, 1, openEnded);
  const quaternion = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  const position = a.clone().add(b).multiplyScalar(0.5);
  return { geometry, quaternion, position };
}

/** Unit open cylinder used for trims (cuffs, hems, collars, waistbands); scale it per use. */
export const UNIT_BAND = new CylinderGeometry(1, 1, 1, 72, 1, true);

/** Quaternion that turns +y onto `dir` (for bands around limbs). */
export function alongY(dir: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
}
