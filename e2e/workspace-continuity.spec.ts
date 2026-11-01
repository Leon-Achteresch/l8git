import { expect, test, type Page } from "@playwright/test";

const hash = (index: number) => (120 - index).toString(16).padStart(40, "0");
const historyViewport = (page: Page) => page.locator("[data-commit-hash]").first().locator("..").locator("..");
const fileViewport = (page: Page) => page.getByTestId("files").locator(".overflow-y-auto").last();

async function openHistory(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?scene=history-workflow");
  await expect(page.locator("[data-commit-hash]").first()).toBeVisible({ timeout: 15_000 });
}

async function switchRepo(page: Page, name: string) {
  await page.getByRole("button", { name: "Jump to branch, commit, file…", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Search", exact: true });
  await palette.getByRole("combobox").fill(name);
  await palette.getByRole("option", { name: `Switch to: ${name}`, exact: true }).click();
  await expect(palette).toBeHidden();
}

test("history keeps its selected commit and scroll through panel and route switches", async ({ page }) => {
  await openHistory(page);
  await historyViewport(page).evaluate(node => { node.scrollTop = 420; });
  const selected = page.locator(`[data-commit-hash="${hash(18)}"]`);
  await selected.click();
  await expect(page.getByText("Release audit 018", { exact: true })).toHaveCount(2);
  const offset = await historyViewport(page).evaluate(node => node.scrollTop);
  expect(offset).toBeGreaterThan(100);

  await page.getByRole("tab", { name: "Commit", exact: true }).click();
  await expect(page.getByTestId("files")).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.getByText("Release audit 018", { exact: true })).toHaveCount(2);
  await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search settings", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Repository", exact: true }).click();
  await expect(page.getByText("Release audit 018", { exact: true })).toHaveCount(2);
  await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);
});

test("history selections stay in their repository and disappear when a filter excludes them", async ({ page }) => {
  await openHistory(page);
  await page.locator(`[data-commit-hash="${hash(2)}"]`).click();
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(2);
  await switchRepo(page, "l8git-history-secondary");
  await expect(page.getByText("Secondary repository baseline", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(0);
  await switchRepo(page, "l8git-history-fixture");
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(2);

  const filters = page.getByRole("form", { name: "History filters", exact: true });
  await filters.getByRole("searchbox", { name: "Commit message", exact: true }).fill("Document token expiry");
  await filters.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("[data-commit-hash]")).toHaveCount(1);
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(0);
});

test("file selection, filter and scroll survive a panel switch without keeping the old panel mounted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?scene=performance");
  const files = page.getByTestId("files");
  await expect(files.getByText("file-0000.txt", { exact: true })).toBeVisible({ timeout: 15_000 });
  const filter = files.getByRole("textbox", { name: "Filter files...", exact: true });
  await filter.fill("file-0");
  await fileViewport(page).evaluate(node => { node.scrollTop = 3600; });
  const selected = files.getByText("file-0105.txt", { exact: true });
  await selected.click();
  await expect(page.locator('[title="files/file-0105.txt"]')).toBeVisible();
  const offset = await fileViewport(page).evaluate(node => node.scrollTop);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.locator("[data-commit-hash]").first()).toBeVisible();
  await expect(files).toHaveCount(0);
  await page.getByRole("tab", { name: "Commit", exact: true }).click();
  await expect(filter).toHaveValue("file-0");
  await expect(page.locator('[title="files/file-0105.txt"]')).toBeVisible();
  await expect.poll(() => fileViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);
  await filter.fill("file-0001");
  await expect(files.getByText("file-0001.txt", { exact: true })).toBeVisible();
  await expect.poll(() => fileViewport(page).evaluate(node => node.scrollTop)).toBe(0);
});

for (const enabled of [true, false]) {
  test(`button press feedback respects animations ${enabled ? "on" : "off"}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(enabled => {
      localStorage.setItem("l8git-animation-prefs", JSON.stringify({ state: { animationsEnabled: enabled }, version: 0 }));
    }, enabled);
    await openHistory(page);
    const button = page.getByRole("form", { name: "History filters", exact: true }).getByRole("button", { name: "Filters", exact: true });
    await button.hover();
    await page.mouse.down();
    await expect.poll(() => button.evaluate(node => getComputedStyle(node).scale)).toBe(enabled ? "0.98" : "none");
    await page.mouse.up();
    // Navigating must not fade or translate the whole content, even with animations enabled.
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    const surface = page.locator("#main-content > div");
    expect(await surface.evaluate(node => ({ opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform }))).toEqual({ opacity: "1", transform: "none" });
  });
}
