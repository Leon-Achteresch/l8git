import { describe, expect, it } from "vitest";

import {
  buildQuestionAnswer,
  clipboardImageToAttachment,
  normalizeFileAttachment,
  normalizeImageAttachment,
  toClaudeFileBlock,
} from "@/lib/agents/composer-attachments";
import { dispatchSkill } from "@/lib/agents/capability-hub";
import { mediaActionsFor } from "@/lib/agents/plugins/image-blocks";
import { dataUrlToBytes } from "@/lib/media";

describe("CHAT-06 normalizeImageAttachment", () => {
  it("accepts a data URL and produces a base64 image block", () => {
    const dataUrl = `data:image/png;base64,${Buffer.from("hello").toString("base64")}`;
    const result = normalizeImageAttachment({ source: "paste", mime: "image/png", dataUrl });
    expect(result.error).toBeUndefined();
    expect(result.data).toBe(Buffer.from("hello").toString("base64"));
  });

  it("rejects unsupported mime types with an error", () => {
    const result = normalizeImageAttachment({ source: "file", mime: "image/tiff", bytes: new Uint8Array([1]) });
    expect(result.error).toMatch(/Nicht unterstuetzter Bildtyp/);
  });

  it("rejects payloads over the size limit", () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const result = normalizeImageAttachment({ source: "file", mime: "image/png", bytes });
    expect(result.error).toMatch(/Limit/);
  });
});

describe("CHAT-07 document attachments", () => {
  it("produces a document block when document capability is present", () => {
    const attachment = normalizeFileAttachment({
      source: "file",
      mime: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    const block = toClaudeFileBlock(attachment, true);
    expect(block.type).toBe("document");
  });

  it("falls back to a path reference without document capability", () => {
    const attachment = normalizeFileAttachment({
      source: "file",
      mime: "application/pdf",
      path: "/repo/doc.pdf",
    });
    const block = toClaudeFileBlock(attachment, false);
    expect(block).toEqual({ type: "text", text: "@/repo/doc.pdf" });
  });

  it("reports an error reason for unsupported mime types", () => {
    const attachment = normalizeFileAttachment({ source: "file", mime: "video/mp4", bytes: new Uint8Array([1]) });
    const block = toClaudeFileBlock(attachment, true);
    expect(block).toEqual({ type: "text", text: expect.stringContaining("fehlgeschlagen") });
  });
});

describe("EXT-02 dispatchSkill", () => {
  it("builds a slash prompt with args, attachments and frontmatter hints", () => {
    const result = dispatchSkill(
      { name: "review", enabled: true, frontmatter: { description: "Reviews code" } },
      "focus on security",
      ["@src/index.ts"],
    );
    expect(result).toEqual({
      prompt: "/review focus on security",
      attachments: ["@src/index.ts"],
      hints: ["Reviews code"],
    });
  });

  it("errors for an unknown skill", () => {
    const result = dispatchSkill(undefined, "", []);
    expect(result).toEqual({ error: "unknown skill" });
  });

  it("errors for a disabled skill", () => {
    const result = dispatchSkill({ name: "x", enabled: false }, "", []);
    expect(result).toEqual({ error: "skill is disabled: x" });
  });
});

describe("DETAIL-04 buildQuestionAnswer", () => {
  it("includes attachment blocks when the capability is supported", () => {
    const image = normalizeImageAttachment({
      source: "file",
      mime: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });
    const payload = buildQuestionAnswer(["yes"], [image], true);
    expect(payload.text).toBe("yes");
    expect(payload.attachments?.[0].type).toBe("image");
  });

  it("falls back to a text reference without the capability", () => {
    const image = normalizeImageAttachment({ source: "file", mime: "image/png", path: "/repo/a.png" });
    const payload = buildQuestionAnswer(["no"], [image], false);
    expect(payload.attachments).toBeUndefined();
    expect(payload.text).toContain("@/repo/a.png");
  });
});

describe("DETAIL-05 mediaActionsFor", () => {
  it("allows open/save/share for images", () => {
    expect(mediaActionsFor({ type: "image", mediaType: "image/png" })).toEqual({
      open: true,
      save: true,
      share: true,
    });
  });

  it("offers an open/save handoff for unsupported kinds", () => {
    expect(mediaActionsFor({ type: "file", mediaType: "application/zip" })).toEqual({
      open: true,
      save: true,
      share: false,
    });
  });

  it("decodes a data URL back into bytes via media.ts", () => {
    const decoded = dataUrlToBytes(`data:image/png;base64,${Buffer.from("hi").toString("base64")}`);
    expect(decoded?.mime).toBe("image/png");
    expect(Buffer.from(decoded!.bytes).toString()).toBe("hi");
  });
});

describe("DETAIL-06 clipboardImageToAttachment", () => {
  it("converts the first image clipboard item into an attachment", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const items = [
      { type: "text/plain" },
      {
        type: "image/png",
        getAsFile: () => ({ arrayBuffer: async () => bytes.buffer, name: "clip.png" }),
      },
    ];
    const attachment = await clipboardImageToAttachment(items);
    expect(attachment?.kind).toBe("image");
    expect(attachment?.name).toBe("clip.png");
  });

  it("returns null when no image item is present", async () => {
    const attachment = await clipboardImageToAttachment([{ type: "text/plain" }]);
    expect(attachment).toBeNull();
  });
});
