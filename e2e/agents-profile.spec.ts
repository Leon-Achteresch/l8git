import { expect, test, type Page } from "@playwright/test";

async function openProfile(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?scene=profile", { waitUntil: "domcontentloaded" });
  await page.locator("[data-testid='agent-profile-view']").waitFor({ state: "visible" });
}

test.describe("Agent activity", () => {
  test("profile renders workspace metrics, charts and recent sessions", async ({ page }) => {
    await openProfile(page);
    await expect(page.locator("[data-testid='agent-profile-shell']")).toBeVisible();
    await expect(page.locator("[data-testid='agent-profile-cover']")).toBeVisible();
    await expect(page.locator("[data-testid='agent-stat-tiles']")).toBeVisible();
    await expect(page.locator("[data-testid='agent-activity-heatmap']")).toBeVisible();
    await expect(page.locator("[data-testid='agent-bars-card']")).toBeVisible();
    await expect(page.locator("[data-testid='agent-tokens-card']")).toBeVisible();
    await expect(page.locator("[data-testid='agent-profile-recent']")).toBeVisible();
    // 4 stat tiles
    await expect(page.locator("[data-testid='agent-stat-tiles'] > div")).toHaveCount(4);
    // heatmap has a full year of columns
    const cells = await page.locator("[data-testid='agent-activity-heatmap'] [role='img'] span").count();
    expect(cells).toBeGreaterThan(300);
  });

  test("no horizontal overflow on desktop", async ({ page }) => {
    await openProfile(page);
    const overflow = await page.evaluate(() => {
      const root = document.querySelector("[data-testid='agent-profile-view']");
      if (!root) return { scroll: 0, client: 0 };
      return { scroll: root.scrollWidth, client: root.clientWidth };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    await page.screenshot({ path: "test-results/profile-desktop.png", fullPage: false });
  });

  test("heatmap range switch + month switcher work", async ({ page }) => {
    await openProfile(page);
    await page.getByRole("tab", { name: "26 weeks" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.locator("[data-testid='agent-bars-card']")).toBeVisible();
    await page.screenshot({ path: "test-results/profile-month-switched.png", fullPage: false });
  });

  test("activity counts describe the selected time range", async ({ page }) => {
    await openProfile(page);
    const activity = page.getByTestId("agent-activity-heatmap");
    await expect(activity.getByText("84 sessions · last 52 weeks")).toBeVisible();
    await activity.getByRole("tab", { name: "12 weeks" }).click();
    await expect(activity.getByText("72 sessions · last 12 weeks")).toBeVisible();
    await expect(page.getByTestId("agent-stat-tiles")).toContainText("Recorded cost");
    await expect(page.getByTestId("agent-stat-tiles")).not.toContainText("14.8%");
  });

  test("mobile shows top bar and slide-in drawer without breakage", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?scene=profile", { waitUntil: "domcontentloaded" });
    await page.locator("[data-testid='agent-profile-view']").waitFor({ state: "visible" });
    // sidebar hidden, mobile tab bar visible
    await expect(page.locator("[data-testid='agent-profile-cover']")).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Agent sections" });
    await expect(nav).toBeVisible();
    // let the slide-in drawer settle before asserting position + screenshot
    await expect.poll(async () => nav.boundingBox().then((b) => (b ? Math.round(b.x) : -999)), {
      timeout: 5000,
    }).toBeGreaterThanOrEqual(-1);
    await page.screenshot({ path: "test-results/profile-mobile-drawer.png", fullPage: false });
    await page.keyboard.press("Escape");
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    await page.screenshot({ path: "test-results/profile-mobile.png", fullPage: false });
  });
});
