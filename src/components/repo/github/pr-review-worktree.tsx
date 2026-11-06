import { Button } from "@/components/ui/button";
import { worktreeTargetPath } from "@/lib/agents/agent-worktrees";
import { toastError } from "@/lib/error-toast";
import { subjectKey, useGithubWorkspace } from "@/lib/github-expansion/store";
import { createReviewWorkspace } from "@/lib/github-expansion/workspace";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { isFullSha } from "@/lib/github-ui/workspace-resume";
import { isHubPath } from "@/lib/hub/store";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { FolderGit2, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { WorkspaceResume } from "./issue-start-work";

/** Review branch name pinned to the head being reviewed, so a later head gets a fresh branch. */
export const reviewBranchName = (number: number, headSha: string) => `review/pr-${number}-${headSha.slice(0, 10).toLowerCase()}`;

/**
 * 8: isolated review checkout via canonical `createReviewWorkspace`: the backend fetches `refs/pull/N/head` (so fork
 * PRs work), verifies the pinned head SHA, keeps `main` untouched and disables hooks/filters. Nothing runs automatically;
 * the user must explicitly allow checking out PR code. Cleanup refuses dirty worktrees.
 */
export function PrReviewWorktree({ path, number, headSha }: { path: string; number: number; headBranch?: string; headSha: string }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const gh = isTarget(target) ? target : null;
  const key = gh ? subjectKey(gh.account, gh.fullName, "pull", number) : null;
  const ws = useGithubWorkspace((s) => (key ? s.subjects[key]?.workspace : undefined));
  const update = useGithubWorkspace((s) => s.updateSubject);
  const remove = useRepoStore((s) => s.worktreeRemove);
  const [allow, setAllow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  // Needs a local clone (not a hub: path) whose origin is this GitHub repository; the backend re-verifies origin.
  if (!gh || !key || isHubPath(path) || !isFullSha(headSha)) return null;
  const wtPath = worktreeTargetPath(path, `review-pr-${number}-${headSha.slice(0, 10)}`);

  async function create() {
    if (!gh || !allow) return;
    setBusy(true);
    try {
      const r = await createReviewWorkspace(gh.account, gh.fullName, number, { repoPath: path, worktreePath: wtPath, branch: reviewBranchName(number, headSha), expectedHeadSha: headSha }, allow);
      setWarning(r.cleanup_warning);
      if (r.cleanup_warning) toast.warning(r.cleanup_warning);
      toast.success(t("reviewWt.created"));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function cleanup() {
    if (!ws || !key) return;
    setBusy(true);
    try {
      const status = await invoke<unknown[]>("repo_status", { path: ws.worktreePath });
      if (status.length > 0) return toastError(t("reviewWt.dirty", { count: status.length }));
      if (!window.confirm(t("reviewWt.removeConfirm", { path: ws.worktreePath }))) return;
      await remove(ws.repoPath, ws.worktreePath, false);
      update(key, { workspace: undefined });
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 space-y-1 text-[0.6875rem]" data-testid="pr-review-worktree">
      {warning && <p role="status" className="text-amber-600">{t("startWork.cleanupWarning", { warning })}</p>}
      {!ws ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-muted-foreground">
            <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
            {t("reviewWt.allowCode")}
          </label>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[0.6875rem] text-muted-foreground" disabled={busy || !allow} onClick={() => void create()} title={t("reviewWt.hint")}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderGit2 className="h-3 w-3" />}{t("reviewWt.create")}
          </Button>
          <span className="font-mono text-muted-foreground">{t("reviewWt.pinned", { sha: headSha.slice(0, 10) })}</span>
        </div>
      ) : (
        <>
          {ws.head.toLowerCase() !== headSha.toLowerCase() && <p className="text-amber-600">{t("reviewWt.moved", { got: ws.head.slice(0, 10), want: headSha.slice(0, 10) })}</p>}
          <WorkspaceResume subject={key} workspace={ws} currentHead={headSha} onUnlink={() => update(key, { workspace: undefined })} />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[0.6875rem]" disabled={busy} onClick={() => void cleanup()}><Trash2 className="h-3 w-3" />{t("reviewWt.remove")}</Button>
            <span className="text-[0.625rem] text-muted-foreground">{t("reviewWt.profilesHint")}</span>
          </div>
        </>
      )}
    </div>
  );
}
