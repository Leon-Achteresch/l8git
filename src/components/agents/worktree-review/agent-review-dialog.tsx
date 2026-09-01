import { GitBranch, GitMerge, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  reviewTotals,
} from "@/lib/agents/agent-review";
import { toastError } from "@/lib/error-toast";
import { AgentReviewDiffPane } from "./agent-review-diff";
import { AgentReviewFileList } from "./agent-review-file-list";
import { AgentReviewStat } from "./agent-review-stat";
import { AgentReviewFinishDialog } from "./agent-review-finish-dialog";
import {
  useAgentReviewFileDiff,
  useAgentReviewSummary,
  useAgentSessionBusy,
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
  const { summary, loading, error, reload } = useAgentReviewSummary(session, open);
  const [selected, setSelected] = useState<string | null>(null);
  const [acceptedFiles, setAcceptedFiles] = useState<ReadonlySet<string>>(new Set());
  const [acceptedHunks, setAcceptedHunks] = useState<Record<string, ReadonlySet<number>>>({});
  const [diffNonce, setDiffNonce] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setAcceptedFiles(new Set());
      setAcceptedHunks({});
    }
  }, [open]);

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
  const totals = useMemo(() => reviewTotals(files), [files]);

  const fileDiff = useAgentReviewFileDiff(
    session,
    summary?.mergeBase ?? null,
    selectedFile?.path ?? null,
    diffNonce,
  );

  const afterDiscard = useCallback(() => {
    setDiffNonce((value) => value + 1);
    reload();
  }, [reload]);

  const handleAcceptFile = useCallback(() => {
    if (!selectedFile) return;
    const path = selectedFile.path;
    setAcceptedFiles((current) => new Set(current).add(path));
    const hunkCount = fileDiff.parsed?.hunks.length ?? 0;
    setAcceptedHunks((current) => ({
      ...current,
      [path]: new Set(Array.from({ length: hunkCount }, (_, index) => index)),
    }));
  }, [fileDiff.parsed, selectedFile]);

  const handleAcceptHunk = useCallback(
    (hunkIdx: number) => {
      if (!selectedFile) return;
      const path = selectedFile.path;
      setAcceptedHunks((current) => {
        const next = new Set(current[path] ?? []);
        next.add(hunkIdx);
        return { ...current, [path]: next };
      });
    },
    [selectedFile],
  );

  const handleDiscardFile = useCallback(() => {
    if (!selectedFile || !summary) return;
    if (!window.confirm(t("agentReview.confirmDiscardFile", { file: selectedFile.path }))) return;
    setPending(true);
    discardReviewFile(session.worktreePath, summary.mergeBase, selectedFile)
      .then(afterDiscard)
      .catch((cause: unknown) => toastError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setPending(false));
  }, [afterDiscard, selectedFile, session.worktreePath, summary, t]);

  const handleDiscardHunk = useCallback(
    (hunkIdx: number) => {
      if (!fileDiff.parsed) return;
      if (!window.confirm(t("agentReview.confirmDiscardHunk", { index: hunkIdx + 1 }))) return;
      setPending(true);
      discardReviewHunk(session.worktreePath, fileDiff.parsed, hunkIdx)
        .then(afterDiscard)
        .catch((cause: unknown) =>
          toastError(cause instanceof Error ? cause.message : String(cause)),
        )
        .finally(() => setPending(false));
    },
    [afterDiscard, fileDiff.parsed, session.worktreePath, t],
  );

  const locked = busy || pending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(760px,88vh)] w-[min(1120px,95vw)] max-w-[min(1120px,95vw)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="ag-line shrink-0 gap-2 border-b px-4 py-3 pr-12">
            <DialogTitle>{t("agentReview.title")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("agentReview.description")}
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="ag-chip h-6 gap-1 px-2 text-[11px]">
                <GitBranch className="size-3" />
                {summary?.sessionBranch ?? session.branch ?? "—"}
              </span>
              <GitMerge className="size-3 text-muted-foreground" />
              <span className="ag-chip h-6 gap-1 px-2 text-[11px]">
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
            <div className="flex shrink-0 items-start gap-2 border-b border-git-modified/25 bg-git-modified/8 px-4 py-2 text-[11px]">
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
            <AgentsEnter className="flex min-h-0 flex-1">
              <div className="ag-line w-64 shrink-0 border-r">
                <AgentReviewFileList
                  files={files}
                  selected={selected}
                  accepted={acceptedFiles}
                  onSelect={setSelected}
                />
              </div>
              <div className="min-w-0 flex-1">
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
            <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
              <SpinIcon icon={RefreshCw} active={loading} />
              {t("agentReview.refresh")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setFinishOpen(true)}
              disabled={!summary || locked}
            >
              <GitMerge />
              {t("agentReview.finish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {summary ? (
        <AgentReviewFinishDialog
          open={finishOpen}
          onOpenChange={setFinishOpen}
          worktreePath={session.worktreePath}
          basePath={session.basePath}
          sessionBranch={summary.sessionBranch}
          baseBranch={summary.baseBranch}
          hasUncommitted={summary.uncommitted > 0}
          onFinished={() => onOpenChange(false)}
        />
      ) : null}
    </>
  );
}
