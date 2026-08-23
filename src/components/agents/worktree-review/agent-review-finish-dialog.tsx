import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  CircleDashed,
  GitMerge,
  Loader2,
  Split,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
  canRunStep,
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
import { CommitSplitDialog } from "@/components/repo/commit/commit-split-dialog";
import { generateAiCommitMessage } from "@/lib/ai-commit";
import { isAiConfigured } from "@/lib/ai-setup";
import { toastError, toastGitError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<AgentReviewStepId, typeof Check> = {
  commit: Check,
  merge: GitMerge,
  cleanup: CircleDashed,
};

function StepStatusIcon({ step }: { step: AgentReviewStep }) {
  if (step.status === "running") return <Loader2 className="size-3.5 animate-spin text-primary" />;
  if (step.status === "failed") return <TriangleAlert className="size-3.5 text-destructive" />;
  if (step.status === "done") return <Check className="size-3.5 text-git-added" />;
  const Icon = STEP_ICONS[step.id];
  return <Icon className="size-3.5 text-muted-foreground" />;
}

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
  const [branchKept, setBranchKept] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const announcedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSteps(createFinishSteps({ hasUncommitted }));
    setBranchKept(false);
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
    if (known) await useAgentWorktreeStore.getState().removeWorktree(worktreePath);
    else await removeSessionWorktree(basePath, worktreePath);
    const deleted = await deleteSessionBranchIfMerged(basePath, sessionBranch);
    setBranchKept(!deleted);
    await useRepoStore.getState().reloadWorktrees(basePath);
    await useRepoStore.getState().reload(basePath);
  }, [basePath, sessionBranch, worktreePath]);

  const runStep = useCallback(
    async (id: AgentReviewStepId) => {
      if (id === "commit" && !message.trim()) {
        toastError(t("agentReview.commitMessageRequired"));
        return;
      }
      setSteps((current) => setStepStatus(current, id, "running"));
      try {
        if (id === "commit") await runCommit();
        else if (id === "merge") await runMerge();
        else await runCleanup();
        setSteps((current) => setStepStatus(current, id, "done"));
      } catch (cause) {
        const text = cause instanceof Error ? cause.message : String(cause);
        setSteps((current) => setStepStatus(current, id, "failed", text));
        if (id === "merge") toastGitError(text, { repoPath: basePath });
        else toastError(text);
      }
    },
    [basePath, message, runCleanup, runCommit, runMerge, t],
  );

  useEffect(() => {
    if (!open || flowStatus !== "done" || announcedRef.current) return;
    announcedRef.current = true;
    toast.success(t("agentReview.finishedToast", { branch: baseBranch }), {
      description: branchKept
        ? t("agentReview.branchKeptHint", { branch: sessionBranch })
        : t("agentReview.undoHint"),
    });
    onFinished();
    onOpenChange(false);
  }, [
    baseBranch,
    branchKept,
    flowStatus,
    onFinished,
    onOpenChange,
    open,
    sessionBranch,
    t,
  ]);

  const suggestMessage = useCallback(async () => {
    if (!isAiConfigured()) {
      toastError(t("agentReview.aiNotConfigured"));
      return;
    }
    setAiBusy(true);
    try {
      await invoke("stage_files", { path: worktreePath, files: ["."] });
      const diff = await stagedReviewDiff(worktreePath);
      setMessage(await generateAiCommitMessage(diff, worktreePath, { onDelta: setMessage }));
    } catch (cause) {
      toastError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAiBusy(false);
    }
  }, [t, worktreePath]);

  const onSplitApplied = useCallback(
    async (result: { committed: number }) => {
      if (result.committed <= 0) return;
      await useRepoStore.getState().reloadStatus(worktreePath);
      const entries = useRepoStore.getState().status[worktreePath] ?? [];
      if (entries.length === 0) {
        setSteps((current) => setStepStatus(current, "commit", "done"));
      }
    },
    [worktreePath],
  );

  const commitStep = stepById("commit");
  const mergeStep = stepById("merge");
  const cleanupStep = stepById("cleanup");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(560px,94vw)] max-w-[min(560px,94vw)] flex-col gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("agentReview.finishTitle")}</DialogTitle>
          <DialogDescription>
            {t("agentReview.finishDescription", {
              session: sessionBranch,
              base: baseBranch,
            })}
          </DialogDescription>
        </DialogHeader>

        <StepCard step={commitStep} title={t("agentReview.stepCommit")}>
          {commitStep.status === "skipped" ? (
            <p className="text-[11px] text-muted-foreground">
              {t("agentReview.stepCommitSkipped")}
            </p>
          ) : (
            <>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("agentReview.commitMessagePlaceholder")}
                rows={3}
                disabled={commitStep.status === "done" || commitStep.status === "running"}
                className="text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void suggestMessage()}
                  disabled={aiBusy || commitStep.status === "done"}
                >
                  {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {t("agentReview.aiSuggest")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    if (!isAiConfigured()) {
                      toastError(t("agentReview.aiNotConfigured"));
                      return;
                    }
                    setSplitOpen(true);
                  }}
                  disabled={aiBusy || commitStep.status === "done" || commitStep.status === "running"}
                >
                  <Split />
                  {t("agentReview.splitCommits")}
                </Button>
                <StepAction
                  step={commitStep}
                  steps={steps}
                  label={t("agentReview.runCommit")}
                  onRun={() => void runStep("commit")}
                  onRetry={() => setSteps((current) => retryStep(current, "commit"))}
                />
              </div>
            </>
          )}
        </StepCard>

        <StepCard step={mergeStep} title={t("agentReview.stepMerge")}>
          <p className="text-[11px] text-muted-foreground">
            {t("agentReview.stepMergeHint", { session: sessionBranch, base: baseBranch })}
          </p>
          <div className="flex items-center gap-2">
            <StepAction
              step={mergeStep}
              steps={steps}
              label={t("agentReview.runMerge")}
              onRun={() => void runStep("merge")}
              onRetry={() => setSteps((current) => retryStep(current, "merge"))}
            />
            {mergeStep.status === "failed" ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => openMergeEditor(basePath)}
              >
                {t("agentReview.openConflictEditor")}
              </Button>
            ) : null}
          </div>
        </StepCard>

        <StepCard step={cleanupStep} title={t("agentReview.stepCleanup")}>
          <p className="text-[11px] text-muted-foreground">
            {t("agentReview.stepCleanupHint")}
          </p>
          <StepAction
            step={cleanupStep}
            steps={steps}
            label={t("agentReview.runCleanup")}
            onRun={() => void runStep("cleanup")}
            onRetry={() => setSteps((current) => retryStep(current, "cleanup"))}
          />
        </StepCard>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

function StepCard({
  step,
  title,
  children,
}: {
  step: AgentReviewStep;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={cn(
        "ag-card space-y-2 rounded-lg p-3",
        step.status === "failed" && "ring-1 ring-destructive/40",
        step.status === "done" && "opacity-70",
      )}
    >
      <header className="flex items-center gap-2">
        <StepStatusIcon step={step} />
        <span className="flex-1 text-xs font-medium">{title}</span>
        <span className="ag-faint text-[10.5px] uppercase tracking-wide">
          {t(`agentReview.status.${step.status}`)}
        </span>
      </header>
      {children}
      {step.error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {step.error}
        </p>
      ) : null}
    </section>
  );
}

function StepAction({
  step,
  steps,
  label,
  onRun,
  onRetry,
}: {
  step: AgentReviewStep;
  steps: readonly AgentReviewStep[];
  label: string;
  onRun: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (step.status === "done" || step.status === "skipped") return null;
  if (step.status === "failed") {
    return (
      <Button type="button" variant="outline" size="xs" onClick={onRetry}>
        {t("agentReview.retry")}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="xs"
      onClick={onRun}
      disabled={!canRunStep(steps, step.id) || step.status === "running"}
    >
      {step.status === "running" ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  );
}
