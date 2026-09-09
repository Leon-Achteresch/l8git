import { describe, expect, it } from "vitest";

import type {
  CapabilityItem,
  CapabilityOpResult,
  CapabilityTargetInfo,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_SCOPES,
  assetLocalPresence,
  coverageSummary,
  defaultTargets,
  gapsToward,
  itemRef,
  itemStatusForTarget,
  itemStatusSummary,
  matchKey,
  mergeMcpToolCatalog,
  preferredWritableScope,
  mcpReconnectRequired,
  nextMcpOAuthState,
  presenceColumns,
  respondsToRequest,
  scopeInfo,
  summarizeResults,
  targetKey,
  targetSupports,
  targetWritable,
  validateMcpServerDraft,
} from "@/lib/agents/capability-hub";
import type { AgentMcpServerDraft } from "@/lib/agents/capability-types";
import { assetTargetKind, assetsFor } from "@/lib/agents/capability-market";
import type { MarketAsset, MarketDetail } from "@/lib/agents/capability-market";

function target(overrides: Partial<CapabilityTargetInfo> = {}): CapabilityTargetInfo {
  return {
    cli: "claude",
    label: "Claude Code",
    command: "claude",
    installed: true,
    kinds: ["skill", "command", "agent", "mcp", "hook"],
    scopes: [
      { scope: "global", root: "/etc/claude-code", exists: true, writable: false, itemCount: 0 },
      { scope: "user", root: "/home/dev/.claude", exists: true, writable: true, itemCount: 4 },
      { scope: "repo", root: "/repo/.claude", exists: false, writable: true, itemCount: 0 },
    ],
    ...overrides,
  };
}

function result(status: CapabilityOpResult["status"]): CapabilityOpResult {
  return {
    kind: "skill",
    name: "review",
    source: "Claude Code (User)",
    target: "Codex (Projekt)",
    status,
    message: "",
    path: null,
    backup: null,
  };
}

describe("capability hub helpers", () => {
  it("covers the global, user, and project level", () => {
    expect(CAPABILITY_SCOPES).toEqual(["global", "user", "repo"]);
    expect(scopeInfo(target(), "global")?.root).toBe("/etc/claude-code");
    expect(scopeInfo(target(), "user")?.itemCount).toBe(4);
    expect(scopeInfo(undefined, "user")).toBeUndefined();
  });

  it("treats a read-only global level as no target", () => {
    const targets = [target()];
    expect(targetWritable(targets, { cli: "claude", scope: "global" })).toBe(false);
    expect(targetWritable(targets, { cli: "claude", scope: "user" })).toBe(true);
    expect(targetWritable(targets, { cli: "codex", scope: "user" })).toBe(false);
  });

  it("knows which CLI understands which kind", () => {
    const targets = [target(), target({ cli: "gemini", label: "Gemini CLI", kinds: ["command", "mcp"] })];
    expect(targetSupports(targets, "gemini", "command")).toBe(true);
    expect(targetSupports(targets, "gemini", "skill")).toBe(false);
    expect(targetSupports(targets, "unknown", "skill")).toBe(false);
  });

  it("builds stable keys and refs", () => {
    expect(targetKey({ cli: "codex", scope: "repo" })).toBe("codex:repo");
    const item: CapabilityItem = {
      id: "claude:user:skill:review",
      cli: "claude",
      scope: "user",
      kind: "skill",
      name: "review",
      rel: "review",
      description: "",
      path: "/home/dev/.claude/skills/review",
      isDirectory: true,
      fileCount: 2,
      sizeBytes: 100,
      updatedAtMs: 0,
      fingerprint: "abc",
    };
    expect(itemRef(item)).toEqual({ cli: "claude", scope: "user", kind: "skill", rel: "review" });
  });

  it("counts successes, skips, and failures separately", () => {
    const totals = summarizeResults([
      result("copied"),
      result("installed"),
      result("skipped"),
      result("unsupported"),
      result("error"),
    ]);
    expect(totals).toEqual({ ok: 2, skipped: 2, failed: 1 });
  });
});

describe("capability comparison", () => {
  function item(overrides: Partial<CapabilityItem> = {}): CapabilityItem {
    return {
      id: "claude:user:agent:planner.md",
      cli: "claude",
      scope: "user",
      kind: "agent",
      name: "planner",
      rel: "planner.md",
      description: "",
      path: "/home/dev/.claude/agents/planner.md",
      isDirectory: false,
      fileCount: 1,
      sizeBytes: 10,
      updatedAtMs: 0,
      fingerprint: "aaa",
      ...overrides,
    };
  }

  const targets = [
    target(),
    target({ cli: "cursor", label: "Cursor CLI", kinds: ["command", "agent", "mcp"] }),
    target({ cli: "gemini", label: "Gemini CLI", kinds: ["command", "mcp"] }),
  ];

  it("ignores the CLI file name conventions when comparing", () => {
    expect(matchKey("agent", "planner.md")).toBe(matchKey("agent", "planner.mdc"));
    expect(matchKey("command", "ship.md")).toBe(matchKey("command", "ship.prompt.md"));
    expect(matchKey("command", "team/ship.md")).toBe("team:ship");
    expect(matchKey("skill", "review/")).toBe("review");
    expect(matchKey("mcp", "Docs")).toBe("docs");
  });

  it("says per target whether a copy would add, replace, or change nothing", () => {
    const source = item();
    const cursorSame = item({ cli: "cursor", rel: "planner.mdc", id: "cursor:user:agent:planner.mdc" });
    const cursorOther = item({
      cli: "cursor",
      rel: "planner.mdc",
      id: "cursor:user:agent:planner.mdc",
      fingerprint: "bbb",
    });
    const inventory = [source, cursorSame];

    expect(itemStatusForTarget(source, { cli: "cursor", scope: "user" }, targets, inventory)).toBe("same");
    expect(itemStatusForTarget(source, { cli: "cursor", scope: "user" }, targets, [source, cursorOther])).toBe(
      "different",
    );
    expect(itemStatusForTarget(source, { cli: "cursor", scope: "repo" }, targets, inventory)).toBe("missing");
    expect(itemStatusForTarget(source, { cli: "gemini", scope: "user" }, targets, inventory)).toBe("unsupported");
  });

  it("counts the states across all chosen targets", () => {
    const source = item();
    const inventory = [source, item({ cli: "cursor", rel: "planner.mdc", id: "cursor:user:agent:planner.mdc" })];
    const totals = itemStatusSummary(
      source,
      [
        { cli: "cursor", scope: "user" },
        { cli: "cursor", scope: "repo" },
        { cli: "gemini", scope: "user" },
      ],
      targets,
      inventory,
    );
    expect(totals).toEqual({ missing: 1, same: 1, different: 0, unsupported: 1 });
  });

  it("picks the fullest writable scope and other CLIs as default targets", () => {
    const codex = target({
      cli: "codex",
      label: "Codex",
      kinds: ["skill", "command", "agent", "mcp"],
      scopes: [
        { scope: "global", root: null, exists: false, writable: false, itemCount: 0 },
        { scope: "user", root: "/home/dev/.codex", exists: true, writable: true, itemCount: 2 },
        { scope: "repo", root: "/repo/.codex", exists: false, writable: true, itemCount: 0 },
      ],
    });
    expect(preferredWritableScope(target())).toBe("user");
    expect(defaultTargets([target(), codex], { cli: "claude", scope: "user" })).toEqual([
      { cli: "codex", scope: "user" },
    ]);
    expect(presenceColumns([target(), codex], [{ cli: "codex", scope: "repo" }], { cli: "claude", scope: "user" })).toEqual([
      { cli: "claude", scope: "user" },
      { cli: "codex", scope: "repo" },
    ]);
  });

  it("counts what a copy from the source would add or replace", () => {
    const source = item();
    const cursor = item({ cli: "cursor", rel: "planner.mdc", id: "cursor:user:agent:planner.mdc" });
    const infos = [
      target(),
      target({ cli: "cursor", label: "Cursor CLI", kinds: ["command", "agent", "mcp"] }),
    ];
    expect(gapsToward([source, cursor], { cli: "claude", scope: "user" }, { cli: "cursor", scope: "user" }, infos, ["agent"]).missing).toHaveLength(0);
    expect(gapsToward([source, cursor], { cli: "claude", scope: "user" }, { cli: "cursor", scope: "user" }, infos, ["agent"]).different).toHaveLength(0);
    expect(gapsToward([source], { cli: "claude", scope: "user" }, { cli: "cursor", scope: "repo" }, infos, ["agent"]).missing.map((entry) => entry.name)).toEqual(["planner"]);
    expect(coverageSummary([source, cursor], { cli: "claude", scope: "user" }, [{ cli: "cursor", scope: "user" }], infos, ["agent"])).toEqual({
      missing: 0,
      different: 0,
      same: 1,
      unsupported: 0,
      total: 1,
    });
    expect(assetLocalPresence("planner", "agent", [source, cursor])).toEqual(["claude", "cursor"]);
  });
});

describe("marketplace helpers", () => {
  const assets: MarketAsset[] = [
    { kind: "skill", name: "review", path: "skills/review", description: "", fileCount: 2 },
    { kind: "mcp", name: "mcp", path: ".mcp.json", description: "", fileCount: 1 },
    { kind: "hookScript", name: "format.sh", path: "hooks/format.sh", description: "", fileCount: 1 },
  ];
  const detail = { assets } as MarketDetail;

  it("maps market assets onto the CLI capability kinds", () => {
    expect(assetTargetKind("skill")).toBe("skill");
    expect(assetTargetKind("hookScript")).toBe("hook");
    expect(assetTargetKind("pluginMarketplace")).toBe("mcp");
  });

  it("prefers matching assets and falls back to everything", () => {
    expect(assetsFor(detail, "skill").map((asset) => asset.name)).toEqual(["review"]);
    expect(assetsFor(detail, "hook").map((asset) => asset.name)).toEqual(["format.sh"]);
    expect(assetsFor(detail, "command")).toHaveLength(assets.length);
    expect(assetsFor(null, "skill")).toEqual([]);
  });
});

function mcpItem(overrides: Partial<CapabilityItem> = {}): CapabilityItem {
  return {
    id: "claude:repo:mcp:jira",
    cli: "claude",
    scope: "repo",
    kind: "mcp",
    name: "jira",
    rel: "jira",
    description: "",
    path: "/repo/.mcp.json",
    isDirectory: false,
    fileCount: 1,
    sizeBytes: 0,
    updatedAtMs: 0,
    fingerprint: "f1",
    ...overrides,
  };
}

describe("mergeMcpToolCatalog", () => {
  const target = { cli: "claude", scope: "repo" as const };

  it("marks a configured server unconfigured when there is no live connection", () => {
    const entries = mergeMcpToolCatalog([mcpItem()], [], target);
    expect(entries).toEqual([
      { cli: "claude", scope: "repo", name: "jira", configured: true, status: "unconfigured", tools: [], authStatus: null },
    ]);
  });

  it("attaches the live tool catalog when the server is connected", () => {
    const entries = mergeMcpToolCatalog(
      [mcpItem()],
      [{ name: "jira", tools: ["search", "createIssue"], authStatus: "ready" }],
      target,
    );
    expect(entries).toEqual([
      {
        cli: "claude",
        scope: "repo",
        name: "jira",
        configured: true,
        status: "connected",
        tools: ["search", "createIssue"],
        authStatus: "ready",
      },
    ]);
  });

  it("surfaces connection errors and keeps same-named servers in different repos separate", () => {
    const items = [
      mcpItem({ id: "a", scope: "repo" }),
      mcpItem({ id: "b", scope: "user" }),
    ];
    const entries = mergeMcpToolCatalog(items, [{ name: "jira", tools: [], authStatus: "error" }], target);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ scope: "repo", status: "error", tools: [] });
  });
});

function mcpDraft(overrides: Partial<AgentMcpServerDraft> = {}): AgentMcpServerDraft {
  return {
    baseConfig: {},
    name: "docs",
    transport: "stdio",
    enabled: true,
    required: false,
    command: "npx",
    args: [],
    cwd: "",
    env: [],
    envVars: [],
    remoteEnvVars: [],
    url: "",
    bearerTokenEnvVar: "",
    auth: "oauth",
    oauthResource: "",
    httpHeaders: [],
    envHttpHeaders: [],
    startupTimeoutSec: 30,
    toolTimeoutSec: 60,
    enabledTools: [],
    disabledTools: [],
    scopes: [],
    defaultApprovalMode: "auto",
    experimentalEnvironment: "local",
    ...overrides,
  };
}

describe("validateMcpServerDraft", () => {
  it("accepts a valid stdio draft with a secret reference", () => {
    const issues = validateMcpServerDraft(mcpDraft({ env: [{ key: "TOKEN", value: "secret:api-token" }] }));
    expect(issues).toEqual([]);
  });

  it("rejects an empty secret reference", () => {
    const issues = validateMcpServerDraft(mcpDraft({ env: [{ key: "TOKEN", value: "secret:" }] }));
    expect(issues).toContain("Der Secret-Verweis für TOKEN ist leer.");
  });

  it("rejects a stdio draft without a command", () => {
    const issues = validateMcpServerDraft(mcpDraft({ command: "" }));
    expect(issues).toContain("Für STDIO-MCP ist ein Startbefehl erforderlich.");
  });

  it("rejects an http draft without a valid url", () => {
    const issues = validateMcpServerDraft(mcpDraft({ transport: "http", url: "not-a-url" }));
    expect(issues).toContain("Für HTTP-MCP ist eine gültige http(s)-URL erforderlich.");
  });

  it("accepts a valid http draft", () => {
    const issues = validateMcpServerDraft(mcpDraft({ transport: "http", url: "https://example.test/mcp" }));
    expect(issues).toEqual([]);
  });
});

describe("nextMcpOAuthState / respondsToRequest", () => {
  it("increments the request id on start so a stale response can be detected", () => {
    const started = nextMcpOAuthState(undefined, "start");
    expect(started).toEqual({ status: "authorizing", requestId: 1 });
    expect(respondsToRequest(started, 1)).toBe(true);

    const cancelled = nextMcpOAuthState(started, "cancel");
    expect(cancelled.status).toBe("needsAuth");
    expect(respondsToRequest(cancelled, 1)).toBe(false);

    const restarted = nextMcpOAuthState(cancelled, "start");
    expect(restarted.requestId).toBe(3);
    const authorized = nextMcpOAuthState(restarted, "authorized");
    expect(authorized).toEqual({ status: "authorized", requestId: 3 });
  });
});

describe("mcpReconnectRequired", () => {
  it("is false when nothing is running or nothing changed", () => {
    expect(mcpReconnectRequired(null, 100)).toBe(false);
    expect(mcpReconnectRequired(100, null)).toBe(false);
  });

  it("is true only when the config changed after the tool started running", () => {
    expect(mcpReconnectRequired(100, 200)).toBe(true);
    expect(mcpReconnectRequired(200, 100)).toBe(false);
  });
});
