import { describe, expect, it } from "vitest";

import { shouldShowImagePreview, toolResultLabel } from "@/lib/agents/transcript-rows";
import { toolItem } from "@/lib/agents/providers/claude/chat-store";
import type { AgentItem } from "@/lib/agents/types";

describe("EVT-08 read/search/fetch tool labels", () => {
  it("gives Read its file path as the core parameter", () => {
    const item = toolItem({ name: "Read", input: { file_path: "src/app.ts" }, id: "tu-1" }, "item-1");
    expect(item.type).toBe("readTool");
    expect(toolResultLabel(item)).toEqual({ label: "Lesen", detail: "src/app.ts" });
  });

  it("gives Grep and Glob their pattern as the core parameter", () => {
    const grep = toolItem({ name: "Grep", input: { pattern: "TODO" }, id: "tu-1" }, "item-1");
    expect(toolResultLabel(grep)).toEqual({ label: "Textsuche", detail: "TODO" });

    const glob = toolItem({ name: "Glob", input: { pattern: "**/*.tsx" }, id: "tu-2" }, "item-2");
    expect(toolResultLabel(glob)).toEqual({ label: "Datei-Suche", detail: "**/*.tsx" });
  });

  it("gives WebFetch and WebSearch their url/query as the core parameter", () => {
    const fetch = toolItem({ name: "WebFetch", input: { url: "https://example.com" }, id: "tu-1" }, "item-1");
    expect(toolResultLabel(fetch)).toEqual({ label: "URL abrufen", detail: "https://example.com" });

    const search = toolItem({ name: "WebSearch", input: { query: "vitest docs" }, id: "tu-2" }, "item-2");
    expect(toolResultLabel(search)).toEqual({ label: "Web-Suche", detail: "vitest docs" });
  });

  it("only activates the image preview for real image content, never filename guessing alone", () => {
    const suspiciousName: AgentItem = { id: "i1", type: "readTool", path: "notes.png", result: "just text" };
    expect(shouldShowImagePreview(suspiciousName)).toBe(false);

    const realImage: AgentItem = {
      id: "i2",
      type: "readTool",
      path: "notes.txt",
      result: [{ type: "image", source: { media_type: "image/png", data: "..." } }],
    };
    expect(shouldShowImagePreview(realImage)).toBe(true);
  });
});
