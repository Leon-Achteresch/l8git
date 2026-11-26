import { defineConfig, devices } from "@playwright/test";

const requestedPort = Number(process.env.L8GIT_UI_TEST_PORT ?? 4173);
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error('Invalid L8GIT_UI_TEST_PORT');
const fixtureOutput = `../node_modules/.cache/l8git-ui-test/${requestedPort}`;
const viteConfig = "--config vite.ui-test.config.ts";
const serve = `--host 127.0.0.1 --port ${requestedPort} --strictPort`;
const interactive = Boolean(process.env.PWDEBUG) ||
  process.argv.some(arg => arg === "--debug" || arg === "--ui" || arg.startsWith("--ui-"));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${requestedPort}`,
    trace: "on-first-retry",
    reducedMotion: "reduce",
  },
  webServer: {
    // Isolated browser contexts load the bundled fixture with fewer HTTP
    // requests. Interactive sessions keep Vite's live updates while editing.
    command: interactive
      ? `bunx vite ${viteConfig} ${serve}`
      : `bunx vite build ${viteConfig} --outDir ${fixtureOutput} && bunx vite preview ${viteConfig} --outDir ${fixtureOutput} ${serve}`,
    url: `http://127.0.0.1:${requestedPort}`,
    // Never silently test against an unrelated/stale process on this port.
    // A dedicated server makes UI test results reproducible locally and in CI.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
