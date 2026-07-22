import type { Sample } from "@/lib/types";

export type LodTier = "color" | "md" | "lg";

const dot = (left: Sample["pos"], right: Sample["pos"]) => {
  const leftLength = Math.hypot(left.x, left.y, left.z) || 1;
  const rightLength = Math.hypot(right.x, right.y, right.z) || 1;
  return (left.x * right.x + left.y * right.y + left.z * right.z) / (leftLength * rightLength);
};

export function allocateLods(samples: Sample[], focusedId: string | null, sharpBudget: number) {
  const result = new Map<string, LodTier>(samples.map((sample) => [sample.id, "color"]));
  if (!focusedId || sharpBudget <= 0) return result;
  const focused = samples.find((sample) => sample.id === focusedId);
  if (!focused) return result;

  const nearest = [...samples]
    .sort((left, right) => dot(focused.pos, right.pos) - dot(focused.pos, left.pos))
    .slice(0, Math.max(1, sharpBudget));
  nearest.forEach((sample) => result.set(sample.id, sample.id === focusedId ? "lg" : "md"));
  return result;
}
