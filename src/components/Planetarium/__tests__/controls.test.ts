import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  applyDamping,
  clampFov,
  clampPitch,
  consumeFirstRunHint,
  getInitialViewAngles,
  isInteractiveTarget,
  keyIntent,
  ViewControls,
  wrapYaw,
} from "../Controls";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
  useThree: () => ({
    camera: {
      quaternion: { setFromEuler: vi.fn() },
      fov: 64,
      updateProjectionMatrix: vi.fn(),
      getWorldDirection: vi.fn(),
    },
    gl: { domElement: document.createElement("canvas") },
  }),
}));

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

  it("leaves Enter on native and ARIA controls to the control itself", () => {
    const button = document.createElement("button");
    const nestedLabel = document.createElement("span");
    const ariaButton = document.createElement("div");
    ariaButton.setAttribute("role", "button");
    button.append(nestedLabel);
    const canvas = document.createElement("canvas");

    expect(isInteractiveTarget(button)).toBe(true);
    expect(isInteractiveTarget(nestedLabel)).toBe(true);
    expect(isInteractiveTarget(ariaButton)).toBe(true);
    expect(isInteractiveTarget(canvas)).toBe(false);
  });

  it("does not run the global Enter action when a native control owns the event", () => {
    const onEnter = vi.fn();
    render(
      createElement(ViewControls, {
        samples: [],
        onFocusChange: vi.fn(),
        onEnter,
      }),
    );
    const button = document.createElement("button");
    document.body.append(button);

    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onEnter).not.toHaveBeenCalled();

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it("turns the first-run drift hint off permanently after input", () => {
    const consumed = consumeFirstRunHint({ active: true, consumed: false });
    expect(consumed).toEqual({ active: false, consumed: true });
    expect(consumeFirstRunHint(consumed)).toEqual(consumed);
  });

  it("starts by facing the most populated island", () => {
    const angles = getInitialViewAngles([
      { id: "a", islandId: "warm", islandAffinity: [{ islandId: "warm", weight: 1 }], dominantColor: "#000000", srcset: { sm: "", md: "", lg: "" }, pos: { x: 1, y: 0, z: 0 } },
      { id: "b", islandId: "warm", islandAffinity: [{ islandId: "warm", weight: 1 }], dominantColor: "#000000", srcset: { sm: "", md: "", lg: "" }, pos: { x: 0.9, y: 0, z: 0.1 } },
      { id: "c", islandId: "cool", islandAffinity: [{ islandId: "cool", weight: 1 }], dominantColor: "#000000", srcset: { sm: "", md: "", lg: "" }, pos: { x: -1, y: 0, z: 0 } },
    ]);

    expect(angles.yaw).toBeCloseTo(-1.623, 2);
    expect(angles.pitch).toBeCloseTo(0);
  });
});
