import {
  GitCommitHorizontal,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  addSplitGroup,
  applySplitPlan,
  collectSplitInputs,
  moveUnits,
  planIssues,
  planSplitFromUnits,
  removeSplitGroup,
  renameSplitGroup,
  resetSplitStaging,
  runnableGroups,
  unitLabel,
  unitTotals,
  type SplitApplyProgress,
  type SplitPlan,
  type SplitUnit,
} from "@/lib/commit-split";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

type Phase = "loading" | "planning" | "ready" | "applying" | "empty" | "failed";

async function refreshRepo(path: string): Promise<void> {
  const store = useRepoStore.getState();
  await store.reloadStatus(path);
  if (store.repos[path]) await store.reload(path);
}

export interface CommitSplitResult {
  committed: number;
  cancelled: boolean;
}

export function CommitSplitDialog({
  open,
  onOpenChange,
  path,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  onApplied?: (result: CommitSplitResult) => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [units, setUnits] = useState<SplitUnit[]>([]);
  const [plan, setPlan] = useState<SplitPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unstagedNotice, setUnstagedNotice] = useState(false);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<SplitApplyProgress | null>(null);
  const cancelRef = useRef(false);

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const totals = useMemo(() => unitTotals(units), [units]);
  const issues = useMemo(
    () => (plan ? planIssues(plan, units) : ["empty"]),
    [plan, units],
  );

  const requestPlan = useCallback(
    async (available: SplitUnit[]) => {
      setPhase("planning");
      setError(null);
      try {
        const result = await planSplitFromUnits(available, { repoPath: path });
        setPlan(result.plan);
        setWarnings(result.warnings);
        setPhase("ready");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase("failed");
      }
    },
    [path],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    cancelRef.current = false;
    setPhase("loading");
    setPlan(null);
    setWarnings([]);
    setError(null);
    setSelection(new Set());
    setProgress(null);

    void (async () => {
      try {
        const collected = await collectSplitInputs(path);
        if (cancelled) return;
        setUnits(collected.units);
        setUnstagedNotice(collected.hadStaged);
        if (collected.units.length === 0) {
          setPhase("empty");
          return;
        }
        await requestPlan(collected.units);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, path, requestPlan]);

  const toggleUnit = useCallback((unitId: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }, []);

  const moveSelection = useCallback(
    (unitIds: readonly string[], targetGroupId: string) => {
      setPlan((current) => (current ? moveUnits(current, unitIds, targetGroupId) : current));
      setSelection(new Set());
    },
    [],
  );

  const apply = useCallback(async () => {
    if (!plan) return;
    cancelRef.current = false;
    setPhase("applying");
    setProgress(null);
    try {
      const result = await applySplitPlan({
        path,
        plan,
        units,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
      });
      await refreshRepo(path);
      if (result.cancelled) {
        toast.warning(t("commitSplit.cancelledToast", { count: result.committed }), {
          description: t("commitSplit.cancelledHint"),
        });
      } else {
        toast.success(t("commitSplit.doneToast", { count: result.committed }));
      }
      onApplied?.({ committed: result.committed, cancelled: result.cancelled });
      onOpenChange(false);
    } catch (cause) {
      await resetSplitStaging(path);
      await refreshRepo(path);
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setPhase("failed");
      toastError(message);
    }
  }, [onApplied, onOpenChange, path, plan, t, units]);

  const groups = plan?.groups ?? [];
  const busy = phase === "loading" || phase === "planning" || phase === "applying";
  const canApply = phase === "ready" && issues.length === 0 && runnableGroups(plan ?? { groups: [] }).length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && phase === "applying") return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[86vh] w-[min(760px,95vw)] max-w-[min(760px,95vw)] flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t("commitSplit.title")}</DialogTitle>
          <DialogDescription>
            {t("commitSplit.description", {
              units: totals.units,
              files: totals.files,
            })}
          </DialogDescription>
        </DialogHeader>

        {unstagedNotice ? (
          <p className="rounded-md bg-git-modified/10 px-2 py-1.5 text-[11px] text-git-modified">
            {t("commitSplit.unstagedNotice")}
          </p>
        ) : null}

        {phase === "loading" || phase === "planning" ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {phase === "loading" ? t("commitSplit.loading") : t("commitSplit.planning")}
          </div>
        ) : null}

        {phase === "empty" ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {t("commitSplit.noChanges")}
          </p>
        ) : null}

        {phase === "failed" ? (
          <div className="space-y-2 py-6">
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void requestPlan(units)}
              disabled={units.length === 0}
            >
              <Sparkles />
              {t("commitSplit.retry")}
            </Button>
          </div>
        ) : null}

        {phase === "applying" ? (
          <div className="space-y-2 py-8 text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {progress
                ? t(`commitSplit.progress.${progress.phase}`, {
                    index: progress.groupIndex + 1,
                    total: progress.groupCount,
                  })
                : t("commitSplit.applying")}
            </div>
            {progress ? (
              <p className="truncate text-[11px] font-medium">{progress.message.split("\n")[0]}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">{t("commitSplit.cancelHint")}</p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              {t("commitSplit.cancelRun")}
            </Button>
          </div>
        ) : null}

        {phase === "ready" ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {warnings.length > 0 ? (
              <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                {t("commitSplit.warnings", { list: warnings.join(", ") })}
              </p>
            ) : null}
            {groups.map((group, index) => (
              <SplitGroupCard
                key={group.id}
                index={index}
                groupId={group.id}
                message={group.message}
                rationale={group.rationale}
                unitIds={group.unitIds}
                unitById={unitById}
                groups={groups.map((other) => ({ id: other.id, message: other.message }))}
                selection={selection}
                onToggleUnit={toggleUnit}
                onMove={moveSelection}
                onMessageChange={(value) =>
                  setPlan((current) =>
                    current ? renameSplitGroup(current, group.id, value) : current,
                  )
                }
                onDelete={() =>
                  setPlan((current) =>
                    current
                      ? removeSplitGroup(current, group.id, t("commitSplit.collectMessage"))
                      : current,
                  )
                }
                canDelete={groups.length > 1}
              />
            ))}
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                setPlan((current) =>
                  current ? addSplitGroup(current, t("commitSplit.newGroupMessage")) : current,
                )
              }
            >
              <Plus />
              {t("commitSplit.addGroup")}
            </Button>
          </div>
        ) : null}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {issues.includes("coverage") || issues.includes("duplicate")
              ? t("commitSplit.issueCoverage")
              : issues.includes("message")
                ? t("commitSplit.issueMessage")
                : phase === "ready"
                  ? t("commitSplit.summary", {
                      count: runnableGroups(plan ?? { groups: [] }).length,
                      additions: totals.additions,
                      deletions: totals.deletions,
                    })
                  : ""}
          </span>
          <span className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={phase === "applying"}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void apply()}
              disabled={!canApply || busy}
            >
              <GitCommitHorizontal />
              {t("commitSplit.apply")}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitGroupCard({
  index,
  groupId,
  message,
  rationale,
  unitIds,
  unitById,
  groups,
  selection,
  onToggleUnit,
  onMove,
  onMessageChange,
  onDelete,
  canDelete,
}: {
  index: number;
  groupId: string;
  message: string;
  rationale: string;
  unitIds: readonly string[];
  unitById: Map<string, SplitUnit>;
  groups: { id: string; message: string }[];
  selection: ReadonlySet<string>;
  onToggleUnit: (unitId: string) => void;
  onMove: (unitIds: readonly string[], targetGroupId: string) => void;
  onMessageChange: (value: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const [dropActive, setDropActive] = useState(false);
  const selectedHere = unitIds.filter((id) => selection.has(id));
  const targets = groups.filter((group) => group.id !== groupId);

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const dragged = event.dataTransfer.getData("text/x-l8git-split-unit");
        if (!dragged) return;
        const ids = selection.has(dragged) ? [...selection] : [dragged];
        onMove(ids, groupId);
      }}
      className={cn(
        "space-y-2 rounded-lg border border-border/60 bg-card/40 p-2.5",
        dropActive && "border-primary/60 bg-primary/5",
      )}
    >
      <header className="flex items-start gap-2">
        <Badge variant="secondary" className="mt-1 shrink-0 font-mono">
          {index + 1}
        </Badge>
        <Textarea
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          rows={2}
          placeholder={t("commitSplit.messagePlaceholder")}
          className="min-h-14 flex-1 text-xs"
        />
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mt-1 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title={t("commitSplit.deleteGroup")}
          >
            <Trash2 />
          </Button>
        ) : null}
      </header>

      {rationale ? (
        <p className="pl-1 text-[11px] text-muted-foreground">{rationale}</p>
      ) : null}

      {unitIds.length === 0 ? (
        <p className="pl-1 text-[11px] text-muted-foreground">{t("commitSplit.emptyGroup")}</p>
      ) : (
        <ul className="space-y-1">
          {unitIds.map((unitId) => {
            const unit = unitById.get(unitId);
            if (!unit) return null;
            return (
              <li
                key={unitId}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/x-l8git-split-unit", unitId);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className={cn(
                  "flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 text-[11px] hover:bg-muted/60",
                  selection.has(unitId) && "bg-primary/10",
                )}
              >
                <Checkbox
                  checked={selection.has(unitId)}
                  onCheckedChange={() => onToggleUnit(unitId)}
                  className="size-3.5"
                />
                <span className="min-w-0 flex-1 truncate font-mono" title={unit.preview}>
                  {unitLabel(unit)}
                </span>
                {unit.kind === "file" ? (
                  <Badge variant="outline" className="h-4 px-1 text-[9.5px]">
                    {unit.untracked ? t("commitSplit.newFile") : t("commitSplit.wholeFile")}
                  </Badge>
                ) : null}
                <span className="shrink-0 tabular-nums text-git-added">+{unit.additions}</span>
                <span className="shrink-0 tabular-nums text-git-removed">-{unit.deletions}</span>
              </li>
            );
          })}
        </ul>
      )}

      {targets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={selectedHere.length === 0}
              className="text-muted-foreground"
            >
              {t("commitSplit.moveSelected", { count: selectedHere.length })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {targets.map((target, targetIndex) => (
              <DropdownMenuItem
                key={target.id}
                onClick={() => onMove(selectedHere, target.id)}
              >
                <span className="truncate">
                  {groups.findIndex((g) => g.id === target.id) + 1} ·{" "}
                  {target.message.split("\n")[0] || t("commitSplit.unnamedGroup", { index: targetIndex + 1 })}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </section>
  );
}
