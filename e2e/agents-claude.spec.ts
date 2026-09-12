import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

import { test, expect } from "@playwright/test";

function claudeOnPath(): boolean {
  try {
    execSync(process.platform === "win32" ? "where claude" : "which claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasClaudeCli = claudeOnPath();

test.skip(!hasClaudeCli, "Claude Code CLI ist nicht auf PATH installiert.");

test.setTimeout(60_000);

test("Claude CLI readiness, start and stop over the stream-json control protocol", async () => {
  const sessionId = randomUUID();
  const child = spawn(
    "claude",
    [
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
      "--session-id",
      sessionId,
      "--setting-sources",
      "",
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let readySignal: Record<string, unknown> | undefined;

  const requestId = "e2e-init";

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout beim Warten auf die Claude-Readiness (control_response/system init).")),
      45_000,
    );
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      const isSystemInit = event.type === "system" && event.subtype === "init";
      const isInitializeResponse =
        event.type === "control_response" &&
        typeof event.response === "object" &&
        event.response !== null &&
        (event.response as Record<string, unknown>).request_id === requestId &&
        (event.response as Record<string, unknown>).subtype === "success";
      if (isSystemInit || isInitializeResponse) {
        readySignal = event;
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (!readySignal) {
        clearTimeout(timer);
        reject(new Error(`Claude CLI wurde vor Readiness beendet (Code ${code}).`));
      }
    });
  });

  child.stdin.write(
    `${JSON.stringify({
      type: "control_request",
      request_id: requestId,
      request: { subtype: "initialize" },
    })}\n`,
  );

  await ready;
  expect(readySignal).toBeDefined();

  const stopped = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });
  child.stdin.end();
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 10_000);
  await stopped;
  clearTimeout(killTimer);

  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  rl.close();
});
