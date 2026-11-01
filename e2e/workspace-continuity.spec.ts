import { expect, test, type Page } from "@playwright/test";
import type { Commit, RepoInfo } from "../src/lib/repo-store";

const hash = (index: number) => (120 - index).toString(16).padStart(40, "0");
const historyViewport = (page: Page) => page.locator("[data-commit-hash]").first().locator("..").locator("..");
const fileViewport = (page: Page) => page.getByTestId("files").locator(".overflow-y-auto").last();

async function openHistory(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?scene=history-workflow");
  await expect(page.locator("[data-commit-hash]").first()).toBeVisible({ timeout: 15_000 });
}

async function switchRepo(page: Page, name: string) {
  await page.getByRole("button", { name: "Jump to branch, commit, file…", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Search", exact: true });
  await palette.getByRole("combobox").fill(name);
  await palette.getByRole("option", { name: `Switch to: ${name}`, exact: true }).click();
  await expect(palette).toBeHidden();
}

test("history keeps its selected commit and scroll through panel and route switches", async ({ page }) => {
  await openHistory(page);
  await historyViewport(page).evaluate(node => { node.scrollTop = 420; });
  const selected = page.locator(`[data-commit-hash="${hash(18)}"]`);
  await selected.click();
  await expect(page.getByText("Release audit 018", { exact: true })).toHaveCount(2);
  const offset = await historyViewport(page).evaluate(node => node.scrollTop);
  expect(offset).toBeGreaterThan(100);

  await page.getByRole("tab", { name: "Commit", exact: true }).click();
  await expect(page.getByTestId("files")).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.getByText("Release audit 018", { exact: true })).toHaveCount(2);
  await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Search settings", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Repository", exact: true }).click();
  await expect(page.getByText("Release audit 018", { exact: true })).toHaveCount(2);
  await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);
});

test("history selections stay in their repository and disappear when a filter excludes them", async ({ page }) => {
  await openHistory(page);
  await page.locator(`[data-commit-hash="${hash(2)}"]`).click();
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(2);
  await switchRepo(page, "l8git-history-secondary");
  await expect(page.getByText("Secondary repository baseline", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(0);
  await switchRepo(page, "l8git-history-fixture");
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(2);

  const filters = page.getByRole("form", { name: "History filters", exact: true });
  await filters.getByRole("searchbox", { name: "Commit message", exact: true }).fill("Document token expiry");
  await filters.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("[data-commit-hash]")).toHaveCount(1);
  await expect(page.getByText("Handle retry budgets", { exact: true })).toHaveCount(0);
});

test("file selection, filter and scroll survive a panel switch without keeping the old panel mounted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?scene=performance");
  const files = page.getByTestId("files");
  await expect(files.getByText("file-0000.txt", { exact: true })).toBeVisible({ timeout: 15_000 });
  const filter = files.getByRole("textbox", { name: "Filter files...", exact: true });
  await filter.fill("file-0");
  await fileViewport(page).evaluate(node => { node.scrollTop = 3600; });
  const selected = files.getByText("file-0105.txt", { exact: true });
  await selected.click();
  await expect(page.locator('[title="files/file-0105.txt"]')).toBeVisible();
  const offset = await fileViewport(page).evaluate(node => node.scrollTop);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.locator("[data-commit-hash]").first()).toBeVisible();
  await expect(files).toHaveCount(0);
  await page.getByRole("tab", { name: "Commit", exact: true }).click();
  await expect(filter).toHaveValue("file-0");
  await expect(page.locator('[title="files/file-0105.txt"]')).toBeVisible();
  await expect.poll(() => fileViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);
  await filter.fill("file-0001");
  await expect(files.getByText("file-0001.txt", { exact: true })).toBeVisible();
  await expect.poll(() => fileViewport(page).evaluate(node => node.scrollTop)).toBe(0);
});

for (const enabled of [true, false]) {
  test(`button press feedback respects animations ${enabled ? "on" : "off"}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(enabled => {
      localStorage.setItem("l8git-animation-prefs", JSON.stringify({ state: { animationsEnabled: enabled }, version: 0 }));
    }, enabled);
    await openHistory(page);
    const button = page.getByRole("form", { name: "History filters", exact: true }).getByRole("button", { name: "Filters", exact: true });
    await button.hover();
    await page.mouse.down();
    await expect.poll(() => button.evaluate(node => getComputedStyle(node).scale)).toBe(enabled ? "0.98" : "none");
    await page.mouse.up();
    // Navigating must not fade or translate the whole content, even with animations enabled.
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    const surface = page.locator("#main-content > div");
    expect(await surface.evaluate(node => ({ opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform }))).toEqual({ opacity: "1", transform: "none" });
  });
}

for (const advanceBranch of [false, true]) {
  test(`filtered history keeps its offset through an empty reload${advanceBranch ? " and advancing branch tip" : ""}`, async ({ page }) => {
    await openHistory(page);
    if (advanceBranch) {
      await page.getByRole("button", { name: "All branches", exact: true }).click();
      await page.getByRole("option", { name: /^main(?:\s|$)/ }).click();
      await page.keyboard.press("Escape");
    } else {
      const filters = page.getByRole("form", { name: "History filters", exact: true });
      await filters.getByRole("searchbox", { name: "Commit message", exact: true }).fill("Release");
      await filters.getByRole("button", { name: "Apply", exact: true }).click();
    }
    const loaded = page.getByRole("status").filter({ hasText: /^80 commits loaded/ });
    await expect(loaded).toBeVisible();
    await historyViewport(page).evaluate(node => { node.scrollTop = 420; });
    await page.locator(`[data-commit-hash="${hash(18)}"]`).click();
    const offset = await historyViewport(page).evaluate(node => node.scrollTop);
    expect(offset).toBeGreaterThan(100);

    await page.evaluate(advanceBranch => {
      const original = window.__L8GIT_TEST_INVOKE__!;
      const testWindow = window as Window & { __RELEASE_HISTORY_REFRESH__?: () => void };
      let newest: Commit | undefined;
      let previousHead = "";
      window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
        if (command === "open_repo") {
          const info = await original(command, args) as RepoInfo;
          previousHead = info.commits[0].hash;
          newest = { ...info.commits[0], hash: "e".repeat(40), short_hash: "eeeeeee", subject: "Release refreshed head", parents: [previousHead] };
          return { ...info, commits: [newest, ...info.commits], branches: info.branches.map(branch => advanceBranch && branch.name === "main" ? { ...branch, tip: newest!.hash } : branch) };
        }
        if (command === "repo_history_page" && newest) {
          window.__L8GIT_TEST_CALLS__!.push({ command: "history-refresh-held", args });
          await new Promise<void>(resolve => { testWindow.__RELEASE_HISTORY_REFRESH__ = resolve; });
          const filter = args!.filter as { refs: string[] };
          const commits = await original(command, { ...args, filter: { ...filter, refs: filter.refs.map(ref => ref === newest!.hash ? previousHead : ref) } }) as Commit[];
          return [newest, ...commits].slice(0, Number(args?.limit ?? 80));
        }
        return original(command, args);
      };
    }, advanceBranch);
    await page.keyboard.press("F5");
    await expect.poll(() => page.evaluate(() => !!(window as Window & { __RELEASE_HISTORY_REFRESH__?: () => void }).__RELEASE_HISTORY_REFRESH__)).toBe(true);
    await expect(page.locator("[data-commit-hash]")).toHaveCount(0);
    await page.evaluate(() => (window as Window & { __RELEASE_HISTORY_REFRESH__?: () => void }).__RELEASE_HISTORY_REFRESH__?.());
    await expect(loaded).toBeVisible();
    await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBeCloseTo(offset, 0);
    if (advanceBranch) {
      const request = await page.evaluate(() => window.__L8GIT_TEST_CALLS__!.find(call => call.command === "history-refresh-held"));
      expect(request?.args?.filter).toMatchObject({ refs: ["e".repeat(40)] });
    }
  });
}

test("performance fixtures put branch and tag tips on the recent history", async ({ page }) => {
  await page.goto("/?scene=performance-app");
  await expect(page.getByTestId("files")).toBeVisible({ timeout: 15_000 });
  const info = await page.evaluate(() => window.__L8GIT_TEST_INVOKE__!("open_repo", { path: "/tmp/l8git-audit-fixture" })) as RepoInfo;
  expect(info.branches).toHaveLength(1601);
  expect(info.tags).toHaveLength(400);
  expect(info.branches.find(branch => branch.name === "main")?.tip).toBe(info.commits[0].hash);
  const recent = new Set(info.commits.slice(0, 1200).map(commit => commit.hash));
  expect(info.branches.every(branch => recent.has(branch.tip))).toBe(true);
  expect(info.tags.every(tag => recent.has(tag.commit))).toBe(true);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.locator(`[data-commit-hash="${info.commits[0].hash}"]`).getByText("main", { exact: true })).toBeVisible();
});

test("a permanently shorter history replaces its old offset before returning to a longer list", async ({ page }) => {
  await openHistory(page);
  const filters = page.getByRole("form", { name: "History filters", exact: true });
  await filters.getByRole("searchbox", { name: "Commit message", exact: true }).fill("Release");
  await filters.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^80 commits loaded/ })).toBeVisible();
  await historyViewport(page).evaluate(node => { node.scrollTop = 420; });
  await page.locator(`[data-commit-hash="${hash(18)}"]`).click();
  expect(await historyViewport(page).evaluate(node => node.scrollTop)).toBeGreaterThan(100);

  await page.evaluate(() => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    const testWindow = window as Window & { __RESTORE_LONG_HISTORY__?: () => void };
    testWindow.__RESTORE_LONG_HISTORY__ = () => { window.__L8GIT_TEST_INVOKE__ = original; };
    let refreshed = false;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      const result = await original(command, args);
      if (command === "open_repo") {
        refreshed = true;
        const info = result as RepoInfo;
        return { ...info, commits: [{ ...info.commits[0], hash: "e".repeat(40) }, ...info.commits.slice(1)] };
      }
      return command === "repo_history_page" && refreshed ? (result as Commit[]).slice(0, 3) : result;
    };
  });
  await page.keyboard.press("F5");
  await expect(page.getByRole("status").filter({ hasText: /^3 commits loaded/ })).toBeVisible();
  await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBe(0);
  await page.getByRole("tab", { name: "Commit", exact: true }).click();
  await expect(page.getByTestId("files")).toBeVisible();
  await page.evaluate(() => (window as Window & { __RESTORE_LONG_HISTORY__?: () => void }).__RESTORE_LONG_HISTORY__?.());
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^80 commits loaded/ })).toBeVisible();
  await expect.poll(() => historyViewport(page).evaluate(node => node.scrollTop)).toBe(0);
});
