import { expect, test, type Page } from "@playwright/test";

const primary = "/tmp/l8git-history-fixture";
const secondary = "/tmp/l8git-history-secondary";
const first = "78".padStart(40, "0");
const second = "77".padStart(40, "0");
const other = "f".repeat(40);
const notesRef = "refs/notes/commits";
const plaintext = "<strong>Plain text</strong> *Markdown*\nSecond line";
const trigger = (page: Page) => page.getByRole("button", { name: "Local Git note", exact: true });
const text = (page: Page) => page.locator('pre[aria-label="Local Git note"]');
const calls = (page: Page) => page.evaluate(() =>
  (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === "repo_commit_note").map(call => call.args),
);

async function inspect(page: Page, commit: string) {
  await page.locator(`[data-commit-hash="${commit}"]`).click();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
}

async function switchRepo(page: Page, name: string) {
  await page.getByRole("button", { name: "Jump to branch, commit, file…", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Search", exact: true });
  await palette.getByRole("combobox").fill(name);
  await palette.getByRole("option", { name: `Switch to: ${name}`, exact: true }).click();
  await expect(palette).toBeHidden();
}

test("commit details require an explicit read and show the ref, literal text and distinct failure states", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 720 });
  await page.goto("/?scene=history-workflow");
  await expect(page.locator(`[data-commit-hash="${first}"]`)).toBeVisible();
  await page.evaluate(({ first, second, notesRef, plaintext }) => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    let secondAttempts = 0;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== "repo_commit_note") return original(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      if (args?.commit === first) return { notesRef, status: "text", text: plaintext };
      if (args?.commit === second) {
        if (++secondAttempts === 1) throw Error("broken notes ref");
        return { notesRef, status: "missing" };
      }
      return { notesRef, status: "unsupported" };
    };
  }, { first, second, notesRef, plaintext });

  await inspect(page, first);
  expect(await calls(page)).toEqual([]);
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(notesRef, { exact: true })).toBeVisible();
  await expect(text(page)).toBeVisible();
  expect(await text(page).textContent()).toBe(plaintext);
  await expect(text(page).locator("strong")).toHaveCount(0);
  expect(await calls(page)).toEqual([{ path: primary, commit: first }]);
  await page.keyboard.press("Tab");
  await expect(text(page)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await inspect(page, second);
  await trigger(page).click();
  await expect(page.getByText("Could not read the local Git note.", { exact: true })).toBeVisible();
  await expect(text(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No local note for this commit under this ref.", { exact: true })).toBeVisible();
  await expect(page.getByText(notesRef, { exact: true })).toBeVisible();
  const third = "76".padStart(40, "0");
  await inspect(page, third);
  await trigger(page).click();
  await expect(page.getByText("This Git note does not contain supported UTF-8 text.", { exact: true })).toBeVisible();
  expect(await calls(page)).toEqual([first, second, second, third].map(commit => ({ path: primary, commit })));
});

test("held reads cannot install notes after a commit change or a repository round trip", async ({ page }) => {
  await page.goto("/?scene=history-workflow");
  await expect(page.locator(`[data-commit-hash="${first}"]`)).toBeVisible();
  await page.evaluate(({ primary, first, second, notesRef }) => {
    const original = window.__L8GIT_TEST_INVOKE__!;
    const notesWindow = window as Window & { releaseCommitNote?: () => void };
    let firstAttempts = 0;
    window.__L8GIT_TEST_INVOKE__ = async (command, args) => {
      if (command !== "repo_commit_note") return original(command, args);
      window.__L8GIT_TEST_CALLS__!.push({ command, args });
      if (args?.path === primary && [first, second].includes(String(args.commit))) {
        const attempt = args.commit === first ? ++firstAttempts : 1;
        if (attempt === 1) {
          await new Promise<void>(resolve => { notesWindow.releaseCommitNote = resolve; });
          window.__L8GIT_TEST_CALLS__!.push({ command: "stale-note-delivered", args });
          return { notesRef, status: "text", text: "Obsolete note" };
        }
        return { notesRef, status: "text", text: "Fresh primary note" };
      }
      return { notesRef, status: "too_large" };
    };
  }, { primary, first, second, notesRef });
  const release = () => page.evaluate(() => (window as Window & { releaseCommitNote?: () => void }).releaseCommitNote?.());
  const delivered = () => page.evaluate(() =>
    (window.__L8GIT_TEST_CALLS__ ?? []).filter(call => call.command === "stale-note-delivered").length,
  );

  await inspect(page, second);
  await trigger(page).click();
  await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
  await inspect(page, first);
  await release();
  await expect.poll(delivered).toBe(1);
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Obsolete note", { exact: true })).toHaveCount(0);

  await trigger(page).click();
  await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
  await switchRepo(page, "l8git-history-secondary");
  await inspect(page, other);
  await trigger(page).click();
  await expect(page.getByText("This Git note exceeds the 64 KiB display limit.", { exact: true })).toBeVisible();
  await switchRepo(page, "l8git-history-fixture");
  // The history restores the selected commit when returning to a repository.
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  await trigger(page).click();
  await expect(text(page)).toHaveText("Fresh primary note");
  await release();
  await expect.poll(delivered).toBe(2);
  await expect(text(page)).toHaveText("Fresh primary note");
  expect(await calls(page)).toEqual([
    { path: primary, commit: second },
    { path: primary, commit: first },
    { path: secondary, commit: other },
    { path: primary, commit: first },
  ]);
});
