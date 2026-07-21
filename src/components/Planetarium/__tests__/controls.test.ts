import { describe, expect, it } from "vitest";
import {
  applyDamping,
  clampFov,
  clampPitch,
  consumeFirstRunHint,
  keyIntent,
  wrapYaw,
} from "../Controls";

describe("inside-sphere controls", () => {
  it("clamps pitch and FOV but wraps yaw without an edge", () => {
    expect(clampPitch(Math.PI)).toBeCloseTo((70 * Math.PI) / 180);
    expect(clampPitch(-Math.PI)).toBeCloseTo((-70 * Math.PI) / 180);
    expect(clampFov(5)).toBe(35);
    expect(clampFov(130)).toBe(82);
    expect(wrapYaw(Math.PI * 10 + 0.2)).toBeCloseTo(0.2);
  });

  it("damps inertial velocity toward zero", () => {
    expect(Math.abs(applyDamping(2, 0.9))).toBeLessThan(2);
    expect(applyDamping(0.00001, 0.5)).toBe(0);
  });

  it("maps keyboard look and zoom controls", () => {
    expect(keyIntent("ArrowLeft")).toEqual({ yaw: 1, pitch: 0, zoom: 0 });
    expect(keyIntent("w")).toEqual({ yaw: 0, pitch: 1, zoom: 0 });
    expect(keyIntent("+")).toEqual({ yaw: 0, pitch: 0, zoom: -1 });
    expect(keyIntent("Escape")).toBeNull();
  });

  it("turns the first-run drift hint off permanently after input", () => {
    const consumed = consumeFirstRunHint({ active: true, consumed: false });
    expect(consumed).toEqual({ active: false, consumed: true });
    expect(consumeFirstRunHint(consumed)).toEqual(consumed);
  });
});
