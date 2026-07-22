import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Sample } from "@/lib/types";
import { DataError, FallbackWorld } from "../FallbackWorld";

const samples: Sample[] = Array.from({ length: 30 }, (_, index) => ({
  id: `sample-${index}`,
  dominantColor: "#725967",
  srcset: { sm: `/samples/${index}/sm.webp`, md: `/samples/${index}/md.webp`, lg: `/samples/${index}/lg.webp` },
  pos: { x: 1, y: 0, z: 0 },
  islandId: "a",
  islandAffinity: [{ islandId: "a", weight: 1 }],
}));

it("keeps reduced samples keyboard-selectable with named controls", () => {
  const toggle = vi.fn();
  render(<FallbackWorld samples={samples} selectedIds={new Set()} onToggle={toggle} />);
  const first = screen.getByRole("button", { name: /sample-0/i });
  first.focus();
  fireEvent.keyDown(first, { key: "Enter" });
  fireEvent.click(first);
  expect(toggle).toHaveBeenCalledWith("sample-0");
});

it("initially renders a bounded set and reveals deferred lazy images on request", () => {
  const toggle = vi.fn();
  render(<FallbackWorld samples={samples} selectedIds={new Set()} onToggle={toggle} />);

  expect(screen.getAllByRole("button", { name: /обои sample-/i })).toHaveLength(24);
  expect(document.querySelector('img[src="/samples/24/sm.webp"]')).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /показать ещё обои/i }));

  expect(screen.getAllByRole("button", { name: /обои sample-/i })).toHaveLength(30);
  expect(document.querySelector('img[src="/samples/24/sm.webp"]')).toHaveAttribute("loading", "lazy");
});

it("renders a retryable data error instead of an empty canvas", () => {
  const retry = vi.fn();
  render(<DataError onRetry={retry} contactUrl="mailto:asya@example.test" />);
  fireEvent.click(screen.getByRole("button", { name: /повторить/i }));
  expect(retry).toHaveBeenCalled();
  expect(screen.getByRole("link", { name: /написать Асе/i })).toBeInTheDocument();
});
