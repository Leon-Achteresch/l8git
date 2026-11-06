import { test, expect, type Page } from "@playwright/test";

// Task/workspace/project/form/reminder flows against the real production components (ui-test/github-task-flow-scene.tsx).
// Every assertion on a side effect reads the actual outgoing IPC payload the component sent.
const REPO = "/tmp/ghtf-repo";
const BASE_SHA = "1".repeat(40), H0 = "2".repeat(40), H1 = "3".repeat(40);
const HUB = "hub:leon@github.com/o/r";
type Call = { cmd: string; args: Record<string, unknown> };

async function open(page: Page, scene: string, init: Record<string, unknown> = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((i) => { window.__ghtfInit = i; }, init);
  await page.goto(`/?scene=${scene}&lang=en`, { waitUntil: "domcontentloaded" });
  // Readiness: the lazily loaded scene has installed its scripted provider (cold dev-server loads can exceed 5s).
  await page.waitForFunction(() => window.__ghtf !== undefined);
  return errors;
}
const calls = (page: Page, cmd?: string) => page.evaluate((c) => window.__ghtf.calls.filter((x) => !c || x.cmd === c), cmd) as Promise<Call[]>;
const hubWrites = async (page: Page) => (await calls(page, "hub_api")).filter((c) => c.args.method !== "GET" && c.args.path !== "/graphql");
const gqlMutations = async (page: Page) => (await calls(page, "hub_api")).filter((c) => c.args.path === "/graphql" && /mutation/.test(String((c.args.body as { query: string }).query)));
const setData = (page: Page, data: Record<string, unknown>) => page.evaluate((d) => Object.assign(window.__ghtf.data, d), data);
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("l8git-github-workspace-v1") ?? "{}").state);

// Each run starts a fresh dev server (reuseExistingServer: false). Compile every scene module once before the timed tests;
// all ghtf scenes are statically imported by one scene module; create + issue also pull in the dialog/sheet/markdown chunks. Only this warm-up gets a longer budget.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await browser.newPage();
  for (const [scene, ready] of [["ghtf-create", "Bug report"], ["ghtf-issue", "Roadmap"]] as const) {
    await page.goto(`http://127.0.0.1:${process.env.L8GIT_UI_TEST_PORT ?? 4173}/?scene=${scene}&lang=en`, { waitUntil: "domcontentloaded", timeout: 120_000 }); // browser.newPage has no baseURL
    await page.getByText(ready).first().waitFor({ state: "attached", timeout: 120_000 });
  }
  await page.close();
});

test.describe("issue create forms (26)", () => {
  test("YAML form: required field blocks submit, then title/labels/assignees go in ONE create request", async ({ page }) => {
    const errors = await open(page, "ghtf-create");
    const template = page.getByLabel("Template");
    await expect(template.locator("option")).toHaveText(["Blank issue", "Bug report", "Feature request (Markdown)", ".github/ISSUE_TEMPLATE/broken.yml (invalid)"]);
    await expect(template.locator("option", { hasText: "broken.yml" })).toHaveAttribute("disabled", "");
    await expect(page.getByText(/broken\.yml could not be read: .*slider/)).toBeVisible();

    await template.selectOption(".github/ISSUE_TEMPLATE/bug.yml");
    const title = page.getByRole("textbox", { name: "Title" });
    await expect(title).toHaveValue("[Bug] ");
    await expect(page.getByText("Template applies labels: bug, triage · assignees: leon")).toBeVisible();
    await title.fill("[Bug] Crash on save");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page.getByText("This field is required.")).toBeVisible();
    expect(await hubWrites(page)).toEqual([]);

    await page.getByRole("textbox", { name: /Version/ }).fill("1.1.0");
    await page.getByRole("textbox", { name: /Steps/ }).fill("save twice");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page.getByLabel("Created count")).toHaveText("1");
    const writes = await hubWrites(page);
    expect(writes).toHaveLength(1);
    expect(writes[0].args).toEqual({
      host: "github.com", login: "leon", method: "POST", path: "/repos/o/r/issues",
      body: { title: "[Bug] Crash on save", body: "### Version\n\n1.1.0\n\n### Steps\n\nsave twice", labels: ["bug", "triage"], assignees: ["leon"] },
    });
    expect(errors).toEqual([]);
  });

  test("Markdown front matter: title, body, labels and assignees preserved in the create request", async ({ page }) => {
    await open(page, "ghtf-create");
    await page.getByLabel("Template").selectOption(".github/ISSUE_TEMPLATE/feature.md");
    const title = page.getByRole("textbox", { name: "Title" });
    await expect(title).toHaveValue("[Feature] ");
    const body = page.getByPlaceholder("Description (Markdown)");
    await expect(body).toHaveValue("## Idea\n");
    await expect(page.getByText("Template applies labels: enhancement, ui · assignees: octo")).toBeVisible();
    await title.fill("[Feature] Dark mode");
    await body.fill("## Idea\nDark mode please");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page.getByLabel("Created count")).toHaveText("1");
    const writes = await hubWrites(page);
    expect(writes.map((w) => w.args.body)).toEqual([{ title: "[Feature] Dark mode", body: "## Idea\nDark mode please", labels: ["enhancement", "ui"], assignees: ["octo"] }]);
  });

  test("missing template directory (404) means no templates; blank issue still creates", async ({ page }) => {
    await open(page, "ghtf-create", { templates: "missing" });
    // StrictMode may list twice; every request must be the one directory read, and none may write.
    await expect.poll(async () => (await calls(page, "hub_api")).length).toBeGreaterThan(0);
    expect(new Set((await calls(page, "hub_api")).map((c) => `${c.args.method} ${c.args.path}`))).toEqual(new Set(["GET /repos/o/r/contents/.github/ISSUE_TEMPLATE"]));
    await expect(page.getByLabel("Template")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Title" }).fill("Plain");
    await page.getByRole("button", { name: "Create issue" }).click();
    await expect(page.getByLabel("Created count")).toHaveText("1");
    expect((await hubWrites(page)).map((w) => w.args.body)).toEqual([{ title: "Plain", body: "", labels: [], assignees: [] }]);
  });

  test("permission error (403) listing templates is shown, not treated as no templates", async ({ page }) => {
    await open(page, "ghtf-create", { templates: "denied" });
    await expect(page.getByRole("alert")).toHaveText("Could not list issue templates: github.com 403: Resource not accessible by integration");
    await expect(page.getByLabel("Template")).toHaveCount(0);
  });
});

test.describe("project fields (28)", () => {
  test("single-select sends the real option ID; iteration field is not editable", async ({ page }) => {
    await open(page, "ghtf-issue");
    const status = page.getByRole("combobox", { name: "Status" });
    await expect(status).toHaveValue("opt_todo_8f2");
    await expect(page.getByRole("button", { name: "keep" })).toBeVisible();
    await expect(page.getByText("Sprint")).toHaveCount(0);
    await status.selectOption({ label: "Done" });
    await expect.poll(async () => (await gqlMutations(page)).length).toBe(1);
    const [m] = await gqlMutations(page);
    expect(String((m.args.body as { query: string }).query)).toContain("updateProjectV2ItemFieldValue");
    expect((m.args.body as { variables: unknown }).variables).toEqual({ project: "PVT_1", item: "PVTI_1", field: "F_STATUS", value: { singleSelectOptionId: "opt_done_c41" } });
  });

  test("missing field-definition permission: single-select falls back to read-only, nothing is written", async ({ page }) => {
    await open(page, "ghtf-issue", { fieldsDenied: true });
    await expect(page.getByText(/Field options unavailable — single-select fields are read-only: github\.com 403/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveCount(0);
    await expect(page.getByTitle("This field type cannot be edited here.")).toHaveText("Todo");
    await expect(page.getByRole("button", { name: "keep" })).toBeVisible();
    expect(await gqlMutations(page)).toEqual([]);
  });
});

test("issue workspace (3): pinned full SHA, selected comments, edited context, nothing runs until clicked", async ({ page }) => {
  await open(page, "ghtf-issue", { cleanupWarning: "temporary ref left behind" });
  await expect(page.getByText(`Branches from pinned commit ${BASE_SHA.slice(0, 12)}`)).toBeVisible();
  expect((await calls(page, "git_resolve_commit")).map((c) => c.args)).toContainEqual({ path: REPO, rev: "HEAD" });
  const branch = await page.getByRole("textbox", { name: "Branch name" }).inputValue();
  expect(branch).toMatch(/42/);

  await page.getByRole("checkbox", { name: /bob: Repro/ }).check();
  const context = page.getByRole("textbox", { name: "Context for terminal/agent (editable)" });
  await expect(context).toHaveValue(/BEGIN COMMENT by bob/);
  await expect(context).not.toHaveValue(/alice/);
  const edited = `${await context.inputValue()}\nUser note: focus on writer.ts`;
  await context.fill(edited);
  expect(await calls(page, "hub_task_worktree")).toEqual([]);

  await page.getByRole("button", { name: "Create branch + worktree" }).click();
  await expect(page.getByText(`Linked worktree on ${branch}:`)).toBeVisible();
  const wt = await calls(page, "hub_task_worktree");
  expect(wt.map((c) => c.args)).toEqual([{
    path: REPO, expectedHost: "github.com", expectedFullName: "o/r", worktreePath: `${REPO}.worktrees/${branch.replace(/\//g, "-")}`,
    branch, expectedHeadSha: BASE_SHA, prNumber: null, allowExternalCode: false,
  }]);
  await expect(page.getByRole("status").filter({ hasText: "Cleanup warning: temporary ref left behind" })).toBeVisible();
  await expect(context).toHaveValue(edited);
  const ws = Object.values((await stored(page)).subjects as Record<string, { workspace?: { context: string; head: string } }>)[0].workspace!;
  expect(ws).toMatchObject({ context: edited, head: BASE_SHA });

  // Only reads + the one worktree command so far: no terminal, editor, agent or script.
  expect([...new Set((await calls(page)).map((c) => c.cmd))].sort()).toEqual(["git_resolve_commit", "hub_api", "hub_task_worktree", "list_git_remotes"]);
  const before = (await calls(page)).length;
  await page.getByRole("button", { name: "Start agent" }).click();
  const confirms = await page.evaluate(() => window.__ghtf.confirms);
  expect(confirms).toHaveLength(1);
  expect(confirms[0]).toContain("User note: focus on writer.ts");
  expect((await calls(page)).length).toBe(before); // cancelled → nothing sent
});

test("PR review workspace (8): explicit consent, pinned PR ref payload, never a normal checkout", async ({ page }) => {
  await open(page, "ghtf-review");
  const consent = page.getByRole("checkbox", { name: "I understand this checks out PR code (nothing runs automatically)" });
  const create = page.getByRole("button", { name: "Review in separate worktree" });
  await expect(consent).not.toBeChecked();
  await expect(create).toBeDisabled();
  await expect(page.getByText(`Pinned head ${H0.slice(0, 10)}`)).toBeVisible();
  await consent.check();
  await create.click();
  await expect(page.getByText(`Linked worktree on review/pr-7-${H0.slice(0, 10)}:`)).toBeVisible();
  expect((await calls(page, "hub_task_worktree")).map((c) => c.args)).toEqual([{
    path: REPO, expectedHost: "github.com", expectedFullName: "o/r", worktreePath: `${REPO}.worktrees/review-pr-7-${H0.slice(0, 10)}`,
    branch: `review/pr-7-${H0.slice(0, 10)}`, expectedHeadSha: H0, prNumber: 7, allowExternalCode: true,
  }]);
  expect((await calls(page)).filter((c) => /checkout/.test(c.cmd))).toEqual([]);
  await expect(page.getByText(/Remote branch is at/)).toHaveCount(0);
  await expect(page.getByText("No recorded agent evidence or checks for this worktree yet.")).toBeVisible();
});

test("resume (31): saved branch view, latest evidence for this worktree, review progress and stale head", async ({ page }) => {
  await open(page, "ghtf-resume");
  await expect(page.getByText(`Remote branch is at ${H0.slice(0, 10)}, the PR head is ${H1.slice(0, 10)}`)).toBeVisible();
  const resume = page.getByTestId("workspace-resume");
  await expect(resume.getByText("Saved view: changes · src/a.ts")).toBeVisible();
  await expect(resume.getByText(`Last evidence "fix review notes" at ${H0.slice(0, 10)}: 1 passed, 1 failed, 0 unfinished`)).toBeVisible();
  await expect(resume.getByText("passed: bun test")).toBeVisible();
  await expect(resume.getByText("failed: bun lint")).toBeVisible();
  await expect(resume.getByText("null check in writer.ts")).toBeVisible();
  await expect(resume.getByText(/stale issue|not mine|bun old/)).toHaveCount(0);
  await expect(resume.getByText(`Review: 2 files reviewed at ${H0.slice(0, 10)} — PR head moved since; 3 threads done`)).toBeVisible();
  await expect(resume.getByRole("textbox", { name: "Context for terminal/agent (editable)" })).toHaveValue("Review PR #7 saved context");

  await resume.getByRole("button", { name: "Start agent" }).click();
  const [msg] = await page.evaluate(() => window.__ghtf.confirms);
  expect(msg).toContain("failed: bun lint");
  expect(msg).toContain("(PR head has moved since)");
  // Resume only reads persisted state: no worktree creation, test run or agent launch.
  expect([...new Set((await calls(page)).map((c) => c.cmd))]).toEqual(["list_git_remotes"]);
});

test.describe("check reminders (38)", () => {
  const check = (name: string, status: string, conclusion: string | null, head_sha: string) => ({ name, status, conclusion, head_sha });

  test("exact head + every duplicate complete → one notification, never again", async ({ page }) => {
    await page.clock.install();
    await open(page, "ghtf-reminder", { checks: [check("test", "in_progress", null, H0), check("test", "queued", null, H0), check("lint", "completed", "success", H0)] });
    const notifications = () => page.evaluate(() => window.__ghtf.notifications);
    const polls = async () => (await calls(page, "pr_checks")).length;
    await expect(page.getByLabel("Check").locator("option")).toHaveText(["test"]);
    await page.getByLabel("When").selectOption("success");
    expect(await polls()).toBe(0); // nothing to poll before a reminder exists
    await page.getByRole("button", { name: "Remind me" }).click();
    await page.getByRole("button", { name: "Remind me" }).click(); // same pinned id: still one reminder
    await expect(page.getByText(`Remind: test succeeds`)).toHaveCount(1);
    await expect(page.getByText(`for head ${H0.slice(0, 10)}`)).toBeVisible();
    await expect.poll(polls).toBe(1);
    expect((await calls(page, "pr_checks"))[0].args).toEqual({ path: HUB, number: 7 });

    const tick = async (checks: unknown[], expected: number) => {
      await setData(page, { checks });
      await page.clock.runFor(60_000);
      await expect.poll(polls).toBe(expected);
    };
    await tick([check("test", "completed", "success", H0), check("test", "in_progress", null, H0)], 2); // one duplicate pending
    await tick([check("test", "completed", "success", H1), check("test", "completed", "success", H1)], 3); // wrong head
    expect(await notifications()).toEqual([]);

    await tick([check("test", "completed", "success", H0), check("test", "completed", "success", H0)], 4);
    await expect.poll(notifications).toEqual([{ title: "#7 test", body: "success", extra: { target: { view: "pr", path: HUB, number: 7 } } }]);
    await expect(page.getByText(`Notified: test succeeds (${H0.slice(0, 10)})`)).toBeVisible();
    const reminders = Object.values((await stored(page)).reminders as Record<string, { deliveredAt: number | null; headSha: string; checkName: string }>);
    expect(reminders).toEqual([expect.objectContaining({ headSha: H0, checkName: "test", when: "success", deliveredAt: expect.any(Number) })]);

    // Delivered → poller stops; further time never re-notifies.
    await page.clock.runFor(180_000);
    expect(await polls()).toBe(4);
    expect(await notifications()).toHaveLength(1);
  });

  test("reminder for an older head is marked stale when checks move to a new head", async ({ page }) => {
    await open(page, "ghtf-reminder", { checks: [check("test", "queued", null, H0)] });
    await page.getByRole("button", { name: "Remind me" }).click();
    await expect(page.getByText("Remind: test completes")).toBeVisible();
    await expect(page.getByText("PR head moved — will not fire")).toHaveCount(0);
    await setData(page, { checks: [check("test", "queued", null, H1)] });
    await page.getByRole("button", { name: "Reload checks" }).click();
    await expect(page.getByText(`for head ${H1.slice(0, 10)}`)).toBeVisible();
    await expect(page.getByText("PR head moved — will not fire")).toBeVisible();
  });
});

test("conflict radar (70): worktree pending-file evidence separate from committed-head simulation", async ({ page }) => {
  const wt = (path: string, pending: string[]) => ({ path, head: H0, branch: null, files: ["src/b.ts"], pendingFiles: pending });
  await open(page, "ghtf-radar", {
    overlap: {
      base: "main", branches: [], overlaps: [{ file: "src/shared.ts", heads: ["feature/a", "feature/b"] }],
      worktrees: [wt("/tmp/wt-a", ["src/b.ts"]), wt("/tmp/wt-b", [])],
      worktreeOverlaps: [{ file: "src/b.ts", worktreePaths: ["/tmp/wt-a", "/tmp/wt-b"] }],
      worktreeErrors: [{ path: "/tmp/wt-c", error: "worktree locked" }],
    },
    integration: { base: "main", heads: ["feature/a", "feature/b"], resultHead: H1, conflicts: ["src/shared.ts"], steps: [], run: null },
  });
  await page.getByRole("button", { name: /Conflict radar/ }).click();
  await page.getByRole("button", { name: "Scan" }).click();
  const worktrees = page.getByTestId("radar-worktrees");
  await expect(worktrees.getByText("Active worktrees (2) — includes uncommitted edits")).toBeVisible();
  expect((await calls(page, "git_expansion")).map((c) => c.args)).toEqual([{ path: REPO, request: { op: "overlap", base: "main", heads: ["feature/a", "feature/b"], includeWorktrees: true } }]);

  await expect(worktrees.getByRole("listitem").filter({ hasText: "/tmp/wt-a" })).toContainText("uncommitted");
  await expect(worktrees.getByRole("listitem").filter({ hasText: "/tmp/wt-b" })).not.toContainText("uncommitted");
  await expect(worktrees.getByText("/tmp/wt-c: worktree locked")).toBeVisible();
  await expect(worktrees.getByText(/do not cover uncommitted edits/)).toBeVisible();
  await expect(worktrees.getByRole("button")).toHaveCount(0); // no simulation offered for dirty-worktree evidence
  await expect(worktrees.getByText("src/shared.ts")).toHaveCount(0);

  await page.getByRole("button", { name: "Simulate feature/a + feature/b" }).click();
  await expect(page.getByText("Simulated merge: real conflict in this file")).toBeVisible();
  expect((await calls(page, "git_expansion"))[1].args).toEqual({ path: REPO, request: { op: "integration", base: "main", heads: ["feature/a", "feature/b"], confirmed: false } });
});
