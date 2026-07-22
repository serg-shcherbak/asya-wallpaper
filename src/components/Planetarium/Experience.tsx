"use client";

/* eslint-disable react-hooks/set-state-in-effect -- public data and WebGL capabilities initialize after hydration. */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataError, FallbackWorld } from "@/components/Fallback/FallbackWorld";
import { FocusProxy } from "@/components/Marking/FocusProxy";
import { SelectionConstellation } from "@/components/Marking/SelectionConstellation";
import { RevealOverlay } from "@/components/Reveal/RevealOverlay";
import { detectCapabilities, type CapabilityResult } from "@/lib/capabilities";
import { CONTACT_URL } from "@/lib/config";
import { loadPlanetariumData } from "@/lib/data";
import { buildIslandCollection, resolveTasteIsland } from "@/lib/island";
import { selectQuality } from "@/lib/quality";
import { useSelectionStore } from "@/lib/selection";
import { shareIsland } from "@/lib/share";
import type { PlanetariumData } from "@/lib/types";

const PlanetariumScene = dynamic(
  () => import("./Scene").then((module) => module.PlanetariumScene),
  { ssr: false, loading: () => <div className="scene-loading" /> },
);

type LoadState =
  | { status: "loading"; data?: never }
  | { status: "ready"; data: PlanetariumData }
  | { status: "error"; data?: never };

function WorldLoader() {
  return (
    <main className="world-loader" role="status" aria-label="Мир собирается">
      <div className="loader-orbit" />
      <p>Мир собирается</p>
    </main>
  );
}

export function PlanetariumExperience() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [capabilities, setCapabilities] = useState<CapabilityResult | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared" | "error">("idle");
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const revealOpen = useSelectionStore((state) => state.revealOpen);
  const toggle = useSelectionStore((state) => state.toggle);
  const dismissReveal = useSelectionStore((state) => state.dismissReveal);

  const load = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const data = await loadPlanetariumData();
      setLoadState({ status: "ready", data });
      setFocusedId((current) => current ?? data.samples[0]?.id ?? null);
    } catch {
      setLoadState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
    const detected = detectCapabilities();
    if (new URLSearchParams(window.location.search).get("reduced") === "1") {
      setCapabilities({ mode: "reduced", reducedMotion: detected.reducedMotion, reason: "mobile" });
    } else {
      setCapabilities(detected);
    }
  }, [load]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const result = useMemo(() => {
    if (loadState.status !== "ready" || selectedIds.length === 0) return null;
    return resolveTasteIsland(loadState.data.samples, selectedIds, loadState.data.islands);
  }, [loadState, selectedIds]);
  const collection = useMemo(() => {
    if (loadState.status !== "ready" || !result) return [];
    return buildIslandCollection(loadState.data.samples, selectedIds, result.island.id);
  }, [loadState, result, selectedIds]);

  if (loadState.status === "error") return <DataError onRetry={load} contactUrl={CONTACT_URL} />;
  if (loadState.status === "loading" || !capabilities) return <WorldLoader />;

  const browserNavigator = navigator as Navigator & { deviceMemory?: number };
  const quality = selectQuality({
    width: window.innerWidth,
    dpr: window.devicePixelRatio,
    reduced: capabilities.mode === "reduced",
    deviceMemory: browserNavigator.deviceMemory,
  });

  const performShare = async () => {
    if (!result) return;
    try {
      const next = await shareIsland(result.island.id, result.island.name, window.location.origin);
      setShareStatus(next);
    } catch {
      setShareStatus("error");
    }
  };

  return (
    <main className="experience">
      <div className="world-stage">
        {capabilities.mode === "immersive" ? (
          <PlanetariumScene
            samples={loadState.data.samples}
            islands={loadState.data.islands}
            focusedId={focusedId}
            selectedIds={selectedSet}
            quality={quality}
            reducedMotion={capabilities.reducedMotion}
            onFocusChange={setFocusedId}
            onToggle={toggle}
          />
        ) : (
          <FallbackWorld samples={loadState.data.samples} selectedIds={selectedSet} onToggle={toggle} />
        )}
      </div>
      {capabilities.mode === "immersive" && focusedId ? (
        <FocusProxy sampleId={focusedId} selected={selectedSet.has(focusedId)} onToggle={toggle} />
      ) : null}
      <SelectionConstellation samples={loadState.data.samples} selectedIds={selectedIds} />
      {revealOpen && result ? (
        <RevealOverlay
          island={result.island}
          collection={collection}
          onContinue={dismissReveal}
          contactUrl={CONTACT_URL}
          onShare={performShare}
          shareStatus={shareStatus}
        />
      ) : null}
    </main>
  );
}
