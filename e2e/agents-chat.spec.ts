import { expect, test } from "@playwright/test";

import {
  composer,
  expectNoOverlap,
  expectPromptOnTop,
  openAgentsScene,
  prompt,
  sendButton,
  typeInPrompt,
} from "./helpers";

test.describe("Agents conversation", () => {
  test("last compact notice stays in the transcript and does not cover the composer", async ({
    page,
  }) => {
    await openAgentsScene(page, "chat");
    const compact = page.locator("[data-agent-compact]").last();
    await expect(compact).toBeVisible();
    await page.locator("[data-agent-transcript-scroll]").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const box = await compact.boundingBox();
    const conversation = await page.locator("[data-agent-conversation]").boundingBox();
    const composerBox = await composer(page).boundingBox();
    expect(box).toBeTruthy();
    expect(conversation).toBeTruthy();
    expect(composerBox).toBeTruthy();
    if (!box || !conversation || !composerBox) return;
    expect(box.height).toBeLessThan(80);
    expect(box.width).toBeLessThan(420);
    await expectNoOverlap(compact, composer(page));
    expect(box.y).toBeGreaterThanOrEqual(conversation.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(composerBox.y + 1);
    await expectPromptOnTop(page);
  });

  test("turns do not overlap each other", async ({ page }) => {
    await openAgentsScene(page, "chat");
    const turns = page.locator("[data-agent-turn]");
    await expect(turns.first()).toBeVisible();
    const count = await turns.count();
    expect(count).toBeGreaterThan(1);
    const boxes = [];
    for (let index = 0; index < count; index += 1) {
      const box = await turns.nth(index).boundingBox();
      if (box) boxes.push(box);
    }
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height - 8);
    }
  });

  test("context meter sits in the dock without overflowing the composer", async ({ page }) => {
    await openAgentsScene(page, "chat", { width: 900, height: 800 });
    const dock = page.locator("[data-agent-composer-dock]");
    await expect(dock).toBeVisible();
    await expect(page.getByText("44%")).toBeVisible();
    const dockBox = await dock.boundingBox();
    const composerBox = await composer(page).boundingBox();
    expect(dockBox).toBeTruthy();
    expect(composerBox).toBeTruthy();
    if (!dockBox || !composerBox) return;
    expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(composerBox.x + composerBox.width + 8);
    expect(dockBox.y).toBeGreaterThan(composerBox.y);
  });

  test("narrow chat keeps composer and send button inside the pane", async ({ page }) => {
    await openAgentsScene(page, "chat", { width: 520, height: 780 });
    const pane = page.locator("[data-agent-chat]");
    const paneBox = await pane.boundingBox();
    const send = await sendButton(page).boundingBox();
    const composerBox = await composer(page).boundingBox();
    expect(paneBox).toBeTruthy();
    expect(send).toBeTruthy();
    expect(composerBox).toBeTruthy();
    if (!paneBox || !send || !composerBox) return;
    expect(composerBox.x).toBeGreaterThanOrEqual(paneBox.x - 1);
    expect(composerBox.x + composerBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
    expect(send.x + send.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
    expect(send.x).toBeGreaterThanOrEqual(paneBox.x - 1);
  });

  test("prompt still accepts spaces in an existing thread", async ({ page }) => {
    await openAgentsScene(page, "chat");
    await typeInPrompt(page, "fix the compact overlay");
    await expect(prompt(page)).toHaveValue("fix the compact overlay");
  });

  test("transcript viewport stops above the composer", async ({ page }) => {
    await openAgentsScene(page, "chat");
    const conversation = await page.locator("[data-agent-conversation]").boundingBox();
    const composerBox = await composer(page).boundingBox();
    expect(conversation).toBeTruthy();
    expect(composerBox).toBeTruthy();
    if (!conversation || !composerBox) return;
    expect(conversation.y + conversation.height).toBeLessThanOrEqual(composerBox.y + 1);
    await expectPromptOnTop(page);
  });
});
