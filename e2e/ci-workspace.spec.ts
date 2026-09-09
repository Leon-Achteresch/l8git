import { test, expect } from "@playwright/test";

test("CI filters combine, preferences persist and details support keyboard navigation", async ({
  page,
}) => {
  await page.goto("/?scene=ci&lang=de&theme=light");
  await expect(page.locator(".ci-run-row")).toHaveCount(12);
  await page.getByRole("button", { name: /^Fehler/ }).click();
  await expect(page.locator(".ci-run-row")).toHaveCount(3);
  await page
    .getByRole("combobox", { name: "Alle Branches" })
    .selectOption("main");
  await expect(page.locator(".ci-run-row")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Runs, Commits, Branches suchen…" })
    .fill("does-not-exist");
  await expect(page.getByText("Keine Runs für diese Filter.")).toBeVisible();
  await expect(
    page
      .getByText("Keine Runs für diese Filter.")
      .locator("..")
      .getByRole("button", { name: "Filter zurücksetzen" }),
  ).toBeVisible();
  await page.locator(".ci-list-caption").getByRole("button").click();
  await page.getByRole("button", { name: "Darstellung" }).click();
  await page.getByLabel("Kompakte Zeilen").check();
  await page.getByLabel("Metadaten anzeigen").uncheck();
  await page.reload();
  await expect(page.locator(".ci-run-table")).toHaveAttribute(
    "data-compact",
    "true",
  );
  await expect(page.locator(".ci-run-table")).toHaveAttribute(
    "data-metadata",
    "false",
  );
  await page.locator(".ci-run-main").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ci-detail")).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();
  await page.getByRole("button", { name: "Details schließen" }).click();
  await page.getByRole("tab", { name: "HEAD-Checks" }).click();
  await expect(page.getByText("Typecheck & lint")).toBeVisible();
  await page.getByText("Build desktop app").click();
  await expect(
    page.getByText("Build failed: missing release artifact."),
  ).toBeVisible();
});

test("CI layout fits narrow and dark workspaces", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 850 });
  await page.goto("/?scene=ci&lang=de");
  await expect(page.locator(".ci-run-row")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: "test-results/ci-narrow.png" });
  await page.locator(".ci-run-main").first().click();
  await expect(page.locator(".ci-detail")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/ci-dark-details.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?scene=ci&lang=de&theme=light");
  await expect(page.locator(".ci-run-row")).toHaveCount(12);
  await page.screenshot({ path: "test-results/ci-desktop.png" });
});
