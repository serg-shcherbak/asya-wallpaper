import { describe, expect, it } from "vitest";
import { selectQuality } from "../quality";

describe("responsive quality", () => {
  it("uses high quality on a capable desktop", () => {
    expect(selectQuality({ width: 1440, dpr: 2, reduced: false, deviceMemory: 8 })).toBe("high");
  });
  it("reduces density and effects on mobile or degraded mode", () => {
    expect(selectQuality({ width: 390, dpr: 3, reduced: false, deviceMemory: 6 })).toBe("reduced");
    expect(selectQuality({ width: 1440, dpr: 2, reduced: true, deviceMemory: 8 })).toBe("reduced");
  });
});
