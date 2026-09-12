import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform } from "@/lib/agents/__tests__/platform-harness";
import {
  flushAgentSessionCatalog,
  forkThreadEntry,
  loadAgentSessionCatalog,
  markThreadEphemeral,
  purgeThreadData,
  scheduleAgentSessionCatalogSave,
  threadsForInstance,
  type AgentSessionCatalog,
} from "@/lib/agents/session-catalog";
import { saveResumeCursors, setResumeCursor } from "@/lib/agents/resume-cursor";
import {
  AGENT_COMPOSER_DRAFTS_KEY,
  AGENT_SESSION_CATALOG_KEY as STORAGE_KEY,
} from "@/lib/agents/storage-keys";
import type { AgentThreadSummary } from "@/lib/agents/types";
import { threadId } from "@/lib/agents/types";

function thread(id: string): AgentThreadSummary {
  return {
    id,
    path: "/repo",
    title: id,
    preview: "",
    createdAt: 0,
    updatedAt: 0,
    status: "idle",
    modelProvider: "anthropic",
  };
}

describe("session catalog", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installTestPlatform().storage;
  });

  it("returns an empty catalog when nothing is stored", () => {
    expect(loadAgentSessionCatalog()).toEqual({});
  });

  it("returns an empty catalog for corrupt JSON", () => {
    store.set(STORAGE_KEY, "{not json");
    expect(loadAgentSessionCatalog()).toEqual({});
  });

  it("reads the zustand envelope and validates enum fields", () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          threadsByPath: {
            "/repo": [
              { id: "t1", title: "Hello", preview: "hi", createdAt: 1, updatedAt: 2 },
              { id: 42, title: "broken" },
              "garbage",
            ],
          },
          activeThreadByPath: { "/repo": "t1", "/other": null, "/bad": 7 },
          model: "gpt-5",
          approvalPolicy: "on-request",
          sandboxMode: "not-a-mode",
          collaborationMode: "plan",
          personality: "friendly",
        },
      }),
    );
    const catalog = loadAgentSessionCatalog();
    expect(catalog.threadsByPath?.["/repo"]).toHaveLength(1);
    expect(catalog.threadsByPath?.["/repo"]?.[0]).toMatchObject({
      id: "t1",
      title: "Hello",
      path: "/repo",
      status: "idle",
    });
    expect(catalog.activeThreadByPath).toEqual({ "/repo": "t1", "/other": null });
    expect(catalog.model).toBe("gpt-5");
    expect(catalog.approvalPolicy).toBe("on-request");
    expect(catalog.sandboxMode).toBeUndefined();
    expect(catalog.collaborationMode).toBe("plan");
    expect(catalog.personality).toBe("friendly");
  });

  it("round-trips through schedule + flush", () => {
    const catalog: AgentSessionCatalog = {
      threadsByPath: {},
      activeThreadByPath: {},
      model: "claude-sonnet-4-5",
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };
    scheduleAgentSessionCatalogSave(catalog);
    flushAgentSessionCatalog();
    expect(loadAgentSessionCatalog().model).toBe("claude-sonnet-4-5");
    expect(loadAgentSessionCatalog().sandboxMode).toBe("workspace-write");
  });
});

describe("threadsForInstance", () => {
  it("only returns threads assigned to the given instance", () => {
    const threadsByPath = { "/repo": [thread("t1"), thread("t2"), thread("t3")] };
    const instanceByThreadId = { t1: "claude:default", t2: "claude:work", t3: "claude:default" };
    expect(threadsForInstance(threadsByPath, instanceByThreadId, "/repo", "claude:default").map((t) => t.id)).toEqual([
      "t1",
      "t3",
    ]);
    expect(threadsForInstance(threadsByPath, instanceByThreadId, "/repo", "claude:work").map((t) => t.id)).toEqual([
      "t2",
    ]);
  });

  it("returns an empty list for an unknown path", () => {
    expect(threadsForInstance({}, {}, "/missing", "claude:default")).toEqual([]);
  });
});

describe("forkThreadEntry (HIST-04)", () => {
  it("adds a new thread with a forkedFrom reference and leaves the source untouched", () => {
    const source = thread("t1");
    const catalog: AgentSessionCatalog = {
      threadsByPath: { "/repo": [source] },
      activeThreadByPath: {},
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };

    const forked = forkThreadEntry(catalog, "/repo", "t1", "t1-fork", "msg-uuid-1");

    expect(forked.threadsByPath["/repo"]).toHaveLength(2);
    expect(catalog.threadsByPath["/repo"]).toEqual([source]);
    const forkedThread = forked.threadsByPath["/repo"].find((t) => t.id === "t1-fork");
    expect(forkedThread).toMatchObject({
      id: "t1-fork",
      forkedFrom: { threadId: "t1", upToMessageUuid: "msg-uuid-1" },
    });
  });

  it("carries the source thread's instance assignment over to the fork", () => {
    const source = thread("t1");
    const catalog: AgentSessionCatalog = {
      threadsByPath: { "/repo": [source] },
      activeThreadByPath: {},
      instanceByThreadId: { t1: "claude:work" },
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };

    const forked = forkThreadEntry(catalog, "/repo", "t1", "t1-fork", "msg-uuid-1");

    expect(forked.instanceByThreadId).toMatchObject({ t1: "claude:work", "t1-fork": "claude:work" });
    expect(catalog.instanceByThreadId).toEqual({ t1: "claude:work" });
  });

  it("returns the catalog unchanged when the source thread is missing", () => {
    const catalog: AgentSessionCatalog = {
      threadsByPath: { "/repo": [] },
      activeThreadByPath: {},
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };
    expect(forkThreadEntry(catalog, "/repo", "missing", "new-id", "uuid")).toBe(catalog);
  });
});

describe("ephemeral threads (HIST-07)", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installTestPlatform().storage;
  });

  it("does not persist threads flagged as ephemeral to the catalog storage", () => {
    const threadsByPath = markThreadEphemeral({ "/repo": [thread("t1"), thread("t2")] }, "/repo", "t1", true);
    const catalog: AgentSessionCatalog = {
      threadsByPath,
      activeThreadByPath: {},
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };

    scheduleAgentSessionCatalogSave(catalog);
    flushAgentSessionCatalog();

    const stored = JSON.parse(store.get(STORAGE_KEY) ?? "{}");
    const ids = (stored.state.threadsByPath["/repo"] as AgentThreadSummary[]).map((t) => t.id);
    expect(ids).toEqual(["t2"]);
  });

  it("also removes the ephemeral thread from activeThreadByPath and instanceByThreadId", () => {
    const threadsByPath = markThreadEphemeral({ "/repo": [thread("t1"), thread("t2")] }, "/repo", "t1", true);
    const catalog: AgentSessionCatalog = {
      threadsByPath,
      activeThreadByPath: { "/repo": "t1" },
      instanceByThreadId: { t1: "claude:default", t2: "claude:default" },
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };

    scheduleAgentSessionCatalogSave(catalog);
    flushAgentSessionCatalog();

    const stored = JSON.parse(store.get(STORAGE_KEY) ?? "{}");
    expect(stored.state.activeThreadByPath).toEqual({ "/repo": null });
    expect(stored.state.instanceByThreadId).toEqual({ t2: "claude:default" });
  });
});

function draftKey(host: string, instanceId: string, id: string): string {
  return `${host} ${instanceId} ${id}`;
}

describe("purgeThreadData (HIST-07)", () => {
  let harness: ReturnType<typeof installTestPlatform>;

  beforeEach(() => {
    harness = installTestPlatform();
  });

  it("removes the thread from catalog, resume cursor and drafts, and deletes the native session", async () => {
    const catalog: AgentSessionCatalog = {
      threadsByPath: { "/repo": [thread("t1"), thread("t2")] },
      activeThreadByPath: { "/repo": "t1" },
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };
    scheduleAgentSessionCatalogSave(catalog);
    flushAgentSessionCatalog();

    saveResumeCursors(setResumeCursor({}, threadId("t1"), {
      nativeSessionId: "native-t1",
      lastSequence: 1,
      updatedAt: 1,
    }));

    harness.storage.set(
      AGENT_COMPOSER_DRAFTS_KEY,
      JSON.stringify({
        [draftKey("claude", "claude:default", "t1")]: { text: "draft", attachments: [] },
        [draftKey("claude", "claude:default", "t2")]: { text: "keep", attachments: [] },
      }),
    );
    harness.invoke.mockResolvedValue(undefined);

    const result = await purgeThreadData("/repo", "t1");

    expect(result).toEqual({ removedFromCatalog: true, removedResumeCursor: true, removedDrafts: 1 });
    expect(loadAgentSessionCatalog().threadsByPath?.["/repo"]?.map((t) => t.id)).toEqual(["t2"]);
    const drafts = JSON.parse(harness.storage.get(AGENT_COMPOSER_DRAFTS_KEY) ?? "{}");
    expect(Object.keys(drafts)).toEqual([draftKey("claude", "claude:default", "t2")]);
    expect(harness.invoke).toHaveBeenCalledWith("claude_delete_session", {
      path: "/repo",
      sessionId: "t1",
      configDir: undefined,
    });
  });

  it("does not resurrect the purged thread through a pending scheduled save", async () => {
    const initial: AgentSessionCatalog = {
      threadsByPath: { "/repo": [thread("t1"), thread("t2")] },
      activeThreadByPath: { "/repo": "t1" },
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };
    scheduleAgentSessionCatalogSave(initial);
    flushAgentSessionCatalog();

    scheduleAgentSessionCatalogSave({ ...initial, model: "still-pending" });
    harness.invoke.mockResolvedValue(undefined);

    await purgeThreadData("/repo", "t1");
    flushAgentSessionCatalog();

    expect(loadAgentSessionCatalog().threadsByPath?.["/repo"]?.map((t) => t.id)).toEqual(["t2"]);
  });

  it("does not call claude_delete_session for a non-claude driver thread", async () => {
    const codexThread: AgentThreadSummary = { ...thread("t1"), modelProvider: "openai" };
    const catalog: AgentSessionCatalog = {
      threadsByPath: { "/repo": [codexThread] },
      activeThreadByPath: {},
      model: null,
      reasoningEffort: "medium",
      serviceTier: null,
      personality: "none",
      collaborationMode: "default",
      permissionProfile: null,
      realtimeVoice: null,
      approvalPolicy: "untrusted",
      sandboxMode: "workspace-write",
    };
    scheduleAgentSessionCatalogSave(catalog);
    flushAgentSessionCatalog();
    harness.invoke.mockResolvedValue(undefined);

    const result = await purgeThreadData("/repo", "t1");

    expect(result.removedFromCatalog).toBe(true);
    expect(harness.invoke).not.toHaveBeenCalledWith("claude_delete_session", expect.anything());
  });
});
