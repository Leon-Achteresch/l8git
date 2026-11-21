import { describe, expect, it } from "vitest";
import { parseScreenshotComment, resolveReviewImage, screenshotComment, type Stroke } from "./pr-screenshot";

describe("screenshot reviews", () => {
  const lines: Stroke[] = [
    [
      [0, 12],
      [800, 1000],
    ],
  ];
  const src = "https://example.org/screen(1).png";
  it("round trips markdown notes, original URLs and normalized ink", () => {
    const body = screenshotComment(src, lines, "**Align** here", "Marked area");
    expect(parseScreenshotComment(body)).toEqual({ note: "**Align** here", src, lines });
    expect(body).toContain("X 0–80% · Y 1–100%");
  });
  it("treats malformed provider data as a regular comment", () => {
    const body = screenshotComment(src, lines, "note", "Area");
    for (const invalid of ["null", "[[]]", "[[[55555,0]]]", "[[[0,false]]]", "{"]) {
      expect(parseScreenshotComment(body.replace(JSON.stringify(lines), invalid))).toBeNull();
    }
  });
  it("resolves repository images and GitLab project uploads without accepting executable URLs", () => {
    const pr = "https://gitlab.test/group/project/-/merge_requests/6";
    expect(resolveReviewImage("ui/screen.png", pr, "abc")).toBe(
      "https://gitlab.test/group/project/-/raw/abc/ui/screen.png",
    );
    expect(resolveReviewImage("/uploads/abc/screen.png", pr, "abc")).toBe(
      "https://gitlab.test/group/project/uploads/abc/screen.png",
    );
    expect(resolveReviewImage("javascript:alert(1)", pr, "abc")).toBeNull();
  });
});
