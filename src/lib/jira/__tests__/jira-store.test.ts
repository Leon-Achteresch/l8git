import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform, type TestPlatform } from "@/lib/agents/__tests__/platform-harness";
import {
  DEFAULT_JIRA_PREFS,
  JIRA_PREFS_KEY,
  jiraToolContextFor,
  parseJiraPrefs,
  serializeJiraPrefs,
  useJiraStore,
} from "@/lib/jira/jira-store";
import type { JiraCredentialStatus, JiraIssue } from "@/lib/jira/types";

const PATH = "/repos/app";

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
      linksByPath: {
        [PATH]: [
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
        linksByPath: { [PATH]: [{ key: "../etc" }, { key: "ABC-1" }, "nope", null] },
      }),
    );
    expect(parsed.linksByPath[PATH].map((entry) => entry.key)).toEqual(["ABC-1"]);
  });

  it("coerces missing metadata rather than trusting it", () => {
    const parsed = parseJiraPrefs(
      JSON.stringify({ linksByPath: { [PATH]: [{ key: "abc-1", summary: 42, syncedAt: "x" }] } }),
    );
    expect(parsed.linksByPath[PATH][0]).toEqual({
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
  it("resolves and persists a linked ticket", async () => {
    platform.invoke.mockResolvedValue(issue());
    const link = await useJiraStore.getState().linkTicket(PATH, "abc-1");
    expect(link.key).toBe("ABC-1");
    expect(link.summary).toBe("Login schlaegt fehl");
    expect(platform.invoke).toHaveBeenCalledWith("jira_fetch_issue", { key: "ABC-1" });
    expect(platform.storage.get(JIRA_PREFS_KEY)).toContain("ABC-1");
  });

  it("rejects a malformed key before touching the backend", async () => {
    await expect(useJiraStore.getState().linkTicket(PATH, "../etc/passwd")).rejects.toThrow();
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("deduplicates and keeps links sorted", async () => {
    platform.invoke.mockImplementation((_cmd, args) =>
      Promise.resolve(issue((args as { key: string }).key)),
    );
    await useJiraStore.getState().linkTicket(PATH, "DEF-2");
    await useJiraStore.getState().linkTicket(PATH, "ABC-1");
    await useJiraStore.getState().linkTicket(PATH, "abc-1");
    expect(useJiraStore.getState().linksByPath[PATH].map((entry) => entry.key)).toEqual([
      "ABC-1",
      "DEF-2",
    ]);
  });

  it("keeps links of other repositories untouched", async () => {
    platform.invoke.mockImplementation((_cmd, args) =>
      Promise.resolve(issue((args as { key: string }).key)),
    );
    await useJiraStore.getState().linkTicket(PATH, "ABC-1");
    await useJiraStore.getState().linkTicket("/repos/other", "DEF-2");
    useJiraStore.getState().unlinkTicket(PATH, "ABC-1");
    expect(useJiraStore.getState().linksByPath[PATH]).toBeUndefined();
    expect(useJiraStore.getState().linksByPath["/repos/other"]).toHaveLength(1);
  });

  it("keeps the stale card when a refresh fails", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(PATH, "ABC-1");
    useJiraStore.setState({ status: CONFIGURED, statusLoaded: true });
    platform.invoke.mockRejectedValue(new Error("offline"));
    await useJiraStore.getState().refreshLinks(PATH);
    expect(useJiraStore.getState().linksByPath[PATH][0].key).toBe("ABC-1");
  });

  it("does not refresh without credentials", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(PATH, "ABC-1");
    platform.invoke.mockClear();
    await useJiraStore.getState().refreshLinks(PATH);
    expect(platform.invoke).not.toHaveBeenCalled();
  });
});

describe("jiraToolContextFor", () => {
  it("mirrors the switches and the links of the given repository", async () => {
    platform.invoke.mockResolvedValue(issue());
    await useJiraStore.getState().linkTicket(PATH, "ABC-1");
    useJiraStore.setState({ status: CONFIGURED, statusLoaded: true });
    useJiraStore.getState().setEnabled(true);
    useJiraStore.getState().setAllowSearch(true);
    useJiraStore.getState().setAllowComments(false);

    expect(jiraToolContextFor(PATH)).toEqual({
      enabled: true,
      configured: true,
      allowSearch: true,
      allowComments: false,
      links: useJiraStore.getState().linksByPath[PATH],
    });
    expect(jiraToolContextFor("/repos/unknown").links).toEqual([]);
  });

  it("persists every switch", () => {
    useJiraStore.getState().setEnabled(true);
    useJiraStore.getState().setAllowSearch(true);
    const persisted = parseJiraPrefs(platform.storage.get(JIRA_PREFS_KEY) ?? null);
    expect(persisted).toMatchObject({ enabled: true, allowSearch: true });
  });
});
