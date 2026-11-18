import { expect, test, type Page } from "@playwright/test";

const first = "Co-authored-by: Élodie O’Neil (開発) <elo+fixture@example.invalid>";
const second = "Co-authored-by: 李 静 <li@example.invalid>";
const malformed = "Co-authored by: Missing address";
const description = (page: Page) => page.getByRole("textbox", { name: "Description (optional)", exact: true });
const preview = (page: Page) => page.getByRole("region", { name: "Co-author trailer preview" });
const help = (page: Page) => page.locator('button[title="Suggestions are advisory and never prevent a commit."]');
const selected = (field: ReturnType<typeof description>) => field.evaluate((el: HTMLTextAreaElement) =>
  el.value.slice(el.selectionStart, el.selectionEnd),
);

test("co-author guidance previews the exact draft, selects its lines and leaves commit available", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await page.goto("/?scene=git-workflow&lang=en");
  await page.getByTestId("files").getByRole("button", { name: "Stage all files", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Commit message", exact: true }).fill("Review the export");
  await page.getByRole("button", { name: "Add description", exact: true }).click();
  const body = description(page);
  const original = `Details.\n${first}\n\n${malformed}`;
  await body.fill(original);
  await help(page).press("Enter");
  await expect(preview(page).getByText(first, { exact: true })).toBeVisible();
  await expect(preview(page).getByText(malformed, { exact: true })).toBeVisible();
  await expect(preview(page).getByText(/final trailer block/)).toHaveCount(1);
  await expect(preview(page).getByText(/one Co-authored-by/)).toHaveCount(1);
  await expect(preview(page).getByText(/email linked to the person’s account/)).toBeVisible();
  await preview(page).getByRole("button", { name: "Edit Description line 4", exact: true }).press("Enter");
  await expect(body).toBeFocused();
  expect(await selected(body)).toBe(malformed);
  await expect(body).toHaveValue(original);

  const corrected = `Details.\n\n${first}\n${second}`;
  await body.fill(corrected);
  await expect(preview(page).locator("code")).toHaveText([first, second]);
  await expect(preview(page).getByText(/final trailer block|one Co-authored-by/)).toHaveCount(0);
  const intentional = `${corrected}\n\nIntentional closing paragraph.`;
  await body.fill(intentional);
  await expect(preview(page).getByText(/final trailer block/)).toHaveCount(2);
  await expect(body).toHaveValue(intentional);
  await page.getByRole("button", { name: "Commit to main", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__L8GIT_TEST_CALLS__!
    .find(call => call.command === "commit_changes")?.args?.message)).toBe(`Review the export\n\n${intentional}`);
});

test("switching repositories keeps co-author preview and draft scoped to their editor", async ({ page }) => {
  await page.goto("/?scene=history-workflow&lang=en");
  const commitTab = page.getByTestId("repository-sidebar").getByRole("tab", { name: "Commit", exact: true });
  await commitTab.click();
  await page.getByRole("button", { name: "Add description", exact: true }).click();
  await description(page).fill(first);
  await help(page).click();
  await expect(preview(page).getByText(first, { exact: true })).toBeVisible();
  const switchRepo = async (name: string) => {
    await page.getByRole("button", { name: "Jump to branch, commit, file…", exact: true }).click();
    const search = page.getByRole("dialog", { name: "Search", exact: true });
    await search.getByRole("combobox").fill(name);
    await search.getByRole("option", { name: `Switch to: ${name}`, exact: true }).click();
    await expect(search).toBeHidden();
  };
  await switchRepo("l8git-history-secondary");
  await page.getByRole("button", { name: "Add description", exact: true }).click();
  await description(page).fill(second);
  await expect(preview(page).locator("code")).toHaveText([second]);
  await switchRepo("l8git-history-fixture");
  await expect(description(page)).toHaveValue(first);
  await expect(preview(page).locator("code")).toHaveText([first]);
});
