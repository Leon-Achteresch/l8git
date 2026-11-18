import { expect, test } from "@playwright/test";

const primary = "/tmp/l8git-history-fixture";
const secondary = "/tmp/l8git-history-secondary";
const head = "a".repeat(40);
const pending = "Conflict resolutions pending recording";
const remaining = "Conflicts not auto-resolved by rerere";

test("Workbench shows Git's two rerere lists and keeps explicit actions scoped to the active repo", async ({ page }) => {
  await page.setViewportSize({ width: 920, height: 780 });
  await page.goto("/?scene=history-workflow");
  const sidebar = page.getByTestId("repository-sidebar");
  await expect(sidebar).toBeVisible();
  await page.evaluate(({ primary, secondary, head }) => {
    const invoke = window.__L8GIT_TEST_INVOKE__!;
    let enabled: boolean | null = null;
    let hold = false;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== "git_expansion" && command !== "git_resolve_commit") return invoke(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      if (command === "git_resolve_commit") return head;
      const request = args?.request as { op: string; enabled: boolean };
      if (args?.path === secondary) {
        return { enabled: true, autoupdate: true, recorded: [], remaining: [], diff: "" };
      }
      if (args?.path !== primary) throw Error("Unexpected repository");
      const status = {
        enabled, autoupdate: false,
        recorded: ["pending.txt", "manually-staged.txt"],
        remaining: ["pending.txt", "untracked-by-rerere.txt"],
        diff: "+review this working-tree change",
      };
      if (request.op === "rerere_status" && hold) {
        const data = document.documentElement.dataset;
        await new Promise<void>(resolve => {
          window.addEventListener("release-rerere-status", () => resolve(), { once: true });
          data.rerereHeld = "yes";
        });
        data.rerereReleased = "yes";
        return { ...status, recorded: ["stale.txt"] };
      }
      if (request.op === "rerere_configure") {
        enabled = request.enabled;
        return { ...status, enabled };
      }
      if (request.op === "rerere_forget") hold = true;
      return status;
    };
  }, { primary, secondary, head });

  const workbench = page.getByRole("region", { name: /Rerere/ });
  const requests = () => page.evaluate(() => (window.__L8GIT_TEST_CALLS__ ?? [])
    .filter(call => call.command === "git_expansion")
    .map(call => call.args));
  const load = () => workbench.getByRole("button", { name: "Load", exact: true }).click();
  const open = async () => {
    const more = sidebar.getByRole("button", { name: "More", exact: true });
    const tools = sidebar.getByRole("tab", { name: "Tools", exact: true });
    if (!await tools.isVisible()) await more.click();
    await tools.click();
    const disclosure = workbench.getByRole("button", { name: /Rerere/ });
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await disclosure.press("Enter");
  };
  await open();
  expect(await requests()).toEqual([]);
  await load();
  await expect(workbench.getByRole("list", { name: pending })).toContainText("manually-staged.txt");
  await expect(workbench.getByRole("list", { name: remaining })).toContainText("untracked-by-rerere.txt");
  await expect(workbench.getByRole("list", { name: remaining })).not.toContainText("manually-staged.txt");
  await expect(workbench.getByText(/Rerere follows Git’s default/)).toBeVisible();
  await expect(workbench.getByText(/auto-staging off/)).toBeVisible();
  await expect(workbench.getByText(/working-tree diff and the staged changes in the index/)).toBeVisible();
  await expect(workbench.locator("pre")).toContainText("review this working-tree change");
  await expect(workbench.getByText("Resolutions reused in the current conflict")).toHaveCount(0);
  expect(await requests()).toEqual([{ path: primary, request: { op: "rerere_status" } }]);

  await workbench.getByRole("button", { name: "Enable rerere", exact: true }).click();
  await expect(workbench.getByRole("button", { name: "Disable rerere", exact: true })).toBeVisible();
  const forget = workbench.getByRole("listitem").filter({ hasText: /^pending\.txt/ })
    .getByRole("button", { name: "Forget", exact: true });
  page.once("dialog", dialog => dialog.dismiss());
  await forget.click();
  expect(await requests()).toHaveLength(2);
  page.once("dialog", dialog => dialog.accept());
  await forget.click();
  await expect.poll(requests).toEqual([
    { path: primary, request: { op: "rerere_status" } },
    { path: primary, request: { op: "rerere_configure", enabled: true, expectedEnabled: null } },
    { path: primary, request: { op: "rerere_forget", file: "pending.txt", expectedHead: head } },
  ]);

  await load();
  await expect(page.locator("html")).toHaveAttribute("data-rerere-held", "yes");
  await page.getByRole("button", { name: "Jump to branch, commit, file…", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Search", exact: true });
  await search.getByRole("combobox").fill("l8git-history-secondary");
  await search.getByRole("option", { name: "Switch to: l8git-history-secondary", exact: true }).click();
  await expect(search).toBeHidden();
  await open();
  await load();
  await expect(workbench.getByText("Git reports no paths in these rerere lists.")).toBeVisible();
  await expect(workbench.getByText("rerere is enabled · auto-staging on", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("release-rerere-status")));
  await expect(page.locator("html")).toHaveAttribute("data-rerere-released", "yes");
  await expect(workbench.getByText("stale.txt")).toHaveCount(0);
  await expect(workbench.getByText("Git reports no paths in these rerere lists.")).toBeVisible();
  expect((await requests()).slice(3)).toEqual([
    { path: primary, request: { op: "rerere_status" } },
    { path: secondary, request: { op: "rerere_status" } },
  ]);
});
