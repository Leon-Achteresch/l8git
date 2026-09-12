import { describe, expect, it } from "vitest";

import {
  formatThreadRef,
  parseThreadRef,
  searchThreadsAcrossHosts,
  type HostThreadCatalog,
  type SidebarThread,
} from "@/lib/agents/thread-grouping";

function thread(id: string, title: string, preview = ""): SidebarThread {
  return {
    id,
    path: "/repo",
    title,
    preview,
    createdAt: 0,
    updatedAt: 0,
    status: "idle",
    modelProvider: "anthropic",
    provider: "claude",
  };
}

describe("cross-host thread search", () => {
  it("finds matches across hosts and includes host/instance/thread identifiers", () => {
    const catalogsByHost: Record<string, HostThreadCatalog> = {
      "host-a": {
        online: true,
        threadsByInstance: { "claude:default": [thread("t1", "Fix login bug")] },
      },
      "host-b": {
        online: true,
        threadsByInstance: { "claude:default": [thread("t2", "Refactor login flow")] },
      },
    };

    const results = searchThreadsAcrossHosts(catalogsByHost, "login");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.ref).sort()).toEqual([
      "host-a:claude:default:t1",
      "host-b:claude:default:t2",
    ]);
  });

  it("excludes offline hosts from search results", () => {
    const catalogsByHost: Record<string, HostThreadCatalog> = {
      "host-a": { online: false, threadsByInstance: { inst: [thread("t1", "login bug")] } },
    };
    expect(searchThreadsAcrossHosts(catalogsByHost, "login")).toHaveLength(0);
  });

  it("formats and parses thread refs as host:instance:thread", () => {
    const ref = formatThreadRef({ hostId: "host-a", instanceId: "claude:default", threadId: "t1" });
    expect(ref).toBe("host-a:claude:default:t1");
    expect(parseThreadRef(ref)).toEqual({
      hostId: "host-a",
      instanceId: "claude:default",
      threadId: "t1",
    });
  });

  it("returns null for malformed thread refs", () => {
    expect(parseThreadRef("not-a-ref")).toBeNull();
  });
});
