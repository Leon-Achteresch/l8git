import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform } from "@/lib/agents/__tests__/platform-harness";
import { loadAgentSessionCatalog } from "@/lib/agents/session-catalog";
import {
  AGENT_INSTANCE_MIGRATION_KEY,
  AGENT_INSTANCE_MIGRATION_VERSION,
  AGENT_SESSION_CATALOG_KEY,
} from "@/lib/agents/storage-keys";
import { kvGet, kvSet } from "@/lib/platform/kv";

describe("agent session catalog instance migration", () => {
  beforeEach(() => {
    installTestPlatform();
  });

  it("maps threads without an instanceId to the default codex instance, once, idempotently", () => {
    kvSet(
      AGENT_SESSION_CATALOG_KEY,
      JSON.stringify({
        state: {
          threadsByPath: {
            "/repo": [
              { id: "t-1", path: "/repo", title: "a", preview: "", createdAt: 0, updatedAt: 0, modelProvider: "openai" },
            ],
          },
        },
        version: 1,
      }),
    );

    const first = loadAgentSessionCatalog();
    expect(first.instanceByThreadId).toEqual({ "t-1": "codex:default" });

    kvSet(AGENT_SESSION_CATALOG_KEY, JSON.stringify({ state: { ...first }, version: 1 }));
    const second = loadAgentSessionCatalog();
    expect(second.instanceByThreadId).toEqual(first.instanceByThreadId);
  });

  it("sets the migration marker after loading and skips re-migration once set", () => {
    kvSet(AGENT_SESSION_CATALOG_KEY, JSON.stringify({ state: { threadsByPath: {} }, version: 1 }));
    loadAgentSessionCatalog();
    expect(kvGet(AGENT_INSTANCE_MIGRATION_KEY)).toBe(String(AGENT_INSTANCE_MIGRATION_VERSION));

    kvSet(
      AGENT_SESSION_CATALOG_KEY,
      JSON.stringify({
        state: {
          threadsByPath: { "/repo": [{ id: "t-2", path: "/repo", title: "b", preview: "", createdAt: 0, updatedAt: 0, modelProvider: "openai" }] },
        },
        version: 1,
      }),
    );
    const afterMarkerSet = loadAgentSessionCatalog();
    expect(afterMarkerSet.instanceByThreadId).toEqual({});
  });
});
