import { describe, expect, it } from "vitest";

import {
  fileExtension,
  formatBytes,
  isImageMime,
  isImagePath,
  isLfsUnavailable,
  isMissingPathError,
  looksLikeLfsPointerText,
  mediaDataUrl,
  parseFileTooLarge,
  shortOid,
} from "./media";

describe("fileExtension", () => {
  it("reads the extension from nested paths", () => {
    expect(fileExtension("assets/img/logo.PNG")).toBe("png");
    expect(fileExtension("src\\ui\\icon.svg")).toBe("svg");
  });

  it("returns an empty string without a usable extension", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
    expect(fileExtension("archive.")).toBe("");
  });
});

describe("isImagePath / isImageMime", () => {
  it("detects image files by extension", () => {
    expect(isImagePath("a/b/c.webp")).toBe(true);
    expect(isImagePath("a/b/c.psd")).toBe(false);
  });

  it("detects image mime types", () => {
    expect(isImageMime("image/svg+xml")).toBe(true);
    expect(isImageMime("application/octet-stream")).toBe(false);
    expect(isImageMime(null)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(20971520)).toBe("20 MB");
  });

  it("returns an empty string for unknown sizes", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });
});

describe("parseFileTooLarge", () => {
  it("extracts the size from the backend marker", () => {
    expect(parseFileTooLarge("__FILE_TOO_LARGE__|20971521")).toBe(20971521);
  });

  it("returns null for other errors", () => {
    expect(parseFileTooLarge("fatal: whatever")).toBeNull();
  });
});

describe("isMissingPathError", () => {
  it("recognises git's missing path messages", () => {
    expect(
      isMissingPathError("fatal: path 'a.png' does not exist in 'HEAD'"),
    ).toBe(true);
    expect(
      isMissingPathError("fatal: path 'a.png' exists on disk, but not in 'HEAD'"),
    ).toBe(true);
    expect(isMissingPathError("fatal: invalid object name 'HEAD~1'.")).toBe(
      true,
    );
    expect(isMissingPathError("fatal: not a git repository")).toBe(false);
  });
});

describe("lfs helpers", () => {
  it("detects the unavailable marker", () => {
    expect(isLfsUnavailable("__LFS_UNAVAILABLE__")).toBe(true);
    expect(isLfsUnavailable("boom")).toBe(false);
  });

  it("detects pointer text inside a diff", () => {
    const patch = [
      "@@ -0,0 +1,3 @@",
      "+version https://git-lfs.github.com/spec/v1",
      "+oid sha256:4d7a2146147f0d3f0d0f7d1c8f5a6b",
      "+size 12345",
    ].join("\n");
    expect(looksLikeLfsPointerText(patch)).toBe(true);
    expect(looksLikeLfsPointerText("const a = 1;")).toBe(false);
    expect(looksLikeLfsPointerText(null)).toBe(false);
  });

  it("shortens oids", () => {
    expect(shortOid("sha256:4d7a2146147f0d3f")).toBe("4d7a214614");
    expect(shortOid(null)).toBe("");
  });
});

describe("mediaDataUrl", () => {
  it("builds a data url with a fallback mime", () => {
    expect(mediaDataUrl("image/png", "AAA")).toBe("data:image/png;base64,AAA");
    expect(mediaDataUrl("", "AAA")).toBe(
      "data:application/octet-stream;base64,AAA",
    );
  });
});
