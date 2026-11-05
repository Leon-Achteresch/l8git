import { describe, expect, it } from "vitest";

import { commandLine, splitArgs, toCommand } from "./args";

describe("splitArgs", () => {
  it("splits without a shell", () => {
    expect(splitArgs(`npm test -- --grep "a b" 'c d' e\\ f ""`)).toEqual(["npm", "test", "--", "--grep", "a b", "c d", "e f", ""]);
    expect(() => splitArgs(`echo "x`)).toThrow();
  });
  it("builds and round-trips commands", () => {
    const c = toCommand(`cargo test "my test"`, 90)!;
    expect(c).toEqual({ program: "cargo", args: ["test", "my test"], timeoutSeconds: 90 });
    expect(splitArgs(commandLine(c))).toEqual(["cargo", "test", "my test"]);
    expect(toCommand("  ", 10)).toBeNull();
    expect(toCommand("x", 0)).toBeNull();
    expect(toCommand("x", 99999)?.timeoutSeconds).toBe(3600);
  });
});
