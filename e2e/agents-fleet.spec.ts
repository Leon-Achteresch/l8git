import { expect, test, type Page } from "@playwright/test";

async function openFleet(page: Page, scene = "fleet") {
  await page.goto(`/?scene=${scene}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("agent-command-center")).toBeVisible();
}

const rows = (page: Page) => page.locator("[data-agent-overview-row]");

test.describe("Agent fleet", () => {
  test("command center groups attention, work, and ready", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?scene=fleet", { waitUntil: "domcontentloaded" });
    const center = page.locator("[data-testid='agent-command-center']");
    await expect(center).toBeVisible();
    await expect(center.getByRole("heading", { name: "Fleet" })).toBeVisible();
    await expect(center.getByRole("heading", { name: "Needs you" })).toBeVisible();
    await expect(center.getByRole("heading", { name: "Working" })).toBeVisible();
    await expect(center.getByRole("heading", { name: "Ready" })).toBeVisible();
    await expect(center.getByRole("button", { name: "New session" })).toBeVisible();
    await center.getByRole("searchbox").or(center.getByPlaceholder("Search sessions, repos or branches…")).fill("zzzz-no-match");
    await expect(center.getByText("No matches.")).toBeVisible();
  });

  test("status and provider filters combine and can be reset", async ({ page }) => {
    await openFleet(page);
    const filters = page.getByRole("navigation", { name: "Session status" });
    await filters.getByRole("button", { name: /Needs you/ }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator("[data-agent-overview-row][data-status='running']")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Filter by agent" }).selectOption("claude");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("No matches.")).toBeVisible();
    await page.getByRole("button", { name: "Reset filters", exact: true }).last().click();
    await expect(page.getByRole("combobox")).toHaveValue("all");
    await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(60);
  });

  test("all sessions remain reachable through pagination and search", async ({ page }) => {
    await openFleet(page);
    await expect(rows(page)).toHaveCount(60);
    await expect(page.getByRole("status")).toHaveText("Showing 60 of 84 sessions");
    await page.getByRole("button", { name: /Show 24 more/ }).click();
    await expect(rows(page)).toHaveCount(84);
    await expect(page.getByRole("status")).toHaveText("Showing 84 of 84 sessions");
    const search = page.getByRole("searchbox");
    await search.fill("Backfill context 117d ago");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Backfill context 117d ago");
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(rows(page)).toHaveCount(60);
  });

  test("refresh reports pending and failed requests without hiding sessions", async ({ page }) => {
    await openFleet(page, "fleet-error");
    const refresh = page.getByRole("button", { name: "Reload sessions" });
    await refresh.click();
    await expect(refresh).toBeDisabled();
    await expect(refresh).toHaveAttribute("aria-busy", "true");
    await expect(rows(page)).toHaveCount(60);
    await expect(page.getByRole("alert")).toContainText("Codex: session refresh failed");
    await expect(refresh).toBeEnabled();
    await page.getByRole("alert").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("initial loading does not claim that there are no sessions", async ({ page }) => {
    await openFleet(page, "fleet-loading");
    await expect(page.getByRole("status")).toHaveText("Loading conversations…");
    await expect(page.getByText("No agent sessions in this workspace yet.")).toHaveCount(0);
    await page.goto("/?scene=fleet-empty");
    await expect(page.getByText("No agent sessions in this workspace yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New session" }).last()).toBeEnabled();
  });

  test("narrow fleet keeps session titles and filters inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFleet(page);
    const viewportWidth = 390;
    for (const target of [page.getByRole("searchbox"), page.getByRole("combobox"), rows(page).first()]) {
      const box = await target.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
    }
    await expect(rows(page).first().getByText("Refactor token ledger #2")).toBeVisible();
    await page.screenshot({ path: "test-results/fleet-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "test-results/fleet-desktop.png" });
    await page.goto("/?scene=fleet&theme=light");
    await expect(rows(page).first()).toBeVisible();
    await expect(rows(page).first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.screenshot({ path: "test-results/fleet-desktop-light.png" });
  });

  test("German controls and light theme remain readable", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/?scene=fleet&lang=de&theme=light");
    await expect(page.getByRole("heading", { name: "Flotte", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Nach Agent filtern" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("60 von 84 Sessions angezeigt");
    await expect(rows(page).first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator("[data-agent-overview-row] [data-tone='waiting']").first()).toHaveCSS("opacity", "1");
    await page.screenshot({ path: "test-results/fleet-german-light.png" });
  });
});
