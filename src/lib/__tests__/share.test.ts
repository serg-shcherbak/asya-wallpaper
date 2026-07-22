import { describe, expect, it, vi } from "vitest";
import { canonicalResultUrl, shareIsland, shareStatusLabel } from "../share";

describe("result sharing", () => {
  it("uses one label mapping for idle, success and retry states", () => {
    expect(shareStatusLabel("idle")).toBe("Поделиться");
    expect(shareStatusLabel("copied")).toBe("Ссылка скопирована");
    expect(shareStatusLabel("shared")).toBe("Открыто меню шэра");
    expect(shareStatusLabel("error")).toBe("Поделиться");
  });

  it("builds a canonical static result path", () => {
    expect(canonicalResultUrl("island-a", "https://example.test/path")).toBe(
      "https://example.test/result/island-a/",
    );
  });

  it("uses Web Share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await shareIsland("island-a", "Остров", "https://example.test", {
      share,
      clipboard: { writeText: vi.fn() },
    });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.test/result/island-a/" }));
  });

  it("copies the same URL when Web Share is absent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      shareIsland("island-a", "Остров", "https://example.test", { clipboard: { writeText } }),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.test/result/island-a/");
  });
});
