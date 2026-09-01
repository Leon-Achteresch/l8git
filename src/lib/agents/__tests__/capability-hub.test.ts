import { describe, expect, it } from "vitest";

import type {
  CapabilityItem,
  CapabilityOpResult,
  CapabilityTargetInfo,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_SCOPES,
  itemRef,
  itemStatusForTarget,
  itemStatusSummary,
  matchKey,
  scopeInfo,
  summarizeResults,
  targetKey,
  targetSupports,
  targetWritable,
} from "@/lib/agents/capability-hub";
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
