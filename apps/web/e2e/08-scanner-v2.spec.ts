import fs from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";

// The real face photo is a MediaPipe test asset fetched by `make models` (kept out of git).
const PORTRAIT = path.join(__dirname, "..", "..", "server", "ml_models", "test_assets", "portrait.jpg");

test("8a. a real face goes through the real model and opens the tone result", async ({ page, problems }) => {
  test.skip(!fs.existsSync(PORTRAIT), "run `make models` to fetch the test portrait");
  await page.goto("/scanner");

  // The scanner never guesses: the shopper chooses first, then camera and upload unlock.
  await page.getByTestId("scan-gender-men").click();
  await page.locator('input[type="file"]').setInputFiles(PORTRAIT);

  await expect(page).toHaveURL(/\/scanner\/result$/, { timeout: 60_000 });
  await expect(page.getByTestId("result-tone")).toHaveText(/Your skin tone: (Fair|Medium|Dark)/);
  await expect(page.getByTestId("result-confidence")).toHaveText(/(High|Medium|Low) confidence/);
  await expect(page.getByText("Men's picks for")).toBeVisible();
  await expect(page.getByTestId("tone-group-shirts")).toBeVisible();
  await expect(page.getByTestId("tone-group-pants")).toBeVisible();
  await expect(page.getByTestId("tone-group-caps")).toBeVisible();
  await expect(page.getByTestId("tone-group-glasses")).toBeVisible();
  expect(problems).toEqual([]);
});

test("8b. a hand-picked tone opens the result and the in-place switch changes it", async ({ page }) => {
  await page.goto("/scanner");
  await page.getByTestId("scan-gender-women").click();

  await page.getByRole("button", { name: /Skip, pick my tone/i }).click();
  await page.getByLabel("Skin depth").selectOption("Dark");
  await page.getByRole("button", { name: /Use this tone/i }).click();

  await expect(page).toHaveURL(/\/scanner\/result$/, { timeout: 30_000 });
  await expect(page.getByTestId("result-tone")).toHaveText("Your skin tone: Dark");
  await expect(page.getByText("Women's picks for Dark skin")).toBeVisible();

  await page.getByRole("button", { name: /Not right\? Choose mine/i }).click();
  await page.getByTestId("result-tone-fair").click();
  await expect(page.getByTestId("result-tone")).toHaveText("Your skin tone: Fair");
  await expect(page.getByText("Women's picks for Fair skin")).toBeVisible();
  await expect(page).toHaveURL(/\/scanner\/result$/);
});

test("8c. an image without a face is a clear rescan on the scanner, not a result page", async ({ page }) => {
  await page.goto("/scanner");
  await page.getByTestId("scan-gender-men").click();
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "assets", "skin-patch.jpg"));

  await expect(page.getByTestId("scan-rescan-message")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("scan-rescan-message")).toContainText(/face/i);
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByTestId("scanner-result")).toHaveCount(0);
});
