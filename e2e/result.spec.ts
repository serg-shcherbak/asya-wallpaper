import { expect, test } from "@playwright/test";
import islands from "../public/data/islands.json";

test("cold static result has island-specific content and metadata", async ({ page }) => {
  const island = islands[0];
  await page.goto(`/result/${island.id}/`);
  await expect(page.getByRole("heading", { name: island.name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Войти в мир" })).toHaveAttribute("href", "/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/share/${island.id}\\.jpg$`));
});

test("unknown island is not statically generated", async ({ page }) => {
  const response = await page.goto("/result/unknown-island/");
  expect(response?.status()).toBe(404);
});
