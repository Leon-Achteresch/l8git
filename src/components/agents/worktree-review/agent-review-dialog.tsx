import { GitBranch, GitMerge, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { AgentStatusChip } from "@/components/agents/ui/agent-status-chip";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  discardReviewFile,
  discardReviewHunk,
  existingAgentReviewFinishController,
  loadAgentReviewFileDiff,
  loadAgentReviewSummary,
  reviewFileSnapshotEqual,
} from "@/lib/agents/agent-review";
import { toastError } from "@/lib/error-toast";
import { AgentReviewDiffPane } from "./agent-review-diff";
import { AgentReviewFileList } from "./agent-review-file-list";
import { AgentReviewStat } from "./agent-review-stat";
import { AgentReviewFinishDialog } from "./agent-review-finish-dialog";
import {
  useAgentReviewFileDiff,
  useAgentReviewSummary,
  useAgentReviewLiveRefresh,
  useAgentReviewIdentity,
  useAgentSessionBusy,
  isAgentSessionBusyNow,
  type AgentReviewSession,
} from "./use-agent-review";
import { SpinIcon } from "@/components/motion/kit";

const EMPTY_HUNKS: ReadonlySet<number> = new Set();

export function AgentReviewDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AgentReviewSession;
}) {
  const { t } = useTranslation();
  const busy = useAgentSessionBusy(session.worktreePath);
  const worktreeCreatedAt = useAgentReviewIdentity(session);
  const reviewSession = useMemo(() => ({ ...session, createdAt: worktreeCreatedAt }), [session, worktreeCreatedAt]);
  const { summary, loading, error, reload } = useAgentReviewSummary(reviewSession, open);
  const [selected, setSelected] = useState<string | null>(null);
  const [acceptedFiles, setAcceptedFiles] = useState<ReadonlySet<string>>(new Set());
  const [acceptedHunks, setAcceptedHunks] = useState<Record<string, ReadonlySet<number>>>({});
  const [diffNonce, setDiffNonce] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const viewEpochRef = useRef(0);

  useEffect(() => {
    viewEpochRef.current += 1;
    setSelected(null);
    setAcceptedFiles(new Set());
    setAcceptedHunks({});
    setFinishOpen(false);
    setPending(false);
    return () => { viewEpochRef.current += 1; };
  }, [open, session.worktreePath, session.basePath, worktreeCreatedAt]);

  const files = useMemo(() => summary?.files ?? [], [summary]);

  useEffect(() => {
    if (files.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((current) =>
      current && files.some((file) => file.path === current) ? current : files[0].path,
    );
  }, [files]);

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selected) ?? null,
    [files, selected],
  );
  const totals = { files: files.length, additions: summary?.additions ?? 0, deletions: summary?.deletions ?? 0 };

  const fileDiff = useAgentReviewFileDiff(
    reviewSession,
    summary?.mergeBase ?? null,
    selectedFile?.path ?? null,
    diffNonce,
  );

  const afterDiscard = useCallback(() => {
    setAcceptedFiles(new Set());
    setAcceptedHunks({});
    setDiffNonce((value) => value + 1);
    reload();
  }, [reload]);

  useAgentReviewLiveRefresh(session.worktreePath, afterDiscard);

  const handleAcceptFile = useCallback(() => {
    if (!selectedFile || busy || pendingRef.current || fileDiff.loading || fileDiff.failed) return;
    const path = selectedFile.path;
    setAcceptedFiles((current) => new Set(current).add(path));
    const hunkCount = fileDiff.parsed?.hunks.length ?? 0;
    setAcceptedHunks((current) => ({
      ...current,
      [path]: new Set(Array.from({ length: hunkCount }, (_, index) => index)),
    }));
  }, [busy, fileDiff.loading, fileDiff.failed, fileDiff.parsed, selectedFile]);

  const handleAcceptHunk = useCallback(
    (hunkIdx: number) => {
      if (!selectedFile || busy || pendingRef.current || fileDiff.loading || fileDiff.failed) return;
      const path = selectedFile.path;
      setAcceptedHunks((current) => {
        const next = new Set(current[path] ?? []);
        next.add(hunkIdx);
        return { ...current, [path]: next };
      });
    },
    [busy, fileDiff.loading, fileDiff.failed, selectedFile],
  );

  const verifyDisplayedDiff = useCallback(async () => {
    if (!selectedFile || !summary || isAgentSessionBusyNow(session.worktreePath)) throw new Error(t("agentReview.agentBusy"));
    const epoch = viewEpochRef.current;
    const [fresh, freshSummary] = await Promise.all([
      loadAgentReviewFileDiff(session.worktreePath, summary.mergeBase, selectedFile.path),
      loadAgentReviewSummary(session.worktreePath, session.basePath),
    ]);
    if (epoch !== viewEpochRef.current || freshSummary.sessionBranch !== summary.sessionBranch || freshSummary.baseBranch !== summary.baseBranch || freshSummary.mergeBase !== summary.mergeBase || !reviewFileSnapshotEqual(fresh, fileDiff)) {
      throw new Error(t("agentReviewFinish.diffChanged"));
    }
    if (isAgentSessionBusyNow(session.worktreePath)) throw new Error(t("agentReview.agentBusy"));
  }, [fileDiff.diff, fileDiff.untrackedPlain, fileDiff.isBinary, fileDiff.fingerprint, selectedFile, session.worktreePath, session.basePath, summary, t]);

  const handleDiscardFile = useCallback(() => {
    if (!selectedFile || !summary || busy || pendingRef.current || fileDiff.loading || fileDiff.failed) return;
    if (!window.confirm(t("agentReview.confirmDiscardFile", { file: selectedFile.path }))) return;
    setPending(true);
    pendingRef.current = true;
    verifyDisplayedDiff().then(() => discardReviewFile(session.worktreePath, summary.mergeBase, selectedFile, fileDiff.fingerprint ?? ""))
      .then(afterDiscard)
      .catch((cause: unknown) => toastError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => { pendingRef.current = false; setPending(false); });
  }, [afterDiscard, busy, fileDiff.loading, fileDiff.failed, fileDiff.fingerprint, selectedFile, session.worktreePath, summary, t, verifyDisplayedDiff]);

  const handleDiscardHunk = useCallback(
    (hunkIdx: number) => {
      if (!summary || !selectedFile || !fileDiff.parsed || busy || pendingRef.current || fileDiff.loading || fileDiff.failed) return;
      if (!window.confirm(t("agentReview.confirmDiscardHunk", { index: hunkIdx + 1 }))) return;
      setPending(true);
      pendingRef.current = true;
      verifyDisplayedDiff().then(() => discardReviewHunk(session.worktreePath, summary!.mergeBase, selectedFile!.path, fileDiff.parsed!, hunkIdx, fileDiff.fingerprint ?? ""))
        .then(afterDiscard)
        .catch((cause: unknown) =>
          toastError(cause instanceof Error ? cause.message : String(cause)),
        )
        .finally(() => { pendingRef.current = false; setPending(false); });
    },
    [afterDiscard, busy, fileDiff.loading, fileDiff.failed, fileDiff.parsed, fileDiff.fingerprint, summary, selectedFile, session.worktreePath, t, verifyDisplayedDiff],
  );

  const recovery = existingAgentReviewFinishController(session.worktreePath, session.basePath, worktreeCreatedAt);
  const canRecoverCleanup = !!recovery?.getSnapshot().worktreeRemoved && !recovery.getSnapshot().branchDeleted;
  const finishContext = summary ? { sessionBranch: summary.sessionBranch, baseBranch: summary.baseBranch } : canRecoverCleanup ? recovery?.context : null;
  const locked = busy || pending || loading || fileDiff.loading || fileDiff.failed;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next && pendingRef.current) return; onOpenChange(next); }}>
        <DialogContent className="flex h-[min(760px,88vh)] w-[min(1120px,95vw)] max-w-[min(1120px,95vw)] sm:max-w-[min(1120px,95vw)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-[var(--ag-line)] shrink-0 gap-2 border-b px-4 py-3 pr-12">
            <DialogTitle>{t("agentReview.title")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("agentReview.description")}
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[0.75rem] text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 h-6 gap-1 px-2 text-[0.6875rem]">
                <GitBranch className="size-3" />
                {summary?.sessionBranch ?? session.branch ?? "—"}
              </span>
              <GitMerge className="size-3 text-muted-foreground" />
              <span className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[0.75rem] text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 h-6 gap-1 px-2 text-[0.6875rem]">
                <GitBranch className="size-3" />
                {summary?.baseBranch ?? "—"}
              </span>
              <AgentReviewStat
                label={t("agentReview.statFiles")}
                value={String(totals.files)}
              />
              <AgentReviewStat
                label={t("agentReview.statAdded")}
                value={`+${totals.additions}`}
                className="text-git-added"
              />
              <AgentReviewStat
                label={t("agentReview.statRemoved")}
                value={`-${totals.deletions}`}
                className="text-git-removed"
              />
              {summary ? (
                <AgentReviewStat
                  label={t("agentReview.statCommits")}
                  value={String(summary.commits)}
                />
              ) : null}
              {summary && summary.uncommitted > 0 ? (
                <AgentReviewStat
                  label={t("agentReview.statUncommitted")}
                  value={String(summary.uncommitted)}
                />
              ) : null}
            </div>
          </DialogHeader>

          {busy ? (
            <div className="flex shrink-0 items-start gap-2 border-b border-git-modified/25 bg-git-modified/8 px-4 py-2 text-[0.6875rem]">
              <AgentStatusChip tone="waiting">{t("agentReview.agentBusy")}</AgentStatusChip>
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-destructive">
              {error}
            </div>
          ) : loading && !summary ? (
            <div className="flex flex-1 items-center justify-center">
              <SpinIcon icon={Loader2} className="size-6 text-primary/50" />
            </div>
          ) : (
            <AgentsEnter className="flex min-h-0 flex-1 flex-col md:flex-row">
              <div className="border-[var(--ag-line)] h-32 w-full shrink-0 border-b md:h-auto md:w-64 md:border-r md:border-b-0">
                <AgentReviewFileList
                  files={files}
                  selected={selected}
                  accepted={acceptedFiles}
                  onSelect={setSelected}
                />
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                <AgentReviewDiffPane
                  file={selectedFile}
                  parsed={fileDiff.parsed}
                  untrackedPlain={fileDiff.untrackedPlain}
                  isBinary={fileDiff.isBinary}
                  loading={fileDiff.loading}
                  failed={fileDiff.failed}
                  locked={locked}
                  fileAccepted={selectedFile ? acceptedFiles.has(selectedFile.path) : false}
                  acceptedHunks={
                    selectedFile ? acceptedHunks[selectedFile.path] ?? EMPTY_HUNKS : EMPTY_HUNKS
                  }
                  onAcceptFile={handleAcceptFile}
                  onDiscardFile={handleDiscardFile}
                  onAcceptHunk={handleAcceptHunk}
                  onDiscardHunk={handleDiscardHunk}
                />
              </div>
            </AgentsEnter>
          )}

          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none">
            <Button type="button" variant="outline" size="sm" onClick={afterDiscard} disabled={loading || pending}>
              <SpinIcon icon={RefreshCw} active={loading} />
              {t("agentReview.refresh")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setFinishOpen(true)}
              disabled={!finishContext || busy || pending || loading || !!error && !canRecoverCleanup}
            >
              <GitMerge />
              {t(canRecoverCleanup ? "agentReviewFinish.resumeCleanup" : "agentReview.finish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {finishContext ? (
        <AgentReviewFinishDialog
          open={finishOpen}
          onOpenChange={setFinishOpen}
          worktreePath={session.worktreePath}
          basePath={session.basePath}
          worktreeCreatedAt={worktreeCreatedAt}
          sessionBranch={finishContext.sessionBranch}
          baseBranch={finishContext.baseBranch}
          hasUncommitted={(summary?.uncommitted ?? 0) > 0}
          onFinished={() => onOpenChange(false)}
        />
      ) : null}
    </>
  );
}
