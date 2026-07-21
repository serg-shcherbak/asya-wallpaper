import type { Vector3 } from "@/lib/types";

export type Tuple3 = [number, number, number];

function normalized(vector: Vector3): Tuple3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) throw new Error("A sample cannot sit at the sphere origin");
  return [vector.x / length, vector.y / length, vector.z / length];
}

export function toSpherePosition(vector: Vector3, radius = 1): Tuple3 {
  const unit = normalized(vector);
  return [unit[0] * radius, unit[1] * radius, unit[2] * radius];
}

export function facingCenter(position: Vector3): Tuple3 {
  const unit = normalized(position);
  return [-unit[0], -unit[1], -unit[2]];
}
