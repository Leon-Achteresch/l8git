import { describe, expect, it } from "vitest";

import { deriveProviderReadiness } from "@/lib/agent-integrations";

describe("deriveProviderReadiness", () => {
  it("reports notInstalled when the binary is missing", () => {
    expect(deriveProviderReadiness({ binaryFound: false, versionStatus: "ok", authenticated: true })).toBe(
      "notInstalled",
    );
  });

  it("reports outdated ahead of authentication state", () => {
    expect(deriveProviderReadiness({ binaryFound: true, versionStatus: "outdated", authenticated: true })).toBe(
      "outdated",
    );
  });

  it("reports notAuthenticated once the binary and version are fine", () => {
    expect(deriveProviderReadiness({ binaryFound: true, versionStatus: "ok", authenticated: false })).toBe(
      "notAuthenticated",
    );
  });

  it("reports ready only when every signal is positive", () => {
    expect(deriveProviderReadiness({ binaryFound: true, versionStatus: "ok", authenticated: true })).toBe("ready");
  });

  it("reports unknown when a signal is undetermined", () => {
    expect(deriveProviderReadiness({ binaryFound: true, versionStatus: "unknown", authenticated: true })).toBe(
      "unknown",
    );
    expect(deriveProviderReadiness({ binaryFound: null, versionStatus: null, authenticated: null })).toBe("unknown");
  });
});
