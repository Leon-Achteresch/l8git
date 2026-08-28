import { describe, expect, it } from "vitest";

import {
  JIRA_GET_COMMENTS,
  JIRA_GET_ISSUE,
  JIRA_SEARCH_ISSUES,
  isJiraToolName,
  jiraToolsFor,
  linkedKeys,
  resolveIssueKeyArg,
  resolveJqlArg,
  resolveLimitArg,
  type JiraToolContext,
} from "@/lib/jira/jira-tools";
import type { JiraTicketLink } from "@/lib/jira/types";

function link(key: string, summary = ""): JiraTicketLink {
  return { key, summary, status: "", statusCategory: "", issueType: "", url: "", syncedAt: 0 };
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

const names = (ctx: JiraToolContext) => jiraToolsFor(ctx).map((tool) => tool.name);

describe("jiraToolsFor — the token gate", () => {
  it("offers nothing while the feature is off", () => {
    expect(jiraToolsFor(context({ enabled: false }))).toEqual([]);
  });

  it("offers nothing without credentials", () => {
    expect(jiraToolsFor(context({ configured: false }))).toEqual([]);
  });

  it("offers nothing when there is neither a linked ticket nor search", () => {
    expect(jiraToolsFor(context({ links: [], allowSearch: false }))).toEqual([]);
  });

  it("offers the read tools once a ticket is linked", () => {
    expect(names(context())).toEqual([JIRA_GET_ISSUE, JIRA_GET_COMMENTS]);
  });

  it("drops the comment tool when comments are not allowed", () => {
    expect(names(context({ allowComments: false }))).toEqual([JIRA_GET_ISSUE]);
  });

  it("adds search only when search is allowed", () => {
    expect(names(context({ allowSearch: true }))).toEqual([
      JIRA_GET_ISSUE,
      JIRA_GET_COMMENTS,
      JIRA_SEARCH_ISSUES,
    ]);
  });

  it("still offers the read tools with search on but no linked ticket", () => {
    expect(names(context({ links: [], allowSearch: true }))).toEqual([
      JIRA_GET_ISSUE,
      JIRA_GET_COMMENTS,
      JIRA_SEARCH_ISSUES,
    ]);
  });

  it("never exposes a write-shaped tool", () => {
    const every = jiraToolsFor(context({ allowSearch: true }));
    for (const tool of every) {
      expect(tool.name).toMatch(/^jira_(get|search)_/);
    }
  });
});

describe("jiraToolsFor — schema shape", () => {
  it("narrows the key to an enum of linked tickets when search is off", () => {
    const [getIssue] = jiraToolsFor(context({ links: [link("ABC-1"), link("DEF-2")] }));
    const key = (getIssue.inputSchema.properties as Record<string, Record<string, unknown>>).key;
    expect(key.enum).toEqual(["ABC-1", "DEF-2"]);
  });

  it("widens the key to a pattern once search is allowed", () => {
    const [getIssue] = jiraToolsFor(context({ allowSearch: true }));
    const key = (getIssue.inputSchema.properties as Record<string, Record<string, unknown>>).key;
    expect(key.enum).toBeUndefined();
    expect(typeof key.pattern).toBe("string");
  });

  it("falls back to a pattern when the enum would grow too large", () => {
    const many = Array.from({ length: 40 }, (_, index) => link(`ABC-${index + 1}`));
    const [getIssue] = jiraToolsFor(context({ links: many }));
    const key = (getIssue.inputSchema.properties as Record<string, Record<string, unknown>>).key;
    expect(key.enum).toBeUndefined();
  });

  it("names the linked tickets in the description so no extra call is needed", () => {
    const [getIssue] = jiraToolsFor(context({ links: [link("ABC-1", "Login kaputt")] }));
    expect(getIssue.description).toContain("ABC-1 (Login kaputt)");
  });

  it("keeps the disabled surface at zero cost", () => {
    const cost = JSON.stringify(jiraToolsFor(context({ enabled: false }))).length;
    expect(cost).toBe(2);
  });
});

describe("linkedKeys", () => {
  it("normalises and deduplicates", () => {
    expect(linkedKeys(context({ links: [link("abc-1"), link("ABC-1"), link("nope")] }))).toEqual([
      "ABC-1",
    ]);
  });
});

describe("resolveIssueKeyArg — the allow-list the schema only hints at", () => {
  it("accepts a linked key", () => {
    expect(resolveIssueKeyArg(context(), "abc-1")).toEqual({ ok: true, value: "ABC-1" });
  });

  it("refuses an unlinked key while search is off", () => {
    const result = resolveIssueKeyArg(context(), "XYZ-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("XYZ-9");
  });

  it("accepts any well-formed key once search is allowed", () => {
    expect(resolveIssueKeyArg(context({ allowSearch: true }), "XYZ-9")).toEqual({
      ok: true,
      value: "XYZ-9",
    });
  });

  it("rejects malformed and non-string keys even with search on", () => {
    const wide = context({ allowSearch: true });
    for (const bad of ["../../admin", "ABC-1/../x", "", 42, null, undefined, {}]) {
      expect(resolveIssueKeyArg(wide, bad).ok).toBe(false);
    }
  });
});

describe("resolveJqlArg", () => {
  it("refuses when search is disabled", () => {
    expect(resolveJqlArg(context(), "project = ABC").ok).toBe(false);
  });

  it("accepts and trims a query when search is enabled", () => {
    expect(resolveJqlArg(context({ allowSearch: true }), "  project = ABC ")).toEqual({
      ok: true,
      value: "project = ABC",
    });
  });

  it("refuses empty and oversized queries", () => {
    const wide = context({ allowSearch: true });
    expect(resolveJqlArg(wide, "   ").ok).toBe(false);
    expect(resolveJqlArg(wide, 5).ok).toBe(false);
    expect(resolveJqlArg(wide, "x".repeat(2001)).ok).toBe(false);
  });
});

describe("resolveLimitArg", () => {
  it("clamps into range and falls back on junk", () => {
    expect(resolveLimitArg(undefined, 10, 25)).toBe(10);
    expect(resolveLimitArg(5, 10, 25)).toBe(5);
    expect(resolveLimitArg(0, 10, 25)).toBe(1);
    expect(resolveLimitArg(1000, 10, 25)).toBe(25);
    expect(resolveLimitArg("many", 10, 25)).toBe(10);
    expect(resolveLimitArg(Number.NaN, 10, 25)).toBe(10);
    expect(resolveLimitArg(7.9, 10, 25)).toBe(7);
  });
});

describe("isJiraToolName", () => {
  it("recognises exactly the three read tools", () => {
    expect(isJiraToolName(JIRA_GET_ISSUE)).toBe(true);
    expect(isJiraToolName(JIRA_GET_COMMENTS)).toBe(true);
    expect(isJiraToolName(JIRA_SEARCH_ISSUES)).toBe(true);
    expect(isJiraToolName("jira_create_issue")).toBe(false);
    expect(isJiraToolName("render_chart")).toBe(false);
  });
});
