import { describe, expect, it } from "vitest";
import { facingCenter, toSpherePosition } from "../sceneMath";

describe("scene math", () => {
  it("keeps every sample on the requested sphere radius", () => {
    const position = toSpherePosition({ x: 3, y: 4, z: 0 }, 9);
    expect(Math.hypot(position[0], position[1], position[2])).toBeCloseTo(9);
  });

  it("orients a wallpaper normal toward the camera at the center", () => {
    const normal = facingCenter({ x: 0.2, y: -0.5, z: 0.8 });
    const dot = normal[0] * 0.2 + normal[1] * -0.5 + normal[2] * 0.8;
    expect(dot).toBeLessThan(0);
    expect(Math.hypot(...normal)).toBeCloseTo(1);
  });
});
