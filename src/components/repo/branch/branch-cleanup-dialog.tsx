import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  defaultCleanupSelection,
  deletableRemoteRef,
  groupCleanupCandidates,
  type BranchCleanupCandidate,
} from "@/lib/branch-cleanup";
import { useBranchCleanupPrefs } from "@/lib/branch-cleanup-prefs";
import { useBranchCleanupStore, type ArchivedRef } from "@/lib/branch-cleanup-store";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function CandidateRow({
  candidate,
  checked,
  remoteChecked,
  disabled,
  onToggle,
  onToggleRemote,
}: {
  candidate: BranchCleanupCandidate;
  checked: boolean;
  remoteChecked: boolean;
  disabled: boolean;
  onToggle: (name: string, next: boolean) => void;
  onToggleRemote: (name: string, next: boolean) => void;
}) {
  const { t } = useTranslation();
  const remoteRef = deletableRemoteRef(candidate);
  const rowId = `cleanup-${candidate.name}`;

  return (
    <li className="rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent/30">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={rowId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => onToggle(candidate.name, v === true)}
        />
        <label
          htmlFor={rowId}
          className="min-w-0 flex-1 cursor-pointer truncate font-mono text-[12px] text-foreground"
          title={candidate.name}
        >
          {candidate.name}
        </label>
        {candidate.reason === "stale" ? (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {candidate.lastCommitAt
              ? formatRelative(candidate.lastCommitAt)
              : t("branchCleanup.noDate")}
          </span>
        ) : (
          <Badge variant={candidate.reason === "merged" ? "success" : "info"} className="shrink-0">
            {candidate.reason === "merged"
              ? t("branchCleanup.reasonMerged")
              : t("branchCleanup.reasonSquashMerged")}
          </Badge>
        )}
      </div>
      {remoteRef ? (
        <div className="mt-1 flex min-w-0 items-center gap-2 pl-6">
          <Checkbox
            id={`${rowId}-remote`}
            checked={remoteChecked}
            disabled={disabled || !checked}
            onCheckedChange={(v) => onToggleRemote(candidate.name, v === true)}
          />
          <label
            htmlFor={`${rowId}-remote`}
            className={cn(
              "min-w-0 flex-1 cursor-pointer truncate text-[11px] text-muted-foreground",
              !checked && "opacity-60",
            )}
          >
            {t("branchCleanup.deleteRemote", { ref: remoteRef })}
          </label>
        </div>
      ) : null}
    </li>
  );
}

export function BranchCleanupDialog({
  open,
  onClose,
  path,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
}) {
  const { t } = useTranslation();
  const staleDays = useBranchCleanupPrefs((s) => s.staleDays);
  const load = useBranchCleanupStore((s) => s.load);
  const archive = useBranchCleanupStore((s) => s.archive);
  const restore = useBranchCleanupStore((s) => s.restore);
  const candidates = useBranchCleanupStore((s) => s.candidates[path]);
  const loading = useBranchCleanupStore((s) => s.loading[path] ?? false);
  const error = useBranchCleanupStore((s) => s.error[path] ?? null);

  const [selected, setSelected] = useState<string[]>([]);
  const [remoteSelected, setRemoteSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !path) return;
    void load(path, staleDays);
  }, [open, path, staleDays, load]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    setSelected(defaultCleanupSelection(candidates ?? []));
    setRemoteSelected([]);
  }, [open, candidates]);

  const groups = useMemo(() => groupCleanupCandidates(candidates ?? []), [candidates]);
  const total = groups.merged.length + groups.stale.length;

  const toggle = useCallback((name: string, next: boolean) => {
    setSelected((prev) => (next ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)));
    if (!next) setRemoteSelected((prev) => prev.filter((n) => n !== name));
  }, []);

  const toggleRemote = useCallback((name: string, next: boolean) => {
    setRemoteSelected((prev) =>
      next ? [...new Set([...prev, name])] : prev.filter((n) => n !== name),
    );
  }, []);

  const setGroup = useCallback((group: readonly BranchCleanupCandidate[], next: boolean) => {
    const names = group.map((c) => c.name);
    setSelected((prev) =>
      next
        ? [...new Set([...prev, ...names])]
        : prev.filter((n) => !names.includes(n)),
    );
    if (!next) setRemoteSelected((prev) => prev.filter((n) => !names.includes(n)));
  }, []);

  function dismiss() {
    if (busy) return;
    onClose();
  }

  const undoArchive = useCallback(
    (refs: ArchivedRef[]) => {
      void (async () => {
        const result = await restore(path, refs);
        if (result.restored.length > 0) {
          toast.success(
            t("branchCleanup.toastRestored", { count: result.restored.length }),
          );
        }
        for (const failure of result.failures) {
          toastError(
            t("branchCleanup.restoreFailed", {
              name: failure.name,
              error: failure.error,
            }),
          );
        }
      })();
    },
    [path, restore, t],
  );

  async function runArchive() {
    const byName = new Map((candidates ?? []).map((c) => [c.name, c]));
    const requests = selected
      .map((name) => byName.get(name))
      .filter((c): c is BranchCleanupCandidate => !!c)
      .map((c) => ({
        name: c.name,
        tip: c.tip,
        remoteRef: remoteSelected.includes(c.name) ? deletableRemoteRef(c) : null,
      }));
    if (requests.length === 0) return;

    setBusy(true);
    try {
      const result = await archive(path, requests);
      for (const failure of result.failures) {
        toastError(
          t("branchCleanup.archiveFailed", {
            name: failure.name,
            error: failure.error,
          }),
        );
      }
      for (const failure of result.remoteFailures) {
        toastError(
          t("branchCleanup.remoteDeleteFailed", {
            name: failure.name,
            error: failure.error,
          }),
        );
      }
      const restorable = result.archived.filter((a) => a.hash.trim().length > 0);
      if (result.archived.length > 0) {
        toast.success(t("branchCleanup.toastArchived", { count: result.archived.length }), {
          action:
            restorable.length > 0
              ? {
                  label: t("branchCleanup.undoAction"),
                  onClick: () => undoArchive(restorable),
                }
              : undefined,
        });
        onClose();
      }
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const sections = [
    {
      id: "merged" as const,
      title: t("branchCleanup.groupMerged"),
      hint: t("branchCleanup.groupMergedHint"),
      items: groups.merged,
    },
    {
      id: "stale" as const,
      title: t("branchCleanup.groupStale"),
      hint: t("branchCleanup.groupStaleHint", { days: staleDays }),
      items: groups.stale,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("branchCleanup.title")}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-heading text-base font-medium">{t("branchCleanup.title")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("branchCleanup.desc")}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("branchCleanup.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {loading && total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("branchCleanup.loading")}
          </p>
        ) : error ? (
          <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 px-3 py-4 text-center">
            <p className="text-sm text-destructive">
              {t("branchCleanup.loadError", { error })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void load(path, staleDays)}
            >
              {t("common.refresh")}
            </Button>
          </div>
        ) : total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("branchCleanup.empty")}
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 pr-2">
              {sections.map((section) =>
                section.items.length === 0 ? null : (
                  <section key={section.id}>
                    <header className="mb-1 flex items-center gap-2 px-2">
                      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {section.title}
                      </h3>
                      <span className="flex h-[18px] min-w-[20px] items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {section.items.length}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy}
                          onClick={() => setGroup(section.items, true)}
                        >
                          {t("branchCleanup.selectAll")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy}
                          onClick={() => setGroup(section.items, false)}
                        >
                          {t("branchCleanup.selectNone")}
                        </Button>
                      </span>
                    </header>
                    <p className="mb-1 px-2 text-[11px] text-muted-foreground/70">{section.hint}</p>
                    <ul className="space-y-px">
                      {section.items.map((c) => (
                        <CandidateRow
                          key={c.name}
                          candidate={c}
                          checked={selected.includes(c.name)}
                          remoteChecked={remoteSelected.includes(c.name)}
                          disabled={busy}
                          onToggle={toggle}
                          onToggleRemote={toggleRemote}
                        />
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </div>
          </ScrollArea>
        )}

        <footer className="mt-3 flex shrink-0 justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || selected.length === 0}
            onClick={() => void runArchive()}
          >
            {busy
              ? t("branchCleanup.archiveBusy")
              : t("branchCleanup.archiveAction", { count: selected.length })}
          </Button>
        </footer>
      </div>
    </div>
  );
}
