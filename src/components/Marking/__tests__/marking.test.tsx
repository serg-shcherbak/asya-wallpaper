import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusProxy, isTapGesture } from "../FocusProxy";

describe("marking interaction", () => {
  it("distinguishes a tap from a drag", () => {
    expect(isTapGesture({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(true);
    expect(isTapGesture({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false);
  });

  it("exposes one 44px keyboard proxy for the focused sample", () => {
    const toggle = vi.fn();
    render(<FocusProxy sampleId="sample-a" selected onToggle={toggle} />);
    const button = screen.getByRole("button", { name: /sample-a.*отмечено/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveStyle({ width: "44px", height: "44px" });
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledWith("sample-a");
  });
});
