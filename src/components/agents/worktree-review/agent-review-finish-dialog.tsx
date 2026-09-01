import { invoke } from "@tauri-apps/api/core";
import {
  GitMerge,
  Loader2,
  Sparkles,
  Split,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SpinIcon } from "@/components/motion/kit";
import {
  CommitSplitDialog,
  type CommitSplitResult,
} from "@/components/repo/commit/commit-split-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  commitReviewChanges,
  createFinishSteps,
  deleteSessionBranchIfMerged,
  finishFlowStatus,
  removeSessionWorktree,
  retryStep,
  setStepStatus,
  stagedReviewDiff,
  type AgentReviewStep,
  type AgentReviewStepId,
} from "@/lib/agents/agent-review";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import { generateAiCommitMessage } from "@/lib/ai-commit";
import { isAiConfigured } from "@/lib/ai-setup";
import { toastError, toastGitError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { AgentReviewStepAction } from "@/components/agents/worktree-review/agent-review-step-action";
import { AgentReviewStepCard } from "@/components/agents/worktree-review/agent-review-step-card";

export function AgentReviewFinishDialog({
  open,
  onOpenChange,
  worktreePath,
  basePath,
  sessionBranch,
  baseBranch,
  hasUncommitted,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worktreePath: string;
  basePath: string;
  sessionBranch: string;
  baseBranch: string;
  hasUncommitted: boolean;
  onFinished: () => void;
}) {
  const { t } = useTranslation();
  const mergeBranch = useRepoStore((state) => state.mergeBranch);
  const openMergeEditor = useUiStore((state) => state.openMergeEditor);
  const [steps, setSteps] = useState<AgentReviewStep[]>(() =>
    createFinishSteps({ hasUncommitted }),
  );
  const [message, setMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const announcedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSteps(createFinishSteps({ hasUncommitted }));
    announcedRef.current = false;
  }, [open, hasUncommitted]);

  const flowStatus = useMemo(() => finishFlowStatus(steps), [steps]);
  const stepById = useCallback(
    (id: AgentReviewStepId) => steps.find((step) => step.id === id)!,
    [steps],
  );

  const runCommit = useCallback(async () => {
    await commitReviewChanges(worktreePath, message.trim());
    await useRepoStore.getState().reloadStatus(worktreePath);
  }, [message, worktreePath]);

  const runMerge = useCallback(async () => {
    await mergeBranch(basePath, sessionBranch, { strategy: "ff" });
  }, [basePath, mergeBranch, sessionBranch]);

  const runCleanup = useCallback(async () => {
    const known = useAgentWorktreeStore.getState().worktrees[worktreePath];
    if (known)
      await useAgentWorktreeStore.getState().removeWorktree(worktreePath);
    else await removeSessionWorktree(basePath, worktreePath);

    if (sessionBranch !== baseBranch) {
      await deleteSessionBranchIfMerged(
        basePath,
        sessionBranch,
      );
    }
  }, [baseBranch, basePath, sessionBranch, worktreePath]);

  const runStep = useCallback(
    async (id: AgentReviewStepId) => {
      setSteps((current) => setStepStatus(current, id, "running"));
      try {
        if (id === "commit") await runCommit();
        else if (id === "merge") await runMerge();
        else if (id === "cleanup") await runCleanup();
        setSteps((current) => setStepStatus(current, id, "done"));
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : t("agentReview.unknownError");
        setSteps((current) => setStepStatus(current, id, "failed", text));
        toastGitError(text);
      }
    },
    [runCleanup, runCommit, runMerge, t],
  );

  useEffect(() => {
    if (flowStatus !== "done" || announcedRef.current) return;
    announcedRef.current = true;
    toast.success(t("agentReview.flowFinished"));
    onFinished();
  }, [flowStatus, onFinished, t]);

  const generateCommitMessage = async () => {
    setAiBusy(true);
    try {
      const diff = await stagedReviewDiff(worktreePath);
      const generated = await generateAiCommitMessage(diff);
      if (generated) setMessage(generated);
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiBusy(false);
    }
  };

  const onSplitApplied = async (result: CommitSplitResult) => {
    if (result.committed === 0) return;
    try {
      const status = await invoke<{ staged: number; unstaged: number }>(
        "git_status_counts",
        { path: worktreePath },
      );
      if (status.staged === 0 && status.unstaged === 0) {
        setSteps((current) => setStepStatus(current, "commit", "done"));
      }
      await useRepoStore.getState().reloadStatus(worktreePath);
    } catch (error) {
      toastError(error instanceof Error ? error.message : String(error));
    }
  };

  const commitStep = stepById("commit");
  const mergeStep = stepById("merge");
  const cleanupStep = stepById("cleanup");
  const aiAvailable = isAiConfigured();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("agentReview.finishTitle")}</DialogTitle>
          <DialogDescription>
            {t("agentReview.finishDescription", {
              session: sessionBranch,
              base: baseBranch,
            })}
          </DialogDescription>
        </DialogHeader>

        {hasUncommitted ? (
          <AgentReviewStepCard step={commitStep} title={t("agentReview.stepCommit")}>
            <p className="text-[11px] text-muted-foreground">
              {t("agentReview.stepCommitHint")}
            </p>
            {commitStep.status !== "done" ? (
              <div className="space-y-2">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t("agentReview.commitMessagePlaceholder")}
                  className="min-h-16 text-xs"
                />
                <div className="flex items-center gap-2">
                  <AgentReviewStepAction
                    step={commitStep}
                    steps={steps}
                    label={t("agentReview.runCommit")}
                    onRun={() => void runStep("commit")}
                    onRetry={() =>
                      setSteps((current) => retryStep(current, "commit"))
                    }
                  />
                  {aiAvailable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={aiBusy}
                      onClick={() => void generateCommitMessage()}
                      className="h-7 text-xs"
                    >
                      <SpinIcon
                        icon={aiBusy ? Loader2 : Sparkles}
                        className="mr-1.5 size-3"
                      />
                      {t("agentReview.generateAiMessage")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSplitOpen(true)}
                    className="h-7 text-xs"
                  >
                    <Split className="mr-1.5 size-3" />
                    {t("agentReview.splitCommit")}
                  </Button>
                </div>
              </div>
            ) : null}
          </AgentReviewStepCard>
        ) : null}

        <AgentReviewStepCard step={mergeStep} title={t("agentReview.stepMerge")}>
          <p className="text-[11px] text-muted-foreground">
            {t("agentReview.stepMergeHint", {
              session: sessionBranch,
              base: baseBranch,
            })}
          </p>
          <div className="flex items-center gap-2">
            <AgentReviewStepAction
              step={mergeStep}
              steps={steps}
              label={t("agentReview.runMerge")}
              onRun={() => void runStep("merge")}
              onRetry={() => setSteps((current) => retryStep(current, "merge"))}
            />
            {mergeStep.status === "failed" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  openMergeEditor(basePath);
                  onOpenChange(false);
                }}
                className="h-7 text-xs"
              >
                <GitMerge className="mr-1.5 size-3" />
                {t("agentReview.openConflictEditor")}
              </Button>
            ) : null}
          </div>
        </AgentReviewStepCard>

        <AgentReviewStepCard step={cleanupStep} title={t("agentReview.stepCleanup")}>
          <p className="text-[11px] text-muted-foreground">
            {t("agentReview.stepCleanupHint")}
          </p>
          <AgentReviewStepAction
            step={cleanupStep}
            steps={steps}
            label={t("agentReview.runCleanup")}
            onRun={() => void runStep("cleanup")}
            onRetry={() => setSteps((current) => retryStep(current, "cleanup"))}
          />
        </AgentReviewStepCard>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("agentReview.close")}
          </Button>
        </DialogFooter>

        {splitOpen ? (
          <CommitSplitDialog
            open={splitOpen}
            onOpenChange={setSplitOpen}
            path={worktreePath}
            onApplied={(result) => void onSplitApplied(result)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
