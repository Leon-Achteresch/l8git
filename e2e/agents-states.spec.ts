import { expect, test } from "@playwright/test";

import { composer, expectNoOverlap, expectPromptOnTop, openAgentsScene, prompt } from "./helpers";

test.describe("Agents connection states", () => {
  test("connecting card is contained in the pane", async ({ page }) => {
    await openAgentsScene(page, "connecting");
    await expect(page.getByText("Connecting Codex…")).toBeVisible();
    const card = page.locator("[data-agent-status-card]");
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.width).toBeLessThan(viewport.width * 0.7);
    expect(box.height).toBeLessThan(viewport.height * 0.7);
    await expectNoOverlap(card, composer(page));
  });

  test("error card shows retry without covering the whole viewport", async ({ page }) => {
    await openAgentsScene(page, "error");
    await expect(page.getByText("Connection to Codex failed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    const card = page.locator("[data-agent-status-card]");
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.width).toBeLessThan(viewport.width * 0.7);
    expect(box.height).toBeLessThan(viewport.height * 0.7);
  });

  test("sign-in card stays centered and compact", async ({ page }) => {
    await openAgentsScene(page, "auth");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    const card = page.locator("[data-agent-status-card]");
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.width).toBeLessThan(viewport.width * 0.7);
  });

  test("busy thread keeps the prompt enabled for steering", async ({ page }) => {
    await openAgentsScene(page, "busy");
    await expect(page.getByText("Working").first()).toBeVisible();
    await expect(prompt(page)).toBeEnabled();
    await expectPromptOnTop(page);
    await prompt(page).fill("stop");
    await expect(prompt(page)).toHaveValue("stop");
  });
});
