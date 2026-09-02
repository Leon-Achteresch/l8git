import { expect, test } from "@playwright/test";

import { effortButton, expectPromptOnTop, modeButton, openAgentsScene, prompt } from "./helpers";

test.describe("Agents composer controls", () => {
  test("model, sandbox and mode pills stay in the toolbar", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await expect(page.getByRole("button", { name: "Model" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sandbox" })).toBeVisible();
    await expect(modeButton(page)).toBeVisible();
    await expect(effortButton(page)).toBeVisible();
  });

  test("model picker closes and returns focus to the prompt", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await page.getByRole("button", { name: "Model" }).click();
    await expect(page.getByPlaceholder("Search models…")).toBeVisible();
    await expectPromptOnTop(page);
    await page.getByRole("button", { name: "GPT-5" }).click();
    await expect(page.getByPlaceholder("Search models…")).toHaveCount(0);
    await prompt(page).click();
    await prompt(page).pressSequentially("hi there");
    await expect(prompt(page)).toHaveValue("hi there");
  });

  test("sandbox radio closes so space reaches the prompt", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await page.getByRole("button", { name: "Sandbox" }).click();
    await page.getByRole("menuitemradio", { name: "Read only" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Read only" })).toHaveCount(0);
    await prompt(page).click();
    await prompt(page).press(" ");
    await prompt(page).pressSequentially("safe");
    await expect(prompt(page)).toHaveValue(" safe");
  });

  test("plan mode can be selected without trapping the keyboard", async ({ page }) => {
    await openAgentsScene(page, "composer");
    await modeButton(page).click();
    await page.getByRole("menuitemradio", { name: "Plan" }).click();
    await expect(modeButton(page)).toContainText("Plan");
    await prompt(page).click();
    await prompt(page).pressSequentially("plan this");
    await expect(prompt(page)).toHaveValue("plan this");
  });
});
