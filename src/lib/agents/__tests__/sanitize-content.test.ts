import { describe, expect, it } from "vitest";

import { escapeHtml, sanitizeLinkHref } from "@/lib/agents/markdown-blocks";
import { redactSecrets } from "@/lib/agents/plugins/content";
import { exportableItemText, exportableToolArguments } from "@/lib/agents/transcript-rows";
import type { AgentItem } from "@/lib/agents/types";

describe("SEC-06 safe rendering and export", () => {
  it("only allows http, https and mailto link schemes", () => {
    expect(sanitizeLinkHref("https://example.com")).toBe("https://example.com");
    expect(sanitizeLinkHref("http://example.com")).toBe("http://example.com");
    expect(sanitizeLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(sanitizeLinkHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeLinkHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeLinkHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("escapes raw HTML before it can be interpreted as markup", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml('<img src=x onerror="alert(1)">')).not.toContain("<img");
  });

  it("redacts secret-looking tool input values before export", () => {
    const redacted = redactSecrets({ api_key: "sk-live-xyz", password: "hunter2", file: "a.ts" });
    expect(redacted.api_key).toBe("[redacted]");
    expect(redacted.password).toBe("[redacted]");
    expect(redacted.file).toBe("a.ts");
  });

  it("excludes redacted thinking signatures from exported text", () => {
    const redactedThinking: AgentItem = {
      id: "i1",
      type: "reasoning",
      redacted: true,
      summary: ["Geschützter Gedankengang"],
      content: ["Geschützter Gedankengang"],
    };
    expect(exportableItemText(redactedThinking)).toBeNull();

    const openThinking: AgentItem = {
      id: "i2",
      type: "reasoning",
      redacted: false,
      summary: [],
      content: ["visible reasoning"],
    };
    expect(exportableItemText(openThinking)).toBe("visible reasoning");
  });

  it("redacts secret-looking arguments on any exported tool call", () => {
    const item: AgentItem = { id: "i3", type: "dynamicToolCall", arguments: { token: "abc", query: "x" } };
    expect(exportableToolArguments(item)).toEqual({ token: "[redacted]", query: "x" });
  });
});
