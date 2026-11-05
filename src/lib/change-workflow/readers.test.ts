import { describe, expect, it, vi } from "vitest";
import type { AgentReviewInvoke } from "@/lib/agents/agent-review";
import { captureAgentSnapshot, loadChangeMap, runWithEvidence } from "./readers";

function transport(content: () => string, heads: () => string = () => "head"): AgentReviewInvoke {
  return vi.fn(async (command: string) => {
    if (command === "git_resolve_commit") return heads();
    if (command === "agent_review_summary") return { fingerprint: content(), files: [{ path: "src/a.ts" }] };
    throw new Error(`Unexpected command ${command}`);
  }) as AgentReviewInvoke;
}

describe("evidence snapshots from actual repository data", () => {
  it("rejects a worktree changing between content reads", async () => {
    let revision = 0;
    await expect(captureAgentSnapshot("worktree", "base", transport(() => String(++revision)))).rejects.toThrow(/changed/);
  });

  it("rejects a commit moving while content fingerprint stays the same", async () => {
    let revision = 0;
    await expect(captureAgentSnapshot("worktree", "base", transport(() => "content", () => String(++revision)))).rejects.toThrow(/changed/);
  });

  it("records a successful check as stale if it mutated the worktree", async () => {
    let content = "before";
    const result = await runWithEvidence("worktree", "base", async () => { content = "after"; return { exitCode: 0 }; }, transport(() => content));
    expect(result.result.exitCode).toBe(0);
    expect(result.snapshot.worktreeFingerprint).toBe("before");
    expect(result.state).toBe("stale");
  });
});

describe("repository change map reader", () => {
  it("merges tracked/untracked paths and real PR/session overlays including deleted files", async () => {
    const read = vi.fn(async (command: string) => {
      if (command === "repo_list_files") return ["src/a.ts"];
      if (command === "repo_status") return [{ path: "new.ts", untracked: true }];
      throw new Error(command);
    }) as AgentReviewInvoke;
    const map = await loadChangeMap("repo", [
      { id: "PR#12", kind: "pullRequest", files: ["src/deleted.ts"] },
      { id: "agent", kind: "session", files: ["src/a.ts"] },
    ], [], read);
    expect(map.nodes.find(node => node.id === "src/deleted.ts")?.pullRequests).toEqual(["PR#12"]);
    expect(map.nodes.find(node => node.id === "new.ts")?.kind).toBe("file");
    expect(map.dependencies).toEqual([]);
  });
});
