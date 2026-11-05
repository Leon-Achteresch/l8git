import { describe, expect, it } from "vitest";

import { DEFAULT_CONTEXT, isTransformed, nextContext } from "./diff-view-options";

describe("diff view options", () => {
  it("expands context in bounded steps", () => {
    expect([3, 10, 25, 100, 500].map(nextContext)).toEqual([10, 25, 100, 500, 500]);
  });
  it("only transforms when an option differs from the original diff", () => {
    const off = { ignoreWhitespace: false, colorMoved: false };
    expect(isTransformed(off, DEFAULT_CONTEXT)).toBe(false);
    expect(isTransformed({ ...off, colorMoved: true }, DEFAULT_CONTEXT)).toBe(true);
    expect(isTransformed(off, 10)).toBe(true);
  });
});
