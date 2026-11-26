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

test("file search matches rename sources and suffixes across a virtualized PR list without loading diffs while typing", async ({ page }) => {
  await page.goto("/?scene=pr-ranges&lang=en&files=large");
  await expect(anchor(page, "+", 4)).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Filter file paths…" });
  const reads = (await calls(page, "pr_file_patch")).length;
  await search.fill("OLD-G");
  await expect(page.getByRole("button", { name: /src\/g\.ts/ })).toContainText("Previously src/old-g.ts");
  await expect(page.getByRole("status").filter({ hasText: "1/6003" })).toBeVisible();
  await search.fill("*.tar.gz");
  await expect(page.getByRole("button", { name: /archives\/result\.tar\.gz/ })).toBeVisible();
  await search.fill("no such file");
  await expect(page.getByText("No matching files", { exact: true })).toBeVisible();
  expect((await calls(page, "pr_file_patch")).length).toBe(reads);
  await search.fill("*.tar.gz");
  await search.press("Enter");
  await expect.poll(() => calls(page, "pr_file_patch")).toContainEqual(expect.objectContaining({ file: "archives/result.tar.gz" }));
  await search.press("Escape");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: /src\/a\.ts/ })).toBeVisible();
});

test("file-list and diff errors can be retried, and returning to a cached diff clears a pending load", async ({ page }) => {
  await page.goto("/?scene=pr-ranges&lang=en&files=retry");
  const alert = page.getByRole("alert").filter({ hasText: "File list temporarily unavailable" });
  await expect(alert).toContainText("Could not load changed files.");
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(anchor(page, "+", 4)).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    let attempt = 0;
    window.__L8GIT_TEST_INVOKE__ = async (cmd, args) => {
      if (cmd === "pr_file_patch" && args?.file === "src/g.ts") {
        attempt++;
        if (attempt === 1) throw Error("Diff temporarily unavailable");
        if (attempt === 2) {
          document.documentElement.dataset.waitingForPatch = "true";
          await new Promise<void>(resolve => window.addEventListener("release-pr-patch", () => resolve(), { once: true }));
        }
      }
      return invoke(cmd, args);
    };
  });
  await page.getByRole("button", { name: /src\/g\.ts/ }).click();
  await expect(page.getByText("Could not load diff.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-waiting-for-patch", "true");
  await page.getByRole("button", { name: /src\/a\.ts/ }).click();
  await expect(anchor(page, "+", 4)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("release-pr-patch")));
  await expect(page.getByRole("button", { name: /src\/a\.ts/ })).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: /src\/g\.ts/ }).click();
  await expect(anchor(page, "+", 1)).toBeVisible();
  await expect(anchor(page, "+", 4)).toHaveCount(0);
});

test("review marking and opening a PR file have independent keyboard buttons", async ({ page }) => {
  await page.goto("/?scene=pr-ranges&lang=en&files=review");
  const select = page.getByRole("button", { name: /src\/a\.ts/ });
  const row = page.getByRole("listitem").filter({ has: select });
  const mark = row.getByRole("checkbox");
  await expect(mark).toBeEnabled();
  await expect(select.getByRole("checkbox")).toHaveCount(0);
  await select.focus();
  await page.keyboard.press("Tab");
  await expect(mark).toBeFocused();
  await page.keyboard.press("Space");
  await expect(mark).toBeChecked();
  await expect(select).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Space");
  await expect(mark).not.toBeChecked();
});

test("an omitted PR patch stays unavailable for review when the file is reopened", async ({ page }) => {
  await page.goto("/?scene=pr-ranges&lang=en&files=review");
  await expect(anchor(page, "+", 4)).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (cmd, args) => {
      if (cmd === "pr_file_patch" && args?.file === "src/g.ts") {
        window.__prr.calls.push({ cmd, args });
        return null;
      }
      return original(cmd, args);
    };
  });
  const g = page.getByRole("button", { name: /src\/g\.ts/ });
  const mark = page.getByRole("listitem").filter({ has: g }).getByRole("checkbox");
  await g.click();
  await expect(page.getByText(/No diff available/, { exact: false })).toBeVisible();
  await expect(mark).toBeDisabled();
  await expect(mark).toHaveAccessibleName(/No diff available/);
  await page.getByRole("button", { name: /src\/a\.ts/ }).click();
  await expect(anchor(page, "+", 4)).toBeVisible();
  await g.click();
  await expect(mark).toBeDisabled();
  expect((await calls(page, "pr_file_patch")).filter(args => args.file === "src/g.ts")).toHaveLength(1);
});

test("PR media reads pinned rename sides and skips content behind an LFS pointer", async ({ page }) => {
  await page.goto("/?scene=pr-ranges&lang=en&files=media");
  await expect(anchor(page, "+", 4)).toBeVisible();
  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (cmd, args) => {
      if (cmd === "lfs_pointer_info" && args) {
        window.__prr.calls.push({ cmd, args });
        if (args.filePath === "old/photo.png") {
          await new Promise(resolve => window.addEventListener("release-pointer", resolve, { once: true }));
          return { isPointer: false, oid: null, size: null };
        }
        return { isPointer: true, oid: "3".repeat(64), size: 95000 };
      }
      if (cmd === "repo_file_bytes_at" && args) {
        window.__prr.calls.push({ cmd, args });
        return { mime: "image/png", size: 68, isBinary: true, base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==" };
      }
      return original(cmd, args);
    };
  });
  const base = "c".repeat(40);
  const bytes = () => calls(page, "repo_file_bytes_at");
  await page.getByRole("button", { name: /new\/picture\.png/ }).click();
  await expect.poll(() => calls(page, "lfs_pointer_info")).toEqual(expect.arrayContaining([
    expect.objectContaining({ filePath: "old/photo.png", treeish: base }),
    expect.objectContaining({ filePath: "new/picture.png", treeish: HEAD }),
  ]));
  await expect(page.getByText("Only the LFS pointer is available in this version.", { exact: true })).toBeVisible();
  expect(await bytes()).toEqual([]);
  await page.evaluate(() => window.dispatchEvent(new Event("release-pointer")));
  await expect.poll(bytes).toEqual([expect.objectContaining({ filePath: "old/photo.png", treeish: base })]);
  await page.getByRole("button", { name: /only-new\.png/ }).click();
  await expect.poll(bytes).toHaveLength(2);
  await page.getByRole("button", { name: /only-base\.png/ }).click();
  await expect.poll(bytes).toHaveLength(3);
  expect((await bytes()).map(args => [args.filePath, args.treeish])).toEqual([
    ["old/photo.png", base], ["only-new.png", HEAD], ["only-base.png", base],
  ]);
});

test("review threads and replies have separate keyboard controls", async ({ page }) => {
  await open(page);
  const toggle = page.getByRole("button").filter({ has: page.getByText("Lines +2 to +4", { exact: true }) });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle.getByRole("button")).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Reply", exact: true }).and(page.locator(":focus"))).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.getByPlaceholder("Comment on this line …")).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await calls(page, "pr_add_comment")).toEqual([]);
});

test("applying one suggestion checks the reviewed lines and passes the exact working copy to the writer", async ({ page }) => {
  await open(page);
  const toggle = page.getByRole("button").filter({ has: page.getByText("Lines +2 to +4", { exact: true }) });
  await toggle.click();
  const apply = page.getByRole("button", { name: "Apply locally" });
  await page.evaluate(() => { window.__prr.local["src/a.ts"] = "a\nB\nlocal edit\nx\nd\ne\n"; });
  await apply.click();
  await expect(page.getByText(/The reviewed lines in src\/a.ts no longer match/)).toBeVisible();
  expect(await calls(page, "repo_write_file")).toEqual([]);
  await page.evaluate(() => { window.__prr.local["src/a.ts"] = "\uFEFFlocal header\r\nB\nc\r\nx\nd\r\nlocal tail"; });
  await apply.click();
  await expect.poll(() => calls(page, "repo_write_file")).toEqual([{
    path: "/tmp/prr-repo", file: "src/a.ts",
    content: "\uFEFFlocal header\r\nB2\nc2\r\nx2\nd\r\nlocal tail",
    expected: { content: "\uFEFFlocal header\r\nB\nc\r\nx\nd\r\nlocal tail", head: HEAD, branch: "feat" },
  }]);
  expect((await calls(page, "pr_file_patch")).at(-1)).toMatchObject({ expectedHeadSha: HEAD, expectedBaseSha: "c".repeat(40) });
});

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
  expect((await calls(page, "repo_read_file")).map(a => a.file).sort()).toEqual(["src/a.ts", "src/g.ts"]);
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

test("a delayed preview cannot restore a selection after closing and reopening the dialog", async ({ page }) => {
  await open(page);
  const opener = page.getByRole("button", { name: "Apply suggestions…" });
  await opener.click();
  const dialog = page.getByTestId("suggestion-batch-dialog");
  await dialog.getByLabel("src/g.ts:1-1").check();
  await page.evaluate(() => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== "repo_read_file") return invoke(command, args);
      document.documentElement.dataset.waitingForSuggestion = "true";
      await new Promise<void>(resolve => window.addEventListener("release-review-read", () => resolve(), { once: true }));
      const content = await invoke(command, args);
      document.documentElement.dataset.releasedSuggestion = "true";
      return content;
    };
  });
  await dialog.getByRole("button", { name: "Preview (1)" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-waiting-for-suggestion", "true");
  await expect(dialog.getByLabel("src/a.ts:2-4")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await opener.click();
  await dialog.getByLabel("src/a.ts:2-4").check();
  await page.evaluate(() => window.dispatchEvent(new Event("release-review-read")));
  await expect(page.locator("html")).toHaveAttribute("data-released-suggestion", "true");
  await expect(dialog.getByTestId("suggestion-batch-preview")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  expect(await calls(page, "hub_apply_suggestions")).toEqual([]);
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
