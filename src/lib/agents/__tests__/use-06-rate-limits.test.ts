import { describe, expect, it } from "vitest";

import { parseRateLimitSignal, upsertRateLimitSignal } from "@/lib/agents/rate-limits";

describe("USE-06 rate limit tracking", () => {
  it("keeps multiple simultaneous limit windows tracked separately", () => {
    let buckets = upsertRateLimitSignal({}, parseRateLimitSignal({ limit_type: "five_hour", resets_at: 1000 }, 0));
    buckets = upsertRateLimitSignal(buckets, parseRateLimitSignal({ limit_type: "seven_day", resets_at: 2000 }, 0));
    expect(Object.keys(buckets).sort()).toEqual(["five_hour", "seven_day"]);
    expect(buckets.five_hour.resetsAt).toBe(1000);
    expect(buckets.seven_day.resetsAt).toBe(2000);
  });

  it("deduplicates repeated signals for the same bucket", () => {
    const signal = parseRateLimitSignal({ limit_type: "five_hour", resets_at: 1000 }, 0);
    const first = upsertRateLimitSignal({}, signal);
    const second = upsertRateLimitSignal(first, signal);
    expect(second).toBe(first);
  });

  it("falls back gracefully instead of dropping the warning on a malformed reset value", () => {
    const signal = parseRateLimitSignal({ limit_type: "five_hour", resets_at: "not-a-number", message: "limited" }, 0);
    expect(signal.bucket).toBe("five_hour");
    expect(signal.resetsAt).toBeNull();
    expect(signal.message).toBe("limited");
  });
});
