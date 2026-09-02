import { expect, type Locator, type Page } from "@playwright/test";

export async function openAgentsScene(
  page: Page,
  scene: string,
  viewport = { width: 1280, height: 860 },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?scene=${scene}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-agent-chat]").waitFor({ state: "visible" });
}

export function prompt(page: Page): Locator {
  return page.getByRole("textbox", { name: /Message Codex/i });
}

export function composer(page: Page): Locator {
  return page.locator("[data-agent-composer]").last();
}

export function effortButton(page: Page): Locator {
  return page.getByRole("button", { name: "Thinking effort" });
}

export function sendButton(page: Page): Locator {
  return page.getByRole("button", { name: "Send prompt" });
}

export function effortHigh(page: Page): Locator {
  return page.getByRole("menuitemradio", { name: "High", exact: true });
}

export function modeButton(page: Page): Locator {
  return page.getByRole("button", { name: "Mode", exact: true });
}

export async function expectNoOverlap(first: Locator, second: Locator) {
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  if (!a || !b) return;
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  expect(overlapX <= 0 || overlapY <= 0).toBeTruthy();
}

export async function expectPromptOnTop(page: Page) {
  const box = await prompt(page).boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el?.closest("[data-agent-prompt]"));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);
}

export async function typeInPrompt(page: Page, text: string) {
  await expectPromptOnTop(page);
  await prompt(page).click();
  await expect(prompt(page)).toBeFocused();
  await prompt(page).pressSequentially(text);
}
