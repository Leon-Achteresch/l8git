import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform, type TestPlatform } from "@/lib/agents/__tests__/platform-harness";
import {
  DEFAULT_JIRA_PREFS,
  JIRA_PREFS_KEY,
  jiraToolContextFor,
  parseJiraPrefs,
  policyPayload,
  serializeJiraPrefs,
  useJiraStore,
} from "@/lib/jira/jira-store";
import type { JiraCredentialStatus, JiraIssue } from "@/lib/jira/types";

const PATH = "/repos/app";
const THREAD = "claude:thread-1";
const OTHER_THREAD = "codex:thread-2";

function issue(key = "ABC-1"): JiraIssue {
  return {
    key,
    summary: "Login schlaegt fehl",
    status: "In Progress",
    statusCategory: "In Progress",
    issueType: "Bug",
    priority: "High",
    assignee: "Lea",
    reporter: "Sam",
    resolution: "",
    labels: [],
    components: [],
    fixVersions: [],
    parent: "",
    subtasks: [],
    project: "ABC",
    dueDate: "",
    created: "",
    updated: "",
    description: "",
    url: `https://acme.atlassian.net/browse/${key}`,
    truncated: false,
  };
}

const CONFIGURED: JiraCredentialStatus = {
  configured: true,
  baseUrl: "https://acme.atlassian.net",
  email: "me@example.com",
  tokenHint: "••••1a2b",
};

let platform: TestPlatform;

beforeEach(() => {
  platform = installTestPlatform();
  useJiraStore.setState({
    ...DEFAULT_JIRA_PREFS,
    status: { configured: false, baseUrl: "", email: "", tokenHint: "" },
    statusLoaded: false,
  });
});

describe("parseJiraPrefs", () => {
  it("defaults to a fully closed integration", () => {
    expect(parseJiraPrefs(null)).toEqual(DEFAULT_JIRA_PREFS);
    expect(DEFAULT_JIRA_PREFS.enabled).toBe(false);
    expect(DEFAULT_JIRA_PREFS.allowSearch).toBe(false);
  });

  it("round-trips through serialize", () => {
    const prefs = {
      enabled: true,
      allowSearch: true,
      allowComments: false,
      registerExternal: false,
      activeThreadByPath: { [PATH]: THREAD },
      linksByThread: {
        [THREAD]: [
          {
            key: "ABC-1",
            summary: "s",
            status: "Open",
            statusCategory: "To Do",
            issueType: "Bug",
            url: "u",
            syncedAt: 5,
          },
        ],
      },
    };
    expect(parseJiraPrefs(serializeJiraPrefs(prefs))).toEqual(prefs);
  });

  it("falls back on unparsable or hostile payloads", () => {
    expect(parseJiraPrefs("not json")).toEqual(DEFAULT_JIRA_PREFS);
    expect(parseJiraPrefs("null")).toEqual(DEFAULT_JIRA_PREFS);
    expect(parseJiraPrefs('"string"')).toEqual(DEFAULT_JIRA_PREFS);
    expect(parseJiraPrefs("[1,2]")).toEqual(DEFAULT_JIRA_PREFS);
  });

  it("drops links whose key is not a real issue key", () => {
    const parsed = parseJiraPrefs(
      JSON.stringify({
        enabled: true,
        linksByThread: { [THREAD]: [{ key: "../etc" }, { key: "ABC-1" }, "nope", null] },
      }),
    );
    expect(parsed.linksByThread[THREAD].map((entry) => entry.key)).toEqual(["ABC-1"]);
  });

  it("ignores repository-wide links from the first iteration", () => {
    // A repo-wide pin has no conversation to belong to; migrating it would
    // hand an agent a ticket nobody linked to its chat.
    const parsed = parseJiraPrefs(
      JSON.stringify({ enabled: true, linksByPath: { [PATH]: [{ key: "ABC-1" }] } }),
    );
    expect(parsed.linksByThread).toEqual({});
    expect(parsed.enabled).toBe(true);
  });

  it("keeps only well-formed active-thread pointers", () => {
    const parsed = parseJiraPrefs(
      JSON.stringify({
        activeThreadByPath: { [PATH]: THREAD, "": THREAD, "/repos/blank": "", "/repos/x": 42 },
      }),
    );
    expect(parsed.activeThreadByPath).toEqual({ [PATH]: THREAD });
  });

  it("coerces missing metadata rather than trusting it", () => {
    const parsed = parseJiraPrefs(
      JSON.stringify({ linksByThread: { [THREAD]: [{ key: "abc-1", summary: 42, syncedAt: "x" }] } }),
    );
    expect(parsed.linksByThread[THREAD][0]).toEqual({
      key: "ABC-1",
      summary: "",
      status: "",
      statusCategory: "",
      issueType: "",
      url: "",
      syncedAt: 0,
    });
  });

  it("treats allowComments as opt-out and everything else as opt-in", () => {
    expect(parseJiraPrefs("{}")).toMatchObject({
      enabled: false,
      allowSearch: false,
      allowComments: true,
      registerExternal: true,
    });
    expect(parseJiraPrefs('{"allowComments":false}').allowComments).toBe(false);
    expect(parseJiraPrefs('{"registerExternal":false}').registerExternal).toBe(false);
    expect(parseJiraPrefs('{"enabled":"yes"}').enabled).toBe(false);
  });
});

describe("credential handling", () => {
  it("keeps the token out of persisted preferences", async () => {
    platform.invoke.mockResolvedValue(CONFIGURED);
    await useJiraStore.getState().saveCredentials(
      "https://acme.atlassian.net",
      "me@example.com",
      "super-secret-token",
    );
    expect(platform.invoke).toHaveBeenCalledWith("jira_save_credentials", {
      baseUrl: "https://acme.atlassian.net",
      email: "me@example.com",
      apiToken: "super-secret-token",
    });
    expect(useJiraStore.getState().status).toEqual(CONFIGURED);
    // The keychain is the only place the token lives.
    for (const value of platform.storage.values()) {
      expect(value).not.toContain("super-secret-token");
    }
  });

  it("reads as unconfigured when the keychain refuses to answer", async () => {
    platform.invoke.mockRejectedValue(new Error("keychain locked"));
    const status = await useJiraStore.getState().refreshStatus();
    expect(status.configured).toBe(false);
    expect(useJiraStore.getState().statusLoaded).toBe(true);
  });

  it("clears the status when the credentials are deleted", async () => {
    useJiraStore.setState({ status: CONFIGURED, statusLoaded: true });
    platform.invoke.mockResolvedValue(undefined);
    await useJiraStore.getState().deleteCredentials();
    expect(platform.invoke).toHaveBeenCalledWith("jira_delete_credentials", undefined);
    expect(useJiraStore.getState().status.configured).toBe(false);
  });
});

describe("ticket links", () => {
  it("resolves and persists a ticket against one conversation", async () => {
    platform.invoke.mockResolvedValue(issue());
    const link = await useJiraStore.getState().linkTicket(THREAD, "abc-1");
    expect(link.key).toBe("ABC-1");
    expect(link.summary).toBe("Login schlaegt fehl");
    expect(platform.invoke).toHaveBeenCalledWith("jira_fetch_issue", { key: "ABC-1" });
    expect(platform.storage.get(JIRA_PREFS_KEY)).toContain("ABC-1");
  });

  it("rejects a malformed key before touching the backend", async () => {
    await expect(useJiraStore.getState().linkTicket(THREAD, "../etc/passwd")).rejects.toThrow();
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("refuses to link without a conversation", async () => {
    await expect(useJiraStore.getState().linkTicket("", "ABC-1")).rejects.toThrow();
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("deduplicates and keeps links sorted", async () => {
    platform.invoke.mockImplementation((_cmd, args) =>
      Promise.resolve(issue((args as { key: string }).key)),
    );
    await useJiraStore.getState().linkTicket(THREAD, "DEF-2");
    await useJiraStore.getState().linkTicket(THREAD, "ABC-1");
    await useJiraStore.getState().linkTicket(THREAD, "abc-1");
    expect(useJiraStore.getState().linksByThread[THREAD].map((entry) => entry.key)).toEqual([
      "ABC-1",
      "DEF-2",
    ]);
  });

  it("keeps conversations independent of each other", async () => {
    platform.invoke.mockImplementation((_cmd, args) =>
      Promise.resolve(issue((args as { key: string }).key)),
    );
    await useJiraStore.getState().linkTicket(THREAD, "ABC-1");
    await useJiraStore.getState().linkTicket(OTHER_THREAD, "DEF-2");
    useJiraStore.getState().unlinkTicket(THREAD, "ABC-1");
    expect(useJiraStore.getState().linksByThread[THREAD]).toBeUndefined();
    expect(useJiraStore.getState().linksByThread[OTHER_THREAD]).toHaveLength(1);
  });

  it("keeps the stale card when a refresh fails", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(THREAD, "ABC-1");
    useJiraStore.setState({ status: CONFIGURED, statusLoaded: true });
    platform.invoke.mockRejectedValue(new Error("offline"));
    await useJiraStore.getState().refreshLinks(THREAD);
    expect(useJiraStore.getState().linksByThread[THREAD][0].key).toBe("ABC-1");
  });

  it("does not refresh without credentials", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(THREAD, "ABC-1");
    platform.invoke.mockClear();
    await useJiraStore.getState().refreshLinks(THREAD);
    expect(platform.invoke).not.toHaveBeenCalled();
  });
});

describe("setActiveThread", () => {
  it("records and clears which conversation a repository has open", () => {
    useJiraStore.getState().setActiveThread(PATH, THREAD);
    expect(useJiraStore.getState().activeThreadByPath).toEqual({ [PATH]: THREAD });
    useJiraStore.getState().setActiveThread(PATH, null);
    expect(useJiraStore.getState().activeThreadByPath).toEqual({});
  });

  it("ignores a repeated pointer so the policy file is not rewritten", () => {
    useJiraStore.getState().setActiveThread(PATH, THREAD);
    const writes = platform.invoke.mock.calls.filter((call) => call[0] === "jira_write_policy").length;
    useJiraStore.getState().setActiveThread(PATH, THREAD);
    expect(
      platform.invoke.mock.calls.filter((call) => call[0] === "jira_write_policy").length,
    ).toBe(writes);
  });

  it("ignores an empty repository path", () => {
    useJiraStore.getState().setActiveThread("", THREAD);
    expect(useJiraStore.getState().activeThreadByPath).toEqual({});
  });
});

describe("policyPayload", () => {
  it("carries the gate but never a credential", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(THREAD, "ABC-1");
    useJiraStore.getState().setActiveThread(PATH, THREAD);
    useJiraStore.getState().setEnabled(true);

    const payload = policyPayload({
      enabled: useJiraStore.getState().enabled,
      allowSearch: useJiraStore.getState().allowSearch,
      allowComments: useJiraStore.getState().allowComments,
      registerExternal: useJiraStore.getState().registerExternal,
      linksByThread: useJiraStore.getState().linksByThread,
      activeThreadByPath: useJiraStore.getState().activeThreadByPath,
    });
    expect(payload).toEqual({
      version: 2,
      enabled: true,
      allowSearch: false,
      allowComments: true,
      activeThreadByPath: { [PATH]: THREAD },
      keysByThread: { [THREAD]: ["ABC-1"] },
    });
    expect(JSON.stringify(payload)).not.toContain("tokenHint");
  });

  it("drops conversations whose links are all unusable", () => {
    const payload = policyPayload({
      ...DEFAULT_JIRA_PREFS,
      linksByThread: {
        [THREAD]: [
          { key: "not a key", summary: "", status: "", statusCategory: "", issueType: "", url: "", syncedAt: 0 },
        ],
      },
    });
    expect(payload.keysByThread).toEqual({});
  });
});

describe("jiraToolContextFor", () => {
  it("mirrors the switches and the links of the given conversation", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(THREAD, "ABC-1");
    useJiraStore.setState({ status: CONFIGURED, statusLoaded: true });
    useJiraStore.getState().setEnabled(true);
    useJiraStore.getState().setAllowSearch(true);
    useJiraStore.getState().setAllowComments(false);

    expect(jiraToolContextFor(THREAD)).toEqual({
      enabled: true,
      configured: true,
      allowSearch: true,
      allowComments: false,
      links: useJiraStore.getState().linksByThread[THREAD],
    });
    // A sibling conversation in the same repository sees nothing.
    expect(jiraToolContextFor(OTHER_THREAD).links).toEqual([]);
  });

  it("persists every switch", () => {
    useJiraStore.getState().setEnabled(true);
    useJiraStore.getState().setAllowSearch(true);
    const persisted = parseJiraPrefs(platform.storage.get(JIRA_PREFS_KEY) ?? null);
    expect(persisted).toMatchObject({ enabled: true, allowSearch: true });
  });
});
