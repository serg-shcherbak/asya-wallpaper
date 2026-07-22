import { expect, it } from "vitest";
import type { Island } from "@/lib/types";
import { createNebulaLayers } from "../Nebula";

it("creates one additive color layer per island", () => {
  const islands: Island[] = [
    { id: "a", name: "A", color: "#aa6644", centroid: { x: 1, y: 0, z: 0 } },
    { id: "b", name: "B", color: "#557799", centroid: { x: 0, y: 1, z: 0 } },
  ];

  expect(createNebulaLayers(islands, 8)).toEqual([
    { id: "a", color: "#aa6644", position: [8, 0, 0] },
    { id: "b", color: "#557799", position: [0, 8, 0] },
  ]);
});
