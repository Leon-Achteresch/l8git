import { test, expect, type Page } from "@playwright/test";

// Regressions for the approved UI review fixes (UI-REVIEW.md 1, 3–6) against the real lazy components.
const A = "a".repeat(40), B = "b".repeat(40), BASE = "c".repeat(40);
const PATCH_A = "@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n d";
const PATCH_B = "@@ -1,3 +1,4 @@\n a\n-b\n+X\n+C\n d";

async function open(page: Page, scene: string, init: { holds?: string[]; data?: Record<string, unknown> } = {}) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((i) => { window.__ghfxInit = i; }, init);
  await page.goto(`/?scene=${scene}&lang=en`);
  return errors;
}
const calls = (page: Page, cmd: string) => page.evaluate((c) => window.__ghfx.calls.filter((x) => x.cmd === c).map((x) => x.args), cmd);
const release = (page: Page, pattern: string) => page.evaluate((p) => window.__ghfx.release(p), pattern);
const hold = (page: Page, pattern: string) => page.evaluate((p) => window.__ghfx.hold(p), pattern);
const setData = (page: Page, data: Record<string, unknown>) => page.evaluate((d) => Object.assign(window.__ghfx.data, d), data);
// Initial wait covers the cold lazy-module load of a fresh dev server only.
const ready = (page: Page) => expect(page.locator("#ghci-run")).toHaveValue("1", { timeout: 60_000 });

test("CI Agent tab renders without a render loop", async ({ page }) => {
  const errors = await open(page, "ghfx-ci");
  await ready(page);
  await page.getByRole("tab", { name: "Agent task" }).click();
  await expect(page.getByRole("button", { name: "Build context" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load log" })).toBeVisible();
  // Give a runaway external-store loop time to surface.
  await page.waitForTimeout(500);
  expect(errors.filter((e) => /Maximum update depth|getSnapshot should be cached/i.test(e))).toEqual([]);
});

test("late CI context and worktree results never cross into another run", async ({ page }) => {
  await open(page, "ghfx-ci");
  await ready(page);
  await page.getByRole("tab", { name: "Agent task" }).click();
  const context = page.getByRole("textbox", { name: "Agent context" });

  // Run 1: context build delayed (workflow file read), user switches to run 2, then A's read returns.
  await page.getByRole("button", { name: "Load log" }).click();
  await hold(page, "workflows/ci.yml");
  await page.getByRole("button", { name: "Build context" }).click();
  await page.locator("#ghci-run").selectOption("2");
  await expect(page.getByText(`ci/fix-1-test-1`)).toHaveCount(0);
  await release(page, "workflows/ci.yml");
  await page.waitForTimeout(300);
  await expect(context).toHaveCount(0);

  // Run 2 builds its own context.
  await page.getByRole("button", { name: "Load log" }).click();
  await page.getByRole("button", { name: "Build context" }).click();
  await expect(context).toHaveValue(/test-2/);
  await expect(context).not.toHaveValue(/test-1/);

  // Run 2 worktree creation delayed, user switches back to run 1, then the real worktree finishes.
  await hold(page, "hub_task_worktree");
  await page.getByRole("button", { name: /Create worktree at/ }).click();
  await page.locator("#ghci-run").selectOption("1");
  // The picker updates before the selected run's panel commits. Release only
  // after the old context is gone, so this actually exercises a late result.
  await expect(context).toHaveCount(0);
  await release(page, "hub_task_worktree");
  // The created worktree for run 2 stays reachable rather than silently lost…
  await expect(page.getByText(/ci\/fix-2-test-2 @ bbbbbbb.*Nothing was sent/)).toBeVisible();
  const created = await calls(page, "hub_task_worktree");
  expect(created).toEqual([expect.objectContaining({ branch: "ci/fix-2-test-2", expectedHeadSha: B })]);
  // …but run 1 shows no worktree, no context and no send step.
  await expect(context).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send to agent" })).toHaveCount(0);
  await expect(page.getByText(/^Worktree ci\/fix-2/)).toHaveCount(0);
});

test("a late workflow input schema for A never prepares or dispatches B", async ({ page }) => {
  await open(page, "ghfx-ci");
  await ready(page);
  await page.getByRole("tab", { name: "Run workflow" }).click();
  const workflow = page.locator("form").getByRole("combobox").first();
  await expect(workflow).toHaveValue("11");
  await hold(page, "workflows/a.yml");
  await page.getByRole("button", { name: "Load inputs" }).click();
  await workflow.selectOption("12");
  await release(page, "workflows/a.yml");
  await page.waitForTimeout(300);
  await expect(page.getByText("Load the inputs from the workflow file at this ref before running it.")).toBeVisible();
  await expect(page.getByLabel(/^alpha/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run workflow on main" })).toHaveCount(0);

  await page.getByRole("button", { name: "Load inputs" }).click();
  await expect(page.getByLabel(/^beta/)).toHaveValue("from-b");
  await page.getByRole("button", { name: "Run workflow on main" }).click();
  await expect(page.getByRole("status").filter({ hasText: "99" })).toBeVisible();
  const posts = (await calls(page, "hub_api")).filter((c) => String(c.path).endsWith("/dispatches"));
  expect(posts).toHaveLength(1);
  expect(posts[0].path).toContain("/actions/workflows/12/dispatches");
  expect(posts[0].body).toMatchObject({ ref: "main", inputs: { beta: "from-b" } });
  expect(JSON.stringify(posts[0].body)).not.toContain("alpha");
});

test("refresh reloads artifacts and deployment statuses for the same unchanged run", async ({ page }) => {
  await open(page, "ghfx-ci", { data: { deployments: [{ id: 3, sha: A, environment: "prod", ref: "main", created_at: "2026-11-01T10:06:00Z", description: null }] } });
  await ready(page);
  const refresh = page.getByRole("button", { name: "Refresh" });

  await page.getByRole("tab", { name: "Artifacts" }).click();
  await expect(page.getByText("This run has no artifacts.")).toBeVisible();
  await setData(page, { artifacts: [{ id: 5, name: "bundle", size_in_bytes: 10, expired: false, expires_at: "2026-12-01T00:00:00Z", digest: null, workflow_run: { head_sha: A } }] });
  await refresh.click();
  await expect(page.getByText("bundle", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Deployments" }).click();
  await expect(page.getByText("No status reported yet (state unknown).")).toBeVisible();
  await setData(page, { statuses: [{ id: 1, state: "success", description: "deployed now", created_at: "2026-11-01T10:07:00Z", environment_url: null, log_url: null }] });
  await refresh.click();
  await expect(page.getByText("deployed now")).toBeVisible();
  await expect(page.getByText("No status reported yet (state unknown).")).toHaveCount(0);
});

test("review story: pinned patches, late old-head reply cannot mark the new head current", async ({ page }) => {
  await open(page, "ghfx-story", { holds: [`"expectedHeadSha":"${A}"`], data: { patches: { [`${BASE}:${A}`]: PATCH_A, [`${BASE}:${B}`]: PATCH_B } } });
  const chapter = page.getByRole("listitem").filter({ hasText: "Chapter one" });
  await expect(chapter).toBeVisible({ timeout: 20_000 });
  await expect(chapter.getByText("Current", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Switch to head B" }).click();
  await expect(chapter.getByText("Changed", { exact: true })).toBeVisible();
  // Old head A's (matching) patch arrives late; it must neither enter B's cache nor its observations.
  await release(page, `"expectedHeadSha":"${A}"`);
  await page.waitForTimeout(300);
  await expect(chapter.getByText("Changed", { exact: true })).toBeVisible();
  await expect(chapter.getByText("Current", { exact: true })).toHaveCount(0);

  const reads = await calls(page, "pr_file_patch");
  expect(reads.length).toBeGreaterThanOrEqual(2);
  for (const r of reads) expect(r).toMatchObject({ number: 7, file: "src/a.ts", expectedBaseSha: BASE });
  expect(reads.map((r) => r.expectedHeadSha)).toEqual(expect.arrayContaining([A, B]));
});

test("review story: matching pinned patch is current; a backend revision refusal is shown, not current", async ({ page }) => {
  await open(page, "ghfx-story", { data: { patches: { [`${BASE}:${A}`]: PATCH_A } } });
  const chapter = page.getByRole("listitem").filter({ hasText: "Chapter one" });
  await expect(chapter.getByText("Current", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Head B: the backend refuses (revision drift) — no patch data, chapter is unknown and the refusal is visible.
  await page.getByRole("button", { name: "Switch to head B" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "1 file diffs were refused" })).toBeVisible();
  await expect(chapter.getByText("Unknown", { exact: true })).toBeVisible();
  await chapter.getByRole("button", { name: /src\/a\.ts/ }).click();
  await expect(page.getByText(/refusing unpinned data/)).toBeVisible();
});

test("dependency view shows a same-version dev → runtime classification change", async ({ page }) => {
  const lock = (dev: boolean) => JSON.stringify({ lockfileVersion: 3, packages: {
    "": dev ? { devDependencies: { x: "1.0.0" } } : { dependencies: { x: "1.0.0" } },
    "node_modules/x": { version: "1.0.0", ...(dev ? { dev: true } : {}) },
  } });
  await open(page, "ghfx-semantic", { data: { files: { base: lock(true), head: lock(false) } } });
  const row = page.getByRole("row").filter({ hasText: "x" }).filter({ hasText: "1.0.0" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTitle("Installation classification changed")).toHaveText("direct · dev → direct · runtime");
});
