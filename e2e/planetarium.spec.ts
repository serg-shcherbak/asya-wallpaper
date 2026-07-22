import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("reduced pointer flow reaches an island and returns with marks intact", async ({ page }) => {
  await page.goto("/?reduced=1");
  const samples = page.getByRole("button", { name: /^\u041e\u0431\u043e\u0438 sample-/ });
  await expect(samples.first()).toBeVisible();
  for (let index = 0; index < 6; index += 1) await samples.nth(index).click();

  const reveal = page.getByRole("dialog");
  await expect(reveal).toBeVisible();
  await expect(reveal.getByText("Твой остров в мире Аси")).toBeVisible();
  await expect(reveal).not.toContainText(/\d+%/);
  await reveal.getByRole("button", { name: "Продолжить смотреть" }).click();
  await expect(reveal).toBeHidden();
  await expect(samples.first()).toHaveAttribute("aria-pressed", "true");
});

test("reduced flow works by keyboard and has no critical accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?reduced=1");
  const samples = page.getByRole("button", { name: /^\u041e\u0431\u043e\u0438 sample-/ });
  for (let index = 0; index < 6; index += 1) {
    await samples.nth(index).focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("dialog")).toBeVisible();
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});

test("data failure exposes retry instead of an empty world", async ({ page }) => {
  await page.route("**/data/layout.json", (route) => route.abort());
  await page.goto("/?reduced=1");
  await expect(page.getByText("Мир не собрался")).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
});

test("immersive mode mounts a canvas or the explicit device fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas, .fallback-world").first()).toBeVisible();
});
