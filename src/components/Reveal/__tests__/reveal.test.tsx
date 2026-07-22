import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

function RevealHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">Фоновое действие</button>
      {open ? (
        <RevealOverlay
          island={island}
          collection={[sample]}
          contactUrl="https://example.test/contact"
          onContinue={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

it("reveals a named island without a numeric compatibility score and can return", () => {
  const onContinue = vi.fn();
  render(<RevealOverlay island={island} collection={[sample]} onContinue={onContinue} />);
  expect(screen.getByRole("heading", { name: "Тихий сад" })).toBeInTheDocument();
  expect(screen.getByText(/твой остров в мире Аси/i)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\d+%/);
  fireEvent.click(screen.getByRole("button", { name: /продолжить смотреть/i }));
  expect(onContinue).toHaveBeenCalled();
});

it("moves focus into the modal, traps it and restores background access on close", () => {
  render(<RevealHarness />);
  const background = screen.getByText("Фоновое действие");
  const continueButton = screen.getByRole("button", { name: /продолжить смотреть/i });
  const contact = screen.getByRole("link", { name: /хочу так же/i });

  expect(background).toHaveAttribute("aria-hidden", "true");
  expect(continueButton).toHaveFocus();
  fireEvent.keyDown(continueButton, { key: "Tab", shiftKey: true });
  expect(contact).toHaveFocus();

  fireEvent.click(continueButton);
  expect(background).not.toHaveAttribute("aria-hidden");
});
