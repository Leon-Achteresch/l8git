import { test, expect, type Page } from "@playwright/test";

// Regressions for FINAL-UI-REVIEW.md P1 1–3 against the real MentionTextarea, PullRequestInspectDetail,
// usePrGithub/useGithubTarget and EditRemoteDialog (ui-test/github-p1-scene.tsx).
type Call = { cmd: string; args: Record<string, unknown> };

async function open(page: Page, scene: string, init: { holds?: string[]; data?: Record<string, unknown> } = {}) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((i) => { window.__ghp1Init = i; }, init);
  await page.goto(`/?scene=${scene}&lang=en`);
  await page.waitForFunction(() => window.__ghp1 !== undefined, null, { timeout: 60_000 });
  return errors;
}
const calls = (page: Page) => page.evaluate(() => window.__ghp1.calls) as Promise<Call[]>;
const hub = async (page: Page, re: RegExp) => (await calls(page)).filter((c) => c.cmd === "hub_api" && re.test(JSON.stringify(c.args)));
const mutations = async (page: Page) => (await hub(page, /"query":"mutation/)).map((c) => ({ login: c.args.login, id: (c.args.body as { variables: { id: string } }).variables.id }));
const release = (page: Page, p: string) => page.evaluate((x) => window.__ghp1.release(x), p);
const releaseRemotes = (page: Page, p: string) => page.evaluate((x) => window.__ghp1.releaseRemotes(x), p);
const setData = (page: Page, d: Record<string, unknown>) => page.evaluate((x) => Object.assign(window.__ghp1.data, x), d);
const draftOps = async (page: Page) => (await hub(page, /"query":"mutation/)).map((c) => {
  const b = c.args.body as { query: string; variables: { id: string } };
  return { op: /convertPullRequestToDraft|markPullRequestReadyForReview/.exec(b.query)?.[0], id: b.variables.id };
});
const patches = async (page: Page) => (await calls(page)).filter((c) => c.cmd === "hub_api" && c.args.method === "PATCH").map((c) => ({ path: c.args.path, body: c.args.body }));
const hold = (page: Page, p: string) => page.evaluate((x) => window.__ghp1.hold(x), p);
const renders = (page: Page) => page.evaluate(() => window.__ghp1.renders);
const loopErrors = (errors: string[]) => errors.filter((e) => /Maximum update depth/i.test(e));

test.describe("P1-1 mention textarea", () => {
  test("mounts without a token and settles: no render loop, no requests", async ({ page }) => {
    const errors = await open(page, "ghp1-mention");
    await expect(page.getByRole("textbox", { name: "Body" })).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(400);
    const settled = await renders(page);
    await page.waitForTimeout(600);
    expect(await renders(page)).toBe(settled);
    expect(settled).toBeLessThan(20);
    expect(await hub(page, /search|graphql/)).toEqual([]);
    expect(loopErrors(errors)).toEqual([]);
  });

  test("with a # token: exactly one search, stable renders, late older response is dropped", async ({ page }) => {
    const errors = await open(page, "ghp1-mention", { holds: ["is%3Aopen"] });
    const box = page.getByRole("textbox", { name: "Body" });
    await expect(box).toBeVisible({ timeout: 60_000 });
    await box.pressSequentially("#");
    await expect.poll(async () => (await hub(page, /search\/issues/)).length).toBe(1); // held "is:open" read
    await box.pressSequentially("1");
    await expect(page.getByRole("option", { name: "#12 Match one" })).toBeVisible();
    await release(page, "is%3Aopen"); // the "#" read returns after "#1" was answered
    await page.waitForTimeout(500);
    await expect(page.getByRole("option")).toHaveText(["#12 Match oneopen"]);
    const settled = await renders(page);
    await page.waitForTimeout(700);
    expect(await renders(page)).toBe(settled);
    expect((await hub(page, /search\/issues/)).length).toBe(2);
    expect(loopErrors(errors)).toEqual([]);
  });

  test("with an @ token: exactly one mentionables query", async ({ page }) => {
    const errors = await open(page, "ghp1-mention");
    const box = page.getByRole("textbox", { name: "Body" });
    await expect(box).toBeVisible({ timeout: 60_000 });
    await box.pressSequentially("@a");
    await expect(page.getByRole("option", { name: /ada \(Ada\)/ })).toBeVisible();
    await page.waitForTimeout(800);
    expect((await hub(page, /mentionableUsers/)).length).toBe(1);
    expect(loopErrors(errors)).toEqual([]);
  });
});

test.describe("P1-2 PR detail scope", () => {
  const ready = (page: Page, node: string) => expect(page.getByLabel("Probe node")).toHaveText(node, { timeout: 60_000 });

  test("PR A→B: late A detail/readiness never shows or authorizes B's draft action", async ({ page }) => {
    await open(page, "ghp1-pr", { holds: ['"number":1}'] });
    await expect(page.getByRole("button", { name: "PR 2" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "PR 2" }).click();
    await ready(page, "PR_leon_o/a_2");
    await expect(page.getByText("PR 2 in /tmp/ghp1-repo")).toBeVisible();
    await release(page, '"number":1}');
    await page.waitForTimeout(500);
    await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/a_2");
    await expect(page.getByText("PR 1 in /tmp/ghp1-repo")).toHaveCount(0);
    await expect(page.getByText("CLEAN_leon_o/a_1")).toHaveCount(0);
    await page.getByRole("button", { name: "Ready for review" }).click(); // PR 2 is a draft; A (not draft) would offer "Convert to draft"
    await expect.poll(() => mutations(page)).toEqual([{ login: "leon", id: "PR_leon_o/a_2" }]);
  });

  test("late A error and A finally don't touch B's error/loading", async ({ page }) => {
    await open(page, "ghp1-pr", { holds: ['"number":1}', '"name":"a","number":2}'], data: { fail: ["leon:o/a#1"] } });
    await expect(page.getByRole("button", { name: "PR 2" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "PR 2" }).click();
    await expect(page.getByLabel("Probe loading")).toHaveText("true");
    await release(page, '"number":1}'); // A rejects late
    await page.waitForTimeout(400);
    await expect(page.getByLabel("Probe error")).toHaveText("-");
    await expect(page.getByLabel("Probe loading")).toHaveText("true");
    await expect(page.getByText(/boom o\/a#1/)).toHaveCount(0);
    await release(page, '"name":"a","number":2}');
    await ready(page, "PR_leon_o/a_2");
    await expect(page.getByLabel("Probe loading")).toHaveText("false");
    await expect(page.getByLabel("Probe error")).toHaveText("-");
  });

  test("account switch: the late previous-account read is dropped; actions use the new account's node", async ({ page }) => {
    await open(page, "ghp1-pr", { holds: ['"login":"leon","method":"POST"'] });
    await expect(page.getByRole("button", { name: "Switch account" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Switch account" }).click();
    await ready(page, "PR_ada_o/a_1");
    await release(page, '"login":"leon","method":"POST"');
    await page.waitForTimeout(500);
    await expect(page.getByLabel("Probe node")).toHaveText("PR_ada_o/a_1");
    await page.getByRole("button", { name: "Convert to draft" }).click();
    await expect.poll(() => mutations(page)).toEqual([{ login: "ada", id: "PR_ada_o/a_1" }]);
  });

  test("repository switch: the late previous-repo read is dropped; actions use the new repo's node", async ({ page }) => {
    await open(page, "ghp1-pr", { holds: ['"name":"a","number":1}'] });
    await expect(page.getByRole("button", { name: "Switch repo" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Switch repo" }).click();
    await ready(page, "PR_leon_o/r2_1");
    await release(page, '"name":"a","number":1}');
    await page.waitForTimeout(500);
    await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/r2_1");
    await page.getByRole("button", { name: "Convert to draft" }).click();
    await expect.poll(() => mutations(page)).toEqual([{ login: "leon", id: "PR_leon_o/r2_1" }]);
  });
});

test("P1-3 remote A→B→A: no stale target while re-reading, stale in-flight A never restores, mutations use the live repo", async ({ page }) => {
  await open(page, "ghp1-pr");
  const target = page.getByLabel("Target");
  await expect(target).toHaveText("leon:o/a", { timeout: 60_000 });
  await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/a_1");

  await page.getByRole("button", { name: "Edit remote" }).click();
  const url = page.getByRole("textbox", { name: "URL", exact: true });
  await expect(url).toHaveValue("https://github.com/o/a.git");

  // A background re-read starts while origin is still A and is held.
  await setData(page, { gateRemotes: true });
  await page.getByRole("button", { name: "Reload repo" }).dispatchEvent("click"); // behind the modal overlay
  await expect.poll(() => page.evaluate(() => window.__ghp1.gates.length)).toBeGreaterThan(0);
  await expect(target).toHaveText("leon:o/a");

  // Origin A→B: the old target is dropped immediately, not after the reads return.
  await url.fill("https://github.com/o/b.git");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(target).toHaveText("loading");
  await expect(page.getByLabel("Probe node")).toHaveText("-");
  await expect(page.getByRole("button", { name: "Convert to draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ready for review" })).toHaveCount(0);

  await releaseRemotes(page, "o/b.git");
  await expect(target).toHaveText("leon:o/b");
  await releaseRemotes(page, "o/a.git"); // stale A read lands last
  await page.waitForTimeout(400);
  await expect(target).toHaveText("leon:o/b");
  await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/b_1");
  await setData(page, { gateRemotes: false });
  await page.getByRole("button", { name: "Ready for review" }).click(); // o/b's PR 1 is a draft
  await expect.poll(() => mutations(page)).toEqual([{ login: "leon", id: "PR_leon_o/b_1" }]);
  expect((await hub(page, /\/repos\/o\/b\/issues\/1"/)).length).toBeGreaterThan(0);

  // B→A again.
  await page.getByRole("button", { name: "Edit remote" }).click();
  await expect(url).toHaveValue("https://github.com/o/b.git");
  await url.fill("https://github.com/o/a.git");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(target).toHaveText("leon:o/a");
  await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/a_1");
  await page.getByRole("button", { name: "Convert to draft" }).click();
  await expect.poll(async () => (await mutations(page)).at(-1)).toEqual({ login: "leon", id: "PR_leon_o/a_1" });
});

test("P1-3 remote A→B→A: PR detail, editor and draft action follow the live origin; late A detail/readiness never republish", async ({ page }) => {
  const A = "PR 1 in /tmp/ghp1-repo (o/a)", B = "PR 1 in /tmp/ghp1-repo (o/b)";
  const errors = await open(page, "ghp1-pr", { holds: ['"name":"a","number":1}'] }); // A readiness held from mount
  const target = page.getByLabel("Target");
  await expect(page.getByText(A)).toBeVisible({ timeout: 60_000 });
  await expect(target).toHaveText("leon:o/a");
  // A's detail re-read is in flight too, and will fail late: neither may land, toast, or end B's loading.
  await hold(page, "origin=https://github.com/o/a.git");
  const detailReads = async () => (await calls(page)).filter((c) => c.cmd === "pr_detail").length;
  const before = await detailReads();
  await setData(page, { failDetail: ["https://github.com/o/a.git"] });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(detailReads).toBe(before + 1);
  await setData(page, { failDetail: [] });

  await page.getByRole("button", { name: "Edit remote" }).click();
  const url = page.getByRole("textbox", { name: "URL", exact: true });
  await expect(url).toHaveValue("https://github.com/o/a.git");
  await setData(page, { gateRemotes: true });
  await url.fill("https://github.com/o/b.git");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // While origin is re-read: nothing of A, no actions, a loading state (not "No data").
  await expect(target).toHaveText("loading");
  await expect(page.getByText(A)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Convert to draft|Ready for review/ })).toHaveCount(0);
  await expect(page.getByText("No data.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toBeDisabled();

  await releaseRemotes(page, "o/b.git");
  await setData(page, { gateRemotes: false });
  await expect(page.getByText(B)).toBeVisible();
  await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/b_1");
  // Late A readiness and late A detail land now.
  await release(page, '"name":"a","number":1}');
  await release(page, "origin=https://github.com/o/a.git");
  await page.waitForTimeout(500);
  await expect(page.getByText(B)).toBeVisible();
  await expect(page.getByText(A)).toHaveCount(0);
  await expect(page.getByText("CLEAN_leon_o/a_1")).toHaveCount(0);
  await expect(page.getByText(/detail boom/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();

  // Editor opens with B's title/body and writes B.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue(B);
  await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue("Body of o/b#1");
  await title.fill("B renamed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => patches(page)).toEqual([{ path: "/repos/o/b/pulls/1", body: { title: "B renamed", body: "Body of o/b#1" } }]);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // B is a draft (A is not): direction and node both come from B.
  await page.getByRole("button", { name: "Ready for review" }).click();
  await expect.poll(() => draftOps(page)).toEqual([{ op: "markPullRequestReadyForReview", id: "PR_leon_o/b_1" }]);

  // B→A again: A's detail and actions come back, with A's direction.
  await page.getByRole("button", { name: "Edit remote" }).click();
  await expect(url).toHaveValue("https://github.com/o/b.git");
  await url.fill("https://github.com/o/a.git");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(A)).toBeVisible();
  await expect(page.getByText(B)).toHaveCount(0);
  await expect(page.getByLabel("Probe node")).toHaveText("PR_leon_o/a_1");
  await page.getByRole("button", { name: "Convert to draft" }).click();
  await expect.poll(async () => (await draftOps(page)).at(-1)).toEqual({ op: "convertPullRequestToDraft", id: "PR_leon_o/a_1" });
  expect(loopErrors(errors)).toEqual([]);
});
