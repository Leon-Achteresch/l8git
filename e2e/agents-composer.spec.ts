import { expect, test } from "@playwright/test";

import {
  effortButton,
  effortHigh,
  expectNoOverlap,
  expectPromptOnTop,
  openAgentsScene,
  prompt,
  sendButton,
} from "./helpers";

test.describe("Agents composer", () => {
  test("empty chat shows a centered composer and starter prompts", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await expect(prompt(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Review the uncommitted changes." })).toBeVisible();
    await expect(effortButton(page)).toBeVisible();
    await expect(sendButton(page)).toBeVisible();
  });

  test("toolbar keeps the send button visible next to the chips", async ({ page }) => {
    await openAgentsScene(page, "composer", { width: 720, height: 800 });
    const send = await sendButton(page).boundingBox();
    const bar = await page.locator("[data-agent-composer-toolbar]").first().boundingBox();
    expect(send).toBeTruthy();
    expect(bar).toBeTruthy();
    if (!send || !bar) return;
    expect(send.x + send.width).toBeLessThanOrEqual(bar.x + bar.width + 2);
    expect(send.y).toBeGreaterThanOrEqual(bar.y - 2);
    expect(send.y + send.height).toBeLessThanOrEqual(bar.y + bar.height + 2);
  });

  test("space is typed after opening effort and focusing the prompt again", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await effortButton(page).click();
    await expect(effortHigh(page)).toBeVisible();
    await expectPromptOnTop(page);
    await prompt(page).click();
    await expect(effortHigh(page)).toHaveCount(0);
    await expect(prompt(page)).toBeFocused();
    await prompt(page).press(" ");
    await prompt(page).pressSequentially("hello world");
    await expect(prompt(page)).toHaveValue(" hello world");
  });

  test("focusing the prompt closes the effort menu so space types", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await effortButton(page).click();
    await expect(effortHigh(page)).toBeVisible();
    await prompt(page).focus();
    await expect(effortHigh(page)).toHaveCount(0);
    await expect(prompt(page)).toBeFocused();
    await prompt(page).press(" ");
    await prompt(page).pressSequentially("ok");
    await expect(prompt(page)).toHaveValue(" ok");
  });

  test("space after selecting an effort still types in the prompt", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await effortButton(page).click();
    await effortHigh(page).click();
    await expect(effortHigh(page)).toHaveCount(0);
    await prompt(page).click();
    await prompt(page).press(" ");
    await prompt(page).pressSequentially("ok");
    await expect(prompt(page)).toHaveValue(" ok");
  });

  test("effort menu does not cover the whole UI", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await effortButton(page).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.width).toBeLessThan(viewport.width * 0.5);
    expect(box.height).toBeLessThan(viewport.height * 0.6);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await expectNoOverlap(menu, effortButton(page));
  });

  test("slash commands list compact without covering the send button", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await prompt(page).fill("/comp");
    await expect(page.getByRole("option", { name: /compact/i })).toBeVisible();
    await expectNoOverlap(
      page.getByRole("listbox", { name: "Commands" }),
      sendButton(page),
    );
  });

  test("enter sends only from a non-empty prompt", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await expect(sendButton(page)).toBeDisabled();
    await prompt(page).fill("Ship it");
    await expect(sendButton(page)).toBeEnabled();
    await prompt(page).press("Shift+Enter");
    await expect(prompt(page)).toHaveValue("Ship it\n");
  });
});
