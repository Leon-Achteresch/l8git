import { GitMerge, Loader2, RefreshCw, Sparkles, Split, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SpinIcon } from "@/components/motion/kit";
import { CommitSplitDialog, type CommitSplitResult } from "@/components/repo/commit/commit-split-dialog";
import { CommitMessageGuidance } from "@/components/repo/commit/commit-message-guidance";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  finishFlowStatus, getAgentReviewFinishController, pendingReviewDiff, releaseAgentReviewFinishController,
  reviewSnapshotSignature, type AgentReviewMergeStrategy, type AgentReviewStepId,
} from "@/lib/agents/agent-review";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import { generateAiCommitMessage } from "@/lib/ai-commit";
import { isAiConfigured } from "@/lib/ai-setup";
import { toastError, toastGitError, translateKnownError } from "@/lib/error-toast";
import { joinCommitMessage, splitCommitMessage } from "@/lib/commit-message";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { AgentReviewStepAction } from "./agent-review-step-action";
import { AgentReviewStepCard } from "./agent-review-step-card";
import { isAgentSessionBusyNow, useAgentSessionBusy } from "./use-agent-review";

function forgetRemovedWorktree(path: string): void {
  useAgentWorktreeStore.setState((state) => {
    const worktrees = { ...state.worktrees };
    delete worktrees[path];
    return { worktrees };
  });
}

async function refreshAfterStep(basePath: string): Promise<void> {
  const store = useRepoStore.getState();
  await Promise.all([store.reload(basePath), store.reloadStatus(basePath), store.reloadMergeState(basePath), store.reloadWorktrees(basePath)]);
}

export function AgentReviewFinishDialog({ open, onOpenChange, worktreePath, basePath, sessionBranch, baseBranch, worktreeCreatedAt, hasUncommitted, onFinished }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktreePath: string;
  basePath: string;
  sessionBranch: string;
  baseBranch: string;
  worktreeCreatedAt?: number;
  hasUncommitted: boolean;
  onFinished: () => void;
}) {
  const { t } = useTranslation();
  const busy = useAgentSessionBusy(worktreePath);
  const controller = useMemo(() => getAgentReviewFinishController(
    { worktreePath, basePath, sessionBranch, baseBranch, ...(worktreeCreatedAt === undefined ? {} : { worktreeCreatedAt }) }, hasUncommitted,
    { isBusy: () => isAgentSessionBusyNow(worktreePath),
      isCurrent: () => { const current = useAgentWorktreeStore.getState().worktrees[worktreePath]?.createdAt; return current === undefined || worktreeCreatedAt === undefined || current === worktreeCreatedAt; },
      onWorktreeRemoved: forgetRemovedWorktree, onChanged: refreshAfterStep },
  ), [worktreePath, basePath, sessionBranch, baseBranch, worktreeCreatedAt]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const flowStatus = finishFlowStatus(state.steps);
  const running = flowStatus === "running";
  const [aiBusy, setAiBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const announcedRef = useRef(false);
  const parts = splitCommitMessage(state.message);
  const reviewed = !!state.summary && state.reviewedSignature === reviewSnapshotSignature(state.summary, state.sessionHead);
  const locked = busy || running || state.checking || aiBusy || splitOpen;
  const commitStep = state.steps.find((step) => step.id === "commit")!;
  const mergeStep = state.steps.find((step) => step.id === "merge")!;
  const cleanupStep = state.steps.find((step) => step.id === "cleanup")!;
  const localizeError = useCallback((error: string | null) => error?.startsWith("agentReviewFinish.")
    ? t(error, { base: baseBranch, session: sessionBranch }) : error ? translateKnownError(error) : null, [baseBranch, sessionBranch, t]);
  const localizedStep = (step: typeof commitStep) => ({ ...step, error: localizeError(step.error) });

  useEffect(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiBusy(false);
    setSplitOpen(false);
    announcedRef.current = false;
    if (open) void controller.refresh();
    return () => { aiAbortRef.current?.abort(); };
  }, [open, controller]);

  useEffect(() => () => releaseAgentReviewFinishController(controller), [controller]);

  useEffect(() => {
    if (!open || flowStatus !== "done" || !state.validated || state.checking || state.checkError || announcedRef.current || !controller.getSnapshot().validated || controller.getSnapshot().checking || controller.getSnapshot().checkError) return;
    announcedRef.current = true;
    toast.success(t("agentReview.flowFinished"));
    onFinished();
  }, [open, flowStatus, state.validated, state.checking, state.checkError, controller, onFinished, t]);

  const runStep = async (id: AgentReviewStepId, retry = false) => {
    if (locked) return;
    const succeeded = await controller.run(id, retry);
    if (!succeeded) {
      const error = controller.getSnapshot().steps.find((step) => step.id === id)?.error;
      if (error) toastGitError(localizeError(error) ?? error);
    }
  };

  const generateCommitMessage = async () => {
    if (locked || aiAbortRef.current) return;
    const abort = new AbortController();
    aiAbortRef.current = abort;
    setAiBusy(true);
    try {
      const diff = await pendingReviewDiff(worktreePath, abort.signal);
      abort.signal.throwIfAborted();
      const message = await generateAiCommitMessage(diff, worktreePath, { signal: abort.signal });
      if (!abort.signal.aborted && message) controller.setMessage(message);
    } catch (error) {
      if (!abort.signal.aborted) toastError(localizeError(error instanceof Error ? error.message : String(error)) ?? String(error));
    } finally {
      if (aiAbortRef.current === abort) {
        aiAbortRef.current = null;
        setAiBusy(false);
      }
    }
  };

  const onSplitApplied = async (result: CommitSplitResult) => {
    if (result.committed === 0) return;
    await controller.refresh();
    controller.markSplitCommitted();
    await useRepoStore.getState().reloadStatus(worktreePath);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && running) return;
      if (!next) aiAbortRef.current?.abort();
      onOpenChange(next);
    }}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0 pr-7">
          <DialogTitle>{t("agentReview.finishTitle")}</DialogTitle>
        </DialogHeader>

        <div role="region" aria-label={t("agentReview.finishTitle")} tabIndex={0}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 [overflow-wrap:anywhere] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <DialogDescription>{t("agentReviewFinish.description", { session: sessionBranch, base: baseBranch })}</DialogDescription>
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">{t("agentReviewFinish.preflight")}</p>
            <Button type="button" size="xs" variant="ghost" disabled={locked} onClick={() => void controller.refresh()}>
              <SpinIcon icon={RefreshCw} active={state.checking} className="size-3" />
              {t("agentReview.refresh")}
            </Button>
          </div>
          {state.summary ? <p className="text-[0.6875rem] tabular-nums text-muted-foreground">{t("agentReviewFinish.summary", {
            files: state.summary.files.length, added: state.summary.additions, removed: state.summary.deletions,
            commits: state.summary.commits, open: state.summary.uncommitted,
          })}</p> : null}
          {state.checkError ? <p role="status" className="text-[0.6875rem] text-git-modified">{localizeError(state.checkError)}</p> : null}
          {busy ? <p className="text-[0.6875rem] text-git-modified">{t("agentReview.agentBusy")}</p> : null}
          {!state.worktreeRemoved && mergeStep.status !== "done" ? (
            <label className="flex cursor-pointer items-start gap-2 text-[0.6875rem] leading-relaxed">
              <Checkbox checked={reviewed} disabled={locked || !state.summary} onCheckedChange={(checked) => controller.markReviewed(checked === true)} className="mt-0.5" />
              {t("agentReviewFinish.reviewed")}
            </label>
          ) : null}
          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{t("agentReviewFinish.safetyHelp")}</p>
        </div>

        {commitStep.status !== "skipped" ? (
          <AgentReviewStepCard step={localizedStep(commitStep)} title={t("agentReview.stepCommit")}>
            <p className="text-[0.6875rem] text-muted-foreground">{t("agentReviewFinish.commitAllHint")}</p>
            {commitStep.status !== "done" ? <div className="space-y-2">
              <Textarea value={state.message} disabled={locked} onChange={(event) => controller.setMessage(event.target.value)}
                aria-label={t("agentReview.commitMessagePlaceholder")} placeholder={t("agentReview.commitMessagePlaceholder")} className="min-h-16 text-xs" />
              <CommitMessageGuidance subject={parts.subject} body={parts.body} compact disabled={locked}
                onSubjectChange={(subject) => controller.setMessage(joinCommitMessage(subject, splitCommitMessage(controller.getSnapshot().message).body))}
                onBodyChange={(body) => controller.setMessage(joinCommitMessage(splitCommitMessage(controller.getSnapshot().message).subject, body))} />
              <div className="flex flex-wrap items-center gap-2">
                <AgentReviewStepAction step={commitStep} steps={state.steps} label={t("agentReview.runCommit")} disabled={locked || !reviewed || !parts.subject.trim()}
                  onRun={() => void runStep("commit")} onRetry={() => void runStep("commit", true)} />
                {isAiConfigured() ? <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => void generateCommitMessage()} className="h-7 text-xs">
                  <SpinIcon icon={aiBusy ? Loader2 : Sparkles} className="mr-1.5 size-3" />{t("agentReview.generateAiMessage")}
                </Button> : null}
                {aiBusy ? <Button type="button" size="sm" variant="ghost" onClick={() => { aiAbortRef.current?.abort(); }}><X className="size-3" />{t("common.cancel")}</Button> : null}
                {isAiConfigured() ? <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => setSplitOpen(true)} className="h-7 text-xs">
                  <Split className="mr-1.5 size-3" />{t("agentReview.splitCommit")}
                </Button> : null}
              </div>
            </div> : <p className="text-[0.6875rem] text-muted-foreground">{t("agentReviewFinish.reviewAfterCommit")}</p>}
          </AgentReviewStepCard>
        ) : <p className="text-[0.6875rem] text-muted-foreground">{t("agentReview.stepCommitSkipped")}</p>}

        <AgentReviewStepCard step={localizedStep(mergeStep)} title={t("agentReview.stepMerge")}>
          <p className="text-[0.6875rem] text-muted-foreground">{t("agentReview.stepMergeHint", { session: sessionBranch, base: baseBranch })}</p>
          <Select value={state.strategy} onValueChange={(value) => controller.setStrategy(value as AgentReviewMergeStrategy)} disabled={locked || mergeStep.status === "done"}>
            <SelectTrigger size="sm" className="w-full text-xs" aria-label={t("agentReviewFinish.strategy")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["ff", "ff-only", "no-ff"] as const).map((strategy) => <SelectItem key={strategy} value={strategy} className="text-xs">{t(`agentReviewFinish.strategies.${strategy}.label`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[0.6875rem] text-muted-foreground">{t(`agentReviewFinish.strategies.${state.strategy}.hint`)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <AgentReviewStepAction step={mergeStep} steps={state.steps} label={t("agentReview.runMerge")} disabled={locked || !reviewed}
              onRun={() => void runStep("merge")} onRetry={() => void runStep("merge", true)} />
            {mergeStep.status === "failed" ? <Button type="button" size="sm" variant="outline" disabled={running || aiBusy} onClick={() => {
              useUiStore.getState().openMergeEditor(basePath); onOpenChange(false);
            }} className="h-7 text-xs"><GitMerge className="mr-1.5 size-3" />{t("agentReview.openConflictEditor")}</Button> : null}
          </div>
        </AgentReviewStepCard>

        <AgentReviewStepCard step={localizedStep(cleanupStep)} title={t("agentReview.stepCleanup")}>
          <p className="text-[0.6875rem] text-muted-foreground">{t("agentReviewFinish.cleanupHint")}</p>
          {state.worktreeRemoved ? <p role="status" className="text-[0.6875rem] text-git-added">{t(state.branchDeleted ? "agentReviewFinish.cleanupComplete" : "agentReviewFinish.worktreeRemoved")}</p> : null}
          <AgentReviewStepAction step={cleanupStep} steps={state.steps} label={t(state.worktreeRemoved ? "agentReviewFinish.deleteRemainingBranch" : "agentReview.runCleanup")} disabled={locked}
            onRun={() => void runStep("cleanup")} onRetry={() => void runStep("cleanup", true)} />
        </AgentReviewStepCard>
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={running || splitOpen} onClick={() => { aiAbortRef.current?.abort(); onOpenChange(false); }}>{t("agentReview.close")}</Button>
        </DialogFooter>
        {splitOpen ? <CommitSplitDialog open={splitOpen} onOpenChange={setSplitOpen} path={worktreePath} ownerRepoPath={basePath} onApplied={(result) => void onSplitApplied(result)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
