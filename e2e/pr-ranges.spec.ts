import { test, expect, type Page } from "@playwright/test";

// IDs 17 (multiline/side-aware review comments) and 18 (batch suggestions) on the real PR Files tab.
const HEAD = "a".repeat(40);
const TITLE = "Comment on this line (Shift-click to extend a range)";
const anchor = (page: Page, sign: "+" | "-", line: number) => page.getByRole("button", { name: `${TITLE} (${sign}${line})`, exact: true });
const drafts = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("l8git-pr-review-drafts") ?? "{}").state?.drafts?.["/tmp/prr-repo#7"] ?? []);
const calls = (page: Page, cmd: string) => page.evaluate((c) => window.__prr.calls.filter((x) => x.cmd === c).map((x) => x.args), cmd);

async function open(page: Page, branch = "feat") {
  await page.goto(`/?scene=pr-ranges&lang=en&branch=${branch}`);
  await expect(anchor(page, "+", 4)).toBeAttached({ timeout: 20_000 });
}

test("reversed Shift range, old-side line and invalid mixed range use real diff anchors", async ({ page }) => {
  await open(page);
  // Remote thread metadata from GitHub: full range and outdated state are shown.
  await expect(page.getByText("Lines +2 to +4").first()).toBeVisible();
  await expect(page.getByText("Outdated")).toBeVisible();

  await anchor(page, "+", 4).click({ force: true });
  await anchor(page, "+", 2).click({ force: true, modifiers: ["Shift"] });
  const composer = page.getByTestId("pr-range-composer");
  await expect(composer).toContainText("Lines +2 to +4");
  await expect(page.locator("[data-range-selected]")).toHaveCount(3);
  await composer.getByPlaceholder("Comment on this line …").fill("range note");
  await composer.getByRole("button", { name: "Add to review" }).click();

  await anchor(page, "-", 2).click({ force: true });
  await expect(page.getByTestId("pr-range-composer")).toContainText("Line -2");
  // old 2 → new 2 cannot be submitted as start_line < line: refused, selection kept.
  await anchor(page, "+", 2).click({ force: true, modifiers: ["Shift"] });
  await expect(page.getByText("A comment range must stay in one diff hunk")).toBeVisible();
  await page.getByTestId("pr-range-composer").getByPlaceholder("Comment on this line …").fill("old side");
  await page.getByTestId("pr-range-composer").getByRole("button", { name: "Add to review" }).click();

  await expect.poll(() => drafts(page)).toEqual([
    expect.objectContaining({ filePath: "src/a.ts", line: 4, side: "RIGHT", startLine: 2, startSide: "RIGHT", body: "range note" }),
    expect.objectContaining({ filePath: "src/a.ts", line: 2, side: "LEFT", body: "old side" }),
  ]);
  // Pending drafts render with their range label.
  await expect(page.getByText("Old line 2")).toBeVisible();
});

test("batch suggestions: overlap blocks, both files preview, explicit confirm, no thread resolve", async ({ page }) => {
  await open(page);
  const readsBefore = (await calls(page, "pr_file_patch")).length;
  await page.getByRole("button", { name: "Apply suggestions…" }).click();
  const dialog = page.getByTestId("suggestion-batch-dialog");
  await expect(dialog.getByTestId("suggestion-candidate")).toHaveCount(4);
  await expect(dialog.getByLabel("src/a.ts (Outdated)")).toBeDisabled(); // outdated: no current line, never original_line
  await expect(dialog.getByText("outdated, not applicable")).toBeVisible();

  await dialog.getByLabel("src/a.ts:2-4").check();
  await dialog.getByLabel("src/a.ts:2-2").check();
  await expect(dialog.getByText("overlaps another selected suggestion")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "Preview (2)" })).toBeDisabled();

  await dialog.getByLabel("src/a.ts:2-2").uncheck();
  await dialog.getByLabel("src/g.ts:1-1").check();
  await dialog.getByRole("button", { name: "Preview (2)" }).click();
  const preview = dialog.getByTestId("suggestion-batch-preview");
  await expect(preview).toContainText("src/a.ts");
  await expect(preview).toContainText("src/g.ts");
  await expect(preview).toContainText("x2");
  await expect(preview).toContainText("Uno");
  const apply = dialog.getByRole("button", { name: "Apply", exact: true });
  await expect(apply).toBeDisabled();
  await dialog.getByLabel(/I reviewed these changes/).check();
  await apply.click();

  await expect.poll(() => calls(page, "hub_apply_suggestions")).toHaveLength(1);
  const [call] = await calls(page, "hub_apply_suggestions");
  expect(call.expectedHead).toBe(HEAD);
  expect(call.edits).toEqual([
    { file: "src/a.ts", expected_content: "a\nB\nc\nx\nd\ne\n", content: "a\nB2\nc2\nx2\nd\ne\n" },
    { file: "src/g.ts", expected_content: "ONE\ntwo\n", content: "Uno\ntwo\n" },
  ]);
  expect(await calls(page, "pr_resolve_thread")).toEqual([]);
  // Expected lines came from the pinned base→head patch. Every batch read must be pinned; the
  // dialog legitimately re-reads after the explicit thread reload, so the count is not fixed.
  const batchReads = (await calls(page, "pr_file_patch")).slice(readsBefore);
  expect(batchReads.length).toBeGreaterThan(0);
  expect([...new Set(batchReads.map((a) => a.file))].sort()).toEqual(["src/a.ts", "src/g.ts"]);
  for (const a of batchReads) {
    expect(a).toEqual({ path: "/tmp/prr-repo", number: 7, file: a.file, expectedHeadSha: HEAD, expectedBaseSha: "c".repeat(40) });
  }
});

test("batch suggestions reject stale local content per suggestion", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__prr.local["src/a.ts"] = "a\nB\nCHANGED\nx\nd\ne\n"; });
  await page.getByRole("button", { name: "Apply suggestions…" }).click();
  const dialog = page.getByTestId("suggestion-batch-dialog");
  await dialog.getByLabel("src/a.ts:2-4").check();
  await dialog.getByLabel("src/g.ts:1-1").check();
  await dialog.getByRole("button", { name: "Preview (2)" }).click();
  await expect(dialog.getByText("stale: local file changed")).toBeVisible();
  const preview = dialog.getByTestId("suggestion-batch-preview");
  await expect(preview).toContainText("1 selected suggestion(s) no longer match");
  await expect(preview).toContainText("src/g.ts");
  await expect(preview.getByText("src/a.ts", { exact: true })).toHaveCount(0);
});

test("batch suggestions refuse a different checked-out branch", async ({ page }) => {
  await open(page, "main");
  await page.getByRole("button", { name: "Apply suggestions…" }).click();
  const dialog = page.getByTestId("suggestion-batch-dialog");
  await dialog.getByLabel("src/g.ts:1-1").check();
  await expect(dialog.getByText("Check out feat to apply suggestions.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Preview (1)" })).toBeDisabled();
  expect(await calls(page, "repo_read_file")).toEqual([]);
});
