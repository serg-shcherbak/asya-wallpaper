import { describe, expect, it } from "vitest";
import { assessCapabilities } from "../capabilities";

describe("capability assessment", () => {
  it("selects reduced mode without WebGL", () => {
    expect(
      assessCapabilities({ webgl: false, reducedMotion: false, hardwareConcurrency: 8, deviceMemory: 8, width: 1440 }).mode,
    ).toBe("reduced");
  });

  it("selects reduced mode for a weak or motion-sensitive environment", () => {
    expect(
      assessCapabilities({ webgl: true, reducedMotion: true, hardwareConcurrency: 8, deviceMemory: 8, width: 1440 }).mode,
    ).toBe("reduced");
    expect(
      assessCapabilities({ webgl: true, reducedMotion: false, hardwareConcurrency: 2, deviceMemory: 2, width: 1440 }).mode,
    ).toBe("reduced");
  });

  it("keeps capable desktop hardware immersive", () => {
    expect(
      assessCapabilities({ webgl: true, reducedMotion: false, hardwareConcurrency: 8, deviceMemory: 8, width: 1440 }).mode,
    ).toBe("immersive");
  });
});
