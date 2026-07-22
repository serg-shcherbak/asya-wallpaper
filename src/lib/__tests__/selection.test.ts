import { describe, expect, it } from "vitest";
import { createSelectionStore } from "../selection";

describe("selection store", () => {
  it("keeps unique ids and toggles a choice off before reveal", () => {
    const store = createSelectionStore(3);
    store.getState().toggle("a");
    store.getState().toggle("a");
    expect(store.getState().selectedIds).toEqual([]);
  });

  it("opens reveal only when selections cross the threshold and can reopen after dropping below it", () => {
    const store = createSelectionStore(3);
    store.getState().toggle("a");
    store.getState().toggle("b");
    expect(store.getState().revealOpen).toBe(false);
    store.getState().toggle("c");
    expect(store.getState().revealOpen).toBe(true);
    store.getState().dismissReveal();
    expect(store.getState().selectedIds).toEqual(["a", "b", "c"]);
    store.getState().toggle("d");
    expect(store.getState().revealOpen).toBe(false);
    store.getState().toggle("d");
    store.getState().toggle("c");
    expect(store.getState().revealOpen).toBe(false);
    store.getState().toggle("c");
    expect(store.getState().revealOpen).toBe(true);
  });
});
