import type { QualityLevel } from "./types";

type QualityInput = { width: number; dpr: number; reduced: boolean; deviceMemory?: number };

export function selectQuality({ width, dpr, reduced, deviceMemory = 8 }: QualityInput): QualityLevel {
  if (reduced || width < 720 || deviceMemory <= 2) return "reduced";
  if (width >= 1200 && deviceMemory >= 6 && dpr <= 2.5) return "high";
  return "medium";
}
