import { describe, expect, it } from "vitest";

import type {
  CapabilityItem,
  CapabilityOpResult,
  CapabilityTargetInfo,
} from "@/lib/agents/capability-hub";
import {
  CAPABILITY_SCOPES,
  itemRef,
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
