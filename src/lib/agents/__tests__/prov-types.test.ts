import { describe, expect, it } from "vitest";

import {
  driverKind,
  instanceId,
  nativeSessionId,
  nativeSessionKey,
  type NativeSessionRef,
} from "@/lib/agents/types";

describe("branded provider identities", () => {
  it("keeps native session ids from colliding across instances of the same driver", () => {
    const refA: NativeSessionRef = {
      driver: driverKind("claude"),
      instance: instanceId("claude:default"),
      nativeSessionId: nativeSessionId("sess-1"),
    };
    const refB: NativeSessionRef = {
      driver: driverKind("claude"),
      instance: instanceId("claude:work"),
      nativeSessionId: nativeSessionId("sess-1"),
    };

    expect(nativeSessionKey(refA)).not.toBe(nativeSessionKey(refB));
    expect(nativeSessionKey(refA)).toBe(JSON.stringify(["claude", "claude:default", "sess-1"]));
  });
});
