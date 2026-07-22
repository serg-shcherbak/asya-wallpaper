import type { Island, Sample } from "./types";

export type TasteIslandResult = {
  island: Island;
  scores: Record<string, number>;
  decisive: boolean;
};

export function resolveTasteIsland(
  samples: Sample[],
  selectedIds: string[],
  islands: Island[],
  minimumMargin = 0.08,
): TasteIslandResult {
  if (!selectedIds.length || !islands.length) throw new Error("Taste resolution needs selections and islands");
  const selected = new Set(selectedIds);
  const scores = Object.fromEntries(islands.map((island) => [island.id, 0]));
  for (const sample of samples) {
    if (!selected.has(sample.id)) continue;
    for (const affinity of sample.islandAffinity) {
      if (affinity.islandId in scores) scores[affinity.islandId] += affinity.weight;
    }
  }
  const ranked = [...islands].sort((left, right) => scores[right.id] - scores[left.id]);
  const top = scores[ranked[0].id];
  const second = ranked[1] ? scores[ranked[1].id] : 0;
  return {
    island: ranked[0],
    scores,
    decisive: top > 0 && (top - second) / top >= minimumMargin,
  };
}

export function buildIslandCollection(samples: Sample[], selectedIds: string[], islandId: string): Sample[] {
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  const collection: Sample[] = [];
  const seen = new Set<string>();
  for (const id of selectedIds) {
    const sample = byId.get(id);
    if (sample && !seen.has(id)) {
      collection.push(sample);
      seen.add(id);
    }
  }
  for (const sample of samples) {
    if (sample.islandId === islandId && !seen.has(sample.id)) {
      collection.push(sample);
      seen.add(sample.id);
    }
  }
  return collection;
}
