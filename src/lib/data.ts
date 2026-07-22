import type { Island, PlanetariumData, Sample, SampleSources, Vector3 } from "./types";

export const DATA_FETCH_TIMEOUT_MS = 10_000;

export class DataContractError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DataContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseVector(value: unknown, owner: string): Vector3 {
  if (!isRecord(value) || !["x", "y", "z"].every((axis) => typeof value[axis] === "number")) {
    throw new DataContractError(`${owner} needs numeric pos/centroid x, y and z`);
  }
  return { x: value.x as number, y: value.y as number, z: value.z as number };
}

function parseSources(value: unknown, owner: string): SampleSources {
  if (!isRecord(value) || !["sm", "md", "lg"].every((tier) => typeof value[tier] === "string")) {
    throw new DataContractError(`${owner} needs sm, md and lg asset paths`);
  }
  return { sm: value.sm as string, md: value.md as string, lg: value.lg as string };
}

export function parseSamples(value: unknown): Sample[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DataContractError("layout.json must contain at least one sample");
  }
  return value.map((entry, index) => {
    const owner = `layout[${index}]`;
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.dominantColor !== "string" ||
      typeof entry.islandId !== "string" ||
      !Array.isArray(entry.islandAffinity) ||
      entry.islandAffinity.length === 0
    ) {
      throw new DataContractError(`${owner} is missing id, color, islandId or affinity`);
    }
    const islandAffinity = entry.islandAffinity.map((affinity, affinityIndex) => {
      if (
        !isRecord(affinity) ||
        typeof affinity.islandId !== "string" ||
        typeof affinity.weight !== "number"
      ) {
        throw new DataContractError(`${owner}.islandAffinity[${affinityIndex}] is invalid`);
      }
      return { islandId: affinity.islandId, weight: affinity.weight };
    });
    return {
      id: entry.id,
      srcset: parseSources(entry.srcset, owner),
      dominantColor: entry.dominantColor,
      pos: parseVector(entry.pos, owner),
      islandId: entry.islandId,
      islandAffinity,
    };
  });
}

export function parseIslands(value: unknown): Island[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DataContractError("islands.json must contain at least one island");
  }
  return value.map((entry, index) => {
    const owner = `islands[${index}]`;
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.color !== "string"
    ) {
      throw new DataContractError(`${owner} is missing id, name or color`);
    }
    return {
      id: entry.id,
      name: entry.name,
      color: entry.color,
      centroid: parseVector(entry.centroid, owner),
    };
  });
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out loading ${url}`));
    }, DATA_FETCH_TIMEOUT_MS);
  });
  try {
    try {
      response = await Promise.race([fetcher(url, { signal: controller.signal }), timeoutError]);
    } catch (error) {
      throw new DataContractError(`Could not load ${url}`, { cause: error });
    }
    if (!response.ok) {
      throw new DataContractError(`Could not load ${url} (HTTP ${response.status})`);
    }
    try {
      return await Promise.race([response.json(), timeoutError]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DataContractError(`Could not load ${url}`, { cause: error });
      }
      throw new DataContractError(`${url} is not valid JSON`, { cause: error });
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function loadPlanetariumData(fetcher: typeof fetch = fetch): Promise<PlanetariumData> {
  const [layout, islands] = await Promise.all([
    fetchJson("/data/layout.json", fetcher),
    fetchJson("/data/islands.json", fetcher),
  ]);
  const samples = parseSamples(layout);
  const parsedIslands = parseIslands(islands);
  const islandIds = new Set(parsedIslands.map((island) => island.id));
  const orphan = samples.find((sample) => !islandIds.has(sample.islandId));
  if (orphan) {
    throw new DataContractError(`Sample ${orphan.id} references unknown island ${orphan.islandId}`);
  }
  return { samples, islands: parsedIslands };
}

export function resolveSampleAsset(sample: Sample, tier: keyof SampleSources): string {
  const source = sample.srcset[tier];
  if (!source.startsWith("/samples/")) {
    throw new DataContractError(`Sample ${sample.id} has an invalid ${tier} asset path`);
  }
  return source;
}
