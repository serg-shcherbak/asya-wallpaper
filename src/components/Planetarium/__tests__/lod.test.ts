import { describe, expect, it } from "vitest";
import type { Sample } from "@/lib/types";
import { allocateLods } from "../lod";

const sample = (id: string, x: number, y: number, z: number): Sample => ({
  id,
  pos: { x, y, z },
  srcset: { sm: `/${id}/sm`, md: `/${id}/md`, lg: `/${id}/lg` },
  dominantColor: "#123456",
  islandId: "island",
  islandAffinity: [{ islandId: "island", weight: 1 }],
});

describe("texture LOD budget", () => {
  const samples = [
    sample("focus", 1, 0, 0),
    sample("near-a", 0.99, 0.1, 0),
    sample("near-b", 0.97, -0.1, 0),
    sample("far", -1, 0, 0),
  ];

  it("uses lg only for focus and caps simultaneous sharp tiles", () => {
    const lods = allocateLods(samples, "focus", 3);
    expect(lods.get("focus")).toBe("lg");
    expect(lods.get("far")).toBe("color");
    expect([...lods.values()].filter((lod) => lod !== "color")).toHaveLength(3);
  });
});
