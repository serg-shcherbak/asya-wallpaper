import { describe, expect, it } from "vitest";
import type { Island, Sample } from "../types";
import { buildIslandCollection, resolveTasteIsland } from "../island";

const islands: Island[] = [
  { id: "warm", name: "Тихий сад", color: "#b56f58", centroid: { x: 1, y: 0, z: 0 } },
  { id: "blue", name: "Синий воздух", color: "#4b7192", centroid: { x: 0, y: 1, z: 0 } },
];
const sample = (id: string, warm: number, islandId = "warm"): Sample => ({
  id,
  dominantColor: "#775566",
  srcset: { sm: `/${id}/sm`, md: `/${id}/md`, lg: `/${id}/lg` },
  pos: { x: 1, y: 0, z: 0 },
  islandId,
  islandAffinity: [
    { islandId: "warm", weight: warm },
    { islandId: "blue", weight: 1 - warm },
  ],
});

describe("taste island resolution", () => {
  const samples = [sample("a", 0.8), sample("b", 0.74), sample("c", 0.67), sample("d", 0.62), sample("e", 0.78)];

  it("sums affinity rather than using brittle plural voting", () => {
    const result = resolveTasteIsland(samples, samples.map((item) => item.id), islands);
    expect(result.island.id).toBe("warm");
    expect(result.decisive).toBe(true);
  });

  it("stays stable across similar small subsets", () => {
    for (const selected of [["a", "b", "c"], ["b", "c", "d"], ["a", "d", "e"]]) {
      expect(resolveTasteIsland(samples, selected, islands).island.id).toBe("warm");
    }
  });

  it("builds a deduplicated collection with selected items first", () => {
    const collection = buildIslandCollection([...samples, sample("f", 0.9)], ["a", "b"], "warm");
    expect(collection.slice(0, 2).map((item) => item.id)).toEqual(["a", "b"]);
    expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length);
  });
});
