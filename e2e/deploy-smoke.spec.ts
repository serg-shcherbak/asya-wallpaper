import { expect, test } from "@playwright/test";

const deployUrl = process.env.DEPLOY_URL?.replace(/\/$/, "");

test.describe("deployed static release", () => {
  test.skip(!deployUrl, "Set DEPLOY_URL to run the Vercel preview smoke test");

  test("serves the world data, a sample asset and a result route", async ({ page, request }) => {
    const layoutResponse = await request.get(`${deployUrl}/data/layout.json`);
    const islandsResponse = await request.get(`${deployUrl}/data/islands.json`);
    expect(layoutResponse.ok()).toBe(true);
    expect(islandsResponse.ok()).toBe(true);

    const layout = (await layoutResponse.json()) as Array<{ srcset: { sm: string } }>;
    const islands = (await islandsResponse.json()) as Array<{ id: string; name: string }>;
    expect(layout.length).toBeGreaterThan(300);
    expect(islands).toHaveLength(12);

    const sampleResponse = await request.get(`${deployUrl}${layout[0].srcset.sm}`);
    expect(sampleResponse.ok()).toBe(true);
    expect(sampleResponse.headers()["content-type"]).toContain("image/webp");

    await page.goto(`${deployUrl}/result/${islands[0].id}/`);
    await expect(page.getByRole("heading", { name: islands[0].name })).toBeVisible();
  });
});
