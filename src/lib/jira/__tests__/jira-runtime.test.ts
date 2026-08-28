import { beforeEach, describe, expect, it } from "vitest";

import { installTestPlatform, type TestPlatform } from "@/lib/agents/__tests__/platform-harness";
import { callJiraTool, formatComments, formatIssue, formatSearch } from "@/lib/jira/jira-runtime";
import type { JiraToolContext } from "@/lib/jira/jira-tools";
import type { JiraComment, JiraIssue, JiraTicketLink } from "@/lib/jira/types";

function link(key: string): JiraTicketLink {
  return { key, summary: "", status: "", statusCategory: "", issueType: "", url: "", syncedAt: 0 };
}

function context(overrides: Partial<JiraToolContext> = {}): JiraToolContext {
  return {
    enabled: true,
    configured: true,
    allowSearch: false,
    allowComments: true,
    links: [link("ABC-1")],
    ...overrides,
  };
}

function issue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key: "ABC-1",
    summary: "Login schlaegt fehl",
    status: "In Progress",
    statusCategory: "In Progress",
    issueType: "Bug",
    priority: "High",
    assignee: "Lea",
    reporter: "Sam",
    resolution: "",
    labels: ["auth"],
    components: [],
    fixVersions: [],
    parent: "",
    subtasks: [],
    project: "ABC",
    dueDate: "",
    created: "",
    updated: "2026-01-05",
    description: "Kaputt.",
    url: "https://acme.atlassian.net/browse/ABC-1",
    truncated: false,
    ...overrides,
  };
}

let platform: TestPlatform;

beforeEach(() => {
  platform = installTestPlatform();
});

const text = (result: { content: Array<{ text: string }> }) => result.content[0].text;

describe("callJiraTool — gates", () => {
  it("refuses every tool while the feature is off", async () => {
    const result = await callJiraTool("jira_get_issue", { key: "ABC-1" }, context({ enabled: false }));
    expect(result.isError).toBe(true);
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("refuses when no credentials are stored", async () => {
    const result = await callJiraTool("jira_get_issue", { key: "ABC-1" }, context({ configured: false }));
    expect(result.isError).toBe(true);
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("refuses an unknown tool name", async () => {
    const result = await callJiraTool("jira_delete_issue", { key: "ABC-1" }, context());
    expect(result.isError).toBe(true);
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("refuses comments when comment reading is off", async () => {
    const result = await callJiraTool("jira_get_comments", { key: "ABC-1" }, context({ allowComments: false }));
    expect(result.isError).toBe(true);
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("refuses a ticket that is not linked while search is off", async () => {
    const result = await callJiraTool("jira_get_issue", { key: "XYZ-9" }, context());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("XYZ-9");
    expect(platform.invoke).not.toHaveBeenCalled();
  });

  it("refuses search while search is off", async () => {
    const result = await callJiraTool("jira_search_issues", { jql: "project = ABC" }, context());
    expect(result.isError).toBe(true);
    expect(platform.invoke).not.toHaveBeenCalled();
  });
});

describe("callJiraTool — read paths", () => {
  it("fetches a linked issue with the normalised key", async () => {
    platform.invoke.mockResolvedValue(issue());
    const result = await callJiraTool("jira_get_issue", { key: "abc-1" }, context());
    expect(result.isError).toBeUndefined();
    expect(platform.invoke).toHaveBeenCalledWith("jira_fetch_issue", { key: "ABC-1" });
    expect(text(result)).toContain("ABC-1: Login schlaegt fehl");
  });

  it("fetches comments with a clamped limit", async () => {
    const comment: JiraComment = {
      id: "1",
      author: "Lea",
      created: "2026-01-02",
      updated: "",
      body: "Schaue rein.",
      truncated: false,
    };
    platform.invoke.mockResolvedValue([comment]);
    const result = await callJiraTool("jira_get_comments", { key: "ABC-1", limit: 999 }, context());
    expect(platform.invoke).toHaveBeenCalledWith("jira_fetch_comments", { key: "ABC-1", limit: 25 });
    expect(text(result)).toContain("Lea");
  });

  it("searches once search is allowed", async () => {
    platform.invoke.mockResolvedValue({ issues: [issue()], total: 1, truncated: false });
    const result = await callJiraTool(
      "jira_search_issues",
      { jql: " project = ABC " },
      context({ allowSearch: true }),
    );
    expect(platform.invoke).toHaveBeenCalledWith("jira_search_issues", {
      jql: "project = ABC",
      limit: 10,
    });
    expect(text(result)).toContain("ABC-1");
  });

  it("turns a backend failure into an error result instead of throwing", async () => {
    platform.invoke.mockRejectedValue(new Error("Jira 401: Anmeldung fehlgeschlagen."));
    const result = await callJiraTool("jira_get_issue", { key: "ABC-1" }, context());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("401");
  });

  it("only ever calls the three read-only backend commands", async () => {
    platform.invoke.mockResolvedValue(issue());
    await callJiraTool("jira_get_issue", { key: "ABC-1" }, context());
    platform.invoke.mockResolvedValue([]);
    await callJiraTool("jira_get_comments", { key: "ABC-1" }, context());
    platform.invoke.mockResolvedValue({ issues: [], total: 0, truncated: false });
    await callJiraTool("jira_search_issues", { jql: "project = ABC" }, context({ allowSearch: true }));
    expect(platform.invoke.mock.calls.map((call) => call[0])).toEqual([
      "jira_fetch_issue",
      "jira_fetch_comments",
      "jira_search_issues",
    ]);
  });
});

describe("formatting", () => {
  it("renders an issue as compact labelled lines and omits empty fields", () => {
    const rendered = formatIssue(issue({ components: [], resolution: "" }));
    expect(rendered).toContain("ABC-1: Login schlaegt fehl");
    expect(rendered).toContain("Status: In Progress");
    expect(rendered).toContain("Labels: auth");
    expect(rendered).toContain("Beschreibung:");
    expect(rendered).not.toContain("Komponenten:");
    expect(rendered).not.toContain("Resolution:");
  });

  it("marks a truncated description", () => {
    expect(formatIssue(issue({ truncated: true }))).toContain("gekürzt");
  });

  it("survives a completely empty issue", () => {
    const bare = formatIssue(
      issue({ summary: "", status: "", issueType: "", priority: "", assignee: "", reporter: "", labels: [], updated: "", url: "", description: "" }),
    );
    expect(bare).toContain("(ohne Titel)");
  });

  it("renders comments newest first and handles the empty case", () => {
    expect(formatComments("ABC-1", [])).toContain("keine Kommentare");
    const rendered = formatComments("ABC-1", [
      { id: "1", author: "Lea", created: "2026-01-02", updated: "", body: "Erst", truncated: false },
      { id: "2", author: "Sam", created: "2026-01-01", updated: "", body: "Dann", truncated: true },
    ]);
    expect(rendered).toContain("2 Kommentar(e)");
    expect(rendered.indexOf("Lea")).toBeLessThan(rendered.indexOf("Sam"));
    expect(rendered).toContain("(gekürzt)");
  });

  it("renders a search as one row per hit and flags truncation", () => {
    expect(formatSearch({ issues: [], total: 0, truncated: false })).toBe("Keine Treffer.");
    const rendered = formatSearch({ issues: [issue()], total: 42, truncated: true });
    expect(rendered).toContain("ABC-1 | Login schlaegt fehl | In Progress | Lea");
    expect(rendered).toContain("1 von 42");
  });
});
