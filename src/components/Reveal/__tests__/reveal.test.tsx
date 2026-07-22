import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Island, Sample } from "@/lib/types";
import { RevealOverlay } from "../RevealOverlay";

const island: Island = { id: "a", name: "Тихий сад", color: "#76566a", centroid: { x: 1, y: 0, z: 0 } };
const sample: Sample = {
  id: "sample-a",
  dominantColor: "#76566a",
  srcset: { sm: "/samples/a/sm.webp", md: "/samples/a/md.webp", lg: "/samples/a/lg.webp" },
  pos: { x: 1, y: 0, z: 0 },
  islandId: "a",
  islandAffinity: [{ islandId: "a", weight: 1 }],
};

it("reveals a named island without a numeric compatibility score and can return", () => {
  const onContinue = vi.fn();
  render(<RevealOverlay island={island} collection={[sample]} onContinue={onContinue} />);
  expect(screen.getByRole("heading", { name: "Тихий сад" })).toBeInTheDocument();
  expect(screen.getByText(/твой остров в мире Аси/i)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\d+%/);
  fireEvent.click(screen.getByRole("button", { name: /продолжить смотреть/i }));
  expect(onContinue).toHaveBeenCalled();
});
