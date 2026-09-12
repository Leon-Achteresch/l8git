import { describe, expect, it } from "vitest";

import { buildTerminalContext } from "@/lib/agents/terminal-context";

describe("buildTerminalContext", () => {
  it("strips ANSI control sequences", () => {
    const result = buildTerminalContext(["[31merror[0m: build failed"]);
    expect(result.codeBlock).toContain("error: build failed");
    expect(result.codeBlock).not.toContain("");
  });

  it("caps the number of lines and reports what was dropped", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`);
    const result = buildTerminalContext(lines, { maxLines: 200 });
    expect(result.droppedLines).toBe(50);
    expect(result.truncated).toBe(true);
    expect(result.codeBlock).toContain("line 249");
    expect(result.codeBlock).not.toContain("line 0\n");
  });

  it("caps total characters", () => {
    const result = buildTerminalContext(["x".repeat(100)], { maxChars: 20 });
    expect(result.truncated).toBe(true);
    expect(result.codeBlock.length).toBeLessThanOrEqual(20 + "```\n\n```".length);
  });

  it("redacts secret-looking assignments and carries origin metadata", () => {
    const result = buildTerminalContext(["API_KEY=abcd1234 ready"], {
      command: "printenv",
      cwd: "/repo",
      host: "build-host",
    });
    expect(result.codeBlock).toContain("API_KEY=[redacted]");
    expect(result.codeBlock).not.toContain("abcd1234");
    expect(result.origin).toEqual({ command: "printenv", cwd: "/repo", host: "build-host" });
  });
});
