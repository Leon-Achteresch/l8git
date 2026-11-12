import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { bitbucket } from "./bitbucket";
import { github } from "./github";
import { gitlab } from "./gitlab";
import type { HubAccount } from "./types";

const acct = (provider: HubAccount["provider"], host: string) => ({ provider, host, login: "me" }) as HubAccount;
const call = () => invoke.mock.calls[0][1] as { method: string; path: string; body: unknown };
const reply = (data: unknown) => invoke.mockResolvedValueOnce({ status: 200, data });

const glIssue = { id: 9, iid: 3, title: "T", description: "B", web_url: "https://gitlab.com/g/p/-/issues/3", created_at: "2026-01-01", user_notes_count: 0, labels: ["bug"], state: "closed", author: null };
const bbIssue = { id: 4, title: "T", content: { raw: "B" }, created_on: "2026-01-01", state: "resolved", reporter: null, links: { html: { href: "https://bitbucket.org/w/r/issues/4" } } };

beforeEach(() => invoke.mockReset());

describe("GitHub issue create", () => {
  it("sends labels and assignees with the create request", async () => {
    reply({ html_url: "https://github.com/o/r/issues/1" });
    expect(await github.createIssue(acct("github", "github.com"), "o/r", "T", "B", { labels: ["bug"], assignees: ["me"] })).toBe("https://github.com/o/r/issues/1");
    expect(call()).toMatchObject({ method: "POST", path: "/repos/o/r/issues", body: { title: "T", body: "B", labels: ["bug"], assignees: ["me"] } });
  });
});

describe("GitLab issues", () => {
  const a = acct("gitlab", "gitlab.com");
  it("creates with comma labels and numeric assignee ids", async () => {
    reply({ web_url: "u" });
    await gitlab.createIssue(a, "g/p", "T", "B", { labels: ["a", "b"], assignees: ["7"] });
    expect(call()).toMatchObject({ method: "POST", path: "/projects/g%2Fp/issues", body: { title: "T", description: "B", labels: "a,b", assignee_ids: [7] } });
  });

  it("edits and closes through state_event and parses the reply", async () => {
    reply(glIssue);
    const out = await gitlab.updateIssue!(a, "g/p", 3, { title: "T", body: "B", state: "closed" });
    expect(call()).toMatchObject({ method: "PUT", path: "/projects/g%2Fp/issues/3", body: { title: "T", description: "B", state_event: "close" } });
    expect(out).toMatchObject({ number: 3, body: "B", state: "closed", labels: [{ name: "bug", color: null }] });
  });

  it("reopens without touching title or body", async () => {
    reply({ ...glIssue, state: "opened" });
    expect((await gitlab.updateIssue!(a, "g/p", 3, { state: "open" })).state).toBe("open");
    expect(call().body).toEqual({ state_event: "reopen" });
  });

  it("lists label choices with bare hex colors", async () => {
    reply([{ name: "bug", color: "#ff0000" }]);
    expect(await gitlab.issueLabels!(a, "g/p", 1)).toEqual({ items: [{ id: "bug", label: "bug", color: "ff0000" }], page: 1, hasMore: false });
  });
});

describe("Bitbucket issues", () => {
  const a = acct("bitbucket", "bitbucket.org");
  it("closes as resolved and reopens as open", async () => {
    reply(bbIssue);
    expect((await bitbucket.updateIssue!(a, "w/r", 4, { state: "closed" })).state).toBe("closed");
    expect(call()).toMatchObject({ method: "PUT", path: "/repositories/w/r/issues/4", body: { state: "resolved" } });
    invoke.mockReset();
    reply({ ...bbIssue, state: "open" });
    expect((await bitbucket.updateIssue!(a, "w/r", 4, { state: "open" })).state).toBe("open");
    expect(call().body).toEqual({ state: "open" });
  });

  it("edits the raw body", async () => {
    reply(bbIssue);
    expect((await bitbucket.updateIssue!(a, "w/r", 4, { title: "T", body: "B" })).body).toBe("B");
    expect(call().body).toEqual({ title: "T", content: { raw: "B" } });
  });
});
