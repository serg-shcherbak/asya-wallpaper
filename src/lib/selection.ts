import { create } from "zustand";
import { createStore } from "zustand/vanilla";
import { SELECTION_THRESHOLD } from "./config";

type SelectionState = {
  selectedIds: string[];
  revealOpen: boolean;
  toggle: (sampleId: string) => void;
  dismissReveal: () => void;
  reset: () => void;
};

const selectionCreator = (threshold: number) =>
  (set: (update: (state: SelectionState) => Partial<SelectionState>) => void): SelectionState => ({
    selectedIds: [],
    revealOpen: false,
    toggle: (sampleId) =>
      set((state) => {
        const exists = state.selectedIds.includes(sampleId);
        const selectedIds = exists
          ? state.selectedIds.filter((id) => id !== sampleId)
          : [...state.selectedIds, sampleId];
        const crossedThreshold =
          !exists && state.selectedIds.length < threshold && selectedIds.length >= threshold;
        return { selectedIds, revealOpen: crossedThreshold };
      }),
    dismissReveal: () => set(() => ({ revealOpen: false })),
    reset: () => set(() => ({ selectedIds: [], revealOpen: false })),
  });

export const createSelectionStore = (threshold = SELECTION_THRESHOLD) =>
  createStore<SelectionState>(selectionCreator(threshold));

export const useSelectionStore = create<SelectionState>(selectionCreator(SELECTION_THRESHOLD));
