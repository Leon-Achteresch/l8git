import { describe, expect, it } from "vitest";

import {
  ALL_MERGE_STRATEGIES,
  PROVIDER_UNKNOWN_CODE,
  pickMergeStrategy,
  providerUnknownHost,
} from "./pr-provider";

describe("providerUnknownHost", () => {
  it("extracts the host from the structured backend error", () => {
    expect(providerUnknownHost(`${PROVIDER_UNKNOWN_CODE}|git.example.org`)).toBe(
      "git.example.org",
    );
  });

  it("also matches when the code is wrapped in a tauri error string", () => {
    expect(
      providerUnknownHost(`Error: ${PROVIDER_UNKNOWN_CODE}|scm.intern.local `),
    ).toBe("scm.intern.local");
  });

  it("returns null for unrelated errors", () => {
    expect(providerUnknownHost("GitLab 404: not found")).toBeNull();
    expect(providerUnknownHost("")).toBeNull();
  });
});

describe("pickMergeStrategy", () => {
  it("keeps the wanted strategy when the provider supports it", () => {
    expect(pickMergeStrategy("squash", ALL_MERGE_STRATEGIES)).toBe("squash");
  });

  it("falls back to the first supported strategy on GitLab", () => {
    expect(pickMergeStrategy("rebase", ["merge", "squash"])).toBe("merge");
  });

  it("leaves the wanted strategy untouched when nothing is known yet", () => {
    expect(pickMergeStrategy("rebase", [])).toBe("rebase");
  });
});
