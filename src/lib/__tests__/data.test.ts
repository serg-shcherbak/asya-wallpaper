import { describe, expect, it, vi } from "vitest";
import layoutFixture from "../__fixtures__/layout.sample.json";
import islandFixture from "../__fixtures__/islands.sample.json";
import {
  DataContractError,
  loadPlanetariumData,
  parseSamples,
  resolveSampleAsset,
} from "../data";

const response = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;

describe("planetarium data contract", () => {
  it("parses the valid release fixture and resolves all tiers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(layoutFixture))
      .mockResolvedValueOnce(response(islandFixture));

    const data = await loadPlanetariumData(fetcher);

    expect(data.samples).toHaveLength(1);
    expect(data.islands[0].name).toBe("Остров 01");
    expect(resolveSampleAsset(data.samples[0], "sm")).toBe("/samples/sample-a/sm.webp");
    expect(resolveSampleAsset(data.samples[0], "md")).toBe("/samples/sample-a/md.webp");
    expect(resolveSampleAsset(data.samples[0], "lg")).toBe("/samples/sample-a/lg.webp");
  });

  it("rejects a sample without a position or island id", () => {
    const broken = [{ ...layoutFixture[0], pos: undefined, islandId: undefined }];
    expect(() => parseSamples(broken)).toThrow(DataContractError);
    expect(() => parseSamples(broken)).toThrow(/missing|pos/);
  });

  it("rejects empty data instead of rendering an empty world", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(islandFixture));
    await expect(loadPlanetariumData(fetcher)).rejects.toThrow("at least one sample");
  });

  it("turns a failed fetch into a top-level contract error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(loadPlanetariumData(fetcher)).rejects.toThrow("Could not load");
  });
});
