import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  normalizeFileAttachment,
  normalizeImageAttachment,
  toClaudeContentBlock,
} from "@/lib/agents/composer-attachments";

describe("composer attachments", () => {
  it("normalizes a valid image into a base64 content block", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const attachment = normalizeImageAttachment({ source: "paste", mime: "image/png", bytes });
    expect(attachment.error).toBeUndefined();
    expect(attachment.data).toBeTruthy();
    const block = toClaudeContentBlock(attachment);
    expect(block).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: attachment.data },
    });
  });

  it("rejects unsupported image mime types", () => {
    const attachment = normalizeImageAttachment({
      source: "file",
      mime: "image/tiff",
      bytes: new Uint8Array([1]),
    });
    expect(attachment.error).toMatch(/Nicht unterstuetzter Bildtyp/);
  });

  it("rejects images over the size limit", () => {
    const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const attachment = normalizeImageAttachment({ source: "drop", mime: "image/jpeg", bytes });
    expect(attachment.error).toMatch(/Limit/);
  });

  it("rejects corrupted (empty) files", () => {
    const attachment = normalizeImageAttachment({
      source: "drop",
      mime: "image/png",
      bytes: new Uint8Array(0),
    });
    expect(attachment.error).toMatch(/leer oder beschaedigt/);
  });

  it("normalizes a supported file attachment", () => {
    const bytes = new TextEncoder().encode("hello world");
    const attachment = normalizeFileAttachment({ source: "file", mime: "text/plain", bytes });
    expect(attachment.error).toBeUndefined();
    expect(attachment.mediaType).toBe("text/plain");
  });

  it("returns a reasoned error for unknown file types", () => {
    const attachment = normalizeFileAttachment({
      source: "file",
      mime: "application/x-msdownload",
      bytes: new Uint8Array([1]),
    });
    expect(attachment.error).toMatch(/Nicht unterstuetzter Dateityp/);
  });

  it("serializes a path-only attachment as an @-reference block", () => {
    const attachment = normalizeFileAttachment({
      source: "drop",
      mime: "application/pdf",
      path: "/tmp/uploads/doc.pdf",
    });
    expect(toClaudeContentBlock(attachment)).toEqual({ type: "text", text: "@/tmp/uploads/doc.pdf" });
  });
});
