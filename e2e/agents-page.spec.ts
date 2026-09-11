import { test, expect, type Page } from "@playwright/test";

type AgentCall = { name: string; args: unknown[] };

async function calls(page: Page): Promise<AgentCall[]> {
  return page.evaluate(() => (window as unknown as { __L8GIT_AGENT_CALLS__?: AgentCall[] }).__L8GIT_AGENT_CALLS__ ?? []);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?scene=agents");
  await page.locator("[data-agent-chat]").waitFor({ state: "visible" });
});

test("the agents tab renders live store threads, transcript and usage", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Wire the agents tab/ })).toBeVisible();
  await expect(page.getByText("fixture@example.com")).toBeVisible();

  await page.getByRole("button", { name: /Wire the agents tab/ }).click();
  expect((await calls(page)).some(call => call.name === "openThread")).toBe(true);

  await expect(page.getByText("fix the build", { exact: true })).toBeVisible();
  await expect(page.getByText("Build is green again.")).toBeVisible();
  await expect(page.getByText("src/main.ts")).toBeVisible();
  await expect(page.getByText("Thinking", { exact: true })).toBeVisible();
  await expect(page.getByText("15%", { exact: true })).toBeVisible();
  await expect(page.getByText("Resets in 2 hr 30 min")).toBeVisible();
});

test("the composer sends a real message through the store", async ({ page }) => {
  const prompt = page.locator("[data-agent-composer] textarea");
  await prompt.fill("run the tests");
  await prompt.press("Enter");
  const send = (await calls(page)).find(call => call.name === "sendMessage");
  expect(send?.args[1]).toBe("run the tests");
});

test("a pending approval is answered through the store", async ({ page }) => {
  await page.getByRole("button", { name: /Wire the agents tab/ }).click();
  await expect(page.getByText("Run the test suite")).toBeVisible();
  await expect(page.getByText("bun run test")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const respond = (await calls(page)).find(call => call.name === "respondToRequest");
  expect(respond?.args[1]).toEqual({ decision: "approve" });
});
