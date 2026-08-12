import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  flushAgentSessionCatalog,
  loadAgentSessionCatalog,
  scheduleAgentSessionCatalogSave,
  type AgentSessionCatalog,
} from "@/lib/agents/session-catalog";

const STORAGE_KEY = "l8git-agent-chat";

function stubLocalStorage() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: stub,
    configurable: true,
  });
  return store;
}

describe("session catalog", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = stubLocalStorage();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
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
