import { describe, expect, it } from "vitest";

import { buildFeedbackPreview, sendFeedback } from "@/lib/agents/cli-commands";

describe("CLI-10 provider feedback", () => {
  it("builds a redacted preview listing included fields", () => {
    const preview = buildFeedbackPreview({
      message: "It crashed with key sk-ant-abcdefghijklmnop",
      diagnostics: { transcriptExcerpt: "token ghp_abcdefghijklmnopqrst leaked" },
    });
    expect(preview.text).not.toContain("sk-ant-abcdefghijklmnop");
    expect(preview.text).not.toContain("ghp_abcdefghijklmnopqrst");
    expect(preview.includedFields).toEqual(["message", "transcriptExcerpt"]);
  });

  it("throws when sending without explicit confirmation", () => {
    const preview = buildFeedbackPreview({ message: "hello" });
    expect(() => sendFeedback(preview, false)).toThrow();
  });

  it("routes confirmed sends through the terminal handoff bug command", () => {
    const preview = buildFeedbackPreview({ message: "hello" });
    const result = sendFeedback(preview, true);
    expect(result.command).toBe("claude");
    expect(result.args[0]).toBe("/bug");
  });
});
