export type CapabilitySnapshot = {
  webgl: boolean;
  reducedMotion: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  width: number;
};

export type CapabilityResult = {
  mode: "immersive" | "reduced";
  reducedMotion: boolean;
  reason: "webgl" | "motion" | "hardware" | "mobile" | null;
};

export function assessCapabilities(snapshot: CapabilitySnapshot): CapabilityResult {
  if (!snapshot.webgl) return { mode: "reduced", reducedMotion: snapshot.reducedMotion, reason: "webgl" };
  if (snapshot.reducedMotion) return { mode: "reduced", reducedMotion: true, reason: "motion" };
  if (snapshot.hardwareConcurrency <= 2 || (snapshot.deviceMemory ?? 8) <= 2) {
    return { mode: "reduced", reducedMotion: false, reason: "hardware" };
  }
  if (snapshot.width < 720) return { mode: "reduced", reducedMotion: false, reason: "mobile" };
  return { mode: "immersive", reducedMotion: false, reason: null };
}

export function detectCapabilities(): CapabilityResult {
  const canvas = document.createElement("canvas");
  const webgl = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  const browserNavigator = navigator as Navigator & { deviceMemory?: number };
  return assessCapabilities({
    webgl,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hardwareConcurrency: browserNavigator.hardwareConcurrency || 4,
    deviceMemory: browserNavigator.deviceMemory,
    width: window.innerWidth,
  });
}
