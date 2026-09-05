import { expect, test } from "@playwright/test";

test.describe("Agent workspace navigation", () => {
  test("fleet, chat, activity and sidebar selection stay in sync", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/?scene=workspace");
    await expect(page.getByTestId("agent-command-center")).toBeVisible();
    await page.locator("[data-agent-overview-row]").first().click();
    await expect(page.locator("[data-agent-chat]")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Agent sections" });
    await expect(nav.getByRole("button", { name: "Session", exact: true })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByTestId("agent-profile-view")).toBeVisible();
    await expect(page.getByText("+14.8%")).toHaveCount(0);
    await expect(page.getByText("Longest task", { exact: true })).toHaveCount(0);
    await page.locator("[data-agent-thread-sidebar]").getByRole("button", { name: "New conversation", exact: true }).click();
    await expect(page.locator("[data-agent-chat]")).toBeVisible();
    await nav.getByRole("button", { name: /^Fleet/ }).click();
    await expect(page.getByTestId("agent-command-center")).toBeVisible();
    await expect(page.locator("[data-agent-sidebar]")).toHaveCount(0);
  });

  test("navigation remains available between tablet and desktop breakpoints", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/?scene=workspace");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Agent sections" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Activity" }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId("agent-profile-view")).toBeVisible();
  });

  test("mobile session selection closes the drawer and reveals the chat", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?scene=workspace");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Activity" }).click();
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "New conversation", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.locator("[data-agent-chat]")).toBeVisible();
    const prompt = page.locator("[data-agent-prompt]");
    await expect(prompt).toBeVisible();
  });

  test("sidebar starts at its default width and persists keyboard resizing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/?scene=profile");
    const divider = page.getByRole("separator", { name: "Resize sidebar" });
    await expect(divider).toHaveAttribute("aria-valuenow", "264");
    await divider.focus();
    await divider.press("ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", "280");
    await page.reload();
    await expect(divider).toHaveAttribute("aria-valuenow", "280");
    await divider.focus();
    await divider.press("Home");
    await expect(divider).toHaveAttribute("aria-valuenow", "232");
    await divider.press("End");
    await expect(divider).toHaveAttribute("aria-valuenow", "380");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(divider).toHaveCount(0);
    await page.getByRole("button", { name: "Expand sidebar" }).first().click();
    await expect(divider).toHaveAttribute("aria-valuenow", "380");
  });
});
