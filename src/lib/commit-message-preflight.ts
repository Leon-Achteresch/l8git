import { invoke } from "@tauri-apps/api/core";
import { parseCommitInspectMetadata } from "@/lib/commit-inspect-metadata";
import { joinCommitMessage } from "@/lib/commit-message";

/** History is an all-branches graph: its first commit is not necessarily HEAD. */
export async function readCommitHead(path: string): Promise<{ hash: string; commitMessage: string }> {
  const result = await invoke<{ header: string }>("repo_commit_inspect", { path, commit: "HEAD" });
  const head = parseCommitInspectMetadata(result.header);
  if (!head.hash) throw new Error("Unable to resolve HEAD");
  return { hash: head.hash, commitMessage: joinCommitMessage(head.subject, head.body) };
}
