import { describe, expect, it } from "vitest";

import {
  formatSimpleThreadRef,
  parseSimpleThreadRef,
  searchThreads,
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

describe("DETAIL-09 searchThreads", () => {
  it("finds matches and includes hostId+threadId with a host:thread ref", () => {
    const catalogsByHost: Record<string, HostThreadCatalog> = {
      "host-a": {
        online: true,
        threadsByInstance: { "claude:default": [thread("t1", "Fix login bug")] },
      },
    };
    const results = searchThreads(catalogsByHost, "login");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ hostId: "host-a", threadId: "t1", ref: "host-a:t1" });
  });

  it("excludes offline hosts", () => {
    const catalogsByHost: Record<string, HostThreadCatalog> = {
      "host-a": { online: false, threadsByInstance: { inst: [thread("t1", "login bug")] } },
    };
    expect(searchThreads(catalogsByHost, "login")).toHaveLength(0);
  });

  it("formats and parses host:thread refs", () => {
    const ref = formatSimpleThreadRef({ hostId: "host-a", threadId: "t1" });
    expect(ref).toBe("host-a:t1");
    expect(parseSimpleThreadRef(ref)).toEqual({ hostId: "host-a", threadId: "t1" });
  });

  it("returns null for malformed refs", () => {
    expect(parseSimpleThreadRef("not-a-ref")).toBeNull();
  });
});
