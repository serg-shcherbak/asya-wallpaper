import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import islands from "../../../../../public/data/islands.json";
import ResultPage, { generateMetadata, generateStaticParams } from "../page";

describe("static island result", () => {
  it("pre-renders every known island and no unknown id", () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(islands.length);
    expect(params).not.toContainEqual({ islandId: "unknown" });
  });

  it("emits island-specific Open Graph metadata", async () => {
    const island = islands[0];
    const metadata = await generateMetadata({ params: Promise.resolve({ islandId: island.id }) });
    expect(metadata.title).toContain(island.name);
    expect(metadata.openGraph?.images).toContain(`/share/${island.id}.jpg`);
  });

  it("supports a cold visit without selection state", async () => {
    const island = islands[0];
    render(await ResultPage({ params: Promise.resolve({ islandId: island.id }) }));
    expect(screen.getByRole("heading", { name: island.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /войти в мир/i })).toHaveAttribute("href", "/");
  });
});
